require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Store chats per user
const userChats = new Map(); // key: userID, value: chat state

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content) return;

    // Check if the bot was mentioned
    if (message.mentions.users.has(client.user.id)) {
        const userID = message.author.id;
        const messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        // Clear chat command
        if (messageContent.toLowerCase() === 'clear') {
            userChats.delete(userID);
            await message.reply('Your conversation history has been cleared.');
            return;
        }
        
        // Get or start a chat session
        let chat = userChats.get(userID) || model.startChat({
            generationConfig: {
                maxOutputTokens: 16384,
            },
        });
        
        // Store the updated chat session
        userChats.set(userID, chat);
        
        // Send an initial response to indicate generation is in progress
        let responseMessage = await message.reply('```Generating...```');

        try {
            // Stream the response
            const result = await chat.sendMessageStream(messageContent);
            let responseText = '';

            for await (const chunk of result.stream) {
                responseText += await chunk.text();

                // Check if response exceeds single message limit
                if (responseText.length <= 2000) {
                    await responseMessage.edit(responseText);
                    continue;
                }

                // Send messages in chunks of 2000 characters
                while (responseText.length > 0) {
                    const partToSend = responseText.slice(0, 2000);
                    responseText = responseText.slice(2000);

                    if (responseMessage) {
                        await responseMessage.edit(partToSend);
                        responseMessage = null; // Clear so we don't try to edit again
                    } else {
                        responseMessage = await message.channel.send(partToSend);
                    }
                }
            }
        } catch (error) {
            console.error("Error while sending message to Gemini Pro:", error);
            await message.reply("I'm sorry, I've encountered an issue generating a reply.");
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
