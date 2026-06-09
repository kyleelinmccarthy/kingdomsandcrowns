import { cache } from "react";
import { headers, cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export type DemoPersona = "parent" | "lily" | "lucas";

const demoPersonas: Record<DemoPersona, Session> = {
  parent: {
    session: {
      id: "demo-session",
      userId: "demo-user",
      token: "demo-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: "127.0.0.1",
      userAgent: "demo",
    },
    user: {
      id: "demo-user",
      name: "Demo User - Parent",
      email: "demo@kingdomsandcrowns.local",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  lily: {
    session: {
      id: "demo-session-lily",
      userId: "demo-child-1",
      token: "demo-token-lily",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: "127.0.0.1",
      userAgent: "demo",
    },
    user: {
      id: "demo-child-1",
      name: "Demo User - Lily",
      email: "lily@kingdomsandcrowns.local",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  lucas: {
    session: {
      id: "demo-session-lucas",
      userId: "demo-child-2",
      token: "demo-token-lucas",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: "127.0.0.1",
      userAgent: "demo",
    },
    user: {
      id: "demo-child-2",
      name: "Demo User - Lucas",
      email: "lucas@kingdomsandcrowns.local",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
};

function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

export async function getDemoPersona(): Promise<DemoPersona> {
  const cookieStore = await cookies();
  const val = cookieStore.get("demo_persona")?.value;
  if (val === "lily" || val === "lucas") return val;
  return "parent";
}

export function isChildPersona(persona: DemoPersona): boolean {
  return persona === "lily" || persona === "lucas";
}

export function getChildIdForPersona(persona: DemoPersona): string | null {
  if (persona === "lily") return "demo-child-1";
  if (persona === "lucas") return "demo-child-2";
  return null;
}

/**
 * In demo mode, always returns the parent user ID regardless of active persona.
 * Family/child actions should use this instead of session.user.id so that
 * child personas still resolve to the parent's family.
 */
export async function requireParentUserId(): Promise<string> {
  if (isDemoMode()) return "demo-user";
  const session = await requireSession();
  // A child-linked account is not a parent.
  const linked = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(eq(schema.child.authUserId, session.user.id))
    .limit(1);
  if (linked[0]) throw new Error("This action is for grown-ups.");
  return session.user.id;
}

// Memoized per request: getSession is consulted by the layout, the page, and
// every access gate. cache() collapses those into a single resolution per
// render instead of one remote round-trip per caller.
export const getSession = cache(async function getSession() {
  if (isDemoMode()) {
    const persona = await getDemoPersona();
    return demoPersonas[persona];
  }
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
});

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
