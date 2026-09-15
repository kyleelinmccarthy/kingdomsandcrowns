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

/** A strand not at grade level starts one grade below, never above: this app's standing
    rule is that a child is never handed harder work than their grade, so "one behind" is
    the safe direction if a parent flips the toggle and is pulled away before picking a
    grade. They land on "Grade N-1 · 1 behind" — always safe — and can move it either way
    from there. Do not change this to 0 or +1 without keeping that guarantee some other way. */
const DEFAULT_OFFSET_ON = -1;

export function SubjectLevelsPanel({
  childId,
  childGrade,
  estimated,
  offsets,
}: {
  childId: string;
  /** Null for a hero with neither a set grade nor a birth year to estimate from — there is
      nothing honest to show "at grade level" against, so the panel explains rather than guesses. */
  childGrade: Grade | null;
  estimated: boolean;
  offsets: SubjectOffsets;
}) {
  const router = useRouter();
  // Which single strand has a save in flight, not whether anything does — so one strand
  // saving never disables or reveals the picker on the other three (a parent turning Math
  // on should never see Reading, Language Arts, or Science flash open).
  const [savingArea, setSavingArea] = useState<Area | null>(null);
  const [error, setError] = useState("");

  async function run(area: Area, fn: () => Promise<void>) {
    setSavingArea(area);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setSavingArea(null);
    }
  }

  const save = (area: Area, offset: number) => run(area, () => setSubjectOffset(childId, area, offset));

  if (childGrade === null) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Subject Levels</h4>
        <p className="text-xs text-muted-foreground">
          Set a grade or birth year in Hero Details to unlock subject levels.
        </p>
      </div>
    );
  }

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
              const savingThis = savingArea === area;
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
                      disabled={savingThis}
                      onCheckedChange={() => save(area, notAtGrade ? 0 : DEFAULT_OFFSET_ON)}
                    />
                  </div>
                  {/* Also shown while THIS strand's toggle-on save is in flight: the offset
                      isn't persisted yet, so there is nothing in props to derive "on" from
                      until router.refresh() lands the real value. Gated on savingThis, not on
                      "any save in flight", so the other three strands never flash open. */}
                  {(notAtGrade || savingThis) && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">{label} level</span>
                      <Select
                        aria-label={`${label} level`}
                        className="w-24"
                        value={effectiveGrade(childGrade, offset)}
                        disabled={savingThis}
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
