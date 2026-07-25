/**
 * Local CLI via localhost HTTP bridge.
 *
 * Plugin never spawns processes. The bridge (scripts/local-cli-bridge.mjs)
 * runs the CLI and streams stdout/stderr back.
 *
 * Endpoints:
 * - GET  ${bridgeUrl}/health  → { ok: true }
 * - POST ${bridgeUrl}/run     → streaming text (SSE or plain chunks)
 */

import type { Block, BlockProperty, BlockRef, DbId } from "../orca";
import type { AiBlockContext, LocalCliSettings } from "../types/ai";

const CLI_TAG_NAME = "cli";
const CWD_PROPERTY_NAME = "cwd";
const PROP_TYPE_TEXT = 1;

export type LocalCliRunRequest = {
  prompt: string;
  cwd: string;
  command: string;
  /** Already-split args array. */
  args: string[];
  timeoutMs: number;
};

export type LocalCliRunOptions = {
  settings: LocalCliSettings;
  request: LocalCliRunRequest;
  signal: AbortSignal;
  onToken: (token: string) => void;
};

/** Pseudo prompt id used in the command panel when Local CLI is enabled. */
export const LOCAL_CLI_PROMPT_ID = "local-cli";

export function parseCliArgs(args: string): string[] {
  return args
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * If the first non-empty line is `cwd: /path`, strip it and return the path.
 * Accepts `cwd:/path` and `cwd: /path` (case-insensitive key).
 */
export function extractCwdDirective(prompt: string): {
  cwd: string | null;
  prompt: string;
} {
  const lines = prompt.split(/\r?\n/);
  let firstContentIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      firstContentIndex = i;
      break;
    }
  }
  if (firstContentIndex < 0) {
    return { cwd: null, prompt };
  }

  const match = lines[firstContentIndex].match(/^\s*cwd\s*:\s*(.+?)\s*$/i);
  if (!match) {
    return { cwd: null, prompt };
  }

  const cwd = match[1].trim();
  if (!cwd) {
    return { cwd: null, prompt };
  }

  const rest = [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    .join("\n")
    .replace(/^\n+/, "");
  return { cwd, prompt: rest };
}

/**
 * Resolve working directory for a Local CLI run.
 * Order: cwd: directive → current page #cli.cwd → error.
 */
export async function resolveLocalCliCwd(
  prompt: string,
  _settings: LocalCliSettings,
  context?: AiBlockContext,
): Promise<{ cwd: string; prompt: string }> {
  const extracted = extractCwdDirective(prompt);
  if (extracted.cwd) {
    return { cwd: extracted.cwd, prompt: extracted.prompt };
  }

  const pageCwd = context ? await resolvePageCliCwd(context) : "";
  if (pageCwd) {
    return { cwd: pageCwd, prompt };
  }

  throw new Error(
    "Local CLI 需要工作目录：请给当前页面添加 #cli 标签，并在该标签引用上设置文本属性 cwd；也可以在 prompt 首行加入 `cwd: /path/to/folder`。",
  );
}

async function resolvePageCliCwd(context: AiBlockContext): Promise<string> {
  const pageBlock =
    typeof context.rootBlockId === "number"
      ? await getBlockById(context.rootBlockId)
      : await getRootPageBlock(context.block);
  const cliRef = await findCliTagRef(pageBlock);
  if (!cliRef) return "";

  const cwdProperty = (cliRef.data ?? []).find(
    (property) =>
      normalizePropertyName(property.name) === CWD_PROPERTY_NAME &&
      property.type === PROP_TYPE_TEXT,
  );
  if (!cwdProperty) return "";

  return propertyValueToText(cwdProperty).trim();
}

async function getRootPageBlock(block: Block): Promise<Block> {
  let current = block;
  const visited = new Set<DbId>();

  while (typeof current.parent === "number") {
    if (visited.has(current.id)) {
      throw new Error(`查找当前页面失败：block parent 链出现循环（block ${current.id}）。`);
    }
    visited.add(current.id);
    current = await getBlockById(current.parent);
  }

  return current;
}

async function findCliTagRef(pageBlock: Block): Promise<BlockRef | null> {
  for (const ref of pageBlock.refs ?? []) {
    if (normalizeTagName(ref.alias) === CLI_TAG_NAME) {
      return ref;
    }

    const target = await getBlockById(ref.to);
    if (blockHasTagName(target, CLI_TAG_NAME)) {
      return ref;
    }
  }

  return null;
}

async function getBlockById(blockId: DbId): Promise<Block> {
  const cached = orca.state.blocks[blockId];
  if (cached) return cached;

  const block = (await orca.invokeBackend("get-block", blockId)) as Block | null;
  if (!block) {
    throw new Error(`读取 Orca block ${blockId} 失败，无法解析 Local CLI 工作目录。`);
  }
  return block;
}

function blockHasTagName(block: Block, expected: string): boolean {
  const names = [block.text, ...((block.aliases ?? []) as string[])];
  return names.some((name) => normalizeTagName(name) === expected);
}

function normalizePropertyName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeTagName(name: unknown): string {
  return typeof name === "string" ? name.trim().replace(/^#/, "").toLowerCase() : "";
}

function propertyValueToText(property: BlockProperty): string {
  const value = property.value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueToText).join("");
  return valueToText(value);
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueToText).join("");
  if (value != null && typeof value === "object" && "v" in value) {
    return valueToText((value as { v: unknown }).v);
  }
  return "";
}

export function assertLocalCliReady(settings: LocalCliSettings): void {
  if (!settings.enabled) {
    throw new Error("Local CLI 未启用。请在设置 → Local CLI 中打开开关。");
  }
  if (!settings.bridgeUrl.trim()) {
    throw new Error("Local CLI bridge URL 为空。");
  }
  if (!settings.command.trim()) {
    throw new Error("Local CLI command 为空。");
  }
}

function normalizeBridgeUrl(bridgeUrl: string): string {
  return bridgeUrl.trim().replace(/\/+$/, "");
}

function authHeaders(settings: LocalCliSettings): Record<string, string> {
  const token = settings.authToken.trim();
  if (!token) return {};
  return {
    Authorization: token.toLowerCase().startsWith("bearer ")
      ? token
      : `Bearer ${token}`,
  };
}

export async function testLocalCliConnection(
  settings: LocalCliSettings,
): Promise<string> {
  const base = normalizeBridgeUrl(settings.bridgeUrl);
  if (!base) {
    throw new Error("Local CLI bridge URL 为空。");
  }

  const response = await fetch(`${base}/health`, {
    method: "GET",
    headers: {
      ...authHeaders(settings),
    },
  });

  if (!response.ok) {
    throw new Error(await buildHttpError("Local CLI health failed", response));
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Local CLI health returned non-JSON: ${text.trim().slice(0, 200) || "(empty)"}`,
    );
  }

  if (
    body == null ||
    typeof body !== "object" ||
    (body as { ok?: unknown }).ok !== true
  ) {
    throw new Error(
      `Local CLI health unexpected response: ${text.trim().slice(0, 200)}`,
    );
  }

  return `已连接 Local CLI bridge（${base}）。`;
}

export async function runLocalCli({
  settings,
  request,
  signal,
  onToken,
}: LocalCliRunOptions): Promise<string> {
  assertLocalCliReady(settings);

  if (!request.cwd.trim()) {
    throw new Error("Local CLI cwd 为空。");
  }
  if (!request.prompt.trim()) {
    throw new Error("Local CLI prompt 为空。");
  }

  const base = normalizeBridgeUrl(settings.bridgeUrl);
  const response = await fetch(`${base}/run`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, text/plain, */*",
      ...authHeaders(settings),
    },
    body: JSON.stringify({
      prompt: request.prompt,
      cwd: request.cwd,
      command: request.command,
      args: request.args,
      timeoutMs: request.timeoutMs,
    }),
  });

  if (!response.ok) {
    throw new Error(await buildHttpError("Local CLI run failed", response));
  }

  if (!response.body) {
    throw new Error("Local CLI run: response body is missing.");
  }

  const output = await readSseOrTextStream(response, onToken);

  if (!output.trim()) {
    throw new Error(
      "Local CLI 完成但输出为空。请检查 bridge 日志、CLI 命令与 stderr。",
    );
  }

  return output;
}

/**
 * Robust stream reader: handles SSE `data: ...` lines (JSON or plain text)
 * and raw text/plain chunks.
 */
async function readSseOrTextStream(
  response: Response,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Local CLI run: streaming body is not readable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  /** When true, treat buffer as raw text (not line-oriented SSE). */
  const contentType =
    response.headers.get("Content-Type") ||
    response.headers.get("content-type") ||
    "";
  let sawSseLine = contentType.includes("text/event-stream");
  let decided = sawSseLine;

  const append = (chunk: string) => {
    if (!chunk) return;
    output += chunk;
    onToken(chunk);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const piece = decoder.decode(value, { stream: true });
    if (!piece) continue;

    if (!decided) {
      // Heuristic: if the first non-empty content looks like SSE, parse as SSE.
      const probe = (buffer + piece).trimStart();
      if (probe.startsWith("data:") || probe.startsWith(":")) {
        sawSseLine = true;
        decided = true;
      } else if (probe.includes("\n") || probe.length > 0) {
        // Prefer SSE if any complete line starts with data:
        const sample = buffer + piece;
        if (/(?:^|\n)data:/m.test(sample) || /(?:^|\n):/m.test(sample)) {
          sawSseLine = true;
        } else {
          sawSseLine = false;
        }
        decided = true;
      }
    }

    if (sawSseLine) {
      buffer += piece;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const token = parseSseDataLine(line);
        if (token != null) append(token);
      }
    } else {
      append(piece);
    }
  }

  if (sawSseLine) {
    const tail = parseSseDataLine(buffer);
    if (tail != null) append(tail);
  } else {
    const rest = decoder.decode();
    if (rest) append(rest);
  }

  return output;
}

/**
 * Parse one SSE line. Returns text to append, or null to skip.
 * - `data: [DONE]` → end marker (skip)
 * - `data: {"text":"..."}` / `{"content":"..."}` / `{"delta":"..."}` → extract
 * - `data: plain text` → as-is (plus newline if original had content)
 * - comments / event: / empty → skip
 */
function parseSseDataLine(line: string): string | null {
  const trimmed = line.trimEnd();
  if (!trimmed || trimmed.startsWith(":")) return null;
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice(5).replace(/^\s/, "");
  if (!payload || payload === "[DONE]") return null;

  if (payload.startsWith("{")) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      // Invalid JSON that started with `{` — treat as plain text.
      return payload;
    }

    if (typeof json.error === "string" && json.error.trim()) {
      throw new Error(json.error);
    }
    if (typeof json.text === "string") return json.text;
    if (typeof json.content === "string") return json.content;
    if (typeof json.delta === "string") return json.delta;
    if (typeof json.stderr === "string") {
      return json.stderr.startsWith("[stderr]")
        ? json.stderr
        : `[stderr] ${json.stderr}`;
    }
    // Lifecycle events from the bridge (done/exit) — skip.
    if (json.event === "done") return null;
    // Unknown JSON object — surface so nothing is swallowed.
    return JSON.stringify(json);
  }

  return payload;
}

async function buildHttpError(
  prefix: string,
  response: Response,
): Promise<string> {
  const body = await response.text();
  const summary = body.trim().slice(0, 600);
  return `${prefix}: HTTP ${response.status} ${response.statusText}${summary ? ` — ${summary}` : ""}`;
}
