import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

function createAdminGuildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);
}

export const commands = Object.freeze([
  new SlashCommandBuilder().setName('clear_memory').setDescription('Clears the conversation history.'),
  new SlashCommandBuilder().setName('settings').setDescription('Opens up settings.'),
  new SlashCommandBuilder().setName('session').setDescription('Manage your conversation sessions.')
    .addSubcommand(subcmd => subcmd.setName('switch').setDescription('Switch to another session')
      .addStringOption(opt => opt.setName('id').setDescription('The ID of the session to switch to').setRequired(true)))
    .addSubcommand(subcmd => subcmd.setName('create').setDescription('Create a new session')
      .addStringOption(opt => opt.setName('name').setDescription('The name of the new session').setRequired(true)))
    .addSubcommand(subcmd => subcmd.setName('list').setDescription('List your conversation sessions'))
    .addSubcommand(subcmd => subcmd.setName('rename').setDescription('Rename a session')
      .addStringOption(opt => opt.setName('id').setDescription('The ID of the session to rename').setRequired(true))
      .addStringOption(opt => opt.setName('new_name').setDescription('The new name of the session').setRequired(true)))
    .addSubcommand(subcmd => subcmd.setName('delete').setDescription('Delete a session')
      .addStringOption(opt => opt.setName('id').setDescription('The ID of the session to delete').setRequired(true))),
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

export const sessionCommands = [
  {
    name: 'session',
    description: 'Manage conversation sessions',
    options: [
      {
        type: 1,
        name: 'switch',
        description: 'Switch to another session',
        options: [
          {
            type: 3,
            name: 'id',
            description: 'The ID of the session to switch to',
            required: true
          }
        ]
      },
      {
        type: 1,
        name: 'create',
        description: 'Create a new session',
        options: [
          {
            type: 3,
            name: 'name',
            description: 'The name of the new session',
            required: true
          }
        ]
      },
      {
        type: 1,
        name: 'list',
        description: 'List your conversation sessions'
      },
      {
        type: 1,
        name: 'rename',
        description: 'Rename a session',
        options: [
          {
            type: 3,
            name: 'id',
            description: 'The ID of the session to rename',
            required: true
          },
          {
            type: 3,
            name: 'new_name',
            description: 'The new name of the session',
            required: true
          }
        ]
      },
      {
        type: 1,
        name: 'delete',
        description: 'Delete a session',
        options: [
          {
            type: 3,
            name: 'id',
            description: 'The ID of the session to delete',
            required: true
          }
        ]
      }
    ]
  }
];
