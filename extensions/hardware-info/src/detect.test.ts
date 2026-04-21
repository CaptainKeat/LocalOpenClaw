import { describe, expect, it } from "vitest";
import { detectGpu, parseNvidiaSmiCsv } from "./detect.js";

describe("parseNvidiaSmiCsv", () => {
  it("parses a single GPU row", () => {
    const out = "NVIDIA GeForce RTX 4070, 12282, 10000, 2282";
    expect(parseNvidiaSmiCsv(out)).toEqual([
      {
        name: "NVIDIA GeForce RTX 4070",
        vendor: "nvidia",
        vramTotalGB: 12.0,
        vramFreeGB: 9.8,
        vramUsedGB: 2.2,
      },
    ]);
  });

  it("parses multiple GPU rows", () => {
    const out = ["NVIDIA A100, 40536, 40000, 536", "NVIDIA A100, 40536, 20000, 20536"].join("\n");
    const gpus = parseNvidiaSmiCsv(out);
    expect(gpus).toHaveLength(2);
    expect(gpus[0]?.vramTotalGB).toBeGreaterThan(39);
    expect(gpus[1]?.vramUsedGB).toBeGreaterThan(19);
  });

  it("ignores blank lines", () => {
    const out = "\nNVIDIA GeForce RTX 3060, 8192, 8000, 192\n\n";
    expect(parseNvidiaSmiCsv(out)).toHaveLength(1);
  });

  it("skips malformed rows", () => {
    const out = "bogus\nNVIDIA GeForce RTX 3060, 8192, 8000, 192";
    expect(parseNvidiaSmiCsv(out)).toHaveLength(1);
  });

  it("tolerates non-finite numbers for free/used but requires total", () => {
    const out = "NVIDIA GeForce RTX 3060, 8192, nan, nan";
    const gpus = parseNvidiaSmiCsv(out);
    expect(gpus).toEqual([
      {
        name: "NVIDIA GeForce RTX 3060",
        vendor: "nvidia",
        vramTotalGB: 8.0,
        vramFreeGB: 0,
        vramUsedGB: 0,
      },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseNvidiaSmiCsv("")).toEqual([]);
  });
});

describe("detectGpu", () => {
  it("reports available:true when nvidia-smi succeeds", () => {
    const exec = (_cmd: string, _timeoutMs: number) =>
      "NVIDIA GeForce RTX 4070, 12282, 10000, 2282";
    const gpu = detectGpu({ exec });
    expect(gpu.available).toBe(true);
    expect(gpu.gpus).toHaveLength(1);
    expect(gpu.gpus[0]?.vendor).toBe("nvidia");
  });

  it("returns available:false when nvidia-smi throws and platform is non-linux", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const exec = () => {
        throw new Error("nvidia-smi not found");
      };
      expect(detectGpu({ exec })).toEqual({ available: false, gpus: [] });
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    }
  });

  it("falls back to rocm-smi on linux when nvidia fails", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      let calls = 0;
      const exec = (cmd: string, _timeoutMs: number) => {
        calls++;
        if (cmd.startsWith("nvidia-smi")) {
          throw new Error("not found");
        }
        return "GPU[0]: vram_total_memory = 8192 MiB";
      };
      const gpu = detectGpu({ exec });
      expect(calls).toBe(2);
      expect(gpu.available).toBe(true);
      expect(gpu.gpus[0]?.vendor).toBe("amd");
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    }
  });

  it("reports available:false when nvidia-smi returns no rows", () => {
    const exec = () => "";
    expect(detectGpu({ exec })).toEqual({ available: false, gpus: [] });
  });
});
