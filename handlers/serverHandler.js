import { MessageFlags, ChannelType, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { state, initializeBlacklistForGuild } from '../botManager.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embedUtils.js';

export async function toggleServerWideChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      const embed = createErrorEmbed('Server Command Only', 'This command can only be used in a server.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    state.serverSettings[serverId].serverChatHistory = !state.serverSettings[serverId].serverChatHistory;
    const statusMessage = `Server-wide Chat History is now \`${state.serverSettings[serverId].serverChatHistory ? "enabled" : "disabled"}\``;

    let warningMessage = "";
    if (state.serverSettings[serverId].serverChatHistory && !state.serverSettings[serverId].customServerPersonality) {
      warningMessage = "\n\n⚠️ **Warning:** Enabling server-side chat history without enhancing server-wide personality management is not recommended. The bot may get confused between its personalities and conversations with different users.";
    }

    const embed = new EmbedBuilder()
      .setColor(state.serverSettings[serverId].serverChatHistory ? 0x00FF00 : 0xFF0000)
      .setTitle('Chat History Toggled')
      .setDescription(statusMessage + warningMessage);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error toggling server-wide chat history:', error.message);
  }
}

export async function toggleServerPersonality(interaction) {
  try {
    if (!interaction.guild) {
      const embed = createErrorEmbed('Server Command Only', 'This command can only be used in a server.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    state.serverSettings[serverId].customServerPersonality = !state.serverSettings[serverId].customServerPersonality;
    const statusMessage = `Server-wide Personality is now \`${state.serverSettings[serverId].customServerPersonality ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(state.serverSettings[serverId].customServerPersonality ? 0x00FF00 : 0xFF0000)
      .setTitle('Server Personality Toggled')
      .setDescription(statusMessage);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error toggling server-wide personality:', error.message);
  }
}

export async function toggleServerResponsePreference(interaction) {
  try {
    if (!interaction.guild) {
      const embed = createErrorEmbed('Server Command Only', 'This command can only be used in a server.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    state.serverSettings[serverId].serverResponsePreference = !state.serverSettings[serverId].serverResponsePreference;
    const statusMessage = `Server-wide Response Following is now \`${state.serverSettings[serverId].serverResponsePreference ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(state.serverSettings[serverId].serverResponsePreference ? 0x00FF00 : 0xFF0000)
      .setTitle('Server Response Preference Toggled')
      .setDescription(statusMessage);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error toggling server-wide response preference:', error.message);
  }
}

export async function toggleSettingSaveButton(interaction) {
  try {
    if (!interaction.guild) {
      const embed = createErrorEmbed('Server Command Only', 'This command can only be used in a server.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    state.serverSettings[serverId].settingSaveButton = !state.serverSettings[serverId].settingSaveButton;
    const statusMessage = `Setting Save Button is now \`${state.serverSettings[serverId].settingSaveButton ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(state.serverSettings[serverId].settingSaveButton ? 0x00FF00 : 0xFF0000)
      .setTitle('Setting Save Button Toggled')
      .setDescription(statusMessage);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error toggling setting save button:', error.message);
  }
}

export async function toggleServerPreference(interaction) {
  try {
    const guildId = interaction.guild.id;
    if (state.serverSettings[guildId].responseStyle === "Embedded") {
      state.serverSettings[guildId].responseStyle = "Normal";
    } else {
      state.serverSettings[guildId].responseStyle = "Embedded";
    }
    const embed = createSuccessEmbed('Server Response Style Updated', `Server response style updated to: ${state.serverSettings[guildId].responseStyle}`);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}

export async function showDashboard(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    const embed = createErrorEmbed('Command Restricted', 'This command cannot be used in DMs.');
    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = createErrorEmbed('Missing Permissions', 'You must be an administrator to use this command.');
    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }

  const serverId = interaction.guild.id;
  initializeBlacklistForGuild(serverId);

  const serverSettings = state.serverSettings[serverId];
  const responseStyle = serverSettings.responseStyle || 'Normal';
  const serverChatHistory = serverSettings.serverChatHistory ? 'Enabled' : 'Disabled';
  const customServerPersonality = serverSettings.customServerPersonality ? 'Enabled' : 'Disabled';
  const serverResponsePreference = serverSettings.serverResponsePreference ? 'Enabled' : 'Disabled';
  const settingSaveButton = serverSettings.settingSaveButton ? 'Enabled' : 'Disabled';

  const dashboardEmbed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle('Server Dashboard')
    .setDescription('Current server settings and configurations.')
    .addFields([
      { name: 'Response Style', value: responseStyle, inline: true },
      { name: 'Chat History', value: serverChatHistory, inline: true },
      { name: 'Server Personality', value: customServerPersonality, inline: true },
      { name: 'Response Preference', value: serverResponsePreference, inline: true },
      { name: 'Setting Save Button', value: settingSaveButton, inline: true },
    ])
    .setTimestamp();

  await interaction.reply({
    embeds: [dashboardEmbed],
    flags: MessageFlags.Ephemeral
  });
}