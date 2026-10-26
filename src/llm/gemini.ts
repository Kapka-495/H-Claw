/**
 * Google Gemini 适配器（generateContent 协议）
 *
 * 协议差异（相对 OpenAI）：
 *  - 端点 /v1beta/models/{model}:streamGenerateContent?alt=sse，鉴权 x-goog-api-key 头
 *  - 消息 content 是 parts 数组；system 是顶层 systemInstruction
 *  - 工具调用 = functionCall，入参 args 是完整 JSON 对象（流式不碎片化，一次给全）
 *
 * 纯函数 toGeminiContents / feedGeminiChunk / finalizeGemini 无需 key 即可单测。
 */
import type { LLMAdapter, AdapterChatOptions } from "./adapter.js";
import type { ChatMessage, StreamResult, ToolCall } from "../types.js";

// ---------------------------------------------------------------------------
// 纯函数：内部消息格式 → Gemini contents
// ---------------------------------------------------------------------------
export function toGeminiContents(messages: ChatMessage[]): {
  contents: any[];
  systemInstruction?: any;
} {
  const contents: any[] = [];
  const systemParts: string[] = [];

  const last = () => contents[contents.length - 1];

  for (const m of messages) {
    if (m.role === "system") {
      if (typeof m.content === "string" && m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : "";
      const prev = last();
      if (prev && prev.role === "user") prev.parts.push({ text });
      else contents.push({ role: "user", parts: [{ text }] });
      continue;
    }
    if (m.role === "assistant") {
      const parts: any[] = [];
      if (typeof m.content === "string" && m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let args: any = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "tool") {
      const name = (m as any).tool_name || "";
      const part = { functionResponse: { name, response: { result: typeof m.content === "string" ? m.content : "" } } };
      const prev = last();
      if (prev && prev.role === "user") prev.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
      continue;
    }
  }

  return {
    contents,
    systemInstruction: systemParts.length ? { parts: [{ text: systemParts.join("\n") }] } : undefined,
  };
}

// ---------------------------------------------------------------------------
// 纯函数：OpenAI 工具格式 → Gemini tools
// ---------------------------------------------------------------------------
export function toGeminiTools(tools: any[]): any[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// 纯函数：Gemini 流式 chunk 解析
// ---------------------------------------------------------------------------
export interface GeminiAccumulator {
  text: string;
  functionCalls: Array<{ name: string; args: any }>;
  usage: Record<string, any>;
}

export function createGeminiAccumulator(): GeminiAccumulator {
  return { text: "", functionCalls: [], usage: {} };
}

export function feedGeminiChunk(acc: GeminiAccumulator, json: any): { text?: string } {
  const out: { text?: string } = {};
  const candidates = json.candidates || [];
  for (const c of candidates) {
    const parts = c.content?.parts || [];
    for (const p of parts) {
      if (typeof p.text === "string") {
        acc.text += p.text;
        out.text = p.text;
      }
      if (p.functionCall) acc.functionCalls.push(p.functionCall);
    }
  }
  if (json.usageMetadata) {
    acc.usage = { total_tokens: json.usageMetadata.totalTokenCount };
  }
  return out;
}

export function finalizeGemini(acc: GeminiAccumulator): StreamResult {
  const toolCalls: ToolCall[] = acc.functionCalls.map((fc, i) => ({
    id: `call_${i}`,
    type: "function",
    function: { name: fc.name, arguments: JSON.stringify(fc.args || {}) },
  }));

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: acc.text || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
        finish_reason: toolCalls.length ? "tool_calls" : "stop",
      },
    ],
    usage: acc.usage,
  };
}

// ---------------------------------------------------------------------------
// 适配器：fetch + 流式解析
// ---------------------------------------------------------------------------
export const geminiAdapter: LLMAdapter = {
  protocol: "gemini",

  async chat({ backend, messages, tools, onText }: AdapterChatOptions): Promise<StreamResult> {
    const { contents, systemInstruction } = toGeminiContents(messages);
    const body: any = { contents, tools: toGeminiTools(tools) };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const url = `${backend.url}/v1beta/models/${backend.model}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": backend.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const acc = createGeminiAccumulator();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = feedGeminiChunk(acc, json);
          if (delta.text && onText) await onText(delta.text);
        } catch {
          // 忽略无法解析的行
        }
      }
    }

    return finalizeGemini(acc);
  },
};
