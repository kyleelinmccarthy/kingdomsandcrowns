import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { chargeRealmPlay } from "@/lib/services/realm-play";
import { parsePlayCharge } from "@/lib/utils/realm-play-charge";

/**
 * The play clock's page-hide beacon (`components/realm/use-play-clock.ts`): the minute in
 * progress, charged as the tab closes or reloads, when no React cleanup will run and no server
 * action can be sent. See `lib/utils/realm-play-charge.ts`.
 *
 * Same gate as the server action, and stricter: only the hero themselves. A grown-up's visit is
 * never charged, whatever a client sends. A beacon's answer is never read, so the statuses are
 * for logs and tests only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  const charge = parsePlayCharge(await request.text());
  if (!charge) return new Response(null, { status: 400 });

  let isHero = false;
  try {
    const { access } = await requireChildAccess(charge.childId, { write: true });
    isHero = isChildActor(access);
  } catch {
    return new Response(null, { status: 403 });
  }
  if (!isHero) return new Response(null, { status: 403 });

  await chargeRealmPlay(charge.childId, charge.date, charge.minutes);
  return new Response(null, { status: 204 });
}

/**
 * The body is plain text, which any site may POST without a preflight, so the request must come
 * from this site's own pages. Browsers send `Origin` on a POST, and `Sec-Fetch-Site` too.
 */
function sameSite(request: Request): boolean {
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
