import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

const STOP_GENERATING_BUTTON_ID = 'stopGenerating';
const MAX_CUSTOM_ID_LENGTH = 100;

function cloneActionRows(message, { excludeCustomIds = [] } = {}) {
  const excludedIds = new Set(excludeCustomIds);
  const sanitizedRows = [];

  for (const component of message.components || []) {
    if (component.type !== ComponentType.ActionRow) {
      continue;
    }

    const actionRow = ActionRowBuilder.from(component);
    const filteredComponents = actionRow.components.filter((button) => !excludedIds.has(button.data.custom_id));

    if (filteredComponents.length === 0) {
      continue;
    }

    actionRow.setComponents(filteredComponents);
    sanitizedRows.push(actionRow);
  }

  return sanitizedRows;
}

async function resolveLatestMessage(message) {
  try {
    return await message.fetch();
  } catch {
    return message;
  }
}

function ensureActionRowCapacity(actionRows) {
  const lastRow = actionRows.at(-1);

  if (lastRow && lastRow.components.length < 5) {
    return lastRow;
  }

  const actionRow = new ActionRowBuilder();
  actionRows.push(actionRow);
  return actionRow;
}

async function appendButton(message, button) {
  try {
    const latestMessage = await resolveLatestMessage(message);
    const actionRows = cloneActionRows(latestMessage, {
      excludeCustomIds: [STOP_GENERATING_BUTTON_ID],
    });
    const actionRow = ensureActionRowCapacity(actionRows);

    actionRow.addComponents(button);
    return await latestMessage.edit({ components: actionRows });
  } catch (error) {
    console.error('Failed to append message button:', error);
    return message;
  }
}

export async function clearMessageActionRows(message) {
  try {
    const latestMessage = await resolveLatestMessage(message);
    return await latestMessage.edit({ components: [] });
  } catch (error) {
    console.error('Failed to clear message action rows:', error);
    return message;
  }
}

export async function removeStopGeneratingButton(message) {
  try {
    const latestMessage = await resolveLatestMessage(message);
    const actionRows = cloneActionRows(latestMessage, {
      excludeCustomIds: [STOP_GENERATING_BUTTON_ID],
    });
    return await latestMessage.edit({ components: actionRows });
  } catch (error) {
    console.error('Failed to remove stop generating button:', error);
    return message;
  }
}

export async function addSettingsButton(message) {
  return appendButton(
    message,
    new ButtonBuilder().setCustomId('settings').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );
}

export async function addDownloadButton(message) {
  return appendButton(
    message,
    new ButtonBuilder()
      .setCustomId('download_message')
      .setLabel('Save')
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function addDeleteButton(message, messageId, historyId = null) {
  let payload = historyId
    ? `${historyId}::${messageId}`
    : messageId;

  if (`delete_message-${payload}`.length > MAX_CUSTOM_ID_LENGTH) {
    payload = messageId;
  }

  return appendButton(
    message,
    new ButtonBuilder()
      .setCustomId(`delete_message-${payload}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary),
  );
}
