/**
 * Session state management.
 * Handles user session CRUD, normalization, and history ID resolution.
 */

import {
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_NAME,
  SESSION_ID_PATTERN,
  normalizeSessionName,
} from '../utils/sessionConstants.js';

/**
 * Create the default session state for a new user.
 * @returns {{ activeSessionId: string, sessions: Object }}
 */
function createDefaultSessionState() {
  return {
    activeSessionId: DEFAULT_SESSION_ID,
    sessions: {
      [DEFAULT_SESSION_ID]: { name: DEFAULT_SESSION_NAME },
    },
  };
}

/**
 * Normalize a raw session entry (string or object) into a `{ name }` object.
 * Returns null if the entry is invalid.
 * @param {*} entry - Raw session entry from persisted state.
 * @returns {{ name: string } | null}
 */
function normalizeSessionEntry(entry) {
  if (typeof entry === 'string' && entry.trim()) {
    return { name: entry.trim() };
  }

  if (entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim()) {
    return { name: entry.name.trim() };
  }

  return null;
}

/**
 * Ensure a user's session state is valid and normalized.
 * Creates defaults if the user has no session data, and cleans up
 * any malformed entries from persisted state.
 *
 * @param {Object} state - The global bot state object.
 * @param {string} userId - The Discord user ID.
 * @returns {Object} The normalized session state for the user.
 */
export function normalizeUserSessionState(state, userId) {
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

/**
 * Get the chat history ID for a given user + session pair.
 * The default session uses the user ID directly; other sessions
 * use `userId_sessionId`.
 *
 * @param {string} userId - The Discord user ID.
 * @param {string} sessionId - The session identifier.
 * @returns {string} The history ID.
 */
export function getUserSessionHistoryId(userId, sessionId) {
  return sessionId === DEFAULT_SESSION_ID ? userId : `${userId}_${sessionId}`;
}

/**
 * Create a new session for a user.
 * @param {Object} state - The global bot state object.
 * @param {string} userId - The Discord user ID.
 * @param {string} sessionId - The new session identifier.
 * @param {string} sessionName - The display name for the session.
 * @param {Function} getUserSessions - Getter for normalized user sessions.
 * @param {Function} onSave - Callback to trigger state persistence.
 * @returns {boolean} True if the session was created successfully.
 */
export function createSession(state, userId, sessionId, sessionName, getUserSessions, onSave) {
  const userState = getUserSessions(userId);
  const normalizedName = normalizeSessionName(sessionName);

  if (!SESSION_ID_PATTERN.test(sessionId) || !normalizedName) {
    return false;
  }

  if (userState.sessions[sessionId]) {
    return false;
  }

  userState.sessions[sessionId] = { name: normalizedName };
  onSave();
  return true;
}

/**
 * Rename an existing session.
 * The default session cannot be renamed.
 *
 * @param {string} userId - The Discord user ID.
 * @param {string} sessionId - The session to rename.
 * @param {string} newName - The new display name.
 * @param {Function} getUserSessions - Getter for normalized user sessions.
 * @param {Function} onSave - Callback to trigger state persistence.
 * @returns {boolean} True if the rename succeeded.
 */
export function renameSession(userId, sessionId, newName, getUserSessions, onSave) {
  const userState = getUserSessions(userId);
  const normalizedName = normalizeSessionName(newName);

  if (!userState.sessions[sessionId] || sessionId === DEFAULT_SESSION_ID || !normalizedName) {
    return false;
  }

  userState.sessions[sessionId].name = normalizedName;
  onSave();
  return true;
}

/**
 * Delete a session and its associated chat history.
 * The default session cannot be deleted. If the deleted session was
 * active, the active session reverts to default.
 *
 * @param {Object} state - The global bot state object.
 * @param {string} userId - The Discord user ID.
 * @param {string} sessionId - The session to delete.
 * @param {Function} getUserSessions - Getter for normalized user sessions.
 * @param {Function} markHistoryDeleted - Callback to mark the history file for deletion.
 * @param {Function} onSave - Callback to trigger state persistence.
 * @returns {boolean} True if the session was deleted.
 */
export function deleteSession(state, userId, sessionId, getUserSessions, markHistoryDeleted, onSave) {
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
  markHistoryDeleted(historyId);
  onSave();
  return true;
}
