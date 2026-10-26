/**
 * LLM 判官 — 用另一个 LLM 来给 Agent 的输出打 PASS/FAIL
 *
 * 用于开放式任务（解释概念、写代码等），这类任务没法用字符串匹配判断对错。
 * parseJudgeVerdict 是纯函数，可单测；judgeCorrectness 走统一适配器层发请求。
 */
import { llmCall } from "../llm/client.js";

/** 从判官回复里解析 PASS/FAIL（要求判官以 PASS 或 FAIL 开头） */
export function parseJudgeVerdict(text: string): { pass: boolean; reason: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(PASS|FAIL)/i);
  const pass = match ? match[1].toUpperCase() === "PASS" : false;
  return { pass, reason: trimmed };
}

export async function judgeCorrectness(
  task: string,
  agentText: string,
  rubric?: string,
): Promise<{ pass: boolean; reason: string }> {
  const user = `请判断下面这个 Agent 是否完成了任务。

任务:
${task}

评判标准:
${rubric || "Agent 是否准确、完整地完成了任务。"}

Agent 的最终输出:
"""
${agentText.slice(0, 3000)}
"""

只回答一个词 PASS 或 FAIL，然后换行写一句简短理由（不要写别的）。`;

  const result = await llmCall([
    { role: "system", content: "你是严格的 Agent 评估判官。只依据给出的信息判断，不臆测，不脑补未展示的内容。" },
    { role: "user", content: user },
  ]);

  const text = result.choices?.[0]?.message?.content || "";
  return parseJudgeVerdict(text);
}
