/** Pure helpers for turning text into filename-safe slugs and keyword sets. */

// Case-insensitive Windows reserved device names. Writing a file whose stem
// matches one of these fails on Windows with an I/O error that's hard to
// diagnose from the agent side. Prefix with `_` to sidestep.
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function slugify(text: string, maxLen = 60): string {
  const base = text
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .substring(0, maxLen)
    .replace(/-+$/, "");
  if (!base) {
    return base;
  }
  // Leading-segment check so "con-something" is fine but bare "con" gets
  // escaped. This matches how Windows interprets the stem before the first
  // dot or separator.
  const head = base.split(".", 1)[0] ?? base;
  if (WINDOWS_RESERVED_NAMES.has(head)) {
    return `_${base}`;
  }
  return base;
}

/**
 * Extract word-ish keywords from a chunk of text.
 * Only words 4 chars and up, lowercased, de-duplicated.
 */
export function extractKeywords(text: string, limit = 10): string[] {
  const matches = text.match(/\b[a-zA-Z][a-zA-Z0-9_-]{3,}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of matches) {
    const w = word.toLowerCase();
    if (seen.has(w)) {
      continue;
    }
    seen.add(w);
    out.push(w);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/** Build a timestamp-prefixed slug for a note filename. */
export function makeDatedSlug(title: string, now: Date): string {
  const iso = now.toISOString();
  const datePart = iso.slice(0, 10);
  return `${datePart}-${slugify(title)}`;
}
