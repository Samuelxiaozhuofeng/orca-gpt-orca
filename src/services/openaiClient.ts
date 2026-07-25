import { readOpenAiStream, type StreamChatResult } from "./streamParser";
import type {
  AiProvider,
  ChatMessage,
  OpenAITool,
} from "../types/ai";

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
  tools?: OpenAITool[];
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

  const json = parseJsonResponse(
    await response.text(),
    "Fetch models failed",
  ) as FetchModelsResponse;
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
  tools,
}: StreamChatOptions): Promise<StreamChatResult> {
  assertProviderReady(provider, true);

  const body: Record<string, unknown> = {
    model,
    messages: serializeMessages(messages),
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(`${provider.apiBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await buildHttpError("Chat completion failed", response));
  }

  return readOpenAiStream(response, onToken);
}

function serializeMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const out: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

    if (message.role === "assistant" && message.tool_calls?.length) {
      out.tool_calls = message.tool_calls;
      // Some providers reject null content when tool_calls are present; use empty string.
      if (out.content == null) out.content = "";
    }

    if (message.role === "tool") {
      out.tool_call_id = message.tool_call_id;
      if (message.name) out.name = message.name;
      out.content = message.content ?? "";
    }

    return out;
  });
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
  return `${prefix}: HTTP ${response.status} ${response.statusText}${summary ? ` — ${summary}` : ""}`;
}

function parseJsonResponse(text: string, prefix: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${prefix}: invalid JSON response.`);
  }
}
