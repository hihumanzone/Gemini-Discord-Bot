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

  if (serverHistoryEnabled || channelHistoryEnabled) {
    contextSections.push(`You are currently engaging with users in the ${message.guild.name} Discord server.`);
  }

  if (channelHistoryEnabled) {
    const channelName = message.channel.name || 'this channel';
    contextSections.push(`This conversation is taking place in the #${channelName} channel.`);
  }

  if (serverHistoryEnabled || channelHistoryEnabled) {
    contextSections.push(
      '## Multi-User Conversation Format\n'
      + 'This is a shared conversation where multiple Discord users participate. '
      + 'Each user message in the conversation history is prefixed with a tag in the format:\n'
      + '`[user:<username>|display:<displayName>]`\n'
      + 'Always pay attention to these tags to correctly identify who sent each message. '
      + 'Different users may have different contexts, questions, and conversation threads.'
    );

    contextSections.push(`## Current Message Sender\n- Username: \`${message.author.username}\`\n- Display Name: \`${message.author.displayName}\``);
  }

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

export function isSharedConversation(message) {
  if (!message.guild) return false;
  const channelHistoryEnabled = getChannelSettings(message.channel.id).channelWideChatHistory;
  const serverHistoryEnabled = state.serverSettings[message.guild.id]?.serverChatHistory;
  return channelHistoryEnabled || serverHistoryEnabled;
}

export function tagPartsWithUser(parts, message) {
  const tag = `[user:${message.author.username}|display:${message.author.displayName}]`;
  if (parts.length > 0 && parts[0].text !== undefined) {
    return [{ ...parts[0], text: `${tag} ${parts[0].text}` }, ...parts.slice(1)];
  }
  return [{ text: tag }, ...parts];
}

export function resolveHistoryCategory(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const channelHistoryEnabled = getChannelSettings(channelId).channelWideChatHistory;

  if (!guildId) return 'users';
  if (!channelHistoryEnabled) return 'users';
  return state.serverSettings[guildId]?.serverChatHistory ? 'servers' : 'channels';
}