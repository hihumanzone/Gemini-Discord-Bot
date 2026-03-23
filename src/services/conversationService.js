/**
 * Conversation service.
 * Handles incoming text messages: builds the chat session, processes
 * attachments, and delegates streaming to the streaming service.
 */

import config from '../../config.js';
import { genAI } from '../core/runtime.js';
import {
  getHistory,
  getUserGeminiToolPreferences,
  getUserNanoBananaMode,
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
  isSharedConversation,
  isSharedPersonality,
  resolveHistoryCategory,
  resolveHistoryId,
  resolveInstructions,
  tagPartsWithUser,
} from './conversationContext.js';
import {
  extractFileText,
  extractYouTubeUrls,
  getUnsupportedAttachments,
  hasSupportedAttachments,
  processPromptAndMediaAttachments,
} from './attachmentService.js';
import { streamModelResponse } from './streamingService.js';
import { applyEmbedFallback, createStatusEmbed } from '../utils/discord.js';
import { attachActionButtons, messageToActionContext } from '../utils/responseActions.js';
import { toDeleteHistoryRef } from '../utils/historyRef.js';

// ---------------------------------------------------------------------------
// Unsupported attachment warnings
// ---------------------------------------------------------------------------

const MAX_UNSUPPORTED_DISPLAY = 15;

function formatUnsupportedAttachmentsList(unsupportedAttachments) {
  const list = unsupportedAttachments
    .slice(0, MAX_UNSUPPORTED_DISPLAY)
    .map((attachment, index) => {
      const displayName = attachment.name || `attachment-${index + 1}`;
      return `• \`${displayName}\``;
    });

  if (unsupportedAttachments.length > MAX_UNSUPPORTED_DISPLAY) {
    const remaining = unsupportedAttachments.length - MAX_UNSUPPORTED_DISPLAY;
    list.push(`\n*...and ${remaining} more.*`);
  }

  return list.join('\n');
}

async function sendUnsupportedAttachmentsWarning(unsupportedAttachments, message, deleteHistoryRef) {
  if (!unsupportedAttachments.length) return null;

  try {
    const warningEmbed = createStatusEmbed({
      variant: 'warning',
      title: 'Unsupported Attachments Skipped',
      description: [
        'These files could not be processed and were skipped:',
        '',
        formatUnsupportedAttachmentsList(unsupportedAttachments),
      ].join('\n'),
    });

    const warningMessage = await message.reply(applyEmbedFallback(message.channel, {
      content: `<@${message.author.id}>`,
      embeds: [warningEmbed],
      allowedMentions: { users: [message.author.id], repliedUser: false },
    }));

    return await attachActionButtons(warningMessage, messageToActionContext(message), {
      deleteTargetIds: warningMessage.id,
      deleteHistoryRef,
    });
  } catch (error) {
    logServiceError('ConversationService', error, {
      operation: 'sendUnsupportedAttachmentsWarning',
      messageId: message.id,
      userId: message.author?.id,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat session creation
// ---------------------------------------------------------------------------

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

    let activeModel = MODEL;
    const nanoBananaMode = getUserNanoBananaMode(message.author.id);
    const isSharedHistory = isSharedConversation(message);
    const isSharedPers = isSharedPersonality(message);

    if (nanoBananaMode.enabled && !isSharedHistory && !isSharedPers) {
      activeModel = config.nanoBananaModel;

      if (nanoBananaMode.googleSearch && nanoBananaMode.imageSearch) {
        chatConfig.tools = [{ googleSearch: { searchTypes: { imageSearch: {} } } }];
      } else if (nanoBananaMode.googleSearch) {
        chatConfig.tools = [{ googleSearch: {} }];
      }
      // else: no tools - chatConfig.tools stays unset
    } else if (selectedTools.length > 0) {
      chatConfig.tools = selectedTools;
    }

    const historyId = resolveHistoryId(message);
    const category = resolveHistoryCategory(message);
    const limit = config.chatHistoryLimits[category];

    return await genAI.chats.create({
      model: activeModel,
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

// ---------------------------------------------------------------------------
// Processing status embeds
// ---------------------------------------------------------------------------

function createProcessingEmbed(textStatus = '[🔁]', mediaStatus = '[🔁]', finalText = '') {
  return createStatusEmbed({
    variant: 'info',
    title: 'Processing',
    description: [
      'Working on your request.',
      '',
      `- ${textStatus} Text attachment check`,
      `- ${mediaStatus} Media attachment check`,
      finalText,
    ].filter(Boolean).join('\n'),
  });
}

function createEmptyMessageEmbed() {
  return createStatusEmbed({
    variant: 'warning',
    title: 'Empty Message',
    description: "It looks like you didn't say anything. What would you like to talk about?",
  });
}

// ---------------------------------------------------------------------------
// Typing heartbeat
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mention pattern cache
// ---------------------------------------------------------------------------

let cachedMentionPattern = null;
let cachedMentionClientId = null;

function getMentionPattern(clientUserId) {
  if (cachedMentionClientId !== clientUserId) {
    cachedMentionPattern = new RegExp(`<@!?${clientUserId}>`, 'g');
    cachedMentionClientId = clientUserId;
  }
  return cachedMentionPattern;
}

// ---------------------------------------------------------------------------
// Error reply helper
// ---------------------------------------------------------------------------

async function sendErrorReply(message, processingMessage, deleteHistoryRef) {
  const errorEmbed = createStatusEmbed({
    variant: 'error',
    title: 'Request Failed',
    description: 'An unexpected error occurred while processing your request.',
  });

  const ctx = messageToActionContext(message);

  if (processingMessage) {
    await processingMessage.edit(applyEmbedFallback(message.channel, { embeds: [errorEmbed] }));
    await attachActionButtons(processingMessage, ctx, {
      deleteTargetIds: processingMessage.id,
      deleteHistoryRef,
    });
  } else {
    const errorMessage = await message.reply(applyEmbedFallback(message.channel, { embeds: [errorEmbed] }));
    await attachActionButtons(errorMessage, ctx, {
      deleteTargetIds: errorMessage.id,
      deleteHistoryRef,
    });
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point for handling a text message from a Discord user.
 * Strips the bot mention, extracts attachments, and streams a Gemini response.
 */
export async function handleTextMessage(message) {
  const clientUserId = message.client?.user?.id;
  const historyId = resolveHistoryId(message);
  const deleteHistoryRef = toDeleteHistoryRef(historyId, message.author.id);
  const mentionPattern = clientUserId ? getMentionPattern(clientUserId) : null;
  let messageContent = mentionPattern
    ? message.content.replace(mentionPattern, '').trim()
    : message.content.trim();
  const unsupportedAttachments = getUnsupportedAttachments(message);

  const hasYouTubeContent = extractYouTubeUrls(messageContent).length > 0;

  if (!messageContent && !hasYouTubeContent && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {

    const response = await message.reply(applyEmbedFallback(message.channel, { embeds: [createEmptyMessageEmbed()] }));
    await attachActionButtons(response, messageToActionContext(message));
    return;
  }

  const stopTyping = createTypingHeartbeat(message.channel);
  let processingMessage = null;
  let parts;
  let unsupportedWarningMessageId = null;

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
      const warningMessage = await sendUnsupportedAttachmentsWarning(unsupportedAttachments, message, deleteHistoryRef);
      unsupportedWarningMessageId = warningMessage?.id || null;
      await processingMessage.edit(applyEmbedFallback(message.channel, {
        embeds: [createProcessingEmbed('[☑️]', '[☑️]', '**All checks complete.** Waiting for generation...')],
      }));
    } else {
      messageContent = await extractFileText(message, messageContent);
      parts = await processPromptAndMediaAttachments(messageContent, message);
      const warningMessage = await sendUnsupportedAttachmentsWarning(unsupportedAttachments, message, deleteHistoryRef);
      unsupportedWarningMessageId = warningMessage?.id || null;
    }
  } catch (error) {
    stopTyping();
    logServiceError('ConversationService', error, {
      operation: 'initializeMessage',
      messageId: message.id,
      userId: message.author?.id,
    });

    if (processingMessage) {
      try {
        await sendErrorReply(message, processingMessage, deleteHistoryRef);
      } catch (replyError) {
        logServiceError('ConversationService', replyError, { operation: 'initializeMessageErrorReply' });
      }
    }
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
      extraMessageIds: unsupportedWarningMessageId ? [unsupportedWarningMessageId] : [],
    });
  } catch (error) {
    logServiceError('StreamingService', error, {
      operation: 'streamModelResponse',
      messageId: message.id,
      userId: message.author?.id,
    });
    try {
      await sendErrorReply(message, processingMessage, deleteHistoryRef);
    } catch (replyError) {
      logServiceError('StreamingService', replyError, { operation: 'errorReply' });
    }
  }
}
