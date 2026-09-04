import { describe, it, expect } from "vitest";
import { bandForHero, nearestBands, BAND_LABELS, CONTENT_BANDS } from "./content-bands";

describe("bandForHero", () => {
  it("maps grades to bands", () => {
    expect(bandForHero("K", "elementary")).toBe("k1");
    expect(bandForHero("1", "elementary")).toBe("k1");
    expect(bandForHero("3", "elementary")).toBe("g23");
    expect(bandForHero("5", "elementary")).toBe("g45");
    expect(bandForHero("7", "middle")).toBe("g68");
    expect(bandForHero("12", "high")).toBe("g912");
  });
  it("falls back to the age band without a grade", () => {
    expect(bandForHero(null, "elementary")).toBe("g23");
    expect(bandForHero(null, "middle")).toBe("g68");
    expect(bandForHero(null, "high")).toBe("g912");
  });
});

describe("nearestBands", () => {
  it("starts with the band, then walks down, then up", () => {
    expect(nearestBands("g45")).toEqual(["g45", "g23", "k1", "g68", "g912"]);
    expect(nearestBands("k1")).toEqual(["k1", "g23", "g45", "g68", "g912"]);
  });
  it("labels every band", () => {
    for (const b of CONTENT_BANDS) expect(BAND_LABELS[b]).toBeTruthy();
  });
});
