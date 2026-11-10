/** The words a review run wears in its header: a riddle stone in the Realm, or Quick review on the page. */
export const QUICK_REVIEW_TITLE = "Quick review";
export const stoneTitle = (placeName: string): string => `${placeName} riddle stone`;
export const REVIEW_STORY = "Three riddles from things you have learned. Answer them to keep them sharp.";
/** The review card's one line: how many riddles were asked and how many were answered right. */
export const reviewSummaryLine = (s: { total: number; correctCount: number }): string => `Reviewed ${s.total} · ${s.correctCount} right`;
/** A finished review's heading, and the button that finishes one. */
export const REVIEW_DONE = "Review done!";
export const REVIEW_FINISH = "Finish review";
