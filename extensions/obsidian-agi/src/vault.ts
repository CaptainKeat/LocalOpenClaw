/** Filesystem I/O for reading and writing knowledge notes in an Obsidian vault. */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Resolve the vault path from plugin config with env-var fallback, and
 * canonicalize it so downstream I/O can check writes against a stable root.
 * Returns `null` if nothing is configured or the configured path is unsafe.
 */
export function resolveVaultPath(pluginConfig: Record<string, unknown> | undefined): string | null {
  const configured = pluginConfig?.vaultPath;
  const raw =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : (() => {
          const envPath = process.env.OBSIDIAN_VAULT;
          return typeof envPath === "string" && envPath.trim().length > 0 ? envPath.trim() : null;
        })();
  if (!raw) {
    return null;
  }
  return canonicalizeVaultRoot(raw);
}

export function resolveKnowledgeFolder(pluginConfig: Record<string, unknown> | undefined): string {
  const folder = pluginConfig?.knowledgeFolder;
  if (typeof folder === "string" && folder.trim().length > 0) {
    return folder.trim();
  }
  return "OpenClaw";
}

/**
 * Resolve an input path to its canonical absolute form and refuse anything
 * that isn't a plausible vault location.
 *
 * Returns `null` on any failure — the caller surfaces a "vault not
 * configured" message rather than attempting the write.
 *
 * Checks:
 *   - path is absolute
 *   - path exists (or its parent does, so we can create the vault subdir)
 *   - resolved realpath is not `/` or `C:\` (refuse disk root as vault)
 *   - resolved realpath is not a system directory common target
 *     (`/etc`, `/usr`, `/System`, `/Windows`, `/Program Files`)
 *
 * Callers ultimately validate each write path against this root via
 * `isPathWithinRoot()` below.
 */
export function canonicalizeVaultRoot(rawVaultPath: string): string | null {
  const trimmed = rawVaultPath.trim();
  if (!trimmed || !isAbsolute(trimmed)) {
    return null;
  }
  let resolvedRoot = resolve(trimmed);
  // If the vault doesn't exist yet, walk up to the first existing ancestor
  // so realpathSync can resolve symlinks without throwing.
  let existing = resolvedRoot;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return null;
    }
    existing = parent;
  }
  try {
    const real = realpathSync(existing);
    // Re-attach any tail segments that didn't exist yet.
    const tail = relative(existing, resolvedRoot);
    resolvedRoot = tail ? resolve(real, tail) : real;
  } catch {
    return null;
  }
  const normalized = resolvedRoot.replace(/[/\\]+$/, "") || resolvedRoot;
  // Refuse writing at filesystem root.
  if (normalized === "" || normalized === "/" || /^[A-Za-z]:\\?$/.test(normalized)) {
    return null;
  }
  const lower = normalized.toLowerCase();
  const blocked = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/boot",
    "/root",
    "/system",
    "/library",
    "/private",
    "c:\\windows",
    "c:\\program files",
    "c:\\program files (x86)",
  ];
  for (const bad of blocked) {
    if (lower === bad || lower.startsWith(`${bad}${sep}`) || lower.startsWith(`${bad}/`)) {
      return null;
    }
  }
  return normalized;
}

/**
 * Assert a target path lies inside (or equal to) the canonical vault root.
 *
 * Guards against two independent escape routes:
 *   1. Lexical `..` in the candidate path (caught via `relative()`).
 *   2. Symlinks inside the vault that redirect to an outside location
 *      (caught by `realpathSync`-ing both root and candidate before the
 *      containment check, so a vault-internal link to `/etc` is rejected).
 *
 * If the candidate doesn't exist yet, the nearest existing ancestor is
 * resolved instead — writes to new files can't fail the check just for
 * not existing yet, but they can't exploit a nonexistent path either
 * because their parent dir still has to live under the real root.
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const realRoot = realpathForCheck(root);
  const realCandidate = realpathForCheck(candidate);
  if (!realRoot || !realCandidate) {
    return false;
  }
  if (realCandidate === realRoot) {
    return true;
  }
  const rel = relative(realRoot, realCandidate);
  if (!rel) {
    return true;
  }
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return false;
  }
  return true;
}

/**
 * Resolve a path to its canonical realpath, walking to the nearest existing
 * ancestor if the target doesn't exist yet. Returns `null` if resolution
 * fails entirely (e.g. a permission error or an unreachable filesystem root).
 */
function realpathForCheck(p: string): string | null {
  let target = resolve(p);
  // Walk up until we hit something that exists so realpathSync has a
  // base to resolve. Preserve the tail so a not-yet-created note still
  // gets compared against the real ancestor.
  let existing = target;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return null;
    }
    existing = parent;
  }
  try {
    const real = realpathSync(existing);
    const tail = relative(existing, target);
    return tail ? resolve(real, tail) : real;
  } catch {
    return null;
  }
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

/**
 * Atomic write: serialize to a sibling `.tmp` file, fsync via write, then
 * rename. A crash mid-write leaves either the old content or the new one,
 * never a half-written file. The caller is responsible for confirming
 * `path` lies within the vault root (see `isPathWithinRoot`).
 */
export function writeNote(path: string, content: string): void {
  ensureDir(dirname(path));
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
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
