import { EmbedBuilder, MessageFlags } from 'discord.js';
import {
  activeRequests,
  chatHistoryLock,
  saveStateToFile,
  updateChatHistory,
  getUserResponsePreference,
  state
} from '../botManager.js';
import { updateEmbed } from '../utils/embedUtils.js';
import { addSettingsButton, addDownloadButton, addDeleteButton, createStopGeneratingButton } from '../utils/buttonUtils.js';
import { sendAsTextFile } from '../utils/fileUtils.js';
import { delay } from '../tools/others.js';
import config from '../config.js';

const { SEND_RETRY_ERRORS_TO_DISCORD } = config;

/**
 * Handle AI model response generation and streaming
 */
export async function handleModelResponse(initialBotMessage, chat, parts, originalMessage, typingInterval, historyId) {
  const userId = originalMessage.author.id;
  const userResponsePreference = originalMessage.guild && state.serverSettings[originalMessage.guild.id]?.serverResponsePreference 
    ? state.serverSettings[originalMessage.guild.id].responseStyle 
    : getUserResponsePreference(userId);
  const maxCharacterLimit = userResponsePreference === 'Embedded' ? 3900 : 1900;
  let attempts = 3;

  let updateTimeout;
  let tempResponse = '';
  // Metadata from Google Search with URL Context tool
  let groundingMetadata = null;
  let urlContextMetadata = null;

  const stopGeneratingButton = createStopGeneratingButton();
  let botMessage;
  
  if (!initialBotMessage) {
    clearInterval(typingInterval);
    try {
      botMessage = await originalMessage.reply({
        content: 'Let me think..',
        components: [stopGeneratingButton]
      });
    } catch (error) {}
  } else {
    botMessage = initialBotMessage;
    try {
      botMessage.edit({
        components: [stopGeneratingButton]
      });
    } catch (error) {}
  }

  let stopGeneration = false;
  const filter = (interaction) => interaction.customId === 'stopGenerating';
  
  try {
    const collector = await botMessage.createMessageComponentCollector({
      filter,
      time: 120000
    });
    
    collector.on('collect', (interaction) => {
      if (interaction.user.id === originalMessage.author.id) {
        try {
          const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Response Stopped')
            .setDescription('Response generation stopped by the user.');

          interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
          });
        } catch (error) {
          console.error('Error sending reply:', error);
        }
        stopGeneration = true;
      } else {
        try {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Access Denied')
            .setDescription("It's not for you.");

          interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
          });
        } catch (error) {
          console.error('Error sending unauthorized reply:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error creating or handling collector:', error);
  }

  const updateMessage = () => {
    if (stopGeneration) {
      return;
    }
    if (tempResponse.trim() === "") {
      botMessage.edit({
        content: '...'
      });
    } else if (userResponsePreference === 'Embedded') {
      updateEmbed(botMessage, tempResponse, originalMessage, groundingMetadata, urlContextMetadata);
    } else {
      botMessage.edit({
        content: tempResponse,
        embeds: []
      });
    }
    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  while (attempts > 0 && !stopGeneration) {
    try {
      let finalResponse = '';
      let isLargeResponse = false;
      const newHistory = [];
      
      newHistory.push({
        role: 'user',
        content: parts
      });

      const messageResult = await chat.sendMessageStream({
        message: parts
      });

      for await (const chunk of messageResult) {
        if (stopGeneration) break;

        const chunkText = chunk.text;
        if (chunkText && chunkText !== '') {
          finalResponse += chunkText;
          tempResponse += chunkText;
        }

        // Capture grounding metadata from Google Search with URL Context tool
        if (chunk.candidates && chunk.candidates[0]?.groundingMetadata) {
          groundingMetadata = chunk.candidates[0].groundingMetadata;
        }

        // Capture URL context metadata from Google Search with URL Context tool
        if (chunk.candidates && chunk.candidates[0]?.url_context_metadata) {
          urlContextMetadata = chunk.candidates[0].url_context_metadata;
        }

        if (finalResponse.length > maxCharacterLimit) {
          if (!isLargeResponse) {
            isLargeResponse = true;
            const embed = new EmbedBuilder()
              .setColor(0xFFFF00)
              .setTitle('Response Overflow')
              .setDescription('The response got too large, will be sent as a text file once it is completed.');

            botMessage.edit({
              embeds: [embed]
            });
          }
        } else if (!updateTimeout) {
          updateTimeout = setTimeout(updateMessage, 500);
        }
      }

      newHistory.push({
        role: 'assistant',
        content: [{
          text: finalResponse
        }]
      });

      // Final update to ensure grounding and URL context metadata is displayed in embedded responses
      if (!isLargeResponse && userResponsePreference === 'Embedded') {
        updateEmbed(botMessage, finalResponse, originalMessage, groundingMetadata, urlContextMetadata);
      }

      botMessage = await addSettingsButton(botMessage);
      
      if (isLargeResponse) {
        await sendAsTextFile(finalResponse, originalMessage, botMessage.id);
        botMessage = await addDeleteButton(botMessage, botMessage.id);
      } else {
        const shouldAddDownloadButton = originalMessage.guild ? state.serverSettings[originalMessage.guild.id]?.settingsSaveButton : true;
        if (shouldAddDownloadButton) {
          botMessage = await addDownloadButton(botMessage);
          botMessage = await addDeleteButton(botMessage, botMessage.id);
        } else {
          botMessage.edit({
            components: []
          });
        }
      }

      await chatHistoryLock.runExclusive(async () => {
        updateChatHistory(historyId, newHistory, botMessage.id);
        await saveStateToFile();
      });
      break;
      
    } catch (error) {
      if (activeRequests.has(userId)) {
        activeRequests.delete(userId);
      }
      console.error('Generation Attempt Failed: ', error);
      attempts--;

      if (attempts === 0 || stopGeneration) {
        if (!stopGeneration) {
          await handleGenerationFailure(error, originalMessage, botMessage);
        }
        break;
      } else if (SEND_RETRY_ERRORS_TO_DISCORD) {
        await handleRetryError(error, originalMessage);
        await delay(500);
      }
    }
  }
  
  if (activeRequests.has(userId)) {
    activeRequests.delete(userId);
  }
}

/**
 * Handle generation failure
 */
async function handleGenerationFailure(error, originalMessage, botMessage) {
  if (SEND_RETRY_ERRORS_TO_DISCORD) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Generation Failure')
      .setDescription(`All Generation Attempts Failed :(\n\`\`\`${error.message}\`\`\``);
    const errorMsg = await originalMessage.channel.send({
      content: `<@${originalMessage.author.id}>`,
      embeds: [embed]
    });
    await addSettingsButton(errorMsg);
    await addSettingsButton(botMessage);
  } else {
    const simpleErrorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Bot Overloaded')
      .setDescription('Something seems off, the bot might be overloaded! :(');
    const errorMsg = await originalMessage.channel.send({
      content: `<@${originalMessage.author.id}>`,
      embeds: [simpleErrorEmbed]
    });
    await addSettingsButton(errorMsg);
    await addSettingsButton(botMessage);
  }
}

/**
 * Handle retry error
 */
async function handleRetryError(error, originalMessage) {
  const errorMsg = await originalMessage.channel.send({
    content: `<@${originalMessage.author.id}>`,
    embeds: [new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('Retry in Progress')
      .setDescription(`Generation Attempt(s) Failed, Retrying..\n\`\`\`${error.message}\`\`\``)
    ]
  });
  setTimeout(() => errorMsg.delete().catch(console.error), 5000);
}