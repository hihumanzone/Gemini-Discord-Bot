/**
 * Button interaction handlers.
 * Each function handles a specific button customId or prefix.
 */

import { ChannelType } from 'discord.js';

import {
  clearChatHistoryFor,
  deleteSession,
  clearCustomInstruction,
  deleteChatHistoryEntry,
  getChannelSettings,
  getHistory,
  getServerSettings,
  getUserGeminiToolPreferences,
  setAlwaysRespondChannel,
  setChannelWideChatHistory,
  setUserGeminiToolPreference,
  toggleChannelUserActive,
  toggleChannelSetting,
  toggleServerResponseStyle,
  toggleServerSetting,
  toggleUserResponseFormat,
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
  updateSessionSettingsView,
  updateServerSettingsView,
} from '../ui/settingsViews.js';
import {
  createEmbed,
  ensureGuildInteraction,
  replyWithEmbed,
  safeDeleteMessage,
} from '../utils/discord.js';
import {
  ensureInteractionNotBlacklisted,
  getClearMemoryDisabledReason,
  getCustomPersonalityDisabledReason,
  persistStateChange,
  replyFeatureDisabled,
  requireGuildAdmin,
  sendSavedContentToUser,
} from './interactionHelpers.js';

async function handleDeleteMessageInteraction(interaction, messageIdStr) {
  const userId = interaction.user.id;
  const { historyRef, messageIds } = parseDeleteMessagePayload(messageIdStr);
  const targetHistoryId = resolveDeleteHistoryId(userId, historyRef);

  const channel = interaction.channel;
  if (messageIds.length === 0) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
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
    // Ignore failed reference lookups and fall through to the access denied reply.
  }

  await replyWithEmbed(interaction, {
    color: 0xFF0000,
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
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: `Cleared history for session **${activeSession.sessionName}** (ID: ${activeSession.sessionId}).`,
  });
}

async function alwaysRespond(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'Feature Disabled in DMs',
      description: 'This feature is disabled in direct messages.',
    });
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
    color: 0x00FF00,
    title: 'Removed',
    description: 'Custom personality instructions removed!',
  });
}

async function downloadMessage(interaction) {
  const sourceMessage = interaction.message;
  const textContent = sourceMessage.content || sourceMessage.embeds[0]?.description;

  if (!textContent) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'Empty Message',
      description: 'The message is empty..?',
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
      color: 0xFF0000,
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
  toggleUserResponseFormat(interaction.user.id);
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function toggleUserGeminiTool(interaction) {
  const prefix = 'toggle-gemini-tool-';
  const toolName = interaction.customId.slice(prefix.length);
  const currentPreferences = getUserGeminiToolPreferences(interaction.user.id);

  if (!(toolName in currentPreferences)) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'Unknown Tool',
      description: 'That Gemini tool setting is not recognized.',
    });
  }

  setUserGeminiToolPreference(interaction.user.id, toolName, !currentPreferences[toolName]);
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
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
      color: 0xFFA500,
      title: 'Rename Not Allowed',
      description: 'The default session cannot be renamed.',
    });
  }

  const details = getSessionDetails(interaction.user.id, sessionId);
  const currentSessionName = details?.sessionName;

  if (!currentSessionName) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
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
      color: 0xFFA500,
      title: 'Cannot Delete Default',
      description: 'The default session cannot be deleted.',
    });
  }

  const deleted = deleteSession(interaction.user.id, sessionId);
  if (!deleted) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
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
      color: 0xFF0000,
      title: 'Session Not Found',
      description: `No session with ID **${sessionId}** was found.`,
    });
  }

  const history = getHistory(details.historyId);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
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
      color: 0xFF0000,
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

async function toggleServerWideChatHistory(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  toggleServerSetting(guildId, 'serverChatHistory');
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

async function toggleServerPersonality(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  toggleServerSetting(guildId, 'customServerPersonality');
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

async function toggleServerResponsePreference(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  toggleServerSetting(guildId, 'serverResponsePreference');
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

async function toggleSettingSaveButton(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  toggleServerSetting(guildId, 'settingsSaveButton');
  await persistStateChange();

  return updateServerSettingsView(interaction);
}

async function serverPersonality(interaction) {
  return interaction.showModal(buildServerPersonalityModal());
}

async function clearServerChatHistory(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  if (!settings.serverChatHistory) {
    return replyWithEmbed(interaction, {
      color: 0xFFA500,
      title: 'Feature Disabled',
      description: 'Server-wide chat history is disabled for this server.',
    });
  }

  clearChatHistoryFor(guildId);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
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
      color: 0xFF0000,
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
  toggleServerResponseStyle(interaction.guild.id);
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
      color: 0xFFA500,
      title: 'Feature Disabled',
      description: 'Channel-wide chat history is not enabled for this channel.',
    });
  }

  clearChatHistoryFor(channelId);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: 'Channel-wide chat history cleared!',
  });
}

async function channelPersonality(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;
  return interaction.showModal(buildChannelPersonalityModal());
}

async function downloadChannelConversation(interaction) {
  if (!(await requireGuildAdmin(interaction))) return;

  const history = getHistory(interaction.channel.id);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
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

/** Routes a button interaction to its handler based on customId. */
export async function handleButtonInteraction(interaction) {
  if (!(await ensureInteractionNotBlacklisted(interaction))) {
    return;
  }

  if (interaction.customId.startsWith('delete_message-')) {
    const messageId = interaction.customId.replace('delete_message-', '');
    await handleDeleteMessageInteraction(interaction, messageId);
    return;
  }

  const buttonHandlers = {
    'server-chat-history': toggleServerWideChatHistory,
    'clear-server': clearServerChatHistory,
    'settings-save-buttons': toggleSettingSaveButton,
    'custom-server-personality': serverPersonality,
    'toggle-server-personality': toggleServerPersonality,
    'download-server-conversation': downloadServerConversation,
    'response-server-mode': toggleServerPreference,
    'toggle-response-server-mode': toggleServerResponsePreference,
    'channel-always-respond': toggleChannelAlwaysRespond,
    'channel-chat-history': toggleChannelChatHistory,
    'toggle-channel-personality': toggleChannelPersonality,
    'clear-channel-history': clearChannelChatHistory,
    'channel-custom-personality': channelPersonality,
    'channel-download-conversation': downloadChannelConversation,
    settings: showSettings,
    back_to_main_settings: (btnInteraction) => showSettings(btnInteraction, true),
    'clear-memory': handleClearMemoryButton,
    'always-respond': alwaysRespond,
    'custom-personality': handleCustomPersonalityCommand,
    'remove-personality': handleRemovePersonalityCommand,
    'toggle-response-mode': toggleUserResponsePreference,
    'toggle-gemini-tool-': toggleUserGeminiTool,
    'session-settings': showSessionManager,
    'open-create-session-modal': showCreateSessionModal,
    'open-rename-session-modal-': showRenameSessionModal,
    'session-download-conversation-': handleSessionConversationDownload,
    'session-clear-history-': handleSessionHistoryClear,
    'delete-session-': handleDeleteSession,
    'download-conversation': downloadConversation,
    download_message: downloadMessage,
    'general-settings': updateGeneralSettingsView,
  };

  for (const [key, handler] of Object.entries(buttonHandlers)) {
    if (interaction.customId.startsWith(key)) {
      await handler(interaction);
      return;
    }
  }
}
