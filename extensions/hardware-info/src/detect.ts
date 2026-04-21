import { execSync } from "node:child_process";
import { cpus, freemem, platform, totalmem } from "node:os";

export type CpuInfo = {
  model: string;
  cores: number;
  /** Clock speed in MHz as reported by the OS. 0 if unknown. */
  speed: number;
};

export type RamInfo = {
  totalGB: number;
  freeGB: number;
  usedGB: number;
};

export type GpuEntry = {
  name: string;
  vendor: "nvidia" | "amd" | "unknown";
  vramTotalGB: number;
  vramFreeGB: number;
  vramUsedGB: number;
};

export type GpuInfo = {
  available: boolean;
  gpus: GpuEntry[];
};

export type HardwareInfo = {
  cpu: CpuInfo;
  ram: RamInfo;
  gpu: GpuInfo;
  platform: NodeJS.Platform;
};

/** Injectable seam so tests never actually shell out. */
export type Exec = (cmd: string, timeoutMs: number) => string;

const defaultExec: Exec = (cmd, timeoutMs) =>
  execSync(cmd, { timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] }).toString();

const GB = 1_073_741_824;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function detectCpu(): CpuInfo {
  const list = cpus();
  const first = list[0];
  return {
    model: first?.model ?? "Unknown",
    cores: list.length,
    speed: first?.speed ?? 0,
  };
}

export function detectRam(): RamInfo {
  const total = totalmem();
  const free = freemem();
  return {
    totalGB: round1(total / GB),
    freeGB: round1(free / GB),
    usedGB: round1((total - free) / GB),
  };
}

/**
 * Parse the CSV output of:
 *   nvidia-smi --query-gpu=name,memory.total,memory.free,memory.used --format=csv,noheader,nounits
 * Pure function — kept separate from the shell call so tests stay hermetic.
 */
export function parseNvidiaSmiCsv(output: string): GpuEntry[] {
  const gpus: GpuEntry[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length < 4) {
      continue;
    }
    const [name, totalMb, freeMb, usedMb] = parts;
    const total = Number.parseInt(totalMb ?? "", 10);
    const free = Number.parseInt(freeMb ?? "", 10);
    const used = Number.parseInt(usedMb ?? "", 10);
    if (!Number.isFinite(total)) {
      continue;
    }
    gpus.push({
      name: name ?? "NVIDIA GPU",
      vendor: "nvidia",
      vramTotalGB: round1(total / 1024),
      vramFreeGB: Number.isFinite(free) ? round1(free / 1024) : 0,
      vramUsedGB: Number.isFinite(used) ? round1(used / 1024) : 0,
    });
  }
  return gpus;
}

export function detectGpu(options: { exec?: Exec } = {}): GpuInfo {
  const exec = options.exec ?? defaultExec;

  // NVIDIA via nvidia-smi — platform-agnostic.
  try {
    const out = exec(
      "nvidia-smi --query-gpu=name,memory.total,memory.free,memory.used --format=csv,noheader,nounits",
      5000,
    );
    const gpus = parseNvidiaSmiCsv(out);
    if (gpus.length > 0) {
      return { available: true, gpus };
    }
  } catch {
    // fall through
  }

  // AMD via rocm-smi — Linux only.
  if (platform() === "linux") {
    try {
      const out = exec("rocm-smi --showmeminfo vram --csv", 5000);
      if (out.includes("GPU")) {
        return {
          available: true,
          gpus: [
            {
              name: "AMD GPU (ROCm)",
              vendor: "amd",
              vramTotalGB: 0,
              vramFreeGB: 0,
              vramUsedGB: 0,
            },
          ],
        };
      }
    } catch {
      // fall through
    }
  }

  return { available: false, gpus: [] };
}

export function detectHardware(options: { exec?: Exec } = {}): HardwareInfo {
  return {
    cpu: detectCpu(),
    ram: detectRam(),
    gpu: detectGpu(options),
    platform: platform(),
  };
}
