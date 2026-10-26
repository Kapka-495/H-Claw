/**
 * 工具定义（OpenAI function-calling 协议）— 唯一实现
 */
export const TOOLS = [
  { type: "function", function: { name: "bash", description: "执行 shell 命令", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "read", description: "读取文件内容，支持 offset/limit 分页", parameters: { type: "object", properties: { path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["path"] } } },
  { type: "function", function: { name: "write", description: "创建或覆写文件", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit", description: "精确替换文件中的文本。oldText须在文件中唯一出现一次。", parameters: { type: "object", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["path", "oldText", "newText"] } } },
  { type: "function", function: { name: "grep", description: "在文件中搜索模式", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } } },
  { type: "function", function: { name: "find", description: "按文件名模式查找文件", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } } },
  { type: "function", function: { name: "ls", description: "列出目录内容", parameters: { type: "object", properties: { path: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "goal_complete", description: "当用户设置的目标已经完成时调用此函数", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } } },
];
