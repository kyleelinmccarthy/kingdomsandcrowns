import type { TaskKind } from "./types";

/**
 * The hands-on kinds: the ones a grown-up can switch on beyond multiple choice. Client-safe (a
 * settings panel can list them), so it holds names only, never a definition or a generator.
 */
export const HANDS_ON_KINDS = ["measure", "lock", "trail", "rune"] as const;

export type HandsOnKind = (typeof HANDS_ON_KINDS)[number];

/** The kinds answered by walking the Realm to a place (R-H9); slice 6 adds the rune. */
export const WALKING_KINDS = ["trail"] as const;

export const isWalkingKind = (k: TaskKind): boolean => (WALKING_KINDS as readonly string[]).includes(k);

/** A run the hero walks: at least one task, and every task's kind is a walking one. */
export const isWalkingRun = (run: { questions: readonly { kind: TaskKind }[] }): boolean =>
  run.questions.length > 0 && run.questions.every((q) => isWalkingKind(q.kind));
