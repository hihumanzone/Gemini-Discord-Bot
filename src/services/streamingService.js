/**
 * Streaming response service.
 * Handles streaming Gemini API responses, managing the stop-generation button,
 * debounced message updates, large-response overflow, and code-execution file delivery.
 */

import fs from 'fs/promises';
import path from 'path';

import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import { TEMP_DIR } from '../core/paths.js';
import { activeRequests } from '../core/runtime.js';
import {
  chatHistoryLock,
  saveStateToFile,
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
import { applyEmbedFallback, canSendEmbeds, createEmbed } from '../utils/discord.js';
import { buildRetryErrorEmbed, formatGeminiErrorForConsole } from '../utils/errorFormatter.js';

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

const SANDBOX_LINK_RE = /\[([^\]]+)\]\(sandbox:\/[^)]+\)/g;

function getFileExtension(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || `.${mimeType.split('/').pop()}`;
}

function extractSandboxFilenames(text) {
  return [...text.matchAll(SANDBOX_LINK_RE)].map((m) => m[1]);
}

function cleanSandboxLinks(text) {
  return text.replace(SANDBOX_LINK_RE, '📎 $1');
}

function toDeleteHistoryRef(historyId, authorId) {
  if (!historyId || !authorId) {
    return null;
  }

  if (historyId === authorId) {
    return 'u:default';
  }

  if (historyId.startsWith(`${authorId}_`)) {
    const sessionId = historyId.slice(authorId.length + 1);
    return sessionId ? `u:${sessionId}` : 'u:default';
  }

  return null;
}

// --- Embed & response builders ---

function shouldShowGroundingMetadata(message) {
  return getResponsePreference(message) === 'Embedded';
}

function addGroundingMetadata(embed, groundingMetadata) {
  if (groundingMetadata.webSearchQueries?.length) {
    embed.addFields({
      name: '🔍 Search Queries',
      value: groundingMetadata.webSearchQueries.map((query) => `• ${query}`).join('\n'),
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
      value: chunks,
      inline: false,
    });
  }
}

function addUrlContextMetadata(embed, urlContextMetadata) {
  if (!urlContextMetadata.url_metadata?.length) {
    return;
  }

  embed.addFields({
    name: '🔗 URL Context',
    value: urlContextMetadata.url_metadata
      .map((urlData) => {
        const emoji = urlData.url_retrieval_status === 'URL_RETRIEVAL_STATUS_SUCCESS' ? '✔️' : '❌';
        return `${emoji} ${urlData.retrieved_url}`;
      })
      .join('\n'),
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
    content: ' ',
    embeds: [embed],
  }));
}

// --- Text file fallback ---

async function sendAsTextFile(text, originalMessage, relatedMessageId, historyId) {
  const filename = `response-${Date.now()}.txt`;
  const filePath = path.join(TEMP_DIR, filename);

  try {
    await fs.writeFile(filePath, text, 'utf8');
    const response = await originalMessage.channel.send({
      content: `<@${originalMessage.author.id}>, Here is the response:`,
      files: [filePath],
    });

    await addSettingsButton(response);
    await addDeleteButton(response, relatedMessageId, historyId);
  } catch (error) {
    console.error('An error occurred while sending a text file response:', error);
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

// --- Stop-generation button & collector ---

function createStopButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stopGenerating').setLabel('Stop Generating').setStyle(ButtonStyle.Danger),
  );
}

async function ensureInitialBotMessage(initialBotMessage, originalMessage) {
  if (initialBotMessage) {
    await initialBotMessage.edit({ components: [createStopButtonRow()] }).catch(() => {});
    return initialBotMessage;
  }

  return originalMessage.reply({
    content: 'Let me think..',
    components: [createStopButtonRow()],
  });
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
      await interaction.reply({
        embeds: [createEmbed({
          color: 0xFFA500,
          title: 'Response Stopped',
          description: 'Response generation stopped by the user.',
        })],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    await interaction.reply({
      embeds: [createEmbed({
        color: 0xFF0000,
        title: 'Access Denied',
        description: "It's not for you.",
      })],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  });

  return {
    collector,
    wasStopped: () => stopped,
  };
}

// --- Conversation persistence ---

async function persistConversation(historyId, messageId, parts, responseText) {
  await chatHistoryLock.runExclusive(async () => {
    updateChatHistory(historyId, [
      { role: 'user', content: parts },
      { role: 'assistant', content: [{ text: responseText }] },
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
  filesMessageId = null,
) {
  let updatedMessage = await clearMessageActionRows(botMessage);
  updatedMessage = await addSettingsButton(updatedMessage);

  const deleteTargetId = filesMessageId ? `${updatedMessage.id},${filesMessageId}` : updatedMessage.id;

  if (isLargeResponse) {
    await sendAsTextFile(responseText, originalMessage, botMessage.id, historyId);
    updatedMessage = await addDeleteButton(updatedMessage, deleteTargetId, historyId);
    return updatedMessage;
  }

  const shouldAddActionButtons = originalMessage.guild
    ? state.serverSettings[originalMessage.guild.id]?.settingsSaveButton
    : true;

  if (!shouldAddActionButtons) {
    return clearMessageActionRows(updatedMessage);
  }

  updatedMessage = await addDownloadButton(updatedMessage);
  updatedMessage = await addDeleteButton(updatedMessage, deleteTargetId, historyId);
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

    const filesEmbed = createEmbed({
      color: EMBED_COLOR,
      title: '📎 Generated Files',
      description: inlineDataFiles
        .map(({ name: fname, mimeType }, idx) => `**${idx + 1}.** ${fname || `generated_${idx + 1}${getFileExtension(mimeType)}`}`)
        .join('\n'),
      timestamp: true,
    });

    const filesMessage = await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      content: `<@${originalMessage.author.id}>`,
      embeds: [filesEmbed],
      files: attachments,
      allowedMentions: { users: [originalMessage.author.id] },
    }));

    let updated = await addSettingsButton(filesMessage);
    updated = await addDeleteButton(updated, updated.id, historyId);
    return updated;
  } catch (error) {
    console.error('Failed to send code execution files:', error);
    return null;
  } finally {
    for (const tempPath of tempPaths) {
      await fs.unlink(tempPath).catch(() => {});
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
 */
export async function streamModelResponse({ initialBotMessage, chat, parts, originalMessage }) {
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

  const flushBufferedText = () => {
    if (wasStopped()) {
      return;
    }

    if (!bufferedText.trim()) {
      botMessage.edit({ content: '...' }).catch(() => {});
    } else if (responsePreference === 'Embedded') {
      buildResponseEmbed(botMessage, bufferedText, originalMessage, groundingMetadata, urlContextMetadata).catch(() => {});
    } else {
      botMessage.edit({ content: bufferedText, embeds: [] }).catch(() => {});
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
        let isLargeResponse = false;
        const inlineDataFiles = [];

        for await (const chunk of stream) {
          if (wasStopped()) {
            break;
          }

          let chunkText = '';

          const rawParts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of rawParts) {
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
              await botMessage.edit(applyEmbedFallback(originalMessage.channel, {
                embeds: [createEmbed({
                  color: 0xFFFF00,
                  title: 'Response Overflow',
                  description: 'The response got too large, will be sent as a text file once it is completed.',
                })],
              }));
            }
          } else if (!updateTimeout) {
            updateTimeout = setTimeout(flushBufferedText, STREAM_UPDATE_DEBOUNCE_MS);
          }
        }

        // Assign sandbox filenames to inline data files before cleaning links
        const sandboxFilenames = extractSandboxFilenames(finalResponse);
        for (let i = 0; i < inlineDataFiles.length; i++) {
          inlineDataFiles[i].name = sandboxFilenames[i] || null;
        }
        finalResponse = cleanSandboxLinks(finalResponse);

        if (!isLargeResponse) {
          if (responsePreference === 'Embedded') {
            await buildResponseEmbed(botMessage, finalResponse, originalMessage, groundingMetadata, urlContextMetadata);
          } else if (finalResponse.trim()) {
            await botMessage.edit({ content: finalResponse, embeds: [] }).catch(() => {});
          }
        }

        let filesMessage = null;
        if (inlineDataFiles.length > 0) {
          filesMessage = await sendCodeExecutionFiles(inlineDataFiles, originalMessage, deleteHistoryRef);
        }

        botMessage = await handleLargeOrFinalResponse(
          botMessage,
          originalMessage,
          finalResponse,
          isLargeResponse,
          deleteHistoryRef,
          filesMessage?.id,
        );
        await persistConversation(historyId, botMessage.id, parts, finalResponse);
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
              : createEmbed({
                  color: 0xFF0000,
                  title: 'Bot Overloaded',
                  description: 'Something seems off, the bot might be overloaded! :(',
                });

            const errorMessage = await originalMessage.channel.send(applyEmbedFallback(originalMessage.channel, {
              content: `<@${originalMessage.author.id}>`,
              embeds: [embed],
            }));
            await addSettingsButton(errorMessage);
            botMessage = await clearMessageActionRows(botMessage);
            botMessage = await addSettingsButton(botMessage);
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

          setTimeout(() => retryMessage.delete().catch(() => {}), 5_000);
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
    activeRequests.delete(originalMessage.author.id);
  }
}
