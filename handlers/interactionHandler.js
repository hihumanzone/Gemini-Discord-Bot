import {
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';

import {
  client,
  state,
  initializeBlacklistForGuild
} from '../botManager.js';

import { handleCommandInteraction } from './commandHandler.js';
import { handleModalSubmit } from './settingsHandler.js';
import {
  showSettings,
  editShowSettings,
  handleClearMemoryCommand,
  handleCustomPersonalityCommand,
  handleRemovePersonalityCommand,
  handleToggleResponseMode,
  downloadConversation,
  downloadMessage,
  alwaysRespond,
  handleSubButtonInteraction,
} from './settingsHandler.js';

import {
  toggleServerWideChatHistory,
  toggleServerPersonality,
  toggleServerResponsePreference,
  toggleSettingSaveButton,
  serverPersonality,
  clearServerChatHistory,
  downloadServerConversation,
  toggleServerPreference,
} from './serverSettingsHandler.js';

import { createErrorEmbed } from '../utils/embedUtils.js';

/**
 * Registers interaction handlers for buttons, modals, and commands
 */
export function registerInteractionHandler() {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommandInteraction(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (error) {
      console.error('Error handling interaction:', error.message);
    }
  });
}

/**
 * Handles button interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (state.blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Blacklisted', 'You are blacklisted and cannot use this interaction.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const buttonHandlers = {
    'server-chat-history': toggleServerWideChatHistory,
    'clear-server': clearServerChatHistory,
    'settings-save-buttons': toggleSettingSaveButton,
    'custom-server-personality': serverPersonality,
    'toggle-server-personality': toggleServerPersonality,
    'download-server-conversation': downloadServerConversation,
    'response-server-mode': toggleServerPreference,
    'toggle-response-server-mode': toggleServerResponsePreference,
    'settings': showSettings,
    'back_to_main_settings': editShowSettings,
    'clear-memory': handleClearMemoryCommand,
    'always-respond': alwaysRespond,
    'custom-personality': handleCustomPersonalityCommand,
    'remove-personality': handleRemovePersonalityCommand,
    'toggle-response-mode': handleToggleResponseMode,
    'download-conversation': downloadConversation,
    'download_message': downloadMessage,
    'general-settings': handleSubButtonInteraction,
  };

  for (const [key, handler] of Object.entries(buttonHandlers)) {
    if (interaction.customId.startsWith(key)) {
      await handler(interaction);
      return;
    }
  }

  if (interaction.customId.startsWith('delete_message-')) {
    const msgId = interaction.customId.replace('delete_message-', '');
    await handleDeleteMessageInteraction(interaction, msgId);
  }
}

/**
 * Handles delete message button interaction
 * @param {Interaction} interaction - Discord interaction
 * @param {string} msgId - Message ID to delete
 */
async function handleDeleteMessageInteraction(interaction, msgId) {
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
          return interaction.reply({
            embeds: [createErrorEmbed('Not For You', 'This button is not meant for you.')],
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
