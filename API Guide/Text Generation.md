# Comprehensive Guide: Text Generation with Gemini API in JavaScript

The Gemini API provides powerful text generation capabilities in JavaScript applications. This guide covers all aspects of generating text using the JavaScript SDK, from basic text-only prompts to advanced configurations and features.

## Prerequisites

Before getting started, ensure you have:
- **Node.js** installed on your system
- The **Gemini JavaScript SDK** installed: `npm install @google/genai`
- A **valid Gemini API key**
- Basic understanding of **async/await** in JavaScript

## Basic Setup

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_GEMINI_API_KEY" });
```

## Basic Text Generation

### Simple Text-Only Generation

The most straightforward way to generate text is with a single text prompt:

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function generateText() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "How does AI work?",
  });
  
  console.log(response.text);
}

await generateText();
```

### Function-Based Implementation

Create a reusable function for text generation:

```javascript
async function generateContent(prompt, model = "gemini-2.5-flash") {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
}

// Usage
const story = await generateContent("Write a story about a magic backpack.");
console.log(story);
```

## System Instructions and Advanced Configuration

### Using System Instructions

Guide the model's behavior with system instructions:

```javascript
async function generateWithSystemInstruction(userPrompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: "You are a cat. Your name is Neko.",
    },
  });
  
  console.log(response.text);
}

await generateWithSystemInstruction("Hello there");
```

### Generation Parameters

Configure various generation parameters to control output quality and behavior:

```javascript
async function generateWithCustomConfig(prompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.1,          // Lower for more focused responses
      topP: 0.8,                 // Nucleus sampling parameter  
      topK: 40,                  // Top-k sampling parameter
      maxOutputTokens: 1000,     // Maximum tokens to generate
      stopSequences: ["END"],    // Stop generation at these sequences
    },
  });
  
  return response.text;
}
```

### Complete Configuration Example

```javascript
async function generateWithFullConfig(prompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: "You are a helpful AI assistant specialized in creative writing.",
      temperature: 0.7,
      topP: 0.9,
      topK: 20,
      maxOutputTokens: 2000,
      stopSequences: ["THE END", "CONCLUSION"],
    },
  });
  
  return response.text;
}
```

## Streaming Text Generation

For more fluid interactions, use **streaming responses** to receive content incrementally as it's generated:

```javascript
async function generateStreamingContent(prompt) {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  
  for await (const chunk of response) {
    console.log(chunk.text);
  }
}

await generateStreamingContent("Explain how AI works");
```

### Streaming with Configuration

```javascript
async function generateStreamingWithConfig(prompt) {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.8,
      maxOutputTokens: 1500,
      systemInstruction: "Provide detailed explanations with examples.",
    },
  });
  
  let fullText = "";
  for await (const chunk of response) {
    const chunkText = chunk.text;
    console.log(chunkText); // Display each chunk as it arrives
    fullText += chunkText;
  }
  
  return fullText;
}
```

## Multi-turn Conversations (Chat)

Create persistent conversations with chat functionality:

### Basic Chat Implementation

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function createChat() {
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model", 
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });
  
  // Send first message
  const response1 = await chat.sendMessage({
    message: "I have 2 dogs in my house.",
  });
  console.log("Chat response 1:", response1.text);
  
  // Send follow-up message
  const response2 = await chat.sendMessage({
    message: "How many paws are in my house?",
  });
  console.log("Chat response 2:", response2.text);
}

await createChat();
```

### Chat with System Instructions

```javascript
async function createChatWithInstructions() {
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: "You are a helpful math tutor. Always show your work.",
      temperature: 0.3,
    },
    history: [],
  });
  
  const mathResponse = await chat.sendMessage({
    message: "What's 15 × 24?",
  });
  console.log(mathResponse.text);
}
```

### Streaming Chat

Combine chat functionality with streaming responses:

```javascript
async function createStreamingChat() {
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });
  
  // Send streaming message
  const stream1 = await chat.sendMessageStream({
    message: "I have 2 dogs in my house.",
  });
  
  for await (const chunk of stream1) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }
  
  // Send another streaming message
  const stream2 = await chat.sendMessageStream({
    message: "How many paws are in my house?",
  });
  
  for await (const chunk of stream2) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }
}
```
