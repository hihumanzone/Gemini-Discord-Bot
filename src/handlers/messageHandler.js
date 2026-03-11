import { ChannelType } from 'discord.js';

import { activeRequests, client, initializeBlacklistForGuild, state } from '../../botManager.js';
import { WORK_IN_DMS } from '../constants.js';
import { handleTextMessage } from '../services/conversationService.js';
import { createEmbed } from '../utils/discord.js';

function shouldRespondToMessage(message) {
  const isDirectMessage = message.channel.type === ChannelType.DM;

  return (
    (WORK_IN_DMS && isDirectMessage) ||
    Boolean(state.alwaysRespondChannels[message.channelId]) ||
    (!isDirectMessage && message.mentions.users.has(client.user.id)) ||
    Boolean(state.activeUsersInChannels[message.channelId]?.[message.author.id])
  );
}

async function replyBlacklisted(message) {
  return message.reply({
    embeds: [createEmbed({
      color: 0xFF0000,
      title: 'Blacklisted',
      description: 'You are blacklisted and cannot use this bot.',
    })],
  });
}

async function replyRequestInProgress(message) {
  return message.reply({
    embeds: [createEmbed({
      color: 0xFFFF00,
      title: 'Request In Progress',
      description: 'Please wait until your previous action is complete.',
    })],
  });
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
      initializeBlacklistForGuild(message.guild.id);
      if (state.blacklistedUsers[message.guild.id].includes(message.author.id)) {
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
    activeRequests.delete(message.author.id);
    console.error('Error processing the message:', error);
  }
}
