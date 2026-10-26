/**
 * 原子文件锁 — 保证多个 Worker 不会抢到同一个任务
 *
 * openSync(..., "wx") 的 "x" 标志：文件已存在就抛错（原子创建）。
 */
import { mkdirSync, openSync, rmSync } from "fs";
import { join } from "path";

export function tryLock(locksDir: string, taskId: string | number): boolean {
  mkdirSync(locksDir, { recursive: true });
  try {
    openSync(join(locksDir, `${taskId}.lock`), "wx");
    return true;
  } catch {
    return false;
  }
}

export function unlock(locksDir: string, taskId: string | number): void {
  try {
    rmSync(join(locksDir, `${taskId}.lock`));
  } catch {}
}
