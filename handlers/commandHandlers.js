import {
  MessageFlags,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder
} from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import {
  state,
  TEMP_DIR,
  getHistory,
  initializeBlacklistForGuild
} from '../botManager.js';
import config from '../config.js';

const { defaultPersonality } = config;

/**
 * Handle the respond_to_all command
 */
export async function handleRespondToAllCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({
        embeds: [dmEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({
        embeds: [adminEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelId = interaction.channelId;
    const enabled = interaction.options.getBoolean('enabled');

    if (enabled) {
      state.alwaysRespondChannels[channelId] = true;
      const startRespondEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Bot Response Enabled')
        .setDescription('The bot will now respond to all messages in this channel.');
      await interaction.reply({
        embeds: [startRespondEmbed],
        ephemeral: false
      });
    } else {
      delete state.alwaysRespondChannels[channelId];
      const stopRespondEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('Bot Response Disabled')
        .setDescription('The bot will now stop responding to all messages in this channel.');
      await interaction.reply({
        embeds: [stopRespondEmbed],
        ephemeral: false
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handle the toggle_channel_chat_history command
 */
export async function toggleChannelChatHistory(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({
        embeds: [dmEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({
        embeds: [adminEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelId = interaction.channelId;
    const enabled = interaction.options.getBoolean('enabled');
    const instructions = interaction.options.getString('instructions') || defaultPersonality;

    if (enabled) {
      state.channelWideChatHistory[channelId] = true;
      state.customInstructions[channelId] = instructions;

      const enabledEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Channel History Enabled')
        .setDescription(`Channel-wide chat history has been enabled.`);
      await interaction.reply({
        embeds: [enabledEmbed],
        ephemeral: false
      });
    } else {
      delete state.channelWideChatHistory[channelId];
      delete state.customInstructions[channelId];
      delete state.chatHistories[channelId];

      const disabledEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('Channel History Disabled')
        .setDescription('Channel-wide chat history has been disabled.');
      await interaction.reply({
        embeds: [disabledEmbed],
        ephemeral: false
      });
    }
  } catch (error) {
    console.error('Error in toggleChannelChatHistory:', error);
  }
}

/**
 * Handle the blacklist command
 */
export async function handleBlacklistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({
        embeds: [dmEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({
        embeds: [adminEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    const userId = interaction.options.getUser('user').id;
    const guildId = interaction.guild.id;

    initializeBlacklistForGuild(guildId);

    if (!state.blacklistedUsers[guildId].includes(userId)) {
      state.blacklistedUsers[guildId].push(userId);
      const blacklistedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('User Blacklisted')
        .setDescription(`<@${userId}> has been blacklisted.`);
      await interaction.reply({
        embeds: [blacklistedEmbed]
      });
    } else {
      const alreadyBlacklistedEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('User Already Blacklisted')
        .setDescription(`<@${userId}> is already blacklisted.`);
      await interaction.reply({
        embeds: [alreadyBlacklistedEmbed]
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handle the whitelist command
 */
export async function handleWhitelistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({
        embeds: [dmEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({
        embeds: [adminEmbed],
        flags: MessageFlags.Ephemeral
      });
    }

    const userId = interaction.options.getUser('user').id;
    const guildId = interaction.guild.id;

    initializeBlacklistForGuild(guildId);

    const index = state.blacklistedUsers[guildId].indexOf(userId);
    if (index > -1) {
      state.blacklistedUsers[guildId].splice(index, 1);
      const removedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('User Whitelisted')
        .setDescription(`<@${userId}> has been removed from the blacklist.`);
      await interaction.reply({
        embeds: [removedEmbed]
      });
    } else {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('User Not Found')
        .setDescription(`<@${userId}> is not in the blacklist.`);
      await interaction.reply({
        embeds: [notFoundEmbed]
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handle the clear_memory command
 */
export async function handleClearMemoryCommand(interaction) {
  const serverChatHistoryEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.serverChatHistory : false;
  if (!serverChatHistoryEnabled) {
    await clearChatHistory(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('Feature Disabled')
      .setDescription('Clearing chat history is not enabled for this server, Server-Wide chat history is active.');
    await interaction.reply({
      embeds: [embed]
    });
  }
}

/**
 * Clear chat history for a user
 */
async function clearChatHistory(interaction) {
  try {
    state.chatHistories[interaction.user.id] = {};
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Chat History Cleared')
      .setDescription('Chat history cleared!');
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}