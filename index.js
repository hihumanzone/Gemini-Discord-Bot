// <=====[Main]=====>

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
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder,
  ActivityType,
  StringSelectMenuBuilder,
  REST,
  Routes,
} = require('discord.js');
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const { writeFile, unlink } = require('fs/promises');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const sharp = require('sharp');
const pdf = require('pdf-parse');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const EventSource = require('eventsource');

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
const token = process.env.DISCORD_BOT_TOKEN;
const activeRequests = new Set();

// Define your objects
let chatHistories = {};
let activeUsersInChannels = {};
let customInstructions = {};
let serverSettings = {};
let userPreferredImageModel = {};
let userPreferredImageResolution = {};
let userPreferredImagePromptEnhancement = {};
let userPreferredSpeechModel = {};
let userPreferredUrlHandle = {};
let userResponsePreference = {};
let alwaysRespondChannels = {};
let blacklistedUsers = {};

// Path to your file
const DATA_FILE = path.join(__dirname, 'serverData.json');
loadStateFromFile();

// Function to save current state to file
function saveStateToFile() {
  const state = {
    chatHistories,
    activeUsersInChannels,
    customInstructions,
    serverSettings,
    userPreferredImageModel,
    userPreferredImageResolution,
    userPreferredImagePromptEnhancement,
    userPreferredSpeechModel,
    userPreferredUrlHandle,
    userResponsePreference,
    alwaysRespondChannels,
    blacklistedUsers,
  };

  fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), (err) => {
    if (err) {
      console.error('Error saving state:', err);
    }
  });
}

// Function to load state from file
function loadStateFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE);
      const state = JSON.parse(data);

      chatHistories = state.chatHistories;
      activeUsersInChannels = state.activeUsersInChannels;
      customInstructions = state.customInstructions;
      serverSettings = state.serverSettings;
      userPreferredImageModel = state.userPreferredImageModel;
      userPreferredImageResolution = state.userPreferredImageResolution;
      userPreferredImagePromptEnhancement = state.userPreferredImagePromptEnhancement;
      userPreferredSpeechModel = state.userPreferredSpeechModel;
      userPreferredUrlHandle = state.userPreferredUrlHandle;
      userResponsePreference = state.userResponsePreference;
      alwaysRespondChannels = state.alwaysRespondChannels;
      blacklistedUsers = state.blacklistedUsers;

      console.log('State loaded successfully.');
    } else {
      console.log('No previous state to load.');
    }
  } catch (err) {
    console.error('Error loading state:', err);
  }
}

// <==========>



// <=====[Configuration]=====>

const defaultResponseFormat = 'embedded'; //OR 'normal'
const defaultImgModel = 'SD-XL';
const defaultUrlReading = 'ON'; //OR 'OFF'
const bannerMusicGen = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACACAYAAADktbcKAAADOElEQVR4Ae3UwQ0AIAwDscL+OwMPtjgjMUCcKmtmzvseAQJBgR3MLDIBAl/AADgFAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80Qlc6QQB/7svaWEAAAAASUVORK5CYII=' //Only `png` format
const nevPrompt = "(deformed, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation, (NSFW:1.25)";
const activities = [
    { name: 'With Code', type: ActivityType.Playing },
    { name: 'Something', type: ActivityType.Listening },
    { name: 'You', type: ActivityType.Watching }
    // Add more activities as desired
];

// <==========>



// <=====[Register Commands And Activities]=====>

let activityIndex = 0;
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const commands = [
    new SlashCommandBuilder()
      .setName('imagine')
      .setDescription('Generate an image based on a prompt using a selected model.')
      .addStringOption(option =>
        option.setName('model')
          .setDescription('The image generation model to use.')
          .setRequired(true)
          .addChoices(
            { name: 'SD-XL', value: 'SD-XL' },
            { name: 'Playground', value: 'Playground' },
            { name: 'Anime', value: 'Anime' },
            { name: 'Stable-Cascade', value: 'Stable-Cascade'},
            { name: 'Redmond', value: 'Redmond' },
            { name: 'DallE-XL', value: 'DallE-XL' },
            { name: 'Juggernaut', value: 'Juggernaut' },
            //{ name: 'Dall-e-3', value: 'Dall-e-3' },
            { name: 'SD-XL-Alt', value: 'SD-XL-Alt' }
          )
      )
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The prompt to generate the image from.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('respondtoall')
      .setDescription('Enables the bot to always respond to all messages in this channel.'),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clears the conversation history.'),
    new SlashCommandBuilder()
      .setName('settings')
      .setDescription('Opens Up Settings.'),
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Opens Up The Dashboard.'),
    new SlashCommandBuilder()
      .setName('speech')
      .setDescription('Generate speech from text.')
      .addStringOption(option =>
        option.setName('language')
          .setDescription('The language to use.')
          .setRequired(true)
          .addChoices(
            { name: 'English', value: 'English' },
            { name: 'Spanish', value: 'Spanish' },
            { name: 'French', value: 'French' },
            { name: 'Chinese', value: 'Chinese' },
            { name: 'Korean', value: 'Korean' },
            { name: 'Japanese', value: 'Japanese' }
          )
      )
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The text prompt to generate the speech from.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('music')
      .setDescription('Generate an music based on a prompt.')
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The prompt to generate the music from.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('video')
      .setDescription('Generate an video based on a prompt.')
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The prompt to generate the video from.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('Blacklists a user from using certain interactions')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('The user to blacklist')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('whitelist')
      .setDescription('Removes a user from the blacklist')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('The user to whitelist')
          .setRequired(true)
      ),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }

  client.user.setPresence({
    activities: [activities[activityIndex]],
    status: 'idle',
  });

  setInterval(() => {
    activityIndex = (activityIndex + 1) % activities.length;
    client.user.setPresence({
      activities: [activities[activityIndex]],
      status: 'idle',
    });
  }, 30000);
});

// <==========>



// <=====[Messages And Interaction]=====>

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const mentionPattern = new RegExp(`^<@!?${client.user.id}>(?:\\s+)?(generate|imagine)`, 'i');
    const startsWithPattern = /^generate|^imagine/i;
    const command = message.content.match(mentionPattern) || message.content.match(startsWithPattern);

    // Decide if the bot should respond based on channel conditions
    const shouldRespond = (
      alwaysRespondChannels[message.channelId] ||
      message.mentions.users.has(client.user.id) && !isDM ||
      activeUsersInChannels[message.channelId]?.[message.author.id] || isDM
    );

    if (shouldRespond) {
      if (message.guild) {
        initializeBlacklistForGuild(message.guild.id);
        if (blacklistedUsers[message.guild.id].includes(message.author.id)) {
          return message.reply({ content: 'You are blacklisted and cannot use this bot.' });
        }
      }
      if (command) {
        // Extract the command name and the prompt
        const prompt = message.content.slice(command.index + command[0].length).trim();
        if (prompt) {
          await genimg(prompt, message);
        } else {
          await message.channel.send("> `Please provide a valid prompt.`");
        }
      } else if (activeRequests.has(message.author.id)) {
        await message.reply('> `Please wait until your previous action is complete.`');
      } else if (message.attachments.size > 0 && hasImageAttachments(message)) {
        await handleImageMessage(message);
      } else if (message.attachments.size > 0 && hasTextFileAttachments(message)) {
        await handleTextFileMessage(message);
      } else {
        await handleTextMessage(message);
      }
    }
  } catch (error) {
    console.error('Error processing the message:', error.message);
    if (activeRequests.has(message.author.id)) {
      activeRequests.delete(message.author.id);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isCommand()) return;
    switch (interaction.commandName) {
      case 'respondtoall':
        await handleRespondToAllCommand(interaction);
        break;
      case 'whitelist':
        await handleWhitelistCommand(interaction);
        break;
      case 'blacklist':
        await handleBlacklistCommand(interaction);
        break;
      case 'imagine':
        await handleImagineCommand(interaction);
        break;
      case 'clear':
        const serverChatHistoryEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.serverChatHistory : false;
        if (!serverChatHistoryEnabled) {
          await clearChatHistory(interaction);
        } else {
          await interaction.reply("Clearing chat history is not enabled for this server, Server-Wide chat history is active.");
        }
        break;
      case 'speech':
        await handleSpeechCommand(interaction);
        break;
      case 'settings':
        await showSettings(interaction);
        break;
      case 'dashboard':
        await showDashboard(interaction);
        break;
      case 'video':
        await handleVideoCommand(interaction);
        break;
      case 'music':
        await handleMusicCommand(interaction);
        break;
      default:
        console.log(`Unknown command: ${interaction.commandName}`);
        break;
    }
  } catch (error) {
    console.error('Error handling command:', error.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.guild) {
        initializeBlacklistForGuild(interaction.guild.id);
        if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
          return interaction.reply({ content: 'You are blacklisted and cannot use this interaction.', ephemeral: true });
        }
      }
      switch (interaction.customId) {
        case 'server-chat-history':
          await toggleServerWideChatHistory(interaction);
          break;
        case 'clear-server':
          await clearServerChatHistory(interaction);
          break;
        case 'settings-save-buttons':
          await toggleSettingSaveButton(interaction);
          break;
        case 'custom-server-personality':
          await serverPersonality(interaction);
          break;
        case 'toggle-server-personality':
          await toggleServerPersonality(interaction);
          break;
        case 'download-server-conversation':
          await downloadServerConversation(interaction);
          break;
        case 'response-server-mode':
          await toggleServerPreference(interaction);
          break;
        case 'toggle-response-server-mode':
          await toggleServerResponsePreference(interaction);
          break;
        case 'settings':
          await showSettings(interaction);
          break;
        case 'clear':
          const serverChatHistoryEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.serverChatHistory : false;
          if (!serverChatHistoryEnabled) {
            await clearChatHistory(interaction);
          } else {
            await interaction.reply({content: "Clearing chat history is not enabled for this server, Server-Wide chat history is active.", ephemeral: true});
          }
          break;
        case 'always-respond':
          await alwaysRespond(interaction);
          break;
        case 'custom-personality':
          const serverCustomEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.customServerPersonality : false;
          if (!serverCustomEnabled) {
            await setCustomPersonality(interaction);
          } else {
            await interaction.reply({content: "Custom personality is not enabled for this server, Server-Wide personality is active.", ephemeral: true});
          }
          break;
        case 'remove-personality':
          const isServerEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.customServerPersonality : false;
          if (!isServerEnabled) {
            await removeCustomPersonality(interaction);
          } else {
            await interaction.reply({content: "Custom personality is not enabled for this server, Server-Wide personality is active.", ephemeral: true});
          }
          break;
        case 'generate-image':
          await handleGenerateImageButton(interaction);
          break;
        case 'change-image-model':
          await changeImageModel(interaction);
          break;
        case 'toggle-prompt-enhancer':
          await togglePromptEnhancer(interaction);
          break;
        case 'change-image-resolution':
          await changeImageResolution(interaction);
          break;
        case 'toggle-response-mode':
          const serverResponsePreferenceEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.serverResponsePreference : false;
          if (!serverResponsePreferenceEnabled) {
            await toggleUserPreference(interaction);
          } else {
            await interaction.reply({content: "Toggling Response Mode is not enabled for this server, Server-Wide Response Mode is active.", ephemeral: true});
          }
          break;
       case 'toggle-url-mode':
          await toggleUrlUserPreference(interaction);
          break;
        case 'generate-speech':
          await processSpeechGet(interaction);
          break;
        case 'generate-music':
          await processMusicGet(interaction);
          break;
        case 'generate-video':
          await processVideoGet(interaction);
          break;
        case 'change-speech-model':
          await changeSpeechModel(interaction);
          break;
        case 'download-conversation':
          await downloadConversation(interaction);
          break;
        case 'download_message':
          await downloadMessage(interaction);
          break;
        case 'exit':
          await interaction.message.delete();
          break;
        default:
          if (interaction.customId.startsWith('select-speech-model-')) {
            const selectedModel = interaction.customId.replace('select-speech-model-', '');
            await handleSpeechSelectModel(interaction, selectedModel);
          }
      }
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('Error handling command:', error.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId === 'select-image-model') {
      const selectedModel = interaction.values[0];
      await handleImageSelectModel(interaction, selectedModel);
    } else if (interaction.customId === 'select-image-resolution') {
      const selectedResolution = interaction.values[0];
      await handleImageSelectResolution(interaction, selectedResolution);
    }
  } catch (error) {
    console.error('Error handling select menu interaction:', error.message);
  }
});

// <==========>



// <=====[Messages Handling]=====>

async function handleImageMessage(message) {
  const imageAttachments = message.attachments.filter((attachment) =>
    attachment.contentType?.startsWith('image/')
  );

  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();

  if (imageAttachments.size > 0) {
    const visionModel = await genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }, { apiVersion: 'v1beta' });
    const imageParts = await Promise.all(
      imageAttachments.map(async attachment => {
        const response = await fetch(attachment.url);
        const buffer = await response.buffer();

        if (buffer.length > 3 * 1024 * 1024) {
          try {

            const compressedBuffer = await compressImage(buffer);

            if (compressedBuffer.length > 3.9 * 1024 * 1024) {
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
    const isServerChatHistoryEnabled = message.guild ? serverSettings[message.guild.id]?.serverChatHistory : false;
    const chat = visionModel.startChat({
      history: isServerChatHistoryEnabled ? getHistory(message.guild.id) : getHistory(message.author.id),
      safetySettings,
    });

    const botMessage = await message.reply({ content: 'Analyzing the image(s) with your text prompt...' });
    await handleModelResponse(botMessage, async () => chat.sendMessageStream([messageContent, ...imageParts]), message);
  }
}

async function handleTextFileMessage(message) {
  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();

  const supportedMimeTypes = [
    'application/pdf', 'text/plain', 'text/html', 'text/css',
    'application/javascript', 'application/json', 'text/x-python',
    'application/x-yaml', 'text/markdown', 'application/xml'
  ];

  const supportedFileExtensions = [
    'md', 'yaml', 'yml', 'xml', 'env', 'sh', 'bat', 'rb', 'c', 'cpp', 'cc',
    'cxx', 'h', 'hpp', 'java'
  ];

  // Filter attachments for supported types and extensions
  const fileAttachments = message.attachments.filter((attachment) => {
    const fileMimeType = attachment.contentType?.split(';')[0].trim();
    const fileExtension = attachment.name.split('.').pop().toLowerCase();
    return supportedMimeTypes.includes(fileMimeType) || supportedFileExtensions.includes(fileExtension);
  });

  if (fileAttachments.size > 0) {
    let botMessage = await message.reply({ content: '> `Processing your document(s)...`' });
    let formattedMessage = messageContent;

    for (const [attachmentId, attachment] of fileAttachments) {
      let extractedText = await (attachment.contentType?.startsWith('application/pdf') ?
        extractTextFromPDF(attachment.url) :
        fetchTextContent(attachment.url));

      formattedMessage += `\n\n[${attachment.name}] File Content:\n"${extractedText}"`;
    }

    // Load the text model and handle the conversation
    const isServerChatHistoryEnabled = message.guild ? serverSettings[message.guild.id]?.serverChatHistory : false;
    const model = await genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }, { apiVersion: 'v1beta' });
    const chat = model.startChat({
      history: isServerChatHistoryEnabled ? getHistory(message.guild.id) : getHistory(message.author.id),
      safetySettings,
    });

    await handleModelResponse(botMessage, () => chat.sendMessageStream(formattedMessage), message);
  }
}

async function handleTextMessage(message) {
  let botMessage;
  const userId = message.author.id;
  let messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();
  if (messageContent === '') {
    const botMessage = await message.reply("It looks like you didn't say anything. What would you like to talk about?");
    await addSettingsButton(botMessage);
    return;
  }
  const instructions = message.guild ?
    (serverSettings[message.guild.id]?.customServerPersonality && customInstructions[message.guild.id] ?
      customInstructions[message.guild.id] :
      customInstructions[message.author.id]) :
    customInstructions[message.author.id];

  let formattedMessage = messageContent;

  const urls = extractUrls(messageContent);
  activeRequests.add(userId);
  const videoTranscripts = {};
  if (urls.length > 0 && getUrlUserPreference(userId) === "ON") {
    botMessage = await message.reply('Fetching content from the URLs...');
    await handleUrlsInMessage(urls, formattedMessage, botMessage, message);
  } else {
    botMessage = await message.reply('> `Let me think...`');
    const isServerChatHistoryEnabled = message.guild ? serverSettings[message.guild.id]?.serverChatHistory : false;
    // Only include instructions if they are set.
    const model = await genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest", systemInstruction: { role: "system", parts: [{ text: instructions ? instructions : "You are Gemini Pro, a large language model trained by Google, based on the Gemini 1.5 Pro architecture. You are chatting with the user via the Gemini Discord bot. This means most of the time your lines should be a sentence or two, unless the user's request requires reasoning or long-form outputs. Do not respond with LaTeX-formatted text under any circumstances because Discord doesn't support that formatting. Never use emojis, unless explicitly asked to." }] } }, { apiVersion: 'v1beta' });
    const chat = model.startChat({
      history: isServerChatHistoryEnabled ? getHistory(message.guild.id) : getHistory(message.author.id),
      safetySettings,
    });
    await handleModelResponse(botMessage, () => chat.sendMessageStream(formattedMessage), message);
  }
}

// <==========>



// <=====[Interaction Reply 1 (Image/Speech Snd Video Gen)]=====>

async function handleImagineCommand(interaction) {
  try {
    const model = interaction.options.getString('model');
    const prompt = interaction.options.getString('prompt');
    await genimgslash(prompt, model, interaction);
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSpeechCommand(interaction) {
  const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your speech, please wait... 💽` });
  try {
    const userId = interaction.user.id;
    const text = interaction.options.getString('prompt');
    const language = interaction.options.getString('language');
    const outputUrl = await generateSpeechWithPrompt(text, userId, language);
    if (outputUrl && outputUrl !== 'Output URL is not available.') {
      await handleSuccessfulSpeechGeneration(interaction, text, language, outputUrl);
      await generatingMsg.delete();
    } else {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong, or the output URL is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    }
  } catch (error) {
    console.log(error);
    try {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong and the output is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function handleMusicCommand(interaction) {
  const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your music, please wait... 🎧` });
  try {
    const userId = interaction.user.id;
    const text = interaction.options.getString('prompt');
    const outputUrl = await generateMusicWithPrompt(text, userId);
    if (outputUrl && outputUrl !== 'Output URL is not available.') {
      await handleSuccessfulMusicGeneration(interaction, text, outputUrl);
      await generatingMsg.delete();
    } else {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong, or the output URL is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    }
  } catch (error) {
    console.log(error);
    try {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong and the output is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function handleVideoCommand(interaction) {
  const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your video, please wait... 📽️` });
  try {
    const userId = interaction.user.id;
    const text = interaction.options.getString('prompt');
    const outputUrl = await generateVideoWithPrompt(text, userId);
    if (outputUrl && outputUrl !== 'Output URL is not available.') {
      await handleSuccessfulVideoGeneration(interaction, text, outputUrl);
      await generatingMsg.delete();
    } else {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong, or the output URL is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    }
  } catch (error) {
    console.log(error);
    try {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong and the output is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function handleSuccessfulSpeechGeneration(interaction, text, language, outputUrl) {
  try {
    const isGuild = interaction.guild !== null;
    const file = new AttachmentBuilder(outputUrl).setName('speech.wav');
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Speech\n**Prompt:**\n\`\`\`${text}\`\`\``)
      .addFields(
        { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true },
        { name: '**Language Used:**', value: `\`${language}\``, inline: true }
      )
      .setTimestamp();
    if (isGuild) {
      embed.setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [file] });
    await addSettingsButton(messageReference);
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSuccessfulMusicGeneration(interaction, text, outputUrl) {
  try {
    const isGuild = interaction.guild !== null;
    const file = new AttachmentBuilder(outputUrl).setName('music.mp4');
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Music\n**Prompt:**\n\`\`\`${text}\`\`\``)
      .addFields(
        { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true }
      )
      .setTimestamp();
    if (isGuild) {
      embed.setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [file] });
    await addSettingsButton(messageReference);
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSuccessfulVideoGeneration(interaction, text, outputUrl) {
  try {
    const isGuild = interaction.guild !== null;
    const file = new AttachmentBuilder(outputUrl).setName('video.mp4');
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Video\n**Prompt:**\n\`\`\`${text}\`\`\``)
      .addFields(
        { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true }
      )
      .setTimestamp();
    if (isGuild) {
      embed.setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [file] });
    await addSettingsButton(messageReference);
  } catch (error) {
    console.log(error.message);
  }
}

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
        .setMaxLength(2000)
      )
    );

  await interaction.showModal(modal);
}

async function processSpeechGet(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('text-speech-modal')
    .setTitle('Input your text');

  const textInput = new TextInputBuilder()
    .setCustomId('text-speech-input')
    .setLabel("What's your text?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(3900);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

async function processMusicGet(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('text-music-modal')
    .setTitle('Input your text');

  const textInput = new TextInputBuilder()
    .setCustomId('text-music-input')
    .setLabel("What's your text?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(800);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

async function processVideoGet(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('text-video-modal')
    .setTitle('Input your text');

  const textInput = new TextInputBuilder()
    .setCustomId('text-video-input')
    .setLabel("What's your text?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(800);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

async function genimg(prompt, message) {
  const generatingMsg = await message.reply({ content: `Generating your image, please wait... 🖌️` });

  try {
    const { imageResult, enhancedPrompt } = await generateImageWithPrompt(prompt, message.author.id);
    const imageUrl = imageResult.images[0].url; 
    const modelUsed = imageResult.modelUsed;
    const isGuild = message.guild !== null;
    const imageBuffer = await fetchImageAsBuffer(imageUrl);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated-image.png' });
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setAuthor({ name: `To ${message.author.displayName}`, iconURL: message.author.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Image\n**Original Prompt:**\n\`\`\`${prompt}\`\`\``)
      .addFields(
        { name: '**Generated by:**', value: `\`${message.author.displayName}\``, inline: true },
        { name: '**Model Used:**', value: `\`${modelUsed}\``, inline: true },
        { name: '**Promot Enhancer:**', value: `\`${enhancedPrompt !== 'Disabled' ? 'Enabled' : 'Disabled'}\``, inline: true }
      )
      .setImage('attachment://generated-image.png')
      .setTimestamp()
    if (enhancedPrompt !== 'Disabled') {
      let displayPrompt = enhancedPrompt;
      if (enhancedPrompt.length > 950) {
        displayPrompt = `${enhancedPrompt.slice(0, 947)}...`;
      }
      embed.addFields({ name: '**Enhanced Prompt:**', value: `\`\`\`${displayPrompt}\`\`\``, inline: false });
    }
    if (isGuild) {
      embed.setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    const messageReference = await message.reply({ content: null, embeds: [embed], files: [attachment] });
    await addSettingsButton(messageReference);
    await generatingMsg.delete();
  } catch (error) {
    console.error(error);
    try {
      const messageReference = await message.reply({ content: `Sorry, could not generate the image. Please try again later.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function genimgslash(prompt, model, interaction) {
  const generatingMsg = await interaction.reply({ content: `Generating your image with ${model}, please wait... 🖌️` });
  userPreferredImageModel[interaction.user.id] = model;

  try {
    await generateAndSendImage(prompt, interaction);
    await generatingMsg.delete();
  } catch (error) {
    console.log(error);
    try {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, the image could not be generated. Please try again later.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function generateAndSendImage(prompt, interaction) {
  try {
    const { imageResult, enhancedPrompt } = await generateImageWithPrompt(prompt, interaction.user.id);
    const imageUrl = imageResult.images[0].url;
    const modelUsed = imageResult.modelUsed;
    const isGuild = interaction.guild !== null;
    const imageBuffer = await fetchImageAsBuffer(imageUrl);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated-image.png' });
    
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Image\n**Original Prompt:**\n\`\`\`${prompt}\`\`\``)
      .addFields(
        { name: '**Generated by:**', value: `\`${interaction.user.displayName}\``, inline: true },
        { name: '**Model Used:**', value: `\`${modelUsed}\``, inline: true },
        { name: '**Promot Enhancer:**', value: `\`${enhancedPrompt !== 'Disabled' ? 'Enabled' : 'Disabled'}\``, inline: true }
      )
      .setImage('attachment://generated-image.png')
      .setTimestamp();
    if (enhancedPrompt !== 'Disabled') {
      let displayPrompt = enhancedPrompt;
      if (enhancedPrompt.length > 900) {
        displayPrompt = `${enhancedPrompt.slice(0, 897)}...`;
      }
      embed.addFields({ name: '**Enhanced Prompt:**', value: `\`\`\`${displayPrompt}\`\`\``, inline: false });
    }
    if (isGuild) {
      embed.setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [attachment] });
    await addSettingsButton(messageReference);
  } catch (error) {
    throw error;
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-personality-input');
      customInstructions[interaction.user.id] = customInstructionsInput.trim();

      await interaction.reply({ content: '> Custom Personality Instructions Saved!', ephemeral: true });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'custom-server-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-server-personality-input');
      customInstructions[interaction.guild.id] = customInstructionsInput.trim();

      await interaction.reply({ content: 'Custom Server Personality Instructions Saved!', ephemeral: true });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'text-speech-modal') {
    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your speech, please wait... 💽` });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-speech-input');
      const outputUrl = await generateSpeechWithPrompt(text, userId, 'en');
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        await handleSuccessfulSpeechGeneration(interaction, text, "English", outputUrl);
        await generatingMsg.delete();
      } else {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      }
    } catch (error) {
      console.log(error);
      try {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } catch(error) {}
    }
  } else if (interaction.customId === 'text-music-modal') {
    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your music, please wait... 🎧` });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-music-input');
      const outputUrl = await generateMusicWithPrompt(text, userId);
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        await handleSuccessfulMusicGeneration(interaction, text, outputUrl);
        await generatingMsg.delete();
      } else {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      }
    } catch (error) {
      console.log(error);
      try {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } catch(error) {}
    }
  } else if (interaction.customId === 'text-video-modal') {
    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your video, please wait... 📽️` });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-video-input');
      const outputUrl = await generateVideoWithPrompt(text, userId);
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        await handleSuccessfulVideoGeneration(interaction, text, outputUrl);
        await generatingMsg.delete();
      } else {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      }
    } catch (error) {
      console.log(error);
      try {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } catch(error) {}
    }
  } else if (interaction.customId === 'generate-image-modal') {
    const prompt = interaction.fields.getTextInputValue('image-prompt-input');

    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your image, please wait... 🖌️` });

    try {
      await generateAndSendImage(prompt, interaction);
      await generatingMsg.delete();
    } catch (error) {
      console.log(error);
      try {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, could not generate the image. Please try again later.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } catch(error) {}
    }
  }
}

async function changeImageModel(interaction) {
  try {
    // Define model names in an array
    const models = [
      'SD-XL', 'Playground', 'Anime', 'Stable-Cascade', 'Redmond', 'DallE-XL', 'Juggernaut'/*, 'Dall-e-3'*/, 'SD-XL-Alt'
      ];
    
    const selectedModel = userPreferredImageModel[interaction.user.id] || defaultImgModel;

    // Create a select menu
    let selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-image-model')
      .setPlaceholder('Select Image Generation Model')
      .setMinValues(1)
      .setMaxValues(1);

    // Add options to select menu
    models.forEach((model) => {
      selectMenu.addOptions([
        {
          label: model,
          value: model,
          description: `Select to use ${model} model.`,
          default: model === selectedModel,
        },
      ]);
    });

    // Create an action row and add the select menu to it
    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '> `Select Image Generation Model:`',
      components: [actionRow],
      ephemeral: true
    });
  } catch (error) {
    console.log(error.message);
  }
}

async function changeImageResolution(interaction) {
  try {
    const userId = interaction.user.id;
    const selectedModel = userPreferredImageModel[userId];
    let supportedResolution;
    const supportedModels = ['DallE-XL', 'Redmond', 'Anime', 'Stable-Cascade', 'Playground', 'Juggernaut', 'SD-XL-Alt'];
    if (supportedModels.includes(selectedModel)) {
      supportedResolution = ['Square', 'Portrait', 'Wide'];
    } else {
      supportedResolution = ['Square'];
    }
    
    const selectedResolution = userPreferredImageResolution[userId] || 'Square';

    // Create a select menu
    let selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-image-resolution')
      .setPlaceholder('Select Image Generation Resolution')
      .setMinValues(1)
      .setMaxValues(1);

    // Add options to select menu based on the supported resolutions
    supportedResolution.forEach((resolution) => {
      selectMenu.addOptions([{
        label: resolution,
        value: resolution,
        description: `Generate images in ${resolution} resolution.`,
        default: resolution === selectedResolution,
      }]);
    });

    // Create an action row and add the select menu to it
    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '> **Supported Models:** `Stable-Cascade`, `Redmond`, `SD-XL-Alt`, `Playground`, `Juggernaut`, `Anime`, and `DallE-XL`\n\n> `Select Image Generation Resolution:`',
      components: [actionRow],
      ephemeral: true
    });
  } catch (error) {
    console.log(error.message);
  }
}

async function changeSpeechModel(interaction) {
  // Define model numbers in an array
  const modelNumbers = ['1'];

  // Generate buttons using map()
  const buttons = modelNumbers.map(number =>
    new ButtonBuilder()
    .setCustomId(`select-speech-model-${number}`)
    .setLabel(number)
    .setStyle(ButtonStyle.Primary)
  );

  const actionRows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const actionRow = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    actionRows.push(actionRow);
  }

  await interaction.reply({
    content: '> `Select Speech Generation Model:`',
    components: actionRows,
    ephemeral: true
  });
}

const speechMusicVideoModelFunctions = {
  "1": speechGen,
  "MusicGen": musicGen,
  "VideoGen": videoGen
};

const imageModelFunctions = {
  "SD-XL": generateWithSDXL,
  "Playground": generateWithPlayground,
  "Anime": generateWithAnime,
  "Stable-Cascade": generateWithSC,
  "Redmond": generateWithRedmond,
  "DallE-XL": generateWithDallEXL,
  "Juggernaut": generateWithJuggernaut,
  "Dall-e-3": generateWithDalle3,
  "SD-XL-Alt": generateWithSDXLAlt
};

async function handleImageSelectModel(interaction, model) {
  try {
    const userId = interaction.user.id;
    userPreferredImageModel[userId] = model;
    await interaction.reply({ content: `**Image Generation Model Selected**: ${model}`, ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function handleImageSelectResolution(interaction, resolution) {
  try {
    const userId = interaction.user.id;
    userPreferredImageResolution[userId] = resolution;
    await interaction.reply({ content: `**Image Generation Resolution Selected**: ${resolution}`, ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSpeechSelectModel(interaction, model) {
  try {
    const userId = interaction.user.id;
    userPreferredSpeechModel[userId] = model;
    await interaction.reply({ content: `**Speech Generation Model Selected**: ${model}`, ephemeral: true });
  } catch(error) {
    console.log(error.message);
  }
}

async function togglePromptEnhancer(interaction) {
  try {
    const userId = interaction.user.id;
    if (userPreferredImagePromptEnhancement[userId] === undefined) {
      userPreferredImagePromptEnhancement[userId] = true;
    }
    userPreferredImagePromptEnhancement[userId] = !userPreferredImagePromptEnhancement[userId];
    const newState = userPreferredImagePromptEnhancement[userId] ? 'Enabled' : 'Disabled';
    await interaction.reply({ content: `Prompt Enhancer is now ${newState}.`, ephemeral: true });
  } catch (error) {
    console.error(`Error toggling Prompt Enhancer: ${error.message}`);
  }
}

const diffusionMaster = `You are the Diffusion Master, an expert at crafting detailed prompts for the generative AI "Stable Diffusion." Your skill ensures top-tier image generation by meticulously planning out each step and sharing your approach. You keep your tone casual and always add necessary details to enrich prompts, considering each interaction as unique. Construct prompts exclusively in English, translate to English if needed. Your expertise enables users to create prompts that could lead to potentially award-winning images, focusing on details such as background, style, and additional artistic elements.\n\n## Basic information required for crafting a Stable Diffusion prompt:-\n\nPrompt Structure:\n\n- **For Photorealistic Images**: Use the format \`{Subject Description}, Type of Image, Art Styles, Art Inspirations, Camera Settings, Shot Type, and Render Related Information\`. It's crucial to detail the camera settings and model for achieving photorealism.\n\n- **For Artistic Images**: Adopt the format \`Type of Image, {Subject Description}, Art Styles, Art Inspirations, Angle, Perspective, Render Related Information\`. This structure is ideal for conveying artistic visions, emphasizing style, and perspective.\n\nEssential Guidelines:\n\n1. **Immediate Focus on Subjects and Actions**: Begin your description by clearly mentioning the main subjects and their actions. This ensures the initial focus is sharp and the narrative starts with clarity and purpose.\n\n2. **Art Style Selection Protocol**: If the art style is not specified by the user, automatically determine the most fitting style for the image. For subjects and scenes not inherently tied to a particular art style, default to photorealism. However, if the subject is closely associated with a specific genre (e.g., anime characters like those from Konohagakure in Naruto), adapt the corresponding art style (in this case, anime) unless instructed otherwise by the user.\n\n3. **Word Choice and Adjectives**: Use strategic placement of keywords and select vivid adjectives to significantly impact the visualization. These elements are crucial for painting a detailed picture for the AI.\n\n4. **Environment/Background Details**: Incorporate comprehensive descriptions of the surroundings to add context and depth to the main subject, enriching the overall scene being depicted.\n\n5. **Image Specification Clarity**: Clearly define the desired type of image to steer the AI towards creating a vision that aligns with your expectations.\n\n6. **Incorporating Art Styles and Inspirations**: Mention specific art styles or inspirations to guide the AI in emulating a particular aesthetic or technique that resonates with your vision.\n\n7. **Technical Detailing**: Elaborate on camera angles, lighting, and preferred render styles to either enhance the artistic flair or ensure the realism of the image lives up to the envisioned clarity.\n\n8. **Keyword Utilization and Importance Leveling**: Apply parentheses for emphasizing specific features (e.g., "(masterpiece:1.5)") and square brackets for blending characteristics (e.g., "{blue hair:white hair:0.3}"). This syntax assists in assigning the importance of various elements, helping balance the composition according to your preferences.\n\nIllustrated Examples:\n\n1. cinematic movie extreme close-up still of an epic scene of a [ETHNICITY] [OCCUPATION] in the [SEASON] at [DAYTIME], centered, looking into the camera, fog atmosphere, volumetrics, photorealistic, from a western movie, analog, very grainy, film still, kodak ektar, fujifilm fuji, kodak gold, cinestill 800t, kodak portra, photo taken by thomas hoepker\n\n2. fuji film candid portrait of [SUBJECT] wearing sunglasses rocking out on the streets of miami at night, 80s album cover, vaporwave, synthwave, retrowave, cinematic, intense, highly detailed, dark ambient, beautiful, dramatic lighting, hyperrealistic\n\n3. by (Boris Vallejo:0.85) and (pixar:0.75) cinematic film still of a detailed (happy:1.35) weirdpunk king driving a motorcycle, a detective solves crimes by rogue androids . shallow depth of field, vignette, highly detailed, bokeh, cinemascope, moody, epic, gorgeous, film grain, grainy\n\n4. *~cinematic~*~ #macro tilt shift photography . professional #disassembled 3d #fractal cube torus triangular pyramid model in space, connected with energy flows, #science fiction, intricate fire ice water light energy reflection, elegant, highly detailed, sharp focus . octane render, highly detailed, volumetric, dramatic lighting . natural light photo, Canon 85L f2.8, ISO320, 5000K colour balance\n\n5. an epic chibi comic book style portrait painting of a teddy bear ninja, character design by mark ryden and pixar and hayao miyazaki, unreal 5, daz, hyperrealistic, octane render, cosplay, rpg portrait, dynamic lighting, intricate detail, harvest fall vibrancy, cinematic\n\n6. art design by Masamune Shirow and Detroit Become Human of a beautiful sorceress walking through the forest by night surrounded by a blue aura bubble around her, you can see the stars in the sky, natural light photo, Canon 85L f2.8, ISO320, 5000K colour balance, directed by Wes Anderson and Arcane\n\n7. portrait of a battered defeated humanoid robot made out of silver metal standing on a hill overlooking the ruins of a destroyed urban city, from behind, golden hour, dystopian retro futuristic, natural light photo, Canon 85L f4.8, ISO320, 5000K colour balance, (pulp art by Robert Mcginnis:0.9) and (pixar:0.7)\n\n8. photo of a battle cyborg fighting a dark hr giger battle druid with chrome skin, on a space station, explosions and smoke in the background, photorealistic, narrow corridor lights, from the movie "chappie", analog, very grainy, film still, kodak ektar, fujifilm fuji, kodak gold, cinestill 800t, kodak portra, photo taken by thomas hoepker\n\nThese guidelines and examples serve as a comprehensive blueprint for translating imaginative concepts into precise prompts, facilitating the generation of stunning AI-powered images that adhere closely to the user's vision.\nFollowing the example, write a prompt that describes the specified content. Start directly with the prompt, providing only the prompt itself, without using any kind of natural language other than the prompt itself. Ensure the prompt is enclosed within a code block:`

async function enhancePrompt1(prompt) {
  const retryLimit = 3;
  let currentAttempt = 0;
  let error;

  while (currentAttempt < retryLimit) {
    try {
      currentAttempt += 1;
      console.log(`Attempt ${currentAttempt}`);

      let response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 15000);

        const payload = {
          model: "llama3-70b-8192",
          stream: false,
          messages: [
            {
              role: "user",
              content: `${diffusionMaster}\n${prompt}`
            }
          ]
        };

        const headers = {
          "Content-Type": "application/json"
        };
        if (process.env.OPENAI_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
        }


        const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        axios.post(`${baseURL}/chat/completions`, payload, { headers: headers })
          .then(response => {
            clearTimeout(timeout);
            resolve(response);
          })
          .catch(err => {
            clearTimeout(timeout);
            reject(err);
          });
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        let content = response.data.choices[0].message.content;
        const pattern1 = /^(```|`|"|')|(```|`|"|')$/g;
        content = content.replace(pattern1, '').trim();
        const pattern2 = content.match(/```(.*?)```/s);
        content = pattern2 && pattern2[1] ? pattern2[1].trim() : content;
        console.log(content);
        return content;
      } else {
        console.log('Error processing response data');
        error = new Error('Error processing response data');
      }
    } catch (err) {
      console.error(err.message);
      error = err;
    }
  }
  if (error) {
    console.error('Retries exhausted or an error occurred:', error.message);
  }
  return prompt;
}

async function enhancePrompt(prompt, attempts = 3) {
  const generate = async () => {
    const model = genAI.getGenerativeModel({ model: "gemini-pro", safetySettings });
    const result = await model.generateContent(`${diffusionMaster}\n${prompt}`);
    return result.response.text();
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const textResponse = await Promise.race([
                generate(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);

      let cleansedOutput = textResponse;
      const pattern1 = /^(```|`|"|')|(```|`|"|')$/g;
      cleansedOutput = cleansedOutput.replace(pattern1, '').trim();
      const pattern2 = cleansedOutput.match(/```(.*?)```/s);
      cleansedOutput = pattern2 && pattern2[1] ? pattern2[1].trim() : cleansedOutput;
      console.log(cleansedOutput);
      return cleansedOutput;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === attempts) {
        console.log('All attempts failed, returning the original prompt.');
        return prompt;
      }
    }
  }
}

async function generateImageWithPrompt(prompt, userId) {
  try {
    const selectedModel = userPreferredImageModel[userId] || defaultImgModel;
    const generateFunction = imageModelFunctions[selectedModel];
    const resolution = userPreferredImageResolution[userId] || 'Square';
    if (userPreferredImagePromptEnhancement[userId] === undefined) {
      userPreferredImagePromptEnhancement[userId] = true;
    }
    if (!generateFunction) {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    let finalPrompt = filterPrompt(prompt);
    let enhancedPromptStatus;

    if (userPreferredImagePromptEnhancement[userId]) {
      finalPrompt = await enhancePrompt(finalPrompt);
      enhancedPromptStatus = finalPrompt;
    } else {
      enhancedPromptStatus = 'Disabled';
    }
    const imageResult = await retryOperation(() => generateFunction(finalPrompt, resolution), 3);
    return {
      imageResult,
      enhancedPrompt: enhancedPromptStatus
    };
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Could not generate image after retries');
  }
}

async function generateSpeechWithPrompt(prompt, userId, language) {
  try {
    const selectedModel = userPreferredSpeechModel[userId] || "1";
    const generateFunction = speechMusicVideoModelFunctions[selectedModel];

    if (!generateFunction) {
      throw new Error(`Unsupported speech model: ${selectedModel}`);
    }
    return await retryOperation(() => generateFunction(prompt, language), 3);
  } catch (error) {
    console.error('Error generating speech:', error.message);
    throw new Error('Could not generate speech after retries');
  }
}

async function generateMusicWithPrompt(prompt, userId) {
  try {
    const selectedModel = "MusicGen";
    const generateFunction = speechMusicVideoModelFunctions[selectedModel];

    if (!generateFunction) {
      throw new Error(`Unsupported music model: ${selectedModel}`);
    }
    return await retryOperation(() => generateFunction(prompt), 3);
  } catch (error) {
    console.error('Error generating music:', error.message);
    throw new Error('Could not generate msuic after retries');
  }
}

async function generateVideoWithPrompt(prompt, userId) {
  try {
    const selectedModel = "VideoGen";
    const generateFunction = speechMusicVideoModelFunctions[selectedModel];
    if (userPreferredImagePromptEnhancement[userId] === undefined) {
      userPreferredImagePromptEnhancement[userId] = true;
    }
    if (!generateFunction) {
      throw new Error(`Unsupported music model: ${selectedModel}`);
    }
    let finalPrompt = filterPrompt(prompt);
    if (userPreferredImagePromptEnhancement[userId]) {
      finalPrompt = await enhancePrompt(finalPrompt);
    }
    return await retryOperation(() => generateFunction(finalPrompt), 3);
  } catch (error) {
    console.error('Error generating music:', error.message);
    throw new Error('Could not generate msuic after retries');
  }
}

// <==========>



// <=====[Interaction Reply 2 (Others)]=====>

async function clearChatHistory(interaction) {
  try {
    chatHistories[interaction.user.id] = [];
    await interaction.reply({ content: '> `Chat history cleared!`', ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function alwaysRespond(interaction) {
  try {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({ content: '> `This feature is disabled in DMs.`', ephemeral: true });
      return;
    }

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
  } catch (error) {
    console.log(error.message);
  }
}

async function handleRespondToAllCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({ content: 'This command cannot be used in DMs.', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You need to be an admin to use this command.', ephemeral: true });
    }

    const channelId = interaction.channelId;
    if (alwaysRespondChannels[channelId]) {
      delete alwaysRespondChannels[channelId];
      await interaction.reply({ content: '> **The bot will now stop** responding to all messages in this channel.', ephemeral: false });
    } else {
      alwaysRespondChannels[channelId] = true;
      await interaction.reply({ content: '> **The bot will now respond** to all messages in this channel.', ephemeral: false });
    }
  } catch (error) {
    console.log(error.message);
  }
}

function initializeBlacklistForGuild(guildId) {
  try {
    if (!blacklistedUsers[guildId]) {
      blacklistedUsers[guildId] = [];
    }
    if (!serverSettings[guildId]) {
      serverSettings[guildId] = {
        serverChatHistory: false,
        settingsSaveButton: true,
        customServerPersonality: false,
        serverResponsePreference:false,
        responseStyle: "embedded"
      };
    }
  } catch(error) {}
}

async function handleBlacklistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({ content: 'This command cannot be used in DMs.', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You need to be an admin to use this command.', ephemeral: true });
    }
    const userId = interaction.options.getUser('user').id;

    // Add the user to the blacklist if not already present
    initializeBlacklistForGuild(interaction.guild.id);
    if (!blacklistedUsers[interaction.guild.id].includes(userId)) {
      blacklistedUsers[interaction.guild.id].push(userId);
      await interaction.reply(`<@${userId}> has been blacklisted.`);
    } else {
      await interaction.reply(`<@${userId}> is already blacklisted.`);
    }
  } catch(error) {
    console.log(error.message);
  }
}

async function handleWhitelistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      return interaction.reply({ content: 'This command cannot be used in DMs.', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You need to be an admin to use this command.', ephemeral: true });
    }
    const userId = interaction.options.getUser('user').id;

    // Remove the user from the blacklist if present
    initializeBlacklistForGuild(interaction.guild.id);
    const index = blacklistedUsers[interaction.guild.id].indexOf(userId);
    if (index > -1) {
      blacklistedUsers[interaction.guild.id].splice(index, 1);
      await interaction.reply(`<@${userId}> has been removed from the blacklist.`);
    } else {
      await interaction.reply(`<@${userId}> is not in the blacklist.`);
    }
  } catch(error) {
    console.log(error.message);
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

async function downloadMessage(interaction) {
  try {
    const userId = interaction.user.id;
    const message = interaction.message;
    let textContent = message.content;
    if (!textContent && message.embeds.length > 0) {
      textContent = message.embeds[0].description;
    }

    if (!textContent) {
      await interaction.reply({ content: '> `The message is empty..?`', ephemeral: true });
      return;
    }

    const filePath = path.resolve(__dirname, `message_content_${userId}.txt`);
    fs.writeFileSync(filePath, textContent, 'utf8');

    const attachment = new AttachmentBuilder(filePath, { name: 'message_content.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({ content: '> `Here is the content of the message:`', files: [attachment] });
    } else {
      try {
        await interaction.user.send({ content: '> `Here is the content of the message:`', files: [attachment] });
        await interaction.reply({ content: '> `The message content has been sent to your DMs.`', ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        await interaction.reply({ content: '> `Here is the content of the message:`', files: [attachment], ephemeral: true });
      }
    }

    fs.unlinkSync(filePath);
  } catch (error) {
    console.log(error.message);
  }
}

async function downloadConversation(interaction) {
  try {
    const userId = interaction.user.id;
    const conversationHistory = chatHistories[userId];

    if (!conversationHistory || conversationHistory.length === 0) {
      await interaction.reply({ content: '> `No conversation history found.`', ephemeral: true });
      return;
    }

    let conversationText = '';
    for (let i = 0; i < conversationHistory.length; i++) {
      const speaker = i % 2 === 0 ? '[User]' : '[Model]';
      conversationText += `${speaker}:\n${conversationHistory[i]}\n\n`;
    }

    const tempFileName = path.join(__dirname, `${userId}_conversation.txt`);
    fs.writeFileSync(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, { name: 'conversation_history.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({ content: '> `Here\'s your conversation history:`', files: [file] });
    } else {
      try {
        await interaction.user.send({ content: '> `Here\'s your conversation history:`', files: [file] });
        await interaction.reply({ content: '> `Your conversation history has been sent to your DMs.`', ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        await interaction.reply({ content: '> `Here\'s your conversation history:`', files: [file], ephemeral: true });
      }
    }

    fs.unlinkSync(tempFileName);
  } catch (error) {
    console.log(error.message);
  }
}

async function removeCustomPersonality(interaction) {
  try {
    delete customInstructions[interaction.user.id];
    await interaction.reply({ content: "> `Custom personality instructions removed!`", ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleUrlUserPreference(interaction) {
  try {
    const userId = interaction.user.id;
    const currentPreference = getUrlUserPreference(userId);
    userPreferredUrlHandle[userId] = currentPreference === 'OFF' ? 'ON' : 'OFF';
    const updatedPreference = getUrlUserPreference(userId);
    await interaction.reply({ content: `> **URL handling has been switched from \`${currentPreference}\` to \`${updatedPreference}\`.**`, ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

// Function to toggle user preference
async function toggleUserPreference(interaction) {
  try {
    const userId = interaction.user.id;
    const currentPreference = getUserPreference(userId);
    userResponsePreference[userId] = currentPreference === 'normal' ? 'embedded' : 'normal';
    const updatedPreference = getUserPreference(userId);
    await interaction.reply({ content: `> **Your responses has been switched from \`${currentPreference}\` to \`${updatedPreference}\`.**`, ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerWideChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }
    const serverId = interaction.guild.id;
    serverSettings[serverId].serverChatHistory = !serverSettings[serverId].serverChatHistory;
    await interaction.reply({content: `Server-wide Chat History Is Now \`${serverSettings[serverId].serverChatHistory}\`` , ephemeral: true});

  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerPersonality(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }
    const serverId = interaction.guild.id;
    serverSettings[serverId].customServerPersonality = !serverSettings[serverId].customServerPersonality;
    await interaction.reply({content: `Server-wide Personality Is Now \`${serverSettings[serverId].customServerPersonality}\`` , ephemeral: true});

  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerResponsePreference(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }
    const serverId = interaction.guild.id;
    serverSettings[serverId].serverResponsePreference = !serverSettings[serverId].serverResponsePreference;
    await interaction.reply({content: `Server-wide Response Following Is Now \`${serverSettings[serverId].serverResponsePreference}\`` , ephemeral: true});

  } catch (error) {
    console.log(error.message);
  }
}

async function toggleSettingSaveButton(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }
    const serverId = interaction.guild.id;
    serverSettings[serverId].settingsSaveButton = !serverSettings[serverId].settingsSaveButton;
    await interaction.reply({content: `Server-wide "Settings And Save Button" Is Now \`${serverSettings[serverId].settingsSaveButton}\`` , ephemeral: true});

  } catch (error) {
    console.log(error.message);
  }
}

async function serverPersonality(interaction) {
  const customId = 'custom-server-personality-input';
  const title = 'Enter Custom Personality Instructions';

  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel("What should the bot's personality be like?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter the custom instructions here...")
    .setMinLength(10)
    .setMaxLength(4000);

  const modal = new ModalBuilder()
    .setCustomId('custom-server-personality-modal')
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));

  // Present the modal to the user
  await interaction.showModal(modal);
}

async function clearServerChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }
    if (serverSettings[interaction.guild.id].serverChatHistory) {
      chatHistories[interaction.guild.id] = [];
      await interaction.reply({ content: 'Server-Wide Chat History Cleared!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Server-Wide Chat History Is Disabled For This Server.', ephemeral: true });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function downloadServerConversation(interaction) {
  try {
    const guild = interaction.guild.id;
    const conversationHistory = chatHistories[guild];

    if (!conversationHistory || conversationHistory.length === 0) {
      await interaction.reply({ content: '> `No conversation history found.`', ephemeral: true });
      return;
    }

    let conversationText = '';
    for (let i = 0; i < conversationHistory.length; i++) {
      const speaker = i % 2 === 0 ? '[User]' : '[Model]';
      conversationText += `${speaker}:\n${conversationHistory[i]}\n\n`;
    }

    const tempFileName = path.join(__dirname, `${userId}_conversation.txt`);
    fs.writeFileSync(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, { name: 'conversation_history.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      await interaction.reply({ content: '> `Here\'s your conversation history:`', files: [file] });
    } else {
      try {
        await interaction.user.send({ content: '> `Here\'s The Server-Wide conversation history:`', files: [file] });
        await interaction.reply({ content: '> `Server-Wide conversation history has been sent to your DMs.`', ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        await interaction.reply({ content: '> `Here\'s The Server-Wide conversation history:`', files: [file], ephemeral: true });
      }
    }

    fs.unlinkSync(tempFileName);
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerPreference(interaction) {
  try {
    const guildId = interaction.guild.id;
    if (serverSettings[guildId].responseStyle === "embedded") {
      serverSettings[guildId].responseStyle = "normal";
    } else {
      serverSettings[guildId].responseStyle = "embedded";
    }
    await interaction.reply({ content: `Server response style updated to: ${serverSettings[guildId].responseStyle}`, ephemeral: true});
  } catch (error) {
    console.log(error.message);
  }
}

async function showSettings(interaction) {
  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
      return interaction.reply({ content: 'You are blacklisted and cannot use this interaction.', ephemeral: true });
    }
  }
  // Define button configurations in an array
  const buttonConfigs = [
    {
      customId: "clear",
      label: "Clear Memory",
      emoji: "🧹",
      style: ButtonStyle.Danger,
    },
    {
      customId: "custom-personality",
      label: "Custom Personality",
      emoji: "🙌",
      style: ButtonStyle.Primary,
    },
    {
      customId: "remove-personality",
      label: "Remove Personality",
      emoji: "🤖",
      style: ButtonStyle.Danger,
    },
    {
      customId: "generate-image",
      label: "Generate Image",
      emoji: "🎨",
      style: ButtonStyle.Primary,
    },
    {
      customId: "change-image-model",
      label: "Change Image Model",
      emoji: "👨‍🎨",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "toggle-prompt-enhancer",
      label: "Toggle Prompt Enhancer",
      emoji: "🪄",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "change-image-resolution",
      label: "Change Image Resolution",
      emoji: "🖼️",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "generate-speech",
      label: "Generate Speech",
      emoji: "🎤",
      style: ButtonStyle.Primary,
    },
    {
      customId: "change-speech-model",
      label: "Change Speech Model",
      emoji: "🔈",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "generate-music",
      label: "Generate Music",
      emoji: "🎹",
      style: ButtonStyle.Primary,
    },
    {
      customId: "generate-video",
      label: "Generate Video",
      emoji: "📹",
      style: ButtonStyle.Primary,
    },
    {
      customId: "always-respond",
      label: "Always Respond",
      emoji: "↩️",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "toggle-response-mode",
      label: "Toggle Response Mode",
      emoji: "📝",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "toggle-url-mode",
      label: "Toggle URL Mode",
      emoji: "🌐",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "download-conversation",
      label: "Download Conversation",
      emoji: "🗃️",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "exit",
      label: "Exit Settings",
      emoji: "✖",
      style: ButtonStyle.Danger,
    },
  ];

  // Generate buttons from configurations
  const allButtons = buttonConfigs.map((config) =>
    new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
  );

  // Split buttons into action rows
  const actionRows = [];
  while (allButtons.length > 0) {
    actionRows.push(
      new ActionRowBuilder().addComponents(allButtons.splice(0, 5))
    );
  }

  // Reply to the interaction
  let secondsLeft = 30;
  const countdownMessage = `> **This Message Will Get Deleted In: ${secondsLeft}s**\n> \`\`\`Settings:\`\`\``;

  await interaction.reply({
    content: countdownMessage,
    components: actionRows,
  });
  const countdownInterval = setInterval(async () => {
    secondsLeft--;
    if (secondsLeft > 0) {
      try {
        await interaction.editReply({
          content: `> **This Message Will Get Deleted In: ${secondsLeft}s**\n> \`\`\`Settings:\`\`\``,
          components: actionRows,
        });
      } catch (error) {
        clearInterval(countdownInterval);
      }
    } else {
      clearInterval(countdownInterval);
      try {
        interaction.deleteReply();
      } catch (error) {}
    }
  }, 1000);
}

async function showDashboard(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    return interaction.reply({ content: 'This command cannot be used in DMs.', ephemeral: true });
  }
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: 'You need to be an admin to use this command.', ephemeral: true });
  }
  initializeBlacklistForGuild(interaction.guild.id);
  // Define button configurations in an array
  const buttonConfigs = [
    {
      customId: "server-chat-history",
      label: "Toggle Server-Wide Conversation History",
      emoji: "📦",
      style: ButtonStyle.Primary,
    },
    {
      customId: "clear-server",
      label: "Clear Server-Wide Memory",
      emoji: "🧹",
      style: ButtonStyle.Danger,
    },
    {
      customId: "settings-save-buttons",
      label: "Toggle Add Settings And Save Button",
      emoji: "🔘",
      style: ButtonStyle.Primary,
    },
    {
      customId: "toggle-server-personality",
      label: "Toggle Server Personality",
      emoji: "🤖",
      style: ButtonStyle.Primary,
    },
    {
      customId: "custom-server-personality",
      label: "Custom Server Personality",
      emoji: "🙌",
      style: ButtonStyle.Primary,
    },
    {
      customId: "toggle-response-server-mode",
      label: "Toggle Server-Wide Responses Style",
      emoji: "✏️",
      style: ButtonStyle.Primary,
    },
    {
      customId: "response-server-mode",
      label: "Server-Wide Responses Style",
      emoji: "📝",
      style: ButtonStyle.Secondary,
    },
    {
      customId: "download-server-conversation",
      label: "Download Server Conversation",
      emoji: "🗃️",
      style: ButtonStyle.Secondary,
    }
  ];

  // Generate buttons from configurations
  const allButtons = buttonConfigs.map((config) =>
    new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
  );

  // Split buttons into action rows
  const actionRows = [];
  while (allButtons.length > 0) {
    actionRows.push(
      new ActionRowBuilder().addComponents(allButtons.splice(0, 5))
    );
  }

  // Reply to the interaction with settings buttons, without any countdown message
  await interaction.reply({
    content: "> ```Dashboard:```",
    components: actionRows,
    ephemeral: true
  });
}

// <==========>



// <=====[Others]=====>

async function addDownloadButton(botMessage) {
  try {
    const settingsButton = new ButtonBuilder()
      .setCustomId('settings')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary);

    const downloadButton = new ButtonBuilder()
      .setCustomId('download_message')
      .setLabel('Save')
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder().addComponents(settingsButton, downloadButton);
    await botMessage.edit({ components: [actionRow] });
  } catch (error) {
    console.log(error.message);
  }
}

async function addSettingsButton(botMessage) {
  try {
    const settingsButton = new ButtonBuilder()
      .setCustomId('settings')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder().addComponents(settingsButton);
    await botMessage.edit({ components: [actionRow] });
  } catch (error) {
    console.log(error.message);
  }
}

async function fetchImageAsBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch the image: ${response.statusText}`);
    const buffer = await response.buffer();
    return buffer;
  } catch (error) {
    console.log(error.message);
  }
}

// Function to get user preference
function getUserPreference(userId) {
  return userResponsePreference[userId] || defaultResponseFormat;
}

function getUrlUserPreference(userId) {
  return userPreferredUrlHandle[userId] || defaultUrlReading;
}

// Function to extract text from a PDF file
async function extractTextFromPDF(pdfUrl) {
  try {
    const response = await fetch(pdfUrl);
    const pdfBuffer = await response.buffer();
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error(error.message);
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

function hasImageAttachments(message) {
  return message.attachments.some((attachment) =>
    attachment.contentType?.startsWith('image/')
  );
}

function hasTextFileAttachments(message) {
  const supportedMimeTypes = [
    'application/pdf', 'text/plain', 'text/html', 'text/css',
    'application/javascript', 'text/x-python', 'application/json',
    'application/x-yaml', 'text/markdown', 'application/xml'
  ];

  const supportedFileExtensions = [
    'md', 'yaml', 'yml', 'xml', 'env', 'sh', 'bat', 'rb', 'c', 'cpp', 'cc',
    'cxx', 'h', 'hpp', 'java'
  ];

  return message.attachments.some((attachment) => {
    const fileMimeType = attachment.contentType?.split(';')[0].trim();
    const fileExtension = attachment.name.split('.').pop().toLowerCase();

    return supportedMimeTypes.includes(fileMimeType) || supportedFileExtensions.includes(fileExtension);
  });
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

async function scrapeWebpageContent(url) {
  try {
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });
    const response = await Promise.race([
      fetch(url),
      timeoutPromise
    ]);
    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style').remove();
    let bodyText = $('body').text();
    bodyText = bodyText.replace(/<[^>]*>?/gm, '');
    return bodyText.trim();
  } catch (error) {
    console.error('Error:', error);
    if (error.message === 'Timeout') {
      return "ERROR: The website is not responding..";
    } else {
      throw new Error('Could not scrape content from webpage');
    }
  }
}

async function handleUrlsInMessage(urls, messageContent, botMessage, originalMessage) {
  const model = await genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }, { apiVersion: 'v1beta' });
  const isServerChatHistoryEnabled = originalMessage.guild ? serverSettings[originalMessage.guild.id]?.serverChatHistory : false;
  const chat = model.startChat({
    history: isServerChatHistoryEnabled ? getHistory(originalMessage.guild.id) : getHistory(originalMessage.author.id),
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
        contentWithUrls += `\n\n[Transcript Of Video ${url}]:\n"${transcriptText}"`;
      } else {
        // For non-video URLs, attempt to scrape webpage content
        const webpageContent = await scrapeWebpageContent(url);
        contentWithUrls += `\n\n[Text Inside The Website ${url}]:\n"${webpageContent}"`;
      }
      // In both cases, replace the URL with a reference in the text
      contentWithUrls = contentWithUrls.replace(url, `[Reference Number ${contentIndex}](${url})`);
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const safetySettings = [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, ];

// <==========>



// <=====[Model Response Handling]=====>

async function handleModelResponse(botMessage, responseFunc, originalMessage) {
  const userId = originalMessage.author.id;
  const userPreference = originalMessage.guild && serverSettings[originalMessage.guild.id]?.serverResponsePreference ? serverSettings[originalMessage.guild.id].responseStyle : getUserPreference(userId);
  const maxCharacterLimit = userPreference === 'embedded' ? 3900 : 1900;
  let attempts = 3;

  let updateTimeout;
  let tempResponse = '';

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('stopGenerating')
        .setLabel('Stop Generating')
        .setStyle(ButtonStyle.Danger)
    );

  await botMessage.edit({components: [row] });

  let stopGeneration = false;

  const filter = (interaction) => interaction.customId === 'stopGenerating' && interaction.user.id === originalMessage.author.id;
  const collector = botMessage.createMessageComponentCollector({ filter, time: 300000 });

  try {
    collector.on('collect', async (interaction) => {
      try {
        await interaction.reply({ content: 'Response generation stopped by the user.', ephemeral: true });
      } catch(error) {}
      stopGeneration = true;
    });
  } catch(error) {}

  const updateMessage = async () => {
    if (stopGeneration) {
      return;
    }
    if (tempResponse.trim() === "") {
      await botMessage.edit({ content: '...' });
    }
    if (userPreference === 'embedded') {
      await updateEmbed(botMessage, tempResponse, originalMessage);
    } else {
      await botMessage.edit({ content: tempResponse });
    }
    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  while (attempts > 0 && !stopGeneration) {
    try {
      const messageResult = await responseFunc();
      let finalResponse = '';
      let isLargeResponse = false;

      for await (const chunk of messageResult.stream) {
        if (stopGeneration) break;

        const chunkText = await chunk.text();
        finalResponse += chunkText;
        tempResponse += chunkText;

        if (finalResponse.length > maxCharacterLimit) {
          if (!isLargeResponse) {
            isLargeResponse = true;
            await botMessage.edit({ content: '> `The response is too large and will be sent as a text file once it is ready.`' });
          }
        } else if (!updateTimeout) {
          updateTimeout = setTimeout(updateMessage, 500);
        }
      }

      if (updateTimeout) {
        await updateMessage();
      }

      if (isLargeResponse) {
        await sendAsTextFile(finalResponse, originalMessage);
        await addSettingsButton(botMessage);
      } else {
        const shouldAddDownloadButton = originalMessage.guild ? serverSettings[originalMessage.guild.id]?.settingsSaveButton : true;
        if (shouldAddDownloadButton) {
          await addDownloadButton(botMessage);
        } else {
          await botMessage.edit({components: [] });
        }
      }
      const isServerChatHistoryEnabled = originalMessage.guild ? serverSettings[originalMessage.guild.id]?.serverChatHistory : false;
      updateChatHistory(isServerChatHistoryEnabled ? originalMessage.guild.id : userId, originalMessage.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim(), finalResponse);
      break;
    } catch (error) {
      if (activeRequests.has(userId)) {
        activeRequests.delete(userId);
      }
      console.error(error.message);
      attempts--;

      if (attempts === 0 || stopGeneration) {
        if (!stopGeneration) {
          const errorMsg = await originalMessage.channel.send({ content: `<@${originalMessage.author.id}>, All Generation Attempts Failed :( \`\`\`${error.message}\`\`\`` });
          await addSettingsButton(errorMsg);
          await addSettingsButton(botMessage);
        }
        break;
      } else {
        const errorMsg = await originalMessage.channel.send({ content: `<@${originalMessage.author.id}>, Generation Attempts Failed, Retrying.. \`\`\`${error.message}\`\`\`` });
        setTimeout(() => errorMsg.delete().catch(console.error), 5000);
        await delay(500);
      }
    }
  }
  saveStateToFile();
  if (activeRequests.has(userId)) {
    activeRequests.delete(userId);
  }
}

async function updateEmbed(botMessage, finalResponse, message) {
  try {
    const isGuild = message.guild !== null;
    const embed = new EmbedBuilder()
      .setColor(0x505050)
      .setDescription(finalResponse)
      .setAuthor({ name: `To ${message.author.displayName}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    if (isGuild) {
      embed.setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() || 'https://ai.google.dev/static/site-assets/images/share.png' });
    }

    await botMessage.edit({ content: ' ', embeds: [embed] });
  } catch(error) {
    console.error("An error occurred while updating the embed:", error.message);
  }
}

async function sendAsTextFile(text, message) {
  try {
    const filename = `response-${Date.now()}.txt`;
    await writeFile(filename, text);

    const botMessage = await message.channel.send({ content: `<@${message.author.id}>, Here is the response:`, files: [filename] });
    await addSettingsButton(botMessage);

    // Cleanup: Remove the file after sending it
    await unlink(filename);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

async function attachmentToPart(attachment) {
  try {
    const response = await fetch(attachment.url);
    const buffer = await response.buffer();
    return { inlineData: { data: buffer.toString('base64'), mimeType: attachment.contentType } };
  } catch (error) {
    console.log(error.message);
  }
}

function getHistory(id) {
  return chatHistories[id]?.map((line, index) => ({
    role: index % 2 === 0 ? 'user' : 'model',
    parts: [{ text: line }],
  })) || [];
}

function updateChatHistory(id, userMessage, modelResponse) {
  if (!chatHistories[id]) {
    chatHistories[id] = [];
  }
  chatHistories[id].push(userMessage);
  chatHistories[id].push(modelResponse);
}

// <==========>



// <=====[Gen Function Handling]=====>

async function retryOperation(fn, maxRetries, delayMs = 1000) {
  let error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`Attempt ${attempt} failed`);
      error = err;
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs}ms before next attempt...`);
        await delay(delayMs);
      } else {
        console.log(`All ${maxRetries} Attempts failed`);
      }
    }
  }
  throw new Error(error);
}

function getEventId() {
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');
  return hexString;
}

async function fetchAndExtractRootUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const htmlContent = await response.text();

    const rootMatch = htmlContent.match(/window\.gradio_config = (.*?});/s);
    if (rootMatch) {
      const gradioConfig = JSON.parse(rootMatch[1]);
      return gradioConfig.root;
    } else {
      throw new Error("Could not extract root value.");
    }
  } catch (error) {
    console.error('Failed to fetch:', error);
    return null;
  }
}

function generateSessionHash() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomDigits() {
  return Math.floor(Math.random() * (999999999 - 100000000 + 1) + 100000000);
}

async function speechGen(prompt, language) {
  let x, y;
  if (language == 'English') {
    x = 'EN';
    y = 'EN-Default';
  } else {
    switch (language) {
      case 'Spanish':
        x = y = 'ES';
        break;
      case 'French':
        x = y = 'FR';
        break;
      case 'Chinese':
        x = y = 'ZH';
        break;
      case 'Korean':
        x = y = 'KR';
        break;
      case 'Japanese':
        x = y = 'JP';
        break;
      default:
        x = 'EN';
        y = 'EN-Default';
    }
  }
  const sessionHash = generateSessionHash();
  const urlFirstRequest = 'https://mrfakename-melotts.hf.space/queue/join?';
  const dataFirstRequest = {
    data: [y, prompt, 1, x],
    event_data: null,
    fn_index: 1,
    trigger_id: 8,
    session_hash: sessionHash
  };

  try {
    const responseFirst = await axios.post(urlFirstRequest, dataFirstRequest);
  } catch (error) {
    console.error("Error in the first request:", error);
    return null;
  }

  const urlSecondRequest = `https://mrfakename-melotts.hf.space/queue/data?session_hash=${sessionHash}`;
  return new Promise((resolve, reject) => {
    try {
      axios.get(urlSecondRequest, {
        responseType: 'stream'
      }).then(responseSecond => {
        let fullData = '';

        responseSecond.data.on('data', (chunk) => {
          fullData += chunk.toString();

          if (fullData.includes('"msg": "process_completed"')) {
            const lines = fullData.split('\n');
            for (const line of lines) {
              if (line.includes('"msg": "process_completed"')) {
                try {
                  const dataDict = JSON.parse(line.slice(line.indexOf('{')));
                  const fullUrl = dataDict?.output?.data?.[0]?.url;
                  resolve(fullUrl);
                  break;
                } catch (parseError) {
                  console.error("Parsing error:", parseError);
                  reject(parseError);
                }
              }
            }
          }
        });
      }).catch(error => {
        console.error("Error in second request event stream:", error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function musicGen(prompt) {
  let socket;
  try {
    const sessionHash = generateSessionHash();
    const banner = bannerMusicGen;

    // WebSocket connection promise
    const socketPromise = new Promise((resolve, reject) => {
      socket = new WebSocket('wss://surn-unlimitedmusicgen.hf.space/queue/join');
      socket.onopen = () => {
        console.log('WebSocket connection established');
        resolve();
      };
      socket.onerror = (error) => {
        console.error('WebSocket error.');
        reject(new Error('WebSocket connection error'));
      };
    });

    // Wait for socket to be ready
    await socketPromise;

    // Send and process messages
    const url = await new Promise((resolve, reject) => {
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data);

        if (data.msg === 'send_hash') {
          socket.send(JSON.stringify({
            fn_index: 0,
            session_hash: sessionHash,
          }));
        } else if (data.msg === 'send_data') {
          socket.send(JSON.stringify({
            data: ['large', prompt, null, 30, 2, 280, 1150, 0.7, 8.5, banner, 'MusicGen', './assets/arial.ttf', '#fff', -1, 2, 0, true, false, 'No'],
            event_data: null,
            fn_index: 5,
            session_hash: sessionHash,
          }));
        } else if (data.msg === 'process_completed') {
          const name = data?.output?.data?.[0]?.[0]?.name;
          const url = `https://surn-unlimitedmusicgen.hf.space/file=${name}`;
          resolve(url);
        }
      };

      socket.onerror = () => {
        reject(new Error('WebSocket encountered an error during message handling.'));
      };

      socket.onclose = () => {
        console.log('WebSocket connection closed');
        reject(new Error('WebSocket connection was closed unexpectedly.'));
      };
    });

    return url;
  } catch (error) {
    console.error('musicGen error:', error.message);
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
    throw error;
  }
}

async function videoGen(prompt) {
  const sessionHash = generateSessionHash();
  const urlFirstRequest = 'https://bytedance-animatediff-lightning.hf.space/queue/join?';
  const dataFirstRequest = {
    data: [prompt, "epiCRealism", "", 8],
    event_data: null,
    fn_index: 1,
    trigger_id: 10,
    session_hash: sessionHash
  };

  try {
    const responseFirst = await axios.post(urlFirstRequest, dataFirstRequest);
  } catch (error) {
    console.error("Error in the first request:", error);
    return null;
  }

  const urlSecondRequest = `https://bytedance-animatediff-lightning.hf.space/queue/data?session_hash=${sessionHash}`;
  return new Promise((resolve, reject) => {
    try {
      axios.get(urlSecondRequest, {
        responseType: 'stream'
      }).then(responseSecond => {
        let fullData = '';

        responseSecond.data.on('data', (chunk) => {
          fullData += chunk.toString();

          if (fullData.includes('"msg": "process_completed"')) {
            const lines = fullData.split('\n');
            for (const line of lines) {
              if (line.includes('"msg": "process_completed"')) {
                try {
                  const dataDict = JSON.parse(line.slice(line.indexOf('{')));
                  const fullUrl = dataDict?.output?.data?.[0]?.video?.url;
                  resolve(fullUrl);
                  break;
                } catch (parseError) {
                  console.error("Parsing error:", parseError);
                  reject(parseError);
                }
              }
            }
          }
        });
      }).catch(error => {
        console.error("Error in second request event stream:", error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function generateWithSC(prompt,  resolution) {
  let width, height;
  if (resolution == 'Square') {
    width = 1024;
    height = 1024;
  } else if (resolution == 'Wide') {
    width = 1280;
    height = 768;
  } else if (resolution == 'Portrait') {
    width = 768;
    height = 1280;
  }
  return new Promise(async (resolve, reject) => {
    try {
      const randomDigit = generateRandomDigits();
      const sessionHash = generateSessionHash();

      await fetch("https://multimodalart-stable-cascade.hf.space/run/predict", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "data": [0, true],
          "event_data": null,
          "fn_index": 2,
          "trigger_id": 6,
          "session_hash": sessionHash
        })
      });

      // Second request to initiate the image generation
      const queueResponse = await fetch("https://multimodalart-stable-cascade.hf.space/queue/join?", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "data": [prompt, nevPrompt, randomDigit, width, height, 30, 4, 12, 0, 1],
          "event_data": null,
          "fn_index": 3,
          "trigger_id": 6,
          "session_hash": sessionHash
        })
      });

      // Setting up event source for listening to the progress
      const es = new EventSource(`https://multimodalart-stable-cascade.hf.space/queue/data?session_hash=${sessionHash}`);
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          if (!data?.output?.data?.[0]?.url) {
            reject(new Error("Output URL is missing"));
          } else {
            const outputUrl = data.output.data[0].url;
            resolve({ images: [{ url: outputUrl }], modelUsed: "Stable-Cascade" });
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

async function generateWithPlayground(prompt, resolution) {
  let width, height;
  if (resolution == 'Square') {
    width = 1024;
    height = 1024;
  } else if (resolution == 'Wide') {
    width = 1280;
    height = 768;
  } else if (resolution == 'Portrait') {
    width = 768;
    height = 1280;
  }
  return new Promise(async (resolve, reject) => {
    try {
      const session_hash = generateSessionHash();
      const event_id = getEventId();
      const randomDigit = generateRandomDigits();
      const rootUrl = await fetchAndExtractRootUrl("https://playgroundai-playground-v2-5.hf.space/");

      const urlJoinQueue = `https://playgroundai-playground-v2-5.hf.space/queue/join?fn_index=3&session_hash=${session_hash}`;
      const eventSource = new EventSource(urlJoinQueue);

      eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === "send_data") {
          const eventId = data?.event_id;
          fetch("https://playgroundai-playground-v2-5.hf.space/queue/data", {
            method: "POST",
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: [prompt, nevPrompt, true, randomDigit, width, height, 3, true],
              event_data: null,
              fn_index: 3,
              trigger_id: 6,
              session_hash: session_hash,
              event_id: eventId
            })
          });
        } else if (data.msg === "process_completed") {
          eventSource.close();
          const imagePaths = data?.output?.data[0];
          const firstImagePath = imagePaths.length > 0 ? imagePaths[0].image.path : null;

          if (firstImagePath) {
            const fullUrl = `${rootUrl}/file=${firstImagePath}`;
            resolve({ images: [{ url: fullUrl }], modelUsed: "Playground" });
          } else {
            reject(new Error('No image path found in the process_completed message.'));
          }
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

function generateWithDallEXL(prompt, resolution) {
  let width, height;
  if (resolution == 'Square') {
    width = 1024;
    height = 1024;
  } else if (resolution == 'Wide') {
    width = 1280;
    height = 768;
  } else if (resolution == 'Portrait') {
    width = 768;
    height = 1280;
  }
  return new Promise(async (resolve, reject) => {
    try {
      const randomDigits = generateRandomDigits();
      const sessionHash = generateSessionHash();

      // First request to join the queue
      await fetch("https://ehristoforu-dalle-3-xl-lora-v2.hf.space/queue/join?", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [prompt, nevPrompt, true, randomDigits, width, height, 6, true],
          event_data: null,
          fn_index: 3,
          trigger_id: 6,
          session_hash: sessionHash
        }),
      });

      // Replace this part to use EventSource for listening to the event stream
      const es = new EventSource(`https://ehristoforu-dalle-3-xl-lora-v2.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            reject(new Error("Output URL does not exist, path might be invalid."));
          } else {
            resolve({ images: [{ url: outputUrl }], modelUsed: "DallE-XL" });
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

function generateWithAnime(prompt, resolution) {
  let size;
  if (resolution == 'Square') {
    size = '1024 x 1024';
  } else if (resolution == 'Wide') {
    size = '1344 x 768';
  } else if (resolution == 'Portrait') {
    size = '896 x 1152';
  }
  return new Promise(async (resolve, reject) => {
    const randomDigit = generateRandomDigits();
    const sessionHash = generateSessionHash();

    try {
      // First request to initiate the process
      await fetch("https://cagliostrolab-animagine-xl-3-1.hf.space/queue/join?", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            prompt, `(rating_explicit:1.2), ${nevPrompt}`, randomDigit, 1024, 1024, 4, 35, "DPM++ 2M SDE Karras", size,"(None)", "Standard v3.1", false, 0.55, 1.5, true
          ],
          event_data: null,
          fn_index: 5,
          trigger_id: 49,
          session_hash: sessionHash,
        }),
      });

      // Using EventSource to listen for server-sent events
      const es = new EventSource(`https://cagliostrolab-animagine-xl-3-1.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            reject(new Error('Invalid or missing output URL'));
          } else {
            resolve({ images: [{ url: outputUrl }], modelUsed: "Anime" });
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

function generateWithSDXLAlt(prompt, resolution) {
  let width, height;
  if (resolution == 'Square') {
    width = 1024;
    height = 1024;
  } else if (resolution == 'Wide') {
    width = 1280;
    height = 768;
  } else if (resolution == 'Portrait') {
    width = 768;
    height = 1280;
  }
  return new Promise((resolve, reject) => {
    try {
      const url = "https://bytedance-hyper-sdxl-1step-t2i.hf.space";
      const randomDigit = generateRandomDigits();
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [1, height, width, prompt, randomDigit],
        "event_data": null,
        "fn_index": 0,
        "trigger_id": 9,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            if (data?.output?.data?.[0]?.[0]?.image?.url) {
              const full_url = data.output.data[0][0].image.url;
              resolve({ images: [{ url: full_url }], modelUsed: "SD-XL-Alt" });
            } else {
              reject(new Error("Invalid path: URL does not exist."));
            }
          }
        };
        eventSource.onerror = (error) => {
          eventSource.close();
          reject(error);
        };
      }).catch(error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function generateWithSDXL(prompt) {
  return new Promise((resolve, reject) => {
    try {
      const url = "https://h1t-tcd.hf.space";
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [prompt, 16, -1, 0.6],
        "event_data": null,
        "fn_index": 2,
        "trigger_id": 17,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.["output"]?.["data"]?.[0]?.["url"];
            if (!full_url) {
              throw new Error("The generated URL does not exist.");
            }
            resolve({ images: [{ url: full_url }], modelUsed: "SD-XL" });
          }
        };
        eventSource.onerror = (error) => {
          eventSource.close();
          reject(error);
        };
      }).catch(error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function generateWithRedmond(prompt, resolution) {
  let size;
  if (resolution == 'Square') {
    size = '1024 x 1024';
  } else if (resolution == 'Wide') {
    size = '1344 x 768';
  } else if (resolution == 'Portrait') {
    size = '896 x 1152';
  }
  return new Promise(async (resolve, reject) => {
    const randomDigit = generateRandomDigits();
    const sessionHash = generateSessionHash();

    try {
      // First request to initiate the process
      await fetch("https://artificialguybr-cinematicredmond-free-demo.hf.space/queue/join?", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            prompt, `(rating_explicit:1.2), ${nevPrompt}`, randomDigit, 1024, 1024, 4, 35, "DPM++ 2M SDE Karras", size, false, 0.55, 1.5
          ],
          event_data: null,
          fn_index: 9,
          trigger_id: 7,
          session_hash: sessionHash,
        }),
      });

      // Using EventSource to listen for server-sent events
      const es = new EventSource(`https://artificialguybr-cinematicredmond-free-demo.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            throw new Error("The generated URL does not exist.");
          }
          resolve({ images: [{ url: outputUrl }], modelUsed: "Redmond" });
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

async function generateWithJuggernaut(prompt, resolution) {
  let size;
  if (resolution == 'Square') {
    size = '1024 x 1024';
  } else if (resolution == 'Wide') {
    size = '1344 x 768';
  } else if (resolution == 'Portrait') {
    size = '896 x 1152';
  }
  return new Promise(async (resolve, reject) => {
    const randomDigit = generateRandomDigits();
    const sessionHash = generateSessionHash();
  
    try {
      // First request to initiate the process
      await fetch("https://damarjati-playground.hf.space/queue/join?", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
              prompt, `(rating_explicit:1.2), ${nevPrompt}`, randomDigit, 1024, 1024, 4, 35, "DPM++ 2M SDE Karras", size, "(None)", "(None)", false, 0.55, 1.5, true
            ],
          event_data: null,
          fn_index: 4,
          trigger_id: 48,
          session_hash: sessionHash,
        }),
      });
  
      // Using EventSource to listen for server-sent events
      const es = new EventSource(`https://damarjati-playground.hf.space/queue/data?session_hash=${sessionHash}`);
  
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            reject(new Error('Invalid or missing output URL'));
          } else {
            resolve({ images: [{ url: outputUrl }], modelUsed: "Juggernaut" });
          }
        }
      };
  
      es.onerror = (error) => {
        es.close();
        reject(error);
      };
  
    } catch (error) {
      reject(error);
    }
  });
}

async function generateWithDalle3(prompt) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };
  
    const body = JSON.stringify({
      model: "dall-e-3",
      prompt: prompt,
      n: 1
    });
  
    // Create a new promise that rejects in 15 seconds to represent the timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timed out (15 seconds limit)'));
      }, 15000);
    });

    // Modify the fetch call to race against the timeout promise
    const fetchPromise = fetch(`${process.env.OPENAI_BASE_URL}/images/generations` || 'https://api.openai.com/v1/images/generations', {
      method: 'POST', headers, body
    });

    // Use Promise.race to see which promise settles first: the fetch call or the timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status} ${data?.message || ''}`);
    }
    return { images: data.data, modelUsed: "Dall-e-3" };
  } catch (error) {
    console.log(error);
    throw error;
  }
}

const nsfwWordsArray = [
  "2g1c", "2 girls 1 cup", "acrotomophilia", "alabama hot pocket", "alaskan pipeline", "anal", "anilingus", "anus", "apeshit", "arsehole", "ass", "asshole",
  "assmunch", "auto erotic", "autoerotic", "babeland", "baby batter", "baby juice", "ball gag", "ball gravy", "ball kicking", "ball licking", "ball sack", "ball sucking",
  "bangbros", "bangbus", "bareback", "barely legal", "barenaked", "bastard", "bastardo", "bastinado", "bbw", "bdsm", "beaner", "beaners", "beaver cleaver", "beaver lips",
  "beastiality", "bestiality", "big black", "big breasts", "big knockers", "big tits", "bimbos", "birdlock", "bitch", "bitches", "black cock", "blonde action",
  "blonde on blonde action", "blowjob", "blow job", "blow your load", "blue waffle", "blumpkin", "bollocks", "bondage", "boner", "boob", "boobs", "booty call",
  "brown showers", "brunette action", "bukkake", "bulldyke", "bullet vibe", "bullshit", "bung hole", "bunghole", "busty", "butt", "buttcheeks", "butthole", "camel toe",
  "camgirl", "camslut", "camwhore", "carpet muncher", "carpetmuncher", "chocolate rosebuds", "cialis", "circlejerk", "cleveland steamer", "clit", "clitoris",
  "clover clamps", "clusterfuck", "cock", "cocks", "coprolagnia", "coprophilia", "cornhole", "coon", "coons", "creampie", "cum", "cumming", "cumshot", "cumshots",
  "cunnilingus", "cunt", "darkie", "date rape", "daterape", "deep throat", "deepthroat", "dendrophilia", "dick", "dildo", "dingleberry", "dingleberries",
  "dirty pillows", "dirty sanchez", "doggie style", "doggiestyle", "doggy style", "doggystyle", "dog style", "dolcett", "domination", "dominatrix", "dommes",
  "donkey punch", "double dong", "double penetration", "dp action", "dry hump", "dvda", "eat my ass", "ecchi", "ejaculation", "erotic", "erotism", "escort",
  "eunuch", "fag", "faggot", "fecal", "felch", "fellatio", "feltch", "female squirting", "femdom", "figging", "fingerbang", "fingering", "fisting", "foot fetish",
  "footjob", "frotting", "fuck", "fuck buttons", "fuckin", "fucking", "fucktards", "fudge packer", "fudgepacker", "futanari", "gangbang", "gang bang",
  "gay sex", "genitals", "giant cock", "girl on", "girl on top", "girls gone wild", "goatcx", "goatse", "god damn", "gokkun", "golden shower", "goodpoop",
  "goo girl", "goregasm", "grope", "group sex", "g-spot", "guro", "hand job", "handjob", "hard core", "hardcore", "hentai", "homoerotic", "honkey",
  "hooker", "horny", "hot carl", "hot chick", "how to kill", "how to murder", "huge fat", "humping", "incest", "intercourse", "jack off", "jail bait",
  "jailbait", "jelly donut", "jerk off", "jigaboo", "jiggaboo", "jiggerboo", "jizz", "juggs", "kike", "kinbaku", "kinkster", "kinky", "knobbing",
  "leather restraint", "leather straight jacket", "lemon party", "livesex", "lolita", "lovemaking", "make me come", "male squirting", "masturbat",
  "masturbating", "masturbation", "menage a trois", "milf", "missionary position", "mong", "motherfucker", "mound of venus", "mr hands", "muff diver",
  "muffdiving", "nambla", "nawashi", "negro", "neonazi", "nigga", "nigger", "nig nog", "nimphomania", "nipple", "nipples", "nsfw", "nsfw images",
  "nude", "nudity", "nutten", "nympho", "nymphomania", "octopussy", "omorashi", "one cup two girls", "one guy one jar", "orgasm", "orgy", "paedophile",
  "paki", "panties", "panty", "pedobear", "pedophile", "pegging", "penis", "phone sex", "piece of shit", "pikey", "pissing", "piss pig", "pisspig",
  "playboy", "pleasure chest", "pole smoker", "ponyplay", "poof", "poon", "poontang", "punany", "poop chute", "poopchute", "porn", "porno",
  "pornography", "prince albert piercing", "pthc", "pubes", "pussy", "queaf", "queef", "quim", "raghead", "raging boner", "rape", "raping",
  "rapist", "rectum", "reverse cowgirl", "rimjob", "rimming", "rosy palm", "rosy palm and her 5 sisters", "rusty trombone", "sadism", "santorum",
  "scat", "schlong", "scissoring", "semen", "sex", "sexcam", "sexo", "sexy", "sexual", "sexually", "sexuality", "shaved beaver", "shaved pussy",
  "shemale", "shibari", "shit", "shitblimp", "shitty", "shota", "shrimping", "skeet", "slanteye", "slut", "s&m", "smut", "snatch",
  "snowballing", "sodomize", "sodomy", "spastic", "spic", "splooge", "splooge moose", "spooge", "spread legs", "spunk", "strap on", "strapon",
  "strappado", "strip club", "style doggy", "suck", "sucks", "suicide girls", "sultry women", "swastika", "swinger", "tainted love", "taste my",
  "tea bagging", "threesome", "throating", "thumbzilla", "tied up", "tight white", "tit", "tits", "titties", "titty", "tongue in a",
  "topless", "tosser", "towelhead", "tranny", "tribadism", "tub girl", "tubgirl", "tushy", "twat", "twink", "twinkie", "two girls one cup",
  "undressing", "upskirt", "urethra play", "urophilia", "vagina", "venus mound", "viagra", "vibrator", "violet wand", "vorarephilia", "voyeur",
  "voyeurweb", "voyuer", "vulva", "wank", "wetback", "wet dream", "white power", "whore", "worldsex", "wrapping men", "wrinkled starfish",
  "xx", "xxx", "yaoi", "yellow showers", "yiffy", "zoophilia", "🖕",
    "sex", "nude", "naked", "porn", "erotic", "fuck", "shit",
    "bitch", "dick", "cock", "pussy", "asshole", "fag", "bastard",
    "slut", "whore", "hentai", "boobs", "tits", "penis", "vagina",
    "cum", "sperm", "orgasm", "masturbat", "masterbat", "bukkake", "fetish",
    "bdsm", "blowjob", "handjob", "milf", "cunt", "gangbang", "prostitute",
    "stripper", "adult", "hardcore", "sextoy", "sextoys", "porno",
    "xnxx", "xvideos", "pornhub", "threesome", "swinger", "nymphomania",
    "nympho", "erotica", "sensual", "clitoris", "labia", "scrotum",
    "premature", "ejaculation", "incest", "bestiality", "voyeurism",
    "exhibitionist", "sadism", "masochism", "lubes", "lubricants",
    "dildo", "vibrator", "fleshlight", "bondage", "domination",
    "submissive", "sadomasochism", "fellatio", "cunnilingus",
    "rimming", "sixtynine", "deepthroat", "gagging", "squirting",
    "fisting", "pornstar", "adultfilm", "adultvideo", "sexwork",
    "sexworker", "escort", "hooker", "callgirl", "redlight", "huge"
];

function filterPrompt(text) {
  nsfwWordsArray.forEach(word => {
    const regexPattern = new RegExp(word.split('').join('\\W*'), 'gi');
    text = text.replace(regexPattern, '');
  });
  return text;
}

// <==========>

client.login(token);
