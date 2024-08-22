# Gemini Discord Bot

Gemini Discord Bot is an advanced, multimodal Discord bot leveraging Google Generative AI capabilities. Besides text responses, this bot can read images, listen to audio files, watch videos, and interpret text files. This makes Gemini one of the most versatile AI assistants available for Discord.

## Features

- **Multimodal Capabilities:** Interacts with images, videos, audio files, and text files.
- **Image Generation:** Generates images based on user prompts using multiple models like SD-XL, Playground, and more.
- **Speech Generation:** Converts text to speech in multiple languages.
- **Music Generation:** Generates music based on textual prompts.
- **Custom Personalities:** Supports creating custom personalities for users and servers.
- **Advanced Interaction:** Supports advanced user and server settings, including chat history management and response formatting.

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- Discord Bot account & token ([create a bot on Discord Developer Portal](https://discord.com/developers/applications))

### Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/hihumanzone/Gemini-Discord-Bot
    cd Gemini-Discord-Bot
    ```

2. Install dependencies:

    ```sh
    npm install @google/generative-ai axios cheerio discord.js dotenv eventsource fs sharp office-text-extractor youtube-transcript node-os-utils ws mathjs
    ```

3. Set up environment variables:

    Create a `.env` file in the root directory and add your Discord bot token and Google API key:

    ```env
    DISCORD_BOT_TOKEN=your_discord_bot_token
    GOOGLE_API_KEY=your_google_api_key
    ```

4. Configure the bot:

    Edit the `config.json` file as per your preferences.

5. Start the bot:

    ```sh
    npm start
    ```

## Commands

### Image Generation
- `/imagine [prompt] [model] [resolution]`: Generate an image using a selected model and resolution.

### Chat Management
- `/respond_to_all`: Enable the bot to respond to all messages in the channel.
- `/clear_memory`: Clear the conversation history.
- `/settings`: Open user settings.
- `/server_settings`: Open server settings.

### Speech & Music Generation
- `/speech [language] [prompt]`: Generate speech from text in the specified language.
- `/music [prompt]`: Generate music based on a prompt.

### Admin Commands
- `/blacklist [user]`: Blacklist a user from using certain interactions.
- `/whitelist [user]`: Remove a user from the blacklist.
- `/status`: Display bot's CPU and RAM usage in detail.

## Configuration 

### `config.json`

This file contains various settings for the bot:

- **defaultResponseFormat**: The default response format for the bot. (`embedded` or `normal`)
- **hexColour**: The default hex color for embeds.
- **defaultImgModel**: The default image generation model.
- **defaultUrlReading**: Default URL reading preference (`ON` or `OFF`).
- **workInDMs**: Whether the bot should work in DMs (`true` or `false`).
- **shouldDisplayPersonalityButtons**: Whether to display personality buttons in settings (`true` or `false`).
- **SEND_RETRY_ERRORS_TO_DISCORD**: Whether to send retry errors to Discord channel (`true` or `false`).
- **activities**: An array of activities for the bot to display.
- **defaultPersonality**: The default personality instructions for the bot.
- **defaultServerSettings**: The default settings for the server.

### NSFW Word Filtering (`nsfwWords.json`)

Contains an array of words that should be filtered from prompts.

## Community & Support

- Join the [Discord Community](https://discord.com/invite/Gxpw7XF3Mj) for support, updates, and discussions.

### Contributions

We welcome contributions! Feel free to fork the repository, create a new branch, make your changes, and submit a pull request.

## License

This project is licensed under the MIT License.

---

Happy Discording with *Gemini*!

If you find this bot useful, don't forget to ⭐star the repository!
