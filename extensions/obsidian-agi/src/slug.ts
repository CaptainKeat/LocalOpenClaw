/** Pure helpers for turning text into filename-safe slugs and keyword sets. */

export function slugify(text: string, maxLen = 60): string {
  return text
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .substring(0, maxLen)
    .replace(/-+$/, "");
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
