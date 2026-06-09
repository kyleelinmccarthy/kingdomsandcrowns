import { cache } from "react";
import { headers, cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  getDemoPersona,
  isChildPersona,
  getChildIdForPersona,
} from "@/lib/auth/session";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/auth/child-session";

/**
 * The normalized principal for the current request.
 * - adult: a Better Auth user who is NOT linked to a child profile
 * - child: a PIN session, a Better Auth user linked to a child, or a demo child
 */
export type Actor =
  | { kind: "adult"; userId: string }
  | { kind: "child"; childId: string; familyId: string }
  | null;

function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

async function childActorById(childId: string): Promise<Actor> {
  const rows = await db
    .select({ id: schema.child.id, familyId: schema.child.familyId })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) return null;
  return { kind: "child", childId: rows[0].id, familyId: rows[0].familyId };
}

/**
 * Resolve the current actor. Resolution order (first match wins):
 *   1. DEMO_MODE persona
 *   2. valid PIN child-session cookie  (wins over a parent BA session so a kid
 *      can "take over" a shared device; cleared on Switch Hero / sign-out)
 *   3. Better Auth session → linked child profile ? child : adult
 *   4. null
 */
export const getActor = cache(async function getActor(): Promise<Actor> {
  // 1. Demo mode
  if (isDemoMode()) {
    const persona = await getDemoPersona();
    if (isChildPersona(persona)) {
      const childId = getChildIdForPersona(persona)!;
      return (await childActorById(childId)) ?? { kind: "child", childId, familyId: "demo-family" };
    }
    return { kind: "adult", userId: "demo-user" };
  }

  // 2. PIN child-session cookie
  const cookieStore = await cookies();
  const payload = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);
  if (payload) {
    const rows = await db
      .select({
        id: schema.child.id,
        familyId: schema.child.familyId,
        pinEnabled: schema.child.pinEnabled,
      })
      .from(schema.child)
      .where(eq(schema.child.id, payload.childId))
      .limit(1);
    if (rows[0] && rows[0].pinEnabled) {
      return { kind: "child", childId: rows[0].id, familyId: rows[0].familyId };
    }
  }

  // 3. Better Auth session
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const linked = await db
      .select({ id: schema.child.id, familyId: schema.child.familyId })
      .from(schema.child)
      .where(eq(schema.child.authUserId, session.user.id))
      .limit(1);
    if (linked[0]) {
      return { kind: "child", childId: linked[0].id, familyId: linked[0].familyId };
    }
    return { kind: "adult", userId: session.user.id };
  }

  // 4. Unauthenticated
  return null;
});

export async function requireActor(): Promise<NonNullable<Actor>> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  return actor;
}

export async function requireAdultActor(): Promise<{ kind: "adult"; userId: string }> {
  const actor = await requireActor();
  if (actor.kind !== "adult") {
    throw new Error("This action is for grown-ups.");
  }
  return actor;
}

export async function requireChildActor(): Promise<{
  kind: "child";
  childId: string;
  familyId: string;
}> {
  const actor = await requireActor();
  if (actor.kind !== "child") {
    throw new Error("This action is for heroes.");
  }
  return actor;
}
