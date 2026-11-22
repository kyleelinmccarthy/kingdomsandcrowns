/**
 * When a player speaks by itself (R-H17). Pure and client-safe: the Realm's board, the Side Quests
 * page and the walk's tracker each ask here, so they cannot drift.
 *
 * A hero with read-aloud on hears every task. A Kindergarten hero hears every clue of a trail run
 * whatever read-aloud says: the server marks such a run (`RunStart.narrateClues`), and only a trail
 * task is narrated by it. A rune dictation (`view.listen`) is always heard, since its word is the
 * spoken prompt (R-I18). The read-aloud button is always there for the rest.
 */
import type { FlowState } from "@/lib/utils/deed-run-flow";
import type { ClientTask } from "./types";

/** Whether a task is a rune dictation, heard whatever read-aloud says (R-I18): only a rune's own `view.listen === true`. */
export function listens(task: { kind: string; view?: unknown }): boolean {
  if (task.kind !== "rune" || typeof task.view !== "object" || task.view === null) return false;
  return (task.view as { listen?: unknown }).listen === true;
}

/** Whether a task is spoken without being asked: `readAloud || (narrateClues && task.kind === "trail") || listens(task)`. */
export function autoSpeaks(task: Pick<ClientTask, "kind"> & { view?: unknown }, readAloud: boolean, narrateClues: boolean): boolean {
  return readAloud || (narrateClues && task.kind === "trail") || listens(task);
}

/**
 * The line a player says after an answer, when it speaks (`autoSpeaks`). A trail and a rune say their
 * whole feedback line (F-3): on a second chance the lead ("Not here.", "Not that word.") and the
 * redirect or hint, and on a miss where it was, or the word, and why. Every other kind says only its
 * hint on a second chance, as before, and nothing more once resolved. `feedbackText` is `attemptFeedback(...).text` for the same result.
 */
export function attemptSpeech(task: Pick<ClientTask, "kind"> | undefined, flow: Pick<FlowState, "phase" | "result">, feedbackText: string | undefined): string | undefined {
  if (!task || !flow.result) return undefined;
  if (task.kind === "trail" || task.kind === "rune") {
    const missed = flow.phase === "resolved" && !flow.result.correct;
    return flow.phase === "second-chance" || missed ? feedbackText : undefined;
  }
  return flow.phase === "second-chance" ? flow.result.hint : undefined;
}
