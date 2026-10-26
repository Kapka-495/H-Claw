/**
 * SSE 流解析测试 — 全项目最该测的代码
 *
 * 手写 SSE 解析最容易 off-by-one：content 累积、reasoning 累积、
 * tool_calls 的 arguments 跨 chunk 分片按 index 合并、[DONE] 终止。
 */
import { describe, it, expect } from "vitest";
import { collectSSE, createAccumulator, feedLine, finalize } from "../src/llm/stream.js";

/** 把对象转成一行 SSE data */
function sse(payload: any): string {
  return `data: ${JSON.stringify(payload)}\n`;
}

describe("SSE 内容解析", () => {
  it("跨多行累积 content", () => {
    const result = collectSSE([
      sse({ choices: [{ delta: { content: "你好" } }] }),
      sse({ choices: [{ delta: { content: "，世界" } }] }),
      "data: [DONE]\n",
    ]);
    expect(result.choices[0].message.content).toBe("你好，世界");
  });

  it("累积 reasoning_content", () => {
    const result = collectSSE([
      sse({ choices: [{ delta: { reasoning_content: "先思考" } }] }),
      sse({ choices: [{ delta: { content: "答案" } }] }),
    ]);
    expect(result.choices[0].message.reasoning_content).toBe("先思考");
    expect(result.choices[0].message.content).toBe("答案");
  });

  it("捕获 usage", () => {
    const result = collectSSE([
      sse({ choices: [{ delta: { content: "hi" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { total_tokens: 42 } }),
    ]);
    expect(result.usage.total_tokens).toBe(42);
  });
});

describe("tool_calls 分片合并（最易错）", () => {
  it("arguments 跨 3 个 chunk 按 index 拼回完整 JSON", () => {
    const result = collectSSE([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "write", arguments: "" } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'a.txt","content":"hi"}' } }] } }] }),
      "data: [DONE]\n",
    ]);
    const tc = result.choices[0].message.tool_calls![0];
    expect(tc.function.name).toBe("write");
    expect(JSON.parse(tc.function.arguments)).toEqual({ path: "a.txt", content: "hi" });
    expect(result.choices[0].finish_reason).toBe("tool_calls");
  });

  it("两个工具并行时按 index 各自合并，互不串扰", () => {
    const result = collectSSE([
      sse({ choices: [{ delta: { tool_calls: [
        { index: 0, id: "c0", function: { name: "read", arguments: '{"path":"a"}' } },
        { index: 1, id: "c1", function: { name: "write", arguments: '{"path":"b"' } },
      ] } }] }),
      sse({ choices: [{ delta: { tool_calls: [
        { index: 1, function: { arguments: ',"content":"x"}' } },
      ] } }] }),
    ]);
    const tcs = result.choices[0].message.tool_calls!;
    expect(tcs.length).toBe(2);
    expect(tcs[0].function.name).toBe("read");
    expect(JSON.parse(tcs[0].function.arguments)).toEqual({ path: "a" });
    expect(tcs[1].function.name).toBe("write");
    expect(JSON.parse(tcs[1].function.arguments)).toEqual({ path: "b", content: "x" });
  });
});

describe("流式缓冲边界", () => {
  it("一行被切成两个 chunk 也能正确解析", () => {
    const result = collectSSE([
      'data: {"choices":[{"delta":{"content":"hel',
      'lo"}}]}\n',
      "data: [DONE]\n",
    ]);
    expect(result.choices[0].message.content).toBe("hello");
  });

  it("跳过无法解析的坏行", () => {
    const result = collectSSE([
      "data: not-json\n",
      sse({ choices: [{ delta: { content: "ok" } }] }),
    ]);
    expect(result.choices[0].message.content).toBe("ok");
  });

  it("非 data 前缀的行被忽略", () => {
    const result = collectSSE([
      ": keep-alive\n",
      sse({ choices: [{ delta: { content: "ok" } }] }),
    ]);
    expect(result.choices[0].message.content).toBe("ok");
  });
});

describe("feedLine + finalize 直接使用", () => {
  it("手动喂行也能得到结果", () => {
    const acc = createAccumulator();
    feedLine(acc, sse({ choices: [{ delta: { content: "A" } }] }));
    feedLine(acc, sse({ choices: [{ delta: { content: "B" } }] }));
    const result = finalize(acc);
    expect(result.choices[0].message.content).toBe("AB");
  });
});
