import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { extractWikiLinks, readFrontmatterField } from "../frontmatter.js";
import {
  noteBasename,
  posixRelative,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
} from "../vault.js";

const Schema = Type.Object(
  {
    query: Type.String({
      description: "Keyword query. Whitespace-separated terms are AND-OR scored.",
    }),
    category: Type.Optional(
      Type.String({ description: "Filter results by frontmatter category." }),
    ),
    maxResults: Type.Optional(
      Type.Number({
        description: "Maximum results (default 10).",
        minimum: 1,
        maximum: 50,
      }),
    ),
  },
  { additionalProperties: false },
);

type Params = {
  query?: unknown;
  category?: unknown;
  maxResults?: unknown;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createKnowledgeSearchTool(api: OpenClawPluginApi) {
  return {
    name: "knowledge_search",
    label: "Knowledge Search",
    description:
      "Search the Obsidian knowledge graph for past entries by keyword. Returns ranked matches with titles, categories, previews, and outgoing wiki-links.",
    parameters: Schema,
    async execute(_toolCallId: string, rawParams: Params) {
      if (typeof rawParams.query !== "string" || rawParams.query.trim().length === 0) {
        throw new Error("query required");
      }
      const query = rawParams.query.trim();
      const categoryFilter =
        typeof rawParams.category === "string" && rawParams.category.trim().length > 0
          ? rawParams.category.trim()
          : null;
      const max =
        typeof rawParams.maxResults === "number" && rawParams.maxResults > 0
          ? Math.min(Math.floor(rawParams.maxResults), 50)
          : 10;

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
      const files = walkMarkdownFiles(`${vaultPath}/${knowledgeFolder}`);
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .map(escapeRegex);

      type Hit = {
        file: string;
        title: string;
        date: string | null;
        category: string | null;
        score: number;
        links: string[];
        preview: string;
      };
      const hits: Hit[] = [];

      for (const file of files) {
        if (noteBasename(file) === "Index") {
          continue;
        }
        let content: string;
        try {
          content = readNote(file);
        } catch {
          continue;
        }
        const category = readFrontmatterField(content, "category");
        if (categoryFilter && category !== categoryFilter) {
          continue;
        }
        const lowered = content.toLowerCase();
        let score = 0;
        for (const term of terms) {
          const matches = lowered.match(new RegExp(term, "g"));
          score += matches?.length ?? 0;
        }
        if (score === 0) {
          continue;
        }
        const title = readFrontmatterField(content, "title") ?? noteBasename(file);
        const date = readFrontmatterField(content, "date");
        const preview = content
          .replace(/^---[\s\S]*?---\n?/, "")
          .trim()
          .slice(0, 200);
        const links = extractWikiLinks(content).slice(0, 5);
        hits.push({
          file: posixRelative(vaultPath, file),
          title,
          date,
          category,
          score,
          links,
          preview,
        });
      }

      hits.sort((a, b) => b.score - a.score);
      const limited = hits.slice(0, max);
      const payload = { results: limited, total: hits.length };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
