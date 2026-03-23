/**
 * State persistence layer.
 * Handles saving/loading bot state to/from disk, including chat history
 * file management and debounced writes.
 */

import fs from 'fs/promises';
import path from 'path';

import {
  CHAT_HISTORIES_DIR,
  DATA_DIR,
  TEMP_DIR,
} from '../core/paths.js';

/** Keys in the state object that are persisted to individual JSON files. */
export const PERSISTED_STATE_KEYS = Object.freeze([
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
  'userNanoBananaMode',
  'userResponseActionButtons',
]);

/** Maps each persisted key to its file path on disk. */
export const FILE_PATHS = Object.freeze({
  activeUsersInChannels: path.join(DATA_DIR, 'active_users_in_channels.json'),
  customInstructions: path.join(DATA_DIR, 'custom_instructions.json'),
  serverSettings: path.join(DATA_DIR, 'server_settings.json'),
  channelSettings: path.join(DATA_DIR, 'channel_settings.json'),
  userResponsePreference: path.join(DATA_DIR, 'user_response_preference.json'),
  userGeminiToolPreferences: path.join(DATA_DIR, 'user_gemini_tool_preferences.json'),
  alwaysRespondChannels: path.join(DATA_DIR, 'always_respond_channels.json'),
  channelWideChatHistory: path.join(DATA_DIR, 'channel_wide_chathistory.json'),
  blacklistedUsers: path.join(DATA_DIR, 'blacklisted_users.json'),
  userSessions: path.join(DATA_DIR, 'user_sessions.json'),
  userNanoBananaMode: path.join(DATA_DIR, 'user_nano_banana_mode.json'),
  userResponseActionButtons: path.join(DATA_DIR, 'user_response_action_buttons.json'),
});

const SAVE_DEBOUNCE_MS = 2_000;

/** Tracks chat history IDs that have been modified since the last save. */
const dirtyChatHistories = new Set();

/** Tracks chat history IDs that have been deleted since the last save. */
const deletedChatHistories = new Set();

let isSaving = false;
let saveDebounceTimer = null;
let directoriesEnsured = false;

/** Mark a chat history as modified so it will be written on the next save. */
export function markHistoryDirty(historyId) {
  dirtyChatHistories.add(historyId);
}

/** Mark a chat history as deleted so its file will be removed on the next save. */
export function markHistoryDeleted(historyId) {
  deletedChatHistories.add(historyId);
}

/** Clear all dirty/deleted tracking sets (used during state reset). */
export function clearDirtyTracking() {
  dirtyChatHistories.clear();
  deletedChatHistories.clear();
}

/** Ensure all required data directories exist. */
export async function ensureDataDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CHAT_HISTORIES_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Write modified chat histories to disk and delete removed ones.
 * @param {Object} chatHistories - The in-memory chat histories map.
 */
async function syncChatHistoriesToDisk(chatHistories) {
  const writeOperations = [...dirtyChatHistories].map((historyId) => {
    const history = chatHistories[historyId];
    if (!history) return Promise.resolve();
    return fs.writeFile(
      path.join(CHAT_HISTORIES_DIR, `${historyId}.json`),
      JSON.stringify(history, null, 2),
      'utf-8',
    );
  });

  const deleteOperations = [...deletedChatHistories].map((historyId) =>
    fs.unlink(path.join(CHAT_HISTORIES_DIR, `${historyId}.json`)).catch(() => {}),
  );

  await Promise.all([...writeOperations, ...deleteOperations]);
  dirtyChatHistories.clear();
  deletedChatHistories.clear();
}

/**
 * Performs the actual save to disk - writes all persisted state and chat histories.
 * @param {Object} state - The full bot state object.
 */
async function executeSave(state) {
  if (isSaving) return;
  isSaving = true;

  try {
    if (!directoriesEnsured) {
      await ensureDataDirectories();
      directoriesEnsured = true;
    }

    await syncChatHistoriesToDisk(state.chatHistories);

    const fileWrites = Object.entries(FILE_PATHS).map(([key, filePath]) =>
      fs.writeFile(filePath, JSON.stringify(state[key], null, 2), 'utf-8'),
    );

    await Promise.all(fileWrites);
  } catch (error) {
    console.error('Error saving state to files:', error);
  } finally {
    isSaving = false;
  }
}

/**
 * Schedule a debounced save of the bot state.
 * Multiple rapid calls are collapsed into a single write.
 * @param {Object} state - The full bot state object.
 */
export function saveStateToFile(state) {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    executeSave(state);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force an immediate save, bypassing the debounce timer.
 * Used for critical operations like daily cleanup.
 * @param {Object} state - The full bot state object.
 */
export async function saveStateToFileImmediate(state) {
  clearTimeout(saveDebounceTimer);
  await executeSave(state);
}

/**
 * Load all chat history files from disk into the state.
 * @param {Object} state - The state object to populate.
 */
export async function loadChatHistories(state) {
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

/**
 * Load all persisted state keys from their individual JSON files.
 * @param {Object} state - The state object to populate.
 */
export async function loadPersistedState(state) {
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
