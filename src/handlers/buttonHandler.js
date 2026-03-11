/**
 * Button interaction handlers.
 * Each function handles a specific button customId or prefix.
 */

import { ChannelType } from 'discord.js';

import {
  clearChatHistoryFor,
  clearCustomInstruction,
  getHistory,
  getServerSettings,
  getUserGeminiToolPreferences,
  saveStateToFile,
  setCustomInstruction,
  setUserGeminiToolPreference,
  state,
  toggleChannelUserActive,
  toggleServerResponseStyle,
  toggleServerSetting,
  toggleUserResponseFormat,
} from '../state/botState.js';
import { serializeConversationHistory } from '../services/textSharingService.js';
import { addSettingsButton } from '../ui/messageActions.js';
import {
  buildCustomPersonalityModal,
  buildServerPersonalityModal,
  showSettings,
  updateGeneralSettingsView,
} from '../ui/settingsViews.js';
import {
  createEmbed,
  ensureGuildInteraction,
  replyWithEmbed,
  safeDeleteMessage,
} from '../utils/discord.js';
import {
  ensureInteractionNotBlacklisted,
  persistStateChange,
  replyFeatureDisabled,
  requireGuildAdmin,
  sendSavedContentToUser,
} from './interactionHelpers.js';

async function handleDeleteMessageInteraction(interaction, messageIdStr) {
  const userId = interaction.user.id;
  const userChatHistory = state.chatHistories[userId];
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

  if (userChatHistory?.[primaryId]) {
    delete userChatHistory[primaryId];
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
  const serverChatHistoryEnabled = interaction.guild
    ? state.serverSettings[interaction.guild.id]?.serverChatHistory
    : false;

  if (serverChatHistoryEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Clearing chat history is not enabled for this server, Server-Wide chat history is active.',
    );
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
  const serverCustomEnabled = interaction.guild
    ? state.serverSettings[interaction.guild.id]?.customServerPersonality
    : false;

  if (serverCustomEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Custom personality is not enabled for this server, Server-Wide personality is active.',
    );
  }

  return interaction.showModal(buildCustomPersonalityModal());
}

async function handleRemovePersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild
    ? state.serverSettings[interaction.guild.id]?.customServerPersonality
    : false;

  if (serverCustomEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Custom personality is not enabled for this server, Server-Wide personality is active.',
    );
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
  const settings = getServerSettings(guildId);
  settings.serverChatHistory = toggleServerSetting(guildId, 'serverChatHistory');
  await persistStateChange();

  const warningMessage = settings.serverChatHistory && !settings.customServerPersonality
    ? '\n\nWarning: enabling server-side chat history without server-wide personality management can mix personalities between users.'
    : '';

  return replyWithEmbed(interaction, {
    color: settings.serverChatHistory ? 0x00FF00 : 0xFF0000,
    title: 'Chat History Toggled',
    description: `Server-wide Chat History is now \`${settings.serverChatHistory ? 'enabled' : 'disabled'}\`${warningMessage}`,
  });
}

async function toggleServerPersonality(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  settings.customServerPersonality = toggleServerSetting(guildId, 'customServerPersonality');
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: settings.customServerPersonality ? 0x00FF00 : 0xFF0000,
    title: 'Server Personality Toggled',
    description: `Server-wide Personality is now \`${settings.customServerPersonality ? 'enabled' : 'disabled'}\``,
  });
}

async function toggleServerResponsePreference(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  settings.serverResponsePreference = toggleServerSetting(guildId, 'serverResponsePreference');
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: settings.serverResponsePreference ? 0x00FF00 : 0xFF0000,
    title: 'Server Response Preference Toggled',
    description: `Server-wide Response Following is now \`${settings.serverResponsePreference ? 'enabled' : 'disabled'}\``,
  });
}

async function toggleSettingSaveButton(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  settings.settingsSaveButton = toggleServerSetting(guildId, 'settingsSaveButton');
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: settings.settingsSaveButton ? 0x00FF00 : 0xFF0000,
    title: 'Settings Save Button Toggled',
    description: `Server-wide "Settings and Save Button" is now \`${settings.settingsSaveButton ? 'enabled' : 'disabled'}\``,
  });
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
  const settings = getServerSettings(interaction.guild.id);
  settings.responseStyle = toggleServerResponseStyle(interaction.guild.id);
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Server Response Style Updated',
    description: `Server response style updated to: ${settings.responseStyle}`,
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
