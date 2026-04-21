import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKnowledgeExportTool } from "./knowledge-export.js";

type FakeApi = { pluginConfig?: Record<string, unknown> };

function makeApi(vaultPath: string): FakeApi {
  return { pluginConfig: { vaultPath, knowledgeFolder: "OpenClaw" } };
}

describe("knowledge_export", () => {
  let vault: string;

  beforeEach(() => {
    vault = join(tmpdir(), `knowledge-export-${Date.now()}-${Math.random()}`);
    mkdirSync(vault, { recursive: true });
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("writes one note per entry with forward + backward neighbour links", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createKnowledgeExportTool(makeApi(vault) as any);
    const result = await tool.execute("call-1", {
      entries: [
        { title: "Turn 1", content: "First thing we learned." },
        { title: "Turn 2", content: "Second thing, building on the first." },
        { title: "Turn 3", content: "Third thing, tying it together." },
      ],
      agent: "main",
      batchLabel: "test-session",
    });
    const payload = result.details as {
      count: number;
      notes: Array<{ slug: string; path: string }>;
    };
    expect(payload.count).toBe(3);
    expect(payload.notes).toHaveLength(3);
    const folder = join(vault, "OpenClaw");
    const files = readdirSync(folder).filter((f) => f.endsWith(".md"));
    expect(files).toHaveLength(3);

    // First note: no previous link, has next link
    const first = readFileSync(join(folder, `${payload.notes[0]?.slug}.md`), "utf-8");
    expect(first).not.toContain("← Previous");
    expect(first).toContain("→ Next");

    // Middle note: both links
    const middle = readFileSync(join(folder, `${payload.notes[1]?.slug}.md`), "utf-8");
    expect(middle).toContain("← Previous");
    expect(middle).toContain("→ Next");

    // Last note: previous link, no next
    const last = readFileSync(join(folder, `${payload.notes[2]?.slug}.md`), "utf-8");
    expect(last).toContain("← Previous");
    expect(last).not.toContain("→ Next");
  });

  it("batchLabel prefixes slugs", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createKnowledgeExportTool(makeApi(vault) as any);
    const result = await tool.execute("c", {
      entries: [{ title: "One", content: "body" }],
      batchLabel: "my-batch",
    });
    const slug = (result.details as { notes: Array<{ slug: string }> }).notes[0]?.slug;
    expect(slug).toMatch(/^my-batch-01-/);
  });

  it("drops malformed entries (no title or no content)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createKnowledgeExportTool(makeApi(vault) as any);
    const result = await tool.execute("c", {
      entries: [
        { title: "Good", content: "body" },
        { title: "", content: "no title" },
        { title: "No content", content: "" },
        "not an object",
        null,
        { title: "Also good", content: "body2" },
      ],
    });
    expect((result.details as { count: number }).count).toBe(2);
  });

  it("throws when every entry is invalid", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const tool = createKnowledgeExportTool(makeApi(vault) as any);
    await expect(tool.execute("c", { entries: [{ title: "", content: "" }] })).rejects.toThrow(
      /entries required/,
    );
  });

  it("links sideways to keyword-related existing notes", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
    const api = makeApi(vault) as any;
    // Prime the vault with a note mentioning a specific term
    const tool = createKnowledgeExportTool(api);
    await tool.execute("prime", {
      entries: [{ title: "Postgres primer", content: "Prepared statements are great." }],
    });
    // Export a second batch mentioning the same term
    const result = await tool.execute("batch", {
      entries: [
        {
          title: "Another thought on prepared statements",
          content: "PgBouncer in transaction mode breaks them.",
        },
      ],
    });
    expect(
      (result.details as { notes: Array<{ relatedNotes: number }> }).notes[0]?.relatedNotes,
    ).toBeGreaterThanOrEqual(1);
  });

  it("reports not-configured when no vault path", async () => {
    const original = process.env.OBSIDIAN_VAULT;
    delete process.env.OBSIDIAN_VAULT;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake api for unit test
      const tool = createKnowledgeExportTool({ pluginConfig: {} } as any);
      const out = await tool.execute("c", { entries: [{ title: "x", content: "y" }] });
      expect(out.content[0]?.text).toContain("vault not configured");
    } finally {
      if (original !== undefined) {
        process.env.OBSIDIAN_VAULT = original;
      }
    }
  });
});
