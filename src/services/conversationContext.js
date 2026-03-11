import { DEFAULT_PERSONALITY } from '../constants.js';
import {
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

  if (!guildId) {
    return state.customInstructions[userId] || DEFAULT_PERSONALITY;
  }

  if (state.channelWideChatHistory[channelId]) {
    return state.customInstructions[channelId] || DEFAULT_PERSONALITY;
  }

  if (state.serverSettings[guildId]?.customServerPersonality && state.customInstructions[guildId]) {
    return state.customInstructions[guildId];
  }

  return state.customInstructions[userId] || DEFAULT_PERSONALITY;
}

export function buildConversationContext(message, instructions) {
  if (!message.guild || !state.serverSettings[message.guild.id]?.serverChatHistory) {
    return instructions;
  }

  return `${instructions}\nYou are currently engaging with users in the ${message.guild.name} Discord server.\n\n## Current User Information\nUsername: \`${message.author.username}\`\nDisplay Name: \`${message.author.displayName}\``;
}

export function resolveHistoryId(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (!guildId) {
    return userId;
  }

  if (!state.channelWideChatHistory[channelId]) {
    return userId;
  }

  return state.serverSettings[guildId]?.serverChatHistory ? guildId : channelId;
}