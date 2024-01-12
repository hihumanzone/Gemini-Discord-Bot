# Gemini Discord Bot

Gemini Discord Bot is a powerful chatbot for Discord that utilizes Google's Generative AI to provide a wide range of interactive capabilities to Discord servers. It can analyze images, process text files, fetch content from websites, and even fetch YouTube transcripts. 

## Features
- Responds to mentions and direct messages
- Can be toggled on or off for channels
- Analyzes images using Google's Generative AI
- Processes PDF and plain text files
- Scrapes content from webpages
- Fetches transcripts from YouTube videos
- Can manage or clear conversation

## Getting Started

### Prerequisites
Before you run the bot, make sure you have Node.js installed on your machine. You can download it from [here](https://nodejs.org/).

### Installation
Clone the repository:
```
git clone https://github.com/hihumanzone/Gemini-Discord-Bot.git
cd Gemini-Discord-Bot
```

Install required packages:

```bash
npm install dotenv node-fetch@2.6.1 discord.js @google/generative-ai fs pdf-parse cheerio youtube-transcript
```

### Configuration
1. Obtain a Google API Key by following the instructions [here](https://makersuite.google.com/app/apikey).

2. Create a new bot in the [Discord Developer Portal](https://discord.com/developers/applications) and get your Discord Bot Token.

3. Create a `.env` file in the root of your project and add the following:
```
DISCORD_BOT_TOKEN=your_discord_bot_token
GOOGLE_API_KEY=your_google_api_key
```

### Running the bot
To start the bot, run the following command in your terminal:
```bash
node index.js
```

## Usage

### Commands
- `>toggle-chat` – Toggle the bot's activity in a server channel. Use this command in the specific channel you wish to enable/disable the bot.

### Interactive Responses
- Mention the bot with `@[bot name]` followed by your message in any server channel where the bot is enabled or in a DM to get a response.
- Attach images to your message for the bot to analyze and respond.
- Attach PDF or text files for the bot to process and respond.

## Contributing
We welcome contributions! Please feel free to submit a Pull Request or create an issue for any enhancements or bug fixes.

## License
Gemini Discord Bot is licensed under the MIT License.

## Acknowledgements
- Thanks to Google for the Generative AI API used in this bot.
- All contributors and users who have provided valuable feedback.
