/**
 * Score existing notes by keyword overlap with a new entry. Pure function —
 * plain `.includes()` substring match against lowercased content, no FTS.
 */

export type RelatedNote = {
  /** Basename of the note without `.md`. */
  name: string;
  /** POSIX-style path relative to the vault, without `.md`. Suitable for `[[...]]` links. */
  path: string;
  /** Raw match count. */
  score: number;
};

export type CandidateNote = {
  name: string;
  /** POSIX path relative to vault, without `.md`. */
  path: string;
  /** Full content of the note for keyword scanning. */
  content: string;
};

export function findRelated(
  candidates: CandidateNote[],
  keywords: string[],
  options: { max?: number; exclude?: Set<string> } = {},
): RelatedNote[] {
  const max = options.max ?? 5;
  const exclude = options.exclude ?? new Set<string>();
  const kws = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 1);
  if (kws.length === 0) {
    return [];
  }
  const scored: RelatedNote[] = [];
  for (const candidate of candidates) {
    if (exclude.has(candidate.name) || candidate.name === "Index") {
      continue;
    }
    const haystack = candidate.content.toLowerCase();
    let matchCount = 0;
    for (const kw of kws) {
      if (haystack.includes(kw)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      scored.push({ name: candidate.name, path: candidate.path, score: matchCount });
    }
  }
  return scored.toSorted((a, b) => b.score - a.score).slice(0, max);
}
