import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';

/**
 * Add a download button to a message
 */
export async function addDownloadButton(botMessage) {
  try {
    const messageComponents = botMessage.components || [];
    const downloadButton = new ButtonBuilder()
      .setCustomId('download_message')
      .setLabel('Save')
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Secondary);

    let actionRow;
    if (messageComponents.length > 0 && messageComponents[0].type === ComponentType.ActionRow) {
      actionRow = ActionRowBuilder.from(messageComponents[0]);
    } else {
      actionRow = new ActionRowBuilder();
    }

    actionRow.addComponents(downloadButton);
    return await botMessage.edit({
      components: [actionRow]
    });
  } catch (error) {
    console.error('Error adding download button:', error.message);
    return botMessage;
  }
}

/**
 * Add a delete button to a message
 */
export async function addDeleteButton(botMessage, msgId) {
  try {
    const messageComponents = botMessage.components || [];
    const deleteButton = new ButtonBuilder()
      .setCustomId(`delete_message-${msgId}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary);

    let actionRow;
    if (messageComponents.length > 0 && messageComponents[0].type === ComponentType.ActionRow) {
      actionRow = ActionRowBuilder.from(messageComponents[0]);
    } else {
      actionRow = new ActionRowBuilder();
    }

    actionRow.addComponents(deleteButton);
    return await botMessage.edit({
      components: [actionRow]
    });
  } catch (error) {
    console.error('Error adding delete button:', error.message);
    return botMessage;
  }
}

/**
 * Add a settings button to a message
 */
export async function addSettingsButton(botMessage) {
  try {
    const settingsButton = new ButtonBuilder()
      .setCustomId('settings')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder().addComponents(settingsButton);
    return await botMessage.edit({
      components: [actionRow]
    });
  } catch (error) {
    console.log('Error adding settings button:', error.message);
    return botMessage;
  }
}

/**
 * Create a stop generating button
 */
export function createStopGeneratingButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
      .setCustomId('stopGenerating')
      .setLabel('Stop Generating')
      .setStyle(ButtonStyle.Danger)
    );
}