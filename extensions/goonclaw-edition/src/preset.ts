/**
 * GoonClaw quiet/loud preset — one-shot toggle of the opinionated "less
 * agent scaffolding in my chat bubble" configuration.
 *
 * Quiet mode:
 *   - Renames `<state>/workspace/BOOTSTRAP.md` to `BOOTSTRAP.md.off` so the
 *     per-turn "[Bootstrap pending]" preamble disappears.
 *   - Disables the `bootstrap-extra-files` internal hook (no more glob
 *     injection of workspace files into the prompt).
 *   - Disables the `session-memory` internal hook (no "[Pre-compaction
 *     memory flush]" preamble on /new or /reset).
 *
 * Loud mode: reverses each step. Idempotent in both directions — running
 * `quiet` twice is a no-op the second time.
 *
 * The config edits are applied by read-modify-write on the OpenClaw JSON
 * config file (`~/.openclaw/openclaw.json` by default). A backup is kept
 * at `openclaw.json.preset.bak` so a mistake is recoverable.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PresetMode = "quiet" | "loud";

export type PresetAction = {
  target: string;
  detail: string;
  applied: boolean;
  reason?: string;
};

export type PresetResult = {
  mode: PresetMode;
  stateDir: string;
  actions: PresetAction[];
  restartRequired: boolean;
};

const MANAGED_HOOKS = ["bootstrap-extra-files", "session-memory"] as const;
type ManagedHook = (typeof MANAGED_HOOKS)[number];

export type PresetDeps = {
  stateDir: string;
};

type HookEntry = {
  enabled?: boolean;
  [k: string]: unknown;
};

type HookConfig = {
  internal?: {
    enabled?: boolean;
    entries?: Record<string, HookEntry>;
  };
};

type OpenClawLike = {
  hooks?: HookConfig;
  [k: string]: unknown;
};

function bootstrapPaths(stateDir: string): { on: string; off: string } {
  const workspace = join(stateDir, "workspace");
  return {
    on: join(workspace, "BOOTSTRAP.md"),
    off: join(workspace, "BOOTSTRAP.md.off"),
  };
}

function configPath(stateDir: string): string {
  return join(stateDir, "openclaw.json");
}

function readConfigJson(path: string): OpenClawLike | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as OpenClawLike;
  } catch {
    return null;
  }
}

function writeConfigJson(path: string, value: OpenClawLike): void {
  // Keep a 1-deep backup so the previous state is recoverable. We overwrite
  // the same .preset.bak slot on each run rather than accumulating.
  const backup = `${path}.preset.bak`;
  try {
    if (existsSync(path)) {
      writeFileSync(backup, readFileSync(path, "utf-8"), "utf-8");
    }
  } catch {
    // best-effort; don't block the save on backup failure
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function setHookEnabled(cfg: OpenClawLike, id: ManagedHook, enabled: boolean): boolean {
  cfg.hooks = cfg.hooks ?? {};
  cfg.hooks.internal = cfg.hooks.internal ?? {};
  cfg.hooks.internal.entries = cfg.hooks.internal.entries ?? {};
  const prior = cfg.hooks.internal.entries[id];
  const priorEnabled = prior?.enabled !== false; // default-enabled for managed hooks
  if (priorEnabled === enabled) {
    return false;
  }
  cfg.hooks.internal.entries[id] = { ...prior, enabled };
  return true;
}

/**
 * Apply the preset. Returns a structured result describing every action the
 * function attempted, whether or not the filesystem state actually changed.
 * Never throws — filesystem errors are captured in the `reason` field of
 * the affected action so the caller can display them to the user.
 */
export function applyPreset(mode: PresetMode, deps: PresetDeps): PresetResult {
  const actions: PresetAction[] = [];
  const { stateDir } = deps;
  const bs = bootstrapPaths(stateDir);
  const cfgFile = configPath(stateDir);

  // Step 1: BOOTSTRAP.md rename
  if (mode === "quiet") {
    if (existsSync(bs.on)) {
      try {
        renameSync(bs.on, bs.off);
        actions.push({
          target: bs.on,
          detail: "renamed BOOTSTRAP.md -> BOOTSTRAP.md.off",
          applied: true,
        });
      } catch (err) {
        actions.push({
          target: bs.on,
          detail: "rename to BOOTSTRAP.md.off",
          applied: false,
          reason: (err as Error).message,
        });
      }
    } else {
      actions.push({
        target: bs.on,
        detail: "BOOTSTRAP.md already absent or disabled",
        applied: false,
        reason: "no-op",
      });
    }
  } else {
    if (existsSync(bs.off)) {
      try {
        renameSync(bs.off, bs.on);
        actions.push({
          target: bs.off,
          detail: "restored BOOTSTRAP.md.off -> BOOTSTRAP.md",
          applied: true,
        });
      } catch (err) {
        actions.push({
          target: bs.off,
          detail: "restore to BOOTSTRAP.md",
          applied: false,
          reason: (err as Error).message,
        });
      }
    } else {
      actions.push({
        target: bs.off,
        detail: "no BOOTSTRAP.md.off to restore",
        applied: false,
        reason: "no-op",
      });
    }
  }

  // Step 2: hook toggles
  const cfg = readConfigJson(cfgFile);
  if (!cfg) {
    actions.push({
      target: cfgFile,
      detail: "read openclaw.json",
      applied: false,
      reason: "config file missing or unreadable",
    });
    return { mode, stateDir, actions, restartRequired: actions.some((a) => a.applied) };
  }
  const targetEnabled = mode === "loud";
  let anyHookChanged = false;
  for (const hook of MANAGED_HOOKS) {
    const changed = setHookEnabled(cfg, hook, targetEnabled);
    actions.push({
      target: hook,
      detail: targetEnabled ? "hook enabled" : "hook disabled",
      applied: changed,
      reason: changed ? undefined : "already in desired state",
    });
    if (changed) {
      anyHookChanged = true;
    }
  }
  if (anyHookChanged) {
    try {
      writeConfigJson(cfgFile, cfg);
    } catch (err) {
      actions.push({
        target: cfgFile,
        detail: "write openclaw.json",
        applied: false,
        reason: (err as Error).message,
      });
      return { mode, stateDir, actions, restartRequired: false };
    }
  }

  const restartRequired = actions.some((a) => a.applied);
  return { mode, stateDir, actions, restartRequired };
}

/** Human-readable one-line summary suitable for a chat reply. */
export function summarizePresetResult(result: PresetResult): string {
  const applied = result.actions.filter((a) => a.applied);
  if (applied.length === 0) {
    return `GoonClaw already in ${result.mode} mode — no changes.`;
  }
  const lines = [
    `GoonClaw ${result.mode} mode applied — ${applied.length} change${applied.length === 1 ? "" : "s"}:`,
    ...applied.map((a) => `- ${a.detail}`),
  ];
  if (result.restartRequired) {
    lines.push("");
    lines.push("Restart the gateway to pick up the new config.");
  }
  return lines.join("\n");
}
