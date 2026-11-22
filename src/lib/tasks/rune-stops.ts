/**
 * The stops of a rune walk (slice 6, R-I2, R-I22): the objects a rune side quest's tasks were bound
 * to at its start, in order, and what E at one of them means while the walk is on. Pure and
 * client-safe: the villager's board names them on Set off, the walk's tracker lists them, and the
 * frame routes E by them, so all three read one rule.
 */
import { runeObjectById } from "@/lib/realm/rune-objects";
import type { ClientTask } from "./types";

export type RuneStop = { id: string; label: string };

/**
 * Every rune task's bound object, in order, as the run was told it (`{ id, label }`). A task with no
 * object, one whose object has left the catalog, and a task of another kind are passed over
 * (RI-a / N5), so the list can be shorter than the run.
 */
export function runeStops(run: { questions: readonly ClientTask[] }): RuneStop[] {
  const stops: RuneStop[] = [];
  for (const q of run.questions) {
    if (q.kind !== "rune") continue;
    const object = q.view.object;
    if (object && runeObjectById(object.id)) stops.push({ id: object.id, label: object.label });
  }
  return stops;
}

/** A run the rune walk can take: at least one task, and every task a rune with a stop (RI-a / N5). */
export const isRuneWalk = (run: { questions: readonly ClientTask[] }): boolean =>
  run.questions.length > 0 && runeStops(run).length === run.questions.length;

/**
 * What E at object `id` is on a walk now at stop `at` (RI-a / S2):
 * - "current": the stop on now, mended or not (the stone stays open until Done, RI-a / B1);
 * - "later": a stop still ahead;
 * - "done": a stop mended on this walk;
 * - null: anything else, a passed stop that was missed included, so that object opens its own board.
 */
export function runeStopOf(stops: readonly { id: string }[], at: number, mended: readonly string[], id: string): "current" | "later" | "done" | null {
  if (stops[at]?.id === id) return "current";
  if (stops.some((s, i) => i > at && s.id === id)) return "later";
  if (mended.includes(id)) return "done";
  return null;
}
