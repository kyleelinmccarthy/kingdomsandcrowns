import { BUILDING_SLOTS, type Prop, type Vec2, type WorldLayout } from "../layout";
import { ARRIVE_RADIUS, HERO_SPEED, stepHero } from "../movement";
import { VILLAGERS } from "../villagers";

/**
 * The crown ceremony, as a pure script stepped by the scene's frame loop.
 * Everyone walks to marks by the castle, the people gather, the crown descends,
 * the hero is hailed, and play resumes. Nothing here touches React or three.
 */

export type CeremonyStep = "walk" | "gather" | "descend" | "hail" | "done";
export type CeremonyMarks = { hero: Vec2; villagers: Record<string, Vec2> };
export type CeremonyState = {
  step: CeremonyStep;
  elapsed: number; // ms inside the current step
  hero: Vec2;
  villagers: Record<string, Vec2>;
  crownY: number;
  skipped: boolean;
  marks: CeremonyMarks;
};
export type CeremonyEvent = { kind: "step"; step: CeremonyStep };

export const GATHER_MS = 3000;
export const DESCEND_MS = 1500;
export const HAIL_MS = 4000;
/** A hero who cannot reach the mark (blocked in) still gets their ceremony. */
export const WALK_TIMEOUT_MS = 20_000;
export const CROWN_HIGH = 4;
export const CROWN_LOW = 1.9;
export const MARK_RADIUS = 0.3;
export const VILLAGER_SPEED = 3;
/** The villagers' half circle: its radius, and how far south of the hero its centre sits. */
const GATHER_RADIUS = 3;
const GATHER_OFFSET = 2;
/** Clearance between the castle's south face and the hero (the castle collider pads by the hero's radius). */
const HERO_CLEARANCE = 1.5;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Where everyone stands: the hero on the path at the castle's south face, the villagers in a half circle two units behind, facing the castle. */
export function ceremonyMarks(layout: WorldLayout): CeremonyMarks {
  const castle = layout.props.find((p) => p.kind === "castle");
  const cx = castle?.position.x ?? 0;
  const south = castle ? castle.position.z + castle.size.d / 2 : -13;
  const hero = { x: cx, z: south + HERO_CLEARANCE };
  const villagers: Record<string, Vec2> = {};
  // Ordered west to east by each villager's own building, not by catalog order: BUILDING_SLOTS
  // alternates sides of the path, so a declaration-order walk would send every other villager
  // clear across the map to their mark, straight into another building's collider.
  const westToEast = [...VILLAGERS].sort((a, b) => BUILDING_SLOTS[a.buildingId].x - BUILDING_SLOTS[b.buildingId].x);
  westToEast.forEach((v, i) => {
    // Angles from west (π) to east (0) through the south, so the ring opens toward the castle
    // and each villager's mark sits on the same side as the building they're walking from.
    const angle = Math.PI - (Math.PI * (i + 0.5)) / westToEast.length;
    villagers[v.id] = { x: hero.x + Math.cos(angle) * GATHER_RADIUS, z: hero.z + GATHER_OFFSET + Math.sin(angle) * GATHER_RADIUS };
  });
  return { hero, villagers };
}

function marksFor(marks: CeremonyMarks, ids: string[]): Record<string, Vec2> {
  return Object.fromEntries(ids.map((id) => [id, marks.villagers[id]]));
}

export function startCeremony(layout: WorldLayout, hero: Vec2, reducedMotion: boolean): CeremonyState {
  const marks = ceremonyMarks(layout);
  const ids = layout.villagers.map((v) => v.id);
  if (reducedMotion) {
    return { step: "gather", elapsed: 0, hero: marks.hero, villagers: marksFor(marks, ids), crownY: CROWN_LOW, skipped: false, marks };
  }
  const villagers = Object.fromEntries(layout.villagers.map((v) => [v.id, v.position]));
  return { step: "walk", elapsed: 0, hero, villagers, crownY: CROWN_HIGH, skipped: false, marks };
}

/**
 * One walker's frame toward a mark, with the hero's own axis-cancel slide along walls.
 * A walker whose mark is far off to one side squares the corner instead of cutting a
 * diagonal: it closes the x gap first (at its current z), then the z gap at the mark's
 * x, so a building sitting between a distant villager and the plaza never catches it
 * mid-diagonal the way a straight line to the mark can.
 */
function walk(from: Vec2, mark: Vec2, speed: number, dt: number, colliders: Prop[]): Vec2 {
  const waypoint = Math.abs(from.x - mark.x) > ARRIVE_RADIUS ? { x: mark.x, z: from.z } : mark;
  return stepHero({ position: from, facing: "n", target: waypoint, mounted: false }, { axis: { x: 0, z: 0 } }, dt, colliders, speed).position;
}

function enter(state: CeremonyState, step: CeremonyStep): { state: CeremonyState; entered: CeremonyStep } {
  return { state: { ...state, step, elapsed: 0 }, entered: step };
}

export function stepCeremony(state: CeremonyState, dt: number, colliders: Prop[], reducedMotion: boolean): { state: CeremonyState; entered: CeremonyStep | null } {
  if (state.step === "done") return { state, entered: null };
  const elapsed = state.elapsed + dt * 1000;
  switch (state.step) {
    case "walk": {
      const hero = walk(state.hero, state.marks.hero, HERO_SPEED, dt, colliders);
      const villagers: Record<string, Vec2> = {};
      for (const [id, p] of Object.entries(state.villagers)) villagers[id] = walk(p, state.marks.villagers[id], VILLAGER_SPEED, dt, colliders);
      const arrived = dist(hero, state.marks.hero) <= MARK_RADIUS && Object.entries(villagers).every(([id, p]) => dist(p, state.marks.villagers[id]) <= MARK_RADIUS);
      const moved = { ...state, hero, villagers, elapsed };
      if (arrived || elapsed >= WALK_TIMEOUT_MS) return enter(moved, "gather");
      return { state: moved, entered: null };
    }
    case "gather":
      if (elapsed >= GATHER_MS) return enter(state, reducedMotion ? "hail" : "descend");
      return { state: { ...state, elapsed }, entered: null };
    case "descend": {
      const k = Math.min(1, elapsed / DESCEND_MS);
      if (k >= 1) return enter({ ...state, crownY: CROWN_LOW }, "hail");
      return { state: { ...state, elapsed, crownY: CROWN_HIGH - (CROWN_HIGH - CROWN_LOW) * easeOut(k) }, entered: null };
    }
    case "hail":
      if (elapsed >= HAIL_MS) return enter(state, "done");
      return { state: { ...state, elapsed }, entered: null };
  }
}

/** Straight to the hail: everyone at their marks, the crown down. Nothing changes once hailing or done. */
export function skipCeremony(state: CeremonyState): CeremonyState {
  if (state.step === "hail" || state.step === "done") return state;
  return { ...state, step: "hail", elapsed: 0, hero: state.marks.hero, villagers: marksFor(state.marks, Object.keys(state.villagers)), crownY: CROWN_LOW, skipped: true };
}

export function ceremonyNotice(step: CeremonyStep, heroName: string, crownLabel: string): string | null {
  if (step === "gather") return "The people of the Realm gather.";
  if (step === "hail") return `Hail, ${heroName}, ${crownLabel}!`;
  return null;
}
