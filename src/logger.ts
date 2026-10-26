/**
 * 结构化日志 — 全链路可观测
 *
 * 每条日志包含: traceId, 时间戳, 级别, 事件类型, 数据
 *
 * 用法:
 *   import { createLogger } from "./logger.js";
 *   const log = createLogger();
 *   const traceId = log.start("req-42");
 *   log.info(traceId, "llm.call", { model: "kimi", tokens: 190 });
 *   log.end(traceId);
 */
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_DIR = join(homedir(), ".hzkclaw", "logs");
let fileCounter = 0;

try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {}

function getTimestamp(): string {
  return new Date().toISOString();
}

export interface Logger {
  start(label?: string): string;
  info(traceId: string, event: string, data?: Record<string, any>): void;
  warn(traceId: string, event: string, data?: Record<string, any>): void;
  error(traceId: string, event: string, data?: Record<string, any>): void;
  end(traceId: string, data?: Record<string, any>): void;
  raw(entry: Record<string, any>): void;
}

export function createLogger(source = "main"): Logger {
  const logFile = join(LOG_DIR, `${getTimestamp().slice(0, 10)}-${source}.jsonl`);

  function write(entry: Record<string, any>): void {
    const line = JSON.stringify(entry);
    const level: string = entry.level || "info";
    const icon = level === "error" ? "ERR" : level === "warn" ? "WRN" : "INF";
    const shortTrace = (entry.traceId || "").slice(-6);
    const dataStr = Object.entries(entry.data || {})
      .map(([k, v]) => (typeof v === "number" ? `${k}=${v}` : `${k}=${String(v).slice(0, 60)}`))
      .join(" ");
    console.log(`[${icon}][${shortTrace}] ${entry.event} ${dataStr}`);
    try {
      appendFileSync(logFile, line + "\n");
    } catch {}
  }

  return {
    start(label = "") {
      const traceId = `tr-${Date.now()}-${++fileCounter}`;
      write({ ts: getTimestamp(), level: "info", traceId, event: "request.start", data: { label } });
      return traceId;
    },
    info(traceId, event, data = {}) {
      write({ ts: getTimestamp(), level: "info", traceId, event, data });
    },
    warn(traceId, event, data = {}) {
      write({ ts: getTimestamp(), level: "warn", traceId, event, data });
    },
    error(traceId, event, data = {}) {
      write({ ts: getTimestamp(), level: "error", traceId, event, data });
    },
    end(traceId, data = {}) {
      write({ ts: getTimestamp(), level: "info", traceId, event: "request.end", data });
    },
    raw(entry) {
      try {
        appendFileSync(logFile, JSON.stringify(entry) + "\n");
      } catch {}
    },
  };
}
