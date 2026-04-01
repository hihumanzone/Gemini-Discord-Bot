import { EMBED_COLOR } from '../../constants.js';
import { applyEmbedFallback, createEmbed } from '../../utils/discord.js';
import { getResponsePreference } from '../conversationContext.js';

function truncateString(str, length = 1024) {
  if (!str) return '';
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}

function shouldShowGroundingMetadata(message) {
  return getResponsePreference(message) === 'Embedded';
}

function addGroundingMetadata(embed, groundingMetadata) {
  if (groundingMetadata.webSearchQueries?.length) {
    const value = groundingMetadata.webSearchQueries.map((query) => `• ${query}`).join('\n');
    embed.addFields({
      name: '🔍 Search Queries',
      value: truncateString(value) || 'No search queries',
      inline: false,
    });
  }

  if (groundingMetadata.groundingChunks?.length) {
    const chunks = groundingMetadata.groundingChunks
      .slice(0, 5)
      .map((chunk, index) => {
        if (chunk.web) {
          return `• [${chunk.web.title || 'Source'}](${chunk.web.uri})`;
        }
        return `• Source ${index + 1}`;
      })
      .join('\n');

    embed.addFields({
      name: '📚 Sources',
      value: truncateString(chunks) || 'No sources provided',
      inline: false,
    });
  }
}

function addUrlContextMetadata(embed, urlContextMetadata) {
  if (!urlContextMetadata.url_metadata?.length) {
    return;
  }

  const value = urlContextMetadata.url_metadata
    .map((urlData) => {
      const emoji = urlData.url_retrieval_status === 'URL_RETRIEVAL_STATUS_SUCCESS' ? '✔️' : '❌';
      return `${emoji} ${urlData.retrieved_url}`;
    })
    .join('\n');

  embed.addFields({
    name: '🔗 URL Context',
    value: truncateString(value) || 'No URL context',
    inline: false,
  });
}

export function buildResponseEmbed(
  botMessage,
  responseText,
  originalMessage,
  groundingMetadata = null,
  urlContextMetadata = null,
) {
  const embed = createEmbed({
    color: EMBED_COLOR,
    description: responseText,
    author: {
      name: `To ${originalMessage.author.displayName}`,
      iconURL: originalMessage.author.displayAvatarURL(),
    },
    timestamp: true,
  });

  if (groundingMetadata && shouldShowGroundingMetadata(originalMessage)) {
    addGroundingMetadata(embed, groundingMetadata);
  }

  if (urlContextMetadata && shouldShowGroundingMetadata(originalMessage)) {
    addUrlContextMetadata(embed, urlContextMetadata);
  }

  if (originalMessage.guild) {
    embed.setFooter({
      text: originalMessage.guild.name,
      iconURL: originalMessage.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png',
    });
  }

  return botMessage.edit(applyEmbedFallback(originalMessage.channel, {
    content: null,
    embeds: [embed],
  }));
}
