/**
 * SPIKE — throwaway. A second, parallel view of the same village in real 3D, to answer one
 * question by being looked at. `/realm` is untouched and is still the game.
 *
 * Deliberately outside the (app) group: no sidebar, no page banner, no HUD. Full bleed, so the
 * only thing being judged is the picture.
 *
 * It is a page like any other, so it loads the real child the way `/realm` does — same
 * `resolveActiveChild` + `getRealmBundle` — and the hero walking around is that child's own
 * avatar. Nothing here is allowed to break the picture, so every lookup falls back to
 * DEFAULT_AVATAR rather than throwing: a spike that redirects to /login teaches nobody anything.
 */

import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getRealmBundle } from "@/lib/actions/realm";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Realm3dSpike } from "@/components/realm3d/spike-shell";

export const metadata = { title: "Realm 3D — spike" };

async function activeAvatar(childId?: string): Promise<AvatarConfig | null> {
  try {
    const { child } = await resolveActiveChild(childId);
    if (!child) return null;
    return (await getRealmBundle(child.id)).avatarConfig;
  } catch {
    return null;
  }
}

/**
 * Any avatar field can be overridden from the query string — `?outfit=robe&hair=afro&crown=
 * crown-gold`. Not a feature: the way to check that a look a child could actually build still
 * reads, without editing a database row between screenshots.
 */
function override(base: AvatarConfig, q: Record<string, string | string[] | undefined>): AvatarConfig {
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const hex = (k: string) => {
    const v = one(k);
    return v ? (v.startsWith("#") ? v : `#${v}`) : undefined;
  };
  return {
    ...base,
    skinTone: one("skin") ?? base.skinTone,
    hairStyle: one("hair") ?? base.hairStyle,
    hairColor: hex("hairc") ?? base.hairColor,
    outfit: one("outfit") ?? base.outfit,
    outfitColor: hex("outfitc") ?? base.outfitColor,
    legwear: one("legwear") ?? base.legwear,
    legwearColor: hex("legwearc") ?? base.legwearColor,
    boots: one("boots") ?? base.boots,
    bootsColor: hex("bootsc") ?? base.bootsColor,
    accessory: one("acc") ?? base.accessory,
    accessoryColor: hex("accc") ?? base.accessoryColor,
    companion: one("pet") ?? base.companion,
    companionColor: hex("petc") ?? base.companionColor,
    crown: one("crown") ?? base.crown,
  };
}

export default async function Realm3dPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const childId = Array.isArray(q.child) ? q.child[0] : q.child;
  const loaded = (await activeAvatar(childId)) ?? DEFAULT_AVATAR;
  return <Realm3dSpike avatar={override(loaded, q)} close={q.close !== undefined} />;
}
