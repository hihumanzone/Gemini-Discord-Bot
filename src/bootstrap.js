import { REST, Routes } from 'discord.js';

import { client, token } from '../botManager.js';
import { commands } from '../commands.js';
import { PRESENCE_ACTIVITIES, PRESENCE_ROTATION_INTERVAL_MS } from './constants.js';
import { handleInteraction } from './handlers/interactionHandler.js';
import { handleMessageCreate } from './handlers/messageHandler.js';

export function registerBotHandlers() {
  let activityIndex = 0;

  client.once('clientReady', async () => {
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
      client.user.setPresence({
        activities: [PRESENCE_ACTIVITIES[activityIndex]],
        status: 'idle',
      });

      setInterval(() => {
        activityIndex = (activityIndex + 1) % PRESENCE_ACTIVITIES.length;
        client.user.setPresence({
          activities: [PRESENCE_ACTIVITIES[activityIndex]],
          status: 'idle',
        });
      }, PRESENCE_ROTATION_INTERVAL_MS);
    }
  });

  client.on('messageCreate', handleMessageCreate);
  client.on('interactionCreate', handleInteraction);
}
