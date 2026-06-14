import type { AiSettings, PromptTemplate } from "../types/ai";

export function addCustomPrompt(settings: AiSettings): AiSettings {
  return {
    ...settings,
    customPrompts: [...settings.customPrompts, createCustomPrompt()],
  };
}

function createCustomPrompt(): PromptTemplate {
  return {
    id: `custom-${Date.now()}`,
    name: "新 Prompt",
    instruction: "",
    resultKind: "text",
    outputMode: "ask",
    enabled: true,
    builtin: false,
  };
}
