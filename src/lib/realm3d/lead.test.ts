import { describe, expect, it } from "vitest";
import { buildWorldLayout, SCENERY, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { buildColliders, overlaps, type Collider } from "./collision";
import { castlePlan } from "./castle-plan";
import { realmWorld } from "./worldgen";
import { buildTravelGraph, resample, routeLength, VILLAGE_HUB, type Vec2 } from "./travel";
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
