/**
 * SSE 流解析 — 纯函数，唯一实现，可单测
 *
 * 手写 OpenAI 兼容的 SSE（Server-Sent Events）解析：
 *   data: {json}\n
 * 重点是 tool_calls 的 arguments 会跨多个 chunk 分片，需要按 index 合并。
 */
import type { StreamResult, ToolCall } from "../types.js";

export interface SSEAccumulator {
  content: string;
  reasoning: string;
  toolCalls: Map<number, { id: string; name: string; args: string }>;
  usage: Record<string, any>;
  done: boolean;
}

export interface LineDelta {
  reasoning?: string;
  content?: string;
  done?: boolean;
}

export function createAccumulator(): SSEAccumulator {
  return { content: "", reasoning: "", toolCalls: new Map(), usage: {}, done: false };
}

/** 喂入一行 SSE data，返回这一行带出的增量（供流式回调使用） */
export function feedLine(acc: SSEAccumulator, line: string): LineDelta {
  const out: LineDelta = {};
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return out;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") {
    acc.done = true;
    out.done = true;
    return out;
  }

  try {
    const json = JSON.parse(data);
    const choice = json.choices?.[0];
    if (!choice) return out;
    const delta = choice.delta;
    if (delta) {
      if (delta.reasoning_content) {
        acc.reasoning += delta.reasoning_content;
        out.reasoning = delta.reasoning_content;
      }
      if (delta.content) {
        acc.content += delta.content;
        out.content = delta.content;
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!acc.toolCalls.has(idx)) {
            acc.toolCalls.set(idx, {
              id: tc.id || `call_${idx}`,
              name: tc.function?.name || "",
              args: "",
            });
          }
          if (tc.function?.arguments) acc.toolCalls.get(idx)!.args += tc.function.arguments;
        }
      }
    }
    if (json.usage) acc.usage = json.usage;
    if (choice.finish_reason === "stop") acc.usage = json.usage || acc.usage;
  } catch {
    /* 跳过无法解析的行 */
  }
  return out;
}

export function finalize(acc: SSEAccumulator): StreamResult {
  const tcItems: ToolCall[] = Array.from(acc.toolCalls.values()).map((tc) => ({
    index: 0,
    id: tc.id,
    type: "function",
    function: { name: tc.name, arguments: tc.args },
  }));

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: acc.content || null,
          reasoning_content: acc.reasoning || undefined,
          tool_calls: tcItems.length > 0 ? tcItems : undefined,
        },
        finish_reason: tcItems.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: acc.usage,
  };
}

/** 纯测试辅助：模拟「多个文本块分片到达」的流式过程 */
export function collectSSE(chunks: string[]): StreamResult {
  const acc = createAccumulator();
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) feedLine(acc, line);
  }
  if (buffer) feedLine(acc, buffer);
  return finalize(acc);
}
