import dotenv from 'dotenv';
dotenv.config();
import fetch from 'node-fetch';
import {
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
} from 'discord.js';
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory
} from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { writeFile, unlink } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse';
import * as cheerio from 'cheerio';
import { YoutubeTranscript } from 'youtube-transcript';
import osu from 'node-os-utils';
const { mem } = osu;
const { cpu } = osu;
import axios from 'axios';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

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
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, 'config');
const CHAT_HISTORIES_DIR = path.join(CONFIG_DIR, 'chat_histories_2');

const FILE_PATHS = {
  activeUsersInChannels: path.join(CONFIG_DIR, 'active_users_in_channels.json'),
  customInstructions: path.join(CONFIG_DIR, 'custom_instructions.json'),
  serverSettings: path.join(CONFIG_DIR, 'server_settings.json'),
  userPreferredImageModel: path.join(CONFIG_DIR, 'user_preferred_image_model.json'),
  userPreferredImageResolution: path.join(CONFIG_DIR, 'user_preferred_image_resolution.json'),
  userPreferredImagePromptEnhancement: path.join(CONFIG_DIR, 'user_preferred_image_prompt_enhancement.json'),
  userPreferredSpeechModel: path.join(CONFIG_DIR, 'user_preferred_speech_model.json'),
  userPreferredUrlHandle: path.join(CONFIG_DIR, 'user_preferred_url_handle.json'),
  userResponsePreference: path.join(CONFIG_DIR, 'user_response_preference.json'),
  alwaysRespondChannels: path.join(CONFIG_DIR, 'always_respond_channels.json'),
  blacklistedUsers: path.join(CONFIG_DIR, 'blacklisted_users.json')
};

function saveStateToFile() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
      fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
    }

    for (let [key, value] of Object.entries(chatHistories)) {
      fs.writeFileSync(path.join(CHAT_HISTORIES_DIR, `${key}.json`), JSON.stringify(value, null, 2), 'utf-8');
    }

    for (let [key, value] of Object.entries(FILE_PATHS)) {
      fs.writeFileSync(value, JSON.stringify(eval(key), null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error saving state to files:', error);
  }
}

function loadStateFromFile() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      console.warn('Config directory does not exist. Initializing with empty state.');
      return;
    }

    if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
      fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
    } else {
      fs.readdirSync(CHAT_HISTORIES_DIR).forEach(file => {
        if (file.endsWith('.json')) {
          const user = path.basename(file, '.json');
          try {
            const data = fs.readFileSync(path.join(CHAT_HISTORIES_DIR, file), 'utf-8');
            chatHistories[user] = JSON.parse(data);
          } catch (readError) {
            console.error(`Error reading chat history for ${user}:`, readError);
          }
        }
      });
    }

    for (let [key, value] of Object.entries(FILE_PATHS)) {
      if (fs.existsSync(value)) {
        try {
          const data = fs.readFileSync(value, 'utf-8');
          eval(`${key} = JSON.parse(data)`);
        } catch (readError) {
          console.error(`Error reading ${key}:`, readError);
        }
      }
    }
  } catch (error) {
    console.error('Error loading state from files:', error);
  }
}

function resetChatHistories() {
  chatHistories = {};
  console.log('Chat histories have been reset.');
}

function scheduleDailyReset() {
  const now = new Date();
  const nextReset = new Date();
  nextReset.setHours(0, 0, 0, 0);
  if (nextReset <= now) {
    nextReset.setDate(now.getDate() + 1);
  }
  const timeUntilNextReset = nextReset - now;

  setTimeout(() => {
    resetChatHistories();
    scheduleDailyReset();
  }, timeUntilNextReset);
}

scheduleDailyReset();
loadStateFromFile();

// <=====[Configuration]=====>

const defaultResponseFormat = config.defaultResponseFormat;
const defaultImgModel = config.defaultImgModel;
const hexColour = config.hexColour;
const defaultUrlReading = config.defaultUrlReading;
const activities = config.activities.map(activity => ({
  name: activity.name,
  type: ActivityType[activity.type]
}));
const defaultPersonality = config.defaultPersonality;
const defaultServerSettings = config.defaultServerSettings;
const workInDMs = config.workInDMs;
const shouldDisplayPersonalityButtons = config.shouldDisplayPersonalityButtons;
const SEND_RETRY_ERRORS_TO_DISCORD = config.SEND_RETRY_ERRORS_TO_DISCORD;

import {
  speechGen,
  musicGen,
  generateWithPlayground,
  generateImage,
  generateWithDalle3,
  imgModels,
  imageModelFunctions
} from './generators.js';

// <==========>



// <=====[Register Commands And Activities]=====>

import { commands } from './commands.js';

let activityIndex = 0;
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

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
    if (message.author.id === client.user.id) return;

    const isDM = message.channel.type === ChannelType.DM;
    const mentionPattern = new RegExp(`^<@!?${client.user.id}>(?:\\s+)?(generate|imagine)`, 'i');
    const startsWithPattern = /^generate|^imagine/i;
    const command = message.content.match(mentionPattern) || message.content.match(startsWithPattern);

    const shouldRespond = (
      workInDMs && isDM ||
      alwaysRespondChannels[message.channelId] ||
      (message.mentions.users.has(client.user.id) && !isDM) ||
      activeUsersInChannels[message.channelId]?.[message.author.id]
    );

    if (shouldRespond) {
      if (message.guild) {
        initializeBlacklistForGuild(message.guild.id);
        if (blacklistedUsers[message.guild.id].includes(message.author.id)) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Blacklisted')
            .setDescription('You are blacklisted and cannot use this bot.');
          return message.reply({ embeds: [embed] });
        }
      }
      if (command) {
        const prompt = message.content.slice(command.index + command[0].length).trim();
        if (prompt) {
          await genimg(prompt, message);
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('Invalid Prompt')
            .setDescription('Please provide a valid prompt.');
          await message.channel.send({ embeds: [embed] });
        }
      } else if (activeRequests.has(message.author.id)) {
        const embed = new EmbedBuilder()
          .setColor(0xFFFF00)
          .setTitle('Request In Progress')
          .setDescription('Please wait until your previous action is complete.');
        await message.reply({ embeds: [embed] });
      } else {
        await handleTextMessage(message);
      }
    }
  } catch (error) {
    console.error('Error processing the message:', error);
    if (activeRequests.has(message.author.id)) {
      activeRequests.delete(message.author.id);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand()) {
      await handleCommandInteraction(interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error.message);
  }
});

async function handleCommandInteraction(interaction) {
  if (!interaction.isCommand()) return;

  const commandHandlers = {
    respond_to_all: handleRespondToAllCommand,
    whitelist: handleWhitelistCommand,
    blacklist: handleBlacklistCommand,
    imagine: handleImagineCommand,
    clear_memory: handleClearMemoryCommand,
    speech: handleSpeechCommand,
    settings: showSettings,
    server_settings: showDashboard,
    music: handleMusicCommand,
    status: handleStatusCommand
  };

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction);
  } else {
    console.log(`Unknown command: ${interaction.commandName}`);
  }
}

async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Blacklisted')
        .setDescription('You are blacklisted and cannot use this interaction.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  const buttonHandlers = {
    'server-chat-history': toggleServerWideChatHistory,
    'clear-server': clearServerChatHistory,
    'settings-save-buttons': toggleSettingSaveButton,
    'custom-server-personality': serverPersonality,
    'toggle-server-personality': toggleServerPersonality,
    'download-server-conversation': downloadServerConversation,
    'response-server-mode': toggleServerPreference,
    'toggle-response-server-mode': toggleServerResponsePreference,
    'settings': showSettings,
    'back_to_main_settings': editShowSettings,
    'clear-memory': handleClearMemoryCommand,
    'always-respond': alwaysRespond,
    'custom-personality': handleCustomPersonalityCommand,
    'remove-personality': handleRemovePersonalityCommand,
    'generate-image': handleGenerateImageButton,
    'change-image-model': changeImageModel,
    'toggle-prompt-enhancer': togglePromptEnhancer,
    'change-image-resolution': changeImageResolution,
    'toggle-response-mode': handleToggleResponseMode,
    'toggle-url-mode': toggleUrlUserPreference,
    'generate-speech': processSpeechGet,
    'generate-music': processMusicGet,
    'change-speech-model': changeSpeechModel,
    'download-conversation': downloadConversation,
    'download_message': downloadMessage,
    'general-settings': handleSubButtonInteraction,
    'image-settings': handleSubButtonInteraction,
    'speech-settings': handleSubButtonInteraction,
    'music-settings': handleSubButtonInteraction,
  };

  for (const [key, handler] of Object.entries(buttonHandlers)) {
    if (interaction.customId.startsWith(key)) {
      if (key === 'select-speech-model-') {
        const selectedModel = interaction.customId.replace('select-speech-model-', '');
        await handleSpeechSelectModel(interaction, selectedModel);
      } else {
        await handler(interaction);
      }
      break;
    }
  }
}

async function handleSelectMenuInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const selectMenuHandlers = {
    'select-image-model': handleImageSelectModel,
    'select-image-resolution': handleImageSelectResolution
  };

  const handler = selectMenuHandlers[interaction.customId];
  if (handler) {
    const selectedValue = interaction.values[0];
    await handler(interaction, selectedValue);
  }
}

async function handleClearMemoryCommand(interaction) {
  const serverChatHistoryEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.serverChatHistory : false;
  if (!serverChatHistoryEnabled) {
    await clearChatHistory(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('Feature Disabled')
      .setDescription('Clearing chat history is not enabled for this server, Server-Wide chat history is active.');
    await interaction.reply({ embeds: [embed] });
  }
}

async function handleCustomPersonalityCommand(interaction) {
  const serverCustomEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!serverCustomEnabled) {
    await setCustomPersonality(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('Feature Disabled')
      .setDescription('Custom personality is not enabled for this server, Server-Wide personality is active.');
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handleRemovePersonalityCommand(interaction) {
  const isServerEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.customServerPersonality : false;
  if (!isServerEnabled) {
    await removeCustomPersonality(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('Feature Disabled')
      .setDescription('Custom personality is not enabled for this server, Server-Wide personality is active.');
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handleToggleResponseMode(interaction) {
  const serverResponsePreferenceEnabled = interaction.guild ? serverSettings[interaction.guild.id]?.serverResponsePreference : false;
  if (!serverResponsePreferenceEnabled) {
    await toggleUserPreference(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('Feature Disabled')
      .setDescription('Toggling Response Mode is not enabled for this server, Server-Wide Response Mode is active.');
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function editShowSettings(interaction) {
  await showSettings(interaction, true);
}

// <==========>



// <=====[Messages Handling]=====>

async function handleTextMessage(message) {
  const botId = client.user.id;
  const userId = message.author.id;
  const guildId = message.guild?.id;
  let messageContent = message.content.replace(new RegExp(`<@!?${botId}>`), '').trim();

  if (messageContent === '' && !(message.attachments.size > 0 && hasSupportedAttachments(message))) {
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Empty Message')
      .setDescription("It looks like you didn't say anything. What would you like to talk about?");
    const botMessage = await message.reply({ embeds: [embed] });
    await addSettingsButton(botMessage);
    return;
  }
  message.channel.sendTyping();
  const typingInterval = setInterval(() => {
    message.channel.sendTyping();
  }, 4000);
  setTimeout(() => {
    clearInterval(typingInterval);
  }, 120000);
  let botMessage = false;
  let parts;
  if (SEND_RETRY_ERRORS_TO_DISCORD) {
    clearInterval(typingInterval);
    const updateEmbedDescription = (urlHandlingStatus, textAttachmentStatus, imageAttachmentStatus, finalText) => {
      return `Let me think...\n\n- ${urlHandlingStatus}: Url Handling\n- ${textAttachmentStatus}: Text Attachment Check\n- ${imageAttachmentStatus}: Media Attachment Check\n${finalText || ''}`;
    };

    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Processing')
      .setDescription(updateEmbedDescription('[🔁]', '[🔁]', '[🔁]'));
    botMessage = await message.reply({ embeds: [embed] });
    
    let urlHandlingStatus = '[🔁]';
    if (getUrlUserPreference(userId) === "ON") {
      messageContent = await appendSiteContentToText(messageContent);
      urlHandlingStatus = '[☑️]';
    } else {
      urlHandlingStatus = '[🚫]';
    }
    embed.setDescription(updateEmbedDescription(urlHandlingStatus, '[🔁]', '[🔁]'));
    await botMessage.edit({ embeds: [embed] });
    
    messageContent = await extractFileText(message, messageContent);
    embed.setDescription(updateEmbedDescription(urlHandlingStatus, '[☑️]', '[🔁]'));
    await botMessage.edit({ embeds: [embed] });
    
    parts = await processPromptAndMediaAttachments(messageContent, message);
    embed.setDescription(updateEmbedDescription(urlHandlingStatus, '[☑️]', '[☑️]', '### All checks done. Waiting for the response...'));
    await botMessage.edit({ embeds: [embed] });
  } else {
    if (getUrlUserPreference(userId) === "ON") {
      messageContent = await appendSiteContentToText(messageContent);
    }
    messageContent = await extractFileText(message, messageContent);
    parts = await processPromptAndMediaAttachments(messageContent, message);
  }

  const instructions = guildId 
    ? serverSettings[guildId]?.customServerPersonality && customInstructions[guildId]
      ? customInstructions[guildId]
      : customInstructions[userId]
    : customInstructions[userId];

  activeRequests.add(userId);

  let infoStr = '';
  if (message.guild) {
    const member = await message.guild.members.fetch(userId);
    const userInfo = {
      username: message.author.username,
      displayName: message.author.displayName,
      serverNickname: message.author.nickname || 'Not set',
      status: member.presence ? member.presence.status : 'offline'
    };
    infoStr = `\nYou are currently engaging with users in the ${message.guild.name} Discord server.\n\n## Current User Information\nUsername: \`${userInfo.username}\`\nDisplay Name: \`${userInfo.displayName}\`\nServer Nickname: \`${userInfo.serverNickname}\`\nStatus: \`${userInfo.status}\``;
  }

  const isServerChatHistoryEnabled = guildId ? serverSettings[guildId]?.serverChatHistory : false;
  const finalInstructions = isServerChatHistoryEnabled ? instructions + infoStr : instructions;

  const model = await genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    systemInstruction: { role: "system", parts: [{ text: finalInstructions || defaultPersonality }] }
  });

  const chat = model.startChat({
    history: isServerChatHistoryEnabled ? getHistory(guildId) : getHistory(userId),
    safetySettings,
  });

  await handleModelResponse(botMessage, chat, parts, message, typingInterval);
}

function hasSupportedAttachments(message) {
  const supportedFileExtensions = [
    'html', 'js', 'css', 'json', 'xml', 'csv', 'py', 'java', 'sql', 'log', 'md', 'txt', 'pdf'
  ];

  return message.attachments.some((attachment) => {
    const contentType = attachment.contentType.toLowerCase();
    const fileExtension = attachment.name.split('.').pop().toLowerCase();
    return contentType.startsWith('image/') || contentType.startsWith('audio/') || contentType.startsWith('video/') || supportedFileExtensions.includes(fileExtension);
  });
}

async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // replace non-lowercase alphanumeric and dashes with dashes
    .replace(/^-+|-+$/g, ''); // remove leading and trailing dashes
}

async function processPromptAndMediaAttachments(prompt, message) {
  const attachments = JSON.parse(JSON.stringify(Array.from(message.attachments.values())));

  let parts = [{ text: prompt }];

  if (attachments.length > 0) {
    const validAttachments = attachments.filter(
      (attachment) => {
        const contentType = attachment.contentType.toLowerCase();
        return contentType.startsWith('image/') || contentType.startsWith('audio/') || contentType.startsWith('video/');
      }
    );

    if (validAttachments.length > 0) {
      const attachmentParts = await Promise.all(
        validAttachments.map(async (attachment) => {
          const sanitizedFileName = sanitizeFileName(attachment.name);
          const filePath = path.join(__dirname, sanitizedFileName);

          try {
            // Download the file
            await downloadFile(attachment.url, filePath);

            // Upload the downloaded file
            const uploadResult = await fileManager.uploadFile(filePath, {
              mimeType: attachment.contentType,
              displayName: sanitizedFileName,
            });
            const name = uploadResult.file.name;
            if (name === null) {
              throw new Error(`Unable to extract file name from upload result: ${nameField}`);
            }

            // Check if the file is a video and wait for its state to be 'ACTIVE'
            if (attachment.contentType.startsWith('video/')) {
              let file = await fileManager.getFile(name);
              while (file.state === FileState.PROCESSING) {
                process.stdout.write(".");
                await new Promise((resolve) => setTimeout(resolve, 10_000));
                file = await fileManager.getFile(name);
              }

              if (file.state === FileState.FAILED) {
                throw new Error(`Video processing failed for ${sanitizedFileName}.`);
              }
            }

            // Delete the local file
            fs.unlinkSync(filePath);

            return {
              fileData: {
                mimeType: attachment.contentType,
                fileUri: uploadResult.file.uri,
              },
            };
          } catch (error) {
            console.error(`Error processing attachment ${sanitizedFileName}:`, error);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            return null;
          }
        })
      );

      parts = [...parts, ...attachmentParts.filter(part => part !== null)];
    }
  }

  return parts;
}

async function extractFileText(message, messageContent) {
  if (message.attachments.size > 0) {
    let attachments = Array.from(message.attachments.values());
    for (const attachment of attachments) {
      const fileType = attachment.name.split('.').pop().toLowerCase();
      const fileTypes = ['html', 'js', 'css', 'json', 'xml', 'csv', 'py', 'java', 'sql', 'log', 'md', 'txt', 'pdf'];

      if (fileTypes.includes(fileType)) {
        try {
          let fileContent = await downloadAndReadFile(attachment.url, fileType);
          messageContent += `\n\n[\`${attachment.name}\` File Content]:\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (error) {
          console.error(`Error reading file ${attachment.name}: ${error.message}`);
        }
      }
    }
  }
  return messageContent;
}

async function downloadAndReadFile(url, fileType) {
  let response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${response.statusText}`);

  switch (fileType) {
    case 'pdf':
      let buffer = await response.arrayBuffer();
      return (await pdf(buffer)).text;
    default:
      return await response.text();
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

// Function to extract all URLs from the text
function extractURLs(text) {
  const urlPattern = /https?:\/\/[^\s]+/g;
  return text.match(urlPattern) || [];
}

// Function to extract YouTube video IDs from URLs
function extractYouTubeIDs(urls) {
  const videoIDs = [];
  const regexPatterns = [
    /https:\/\/youtu\.be\/(\w+)/g, // Short-link pattern
    /https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)/g, // Standard YouTube link
    /https:\/\/m\.youtube\.com\/watch\?v=([\w-]+)/g // Mobile YouTube link
  ];

  urls.forEach(url => {
    regexPatterns.forEach(pattern => {
      const match = pattern.exec(url);
      if (match) {
        videoIDs.push(match[1]);
      }
    });
  });

  return videoIDs;
}

// Function to extract non-YouTube URLs
function extractNonYouTubeURLs(urls) {
  const nonYouTubeURLs = [];
  const youtubePatterns = [
    /https:\/\/youtu\.be\/(\w+)/,
    /https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)/,
    /https:\/\/m\.youtube\.com\/watch\?v=([\w-]+)/
  ];

  urls.forEach(url => {
    if (!youtubePatterns.some(pattern => pattern.test(url))) {
      nonYouTubeURLs.push(url);
    }
  });

  return nonYouTubeURLs;
}

// Function to fetch YouTube transcripts and append to text
async function fetchAndAppendYouTubeTranscripts(text, videoIDs) {
  let modifiedText = text;
  const transcriptsPromise = videoIDs.map((id, index) => {
    const commonUrlPrefix = `https://youtu.be/${id}`;
    modifiedText = modifiedText.replace(
      new RegExp(`(${commonUrlPrefix})`, 'g'),
      `[Reference Number ${index + 1}]($1)`
    );

    return YoutubeTranscript.fetchTranscript(id)
      .then(transcript => {
        const transcriptText = transcript.map(entry => entry.text).join(' ');
        return {
          index: index + 1,
          text: transcriptText,
          url: commonUrlPrefix,
        };
      })
      .catch(error => {
        console.error(`Error fetching transcript for video ID ${id}:`, error);
        return {
          index: index + 1,
          text: "Error: The transcript is not available for this video.",
          url: commonUrlPrefix,
        };
      });
  });

  try {
    const transcripts = await Promise.all(transcriptsPromise);
    transcripts.forEach(transcript => {
      if (transcript) {
        modifiedText += `\n\n[Transcript Of Video Number [${transcript.index}](${transcript.url})]:\n${transcript.text}`;
      }
    });

    return modifiedText;
  } catch (error) {
    console.error("An error occurred while appending transcripts to the text", error);
    return modifiedText;
  }
}

// Function to fetch content from non-YouTube URLs and append to text
async function fetchAndAppendWebpageContent(text, nonYouTubeURLs) {
  let modifiedText = text;
  const contentPromises = nonYouTubeURLs.map(async (url, index) => {
    try {
      const webpageContent = await scrapeWebpageContent(url);
      modifiedText = modifiedText.replace(
        new RegExp(`(${url})`, 'g'),
        `[Reference Number ${index + 1}]($1)`
      );
      return `\n\n[Text Inside The Website [${index + 1}](${url})]:\n"${webpageContent}"`;
    } catch (error) {
      console.error(`Error fetching content for URL ${url}:`, error);
      return `\n\n[Text Inside The Website [${index + 1}](${url})]:\n"Error: Unable to fetch content."`;
    }
  });

  try {
    const contents = await Promise.all(contentPromises);
    contents.forEach(content => {
      modifiedText += content;
    });

    return modifiedText;
  } catch (error) {
    console.error("An error occurred while appending webpage content to the text", error);
    return modifiedText;
  }
}

// Main function to append site content to text
const appendSiteContentToText = async (text) => {
  const urls = extractURLs(text);
  const videoIDs = extractYouTubeIDs(urls);
  const nonYouTubeURLs = extractNonYouTubeURLs(urls);

  let modifiedText = text;

  if (videoIDs.length > 0) {
    modifiedText = await fetchAndAppendYouTubeTranscripts(modifiedText, videoIDs);
  }

  if (nonYouTubeURLs.length > 0) {
    modifiedText = await fetchAndAppendWebpageContent(modifiedText, nonYouTubeURLs);
  }

  return modifiedText;
};

// <==========>



// <=====[Interaction Reply 1 (Image And Speech Gen)]=====>

async function handleImagineCommand(interaction) {
  try {
    if (!workInDMs && interaction.channel.type === ChannelType.DM) {
      const embed = new EmbedBuilder()
        .setColor(hexColour)
        .setTitle('DMs Disabled')
        .setDescription('DM interactions are disabled for this bot.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.guild) {
      initializeBlacklistForGuild(interaction.guild.id);
      if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle('Blacklisted')
          .setDescription('You are blacklisted and cannot use this interaction.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    const prompt = interaction.options.getString('prompt');
    const model = interaction.options.getString('model');
    const resolution = interaction.options.getString('resolution');
    if (resolution) {
      userPreferredImageResolution[interaction.user.id] = resolution;
    }
    await genimgslash(prompt, model, interaction);
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSpeechCommand(interaction) {
  try {
    if (!workInDMs && interaction.channel.type === ChannelType.DM) {
      const embed = new EmbedBuilder()
        .setColor(hexColour)
        .setTitle('DMs Disabled')
        .setDescription('DM interactions are disabled for this bot.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.guild) {
      initializeBlacklistForGuild(interaction.guild.id);
      if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle('Blacklisted')
          .setDescription('You are blacklisted and cannot use this interaction.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Generating Speech')
      .setDescription(`Generating your speech, please wait... 💽`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    const userId = interaction.user.id;
    const text = interaction.options.getString('prompt');
    const language = interaction.options.getString('language');
    const outputUrl = await generateSpeechWithPrompt(text, userId, language);
    if (outputUrl && outputUrl !== 'Output URL is not available.') {
      await handleSuccessfulSpeechGeneration(interaction, text, language, outputUrl);
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Sorry, something went wrong, or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
      const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await addSettingsButton(messageReference);
    }
  } catch (error) {
    console.log(error);
    try {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Sorry, something went wrong and the output is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\````);
      const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await addSettingsButton(messageReference);
    } catch(error) {}
  }
}

async function handleMusicCommand(interaction) {
  try {
    if (!workInDMs && interaction.channel.type === ChannelType.DM) {
      const embed = new EmbedBuilder()
        .setColor(hexColour)
        .setTitle('DMs Disabled')
        .setDescription('DM interactions are disabled for this bot.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.guild) {
      initializeBlacklistForGuild(interaction.guild.id);
      if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle('Blacklisted')
          .setDescription('You are blacklisted and cannot use this interaction.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Generating Music')
      .setDescription(`Generating your music, please wait... 🎧`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    const userId = interaction.user.id;
    const text = interaction.options.getString('prompt');
    const outputUrl = await generateMusicWithPrompt(text, userId);
    if (outputUrl && outputUrl !== 'Output URL is not available.') {
      await handleSuccessfulMusicGeneration(interaction, text, outputUrl);
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Sorry, something went wrong, or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
      const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await addSettingsButton(messageReference);
    }
  } catch (error) {
    console.log(error);
    try {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Sorry, something went wrong and the output is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
      const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await addSettingsButton(messageReference);
    } catch(error) {}
  }
}

async function handleSuccessfulSpeechGeneration(interaction, text, language, outputUrl) {
  try {
    const isGuild = interaction.guild !== null;
    const file = new AttachmentBuilder(outputUrl).setName('speech.wav');
    const embed = new EmbedBuilder()
      .setColor(hexColour)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Speech\n**Prompt:**\n\`\`\`${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\`\`\``)
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
      .setColor(hexColour)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Music\n**Prompt:**\n\`\`\`${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\`\`\``)
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

async function genimg(prompt, message) {
  const generatingMsg = await message.reply({ content: `Generating your image, please wait... 🖌️` });

  try {
    const { imageResult, enhancedPrompt } = await generateImageWithPrompt(prompt, message.author.id);
    const imageUrl = imageResult.images[0].url; 
    const modelUsed = imageResult.modelUsed;
    const isGuild = message.guild !== null;
    const imageExtension = path.extname(imageUrl) || '.png';
    const attachment = new AttachmentBuilder(imageUrl, { name: `generated-image${imageExtension}` });
    const embed = new EmbedBuilder()
      .setColor(hexColour)
      .setAuthor({ name: `To ${message.author.displayName}`, iconURL: message.author.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Image\n**Original Prompt:**\n\`\`\`${prompt.length > 3900 ? prompt.substring(0, 3900) + '...' : prompt}\`\`\``)
      .addFields(
        { name: '**Generated by:**', value: `\`${message.author.displayName}\``, inline: true },
        { name: '**Model Used:**', value: `\`${modelUsed}\``, inline: true },
        { name: '**Prompt Enhancer:**', value: `\`${enhancedPrompt !== 'Disabled' ? 'Enabled' : 'Disabled'}\``, inline: true }
      )
      .setImage(`attachment://generated-image${imageExtension}`)
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
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Sorry, could not generate the image. Please try again later.\n> **Prompt:**\n\`\`\`\n${prompt.length > 3900 ? prompt.substring(0, 3900) + '...' : prompt}\n\`\`\``);
      const messageReference = await message.reply({ embeds: [embed] });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch(error) {}
  }
}

async function genimgslash(prompt, modelInput, interaction) {
  const userId = interaction.user.id;
  const preferredModel = modelInput || userPreferredImageModel[userId] || defaultImgModel;

  if (modelInput) {
    userPreferredImageModel[userId] = modelInput;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle('Generating Image')
    .setDescription(`Generating your image with \`${preferredModel}\`, please wait... 🖌️`);
  await interaction.reply({ embeds: [embed], ephemeral: true });

  try {
    await generateAndSendImage(prompt, interaction);
  } catch (error) {
    console.error(error);
    await handleImageGenerationError(interaction, prompt);
    return;
  }
}

async function handleImageGenerationError(interaction, prompt) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription(`Sorry, the image could not be generated. Please try again later.\n> **Prompt:**\n\`\`\`\n${prompt.length > 3900 ? prompt.substring(0, 3900) + '...' : prompt}\n\`\`\``);
    const errorMsg = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
    await addSettingsButton(errorMsg);
  } catch (err) {
    console.error("Error sending error message: ", err);
  }
}

async function generateAndSendImage(prompt, interaction) {
  try {
    const { imageResult, enhancedPrompt } = await generateImageWithPrompt(prompt, interaction.user.id);
    const imageUrl = imageResult.images[0].url;
    const modelUsed = imageResult.modelUsed;
    const isGuild = interaction.guild !== null;
    const imageExtension = path.extname(imageUrl) || '.png';
    const attachment = new AttachmentBuilder(imageUrl, { name: `generated-image${imageExtension}` });
    
    const embed = new EmbedBuilder()
      .setColor(hexColour)
      .setAuthor({ name: `To ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`Here Is Your Generated Image\n**Original Prompt:**\n\`\`\`${prompt.length > 3900 ? prompt.substring(0, 3900) + '...' : prompt}\`\`\``)
      .addFields(
        { name: '**Generated by:**', value: `\`${interaction.user.displayName}\``, inline: true },
        { name: '**Model Used:**', value: `\`${modelUsed}\``, inline: true },
        { name: '**Prompt Enhancer:**', value: `\`${enhancedPrompt !== 'Disabled' ? 'Enabled' : 'Disabled'}\``, inline: true }
      )
      .setImage(`attachment://generated-image${imageExtension}`)
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

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Success')
        .setDescription('Custom Personality Instructions Saved!');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'custom-server-personality-modal') {
    try {
      const customInstructionsInput = interaction.fields.getTextInputValue('custom-server-personality-input');
      customInstructions[interaction.guild.id] = customInstructionsInput.trim();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Success')
        .setDescription('Custom Server Personality Instructions Saved!');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.log(error.message);
    }
  } else if (interaction.customId === 'text-speech-modal') {
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Generating Speech')
      .setDescription(`Generating your speech, please wait... 💽`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-speech-input');
      const outputUrl = await generateSpeechWithPrompt(text, userId, 'en');
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        await handleSuccessfulSpeechGeneration(interaction, text, "English", outputUrl);
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`Sorry, something went wrong or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
        await addSettingsButton(messageReference);
      }
    } catch (error) {
      console.log(error);
      try {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`Sorry, something went wrong or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
        await addSettingsButton(messageReference);
      } catch(error) {}
    }
  } else if (interaction.customId === 'text-music-modal') {
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Generating Music')
      .setDescription(`Generating your music, please wait... 🎧`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-music-input');
      const outputUrl = await generateMusicWithPrompt(text, userId);
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        await handleSuccessfulMusicGeneration(interaction, text, outputUrl);
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`Sorry, something went wrong or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
        await addSettingsButton(messageReference);
      }
    } catch (error) {
      console.log(error);
      try {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`Sorry, something went wrong or the output URL is not available.\n> **Text:**\n\`\`\`\n${text.length > 3900 ? text.substring(0, 3900) + '...' : text}\n\`\`\``);
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
        await addSettingsButton(messageReference);
      } catch(error) {}
    }
  } else if (interaction.customId === 'generate-image-modal') {
    const prompt = interaction.fields.getTextInputValue('image-prompt-input');
    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Generating Image')
      .setDescription(`Generating your image, please wait... 🖌️`);
    await interaction.reply({ embeds: [embed], ephemeral: true });

    try {
      await generateAndSendImage(prompt, interaction);
    } catch (error) {
      console.log(error);
      try {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`Sorry, could not generate the image. Please try again later.\n> **Prompt:**\n\`\`\`\n${prompt.length > 3900 ? prompt.substring(0, 3900) + '...' : prompt}\n\`\`\``);
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] });
        await addSettingsButton(messageReference);
      } catch(error) {}
    }
  }
}

async function changeImageModel(interaction) {
  try {
    const selectedModel = userPreferredImageModel[interaction.user.id] || defaultImgModel;

    // Create a select menu
    let selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-image-model')
      .setPlaceholder('Select Image Generation Model')
      .setMinValues(1)
      .setMaxValues(1);

    // Add options to select menu
    imgModels.forEach((model) => {
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

    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Select Image Generation Model')
      .setDescription('Select the model you want to use for image generation.');
    
    await interaction.reply({
      embeds: [embed],
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
    const unsupportedModels = [];
    if (!unsupportedModels.includes(selectedModel)) {
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

    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Select Image Generation Resolution')
      .setDescription('Select the resolution you want to use for image generation.');
    
    await interaction.reply({
      embeds: [embed],
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

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Select Speech Generation Model')
    .setDescription('Choose the model you want to use for speech generation.');
  
  await interaction.reply({
    embeds: [embed],
    components: actionRows,
    ephemeral: true
  });
}

const speechMusicModelFunctions = {
  '1': speechGen,
  'MusicGen': musicGen
};

async function handleImageSelectModel(interaction, model) {
  try {
    const userId = interaction.user.id;
    userPreferredImageModel[userId] = model;
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Model Selected')
      .setDescription(`Image Generation Model Selected: \`${model}\``);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function handleImageSelectResolution(interaction, resolution) {
  try {
    const userId = interaction.user.id;
    userPreferredImageResolution[userId] = resolution;
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Resolution Selected')
      .setDescription(`Image Generation Resolution Selected: \`${resolution}\``);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function handleSpeechSelectModel(interaction, model) {
  try {
    const userId = interaction.user.id;
    userPreferredSpeechModel[userId] = model;
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Model Selected')
      .setDescription(`Speech Generation Model Selected: \`${model}\``);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
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
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Prompt Enhancer Status')
      .setDescription(`Prompt Enhancer is now \`${newState}\`.`);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error(`Error toggling Prompt Enhancer: ${error.message}`);
  }
}

import { diffusionMaster } from './diffusionMasterPrompt.js';

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
              role: "system",
              content: diffusionMaster
            },
            {
              role: "user",
              content: prompt
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
        const codeBlockPattern = /```([^`]+)```/s;
        const match = content.match(codeBlockPattern);
        if (match) {
          content = match[1].trim();
        } else {
          throw new Error(`Enhanced prompt not found`);
        }
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
    const model = await genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", systemInstruction: { role: "system", parts: [{ text: diffusionMaster }] } });
    const result = await model.generateContent(prompt);
    return result.response.text();
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const textResponse = await Promise.race([
        generate(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);

      let content = textResponse;
      const codeBlockPattern = /```([^`]+)```/s;
      const match = content.match(codeBlockPattern);
      if (match) {
        content = match[1].trim();
      } else {
        throw new Error(`Enhanced prompt not found`);
      }
      return content;
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

    const generate = generateFunction === generateImage ?
      () => generateImage(finalPrompt, resolution, selectedModel) :
      () => generateFunction(finalPrompt, resolution);

    const imageResult = await retryOperation(generate, 3);

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
    const generateFunction = speechMusicModelFunctions[selectedModel];

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
    const generateFunction = speechMusicModelFunctions[selectedModel];

    if (!generateFunction) {
      throw new Error(`Unsupported music model: ${selectedModel}`);
    }
    return await retryOperation(() => generateFunction(prompt), 3);
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
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Chat History Cleared')
      .setDescription('Chat history cleared!');
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function alwaysRespond(interaction) {
  try {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    if (interaction.channel.type === ChannelType.DM) {
      const dmDisabledEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Feature Disabled in DMs')
        .setDescription('This feature is disabled in direct messages.');
      await interaction.reply({ embeds: [dmDisabledEmbed], ephemeral: true });
      return;
    }

    if (!activeUsersInChannels[channelId]) {
      activeUsersInChannels[channelId] = {};
    }

    if (activeUsersInChannels[channelId][userId]) {
      delete activeUsersInChannels[channelId][userId];
    } else {
      activeUsersInChannels[channelId][userId] = true;
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function handleRespondToAllCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const channelId = interaction.channelId;
    if (alwaysRespondChannels[channelId]) {
      delete alwaysRespondChannels[channelId];
      const stopRespondEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('Bot Response Disabled')
        .setDescription('The bot will now stop responding to all messages in this channel.');
      await interaction.reply({ embeds: [stopRespondEmbed], ephemeral: false });
    } else {
      alwaysRespondChannels[channelId] = true;
      const startRespondEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Bot Response Enabled')
        .setDescription('The bot will now respond to all messages in this channel.');
      await interaction.reply({ embeds: [startRespondEmbed], ephemeral: false });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function handleStatusCommand(interaction) {
  try {
    const initialEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('System Information')
      .setDescription('Fetching system information...')
      .setTimestamp();

    const message = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });
    await addSettingsButton(message);

    const updateMessage = async () => {
      try {
        const [{ totalMemMb, usedMemMb, freeMemMb, freeMemPercentage }, cpuPercentage] = await Promise.all([
          mem.info(),
          cpu.usage()
        ]);

        const now = new Date();
        const nextReset = new Date();
        nextReset.setHours(0, 0, 0, 0);
        if (nextReset <= now) {
          nextReset.setDate(now.getDate() + 1);
        }
        const timeLeftMillis = nextReset - now;
        const hours = Math.floor(timeLeftMillis / 3600000);
        const minutes = Math.floor((timeLeftMillis % 3600000) / 60000);
        const seconds = Math.floor((timeLeftMillis % 60000) / 1000);
        const timeLeft = `${hours}h ${minutes}m ${seconds}s`;

        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle('System Information')
          .addFields(
            { name: 'Memory (RAM)', value: `Total Memory: \`${totalMemMb}\` MB\nUsed Memory: \`${usedMemMb}\` MB\nFree Memory: \`${freeMemMb}\` MB\nPercentage Of Free Memory: \`${freeMemPercentage}\`%`, inline: true },
            { name: 'CPU', value: `Percentage of CPU Usage: \`${cpuPercentage}\`%`, inline: true },
            { name: 'Time Until Next Reset', value: timeLeft, inline: true }
          )
          .setTimestamp();

        await message.edit({ embeds: [embed] });
      } catch (error) {
        console.error('Error updating message:', error);
        clearInterval(interval);
      }
    };

    await updateMessage();

    const interval = setInterval(async () => {
      try {
        await updateMessage();
      } catch (error) {
        clearInterval(interval);
        console.error('Stopping updates due to error:', error);
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(interval);
    }, 30000);

  } catch (error) {
    console.error('Error in handleStatusCommand function:', error);
  }
}

function initializeBlacklistForGuild(guildId) {
  try {
    if (!blacklistedUsers[guildId]) {
      blacklistedUsers[guildId] = [];
    }
    if (!serverSettings[guildId]) {
      serverSettings[guildId] = defaultServerSettings;
    }
  } catch(error) {}
}

async function handleBlacklistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const userId = interaction.options.getUser('user').id;

    // Initialize blacklist for the guild if it doesn't exist
    if (!blacklistedUsers[interaction.guild.id]) {
      blacklistedUsers[interaction.guild.id] = [];
    }

    if (!blacklistedUsers[interaction.guild.id].includes(userId)) {
      blacklistedUsers[interaction.guild.id].push(userId);
      const blacklistedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('User Blacklisted')
        .setDescription(`<@${userId}> has been blacklisted.`);
      await interaction.reply({ embeds: [blacklistedEmbed] });
    } else {
      const alreadyBlacklistedEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('User Already Blacklisted')
        .setDescription(`<@${userId}> is already blacklisted.`);
      await interaction.reply({ embeds: [alreadyBlacklistedEmbed] });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function handleWhitelistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Command Not Available')
        .setDescription('This command cannot be used in DMs.');
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Admin Required')
        .setDescription('You need to be an admin to use this command.');
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const userId = interaction.options.getUser('user').id;

    // Ensure the guild's blacklist is initialized
    if (!blacklistedUsers[interaction.guild.id]) {
      blacklistedUsers[interaction.guild.id] = [];
    }

    const index = blacklistedUsers[interaction.guild.id].indexOf(userId);
    if (index > -1) {
      blacklistedUsers[interaction.guild.id].splice(index, 1);
      const removedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('User Whitelisted')
        .setDescription(`<@${userId}> has been removed from the blacklist.`);
      await interaction.reply({ embeds: [removedEmbed] });
    } else {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('User Not Found')
        .setDescription(`<@${userId}> is not in the blacklist.`);
      await interaction.reply({ embeds: [notFoundEmbed] });
    }
  } catch (error) {
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
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Empty Message')
        .setDescription('The message is empty..?');
      await interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
      return;
    }

    const filePath = path.resolve(__dirname, `message_content_${userId}.txt`);
    fs.writeFileSync(filePath, textContent, 'utf8');

    const attachment = new AttachmentBuilder(filePath, { name: 'message_content.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      const dmContentEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('Message Content Downloaded')
        .setDescription('Here is the content of the message.');
      await interaction.reply({ embeds: [dmContentEmbed], files: [attachment] });
    } else {
      try {
        await interaction.user.send({
          content: 'Here is the content of the message:',
          files: [attachment]
        });
        const dmSentEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Content Sent')
          .setDescription('The message content has been sent to your DMs.');
        await interaction.reply({ embeds: [dmSentEmbed], ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        const failDMEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Delivery Failed')
          .setDescription('Failed to send the content to your DMs.');
        await interaction.reply({ embeds: [failDMEmbed], files: [attachment], ephemeral: true });
      }
    }

    fs.unlinkSync(filePath); // Clean up the temp file.
  } catch (error) {
    console.log(`Failed to process download: ${error.message}`);
  }
}

async function downloadConversation(interaction) {
  try {
    const userId = interaction.user.id;
    const conversationHistory = chatHistories[userId];

    if (!conversationHistory || conversationHistory.length === 0) {
      const noHistoryEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('No History Found')
        .setDescription('No conversation history found.');
      await interaction.reply({ embeds: [noHistoryEmbed], ephemeral: true });
      return;
    }

    let conversationText = '';
    for (let i = 0; i < conversationHistory.length; i++) {
      const role = conversationHistory[i].role === 'user' ? '[User]' : '[Model]';
      const content = conversationHistory[i].content.map(c => c.text).join('\n');
      conversationText += `${role}:\n${content}\n\n`;
    }

    const tempFileName = path.join(__dirname, `${userId}_conversation.txt`);
    fs.writeFileSync(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, { name: 'conversation_history.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      const historyContentEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('Conversation History')
        .setDescription("Here's your conversation history:");
      await interaction.reply({ embeds: [historyContentEmbed], files: [file] });
    } else {
      try {
        await interaction.user.send({ content: "> `Here's your conversation history:`", files: [file] });
        const dmSentEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('History Sent')
          .setDescription('Your conversation history has been sent to your DMs.');
        await interaction.reply({ embeds: [dmSentEmbed], ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        const failDMEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Delivery Failed')
          .setDescription('Failed to send the conversation history to your DMs.');
        await interaction.reply({ embeds: [failDMEmbed], files: [file], ephemeral: true });
      }
    }

    // Clean up the temp file after sending.
    fs.unlinkSync(tempFileName);
  } catch (error) {
    console.log(`Failed to download conversation: ${error.message}`);
  }
}

async function removeCustomPersonality(interaction) {
  try {
    delete customInstructions[interaction.user.id];
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Removed')
      .setDescription('Custom personality instructions removed!');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleUrlUserPreference(interaction) {
  try {
    const userId = interaction.user.id;
    const currentPreference = getUrlUserPreference(userId);
    userPreferredUrlHandle[userId] = currentPreference === 'OFF' ? 'ON' : 'OFF';
    await handleSubButtonInteraction(interaction, true);
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
    await handleSubButtonInteraction(interaction, true);
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerWideChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Server Command Only')
        .setDescription('This command can only be used in a server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide chat history setting
    serverSettings[serverId].serverChatHistory = !serverSettings[serverId].serverChatHistory;
    const statusMessage = `Server-wide Chat History is now \`${serverSettings[serverId].serverChatHistory ? "enabled" : "disabled"}\``;

    let warningMessage = "";
    if (serverSettings[serverId].serverChatHistory && !serverSettings[serverId].customServerPersonality) {
      warningMessage = "\n\n⚠️ **Warning:** Enabling server-side chat history without enhancing server-wide personality management is not recommended. The bot may get confused between its personalities and conversations with different users.";
    }

    const embed = new EmbedBuilder()
      .setColor(serverSettings[serverId].serverChatHistory ? 0x00FF00 : 0xFF0000)
      .setTitle('Chat History Toggled')
      .setDescription(statusMessage + warningMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log('Error toggling server-wide chat history:', error.message);
  }
}

async function toggleServerPersonality(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Server Command Only')
        .setDescription('This command can only be used in a server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide personality setting
    serverSettings[serverId].customServerPersonality = !serverSettings[serverId].customServerPersonality;
    const statusMessage = `Server-wide Personality is now \`${serverSettings[serverId].customServerPersonality ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(serverSettings[serverId].customServerPersonality ? 0x00FF00 : 0xFF0000)
      .setTitle('Server Personality Toggled')
      .setDescription(statusMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log('Error toggling server-wide personality:', error.message);
  }
}

async function toggleServerResponsePreference(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Server Command Only')
        .setDescription('This command can only be used in a server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide response preference
    serverSettings[serverId].serverResponsePreference = !serverSettings[serverId].serverResponsePreference;
    const statusMessage = `Server-wide Response Following is now \`${serverSettings[serverId].serverResponsePreference ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(serverSettings[serverId].serverResponsePreference ? 0x00FF00 : 0xFF0000)
      .setTitle('Server Response Preference Toggled')
      .setDescription(statusMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log('Error toggling server-wide response preference:', error.message);
  }
}

async function toggleSettingSaveButton(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Server Command Only')
        .setDescription('This command can only be used in a server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide settings save button option
    serverSettings[serverId].settingsSaveButton = !serverSettings[serverId].settingsSaveButton;
    const statusMessage = `Server-wide "Settings and Save Button" is now \`${serverSettings[serverId].settingsSaveButton ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(serverSettings[serverId].settingsSaveButton ? 0x00FF00 : 0xFF0000)
      .setTitle('Settings Save Button Toggled')
      .setDescription(statusMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log('Error toggling server-wide settings save button:', error.message);
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
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Server Command Only')
        .setDescription('This command can only be used in a server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    if (serverSettings[serverId].serverChatHistory) {
      // Clear the server-wide chat history if it's enabled
      chatHistories[serverId] = [];
      const clearedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Chat History Cleared')
        .setDescription('Server-wide chat history cleared!');
      await interaction.reply({ embeds: [clearedEmbed], ephemeral: true });
    } else {
      // If chat history is disabled, inform the user
      const disabledEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('Feature Disabled')
        .setDescription('Server-wide chat history is disabled for this server.');
      await interaction.reply({ embeds: [disabledEmbed], ephemeral: true });
    }
  } catch (error) {
    console.log('Failed to clear server-wide chat history:', error.message);
  }
}

async function downloadServerConversation(interaction) {
  try {
    const guildId = interaction.guild.id;
    const conversationHistory = chatHistories[guildId];

    if (!conversationHistory || conversationHistory.length === 0) {
      const noHistoryEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('No History Found')
        .setDescription('No server-wide conversation history found.');
      await interaction.reply({ embeds: [noHistoryEmbed], ephemeral: true });
      return;
    }

    let conversationText = '';
    for (let i = 0; i < conversationHistory.length; i++) {
      const role = conversationHistory[i].role === 'user' ? '[User]' : '[Model]';
      const content = conversationHistory[i].content.map(c => c.text).join('\n');
      conversationText += `${role}:\n${content}\n\n`;
    }

    const tempFileName = path.join(__dirname, `${guildId}_server_conversation.txt`);
    fs.writeFileSync(tempFileName, conversationText, 'utf8');

    const file = new AttachmentBuilder(tempFileName, { name: 'server_conversation_history.txt' });

    if (interaction.channel.type === ChannelType.DM) {
      const historyContentEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('Server Conversation History')
        .setDescription("Here's the server-wide conversation history:");
      await interaction.reply({ embeds: [historyContentEmbed], files: [file] });
    } else {
      try {
        await interaction.user.send({ content: "> `Here's the server-wide conversation history:`", files: [file] });
        const dmSentEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('History Sent')
          .setDescription('Server-wide conversation history has been sent to your DMs.');
        await interaction.reply({ embeds: [dmSentEmbed], ephemeral: true });
      } catch (error) {
        console.error(`Failed to send DM: ${error}`);
        const failDMEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Delivery Failed')
          .setDescription('Failed to send the server-wide conversation history to your DMs.');
        await interaction.reply({ embeds: [failDMEmbed], files: [file], ephemeral: true });
      }
    }

    fs.unlinkSync(tempFileName); // Clean up the temporary file.
  } catch (error) {
    console.log(`Failed to download server conversation: ${error.message}`);
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
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Server Response Style Updated')
      .setDescription(`Server response style updated to: ${serverSettings[guildId].responseStyle}`);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function showSettings(interaction, edit = false) {
  try {
    if (interaction.guild) {
      initializeBlacklistForGuild(interaction.guild.id);
      if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Blacklisted')
          .setDescription('You are blacklisted and cannot use this interaction.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    const mainButtons = [
      { customId: 'clear-memory', label: 'Clear Memory', emoji: '🧹', style: ButtonStyle.Danger },
      { customId: 'general-settings', label: 'General Settings', emoji: '⚙️', style: ButtonStyle.Secondary },
      { customId: 'image-settings', label: 'Image Settings', emoji: '🖼️', style: ButtonStyle.Secondary },
      { customId: 'speech-settings', label: 'Speech Settings', emoji: '🎤', style: ButtonStyle.Secondary },
      { customId: 'music-settings', label: 'Music Settings', emoji: '🎵', style: ButtonStyle.Secondary },
    ];

    const mainButtonsComponents = mainButtons.map(config =>
      new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
    );

    const mainActionRow = new ActionRowBuilder().addComponents(...mainButtonsComponents);

    const embed = new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle('Settings')
      .setDescription('Please choose a category from the buttons below:');
    if (edit) {
      await interaction.update({ embeds: [embed], components: [mainActionRow], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], components: [mainActionRow], ephemeral: true });
    }
  } catch (error) {
    console.error('Error showing settings:', error.message);
  }
}

async function handleSubButtonInteraction(interaction, update = false) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;
  if (!activeUsersInChannels[channelId]) {
    activeUsersInChannels[channelId] = {};
  }
  const responseMode = getUserPreference(userId);
  const urlMode = getUrlUserPreference(userId);
  const subButtonConfigs = {
    'general-settings': [
      { customId: 'always-respond', label: `Always Respond: ${activeUsersInChannels[channelId][userId] ? 'ON' : 'OFF'}`, emoji: '↩️', style: ButtonStyle.Secondary },
      { customId: 'toggle-response-mode', label: `Toggle Response Mode: ${responseMode}`, emoji: '📝', style: ButtonStyle.Secondary },
      { customId: 'toggle-url-mode', label: `Toggle URL Mode: ${urlMode}`, emoji: '🌐', style: ButtonStyle.Secondary },
      { customId: 'download-conversation', label: 'Download Conversation', emoji: '🗃️', style: ButtonStyle.Secondary },
      ...(shouldDisplayPersonalityButtons ? [
        { customId: 'custom-personality', label: 'Custom Personality', emoji: '🙌', style: ButtonStyle.Primary },
        { customId: 'remove-personality', label: 'Remove Personality', emoji: '🤖', style: ButtonStyle.Danger },
      ] : []),
      { customId: 'back_to_main_settings', label: 'Back', emoji: '🔙', style: ButtonStyle.Secondary },
    ],
    'image-settings': [
      { customId: 'generate-image', label: 'Generate Image', emoji: '🎨', style: ButtonStyle.Primary },
      { customId: 'change-image-model', label: 'Change Image Model', emoji: '👨‍🎨', style: ButtonStyle.Secondary },
      { customId: 'toggle-prompt-enhancer', label: 'Toggle Prompt Enhancer', emoji: '🪄', style: ButtonStyle.Secondary },
      { customId: 'change-image-resolution', label: 'Change Image Resolution', emoji: '🖼️', style: ButtonStyle.Secondary },
      { customId: 'back_to_main_settings', label: 'Back', emoji: '🔙', style: ButtonStyle.Secondary },
    ],
    'speech-settings': [
      { customId: 'generate-speech', label: 'Generate Speech', emoji: '🎤', style: ButtonStyle.Primary },
      { customId: 'change-speech-model', label: 'Change Speech Model', emoji: '🔈', style: ButtonStyle.Secondary },
      { customId: 'back_to_main_settings', label: 'Back', emoji: '🔙', style: ButtonStyle.Secondary },
    ],
    'music-settings': [
      { customId: 'generate-music', label: 'Generate Music', emoji: '🎹', style: ButtonStyle.Primary },
      { customId: 'back_to_main_settings', label: 'Back', emoji: '🔙', style: ButtonStyle.Secondary },
    ],
  };

  if (update || subButtonConfigs[interaction.customId]) {
    const subButtons = subButtonConfigs[update ? 'general-settings' : interaction.customId].map(config =>
      new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
    );

    const actionRows = [];
    while (subButtons.length > 0) {
      actionRows.push(new ActionRowBuilder().addComponents(subButtons.splice(0, 5)));
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00FFFF)
          .setTitle(`${update ? 'General Settings' : interaction.customId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`)
          .setDescription('Please choose an option from the buttons below:'),
      ],
      components: actionRows,
      ephemeral: true,
    });
  }
}

async function showDashboard(interaction) {
  if (interaction.channel.type === ChannelType.DM) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Command Restricted')
      .setDescription('This command cannot be used in DMs.');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Administrator Required')
      .setDescription('You need to be an admin to use this command.');
    return interaction.reply({ embeds: [embed], ephemeral: true });
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
  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Settings')
    .setDescription('Your Server Settings:');
  await interaction.reply({
    embeds: [embed],
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

// Function to get user preference
function getUserPreference(userId) {
  return userResponsePreference[userId] || defaultResponseFormat;
}

function getUrlUserPreference(userId) {
  return userPreferredUrlHandle[userId] || defaultUrlReading;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const safetySettings = [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, ];

// <==========>



// <=====[Model Response Handling]=====>

async function handleModelResponse(initialBotMessage, chat, parts, originalMessage, typingInterval) {
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
  let botMessage;
  if (!initialBotMessage) {
    clearInterval(typingInterval);
    botMessage = await originalMessage.reply({ content: 'Let me think..', components: [row] });
  } else {
    botMessage = initialBotMessage;
  await botMessage.edit({components: [row] });
  }

  let stopGeneration = false;

  const filter = (interaction) => interaction.customId === 'stopGenerating' && interaction.user.id === originalMessage.author.id;

  const collector = botMessage.createMessageComponentCollector({ filter, time: 300000 });

  try {
    collector.on('collect', async (interaction) => {
      if (interaction.user.id === originalMessage.author.id) {
        try {
          const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Response Stopped')
            .setDescription('Response generation stopped by the user.');
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
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
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error('Error sending unauthorized reply:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error creating or handling collector:', error);
  }

  const updateMessage = async () => {
    if (stopGeneration) {
      return;
    }
    if (tempResponse.trim() === "") {
      await botMessage.edit({ content: '...' });
    } else if (userPreference === 'embedded') {
      await updateEmbed(botMessage, tempResponse, originalMessage);
    } else {
      await botMessage.edit({ content: tempResponse, embeds: [] });
    }
    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  while (attempts > 0 && !stopGeneration) {
    try {
      const messageResult = await chat.sendMessageStream(parts);
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
            const embed = new EmbedBuilder()
              .setColor(0xFFFF00)
              .setTitle('Response Overflow')
              .setDescription('The response got too large, will be sent as a text file once it is completed.');
            
            await botMessage.edit({ embeds: [embed] });
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
      updateChatHistory(isServerChatHistoryEnabled ? originalMessage.guild.id : userId, parts, finalResponse);
      break;
    } catch (error) {
      if (activeRequests.has(userId)) {
        activeRequests.delete(userId);
      }
      console.error(error);
      attempts--;
    
      if (attempts === 0 || stopGeneration) {
        if (!stopGeneration) {
          if (SEND_RETRY_ERRORS_TO_DISCORD) {
            const embed = new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Generation Failure')
              .setDescription(`All Generation Attempts Failed :(\n\`\`\`${error.message}\`\`\``);
            const errorMsg = await originalMessage.channel.send({ content: `<@${originalMessage.author.id}>`, embeds: [embed] });
            await addSettingsButton(errorMsg);
            await addSettingsButton(botMessage);
          } else {
            const simpleErrorEmbed = new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Bot Overloaded')
              .setDescription('Something seems off, the bot might be overloaded! :(');
            const errorMsg = await originalMessage.channel.send({ content: `<@${originalMessage.author.id}>`, embeds: [simpleErrorEmbed] });
            await addSettingsButton(errorMsg);
            await addSettingsButton(botMessage);
          }
        }
        break;
      } else if (SEND_RETRY_ERRORS_TO_DISCORD) {
        const errorMsg = await originalMessage.channel.send({ content: `<@${originalMessage.author.id}>`,
          embeds: [new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('Retry in Progress')
            .setDescription(`Generation Attempts Failed, Retrying..\n\`\`\`${error.message}\`\`\``)]
        });
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
      .setColor(hexColour)
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

function getHistory(id) {
  const history = chatHistories[id] || [];
  return history.map(entry => {
    return {
      role: entry.role === 'assistant' ? 'model' : entry.role,
      parts: entry.content
    };
  });
}

function updateChatHistory(id, userMessage, modelResponse) {
  if (!chatHistories[id]) {
    chatHistories[id] = [];
  }

  chatHistories[id].push({
    role: 'user',
    content: userMessage,
  });

  chatHistories[id].push({
    role: 'assistant',
    content: [{ text: modelResponse }],
  });
}

// <==========>



// <=====[Gen Function Handling]=====>

async function retryOperation(fn, maxRetries, delayMs = 1000) {
  let error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`Attempt ${attempt} failed: ${err.message}`);
      error = err;
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs}ms before next attempt...`);
        await delay(delayMs);
      } else {
        console.log(`All ${maxRetries} attempts failed.`);
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
}

const nsfwWordsArray = JSON.parse(fs.readFileSync('nsfwWords.json', 'utf-8'));

function filterPrompt(text) {
  nsfwWordsArray.forEach(word => {
    const regexPattern = new RegExp(word.split('').join('\\W*'), 'gi');
    text = text.replace(regexPattern, '');
  });
  return text;
}

// <==========>

client.login(token);
