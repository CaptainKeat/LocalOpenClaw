---
summary: "Inspect CPU, RAM, and GPU and recommend a local-model tier"
read_when:
  - You want the agent to know what hardware it is running on
  - You want a model recommendation based on available VRAM or free RAM
  - You are picking a local Ollama model and unsure which fits
title: "Hardware Info"
---

# Hardware Info

The `hardware-info` bundled plugin exposes a `hardware_info` tool that returns
a snapshot of the host machine and a suggested local-model tier. It is useful
when the agent is helping you pick an Ollama model, diagnose a slow inference,
or tailor its responses to constrained resources.

## What it reports

- **CPU**: model string, logical-core count, clock speed (MHz)
- **RAM**: total, free, and used (GB)
- **GPU**: NVIDIA cards via `nvidia-smi`, AMD cards via `rocm-smi` on Linux.
  Returns vendor, name, and VRAM (total/free/used GB) per card, or
  `available: false` if neither tool is present.
- **Platform**: the Node.js platform string (`darwin`, `linux`, `win32`, ...)
- **Recommendation**: a tiered model suggestion (see below) with alternatives

The recommendation mapping is priority-ordered: VRAM takes precedence, with
CPU-only paths keyed on free RAM.

| Tier               | Trigger              | Recommended model           | Context tokens |
| ------------------ | -------------------- | --------------------------- | -------------- |
| `gpu-high`         | >=24 GB VRAM         | `qwen2.5-coder:32b`         | 32768          |
| `gpu-medium-high`  | >=12 GB VRAM         | `qwen2.5-coder:14b`         | 16384          |
| `gpu-medium`       | >=8 GB VRAM          | `llama3.1:8b`               | 8192           |
| `gpu-low`          | >=4 GB VRAM          | `llama3.2:3b`               | 4096           |
| `cpu-high`         | no GPU, >=32 GB free | `qwen2.5-coder:14b-q4_0`    | 16384          |
| `cpu-medium`       | no GPU, >=16 GB free | `llama3.1:8b-q4_0`          | 8192           |
| `cpu-low`          | no GPU, >=8 GB free  | `llama3.2:3b`               | 4096           |
| `minimal`          | otherwise            | `gemma2:2b`                 | 2048           |

## Tool parameters

| Parameter  | Description                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `refresh`  | Bypass the cached snapshot and re-detect. Defaults to `false`.              |

## Caching

Detection shells out to `nvidia-smi` or `rocm-smi`, which is not free, so the
tool caches its snapshot. By default the cache lives for 60 seconds. Override
via the plugin config.

```json5
{
  plugins: {
    entries: {
      "hardware-info": {
        enabled: true,
        config: {
          cacheSeconds: 300,
        },
      },
    },
  },
}
```

Pass `refresh: true` to the tool invocation to force a fresh detection pass
regardless of the cache.

## Examples

Ask the agent:

> "What hardware are you running on, and which local model should I pull?"

The agent calls `hardware_info`, reads the `recommendation.model` field, and
answers concretely. For a fresh snapshot during a long session:

> "Re-check the GPU (my VRAM was being used by another process earlier)."

The agent calls `hardware_info` with `refresh: true` and compares.

## Platform notes

- **Windows**: NVIDIA detection works if `nvidia-smi` is on `PATH`. The NVIDIA
  installer typically places it under `C:\Windows\System32\nvidia-smi.exe`,
  which is on `PATH` by default. AMD detection is skipped on Windows.
- **macOS**: Neither `nvidia-smi` nor `rocm-smi` exists on Apple Silicon, so
  the tool reports `gpu.available = false`. RAM and CPU still report
  correctly; the recommendation falls to the CPU tiers.
- **Linux**: Both vendors supported. `rocm-smi` requires the ROCm runtime.

## Failure modes

- Both detection tools failing (or timing out after 5 seconds) is not an
  error. The tool returns `gpu.available: false` and falls through to the
  CPU-tier recommendation.
- If the OS refuses to report CPU or RAM for any reason, the tool returns
  `"Unknown"` / `0` rather than throwing.
