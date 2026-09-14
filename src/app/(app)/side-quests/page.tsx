import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getDeedsOverview } from "@/lib/actions/deeds";
import { getLearningProfile } from "@/lib/actions/learning-profile";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedPicker } from "@/components/deed-picker";
import { SideQuestMagic } from "@/components/side-quest-magic";
import { SIDE_QUESTS, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

export default async function SideQuestsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">{SIDE_QUESTS}</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="map" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the kingdom can call for help.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">{SIDE_QUESTS}</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to take up {SIDE_QUESTS_LOWER}.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const [overview, profile] = await Promise.all([getDeedsOverview(activeChild.id), getLearningProfile(activeChild.id)]);
  const calm = profile.reducedMotion || profile.lowStimulus;

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? `My ${SIDE_QUESTS}` : `${activeChild.displayName}'s ${SIDE_QUESTS}`}</h1>
          <p className="mt-1 text-muted-foreground">Help the folk of the kingdom. Each side quest raises a building and strengthens your magic. &middot; {overview.bandLabel}</p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      <SideQuestMagic spellbookHref={isChildView ? "/spellbook" : `/spellbook?child=${activeChild.id}`} />
      {overview.enabled ? (
        <DeedPicker key={activeChild.id} childId={activeChild.id} overview={overview} profile={profile} calm={calm} />
      ) : (
        <GameFrame>
          <p className="py-4 text-center text-muted-foreground">The Realm is closed for this hero. A grown-up can open it in the Chronicle.</p>
        </GameFrame>
      )}
    </div>
  );
}
