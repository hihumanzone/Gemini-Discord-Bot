/**
 * Central bot state module.
 * Owns the in-memory state object and exposes accessor/mutator functions.
 * Persistence and session internals are delegated to focused submodules.
 */

import config from '../../config.js';
import {
  ENABLE_NANO_BANANA_MODE,
  cloneDefaultChannelSettings,
  cloneDefaultGeminiToolPreferences,
  cloneDefaultServerSettings,
  normalizeChannelSettings,
  normalizeGeminiToolPreferences,
} from '../constants.js';
import { Mutex } from './mutex.js';
import {
  PERSISTED_STATE_KEYS,
  clearDirtyTracking,
  ensureDataDirectories,
  loadChatHistories,
  loadPersistedState,
  markHistoryDeleted,
  markHistoryDirty,
  saveStateToFile as persistSave,
  saveStateToFileImmediate as persistSaveImmediate,
} from './persistence.js';
import {
  normalizeUserSessionState,
  getUserSessionHistoryId,
  createSession as createSessionInternal,
  renameSession as renameSessionInternal,
  deleteSession as deleteSessionInternal,
} from './sessionState.js';

// ---------------------------------------------------------------------------
// State object
// ---------------------------------------------------------------------------

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
  userNanoBananaMode: {},
  userResponseActionButtons: {},
};

export const chatHistoryLock = new Mutex();

// ---------------------------------------------------------------------------
// Persistence wrappers (thin delegates to persistence.js)
// ---------------------------------------------------------------------------

/** Schedule a debounced save of the current state. */
export function saveStateToFile() {
  persistSave(state);
}

/** Force an immediate save, bypassing debounce. */
export async function saveStateToFileImmediate() {
  await persistSaveImmediate(state);
}

// ---------------------------------------------------------------------------
// State initialization
// ---------------------------------------------------------------------------

function resetState() {
  state.chatHistories = {};
  for (const key of PERSISTED_STATE_KEYS) {
    state[key] = {};
  }
  clearDirtyTracking();
}

/**
 * Strip binary `fileData` elements from all chat histories.
 * Called during the daily cleanup to reduce disk usage.
 */
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

// ---------------------------------------------------------------------------
// Daily reset
// ---------------------------------------------------------------------------

/** Calculate the human-readable time until the next midnight UTC. */
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

    dailyResetTimer = setTimeout(async () => {
      console.log('Running daily cleanup task...');

      await chatHistoryLock.runExclusive(async () => {
        removeFileDataFromHistories();
        for (const historyId of Object.keys(state.chatHistories)) {
          markHistoryDirty(historyId);
        }
        await saveStateToFileImmediate();
      });

      console.log('Daily cleanup task finished.');
      scheduleDailyReset();
    }, nextReset - now);
  } catch (error) {
    console.error('An error occurred while scheduling the daily reset:', error);
  }
}

/** Load persisted data from disk and schedule the daily cleanup. */
export async function initializeState() {
  resetState();
  await ensureDataDirectories();
  await loadChatHistories(state);
  await loadPersistedState(state);
  scheduleDailyReset();
}

// ---------------------------------------------------------------------------
// Chat history accessors
// ---------------------------------------------------------------------------

/**
 * Retrieve a flat history array suitable for passing to Gemini as context.
 * @param {string} historyId - The history key.
 * @param {number} [maxElements=0] - Max message groups to include (0 = unlimited).
 * @returns {Array<{role: string, parts: *}>}
 */
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

/**
 * Append messages to a chat history under a given message ID key.
 * @param {string} historyId - The history key.
 * @param {Array} newHistory - The entries to append.
 * @param {string} messageId - The Discord message ID grouping key.
 */
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

  markHistoryDirty(historyId);
}

/** Clear the chat history for a given target (user, channel, or guild). */
export function clearChatHistoryFor(targetId) {
  state.chatHistories[targetId] = {};
  markHistoryDirty(targetId);
}

/**
 * Delete a single message entry from a chat history.
 * @returns {boolean} True if the entry existed and was removed.
 */
export function deleteChatHistoryEntry(historyId, messageId) {
  if (state.chatHistories[historyId]?.[messageId]) {
    delete state.chatHistories[historyId][messageId];
    markHistoryDirty(historyId);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

/** Get a user's preferred response format ("Embedded" or "Normal"). */
export function getUserResponsePreference(userId) {
  return state.userResponsePreference[userId] || config.defaultResponseFormat;
}

/** Toggle between "Embedded" and "Normal" response formats. */
export function toggleUserResponseFormat(userId) {
  const nextPreference = getUserResponsePreference(userId) === 'Normal' ? 'Embedded' : 'Normal';
  state.userResponsePreference[userId] = nextPreference;
  return nextPreference;
}

/** Get whether a user has action buttons enabled. */
export function getUserResponseActionButtons(userId) {
  if (state.userResponseActionButtons[userId] === undefined) {
    return config.defaultResponseActionButtons !== undefined ? config.defaultResponseActionButtons : true;
  }
  return state.userResponseActionButtons[userId];
}

/** Toggle action buttons on/off for a user. */
export function toggleUserResponseActionButtons(userId) {
  const current = getUserResponseActionButtons(userId);
  state.userResponseActionButtons[userId] = !current;
  return !current;
}

// ---------------------------------------------------------------------------
// Gemini tool preferences
// ---------------------------------------------------------------------------

const normalizedToolPreferences = new Set();

/** Get a user's Gemini tool preferences, normalizing on first access. */
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

/** Set a single Gemini tool preference for a user. */
export function setUserGeminiToolPreference(userId, toolName, enabled) {
  state.userGeminiToolPreferences[userId] = {
    ...getUserGeminiToolPreferences(userId),
    [toolName]: enabled,
  };
  normalizedToolPreferences.delete(userId);
  return state.userGeminiToolPreferences[userId];
}

// ---------------------------------------------------------------------------
// Nano Banana mode
// ---------------------------------------------------------------------------

/** Get a user's Nano Banana mode state, initializing defaults if needed. */
export function getUserNanoBananaMode(userId) {
  if (!ENABLE_NANO_BANANA_MODE) {
    return { enabled: false, googleSearch: false, imageSearch: false };
  }

  if (!state.userNanoBananaMode[userId]) {
    state.userNanoBananaMode[userId] = { enabled: false, googleSearch: false, imageSearch: false };
  }
  return state.userNanoBananaMode[userId];
}

/** Toggle the main Nano Banana mode flag. */
export function toggleNanoBananaModeState(userId) {
  if (!ENABLE_NANO_BANANA_MODE) {
    return false;
  }

  const mode = getUserNanoBananaMode(userId);
  mode.enabled = !mode.enabled;
  return mode.enabled;
}

/** Toggle Nano Banana Google Search. Disabling also disables image search. */
export function toggleNanoBananaGoogleSearch(userId) {
  if (!ENABLE_NANO_BANANA_MODE) {
    return false;
  }

  const mode = getUserNanoBananaMode(userId);
  mode.googleSearch = !mode.googleSearch;
  if (!mode.googleSearch) {
    mode.imageSearch = false;
  }
  return mode.googleSearch;
}

/** Toggle Nano Banana Image Search. */
export function toggleNanoBananaImageSearch(userId) {
  if (!ENABLE_NANO_BANANA_MODE) {
    return false;
  }

  const mode = getUserNanoBananaMode(userId);
  mode.imageSearch = !mode.imageSearch;
  return mode.imageSearch;
}

// ---------------------------------------------------------------------------
// Guild / server state
// ---------------------------------------------------------------------------

const initializedGuilds = new Set();

/** Ensure a guild's state containers exist. */
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

/** Get server settings, initializing if needed. */
export function getServerSettings(guildId) {
  initializeGuildState(guildId);
  return state.serverSettings[guildId];
}

/** Check whether a user is on a guild's blacklist. */
export function isUserBlacklisted(guildId, userId) {
  if (!guildId) return false;
  initializeGuildState(guildId);
  return state.blacklistedUsers[guildId].includes(userId);
}

/**
 * Add a user to a guild's blacklist.
 * @returns {boolean} True if the user was newly added.
 */
export function addBlacklistedUser(guildId, userId) {
  initializeGuildState(guildId);
  if (state.blacklistedUsers[guildId].includes(userId)) {
    return false;
  }
  state.blacklistedUsers[guildId].push(userId);
  return true;
}

/**
 * Remove a user from a guild's blacklist.
 * @returns {boolean} True if the user was found and removed.
 */
export function removeBlacklistedUser(guildId, userId) {
  initializeGuildState(guildId);
  const index = state.blacklistedUsers[guildId].indexOf(userId);
  if (index === -1) return false;
  state.blacklistedUsers[guildId].splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Channel state
// ---------------------------------------------------------------------------

const initializedChannels = new Set();

/** Normalize and cache channel settings on first access. */
export function initializeChannelState(channelId) {
  if (!channelId || initializedChannels.has(channelId)) {
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

/** Get channel settings, initializing/normalizing if needed. */
export function getChannelSettings(channelId) {
  initializeChannelState(channelId);
  return state.channelSettings[channelId];
}

// ---------------------------------------------------------------------------
// Channel user tracking
// ---------------------------------------------------------------------------

/** Check if a user is in "always respond" mode for a specific channel. */
export function isChannelUserActive(channelId, userId) {
  return Boolean(state.activeUsersInChannels[channelId]?.[userId]);
}

/**
 * Toggle a user's "always respond" mode in a channel.
 * @returns {boolean} The new active state.
 */
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

// ---------------------------------------------------------------------------
// Channel-level settings mutators
// ---------------------------------------------------------------------------

/** Set the "always respond" flag for a channel. */
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

/**
 * Set the "channel-wide chat history" flag.
 * Disabling also removes the channel's chat history from memory and marks it for deletion.
 */
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
    markHistoryDeleted(channelId);
  }
  delete state.chatHistories[channelId];
}

// ---------------------------------------------------------------------------
// Custom instructions
// ---------------------------------------------------------------------------

/** Get custom instructions for a target (user, channel, or guild). */
export function getCustomInstruction(targetId) {
  return state.customInstructions[targetId];
}

/** Set custom instructions for a target. */
export function setCustomInstruction(targetId, instructions) {
  state.customInstructions[targetId] = instructions;
}

/** Remove custom instructions for a target. */
export function clearCustomInstruction(targetId) {
  delete state.customInstructions[targetId];
}

// ---------------------------------------------------------------------------
// Generic setting cycling utility
// ---------------------------------------------------------------------------

/**
 * Cycle a setting through an ordered list of values.
 * @param {Object} settingsObj - The settings object containing the key.
 * @param {string} key - The property name to cycle.
 * @param {string[]} values - The ordered list of valid values.
 * @returns {string} The new value after cycling.
 */
function cycleSetting(settingsObj, key, values) {
  const currentIndex = values.indexOf(settingsObj[key]);
  settingsObj[key] = values[(currentIndex + 1) % values.length];
  return settingsObj[key];
}

const TRI_STATE_VALUES = ['on', 'off', 'decide'];
const RESPONSE_STYLE_VALUES = ['Embedded', 'Normal', 'decide'];

// ---------------------------------------------------------------------------
// Server-level settings mutators
// ---------------------------------------------------------------------------

/** Toggle a boolean server setting. */
export function toggleServerSetting(guildId, settingName) {
  const settings = getServerSettings(guildId);
  settings[settingName] = !settings[settingName];
  return settings[settingName];
}

/** Cycle the server response style through Embedded -> Normal -> decide. */
export function cycleServerResponseStyle(guildId) {
  return cycleSetting(getServerSettings(guildId), 'responseStyle', RESPONSE_STYLE_VALUES);
}

/** Cycle the server action buttons setting through on -> off -> decide. */
export function cycleServerResponseActionButtons(guildId) {
  return cycleSetting(getServerSettings(guildId), 'settingsSaveButton', TRI_STATE_VALUES);
}

/** Toggle a boolean channel setting. */
export function toggleChannelSetting(channelId, settingName) {
  const settings = getChannelSettings(channelId);
  settings[settingName] = !settings[settingName];
  invalidateChannelState(channelId);
  return settings[settingName];
}

/** Cycle the channel response style through Embedded -> Normal -> decide. */
export function cycleChannelResponseStyle(channelId) {
  const result = cycleSetting(getChannelSettings(channelId), 'responseStyle', RESPONSE_STYLE_VALUES);
  invalidateChannelState(channelId);
  return result;
}

/** Cycle the channel action buttons setting through on -> off -> decide. */
export function cycleChannelResponseActionButtons(channelId) {
  const result = cycleSetting(getChannelSettings(channelId), 'settingsSaveButton', TRI_STATE_VALUES);
  invalidateChannelState(channelId);
  return result;
}

// ---------------------------------------------------------------------------
// Action button visibility resolution
// ---------------------------------------------------------------------------

/**
 * Determine whether action buttons should be shown, checking channel -> server -> user preference.
 * @param {string|null} guildId - The guild ID, or null for DMs.
 * @param {string} userId - The user ID.
 * @param {string|null} [channelId=null] - The channel ID.
 * @returns {boolean}
 */
export function shouldShowActionButtons(guildId, userId, channelId = null) {
  if (channelId) {
    const channelSetting = getChannelSettings(channelId).settingsSaveButton || 'decide';
    if (channelSetting === 'on') return true;
    if (channelSetting === 'off') return false;
  }

  const serverSetting = guildId
    ? (state.serverSettings[guildId]?.settingsSaveButton || 'decide')
    : 'decide';

  if (serverSetting === 'on') return true;
  if (serverSetting === 'off') return false;

  return getUserResponseActionButtons(userId);
}

// ---------------------------------------------------------------------------
// Session management (delegates to sessionState.js)
// ---------------------------------------------------------------------------

/** Re-export for external consumers. */
export { getUserSessionHistoryId };

/** Get normalized session state for a user. */
export function getUserSessions(userId) {
  return normalizeUserSessionState(state, userId);
}

/** Get the chat history ID for the user's currently active session. */
export function getActiveSessionHistoryId(userId) {
  const userState = getUserSessions(userId);
  return getUserSessionHistoryId(userId, userState.activeSessionId);
}

/** Switch the user's active session. */
export function setActiveSession(userId, sessionId) {
  const userState = getUserSessions(userId);
  if (!userState.sessions[sessionId]) return false;
  userState.activeSessionId = sessionId;
  saveStateToFile();
  return true;
}

/** Create a new session for a user. */
export function createSession(userId, sessionId, sessionName) {
  return createSessionInternal(state, userId, sessionId, sessionName, getUserSessions, saveStateToFile);
}

/** Rename an existing session. */
export function renameSession(userId, sessionId, newName) {
  return renameSessionInternal(userId, sessionId, newName, getUserSessions, saveStateToFile);
}

/** Delete a session and its chat history. */
export function deleteSession(userId, sessionId) {
  return deleteSessionInternal(state, userId, sessionId, getUserSessions, markHistoryDeleted, saveStateToFile);
}
