import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { extractWikiLinks } from "../frontmatter.js";
import {
  noteBasename,
  noteExists,
  posixRelative,
  readNote,
  resolveKnowledgeFolder,
  resolveVaultPath,
  walkMarkdownFiles,
} from "../vault.js";

const Schema = Type.Object(
  {
    note: Type.String({
      description: "Note path relative to the vault, or the slug. `.md` optional.",
    }),
  },
  { additionalProperties: false },
);

type Params = { note?: unknown };

export function createKnowledgeRecallTool(api: OpenClawPluginApi) {
  return {
    name: "knowledge_recall",
    label: "Knowledge Recall",
    description:
      "Fetch a specific knowledge note with its outgoing wiki-links and the set of notes that link to it (backlinks).",
    parameters: Schema,
    async execute(_toolCallId: string, rawParams: Params) {
      if (typeof rawParams.note !== "string" || rawParams.note.trim().length === 0) {
        throw new Error("note required");
      }
      const raw = rawParams.note.trim();

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

      const normalized = raw.endsWith(".md") ? raw : `${raw}.md`;
      const candidates = [
        join(vaultPath, normalized),
        join(vaultPath, knowledgeFolder, normalized),
      ];
      const fullPath = candidates.find((p) => noteExists(p));
      if (!fullPath) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Note not found: ${raw}`,
            },
          ],
          details: { error: "not_found", note: raw },
        };
      }

      const content = readNote(fullPath);
      const links = extractWikiLinks(content);

      // Backlinks: brute-force scan all notes in the knowledge folder
      const target = noteBasename(fullPath);
      const backlinks: string[] = [];
      const files = walkMarkdownFiles(join(vaultPath, knowledgeFolder));
      for (const candidate of files) {
        if (candidate === fullPath) {
          continue;
        }
        try {
          const body = readNote(candidate);
          if (body.includes(`[[${knowledgeFolder}/${target}`) || body.includes(`[[${target}`)) {
            backlinks.push(posixRelative(vaultPath, candidate));
          }
        } catch {
          // skip unreadable
        }
      }

      const payload = {
        path: posixRelative(vaultPath, fullPath),
        content,
        links,
        backlinks,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
