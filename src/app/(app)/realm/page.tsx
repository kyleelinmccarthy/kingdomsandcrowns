import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getRealmBundle } from "@/lib/actions/realm";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { RealmShell } from "@/components/realm/realm-shell";

export default async function RealmPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
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

  return (
    <div className="space-y-4">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? "My Realm" : `${activeChild.displayName}'s Realm`}</h1>
          <p className="mt-1 text-muted-foreground">Walk the grounds, visit what your deeds have raised, and keep your companion close.</p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      <RealmShell bundle={bundle} childId={activeChild.id} isChildView={isChildView} />
    </div>
  );
}
