import React from "react";
import type { AiSettings } from "../types/ai";

type ModelPickerProps = {
  settings: AiSettings;
  selectedProviderId: string;
  selectedModel: string;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (model: string) => void;
};

export function ModelPicker({
  settings,
  selectedProviderId,
  selectedModel,
  onSelectProvider,
  onSelectModel,
}: ModelPickerProps) {
  const provider =
    settings.providers.find((item) => item.id === selectedProviderId) ??
    settings.providers[0];

  return (
    <div className="orca-ai-panel__model-row">
      <label>
        Provider
        <select
          value={provider.id}
          onChange={(event) => onSelectProvider(event.currentTarget.value)}
        >
          {settings.providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Model
        <input
          list="orca-ai-panel-models"
          value={selectedModel}
          onChange={(event) => onSelectModel(event.currentTarget.value)}
          placeholder="选择或输入模型"
        />
        <datalist id="orca-ai-panel-models">
          {provider.models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>
    </div>
  );
}
