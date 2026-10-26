/**
 * OpenAI 兼容协议适配器
 *
 * 覆盖所有走 /chat/completions 的模型：Kimi、DeepSeek、GLM、Qwen、OpenAI、Mistral、Ollama 等。
 * SSE 解析复用 stream.ts 的纯函数。
 */
import { createAccumulator, feedLine, finalize } from "./stream.js";
import type { LLMAdapter, AdapterChatOptions } from "./adapter.js";

export const openaiAdapter: LLMAdapter = {
  protocol: "openai",

  async chat({ backend, messages, tools, onText, onReasoning }) {
    const res = await fetch(`${backend.url}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${backend.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: backend.model,
        max_tokens: 4096,
        messages,
        stream: true,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${err.slice(0, 300)}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const acc = createAccumulator();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const delta = feedLine(acc, line);
        if (delta.reasoning && onReasoning) await onReasoning(delta.reasoning);
        if (delta.content && onText) await onText(delta.content);
      }
    }

    return finalize(acc);
  },
};
