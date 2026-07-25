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

/** Orca Note MCP server (read/write notes via agent tools). */
export type McpSettings = {
  /** Master switch. When on, model may call MCP tools during generation. */
  enabled: boolean;
  /** Streamable HTTP endpoint, default http://localhost:18672/mcp */
  url: string;
  /** Bearer token (with or without "Bearer " prefix). */
  authToken: string;
  /** Max tool→model rounds per user turn (1–20). Default: 8. */
  maxToolRounds: number;
};

/**
 * Local CLI via localhost HTTP bridge (no child_process in the plugin).
 * Plugin POSTs to the bridge; the bridge spawns the real CLI.
 */
export type LocalCliSettings = {
  /** Master switch. When on, command panel shows "Run with Local CLI". */
  enabled: boolean;
  /** Bridge base URL, default http://localhost:18777 */
  bridgeUrl: string;
  /** CLI binary name/path, default "codex" */
  command: string;
  /** Space-separated args (v1), default "exec" */
  args: string;
  /** Run timeout in ms. Default: 300000 (5 min). */
  timeoutMs: number;
  /** Optional Bearer token for the bridge. Empty = no Authorization header. */
  authToken: string;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      [key: string]: unknown;
    };
  };
};

export type ToolCallInfo = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
  mcp: McpSettings;
  localCli: LocalCliSettings;
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
  rootBlockId?: DbId;
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
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallInfo[];
  tool_call_id?: string;
  name?: string;
};

export type RunRequest = {
  prompt: PromptTemplate;
  instruction: string;
  context: AiBlockContext;
  settings: AiSettings;
};
