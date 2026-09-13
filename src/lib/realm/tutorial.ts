export type TutorialStep = 1 | 2 | 3 | 4;

export type TutorialSignal =
  | { kind: "walked"; keys: string[]; distance: number }
  | { kind: "reachedObjective" }
  | { kind: "interacted" }
  | { kind: "castLanded" };

export type TutorialState = { completed: number };

/** Far enough to be a walk rather than a twitch, close enough to reach in a few seconds. */
export const WALK_DISTANCE = 4;

/**
 * Four steps, each gated on doing the thing. The prompts are the only tutorial words a
 * child reads, so they name keys and never name the complexity axis.
 */
export const TUTORIAL_STEPS = [
  { step: 1 as TutorialStep, signal: "walked" as const, prompt: "Use W, A, S and D to walk." },
  { step: 2 as TutorialStep, signal: "reachedObjective" as const, prompt: "Go where the light is." },
  { step: 3 as TutorialStep, signal: "interacted" as const, prompt: "Stand close and press E." },
  { step: 4 as TutorialStep, signal: "castLanded" as const, prompt: "Press 1." },
];

const clampCompleted = (n: number) => Math.max(0, Math.min(TUTORIAL_STEPS.length, Math.floor(n)));

/**
 * Below this, a world-axis component is float noise rather than a direction anyone pushed:
 * one key alone yields components of 0 or ±0.7071, and the smallest real diagonal is 0.7071
 * too, so anything near zero is rounding.
 */
const AXIS_EPSILON = 0.05;

/**
 * The movement keys that produced a world-space axis — the inverse of `screenToWorldAxis`.
 *
 * The scene only ever sees the WORLD axis (`axisRef`), never a key set. But the mapping from
 * screen to world is invertible — `sx = (x − z)/√2`, `sy = −(x + z)/√2` — so the keys can be
 * recovered from it rather than tracked a second time, which is what lets one scene prop carry
 * the whole `walked` signal. It also means a thumb on the stick gets the same two-directions
 * rule a keyboard does, on a device where "W, A, S and D" are a stick and there are no key
 * codes to count.
 *
 * Pure and three-free, so it lives here beside the rule it feeds instead of inside the frame
 * loop where nothing could test it. A hero walking by click-to-move has a zero axis and gets an
 * empty array: clicking the grass is not pressing W, and step one must not pretend it is.
 */
export function keysFromWorldAxis(axis: { x: number; z: number }): string[] {
  const sx = (axis.x - axis.z) * Math.SQRT1_2;
  const sy = -(axis.x + axis.z) * Math.SQRT1_2;
  const keys: string[] = [];
  if (sy > AXIS_EPSILON) keys.push("KeyW");
  if (sy < -AXIS_EPSILON) keys.push("KeyS");
  if (sx < -AXIS_EPSILON) keys.push("KeyA");
  if (sx > AXIS_EPSILON) keys.push("KeyD");
  return keys;
}

/**
 * Whether the frame loop should send a `walked` signal this frame.
 *
 * `lastEmittedKeyCount` is the size of the key set the previous signal carried, and starts at
 * 0. So the signal goes out when the distance FIRST crosses WALK_DISTANCE, and after that only
 * when a NEW distinct key joins the set — at most four times a visit, and never once a frame.
 *
 * Emitting strictly once would be a trap, and this is the half of the design that matters. A
 * child who crosses the line pressing nothing but W has not finished step one (`advanceTutorial`
 * wants two keys), and if their only signal were already spent, pressing A a moment later could
 * never finish it either: they would be stuck on "Use W, A, S and D to walk." for the rest of
 * the visit with no way out but a grown-up's Skip. Re-emitting on a grown key set is what makes
 * the step finishable the instant the child does the thing the prompt asked for.
 *
 * A key count of 0 never emits: a click-to-walk hero covers ground without pressing anything.
 */
export function shouldEmitWalked(distance: number, keyCount: number, lastEmittedKeyCount: number): boolean {
  if (distance < WALK_DISTANCE) return false;
  if (keyCount === 0) return false;
  return keyCount !== lastEmittedKeyCount;
}

/**
 * The other half of the frame loop's tutorial bookkeeping: whether arriving at the lit site
 * should send `reachedObjective`, and what the latch becomes.
 *
 * Arrival is EDGE-triggered, so standing at the light is silent and only crossing in speaks;
 * the latch clears on the way out. `walkedThisFrame` clears it too, and that coupling is the
 * part worth testing: a `reachedObjective` sent while step one is still current is ignored by
 * `advanceTutorial`, and would otherwise have been the hero's only arrival. It is not
 * hypothetical — from the spawn, holding W alone walks the hero to within two units of the
 * first site, so a child can reach the light before they have learned to walk. Without the
 * re-arm they would finish step one standing in the beacon and never be able to finish step
 * two without leaving and coming back.
 */
export function objectiveArrival(
  inside: boolean,
  latched: boolean,
  walkedThisFrame: boolean,
): { latched: boolean; emit: boolean } {
  if (!inside) return { latched: false, emit: false };
  const armed = latched && !walkedThisFrame;
  return { latched: true, emit: !armed };
}

export function tutorialPrompt(state: TutorialState): string | null {
  const done = clampCompleted(state.completed);
  return TUTORIAL_STEPS[done]?.prompt ?? null;
}

export function advanceTutorial(state: TutorialState, signal: TutorialSignal): TutorialState {
  const done = clampCompleted(state.completed);
  const current = TUTORIAL_STEPS[done];
  if (!current || current.signal !== signal.kind) return { completed: done };
  // Step one needs both halves: a child who only presses W has not learned to move, and
  // telling them they have is how they get stuck later.
  if (signal.kind === "walked") {
    const distinct = new Set(signal.keys).size;
    if (distinct < 2 || signal.distance < WALK_DISTANCE) return { completed: done };
  }
  return { completed: done + 1 };
}
