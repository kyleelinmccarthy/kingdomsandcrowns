/**
 * A rune side quest of three stops, as the browser is sent it (I10's walk): each task the stub's
 * "mend" dictation (tiles d m a e n i, so m e n d casts `"r:1,3,4,0"`), bound to its own village
 * object. Shared by the walk's hook, tracker and frame tests.
 */
import { toClientTask } from "@/lib/tasks/registry";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { runeStub } from "./rune-stubs";

/** The walk's stops, in order. */
export const WALK_STOPS = [
  { id: "rune:west-wagon", label: "the broken wagon" },
  { id: "rune:lane-lantern", label: "the dark lantern" },
  { id: "rune:flower-bed", label: "the dry flower bed" },
] as const;

/** The stub's word built from its tray: m, e, n, d. */
export const MEND = "r:1,3,4,0";

export function runeWalkRun(over: Partial<RunStart> = {}): RunStart {
  const questions = WALK_STOPS.map((object, i) => toClientTask(runeStub({ id: `lang-gk:rune:0000000${i + 1}`, object: { ...object } })));
  return {
    runId: "r1",
    deed: { id: "mill-ledger", title: "The Mill Ledger", story: "The miller needs words.", area: "language" },
    questions,
    responses: questions.map(() => null),
    kind: "deed",
    pending: null,
    ...over,
  };
}

/** The walk's finish: three stars, every stop fixed, the well a step on. */
export const RUNE_WALK_SUMMARY: RunSummary = {
  correctCount: 3, total: 3, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed",
  building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 3, practice: false }, minutesEarned: 0, sideQuestPayFull: false,
  runes: WALK_STOPS.map((s) => ({ objectId: s.id, fixed: true })),
};
