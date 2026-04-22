import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutoLogHandler, significanceScore } from "./autolog.js";

type HookEvent = { type: string; action: string; context: unknown };

function toolExecutedEvent(context: unknown): HookEvent {
  return { type: "tool", action: "executed", context };
}

describe("significanceScore", () => {
  it("rates file writes higher than passive reads", () => {
    expect(significanceScore("write_file", false)).toBeGreaterThan(
      significanceScore("read_file", false),
    );
  });

  it("adds a point for errors", () => {
    expect(significanceScore("run_command", true)).toBeGreaterThan(
      significanceScore("run_command", false),
    );
  });

  it("scores spawn_agent high", () => {
    expect(significanceScore("spawn_agent", false)).toBeGreaterThanOrEqual(4);
  });
});

describe("createAutoLogHandler", () => {
  let vault: string;

  beforeEach(() => {
    vault = join(tmpdir(), `obsidian-autolog-${Date.now()}-${Math.random()}`);
    mkdirSync(vault, { recursive: true });
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  function listFolder(): string[] {
    try {
      return readdirSync(join(vault, "OpenClaw"));
    } catch {
      return [];
    }
  }

  it("is a no-op when autoLog is not enabled", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({ vaultPath: vault, knowledgeFolder: "OpenClaw" }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "write_file",
        args: { path: "/tmp/x.md" },
        result: { ok: true },
        isError: false,
      }),
    );
    expect(listFolder()).toHaveLength(0);
  });

  it("writes a note when autoLog is on and the tool is significant", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({
        vaultPath: vault,
        knowledgeFolder: "OpenClaw",
        autoLog: true,
      }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "write_file",
        args: { path: "src/app.ts", content: "export {}" },
        result: { ok: true, bytesWritten: 9 },
        isError: false,
        durationMs: 12,
        agentId: "main",
      }),
    );
    const files = listFolder();
    expect(files).toHaveLength(1);
    const body = readFileSync(join(vault, "OpenClaw", files[0] ?? ""), "utf-8");
    expect(body).toContain("write file");
    expect(body).toContain("write_file");
    expect(body).toContain("12 ms");
    expect(body).toContain("main");
  });

  it("skips built-in skip-list tools (no recursion via knowledge_log)", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({
        vaultPath: vault,
        knowledgeFolder: "OpenClaw",
        autoLog: true,
      }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "knowledge_log",
        args: { title: "a manual entry", content: "..." },
        result: { ok: true },
        isError: false,
      }),
    );
    expect(listFolder()).toHaveLength(0);
  });

  it("honors user-configured skip list", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({
        vaultPath: vault,
        knowledgeFolder: "OpenClaw",
        autoLog: true,
        autoLogSkipTools: ["run_command"],
      }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "run_command",
        args: { command: "ls" },
        result: { stdout: "README.md\n" },
        isError: false,
      }),
    );
    expect(listFolder()).toHaveLength(0);
  });

  it("drops low-significance calls below the minimum score", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({
        vaultPath: vault,
        knowledgeFolder: "OpenClaw",
        autoLog: true,
        autoLogMinSignificance: 5, // high bar
      }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "read_file",
        args: { path: "README.md" },
        result: { content: "..." },
        isError: false,
      }),
    );
    expect(listFolder()).toHaveLength(0);
  });

  it("flags errors with the [ERROR] title suffix and error category", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({
        vaultPath: vault,
        knowledgeFolder: "OpenClaw",
        autoLog: true,
      }),
    });
    await handler(
      toolExecutedEvent({
        toolName: "run_command",
        args: { command: "false" },
        result: { error: "exited with code 1" },
        isError: true,
      }),
    );
    const files = listFolder();
    expect(files).toHaveLength(1);
    const body = readFileSync(join(vault, "OpenClaw", files[0] ?? ""), "utf-8");
    expect(body).toContain("[ERROR]");
    expect(body).toContain("category: error");
  });

  it("silently ignores non-tool events", async () => {
    const handler = createAutoLogHandler({
      getPluginConfig: () => ({ vaultPath: vault, autoLog: true }),
    });
    await handler({ type: "command", action: "new", context: { sessionKey: "x" } });
    expect(listFolder()).toHaveLength(0);
  });

  it("does not throw when the vault is not configured", async () => {
    const handler = createAutoLogHandler({ getPluginConfig: () => ({ autoLog: true }) });
    await expect(
      handler(
        toolExecutedEvent({
          toolName: "write_file",
          args: {},
          result: null,
          isError: false,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
