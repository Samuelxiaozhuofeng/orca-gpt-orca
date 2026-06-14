import React from "react";
import type { AiSettings, PromptTemplate } from "../types/ai";

type PromptRoutingProps = {
  prompts: PromptTemplate[];
  settings: AiSettings;
  onSettingsChange: (settings: AiSettings) => void;
};

export function PromptRouting({
  prompts,
  settings,
  onSettingsChange,
}: PromptRoutingProps) {
  const updateOverride = (promptId: string, updates: Record<string, unknown>) => {
    const existing = settings.promptOverrides.find(
      (override) => override.promptId === promptId,
    );
    const next = { promptId, ...existing, ...updates };

    onSettingsChange({
      ...settings,
      promptOverrides: [
        ...settings.promptOverrides.filter(
          (override) => override.promptId !== promptId,
        ),
        next,
      ],
    });
  };

  return (
    <div className="orca-ai-panel__routing">
      <div className="orca-ai-panel__section-heading">
        <span>Prompt Routing</span>
        <span>{prompts.length}</span>
      </div>
      {prompts.map((prompt) => {
        const override = settings.promptOverrides.find(
          (item) => item.promptId === prompt.id,
        );
        return (
          <div className="orca-ai-panel__route" key={prompt.id}>
            <span>{prompt.name}</span>
            <select
              value={override?.providerId ?? ""}
              onChange={(event) =>
                updateOverride(prompt.id, {
                  providerId: event.currentTarget.value || undefined,
                })
              }
            >
              <option value="">Default provider</option>
              {settings.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <input
              value={override?.model ?? ""}
              placeholder="Model override"
              onChange={(event) =>
                updateOverride(prompt.id, {
                  model: event.currentTarget.value || undefined,
                })
              }
            />
            <input
              type="number"
              step="0.1"
              value={override?.temperature ?? ""}
              placeholder="Temp"
              onChange={(event) =>
                updateOverride(prompt.id, {
                  temperature: event.currentTarget.value
                    ? Number(event.currentTarget.value)
                    : undefined,
                })
              }
            />
            <select
              value={override?.outputMode ?? ""}
              onChange={(event) =>
                updateOverride(prompt.id, {
                  outputMode: event.currentTarget.value || undefined,
                })
              }
            >
              <option value="">Ask</option>
              <option value="insert">Insert</option>
              <option value="replace">Replace</option>
              <option value="ask">Ask every time</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}
