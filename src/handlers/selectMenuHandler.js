/**
 * String select interaction handlers.
 */

import { setActiveSession } from '../state/botState.js';
import { replyWithEmbed } from '../utils/discord.js';
import { updateSessionSettingsView } from '../ui/settingsViews.js';
import { replyWithError, logError } from '../utils/errorHandler.js';

export async function handleSelectMenuInteraction(interaction) {
  try {
    if (interaction.customId !== 'session-switch-select') {
      return;
    }

    const selectedSessionId = interaction.values?.[0];
    const switched = setActiveSession(interaction.user.id, selectedSessionId);

    if (!switched) {
      await replyWithEmbed(interaction, {
        variant: 'error',
        title: 'Session Not Found',
        description: 'The selected session no longer exists.',
      });
      return;
    }

    await updateSessionSettingsView(interaction, selectedSessionId);
  } catch (error) {
    logError('SelectMenuHandler', error, {
      menuCustomId: interaction.customId,
      userId: interaction.user?.id,
    });
    await replyWithError(interaction, 'Selection Error', 'An error occurred while processing your selection.');
  }
}
