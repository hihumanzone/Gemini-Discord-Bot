/**
 * Validation Utilities
 * Common validation and permission checking functions
 */

import {
  ChannelType,
  PermissionsBitField,
  MessageFlags,
} from 'discord.js';

import { state, initializeBlacklistForGuild } from '../botManager.js';
import { createErrorEmbed } from './embedUtils.js';

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string|null} error - Error message if validation failed
 */

/**
 * Checks if interaction is in a server (not DM)
 * @param {Interaction} interaction - Discord interaction
 * @returns {ValidationResult} Validation result
 */
export function requireServer(interaction) {
  if (interaction.channel?.type === ChannelType.DM || !interaction.guild) {
    return {
      valid: false,
      error: 'This command can only be used in a server.'
    };
  }
  return { valid: true, error: null };
}

/**
 * Checks if user is an administrator
 * @param {Interaction} interaction - Discord interaction
 * @returns {ValidationResult} Validation result
 */
export function requireAdmin(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return {
      valid: false,
      error: 'You need to be an admin to use this command.'
    };
  }
  return { valid: true, error: null };
}

/**
 * Checks if user is blacklisted
 * @param {Interaction} interaction - Discord interaction
 * @returns {ValidationResult} Validation result
 */
export function checkBlacklist(interaction) {
  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (state.blacklistedUsers[interaction.guild.id]?.includes(interaction.user.id)) {
      return {
        valid: false,
        error: 'You are blacklisted and cannot use this interaction.'
      };
    }
  }
  return { valid: true, error: null };
}

/**
 * Validates an interaction with multiple checks
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Validation options
 * @param {boolean} options.requireServer - Require server context
 * @param {boolean} options.requireAdmin - Require admin permissions
 * @param {boolean} options.checkBlacklist - Check if user is blacklisted
 * @returns {Promise<boolean>} True if all validations passed
 */
export async function validateInteraction(interaction, options = {}) {
  const checks = [];
  
  if (options.checkBlacklist !== false) {
    checks.push(checkBlacklist(interaction));
  }
  
  if (options.requireServer) {
    checks.push(requireServer(interaction));
  }
  
  if (options.requireAdmin) {
    checks.push(requireAdmin(interaction));
  }
  
  for (const result of checks) {
    if (!result.valid) {
      await interaction.reply({
        embeds: [createErrorEmbed('Error', result.error)],
        flags: MessageFlags.Ephemeral
      });
      return false;
    }
  }
  
  return true;
}

/**
 * Validates a message author
 * @param {Message} message - Discord message
 * @returns {ValidationResult} Validation result
 */
export function validateMessageAuthor(message) {
  if (message.guild) {
    initializeBlacklistForGuild(message.guild.id);
    if (state.blacklistedUsers[message.guild.id]?.includes(message.author.id)) {
      return {
        valid: false,
        error: 'You are blacklisted and cannot use this bot.'
      };
    }
  }
  return { valid: true, error: null };
}

/**
 * Checks if a feature is enabled for a server
 * @param {string} guildId - Guild ID
 * @param {string} feature - Feature name in serverSettings
 * @returns {boolean} Whether the feature is enabled
 */
export function isFeatureEnabled(guildId, feature) {
  if (!guildId) return false;
  return state.serverSettings[guildId]?.[feature] ?? false;
}

/**
 * Gets the appropriate history ID based on settings
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {string} guildId - Guild ID (optional)
 * @returns {string} The history ID to use
 */
export function getHistoryId(userId, channelId, guildId) {
  if (!guildId) return userId;
  
  const isChannelHistory = state.channelWideChatHistory[channelId];
  const isServerHistory = state.serverSettings[guildId]?.serverChatHistory;
  
  if (isChannelHistory) {
    return isServerHistory ? guildId : channelId;
  }
  return userId;
}

/**
 * Gets the appropriate instructions based on context
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {string} guildId - Guild ID (optional)
 * @returns {string|undefined} Custom instructions if set
 */
export function getInstructions(userId, channelId, guildId) {
  if (!guildId) {
    return state.customInstructions[userId];
  }
  
  if (state.channelWideChatHistory[channelId]) {
    return state.customInstructions[channelId];
  }
  
  if (state.serverSettings[guildId]?.customServerPersonality && state.customInstructions[guildId]) {
    return state.customInstructions[guildId];
  }
  
  return state.customInstructions[userId];
}
