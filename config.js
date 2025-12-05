/**
 * Bot Configuration
 * Centralized configuration for the Gemini Discord Bot
 */

// AI Model Configuration
const aiConfig = {
  /** The Gemini model to use */
  model: "gemini-2.5-flash",
  
  /** Safety settings for content filtering */
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  ],
  
  /** Generation parameters */
  generationConfig: {
    temperature: 1.0,
    topP: 0.95,
    thinkingConfig: {
      thinkingBudget: -1
    }
  },
  
  /** Available AI tools */
  tools: [
    { googleSearch: {} },
    { urlContext: {} },
    { codeExecution: {} }
  ]
};

// Response Configuration
const responseConfig = {
  /** Default response format: "Embedded" or "Normal" */
  defaultResponseFormat: "Embedded",
  
  /** Maximum characters before sending as file (Embedded) */
  maxEmbeddedChars: 3900,
  
  /** Maximum characters before sending as file (Normal) */
  maxNormalChars: 1900,
  
  /** Number of retry attempts for AI generation */
  maxRetryAttempts: 3,
  
  /** Delay between message updates (ms) */
  updateDelay: 500,
  
  /** Collector timeout for stop button (ms) */
  collectorTimeout: 120000,
  
  /** Typing indicator interval (ms) */
  typingInterval: 4000,
  
  /** Maximum typing duration (ms) */
  maxTypingDuration: 120000
};

// UI Configuration
const uiConfig = {
  /** Primary embed color */
  hexColour: "#505050",
  
  /** Color constants */
  colors: {
    primary: 0x505050,
    success: 0x00FF00,
    error: 0xFF0000,
    warning: 0xFFA500,
    info: 0x00FFFF,
    yellow: 0xFFFF00,
    white: 0xFFFFFF,
    softError: 0xFF5555
  },
  
  /** Whether to display personality customization buttons */
  shouldDisplayPersonalityButtons: true,
  
  /** Activity rotation interval (ms) */
  activityInterval: 30000
};

// Bot Behavior Configuration
const botConfig = {
  /** Whether the bot responds in DMs */
  workInDMs: true,
  
  /** Whether to send detailed retry errors to Discord */
  SEND_RETRY_ERRORS_TO_DISCORD: false,
  
  /** Default bot personality/system instruction */
  defaultPersonality: "You are Gemini, a large language model trained by Google. You are chatting with the user via the Gemini Discord bot. Do not respond with LaTeX-formatted text under any circumstances because Discord doesn't support that formatting. You are a multimodal model, equipped with the ability to read images, videos, and audio files.",
  
  /** Bot presence activities */
  activities: [
    { name: "With Code", type: "Playing" },
    { name: "Something", type: "Listening" },
    { name: "You", type: "Watching" }
  ],
  
  /** Default settings for new servers */
  defaultServerSettings: {
    serverChatHistory: false,
    settingsSaveButton: true,
    customServerPersonality: false,
    serverResponsePreference: false,
    responseStyle: "embedded"
  }
};

// File handling configuration
const fileConfig = {
  /** Supported file extensions for text extraction */
  supportedTextExtensions: ['.html', '.js', '.css', '.json', '.xml', '.csv', '.py', '.java', '.sql', '.log', '.md', '.txt', '.docx', '.pptx'],
  
  /** File extensions requiring special extraction */
  specialExtractExtensions: ['.pptx', '.docx'],
  
  /** Pastebin service URL */
  pastebinUrl: 'https://bin.mudfish.net',
  
  /** Pastebin TTL in minutes */
  pastebinTtl: 10080,
  
  /** Request timeout (ms) */
  requestTimeout: 3000,
  
  /** Video processing poll interval (ms) */
  videoProcessingInterval: 10000
};

// Export combined config for backward compatibility
export default {
  // AI Config
  model: aiConfig.model,
  safetySettings: aiConfig.safetySettings,
  generationConfig: aiConfig.generationConfig,
  tools: aiConfig.tools,
  
  // Response Config
  defaultResponseFormat: responseConfig.defaultResponseFormat,
  maxEmbeddedChars: responseConfig.maxEmbeddedChars,
  maxNormalChars: responseConfig.maxNormalChars,
  maxRetryAttempts: responseConfig.maxRetryAttempts,
  updateDelay: responseConfig.updateDelay,
  collectorTimeout: responseConfig.collectorTimeout,
  typingInterval: responseConfig.typingInterval,
  maxTypingDuration: responseConfig.maxTypingDuration,
  
  // UI Config
  hexColour: uiConfig.hexColour,
  colors: uiConfig.colors,
  shouldDisplayPersonalityButtons: uiConfig.shouldDisplayPersonalityButtons,
  activityInterval: uiConfig.activityInterval,
  
  // Bot Config
  workInDMs: botConfig.workInDMs,
  SEND_RETRY_ERRORS_TO_DISCORD: botConfig.SEND_RETRY_ERRORS_TO_DISCORD,
  defaultPersonality: botConfig.defaultPersonality,
  activities: botConfig.activities,
  defaultServerSettings: botConfig.defaultServerSettings,
  
  // File Config
  supportedTextExtensions: fileConfig.supportedTextExtensions,
  specialExtractExtensions: fileConfig.specialExtractExtensions,
  pastebinUrl: fileConfig.pastebinUrl,
  pastebinTtl: fileConfig.pastebinTtl,
  requestTimeout: fileConfig.requestTimeout,
  videoProcessingInterval: fileConfig.videoProcessingInterval
};

// Named exports for modular access
export { aiConfig, responseConfig, uiConfig, botConfig, fileConfig };
