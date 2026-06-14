export async function readOpenAiStream(
  response: Response,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is not readable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const token = parseStreamLine(line);
      if (token === "[DONE]") return output;
      if (token) {
        output += token;
        onToken(token);
      }
    }
  }

  const tail = parseStreamLine(buffer);
  if (tail && tail !== "[DONE]") {
    output += tail;
    onToken(tail);
  }

  return output;
}

function parseStreamLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return "";

  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return "[DONE]";

  const parsed = JSON.parse(data) as {
    error?: { message?: string };
    choices?: Array<{
      delta?: { content?: string };
      message?: { content?: string };
    }>;
  };

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  return (
    parsed.choices?.[0]?.delta?.content ??
    parsed.choices?.[0]?.message?.content ??
    ""
  );
}
