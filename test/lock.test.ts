/**
 * 原子文件锁测试 — 保证多 Worker 不会抢同一个任务
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { tryLock, unlock } from "../src/team/lock.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hzkclaw-lock-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("原子锁", () => {
  it("首次加锁成功，第二次失败", () => {
    expect(tryLock(dir, 1)).toBe(true);
    expect(tryLock(dir, 1)).toBe(false);
  });

  it("unlock 后可再次加锁", () => {
    expect(tryLock(dir, 1)).toBe(true);
    unlock(dir, 1);
    expect(tryLock(dir, 1)).toBe(true);
  });

  it("20 次并发尝试只有一个赢家", () => {
    const wins = Array.from({ length: 20 }, () => tryLock(dir, 42)).filter(Boolean);
    expect(wins.length).toBe(1);
  });
});
