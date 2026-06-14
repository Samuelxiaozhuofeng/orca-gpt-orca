import React from "react";
import { resolveBlockContext } from "./resolveBlockContext";
import type { DbId } from "../orca";

export type OpenPanel = (blockId?: DbId) => Promise<void>;

export type CommandRegistration = {
  cleanup: () => Promise<void>;
};

export async function registerAiCommands(
  pluginName: string,
  shortcut: string,
  openPanel: OpenPanel,
  openSettingsPage: () => void,
): Promise<CommandRegistration> {
  const commandId = `${pluginName}.openAiPanel`;
  const settingsCommandId = `${pluginName}.openAiSettings`;
  const slashId = `${pluginName}.slashOpenAiPanel`;
  const blockMenuId = `${pluginName}.blockMenuOpenAiPanel`;

  orca.commands.registerCommand(
    commandId,
    async () => {
      await openPanel();
    },
    "Orca AI: Open panel",
  );

  orca.commands.registerCommand(
    settingsCommandId,
    openSettingsPage,
    "Orca AI: Open settings",
  );

  await orca.shortcuts.assign(shortcut, commandId);

  orca.slashCommands.registerSlashCommand(slashId, {
    icon: "ti ti-sparkles",
    group: "AI",
    title: "AI 快捷处理",
    command: commandId,
  });

  orca.blockMenuCommands.registerBlockMenuCommand(blockMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId, _rootBlockId, close) =>
      React.createElement(orca.components.MenuText, {
        preIcon: "ti ti-sparkles",
        title: "AI 快捷处理",
        onClick: async () => {
          close();
          await openPanel(blockId);
        },
      }),
  });

  return {
    cleanup: async () => {
      orca.blockMenuCommands.unregisterBlockMenuCommand(blockMenuId);
      orca.slashCommands.unregisterSlashCommand(slashId);
      await orca.shortcuts.assign("", commandId);
      orca.commands.unregisterCommand(settingsCommandId);
      orca.commands.unregisterCommand(commandId);
    },
  };
}

export async function assertCurrentBlock(): Promise<void> {
  await resolveBlockContext();
}
