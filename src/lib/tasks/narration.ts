/**
 * When a player speaks by itself (R-H17). Pure and client-safe: the Realm's board, the Side Quests
 * page and the walk's tracker each ask here, so they cannot drift.
 *
 * A hero with read-aloud on hears every task. A Kindergarten hero hears every clue of a trail run
 * whatever read-aloud says: the server marks such a run (`RunStart.narrateClues`), and only a trail
 * task is narrated by it. The read-aloud button is always there for the rest.
 */
import type { FlowState } from "@/lib/utils/deed-run-flow";
import type { ClientTask } from "./types";

/** Whether a task is spoken without being asked: `readAloud || (narrateClues && task.kind === "trail")`. */
export function autoSpeaks(task: Pick<ClientTask, "kind">, readAloud: boolean, narrateClues: boolean): boolean {
  return readAloud || (narrateClues && task.kind === "trail");
}

/**
 * The line a player says after an answer, when it speaks (`autoSpeaks`). A trail says its whole
 * feedback line (F-3): on a second chance "Not here." and the chosen place's redirect, and on a miss
 * where it was and why. Every other kind says only its hint on a second chance, as before, and
 * nothing more once resolved. `feedbackText` is `attemptFeedback(...).text` for the same result.
 */
export function attemptSpeech(task: Pick<ClientTask, "kind"> | undefined, flow: Pick<FlowState, "phase" | "result">, feedbackText: string | undefined): string | undefined {
  if (!task || !flow.result) return undefined;
  if (task.kind === "trail") {
    const missed = flow.phase === "resolved" && !flow.result.correct;
    return flow.phase === "second-chance" || missed ? feedbackText : undefined;
  }
  return flow.phase === "second-chance" ? flow.result.hint : undefined;
}
