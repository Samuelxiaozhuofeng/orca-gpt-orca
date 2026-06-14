import type { AiHistoryItem } from "../types/ai";

const HISTORY_KEY = "history";
const HISTORY_LIMIT = 10;

export async function getHistory(pluginName: string): Promise<AiHistoryItem[]> {
  const raw = await orca.plugins.getData(pluginName, HISTORY_KEY);
  if (raw == null || raw === "") return [];

  if (typeof raw !== "string") {
    throw new Error("AI history data must be stored as a JSON string.");
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AI history data must be an array.");
  }

  return parsed.filter(isHistoryItem).slice(0, HISTORY_LIMIT);
}

export async function appendHistory(
  pluginName: string,
  item: AiHistoryItem,
): Promise<AiHistoryItem[]> {
  const next = [item, ...(await getHistory(pluginName))].slice(0, HISTORY_LIMIT);
  await orca.plugins.setData(pluginName, HISTORY_KEY, JSON.stringify(next));
  return next;
}

function isHistoryItem(value: unknown): value is AiHistoryItem {
  if (value == null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.blockId === "number" &&
    typeof item.promptName === "string" &&
    typeof item.providerId === "string" &&
    typeof item.model === "string" &&
    typeof item.inputPreview === "string" &&
    typeof item.output === "string"
  );
}
