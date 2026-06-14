# Orca GPT Orca

Orca Note 的 AI 快捷处理插件。把光标放在当前 block，按 `Command+G`
打开面板，对当前 block 执行总结、润色、行动项或自定义 prompt。

## 功能

- 当前 block 作为上下文，首版不处理多 block 或局部选中文本
- 内置总结、润色、行动项 3 个 prompt
- OpenAI-compatible provider，可配置 API URL、API Key、模型
- 支持拉取 `/models`
- 流式结果预览
- Replace Block、Insert as Child、Copy、Regenerate
- 行动项输出可创建为当前 block 子级 To do
- 独立 AI 设置页管理 provider、prompt routing、自定义 prompt 和最近 10 条历史

## 使用

- 在 Orca 原生插件设置中启用插件。
- 用 `Command+G` 打开当前 block 的 AI 快捷处理面板。
- 在命令面板运行 `Orca AI: Open settings` 打开独立 AI 设置页。

## 构建

```bash
npm install
npm run build
```

Orca 插件目录至少需要 `dist/index.js` 和图标文件。开发时可把本目录复制到
`~/Documents/orca/plugins/orca-gpt-orca` 后在 Orca 中启用。
