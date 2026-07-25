/**
 * Inline Local CLI: run the current block as a CLI prompt.
 *
 * A custom Local CLI session block is created under the instruction block.
 * The session id is stored in that block's _repr and the conversation is
 * persisted through the plugin data store so follow-up turns can continue.
 */

import type { ContentFragment, DbId } from "../orca";
import type { AiBlockContext } from "../types/ai";
import { getAiSettings } from "../settings/readSettings";
import { resolveBlockContext } from "./resolveBlockContext";
import {
  assertLocalCliReady,
  parseCliArgs,
  resolveLocalCliCwd,
} from "../services/localCliRunner";
import {
  createLocalCliSession,
  runLocalCliSessionTurn,
  setLocalCliSessionPanelBlock,
} from "../services/localCliSessionStore";
import { LOCAL_CLI_SESSION_RENDERER_TYPE } from "../ui/LocalCliSessionBlock";

export async function runLocalCliInline(
  pluginName: string,
  blockId?: DbId,
  rootBlockId?: DbId,
): Promise<void> {
  let command = "";
  let cwd = "";
  let sessionId = "";

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
    const args = parseCliArgs(localCli.args);
    const session = await createLocalCliSession(pluginName, {
      sourceBlockId: context.blockId,
      cwd,
      command,
      args,
      timeoutMs: localCli.timeoutMs,
    });
    sessionId = session.id;

    const panelBlockId = await insertSessionPanelBlock(context, {
      sessionId: session.id,
      cwd,
      command,
    });
    await setLocalCliSessionPanelBlock(pluginName, session.id, panelBlockId);

    const controller = new AbortController();
    void runLocalCliSessionTurn({
      pluginName,
      sessionId: session.id,
      userText: cliPrompt,
      localCli,
      signal: controller.signal,
    }).catch((err) => {
      console.error("Local CLI session failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      orca.notify("error", message);
    });

    orca.notify(
      "success",
      `Local CLI session 已创建（${localCli.command} · ${cwd}）。`,
    );
  } catch (err) {
    console.error(err);

    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message)));

    if (aborted) {
      orca.notify("warn", "Local CLI 已取消。");
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    orca.notify(
      "error",
      sessionId
        ? `${message}（session: ${sessionId} · ${command || "unknown"} · ${cwd || "unknown cwd"}）`
        : message,
    );
  }
}

function textToContent(text: string): ContentFragment[] {
  return [{ t: "t", v: text }];
}

async function insertSessionPanelBlock(
  context: AiBlockContext,
  repr: {
    sessionId: string;
    cwd: string;
    command: string;
  },
): Promise<DbId> {
  const newBlockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    context.cursor,
    context.block,
    "lastChild",
    textToContent("Local CLI session"),
    {
      type: LOCAL_CLI_SESSION_RENDERER_TYPE,
      sessionId: repr.sessionId,
      sourceBlockId: context.blockId,
      cwd: repr.cwd,
      command: repr.command,
    },
  )) as DbId;

  if (typeof newBlockId !== "number" || !Number.isFinite(newBlockId)) {
    throw new Error(
      `创建 Local CLI session 面板失败：insertBlock 未返回有效 block id（得到: ${String(newBlockId)}）。`,
    );
  }

  return newBlockId;
}
