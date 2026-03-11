import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';

import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import {
  GoogleGenAI,
  createPartFromUri,
} from '@google/genai';

import { initializeGeminiApiLogging } from '../services/geminiApiLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const CHAT_HISTORIES_DIR = path.join(CONFIG_DIR, 'chat_histories_4');
export const TEMP_DIR = path.join(ROOT_DIR, 'temp');

export const token = process.env.DISCORD_BOT_TOKEN;

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

initializeGeminiApiLogging();

export const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
export { createPartFromUri };

export const activeRequests = new Set();

export function initializeRuntime() {
  const requiredVariables = ['GOOGLE_API_KEY', 'DISCORD_BOT_TOKEN'];
  const missingVariables = requiredVariables.filter((variableName) => !process.env[variableName]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
  }
}