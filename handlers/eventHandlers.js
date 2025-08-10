import { ActivityType, REST, Routes } from 'discord.js';
import { client, token, activeRequests } from '../botManager.js';
import { shouldRespondToMessage, isUserBlacklisted, handleTextMessage } from './messageHandler.js';
import { createErrorEmbed, createWarningEmbed } from '../utils/embedUtils.js';
import { commands } from '../commands.js';
import config from '../config.js';

const activities = config.activities.map(activity => ({
  name: activity.name,
  type: ActivityType[activity.type]
}));

let activityIndex = 0;

export function registerEventHandlers() {
  // Ready event handler
  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST().setToken(token);
    try {
      console.log('Started refreshing application (/) commands.');

      await rest.put(
        Routes.applicationCommands(client.user.id), {
          body: commands
        },
      );

      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }

    client.user.setPresence({
      activities: [activities[activityIndex]],
      status: 'idle',
    });

    setInterval(() => {
      activityIndex = (activityIndex + 1) % activities.length;
      client.user.setPresence({
        activities: [activities[activityIndex]],
        status: 'idle',
      });
    }, 30000);
  });

  // Message create event handler
  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot) return;
      if (message.content.startsWith('!')) return;

      if (shouldRespondToMessage(message)) {
        if (isUserBlacklisted(message)) {
          const embed = createErrorEmbed('Blacklisted', 'You are blacklisted and cannot use this bot.');
          return message.reply({
            embeds: [embed]
          });
        }
        
        if (activeRequests.has(message.author.id)) {
          const embed = createWarningEmbed('Request In Progress', 'Please wait until your previous action is complete.');
          await message.reply({
            embeds: [embed]
          });
        } else {
          activeRequests.add(message.author.id);
          await handleTextMessage(message);
        }
      }
    } catch (error) {
      console.error('Error processing the message:', error);
      if (activeRequests.has(message.author.id)) {
        activeRequests.delete(message.author.id);
      }
    }
  });
}