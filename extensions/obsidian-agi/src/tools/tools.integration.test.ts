import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKnowledgeLogTool } from "./knowledge-log.js";
import { createKnowledgeRecallTool } from "./knowledge-recall.js";
import { createKnowledgeSearchTool } from "./knowledge-search.js";
import { createKnowledgeSummaryTool } from "./knowledge-summary.js";

type FakeApi = { pluginConfig?: Record<string, unknown> };

function makeApi(vaultPath: string): FakeApi {
  return { pluginConfig: { vaultPath, knowledgeFolder: "OpenClaw" } };
}

describe("obsidian-agi tools (integration)", () => {
  let vault: string;

  beforeEach(() => {
    vault = join(tmpdir(), `obsidian-agi-int-${Date.now()}-${Math.random()}`);
    mkdirSync(vault, { recursive: true });
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("logs, searches, recalls, and summarizes a full round-trip", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const api = makeApi(vault) as any;
    const log = createKnowledgeLogTool(api);
    const search = createKnowledgeSearchTool(api);
    const recall = createKnowledgeRecallTool(api);
    const summary = createKnowledgeSummaryTool(api);

    // 1) Log two entries
    const logged1 = await log.execute("c1", {
      title: "Postgres connection pooling",
      content:
        "Discovered that PgBouncer in transaction mode breaks our prepared statements. Need to switch to session mode or disable prepared statements in the client.",
      category: "learning",
      tags: ["postgres", "pgbouncer"],
      agent: "main",
    });
    expect(logged1.details).toMatchObject({
      title: "Postgres connection pooling",
      relatedNotes: 0,
    });

    const logged2 = await log.execute("c2", {
      title: "PgBouncer session mode tradeoffs",
      content:
        "Session mode holds connections per client session — solves prepared statements but reduces pool efficiency. Transaction mode is fine only for simple queries.",
      category: "decision",
      tags: ["postgres", "pgbouncer"],
      agent: "main",
    });
    // The second entry shares keywords with the first and should link back
    expect((logged2.details as { relatedNotes: number }).relatedNotes).toBeGreaterThanOrEqual(1);

    // 2) Search — "prepared statements" should return both
    const searched = await search.execute("c3", { query: "prepared statements" });
    const results = (searched.details as { results: Array<{ title: string }> }).results;
    expect(results.length).toBe(2);

    // Filter by category
    const filtered = await search.execute("c4", {
      query: "pgbouncer",
      category: "learning",
    });
    const filteredResults = (filtered.details as { results: Array<{ title: string }> }).results;
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0]?.title).toBe("Postgres connection pooling");

    // 3) Recall the first note by slug (no extension)
    const recalled = await recall.execute("c5", {
      note: (logged1.details as { slug: string }).slug,
    });
    const recallBody = recalled.details as {
      content: string;
      links: string[];
      backlinks: string[];
    };
    expect(recallBody.content).toContain("Postgres connection pooling");
    // The second note should appear as a backlink
    expect(recallBody.backlinks.length).toBeGreaterThanOrEqual(1);

    // 4) Summary
    const sum = await summary.execute("c6", {});
    const sumBody = sum.details as { total: number; categories: Record<string, number> };
    expect(sumBody.total).toBe(2);
    expect(sumBody.categories.learning).toBe(1);
    expect(sumBody.categories.decision).toBe(1);
  });

  it("reports not-configured when vault path is missing", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const api = { pluginConfig: {} } as any;
    const original = process.env.OBSIDIAN_VAULT;
    delete process.env.OBSIDIAN_VAULT;
    try {
      const log = createKnowledgeLogTool(api);
      const out = await log.execute("c", { title: "x", content: "y" });
      expect(out.content[0]?.text).toContain("vault not configured");
    } finally {
      if (original !== undefined) {
        process.env.OBSIDIAN_VAULT = original;
      }
    }
  });

  it("recall returns not-found for unknown slug", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const api = makeApi(vault) as any;
    const recall = createKnowledgeRecallTool(api);
    const out = await recall.execute("c", { note: "does-not-exist" });
    expect((out.details as { error?: string }).error).toBe("not_found");
  });
});
