import { requireChildAccess, isChildActor } from "@/lib/auth/access";

/**
 * The gate both Realm page-hide beacons pass (`play/route.ts`, `troubles/route.ts`): the request
 * comes from this site's own page, and the actor is the hero themselves.
 */

/**
 * The body is plain text, which any site may POST without a preflight, so the request must come
 * from this site's own pages. Browsers send `Origin` on a POST, and `Sec-Fetch-Site` too.
 */
export function sameSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Only the hero themselves: a grown-up's visit, another hero or no session is refused, never thrown. */
export async function isHeroItself(childId: string): Promise<boolean> {
  try {
    const { access } = await requireChildAccess(childId, { write: true });
    return isChildActor(access);
  } catch {
    return false;
  }
}
