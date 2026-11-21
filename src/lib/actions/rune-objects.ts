"use server";

import { runeObjectById } from "@/lib/realm/rune-objects";
import { brokenNow } from "@/lib/realm/world-state";
import { NOT_IN_CHRONICLE, RUNE_HERO_ONLY, RUNES_OFF } from "@/lib/utils/deed-refusals";
import { RUNE_STORY, RUNE_TITLE } from "@/lib/tasks/rune-copy";
import { runeObjectRun, runeSkill } from "@/lib/utils/rune-run";
import type { ObjectRunStart } from "@/lib/utils/deed-run-types";
import { loadRecentRuneKeys } from "@/lib/services/deed-run-store";
import { refuseHeld, startObjectRun } from "@/lib/services/lock-runs";
import { loadWorldRows, worldClock } from "@/lib/services/realm-world-state";
import type { SkillArea } from "@/lib/utils/skills";

/** A rune's strand: its grade is the hero's in it, never named by hand (`strand-grade-access.test.ts`). */
const RUNE_AREA: SkillArea = "language";

/**
 * Starts the rune at a broken object, any time (R-I1): a `world` run of ONE word for the object's
 * effect, at the hero's language skill (`runeSkill`), named by the object (`sourceRef`), so a second
 * start picks it back up. It pays nothing and moves mastery (`RUN_EFFECTS.world`). The hero's alone,
 * refused while the grown-up has runes off (R-I13, even for an open run). While the object's rune
 * still holds (`brokenNow`, on the server's day in the family's zone, R-I3) it answers `{ held: true }`,
 * an expected answer and not an error, so nothing is logged (smoke I12). `objectId` crosses the
 * wire, so only a rune object's id is one: anything else is `NOT_IN_CHRONICLE` before anything is
 * read. The words met in the hero's last rune runs are drawn last (R-I19). Finishing it, and the
 * fix, is `completeDeedRun`'s locked finish.
 */
export async function startRuneObjectRun(childId: string, objectId: string): Promise<ObjectRunStart> {
  const object = runeObjectById(objectId);
  if (!object) throw new Error(NOT_IN_CHRONICLE);
  // Read in `check`, kept for `draw`: the same round the chest's check makes, plus the words met lately.
  let avoid: ReadonlySet<string> = new Set();
  return startObjectRun(childId, {
    kind: "world",
    sourceRef: object.id,
    mechanic: "rune",
    refusals: { heroOnly: RUNE_HERO_ONLY, off: RUNES_OFF },
    check: async () => {
      const [clock, rows, recent] = await Promise.all([worldClock(childId), loadWorldRows(childId), loadRecentRuneKeys(childId)]);
      const row = rows.find((r) => r.objectId === object.id) ?? null;
      if (!brokenNow(object, row, clock.today, clock.zone)) refuseHeld();
      avoid = new Set(recent);
    },
    pick: (hero, focusSkillIds) => {
      const skill = runeSkill(hero.grades[RUNE_AREA], focusSkillIds);
      return skill ? { skill, grade: skill.grades[0], boost: 0 } : null;
    },
    count: 1,
    draw: (input) => runeObjectRun({ ...input, object, avoid }),
    header: () => ({ id: object.id, title: RUNE_TITLE, story: RUNE_STORY, area: RUNE_AREA }),
    demo: true,
  });
}
