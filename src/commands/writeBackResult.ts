import type { Block, ContentFragment, DbId } from "../orca";
import type { AiBlockContext } from "../types/ai";

export async function replaceBlockResult(
  context: AiBlockContext,
  result: string,
): Promise<void> {
  const content = textToContent(result);
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    context.cursor,
    [{ id: context.blockId, content }],
    false,
  );
}

export async function insertResultAsChild(
  context: AiBlockContext,
  result: string,
): Promise<void> {
  const text = result.trim();
  if (!text) throw new Error("没有可插入的 AI 结果。");

  if (text.includes("\n")) {
    await orca.commands.invokeEditorCommand(
      "core.editor.batchInsertText",
      context.cursor,
      context.block,
      "lastChild",
      text,
      false,
      false,
    );
    return;
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    context.cursor,
    context.block,
    "lastChild",
    textToContent(text),
  );
}

export async function insertActionTasks(
  context: AiBlockContext,
  result: string,
): Promise<void> {
  const tasks = parseActionItems(result);
  if (tasks.length === 0) {
    throw new Error("模型输出中没有可创建的行动项。");
  }

  for (const task of tasks) {
    const newBlockId = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      context.cursor,
      context.block,
      "lastChild",
      textToContent(task),
    )) as DbId;

    await orca.commands.invokeEditorCommand(
      "core.editor.makeTask",
      null,
      newBlockId,
    );
  }
}

export async function copyResult(result: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable in this environment.");
  }

  await navigator.clipboard.writeText(result);
}

export function parseActionItems(result: string): string[] {
  return result
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
}

function textToContent(text: string): ContentFragment[] {
  return [{ t: "t", v: text }];
}

export function updateContextBlockText(
  context: AiBlockContext,
  text: string,
): AiBlockContext {
  const block: Block = {
    ...context.block,
    text,
    content: textToContent(text),
  };

  return {
    ...context,
    block,
    blockText: text,
  };
}
