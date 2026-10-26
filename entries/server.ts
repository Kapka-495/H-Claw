/**
 * HTTP Webhook 入口 — 飞书事件订阅 → HTTP 推送（原 server.ts 迁移）
 *
 * 注意：这里只做 URL 验证 + 事件打印。真正调 Agent 处理并回复，需要像
 * entries/feishu.ts 那样创建一个 Lark.Client 来主动发消息（HTTP 模式无法直接回复事件）。
 *
 * 飞书后台配置:
 *   事件与回调 → 订阅方式 → "将事件发送至开发者服务器"
 *   请求网址 → 公网地址（如 https://xxx.ngrok.io/feishu/event）
 */
import { createServer } from "http";

const PORT = 3000;

createServer((req, res) => {
  if (req.url === "/feishu/event" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        // 飞书首次配置时的 URL 验证
        if (data.type === "url_verification") {
          console.log("[飞书] URL 验证");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ challenge: data.challenge }));
          return;
        }

        console.log("[飞书] 收到事件:", JSON.stringify(data).slice(0, 500));

        if (data.event?.message?.message_type === "text") {
          const text = JSON.parse(data.event.message.content || "{}").text;
          console.log(`[飞书消息] ${text}`);
          // TODO: 调 Agent 处理 + 用 Lark.Client 回复（参考 entries/feishu.ts）
        }

        res.writeHead(200);
        res.end(JSON.stringify({ code: 0 }));
      } catch (e) {
        console.error("[飞书] 解析错误:", e);
        res.writeHead(200);
        res.end(JSON.stringify({ code: 0 }));
      }
    });
    return;
  }

  // 健康检查
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
}).listen(PORT, () => {
  console.log(`[hzkclaw] HTTP 服务器已启动: http://localhost:${PORT}`);
  console.log("[hzkclaw] 需要配置公网地址（如 ngrok）才能接收飞书推送");
});
