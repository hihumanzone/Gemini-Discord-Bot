// For advanced configuration, edit `constants.js`.
const config = Object.freeze({
  defaultModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  maxGenerationAttempts: 3,
  defaultResponseFormat: 'Embedded',
  hexColour: '#505050',
  workInDMs: true,
  shouldDisplayPersonalityButtons: true,
  enableGeminiApiLogging: false,
  SEND_RETRY_ERRORS_TO_DISCORD: true,
  defaultPersonality:
    "You are Gemini, a large language model trained by Google.",
  activities: [
    {
      name: 'With Code',
      type: 'Playing',
    },
    {
      name: 'Something',
      type: 'Listening',
    },
    {
      name: 'You',
      type: 'Watching',
    },
  ],
  defaultServerSettings: {
    serverChatHistory: false,
    settingsSaveButton: true,
    customServerPersonality: false,
    serverResponsePreference: false,
    responseStyle: 'Embedded',
  },
  defaultChannelSettings: {
    alwaysRespond: false,
    channelWideChatHistory: false,
    customChannelPersonality: false,
  },
  defaultGeminiToolPreferences: {
    googleSearch: true,
    urlContext: true,
    codeExecution: false,
  },
  chatHistoryLimits: {
    users: 10,
    servers: 12,
    channels: 15,
  },
  recentChannelMessagesLimit: 15,
});

export default config;
