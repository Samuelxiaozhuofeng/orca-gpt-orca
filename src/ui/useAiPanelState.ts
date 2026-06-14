import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBlockContext } from "../commands/resolveBlockContext";
import {
  copyResult,
  insertActionTasks,
  insertResultAsChild,
  replaceBlockResult,
} from "../commands/writeBackResult";
import { appendHistory, getHistory } from "../history/historyStore";
import { getAvailablePrompts } from "../prompts/promptUtils";
import {
  getAiSettings,
  getDefaultAiSettings,
  saveAiSettings,
} from "../settings/readSettings";
import { generateAiResult } from "../services/aiRunner";
import type {
  AiBlockContext,
  AiHistoryAction,
  AiHistoryItem,
  AiSettings,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";
import type { DbId } from "../orca";

type LastRun = {
  prompt: PromptTemplate;
  temporaryInstruction: string;
  config: ResolvedPromptConfig;
};

export function useAiPanelState(
  pluginName: string,
  isOpen: boolean,
  blockId?: DbId,
) {
  const [settings, setSettings] = useState<AiSettings>(() =>
    getDefaultAiSettings(pluginName),
  );
  const prompts = useMemo(() => getAvailablePrompts(settings), [settings]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate>(
    prompts[0],
  );
  const [query, setQuery] = useState("");
  const [temporaryInstruction, setTemporaryInstruction] = useState("");
  const [context, setContext] = useState<AiBlockContext | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!prompts.some((prompt) => prompt.id === selectedPrompt.id)) {
      setSelectedPrompt(prompts[0]);
    }
  }, [prompts, selectedPrompt.id]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setError("");
    setResult("");

    getAiSettings(pluginName)
      .then((loadedSettings) => {
        if (!cancelled) setSettings(loadedSettings);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });

    resolveBlockContext(blockId)
      .then((resolvedContext) => {
        if (!cancelled) setContext(resolvedContext);
      })
      .catch((caught) => {
        if (!cancelled) {
          setContext(null);
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });

    getHistory(pluginName)
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });

    return () => {
      cancelled = true;
    };
  }, [blockId, isOpen, pluginName]);

  const updateSettings = async (nextSettings: AiSettings) => {
    setSettings(nextSettings);
    try {
      await saveAiSettings(pluginName, nextSettings);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const recordHistory = async (
    output: string,
    prompt: PromptTemplate,
    config: ResolvedPromptConfig,
    action?: AiHistoryAction,
  ) => {
    if (!context) return;
    setHistory(
      await appendHistory(pluginName, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        blockId: context.blockId,
        promptId: prompt.builtin === false ? undefined : prompt.id,
        promptName: prompt.name,
        providerId: config.provider.id,
        model: config.model,
        inputPreview: context.blockText.slice(0, 160),
        output,
        action,
      }),
    );
  };

  const runGenerate = async (
    prompt = selectedPrompt,
    instruction = temporaryInstruction,
  ) => {
    if (!context) {
      setError("当前光标不在 Orca block 中。");
      return;
    }

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const currentSettings = await getAiSettings(pluginName);
      setSettings(currentSettings);
      const generation = await generateAiResult({
        settings: currentSettings,
        context,
        prompt,
        temporaryInstruction: instruction,
        signal: abortController.signal,
        onToken: (token) => {
          setResult((value) => `${value}${token}`);
        },
      });

      setResult(generation.output);
      setLastRun({
        prompt: generation.prompt,
        temporaryInstruction: instruction,
        config: generation.config,
      });
      await recordHistory(generation.output, generation.prompt, generation.config);
    } catch (caught) {
      const message = errorMessage(caught);
      if (message !== "The user aborted a request.") {
        setError(message);
        console.error(caught);
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const runWriteAction = async (action: AiHistoryAction) => {
    if (!context || !result.trim() || !lastRun) return;

    try {
      if (action === "replace") {
        await replaceBlockResult(context, result);
      } else if (action === "insert") {
        if (lastRun.prompt.resultKind === "tasks") {
          await insertActionTasks(context, result);
        } else {
          await insertResultAsChild(context, result);
        }
      } else {
        await copyResult(result);
      }

      await recordHistory(result, lastRun.prompt, lastRun.config, action);
      orca.notify("success", "AI result applied.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return {
    settings,
    prompts,
    selectedPrompt,
    query,
    temporaryInstruction,
    context,
    result,
    error,
    isGenerating,
    history,
    lastRun,
    abortRef,
    setSelectedPrompt,
    setQuery,
    setTemporaryInstruction,
    setError,
    updateSettings,
    runGenerate,
    runWriteAction,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
