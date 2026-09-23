import { describe, expect, it } from "vitest";
import { buildWorldLayout, SCENERY, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { MOUNTS } from "@/lib/utils/avatar-catalog";
import { buildColliders, overlaps, type Collider } from "./collision";
import { castlePlan, CASTLE_TIERS } from "./castle-plan";
import { realmWorld } from "./worldgen";
import { rideSpeed } from "./riding";
import {
  buildTravelGraph,
  pathBetween,
  postAt,
  requestStop,
  resample,
  routeLength,
  startTravel,
  stepTravel,
  travelDestinations,
  travelEstimate,
  travelRoute,
  travelSpeed,
  travelWords,
  TRAVEL_LEAD_IN_S,
  TRAVEL_MAX_S,
  TRAVEL_WAYPOINT_MAX,
  VILLAGE_ID,
  VILLAGE_TRACKS,
} from "./travel";

const world = realmWorld();
const g = buildTravelGraph(world.landmarks, world.roads);
const post = (id: string) => g.posts.find((p) => p.id === id)!;

describe("the travel graph", () => {
  it("has the village and every place on the minimap, and one hitching post each", () => {
    expect(g.nodes.size).toBe(world.landmarks.length + 1);
    expect(g.posts).toHaveLength(g.nodes.size);
    for (const l of world.landmarks) expect(g.posts.some((p) => p.id === l.id)).toBe(true);
  });

  it("reaches every place from the village by road", () => {
    for (const l of world.landmarks) {
      const ids = pathBetween(g, VILLAGE_ID, l.id);
      expect(ids[0]).toBe(VILLAGE_ID);
      expect(ids[ids.length - 1]).toBe(l.id);
    }
  });

  it("each village track ends where the flat Realm's trail does, at the edge of its place", () => {
    for (const [id, track] of Object.entries(VILLAGE_TRACKS)) {
      const l = world.landmarks.find((x) => x.id === id)!;
      const end = track[track.length - 1];
      expect(Math.hypot(end.x - l.position.x, end.z - l.position.z)).toBeLessThan(8);
    }
  });

  it("a post stands beside its road, not on it, and inside its place's reach", () => {
    for (const p of g.posts) {
      expect(Math.hypot(p.x - p.road.x, p.z - p.road.z)).toBeGreaterThan(2);
      const node = g.nodes.get(p.id)!;
      if (p.id !== VILLAGE_ID) {
        const l = world.landmarks.find((x) => x.id === p.id)!;
        expect(Math.hypot(p.road.x - node.hub.x, p.road.z - node.hub.z)).toBeLessThanOrEqual(l.radius);
      }
    }
  });

  it("finds the post the hero is standing at, and none in the open", () => {
    const v = post(VILLAGE_ID);
    expect(postAt(g, v.x + 1, v.z)?.id).toBe(VILLAGE_ID);
    expect(postAt(g, 200, 200)).toBeNull();
  });
});

describe("routes", () => {
  it("ride the road from post to post, and end on the road beside the far post", () => {
    for (const to of ["highcairn", "summit-6", "cove-13", "appleway"]) {
      const from = post(VILLAGE_ID);
      const r = travelRoute(g, VILLAGE_ID, { x: from.x, z: from.z }, to);
      expect(r.length).toBeGreaterThan(2);
      const end = r[r.length - 1];
      const target = post(to).road;
      expect(Math.hypot(end.x - target.x, end.z - target.z)).toBeLessThan(0.6);
    }
  });

  it("works between two places, and back home", () => {
    const a = post("summit-8");
    const there = travelRoute(g, "summit-8", { x: a.x, z: a.z }, "deepwood-10");
    expect(there.length).toBeGreaterThan(2);
    const b = post("deepwood-10");
    const home = travelRoute(g, "deepwood-10", { x: b.x, z: b.z }, VILLAGE_ID);
    const end = home[home.length - 1];
    expect(Math.hypot(end.x - post(VILLAGE_ID).road.x, end.z - post(VILLAGE_ID).road.z)).toBeLessThan(0.6);
  });

  it("no leg is longer than a waypoint, so a stop always lands within one", () => {
    const from = post(VILLAGE_ID);
    const r = travelRoute(g, VILLAGE_ID, { x: from.x, z: from.z }, "cove-13");
    for (let i = 0; i < r.length - 1; i++) expect(Math.hypot(r[i + 1].x - r[i].x, r[i + 1].z - r[i].z)).toBeLessThanOrEqual(TRAVEL_WAYPOINT_MAX + 1e-6);
    expect(resample([{ x: 0, z: 0 }, { x: 10, z: 0 }], 4)).toHaveLength(4);
  });

  it("never rides through a wall of the village, whatever is built and whatever castle stands", () => {
    const buildings: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true }));
    const OPTS = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };
    for (const tier of Object.keys(CASTLE_TIERS)) {
      const layout = buildWorldLayout({ castleType: tier, buildings, objectiveIds: [] });
      const solids: Collider[] = buildColliders(layout.props.filter((p) => p.kind !== "castle"), SCENERY, OPTS).solids;
      const c = layout.props.find((p) => p.kind === "castle")!;
      for (const b of castlePlan(tier).solids) solids.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z });
      // Every ride the village's tracks carry, out to each place's post and back again.
      const v = post(VILLAGE_ID);
      for (const id of Object.keys(VILLAGE_TRACKS)) {
        const p = post(id);
        const routes = [travelRoute(g, VILLAGE_ID, { x: v.x, z: v.z }, id), travelRoute(g, id, { x: p.x, z: p.z }, VILLAGE_ID)];
        for (const r of routes) {
          for (const q of resample(r.slice(1), 0.25)) {
            const hit = solids.find((s) => overlaps(s, q.x, q.z, 0.6));
            expect(hit, `${tier} ${id}: (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) inside a solid at (${hit?.x}, ${hit?.z})`).toBeUndefined();
          }
        }
      }
    }
  });
});

describe("the speed ladder", () => {
  it("is the mount's canter, capped so no ride is a loading screen", () => {
    expect(travelSpeed(10, 30)).toBe(30);
    expect(travelSpeed(10, 900)).toBe(900 / TRAVEL_MAX_S);
  });

  it("a faster mount is never slower, and every ride is under the cap plus the lead-in", () => {
    const from = post(VILLAGE_ID);
    for (const to of world.landmarks) {
      const len = routeLength(travelRoute(g, VILLAGE_ID, { x: from.x, z: from.z }, to.id));
      let last = Infinity;
      for (const m of [...MOUNTS].sort((a, b) => a.speed - b.speed)) {
        const s = travelEstimate(len, travelSpeed(rideSpeed(m), len));
        expect(s).toBeLessThanOrEqual(last);
        expect(s).toBeLessThanOrEqual(TRAVEL_MAX_S + TRAVEL_LEAD_IN_S + 0.05);
        last = s;
      }
    }
  });

  it("says a short ride in words a child can read", () => {
    expect(travelWords(1.2)).toBe("a moment");
    expect(travelWords(5.4)).toBe("about 5 seconds");
  });
});

describe("the sheet", () => {
  const from = post(VILLAGE_ID);
  const at = { x: from.x, z: from.z };

  it("offers the village and places the child has been; the rest are locked; here is here", () => {
    const rows = travelDestinations(g, VILLAGE_ID, at, new Set(["highcairn"]), rideSpeed(MOUNTS[0]));
    expect(rows.find((r) => r.id === VILLAGE_ID)!.state).toBe("here");
    const hc = rows.find((r) => r.id === "highcairn")!;
    expect(hc.state).toBe("ready");
    expect(hc.seconds).toBeGreaterThan(0);
    expect(hc.words).toMatch(/moment|seconds/);
    expect(rows.find((r) => r.id === "cove-13")!.state).toBe("locked");
  });

  it("from a place, home is always open", () => {
    const p = post("highcairn");
    const rows = travelDestinations(g, "highcairn", { x: p.x, z: p.z }, new Set(["highcairn"]), rideSpeed(MOUNTS[0]));
    expect(rows.find((r) => r.id === VILLAGE_ID)!.state).toBe("ready");
    expect(rows.find((r) => r.id === "highcairn")!.state).toBe("here");
  });
});

describe("the ride", () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: 4 },
    { x: 0, z: 8 },
    { x: 0, z: 12 },
  ];

  it("holds still for the lead-in, then rides to the end", () => {
    const run = startTravel("x", route, 10)!;
    const pos = { x: 0, z: 0 };
    const out = { heading: 0 };
    expect(stepTravel(run, pos, TRAVEL_LEAD_IN_S * 0.5, out)).toBe(false);
    expect(pos.z).toBe(0);
    let done = false;
    for (let i = 0; i < 200 && !done; i++) done = stepTravel(run, pos, 0.05, out);
    expect(done).toBe(true);
    expect(pos.z).toBeCloseTo(12);
    expect(out.heading).toBeCloseTo(0);
  });

  it("a stop ends at the next waypoint, on the road", () => {
    const run = startTravel("x", route, 10)!;
    const pos = { x: 0, z: 0 };
    const out = { heading: 0 };
    stepTravel(run, pos, TRAVEL_LEAD_IN_S + 0.1, out);
    requestStop(run);
    let done = false;
    for (let i = 0; i < 200 && !done; i++) done = stepTravel(run, pos, 0.02, out);
    expect(done).toBe(true);
    expect(pos.z).toBeCloseTo(4);
  });
});
