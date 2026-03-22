import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration Management ---
const configPath = path.join(__dirname, 'config.js');
const defaultConfig = `// For advanced configuration, edit \`constants.js\`.
const config = Object.freeze({
  defaultModel: 'gemini-flash-lite-latest',
  nanoBananaModel: 'gemini-2.5-flash-image',
  maxGenerationAttempts: 3,
  defaultResponseFormat: 'Embedded',
  defaultResponseActionButtons: true,
  hexColour: '#505050',
  workInDMs: true,
  shouldDisplayPersonalityButtons: true,
  enableGeminiApiLogging: false,
  SEND_RETRY_ERRORS_TO_DISCORD: true,
  defaultPersonality:
    "You are Gemini, a large language model trained by Google.",
  activities: [
    {
      name: 'With Code',
      type: 'Playing',
    },
    {
      name: 'Something',
      type: 'Listening',
    },
    {
      name: 'You',
      type: 'Watching',
    },
  ],
  defaultServerSettings: {
    serverChatHistory: false,
    customServerPersonality: false,
    settingsSaveButton: 'decide',
    responseStyle: 'decide',
  },
  defaultChannelSettings: {
    alwaysRespond: false,
    channelWideChatHistory: false,
    customChannelPersonality: false,
    settingsSaveButton: 'decide',
    responseStyle: 'decide',
  },
  defaultGeminiToolPreferences: {
    googleSearch: true,
    urlContext: true,
    codeExecution: false,
  },
  chatHistoryLimits: {
    users: 10,
    servers: 12,
    channels: 15,
  },
  recentChannelMessagesLimit: 15,
});

export default config;
`;

if (!fs.existsSync(configPath)) {
  console.log('config.js not found. Creating default configuration...');
  fs.writeFileSync(configPath, defaultConfig);
  console.log('Default config.js created.');
}

// --- Commands Definition ---
function createAdminGuildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild);
}

export const commands = Object.freeze([
  new SlashCommandBuilder().setName('clear_memory').setDescription('Clears the conversation history.'),
  new SlashCommandBuilder().setName('settings').setDescription('Opens up settings.'),
  createAdminGuildCommand('server_settings', 'Opens up the server settings.'),
  createAdminGuildCommand('channel_settings', 'Opens up the channel settings for this channel.'),
  createAdminGuildCommand('block', 'Blocks a user from using certain interactions.').addUserOption((option) =>
    option.setName('user').setDescription('The user to block.').setRequired(true),
  ),
  createAdminGuildCommand('unblock', 'Removes a user from the block list.').addUserOption((option) =>
    option.setName('user').setDescription('The user to unblock.').setRequired(true),
  ),
  new SlashCommandBuilder().setName('status').setDescription('Displays bot CPU and RAM usage in detail.'),
]);

// --- Bot Initialization & Startup ---
async function start() {
  try {
    // Dynamic imports to ensure config.js is created before other modules load.
    const { initializeRuntime, client, token } = await import('./src/core/runtime.js');
    const { initializeState } = await import('./src/state/botState.js');
    const { registerBotHandlers } = await import('./src/bootstrap.js');

    /** Validates environment variables and loads all persisted state from disk. */
    async function initialize() {
      initializeRuntime();
      await initializeState();
      console.log('Bot state loaded and initialized.');
    }

    await initialize();
    registerBotHandlers();
    await client.login(token);
    console.log('Bot logged in successfully.');
  } catch (error) {
    console.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

start();
