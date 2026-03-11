import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

import axios from 'axios';
import { getTextExtractor } from 'office-text-extractor';

import { createPartFromUri, genAI, TEMP_DIR } from '../../botManager.js';
import { TEXT_ATTACHMENT_EXTENSIONS, VIDEO_POLL_INTERVAL_MS } from '../constants.js';

function isMediaAttachment(attachment) {
  const contentType = (attachment.contentType || '').toLowerCase();

  return (
    (contentType.startsWith('image/') && contentType !== 'image/gif') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('application/pdf') ||
    contentType.startsWith('application/x-pdf')
  );
}

function sanitizeFileName(fileName = 'attachment') {
  return fileName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}

async function downloadFile(url, filePath) {
  const writer = createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
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

async function buildAttachmentPart(attachment, authorId) {
  const sanitizedFileName = sanitizeFileName(attachment.name);
  const tempFileName = `${authorId}-${attachment.id}-${sanitizedFileName}`;
  const tempFilePath = path.join(TEMP_DIR, tempFileName);

  try {
    await downloadFile(attachment.url, tempFilePath);

    const uploadResult = await genAI.files.upload({
      file: tempFilePath,
      config: {
        mimeType: attachment.contentType,
        displayName: sanitizedFileName,
      },
    });

    if (!uploadResult.name) {
      throw new Error('Unable to extract file name from upload result.');
    }

    if ((attachment.contentType || '').startsWith('video/')) {
      await waitForFileProcessing(uploadResult.name, sanitizedFileName);
    }

    return createPartFromUri(uploadResult.uri, uploadResult.mimeType);
  } catch (error) {
    console.error(`Error processing attachment ${sanitizedFileName}:`, error);
    return null;
  } finally {
    try {
      await fs.unlink(tempFilePath);
    } catch (unlinkError) {
      if (unlinkError.code !== 'ENOENT') {
        console.error(`Error deleting temporary file ${tempFilePath}:`, unlinkError);
      }
    }
  }
}

export function hasSupportedAttachments(message) {
  return message.attachments.some((attachment) => {
    const extension = path.extname(attachment.name || '').toLowerCase();
    return isMediaAttachment(attachment) || TEXT_ATTACHMENT_EXTENSIONS.has(extension);
  });
}

export async function processPromptAndMediaAttachments(prompt, message) {
  const attachments = Array.from(message.attachments.values());
  const parts = [{ text: prompt }];
  const validAttachments = attachments.filter(isMediaAttachment);

  if (!validAttachments.length) {
    return parts;
  }

  const attachmentParts = await Promise.all(
    validAttachments.map((attachment) => buildAttachmentPart(attachment, message.author.id)),
  );

  return [...parts, ...attachmentParts.filter(Boolean)];
}

async function downloadAndReadFile(url, extension) {
  if (extension === '.pptx' || extension === '.docx') {
    const extractor = getTextExtractor();
    return extractor.extractText({ input: url, type: 'url' });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${response.statusText}`);
  }

  return response.text();
}

export async function extractFileText(message, messageContent) {
  let prompt = messageContent;

  for (const attachment of message.attachments.values()) {
    const extension = path.extname(attachment.name || '').toLowerCase();

    if (!TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
      continue;
    }

    try {
      const fileContent = await downloadAndReadFile(attachment.url, extension);
      prompt += `\n\n[\`${attachment.name}\` File Content]:\n\`\`\`\n${fileContent}\n\`\`\``;
    } catch (error) {
      console.error(`Error reading file ${attachment.name}:`, error);
    }
  }

  return prompt;
}
