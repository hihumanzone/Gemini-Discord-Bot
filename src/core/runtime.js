import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';

import { initializeGeminiApiLogging } from '../services/geminiApiLogger.js';

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

export const activeRequests = new Set();

export function initializeRuntime() {
  const requiredVariables = ['GOOGLE_API_KEY', 'DISCORD_BOT_TOKEN'];
  const missingVariables = requiredVariables.filter((variableName) => !process.env[variableName]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
  }
}