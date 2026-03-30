import { Events, REST, Routes } from 'discord.js';

import { client, token } from './core/runtime.js';
import { commands } from './discord/commands.js';
import { PRESENCE_ACTIVITIES, PRESENCE_ROTATION_INTERVAL_MS } from './constants.js';
import { handleInteraction } from './handlers/interactionHandler.js';
import { handleMessageCreate } from './handlers/messageHandler.js';
import {
  logDiscordError,
  logShardError,
  logError,
  logUnhandledRejection,
  logUncaughtException,
} from './utils/errorHandler.js';

export function registerBotHandlers() {
  let activityIndex = 0;

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(token);
    try {
      console.log('Started refreshing application (/) commands.');
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands.map((command) => command.toJSON()),
      });
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Failed to refresh slash commands:', error);
    }

    if (PRESENCE_ACTIVITIES.length > 0) {
      try {
        client.user.setPresence({
          activities: [PRESENCE_ACTIVITIES[activityIndex]],
          status: 'idle',
        });
      } catch (error) {
        console.error('Failed to set initial presence:', error);
      }

      if (PRESENCE_ACTIVITIES.length > 1) {
        setInterval(() => {
          try {
            activityIndex = (activityIndex + 1) % PRESENCE_ACTIVITIES.length;
            client.user.setPresence({
              activities: [PRESENCE_ACTIVITIES[activityIndex]],
              status: 'idle',
            });
          } catch (error) {
            console.error('Failed to rotate presence:', error);
          }
        }, PRESENCE_ROTATION_INTERVAL_MS);
      }
    }
  });

  client.on(Events.Error, logDiscordError);
  client.on(Events.ShardError, logShardError);
  client.on(Events.Warn, (message) => logError('Discord', message));
  process.on('unhandledRejection', logUnhandledRejection);
  process.on('uncaughtException', logUncaughtException);

  client.on(Events.MessageCreate, handleMessageCreate);
  client.on(Events.InteractionCreate, handleInteraction);
}
