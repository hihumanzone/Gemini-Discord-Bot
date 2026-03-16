/**
 * Text sharing and serialization utilities.
 * Handles uploading text to external share services and serializing conversation history.
 */

import axios from 'axios';

import { EXTERNAL_TEXT_SHARE_URL, TEXT_FILE_TTL_MINUTES } from '../constants.js';
import { logServiceError } from '../utils/errorHandler.js';

/**
 * Uploads text to the external sharing service and returns the resulting URL string.
 * Returns an error placeholder on failure.
 */
async function uploadText(text) {
  try {
    const response = await axios.post(
      `${EXTERNAL_TEXT_SHARE_URL}/api/text`,
      { text, ttl: TEXT_FILE_TTL_MINUTES },
      { timeout: 3_000 },
    );

    return `\nURL: ${EXTERNAL_TEXT_SHARE_URL}/t/${response.data.tid}`;
  } catch (error) {
    logServiceError('TextShare', error, { operation: 'uploadText' });
    return '\nURL Error :(';
  }
}

/**
 * Creates a shared text link by uploading the given text.
 * @param {string} text - The text content to share.
 * @returns {Promise<string>} A URL string for the shared content.
 */
export async function createSharedTextLink(text) {
  return uploadText(text);
}

/**
 * Serializes a conversation history array into a human-readable string.
 * @param {Array<{role: string, parts: Array<{text: string}>}>} history
 * @returns {string} Formatted conversation text.
 */
export function serializeConversationHistory(history) {
  return history
    .map((entry) => {
      const role = entry.role === 'user' ? '[User]' : '[Model]';
      const content = entry.parts
        .map((part) => {
          if (part.text) return part.text;
          if (part.executableCode) {
            const lang = (part.executableCode.language || '').toLowerCase().replace('language_unspecified', '');
            return `\n\`\`\`${lang}\n${part.executableCode.code}\n\`\`\`\n`;
          }
          if (part.codeExecutionResult && part.codeExecutionResult.output) {
            return `\n**Output:**\n\`\`\`\n${part.codeExecutionResult.output}\`\`\`\n`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      return `${role}:\n${content}\n\n`;
    })
    .join('');
}
