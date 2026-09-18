/**
 * WHAT A CAST LOOKS LIKE, as numbers.
 *
 * The brief's hardest sentence is "a child who presses 1 and sees nothing will decide the game
 * is broken", so a cast is three events and not one:
 *
 *   1. CHARGE. The instant the key goes down, a knot of the spell's own element colour gathers
 *      at the child's hands and swells. It lasts exactly the spell's `castMs`, which is real
 *      data — Ember Bolt charges for 300ms, a Sprite for 900 — so the big spells feel big.
 *   2. RELEASE. The charge's death spawns the spell's SHAPE, and the shape is the form's own
 *      `shape` field, so a bolt flies, a burst blooms on the ground, a beam snaps out, a wall
 *      stands up and a shield wraps the child. Five reads, from the same catalog the spellbook
 *      is built from.
 *   3. LANDING. A flying bolt's death spawns an expanding ring where it stopped, so the spell
 *      finishes somewhere rather than blinking out. Range and speed are the catalog's, so a
 *      12-unit bolt at 14 units/sec lands just under a second out.
 *
 * The chain is entirely inside `stepFx`, which is the reason this is a module and not a lump
 * of the scene: the whole life of a cast is testable with a flat ground function and no WebGL.
 *
 * ALLOCATION. The pool is built once and every slot is reused for ever. `spawnFx` takes a dead
 * slot or steals the oldest live one; it never grows the array, never constructs a slot, and
 * `stepFx` writes only numbers. That matters because this runs in the same frame loop as the
 * nameplate projection, and a spell that garbage-collects is a spell that stutters.
 */

import type { SpellDefinition, SpellShape } from "@/lib/utils/spell-catalog";

export type FxKind = "charge" | "bolt" | "ring" | "beam" | "slab" | "aura";

export type FxSlot = {
  live: boolean;
  kind: FxKind;
  /** The element's colour, straight from the catalog. */
  color: string;
  /** Seconds since this slot was spawned. */
  t: number;
  life: number;
  x: number;
  y: number;
  z: number;
  /** Unit heading in world x/z; the direction the child was facing when they cast. */
  dx: number;
  dz: number;
  speed: number;
  range: number;
  travelled: number;
  /** Base size: a ring's final radius, a beam's length, a wall's width. */
  size: number;
  /** A charge rides the caster's hands; the driver rewrites x/y/z before each step. */
  follow: boolean;
  /** What this becomes when it dies, or "" for nothing. */
  next: FxKind | "";
  /**
   * Bumped on every spawn. The renderer compares it with what it drew last frame to know a
   * slot has been REUSED and its mesh needs its geometry and colour set again — without it a
   * recycled slot keeps the last spell's shape.
   */
  seq: number;
};

export function makeFxPool(n: number): FxSlot[] {
  const pool: FxSlot[] = new Array(n);
  for (let i = 0; i < n; i++) {
    pool[i] = {
      live: false, kind: "ring", color: "#ffffff", t: 0, life: 1,
      x: 0, y: 0, z: 0, dx: 0, dz: -1, speed: 0, range: 0, travelled: 0,
      size: 1, follow: false, next: "", seq: 0,
    };
  }
  return pool;
}

/** The lifetimes, in seconds. A ring is a blink, a wall stands for a while. */
const LIFE: Record<FxKind, number> = { charge: 0.3, bolt: 1.2, ring: 0.55, beam: 0.5, slab: 2.4, aura: 1.4 };

/** Which shape a form's `shape` releases as. Every `SpellShape` is covered; no default. */
export function releaseKindFor(shape: SpellShape): FxKind {
  switch (shape) {
    case "projectile": return "bolt";
    case "area": return "ring";
    case "beam": return "beam";
    case "barrier": return "slab";
    case "self": return "aura";
    case "summon": return "aura";
  }
}

/**
 * `size` in WORLD UNITS, and what it means depends on the shape, because a unit is a unit but
 * a radius is not a length: a ring's size is the radius it opens to, a beam's is how far it
 * reaches, a wall's is how wide it stands, and a bolt's is the radius of the ring it lands as
 * (the bolt itself is always the same small knot, because a fat projectile reads as a boulder).
 * Kept here rather than in the renderer so the numbers are testable.
 */
export function releaseSizeFor(spell: SpellDefinition): number {
  switch (spell.shape) {
    case "beam": return Math.max(6, spell.range);
    case "area": return Math.max(3, spell.range);
    case "barrier": return 6.5;
    case "self":
    case "summon": return Math.max(2.6, spell.range * 0.6);
    case "projectile": return 3.4;
  }
}

export type FxInit = {
  kind: FxKind;
  color: string;
  x: number; y: number; z: number;
  dx: number; dz: number;
  speed?: number;
  range?: number;
  size?: number;
  life?: number;
  follow?: boolean;
  next?: FxKind | "";
};

/**
 * Takes the first dead slot, or — when everything is busy — the one with the least life left,
 * because a child mashing keys should see their newest spell and not be told the pool is full.
 */
export function spawnFx(pool: FxSlot[], init: FxInit): FxSlot {
  let target = -1;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].live) { target = i; break; }
  }
  if (target < 0) {
    let worst = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      const left = pool[i].life - pool[i].t;
      if (left < best) { best = left; worst = i; }
    }
    target = worst;
  }
  const s = pool[target];
  s.live = true;
  s.kind = init.kind;
  s.color = init.color;
  s.t = 0;
  s.life = init.life ?? LIFE[init.kind];
  s.x = init.x;
  s.y = init.y;
  s.z = init.z;
  s.dx = init.dx;
  s.dz = init.dz;
  s.speed = init.speed ?? 0;
  s.range = init.range ?? 0;
  s.travelled = 0;
  s.size = init.size ?? 1;
  s.follow = init.follow ?? false;
  s.next = init.next ?? "";
  s.seq += 1;
  return s;
}

/**
 * Starts a whole cast: the charge, which knows what it releases into.
 *
 * `hands` is where the knot gathers — the child's chest height, which the driver supplies from
 * the hero's own y, not from a literal, because the hero jumps.
 */
export function beginCastFx(
  pool: FxSlot[],
  spell: SpellDefinition,
  hands: { x: number; y: number; z: number },
  dx: number,
  dz: number,
): FxSlot {
  return spawnFx(pool, {
    kind: "charge",
    color: spell.color,
    x: hands.x, y: hands.y, z: hands.z,
    dx, dz,
    life: Math.max(0.12, spell.castMs / 1000),
    follow: true,
    next: releaseKindFor(spell.shape),
    speed: spell.speed,
    range: spell.range,
    size: releaseSizeFor(spell),
  });
}

/**
 * Moves every still-gathering charge to the caster's hands and re-aims it, which is the whole
 * of what `follow` means. A free function rather than a loop in the driver so the driver never
 * writes into a pool it was handed — the React compiler is right to call that a mutation of
 * something it does not own, and putting it here says who does own it.
 */
export function followCastFx(pool: FxSlot[], x: number, y: number, z: number, dx: number, dz: number): void {
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live || !s.follow) continue;
    s.x = x;
    s.y = y;
    s.z = z;
    s.dx = dx;
    s.dz = dz;
  }
}

/**
 * A death waiting to become the next thing. One per pool slot, allocated with the pool, so a
 * frame in which every spell in the world expires at once still allocates nothing.
 */
export type FxQueue = { n: number; from: FxSlot[] };

export function makeFxQueue(n: number): FxQueue {
  return { n: 0, from: new Array(n) };
}

/**
 * One frame. Advances every live slot, kills the expired ones, and spawns whatever they turn
 * into. `groundY` is the world's own height function so a ring lies on the hill it lands on.
 *
 * Deaths are queued and resolved AFTER the pass rather than during it, which is not fussiness:
 * spawn during the pass and a slot born into a dead index further up the array gets stepped by
 * the same frame that created it, so a bolt released at the end of the pool travels one frame
 * further than the identical bolt released at the start. Two-phase, every cast is the same
 * cast.
 */
export function stepFx(pool: FxSlot[], queue: FxQueue, dt: number, groundY: (x: number, z: number) => number): void {
  queue.n = 0;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live) continue;
    s.t += dt;
    if (s.kind === "bolt") {
      const step = s.speed * dt;
      s.x += s.dx * step;
      s.z += s.dz * step;
      s.travelled += step;
      // Waist height over whatever it is passing over, with a little rise and fall so it
      // reads as thrown rather than slid.
      s.y = groundY(s.x, s.z) + 1.5 + Math.sin((s.travelled / Math.max(1, s.range)) * Math.PI) * 0.7;
      if (s.travelled >= s.range) s.t = s.life;
    }
    if (s.t < s.life) continue;
    s.live = false;
    if (s.next !== "") queue.from[queue.n++] = s;
  }
  for (let q = 0; q < queue.n; q++) {
    const s = queue.from[q];
    const next = s.next as FxKind;
    const flat = next === "aura" || next === "ring" || next === "slab";
    // A wall and a beam stand off in front of the caster rather than inside them.
    const off = next === "slab" ? Math.min(5, s.range) : next === "beam" ? 0.6 : 0;
    const bx = s.x + s.dx * off;
    const bz = s.z + s.dz * off;
    spawnFx(pool, {
      kind: next,
      color: s.color,
      x: bx,
      y: flat ? groundY(bx, bz) : s.y,
      z: bz,
      dx: s.dx,
      dz: s.dz,
      speed: s.speed,
      range: s.range,
      size: s.size,
      // A thrown bolt leaves a ring where it lands; nothing else chains further.
      next: next === "bolt" ? "ring" : "",
    });
  }
}

/* --------------------------------------------------------------- what to draw */

/** 0..1 through the slot's life. */
export function fxPhase(s: FxSlot): number {
  const p = s.t / (s.life > 0 ? s.life : 1);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * How opaque, per kind. A charge swells in, a ring flashes and thins, a beam snaps and dies, a
 * wall holds solid and then goes, an aura pulses twice while it lasts.
 */
export function fxAlpha(s: FxSlot): number {
  const p = fxPhase(s);
  switch (s.kind) {
    case "charge": return 0.35 + 0.65 * p;
    case "bolt": return 1;
    case "ring": return 1 - p;
    case "beam": return 1 - p * p;
    case "slab": return p < 0.75 ? 0.62 : 0.62 * (1 - (p - 0.75) / 0.25);
    case "aura": return (0.55 + 0.45 * Math.sin(p * Math.PI * 4)) * (1 - p * p);
  }
}

/**
 * How big, per kind, as a multiplier on the slot's `size` (the mesh's own geometry is unit
 * sized, so this is the scale the renderer writes straight onto the object).
 */
export function fxScale(s: FxSlot): number {
  const p = fxPhase(s);
  switch (s.kind) {
    // The gather: small and quick at first, then it fills the hands.
    case "charge": return 0.3 + 0.9 * p * p;
    case "bolt": return 1;
    // The landing: from nothing to the full burst radius, easing out so the first frame is
    // the fastest — which is what an impact looks like.
    case "ring": return 0.15 + (1 - (1 - p) * (1 - p)) * 0.95;
    case "beam": return 1;
    // The wall rises out of the ground over the first fifth of its life.
    case "slab": return p < 0.2 ? p / 0.2 : 1;
    case "aura": return 0.75 + 0.35 * p;
  }
}
