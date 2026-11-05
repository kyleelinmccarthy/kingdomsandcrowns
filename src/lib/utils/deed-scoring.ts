/**
 * The single owner of how a deed run is scored. Points reward getting it right
 * the first time but still credit a second try, so a miss becomes a lesson
 * rather than a zero; stars are the share of the run's best possible points.
 */
export type Stars = 0 | 1 | 2 | 3;
export type QuestionOutcome = "first" | "second" | "miss";
export type RunKind = "deed" | "challenge";

export const SCORING = {
  firstTryPoints: 2,
  secondTryPoints: 1,
  /** Share of the run's maximum points that earns 1, 2 and 3 stars. */
  starThresholds: [0.35, 0.65, 0.9],
  /** A run must earn this many stars to raise its building. */
  starsToBuild: 1,
} as const;

/** The optional Crown Challenge: a few questions one rung above the child. */
export const CHALLENGE = { questions: 3, levelBoost: 1 } as const;

export type RunEffects = {
  raisesBuilding: boolean;
  earnsStars: boolean;
  movesMastery: boolean;
  countsForSchool: boolean;
  feedsReview: boolean;
  allowsSecondChances: boolean;
};

/**
 * What a run kind does, in one table every consumer reads instead of
 * scattering `kind === ...` checks. A challenge changes nothing but its crown:
 * its questions sit above the child, so repeated tries must never demote a
 * skill they have already shown.
 */
export const RUN_EFFECTS: Record<RunKind, RunEffects> = {
  deed: {
    raisesBuilding: true,
    earnsStars: true,
    movesMastery: true,
    countsForSchool: true,
    feedsReview: true,
    allowsSecondChances: true,
  },
  challenge: {
    raisesBuilding: false,
    earnsStars: false,
    movesMastery: false,
    countsForSchool: false,
    feedsReview: false,
    allowsSecondChances: false,
  },
};

export function runPoints(outcomes: readonly QuestionOutcome[]): { points: number; max: number } {
  let points = 0;
  for (const o of outcomes) {
    if (o === "first") points += SCORING.firstTryPoints;
    else if (o === "second") points += SCORING.secondTryPoints;
  }
  return { points, max: outcomes.length * SCORING.firstTryPoints };
}

export function starsFor(points: number, max: number): Stars {
  if (max <= 0) return 0;
  const share = points / max;
  const [one, two, three] = SCORING.starThresholds;
  if (share >= three) return 3;
  if (share >= two) return 2;
  if (share >= one) return 1;
  return 0;
}

export function countsTowardBuilding(stars: number): boolean {
  return stars >= SCORING.starsToBuild;
}

/** Every deed in the building has its three stars. */
export function isGilded(b: { stars: number; maxStars: number }): boolean {
  return b.maxStars > 0 && b.stars >= b.maxStars;
}
