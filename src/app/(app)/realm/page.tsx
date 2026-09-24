import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getRealmBundle } from "@/lib/actions/realm";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { RealmFrame } from "@/components/realm3d/realm-frame";
import type { RealmData } from "@/components/realm3d/realm-game";
import { SwitchHero } from "@/components/switch-hero";
import { getCastle } from "@/lib/actions/castle";
import { castleUnlocked } from "@/lib/realm3d/frame";
import { castleShown, mountsFor, one, overrideAvatar, viewerFor, type Query } from "@/lib/realm3d/overrides";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { levelFromXp } from "@/lib/utils/level";

export const metadata = { title: "The Realm" };

/**
 * THE REALM. The 3D game, full bleed over the app, with its own Leave.
 *
 * The flat 2D Realm (`components/realm/realm-shell.tsx`) is no longer rendered here; its code
 * stays in the repo because the next waves port its systems — the tutorial, the villagers'
 * dialogue and deeds, troubles, recess, the crown ceremony — into this one.
 *
 * What did not change is who gets in: `requireActor`, `resolveActiveChild`, the no-family and
 * no-hero states, and `?child=` for a grown-up choosing whose Realm to visit. A grown-up is a
 * visitor — never gated, never charged, walking as the Quest Giver — which is how a parent
 * tests the Realm without finishing quests as Emma or Noah.
 */
export default async function RealmPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireActor();
  const q = await searchParams;
  const selectedChildId = one(q, "child");
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">The Realm</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="castle" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the gates can open.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">The Realm</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to walk the Realm.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const bundle = await getRealmBundle(activeChild.id);
  // Development only, and only for screenshots: `?ceremony=crown-silver` holds a ceremony for a
  // season that does not exist (hailing it is refused by the server and writes nothing), and
  // `?text=large` shows the child's larger-text view without editing their profile.
  const dev = process.env.NODE_ENV !== "production";
  const devCeremony = dev && isChildView ? one(q, "ceremony") : undefined;
  const profile = dev && one(q, "text") === "large" ? { ...bundle.profile, largerText: true } : bundle.profile;
  // The castle's own rule, as the Castle page applies it: built, or the level to build it.
  const castle = await getCastle(activeChild.id).catch(() => null);
  const unlocked = castleUnlocked(levelFromXp(activeChild.currentXp), castle !== null);

  const realm: RealmData = {
    childId: activeChild.id,
    isChildView,
    kingdom: bundle.kingdom,
    ...(bundle.kingdomError ? { kingdomError: bundle.kingdomError } : {}),
    castleType: bundle.castleType,
    banners: bundle.banners,
    profile,
    depth: bundle.depth,
    toneMode: bundle.settings.toneMode,
    // The tutorial, the first-visit welcome and a waiting crown are the child's own; the
    // bundle never sends a grown-up a ceremony, and the game runs neither for one.
    tutorialStep: bundle.tutorialStep,
    helpSeen: bundle.helpSeen,
    sound: bundle.sound,
    ceremony: bundle.ceremony
      ? { seasonId: bundle.ceremony.seasonId, crownId: bundle.ceremony.crownId, ordinal: bundle.ceremony.ordinal, seasonLabel: bundle.ceremony.seasonLabel }
      : devCeremony
        ? { seasonId: "screenshot", crownId: devCeremony, ordinal: 1, seasonLabel: "A screenshot's season" }
        : null,
    // May this viewer write the child's settings (depth, troubles' look)? False for a view-only
    // grown-up, whose saves the server refuses, so the pause menu leaves those out.
    viewerCanWrite: bundle.canEdit ?? false,
    // The one record of the places found, and what the earning copy needs.
    placesFound: bundle.placesFound ?? [],
    // The Ring's record: recess's gleams, laps and bests (null if it failed to load).
    recess: bundle.recess ?? null,
    ...(bundle.earning ? { earning: bundle.earning } : {}),
  };

  return (
    <RealmFrame
      key={activeChild.id}
      realm={realm}
      // `?name=` and the avatar fields restyle a screenshot; see lib/realm3d/overrides.ts.
      heroName={one(q, "name") ?? bundle.heroName}
      avatar={overrideAvatar(bundle.avatarConfig ?? DEFAULT_AVATAR, q)}
      spellbook={bundle.spellbook}
      viewer={viewerFor(isChildView, q)}
      castleUnlocked={castleShown(unlocked, q)}
      mounts={mountsFor(bundle.mounts.unlocked, q, dev)}
      close={q.close !== undefined}
      selector={
        // A grown-up visiting can hop to another child from the pause menu, and hand the
        // device to a hero, without leaving the Realm first.
        isChildView ? undefined : (
          <>
            {allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
            {process.env.DEMO_MODE !== "true" && <SwitchHero isChildView={false} inline />}
          </>
        )
      }
    />
  );
}
