import { WORLD_SIZE, type Prop, type Vec2, type WorldLayout } from "../layout";
import { HERO_RADIUS } from "../movement";
import { seededRng } from "@/lib/utils/drill-generators";
import type { SpellDefinition, StatusKind } from "@/lib/utils/spell-catalog";

export type TroubleKind = "fog" | "cursed-stone" | "shadow-blob";
export type TroubleSkin = "gentle" | "monsters";
export type TroubleStatus = { kind: StatusKind; until: number }; // simulation-clock ms
export type Trouble = {
  id: string;
  kind: TroubleKind;
  siteId: string;
  position: Vec2;
  origin: Vec2; // where it spawned; wanderers stay within WANDER of it
  drift: Vec2; // unit direction for the wander walk
  hitsLeft: number;
  statuses: TroubleStatus[];
  spawnedAt: number;
  retreatUntil: number; // simulation-clock ms; a blob that just made contact wanders instead of approaching until this passes
};
export type TroubleCopy = { gentleName: string; monstersName: string; gentle: string; monsters: string };

export const TROUBLE_COPY: Record<TroubleKind, TroubleCopy> = {
  fog: { gentleName: "Fog", monstersName: "Mist-wisp", gentle: "The fog thins.", monsters: "The mist-wisp scatters!" },
  "cursed-stone": { gentleName: "Cursed stone", monstersName: "Gargoyle", gentle: "The stone's curse lifts.", monsters: "The gargoyle crumbles!" },
  "shadow-blob": { gentleName: "Shadow", monstersName: "Blob", gentle: "The shadow slips away.", monsters: "The blob bounces off!" },
};

export const TROUBLE_RADIUS = 0.7;
export const MAX_TROUBLES = 6;
export const LOW_STIMULUS_MAX = 3;
export const RESPAWN_MS = 20_000;
export const BLOB_SENSE = 6;
export const FOCUS_RADIUS = HERO_RADIUS + 0.5;
export const PUSHBACK = 4;
export const RETREAT_MS = 4000;
const WANDER = 3;
const KIND_ORDER: TroubleKind[] = ["fog", "cursed-stone", "shadow-blob"];
const HITS: Record<TroubleKind, number> = { fog: 1, "cursed-stone": 2, "shadow-blob": 1 };
const SPEED: Record<TroubleKind, number> = { fog: 0.6, "cursed-stone": 0, "shadow-blob": 1.8 };
const CLEAR_FROM_VILLAGER = 1.5;
const CLEAR_FROM_PATH = 2.5;
const CLEAR_FROM_SPAWN = 4;
const LIMIT = WORLD_SIZE / 2 - 1;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

function unit(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.z);
  return len === 0 ? { x: 0, z: -1 } : { x: v.x / len, z: v.z / len };
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type SpawnInput = {
  seed: number;
  now: number;
  layout: WorldLayout;
  troubles: Trouble[];
  clearedSites: Record<string, number>; // siteId → simulation time the last trouble there was cleared
  lowStimulus: boolean;
};

/**
 * One trouble per unfinished site, up to the cap, placed by a seeded rule so
 * the same seed and state always give the same world. A cleared site waits
 * RESPAWN_MS before it draws a new one.
 */
export function spawnTroubles(input: SpawnInput): Trouble[] {
  const cap = input.lowStimulus ? LOW_STIMULUS_MAX : MAX_TROUBLES;
  const sites = input.layout.props.filter((p) => p.kind === "foundation");
  const paths = input.layout.props.filter((p) => p.kind === "path");
  const siteIds = new Set(sites.map((s) => s.id));
  const result = input.troubles.filter((t) => siteIds.has(t.siteId) && !input.layout.colliders.some((c) => insideProp(t.position, c, TROUBLE_RADIUS)));
  sites.forEach((site, index) => {
    if (result.length >= cap) return;
    if (result.some((t) => t.siteId === site.id)) return;
    const clearedAt = input.clearedSites[site.id];
    if (clearedAt !== undefined && input.now - clearedAt < RESPAWN_MS) return;
    const rng = seededRng((input.seed + hashId(site.id) + (clearedAt ?? 0)) >>> 0);
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng() * Math.PI * 2;
      const d = 3 + rng() * 2;
      const p = { x: site.position.x + Math.cos(angle) * d, z: site.position.z + Math.sin(angle) * d };
      if (Math.abs(p.x) > LIMIT || Math.abs(p.z) > LIMIT) continue;
      if (input.layout.colliders.some((c) => insideProp(p, c, TROUBLE_RADIUS))) continue;
      if (input.layout.villagers.some((v) => dist(p, v.position) < CLEAR_FROM_VILLAGER)) continue;
      if (paths.some((t) => dist(p, t.position) < CLEAR_FROM_PATH)) continue;
      if (dist(p, input.layout.spawn) < CLEAR_FROM_SPAWN) continue;
      const kind = KIND_ORDER[index % KIND_ORDER.length];
      const driftAngle = rng() * Math.PI * 2;
      result.push({
        id: `${site.id}:${input.now}`,
        kind,
        siteId: site.id,
        position: p,
        origin: p,
        drift: { x: Math.cos(driftAngle), z: Math.sin(driftAngle) },
        hitsLeft: HITS[kind],
        statuses: [],
        spawnedAt: input.now,
        retreatUntil: 0,
      });
      return;
    }
  });
  return result;
}

/** 1 when free; bound freezes, chilled halves, slowed multiplies by 0.4; the strongest applies. */
export function speedFactor(statuses: TroubleStatus[], now: number): number {
  let factor = 1;
  for (const s of statuses) {
    if (s.until <= now) continue;
    if (s.kind === "bound") return 0;
    if (s.kind === "chilled") factor = Math.min(factor, 0.5);
    if (s.kind === "slowed") factor = Math.min(factor, 0.4);
  }
  return factor;
}

export type StepOptions = { now: number; lowStimulus: boolean; reducedMotion: boolean; shielded: boolean; dazzled: boolean };

function moveWithin(t: Trouble, delta: Vec2, colliders: Prop[]): Vec2 {
  const next = { x: t.position.x + delta.x, z: t.position.z + delta.z };
  if (Math.abs(next.x) > LIMIT || Math.abs(next.z) > LIMIT) return t.position;
  if (colliders.some((c) => insideProp(next, c, TROUBLE_RADIUS))) return t.position;
  return next;
}

/** Valid at PUSHBACK, then half, then a quarter of it; the first one inside the world and outside every collider wins. */
function pushback(position: Vec2, away: Vec2, colliders: Prop[]): Vec2 {
  for (const dist of [PUSHBACK, PUSHBACK / 2, PUSHBACK / 4]) {
    const candidate = { x: position.x + away.x * dist, z: position.z + away.z * dist };
    if (Math.abs(candidate.x) > LIMIT || Math.abs(candidate.z) > LIMIT) continue;
    if (colliders.some((c) => insideProp(candidate, c, TROUBLE_RADIUS))) continue;
    return candidate;
  }
  return position;
}

/** One frame for every trouble. Fog wanders, stones sit, blobs wander until the hero is close, then approach. */
export function stepTroubles(troubles: Trouble[], hero: Vec2, dt: number, colliders: Prop[], opts: StepOptions): { troubles: Trouble[]; focusLost: boolean } {
  let focusLost = false;
  const out = troubles.map((t) => {
    const statuses = t.statuses.filter((s) => s.until > opts.now);
    const speed = SPEED[t.kind] * speedFactor(statuses, opts.now);
    let next: Trouble = { ...t, statuses };
    if (speed > 0) {
      if (t.kind === "shadow-blob" && !opts.lowStimulus && opts.now >= t.retreatUntil && dist(t.position, hero) <= BLOB_SENSE) {
        const dir = unit({ x: hero.x - t.position.x, z: hero.z - t.position.z });
        next = { ...next, position: moveWithin(next, { x: dir.x * speed * dt, z: dir.z * speed * dt }, colliders) };
      } else if (!(t.kind === "fog" && opts.reducedMotion)) {
        let drift = t.drift;
        if (dist(t.position, t.origin) > WANDER) drift = unit({ x: t.origin.x - t.position.x, z: t.origin.z - t.position.z });
        next = { ...next, drift, position: moveWithin(next, { x: drift.x * speed * dt, z: drift.z * speed * dt }, colliders) };
      }
    }
    if (next.kind === "shadow-blob" && opts.now >= next.retreatUntil && dist(next.position, hero) <= FOCUS_RADIUS) {
      const away = unit({ x: next.position.x - hero.x, z: next.position.z - hero.z });
      next = { ...next, retreatUntil: opts.now + RETREAT_MS, position: pushback(next.position, away, colliders) };
      if (!opts.shielded && !opts.dazzled) focusLost = true;
    }
    return next;
  });
  return { troubles: out, focusLost };
}

export function hitTrouble(trouble: Trouble, point: Vec2, radius: number): boolean {
  return dist(trouble.position, point) <= radius + TROUBLE_RADIUS;
}

/** A hit takes one point and leaves the spell's timed statuses behind; lifetime statuses (durationMs 0) never stick to a trouble. */
export function applyHit(trouble: Trouble, spell: SpellDefinition, now: number): { trouble: Trouble; cleared: boolean } {
  const hitsLeft = trouble.hitsLeft - 1;
  const statuses = [...trouble.statuses, ...spell.statuses.filter((s) => s.durationMs > 0).map((s) => ({ kind: s.kind, until: now + s.durationMs }))];
  return { trouble: { ...trouble, hitsLeft, statuses }, cleared: hitsLeft <= 0 };
}

export type ClearTally = { session: number; byKind: Record<TroubleKind, number> };

export function startTally(): ClearTally {
  return { session: 0, byKind: { fog: 0, "cursed-stone": 0, "shadow-blob": 0 } };
}

export function recordClear(tally: ClearTally, kind: TroubleKind): ClearTally {
  return { session: tally.session + 1, byKind: { ...tally.byKind, [kind]: tally.byKind[kind] + 1 } };
}
