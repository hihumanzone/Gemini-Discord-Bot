# Discord Gemini Bot

This Discord bot leverages the power of Google's Generative AI and other tools to interact with users in unique ways, such as generating images based on prompts, replying to messages with insightful comments, and more. Below you'll find all the information you need to get started with using and contributing to the bot.

## Features

- **Image Generation:** Generate images based on prompts using different models like Proteus, SD-XL, Stable-Cascade, and Kandinsky.
- **Auto-Response:** Optionally set the bot to automatically respond to all messages in a channel.
- **Conversation History:** Maintains a history of interactions for more context-aware responses.
- **File Processing:** Ability to process and understand content from images, PDFs, and text files.
- **URL Content Fetching:** Fetches and understands content from URLs provided in messages.
- **Customizable:** Users can customize the bot's personality and response behavior.

## Getting Started

1. **Clone this repository**

    Start by cloning this repository to your local machine to get the source code.

2. **Install dependencies**

    Navigate to the cloned directory and run the following command to install all necessary packages:

    ```bash
    npm install dotenv node-fetch@2.6.1 discord.js @google/generative-ai fs sharp pdf-parse cheerio youtube-transcript axios eventsource
    ```

3. **Set Up Environment Variables**

    Create a `.env` file in the root directory and define the following variables:

    - `DISCORD_BOT_TOKEN`: Your Discord bot token.
    - `GOOGLE_API_KEY`: Your Google Gemini API key which can be obtained from [Google AI Studio](https://aistudio.google.com/app/apikey).

4. **Run the Bot**

    Start the bot by running `node index.js` or your preferred command, depending on how you've set up your project structure. Ensure that `index.js` is the entry point where the code provided is located.

## Additional Resources

- **Website**: For more information, visit the [official website](https://discord-bot-webpage.vercel.app/).
- **GitHub Repository**: Access the source code on [GitHub](https://github.com/hihumanzone).
- **Google Gemini API Key**: Obtain your API key [here](https://aistudio.google.com/app/apikey).

## Contributing

Contributions are what make the open-source community such a fantastic place to learn, inspire, and create. Any contributions you make are greatly appreciated.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

Created by hihumanzone (also known as Impulse). Check out the [GitHub profile](https://github.com/hihumanzone) for more awesome projects!
