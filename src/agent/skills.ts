/**
 * Skill 系统 — 从 ~/.hzkclaw/skills 加载 .md 技能说明
 */
import { readFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { SKILLS_DIR } from "../config.js";

export function loadSkills(): string {
  mkdirSync(SKILLS_DIR, { recursive: true });
  const skills: string[] = [];
  try {
    for (const entry of readdirSync(SKILLS_DIR)) {
      if (entry.endsWith(".md")) {
        const content = readFileSync(join(SKILLS_DIR, entry), "utf-8").slice(0, 2000);
        skills.push(`### ${entry}\n${content}`);
      }
    }
  } catch {
    /* no skills dir */
  }
  return skills.length > 0 ? `\n\n## 已加载的 Skills:\n${skills.join("\n\n")}` : "";
}
