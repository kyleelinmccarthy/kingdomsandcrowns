"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setFocusSkills } from "@/lib/actions/learning-focus";
import { FOCUS_MAX, type FocusOption } from "@/lib/utils/focus";
import { gradeName } from "@/lib/utils/seasons";
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";

export type { FocusOption };

const AREA_ORDER: SkillArea[] = ["math", "reading", "language", "science", "logic"];

/**
 * Beside a skill with no multiple choice, by the one way it is played: with that mechanic's switch
 * off (Reading trails, Rune spellcraft) it is never drawn.
 */
const FOCUS_ONLY_NOTES = { trail: "Played only as reading trails", rune: "Played only as rune spellcraft" } as const;

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * What each box in one area says. Several strands reuse a label across grades ("Spelling",
 * "Science facts", "Sight words", "Vocabulary"), and a window a grade either side can hold two of
 * them, so a label that repeats within the area names its grade; a unique one stays as it is.
 */
function boxLabels(skills: readonly FocusOption[]): Map<string, string> {
  const uses = new Map<string, number>();
  for (const s of skills) uses.set(s.label, (uses.get(s.label) ?? 0) + 1);
  return new Map(skills.map((s) => [s.id, (uses.get(s.label) ?? 0) > 1 ? `${s.label} (${gradeName(s.grade)})` : s.label]));
}

/**
 * A grown-up chooses up to three skills to lean on this month. The options are the ones inside
 * this hero's window (the server decides), so every box here is one the action will accept; the
 * action still judges the set on its own. Grown-up territory like the rest of the Hearth: the
 * page does not render this for a hero viewing their own chronicle.
 */
export function FocusSkillsPanel({
  childId,
  options,
  selected,
}: {
  childId: string;
  options: FocusOption[];
  selected: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(selected);
  const [saved, setSaved] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const full = picked.length >= FOCUS_MAX;
  const unchanged = sameSet(picked, saved);

  function toggle(id: string) {
    setDone(false);
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length >= FOCUS_MAX ? now : [...now, id]));
  }

  async function save() {
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await setFocusSkills(childId, picked);
      setSaved(picked);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const groups = AREA_ORDER.map((area) => {
    const skills = options.filter((o) => o.area === area);
    return { area, skills, labels: boxLabels(skills) };
  }).filter((g) => g.skills.length > 0);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Focus this month</h4>
      <p className="text-xs text-muted-foreground">
        Pick up to three skills you&apos;re teaching now. Side quests and riddle stones will bring them up more often.
      </p>
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {groups.map(({ area, skills, labels }) => (
        <div
          key={area}
          role="group"
          aria-label={AREA_LABELS[area].label}
          className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {AREA_LABELS[area].label}
          </p>
          {/* Logic feeds no side quest: say where a logic focus does show up. */}
          {area === "logic" && (
            <p className="mb-2 text-xs text-muted-foreground">Practiced in Puzzle practice and, soon, the Realm&apos;s locks.</p>
          )}
          <ul className="space-y-1.5">
            {skills.map((skill) => {
              const on = picked.includes(skill.id);
              const only = skill.trailOnly ? "trail" : skill.runeOnly ? "rune" : null;
              const note = only ? FOCUS_ONLY_NOTES[only] : undefined;
              const noteId = only ? `focus-${only}-${skill.id}` : undefined;
              return (
                <li key={skill.id} className="flex flex-wrap items-center gap-x-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy || (full && !on)}
                      onChange={() => toggle(skill.id)}
                      aria-describedby={noteId}
                    />
                    <span>{labels.get(skill.id)}</span>
                  </label>
                  {noteId && (
                    <span id={noteId} className="text-xs text-muted-foreground">
                      {note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={busy || unchanged} onClick={save}>
          {busy ? "Saving..." : "Save"}
        </Button>
        {full && <span className="text-xs text-muted-foreground">Three is the most.</span>}
        {done && (
          <span role="status" className="text-xs text-muted-foreground">
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}
