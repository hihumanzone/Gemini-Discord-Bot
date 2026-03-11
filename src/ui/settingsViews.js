import { ButtonStyle, MessageFlags } from 'discord.js';

import {
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  isChannelUserActive,
  isUserBlacklisted,
} from '../../botManager.js';
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

export async function showDashboard(interaction) {
  const buttonConfigs = [
    {
      customId: 'server-chat-history',
      label: 'Toggle Server-Wide Conversation History',
      emoji: '📦',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'clear-server',
      label: 'Clear Server-Wide Memory',
      emoji: '🧹',
      style: ButtonStyle.Danger,
    },
    {
      customId: 'settings-save-buttons',
      label: 'Toggle Add Settings And Save Button',
      emoji: '🔘',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'toggle-server-personality',
      label: 'Toggle Server Personality',
      emoji: '🤖',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'custom-server-personality',
      label: 'Custom Server Personality',
      emoji: '🙌',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'toggle-response-server-mode',
      label: 'Toggle Server-Wide Responses Style',
      emoji: '✏️',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'response-server-mode',
      label: 'Server-Wide Responses Style',
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

  return interaction.reply({
    embeds: [createEmbed({
      color: 0xFFFFFF,
      title: 'Settings',
      description: 'Your Server Settings:',
    })],
    components: buildButtonRows(buttonConfigs),
    flags: MessageFlags.Ephemeral,
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
