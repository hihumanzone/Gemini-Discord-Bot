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
        let responseMessage = await message.reply('```Generating...````');

        try {
            // Stream the response
            const result = await chat.sendMessageStream(messageContent);
            let responseText = '';

            for await (const chunk of result.stream) {
                const chunkText = await chunk.text();
                responseText += chunkText;

                // Check if response fits within single message limit
                if (responseText.length <= 2000) {
                    await responseMessage.edit(responseText);
                } else {
                    // Edit the current message with the first 2000 characters
                    const fittingPart = responseText.slice(0, 2000);
                    await responseMessage.edit(fittingPart);
                    // Remaining characters will be sent as a new standard message
                    responseText = responseText.slice(2000);

                    // The rest of the messages will be standard (not as a reply)
                    responseMessage = await message.channel.send('...');
                    await responseMessage.edit(fittingPart);

                    // Send the final part of the response as a standard message
                    if (responseText.length) {
                        responseMessage = await message.channel.send(responseText);
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
