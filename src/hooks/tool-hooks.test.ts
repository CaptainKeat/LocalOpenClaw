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

describe("emitToolExecutedHook (redaction)", () => {
  beforeEach(() => {
    clearInternalHooks();
    setInternalHooksEnabled(true);
  });

  afterEach(() => {
    clearInternalHooks();
    setInternalHooksEnabled(true);
  });

  it("redacts secret-looking fields in args before listeners observe them", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "web_fetch",
      args: {
        url: "https://example.com",
        apiKey: "sk-abcdef1234567890abcdef1234567890",
      },
      result: { ok: true },
      isError: false,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const observedArgs = handler.mock.calls[0]?.[0]?.context?.args as Record<string, unknown>;
    expect(observedArgs.url).toBe("https://example.com");
    // The raw API-key value must not reach the listener verbatim.
    expect(JSON.stringify(observedArgs)).not.toContain("sk-abcdef1234567890abcdef1234567890");
  });

  it("redacts secret-looking fields in result before listeners observe them", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "github_connect",
      args: {},
      result: {
        ok: true,
        token: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      isError: false,
    });

    const observed = handler.mock.calls[0]?.[0]?.context?.result;
    expect(JSON.stringify(observed)).not.toContain("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("swaps oversized results for a truncation placeholder", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    const huge = "x".repeat(200_000);
    await emitToolExecutedHook({
      toolName: "big",
      args: {},
      result: { blob: huge },
      isError: false,
    });

    const observed = handler.mock.calls[0]?.[0]?.context?.result as Record<string, unknown>;
    expect(observed.__redacted).toBe("oversized");
    expect(typeof observed.__size).toBe("number");
    // The raw string must NOT appear in the event.
    expect(JSON.stringify(observed)).not.toContain(huge.slice(0, 200));
  });

  it("handles circular references without throwing", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    await expect(
      emitToolExecutedHook({
        toolName: "loop",
        args: { nested: circular },
        result: { ok: true },
        isError: false,
      }),
    ).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(1);
    const observedArgs = handler.mock.calls[0]?.[0]?.context?.args as Record<string, unknown>;
    expect(observedArgs.__redacted).toBe("unserializable");
  });

  it("normalizes non-object args (e.g. primitives) to a placeholder", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "weird",
      // Cast through unknown: exercising the runtime guard, the type says object.
      args: "password=hunter2" as unknown as Record<string, unknown>,
      result: null,
      isError: false,
    });

    const observedArgs = handler.mock.calls[0]?.[0]?.context?.args as Record<string, unknown>;
    expect(observedArgs.__redacted).toBe("non-object-args");
  });

  it("handles array-valued args — collapsed to the non-object placeholder with no leak", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "batch_caller",
      // Arrays ARE objects in JS but aren't plain records — the runtime guard
      // swaps them for a placeholder so listener sees a predictable shape.
      args: [
        { apiKey: "sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" },
        { token: "ghp_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" },
      ] as unknown as Record<string, unknown>,
      result: { ok: true },
      isError: false,
    });

    // Critically: the raw secrets must not appear anywhere in the event.
    const serialized = JSON.stringify(handler.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    expect(serialized).not.toContain("ghp_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy");
    const observedArgs = handler.mock.calls[0]?.[0]?.context?.args as Record<string, unknown>;
    expect(observedArgs.__redacted).toBe("non-object-args");
  });

  it("redacts secrets inside arrays embedded in the result", async () => {
    const handler = vi.fn();
    registerInternalHook("tool:executed", handler);

    await emitToolExecutedHook({
      toolName: "list_creds",
      args: {},
      result: [
        { name: "primary", token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
        { name: "backup", token: "ghp_wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww" },
      ],
      isError: false,
    });

    // `result` takes the normal object branch (typeof []==="object"); the
    // stringify→redact→parse pipeline should mask the tokens.
    const serialized = JSON.stringify(handler.mock.calls[0]?.[0]?.context?.result);
    expect(serialized).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(serialized).not.toContain("ghp_wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww");
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
