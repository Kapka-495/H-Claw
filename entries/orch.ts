/**
 * Agent Team 入口 — 原 orch.mjs 迁移
 *
 * 复用 src/team 的原子锁 + 任务池、src/agent 的 runAgent，删掉了第三份内联工具/LLM 调用。
 *
 * 用法:
 *   tsx entries/orch.ts            Leader（管理任务池）
 *   tsx entries/orch.ts --worker   Worker（自动抢任务）
 */
import { createInterface } from "readline";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { tryLock, unlock } from "../src/team/lock.js";
import { readTasks, writeTasks, taskStats, type Task } from "../src/team/tasks.js";
import { runAgent } from "../src/agent/loop.js";
import { llmCallStream } from "../src/llm/client.js";
import { initSession, type Session } from "../src/persistence.js";
import { renderPrompt } from "../src/prompts.js";

const TASKS_FILE = join(process.cwd(), ".hzkclaw-tasks.json");
const LOCKS_DIR = join(process.cwd(), ".hzkclaw-locks");
const RESULTS_DIR = join(process.cwd(), ".hzkclaw-results");
const MY_ID = process.env.AGENT_ID || `agent-${process.pid}`;
const IS_WORKER = process.argv.includes("--worker");
const HOME = process.env.USERPROFILE || process.env.HOME || "/home";

// ---------------------------------------------------------------------------
// 调 Agent 干活（复用共享 runAgent）
// ---------------------------------------------------------------------------
async function runTask(description: string, session: Session): Promise<string> {
  const systemPrompt = renderPrompt("teamMember", { agentId: MY_ID, desktop: `${HOME}/Desktop` });
  const result = await runAgent(
    `[单人任务] ${description}\n\n完成这个任务。如果任务需要创建文件，请创建。完成后告诉我你做了什么。`,
    { systemPrompt, session, enableGoal: false },
  );
  return result.text || "Agent 完成了任务";
}

// ---------------------------------------------------------------------------
// Worker 循环
// ---------------------------------------------------------------------------
async function workerLoop(): Promise<void> {
  console.log(`\x1b[36m[${MY_ID}]\x1b[0m Worker 启动，等待任务...\n`);
  const session = initSession("worker");

  while (true) {
    const tasks = readTasks(TASKS_FILE);
    const pending = tasks.filter((t) => t.status === "pending");
    const locked = tasks.filter((t) => t.status === "locked").length;

    if (pending.length === 0) {
      if (locked > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
      continue;
    }

    let claimedTask: Task | null = null;
    for (const task of pending) {
      if (tryLock(LOCKS_DIR, task.id)) {
        claimedTask = task;
        task.status = "locked";
        task.lockedBy = MY_ID;
        task.lockedAt = new Date().toISOString();
        writeTasks(TASKS_FILE, tasks);
        break;
      }
    }
    if (!claimedTask) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    console.log(`\x1b[33m[${MY_ID}]\x1b[0m [LOCKED] 领取: ${claimedTask.desc.slice(0, 80)}`);
    console.log(`        ${taskStats(tasks)}`);

    try {
      const result = await runTask(claimedTask.desc, session);
      claimedTask.status = "done";
      claimedTask.result = result.slice(0, 2000);
      claimedTask.completedBy = MY_ID;
      claimedTask.completedAt = new Date().toISOString();
    } catch (e: any) {
      claimedTask.status = "pending";
      claimedTask.error = e.message;
      delete claimedTask.lockedBy;
      delete claimedTask.lockedAt;
      console.log(`\x1b[31m[${MY_ID}]\x1b[0m [FAIL] 失败: ${e.message.slice(0, 100)}`);
    }
    writeTasks(TASKS_FILE, tasks);
    unlock(LOCKS_DIR, claimedTask.id);

    if (claimedTask.status === "done") {
      mkdirSync(RESULTS_DIR, { recursive: true });
      writeFileSync(join(RESULTS_DIR, `${claimedTask.id}.md`), `# ${claimedTask.desc}\n\n${claimedTask.result || ""}`, "utf-8");
      console.log(`\x1b[32m[${MY_ID}]\x1b[0m [OK] 完成: ${claimedTask.desc.slice(0, 60)}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------------------------------------------------------------------------
// Leader 交互式任务管理
// ---------------------------------------------------------------------------
async function leaderLoop(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\x1b[1;36m╔══════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1;36m║\x1b[0m     \x1b[1mhzkclaw Agent Team - Leader\x1b[0m     \x1b[1;36m║\x1b[0m");
  console.log("\x1b[1;36m╚══════════════════════════════════════╝\x1b[0m");
  console.log("  /add 任务描述       — 添加任务");
  console.log("  /delete <id>        — 删除指定任务");
  console.log("  /list               — 查看任务池");
  console.log("  /clear              — 清空已完成任务");
  console.log("  /reset              — 重置所有任务为 pending");
  console.log("  /delete-all         — 删除所有任务");
  console.log("  /batch 描述         — 让 LLM 自动拆成多个任务");
  console.log("  exit                — 退出");
  console.log("  另外开终端窗口: tsx entries/orch.ts --worker\n");

  mkdirSync(RESULTS_DIR, { recursive: true });

  const ask = (): void => {
    rl.question("\x1b[33m❯ \x1b[0m", async (input) => {
      if (!input.trim()) {
        ask();
        return;
      }
      if (input === "exit" || input === "quit") {
        rl.close();
        return;
      }

      try {
        if (input.startsWith("/add ")) {
          const desc = input.slice(5);
          const tasks = readTasks(TASKS_FILE);
          const id = tasks.length + 1;
          tasks.push({ id, desc, status: "pending", createdAt: new Date().toISOString() });
          writeTasks(TASKS_FILE, tasks);
          console.log(`  [OK] 已添加 [#${id}] ${desc.slice(0, 60)}`);
          console.log(`  ${taskStats(tasks)}`);
        } else if (input.startsWith("/delete ")) {
          const idStr = input.slice(8).trim();
          const tasks = readTasks(TASKS_FILE);
          const numId = parseInt(idStr);
          const idx = tasks.findIndex((t) => t.id === numId);
          if (idx === -1) {
            console.log(`  [FAIL] 未找到任务 #${idStr}`);
          } else {
            const removed = tasks.splice(idx, 1)[0];
            try {
              rmSync(join(LOCKS_DIR, `${removed.id}.lock`));
            } catch {}
            writeTasks(TASKS_FILE, tasks);
            console.log(`  [OK] 已删除 [#${removed.id}] ${removed.desc.slice(0, 50)}`);
          }
        } else if (input === "/list") {
          const tasks = readTasks(TASKS_FILE);
          if (tasks.length === 0) {
            console.log("  任务池为空");
          } else {
            console.log(`\n  ${taskStats(tasks)}\n`);
            for (const t of tasks) {
              const icon = t.status === "done" ? "[OK]" : t.status === "locked" ? "[LOCKED]" : "[TODO]";
              const who = t.lockedBy ? ` [${t.lockedBy}]` : "";
              console.log(`  [#${t.id}] ${icon} ${t.desc.slice(0, 65)}${who}`);
            }
            console.log("");
          }
        } else if (input === "/clear") {
          const tasks = readTasks(TASKS_FILE).filter((t) => t.status !== "done");
          writeTasks(TASKS_FILE, tasks);
          console.log(`  [OK] 已清理，剩余 ${tasks.length} 个任务`);
        } else if (input === "/delete-all") {
          writeTasks(TASKS_FILE, []);
          try {
            rmSync(LOCKS_DIR, { recursive: true, force: true });
          } catch {}
          console.log("  [OK] 已删除所有任务");
        } else if (input === "/reset") {
          const tasks = readTasks(TASKS_FILE).map((t): Task => ({ ...t, status: "pending", lockedBy: undefined, lockedAt: undefined, result: undefined, error: undefined }));
          writeTasks(TASKS_FILE, tasks);
          try {
            rmSync(LOCKS_DIR, { recursive: true, force: true });
          } catch {}
          console.log(`  [OK] 已重置 ${tasks.length} 个任务，锁已清理`);
        } else if (input.startsWith("/batch ")) {
          const goal = input.slice(7);
          console.log(`  [THINK]正在拆分: ${goal}`);
          const subtasks = await splitTask(goal);
          const tasks = readTasks(TASKS_FILE);
          for (let i = 0; i < subtasks.length; i++) {
            const id = tasks.length + 1 + i;
            tasks.push({ id, desc: subtasks[i], status: "pending", createdAt: new Date().toISOString() });
          }
          writeTasks(TASKS_FILE, tasks);
          console.log(`  [OK] 已拆分为 ${subtasks.length} 个子任务`);
          const startId = tasks.length - subtasks.length + 1;
          for (let i = 0; i < subtasks.length; i++) console.log(`    [#${startId + i}] ${subtasks[i]}`);
        } else {
          console.log("  未知命令。支持: /add /delete /list /clear /reset /delete-all /batch");
        }
      } catch (e: any) {
        console.error(`  \x1b[31m错误: ${e.message}\x1b[0m`);
      }
      ask();
    });
  };
  ask();
}

// ---------------------------------------------------------------------------
// 任务拆分（/batch）
// ---------------------------------------------------------------------------
async function splitTask(goal: string): Promise<string[]> {
  const result = await llmCallStream([
    { role: "system", content: renderPrompt("taskSplitter") },
    { role: "user", content: renderPrompt("taskSplitUser", { goal }) },
  ]);
  const text = result.choices?.[0]?.message?.content || "";
  return text
    .split("\n")
    .filter((l: string) => l.trim().startsWith("-"))
    .map((l: string) => l.replace(/^-\s*/, "").trim());
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
if (IS_WORKER) {
  workerLoop().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  leaderLoop().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
