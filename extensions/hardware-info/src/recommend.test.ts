import { describe, expect, it } from "vitest";
import type { HardwareInfo } from "./detect.js";
import { recommendModel } from "./recommend.js";

const baseCpu: HardwareInfo["cpu"] = { model: "Test CPU", cores: 8, speed: 3600 };

function makeInfo(overrides: {
  ramTotalGB?: number;
  ramFreeGB?: number;
  gpuVramGB?: number;
  gpuAvailable?: boolean;
}): HardwareInfo {
  const ramTotal = overrides.ramTotalGB ?? 16;
  const ramFree = overrides.ramFreeGB ?? Math.max(1, ramTotal - 4);
  const hasGpu = overrides.gpuAvailable ?? (overrides.gpuVramGB ?? 0) > 0;
  const vram = overrides.gpuVramGB ?? 0;
  return {
    cpu: baseCpu,
    ram: { totalGB: ramTotal, freeGB: ramFree, usedGB: ramTotal - ramFree },
    gpu: hasGpu
      ? {
          available: true,
          gpus: [
            {
              name: "Test GPU",
              vendor: "nvidia",
              vramTotalGB: vram,
              vramFreeGB: vram,
              vramUsedGB: 0,
            },
          ],
        }
      : { available: false, gpus: [] },
    platform: "linux",
  };
}

describe("recommendModel", () => {
  it("picks gpu-high on 24GB+ VRAM", () => {
    const rec = recommendModel(makeInfo({ gpuVramGB: 24 }));
    expect(rec.tier).toBe("gpu-high");
    expect(rec.contextTokens).toBeGreaterThanOrEqual(32_000);
  });

  it("picks gpu-medium-high at 12GB VRAM", () => {
    const rec = recommendModel(makeInfo({ gpuVramGB: 12 }));
    expect(rec.tier).toBe("gpu-medium-high");
  });

  it("picks gpu-medium at 8GB VRAM", () => {
    const rec = recommendModel(makeInfo({ gpuVramGB: 8 }));
    expect(rec.tier).toBe("gpu-medium");
  });

  it("picks gpu-low at 4GB VRAM", () => {
    const rec = recommendModel(makeInfo({ gpuVramGB: 4 }));
    expect(rec.tier).toBe("gpu-low");
  });

  it("falls through to cpu-high when no GPU and ample RAM", () => {
    const rec = recommendModel(makeInfo({ gpuAvailable: false, ramTotalGB: 64, ramFreeGB: 40 }));
    expect(rec.tier).toBe("cpu-high");
  });

  it("picks cpu-medium at 16GB free RAM", () => {
    const rec = recommendModel(makeInfo({ gpuAvailable: false, ramTotalGB: 32, ramFreeGB: 16 }));
    expect(rec.tier).toBe("cpu-medium");
  });

  it("picks cpu-low at 8GB free RAM", () => {
    const rec = recommendModel(makeInfo({ gpuAvailable: false, ramTotalGB: 16, ramFreeGB: 8 }));
    expect(rec.tier).toBe("cpu-low");
  });

  it("falls back to minimal when everything is tiny", () => {
    const rec = recommendModel(makeInfo({ gpuAvailable: false, ramTotalGB: 4, ramFreeGB: 2 }));
    expect(rec.tier).toBe("minimal");
  });

  it("uses the largest VRAM across multiple GPUs", () => {
    const info = makeInfo({ gpuVramGB: 8 });
    info.gpu.gpus.push({
      name: "Secondary",
      vendor: "nvidia",
      vramTotalGB: 24,
      vramFreeGB: 24,
      vramUsedGB: 0,
    });
    expect(recommendModel(info).tier).toBe("gpu-high");
  });
});
