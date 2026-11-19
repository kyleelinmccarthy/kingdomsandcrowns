"use client";

/**
 * The server calls around one run's questions, wired to `flowReducer`: answer, retry,
 * show me, and the skill meter they last reported. Both the Realm board and the page's player use it,
 * so a second chance behaves the same.
 */
import { useReducer, useRef, useState } from "react";
import { answerDeedQuestion, resolveDeedQuestion, retryDeedQuestion } from "@/lib/actions/deeds";
import type { ImprovementId } from "@/lib/realm/improvements";
import type { AttemptResult, RunStart } from "@/lib/utils/deed-run-types";
import { flowReducer, initialFlow, readyToFinish, type FlowEvent } from "@/lib/utils/deed-run-flow";
import { deedErrorLine } from "@/lib/utils/deed-refusals";
import type { SkillMeter } from "@/lib/utils/mastery";
import { NUDGE_LINE, shouldNudge } from "@/lib/tasks/pace-guard";
import { hintFor } from "@/lib/utils/skill-hints";

/** The pace guard's gentle word and clue, shown above the work surface. */
export type Nudge = { line: string; hint: string };

/**
 * The run's site as the bench draws it: where the building stood, how many of the run's bench tasks
 * are solved so far, and how many it has (the stage is paced over them, `piecesLaid`). A build run
 * carries its `plan` instead of a building's stage: the bench then draws that level's own boxes
 * (`PlanElevation`), and `stage` and `complete` are unused.
 */
export type BenchSite = {
  stage: number; complete: boolean; solved: number; benchTasks: number;
  plan?: { improvementId: ImprovementId; level: number };
};

/**
 * `now` is the pace guard's clock (the browser's, by default). Its times stay in this hook:
 * they are never sent to the server or kept against the child.
 */
export function useDeedFlow(run: RunStart, onAttempt?: (result: AttemptResult) => void, now: () => number = Date.now) {
  const [flow, dispatch] = useReducer(flowReducer, run, initialFlow);
  // The flow as of the last event, kept in step synchronously: a key pressed after a call returns
  // but before React re-renders still reads the phase that call left, never a stale closure's.
  const current = useRef(flow);
  function send(event: FlowEvent) {
    current.current = flowReducer(current.current, event);
    dispatch(event);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meter, setMeter] = useState<SkillMeter | null>(null);
  const inFlight = useRef(false);
  // First answers only (a retry is a second chance, not a guess), for the pace guard.
  const history = useRef<{ at: number; correct: boolean }[]>([]);
  const [nudgeUp, setNudgeUp] = useState(false);
  // Bench tasks solved so far, first try or second: a run picked back up starts from the server's count.
  const [solved, setSolved] = useState(() => run.site?.placed ?? run.plan?.placed ?? 0);

  /** One server call at a time; a refusal is said in one child-safe line and changes nothing. */
  async function guarded(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(deedErrorLine(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  /** Three fast wrong first answers earn a nudge once; a right first answer takes it down. */
  function trackPace(at: number, correct: boolean) {
    if (correct) setNudgeUp(false);
    history.current.push({ at, correct });
    if (shouldNudge(history.current)) {
      history.current = [];
      setNudgeUp(true);
    }
  }

  /** The first try goes to `answerDeedQuestion`, a second try only ever to `retryDeedQuestion`. */
  function choose(choice: string) {
    const { phase, index, ruledOut } = current.current;
    if (phase === "resolved" || ruledOut.includes(choice)) return Promise.resolve();
    const call = phase === "second-chance" ? retryDeedQuestion : answerDeedQuestion;
    const askedAt = now();
    return guarded(async () => {
      const result = await call(run.runId, index, choice);
      send({ type: "answered", choice, result });
      if (result.correct && run.questions[index]?.kind === "measure") setSolved((n) => n + 1);
      // A first answer always says where its skill stands: no meter means a skill already at the
      // top (or a challenge), so the last skill's pips go. A retry brings none and leaves them up.
      if (phase === "asking") {
        setMeter(result.meter ?? null);
        trackPace(askedAt, result.correct);
      }
      onAttempt?.(result);
    });
  }

  function showMe() {
    const { phase, index } = current.current;
    if (phase !== "second-chance") return Promise.resolve();
    return guarded(async () => send({ type: "gave-up", result: await resolveDeedQuestion(run.runId, index) }));
  }

  // The run is over once its last question is resolved: the nudge goes with it.
  const finished = readyToFinish(flow, run.questions.length);
  // The clue is for the question on the board now, not the one that earned the nudge.
  const skillId = run.questions[flow.index]?.skillId;
  const nudge: Nudge | null = nudgeUp && !finished && skillId ? { line: NUDGE_LINE, hint: hintFor(skillId) } : null;
  // Only a side quest's own run has a site (`RunStart.site`) and only a build run a plan (`RunStart.plan`);
  // the bench draws either paced over the run's bench tasks.
  const benchTasks = run.questions.filter((q) => q.kind === "measure").length;
  const site: BenchSite | undefined = run.site
    ? { stage: run.site.stage, complete: run.site.complete, solved, benchTasks }
    : run.plan
      ? { stage: 0, complete: false, solved, benchTasks, plan: { improvementId: run.plan.improvementId, level: run.plan.level } }
      : undefined;
  return { flow, meter, nudge, site, busy, error, setError, guarded, choose, showMe, next: () => send({ type: "next" }) };
}
