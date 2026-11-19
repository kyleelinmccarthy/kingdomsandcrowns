/**
 * One question's flow, as a pure reducer, so the Realm board and the page's player cannot drift:
 * ask, maybe a second chance, resolve. The server decides which (`AttemptResult.secondChance`);
 * this only follows it. The streak is kept here for the HUD to show later.
 */
import type { AttemptResult, RunStart } from "./deed-run-types";

export type FlowPhase = "asking" | "second-chance" | "resolved";
export type FlowState = {
  index: number;
  phase: FlowPhase;
  /** Picks the server has already marked wrong on this question. */
  ruledOut: string[];
  picked: string | null;
  result: AttemptResult | null;
  /** Right first tries in a row; a retry never changes it. */
  streak: number;
};
export type FlowEvent =
  | { type: "answered"; choice: string; result: AttemptResult }
  /** "Show me": the server revealed the answer without another pick. */
  | { type: "gave-up"; result: AttemptResult }
  | { type: "next" };
export type ChoiceTone = "plain" | "ruled-out" | "answer" | "picked-wrong" | "faded";

export function initialFlow(run: Pick<RunStart, "questions" | "responses" | "pending">): FlowState {
  if (run.pending) {
    const { index, ruledOut, hint } = run.pending;
    return { index, phase: "second-chance", ruledOut: [ruledOut], picked: ruledOut, result: { correct: false, secondChance: true, hint }, streak: 0 };
  }
  const first = run.responses.findIndex((r) => r === null);
  // A run with nothing left unanswered (its finish call failed, and it was picked back up) opens at
  // its finish step: the last question, resolved, with no result to show, so it is never asked again.
  if (first === -1 && run.questions.length > 0) {
    return { index: run.questions.length - 1, phase: "resolved", ruledOut: [], picked: null, result: null, streak: 0 };
  }
  return { index: Math.max(first, 0), phase: "asking", ruledOut: [], picked: null, result: null, streak: 0 };
}

/** What the finish step says when a run is picked back up with every question already answered. */
export const ALL_ANSWERED = "Every answer is in.";

/** Whether the run has nothing left to answer: its last question is resolved, so it can be finished. */
export function readyToFinish(state: FlowState, questions: number): boolean {
  return state.phase === "resolved" && state.index >= questions - 1;
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "answered": {
      const { choice, result } = event;
      const firstTry = state.phase === "asking";
      const streak = firstTry ? (result.correct ? state.streak + 1 : 0) : state.streak;
      // The server's stored first pick, not the choice sent: a late repeat must not rule out a new one.
      if (result.secondChance) {
        const ruled = result.firstPick ?? choice;
        return { ...state, phase: "second-chance", ruledOut: [...state.ruledOut, ruled], picked: ruled, result, streak };
      }
      return { ...state, phase: "resolved", picked: choice, result, streak };
    }
    case "gave-up":
      return { ...state, phase: "resolved", result: event.result };
    case "next":
      return { index: state.index + 1, phase: "asking", ruledOut: [], picked: null, result: null, streak: state.streak };
  }
}

export function choiceTone(state: FlowState, choice: string): ChoiceTone {
  if (state.phase === "asking") return "plain";
  if (state.phase === "second-chance") return state.ruledOut.includes(choice) ? "ruled-out" : "plain";
  if (choice === state.result?.answer) return "answer";
  // A first pick ruled out stays marked once resolved, whatever the retry did.
  if (state.ruledOut.includes(choice)) return "picked-wrong";
  return choice === state.picked && !state.result?.correct ? "picked-wrong" : "faded";
}
