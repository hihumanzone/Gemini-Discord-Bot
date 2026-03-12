/**
 * Modal submission interaction handlers.
 */

import {
  setCustomInstruction,
  saveStateToFile,
} from '../state/botState.js';
import { replyWithEmbed } from '../utils/discord.js';

/** Routes a modal submission to its handler based on customId. */
export async function handleModalSubmit(interaction) {
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
