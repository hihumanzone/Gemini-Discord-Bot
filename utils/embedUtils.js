import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

import config from '../config.js';
import { state, getUserResponsePreference } from '../botManager.js';

const hexColour = config.hexColour;

/**
 * Creates the "Stop Generating" button row
 * @returns {ActionRowBuilder} Action row with stop button
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

/**
 * Adds a download button to a message
 * @param {Message} botMessage - The bot's message
 * @returns {Message} Updated message
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
 * Adds a delete button to a message
 * @param {Message} botMessage - The bot's message
 * @param {string} msgId - Message ID to delete
 * @returns {Message} Updated message
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
 * Adds a settings button to a message
 * @param {Message} botMessage - The bot's message
 * @returns {Message} Updated message
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
    console.error('Error adding settings button:', error.message);
    return botMessage;
  }
}

/**
 * Updates the response embed with the AI response
 * @param {Message} botMessage - The bot's message
 * @param {string} finalResponse - The response text
 * @param {Message} message - Original message
 * @param {object} groundingMetadata - Grounding metadata from search
 * @param {object} urlContextMetadata - URL context metadata
 */
export function updateEmbed(botMessage, finalResponse, message, groundingMetadata = null, urlContextMetadata = null) {
  try {
    const isGuild = message.guild !== null;
    const embed = new EmbedBuilder()
      .setColor(hexColour)
      .setDescription(finalResponse)
      .setAuthor({
        name: `To ${message.author.displayName}`,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp();

    // Add grounding metadata if user has Google Search tool enabled and Embedded responses selected
    if (groundingMetadata && shouldShowGroundingMetadata(message)) {
      addGroundingMetadataToEmbed(embed, groundingMetadata);
    }

    // Add URL context metadata if user has Google Search tool enabled and Embedded responses selected
    if (urlContextMetadata && shouldShowGroundingMetadata(message)) {
      addUrlContextMetadataToEmbed(embed, urlContextMetadata);
    }

    if (isGuild) {
      embed.setFooter({
        text: message.guild.name,
        iconURL: message.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png'
      });
    }

    botMessage.edit({
      content: ' ',
      embeds: [embed]
    });
  } catch (error) {
    console.error("An error occurred while updating the embed:", error.message);
  }
}

/**
 * Adds grounding metadata to embed
 * @param {EmbedBuilder} embed - The embed to modify
 * @param {object} groundingMetadata - Grounding metadata
 */
function addGroundingMetadataToEmbed(embed, groundingMetadata) {
  // Add search queries used by the model
  if (groundingMetadata.webSearchQueries && groundingMetadata.webSearchQueries.length > 0) {
    embed.addFields({
      name: '🔍 Search Queries',
      value: groundingMetadata.webSearchQueries.map(query => `• ${query}`).join('\n'),
      inline: false
    });
  }

  // Add grounding sources with clickable links
  if (groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
    const chunks = groundingMetadata.groundingChunks
      .slice(0, 5) // Limit to first 5 chunks to avoid embed limits
      .map((chunk, index) => {
        if (chunk.web) {
          return `• [${chunk.web.title || 'Source'}](${chunk.web.uri})`;
        }
        return `• Source ${index + 1}`;
      })
      .join('\n');
    
    embed.addFields({
      name: '📚 Sources',
      value: chunks,
      inline: false
    });
  }
}

/**
 * Adds URL context metadata to embed
 * @param {EmbedBuilder} embed - The embed to modify
 * @param {object} urlContextMetadata - URL context metadata
 */
function addUrlContextMetadataToEmbed(embed, urlContextMetadata) {
  // Add URL retrieval status with success/failure indicators
  if (urlContextMetadata.url_metadata && urlContextMetadata.url_metadata.length > 0) {
    const urlList = urlContextMetadata.url_metadata
      .map(urlData => {
        const emoji = urlData.url_retrieval_status === 'URL_RETRIEVAL_STATUS_SUCCESS' ? '✔️' : '❌';
        return `${emoji} ${urlData.retrieved_url}`;
      })
      .join('\n');
    
    embed.addFields({
      name: '🔗 URL Context',
      value: urlList,
      inline: false
    });
  }
}

/**
 * Checks if grounding metadata should be shown
 * @param {Message} message - The message
 * @returns {boolean} True if should show
 */
function shouldShowGroundingMetadata(message) {
  // Tools are always enabled; only show when user prefers Embedded responses
  const userId = message.author.id;
  const userResponsePreference = message.guild && state.serverSettings[message.guild.id]?.serverResponsePreference
    ? state.serverSettings[message.guild.id].responseStyle
    : getUserResponsePreference(userId);
  
  return userResponsePreference === 'Embedded';
}

/**
 * Creates a standard error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {number} color - Hex color (default red)
 * @returns {EmbedBuilder} Error embed
 */
export function createErrorEmbed(title, description, color = 0xFF0000) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Creates a standard success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @returns {EmbedBuilder} Success embed
 */
export function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Creates a standard info embed
 * @param {string} title - Info title
 * @param {string} description - Info description
 * @returns {EmbedBuilder} Info embed
 */
export function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Creates a warning embed
 * @param {string} title - Warning title
 * @param {string} description - Warning description
 * @returns {EmbedBuilder} Warning embed
 */
export function createWarningEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(title)
    .setDescription(description);
}
