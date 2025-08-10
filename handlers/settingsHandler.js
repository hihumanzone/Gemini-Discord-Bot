import { MessageFlags, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { state, initializeBlacklistForGuild, getUserResponsePreference, getUserToolPreference } from '../botManager.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embedUtils.js';

export async function showSettings(interaction, edit = false) {
  try {
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

export async function handleSubButtonInteraction(interaction, update = false) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;
  if (!state.activeUsersInChannels[channelId]) {
    state.activeUsersInChannels[channelId] = {};
  }
  const responseMode = getUserResponsePreference(userId);
  const toolMode = getUserToolPreference(userId);
  
  // Import shouldDisplayPersonalityButtons from config
  const config = await import('../config.js');
  const shouldDisplayPersonalityButtons = config.default.shouldDisplayPersonalityButtons;
  
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
        customId: 'toggle-tool-preference',
        label: `Tool: ${toolMode}`,
        emoji: '🛠️',
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

export async function alwaysRespond(interaction) {
  try {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    if (interaction.channel.type === ChannelType.DM) {
      const dmDisabledEmbed = createErrorEmbed('Feature Disabled in DMs', 'This feature is disabled in direct messages.');
      await interaction.reply({
        embeds: [dmDisabledEmbed],
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

export async function toggleToolPreference(interaction) {
  try {
    const userId = interaction.user.id;
    const currentPreference = getUserToolPreference(userId);

    const options = ['Google Search with URL Context', 'Code Execution'];
    const currentIndex = options.indexOf(currentPreference);
    const nextIndex = (currentIndex + 1) % options.length;
    state.userToolPreference[userId] = options[nextIndex];

    await handleSubButtonInteraction(interaction, true);
  } catch (error) {
    console.log(error.message);
  }
}