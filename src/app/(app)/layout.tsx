import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession, getDemoPersona } from "@/lib/auth/session";
import { getActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { profileFromRow, readingAttributes } from "@/lib/utils/learning-profile";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { GameBanner, GameNavBar } from "@/components/game-nav";
import { DemoPersonaSwitcher } from "@/components/demo-persona-switcher";
import { SwitchHero } from "@/components/switch-hero";
import { QuestTimerPopup } from "@/components/quest-timer-popup";
import { ScheduleNotificationPopup } from "@/components/schedule-notification-popup";
import { ParentAlertPopup } from "@/components/parent-alerts";
import { ParentAlertsProvider } from "@/components/parent-alerts-context";
import { getParentAlerts, type ParentAlert } from "@/lib/actions/parent-alerts";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();

  if (!actor) {
    redirect("/login");
  }

  const isChildView = actor.kind === "child";

  let userName = "Adventurer";
  let readingAttrs: Record<string, "on"> = {};
  if (actor.kind === "child") {
    const rows = await db
      .select({ displayName: schema.child.displayName })
      .from(schema.child)
      .where(eq(schema.child.id, actor.childId))
      .limit(1);
    userName = rows[0]?.displayName ?? "Hero";

    // Memoized per request, so the Realm bundle and the side quests below reuse this read.
    readingAttrs = readingAttributes(profileFromRow(await loadLearningProfileRow(actor.childId)));
  } else {
    const session = await getSession();
    userName = session?.user.name ?? "Adventurer";
  }

  const isDemoMode = process.env.DEMO_MODE === "true";
  const persona = isDemoMode ? await getDemoPersona() : null;

  // Fetched here rather than in each surface so the nav bell paints its badge
  // with the first byte of HTML. Throws when there's no family set up yet,
  // which just means there's nothing to announce.
  let initialAlerts: ParentAlert[] = [];
  if (!isChildView) {
    try {
      initialAlerts = await getParentAlerts();
    } catch {
      initialAlerts = [];
    }
  }

  return (
    <ParentAlertsProvider initialAlerts={initialAlerts} enabled={!isChildView}>
      <div className="game-shell relative flex min-h-svh flex-col overflow-hidden" {...readingAttrs}>
        {/* Background orbs */}
        <div className="game-shell-orb game-shell-orb--1" />
        <div className="game-shell-orb game-shell-orb--2" />

        {/* Top banner with site name */}
        <GameBanner />

        {/* Main content */}
        <main className="game-content">
          {children}
        </main>

        {/* Bottom nav bar */}
        <GameNavBar userName={userName} isChildView={isChildView} />

        {isDemoMode && persona && <DemoPersonaSwitcher current={persona} />}

        {/* Production shared-device hero hand-off / leave control */}
        {!isDemoMode && <SwitchHero isChildView={isChildView} />}

        {/* Floating quest timer popup — visible on all pages when a timer is running */}
        <QuestTimerPopup />

        {/* Alerts about what the heroes are up to — grown-ups only */}
        {!isChildView && <ParentAlertPopup />}

        {/* Class start/end notifications — hero view only */}
        {isChildView && actor.kind === "child" && (
          <ScheduleNotificationPopup childId={actor.childId} />
        )}
      </div>
    </ParentAlertsProvider>
  );
}
