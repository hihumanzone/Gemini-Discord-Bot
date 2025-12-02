import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder,
} from 'discord.js';
import fs from 'fs/promises';
import path from 'path';

import config from '../config.js';
import {
  state,
  TEMP_DIR,
  getHistory,
  initializeBlacklistForGuild
} from '../botManager.js';

import { createErrorEmbed, createSuccessEmbed, createWarningEmbed } from '../utils/embedUtils.js';

const defaultPersonality = config.defaultPersonality;

/**
 * Toggles server-wide chat history
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleServerWideChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createErrorEmbed('Server Command Only', 'This command can only be used in a server.')],
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

/**
 * Toggles server personality
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleServerPersonality(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createErrorEmbed('Server Command Only', 'This command can only be used in a server.')],
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

/**
 * Toggles server response preference
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleServerResponsePreference(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createErrorEmbed('Server Command Only', 'This command can only be used in a server.')],
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

/**
 * Toggles settings save button
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleSettingSaveButton(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createErrorEmbed('Server Command Only', 'This command can only be used in a server.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    state.serverSettings[serverId].settingsSaveButton = !state.serverSettings[serverId].settingsSaveButton;
    const statusMessage = `Server-wide "Settings and Save Button" is now \`${state.serverSettings[serverId].settingsSaveButton ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(state.serverSettings[serverId].settingsSaveButton ? 0x00FF00 : 0xFF0000)
      .setTitle('Settings Save Button Toggled')
      .setDescription(statusMessage);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error toggling server-wide settings save button:', error.message);
  }
}

/**
 * Shows server personality modal
 * @param {Interaction} interaction - Discord interaction
 */
export async function serverPersonality(interaction) {
  const customId = 'custom-server-personality-input';
  const title = 'Enter Custom Personality Instructions';

  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel("What should the bot's personality be like?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter the custom instructions here...")
    .setMinLength(10)
    .setMaxLength(4000);

  const modal = new ModalBuilder()
    .setCustomId('custom-server-personality-modal')
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

/**
 * Clears server-wide chat history
 * @param {Interaction} interaction - Discord interaction
 */
export async function clearServerChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createErrorEmbed('Server Command Only', 'This command can only be used in a server.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    if (state.serverSettings[serverId].serverChatHistory) {
      state.chatHistories[serverId] = {};
      await interaction.reply({
        embeds: [createSuccessEmbed('Chat History Cleared', 'Server-wide chat history cleared!')],
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        embeds: [createWarningEmbed('Feature Disabled', 'Server-wide chat history is disabled for this server.')],
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.log('Failed to clear server-wide chat history:', error.message);
  }
}

/**
 * Downloads server conversation history
 * @param {Interaction} interaction - Discord interaction
 */
export async function downloadServerConversation(interaction) {
  try {
    const guildId = interaction.guild.id;
    const conversationHistory = getHistory(guildId);

    if (!conversationHistory || conversationHistory.length === 0) {
      await interaction.reply({
        embeds: [createErrorEmbed('No History Found', 'No server-wide conversation history found.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const conversationText = conversationHistory.map(entry => {
      const role = entry.role === 'user' ? '[User]' : '[Model]';
      const content = entry.parts.map(c => c.text).join('\n');
      return `${role}:\n${content}\n\n`;
    }).join('');

    const tempFileName = path.join(TEMP_DIR, `server_conversation_${interaction.id}.txt`);
    await fs.writeFile(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, {
      name: 'server_conversation_history.txt'
    });

    try {
      if (interaction.channel.type === ChannelType.DM) {
        await interaction.reply({
          content: "> `Here's the server-wide conversation history:`",
          files: [file]
        });
      } else {
        await interaction.user.send({
          content: "> `Here's the server-wide conversation history:`",
          files: [file]
        });
        await interaction.reply({
          embeds: [createSuccessEmbed('History Sent', 'Server-wide conversation history has been sent to your DMs.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`Failed to send DM: ${error}`);
      await interaction.reply({
        embeds: [createErrorEmbed('Delivery Failed', 'Failed to send the server-wide conversation history to your DMs.')],
        files: [file],
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await fs.unlink(tempFileName);
    }
  } catch (error) {
    console.log(`Failed to download server conversation: ${error.message}`);
  }
}

/**
 * Toggles server response preference style
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleServerPreference(interaction) {
  try {
    const guildId = interaction.guild.id;
    if (state.serverSettings[guildId].responseStyle === "Embedded") {
      state.serverSettings[guildId].responseStyle = "Normal";
    } else {
      state.serverSettings[guildId].responseStyle = "Embedded";
    }
    
    await interaction.reply({
      embeds: [createSuccessEmbed('Server Response Style Updated', `Server response style updated to: ${state.serverSettings[guildId].responseStyle}`)],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}
