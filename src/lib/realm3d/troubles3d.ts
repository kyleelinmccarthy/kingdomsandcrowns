/**
 * TROUBLES, in the 3D Realm: where they live, how they move, and what a spell does to them.
 *
 * The rules are the flat Realm's, imported from `lib/realm/spells/troubles.ts` and not copied:
 * the three kinds and the order they are dealt in, how many hits each takes, which statuses a
 * spell leaves behind and how they slow a trouble (`speedFactor`), the cap on how many are out
 * at once (`MAX_TROUBLES`, `LOW_STIMULUS_MAX` for a calm child), how long a cleared one waits
 * before another comes (`RESPAWN_MS`), and the blob's whole temperament — it senses the hero,
 * comes over, bumps them back and then goes off to sulk for `RETREAT_MS`. It never harms them.
 * A bump costs the child nothing but a step backwards; a shield stops even that.
 *
 * What is new is only what a 640-unit island forces.
 *
 * ## Where troubles live
 *
 * The flat Realm put one beside every unfinished site, because its whole world was the
 * village. Here the village is forty units across, crowded with villagers and nameplates, and
 * it is exactly where a child goes to TALK — a fog bank drifting between Old Bram and his well
 * muddles "who do I speak to" with "what do I cast at", and the brief rules out the square,
 * the roads and the spawn anyway. So troubles live in two rings:
 *
 *   - **The outskirts.** Up to three (one of each kind, dealt in the flat Realm's order), just
 *     past the village's flat disc, in the fields — one for each unfinished site up to three,
 *     and none once the village is built, which keeps the flat Realm's story ("trouble gathers
 *     round a village that is still going up") and gives a child something to cast at within
 *     seconds of arriving.
 *   - **The places.** One haunting every named place on the map: fog on the summits and in the
 *     mires, a cursed stone in the outcrops and the Ringstones, a blob in the deep woods and on
 *     the beaches. The map already turns those places into somewhere to go (a hollow mark that
 *     fills gold); a trouble there gives the child something to DO on arrival, and a reason to
 *     go back to a place they have already found.
 *
 * Only the nearest `MAX_TROUBLES` homes are awake at once (three when calm), so the flat
 * Realm's cap still means what it meant — how many a child has to think about — and a home
 * that falls far behind the child quietly sleeps rather than wandering an empty island.
 * A cleared home respawns after `RESPAWN_MS`, but never within sight: the child has to have
 * walked away first, so a trouble never pops back up under their nose.
 *
 * ## Allocation
 *
 * Everything is a fixed pool mutated in place. `stepField` runs every frame and checks every
 * live effect against every trouble; it allocates nothing. The only allocations are on events
 * a child causes a few times a minute (a status kind a trouble has never had yet).
 *
 * ## Determinism
 *
 * The clock is the simulation's (`field.now`, advanced by the caller's `dt`), homes are placed
 * by a seeded generator, and a wanderer's drift is a hash of its serial and the clock. There is
 * no `Math.random()` and no `Date.now()`.
 */

import {
  addHitStatuses,
  BLOB_SENSE,
  LOW_STIMULUS_MAX,
  MAX_TROUBLES,
  PUSHBACK,
  RESPAWN_MS,
  RETREAT_MS,
  speedFactor,
  startTally,
  TROUBLE_COPY,
  TROUBLE_HITS,
  TROUBLE_KIND_ORDER,
  TROUBLE_SPEED,
  TROUBLE_WANDER,
  type ClearTally,
  type TroubleKind,
  type TroubleSkin,
  type TroubleStatus,
} from "@/lib/realm/spells/troubles";
import { DAZZLE_MS } from "@/lib/realm/spells/focus";
import { SHIELD_MS, SUMMON_SENSE, SUMMON_SHOT_MS } from "@/lib/realm/spells/effects";
import { MANA_PER_CLEAR } from "@/lib/realm/spells/mana";
import { seededRng } from "@/lib/utils/drill-generators";
import type { SpellDefinition, StatusKind } from "@/lib/utils/spell-catalog";
import type { Collider } from "./collision";
import { endBolt, fxPhase, fxScale, lockFx, spawnFx, type FxSlot } from "./spell-fx";

/* ------------------------------------------------------------------ numbers */

/**
 * The flat Realm's distances and speeds were set for a 3.5-unit/s hero in a 160-unit world. The
 * 3D hero walks at 11 and stands 2.3 tall, so the same RULES are played at 2.5 times the size:
 * a fog bank strays 7.5 units, a blob notices you from 15, and walks at 4.5 — slower than a
 * child, so a child can always simply walk away.
 */
export const SCALE_3D = 2.5;
export const WANDER_3D = TROUBLE_WANDER * SCALE_3D;
export const SENSE_3D = BLOB_SENSE * SCALE_3D;
/** A blob gives up the chase once the child is this far from where it lives. */
export const LEASH_3D = WANDER_3D * 3;

/** Awake troubles plus the ones still playing their clearing. */
export const TROUBLE_POOL = 8;

/** How wide each kind is on the ground, for hits and for walking. A fog bank is a big target. */
export const BODY_RADIUS: Readonly<Record<TroubleKind, number>> = { fog: 2.1, "cursed-stone": 1.25, "shadow-blob": 1.0 };
/** Where the marker hangs over each kind: just above its top. */
export const BODY_TOP: Readonly<Record<TroubleKind, number>> = { fog: 3.0, "cursed-stone": 4.3, "shadow-blob": 2.3 };

/** Nearer than this, a home wakes (if there is room under the cap). */
export const WAKE_R = 95;
/** Further than this, an awake trouble goes back to sleep, uncleared. */
export const SLEEP_R = 130;
/** A CLEARED home never comes back while the child is closer than this. */
export const NO_POP_R = 34;
/** How long a cleared trouble takes to go: the pop, the sparkle, the fade. */
export const DYING_MS = 900;

/** A bolt's own hit radius, before `grown`. Generous: the bolt knot is small and fast. */
export const BOLT_RADIUS = 0.8;
/** Half the beam's width, for hits. */
export const BEAM_HALF = 1.0;
export const BEAM_TICK_S = 0.2;
export const BEAM_TICKS = 3;
export const AURA_TICK_S = 0.5;
/** Half a wall's thickness, for hits and for blocking. */
export const SLAB_HALF = 0.35;

/** Blob contact: the hero's shoulders plus a hand's width. */
export const CONTACT = 0.8;
/** How long, and how hard, a bump pushes the child back. Hard enough to beat walking into it. */
export const KNOCK_MS = 350;
export const KNOCK_SPEED = 20;
/** A blob's own bounce off the child: back the flat Realm's PUSHBACK, at scale, as a hop. */
export const RECOIL_MS = 450;
export const RECOIL_SPEED = (PUSHBACK * SCALE_3D * 0.75) / (RECOIL_MS / 1000);

/** Auto-aim: anything within this cone of where the child is looking, or this close at all. */
export const AIM_COS = Math.cos((55 * Math.PI) / 180);
export const AIM_CLOSE = 7;
/** How far past a spell's own range the aim will still reach for something. */
export const AIM_SLACK = 4;

/** Troubles stay out of the village's flat disc: past it, a chasing blob stops at the fence. */
export const VILLAGE_KEEP = 30;
/** The first time a trouble is this close, the child is told what it is and which key casts. */
export const SIGHT_R = 26;

/* ------------------------------------------------------------------- homes */

export type TroubleHome = {
  id: string;
  kind: TroubleKind;
  x: number;
  z: number;
  /** The named place it haunts, or null for one on the village outskirts. */
  place: string | null;
  placeName: string | null;
  /**
   * A home the world no longer plans (a building finished and the outskirts shrank), kept only
   * so the trouble standing on it can stay where it is until the child is away (`rehomeField`).
   * It never wakes again.
   */
  leaving?: boolean;
};

export type HomeLandmark = {
  id: string;
  name: string;
  kind: string;
  position: { x: number; z: number };
  radius: number;
};

/** Which trouble haunts which kind of place. The five authored places are named one by one. */
export const PLACE_KIND: Readonly<Record<string, TroubleKind>> = {
  summit: "fog",
  mire: "fog",
  tarn: "fog",
  outcrop: "cursed-stone",
  deepwood: "shadow-blob",
  cove: "shadow-blob",
  ringstones: "cursed-stone",
  highcairn: "cursed-stone",
  longwater: "fog",
  farfurrow: "shadow-blob",
  appleway: "shadow-blob",
};

export function kindForPlace(l: Pick<HomeLandmark, "id" | "kind">): TroubleKind {
  return PLACE_KIND[l.id] ?? PLACE_KIND[l.kind] ?? "fog";
}

export type HomePlanInput = {
  seed: number;
  landmarks: readonly HomeLandmark[];
  /** Unfinished sites in the village: the outskirts get one trouble for each, up to three. */
  unfinished: number;
  /** Where the child starts; nothing is placed within `SPAWN_CLEAR` of it. */
  spawn: { x: number; z: number };
  /**
   * The world's say: true when a trouble of radius `r` may stand at (x, z) — dry ground, off
   * every road and track, outside every building and solid. The scene builds this from the
   * real terrain and colliders; tests hand in a plain function.
   */
  free: (x: number, z: number, r: number) => boolean;
  /**
   * A looser say, for a place `free` finds no room at (an orchard, a stone circle): tried only
   * after `free` has failed everywhere, so a place keeps its trouble without the open-ground
   * preference ever being given up where it can be met.
   */
  fallback?: (x: number, z: number, r: number) => boolean;
};

export const SPAWN_CLEAR = 22;
/** The outskirts ring: from just past the village's keep-out to a short walk beyond. */
export const RIM_NEAR = VILLAGE_KEEP + 7;
export const RIM_FAR = VILLAGE_KEEP + 17;

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Every home, once, in a fixed order: the outskirts first, then the places in the world's own
 * order. Same seed and same world, same homes, always.
 */
export function planHomes(input: HomePlanInput): TroubleHome[] {
  const homes: TroubleHome[] = [];
  const rimCount = Math.max(0, Math.min(3, input.unfinished));
  const rng = seededRng((input.seed ^ 0x7ab1e5) >>> 0);
  const base = rng() * Math.PI * 2;
  for (let i = 0; i < rimCount; i++) {
    const kind = TROUBLE_KIND_ORDER[i % TROUBLE_KIND_ORDER.length];
    const r = BODY_RADIUS[kind];
    for (let attempt = 0; attempt < 80; attempt++) {
      // Spread round the village first; if its third of the ring is all wood or water, anywhere
      // on the ring that is open and not on top of another outskirts trouble.
      const spread = attempt < 30 ? 1.4 : Math.PI * 2;
      const angle = base + (i * Math.PI * 2) / 3 + (rng() - 0.5) * spread;
      const d = RIM_NEAR + rng() * (RIM_FAR - RIM_NEAR);
      const x = Math.sin(angle) * d;
      const z = Math.cos(angle) * d;
      if (Math.hypot(x - input.spawn.x, z - input.spawn.z) < SPAWN_CLEAR) continue;
      if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < 25)) continue;
      if (!input.free(x, z, r + 1)) continue;
      homes.push({ id: `rim-${i}`, kind, x, z, place: null, placeName: null });
      break;
    }
  }
  for (const l of input.landmarks) {
    const kind = kindForPlace(l);
    const r = BODY_RADIUS[kind];
    const lr = seededRng((input.seed + hashId(l.id)) >>> 0);
    const tries = input.fallback ? 72 : 48;
    for (let attempt = 0; attempt < tries; attempt++) {
      // Out from the middle, where the place's own stones and cairns stand, but inside the
      // ring its name covers, so arriving at the place is arriving at its trouble.
      const reach = attempt < 24 ? 0.35 + lr() * 0.55 : 0.6 + lr() * 1.1;
      const angle = lr() * Math.PI * 2;
      const x = l.position.x + Math.sin(angle) * l.radius * reach;
      const z = l.position.z + Math.cos(angle) * l.radius * reach;
      if (Math.hypot(x, z) < VILLAGE_KEEP + r) continue;
      if (Math.hypot(x - input.spawn.x, z - input.spawn.z) < SPAWN_CLEAR) continue;
      // Two troubles on one spot read as one, and the second is a surprise nobody asked for.
      if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < 15)) continue;
      const ok = attempt < 48 ? input.free(x, z, r + 0.5) : input.fallback!(x, z, r + 0.5);
      if (!ok) continue;
      homes.push({ id: `place-${l.id}`, kind, x, z, place: l.id, placeName: l.name });
      break;
    }
  }
  return homes;
}

/* ------------------------------------------------------------------- field */

export type Trouble3 = {
  /** The slot holds a trouble, awake or playing its clearing. */
  live: boolean;
  dying: boolean;
  diedAt: number;
  /** Bumped on every spawn, so a spell locked onto a slot knows when it was reused. */
  serial: number;
  home: number;
  kind: TroubleKind;
  x: number;
  y: number;
  z: number;
  /** Where it was put, and wanders round. */
  ox: number;
  oz: number;
  /** Which way it is drifting, as an angle (atan2(dx, dz)). */
  heading: number;
  hitsLeft: number;
  maxHits: number;
  statuses: TroubleStatus[];
  spawnedAt: number;
  retreatUntil: number;
  /** Simulation times for the renderer: the last hit (a flash), the last bounce (a hop). */
  hitAt: number;
  recoilUntil: number;
  recoilX: number;
  recoilZ: number;
  /** Seconds of motion, for the bob and the breathing: frozen when bound, slow when chilled. */
  phase: number;
};

export type TroubleEventKind = "cleared" | "hit" | "bounced" | "shielded" | "sighted";

export type TroubleEvent = {
  kind: TroubleEventKind;
  trouble: TroubleKind;
  home: number;
  x: number;
  z: number;
  /** Troubles cleared this visit, counting this one. */
  count: number;
};

export const EVENT_CAP = 8;

export type TroubleField = {
  homes: readonly TroubleHome[];
  /** Per home: the simulation time it was last cleared, or -Infinity. */
  clearedAt: number[];
  /** Per home: the pool index of its trouble, or -1. */
  slotOf: number[];
  troubles: Trouble3[];
  now: number;
  serial: number;
  tally: ClearTally;
  /** A bump the child is being pushed back by, for the caller to apply to the hero. */
  knock: { until: number; dx: number; dz: number };
  shieldUntil: number;
  dazzledUntil: number;
  /** Mana a `mended` spell earned back this frame, for the caller to hand the caster. */
  refund: number;
  sighted: boolean;
  events: TroubleEvent[];
  nEvents: number;
  /** Scratch for the mover. */
  pt: { x: number; z: number };
};

export function makeField(homes: readonly TroubleHome[]): TroubleField {
  const troubles: Trouble3[] = [];
  for (let i = 0; i < TROUBLE_POOL; i++) {
    troubles.push({
      live: false, dying: false, diedAt: 0, serial: 0, home: -1, kind: "fog",
      x: 0, y: 0, z: 0, ox: 0, oz: 0, heading: 0, hitsLeft: 0, maxHits: 1,
      statuses: [], spawnedAt: 0, retreatUntil: 0, hitAt: -1e9, recoilUntil: 0, recoilX: 0, recoilZ: 0, phase: 0,
    });
  }
  const events: TroubleEvent[] = [];
  for (let i = 0; i < EVENT_CAP; i++) events.push({ kind: "hit", trouble: "fog", home: -1, x: 0, z: 0, count: 0 });
  return {
    homes,
    clearedAt: homes.map(() => Number.NEGATIVE_INFINITY),
    slotOf: homes.map(() => -1),
    troubles,
    now: 0,
    serial: 0,
    tally: startTally(),
    knock: { until: 0, dx: 0, dz: 0 },
    shieldUntil: 0,
    dazzledUntil: 0,
    refund: 0,
    sighted: false,
    events,
    nEvents: 0,
    pt: { x: 0, z: 0 },
  };
}

/**
 * The world re-planned the homes mid-visit (a building finished, so the outskirts lost a slot and
 * the land changed): take the new plan WITHOUT touching anything that is out.
 *
 * Before this, a new plan meant a new field, and every awake trouble blinked out at once — a fog
 * bank the child was aiming at simply vanished, and the day's tally went back to nought. Now:
 *
 *   - a home the new plan still has (same id) keeps its trouble exactly where it stands, and its
 *     cleared time, so a trouble cleared a moment ago does not pop straight back;
 *   - a home the new plan dropped is kept as `leaving`, still holding its trouble, until that
 *     trouble sleeps (the child walked away) or is cleared — and then it is gone for good;
 *   - a moved home's trouble stays put too; the next one to wake there wakes at the new spot.
 *
 * Allocates, once per re-plan, which happens when a building finishes: not per frame.
 */
export function rehomeField(f: TroubleField, homes: readonly TroubleHome[]): void {
  const next: TroubleHome[] = homes.slice();
  const index = new Map<string, number>();
  for (let i = 0; i < next.length; i++) index.set(next[i].id, i);
  const clearedAt = next.map((h) => {
    const old = f.homes.findIndex((o) => o.id === h.id && !o.leaving);
    return old >= 0 ? f.clearedAt[old] : Number.NEGATIVE_INFINITY;
  });
  const slotOf = next.map(() => -1);
  for (let i = 0; i < f.troubles.length; i++) {
    const t = f.troubles[i];
    if (!t.live || t.home < 0) continue;
    const old = f.homes[t.home];
    let at = old.leaving ? undefined : index.get(old.id);
    if (at === undefined) {
      next.push({ ...old, leaving: true });
      clearedAt.push(f.clearedAt[t.home]);
      slotOf.push(-1);
      at = next.length - 1;
    }
    t.home = at;
    slotOf[at] = i;
  }
  f.homes = next;
  f.clearedAt = clearedAt;
  f.slotOf = slotOf;
}

function pushEvent(f: TroubleField, kind: TroubleEventKind, t: Trouble3): void {
  if (f.nEvents >= EVENT_CAP) return;
  const e = f.events[f.nEvents++];
  e.kind = kind;
  e.trouble = t.kind;
  e.home = t.home;
  e.x = t.x;
  e.z = t.z;
  e.count = f.tally.session;
}

/**
 * One frame of motion for a trouble, against the real world: the scene's mover runs the
 * terrain, the water and the solids (`shoreMove`, `slideMove`); tests hand in open ground.
 * Writes the reachable point into `out`.
 */
export type Mover = (out: { x: number; z: number }, fromX: number, fromZ: number, toX: number, toZ: number, kind: TroubleKind) => void;

export type FieldInput = {
  /** Seconds, already clamped by the caller. */
  dt: number;
  heroX: number;
  heroZ: number;
  /** Reduced motion or low stimulus: three troubles, no chasing, no drifting fog. */
  calm: boolean;
  move: Mover;
  /** The world's walls, trunks and stones, for a `bounce` bolt to bounce off. Optional in tests. */
  solids?: readonly Collider[];
};

/** 1 when free, 0 when bound: the flat Realm's `speedFactor`, as-is. */
export function troubleSpeed(t: Trouble3, now: number, calm: boolean): number {
  const base = TROUBLE_SPEED[t.kind] * SCALE_3D * speedFactor(t.statuses, now);
  return calm ? base * 0.5 : base;
}

/** The strongest status a trouble is under right now, for the renderer's ring, or null. */
export function statusShown(t: Trouble3, now: number): StatusKind | null {
  let best: StatusKind | null = null;
  for (const s of t.statuses) {
    if (s.until <= now) continue;
    if (s.kind === "bound") return "bound";
    if (s.kind === "chilled" || best === null) best = s.kind;
  }
  return best;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** A cheap deterministic wobble in -1..1, from a serial and a time. */
function wobble(serial: number, t: number): number {
  return Math.sin(t * 0.00071 + serial * 2.39) * 0.6 + Math.sin(t * 0.00023 + serial * 5.1) * 0.4;
}

function spawnAt(f: TroubleField, slot: number, home: number): void {
  const h = f.homes[home];
  const t = f.troubles[slot];
  f.serial += 1;
  t.live = true;
  t.dying = false;
  t.diedAt = 0;
  t.serial = f.serial;
  t.home = home;
  t.kind = h.kind;
  t.x = t.ox = h.x;
  t.z = t.oz = h.z;
  t.y = 0;
  t.heading = ((hashId(h.id) % 628) / 100) + f.serial;
  t.maxHits = TROUBLE_HITS[h.kind];
  t.hitsLeft = t.maxHits;
  for (const s of t.statuses) s.until = 0;
  t.spawnedAt = f.now;
  t.retreatUntil = 0;
  t.hitAt = -1e9;
  t.recoilUntil = 0;
  t.phase = (f.serial * 1.7) % 6.28;
  f.slotOf[home] = slot;
}

/** Awake troubles that are not on their way out. */
export function awakeCount(f: TroubleField): number {
  let n = 0;
  for (const t of f.troubles) if (t.live && !t.dying) n++;
  return n;
}

/** True when this home may have a trouble now, with the child standing at (hx, hz). */
export function homeReady(f: TroubleField, home: number, hx: number, hz: number): boolean {
  if (f.slotOf[home] >= 0) return false;
  const h = f.homes[home];
  if (h.leaving) return false;
  const d = dist(h.x, h.z, hx, hz);
  if (d > WAKE_R) return false;
  const cleared = f.clearedAt[home];
  if (cleared === Number.NEGATIVE_INFINITY) return true;
  return f.now - cleared >= RESPAWN_MS && d > NO_POP_R;
}

function wake(f: TroubleField, hx: number, hz: number, cap: number): void {
  let awake = awakeCount(f);
  while (awake < cap) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let h = 0; h < f.homes.length; h++) {
      if (!homeReady(f, h, hx, hz)) continue;
      const d = dist(f.homes[h].x, f.homes[h].z, hx, hz);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best < 0) return;
    let slot = -1;
    for (let i = 0; i < f.troubles.length; i++) {
      if (!f.troubles[i].live) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;
    spawnAt(f, slot, best);
    awake++;
  }
}

/** Retires one trouble from its slot, leaving its home free to wake again. */
function retire(f: TroubleField, i: number): void {
  const t = f.troubles[i];
  t.live = false;
  t.dying = false;
  if (t.home >= 0 && f.slotOf[t.home] === i) f.slotOf[t.home] = -1;
}

/** True when (x, z) is inside a standing wall, grown by `r`. Walls block troubles, never the child. */
export function insideSlab(pool: readonly FxSlot[], x: number, z: number, r: number): boolean {
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live || s.kind !== "slab") continue;
    // Along the wall is perpendicular to its heading; across it is the heading.
    const rx = x - s.x;
    const rz = z - s.z;
    const across = rx * s.dx + rz * s.dz;
    const along = rx * -s.dz + rz * s.dx;
    if (Math.abs(across) < SLAB_HALF + r && Math.abs(along) < s.size / 2 + r) return true;
  }
  return false;
}

function stepMotion(f: TroubleField, t: Trouble3, pool: readonly FxSlot[], input: FieldInput, dtMs: number): void {
  const dt = dtMs / 1000;
  const now = f.now;
  const r = BODY_RADIUS[t.kind];
  const speed = troubleSpeed(t, now, input.calm);
  // Bound holds everything still, including the breathing; chilled slows it.
  t.phase += dt * speedFactor(t.statuses, now);

  // A blob that just bounced off the child hops back along its recoil.
  if (now < t.recoilUntil) {
    const out = f.pt;
    input.move(out, t.x, t.z, t.x + t.recoilX * RECOIL_SPEED * dt, t.z + t.recoilZ * RECOIL_SPEED * dt, t.kind);
    if (!insideSlab(pool, out.x, out.z, r) && !intoVillage(t.x, t.z, out.x, out.z)) {
      t.x = out.x;
      t.z = out.z;
    }
    return;
  }
  if (speed <= 0) return;

  const toHero = dist(t.x, t.z, input.heroX, input.heroZ);
  let dx: number;
  let dz: number;
  const chasing =
    t.kind === "shadow-blob" &&
    !input.calm &&
    now >= t.retreatUntil &&
    toHero <= SENSE_3D &&
    dist(t.ox, t.oz, input.heroX, input.heroZ) <= LEASH_3D;
  if (chasing) {
    dx = (input.heroX - t.x) / (toHero || 1);
    dz = (input.heroZ - t.z) / (toHero || 1);
    t.heading = Math.atan2(dx, dz);
  } else {
    // The flat Realm's reduced-motion rule: fog holds still for a calm child.
    if (t.kind === "fog" && input.calm) return;
    const home = dist(t.x, t.z, t.ox, t.oz);
    if (home > WANDER_3D) t.heading = Math.atan2(t.ox - t.x, t.oz - t.z);
    else t.heading += wobble(t.serial, now) * dt * 1.2;
    dx = Math.sin(t.heading);
    dz = Math.cos(t.heading);
  }
  const step = speed * dt;
  const out = f.pt;
  input.move(out, t.x, t.z, t.x + dx * step, t.z + dz * step, t.kind);
  const blocked = insideSlab(pool, out.x, out.z, r) || intoVillage(t.x, t.z, out.x, out.z);
  if (blocked) {
    // Refused: turn away and try again next frame. A chaser just waits at the wall.
    if (!chasing) t.heading += Math.PI * 0.6;
    return;
  }
  const moved = dist(t.x, t.z, out.x, out.z);
  if (!chasing && moved < step * 0.3) t.heading += Math.PI * 0.5;
  t.x = out.x;
  t.z = out.z;
}

/** True when a step from (ax, az) to (bx, bz) goes further into the village than it started. */
function intoVillage(ax: number, az: number, bx: number, bz: number): boolean {
  const b = bx * bx + bz * bz;
  return b < VILLAGE_KEEP * VILLAGE_KEEP && b < ax * ax + az * az;
}

/** The flat Realm's blob contact rule, at scale: bump the child back unless shielded, then retreat. */
function contact(f: TroubleField, t: Trouble3, input: FieldInput): void {
  if (t.kind !== "shadow-blob" || f.now < t.retreatUntil) return;
  const d = dist(t.x, t.z, input.heroX, input.heroZ);
  if (d > BODY_RADIUS[t.kind] + CONTACT) return;
  let ax = t.x - input.heroX;
  let az = t.z - input.heroZ;
  if (d < 0.01) {
    ax = Math.sin(t.heading);
    az = Math.cos(t.heading);
  } else {
    ax /= d;
    az /= d;
  }
  t.retreatUntil = f.now + RETREAT_MS;
  t.recoilUntil = f.now + RECOIL_MS;
  t.recoilX = ax;
  t.recoilZ = az;
  t.heading = Math.atan2(ax, az);
  if (f.now < f.shieldUntil) {
    pushEvent(f, "shielded", t);
    return;
  }
  // Dazzled already: the flat Realm's rule is one lost focus at a time, so no second shove.
  if (f.now < f.dazzledUntil) return;
  f.dazzledUntil = f.now + DAZZLE_MS;
  f.knock.until = f.now + KNOCK_MS;
  f.knock.dx = -ax;
  f.knock.dz = -az;
  pushEvent(f, "bounced", t);
}

/* -------------------------------------------------------------------- hits */

function isShield(spell: SpellDefinition): boolean {
  return spell.parts.formId === "shield";
}

function hasStatus(spell: SpellDefinition, kind: StatusKind): boolean {
  for (const s of spell.statuses) if (s.kind === kind) return true;
  return false;
}

/**
 * One hit, the flat Realm's way: a point off, the spell's timed statuses left behind, and at
 * zero the trouble is cleared. Also the `mended` refund, handed to the caller.
 */
export function hitTrouble3(f: TroubleField, index: number, spell: SpellDefinition): boolean {
  const t = f.troubles[index];
  if (!t.live || t.dying) return false;
  t.hitsLeft -= 1;
  t.hitAt = f.now;
  addHitStatuses(t.statuses, spell, f.now);
  if (hasStatus(spell, "mended")) f.refund += spell.manaCost;
  if (t.hitsLeft > 0) {
    pushEvent(f, "hit", t);
    return false;
  }
  t.dying = true;
  t.diedAt = f.now;
  // A clear gives back one Ember Bolt's worth: landing shots keeps a fight going.
  f.refund += MANA_PER_CLEAR;
  f.clearedAt[t.home] = f.now;
  f.tally.session += 1;
  f.tally.byKind[t.kind] += 1;
  pushEvent(f, "cleared", t);
  return true;
}

function segDist(px: number, pz: number, ax: number, az: number, dx: number, dz: number, len: number): number {
  const u = (px - ax) * dx + (pz - az) * dz;
  const c = u < 0 ? 0 : u > len ? len : u;
  return dist(px, pz, ax + dx * c, az + dz * c);
}

/** Every live, armed effect against every trouble. Fixed loops, no allocation. */
export function hitTest(f: TroubleField, pool: FxSlot[], input: FieldInput): void {
  const troubles = f.troubles;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live || !s.armed || s.spell === null) continue;
    const spell = s.spell;
    switch (s.kind) {
      case "bolt": {
        if (s.stopped) break;
        // `ticks` on a bolt is "has bounced": a bounce bolt bounces once, as in the flat Realm.
        const bouncy = s.ticks === 0 && hasStatus(spell, "bounce");
        if (bouncy && input.solids && bounceOffSolid(pool, s, input.solids)) break;
        const grow = hasStatus(spell, "grown") ? 1 + Math.min(1, s.travelled / Math.max(1, s.range)) : 1;
        const r = BOLT_RADIUS * grow;
        let best = -1;
        let bestD = Number.POSITIVE_INFINITY;
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying || s.hitMask & (1 << k)) continue;
          const d = dist(s.x, s.z, t.x, t.z);
          if (d <= r + BODY_RADIUS[t.kind] && d < bestD) {
            bestD = d;
            best = k;
          }
        }
        if (best >= 0) {
          const t = troubles[best];
          s.hitMask |= 1 << best;
          hitTrouble3(f, best, spell);
          // A bounce bolt that has not bounced yet goes on to the next trouble in reach.
          if (bouncy && ricochet(f, pool, s, best)) break;
          // Stop at the trouble's front, so the landing ring bursts ON it.
          endBolt(s, t.x, t.z);
        }
        break;
      }
      case "sprite": {
        // The flat Realm's summon: a little follower that looks for a trouble in reach every
        // `SUMMON_SHOT_MS` and throws a mini-bolt at it. A look that finds nothing is not a shot
        // spent — it fires the moment something comes into reach.
        if (s.t < SPRITE_FIRST_S + s.ticks * SPRITE_SHOT_S) break;
        let best = -1;
        let bestD = SPRITE_SENSE_3D;
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying) continue;
          const d = dist(s.x, s.z, t.x, t.z);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        if (best < 0) break;
        s.ticks += 1;
        const t = troubles[best];
        const d = bestD > 0.01 ? bestD : 1;
        spawnFx(pool, {
          kind: "bolt",
          color: s.color,
          x: s.x,
          y: s.y,
          z: s.z,
          dx: (t.x - s.x) / d,
          dz: (t.z - s.z) / d,
          speed: MINI_SPEED,
          range: MINI_RANGE,
          size: 1.8,
          next: "ring",
          spell: miniBolt(spell),
          armed: true,
          target: best,
          targetSerial: t.serial,
          tx: t.x,
          tz: t.z,
        });
        break;
      }
      case "ring": {
        const radius = s.size * fxScale(s);
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying || s.hitMask & (1 << k)) continue;
          if (dist(s.x, s.z, t.x, t.z) <= radius + BODY_RADIUS[t.kind]) {
            s.hitMask |= 1 << k;
            hitTrouble3(f, k, spell);
          }
        }
        break;
      }
      case "beam": {
        if (s.ticks >= BEAM_TICKS || s.t < s.ticks * BEAM_TICK_S) break;
        s.ticks += 1;
        let best = -1;
        let bestD = Number.POSITIVE_INFINITY;
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying) continue;
          if (segDist(t.x, t.z, s.x, s.z, s.dx, s.dz, s.size) > BEAM_HALF + BODY_RADIUS[t.kind]) continue;
          const d = dist(s.x, s.z, t.x, t.z);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        if (best >= 0) hitTrouble3(f, best, spell);
        break;
      }
      case "slab": {
        // The wall hits what it comes down on, once, while it is rising, and shoves it out to
        // the far side; after that it only blocks (see `insideSlab`).
        if (fxPhase(s) > 0.25) break;
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying || s.hitMask & (1 << k)) continue;
          const r = BODY_RADIUS[t.kind];
          if (!insideOneSlab(s, t.x, t.z, r)) continue;
          s.hitMask |= 1 << k;
          const across = (t.x - s.x) * s.dx + (t.z - s.z) * s.dz;
          const push = SLAB_HALF + r + 0.3 - across;
          if (push > 0) {
            const out = f.pt;
            input.move(out, t.x, t.z, t.x + s.dx * push, t.z + s.dz * push, t.kind);
            t.x = out.x;
            t.z = out.z;
          }
          hitTrouble3(f, k, spell);
        }
        break;
      }
      case "aura": {
        const shield = isShield(spell);
        if (shield && s.ticks === 0) f.shieldUntil = Math.max(f.shieldUntil, f.now + SHIELD_MS);
        // A shield pulses once as it goes up; an aura or a sprite burns every half second.
        if (shield ? s.ticks >= 1 : s.t < s.ticks * AURA_TICK_S) break;
        s.ticks += 1;
        const radius = s.size * fxScale(s);
        for (let k = 0; k < troubles.length; k++) {
          const t = troubles[k];
          if (!t.live || t.dying) continue;
          if (dist(s.x, s.z, t.x, t.z) <= radius + BODY_RADIUS[t.kind]) hitTrouble3(f, k, spell);
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------- bounce and sprite */

/** How far a bounce bolt looks, from where it struck, for the next one: about a bolt's own range. */
export const BOUNCE_REACH = 14;
/** A Sprite's first look for a mark, then one every `SUMMON_SHOT_MS`, as in the flat Realm. */
export const SPRITE_FIRST_S = 0.6;
export const SPRITE_SHOT_S = SUMMON_SHOT_MS / 1000;
/** The flat Realm's summon sense, at the 3D scale: a Sprite only throws at what it can reach. */
export const SPRITE_SENSE_3D = SUMMON_SENSE * SCALE_3D;
/** A mini-bolt: a little slower than a thrown bolt, and just long enough to reach its mark. */
export const MINI_SPEED = 12;
export const MINI_RANGE = SPRITE_SENSE_3D + 3;

const MINI = new WeakMap<SpellDefinition, SpellDefinition>();

/**
 * The flat Realm's mini-bolt: the Sprite's own element, shaped as a projectile, with none of the
 * spell's statuses (`effects.ts`). Made once per spell, not per shot.
 */
export function miniBolt(spell: SpellDefinition): SpellDefinition {
  let m = MINI.get(spell);
  if (!m) {
    m = { ...spell, shape: "projectile", speed: MINI_SPEED, range: MINI_RANGE, statuses: [], manaCost: 0 };
    MINI.set(spell, m);
  }
  return m;
}

/**
 * The flat Realm's bounce, against the 3D world: a bolt that runs into a wall, a trunk or a
 * standing stone comes off it — reflected off the face it came through — instead of passing
 * through it, once. It lets go of what it was aimed at (homing would only turn it back into the
 * wall) and a little ring marks the spot, so a child sees it WAS a bounce.
 */
function bounceOffSolid(pool: FxSlot[], s: FxSlot, solids: readonly Collider[]): boolean {
  for (let i = 0; i < solids.length; i++) {
    const c = solids[i];
    if (s.y < c.base || s.y > c.top) continue;
    const rx = s.x - c.x;
    const rz = s.z - c.z;
    if (c.round) {
      const reach = c.hw + 0.3;
      const d2 = rx * rx + rz * rz;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = rx / d;
      const nz = rz / d;
      const dot = s.dx * nx + s.dz * nz;
      if (dot >= 0) continue; // already leaving it
      s.dx -= 2 * dot * nx;
      s.dz -= 2 * dot * nz;
    } else {
      const penX = c.hw + 0.3 - Math.abs(rx);
      const penZ = c.hd + 0.3 - Math.abs(rz);
      if (penX <= 0 || penZ <= 0) continue;
      // The face it came through is the one with the shallower push.
      if (penX < penZ) s.dx = -s.dx;
      else s.dz = -s.dz;
    }
    s.ticks = 1;
    lockFx(s, -1, 0, s.tx, s.tz);
    s.x += s.dx * 0.35;
    s.z += s.dz * 0.35;
    spawnFx(pool, { kind: "ring", color: s.color, x: s.x, y: s.y - 0.6, z: s.z, dx: s.dx, dz: s.dz, size: 1.3, life: 0.35 });
    return true;
  }
  return false;
}

/**
 * "Bounces onward": the bolt that just hit `from` turns for the nearest other trouble within
 * `BOUNCE_REACH`, locked onto it, with a fresh range. False when there is nothing to go to.
 */
function ricochet(f: TroubleField, pool: FxSlot[], s: FxSlot, from: number): boolean {
  let best = -1;
  let bestD = BOUNCE_REACH;
  for (let k = 0; k < f.troubles.length; k++) {
    const t = f.troubles[k];
    if (k === from || !t.live || t.dying || s.hitMask & (1 << k)) continue;
    const d = dist(s.x, s.z, t.x, t.z);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best < 0) return false;
  const hit = f.troubles[from];
  const t = f.troubles[best];
  const d = bestD > 0.01 ? bestD : 1;
  s.ticks = 1;
  s.dx = (t.x - s.x) / d;
  s.dz = (t.z - s.z) / d;
  s.t = 0;
  s.travelled = 0;
  s.range = BOUNCE_REACH + 2;
  lockFx(s, best, t.serial, t.x, t.z);
  spawnFx(pool, { kind: "ring", color: s.color, x: hit.x, y: s.y - 1.2, z: hit.z, dx: s.dx, dz: s.dz, size: 1.8, life: 0.4 });
  return true;
}

function insideOneSlab(s: FxSlot, x: number, z: number, r: number): boolean {
  const rx = x - s.x;
  const rz = z - s.z;
  const across = rx * s.dx + rz * s.dz;
  const along = rx * -s.dz + rz * s.dx;
  return Math.abs(across) < SLAB_HALF + r && Math.abs(along) < s.size / 2 + r;
}

/* -------------------------------------------------------------------- aim */

/**
 * The trouble a cast should go to, or -1: the one nearest the middle of the screen and nearest
 * the child, within `reach`. Anything inside a 55° cone of where the child is looking counts,
 * and so does anything within `AIM_CLOSE` whichever way it is — a blob at your elbow is the one
 * you meant. Scored by distance, doubled at the cone's edge, so a trouble dead ahead at twelve
 * beats one off to the side at eight.
 */
export function pickAim(f: TroubleField, hx: number, hz: number, dx: number, dz: number, reach: number): number {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let k = 0; k < f.troubles.length; k++) {
    const t = f.troubles[k];
    if (!t.live || t.dying) continue;
    const d = dist(hx, hz, t.x, t.z);
    if (d > reach) continue;
    const cos = d < 0.01 ? 1 : ((t.x - hx) * dx + (t.z - hz) * dz) / d;
    if (cos < AIM_COS && d > AIM_CLOSE) continue;
    const score = d * (2 - cos);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/**
 * Locks every charge that has just begun onto what it should go to, and keeps every locked
 * effect's target point current. Returns the facing (atan2(dx, dz)) the child should turn to
 * for the newest lock this frame, or NaN.
 */
export function trackAim(f: TroubleField, pool: FxSlot[]): number {
  let face = Number.NaN;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live) continue;
    if (s.kind === "charge" && !s.aimed) {
      s.aimed = true;
      const k = pickAim(f, s.x, s.z, s.dx, s.dz, s.range + AIM_SLACK);
      if (k >= 0) {
        const t = f.troubles[k];
        lockFx(s, k, t.serial, t.x, t.z);
        face = Math.atan2(t.x - s.x, t.z - s.z);
      }
      continue;
    }
    if (s.target < 0) continue;
    const t = f.troubles[s.target];
    if (!t.live || t.dying || t.serial !== s.targetSerial) {
      lockFx(s, -1, 0, s.tx, s.tz);
      continue;
    }
    s.tx = t.x;
    s.tz = t.z;
  }
  return face;
}

/* ------------------------------------------------------------------- frame */

/**
 * One frame of the whole field: clock, sleep and wake, motion, hits, bumps. The caller skips it
 * entirely while the game is paused, so nothing moves or respawns under a menu.
 */
export function stepField(f: TroubleField, pool: FxSlot[], input: FieldInput): void {
  const dtMs = input.dt * 1000;
  f.now += dtMs;
  f.nEvents = 0;
  f.refund = 0;
  const hx = input.heroX;
  const hz = input.heroZ;
  for (let i = 0; i < f.troubles.length; i++) {
    const t = f.troubles[i];
    if (!t.live) continue;
    if (t.dying) {
      if (f.now - t.diedAt >= DYING_MS) retire(f, i);
      continue;
    }
    const h = f.homes[t.home];
    if (dist(h.x, h.z, hx, hz) > SLEEP_R) retire(f, i);
  }
  wake(f, hx, hz, input.calm ? LOW_STIMULUS_MAX : MAX_TROUBLES);
  for (let i = 0; i < f.troubles.length; i++) {
    const t = f.troubles[i];
    if (!t.live || t.dying) continue;
    stepMotion(f, t, pool, input, dtMs);
    contact(f, t, input);
    if (!f.sighted && dist(t.x, t.z, hx, hz) <= SIGHT_R) {
      f.sighted = true;
      pushEvent(f, "sighted", t);
    }
  }
  hitTest(f, pool, input);
}

/* ------------------------------------------------------------------- words */

/** What a trouble is called, in the grown-up's chosen tone. */
export function troubleName(kind: TroubleKind, skin: TroubleSkin): string {
  return skin === "monsters" ? TROUBLE_COPY[kind].monstersName : TROUBLE_COPY[kind].gentleName;
}

/** A bump, in the chosen tone. Never a word about hurting: the child lost a step, nothing else. */
export const BOUNCE_COPY: Readonly<Record<TroubleSkin, string>> = {
  gentle: "The shadow nudged you back.",
  monsters: "Boing! The blob bounced you back!",
};
export const SHIELDED_COPY = "Your shield held it off!";

/** The first trouble of a visit, named, so a child knows the thing on the hill is for casting at. */
export const SIGHT_COPY: Readonly<Record<TroubleKind, Record<TroubleSkin, string>>> = {
  fog: { gentle: "Fog is drifting close!", monsters: "A mist-wisp is near!" },
  "cursed-stone": { gentle: "A cursed stone is near!", monsters: "A gargoyle is near!" },
  "shadow-blob": { gentle: "A shadow is near!", monsters: "A blob is near!" },
};

/** What a clear earned, as the bounty predicted it (`lib/realm/spells/bounty.ts`). */
export type ClearReward = { paid: boolean; capped: boolean; already: boolean; clearsToday: number };

/** The gold words beside a clear that earned a minute. */
export const REWARD_COPY = "+1 minute of Realm time!";
/** Once a visit, when the day's allowance is spent. True, and never a scolding. */
export const CAPPED_COPY = "You've had all today's minutes from clearing troubles.";
/** A home that already paid today: said so, so a child is not left wondering where the minute went. */
export const ALREADY_COPY = "This one already gave you a minute today.";

/**
 * The words for an event, as a title and a smaller line under it, and for a clear that paid, the
 * gold reward. Null for events that say nothing. `reward` is the bounty's say, when there is one:
 * its day's tally replaces the visit's, since clears are kept now.
 */
export function troubleNotice(
  e: Pick<TroubleEvent, "kind" | "trouble" | "count">,
  skin: TroubleSkin,
  placeName: string | null,
  castKey: number | null,
  reward: ClearReward | null = null,
): { title: string; line: string; reward?: string } | null {
  switch (e.kind) {
    case "cleared": {
      const title = skin === "monsters" ? TROUBLE_COPY[e.trouble].monsters : TROUBLE_COPY[e.trouble].gentle;
      const where = placeName ? `${placeName} is clear.` : "The fields are clear.";
      const count = reward ? reward.clearsToday : e.count;
      if (reward?.paid) return { title, line: `${where} ${count} cleared today.`, reward: REWARD_COPY };
      if (reward?.capped) return { title, line: `${where} ${CAPPED_COPY}` };
      if (reward?.already) return { title, line: `${where} ${ALREADY_COPY}` };
      return { title, line: `${where} ${count} cleared today.` };
    }
    case "bounced":
      return { title: BOUNCE_COPY[skin], line: "Cast at it, or step round it." };
    case "shielded":
      return { title: SHIELDED_COPY, line: "Nothing gets past a shield." };
    case "sighted":
      return {
        title: SIGHT_COPY[e.trouble][skin],
        line: castKey ? `Press ${castKey} to cast at it.` : "Earn a spell to clear it.",
      };
    case "hit":
      // Only a stone takes two, so a hit that did not clear is the moment a child needs telling
      // it worked and to go again — not left wondering why the stone is still there.
      return skin === "monsters"
        ? { title: "The gargoyle wobbles!", line: "One more spell will topple it." }
        : { title: "The curse is weakening!", line: "One more spell will lift it." };
  }
}
