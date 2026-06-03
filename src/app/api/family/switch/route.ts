import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMemberships, ACTIVE_FAMILY_COOKIE } from "@/lib/auth/access";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { familyId } = await request.json();
  if (typeof familyId !== "string") {
    return NextResponse.json({ error: "Invalid family" }, { status: 400 });
  }

  const memberships = await getMemberships(session.user.id);
  if (!memberships.some((m) => m.familyId === familyId)) {
    return NextResponse.json({ error: "No access to that family" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_FAMILY_COOKIE, familyId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, familyId });
}
