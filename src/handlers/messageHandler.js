import { ChannelType } from 'discord.js';

import { activeRequests, client } from '../core/runtime.js';
import {
  initializeGuildState,
  isChannelUserActive,
  isUserBlacklisted,
  state,
} from '../state/botState.js';
import { WORK_IN_DMS } from '../constants.js';
import { handleTextMessage } from '../services/conversationService.js';
import { applyEmbedFallback, createEmbed } from '../utils/discord.js';
import { logError } from '../utils/errorHandler.js';

function shouldRespondToMessage(message) {
  const isDirectMessage = message.channel.type === ChannelType.DM;

  return (
    (WORK_IN_DMS && isDirectMessage) ||
    Boolean(state.alwaysRespondChannels[message.channelId]) ||
    (!isDirectMessage && message.mentions.users.has(client.user.id)) ||
    isChannelUserActive(message.channelId, message.author.id)
  );
}

async function replyBlacklisted(message) {
  try {
    return await message.reply(applyEmbedFallback(message.channel, {
      embeds: [createEmbed({
        color: 0xFF0000,
        title: 'Blacklisted',
        description: 'You are blacklisted and cannot use this bot.',
      })],
    }));
  } catch (error) {
    logError('ReplyBlacklisted', error, {
      messageId: message.id,
      userId: message.author?.id,
    });
  }
}

async function replyRequestInProgress(message) {
  try {
    return await message.reply(applyEmbedFallback(message.channel, {
      embeds: [createEmbed({
        color: 0xFFFF00,
        title: 'Request In Progress',
        description: 'Please wait until your previous action is complete.',
      })],
    }));
  } catch (error) {
    logError('ReplyRequestInProgress', error, {
      messageId: message.id,
      userId: message.author?.id,
    });
  }
}

export async function handleMessageCreate(message) {
  if (message.author.bot || message.content.startsWith('!')) {
    return;
  }

  if (!shouldRespondToMessage(message)) {
    return;
  }

  try {
    if (message.guild) {
      initializeGuildState(message.guild.id);
      if (isUserBlacklisted(message.guild.id, message.author.id)) {
        await replyBlacklisted(message);
        return;
      }
    }

    if (activeRequests.has(message.author.id)) {
      await replyRequestInProgress(message);
      return;
    }

    activeRequests.add(message.author.id);
    await handleTextMessage(message);
  } catch (error) {
    logError('MessageHandler', error, {
      messageId: message.id,
      userId: message.author?.id,
      guildId: message.guild?.id,
    });
  } finally {
    activeRequests.delete(message.author.id);
  }
}
