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

  const output = await streamChatCompletion({
    provider: {
      ...config.provider,
      defaultModel: config.model,
    },
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens: settings.maxTokens,
    signal,
    onToken,
  });

  return {
    output,
    prompt: runPrompt,
    config,
  };
}
