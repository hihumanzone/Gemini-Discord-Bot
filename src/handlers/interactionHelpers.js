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
import {
  createEmbed,
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
    color: 0xFF5555,
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
    color: 0xFF0000,
    title: 'Blacklisted',
    description: 'You are blacklisted and cannot use this interaction.',
  });

  return false;
}

/**
 * Creates an embed for saved/downloaded content with a shared text link.
 */
export function createSavedContentEmbed(title, description, sharedTextLink) {
  return createEmbed({
    color: 0xFFFFFF,
    title,
    description: `${description}\n${sharedTextLink}`,
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

  try {
    await fs.writeFile(filePath, text, 'utf8');
    const file = new AttachmentBuilder(filePath, {
      name: `${fileBaseName}.txt`,
    });
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
