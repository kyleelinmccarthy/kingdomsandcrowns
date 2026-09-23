/**
 * The Realm's screenshot overrides, read off the query string.
 *
 * Not a feature. They are how a look, a name, a visitor or a locked castle is checked in a
 * screenshot without editing a database row between shots: `?outfit=robe&hair=afro`,
 * `?name=Emma`, `?viewer=parent`, `?castle=0`, `?close`. They moved here from the old
 * `/realm-3d` page when `/realm` became the 3D game, and `/realm-3d` now redirects to `/realm`
 * with its query intact, so every old screenshot URL still lands on the same picture.
 *
 * They restyle the picture and nothing else. None of them touches the clock, the gate or a
 * single saved row, which is what makes them safe to leave in: `?castle=1` stands a castle in a
 * screenshot, but a child who types it has built nothing and spent nothing.
 */

import type { AvatarConfig } from "@/lib/utils/avatar-catalog";

export type Query = Record<string, string | string[] | undefined>;

export function one(q: Query, k: string): string | undefined {
  const v = q[k];
  return Array.isArray(v) ? v[0] : v;
}

/** Any avatar field, by a short name: `?outfit=robe&hair=afro&crown=crown-gold&outfitc=ff0000`. */
export function overrideAvatar(base: AvatarConfig, q: Query): AvatarConfig {
  const hex = (k: string) => {
    const v = one(q, k);
    return v ? (v.startsWith("#") ? v : `#${v}`) : undefined;
  };
  return {
    ...base,
    skinTone: one(q, "skin") ?? base.skinTone,
    hairStyle: one(q, "hair") ?? base.hairStyle,
    hairColor: hex("hairc") ?? base.hairColor,
    outfit: one(q, "outfit") ?? base.outfit,
    outfitColor: hex("outfitc") ?? base.outfitColor,
    legwear: one(q, "legwear") ?? base.legwear,
    legwearColor: hex("legwearc") ?? base.legwearColor,
    boots: one(q, "boots") ?? base.boots,
    bootsColor: hex("bootsc") ?? base.bootsColor,
    accessory: one(q, "acc") ?? base.accessory,
    accessoryColor: hex("accc") ?? base.accessoryColor,
    companion: one(q, "pet") ?? base.companion,
    companionColor: hex("petc") ?? base.companionColor,
    crown: one(q, "crown") ?? base.crown,
  };
}

/**
 * Who is walking. The real answer comes from the actor — a parent visiting is `"parent"` — and
 * `?viewer=parent` can only dress a child's own view AS a visit for a screenshot, never the
 * reverse. It changes the figure and the frame's words; the clock still runs off the actor.
 */
export function viewerFor(isChildView: boolean, q: Query): "child" | "parent" {
  if (!isChildView) return "parent";
  return one(q, "viewer") === "parent" ? "parent" : "child";
}

/** `?castle=0` hides the castle for a screenshot and `?castle=1` stands one; otherwise the real rule. */
export function castleShown(unlocked: boolean, q: Query): boolean {
  const v = one(q, "castle");
  if (v === "0") return false;
  if (v === "1") return true;
  return unlocked;
}

/** The query string, rebuilt, for the `/realm-3d` → `/realm` redirect. Repeated keys survive. */
export function queryString(q: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
