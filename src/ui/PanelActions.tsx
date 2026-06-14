import React from "react";
import type { ResultKind } from "../types/ai";

type PanelActionsProps = {
  hasResult: boolean;
  isGenerating: boolean;
  resultKind: ResultKind;
  onGenerate: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onInsert: () => void;
  onReplace: () => void;
};

export function PanelActions({
  hasResult,
  isGenerating,
  resultKind,
  onGenerate,
  onCancel,
  onRegenerate,
  onCopy,
  onInsert,
  onReplace,
}: PanelActionsProps) {
  return (
    <div className="orca-ai-panel__actions">
      {isGenerating ? (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button type="button" className="is-primary" onClick={onGenerate}>
          Generate
        </button>
      )}
      <button
        type="button"
        disabled={!hasResult || isGenerating}
        onClick={onRegenerate}
      >
        Regenerate
      </button>
      <button type="button" disabled={!hasResult} onClick={onCopy}>
        Copy
      </button>
      <button type="button" disabled={!hasResult} onClick={onInsert}>
        {resultKind === "tasks" ? "Create To do" : "Insert as Child"}
      </button>
      <button type="button" disabled={!hasResult} onClick={onReplace}>
        Replace Block
      </button>
    </div>
  );
}
