import { setupL10N, t } from "./libs/l10n";
import { registerAiCommands, type CommandRegistration } from "./commands/registerCommands";
import { loadPanelStyles, type StyleHandle } from "./ui/loadPanelStyles";
import { mountCommandPanel, type CommandPanelHandle } from "./ui/mountCommandPanel";
import {
  registerSettingsPage,
  type SettingsPageRegistration,
} from "./ui/registerSettingsPage";
import { getAiSettings } from "./settings/readSettings";
import { settingsSchema } from "./settings/schema";
import zhCN from "./translations/zhCN";

let pluginName: string;
let panelHandle: CommandPanelHandle | null = null;
let commandRegistration: CommandRegistration | null = null;
let styleHandle: StyleHandle | null = null;
let settingsPageRegistration: SettingsPageRegistration | null = null;

export async function load(_name: string) {
  pluginName = _name;

  setupL10N(orca.state.locale, { "zh-CN": zhCN });
  await orca.plugins.setSettingsSchema(pluginName, settingsSchema);

  styleHandle = loadPanelStyles(pluginName);
  settingsPageRegistration = registerSettingsPage(pluginName);
  panelHandle = mountCommandPanel(pluginName);
  const settings = getAiSettings(pluginName);
  commandRegistration = await registerAiCommands(
    pluginName,
    settings.shortcut,
    panelHandle.open,
    () => settingsPageRegistration?.open(),
  );

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  await commandRegistration?.cleanup();
  commandRegistration = null;
  settingsPageRegistration?.cleanup();
  settingsPageRegistration = null;
  panelHandle?.unmount();
  panelHandle = null;
  styleHandle?.remove();
  styleHandle = null;
  console.log(t("plugin unloaded"));
}
