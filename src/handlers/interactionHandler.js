/**
 * Top-level interaction router.
 * Delegates to focused handler modules based on interaction type.
 */

import { handleCommandInteraction } from './commandHandler.js';
import { handleButtonInteraction } from './buttonHandler.js';
import { handleModalSubmit } from './modalHandler.js';
import { handleSelectMenuInteraction } from './selectMenuHandler.js';
import { handleInteractionError } from '../utils/errorHandler.js';

export async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommandInteraction(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    await handleInteractionError('Interaction', error, interaction);
  }
}
