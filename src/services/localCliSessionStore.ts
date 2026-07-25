import type { DbId } from "../orca";
import type { LocalCliSettings } from "../types/ai";
import {
  parseCliArgs,
  runLocalCli,
  type LocalCliRunRequest,
} from "./localCliRunner";
import {
  deriveLocalCliStatusLine,
  extractLocalCliFinalResult,
} from "./extractLocalCliFinalResult";

const STORE_KEY = "local-cli-sessions";
const SESSION_EVENT = "orca-gpt-local-cli-session-updated";
const ACTIVITY_UPDATE_MS = 800;

export type LocalCliSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type LocalCliSessionStatus = "idle" | "running" | "failed";

export type LocalCliSession = {
  id: string;
  sourceBlockId: DbId;
  panelBlockId?: DbId;
  cwd: string;
  command: string;
  args: string[];
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
  status: LocalCliSessionStatus;
  messages: LocalCliSessionMessage[];
  activity?: string;
  activeAssistantMessageId?: string;
  error?: string;
};

export type LocalCliSessionMeta = {
  sourceBlockId: DbId;
  cwd: string;
  command: string;
  args: string[];
  timeoutMs: number;
};

type SessionMap = Record<string, LocalCliSession>;

export function createLocalCliSessionId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `cli-${random}`;
}

export async function createLocalCliSession(
  pluginName: string,
  meta: LocalCliSessionMeta,
): Promise<LocalCliSession> {
  const now = new Date().toISOString();
  const session: LocalCliSession = {
    id: createLocalCliSessionId(),
    sourceBlockId: meta.sourceBlockId,
    cwd: meta.cwd,
    command: meta.command,
    args: meta.args,
    timeoutMs: meta.timeoutMs,
    createdAt: now,
    updatedAt: now,
    status: "idle",
    messages: [],
  };
  await mutateSessions(pluginName, (sessions) => {
    sessions[session.id] = session;
  });
  emitLocalCliSessionUpdated(session.id);
  return session;
}

export async function setLocalCliSessionPanelBlock(
  pluginName: string,
  sessionId: string,
  panelBlockId: DbId,
): Promise<void> {
  await updateLocalCliSession(pluginName, sessionId, (session) => {
    session.panelBlockId = panelBlockId;
  });
}

export async function getLocalCliSession(
  pluginName: string,
  sessionId: string,
): Promise<LocalCliSession | null> {
  const sessions = await loadSessions(pluginName);
  return sessions[sessionId] ?? null;
}

export function subscribeLocalCliSession(
  sessionId: string,
  callback: () => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
    if (!detail?.sessionId || detail.sessionId === sessionId) {
      callback();
    }
  };
  window.addEventListener(SESSION_EVENT, handler);
  return () => window.removeEventListener(SESSION_EVENT, handler);
}

export async function runLocalCliSessionTurn(options: {
  pluginName: string;
  sessionId: string;
  userText: string;
  localCli: LocalCliSettings;
  signal: AbortSignal;
}): Promise<string> {
  const text = options.userText.trim();
  if (!text) {
    throw new Error("Local CLI follow-up 不能为空。");
  }

  const userMessage = createMessage("user", text);
  const assistantMessage = createMessage("assistant", "");
  let request: LocalCliRunRequest | null = null;

  await updateLocalCliSession(options.pluginName, options.sessionId, (session) => {
    session.messages.push(userMessage, assistantMessage);
    session.status = "running";
    session.activity = "正在启动 CLI...";
    session.error = undefined;
    session.activeAssistantMessageId = assistantMessage.id;
    request = {
      prompt: buildSessionPrompt(session.messages),
      cwd: session.cwd,
      command: session.command || options.localCli.command,
      args: session.args.length ? session.args : parseCliArgs(options.localCli.args),
      timeoutMs: session.timeoutMs || options.localCli.timeoutMs,
    };
  });

  if (!request) {
    throw new Error(`Local CLI session ${options.sessionId} 不存在。`);
  }

  let rawOutput = "";
  let lastActivityAt = 0;
  let activityWriteChain: Promise<void> = Promise.resolve();

  try {
    const output = await runLocalCli({
      settings: options.localCli,
      request,
      signal: options.signal,
      onToken: (token) => {
        rawOutput += token;
        const now = Date.now();
        if (now - lastActivityAt < ACTIVITY_UPDATE_MS) return;
        lastActivityAt = now;
        const activity = summarizeCliActivity(rawOutput);
        activityWriteChain = activityWriteChain
          .catch(() => {
            // Keep later activity updates alive so the final state still lands.
          })
          .then(() =>
            setLocalCliSessionActivity(
              options.pluginName,
              options.sessionId,
              activity,
            ),
          );
      },
    });
    await activityWriteChain.catch(() => undefined);
    const finalResult = extractLocalCliFinalResult(output);
    const finalText = finalResult.text.trim();
    if (!finalResult.usedMarker) {
      throw new Error(
        "Local CLI 已完成，但没有返回明确的 `FINAL:` 最终结论标记；为避免泄露推理或读取过程，已隐藏原始输出。请重试。",
      );
    }
    if (!finalText) {
      throw new Error("Local CLI 完成但未能提取到可展示的最终结论。");
    }

    await updateLocalCliSession(options.pluginName, options.sessionId, (session) => {
      const message = session.messages.find((item) => item.id === assistantMessage.id);
      if (message) message.content = finalText;
      session.status = "idle";
      session.activity = undefined;
      session.activeAssistantMessageId = undefined;
      session.error = undefined;
    });
    return finalText;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateLocalCliSession(options.pluginName, options.sessionId, (session) => {
      const active = session.messages.find((item) => item.id === assistantMessage.id);
      if (active && !active.content.trim()) {
        active.content = `Local CLI failed: ${message}`;
      }
      session.status = "failed";
      session.activity = undefined;
      session.activeAssistantMessageId = undefined;
      session.error = message;
    });
    throw err;
  }
}

async function setLocalCliSessionActivity(
  pluginName: string,
  sessionId: string,
  activity: string,
): Promise<void> {
  await updateLocalCliSession(pluginName, sessionId, (session) => {
    session.activity = activity;
  });
}

function createMessage(
  role: LocalCliSessionMessage["role"],
  content: string,
): LocalCliSessionMessage {
  return {
    id: createLocalCliSessionId(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

async function updateLocalCliSession(
  pluginName: string,
  sessionId: string,
  updater: (session: LocalCliSession) => void,
): Promise<void> {
  await mutateSessions(pluginName, (sessions) => {
    const session = sessions[sessionId];
    if (!session) {
      throw new Error(`Local CLI session ${sessionId} 不存在。`);
    }
    updater(session);
    session.updatedAt = new Date().toISOString();
  });
  emitLocalCliSessionUpdated(sessionId);
}

async function mutateSessions(
  pluginName: string,
  mutator: (sessions: SessionMap) => void,
): Promise<void> {
  const sessions = await loadSessions(pluginName);
  mutator(sessions);
  await orca.plugins.setData(pluginName, STORE_KEY, JSON.stringify(sessions));
}

async function loadSessions(pluginName: string): Promise<SessionMap> {
  const raw = await orca.plugins.getData(pluginName, STORE_KEY);
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string") {
    throw new Error("Local CLI sessions data must be stored as a JSON string.");
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Local CLI sessions data must be an object.");
  }
  return parsed as SessionMap;
}

function emitLocalCliSessionUpdated(sessionId: string): void {
  window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { sessionId } }));
}

function buildSessionPrompt(messages: LocalCliSessionMessage[]): string {
  const transcript = messages
    .filter((message) => message.content.trim())
    .map((message) => {
      const label = message.role === "user" ? "User" : "Assistant";
      return `${label}:\n${message.content.trim()}`;
    })
    .join("\n\n");

  return [
    "You are continuing the same Local CLI conversation for an Orca Note block.",
    "Use the conversation transcript below as context and answer the latest user message.",
    "Hide process details, private reasoning, tool logs, web/article reading steps, and terminal transcript from the user-facing answer.",
    "Your final user-facing answer must start with a single line `FINAL:`. Put only the concise conclusion after `FINAL:`.",
    "",
    transcript,
  ].join("\n");
}

function summarizeCliActivity(rawOutput: string): string {
  const status = deriveLocalCliStatusLine(rawOutput, 90);
  if (!status || status === "Waiting for output…") {
    return "正在等待 CLI 响应...";
  }

  const lower = status.toLowerCase();
  if (
    /read|reading|fetch|fetching|download|open|opening|crawl|浏览|读取|加载|抓取|访问|文章|网页/.test(
      lower,
    )
  ) {
    return "正在读取资料...";
  }
  if (/search|query|lookup|检索|搜索|查询/.test(lower)) {
    return "正在检索信息...";
  }
  if (/tool|call|invoke|execute|running|command|调用|执行|工具/.test(lower)) {
    return "正在调用工具...";
  }
  if (/analy|think|reason|summar|整理|分析|总结|归纳|推理/.test(lower)) {
    return "正在分析整理...";
  }
  if (/final|answer|结论|结果|输出/.test(lower)) {
    return "正在生成结论...";
  }

  return `正在处理：${status}`;
}
