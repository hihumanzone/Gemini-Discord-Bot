import { MessageFlags, ChannelType } from 'discord.js';
import config from './config.js';
import { client, activeRequests, state, initialize, initializeBlacklistForGuild } from './botManager.js';

// Import refactored handlers
import {
  handleRespondToAllCommand,
  toggleChannelChatHistory,
  handleBlacklistCommand,
  handleWhitelistCommand,
  handleClearMemoryCommand
} from './handlers/commandHandlers.js';
import { handleStatusCommand } from './handlers/statusHandler.js';
import { registerEventHandlers } from './handlers/eventHandlers.js';
import { 
  showSettings, 
  handleSubButtonInteraction, 
  alwaysRespond, 
  toggleUserResponsePreference, 
  toggleToolPreference 
} from './handlers/settingsHandler.js';
import { 
  toggleServerWideChatHistory, 
  toggleServerPersonality, 
  toggleServerResponsePreference, 
  toggleSettingSaveButton, 
  toggleServerPreference, 
  showDashboard 
} from './handlers/serverHandler.js';
import { 
  handleModalSubmit, 
  handleCustomPersonalityCommand, 
  handleRemovePersonalityCommand, 
  handleToggleResponseMode, 
  downloadConversation, 
  downloadMessage, 
  downloadServerConversation, 
  handleDeleteMessageInteraction 
} from './handlers/interactionHandler.js';
import { createErrorEmbed } from './utils/embedUtils.js';
import { delay, retryOperation } from './tools/others.js';

// Initialize the bot
initialize().catch(console.error);

// Register event handlers
registerEventHandlers();

// <=====[Configuration]=====>
const hexColour = config.hexColour;

// <=====[Interaction Handler]=====>

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

async function handleCommandInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const commandHandlers = {
    respond_to_all: handleRespondToAllCommand,
    toggle_channel_chat_history: toggleChannelChatHistory,
    whitelist: handleWhitelistCommand,
    blacklist: handleBlacklistCommand,
    clear_memory: handleClearMemoryCommand,
    settings: showSettings,
    server_settings: showDashboard,
    status: handleStatusCommand
  };

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction);
  } else {
    console.log(`Unknown command: ${interaction.commandName}`);
  }
}

async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (state.blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
      const embed = createErrorEmbed('Blacklisted', 'You are blacklisted and cannot use this interaction.');
      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // Define button handlers that call the refactored modules
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
    'back_to_main_settings': (interaction) => showSettings(interaction, true),
    'clear-memory': handleClearMemoryCommand,
    'always-respond': alwaysRespond,
    'custom-personality': handleCustomPersonalityCommand,
    'remove-personality': handleRemovePersonalityCommand,
    'toggle-response-mode': handleToggleResponseMode,
    'toggle-tool-preference': toggleToolPreference,
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

// Minimal server handler functions for missing functionality
async function clearServerChatHistory(interaction) {
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
    if (state.chatHistories[serverId]) {
      state.chatHistories[serverId] = [];
    }

    const { createSuccessEmbed } = await import('./utils/embedUtils.js');
    const embed = createSuccessEmbed('Cleared', 'Server-wide conversation history cleared!');
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log('Error clearing server chat history:', error.message);
  }
}

async function serverPersonality(interaction) {
  const { TextInputBuilder, TextInputStyle, ModalBuilder, ActionRowBuilder } = await import('discord.js');
  
  const customId = 'custom-server-personality-input';
  const title = 'Enter Custom Server Personality Instructions';

  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel("What should the bot's personality be like for this server?")
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

// <==========>

const { token } = await import('./botManager.js');
client.login(token);