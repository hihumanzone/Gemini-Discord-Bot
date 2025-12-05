import {
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import {
  HarmBlockThreshold,
  HarmCategory
} from '@google/genai';

import config from '../config.js';
import {
  client,
  genAI,
  state,
  activeRequests,
  getHistory,
  initializeBlacklistForGuild,
} from '../botManager.js';

import {
  hasSupportedAttachments,
  processPromptAndMediaAttachments,
  extractFileText,
} from '../utils/fileUtils.js';

import { addSettingsButton, createErrorEmbed, createWarningEmbed } from '../utils/embedUtils.js';
import { validateMessageAuthor, getHistoryId, getInstructions } from '../utils/validationUtils.js';
import { handleModelResponse } from './modelResponseHandler.js';

// Configuration from centralized config
const MODEL = config.model;
const defaultPersonality = config.defaultPersonality;
const workInDMs = config.workInDMs;
const SEND_RETRY_ERRORS_TO_DISCORD = config.SEND_RETRY_ERRORS_TO_DISCORD;

// Safety settings for the AI model (mapped from config)
const safetySettings = config.safetySettings.map(setting => ({
  category: HarmCategory[setting.category],
  threshold: HarmBlockThreshold[setting.threshold],
}));

// Generation configuration from config
const generationConfig = config.generationConfig;

// AI tools from config
const tools = config.tools;

/**
 * Registers the message create event handler
 */
export function registerMessageHandler() {
  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot) return;
      if (message.content.startsWith('!')) return;

      const isDM = message.channel.type === ChannelType.DM;

      const shouldRespond = (
        workInDMs && isDM ||
        state.alwaysRespondChannels[message.channelId] ||
        (message.mentions.users.has(client.user.id) && !isDM) ||
        state.activeUsersInChannels[message.channelId]?.[message.author.id]
      );

      if (shouldRespond) {
        // Validate message author (blacklist check)
        const validation = validateMessageAuthor(message);
        if (!validation.valid) {
          return message.reply({
            embeds: [createErrorEmbed('Blacklisted', validation.error)]
          });
        }
        
        if (activeRequests.has(message.author.id)) {
          await message.reply({
            embeds: [createWarningEmbed('Request In Progress', 'Please wait until your previous action is complete.')]
          });
        } else {
          activeRequests.add(message.author.id);
          await handleTextMessage(message);
        }
      }
    } catch (error) {
      console.error('Error processing the message:', error);
      if (activeRequests.has(message.author.id)) {
        activeRequests.delete(message.author.id);
      }
    }
  });
}

/**
 * Handles a text message and generates AI response
 * @param {Message} message - Discord message
 */
async function handleTextMessage(message) {
  const botId = client.user.id;
  const userId = message.author.id;
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  let messageContent = message.content.replace(new RegExp(`<@!?${botId}>`), '').trim();

  if (messageContent === '' && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {
    if (activeRequests.has(userId)) {
      activeRequests.delete(userId);
    }
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Empty Message')
      .setDescription("It looks like you didn't say anything. What would you like to talk about?");
    const botMessage = await message.reply({
      embeds: [embed]
    });
    await addSettingsButton(botMessage);
    return;
  }
  
  message.channel.sendTyping();
  const typingInterval = setInterval(() => {
    message.channel.sendTyping();
  }, 4000);
  setTimeout(() => {
    clearInterval(typingInterval);
  }, 120000);
  
  let botMessage = false;
  let parts;
  
  try {
    if (SEND_RETRY_ERRORS_TO_DISCORD) {
      clearInterval(typingInterval);
      const updateEmbedDescription = (textAttachmentStatus, imageAttachmentStatus, finalText) => {
        return `Let me think...\n\n- ${textAttachmentStatus}: Text Attachment Check\n- ${imageAttachmentStatus}: Media Attachment Check\n${finalText || ''}`;
      };

      const embed = new EmbedBuilder()
        .setColor(0x00FFFF)
        .setTitle('Processing')
        .setDescription(updateEmbedDescription('[🔁]', '[🔁]'));
      botMessage = await message.reply({
        embeds: [embed]
      });

      messageContent = await extractFileText(message, messageContent);
      embed.setDescription(updateEmbedDescription('[☑️]', '[🔁]'));
      await botMessage.edit({
        embeds: [embed]
      });

      parts = await processPromptAndMediaAttachments(messageContent, message);
      embed.setDescription(updateEmbedDescription('[☑️]', '[☑️]', '### All checks done. Waiting for the response...'));
      await botMessage.edit({
        embeds: [embed]
      });
    } else {
      messageContent = await extractFileText(message, messageContent);
      parts = await processPromptAndMediaAttachments(messageContent, message);
    }
  } catch (error) {
    return console.error('Error initialising message', error);
  }

  // Get instructions using utility function
  const instructions = getInstructions(userId, channelId, guildId);

  // Build user info string for server context
  let infoStr = '';
  if (guildId) {
    const userInfo = {
      username: message.author.username,
      displayName: message.author.displayName
    };
    infoStr = `\nYou are currently engaging with users in the ${message.guild.name} Discord server.\n\n## Current User Information\nUsername: \`${userInfo.username}\`\nDisplay Name: \`${userInfo.displayName}\``;
  }

  const isServerChatHistoryEnabled = guildId ? state.serverSettings[guildId]?.serverChatHistory : false;
  const finalInstructions = isServerChatHistoryEnabled ? (instructions || '') + infoStr : instructions;
  
  // Get history ID using utility function
  const historyId = getHistoryId(userId, channelId, guildId);

  // Create chat with Google GenAI API using config values
  const chat = genAI.chats.create({
    model: MODEL,
    config: {
      systemInstruction: {
        role: "system",
        parts: [{ text: finalInstructions || defaultPersonality }]
      },
      ...generationConfig,
      safetySettings,
      tools
    },
    history: getHistory(historyId)
  });

  await handleModelResponse(botMessage, chat, parts, message, typingInterval, historyId);
}
