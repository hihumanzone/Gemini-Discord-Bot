require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
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
                maxOutputTokens: 4096,
            },
        });

        // Store the updated chat session
        userChats.set(userID, chat);

        // Send an initial response to indicate generation is in progress
        let tempMessage = await message.reply('Generating...🤔');

        try {
            // Stream the response
            const result = await chat.sendMessageStream(messageContent);
            let fullResponseText = '';
            
            for await (const chunk of result.stream) {
                const chunkText = await chunk.text();
                fullResponseText += chunkText;

                if (fullResponseText.length <= 2000) {
                    await tempMessage.edit(fullResponseText);
                } else {
                    // Split message into chunks that Discord can handle
                    await tempMessage.edit(fullResponseText.slice(0, 2000));
                    fullResponseText = fullResponseText.slice(2000);

                    // Send remaining chunks as new messages
                    while (fullResponseText.length > 2000) {
                        const part = fullResponseText.slice(0, 2000);
                        fullResponseText = fullResponseText.slice(2000);
                        await message.channel.send(part); // Changed from message.reply to message.channel.send
                    }
                    // Send any remaining text in a new message
                    if (fullResponseText.length) {
                        await message.channel.send(fullResponseText); // Changed from message.reply to message.channel.send
                    }
                    // Break from the loop since we've handled all the text
                    break;
                }
            }
        } catch (error) {
            console.error("Error while sending message to Gemini Pro:", error);
            await message.reply("I'm sorry, I've encountered an issue generating a reply."); // This is fine to keep as a reply
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
