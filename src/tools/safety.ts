/**
 * 安全护栏 — 危险命令 + 敏感路径
 *
 * 纯函数，可单测。
 */

export const DANGER_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /dd\s+if=/,
  /mkfs\./,
  /format\s+[A-Z]:/,
  />\s*\/dev\//,
  /chmod\s+777\s+\//,
];

export const SENSITIVE_PATHS = [
  "/etc/",
  "~/.ssh",
  "C:/Windows/System32",
  "/root/",
  "~/.aws",
  "~/.config",
];

export function isDangerousCommand(cmd: string): boolean {
  return DANGER_PATTERNS.some((p) => p.test(cmd));
}

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATHS.some((sp) => path.includes(sp));
}
