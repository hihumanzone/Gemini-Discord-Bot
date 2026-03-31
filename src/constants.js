import { ActivityType } from 'discord.js';
import { HarmBlockThreshold, HarmCategory } from '@google/genai';

import config from '../config.js';

export const MODEL = config.defaultModel;
export const MAX_GENERATION_ATTEMPTS = config.maxGenerationAttempts;
export const MESSAGE_TYPING_INTERVAL_MS = 4_000;
export const MESSAGE_TYPING_TIMEOUT_MS = 120_000;
export const PRESENCE_ROTATION_INTERVAL_MS = 30_000;
export const STATUS_REFRESH_INTERVAL_MS = 2_000;
export const STATUS_LIFETIME_MS = 30_000;
export const STREAM_UPDATE_DEBOUNCE_MS = 500;
export const VIDEO_POLL_INTERVAL_MS = 10_000;
export const TEXT_FILE_TTL_MINUTES = 10_080;
export const EXTERNAL_TEXT_SHARE_URL = 'https://pastes.dev';
export const EXTERNAL_TEXT_SHARE_API_URL = 'https://api.pastes.dev';

export const DEFAULT_RESPONSE_FORMAT = config.defaultResponseFormat;
export const EMBED_COLOR = config.hexColour;
export const DEFAULT_PERSONALITY = config.defaultPersonality;
export const DEFAULT_SERVER_SETTINGS = Object.freeze({
  ...config.defaultServerSettings,
});
export const DEFAULT_CHANNEL_SETTINGS = Object.freeze({
  ...config.defaultChannelSettings,
});
export const WORK_IN_DMS = config.workInDMs;
export const DISPLAY_PERSONALITY_BUTTONS = config.shouldDisplayPersonalityButtons;
export const SEND_RETRY_ERRORS_TO_DISCORD = config.SEND_RETRY_ERRORS_TO_DISCORD;
export const ENABLE_NANO_BANANA_MODE = config.enableNanoBananaMode !== false;

export const DEFAULT_GEMINI_TOOL_PREFERENCES = Object.freeze({
  ...config.defaultGeminiToolPreferences,
});

export const PRESENCE_ACTIVITIES = config.activities.map((activity) => ({
  name: activity.name,
  type: ActivityType[activity.type],
}));

export const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const GENERATION_CONFIG = Object.freeze({
  temperature: 1.0,
  topP: 0.95,
  thinkingConfig: {
    thinkingBudget: -1,
  },
});

export const GEMINI_TOOL_ORDER = Object.freeze(['googleSearch', 'urlContext', 'codeExecution']);

export const GEMINI_TOOL_CONFIGS = Object.freeze({
  googleSearch: Object.freeze({ googleSearch: {} }),
  urlContext: Object.freeze({ urlContext: {} }),
  codeExecution: Object.freeze({ codeExecution: {} }),
});

export const GEMINI_TOOLS = Object.freeze(
  GEMINI_TOOL_ORDER.map((toolName) => GEMINI_TOOL_CONFIGS[toolName]),
);

export const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.xml',
  '.csv',
  '.py',
  '.java',
  '.sql',
  '.log',
  '.md',
  '.txt',
  '.docx',
  '.pptx',
  '.xlsx',
  '.odt',
  '.odp',
  '.ods',
  '.rtf',
  '.svg',
]);

export const EMBED_RESPONSE_LIMIT = 3_900;
export const PLAIN_RESPONSE_LIMIT = 1_900;

export function cloneDefaultServerSettings() {
  return structuredClone(DEFAULT_SERVER_SETTINGS);
}

export function cloneDefaultChannelSettings() {
  return structuredClone(DEFAULT_CHANNEL_SETTINGS);
}

export function cloneDefaultGeminiToolPreferences() {
  return { ...DEFAULT_GEMINI_TOOL_PREFERENCES };
}

export function normalizeChannelSettings(settings = {}) {
  const normalized = { ...DEFAULT_CHANNEL_SETTINGS };
  for (const key of Object.keys(normalized)) {
    if (settings[key] !== undefined) {
      if (typeof DEFAULT_CHANNEL_SETTINGS[key] === 'boolean') {
        normalized[key] = Boolean(settings[key]);
      } else {
        normalized[key] = settings[key];
      }
    }
  }
  return normalized;
}

export function normalizeGeminiToolPreferences(preferences = {}) {
  return {
    ...DEFAULT_GEMINI_TOOL_PREFERENCES,
    ...Object.fromEntries(
      GEMINI_TOOL_ORDER.map((toolName) => [toolName, preferences[toolName] !== undefined ? Boolean(preferences[toolName]) : DEFAULT_GEMINI_TOOL_PREFERENCES[toolName]]),
    ),
  };
}

export function buildGeminiToolsFromPreferences(preferences = {}) {
  const normalizedPreferences = normalizeGeminiToolPreferences(preferences);
  return GEMINI_TOOL_ORDER
    .filter((toolName) => normalizedPreferences[toolName])
    .map((toolName) => GEMINI_TOOL_CONFIGS[toolName]);
}
