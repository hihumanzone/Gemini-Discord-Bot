/**
 * In-memory store for oversized response text used by overflow save buttons.
 */

const OVERFLOW_RESPONSE_TTL_MS = 6 * 60 * 60 * 1000;
const overflowResponses = new Map();

function pruneExpiredOverflowResponses(now = Date.now()) {
  for (const [saveId, payload] of overflowResponses.entries()) {
    if (payload.expiresAt <= now) {
      overflowResponses.delete(saveId);
    }
  }
}

export function saveOverflowResponse(saveId, text) {
  if (!saveId || !text) {
    return;
  }

  pruneExpiredOverflowResponses();
  overflowResponses.set(saveId, {
    text,
    expiresAt: Date.now() + OVERFLOW_RESPONSE_TTL_MS,
  });
}

export function getOverflowResponse(saveId) {
  if (!saveId) {
    return null;
  }

  pruneExpiredOverflowResponses();
  const payload = overflowResponses.get(saveId);
  return payload?.text || null;
}
