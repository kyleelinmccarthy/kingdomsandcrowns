"use server";

import { revalidatePath } from "next/cache";
import { requireAssignmentAccess, isChildActor } from "@/lib/auth/access";
import { FINISHED_ONLY, isAssignmentCompleted, sealFor, writeSeal } from "@/lib/services/chronicle-seals";
import { parseSealInput, SEAL_REFUSED } from "@/lib/utils/seals";

const GROWN_UP_ONLY = "Only a grown-up can seal a page of the Chronicle.";

/** The gates both actions share: a grown-up, and a finished quest. Returns the acting user. */
async function requireSealer(assignmentId: string): Promise<string> {
  const { access } = await requireAssignmentAccess(assignmentId, { write: true });
  if (isChildActor(access)) throw new Error(GROWN_UP_ONLY);
  if (!(await isAssignmentCompleted(assignmentId))) throw new Error(FINISHED_ONLY);
  return access.userId;
}

function refreshPages() {
  revalidatePath("/quests");
  revalidatePath("/tavern");
}

/**
 * A grown-up presses a seal of praise on a finished quest: one of the six phrases, or a short
 * note. Informational, never a reward. A hero cannot, and the input is validated here, not
 * trusted from the client.
 */
export async function sealEntry(assignmentId: string, input: unknown): Promise<void> {
  const userId = await requireSealer(assignmentId);
  const seal = parseSealInput(input);
  if (!seal) throw new Error(SEAL_REFUSED);
  await writeSeal(assignmentId, await sealFor(seal, userId));
  refreshPages();
}

/** A grown-up lifts the seal from a finished quest. */
export async function unsealEntry(assignmentId: string): Promise<void> {
  await requireSealer(assignmentId);
  await writeSeal(assignmentId, null);
  refreshPages();
}
