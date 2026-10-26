/**
 * 飞书长连接入口 — 原 main.ts 的 main() 迁移
 *
 * 修掉了原版两个作用域 bug：
 *   1. traceId 未定义
 *   2. chatId 声明在 try 内却在 catch 引用（错误路径会 ReferenceError）
 */
import * as Lark from "@larksuiteoapi/node-sdk";
import { createLogger } from "../src/logger.js";
import { initSession } from "../src/persistence.js";
import { runAgent } from "../src/agent/loop.js";
import { FEISHU_APP_ID, FEISHU_APP_SECRET, LLM_BACKENDS } from "../src/config.js";
import { renderPrompt } from "../src/prompts.js";

const SYSTEM_PROMPT = renderPrompt("feishu");

function splitText(text: string, max = 15000): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
  return parts;
}

async function sendText(client: any, chatId: string, text: string): Promise<void> {
  for (const chunk of splitText(text)) {
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: { receive_id: chatId, content: JSON.stringify({ text: chunk }), msg_type: "text" },
    });
  }
}

const log = createLogger("feishu");

async function main(): Promise<void> {
  const session = initSession("feishu");
  let requestCount = 0;
  let fallbackCount = 0;

  const goalState = { active: false };
  const steeringQueue: string[] = [];
  let isProcessing = false;
  const seenMsgIds = new Set<string>();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║        hzkclaw - 飞书 Coding Agent       ║");
  for (const b of LLM_BACKENDS) {
    console.log(`║  后端: ${b.name.padEnd(14)} ${b.model.padEnd(18)}║`);
  }
  console.log(`║  持久化: ${session.file.slice(-30).padEnd(30)}║`);
  console.log("║  功能: 流式 压缩 重试 steering 7工具 skill║");
  console.log("╚══════════════════════════════════════════╝");

  const client: any = new Lark.Client({ appId: FEISHU_APP_ID, appSecret: FEISHU_APP_SECRET });
  const wsClient: any = new Lark.WSClient({ appId: FEISHU_APP_ID, appSecret: FEISHU_APP_SECRET });

  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: any) => {
        if (isProcessing) {
          console.log("[飞书] 上条消息还在处理，跳过");
          return;
        }

        const msgId = data.message?.message_id;
        if (msgId && seenMsgIds.has(msgId)) {
          console.log("[飞书] 重复消息，跳过");
          return;
        }
        if (msgId) seenMsgIds.add(msgId);

        const chatId: string = data.message?.chat_id || "";
        isProcessing = true;
        const traceId = log.start("feishu-msg");

        try {
          const text: string = JSON.parse(data.message.content || "{}").text || "";
          if (!text.trim()) return;

          console.log(`\n[飞书] ${text.slice(0, 100)}`);

          // /goal 命令
          if (text.startsWith("/goal ")) {
            const goalText = text.slice(6);
            goalState.active = true;
            const goalPrompt = renderPrompt("goal", { goal: goalText });
            const result = await runAgent(goalPrompt, {
              systemPrompt: SYSTEM_PROMPT,
              session,
              enableGoal: true,
              goalState,
              steeringQueue,
              onStream: async () => {},
              traceId,
              log,
            });
            await sendText(client, chatId, `🎯 目标: ${goalText}\n\n${result.text}\n\n[tokens: ${result.tokens}]`);
            return;
          }

          // /done 命令
          if (text === "/done") {
            goalState.active = false;
            await sendText(client, chatId, "✅ 已停止正在运行的目标。");
            return;
          }

          // /steer 命令
          if (text.startsWith("/steer ")) {
            const sMsg = text.slice(8);
            steeringQueue.push(sMsg);
            await sendText(client, chatId, `📨 消息已注入: ${sMsg.slice(0, 100)}`);
            return;
          }

          // 正常对话 — 不启用 goal 循环
          const result = await runAgent(text, {
            systemPrompt: SYSTEM_PROMPT,
            session,
            enableGoal: false,
            onStream: async () => {},
            traceId,
            log,
          });
          await sendText(client, chatId, result.text);
          console.log("[飞书] 回复完成");
          log.end(traceId, {});
          console.log(`[持久化] 已保存 ${session.messages.length} 条消息`);
        } catch (e: any) {
          log.error(traceId, "request.error", { error: e.message.slice(0, 200) });
          console.error("[飞书] 错误:", e.message);
          requestCount++;
          fallbackCount++;
          if (requestCount % 20 === 0) {
            log.warn(traceId, "stats.fallbackRate", {
              rate: Math.round((fallbackCount / requestCount) * 100) / 100,
              total: requestCount,
              fallbacks: fallbackCount,
            });
          }
          await sendText(client, chatId, "抱歉，当前服务暂时不可用，请稍后重试。");
        } finally {
          isProcessing = false;
        }
      },
    }),
  });

  console.log("[飞书] 长连接已建立，等待消息...");
  wsClient.on("close", (code: any, reason: any) => {
    console.log("[FeishuGuard] WebSocket断开 code:" + code + " reason:" + reason + " — SDK会自动重连");
    log.warn("system", "feishu.disconnected", { code, reason: String(reason).slice(0, 100) });
  });
  wsClient.on("error", (e: any) => {
    console.log("[FeishuGuard] WebSocket错误:" + (e?.message || e));
    log.error("system", "feishu.error", { error: String(e).slice(0, 200) });
  });
  console.log("[提示] 支持命令: /goal /done /steer");
}

main().catch((e) => console.error("启动失败:", e.message));
