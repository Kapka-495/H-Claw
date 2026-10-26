/**
 * JSONL 会话持久化 — 唯一实现
 */
import { mkdirSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { SESSIONS_DIR } from "./config.js";
import type { ChatMessage } from "./types.js";

export interface Session {
  file: string;
  messages: ChatMessage[];
}

export function initSession(prefix = "session"): Session {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(SESSIONS_DIR, `${prefix}-${ts}.jsonl`);
  return { file, messages: [] };
}

export function persistMessage(session: Session, msg: ChatMessage): void {
  session.messages.push(msg);
  try {
    appendFileSync(session.file, JSON.stringify(msg) + "\n");
  } catch (e: any) {
    console.error("[持久化] 写入失败:", e.message);
  }
}

/** 从 JSONL 文件读回会话（用于测试与恢复） */
export function readSession(file: string): ChatMessage[] {
  try {
    const content = readFileSync(file, "utf-8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
