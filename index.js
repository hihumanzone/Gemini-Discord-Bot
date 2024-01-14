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
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");
const { writeFile, unlink } = require('fs/promises');
const pdf = require('pdf-parse');
const cheerio = require('cheerio');
// npm i youtube-transcript
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
const activeChannels = {};
const activeUsersInChannels = {};

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  try {
    // Prevent the bot from responding to itself
    if (message.author.bot) return;

    // Check if this is a command to toggle chat functionality for non-DM channels
    if (message.content.trim() === '>toggle-chat' && message.channel.type !== ChannelType.DM) {
      await toggleChat(message);
      return;
    }

    // Determine if the bot is active for the channel, mentioned, or in a DM
    const isDM = message.channel.type === ChannelType.DM;
      const isBotMentioned = message.mentions.users.has(client.user.id);
      const isUserActiveInChannel = activeUsersInChannels[message.channelId] && activeUsersInChannels[message.channelId][message.author.id] || isDM;
      
      if (isUserActiveInChannel || (isBotMentioned && !isDM)) {
      if (message.attachments.size > 0 && hasImageAttachments(message)) {
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

async function toggleChat(message) {
  // Ensure the channel is initialized in activeUsersInChannels
  if (!activeUsersInChannels[message.channelId]) {
    activeUsersInChannels[message.channelId] = {};
  }

  // Toggle the state for the current channel and user
  const userId = message.author.id;
  if (activeUsersInChannels[message.channelId][userId]) {
    delete activeUsersInChannels[message.channelId][userId];
    await message.reply('Bot response to your messages is turned OFF.');
  } else {
    activeUsersInChannels[message.channelId][userId] = true;
    await message.reply('Bot response to your messages is turned ON.');
  }
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === 'clear') {
    chatHistories[interaction.user.id] = [];
    await interaction.reply({ content: 'Chat history cleared!', ephemeral: true });
  }
});

async function handleImageMessage(message) {
  const imageAttachments = message.attachments.filter((attachment) =>
    attachment.contentType?.startsWith('image/')
  );

  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();

  if (imageAttachments.size > 0) {
    const visionModel = await genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    const imageParts = await Promise.all(imageAttachments.map(attachmentToPart));
    const botMessage = await message.reply({ content: 'Analyzing the image(s) with your text prompt...' });
    await handleModelResponse(botMessage, async () => visionModel.generateContentStream([messageContent, ...imageParts]), message);
  }
}

// Refactored handleTextFileMessage function to handle multiple file attachments
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

    // Retrieve extracted text from all attachments
    for (const [attachmentId, attachment] of fileAttachments) {
      let extractedText;
      if (attachment.contentType?.startsWith('application/pdf')) {
        extractedText = await extractTextFromPDF(attachment.url);
      } else {
        extractedText = await fetchTextContent(attachment.url);
      }
      formattedMessage += `\n\n[${attachment.name}] File Content:\n"${extractedText}"`;
    }

    // Load the text model for handling the conversation
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

// Function to scrape content from a webpage
async function scrapeWebpageContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    return $('body').text().trim();
  } catch (error) {
    console.error('Error scraping webpage content:', error);
    throw new Error('Could not scrape content from webpage');
  }
}

async function handleTextMessage(message) {
  const model = await genAI.getGenerativeModel({ model: 'gemini-pro' });
  let botMessage;

  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();
  const urls = extractUrls(messageContent);

  if (urls.length > 0) {
    botMessage = await message.reply('Fetching content from the URLs...');
    await handleUrlsInMessage(urls, messageContent, botMessage, message);
  } else {
    botMessage = await message.reply('Let me think...');
    const chat = model.startChat({
      history: getHistory(message.author.id),
      safetySettings,
    });
    await handleModelResponse(botMessage, () => chat.sendMessageStream(messageContent), message);
  }
}

async function handleUrlsInMessage(urls, messageContent, botMessage, originalMessage) {
  const model = await genAI.getGenerativeModel({ model: 'gemini-pro' });
  const chat = model.startChat({
    history: getHistory(originalMessage.author.id),
    safetySettings,
  });

  let contentWithUrls = messageContent;
  for (const url of urls) {
    try {
      if (url.includes('youtu.be') || url.includes('youtube.com')) {
        const videoId = extractYouTubeVideoId(url);
        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
        const transcriptText = transcriptData.map(item => item.text).join(' ');
        contentWithUrls += `\n\n[YouTube Transcript]:\n"${transcriptText}"`;
      } else {
        const webpageContent = await scrapeWebpageContent(url);
        contentWithUrls += `\n\n[URL Content]:\n"${webpageContent}"`;
      }
    } catch (error) {
      console.error('Error handling URL:', error);
      contentWithUrls += `\n\n[Error]: Could not fetch content from the URL: ${url}`;
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
      await addClearChatComponents(botMessage);
    }

    updateChatHistory(originalMessage.author.id, originalMessage.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim(), finalResponse);
  } catch (error) {
    console.error('Error handling model response:', error);
    await botMessage.edit({ content: 'Sorry, an error occurred while generating a response.' });
  }
}

async function sendAsTextFile(text, message) {
  const filename = `response-${Date.now()}.txt`;
  await writeFile(filename, text);
  await message.reply({ content: 'Here is the response:', files: [filename] });

  // Cleanup: Remove the file after sending it
  await unlink(filename);
}

async function attachmentToPart(attachment) {
  const response = await fetch(attachment.url);
  const buffer = await response.buffer();
  return { inlineData: { data: buffer.toString('base64'), mimeType: attachment.contentType } };
}

// Function to extract text from a PDF file
async function extractTextFromPDF(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.buffer();

    // pdf-parse expects a buffer
    let data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Could not extract text from PDF');
  }
}

// Function to fetch text from a plaintext file
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

async function addClearChatComponents(botMessage) {
  const clearButton = new ButtonBuilder()
    .setCustomId('clear')
    .setEmoji('🧹')
    .setStyle(ButtonStyle.Secondary)
  const actionRow = new ActionRowBuilder().addComponents(clearButton);
  await botMessage.edit({ components: [actionRow] });
}

client.login(process.env.DISCORD_BOT_TOKEN);
