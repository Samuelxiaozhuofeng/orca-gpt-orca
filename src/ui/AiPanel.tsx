import React, { useState } from "react";
import { copyResult } from "../commands/writeBackResult";
import { HistoryView } from "./HistoryView";
import { RunView } from "./RunView";
import { useAiPanelState } from "./useAiPanelState";
import type { DbId } from "../orca";

type AiPanelProps = {
  pluginName: string;
  isOpen: boolean;
  blockId?: DbId;
  onClose: () => void;
};

type PanelTab = "run" | "history";

export function AiPanel({ pluginName, isOpen, blockId, onClose }: AiPanelProps) {
  const [tab, setTab] = useState<PanelTab>("run");
  const state = useAiPanelState(pluginName, isOpen, blockId);

  if (!isOpen) return null;

  return (
    <div className="orca-ai-panel__backdrop">
      <div className="orca-ai-panel" role="dialog" aria-modal="true">
        <PanelHeader
          activeTab={tab}
          blockLabel={
            state.context ? `Block ${state.context.blockId}` : "No block context"
          }
          onTabChange={setTab}
          onClose={onClose}
        />
        {tab === "run" ? (
          <RunView
            settings={state.settings}
            prompts={state.prompts}
            selectedPrompt={state.selectedPrompt}
            query={state.query}
            temporaryInstruction={state.temporaryInstruction}
            context={state.context}
            result={state.result}
            error={state.error}
            isGenerating={state.isGenerating}
            lastRun={state.lastRun}
            onSelectPrompt={state.setSelectedPrompt}
            onQueryChange={state.setQuery}
            onTemporaryInstructionChange={state.setTemporaryInstruction}
            onSettingsChange={state.updateSettings}
            onGenerate={state.runGenerate}
            onCancel={() => state.abortRef.current?.abort()}
            onWriteAction={state.runWriteAction}
          />
        ) : null}
        {tab === "history" ? (
          <HistoryView
            history={state.history}
            onCopy={(text) => {
              copyResult(text).catch((caught) =>
                state.setError(
                  caught instanceof Error ? caught.message : String(caught),
                ),
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function PanelHeader({
  activeTab,
  blockLabel,
  onTabChange,
  onClose,
}: {
  activeTab: PanelTab;
  blockLabel: string;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
}) {
  return (
    <header className="orca-ai-panel__header">
      <div>
        <h2>Orca AI</h2>
        <p>{blockLabel}</p>
      </div>
      <nav className="orca-ai-panel__tabs">
        {(["run", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "is-active" : ""}
            onClick={() => onTabChange(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      <button
        className="orca-ai-panel__close"
        type="button"
        onClick={onClose}
        aria-label="Close"
      >
        x
      </button>
    </header>
  );
}
