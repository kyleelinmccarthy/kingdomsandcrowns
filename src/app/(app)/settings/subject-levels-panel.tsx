"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { setSubjectOffset } from "@/lib/actions/learning-profile";
import {
  GRADES,
  effectiveGrade,
  gapLabel,
  gradeIndex,
  type Grade,
  type SubjectOffsets,
} from "@/lib/utils/grade-levels";

type Area = keyof SubjectOffsets;

/** Math; then an ELA heading over Reading and Language Arts; then Science. The label is
    "Language Arts" but the stored id stays "language" — nothing here renames the column. */
const GROUPS: { title: string | null; items: { area: Area; label: string }[] }[] = [
  { title: null, items: [{ area: "math", label: "Math" }] },
  {
    title: "ELA",
    items: [
      { area: "reading", label: "Reading" },
      { area: "language", label: "Language Arts" },
    ],
  },
  { title: null, items: [{ area: "science", label: "Science" }] },
];

/** A strand not at grade level starts one grade below, the common case; a parent can
    always move it from there with the picker that appears. */
const DEFAULT_OFFSET_ON = -1;

export function SubjectLevelsPanel({
  childId,
  childGrade,
  estimated,
  offsets,
}: {
  childId: string;
  childGrade: Grade;
  estimated: boolean;
  offsets: SubjectOffsets;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const save = (area: Area, offset: number) => run(() => setSubjectOffset(childId, area, offset));

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Subject Levels</h4>
      {estimated && (
        <p className="text-xs text-muted-foreground">
          Estimated grade {childGrade} from age. Add a grade below to set it exactly.
        </p>
      )}
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      {GROUPS.map((group) => (
        <div key={group.title ?? group.items[0].area} className="space-y-2">
          {group.title && (
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          )}
          <div className={group.title ? "space-y-2 rounded-lg border border-gold-dim bg-muted/30 p-2" : ""}>
            {group.items.map(({ area, label }) => {
              const offset = offsets[area];
              const notAtGrade = offset !== 0;
              return (
                <div
                  key={area}
                  className={
                    group.title
                      ? "space-y-2"
                      : "space-y-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{gapLabel(childGrade, offset)}</p>
                    </div>
                    <Switch
                      aria-label={`${label} is not at grade level`}
                      checked={notAtGrade}
                      disabled={busy}
                      onCheckedChange={() => save(area, notAtGrade ? 0 : DEFAULT_OFFSET_ON)}
                    />
                  </div>
                  {/* Also shown while a toggle-on save for ANY strand is in flight: the offset
                      isn't persisted yet, so there is nothing in props to derive "on" from
                      until router.refresh() lands the real value. */}
                  {(notAtGrade || busy) && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">{label} level</span>
                      <Select
                        aria-label={`${label} level`}
                        className="w-24"
                        value={effectiveGrade(childGrade, offset)}
                        disabled={busy}
                        onChange={(e) =>
                          save(area, gradeIndex(e.target.value as Grade) - gradeIndex(childGrade))
                        }
                      >
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g === "K" ? "K" : g}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
