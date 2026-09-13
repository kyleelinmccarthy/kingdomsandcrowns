import { WORLD_SIZE, type Prop, type Vec2 } from "./layout";

export const HERO_SPEED = 3.5; // units per second
export const ARRIVE_RADIUS = 0.25;
export const HERO_RADIUS = 0.45;
export const COMPANION_GAP = 1.2;
export const COMPANION_MIN_GAP = 0.8;
export const COMPANION_GAP_MOUNTED = 2.0;

export type Facing = "n" | "s" | "e" | "w";
export type HeroState = { position: Vec2; facing: Facing; target: Vec2 | null; mounted: boolean };
export type MoveInput = { axis: Vec2 }; // −1..1 per axis; zero when idle
export type CompanionState = { position: Vec2 };

export const FACING_VEC: Record<Facing, Vec2> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };

const LIMIT = WORLD_SIZE / 2 - HERO_RADIUS;

function clampToWorld(p: Vec2): Vec2 {
  return { x: Math.max(-LIMIT, Math.min(LIMIT, p.x)), z: Math.max(-LIMIT, Math.min(LIMIT, p.z)) };
}

/** True when a point sits inside a prop's footprint grown by the hero's radius. */
function blocked(p: Vec2, prop: Prop): boolean {
  const hw = prop.size.w / 2 + HERO_RADIUS;
  const hd = prop.size.d / 2 + HERO_RADIUS;
  return Math.abs(p.x - prop.position.x) < hw && Math.abs(p.z - prop.position.z) < hd;
}

function facingFrom(dx: number, dz: number, previous: Facing): Facing {
  if (dx === 0 && dz === 0) return previous;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? "e" : "w";
  return dz > 0 ? "s" : "n";
}

/**
 * One frame of hero motion. Stick or keys win over a pending target. Movement is
 * applied one axis at a time and a blocked axis is simply cancelled, which is
 * what makes the hero slide along walls instead of sticking to them.
 *
 * The target-following arm is NOT dead code, and it is worth saying so here because a review
 * once concluded it was. Task 10 deleted tap-to-move, so nothing in `realm-scene.tsx` sets a
 * target any more — but `ceremony/ceremony.ts` builds its HeroState literals inline with
 * `target: waypoint` and calls straight through, for the hero and for every villager, on every
 * walk step of the crown ceremony. Delete this arm and every figure stands still at a season's
 * end.
 */
export function stepHero(state: HeroState, input: MoveInput, dt: number, colliders: Prop[], speed: number = HERO_SPEED): HeroState {
  if (dt <= 0) return state; // a zero-length frame (R3F's first useFrame delta can be 0) moves nobody
  let vx = 0;
  let vz = 0;
  let target = state.target;
  const len = Math.hypot(input.axis.x, input.axis.z);
  if (len > 0.01) {
    vx = (input.axis.x / len) * speed;
    vz = (input.axis.z / len) * speed;
    target = null;
  } else if (target) {
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_RADIUS) return { ...state, target: null };
    const step = Math.min(dist, speed * dt) / dt;
    vx = (dx / dist) * step;
    vz = (dz / dist) * step;
  } else {
    return state;
  }

  let x = state.position.x + vx * dt;
  let z = state.position.z;
  if (colliders.some((c) => blocked({ x, z }, c))) x = state.position.x;
  z = state.position.z + vz * dt;
  if (colliders.some((c) => blocked({ x, z }, c))) z = state.position.z;

  const position = clampToWorld({ x, z });
  const moved = position.x !== state.position.x || position.z !== state.position.z;
  const facing = facingFrom(position.x - state.position.x, position.z - state.position.z, state.facing);
  // A target the hero cannot make progress toward is dropped, so a tap behind a wall doesn't pin them.
  if (target && !moved) target = null;
  return { position, facing, target, mounted: state.mounted };
}

/** If the hero stands inside a solid prop (a foundation that just became a building), step them out to just south of it. */
export function unstickHero(state: HeroState, colliders: Prop[]): HeroState {
  const inside = colliders.find((c) => blocked(state.position, c));
  if (!inside) return state;
  return { ...state, target: null, position: { x: state.position.x, z: inside.position.z + inside.size.d / 2 + HERO_RADIUS + 0.1 } };
}

/** Riding is a flag on the hero; a mount's speed is passed to stepHero by the scene. Mounting drops any walk target. */
export function setMounted(state: HeroState, mounted: boolean): HeroState {
  if (state.mounted === mounted) return state;
  return { ...state, mounted, target: null };
}

/** The companion eases toward a spot behind the hero and never crowds them. */
export function stepCompanion(companion: CompanionState, hero: HeroState, dt: number, opts: { gap?: number; speed?: number } = {}): CompanionState {
  const gap = opts.gap ?? COMPANION_GAP;
  const speed = opts.speed ?? HERO_SPEED;
  const f = FACING_VEC[hero.facing];
  const goal = { x: hero.position.x - f.x * gap, z: hero.position.z - f.z * gap };
  const dx = goal.x - companion.position.x;
  const dz = goal.z - companion.position.z;
  const dist = Math.hypot(dx, dz);
  let next = companion.position;
  if (dist > 0.001) {
    const step = Math.min(dist, speed * 0.9 * dt);
    next = { x: companion.position.x + (dx / dist) * step, z: companion.position.z + (dz / dist) * step };
  }
  const hx = next.x - hero.position.x;
  const hz = next.z - hero.position.z;
  const hd = Math.hypot(hx, hz);
  if (hd < COMPANION_MIN_GAP) {
    const ux = hd > 0.001 ? hx / hd : -f.x;
    const uz = hd > 0.001 ? hz / hd : -f.z;
    next = { x: hero.position.x + ux * COMPANION_MIN_GAP, z: hero.position.z + uz * COMPANION_MIN_GAP };
  }
  return { position: next };
}
