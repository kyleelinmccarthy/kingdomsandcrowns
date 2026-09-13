import type { Vec2 } from "./layout";

export type Targetable = { id: string; position: Vec2 };
export type TargetInput = { pointer: Vec2 | null; hero: Vec2; troubles: Targetable[]; range: number; pointerRadius: number };
export type TargetResult = { id: string; position: Vec2 } | { refused: true };

const dist2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * One rule for both ways of casting: the trouble you are pointing at, or the nearest one
 * in range. Pointing does not extend the spell's reach — a pointed-at trouble still has to
 * be inside `range`, or the cast refuses like any other.
 */
export function pickTarget({ pointer, hero, troubles, range, pointerRadius }: TargetInput): TargetResult {
  const inRange = troubles.filter((t) => dist2(hero, t.position) <= range * range);
  if (inRange.length === 0) return { refused: true };

  if (pointer) {
    let pointed: Targetable | null = null;
    let best = pointerRadius * pointerRadius;
    for (const t of inRange) {
      const d = dist2(pointer, t.position);
      if (d <= best) { best = d; pointed = t; }
    }
    if (pointed) return { id: pointed.id, position: pointed.position };
  }

  let nearest = inRange[0];
  for (const t of inRange) if (dist2(hero, t.position) < dist2(hero, nearest.position)) nearest = t;
  return { id: nearest.id, position: nearest.position };
}
