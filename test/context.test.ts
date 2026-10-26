/**
 * 上下文管理测试 — token 估算 + 压缩
 */
import { describe, it, expect } from "vitest";
import { estimateTokens, compactContext } from "../src/agent/context.js";
import type { ChatMessage } from "../src/types.js";

describe("estimateTokens", () => {
  it("确定性且与长度正相关", () => {
    const short = estimateTokens([{ role: "user", content: "短" }]);
    const long = estimateTokens([{ role: "user", content: "这是一段很长的内容".repeat(100) }]);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });
});

describe("compactContext", () => {
  const system: ChatMessage = { role: "system", content: "SYS" };
  const many: ChatMessage[] = [
    system,
    ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `消息${i}` }) as ChatMessage),
  ];

  it("保留 system 消息", () => {
    const out = compactContext(many, 10);
    expect(out[0]).toEqual(system);
  });

  it("保留最近 10 条，其余压成一段摘要", () => {
    const out = compactContext(many, 10);
    // system + 1 条摘要 + 最近 10 条
    expect(out.length).toBe(12);
    expect(out[1].role).toBe("user");
    expect(out[1].content).toContain("摘要");
    expect(out[2].content).toBe("消息10");
    expect(out[11].content).toBe("消息19");
  });

  it("待压缩条数 <5 时不压缩，原样返回", () => {
    const few: ChatMessage[] = [
      system,
      ...Array.from({ length: 4 }, (_, i) => ({ role: "user", content: `m${i}` }) as ChatMessage),
    ];
    expect(compactContext(few, 10)).toEqual(few);
  });
});
