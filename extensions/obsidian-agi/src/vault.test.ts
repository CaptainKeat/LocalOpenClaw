import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
  it("prefers pluginConfig.vaultPath", () => {
    expect(resolveVaultPath({ vaultPath: "/foo" })).toBe("/foo");
  });

  it("trims whitespace", () => {
    expect(resolveVaultPath({ vaultPath: "  /bar  " })).toBe("/bar");
  });

  it("falls back to OBSIDIAN_VAULT env", () => {
    const original = process.env.OBSIDIAN_VAULT;
    process.env.OBSIDIAN_VAULT = "/env-path";
    try {
      expect(resolveVaultPath({})).toBe("/env-path");
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
});
