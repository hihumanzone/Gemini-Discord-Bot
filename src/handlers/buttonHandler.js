/**
 * Button interaction handlers.
 * Each function handles a specific button customId or prefix.
 */

import { ChannelType } from 'discord.js';

import {
  clearChatHistoryFor,
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
import { addSettingsButton } from '../ui/messageActions.js';
import {
  buildChannelPersonalityModal,
  buildCustomPersonalityModal,
  buildServerPersonalityModal,
  showSettings,
  updateChannelSettingsView,
  updateGeneralSettingsView,
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
  const channel = interaction.channel;
  const messageIds = messageIdStr.split(',');
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

  if (deleteChatHistoryEntry(userId, primaryId)) {
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

  clearChatHistoryFor(interaction.user.id);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: 'Chat history cleared!',
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
  const history = getHistory(interaction.user.id);
  if (!history.length) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'No History Found',
      description: 'No conversation history found.',
    });
  }

  return sendSavedContentToUser(interaction, {
    text: serializeConversationHistory(history),
    fileBaseName: 'conversation_history',
    title: 'Message Content Downloaded',
    description: 'Here is the content of the conversation.',
    successTitle: 'Content Sent',
    successDescription: 'The conversation content has been sent to your DMs.',
    failureDescription: 'Failed to send the conversation content to your DMs. The saved content is attached below instead.',
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
    title: 'Message Content Downloaded',
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
    title: 'Message Content Downloaded',
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
