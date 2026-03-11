import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

function cloneOrCreateActionRow(message) {
  const [firstComponent] = message.components || [];

  if (firstComponent?.type === ComponentType.ActionRow) {
    return ActionRowBuilder.from(firstComponent);
  }

  return new ActionRowBuilder();
}

async function appendButton(message, button) {
  try {
    const actionRow = cloneOrCreateActionRow(message);
    actionRow.addComponents(button);
    return await message.edit({ components: [actionRow] });
  } catch (error) {
    console.error('Failed to append message button:', error);
    return message;
  }
}

export async function clearMessageActionRows(message) {
  try {
    return await message.edit({ components: [] });
  } catch (error) {
    console.error('Failed to clear message action rows:', error);
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

export async function addDeleteButton(message, messageId) {
  return appendButton(
    message,
    new ButtonBuilder()
      .setCustomId(`delete_message-${messageId}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary),
  );
}
