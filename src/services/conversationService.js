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
import {
  buildConversationContext,
  getResponsePreference,
  isSharedConversation,
  resolveHistoryCategory,
  resolveHistoryId,
  resolveInstructions,
  tagPartsWithUser,
} from './conversationContext.js';
import { extractFileText, hasSupportedAttachments, processPromptAndMediaAttachments } from './attachmentService.js';
import { streamModelResponse } from './streamingService.js';
import { addSettingsButton } from '../ui/messageActions.js';
import { applyEmbedFallback, createEmbed } from '../utils/discord.js';

/** Creates a Gemini chat session configured for the given Discord message context. */
async function createChatSession(message) {
  const instructions = await buildConversationContext(message, resolveInstructions(message));
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

  const historyId = resolveHistoryId(message);
  const category = resolveHistoryCategory(message);
  const limit = config.chatHistoryLimits[category];

  return genAI.chats.create({
    model: MODEL,
    config: chatConfig,
    history: getHistory(historyId, limit),
  });
}

function createProcessingEmbed(textAttachmentStatus = '[🔁]', mediaAttachmentStatus = '[🔁]', finalText = '') {
  return createEmbed({
    color: 0x00FFFF,
    title: 'Processing',
    description: `Let me think...\n\n- ${textAttachmentStatus}: Text Attachment Check\n- ${mediaAttachmentStatus}: Media Attachment Check\n${finalText}`,
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
  return createEmbed({
    color: 0x00FFFF,
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
  const mentionPattern = getMentionPattern(message.client.user.id);
  let messageContent = message.content.replace(mentionPattern, '').trim();

  if (!messageContent && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {
    activeRequests.delete(message.author.id);
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
        embeds: [createProcessingEmbed('[☑️]', '[☑️]', '### All checks done. Waiting for the response...')],
      }));
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

  if (isSharedConversation(message)) {
    parts = tagPartsWithUser(parts, message);
  }

  await streamModelResponse({
    initialBotMessage: processingMessage,
    chat: await createChatSession(message),
    parts,
    originalMessage: message,
  });
}
