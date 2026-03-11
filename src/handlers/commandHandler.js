/**
 * Slash command interaction handlers.
 * Each exported function corresponds to a registered slash command.
 */

import { ChannelType, MessageFlags } from 'discord.js';
import osu from 'node-os-utils';

import {
  addBlacklistedUser,
  clearChatHistoryFor,
  getServerSettings,
  getTimeUntilNextReset,
  removeBlacklistedUser,
  saveStateToFile,
  setAlwaysRespondChannel,
  setChannelWideChatHistory,
  state,
} from '../state/botState.js';
import {
  DEFAULT_PERSONALITY,
  EMBED_COLOR,
  STATUS_LIFETIME_MS,
  STATUS_REFRESH_INTERVAL_MS,
} from '../constants.js';
import { addSettingsButton } from '../ui/messageActions.js';
import { showDashboard, showSettings } from '../ui/settingsViews.js';
import { createEmbed, replyWithEmbed } from '../utils/discord.js';
import { requireGuildAdmin, replyFeatureDisabled } from './interactionHelpers.js';

const { cpu, mem } = osu;

async function handleRespondToAllCommand(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  setAlwaysRespondChannel(interaction.channelId, enabled);
  await saveStateToFile();

  return replyWithEmbed(interaction, {
    color: enabled ? 0x00FF00 : 0xFFA500,
    title: enabled ? 'Bot Response Enabled' : 'Bot Response Disabled',
    description: enabled
      ? 'The bot will now respond to all messages in this channel.'
      : 'The bot will now stop responding to all messages in this channel.',
    flags: undefined,
  });
}

async function handleClearMemoryCommand(interaction) {
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
  await saveStateToFile();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: 'Chat history cleared!',
  });
}

async function handleToggleChannelChatHistory(interaction) {
  if (!(await requireGuildAdmin(interaction))) {
    return;
  }

  const channelId = interaction.channelId;
  const enabled = interaction.options.getBoolean('enabled');
  const instructions = interaction.options.getString('instructions') || DEFAULT_PERSONALITY;

  setChannelWideChatHistory(channelId, enabled, instructions);
  await saveStateToFile();

  return replyWithEmbed(interaction, {
    color: enabled ? 0x00FF00 : 0xFFA500,
    title: enabled ? 'Channel History Enabled' : 'Channel History Disabled',
    description: enabled
      ? 'Channel-wide chat history has been enabled.'
      : 'Channel-wide chat history has been disabled.',
    flags: undefined,
  });
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

  if (addBlacklistedUser(guildId, userId)) {
    await saveStateToFile();
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

  if (removeBlacklistedUser(guildId, userId)) {
    await saveStateToFile();
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

/** Routes a chat-input command interaction to its handler. */
export async function handleCommandInteraction(interaction) {
  const handlers = {
    respond_to_all: handleRespondToAllCommand,
    toggle_channel_chat_history: handleToggleChannelChatHistory,
    whitelist: handleWhitelistCommand,
    blacklist: handleBlacklistCommand,
    clear_memory: handleClearMemoryCommand,
    settings: showSettings,
    server_settings: async (cmd) => {
      if (!(await requireGuildAdmin(cmd))) {
        return;
      }
      return showDashboard(cmd);
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
