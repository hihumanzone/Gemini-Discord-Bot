import { ChannelType, EmbedBuilder } from 'discord.js';
import {
  client,
  activeRequests,
  state,
  initializeBlacklistForGuild
} from '../botManager.js';
import config from '../config.js';
import { hasSupportedAttachments, extractFileText, processPromptAndMediaAttachments } from '../utils/fileUtils.js';
import { addSettingsButton } from '../utils/buttonUtils.js';

const { defaultPersonality, SEND_RETRY_ERRORS_TO_DISCORD } = config;

/**
 * Handle text messages from users
 */
export async function handleTextMessage(message) {
  // For now, this is a simplified version
  // The full implementation would include all the message processing logic
  console.log(`Processing message from ${message.author.tag}: ${message.content}`);
  
  // This will be implemented with the full message processing logic
  // including file handling, AI model interaction, etc.
}

/**
 * Check if user should respond to message
 */
export function shouldRespondToMessage(message) {
  const isDM = message.channel.type === ChannelType.DM;
  const workInDMs = config.workInDMs;

  return (
    workInDMs && isDM ||
    state.alwaysRespondChannels[message.channelId] ||
    (message.mentions.users.has(client.user.id) && !isDM) ||
    state.activeUsersInChannels[message.channelId]?.[message.author.id]
  );
}

/**
 * Check if user is blacklisted
 */
export function isUserBlacklisted(message) {
  if (message.guild) {
    initializeBlacklistForGuild(message.guild.id);
    return state.blacklistedUsers[message.guild.id].includes(message.author.id);
  }
  return false;
}