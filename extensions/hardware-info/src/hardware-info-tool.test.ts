import { describe, expect, it } from "vitest";
import { createHardwareInfoTool, type ToolDeps } from "./hardware-info-tool.js";

type FakePluginApi = {
  pluginConfig?: Record<string, unknown>;
};

const fakeApi = (pluginConfig: Record<string, unknown> = {}): FakePluginApi => ({
  pluginConfig,
});

function makeDeps(now = 0, vramGB = 8): ToolDeps {
  return {
    now: () => now,
    exec: () => `Test GPU, ${Math.round(vramGB * 1024)}, ${Math.round(vramGB * 1024)}, 0`,
  };
}

describe("createHardwareInfoTool", () => {
  it("exposes the tool metadata", () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createHardwareInfoTool(fakeApi() as any, makeDeps());
    expect(tool.name).toBe("hardware_info");
    expect(tool.label).toBe("Hardware Info");
    expect(typeof tool.execute).toBe("function");
  });

  it("returns content and details with hardware + recommendation", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createHardwareInfoTool(fakeApi() as any, makeDeps(0, 12));
    const result = await tool.execute("call-1", {});
    expect(result.content[0]?.type).toBe("text");
    expect(result.details).toMatchObject({
      recommendation: { tier: "gpu-medium-high" },
      gpu: { available: true },
    });
  });

  it("caches snapshots for 60s by default", async () => {
    let callCount = 0;
    const deps: ToolDeps = {
      now: () => 0,
      exec: () => {
        callCount++;
        return "Test GPU, 8192, 8192, 0";
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createHardwareInfoTool(fakeApi() as any, deps);
    await tool.execute("1", {});
    await tool.execute("2", {});
    await tool.execute("3", {});
    expect(callCount).toBe(1);
  });

  it("re-detects when refresh=true", async () => {
    let callCount = 0;
    const deps: ToolDeps = {
      now: () => 0,
      exec: () => {
        callCount++;
        return "Test GPU, 8192, 8192, 0";
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createHardwareInfoTool(fakeApi() as any, deps);
    await tool.execute("1", {});
    await tool.execute("2", { refresh: true });
    expect(callCount).toBe(2);
  });

  it("honours pluginConfig.cacheSeconds", async () => {
    let clock = 0;
    let callCount = 0;
    const deps: ToolDeps = {
      now: () => clock,
      exec: () => {
        callCount++;
        return "Test GPU, 8192, 8192, 0";
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createHardwareInfoTool(fakeApi({ cacheSeconds: 5 }) as any, deps);
    await tool.execute("1", {});
    clock = 4_000;
    await tool.execute("2", {});
    clock = 6_000;
    await tool.execute("3", {});
    expect(callCount).toBe(2);
  });
});
