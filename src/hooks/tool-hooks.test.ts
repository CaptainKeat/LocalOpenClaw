import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInternalHooks,
  emitToolExecutedHook,
  isToolExecutedEvent,
  registerInternalHook,
  setInternalHooksEnabled,
  type ToolExecutedHookContext,
} from "./internal-hooks.js";

describe("emitToolExecutedHook", () => {
  beforeEach(() => {
    clearInternalHooks();
    setInternalHooksEnabled(true);
  });

  afterEach(() => {
    clearInternalHooks();
    setInternalHooksEnabled(true);
  });

  it("short-circuits silently when no handlers are registered", async () => {
    await expect(
      emitToolExecutedHook({
        toolName: "noop",
        args: {},
        result: { ok: true },
        isError: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("invokes tool:executed handlers with a typed event", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "knowledge_log",
      toolCallId: "c1",
      args: { title: "t" },
      result: { ok: true },
      isError: false,
      durationMs: 12,
      agentId: "main",
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0];
    expect(event?.type).toBe("tool");
    expect(event?.action).toBe("executed");
    expect(isToolExecutedEvent(event)).toBe(true);
    const ctx = event?.context as ToolExecutedHookContext;
    expect(ctx.toolName).toBe("knowledge_log");
    expect(ctx.isError).toBe(false);
    expect(ctx.durationMs).toBe(12);
  });

  it("invokes handlers subscribed to the 'tool' type (not just the action)", async () => {
    const typeHandler = vi.fn();
    registerInternalHook("tool", typeHandler);

    await emitToolExecutedHook({
      toolName: "x",
      args: {},
      result: null,
      isError: true,
    });

    expect(typeHandler).toHaveBeenCalledTimes(1);
    expect(typeHandler.mock.calls[0]?.[0]?.action).toBe("executed");
  });

  it("never throws when a listener throws", async () => {
    registerInternalHook("tool:executed", () => {
      throw new Error("listener boom");
    });

    await expect(
      emitToolExecutedHook({
        toolName: "x",
        args: {},
        result: null,
        isError: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("respects the global disable switch", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);
    setInternalHooksEnabled(false);

    await emitToolExecutedHook({
      toolName: "x",
      args: {},
      result: null,
      isError: false,
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("isToolExecutedEvent", () => {
  it("rejects non-tool events", () => {
    expect(
      isToolExecutedEvent({
        type: "command",
        action: "executed",
        sessionKey: "",
        context: { toolName: "x", isError: false },
        timestamp: new Date(),
        messages: [],
      }),
    ).toBe(false);
  });

  it("rejects tool events with missing required fields", () => {
    expect(
      isToolExecutedEvent({
        type: "tool",
        action: "executed",
        sessionKey: "",
        context: {},
        timestamp: new Date(),
        messages: [],
      }),
    ).toBe(false);
  });
});
