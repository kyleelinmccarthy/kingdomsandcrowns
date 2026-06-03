import { NextRequest, NextResponse } from "next/server";
import { resolveFamilyForPinLogin, heroesForFamily } from "@/lib/auth/child-login";

export async function POST(request: NextRequest) {
  const { familyCode } = await request.json().catch(() => ({}));
  const familyId = await resolveFamilyForPinLogin(
    typeof familyCode === "string" ? familyCode : undefined
  );
  if (!familyId) {
    // Don't distinguish "bad code" from "no heroes" — just an empty list.
    return NextResponse.json({ heroes: [] });
  }
  const heroes = await heroesForFamily(familyId);
  return NextResponse.json({ heroes });
}
