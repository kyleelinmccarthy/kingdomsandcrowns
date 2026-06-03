import { NextRequest, NextResponse } from "next/server";

const publicPaths = [
  "/login",
  "/signup",
  "/forgot-password",
  "/terms",
  "/privacy",
  "/api/auth",
  "/api/demo",
  "/play", // legacy kid login URL — redirects to /login?mode=kid
  "/child-setup", // child email set-password (tokenized)
  "/api/child-auth", // child auth endpoints
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static assets
  if (publicPaths.some((p) => pathname.startsWith(p)) || pathname === "/") {
    return NextResponse.next();
  }

  // Check for an auth session cookie — Better Auth (adult/email child) OR the
  // signed PIN child-session. Presence-only here; full verification happens
  // server-side in getActor(). A forged cookie passes here but fails getActor.
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("kc_child_session")?.value ||
    request.cookies.get("__Secure-kc_child_session")?.value;

  // In demo mode, allow all requests (session is mocked server-side)
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.next();
  }

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
