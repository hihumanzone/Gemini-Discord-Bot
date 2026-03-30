/**
 * Bot initialization module.
 * Validates the environment, loads persisted state, and prepares the bot for startup.
 * Import runtime objects (client, genAI, etc.) directly from src/core/runtime.js.
 * Import state functions directly from src/state/botState.js.
 */

import { initializeRuntime } from './src/core/runtime.js';
import { initializeState } from './src/state/botState.js';

/** Validates environment variables and loads all persisted state from disk. */
export async function initialize() {
  initializeRuntime();
  await initializeState();
  console.log('Bot state loaded and initialized.');
}
