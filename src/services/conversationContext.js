import { DEFAULT_PERSONALITY } from '../constants.js';
import {
  getChannelSettings,
  getUserResponsePreference,
  state,
} from '../state/botState.js';

export function getResponsePreference(message) {
  const guildPreferenceEnabled = message.guild && state.serverSettings[message.guild.id]?.serverResponsePreference;

  return guildPreferenceEnabled
    ? state.serverSettings[message.guild.id].responseStyle
    : getUserResponsePreference(message.author.id);
}

export function resolveInstructions(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const channelSettings = getChannelSettings(channelId);

  if (!guildId) {
    return state.customInstructions[userId] || DEFAULT_PERSONALITY;
  }

  if (
    channelSettings.channelWideChatHistory
    && channelSettings.customChannelPersonality
    && state.customInstructions[channelId]
  ) {
    return state.customInstructions[channelId];
  }

  if (state.serverSettings[guildId]?.customServerPersonality && state.customInstructions[guildId]) {
    return state.customInstructions[guildId];
  }

  return state.customInstructions[userId] || DEFAULT_PERSONALITY;
}

export function buildConversationContext(message, instructions) {
  if (!message.guild) {
    return instructions;
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const serverHistoryEnabled = state.serverSettings[guildId]?.serverChatHistory;
  const channelHistoryEnabled = getChannelSettings(channelId).channelWideChatHistory;

  if (!serverHistoryEnabled && !channelHistoryEnabled) {
    return instructions;
  }

  const contextSections = [];

  if (serverHistoryEnabled) {
    contextSections.push(`You are currently engaging with users in the ${message.guild.name} Discord server.`);
  }

  if (channelHistoryEnabled) {
    const channelName = message.channel.name || 'this channel';
    contextSections.push(`This conversation is taking place in the #${channelName} channel.`);
  }

  contextSections.push(`## Current User Information\nUsername: \`${message.author.username}\`\nDisplay Name: \`${message.author.displayName}\``);

  return `${instructions}\n${contextSections.join('\n\n')}`;
}

export function resolveHistoryId(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const channelHistoryEnabled = getChannelSettings(channelId).channelWideChatHistory;

  if (!guildId) {
    return userId;
  }

  if (!channelHistoryEnabled) {
    return userId;
  }

  return state.serverSettings[guildId]?.serverChatHistory ? guildId : channelId;
}

export function resolveHistoryCategory(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const channelHistoryEnabled = getChannelSettings(channelId).channelWideChatHistory;

  if (!guildId) return 'users';
  if (!channelHistoryEnabled) return 'users';
  return state.serverSettings[guildId]?.serverChatHistory ? 'servers' : 'channels';
}