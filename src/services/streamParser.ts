import type { ToolCallInfo } from "../types/ai";

export type StreamChatResult = {
  content: string;
  toolCalls: ToolCallInfo[];
  finishReason: string | null;
};

type StreamDelta = {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

/**
 * Read an OpenAI-compatible chat.completions SSE stream.
 * Accumulates text tokens and incremental tool_calls deltas.
 */
export async function readOpenAiStream(
  response: Response,
  onToken: (token: string) => void,
): Promise<StreamChatResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is not readable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let finishReason: string | null = null;
  const toolCallAcc = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = parseStreamLine(line);
      if (parsed === "[DONE]") {
        return {
          content: output,
          toolCalls: finalizeToolCalls(toolCallAcc),
          finishReason,
        };
      }
      if (!parsed) continue;

      if (parsed.finishReason) {
        finishReason = parsed.finishReason;
      }

      if (parsed.content) {
        output += parsed.content;
        onToken(parsed.content);
      }

      if (parsed.toolCallDeltas?.length) {
        mergeToolCallDeltas(toolCallAcc, parsed.toolCallDeltas);
      }
    }
  }

  const tail = parseStreamLine(buffer);
  if (tail && tail !== "[DONE]") {
    if (tail.finishReason) finishReason = tail.finishReason;
    if (tail.content) {
      output += tail.content;
      onToken(tail.content);
    }
    if (tail.toolCallDeltas?.length) {
      mergeToolCallDeltas(toolCallAcc, tail.toolCallDeltas);
    }
  }

  return {
    content: output,
    toolCalls: finalizeToolCalls(toolCallAcc),
    finishReason,
  };
}

type ParsedLine =
  | {
      content?: string;
      toolCallDeltas?: NonNullable<StreamDelta["tool_calls"]>;
      finishReason?: string | null;
    }
  | "[DONE]"
  | null;

function parseStreamLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return null;

  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return "[DONE]";

  const parsed = JSON.parse(data) as {
    error?: { message?: string };
    choices?: Array<{
      delta?: StreamDelta;
      message?: StreamDelta;
      finish_reason?: string | null;
    }>;
  };

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const choice = parsed.choices?.[0];
  if (!choice) return null;

  const delta = choice.delta ?? choice.message ?? {};
  return {
    content:
      typeof delta.content === "string" && delta.content.length > 0
        ? delta.content
        : undefined,
    toolCallDeltas: Array.isArray(delta.tool_calls) ? delta.tool_calls : undefined,
    finishReason: choice.finish_reason ?? undefined,
  };
}

function mergeToolCallDeltas(
  acc: Map<number, { id: string; name: string; arguments: string }>,
  deltas: NonNullable<StreamDelta["tool_calls"]>,
): void {
  for (const delta of deltas) {
    const index = typeof delta.index === "number" ? delta.index : 0;
    const existing = acc.get(index) ?? { id: "", name: "", arguments: "" };

    if (typeof delta.id === "string" && delta.id) {
      existing.id = delta.id;
    }
    if (typeof delta.function?.name === "string" && delta.function.name) {
      existing.name += delta.function.name;
    }
    if (typeof delta.function?.arguments === "string") {
      existing.arguments += delta.function.arguments;
    }

    acc.set(index, existing);
  }
}

function finalizeToolCalls(
  acc: Map<number, { id: string; name: string; arguments: string }>,
): ToolCallInfo[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, value], index) => ({
      id: value.id || `call_${index}`,
      type: "function" as const,
      function: {
        name: value.name,
        arguments: value.arguments || "{}",
      },
    }))
    .filter((call) => call.function.name.trim().length > 0);
}
