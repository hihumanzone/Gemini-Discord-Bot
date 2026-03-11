import fs from 'fs/promises';
import path from 'path';

import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import axios from 'axios';

import {
  activeRequests,
  chatHistoryLock,
  genAI,
  getHistory,
  getUserGeminiToolPreferences,
  saveStateToFile,
  state,
  TEMP_DIR,
  updateChatHistory,
} from '../../botManager.js';
import {
  EMBED_COLOR,
  EMBED_RESPONSE_LIMIT,
  EXTERNAL_TEXT_SHARE_URL,
  buildGeminiToolsFromPreferences,
  GENERATION_CONFIG,
  MAX_GENERATION_ATTEMPTS,
  MESSAGE_TYPING_INTERVAL_MS,
  MESSAGE_TYPING_TIMEOUT_MS,
  MODEL,
  PLAIN_RESPONSE_LIMIT,
  SAFETY_SETTINGS,
  SEND_RETRY_ERRORS_TO_DISCORD,
  STREAM_UPDATE_DEBOUNCE_MS,
  TEXT_FILE_TTL_MINUTES,
} from '../constants.js';
import {
  buildConversationContext,
  getResponsePreference,
  resolveHistoryId,
  resolveInstructions,
} from './conversationContext.js';
import { extractFileText, hasSupportedAttachments, processPromptAndMediaAttachments } from './attachmentService.js';
import {
  addDeleteButton,
  addDownloadButton,
  addSettingsButton,
  clearMessageActionRows,
  removeStopGeneratingButton,
} from '../ui/messageActions.js';
import { createEmbed } from '../utils/discord.js';
import { buildRetryErrorEmbed } from '../utils/errorFormatter.js';

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

function createChatSession(message) {
  const instructions = buildConversationContext(message, resolveInstructions(message));
  const selectedTools = buildGeminiToolsFromPreferences(getUserGeminiToolPreferences(message.author.id));
  const chatConfig = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: instructions }],
    },
    ...GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
  };

  if (selectedTools.length > 0) {
    chatConfig.tools = selectedTools;
  }

  return genAI.chats.create({
    model: MODEL,
    config: chatConfig,
    history: getHistory(resolveHistoryId(message)),
  });
}

function createProcessingEmbed(textAttachmentStatus = '[🔁]', mediaAttachmentStatus = '[🔁]', finalText = '') {
  return createEmbed({
    color: 0x00FFFF,
    title: 'Processing',
    description: `Let me think...\n\n- ${textAttachmentStatus}: Text Attachment Check\n- ${mediaAttachmentStatus}: Media Attachment Check\n${finalText}`,
  });
}

function createTypingHeartbeat(channel) {
  channel.sendTyping().catch(() => {});

  const intervalId = setInterval(() => {
    channel.sendTyping().catch(() => {});
  }, MESSAGE_TYPING_INTERVAL_MS);

  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);
  }, MESSAGE_TYPING_TIMEOUT_MS);

  return () => {
    clearInterval(intervalId);
    clearTimeout(timeoutId);
  };
}

function createEmptyMessageEmbed() {
  return createEmbed({
    color: 0x00FFFF,
    title: 'Empty Message',
    description: "It looks like you didn't say anything. What would you like to talk about?",
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

  return botMessage.edit({
    content: ' ',
    embeds: [embed],
  });
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

function shouldShowGroundingMetadata(message) {
  return getResponsePreference(message) === 'Embedded';
}

async function uploadText(text) {
  try {
    const response = await axios.post(
      `${EXTERNAL_TEXT_SHARE_URL}/api/text`,
      { text, ttl: TEXT_FILE_TTL_MINUTES },
      { timeout: 3_000 },
    );

    return `\nURL: ${EXTERNAL_TEXT_SHARE_URL}/t/${response.data.tid}`;
  } catch (error) {
    console.error('Failed to upload text:', error);
    return '\nURL Error :(';
  }
}

async function sendAsTextFile(text, originalMessage, relatedMessageId) {
  const filename = `response-${Date.now()}.txt`;
  const filePath = path.join(TEMP_DIR, filename);

  try {
    await fs.writeFile(filePath, text, 'utf8');
    const response = await originalMessage.channel.send({
      content: `<@${originalMessage.author.id}>, Here is the response:`,
      files: [filePath],
    });

    await addSettingsButton(response);
    await addDeleteButton(response, relatedMessageId);
  } catch (error) {
    console.error('An error occurred while sending a text file response:', error);
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

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

async function persistConversation(historyId, messageId, parts, responseText) {
  await chatHistoryLock.runExclusive(async () => {
    updateChatHistory(historyId, [
      { role: 'user', content: parts },
      { role: 'assistant', content: [{ text: responseText }] },
    ], messageId);
    await saveStateToFile();
  });
}

async function handleLargeOrFinalResponse(botMessage, originalMessage, responseText, isLargeResponse, filesMessageId = null) {
  let updatedMessage = await clearMessageActionRows(botMessage);
  updatedMessage = await addSettingsButton(updatedMessage);

  const deleteTargetId = filesMessageId ? `${updatedMessage.id},${filesMessageId}` : updatedMessage.id;

  if (isLargeResponse) {
    await sendAsTextFile(responseText, originalMessage, botMessage.id);
    updatedMessage = await addDeleteButton(updatedMessage, deleteTargetId);
    return updatedMessage;
  }

  const shouldAddActionButtons = originalMessage.guild ? state.serverSettings[originalMessage.guild.id]?.settingsSaveButton : true;

  if (!shouldAddActionButtons) {
    return clearMessageActionRows(updatedMessage);
  }

  updatedMessage = await addDownloadButton(updatedMessage);
  updatedMessage = await addDeleteButton(updatedMessage, deleteTargetId);
  return updatedMessage;
}

async function sendCodeExecutionFiles(inlineDataFiles, originalMessage) {
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
        .map(({ name, mimeType }, idx) => `**${idx + 1}.** ${name || `generated_${idx + 1}${getFileExtension(mimeType)}`}`)
        .join('\n'),
      timestamp: true,
    });

    const filesMessage = await originalMessage.reply({
      content: `<@${originalMessage.author.id}>`,
      embeds: [filesEmbed],
      files: attachments,
      allowedMentions: { users: [originalMessage.author.id] },
    });

    let updated = await addSettingsButton(filesMessage);
    updated = await addDeleteButton(updated, updated.id);
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

async function streamModelResponse({ initialBotMessage, chat, parts, originalMessage }) {
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
              await botMessage.edit({
                embeds: [createEmbed({
                  color: 0xFFFF00,
                  title: 'Response Overflow',
                  description: 'The response got too large, will be sent as a text file once it is completed.',
                })],
              });
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
          filesMessage = await sendCodeExecutionFiles(inlineDataFiles, originalMessage);
        }

        botMessage = await handleLargeOrFinalResponse(botMessage, originalMessage, finalResponse, isLargeResponse, filesMessage?.id);
        await persistConversation(resolveHistoryId(originalMessage), botMessage.id, parts, finalResponse);
        finalized = true;
        collector.stop();
        return;
      } catch (error) {
        attempts -= 1;
        console.error('Generation attempt failed:', error);

        if (attempts <= 0 || wasStopped()) {
          if (!wasStopped()) {
            const embed = SEND_RETRY_ERRORS_TO_DISCORD
              ? buildRetryErrorEmbed(error, { isFinal: true })
              : createEmbed({
                  color: 0xFF0000,
                  title: 'Bot Overloaded',
                  description: 'Something seems off, the bot might be overloaded! :(',
                });

            const errorMessage = await originalMessage.channel.send({
              content: `<@${originalMessage.author.id}>`,
              embeds: [embed],
            });
            await addSettingsButton(errorMessage);
            botMessage = await clearMessageActionRows(botMessage);
            botMessage = await addSettingsButton(botMessage);
            finalized = true;
          }

          collector.stop();
          return;
        }

        if (SEND_RETRY_ERRORS_TO_DISCORD) {
          const retryMessage = await originalMessage.channel.send({
            content: `<@${originalMessage.author.id}>`,
            embeds: [buildRetryErrorEmbed(error, { isFinal: false })],
          });

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

export async function handleTextMessage(message) {
  const mentionPattern = new RegExp(`<@!?${message.client.user.id}>`);
  let messageContent = message.content.replace(mentionPattern, '').trim();

  if (!messageContent && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {
    activeRequests.delete(message.author.id);
    const response = await message.reply({ embeds: [createEmptyMessageEmbed()] });
    await addSettingsButton(response);
    return;
  }

  const stopTyping = createTypingHeartbeat(message.channel);
  let processingMessage = null;
  let parts;

  try {
    if (SEND_RETRY_ERRORS_TO_DISCORD) {
      processingMessage = await message.reply({
        embeds: [createProcessingEmbed()],
      });

      messageContent = await extractFileText(message, messageContent);
      await processingMessage.edit({
        embeds: [createProcessingEmbed('[☑️]', '[🔁]')],
      });

      parts = await processPromptAndMediaAttachments(messageContent, message);
      await processingMessage.edit({
        embeds: [createProcessingEmbed('[☑️]', '[☑️]', '### All checks done. Waiting for the response...')],
      });
    } else {
      messageContent = await extractFileText(message, messageContent);
      parts = await processPromptAndMediaAttachments(messageContent, message);
    }
  } catch (error) {
    activeRequests.delete(message.author.id);
    stopTyping();
    console.error('Error initializing message:', error);
    return;
  }

  stopTyping();

  await streamModelResponse({
    initialBotMessage: processingMessage,
    chat: createChatSession(message),
    parts,
    originalMessage: message,
  });
}

export function serializeConversationHistory(history) {
  return history
    .map((entry) => {
      const role = entry.role === 'user' ? '[User]' : '[Model]';
      const content = entry.parts.map((part) => part.text).filter(Boolean).join('\n');
      return `${role}:\n${content}\n\n`;
    })
    .join('');
}

export async function createSharedTextLink(text) {
  return uploadText(text);
}
