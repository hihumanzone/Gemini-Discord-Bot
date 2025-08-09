import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import axios from 'axios';
import { getTextExtractor } from 'office-text-extractor';
import { genAI, createPartFromUri, TEMP_DIR } from '../botManager.js';

/**
 * Check if message has supported attachments
 */
export function hasSupportedAttachments(message) {
  const supportedFileExtensions = ['.html', '.js', '.css', '.json', '.xml', '.csv', '.py', '.java', '.sql', '.log', '.md', '.txt', '.docx', '.pptx'];

  return message.attachments.some((attachment) => {
    const contentType = (attachment.contentType || "").toLowerCase();
    const fileExtension = path.extname(attachment.name) || '';
    return (
      (contentType.startsWith('image/') && contentType !== 'image/gif') ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/') ||
      contentType.startsWith('application/pdf') ||
      contentType.startsWith('application/x-pdf') ||
      supportedFileExtensions.includes(fileExtension)
    );
  });
}

/**
 * Download a file from URL
 */
export async function downloadFile(url, filePath) {
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

/**
 * Sanitize filename for safe file system operations
 */
export function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Process prompt and media attachments
 */
export async function processPromptAndMediaAttachments(prompt, message) {
  const attachments = JSON.parse(JSON.stringify(Array.from(message.attachments.values())));
  let parts = [{
    text: prompt
  }];

  if (attachments.length > 0) {
    const validAttachments = attachments.filter(attachment => {
      const contentType = (attachment.contentType || "").toLowerCase();
      return (contentType.startsWith('image/') && contentType !== 'image/gif') ||
        contentType.startsWith('audio/') ||
        contentType.startsWith('video/') ||
        contentType.startsWith('application/pdf') ||
        contentType.startsWith('application/x-pdf');
    });

    if (validAttachments.length > 0) {
      const attachmentParts = await Promise.all(
        validAttachments.map(async (attachment) => {
          const sanitizedFileName = sanitizeFileName(attachment.name);
          const uniqueTempFilename = `${message.author.id}-${attachment.id}-${sanitizedFileName}`;
          const filePath = path.join(TEMP_DIR, uniqueTempFilename);

          try {
            await downloadFile(attachment.url, filePath);
            // Upload file using new Google GenAI API format
            const uploadResult = await genAI.files.upload({
              file: filePath,
              config: {
                mimeType: attachment.contentType,
                displayName: sanitizedFileName,
              }
            });

            const name = uploadResult.name;
            if (name === null) {
              throw new Error(`Unable to extract file name from upload result.`);
            }

            if (attachment.contentType.startsWith('video/')) {
              // Wait for video processing to complete using new API
              let file = await genAI.files.get({ name: name });
              while (file.state === 'PROCESSING') {
                process.stdout.write(".");
                await new Promise((resolve) => setTimeout(resolve, 10_000));
                file = await genAI.files.get({ name: name });
              }
              if (file.state === 'FAILED') {
                throw new Error(`Video processing failed for ${sanitizedFileName}.`);
              }
            }

            return createPartFromUri(uploadResult.uri, uploadResult.mimeType);
          } catch (error) {
            console.error(`Error processing attachment ${sanitizedFileName}:`, error);
            return null;
          } finally {
            try {
              await fs.unlink(filePath);
            } catch (unlinkError) {
              if (unlinkError.code !== 'ENOENT') {
                console.error(`Error deleting temporary file ${filePath}:`, unlinkError);
              }
            }
          }
        })
      );
      parts = [...parts, ...attachmentParts.filter(part => part !== null)];
    }
  }
  return parts;
}

/**
 * Extract text from file attachments
 */
export async function extractFileText(message, messageContent) {
  if (message.attachments.size > 0) {
    let attachments = Array.from(message.attachments.values());
    for (const attachment of attachments) {
      const fileType = path.extname(attachment.name) || '';
      const fileTypes = ['.html', '.js', '.css', '.json', '.xml', '.csv', '.py', '.java', '.sql', '.log', '.md', '.txt', '.docx', '.pptx'];

      if (fileTypes.includes(fileType)) {
        try {
          let fileContent = await downloadAndReadFile(attachment.url, fileType);
          messageContent += `\n\n[\`${attachment.name}\` File Content]:\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (error) {
          console.error(`Error reading file ${attachment.name}: ${error.message}`);
        }
      }
    }
  }
  return messageContent;
}

/**
 * Download and read file content
 */
async function downloadAndReadFile(url, fileType) {
  switch (fileType) {
    case 'pptx':
    case 'docx':
      const extractor = getTextExtractor();
      return (await extractor.extractText({
        input: url,
        type: 'url'
      }));
    default:
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download ${response.statusText}`);
      return await response.text();
  }
}

/**
 * Send response as text file
 */
export async function sendAsTextFile(text, message, orgId) {
  try {
    const filename = `response-${Date.now()}.txt`;
    const tempFilePath = path.join(TEMP_DIR, filename);
    await fs.writeFile(tempFilePath, text);

    const botMessage = await message.channel.send({
      content: `<@${message.author.id}>, Here is the response:`,
      files: [tempFilePath]
    });

    // Note: Import these from buttonUtils when needed
    // await addSettingsButton(botMessage);
    // await addDeleteButton(botMessage, orgId);

    await fs.unlink(tempFilePath);
    return botMessage;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}