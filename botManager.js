import {
  activeRequests,
  client,
  createPartFromUri,
  genAI,
  initializeRuntime,
  TEMP_DIR,
  token,
} from './src/core/runtime.js';
import {
  addBlacklistedUser,
  chatHistoryLock,
  clearChatHistoryFor,
  clearCustomInstruction,
  getHistory,
  getServerSettings,
  getTimeUntilNextReset,
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  initializeGuildState,
  initializeState,
  isChannelUserActive,
  isUserBlacklisted,
  removeBlacklistedUser,
  saveStateToFile,
  setAlwaysRespondChannel,
  setChannelWideChatHistory,
  setCustomInstruction,
  setUserGeminiToolPreference,
  state,
  toggleChannelUserActive,
  toggleServerResponseStyle,
  toggleServerSetting,
  toggleUserResponseFormat,
  updateChatHistory,
} from './src/state/botState.js';

export {
  activeRequests,
  addBlacklistedUser,
  chatHistoryLock,
  clearChatHistoryFor,
  clearCustomInstruction,
  client,
  createPartFromUri,
  genAI,
  getHistory,
  getServerSettings,
  getTimeUntilNextReset,
  getUserGeminiToolPreferences,
  getUserResponsePreference,
  isChannelUserActive,
  isUserBlacklisted,
  removeBlacklistedUser,
  saveStateToFile,
  setAlwaysRespondChannel,
  setChannelWideChatHistory,
  setCustomInstruction,
  setUserGeminiToolPreference,
  state,
  TEMP_DIR,
  toggleChannelUserActive,
  toggleServerResponseStyle,
  toggleServerSetting,
  toggleUserResponseFormat,
  token,
  updateChatHistory,
};

export function initializeBlacklistForGuild(guildId) {
  initializeGuildState(guildId);
}

export async function initialize() {
  initializeRuntime();
  await initializeState();
  console.log('Bot state loaded and initialized.');
}
