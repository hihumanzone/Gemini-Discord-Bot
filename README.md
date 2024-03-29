# Discord Gemini Bot

This Discord bot leverages the power of Google's Generative AI and other tools to interact with users in unique ways, such as generating images based on prompts, replying to messages with insightful comments, and more. Below you'll find all the information you need to get started with using and contributing to the bot.

## Features

- **Image Generation:** Generate images based on prompts using different models like Proteus, SD-XL, Stable-Cascade, and Kandinsky.
- **Auto-Response:** Optionally set the bot to automatically respond to all messages in a channel.
- **Conversation History:** Maintains a history of interactions for more context-aware responses.
- **File Processing:** Ability to process and understand content from images, PDFs, and text files.
- **URL Content Fetching:** Fetches and understands content from URLs provided in messages.
- **Customizable:** Users can customize the bot's personality and response behavior.

## Screenshots

### Screenshot 1: Images and text
![Screenshot 1](ss/1.jpg)

### Screenshot 2: Settings
![Screenshot 2](ss/2.jpg)

### Screenshot 3: Change Image Model
![Screenshot 3](ss/3.jpg)

### Screenshot 4: Custom Personality Demo
![Screenshot 4](ss/4.jpg)

### Screenshot 5: Image Generation
![Screenshot 5](ss/5.jpg)

### Screenshot 6: Text File Handling & Big Response Handling
![Screenshot 6](ss/6.jpg)

### Screenshot 7: Reading Websites
![Screenshot 7](ss/7.jpg)

### Screenshot 8: Reading YouTube Videos
![Screenshot 8](ss/8.jpg)

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

---

Created by hihumanzone (also known as Impulse). Check out the [GitHub profile](https://github.com/hihumanzone) for more awesome projects!
