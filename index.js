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
  REST,
  Routes,
} = require('discord.js');
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const { writeFile, unlink } = require('fs/promises');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pdf = require('pdf-parse');
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
const chatHistories = {};
const activeUsersInChannels = {};
const customInstructions = {};
const userPreferredImageModel = {};
const userPreferredSpeechModel = {};
const userResponsePreference = {};
const activeRequests = new Set();
const alwaysRespondChannels = {};
const token = process.env.DISCORD_BOT_TOKEN;

const activities = [
    { name: 'With Code', type: ActivityType.Playing },
    { name: 'Something', type: ActivityType.Listening },
    { name: 'You', type: ActivityType.Watching }
    // Add more activities as desired
];

let activityIndex = 0;

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Define the Slash Command
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
            { name: 'SD-XL-Alt', value: 'SD-XL-Alt' },
            { name: 'Stable-Cascade', value: 'Stable-Cascade' },
            { name: 'PlaygroundAI', value: 'PlaygroundAI' },
            { name: 'PlaygroundAI-Alt', value: 'PlaygroundAI-Alt' },
            { name: 'Kandinsky', value: 'Kandinsky' },
            { name: 'Proteus-v0.4', value: 'Proteus-v0.4' }
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
      .setName('speech')
      .setDescription('Generate speech from text.')
      .addStringOption(option =>
        option.setName('language')
          .setDescription('The language to use.')
          .setRequired(true)
          .addChoices(
            { name: 'English', value: 'en' },
            { name: 'Spanish', value: 'es' },
            { name: 'French', value: 'fr' },
            { name: 'German', value: 'de' },
            { name: 'Italian', value: 'it' },
            { name: 'Portuguese', value: 'pt' },
            { name: 'Polish', value: 'pl' },
            { name: 'Turkish', value: 'tr' },
            { name: 'Russian', value: 'ru' },
            { name: 'Dutch', value: 'nl' },
            { name: 'Czech', value: 'cs' },
            { name: 'Arabic', value: 'ar' },
            { name: 'Chinese', value: 'zh' },
            { name: 'Hungarian', value: 'hu' },
            { name: 'Korean', value: 'ko' },
            { name: 'Hindi', value: 'hi' }
          )
      )
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The text prompt to generate the speech from.')
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  // Register the command
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
  
  // Set the initial status
  client.user.setPresence({
    activities: [activities[activityIndex]],
    status: 'idle',
  });

  // Change the activity every 30000ms
  setInterval(() => {
    activityIndex = (activityIndex + 1) % activities.length;
    client.user.setPresence({
      activities: [activities[activityIndex]],
      status: 'idle',
    });
  }, 30000);
});

client.on('messageCreate', async (message) => {
  try {
    // Prevents the bot from responding to its own messages
    if (message.author.bot) return;

    // Checks if the bot is required to reply in the channel, if mentioned, or in DMs
    const isDM = message.channel.type === ChannelType.DM;
    const isBotMentioned = message.mentions.users.has(client.user.id);
    const shouldAlwaysRespond = alwaysRespondChannels[message.channelId];
    const isUserActiveInChannel = activeUsersInChannels[message.channelId]?.[message.author.id] || isDM;

    if (isUserActiveInChannel || (isBotMentioned && !isDM) || shouldAlwaysRespond) {
      if (message.content.toLowerCase().startsWith(`<@${client.user.id}>generate`) || message.content.toLowerCase().startsWith(`<@${client.user.id}> generate`) || message.content.toLowerCase().startsWith('generate') || message.content.toLowerCase().startsWith(`<@${client.user.id}>imagine`) || message.content.toLowerCase().startsWith(`<@${client.user.id}> imagine`) || message.content.toLowerCase().startsWith('imagine')) {
        const prompt = message.content
          .toLowerCase()
          .replace(new RegExp(`<@${client.user.id}> generate`), '')
          .replace(new RegExp(`<@${client.user.id}>generate`), '')
          .replace('generate', '')
          .replace(new RegExp(`<@${client.user.id}> imagine`), '')
          .replace(new RegExp(`<@${client.user.id}>imagine`), '')
          .replace('imagine', '')
          .trim();
        if (prompt) {
          await genimg(prompt, message);
        } else {
          await message.channel.send("> `Please provide a valid prompt.`");
        }
      } else if (activeRequests.has(message.author.id)) {
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
    console.error('Error processing the message:', error);
    await message.reply('Sorry, something went wrong!');
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

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  if (interaction.commandName === 'respondtoall') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You need to be an admin to use this command.', ephemeral: true });
    }
  
    const channelId = interaction.channelId;
  
    // Toggle functionality
    if (alwaysRespondChannels[channelId]) {
      // It's currently on, so turn it off.
      delete alwaysRespondChannels[channelId];
      await interaction.reply({ content: '> **The bot will now stop** responding to all messages in this channel.', ephemeral: false });
    } else {
      // It's currently off, so turn it on.
      alwaysRespondChannels[channelId] = true;
      await interaction.reply({ content: '> **The bot will now respond** to all messages in this channel.', ephemeral: false });
    }
  } else if (interaction.commandName === 'imagine') {
    const model = interaction.options.getString('model');
    const prompt = interaction.options.getString('prompt');

    await genimgslash(prompt, model, interaction);
  } else if (interaction.commandName === 'clear') {
    await clearChatHistory(interaction);
  } else if (interaction.commandName === 'speech') {
    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your speech, please wait... 💽` });
    try {
      const userId = interaction.user.id;
      const text = interaction.options.getString('prompt');
      const language = interaction.options.getString('language');
      const outputUrl = await generateSpeechWithPrompt(text, userId, language);
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        const file = new AttachmentBuilder(outputUrl).setName('speech.wav');
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🎙️ **Speech Generated!**')
          .setDescription(`Here Is Your Generated Speech:\n**Prompt:**\n\`\`\`${text}\`\`\``)
          .addFields(
            { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true },
            { name: '**Language Used:**', value: `\`${language}\``, inline: true }
          )
          .setTimestamp()

        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed],  files: [file] });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } else {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      }
    } catch (error) {
      console.log(error)
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    }
  }
});

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
    } else if (interaction.customId === 'change-image-model') {
      await changeImageModel(interaction);
    } else if (interaction.customId.startsWith('select-image-model-')) {
      const selectedModel = interaction.customId.replace('select-image-model-', '');
      await handleImageSelectModel(interaction, selectedModel);
    } else if (interaction.customId.startsWith('select-speech-model-')) {
      const selectedModel = interaction.customId.replace('select-speech-model-', '');
      await handleSpeechSelectModel(interaction, selectedModel);
    } else if (interaction.customId === 'toggle-response-mode') {
      await toggleUserPreference(interaction);
    } else if (interaction.isButton() && interaction.customId === 'generate-speech') {
      await processSpeechGet(interaction)
    } else if (interaction.customId === 'change-speech-model') {
      await changeSpeechModel(interaction);
    } else if (interaction.customId === 'download-conversation') {
      await downloadConversation(interaction);
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
        .setMaxLength(900)
      )
    );

  await interaction.showModal(modal);
}

async function fetchImageAsBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch the image: ${response.statusText}`);
  const buffer = await response.buffer();
  return buffer;
}

async function genimg(prompt, message) {
  const generatingMsg = await message.reply({ content: `Generating your image, please wait... 🖌️` });

  try {
    const imageResult = await generateImageWithPrompt(prompt, message.author.id);
    const imageUrl = imageResult.images[0].url; 
    const modelUsed = imageResult.modelUsed;
    
    const imageBuffer = await fetchImageAsBuffer(imageUrl);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated-image.png' });
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('✨ **Image Generated!**')
      .setDescription(`Here Is Your Generated Image:`)
      .addFields(
        { name: '**Prompt**', value: `\`\`\`${prompt}\`\`\``, inline: false },
        { name: '**Generated by**', value: `\`${message.author.displayName}\``, inline: true },
        { name: '**Model Used**', value: `\`${modelUsed}\``, inline: true },
      )
      .setImage('attachment://generated-image.png')
      .setTimestamp()
  
    const messageReference = await message.reply({ content: null, embeds: [embed], files: [attachment] });
    await addSettingsButton(messageReference);
    await generatingMsg.delete();
  } catch (error) {
    console.error(error);
    const messageReference = await message.reply({ content: `Sorry, could not generate the image. Please try again later.` });
    await addSettingsButton(messageReference);
    await generatingMsg.delete();
  }
}

async function genimgslash(prompt, model, interaction) {
  const generatingMsg = await interaction.reply({ content: `Generating your image with ${model}, please wait... 🖌️` });
  userPreferredImageModel[interaction.user.id] = model;
  
  try {
    const imageResult = await generateImageWithPrompt(prompt, interaction.user.id);
    const imageUrl = imageResult.images[0].url;
    const modelUsed = imageResult.modelUsed;
    
    const imageBuffer = await fetchImageAsBuffer(imageUrl);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated-image.png' });
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('✨ **Image Generated!**')
      .setDescription(`Here Is Your Generated Image:`)
      .addFields(
        { name: '**Prompt**', value: `\`\`\`${prompt}\`\`\``, inline: false },
        { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true },
        { name: '**Model Used**', value: `\`${modelUsed}\``, inline: true },
      )
      .setImage('attachment://generated-image.png')
      .setTimestamp()

    const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [attachment]  });
    await addSettingsButton(messageReference);
    await generatingMsg.delete();
  } catch (error) {
    console.log(error);
    const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, the image could not be generated. Please try again later.` });
    await addSettingsButton(messageReference);
    await generatingMsg.delete();
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'custom-personality-modal') {
    const customInstructionsInput = interaction.fields.getTextInputValue('custom-personality-input');
    customInstructions[interaction.user.id] = customInstructionsInput.trim();

    await interaction.reply({ content: '> Custom personality instructions saved!' });

    setTimeout(() => interaction.deleteReply(), 10000); // Delete after 10 seconds
  } else if (interaction.customId === 'text-speech-modal') {
    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your speech, please wait... 💽` });
    try {
      const userId = interaction.user.id;
      const text = interaction.fields.getTextInputValue('text-speech-input');
      const outputUrl = await generateSpeechWithPrompt(text, userId, 'en');
      if (outputUrl && outputUrl !== 'Output URL is not available.') {
        const file = new AttachmentBuilder(outputUrl).setName('speech.wav');
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🎙️ **Speech Generated!**')
          .setDescription(`Here Is Your Generated Speech:\n**Prompt:**\n\`\`\`${text}\`\`\``)
          .addFields(
            { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true }
          )
          .setTimestamp()
  
        const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed],  files: [file] });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      } else {
        const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
        await addSettingsButton(messageReference);
        await generatingMsg.delete();
      }
    } catch (error) {
      console.log(error)
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, something went wrong or the output URL is not available.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    }
  } else if (interaction.customId === 'generate-image-modal') {
    const prompt = interaction.fields.getTextInputValue('image-prompt-input');

    const generatingMsg = await interaction.reply({ content: `${interaction.user}, generating your image, please wait... 🖌️` });

    try {
      const imageResult = await generateImageWithPrompt(prompt, interaction.user.id);
      const imageUrl = imageResult.images[0].url;
      const modelUsed = imageResult.modelUsed;
      
      const imageBuffer = await fetchImageAsBuffer(imageUrl);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated-image.png' });
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('✨ **Image Generated!**')
        .setDescription(`Here Is Your Generated Image:`)
        .addFields(
          { name: '**Prompt**', value: `\`\`\`${prompt}\`\`\``, inline: false },
          { name: '**Generated by**', value: `\`${interaction.user.displayName}\``, inline: true },
          { name: '**Model Used**', value: `\`${modelUsed}\``, inline: true },
        )
        .setImage('attachment://generated-image.png')
        .setTimestamp()

      const messageReference = await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed], files: [attachment]  });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
    } catch (error) {
      const messageReference = await interaction.channel.send({ content: `${interaction.user}, sorry, could not generate the image. Please try again later.` });
      await addSettingsButton(messageReference);
      await generatingMsg.delete();
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

async function downloadConversation(interaction) {
  const userId = interaction.user.id;
  const conversationHistory = chatHistories[userId];

  // Check if there's a conversation history for the user
  if (!conversationHistory || conversationHistory.length === 0) {
    await interaction.reply({ content: '> No conversation history found.', ephemeral: true });
    return;
  }

  // Format the conversation history
  let conversationText = '';
  for (let i = 0; i < conversationHistory.length; i++) {
    const speaker = i % 2 === 0 ? '[User]' : '[Model]';
    conversationText += `${speaker}:\n${conversationHistory[i]}\n\n`;
  }

  // Create a temporary file to hold the conversation text
  const tempFileName = path.join(__dirname, `${userId}_conversation.txt`);
  fs.writeFileSync(tempFileName, conversationText, 'utf8');

  // Create an attachment from the temporary file
  const file = new AttachmentBuilder(tempFileName, { name: 'conversation_history.txt' });

  // Reply with the file
  await interaction.reply({ content: '> Here\'s your conversation history:', files: [file], ephemeral: true }).then(() => {
    // Cleanup: Remove the temporary file after sending it
    fs.unlinkSync(tempFileName);
  }).catch(console.error);
}

async function showSettings(interaction) {
  const clearButton = new ButtonBuilder()
    .setCustomId('clear')
    .setLabel('Clear Memory')
    .setEmoji('🧹')
    .setStyle(ButtonStyle.Danger);

  const toggleChatButton = new ButtonBuilder()
    .setCustomId('always-respond')
    .setLabel('Always Respond')
    .setEmoji('↩️')
    .setStyle(ButtonStyle.Secondary);

  const customPersonalityButton = new ButtonBuilder()
    .setCustomId('custom-personality')
    .setLabel('Custom Personality')
    .setEmoji('🙌')
    .setStyle(ButtonStyle.Primary);

  const removePersonalityButton = new ButtonBuilder()
    .setCustomId('remove-personality')
    .setLabel('Remove Personality')
    .setEmoji('🤖')
    .setStyle(ButtonStyle.Danger);

  const generateImageButton = new ButtonBuilder()
    .setCustomId('generate-image')
    .setLabel('Generate Image')
    .setEmoji('🎨')
    .setStyle(ButtonStyle.Primary);

  const imageToggleButton = new ButtonBuilder()
    .setCustomId('change-image-model')
    .setLabel('Change Image Model')
    .setEmoji('👨‍🎨')
    .setStyle(ButtonStyle.Secondary);
    
  const userResponseToggle = new ButtonBuilder()
    .setCustomId('toggle-response-mode')
    .setLabel('Toggle Response Mode')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);
    
  const generateAudioButton = new ButtonBuilder()
    .setCustomId('generate-speech')
    .setLabel('Generate Speech')
    .setEmoji('🎤')
    .setStyle(ButtonStyle.Primary);
    
  const speechToggleButton = new ButtonBuilder()
    .setCustomId('change-speech-model')
    .setLabel('Change Speech Model')
    .setEmoji('🔈')
    .setStyle(ButtonStyle.Secondary);
    
  const downloadConversation = new ButtonBuilder()
    .setCustomId('download-conversation')
    .setLabel('Download Conversation')
    .setEmoji('🗃️')
    .setStyle(ButtonStyle.Secondary);

  // Split settings into multiple action rows if there are more than 5 buttons
  const actionRows = [];
  const allButtons = [clearButton, toggleChatButton, customPersonalityButton, removePersonalityButton, generateImageButton, imageToggleButton, userResponseToggle, generateAudioButton, speechToggleButton, downloadConversation];

  while (allButtons.length > 0) {
    const actionRow = new ActionRowBuilder().addComponents(allButtons.splice(0, 5));
    actionRows.push(actionRow);
  }

  await interaction.reply({
    content: '> ```Settings:```',
    components: actionRows
  });
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
    .setMaxLength(4000);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

async function speechGen(prompt) {
  const sessionHash = "test123";
  const urlFirstRequest = 'https://mrfakename-melotts.hf.space/queue/join?';
  const dataFirstRequest = {
    data: ["EN-US", prompt, 1, "EN"],
    event_data: null,
    fn_index: 1,
    trigger_id: 8,
    session_hash: sessionHash
  };

  try {
    const responseFirst = await axios.post(urlFirstRequest, dataFirstRequest);
    console.log(responseFirst.data);
  } catch (error) {
    console.error("Error in the first request:", error);
    return null;
  }

  const urlSecondRequest = `https://mrfakename-melotts.hf.space/queue/data?session_hash=${sessionHash}`;

  // Return a new Promise that resolves with the URL when found
  return new Promise((resolve, reject) => {
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
                const fullUrl = dataDict.output.data[0].url;
                console.log(fullUrl);
                resolve(fullUrl); // Resolve the promise with the URL
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
  });
}

async function speechGen2(prompt) {
  const sessionHash = "test123";
  const joinQueueUrl = `https://styletts2-styletts2.hf.space/queue/join?fn_index=1&session_hash=${sessionHash}`;
  const response = new EventSource(joinQueueUrl);

  return new Promise((resolve, reject) => {
    response.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.msg === "send_data") {
        const eventId = data.event_id;
        console.log("Event ID:", eventId);
        // Send data
        const urlSecondRequest = 'https://styletts2-styletts2.hf.space/queue/data';
        const data2request = {
          "data": [prompt, "m-us-2", 5],
          "event_data": null,
          "fn_index": 1,
          "trigger_id": 8,
          "session_hash": sessionHash,
          "event_id": eventId
        };
        try {
          const response = await axios.post(urlSecondRequest, data2request);
        } catch (error) {
          console.error("Error sending data:", error.message);
          reject(error);
        }
      } else if (data.msg === "process_completed") {
        response.close(); // Stop listening for events
        const imagePath = data.output.data[0].path;
        if (imagePath !== "Path not found") {
          const fullUrl = `https://styletts2-styletts2.hf.space/--replicas/w0t4o/file=${imagePath}`;
          console.log(fullUrl);
          resolve(fullUrl);
        } else {
          reject(new Error("Path not found"));
        }
      }
    };

    response.onerror = (error) => {
      console.error("EventSource failed:", error);
      response.close();
      reject(error);
    };
  });
}

async function speechGen3(text, language) {
  try {
    const url = 'https://replicate.com/api/predictions';
    const payload = {
      input: {
        text: text,
        speaker: 'https://replicate.delivery/pbxt/Jt79w0xsT64R1JsiJ0LQRL8UcWspg5J4RFrU6YwEKpOT1ukS/male.wav',
        language: language,
        cleanup_voice: false
      },
      is_training: false,
      create_model: '0',
      stream: false,
      version: '684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e'
    };
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Start the prediction
    const response = await axios.post(url, payload, { headers });
    const predictionId = response.data.id;

    let outputUrl = null;
    while (!outputUrl) {
      const statusResponse = await axios.get(`https://replicate.com/api/predictions/${predictionId}`);
      const data = statusResponse.data;
      if (data.completed_at !== null) {
        outputUrl = data.output ? data.output : 'Output URL is not available.';
        break;
      }
      // Wait for 1 second before making another status check.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return outputUrl;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}

async function changeSpeechModel(interaction) {
  // Create buttons for each model
  const buttons = [
    new ButtonBuilder().setCustomId('select-speech-model-1').setLabel('1').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-speech-model-2').setLabel('2').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-speech-model-3').setLabel('3').setStyle(ButtonStyle.Primary)
  ];

  // Split buttons into multiple ActionRows if there are more than 5 buttons
  const actionRows = [];
  while (buttons.length > 0) {
    const actionRow = new ActionRowBuilder().addComponents(buttons.splice(0, 5));
    actionRows.push(actionRow);
  }

  // Reply with the message prompting user to select an image generation model
  await interaction.reply({
    content: '> `Select Speech Generation Model:`',
    components: actionRows,
    ephemeral: true,
  });
}

async function handleSpeechSelectModel(interaction, model) {
  const userId = interaction.user.id;
  userPreferredSpeechModel[userId] = model;
  await interaction.reply({ content: `**Speech Generation Model Selected**: ${model}`, ephemeral: true });
}

async function generateSpeechWithPrompt(prompt, userId, language) {
  try {
    const selectedModel = userPreferredSpeechModel[userId] || "1";

    if (selectedModel === "1") {
      return await speechGen(prompt);
    } else if (selectedModel === "2") {
      return await speechGen2(prompt);
    } else if (selectedModel === "3") {
      return await speechGen3(prompt, language);
    }
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Could not generate image');
  }
}

async function changeImageModel(interaction) {
  // Create buttons for each model
  const buttons = [
    new ButtonBuilder().setCustomId('select-image-model-SD-XL').setLabel('SD-XL').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-SD-XL-Alt').setLabel('SD-XL-Alt').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-Stable-Cascade').setLabel('Stable-Cascade').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-PlaygroundAI').setLabel('PlaygroundAI').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-PlaygroundAI-Alt').setLabel('PlaygroundAI-Alt').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-Kandinsky').setLabel('Kandinsky').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select-image-model-Proteus-v0.4').setLabel('Proteus-v0.4').setStyle(ButtonStyle.Primary),
  ];

  // Split buttons into multiple ActionRows if there are more than 5 buttons
  const actionRows = [];
  while (buttons.length > 0) {
    const actionRow = new ActionRowBuilder().addComponents(buttons.splice(0, 5));
    actionRows.push(actionRow);
  }

  // Reply with the message prompting user to select an image generation model
  await interaction.reply({
    content: '> `Select Image Generation Model:`',
    components: actionRows,
    ephemeral: true,
  });
}

async function handleImageSelectModel(interaction, model) {
  const userId = interaction.user.id;
  userPreferredImageModel[userId] = model; 
  await interaction.reply({ content: `**Image Generation Model Selected**: ${model}`, ephemeral: true });
}

async function generateImageWithPrompt(prompt, userId) {
  try {
    const selectedModel = userPreferredImageModel[userId] || "SD-XL";

    if (selectedModel === "Stable-Cascade") {
      return await generateWithSC(prompt);
    } else if (selectedModel === "SD-XL") {
      return await generateWithSDXL(prompt);
    } else if (selectedModel === "SD-XL-Alt") {
      return await generateWithSDXLAlt(prompt);
    } else if (selectedModel === "Kandinsky") {
      return await generateWithKandinsky(prompt);
    } else if (selectedModel === "PlaygroundAI") {
      return await generateWithPlaygroundAI(prompt);
    } else if (selectedModel === "PlaygroundAI-Alt") {
      return await generateWithPlaygroundAIAlt(prompt);
    } else if (selectedModel === "Proteus-v0.4") {
      return await generateWithProteus4(prompt);
    }
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Could not generate image');
  }
}

function generateWithSC(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://ehristoforu-stable-cascade.hf.space";
    let session_hash = 'test123';

    // Define the first request URL and data
    const urlFirstRequest = `${url}/queue/join?`;
    const dataFirstRequest = {
      "data": [prompt, "nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image", 1024, 1024, false],
      "event_data": null,
      "fn_index": 0,
      "trigger_id": 4,
      "session_hash": session_hash
    };

    axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {
      console.log(responseFirst.data);

      const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

      const eventSource = new EventSource(urlSecondRequest);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.msg === "process_completed") {
          eventSource.close();
          const image_path = data.output.data[0][0].image.path;
          const full_url = `${url}/file=${image_path}`;
          console.log(full_url);

          resolve({ images: [{ url: full_url }], modelUsed: "Stable Cascade" });
        }
      };

      // In case of an error with EventSource, you may also want to reject the promise
      eventSource.onerror = (error) => {
        eventSource.close();
        console.error("EventSource Error:", error);
        reject(error);
      };

    }).catch(error => {
      console.error("Error:", error);
      reject(error); // Reject the promise if the first request fails
    });
  });
}

function generateWithPlaygroundAI(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://replicate.com/api/predictions";
    const payload = {
      "input": {
        "width": 1024,
        "height": 1024,
        "prompt": prompt,
        "scheduler": "DPMSolver++",
        "num_outputs": 1,
        "guidance_scale": 6,
        "apply_watermark": true,
        "negative_prompt": "nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
        "prompt_strength": 0.8,
        "num_inference_steps": 50
      },
      "is_training": false,
      "create_model": "0",
      "stream": false,
      "version": "419269784d9e00c56e5b09747cfc059a421e0c044d5472109e129b746508c365"
    };

    const headers = {
      "Content-Type": "application/json"
    };

    axios.post(url, payload, { headers })
      .then(response => {
        const predictionId = response.data.id;
        const urlWithId = `https://replicate.com/api/predictions/${predictionId}`;

        // Polling for the prediction result
        const checkPrediction = () => {
          axios.get(urlWithId)
            .then(res => {
              const data = res.data;
              if (data.completed_at) {
                const outputUrl = data.output;
                if (outputUrl) {
                  resolve({ images: [{ url: outputUrl[0] }], modelUsed: "PlaygroundAI" });
                } else {
                  reject(new Error("Output URL is not available."));
                }
              } else {
                setTimeout(checkPrediction, 1000);
              }
            })
            .catch(error => {
              console.error("Error:", error);
              reject(error);
            });
        };
        checkPrediction();
      })
      .catch(error => {
        console.error("Error:", error);
        reject(error);
      });
  });
}

function generateWithPlaygroundAIAlt(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://ap123-playground-v2-5.hf.space";
    let session_hash = 'test123';

    // Define the first request URL and data
    const urlFirstRequest = `${url}/queue/join?`;
    const dataFirstRequest = {
      "data": [prompt, 50, 6],
      "event_data": null,
      "fn_index": 0,
      "trigger_id": 10,
      "session_hash": session_hash
    };

    axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {
      console.log(responseFirst.data);

      const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

      const eventSource = new EventSource(urlSecondRequest);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.msg === "process_completed") {
          eventSource.close();
          const full_url = data["output"]["data"][0]["url"];
          console.log(full_url);

          resolve({ images: [{ url: full_url }], modelUsed: "PlaygroundAI-Alt" });
        }
      };

      // In case of an error with EventSource, you may also want to reject the promise
      eventSource.onerror = (error) => {
        eventSource.close();
        console.error("EventSource Error:", error);
        reject(error);
      };

    }).catch(error => {
      console.error("Error:", error);
      reject(error); // Reject the promise if the first request fails
    });
  });
}

function generateWithProteus4(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://replicate.com/api/predictions";
    const payload = {
      "input": {
        "width": 1024,
        "height": 1024,
        "prompt": prompt,
        "scheduler": "DPM++2MSDE",
        "num_outputs": 1,
        "guidance_scale": 6,
        "apply_watermark": true,
        "negative_prompt": "nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
        "prompt_strength": 0.8,
        "num_inference_steps": 50
      },
      "is_training": false,
      "create_model": "0",
      "stream": false,
      "version": "34a427535a3c45552b94369280b823fcd0e5c9710e97af020bf445c033d4569e"
    };

    const headers = {
      "Content-Type": "application/json"
    };

    axios.post(url, payload, { headers })
      .then(response => {
        const predictionId = response.data.id;
        const urlWithId = `https://replicate.com/api/predictions/${predictionId}`;

        // Polling for the prediction result
        const checkPrediction = () => {
          axios.get(urlWithId)
            .then(res => {
              const data = res.data;
              if (data.completed_at) {
                const outputUrl = data.output;
                if (outputUrl) {
                  resolve({ images: [{ url: outputUrl[0] }], modelUsed: "Proteus-v0.4" });
                } else {
                  reject(new Error("Output URL is not available."));
                }
              } else {
                setTimeout(checkPrediction, 1000);
              }
            })
            .catch(error => {
              console.error("Error:", error);
              reject(error);
            });
        };
        checkPrediction();
      })
      .catch(error => {
        console.error("Error:", error);
        reject(error);
      });
  });
}

function generateWithSDXL(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://replicate.com/api/predictions";
    const payload = {
      "input": {
        "width": 1024,
        "height": 1024,
        "prompt": prompt,
        "scheduler": "K_EULER",
        "num_outputs": 1,
        "guidance_scale": 0,
        "negative_prompt": "nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
        "num_inference_steps": 6,
      },
      "is_training": false,
      "create_model": "0",
      "stream": false,
      "version": "727e49a643e999d602a896c774a0658ffefea21465756a6ce24b7ea4165eba6a"
    };

    const headers = {
      "Content-Type": "application/json"
    };

    axios.post(url, payload, { headers })
      .then(response => {
        const predictionId = response.data.id;
        const urlWithId = `https://replicate.com/api/predictions/${predictionId}`;

        // Polling for the prediction result
        const checkPrediction = () => {
          axios.get(urlWithId)
            .then(res => {
              const data = res.data;
              if (data.completed_at) {
                const outputUrl = data.output;
                if (outputUrl) {
                  resolve({ images: [{ url: outputUrl[0] }], modelUsed: "SD-XL" });
                } else {
                  reject(new Error("Output URL is not available."));
                }
              } else {
                setTimeout(checkPrediction, 1000);
              }
            })
            .catch(error => {
              console.error("Error:", error);
              reject(error);
            });
        };
        checkPrediction();
      })
      .catch(error => {
        console.error("Error:", error);
        reject(error);
      });
  });
}

function generateWithSDXLAlt(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://ap123-sdxl-lightning.hf.space";
    let session_hash = 'test123';

    // Define the first request URL and data
    const urlFirstRequest = `${url}/queue/join?`;
    const dataFirstRequest = {
      "data": [prompt, "8-Step"],
      "event_data": null,
      "fn_index": 1,
      "trigger_id": 7,
      "session_hash": session_hash
    };

    axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {
      console.log(responseFirst.data);

      const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

      const eventSource = new EventSource(urlSecondRequest);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.msg === "process_completed") {
          eventSource.close();
          const full_url = data["output"]["data"][0]["url"];
          console.log(full_url);

          resolve({ images: [{ url: full_url }], modelUsed: "SD-XL-Alt" });
        }
      };

      // In case of an error with EventSource, you may also want to reject the promise
      eventSource.onerror = (error) => {
        eventSource.close();
        console.error("EventSource Error:", error);
        reject(error);
      };

    }).catch(error => {
      console.error("Error:", error);
      reject(error); // Reject the promise if the first request fails
    });
  });
}

function generateWithKandinsky(prompt) {
  return new Promise((resolve, reject) => {
    const url = "https://ehristoforu-kandinsky-api.hf.space";
    let session_hash = 'test123';

    // Define the first request URL and data
    const urlFirstRequest = `${url}/queue/join?`;
    const dataFirstRequest = {
      "data": [prompt, 1024, 1024],
      "event_data": null,
      "fn_index": 0,
      "trigger_id": 4,
      "session_hash": session_hash
    };

    axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {
      console.log(responseFirst.data);

      const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

      const eventSource = new EventSource(urlSecondRequest);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.msg === "process_completed") {
          eventSource.close();
          const full_url = data["output"]["data"][0][0]["image"]["url"];
          console.log(full_url);

          resolve({ images: [{ url: full_url }], modelUsed: "Kandinsky" });
        }
      };

      // In case of an error with EventSource, you may also want to reject the promise
      eventSource.onerror = (error) => {
        eventSource.close();
        console.error("EventSource Error:", error);
        reject(error);
      };

    }).catch(error => {
      console.error("Error:", error);
      reject(error); // Reject the promise if the first request fails
    });
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
    let botMessage = await message.reply({ content: '> `Processing your document(s)...`' });
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

const safetySettings = [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, ];

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
    const botMessage = await message.reply("> `It looks like you didn't say anything. What would you like to talk about?`");
    await addSettingsButton(botMessage);
    return;
  }
  const instructions = customInstructions[message.author.id];

  // Only include instructions if they are set.
  let formattedMessage = instructions ?
    `[Instructions To Follow]: ${instructions}\n\n[User]: ${messageContent}` :
    messageContent

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
  await interaction.reply({ content: "> `Custom personality instructions removed!`", ephemeral: true });
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
        contentWithUrls += `\n\n[Transcript Of Video Number ${contentIndex}]:\n"${transcriptText}"`;
      } else {
        // For non-video URLs, attempt to scrape webpage content
        const webpageContent = await scrapeWebpageContent(url);
        contentWithUrls += `\n\n[Content of URL Number ${contentIndex}]:\n"${webpageContent}"`;
        console.log(webpageContent)
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

// Function to get user preference
function getUserPreference(userId) {
  return userResponsePreference[userId] || 'embedded';
}

// Function to toggle user preference
async function toggleUserPreference(interaction) {
  const userId = interaction.user.id;
  const currentPreference = getUserPreference(userId);
  userResponsePreference[userId] = currentPreference === 'normal' ? 'embedded' : 'normal';
  const updatedPreference = getUserPreference(userId);
  await interaction.reply({ content: `> **Your responses has been switched from \`${currentPreference}\` to \`${updatedPreference}\`.**`, ephemeral: true });
}

async function handleModelResponse(botMessage, responseFunc, originalMessage) {
  const userId = originalMessage.author.id;

  try {
    const messageResult = await responseFunc();
    let finalResponse = '';
    let isLargeResponse = false;
    let maxCharacterLimit;
    if (getUserPreference(userId) === 'embedded') {
      maxCharacterLimit = 3900;
    } else {
      maxCharacterLimit = 1900;
    }

    for await (const chunk of messageResult.stream) {
      const chunkText = await chunk.text();
      finalResponse += chunkText;

      if (!isLargeResponse && finalResponse.length > maxCharacterLimit) {
        await botMessage.edit('> `The response is too large and will be sent as a text file once it is ready.`');
        isLargeResponse = true;
      } else if (!isLargeResponse) {
        // Check user preference
        if (getUserPreference(userId) === 'embedded') {
          const embed = new EmbedBuilder()
            .setColor(0x505050)
            .setTitle('📝 **Response:**')
            .setDescription(finalResponse)
            .addFields(
              { name: '❓ **Questioned by:**', value: `${originalMessage.author.displayName}`, inline: false }
            )
            .setTimestamp();

          await botMessage.edit({ content: null, embeds: [embed] });
        } else {
          await botMessage.edit(finalResponse);
        }
      }
    }

    if (isLargeResponse) {
      await sendAsTextFile(finalResponse, originalMessage);
    } else {
      await addSettingsButton(botMessage);
    }

    updateChatHistory(userId, originalMessage.content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim(), finalResponse);
  } catch (error) {
    console.error('Error handling model response:', error);
    await botMessage.edit({ content: '> `Sorry, an error occurred while generating a response.`' });
    await addSettingsButton(botMessage);
  } finally {
    activeRequests.delete(userId);
  }
}

async function sendAsTextFile(text, message) {
  const filename = `response-${Date.now()}.txt`;
  await writeFile(filename, text);

  const botMessage = await message.reply({ content: 'Here is the response:', files: [filename] });
  await addSettingsButton(botMessage);

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

client.login(token);
