/**
 * 任务池 — 多 Agent 共享的 JSON 文件
 */
import { existsSync, readFileSync, writeFileSync } from "fs";

export type TaskStatus = "pending" | "locked" | "done";

export interface Task {
  id: number;
  desc: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  lockedBy?: string;
  lockedAt?: string;
  completedBy?: string;
  completedAt?: string;
  createdAt?: string;
}

export function readTasks(tasksFile: string): Task[] {
  if (!existsSync(tasksFile)) return [];
  try {
    return (JSON.parse(readFileSync(tasksFile, "utf-8")).tasks || []) as Task[];
  } catch {
    return []; // 损坏文件当作空任务池
  }
}

export function writeTasks(tasksFile: string, tasks: Task[]): void {
  writeFileSync(
    tasksFile,
    JSON.stringify({ tasks, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

export function taskStats(tasks: Task[]): string {
  const pending = tasks.filter((t) => t.status === "pending").length;
  const locked = tasks.filter((t) => t.status === "locked").length;
  const done = tasks.filter((t) => t.status === "done").length;
  return `待处理:${pending} 进行中:${locked} 已完成:${done}`;
}
