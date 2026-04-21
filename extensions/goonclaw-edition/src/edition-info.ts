/** Pure helpers describing the GoonClaw edition. */

export type BundledPlugin = {
  id: string;
  title: string;
  docs: string;
  summary: string;
};

export const GOONCLAW_EDITION_VERSION = "2026.4.20";

export const GOONCLAW_BUNDLED_PLUGINS: readonly BundledPlugin[] = [
  {
    id: "hardware-info",
    title: "Hardware Info",
    docs: "docs/tools/hardware-info.md",
    summary: "CPU / RAM / GPU inventory and local-model tier recommendations.",
  },
  {
    id: "obsidian-agi",
    title: "Obsidian Knowledge Graph",
    docs: "docs/tools/obsidian-agi.md",
    summary: "knowledge_log / _search / _recall / _summary tools over an Obsidian vault.",
  },
] as const;

export type EditionInfo = {
  edition: "GoonClaw";
  version: string;
  bundledPlugins: readonly BundledPlugin[];
  personasDoc: string;
  upstream: string;
};

export function describeEdition(): EditionInfo {
  return {
    edition: "GoonClaw",
    version: GOONCLAW_EDITION_VERSION,
    bundledPlugins: GOONCLAW_BUNDLED_PLUGINS,
    personasDoc: "docs/goonclaw-personas.md",
    upstream: "https://github.com/openclaw/openclaw",
  };
}

/** Multi-line human-readable rendering suitable for the CLI and chat. */
export function renderEditionText(): string {
  const info = describeEdition();
  const lines: string[] = [
    `🦞 ${info.edition} edition — v${info.version} (built on OpenClaw)`,
    "",
    "Bundled plugins:",
    ...info.bundledPlugins.map((p) => `  • ${p.title} (${p.id}) — ${p.summary}`),
    ...info.bundledPlugins.map((p) => `    docs: ${p.docs}`),
    "",
    `Personas preset: ${info.personasDoc}`,
    `Upstream: ${info.upstream}`,
    "",
    "Brand override: set OPENCLAW_BRAND_NAME to change the CLI banner label.",
  ];
  return lines.join("\n");
}
