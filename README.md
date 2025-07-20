# Gemini Discord Bot

A Discord bot leveraging Google Gemini for advanced conversation, content understanding, image/video/audio recognition, and more.

---

## Features

- **Conversational AI** powered by Google Gemini (Gemini-2.5-Flash)
- **Image/video/audio and file recognition** (supports images, videos, audios, PDFs, docx, pptx, and code/text files)
- **Custom personalities per user, channel, or server**
- **Server and channel-wide chat history** options
- **Admin controls** for blacklisting/whitelisting users
- **Downloadable conversation/message history**
- **Multiple AI tools:** Google Search, code execution, and function calling
- **Status monitoring** (RAM, CPU, and reset timer)
- **Slash command and button-based UI**

---

## Getting Started

### Prerequisites

- Node.js v20+ recommended
- Discord bot token ([create here](https://discord.com/developers/applications))
- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Setup

1. **Clone the repo:**
    ```bash
    git clone https://github.com/hihumanzone/Gemini-Discord-Bot.git
    cd Gemini-Discord-Bot
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Configure environment variables:**
    - Copy `example.env` to `.env`
    - Fill in your Discord and Google API tokens:
      ```
      DISCORD_BOT_TOKEN=your_discord_bot_token
      GOOGLE_API_KEY=your_google_api_key
      ```

4. **Start the bot:**
    ```bash
    npm start
    ```

---

## Usage

- **Invite the bot to your Discord server.**
- Use `/settings` to configure personal or channel preferences.
- Use `/server_settings` for server-wide admin controls.
- Upload supported files or image/video/audio files and ask the bot about them.
- Use slash commands:
    - `/respond_to_all enabled:true|false` – Bot responds to every message in a channel
    - `/clear_memory` – Clear your personal conversation history
    - `/toggle_channel_chat_history enabled:true|false [instructions]` – Channel-wide conversation
    - `/blacklist user:@user` – Prevent a user from using the bot
    - `/whitelist user:@user` – Remove a user from the blacklist
    - `/status` – Show system status

---

## Customization

- Modify `config.js` to change default personalities, activities, colors, and feature toggles.
- Persistent data (chat history, settings, blacklists, etc.) is stored in the `config` directory.

---

## Admin & Security

- Only server admins can use admin commands (blacklist, whitelist, server settings).
- Blacklisted users cannot interact with the bot.

---

## Notes

- The bot stores chat history and settings locally. For production use, consider using persistent cloud storage.
- **Do not commit your `.env` with secrets.**

---

## License

[MIT](LICENSE.md)
