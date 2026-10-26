/**
 * 统一配置 — 唯一来源
 *
 * 所有密钥从环境变量读取（可在项目根目录放 .env，参考 .env.example）。
 * 不再有任何硬编码密钥。
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// 极简 .env 加载器（不覆盖已存在的环境变量）
// ---------------------------------------------------------------------------
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(join(process.cwd(), ".env"));

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

// ---------------------------------------------------------------------------
// LLM 后端
// ---------------------------------------------------------------------------
export type LLMProtocol = "openai" | "anthropic" | "gemini";

export interface LLMBackend {
  /** 走哪个协议适配器（见 src/llm/ 下的 openai.ts / anthropic.ts / gemini.ts） */
  protocol: LLMProtocol;
  name: string;
  key: string;
  url: string;
  model: string;
}

// 多后端降级链路，按顺序尝试：Kimi → DeepSeek → Claude → Gemini。
// 只要协议适配器齐了，任何模型都能接进来（例如再加 GLM/Qwen 只要补一行 openai 协议配置）。
// key 缺失的后端会被自动剔除。
const ALL_BACKENDS: LLMBackend[] = [
  {
    protocol: "openai",
    name: "Kimi",
    key: getEnv("KIMI_API_KEY"),
    url: getEnv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
    model: getEnv("KIMI_MODEL", "kimi-k2.7-code"),
  },
  {
    protocol: "openai",
    name: "DeepSeek",
    key: getEnv("DEEPSEEK_API_KEY"),
    url: getEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    model: getEnv("DEEPSEEK_MODEL", "deepseek-chat"),
  },
  {
    protocol: "anthropic",
    name: "Claude",
    key: getEnv("ANTHROPIC_API_KEY"),
    url: getEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
    model: getEnv("ANTHROPIC_MODEL", "claude-sonnet-5"),
  },
  {
    protocol: "gemini",
    name: "Gemini",
    key: getEnv("GEMINI_API_KEY"),
    url: getEnv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"),
    model: getEnv("GEMINI_MODEL", "gemini-2.0-flash"),
  },
];

export const LLM_BACKENDS = ALL_BACKENDS.filter((b) => b.key);

export const DEFAULT_BACKEND = LLM_BACKENDS[0];

// ---------------------------------------------------------------------------
// 飞书
// ---------------------------------------------------------------------------
export const FEISHU_APP_ID = getEnv("FEISHU_APP_ID");
export const FEISHU_APP_SECRET = getEnv("FEISHU_APP_SECRET");

// ---------------------------------------------------------------------------
// 运行环境
// ---------------------------------------------------------------------------
export const SHELL = process.platform === "win32" ? "cmd" : "bash";
export const SHELL_FLAG = process.platform === "win32" ? "/c" : "-c";

export const HZKCLAW_DIR = join(homedir(), ".hzkclaw");
export const SESSIONS_DIR = join(HZKCLAW_DIR, "sessions");
export const SKILLS_DIR = join(HZKCLAW_DIR, "skills");
