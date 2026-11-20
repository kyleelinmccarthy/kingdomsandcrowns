"use server";

import { towerBands, towerFloors, towerRef, towerSkillId } from "@/lib/realm/puzzle-tower";
import { worldObjectById } from "@/lib/realm/world-objects";
import { lockedNow } from "@/lib/realm/world-state";
import { CONTENT_BANDS } from "@/lib/utils/content-bands";
import { NOT_IN_CHRONICLE, TOWER_SHUT, WORLD_HERO_ONLY, WORLD_LOCKS_OFF, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { findSkill } from "@/lib/utils/skills";
import { CHEST_STORY, CHEST_TITLE, DOOR_STORY, DOOR_TITLE, TOWER_STORY, TOWER_TITLE } from "@/lib/utils/world-lock-copy";
import { worldLockSkill } from "@/lib/utils/world-lock-run";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { startLockRun } from "@/lib/services/lock-runs";
import { loadStarredBands, loadWorldRows, worldClock } from "@/lib/services/realm-world-state";

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

/**
 * Starts, or picks back up, a Tower floor's bonus lock (R-G5, PC-G12): a `tower` run of ONE lock a
 * level harder than the hero's mastery of the floor's logic skill (`towerLevel`), named by the
 * floor's ref (`tower:<band>`). The hero's alone, refused while the grown-up has locks off (R-G7),
 * and refused for a floor that is not open: its band must be among the hero's visible floors and
 * open (`towerFloors`, from the hero's grades and the 3-star runs `loadStarredBands` finds). `band`
 * crosses the wire, so anything that is not one of the five bands is `NOT_IN_CHRONICLE` before
 * anything is read. No demo, and no second chances (`RUN_EFFECTS.tower`). Finishing it is
 * `completeDeedRun`'s: it counts the solve, and pays nothing.
 */
export async function startTowerRun(childId: string, band: string): Promise<RunStart> {
  const floor = CONTENT_BANDS.find((b) => b === band);
  if (!floor) throw new Error(NOT_IN_CHRONICLE);
  return startLockRun(childId, {
    kind: "tower",
    sourceRef: towerRef(floor),
    refusals: { heroOnly: WORLD_HERO_ONLY, off: WORLD_LOCKS_OFF },
    check: async (hero) => {
      const floors = towerFloors(await loadStarredBands(childId), towerBands(hero.grades));
      if (!floors.some((f) => f.band === floor && f.open)) throw new Error(TOWER_SHUT);
    },
    // The floor's own skill and band, whatever the hero's grade; one rung above their mastery (`towerLevel`), capped by `startLockRun`.
    pick: () => {
      const skill = findSkill(towerSkillId(floor));
      return skill ? { skill, grade: skill.grades[0], boost: 1 } : null;
    },
    count: 1,
    header: () => ({ id: towerRef(floor), title: TOWER_TITLE, story: TOWER_STORY, area: "logic" }),
    demo: false,
  });
}
