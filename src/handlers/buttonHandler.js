/**
 * Button interaction handlers.
 * Each function handles a specific button customId or prefix.
 */

import { ChannelType } from 'discord.js';

import {
  clearChatHistoryFor,
  clearCustomInstruction,
  deleteChatHistoryEntry,
  deleteSession,
  getChannelSettings,
  getCustomInstruction,
  getHistory,
  getServerSettings,
  getUserGeminiToolPreferences,
  setAlwaysRespondChannel,
  setChannelWideChatHistory,
  setUserGeminiToolPreference,
  toggleChannelUserActive,
  toggleChannelSetting,
  cycleServerResponseStyle,
  cycleChannelResponseStyle,
  toggleServerSetting,
  toggleUserResponseFormat,
  toggleUserResponseActionButtons,
  cycleServerResponseActionButtons,
  cycleChannelResponseActionButtons,
  toggleNanoBananaModeState,
  toggleNanoBananaGoogleSearch,
  toggleNanoBananaImageSearch,
} from '../state/botState.js';
import { serializeConversationHistory } from '../services/textSharingService.js';
import {
  getActiveSessionDetails,
  getSessionDetails,
  parseDeleteMessagePayload,
  resolveDeleteHistoryId,
} from '../services/sessionService.js';
import { addSettingsButton } from '../ui/messageActions.js';
import {
  buildChannelPersonalityModal,
  buildCustomPersonalityModal,
  buildSessionCreateModal,
  buildSessionRenameModal,
  buildServerPersonalityModal,
  showSettings,
  updateChannelSettingsView,
  updateGeneralSettingsView,
  updateGeminiToolsSettingsView,
  updatePersonalitySettingsView,
  updateSessionSettingsView,
  updateServerSettingsView,
} from '../ui/settingsViews.js';
import {
  ensureGuildInteraction,
  replyWithEmbed,
  safeDeleteMessage,
} from '../utils/discord.js';
import { replyWithError, logError } from '../utils/errorHandler.js';
import {
  ensureInteractionNotBlacklisted,
  getClearMemoryDisabledReason,
  getCustomPersonalityDisabledReason,
  getNanoBananaDisabledReason,
  getResponseStyleDisabledReason,
  getAlwaysRespondDisabledReason,
  getResponseActionButtonsDisabledReason,
  persistStateChange,
  replyFeatureDisabled,
  requireGuildAdmin,
  sendSavedContentToUser,
} from './interactionHelpers.js';

const OVERFLOW_DOWNLOAD_PREFIX = 'download_message_overflow-';

function getOverflowSourceMessageId(customId) {
  if (!customId?.startsWith(OVERFLOW_DOWNLOAD_PREFIX)) {
    return null;
  }

  const sourceMessageId = customId.slice(OVERFLOW_DOWNLOAD_PREFIX.length);
  return /^\d{16,22}$/.test(sourceMessageId) ? sourceMessageId : null;
}

async function resolveOverflowAttachmentMessage(interaction, sourceMessageId) {
  if (!sourceMessageId) return null;
  if (interaction.message?.id === sourceMessageId) return interaction.message;

  try {
    if (!interaction.channel?.messages?.fetch) {
      return null;
    }
    return await interaction.channel.messages.fetch(sourceMessageId);
  } catch (error) {
    logError('OverflowAttachmentMessageFetch', error, {
      sourceMessageId,
      interactionId: interaction.id,
      channelId: interaction.channelId,
    });
    return null;
  }
}

function isTextLikeAttachment(attachment) {
  const contentType = (attachment?.contentType || '').toLowerCase();
  const fileName = (attachment?.name || '').toLowerCase();

  return contentType.startsWith('text/')
    || fileName.endsWith('.md')
    || fileName.endsWith('.txt');
}

async function readOverflowResponseFromAttachment(interaction, sourceMessageId) {
  const sourceMessage = await resolveOverflowAttachmentMessage(interaction, sourceMessageId);
  const attachment = sourceMessage?.attachments?.find?.((candidate) => isTextLikeAttachment(candidate))
    || sourceMessage?.attachments?.first?.();

  if (!attachment?.url) {
    return null;
  }

  if (!isTextLikeAttachment(attachment)) {
    logError('OverflowAttachmentInvalidType', new Error('Attachment is not a text file'), {
      sourceMessageId,
      interactionId: interaction.id,
      attachmentName: attachment.name,
      attachmentContentType: attachment.contentType,
    });
    return null;
  }

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment (status ${response.status})`);
    }

    const text = await response.text();
    return text || null;
  } catch (error) {
    logError('OverflowAttachmentRead', error, {
      sourceMessageId,
      interactionId: interaction.id,
      attachmentUrl: attachment.url,
    });
    return null;
  }
}

async function handleDeleteMessageInteraction(interaction, messageIdStr) {
  const userId = interaction.user.id;
  const { historyRef, messageIds } = parseDeleteMessagePayload(messageIdStr);
  const targetHistoryId = resolveDeleteHistoryId(userId, historyRef);

  const channel = interaction.channel;
  if (messageIds.length === 0) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Invalid Message Link',
      description: 'This delete button payload is invalid or expired.',
    });
  }

  const primaryId = messageIds[0];
  const targetMessage = channel ? await channel.messages.fetch(primaryId).catch(() => null) : null;

  const performDeletion = async () => {
    await safeDeleteMessage(interaction.message);
    if (targetMessage) await safeDeleteMessage(targetMessage);
    for (const id of messageIds.slice(1)) {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) await safeDeleteMessage(msg);
    }
  };

  if (deleteChatHistoryEntry(targetHistoryId, primaryId)) {
    await persistStateChange();
    await performDeletion();
    return;
  }

  try {
    const repliedToMessage = targetMessage?.reference
      ? await targetMessage.channel.messages.fetch(targetMessage.reference.messageId)
      : null;

    if (repliedToMessage?.author?.id === userId) {
      await performDeletion();
      return;
    }
  } catch {
    logError('DeleteMessageReferenceLookup', 'Failed to resolve referenced message for delete permission check.', {
      interactionId: interaction.id,
      userId,
      targetMessageId: primaryId,
    });
  }

  await replyWithEmbed(interaction, {
    variant: 'error',
    title: 'Not For You',
    description: 'This button is not meant for you.',
  });
}

async function handleClearMemoryButton(interaction) {
  const disabledReason = getClearMemoryDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  const activeSession = getActiveSessionDetails(interaction.user.id);

  clearChatHistoryFor(activeSession.historyId);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Chat History Cleared',
    description: `Cleared history for session **${activeSession.sessionName}** (ID: ${activeSession.sessionId}).`,
  });
}

async function alwaysRespond(interaction) {
  const disabledReason = getAlwaysRespondDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleChannelUserActive(interaction.channelId, interaction.user.id);
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function handleCustomPersonalityCommand(interaction) {
  const disabledReason = getCustomPersonalityDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  return interaction.showModal(buildCustomPersonalityModal());
}

async function handleRemovePersonalityCommand(interaction) {
  const disabledReason = getCustomPersonalityDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  clearCustomInstruction(interaction.user.id);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Removed',
    description: 'Custom personality instructions removed!',
  });
}

async function downloadPersonality(interaction) {
  const instructions = getCustomInstruction(interaction.user.id);
  if (!instructions) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No Personality Found',
      description: 'You do not have a custom personality set.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: instructions,
    fileBaseName: 'personal_personality',
    title: 'Personality Downloaded',
    description: 'Here are your personal personality instructions.',
    successTitle: 'Content Sent',
    successDescription: 'Your personality instructions have been sent to your DMs.',
    failureDescription: 'Failed to send the instructions to your DMs. The saved content is attached below instead.',
  });
}

async function downloadMessage(interaction) {
  const sourceMessage = interaction.message;
  const isOverflowDownload = interaction.customId.startsWith(OVERFLOW_DOWNLOAD_PREFIX);
  const overflowSourceMessageId = getOverflowSourceMessageId(interaction.customId);

  if (isOverflowDownload && !overflowSourceMessageId) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Invalid Overflow Link',
      description: 'This overflow save button is malformed or missing its file reference.',
    });
  }

  const textContent = overflowSourceMessageId
    ? await readOverflowResponseFromAttachment(interaction, overflowSourceMessageId)
    : (sourceMessage.content || sourceMessage.embeds[0]?.description);

  if (!textContent) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: overflowSourceMessageId ? 'Overflow File Unavailable' : 'Empty Message',
      description: overflowSourceMessageId
        ? 'Could not retrieve the overflow response file. It may be missing, invalid, or no longer accessible.'
        : 'The message is empty..?',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: textContent,
    fileBaseName: 'message_content',
    title: 'Message Content Downloaded',
    description: 'Here is the content of the message.',
    successTitle: 'Content Sent',
    successDescription: 'The message content has been sent to your DMs.',
    failureDescription: 'Failed to send the content to your DMs. The saved content is attached below instead.',
  });
}

async function downloadConversation(interaction) {
  const activeSession = getActiveSessionDetails(interaction.user.id);
  const history = getHistory(activeSession.historyId);

  if (!history.length) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No History Found',
      description: `No conversation history found for session **${activeSession.sessionName}** (ID: ${activeSession.sessionId}).`,
    });
  }

  return sendSavedContentToUser(interaction, {
    text: serializeConversationHistory(history),
    fileBaseName: `conversation_history_${activeSession.sessionId}`,
    title: 'Session Conversation Downloaded',
    description: `Here is the conversation from session **${activeSession.sessionName}** (ID: ${activeSession.sessionId}).`,
    successTitle: 'Content Sent',
    successDescription: `Session **${activeSession.sessionName}** (ID: ${activeSession.sessionId}) conversation has been sent to your DMs.`,
    failureDescription: `Failed to send the session conversation to your DMs. Session: **${activeSession.sessionName}** (ID: ${activeSession.sessionId}).`,
  });
}

async function toggleUserResponsePreference(interaction) {
  const disabledReason = getResponseStyleDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleUserResponseFormat(interaction.user.id);
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function toggleActionButtons(interaction) {
  const disabledReason = getResponseActionButtonsDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleUserResponseActionButtons(interaction.user.id);
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function toggleNanoBananaMode(interaction) {
  const disabledReason = getNanoBananaDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleNanoBananaModeState(interaction.user.id);
  await persistStateChange();
  return showSettings(interaction, true);
}

async function handleNBGoogleSearch(interaction) {
  const disabledReason = getNanoBananaDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleNanoBananaGoogleSearch(interaction.user.id);
  await persistStateChange();
  return updateGeminiToolsSettingsView(interaction);
}

async function handleNBImageSearch(interaction) {
  const disabledReason = getNanoBananaDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  toggleNanoBananaImageSearch(interaction.user.id);
  await persistStateChange();
  return updateGeminiToolsSettingsView(interaction);
}

async function toggleUserGeminiTool(interaction) {
  const prefix = 'toggle-gemini-tool-';
  const toolName = interaction.customId.slice(prefix.length);
  const currentPreferences = getUserGeminiToolPreferences(interaction.user.id);

  if (!(toolName in currentPreferences)) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Unknown Tool',
      description: 'That Gemini tool setting is not recognized.',
    });
  }

  setUserGeminiToolPreference(interaction.user.id, toolName, !currentPreferences[toolName]);
  await persistStateChange();
  return updateGeminiToolsSettingsView(interaction);
}

async function showSessionManager(interaction) {
  return updateSessionSettingsView(interaction);
}

async function showCreateSessionModal(interaction) {
  return interaction.showModal(buildSessionCreateModal());
}

async function showRenameSessionModal(interaction) {
  const prefix = 'open-rename-session-modal-';
  const sessionId = interaction.customId.slice(prefix.length);

  if (sessionId === 'default') {
    return replyWithEmbed(interaction, {
      variant: 'warning',
      title: 'Rename Not Allowed',
      description: 'The default session cannot be renamed.',
    });
  }

  const details = getSessionDetails(interaction.user.id, sessionId);
  const currentSessionName = details?.sessionName;

  if (!currentSessionName) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Session Not Found',
      description: `No session with ID **${sessionId}** was found.`,
    });
  }

  return interaction.showModal(buildSessionRenameModal(sessionId, currentSessionName));
}

function buildSessionConversationPayload(history, sessionDetails, sessionId) {
  return {
    text: serializeConversationHistory(history),
    fileBaseName: `conversation_history_${sessionId}`,
    title: 'Session Conversation Downloaded',
    description: `Here is the conversation from session **${sessionDetails.sessionName}** (ID: ${sessionId}).`,
    successTitle: 'Content Sent',
    successDescription: `Session **${sessionDetails.sessionName}** (ID: ${sessionId}) conversation has been sent to your DMs.`,
    failureDescription: `Failed to send the session conversation to your DMs. Session: **${sessionDetails.sessionName}** (ID: ${sessionId}).`,
  };
}

async function handleDeleteSession(interaction) {
  const prefix = 'delete-session-';
  const sessionId = interaction.customId.slice(prefix.length);

  if (sessionId === 'default') {
    return replyWithEmbed(interaction, {
      variant: 'warning',
      title: 'Cannot Delete Default',
      description: 'The default session cannot be deleted.',
    });
  }

  const deleted = deleteSession(interaction.user.id, sessionId);
  if (!deleted) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Session Not Found',
      description: `No session with ID **${sessionId}** was found.`,
    });
  }

  return updateSessionSettingsView(interaction, 'default', `Deleted session ID ${sessionId}.`);
}

async function handleSessionConversationDownload(interaction) {
  const prefix = 'session-download-conversation-';
  const sessionId = interaction.customId.slice(prefix.length);
  const details = getSessionDetails(interaction.user.id, sessionId);

  if (!details) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Session Not Found',
      description: `No session with ID **${sessionId}** was found.`,
    });
  }

  const history = getHistory(details.historyId);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No History Found',
      description: `No conversation history found for session **${details.sessionName}** (ID: ${sessionId}).`,
    });
  }

  return sendSavedContentToUser(interaction, buildSessionConversationPayload(history, details, sessionId));
}

async function handleSessionHistoryClear(interaction) {
  const prefix = 'session-clear-history-';
  const sessionId = interaction.customId.slice(prefix.length);
  const details = getSessionDetails(interaction.user.id, sessionId);

  if (!details) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Session Not Found',
      description: `No session with ID **${sessionId}** was found.`,
    });
  }

  clearChatHistoryFor(details.historyId);
  await persistStateChange();

  return updateSessionSettingsView(
    interaction,
    sessionId,
    `Cleared history for **${details.sessionName}** (ID: ${sessionId}).`,
  );
}

// --- Server admin button handlers ---

/**
 * Creates a handler that toggles a server-level boolean setting and refreshes the view.
 * @param {string} settingName - The key in serverSettings to toggle.
 */
function createServerSettingToggle(settingName) {
  return async (interaction) => {
    if (!(await ensureGuildInteraction(interaction))) {
      return;
    }

    toggleServerSetting(interaction.guild.id, settingName);
    await persistStateChange();
    return updateServerSettingsView(interaction);
  };
}

async function serverPersonality(interaction) {
  return interaction.showModal(buildServerPersonalityModal());
}

async function downloadServerPersonality(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const instructions = getCustomInstruction(interaction.guild.id);
  if (!instructions) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No Personality Found',
      description: 'This server does not have a custom server personality set.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: instructions,
    fileBaseName: 'server_personality',
    title: 'Server Personality Downloaded',
    description: 'Here are the server-wide personality instructions.',
    successTitle: 'Content Sent',
    successDescription: 'The server personality instructions have been sent to your DMs.',
    failureDescription: 'Failed to send the instructions to your DMs. The saved content is attached below instead.',
  });
}

async function clearServerChatHistory(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  if (!settings.serverChatHistory) {
    return replyWithEmbed(interaction, {
      variant: 'warning',
      title: 'Feature Disabled',
      description: 'Server-wide chat history is disabled for this server.',
    });
  }

  clearChatHistoryFor(guildId);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Chat History Cleared',
    description: 'Server-wide chat history cleared!',
  });
}

async function downloadServerConversation(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const history = getHistory(interaction.guild.id);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No History Found',
      description: 'No server-wide conversation history found.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: serializeConversationHistory(history),
    fileBaseName: 'server_conversation_history',
    title: 'Server Conversation Downloaded',
    description: 'Here is the content of the conversation.',
    successTitle: 'Content Sent',
    successDescription: 'The conversation content has been sent to your DMs.',
    failureDescription: 'Failed to send the conversation content to your DMs. The saved content is attached below instead.',
  });
}

async function toggleServerPreference(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  cycleServerResponseStyle(interaction.guild.id);
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

async function cycleServerActionButtons(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  cycleServerResponseActionButtons(interaction.guild.id);
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

// --- Channel admin button handlers ---

async function toggleChannelAlwaysRespond(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const channelId = interaction.channel.id;
  const current = getChannelSettings(channelId).alwaysRespond;
  setAlwaysRespondChannel(channelId, !current);
  await persistStateChange();

  return updateChannelSettingsView(interaction);
}

async function toggleChannelChatHistory(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const channelId = interaction.channel.id;
  const current = getChannelSettings(channelId).channelWideChatHistory;
  setChannelWideChatHistory(channelId, !current);
  await persistStateChange();

  return updateChannelSettingsView(interaction);
}

async function toggleChannelPersonality(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  toggleChannelSetting(interaction.channel.id, 'customChannelPersonality');
  await persistStateChange();

  return updateChannelSettingsView(interaction);
}

async function clearChannelChatHistory(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const channelId = interaction.channel.id;
  if (!getChannelSettings(channelId).channelWideChatHistory) {
    return replyWithEmbed(interaction, {
      variant: 'warning',
      title: 'Feature Disabled',
      description: 'Channel-wide chat history is not enabled for this channel.',
    });
  }

  clearChatHistoryFor(channelId);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Chat History Cleared',
    description: 'Channel-wide chat history cleared!',
  });
}

async function channelPersonality(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;
  return interaction.showModal(buildChannelPersonalityModal());
}

async function downloadChannelPersonality(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const instructions = getCustomInstruction(interaction.channel.id);
  if (!instructions) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No Personality Found',
      description: 'This channel does not have a custom channel personality set.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: instructions,
    fileBaseName: 'channel_personality',
    title: 'Channel Personality Downloaded',
    description: 'Here are the channel-wide personality instructions.',
    successTitle: 'Content Sent',
    successDescription: 'The channel personality instructions have been sent to your DMs.',
    failureDescription: 'Failed to send the instructions to your DMs. The saved content is attached below instead.',
  });
}

async function downloadChannelConversation(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const history = getHistory(interaction.channel.id);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'No History Found',
      description: 'No channel-wide conversation history found.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: serializeConversationHistory(history),
    fileBaseName: 'channel_conversation_history',
    title: 'Channel Conversation Downloaded',
    description: 'Here is the content of the channel conversation.',
    successTitle: 'Content Sent',
    successDescription: 'The conversation content has been sent to your DMs.',
    failureDescription: 'Failed to send the conversation content to your DMs. The saved content is attached below instead.',
  });
}

async function toggleChannelPreference(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  cycleChannelResponseStyle(interaction.channel.id);
  await persistStateChange();

  return updateChannelSettingsView(interaction);
}

async function cycleChannelActionButtons(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  cycleChannelResponseActionButtons(interaction.channel.id);
  await persistStateChange();

  return updateChannelSettingsView(interaction);
}

/** Routes a button interaction to its handler based on customId. */
export async function handleButtonInteraction(interaction) {
  try {
    if (!(await ensureInteractionNotBlacklisted(interaction))) {
      return;
    }

    if (interaction.customId.startsWith('delete_message-')) {
      const messageId = interaction.customId.replace('delete_message-', '');
      await handleDeleteMessageInteraction(interaction, messageId);
      return;
    }

    // Exact-match handlers: O(1) lookup for buttons with fixed customIds
    const exactHandlers = {
      'server-chat-history': createServerSettingToggle('serverChatHistory'),
      'clear-server': clearServerChatHistory,
      'settings-save-buttons': cycleServerActionButtons,
      'custom-server-personality': serverPersonality,
      'toggle-server-personality': createServerSettingToggle('customServerPersonality'),
      'download-server-conversation': downloadServerConversation,
      'response-server-mode': toggleServerPreference,
      'channel-always-respond': toggleChannelAlwaysRespond,
      'channel-chat-history': toggleChannelChatHistory,
      'toggle-channel-personality': toggleChannelPersonality,
      'clear-channel-history': clearChannelChatHistory,
      'channel-custom-personality': channelPersonality,
      'channel-download-conversation': downloadChannelConversation,
      'channel-settings-save-buttons': cycleChannelActionButtons,
      'response-channel-mode': toggleChannelPreference,
      settings: showSettings,
      back_to_main_settings: (btnInteraction) => showSettings(btnInteraction, true),
      'clear-memory': handleClearMemoryButton,
      'always-respond': alwaysRespond,
      'custom-personality': handleCustomPersonalityCommand,
      'download-personality': downloadPersonality,
      'download-server-personality': downloadServerPersonality,
      'download-channel-personality': downloadChannelPersonality,
      'remove-personality': handleRemovePersonalityCommand,
      'toggle-response-mode': toggleUserResponsePreference,
      'toggle-action-buttons': toggleActionButtons,
      'toggle-nano-banana': toggleNanoBananaMode,
      'toggle-nb-google-search': handleNBGoogleSearch,
      'toggle-nb-image-search': handleNBImageSearch,
      'session-settings': showSessionManager,
      'open-create-session-modal': showCreateSessionModal,
      'download-conversation': downloadConversation,
      'general-settings': updateGeneralSettingsView,
      'gemini-tools-settings': updateGeminiToolsSettingsView,
      'personality-settings': updatePersonalitySettingsView,
    };

    if (interaction.customId === 'download_message' || interaction.customId.startsWith(OVERFLOW_DOWNLOAD_PREFIX)) {
      await downloadMessage(interaction);
      return;
    }

    const exactHandler = exactHandlers[interaction.customId];
    if (exactHandler) {
      await exactHandler(interaction);
      return;
    }

    // Prefix-match handlers: only for buttons whose customIds carry dynamic suffixes
    const prefixHandlers = [
      ['toggle-gemini-tool-', toggleUserGeminiTool],
      ['open-rename-session-modal-', showRenameSessionModal],
      ['session-download-conversation-', handleSessionConversationDownload],
      ['session-clear-history-', handleSessionHistoryClear],
      ['delete-session-', handleDeleteSession],
    ];

    for (const [prefix, handler] of prefixHandlers) {
      if (interaction.customId.startsWith(prefix)) {
        await handler(interaction);
        return;
      }
    }
  } catch (error) {
    logError('ButtonHandler', error, {
      buttonCustomId: interaction.customId,
      userId: interaction.user?.id,
    });
    await replyWithError(interaction, 'Button Error', 'An error occurred while processing this button action.');
  }
}
