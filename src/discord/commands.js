import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

function createAdminGuildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild);
}

export const commands = Object.freeze([
  new SlashCommandBuilder().setName('clear_memory').setDescription('Clears the conversation history.'),
  new SlashCommandBuilder().setName('settings').setDescription('Opens up settings.'),
  createAdminGuildCommand('server_settings', 'Opens up the server settings.'),
  createAdminGuildCommand('channel_settings', 'Opens up the channel settings for this channel.'),
  createAdminGuildCommand('block', 'Blocks a user from using certain interactions.').addUserOption((option) =>
    option.setName('user').setDescription('The user to block.').setRequired(true),
  ),
  createAdminGuildCommand('unblock', 'Removes a user from the block list.').addUserOption((option) =>
    option.setName('user').setDescription('The user to unblock.').setRequired(true),
  ),
  new SlashCommandBuilder().setName('status').setDescription('Displays bot CPU and RAM usage in detail.'),
]);
