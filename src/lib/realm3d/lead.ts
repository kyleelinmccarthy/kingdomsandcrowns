/**
 * THE COMPANION LEADS YOU — the pet's job, from the overhaul's slice 7
 * (`docs/superpowers/specs/2026-09-10-realm-fast-travel-and-the-companion-design.md`, D7.9–D7.10,
 * §3.6). The spec's companion is "the living marker": it trots to the thing the game is pointing
 * at and waits there. On a 640-unit island a pet that ran off home every time a child wandered
 * into the hills would be a nuisance, so here the child ASKS (F, or the pet's slot on the bar),
 * and the rest is the spec's:
 *
 *   - **Where to.** Whoever is waiting (the gold !'s villager — the same `goalFor` answer the !,
 *     the map and the objective card read), unless the child is already beside them; then the
 *     nearest place they have not found; then home. Never somewhere the ! does not agree with.
 *   - **Which way.** A real route. Across the island it is the roads (`travel.ts`'s graph — the
 *     village's tracks and the island's roads, "no cross-map route is a straight line", §3.6);
 *     off the road, a short search over the ground that knows every solid and every stretch of
 *     deep water, and that prefers a road where there is one (`track-index.ts`).
 *   - **How.** Ahead of the child at a distance they can read, faster than them so it can get
 *     there, waiting when they stop (it turns and looks back), coming back along its own route
 *     when they wander, and giving up — back to heel — only when they have plainly gone
 *     somewhere else. It arrives, waits a moment for the child, and comes back to heel.
 *   - **Never the only marker** (D7.10). The ! and the map keep doing exactly what they did.
 *
 * `LeadBus` is the wire between the frame (the F key, the words, the target) and the canvas
 * (which owns positions, solids and the frame loop), the same pattern as `RideBus`.
 *
 * Pure: no three.js, no clock, nothing random. The per-frame step allocates nothing.
 */

import { overlaps, type Collider } from "./collision";
import { buildTrackIndex, segmentsOf, type TrackIndex, type TrackSeg } from "./track-index";
import { pointAlong, resample, routeLength, VILLAGE_HUB, type TravelGraph, type Vec2 } from "./travel";
import type { Landmark, RealmWorld, WorldProp } from "./worldgen";

/* ------------------------------------------------------------------ the numbers */

/** The pet's clearance from anything solid: a little more than its own half-width. */
export const PET_CLEAR = 0.6;
/** Water deeper than this is never led through: a ford a child wades easily (they can to 1.3), and a pet swims. */
export const LEAD_DEEP = 1.05;
/** Closer than this to whoever is waiting and there is no one to lead to: they are right there. */
export const LEAD_GOAL_NEAR = 7;
/** Further than this from the village's middle, with nothing else to find, the pet leads home. */
export const LEAD_HOME_FAR = 40;
/** Closer than this to the end, the child has arrived. */
export const LEAD_ARRIVE = 4;
/** How far ahead of the child the pet runs, walking. It grows with the child's speed. */
export const LEAD_AHEAD = 6;
/** ...up to this, on a galloping mount. */
export const LEAD_AHEAD_MAX = 12;
/** Calm: a little closer, so a gentle pet is never a dot. */
export const LEAD_AHEAD_CALM = 5;
/** The child is this far off the pet's route: they are wandering, and the pet comes back for them. */
export const LEAD_WANDER = 10;
/** ...and this far, or this long wandering, the pet gives up and comes back to heel. */
export const LEAD_GIVE_UP = 38;
export const LEAD_GIVE_UP_S = 25;
/** The child can drift this far BACK along the route before the pet walks back toward them. */
export const LEAD_SLACK = 5;
/** The pet's own top speed while leading, walking; it always outruns the child a little. */
export const LEAD_RUN = 15;
export const LEAD_RUN_CALM = 11;
/** After arriving, the pet waits this long by the place before coming back to heel. */
export const LEAD_ARRIVE_HOLD = 2.4;
/** Nearer than this to the target, a direct search is tried before the roads. */
export const LEAD_DIRECT = 48;

/* ------------------------------------------------------------------ where to */

export type LeadTarget = {
  /** Whoever is waiting, a place not yet found, or home. */
  kind: "villager" | "place" | "home";
  id: string;
  name: string;
  x: number;
  z: number;
};

export type LeadChoice = { ok: true; target: LeadTarget } | { ok: false; reason: "here" | "nothing" };

export type LeadGoal = { on: boolean; x: number; z: number; name: string; id: string };

/**
 * Where the pet takes a child who asks. The gold !'s villager first — the game's own answer to
 * "what do I do?" — unless they are already standing by them; then the nearest place not yet
 * found; then home, when home is far. Otherwise there is nowhere to go, and it says why.
 */
export function chooseLead(hero: Vec2, goal: LeadGoal, landmarks: readonly Pick<Landmark, "id" | "name" | "position">[], found: ReadonlySet<string>): LeadChoice {
  if (goal.on && Math.hypot(goal.x - hero.x, goal.z - hero.z) > LEAD_GOAL_NEAR) {
    return { ok: true, target: { kind: "villager", id: goal.id, name: goal.name, x: goal.x, z: goal.z } };
  }
  let best: (typeof landmarks)[number] | null = null;
  let bestD = Infinity;
  for (const l of landmarks) {
    if (found.has(l.id)) continue;
    const d = Math.hypot(l.position.x - hero.x, l.position.z - hero.z);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  if (best) return { ok: true, target: { kind: "place", id: best.id, name: best.name, x: best.position.x, z: best.position.z } };
  if (Math.hypot(VILLAGE_HUB.x - hero.x, VILLAGE_HUB.z - hero.z) > LEAD_HOME_FAR) {
    return { ok: true, target: { kind: "home", id: "village", name: "the village", x: VILLAGE_HUB.x, z: VILLAGE_HUB.z } };
  }
  return { ok: false, reason: goal.on ? "here" : "nothing" };
}

/* ------------------------------------------------------------------ the ground */

/** As much of the island as a route needs. `RealmWorld` is one; a test can hand in less. */
export type LeadWorld = Pick<RealmWorld, "heightAt" | "waterLevelAt" | "forEachPropNear" | "landmarks" | "half">;

/**
 * A wilderness prop as the scene's collider (`world-props.tsx` builds the same one as the child
 * walks near it). Here so a route far from the child knows the trees the scene has not loaded.
 */
export function wildSolid(p: Pick<WorldProp, "solid" | "variant" | "scale" | "x" | "z" | "y">): Collider | null {
  if (!p.solid) return null;
  const tree = p.variant === "oak" || p.variant === "pine";
  const r = Math.max(0.35, tree ? 0.42 * p.scale : p.variant === "menhir" ? 0.32 * p.scale : 0.62 * p.scale);
  return { x: p.x, z: p.z, hw: r, hd: r, round: true, base: p.y, top: p.y + 2.4 * p.scale };
}

/** How deep the water stands here; 0 or less is dry. */
export function depthAt(world: Pick<RealmWorld, "heightAt" | "waterLevelAt">, x: number, z: number): number {
  return world.waterLevelAt(x, z) - world.heightAt(x, z);
}

const roadIndexes = new WeakMap<TravelGraph, TrackIndex>();

/** The roads and tracks as a nearness field, for preferring them. Built once per graph. */
export function roadIndexFor(g: TravelGraph): TrackIndex {
  let idx = roadIndexes.get(g);
  if (!idx) {
    const segs: TrackSeg[] = [];
    for (const [from, list] of g.adj) for (const e of list) if (from < e.to) segs.push(...segmentsOf(e.points, 1.9));
    idx = buildTrackIndex(segs, 1.2);
    roadIndexes.set(g, idx);
  }
  return idx;
}

/* ------------------------------------------------------------------ a search over the ground */

/** A walkable grid over a box of ground: what blocks, and what each cell costs to cross. */
export type LeadGrid = {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  block: Uint8Array;
  cost: Float32Array;
};

/** No grid larger than this many cells: the cell grows instead. About 3 ms to search in full. */
const MAX_CELLS = 90_000;

export type LeadContext = {
  graph: TravelGraph;
  world: LeadWorld;
  /** Everything the scene stops a walker with: the village, the castle, the landmarks. */
  solids: readonly Collider[];
  /**
   * Ground that can be walked but is better walked round: the pegged-out building plots. A pet
   * trots down the lane beside a plot rather than across the middle of somebody's building site.
   */
  soft?: readonly { x: number; z: number; hw: number; hd: number }[];
};

/** What crossing a building plot costs, on top of the ground: enough to take the lane round it. */
const SOFT_COST = 2.5;

/** How much bigger than its layout size a plot is drawn on the island (`spike-scene.tsx`'s `SITE_PLAN`). */
export const PLOT_SCALE = 1.5;

/** The pegged-out plots of the buildings not yet raised, as ground to walk round (`LeadContext.soft`). */
export function plotsOf(props: readonly { kind: string; position: Vec2; size: { w: number; d: number } }[], scale = PLOT_SCALE): { x: number; z: number; hw: number; hd: number }[] {
  return props
    .filter((p) => p.kind === "foundation")
    .map((p) => ({ x: p.position.x, z: p.position.z, hw: (p.size.w * scale) / 2 + 0.3, hd: (p.size.d * scale) / 2 + 0.3 }));
}

/** Builds the grid for the box around two points, with `margin` of room around both. */
export function leadGrid(ctx: LeadContext, a: Vec2, b: Vec2, margin: number): LeadGrid {
  const minX = Math.min(a.x, b.x) - margin;
  const maxX = Math.max(a.x, b.x) + margin;
  const minZ = Math.min(a.z, b.z) - margin;
  const maxZ = Math.max(a.z, b.z) + margin;
  let cell = 0.6;
  while (((maxX - minX) / cell) * ((maxZ - minZ) / cell) > MAX_CELLS) cell *= 1.25;
  const nx = Math.max(2, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(2, Math.ceil((maxZ - minZ) / cell));
  const block = new Uint8Array(nx * nz);
  const cost = new Float32Array(nx * nz);
  const roads = roadIndexFor(ctx.graph);
  const edge = ctx.world.half - 10;
  for (let j = 0; j < nz; j++) {
    const z = minZ + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = minX + (i + 0.5) * cell;
      const k = j * nx + i;
      if (Math.abs(x) > edge || Math.abs(z) > edge) {
        block[k] = 1;
        continue;
      }
      const d = depthAt(ctx.world, x, z);
      if (d > LEAD_DEEP - 0.1) {
        block[k] = 1;
        continue;
      }
      // A road is the way a child can see; wet feet are the way nobody wants.
      cost[k] = 1 - 0.45 * roads.nearness(x, z) + (d > 0.12 ? 2 : 0);
    }
  }
  // A cell is shut if any of it is inside a solid's clearance, not only its centre: a route may
  // cross a cell anywhere, and a coarse grid must not see between the trees.
  const reach = PET_CLEAR + cell * 0.5;
  const mark = (c: Collider) => {
    const rx = c.hw + reach;
    const rz = c.hd + reach;
    const i0 = Math.max(0, Math.floor((c.x - rx - minX) / cell));
    const i1 = Math.min(nx - 1, Math.floor((c.x + rx - minX) / cell));
    const j0 = Math.max(0, Math.floor((c.z - rz - minZ) / cell));
    const j1 = Math.min(nz - 1, Math.floor((c.z + rz - minZ) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        if (overlaps(c, minX + (i + 0.5) * cell, z, reach)) block[j * nx + i] = 1;
      }
    }
  };
  for (const c of ctx.solids) {
    if (c.x + c.hw + reach < minX || c.x - c.hw - reach > maxX || c.z + c.hd + reach < minZ || c.z - c.hd - reach > maxZ) continue;
    mark(c);
  }
  for (const r of ctx.soft ?? []) {
    const i0 = Math.max(0, Math.floor((r.x - r.hw - minX) / cell));
    const i1 = Math.min(nx - 1, Math.floor((r.x + r.hw - minX) / cell));
    const j0 = Math.max(0, Math.floor((r.z - r.hd - minZ) / cell));
    const j1 = Math.min(nz - 1, Math.floor((r.z + r.hd - minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cost[j * nx + i] += SOFT_COST;
  }
  // The wilderness, whether or not the scene has it loaded: the route may run far from the child.
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  ctx.world.forEachPropNear(cx, cz, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 2, (p) => {
    const c = wildSolid(p);
    if (c) mark(c);
  });
  return { x0: minX, z0: minZ, cell, nx, nz, block, cost };
}

function cellOf(g: LeadGrid, p: Vec2): number {
  const i = Math.min(g.nx - 1, Math.max(0, Math.floor((p.x - g.x0) / g.cell)));
  const j = Math.min(g.nz - 1, Math.max(0, Math.floor((p.z - g.z0) / g.cell)));
  return j * g.nx + i;
}

/** The nearest open cell to `k`, within a few rings; -1 if there is none. */
function nearestOpen(g: LeadGrid, k: number, rings = 6): number {
  if (!g.block[k]) return k;
  const ci = k % g.nx;
  const cj = (k - ci) / g.nx;
  for (let r = 1; r <= rings; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
        const n = j * g.nx + i;
        if (g.block[n]) continue;
        const d = di * di + dj * dj;
        if (d < bestD) {
          best = n;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function centre(g: LeadGrid, k: number): Vec2 {
  const i = k % g.nx;
  const j = (k - i) / g.nx;
  return { x: g.x0 + (i + 0.5) * g.cell, z: g.z0 + (j + 0.5) * g.cell };
}

/** True when a straight walk from a to b crosses no blocked cell. */
export function clearLine(g: LeadGrid, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / (g.cell * 0.35)));
  for (let s = 0; s <= n; s++) {
    const x = a.x + ((b.x - a.x) * s) / n;
    const z = a.z + ((b.z - a.z) * s) / n;
    if (x < g.x0 || z < g.z0 || x >= g.x0 + g.nx * g.cell || z >= g.z0 + g.nz * g.cell) return false;
    if (g.block[cellOf(g, { x, z })]) return false;
  }
  return true;
}

/**
 * A walkable way from `a` to `b` across the grid, or null. A* over eight neighbours, never
 * cutting a blocked corner, then pulled taut so it reads as a line a creature would take rather
 * than a staircase. Both ends are snapped to the nearest open ground if they stand in a wall's
 * clearance (a child hugging a house).
 */
export function gridPath(g: LeadGrid, a: Vec2, b: Vec2): Vec2[] | null {
  const s = nearestOpen(g, cellOf(g, a));
  const t = nearestOpen(g, cellOf(g, b));
  if (s < 0 || t < 0) return null;
  const n = g.nx * g.nz;
  const gs = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // A binary heap of cells by f.
  const heap: number[] = [];
  const f = new Float32Array(n);
  const tx = t % g.nx;
  const tz = (t - tx) / g.nx;
  const h = (k: number) => {
    const i = k % g.nx;
    const dx = Math.abs(i - tx);
    const dz = Math.abs((k - i) / g.nx - tz);
    return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * 0.55;
  };
  const push = (k: number) => {
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  gs[s] = 0;
  f[s] = h(s);
  push(s);
  let found = false;
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === t) {
      found = true;
      break;
    }
    const i = k % g.nx;
    const j = (k - i) / g.nx;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
        const m = nj * g.nx + ni;
        if (g.block[m] || closed[m]) continue;
        // No squeezing diagonally between two blocked cells.
        if (di && dj && (g.block[j * g.nx + ni] || g.block[nj * g.nx + i])) continue;
        const step = (di && dj ? 1.414 : 1) * (g.cost[k] + g.cost[m]) * 0.5;
        const ng = gs[k] + step;
        if (ng < gs[m]) {
          gs[m] = ng;
          from[m] = k;
          f[m] = ng + h(m);
          push(m);
        }
      }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let k = t; k !== -1; k = from[k]) cells.push(k);
  cells.reverse();
  const raw: Vec2[] = cells.map((k) => centre(g, k));
  // The exact ends, where they are open ground; the snapped cell centres where they are not.
  if (!g.block[cellOf(g, a)]) raw[0] = { x: a.x, z: a.z };
  if (!g.block[cellOf(g, b)]) raw[raw.length - 1] = { x: b.x, z: b.z };
  return taut(g, raw);
}

/**
 * Pulls a cell path taut: from each kept point, the furthest later point in a clear straight
 * line — but never across a change in the ground's cost (a road's edge, a ford), so a route that
 * takes the road for being a road keeps to it.
 */
function taut(g: LeadGrid, pts: Vec2[]): Vec2[] {
  if (pts.length <= 2) return pts;
  const out: Vec2[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1) {
      if (clearLine(g, pts[i], pts[j]) && evenCost(g, pts[i], pts[j])) break;
      j--;
    }
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function evenCost(g: LeadGrid, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / g.cell));
  let lo = Infinity;
  let hi = -Infinity;
  for (let s = 0; s <= n; s++) {
    const c = g.cost[cellOf(g, { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n })];
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return hi - lo < 0.2;
}

/* ------------------------------------------------------------------ the roads */

type EdgeRef = { from: string; to: string; points: Vec2[]; len: number };
type NetPoint = { edge: EdgeRef; along: number; p: Vec2; d: number };

const edgeLists = new WeakMap<TravelGraph, EdgeRef[]>();

function edgesOf(g: TravelGraph): EdgeRef[] {
  let list = edgeLists.get(g);
  if (!list) {
    list = [];
    for (const [from, adj] of g.adj) for (const e of adj) if (from < e.to) list.push({ from, to: e.to, points: e.points, len: routeLength(e.points) });
    edgeLists.set(g, list);
  }
  return list;
}

/** The nearest points on the road network to `q`, one per road, nearest first. `only` keeps one road. */
function nearestOnRoads(g: TravelGraph, q: Vec2, count: number, only?: readonly [string, string]): NetPoint[] {
  const out: NetPoint[] = [];
  for (const edge of edgesOf(g)) {
    if (only && !((edge.from === only[0] && edge.to === only[1]) || (edge.from === only[1] && edge.to === only[0]))) continue;
    let best: NetPoint | null = null;
    let run = 0;
    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = edge.points[i];
      const b = edge.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const t = len > 1e-9 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (!best || d < best.d) best = { edge, along: run + t * len, p, d };
      run += len;
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, count);
}

/** A stretch of a polyline between two distances along it, in the order asked (reversed if b < a). */
export function stretch(points: readonly Vec2[], a: number, b: number): Vec2[] {
  if (b < a) return stretch(points, b, a).reverse();
  const out: Vec2[] = [pointAlong(points, a).p];
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    run += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    if (run > a + 1e-6 && run < b - 1e-6) out.push({ ...points[i + 1] });
  }
  out.push(pointAlong(points, b).p);
  return out;
}

/** Shortest road distances from one node to every other (a handful of nodes: a plain Dijkstra). */
function roadDistances(g: TravelGraph, start: string): { dist: Map<string, number>; prev: Map<string, string> } {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const len = new Map<string, number>();
  for (const e of edgesOf(g)) {
    len.set(`${e.from}|${e.to}`, e.len);
    len.set(`${e.to}|${e.from}`, e.len);
  }
  for (;;) {
    let at: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < best) [at, best] = [id, d];
    if (at === null) break;
    done.add(at);
    for (const e of g.adj.get(at) ?? []) {
      const nd = best + (len.get(`${at}|${e.to}`) ?? routeLength(e.points));
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, at);
      }
    }
  }
  return { dist, prev };
}

function nodeChain(prev: Map<string, string>, start: string, end: string): string[] {
  const out = [end];
  for (let at = end; at !== start; ) {
    const p = prev.get(at);
    if (p === undefined) return [];
    out.push(p);
    at = p;
  }
  return out.reverse();
}

function edgeBetween(g: TravelGraph, a: string, b: string): Vec2[] | null {
  return g.adj.get(a)?.find((e) => e.to === b)?.points ?? null;
}

/** Along the roads from one point on them to another, by the shortest way round. */
function alongRoads(g: TravelGraph, from: NetPoint, to: NetPoint): Vec2[] | null {
  if (from.edge === to.edge) return stretch(from.edge.points, from.along, to.along);
  let best: { cost: number; line: Vec2[] } | null = null;
  const ends = [
    { node: from.edge.from, head: from.along, first: () => stretch(from.edge.points, from.along, 0) },
    { node: from.edge.to, head: from.edge.len - from.along, first: () => stretch(from.edge.points, from.along, from.edge.len) },
  ];
  const tails = [
    { node: to.edge.from, tail: to.along, last: () => stretch(to.edge.points, 0, to.along) },
    { node: to.edge.to, tail: to.edge.len - to.along, last: () => stretch(to.edge.points, to.edge.len, to.along) },
  ];
  for (const e of ends) {
    const { dist, prev } = roadDistances(g, e.node);
    for (const t of tails) {
      const mid = dist.get(t.node);
      if (mid === undefined) continue;
      const cost = e.head + mid + t.tail;
      if (best && cost >= best.cost) continue;
      const chain = nodeChain(prev, e.node, t.node);
      if (!chain.length) continue;
      const line: Vec2[] = [...e.first()];
      let ok = true;
      for (let i = 0; i < chain.length - 1; i++) {
        const pts = edgeBetween(g, chain[i], chain[i + 1]);
        if (!pts) {
          ok = false;
          break;
        }
        line.push(...pts.slice(1));
      }
      if (!ok) continue;
      line.push(...t.last().slice(1));
      best = { cost, line };
    }
  }
  return best?.line ?? null;
}

/* ------------------------------------------------------------------ the route */

/**
 * Where a place's lead ends: on its own road home, inside the place (so the map counts it found)
 * and well clear of whatever stands at its heart.
 */
export function placeStand(g: TravelGraph, world: Pick<LeadWorld, "landmarks">, id: string): Vec2 | null {
  const l = world.landmarks.find((x) => x.id === id);
  const up = g.parent.get(id);
  if (!l || !up) return l ? { ...l.position } : null;
  const home = g.adj.get(id)?.find((e) => e.to === up);
  if (!home) return { ...l.position };
  // Half-way in, or nearer the heart on a big place — but never within five units of it, where
  // the cairn, the hut or the tower stands (the widest is 3.4 across).
  // Measured as the crow flies from the heart, since a road may wind as it arrives.
  const want = Math.min(l.radius * 0.8, Math.max(5, Math.min(l.radius * 0.5, 7)));
  const len = routeLength(home.points);
  for (let d = 0; d <= len; d += 0.5) {
    const p = pointAlong(home.points, d).p;
    if (Math.hypot(p.x - l.position.x, p.z - l.position.z) >= want) return p;
  }
  return pointAlong(home.points, want).p;
}

/**
 * The pet's route from `from` to the target: a real walkable way, or [] if there is none.
 *
 * Near the target it is one search over the ground. Further, it is three legs: over the ground
 * to the nearest road that can be reached, along the roads by the shortest way round, and over
 * the ground again from the road to the target. Resampled to steps of at most two units.
 */
export function planLead(ctx: LeadContext, from: Vec2, target: LeadTarget): Vec2[] {
  const g = ctx.graph;
  const place = target.kind === "place" ? placeStand(g, ctx.world, target.id) : null;
  const end: Vec2 = place ?? (target.kind === "home" ? { ...VILLAGE_HUB } : { x: target.x, z: target.z });

  if (Math.hypot(end.x - from.x, end.z - from.z) <= LEAD_DIRECT) {
    const grid = leadGrid(ctx, from, end, 16);
    const direct = gridPath(grid, from, end);
    if (direct) return finish(direct, target);
  }

  // Onto the roads: the nearest few, the first one that can be walked to.
  let onto: { at: NetPoint; leg: Vec2[] } | null = null;
  for (const at of nearestOnRoads(g, from, 4)) {
    if (at.d < 1.2) {
      onto = { at, leg: [{ ...from }] };
      break;
    }
    const leg = gridPath(leadGrid(ctx, from, at.p, 14), from, at.p);
    if (leg) {
      onto = { at, leg };
      break;
    }
  }
  if (!onto) return [];

  // Off the roads, at the far end. A place's stand is on its own road home: that road, then.
  let off: { at: NetPoint; leg: Vec2[] } | null = null;
  const up = place ? g.parent.get(target.id) : null;
  const homeRoad = up ? nearestOnRoads(g, end, 1, [target.id, up]) : [];
  for (const at of [...homeRoad, ...nearestOnRoads(g, end, 4)]) {
    if (at.d < 1.2) {
      off = { at, leg: [] };
      break;
    }
    const leg = gridPath(leadGrid(ctx, at.p, end, 14), at.p, end);
    if (leg) {
      off = { at, leg: leg.slice(1) };
      break;
    }
  }
  if (!off) return [];

  const mid = alongRoads(g, onto.at, off.at);
  if (!mid) return [];
  return finish(mend(ctx, [...onto.leg, ...mid.slice(1), ...off.leg]), target);
}

/** How far short of a villager the pet stops: beside them, not in them, where E reaches both. */
export const LEAD_BESIDE = 1.7;

function finish(route: Vec2[], target: LeadTarget): Vec2[] {
  if (target.kind === "villager" && route.length > 1) {
    const last = route[route.length - 1];
    const len = routeLength(route);
    // Stands beside them, on the side it came from — if the route ended on them.
    if (Math.hypot(last.x - target.x, last.z - target.z) < LEAD_BESIDE && len > LEAD_BESIDE + 0.5) route = stretch(route, 0, len - LEAD_BESIDE);
  }
  return resample(route, 2);
}

/**
 * Where a lead is done: close enough to a villager for E to reach them (their reach is 2.55 from
 * their middle, and their site's reaches further), or at the end of the route anywhere else.
 */
export function arrivalFor(target: LeadTarget, route: readonly Vec2[]): { x: number; z: number; r: number } {
  if (target.kind === "villager") return { x: target.x, z: target.z, r: 3.2 };
  const end = route[route.length - 1] ?? { x: target.x, z: target.z };
  return { x: end.x, z: end.z, r: LEAD_ARRIVE };
}

/** True when the pet may stand here: out of every solid's clearance and out of deep water. */
export function standable(ctx: LeadContext, x: number, z: number): boolean {
  if (depthAt(ctx.world, x, z) > LEAD_DEEP) return false;
  for (const c of ctx.solids) if (overlaps(c, x, z, PET_CLEAR * 0.75)) return false;
  let ok = true;
  ctx.world.forEachPropNear(x, z, 4, (p) => {
    if (!ok) return;
    const c = wildSolid(p);
    if (c && overlaps(c, x, z, PET_CLEAR * 0.75)) ok = false;
  });
  return ok;
}

/**
 * The roads were laid for a cart, not a pet: here and there one runs through a lake a child
 * could not wade, or through the cairn or the hut that stands at a place's heart (every road
 * meets at one). Every such stretch is walked round over the ground instead. If there is no way
 * round at all, the lead stops on good ground before it: the child can see the rest.
 */
function mend(ctx: LeadContext, route: Vec2[]): Vec2[] {
  const line = resample(route, 1);
  const bad = line.map((p) => !standable(ctx, p.x, p.z));
  // The child's own spot counts as good: they are standing on it.
  bad[0] = false;
  if (!bad.includes(true)) return route;
  const out: Vec2[] = [line[0]];
  let i = 1;
  while (i < line.length) {
    if (!bad[i]) {
      out.push(line[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < line.length && bad[j]) j++;
    // From a few steps before the bad stretch to a few after it.
    const keep = Math.max(0, out.length - 4);
    const a = out[keep];
    const bIndex = Math.min(line.length - 1, j + 3);
    const b = line[bIndex];
    let around: Vec2[] | null = null;
    if (!bad[bIndex]) {
      for (const margin of [12, 30, 60]) {
        around = gridPath(leadGrid(ctx, a, b, margin), a, b);
        if (around) break;
      }
    }
    if (!around) return out;
    out.length = keep;
    out.push(...around);
    i = bIndex + 1;
  }
  return out;
}

/* ------------------------------------------------------------------ leading */

export type LeadMode = "lead" | "wait" | "back" | "arrived";

/** One lead in progress. Mutated in place by `stepLead`: nothing per frame is allocated. */
export type LeadRun = {
  route: Vec2[];
  /** Distance along the route at each point. */
  cum: Float64Array;
  total: number;
  /** The pet's own distance along. */
  s: number;
  /** How far along the child has got (their nearest point on the route). */
  kid: number;
  /** How far the child stands from the route. */
  off: number;
  mode: LeadMode;
  /** The pet's speed along the route, signed: back toward the child is negative. */
  v: number;
  /** Seconds the child has been off the route. */
  away: number;
  /** Seconds since arriving. */
  since: number;
  /** The child's speed, smoothed: the pet runs further ahead of a galloping child. */
  kidSpeed: number;
  /** Where the child has arrived: within `ar` of (`ax`, `az`). */
  ax: number;
  az: number;
  ar: number;
};

/** A lead along `route`, done when the child is within `arrive.r` of `arrive` (the route's end by default). */
export function startLead(route: Vec2[], arrive?: { x: number; z: number; r: number }): LeadRun | null {
  if (route.length < 2) return null;
  const cum = new Float64Array(route.length);
  for (let i = 1; i < route.length; i++) cum[i] = cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  const end = route[route.length - 1];
  const at = arrive ?? { x: end.x, z: end.z, r: LEAD_ARRIVE };
  return { route, cum, total: cum[route.length - 1], s: 0, kid: 0, off: 0, mode: "lead", v: 0, away: 0, since: 0, kidSpeed: 0, ax: at.x, az: at.z, ar: at.r };
}

/** The point `s` along the route, into `out`, with the direction of travel there. */
export function routeAt(run: Pick<LeadRun, "route" | "cum" | "total">, s: number, out: { x: number; z: number; dx: number; dz: number }): void {
  const r = run.route;
  const d = Math.max(0, Math.min(run.total, s));
  let lo = 0;
  let hi = r.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (run.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = r[lo];
  const b = r[hi];
  const len = run.cum[hi] - run.cum[lo];
  const t = len > 1e-9 ? (d - run.cum[lo]) / len : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.dx = len > 1e-9 ? (b.x - a.x) / len : 0;
  out.dz = len > 1e-9 ? (b.z - a.z) / len : 1;
}

/** Where the child is along the route: searched near where they were, never the whole line. */
function project(run: LeadRun, x: number, z: number): void {
  const r = run.route;
  const lo = run.kid - 40;
  const hi = run.kid + 60;
  let bestD = Infinity;
  let bestS = run.kid;
  for (let i = 0; i < r.length - 1; i++) {
    if (run.cum[i + 1] < lo) continue;
    if (run.cum[i] > hi) break;
    const a = r[i];
    const b = r[i + 1];
    const len = run.cum[i + 1] - run.cum[i];
    const t = len > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      bestD = d;
      bestS = run.cum[i] + t * len;
    }
  }
  run.off = bestD;
  run.kid = bestS;
}

export type LeadStep = {
  /** Where the pet stands this frame, and which way it faces (atan2(dx, dz), like the hero). */
  x: number;
  z: number;
  heading: number;
  /** How fast it is going, units a second: the legs turn over by it. */
  speed: number;
};

export function makeLeadStep(): LeadStep {
  return { x: 0, z: 0, heading: 0, speed: 0 };
}

export type LeadEvent = "arrive" | "lost" | "done" | null;

const at = { x: 0, z: 0, dx: 0, dz: 0 };

/**
 * One frame of leading. `kid` is the child's position and `kidSpeed` how fast they are going.
 * Writes the pet's place into `out` and returns what happened: `arrive` the frame the child gets
 * there, `done` when the pet has waited its moment after that, `lost` when the child has
 * plainly gone somewhere else. The pet only ever stands ON the route, so it can only ever be
 * where the route is: out of every wall and out of deep water.
 */
export function stepLead(run: LeadRun, kidX: number, kidZ: number, kidSpeed: number, dt: number, calm: boolean, out: LeadStep): LeadEvent {
  run.kidSpeed += (kidSpeed - run.kidSpeed) * Math.min(1, dt * 3);
  project(run, kidX, kidZ);
  let event: LeadEvent = null;

  // Arrived: the child is at the end. The pet goes to it, waits a moment, and is done.
  if (run.mode !== "arrived" && Math.hypot(kidX - run.ax, kidZ - run.az) < run.ar) {
    run.mode = "arrived";
    run.since = 0;
    event = "arrive";
  }

  const wander = LEAD_WANDER + Math.min(6, run.kidSpeed * 0.3);
  let goal: number;
  if (run.mode === "arrived") {
    run.since += dt;
    if (run.since >= LEAD_ARRIVE_HOLD) event = "done";
    goal = run.total;
  } else if (run.off > wander) {
    // Wandering: the pet comes back along its own route to the nearest point to the child, and
    // waits there looking at them. Gone too far, or too long, and it gives up.
    run.away += dt;
    run.mode = "back";
    if (run.off > LEAD_GIVE_UP || run.away > LEAD_GIVE_UP_S) event = "lost";
    goal = Math.min(run.total, run.kid + 1.5);
  } else {
    run.away = 0;
    const ahead = calm ? LEAD_AHEAD_CALM : Math.min(LEAD_AHEAD_MAX, LEAD_AHEAD + run.kidSpeed * 0.35);
    goal = Math.min(run.total, run.kid + ahead);
    run.mode = "lead";
  }

  // Toward the goal along the route: ahead of the child it runs, beside the goal it stands, and
  // a child who drifts back along the route is walked back to, but only past a little slack.
  const gap = goal - run.s;
  // The child's speed as it is NOW, not smoothed: a pony breaking into a gallop must not leave the pet behind.
  const pace = Math.max(kidSpeed, run.kidSpeed);
  const top = Math.max(calm ? LEAD_RUN_CALM : LEAD_RUN, pace * (calm ? 1.3 : 1.6));
  const exact = run.mode !== "lead";
  let want = 0;
  if (gap > 0.05) want = Math.min(top, pace + 1.5 + gap * (calm ? 1.2 : 2.5));
  else if (gap < (exact ? -0.05 : -LEAD_SLACK)) want = -Math.min(top, 1.5 + -gap * (calm ? 1.2 : 2));
  // Easing into a run and out of it, gentler in calm mode.
  const ease = Math.min(1, dt * (calm ? 4 : 9));
  run.v += (want - run.v) * ease;
  let step = run.v * dt;
  // Only ever toward the goal, and never past it: a pet that overshoots and comes back is a yo-yo.
  if ((step > 0 && want <= 0) || (step < 0 && want >= 0)) step = 0;
  const before = run.s;
  if (step > 0) run.s = Math.min(run.s + step, goal, run.total);
  else if (step < 0) run.s = Math.max(run.s + step, exact ? goal : goal + LEAD_SLACK * 0.5, 0);
  const moving = Math.abs(run.s - before) > 1e-4;
  if (!moving && want === 0) run.v *= 0.5;
  if (run.mode === "lead" && !moving && run.kidSpeed < 0.6) run.mode = "wait";

  routeAt(run, run.s, at);
  out.x = at.x;
  out.z = at.z;
  out.speed = moving ? Math.abs(run.s - before) / Math.max(dt, 1e-6) : 0;
  // Facing: the way it is going; standing, back at the child — the "come on, this way" look.
  out.heading = moving ? (run.s > before ? Math.atan2(at.dx, at.dz) : Math.atan2(-at.dx, -at.dz)) : Math.atan2(kidX - at.x, kidZ - at.z);
  return event;
}

/* ------------------------------------------------------------------ errands */

/*
 * THE PET'S OWN SMALL JOBS — the three the spec's companion table (D7.9, §3.6) gives it beside
 * leading, which the first companion pass left out:
 *
 *   - **sit**: a child standing at a door they can go through (a raised building's, the doors
 *     `doorways.ts` lists) — the pet trots to the doorstep and sits beside it, looking at the door:
 *     "in here". A child walking up to the villager in front of their house finds the pet already
 *     sitting at the door behind them.
 *   - **sniff**: during a run of the Ring, a live gleam near the child — the pet runs to it and puts
 *     its nose to it: "one here!". When it is taken, the next one near; when none are near, heel.
 *   - **trouble**: full depth only, and never under `fewerChoices`: while the pet leads, a trouble
 *     that comes within `TROUBLE_RANGE` of it pulls it off the route — it goes to a safe stand-off
 *     short of the trouble and watches it, for as long as the trouble lives. Then it comes back to
 *     its route the way it went and leads on. It lets a trouble be if the child plainly walks on
 *     past, or after a while, and never breaks off for the same trouble twice in one lead.
 *
 * Precedence, the spec's (sit > sniff > lead > heel) with the one change this island's pet needs:
 * a lead the child ASKED for (F) is theirs, so while it runs only a trouble may pull the pet off
 * it, and only for a moment; sit and sniff fill the time the pet would otherwise spend at heel.
 *
 * Never the only marker (D7.10): a gleam glows and bobs by itself, a door is lit and has its E
 * prompt, a trouble has its plate. The pet only points at what is already marked.
 *
 * Every errand walks a route planned over the same grid a lead's is — round every solid, never
 * into deep water — and the pet only ever stands on it. No pet (a grown-up's visit, a child with
 * none) is no errands: nothing here runs without a pet to run it.
 */

export type ErrandKind = "sniff" | "sit" | "trouble";

/** The pet notices a gleam this close to the child; further, it stays by them. (Spec: 14.) */
export const SNIFF_RANGE = 14;
/** A door the child is this close to (from the doorstep), in front of the building, is "in reach". */
export const SIT_RANGE = 5;
/** Full depth, while leading: a trouble this close to the pet pulls it off its route. (Spec: 10.) */
export const TROUBLE_RANGE = 10;
/** How far short of a gleam the pet stands: nose to it, never on it. */
export const SNIFF_SHORT = 0.9;
/** How far short of a trouble the pet stops: near enough to point at it, never touching it. */
export const TROUBLE_STAND = 3.4;
/** The longest the pet watches a trouble the child is doing nothing about, before it leads on. */
export const TROUBLE_HOLD_S = 14;
/** The child this far from the trouble has walked on past it: the pet lets it be. */
export const TROUBLE_LEAVE = TROUBLE_RANGE + 8;
/** An errand longer than this over the ground is not a small job: the pet stays where it is. */
export const ERRAND_MAX = 32;

/** A door as `doorways.ts` builds them: facing +z, `face` the z of its wall. */
export type DoorLike = { readonly x: number; readonly face: number; readonly hw: number };
export type GleamLike = { readonly live: boolean; readonly x: number; readonly z: number };
export type TroubleLike = { readonly live: boolean; readonly dying: boolean; readonly x: number; readonly z: number; readonly serial: number };

export type ErrandInput = {
  hero: Vec2;
  /**
   * Which way the child faces (atan2(dx, dz), like the hero), or null if not known. A door counts
   * as "about to be gone through" only for a child turned toward it: walking PAST a row of houses
   * must not send the pet from doorstep to doorstep.
   */
  heroFacing: number | null;
  pet: Vec2;
  /** A lead the child asked for is running, and not yet arrived: only a trouble may take the pet off it. */
  leading: boolean;
  /** Doors a child can go through. */
  doors: readonly DoorLike[];
  /** The Ring's gleams during a run on the child's own visit; null outside a run. */
  gleams: readonly GleamLike[] | null;
  /** How many of `gleams` are in play. */
  slots: number;
  /** The troubles, or null at simple depth, under `fewerChoices`, or with none in the world. */
  troubles: readonly TroubleLike[] | null;
  /** A trouble this lead has already broken off for (slot → serial), never broken off for again. */
  seen: (slot: number, serial: number) => boolean;
};

/** What the pet goes to do: where it stands, what it looks at, and which thing it is for. */
export type ErrandPick = {
  kind: ErrandKind;
  x: number;
  z: number;
  lookX: number;
  lookZ: number;
  /** The gleam's slot, the door's index, or the trouble's slot. */
  key: number;
  /** A trouble's spawn serial (a reused slot is a new trouble); 0 otherwise. */
  serial: number;
};

export function makeErrandPick(): ErrandPick {
  return { kind: "sit", x: 0, z: 0, lookX: 0, lookZ: 0, key: -1, serial: 0 };
}

/** The doorstep a child stands at to go in: a step out from the middle of the door. */
function stepX(d: DoorLike): number {
  return d.x;
}
function stepZ(d: DoorLike): number {
  return d.face + 0.9;
}

/** A door is only "about to be gone through" by a child turned within this of it (about 45°). */
const FACING_DOOR = 0.7;

/**
 * The door in reach of the child, or -1: near its doorstep, in front of the building rather than
 * behind it, and — when `facing` is given — with the child turned toward it (or already on the step).
 */
export function doorInReach(doors: readonly DoorLike[], hero: Vec2, range = SIT_RANGE, facing: number | null = null): number {
  let best = -1;
  let bestD = range;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (hero.z < d.face - 0.3) continue;
    const dx = stepX(d) - hero.x;
    const dz = stepZ(d) - hero.z;
    const dist = Math.hypot(dx, dz);
    if (facing !== null && dist > 1.5 && (Math.sin(facing) * dx + Math.cos(facing) * dz) / dist < FACING_DOOR) continue;
    if (dist <= bestD) {
      best = i;
      bestD = dist;
    }
  }
  return best;
}

/** The live gleam nearest the child within `range`, or -1. */
export function gleamInReach(gleams: readonly GleamLike[], slots: number, hero: Vec2, range = SNIFF_RANGE): number {
  let best = -1;
  let bestD = range;
  const n = Math.min(slots, gleams.length);
  for (let i = 0; i < n; i++) {
    const g = gleams[i];
    if (!g.live) continue;
    const d = Math.hypot(g.x - hero.x, g.z - hero.z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** The living trouble nearest the pet within `range` that this lead has not broken off for yet, or -1. */
export function troubleInReach(troubles: readonly TroubleLike[], pet: Vec2, seen: ErrandInput["seen"], range = TROUBLE_RANGE): number {
  let best = -1;
  let bestD = range;
  for (let i = 0; i < troubles.length; i++) {
    const t = troubles[i];
    if (!t.live || t.dying || seen(i, t.serial)) continue;
    const d = Math.hypot(t.x - pet.x, t.z - pet.z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * Which errand, if any, the pet should be on now — written into `out`. Precedence: while an asked
 * lead runs, only a trouble; otherwise a door in reach, then a gleam near. Pure, allocation-free.
 */
export function chooseErrand(input: ErrandInput, out: ErrandPick): boolean {
  const { hero, pet } = input;
  if (input.leading) {
    if (!input.troubles) return false;
    const i = troubleInReach(input.troubles, pet, input.seen);
    if (i < 0) return false;
    const t = input.troubles[i];
    // Short of it, on the pet's own side: pointing, never touching.
    const d = Math.hypot(pet.x - t.x, pet.z - t.z) || 1;
    out.kind = "trouble";
    out.x = t.x + ((pet.x - t.x) / d) * TROUBLE_STAND;
    out.z = t.z + ((pet.z - t.z) / d) * TROUBLE_STAND;
    out.lookX = t.x;
    out.lookZ = t.z;
    out.key = i;
    out.serial = t.serial;
    return true;
  }
  const door = doorInReach(input.doors, hero, SIT_RANGE, input.heroFacing);
  if (door >= 0) {
    const d = input.doors[door];
    // Beside the door, on the child's side of it, sitting on the step and looking at the door.
    const side = hero.x >= d.x ? 1 : -1;
    out.kind = "sit";
    out.x = d.x + side * (d.hw + 0.55);
    out.z = d.face + 0.75;
    out.lookX = d.x;
    out.lookZ = d.face - 2;
    out.key = door;
    out.serial = 0;
    return true;
  }
  if (input.gleams) {
    const i = gleamInReach(input.gleams, input.slots, hero);
    if (i >= 0) {
      const g = input.gleams[i];
      const d = Math.hypot(pet.x - g.x, pet.z - g.z);
      out.kind = "sniff";
      out.x = d > SNIFF_SHORT ? g.x + ((pet.x - g.x) / d) * SNIFF_SHORT : pet.x;
      out.z = d > SNIFF_SHORT ? g.z + ((pet.z - g.z) / d) * SNIFF_SHORT : pet.z;
      out.lookX = g.x;
      out.lookZ = g.z;
      out.key = i;
      out.serial = 0;
      return true;
    }
  }
  return false;
}

/** One errand in progress. Mutated in place by `stepErrand`: nothing per frame is allocated. */
export type ErrandRun = {
  kind: ErrandKind;
  key: number;
  serial: number;
  route: Vec2[];
  cum: Float64Array;
  total: number;
  /** The pet's distance along. */
  s: number;
  v: number;
  /** Coming back along the route to where it set out from (a trouble's errand, to its lead). */
  back: boolean;
  /** Seconds since it got there. */
  since: number;
  lookX: number;
  lookZ: number;
};

/**
 * The way to an errand's spot: one short search over the ground, round every solid and out of
 * deep water — the same grid a lead walks. Null when there is no such way, or it is no small job.
 */
export function planErrand(ctx: LeadContext, from: Vec2, to: Vec2): Vec2[] | null {
  if (Math.hypot(to.x - from.x, to.z - from.z) > ERRAND_MAX) return null;
  const path = gridPath(leadGrid(ctx, from, to, 6), from, to);
  if (!path || routeLength(path) > ERRAND_MAX * 1.6) return null;
  return path.length === 1 ? [path[0], { ...path[0] }] : resample(path, 1.5);
}

export function startErrand(route: Vec2[], pick: ErrandPick): ErrandRun | null {
  if (route.length < 2) return null;
  const cum = new Float64Array(route.length);
  for (let i = 1; i < route.length; i++) cum[i] = cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return { kind: pick.kind, key: pick.key, serial: pick.serial, route, cum, total: cum[route.length - 1], s: 0, v: 0, back: false, since: 0, lookX: pick.lookX, lookZ: pick.lookZ };
}

/** Whether a chosen errand still stands: its gleam uneaten and near, its door still in reach, its trouble alive and the child not gone past. */
export function errandHolds(run: ErrandRun, input: ErrandInput): boolean {
  const h = input.hero;
  if (run.kind === "sit") {
    const d = input.doors[run.key];
    return !!d && doorInReach(input.doors, h, SIT_RANGE + 2) === run.key;
  }
  if (run.kind === "sniff") {
    const g = input.gleams?.[run.key];
    return !!g && g.live && run.key < input.slots && Math.hypot(g.x - h.x, g.z - h.z) <= SNIFF_RANGE + 3;
  }
  const t = input.troubles?.[run.key];
  return !!t && t.live && !t.dying && t.serial === run.serial && run.since < TROUBLE_HOLD_S && Math.hypot(t.x - h.x, t.z - h.z) <= TROUBLE_LEAVE;
}

/** Sends the pet back the way it came: a trouble's errand ends back on its lead's route. */
export function errandHome(run: ErrandRun): void {
  run.back = true;
}

const eat = { x: 0, z: 0, dx: 0, dz: 0 };

/**
 * One frame of an errand: along the route to the spot (or back to the start), then standing,
 * facing what it came for. Writes the pet's place into `out`; returns "there" the frame it
 * arrives, "home" the frame it is back where it set out from, otherwise null.
 */
export function stepErrand(run: ErrandRun, dt: number, calm: boolean, out: LeadStep): "there" | "home" | null {
  const goal = run.back ? 0 : run.total;
  const gap = goal - run.s;
  const top = calm ? LEAD_RUN_CALM : LEAD_RUN;
  const want = Math.abs(gap) > 0.02 ? Math.sign(gap) * Math.min(top, 1.5 + Math.abs(gap) * (calm ? 1.2 : 2.5)) : 0;
  run.v += (want - run.v) * Math.min(1, dt * (calm ? 4 : 9));
  const before = run.s;
  let step = run.v * dt;
  if ((step > 0 && want <= 0) || (step < 0 && want >= 0)) step = 0;
  run.s = step > 0 ? Math.min(run.s + step, goal) : step < 0 ? Math.max(run.s + step, goal) : run.s;
  const moving = Math.abs(run.s - before) > 1e-4;
  routeAt(run, run.s, eat);
  out.x = eat.x;
  out.z = eat.z;
  out.speed = moving ? Math.abs(run.s - before) / Math.max(dt, 1e-6) : 0;
  out.heading = moving ? (run.s > before ? Math.atan2(eat.dx, eat.dz) : Math.atan2(-eat.dx, -eat.dz)) : Math.atan2(run.lookX - eat.x, run.lookZ - eat.z);
  const arrivedNow = Math.abs(goal - run.s) <= 0.02 && Math.abs(goal - before) > 0.02;
  if (!run.back && Math.abs(goal - run.s) <= 0.02) run.since += dt;
  if (!arrivedNow) return null;
  return run.back ? "home" : "there";
}

/* ------------------------------------------------------------------ the wire */

/** What the frame hears from the canvas. */
export type LeadNews =
  /** `route` is the way it will go (the map draws it); `again` is a lead taken up after a ride. */
  | { kind: "start"; target: LeadTarget; route: readonly Vec2[]; again: boolean }
  | { kind: "arrive"; target: LeadTarget }
  | { kind: "lost"; target: LeadTarget }
  | { kind: "stopped"; target: LeadTarget }
  | { kind: "noway"; target: LeadTarget }
  | { kind: "mode"; mode: LeadMode | "heel" }
  /** The pet set off on an errand of its own (or came back from one: null). */
  | { kind: "errand"; errand: ErrandKind | null };

export type LeadBus = {
  /** A request from the frame, eaten by the canvas: lead here. */
  ask: LeadTarget | null;
  /** A request from the frame, eaten by the canvas: stop leading. */
  stop: boolean;
  /** Written by the canvas: whether a lead is running, and to where. */
  active: boolean;
  target: LeadTarget | null;
  mode: LeadMode | "heel";
  /** Where the pet stands, written by the canvas every frame (in place: nothing allocated). */
  pet: { x: number; z: number };
  /** Reduced motion or low stimulus: a gentler pet. */
  calm: boolean;
  /**
   * Whether the pet may break off a lead toward a trouble: full depth, and never under
   * `fewerChoices` (spec §3.6). Written by the frame.
   */
  breakOff: boolean;
  /** Written by the canvas: the errand the pet is on, if any. */
  errand: ErrandKind | null;
  /** Fired by the canvas when a lead starts, arrives, is lost, stopped or cannot find a way. */
  onNews: (news: LeadNews) => void;
};

const noop = () => {};

export function makeLeadBus(calm = false): LeadBus {
  return { ask: null, stop: false, active: false, target: null, mode: "heel", pet: { x: 0, z: 0 }, calm, breakOff: false, errand: null, onNews: noop };
}

export function setLeadNews(lead: LeadBus, fn: ((news: LeadNews) => void) | null): void {
  lead.onNews = fn ?? noop;
}

/** F, or the pet's slot: lead if it is not leading, stop if it is. */
export function askLead(lead: LeadBus, target: LeadTarget): void {
  lead.stop = false;
  lead.ask = target;
}

export function askStopLead(lead: LeadBus): void {
  lead.ask = null;
  if (lead.active) lead.stop = true;
}

/*
 * The canvas's half. It writes the bus only through these, never by assigning through a prop:
 * the React compiler holds a prop immutable (the same rule `RideBus` and `HudBus` keep).
 */

/** Takes the frame's stop request, if there is one. */
export function takeStop(lead: LeadBus): boolean {
  const asked = lead.stop;
  lead.stop = false;
  return asked;
}

/** Takes the frame's lead request, if there is one. */
export function takeAsk(lead: LeadBus): LeadTarget | null {
  const asked = lead.ask;
  lead.ask = null;
  return asked;
}

/** What the pet is doing now: said to the frame only when it changes. */
export function setLeadMode(lead: LeadBus, mode: LeadMode | "heel"): void {
  if (lead.mode === mode) return;
  lead.mode = mode;
  lead.onNews({ kind: "mode", mode });
}

/** A lead has set off along `route`. */
export function leadStarted(lead: LeadBus, target: LeadTarget, route: readonly Vec2[], again: boolean): void {
  lead.active = true;
  lead.target = target;
  lead.onNews({ kind: "start", target, route, again });
  setLeadMode(lead, "lead");
}

/** A lead is over — stopped, lost, arrived and done, or it never found a way. Back to heel. */
export function leadOver(lead: LeadBus, said: "stopped" | "lost" | null): void {
  const target = lead.target;
  lead.active = false;
  lead.target = null;
  lead.ask = null;
  if (said && target) lead.onNews({ kind: said, target });
  setLeadMode(lead, "heel");
}

/** A fast-travel ride carries the pet: the lead is asked for again, to be planned where the ride ends. */
export function setLeadAside(lead: LeadBus): void {
  lead.ask = lead.target;
}

/** Where the pet stands this frame, in place. */
export function putPet(lead: LeadBus, x: number, z: number): void {
  lead.pet.x = x;
  lead.pet.z = z;
}

/** The frame's say on whether the pet may break off toward a trouble (full depth, not `fewerChoices`). */
export function setLeadBreakOff(lead: LeadBus, on: boolean): void {
  lead.breakOff = on;
}

/** The errand the pet is on now: said to the frame only when it changes. */
export function setLeadErrand(lead: LeadBus, errand: ErrandKind | null): void {
  if (lead.errand === errand) return;
  lead.errand = errand;
  lead.onNews({ kind: "errand", errand });
}
