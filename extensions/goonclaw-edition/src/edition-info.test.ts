import { describe, expect, it } from "vitest";
import { describeEdition, renderEditionText } from "./edition-info.js";

describe("describeEdition", () => {
  it("identifies the fork as GoonClaw", () => {
    const info = describeEdition();
    expect(info.edition).toBe("GoonClaw");
    expect(info.upstream).toContain("openclaw");
  });

  it("lists the two bundled plugins", () => {
    const info = describeEdition();
    const ids = info.bundledPlugins.map((p) => p.id);
    expect(ids).toEqual(["hardware-info", "obsidian-agi"]);
  });

  it("points at the personas doc", () => {
    expect(describeEdition().personasDoc).toBe("docs/goonclaw-personas.md");
  });
});

describe("renderEditionText", () => {
  it("includes the edition name, version, and both plugin docs", () => {
    const out = renderEditionText();
    expect(out).toContain("GoonClaw edition");
    expect(out).toContain("docs/tools/hardware-info.md");
    expect(out).toContain("docs/tools/obsidian-agi.md");
    expect(out).toContain("docs/goonclaw-personas.md");
  });

  it("mentions the brand override env var", () => {
    expect(renderEditionText()).toContain("OPENCLAW_BRAND_NAME");
  });
});
