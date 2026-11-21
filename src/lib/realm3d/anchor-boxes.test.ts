import { describe, expect, it } from "vitest";
import { ANCHOR_SPOT, ANCHORS, ANCHOR_IDS, type ObjectAnchorId } from "@/lib/realm/anchors";
import { stakeBoxes, trailObjectBoxes } from "./anchor-boxes";

const top = (b: { y: number; sy: number }) => b.y + b.sy / 2;
const OBJECT_IDS = ANCHOR_IDS.filter((id): id is ObjectAnchorId => ANCHORS[id].kind === "object");

describe("a stake's boxes", () => {
  it("stay inside the stake's spot and stand at most 1.6 tall", () => {
    for (const revealed of [false, true]) {
      const boxes = stakeBoxes(revealed);
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(Math.hypot(Math.abs(b.x) + b.sx / 2, Math.abs(b.z) + b.sz / 2)).toBeLessThanOrEqual(ANCHOR_SPOT.radius);
        expect(top(b)).toBeLessThanOrEqual(1.6);
        expect(b.y - b.sy / 2).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("differ revealed only in colour, to the gold", () => {
    const shut = stakeBoxes(false);
    const shown = stakeBoxes(true);
    expect(shown).toHaveLength(shut.length);
    let changed = 0;
    shut.forEach((b, i) => {
      expect({ ...shown[i], color: "" }).toEqual({ ...b, color: "" });
      if (shown[i].color !== b.color) {
        changed++;
        expect(shown[i].color).toBe("#e8b84a");
      }
    });
    expect(changed).toBeGreaterThan(0);
    expect(shut.some((b) => b.color === "#e8b84a")).toBe(false);
  });
});

describe("the four small objects", () => {
  it("are the four object anchors", () => {
    expect(OBJECT_IDS).toHaveLength(4);
  });

  it("have two to eight boxes each, inside a 1.6 by 1.6 footprint and at most 2.2 tall", () => {
    for (const id of OBJECT_IDS) {
      const boxes = trailObjectBoxes(id);
      expect(boxes.length, id).toBeGreaterThanOrEqual(2);
      expect(boxes.length, id).toBeLessThanOrEqual(8);
      for (const b of boxes) {
        expect(Math.abs(b.x) + b.sx / 2, id).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(Math.abs(b.z) + b.sz / 2, id).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(top(b), id).toBeLessThanOrEqual(2.2);
        expect(b.y - b.sy / 2, id).toBeGreaterThanOrEqual(0);
        expect(b.color, id).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

/** A colour's lightness, 0 to 1 (the mean of its channels). */
const light = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0) / (3 * 255);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("a stake reads as a search spot, apart from a site's posts (H10 look pass)", () => {
  it("wears a pale ribbon round its post, and no red cloth, so a site's flagged posts are not mistaken for it", () => {
    const boxes = stakeBoxes(false);
    const post = boxes.find((b) => b.sx <= 0.1 && b.sy >= 1)!;
    const ribbon = boxes.find((b) => b !== post && b.x === 0 && b.z === 0 && b.sx > post.sx && b.sy <= 0.1 && light(b.color) > 0.75);
    expect(ribbon).toBeDefined();
    expect(boxes.some((b) => b.color === "#b8483f")).toBe(false);
    // Its sign is a light one too: the open book reads pale against the ground.
    const sign = boxes.find((b) => b.x !== 0)!;
    expect(light(sign.color)).toBeGreaterThan(0.75);
  });
});

describe("the water trough reads as a trough, not a bench (H10 look pass)", () => {
  const boxes = trailObjectBoxes("object:water-trough");
  const water = boxes.find((b) => { const [r, g, bl] = rgb(b.color); return bl > r && bl >= g; })!;
  const rest = boxes.filter((b) => b !== water);
  const rim = Math.max(...rest.map(top));

  it("holds its water below the rim, walled in on all four sides", () => {
    expect(water).toBeDefined();
    expect(rim - top(water)).toBeGreaterThanOrEqual(0.05);
    const hx = water.x + water.sx / 2;
    const hz = water.z + water.sz / 2;
    const walls = rest.filter((b) => top(b) >= rim - 1e-9);
    expect(walls.some((b) => b.x - b.sx / 2 >= hx - 1e-9), "+x end").toBe(true);
    expect(walls.some((b) => b.x + b.sx / 2 <= -hx + 1e-9), "-x end").toBe(true);
    expect(walls.some((b) => b.z - b.sz / 2 >= hz - 0.05), "+z side").toBe(true);
    expect(walls.some((b) => b.z + b.sz / 2 <= -hz + 0.05), "-z side").toBe(true);
  });

  it("shows a darker inner face above the water, and blue-grey water", () => {
    const outer = rest.reduce((a, b) => (b.sx * b.sy > a.sx * a.sy ? b : a));
    const inner = rest.filter((b) => top(b) > top(water) && Math.abs(b.z) < Math.abs(outer.z) && light(b.color) < light(outer.color));
    expect(inner.length).toBeGreaterThan(0);
    const [r, g, bl] = rgb(water.color);
    expect(bl - r, "blue, but greyed").toBeLessThanOrEqual(0x50);
    expect(Math.max(r, g, bl) - Math.min(r, g, bl)).toBeGreaterThan(0x10);
  });
});

describe("the hay cart has wheels and a load of hay (H10 look pass)", () => {
  const boxes = trailObjectBoxes("object:hay-cart");
  const STRAW_LIKE = (c: string) => { const [r, g, bl] = rgb(c); return r > bl + 0x40 && g > bl + 0x30 && light(c) > 0.55; };

  it("stands on a wheel each side: a cross at least 0.6 across, on the ground", () => {
    for (const side of [-1, 1]) {
      const wheel = boxes.filter((b) => Math.sign(b.x) === side && Math.abs(b.x) >= 0.55 && b.sx <= 0.12);
      const upright = wheel.find((b) => b.sy >= 0.6 && b.y - b.sy / 2 <= 1e-9);
      const across = wheel.find((b) => b.sz >= 0.6 && b.sy <= 0.3);
      expect(upright, `upright, side ${side}`).toBeDefined();
      expect(across, `across, side ${side}`).toBeDefined();
      expect(across!.y).toBeCloseTo(upright!.y, 6);
    }
  });

  it("carries hay heaped in two tiers, at least 0.6 deep above its bed", () => {
    const hay = boxes.filter((b) => STRAW_LIKE(b.color));
    expect(hay.length).toBeGreaterThanOrEqual(2);
    const bed = Math.min(...hay.map((b) => b.y - b.sy / 2));
    expect(Math.max(...hay.map(top)) - bed).toBeGreaterThanOrEqual(0.6);
    const [low, high] = [...hay].sort((a, b) => a.y - b.y);
    expect(high.sx * high.sz).toBeLessThan(low.sx * low.sz);
  });
});
