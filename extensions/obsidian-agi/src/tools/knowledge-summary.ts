import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { extractWikiLinks, readFrontmatterField } from "../frontmatter.js";
import {
  modTime,
  noteBasename,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
} from "../vault.js";

const Schema = Type.Object(
  {
    days: Type.Optional(
      Type.Number({
        description: "Treat notes modified within the last N days as 'recent'. Default 7.",
        minimum: 1,
        maximum: 3650,
      }),
    ),
  },
  { additionalProperties: false },
);

type Params = { days?: unknown };

export function createKnowledgeSummaryTool(api: OpenClawPluginApi) {
  return {
    name: "knowledge_summary",
    label: "Knowledge Summary",
    description:
      "Summarize the Obsidian knowledge graph: total notes, recent activity count, category/agent breakdown, and the most-linked notes.",
    parameters: Schema,
    async execute(_toolCallId: string, rawParams: Params) {
      const days =
        typeof rawParams.days === "number" && rawParams.days > 0
          ? Math.min(Math.floor(rawParams.days), 3650)
          : 7;

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
      const files = walkMarkdownFiles(join(vaultPath, knowledgeFolder));

      const cutoff = new Date(Date.now() - days * 86_400_000);
      const categories: Record<string, number> = {};
      const agents: Record<string, number> = {};
      const linkCounts: Record<string, number> = {};
      let recentCount = 0;
      let total = 0;

      for (const file of files) {
        const base = noteBasename(file);
        if (base === "Index") {
          continue;
        }
        let content: string;
        try {
          content = readNote(file);
        } catch {
          continue;
        }
        total++;
        const cat = readFrontmatterField(content, "category") ?? "unknown";
        categories[cat] = (categories[cat] ?? 0) + 1;
        const agent = readFrontmatterField(content, "agent") ?? "unknown";
        agents[agent] = (agents[agent] ?? 0) + 1;
        linkCounts[base] = extractWikiLinks(content).length;
        const m = modTime(file);
        if (m && m > cutoff) {
          recentCount++;
        }
      }

      const mostConnected = Object.entries(linkCounts)
        .toSorted(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([note, links]) => ({ note, links }));

      const payload = { total, recentCount, days, categories, agents, mostConnected };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
