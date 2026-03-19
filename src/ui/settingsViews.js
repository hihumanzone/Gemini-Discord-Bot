import {
  ActionRowBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';

import {
  getChannelSettings,
  getUserSessionHistoryId,
  getServerSettings,
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  getUserNanoBananaMode,
  getUserResponseActionButtons,
  getUserSessions,
  cycleServerResponseActionButtons,
  isChannelUserActive,
  isUserBlacklisted,
  state,
} from '../state/botState.js';
import { DISPLAY_PERSONALITY_BUTTONS } from '../constants.js';
import { applyEmbedFallback, buildButtonRows, buildTextModal, createStatusEmbed } from '../utils/discord.js';
import {
  getClearMemoryDisabledReason,
  getCustomPersonalityDisabledReason,
  getNanoBananaDisabledReason,
  getResponseStyleDisabledReason,
  getAlwaysRespondDisabledReason,
  getResponseActionButtonsDisabledReason,
} from '../handlers/interactionHelpers.js';

const MAX_BUTTON_LABEL_LENGTH = 80;
const MAX_EMBED_FIELD_VALUE_LENGTH = 1024;

function truncateText(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

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
      return interaction.reply(applyEmbedFallback(interaction.channel, {
        embeds: [createStatusEmbed({
          variant: 'error',
          title: 'Blacklisted',
          description: 'You are blacklisted and cannot use this interaction.',
        })],
        flags: MessageFlags.Ephemeral,
      }));
    }
  }

  const nanoBananaMode = getUserNanoBananaMode(interaction.user.id);
  const clearMemoryDisabled = Boolean(getClearMemoryDisabledReason(interaction));
  const personalityDisabled = Boolean(getCustomPersonalityDisabledReason(interaction));
  const nanoBananaDisabled = Boolean(getNanoBananaDisabledReason(interaction));

  const rows = buildButtonRows([
    {
      customId: 'clear-memory',
      label: 'Clear Memory',
      emoji: '🧹',
      style: ButtonStyle.Danger,
      disabled: clearMemoryDisabled,
    },
    {
      customId: 'session-settings',
      label: 'Session Manager',
      emoji: '🗂️',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'toggle-nano-banana',
      label: `Nano Banana Mode: ${nanoBananaMode.enabled ? 'ON' : 'OFF'}`,
      emoji: '🍌',
      style: nanoBananaMode.enabled ? ButtonStyle.Success : ButtonStyle.Danger,
      disabled: nanoBananaDisabled,
    },
    {
      customId: 'gemini-tools-settings',
      label: nanoBananaMode.enabled ? 'NB Tools' : 'Gemini Tools',
      emoji: nanoBananaMode.enabled ? '🍌' : '🛠️',
      style: ButtonStyle.Primary,
    },
    {
      customId: 'personality-settings',
      label: 'Personality',
      emoji: '🤖',
      style: ButtonStyle.Primary,
      disabled: personalityDisabled,
    },
    {
      customId: 'general-settings',
      label: 'General Settings',
      emoji: '⚙️',
      style: ButtonStyle.Secondary,
    },
  ]);

  const payload = {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Control Center',
      description:
        'Manage your personal AI experience from one place.\n\n'
        + '**Quick Actions**\n'
        + '- Clear active session history\n'
        + '- Open Session Manager\n'
        + `- Nano Banana Mode is currently ${nanoBananaMode.enabled ? 'ON' : 'OFF'}\n`
        + (nanoBananaMode.enabled ? '- Configure Nano Banana tools\n' : '- Configure Gemini tools\n')
        + '- Configure personality\n'
        + '- Configure general behavior',
    })],
    components: rows,
  };

  if (edit) {
    return interaction.update(applyEmbedFallback(interaction.channel, payload));
  }

  return interaction.reply(applyEmbedFallback(interaction.channel, {
    ...payload,
    flags: MessageFlags.Ephemeral,
  }));
}

export async function updateGeneralSettingsView(interaction) {
  const channelId = interaction.channel.id;
  const guildId = interaction.guild?.id;
  const userId = interaction.user.id;

  const serverSettings = guildId ? getServerSettings(guildId) : null;

  const alwaysRespondDisabledReason = getAlwaysRespondDisabledReason(interaction);
  const responseStyleDisabledReason = getResponseStyleDisabledReason(interaction);
  const responseActionButtonsDisabledReason = getResponseActionButtonsDisabledReason(interaction);

  const alwaysRespondEnabled = alwaysRespondDisabledReason ? true : isChannelUserActive(channelId, userId);
  const responseMode = responseStyleDisabledReason ? serverSettings.responseStyle : getUserResponsePreference(userId);

  let responseActionButtonsEnabled;
  if (responseActionButtonsDisabledReason) {
    responseActionButtonsEnabled = serverSettings.settingsSaveButton === 'on';
  } else {
    responseActionButtonsEnabled = getUserResponseActionButtons(userId);
  }

  const buttonConfigs = [
    {
      customId: 'always-respond',
      label: `Always Respond: ${alwaysRespondEnabled ? 'ON' : 'OFF'}`,
      emoji: '↩️',
      style: alwaysRespondEnabled ? ButtonStyle.Success : ButtonStyle.Danger,
      disabled: Boolean(alwaysRespondDisabledReason),
    },
    {
      customId: 'toggle-response-mode',
      label: `Toggle Response Mode: ${responseMode}`,
      emoji: '📝',
      style: ButtonStyle.Secondary,
      disabled: Boolean(responseStyleDisabledReason),
    },
    {
      customId: 'toggle-action-buttons',
      label: `Settings, Save, Delete Buttons: ${responseActionButtonsEnabled ? 'ON' : 'OFF'}`,
      emoji: '🔘',
      style: responseActionButtonsEnabled ? ButtonStyle.Success : ButtonStyle.Danger,
      disabled: Boolean(responseActionButtonsDisabledReason),
    },
    {
      customId: 'download-conversation',
      label: 'Download Conversation',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
    },
  ];

  buttonConfigs.push({
    customId: 'back_to_main_settings',
    label: 'Back',
    emoji: '🔙',
    style: ButtonStyle.Secondary,
  });

  return interaction.update(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'General Settings',
      description:
        '**Personal Behavior**\n'
        + 'Adjust how the bot responds to you and manage conversations.',
    })],
    components: buildButtonRows(buttonConfigs),
  }));
}

export async function updatePersonalitySettingsView(interaction) {
  const personalityDisabled = Boolean(getCustomPersonalityDisabledReason(interaction));
  const buttonConfigs = [];

  if (DISPLAY_PERSONALITY_BUTTONS) {
    buttonConfigs.push(
      {
        customId: 'custom-personality',
        label: 'Custom Personality',
        emoji: '🙌',
        style: ButtonStyle.Primary,
        disabled: personalityDisabled,
      },
      {
        customId: 'download-personality',
        label: 'Download Personality',
        emoji: '🗃️',
        style: ButtonStyle.Secondary,
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

  return interaction.update(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Personality Settings',
      description:
        '**Bot Personality**\n'
        + 'Configure custom instructions for how the bot should behave and respond.',
    })],
    components: buildButtonRows(buttonConfigs),
  }));
}

export async function updateGeminiToolsSettingsView(interaction) {
  const userId = interaction.user.id;
  const nanoBananaMode = getUserNanoBananaMode(userId);

  let buttonConfigs, title, description;

  if (nanoBananaMode.enabled) {
    buttonConfigs = [
      {
        customId: `toggle-nb-google-search`,
        label: `Google Search: ${nanoBananaMode.googleSearch ? 'ON' : 'OFF'}`,
        emoji: '🔎',
        style: nanoBananaMode.googleSearch ? ButtonStyle.Success : ButtonStyle.Danger,
      },
      {
        customId: `toggle-nb-image-search`,
        label: `Image Search: ${nanoBananaMode.imageSearch ? 'ON' : 'OFF'}`,
        emoji: '🖼️',
        style: nanoBananaMode.imageSearch ? ButtonStyle.Success : ButtonStyle.Danger,
        disabled: !nanoBananaMode.googleSearch,
      },
      {
        customId: 'back_to_main_settings',
        label: 'Back',
        emoji: '🔙',
        style: ButtonStyle.Secondary,
      }
    ];

    title = 'Nano Banana Tools';
    description = '**Tool Configuration**\nToggle individual Nano Banana tools on or off.\n*Note: Image Search requires Google Search to be enabled.*';
  } else {
    const toolPreferences = getUserGeminiToolPreferences(userId);

    buttonConfigs = GEMINI_TOOL_BUTTONS.map((toolConfig) => ({
      customId: `toggle-gemini-tool-${toolConfig.key}`,
      label: `${toolConfig.label}: ${toolPreferences[toolConfig.key] ? 'ON' : 'OFF'}`,
      emoji: toolConfig.emoji,
      style: toolPreferences[toolConfig.key] ? ButtonStyle.Success : ButtonStyle.Danger,
    }));

    buttonConfigs.push({
      customId: 'back_to_main_settings',
      label: 'Back',
      emoji: '🔙',
      style: ButtonStyle.Secondary,
    });

    title = 'Gemini Tools Settings';
    description = '**Tool Configuration**\nToggle individual Gemini tools on or off to customize your experience.\n\n**Recommended**\nAfter changing Gemini tool toggles, clear your active session history so new settings take full effect.';
  }

  return interaction.update(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title,
      description,
    })],
    components: buildButtonRows(buttonConfigs),
  }));
}

function getServerSettingsButtonConfigs(guildId) {
  const settings = getServerSettings(guildId);

  const actionButtonLabels = {
    on: 'On',
    off: 'Off',
    decide: 'Let Individuals Decide',
  };

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
      label: `Settings, Save, Delete Buttons: ${actionButtonLabels[settings.settingsSaveButton] || 'Unknown'}`,
      emoji: '🔘',
      style: settings.settingsSaveButton === 'on' ? ButtonStyle.Success : (settings.settingsSaveButton === 'off' ? ButtonStyle.Danger : ButtonStyle.Secondary),
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
      customId: 'download-server-personality',
      label: 'Download Server Personality',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
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
  return interaction.reply(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Server Settings',
      description:
        '**Server-wide Controls**\n'
        + 'Manage memory scope, response style, and admin-only behavior for this server.',
    })],
    components: buildButtonRows(getServerSettingsButtonConfigs(interaction.guild.id)),
    flags: MessageFlags.Ephemeral,
  }));
}

export async function updateServerSettingsView(interaction) {
  return interaction.update(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Server Settings',
      description:
        '**Server-wide Controls**\n'
        + 'Manage memory scope, response style, and admin-only behavior for this server.',
    })],
    components: buildButtonRows(getServerSettingsButtonConfigs(interaction.guild.id)),
  }));
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

function buildSessionSwitchMenu(userState, selectedSessionId) {
  const allEntries = Object.entries(userState.sessions);
  const priorityIds = [selectedSessionId, userState.activeSessionId].filter(Boolean);
  const prioritizedEntries = [];
  const seenIds = new Set();

  for (const id of priorityIds) {
    if (seenIds.has(id) || !userState.sessions[id]) {
      continue;
    }

    prioritizedEntries.push([id, userState.sessions[id]]);
    seenIds.add(id);
  }

  for (const [id, entry] of allEntries) {
    if (seenIds.has(id)) {
      continue;
    }

    prioritizedEntries.push([id, entry]);
    seenIds.add(id);
  }

  const options = prioritizedEntries.slice(0, 25).map(([id, entry]) => {
    const historyId = getUserSessionHistoryId(userState.userId, id);
    const messageIdCount = Object.keys(state.chatHistories[historyId] || {}).length;

    return {
      label: id === userState.activeSessionId ? `${entry.name} (Active)` : entry.name,
      value: id,
      description: `ID: ${id} | ${messageIdCount} message IDs`.slice(0, 100),
      default: id === selectedSessionId,
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('session-switch-select')
      .setPlaceholder('Select a session to switch to')
      .addOptions(options),
  );
}

function buildSessionActionRows(selectedSessionId, selectedSessionName) {
  const renameLabel = truncateText(`Rename: ${selectedSessionName}`, MAX_BUTTON_LABEL_LENGTH);

  return buildButtonRows([
    {
      customId: 'open-create-session-modal',
      label: 'Create Session',
      emoji: '➕',
      style: ButtonStyle.Success,
    },
    {
      customId: `open-rename-session-modal-${selectedSessionId}`,
      label: renameLabel,
      emoji: '✏️',
      style: ButtonStyle.Primary,
      disabled: selectedSessionId === 'default',
    },
    {
      customId: `session-download-conversation-${selectedSessionId}`,
      label: 'Download Conversation',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
    },
    {
      customId: `session-clear-history-${selectedSessionId}`,
      label: 'Clear History',
      emoji: '🧹',
      style: ButtonStyle.Danger,
    },
    {
      customId: `delete-session-${selectedSessionId}`,
      label: 'Delete Selected',
      emoji: '🗑️',
      style: ButtonStyle.Danger,
      disabled: selectedSessionId === 'default',
    },
    {
      customId: 'back_to_main_settings',
      label: 'Back',
      emoji: '🔙',
      style: ButtonStyle.Secondary,
    },
  ]);
}

export function buildSessionSettingsPayload(userId, selectedSessionId, actionSummary = null) {
  const userState = {
    ...getUserSessions(userId),
    userId,
  };
  const resolvedSelectedSessionId = userState.sessions[selectedSessionId]
    ? selectedSessionId
    : userState.activeSessionId;
  const selectedSession = userState.sessions[resolvedSelectedSessionId];
  const selectedHistoryId = getUserSessionHistoryId(userId, resolvedSelectedSessionId);
  const selectedMessageIdCount = Object.keys(state.chatHistories[selectedHistoryId] || {}).length;

  const fields = [
    {
      name: 'Session Snapshot',
      value: `Stored message IDs: **${selectedMessageIdCount}**`,
    },
    {
      name: 'Workflow Tip',
      value: 'Use separate sessions for different topics so memory stays focused and easy to manage.',
    },
  ];

  const sessionCount = Object.keys(userState.sessions).length;
  if (sessionCount > 25) {
    fields.push({
      name: 'Session List Limit',
      value: `Showing 25 of ${sessionCount} sessions in the dropdown.`,
    });
  }

  if (actionSummary) {
    fields.unshift({
      name: 'Last Action',
      value: truncateText(actionSummary, MAX_EMBED_FIELD_VALUE_LENGTH),
    });
  }

  const activeSession = userState.sessions[userState.activeSessionId];
  const isSelectedSessionActive = resolvedSelectedSessionId === userState.activeSessionId;
  const sessionDescription = isSelectedSessionActive
    ? `Current Session: **${activeSession.name}** (ID: ${userState.activeSessionId})`
    : `Current Session: **${activeSession.name}** (ID: ${userState.activeSessionId})\nSelected Session: **${selectedSession.name}** (ID: ${resolvedSelectedSessionId})`;

  return {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Session Manager',
      description:
        `Manage independent conversation threads with dedicated history.\n\n`
        + sessionDescription,
      fields,
    })],
    components: [
      buildSessionSwitchMenu(userState, resolvedSelectedSessionId),
      ...buildSessionActionRows(resolvedSelectedSessionId, selectedSession.name),
    ],
  };
}

export async function updateSessionSettingsView(interaction, selectedSessionId, actionSummary = null) {
  const payload = buildSessionSettingsPayload(interaction.user.id, selectedSessionId, actionSummary);

  return interaction.update(applyEmbedFallback(interaction.channel, {
    ...payload,
  }));
}

export function buildSessionCreateModal() {
  return buildTextModal({
    modalId: 'session-create-modal',
    title: 'Create Session',
    inputId: 'session-create-name',
    label: 'Session name',
    placeholder: 'Examples: Work Notes, Fantasy RP, JavaScript Debugging',
    minLength: 1,
    maxLength: 80,
  });
}

export function buildSessionRenameModal(sessionId, currentSessionName) {
  return buildTextModal({
    modalId: `session-rename-modal:${sessionId}`,
    title: 'Rename Session',
    inputId: 'session-rename-name',
    label: 'New session name',
    placeholder: 'Enter a new session name',
    value: currentSessionName,
    minLength: 1,
    maxLength: 80,
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
      customId: 'download-channel-personality',
      label: 'Download Channel Personality',
      emoji: '🗃️',
      style: ButtonStyle.Secondary,
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

  return interaction.reply(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Channel Settings',
      description:
        `**Channel Controls for #${channelName}**\n`
        + 'Configure channel-level memory and personality behavior.',
    })],
    components: buildButtonRows(getChannelSettingsButtonConfigs(channelId)),
    flags: MessageFlags.Ephemeral,
  }));
}

export async function updateChannelSettingsView(interaction) {
  const channelId = interaction.channel.id;
  const channelName = interaction.channel.name || 'this channel';

  return interaction.update(applyEmbedFallback(interaction.channel, {
    embeds: [createStatusEmbed({
      variant: 'primary',
      title: 'Channel Settings',
      description:
        `**Channel Controls for #${channelName}**\n`
        + 'Configure channel-level memory and personality behavior.',
    })],
    components: buildButtonRows(getChannelSettingsButtonConfigs(channelId)),
  }));
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
