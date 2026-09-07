import { WORLD_SIZE, type Prop, type Vec2 } from "../layout";
import type { SpellDefinition, StatusKind } from "@/lib/utils/spell-catalog";
import { hitTrouble, TROUBLE_RADIUS, type Trouble } from "./troubles";
import { directionFrom } from "./caster";

export type EffectHit = { effectId: string; troubleId: string; spell: SpellDefinition };

export type SpellEffect =
  | { kind: "projectile"; id: string; spell: SpellDefinition; position: Vec2; velocity: Vec2; travelled: number; bounced: boolean; radius: number }
  | { kind: "area"; id: string; spell: SpellDefinition; position: Vec2; radius: number; until: number; hit: string[] }
  | { kind: "beam"; id: string; spell: SpellDefinition; from: Vec2; to: Vec2; until: number; nextHitAt: number }
  | { kind: "barrier"; id: string; spell: SpellDefinition; a: Vec2; b: Vec2; until: number }
  | { kind: "self"; id: string; spell: SpellDefinition; position: Vec2; until: number; nextHitAt: number }
  | { kind: "summon"; id: string; spell: SpellDefinition; position: Vec2; until: number; nextShotAt: number };

export const PROJECTILE_RADIUS = 0.6;
export const SEEK_RANGE = 3;
export const SEEK_TURN = Math.PI / 2; // radians per second
export const AREA_RADIUS = 2;
export const AREA_GROWN_RADIUS = 3;
export const AREA_MS = 400;
export const BEAM_WIDTH = 0.8;
export const BEAM_TICK_MS = 200;
export const BEAM_MS = 600;
export const BARRIER_LENGTH = 4;
export const BARRIER_THICKNESS = 0.4;
export const BARRIER_MS = 6000;
export const SHIELD_MS = 5000;
export const AURA_TICK_MS = 500;
export const AURA_MS = 3000;
export const SUMMON_MS = 8000;
export const SUMMON_SHOT_MS = 1500;
export const SUMMON_SENSE = 4;
export const SUMMON_FOLLOW = 1.2;
const MINI_BOLT_SPEED = 10;
const MINI_BOLT_RANGE = 4;
const LIMIT = WORLD_SIZE / 2;

export function hasStatus(spell: SpellDefinition, kind: StatusKind): boolean {
  return spell.statuses.some((s) => s.kind === kind);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearest(troubles: Trouble[], p: Vec2, within: number): Trouble | null {
  let best: Trouble | null = null;
  let bestD = within;
  for (const t of troubles) {
    const d = dist(t.position, p);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return dist(p, { x: a.x + abx * t, z: a.z + abz * t });
}

/** Turns a released cast into its live effect. `target` is already shaped by `castTargetFor`. */
export function releaseEffect(spell: SpellDefinition, hero: Vec2, target: Vec2, now: number, id: string): SpellEffect {
  const dir = directionFrom(hero, target);
  switch (spell.shape) {
    case "projectile":
      return { kind: "projectile", id, spell, position: { ...hero }, velocity: { x: dir.x * spell.speed, z: dir.z * spell.speed }, travelled: 0, bounced: false, radius: PROJECTILE_RADIUS };
    case "area":
      return { kind: "area", id, spell, position: { ...target }, radius: hasStatus(spell, "grown") ? AREA_GROWN_RADIUS : AREA_RADIUS, until: now + AREA_MS, hit: [] };
    case "beam":
      return { kind: "beam", id, spell, from: { ...hero }, to: { ...target }, until: now + BEAM_MS, nextHitAt: now };
    case "barrier": {
      const perp = { x: -dir.z, z: dir.x };
      const half = BARRIER_LENGTH / 2;
      return { kind: "barrier", id, spell, a: { x: target.x - perp.x * half, z: target.z - perp.z * half }, b: { x: target.x + perp.x * half, z: target.z + perp.z * half }, until: now + BARRIER_MS };
    }
    case "self":
      return { kind: "self", id, spell, position: { ...hero }, until: now + (spell.parts.formId === "shield" ? SHIELD_MS : AURA_MS), nextHitAt: now };
    case "summon":
      return { kind: "summon", id, spell, position: { x: hero.x, z: hero.z + SUMMON_FOLLOW }, until: now + SUMMON_MS, nextShotAt: now + SUMMON_SHOT_MS };
  }
}

/** Walls block troubles, never the hero: thin solid props aligned to the wall's axis. */
export function barrierColliders(effects: SpellEffect[]): Prop[] {
  const out: Prop[] = [];
  for (const e of effects) {
    if (e.kind !== "barrier") continue;
    const alongX = Math.abs(e.b.x - e.a.x) >= Math.abs(e.b.z - e.a.z);
    out.push({
      id: `barrier-${e.id}`,
      kind: "barrier",
      label: "Wall",
      position: { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 },
      size: alongX ? { w: BARRIER_LENGTH, d: BARRIER_THICKNESS, h: 1.2 } : { w: BARRIER_THICKNESS, d: BARRIER_LENGTH, h: 1.2 },
      color: e.spell.color,
      solid: true,
    });
  }
  return out;
}

export function heroShielded(effects: SpellEffect[], now: number): boolean {
  return effects.some((e) => e.kind === "self" && e.spell.parts.formId === "shield" && now < e.until);
}

/**
 * One frame for every live effect. Returns the surviving effects, the hits
 * they landed this frame (each trouble at most once per effect per tick), and
 * any effects a summon spawned. Callers apply hits to troubles themselves.
 */
export function stepEffects(effects: SpellEffect[], troubles: Trouble[], hero: Vec2, colliders: Prop[], dt: number, now: number): { effects: SpellEffect[]; hits: EffectHit[]; spawned: SpellEffect[] } {
  const hits: EffectHit[] = [];
  const spawned: SpellEffect[] = [];
  const out: SpellEffect[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case "projectile": {
        let velocity = e.velocity;
        if (hasStatus(e.spell, "seeking")) {
          const mark = nearest(troubles, e.position, SEEK_RANGE);
          if (mark) {
            const want = Math.atan2(mark.position.z - e.position.z, mark.position.x - e.position.x);
            const have = Math.atan2(velocity.z, velocity.x);
            let diff = want - have;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.max(-SEEK_TURN * dt, Math.min(SEEK_TURN * dt, diff));
            const angle = have + turn;
            velocity = { x: Math.cos(angle) * e.spell.speed, z: Math.sin(angle) * e.spell.speed };
          }
        }
        const position = { x: e.position.x + velocity.x * dt, z: e.position.z + velocity.z * dt };
        const travelled = e.travelled + e.spell.speed * dt;
        const radius = hasStatus(e.spell, "grown") ? PROJECTILE_RADIUS * (1 + Math.min(1, travelled / e.spell.range)) : PROJECTILE_RADIUS;
        const target = troubles.find((t) => hitTrouble(t, position, radius));
        if (target) {
          hits.push({ effectId: e.id, troubleId: target.id, spell: e.spell });
          break; // the projectile is spent
        }
        if (travelled > e.spell.range || Math.abs(position.x) > LIMIT || Math.abs(position.z) > LIMIT) break;
        const wall = colliders.find((c) => insideProp(position, c, 0.3));
        if (wall) {
          if (hasStatus(e.spell, "bounce") && !e.bounced) {
            // Reflect on the axis with the shallower penetration: that is the face it came through.
            const penX = wall.size.w / 2 + 0.3 - Math.abs(position.x - wall.position.x);
            const penZ = wall.size.d / 2 + 0.3 - Math.abs(position.z - wall.position.z);
            velocity = penX < penZ ? { x: -velocity.x, z: velocity.z } : { x: velocity.x, z: -velocity.z };
            out.push({ ...e, position: e.position, velocity, travelled, bounced: true, radius });
          }
          break;
        }
        out.push({ ...e, position, velocity, travelled, radius });
        break;
      }
      case "area": {
        if (now >= e.until) break;
        const hit = e.hit.slice();
        for (const t of troubles) {
          if (hit.includes(t.id)) continue;
          if (dist(t.position, e.position) <= e.radius + TROUBLE_RADIUS) {
            hit.push(t.id);
            hits.push({ effectId: e.id, troubleId: t.id, spell: e.spell });
          }
        }
        out.push({ ...e, hit });
        break;
      }
      case "beam": {
        if (now >= e.until) break;
        let nextHitAt = e.nextHitAt;
        if (now >= nextHitAt) {
          let best: Trouble | null = null;
          let bestD = Infinity;
          for (const t of troubles) {
            if (segmentDistance(t.position, e.from, e.to) > BEAM_WIDTH) continue;
            const d = dist(t.position, e.from);
            if (d < bestD) {
              best = t;
              bestD = d;
            }
          }
          if (best) hits.push({ effectId: e.id, troubleId: best.id, spell: e.spell });
          nextHitAt = now + BEAM_TICK_MS;
        }
        out.push({ ...e, nextHitAt });
        break;
      }
      case "barrier": {
        if (now < e.until) out.push(e);
        break;
      }
      case "self": {
        if (now >= e.until) break;
        let nextHitAt = e.nextHitAt;
        if (e.spell.parts.formId !== "shield" && now >= nextHitAt) {
          for (const t of troubles) {
            if (dist(t.position, hero) <= e.spell.range) hits.push({ effectId: e.id, troubleId: t.id, spell: e.spell });
          }
          nextHitAt = now + AURA_TICK_MS;
        }
        out.push({ ...e, position: { ...hero }, nextHitAt });
        break;
      }
      case "summon": {
        if (now >= e.until) break;
        const follow = { x: hero.x, z: hero.z + SUMMON_FOLLOW };
        const k = Math.min(1, dt * 4);
        const position = { x: e.position.x + (follow.x - e.position.x) * k, z: e.position.z + (follow.z - e.position.z) * k };
        let nextShotAt = e.nextShotAt;
        if (now >= nextShotAt) {
          const mark = nearest(troubles, position, SUMMON_SENSE);
          if (mark) {
            const mini: SpellDefinition = { ...e.spell, shape: "projectile", speed: MINI_BOLT_SPEED, range: MINI_BOLT_RANGE, statuses: [] };
            spawned.push(releaseEffect(mini, position, mark.position, now, `${e.id}-shot-${Math.round(now)}`));
          }
          nextShotAt = now + SUMMON_SHOT_MS;
        }
        out.push({ ...e, position, nextShotAt });
        break;
      }
    }
  }
  return { effects: out, hits, spawned };
}
