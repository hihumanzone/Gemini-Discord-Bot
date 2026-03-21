import config from '../../config.js';
import { DEFAULT_PERSONALITY } from '../constants.js';
import {
  getActiveSessionHistoryId,
  getChannelSettings,
  getCustomInstruction,
  getUserResponsePreference,
  state,
} from '../state/botState.js';

export function getResponsePreference(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const serverStyle = guildId ? state.serverSettings[guildId]?.responseStyle : null;
  const channelStyle = getChannelSettings(channelId).responseStyle;

  if (channelStyle && channelStyle !== 'decide') {
    return channelStyle;
  }

  return serverStyle && serverStyle !== 'decide'
    ? serverStyle
    : getUserResponsePreference(message.author.id);
}

export function resolveInstructions(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const channelSettings = getChannelSettings(channelId);

  if (!guildId) {
    return getCustomInstruction(userId) || DEFAULT_PERSONALITY;
  }

  if (channelSettings.customChannelPersonality && getCustomInstruction(channelId)) {
    return getCustomInstruction(channelId);
  }

  if (state.serverSettings[guildId]?.customServerPersonality && getCustomInstruction(guildId)) {
    return getCustomInstruction(guildId);
  }

  return getCustomInstruction(userId) || DEFAULT_PERSONALITY;
}

export function buildFinalSystemInstruction(personality, userToolPreferences) {
  const sections = [
    personality,
    [
      'You are chatting with the user through a Discord bot. You are a multimodal model, equipped with the ability to read images, videos, and audio files.',
      '',
      '**Formatting Constraints**',
      'Do not use LaTeX formatting in your responses, as Discord does not natively render it. You may generate LaTeX-formatted text *only* if the user explicitly requests it.',
    ].join('\n'),
  ];

  if (userToolPreferences.codeExecution) {
    sections.push([
      '**File Generation & Sharing**',
      'If a user asks you to create, generate, make, or save a file, you must fulfill the request by using your Code Execution tool to save the file to your current working directory. You may use any appropriate method or library to save the file (e.g., standard Python file I/O, `pandas.to_csv`, `matplotlib.pyplot.savefig`, `PIL.Image.save`, etc.). The Discord bot wrapper will automatically detect any files saved to the sandbox environment and send them directly to the user as chat attachments. ',
      '* It is recommended to provide markdown links to the generated files in your final text response using the exact format: `[filename](sandbox:/filename)`. This allows the bot to extract the correct filename.',
      '* **CRITICAL:** Never tell the user that you cannot send files. Never claim that your environment is isolated, sandboxed, or lacks file-sharing capabilities. Simply save the file to the environment using Python.',
    ].join('\n'));
  }

  if (userToolPreferences.googleSearch) {
    sections.push([
      '**Web Search & Research**',
      'When using the Google Search tool, ensure your research is thorough. For complex or specific topics, run multiple varied searches and cross-reference results before answering.',
    ].join('\n'));
  }

  return sections.join('\n\n').trim();
}

const MAX_CHANNEL_MESSAGE_LENGTH = 500;

/**
 * Fetches recent messages from the Discord channel and formats them
 * as a context section for the system instructions.
 */
async function fetchRecentChannelMessages(message) {
  const limit = config.recentChannelMessagesLimit || 20;

  try {
    const fetched = await message.channel.messages.fetch({ limit, before: message.id });
    const recentMessages = [...fetched.values()].reverse();

    if (recentMessages.length === 0) return '';

    const formatted = recentMessages
      .map((msg) => {
        const author = msg.author.bot ? `[BOT] ${msg.author.username}` : msg.author.username;
        let content = msg.content
          || (msg.embeds.length > 0
            ? (msg.embeds[0].description || msg.embeds[0].title || '[embed]')
            : (msg.attachments.size > 0 ? '[attachment]' : '[empty message]'));
        if (content.length > MAX_CHANNEL_MESSAGE_LENGTH) {
          content = `${content.slice(0, MAX_CHANNEL_MESSAGE_LENGTH)}... [truncated]`;
        }
        return `${author}: ${content}`;
      })
      .join('\n');

    return (
      '## Recent Channel Messages\n'
      + 'Below are the most recent messages from this channel for context about the ongoing discussion. '
      + 'Use these to understand the conversation flow, but note that your direct conversation history (if any) is provided separately.\n'
      + '```\n'
      + formatted
      + '\n```'
    );
  } catch (error) {
    console.error('Failed to fetch recent channel messages:', error);
    return '';
  }
}

export async function buildConversationContext(message, instructions) {
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

  contextSections.push(`You are currently engaging with users in the ${message.guild.name} Discord server.`);

  if (channelHistoryEnabled) {
    const channelName = message.channel.name || 'this channel';
    contextSections.push(`This conversation is taking place in the #${channelName} channel.`);
  }

  contextSections.push(
    '## Multi-User Conversation Format\n'
    + 'This is a shared conversation where multiple Discord users participate. '
    + 'Each user message in the conversation history is prefixed with a tag in the format:\n'
    + '`[user:<username>|display:<displayName>]`\n'
    + 'Always pay attention to these tags to correctly identify who sent each message. '
    + 'Different users may have different contexts, questions, and conversation threads.'
  );

  contextSections.push(`## Current Message Sender\n- Username: \`${message.author.username}\`\n- Display Name: \`${message.author.displayName}\``);

  const recentContext = await fetchRecentChannelMessages(message);
  if (recentContext) {
    contextSections.push(recentContext);
  }

  return `${instructions}\n${contextSections.join('\n\n')}`;
}

export function resolveHistoryId(message) {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const channelHistoryEnabled = getChannelSettings(channelId).channelWideChatHistory;
  const serverHistoryEnabled = guildId ? state.serverSettings[guildId]?.serverChatHistory : false;
  const userHistoryId = getActiveSessionHistoryId(userId);

  if (!guildId) {
    return userHistoryId;
  }

  if (channelHistoryEnabled) {
    return channelId;
  }

  if (serverHistoryEnabled) {
    return guildId;
  }

  return userHistoryId;
}

export function isSharedConversation(message) {
  if (!message.guild) return false;
  const channelHistoryEnabled = getChannelSettings(message.channel.id).channelWideChatHistory;
  const serverHistoryEnabled = state.serverSettings[message.guild.id]?.serverChatHistory;
  return channelHistoryEnabled || serverHistoryEnabled;
}

export function isSharedPersonality(message) {
  const guildId = message.guild?.id;
  if (!guildId) return false;

  const channelId = message.channel.id;
  const channelSettings = getChannelSettings(channelId);

  if (channelSettings.customChannelPersonality && getCustomInstruction(channelId)) {
    return true;
  }

  if (state.serverSettings[guildId]?.customServerPersonality && getCustomInstruction(guildId)) {
    return true;
  }

  return false;
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
  const serverHistoryEnabled = guildId ? state.serverSettings[guildId]?.serverChatHistory : false;

  if (!guildId) return 'users';
  if (channelHistoryEnabled) return 'channels';
  if (serverHistoryEnabled) return 'servers';
  return 'users';
}