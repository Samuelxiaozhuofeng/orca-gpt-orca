import React, { useState } from "react";
import { CustomPrompts } from "./CustomPrompts";
import { PromptRouting } from "./PromptRouting";
import { fetchAndStoreModels } from "../services/modelService";
import type { AiProvider, AiSettings, PromptTemplate } from "../types/ai";

type SettingsViewProps = {
  settings: AiSettings;
  prompts: PromptTemplate[];
  visibleSection?: "providers" | "routing" | "prompts";
  onSettingsChange: (settings: AiSettings) => void;
  onError: (message: string) => void;
};

export function SettingsView({
  settings,
  prompts,
  visibleSection,
  onSettingsChange,
  onError,
}: SettingsViewProps) {
  const [isFetchingProviderId, setIsFetchingProviderId] = useState("");

  const fetchModels = async (providerId: string) => {
    setIsFetchingProviderId(providerId);
    try {
      onSettingsChange(await fetchAndStoreModels(settings, providerId));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFetchingProviderId("");
    }
  };

  return (
    <section className="orca-ai-panel__settings">
      {visibleSection == null || visibleSection === "providers" ? (
        <>
          <div className="orca-ai-panel__section-heading">
            <span>Providers</span>
            <button
              type="button"
              onClick={() => addProvider(settings, onSettingsChange)}
            >
              Add
            </button>
          </div>
          <div className="orca-ai-panel__provider-list">
            {settings.providers.map((provider) => (
              <ProviderEditor
                key={provider.id}
                provider={provider}
                settings={settings}
                isFetching={isFetchingProviderId === provider.id}
                onSettingsChange={onSettingsChange}
                onError={onError}
                onFetchModels={fetchModels}
              />
            ))}
          </div>
        </>
      ) : null}
      {visibleSection == null || visibleSection === "routing" ? (
        <PromptRouting
          prompts={prompts}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      ) : null}
      {visibleSection == null || visibleSection === "prompts" ? (
        <CustomPrompts settings={settings} onSettingsChange={onSettingsChange} />
      ) : null}
    </section>
  );
}

function ProviderEditor({
  provider,
  settings,
  isFetching,
  onSettingsChange,
  onError,
  onFetchModels,
}: {
  provider: AiProvider;
  settings: AiSettings;
  isFetching: boolean;
  onSettingsChange: (settings: AiSettings) => void;
  onError: (message: string) => void;
  onFetchModels: (providerId: string) => void;
}) {
  const updateProvider = (nextProvider: AiProvider) => {
    onSettingsChange({
      ...settings,
      providers: settings.providers.map((item) =>
        item.id === nextProvider.id ? nextProvider : item,
      ),
    });
  };

  return (
    <div className="orca-ai-panel__provider">
      <div className="orca-ai-panel__provider-title">
        <strong>{provider.name}</strong>
        <span>{provider.models.length} models</span>
      </div>
      <ProviderFields provider={provider} onProviderChange={updateProvider} />
      <div className="orca-ai-panel__provider-actions">
        <button
          type="button"
          onClick={() => onFetchModels(provider.id)}
          disabled={isFetching}
        >
          {isFetching ? "Fetching" : "Fetch models"}
        </button>
        <button
          type="button"
          onClick={() =>
            onSettingsChange({
              ...settings,
              defaultProviderId: provider.id,
              defaultModel: provider.defaultModel ?? settings.defaultModel,
            })
          }
        >
          Set default
        </button>
        <button
          type="button"
          onClick={() => deleteProvider(provider.id, settings, onSettingsChange, onError)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ProviderFields({
  provider,
  onProviderChange,
}: {
  provider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
}) {
  return (
    <div className="orca-ai-panel__provider-fields">
      <label>
        Name
        <input
          value={provider.name}
          onChange={(event) =>
            onProviderChange({ ...provider, name: event.currentTarget.value })
          }
        />
      </label>
      <label>
        API URL
        <input
          value={provider.apiBaseUrl}
          onChange={(event) =>
            onProviderChange({
              ...provider,
              apiBaseUrl: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={provider.apiKey}
          onChange={(event) =>
            onProviderChange({ ...provider, apiKey: event.currentTarget.value })
          }
        />
      </label>
      <label>
        Default model
        <select
          value={provider.defaultModel ?? ""}
          onChange={(event) =>
            onProviderChange({
              ...provider,
              defaultModel: event.currentTarget.value,
            })
          }
        >
          <option value="">Select a model...</option>
          {provider.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function addProvider(
  settings: AiSettings,
  onSettingsChange: (settings: AiSettings) => void,
) {
  const id = `provider-${Date.now()}`;
  onSettingsChange({
    ...settings,
    providers: [
      ...settings.providers,
      {
        id,
        name: "New Provider",
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "",
        models: [],
        defaultModel: "",
      },
    ],
    defaultProviderId: settings.defaultProviderId || id,
  });
}

function deleteProvider(
  providerId: string,
  settings: AiSettings,
  onSettingsChange: (settings: AiSettings) => void,
  onError: (message: string) => void,
) {
  if (settings.providers.length <= 1) {
    onError("至少需要保留一个 provider。");
    return;
  }

  const providers = settings.providers.filter((item) => item.id !== providerId);
  onSettingsChange({
    ...settings,
    providers,
    defaultProviderId:
      settings.defaultProviderId === providerId
        ? providers[0].id
        : settings.defaultProviderId,
  });
}
