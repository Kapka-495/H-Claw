/**
 * 共享类型定义
 */

export interface ToolCall {
  index?: number;
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  timestamp?: number;
  steering?: boolean;
  [key: string]: any;
}

export interface StreamResult {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  usage: Record<string, any>;
}

export type ToolInput = Record<string, any>;
