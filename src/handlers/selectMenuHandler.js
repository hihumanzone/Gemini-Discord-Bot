/**
 * String select interaction handlers.
 */

import { setActiveSession } from '../state/botState.js';
import { replyWithEmbed } from '../utils/discord.js';
import { updateSessionSettingsView } from '../ui/settingsViews.js';

export async function handleSelectMenuInteraction(interaction) {
  if (interaction.customId !== 'session-switch-select') {
    return;
  }

  const selectedSessionId = interaction.values?.[0];
  const switched = setActiveSession(interaction.user.id, selectedSessionId);

  if (!switched) {
    await replyWithEmbed(interaction, {
      color: 0xFF0000,
      title: 'Session Not Found',
      description: 'The selected session no longer exists.',
    });
    return;
  }

  await updateSessionSettingsView(interaction, selectedSessionId);
}
