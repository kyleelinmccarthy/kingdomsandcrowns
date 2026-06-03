import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { verifyPin } from "@/lib/utils/pin";
import {
  CHILD_SESSION_COOKIE,
  CHILD_SESSION_MAX_AGE_MS,
  signChildSession,
} from "@/lib/auth/child-session";
import {
  isLockedOut,
  recordPinFailure,
  clearPinAttempts,
} from "@/lib/auth/child-login";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

const GENERIC_ERROR = "That PIN didn't work. Try again.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const childId = typeof body.childId === "string" ? body.childId : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!childId || !pin) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const ip = await clientIp();
  if (await isLockedOut(childId, ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const rows = await db
    .select({
      id: schema.child.id,
      familyId: schema.child.familyId,
      pinHash: schema.child.pinHash,
      pinEnabled: schema.child.pinEnabled,
    })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];

  const ok =
    child && child.pinEnabled && child.pinHash
      ? await verifyPin(pin, child.pinHash)
      : false;

  if (!ok || !child) {
    await recordPinFailure(childId, ip);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await clearPinAttempts(childId, ip);

  const cookieStore = await cookies();
  cookieStore.set(
    CHILD_SESSION_COOKIE,
    signChildSession({ childId: child.id, familyId: child.familyId, iat: Date.now() }),
    {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(CHILD_SESSION_MAX_AGE_MS / 1000),
    }
  );

  return NextResponse.json({ ok: true });
}
