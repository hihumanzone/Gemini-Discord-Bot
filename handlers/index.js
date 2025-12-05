/**
 * Handler Module Exports
 * Re-exports all handler functions for convenient importing
 */

// Core event handlers
export { registerMessageHandler } from './messageHandler.js';
export { registerInteractionHandler } from './interactionHandler.js';

// Command handlers
export { handleCommandInteraction } from './commandHandler.js';

// AI Response handler
export { handleModelResponse } from './modelResponseHandler.js';

// Settings handlers (for direct use when needed)
export {
  showSettings,
  showDashboard,
  handleStatusCommand,
  handleClearMemoryCommand,
} from './settingsHandler.js';

// Server settings handlers
export {
  toggleServerWideChatHistory,
  toggleServerPersonality,
  toggleServerResponsePreference,
  clearServerChatHistory,
} from './serverSettingsHandler.js';
