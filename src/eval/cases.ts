/**
 * 评估用例集
 *
 * 两类正确性判断：
 *  - verify：确定性检查（文件内容对不对），免费、可靠，优先用
 *  - judge ：LLM 判官（开放式任务），花一次 LLM 调用
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { renderPrompt } from "../prompts.js";
import type { EvalCase } from "./types.js";

const SYS = renderPrompt("evalAgent");

export const CASES: EvalCase[] = [
  {
    name: "写文件",
    systemPrompt: SYS,
    task: '在 {tmp}/result.txt 写入文本 "eval-ok"',
    verify: ({ tmpDir }) => {
      try {
        return readFileSync(join(tmpDir, "result.txt"), "utf-8").trim() === "eval-ok";
      } catch {
        return false;
      }
    },
  },
  {
    name: "读文件并复述",
    systemPrompt: SYS,
    setup: ({ tmpDir }) => writeFileSync(join(tmpDir, "secret.txt"), "口令: hzkclaw-7f3a", "utf-8"),
    task: "读取 {tmp}/secret.txt，告诉我文件里写了什么",
    verify: ({ tmpDir, agentText }) => {
      const content = readFileSync(join(tmpDir, "secret.txt"), "utf-8");
      // 只检查关键标记，避免 Agent 措辞不同导致的误判
      return agentText.includes("hzkclaw-7f3a");
    },
  },
  {
    name: "建目录+写文件",
    systemPrompt: SYS,
    task: '在 {tmp}/sub 目录下创建 hello.txt，内容写 "hi"',
    verify: ({ tmpDir }) => {
      try {
        return readFileSync(join(tmpDir, "sub", "hello.txt"), "utf-8").trim() === "hi";
      } catch {
        return false;
      }
    },
  },
  {
    name: "代码改写",
    systemPrompt: SYS,
    setup: ({ tmpDir }) => writeFileSync(join(tmpDir, "code.js"), "const x = 1;\nconsole.log(x);\n", "utf-8"),
    task: '把 {tmp}/code.js 里的 "const x = 1" 改成 "let x = 1"',
    verify: ({ tmpDir }) => {
      try {
        const s = readFileSync(join(tmpDir, "code.js"), "utf-8");
        return s.includes("let x = 1") && !s.includes("const x = 1");
      } catch {
        return false;
      }
    },
  },
  {
    name: "概念解释(判官)",
    systemPrompt: SYS,
    task: "用一句话通俗解释什么是递归",
    judge: "解释准确、通俗易懂、一句话即可。",
  },
  {
    name: "小函数编写(判官)",
    systemPrompt: SYS,
    task: "写一个 JavaScript 函数 isEven(n)，判断 n 是否为偶数。只给代码即可。",
    judge: "函数逻辑正确（偶数返回 true、奇数返回 false）、可运行、简洁。",
  },
];
