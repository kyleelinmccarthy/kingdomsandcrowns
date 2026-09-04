export const MASTERY_MAX = 4;
const HISTORY = 10;

export type MasteryState = { level: number; recentResults: boolean[] };

/**
 * The ladder: seven of the last eight right climbs a rung, three of the last
 * six wrong steps down one. History clears on a step so a hero starts each
 * rung fresh. Low mastery never locks anything — it only picks easier work.
 */
export function recordResult(state: MasteryState, correct: boolean): MasteryState {
  const recent = [...state.recentResults, correct].slice(-HISTORY);
  const last8 = recent.slice(-8);
  const last6 = recent.slice(-6);
  const rightIn8 = last8.filter(Boolean).length;
  const wrongIn6 = last6.filter((r) => !r).length;
  if (last8.length === 8 && rightIn8 >= 7 && state.level < MASTERY_MAX) {
    return { level: state.level + 1, recentResults: [] };
  }
  if (last6.length === 6 && wrongIn6 >= 3 && state.level > 0) {
    return { level: state.level - 1, recentResults: [] };
  }
  return { level: state.level, recentResults: recent };
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
