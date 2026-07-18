import React, { useEffect, useRef } from "react";
import {
  useCommandPanelState,
  type VisibleChatMessage,
} from "./useCommandPanelState";
import type { DbId } from "../orca";

type CommandPanelProps = {
  pluginName: string;
  isOpen: boolean;
  blockId?: DbId;
  onClose: () => void;
};

export function CommandPanel({
  pluginName,
  isOpen,
  blockId,
  onClose,
}: CommandPanelProps) {
  const state = useCommandPanelState(pluginName, isOpen, blockId);
  const inputRef = useRef<HTMLInputElement>(null);
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  // Auto-focus command input when panel opens
  useEffect(() => {
    if (isOpen && state.phase === "input") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, state.phase]);

  // Focus follow-up box when generation finishes in chat phase
  useEffect(() => {
    if (
      isOpen &&
      state.phase === "chat" &&
      !state.isGenerating &&
      state.session
    ) {
      setTimeout(() => followUpRef.current?.focus(), 50);
    }
  }, [
    isOpen,
    state.phase,
    state.isGenerating,
    state.session,
    state.session?.visibleMessages.length,
  ]);

  // Auto-scroll conversation to latest content
  useEffect(() => {
    if (!conversationRef.current) return;
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [
    state.session?.visibleMessages,
    state.streamingContent,
    state.pendingUserMessage,
    state.isGenerating,
    state.error,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close/cancel
      if (e.key === "Escape") {
        e.preventDefault();
        if (state.isGenerating) {
          state.cancel();
        } else {
          onClose();
        }
        return;
      }

      // Input phase shortcuts
      if (state.phase === "input") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          state.setSelectedIndex((prev) =>
            Math.min(prev + 1, state.prompts.length - 1),
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          state.setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleExecute();
        }
        return;
      }

      // Chat phase shortcuts (follow-up textarea owns Enter / Shift+Enter)
      if (state.phase === "chat") {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (!state.isGenerating) {
            state.performAction("replace", onClose);
          }
        } else if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (!state.isGenerating) {
            state.regenerate();
          }
        } else if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
          // Preserve native copy when the user has selected text (incl. textarea)
          if (hasTextSelection(e.target)) {
            return;
          }
          e.preventDefault();
          if (!state.isGenerating) {
            state.performAction("copy", onClose);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, state, onClose]);

  const handleExecute = () => {
    const trimmedQuery = state.query.trim();
    const selectedPrompt = state.prompts[state.selectedIndex];

    if (trimmedQuery) {
      state.executeCommand(trimmedQuery, selectedPrompt);
    } else if (selectedPrompt) {
      state.executeCommand(selectedPrompt.instruction, selectedPrompt);
    }
  };

  if (!isOpen) return null;

  const contextLabel = state.context
    ? state.context.blockCount > 1
      ? `${state.context.blockCount} blocks selected`
      : "1 block"
    : "No context";

  return (
    <div className="orca-command-panel__backdrop" onClick={onClose}>
      <div
        className="orca-command-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {state.phase === "input" && (
          <InputPhase
            inputRef={inputRef}
            query={state.query}
            prompts={state.prompts}
            selectedIndex={state.selectedIndex}
            contextLabel={contextLabel}
            error={state.error}
            onQueryChange={state.setQuery}
            onSelectPrompt={(index) => {
              state.setSelectedIndex(index);
              handleExecute();
            }}
          />
        )}

        {state.phase === "chat" && (
          <ChatPhase
            conversationRef={conversationRef}
            followUpRef={followUpRef}
            visibleMessages={state.session?.visibleMessages ?? []}
            pendingUserMessage={state.pendingUserMessage}
            streamingContent={state.streamingContent}
            isGenerating={state.isGenerating}
            followUp={state.followUp}
            error={state.error}
            hasSession={Boolean(state.session)}
            onFollowUpChange={state.setFollowUp}
            onSendFollowUp={state.sendFollowUp}
            onRegenerate={state.regenerate}
            onInsert={() => state.performAction("insert", onClose)}
            onReplace={() => state.performAction("replace", onClose)}
            onCopy={() => state.performAction("copy", onClose)}
            onCancel={state.cancel}
          />
        )}
      </div>
    </div>
  );
}

function InputPhase({
  inputRef,
  query,
  prompts,
  selectedIndex,
  contextLabel,
  error,
  onQueryChange,
  onSelectPrompt,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  prompts: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  selectedIndex: number;
  contextLabel: string;
  error: string;
  onQueryChange: (value: string) => void;
  onSelectPrompt: (index: number) => void;
}) {
  return (
    <>
      <div className="orca-command-panel__input-section">
        <input
          ref={inputRef}
          type="text"
          className="orca-command-panel__input"
          placeholder="Type a command or search for template..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <span className="orca-command-panel__context-hint">{contextLabel}</span>
      </div>

      {error ? (
        <div className="orca-command-panel__error orca-command-panel__error--inline">
          {error}
        </div>
      ) : null}

      {prompts.length > 0 && (
        <div className="orca-command-panel__prompt-list">
          {prompts.slice(0, 5).map((prompt, index) => (
            <button
              key={prompt.id}
              type="button"
              className={
                index === selectedIndex
                  ? "orca-command-panel__prompt-item is-selected"
                  : "orca-command-panel__prompt-item"
              }
              onClick={() => onSelectPrompt(index)}
            >
              <span className="orca-command-panel__prompt-name">
                {prompt.name}
              </span>
              <span className="orca-command-panel__prompt-desc">
                {prompt.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ChatPhase({
  conversationRef,
  followUpRef,
  visibleMessages,
  pendingUserMessage,
  streamingContent,
  isGenerating,
  followUp,
  error,
  hasSession,
  onFollowUpChange,
  onSendFollowUp,
  onRegenerate,
  onInsert,
  onReplace,
  onCopy,
  onCancel,
}: {
  conversationRef: React.RefObject<HTMLDivElement>;
  followUpRef: React.RefObject<HTMLTextAreaElement>;
  visibleMessages: VisibleChatMessage[];
  pendingUserMessage: string | null;
  streamingContent: string;
  isGenerating: boolean;
  followUp: string;
  error: string;
  hasSession: boolean;
  onFollowUpChange: (value: string) => void;
  onSendFollowUp: () => void;
  onRegenerate: () => void;
  onInsert: () => void;
  onReplace: () => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const handleFollowUpKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    // Cmd/Ctrl+Enter → Replace (handled globally, but stop bubble for Enter alone)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // Let the window handler perform Replace
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) {
        onSendFollowUp();
      }
    }
    // Shift+Enter: default newline
  };

  const showStreamingAssistant =
    isGenerating && (streamingContent.length > 0 || !pendingUserMessage);

  return (
    <div className="orca-command-panel__chat">
      <div
        className="orca-command-panel__conversation"
        ref={conversationRef}
      >
        {visibleMessages.map((message, index) => (
          <ChatBubble
            key={`${message.role}-${index}`}
            role={message.role}
            content={message.content}
          />
        ))}

        {pendingUserMessage ? (
          <ChatBubble role="user" content={pendingUserMessage} />
        ) : null}

        {isGenerating && showStreamingAssistant ? (
          <ChatBubble
            role="assistant"
            content={streamingContent}
            isStreaming
          />
        ) : null}

        {isGenerating && !streamingContent && !showStreamingAssistant ? (
          <div className="orca-command-panel__thinking">
            <div className="orca-command-panel__loading">
              <div className="orca-command-panel__loading-bar"></div>
              <div className="orca-command-panel__loading-bar"></div>
              <div className="orca-command-panel__loading-bar"></div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="orca-command-panel__error">{error}</div>
        ) : null}
      </div>

      {isGenerating ? (
        <div className="orca-command-panel__generating-bar">
          <span className="orca-command-panel__generating-label">
            Generating…
          </span>
          <button
            type="button"
            className="orca-command-panel__cancel-btn"
            onClick={onCancel}
          >
            Cancel (ESC)
          </button>
        </div>
      ) : (
        <>
          <div className="orca-command-panel__follow-up">
            <textarea
              ref={followUpRef}
              className="orca-command-panel__follow-up-input"
              placeholder="Ask a follow-up… (Enter to send, Shift+Enter for newline)"
              value={followUp}
              rows={2}
              disabled={!hasSession}
              onChange={(e) => onFollowUpChange(e.target.value)}
              onKeyDown={handleFollowUpKeyDown}
            />
          </div>
          <div className="orca-command-panel__actions">
            <button
              type="button"
              className="orca-command-panel__action-btn"
              onClick={onRegenerate}
              disabled={!hasSession}
              title="Cmd+R"
            >
              Regenerate
            </button>
            <button
              type="button"
              className="orca-command-panel__action-btn is-primary"
              onClick={onInsert}
              disabled={!hasSession}
              title="Insert latest answer"
            >
              Insert
            </button>
            <button
              type="button"
              className="orca-command-panel__action-btn"
              onClick={onReplace}
              disabled={!hasSession}
              title="Cmd+Enter"
            >
              Replace
            </button>
            <button
              type="button"
              className="orca-command-panel__action-btn"
              onClick={onCopy}
              disabled={!hasSession}
              title="Cmd+C"
            >
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Detect selected text in inputs/textareas or window selection. */
function hasTextSelection(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement
  ) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (end > start) return true;
  }
  const selection = window.getSelection()?.toString();
  return Boolean(selection && selection.length > 0);
}

function ChatBubble({
  role,
  content,
  isStreaming,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div
      className={
        role === "user"
          ? "orca-command-panel__bubble orca-command-panel__bubble--user"
          : "orca-command-panel__bubble orca-command-panel__bubble--assistant"
      }
    >
      <div className="orca-command-panel__bubble-label">
        {role === "user" ? "You" : "AI"}
        {isStreaming ? " · streaming" : ""}
      </div>
      <pre className="orca-command-panel__bubble-text">
        {content || (isStreaming ? "…" : "")}
      </pre>
    </div>
  );
}
