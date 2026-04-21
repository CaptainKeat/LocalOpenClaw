import { describe, expect, it } from "vitest";
import { findRelated } from "./related.js";

const CANDIDATES = [
  { name: "alpha", path: "OpenClaw/alpha", content: "cats and dogs" },
  { name: "beta", path: "OpenClaw/beta", content: "dogs and birds" },
  { name: "gamma", path: "OpenClaw/gamma", content: "birds only" },
  { name: "Index", path: "OpenClaw/Index", content: "cats dogs birds" },
];

describe("findRelated", () => {
  it("scores by keyword overlap and sorts high-to-low", () => {
    const out = findRelated(CANDIDATES, ["cats", "dogs"], { max: 5 });
    expect(out.map((n) => n.name)).toEqual(["alpha", "beta"]);
    expect(out[0]?.score).toBe(2);
    expect(out[1]?.score).toBe(1);
  });

  it("always excludes the Index note", () => {
    const out = findRelated(CANDIDATES, ["cats", "dogs", "birds"]);
    expect(out.some((n) => n.name === "Index")).toBe(false);
  });

  it("honours exclude set (e.g. the current note being written)", () => {
    const out = findRelated(CANDIDATES, ["dogs"], { exclude: new Set(["beta"]) });
    expect(out.map((n) => n.name)).toEqual(["alpha"]);
  });

  it("caps at max", () => {
    const out = findRelated(CANDIDATES, ["cats", "dogs", "birds"], { max: 2 });
    expect(out).toHaveLength(2);
  });

  it("returns empty when no keywords match", () => {
    expect(findRelated(CANDIDATES, ["unicorn"])).toEqual([]);
  });

  it("skips 1-char or empty keywords", () => {
    expect(findRelated(CANDIDATES, ["a", "", "dogs"])).toHaveLength(2);
  });
});
