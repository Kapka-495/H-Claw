/**
 * LLM 协议适配器接口 — 向 pi-mono 靠拢
 *
 * pi-mono 的 pi-ai 用「统一内部格式 + 每个 Provider 一个适配器」来兼容 30+ 模型。
 * 这里照搬这个思想：Agent 只和这个接口对话，具体协议（OpenAI / Anthropic / Gemini）
 * 由各自适配器负责翻译。
 */
import type { LLMBackend } from "../config.js";
import type { ChatMessage, StreamResult } from "../types.js";

export interface AdapterChatOptions {
  backend: LLMBackend;
  messages: ChatMessage[];
  tools: any[];
  onText?: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
}

export interface LLMAdapter {
  /** 协议名，与 config.ts 里 LLMBackend.protocol 对应 */
  readonly protocol: string;
  chat(opts: AdapterChatOptions): Promise<StreamResult>;
}
