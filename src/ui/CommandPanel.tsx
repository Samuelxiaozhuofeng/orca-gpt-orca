import React, { useEffect, useRef } from "react";
import { useCommandPanelState } from "./useCommandPanelState";
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

  // Auto-focus input when panel opens
  useEffect(() => {
    if (isOpen && state.phase === "input") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, state.phase]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close/cancel
      if (e.key === "Escape") {
        e.preventDefault();
        if (state.phase === "generating") {
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
      }

      // Result phase shortcuts
      if (state.phase === "result") {
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          state.performAction("insert", onClose);
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          state.performAction("replace", onClose);
        } else if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          state.regenerate();
        } else if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          state.performAction("copy", onClose);
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
      // User typed something - use it as instruction
      state.executeCommand(trimmedQuery, selectedPrompt);
    } else if (selectedPrompt) {
      // No custom input, use selected template
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
            onQueryChange={state.setQuery}
            onSelectPrompt={(index) => {
              state.setSelectedIndex(index);
              handleExecute();
            }}
          />
        )}

        {state.phase === "generating" && (
          <GeneratingPhase result={state.result} onCancel={state.cancel} />
        )}

        {state.phase === "result" && (
          <ResultPhase
            result={state.result}
            error={state.error}
            onRegenerate={state.regenerate}
            onInsert={() => state.performAction("insert", onClose)}
            onReplace={() => state.performAction("replace", onClose)}
            onCopy={() => state.performAction("copy", onClose)}
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
  onQueryChange,
  onSelectPrompt,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  prompts: any[];
  selectedIndex: number;
  contextLabel: string;
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
              onMouseEnter={() => onQueryChange === undefined ? null : null}
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

function GeneratingPhase({
  result,
  onCancel,
}: {
  result: string;
  onCancel: () => void;
}) {
  return (
    <div className="orca-command-panel__generating">
      <div className="orca-command-panel__loading">
        <div className="orca-command-panel__loading-bar"></div>
        <div className="orca-command-panel__loading-bar"></div>
        <div className="orca-command-panel__loading-bar"></div>
      </div>
      {result && (
        <div className="orca-command-panel__preview">{result}</div>
      )}
      <button
        type="button"
        className="orca-command-panel__cancel-btn"
        onClick={onCancel}
      >
        Cancel (ESC)
      </button>
    </div>
  );
}

function ResultPhase({
  result,
  error,
  onRegenerate,
  onInsert,
  onReplace,
  onCopy,
}: {
  result: string;
  error: string;
  onRegenerate: () => void;
  onInsert: () => void;
  onReplace: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="orca-command-panel__result">
        {error ? (
          <div className="orca-command-panel__error">{error}</div>
        ) : (
          <pre className="orca-command-panel__result-text">{result}</pre>
        )}
      </div>
      <div className="orca-command-panel__actions">
        <button
          type="button"
          className="orca-command-panel__action-btn"
          onClick={onRegenerate}
          title="Cmd+R"
        >
          Regenerate
        </button>
        <button
          type="button"
          className="orca-command-panel__action-btn is-primary"
          onClick={onInsert}
          title="Enter"
        >
          Insert ↵
        </button>
        <button
          type="button"
          className="orca-command-panel__action-btn"
          onClick={onReplace}
          title="Cmd+Enter"
        >
          Replace
        </button>
        <button
          type="button"
          className="orca-command-panel__action-btn"
          onClick={onCopy}
          title="Cmd+C"
        >
          Copy
        </button>
      </div>
    </>
  );
}
