import type { Block, CursorData, DbId } from "../orca";

export type OutputMode = "replace" | "insert" | "ask";

export type ResultKind = "text" | "tasks";

export type AiProvider = {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel?: string;
};

export type PromptOverride = {
  promptId: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  outputMode?: OutputMode;
};

export type PromptTemplate = {
  id: string;
  name: string;
  description?: string;
  instruction: string;
  temperature?: number;
  providerId?: string;
  model?: string;
  outputMode?: OutputMode;
  resultKind?: ResultKind;
  enabled?: boolean;
  builtin?: boolean;
};

/** Search backend for live web lookup. */
export type WebSearchProvider =
  | "auto"
  | "exa"
  | "brave"
  | "tavily"
  | "perplexity";

export type WebSearchDepth = "basic" | "advanced";

export type WebSearchSettings = {
  /** Master switch for live web search. Default: false. */
  enabled: boolean;
  /**
   * Provider selection.
   * - `auto`: dual concurrent search (prefer keyed providers) + URL dedupe/rank.
   * - fixed provider: single backend only.
   * Exa also works without a key via public MCP.
   */
  provider: WebSearchProvider;
  /** Tavily API key. Never sent to the model. */
  tavilyApiKey: string;
  /** Exa API key (optional — MCP path works without it). */
  exaApiKey: string;
  /** Brave Search API key. */
  braveApiKey: string;
  /** Perplexity API key. */
  perplexityApiKey: string;
  /** Tavily search depth. Default: advanced. */
  searchDepth: WebSearchDepth;
  /** Prefer provider-side synthesized answer when available. Default: true. */
  includeAnswer: boolean;
  /**
   * After search, fetch full page text for top results (Jina Reader).
   * Default: true.
   */
  fetchFullContent: boolean;
  /** Max search results to keep after merge (1–10). Default: 5. */
  maxResults: number;
};

export type AiSettings = {
  shortcut: string;
  defaultProviderId: string;
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  providers: AiProvider[];
  promptOverrides: PromptOverride[];
  customPrompts: PromptTemplate[];
  webSearch: WebSearchSettings;
};

export type AiHistoryAction = "replace" | "insert" | "copy";

export type AiHistoryItem = {
  id: string;
  createdAt: string;
  blockId: DbId;
  promptId?: string;
  promptName: string;
  providerId: string;
  model: string;
  inputPreview: string;
  output: string;
  action?: AiHistoryAction;
};

export type AiBlockContext = {
  blockId: DbId;
  block: Block;
  blockText: string;
  cursor: CursorData | null;
  selectedBlockIds: DbId[];
  blockCount: number;
};

export type ResolvedPromptConfig = {
  provider: AiProvider;
  model: string;
  temperature: number;
  outputMode: OutputMode;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RunRequest = {
  prompt: PromptTemplate;
  instruction: string;
  context: AiBlockContext;
  settings: AiSettings;
};
