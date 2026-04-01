import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { Events, REST, Routes } from 'discord.js';

import { client, token } from './core/runtime.js';
import { COMMANDS_SNAPSHOT_FILE } from './core/paths.js';
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

function getCommandsPayload() {
  return commands.map((command) => command.toJSON());
}

function computeCommandHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function loadStoredCommandHash() {
  try {
    const fileContents = await fs.readFile(COMMANDS_SNAPSHOT_FILE, 'utf-8');
    const parsed = JSON.parse(fileContents);
    return typeof parsed.hash === 'string' ? parsed.hash : null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to read slash command snapshot. Commands will be refreshed.', error);
    }
    return null;
  }
}

async function saveCommandHash(hash) {
  const snapshot = {
    hash,
    updatedAt: new Date().toISOString(),
  };

  try {
    await fs.writeFile(COMMANDS_SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Slash commands were synced, but the snapshot file could not be written.', error);
  }
}

async function deploySlashCommandsIfChanged(rest, applicationId) {
  const payload = getCommandsPayload();
  const nextHash = computeCommandHash(payload);
  const previousHash = await loadStoredCommandHash();

  if (previousHash === nextHash) {
    console.log('Slash commands unchanged. Skipping command refresh.');
    return;
  }

  if (previousHash) {
    console.log('Detected slash command changes. Refreshing application (/) commands.');
  } else {
    console.log('No slash command snapshot found. Registering application (/) commands.');
  }

  await rest.put(Routes.applicationCommands(applicationId), { body: payload });
  await saveCommandHash(nextHash);
  console.log('Successfully synced application (/) commands.');
}

export function registerBotHandlers() {
  let activityIndex = 0;

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(token);
    try {
      await deploySlashCommandsIfChanged(rest, client.user.id);
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
