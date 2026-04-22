/**
 * Auto-log listener for the `tool:executed` internal hook.
 *
 * Opt-in via pluginConfig.autoLog. When enabled, every significant tool
 * invocation results in a knowledge note written into the Obsidian vault,
 * reusing the same writer pipeline as the manual `knowledge_log` tool.
 * This is the feature that turns the knowledge graph into an actual graph:
 * the agent doesn't have to remember to log — things get logged as they
 * happen, linked by keyword overlap to related past notes.
 *
 * Safety:
 *   - Skip list prevents recursion (never log a knowledge_* tool call) and
 *     filters out noisy read-only lookups.
 *   - Significance score gates trivial calls so the vault doesn't fill
 *     with low-value entries.
 *   - The handler is fire-and-forget from the runtime's perspective; it
 *     awaits its own work and swallows errors so a broken vault path never
 *     breaks the agent loop.
 *   - Re-enters redaction via buildFrontmatter; the hook payload is already
 *     redacted by `emitToolExecutedHook` before we see it.
 */

import { dirname } from "node:path";
import { buildFrontmatter } from "./frontmatter.js";
import { findRelated } from "./related.js";
import { extractKeywords, makeDatedSlug, slugify } from "./slug.js";
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
} from "./vault.js";

export type AutoLogConfig = {
  /** Master switch. Defaults to false (manual-only). */
  autoLog?: boolean;
  /** Tool names to never log (on top of the built-in list). */
  autoLogSkipTools?: string[];
  /** Minimum significance score before a note is written. Default 2. */
  autoLogMinSignificance?: number;
};

/** Tools whose calls should never auto-log. Mostly lookups + our own plugin's tools. */
const BUILTIN_SKIP_TOOLS = new Set<string>([
  "knowledge_log",
  "knowledge_search",
  "knowledge_recall",
  "knowledge_summary",
  "knowledge_export",
  "memory_search",
  "memory_recall",
  "memory_list",
  "list_directory",
  "search_files",
]);

/**
 * Heuristic: "is this tool call worth writing a note for?"
 * Mirrors GoonClaw's significanceScore. Tweak freely — the point is that
 * file writes and commands are interesting, passive reads usually aren't.
 */
const MUTATION_TOOLS = new Set([
  "write_file",
  "modify_file",
  "delete_file",
  "apply_patch",
  "diffs_apply",
]);
const COMMAND_TOOLS = new Set(["run_command", "run_background", "shell", "exec"]);
const NETWORK_TOOLS = new Set(["web_search", "web_fetch", "browser_navigate", "browser_click"]);
const DELEGATION_TOOLS = new Set(["spawn_agent", "schedule_cron", "agent_send"]);

export function significanceScore(toolName: string, isError: boolean): number {
  let score = 1;
  const lower = toolName.toLowerCase();
  if (MUTATION_TOOLS.has(lower)) {
    score += 3;
  }
  if (COMMAND_TOOLS.has(lower)) {
    score += 2;
  }
  if (NETWORK_TOOLS.has(lower)) {
    score += 2;
  }
  if (lower.startsWith("github_")) {
    score += 2;
  }
  if (DELEGATION_TOOLS.has(lower)) {
    score += 3;
  }
  if (lower.startsWith("browser_")) {
    score += 1;
  }
  if (isError) {
    score += 1;
  }
  return score;
}

type HookPayload = {
  toolName: string;
  toolCallId?: string;
  args: unknown;
  result: unknown;
  isError: boolean;
  durationMs?: number;
  agentId?: string;
};

/** Summarize args as a compact markdown block suitable for a knowledge note. */
function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") {
    return "_No arguments_";
  }
  const lines: string[] = [];
  for (const [key, val] of Object.entries(args as Record<string, unknown>)) {
    if (key.startsWith("__redacted")) {
      lines.push(`- **${key}:** \`${String(val)}\``);
      continue;
    }
    let display: string;
    try {
      display = JSON.stringify(val);
    } catch {
      display = String(val);
    }
    if (display.length > 200) {
      display = `${display.slice(0, 200)}…`;
    }
    lines.push(`- **${key}:** \`${display}\``);
  }
  return lines.length > 0 ? lines.join("\n") : "_No arguments_";
}

function summarizeResult(result: unknown, isError: boolean): string {
  if (result === null || result === undefined) {
    return isError ? "**Error** (no details)" : "_No result_";
  }
  if (isError && typeof result === "object" && result !== null) {
    const err = (result as { error?: unknown }).error;
    if (typeof err === "string") {
      return `**Error:** ${err}`;
    }
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(result, null, 2);
  } catch {
    // Fall back to the generic Object shape rather than crashing — the
    // note is still useful even without a faithful serialization.
    serialized = Object.prototype.toString.call(result);
  }
  if (serialized.length < 400) {
    return `\`\`\`json\n${serialized}\n\`\`\``;
  }
  return `\`\`\`json\n${serialized.slice(0, 400)}…\n\`\`\``;
}

function pickTitle(toolName: string, args: unknown, isError: boolean): string {
  const label = toolName.replace(/_/g, " ");
  let suffix = "";
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    const first = typeof a.path === "string" ? a.path.split(/[\\/]/).pop() : undefined;
    const query = typeof a.query === "string" ? a.query : undefined;
    const command = typeof a.command === "string" ? a.command : undefined;
    const url = typeof a.url === "string" ? a.url : undefined;
    const hint = first ?? query ?? command ?? url;
    if (hint) {
      suffix = ` — ${hint.slice(0, 50)}`;
    }
  }
  return `${label}${suffix}${isError ? " [ERROR]" : ""}`;
}

export type AutoLogDeps = {
  /** Resolved at call time so config changes (vault path, folder) are picked up live. */
  getPluginConfig: () => Record<string, unknown> | undefined;
};

/**
 * Build the hook handler. Returns a function suitable for
 * `registerInternalHook("tool:executed", handler)`.
 */
export function createAutoLogHandler(deps: AutoLogDeps) {
  return async function onToolExecuted(event: {
    type: string;
    action: string;
    context: unknown;
  }): Promise<void> {
    try {
      if (event.type !== "tool" || event.action !== "executed") {
        return;
      }
      const cfg = (deps.getPluginConfig() ?? {}) as AutoLogConfig & Record<string, unknown>;
      if (cfg.autoLog !== true) {
        return;
      }
      const payload = event.context as HookPayload;
      const toolName = payload?.toolName;
      if (typeof toolName !== "string" || !toolName) {
        return;
      }
      if (BUILTIN_SKIP_TOOLS.has(toolName)) {
        return;
      }
      const extra = Array.isArray(cfg.autoLogSkipTools) ? cfg.autoLogSkipTools : [];
      if (extra.includes(toolName)) {
        return;
      }
      const minScore =
        typeof cfg.autoLogMinSignificance === "number" ? cfg.autoLogMinSignificance : 2;
      const score = significanceScore(toolName, payload.isError);
      if (score < minScore) {
        return;
      }

      const vaultPath = resolveVaultPath(cfg);
      if (!vaultPath) {
        return;
      }
      const knowledgeFolder = resolveKnowledgeFolder(cfg);

      const now = new Date();
      const timestamp = now.toISOString();
      const title = pickTitle(toolName, payload.args, payload.isError);
      const slug = `auto-${makeDatedSlug(title, now)}`;

      // Related-note scoring reuses the same keyword extraction as the
      // manual knowledge_log tool — the auto-log stays linked to past
      // entries the user wrote by hand.
      const argsText = JSON.stringify(payload.args ?? {});
      const resultText =
        typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result ?? {});
      const keywords = [
        ...new Set([
          toolName.replace(/_/g, " "),
          ...extractKeywords(argsText, 8),
          ...extractKeywords(resultText, 8),
        ]),
      ];
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
      const related = findRelated(existing, keywords, { exclude: new Set([slug]) });

      const category = payload.isError ? "error" : "action";
      const tags = [
        category,
        slugify(toolName.replace(/_/g, "-"), 40),
        ...(typeof payload.agentId === "string" && payload.agentId ? [payload.agentId] : []),
      ].filter((t) => t.length > 0);

      const frontmatter = buildFrontmatter({
        title,
        date: timestamp,
        agent: typeof payload.agentId === "string" ? payload.agentId : "auto",
        category,
        tags: [...new Set(tags)],
      });
      const relatedBlock =
        related.length > 0
          ? ["", "### Related Knowledge", ...related.map((r) => `- [[${r.path}|${r.name}]]`)].join(
              "\n",
            )
          : "";
      const hashtags = [...new Set(tags)].map((t) => `#${t}`).join(" ");
      const duration =
        typeof payload.durationMs === "number" ? `\n_Duration: ${payload.durationMs} ms_\n` : "";

      const body = [
        frontmatter,
        "",
        `## ${title}`,
        "",
        `**Tool:** \`${toolName}\`${
          payload.toolCallId ? ` · **Call ID:** \`${payload.toolCallId}\`` : ""
        }`,
        duration,
        "### What Happened",
        summarizeArgs(payload.args),
        "",
        "### Result",
        summarizeResult(payload.result, payload.isError),
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
        return;
      }
      ensureDir(dirname(notePath));
      writeNote(notePath, body);
    } catch {
      // Swallow — a broken vault path or filesystem error must not break
      // the agent loop. The worst case is a missing note entry.
    }
  };
}
