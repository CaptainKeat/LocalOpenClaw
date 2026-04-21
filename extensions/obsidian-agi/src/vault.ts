/** Filesystem I/O for reading and writing knowledge notes in an Obsidian vault. */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/** Resolve the vault path from plugin config with env-var fallback. */
export function resolveVaultPath(pluginConfig: Record<string, unknown> | undefined): string | null {
  const configured = pluginConfig?.vaultPath;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  const envPath = process.env.OBSIDIAN_VAULT;
  if (typeof envPath === "string" && envPath.trim().length > 0) {
    return envPath.trim();
  }
  return null;
}

export function resolveKnowledgeFolder(pluginConfig: Record<string, unknown> | undefined): string {
  const folder = pluginConfig?.knowledgeFolder;
  if (typeof folder === "string" && folder.trim().length > 0) {
    return folder.trim();
  }
  return "OpenClaw";
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Walk a directory tree returning absolute paths of every *.md file. */
export function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  const skipNames = new Set([".obsidian", "node_modules", ".git"]);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    try {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (skipNames.has(entry.name)) {
          continue;
        }
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          out.push(full);
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }
  return out;
}

export function readNote(path: string): string {
  return readFileSync(path, "utf-8");
}

export function writeNote(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf-8");
}

export function noteExists(path: string): boolean {
  return existsSync(path);
}

export function notePathFor(vaultPath: string, knowledgeFolder: string, slug: string): string {
  return join(vaultPath, knowledgeFolder, `${slug}.md`);
}

/** Return a POSIX-style relative path ("a/b/c.md"), suitable for wiki-links. */
export function posixRelative(from: string, to: string): string {
  return relative(from, to).replace(/\\/g, "/");
}

/** Return file modification time as a Date, or null if unreadable. */
export function modTime(path: string): Date | null {
  try {
    return statSync(path).mtime;
  } catch {
    return null;
  }
}

export function noteBasename(path: string): string {
  return basename(path, ".md");
}
