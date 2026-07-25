import React, { useState } from "react";
import { CustomPrompts } from "./CustomPrompts";
import { PromptRouting } from "./PromptRouting";
import { fetchAndStoreModels } from "../services/modelService";
import { testLocalCliConnection } from "../services/localCliRunner";
import { testMcpConnection } from "../services/mcp/mcpService";
import { testWebSearchConnection } from "../services/webSearch";
import { DEFAULT_SETTINGS } from "../settings/schema";
import type {
  AiProvider,
  AiSettings,
  LocalCliSettings,
  McpSettings,
  PromptTemplate,
  WebSearchProvider,
  WebSearchSettings,
} from "../types/ai";

type SettingsViewProps = {
  settings: AiSettings;
  prompts: PromptTemplate[];
  visibleSection?:
    | "providers"
    | "webSearch"
    | "mcp"
    | "localCli"
    | "routing"
    | "prompts";
  onSettingsChange: (settings: AiSettings) => void;
  onError: (message: string) => void;
};

export function SettingsView({
  settings,
  prompts,
  visibleSection,
  onSettingsChange,
  onError,
}: SettingsViewProps) {
  const [isFetchingProviderId, setIsFetchingProviderId] = useState("");
  const [isTestingSearch, setIsTestingSearch] = useState(false);
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [isTestingLocalCli, setIsTestingLocalCli] = useState(false);

  const fetchModels = async (providerId: string) => {
    setIsFetchingProviderId(providerId);
    try {
      onSettingsChange(await fetchAndStoreModels(settings, providerId));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFetchingProviderId("");
    }
  };

  const testSearch = async () => {
    const webSearch = settings.webSearch ?? DEFAULT_SETTINGS.webSearch;
    if (!webSearch.enabled) {
      onError("请先启用联网搜索。");
      return;
    }

    onError("");
    setIsTestingSearch(true);
    try {
      const message = await testWebSearchConnection(webSearch);
      orca.notify("success", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(message);
      orca.notify("error", message);
    } finally {
      setIsTestingSearch(false);
    }
  };

  const testMcp = async () => {
    const mcp = settings.mcp ?? DEFAULT_SETTINGS.mcp;
    onError("");
    setIsTestingMcp(true);
    try {
      const message = await testMcpConnection(mcp);
      orca.notify("success", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(message);
      orca.notify("error", message);
    } finally {
      setIsTestingMcp(false);
    }
  };

  const testLocalCli = async () => {
    const localCli = settings.localCli ?? DEFAULT_SETTINGS.localCli;
    onError("");
    setIsTestingLocalCli(true);
    try {
      const message = await testLocalCliConnection(localCli);
      orca.notify("success", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(message);
      orca.notify("error", message);
    } finally {
      setIsTestingLocalCli(false);
    }
  };

  return (
    <section className="orca-ai-panel__settings">
      {visibleSection == null || visibleSection === "providers" ? (
        <>
          <div className="orca-ai-panel__section-heading">
            <span>Providers</span>
            <button
              type="button"
              onClick={() => addProvider(settings, onSettingsChange)}
            >
              Add
            </button>
          </div>
          <div className="orca-ai-panel__provider-list">
            {settings.providers.map((provider) => (
              <ProviderEditor
                key={provider.id}
                provider={provider}
                settings={settings}
                isFetching={isFetchingProviderId === provider.id}
                onSettingsChange={onSettingsChange}
                onError={onError}
                onFetchModels={fetchModels}
              />
            ))}
          </div>
        </>
      ) : null}
      {visibleSection == null || visibleSection === "webSearch" ? (
        <WebSearchEditor
          settings={settings}
          isTesting={isTestingSearch}
          onSettingsChange={onSettingsChange}
          onTestConnection={testSearch}
        />
      ) : null}
      {visibleSection == null || visibleSection === "mcp" ? (
        <McpEditor
          settings={settings}
          isTesting={isTestingMcp}
          onSettingsChange={onSettingsChange}
          onTestConnection={testMcp}
        />
      ) : null}
      {visibleSection == null || visibleSection === "localCli" ? (
        <LocalCliEditor
          settings={settings}
          isTesting={isTestingLocalCli}
          onSettingsChange={onSettingsChange}
          onTestConnection={testLocalCli}
        />
      ) : null}
      {visibleSection == null || visibleSection === "routing" ? (
        <PromptRouting
          prompts={prompts}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      ) : null}
      {visibleSection == null || visibleSection === "prompts" ? (
        <CustomPrompts settings={settings} onSettingsChange={onSettingsChange} />
      ) : null}
    </section>
  );
}

function LocalCliEditor({
  settings,
  isTesting,
  onSettingsChange,
  onTestConnection,
}: {
  settings: AiSettings;
  isTesting: boolean;
  onSettingsChange: (settings: AiSettings) => void;
  onTestConnection: () => void;
}) {
  const localCli: LocalCliSettings = {
    ...DEFAULT_SETTINGS.localCli,
    ...(settings.localCli ?? {}),
  };

  const updateLocalCli = (patch: Partial<LocalCliSettings>) => {
    onSettingsChange({
      ...settings,
      localCli: {
        ...localCli,
        ...patch,
      },
    });
  };

  return (
    <>
      <div className="orca-ai-panel__section-heading">
        <span>Local CLI</span>
      </div>
      <div className="orca-ai-panel__provider-list">
        <div className="orca-ai-panel__provider">
          <div className="orca-ai-panel__provider-title">
            <strong>Localhost bridge</strong>
            <span>{localCli.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <p className="orca-ai-panel__hint">
            通过本机 HTTP bridge 调用 CLI（如 Codex），插件本身不 spawn
            进程。启动：
            <code>node scripts/local-cli-bridge.mjs --port 18777</code>
            。启用后，命令面板会出现「Run with Local CLI」。可在 prompt
            首行写 <code>cwd: /path</code> 临时覆盖工作目录；默认会读取当前页面
            <code>#cli</code> 标签引用上的文本属性 <code>cwd</code>。默认 Codex 参数会绕过审批与沙箱，允许操作本机文件和应用。
          </p>
          <label className="orca-ai-panel__field orca-ai-panel__field--checkbox">
            <span>启用 Local CLI</span>
            <input
              type="checkbox"
              checked={localCli.enabled}
              onChange={(e) => updateLocalCli({ enabled: e.target.checked })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Bridge URL</span>
            <input
              type="text"
              value={localCli.bridgeUrl}
              placeholder="http://localhost:18777"
              onChange={(e) => updateLocalCli({ bridgeUrl: e.target.value })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Command</span>
            <input
              type="text"
              value={localCli.command}
              placeholder="codex"
              onChange={(e) => updateLocalCli({ command: e.target.value })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Args（空格分隔）</span>
            <input
              type="text"
              value={localCli.args}
              placeholder="exec --dangerously-bypass-approvals-and-sandbox"
              onChange={(e) => updateLocalCli({ args: e.target.value })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Timeout (ms)</span>
            <input
              type="number"
              min={1000}
              max={1800000}
              step={1000}
              value={localCli.timeoutMs}
              onChange={(e) => {
                const n = Number(e.target.value);
                updateLocalCli({
                  timeoutMs: Number.isFinite(n) ? n : 300_000,
                });
              }}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Auth Token（可选）</span>
            <input
              type="password"
              value={localCli.authToken}
              autoComplete="off"
              placeholder="与 bridge --token 一致；留空则不发送"
              onChange={(e) => updateLocalCli({ authToken: e.target.value })}
            />
          </label>
          <div className="orca-ai-panel__provider-actions">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting}
            >
              {isTesting ? "Testing…" : "Test connection"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function McpEditor({
  settings,
  isTesting,
  onSettingsChange,
  onTestConnection,
}: {
  settings: AiSettings;
  isTesting: boolean;
  onSettingsChange: (settings: AiSettings) => void;
  onTestConnection: () => void;
}) {
  const mcp: McpSettings = {
    ...DEFAULT_SETTINGS.mcp,
    ...(settings.mcp ?? {}),
  };

  const updateMcp = (patch: Partial<McpSettings>) => {
    onSettingsChange({
      ...settings,
      mcp: {
        ...mcp,
        ...patch,
      },
    });
  };

  return (
    <>
      <div className="orca-ai-panel__section-heading">
        <span>MCP Tools / 笔记工具</span>
      </div>
      <div className="orca-ai-panel__provider-list">
        <div className="orca-ai-panel__provider">
          <div className="orca-ai-panel__provider-title">
            <strong>Orca Note MCP</strong>
            <span>{mcp.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <p className="orca-ai-panel__hint">
            连接本机 Orca Note MCP（默认 localhost:18672），让模型在对话中
            自行搜索、读取、写入笔记。需模型支持 function calling。
          </p>
          <label className="orca-ai-panel__field orca-ai-panel__field--checkbox">
            <span>启用 MCP 工具</span>
            <input
              type="checkbox"
              checked={mcp.enabled}
              onChange={(e) => updateMcp({ enabled: e.target.checked })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>MCP URL</span>
            <input
              type="text"
              value={mcp.url}
              placeholder="http://localhost:18672/mcp"
              onChange={(e) => updateMcp({ url: e.target.value })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>Auth Token</span>
            <input
              type="password"
              value={mcp.authToken}
              placeholder="orca-mcp"
              onChange={(e) => updateMcp({ authToken: e.target.value })}
            />
          </label>
          <label className="orca-ai-panel__field">
            <span>最大工具轮次</span>
            <input
              type="number"
              min={1}
              max={20}
              value={mcp.maxToolRounds}
              onChange={(e) =>
                updateMcp({
                  maxToolRounds: Number(e.target.value) || 8,
                })
              }
            />
          </label>
          <div className="orca-ai-panel__provider-actions">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting}
            >
              {isTesting ? "Testing…" : "Test connection"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function WebSearchEditor({
  settings,
  isTesting,
  onSettingsChange,
  onTestConnection,
}: {
  settings: AiSettings;
  isTesting: boolean;
  onSettingsChange: (settings: AiSettings) => void;
  onTestConnection: () => void;
}) {
  const webSearch: WebSearchSettings = {
    ...DEFAULT_SETTINGS.webSearch,
    ...(settings.webSearch ?? {}),
  };

  const updateWebSearch = (patch: Partial<WebSearchSettings>) => {
    onSettingsChange({
      ...settings,
      webSearch: {
        ...webSearch,
        ...patch,
      },
    });
  };

  return (
    <>
      <div className="orca-ai-panel__section-heading">
        <span>Web Search / 联网搜索</span>
      </div>
      <div className="orca-ai-panel__provider-list">
        <div className="orca-ai-panel__provider">
          <div className="orca-ai-panel__provider-title">
            <strong>Search pipeline</strong>
            <span>{webSearch.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <p className="orca-ai-panel__muted">
            当用户消息明确要求「联网」「上网查」「查最新」等时触发。默认
            auto：双路并发（优先已填 Key 的源，如 Brave+Tavily；不足则用
            Exa），按 URL 去重、多源命中加权、同域名限流后合并，再对前几条用
            Jina 抓正文。固定某一提供商则只走单路。API Key 不会发给对话模型。
          </p>
          <div className="orca-ai-panel__provider-fields">
            <label className="orca-ai-panel__inline-check">
              <input
                type="checkbox"
                checked={webSearch.enabled}
                onChange={(event) =>
                  updateWebSearch({ enabled: event.currentTarget.checked })
                }
              />
              启用联网搜索
            </label>
            <label>
              搜索提供商
              <select
                value={webSearch.provider}
                onChange={(event) =>
                  updateWebSearch({
                    provider: event.currentTarget.value as WebSearchProvider,
                  })
                }
              >
                <option value="auto">Auto（推荐，双路并发+去重加权）</option>
                <option value="exa">Exa（无 Key 也可试 MCP）</option>
                <option value="brave">Brave</option>
                <option value="tavily">Tavily</option>
                <option value="perplexity">Perplexity</option>
              </select>
            </label>
            <label>
              Tavily search depth
              <select
                value={webSearch.searchDepth}
                onChange={(event) =>
                  updateWebSearch({
                    searchDepth:
                      event.currentTarget.value === "basic"
                        ? "basic"
                        : "advanced",
                  })
                }
              >
                <option value="advanced">advanced（更高质量）</option>
                <option value="basic">basic（更快更便宜）</option>
              </select>
            </label>
            <label>
              Max results
              <input
                type="number"
                min={1}
                max={10}
                value={webSearch.maxResults}
                onChange={(event) => {
                  const n = Number(event.currentTarget.value);
                  updateWebSearch({
                    maxResults: Number.isFinite(n)
                      ? Math.max(1, Math.min(10, Math.floor(n)))
                      : 5,
                  });
                }}
              />
            </label>
            <label className="orca-ai-panel__inline-check">
              <input
                type="checkbox"
                checked={webSearch.includeAnswer}
                onChange={(event) =>
                  updateWebSearch({
                    includeAnswer: event.currentTarget.checked,
                  })
                }
              />
              使用提供商综合答案（include answer）
            </label>
            <label className="orca-ai-panel__inline-check">
              <input
                type="checkbox"
                checked={webSearch.fetchFullContent}
                onChange={(event) =>
                  updateWebSearch({
                    fetchFullContent: event.currentTarget.checked,
                  })
                }
              />
              抓取页面正文（Jina Reader，前 3 条）
            </label>
            <label>
              Exa API Key（可选）
              <input
                type="password"
                value={webSearch.exaApiKey}
                autoComplete="off"
                placeholder="exa-...（留空则走公共 MCP）"
                onChange={(event) =>
                  updateWebSearch({ exaApiKey: event.currentTarget.value })
                }
              />
            </label>
            <label>
              Brave API Key
              <input
                type="password"
                value={webSearch.braveApiKey}
                autoComplete="off"
                placeholder="BSA_..."
                onChange={(event) =>
                  updateWebSearch({ braveApiKey: event.currentTarget.value })
                }
              />
            </label>
            <label>
              Tavily API Key
              <input
                type="password"
                value={webSearch.tavilyApiKey}
                autoComplete="off"
                placeholder="tvly-..."
                onChange={(event) =>
                  updateWebSearch({ tavilyApiKey: event.currentTarget.value })
                }
              />
            </label>
            <label>
              Perplexity API Key
              <input
                type="password"
                value={webSearch.perplexityApiKey}
                autoComplete="off"
                placeholder="pplx-..."
                onChange={(event) =>
                  updateWebSearch({
                    perplexityApiKey: event.currentTarget.value,
                  })
                }
              />
            </label>
          </div>
          <div className="orca-ai-panel__provider-actions">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting || !webSearch.enabled}
            >
              {isTesting ? "Testing…" : "Test connection"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ProviderEditor({
  provider,
  settings,
  isFetching,
  onSettingsChange,
  onError,
  onFetchModels,
}: {
  provider: AiProvider;
  settings: AiSettings;
  isFetching: boolean;
  onSettingsChange: (settings: AiSettings) => void;
  onError: (message: string) => void;
  onFetchModels: (providerId: string) => void;
}) {
  const updateProvider = (nextProvider: AiProvider) => {
    onSettingsChange({
      ...settings,
      providers: settings.providers.map((item) =>
        item.id === nextProvider.id ? nextProvider : item,
      ),
    });
  };

  return (
    <div className="orca-ai-panel__provider">
      <div className="orca-ai-panel__provider-title">
        <strong>{provider.name}</strong>
        <span>{provider.models.length} models</span>
      </div>
      <ProviderFields provider={provider} onProviderChange={updateProvider} />
      <div className="orca-ai-panel__provider-actions">
        <button
          type="button"
          onClick={() => onFetchModels(provider.id)}
          disabled={isFetching}
        >
          {isFetching ? "Fetching" : "Fetch models"}
        </button>
        <button
          type="button"
          onClick={() =>
            onSettingsChange({
              ...settings,
              defaultProviderId: provider.id,
              defaultModel: provider.defaultModel ?? settings.defaultModel,
            })
          }
        >
          Set default
        </button>
        <button
          type="button"
          onClick={() => deleteProvider(provider.id, settings, onSettingsChange, onError)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ProviderFields({
  provider,
  onProviderChange,
}: {
  provider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
}) {
  return (
    <div className="orca-ai-panel__provider-fields">
      <label>
        Name
        <input
          value={provider.name}
          onChange={(event) =>
            onProviderChange({ ...provider, name: event.currentTarget.value })
          }
        />
      </label>
      <label>
        API URL
        <input
          value={provider.apiBaseUrl}
          onChange={(event) =>
            onProviderChange({
              ...provider,
              apiBaseUrl: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={provider.apiKey}
          onChange={(event) =>
            onProviderChange({ ...provider, apiKey: event.currentTarget.value })
          }
        />
      </label>
      <label>
        Default model
        <select
          value={provider.defaultModel ?? ""}
          onChange={(event) =>
            onProviderChange({
              ...provider,
              defaultModel: event.currentTarget.value,
            })
          }
        >
          <option value="">Select a model...</option>
          {provider.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function addProvider(
  settings: AiSettings,
  onSettingsChange: (settings: AiSettings) => void,
) {
  const id = `provider-${Date.now()}`;
  onSettingsChange({
    ...settings,
    providers: [
      ...settings.providers,
      {
        id,
        name: "New Provider",
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "",
        models: [],
        defaultModel: "",
      },
    ],
    defaultProviderId: settings.defaultProviderId || id,
  });
}

function deleteProvider(
  providerId: string,
  settings: AiSettings,
  onSettingsChange: (settings: AiSettings) => void,
  onError: (message: string) => void,
) {
  if (settings.providers.length <= 1) {
    onError("至少需要保留一个 provider。");
    return;
  }

  const providers = settings.providers.filter((item) => item.id !== providerId);
  onSettingsChange({
    ...settings,
    providers,
    defaultProviderId:
      settings.defaultProviderId === providerId
        ? providers[0].id
        : settings.defaultProviderId,
  });
}
