"use server";

import { eq } from "drizzle-orm";
import { getActor } from "@/lib/auth/actor";
import { getChildren } from "@/lib/actions/children";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Resolves which child to display data for.
 * - Child actor (PIN, email/Google, or demo child persona): forces their own
 *   child record and isChildView = true.
 * - Adult actor: uses selectedChildId from query, falls back to first child.
 *
 * Returns { child, allChildren, isChildView }
 */
export async function resolveActiveChild(selectedChildId?: string) {
  const actor = await getActor();

  if (actor?.kind === "child") {
    const rows = await db
      .select()
      .from(schema.child)
      .where(eq(schema.child.id, actor.childId))
      .limit(1);
    const child = rows[0] ?? null;
    return { child, allChildren: child ? [child] : [], isChildView: true };
  }

  // Adult view
  let allChildren;
  try {
    allChildren = await getChildren();
  } catch {
    // No family / no access yet
    return { child: null, allChildren: [], isChildView: false };
  }
  if (allChildren.length === 0) {
    return { child: null, allChildren: [], isChildView: false };
  }

  const child = selectedChildId
    ? allChildren.find((c) => c.id === selectedChildId) ?? allChildren[0]
    : allChildren[0];

  return { child, allChildren, isChildView: false };
}
