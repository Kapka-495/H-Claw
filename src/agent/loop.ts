/**
 * Agent 双层循环（唯一实现，飞书/终端共用）
 *
 *   外层循环：goal 长任务自动续命
 *   内层循环：LLM ↔ 工具交互
 */
import { estimateTokens, compactContext } from "./context.js";
import { loadSkills } from "./skills.js";
import { renderPrompt } from "../prompts.js";
import { llmCallStream } from "../llm/client.js";
import { executeTool } from "../tools/execute.js";
import { persistMessage } from "../persistence.js";
import type { Session } from "../persistence.js";
import type { Logger } from "../logger.js";
import type { ChatMessage, ToolInput } from "../types.js";

export interface GoalState {
  active: boolean;
}

export interface RunAgentOptions {
  systemPrompt: string;
  session: Session;
  enableGoal?: boolean;
  goalState?: GoalState;
  steeringQueue?: string[];
  onStream?: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
  traceId?: string;
  log?: Logger;
  filesRead?: Set<string>;
  maxToolCalls?: number;
  /** 静默模式：不打印每步工具日志（评估时用，避免刷屏） */
  quiet?: boolean;
}

export interface AgentResult {
  text: string;
  tokens: number;
}

export async function runAgent(userText: string, options: RunAgentOptions): Promise<AgentResult> {
  const {
    systemPrompt,
    session,
    enableGoal = false,
    goalState,
    steeringQueue,
    onStream,
    onReasoning,
    traceId,
    log,
    filesRead = new Set(),
    maxToolCalls = 30,
    quiet = false,
  } = options;

  if (traceId && log) log.info(traceId, "agent.run.start", { textLen: userText.length });
  persistMessage(session, { role: "user", content: userText, timestamp: Date.now() });

  const skillsText = loadSkills();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt + skillsText },
    { role: "user", content: userText },
  ];
  const outputs: string[] = [];
  let totalTokens = 0;

  let toolCallCount = 0;
  let goalDone = false;

  // === 外层循环：只有 goal 模式才多轮 ===
  while (true) {
    let hasMoreTools = true;

    // === 内层循环：LLM ↔ 工具 ===
    while (hasMoreTools) {
      if (estimateTokens(messages) > 80000) {
        messages.splice(0, messages.length, ...compactContext(messages));
      }

      if (steeringQueue && steeringQueue.length > 0) {
        const steerMsgs = steeringQueue.splice(0);
        for (const s of steerMsgs) {
          messages.push({ role: "user", content: s });
          persistMessage(session, { role: "user", content: s, timestamp: Date.now(), steering: true });
        }
      }

      if (traceId && log) log.info(traceId, "llm.call.start", { msgCount: messages.length });
      const data = await llmCallStream(messages, { onText: onStream, onReasoning, traceId, log });

      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("LLM 返回异常");

      totalTokens += data.usage?.total_tokens || 0;
      if (traceId && log) log.info(traceId, "llm.call.end", {
        tokens: data.usage?.total_tokens,
        hasTools: !!(msg.tool_calls?.length),
      });

      // goal_complete 检测
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function?.name === "goal_complete") {
            goalDone = true;
            outputs.push("🎯 目标已完成！");
          }
        }
      }

      if (msg.content?.trim()) outputs.push(msg.content.trim());

      const assistantMsg: ChatMessage = { role: "assistant", content: msg.content || "" };
      if (msg.reasoning_content) assistantMsg.reasoning_content = msg.reasoning_content;
      if (msg.tool_calls) assistantMsg.tool_calls = msg.tool_calls;
      messages.push(assistantMsg);
      persistMessage(session, { role: "assistant", content: msg.content, tool_calls: msg.tool_calls, timestamp: Date.now() });

      const regularTools = (msg.tool_calls || []).filter((tc) => tc.function?.name !== "goal_complete");
      hasMoreTools = regularTools.length > 0;

      for (const tc of regularTools) {
        const fnName = tc.function.name;
        const fnArgs: ToolInput = JSON.parse(tc.function.arguments);
        if (!quiet) console.log(`[工具] ${fnName}: ${JSON.stringify(fnArgs)}`);
        if (traceId && log) log.info(traceId, "tool.execute.start", { tool: fnName });
        const result = await executeTool(fnName, fnArgs, { filesRead });
        if (!quiet) console.log(`[结果] ${result.slice(0, 200)}`);
        if (traceId && log) log.info(traceId, "tool.execute.end", { tool: fnName, resultLen: result.length });
        messages.push({ role: "tool", tool_call_id: tc.id, tool_name: fnName, content: result });
        persistMessage(session, { role: "tool", tool_call_id: tc.id, tool_name: fnName, content: result, timestamp: Date.now() });

        toolCallCount++;
        if (toolCallCount >= maxToolCalls) {
          if (!quiet) console.log(`[护栏] 工具调用次数已达上限 ${maxToolCalls}，终止本轮`);
          hasMoreTools = false;
          break;
        }
      }
    }

    // 内层结束 → 只有 goal 模式才自动续命
    if (!enableGoal || goalDone || !goalState?.active) break;
    if (!quiet) console.log("🎯 Goal 未完成，继续...");
    messages.push({ role: "user", content: renderPrompt("goalContinue") });
  }

  return { text: outputs.join("\n\n"), tokens: totalTokens };
}
