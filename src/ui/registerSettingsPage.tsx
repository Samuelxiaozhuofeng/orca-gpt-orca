import React from "react";
import { SettingsPage } from "./SettingsPage";

export type SettingsPageRegistration = {
  panelType: string;
  open: () => void;
  cleanup: () => void;
};

export function registerSettingsPage(pluginName: string): SettingsPageRegistration {
  const panelType = `${pluginName}.settings`;
  const Renderer = (props: any) =>
    React.createElement(SettingsPage, { ...props, pluginName });

  orca.panels.registerPanel(panelType, Renderer);

  return {
    panelType,
    open: () => {
      orca.nav.goTo(panelType, { pluginName });
    },
    cleanup: () => {
      orca.panels.unregisterPanel(panelType);
    },
  };
}
