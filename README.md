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

### How to Send Messages to the Bot

There are several ways to interact with the Gemini bot:

1. **Direct Messages (DMs)**
   - Open a DM with the bot and send any message
   - The bot will respond with Gemini AI responses

2. **Mention the Bot in a Channel**
   - In any server channel, mention the bot (@Gemini-Discord-Bot) and send your message
   - The bot will respond in the same channel

3. **Enable "Always Respond" Mode**
   - Use `/respond_to_all enabled:true` in a channel
   - The bot will respond to every message posted in that channel (by any user)
   - Use `/respond_to_all enabled:false` to disable this mode

4. **Personal Active Mode**
   - Use `/settings` to configure personal preferences
   - You can enable your messages to trigger bot responses in specific channels

### Supported Features

- **File/Media Support**: Upload supported files (images, videos, audio, PDFs, docx, pptx, code files) along with your message for the bot to analyze
- **Custom Personalities**: Use `/settings` to set custom instruction prompts for personalized responses
- **Server-wide Chat History**: Use `/toggle_channel_chat_history` to enable persistent conversation history in a channel
- **Conversation Memory**: The bot remembers your conversation history within a session

### Available Slash Commands

- `/settings` – Configure personal or channel preferences
- `/server_settings` – Server-wide admin controls (admins only)
- `/respond_to_all enabled:true|false` – Toggle bot response to all messages in a channel
- `/clear_memory` – Clear your personal conversation history
- `/toggle_channel_chat_history enabled:true|false [instructions]` – Enable channel-wide conversation memory
- `/blacklist user:@user` – Prevent a user from using the bot (admins only)
- `/whitelist user:@user` – Remove a user from the blacklist (admins only)
- `/status` – Show system status (RAM, CPU, reset timer)

---

## Customization

- Modify `config.js` to change default personalities, activities, colors, and feature toggles.
- Persistent data (chat history, settings, blacklists, etc.) is stored in the `config` directory.

## Project Structure

- `index.js` bootstraps the bot.
- `botManager.js` owns Discord/Gemini clients plus persisted runtime state.
- `src/bootstrap.js` registers Discord lifecycle handlers.
- `src/handlers/` contains message and interaction routing.
- `src/services/` contains attachment parsing and Gemini conversation orchestration.
- `src/ui/` contains reusable Discord button and settings views.
- `src/utils/` contains shared Discord helper utilities.

## Runtime Notes

- Settings and moderation changes are persisted immediately instead of waiting for a later chat response.
- Attachment parsing is split between text extraction and media uploads to keep message handling predictable.
- Default server settings are cloned per guild, preventing cross-server state leakage.

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
