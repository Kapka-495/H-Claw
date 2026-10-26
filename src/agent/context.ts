/**
 * 上下文管理 — token 估算 + 压缩
 */
import type { ChatMessage } from "../types.js";

// 简单估算：中英文混合约 2.5 字符/token
export function estimateTokens(messages: ChatMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 2.5);
}

/**
 * 上下文压缩：保留 system + 最近 keepN 条，其余压成一段摘要。
 * 待压缩条数太少（<5）时原样返回，不折腾。
 */
export function compactContext(messages: ChatMessage[], keepN = 10): ChatMessage[] {
  const systemMsg = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const toCompress = rest.slice(0, -keepN);
  const toKeep = rest.slice(-keepN);
  if (toCompress.length < 5) return messages;

  const compressed = toCompress
    .map((m) => {
      if (m.role === "user") return `用户: ${typeof m.content === "string" ? m.content.slice(0, 200) : "(消息)"}`;
      if (m.role === "tool") return `工具执行结果`;
      if (m.role === "assistant") return `助手回复`;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const summary = `[对话历史摘要，共 ${toCompress.length} 条消息]\n${compressed}`;
  const result: ChatMessage[] = [];
  if (systemMsg) result.push(systemMsg);
  result.push({ role: "user", content: summary });
  result.push(...toKeep);
  return result;
}
