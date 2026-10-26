/**
 * 终端入口 — 原 cli.mjs 迁移，复用 src/ 共享模块
 *
 * 用法:
 *   tsx entries/cli.ts               交互模式
 *   tsx entries/cli.ts -p "你的问题"  单次模式
 */
import { createInterface } from "readline";
import { initSession } from "../src/persistence.js";
import { runAgent } from "../src/agent/loop.js";
import { DEFAULT_BACKEND } from "../src/config.js";
import { renderPrompt } from "../src/prompts.js";

const CWD = process.cwd();
const SYSTEM_PROMPT = renderPrompt("terminal", { cwd: CWD });

async function main(): Promise<void> {
  const session = initSession("terminal");
  const args = process.argv.slice(2);

  const call = (input: string) =>
    runAgent(input, {
      systemPrompt: SYSTEM_PROMPT,
      session,
      onStream: (t) => {
        process.stdout.write(t);
      },
      onReasoning: (t) => {
        process.stdout.write(`\x1b[90m${t}\x1b[0m`);
      },
    });

  // -p 单次模式
  if (args.includes("-p") || !process.stdin.isTTY) {
    const input = args.filter((a) => a !== "-p").join(" ") || (await readStdin());
    if (!input.trim()) {
      console.error("用法: tsx entries/cli.ts -p '你的问题'");
      process.exit(1);
    }
    const result = await call(input);
    console.log(`\n\x1b[90m[tokens: ${result.tokens}]\x1b[0m`);
    process.exit(0);
  }

  // 交互模式
  const model = DEFAULT_BACKEND?.model || "未配置";
  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════╗\x1b[0m");
  console.log("  \x1b[1;36m║\x1b[0m        \x1b[1mhzkclaw - 终端模式\x1b[0m              \x1b[1;36m║\x1b[0m");
  console.log(`  \x1b[1;36m║\x1b[0m  模型: \x1b[33m${model.padEnd(30)}\x1b[0m\x1b[1;36m║\x1b[0m`);
  console.log(`  \x1b[1;36m║\x1b[0m  目录: \x1b[90m${CWD.slice(-32).padEnd(30)}\x1b[0m\x1b[1;36m║\x1b[0m`);
  console.log("  \x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m");
  console.log("  \x1b[90m输入消息开始对话，Ctrl+C 退出，/clear 清屏\x1b[0m\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let processing = false;

  const ask = (): void => {
    rl.question("\x1b[33m❯ \x1b[0m", async (input) => {
      if (!input.trim()) {
        ask();
        return;
      }
      if (input === "/clear") {
        console.clear();
        ask();
        return;
      }
      if (input === "exit" || input === "quit") {
        rl.close();
        return;
      }
      if (processing) {
        console.log("\x1b[90m  还在处理上一条...\x1b[0m");
        ask();
        return;
      }

      processing = true;
      try {
        const result = await call(input);
        console.log(`\n\x1b[90m[tokens: ${result.tokens}]\x1b[0m\n`);
      } catch (e: any) {
        console.error(`\x1b[31m错误: ${e.message.slice(0, 200)}\x1b[0m`);
      }
      processing = false;
      ask();
    });
  };
  ask();
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (d) => (data += d));
    process.stdin.on("end", () => resolve(data));
  });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
