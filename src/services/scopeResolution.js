/**
 * Shared precedence and scope resolution helpers.
 *
 * These functions are intentionally pure so they can be reused by
 * services, handlers, and state helpers without creating import cycles.
 */

/**
 * Resolve response style using channel -> server -> user precedence.
 * @param {string|undefined|null} channelStyle
 * @param {string|undefined|null} serverStyle
 * @param {string} userStyle
 * @returns {string}
 */
export function resolveResponseStyle(channelStyle, serverStyle, userStyle) {
  if (channelStyle && channelStyle !== 'decide') {
    return channelStyle;
  }

  if (serverStyle && serverStyle !== 'decide') {
    return serverStyle;
  }

  return userStyle;
}

/**
 * Resolve action button visibility using channel -> server -> user precedence.
 * Channel/server values should be "on", "off", or "decide".
 * @param {string|undefined|null} channelSetting
 * @param {string|undefined|null} serverSetting
 * @param {boolean} userEnabled
 * @returns {boolean}
 */
export function resolveActionButtonVisibility(channelSetting, serverSetting, userEnabled) {
  if (channelSetting === 'on') return true;
  if (channelSetting === 'off') return false;

  if (serverSetting === 'on') return true;
  if (serverSetting === 'off') return false;

  return Boolean(userEnabled);
}

/**
 * Resolve conversation history scope and category.
 * @param {Object} params
 * @param {string|null|undefined} params.guildId
 * @param {string} params.channelId
 * @param {string} params.userHistoryId
 * @param {boolean} params.channelWideChatHistory
 * @param {boolean} params.serverWideChatHistory
 * @returns {{ historyId: string, category: 'users'|'channels'|'servers', shared: boolean }}
 */
export function resolveConversationScope({
  guildId,
  channelId,
  userHistoryId,
  channelWideChatHistory,
  serverWideChatHistory,
}) {
  if (!guildId) {
    return {
      historyId: userHistoryId,
      category: 'users',
      shared: false,
    };
  }

  if (channelWideChatHistory) {
    return {
      historyId: channelId,
      category: 'channels',
      shared: true,
    };
  }

  if (serverWideChatHistory) {
    return {
      historyId: guildId,
      category: 'servers',
      shared: true,
    };
  }

  return {
    historyId: userHistoryId,
    category: 'users',
    shared: false,
  };
}

/**
 * Resolve effective personality instructions using channel -> server -> user precedence.
 * Channel/server values are only considered when their corresponding feature flag is enabled.
 * @param {Object} params
 * @param {string|null|undefined} params.guildId
 * @param {string} params.channelId
 * @param {string} params.userId
 * @param {boolean} params.channelCustomEnabled
 * @param {boolean} params.serverCustomEnabled
 * @param {(targetId: string) => (string|undefined)} params.getInstruction
 * @param {string} params.defaultInstruction
 * @returns {string}
 */
export function resolveInstructionScope({
  guildId,
  channelId,
  userId,
  channelCustomEnabled,
  serverCustomEnabled,
  getInstruction,
  defaultInstruction,
}) {
  const userInstruction = getInstruction(userId);

  if (!guildId) {
    return userInstruction || defaultInstruction;
  }

  const channelInstruction = getInstruction(channelId);
  if (channelCustomEnabled && channelInstruction) {
    return channelInstruction;
  }

  const serverInstruction = getInstruction(guildId);
  if (serverCustomEnabled && serverInstruction) {
    return serverInstruction;
  }

  return userInstruction || defaultInstruction;
}

/**
 * Resolve which scope is currently enforcing a lock.
 * @param {*} channelValue
 * @param {*} serverValue
 * @param {(value: any) => boolean} [isLocked]
 * @returns {'channel'|'server'|null}
 */
export function resolveLockScope(
  channelValue,
  serverValue,
  isLocked = (value) => Boolean(value),
) {
  if (isLocked(channelValue)) {
    return 'channel';
  }

  if (isLocked(serverValue)) {
    return 'server';
  }

  return null;
}
