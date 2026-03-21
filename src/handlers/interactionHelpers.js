/**
 * Shared helper utilities for interaction handlers.
 * Provides common guard checks, state persistence, and content delivery helpers.
 */

import fs from 'fs/promises';
import path from 'path';

import { AttachmentBuilder, ChannelType, MessageFlags } from 'discord.js';

import { TEMP_DIR } from '../core/paths.js';
import {
  getChannelSettings,
  getServerSettings,
  saveStateToFile,
  isUserBlacklisted,
} from '../state/botState.js';
import { createSharedTextLink } from '../services/textSharingService.js';
import { logError } from '../utils/errorHandler.js';
import {
  applyEmbedFallback,
  createStatusEmbed,
  ensureAdministrator,
  ensureGuildInteraction,
  replyWithEmbed,
} from '../utils/discord.js';

/** Persists the current bot state to disk. */
export async function persistStateChange() {
  await saveStateToFile();
}

/**
 * Ensures the interaction is in a guild and the user is an administrator.
 * Replies with an error embed if either check fails.
 * @returns {Promise<boolean>} True if the user is a guild admin.
 */
export async function requireGuildAdmin(interaction) {
  const inGuild = await ensureGuildInteraction(interaction, 'This command cannot be used in DMs.');
  if (!inGuild) {
    return false;
  }
  return ensureAdministrator(interaction);
}

/**
 * Replies with a "Feature Disabled" embed.
 */
export async function replyFeatureDisabled(interaction, description) {
  return replyWithEmbed(interaction, {
    variant: 'warning',
    title: 'Feature Disabled',
    description,
  });
}

export function getClearMemoryDisabledReason(interaction) {
  const channelId = interaction.channelId ?? interaction.channel?.id;
  if (channelId && getChannelSettings(channelId).channelWideChatHistory) {
    return 'Clearing chat history is not enabled for this channel, channel-wide chat history is active.';
  }

  const guildId = interaction.guild?.id;
  if (guildId && getServerSettings(guildId).serverChatHistory) {
    return 'Clearing chat history is not enabled for this server, server-wide chat history is active.';
  }

  return null;
}

export function getCustomPersonalityDisabledReason(interaction) {
  const channelId = interaction.channelId ?? interaction.channel?.id;
  if (channelId && getChannelSettings(channelId).customChannelPersonality) {
    return 'Custom personality is not enabled for this channel, channel-wide personality is active.';
  }

  const guildId = interaction.guild?.id;
  if (guildId && getServerSettings(guildId).customServerPersonality) {
    return 'Custom personality is not enabled for this server, server-wide personality is active.';
  }

  return null;
}

export function getNanoBananaDisabledReason(interaction) {
  if (getClearMemoryDisabledReason(interaction)) {
    return 'Nano Banana mode is not available while server-wide or channel-wide chat history is active.';
  }

  if (getCustomPersonalityDisabledReason(interaction)) {
    return 'Nano Banana mode is not available while server-wide or channel-wide personality instructions are active.';
  }

  return null;
}

export function getResponseStyleDisabledReason(interaction) {
  const guildId = interaction.guild?.id;
  if (!guildId) return null;

  const channelId = interaction.channelId ?? interaction.channel?.id;
  const channelSetting = channelId ? getChannelSettings(channelId).responseStyle : 'decide';
  if (channelSetting && channelSetting !== 'decide') {
    return 'The response style is locked to the channel-wide preference.';
  }

  const setting = getServerSettings(guildId).responseStyle;
  if (setting && setting !== 'decide') {
    return 'The response style is locked to the server-wide preference.';
  }
  return null;
}

export function getAlwaysRespondDisabledReason(interaction) {
  if (interaction.channel?.type === ChannelType.DM) {
    return 'Always respond is always active in direct messages.';
  }
  const channelId = interaction.channelId ?? interaction.channel?.id;
  if (channelId && getChannelSettings(channelId).alwaysRespond) {
    return 'The bot is configured to always respond in this channel.';
  }
  return null;
}

export function getResponseActionButtonsDisabledReason(interaction) {
  const guildId = interaction.guild?.id;
  if (!guildId) return null;

  const channelId = interaction.channelId ?? interaction.channel?.id;
  const channelSetting = channelId ? getChannelSettings(channelId).settingsSaveButton : 'decide';
  if (channelSetting === 'on') {
    return 'Response action buttons are forced ON by channel settings.';
  }
  if (channelSetting === 'off') {
    return 'Response action buttons are disabled by channel settings.';
  }

  const setting = getServerSettings(guildId).settingsSaveButton;
  if (setting === 'on') {
    return 'Response action buttons are forced ON by server settings.';
  }
  if (setting === 'off') {
    return 'Response action buttons are disabled by server settings.';
  }
  return null;
}

/**
 * Ensures the interaction user is not blacklisted in the current guild.
 * Replies with an error embed if the user is blacklisted.
 * @returns {Promise<boolean>} True if the user is allowed.
 */
export async function ensureInteractionNotBlacklisted(interaction) {
  if (!interaction.guild) {
    return true;
  }

  if (!isUserBlacklisted(interaction.guild.id, interaction.user.id)) {
    return true;
  }

  await replyWithEmbed(interaction, {
    variant: 'error',
    title: 'Blacklisted',
    description: 'You are blacklisted and cannot use this interaction.',
  });

  return false;
}

/**
 * Creates an embed for saved/downloaded content with a shared text link.
 */
export function createSavedContentEmbed(title, description, sharedTextLink) {
  return createStatusEmbed({
    variant: 'primary',
    title,
    description: `${description}\n\n${sharedTextLink}`,
  });
}

/**
 * Writes text to a temp file, uploads a shared link, and delivers the content
 * to the user via DM (or in-channel as a fallback).
 */
export async function sendSavedContentToUser(
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
  const fileName = `${fileBaseName}.txt`;

  try {
    await fs.writeFile(filePath, text, 'utf8');
    const file = new AttachmentBuilder(filePath, { name: fileName });
    const sharedTextLink = await createSharedTextLink(text);
    const savedContentEmbed = createSavedContentEmbed(title, description, sharedTextLink);

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.deferUpdate();
      await interaction.user.send({
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
        variant: 'success',
        title: successTitle,
        description: successDescription,
      });
    } catch (error) {
      logError('SendSavedContentToUserDM', error, {
        userId: interaction.user?.id,
        interactionId: interaction.id,
      });
      await interaction.reply(applyEmbedFallback(interaction.channel, {
        embeds: [
          createStatusEmbed({
            variant: 'warning',
            title: 'DM Delivery Failed',
            description: failureDescription,
          }),
          savedContentEmbed,
        ],
        files: [file],
        flags: MessageFlags.Ephemeral,
      }));
    }
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logError('SendSavedContentToUserCleanup', error, { filePath });
      }
    }
  }
}
