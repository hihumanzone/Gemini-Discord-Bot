import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

import { MESSAGE_TYPING_TIMEOUT_MS } from '../../constants.js';
import { applyEmbedFallback, createStatusEmbed } from '../../utils/discord.js';
import { logServiceError } from '../../utils/errorHandler.js';

function logControlError(operation, error, metadata = {}) {
  logServiceError('StreamingService', error, { operation, ...metadata });
}

export function createStopButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stopGenerating')
      .setLabel('Stop Generating')
      .setStyle(ButtonStyle.Danger),
  );
}

export async function ensureInitialBotMessage(initialBotMessage, originalMessage) {
  try {
    if (initialBotMessage) {
      try {
        await initialBotMessage.edit({ components: [createStopButtonRow()] });
      } catch (error) {
        logControlError('refreshStopButton', error, { messageId: initialBotMessage.id });
      }
      return initialBotMessage;
    }

    return await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      embeds: [createStatusEmbed({
        variant: 'info',
        title: 'Generating Response',
        description: 'Working on your request now. You can stop generation at any time.',
      })],
      components: [createStopButtonRow()],
    }));
  } catch (error) {
    logControlError('ensureInitialBotMessage', error, {
      messageId: originalMessage.id,
      userId: originalMessage.author?.id,
    });
    throw error;
  }
}

export function createCollector(message, originalMessage, onStop = () => {}) {
  let stopped = false;

  const collector = message.createMessageComponentCollector({
    filter: (interaction) => interaction.customId === 'stopGenerating',
    time: MESSAGE_TYPING_TIMEOUT_MS,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id === originalMessage.author.id) {
      stopped = true;
      collector.stop('user-stopped');
      await onStop(interaction);
      await interaction.reply(applyEmbedFallback(interaction.channel, {
        embeds: [createStatusEmbed({
          variant: 'warning',
          title: 'Response Stopped',
          description: 'Response generation stopped by the user.',
        })],
        flags: MessageFlags.Ephemeral,
      })).catch((error) => {
        logControlError('collectorStopReply', error, { interactionId: interaction.id });
      });
      return;
    }

    await interaction.reply(applyEmbedFallback(interaction.channel, {
      embeds: [createStatusEmbed({
        variant: 'error',
        title: 'Access Denied',
        description: "It's not for you.",
      })],
      flags: MessageFlags.Ephemeral,
    })).catch((error) => {
      logControlError('collectorAccessDeniedReply', error, { interactionId: interaction.id });
    });
  });

  return {
    collector,
    wasStopped: () => stopped,
  };
}
