import { EmbedBuilder } from 'discord.js';
import { getUserResponsePreference, getUserToolPreference, state } from '../botManager.js';
import config from '../config.js';

const { hexColour } = config;

/**
 * Update an embed with response content and metadata
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
 * Add grounding metadata to embed
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
 * Add URL context metadata to embed
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
 * Check if grounding metadata should be shown
 */
function shouldShowGroundingMetadata(message) {
  // Only show grounding metadata when:
  // 1. User has "Google Search with URL Context" tool enabled
  // 2. User has "Embedded" response preference selected
  const userId = message.author.id;
  const userToolMode = getUserToolPreference(userId);
  const userResponsePreference = message.guild && state.serverSettings[message.guild.id]?.serverResponsePreference 
    ? state.serverSettings[message.guild.id].responseStyle 
    : getUserResponsePreference(userId);
  
  return userToolMode === 'Google Search with URL Context' && userResponsePreference === 'Embedded';
}

/**
 * Create error embed
 */
export function createErrorEmbed(title, description, color = 0xFF0000) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Create success embed
 */
export function createSuccessEmbed(title, description, color = 0x00FF00) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Create warning embed
 */
export function createWarningEmbed(title, description, color = 0xFFA500) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);
}