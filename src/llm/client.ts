/**
 * LLM 调用编排 — 多后端降级 + 指数退避重试（唯一实现）
 *
 * 这里只管「选后端 → 重试 → 降级」，具体协议交给 src/llm 下的适配器。
 * 新增一个协议 = 加一个适配器文件 + 在 getAdapter 里登记一行，client 不用改。
 */
import { LLM_BACKENDS } from "../config.js";
import { TOOLS } from "../tools/definitions.js";
import { openaiAdapter } from "./openai.js";
import { anthropicAdapter } from "./anthropic.js";
import { geminiAdapter } from "./gemini.js";
import type { LLMAdapter } from "./adapter.js";
import type { Logger } from "../logger.js";
import type { ChatMessage, StreamResult } from "../types.js";

const ADAPTERS: Record<string, LLMAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
};

export function getAdapter(protocol: string): LLMAdapter {
  const adapter = ADAPTERS[protocol];
  if (!adapter) throw new Error(`未知协议: ${protocol}`);
  return adapter;
}

export interface LLMCallOptions {
  onText?: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
  traceId?: string;
  log?: Logger;
}

async function callWithFallback(
  messages: ChatMessage[],
  tools: any[],
  options: LLMCallOptions = {},
): Promise<StreamResult> {
  const { onText, onReasoning, traceId, log } = options;

  for (let bi = 0; bi < LLM_BACKENDS.length; bi++) {
    const backend = LLM_BACKENDS[bi];
    const adapter = getAdapter(backend.protocol);
    let retries = 0;
    const maxRetries = bi === 0 ? 2 : 1; // 主后端重试 2 次，其余重试 1 次

    while (true) {
      try {
        if (bi > 0) {
          console.log(`[Fallback] 切换到 ${backend.name} (${backend.protocol})`);
          if (traceId && log) log.warn(traceId, "llm.fallback", { to: backend.name });
        }

        return await adapter.chat({ backend, messages, tools, onText, onReasoning });
      } catch (e: any) {
        retries++;
        if (retries <= maxRetries) {
          const delay = 2000 * retries;
          console.log(`[${backend.name} 重试] ${retries}/${maxRetries}，等待 ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.log(`[${backend.name} 不可用] ${e.message.slice(0, 100)}`);
        if (traceId && log) log.warn(traceId, "llm.backend.failed", { backend: backend.name, error: e.message.slice(0, 100) });
        break; // 换下一个后端
      }
    }
  }

  const names = LLM_BACKENDS.map((b) => b.name).join(", ") || "未配置";
  throw new Error(`所有LLM后端均不可用 (${names})`);
}

/** 带工具的流式调用（Agent 主循环用） */
export async function llmCallStream(messages: ChatMessage[], options: LLMCallOptions = {}): Promise<StreamResult> {
  return callWithFallback(messages, TOOLS, options);
}

/** 无工具的纯文本调用（评估判官、任务拆分等用） */
export async function llmCall(messages: ChatMessage[], options: LLMCallOptions = {}): Promise<StreamResult> {
  return callWithFallback(messages, [], options);
}
