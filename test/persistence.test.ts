/**
 * JSONL 持久化测试 — 写→读 roundtrip
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { persistMessage, readSession, type Session } from "../src/persistence.js";

let dir: string;
let session: Session;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hzkclaw-persist-"));
  session = { file: join(dir, "s.jsonl"), messages: [] };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("会话持久化", () => {
  it("写→读 roundtrip", () => {
    persistMessage(session, { role: "user", content: "hello", timestamp: Date.now() });
    persistMessage(session, { role: "assistant", content: "hi", timestamp: Date.now() });

    const back = readSession(session.file);
    expect(back.length).toBe(2);
    expect(back[0].role).toBe("user");
    expect(back[0].content).toBe("hello");
    expect(back[1].role).toBe("assistant");
    expect(back[1].content).toBe("hi");
  });

  it("文件不存在返回空数组", () => {
    expect(readSession(join(dir, "ghost.jsonl"))).toEqual([]);
  });

  it("损坏文件返回空数组", () => {
    const f = join(dir, "bad.jsonl");
    writeFileSync(f, "not-json\n{{{", "utf-8");
    expect(readSession(f)).toEqual([]);
  });
});
