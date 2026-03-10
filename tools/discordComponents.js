import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
} from 'discord.js';

export function createButton({
  customId,
  label,
  emoji,
  style,
}) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(style);

  if (label) {
    button.setLabel(label);
  }

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}

export function createActionRowsFromButtons(buttonConfigs, maxButtonsPerRow = 5) {
  const buttons = buttonConfigs.map(createButton);
  const actionRows = [];

  while (buttons.length > 0) {
    actionRows.push(new ActionRowBuilder().addComponents(...buttons.splice(0, maxButtonsPerRow)));
  }

  return actionRows;
}

export function getOrCreateFirstActionRow(components = []) {
  if (components.length > 0 && components[0].type === ComponentType.ActionRow) {
    return ActionRowBuilder.from(components[0]);
  }

  return new ActionRowBuilder();
}

export async function appendButtonToMessage(botMessage, buttonConfig) {
  const actionRow = getOrCreateFirstActionRow(botMessage.components || []);
  const existingButtonIds = new Set(
    actionRow.components
      .map(component => component.data?.custom_id || component.customId)
      .filter(Boolean)
  );

  if (!existingButtonIds.has(buttonConfig.customId)) {
    actionRow.addComponents(createButton(buttonConfig));
  }

  return botMessage.edit({
    components: [actionRow]
  });
}
