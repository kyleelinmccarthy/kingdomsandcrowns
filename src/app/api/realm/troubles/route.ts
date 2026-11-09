import { awardTroubleClears } from "@/lib/services/realm-play";
import { realmNow } from "@/lib/services/realm-clock";
import { parseClearBeacon } from "@/lib/utils/realm-clear-beacon";
import { isHeroItself, sameSite } from "../beacon-gate";

/**
 * The troubles' page-hide beacon (`components/realm3d/use-trouble-bounty.ts`): clears still
 * waiting in the page's batch as the tab reloads or closes, when no React cleanup will run and
 * no server action can be sent. See `lib/utils/realm-clear-beacon.ts`.
 *
 * Exactly the gate and the checks of `recordTroubleClears`, then its award: only the hero
 * themselves (a grown-up's visit writes nothing, whatever a client sends), only the server's
 * today (`realmNow`; a date in the body is ignored), only home ids the game writes, and the same
 * one transaction that decides what they are worth. A beacon's answer is never read, so the
 * statuses are for logs and tests only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  const beacon = parseClearBeacon(await request.text());
  if (!beacon) return new Response(null, { status: 400 });

  // The day (the child's family timezone) is read beside the gate, so it adds no round trip.
  const [isHero, { date }] = await Promise.all([isHeroItself(beacon.childId), realmNow(beacon.childId)]);
  if (!isHero) return new Response(null, { status: 403 });

  await awardTroubleClears(beacon.childId, date, beacon.homeIds);
  return new Response(null, { status: 204 });
}
