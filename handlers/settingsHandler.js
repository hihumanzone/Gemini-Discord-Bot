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
import osu from 'node-os-utils';
const { mem, cpu } = osu;

import config from '../config.js';
import {
  state,
  TEMP_DIR,
  getHistory,
  getUserResponsePreference,
  initializeBlacklistForGuild
} from '../botManager.js';

import { addSettingsButton, createErrorEmbed, createSuccessEmbed, createWarningEmbed } from '../utils/embedUtils.js';
import { uploadText } from '../utils/fileUtils.js';

const hexColour = config.hexColour;
const defaultPersonality = config.defaultPersonality;
const shouldDisplayPersonalityButtons = config.shouldDisplayPersonalityButtons;

/**
 * Shows the main settings menu
 * @param {Interaction} interaction - Discord interaction
 * @param {boolean} edit - Whether to edit existing message
 */
export async function showSettings(interaction, edit = false) {
  try {
    if (interaction.guild) {
      initializeBlacklistForGuild(interaction.guild.id);
      if (state.blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
        return interaction.reply({
          embeds: [createErrorEmbed('Blacklisted', 'You are blacklisted and cannot use this interaction.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    const mainButtons = [{
        customId: 'clear-memory',
        label: 'Clear Memory',
        emoji: '🧹',
        style: ButtonStyle.Danger
      },
      {
        customId: 'general-settings',
        label: 'General Settings',
        emoji: '⚙️',
        style: ButtonStyle.Secondary
      },
    ];

    const mainButtonsComponents = mainButtons.map(config =>
      new ButtonBuilder()
        .setCustomId(config.customId)
        .setLabel(config.label)
        .setEmoji(config.emoji)
        .setStyle(config.style)
    );

    const mainActionRow = new ActionRowBuilder().addComponents(...mainButtonsComponents);

    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Settings')
      .setDescription('Please choose a category from the buttons below:');
      
    if (edit) {
      await interaction.update({
        embeds: [embed],
        components: [mainActionRow],
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [mainActionRow],
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error('Error showing settings:', error.message);
  }
}

/**
 * Shows settings menu (edit mode)
 * @param {Interaction} interaction - Discord interaction
 */
export async function editShowSettings(interaction) {
  await showSettings(interaction, true);
}

/**
 * Shows the server dashboard settings
 * @param {Interaction} interaction - Discord interaction
 */
export async function showDashboard(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    return interaction.reply({
      embeds: [createErrorEmbed('Command Restricted', 'This command cannot be used in DMs.')],
      flags: MessageFlags.Ephemeral
    });
  }
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({
      embeds: [createErrorEmbed('Administrator Required', 'You need to be an admin to use this command.')],
      flags: MessageFlags.Ephemeral
    });
  }
  initializeBlacklistForGuild(interaction.guild.id);
  
  const buttonConfigs = [{
      customId: "server-chat-history",
      label: "Toggle Server-Wide Conversation History",
      emoji: "📦",
      style: ButtonStyle.Primary,
    },
    {
      customId: "clear-server",
      label: "Clear Server-Wide Memory",
      emoji: "🧹",
      style: ButtonStyle.Danger,
    },
    {
      customId: "settings-save-buttons",
      label: "Toggle Add Settings And Save Button",
      emoji: "🔘",
      style: ButtonStyle.Primary,
    },
    {
      customId: "toggle-server-personality",
      label: "Toggle Server Personality",
      emoji: "🤖",
      style: ButtonStyle.Primary,
    },
    {
      customId: "custom-server-personality",
      label: "Custom Server Personality",
      emoji: "🙌",
      style: ButtonStyle.Primary,
    },
    {
      customId: "toggle-response-server-mode",
      label: "Toggle Server-Wide Responses Style",
      emoji: "✏️",
      style: ButtonStyle.Primary,
    },
    {
      customId: "response-server-mode",
      label: "Server-Wide Responses Style",
      emoji: "📝",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "download-server-conversation",
      label: "Download Server Conversation",
      emoji: "🗃️",
      style: ButtonStyle.Secondary,
    }
  ];

  const allButtons = buttonConfigs.map((config) =>
    new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
  );

  const actionRows = [];
  while (allButtons.length > 0) {
    actionRows.push(
      new ActionRowBuilder().addComponents(allButtons.splice(0, 5))
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Settings')
    .setDescription('Your Server Settings:');
  await interaction.reply({
    embeds: [embed],
    components: actionRows,
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Handles sub-button interactions for general settings
 * @param {Interaction} interaction - Discord interaction
 * @param {boolean} update - Whether to update existing message
 */
export async function handleSubButtonInteraction(interaction, update = false) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;
  if (!state.activeUsersInChannels[channelId]) {
    state.activeUsersInChannels[channelId] = {};
  }
  const responseMode = getUserResponsePreference(userId);
  const subButtonConfigs = {
    'general-settings': [{
        customId: 'always-respond',
        label: `Always Respond: ${state.activeUsersInChannels[channelId][userId] ? 'ON' : 'OFF'}`,
        emoji: '↩️',
        style: ButtonStyle.Secondary
      },
      {
        customId: 'toggle-response-mode',
        label: `Toggle Response Mode: ${responseMode}`,
        emoji: '📝',
        style: ButtonStyle.Secondary
      },
      {
        customId: 'download-conversation',
        label: 'Download Conversation',
        emoji: '🗃️',
        style: ButtonStyle.Secondary
      },
      ...(shouldDisplayPersonalityButtons ? [{
          customId: 'custom-personality',
          label: 'Custom Personality',
          emoji: '🙌',
          style: ButtonStyle.Primary
        },
        {
          customId: 'remove-personality',
          label: 'Remove Personality',
          emoji: '🤖',
          style: ButtonStyle.Danger
        },
      ] : []),
      {
        customId: 'back_to_main_settings',
        label: 'Back',
        emoji: '🔙',
        style: ButtonStyle.Secondary
      },
    ],
  };

  if (update || subButtonConfigs[interaction.customId]) {
    const subButtons = subButtonConfigs[update ? 'general-settings' : interaction.customId].map(config =>
      new ButtonBuilder()
        .setCustomId(config.customId)
        .setLabel(config.label)
        .setEmoji(config.emoji)
        .setStyle(config.style)
    );

    const actionRows = [];
    while (subButtons.length > 0) {
      actionRows.push(new ActionRowBuilder().addComponents(subButtons.splice(0, 5)));
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00FFFF)
          .setTitle(`${update ? 'General Settings' : interaction.customId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`)
          .setDescription('Please choose an option from the buttons below:'),
      ],
      components: actionRows,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Clears chat history for a user
 * @param {Interaction} interaction - Discord interaction
 */
export async function clearChatHistory(interaction) {
  try {
    state.chatHistories[interaction.user.id] = {};
    await interaction.reply({
      embeds: [createSuccessEmbed('Chat History Cleared', 'Chat history cleared!')],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles clear memory command
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleClearMemoryCommand(interaction) {
  const serverChatHistoryEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.serverChatHistory : false;
  if (!serverChatHistoryEnabled) {
    await clearChatHistory(interaction);
  } else {
    await interaction.reply({
      embeds: [createErrorEmbed('Feature Disabled', 'Clearing chat history is not enabled for this server, Server-Wide chat history is active.', 0xFF5555)],
    });
  }
}

/**
 * Handles always respond toggle
 * @param {Interaction} interaction - Discord interaction
 */
export async function alwaysRespond(interaction) {
  try {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({
        embeds: [createErrorEmbed('Feature Disabled in DMs', 'This feature is disabled in direct messages.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!state.activeUsersInChannels[channelId]) {
      state.activeUsersInChannels[channelId] = {};
    }

    if (state.activeUsersInChannels[channelId][userId]) {
      delete state.activeUsersInChannels[channelId][userId];
    } else {
      state.activeUsersInChannels[channelId][userId] = true;
    }

    await handleSubButtonInteraction(interaction, true);
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Sets custom personality via modal
 * @param {Interaction} interaction - Discord interaction
 */
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

/**
 * Removes custom personality
 * @param {Interaction} interaction - Discord interaction
 */
export async function removeCustomPersonality(interaction) {
  try {
    delete state.customInstructions[interaction.user.id];
    await interaction.reply({
      embeds: [createSuccessEmbed('Removed', 'Custom personality instructions removed!')],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles custom personality button
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleCustomPersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!serverCustomEnabled) {
    await setCustomPersonality(interaction);
  } else {
    await interaction.reply({
      embeds: [createErrorEmbed('Feature Disabled', 'Custom personality is not enabled for this server, Server-Wide personality is active.', 0xFF5555)],
      flags: MessageFlags.Ephemeral
    });
  }
}

/**
 * Handles remove personality button
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleRemovePersonalityCommand(interaction) {
  const isServerEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!isServerEnabled) {
    await removeCustomPersonality(interaction);
  } else {
    await interaction.reply({
      embeds: [createErrorEmbed('Feature Disabled', 'Custom personality is not enabled for this server, Server-Wide personality is active.', 0xFF5555)],
      flags: MessageFlags.Ephemeral
    });
  }
}

/**
 * Toggles user response preference
 * @param {Interaction} interaction - Discord interaction
 */
export async function toggleUserResponsePreference(interaction) {
  try {
    const userId = interaction.user.id;
    const currentPreference = getUserResponsePreference(userId);
    state.userResponsePreference[userId] = currentPreference === 'Normal' ? 'Embedded' : 'Normal';
    await handleSubButtonInteraction(interaction, true);
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * Handles toggle response mode button
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleToggleResponseMode(interaction) {
  const serverResponsePreferenceEnabled = interaction.guild ? state.serverSettings[interaction.guild.id]?.serverResponsePreference : false;
  if (!serverResponsePreferenceEnabled) {
    await toggleUserResponsePreference(interaction);
  } else {
    await interaction.reply({
      embeds: [createErrorEmbed('Feature Disabled', 'Toggling Response Mode is not enabled for this server, Server-Wide Response Mode is active.', 0xFF5555)],
      flags: MessageFlags.Ephemeral
    });
  }
}

/**
 * Downloads conversation history
 * @param {Interaction} interaction - Discord interaction
 */
export async function downloadConversation(interaction) {
  try {
    const userId = interaction.user.id;
    const conversationHistory = getHistory(userId);

    if (!conversationHistory || conversationHistory.length === 0) {
      await interaction.reply({
        embeds: [createErrorEmbed('No History Found', 'No conversation history found.')],
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
        await interaction.reply({
          embeds: [createSuccessEmbed('History Sent', 'Your conversation history has been sent to your DMs.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`Failed to send DM: ${error}`);
      await interaction.reply({
        embeds: [createErrorEmbed('Delivery Failed', 'Failed to send the conversation history to your DMs.')],
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

/**
 * Downloads message content
 * @param {Interaction} interaction - Discord interaction
 */
export async function downloadMessage(interaction) {
  try {
    const message = interaction.message;
    let textContent = message.content;
    if (!textContent && message.embeds.length > 0) {
      textContent = message.embeds[0].description;
    }

    if (!textContent) {
      await interaction.reply({
        embeds: [createErrorEmbed('Empty Message', 'The message is empty..?')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const filePath = path.join(TEMP_DIR, `message_content_${interaction.id}.txt`);
    await fs.writeFile(filePath, textContent, 'utf8');

    const attachment = new AttachmentBuilder(filePath, {
      name: 'message_content.txt'
    });

    const initialEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Message Content Downloaded')
      .setDescription(`Here is the content of the message.`);

    let response;
    if (interaction.channel.type === ChannelType.DM) {
      response = await interaction.reply({
        embeds: [initialEmbed],
        files: [attachment],
        withResponse: true
      });
    } else {
      try {
        response = await interaction.user.send({
          embeds: [initialEmbed],
          files: [attachment]
        });
        await interaction.reply({
          embeds: [createSuccessEmbed('Content Sent', 'The message content has been sent to your DMs.')],
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        response = await interaction.reply({
          embeds: [createErrorEmbed('Delivery Failed', 'Failed to send the content to your DMs.')],
          files: [attachment],
          flags: MessageFlags.Ephemeral,
          withResponse: true
        });
      }
    }

    await fs.unlink(filePath);

    const msgUrl = await uploadText(textContent);
    const updatedEmbed = EmbedBuilder.from(response.embeds[0])
      .setDescription(`Here is the content of the message.\n${msgUrl}`);

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.editReply({
        embeds: [updatedEmbed]
      });
    } else {
      await response.edit({
        embeds: [updatedEmbed]
      });
    }

  } catch (error) {
    console.log('Failed to process download: ', error);
  }
}

/**
 * Handles status command
 * @param {Interaction} interaction - Discord interaction
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
    await addSettingsButton(message);

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

/**
 * Handles modal submissions
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-personality-input');
      state.customInstructions[interaction.user.id] = customInstructionsInput.trim();

      await interaction.reply({
        embeds: [createSuccessEmbed('Success', 'Custom Personality Instructions Saved!')],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'custom-server-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-server-personality-input');
      state.customInstructions[interaction.guild.id] = customInstructionsInput.trim();

      await interaction.reply({
        embeds: [createSuccessEmbed('Success', 'Custom Server Personality Instructions Saved!')],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.log(error.message);
    }
  }
}
