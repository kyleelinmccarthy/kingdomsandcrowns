/**
 * "WHAT DO I DO?" — the answers the game gives without being asked.
 *
 * Two of them live here, as pure rules with tests beside them:
 *
 *   1. WHERE TO GO. The objective card names who is waiting; this finds them in the world and
 *      decides where the gold ! goes on screen. Over their head when they are in view, and pinned
 *      to the edge of the screen pointing the way when they are not — so from the very first
 *      frame a child who has never played can see which way to walk, and it never leaves them
 *      until they are close enough for the E prompt to take over.
 *   2. HOW SPELLS ARE EARNED. The empty page card used to say it in general; `spellHelp` says it
 *      for THIS child, from the same unlock rules the Spellbook builder runs: which parts they can
 *      already put together, and the next few they are closest to earning, in the Spellbook's own
 *      words (`spellUnlockHint`).
 *
 * No `three`, no DOM, and the per-frame function allocates nothing.
 */

import type { ObjectiveState } from "@/lib/realm/objective";
import type { VillagerPlacement } from "@/lib/realm/layout";
import {
  SPELL_ELEMENTS,
  SPELL_FORMS,
  spellUnlockHint,
  type SpellUnlock,
  type SpellUnlockContext,
} from "@/lib/utils/spell-catalog";
import type { SpellSchool } from "@/lib/utils/spell-schools";

/* ------------------------------------------------------------------ the goal */

/** Where the next objective is, in the world. `on` false means there is nowhere to send anyone. */
export type Goal = { on: boolean; x: number; z: number; name: string; /** The villager's id: "bram". */ id: string };

export const NO_GOAL: Goal = { on: false, x: 0, z: 0, name: "", id: "" };

/**
 * The villager the objective card names, standing where the layout put them. Read from the same
 * `objectiveState` the card reads and the same layout the world is built from, so the card, the
 * ! and the map can never point at three different people.
 */
export function goalFor(objective: ObjectiveState, villagers: readonly VillagerPlacement[], nameOf: (id: string) => string | null): Goal {
  if (objective.kind !== "next") return NO_GOAL;
  const first = objective.objectives[0];
  if (!first) return NO_GOAL;
  const v = villagers.find((p) => p.buildingId === first.buildingId);
  if (!v) return NO_GOAL;
  return { on: true, x: v.position.x, z: v.position.z, name: nameOf(v.id) ?? first.label, id: v.id };
}

/**
 * Closer than this and the ! stands down: the child is in E's reach (about two units from the
 * villager's edge), the prompt names them, and a bobbing ! on top of the prompt is noise.
 */
export const GOAL_NEAR = 3.5;

/** The screen's safe box for the edge arrow: clear of the corners' panels and the spell bar. */
export type Inset = { top: number; right: number; bottom: number; left: number };

export type GoalMark = {
  show: boolean;
  /** Pixels, the marker's centre. */
  x: number;
  y: number;
  /** CSS degrees, 0 pointing up the screen, clockwise. */
  angle: number;
  /** True when pinned to the screen edge (the target is out of view). */
  edge: boolean;
  /** World units from the hero, whole numbers. */
  dist: number;
};

export function makeGoalMark(): GoalMark {
  return { show: false, x: 0, y: 0, angle: 0, edge: false, dist: 0 };
}

/**
 * Places the !, into `out`.
 *
 * `ok, px, py` is the goal point's projection (`projectPoint`'s answer). When it lands inside the
 * safe box the marker sits on it. Otherwise it is pinned to the box's edge along the direction
 * of the goal RELATIVE TO THE CAMERA — worked out from the camera's yaw on the ground, not from
 * the projection, because a point behind the camera has no honest projection at all and the
 * arrow must still point the right way (behind you = down the screen).
 *
 * The camera sits on a boom at `hero + (sin yaw, cos yaw)·L`, looking back at the hero, so its
 * forward on the ground is `(-sin yaw, -cos yaw)` and its right is `(cos yaw, -sin yaw)`.
 */
export function placeGoal(
  out: GoalMark,
  ok: boolean,
  px: number,
  py: number,
  width: number,
  height: number,
  hx: number,
  hz: number,
  gx: number,
  gz: number,
  yaw: number,
  inset: Inset,
): GoalMark {
  const dx = gx - hx;
  const dz = gz - hz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  out.dist = Math.round(dist);
  if (dist < GOAL_NEAR) {
    out.show = false;
    return out;
  }
  out.show = true;
  const left = inset.left;
  const right = width - inset.right;
  const top = inset.top;
  const bottom = height - inset.bottom;
  if (ok && px >= left && px <= right && py >= top && py <= bottom) {
    out.x = px;
    out.y = py;
    out.angle = 180;
    out.edge = false;
    return out;
  }
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const side = dx * c - dz * s; // along the camera's right
  const ahead = -dx * s - dz * c; // along the camera's forward
  const a = Math.atan2(side, ahead);
  const sx = Math.sin(a);
  const sy = -Math.cos(a);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const hw = Math.max(1, (right - left) / 2);
  const hh = Math.max(1, (bottom - top) / 2);
  const tx = Math.abs(sx) > 1e-6 ? hw / Math.abs(sx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(sy) > 1e-6 ? hh / Math.abs(sy) : Number.POSITIVE_INFINITY;
  const t = tx < ty ? tx : ty;
  out.x = cx + sx * t;
  out.y = cy + sy * t;
  out.angle = (a * 180) / Math.PI;
  out.edge = true;
  return out;
}

/* ------------------------------------------------------------------ spells */

/** As much of `getSpellbook`'s answer as the lesson needs. */
export type SpellbookFacts = {
  level: number;
  unlocked: readonly string[];
  schoolCounts: Record<SpellSchool, number>;
  subjectNamesBySchool: Record<SpellSchool, string[]>;
};

export type SpellHelp = {
  /** The elements and shapes the child can put together today. */
  elements: string[];
  shapes: string[];
  /** The next few parts they are closest to, each with how to earn it. */
  next: { name: string; how: string }[];
};

/** How far off a sealed part is, so the closest come first. Quest rewards are a grown-up's gift, last. */
function distance(unlock: SpellUnlock, facts: SpellbookFacts): number {
  switch (unlock.type) {
    case "free":
      return 0;
    case "school":
      return Math.max(0, unlock.count - (facts.schoolCounts[unlock.school] ?? 0));
    case "level":
      return Math.max(0, unlock.level - facts.level) * 3;
    case "badge":
      return 500;
    case "quest":
      return 1000;
  }
}

/**
 * What THIS child can write, and what they are closest to earning.
 *
 * Only elements and shapes — the two halves of every spell. A modifier is the optional third
 * part and the first lesson does not need it. The hints are the Spellbook builder's own sentences.
 */
export function spellHelp(facts: SpellbookFacts, limit = 2): SpellHelp {
  const open = new Set(facts.unlocked);
  const ctx: SpellUnlockContext = {
    level: facts.level,
    earnedBadgeIds: [],
    questUnlockedIds: open,
    schoolCounts: facts.schoolCounts,
  };
  const parts = [...SPELL_ELEMENTS, ...SPELL_FORMS];
  const sealed = parts
    .filter((p) => !open.has(p.id))
    .map((p) => ({ name: p.label, how: spellUnlockHint(p.unlock, ctx, facts.subjectNamesBySchool, p.id), d: distance(p.unlock, facts) }))
    .filter((p): p is { name: string; how: string; d: number } => p.how !== null)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ name, how }) => ({ name, how }));
  return {
    elements: SPELL_ELEMENTS.filter((e) => open.has(e.id)).map((e) => e.label),
    shapes: SPELL_FORMS.filter((f) => open.has(f.id)).map((f) => f.label),
    next: sealed,
  };
}

/** "Ember and Tide", "Ember, Tide or Stone". */
export function listWords(words: readonly string[], join = "and"): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} ${join} ${words[words.length - 1]}`;
}
