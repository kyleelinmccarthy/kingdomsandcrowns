/**
 * One question's flow, as a pure reducer, so the Realm board and the page's player cannot drift:
 * ask, maybe a second chance, resolve. The server decides which (`AttemptResult.secondChance`);
 * this only follows it. The streak is kept here for the HUD to show later.
 */
import type { AttemptResult, RunStart } from "@/lib/actions/deeds";

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
  // A run with nothing left unanswered opens on its last question.
  const first = run.responses.findIndex((r) => r === null);
  return { index: first === -1 ? run.questions.length - 1 : first, phase: "asking", ruledOut: [], picked: null, result: null, streak: 0 };
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "answered": {
      const { choice, result } = event;
      const firstTry = state.phase === "asking";
      const streak = firstTry ? (result.correct ? state.streak + 1 : 0) : state.streak;
      if (result.secondChance) return { ...state, phase: "second-chance", ruledOut: [...state.ruledOut, choice], picked: choice, result, streak };
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
  return choice === state.picked && !state.result?.correct ? "picked-wrong" : "faded";
}
