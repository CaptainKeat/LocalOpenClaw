import { describe, expect, it } from "vitest";
import { extractKeywords, makeDatedSlug, slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates whitespace", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation", () => {
    expect(slugify("What's up?!")).toBe("whats-up");
  });

  it("truncates at maxLen", () => {
    const out = slugify("a".repeat(200), 30);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("strips trailing hyphens", () => {
    expect(slugify("trailing   ", 20)).toBe("trailing");
  });
});

describe("extractKeywords", () => {
  it("returns 4+ char words, deduplicated", () => {
    const out = extractKeywords("cat dog elephant tiger dog CAT hello");
    expect(out).toEqual(["elephant", "tiger", "hello"]);
  });

  it("respects limit", () => {
    const out = extractKeywords("alpha beta gamma delta epsilon", 2);
    expect(out).toEqual(["alpha", "beta"]);
  });

  it("returns empty for short/no words", () => {
    expect(extractKeywords("a b c!")).toEqual([]);
  });
});

describe("makeDatedSlug", () => {
  it("prefixes with the date of the given timestamp", () => {
    const d = new Date("2026-03-14T12:34:56Z");
    expect(makeDatedSlug("Some Title", d)).toBe("2026-03-14-some-title");
  });
});
