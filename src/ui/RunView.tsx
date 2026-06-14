import React from "react";
import { ModelPicker } from "./ModelPicker";
import { PanelActions } from "./PanelActions";
import { PromptPicker } from "./PromptPicker";
import { ResultPreview } from "./ResultPreview";
import type {
  AiBlockContext,
  AiHistoryAction,
  AiSettings,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";

type RunViewProps = {
  settings: AiSettings;
  prompts: PromptTemplate[];
  selectedPrompt: PromptTemplate;
  query: string;
  temporaryInstruction: string;
  context: AiBlockContext | null;
  result: string;
  error: string;
  isGenerating: boolean;
  lastRun: {
    prompt: PromptTemplate;
    temporaryInstruction: string;
    config: ResolvedPromptConfig;
  } | null;
  onSelectPrompt: (prompt: PromptTemplate) => void;
  onQueryChange: (query: string) => void;
  onTemporaryInstructionChange: (instruction: string) => void;
  onSettingsChange: (settings: AiSettings) => void;
  onGenerate: (prompt?: PromptTemplate, instruction?: string) => void;
  onCancel: () => void;
  onWriteAction: (action: AiHistoryAction) => void;
};

export function RunView({
  settings,
  prompts,
  selectedPrompt,
  query,
  temporaryInstruction,
  context,
  result,
  error,
  isGenerating,
  lastRun,
  onSelectPrompt,
  onQueryChange,
  onTemporaryInstructionChange,
  onSettingsChange,
  onGenerate,
  onCancel,
  onWriteAction,
}: RunViewProps) {
  const selectedProviderId =
    lastRun?.config.provider.id ?? settings.defaultProviderId;
  const resultKind = lastRun?.prompt.resultKind ?? selectedPrompt.resultKind ?? "text";
  const selectedModel =
    lastRun?.config.model ||
    settings.defaultModel ||
    settings.providers.find((provider) => provider.id === selectedProviderId)
      ?.defaultModel ||
    "";

  return (
    <main className="orca-ai-panel__workspace">
      <aside className="orca-ai-panel__sidebar">
        <PromptPicker
          prompts={prompts}
          selectedPromptId={selectedPrompt.id}
          query={query}
          temporaryInstruction={temporaryInstruction}
          onQueryChange={onQueryChange}
          onTemporaryInstructionChange={onTemporaryInstructionChange}
          onSelectPrompt={onSelectPrompt}
        />
        <section className="orca-ai-panel__section">
          <div className="orca-ai-panel__section-heading">
            <span>Context</span>
            <span>{context?.blockText.length ?? 0} chars</span>
          </div>
          <pre className="orca-ai-panel__context">
            {context?.blockText ?? "没有可用 block。"}
          </pre>
        </section>
      </aside>
      <section className="orca-ai-panel__main">
        <ModelPicker
          settings={settings}
          selectedProviderId={selectedProviderId}
          selectedModel={selectedModel}
          onSelectProvider={(providerId) =>
            onSettingsChange({ ...settings, defaultProviderId: providerId })
          }
          onSelectModel={(model) =>
            onSettingsChange({ ...settings, defaultModel: model })
          }
        />
        <ResultPreview result={result} error={error} isGenerating={isGenerating} />
        <PanelActions
          hasResult={Boolean(result.trim())}
          isGenerating={isGenerating}
          resultKind={resultKind}
          onGenerate={() => onGenerate()}
          onCancel={onCancel}
          onRegenerate={() =>
            lastRun
              ? onGenerate(lastRun.prompt, lastRun.temporaryInstruction)
              : onGenerate()
          }
          onCopy={() => onWriteAction("copy")}
          onInsert={() => onWriteAction("insert")}
          onReplace={() => onWriteAction("replace")}
        />
      </section>
    </main>
  );
}
