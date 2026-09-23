/**
 * WHO GETS A NAME, and where in the world the name hangs.
 *
 * Separate from `nameplates.ts` on purpose: that file is arithmetic and knows nothing about
 * villagers, and this file is the guest list and knows nothing about projection. The scene
 * builds this list once and it never changes, which is what lets the driver keep one
 * pre-allocated layout per anchor for the life of the page.
 *
 * The list is deliberately short. Everything in the world could carry a name — every tree has
 * an id — and a world where everything is labelled is a world where nothing is. So: the child,
 * the eight villagers (who have names and hold the side quests), the castle, and the nineteen
 * named places the generator found. Twenty-nine plates, of which the ranges in `nameplates.ts`
 * will usually be drawing five or six.
 */

import { CASTLE_POSITION, type VillagerPlacement } from "@/lib/realm/layout";
import { villagerById } from "@/lib/realm/villagers";
import type { Landmark } from "./worldgen";
import type { PlateTier } from "./nameplates";

/** What a plate says and how it is painted. `mark` picks the glyph, never the colour. */
export type PlateAnchor = {
  id: string;
  tier: PlateTier;
  name: string;
  /** The second line: a site, a place's one clause, or "" for none. */
  sub: string;
  /** The plate's trim colour. */
  accent: string;
  mark: "quest" | "done" | "work" | "place" | "home" | "you";
  x: number;
  /** World y the plate hangs at — already includes the head/roof clearance. */
  y: number;
  z: number;
};

/** Gold for "there is work here", green for "done", stone-blue for "someone lives here". */
const VILLAGER_ACCENT: Record<string, string> = {
  objective: "#ffc94a",
  built: "#7ede5e",
  work: "#9fd0f0",
};

/**
 * Head clearance. The villager figure's hat tops out at 2.24 above its own ground and the
 * hero at 2.3, so 2.9 puts a plate a clear half-unit of sky above both — close enough to
 * belong to the person, far enough that it never sits on their hat.
 */
const HEAD_Y = 2.9;
/**
 * Landmark clearance — and it is LOW, which is the opposite of the obvious answer.
 *
 * The built things at the named places are seven to thirteen units tall, so the first version
 * hung their names at fifteen, clear above the tallest of them. Played, not one of them was
 * ever readable: the chase camera sits nineteen units up and pitches about 37° down, and its
 * vertical field is 23° either side of that, so the band it can see runs from 14° to 60° BELOW
 * the horizontal. A name fifteen units off the ground sits at roughly 0° from the camera's
 * eye — above the top of the frame at every distance a child would care about. Screenshots of
 * four different approaches to the Ringstones with no label anywhere on them.
 *
 * There is a second, sharper reason to go low, and it is the one that sets the number. That
 * same pitch means a point at ground level leaves the top of the frame at a distance of
 * roughly (19.5 - y) / tan(14.5°) from the camera. At y = 15 that distance is 18 units — less
 * than the boom itself, so never. At y = 3 it is 64 units from the camera, about 43 from the
 * child, which is as far ahead as this shot shows ground at all. So three units is not "near
 * the base as a compromise": it is the height that makes a landmark's name appear the moment
 * the landmark itself appears, and that is the whole job.
 *
 * (It is also why this world needs the minimap and the flat one did not. Past forty units the
 * ground is off the top of the screen, so no nameplate at any height can tell a child what is
 * out there; the map is the only thing that can.)
 *
 * `declutter` lifts a plate when it collides with anything, so nothing is lost by starting low.
 */
const LANDMARK_Y = 3;
/** The castle is much wider than it is tall, so its name clears the gatehouse and no more. */
const CASTLE_Y = 5;

export function buildAnchors(input: {
  heroName: string;
  villagers: readonly VillagerPlacement[];
  landmarks: readonly Landmark[];
  heightAt: (x: number, z: number) => number;
  /**
   * Whether the child's castle stands. A castle not yet earned is not in the world, so it has
   * no name hanging over the empty plot either. Defaults to true, as it always was.
   */
  castle?: boolean;
}): PlateAnchor[] {
  const out: PlateAnchor[] = [];
  // The child first, and at index 0 for ever: the driver writes their moving position into
  // this one anchor every frame and never has to search for it.
  out.push({
    id: "hero",
    tier: "hero",
    name: input.heroName,
    sub: "",
    accent: "#ffd980",
    mark: "you",
    x: 0,
    y: 0,
    z: 0,
  });
  if (input.castle !== false) out.push({
    id: "castle",
    tier: "landmark",
    name: "Your Castle",
    sub: "Home",
    accent: "#ffe6a8",
    mark: "home",
    x: CASTLE_POSITION.x,
    y: input.heightAt(CASTLE_POSITION.x, CASTLE_POSITION.z) + CASTLE_Y,
    z: CASTLE_POSITION.z,
  });
  for (const v of input.villagers) {
    out.push({
      id: `villager-${v.id}`,
      tier: "villager",
      name: villagerDisplayName(v),
      sub: v.label,
      accent: VILLAGER_ACCENT[v.status] ?? VILLAGER_ACCENT.work,
      mark: v.status === "objective" ? "quest" : v.status === "built" ? "done" : "work",
      x: v.position.x,
      y: input.heightAt(v.position.x, v.position.z) + HEAD_Y,
      z: v.position.z,
    });
  }
  for (const l of input.landmarks) {
    out.push({
      id: l.id,
      tier: "landmark",
      name: l.name,
      sub: l.line,
      accent: "#d9c48f",
      mark: "place",
      x: l.position.x,
      y: l.y + LANDMARK_Y,
      z: l.position.z,
    });
  }
  return out;
}

/**
 * The villager's own name, not the building's.
 *
 * `VillagerPlacement` carries the site's `label` ("Village Well") and the person's id
 * ("bram"); the person's name lives in `VILLAGERS`, which is the flat Realm's module and is
 * the same eight people in both worlds. Read from there rather than copied, so a villager
 * renamed once is renamed in the 3D realm too. Falls back to the site's label if the id is
 * ever one `VILLAGERS` does not know: a plate that says "Village Well" is wrong, and a plate
 * that says nothing is a bug a child cannot report.
 */
function villagerDisplayName(v: VillagerPlacement): string {
  return villagerById(v.id)?.name ?? v.label;
}
