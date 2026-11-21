/**
 * The trail clues `/dev/content` shows (F-21): for every skill a trail pool credits (`trailPoolFor`,
 * so all five pools: `read-g1`, `read-g3` and `read-g4` as well as the trail-only `read-g6` and
 * `read-g9`, M3), one clue per level drawn from its pool. Server-only, like the pools: the page (a server component)
 * calls this and hands the result to the client reader, so a pool's answers never ride into the
 * browser's bundle. A skill no pool credits has no clues, and the page says so.
 *
 * Drawn from the page's fixed seeds, so a reload shows the same clues.
 */
import { anchorLabel } from "@/lib/realm/anchors";
import { drawTrailClues } from "@/lib/tasks/trails/draw";
import { trailPoolFor } from "@/lib/tasks/trails";
import { seededRng } from "@/lib/utils/drill-generators";
import { SKILLS } from "@/lib/utils/skills";
import { LEVELS, seedFor, type SampledTrailClue } from "./sample";

const NONE: ReadonlySet<string> = new Set();

export function sampleTrails(): Record<string, SampledTrailClue[]> {
  const out: Record<string, SampledTrailClue[]> = {};
  for (const skill of SKILLS) {
    if (!trailPoolFor(skill.id)) continue;
    out[skill.id] = LEVELS.flatMap((level): SampledTrailClue[] => {
      const [task] = drawTrailClues(skill, level, 1, seededRng(seedFor(skill.id, level)), NONE, NONE);
      if (!task) return [];
      return [{ level, text: task.prompt, ...(task.readAloud ? { readAloud: task.readAloud } : {}), answerLabel: anchorLabel(task.answer), redirect: task.redirect, why: task.explain ?? "" }];
    });
  }
  return out;
}
