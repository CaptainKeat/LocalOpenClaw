import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { detectHardware, type Exec, type HardwareInfo } from "./detect.js";
import { recommendModel, type ModelRecommendation } from "./recommend.js";

type PluginCfg = {
  cacheSeconds?: number;
};

type CachedSnapshot = {
  info: HardwareInfo;
  recommendation: ModelRecommendation;
  expiresAt: number;
};

export type ToolDeps = {
  now?: () => number;
  exec?: Exec;
};

const HardwareInfoToolSchema = Type.Object(
  {
    refresh: Type.Optional(
      Type.Boolean({
        description: "Bypass the cached snapshot and re-detect. Default false.",
      }),
    ),
  },
  { additionalProperties: false },
);

type HardwareInfoParams = {
  refresh?: unknown;
};

export function createHardwareInfoTool(api: OpenClawPluginApi, deps: ToolDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const exec = deps.exec;
  let cached: CachedSnapshot | undefined;

  const snapshot = (refresh: boolean) => {
    const current = now();
    if (!refresh && cached && cached.expiresAt > current) {
      return cached;
    }
    const info = detectHardware(exec ? { exec } : {});
    const recommendation = recommendModel(info);
    const cfg = (api.pluginConfig ?? {}) as PluginCfg;
    const cacheSeconds =
      typeof cfg.cacheSeconds === "number" && cfg.cacheSeconds >= 0 ? cfg.cacheSeconds : 60;
    const next: CachedSnapshot = {
      info,
      recommendation,
      expiresAt: current + cacheSeconds * 1000,
    };
    cached = next;
    return next;
  };

  return {
    name: "hardware_info",
    label: "Hardware Info",
    description:
      "Inspect the host's CPU, RAM, and GPU inventory, and recommend a local Ollama-friendly model tier. Cached for 60s by default.",
    parameters: HardwareInfoToolSchema,
    async execute(_toolCallId: string, rawParams: HardwareInfoParams) {
      const refresh = rawParams.refresh === true;
      const { info, recommendation } = snapshot(refresh);
      const payload = { ...info, recommendation };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
