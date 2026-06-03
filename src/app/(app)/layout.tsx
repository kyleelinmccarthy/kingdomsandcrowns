import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession, getDemoPersona } from "@/lib/auth/session";
import { getActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { GameBanner, GameNavBar } from "@/components/game-nav";
import { DemoPersonaSwitcher } from "@/components/demo-persona-switcher";
import { SwitchHero } from "@/components/switch-hero";
import { QuestTimerPopup } from "@/components/quest-timer-popup";

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
  if (actor.kind === "child") {
    const rows = await db
      .select({ displayName: schema.child.displayName })
      .from(schema.child)
      .where(eq(schema.child.id, actor.childId))
      .limit(1);
    userName = rows[0]?.displayName ?? "Hero";
  } else {
    const session = await getSession();
    userName = session?.user.name ?? "Adventurer";
  }

  const isDemoMode = process.env.DEMO_MODE === "true";
  const persona = isDemoMode ? await getDemoPersona() : null;

  return (
    <div className="game-shell relative flex min-h-svh flex-col overflow-hidden">
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
    </div>
  );
}
