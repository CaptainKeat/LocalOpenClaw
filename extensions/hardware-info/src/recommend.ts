import type { HardwareInfo } from "./detect.js";

export type ModelTier =
  | "gpu-high"
  | "gpu-medium-high"
  | "gpu-medium"
  | "gpu-low"
  | "cpu-high"
  | "cpu-medium"
  | "cpu-low"
  | "minimal";

export type ModelRecommendation = {
  tier: ModelTier;
  model: string;
  contextTokens: number;
  reason: string;
  alternatives: string[];
};

/**
 * Pure function: turn a hardware snapshot into a recommended local model tier.
 * Priors favour the most capable model that fits comfortably; alternatives are
 * step-downs the caller can surface as tradeoffs.
 */
export function recommendModel(info: HardwareInfo): ModelRecommendation {
  const { ram, gpu } = info;
  const maxVram = gpu.available
    ? gpu.gpus.reduce((best, g) => Math.max(best, g.vramTotalGB), 0)
    : 0;
  const availableRam = ram.freeGB;
  const totalRam = ram.totalGB;

  if (maxVram >= 24) {
    return {
      tier: "gpu-high",
      model: "qwen2.5-coder:32b",
      contextTokens: 32_768,
      reason: `${maxVram}GB VRAM — can run 32B-parameter models with generous context`,
      alternatives: ["deepseek-coder-v2:16b", "codellama:34b", "llama3.1:70b-q4"],
    };
  }
  if (maxVram >= 12) {
    return {
      tier: "gpu-medium-high",
      model: "qwen2.5-coder:14b",
      contextTokens: 16_384,
      reason: `${maxVram}GB VRAM — good fit for 14B models`,
      alternatives: ["llama3.1:8b", "deepseek-coder:6.7b", "codellama:13b"],
    };
  }
  if (maxVram >= 8) {
    return {
      tier: "gpu-medium",
      model: "llama3.1:8b",
      contextTokens: 8_192,
      reason: `${maxVram}GB VRAM — fits 7-8B models comfortably`,
      alternatives: ["qwen2.5-coder:7b", "deepseek-coder:6.7b", "mistral:7b"],
    };
  }
  if (maxVram >= 4) {
    return {
      tier: "gpu-low",
      model: "llama3.2:3b",
      contextTokens: 4_096,
      reason: `${maxVram}GB VRAM — limited to small models`,
      alternatives: ["phi3:3.8b", "gemma2:2b"],
    };
  }

  // CPU-only path keyed on RAM.
  if (availableRam >= 32) {
    return {
      tier: "cpu-high",
      model: "qwen2.5-coder:14b-q4_0",
      contextTokens: 16_384,
      reason: `No GPU detected, ${totalRam}GB RAM (${availableRam}GB free) — CPU inference with 14B Q4 model`,
      alternatives: ["llama3.1:8b", "qwen2.5:7b"],
    };
  }
  if (availableRam >= 16) {
    return {
      tier: "cpu-medium",
      model: "llama3.1:8b-q4_0",
      contextTokens: 8_192,
      reason: `No GPU detected, ${totalRam}GB RAM (${availableRam}GB free) — CPU inference with 8B Q4 model`,
      alternatives: ["qwen2.5-coder:7b-q4_0", "mistral:7b-q4_0"],
    };
  }
  if (availableRam >= 8) {
    return {
      tier: "cpu-low",
      model: "llama3.2:3b",
      contextTokens: 4_096,
      reason: `No GPU detected, limited RAM (${availableRam}GB free) — use small 3B model`,
      alternatives: ["phi3:3.8b-q4_0", "gemma2:2b"],
    };
  }

  return {
    tier: "minimal",
    model: "gemma2:2b",
    contextTokens: 2_048,
    reason: `Very limited resources (${availableRam}GB free RAM, no GPU) — use smallest available model`,
    alternatives: ["tinyllama:1.1b"],
  };
}
