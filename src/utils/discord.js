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

export const EMBED_THEME = Object.freeze({
  primary: EMBED_COLOR,
  info: 0x3BA55D,
  success: 0x2ECC71,
  warning: 0xF1C40F,
  error: 0xE74C3C,
  muted: 0x95A5A6,
});

export const MESSAGE_VARIANTS = Object.freeze({
  primary: Object.freeze({ color: EMBED_THEME.primary, icon: '🧠' }),
  info: Object.freeze({ color: EMBED_THEME.info, icon: 'ℹ️' }),
  success: Object.freeze({ color: EMBED_THEME.success, icon: '✅' }),
  warning: Object.freeze({ color: EMBED_THEME.warning, icon: '⚠️' }),
  error: Object.freeze({ color: EMBED_THEME.error, icon: '❌' }),
  muted: Object.freeze({ color: EMBED_THEME.muted, icon: '•' }),
});

function formatVariantTitle(variant, title) {
  const config = MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.primary;
  if (!title) {
    return undefined;
  }

  return title.startsWith(config.icon) ? title : `${config.icon} ${title}`;
}

export function canSendEmbeds(channel) {
  if (!channel?.guild) return true;
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

export function createStatusEmbed({
  variant = 'primary',
  title,
  description,
  fields,
  author,
  footer,
  timestamp = true,
}) {
  const config = MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.primary;

  return createEmbed({
    color: config.color,
    title: formatVariantTitle(variant, title),
    description,
    fields,
    author,
    footer,
    timestamp,
  });
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

export function buildTextModal({
  modalId,
  title,
  inputId,
  label,
  placeholder,
  value,
  minLength = 10,
  maxLength = 4000,
}) {
  const input = new TextInputBuilder()
    .setCustomId(inputId)
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(placeholder)
    .setMinLength(minLength)
    .setMaxLength(maxLength);

  if (typeof value === 'string') {
    input.setValue(value);
  }

  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

export async function replyWithEmbed(interaction, {
  color,
  variant = 'primary',
  title,
  description,
  fields,
  flags = MessageFlags.Ephemeral,
  components,
  files,
  content,
  timestamp,
  footer,
}) {
  const embed = color === undefined
    ? createStatusEmbed({ variant, title, description, fields, timestamp, footer })
    : createEmbed({ color, title, description, fields, timestamp, footer });

  const payload = {
    content,
    embeds: [embed],
    components,
    files,
    flags,
  };

  return interaction.reply(applyEmbedFallback(interaction.channel, payload));
}

export async function ensureGuildInteraction(interaction, description = 'This command can only be used in a server.') {
  if (interaction.guild) {
    return true;
  }

  await replyWithEmbed(interaction, {
    variant: 'error',
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
    variant: 'error',
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
