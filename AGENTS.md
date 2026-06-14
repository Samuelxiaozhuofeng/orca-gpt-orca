# Codex.md

This file provides guidance to Codex when working with code in this repository.

## Project Overview

An Orca Note plugin providing AI quick actions for blocks via OpenAI-compatible APIs. Users press `Command+G` on any block to open a minimalist command panel with instant search, keyboard navigation, and streaming AI results.

## Design Philosophy

**极简、专注、零分心** (Minimal, Focused, Zero Distraction)

- One input, one focus: no sidebars, no tabs during execution
- Keyboard-first: arrow keys, Enter, ESC - no mouse required
- Instant feedback: real-time template filtering, streaming results
- No cognitive load: users never need to think "what's next?" - the interface guides them

## User Interaction Flow

1. Press `Cmd+G` → Panel slides in, input focused
2. Type "summa" or custom prompt → Templates filter in real-time
3. `↑↓` to select, `Enter` to execute → Smooth transition to generating phase
4. Loading animation + streaming preview → Result appears
5. `Enter` to insert, `Cmd+Enter` to replace → Panel closes, done

From idea to execution: 3 keystrokes. No mouse, no menus, no decisions.

## Build & Development

```bash
# Install dependencies
npm install

# Development mode (Vite dev server)
npm run dev

# Production build
npm run build

# Build outputs to dist/index.js
```

**Installation**: After building, copy the entire directory to `~/Documents/orca/plugins/orca-gpt-orca` and enable in Orca settings.

## Architecture

### Entry Point & Lifecycle
- **src/main.ts**: Exports `load(pluginName)` and `unload()`. This is the plugin lifecycle contract with Orca.
- On load: registers settings schema, mounts UI components, registers commands, assigns shortcuts
- On unload: cleans up all registrations and unmounts UI

### Build Configuration
- **Vite library mode**: Outputs ES module to `dist/index.js`
- **External globals**: `react` and `valtio` are peer dependencies mapped to global `React` and `Valtio` objects provided by Orca
- **React classic runtime**: Uses `React.createElement` (not JSX transform) for compatibility with Orca's environment

### Core Modules

**Commands** (`src/commands/`):
- `registerCommands.ts`: Registers keyboard shortcut (default `meta+g`), slash command `/AI`, block menu command, and settings command
- `resolveBlockContext.ts`: Gets current/multiple block content from cursor/selection. Supports multi-block selection via DOM traversal of `data-block-id` attributes
- `writeBackResult.ts`: Implements Replace Block, Insert as Child, and Create To-dos actions using `core.editor.*` commands

**Services** (`src/services/`):
- `openaiClient.ts`: Fetch wrapper for OpenAI-compatible `/chat/completions` endpoint with streaming support
- `modelService.ts`: Fetches available models from `${apiBaseUrl}/models`
- `streamParser.ts`: Parses SSE `data: [DONE]` format from streaming responses
- `aiRunner.ts`: Orchestrates AI requests with provider/model resolution and system prompt injection

**UI** (`src/ui/`):

**Command Panel (Primary UX):**
- `CommandPanel.tsx`: Minimalist modal with three-phase state machine (input → generating → result)
- `useCommandPanelState.ts`: State management for command panel - real-time filtering, keyboard nav, execution flow
- `mountCommandPanel.tsx`: React root mounting for command panel
- `command-panel.css`: Focused, minimal styles - dark backdrop, centered panel, single-focus design

**Settings Panel (Advanced Configuration):**
- `AiPanel.tsx`: Legacy full-featured modal with tabs for Run, Settings, History (still used for settings page)
- `SettingsView.tsx`: Provider management (API keys, base URLs, model lists)
- `SettingsPage.tsx`: Standalone settings page with navigation
- `PromptRouting.tsx`: Maps prompts to specific provider/model overrides
- `CustomPrompts.tsx`: User-defined prompt templates
- `ai-panel.css`: Settings UI styles - two-column layout, gradient nav, card-based content

**Settings** (`src/settings/`):
- `schema.ts`: Plugin settings schema for Orca (only shortcut exposed; main settings in separate page)
- `readSettings.ts`: Reads plugin settings from `orca.state.plugins[pluginName].settings`

**History** (`src/history/`):
- `historyStore.ts`: Persists last 10 prompt/result pairs to localStorage

### Orca API Patterns

**Getting current block**:
```typescript
const cursor = orca.utils.getCursorDataFromSelection(window.getSelection());
const blockId = cursor?.anchor?.blockId;
const block = orca.state.blocks[blockId];
```

**Getting multiple blocks (new)**:
```typescript
// resolveBlockContext now detects multi-block selection
const context = await resolveBlockContext();
// context.blockCount: number of selected blocks
// context.selectedBlockIds: DbId[] array
// context.blockText: combined text with "\n\n" separator
```

**Modifying blocks**:
- `core.editor.setBlocksContent([blockId], [newContent])` - replace block
- `core.editor.insertBlock(parentId, position, {content})` - insert child
- `core.editor.batchInsertText(blockId, position, text)` - append text

**Commands**:
- `orca.commands.registerCommand(id, handler, label)` - register command palette command
- `orca.shortcuts.assign(shortcut, commandId)` - bind keyboard shortcut
- `orca.slashCommands.registerSlashCommand(id, config)` - slash menu entry
- `orca.blockMenuCommands.registerBlockMenuCommand(id, config)` - block context menu

**Notifications**: `orca.notify(level, message)` where level is `"error" | "warn" | "info" | "success"`

## Key Features

- **Multi-block support**: Select multiple blocks, `Cmd+G` processes all. "Replace" inserts at last block
- **Keyboard navigation**: `↑↓` select templates, `Enter` executes, `ESC` cancels, `Cmd+Enter` replaces, `Cmd+R` regenerates
- **Real-time filtering**: Template list updates instantly as user types
- **Streaming results**: Token-by-token preview during generation
- **Smart context hints**: Input shows "1 block" or "3 blocks selected"
- **Whole-block processing**: Processes entire block content (partial text selection not supported in this version)
- **OpenAI-compatible**: Uses `/chat/completions` streaming format with `role: system/user/assistant`
- **Provider-agnostic**: Any OpenAI-compatible endpoint (OpenAI, Anthropic, local models, etc.) can be configured
- **Built-in prompts**: Three default prompts (summarize, polish, action items) are defined in `src/prompts/defaultPrompts.ts`

## Settings Architecture

Plugin uses a two-tier settings approach:
1. **Orca native settings** (`schema.ts`): Only keyboard shortcut, with hint pointing to custom page
2. **Custom settings page** (`SettingsPage.tsx`): Full provider/prompt/history management in a separate modal

This avoids cluttering Orca's native settings UI while providing rich configuration UX.

## Development Notes

- **Translations**: Add entries to `src/translations/zhCN.ts` and use `t("key")` helper from `src/libs/l10n.ts`
- **Styles**: Two CSS files loaded via `loadPanelStyles()`: `command-panel.css` (primary UX) and `ai-panel.css` (settings)
- **Type safety**: `src/orca.d.ts` contains Orca API types (158KB); do not modify unless Orca API changes. Note: `DbId` is `number` type
- **React version**: Uses React 18 classic runtime with `createElement`; JSX in source is transformed by SWC to `React.createElement` calls
- **Multi-block detection**: Heuristic approach using DOM `data-block-id` attributes. May need adjustment if Orca's HTML structure changes
