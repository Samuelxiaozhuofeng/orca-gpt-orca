import type { Block, ContentFragment, CursorData, DbId } from "../orca";
import type { AiBlockContext } from "../types/ai";

export async function resolveBlockContext(
  blockId?: DbId,
): Promise<AiBlockContext> {
  const cursor = getCurrentCursor();
  const selection = window.getSelection();

  // Try to detect multi-block selection
  const selectedBlocks = await getSelectedBlocks(selection, cursor);

  if (selectedBlocks.length > 1) {
    const combinedText = selectedBlocks.map(b => getBlockText(b)).join("\n\n").trim();
    if (!combinedText) {
      throw new Error("选中的 blocks 没有可处理的文本。");
    }
    return {
      blockId: selectedBlocks[selectedBlocks.length - 1].id,
      block: selectedBlocks[selectedBlocks.length - 1],
      blockText: combinedText,
      cursor,
      selectedBlockIds: selectedBlocks.map(b => b.id),
      blockCount: selectedBlocks.length,
    };
  }

  // Single block logic
  const targetBlockId = blockId ?? cursor?.anchor.blockId;

  if (targetBlockId == null) {
    throw new Error("当前光标不在 Orca block 中。");
  }

  const block = await getBlock(targetBlockId);
  const blockText = getBlockText(block).trim();

  if (!blockText) {
    throw new Error("当前 block 没有可处理的文本。");
  }

  return {
    blockId: targetBlockId,
    block,
    blockText,
    cursor,
    selectedBlockIds: [targetBlockId],
    blockCount: 1,
  };
}

function getCurrentCursor(): CursorData | null {
  return orca.utils.getCursorDataFromSelection(window.getSelection());
}

async function getSelectedBlocks(selection: Selection | null, cursor: CursorData | null): Promise<Array<Block & { id: DbId }>> {
  if (!selection || selection.isCollapsed || !cursor) {
    return [];
  }

  // Attempt to extract multiple block IDs from selection
  // This is a heuristic approach - we look for data-block-id attributes in the range
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;

  if (!parent) return [];

  const blockElements = Array.from(parent.querySelectorAll('[data-block-id]'));
  const blockIds: DbId[] = [];

  for (const elem of blockElements) {
    const blockIdStr = elem.getAttribute('data-block-id');
    if (blockIdStr && range.intersectsNode(elem)) {
      const blockId = parseInt(blockIdStr, 10);
      if (!isNaN(blockId)) {
        blockIds.push(blockId);
      }
    }
  }

  if (blockIds.length <= 1) return [];

  // Load all selected blocks
  const blocks: Array<Block & { id: DbId }> = [];
  for (const blockId of blockIds) {
    try {
      const block = await getBlock(blockId);
      blocks.push({ ...block, id: blockId });
    } catch {
      // Skip blocks that can't be loaded
    }
  }

  return blocks;
}

async function getBlock(blockId: DbId): Promise<Block> {
  const loadedBlock = orca.state.blocks[blockId];
  if (loadedBlock) return loadedBlock;

  const block = (await orca.invokeBackend("get-block", blockId)) as Block | null;
  if (!block) {
    throw new Error(`Block ${blockId} could not be loaded.`);
  }

  return block;
}

function getBlockText(block: Block): string {
  if (typeof block.text === "string") return block.text;
  return contentToText(block.content ?? []);
}

function contentToText(content: ContentFragment[]): string {
  return content
    .map((fragment) => fragmentValueToText(fragment.v))
    .join("");
}

function fragmentValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(fragmentValueToText).join("");
  if (value != null && typeof value === "object" && "v" in value) {
    return fragmentValueToText((value as { v: unknown }).v);
  }
  return "";
}
