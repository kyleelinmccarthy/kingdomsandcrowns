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
