import type { PromptTemplate } from "../types/ai";

export const defaultPrompts: PromptTemplate[] = [
  {
    id: "summarize",
    name: "总结",
    description: "提炼当前 block 的核心信息。",
    instruction: "请总结以下 block 的核心内容，保留关键信息，输出简洁中文。",
    resultKind: "text",
    outputMode: "ask",
    builtin: true,
  },
  {
    id: "polish",
    name: "润色",
    description: "在保留原意的前提下改写得更清楚。",
    instruction:
      "请润色以下 block，使表达更清晰、自然、准确。不要添加原文没有的信息。",
    resultKind: "text",
    outputMode: "ask",
    builtin: true,
  },
  {
    id: "action-items",
    name: "行动项",
    description: "提取待办，并作为当前 block 的子级 To do。",
    instruction:
      "请从以下 block 中提取可执行行动项。只输出行动项列表，每一项是一条明确待办。",
    resultKind: "tasks",
    outputMode: "insert",
    builtin: true,
  },
];
