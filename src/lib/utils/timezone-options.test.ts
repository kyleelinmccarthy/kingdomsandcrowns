import { describe, it, expect } from "vitest";
import { timezoneOptions, UNRECOGNIZED_ZONE_SUFFIX } from "./timezone-options";

describe("timezoneOptions", () => {
  it("groups zones by their region prefix", () => {
    const groups = timezoneOptions("America/Denver");
    const america = groups.find((g) => g.region === "America");
    expect(america).toBeDefined();
    expect(america!.zones).toContain("America/Denver");
    expect(america!.zones).toContain("America/New_York");
  });

  it("offers the full runtime list, not a hand-maintained subset", () => {
    // The point of sourcing from Intl is that it never goes stale.
    const total = timezoneOptions("UTC").reduce((n, g) => n + g.zones.length, 0);
    expect(total).toBe(Intl.supportedValuesOf("timeZone").length);
  });

  it("orders regions alphabetically, and zones within a region alphabetically", () => {
    const groups = timezoneOptions("America/Denver");
    const regions = groups.map((g) => g.region);
    expect(regions).toEqual([...regions].sort());
    const america = groups.find((g) => g.region === "America")!;
    expect(america.zones).toEqual([...america.zones].sort());
  });

  it("does not invent an extra group for a stored zone it already contains", () => {
    const groups = timezoneOptions("America/Denver");
    expect(groups.filter((g) => g.region === "America")).toHaveLength(1);
    expect(groups.some((g) => g.zones.some((z) => z.includes(UNRECOGNIZED_ZONE_SUFFIX)))).toBe(false);
  });

  it("preserves an unrecognized stored zone instead of silently dropping it", () => {
    // "Denver" is reachable today: the field used to be free text. If the
    // picker dropped it, the next save would quietly rewrite the family's
    // setting to whatever happened to be first in the list.
    const groups = timezoneOptions("Denver");
    const all = groups.flatMap((g) => g.zones);
    expect(all).toContain("Denver");
  });

  it("flags the unrecognized zone so a parent can see what is wrong", () => {
    const groups = timezoneOptions("Denver");
    const current = groups.find((g) => g.zones.includes("Denver"))!;
    expect(current.region).toContain(UNRECOGNIZED_ZONE_SUFFIX);
  });

  it("puts the unrecognized zone first, where it is selected and visible", () => {
    const groups = timezoneOptions("Denver");
    expect(groups[0].zones).toEqual(["Denver"]);
  });

  it("treats an empty stored zone as nothing to preserve", () => {
    const groups = timezoneOptions("");
    expect(groups.every((g) => !g.region.includes(UNRECOGNIZED_ZONE_SUFFIX))).toBe(true);
  });
});
