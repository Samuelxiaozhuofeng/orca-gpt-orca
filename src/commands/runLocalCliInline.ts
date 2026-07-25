/**
 * Inline Local CLI: run the current block as a CLI prompt.
 *
 * A single child status block is created under the instruction block and
 * updated with a concise status line while running. Full terminal transcript
 * stays in memory only. On success the same child is replaced with the
 * extracted final result; on failure/cancel it gets a short error message.
 */

import type { ContentFragment, DbId } from "../orca";
import type { AiBlockContext } from "../types/ai";
import { getAiSettings } from "../settings/readSettings";
import { resolveBlockContext } from "./resolveBlockContext";
import {
  assertLocalCliReady,
  parseCliArgs,
  resolveLocalCliCwd,
  runLocalCli,
} from "../services/localCliRunner";
import {
  deriveLocalCliStatusLine,
  extractLocalCliFinalResult,
} from "../services/extractLocalCliFinalResult";

/** Throttle status-block updates during streaming (ms). */
const STATUS_THROTTLE_MS = 1000;

export async function runLocalCliInline(
  pluginName: string,
  blockId?: DbId,
  rootBlockId?: DbId,
): Promise<void> {
  let accumulated = "";
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStatusAt = 0;
  let statusBlockId: DbId | null = null;
  let command = "";
  let cwd = "";
  let isTerminal = false;
  let writeChain: Promise<void> = Promise.resolve();

  const clearThrottle = () => {
    if (throttleTimer != null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  };

  const pushStatusUpdate = (force = false) => {
    if (statusBlockId == null || isTerminal) return;
    const now = Date.now();
    if (!force && now - lastStatusAt < STATUS_THROTTLE_MS) {
      if (throttleTimer != null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (statusBlockId == null || isTerminal) return;
        lastStatusAt = Date.now();
        void queueStatusBlockWrite(
          buildRunningStatusText(
            command,
            cwd,
            deriveLocalCliStatusLine(accumulated),
          ),
        ).catch((err) => {
          console.error("Local CLI status block update failed:", err);
        });
      }, STATUS_THROTTLE_MS - (now - lastStatusAt));
      return;
    }
    clearThrottle();
    lastStatusAt = now;
    void queueStatusBlockWrite(
      buildRunningStatusText(
        command,
        cwd,
        deriveLocalCliStatusLine(accumulated),
      ),
    ).catch((err) => {
      console.error("Local CLI status block update failed:", err);
    });
  };

  const queueStatusBlockWrite = (text: string): Promise<void> => {
    if (statusBlockId == null) {
      return Promise.reject(new Error("Local CLI 状态 block 尚未创建。"));
    }
    const id = statusBlockId;
    writeChain = writeChain
      .catch(() => {
        // Keep later writes alive so final/error content can still land.
      })
      .then(() => setBlockContent(id, text));
    return writeChain;
  };

  try {
    const context = await resolveBlockContext(blockId, rootBlockId);

    const settings = await getAiSettings(pluginName);
    const localCli = settings.localCli;

    if (!localCli?.enabled) {
      const message = "Local CLI 未启用。请在设置 → Local CLI 中打开开关。";
      orca.notify("error", message);
      return;
    }

    assertLocalCliReady(localCli);

    const rawPrompt = context.blockText.trim();
    if (!rawPrompt) {
      throw new Error("当前 block 没有可处理的文本。");
    }

    const resolved = await resolveLocalCliCwd(rawPrompt, localCli, context);
    cwd = resolved.cwd;
    const cliPrompt = resolved.prompt;
    if (!cliPrompt.trim()) {
      throw new Error(
        "Local CLI prompt 在去掉 `cwd:` 指令后为空。请补充要执行的内容。",
      );
    }
    command = localCli.command;
    const inlinePrompt = buildInlineCliPrompt(cliPrompt);

    statusBlockId = await insertChildResultBlock(
      context,
      buildRunningStatusText(command, cwd, "Starting..."),
    );

    const controller = new AbortController();

    const output = await runLocalCli({
      settings: localCli,
      request: {
        prompt: inlinePrompt,
        cwd,
        command: localCli.command,
        args: parseCliArgs(localCli.args),
        timeoutMs: localCli.timeoutMs,
      },
      signal: controller.signal,
      onToken: (token) => {
        accumulated += token;
        pushStatusUpdate();
      },
    });

    clearThrottle();
    isTerminal = true;
    await writeChain.catch(() => undefined);
    accumulated = output;

    // Bridge stream has no guaranteed final-answer delimiter. Prefer explicit
    // markers when present; otherwise fall back to cleaned full output.
    const extracted = extractLocalCliFinalResult(output);
    const finalText = extracted.text.trim();
    if (!finalText) {
      throw new Error(
        "Local CLI 完成但未能提取到可写入的最终结果（输出为空或仅含 stderr）。",
      );
    }

    await queueStatusBlockWrite(finalText);

    orca.notify(
      "success",
      `Local CLI 完成（${localCli.command} · ${cwd}）。`,
    );
  } catch (err) {
    clearThrottle();
    isTerminal = true;
    console.error(err);

    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message)));

    const lastActivity = accumulated.trim()
      ? deriveLocalCliStatusLine(accumulated)
      : "";

    if (statusBlockId != null) {
      try {
        await writeChain.catch(() => undefined);
        if (aborted) {
          await queueStatusBlockWrite(
            buildTerminalStatusText({
              title: "Local CLI cancelled",
              command,
              cwd,
              message: "Cancelled",
              lastActivity,
            }),
          );
        } else {
          const message = err instanceof Error ? err.message : String(err);
          await queueStatusBlockWrite(
            buildTerminalStatusText({
              title: "Local CLI failed",
              command,
              cwd,
              message,
              lastActivity,
            }),
          );
        }
      } catch (writeErr) {
        console.error(
          "Local CLI failed to write error/cancel status block:",
          writeErr,
        );
      }
    }

    if (aborted) {
      orca.notify("warn", "Local CLI 已取消。");
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    orca.notify("error", message);
  } finally {
    clearThrottle();
  }
}

function buildInlineCliPrompt(prompt: string): string {
  return [
    prompt.trim(),
    "",
    "---",
    "输出要求：执行过程可以正常输出到终端；最终给用户写入笔记的答案必须以单独一行 `FINAL:` 开头，`FINAL:` 之后只放最终结果，不要包含搜索过程、思考过程、工具调用日志或终端流水。",
  ].join("\n");
}

function buildRunningStatusText(
  command: string,
  cwd: string,
  status: string,
): string {
  return [
    "Local CLI running",
    "",
    `Command: ${command || "(unknown)"}`,
    `CWD: ${cwd || "(unknown)"}`,
    `Status: ${status}`,
  ].join("\n");
}

function buildTerminalStatusText(opts: {
  title: string;
  command: string;
  cwd: string;
  message: string;
  lastActivity: string;
}): string {
  const lines = [
    opts.title,
    "",
    `Command: ${opts.command || "(unknown)"}`,
    `CWD: ${opts.cwd || "(unknown)"}`,
    `Error: ${opts.message}`,
  ];
  if (opts.lastActivity) {
    lines.push(`Last activity: ${opts.lastActivity}`);
  }
  return lines.join("\n");
}

function textToContent(text: string): ContentFragment[] {
  return [{ t: "t", v: text }];
}

async function setBlockContent(blockId: DbId, text: string): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    null,
    [{ id: blockId, content: textToContent(text) }],
    false,
  );
}

async function insertChildResultBlock(
  context: AiBlockContext,
  initialText: string,
): Promise<DbId> {
  const newBlockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    context.cursor,
    context.block,
    "lastChild",
    textToContent(initialText),
  )) as DbId;

  if (typeof newBlockId !== "number" || !Number.isFinite(newBlockId)) {
    throw new Error(
      `创建状态 block 失败：insertBlock 未返回有效 block id（得到: ${String(newBlockId)}）。`,
    );
  }

  return newBlockId;
}
