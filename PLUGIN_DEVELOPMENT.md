# Orca AI 快捷处理插件开发文档

调研日期：2026-06-14

## 1. 目标

开发一个面向 Orca Note 的 AI 快捷处理插件：用户在 block 中通过快捷键唤出 AI 交互面板，对当前 block 内容执行总结、润色、行动项等预制 prompt 操作，并支持多个 OpenAI-compatible provider、自定义 API Key/API URL、拉取模型列表和最近 10 条历史。

本插件参考 `briansunter/logseq-plugin-gpt3-openai` 的核心交互，不照搬 Logseq 特性。明确不纳入首版范围：图片生成、Whisper 转写、Logseq 专属 page 命令、Logseq datascript prompt-template 机制。

## 2. 调研来源

- Logseq 插件仓库：<https://github.com/briansunter/logseq-plugin-gpt3-openai>
- Logseq 插件 README：<https://github.com/briansunter/logseq-plugin-gpt3-openai/blob/master/README.md>
- Logseq 插件入口：<https://github.com/briansunter/logseq-plugin-gpt3-openai/blob/master/src/main.tsx>
- Logseq 插件设置：<https://github.com/briansunter/logseq-plugin-gpt3-openai/blob/master/src/lib/settings.ts>
- Logseq 插件 OpenAI 调用：<https://github.com/briansunter/logseq-plugin-gpt3-openai/blob/master/src/lib/openai.ts>
- OpenAI Models API：<https://platform.openai.com/docs/api-reference/models/list>
- OpenAI Chat Completions API：<https://platform.openai.com/docs/api-reference/chat/create>
- 本地 Orca 插件模板：[README.md](./README.md)
- 本地 Orca API 类型：[src/orca.d.ts](./src/orca.d.ts)
- 本地 Orca 快速开始文档：[plugin-docs/documents/Quick-Start.md](./plugin-docs/documents/Quick-Start.md)
- 本地 Orca 编辑器命令文档：[plugin-docs/documents/Core-Editor-Commands.md](./plugin-docs/documents/Core-Editor-Commands.md)
- 本地 Orca 后端 API 文档：[plugin-docs/documents/Backend-API.md](./plugin-docs/documents/Backend-API.md)

## 3. Logseq GPT 插件核心用法调研

`briansunter/logseq-plugin-gpt3-openai` 的主功能是将当前编辑上下文作为输入，打开一个 AI 命令弹窗，选择 prompt 后生成结果，再插入或替换笔记内容。

可借鉴的核心能力：

1. 快捷入口：`cmd+g` 打开 GPT popup，也可从 block menu 或 slash menu 调用 `gpt`。
2. 上下文输入：当前 block 内容作为 prompt 输入；多选 blocks 时合并多个 block 内容；不在 block 中时不附加 block 输入。
3. Prompt 面板：支持用户直接输入 prompt，也支持搜索和选择内置 prompt 模板。
4. 结果预览：生成结果先显示在 popup 中。
5. 写回动作：支持 `Insert`、`Replace`、`Regenerate`。
6. 流式输出：`openAIWithStream` 边生成边更新 UI。
7. 设置项：支持 API Key、模型名、API endpoint、system/chat prompt、temperature、max tokens、输出前缀、快捷键。
8. 自定义 prompt 模板：Logseq 通过 `prompt-template::` 属性和子 block 中的 `prompt` code block 发现模板。

不建议照搬的部分：

1. DALL-E 图片生成：用户已明确不需要。
2. Whisper 音频转写：偏离当前 block 文本快捷处理。
3. GPT-3 completion 分支：首版建议聚焦 OpenAI-compatible `/chat/completions`，避免旧 API 复杂度。
4. 自动重试/backoff：本项目全局规则偏向 debug-first，首版应显式暴露错误，不用隐式重试掩盖问题。
5. Logseq 专属数据查询：Orca 需要用 `orca.state.blocks`、`orca.utils.getCursorDataFromSelection`、`orca.invokeBackend` 和 `core.editor.*` 命令实现。

## 4. 当前 Orca 插件目录特点

当前目录是一个 Orca Note 插件模板，而不是完整业务插件。

项目结构特点：

- 入口是 [src/main.ts](./src/main.ts)，只导出 `load(pluginName)` 和 `unload()`。
- 构建使用 Vite library mode，输出 `dist/index.js`。
- `react` 和 `valtio` 是 peer dependencies，Vite 配置通过 `externalGlobals` 将它们映射到全局 `React`、`Valtio`。
- Orca 全局 API 通过 `orca` 对象访问，类型声明在 [src/orca.d.ts](./src/orca.d.ts)。
- 当前已有简单 l10n helper：[src/libs/l10n.ts](./src/libs/l10n.ts)。
- README 只有模板标题，需要后续补充安装和使用说明。

Orca 插件开发相关能力：

1. 生命周期：插件启用时调用 `load(pluginName)`，禁用时调用 `unload()`。
2. 设置：`orca.plugins.setSettingsSchema(pluginName, schema)` 注册配置项；当前设置在 `orca.state.plugins[pluginName]?.settings`。
3. 命令：`orca.commands.registerCommand` 注册普通命令；`registerEditorCommand` 可接收编辑器上下文并进入撤销系统。
4. 快捷键：`orca.shortcuts.assign(shortcut, commandId)` 可绑定快捷键到命令。
5. 当前 block：可用 `window.getSelection()` 加 `orca.utils.getCursorDataFromSelection()` 获取 cursor，再从 `cursor.anchor.blockId` 取 block。
6. Block 读取：可用 `orca.state.blocks[blockId]` 取已加载 block；需要子树时可用 `orca.invokeBackend("get-block-tree", blockId)`。
7. Block 写回：`core.editor.setBlocksContent` 替换 block 内容；`core.editor.insertBlock` 或 `core.editor.batchInsertText` 插入结果。
8. Block 菜单：`orca.blockMenuCommands.registerBlockMenuCommand` 可在 block 右键菜单注册 AI 操作。
9. Slash 菜单：`orca.slashCommands.registerSlashCommand` 可注册 `/AI` 入口。
10. 通知：`orca.notify("error" | "warn" | "info" | "success", message)` 反馈错误或完成状态。

## 5. 首版产品定义

首版做一个“当前 block AI 快捷处理面板”，范围尽量收束，但把 provider、多模型和最近历史作为首版核心能力纳入。

核心用户流：

1. 用户将光标放在一个 block 内。
2. 按默认快捷键 `Command+G` 打开 AI 面板；在 Orca 设置中显示为 `meta+g`，该操作注册为 Orca command，用户之后可在 Orca 快捷键设置中自定义。
3. 插件读取整个当前 block 文本作为上下文；即使用户只选中一段文本，也处理整个 block。
4. 用户选择预制 prompt，或输入临时 prompt。
5. 插件调用选定 provider 的 OpenAI-compatible API，流式展示结果。
6. 生成完毕后，用户选择替换当前 block，或把结果插入当前 block 下面作为子 block。

首版必要功能：

- `Command+G` 唤出面板，内部快捷键配置使用 Orca 显示的 `meta+g`，并允许用户通过 Orca 快捷键系统自定义。
- 当前 block 内容作为默认上下文。
- 首版只处理当前 block，不处理子 block 或多 block 选择。
- 处理整个 block，不做选中文本局部处理。
- 3 个内置 prompts：总结、润色、行动项。
- 用户可输入一次性 prompt。
- OpenAI-compatible provider 管理：每个 provider 可配置 API Key、API URL，并拉取模型。
- 支持多个 provider，prompt 可指定 provider/model；未指定时使用全局默认 provider/model。
- Fetch models：调用 `${apiBaseUrl}/models` 获取 `data[].id`。
- 结果预览。
- Replace / Insert / Regenerate / Copy。
- Insert 将结果插入为当前 block 的子 block。
- Replace 直接替换当前 block。
- 行动项 prompt 需要结合 Orca task 能力，把生成的行动项创建为当前 block 子级下的同级 To do，并保持模型输出顺序。
- 保留最近 10 条历史。
- 错误显式展示，包括未配置 API Key、模型列表拉取失败、API 请求失败、当前光标不在 block 中。

首版暂缓功能：

- 图片生成。
- 音频转写。
- 多轮聊天记忆。
- 跨 page 全文处理。
- 后台任务队列。
- 自动重试和降级模型。
- 自动添加输出前缀、标签或引用来源。

## 6. 建议文件组织

必须避免把所有逻辑塞进 `src/main.ts`。建议按职责拆分：

```text
src/
  main.ts
  settings/
    schema.ts
    readSettings.ts
  commands/
    registerCommands.ts
    resolveBlockContext.ts
    writeBackResult.ts
  services/
    openaiClient.ts
    modelService.ts
    streamParser.ts
  prompts/
    defaultPrompts.ts
    promptTypes.ts
  ui/
    mountAiPanel.tsx
    AiPanel.tsx
    PromptPicker.tsx
    ResultPreview.tsx
    ModelPicker.tsx
    PanelActions.tsx
  styles/
    ai-panel.css
  types/
    ai.ts
```

职责说明：

- `main.ts`：只负责生命周期、l10n 初始化、注册和注销。
- `settings/*`：定义 schema、读取并校验设置。
- `commands/*`：处理 Orca 命令、上下文、写回。
- `services/*`：封装 API 请求、模型拉取、SSE 解析。
- `prompts/*`：内置 prompt 和 prompt 类型。
- `ui/*`：React 交互面板组件。
- `types/*`：共享类型，不与 UI 或服务混写。

## 7. 设置设计

Orca 插件设置 schema 支持 `string`、`number`、`boolean`、`singleChoice`、`multiChoices`、`array` 等类型，也支持 `arrayItemSchema`。不过当前文档没有“设置页标签页/tab”的插件级 schema；因此“AI 模型设置标签页”建议先做在插件自己的 AI 面板中，而不是完全依赖 Orca 原生设置页。Orca 原生设置页保存基础默认值，插件内设置视图负责 provider、模型拉取、prompt override、历史查看等复杂交互。

建议分两层：

1. Orca 原生插件设置页：保存默认快捷键、默认 provider/model、全局 system prompt、全局 temperature/max tokens。
2. 插件 AI 面板内的“模型设置”视图：管理多个 OpenAI-compatible provider、拉取模型、给 prompt 指定 provider/model/temperature/output mode。

基础 settings schema：

| Key | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `shortcut` | string | `meta+g` | 打开 AI 面板的默认快捷键，界面含义为 `Command+G`，用户可在 Orca 快捷键系统中覆盖 |
| `defaultProviderId` | string | `openai` | 默认 provider |
| `defaultModel` | string | 空 | 默认模型，未配置时要求用户先 fetch/select |
| `systemPrompt` | string | 简短中文默认约束 | 全局系统提示 |
| `temperature` | number | `0.7` | 全局默认采样温度 |
| `maxTokens` | number | `1000` | 最大输出 token |
| `providers` | array | OpenAI 默认项 | Provider 配置列表 |
| `promptOverrides` | array | 空 | 对内置或自定义 prompt 的 per-prompt 配置 |
| `customPrompts` | array | 空 | 自定义 prompt 模板 |

注意：

- API Key 不硬编码，但允许直接保存在插件 settings/data 中。
- 每个 provider 的 `apiBaseUrl` 要规范化，去除末尾 slash。
- `providers`、`customPrompts`、`promptOverrides` 可用 Orca 设置 schema 的 `array` 类型描述，但复杂增删改、模型拉取和校验应在插件自己的设置视图中完成。
- 动态 model choices 不强依赖 Orca 设置页的 `singleChoice`；模型拉取结果应存入插件数据或 provider 配置，并在面板内选择。
- 最近 10 条历史使用 `orca.plugins.setData(pluginName, "history", jsonString)` 存储，不放在 settings schema 中；历史只保存输入预览和完整输出。

Provider 数据结构：

```ts
export type AiProvider = {
  id: string
  name: string
  apiBaseUrl: string
  apiKey: string
  models?: string[]
  defaultModel?: string
}
```

Prompt override 数据结构：

```ts
export type PromptOverride = {
  promptId: string
  providerId?: string
  model?: string
  temperature?: number
  outputMode?: "replace" | "insert" | "ask"
}
```

历史记录数据结构：

```ts
export type AiHistoryItem = {
  id: string
  createdAt: string
  blockId: number
  promptId?: string
  promptName: string
  providerId: string
  model: string
  inputPreview: string
  output: string
  action?: "replace" | "insert" | "copy"
}
```

## 8. Prompt 模板设计

首批内置 prompt 只做 3 个：

1. 总结：总结当前 block。
2. 润色：在保留原意的前提下改写得更清楚。
3. 行动项：从当前 block 中提取待办事项，并在 Orca 中创建 To do。

Prompt 数据结构：

```ts
export type PromptTemplate = {
  id: string
  name: string
  description?: string
  instruction: string
  temperature?: number
  providerId?: string
  model?: string
  outputMode?: "replace" | "insert" | "ask"
  resultKind?: "text" | "tasks"
}
```

默认 prompt 配置：

```ts
export const defaultPrompts: PromptTemplate[] = [
  {
    id: "summarize",
    name: "总结",
    instruction: "请总结以下 block 的核心内容，保留关键信息，输出简洁中文。",
    resultKind: "text",
  },
  {
    id: "polish",
    name: "润色",
    instruction: "请润色以下 block，使表达更清晰、自然、准确。不要添加原文没有的信息。",
    resultKind: "text",
  },
  {
    id: "action-items",
    name: "行动项",
    instruction: "请从以下 block 中提取可执行行动项。只输出行动项列表，每一项是一条明确待办。",
    resultKind: "tasks",
    outputMode: "insert",
  },
]
```

请求拼装建议：

```text
system: 用户设置中的 systemPrompt
user:
  <模板 instruction>

  以下是当前 block 内容：
  <block text>
```

如果用户在面板输入临时 prompt，则将临时 prompt 作为 instruction，并继续附加当前 block 内容。

### 自定义 Prompt 放置建议

建议把自定义 prompt 放在插件自己的 AI 面板里管理，并通过 Orca 插件 settings/data 持久化，而不是模仿 Logseq 使用笔记中的 `prompt-template::` block。

理由：

1. Orca 已提供 `orca.plugins.setSettings` 和 `orca.plugins.setData/getData`，适合保存结构化插件配置。
2. 本插件的 prompt 不只是文本，还要绑定 provider、model、temperature、output mode；这些是执行配置，不适合散落在笔记正文里。
3. 笔记 block 更适合承载用户知识内容；把 prompt 配置藏在普通笔记块里，后续同步、误删、搜索污染和权限边界都会更复杂。
4. 插件面板内管理可以直接做校验，例如 prompt 名称不能为空、provider 必须存在、模型必须属于该 provider 的拉取结果。
5. 未来如果用户希望“用笔记维护 prompt 库”，可以作为高级功能再加：从指定 tag/alias 的 blocks 导入 prompt，但不作为首版默认路径。

落地方案：

- AI 面板增加 `Prompts` 设置视图，并让它成为自定义 prompt 的主要管理入口。
- 用户可新增、编辑、删除、启用/停用、搜索自定义 prompt。
- 每个自定义 prompt 可编辑名称、描述、instruction、provider、model、temperature、output mode。
- Prompt 列表需要清楚区分内置 prompt 与自定义 prompt；内置 prompt 不允许删除，只允许配置 override。
- 删除自定义 prompt 前需要确认，避免误删。
- 自定义 prompt 的管理操作应尽量在 AI 面板内完成，不要求用户去普通设置页编辑 JSON 或复杂数组。
- 自定义 prompt 存入 `customPrompts`，或在复杂 UI 下用 `orca.plugins.setData(pluginName, "customPrompts", jsonString)` 保存。
- Prompt 执行时按优先级合并配置：prompt 自身配置 > prompt override > 全局默认设置。

## 9. OpenAI-compatible API 设计

只支持 OpenAI-compatible API。用户可以配置多个 provider，每个 provider 有自己的 API Key、API URL、模型列表和默认模型。

模型拉取：

- 请求：`GET ${provider.apiBaseUrl}/models`
- Header：`Authorization: Bearer ${apiKey}`
- 期望响应：`{ object: "list", data: [{ id: string, ... }] }`
- UI：在插件 AI 面板的“模型设置”视图中显示 provider 列表；点击 `Fetch models` 后保存 `data[].id` 到该 provider。

文本生成：

- 请求：`POST ${provider.apiBaseUrl}/chat/completions`
- Header：`Authorization: Bearer ${apiKey}`、`Content-Type: application/json`
- Body：

```json
{
  "model": "用户选择的模型",
  "messages": [
    { "role": "system", "content": "全局系统提示" },
    { "role": "user", "content": "模板 prompt + 当前 block 内容" }
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "stream": true
}
```

实现原则：

- 首版聚焦 OpenAI-compatible chat completions。
- Provider/model 选择优先级：prompt 指定 provider/model > prompt override > 全局默认 provider/model。
- Temperature 选择优先级：prompt 指定 temperature > prompt override > 全局默认 temperature。
- 不做静默 fallback，不自动改模型，不吞错误。
- 流式解析失败时直接显示原始错误摘要，并在 console 保留详细错误。
- `AbortController` 支持用户取消生成。
- 如果 provider 不支持 streaming，首版显示明确错误；是否降级非流式请求需用户后续确认。

兼容性备注：

- OpenAI 官方 Models API 返回可用模型列表和 `data[].id`。
- OpenAI 官方 Chat Completions API 接收 messages 并返回模型响应。
- 部分第三方兼容服务可能不完全支持 stream 或 `/models`，这类失败应向用户显式展示，而不是假装成功。

Provider 设置 UI：

- `Providers` 列表：名称、API URL、API Key、默认模型、模型数量。
- `Fetch models`：对当前 provider 调用 `/models`。
- `Set default`：设置全局默认 provider/model。
- `Prompt routing`：为每个 prompt 选择 provider/model/temperature/output mode。
- API Key 输入框不在普通结果面板中展示明文；编辑时用户主动进入设置视图。

## 10. Orca 上下文与写回策略

当前 block 获取：

1. `const selection = window.getSelection()`。
2. `const cursor = orca.utils.getCursorDataFromSelection(selection)`。
3. `cursor?.anchor.blockId` 作为当前 block。
4. 从 `orca.state.blocks[blockId]` 读取 `block.text` 或 `block.content`。
5. 如果 block 不在 state 中，则调用 `orca.invokeBackend("get-block", blockId)`。

上下文模式：

- 默认只处理当前 block 的完整文本。
- 不处理局部选中文本；即使用户选中了 block 中的一小段，也仍处理整个 block。
- 首版不处理子 block、多 block 选择或页面全文。

写回动作：

- Replace：用 `core.editor.setBlocksContent` 直接替换当前 block 文本。
- Insert：用 `core.editor.insertBlock` 或 `core.editor.batchInsertText` 将结果插入当前 block 下面，作为当前 block 的子 block。
- Copy：写入剪贴板。
- Regenerate：复用上一次 prompt 和上下文重新请求。

写回规则：

- 普通文本结果：如果输出是多行，优先使用 `batchInsertText(currentBlock, "lastChild", result)`，让每一行成为当前 block 的子 block。
- 替换结果：将整个输出作为当前 block 的新 content，首版使用单一文本 fragment：`[{ t: "t", v: result }]`。
- 行动项结果：把模型输出解析为行动项列表；每条行动项按模型输出顺序插入为当前 block 的子 block，并且这些行动项彼此是同级 block，然后调用 `core.editor.makeTask` 将其转换为 To do。
- 不自动添加前缀、标签、blockquote 或引用来源。

行动项 To do 创建流程：

1. 执行 `action-items` prompt，要求模型只返回行动项列表。
2. 将输出解析为数组，去掉编号、checkbox 前缀和空行。
3. 对每个行动项按顺序调用 `core.editor.insertBlock`，位置为当前 block 的 `lastChild`，确保生成的 To do 都是当前 block 的直接子级且彼此同级。
4. 对新建 block 调用 `core.editor.makeTask`。
5. 如果 Orca 的 `makeTask` 对指定 block id 行为不稳定，则插入时使用 task repr 的可行性需要实测；不能确认时不要伪造成功。

最近历史：

- 每次生成完成后写入历史。
- 只保留最近 10 条。
- 历史用 `orca.plugins.getData/setData(pluginName, "history", jsonString)` 存储。
- 历史项记录 prompt、provider、model、输入预览、完整输出、生成时间、写回动作。
- 历史不保存完整输入文本，只保存输入预览和完整输出。

## 11. UI 设计

交互面板建议包含：

- 顶部输入框：搜索 prompt 或输入临时 prompt。
- Prompt 列表：内置 prompt 和用户自定义 prompt。
- 模型选择：显示当前 provider/model；prompt 有专属模型时显示覆盖状态。
- 结果区域：流式显示输出。
- 操作栏：Cancel、Regenerate、Copy、Insert as Child、Replace Block。
- 设置入口：打开插件内设置视图，管理 Providers、Models、Prompts、History。
- History 入口：查看最近 10 条生成记录。
- 错误态：API Key 缺失、无当前 block、请求失败、模型拉取失败。

UI 实现：

- 用 React 18。
- 面板通过 `document.body` 挂载独立 root，避免侵入 Orca editor DOM。
- CSS 独立在 `src/styles/ai-panel.css`，类名加插件前缀。
- `unload()` 时 unmount root、移除事件监听、注销命令和菜单。

设置视图建议分区：

- `Providers`：新增/编辑 provider、API Key、API URL、Fetch models、默认模型。
- `Prompt Routing`：为总结、润色、行动项以及自定义 prompt 配置 provider/model/temperature/output mode。
- `Custom Prompts`：新增、编辑、删除、启用/停用、搜索自定义 prompt，并配置 provider/model/temperature/output mode。
- `History`：显示最近 10 条历史，可复制输出或重新运行。

## 12. 开发计划

1. 梳理 Orca API 可用性：验证当前 block 获取、插入、替换、快捷键绑定。
2. 建立模块结构：拆分 settings、commands、services、prompts、history、ui、types。
3. 完成设置和命令注册：`setSettingsSchema`、`registerCommand`、`shortcuts.assign`、block menu、slash command。
4. 完成 provider 管理：增删改 provider、Fetch models、默认 provider/model、prompt routing。
5. 完成 AI 面板 UI：prompt 搜索、临时 prompt、结果预览、操作按钮、插件内设置视图、历史视图。
6. 完成 OpenAI-compatible client：model fetch、chat completions stream、取消生成、错误展示。
7. 完成 Orca 写回：replace、insert as child、copy、regenerate、行动项 To do 创建。
8. 完成最近 10 条历史存储。
9. 验证构建和基础行为：`npm run build`，再由用户在 Orca 中安装插件做交互验证。

## 13. 依赖与构建策略

不需要在写代码之前“先 build 好插件”。合理顺序是：

1. 实现前先安装依赖，例如 `npm install`。当前仓库没有可用的 `vite`，说明 `node_modules` 不完整。
2. 安装依赖后跑一次基线 `npm run build`，确认模板在改代码前能通过；这一步是为了分辨“原项目问题”和“新代码问题”。
3. 写代码。
4. 写完每个较大阶段后运行 `npm run build` 或 TypeScript 检查。
5. 完成后再跑最终 `npm run build`。

因此，下一步真正开始实现时，应先执行 `npm install`，再跑一次基线 build。如果基线失败，先修复依赖或模板配置；如果基线通过，再开始写插件代码。

## 14. 验证计划

代码级验证：

- `npm run build`
- TypeScript 编译通过。
- 检查 `dist/index.js` 生成。
- 检查单文件大小，避免入口或组件膨胀。

手动验证：

1. 未配置 API Key 时，快捷键打开面板并显示明确错误。
2. 配置 provider API URL 和 API Key 后，点击 `Fetch models` 能显示模型列表。
3. 光标在普通 block 内，`Command+G` 能打开面板。
4. 选择“总结当前 block”，结果流式显示。
5. `Insert as Child` 能将结果插入为当前 block 的子 block。
6. `Replace Block` 能替换当前 block。
7. `Regenerate` 能复用上一轮输入。
8. `Cancel` 能中断流式请求。
9. 行动项 prompt 能按模型输出顺序，把结果创建为当前 block 下面的同级 Orca To do。
10. Prompt routing 能为不同 prompt 使用不同 provider/model/temperature。
11. 最近历史只保留 10 条。
12. 最近历史只保存输入预览和完整输出，不保存完整输入文本。
13. 自定义 prompt 可以在 AI 面板内新增、编辑、删除、启用/停用和搜索。
14. 插件禁用后，快捷键、菜单、DOM root 都被清理。

注意：根据当前全局规则，验证阶段不主动启动持久 dev server；如需 Orca 内最终交互验证，应提示用户在本机 Orca 中安装/启用插件。

## 15. 风险与待验证点

1. Orca 插件设置页对 `arrayItemSchema` 的交互体验未知。
2. 首版不做多 block 选择；后续如果扩展，再实测 Orca 是否有稳定的多 block 选择 API。
3. `ContentFragment[]` 与纯文本转换需要谨慎，首版可先输出为单一 `{ t: "t", v: text }`。
4. 快捷键冲突处理需要实测 `orca.shortcuts.assign` 的行为。
5. 第三方 OpenAI-compatible API 对 `/models` 和 streaming 的支持参差不齐，需要错误态明确。
6. 面板挂载层级、z-index、焦点恢复要在 Orca 中实测。
7. `core.editor.makeTask` 对“刚插入且指定 id 的 block”的行为需要实测；若不能稳定指定 id，需要寻找 task repr 或替代命令。
8. Orca 原生设置 schema 是否能表达“标签页式 AI 模型设置”未知，首版建议用插件内设置视图承载复杂配置。

## 16. 已确认需求

1. 默认使用 `Command+G` 打开 AI 面板；Orca 设置中显示为 `meta+g`，并允许用户在 Orca 快捷键中自定义。
2. 首版只处理当前 block。
3. 不处理局部选中文本，始终处理整个 block。
4. 生成后提供 Replace Block 和 Insert as Child 两个选择。
5. 首批内置 prompt：总结、润色、行动项。
6. 行动项 prompt 需要按模型输出顺序创建当前 block 子级下的同级 Orca To do。
7. 每个 prompt 可单独配置 temperature、输出模式、model；未配置则使用全局默认。
8. 只做 OpenAI-compatible API。
9. 支持多个 provider，每个 provider 可配置 API Key、API URL、拉取模型。
10. Provider 的 API Key 可以直接保存在插件 settings/data 中。
11. 保留最近 10 条历史，只保存输入预览和完整输出。
12. 自定义 prompt 放在插件自己的 AI 面板里管理，并用 Orca plugin settings/data 持久化。
13. 自定义 prompt 需要便于新增、编辑、删除、启用/停用、搜索和配置模型参数。
14. 暂不自动添加输出前缀、标签或引用来源。

## 17. 实现期实测点

当前需求已足够开始实现。实现时还需要通过 Orca 运行环境确认这些技术细节：

1. `orca.shortcuts.assign("meta+g", commandId)` 是否在 macOS 上稳定显示和触发为 `Command+G`。
2. `core.editor.insertBlock` 连续插入多个 `lastChild` 时，是否能稳定保持行动项顺序。
3. `core.editor.makeTask` 是否能对刚插入且指定 id 的 block 稳定生效。
4. Orca 原生设置 schema 对 `array` 和 `arrayItemSchema` 的编辑体验是否足够；如果不够，复杂配置全部放到插件内设置视图。

## 18. 建议首版结论

首版建议做一个高质量的文本处理闭环：当前 block 上下文、`Command+G` / `meta+g` 快捷面板、3 个内置 prompt、多 OpenAI-compatible provider、模型拉取、per-prompt model/temperature/output mode、流式预览、Replace/Insert as Child、行动项同级 To do、AI 面板内自定义 prompt 管理、最近 10 条历史。这样既保留 Logseq 插件最有价值的快捷体验，也更贴合 Orca 的 block、task、plugin data 和 command 系统。
