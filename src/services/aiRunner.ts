import { streamChatCompletion } from "./openaiClient";
import {
  buildUserMessage,
  makeTemporaryPrompt,
  resolvePromptConfig,
} from "../prompts/promptUtils";
import type {
  AiBlockContext,
  AiSettings,
  ChatMessage,
  PromptTemplate,
  ResolvedPromptConfig,
} from "../types/ai";

export type GenerateOptions = {
  settings: AiSettings;
  context: AiBlockContext;
  prompt: PromptTemplate;
  temporaryInstruction?: string;
  signal: AbortSignal;
  onToken: (token: string) => void;
};

export type GenerateResult = {
  output: string;
  prompt: PromptTemplate;
  config: ResolvedPromptConfig;
};

export type StreamMessagesOptions = {
  config: ResolvedPromptConfig;
  maxTokens: number;
  messages: ChatMessage[];
  signal: AbortSignal;
  onToken: (token: string) => void;
};

/** Multi-turn streaming with a fully specified ChatMessage[] payload. */
export async function streamChatMessages({
  config,
  maxTokens,
  messages,
  signal,
  onToken,
}: StreamMessagesOptions): Promise<string> {
  return streamChatCompletion({
    provider: {
      ...config.provider,
      defaultModel: config.model,
    },
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens,
    signal,
    onToken,
  });
}

/** Initial one-shot generation (used by legacy AiPanel and as the first turn). */
export async function generateAiResult({
  settings,
  context,
  prompt,
  temporaryInstruction,
  signal,
  onToken,
}: GenerateOptions): Promise<GenerateResult> {
  const runPrompt = temporaryInstruction?.trim()
    ? makeTemporaryPrompt(temporaryInstruction)
    : prompt;
  const instruction = temporaryInstruction?.trim() || prompt.instruction;
  const config = resolvePromptConfig(settings, runPrompt);
  const messages: ChatMessage[] = [
    { role: "system", content: settings.systemPrompt },
    {
      role: "user",
      content: buildUserMessage(instruction, context.blockText),
    },
  ];

  const output = await streamChatMessages({
    config,
    maxTokens: settings.maxTokens,
    messages,
    signal,
    onToken,
  });

  return {
    output,
    prompt: runPrompt,
    config,
  };
}

export function buildInitialMessages(
  systemPrompt: string,
  instruction: string,
  blockText: string,
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: buildUserMessage(instruction, blockText),
    },
  ];
}
