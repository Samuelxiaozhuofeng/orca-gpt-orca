import { streamChatCompletion } from "./openaiClient";
import {
  callMcpTool,
  displayMcpToolName,
  ensureMcpConnected,
  getCurrentRepoId,
  isMcpToolName,
} from "./mcp/mcpService";
import {
  buildUserMessage,
  makeTemporaryPrompt,
  resolvePromptConfig,
} from "../prompts/promptUtils";
import type {
  AiBlockContext,
  AiSettings,
  ChatMessage,
  McpSettings,
  OpenAITool,
  PromptTemplate,
  ResolvedPromptConfig,
  ToolCallInfo,
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

export type ToolStatusEvent = {
  phase: "connecting" | "calling" | "result" | "round";
  message: string;
  toolName?: string;
};

export type StreamMessagesOptions = {
  config: ResolvedPromptConfig;
  maxTokens: number;
  messages: ChatMessage[];
  signal: AbortSignal;
  onToken: (token: string) => void;
  /** When provided and enabled, run multi-round MCP tool loop. */
  mcp?: McpSettings;
  onToolStatus?: (event: ToolStatusEvent) => void;
  /** Called before each model stream after a tool round (clears partial UI). */
  onStreamReset?: () => void;
};

const MCP_APPENDIX_MARKER = "## Orca Note MCP tools";

function buildMcpSystemAppendix(repoId: string): string {
  return `${MCP_APPENDIX_MARKER}
你可以使用 tools 搜索、读取、写入用户的 Orca Note 笔记库。
- 当用户问题超出当前 block 文本时，优先调用工具。
- 使用 tools 列表中的**精确工具名**，不要发明、翻译或改写工具名。
- 工具返回后，用用户的语言给出简洁最终答复。
- 写入笔记后，说明改动了哪里（目标块/页面与内容摘要）。

## Technical Notes
- 当前仓库 repoId 为 \`${repoId}\`。
- 调用需要 \`repoId\`（或 \`repo\`）参数的工具时，**必须**使用 \`${repoId}\`，不要猜测或省略。
- 插件会在参数缺失时尝试自动补全 repoId，但你仍应主动传入正确值。`;
}

/** Multi-turn streaming with optional MCP tool loop. */
export async function streamChatMessages({
  config,
  maxTokens,
  messages,
  signal,
  onToken,
  mcp,
  onToolStatus,
  onStreamReset,
}: StreamMessagesOptions): Promise<{
  output: string;
  messages: ChatMessage[];
}> {
  const conversation = messages.map((message) => ({ ...message }));
  let tools: OpenAITool[] | undefined;

  if (mcp?.enabled) {
    onToolStatus?.({ phase: "connecting", message: "正在连接 Orca Note MCP…" });
    try {
      tools = await ensureMcpConnected(mcp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Orca Note MCP 连接失败：${msg}。请确认本机 MCP 已启动（默认 http://localhost:18672/mcp），或在设置中关闭 MCP。`,
      );
    }

    if (tools.length === 0) {
      onToolStatus?.({
        phase: "connecting",
        message: "MCP 已连接但未发现工具，将以纯对话继续。",
      });
      tools = undefined;
    } else {
      onToolStatus?.({
        phase: "connecting",
        message: `MCP 就绪，${tools.length} 个工具可用。`,
      });
      injectMcpSystemAppendix(conversation);
    }
  }

  const maxRounds = mcp?.enabled
    ? Math.max(1, Math.min(20, mcp.maxToolRounds || 8))
    : 0;

  let round = 0;
  while (true) {
    if (signal.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    if (round > 0) {
      onStreamReset?.();
    }

    const result = await streamChatCompletion({
      provider: {
        ...config.provider,
        defaultModel: config.model,
      },
      model: config.model,
      messages: conversation,
      temperature: config.temperature,
      maxTokens,
      signal,
      onToken,
      tools,
    });

    if (!tools?.length || result.toolCalls.length === 0) {
      const content = result.content ?? "";
      conversation.push({ role: "assistant", content });
      return { output: content, messages: conversation };
    }

    if (round >= maxRounds) {
      const content =
        result.content?.trim() ||
        `（已达工具轮次上限 ${maxRounds}，停止继续调用工具。）`;
      conversation.push({ role: "assistant", content });
      return { output: content, messages: conversation };
    }

    round += 1;
    onToolStatus?.({
      phase: "round",
      message: `工具轮次 ${round}/${maxRounds}`,
    });

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls,
    };
    conversation.push(assistantMessage);

    for (const toolCall of result.toolCalls) {
      if (signal.aborted) {
        throw new DOMException("The user aborted a request.", "AbortError");
      }

      const displayName = displayMcpToolName(toolCall.function.name);
      onToolStatus?.({
        phase: "calling",
        message: `正在调用 ${displayName}…`,
        toolName: displayName,
      });

      const toolResult = await executeToolCall(toolCall);
      onToolStatus?.({
        phase: "result",
        message: `${displayName} 完成`,
        toolName: displayName,
      });

      conversation.push({
        role: "tool",
        content: toolResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }
  }
}

async function executeToolCall(toolCall: ToolCallInfo): Promise<string> {
  const name = toolCall.function.name;
  let args: unknown = {};
  try {
    args = toolCall.function.arguments
      ? JSON.parse(toolCall.function.arguments)
      : {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: Invalid JSON in tool arguments: ${msg}`;
  }

  if (isMcpToolName(name)) {
    return callMcpTool(name, args);
  }

  return `Error: Unknown tool "${name}". Only MCP tools are available.`;
}

function injectMcpSystemAppendix(messages: ChatMessage[]): void {
  const repoId = getCurrentRepoId();
  const appendix = buildMcpSystemAppendix(repoId);

  const systemIndex = messages.findIndex((m) => m.role === "system");
  if (systemIndex >= 0) {
    const current = messages[systemIndex].content ?? "";
    // Strip any previous MCP appendix so repoId stays fresh after repo switch.
    const base = stripMcpAppendix(current);
    messages[systemIndex] = {
      ...messages[systemIndex],
      content: base ? `${base}\n\n${appendix}` : appendix,
    };
    return;
  }

  messages.unshift({
    role: "system",
    content: appendix,
  });
}

function stripMcpAppendix(content: string): string {
  const idx = content.indexOf(MCP_APPENDIX_MARKER);
  if (idx < 0) return content.trimEnd();
  return content.slice(0, idx).trimEnd();
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

  const { output } = await streamChatMessages({
    config,
    maxTokens: settings.maxTokens,
    messages,
    signal,
    onToken,
    mcp: settings.mcp,
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
