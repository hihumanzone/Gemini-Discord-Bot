import {
  getActiveSessionHistoryId,
  getUserSessionHistoryId,
  getUserSessions,
} from '../state/botState.js';
import {
  DEFAULT_SESSION_ID,
  MAX_SESSION_NAME_LENGTH,
  normalizeSessionName,
} from '../utils/sessionConstants.js';

export { MAX_SESSION_NAME_LENGTH, normalizeSessionName };

const DELETE_MESSAGE_ID_PATTERN = /^\d{16,24}$/;

export function toSessionId(name) {
  const normalized = normalizeSessionName(name).toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug || 'session';
}

export function ensureUniqueSessionId(userState, baseId) {
  if (!userState.sessions[baseId]) {
    return baseId;
  }

  let index = 2;
  let candidate = `${baseId}-${index}`;

  while (userState.sessions[candidate]) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }

  return candidate;
}

export function getSessionDetails(userId, sessionId) {
  const userState = getUserSessions(userId);
  const session = userState.sessions[sessionId];

  if (!session) {
    return null;
  }

  return {
    sessionId,
    sessionName: session.name,
    historyId: getUserSessionHistoryId(userId, sessionId),
  };
}

export function getActiveSessionDetails(userId) {
  const userState = getUserSessions(userId);
  return getSessionDetails(userId, userState.activeSessionId);
}

function decodeLegacyRef(rawRef) {
  if (!rawRef || !rawRef.includes('%')) {
    return rawRef;
  }

  try {
    return decodeURIComponent(rawRef);
  } catch {
    return rawRef;
  }
}

export function resolveDeleteHistoryId(userId, rawHistoryRef) {
  if (!rawHistoryRef) {
    return getActiveSessionHistoryId(userId);
  }

  const normalizedRef = decodeLegacyRef(rawHistoryRef);

  if (normalizedRef.startsWith('u:')) {
    const sessionId = normalizedRef.slice(2) || DEFAULT_SESSION_ID;
    return getUserSessionHistoryId(userId, sessionId);
  }

  return normalizedRef;
}

export function parseDeleteMessagePayload(messageIdStr) {
  const [historyRef = null, rawMessageIds = ''] = messageIdStr.includes('::')
    ? messageIdStr.split('::')
    : [null, messageIdStr];

  const messageIds = rawMessageIds
    .split(',')
    .filter((id) => DELETE_MESSAGE_ID_PATTERN.test(id));

  return {
    historyRef,
    messageIds,
  };
}
