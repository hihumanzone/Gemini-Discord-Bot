/**
 * Code execution file delivery and sandbox link utilities.
 * Handles MIME-to-extension mapping, sandbox link parsing/cleaning,
 * and delivering generated files from Gemini code execution to Discord.
 */

import fs from 'fs/promises';
import path from 'path';

import { AttachmentBuilder } from 'discord.js';

import { TEMP_DIR } from '../core/paths.js';
import { shouldShowActionButtons } from '../state/botState.js';
import { logServiceError } from '../utils/errorHandler.js';
import { addDeleteButton, addSettingsButton } from '../ui/messageActions.js';
import { applyEmbedFallback, createStatusEmbed } from '../utils/discord.js';

// --- MIME type to file extension mapping ---

const MIME_TO_EXTENSION = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/html': '.html',
  'application/json': '.json',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
});

const SANDBOX_LINK_RE = /\[([^\]]+)\]\(sandbox:\/([^)]+)\)/g;

const COMMON_FILE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'wav', 'mp3', 'ogg',
  'csv', 'txt', 'json', 'pdf', 'html', 'md', 'xml', 'js', 'py',
  'sh', 'cpp', 'rs', 'java', 'c', 'cs',
];

/**
 * Get a file extension string for a given MIME type.
 * Falls back to extracting the subtype from the MIME string.
 * @param {string} mimeType - The MIME type (e.g. "image/png").
 * @returns {string} The extension including the leading dot.
 */
export function getFileExtension(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || `.${mimeType.split('/').pop()}`;
}

/**
 * Extract filenames from model response text by matching sandbox links
 * and common filename patterns.
 *
 * @param {string} text - The response text to search.
 * @param {string[]} [extraExtensions=[]] - Additional file extensions to recognize.
 * @returns {string[]} Deduplicated list of extracted filenames.
 */
export function extractSandboxFilenames(text, extraExtensions = []) {
  if (!text) return [];

  const sandboxLinks = [...text.matchAll(SANDBOX_LINK_RE)].map((m) => m[2]);

  const allExtensions = [...new Set([...COMMON_FILE_EXTENSIONS, ...extraExtensions])];
  const extGroup = allExtensions.join('|');
  const fallbackRe = new RegExp(`[a-zA-Z0-9_\\-\\.]+\\.(?:${extGroup})\\b`, 'gi');
  const standardMatches = [...text.matchAll(fallbackRe)].map((m) => m[0]);

  // Capture files with arbitrary extensions if explicitly quoted or backticked
  const quotedRe = /['"`]([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]{1,10})['"`]/g;
  const quotedMatches = [...text.matchAll(quotedRe)].map((m) => m[1]);

  return [...new Set([...sandboxLinks, ...quotedMatches, ...standardMatches])];
}

/**
 * Replace sandbox markdown links with display-friendly text.
 * Links whose filenames appear in `actualFileNames` get a paperclip icon;
 * others are shown as struck-through with a "not generated" note.
 *
 * @param {string} text - The response text containing sandbox links.
 * @param {string[]} [actualFileNames=[]] - Filenames that were actually produced.
 * @returns {string} The cleaned text.
 */
export function cleanSandboxLinks(text, actualFileNames = []) {
  return text.replace(SANDBOX_LINK_RE, (match, display, filename) => {
    if (actualFileNames.includes(filename)) {
      return display === filename ? `📎 **${filename}**` : `📎 **${display} (${filename})**`;
    }
    return `~~${display}~~ *(File not generated)*`;
  });
}

/**
 * Match inline data files to sandbox filenames extracted from the response.
 * Assigns a `.name` property to each file based on best-effort matching.
 *
 * @param {Array<{mimeType: string, data: string, name?: string}>} inlineDataFiles - Files from code execution.
 * @param {string[]} sandboxFilenames - Filenames extracted from the response text.
 * @returns {string[]} The list of filenames that were actually assigned.
 */
export function assignFileNames(inlineDataFiles, sandboxFilenames) {
  const actualNames = [];
  const availableCandidates = [...sandboxFilenames];

  for (const file of inlineDataFiles) {
    const defaultExt = getFileExtension(file.mimeType).toLowerCase();

    let matchIdx = availableCandidates.findIndex((c) => c.toLowerCase().endsWith(defaultExt));

    // Fallback: accept popular text extensions if MIME is text/*
    if (matchIdx === -1 && file.mimeType.startsWith('text/')) {
      matchIdx = availableCandidates.findIndex((c) =>
        /\.(txt|csv|json|md|py|js|html|xml|sh|cpp|rs|java|c|cs)$/i.test(c),
      );
    }

    if (matchIdx === -1 && availableCandidates.length > 0) {
      matchIdx = 0;
    }

    if (matchIdx !== -1) {
      file.name = availableCandidates[matchIdx];
      actualNames.push(file.name);
      availableCandidates.splice(matchIdx, 1);
    } else {
      file.name = null;
    }
  }

  return actualNames;
}

/**
 * Send code-execution-generated files to the Discord channel as attachments.
 *
 * @param {Array<{mimeType: string, data: string, name?: string}>} inlineDataFiles - The generated files.
 * @param {import('discord.js').Message} originalMessage - The user's original message.
 * @param {string} deleteHistoryRef - History reference for delete button binding.
 * @returns {Promise<import('discord.js').Message|null>} The sent message, or null on failure.
 */
export async function sendCodeExecutionFiles(inlineDataFiles, originalMessage, deleteHistoryRef) {
  if (inlineDataFiles.length === 0) return null;

  const tempPaths = [];

  try {
    const attachments = [];
    for (let i = 0; i < inlineDataFiles.length; i++) {
      const { mimeType, data, name } = inlineDataFiles[i];
      const filename = name || `generated_${i + 1}${getFileExtension(mimeType)}`;
      const tempPath = path.join(TEMP_DIR, `${Date.now()}_${i}_${filename}`);
      await fs.writeFile(tempPath, Buffer.from(data, 'base64'));
      tempPaths.push(tempPath);
      attachments.push(new AttachmentBuilder(tempPath, { name: filename }));
    }

    const filesEmbed = createStatusEmbed({
      variant: 'primary',
      title: 'Generated Files',
      description: inlineDataFiles
        .map(({ name: fname, mimeType }, idx) =>
          `**${idx + 1}.** ${fname || `generated_${idx + 1}${getFileExtension(mimeType)}`}`,
        )
        .join('\n'),
    });

    const filesMessage = await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      content: `<@${originalMessage.author.id}>`,
      embeds: [filesEmbed],
      files: attachments,
      allowedMentions: { users: [originalMessage.author.id] },
    }));

    if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id, originalMessage.channelId)) {
      let updated = await addSettingsButton(filesMessage);
      updated = await addDeleteButton(updated, updated.id, deleteHistoryRef);
      return updated;
    }
    return filesMessage;
  } catch (error) {
    logServiceError('CodeExecution', error, { operation: 'sendCodeExecutionFiles' });
    return null;
  } finally {
    for (const tempPath of tempPaths) {
      try {
        await fs.unlink(tempPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logServiceError('CodeExecution', error, { operation: 'sendCodeExecutionFilesCleanup', tempPath });
        }
      }
    }
  }
}
