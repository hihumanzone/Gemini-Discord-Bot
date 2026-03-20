/**
 * Streaming response service.
 * Handles streaming Gemini API responses, managing the stop-generation button,
 * debounced message updates, large-response overflow, and code-execution file delivery.
 */

import fs from 'fs/promises';
import path from 'path';

import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logServiceError } from '../utils/errorHandler.js';

import { TEMP_DIR } from '../core/paths.js';
import {
  chatHistoryLock,
  getUserResponseActionButtons,
  saveStateToFile,
  shouldShowActionButtons,
  state,
  updateChatHistory,
} from '../state/botState.js';
import {
  EMBED_COLOR,
  EMBED_RESPONSE_LIMIT,
  MAX_GENERATION_ATTEMPTS,
  MESSAGE_TYPING_TIMEOUT_MS,
  PLAIN_RESPONSE_LIMIT,
  SEND_RETRY_ERRORS_TO_DISCORD,
  STREAM_UPDATE_DEBOUNCE_MS,
} from '../constants.js';
import { getResponsePreference, resolveHistoryId } from './conversationContext.js';
import {
  addDeleteButton,
  addDownloadButton,
  addSettingsButton,
  clearMessageActionRows,
  removeStopGeneratingButton,
} from '../ui/messageActions.js';
import { applyEmbedFallback, createEmbed, createStatusEmbed } from '../utils/discord.js';
import { buildRetryErrorEmbed, formatGeminiErrorForConsole } from '../utils/errorFormatter.js';
import { toDeleteHistoryRef } from '../utils/historyRef.js';

// --- Mime type to file extension mapping ---

const MIME_TO_EXTENSION = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/html': '.html',
  'application/json': '.json',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
};

const SANDBOX_LINK_RE = /\[([^\]]+)\]\(sandbox:\/([^)]+)\)/g;

function getFileExtension(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || `.${mimeType.split('/').pop()}`;
}

function extractSandboxFilenames(text, extraExtensions = []) {
  if (!text) return [];
  const sandboxLinks = [...text.matchAll(SANDBOX_LINK_RE)].map((m) => m[2]);

  const commonExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'wav', 'mp3', 'ogg', 'csv', 'txt', 'json', 'pdf', 'html', 'md', 'xml', 'js', 'py', 'sh', 'cpp', 'rs', 'java', 'c', 'cs'];
  const allExtensions = [...new Set([...commonExtensions, ...extraExtensions])];
  const extGroup = allExtensions.join('|');
  const fallbackRe = new RegExp(`[a-zA-Z0-9_\\-\\.]+\\.(?:${extGroup})\\b`, 'gi');
  
  const standardMatches = [...text.matchAll(fallbackRe)].map((m) => m[0]);

  // Aggressively capture files with arbitrary extensions if explicitly quoted or backticked
  const quotedRe = /['"`]([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]{1,10})['"`]/g;
  const quotedMatches = [...text.matchAll(quotedRe)].map((m) => m[1]);

  return [...new Set([...sandboxLinks, ...quotedMatches, ...standardMatches])];
}

function cleanSandboxLinks(text, actualFileNames = []) {
  return text.replace(SANDBOX_LINK_RE, (match, display, filename) => {
    if (actualFileNames.includes(filename)) {
      return display === filename ? `📎 **${filename}**` : `📎 **${display} (${filename})**`;
    }
    return `~~${display}~~ *(File not generated)*`;
  });
}

function logStreamingOperationError(operation, error, metadata = {}) {
  logServiceError('StreamingService', error, {
    operation,
    ...metadata,
  });
}

function clonePart(part) {
  if (typeof structuredClone === 'function') {
    return structuredClone(part);
  }

  return JSON.parse(JSON.stringify(part));
}

// --- Embed & response builders ---

function truncateString(str, length = 1024) {
  if (!str) return '';
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}

function shouldShowGroundingMetadata(message) {
  return getResponsePreference(message) === 'Embedded';
}

function addGroundingMetadata(embed, groundingMetadata) {
  if (groundingMetadata.webSearchQueries?.length) {
    let value = groundingMetadata.webSearchQueries.map((query) => `• ${query}`).join('\n');
    embed.addFields({
      name: '🔍 Search Queries',
      value: truncateString(value) || 'No search queries',
      inline: false,
    });
  }

  if (groundingMetadata.groundingChunks?.length) {
    let chunks = groundingMetadata.groundingChunks
      .slice(0, 5)
      .map((chunk, index) => {
        if (chunk.web) {
          return `• [${chunk.web.title || 'Source'}](${chunk.web.uri})`;
        }
        return `• Source ${index + 1}`;
      })
      .join('\n');

    embed.addFields({
      name: '📚 Sources',
      value: truncateString(chunks) || 'No sources provided',
      inline: false,
    });
  }
}

function addUrlContextMetadata(embed, urlContextMetadata) {
  if (!urlContextMetadata.url_metadata?.length) {
    return;
  }

  let value = urlContextMetadata.url_metadata
    .map((urlData) => {
      const emoji = urlData.url_retrieval_status === 'URL_RETRIEVAL_STATUS_SUCCESS' ? '✔️' : '❌';
      return `${emoji} ${urlData.retrieved_url}`;
    })
    .join('\n');

  embed.addFields({
    name: '🔗 URL Context',
    value: truncateString(value) || 'No URL context',
    inline: false,
  });
}

function buildResponseEmbed(botMessage, responseText, originalMessage, groundingMetadata = null, urlContextMetadata = null) {
  const embed = createEmbed({
    color: EMBED_COLOR,
    description: responseText,
    author: {
      name: `To ${originalMessage.author.displayName}`,
      iconURL: originalMessage.author.displayAvatarURL(),
    },
    timestamp: true,
  });

  if (groundingMetadata && shouldShowGroundingMetadata(originalMessage)) {
    addGroundingMetadata(embed, groundingMetadata);
  }

  if (urlContextMetadata && shouldShowGroundingMetadata(originalMessage)) {
    addUrlContextMetadata(embed, urlContextMetadata);
  }

  if (originalMessage.guild) {
    embed.setFooter({
      text: originalMessage.guild.name,
      iconURL: originalMessage.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png',
    });
  }

  return botMessage.edit(applyEmbedFallback(originalMessage.channel, {
    content: null,
    embeds: [embed],
  }));
}

// --- Text file fallback ---

async function sendAsTextFile(text, originalMessage, historyId) {
  const filename = `response-${Date.now()}.md`;
  const filePath = path.join(TEMP_DIR, filename);

  try {
    await fs.writeFile(filePath, text, 'utf8');

    const fileEmbed = createStatusEmbed({
      variant: 'info',
      title: 'Full Response Attached',
      description: 'The response was longer than Discord message limits, so it has been attached as a file.',
    });

    let response = await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      content: `<@${originalMessage.author.id}>`,
      embeds: [fileEmbed],
      files: [filePath],
      allowedMentions: { users: [originalMessage.author.id], repliedUser: false },
    }));

    if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id)) {
      response = await addSettingsButton(response);
      response = await addDeleteButton(response, response.id, historyId);
    }
    return response;
  } catch (error) {
    logStreamingOperationError('sendAsTextFile', error, {
      messageId: originalMessage.id,
      historyId,
    });
    return null;
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logStreamingOperationError('sendAsTextFileCleanup', error, { filePath });
      }
    }
  }
}

// --- Stop-generation button & collector ---

function createStopButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stopGenerating').setLabel('Stop Generating').setStyle(ButtonStyle.Danger),
  );
}

async function ensureInitialBotMessage(initialBotMessage, originalMessage) {
  try {
    if (initialBotMessage) {
      try {
        await initialBotMessage.edit({ components: [createStopButtonRow()] });
      } catch (error) {
        logStreamingOperationError('refreshStopButton', error, {
          messageId: initialBotMessage.id,
        });
      }
      return initialBotMessage;
    }

    return await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      embeds: [createStatusEmbed({
        variant: 'info',
        title: 'Generating Response',
        description: 'Working on your request now. You can stop generation at any time.',
      })],
      components: [createStopButtonRow()],
    }));
  } catch (error) {
    logServiceError('StreamingService', error, { operation: 'ensureInitialBotMessage' });
    throw error;
  }
}

function createCollector(message, originalMessage) {
  let stopped = false;

  const collector = message.createMessageComponentCollector({
    filter: (interaction) => interaction.customId === 'stopGenerating',
    time: MESSAGE_TYPING_TIMEOUT_MS,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id === originalMessage.author.id) {
      stopped = true;
      await interaction.reply(applyEmbedFallback(interaction.channel, {
        embeds: [createStatusEmbed({
          variant: 'warning',
          title: 'Response Stopped',
          description: 'Response generation stopped by the user.',
        })],
        flags: MessageFlags.Ephemeral,
      })).catch((error) => {
        logStreamingOperationError('collectorStopReply', error, {
          interactionId: interaction.id,
        });
      });
      return;
    }

    await interaction.reply(applyEmbedFallback(interaction.channel, {
      embeds: [createStatusEmbed({
        variant: 'error',
        title: 'Access Denied',
        description: "It's not for you.",
      })],
      flags: MessageFlags.Ephemeral,
    })).catch((error) => {
      logStreamingOperationError('collectorAccessDeniedReply', error, {
        interactionId: interaction.id,
      });
    });
  });

  return {
    collector,
    wasStopped: () => stopped,
  };
}

// --- Conversation persistence ---

async function persistConversation(historyId, messageId, parts, assistantParts) {
  await chatHistoryLock.runExclusive(async () => {
    updateChatHistory(historyId, [
      { role: 'user', content: parts },
      { role: 'assistant', content: assistantParts },
    ], messageId);
    await saveStateToFile();
  });
}

// --- Post-stream response finalization ---

async function handleLargeOrFinalResponse(
  botMessage,
  originalMessage,
  responseText,
  isLargeResponse,
  historyId,
  extraMessageIds = [],
) {
  const showButtons = shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id);

  let updatedMessage = await clearMessageActionRows(botMessage);

  if (showButtons) {
    updatedMessage = await addSettingsButton(updatedMessage);
  }

  if (isLargeResponse) {
    const textFileMessage = await sendAsTextFile(responseText, originalMessage, historyId);

    if (showButtons) {
      const targets = [updatedMessage.id, ...extraMessageIds];
      if (textFileMessage) targets.push(textFileMessage.id);

      updatedMessage = await addDeleteButton(updatedMessage, targets.join(','), historyId);
    }
    return updatedMessage;
  }

  if (!showButtons) {
    return updatedMessage;
  }

  const targets = [updatedMessage.id, ...extraMessageIds];

  updatedMessage = await addDownloadButton(updatedMessage);
  updatedMessage = await addDeleteButton(updatedMessage, targets.join(','), historyId);
  return updatedMessage;
}

// --- Code-execution file delivery ---

async function sendCodeExecutionFiles(inlineDataFiles, originalMessage, historyId) {
  if (inlineDataFiles.length === 0) return null;

  const tempPaths = [];

  try {
    const attachments = [];
    for (let i = 0; i < inlineDataFiles.length; i++) {
      const { mimeType, data, name } = inlineDataFiles[i];
      const filename = name || `generated_${i + 1}${getFileExtension(mimeType)}`;
      const tempPath = path.join(TEMP_DIR, `${Date.now()}_${i}_${filename}`);
      await fs.writeFile(tempPath, Buffer.from(data, 'base64'));
      tempPaths.push(tempPath);
      attachments.push(new AttachmentBuilder(tempPath, { name: filename }));
    }

    const filesEmbed = createStatusEmbed({
      variant: 'primary',
      title: 'Generated Files',
      description: inlineDataFiles
        .map(({ name: fname, mimeType }, idx) => `**${idx + 1}.** ${fname || `generated_${idx + 1}${getFileExtension(mimeType)}`}`)
        .join('\n'),
    });

    const filesMessage = await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      content: `<@${originalMessage.author.id}>`,
      embeds: [filesEmbed],
      files: attachments,
      allowedMentions: { users: [originalMessage.author.id] },
    }));

    if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id)) {
      let updated = await addSettingsButton(filesMessage);
      updated = await addDeleteButton(updated, updated.id, historyId);
      return updated;
    }
    return filesMessage;
  } catch (error) {
    logServiceError('StreamingService', error, { operation: 'sendCodeExecutionFiles' });
    return null;
  } finally {
    for (const tempPath of tempPaths) {
      try {
        await fs.unlink(tempPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logStreamingOperationError('sendCodeExecutionFilesCleanup', error, { tempPath });
        }
      }
    }
  }
}

// --- Main streaming entry point ---

/**
 * Streams a model response to Discord, handling retries, stop-generation,
 * large-response overflow, and post-response actions.
 *
 * @param {Object} options
 * @param {import('discord.js').Message|null} options.initialBotMessage - Existing bot message to reuse, or null.
 * @param {Object} options.chat - The Gemini chat session.
 * @param {Array} options.parts - The prompt parts to send.
 * @param {import('discord.js').Message} options.originalMessage - The user's original message.
 * @param {string[]} [options.extraMessageIds] - Optional related message IDs to bind to parent delete controls.
 */
export async function streamModelResponse({
  initialBotMessage,
  chat,
  parts,
  originalMessage,
  extraMessageIds = [],
}) {
  const historyId = resolveHistoryId(originalMessage);
  const deleteHistoryRef = toDeleteHistoryRef(historyId, originalMessage.author.id);
  const responsePreference = getResponsePreference(originalMessage);
  const maxCharacterLimit = responsePreference === 'Embedded' ? EMBED_RESPONSE_LIMIT : PLAIN_RESPONSE_LIMIT;
  let botMessage = await ensureInitialBotMessage(initialBotMessage, originalMessage);
  const { collector, wasStopped } = createCollector(botMessage, originalMessage);
  let finalized = false;
  let groundingMetadata = null;
  let urlContextMetadata = null;
  let bufferedText = '';
  let updateTimeout = null;
  let isLargeResponse = false;

  const flushBufferedText = () => {
    if (wasStopped() || finalized || isLargeResponse) {
      return;
    }

    if (!bufferedText.trim()) {
      botMessage.edit(applyEmbedFallback(originalMessage.channel, {
        embeds: [createStatusEmbed({
          variant: 'muted',
          title: 'Generating Response',
          description: 'Still working on this response...',
        })],
      })).catch((error) => {
        logStreamingOperationError('flushBufferedTextPlaceholder', error, { messageId: botMessage.id });
      });
    } else if (responsePreference === 'Embedded') {
      buildResponseEmbed(botMessage, bufferedText, originalMessage, groundingMetadata, urlContextMetadata).catch((error) => {
        logStreamingOperationError('flushBufferedTextEmbed', error, { messageId: botMessage.id });
      });
    } else {
      botMessage.edit({ content: bufferedText, embeds: [] }).catch((error) => {
        logStreamingOperationError('flushBufferedTextPlain', error, { messageId: botMessage.id });
      });
    }

    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  try {
    let attempts = MAX_GENERATION_ATTEMPTS;

    while (attempts > 0 && !wasStopped()) {
      try {
        const stream = await chat.sendMessageStream({ message: parts });
        let finalResponse = '';
        isLargeResponse = false; // reset for each attempt
        const inlineDataFiles = [];
        const rawAssistantParts = [];

        for await (const chunk of stream) {
          if (wasStopped()) {
            break;
          }

          let chunkText = '';

          const rawParts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of rawParts) {
            // Keep the model's original part structure for future turns.
            if (part.text !== undefined) {
              const lastPart = rawAssistantParts[rawAssistantParts.length - 1];
              if (lastPart && lastPart.text !== undefined) {
                lastPart.text += part.text;
                // Copy any other properties like thoughtSignature that might be in this chunk
                for (const key of Object.keys(part)) {
                  if (key !== 'text' && lastPart[key] === undefined) {
                    lastPart[key] = typeof part[key] === 'object' && part[key] !== null 
                      ? clonePart({ [key]: part[key] })[key] 
                      : part[key];
                  }
                }
              } else {
                rawAssistantParts.push(clonePart(part));
              }
            } else {
              rawAssistantParts.push(clonePart(part));
            }

            if (part.thought) continue;

            if (part.text) {
              chunkText += part.text;
            }
            if (part.executableCode) {
              const lang = (part.executableCode.language || '').toLowerCase().replace('language_unspecified', '');
              chunkText += `\n\`\`\`${lang}\n${part.executableCode.code}\n\`\`\`\n`;
            }
            if (part.codeExecutionResult) {
              const { outcome, output } = part.codeExecutionResult;
              if (outcome && outcome !== 'OUTCOME_OK') {
                chunkText += `\n⚠️ Code execution ${outcome === 'OUTCOME_DEADLINE_EXCEEDED' ? 'timed out' : 'failed'}.\n`;
              }
              if (output) {
                chunkText += `\n**Output:**\n\`\`\`\n${output}\`\`\`\n`;
              }
            }
            if (part.inlineData?.data && part.inlineData?.mimeType) {
              inlineDataFiles.push({
                mimeType: part.inlineData.mimeType,
                data: part.inlineData.data,
              });
            }
          }

          if (chunkText) {
            finalResponse += chunkText;
            bufferedText += chunkText;
          }

          if (chunk.candidates?.[0]?.groundingMetadata) {
            groundingMetadata = chunk.candidates[0].groundingMetadata;
          }

          if (chunk.candidates?.[0]?.url_context_metadata) {
            urlContextMetadata = chunk.candidates[0].url_context_metadata;
          }

          if (finalResponse.length > maxCharacterLimit) {
            if (!isLargeResponse) {
              isLargeResponse = true;
              if (updateTimeout) {
                clearTimeout(updateTimeout);
                updateTimeout = null;
              }
              await botMessage.edit(applyEmbedFallback(originalMessage.channel, {
                embeds: [createStatusEmbed({
                  variant: 'warning',
                  title: 'Response Overflow',
                  description: 'This response is too long for a Discord message and will be delivered as an attached file.',
                })],
              }));
            }
          } else if (!updateTimeout) {
            updateTimeout = setTimeout(flushBufferedText, STREAM_UPDATE_DEBOUNCE_MS);
          }
        }

        // Determine dynamically what extensions the generated files inherently have
        const activeExtensions = inlineDataFiles
          .map(f => getFileExtension(f.mimeType).replace(/^\./, '').split('+')[0])
          .filter(ext => ext && /^[a-z0-9]+$/i.test(ext));

        // Assign sandbox filenames to inline data files before cleaning links
        const sandboxFilenames = extractSandboxFilenames(finalResponse, activeExtensions);

        const actualNames = [];
        const availableCandidates = [...sandboxFilenames];

        for (let i = 0; i < inlineDataFiles.length; i++) {
          const file = inlineDataFiles[i];
          const defaultExt = getFileExtension(file.mimeType).toLowerCase();
          
          let matchIdx = availableCandidates.findIndex(c => c.toLowerCase().endsWith(defaultExt));
          
          // Fallback to generically accepting popular text extensions if MIME is text/plain
          if (matchIdx === -1 && file.mimeType.startsWith('text/')) {
            matchIdx = availableCandidates.findIndex(c => c.match(/\.(txt|csv|json|md|py|js|html|xml|sh|cpp|rs|java|c|cs)$/i));
          }
          
          if (matchIdx === -1 && availableCandidates.length > 0) {
            matchIdx = 0;
          }
          
          if (matchIdx !== -1) {
            file.name = availableCandidates[matchIdx];
            actualNames.push(file.name);
            availableCandidates.splice(matchIdx, 1);
          } else {
            file.name = null;
          }
        }

        finalResponse = cleanSandboxLinks(finalResponse, actualNames);
        const fallbackFinalResponse = inlineDataFiles.length > 0
          ? 'No text response was returned, but generated files are attached below.'
          : 'No response text was returned this time. Please try again.';
        const normalizedFinalResponse = finalResponse.trim()
          ? finalResponse
          : fallbackFinalResponse;

        if (updateTimeout) {
          clearTimeout(updateTimeout);
          updateTimeout = null;
        }

        if (!isLargeResponse) {
          if (responsePreference === 'Embedded') {
            await buildResponseEmbed(botMessage, normalizedFinalResponse, originalMessage, groundingMetadata, urlContextMetadata);
          } else {
            await botMessage.edit({ content: normalizedFinalResponse, embeds: [] }).catch((error) => {
              logStreamingOperationError('finalPlainEdit', error, { messageId: botMessage.id });
            });
          }
        }

        let filesMessage = null;
        if (inlineDataFiles.length > 0) {
          filesMessage = await sendCodeExecutionFiles(inlineDataFiles, originalMessage, deleteHistoryRef);
        }

        const linkedMessageIds = [
          filesMessage?.id,
          ...extraMessageIds,
        ].filter(Boolean);

        botMessage = await handleLargeOrFinalResponse(
          botMessage,
          originalMessage,
          normalizedFinalResponse,
          isLargeResponse,
          deleteHistoryRef,
          linkedMessageIds,
        );
        const assistantPartsForHistory = rawAssistantParts.length > 0
          ? rawAssistantParts
          : [{ text: normalizedFinalResponse }];

        await persistConversation(historyId, botMessage.id, parts, assistantPartsForHistory);
        finalized = true;
        collector.stop();
        return;
      } catch (error) {
        attempts -= 1;
        console.error(formatGeminiErrorForConsole(error, {
          attemptNumber: MAX_GENERATION_ATTEMPTS - attempts,
          totalAttempts: MAX_GENERATION_ATTEMPTS,
          remainingAttempts: attempts,
          userId: originalMessage.author.id,
          channelId: originalMessage.channel?.id,
          historyId,
        }), error);

        if (attempts <= 0 || wasStopped()) {
          if (!wasStopped()) {
            const embed = SEND_RETRY_ERRORS_TO_DISCORD
              ? buildRetryErrorEmbed(error, { isFinal: true })
              : createStatusEmbed({
                  variant: 'error',
                  title: 'Bot Overloaded',
                  description: 'The bot is currently overloaded or unavailable. Please try again shortly.',
                });

            const errorMessage = await originalMessage.channel.send(applyEmbedFallback(originalMessage.channel, {
              content: `<@${originalMessage.author.id}>`,
              embeds: [embed],
            }));

            const linkedMessageIds = [
              botMessage.id,
              ...extraMessageIds,
            ].filter(Boolean);

            if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id)) {
              let updatedErrorMessage = await addSettingsButton(errorMessage);
              updatedErrorMessage = await addDeleteButton(
                updatedErrorMessage,
                [updatedErrorMessage.id, ...linkedMessageIds].join(','),
                deleteHistoryRef,
              );

              botMessage = await clearMessageActionRows(botMessage);
              botMessage = await addSettingsButton(botMessage);
              botMessage = await addDeleteButton(botMessage, [botMessage.id, updatedErrorMessage.id, ...extraMessageIds].join(','), deleteHistoryRef);
            } else {
              botMessage = await clearMessageActionRows(botMessage);
            }
            finalized = true;
          }

          collector.stop();
          return;
        }

        if (SEND_RETRY_ERRORS_TO_DISCORD) {
          const retryMessage = await originalMessage.channel.send(applyEmbedFallback(originalMessage.channel, {
            content: `<@${originalMessage.author.id}>`,
            embeds: [buildRetryErrorEmbed(error, { isFinal: false })],
          }));

          setTimeout(() => {
            retryMessage.delete().catch((error) => {
              logStreamingOperationError('deleteRetryMessage', error, {
                messageId: retryMessage.id,
              });
            });
          }, 5_000);
        }
      }
    }
  } finally {
    clearTimeout(updateTimeout);
    if (finalized) {
      await removeStopGeneratingButton(botMessage);
    } else if (wasStopped()) {
      await clearMessageActionRows(botMessage);
    }

  }
}
