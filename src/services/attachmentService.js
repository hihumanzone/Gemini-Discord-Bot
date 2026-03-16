import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

import axios from 'axios';
import { createPartFromUri } from '@google/genai';
import officeParser from 'officeparser';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

import { genAI } from '../core/runtime.js';
import { TEMP_DIR } from '../core/paths.js';
import { TEXT_ATTACHMENT_EXTENSIONS, VIDEO_POLL_INTERVAL_MS } from '../constants.js';
import { logServiceError } from '../utils/errorHandler.js';

const UPLOADABLE_MIME_TYPES = new Set([
  'text/html',
  'text/css',
  'text/plain',
  'text/xml',
  'text/csv',
  'text/rtf',
  'text/javascript',
  'application/json',
  'application/pdf',
  'application/x-pdf',
]);

function getCleanMimeType(contentType) {
  return (contentType || '').toLowerCase().split(';')[0].trim();
}

function isMediaAttachment(attachment) {
  const contentType = getCleanMimeType(attachment.contentType);

  return (
    (contentType.startsWith('image/') && !contentType.includes('svg')) ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    UPLOADABLE_MIME_TYPES.has(contentType)
  );
}

function isTextAttachment(attachment) {
  const extension = path.extname(attachment.name || '').toLowerCase();
  return TEXT_ATTACHMENT_EXTENSIONS.has(extension);
}

function isSupportedAttachment(attachment) {
  return isMediaAttachment(attachment) || isTextAttachment(attachment);
}

function sanitizeFileName(fileName = 'attachment') {
  const sanitized = fileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'attachment';
}

async function downloadFile(url, filePath) {
  try {
    const writer = createWriteStream(filePath);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    });

    response.data.pipe(writer);

    return await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    logServiceError('Attachment', error, {
      operation: 'downloadFile',
      url,
    });
    throw error;
  }
}

async function waitForFileProcessing(fileName, displayName) {
  let file = await genAI.files.get({ name: fileName });

  while (file.state === 'PROCESSING') {
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
    file = await genAI.files.get({ name: fileName });
  }

  if (file.state === 'FAILED') {
    throw new Error(`Video processing failed for ${displayName}.`);
  }
}

function convertGifToVideo(inputPath, outputPath, options = {}) {
  const {
    fps = 2,
    width = 240,
    crf = 42,
    threads = 1,
    preset = 'ultrafast'
  } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,

      '-an',
      '-sn',
      '-dn',

      '-vf', `fps=${fps},scale=${width}:-2:flags=fast_bilinear`,

      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-threads', String(threads),

      outputPath
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`ffmpeg failed (${code})\n${stderr}`));
      }
    });
  });
}

async function buildAttachmentPart(attachment, authorId) {
  let sanitizedFileName = sanitizeFileName(attachment.name);
  let tempFileName = `${authorId}-${attachment.id}-${sanitizedFileName}`;
  let tempFilePath = path.join(TEMP_DIR, tempFileName);
  let finalMimeType = getCleanMimeType(attachment.contentType);
  let convertedFilePath = null;

  try {
    await downloadFile(attachment.url, tempFilePath);

    if (finalMimeType === 'image/gif') {
      convertedFilePath = `${tempFilePath}.mp4`;
      await convertGifToVideo(tempFilePath, convertedFilePath);
      tempFilePath = convertedFilePath;
      finalMimeType = 'video/mp4';
      sanitizedFileName = sanitizedFileName.replace(/\.gif$/i, '.mp4');
      if (!sanitizedFileName.endsWith('.mp4')) {
        sanitizedFileName += '.mp4';
      }
    }

    const uploadResult = await genAI.files.upload({
      file: tempFilePath,
      config: {
        mimeType: finalMimeType,
        displayName: sanitizedFileName,
      },
    });

    if (!uploadResult.name) {
      throw new Error('Unable to extract file name from upload result.');
    }

    if (finalMimeType.startsWith('video/')) {
      await waitForFileProcessing(uploadResult.name, sanitizedFileName);
    }

    return createPartFromUri(uploadResult.uri, uploadResult.mimeType);
  } catch (error) {
    logServiceError('Attachment', error, {
      operation: 'buildAttachmentPart',
      attachment: sanitizedFileName,
    });
    return null;
  } finally {
    try {
      await fs.unlink(path.join(TEMP_DIR, tempFileName)).catch((e) => {
        if (e.code !== 'ENOENT') logServiceError('FileSystem', e, { operation: 'unlink', file: tempFileName });
      });
      if (convertedFilePath) {
        await fs.unlink(convertedFilePath).catch((e) => {
          if (e.code !== 'ENOENT') logServiceError('FileSystem', e, { operation: 'unlink', file: convertedFilePath });
        });
      }
    } catch (unlinkError) {
      logServiceError('FileSystem', unlinkError, { operation: 'cleanup' });
    }
  }
}

export function hasSupportedAttachments(message) {
  return message.attachments.some(isSupportedAttachment);
}

export function getUnsupportedAttachments(message) {
  return Array.from(message.attachments.values()).filter((attachment) => !isSupportedAttachment(attachment));
}

export async function processPromptAndMediaAttachments(prompt, message) {
  const attachments = Array.from(message.attachments.values());
  const parts = [{ text: prompt.trim() }];
  const validAttachments = attachments.filter(isMediaAttachment);

  if (!validAttachments.length) {
    return parts;
  }

  const attachmentParts = await Promise.all(
    validAttachments.map((attachment) => buildAttachmentPart(attachment, message.author.id)),
  );

  return [...parts, ...attachmentParts.filter(Boolean)];
}

const OFFICE_PARSEABLE_EXTENSIONS = new Set([
  '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.rtf'
]);

async function downloadAndReadFile(url, extension) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${response.statusText}`);
  }

  if (OFFICE_PARSEABLE_EXTENSIONS.has(extension)) {
    const fileBuffer = Buffer.from(await response.arrayBuffer());
    const ast = await officeParser.parseOffice(fileBuffer);
    return ast.toText();
  }

  return response.text();
}

export async function extractFileText(message, messageContent) {
  let prompt = messageContent;

  for (const attachment of message.attachments.values()) {
    if (isMediaAttachment(attachment)) {
      continue;
    }

    if (!isTextAttachment(attachment)) {
      continue;
    }

    const extension = path.extname(attachment.name || '').toLowerCase();

    try {
      const fileContent = await downloadAndReadFile(attachment.url, extension);
      prompt += `\n\n[\`${attachment.name}\` File Content]:\n\`\`\`\n${fileContent}\n\`\`\``;
    } catch (error) {
      logServiceError('Attachment', error, {
        operation: 'extractFileText',
        attachmentName: attachment.name,
      });
    }
  }

  return prompt;
}
