import type { AiSettings } from "../types/ai";

const AI_SETTINGS_KEY = "ai-settings";

export async function loadStoredAiSettings(
  pluginName: string,
): Promise<Partial<AiSettings>> {
  const raw = await orca.plugins.getData(pluginName, AI_SETTINGS_KEY);
  if (raw == null || raw === "") return {};

  if (typeof raw !== "string") {
    throw new Error("AI settings data must be stored as a JSON string.");
  }

  const parsed = JSON.parse(raw) as unknown;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI settings data must be an object.");
  }

  return parsed as Partial<AiSettings>;
}

export async function storeAiSettings(
  pluginName: string,
  settings: AiSettings,
): Promise<void> {
  await orca.plugins.setData(
    pluginName,
    AI_SETTINGS_KEY,
    JSON.stringify(settings),
  );
}
