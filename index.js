import {
  ActivityType,
  REST,
  Routes,
} from 'discord.js';

import config from './config.js';
import {
  client,
  token,
  initialize,
} from './botManager.js';

import { commands } from './commands.js';
import { registerMessageHandler, registerInteractionHandler } from './handlers/index.js';

// Initialize the bot state
initialize().catch(console.error);

// Configuration from centralized config
const activities = config.activities.map(activity => ({
  name: activity.name,
  type: ActivityType[activity.type]
}));
const activityInterval = config.activityInterval;

// Register event handlers
registerMessageHandler();
registerInteractionHandler();

// Bot ready event - register commands and set activity
let activityIndex = 0;
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
  }, activityInterval);
});

// Login to Discord
client.login(token);
