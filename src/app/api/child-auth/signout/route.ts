import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CHILD_SESSION_COOKIE } from "@/lib/auth/child-session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(CHILD_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
