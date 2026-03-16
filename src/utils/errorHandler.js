/**
 * Centralized error handling and logging utilities.
 * Provides consistent error logging, user-facing responses, and recovery strategies.
 */

import { MessageFlags } from 'discord.js';
import { applyEmbedFallback, createStatusEmbed } from './discord.js';

/**
 * Log an error with structured context.
 * @param {string} context - Where the error occurred (e.g., "commandHandler")
 * @param {Error|string} error - The error object or message
 * @param {Object} metadata - Optional contextual information
 */
export function logError(context, error, metadata = {}) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[${timestamp}] Error in ${context}:`, {
    message: errorMessage,
    ...(errorStack && { stack: errorStack }),
    ...metadata,
  });
}

/**
 * Create an error embed for user-facing responses.
 * @param {string} title - Embed title
 * @param {string} description - Error description for the user
 * @returns {Object} Embed payload
 */
export function createErrorEmbed(title, description) {
  return createStatusEmbed({
    variant: 'error',
    title,
    description,
  });
}

/**
 * Create a warning embed for non-critical issues.
 * @param {string} title - Embed title
 * @param {string} description - Warning description
 * @returns {Object} Embed payload
 */
export function createWarningEmbed(title, description) {
  return createStatusEmbed({
    variant: 'warning',
    title,
    description,
  });
}

/**
 * Safely send an error response to an interaction.
 * Handles both deferred and non-deferred states.
 * @param {Interaction} interaction - Discord interaction
 * @param {string} title - Error title
 * @param {string} description - Error description
 */
export async function replyWithError(interaction, title, description) {
  try {
    const payload = applyEmbedFallback(interaction.channel, {
      embeds: [createErrorEmbed(title, description)],
      flags: MessageFlags.Ephemeral,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  } catch (error) {
    logError('replyWithError', error, {
      interactionId: interaction.id,
      interactionType: interaction.type,
    });
  }
}

/**
 * Safely send a warning response to an interaction.
 * @param {Interaction} interaction - Discord interaction
 * @param {string} title - Warning title
 * @param {string} description - Warning description
 */
export async function replyWithWarning(interaction, title, description) {
  try {
    const payload = applyEmbedFallback(interaction.channel, {
      embeds: [createWarningEmbed(title, description)],
      flags: MessageFlags.Ephemeral,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  } catch (error) {
    logError('replyWithWarning', error, {
      interactionId: interaction.id,
      interactionType: interaction.type,
    });
  }
}

/**
 * Safely send an error response to a message.
 * @param {Message} message - Discord message
 * @param {string} title - Error title
 * @param {string} description - Error description
 */
export async function replyMessageWithError(message, title, description) {
  try {
    await message.reply(applyEmbedFallback(message.channel, {
      embeds: [createErrorEmbed(title, description)],
    }));
  } catch (error) {
    logError('replyMessageWithError', error, {
      messageId: message.id,
      authorId: message.author?.id,
    });
  }
}

/**
 * Standard error handling for interaction handlers.
 * Logs the error and sends a user-friendly response.
 * @param {string} handlerName - Name of the handler that failed
 * @param {Error|string} error - The error that occurred
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} metadata - Additional context for logging
 */
export async function handleInteractionError(handlerName, error, interaction, metadata = {}) {
  logError(`${handlerName}Handler`, error, {
    interactionId: interaction.id,
    userId: interaction.user?.id,
    guildId: interaction.guild?.id,
    ...metadata,
  });

  await replyWithError(
    interaction,
    'Error',
    'An unexpected error occurred while processing your request. Please try again later.'
  );
}

/**
 * Standard error handling for message handlers.
 * Logs the error and sends a user-friendly response.
 * @param {string} handlerName - Name of the handler that failed
 * @param {Error|string} error - The error that occurred
 * @param {Message} message - Discord message
 * @param {Object} metadata - Additional context for logging
 */
export async function handleMessageError(handlerName, error, message, metadata = {}) {
  logError(`${handlerName}Handler`, error, {
    messageId: message.id,
    userId: message.author?.id,
    guildId: message.guild?.id,
    ...metadata,
  });

  await replyMessageWithError(
    message,
    'Error',
    'An unexpected error occurred while processing your message. Please try again later.'
  );
}

/**
 * Log unhandled promise rejection.
 * @param {*} reason - The rejection reason
 */
export function logUnhandledRejection(reason) {
  logError('UnhandledRejection', reason instanceof Error ? reason : String(reason), {
    type: typeof reason,
  });
}

/**
 * Log uncaught exception.
 * @param {Error} error - The uncaught error
 */
export function logUncaughtException(error) {
  logError('UncaughtException', error, {
    fatal: true,
  });
}

/**
 * Log Discord client errors.
 * @param {Error} error - The Discord client error
 */
export function logDiscordError(error) {
  logError('DiscordClient', error, {
    errorCode: error.code,
  });
}

/**
 * Log Discord shard errors.
 * @param {Error} error - The shard error
 * @param {number} shardId - The shard ID
 */
export function logShardError(error, shardId) {
  logError('DiscordShard', error, {
    shardId,
    errorCode: error.code,
  });
}

/**
 * Log API/Service errors with context.
 * @param {string} service - Service name (e.g., "GeminiAPI", "DiscordAPI", "FileSystem")
 * @param {Error|string} error - The error
 * @param {Object} metadata - Additional context
 */
export function logServiceError(service, error, metadata = {}) {
  logError(`${service}Error`, error, metadata);
}
