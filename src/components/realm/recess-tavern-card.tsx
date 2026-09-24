import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { getRecessRecord } from "@/lib/actions/realm-recess";
import { jarCaption, lampLine, recessTavernLine } from "@/lib/realm/recess/copy";
import { hasAnyRecord, jarFillFor, lampsLitFor, type RecessRecord } from "@/lib/realm/recess/record";
import { LAMP_COUNT } from "@/lib/realm3d/recess/lamps";
import { RecessTavernRetry } from "./recess-tavern-retry";

/**
 * THE RING ON THE TAVERN — recess's card for `/tavern` (spec "recess that counts", §3.3): headed
 * "The Ring", "Gleams and lap times from the Realm.", and one sentence per hero who has a lap
 * (`recessTavernLine`), so a family board with two heroes reads as two sentences, never a table
 * that ranks siblings (§8: no leaderboard). A hero with gleams also gets their jar and how far
 * their light has got along the road.
 *
 * Self-contained: it is handed the heroes and reads each record itself (`getRecessRecord`, which
 * checks the viewer may see that hero). A record that fails to load leaves that hero out; if none
 * loads, the card says the records are resting and offers "Try again", and never claims a zero.
 *
 * Read-only for everyone: nothing here writes. Gleams are not minutes (D12.1).
 */

export type TavernHero = { id: string; displayName: string };
/** One hero's Ring as loaded: the record, or `failed` when it could not be read. */
export type HeroRing = { id: string; name: string; record: RecessRecord | null; failed: boolean };

export const RING_TITLE = "The Ring";
export const RING_SUB = "Gleams and lap times from the Realm.";
export const RING_EMPTY = "No laps run yet. The Ring starts at the arch in the Realm's village.";
export const RING_RESTING = "The Ring's records are resting.";

/** Every hero's record, read in parallel; one that fails is marked, never thrown. */
export async function loadHeroRings(heroes: readonly TavernHero[]): Promise<HeroRing[]> {
  return Promise.all(
    heroes.map(async (h) => {
      try {
        return { id: h.id, name: h.displayName, record: await getRecessRecord(h.id), failed: false };
      } catch {
        return { id: h.id, name: h.displayName, record: null, failed: true };
      }
    }),
  );
}

/** The card, for the heroes given (one on a hero's own Tavern, each of them on a family board). */
export async function RecessTavernCard({ heroes, className }: { heroes: readonly TavernHero[]; className?: string }) {
  const rings = await loadHeroRings(heroes);
  return <RecessTavernCardView rings={rings} className={className} />;
}

/** A small gleam jar, filling from the bottom. */
function Jar({ fill }: { fill: number }) {
  const f = Math.max(0, Math.min(1, fill));
  const h = f === 0 ? 0 : Math.max(1.2, 14 * f);
  return (
    <svg className="size-7 shrink-0 text-muted-foreground" viewBox="0 0 24 24" role="img" aria-label={f >= 1 ? "The jar is full." : "Gleam jar"}>
      <rect x="6.5" y={21 - h} width="11" height={h} rx="1.6" fill="var(--gold-bright)" />
      <path d="M8 3.5h8M8.5 3.5v3L6 9v11.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V9l-2.5-2.5v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** The card as drawn from records already read: what the tests render. */
export function RecessTavernCardView({ rings, className }: { rings: readonly HeroRing[]; className?: string }) {
  const resting = rings.length > 0 && rings.every((r) => r.failed);
  const shown = rings.filter((r) => !r.failed && hasAnyRecord(r.record));
  return (
    <GameFrame title={RING_TITLE} icon={<GameIcon name="trophy" className="size-4 text-[var(--gold-bright)]" />} className={className}>
      <p className="text-xs text-muted-foreground">{RING_SUB}</p>
      {resting ? (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span>{RING_RESTING}</span>
          <RecessTavernRetry />
        </div>
      ) : shown.length === 0 ? (
        <div className="py-3 text-center">
          <GameIcon name="journey" className="mx-auto size-7 text-[var(--gold-bright)]" />
          <p className="mt-2 text-sm text-muted-foreground">{RING_EMPTY}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {shown.map((r) => {
            const rec = r.record!;
            const sentence = recessTavernLine(r.name, rec);
            const lit = lampsLitFor(rec.totalGleams, LAMP_COUNT);
            return (
              <li key={r.id} className="flex items-start gap-3">
                <Jar fill={jarFillFor(rec.totalGleams)} />
                <div className="min-w-0">
                  {sentence && <p className="text-sm font-medium">{sentence}</p>}
                  <p className="text-xs text-muted-foreground">
                    {sentence ? "" : `${r.name} has no lap yet. `}
                    {rec.totalGleams === 1 ? "1 gleam" : `${rec.totalGleams} gleams`} in the jar · {lampLine(lit, LAMP_COUNT)}
                    {rec.totalGleams >= 1000 ? ` ${jarCaption(rec.totalGleams)}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GameFrame>
  );
}
