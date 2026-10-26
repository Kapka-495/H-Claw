import { describe, it, expect } from "vitest";
import {
  toAnthropicMessages,
  toAnthropicTools,
  createAnthropicAccumulator,
  feedAnthropicEvent,
  finalizeAnthropic,
} from "../src/llm/anthropic.js";

describe("toAnthropicMessages", () => {
  it("把 system 提到顶层 system 字段，不进 messages", () => {
    const { system, messages } = toAnthropicMessages([
      { role: "system", content: "你是助手" },
      { role: "user", content: "你好" },
    ]);
    expect(system).toBe("你是助手");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "你好" }] });
  });

  it("assistant 的 tool_calls 转成 tool_use 块，入参从字符串还原成对象", () => {
    const { messages } = toAnthropicMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "toolu_1", function: { name: "read", arguments: '{"path":"a.txt"}' } }] },
    ]);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content[0]).toEqual({ type: "tool_use", id: "toolu_1", name: "read", input: { path: "a.txt" } });
  });

  it("tool 消息转成 tool_result，连续多条 tool_result 合并进同一个 user 消息", () => {
    const { messages } = toAnthropicMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "t1", function: { name: "read", arguments: "{}" } }, { id: "t2", function: { name: "ls", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "t1", content: "结果1" },
      { role: "tool", tool_call_id: "t2", content: "结果2" },
    ]);
    // assistant + 一个 user（两条 tool_result 合并）
    expect(messages).toHaveLength(2);
    const userMsg = messages[1];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toHaveLength(2);
    expect(userMsg.content[0]).toEqual({ type: "tool_result", tool_use_id: "t1", content: "结果1" });
    expect(userMsg.content[1]).toEqual({ type: "tool_result", tool_use_id: "t2", content: "结果2" });
  });
});

describe("toAnthropicTools", () => {
  it("OpenAI function 格式转成 Anthropic input_schema 格式", () => {
    const tools = toAnthropicTools([
      { type: "function", function: { name: "read", description: "读文件", parameters: { type: "object" } } },
    ]);
    expect(tools[0]).toEqual({ name: "read", description: "读文件", input_schema: { type: "object" } });
  });
});

describe("Anthropic 流式解析", () => {
  it("累积 text_delta 并产出文本", () => {
    const acc = createAnthropicAccumulator();
    const d1 = feedAnthropicEvent(acc, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你" } });
    const d2 = feedAnthropicEvent(acc, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "好" } });
    expect(d1).toEqual({ text: "你" });
    expect(d2).toEqual({ text: "好" });
    const result = finalizeAnthropic(acc);
    expect(result.choices[0].message.content).toBe("你好");
    expect(result.choices[0].message.tool_calls).toBeUndefined();
  });

  it("按 index 累积 input_json_delta 并还原成 tool_calls", () => {
    const acc = createAnthropicAccumulator();
    feedAnthropicEvent(acc, { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "write", input: {} } });
    feedAnthropicEvent(acc, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } });
    feedAnthropicEvent(acc, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a.txt"}' } });

    const result = finalizeAnthropic(acc);
    expect(result.choices[0].message.tool_calls).toEqual([
      { id: "toolu_1", type: "function", function: { name: "write", arguments: '{"path":"a.txt"}' } },
    ]);
  });

  it("captures usage from message_delta", () => {
    const acc = createAnthropicAccumulator();
    feedAnthropicEvent(acc, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 42 } });
    const result = finalizeAnthropic(acc);
    expect(result.usage).toEqual({ output_tokens: 42 });
  });
});
