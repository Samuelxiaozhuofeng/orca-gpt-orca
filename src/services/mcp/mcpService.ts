/**
 * Orca Note MCP integration: connect, discover tools, convert to OpenAI
 * function-calling format, and route tool calls.
 */

import {
  createMCPClient,
  formatMCPToolResult,
  normalizeMCPInputSchema,
  type MCPServerConfig,
  type MCPToolDefinition,
} from "./mcpClient";
import {
  buildMcpOpenAIName,
  isExternalMcpToolName,
} from "./mcpToolNames";
import type { McpSettings, OpenAITool } from "../../types/ai";

const SERVER_ID = "orca-note";

type ActiveClient = ReturnType<typeof createMCPClient>;

type ToolRegistryEntry = {
  originalName: string;
  /** Tool input schema includes a repoId (or repo) field. */
  acceptsRepoId: boolean;
  acceptsRepo: boolean;
};

let activeClient: ActiveClient | null = null;
let activeConfigKey = "";
let discoveredTools: OpenAITool[] = [];
const toolRegistry = new Map<string, ToolRegistryEntry>();
let connectPromise: Promise<OpenAITool[]> | null = null;

export function isMcpToolName(toolName: string): boolean {
  return isExternalMcpToolName(toolName);
}

/** Current open repository id from the Orca host (`orca.state.repo`). */
export function getCurrentRepoId(): string {
  try {
    const repo =
      typeof orca !== "undefined" && typeof orca.state?.repo === "string"
        ? orca.state.repo.trim()
        : "";
    return repo || "unknown";
  } catch {
    return "unknown";
  }
}

export function getDiscoveredMcpTools(): OpenAITool[] {
  return discoveredTools.slice();
}

export function mcpSettingsToServerConfig(settings: McpSettings): MCPServerConfig {
  const headers: Record<string, string> = {};
  const token = settings.authToken.trim();
  if (token) {
    headers.Authorization = token.toLowerCase().startsWith("bearer ")
      ? token
      : `Bearer ${token}`;
  }

  return {
    id: SERVER_ID,
    name: "Orca Note MCP",
    type: "http",
    url: settings.url.trim() || "http://localhost:18672/mcp",
    headers,
    timeoutMs: 120_000,
  };
}

function configKey(config: MCPServerConfig): string {
  return JSON.stringify({
    url: config.url,
    headers: config.headers,
  });
}

export async function ensureMcpConnected(settings: McpSettings): Promise<OpenAITool[]> {
  if (!settings.enabled) {
    disconnectMcp();
    return [];
  }

  const config = mcpSettingsToServerConfig(settings);
  const key = configKey(config);

  if (activeClient && activeConfigKey === key && discoveredTools.length > 0) {
    return discoveredTools.slice();
  }

  if (connectPromise) return connectPromise;

  connectPromise = connectInternal(config, key).finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

async function connectInternal(
  config: MCPServerConfig,
  key: string,
): Promise<OpenAITool[]> {
  disconnectMcp();

  const client = createMCPClient(config);
  await client.initialize();
  const mcpTools = await client.listTools();

  const converted: OpenAITool[] = [];
  const usedNames = new Set<string>();

  for (const mcpTool of mcpTools) {
    const openAITool = convertMCPToolToOpenAI(mcpTool, usedNames);
    if (openAITool) converted.push(openAITool);
  }

  activeClient = client;
  activeConfigKey = key;
  discoveredTools = converted;

  return converted.slice();
}

function convertMCPToolToOpenAI(
  mcpTool: MCPToolDefinition,
  usedNames: Set<string>,
): OpenAITool | null {
  if (!mcpTool.name) return null;

  const openaiName = buildMcpOpenAIName(SERVER_ID, mcpTool.name, usedNames);
  const parameters = normalizeMCPInputSchema(mcpTool.inputSchema);
  const properties =
    parameters.properties && typeof parameters.properties === "object"
      ? parameters.properties
      : {};
  const acceptsRepoId = Object.prototype.hasOwnProperty.call(properties, "repoId");
  const acceptsRepo = Object.prototype.hasOwnProperty.call(properties, "repo");
  const displayName = mcpTool.title || mcpTool.name;
  const descriptionParts = [
    `[orca-note] MCP tool: ${displayName}`,
    mcpTool.description || "",
    `Original MCP name: ${mcpTool.name}`,
  ].filter(Boolean);

  toolRegistry.set(openaiName, {
    originalName: mcpTool.name,
    acceptsRepoId,
    acceptsRepo,
  });

  return {
    type: "function",
    function: {
      name: openaiName,
      description: descriptionParts.join("\n"),
      parameters,
    },
  };
}

/**
 * If the tool accepts repoId/repo and the model omitted or left it empty,
 * fill with the current host repository id.
 */
export function withDefaultRepoArgs(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    args && typeof args === "object" && !Array.isArray(args)
      ? { ...(args as Record<string, unknown>) }
      : {};

  const entry = toolRegistry.get(toolName);
  if (!entry) return base;

  const repoId = getCurrentRepoId();
  if (!repoId || repoId === "unknown") return base;

  if (entry.acceptsRepoId && isMissingRepoValue(base.repoId)) {
    base.repoId = repoId;
  }
  if (entry.acceptsRepo && isMissingRepoValue(base.repo)) {
    base.repo = repoId;
  }

  return base;
}

function isMissingRepoValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "unknown";
}

export async function callMcpTool(
  toolName: string,
  args: unknown,
): Promise<string> {
  const entry = toolRegistry.get(toolName);
  if (!entry) {
    return `Error: Unknown MCP tool "${toolName}"`;
  }
  if (!activeClient) {
    return `Error: Orca Note MCP is not connected`;
  }

  const finalArgs = withDefaultRepoArgs(toolName, args);

  try {
    const result = await activeClient.callTool(entry.originalName, finalArgs);
    return formatMCPToolResult(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error executing MCP tool "${entry.originalName}": ${msg || "Unknown error"}`;
  }
}

export function disconnectMcp(): void {
  if (activeClient) {
    activeClient.close();
  }
  activeClient = null;
  activeConfigKey = "";
  discoveredTools = [];
  toolRegistry.clear();
}

/** Human-readable short label for UI (strip mcp__orca-note__ prefix / hash). */
export function displayMcpToolName(openaiName: string): string {
  if (!openaiName.startsWith("mcp__")) return openaiName;
  const entry = toolRegistry.get(openaiName);
  if (entry?.originalName) return entry.originalName;
  const rest = openaiName.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep < 0) return openaiName;
  const toolPart = rest.slice(sep + 2);
  return toolPart.replace(/_[a-z0-9]{6,10}$/i, "") || toolPart;
}

export async function testMcpConnection(settings: McpSettings): Promise<string> {
  const tools = await ensureMcpConnected({ ...settings, enabled: true });
  const names = tools
    .slice(0, 12)
    .map((t) => displayMcpToolName(t.function.name));
  const extra = tools.length > 12 ? ` 等 ${tools.length} 个` : "";
  return `已连接 Orca Note MCP，发现 ${tools.length} 个工具${names.length ? `：${names.join(", ")}${extra}` : "。"}`;
}
