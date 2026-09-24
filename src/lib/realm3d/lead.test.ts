import { describe, expect, it } from "vitest";
import { buildWorldLayout, SCENERY, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { buildColliders, overlaps, type Collider } from "./collision";
import { castlePlan } from "./castle-plan";
import { realmWorld } from "./worldgen";
import { buildTravelGraph, resample, routeLength, VILLAGE_HUB, type Vec2 } from "./travel";
import { buildDoors } from "./doorways";
import { ringCourse } from "./recess/course";
import {
  chooseErrand,
  doorInReach,
  errandHolds,
  errandHome,
  ERRAND_MAX,
  makeErrandPick,
  planErrand,
  setLeadBreakOff,
  setLeadErrand,
  SNIFF_RANGE,
  SNIFF_SHORT,
  startErrand,
  stepErrand,
  TROUBLE_HOLD_S,
  TROUBLE_RANGE,
  TROUBLE_STAND,
  type ErrandInput,
  type GleamLike,
  type LeadNews,
  type TroubleLike,
} from "./lead";
import {
  arrivalFor,
  askLead,
  askStopLead,
  chooseLead,
  clearLine,
  depthAt,
  gridPath,
  LEAD_AHEAD_MAX,
  LEAD_ARRIVE_HOLD,
  LEAD_BESIDE,
  LEAD_DEEP,
  LEAD_GIVE_UP,
  LEAD_GOAL_NEAR,
  leadGrid,
  makeLeadBus,
  makeLeadStep,
  PET_CLEAR,
  placeStand,
  planLead,
  plotsOf,
  routeAt,
  startLead,
  stepLead,
  stretch,
  wildSolid,
  type LeadContext,
  type LeadEvent,
  type LeadRun,
  type LeadTarget,
} from "./lead";

const world = realmWorld();
const graph = buildTravelGraph(world.landmarks, world.roads);

/**
 * Everything the scene stops a walker with, as the scene builds it: the whole village raised,
 * the biggest castle standing, and a disc at every landmark's heart at least as wide as the
 * widest thing `landmarks.tsx` builds there (3.4).
 */
function villageSolids(tier = "citadel"): Collider[] {
  const buildings: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true }));
  const layout = buildWorldLayout({ castleType: tier, buildings, objectiveIds: [] });
  const OPTS = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };
  const solids: Collider[] = buildColliders(layout.props.filter((p) => p.kind !== "castle"), SCENERY, OPTS).solids;
  const c = layout.props.find((p) => p.kind === "castle")!;
  for (const b of castlePlan(layout.castleType).solids) solids.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z });
  for (const l of world.landmarks) solids.push({ x: l.position.x, z: l.position.z, hw: 3.5, hd: 3.5, round: true, base: l.y - 1, top: l.y + 9 });
  return solids;
}

const solids = villageSolids();
const ctx: LeadContext = { graph, world, solids };
const SPAWN = { x: 0, z: 15 };

/** Every solid a route passes — the village's, the castle's, the landmarks' and the wilderness's — and all deep water. */
function crossings(route: Vec2[]): string[] {
  const bad: string[] = [];
  for (const q of resample(route, 0.25)) {
    const hit = solids.find((s) => overlaps(s, q.x, q.z, PET_CLEAR - 0.15));
    if (hit) bad.push(`(${q.x.toFixed(1)}, ${q.z.toFixed(1)}) in a solid at (${hit.x.toFixed(1)}, ${hit.z.toFixed(1)})`);
    world.forEachPropNear(q.x, q.z, 4, (p) => {
      const c = wildSolid(p);
      if (c && overlaps(c, q.x, q.z, PET_CLEAR - 0.15)) bad.push(`(${q.x.toFixed(1)}, ${q.z.toFixed(1)}) in a ${p.variant} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    });
    const d = depthAt(world, q.x, q.z);
    if (d > LEAD_DEEP) bad.push(`(${q.x.toFixed(1)}, ${q.z.toFixed(1)}) in water ${d.toFixed(2)} deep`);
  }
  return bad;
}

const place = (id: string): LeadTarget => {
  const l = world.landmarks.find((x) => x.id === id)!;
  return { kind: "place", id, name: l.name, x: l.position.x, z: l.position.z };
};
const HOME: LeadTarget = { kind: "home", id: "village", name: "the village", x: VILLAGE_HUB.x, z: VILLAGE_HUB.z };

describe("a lead's route", () => {
  it("from the village to every place walks a real way: never through a solid, never into deep water", () => {
    for (const l of world.landmarks) {
      const route = planLead(ctx, SPAWN, place(l.id));
      expect(route.length, `no route to ${l.id}`).toBeGreaterThan(2);
      expect(crossings(route), l.id).toEqual([]);
      // It ends inside the place, so the map counts it found.
      const end = route[route.length - 1];
      expect(Math.hypot(end.x - l.position.x, end.z - l.position.z), `${l.id} ends at (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`).toBeLessThan(l.radius);
    }
  });

  it("from every place back home walks a real way too", () => {
    for (const l of world.landmarks) {
      const from = placeStand(graph, world, l.id)!;
      const route = planLead(ctx, from, HOME);
      expect(route.length, `no way home from ${l.id}`).toBeGreaterThan(2);
      expect(crossings(route), l.id).toEqual([]);
      const end = route[route.length - 1];
      expect(Math.hypot(end.x - VILLAGE_HUB.x, end.z - VILLAGE_HUB.z)).toBeLessThan(3);
    }
  });

  it("from open country, off every road, finds the road and never crosses anything on the way", () => {
    // A spread of dry starting points over the island, well away from the village.
    const starts: Vec2[] = [];
    for (let x = -240; x <= 240; x += 120) {
      for (let z = -240; z <= 240; z += 120) {
        if (Math.hypot(x, z) < 60) continue;
        // Nudge onto dry ground, clear of every tree.
        for (let k = 0; k < 40; k++) {
          const p = { x: x + (k % 7) * 3, z: z + Math.floor(k / 7) * 3 };
          if (depthAt(world, p.x, p.z) > 0) continue;
          let clear = true;
          world.forEachPropNear(p.x, p.z, 3, (q) => {
            const c = wildSolid(q);
            if (c && overlaps(c, p.x, p.z, 1)) clear = false;
          });
          if (clear) {
            starts.push(p);
            break;
          }
        }
      }
    }
    expect(starts.length).toBeGreaterThan(8);
    let led = 0;
    for (const s of starts) {
      const route = planLead(ctx, s, HOME);
      if (route.length < 2) continue; // an island of dry ground in the sea: no way, and it says so
      led++;
      expect(crossings(route), `from (${s.x}, ${s.z})`).toEqual([]);
    }
    expect(led).toBeGreaterThan(starts.length * 0.7);
  });

  it("keeps to the roads across the island rather than cutting across country", () => {
    const route = planLead(ctx, SPAWN, place("highcairn"));
    // The village track to Highcairn: down the cobbles, west along z 4, south along x -19.
    expect(route.some((p) => Math.abs(p.z - 4) < 0.5 && p.x < -10)).toBe(true);
    expect(route.some((p) => Math.abs(p.x + 19) < 0.5 && p.z < -5)).toBe(true);
  });

  it("near the target is one search over the ground, round whatever is in the way", () => {
    // Straight across the village from the spawn would go through the buildings; it goes round.
    const route = planLead(ctx, SPAWN, { kind: "villager", id: "x", name: "X", x: -14, z: -6 });
    expect(route.length).toBeGreaterThan(2);
    expect(crossings(route)).toEqual([]);
    expect(routeLength(route)).toBeLessThan(80);
  });

  it("stops beside a villager, not in them, and the lead is done where E reaches them", () => {
    const bram: LeadTarget = { kind: "villager", id: "bram", name: "Old Bram", x: -14, z: -6 };
    const route = planLead(ctx, SPAWN, bram);
    const end = route[route.length - 1];
    const d = Math.hypot(end.x - bram.x, end.z - bram.z);
    expect(d).toBeGreaterThan(LEAD_BESIDE - 0.3);
    expect(d).toBeLessThan(LEAD_BESIDE + 0.3);
    expect(arrivalFor(bram, route)).toEqual({ x: -14, z: -6, r: 3.2 });
    // Three units off, from any side: in E's reach, so the lead is done.
    const at = startLead(route, arrivalFor(bram, route))!;
    expect(stepLead(at, bram.x + 3, bram.z, 0, 1 / 60, false, makeLeadStep())).toBe("arrive");
    const far = startLead(route, arrivalFor(bram, route))!;
    expect(stepLead(far, bram.x + 5, bram.z, 0, 1 / 60, false, makeLeadStep())).toBeNull();
  });

  it("walks round the village's unbuilt plots, down the lanes beside them", () => {
    const layout = buildWorldLayout({ castleType: "campsite", buildings: BUILDINGS.map((b) => ({ id: b.id, done: 0, total: 5, complete: false })), objectiveIds: [] });
    const soft = plotsOf(layout.props);
    expect(soft.length).toBeGreaterThan(3);
    const on = (route: Vec2[]) => resample(route, 0.25).filter((q) => soft.some((r) => Math.abs(q.x - r.x) < r.hw - 0.5 && Math.abs(q.z - r.z) < r.hd - 0.5)).length * 0.25;
    const target: LeadTarget = { kind: "villager", id: "x", name: "X", x: -4.5, z: 12 };
    const from = { x: 24, z: 4 };
    const across = planLead({ graph, world, solids }, from, target);
    const round = planLead({ graph, world, solids, soft }, from, target);
    expect(crossings(round)).toEqual([]);
    expect(on(round)).toBeLessThan(on(across) + 1e-9);
    expect(on(round)).toBeLessThan(3);
  });

  it("finds no way into a box with no door, and says so", () => {
    const shut: Collider[] = [
      { x: 150, z: 150, hw: 6, hd: 0.5, round: false, base: -9, top: 20 },
      { x: 150, z: 162, hw: 6, hd: 0.5, round: false, base: -9, top: 20 },
      { x: 144, z: 156, hw: 0.5, hd: 6.5, round: false, base: -9, top: 20 },
      { x: 156, z: 156, hw: 0.5, hd: 6.5, round: false, base: -9, top: 20 },
    ];
    const g = leadGrid({ graph, world, solids: shut }, { x: 130, z: 156 }, { x: 150, z: 156 }, 6);
    expect(gridPath(g, { x: 130, z: 156 }, { x: 150, z: 156 })).toBeNull();
    expect(clearLine(g, { x: 130, z: 156 }, { x: 150, z: 156 })).toBe(false);
  });

  it("a place's stand is inside the place and clear of what stands at its heart", () => {
    for (const l of world.landmarks) {
      const s = placeStand(graph, world, l.id)!;
      const d = Math.hypot(s.x - l.position.x, s.z - l.position.z);
      expect(d).toBeLessThan(l.radius);
      expect(d).toBeGreaterThan(3.5 + PET_CLEAR - 0.2);
    }
  });

  it("cuts a stretch of a polyline out, either way along it", () => {
    const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];
    expect(stretch(line, 5, 15)).toEqual([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    expect(stretch(line, 15, 5)).toEqual([{ x: 10, z: 5 }, { x: 10, z: 0 }, { x: 5, z: 0 }]);
  });
});

describe("where the pet takes a child who asks", () => {
  const landmarks = [
    { id: "a", name: "Near Place", position: { x: 50, z: 0 } },
    { id: "b", name: "Far Place", position: { x: 200, z: 0 } },
  ];
  const bram = { on: true, x: 0, z: 40, name: "Old Bram", id: "bram" };
  const nobody = { on: false, x: 0, z: 0, name: "", id: "" };

  it("to whoever is waiting — the gold !'s villager — first", () => {
    const c = chooseLead({ x: 0, z: 0 }, bram, landmarks, new Set());
    expect(c).toEqual({ ok: true, target: { kind: "villager", id: "bram", name: "Old Bram", x: 0, z: 40 } });
  });

  it("standing by them already, to the nearest place not yet found", () => {
    const c = chooseLead({ x: 0, z: 40 - LEAD_GOAL_NEAR + 1 }, bram, landmarks, new Set());
    expect(c.ok && c.target).toMatchObject({ kind: "place", id: "a" });
    const d = chooseLead({ x: 0, z: 0 }, nobody, landmarks, new Set(["a"]));
    expect(d.ok && d.target).toMatchObject({ kind: "place", id: "b" });
  });

  it("home when every place is found and home is far, and nowhere when there is nothing to do", () => {
    const all = new Set(["a", "b"]);
    expect(chooseLead({ x: 150, z: 0 }, nobody, landmarks, all)).toMatchObject({ ok: true, target: { kind: "home" } });
    expect(chooseLead({ x: 0, z: 10 }, nobody, landmarks, all)).toEqual({ ok: false, reason: "nothing" });
    expect(chooseLead({ x: 0, z: 39 }, bram, landmarks, all)).toEqual({ ok: false, reason: "here" });
  });
});

/* ------------------------------------------------------------------ leading */

/** A straight 100-unit road east. */
const LINE = resample([{ x: 0, z: 0 }, { x: 100, z: 0 }], 2);

type Sim = { run: LeadRun; out: ReturnType<typeof makeLeadStep>; events: LeadEvent[] };
function sim(route = LINE): Sim {
  return { run: startLead(route)!, out: makeLeadStep(), events: [] };
}
/** Steps the lead for `secs` with the child at `kid()` moving at `speed`. */
function run(s: Sim, secs: number, kid: (t: number) => Vec2, speed: number, calm = false, dt = 1 / 60) {
  for (let t = 0; t < secs; t += dt) {
    const k = kid(t);
    const e = stepLead(s.run, k.x, k.z, speed, dt, calm, s.out);
    if (e) s.events.push(e);
  }
}

describe("leading", () => {
  it("runs ahead of a walking child at a distance they can read", () => {
    const s = sim();
    let x = 0;
    run(s, 4, (t) => ({ x: (x = 11 * t), z: 0 }), 11);
    const ahead = s.out.x - x;
    expect(ahead).toBeGreaterThan(3);
    expect(ahead).toBeLessThan(13);
    expect(s.run.mode).toBe("lead");
    // Facing the way it is going: east.
    expect(s.out.heading).toBeCloseTo(Math.PI / 2, 1);
  });

  it("stays ahead of a child on a galloping mount, further out", () => {
    const s = sim(resample([{ x: 0, z: 0 }, { x: 300, z: 0 }], 2));
    let x = 0;
    run(s, 5, (t) => ({ x: (x = 20 * t), z: 0 }), 20);
    const ahead = s.out.x - x;
    expect(ahead).toBeGreaterThan(5);
    expect(ahead).toBeLessThanOrEqual(LEAD_AHEAD_MAX + 1);
  });

  it("waits when the child stops, and turns to look back at them", () => {
    const s = sim();
    run(s, 2, (t) => ({ x: 11 * t, z: 0 }), 11);
    run(s, 2, () => ({ x: 22, z: 0 }), 0);
    const where = s.out.x;
    run(s, 3, () => ({ x: 22, z: 0 }), 0);
    expect(s.out.x).toBeCloseTo(where, 3);
    expect(s.out.speed).toBe(0);
    expect(s.run.mode).toBe("wait");
    // Looking back west, at the child.
    expect(Math.abs(Math.abs(s.out.heading) - Math.PI / 2)).toBeLessThan(0.2);
    expect(s.out.heading).toBeLessThan(0);
  });

  it("comes back along its route when the child wanders off it, and gives up when they are gone", () => {
    const s = sim();
    run(s, 2, (t) => ({ x: 11 * t, z: 0 }), 11);
    const out = s.out.x;
    // Off to the south, from x 22.
    run(s, 1.5, (t) => ({ x: 22, z: 12 + t * 4 }), 4);
    expect(s.run.mode).toBe("back");
    expect(s.out.x).toBeLessThan(out);
    expect(Math.abs(s.out.z)).toBeLessThan(1e-6);
    expect(s.events).not.toContain("lost");
    run(s, 10, (t) => ({ x: 22, z: 18 + t * 4 }), 4);
    expect(s.events).toContain("lost");
    expect(LEAD_GIVE_UP).toBeGreaterThan(20);
  });

  it("goes back to leading when the child comes back to the route", () => {
    const s = sim();
    run(s, 2, (t) => ({ x: 11 * t, z: 0 }), 11);
    run(s, 1, () => ({ x: 22, z: 14 }), 0);
    expect(s.run.mode).toBe("back");
    run(s, 2, (t) => ({ x: 22 + 5 * t, z: 1 }), 5);
    expect(["lead", "wait"]).toContain(s.run.mode);
  });

  it("walks back toward a child who turns round on the road, past a little slack", () => {
    const s = sim();
    run(s, 4, (t) => ({ x: 11 * t, z: 0 }), 11);
    const far = s.out.x;
    run(s, 3, (t) => ({ x: 44 - 11 * t, z: 0 }), 11);
    expect(s.out.x).toBeLessThan(far - 10);
  });

  it("arrives when the child does, waits a moment by the place, and is done", () => {
    const s = sim();
    run(s, 12, (t) => ({ x: Math.min(100, 11 * t), z: 0 }), 11);
    expect(s.events).toContain("arrive");
    expect(s.events.indexOf("arrive")).toBeLessThan(s.events.indexOf("done"));
    expect(s.out.x).toBeCloseTo(100, 1);
    const t = sim();
    run(t, 100 / 11 + 0.2, (u) => ({ x: Math.min(100, 11 * u), z: 0 }), 11);
    expect(t.events).toEqual(["arrive"]);
    run(t, LEAD_ARRIVE_HOLD, () => ({ x: 100, z: 0 }), 0);
    expect(t.events).toContain("done");
  });

  it("only ever stands on its route: out of every wall, whatever the child does", () => {
    const bend = resample([{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 }], 2);
    const s = sim(bend);
    const at = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let t = 0; t < 12; t += 1 / 60) {
      // A child zigzagging about, near and off the route.
      const k = { x: 10 + Math.sin(t) * 14, z: 10 + Math.cos(t * 1.3) * 14 };
      stepLead(s.run, k.x, k.z, 8, 1 / 60, false, s.out);
      routeAt(s.run, s.run.s, at);
      expect(Math.hypot(at.x - s.out.x, at.z - s.out.z)).toBeLessThan(1e-9);
      const onRoute = Math.min(
        Math.abs(s.out.z) + Math.max(0, s.out.x - 20),
        Math.abs(s.out.x - 20),
        Math.abs(s.out.z - 20),
      );
      expect(onRoute).toBeLessThan(1e-6);
    }
  });

  it("is gentler in calm mode: nearer, and never sprinting", () => {
    const wild = sim();
    const calm = sim();
    let top = 0;
    let topCalm = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      stepLead(wild.run, 0, 0, 0, 1 / 60, false, wild.out);
      stepLead(calm.run, 0, 0, 0, 1 / 60, true, calm.out);
      top = Math.max(top, wild.out.speed);
      topCalm = Math.max(topCalm, calm.out.speed);
    }
    expect(calm.out.x).toBeLessThan(wild.out.x);
    expect(topCalm).toBeLessThan(top);
  });

  it("allocates nothing a frame", () => {
    const s = sim();
    const before = s.out;
    run(s, 1, (t) => ({ x: 11 * t, z: 0 }), 11);
    expect(s.out).toBe(before);
  });
});

describe("the lead bus", () => {
  it("carries an ask to the canvas and a stop only while leading", () => {
    const lead = makeLeadBus(true);
    expect(lead).toMatchObject({ ask: null, stop: false, active: false, mode: "heel", calm: true });
    askLead(lead, HOME);
    expect(lead.ask).toBe(HOME);
    askStopLead(lead);
    expect(lead.ask).toBeNull();
    expect(lead.stop).toBe(false);
    lead.active = true;
    askStopLead(lead);
    expect(lead.stop).toBe(true);
    askLead(lead, HOME);
    expect(lead.stop).toBe(false);
  });
});

/* ------------------------------------------------------------------ errands */

const RAISED = buildWorldLayout({ castleType: "citadel", buildings: BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true })), objectiveIds: [] });
const DOORS = buildDoors({ props: RAISED.props, sitePlan: 1.5, castle: null });
const NO_GLEAMS: GleamLike[] = [];

function errandInput(o: Partial<ErrandInput> = {}): ErrandInput {
  return { hero: { x: 0, z: 30 }, heroFacing: null, pet: { x: 0, z: 31 }, leading: false, doors: DOORS, gleams: null, slots: 0, troubles: null, seen: () => false, ...o };
}
const gleam = (x: number, z: number, live = true): GleamLike => ({ live, x, z });
const trouble = (x: number, z: number, o: Partial<TroubleLike> = {}): TroubleLike => ({ live: true, dying: false, x, z, serial: 1, ...o });
/** Facing from (x, z) toward (tx, tz), as the hero's heading is kept. */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

describe("the pet's errands: which, and when", () => {
  it("has doors to sit at: every raised building with an inside", () => {
    expect(DOORS.length).toBeGreaterThan(4);
  });

  it("sits at a door the child is turned toward and near — beating a gleam near them (sit > sniff)", () => {
    const d = DOORS[0];
    const hero = { x: d.x, z: d.face + 3.5 };
    const pick = makeErrandPick();
    const input = errandInput({ hero, heroFacing: facing(hero.x, hero.z, d.x, d.face), gleams: [gleam(hero.x + 4, hero.z + 2)], slots: 1 });
    expect(chooseErrand(input, pick)).toBe(true);
    expect(pick.kind).toBe("sit");
    expect(pick.key).toBe(0);
    // Beside the door on the step, looking at it.
    expect(Math.abs(pick.x - d.x)).toBeGreaterThan(d.hw);
    expect(pick.z).toBeGreaterThan(d.face);
    expect(pick.lookZ).toBeLessThan(d.face);
  });

  it("never sits for a child walking PAST a door, or behind the building, or far off", () => {
    const d = DOORS[0];
    // Walking east along the front of the house, coming level with the door and past it.
    expect(doorInReach(DOORS, { x: d.x - 1, z: d.face + 4 }, 5, Math.PI / 2)).not.toBe(0);
    expect(doorInReach(DOORS, { x: d.x + 2, z: d.face + 3 }, 5, Math.PI / 2)).not.toBe(0);
    expect(doorInReach(DOORS, { x: d.x, z: d.face - 3 }, 5, null)).not.toBe(0);
    expect(doorInReach(DOORS, { x: d.x, z: d.face + 9 }, 5, facing(d.x, d.face + 9, d.x, d.face))).not.toBe(0);
    // On the step itself, facing any way, it is the door in reach.
    expect(doorInReach(DOORS, { x: d.x, z: d.face + 1 }, 5, Math.PI / 2)).toBe(0);
  });

  it("sniffs out the gleam nearest the child during a run, noses up to it, and never past SNIFF_RANGE", () => {
    const pick = makeErrandPick();
    const hero = { x: 60, z: 60 };
    const input = errandInput({ hero, pet: { x: 59, z: 59 }, gleams: [gleam(70, 60), gleam(64, 60), gleam(61, 60, false)], slots: 3 });
    expect(chooseErrand(input, pick)).toBe(true);
    expect(pick).toMatchObject({ kind: "sniff", key: 1, lookX: 64, lookZ: 60 });
    expect(Math.hypot(pick.x - 64, pick.z - 60)).toBeCloseTo(SNIFF_SHORT);
    // Out of range, or outside the run's slots, or no run: nothing to sniff.
    expect(chooseErrand(errandInput({ hero, gleams: [gleam(60 + SNIFF_RANGE + 1, 60)], slots: 1 }), pick)).toBe(false);
    expect(chooseErrand(errandInput({ hero, gleams: [gleam(64, 60)], slots: 0 }), pick)).toBe(false);
    expect(chooseErrand(errandInput({ hero, gleams: null }), pick)).toBe(false);
  });

  it("while an asked lead runs, only a trouble takes the pet off it — never a door or a gleam", () => {
    const d = DOORS[0];
    const hero = { x: d.x, z: d.face + 3 };
    const pick = makeErrandPick();
    const leading = errandInput({ hero, heroFacing: facing(hero.x, hero.z, d.x, d.face), leading: true, gleams: [gleam(hero.x + 2, hero.z)], slots: 1 });
    expect(chooseErrand(leading, pick)).toBe(false);
    const pet = { x: 100, z: 100 };
    expect(chooseErrand({ ...leading, pet, troubles: [trouble(106, 100)] }, pick)).toBe(true);
    expect(pick).toMatchObject({ kind: "trouble", key: 0, serial: 1, lookX: 106, lookZ: 100 });
    // A stand-off short of it, on the pet's own side.
    expect(Math.hypot(pick.x - 106, pick.z - 100)).toBeCloseTo(TROUBLE_STAND);
    expect(pick.x).toBeLessThan(106);
  });

  it("breaks off only for a live trouble within range, not one dying, cleared, far, or already pointed out this lead", () => {
    const pet = { x: 100, z: 100 };
    const pick = makeErrandPick();
    const at = (troubles: TroubleLike[], seen: ErrandInput["seen"] = () => false) => chooseErrand(errandInput({ pet, leading: true, troubles, seen }), pick);
    expect(at([trouble(100 + TROUBLE_RANGE + 0.5, 100)])).toBe(false);
    expect(at([trouble(104, 100, { dying: true })])).toBe(false);
    expect(at([trouble(104, 100, { live: false })])).toBe(false);
    expect(at([trouble(104, 100, { serial: 7 })], (slot, serial) => slot === 0 && serial === 7)).toBe(false);
    // The same slot respawned is a new trouble.
    expect(at([trouble(104, 100, { serial: 8 })], (slot, serial) => slot === 0 && serial === 7)).toBe(true);
  });

  it("at simple depth and under fewer choices — troubles withheld — never breaks off (T-COMP-3, T-COMP-4)", () => {
    const pick = makeErrandPick();
    expect(chooseErrand(errandInput({ pet: { x: 100, z: 100 }, leading: true, troubles: null }), pick)).toBe(false);
  });

  it("with nothing to do, stays at heel", () => {
    expect(chooseErrand(errandInput({ doors: [], gleams: NO_GLEAMS }), makeErrandPick())).toBe(false);
  });
});

describe("an errand's way", () => {
  it("to every door's seat, from a child walking up to it, never crosses a solid or deep water", () => {
    for (const d of DOORS) {
      const hero = { x: d.x, z: d.face + 4 };
      const pick = makeErrandPick();
      expect(chooseErrand(errandInput({ hero, heroFacing: facing(hero.x, hero.z, d.x, d.face), pet: { x: hero.x - 1.2, z: hero.z + 1 } }), pick), d.site).toBe(true);
      const way = planErrand(ctx, { x: hero.x - 1.2, z: hero.z + 1 }, pick);
      expect(way, `no way to ${d.site}'s door`).not.toBeNull();
      expect(crossings(way!), d.site).toEqual([]);
      // It gets to the step: within a cell of the seat.
      const end = way![way!.length - 1];
      expect(Math.hypot(end.x - pick.x, end.z - pick.z), d.site).toBeLessThan(1.2);
    }
  });

  it("to gleams all round the Ring, never crosses a solid or deep water", () => {
    const course = ringCourse();
    let planned = 0;
    for (let k = 0; k < 60; k++) {
      const a = course.path[k % (course.path.length - 1)];
      const b = course.path[(k % (course.path.length - 1)) + 1];
      const t = (k * 0.37) % 1;
      const on = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const side = k % 2 ? 1 : -1;
      const g = { x: on.x + side * (2.5 + (k % 7)), z: on.z - side * 1.5 };
      if (depthAt(world, g.x, g.z) > 0.15) continue;
      const pick = makeErrandPick();
      if (!chooseErrand(errandInput({ hero: on, pet: { x: on.x - 1, z: on.z - 1 }, doors: [], gleams: [gleam(g.x, g.z)], slots: 1 }), pick)) continue;
      const way = planErrand(ctx, { x: on.x - 1, z: on.z - 1 }, pick);
      if (!way) continue;
      planned++;
      expect(crossings(way), `gleam ${k} at (${g.x.toFixed(1)}, ${g.z.toFixed(1)})`).toEqual([]);
    }
    expect(planned).toBeGreaterThan(40);
  });

  it("off a lead's route toward a trouble by every place, never crosses a solid or deep water", () => {
    for (const l of world.landmarks) {
      const from = placeStand(graph, world, l.id)!;
      for (const [dx, dz] of [[7, 0], [0, 7], [-6, -4]]) {
        const t = { x: from.x + dx, z: from.z + dz };
        const pick = makeErrandPick();
        if (!chooseErrand(errandInput({ pet: from, leading: true, troubles: [trouble(t.x, t.z)] }), pick)) continue;
        const way = planErrand(ctx, from, pick);
        if (way) expect(crossings(way), `${l.id} +(${dx}, ${dz})`).toEqual([]);
      }
    }
  });

  it("is a small job or none: too far, and the pet stays put", () => {
    expect(planErrand(ctx, { x: 0, z: 30 }, { x: 0, z: 30 + ERRAND_MAX + 5 })).toBeNull();
  });
});

describe("running an errand", () => {
  const line = resample([{ x: 0, z: 0 }, { x: 12, z: 0 }], 1.5);
  const pickAt = (kind: "sniff" | "sit" | "trouble") => ({ ...makeErrandPick(), kind, lookX: 12, lookZ: 5, key: 0, serial: 3 });

  it("goes to the spot along its way, stands there facing what it came for, and comes back the same way", () => {
    const run = startErrand(line, pickAt("trouble"))!;
    const out = makeLeadStep();
    let there = false;
    for (let t = 0; t < 4 && !there; t += 1 / 60) there = stepErrand(run, 1 / 60, false, out) === "there";
    expect(there).toBe(true);
    expect(out.x).toBeCloseTo(12);
    stepErrand(run, 1 / 60, false, out);
    expect(out.speed).toBe(0);
    expect(out.heading).toBeCloseTo(Math.atan2(0, 5));
    expect(run.since).toBeGreaterThan(0);
    errandHome(run);
    let home = false;
    for (let t = 0; t < 4 && !home; t += 1 / 60) {
      home = stepErrand(run, 1 / 60, false, out) === "home";
      // Only ever on its way.
      expect(Math.abs(out.z)).toBeLessThan(1e-9);
    }
    expect(home).toBe(true);
    expect(out.x).toBeCloseTo(0);
  });

  it("is gentler in calm mode", () => {
    const a = startErrand(line, pickAt("sniff"))!;
    const b = startErrand(line, pickAt("sniff"))!;
    const oa = makeLeadStep();
    const ob = makeLeadStep();
    let top = 0;
    let topCalm = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      stepErrand(a, 1 / 60, false, oa);
      stepErrand(b, 1 / 60, true, ob);
      top = Math.max(top, oa.speed);
      topCalm = Math.max(topCalm, ob.speed);
    }
    expect(topCalm).toBeLessThan(top);
    expect(ob.x).toBeLessThan(oa.x);
  });

  it("allocates nothing a frame", () => {
    const run = startErrand(line, pickAt("sit"))!;
    const out = makeLeadStep();
    const route = run.route;
    for (let t = 0; t < 1; t += 1 / 60) stepErrand(run, 1 / 60, false, out);
    expect(run.route).toBe(route);
  });

  it("holds while its reason stands, and lets go when it is gone", () => {
    const g = [gleam(5, 0)];
    const sniff = startErrand(line, { ...pickAt("sniff"), key: 0 })!;
    expect(errandHolds(sniff, errandInput({ hero: { x: 0, z: 0 }, gleams: g, slots: 1 }))).toBe(true);
    // Taken, or the run over, or the child gone off.
    expect(errandHolds(sniff, errandInput({ hero: { x: 0, z: 0 }, gleams: [gleam(5, 0, false)], slots: 1 }))).toBe(false);
    expect(errandHolds(sniff, errandInput({ hero: { x: 0, z: 0 }, gleams: null }))).toBe(false);
    expect(errandHolds(sniff, errandInput({ hero: { x: 40, z: 0 }, gleams: g, slots: 1 }))).toBe(false);

    const t = [trouble(8, 0, { serial: 3 })];
    const watch = startErrand(line, pickAt("trouble"))!;
    const hero = { x: 2, z: 0 };
    expect(errandHolds(watch, errandInput({ hero, troubles: t }))).toBe(true);
    expect(errandHolds(watch, errandInput({ hero, troubles: [trouble(8, 0, { serial: 3, dying: true })] }))).toBe(false);
    expect(errandHolds(watch, errandInput({ hero, troubles: [trouble(8, 0, { serial: 4 })] }))).toBe(false);
    // The child walked on past it.
    expect(errandHolds(watch, errandInput({ hero: { x: 40, z: 0 }, troubles: t }))).toBe(false);
    // ...or did nothing about it for long enough: the pet leads on.
    watch.since = TROUBLE_HOLD_S + 0.1;
    expect(errandHolds(watch, errandInput({ hero, troubles: t }))).toBe(false);

    const d = DOORS[0];
    const sit = startErrand(line, { ...pickAt("sit"), key: 0 })!;
    expect(errandHolds(sit, errandInput({ hero: { x: d.x, z: d.face + 2 } }))).toBe(true);
    expect(errandHolds(sit, errandInput({ hero: { x: d.x, z: d.face + 12 } }))).toBe(false);
  });
});

describe("the lead bus, for errands", () => {
  it("carries the frame's break-off say, and tells the frame the errand only when it changes", () => {
    const lead = makeLeadBus();
    expect(lead).toMatchObject({ breakOff: false, errand: null });
    setLeadBreakOff(lead, true);
    expect(lead.breakOff).toBe(true);
    const heard: LeadNews[] = [];
    lead.onNews = (n) => heard.push(n);
    setLeadErrand(lead, "sniff");
    setLeadErrand(lead, "sniff");
    setLeadErrand(lead, null);
    expect(heard).toEqual([
      { kind: "errand", errand: "sniff" },
      { kind: "errand", errand: null },
    ]);
  });
});
