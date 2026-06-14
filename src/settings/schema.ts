import type { PluginSettingsSchema } from "../orca";
import type { AiSettings } from "../types/ai";

export const DEFAULT_SETTINGS: AiSettings = {
  shortcut: "meta+g",
  defaultProviderId: "openai",
  defaultModel: "",
  systemPrompt:
    "你是 Orca Note 中的中文写作与任务处理助手。请保持准确、简洁，不添加原文没有的信息。",
  temperature: 0.7,
  maxTokens: 1000,
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "",
      models: [],
      defaultModel: "",
    },
  ],
  promptOverrides: [],
  customPrompts: [],
};

export const settingsSchema: PluginSettingsSchema = {
  shortcut: {
    label: "Open AI panel shortcut",
    description: "Default shortcut. On macOS, meta+g is Command+G.",
    type: "string",
    defaultValue: DEFAULT_SETTINGS.shortcut,
  },
  settingsPageHint: {
    label: "AI settings page",
    description:
      "Use the command palette command 'Orca AI: Open settings' to configure providers, models, prompt routing, custom prompts, and history.",
    type: "string",
    defaultValue: "Open command palette and run Orca AI: Open settings.",
  },
};
