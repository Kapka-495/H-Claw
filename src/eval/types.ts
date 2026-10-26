/**
 * 评估模块类型
 */

export interface EvalContext {
  /** 本轮专用的临时目录（setup 可往里写，verify 可往里读） */
  tmpDir: string;
  /** Agent 最终输出的文本 */
  agentText: string;
}

export interface EvalCase {
  name: string;
  /** 用哪套提示词（从 src/prompts.ts 渲染） */
  systemPrompt: string;
  /** 给 Agent 的任务，支持 {tmp} 占位符（会被替换成临时目录） */
  task: string;
  /** 测试前准备（建初始文件等） */
  setup?: (ctx: EvalContext) => void | Promise<void>;
  /** 确定性检查：返回 true/false。有它就用它，不花 LLM 判官的钱 */
  verify?: (ctx: EvalContext) => boolean | Promise<boolean>;
  /** LLM 判官 rubric：verify 为空时才用（用于开放式任务） */
  judge?: string;
}

export interface CaseResult {
  name: string;
  ok: boolean;
  tokens: number;
  durationMs: number;
  reason: string;
}
