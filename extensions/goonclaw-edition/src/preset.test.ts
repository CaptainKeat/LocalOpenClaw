import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPreset, summarizePresetResult } from "./preset.js";

describe("applyPreset", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = join(tmpdir(), `goonclaw-preset-${Date.now()}-${Math.random()}`);
    mkdirSync(join(stateDir, "workspace"), { recursive: true });
    writeFileSync(
      join(stateDir, "openclaw.json"),
      JSON.stringify({ hooks: { internal: { enabled: true, entries: {} } } }, null, 2),
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  describe("quiet", () => {
    it("renames BOOTSTRAP.md and disables the two noisy hooks", () => {
      writeFileSync(join(stateDir, "workspace", "BOOTSTRAP.md"), "# bootstrap", "utf-8");
      const result = applyPreset("quiet", { stateDir });
      expect(result.mode).toBe("quiet");
      expect(result.restartRequired).toBe(true);

      const bootstrapAction = result.actions.find((a) => a.detail.includes("BOOTSTRAP.md.off"));
      expect(bootstrapAction?.applied).toBe(true);

      const hookChanges = result.actions.filter((a) => a.detail === "hook disabled" && a.applied);
      expect(hookChanges.map((a) => a.target).toSorted()).toEqual([
        "bootstrap-extra-files",
        "session-memory",
      ]);

      const cfg = JSON.parse(readFileSync(join(stateDir, "openclaw.json"), "utf-8"));
      expect(cfg.hooks.internal.entries["bootstrap-extra-files"].enabled).toBe(false);
      expect(cfg.hooks.internal.entries["session-memory"].enabled).toBe(false);
    });

    it("is idempotent — running twice is a no-op the second time", () => {
      writeFileSync(join(stateDir, "workspace", "BOOTSTRAP.md"), "# bootstrap", "utf-8");
      const first = applyPreset("quiet", { stateDir });
      expect(first.actions.some((a) => a.applied)).toBe(true);

      const second = applyPreset("quiet", { stateDir });
      const secondApplied = second.actions.filter((a) => a.applied);
      expect(secondApplied).toEqual([]);
      expect(second.restartRequired).toBe(false);
    });

    it("reports missing config file cleanly instead of throwing", () => {
      rmSync(join(stateDir, "openclaw.json"));
      const result = applyPreset("quiet", { stateDir });
      const missingConfig = result.actions.find((a) => a.reason?.includes("config file missing"));
      expect(missingConfig).toBeDefined();
    });
  });

  describe("loud", () => {
    it("restores BOOTSTRAP.md and re-enables the hooks", () => {
      // Set up the post-quiet state: renamed file + disabled hooks
      writeFileSync(join(stateDir, "workspace", "BOOTSTRAP.md.off"), "# bootstrap", "utf-8");
      writeFileSync(
        join(stateDir, "openclaw.json"),
        JSON.stringify(
          {
            hooks: {
              internal: {
                entries: {
                  "bootstrap-extra-files": { enabled: false },
                  "session-memory": { enabled: false },
                },
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = applyPreset("loud", { stateDir });
      expect(result.mode).toBe("loud");
      expect(result.restartRequired).toBe(true);

      const restored = result.actions.find((a) => a.detail.includes("BOOTSTRAP.md"));
      expect(restored?.applied).toBe(true);

      const cfg = JSON.parse(readFileSync(join(stateDir, "openclaw.json"), "utf-8"));
      expect(cfg.hooks.internal.entries["bootstrap-extra-files"].enabled).toBe(true);
      expect(cfg.hooks.internal.entries["session-memory"].enabled).toBe(true);
    });

    it("is idempotent", () => {
      const first = applyPreset("loud", { stateDir });
      const second = applyPreset("loud", { stateDir });
      expect(second.actions.filter((a) => a.applied)).toEqual([]);
      expect(second.restartRequired).toBe(false);
      // Suppress unused-var lint by asserting a weak truth on first.
      expect(first.mode).toBe("loud");
    });
  });

  describe("summarizePresetResult", () => {
    it("says 'already in X mode' when nothing changed", () => {
      const result = applyPreset("loud", { stateDir });
      const summary = summarizePresetResult(result);
      expect(summary).toContain("already in loud mode");
    });

    it("lists the applied actions when changes occurred", () => {
      writeFileSync(join(stateDir, "workspace", "BOOTSTRAP.md"), "x", "utf-8");
      const result = applyPreset("quiet", { stateDir });
      const summary = summarizePresetResult(result);
      expect(summary).toContain("quiet mode applied");
      expect(summary).toContain("BOOTSTRAP.md");
      expect(summary).toContain("Restart the gateway");
    });
  });
});
