import React from "react";
import { CommandPanel } from "./CommandPanel";
import type { DbId } from "../orca";

type RootLike = {
  render: (node: React.ReactElement) => void;
  unmount: () => void;
};

export type CommandPanelHandle = {
  open: (blockId?: DbId) => Promise<void>;
  close: () => void;
  unmount: () => void;
};

export function mountCommandPanel(pluginName: string): CommandPanelHandle {
  const container = document.createElement("div");
  container.id = `${pluginName}-command-panel-root`;
  document.body.appendChild(container);

  const root = window.createRoot(container) as RootLike;
  let isOpen = false;
  let blockId: DbId | undefined;

  const close = () => {
    isOpen = false;
    render();
  };

  const open = async (nextBlockId?: DbId) => {
    isOpen = true;
    blockId = nextBlockId;
    render();
  };

  const render = () => {
    root.render(
      React.createElement(CommandPanel, {
        pluginName,
        isOpen,
        blockId,
        onClose: close,
      }),
    );
  };

  render();

  return {
    open,
    close,
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}
