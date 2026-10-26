/**
 * Anthropic Messages API 适配器（Claude）
 *
 * 协议差异（相对 OpenAI）：
 *  - 端点 /v1/messages，鉴权用 x-api-key 头 + anthropic-version 头
 *  - 消息 content 是「块数组」而非字符串；system 是顶层字段，不在 messages 里
 *  - 工具调用 = tool_use 块，入参已是 JSON 对象（流式时按 partial_json 拼）
 *
 * 下面 toAnthropicMessages / feedAnthropicEvent / finalizeAnthropic 都是纯函数，
 * 不需要 key 即可单测；只有 chat() 里的 fetch 需要真实 key 联网验证。
 */
import type { LLMAdapter, AdapterChatOptions } from "./adapter.js";
import type { ChatMessage, StreamResult, ToolCall } from "../types.js";

const ANTHROPIC_VERSION = "2023-06-01";

// ---------------------------------------------------------------------------
// 纯函数：内部消息格式 → Anthropic messages
// ---------------------------------------------------------------------------
export function toAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: any[];
} {
  const systemParts: string[] = [];
  const out: any[] = [];

  const pushText = (role: string, text: string): void => {
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content.push({ type: "text", text });
    } else {
      out.push({ role, content: [{ type: "text", text }] });
    }
  };

  for (const m of messages) {
    if (m.role === "system") {
      if (typeof m.content === "string" && m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === "user") {
      pushText("user", typeof m.content === "string" ? m.content : "");
      continue;
    }
    if (m.role === "assistant") {
      const blocks: any[] = [];
      if (typeof m.content === "string" && m.content) blocks.push({ type: "text", text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let input: any = {};
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {
            input = {};
          }
          blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      if (blocks.length > 0) out.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.tool_call_id, content: typeof m.content === "string" ? m.content : "" };
      const last = out[out.length - 1];
      if (last && last.role === "user") {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
  }

  return { system: systemParts.join("\n") || undefined, messages: out };
}

// ---------------------------------------------------------------------------
// 纯函数：OpenAI 工具格式 → Anthropic tools
// ---------------------------------------------------------------------------
export function toAnthropicTools(tools: any[]): any[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

// ---------------------------------------------------------------------------
// 纯函数：Anthropic 流式事件解析
// ---------------------------------------------------------------------------
export interface AnthropicAccumulator {
  text: string;
  toolUses: Map<number, { id: string; name: string; inputJson: string }>;
  usage: Record<string, any>;
}

export function createAnthropicAccumulator(): AnthropicAccumulator {
  return { text: "", toolUses: new Map(), usage: {} };
}

export function feedAnthropicEvent(
  acc: AnthropicAccumulator,
  event: any,
): { text?: string } {
  const out: { text?: string } = {};
  switch (event.type) {
    case "content_block_start": {
      const cb = event.content_block;
      if (cb?.type === "tool_use") {
        acc.toolUses.set(event.index, { id: cb.id, name: cb.name, inputJson: "" });
      }
      break;
    }
    case "content_block_delta": {
      const d = event.delta;
      if (d?.type === "text_delta") {
        acc.text += d.text;
        out.text = d.text;
      } else if (d?.type === "input_json_delta") {
        const tu = acc.toolUses.get(event.index);
        if (tu) tu.inputJson += d.partial_json;
      }
      break;
    }
    case "message_delta": {
      if (event.usage) acc.usage = event.usage;
      break;
    }
  }
  return out;
}

export function finalizeAnthropic(acc: AnthropicAccumulator): StreamResult {
  const toolCalls: ToolCall[] = Array.from(acc.toolUses.values()).map((tu) => {
    let input: any = {};
    try {
      input = JSON.parse(tu.inputJson || "{}");
    } catch {
      input = {};
    }
    return {
      id: tu.id,
      type: "function",
      function: { name: tu.name, arguments: JSON.stringify(input) },
    };
  });

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
export const anthropicAdapter: LLMAdapter = {
  protocol: "anthropic",

  async chat({ backend, messages, tools, onText }: AdapterChatOptions): Promise<StreamResult> {
    const { system, messages: am } = toAnthropicMessages(messages);
    const body: any = {
      model: backend.model,
      max_tokens: 4096,
      messages: am,
      stream: true,
      tools: toAnthropicTools(tools),
    };
    if (system) body.system = system;

    const res = await fetch(`${backend.url}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": backend.key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const acc = createAnthropicAccumulator();
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
          const ev = JSON.parse(data);
          const delta = feedAnthropicEvent(acc, ev);
          if (delta.text && onText) await onText(delta.text);
        } catch {
          // 忽略无法解析的行（例如 ping/event: 行）
        }
      }
    }

    return finalizeAnthropic(acc);
  },
};
