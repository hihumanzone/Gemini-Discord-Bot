const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
require('dotenv').config();

const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

async function imageAttachmentToGenerativePart(attachment) {
  const response = await fetch(attachment.url);
  const buffer = await response.buffer();
  return {
      inlineData: {
          data: buffer.toString("base64"),
          mimeType: attachment.contentType,
      },
  };
}

discordClient.on('messageCreate', async message => {
    if (message.author.bot || !message.content) return;

    const content = message.content.trim();
    const botMention = `<@${discordClient.user.id}>`;
    const isMentioned = content.includes(botMention) || content.includes(botMention.replace('@', '@!'));

    if (!isMentioned || message.attachments.size === 0) return; // Continue only if the bot is mentioned and there are attachments
    
    if (message.attachments.every(attachment => !attachment.contentType?.startsWith('image/'))) {
        await message.reply('Please include at least one image attachment.');
        return;
    }

    let totalSize = message.attachments.reduce((size, attachment) => size + attachment.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);

    if (totalSizeMB > 4) {
        await message.reply('The size of the image(s) is too large. Please make sure the total size is under 4MB.');
        return;
    }

    let userInput = content.replace(new RegExp(botMention.replace('@', '@!') + '|<@!?\\d+>', 'g'), '').trim();
    userInput = userInput || "What's this?"; // Use a default prompt if no text is provided

    const attachmentsPromises = [...message.attachments.values()].map(imageAttachmentToGenerativePart);
    let generatingMessage = await message.reply('```Generating...```');

    try {
        const imageParts = await Promise.all(attachmentsPromises);
        const result = await visionModel.generateContentStream([userInput, ...imageParts]);

        let text = '';
        for await (const chunk of result.stream) {
            const chunkText = await chunk.text();
            text += chunkText;
            await generatingMessage.edit(`${text}`); // Edit the original message with the new content
        }
    } catch (error) {
        console.error('Error generating response:', error);
        await generatingMessage.edit('Sorry, I was unable to analyze the image(s).');
    }
});

discordClient.once('ready', () => {
    console.log('Discord bot is ready!');
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);
