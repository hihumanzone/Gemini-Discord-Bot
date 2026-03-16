import fs from 'fs/promises';
import path from 'path';

import config from '../../config.js';
import {
  CHAT_HISTORIES_DIR,
  CONFIG_DIR,
  TEMP_DIR,
} from '../core/paths.js';
import {
  cloneDefaultChannelSettings,
  cloneDefaultGeminiToolPreferences,
  cloneDefaultServerSettings,
  normalizeChannelSettings,
  normalizeGeminiToolPreferences,
} from '../constants.js';
import { Mutex } from './mutex.js';
import {
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_NAME,
  MAX_SESSION_NAME_LENGTH,
  SESSION_ID_PATTERN,
  normalizeSessionName,
} from '../utils/sessionConstants.js';

const PERSISTED_STATE_KEYS = Object.freeze([
  'activeUsersInChannels',
  'customInstructions',
  'serverSettings',
  'channelSettings',
  'userResponsePreference',
  'userGeminiToolPreferences',
  'alwaysRespondChannels',
  'channelWideChatHistory',
  'blacklistedUsers',
  'userSessions',
]);

export const state = {
  chatHistories: {},
  activeUsersInChannels: {},
  customInstructions: {},
  serverSettings: {},
  channelSettings: {},
  userResponsePreference: {},
  userGeminiToolPreferences: {},
  alwaysRespondChannels: {},
  channelWideChatHistory: {},
  blacklistedUsers: {},
  userSessions: {},
};

export const chatHistoryLock = new Mutex();

// Track which chat histories have been modified since last save
const dirtyChatHistories = new Set();
// Track chat histories that have been deleted since last save
const deletedChatHistories = new Set();

const SAVE_DEBOUNCE_MS = 2_000;

const FILE_PATHS = Object.freeze({
  activeUsersInChannels: path.join(CONFIG_DIR, 'active_users_in_channels.json'),
  customInstructions: path.join(CONFIG_DIR, 'custom_instructions.json'),
  serverSettings: path.join(CONFIG_DIR, 'server_settings.json'),
  channelSettings: path.join(CONFIG_DIR, 'channel_settings.json'),
  userResponsePreference: path.join(CONFIG_DIR, 'user_response_preference.json'),
  userGeminiToolPreferences: path.join(CONFIG_DIR, 'user_gemini_tool_preferences.json'),
  alwaysRespondChannels: path.join(CONFIG_DIR, 'always_respond_channels.json'),
  channelWideChatHistory: path.join(CONFIG_DIR, 'channel_wide_chathistory.json'),
  blacklistedUsers: path.join(CONFIG_DIR, 'blacklisted_users.json'),
  userSessions: path.join(CONFIG_DIR, 'user_sessions.json'),
});

let isSaving = false;
let saveDebounceTimer = null;

function resetState() {
  state.chatHistories = {};

  for (const key of PERSISTED_STATE_KEYS) {
    state[key] = {};
  }

  dirtyChatHistories.clear();
  deletedChatHistories.clear();
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
  // Only write histories that have been modified
  const writeOperations = [...dirtyChatHistories].map((historyId) => {
    const history = state.chatHistories[historyId];
    if (!history) return Promise.resolve();
    return fs.writeFile(
      path.join(CHAT_HISTORIES_DIR, `${historyId}.json`),
      JSON.stringify(history, null, 2),
      'utf-8',
    );
  });

  // Only delete histories that have been explicitly removed
  const deleteOperations = [...deletedChatHistories].map((historyId) =>
    fs.unlink(path.join(CHAT_HISTORIES_DIR, `${historyId}.json`)).catch(() => {}),
  );

  await Promise.all([...writeOperations, ...deleteOperations]);
  dirtyChatHistories.clear();
  deletedChatHistories.clear();
}

let directoriesEnsured = false;

async function executeSave() {
  if (isSaving) return;
  isSaving = true;

  try {
    if (!directoriesEnsured) {
      await ensureDataDirectories();
      directoriesEnsured = true;
    }
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
  }
}

export async function saveStateToFile() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    executeSave();
  }, SAVE_DEBOUNCE_MS);
}

/** Force an immediate save, bypassing the debounce. Used for critical operations. */
export async function saveStateToFileImmediate() {
  clearTimeout(saveDebounceTimer);
  await executeSave();
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

let dailyResetTimer = null;

function scheduleDailyReset() {
  try {
    clearTimeout(dailyResetTimer);

    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(0, 0, 0, 0);

    if (nextReset <= now) {
      nextReset.setDate(now.getDate() + 1);
    }

    const timeUntilNextReset = nextReset - now;

    dailyResetTimer = setTimeout(async () => {
      console.log('Running daily cleanup task...');

      await chatHistoryLock.runExclusive(async () => {
        removeFileDataFromHistories();
        // Mark all histories dirty after cleanup modifies them
        for (const historyId of Object.keys(state.chatHistories)) {
          dirtyChatHistories.add(historyId);
        }
        await saveStateToFileImmediate();
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

export function getHistory(historyId, maxElements = 0) {
  const elements = Object.values(state.chatHistories[historyId] || {});
  const limited = maxElements > 0 ? elements.slice(-maxElements) : elements;
  return limited
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

  dirtyChatHistories.add(historyId);
}

export function getUserResponsePreference(userId) {
  return state.userResponsePreference[userId] || config.defaultResponseFormat;
}

const normalizedToolPreferences = new Set();

export function getUserGeminiToolPreferences(userId) {
  if (!state.userGeminiToolPreferences[userId]) {
    state.userGeminiToolPreferences[userId] = cloneDefaultGeminiToolPreferences();
    normalizedToolPreferences.add(userId);
    return state.userGeminiToolPreferences[userId];
  }

  if (!normalizedToolPreferences.has(userId)) {
    state.userGeminiToolPreferences[userId] = normalizeGeminiToolPreferences(
      state.userGeminiToolPreferences[userId],
    );
    normalizedToolPreferences.add(userId);
  }

  return state.userGeminiToolPreferences[userId];
}

const initializedGuilds = new Set();

export function initializeGuildState(guildId) {
  if (!guildId || initializedGuilds.has(guildId)) {
    return;
  }

  if (!state.blacklistedUsers[guildId]) {
    state.blacklistedUsers[guildId] = [];
  }

  if (!state.serverSettings[guildId]) {
    state.serverSettings[guildId] = cloneDefaultServerSettings();
  }

  initializedGuilds.add(guildId);
}

export function getServerSettings(guildId) {
  initializeGuildState(guildId);
  return state.serverSettings[guildId];
}

const initializedChannels = new Set();

export function initializeChannelState(channelId) {
  if (!channelId) {
    return;
  }

  // Skip re-normalization for already-initialized channels
  if (initializedChannels.has(channelId)) {
    return;
  }

  const existingSettings = state.channelSettings[channelId];
  const normalizedSettings = existingSettings
    ? normalizeChannelSettings(existingSettings)
    : cloneDefaultChannelSettings();

  normalizedSettings.alwaysRespond = Boolean(state.alwaysRespondChannels[channelId]);
  normalizedSettings.channelWideChatHistory = Boolean(state.channelWideChatHistory[channelId]);

  if (!existingSettings || !Object.hasOwn(existingSettings, 'customChannelPersonality')) {
    normalizedSettings.customChannelPersonality = Boolean(
      state.channelWideChatHistory[channelId] && state.customInstructions[channelId],
    );
  }

  state.channelSettings[channelId] = normalizedSettings;
  initializedChannels.add(channelId);
}

/** Invalidate a channel's cached initialization so it re-normalizes on next access. */
export function invalidateChannelState(channelId) {
  initializedChannels.delete(channelId);
}

export function getChannelSettings(channelId) {
  initializeChannelState(channelId);
  return state.channelSettings[channelId];
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
  const settings = getChannelSettings(channelId);
  settings.alwaysRespond = enabled;
  invalidateChannelState(channelId);

  if (enabled) {
    state.alwaysRespondChannels[channelId] = true;
    return;
  }

  delete state.alwaysRespondChannels[channelId];
}

export function setChannelWideChatHistory(channelId, enabled, instructions) {
  const settings = getChannelSettings(channelId);
  settings.channelWideChatHistory = enabled;
  invalidateChannelState(channelId);

  if (enabled) {
    state.channelWideChatHistory[channelId] = true;

    if (instructions !== undefined) {
      state.customInstructions[channelId] = instructions;
    }

    return;
  }

  delete state.channelWideChatHistory[channelId];
  if (state.chatHistories[channelId]) {
    deletedChatHistories.add(channelId);
  }
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
  dirtyChatHistories.add(targetId);
}

export function deleteChatHistoryEntry(historyId, messageId) {
  if (state.chatHistories[historyId]?.[messageId]) {
    delete state.chatHistories[historyId][messageId];
    dirtyChatHistories.add(historyId);
    return true;
  }
  return false;
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

  normalizedToolPreferences.delete(userId);
  return state.userGeminiToolPreferences[userId];
}

export function toggleServerSetting(guildId, settingName) {
  const settings = getServerSettings(guildId);
  settings[settingName] = !settings[settingName];
  return settings[settingName];
}

export function toggleChannelSetting(channelId, settingName) {
  const settings = getChannelSettings(channelId);
  settings[settingName] = !settings[settingName];
  invalidateChannelState(channelId);
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

function createDefaultSessionState() {
  return {
    activeSessionId: DEFAULT_SESSION_ID,
    sessions: {
      [DEFAULT_SESSION_ID]: { name: DEFAULT_SESSION_NAME },
    },
  };
}

function normalizeSessionEntry(entry) {
  if (typeof entry === 'string' && entry.trim()) {
    return { name: entry.trim() };
  }

  if (entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim()) {
    return { name: entry.name.trim() };
  }

  return null;
}

function normalizeUserSessionState(userId) {
  const existing = state.userSessions[userId];

  if (!existing || typeof existing !== 'object') {
    state.userSessions[userId] = createDefaultSessionState();
    return state.userSessions[userId];
  }

  const normalizedSessions = {};
  if (existing.sessions && typeof existing.sessions === 'object') {
    for (const [sessionId, entry] of Object.entries(existing.sessions)) {
      if (!sessionId || typeof sessionId !== 'string') {
        continue;
      }

      const normalized = normalizeSessionEntry(entry);
      if (normalized) {
        normalizedSessions[sessionId] = normalized;
      }
    }
  }

  if (!normalizedSessions[DEFAULT_SESSION_ID]) {
    normalizedSessions[DEFAULT_SESSION_ID] = { name: DEFAULT_SESSION_NAME };
  }

  const activeSessionId =
    typeof existing.activeSessionId === 'string' && normalizedSessions[existing.activeSessionId]
      ? existing.activeSessionId
      : DEFAULT_SESSION_ID;

  state.userSessions[userId] = {
    activeSessionId,
    sessions: normalizedSessions,
  };

  return state.userSessions[userId];
}

export function getUserSessions(userId) {
  return normalizeUserSessionState(userId);
}

export function getUserSessionHistoryId(userId, sessionId) {
  return sessionId === DEFAULT_SESSION_ID ? userId : `${userId}_${sessionId}`;
}

export function getActiveSessionHistoryId(userId) {
  const userState = getUserSessions(userId);
  return getUserSessionHistoryId(userId, userState.activeSessionId);
}

export function setActiveSession(userId, sessionId) {
  const userState = getUserSessions(userId);

  if (!userState.sessions[sessionId]) {
    return false;
  }

  userState.activeSessionId = sessionId;
  saveStateToFile();
  return true;
}

export function createSession(userId, sessionId, sessionName) {
  const userState = getUserSessions(userId);
  const normalizedName = normalizeSessionName(sessionName);

  if (!SESSION_ID_PATTERN.test(sessionId) || !normalizedName) {
    return false;
  }

  if (userState.sessions[sessionId]) {
    return false;
  }

  userState.sessions[sessionId] = { name: normalizedName };
  saveStateToFile();
  return true;
}

export function renameSession(userId, sessionId, newName) {
  const userState = getUserSessions(userId);
  const normalizedName = normalizeSessionName(newName);

  if (!userState.sessions[sessionId] || sessionId === DEFAULT_SESSION_ID || !normalizedName) {
    return false;
  }

  userState.sessions[sessionId].name = normalizedName;
  saveStateToFile();
  return true;
}

export function deleteSession(userId, sessionId) {
  if (sessionId === DEFAULT_SESSION_ID) {
    return false;
  }

  const userState = getUserSessions(userId);
  if (!userState.sessions[sessionId]) {
    return false;
  }

  const historyId = getUserSessionHistoryId(userId, sessionId);

  delete userState.sessions[sessionId];
  if (userState.activeSessionId === sessionId) {
    userState.activeSessionId = DEFAULT_SESSION_ID;
  }

  delete state.chatHistories[historyId];
  deletedChatHistories.add(historyId);
  saveStateToFile();
  return true;
}