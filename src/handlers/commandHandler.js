import { getUserSessions, setActiveSession, createSession, renameSession, deleteSession } from "../state/botState.js";
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

  const userId = interaction.user.id;
  const userSessionId = getUserSessions(userId).activeSessionId;
  const targetId = userSessionId === 'default' ? userId : `${userId}_${userSessionId}`;
  
  clearChatHistoryFor(targetId);
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
    await saveStateToFile();
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
  const handlers = {
    unblock: handleWhitelistCommand,
    block: handleBlacklistCommand,
    clear_memory: handleClearMemoryCommand,
    session: handleSessionCommand,
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


async function handleSessionCommand(interaction) {
  const userId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'list') {
    const userState = getUserSessions(userId);
    let sessionList = 'Your Sessions:\n';
    for (const [id, name] of Object.entries(userState.sessions)) {
      const activeMark = id === userState.activeSessionId ? ' [ACTIVE]' : '';
      sessionList += `- **${name}** (ID: ${id})${activeMark}\n`;
    }
    return interaction.reply({ content: sessionList, flags: 64 }); // ephemeral
  }

  if (subcommand === 'switch') {
    const id = interaction.options.getString('id');
    const success = setActiveSession(userId, id);
    if (success) {
      return interaction.reply({ content: `Switched to session: **${id}**.`, flags: 64 });
    }
    return interaction.reply({ content: `Session **${id}** not found.`, flags: 64 });
  }

  if (subcommand === 'create') {
    const name = interaction.options.getString('name');
    const id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_'); // Generate ID
    const success = createSession(userId, id, name);
    if (success) {
      setActiveSession(userId, id);
      return interaction.reply({ content: `Created and switched to new session: **${name}** (ID: ${id}).`, flags: 64 });
    }
    return interaction.reply({ content: `Session with ID **${id}** already exists.`, flags: 64 });
  }

  if (subcommand === 'rename') {
    const id = interaction.options.getString('id');
    const newName = interaction.options.getString('new_name');
    const success = renameSession(userId, id, newName);
    if (success) {
      return interaction.reply({ content: `Session **${id}** renamed to **${newName}**.`, flags: 64 });
    }
    return interaction.reply({ content: `Session **${id}** not found.`, flags: 64 });
  }

  if (subcommand === 'delete') {
    const id = interaction.options.getString('id');
    if (id === 'default') {
      return interaction.reply({ content: `Cannot delete the default session.`, flags: 64 });
    }
    const success = deleteSession(userId, id);
    if (success) {
      return interaction.reply({ content: `Session **${id}** deleted.`, flags: 64 });
    }
    return interaction.reply({ content: `Session **${id}** not found.`, flags: 64 });
  }
}
