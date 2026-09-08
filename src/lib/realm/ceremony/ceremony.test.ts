import { describe, it, expect } from "vitest";
import {
  ceremonyMarks, startCeremony, stepCeremony, skipCeremony, ceremonyNotice,
  GATHER_MS, DESCEND_MS, HAIL_MS, WALK_TIMEOUT_MS, CROWN_HIGH, CROWN_LOW, MARK_RADIUS,
  type CeremonyState, type CeremonyStep,
} from "./ceremony";
import { buildWorldLayout, CASTLE_FOOTPRINTS, SPAWN, WORLD_SIZE, type Prop } from "../layout";
import { HERO_RADIUS } from "../movement";
import { VILLAGERS } from "../villagers";
import { BUILDINGS } from "@/lib/utils/kingdom";

const allBuilt = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
const layout = buildWorldLayout({ castleType: "keep", buildings: allBuilt });
const DT = 1 / 60;

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Steps for `seconds`, collecting the steps entered along the way. */
function run(state: CeremonyState, seconds: number, colliders: Prop[] = layout.colliders, reduced = false) {
  let s = state;
  const entered: CeremonyStep[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const r = stepCeremony(s, DT, colliders, reduced);
    s = r.state;
    if (r.entered) entered.push(r.entered);
  }
  return { state: s, entered };
}

describe("ceremonyMarks", () => {
  it("puts the hero on the path at the castle's south face and eight villagers in a half circle behind, clear of every solid prop, for every castle tier", () => {
    for (const castleType of Object.keys(CASTLE_FOOTPRINTS)) {
      const l = buildWorldLayout({ castleType, buildings: allBuilt });
      const castle = l.props.find((p) => p.kind === "castle")!;
      const marks = ceremonyMarks(l);
      expect(marks.hero.x).toBe(0);
      expect(marks.hero.z).toBeGreaterThan(castle.position.z + castle.size.d / 2 + HERO_RADIUS);
      expect(Object.keys(marks.villagers).sort()).toEqual(VILLAGERS.map((v) => v.id).sort());
      for (const m of [marks.hero, ...Object.values(marks.villagers)]) {
        expect(Math.abs(m.x)).toBeLessThan(WORLD_SIZE / 2);
        expect(Math.abs(m.z)).toBeLessThan(WORLD_SIZE / 2);
        for (const c of l.colliders) {
          const inside = Math.abs(m.x - c.position.x) < c.size.w / 2 + HERO_RADIUS && Math.abs(m.z - c.position.z) < c.size.d / 2 + HERO_RADIUS;
          expect(inside).toBe(false);
        }
      }
      for (const v of Object.values(marks.villagers)) expect(v.z).toBeGreaterThan(marks.hero.z);
    }
  });
});

describe("startCeremony", () => {
  it("begins with a walk from where everyone stands, the crown held high", () => {
    const s = startCeremony(layout, SPAWN, false);
    expect(s.step).toBe("walk");
    expect(s.hero).toEqual(SPAWN);
    expect(s.crownY).toBe(CROWN_HIGH);
    expect(s.skipped).toBe(false);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(v.position);
  });
  it("under reduced motion starts gathered at the marks with the crown already down", () => {
    const s = startCeremony(layout, SPAWN, true);
    expect(s.step).toBe("gather");
    expect(s.hero).toEqual(s.marks.hero);
    expect(s.crownY).toBe(CROWN_LOW);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(s.marks.villagers[v.id]);
  });
  it("only drives villagers the layout actually has", () => {
    const empty = buildWorldLayout({ castleType: "keep", buildings: [], villagers: false });
    expect(Object.keys(startCeremony(empty, SPAWN, false).villagers)).toEqual([]);
    expect(Object.keys(startCeremony(empty, SPAWN, true).villagers)).toEqual([]);
  });
});

describe("stepCeremony", () => {
  it("leaves every position finite on a zero-dt frame at the start of a fresh walk (R3F's first useFrame delta can be 0)", () => {
    const r = stepCeremony(startCeremony(layout, SPAWN, false), 0, layout.colliders, false);
    expect(Number.isFinite(r.state.hero.x)).toBe(true);
    expect(Number.isFinite(r.state.hero.z)).toBe(true);
    for (const p of Object.values(r.state.villagers)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
  it("walks everyone to their marks well inside the safety net, then gathers", () => {
    let s = startCeremony(layout, SPAWN, false);
    let seconds = 0;
    while (s.step === "walk" && seconds < WALK_TIMEOUT_MS / 1000) {
      s = stepCeremony(s, DT, layout.colliders, false).state;
      seconds += DT;
    }
    expect(s.step).toBe("gather");
    expect(seconds).toBeLessThan(15);
    // Well short of WALK_TIMEOUT_MS: it was arrival, not the safety net, that ended the walk.
    expect(seconds).toBeLessThan(WALK_TIMEOUT_MS / 1000);
    expect(dist(s.hero, s.marks.hero)).toBeLessThanOrEqual(MARK_RADIUS);
    for (const [id, p] of Object.entries(s.villagers)) expect(dist(p, s.marks.villagers[id])).toBeLessThanOrEqual(MARK_RADIUS);
  });
  it("walks the hero to the mark from off the path, without the villagers' corner-squaring waypoint", () => {
    // startCeremony takes wherever the player actually stands, not just SPAWN (which happens
    // to share the mark's x for every fixture above). A hero off the path still arrives.
    let s = startCeremony(layout, { x: 6, z: 12 }, false);
    let seconds = 0;
    while (s.step === "walk" && seconds < WALK_TIMEOUT_MS / 1000) {
      s = stepCeremony(s, DT, layout.colliders, false).state;
      seconds += DT;
    }
    expect(s.step).toBe("gather");
    expect(seconds).toBeLessThan(15);
    expect(dist(s.hero, s.marks.hero)).toBeLessThanOrEqual(MARK_RADIUS);
  });
  it("gathers, lowers the crown with an ease-out, hails, and finishes on the clock", () => {
    const start = startCeremony(layout, SPAWN, false);
    const gathered: CeremonyState = { ...start, step: "gather", hero: start.marks.hero, villagers: { ...start.marks.villagers } };
    const a = run(gathered, GATHER_MS / 1000 + DT);
    expect(a.entered).toEqual(["descend"]);
    const mid = run(a.state, DESCEND_MS / 2000).state;
    expect(mid.crownY).toBeLessThan(CROWN_HIGH);
    expect(mid.crownY).toBeGreaterThan(CROWN_LOW);
    expect(mid.crownY).toBeLessThan((CROWN_HIGH + CROWN_LOW) / 2); // ease-out: more than half way down at half time
    const b = run(a.state, DESCEND_MS / 1000 + DT);
    expect(b.entered).toEqual(["hail"]);
    expect(b.state.crownY).toBe(CROWN_LOW);
    const c = run(b.state, HAIL_MS / 1000 + DT);
    expect(c.entered).toEqual(["done"]);
    expect(stepCeremony(c.state, DT, layout.colliders, false)).toEqual({ state: c.state, entered: null });
  });
  it("under reduced motion goes gather → hail → done with no descend", () => {
    const s = startCeremony(layout, SPAWN, true);
    const r = run(s, (GATHER_MS + HAIL_MS) / 1000 + 2 * DT, layout.colliders, true);
    expect(r.entered).toEqual(["hail", "done"]);
  });
  it("turns to face the walk direction as stepHero computes it, then faces north once gathered", () => {
    let s = startCeremony(layout, { x: 6, z: 12 }, false);
    let facedWest = false;
    let seconds = 0;
    while (s.step === "walk" && seconds < WALK_TIMEOUT_MS / 1000) {
      s = stepCeremony(s, DT, layout.colliders, false).state;
      if (s.heroFacing === "w") facedWest = true;
      seconds += DT;
    }
    expect(s.step).toBe("gather");
    expect(facedWest).toBe(true);
    expect(s.heroFacing).toBe("n");
  });
  it("proceeds to gather after the safety net when the hero cannot reach the mark", () => {
    const wall: Prop = { id: "wall", kind: "barrier", label: "", position: { x: 0, z: 0 }, size: { w: WORLD_SIZE, d: 1, h: 1 }, color: "#000000", solid: true };
    const r = run(startCeremony(layout, SPAWN, false), WALK_TIMEOUT_MS / 1000 + 1, [...layout.colliders, wall]);
    expect(r.entered[0]).toBe("gather");
    expect(r.state.hero.z).toBeGreaterThan(0);
  });
});

describe("skipCeremony", () => {
  it("jumps to hail with everyone at their marks and the crown down, then finishes after HAIL_MS", () => {
    const s = skipCeremony(startCeremony(layout, SPAWN, false));
    expect(s.step).toBe("hail");
    expect(s.skipped).toBe(true);
    expect(s.crownY).toBe(CROWN_LOW);
    expect(s.hero).toEqual(s.marks.hero);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(s.marks.villagers[v.id]);
    expect(run(s, HAIL_MS / 1000 + DT).entered).toEqual(["done"]);
  });
  it("changes nothing once hailing or done", () => {
    const hailing = skipCeremony(startCeremony(layout, SPAWN, false));
    expect(skipCeremony(hailing)).toBe(hailing);
    const finished = run(hailing, HAIL_MS / 1000 + DT).state;
    expect(skipCeremony(finished)).toBe(finished);
  });
});

describe("ceremonyNotice", () => {
  it("speaks at the gather and the hail only", () => {
    expect(ceremonyNotice("gather", "Emma", "Copper Circlet")).toBe("The people of the Realm gather.");
    expect(ceremonyNotice("hail", "Emma", "Copper Circlet")).toBe("Hail, Emma, Copper Circlet!");
    expect(ceremonyNotice("walk", "Emma", "Copper Circlet")).toBeNull();
    expect(ceremonyNotice("descend", "Emma", "Copper Circlet")).toBeNull();
    expect(ceremonyNotice("done", "Emma", "Copper Circlet")).toBeNull();
  });
});
