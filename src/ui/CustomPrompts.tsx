import React from "react";
import { addCustomPrompt } from "./promptActions";
import type { AiSettings, PromptTemplate } from "../types/ai";

type CustomPromptsProps = {
  settings: AiSettings;
  onSettingsChange: (settings: AiSettings) => void;
};

export function CustomPrompts({
  settings,
  onSettingsChange,
}: CustomPromptsProps) {
  const updatePrompt = (prompt: PromptTemplate) => {
    onSettingsChange({
      ...settings,
      customPrompts: settings.customPrompts.map((item) =>
        item.id === prompt.id ? prompt : item,
      ),
    });
  };

  return (
    <div className="orca-ai-panel__custom-prompts">
      <div className="orca-ai-panel__section-heading">
        <span>Custom Prompts</span>
        <button
          type="button"
          onClick={() => onSettingsChange(addCustomPrompt(settings))}
        >
          Add
        </button>
      </div>
      {settings.customPrompts.map((prompt) => (
        <div className="orca-ai-panel__custom-prompt" key={prompt.id}>
          <input
            value={prompt.name}
            onChange={(event) =>
              updatePrompt({ ...prompt, name: event.currentTarget.value })
            }
          />
          <label className="orca-ai-panel__inline-check">
            <input
              type="checkbox"
              checked={prompt.enabled !== false}
              onChange={(event) =>
                updatePrompt({ ...prompt, enabled: event.currentTarget.checked })
              }
            />
            Enabled
          </label>
          <textarea
            rows={4}
            value={prompt.instruction}
            onChange={(event) =>
              updatePrompt({
                ...prompt,
                instruction: event.currentTarget.value,
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                ...settings,
                customPrompts: settings.customPrompts.filter(
                  (item) => item.id !== prompt.id,
                ),
              })
            }
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
