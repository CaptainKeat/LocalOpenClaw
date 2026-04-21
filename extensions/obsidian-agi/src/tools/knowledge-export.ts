import { dirname } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { buildFrontmatter } from "../frontmatter.js";
import { findRelated } from "../related.js";
import { extractKeywords, makeDatedSlug, slugify } from "../slug.js";
import {
  ensureDir,
  isPathWithinRoot,
  notePathFor,
  posixRelative,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
  writeNote,
} from "../vault.js";

const EntrySchema = Type.Object(
  {
    title: Type.String({ description: "Short title for this entry." }),
    content: Type.String({ description: "Body content (Markdown allowed)." }),
    category: Type.Optional(Type.String({ description: "Frontmatter category." })),
    tags: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

const Schema = Type.Object(
  {
    entries: Type.Array(EntrySchema, {
      description:
        "Ordered list of entries to export. Each becomes a single knowledge note, linked forward/backward to the neighbours in this batch and sideways to keyword-related past notes.",
      minItems: 1,
    }),
    agent: Type.Optional(
      Type.String({ description: "Agent identifier recorded in each note's frontmatter." }),
    ),
    batchLabel: Type.Optional(
      Type.String({
        description: "Optional batch name used to prefix slugs (e.g. 'session-2026-04-21').",
      }),
    ),
  },
  { additionalProperties: false },
);

type ExportParams = {
  entries?: unknown;
  agent?: unknown;
  batchLabel?: unknown;
};

type NormalizedEntry = {
  title: string;
  content: string;
  category: string;
  tags: string[];
};

function normalizeEntries(raw: unknown): NormalizedEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: NormalizedEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    if (!title || !content) {
      continue;
    }
    const category =
      typeof entry.category === "string" && entry.category.trim().length > 0
        ? entry.category.trim()
        : "session";
    const rawTags = Array.isArray(entry.tags) ? entry.tags : [];
    const tags = rawTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    out.push({ title, content, category, tags });
  }
  return out;
}

export function createKnowledgeExportTool(api: OpenClawPluginApi) {
  return {
    name: "knowledge_export",
    label: "Knowledge Export",
    description:
      "Write a batch of entries to the Obsidian vault as chronologically-linked knowledge notes. Each note links forward/backward to its neighbours in the batch and sideways to any keyword-related past notes.",
    parameters: Schema,
    async execute(_toolCallId: string, rawParams: ExportParams) {
      const entries = normalizeEntries(rawParams.entries);
      if (entries.length === 0) {
        throw new Error("entries required (non-empty array of {title, content})");
      }
      const agent =
        typeof rawParams.agent === "string" && rawParams.agent.trim().length > 0
          ? rawParams.agent.trim()
          : "manual";
      const batchLabel =
        typeof rawParams.batchLabel === "string" && rawParams.batchLabel.trim().length > 0
          ? slugify(rawParams.batchLabel, 40)
          : undefined;

      const vaultPath = resolveVaultPath(api.pluginConfig);
      if (!vaultPath) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Obsidian vault not configured. Set pluginConfig.vaultPath or OBSIDIAN_VAULT.",
            },
          ],
        };
      }
      const knowledgeFolder = resolveKnowledgeFolder(api.pluginConfig);

      // Snapshot existing notes once so all batch entries share the same
      // "past notes" view for related-note scoring.
      const existing = walkMarkdownFiles(`${vaultPath}/${knowledgeFolder}`)
        .map((path) => {
          try {
            return {
              name: path.replace(/.*[\\/]/, "").replace(/\.md$/, ""),
              path: posixRelative(vaultPath, path).replace(/\.md$/, ""),
              content: readNote(path),
            };
          } catch {
            return null;
          }
        })
        .filter((c): c is { name: string; path: string; content: string } => c !== null);

      // Two passes: first compute every slug so forward-links can reference
      // entries not yet written; then write them with full cross-links.
      const base = new Date();
      const slugs: string[] = entries.map((entry, i) => {
        const stepped = new Date(base.getTime() + i * 1000);
        const prefix = batchLabel ? `${batchLabel}-${String(i + 1).padStart(2, "0")}-` : "";
        const datedSlug = makeDatedSlug(entry.title, stepped);
        return `${prefix}${datedSlug}`;
      });

      const batchNames = new Set(slugs);
      const written: Array<{ slug: string; path: string; relatedNotes: number }> = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const slug = slugs[i];
        if (!entry || !slug) {
          continue;
        }
        const stepped = new Date(base.getTime() + i * 1000);
        const timestamp = stepped.toISOString();

        const kws = [
          ...new Set([...extractKeywords(entry.title, 10), ...extractKeywords(entry.content, 10)]),
        ];
        const related = findRelated(existing, kws, {
          exclude: new Set([...batchNames, slug]),
        });

        const finalTags = [...new Set<string>([entry.category, ...entry.tags.map(slugify)])];
        const frontmatter = buildFrontmatter({
          title: entry.title,
          date: timestamp,
          agent,
          category: entry.category,
          tags: finalTags,
        });

        const neighbourLinks: string[] = [];
        if (i > 0) {
          const prev = slugs[i - 1];
          if (prev) {
            neighbourLinks.push(`← Previous: [[${knowledgeFolder}/${prev}]]`);
          }
        }
        if (i < entries.length - 1) {
          const next = slugs[i + 1];
          if (next) {
            neighbourLinks.push(`→ Next: [[${knowledgeFolder}/${next}]]`);
          }
        }

        const relatedBlock =
          related.length > 0
            ? [
                "",
                "### Related Knowledge",
                ...related.map((r) => `- [[${r.path}|${r.name}]]`),
              ].join("\n")
            : "";
        const neighbourBlock =
          neighbourLinks.length > 0 ? ["", "### Session Flow", ...neighbourLinks].join("\n") : "";
        const hashtags = finalTags.map((t) => `#${t}`).join(" ");

        const body = [
          frontmatter,
          "",
          `## ${entry.title}`,
          "",
          entry.content,
          neighbourBlock,
          relatedBlock,
          "",
          "---",
          hashtags,
          "",
        ]
          .filter((s) => s !== "")
          .join("\n");

        const notePath = notePathFor(vaultPath, knowledgeFolder, slug);
        if (!isPathWithinRoot(vaultPath, notePath)) {
          // Skip this entry rather than aborting the whole batch — one bad
          // slug shouldn't lose the user their other entries.
          continue;
        }
        ensureDir(dirname(notePath));
        writeNote(notePath, body);
        written.push({
          slug,
          path: posixRelative(vaultPath, notePath),
          relatedNotes: related.length,
        });
      }

      const payload = {
        count: written.length,
        knowledgeFolder,
        batchLabel: batchLabel ?? null,
        notes: written,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
