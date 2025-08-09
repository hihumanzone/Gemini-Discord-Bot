import { EmbedBuilder } from 'discord.js';
import osu from 'node-os-utils';
import config from '../config.js';

const { mem, cpu } = osu;
const { hexColour } = config;

/**
 * Handle the status command
 */
export async function handleStatusCommand(interaction) {
  try {
    await interaction.deferReply();

    let interval;

    const updateMessage = async () => {
      try {
        const [{
          totalMemMb,
          usedMemMb,
          freeMemMb,
          freeMemPercentage
        }, cpuPercentage] = await Promise.all([
          mem.info(),
          cpu.usage()
        ]);

        const now = new Date();
        const nextReset = new Date();
        nextReset.setHours(0, 0, 0, 0);
        if (nextReset <= now) {
          nextReset.setDate(now.getDate() + 1);
        }
        const timeLeftMillis = nextReset - now;
        const hours = Math.floor(timeLeftMillis / 3600000);
        const minutes = Math.floor((timeLeftMillis % 3600000) / 60000);
        const seconds = Math.floor((timeLeftMillis % 60000) / 1000);
        const timeLeft = `${hours}h ${minutes}m ${seconds}s`;

        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle('System Information')
          .addFields({
            name: 'Memory (RAM)',
            value: `Total Memory: \`${totalMemMb}\` MB\nUsed Memory: \`${usedMemMb}\` MB\nFree Memory: \`${freeMemMb}\` MB\nPercentage Of Free Memory: \`${freeMemPercentage}\`%`,
            inline: true
          }, {
            name: 'CPU',
            value: `Percentage of CPU Usage: \`${cpuPercentage}\`%`,
            inline: true
          }, {
            name: 'Time Until Next Reset',
            value: timeLeft,
            inline: true
          })
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed]
        });
      } catch (error) {
        console.error('Error updating message:', error);
        if (interval) clearInterval(interval);
      }
    };

    await updateMessage();

    const message = await interaction.fetchReply();
    // Note: Import addSettingsButton from ../utils/buttonUtils.js when needed
    // await addSettingsButton(message);

    interval = setInterval(updateMessage, 2000);

    setTimeout(() => {
      clearInterval(interval);
    }, 30000);

  } catch (error) {
    console.error('Error in handleStatusCommand function:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: 'An error occurred while fetching system status.',
        embeds: [],
        components: []
      });
    } else {
      await interaction.reply({
        content: 'An error occurred while fetching system status.',
        ephemeral: true
      });
    }
  }
}