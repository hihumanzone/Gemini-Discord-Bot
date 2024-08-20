import { imgModels } from './tools/generators.js';

const modelChoices = imgModels.map(model => ({
  name: model,
  value: model
}));

const commands = [
  {
    "name": "imagine",
    "description": "Generate an image based on a prompt using a selected model.",
    "options": [
      {
        "type": 3,
        "name": "prompt",
        "description": "The prompt to generate the image from.",
        "required": true
      },
      {
        "type": 3,
        "name": "model",
        "description": "The image generation model to use.",
        "required": false,
        "choices": modelChoices
      },
      {
        "type": 3,
        "name": "resolution",
        "description": "The resolution aspect ratio for the generated image.",
        "required": false,
        "choices": [
          { "name": "Square", "value": "Square" },
          { "name": "Wide", "value": "Wide" },
          { "name": "Portrait", "value": "Portrait" }
        ]
      }
    ]
  },
  {
    "name": "respond_to_all",
    "description": "Enables the bot to always respond to all messages in this channel."
  },
  {
    "name": "clear_memory",
    "description": "Clears the conversation history."
  },
  {
    "name": "settings",
    "description": "Opens Up Settings."
  },
  {
    "name": "server_settings",
    "description": "Opens Up The Server Settings."
  },
  {
    "name": "speech",
    "description": "Generate speech from text.",
    "options": [
      {
        "type": 3,
        "name": "language",
        "description": "The language to use.",
        "required": true,
        "choices": [
          { "name": "English", "value": "English" },
          { "name": "Spanish", "value": "Spanish" },
          { "name": "French", "value": "French" },
          { "name": "Chinese", "value": "Chinese" },
          { "name": "Korean", "value": "Korean" },
          { "name": "Japanese", "value": "Japanese" }
        ]
      },
      {
        "type": 3,
        "name": "prompt",
        "description": "The text prompt to generate the speech from.",
        "required": true
      }
    ]
  },
  {
    "name": "music",
    "description": "Generate a music based on a prompt.",
    "options": [
      {
        "type": 3,
        "name": "prompt",
        "description": "The prompt to generate the music from.",
        "required": true
      }
    ]
  },
  {
    "name": "blacklist",
    "description": "Blacklists a user from using certain interactions",
    "options": [
      {
        "type": 6,
        "name": "user",
        "description": "The user to blacklist",
        "required": true
      }
    ]
  },
  {
    "name": "whitelist",
    "description": "Removes a user from the blacklist",
    "options": [
      {
        "type": 6,
        "name": "user",
        "description": "The user to whitelist",
        "required": true
      }
    ]
  },
  {
    "name": "status",
    "description": "Displays bot CPU and RAM usage in detail."
  },
  {
    "name": "toggle_channel_chat_history",
    "description": "Toggle the chat wide history for everyone in that channel.",
    "options": [
      {
        "name": "enabled",
        "description": "Set to true to enable chat wide history, or false to disable it.",
        "type": 5,
        "required": true
      },
      {
        "name": "instructions",
        "description": "Bot instructions for that channel.",
        "type": 3,
        "required": false
      }
    ]
  }
];

export { commands };
