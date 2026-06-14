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
