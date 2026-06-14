import React from "react";
import type { PromptTemplate } from "../types/ai";

type PromptPickerProps = {
  prompts: PromptTemplate[];
  selectedPromptId: string;
  query: string;
  temporaryInstruction: string;
  onQueryChange: (value: string) => void;
  onTemporaryInstructionChange: (value: string) => void;
  onSelectPrompt: (prompt: PromptTemplate) => void;
};

export function PromptPicker({
  prompts,
  selectedPromptId,
  query,
  temporaryInstruction,
  onQueryChange,
  onTemporaryInstructionChange,
  onSelectPrompt,
}: PromptPickerProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPrompts = prompts.filter((prompt) => {
    if (!normalizedQuery) return true;
    return `${prompt.name} ${prompt.description ?? ""} ${prompt.instruction}`
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <section className="orca-ai-panel__section">
      <div className="orca-ai-panel__section-heading">
        <span>Prompt</span>
        <span>{filteredPrompts.length}</span>
      </div>
      <input
        className="orca-ai-panel__input"
        placeholder="搜索 prompt"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
      <div className="orca-ai-panel__prompt-list">
        {filteredPrompts.map((prompt) => (
          <button
            className={
              prompt.id === selectedPromptId
                ? "orca-ai-panel__prompt is-active"
                : "orca-ai-panel__prompt"
            }
            key={prompt.id}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
          >
            <span>{prompt.name}</span>
            <small>{prompt.description ?? prompt.instruction}</small>
          </button>
        ))}
      </div>
      <textarea
        className="orca-ai-panel__textarea"
        placeholder="临时 prompt，会覆盖上方选择"
        rows={5}
        value={temporaryInstruction}
        onChange={(event) =>
          onTemporaryInstructionChange(event.currentTarget.value)
        }
      />
    </section>
  );
}
