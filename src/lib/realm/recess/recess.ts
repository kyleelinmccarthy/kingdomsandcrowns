import { SPAWN, WORLD_SIZE, type Prop, type Vec2, type WorldLayout } from "../layout";
import { seededRng } from "@/lib/utils/drill-generators";

export type Gleam = { id: string; slot: number; position: Vec2; spawnedAt: number };
export type RecessEvent = { kind: "gleam"; count: number } | { kind: "lap"; lapMs: number; laps: number; best: boolean };
export type RecessState = {
  active: boolean;
  gleams: Gleam[];
  collected: number;
  laps: number;
  lapStartedAt: number | null;
  bestLapMs: number | null;
  nextWaypoint: number;
  slotRespawnAt: Record<number, number>; // slot → simulation time it may spawn again
  slotSpawns: Record<number, number>; // slot → how many times it has spawned (seeds variety)
};

export const GLEAM_COUNT = 12;
export const GLEAM_COUNT_LOW = 6;
export const GLEAM_RADIUS = 0.8;
export const GLEAM_RESPAWN_MS = 10_000;
export const WAYPOINT_RADIUS = 2;
export const LAP_START: Vec2 = SPAWN;
/** A ring around the kingdom's sites, clockwise from the gate, staying clear of the largest castle footprint. */
export const LAP_WAYPOINTS: Vec2[] = [
  { x: -9, z: 11 },
  { x: -12, z: 1 },
  { x: -12, z: -9 },
  { x: -6, z: -17 },
  { x: 6, z: -17 },
  { x: 12, z: -9 },
  { x: 12, z: 1 },
  { x: 9, z: 11 },
];
const LIMIT = WORLD_SIZE / 2 - 2;
const CLEAR_COLLIDER = 1;
const CLEAR_VILLAGER = 2;
const CLEAR_PATH = 2;
const CLEAR_SPAWN = 3;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

export function startRecess(): RecessState {
  return { active: false, gleams: [], collected: 0, laps: 0, lapStartedAt: null, bestLapMs: null, nextWaypoint: 0, slotRespawnAt: {}, slotSpawns: {} };
}

/** Turning recess off clears the field and the running lap; what was collected and lapped stays on the HUD. */
export function setRecessActive(state: RecessState, active: boolean): RecessState {
  if (state.active === active) return state;
  if (active) return { ...state, active: true };
  return { ...state, active: false, gleams: [], lapStartedAt: null, nextWaypoint: 0, slotRespawnAt: {} };
}

export type SpawnGleamsInput = { seed: number; now: number; layout: WorldLayout; state: RecessState; lowStimulus: boolean };

/** Fills empty gleam slots on walkable ground. Seeded per slot and spawn count so a respawn lands somewhere new but tests are stable. */
export function spawnGleams(input: SpawnGleamsInput): RecessState {
  if (!input.state.active) return input.state;
  const count = input.lowStimulus ? GLEAM_COUNT_LOW : GLEAM_COUNT;
  // Foundations are walkable but should stay clear of gleams too: a half-built
  // site is still a site. Built solids off the whole obstacle list.
  const obstacles = input.layout.props.filter((p) => p.solid || p.kind === "foundation");
  const paths = input.layout.props.filter((p) => p.kind === "path");
  const gleams = input.state.gleams.slice();
  const slotSpawns = { ...input.state.slotSpawns };
  for (let slot = 0; slot < count; slot++) {
    if (gleams.some((g) => g.slot === slot)) continue;
    const respawnAt = input.state.slotRespawnAt[slot];
    if (respawnAt !== undefined && input.now < respawnAt) continue;
    const spawns = slotSpawns[slot] ?? 0;
    const rng = seededRng((input.seed + slot * 7919 + spawns * 104729) >>> 0);
    for (let attempt = 0; attempt < 20; attempt++) {
      const p = { x: (rng() * 2 - 1) * LIMIT, z: (rng() * 2 - 1) * LIMIT };
      if (obstacles.some((c) => insideProp(p, c, CLEAR_COLLIDER))) continue;
      if (input.layout.villagers.some((v) => dist(p, v.position) < CLEAR_VILLAGER)) continue;
      if (paths.some((t) => dist(p, t.position) < CLEAR_PATH)) continue;
      if (dist(p, SPAWN) < CLEAR_SPAWN) continue;
      gleams.push({ id: `gleam-${slot}-${spawns}`, slot, position: p, spawnedAt: input.now });
      break;
    }
    // Bump even on total failure, so a dead slot's next attempt (next frame)
    // uses a fresh seed instead of retrying the exact same 20 dead points.
    slotSpawns[slot] = spawns + 1;
  }
  return { ...input.state, gleams, slotSpawns };
}

/** One frame of recess: collect gleams in reach and advance the lap. */
export function stepRecess(state: RecessState, hero: Vec2, now: number): { state: RecessState; events: RecessEvent[] } {
  if (!state.active) return { state, events: [] };
  const events: RecessEvent[] = [];
  let next = state;
  const remaining: Gleam[] = [];
  let collected = state.collected;
  const slotRespawnAt = { ...state.slotRespawnAt };
  for (const g of state.gleams) {
    if (dist(g.position, hero) <= GLEAM_RADIUS) {
      collected += 1;
      slotRespawnAt[g.slot] = now + GLEAM_RESPAWN_MS;
      events.push({ kind: "gleam", count: collected });
    } else {
      remaining.push(g);
    }
  }
  if (collected !== state.collected) next = { ...next, gleams: remaining, collected, slotRespawnAt };

  if (next.nextWaypoint < LAP_WAYPOINTS.length) {
    const w = LAP_WAYPOINTS[next.nextWaypoint];
    if (dist(hero, w) <= WAYPOINT_RADIUS) {
      next = { ...next, nextWaypoint: next.nextWaypoint + 1, lapStartedAt: next.lapStartedAt ?? now };
    }
  } else if (dist(hero, LAP_START) <= WAYPOINT_RADIUS && next.lapStartedAt !== null) {
    const lapMs = now - next.lapStartedAt;
    const best = next.bestLapMs === null || lapMs < next.bestLapMs;
    next = { ...next, laps: next.laps + 1, bestLapMs: best ? lapMs : next.bestLapMs, nextWaypoint: 0, lapStartedAt: now };
    events.push({ kind: "lap", lapMs, laps: next.laps, best });
  }
  return { state: next, events };
}

export function formatLap(ms: number): string {
  return (ms / 1000).toFixed(1);
}
