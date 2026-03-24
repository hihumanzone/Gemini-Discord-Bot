/**
 * Streaming response service.
 * Handles streaming Gemini API responses, managing the stop-generation button,
 * debounced message updates, large-response overflow, and post-stream finalization.
 */

import fs from 'fs/promises';
import path from 'path';

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logServiceError } from '../utils/errorHandler.js';

import { TEMP_DIR } from '../core/paths.js';
import {
  chatHistoryLock,
  saveStateToFile,
  shouldShowActionButtons,
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
  assignFileNames,
  cleanSandboxLinks,
  extractSandboxFilenames,
  getFileExtension,
  sendCodeExecutionFiles,
} from './codeExecutionService.js';
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

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function logStreamError(operation, error, metadata = {}) {
  logServiceError('StreamingService', error, { operation, ...metadata });
}

/**
 * Deep-clone a Gemini response part for safe storage in history.
 * @param {Object} part - A content part from the Gemini stream.
 * @returns {Object} A deep copy.
 */
function clonePart(part) {
  return structuredClone(part);
}

function truncateString(str, length = 1024) {
  if (!str) return '';
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

// ---------------------------------------------------------------------------
// Embed & response builders
// ---------------------------------------------------------------------------

function shouldShowGroundingMetadata(message) {
  return getResponsePreference(message) === 'Embedded';
}

function addGroundingMetadata(embed, groundingMetadata) {
  if (groundingMetadata.webSearchQueries?.length) {
    const value = groundingMetadata.webSearchQueries.map((query) => `• ${query}`).join('\n');
    embed.addFields({
      name: '🔍 Search Queries',
      value: truncateString(value) || 'No search queries',
      inline: false,
    });
  }

  if (groundingMetadata.groundingChunks?.length) {
    const chunks = groundingMetadata.groundingChunks
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

  const value = urlContextMetadata.url_metadata
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

// ---------------------------------------------------------------------------
// Text file fallback for oversized responses
// ---------------------------------------------------------------------------

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

    if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id, originalMessage.channelId)) {
      response = await addSettingsButton(response);
      response = await addDeleteButton(response, response.id, historyId);
    }
    return response;
  } catch (error) {
    logStreamError('sendAsTextFile', error, {
      messageId: originalMessage.id,
      historyId,
    });
    return null;
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logStreamError('sendAsTextFileCleanup', error, { filePath });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stop-generation button & collector
// ---------------------------------------------------------------------------

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
        logStreamError('refreshStopButton', error, { messageId: initialBotMessage.id });
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

function createCollector(message, originalMessage, onStop = () => {}) {
  let stopped = false;

  const collector = message.createMessageComponentCollector({
    filter: (interaction) => interaction.customId === 'stopGenerating',
    time: MESSAGE_TYPING_TIMEOUT_MS,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id === originalMessage.author.id) {
      stopped = true;
      collector.stop('user-stopped');
      await onStop(interaction);
      await interaction.reply(applyEmbedFallback(interaction.channel, {
        embeds: [createStatusEmbed({
          variant: 'warning',
          title: 'Response Stopped',
          description: 'Response generation stopped by the user.',
        })],
        flags: MessageFlags.Ephemeral,
      })).catch((error) => {
        logStreamError('collectorStopReply', error, { interactionId: interaction.id });
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
      logStreamError('collectorAccessDeniedReply', error, { interactionId: interaction.id });
    });
  });

  return {
    collector,
    wasStopped: () => stopped,
  };
}

// ---------------------------------------------------------------------------
// Conversation persistence
// ---------------------------------------------------------------------------

async function persistConversation(historyId, messageId, parts, assistantParts) {
  await chatHistoryLock.runExclusive(async () => {
    updateChatHistory(historyId, [
      { role: 'user', content: parts },
      { role: 'assistant', content: assistantParts },
    ], messageId);
    await saveStateToFile();
  });
}

// ---------------------------------------------------------------------------
// Post-stream response finalization
// ---------------------------------------------------------------------------

async function handleLargeOrFinalResponse(
  botMessage,
  originalMessage,
  responseText,
  isLargeResponse,
  historyId,
  extraMessageIds = [],
) {
  const showButtons = shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id, originalMessage.channelId);

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

// ---------------------------------------------------------------------------
// Stream chunk processing
// ---------------------------------------------------------------------------

/**
 * Process a single stream chunk and accumulate text, inline files, and raw parts.
 * @param {Object} chunk - A Gemini API stream chunk.
 * @param {Object} accumulator - Mutable accumulator for the stream.
 */
function processStreamChunk(chunk, accumulator) {
  const rawParts = chunk.candidates?.[0]?.content?.parts || [];
  let chunkText = '';

  for (const part of rawParts) {
    // Keep the model's original part structure for future turns.
    if (part.text !== undefined) {
      const lastPart = accumulator.rawAssistantParts[accumulator.rawAssistantParts.length - 1];
      if (lastPart && lastPart.text !== undefined) {
        lastPart.text += part.text;
        // Copy any additional properties (e.g. thoughtSignature) from this chunk
        for (const key of Object.keys(part)) {
          if (key !== 'text' && lastPart[key] === undefined) {
            lastPart[key] = typeof part[key] === 'object' && part[key] !== null
              ? clonePart({ [key]: part[key] })[key]
              : part[key];
          }
        }
      } else {
        accumulator.rawAssistantParts.push(clonePart(part));
      }
    } else {
      accumulator.rawAssistantParts.push(clonePart(part));
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
      accumulator.inlineDataFiles.push({
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      });
    }
  }

  if (chunk.candidates?.[0]?.groundingMetadata) {
    accumulator.groundingMetadata = chunk.candidates[0].groundingMetadata;
  }
  if (chunk.candidates?.[0]?.url_context_metadata) {
    accumulator.urlContextMetadata = chunk.candidates[0].url_context_metadata;
  }

  return chunkText;
}

// ---------------------------------------------------------------------------
// Main streaming entry point
// ---------------------------------------------------------------------------

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
  let finalized = false;
  let bufferedText = '';
  let updateTimeout = null;
  let isLargeResponse = false;
  let activeAbortController = null;

  const clearPendingUpdate = () => {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  const stopActiveGeneration = async () => {
    clearPendingUpdate();

    if (activeAbortController && !activeAbortController.signal.aborted) {
      activeAbortController.abort();
    }

    await removeStopGeneratingButton(botMessage);
  };

  const { collector, wasStopped } = createCollector(botMessage, originalMessage, stopActiveGeneration);

  // Shared mutable accumulator updated by processStreamChunk
  const accumulator = {
    groundingMetadata: null,
    urlContextMetadata: null,
    rawAssistantParts: [],
    inlineDataFiles: [],
  };

  const flushBufferedText = () => {
    if (wasStopped() || finalized || isLargeResponse) return;

    if (!bufferedText.trim()) {
      botMessage.edit(applyEmbedFallback(originalMessage.channel, {
        embeds: [createStatusEmbed({
          variant: 'muted',
          title: 'Generating Response',
          description: 'Still working on this response...',
        })],
      })).catch((error) => {
        logStreamError('flushBufferedTextPlaceholder', error, { messageId: botMessage.id });
      });
    } else if (responsePreference === 'Embedded') {
      buildResponseEmbed(botMessage, bufferedText, originalMessage, accumulator.groundingMetadata, accumulator.urlContextMetadata).catch((error) => {
        logStreamError('flushBufferedTextEmbed', error, { messageId: botMessage.id });
      });
    } else {
      botMessage.edit({ content: bufferedText, embeds: [] }).catch((error) => {
        logStreamError('flushBufferedTextPlain', error, { messageId: botMessage.id });
      });
    }

    clearPendingUpdate();
  };

  const finalizeResponse = async (finalResponseText, responseWasLarge) => {
    const trimmedFinalResponse = finalResponseText.trim();
    const hasResponseText = trimmedFinalResponse.length > 0;
    const normalizedFinalResponse = hasResponseText
      ? trimmedFinalResponse
      : '[Empty response]';

    clearPendingUpdate();

    if (!responseWasLarge) {
      if (responsePreference === 'Embedded') {
        await buildResponseEmbed(botMessage, normalizedFinalResponse, originalMessage, accumulator.groundingMetadata, accumulator.urlContextMetadata);
      } else {
        await botMessage.edit({ content: normalizedFinalResponse, embeds: [] }).catch((error) => {
          logStreamError('finalPlainEdit', error, { messageId: botMessage.id });
        });
      }
    }

    let filesMessage = null;
    if (accumulator.inlineDataFiles.length > 0) {
      filesMessage = await sendCodeExecutionFiles(accumulator.inlineDataFiles, originalMessage, deleteHistoryRef);
    }

    const linkedMessageIds = [
      filesMessage?.id,
      ...extraMessageIds,
    ].filter(Boolean);

    botMessage = await handleLargeOrFinalResponse(
      botMessage,
      originalMessage,
      normalizedFinalResponse,
      responseWasLarge,
      deleteHistoryRef,
      linkedMessageIds,
    );

    if (hasResponseText) {
      const assistantPartsForHistory = accumulator.rawAssistantParts.length > 0
        ? accumulator.rawAssistantParts
        : [{ text: normalizedFinalResponse }];
      await persistConversation(historyId, botMessage.id, parts, assistantPartsForHistory);
    }

    finalized = true;
    activeAbortController = null;
    collector.stop('completed');
  };

  try {
    let attempts = MAX_GENERATION_ATTEMPTS;

    while (attempts > 0 && !wasStopped()) {
      try {
        activeAbortController = new AbortController();
        const stream = await chat.sendMessageStream({
          message: parts,
          config: {
            ...(chat.config ?? {}),
            abortSignal: activeAbortController.signal,
          },
        });
        let finalResponse = '';
        isLargeResponse = false;
        accumulator.inlineDataFiles = [];
        accumulator.rawAssistantParts = [];

        for await (const chunk of stream) {
          if (wasStopped()) {
            break;
          }

          const chunkText = processStreamChunk(chunk, accumulator);

          if (chunkText) {
            finalResponse += chunkText;
            bufferedText += chunkText;
          }

          if (finalResponse.length > maxCharacterLimit) {
            if (!isLargeResponse) {
              isLargeResponse = true;
              clearPendingUpdate();
              botMessage.edit(applyEmbedFallback(originalMessage.channel, {
                embeds: [createStatusEmbed({
                  variant: 'warning',
                  title: 'Response Overflow',
                  description: 'This response is too long for a Discord message and will be delivered as an attached file.',
                })],
              })).catch((error) => {
                logStreamError('overflowWarningEdit', error, { messageId: botMessage.id });
              });
            }
          } else if (!updateTimeout) {
            updateTimeout = setTimeout(flushBufferedText, STREAM_UPDATE_DEBOUNCE_MS);
          }
        }

        // --- Post-stream processing ---

        // Determine file extensions from generated files and assign sandbox names
        const activeExtensions = accumulator.inlineDataFiles
          .map((f) => getFileExtension(f.mimeType).replace(/^\./, '').split('+')[0])
          .filter((ext) => ext && /^[a-z0-9]+$/i.test(ext));

        const sandboxFilenames = extractSandboxFilenames(finalResponse, activeExtensions);
        const actualNames = assignFileNames(accumulator.inlineDataFiles, sandboxFilenames);

        finalResponse = cleanSandboxLinks(finalResponse, actualNames);
        await finalizeResponse(finalResponse, isLargeResponse);
        return;
      } catch (error) {
        const wasAborted = wasStopped() || activeAbortController?.signal.aborted;
        if (wasAborted && (isAbortError(error) || activeAbortController?.signal.aborted)) {
          await finalizeResponse(bufferedText, bufferedText.length > maxCharacterLimit);
          return;
        }

        activeAbortController = null;

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

            if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id, originalMessage.channelId)) {
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
            retryMessage.delete().catch((deleteError) => {
              logStreamError('deleteRetryMessage', deleteError, { messageId: retryMessage.id });
            });
          }, 5_000);
        }
      }
    }
  } finally {
    if (!finalized && !wasStopped()) {
      clearPendingUpdate();
    }
    if (finalized) {
      await removeStopGeneratingButton(botMessage);
    }
  }
}
