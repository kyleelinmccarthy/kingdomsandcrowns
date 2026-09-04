import type { MasteryRow } from "@/lib/actions/deeds";

const AREA_LABELS: Record<string, string> = { math: "Math", reading: "Reading", language: "Language", science: "Science" };

export function MasteryPanel({ mastery }: { mastery: MasteryRow[] }) {
  const areas = ["math", "reading", "language", "science"].filter((a) => mastery.some((m) => m.area === a));
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Deeds &amp; Mastery</h4>
      <p className="text-xs text-muted-foreground">
        Deeds are practice inside the Realm. They never appear in the learning log or count as school time.
      </p>
      {mastery.length === 0 ? (
        <p className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">No deeds yet.</p>
      ) : (
        areas.map((area) => (
          <div key={area} className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{AREA_LABELS[area]}</p>
            <ul className="space-y-1 text-sm">
              {mastery.filter((m) => m.area === area).map((m) => (
                <li key={m.skillId} className="flex justify-between gap-2">
                  <span>{m.label}</span>
                  <span className="text-muted-foreground">{m.levelLabel}{m.lastPracticedAt ? ` · ${new Date(m.lastPracticedAt).toLocaleDateString()}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
