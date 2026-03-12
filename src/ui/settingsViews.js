import { ButtonStyle, MessageFlags } from 'discord.js';

import {
  getChannelSettings,
  getServerSettings,
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  isChannelUserActive,
  isUserBlacklisted,
} from '../state/botState.js';
import { DISPLAY_PERSONALITY_BUTTONS } from '../constants.js';
import { buildButtonRows, buildTextModal, createEmbed } from '../utils/discord.js';

const GEMINI_TOOL_BUTTONS = [
  {
    key: 'googleSearch',
    label: 'Google Search',
    emoji: '🔎',
  },
  {
    key: 'urlContext',
    label: 'URL Context',
    emoji: '🔗',
  },
  {
    key: 'codeExecution',
    label: 'Code Execution',
    emoji: '💻',
  },
];

export async function showSettings(interaction, edit = false) {
  if (interaction.guild) {
    if (isUserBlacklisted(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({
        embeds: [createEmbed({
          color: 0xFF0000,
          title: 'Blacklisted',
          description: 'You are blacklisted and cannot use this interaction.',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const rows = buildButtonRows([
    {
      customId: 'clear-memory',
      label: 'Clear Memory',
      emoji: '🧹',
      style: ButtonStyle.Danger,
    },
    {
      customId: 'general-settings',
      label: 'General Settings',
      emoji: '⚙️',
      style: ButtonStyle.Secondary,
    },
  ]);

  const payload = {
    embeds: [createEmbed({
      color: 0x00FFFF,
      title: 'Settings',
      description: 'Please choose a category from the buttons below:',
    })],
    components: rows,
  };

  if (edit) {
    return interaction.update(payload);
  }

  return interaction.reply({
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

export async function updateGeneralSettingsView(interaction) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;
  const alwaysRespondEnabled = isChannelUserActive(channelId, userId);
  const responseMode = getUserResponsePreference(userId);
  const toolPreferences = getUserGeminiToolPreferences(userId);

  const buttonConfigs = [
    {
      customId: 'always-respond',
      label: `Always Respond: ${alwaysRespondEnabled ? 'ON' : 'OFF'}`,
      emoji: '↩️',
      style: alwaysRespondEnabled ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'toggle-response-mode',
      label: `Toggle Response Mode: ${responseMode}`,
      emoji: '📝',
      style: ButtonStyle.Secondary,
    },
    {
      customId: 'download-conversation',
      label: 'Download Conversation',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
    },
    ...GEMINI_TOOL_BUTTONS.map((toolConfig) => ({
      customId: `toggle-gemini-tool-${toolConfig.key}`,
      label: `${toolConfig.label}: ${toolPreferences[toolConfig.key] ? 'ON' : 'OFF'}`,
      emoji: toolConfig.emoji,
      style: toolPreferences[toolConfig.key] ? ButtonStyle.Success : ButtonStyle.Danger,
    })),
  ];

  if (DISPLAY_PERSONALITY_BUTTONS) {
    buttonConfigs.push(
      {
        customId: 'custom-personality',
        label: 'Custom Personality',
        emoji: '🙌',
        style: ButtonStyle.Primary,
      },
      {
        customId: 'remove-personality',
        label: 'Remove Personality',
        emoji: '🤖',
        style: ButtonStyle.Danger,
      },
    );
  }

  buttonConfigs.push({
    customId: 'back_to_main_settings',
    label: 'Back',
    emoji: '🔙',
    style: ButtonStyle.Secondary,
  });

  return interaction.update({
    embeds: [createEmbed({
      color: 0x00FFFF,
      title: 'General Settings',
      description:
        'Please choose an option from the buttons below.\n\nRecommended: clear your conversation history after changing Gemini tool settings so the new tool selection takes full effect.',
    })],
    components: buildButtonRows(buttonConfigs),
  });
}

function getServerSettingsButtonConfigs(guildId) {
  const settings = getServerSettings(guildId);

  return [
    {
      customId: 'server-chat-history',
      label: `Server-Wide Conversation History: ${settings.serverChatHistory ? 'ON' : 'OFF'}`,
      emoji: '📦',
      style: settings.serverChatHistory ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'clear-server',
      label: 'Clear Server-Wide Memory',
      emoji: '🧹',
      style: ButtonStyle.Danger,
    },
    {
      customId: 'settings-save-buttons',
      label: `Add Settings And Save Button: ${settings.settingsSaveButton ? 'ON' : 'OFF'}`,
      emoji: '🔘',
      style: settings.settingsSaveButton ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'toggle-server-personality',
      label: `Server Personality: ${settings.customServerPersonality ? 'ON' : 'OFF'}`,
      emoji: '🤖',
      style: settings.customServerPersonality ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'custom-server-personality',
      label: 'Custom Server Personality',
      emoji: '🙌',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'toggle-response-server-mode',
      label: `Use Server-Wide Response Style: ${settings.serverResponsePreference ? 'ON' : 'OFF'}`,
      emoji: '✏️',
      style: settings.serverResponsePreference ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'response-server-mode',
      label: `Toggle Server Response Mode: ${settings.responseStyle}`,
      emoji: '📝',
      style: ButtonStyle.Secondary,
    },
    {
      customId: 'download-server-conversation',
      label: 'Download Server Conversation',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
    },
  ];
}

export async function showDashboard(interaction) {
  return interaction.reply({
    embeds: [createEmbed({
      color: 0xFFFFFF,
      title: 'Server Settings',
      description: 'Your Server Settings:',
    })],
    components: buildButtonRows(getServerSettingsButtonConfigs(interaction.guild.id)),
    flags: MessageFlags.Ephemeral,
  });
}

export async function updateServerSettingsView(interaction) {
  return interaction.update({
    embeds: [createEmbed({
      color: 0xFFFFFF,
      title: 'Server Settings',
      description: 'Your Server Settings:',
    })],
    components: buildButtonRows(getServerSettingsButtonConfigs(interaction.guild.id)),
  });
}

export function buildCustomPersonalityModal() {
  return buildTextModal({
    modalId: 'custom-personality-modal',
    title: 'Enter Custom Personality Instructions',
    inputId: 'custom-personality-input',
    label: "What should the bot's personality be like?",
    placeholder: 'Enter the custom instructions here...',
  });
}

export function buildServerPersonalityModal() {
  return buildTextModal({
    modalId: 'custom-server-personality-modal',
    title: 'Enter Custom Personality Instructions',
    inputId: 'custom-server-personality-input',
    label: "What should the bot's personality be like?",
    placeholder: 'Enter the custom instructions here...',
  });
}

function getChannelSettingsButtonConfigs(channelId) {
  const settings = getChannelSettings(channelId);

  return [
    {
      customId: 'channel-always-respond',
      label: `Always Respond: ${settings.alwaysRespond ? 'ON' : 'OFF'}`,
      emoji: '↩️',
      style: settings.alwaysRespond ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'channel-chat-history',
      label: `Channel-Wide Chat History: ${settings.channelWideChatHistory ? 'ON' : 'OFF'}`,
      emoji: '📦',
      style: settings.channelWideChatHistory ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'toggle-channel-personality',
      label: `Channel Personality: ${settings.customChannelPersonality ? 'ON' : 'OFF'}`,
      emoji: '🤖',
      style: settings.customChannelPersonality ? ButtonStyle.Success : ButtonStyle.Danger,
    },
    {
      customId: 'clear-channel-history',
      label: 'Clear Channel Memory',
      emoji: '🧹',
      style: ButtonStyle.Danger,
    },
    {
      customId: 'channel-custom-personality',
      label: 'Custom Channel Personality',
      emoji: '🙌',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'channel-download-conversation',
      label: 'Download Channel Conversation',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
    },
  ];
}

export async function showChannelDashboard(interaction) {
  const channelId = interaction.channel.id;
  const channelName = interaction.channel.name || 'this channel';

  return interaction.reply({
    embeds: [createEmbed({
      color: 0x5865F2,
      title: 'Channel Settings',
      description: `Settings for **#${channelName}**:`,
    })],
    components: buildButtonRows(getChannelSettingsButtonConfigs(channelId)),
    flags: MessageFlags.Ephemeral,
  });
}

export async function updateChannelSettingsView(interaction) {
  const channelId = interaction.channel.id;
  const channelName = interaction.channel.name || 'this channel';

  return interaction.update({
    embeds: [createEmbed({
      color: 0x5865F2,
      title: 'Channel Settings',
      description: `Settings for **#${channelName}**:`,
    })],
    components: buildButtonRows(getChannelSettingsButtonConfigs(channelId)),
  });
}

export function buildChannelPersonalityModal() {
  return buildTextModal({
    modalId: 'custom-channel-personality-modal',
    title: 'Enter Channel Personality Instructions',
    inputId: 'custom-channel-personality-input',
    label: "What should the bot's personality be like?",
    placeholder: 'Enter the custom instructions for this channel...',
  });
}
