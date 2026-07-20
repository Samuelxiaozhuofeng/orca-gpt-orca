import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBlockContext } from "../commands/resolveBlockContext";
import {
  copyResult,
  insertActionTasks,
  insertResultAsChild,
  replaceBlockResult,
} from "../commands/writeBackResult";
import { appendHistory } from "../history/historyStore";
import {
  getAvailablePrompts,
  makeTemporaryPrompt,
  resolvePromptConfig,
} from "../prompts/promptUtils";
import {
  getAiSettings,
  getDefaultAiSettings,
  saveAiSettings,
} from "../settings/readSettings";
import {
  buildInitialMessages,
  streamChatMessages,
} from "../services/aiRunner";
import {
  appendSearchResultsToUserMessage,
  assertWebSearchReady,
  buildSearchQuery,
  runWebSearch,
  userRequestsWebSearch,
  withWebSearchSystemContext,
} from "../services/webSearch";
import type {
  AiBlockContext,
  AiHistoryAction,
  AiSettings,
  ChatMessage,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";
import type { DbId } from "../orca";

type PanelPhase = "input" | "chat";

/** Visible chat bubbles — never includes the internal initial block payload. */
export type VisibleChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SessionState = {
  prompt: PromptTemplate;
  config: ResolvedPromptConfig;
  maxTokens: number;
  /** Full API messages: system + initial user(+block) + completed turns. */
  apiMessages: ChatMessage[];
  /** UI bubbles: first assistant, then follow-up user/assistant pairs. */
  visibleMessages: VisibleChatMessage[];
};

type ActiveRequest = {
  id: number;
  controller: AbortController;
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
  const [session, setSession] = useState<SessionState | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  /** Monotonic request generation — bumped on each new request and panel open. */
  const requestIdRef = useRef(0);
  /** Snapshot of last complete assistant content for regenerate rollback. */
  const regenerateBackupRef = useRef<string | null>(null);

  // Filter prompts based on query
  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return prompts;
    return prompts.filter((prompt) => {
      const searchText =
        `${prompt.name} ${prompt.description ?? ""} ${prompt.instruction}`.toLowerCase();
      return searchText.includes(normalizedQuery);
    });
  }, [prompts, query]);

  // Reset when panel opens — closes previous session permanently
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    // Invalidate any in-flight request from a previous open
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    regenerateBackupRef.current = null;

    setPhase("input");
    setQuery("");
    setSelectedIndex(0);
    setSession(null);
    setFollowUp("");
    setIsGenerating(false);
    setStreamingContent("");
    setPendingUserMessage(null);
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
      // Invalidate in-flight work when panel closes or deps change
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
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

  const latestAssistantContent = (): string => {
    if (!session) return "";
    for (let i = session.visibleMessages.length - 1; i >= 0; i--) {
      const message = session.visibleMessages[i];
      if (message.role === "assistant") return message.content;
    }
    return "";
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

  /**
   * History is auxiliary: failures are surfaced but never roll back a
   * successful generation or write-back.
   */
  const recordHistorySafe = async (
    output: string,
    prompt: PromptTemplate,
    config: ResolvedPromptConfig,
    action: AiHistoryAction | undefined,
    options?: { shouldSetPanelError?: () => boolean },
  ) => {
    try {
      await recordHistory(output, prompt, config, action);
    } catch (caught) {
      const message = errorMessage(caught);
      if (options?.shouldSetPanelError?.() ?? true) {
        setError(message);
      }
      orca.notify("error", message);
      console.error(caught);
    }
  };

  const isRequestActive = (request: ActiveRequest): boolean =>
    requestIdRef.current === request.id &&
    abortRef.current === request.controller;

  const beginRequest = (): ActiveRequest => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestIdRef.current;
    setIsGenerating(true);
    setError("");
    setStreamingContent("");
    return { id, controller };
  };

  /** Only the still-current request may clear generating UI state. */
  const endRequest = (request: ActiveRequest) => {
    if (!isRequestActive(request)) return;
    abortRef.current = null;
    setIsGenerating(false);
    setStreamingContent("");
    setPendingUserMessage(null);
  };

  const onActiveToken =
    (request: ActiveRequest) =>
    (token: string) => {
      if (!isRequestActive(request)) return;
      setStreamingContent((value) => `${value}${token}`);
    };

  /** First turn: system + initial instruction/block. Establishes session config. */
  const executeCommand = async (
    instruction: string,
    prompt?: PromptTemplate,
  ) => {
    if (!context) {
      setError("当前光标不在 Orca block 中。");
      return;
    }
    if (isGenerating) return;

    const request = beginRequest();
    setPhase("chat");
    setSession(null);
    regenerateBackupRef.current = null;

    try {
      const currentSettings = await getAiSettings(pluginName);
      if (!isRequestActive(request)) return;

      setSettings(currentSettings);

      const basePrompt = prompt ?? prompts[0];
      if (!basePrompt) {
        throw new Error("No prompt template is available.");
      }
      const trimmedInstruction = instruction.trim();
      // Keep template (incl. resultKind) when instruction matches selected prompt
      const isCustomInstruction =
        Boolean(trimmedInstruction) &&
        trimmedInstruction !== (prompt?.instruction ?? "").trim();
      const runPrompt = isCustomInstruction
        ? makeTemporaryPrompt(trimmedInstruction)
        : basePrompt;
      const resolvedInstruction = isCustomInstruction
        ? trimmedInstruction
        : basePrompt.instruction;
      const config = resolvePromptConfig(currentSettings, runPrompt);

      const apiMessages = buildInitialMessages(
        currentSettings.systemPrompt,
        resolvedInstruction,
        context.blockText,
      );

      // Optional web-search pass: enrich system + user message (UI stays clean).
      if (userRequestsWebSearch(resolvedInstruction)) {
        assertWebSearchReady(currentSettings);
        const searchBundle = await runWebSearch({
          settings: currentSettings.webSearch,
          query: buildSearchQuery(resolvedInstruction, context.blockText),
          signal: request.controller.signal,
        });
        if (!isRequestActive(request)) return;
        const systemIndex = apiMessages.findIndex((m) => m.role === "system");
        if (systemIndex >= 0) {
          apiMessages[systemIndex] = {
            role: "system",
            content: withWebSearchSystemContext(
              apiMessages[systemIndex].content,
            ),
          };
        }
        const userIndex = apiMessages.findIndex((m) => m.role === "user");
        if (userIndex < 0) {
          throw new Error("内部错误：初始消息缺少 user 条目。");
        }
        apiMessages[userIndex] = {
          role: "user",
          content: appendSearchResultsToUserMessage(
            apiMessages[userIndex].content,
            searchBundle,
          ),
        };
      }

      const output = await streamChatMessages({
        config,
        maxTokens: currentSettings.maxTokens,
        messages: apiMessages,
        signal: request.controller.signal,
        onToken: onActiveToken(request),
      });

      if (!isRequestActive(request)) return;

      const completedMessages: ChatMessage[] = [
        ...apiMessages,
        { role: "assistant", content: output },
      ];

      setSession({
        prompt: runPrompt,
        config,
        maxTokens: currentSettings.maxTokens,
        apiMessages: completedMessages,
        visibleMessages: [{ role: "assistant", content: output }],
      });
      setFollowUp("");
      endRequest(request);

      // History is auxiliary — failure must not roll back the answer
      await recordHistorySafe(output, runPrompt, config, undefined, {
        shouldSetPanelError: () => requestIdRef.current === request.id,
      });
    } catch (caught) {
      if (!isRequestActive(request)) return;

      if (isAbortError(caught)) {
        // First turn cancelled — return to input (no completed session)
        // Original query is left untouched for retry.
        setPhase("input");
        setSession(null);
      } else {
        const message = errorMessage(caught);
        setError(message);
        setPhase("input");
        setSession(null);
        orca.notify("error", message);
        console.error(caught);
      }
    } finally {
      endRequest(request);
    }
  };

  /** Follow-up turn: full prior context + new user message. */
  const sendFollowUp = async () => {
    if (!context || !session || isGenerating) return;
    const text = followUp.trim();
    if (!text) return;

    const request = beginRequest();
    // UI shows the raw user text; API may get search-enriched content.
    setPendingUserMessage(text);
    setFollowUp("");

    try {
      let apiUserContent = text;
      let apiMessagesBase = session.apiMessages;
      if (userRequestsWebSearch(text)) {
        const currentSettings = await getAiSettings(pluginName);
        if (!isRequestActive(request)) return;
        setSettings(currentSettings);
        assertWebSearchReady(currentSettings);
        // Prefer the latest visible assistant answer for deictics like「刚才提到」;
        // fall back / append block text. Do not use internal apiMessages (search payload).
        const latestAnswer = latestAssistantContent().trim();
        const blockText = context.blockText.trim();
        const followUpContext = [latestAnswer, blockText]
          .filter(Boolean)
          .join("\n\n");
        const searchBundle = await runWebSearch({
          settings: currentSettings.webSearch,
          query: buildSearchQuery(text, followUpContext),
          signal: request.controller.signal,
        });
        if (!isRequestActive(request)) return;
        apiUserContent = appendSearchResultsToUserMessage(text, searchBundle);
        // Keep a fresh "today" anchor on web-search turns.
        apiMessagesBase = session.apiMessages.map((message, index) => {
          if (index === 0 && message.role === "system") {
            return {
              ...message,
              content: withWebSearchSystemContext(message.content),
            };
          }
          return message;
        });
      }

      const requestMessages: ChatMessage[] = [
        ...apiMessagesBase,
        { role: "user", content: apiUserContent },
      ];

      const output = await streamChatMessages({
        config: session.config,
        maxTokens: session.maxTokens,
        messages: requestMessages,
        signal: request.controller.signal,
        onToken: onActiveToken(request),
      });

      if (!isRequestActive(request)) return;

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          apiMessages: [
            ...prev.apiMessages,
            { role: "user", content: apiUserContent },
            { role: "assistant", content: output },
          ],
          visibleMessages: [
            ...prev.visibleMessages,
            { role: "user", content: text },
            { role: "assistant", content: output },
          ],
        };
      });
      setFollowUp("");
      endRequest(request);

      await recordHistorySafe(output, session.prompt, session.config, undefined, {
        shouldSetPanelError: () => requestIdRef.current === request.id,
      });
    } catch (caught) {
      if (!isRequestActive(request)) return;

      if (isAbortError(caught)) {
        // Keep completed dialogue; restore draft so user can resend
        setFollowUp(text);
      } else {
        const message = errorMessage(caught);
        setError(message);
        setFollowUp(text);
        orca.notify("error", message);
        console.error(caught);
      }
    } finally {
      endRequest(request);
    }
  };

  /**
   * Regenerate latest assistant answer.
   * Request context ends before that answer; success replaces it (no duplicate).
   */
  const regenerate = async () => {
    if (!context || !session || isGenerating) return;

    const apiMessages = session.apiMessages;
    let lastAssistantIndex = -1;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === "assistant") {
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistantIndex < 0) return;

    const previousContent = apiMessages[lastAssistantIndex].content;
    regenerateBackupRef.current = previousContent;

    const requestMessages = apiMessages.slice(0, lastAssistantIndex);

    // Optimistically drop the latest assistant from UI while regenerating
    setSession((prev) => {
      if (!prev) return prev;
      const nextVisible = [...prev.visibleMessages];
      for (let i = nextVisible.length - 1; i >= 0; i--) {
        if (nextVisible[i].role === "assistant") {
          nextVisible.splice(i, 1);
          break;
        }
      }
      return {
        ...prev,
        apiMessages: requestMessages,
        visibleMessages: nextVisible,
      };
    });

    const request = beginRequest();
    const sessionPrompt = session.prompt;
    const sessionConfig = session.config;
    const sessionMaxTokens = session.maxTokens;

    try {
      const output = await streamChatMessages({
        config: sessionConfig,
        maxTokens: sessionMaxTokens,
        messages: requestMessages,
        signal: request.controller.signal,
        onToken: onActiveToken(request),
      });

      if (!isRequestActive(request)) return;

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          apiMessages: [
            ...prev.apiMessages,
            { role: "assistant", content: output },
          ],
          visibleMessages: [
            ...prev.visibleMessages,
            { role: "assistant", content: output },
          ],
        };
      });
      regenerateBackupRef.current = null;
      // Keep any unsent follow-up draft
      endRequest(request);

      await recordHistorySafe(output, sessionPrompt, sessionConfig, undefined, {
        shouldSetPanelError: () => requestIdRef.current === request.id,
      });
    } catch (caught) {
      if (!isRequestActive(request)) return;

      // Restore previous valid answer on cancel or error
      const backup = regenerateBackupRef.current;
      regenerateBackupRef.current = null;
      if (backup !== null) {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            apiMessages: [
              ...prev.apiMessages,
              { role: "assistant", content: backup },
            ],
            visibleMessages: [
              ...prev.visibleMessages,
              { role: "assistant", content: backup },
            ],
          };
        });
      }

      if (!isAbortError(caught)) {
        const message = errorMessage(caught);
        setError(message);
        orca.notify("error", message);
        console.error(caught);
      }
    } finally {
      endRequest(request);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const performAction = async (
    action: AiHistoryAction,
    onClose: () => void,
  ) => {
    if (!context || !session || isGenerating) return;
    const result = latestAssistantContent();
    if (!result.trim()) return;

    try {
      if (action === "replace") {
        await replaceBlockResult(context, result);
      } else if (action === "insert") {
        if (session.prompt.resultKind === "tasks") {
          await insertActionTasks(context, result);
        } else {
          await insertResultAsChild(context, result);
        }
      } else {
        await copyResult(result);
      }
    } catch (caught) {
      setError(errorMessage(caught));
      orca.notify("error", errorMessage(caught));
      console.error(caught);
      return;
    }

    // Write-back succeeded — close per product rules; history is auxiliary
    orca.notify("success", "已应用 AI 结果。");
    onClose();
    await recordHistorySafe(result, session.prompt, session.config, action, {
      // The panel is already closed; still notify + console.error inside helper
      shouldSetPanelError: () => false,
    });
  };

  return {
    phase,
    settings,
    prompts: filteredPrompts,
    query,
    selectedIndex,
    context,
    session,
    followUp,
    isGenerating,
    streamingContent,
    pendingUserMessage,
    error,
    setQuery,
    setSelectedIndex,
    setFollowUp,
    updateSettings,
    executeCommand,
    sendFollowUp,
    regenerate,
    cancel,
    performAction,
    latestAssistantContent,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Prefer AbortError name; keep legacy message compatibility. */
function isAbortError(caught: unknown): boolean {
  if (
    typeof caught === "object" &&
    caught !== null &&
    "name" in caught &&
    (caught as { name?: unknown }).name === "AbortError"
  ) {
    return true;
  }
  return errorMessage(caught) === "The user aborted a request.";
}
