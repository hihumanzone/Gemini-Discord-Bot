import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

function createAdminGuildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);
}

export const commands = Object.freeze([
  createAdminGuildCommand('respond_to_all', 'Ensures the bot always responds to all messages in this channel.')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Set to true to enable, or false to disable.')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('clear_memory').setDescription('Clears the conversation history.'),
  new SlashCommandBuilder().setName('settings').setDescription('Opens up settings.'),
  createAdminGuildCommand('server_settings', 'Opens up the server settings.'),
  createAdminGuildCommand('blacklist', 'Blacklists a user from using certain interactions.').addUserOption((option) =>
    option.setName('user').setDescription('The user to blacklist.').setRequired(true),
  ),
  createAdminGuildCommand('whitelist', 'Removes a user from the blacklist.').addUserOption((option) =>
    option.setName('user').setDescription('The user to whitelist.').setRequired(true),
  ),
  new SlashCommandBuilder().setName('status').setDescription('Displays bot CPU and RAM usage in detail.'),
  createAdminGuildCommand(
    'toggle_channel_chat_history',
    'Ensures the bot shares the same chat history with everyone in the channel.',
  )
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Set to true to enable chat wide history, or false to disable it.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('instructions').setDescription('Bot instructions for that channel.').setRequired(false),
    ),
]);
