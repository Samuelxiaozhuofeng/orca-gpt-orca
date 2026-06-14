import React from "react";
import type { AiHistoryItem } from "../types/ai";

type HistoryViewProps = {
  history: AiHistoryItem[];
  onCopy: (text: string) => void;
};

export function HistoryView({ history, onCopy }: HistoryViewProps) {
  return (
    <section className="orca-ai-panel__history">
      <div className="orca-ai-panel__section-heading">
        <span>History</span>
        <span>{history.length}/10</span>
      </div>
      {history.length === 0 ? (
        <p className="orca-ai-panel__muted">暂无历史。</p>
      ) : (
        history.map((item) => (
          <article className="orca-ai-panel__history-item" key={item.id}>
            <div>
              <strong>{item.promptName}</strong>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <p>{item.inputPreview}</p>
            <pre>{item.output}</pre>
            <button type="button" onClick={() => onCopy(item.output)}>
              Copy
            </button>
          </article>
        ))
      )}
    </section>
  );
}
