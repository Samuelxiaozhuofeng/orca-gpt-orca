import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBlockContext } from "../commands/resolveBlockContext";
import {
  copyResult,
  insertActionTasks,
  insertResultAsChild,
  replaceBlockResult,
} from "../commands/writeBackResult";
import { appendHistory } from "../history/historyStore";
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
  AiSettings,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";
import type { DbId } from "../orca";

type PanelPhase = "input" | "generating" | "result";

type LastRun = {
  prompt: PromptTemplate;
  instruction: string;
  config: ResolvedPromptConfig;
};

export function useCommandPanelState(
  pluginName: string,
  isOpen: boolean,
  blockId?: DbId,
) {
  const [phase, setPhase] = useState<PanelPhase>("input");
  const [settings, setSettings] = useState<AiSettings>(() =>
    getDefaultAiSettings(pluginName),
  );
  const prompts = useMemo(() => getAvailablePrompts(settings), [settings]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [context, setContext] = useState<AiBlockContext | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Filter prompts based on query
  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return prompts;
    return prompts.filter((prompt) => {
      const searchText = `${prompt.name} ${prompt.description ?? ""} ${prompt.instruction}`.toLowerCase();
      return searchText.includes(normalizedQuery);
    });
  }, [prompts, query]);

  // Reset when panel opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setPhase("input");
    setQuery("");
    setSelectedIndex(0);
    setResult("");
    setError("");
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
          setError(errorMessage(caught));
        }
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [blockId, isOpen, pluginName]);

  // Reset selected index when filtered prompts change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredPrompts]);

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
    });
  };

  const executeCommand = async (instruction: string, prompt?: PromptTemplate) => {
    if (!context) {
      setError("当前光标不在 Orca block 中。");
      return;
    }

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setPhase("generating");
    setError("");
    setResult("");

    try {
      const currentSettings = await getAiSettings(pluginName);
      setSettings(currentSettings);
      const generation = await generateAiResult({
        settings: currentSettings,
        context,
        prompt: prompt ?? prompts[0],
        temporaryInstruction: instruction,
        signal: abortController.signal,
        onToken: (token) => {
          setResult((value) => `${value}${token}`);
        },
      });

      setResult(generation.output);
      setLastRun({
        prompt: generation.prompt,
        instruction,
        config: generation.config,
      });
      setPhase("result");
      await recordHistory(generation.output, generation.prompt, generation.config);
    } catch (caught) {
      const message = errorMessage(caught);
      if (message !== "The user aborted a request.") {
        setError(message);
        setPhase("input");
        orca.notify("error", message);
        console.error(caught);
      } else {
        setPhase("input");
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  };

  const regenerate = async () => {
    if (!lastRun) return;
    await executeCommand(lastRun.instruction, lastRun.prompt);
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("input");
  };

  const performAction = async (action: AiHistoryAction, onClose: () => void) => {
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
      orca.notify("success", "已应用 AI 结果。");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      orca.notify("error", errorMessage(caught));
    }
  };

  return {
    phase,
    settings,
    prompts: filteredPrompts,
    query,
    selectedIndex,
    context,
    result,
    error,
    lastRun,
    setQuery,
    setSelectedIndex,
    updateSettings,
    executeCommand,
    regenerate,
    cancel,
    performAction,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
