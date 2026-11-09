import { chargeRealmPlay } from "@/lib/services/realm-play";
import { realmNow } from "@/lib/services/realm-clock";
import { parsePlayCharge } from "@/lib/utils/realm-play-charge";
import { isHeroItself, sameSite } from "../beacon-gate";

/**
 * The play clock's page-hide beacon (`components/realm/use-play-clock.ts`): the minute in
 * progress, charged as the tab closes or reloads, when no React cleanup will run and no server
 * action can be sent. See `lib/utils/realm-play-charge.ts`.
 *
 * Same gate as the server action, and stricter: only the hero themselves. A grown-up's visit is
 * never charged, whatever a client sends. The minute lands on the server's today (`realmNow`); a
 * date in the body is ignored. A beacon's answer is never read, so the statuses are for logs and
 * tests only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  const charge = parsePlayCharge(await request.text());
  if (!charge) return new Response(null, { status: 400 });

  // The day (the child's family timezone) is read beside the gate, so it adds no round trip.
  const [isHero, { date }] = await Promise.all([isHeroItself(charge.childId), realmNow(charge.childId)]);
  if (!isHero) return new Response(null, { status: 403 });

  await chargeRealmPlay(charge.childId, date, charge.minutes);
  return new Response(null, { status: 204 });
}
