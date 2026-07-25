import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Block, DbId } from "../orca";
import { getAiSettings } from "../settings/readSettings";
import {
  getLocalCliSession,
  runLocalCliSessionTurn,
  subscribeLocalCliSession,
  type LocalCliSession,
} from "../services/localCliSessionStore";

export const LOCAL_CLI_SESSION_RENDERER_TYPE = "orca-gpt.localCliSession";

let localCliSessionPluginName = "";

export function setLocalCliSessionPluginName(pluginName: string): void {
  localCliSessionPluginName = pluginName;
}

type LocalCliSessionBlockProps = {
  panelId: string;
  blockId: DbId;
  rndId: string;
  blockLevel: number;
  indentLevel: number;
  mirrorId?: DbId;
  initiallyCollapsed?: boolean;
  renderingMode?: "normal" | "simple" | "simple-children";
  sessionId: string;
  sourceBlockId?: DbId;
  cwd?: string;
  command?: string;
};

export default function LocalCliSessionBlock({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode,
  sessionId,
  cwd,
  command,
}: LocalCliSessionBlockProps) {
  const { BlockShell, BlockChildren } = orca.components;
  const { useSnapshot } = window.Valtio;
  const { blocks } = useSnapshot(orca.state);
  const block = blocks[mirrorId ?? blockId] as Block | undefined;
  const [session, setSession] = useState<LocalCliSession | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    if (!localCliSessionPluginName) {
      setLoadError("Local CLI session plugin name is not initialized.");
      return;
    }
    try {
      const next = await getLocalCliSession(localCliSessionPluginName, sessionId);
      setSession(next);
      setLoadError(next ? "" : `Local CLI session not found: ${sessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      console.error(err);
    }
  };

  useEffect(() => {
    void refresh();
    return subscribeLocalCliSession(sessionId, () => {
      void refresh();
    });
  }, [sessionId]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const childrenBlocks = useMemo(
    () =>
      block ? (
        <BlockChildren
          block={block}
          panelId={panelId}
          blockLevel={blockLevel}
          indentLevel={indentLevel}
          renderingMode={renderingMode}
        />
      ) : null,
    [BlockChildren, block, panelId, blockLevel, indentLevel, renderingMode],
  );

  const sendFollowUp = async () => {
    const text = draft.trim();
    if (!text || isSending || session?.status === "running") return;
    setDraft("");
    setIsSending(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    setCanStop(true);
    try {
      const settings = await getAiSettings(localCliSessionPluginName);
      if (!settings.localCli?.enabled) {
        throw new Error("Local CLI 未启用。请在设置 → Local CLI 中打开开关。");
      }
      await runLocalCliSessionTurn({
        pluginName: localCliSessionPluginName,
        sessionId,
        userText: text,
        localCli: settings.localCli,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted =
        err instanceof DOMException ||
        (err instanceof Error && /abort/i.test(err.message));
      if (!aborted) {
        const message = err instanceof Error ? err.message : String(err);
        setDraft(text);
        orca.notify("error", message);
        console.error(err);
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setCanStop(false);
      setIsSending(false);
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    setCanStop(false);
  };

  const insertLatestAsChild = async () => {
    const latest = [...(session?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim());
    if (!latest) {
      orca.notify("warn", "当前 session 还没有可插入的回答。");
      return;
    }
    const currentBlock = orca.state.blocks[blockId];
    if (!currentBlock) {
      throw new Error(`读取面板 block ${blockId} 失败，无法插入回答。`);
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      currentBlock,
      "lastChild",
      [{ t: "t", v: latest.content.trim() }],
    );
    orca.notify("success", "已插入最新回答。");
  };

  const isRunning = session?.status === "running" || isSending;
  const shortSessionId = sessionId.length > 18 ? `${sessionId.slice(0, 18)}...` : sessionId;
  const visibleMessages = (session?.messages ?? []).filter(
    (message) => message.role === "user" || message.content.trim(),
  );

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="orca-gpt-local-cli-session"
      contentClassName="orca-gpt-local-cli-session-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={
        <section className="orca-gpt-cli-panel">
          <header className="orca-gpt-cli-panel__header">
            <div>
              <div className="orca-gpt-cli-panel__title">Local CLI Session</div>
              <div className="orca-gpt-cli-panel__meta">
                {(session?.command || command || "cli") +
                  " · " +
                  (session?.cwd || cwd || "cwd unknown")}
              </div>
            </div>
            <span className={`orca-gpt-cli-panel__status is-${session?.status ?? "idle"}`}>
              {session?.status ?? "idle"}
            </span>
          </header>

          <div className="orca-gpt-cli-panel__session-id">{shortSessionId}</div>

          {loadError ? (
            <div className="orca-gpt-cli-panel__error">{loadError}</div>
          ) : null}

          {session?.error ? (
            <div className="orca-gpt-cli-panel__error">{session.error}</div>
          ) : null}

          {isRunning ? (
            <div className="orca-gpt-cli-panel__activity">
              <div className="orca-gpt-cli-panel__activity-dot" />
              <div>
                <div className="orca-gpt-cli-panel__activity-label">CLI</div>
                <div className="orca-gpt-cli-panel__activity-text">
                  {session?.activity || "正在处理..."}
                </div>
              </div>
            </div>
          ) : null}

          <div className="orca-gpt-cli-panel__messages">
            {visibleMessages.map((message) => (
              <article
                key={message.id}
                className={`orca-gpt-cli-panel__message is-${message.role}`}
              >
                <div className="orca-gpt-cli-panel__role">
                  {message.role === "user" ? "You" : "CLI"}
                </div>
                <pre>{message.content}</pre>
              </article>
            ))}
          </div>

          <div className="orca-gpt-cli-panel__composer">
            <textarea
              value={draft}
              disabled={isRunning}
              rows={2}
              placeholder="继续提问..."
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendFollowUp();
                }
              }}
            />
            <div className="orca-gpt-cli-panel__actions">
              <button type="button" onClick={sendFollowUp} disabled={isRunning || !draft.trim()}>
                Send
              </button>
              <button type="button" onClick={stop} disabled={!canStop}>
                Stop
              </button>
              <button type="button" onClick={insertLatestAsChild} disabled={isRunning}>
                Insert
              </button>
            </div>
          </div>
        </section>
      }
      childrenJsx={childrenBlocks}
    />
  );
}
