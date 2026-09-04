import { WORLD_SIZE, type Prop, type Vec2 } from "./layout";

export const HERO_SPEED = 3.5; // units per second
export const ARRIVE_RADIUS = 0.25;
export const HERO_RADIUS = 0.45;
export const COMPANION_GAP = 1.2;
export const COMPANION_MIN_GAP = 0.8;

export type Facing = "n" | "s" | "e" | "w";
export type HeroState = { position: Vec2; facing: Facing; target: Vec2 | null };
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

/** A tap sets a destination; a tap inside a wall is ignored rather than walking the hero into it. */
export function setTarget(state: HeroState, target: Vec2, colliders: Prop[]): HeroState {
  const t = clampToWorld(target);
  if (colliders.some((c) => blocked(t, c))) return state;
  return { ...state, target: t };
}

/**
 * One frame of hero motion. Stick or keys win over a pending tap. Movement is
 * applied one axis at a time and a blocked axis is simply cancelled, which is
 * what makes the hero slide along walls instead of sticking to them.
 */
export function stepHero(state: HeroState, input: MoveInput, dt: number, colliders: Prop[]): HeroState {
  let vx = 0;
  let vz = 0;
  let target = state.target;
  const len = Math.hypot(input.axis.x, input.axis.z);
  if (len > 0.01) {
    vx = (input.axis.x / len) * HERO_SPEED;
    vz = (input.axis.z / len) * HERO_SPEED;
    target = null;
  } else if (target) {
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_RADIUS) return { ...state, target: null };
    const step = Math.min(dist, HERO_SPEED * dt) / dt;
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
  return { position, facing, target };
}

/** The companion eases toward a spot behind the hero and never crowds them. */
export function stepCompanion(companion: CompanionState, hero: HeroState, dt: number): CompanionState {
  const f = FACING_VEC[hero.facing];
  const goal = { x: hero.position.x - f.x * COMPANION_GAP, z: hero.position.z - f.z * COMPANION_GAP };
  const dx = goal.x - companion.position.x;
  const dz = goal.z - companion.position.z;
  const dist = Math.hypot(dx, dz);
  let next = companion.position;
  if (dist > 0.001) {
    const step = Math.min(dist, HERO_SPEED * 0.9 * dt);
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
