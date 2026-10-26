import { describe, it, expect } from "vitest";
import { parseJudgeVerdict } from "../src/eval/judge.js";

describe("parseJudgeVerdict", () => {
  it("PASS 开头 → pass=true", () => {
    expect(parseJudgeVerdict("PASS\n准确且简洁").pass).toBe(true);
  });

  it("FAIL 开头 → pass=false", () => {
    expect(parseJudgeVerdict("FAIL 没有完成任务").pass).toBe(false);
  });

  it("小写也能识别", () => {
    expect(parseJudgeVerdict("pass 通过").pass).toBe(true);
  });

  it("没有 PASS/FAIL 前缀 → 判为失败（保守）", () => {
    expect(parseJudgeVerdict("完成了").pass).toBe(false);
  });
});
