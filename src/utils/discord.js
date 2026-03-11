import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { EMBED_COLOR } from '../constants.js';

export function canSendEmbeds(channel) {
  if (!channel.guild) return true;
  const me = channel.guild.members.me;
  if (!me) return true;
  const perms = channel.permissionsFor(me);
  return perms ? perms.has(PermissionsBitField.Flags.EmbedLinks) : true;
}

export function embedToPlainText(embed) {
  const data = embed?.data ?? embed;
  const parts = [];
  if (data.author?.name) parts.push(data.author.name);
  if (data.title) parts.push(`**${data.title}**`);
  if (data.description) parts.push(data.description);
  if (data.fields?.length) {
    for (const field of data.fields) {
      parts.push(`**${field.name}:** ${field.value}`);
    }
  }
  if (data.footer?.text) parts.push(`_${data.footer.text}_`);
  return parts.join('\n');
}

export function applyEmbedFallback(channel, payload) {
  if (!payload.embeds?.length || canSendEmbeds(channel)) return payload;
  const textParts = [];
  if (payload.content && payload.content.trim()) textParts.push(payload.content.trim());
  for (const embed of payload.embeds) {
    textParts.push(embedToPlainText(embed));
  }
  return { ...payload, content: textParts.join('\n\n') || 'No content.', embeds: [] };
}

export function createEmbed({ color = EMBED_COLOR, title, description, fields, author, footer, timestamp = false }) {
  const embed = new EmbedBuilder().setColor(color);

  if (title) {
    embed.setTitle(title);
  }

  if (description) {
    embed.setDescription(description);
  }

  if (fields?.length) {
    embed.addFields(...fields);
  }

  if (author) {
    embed.setAuthor(author);
  }

  if (footer) {
    embed.setFooter(footer);
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

export function buildButtonRows(buttonConfigs = []) {
  const buttons = buttonConfigs.map(({ customId, label, emoji, style, disabled }) => {
    const button = new ButtonBuilder().setCustomId(customId).setStyle(style);

    if (label) {
      button.setLabel(label);
    }

    if (emoji) {
      button.setEmoji(emoji);
    }

    if (disabled !== undefined) {
      button.setDisabled(disabled);
    }

    return button;
  });

  const rows = [];
  while (buttons.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(buttons.splice(0, 5)));
  }

  return rows;
}

export function buildTextModal({ modalId, title, inputId, label, placeholder, minLength = 10, maxLength = 4000 }) {
  const input = new TextInputBuilder()
    .setCustomId(inputId)
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(placeholder)
    .setMinLength(minLength)
    .setMaxLength(maxLength);

  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

export async function replyWithEmbed(interaction, { color, title, description, fields, flags = MessageFlags.Ephemeral, components, files, content }) {
  return interaction.reply({
    content,
    embeds: [createEmbed({ color, title, description, fields })],
    components,
    files,
    flags,
  });
}

export async function ensureGuildInteraction(interaction, description = 'This command can only be used in a server.') {
  if (interaction.guild) {
    return true;
  }

  await replyWithEmbed(interaction, {
    color: 0xFF0000,
    title: 'Server Command Only',
    description,
  });

  return false;
}

export async function ensureAdministrator(interaction, description = 'You need to be an admin to use this command.') {
  if (interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  await replyWithEmbed(interaction, {
    color: 0xFF0000,
    title: 'Admin Required',
    description,
  });

  return false;
}

export async function safeDeleteMessage(message) {
  try {
    await message.delete();
  } catch {
    return false;
  }

  return true;
}
