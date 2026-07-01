import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getFamilyLeaderboard, getCommunityLeaderboard, getCommunityLeaderboardAll } from "@/lib/actions/leaderboard";
import { LeaderboardTabs } from "@/components/leaderboard-tabs";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  await requireSession();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, isChildView } = await resolveActiveChild(selectedChildId);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Hall of Legends</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to enter the Hall of Legends.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  let familyData: Awaited<ReturnType<typeof getFamilyLeaderboard>> = [];
  try {
    familyData = await getFamilyLeaderboard();
  } catch {
    // No family exists yet
  }

  const allData = await getCommunityLeaderboardAll();

  return (
    <div className="space-y-6">
      <div className="page-banner">
        <h1 className="page-title text-4xl">Hall of Legends</h1>
        <p className="mt-1 text-muted-foreground">
          The bravest champions of the realm, ranked by glory.
        </p>
      </div>

      <LeaderboardTabs
        familyData={familyData}
        initialAllData={allData}
        communityData={[]}
        isChildView={isChildView}
        currentChildId={activeChild.id}
        showOnLeaderboard={activeChild.showOnLeaderboard}
      />
    </div>
  );
}
