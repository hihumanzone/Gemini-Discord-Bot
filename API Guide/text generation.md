### Setup

First, you need to import and initialize the `GoogleGenAI` client with your API key.

```javascript
import { GoogleGenAI } from "@google/genai";

// Make sure to replace "{}" with your API key configuration
const ai = new GoogleGenAI({});
```

### Generating Text from a Single Prompt

To generate text from a single text input, use the `generateContent` method on a model. You pass the model name and your text prompt in the `contents` field.

```javascript
async function run() {
  // For text-only input, use a gemini-pro model
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = "Write a story about a magic backpack.";

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  console.log(text);
}

run();
```

### Using Streaming for Faster Responses

For a more interactive experience, you can stream the response, which allows you to receive and display text as it's being generated. Use the `generateContentStream` method for this.

```javascript
async function run() {
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = "Write a story about a magic backpack.";

  const result = await model.generateContentStream(prompt);

  let text = '';
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    console.log(chunkText);
    text += chunkText;
  }
}

run();
```

### Creating Multi-Turn Conversations (Chat)

To maintain a conversation history, you can use the chat functionality provided by the SDK. This sends the entire history to the model with each new message.

1.  **Initialize the Chat**: Use the `startChat()` method on a model. You can also provide an initial `history` of messages.
2.  **Send Messages**: Use the `sendMessage()` method to send a new message. For a streaming response, use `sendMessageStream()`.

Here is an example of a multi-turn chat session:

```javascript
async function run() {
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: "Hello, I have 2 dogs in my house." }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 100,
    },
  });

  const msg = "How many paws are in my house?";

  const result = await chat.sendMessage(msg);
  const response = await result.response;
  const text = response.text();
  console.log(text);
}

run();
```

### Configuration Options

You can guide the model's behavior by passing a configuration object.

*   **System Instructions**: Provide a `systemInstruction` to set the model's persona or role.

    ```javascript
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Hello there",
      config: {
        systemInstruction: "You are a cat. Your name is Neko.",
      },
    });
    ```

*   **Generation Parameters**: Adjust parameters like `temperature` to control the creativity of the output.

    ```javascript
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Explain how AI works",
      config: {
        temperature: 0.1,
      },
    });
    ```
