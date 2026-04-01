import fs from 'fs/promises';
import path from 'path';

import { TEMP_DIR } from '../../core/paths.js';
import { shouldShowActionButtons } from '../../state/botState.js';
import {
  addDeleteButton,
  addDownloadButton,
  addSettingsButton,
  clearMessageActionRows,
} from '../../ui/messageActions.js';
import { applyEmbedFallback, createStatusEmbed } from '../../utils/discord.js';
import { logServiceError } from '../../utils/errorHandler.js';

function logDeliveryError(operation, error, metadata = {}) {
  logServiceError('StreamingService', error, { operation, ...metadata });
}

export async function sendAsTextFile(text, originalMessage, historyId) {
  const filename = `response-${Date.now()}.md`;
  const filePath = path.join(TEMP_DIR, filename);

  try {
    await fs.writeFile(filePath, text, 'utf8');

    const fileEmbed = createStatusEmbed({
      variant: 'info',
      title: 'Full Response Attached',
      description: 'The response was longer than Discord message limits, so it has been attached as a file.',
    });

    let response = await originalMessage.reply(applyEmbedFallback(originalMessage.channel, {
      content: `<@${originalMessage.author.id}>`,
      embeds: [fileEmbed],
      files: [filePath],
      allowedMentions: { users: [originalMessage.author.id], repliedUser: false },
    }));

    if (shouldShowActionButtons(originalMessage.guild?.id, originalMessage.author.id, originalMessage.channelId)) {
      response = await addSettingsButton(response);
    }
    return response;
  } catch (error) {
    logDeliveryError('sendAsTextFile', error, {
      messageId: originalMessage.id,
      historyId,
    });
    return null;
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logDeliveryError('sendAsTextFileCleanup', error, { filePath });
      }
    }
  }
}

export async function handleLargeOrFinalResponse(
  botMessage,
  originalMessage,
  responseText,
  isLargeResponse,
  deleteHistoryRef,
  extraMessageIds = [],
) {
  const showButtons = shouldShowActionButtons(
    originalMessage.guild?.id,
    originalMessage.author.id,
    originalMessage.channelId,
  );

  let updatedMessage = await clearMessageActionRows(botMessage);

  if (showButtons) {
    updatedMessage = await addSettingsButton(updatedMessage);
  }

  if (isLargeResponse) {
    let textFileMessage = await sendAsTextFile(responseText, originalMessage, deleteHistoryRef);

    if (showButtons && textFileMessage) {
      const overflowDownloadCustomId = `download_message_overflow-${textFileMessage.id}`;
      textFileMessage = await addDownloadButton(textFileMessage, overflowDownloadCustomId);
      textFileMessage = await addDeleteButton(textFileMessage, textFileMessage.id, deleteHistoryRef);
      updatedMessage = await addDownloadButton(updatedMessage, overflowDownloadCustomId);
    }

    if (showButtons) {
      const targets = [updatedMessage.id, ...extraMessageIds];
      if (textFileMessage) targets.push(textFileMessage.id);
      updatedMessage = await addDeleteButton(updatedMessage, targets.join(','), deleteHistoryRef);
    }
    return updatedMessage;
  }

  if (!showButtons) {
    return updatedMessage;
  }

  const targets = [updatedMessage.id, ...extraMessageIds];
  updatedMessage = await addDownloadButton(updatedMessage);
  updatedMessage = await addDeleteButton(updatedMessage, targets.join(','), deleteHistoryRef);
  return updatedMessage;
}
