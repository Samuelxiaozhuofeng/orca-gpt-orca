import { fetchProviderModels } from "./openaiClient";
import type { AiSettings } from "../types/ai";

export async function fetchAndStoreModels(
  settings: AiSettings,
  providerId: string,
): Promise<AiSettings> {
  const provider = settings.providers.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Provider ${providerId} does not exist.`);
  }

  const models = await fetchProviderModels(provider);
  const nextProviders = settings.providers.map((item) => {
    if (item.id !== providerId) return item;
    return {
      ...item,
      models,
      defaultModel: item.defaultModel || models[0],
    };
  });

  const defaultProvider =
    settings.defaultProviderId === providerId && !settings.defaultModel
      ? { defaultModel: models[0] }
      : {};

  return {
    ...settings,
    ...defaultProvider,
    providers: nextProviders,
  };
}
