import { describe, expect, it } from "vitest";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { CONFUSABLE_ANCHORS, TRAIL_ANCHOR_FACTS } from "@/lib/content/trail-anchor-facts";
import { buildWorldLayout, CASTLE_POSITION } from "./layout";
import { ceremonyMarks } from "./ceremony/ceremony";
import { DECOR, DECOR_IDS } from "./decor";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "./improvements";
import { KEEP_YARD } from "./keep-yard";
import { PUZZLE_TOWER, towerColliders } from "./puzzle-tower";
import { RIDDLE_STONE_SPOTS } from "./riddle-stones";
import { WORLD_OBJECTS } from "./world-objects";
import { worldCanvas } from "./world-state";
import { castlePlan } from "@/lib/realm3d/castle-plan";
import { improvementPlacements } from "@/lib/realm3d/improvement-spots";
import { buildSpots, edgeDistance, type InteractSpot } from "@/lib/realm3d/interact";
import { PLOT_SCALE } from "@/lib/realm3d/lead";
import { ARCH, ARCH_HALF_SPAN } from "@/lib/realm3d/recess/course";
import { VILLAGE_POST, VILLAGE_TRACKS } from "@/lib/realm3d/travel";
import {
  CASTLE_TIER_IDS,
  clearanceFailures,
  distToRect,
  drawnSite,
  gap,
  grow,
  hasPoint,
  levelFailures,
  rectAt,
  segmentDistance,
  villagePieces,
  yardPieces,
  type R,
} from "@/test/world-clearance";
import { ANCHOR_IDS, ANCHOR_SPOT, ANCHOR_SPOTS, ANCHORS, anchorById, anchorLabel, isAnchorId, nearAnchors, type Anchor, type AnchorId, type ObjectAnchorId } from "./anchors";

const all = ANCHOR_IDS.map((id) => ANCHORS[id]);
const buildingAnchors = all.filter((a) => BUILDINGS.some((b) => `landmark:${b.id}` === a.id));
const objects = all.filter((a): a is Anchor & { id: ObjectAnchorId; object: NonNullable<Anchor["object"]> } => a.kind === "object" && a.object !== undefined);
const at = (a: Anchor) => ({ x: a.x, z: a.z });
const wholeWord = (word: string, text: string) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "i").test(text);

describe("the anchors catalog", () => {
  it("has fourteen anchors, prefixed, unique", () => {
    expect(ANCHOR_IDS).toHaveLength(14);
    expect(new Set(ANCHOR_IDS).size).toBe(14);
    for (const id of ANCHOR_IDS) expect(id).toMatch(/^(landmark|object):[a-z-]+$/);
    expect(Object.keys(ANCHORS)).toEqual([...ANCHOR_IDS]);
    expect(objects.map((a) => a.id)).toEqual(["object:notice-board", "object:water-trough", "object:beehives", "object:hay-cart"]);
  });

  it("has an anchor for every building, with the building's icon", () => {
    for (const b of BUILDINGS) {
      const a = ANCHORS[`landmark:${b.id}` as AnchorId];
      expect(a, b.id).toBeDefined();
      expect(a.icon, b.id).toBe(b.icon);
    }
    expect(buildingAnchors).toHaveLength(BUILDINGS.length);
  });

  it("knows an id by its own keys only", () => {
    for (const bad of ["toString", "__proto__", "constructor", "landmark:longwater", 42, null, undefined, {}, ""]) expect(isAnchorId(bad), String(bad)).toBe(false);
    expect(isAnchorId("landmark:mill")).toBe(true);
    expect(anchorById("__proto__")).toBeNull();
    expect(anchorById("toString")).toBeNull();
    expect(anchorById(null)).toBeNull();
    expect(anchorById(undefined)).toBeNull();
    expect(anchorById("object:hay-cart")).toBe(ANCHORS["object:hay-cart"]);
    expect(anchorLabel("landmark:mill")).toBe("the mill");
  });

  it("has names that are unambiguous", () => {
    for (const a of all) {
      expect(a.names.length, a.id).toBeGreaterThan(0);
      for (const n of a.names) {
        expect(n, a.id).toBe(n.toLowerCase());
        expect(n.trim(), a.id).not.toBe("");
        for (const other of all) if (other !== a) expect(wholeWord(n, other.label), `"${n}" (${a.id}) is a word of ${other.id}'s label`).toBe(false);
      }
      expect(
        a.names.some((n) => wholeWord(n, a.label)),
        `${a.id}'s label "${a.label}" holds none of its names`
      ).toBe(true);
    }
  });

  it("stands each stake by what it names, never on a building's front", () => {
    for (const a of buildingAnchors) {
      const site = drawnSite(a.id.slice("landmark:".length));
      const d = distToRect(site, at(a));
      expect(d, `${a.id} is ${d.toFixed(2)} from its site`).toBeGreaterThanOrEqual(2.0);
      expect(d, `${a.id} is ${d.toFixed(2)} from its site`).toBeLessThanOrEqual(3.5);
      expect(a.z, `${a.id} stands on the front`).toBeLessThanOrEqual(site.z1);
    }
    for (const tier of CASTLE_TIER_IDS) {
      const g = castlePlan(tier).gate;
      const d = Math.hypot(anchor("landmark:castle-gate").x - (CASTLE_POSITION.x + g.x), anchor("landmark:castle-gate").z - (CASTLE_POSITION.z + g.z));
      expect(d, `the gate's stake is ${d.toFixed(2)} from the ${tier}'s gate`).toBeLessThanOrEqual(3.5);
    }
    const tower = rectAt(PUZZLE_TOWER.x, PUZZLE_TOWER.z, 6, 6);
    expect(distToRect(tower, at(anchor("landmark:puzzle-tower")))).toBeLessThanOrEqual(3.5);
    for (const o of objects) expect(Math.hypot(o.x - o.object.x, o.z - o.object.z), o.id).toBeLessThanOrEqual(1.6);
  });

  it("stays inside the village", () => {
    for (const x of [...all, ...objects.map((o) => ({ id: o.id, ...o.object }))]) {
      expect(Math.abs(x.x), x.id).toBeLessThanOrEqual(26);
      expect(x.z, x.id).toBeGreaterThanOrEqual(-16);
      expect(x.z, x.id).toBeLessThanOrEqual(26);
    }
  });

  it("keeps the four objects clear of the village", () => {
    const tower = rectAt(PUZZLE_TOWER.x, PUZZLE_TOWER.z, PUZZLE_TOWER.plot, PUZZLE_TOWER.plot);
    const chests = WORLD_OBJECTS.filter((o) => o.type === "chest" && !o.room).map((o) => ({ what: o.id, rect: rectAt(o.x, o.z, 1.4, 1.4) }));
    const decor = DECOR_IDS.map((id) => ({ what: `decor ${id}`, rect: rectAt(DECOR[id].x, DECOR[id].z, 1.4, 1.4) }));
    const failed: string[] = [];
    for (const o of objects) {
      const rect = rectAt(o.object.x, o.object.z, 1.6, 1.6);
      failed.push(...clearanceFailures(o.id, rect, undefined, 0), ...levelFailures(o.id, rect));
      for (const p of [...yardPieces(), ...villagePieces(), ...decor, ...chests]) if (gap(rect, p.rect) < 1.0) failed.push(`${o.id} is within 1.0 of ${p.what}`);
      if (gap(rect, tower) < 1.5) failed.push(`${o.id} is within 1.5 of the Tower's plot`);
      for (const [name, line] of Object.entries(VILLAGE_TRACKS)) {
        for (let i = 0; i < line.length - 1; i++) if (segmentDistance(o.object, line[i], line[i + 1]) <= 1.4) failed.push(`${o.id} is within 1.4 of the ${name} track`);
      }
    }
    expect(failed).toEqual([]);
  });

  it("puts no stake in anything solid, whatever is built and whatever castle stands", () => {
    const footprints: R[] = [];
    for (const castleType of CASTLE_TIER_IDS) {
      const layout = buildWorldLayout({ castleType, buildings: BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true })) });
      for (const c of layout.colliders) footprints.push(rectAt(c.position.x, c.position.z, c.size.w, c.size.d));
    }
    for (const c of towerColliders(() => 0)) footprints.push(rectAt(c.x, c.z, c.hw * 2, c.hd * 2));
    const inside: string[] = [];
    for (const s of all) for (const f of footprints) if (hasPoint(grow(f, 0.3), at(s))) inside.push(`${s.id} is in ${JSON.stringify(f)}`);
    expect(inside).toEqual([]);
  });

  it("keeps the gate's stake 1.0 from every crown-ceremony mark, the hero's and each villager's, at every castle tier (RH-b)", () => {
    const gate = anchor("landmark:castle-gate");
    const near: string[] = [];
    for (const castleType of CASTLE_TIER_IDS) {
      const marks = ceremonyMarks(buildWorldLayout({ castleType, buildings: [] }));
      for (const [who, m] of [["hero", marks.hero], ...Object.entries(marks.villagers)] as [string, { x: number; z: number }][]) {
        const d = Math.hypot(gate.x - m.x, gate.z - m.z);
        if (d < 1.0) near.push(`the gate's stake is ${d.toFixed(2)} from ${who}'s mark (${castleType})`);
      }
    }
    expect(near).toEqual([]);
  });

  it("lists the stakes as spots, one constant with one identity", () => {
    expect(ANCHOR_SPOT).toEqual({ radius: 0.5, reach: 1.4 });
    expect(ANCHOR_SPOTS.map((s) => s.id)).toEqual([...ANCHOR_IDS]);
    for (const s of ANCHOR_SPOTS) expect(s).toEqual({ id: s.id, label: ANCHORS[s.id].label, x: ANCHORS[s.id].x, z: ANCHORS[s.id].z });
  });

  it("finds the near ones, nearest first, never itself", () => {
    const near = nearAnchors("landmark:well");
    expect(near).not.toContain("landmark:well");
    expect(near.length).toBeGreaterThan(0);
    const dist = (id: AnchorId) => Math.hypot(ANCHORS[id].x - ANCHORS["landmark:well"].x, ANCHORS[id].z - ANCHORS["landmark:well"].z);
    for (const id of near) expect(dist(id)).toBeLessThanOrEqual(10);
    expect([...near].sort((p, q) => dist(p) - dist(q))).toEqual(near);
    expect(nearAnchors("landmark:well", 0)).toEqual([]);
    expect(nearAnchors("landmark:well", 100)).toHaveLength(13);
  });
});

describe("the anchors' facts", () => {
  it("gives every anchor one to three short, true, child-safe facts", () => {
    expect(Object.keys(TRAIL_ANCHOR_FACTS)).toEqual([...ANCHOR_IDS]);
    for (const id of ANCHOR_IDS) {
      const facts = TRAIL_ANCHOR_FACTS[id];
      expect(facts.length, id).toBeGreaterThanOrEqual(1);
      expect(facts.length, id).toBeLessThanOrEqual(3);
      for (const f of facts) {
        expect(f.length, f).toBeLessThanOrEqual(120);
        expect(f, f).not.toMatch(/grades?|kindergarten/i);
        expect(f, f).not.toMatch(/\b(behind|ahead)\b/i);
        expect(f, f).not.toMatch(/</);
      }
    }
  });

  it("names the confusable pairs", () => {
    for (const p of CONFUSABLE_ANCHORS) {
      expect(isAnchorId(p.anchors[0])).toBe(true);
      expect(isAnchorId(p.anchors[1])).toBe(true);
      expect(p.anchors[0]).not.toBe(p.anchors[1]);
      expect(p.shared.length).toBeGreaterThan(0);
      for (const w of p.shared) expect(w, w).toBe(w.toLowerCase());
    }
    const has = (a: AnchorId, b: AnchorId) => CONFUSABLE_ANCHORS.some((p) => (p.anchors[0] === a && p.anchors[1] === b) || (p.anchors[0] === b && p.anchors[1] === a));
    expect(has("landmark:well", "object:water-trough")).toBe(true);
    expect(has("landmark:garden", "object:beehives")).toBe(true);
    expect(has("object:notice-board", "landmark:library")).toBe(true);
    expect(has("landmark:watchtower", "landmark:puzzle-tower")).toBe(true);
    const pair = (a: AnchorId, b: AnchorId) => CONFUSABLE_ANCHORS.find((p) => p.anchors.includes(a) && p.anchors.includes(b))!;
    expect(pair("landmark:well", "object:water-trough").shared).toEqual(expect.arrayContaining(["water", "drink", "drinks", "bucket"]));
    expect(pair("landmark:garden", "object:beehives").shared).toEqual(expect.arrayContaining(["bee", "bees", "honey", "flower", "flowers"]));
    expect(pair("landmark:watchtower", "landmark:puzzle-tower").shared).toEqual(["tower"]);
    expect(pair("object:notice-board", "landmark:library").shared).toEqual(expect.arrayContaining(["note", "notes", "read", "reading", "scroll", "scrolls", "news"]));
  });
});

/** The anchor by id, for the readable lines above. */
function anchor(id: AnchorId): Anchor {
  return ANCHORS[id];
}

describe("no spot in the village holds a stake, and no stake holds a spot (F-4, F-19)", () => {
  const stakes: InteractSpot[] = ANCHOR_SPOTS.map((s) => ({
    target: { kind: "landmark", id: s.id, label: s.label },
    x: s.x,
    z: s.z,
    hw: ANCHOR_SPOT.radius,
    hd: ANCHOR_SPOT.radius,
    round: true,
    reach: ANCHOR_SPOT.reach,
    bias: 0,
    ring: ANCHOR_SPOT.radius + 0.6,
  }));
  const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
  const plaques = placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque }));
  const locks = worldCanvas({ locksOn: true, runesOn: false, open: [], fixed: [], decor: [], tower: [] }).locks;

  const held: string[] = [];
  const kinds = new Set<string>();
  const label = (s: InteractSpot) => `${s.target.kind} ${s.target.id}`;
  for (const castleType of CASTLE_TIER_IDS) {
    for (const built of [true, false]) {
      const layout = buildWorldLayout({
        castleType,
        buildings: BUILDINGS.map((b) => ({ id: b.id, done: built ? b.deedsToBuild : 0, total: b.deedsToBuild, complete: built })),
      });
      const g = castlePlan(castleType).gate;
      const others = buildSpots({
        props: layout.props,
        sitePlan: PLOT_SCALE,
        landmarks: [],
        castle: { x: CASTLE_POSITION.x + g.x, z: CASTLE_POSITION.z + g.z, hw: g.hw, hd: g.hd, label: "your castle" },
        posts: [{ id: "village", ...VILLAGE_POST }],
        arch: { x: ARCH.x, z: ARCH.z, halfSpan: ARCH_HALF_SPAN },
        stones: RIDDLE_STONE_SPOTS,
        plans: KEEP_YARD.plansBoard,
        chronicle: KEEP_YARD.lectern,
        plaques,
        locks,
        tower: PUZZLE_TOWER.door,
      });
      for (const s of stakes) {
        for (const o of others) {
          kinds.add(o.target.kind);
          const tag = `(${castleType}, ${built ? "built" : "bare"})`;
          if (edgeDistance(o, s.x, s.z) <= o.reach) held.push(`${label(o)} holds the stake ${s.target.id} ${tag}`);
          if (edgeDistance(s, o.x, o.z) <= s.reach) held.push(`the stake ${s.target.id} holds ${label(o)} ${tag}`);
        }
      }
    }
  }

  it("holds none of the village's own spots, built or bare, at every castle tier", () => {
    expect([...new Set(held)]).toEqual([]);
  });

  it("checks every kind of spot the village builds, so a buildSpots change that drops one fails here", () => {
    expect([...kinds].sort()).toEqual(["arch", "castle", "chronicle", "lock", "plans", "plaque", "post", "riddle", "site", "tower", "villager"]);
  });

  it("holds no stake in another stake's reach", () => {
    const close: string[] = [];
    for (const p of stakes) for (const q of stakes) if (p !== q && edgeDistance(p, q.x, q.z) <= p.reach) close.push(`${p.target.id} holds ${q.target.id}`);
    expect(close).toEqual([]);
  });
});
