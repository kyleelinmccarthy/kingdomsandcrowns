import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEPTH_OVERRIDE,
  DEPTH_OVERRIDES,
  isDepthOverride,
  realmDepth,
  surfacesFor,
} from "./depth";
import type { Surfaces } from "./depth";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

const FEWER = { ...DEFAULT_LEARNING_PROFILE, fewerChoices: true };

describe("realmDepth", () => {
  it("follows the tutorial when the override is auto", () => {
    expect(realmDepth({ tutorialComplete: false, override: "auto" })).toBe("simple");
    expect(realmDepth({ tutorialComplete: true, override: "auto" })).toBe("full");
  });
  it("lets an explicit override win whatever the tutorial says", () => {
    expect(realmDepth({ tutorialComplete: false, override: "simple" })).toBe("simple");
    expect(realmDepth({ tutorialComplete: true, override: "simple" })).toBe("simple");
    expect(realmDepth({ tutorialComplete: false, override: "full" })).toBe("full");
    expect(realmDepth({ tutorialComplete: true, override: "full" })).toBe("full");
  });
});

describe("isDepthOverride", () => {
  it("accepts exactly the three override strings", () => {
    expect(isDepthOverride("auto")).toBe(true);
    expect(isDepthOverride("simple")).toBe(true);
    expect(isDepthOverride("full")).toBe(true);
  });
  it("rejects anything that is not one of the three", () => {
    for (const bad of [null, undefined, "", "Simple", "FULL", " auto", 0, 1, true, {}, ["auto"]]) {
      expect(isDepthOverride(bad)).toBe(false);
    }
  });
  it("lists the three overrides in order and defaults to auto", () => {
    expect(DEPTH_OVERRIDES).toEqual(["auto", "simple", "full"]);
    expect(DEFAULT_DEPTH_OVERRIDE).toBe("auto");
    expect(DEPTH_OVERRIDES.every((o) => isDepthOverride(o))).toBe(true);
  });
});

/** §3.1's table, transcribed. If this and depth.ts disagree, depth.ts is wrong. */
const SIMPLE_TABLE: Surfaces = {
  numerals: false,
  trackedObjectives: 1,
  abilitySlots: "earned",
  keycapHints: false,
  listRows: 3,
  districtDetail: false,
  fastTravel: false,
  troubleNames: false,
  troubleDetail: false,
  troubleHitPips: false,
  clearCount: false,
  bountyLedgerLine: false,
  lapTimes: false,
};

const FULL_TABLE: Surfaces = {
  numerals: true,
  trackedObjectives: 3,
  abilitySlots: "all",
  keycapHints: true,
  listRows: 8,
  districtDetail: true,
  fastTravel: true,
  troubleNames: true,
  troubleDetail: true,
  troubleHitPips: true,
  clearCount: true,
  bountyLedgerLine: true,
  lapTimes: true,
};

describe("surfacesFor", () => {
  it("draws every simple surface exactly as the table says", () => {
    expect(surfacesFor("simple", DEFAULT_LEARNING_PROFILE)).toEqual(SIMPLE_TABLE);
  });
  it("draws every full surface exactly as the table says", () => {
    expect(surfacesFor("full", DEFAULT_LEARNING_PROFILE)).toEqual(FULL_TABLE);
  });
  it("declares exactly thirteen surfaces, and the same thirteen at both depths", () => {
    const simpleKeys = Object.keys(surfacesFor("simple", DEFAULT_LEARNING_PROFILE)).sort();
    const fullKeys = Object.keys(surfacesFor("full", DEFAULT_LEARNING_PROFILE)).sort();
    expect(simpleKeys).toHaveLength(13);
    expect(fullKeys).toEqual(simpleKeys);
    expect(Object.keys(SIMPLE_TABLE).sort()).toEqual(simpleKeys);
  });
  it("caps tracked objectives, ability slots and list rows under fewerChoices at both depths", () => {
    for (const depth of ["simple", "full"] as const) {
      const s = surfacesFor(depth, FEWER);
      expect(s.trackedObjectives).toBe(1);
      expect(s.abilitySlots).toBe("earned");
      expect(s.listRows).toBe(3);
    }
  });
  it("leaves every other surface alone under fewerChoices", () => {
    const capped = new Set<string>(["trackedObjectives", "abilitySlots", "listRows"]);
    for (const depth of ["simple", "full"] as const) {
      const plain = surfacesFor(depth, DEFAULT_LEARNING_PROFILE);
      const fewer = surfacesFor(depth, FEWER);
      for (const key of Object.keys(plain) as (keyof Surfaces)[]) {
        if (capped.has(key)) continue;
        expect(fewer[key]).toBe(plain[key]);
      }
    }
  });
  it("returns a fresh object each call, so no caller can poison the table", () => {
    const a = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
    const b = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
