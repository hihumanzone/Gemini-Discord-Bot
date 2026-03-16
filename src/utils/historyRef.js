/**
 * Shared utility for computing delete-history reference IDs.
 * Used by both conversationService and streamingService to derive
 * a compact history reference suitable for button custom IDs.
 *
 * @param {string|null} historyId - The resolved history ID for the conversation.
 * @param {string|null} authorId - The message author's user ID.
 * @returns {string|null} A compact reference like 'u:default' or 'u:<sessionId>', or null.
 */
export function toDeleteHistoryRef(historyId, authorId) {
  if (!historyId || !authorId) {
    return null;
  }

  if (historyId === authorId) {
    return 'u:default';
  }

  if (historyId.startsWith(`${authorId}_`)) {
    const sessionId = historyId.slice(authorId.length + 1);
    return sessionId ? `u:${sessionId}` : 'u:default';
  }

  return null;
}
