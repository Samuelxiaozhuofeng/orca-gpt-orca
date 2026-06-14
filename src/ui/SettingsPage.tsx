import React, { useMemo, useState } from "react";
import { copyResult } from "../commands/writeBackResult";
import { HistoryView } from "./HistoryView";
import { SettingsView } from "./SettingsView";
import { getHistory } from "../history/historyStore";
import { getAvailablePrompts } from "../prompts/promptUtils";
import { getAiSettings, saveAiSettings } from "../settings/readSettings";
import type { AiHistoryItem, AiSettings } from "../types/ai";
import type { PanelProps } from "../orca";

type SettingsPageProps = PanelProps & {
  pluginName: string;
};

type SettingsSection = "providers" | "routing" | "prompts" | "history";

export function SettingsPage({ pluginName }: SettingsPageProps) {
  const [settings, setSettings] = useState<AiSettings>(() =>
    getAiSettings(pluginName),
  );
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [section, setSection] = useState<SettingsSection>("providers");
  const [error, setError] = useState("");
  const prompts = useMemo(() => getAvailablePrompts(settings), [settings]);

  const updateSettings = async (nextSettings: AiSettings) => {
    setSettings(nextSettings);
    try {
      await saveAiSettings(pluginName, nextSettings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const openHistory = async () => {
    setSection("history");
    try {
      setHistory(await getHistory(pluginName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <main className="orca-ai-settings-page">
      <aside className="orca-ai-settings-page__nav">
        <div>
          <h1>Orca AI</h1>
          <p>Providers, models, routing, prompts, and recent output.</p>
        </div>
        <button
          className={section === "providers" ? "is-active" : ""}
          type="button"
          onClick={() => setSection("providers")}
        >
          Providers
        </button>
        <button
          className={section === "routing" ? "is-active" : ""}
          type="button"
          onClick={() => setSection("routing")}
        >
          Prompt Routing
        </button>
        <button
          className={section === "prompts" ? "is-active" : ""}
          type="button"
          onClick={() => setSection("prompts")}
        >
          Custom Prompts
        </button>
        <button
          className={section === "history" ? "is-active" : ""}
          type="button"
          onClick={openHistory}
        >
          History
        </button>
      </aside>
      <section className="orca-ai-settings-page__content">
        <header className="orca-ai-settings-page__header">
          <div>
            <strong>{sectionTitle(section)}</strong>
            <span>{settings.providers.length} providers</span>
          </div>
          {error ? <p>{error}</p> : null}
        </header>
        {section === "history" ? (
          <HistoryView
            history={history}
            onCopy={(text) =>
              copyResult(text).catch((caught) =>
                setError(caught instanceof Error ? caught.message : String(caught)),
              )
            }
          />
        ) : (
          <SettingsView
            settings={settings}
            prompts={prompts}
            visibleSection={section}
            onSettingsChange={updateSettings}
            onError={setError}
          />
        )}
      </section>
    </main>
  );
}

function sectionTitle(section: SettingsSection): string {
  switch (section) {
    case "providers":
      return "Providers";
    case "routing":
      return "Prompt Routing";
    case "prompts":
      return "Custom Prompts";
    case "history":
      return "History";
  }
}
