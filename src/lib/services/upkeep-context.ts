import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isUpkeepEnabled } from "@/lib/utils/upkeep-enabled";
import { resolveRequiresApproval } from "@/lib/utils/upkeep-approval";

export type UpkeepContext = {
  childId: string;
  familyId: string;
  /** Both toggles agree the module is on for this hero. */
  enabled: boolean;
  /**
   * Whether this hero's completion waits for a grown-up to confirm — the
   * family default, unless this hero carries an override. Already resolved,
   * so callers never re-derive it.
   */
  requiresApproval: boolean;
  /** The family default on its own, for settings copy that explains "Inherit". */
  familyRequiresApproval: boolean;
  /** This hero's override as stored; null means inherit. */
  childRequiresApproval: boolean | null;
};

/**
 * Reads both upkeep toggles in one round-trip. Returns null when the child
 * does not exist. Callers must have authorized the child already — this does
 * no access checking of its own.
 *
 * Memoized per request — this runs on every /quests, /scrolls and /loot
 * render for every family (enabled or not), and twice on /quests since
 * generateUpkeepAssignments calls it again. Wrapped exactly as getActor /
 * getMemberships are in src/lib/auth/access.ts.
 */
export const loadUpkeepContext = cache(async function loadUpkeepContext(
  childId: string
): Promise<UpkeepContext | null> {
  const rows = await db
    .select({
      childId: schema.child.id,
      familyId: schema.child.familyId,
      childEnabled: schema.child.upkeepEnabled,
      familyEnabled: schema.family.upkeepEnabled,
      requiresApproval: schema.family.upkeepRequiresApproval,
      childRequiresApproval: schema.child.upkeepRequiresApproval,
    })
    .from(schema.child)
    .innerJoin(schema.family, eq(schema.child.familyId, schema.family.id))
    .where(eq(schema.child.id, childId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    childId: row.childId,
    familyId: row.familyId,
    enabled: isUpkeepEnabled(
      { upkeepEnabled: row.familyEnabled },
      { upkeepEnabled: row.childEnabled }
    ),
    requiresApproval: resolveRequiresApproval(row.requiresApproval, row.childRequiresApproval),
    familyRequiresApproval: row.requiresApproval,
    childRequiresApproval: row.childRequiresApproval,
  };
});

/**
 * Gate every upkeep mutation goes through. A stale client — a tab left open
 * after a parent turned the module off — must not be able to write chore rows
 * into a family that has it disabled.
 */
export async function assertUpkeepEnabled(childId: string): Promise<UpkeepContext> {
  const context = await loadUpkeepContext(childId);
  if (!context?.enabled) {
    throw new Error("Upkeep is not enabled for this hero.");
  }
  return context;
}
