import { dirname } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { buildFrontmatter } from "../frontmatter.js";
import { findRelated } from "../related.js";
import { extractKeywords, makeDatedSlug, slugify } from "../slug.js";
import {
  ensureDir,
  notePathFor,
  posixRelative,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
  writeNote,
} from "../vault.js";

const Schema = Type.Object(
  {
    title: Type.String({ description: "Short title for this knowledge entry." }),
    content: Type.String({ description: "Detailed description of what was learned or decided." }),
    category: Type.Optional(
      Type.String({
        description: "Category tag. Common values: learning, decision, insight, pattern, error.",
      }),
    ),
    tags: Type.Optional(
      Type.Array(Type.String(), { description: "Optional tags for grouping in Obsidian." }),
    ),
    agent: Type.Optional(
      Type.String({ description: "Agent identifier recorded in the frontmatter." }),
    ),
  },
  { additionalProperties: false },
);

type Params = {
  title?: unknown;
  content?: unknown;
  category?: unknown;
  tags?: unknown;
  agent?: unknown;
};

function readString(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

export function createKnowledgeLogTool(api: OpenClawPluginApi) {
  return {
    name: "knowledge_log",
    label: "Knowledge Log",
    description:
      "Record a learning, decision, or insight as a Markdown note in the configured Obsidian vault. Links to related past entries by keyword overlap.",
    parameters: Schema,
    async execute(_toolCallId: string, rawParams: Params) {
      const title = readString(rawParams.title);
      if (!title) {
        throw new Error("title required");
      }
      const content = readString(rawParams.content);
      if (!content) {
        throw new Error("content required");
      }
      const category = readString(rawParams.category, "learning");
      const agent = readString(rawParams.agent, "manual");
      const tags = readStringArray(rawParams.tags);

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
      const now = new Date();
      const timestamp = now.toISOString();
      const slug = makeDatedSlug(title, now);

      // Find related existing notes by keyword overlap
      const keywords = [
        ...new Set([...extractKeywords(title, 10), ...extractKeywords(content, 10)]),
      ];
      const candidates = walkMarkdownFiles(`${vaultPath}/${knowledgeFolder}`)
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
      const related = findRelated(candidates, keywords, { exclude: new Set([slug]) });

      // Assemble the markdown
      const finalTags = [...new Set<string>([category, ...tags.map(slugify)])];
      const frontmatter = buildFrontmatter({
        title,
        date: timestamp,
        agent,
        category,
        tags: finalTags,
      });
      const relatedBlock =
        related.length > 0
          ? ["", "### Related Knowledge", ...related.map((r) => `- [[${r.path}|${r.name}]]`)].join(
              "\n",
            )
          : "";
      const hashtags = finalTags.map((t) => `#${t}`).join(" ");
      const body = [
        frontmatter,
        "",
        `## ${title}`,
        "",
        content,
        relatedBlock,
        "",
        "---",
        hashtags,
        "",
      ]
        .filter((s) => s !== "")
        .join("\n");

      const notePath = notePathFor(vaultPath, knowledgeFolder, slug);
      ensureDir(dirname(notePath));
      writeNote(notePath, body);

      const payload = {
        path: posixRelative(vaultPath, notePath),
        slug,
        title,
        relatedNotes: related.length,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
