/**
 * hzkclaw 评估系统 v3 — 五维评估（走 runAgent + 适配器层 + LLM 判官）
 *
 * 用法:
 *   npm run eval           每个用例跑 3 次（默认）
 *   EVAL_RUNS=5 npm run eval  改跑 5 次
 *
 * 相比 v2（旧 eval.mjs）的三点升级：
 *   1. 走 runAgent 主循环 + 协议适配器层，测的是「hzkclaw 这个 Agent 本身」，
 *      任何后端（Kimi/DeepSeek/Claude/Gemini）都能跑
 *   2. 正确性分两档：能确定性检查的用 verify（免费可靠），开放式任务用 LLM 判官
 *   3. 提示词从 src/prompts.ts 按名取，方便对比不同版本提示词的效果
 */
import { CASES } from "./cases.js";
import { runCase, report } from "./runner.js";
import type { CaseResult } from "./types.js";

const STABILITY_RUNS = Math.max(1, parseInt(process.env.EVAL_RUNS || "3", 10));

async function main(): Promise<void> {
  console.log("=".repeat(64));
  console.log("  hzkclaw 五维评估系统 v3");
  console.log(`  用例数: ${CASES.length}  |  每用例跑 ${STABILITY_RUNS} 次`);
  console.log("=".repeat(64));

  const all: Array<{ name: string; runs: CaseResult[] }> = [];

  for (const c of CASES) {
    console.log(`\n  [用例] ${c.name}（跑 ${STABILITY_RUNS} 次）`);
    const runs = await runCase(c, STABILITY_RUNS);
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const reason = r.ok ? "" : ` | ${r.reason.slice(0, 60)}`;
      console.log(`    第${i + 1}次: ${r.ok ? "PASS" : "FAIL"} | ${r.tokens}tok | ${r.durationMs}ms${reason}`);
    }
    all.push({ name: c.name, runs });
  }

  report(all);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
