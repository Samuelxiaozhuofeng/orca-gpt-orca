import aiPanelCss from "../styles/ai-panel.css?inline";
import commandPanelCss from "../styles/command-panel.css?inline";

export type StyleHandle = {
  remove: () => void;
};

export function loadPanelStyles(pluginName: string): StyleHandle {
  const styleElement = document.createElement("style");
  styleElement.dataset.orcaAiPlugin = pluginName;
  styleElement.textContent = aiPanelCss + "\n" + commandPanelCss;
  document.head.appendChild(styleElement);

  return {
    remove: () => {
      styleElement.remove();
    },
  };
}
