/**
 * 任务池测试 — 多 Agent 共享状态的读写
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readTasks, writeTasks, taskStats, type Task } from "../src/team/tasks.js";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hzkclaw-tasks-"));
  file = join(dir, "tasks.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("任务池", () => {
  it("写→读 roundtrip", () => {
    const tasks: Task[] = [{ id: 1, desc: "任务A", status: "pending" }];
    writeTasks(file, tasks);
    expect(readTasks(file)).toEqual(tasks);
  });

  it("文件不存在返回空数组", () => {
    expect(readTasks(file)).toEqual([]);
  });

  it("损坏文件返回空数组", () => {
    writeFileSync(file, "not-json{{{{", "utf-8");
    expect(readTasks(file)).toEqual([]);
  });

  it("taskStats 统计各状态数量", () => {
    const tasks: Task[] = [
      { id: 1, desc: "a", status: "pending" },
      { id: 2, desc: "b", status: "locked" },
      { id: 3, desc: "c", status: "done" },
    ];
    expect(taskStats(tasks)).toBe("待处理:1 进行中:1 已完成:1");
  });
});
