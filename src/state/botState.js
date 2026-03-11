import fs from 'fs/promises';
import path from 'path';

import config from '../../config.js';
import {
  CHAT_HISTORIES_DIR,
  CONFIG_DIR,
  TEMP_DIR,
} from '../core/paths.js';
import {
  cloneDefaultGeminiToolPreferences,
  cloneDefaultServerSettings,
  normalizeGeminiToolPreferences,
} from '../constants.js';
import { Mutex } from './mutex.js';

const PERSISTED_STATE_KEYS = Object.freeze([
  'activeUsersInChannels',
  'customInstructions',
  'serverSettings',
  'userResponsePreference',
  'userGeminiToolPreferences',
  'alwaysRespondChannels',
  'channelWideChatHistory',
  'blacklistedUsers',
]);

export const state = {
  chatHistories: {},
  activeUsersInChannels: {},
  customInstructions: {},
  serverSettings: {},
  userResponsePreference: {},
  userGeminiToolPreferences: {},
  alwaysRespondChannels: {},
  channelWideChatHistory: {},
  blacklistedUsers: {},
};

export const chatHistoryLock = new Mutex();

const FILE_PATHS = Object.freeze({
  activeUsersInChannels: path.join(CONFIG_DIR, 'active_users_in_channels.json'),
  customInstructions: path.join(CONFIG_DIR, 'custom_instructions.json'),
  serverSettings: path.join(CONFIG_DIR, 'server_settings.json'),
  userResponsePreference: path.join(CONFIG_DIR, 'user_response_preference.json'),
  userGeminiToolPreferences: path.join(CONFIG_DIR, 'user_gemini_tool_preferences.json'),
  alwaysRespondChannels: path.join(CONFIG_DIR, 'always_respond_channels.json'),
  channelWideChatHistory: path.join(CONFIG_DIR, 'channel_wide_chathistory.json'),
  blacklistedUsers: path.join(CONFIG_DIR, 'blacklisted_users.json'),
});

let isSaving = false;
let savePending = false;

function resetState() {
  state.chatHistories = {};

  for (const key of PERSISTED_STATE_KEYS) {
    state[key] = {};
  }
}

function getSerializableState() {
  return Object.fromEntries(PERSISTED_STATE_KEYS.map((key) => [key, state[key]]));
}

async function ensureDataDirectories() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(CHAT_HISTORIES_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

async function syncChatHistoriesToDisk() {
  const existingFiles = new Set(
    (await fs.readdir(CHAT_HISTORIES_DIR)).filter((fileName) => fileName.endsWith('.json')),
  );
  const expectedFiles = new Set();

  const writeOperations = Object.entries(state.chatHistories).map(([historyId, history]) => {
    const fileName = `${historyId}.json`;
    expectedFiles.add(fileName);

    return fs.writeFile(
      path.join(CHAT_HISTORIES_DIR, fileName),
      JSON.stringify(history, null, 2),
      'utf-8',
    );
  });

  const deleteOperations = [...existingFiles]
    .filter((fileName) => !expectedFiles.has(fileName))
    .map((fileName) => fs.unlink(path.join(CHAT_HISTORIES_DIR, fileName)).catch(() => {}));

  await Promise.all([...writeOperations, ...deleteOperations]);
}

export async function saveStateToFile() {
  if (isSaving) {
    savePending = true;
    return;
  }

  isSaving = true;

  try {
    await ensureDataDirectories();
    await syncChatHistoriesToDisk();

    const serializableState = getSerializableState();
    const fileWrites = Object.entries(FILE_PATHS).map(([key, filePath]) =>
      fs.writeFile(filePath, JSON.stringify(serializableState[key], null, 2), 'utf-8'),
    );

    await Promise.all(fileWrites);
  } catch (error) {
    console.error('Error saving state to files:', error);
  } finally {
    isSaving = false;

    if (savePending) {
      savePending = false;
      await saveStateToFile();
    }
  }
}

async function loadChatHistories() {
  const files = await fs.readdir(CHAT_HISTORIES_DIR);

  await Promise.all(
    files
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => {
        const historyId = path.basename(fileName, '.json');

        try {
          const fileContents = await fs.readFile(path.join(CHAT_HISTORIES_DIR, fileName), 'utf-8');
          state.chatHistories[historyId] = JSON.parse(fileContents);
        } catch (error) {
          console.error(`Error reading chat history for ${historyId}:`, error);
        }
      }),
  );
}

async function loadPersistedState() {
  await Promise.all(
    Object.entries(FILE_PATHS).map(async ([key, filePath]) => {
      try {
        const fileContents = await fs.readFile(filePath, 'utf-8');
        state[key] = JSON.parse(fileContents);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error reading ${key} from ${filePath}:`, error);
        }
      }
    }),
  );
}

function removeFileDataFromHistories() {
  try {
    for (const messagesById of Object.values(state.chatHistories)) {
      for (const messageEntries of Object.values(messagesById)) {
        for (const message of messageEntries) {
          if (!Array.isArray(message.content)) {
            continue;
          }

          message.content = message.content.filter((contentItem) => {
            if (contentItem.fileData) {
              delete contentItem.fileData;
            }

            return Object.keys(contentItem).length > 0;
          });
        }
      }
    }

    console.log('fileData elements have been removed from chat histories.');
  } catch (error) {
    console.error('An error occurred while removing fileData elements:', error);
  }
}

export function getTimeUntilNextReset() {
  const now = new Date();
  const nextReset = new Date();
  nextReset.setHours(0, 0, 0, 0);

  if (nextReset <= now) {
    nextReset.setDate(now.getDate() + 1);
  }

  const timeLeftMillis = nextReset - now;
  const hours = Math.floor(timeLeftMillis / 3_600_000);
  const minutes = Math.floor((timeLeftMillis % 3_600_000) / 60_000);
  const seconds = Math.floor((timeLeftMillis % 60_000) / 1_000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function scheduleDailyReset() {
  try {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(0, 0, 0, 0);

    if (nextReset <= now) {
      nextReset.setDate(now.getDate() + 1);
    }

    const timeUntilNextReset = nextReset - now;

    setTimeout(async () => {
      console.log('Running daily cleanup task...');

      await chatHistoryLock.runExclusive(async () => {
        removeFileDataFromHistories();
        await saveStateToFile();
      });

      console.log('Daily cleanup task finished.');
      scheduleDailyReset();
    }, timeUntilNextReset);
  } catch (error) {
    console.error('An error occurred while scheduling the daily reset:', error);
  }
}

export async function initializeState() {
  resetState();
  await ensureDataDirectories();
  await loadChatHistories();
  await loadPersistedState();
  scheduleDailyReset();
}

export function getHistory(historyId) {
  return Object.values(state.chatHistories[historyId] || {})
    .flat()
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : entry.role,
      parts: entry.content,
    }));
}

export function updateChatHistory(historyId, newHistory, messageId) {
  if (!state.chatHistories[historyId]) {
    state.chatHistories[historyId] = {};
  }

  if (!state.chatHistories[historyId][messageId]) {
    state.chatHistories[historyId][messageId] = [];
  }

  state.chatHistories[historyId][messageId] = [
    ...state.chatHistories[historyId][messageId],
    ...newHistory,
  ];
}

export function getUserResponsePreference(userId) {
  return state.userResponsePreference[userId] || config.defaultResponseFormat;
}

export function getUserGeminiToolPreferences(userId) {
  if (!state.userGeminiToolPreferences[userId]) {
    state.userGeminiToolPreferences[userId] = cloneDefaultGeminiToolPreferences();
  }

  state.userGeminiToolPreferences[userId] = normalizeGeminiToolPreferences(
    state.userGeminiToolPreferences[userId],
  );
  return state.userGeminiToolPreferences[userId];
}

export function initializeGuildState(guildId) {
  if (!guildId) {
    return;
  }

  if (!state.blacklistedUsers[guildId]) {
    state.blacklistedUsers[guildId] = [];
  }

  if (!state.serverSettings[guildId]) {
    state.serverSettings[guildId] = cloneDefaultServerSettings();
  }
}

export function getServerSettings(guildId) {
  initializeGuildState(guildId);
  return state.serverSettings[guildId];
}

export function isUserBlacklisted(guildId, userId) {
  if (!guildId) {
    return false;
  }

  initializeGuildState(guildId);
  return state.blacklistedUsers[guildId].includes(userId);
}

export function isChannelUserActive(channelId, userId) {
  return Boolean(state.activeUsersInChannels[channelId]?.[userId]);
}

export function toggleChannelUserActive(channelId, userId) {
  if (!state.activeUsersInChannels[channelId]) {
    state.activeUsersInChannels[channelId] = {};
  }

  if (state.activeUsersInChannels[channelId][userId]) {
    delete state.activeUsersInChannels[channelId][userId];
    return false;
  }

  state.activeUsersInChannels[channelId][userId] = true;
  return true;
}

export function setAlwaysRespondChannel(channelId, enabled) {
  if (enabled) {
    state.alwaysRespondChannels[channelId] = true;
    return;
  }

  delete state.alwaysRespondChannels[channelId];
}

export function setChannelWideChatHistory(channelId, enabled, instructions) {
  if (enabled) {
    state.channelWideChatHistory[channelId] = true;
    state.customInstructions[channelId] = instructions;
    return;
  }

  delete state.channelWideChatHistory[channelId];
  delete state.customInstructions[channelId];
  delete state.chatHistories[channelId];
}

export function setCustomInstruction(targetId, instructions) {
  state.customInstructions[targetId] = instructions;
}

export function clearCustomInstruction(targetId) {
  delete state.customInstructions[targetId];
}

export function clearChatHistoryFor(targetId) {
  state.chatHistories[targetId] = {};
}

export function toggleUserResponseFormat(userId) {
  const nextPreference = getUserResponsePreference(userId) === 'Normal' ? 'Embedded' : 'Normal';
  state.userResponsePreference[userId] = nextPreference;
  return nextPreference;
}

export function setUserGeminiToolPreference(userId, toolName, enabled) {
  state.userGeminiToolPreferences[userId] = {
    ...getUserGeminiToolPreferences(userId),
    [toolName]: enabled,
  };

  return state.userGeminiToolPreferences[userId];
}

export function toggleServerSetting(guildId, settingName) {
  const settings = getServerSettings(guildId);
  settings[settingName] = !settings[settingName];
  return settings[settingName];
}

export function toggleServerResponseStyle(guildId) {
  const settings = getServerSettings(guildId);
  settings.responseStyle = settings.responseStyle === 'Embedded' ? 'Normal' : 'Embedded';
  return settings.responseStyle;
}

export function addBlacklistedUser(guildId, userId) {
  initializeGuildState(guildId);

  if (state.blacklistedUsers[guildId].includes(userId)) {
    return false;
  }

  state.blacklistedUsers[guildId].push(userId);
  return true;
}

export function removeBlacklistedUser(guildId, userId) {
  initializeGuildState(guildId);
  const index = state.blacklistedUsers[guildId].indexOf(userId);

  if (index === -1) {
    return false;
  }

  state.blacklistedUsers[guildId].splice(index, 1);
  return true;
}