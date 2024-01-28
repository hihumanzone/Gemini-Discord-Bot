require('dotenv').config();
const fetch = require('node-fetch');
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  ModalSubmitInteraction,
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");
const { writeFile, unlink } = require('fs/promises');
const fs = require("fs").promises;
const sharp = require('sharp');
const pdf = require('pdf-parse');
const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const chatHistories = {};
const activeUsersInChannels = {};
const customInstructions = {};
const activeRequests = new Set();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const isDM = message.channel.type === ChannelType.DM;
    const isBotMentioned = message.mentions.users.has(client.user.id);
    const isUserActiveInChannel = activeUsersInChannels[message.channelId] && activeUsersInChannels[message.channelId][message.author.id] || isDM;
  
    if (isUserActiveInChannel || (isBotMentioned && !isDM)) {
      if (activeRequests.has(message.author.id)) {
      await message.reply('> `Please wait until your previous action is complete.`');
      return;
      } else if (message.attachments.size > 0 && hasImageAttachments(message)) {
        await handleImageMessage(message);
      } else if (message.attachments.size > 0 && hasTextFileAttachments(message)) {
        await handleTextFileMessage(message);
      } else {
        await handleTextMessage(message);
      }
    }
  } catch (error) {
    console.error('Error handling a message:', error);
    message.reply('Sorry, something went wrong!');
  }
});

async function alwaysRespond(interaction) {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  if (!activeUsersInChannels[channelId]) {
    activeUsersInChannels[channelId] = {};
  }
  if (activeUsersInChannels[channelId][userId]) {
    delete activeUsersInChannels[channelId][userId];
    await interaction.reply({ content: '> Bot response to your messages is turned `OFF`.', ephemeral: true });
  } else {
    activeUsersInChannels[channelId][userId] = true;
    await interaction.reply({ content: '> Bot response to your messages is turned `ON`.', ephemeral: true });
  }
}

async function clearChatHistory(interaction) {
  chatHistories[interaction.user.id] = [];
  await interaction.reply({ content: '> `Chat history cleared!`', ephemeral: true });
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
  if (interaction.customId === 'settings') {
    await showSettings(interaction);
  } else if (interaction.customId === 'clear') {
    await clearChatHistory(interaction);
  } else if (interaction.customId === 'always-respond') {
    await alwaysRespond(interaction);
  } else if (interaction.customId === 'custom-personality') {
    await setCustomPersonality(interaction);
  } else if (interaction.customId === 'remove-personality') {
    await removeCustomPersonality(interaction);
  }
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
});

async function setCustomPersonality(interaction) {
  const customId = 'custom-personality-input';
  const title = 'Enter Custom Personality Instructions';

  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel("What should the bot's personality be like?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter the custom instructions here...")
    .setMinLength(10)
    .setMaxLength(4000);

  const modal = new ModalBuilder()
    .setCustomId('custom-personality-modal')
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showSettings(interaction) {
  const clearButton = new ButtonBuilder()
    .setCustomId('clear')
    .setLabel('Clear Chat')
    .setStyle(ButtonStyle.Danger);

  const toggleChatButton = new ButtonBuilder()
    .setCustomId('always-respond')
    .setLabel('Always Respond')
    .setStyle(ButtonStyle.Secondary);
    
  const customPersonalityButton = new ButtonBuilder()
    .setCustomId('custom-personality')
    .setLabel('Custom Personality')
    .setStyle(ButtonStyle.Primary);
    
  const removePersonalityButton = new ButtonBuilder()
    .setCustomId('remove-personality')
    .setLabel('Remove Personality')
    .setStyle(ButtonStyle.Danger);

  const actionRows = [];
  const allButtons = [clearButton, toggleChatButton, customPersonalityButton, removePersonalityButton];

  while (allButtons.length > 0) {
    const actionRow = new ActionRowBuilder().addComponents(allButtons.splice(0, 5));
    actionRows.push(actionRow);
  }

  await interaction.reply({
    content: '> ```Settings:```',
    components: actionRows,
    ephemeral: true
  });
}

async function handleImageMessage(message) {
  const imageAttachments = message.attachments.filter((attachment) =>
    attachment.contentType?.startsWith('image/')
  );

  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();

  if (imageAttachments.size > 0) {
    const visionModel = await genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    const imageParts = await Promise.all(
      imageAttachments.map(async attachment => {
        const response = await fetch(attachment.url);
        const buffer = await response.buffer();

        if (buffer.length > 4 * 1024 * 1024) {
          try {

            const compressedBuffer = await compressImage(buffer);
            
            if (compressedBuffer.length > 4 * 1024 * 1024) {
              throw new Error('Image too large after compression.');
            }

            return { inlineData: { data: compressedBuffer.toString('base64'), mimeType: 'image/jpeg' } };
          } catch (error) {
            console.error('Compression error:', error);
            await message.reply('The image is too large for Gemini to process even after attempting to compress it.');
            throw error;
          }
        } else {
          return { inlineData: { data: buffer.toString('base64'), mimeType: attachment.contentType } };
        }
      })
    );

    const botMessage = await message.reply({ content: 'Analyzing the image(s) with your text prompt...' });
    await handleModelResponse(botMessage, async () => visionModel.generateContentStream([messageContent, ...imageParts]), message);
  }
}

async function compressImage(buffer) {
  const maxDimension = 3072;

  return sharp(buffer)
    .resize(maxDimension, maxDimension, {
      fit: sharp.fit.inside,
      withoutEnlargement: true
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function handleTextFileMessage(message) {
  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();

  const fileAttachments = message.attachments.filter((attachment) =>
    attachment.contentType?.startsWith('application/pdf') ||
    attachment.contentType?.startsWith('text/plain') ||
    attachment.contentType?.startsWith('text/html') ||
    attachment.contentType?.startsWith('text/css') ||
    attachment.contentType?.startsWith('application/javascript') ||
    attachment.contentType?.startsWith('application/json')
  );

  if (fileAttachments.size > 0) {
    let botMessage = await message.reply({ content: 'Processing your document(s)...' });
    let formattedMessage = messageContent;

    for (const [attachmentId, attachment] of fileAttachments) {
      let extractedText;
      if (attachment.contentType?.startsWith('application/pdf')) {
        extractedText = await extractTextFromPDF(attachment.url);
      } else {
        extractedText = await fetchTextContent(attachment.url);
      }
      formattedMessage += `\n\n[${attachment.name}] File Content:\n"${extractedText}"`;
    }

    const model = await genAI.getGenerativeModel({ model: 'gemini-pro' });

    const chat = model.startChat({
      history: getHistory(message.author.id),
      safetySettings,
    });

    await handleModelResponse(botMessage, () => chat.sendMessageStream(formattedMessage), message);
  }
}

function hasImageAttachments(message) {
  return message.attachments.some((attachment) =>
    attachment.contentType?.startsWith('image/')
  );
}

function hasTextFileAttachments(message) {
  return message.attachments.some((attachment) =>
    attachment.contentType?.startsWith('application/pdf') ||
    attachment.contentType?.startsWith('text/plain') ||
    attachment.contentType?.startsWith('text/html') ||
    attachment.contentType?.startsWith('text/css') ||
    attachment.contentType?.startsWith('application/javascript') ||
    attachment.contentType?.startsWith('application/json')
  );
}

async function fetchTextContent(url) {
  try {
    const response = await fetch(url);
    return await response.text();
  } catch (error) {
    console.error('Error fetching text content:', error);
    throw new Error('Could not fetch text content from file');
  }
}

const safetySettings = [  {    category: HarmCategory.HARM_CATEGORY_HARASSMENT,    threshold: HarmBlockThreshold.BLOCK_NONE,  },  {    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,    threshold: HarmBlockThreshold.BLOCK_NONE,  },  {    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,    threshold: HarmBlockThreshold.BLOCK_NONE,  },  {    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,    threshold: HarmBlockThreshold.BLOCK_NONE,  },];

async function scrapeWebpageContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style').remove();

    let bodyText = $('body').text();

    bodyText = bodyText.replace(/<[^>]*>?/gm, '');

    return bodyText.trim();

  } catch (error) {
    console.error('Error scraping webpage content:', error);
    throw new Error('Could not scrape content from webpage');
  }
}

async function handleTextMessage(message) {
  const model = await genAI.getGenerativeModel({ model: 'gemini-pro' });
  let botMessage;
  const userId = message.author.id;
  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();
  if (messageContent === '') {
    await message.reply("> `It looks like you didn't say anything. What would you like to talk about?`");
    return;
  }
  const instructions = customInstructions[message.author.id];
  
  let formattedMessage = instructions
    ? `[Instructions To Follow]: ${instructions}\n\n[User Message]: ${messageContent}`
    : messageContent

  const urls = extractUrls(messageContent);
  activeRequests.add(userId);
  const videoTranscripts = {};
  if (urls.length > 0) {
    botMessage = await message.reply('Fetching content from the URLs...');
    await handleUrlsInMessage(urls, formattedMessage, botMessage, message);
  } else {
    botMessage = await message.reply('> `Let me think...`');
    const chat = model.startChat({
      history: getHistory(message.author.id),
      safetySettings,
    });
      await handleModelResponse(botMessage, () => chat.sendMessageStream(formattedMessage), message);
  }
}

async function removeCustomPersonality(interaction) {
  delete customInstructions[interaction.user.id];
  await interaction.reply({ content: "> Custom personality instructions removed!", ephemeral: true });
}

async function handleUrlsInMessage(urls, messageContent, botMessage, originalMessage) {
  const model = await genAI.getGenerativeModel({ model: 'gemini-pro' });
  const chat = model.startChat({
    history: getHistory(originalMessage.author.id),
    safetySettings,
  });

  let contentIndex = 1;
  let contentWithUrls = messageContent;
  for (const url of urls) {
    try {
      if (url.includes('youtu.be') || url.includes('youtube.com')) {
        const videoId = extractYouTubeVideoId(url);
        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
        const transcriptText = transcriptData.map(item => item.text).join(' ');
        contentWithUrls += `\n\n[Transcript of Video ${contentIndex}]:\n"${transcriptText}"`;
      } else {
        const webpageContent = await scrapeWebpageContent(url);
        contentWithUrls += `\n\n[Content of URL ${contentIndex}]:\n"${webpageContent}"`;
      }
      contentWithUrls = contentWithUrls.replace(url, `[Reference ${contentIndex}](${url})`);
      contentIndex++;
    } catch (error) {
      console.error('Error handling URL:', error);
      contentWithUrls += `\n\n[Error]: Can't access content from the [URL ${contentIndex}](${url}), likely due to bot blocking. Mention if you were blocked in your reply.`;
    }
  }
  await handleModelResponse(botMessage, () => chat.sendMessageStream(contentWithUrls), originalMessage);
}

function extractYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  
  return (match && match[2].length === 11) ? match[2] : null;
}

function extractUrls(text) {
  return text.match(/\bhttps?:\/\/\S+/gi) || [];
}

async function handleModelResponse(botMessage, responseFunc, originalMessage) {
  const userId = originalMessage.author.id;

  try {
    const messageResult = await responseFunc();
    let finalResponse = '';
    let isLargeResponse = false;

    for await (const chunk of messageResult.stream) {
      const chunkText = await chunk.text();
      finalResponse += chunkText;

      if (!isLargeResponse && finalResponse.length > 1900) {
        await botMessage.edit('The response is too large and will be sent as a text file once it is ready.');
        isLargeResponse = true;
      } else if (!isLargeResponse) {
        await botMessage.edit({ content: finalResponse });
      }
    }

    if (isLargeResponse) {
      await sendAsTextFile(finalResponse, originalMessage);
    } else {
      await addSettingsButton(botMessage);
    }

    updateChatHistory(originalMessage.author.id, originalMessage.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim(), finalResponse);
  } catch (error) {
    console.error('Error handling model response:', error);
    await botMessage.edit({ content: 'Sorry, an error occurred while generating a response.' });
  } finally {
    activeRequests.delete(userId);
  }
}

async function sendAsTextFile(text, message) {
  const filename = `response-${Date.now()}.txt`;
  await writeFile(filename, text);
  await message.reply({ content: 'Here is the response:', files: [filename] });

  await unlink(filename);
}

async function attachmentToPart(attachment) {
  const response = await fetch(attachment.url);
  const buffer = await response.buffer();
  return { inlineData: { data: buffer.toString('base64'), mimeType: attachment.contentType } };
}

async function extractTextFromPDF(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.buffer();

    let data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Could not extract text from PDF');
  }
}

async function fetchTextFile(url) {
  try {
    const response = await fetch(url);
    return await response.text();
  } catch (error) {
    console.error('Error fetching text file:', error);
    throw new Error('Could not fetch text from file');
  }
}

function getHistory(userId) {
  return chatHistories[userId]?.map((line, index) => ({
    role: index % 2 === 0 ? 'user' : 'model',
    parts: line,
  })) || [];
}

function updateChatHistory(userId, userMessage, modelResponse) {
  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  chatHistories[userId].push(userMessage);
  chatHistories[userId].push(modelResponse);
}

async function addSettingsButton(botMessage) {
  const settingsButton = new ButtonBuilder()
    .setCustomId('settings')
    .setEmoji('⚙️')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder().addComponents(settingsButton);
  await botMessage.edit({ components: [actionRow] });
}

client.login(process.env.DISCORD_BOT_TOKEN);
