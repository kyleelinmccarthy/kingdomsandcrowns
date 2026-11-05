/**
 * What the deed actions hand the browser, in a plain module so the pure flow and copy modules
 * (and the components) can name these types without importing a "use server" file.
 */
import type { ClientQuestion } from "./deed-engine";
import type { RunKind, Stars } from "./deed-scoring";
import type { SkillMeter } from "./mastery";
import type { SkillArea } from "./skills";

export type RunStart = {
  runId: string; deed: { id: string; title: string; story: string; area: SkillArea }; questions: ClientQuestion[]; responses: (string | null)[];
  kind: RunKind;
  /** A resumed run left on a second chance: reopen there, the first pick ruled out and the hint shown. */
  pending: { index: number; ruledOut: string; hint: string } | null;
};
/**
 * `answer` and `explain` are present only once the question is resolved, so the answer never
 * reaches the browser while a try is still open. `hint` comes with an open second chance, and
 * with a resolved miss that has no explanation.
 */
export type AttemptResult = {
  correct: boolean; secondChance: boolean; answer?: string; explain?: string; hint?: string;
  /** With an open second chance: the first pick the server stored (the child's own, safe to send). */
  firstPick?: string;
  /**
   * Only on a first answer that moved mastery: where the skill's pips stand now. Absent or null
   * means "no news" to the board (it keeps the last meter) — except with `rungChange`, where null
   * means the skill just reached the top and there is nothing left to fill.
   */
  meter?: SkillMeter | null;
  /** Set only on a promotion; a step down is never said mid-run (the summary handles it gently). */
  rungChange?: string | null;
};
export type RunSummary = {
  correctCount: number; total: number; flawless: boolean; masteryChanges: string[];
  stars: Stars; previousBest: Stars;
  /** The best stars on this side quest after this run. */
  deedBest: Stars;
  /** Whether this run raised its building: a starless run teaches but does not build. */
  counted: boolean;
  /** Whether the side quest holds its crown after this run: a flawless Crown Challenge earns it. */
  crowned: boolean;
  kind: RunKind;
  building: { label: string; done: number; total: number; complete: boolean; stars: number; maxStars: number };
};
