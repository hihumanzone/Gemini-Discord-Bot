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
const OpenAI = require('openai');
const { writeFile, unlink } = require('fs/promises');
const { createWriteStream, mkdtempSync, promises: fsPromises } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const util = require('util');
const streamPipeline = util.promisify(require('stream').pipeline);
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
const openai = new OpenAI();
const chatHistories = {};
const activeUsersInChannels = {};
const customInstructions = {};
const userPreferredImageModel = {};
const activeRequests = new Set();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  try {
    // Prevent the bot from responding to itself
    if (message.author.bot) return;

    // Determine if the bot is active for the channel, mentioned, or in a DM
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

  // Ensure the channel is initialized in activeUsersInChannels
  if (!activeUsersInChannels[channelId]) {
    activeUsersInChannels[channelId] = {};
  }

  // Toggle the state for the current channel and user
  if (activeUsersInChannels[channelId][userId]) {
    delete activeUsersInChannels[channelId][userId];

    // Send an ephemeral message to the user who interacted
    await interaction.reply({ content: '> Bot response to your messages is turned `OFF`.', ephemeral: true });
  } else {
    activeUsersInChannels[channelId][userId] = true;

    // Send an ephemeral message to the user who interacted
    await interaction.reply({ content: '> Bot response to your messages is turned `ON`.', ephemeral: true });
  }
}

async function clearChatHistory(interaction) {
  chatHistories[interaction.user.id] = [];

  // Send an ephemeral message to the user who interacted
  await interaction.reply({ content: '> `Chat history cleared!`', ephemeral: true });
}

client.on('interactionCreate', async (interaction) => {
  // Check if the interaction is a button click
  if (interaction.isButton()) {

  // Handle the interaction based on the customId of the button clicked
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
  } else if (interaction.customId === 'generate-image') {
    await handleGenerateImageButton(interaction);
  } else if (interaction.customId === 'toggle-image-model') {
    await toggleImageModel(interaction);
  } else if (interaction.customId.startsWith('select-model-')) {
    const selectedModel = interaction.customId.replace('select-model-', '');
    await handleSelectModel(interaction, selectedModel);
  }
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
});

async function handleGenerateImageButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('generate-image-modal')
    .setTitle('Generate An Image')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image-prompt-input')
          .setLabel("Describe the image you'd like to generate:")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter your image description here")
          .setMinLength(1)
          .setMaxLength(4000)
      )
    );

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    const customInstructionsInput = interaction.fields.getTextInputValue('custom-personality-input');
    customInstructions[interaction.user.id] = customInstructionsInput.trim();

    await interaction.reply({ content: '> Custom personality instructions saved!' });

    setTimeout(() => interaction.deleteReply(), 10000); // Delete after 10 seconds
  } else if (interaction.customId === 'generate-image-modal') {
  const prompt = interaction.fields.getTextInputValue('image-prompt-input');
  let message = `${interaction.user}, generating your image, please wait... 🖌️`;

  const messageReference = await interaction.reply({ content: message });

  try {
      const imageResult = await generateImageWithPrompt(prompt, interaction.user.id);
      const imageUrl = imageResult.images[0].url;
      const modelUsed = imageResult.modelUsed; // Capture the model used
    
      // Update the message to include the model used
      message = `> ${interaction.user}, here is your generated image based on the prompt:\n\`\`\`${prompt}\`\`\`\n> **Generated by**: \`${interaction.user.tag}\`\n> **Model Used**: \`${modelUsed}\``;
      await messageReference.edit({ content: message, files: [imageUrl] });
    } catch (error) {
      message = `${interaction.user}, sorry, could not generate the image. Please try again later.`;
      await messageReference.edit({ content: message });
    }
  }
}

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

  // Present the modal to the user
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

  const generateImageButton = new ButtonBuilder()
    .setCustomId('generate-image')
    .setLabel('Generate Image')
    .setStyle(ButtonStyle.Primary);

  const imageToggleButton = new ButtonBuilder()
    .setCustomId('toggle-image-model')
    .setLabel('Toggle Image Model')
    .setStyle(ButtonStyle.Secondary);

  // Split settings into multiple action rows if there are more than 5 buttons
  const actionRows = [];
  const allButtons = [clearButton, toggleChatButton, customPersonalityButton, removePersonalityButton, generateImageButton, imageToggleButton];

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

async function toggleImageModel(interaction) {
  // Create buttons for each model
  const buttons = [
    new ButtonBuilder().setCustomId('select-model-kandinsky-3').setLabel('Kandinsky-3').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-model-Proteus').setLabel('Proteus').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-model-Animagine-XL').setLabel('Animagine-XL').setStyle(ButtonStyle.Primary),
  ];

  // Split buttons into multiple ActionRows if there are more than 5 buttons
  const actionRows = [];
  while (buttons.length > 0) {
    const actionRow = new ActionRowBuilder().addComponents(buttons.splice(0, 5));
    actionRows.push(actionRow);
  }

  // Reply with the message prompting user to select an image generation model
  await interaction.reply({
    content: 'Please select an image generation model:',
    components: actionRows,
    ephemeral: true,
  });
}

async function handleSelectModel(interaction, model) {
  const userId = interaction.user.id;
  userPreferredImageModel[userId] = model;
  await interaction.reply({ content: `Image generation model selected: ${model}`, ephemeral: true });
}

async function generateImageWithPrompt(prompt, userId) {
  try {
    const selectedModel = userPreferredImageModel[userId] || "kandinsky-3";

    if (selectedModel === "kandinsky-3") {
      return await generateWithOpenAI(prompt);
    }

    return await generateWithHuggingFace(prompt, selectedModel);
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Could not generate image');
  }
}

async function generateWithOpenAI(prompt) {
  const response = await openai.images.generate({
    model: "kandinsky-3",
    prompt: prompt,
    n: 1,
  });

  return { images: response.data, modelUsed: "kandinsky-3" };
}

async function generateWithHuggingFace(prompt, selectedModel) {
  const modelNameMap = {
    "Animagine-XL": "cagliostrolab/animagine-xl-3.0",
    "Proteus": "dataautogpt3/ProteusV0.2"
  };
  const modelName = modelNameMap[selectedModel];
  const buffer = await huggingFaceImageGeneration(modelName, prompt);
  const nodeBuffer = Buffer.from(buffer);
  const tempFilePath = `./temp_${Date.now()}_${selectedModel}.png`;

  await fs.writeFile(tempFilePath, nodeBuffer);

  return { images: [{ url: tempFilePath }], modelUsed: selectedModel };
}

async function huggingFaceImageGeneration(modelName, prompt) {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${modelName}`,
    {
      headers: { Authorization: `Bearer ${process.env.HF_AUTH_TOKEN}` },
      method: "POST",
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!response.ok) throw new Error(`Unexpected response ${response.statusText}`);
  return await response.arrayBuffer();
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

// Function to compress and resize an image
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

// handleTextFileMessage function to handle multiple file attachments
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

async function scrapeWebpageContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script and style tags along with their content
    $('script, style').remove();

    // Extract and clean the text content within the <body> tag
    let bodyText = $('body').text();

    // Remove any text that might still be enclosed in angle brackets
    bodyText = bodyText.replace(/<[^>]*>?/gm, '');

    // Trim leading and trailing white-space and return
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
  
  // Only include instructions if they are set.
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
  // Remove the custom instructions for the user
  delete customInstructions[interaction.user.id];

  // Let the user know their custom instructions have been removed
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
        // For non-video URLs, attempt to scrape webpage content
        const webpageContent = await scrapeWebpageContent(url);
        contentWithUrls += `\n\n[Content of URL ${contentIndex}]:\n"${webpageContent}"`;
      }
      // In both cases, replace the URL with a reference in the text
      contentWithUrls = contentWithUrls.replace(url, `[Reference ${contentIndex}](${url})`);
      contentIndex++;
    } catch (error) {
      console.error('Error handling URL:', error);
      contentWithUrls += `\n\n[Error]: Can't access content from the [URL ${contentIndex}](${url}), likely due to bot blocking. Mention if you were blocked in your reply.`;
    }
  }
  // After processing all URLs, continue with the chat response
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

async function addSettingsButton(botMessage) {
  const settingsButton = new ButtonBuilder()
    .setCustomId('settings')
    .setEmoji('⚙️')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder().addComponents(settingsButton);
  await botMessage.edit({ components: [actionRow] });
}

client.login(process.env.DISCORD_BOT_TOKEN);
