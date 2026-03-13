/**
 * Modal submission interaction handlers.
 */

import { MessageFlags } from 'discord.js';

import {
  createSession,
  getUserSessions,
  renameSession,
  setActiveSession,
  setCustomInstruction,
  saveStateToFile,
} from '../state/botState.js';
import { createEmbed, replyWithEmbed } from '../utils/discord.js';
import { buildSessionSettingsPayload } from '../ui/settingsViews.js';
import {
  ensureUniqueSessionId,
  normalizeSessionName,
  toSessionId,
} from '../services/sessionService.js';

async function replyOrFollowUpEmbed(interaction, embedPayload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({
      embeds: [createEmbed(embedPayload)],
      flags: MessageFlags.Ephemeral,
    });
  }

  return replyWithEmbed(interaction, embedPayload);
}

async function refreshSessionManagerMessage(interaction, selectedSessionId, actionSummary) {
  const payload = buildSessionSettingsPayload(interaction.user.id, selectedSessionId, actionSummary);

  try {
    await interaction.deferUpdate();
    await interaction.editReply(payload);
    return true;
  } catch (error) {
    console.error('Failed to refresh Session Manager message from modal submit:', error);
    return false;
  }
}

/** Routes a modal submission to its handler based on customId. */
export async function handleModalSubmit(interaction) {
  if (interaction.customId === 'session-create-modal') {
    const sessionName = normalizeSessionName(interaction.fields.getTextInputValue('session-create-name'));

    if (!sessionName) {
      return replyWithEmbed(interaction, {
        color: 0xFF0000,
        title: 'Invalid Name',
        description: 'Session name cannot be empty.',
      });
    }

    const userState = getUserSessions(interaction.user.id);
    const sessionId = ensureUniqueSessionId(userState, toSessionId(sessionName));

    const created = createSession(interaction.user.id, sessionId, sessionName);
    if (!created) {
      return replyWithEmbed(interaction, {
        color: 0xFF0000,
        title: 'Create Failed',
        description: 'A session with that ID already exists. Please try again.',
      });
    }

    setActiveSession(interaction.user.id, sessionId);

    const updated = await refreshSessionManagerMessage(
      interaction,
      sessionId,
      `Created **${sessionName}** (ID: ${sessionId}) and switched to it.`,
    );
    if (updated) {
      return;
    }

    return replyOrFollowUpEmbed(interaction, {
      color: 0x00FF00,
      title: 'Session Created',
      description: `Created **${sessionName}** and switched to it.\nSession ID: \`${sessionId}\``,
    });
  }

  if (interaction.customId.startsWith('session-rename-modal:')) {
    const sessionId = interaction.customId.slice('session-rename-modal:'.length);

    if (sessionId === 'default') {
      return replyWithEmbed(interaction, {
        color: 0xFFA500,
        title: 'Rename Not Allowed',
        description: 'The default session cannot be renamed.',
      });
    }

    const newName = normalizeSessionName(interaction.fields.getTextInputValue('session-rename-name'));

    if (!newName) {
      return replyWithEmbed(interaction, {
        color: 0xFF0000,
        title: 'Invalid Name',
        description: 'New session name cannot be empty.',
      });
    }

    const renamed = renameSession(interaction.user.id, sessionId, newName);
    if (!renamed) {
      return replyWithEmbed(interaction, {
        color: 0xFF0000,
        title: 'Rename Failed',
        description: `Session ID \`${sessionId}\` was not found.`,
      });
    }

    const updated = await refreshSessionManagerMessage(
      interaction,
      sessionId,
      `Renamed session ID ${sessionId} to **${newName}**.`,
    );
    if (updated) {
      return;
    }

    return replyOrFollowUpEmbed(interaction, {
      color: 0x00FF00,
      title: 'Session Renamed',
      description: `Session \`${sessionId}\` is now named **${newName}**.`,
    });
  }

  if (interaction.customId === 'custom-personality-modal') {
    setCustomInstruction(
      interaction.user.id,
      interaction.fields.getTextInputValue('custom-personality-input').trim(),
    );
    await saveStateToFile();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'Success',
      description: 'Custom Personality Instructions Saved!',
    });
  }

  if (interaction.customId === 'custom-server-personality-modal') {
    setCustomInstruction(
      interaction.guild.id,
      interaction.fields.getTextInputValue('custom-server-personality-input').trim(),
    );
    await saveStateToFile();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'Success',
      description: 'Custom Server Personality Instructions Saved!',
    });
  }

  if (interaction.customId === 'custom-channel-personality-modal') {
    setCustomInstruction(
      interaction.channel.id,
      interaction.fields.getTextInputValue('custom-channel-personality-input').trim(),
    );
    await saveStateToFile();
    return replyWithEmbed(interaction, {
      color: 0x00FF00,
      title: 'Success',
      description: 'Custom Channel Personality Instructions Saved!',
    });
  }
}
