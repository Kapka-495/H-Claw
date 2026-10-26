/**
 * 安全护栏测试 — 危险命令 + 敏感路径（必须回归）
 */
import { describe, it, expect } from "vitest";
import { isDangerousCommand, isSensitivePath } from "../src/tools/safety.js";

describe("危险命令拦截", () => {
  it("拦截 rm -rf /", () => {
    expect(isDangerousCommand("rm -rf /")).toBe(true);
  });
  it("拦截 dd if=", () => {
    expect(isDangerousCommand("dd if=/dev/zero of=/dev/sda")).toBe(true);
  });
  it("拦截 mkfs", () => {
    expect(isDangerousCommand("mkfs.ext4 /dev/sda1")).toBe(true);
  });
  it("拦截 format C:", () => {
    expect(isDangerousCommand("format C:")).toBe(true);
  });
  it("拦截 chmod 777 /", () => {
    expect(isDangerousCommand("chmod 777 /")).toBe(true);
  });
  it("不拦截普通命令", () => {
    expect(isDangerousCommand("ls -la")).toBe(false);
  });
  it("不拦截删除单个文件", () => {
    expect(isDangerousCommand("rm -f ./tmp.txt")).toBe(false);
  });
});

describe("敏感路径拦截", () => {
  it("拦截 /etc/", () => {
    expect(isSensitivePath("/etc/passwd")).toBe(true);
  });
  it("拦截 ~/.ssh", () => {
    expect(isSensitivePath("~/.ssh/id_rsa")).toBe(true);
  });
  it("拦截 Windows System32", () => {
    expect(isSensitivePath("C:/Windows/System32/drivers")).toBe(true);
  });
  it("不拦截普通项目路径", () => {
    expect(isSensitivePath("./src/main.ts")).toBe(false);
  });
});
