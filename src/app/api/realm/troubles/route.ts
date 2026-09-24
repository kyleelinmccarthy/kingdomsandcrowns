import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { awardTroubleClears } from "@/lib/services/realm-play";
import { parseClearBeacon } from "@/lib/utils/realm-clear-beacon";

/**
 * The troubles' page-hide beacon (`components/realm3d/use-trouble-bounty.ts`): clears still
 * waiting in the page's batch as the tab reloads or closes, when no React cleanup will run and
 * no server action can be sent. See `lib/utils/realm-clear-beacon.ts`.
 *
 * Exactly the gate and the checks of `recordTroubleClears`, then its award: only the hero
 * themselves (a grown-up's visit writes nothing, whatever a client sends), only today somewhere,
 * only home ids the game writes, and the same one transaction that decides what they are worth.
 * A beacon's answer is never read, so the statuses are for logs and tests only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  const beacon = parseClearBeacon(await request.text(), new Date());
  if (!beacon) return new Response(null, { status: 400 });

  let isHero = false;
  try {
    const { access } = await requireChildAccess(beacon.childId, { write: true });
    isHero = isChildActor(access);
  } catch {
    return new Response(null, { status: 403 });
  }
  if (!isHero) return new Response(null, { status: 403 });

  await awardTroubleClears(beacon.childId, beacon.date, beacon.homeIds);
  return new Response(null, { status: 204 });
}

/** The play beacon's same-site rule (`app/api/realm/play/route.ts`): a plain-text POST must come from this site's pages. */
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
