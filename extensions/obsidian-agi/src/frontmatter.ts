/** Pure helpers for building and reading Obsidian-flavoured frontmatter. */

export type NoteFrontmatter = {
  title: string;
  date: string;
  agent?: string;
  category?: string;
  tags?: string[];
};

function escapeYamlString(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function buildFrontmatter(fm: NoteFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${escapeYamlString(fm.title)}"`);
  lines.push(`date: ${fm.date}`);
  if (fm.agent) {
    lines.push(`agent: ${escapeYamlString(fm.agent)}`);
  }
  if (fm.category) {
    lines.push(`category: ${escapeYamlString(fm.category)}`);
  }
  if (fm.tags && fm.tags.length > 0) {
    const quoted = fm.tags.map((t) => `"${escapeYamlString(t)}"`).join(", ");
    lines.push(`tags: [${quoted}]`);
  }
  lines.push("---");
  return lines.join("\n");
}

/** Extract a single top-level frontmatter field by name. Returns null if absent. */
export function readFrontmatterField(content: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const block = content.match(/^---\n([\s\S]*?)\n---/);
  const haystack = block ? block[1] : content;
  const m = haystack?.match(re);
  if (!m) {
    return null;
  }
  let value = m[1]?.trim() ?? "";
  // Strip one pair of wrapping quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/** Extract all [[wiki-link]] targets from a note body. */
export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec pattern
  while ((m = re.exec(content)) !== null) {
    const target = m[1]?.trim();
    if (target && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}
