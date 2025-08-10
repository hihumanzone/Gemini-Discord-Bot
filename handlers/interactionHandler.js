import { MessageFlags, ChannelType, TextInputBuilder, TextInputStyle, ModalBuilder, ActionRowBuilder, AttachmentBuilder } from 'discord.js';
import { state, TEMP_DIR, getHistory } from '../botManager.js';
import { createErrorEmbed, createSuccessEmbed, createWarningEmbed } from '../utils/embedUtils.js';
import fs from 'fs/promises';
import path from 'path';

export async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-personality-input');
      state.customInstructions[interaction.user.id] = customInstructionsInput.trim();

      const embed = createSuccessEmbed('Success', 'Custom Personality Instructions Saved!');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'custom-server-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-server-personality-input');
      state.customInstructions[interaction.guild.id] = customInstructionsInput.trim();

      const embed = createSuccessEmbed('Success', 'Custom Server Personality Instructions Saved!');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.log(error.message);
    }
  }
}

export async function handleCustomPersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!serverCustomEnabled) {
    await setCustomPersonality(interaction);
  } else {
    const embed = createWarningEmbed('Feature Disabled', 'Custom personality is not enabled for this server, Server-Wide personality is active.');
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
}

export async function handleRemovePersonalityCommand(interaction) {
  const isServerEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!isServerEnabled) {
    await removeCustomPersonality(interaction);
  } else {
    const embed = createWarningEmbed('Feature Disabled', 'Custom personality is not enabled for this server, Server-Wide personality is active.');
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
}

export async function handleToggleResponseMode(interaction) {
  const serverResponsePreferenceEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.serverResponsePreference : false;
  if (!serverResponsePreferenceEnabled) {
    const { toggleUserResponsePreference } = await import('./settingsHandler.js');
    await toggleUserResponsePreference(interaction);
  } else {
    const embed = createWarningEmbed('Feature Disabled', 'Toggling Response Mode is not enabled for this server, Server-Wide Response Mode is active.');
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
}

export async function setCustomPersonality(interaction) {
  const customId = 'custom-personality-input';
  const title = 'Enter Custom Personality Instructions';

  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel("What should the bot's personality be like?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter the custom instructions here...")
    .setMinLength(10)
    .setMaxLength(4000);

  const modal = new ModalBuilder()
    .setCustomId('custom-personality-modal')
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

export async function removeCustomPersonality(interaction) {
  try {
    delete state.customInstructions[interaction.user.id];
    const embed = createSuccessEmbed('Removed', 'Custom personality instructions removed!');

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}

export async function downloadConversation(interaction) {
  try {
    const userId = interaction.user.id;
    const conversationHistory = getHistory(userId);

    if (!conversationHistory || conversationHistory.length === 0) {
      const embed = createWarningEmbed('No History', 'No conversation history found.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let conversationText = conversationHistory.map(entry => {
      const role = entry.role === 'user' ? '[User]' : '[Model]';
      const content = entry.parts.map(c => c.text).join('\n');
      return `${role}:\n${content}\n\n`;
    }).join('');

    const tempFileName = path.join(TEMP_DIR, `conversation_${interaction.id}.txt`);
    await fs.writeFile(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, {
      name: 'conversation_history.txt'
    });

    try {
      if (interaction.channel.type === ChannelType.DM) {
        await interaction.reply({
          content: "> `Here's your conversation history:`",
          files: [file]
        });
      } else {
        await interaction.user.send({
          content: "> `Here's your conversation history:`",
          files: [file]
        });
        const dmSentEmbed = createSuccessEmbed('History Sent', 'Your conversation history has been sent to your DMs.');
        await interaction.reply({
          embeds: [dmSentEmbed],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`Failed to send DM: ${error}`);
      const failDMEmbed = createErrorEmbed('Delivery Failed', 'Failed to send the conversation history to your DMs.');
      await interaction.reply({
        embeds: [failDMEmbed],
        files: [file],
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await fs.unlink(tempFileName);
    }
  } catch (error) {
    console.log(`Failed to download conversation: ${error.message}`);
  }
}

export async function downloadMessage(interaction) {
  try {
    const message = interaction.message;
    let textContent = message.content;
    if (!textContent && message.embeds.length > 0) {
      textContent = message.embeds[0].description;
    }

    if (!textContent) {
      const emptyEmbed = createErrorEmbed('Empty Message', 'The message is empty..?');
      await interaction.reply({
        embeds: [emptyEmbed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const tempFileName = path.join(TEMP_DIR, `message_${interaction.id}.txt`);
    await fs.writeFile(tempFileName, textContent, 'utf8');

    const file = new AttachmentBuilder(tempFileName, {
      name: 'message_content.txt'
    });

    try {
      if (interaction.channel.type === ChannelType.DM) {
        await interaction.reply({
          content: "> `Here's the message content:`",
          files: [file]
        });
      } else {
        await interaction.user.send({
          content: "> `Here's the message content:`",
          files: [file]
        });
        const dmSentEmbed = createSuccessEmbed('Message Sent', 'The message content has been sent to your DMs.');
        await interaction.reply({
          embeds: [dmSentEmbed],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`Failed to send DM: ${error}`);
      const failDMEmbed = createErrorEmbed('Delivery Failed', 'Failed to send the message content to your DMs.');
      await interaction.reply({
        embeds: [failDMEmbed],
        files: [file],
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await fs.unlink(tempFileName);
    }
  } catch (error) {
    console.log(`Failed to download message: ${error.message}`);
  }
}

export async function downloadServerConversation(interaction) {
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
    const conversationHistory = getHistory(serverId);

    if (!conversationHistory || conversationHistory.length === 0) {
      const embed = createWarningEmbed('No History', 'No server-wide conversation history found.');
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let conversationText = conversationHistory.map(entry => {
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
        const dmSentEmbed = createSuccessEmbed('History Sent', 'Server-wide conversation history has been sent to your DMs.');
        await interaction.reply({
          embeds: [dmSentEmbed],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`Failed to send DM: ${error}`);
      const failDMEmbed = createErrorEmbed('Delivery Failed', 'Failed to send the server-wide conversation history to your DMs.');
      await interaction.reply({
        embeds: [failDMEmbed],
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

export async function handleDeleteMessageInteraction(interaction, msgId) {
  const userId = interaction.user.id;
  const userChatHistory = state.chatHistories[userId];
  const channel = interaction.channel;
  const message = channel ? (await channel.messages.fetch(msgId).catch(() => false)) : false;

  if (userChatHistory) {
    if (userChatHistory[msgId]) {
      delete userChatHistory[msgId];
      await deleteMsg();
    } else {
      try {
        const replyingTo = message ? (message.reference ? (await message.channel.messages.fetch(message.reference.messageId)).author.id : 0) : 0;
        if (userId === replyingTo) {
          await deleteMsg();
        } else {
          const embed = createErrorEmbed('Not For You', 'This button is not meant for you.');
          return interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (error) {}
    }
  }

  async function deleteMsg() {
    await interaction.message.delete()
      .catch('Error deleting interaction message: ', console.error);

    if (channel) {
      if (message) {
        message.delete().catch(() => {});
      }
    }
  }
}