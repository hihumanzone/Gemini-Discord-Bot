# Gemini Discord Bot

Gemini is an advanced Discord bot that leverages Google's Generative AI models to provide a wide range of features and interactions. It can engage in conversations, generate images, create speech, music, and videos, and even analyze text files and web pages.

## Features

- Conversational AI: Gemini can engage in natural conversations with users, maintaining context and providing relevant responses.
- Image Generation: Users can generate images based on text prompts using various models like SD-XL-Alt, Kandinsky, DallE-XL, Anime, and Stable-Cascade.
- Speech Generation: Gemini can generate speech from text prompts in multiple languages.
- Music Generation: Users can generate music based on text prompts.
- Video Generation: Gemini can create videos from text descriptions.
- Text File Analysis: The bot can extract and analyze text from various file types, including PDF, plain text, HTML, CSS, JavaScript, JSON, Python, YAML, Markdown, and XML.
- Web Page Analysis: Gemini can scrape and analyze the content of web pages.
- User Preferences: Users can customize their experience by setting preferences for response format, image models, image resolution, speech models, and URL handling.
- Server-wide Settings: Server administrators can configure server-wide settings such as chat history, custom personality, response style, and more.
- Blacklisting and Whitelisting: Server administrators can blacklist or whitelist users from using certain interactions.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/hihumanzone/Gemini-Discord-Bot.git
   ```

2. Install the required dependencies:
   ```
   npm install dotenv node-fetch@2.6.7 discord.js @google/generative-ai ws fs sharp pdf-parse cheerio youtube-transcript axios eventsource
   ```

3. Obtain a Google API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

4. Create a `.env` file in the project root and add your Discord bot token and Google API key:
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   GOOGLE_API_KEY=your_google_api_key
   ```

5. Run the bot:
   ```
   node index.js
   ```

## Usage

Gemini provides a range of slash commands and interactions. Users can interact with the bot by mentioning it or using the available slash commands. The bot also supports message attachments for image and text file analysis.

For detailed usage instructions and a list of available commands, please refer to the [official website](https://gemini-discord-bot.vercel.app/).

## About the Creator

Gemini Discord Bot is created by hihumanzone (also known as Impulse). For more information and updates, visit the [GitHub repository](https://github.com/hihumanzone/Gemini-Discord-Bot).

## License

This project is licensed under the [MIT License](LICENSE).
