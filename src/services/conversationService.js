/**
 * Conversation service.
 * Handles incoming text messages: builds the chat session, processes
 * attachments, and delegates streaming to the streaming service.
 */

import config from '../../config.js';
import { activeRequests, genAI } from '../core/runtime.js';
import {
  getHistory,
  getUserGeminiToolPreferences,
} from '../state/botState.js';
import {
  buildGeminiToolsFromPreferences,
  GENERATION_CONFIG,
  MESSAGE_TYPING_INTERVAL_MS,
  MESSAGE_TYPING_TIMEOUT_MS,
  MODEL,
  SAFETY_SETTINGS,
  SEND_RETRY_ERRORS_TO_DISCORD,
} from '../constants.js';
import { logServiceError } from '../utils/errorHandler.js';
import {
  buildConversationContext,
  buildFinalSystemInstruction,
  getResponsePreference,
  isSharedConversation,
  resolveHistoryCategory,
  resolveHistoryId,
  resolveInstructions,
  tagPartsWithUser,
} from './conversationContext.js';
import {
  extractFileText,
  getUnsupportedAttachments,
  hasSupportedAttachments,
  processPromptAndMediaAttachments,
} from './attachmentService.js';
import { streamModelResponse } from './streamingService.js';
import { addSettingsButton } from '../ui/messageActions.js';
import { applyEmbedFallback, createStatusEmbed } from '../utils/discord.js';

/** Creates a Gemini chat session configured for the given Discord message context. */
async function createChatSession(message) {
  try {
    const userToolPreferences = getUserGeminiToolPreferences(message.author.id);
    const selectedTools = buildGeminiToolsFromPreferences(userToolPreferences);
    const personality = resolveInstructions(message);
    const fullSystemInstruction = buildFinalSystemInstruction(personality, userToolPreferences);

    const instructions = await buildConversationContext(message, fullSystemInstruction);

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

    const historyId = resolveHistoryId(message);
    const category = resolveHistoryCategory(message);
    const limit = config.chatHistoryLimits[category];

    return await genAI.chats.create({
      model: MODEL,
      config: chatConfig,
      history: getHistory(historyId, limit),
    });
  } catch (error) {
    logServiceError('Gemini', error, {
      operation: 'createChatSession',
      userId: message.author?.id,
      channelId: message.channel?.id,
      guildId: message.guild?.id,
    });
    throw error;
  }
}

function createProcessingEmbed(textAttachmentStatus = '[🔁]', mediaAttachmentStatus = '[🔁]', finalText = '') {
  return createStatusEmbed({
    variant: 'info',
    title: 'Processing',
    description: [
      'Working on your request.',
      '',
      `- ${textAttachmentStatus} Text attachment check`,
      `- ${mediaAttachmentStatus} Media attachment check`,
      finalText,
    ].filter(Boolean).join('\n'),
  });
}

/** Sends periodic typing indicators until the returned cleanup function is called. */
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
  return createStatusEmbed({
    variant: 'warning',
    title: 'Empty Message',
    description: "It looks like you didn't say anything. What would you like to talk about?",
  });
}

/** Cached mention regex per client user ID. */
let cachedMentionPattern = null;
let cachedMentionClientId = null;

function getMentionPattern(clientUserId) {
  if (cachedMentionClientId !== clientUserId) {
    cachedMentionPattern = new RegExp(`<@!?${clientUserId}>`, 'g');
    cachedMentionClientId = clientUserId;
  }
  return cachedMentionPattern;
}

/**
 * Main entry point for handling a text message from a Discord user.
 * Strips the bot mention, extracts attachments, and streams a Gemini response.
 */
export async function handleTextMessage(message) {
  const clientUserId = message.client?.user?.id;
  const mentionPattern = clientUserId ? getMentionPattern(clientUserId) : null;
  let messageContent = mentionPattern
    ? message.content.replace(mentionPattern, '').trim()
    : message.content.trim();
  const unsupportedAttachments = getUnsupportedAttachments(message);

  if (!messageContent && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {

    const response = await message.reply(applyEmbedFallback(message.channel, { embeds: [createEmptyMessageEmbed()] }));
    await addSettingsButton(response);
    return;
  }

  const stopTyping = createTypingHeartbeat(message.channel);
  let processingMessage = null;
  let parts;

  try {
    if (SEND_RETRY_ERRORS_TO_DISCORD) {
      processingMessage = await message.reply(applyEmbedFallback(message.channel, {
        embeds: [createProcessingEmbed()],
      }));

      messageContent = await extractFileText(message, messageContent);
      await processingMessage.edit(applyEmbedFallback(message.channel, {
        embeds: [createProcessingEmbed('[☑️]', '[🔁]')],
      }));

      parts = await processPromptAndMediaAttachments(messageContent, message);
      await processingMessage.edit(applyEmbedFallback(message.channel, {
        embeds: [createProcessingEmbed('[☑️]', '[☑️]', '**All checks complete.** Waiting for generation...')],
      }));
    } else {
      messageContent = await extractFileText(message, messageContent);
      parts = await processPromptAndMediaAttachments(messageContent, message);
    }
  } catch (error) {

    stopTyping();
    logServiceError('ConversationService', error, {
      operation: 'initializeMessage',
      messageId: message.id,
      userId: message.author?.id,
    });
    return;
  }

  try {
    stopTyping();

    if (isSharedConversation(message)) {
      parts = tagPartsWithUser(parts, message);
    }

    await streamModelResponse({
      initialBotMessage: processingMessage,
      chat: await createChatSession(message),
      parts,
      originalMessage: message,
      unsupportedAttachments,
    });
  } catch (error) {

    logServiceError('StreamingService', error, {
      operation: 'streamModelResponse',
      messageId: message.id,
      userId: message.author?.id,
    });
    try {
      const errorEmbed = createStatusEmbed({
        variant: 'error',
        title: 'Request Failed',
        description: 'An unexpected error occurred while processing your request.',
      });
      if (processingMessage) {
        await processingMessage.edit(applyEmbedFallback(message.channel, { embeds: [errorEmbed] }));
      } else {
        await message.reply(applyEmbedFallback(message.channel, { embeds: [errorEmbed] }));
      }
    } catch (replyError) {
      logServiceError('StreamingService', replyError, { operation: 'errorReply' });
    }
  }
}
