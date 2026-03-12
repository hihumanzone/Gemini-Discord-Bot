/**
 * Slash command interaction handlers.
 * Each exported function corresponds to a registered slash command.
 */

import { MessageFlags } from 'discord.js';
import osu from 'node-os-utils';

import {
  addBlacklistedUser,
  clearChatHistoryFor,
  getTimeUntilNextReset,
  removeBlacklistedUser,
  saveStateToFile,
  state,
} from '../state/botState.js';
import {
  EMBED_COLOR,
  STATUS_LIFETIME_MS,
  STATUS_REFRESH_INTERVAL_MS,
} from '../constants.js';
import { addSettingsButton } from '../ui/messageActions.js';
import { showDashboard, showChannelDashboard, showSettings } from '../ui/settingsViews.js';
import { createEmbed, replyWithEmbed } from '../utils/discord.js';
import {
  getClearMemoryDisabledReason,
  requireGuildAdmin,
  replyFeatureDisabled,
} from './interactionHelpers.js';

const { cpu, mem } = osu;

async function handleClearMemoryCommand(interaction) {
  const disabledReason = getClearMemoryDisabledReason(interaction);
  if (disabledReason) {
    return replyFeatureDisabled(interaction, disabledReason);
  }

  clearChatHistoryFor(interaction.user.id);
  await saveStateToFile();

  return replyWithEmbed(interaction, {
    color: 0x00FF00,
    title: 'Chat History Cleared',
    description: 'Chat history cleared!',
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
    channel_settings: async (cmd) => {
      if (!(await requireGuildAdmin(cmd))) {
        return;
      }
      return showChannelDashboard(cmd);
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
