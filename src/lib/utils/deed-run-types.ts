/**
 * What the deed actions hand the browser, in a plain module so the pure flow and copy modules
 * (and the components) can name these types without importing a "use server" file.
 */
import type { ClientTask, FeedbackCode } from "@/lib/tasks/registry";
import type { RunKind, Stars } from "./deed-scoring";
import type { ImprovementId } from "@/lib/realm/improvements";
import type { SkillMeter } from "./mastery";
import type { SkillArea } from "./skills";

export type RunStart = {
  runId: string; deed: { id: string; title: string; story: string; area: SkillArea | null }; questions: ClientTask[]; responses: (string | null)[];
  kind: RunKind;
  /** A resumed run left on a second chance: reopen there, the first pick ruled out and the hint shown. */
  pending: { index: number; ruledOut: string; hint: string } | null;
  /**
   * A side quest's building as the run begins, for the bench's drawing: its site stage
   * (`siteStage`), whether it is finished, and `placed`, how many of the run's bench tasks were
   * already put right (first try or second), so a run picked back up draws what it had laid. Only a
   * side quest's own run raises a building, so a review or a Crown Challenge has none.
   */
  site?: { stage: number; complete: boolean; placed: number };
  /**
   * A build run's plan: which improvement and which level it builds, and `placed`, how many of the
   * run's bench tasks were already put right (as `site.placed` is for a side quest), so a run picked
   * back up draws what it had laid. The bench draws the plan's own boxes (`PlanElevation`).
   */
  plan?: { improvementId: ImprovementId; level: number; placed: number };
  /**
   * Where "Watch Aldo" shows (R-C9): `at` is the index of the run's first bench task, for a young
   * hero who has never answered one. The board shows the demo, for that task's mode, when the run
   * reaches it. Absent otherwise, and absent once that task is answered. Holds only an index.
   */
  demo?: { at: number };
};
/**
 * `answer` and `explain` are present only once the question is resolved, so the answer never
 * reaches the browser while a try is still open. `hint` comes with an open second chance, and
 * with a resolved miss that has no explanation. `answer` is the right answer in words
 * (`answerText`). `feedback` is the task kind's coded note on the response just given; on a
 * repeated first answer, the stored first answer's note, and only while its second chance is open.
 * It is omitted when the code is "none" (multiple choice never sets it).
 */
export type AttemptResult = {
  correct: boolean; secondChance: boolean; answer?: string; explain?: string; hint?: string;
  /** With an open second chance: the first pick the server stored (the child's own, safe to send). */
  firstPick?: string;
  feedback?: FeedbackCode;
  /** The worked notation ("1/2 + 1/4 = 3/4"), only once a hands-on task resolves right; multiple choice has none. */
  bridge?: string;
  /**
   * Only on a first answer that moved mastery: where the skill's pips stand now. On a first answer,
   * absent or null means there are no pips to show (the skill is at the top, or nothing moved), so
   * the board clears its meter; a retry never carries one and the board keeps the last.
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
  /** Null for a run that raises nothing (a review run). */
  building: { label: string; done: number; total: number; complete: boolean; stars: number; maxStars: number } | null;
  /** Realm play minutes this run paid (`sideQuestPay`): 0 for a challenge, a starless run or a grown-up's run. */
  minutesEarned: number;
  /** The day's side-quest minutes are all earned, so the card can say so instead of "+0". */
  sideQuestPayFull: boolean;
};
