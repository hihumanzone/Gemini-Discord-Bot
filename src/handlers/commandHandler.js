/**
 * Slash command interaction handlers.
 * Each exported function corresponds to a registered slash command.
 */

import { MessageFlags } from 'discord.js';
import { OSUtils } from 'node-os-utils';

import {
  addBlacklistedUser,
  clearChatHistoryFor,
  getTimeUntilNextReset,
  removeBlacklistedUser,
} from '../state/botState.js';
import { getActiveSessionDetails } from '../services/sessionService.js';
import {
  EMBED_COLOR,
  STATUS_LIFETIME_MS,
  STATUS_REFRESH_INTERVAL_MS,
} from '../constants.js';
import { addSettingsButton } from '../ui/messageActions.js';
import { showDashboard, showChannelDashboard, showSettings } from '../ui/settingsViews.js';
import { createEmbed, replyWithEmbed } from '../utils/discord.js';
import { replyWithError, logError } from '../utils/errorHandler.js';
import {
  ensureInteractionNotBlacklisted,
  getClearMemoryDisabledReason,
  persistStateChange,
  requireGuildAdmin,
  replyFeatureDisabled,
} from './interactionHelpers.js';

const osu = new OSUtils();

function getMonitorData(result, label) {
  if (!result.success) {
    const reason = result.error?.message || 'Unknown monitor error';
    throw new Error(`Failed to fetch ${label}: ${reason}`);
  }

  return result.data;
}

async function handleClearMemoryCommand(interaction) {
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

async function handleStatusCommand(interaction) {
  await interaction.deferReply();
  let intervalId;

  const updateReply = async () => {
    try {
      const [memoryResult, cpuResult] = await Promise.all([
        osu.memory.info(),
        osu.cpu.usage(),
      ]);
      const memoryInfo = getMonitorData(memoryResult, 'memory info');
      const cpuPercentage = getMonitorData(cpuResult, 'CPU usage');

      await interaction.editReply({
        embeds: [createEmbed({
          color: EMBED_COLOR,
          title: 'System Information',
          fields: [
            {
              name: 'Memory (RAM)',
              value: `Total Memory: \`${memoryInfo.total.toMB().toFixed(0)}\` MB\nUsed Memory: \`${memoryInfo.used.toMB().toFixed(0)}\` MB\nFree Memory: \`${memoryInfo.free.toMB().toFixed(0)}\` MB\nPercentage Of Free Memory: \`${memoryInfo.free.toBytes() > 0 && memoryInfo.total.toBytes() > 0 ? ((memoryInfo.free.toBytes() / memoryInfo.total.toBytes()) * 100).toFixed(2) : '0.00'}\`%`,
              inline: true,
            },
            {
              name: 'CPU',
              value: `Percentage of CPU Usage: \`${cpuPercentage.toFixed(2)}\`%`,
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
      logError('StatusCommandUpdate', error, {
        userId: interaction.user?.id,
        interactionId: interaction.id,
      });
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
    logError('StatusCommand', error, {
      userId: interaction.user?.id,
      interactionId: interaction.id,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content: 'An error occurred while fetching system status.',
        embeds: [],
        components: [],
      });
      return;
    }

    await interaction.reply({
      content: 'An error occurred while fetching system status.',
      embeds: [],
      flags: MessageFlags.Ephemeral,
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
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'User Blocked',
      description: `<@${userId}> has been blocked.`,
      flags: undefined,
    });
  }

  return replyWithEmbed(interaction, {
    color: 0xFFA500,
    title: 'User Already Blocked',
    description: `<@${userId}> is already blocked.`,
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
    await persistStateChange();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'User Unblocked',
      description: `<@${userId}> has been removed from the block list.`,
      flags: undefined,
    });
  }

  return replyWithEmbed(interaction, {
    color: 0xFFA500,
    title: 'User Not Found',
    description: `<@${userId}> is not in the block list.`,
    flags: undefined,
  });
}

/** Routes a chat-input command interaction to its handler. */
export async function handleCommandInteraction(interaction) {
  try {
    if (!(await ensureInteractionNotBlacklisted(interaction))) {
      return;
    }

    const handlers = {
      unblock: handleWhitelistCommand,
      block: handleBlacklistCommand,
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

    logError('Command', `Unknown command: ${interaction.commandName}`, {
      commandName: interaction.commandName,
    });
  } catch (error) {
    logError('CommandHandler', error, {
      commandName: interaction.commandName,
      userId: interaction.user?.id,
    });
    await replyWithError(interaction, 'Command Error', 'An error occurred while running this command.');
  }
}

