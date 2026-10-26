/**
 * 工具层测试 — read/write/edit/grep/find/ls，全部在临时目录里跑
 *
 * 重点：edit 的唯一性判断（0 次报错 / 1 次成功 / 多次报错）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { executeTool } from "../src/tools/execute.js";

let dir: string;
const ctx = { filesRead: new Set<string>() };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hzkclaw-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("write", () => {
  it("写入并自动创建父目录", async () => {
    const p = join(dir, "a", "b", "c.txt");
    const r = await executeTool("write", { path: p, content: "hello" }, ctx);
    expect(r).toContain("已写入");
    expect(readFileSync(p, "utf-8")).toBe("hello");
  });
});

describe("read", () => {
  it("按 offset/limit 分页", async () => {
    const p = join(dir, "f.txt");
    writeFileSync(p, "1\n2\n3\n4\n5", "utf-8");
    const r = await executeTool("read", { path: p, offset: 2, limit: 2 }, ctx);
    expect(r).toContain("2: 2");
    expect(r).toContain("3: 3");
    expect(r).not.toContain("1: 1");
  });

  it("记录读过的文件（幻觉检测）", async () => {
    const p = join(dir, "f.txt");
    writeFileSync(p, "x", "utf-8");
    await executeTool("read", { path: p }, ctx);
    expect(ctx.filesRead.has(p)).toBe(true);
  });
});

describe("edit 唯一性", () => {
  it("唯一匹配成功替换", async () => {
    const p = join(dir, "f.txt");
    writeFileSync(p, "const x = 1;", "utf-8");
    const r = await executeTool("edit", { path: p, oldText: "const x", newText: "let x" }, ctx);
    expect(r).toContain("已修改");
    expect(readFileSync(p, "utf-8")).toBe("let x = 1;");
  });

  it("0 次匹配报错，且不改动文件", async () => {
    const p = join(dir, "f.txt");
    writeFileSync(p, "hello", "utf-8");
    const r = await executeTool("edit", { path: p, oldText: "不存在", newText: "x" }, ctx);
    expect(r).toContain("找不到");
    expect(readFileSync(p, "utf-8")).toBe("hello");
  });

  it("多次匹配报错（必须唯一）", async () => {
    const p = join(dir, "f.txt");
    writeFileSync(p, "xax xax", "utf-8");
    const r = await executeTool("edit", { path: p, oldText: "xa", newText: "y" }, ctx);
    expect(r).toContain("必须唯一");
  });
});

describe("grep / find / ls", () => {
  it("grep 找到匹配行", async () => {
    writeFileSync(join(dir, "a.txt"), "hello world\nfoo bar", "utf-8");
    const r = await executeTool("grep", { pattern: "hello", path: dir }, ctx);
    expect(r).toContain("a.txt");
    expect(r).toContain("hello world");
  });

  it("find 按文件名找", async () => {
    writeFileSync(join(dir, "report.md"), "x", "utf-8");
    const r = await executeTool("find", { pattern: "report", path: dir }, ctx);
    expect(r).toContain("report.md");
  });

  it("ls 列出目录", async () => {
    writeFileSync(join(dir, "b.txt"), "hi", "utf-8");
    const r = await executeTool("ls", { path: dir }, ctx);
    expect(r).toContain("b.txt");
  });
});

describe("安全拦截", () => {
  it("危险命令被拦截", async () => {
    const r = await executeTool("bash", { command: "rm -rf /" }, ctx);
    expect(r).toContain("SafetyGuard");
  });

  it("敏感路径写被拦截", async () => {
    const r = await executeTool("write", { path: "/etc/hosts", content: "x" }, ctx);
    expect(r).toContain("SafetyGuard");
  });
});
