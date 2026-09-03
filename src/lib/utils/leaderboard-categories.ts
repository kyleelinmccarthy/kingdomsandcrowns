/**
 * What each leaderboard category ranks by, in one place.
 *
 * This used to live as a hand-maintained ternary chain and a separate filter
 * ternary inside the query. TypeScript could not catch a category added to the
 * union but forgotten in either, and both failure modes are silent: a missing
 * rank column breaks that board, while a filter applied to the wrong category
 * quietly drops children off a board they currently appear on.
 */

export type LeaderboardCategory = "xp" | "streak" | "longestStreak" | "badges" | "upkeep";

/** A `child` column a category ranks by; null for categories that aggregate instead. */
export type RankColumn = "currentXp" | "currentStreak" | "longestStreak" | "upkeepXp";

export type LeaderboardCategoryConfig = {
  /** The child column to order by, or null when the category aggregates (badges counts rows). */
  rankBy: RankColumn | null;
  /**
   * Restrict the board to children with a value above zero. Only Steward's
   * Renown wants this — families who never enabled Upkeep would otherwise pad
   * it with zeroes. Setting it on any other category would remove children
   * from boards they belong on.
   */
  onlyPositive: boolean;
};

export const LEADERBOARD_CATEGORIES: Record<LeaderboardCategory, LeaderboardCategoryConfig> = {
  xp: { rankBy: "currentXp", onlyPositive: false },
  streak: { rankBy: "currentStreak", onlyPositive: false },
  longestStreak: { rankBy: "longestStreak", onlyPositive: false },
  badges: { rankBy: null, onlyPositive: false },
  upkeep: { rankBy: "upkeepXp", onlyPositive: true },
};
