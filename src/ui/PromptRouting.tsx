import React from "react";
import { addCustomPrompt } from "./promptActions";
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
        <button
          type="button"
          onClick={() => onSettingsChange(addCustomPrompt(settings))}
        >
          Add
        </button>
      </div>
      {prompts.map((prompt) => {
        const override = settings.promptOverrides.find(
          (item) => item.promptId === prompt.id,
        );
        const effectiveProviderId =
          prompt.providerId ?? override?.providerId ?? settings.defaultProviderId;
        const provider = settings.providers.find(
          (item) => item.id === effectiveProviderId,
        );
        const models = provider?.models ?? [];
        const modelListId = `models-${prompt.id}`;

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
              list={modelListId}
              onChange={(event) =>
                updateOverride(prompt.id, {
                  model: event.currentTarget.value || undefined,
                })
              }
            />
            {models.length > 0 && (
              <datalist id={modelListId}>
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
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
