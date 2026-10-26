import { describe, it, expect } from "vitest";
import { renderPrompt, getPrompt, listPrompts } from "../src/prompts.js";

describe("renderPrompt", () => {
  it("替换 {占位符}", () => {
    const out = renderPrompt("terminal", { cwd: "C:/work" });
    expect(out).toContain("C:/work");
    expect(out).not.toContain("{cwd}");
  });

  it("缺失的占位符替换为空串", () => {
    const out = renderPrompt("goal"); // goal 需要 {goal}
    expect(out).toContain("[长期目标]");
    expect(out).not.toContain("{goal}");
  });

  it("未知提示词抛错", () => {
    expect(() => renderPrompt("不存在")).toThrow("未知提示词");
  });
});

describe("getPrompt / listPrompts", () => {
  it("每个提示词都有 name 和 version", () => {
    for (const p of listPrompts()) {
      expect(p.name).toBeTruthy();
      expect(p.version).toBeTruthy();
      expect(p.template).toBeTruthy();
    }
  });

  it("能按名拿到提示词", () => {
    expect(getPrompt("feishu").name).toBe("feishu");
  });
});
