import { readOpenAiStream } from "./streamParser";
import type { AiProvider, ChatMessage } from "../types/ai";

type FetchModelsResponse = {
  data?: Array<{ id?: string }>;
};

type StreamChatOptions = {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
  onToken: (token: string) => void;
};

export async function fetchProviderModels(
  provider: AiProvider,
): Promise<string[]> {
  assertProviderReady(provider, false);

  const response = await fetch(`${provider.apiBaseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(await buildHttpError("Fetch models failed", response));
  }

  const json = (await response.json()) as FetchModelsResponse;
  const models =
    json.data
      ?.map((model) => model.id)
      .filter((model): model is string => typeof model === "string") ?? [];

  if (models.length === 0) {
    throw new Error("Models API returned no model IDs.");
  }

  return models;
}

export async function streamChatCompletion({
  provider,
  model,
  messages,
  temperature,
  maxTokens,
  signal,
  onToken,
}: StreamChatOptions): Promise<string> {
  assertProviderReady(provider, true);

  const response = await fetch(`${provider.apiBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await buildHttpError("Chat completion failed", response));
  }

  return readOpenAiStream(response, onToken);
}

function assertProviderReady(provider: AiProvider, requireModel: boolean): void {
  if (!provider.apiBaseUrl.trim()) {
    throw new Error(`Provider ${provider.name} is missing an API base URL.`);
  }

  if (!provider.apiKey.trim()) {
    throw new Error(`Provider ${provider.name} is missing an API key.`);
  }

  if (requireModel && !provider.defaultModel?.trim()) {
    return;
  }
}

async function buildHttpError(prefix: string, response: Response): Promise<string> {
  const body = await response.text();
  const summary = body.trim().slice(0, 600);
  return summary
    ? `${prefix}: ${response.status} ${response.statusText}. ${summary}`
    : `${prefix}: ${response.status} ${response.statusText}.`;
}
