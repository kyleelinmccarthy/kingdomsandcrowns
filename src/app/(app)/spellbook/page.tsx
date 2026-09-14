import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSpellbook } from "@/lib/actions/spells";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { SpellbookBuilder } from "@/components/spellbook-builder";
import { SPELL_PART_COUNT } from "@/lib/utils/spell-catalog";

export default async function SpellbookPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Spellbook</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="crystalBall" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the magic can begin.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Spellbook</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to open a spellbook.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const book = await getSpellbook(activeChild.id);

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? "My Spellbook" : `${activeChild.displayName}'s Spellbook`}</h1>
          <p className="mt-1 text-muted-foreground">
            {book.unlocked.length} of {SPELL_PART_COUNT} parts unlocked &middot; {book.spells.filter((s) => s.slot <= book.slots).length} of {book.slots} pages filled. Quests you log open more.
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      <SpellbookBuilder key={activeChild.id} childId={activeChild.id} heroName={activeChild.displayName} book={book} canEdit={true} />
    </div>
  );
}
