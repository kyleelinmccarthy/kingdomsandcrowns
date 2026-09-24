"use server";

import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { loadRecessRecord, saveRecessRecord } from "@/lib/services/recess";
import { mergeRecess, validateRecessResult, type MergeOutcome, type RecessRecord, type RecessResult } from "@/lib/realm/recess/record";
import { minLapMs, ringCourse } from "@/lib/realm3d/recess/course";

/**
 * The Ring's record: a hero's lifetime gleams, laps and bests. Anyone who may see the hero may
 * read it — the hero, and a visiting grown-up, who sees it at the arch.
 */
export async function getRecessRecord(childId: string): Promise<RecessRecord> {
  await requireChildAccess(childId);
  return loadRecessRecord(childId);
}

/**
 * A run's gleams, and a finished lap if there is one, added to the hero's record. Answers with the
 * merged record and whether the lap was a best, which the client takes as the truth.
 *
 *   - only the hero themselves: a visiting grown-up's walk writes nothing of the child's;
 *   - only a result a child could have run, against the course rebuilt here (never the client's);
 *   - it writes `realm_recess_record` and NOTHING ELSE. Gleams are not minutes (D12.1): no ledger
 *     row, and a test counts the ledger to prove it.
 */
export async function recordRecessResult(childId: string, result: RecessResult): Promise<MergeOutcome> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error("Only the hero runs the Ring in their own Realm.");
  const course = ringCourse();
  const refused = validateRecessResult(result, { id: course.id, minLapMs: minLapMs(course) });
  if (refused) throw new Error(refused);
  const record = await loadRecessRecord(childId);
  const outcome = mergeRecess(record, { gleams: result.gleams, lapMs: result.lapMs, mounted: result.mounted, courseId: result.courseId }, new Date());
  await saveRecessRecord(childId, outcome.record);
  return outcome;
}
