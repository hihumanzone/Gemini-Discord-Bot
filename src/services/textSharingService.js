/**
 * Text sharing and serialization utilities.
 * Handles uploading text to external share services and serializing conversation history.
 */

import axios from 'axios';

import { EXTERNAL_TEXT_SHARE_URL, EXTERNAL_TEXT_SHARE_API_URL, TEXT_FILE_TTL_MINUTES } from '../constants.js';
import { logServiceError } from '../utils/errorHandler.js';

const TEXT_SHARE_TIMEOUT_MS = 3_000;
const TEXT_SHARE_USER_AGENT = 'Mudfish/1.0 (+https://mudfish.net)';

/**
 * Creates a shared text link by uploading the given text to pastes.dev.
 * Returns an error placeholder on failure.
 *
 * @param {string} text - The text content to share.
 * @returns {Promise<string>} A URL string for the shared content.
 */
export async function createSharedTextLink(text) {
  try {
    const { data } = await axios.post(
      `${EXTERNAL_TEXT_SHARE_API_URL}/post`,
      text,
      {
        timeout: TEXT_SHARE_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'text/markdown; charset=utf-8',
          'User-Agent': TEXT_SHARE_USER_AGENT,
        },
      },
    );

    const key = data?.key;
    if (!key) {
      throw new Error('Missing paste key in response');
    }

    return `\nURL: ${EXTERNAL_TEXT_SHARE_URL}/${key}`;
  } catch (error) {
    logServiceError('TextShare', error, { operation: 'createSharedTextLink' });
    return '\nURL Error :(';
  }
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