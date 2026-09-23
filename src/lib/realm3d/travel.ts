/**
 * FAST TRAVEL — the mount's job, ported from the overhaul's slice 7
 * (`docs/superpowers/specs/2026-09-10-realm-fast-travel-and-the-companion-design.md`).
 *
 * The flat Realm never built it (only `surfacesFor(...).fastTravel` exists); the spec did, and
 * its rules are what this file keeps, moved from the flat village's five districts to the 3D
 * island's places — the ones on the minimap:
 *
 *   - **A real ride, not a menu and a fade** (D7.2). The hero canters the roads — the village's
 *     five tracks, then the island's road network — with the camera pulled back and the island
 *     going past. Reduced motion is the one exception (D7.14): an arrival and a line of words.
 *   - **Only from a hitching post** (D7.3). One at the village, one at every place, standing on
 *     the road where it comes in. Never a collider (§3.4): a rail you walk through costs nothing.
 *   - **Only while mounted** (D7.1). Fast travel is what a mount is FOR.
 *   - **Only to somewhere you have been** (D7.6): the village always, and every place the child
 *     has stood in. "Walk there once and you can ride back any time."
 *   - **Never the place you are standing at** (§5.1 `already_here`), shown as "You're here".
 *   - **Speed is the mount's** (D7.4): its free-roam speed times `TRAVEL_CANTER`, so the ladder
 *     reads as seconds a child can check against the clock. The island is five times the flat
 *     village, so a ride is also capped at `TRAVEL_MAX_S` — past about nine seconds a ride stops
 *     being a ride and starts being a loading screen.
 *   - **Any movement key pulls up** (§3.5.5), at the next waypoint, on the road, still mounted.
 *   - **Arriving sets the child down** (§3.5.6) — a mounted child cannot cast, and arriving is the
 *     moment before they talk to someone or clear something — and the mount waits there.
 *   - **Never mandatory** (D7.7): every place is walkable; nothing consults travel state.
 *
 * Pure: no three.js, no clock. The graph is built once from the island's landmarks and roads.
 */

import type { Landmark, Road } from "./worldgen";

export type Vec2 = { x: number; z: number };

/** A ride's speed is the mount's free-roam speed under canter. */
export const TRAVEL_CANTER = 3;
/** No ride is longer than this; a slower mount on a long road rides at the pace that makes it. */
export const TRAVEL_MAX_S = 9;
/** The sheet closes and the hero squares up to the road before moving. In every estimate. */
export const TRAVEL_LEAD_IN_S = 0.3;
/** How close to a post's footprint the hero must stand to use it (the E reach). */
export const HITCH_REACH = 2.4;
/** A route is resampled so no leg is longer than this: a stop lands within a leg. */
export const TRAVEL_WAYPOINT_MAX = 4;
/** How far a post stands beside the road it marks. */
export const POST_SIDE = 2.4;

/** The village's own node: the green where every visit starts. */
export const VILLAGE_ID = "village";
export const VILLAGE_NAME = "the village";
/** Where the village's roads meet: on the cobbles, just north of the spawn. */
export const VILLAGE_HUB: Vec2 = { x: 0, z: 13 };
/** The village's hitching post: beside the cobbles, a step from where a visit starts. */
export const VILLAGE_POST: Vec2 = { x: -2.9, z: 17.5 };

/**
 * The village's five tracks, from the hub on the cobbles to the five authored places. The
 * outer part of each is the flat Realm's own `TRAILS` (`lib/realm/layout.ts`), point for point;
 * the inner part threads the lanes of the staggered village (`BUILDING_SLOTS`): down the cobbles,
 * then west above the bridge house (z 4) or east between the mill and the glasshouse (z 5), and
 * round the outside of the watchtower and the chapel — so a ride never goes through a wall. A
 * test walks every one against every raised building and every castle tier, so a re-plot that
 * puts a house across a track fails there.
 */
export const VILLAGE_TRACKS: Record<string, Vec2[]> = {
  appleway: [VILLAGE_HUB, { x: 0, z: 19 }, { x: 0, z: 42 }, { x: -3, z: 56 }],
  ringstones: [VILLAGE_HUB, { x: 0, z: 4 }, { x: -20, z: 4 }, { x: -34, z: 2 }, { x: -50, z: 0 }],
  farfurrow: [VILLAGE_HUB, { x: 0, z: 5 }, { x: 18, z: 5 }, { x: 20, z: -2 }, { x: 34, z: 0 }, { x: 48, z: 2 }],
  longwater: [VILLAGE_HUB, { x: 0, z: 5 }, { x: 18, z: 5 }, { x: 18.5, z: -12 }, { x: 14, z: -20 }, { x: 24, z: -28 }, { x: 33, z: -36 }],
  highcairn: [VILLAGE_HUB, { x: 0, z: 4 }, { x: -19, z: 4 }, { x: -19, z: -14 }, { x: -14, z: -22 }, { x: -24, z: -34 }, { x: -33, z: -48 }],
};

export type TravelNode = { id: string; name: string; kind: string; hub: Vec2 };

export type HitchPost = {
  /** The destination this post belongs to: a landmark id, or `VILLAGE_ID`. */
  id: string;
  name: string;
  /** The post itself, beside the road. */
  x: number;
  z: number;
  /** The point on the road beside it, where a ride ends. */
  road: Vec2;
  /** Which way a child arriving there faces: on, toward the place. */
  face: number;
};

export type TravelGraph = {
  nodes: Map<string, TravelNode>;
  /** Neighbours, each with the polyline FROM this node TO that one. */
  adj: Map<string, { to: string; points: Vec2[] }[]>;
  /** Toward the village: the node one step nearer home, or null for the village. */
  parent: Map<string, string | null>;
  posts: HitchPost[];
};

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** A point `d` along a polyline from its start (clamped to its end). */
export function pointAlong(points: readonly Vec2[], d: number): { p: Vec2; dir: Vec2 } {
  let left = Math.max(0, d);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = dist(a, b);
    if (len <= 1e-9) continue;
    const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    if (left <= len || i === points.length - 2) {
      const t = Math.min(left, len);
      return { p: { x: a.x + dir.x * t, z: a.z + dir.z * t }, dir };
    }
    left -= len;
  }
  const last = points[points.length - 1] ?? { x: 0, z: 0 };
  return { p: { ...last }, dir: { x: 0, z: 1 } };
}

export function routeLength(route: readonly Vec2[]): number {
  let n = 0;
  for (let i = 0; i < route.length - 1; i++) n += dist(route[i], route[i + 1]);
  return n;
}

/**
 * The island's travel graph: the village, every landmark, the village's five tracks and the
 * island's roads — a tree, because the roads were laid as one ("every new landmark is joined to
 * the nearest thing that is already connected"). Posts are derived, never typed: one per node.
 */
export function buildTravelGraph(landmarks: readonly Landmark[], roads: readonly Road[]): TravelGraph {
  const nodes = new Map<string, TravelNode>();
  const adj = new Map<string, { to: string; points: Vec2[] }[]>();
  nodes.set(VILLAGE_ID, { id: VILLAGE_ID, name: VILLAGE_NAME, kind: "village", hub: VILLAGE_HUB });
  adj.set(VILLAGE_ID, []);
  for (const l of landmarks) {
    nodes.set(l.id, { id: l.id, name: l.name, kind: l.kind, hub: { x: l.position.x, z: l.position.z } });
    adj.set(l.id, []);
  }
  const link = (a: string, b: string, points: Vec2[]) => {
    if (!nodes.has(a) || !nodes.has(b) || points.length < 2) return;
    adj.get(a)!.push({ to: b, points });
    adj.get(b)!.push({ to: a, points: [...points].reverse() });
  };
  for (const [id, track] of Object.entries(VILLAGE_TRACKS)) {
    const place = nodes.get(id);
    if (!place) continue;
    link(VILLAGE_ID, id, [...track, place.hub]);
  }
  for (const r of roads) link(r.from, r.to, r.points.map((p) => ({ x: p.x, z: p.z })));

  // Breadth-first from the village: each node's parent is one step nearer home.
  const parent = new Map<string, string | null>([[VILLAGE_ID, null]]);
  const queue = [VILLAGE_ID];
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of adj.get(at)!) {
      if (parent.has(e.to)) continue;
      parent.set(e.to, at);
      queue.push(e.to);
    }
  }

  const posts: HitchPost[] = [];
  const radius = new Map(landmarks.map((l) => [l.id, l.radius]));
  for (const node of nodes.values()) {
    if (node.id === VILLAGE_ID) {
      posts.push({ id: VILLAGE_ID, name: VILLAGE_NAME, x: VILLAGE_POST.x, z: VILLAGE_POST.z, road: { x: 0, z: VILLAGE_POST.z }, face: Math.PI });
      continue;
    }
    const up = parent.get(node.id);
    if (up === undefined || up === null) continue;
    // The road home, from this place: the post stands on it where the place begins.
    const home = adj.get(node.id)!.find((e) => e.to === up)!;
    const r = radius.get(node.id) ?? 10;
    const { p, dir } = pointAlong(home.points, r * 0.8);
    // To the road's right-hand side, looking home.
    const side = { x: -dir.z, z: dir.x };
    posts.push({
      id: node.id,
      name: node.name,
      x: p.x + side.x * POST_SIDE,
      z: p.z + side.z * POST_SIDE,
      road: p,
      // Arriving, the child faces the place: back along the road toward its hub.
      face: Math.atan2(-dir.x, -dir.z),
    });
  }
  return { nodes, adj, parent, posts };
}

const built = new WeakMap<object, TravelGraph>();

/** The island's travel graph, built once per world and shared by the canvas and the frame's sheet. */
export function travelGraphFor(world: { readonly landmarks: readonly Landmark[]; readonly roads: readonly Road[] }): TravelGraph {
  let g = built.get(world);
  if (!g) {
    g = buildTravelGraph(world.landmarks, world.roads);
    built.set(world, g);
  }
  return g;
}

/** The node ids from one node to another, both included. Empty when there is no way. */
export function pathBetween(g: TravelGraph, from: string, to: string): string[] {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return [];
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const e of g.adj.get(at) ?? []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, at);
      queue.push(e.to);
    }
  }
  if (!prev.has(to)) return [];
  const out: string[] = [];
  for (let at: string | null = to; at !== null; at = prev.get(at) ?? null) out.push(at);
  return out.reverse();
}

/** Nearest point on a polyline to `q`: which leg, and how far along the whole line. */
function project(points: readonly Vec2[], q: Vec2): { d: number; along: number; leg: number } {
  let best = { d: Infinity, along: 0, leg: 0 };
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = dist(a, b);
    const t = len > 1e-9 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const d = Math.hypot(q.x - px, q.z - pz);
    if (d < best.d) best = { d, along: run + t * len, leg: i };
    run += len;
  }
  return best;
}

/** A polyline from `along` onward. */
function tailFrom(points: readonly Vec2[], along: number): Vec2[] {
  const out: Vec2[] = [pointAlong(points, along).p];
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    run += dist(points[i], points[i + 1]);
    if (run > along + 1e-6) out.push(points[i + 1]);
  }
  return out;
}

/** Resample so no leg is longer than `max`. */
export function resample(route: readonly Vec2[], max = TRAVEL_WAYPOINT_MAX): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < route.length; i++) {
    const p = route[i];
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...p });
      continue;
    }
    const len = dist(last, p);
    if (len < 1e-6) continue;
    const n = Math.ceil(len / max);
    for (let k = 1; k <= n; k++) out.push({ x: last.x + ((p.x - last.x) * k) / n, z: last.z + ((p.z - last.z) * k) / n });
  }
  return out;
}

/**
 * The road from a hero standing at `from`'s post to `to`'s post: along the tracks and roads, and
 * never across open country. Joins the road where the hero stands beside it, and leaves it at the
 * destination post's road point. Empty when there is no way.
 */
export function travelRoute(g: TravelGraph, fromId: string, hero: Vec2, toId: string): Vec2[] {
  const ids = pathBetween(g, fromId, toId);
  if (ids.length < 2) return [];
  const legs: Vec2[][] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const e = g.adj.get(ids[i])!.find((x) => x.to === ids[i + 1]);
    if (!e) return [];
    legs.push(e.points);
  }
  // Join: onto the first leg at the point nearest the hero, if the road runs beside them;
  // otherwise from the hero to the first leg's start (the place's own hub).
  const first = legs[0];
  const onto = project(first, hero);
  const line: Vec2[] = [{ ...hero }];
  if (onto.d <= POST_SIDE + 1.5) line.push(...tailFrom(first, onto.along));
  else line.push(...first);
  for (let i = 1; i < legs.length; i++) line.push(...legs[i].slice(1));
  // Leave: at the destination post's road point. If the last leg passes it (arriving from the
  // village side), cut there; if not (arriving from beyond the place), ride on to it.
  const post = g.posts.find((p) => p.id === toId);
  if (post) {
    const last = legs[legs.length - 1];
    const off = project(last, post.road);
    if (off.d < 0.5) {
      const lastLen = routeLength(last);
      const cutFromEnd = lastLen - off.along;
      const total = routeLength(line);
      const keep = total - cutFromEnd;
      const trimmed: Vec2[] = [line[0]];
      let run = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const len = dist(line[i], line[i + 1]);
        if (run + len >= keep) {
          trimmed.push(pointAlong([line[i], line[i + 1]], keep - run).p);
          break;
        }
        trimmed.push(line[i + 1]);
        run += len;
      }
      return resample(trimmed);
    }
    line.push({ ...post.road });
  }
  return resample(line);
}

/** A ride's speed on a route of this length: the mount's canter, but never longer than `TRAVEL_MAX_S`. */
export function travelSpeed(mountSpeed: number, length: number): number {
  return Math.max(mountSpeed * TRAVEL_CANTER, length / TRAVEL_MAX_S);
}

/** What the sheet quotes and a stopwatch should match: ride time plus the lead-in, to 0.1 s. */
export function travelEstimate(length: number, speed: number): number {
  return Math.round((length / speed + TRAVEL_LEAD_IN_S) * 10) / 10;
}

/** Words for a ride time, for a child who does not read numerals yet. */
export function travelWords(seconds: number): string {
  if (seconds < 2.5) return "a moment";
  return `about ${Math.round(seconds)} seconds`;
}

export type Destination = {
  id: string;
  name: string;
  kind: string;
  state: "ready" | "here" | "locked";
  seconds: number | null;
  words: string | null;
};

/**
 * The sheet's rows, from the post at `fromId`: the village first, then every place in the order
 * the island lists them. `visited` is where the child has stood; the village is always open.
 */
export function travelDestinations(g: TravelGraph, fromId: string, hero: Vec2, visited: ReadonlySet<string>, mountSpeed: number): Destination[] {
  const out: Destination[] = [];
  for (const node of g.nodes.values()) {
    const open = node.id === VILLAGE_ID || visited.has(node.id);
    const base = { id: node.id, name: node.name, kind: node.kind };
    if (node.id === fromId) {
      out.push({ ...base, state: "here", seconds: null, words: null });
      continue;
    }
    if (!open) {
      out.push({ ...base, state: "locked", seconds: null, words: null });
      continue;
    }
    const route = travelRoute(g, fromId, hero, node.id);
    if (route.length < 2) continue; // no way there: omitted, never a dead row
    const len = routeLength(route);
    const s = travelEstimate(len, travelSpeed(mountSpeed, len));
    out.push({ ...base, state: "ready", seconds: s, words: travelWords(s) });
  }
  return out;
}

/** The post the hero is at, or null. The nearest wins when two are in reach. */
export function postAt(g: TravelGraph, x: number, z: number, reach = HITCH_REACH + 0.6): HitchPost | null {
  let best: HitchPost | null = null;
  let bestD = reach;
  for (const p of g.posts) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ the ride itself */

export type TravelRun = {
  to: string;
  route: Vec2[];
  /** The waypoint being ridden toward. */
  index: number;
  speed: number;
  /** Seconds, including the lead-in. */
  elapsed: number;
  /** Asked to stop: the run ends at the next waypoint. */
  stopping: boolean;
};

export function startTravel(to: string, route: Vec2[], mountSpeed: number): TravelRun | null {
  if (route.length < 2) return null;
  return { to, route, index: 1, speed: travelSpeed(mountSpeed, routeLength(route)), elapsed: 0, stopping: false };
}

export function requestStop(run: TravelRun): void {
  run.stopping = true;
}

/**
 * One frame along the route, written into `pos` (and the heading into `out.heading`). Returns
 * true when the run is over: at the end, or at the waypoint after a stop was asked for. The
 * lead-in holds the hero still, turned to face the road.
 */
export function stepTravel(run: TravelRun, pos: Vec2, dt: number, out: { heading: number }): boolean {
  const before = run.elapsed;
  run.elapsed += dt;
  const target = run.route[run.index];
  if (!target) return true;
  out.heading = Math.atan2(target.x - pos.x, target.z - pos.z);
  if (run.elapsed < TRAVEL_LEAD_IN_S) return false;
  // Only the part of this frame that is past the lead-in moves anyone.
  let move = run.speed * Math.min(dt, run.elapsed - Math.max(before, TRAVEL_LEAD_IN_S));
  while (move > 0) {
    const t = run.route[run.index];
    if (!t) return true;
    const dx = t.x - pos.x;
    const dz = t.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) out.heading = Math.atan2(dx, dz);
    if (d <= move) {
      pos.x = t.x;
      pos.z = t.z;
      move -= d;
      run.index++;
      if (run.stopping || run.index >= run.route.length) return true;
    } else {
      pos.x += (dx / d) * move;
      pos.z += (dz / d) * move;
      move = 0;
    }
  }
  return false;
}
