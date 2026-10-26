/**
 * 评估执行器 — 跑一个用例多次，收集正确率/token/耗时，最后出五维报告
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runAgent } from "../agent/loop.js";
import { initSession } from "../persistence.js";
import { DEFAULT_BACKEND } from "../config.js";
import { judgeCorrectness } from "./judge.js";
import type { EvalCase, CaseResult } from "./types.js";

/** 粗略成本估算：各后端每百万 token 综合单价（美元），只用于报告里的数量级参考 */
const PRICE_PER_1M_TOKENS: Record<string, number> = {
  Kimi: 0.9,
  DeepSeek: 0.7,
  Claude: 9,
  Gemini: 0.25,
};

export async function runCase(c: EvalCase, stabilityRuns: number): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (let i = 0; i < stabilityRuns; i++) {
    const tmpDir = mkdtempSync(join(tmpdir(), "hzkclaw-eval-"));
    try {
      if (c.setup) await c.setup({ tmpDir, agentText: "" });
      const session = initSession("eval");
      const task = c.task.replaceAll("{tmp}", tmpDir);

      const start = Date.now();
      const res = await runAgent(task, { systemPrompt: c.systemPrompt, session, enableGoal: false, quiet: true });
      const durationMs = Date.now() - start;
      const ctx = { tmpDir, agentText: res.text };

      let ok = false;
      let reason = "";
      if (c.verify) {
        ok = await c.verify(ctx);
        reason = ok ? "确定性检查通过" : "确定性检查未通过";
      } else if (c.judge) {
        const j = await judgeCorrectness(c.task, res.text, c.judge);
        ok = j.pass;
        reason = j.reason;
      } else {
        throw new Error(`用例 ${c.name} 既没有 verify 也没有 judge`);
      }

      results.push({ name: c.name, ok, tokens: res.tokens, durationMs, reason });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return results;
}

export function report(all: Array<{ name: string; runs: CaseResult[] }>): void {
  console.log("\n" + "=".repeat(64));
  console.log("  五维评估报告");
  console.log("=".repeat(64));

  let totalPass = 0;
  let totalRuns = 0;
  let totalTokens = 0;

  console.log("  用例名称              正确率    平均Token  平均耗时   稳定性");
  console.log("  " + "-".repeat(58));

  for (const { name, runs } of all) {
    const total = runs.length;
    const pass = runs.filter((r) => r.ok).length;
    const avgTok = Math.round(runs.reduce((a, r) => a + r.tokens, 0) / total);
    const avgMs = Math.round(runs.reduce((a, r) => a + r.durationMs, 0) / total);
    const stable = pass === total ? "PASS" : "FAIL";

    const nameCol = name.padEnd(20);
    const okCol = `${pass}/${total}`.padEnd(9);
    const tokCol = String(avgTok).padEnd(10);
    const msCol = String(avgMs + "ms").padEnd(10);

    console.log(`  ${nameCol}${okCol}${tokCol}${msCol}${stable}`);

    totalPass += pass;
    totalRuns += total;
    totalTokens += runs.reduce((a, r) => a + r.tokens, 0);
  }

  console.log("  " + "-".repeat(58));
  const backendName = DEFAULT_BACKEND?.name || "未配置";
  const price = DEFAULT_BACKEND ? (PRICE_PER_1M_TOKENS[DEFAULT_BACKEND.name] ?? 1.0) : 0;
  const estCost = ((totalTokens / 1e6) * price).toFixed(4);
  console.log(`  正确率: ${((totalPass / totalRuns) * 100).toFixed(1)}%  |  累计 token: ${totalTokens}  |  后端: ${backendName}  |  估算成本: $${estCost}`);
  console.log("=".repeat(64));
}
