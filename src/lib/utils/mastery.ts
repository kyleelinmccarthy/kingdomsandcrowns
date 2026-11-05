export const MASTERY_MAX = 4;
const HISTORY = 10;
// The ladder's rules, shared with the meter so what a child sees is what the rule does.
const UP_WINDOW = 8;
const UP_NEED = 7;
const DOWN_WINDOW = 6;
const DOWN_NEED = 3;

export type MasteryState = { level: number; recentResults: boolean[] };

/** How close a skill is to its next rung, as the run shows it after an answer. */
export type SkillMeter = { skillLabel: string; filled: number; needed: number };

/**
 * The ladder: seven of the last eight right climbs a rung, three of the last
 * six wrong steps down one. History clears on a step so a hero starts each
 * rung fresh. Low mastery never locks anything — it only picks easier work.
 */
export function recordResult(state: MasteryState, correct: boolean): MasteryState {
  const recent = [...state.recentResults, correct].slice(-HISTORY);
  const upWindow = recent.slice(-UP_WINDOW);
  const downWindow = recent.slice(-DOWN_WINDOW);
  const rightInUp = upWindow.filter(Boolean).length;
  const wrongInDown = downWindow.filter((r) => !r).length;
  if (upWindow.length === UP_WINDOW && rightInUp >= UP_NEED && state.level < MASTERY_MAX) {
    return { level: state.level + 1, recentResults: [] };
  }
  if (downWindow.length === DOWN_WINDOW && wrongInDown >= DOWN_NEED && state.level > 0) {
    return { level: state.level - 1, recentResults: [] };
  }
  return { level: state.level, recentResults: recent };
}

/** Pips toward the next step: rights among the last first tries, out of those that climb. Null at the top. */
export function progressToNextRung(state: MasteryState): { filled: number; needed: number } | null {
  if (state.level >= MASTERY_MAX) return null;
  return { filled: state.recentResults.slice(-UP_WINDOW).filter(Boolean).length, needed: UP_NEED };
}

const LABELS = ["Just starting", "Warming up", "Getting stronger", "Nearly there", "Mastered"];

export function masteryLabel(level: number): string {
  return LABELS[Math.min(MASTERY_MAX, Math.max(0, Math.floor(level)))];
}

export function masteryChangeCopy(before: number, after: number, skillLabel: string): string | null {
  if (after > before) return `${skillLabel}: getting stronger`;
  if (after < before) return `${skillLabel}: we'll practice this more`;
  return null;
}

export function parseRecentResults(raw: string | null): boolean[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "boolean").slice(-HISTORY) : [];
  } catch {
    return [];
  }
}
