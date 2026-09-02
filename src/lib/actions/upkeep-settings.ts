"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, requireFamilyAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import { loadUpkeepContext } from "@/lib/services/upkeep-context";

/** Both toggles as they apply to one hero. Safe for a child to read. */
export async function getUpkeepSettings(childId: string) {
  await requireChildAccess(childId);
  return loadUpkeepContext(childId);
}

/** The family's master switch. */
export async function setFamilyUpkeepEnabled(enabled: boolean) {
  await requireAdultActor();
  const access = await requireFamilyAccess({ write: true });
  await db
    .update(schema.family)
    .set({ upkeepEnabled: enabled, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
}

/** Whether a hero's completion waits on a grown-up before wages post. */
export async function setFamilyUpkeepRequiresApproval(enabled: boolean) {
  await requireAdultActor();
  const access = await requireFamilyAccess({ write: true });
  await db
    .update(schema.family)
    .set({ upkeepRequiresApproval: enabled, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
}

/** Per-hero opt-out, under the family switch. */
export async function setChildUpkeepEnabled(childId: string, enabled: boolean) {
  await requireAdultActor();
  await requireChildAccess(childId, { write: true });
  await db
    .update(schema.child)
    .set({ upkeepEnabled: enabled, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}
