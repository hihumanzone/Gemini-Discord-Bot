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
} from '../state/botState.js';
import { applyEmbedFallback, createStatusEmbed, replyWithEmbed } from '../utils/discord.js';
import { buildSessionSettingsPayload } from '../ui/settingsViews.js';
import { replyWithError, logError } from '../utils/errorHandler.js';
import { persistStateChange } from './interactionHelpers.js';
import {
  ensureUniqueSessionId,
  normalizeSessionName,
  toSessionId,
} from '../services/sessionService.js';

async function replyAfterSessionRefreshFailure(interaction, embedPayload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(applyEmbedFallback(interaction.channel, {
      embeds: [createStatusEmbed(embedPayload)],
      flags: MessageFlags.Ephemeral,
    }));
  }

  return replyWithEmbed(interaction, embedPayload);
}

async function refreshSessionManagerMessage(interaction, selectedSessionId, actionSummary) {
  const payload = buildSessionSettingsPayload(interaction.user.id, selectedSessionId, actionSummary);

  try {
    await interaction.deferUpdate();
    await interaction.editReply(applyEmbedFallback(interaction.channel, payload));
    return true;
  } catch (error) {
    logError('SessionManagerRefresh', error, {
      sessionId: selectedSessionId,
      userId: interaction.user?.id,
    });
    return false;
  }
}

/** Routes a modal submission to its handler based on customId. */
export async function handleModalSubmit(interaction) {
  try {
    // Exact-match modal handlers
    const exactHandlers = {
      'session-create-modal': handleSessionCreate,
      'custom-personality-modal': handleCustomPersonality,
      'custom-server-personality-modal': handleServerPersonality,
      'custom-channel-personality-modal': handleChannelPersonality,
    };

    const exactHandler = exactHandlers[interaction.customId];
    if (exactHandler) {
      return await exactHandler(interaction);
    }

    // Prefix-match modal handlers
    if (interaction.customId.startsWith('session-rename-modal:')) {
      return await handleSessionRename(interaction);
    }
  } catch (error) {
    logError('ModalHandler', error, {
      modalCustomId: interaction.customId,
      userId: interaction.user?.id,
    });
    await replyWithError(interaction, 'Form Error', 'An error occurred while processing this form.');
  }
}

// --- Individual modal handlers ---

async function handleSessionCreate(interaction) {
  const sessionName = normalizeSessionName(interaction.fields.getTextInputValue('session-create-name'));

  if (!sessionName) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Invalid Name',
      description: 'Session name cannot be empty.',
    });
  }

  const userState = getUserSessions(interaction.user.id);
  const sessionId = ensureUniqueSessionId(userState, toSessionId(sessionName));

  const created = createSession(interaction.user.id, sessionId, sessionName);
  if (!created) {
    return replyWithEmbed(interaction, {
      variant: 'error',
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

  return replyAfterSessionRefreshFailure(interaction, {
    variant: 'success',
    title: 'Session Created',
    description: `Created **${sessionName}** and switched to it.\nSession ID: \`${sessionId}\``,
  });
}

async function handleSessionRename(interaction) {
  const sessionId = interaction.customId.slice('session-rename-modal:'.length);

  if (sessionId === 'default') {
    return replyWithEmbed(interaction, {
      variant: 'warning',
      title: 'Rename Not Allowed',
      description: 'The default session cannot be renamed.',
    });
  }

  const newName = normalizeSessionName(interaction.fields.getTextInputValue('session-rename-name'));

  if (!newName) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Invalid Name',
      description: 'New session name cannot be empty.',
    });
  }

  const renamed = renameSession(interaction.user.id, sessionId, newName);
  if (!renamed) {
    return replyWithEmbed(interaction, {
      variant: 'error',
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

  return replyAfterSessionRefreshFailure(interaction, {
    variant: 'success',
    title: 'Session Renamed',
    description: `Session \`${sessionId}\` is now named **${newName}**.`,
  });
}

async function handleCustomPersonality(interaction) {
  setCustomInstruction(
    interaction.user.id,
    interaction.fields.getTextInputValue('custom-personality-input').trim(),
  );
  await persistStateChange();
  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Success',
    description: 'Custom Personality Instructions Saved!',
  });
}

async function handleServerPersonality(interaction) {
  if (!interaction.guildId) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Server Command Only',
      description: 'This form can only be submitted from a server.',
    });
  }

  setCustomInstruction(
    interaction.guildId,
    interaction.fields.getTextInputValue('custom-server-personality-input').trim(),
  );
  await persistStateChange();
  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Success',
    description: 'Custom Server Personality Instructions Saved!',
  });
}

async function handleChannelPersonality(interaction) {
  if (!interaction.channelId) {
    return replyWithEmbed(interaction, {
      variant: 'error',
      title: 'Channel Not Found',
      description: 'This form requires a valid channel context.',
    });
  }

  setCustomInstruction(
    interaction.channelId,
    interaction.fields.getTextInputValue('custom-channel-personality-input').trim(),
  );
  await persistStateChange();
  return replyWithEmbed(interaction, {
    variant: 'success',
    title: 'Success',
    description: 'Custom Channel Personality Instructions Saved!',
  });
}
