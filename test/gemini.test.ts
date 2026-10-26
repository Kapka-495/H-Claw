import { describe, it, expect } from "vitest";
import {
  toGeminiContents,
  toGeminiTools,
  createGeminiAccumulator,
  feedGeminiChunk,
  finalizeGemini,
} from "../src/llm/gemini.js";

describe("toGeminiContents", () => {
  it("system 提到 systemInstruction，不进 contents", () => {
    const { contents, systemInstruction } = toGeminiContents([
      { role: "system", content: "你是助手" },
      { role: "user", content: "你好" },
    ]);
    expect(systemInstruction).toEqual({ parts: [{ text: "你是助手" }] });
    expect(contents).toEqual([{ role: "user", parts: [{ text: "你好" }] }]);
  });

  it("assistant 的 tool_calls 转成 functionCall（args 是对象）", () => {
    const { contents } = toGeminiContents([
      { role: "assistant", content: "", tool_calls: [{ id: "x", function: { name: "read", arguments: '{"path":"a.txt"}' } }] },
    ]);
    expect(contents[0].role).toBe("model");
    expect(contents[0].parts[0]).toEqual({ functionCall: { name: "read", args: { path: "a.txt" } } });
  });

  it("tool 消息转成 functionResponse，用 tool_name 回填函数名", () => {
    const { contents } = toGeminiContents([
      { role: "tool", tool_call_id: "call_0", tool_name: "read", content: "文件内容" },
    ]);
    expect(contents[0]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "read", response: { result: "文件内容" } } }],
    });
  });
});

describe("toGeminiTools", () => {
  it("OpenAI function 格式转成 Gemini functionDeclarations", () => {
    const tools = toGeminiTools([
      { type: "function", function: { name: "read", description: "读文件", parameters: { type: "object" } } },
    ]);
    expect(tools).toEqual([
      { functionDeclarations: [{ name: "read", description: "读文件", parameters: { type: "object" } }] },
    ]);
  });
});

describe("Gemini 流式解析", () => {
  it("累积多个 chunk 的 text 并产出文本", () => {
    const acc = createGeminiAccumulator();
    const d1 = feedGeminiChunk(acc, { candidates: [{ content: { role: "model", parts: [{ text: "你" }] } }] });
    const d2 = feedGeminiChunk(acc, { candidates: [{ content: { role: "model", parts: [{ text: "好" }] } }] });
    expect(d1).toEqual({ text: "你" });
    expect(d2).toEqual({ text: "好" });
    const result = finalizeGemini(acc);
    expect(result.choices[0].message.content).toBe("你好");
  });

  it("functionCall 直接作为完整对象收集，还原成 tool_calls", () => {
    const acc = createGeminiAccumulator();
    feedGeminiChunk(acc, { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "write", args: { path: "a.txt", content: "hi" } } }] } }] });
    const result = finalizeGemini(acc);
    expect(result.choices[0].message.tool_calls).toEqual([
      { id: "call_0", type: "function", function: { name: "write", arguments: '{"path":"a.txt","content":"hi"}' } },
    ]);
  });

  it("captures usageMetadata", () => {
    const acc = createGeminiAccumulator();
    feedGeminiChunk(acc, { candidates: [], usageMetadata: { totalTokenCount: 99 } });
    const result = finalizeGemini(acc);
    expect(result.usage).toEqual({ total_tokens: 99 });
  });
});
