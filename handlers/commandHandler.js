import {
  MessageFlags,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} from 'discord.js';

import config from '../config.js';
import {
  state,
  initializeBlacklistForGuild
} from '../botManager.js';

import { createErrorEmbed, createSuccessEmbed, createWarningEmbed } from '../utils/embedUtils.js';
import { showSettings, showDashboard, handleStatusCommand, handleClearMemoryCommand } from './settingsHandler.js';

const defaultPersonality = config.defaultPersonality;

/**
 * Handles respond_to_all command
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleRespondToAllCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({
        embeds: [createErrorEmbed('Command Not Available', 'This command cannot be used in DMs.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Admin Required', 'You need to be an admin to use this command.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelId = interaction.channelId;
    const enabled = interaction.options.getBoolean('enabled');

    if (enabled) {
      state.alwaysRespondChannels[channelId] = true;
      await interaction.reply({
        embeds: [createSuccessEmbed('Bot Response Enabled', 'The bot will now respond to all messages in this channel.')],
        ephemeral: false
      });
    } else {
      delete state.alwaysRespondChannels[channelId];
      await interaction.reply({
        embeds: [createWarningEmbed('Bot Response Disabled', 'The bot will now stop responding to all messages in this channel.')],
        ephemeral: false
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles toggle_channel_chat_history command
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleChannelChatHistory(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({
        embeds: [createErrorEmbed('Command Not Available', 'This command cannot be used in DMs.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Admin Required', 'You need to be an admin to use this command.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelId = interaction.channelId;
    const enabled = interaction.options.getBoolean('enabled');
    const instructions = interaction.options.getString('instructions') || defaultPersonality;

    if (enabled) {
      state.channelWideChatHistory[channelId] = true;
      state.customInstructions[channelId] = instructions;

      await interaction.reply({
        embeds: [createSuccessEmbed('Channel History Enabled', 'Channel-wide chat history has been enabled.')],
        ephemeral: false
      });
    } else {
      delete state.channelWideChatHistory[channelId];
      delete state.customInstructions[channelId];
      delete state.chatHistories[channelId];

      await interaction.reply({
        embeds: [createWarningEmbed('Channel History Disabled', 'Channel-wide chat history has been disabled.')],
        ephemeral: false
      });
    }
  } catch (error) {
    console.error('Error in toggleChannelChatHistory:', error);
  }
}

/**
 * Handles blacklist command
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleBlacklistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({
        embeds: [createErrorEmbed('Command Not Available', 'This command cannot be used in DMs.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Admin Required', 'You need to be an admin to use this command.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const userId = interaction.options.getUser('user').id;
    const guildId = interaction.guild.id;

    initializeBlacklistForGuild(guildId);

    if (!state.blacklistedUsers[guildId].includes(userId)) {
      state.blacklistedUsers[guildId].push(userId);
      await interaction.reply({
        embeds: [createSuccessEmbed('User Blacklisted', `<@${userId}> has been blacklisted.`)]
      });
    } else {
      await interaction.reply({
        embeds: [createWarningEmbed('User Already Blacklisted', `<@${userId}> is already blacklisted.`)]
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles whitelist command
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleWhitelistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({
        embeds: [createErrorEmbed('Command Not Available', 'This command cannot be used in DMs.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Admin Required', 'You need to be an admin to use this command.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const userId = interaction.options.getUser('user').id;
    const guildId = interaction.guild.id;

    initializeBlacklistForGuild(guildId);

    const index = state.blacklistedUsers[guildId].indexOf(userId);
    if (index > -1) {
      state.blacklistedUsers[guildId].splice(index, 1);
      await interaction.reply({
        embeds: [createSuccessEmbed('User Whitelisted', `<@${userId}> has been removed from the blacklist.`)]
      });
    } else {
      await interaction.reply({
        embeds: [createWarningEmbed('User Not Found', `<@${userId}> is not in the blacklist.`)]
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles command interactions
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleCommandInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const commandHandlers = {
    respond_to_all: handleRespondToAllCommand,
    toggle_channel_chat_history: toggleChannelChatHistory,
    whitelist: handleWhitelistCommand,
    blacklist: handleBlacklistCommand,
    clear_memory: handleClearMemoryCommand,
    settings: showSettings,
    server_settings: showDashboard,
    status: handleStatusCommand
  };

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction);
  } else {
    console.log(`Unknown command: ${interaction.commandName}`);
  }
}
