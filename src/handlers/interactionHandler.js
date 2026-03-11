import fs from 'fs/promises';
import path from 'path';

import { AttachmentBuilder, ChannelType, MessageFlags } from 'discord.js';
import osu from 'node-os-utils';

import {
  getUserGeminiToolPreferences,
  getHistory,
  getUserResponsePreference,
  initializeBlacklistForGuild,
  saveStateToFile,
  state,
  TEMP_DIR,
} from '../../botManager.js';
import {
  DEFAULT_PERSONALITY,
  EMBED_COLOR,
  STATUS_LIFETIME_MS,
  STATUS_REFRESH_INTERVAL_MS,
} from '../constants.js';
import { createSharedTextLink, serializeConversationHistory } from '../services/conversationService.js';
import { addSettingsButton } from '../ui/messageActions.js';
import {
  buildCustomPersonalityModal,
  buildServerPersonalityModal,
  showDashboard,
  showSettings,
  updateGeneralSettingsView,
} from '../ui/settingsViews.js';
import {
  createEmbed,
  ensureAdministrator,
  ensureGuildInteraction,
  replyWithEmbed,
  safeDeleteMessage,
} from '../utils/discord.js';

const { cpu, mem } = osu;

async function persistStateChange() {
  await saveStateToFile();
}

function getServerSettings(guildId) {
  initializeBlacklistForGuild(guildId);
  return state.serverSettings[guildId];
}

async function requireGuildAdmin(interaction) {
  const inGuild = await ensureGuildInteraction(interaction, 'This command cannot be used in DMs.');
  if (!inGuild) {
    return false;
  }

  return ensureAdministrator(interaction);
}

async function replyFeatureDisabled(interaction, description) {
  return replyWithEmbed(interaction, {
    color: 0xFF5555,
    title: 'Feature Disabled',
    description,
  });
}

async function ensureInteractionNotBlacklisted(interaction) {
  if (!interaction.guild) {
    return true;
  }

  initializeBlacklistForGuild(interaction.guild.id);
  if (!state.blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
    return true;
  }

  await replyWithEmbed(interaction, {
    color: 0xFF0000,
    title: 'Blacklisted',
    description: 'You are blacklisted and cannot use this interaction.',
  });

  return false;
}

function createSavedContentEmbed(title, description, sharedTextLink) {
  return createEmbed({
    color: 0xFFFFFF,
    title,
    description: `${description}\n${sharedTextLink}`,
  });
}

async function sendSavedContentToUser(
  interaction,
  {
    text,
    fileBaseName,
    title,
    description,
    successTitle,
    successDescription,
    failureDescription,
  },
) {
  const filePath = path.join(TEMP_DIR, `${fileBaseName}_${interaction.id}.txt`);

  try {
    await fs.writeFile(filePath, text, 'utf8');
    const file = new AttachmentBuilder(filePath, {
      name: `${fileBaseName}.txt`,
    });
    const sharedTextLink = await createSharedTextLink(text);
    const savedContentEmbed = createSavedContentEmbed(title, description, sharedTextLink);

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({
        embeds: [savedContentEmbed],
        files: [file],
      });
      return;
    }

    try {
      await interaction.user.send({
        embeds: [savedContentEmbed],
        files: [file],
      });

      await replyWithEmbed(interaction, {
        color: 0x00FF00,
        title: successTitle,
        description: successDescription,
      });
    } catch (error) {
      console.error('Failed to send DM:', error);
      await interaction.reply({
        content: failureDescription,
        embeds: [savedContentEmbed],
        files: [file],
        flags: MessageFlags.Ephemeral,
      });
    }
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

async function handleDeleteMessageInteraction(interaction, messageId) {
  const userId = interaction.user.id;
  const userChatHistory = state.chatHistories[userId];
  const channel = interaction.channel;
  const targetMessage = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;

  const canDeleteOwnSavedMessage = Boolean(userChatHistory?.[messageId]);
  if (canDeleteOwnSavedMessage) {
    delete userChatHistory[messageId];
    await persistStateChange();
    await safeDeleteMessage(interaction.message);
    if (targetMessage) {
      await safeDeleteMessage(targetMessage);
    }
    return;
  }

  try {
    const repliedToMessage = targetMessage?.reference
      ? await targetMessage.channel.messages.fetch(targetMessage.reference.messageId)
      : null;

    if (repliedToMessage?.author?.id === userId) {
      await safeDeleteMessage(interaction.message);
      if (targetMessage) {
        await safeDeleteMessage(targetMessage);
      }
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

async function clearChatHistory(interaction) {
  state.chatHistories[interaction.user.id] = {};
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: 'Chat history cleared!',
  });
}

async function handleClearMemoryCommand(interaction) {
  const serverChatHistoryEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.serverChatHistory : false;
  if (serverChatHistoryEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Clearing chat history is not enabled for this server, Server-Wide chat history is active.',
    );
  }

  return clearChatHistory(interaction);
}

async function alwaysRespond(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    return replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'Feature Disabled in DMs',
      description: 'This feature is disabled in direct messages.',
    });
  }

  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  if (!state.activeUsersInChannels[channelId]) {
    state.activeUsersInChannels[channelId] = {};
  }

  if (state.activeUsersInChannels[channelId][userId]) {
    delete state.activeUsersInChannels[channelId][userId];
  } else {
    state.activeUsersInChannels[channelId][userId] = true;
  }

  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function handleRespondToAllCommand(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  if (enabled) {
    state.alwaysRespondChannels[interaction.channelId] = true;
  } else {
    delete state.alwaysRespondChannels[interaction.channelId];
  }

  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: enabled ? 0x00FF00 : 0xFFA500,
    title: enabled ? 'Bot Response Enabled' : 'Bot Response Disabled',
    description: enabled
      ? 'The bot will now respond to all messages in this channel.'
      : 'The bot will now stop responding to all messages in this channel.',
    flags: undefined,
  });
}

async function toggleChannelChatHistory(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const channelId = interaction.channelId;
  const enabled = interaction.options.getBoolean('enabled');
  const instructions = interaction.options.getString('instructions') || DEFAULT_PERSONALITY;

  if (enabled) {
    state.channelWideChatHistory[channelId] = true;
    state.customInstructions[channelId] = instructions;
  } else {
    delete state.channelWideChatHistory[channelId];
    delete state.customInstructions[channelId];
    delete state.chatHistories[channelId];
  }

  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: enabled ? 0x00FF00 : 0xFFA500,
    title: enabled ? 'Channel History Enabled' : 'Channel History Disabled',
    description: enabled
      ? 'Channel-wide chat history has been enabled.'
      : 'Channel-wide chat history has been disabled.',
    flags: undefined,
  });
}

function getTimeUntilNextReset() {
  const now = new Date();
  const nextReset = new Date();
  nextReset.setHours(0, 0, 0, 0);
  if (nextReset <= now) {
    nextReset.setDate(now.getDate() + 1);
  }

  const timeLeftMillis = nextReset - now;
  const hours = Math.floor(timeLeftMillis / 3_600_000);
  const minutes = Math.floor((timeLeftMillis % 3_600_000) / 60_000);
  const seconds = Math.floor((timeLeftMillis % 60_000) / 1_000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

async function handleStatusCommand(interaction) {
  await interaction.deferReply();
  let intervalId;

  const updateReply = async () => {
    try {
      const [memoryInfo, cpuPercentage] = await Promise.all([mem.info(), cpu.usage()]);
      await interaction.editReply({
        embeds: [createEmbed({
          color: EMBED_COLOR,
          title: 'System Information',
          fields: [
            {
              name: 'Memory (RAM)',
              value: `Total Memory: \`${memoryInfo.totalMemMb}\` MB\nUsed Memory: \`${memoryInfo.usedMemMb}\` MB\nFree Memory: \`${memoryInfo.freeMemMb}\` MB\nPercentage Of Free Memory: \`${memoryInfo.freeMemPercentage}\`%`,
              inline: true,
            },
            {
              name: 'CPU',
              value: `Percentage of CPU Usage: \`${cpuPercentage}\`%`,
              inline: true,
            },
            {
              name: 'Time Until Next Reset',
              value: getTimeUntilNextReset(),
              inline: true,
            },
          ],
          timestamp: true,
        })],
      });
    } catch (error) {
      console.error('Error updating status message:', error);
      clearInterval(intervalId);
    }
  };

  try {
    await updateReply();
    const reply = await interaction.fetchReply();
    await addSettingsButton(reply);
    intervalId = setInterval(updateReply, STATUS_REFRESH_INTERVAL_MS);
    setTimeout(() => clearInterval(intervalId), STATUS_LIFETIME_MS);
  } catch (error) {
    console.error('Error in handleStatusCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while fetching system status.',
      embeds: [],
      components: [],
    }).catch(async () => {
      await interaction.reply({
        content: 'An error occurred while fetching system status.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    });
  }
}

async function handleBlacklistCommand(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const userId = interaction.options.getUser('user').id;
  const guildId = interaction.guild.id;
  getServerSettings(guildId);

  if (!state.blacklistedUsers[guildId].includes(userId)) {
    state.blacklistedUsers[guildId].push(userId);
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'User Blacklisted',
      description: `<@${userId}> has been blacklisted.`,
      flags: undefined,
    });
  }

  return replyWithEmbed(interaction, {
    color: 0xFFA500,
    title: 'User Already Blacklisted',
    description: `<@${userId}> is already blacklisted.`,
    flags: undefined,
  });
}

async function handleWhitelistCommand(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const userId = interaction.options.getUser('user').id;
  const guildId = interaction.guild.id;
  getServerSettings(guildId);

  const index = state.blacklistedUsers[guildId].indexOf(userId);
  if (index > -1) {
    state.blacklistedUsers[guildId].splice(index, 1);
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'User Whitelisted',
      description: `<@${userId}> has been removed from the blacklist.`,
      flags: undefined,
    });
  }

  return replyWithEmbed(interaction, {
    color: 0xFFA500,
    title: 'User Not Found',
    description: `<@${userId}> is not in the blacklist.`,
    flags: undefined,
  });
}

async function handleCustomPersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (serverCustomEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Custom personality is not enabled for this server, Server-Wide personality is active.',
    );
  }

  return interaction.showModal(buildCustomPersonalityModal());
}

async function handleRemovePersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (serverCustomEnabled) {
    return replyFeatureDisabled(
      interaction,
      'Custom personality is not enabled for this server, Server-Wide personality is active.',
    );
  }

  delete state.customInstructions[interaction.user.id];
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
  const userId = interaction.user.id;
  const currentPreference = getUserResponsePreference(userId);
  state.userResponsePreference[userId] = currentPreference === 'Normal' ? 'Embedded' : 'Normal';
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

  state.userGeminiToolPreferences[interaction.user.id] = {
    ...currentPreferences,
    [toolName]: !currentPreferences[toolName],
  };
  await persistStateChange();
  return updateGeneralSettingsView(interaction);
}

async function toggleServerWideChatHistory(interaction) {
  if (!(await ensureGuildInteraction(interaction))) {
    return;
  }

  const guildId = interaction.guild.id;
  const settings = getServerSettings(guildId);
  settings.serverChatHistory = !settings.serverChatHistory;
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
  settings.customServerPersonality = !settings.customServerPersonality;
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
  settings.serverResponsePreference = !settings.serverResponsePreference;
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
  settings.settingsSaveButton = !settings.settingsSaveButton;
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

  state.chatHistories[guildId] = {};
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
  settings.responseStyle = settings.responseStyle === 'Embedded' ? 'Normal' : 'Embedded';
  await persistStateChange();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Server Response Style Updated',
    description: `Server response style updated to: ${settings.responseStyle}`,
  });
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    state.customInstructions[interaction.user.id] = interaction.fields.getTextInputValue('custom-personality-input').trim();
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'Success',
      description: 'Custom Personality Instructions Saved!',
    });
  }

  if (interaction.customId === 'custom-server-personality-modal') {
    state.customInstructions[interaction.guild.id] = interaction.fields
      .getTextInputValue('custom-server-personality-input')
      .trim();
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'Success',
      description: 'Custom Server Personality Instructions Saved!',
    });
  }
}

export async function handleCommandInteraction(interaction) {
  const handlers = {
    respond_to_all: handleRespondToAllCommand,
    toggle_channel_chat_history: toggleChannelChatHistory,
    whitelist: handleWhitelistCommand,
    blacklist: handleBlacklistCommand,
    clear_memory: handleClearMemoryCommand,
    settings: showSettings,
    server_settings: async (commandInteraction) => {
      if (!(await requireGuildAdmin(commandInteraction))) {
        return;
      }
      return showDashboard(commandInteraction);
    },
    status: handleStatusCommand,
  };

  const handler = handlers[interaction.commandName];
  if (handler) {
    await handler(interaction);
    return;
  }

  console.warn(`Unknown command: ${interaction.commandName}`);
}

export async function handleButtonInteraction(interaction) {
  if (!(await ensureInteractionNotBlacklisted(interaction))) {
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
    back_to_main_settings: (buttonInteraction) => showSettings(buttonInteraction, true),
    'clear-memory': handleClearMemoryCommand,
    'always-respond': alwaysRespond,
    'custom-personality': handleCustomPersonalityCommand,
    'remove-personality': handleRemovePersonalityCommand,
    'toggle-response-mode': toggleUserResponsePreference,
    'toggle-gemini-tool-': toggleUserGeminiTool,
    'download-conversation': downloadConversation,
    download_message: downloadMessage,
    'general-settings': updateGeneralSettingsView,
  };

  if (interaction.customId.startsWith('delete_message-')) {
    const messageId = interaction.customId.replace('delete_message-', '');
    await handleDeleteMessageInteraction(interaction, messageId);
    return;
  }

  for (const [key, handler] of Object.entries(buttonHandlers)) {
    if (interaction.customId.startsWith(key)) {
      await handler(interaction);
      return;
    }
  }
}

export async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommandInteraction(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
}
