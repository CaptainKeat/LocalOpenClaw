import { describe, expect, it } from "vitest";
import { buildFrontmatter, extractWikiLinks, readFrontmatterField } from "./frontmatter.js";

describe("buildFrontmatter", () => {
  it("emits minimal frontmatter with only required fields", () => {
    const out = buildFrontmatter({ title: "Hello", date: "2026-03-14T00:00:00Z" });
    expect(out).toBe('---\ntitle: "Hello"\ndate: 2026-03-14T00:00:00Z\n---');
  });

  it("escapes quotes in titles", () => {
    const out = buildFrontmatter({ title: 'a "quoted" title', date: "2026-03-14" });
    expect(out).toContain('title: "a \\"quoted\\" title"');
  });

  it("includes optional fields when present", () => {
    const out = buildFrontmatter({
      title: "t",
      date: "d",
      agent: "scout",
      category: "research",
      tags: ["a", "b"],
    });
    expect(out).toContain("agent: scout");
    expect(out).toContain("category: research");
    expect(out).toContain('tags: ["a", "b"]');
  });

  it("omits tags when the array is empty", () => {
    const out = buildFrontmatter({ title: "t", date: "d", tags: [] });
    expect(out).not.toContain("tags:");
  });
});

describe("readFrontmatterField", () => {
  const NOTE = [
    "---",
    'title: "Example"',
    "category: research",
    "agent: main",
    "---",
    "",
    "Body text.",
  ].join("\n");

  it("reads quoted fields, stripping quotes", () => {
    expect(readFrontmatterField(NOTE, "title")).toBe("Example");
  });

  it("reads unquoted fields", () => {
    expect(readFrontmatterField(NOTE, "category")).toBe("research");
  });

  it("returns null for missing fields", () => {
    expect(readFrontmatterField(NOTE, "nope")).toBeNull();
  });

  it("searches the full content when there's no frontmatter block", () => {
    expect(readFrontmatterField("category: plain", "category")).toBe("plain");
  });
});

describe("extractWikiLinks", () => {
  it("extracts plain [[links]]", () => {
    expect(extractWikiLinks("Some [[note-one]] and [[note-two]].")).toEqual([
      "note-one",
      "note-two",
    ]);
  });

  it("handles pipe aliases", () => {
    expect(extractWikiLinks("[[path/to/note|Nicely Named]]")).toEqual(["path/to/note"]);
  });

  it("de-duplicates", () => {
    expect(extractWikiLinks("[[a]] [[a]] [[b]]")).toEqual(["a", "b"]);
  });

  it("returns empty for no links", () => {
    expect(extractWikiLinks("plain text")).toEqual([]);
  });
});
