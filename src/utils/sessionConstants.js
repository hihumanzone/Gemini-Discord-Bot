/**
 * Shared session constants and name normalization.
 * Used by both botState and sessionService to avoid circular imports.
 */

export const DEFAULT_SESSION_ID = 'default';
export const DEFAULT_SESSION_NAME = 'Default Session';
export const MAX_SESSION_NAME_LENGTH = 80;
export const SESSION_ID_PATTERN = /^[a-z0-9_-]{1,40}$/;

/**
 * Trims and truncates a session name to the allowed length.
 * @param {string} name - Raw session name input.
 * @returns {string} Normalized session name.
 */
export function normalizeSessionName(name) {
  return (name || '').trim().slice(0, MAX_SESSION_NAME_LENGTH);
}
