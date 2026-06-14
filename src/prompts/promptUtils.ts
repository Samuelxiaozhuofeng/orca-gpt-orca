import { defaultPrompts } from "./defaultPrompts";
import type {
  AiSettings,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";

export function getAvailablePrompts(settings: AiSettings): PromptTemplate[] {
  const customPrompts = settings.customPrompts.filter(
    (prompt) => prompt.enabled !== false,
  );
  return [...defaultPrompts, ...customPrompts];
}

export function resolvePromptConfig(
  settings: AiSettings,
  prompt: PromptTemplate,
): ResolvedPromptConfig {
  const override = settings.promptOverrides.find(
    (item) => item.promptId === prompt.id,
  );
  const providerId =
    prompt.providerId ?? override?.providerId ?? settings.defaultProviderId;
  const provider =
    settings.providers.find((item) => item.id === providerId) ??
    settings.providers[0];

  const model =
    prompt.model ??
    override?.model ??
    provider.defaultModel ??
    settings.defaultModel;

  if (!provider) {
    throw new Error("No AI provider is configured.");
  }

  if (!provider.apiKey.trim()) {
    throw new Error(`Provider ${provider.name} is missing an API key.`);
  }

  if (!model.trim()) {
    throw new Error(`Provider ${provider.name} has no model selected.`);
  }

  return {
    provider,
    model,
    temperature:
      prompt.temperature ?? override?.temperature ?? settings.temperature,
    outputMode: prompt.outputMode ?? override?.outputMode ?? "ask",
  };
}

export function buildUserMessage(instruction: string, blockText: string): string {
  return `${instruction.trim()}\n\n以下是当前 block 内容：\n${blockText}`;
}

export function makeTemporaryPrompt(instruction: string): PromptTemplate {
  return {
    id: `temp-${Date.now()}`,
    name: "临时 prompt",
    instruction,
    resultKind: "text",
    outputMode: "ask",
    builtin: false,
  };
}
