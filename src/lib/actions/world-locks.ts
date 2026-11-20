"use server";

import { worldObjectById } from "@/lib/realm/world-objects";
import { lockedNow } from "@/lib/realm/world-state";
import { NOT_IN_CHRONICLE, WORLD_HERO_ONLY, WORLD_LOCKS_OFF, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_STORY, CHEST_TITLE, DOOR_STORY, DOOR_TITLE } from "@/lib/utils/world-lock-copy";
import { worldLockSkill } from "@/lib/utils/world-lock-run";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { startLockRun } from "@/lib/services/lock-runs";
import { loadWorldRows, worldClock } from "@/lib/services/realm-world-state";

/**
 * Starts the lock on a chest or vault door (R-G3): a `world` run of ONE lock, named by the object
 * (`sourceRef`), so a second start picks it back up. The hero's alone, refused while the grown-up
 * has locks off (R-G7) and while the object still stands open (on the server's day, in the family's
 * zone). `objectId` crosses the wire, so only a catalog id is a lock; "practice" is not one. What it
 * draws is `worldLockSkill`. Finishing it, and what opening gives, is `completeDeedRun`'s.
 */
export async function startWorldLockRun(childId: string, objectId: string): Promise<RunStart> {
  const object = worldObjectById(objectId);
  if (!object) throw new Error(NOT_IN_CHRONICLE);
  const door = object.type === "door";
  return startLockRun(childId, {
    kind: "world",
    sourceRef: object.id,
    refusals: { heroOnly: WORLD_HERO_ONLY, off: WORLD_LOCKS_OFF },
    check: async () => {
      const [clock, rows] = await Promise.all([worldClock(childId), loadWorldRows(childId)]);
      const row = rows.find((r) => r.objectId === object.id) ?? null;
      if (!lockedNow(object, row, clock.today, clock.zone)) throw new Error(WORLD_OPEN);
    },
    pick: (hero, focusSkillIds) => {
      const pick = worldLockSkill(object, hero.grades, focusSkillIds);
      return pick ? { ...pick, boost: 0 } : null;
    },
    count: 1,
    header: (skill) => ({ id: object.id, title: door ? DOOR_TITLE : CHEST_TITLE, story: door ? DOOR_STORY : CHEST_STORY, area: skill.area }),
    demo: true,
  });
}
