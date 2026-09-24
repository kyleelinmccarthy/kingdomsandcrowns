import { notFound } from "next/navigation";
import { RecessTavernCardView, type HeroRing } from "@/components/realm/recess-tavern-card";
import { emptyRecessRecord, type RecessRecord } from "@/lib/realm/recess/record";

/**
 * Dev-only: the Ring's Tavern card (`components/realm/recess-tavern-card.tsx`) on its own, in each
 * of its states, for a look before it is mounted on `/tavern`. Like `/dev/sound`, it does not exist
 * in production. The records are made up here; the card itself reads real ones.
 */
const rec = (o: Partial<RecessRecord>): RecessRecord => ({ ...emptyRecessRecord("island-ring-1"), ...o });

const FAMILY: HeroRing[] = [
  { id: "emma", name: "Emma", record: rec({ totalGleams: 147, laps: 9, bestLapMs: 38400, bestMountedLapMs: 24100 }), failed: false },
  { id: "noah", name: "Noah", record: rec({ totalGleams: 31, laps: 2, bestMountedLapMs: 26800 }), failed: false },
];

export default function DevRingCardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-2">
      <RecessTavernCardView rings={FAMILY} />
      <RecessTavernCardView rings={FAMILY.slice(0, 1)} />
      <RecessTavernCardView rings={[{ id: "emma", name: "Emma", record: rec({}), failed: false }]} />
      <RecessTavernCardView rings={[{ id: "emma", name: "Emma", record: null, failed: true }]} />
    </div>
  );
}
