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
  defaultProviderId: {
    label: "Default provider",
    description: "Provider ID used when a prompt does not override routing.",
    type: "string",
    defaultValue: DEFAULT_SETTINGS.defaultProviderId,
  },
  defaultModel: {
    label: "Default model",
    description: "Model used when a provider or prompt does not override it.",
    type: "string",
    defaultValue: DEFAULT_SETTINGS.defaultModel,
  },
  systemPrompt: {
    label: "System prompt",
    description: "Base instruction prepended to every AI request.",
    type: "string",
    defaultValue: DEFAULT_SETTINGS.systemPrompt,
  },
  temperature: {
    label: "Temperature",
    description: "Default sampling temperature for AI requests.",
    type: "number",
    defaultValue: DEFAULT_SETTINGS.temperature,
  },
  maxTokens: {
    label: "Max tokens",
    description: "Default maximum output token count.",
    type: "number",
    defaultValue: DEFAULT_SETTINGS.maxTokens,
  },
  providers: {
    label: "AI providers",
    description:
      "OpenAI-compatible provider configurations saved by the custom settings page.",
    type: "array",
    defaultValue: DEFAULT_SETTINGS.providers,
    arrayItemSchema: {
      id: {
        label: "Provider ID",
        type: "string",
      },
      name: {
        label: "Provider name",
        type: "string",
      },
      apiBaseUrl: {
        label: "API URL",
        type: "string",
      },
      apiKey: {
        label: "API Key",
        type: "string",
      },
      models: {
        label: "Models",
        type: "array",
        defaultValue: [],
        arrayItemSchema: {
          value: {
            label: "Model",
            type: "string",
          },
        },
      },
      defaultModel: {
        label: "Default model",
        type: "string",
      },
    },
  },
  promptOverrides: {
    label: "Prompt routing",
    description:
      "Prompt-specific provider, model, temperature, and output mode overrides.",
    type: "array",
    defaultValue: DEFAULT_SETTINGS.promptOverrides,
    arrayItemSchema: {
      promptId: {
        label: "Prompt ID",
        type: "string",
      },
      providerId: {
        label: "Provider ID",
        type: "string",
      },
      model: {
        label: "Model",
        type: "string",
      },
      temperature: {
        label: "Temperature",
        type: "number",
      },
      outputMode: {
        label: "Output mode",
        type: "singleChoice",
        choices: [
          { label: "Replace", value: "replace" },
          { label: "Insert", value: "insert" },
          { label: "Ask", value: "ask" },
        ],
      },
    },
  },
  customPrompts: {
    label: "Custom prompts",
    description: "User-defined prompt templates saved by the settings page.",
    type: "array",
    defaultValue: DEFAULT_SETTINGS.customPrompts,
    arrayItemSchema: {
      id: {
        label: "Prompt ID",
        type: "string",
      },
      name: {
        label: "Prompt name",
        type: "string",
      },
      description: {
        label: "Description",
        type: "string",
      },
      instruction: {
        label: "Instruction",
        type: "string",
      },
      providerId: {
        label: "Provider ID",
        type: "string",
      },
      model: {
        label: "Model",
        type: "string",
      },
      temperature: {
        label: "Temperature",
        type: "number",
      },
      outputMode: {
        label: "Output mode",
        type: "singleChoice",
        choices: [
          { label: "Replace", value: "replace" },
          { label: "Insert", value: "insert" },
          { label: "Ask", value: "ask" },
        ],
      },
      resultKind: {
        label: "Result kind",
        type: "singleChoice",
        choices: [
          { label: "Text", value: "text" },
          { label: "Tasks", value: "tasks" },
        ],
      },
      enabled: {
        label: "Enabled",
        type: "boolean",
        defaultValue: true,
      },
      builtin: {
        label: "Built in",
        type: "boolean",
        defaultValue: false,
      },
    },
  },
  settingsPageHint: {
    label: "AI settings page",
    description:
      "Use the command palette command 'Orca AI: Open settings' to configure providers, models, prompt routing, custom prompts, and history.",
    type: "string",
    defaultValue: "Open command palette and run Orca AI: Open settings.",
  },
};
