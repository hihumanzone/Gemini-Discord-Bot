/**
 * Response action button helpers.
 * Consolidates the repeated pattern of conditionally attaching
 * settings, download, and delete buttons to bot response messages.
 */

import { shouldShowActionButtons } from '../state/botState.js';
import {
  addDeleteButton,
  addDownloadButton,
  addSettingsButton,
} from '../ui/messageActions.js';

/**
 * Attach the standard set of action buttons (settings, delete) to a message
 * if the user's preferences allow it.
 *
 * @param {import('discord.js').Message} message - The bot message to attach buttons to.
 * @param {Object} context - Context for resolving button visibility.
 * @param {string|null} context.guildId - The guild ID, or null for DMs.
 * @param {string} context.userId - The user ID.
 * @param {string} context.channelId - The channel ID.
 * @param {Object} [options] - Optional button configuration.
 * @param {string|null} [options.deleteTargetIds=null] - Comma-separated message IDs for the delete button.
 * @param {string|null} [options.deleteHistoryRef=null] - History reference for the delete button.
 * @param {boolean} [options.includeDownload=false] - Whether to include the download/save button.
 * @returns {Promise<import('discord.js').Message>} The updated message (or original if no buttons added).
 */
export async function attachActionButtons(message, context, options = {}) {
  const { guildId, userId, channelId } = context;
  const {
    deleteTargetIds = null,
    deleteHistoryRef = null,
    includeDownload = false,
  } = options;

  if (!shouldShowActionButtons(guildId, userId, channelId)) {
    return message;
  }

  let updated = await addSettingsButton(message);

  if (includeDownload) {
    updated = await addDownloadButton(updated);
  }

  if (deleteTargetIds) {
    updated = await addDeleteButton(updated, deleteTargetIds, deleteHistoryRef);
  }

  return updated;
}

/**
 * Build the standard context object from a Discord message.
 * @param {import('discord.js').Message} message - A Discord message.
 * @returns {{ guildId: string|null, userId: string, channelId: string }}
 */
export function messageToActionContext(message) {
  return {
    guildId: message.guild?.id ?? null,
    userId: message.author.id,
    channelId: message.channelId,
  };
}
