import { initialize } from './botManager.js';
import { client, token } from './src/core/runtime.js';
import { registerBotHandlers } from './src/bootstrap.js';

async function start() {
  try {
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
