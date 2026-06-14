import { DEFAULT_SETTINGS } from "./schema";
import type {
  AiProvider,
  AiSettings,
  OutputMode,
  PromptOverride,
  PromptTemplate,
  ResultKind,
} from "../types/ai";

type UnknownRecord = Record<string, unknown>;

export function getAiSettings(pluginName: string): AiSettings {
  const raw = orca.state.plugins[pluginName]?.settings ?? {};

  const providers = normalizeProviders(raw.providers);
  const defaultProviderId = asString(
    raw.defaultProviderId,
    DEFAULT_SETTINGS.defaultProviderId,
  );

  return {
    shortcut: asString(raw.shortcut, DEFAULT_SETTINGS.shortcut),
    defaultProviderId,
    defaultModel: asString(raw.defaultModel, DEFAULT_SETTINGS.defaultModel),
    systemPrompt: asString(raw.systemPrompt, DEFAULT_SETTINGS.systemPrompt),
    temperature: asNumber(raw.temperature, DEFAULT_SETTINGS.temperature),
    maxTokens: asNumber(raw.maxTokens, DEFAULT_SETTINGS.maxTokens),
    providers,
    promptOverrides: normalizePromptOverrides(raw.promptOverrides),
    customPrompts: normalizeCustomPrompts(raw.customPrompts),
  };
}

export async function saveAiSettings(
  pluginName: string,
  settings: AiSettings,
): Promise<void> {
  await orca.plugins.setSettings("app", pluginName, normalizeSettings(settings));
}

export function normalizeSettings(settings: AiSettings): AiSettings {
  const providers = normalizeProviders(settings.providers);
  const defaultProvider =
    providers.find((provider) => provider.id === settings.defaultProviderId) ??
    providers[0];

  return {
    ...settings,
    shortcut: settings.shortcut.trim() || DEFAULT_SETTINGS.shortcut,
    defaultProviderId: defaultProvider.id,
    defaultModel: settings.defaultModel.trim(),
    systemPrompt:
      settings.systemPrompt.trim() || DEFAULT_SETTINGS.systemPrompt,
    temperature: finiteOrDefault(settings.temperature, DEFAULT_SETTINGS.temperature),
    maxTokens: Math.max(1, Math.floor(finiteOrDefault(settings.maxTokens, 1000))),
    providers,
    promptOverrides: normalizePromptOverrides(settings.promptOverrides),
    customPrompts: normalizeCustomPrompts(settings.customPrompts),
  };
}

export function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, "");
}

function normalizeProviders(value: unknown): AiProvider[] {
  const records = arrayOfRecords(value, "providers");
  const providers = records
    .map((record) => ({
      id: slugify(asString(record.id, "")),
      name: asString(record.name, ""),
      apiBaseUrl: normalizeApiBaseUrl(asString(record.apiBaseUrl, "")),
      apiKey: asString(record.apiKey, ""),
      models: normalizeModels(record.models),
      defaultModel: asString(record.defaultModel, ""),
    }))
    .filter((provider) => provider.id && provider.name && provider.apiBaseUrl);

  if (providers.length > 0) return providers;
  return DEFAULT_SETTINGS.providers.map((provider) => ({ ...provider }));
}

function normalizeModels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((model): model is string => typeof model === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,/)
      .map((model) => model.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePromptOverrides(value: unknown): PromptOverride[] {
  return arrayOfRecords(value, "promptOverrides")
    .map((record) => ({
      promptId: asString(record.promptId, ""),
      providerId: optionalString(record.providerId),
      model: optionalString(record.model),
      temperature:
        record.temperature == null ? undefined : asNumber(record.temperature, 0.7),
      outputMode: normalizeOutputMode(record.outputMode),
    }))
    .filter((override) => override.promptId);
}

function normalizeCustomPrompts(value: unknown): PromptTemplate[] {
  return arrayOfRecords(value, "customPrompts")
    .map((record) => ({
      id: asString(record.id, crypto.randomUUID()),
      name: asString(record.name, ""),
      description: optionalString(record.description),
      instruction: asString(record.instruction, ""),
      providerId: optionalString(record.providerId),
      model: optionalString(record.model),
      temperature:
        record.temperature == null ? undefined : asNumber(record.temperature, 0.7),
      outputMode: normalizeOutputMode(record.outputMode),
      resultKind: normalizeResultKind(record.resultKind),
      enabled: record.enabled !== false,
      builtin: false,
    }))
    .filter((prompt) => prompt.name && prompt.instruction);
}

function normalizeOutputMode(value: unknown): OutputMode | undefined {
  if (value === "replace" || value === "insert" || value === "ask") {
    return value;
  }
  return undefined;
}

function normalizeResultKind(value: unknown): ResultKind | undefined {
  if (value === "text" || value === "tasks") return value;
  return undefined;
}

function arrayOfRecords(value: unknown, label: string): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is UnknownRecord => item != null && typeof item === "object",
    );
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} must be an array`);
    }
    return parsed.filter(
      (item): item is UnknownRecord => item != null && typeof item === "object",
    );
  }

  return [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return finiteOrDefault(value, fallback);
  if (typeof value === "string" && value.trim()) {
    return finiteOrDefault(Number(value), fallback);
  }
  return fallback;
}

function finiteOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
