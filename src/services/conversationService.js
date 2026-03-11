import fs from 'fs/promises';
import path from 'path';

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import axios from 'axios';

import {
  activeRequests,
  chatHistoryLock,
  genAI,
  getHistory,
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  saveStateToFile,
  state,
  TEMP_DIR,
  updateChatHistory,
} from '../../botManager.js';
import {
  DEFAULT_PERSONALITY,
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
import { extractFileText, hasSupportedAttachments, processPromptAndMediaAttachments } from './attachmentService.js';
import { addDeleteButton, addDownloadButton, addSettingsButton, clearMessageActionRows } from '../ui/messageActions.js';
import { createEmbed } from '../utils/discord.js';

function getResponsePreference(message) {
  const guildPreference = message.guild && state.serverSettings[message.guild.id]?.serverResponsePreference;
  return guildPreference ? state.serverSettings[message.guild.id].responseStyle : getUserResponsePreference(message.author.id);
}

function resolveInstructions(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (!guildId) {
    return state.customInstructions[userId] || DEFAULT_PERSONALITY;
  }

  if (state.channelWideChatHistory[channelId]) {
    return state.customInstructions[channelId] || DEFAULT_PERSONALITY;
  }

  if (state.serverSettings[guildId]?.customServerPersonality && state.customInstructions[guildId]) {
    return state.customInstructions[guildId];
  }

  return state.customInstructions[userId] || DEFAULT_PERSONALITY;
}

function buildConversationContext(message, instructions) {
  if (!message.guild || !state.serverSettings[message.guild.id]?.serverChatHistory) {
    return instructions;
  }

  return `${instructions}\nYou are currently engaging with users in the ${message.guild.name} Discord server.\n\n## Current User Information\nUsername: \`${message.author.username}\`\nDisplay Name: \`${message.author.displayName}\``;
}

function resolveHistoryId(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (!guildId) {
    return userId;
  }

  const isServerHistoryEnabled = Boolean(state.serverSettings[guildId]?.serverChatHistory);
  const isChannelHistoryEnabled = Boolean(state.channelWideChatHistory[channelId]);

  if (!isChannelHistoryEnabled) {
    return userId;
  }

  return isServerHistoryEnabled ? guildId : channelId;
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

async function handleLargeOrFinalResponse(botMessage, originalMessage, responseText, isLargeResponse) {
  await clearMessageActionRows(botMessage);
  await addSettingsButton(botMessage);

  if (isLargeResponse) {
    await sendAsTextFile(responseText, originalMessage, botMessage.id);
    await addDeleteButton(botMessage, botMessage.id);
    return botMessage;
  }

  const shouldAddActionButtons = originalMessage.guild ? state.serverSettings[originalMessage.guild.id]?.settingsSaveButton : true;

  if (!shouldAddActionButtons) {
    await botMessage.edit({ components: [] });
    return botMessage;
  }

  await addDownloadButton(botMessage);
  await addDeleteButton(botMessage, botMessage.id);
  return botMessage;
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

        for await (const chunk of stream) {
          if (wasStopped()) {
            break;
          }

          const chunkText =
            chunk.text ||
            (chunk.codeExecutionResult?.output ? `\n\`\`\`py\n${chunk.codeExecutionResult.output}\n\`\`\`\n` : '') ||
            (chunk.executableCode ? `\n\`\`\`\n${chunk.executableCode}\n\`\`\`\n` : '');

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

        if (!isLargeResponse && responsePreference === 'Embedded') {
          await buildResponseEmbed(botMessage, finalResponse, originalMessage, groundingMetadata, urlContextMetadata);
        }

        await handleLargeOrFinalResponse(botMessage, originalMessage, finalResponse, isLargeResponse);
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
              ? createEmbed({
                  color: 0xFF0000,
                  title: 'Generation Failure',
                  description: `All generation attempts failed :(\n\`\`\`${error.message}\`\`\``,
                })
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
            await clearMessageActionRows(botMessage);
            await addSettingsButton(botMessage);
            finalized = true;
          }

          collector.stop();
          return;
        }

        if (SEND_RETRY_ERRORS_TO_DISCORD) {
          const retryMessage = await originalMessage.channel.send({
            content: `<@${originalMessage.author.id}>`,
            embeds: [createEmbed({
              color: 0xFFFF00,
              title: 'Retry in Progress',
              description: `Generation attempt failed, retrying...\n\`\`\`${error.message}\`\`\``,
            })],
          });

          setTimeout(() => retryMessage.delete().catch(() => {}), 5_000);
        }
      }
    }
  } finally {
    clearTimeout(updateTimeout);
    if (!finalized && wasStopped()) {
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
