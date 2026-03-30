import { initializeBot } from './initializeBot.js';
import { client, token } from '../core/runtime.js';
import { registerBotHandlers } from '../bootstrap.js';

async function start() {
  try {
    await initializeBot();
    registerBotHandlers();
    await client.login(token);
    console.log('Bot logged in successfully.');
  } catch (error) {
    console.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

start();
