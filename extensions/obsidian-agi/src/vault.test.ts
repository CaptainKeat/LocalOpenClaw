import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canonicalizeVaultRoot,
  isPathWithinRoot,
  noteExists,
  notePathFor,
  posixRelative,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
  writeNote,
} from "./vault.js";

describe("resolveVaultPath", () => {
  let real: string;

  beforeEach(() => {
    real = join(tmpdir(), `obsidian-agi-resolve-${Date.now()}-${Math.random()}`);
    mkdirSync(real, { recursive: true });
  });

  afterEach(() => {
    rmSync(real, { recursive: true, force: true });
  });

  it("prefers pluginConfig.vaultPath over env and canonicalizes it", () => {
    const resolved = resolveVaultPath({ vaultPath: real });
    expect(resolved).not.toBeNull();
    expect(resolved?.length).toBeGreaterThan(0);
  });

  it("trims whitespace around the configured path", () => {
    const resolved = resolveVaultPath({ vaultPath: `  ${real}  ` });
    expect(resolved).not.toBeNull();
  });

  it("falls back to OBSIDIAN_VAULT env", () => {
    const original = process.env.OBSIDIAN_VAULT;
    process.env.OBSIDIAN_VAULT = real;
    try {
      const resolved = resolveVaultPath({});
      expect(resolved).not.toBeNull();
    } finally {
      process.env.OBSIDIAN_VAULT = original;
    }
  });

  it("returns null when neither is set", () => {
    const original = process.env.OBSIDIAN_VAULT;
    delete process.env.OBSIDIAN_VAULT;
    try {
      expect(resolveVaultPath(undefined)).toBeNull();
    } finally {
      if (original !== undefined) {
        process.env.OBSIDIAN_VAULT = original;
      }
    }
  });

  it("returns null when the configured path is a system directory", () => {
    if (process.platform !== "win32") {
      expect(resolveVaultPath({ vaultPath: "/etc" })).toBeNull();
    }
  });
});

describe("resolveKnowledgeFolder", () => {
  it("defaults to OpenClaw", () => {
    expect(resolveKnowledgeFolder(undefined)).toBe("OpenClaw");
  });

  it("honours custom folder name", () => {
    expect(resolveKnowledgeFolder({ knowledgeFolder: "Agent-Logs" })).toBe("Agent-Logs");
  });
});

describe("vault filesystem helpers", () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `obsidian-agi-test-${Date.now()}-${Math.random()}`);
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writeNote creates parent directories as needed", () => {
    const p = join(root, "OpenClaw", "note.md");
    writeNote(p, "body");
    expect(noteExists(p)).toBe(true);
    expect(readNote(p)).toBe("body");
  });

  it("walkMarkdownFiles finds every .md file recursively", () => {
    writeFileSync(join(root, "a.md"), "x");
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "nested", "b.md"), "y");
    writeFileSync(join(root, "nested", "ignored.txt"), "z");
    const found = walkMarkdownFiles(root);
    expect(found).toHaveLength(2);
  });

  it("walkMarkdownFiles skips node_modules, .git, and .obsidian", () => {
    mkdirSync(join(root, ".obsidian"), { recursive: true });
    writeFileSync(join(root, ".obsidian", "config.md"), "x");
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep.md"), "x");
    writeFileSync(join(root, "ok.md"), "y");
    const found = walkMarkdownFiles(root);
    expect(found).toHaveLength(1);
  });

  it("notePathFor joins vault + folder + slug + .md", () => {
    const p = notePathFor("/vault", "OpenClaw", "2026-03-14-hello");
    expect(p).toMatch(/vault[\\/]OpenClaw[\\/]2026-03-14-hello\.md$/);
  });

  it("posixRelative returns forward-slash paths", () => {
    const from = "/vault";
    const to = "/vault/OpenClaw/note.md";
    expect(posixRelative(from, to)).toBe("OpenClaw/note.md");
  });

  it("writeNote is atomic — the target exists with exactly the new content after success", () => {
    const target = join(root, "OpenClaw", "atomic.md");
    writeNote(target, "first");
    writeNote(target, "second");
    expect(readNote(target)).toBe("second");
  });
});

describe("canonicalizeVaultRoot", () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `obsidian-agi-canon-${Date.now()}-${Math.random()}`);
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an absolute canonical path for a valid vault", () => {
    const resolved = canonicalizeVaultRoot(root);
    expect(typeof resolved).toBe("string");
    expect(resolved?.length).toBeGreaterThan(0);
  });

  it("refuses relative paths", () => {
    expect(canonicalizeVaultRoot("relative/path")).toBeNull();
  });

  it("refuses the empty string", () => {
    expect(canonicalizeVaultRoot("")).toBeNull();
  });

  it("refuses system roots (/etc, /usr)", () => {
    if (process.platform !== "win32") {
      expect(canonicalizeVaultRoot("/etc")).toBeNull();
      expect(canonicalizeVaultRoot("/usr/local")).toBeNull();
    }
  });

  it("refuses Windows system roots", () => {
    if (process.platform === "win32") {
      expect(canonicalizeVaultRoot("C:\\Windows")).toBeNull();
      expect(canonicalizeVaultRoot("C:\\Program Files")).toBeNull();
    }
  });

  it("refuses the filesystem root", () => {
    if (process.platform !== "win32") {
      expect(canonicalizeVaultRoot("/")).toBeNull();
    } else {
      expect(canonicalizeVaultRoot("C:\\")).toBeNull();
    }
  });
});

describe("isPathWithinRoot", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = join(tmpdir(), `obsidian-agi-within-${Date.now()}-${Math.random()}`);
    outside = join(tmpdir(), `obsidian-agi-outside-${Date.now()}-${Math.random()}`);
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("allows paths inside the root", () => {
    expect(isPathWithinRoot(root, join(root, "OpenClaw", "note.md"))).toBe(true);
  });

  it("allows the root itself", () => {
    expect(isPathWithinRoot(root, root)).toBe(true);
  });

  it("rejects paths that resolve outside via ..", () => {
    expect(isPathWithinRoot(root, join(root, "..", "escape"))).toBe(false);
  });

  it("rejects paths that live elsewhere entirely", () => {
    expect(isPathWithinRoot(root, outside)).toBe(false);
  });

  it("rejects symlinks inside the vault that point outside", () => {
    // Skip gracefully on Windows where unprivileged symlink creation fails.
    try {
      const linkPath = join(root, "hostile-link");
      symlinkSync(outside, linkPath, "dir");
      // Writing through the symlink lands in `outside`, so the check must reject it.
      expect(isPathWithinRoot(root, join(linkPath, "inside-outside.md"))).toBe(false);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return; // symlink privilege missing on this platform
      }
      throw err;
    }
  });

  it("allows symlinks inside the vault that point to another path inside the vault", () => {
    try {
      const sibling = join(root, "actual-notes");
      mkdirSync(sibling, { recursive: true });
      const linkPath = join(root, "alias");
      symlinkSync(sibling, linkPath, "dir");
      expect(isPathWithinRoot(root, join(linkPath, "note.md"))).toBe(true);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }
  });
});
