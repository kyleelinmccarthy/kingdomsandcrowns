/**
 * The single owner of how a deed run is scored. Points reward getting it right
 * the first time but still credit a second try, so a miss becomes a lesson
 * rather than a zero; stars are the share of the run's best possible points.
 */
export type Stars = 0 | 1 | 2 | 3;
/** The most stars one side quest can hold. */
export const MAX_STARS = 3;
export type QuestionOutcome = "first" | "second" | "miss";
export type RunKind = "deed" | "challenge" | "review" | "build" | "world" | "tower";

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
  /** Whether finishing it pays play minutes (still needs stars, and the hero as the player). */
  paysMinutes: boolean;
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
    paysMinutes: true,
  },
  challenge: {
    raisesBuilding: false,
    earnsStars: false,
    movesMastery: false,
    countsForSchool: false,
    feedsReview: false,
    allowsSecondChances: false,
    paysMinutes: false,
  },
  /** A riddle stone or Quick review: it moves mastery and feeds review, but belongs to no building. */
  review: {
    raisesBuilding: false,
    earnsStars: false,
    movesMastery: true,
    countsForSchool: false,
    feedsReview: true,
    allowsSecondChances: true,
    paysMinutes: false,
  },
  /**
   * Building a plan at the bench (R-D6): its stars go on the plaque and its answers move mastery,
   * but it raises no core building and pays no minutes. The level stands whatever the stars.
   */
  build: {
    raisesBuilding: false,
    earnsStars: true,
    movesMastery: true,
    countsForSchool: false,
    feedsReview: true,
    allowsSecondChances: true,
    paysMinutes: false,
  },
  /**
   * Logic locks out in the world (R-F9): Puzzle practice on the Side Quests page now, a chest or a
   * vault door from 4b. Its answers move mastery and feed review, with second chances as a side
   * quest has them; it earns no star, pays no minutes and belongs to no building or spell school.
   */
  world: {
    raisesBuilding: false,
    earnsStars: false,
    movesMastery: true,
    countsForSchool: false,
    feedsReview: true,
    allowsSecondChances: true,
    paysMinutes: false,
  },
  /**
   * A bonus lock on an open floor of the Puzzle Tower (R-G4b): a puzzle for the joy of it, a level
   * above the hero. It moves nothing but the floor's solved count, which its finish keeps itself.
   */
  tower: {
    raisesBuilding: false,
    earnsStars: false,
    movesMastery: false,
    countsForSchool: false,
    feedsReview: false,
    allowsSecondChances: false,
    paysMinutes: false,
  },
};

/** The run kinds whose first-try misses may come back in a later run (`RUN_EFFECTS[k].feedsReview`). */
export function kindsThatFeedReview(): RunKind[] {
  return (Object.keys(RUN_EFFECTS) as RunKind[]).filter((k) => RUN_EFFECTS[k].feedsReview);
}

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
