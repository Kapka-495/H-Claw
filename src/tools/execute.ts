/**
 * 工具执行 — 唯一实现
 *
 * 修掉了原 main.ts 的作用域 bug：filesRead / 敏感路径原来声明在 runAgent 内部，
 * 模块作用域的 executeTool 引用不到（会抛 ReferenceError）。
 * 现在 filesRead 通过 ctx 显式传入，敏感路径由 safety.ts 提供。
 */
import { spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { SHELL, SHELL_FLAG } from "../config.js";
import { isDangerousCommand, isSensitivePath } from "./safety.js";
import type { ToolInput } from "../types.js";

export interface ToolContext {
  filesRead: Set<string>;
}

export async function executeTool(name: string, input: ToolInput, ctx: ToolContext): Promise<string> {
  try {
    if (name === "bash") {
      const cmd: string = input.command || "";
      if (isDangerousCommand(cmd)) return "[SafetyGuard] 危险命令被拦截";
      return new Promise((resolve) => {
        const child = spawn(SHELL, [SHELL_FLAG, cmd], { timeout: 60000 });
        let out = "";
        child.stdout.on("data", (d: any) => (out += d.toString()));
        child.stderr.on("data", (d: any) => (out += d.toString()));
        child.on("close", (code) => resolve(`exit:${code}\n${out.slice(-3000)}`));
        child.on("error", (e: any) => resolve(`Error: ${e.message}`));
      });
    }

    if (name === "read") {
      ctx.filesRead.add(input.path); // 记录真正读过的文件（幻觉检测）
      const content = readFileSync(input.path, "utf-8");
      const lines = content.split("\n");
      const start = (input.offset || 1) - 1;
      const end = input.limit ? start + input.limit : lines.length;
      return lines.slice(start, end).map((l: string, i: number) => `${start + i + 1}: ${l}`).join("\n");
    }

    if (name === "write") {
      if (isSensitivePath(input.path)) return "[SafetyGuard] 敏感路径被拦截";
      mkdirSync(dirname(input.path), { recursive: true });
      writeFileSync(input.path, input.content, "utf-8");
      return `已写入 ${input.content.length} 字节到 ${input.path}`;
    }

    if (name === "edit") {
      if (isSensitivePath(input.path)) return "[SafetyGuard] 敏感路径被拦截";
      const content = readFileSync(input.path, "utf-8");
      const count = content.split(input.oldText).length - 1;
      if (count === 0) return "错误: 找不到要替换的文本";
      if (count > 1) return `错误: 文本出现了${count}次，必须唯一`;
      writeFileSync(input.path, content.replace(input.oldText, input.newText), "utf-8");
      return `已修改 ${input.path}`;
    }

    if (name === "grep") {
      const results: string[] = [];
      const searchDir = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (entry.startsWith(".") || entry === "node_modules") continue;
          try {
            const s = statSync(full);
            if (s.isDirectory()) searchDir(full);
            else if (s.isFile()) {
              const fileContent = readFileSync(full, "utf-8");
              const lines = fileContent.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(input.pattern)) {
                  results.push(`${full}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                }
              }
            }
          } catch {
            /* skip unreadable files */
          }
        }
      };
      searchDir(input.path || ".");
      return results.slice(0, 50).join("\n") || "未找到匹配结果";
    }

    if (name === "find") {
      const results: string[] = [];
      const searchFiles = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (entry.startsWith(".") || entry === "node_modules") continue;
          try {
            const s = statSync(full);
            if (s.isDirectory()) searchFiles(full);
            else if (entry.includes(input.pattern || "")) results.push(full);
          } catch {
            /* skip */
          }
        }
      };
      searchFiles(input.path || ".");
      return results.slice(0, 50).join("\n") || "未找到文件";
    }

    if (name === "ls") {
      const dir = input.path || ".";
      const entries = readdirSync(dir);
      return entries
        .map((e: string) => {
          const s = statSync(join(dir, e));
          return `${s.isDirectory() ? "d" : "-"} ${e} (${s.size} bytes)`;
        })
        .join("\n") || "空目录";
    }

    return "未知工具";
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}
