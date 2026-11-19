/**
 * THE PLAN BEACON (R-D10): while the plan the hero pinned is ready to build, the gold ! points at
 * the plans board in the keep yard instead of the next villager. Otherwise there is no plan goal,
 * and the frame's one `goal` memo falls back to `goalFor`.
 *
 * Its id is `plan:<improvementId>`, so it can never equal a villager id: the board's "waiting" and
 * the tutorial compare the goal's id with a villager's, and a plan goal simply never matches.
 * Pure: no `three`, no DOM.
 */

import { IMPROVEMENTS, planState } from "@/lib/realm/improvements";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { activePin, type Works } from "@/lib/realm/works-state";
import { NO_GOAL, type Goal } from "./guide";

export const PLAN_GOAL_PREFIX = "plan:";

/** What the pet calls the beacon's place when it leads the hero there. */
export const PLANS_BOARD_NAME = "the plans board";

export function planGoal(works: Pick<Works, "balance" | "built" | "pinned">, raised: ReadonlySet<string>): Goal {
  const pinned = activePin(works);
  if (!pinned) return NO_GOAL;
  const row = planState({ built: works.built, raised, balance: works.balance }).find((p) => p.id === pinned);
  if (row?.state !== "ready") return NO_GOAL;
  const { x, z } = KEEP_YARD.plansBoard;
  return { on: true, x, z, name: IMPROVEMENTS[row.id].label, id: `${PLAN_GOAL_PREFIX}${row.id}` };
}

export function isPlanGoal(goal: Pick<Goal, "on" | "id">): boolean {
  return goal.on && goal.id.startsWith(PLAN_GOAL_PREFIX);
}

/** What read-aloud says on entering while the beacon is on the plans board. */
export function planGoalSpeech(goal: Pick<Goal, "name">): string {
  return `Everything for the ${goal.name} is here. Go to the plans board to build it.`;
}
