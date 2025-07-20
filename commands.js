const commands = [
  {
    name: "respond_to_all",
    description: "Ensures the bot always responds to all messages in this channel.",
    options: [
      {
        name: "enabled",
        description: "Set to true to enable, or false to disable.",
        type: 5,
        required: true
      }
    ]
  },
  {
    name: "clear_memory",
    description: "Clears the conversation history."
  },
  {
    name: "settings",
    description: "Opens Up Settings."
  },
  {
    name: "server_settings",
    description: "Opens Up The Server Settings."
  },
  {
    name: "blacklist",
    description: "Blacklists a user from using certain interactions",
    options: [
      {
        type: 6,
        name: "user",
        description: "The user to blacklist",
        required: true
      }
    ]
  },
  {
    name: "whitelist",
    description: "Removes a user from the blacklist",
    options: [
      {
        type: 6,
        name: "user",
        description: "The user to whitelist",
        required: true
      }
    ]
  },
  {
    name: "status",
    description: "Displays bot CPU and RAM usage in detail."
  },
  {
    name: "toggle_channel_chat_history",
    description: "Ensures the bot shares the same chat history with everyone in the channel.",
    options: [
      {
        name: "enabled",
        description: "Set to true to enable chat wide history, or false to disable it.",
        type: 5,
        required: true
      },
      {
        name: "instructions",
        description: "Bot instructions for that channel.",
        type: 3,
        required: false
      }
    ]
  }
];

export { commands };
