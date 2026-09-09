import type { CSSProperties } from "react";
import Link from "next/link";
import {
  getAssignmentsForDate,
  getAssignmentsForDateRange,
  generateAssignmentsFromSchedules,
} from "@/lib/actions/quest-assignments";
import { getScheduleBlocks } from "@/lib/actions/student-schedule";
import { getSubjectScheduleGaps } from "@/lib/actions/schedule-gaps";
import { formatDate } from "@/lib/utils/dates";
import { formatTimeOfDay, weekdayOfDate } from "@/lib/utils/schedule-days";
import {
  earliestStartTimeByDayAndSubject,
  sortUpcomingBySchedule,
} from "@/lib/utils/quest-ordering";
import { GameFrame } from "@/components/game-frame";
import { ParentAlertsPanel } from "@/components/parent-alerts";
import { ScheduleGapNotice } from "@/components/schedule-gap-notice";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { Avatar } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { getChildren } from "@/lib/actions/children";

type ChildRow = Awaited<ReturnType<typeof getChildren>>[number];

export async function ParentDashboard({ allChildren }: { allChildren: ChildRow[] }) {
  const today = formatDate(new Date());
  const weekOutDate = new Date();
  weekOutDate.setDate(weekOutDate.getDate() + 6);
  const weekOut = formatDate(weekOutDate);

  await Promise.all(
    allChildren.map((child) => generateAssignmentsFromSchedules(child.id, today, weekOut))
  );

  const perChild = await Promise.all(
    allChildren.map(async (child) => {
      const [todayAssignments, upcoming, blocks, scheduleGaps] = await Promise.all([
        getAssignmentsForDate(child.id, today),
        getAssignmentsForDateRange(child.id, today, weekOut),
        getScheduleBlocks(child.id),
        getSubjectScheduleGaps(child.id),
      ]);
      return {
        child,
        todayAssignments,
        upcoming,
        scheduleGaps,
        startTimes: earliestStartTimeByDayAndSubject(blocks),
      };
    })
  );

  // One chronological list for the whole family: a hero's 9am block should sit
  // next to their sibling's 9am block, not a page apart.
  const upcomingCombined = sortUpcomingBySchedule(
    perChild.flatMap(({ child, upcoming, startTimes }) =>
      upcoming
        .filter((a) => a.assignment.date >= today && a.assignment.status === "pending")
        .map((a) => ({
          ...a,
          childName: child.displayName,
          date: a.assignment.date,
          sortOrder: a.quest.sortOrder,
          startTime: startTimes.get(`${weekdayOfDate(a.assignment.date)}|${a.quest.subjectId}`),
        }))
    ),
    (a) => a.startTime
  ).slice(0, 8);

  return (
    <div className="hud-layout">
      <div className="page-banner text-center">
        <h1 className="page-title text-4xl">The Tavern</h1>
        <p className="mt-1 text-muted-foreground">Your family&apos;s adventure hub</p>
      </div>

      <ParentAlertsPanel />

      {/* Quests scheduled onto days their discipline isn't taught. Nothing else
          on this dashboard would show it: the assignments are generated as asked
          and simply sink to the bottom of the hero's day with no time on them.
          One panel for the whole family — a frame per hero read as several
          unrelated warnings that happened to share a title. */}
      <ScheduleGapNotice
        heroes={perChild.map(({ child, scheduleGaps }) => ({
          gaps: scheduleGaps,
          childId: child.id,
          childName: allChildren.length > 1 ? child.displayName : undefined,
        }))}
        dismissible
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuicklinkCard href="/scrolls" icon="mage" label="Create Assignment" />
        <QuicklinkCard href="/schedule" icon="calendar" label="Manage Schedule" />
        <QuicklinkCard href="/loot" icon="gem" label="Review Loot" />
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:[grid-template-columns:repeat(var(--dash-cols-sm),minmax(0,1fr))] xl:[grid-template-columns:repeat(var(--dash-cols-xl),minmax(0,1fr))]"
        style={{
          "--dash-cols-sm": Math.min(perChild.length, 2),
          "--dash-cols-xl": Math.min(perChild.length, 3),
        } as CSSProperties}
      >
        {perChild.map(({ child, todayAssignments }) => (
          <ChildSummaryCard key={child.id} child={child} todayAssignments={todayAssignments} />
        ))}
      </div>

      <GameFrame title="Upcoming Quests" icon={<GameIcon name="scroll" className="size-4 text-[var(--gold-bright)]" />}>
        {upcomingCombined.length === 0 ? (
          <div className="py-4 text-center">
            <GameIcon name="scroll" className="mx-auto size-8 text-[var(--gold-bright)]" />
            <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled beyond today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingCombined.map((a) => (
              <div key={a.assignment.id} className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
                <span className="min-w-0 grow basis-48">
                  <span className="font-medium">{a.childName}</span> — {a.quest.title}
                  <span className="text-muted-foreground"> ({a.subject.name})</span>
                </span>
                <span className="ml-auto shrink-0 pl-2 text-right text-xs text-muted-foreground">
                  {a.assignment.date}
                  {a.startTime ? ` · ${formatTimeOfDay(a.startTime)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </GameFrame>
    </div>
  );
}

function QuicklinkCard({
  href, icon, label,
}: {
  href: string; icon: GameIconName; label: string;
}) {
  return (
    <Link href={href}>
      <GameFrame className="transition-transform hover:-translate-y-0.5">
        <div className="flex items-center justify-center gap-2 py-2 text-center">
          <GameIcon name={icon} className="size-5 text-[var(--gold-bright)]" />
          <p className="font-medium">{label}</p>
        </div>
      </GameFrame>
    </Link>
  );
}

function ChildSummaryCard({
  child, todayAssignments,
}: {
  child: ChildRow;
  todayAssignments: Awaited<ReturnType<typeof getAssignmentsForDate>>;
}) {
  const level = Math.floor(child.currentXp / 100) + 1;
  const xpInLevel = child.currentXp % 100;
  const completed = todayAssignments.filter((a) => a.assignment.status === "completed").length;
  const total = todayAssignments.length;

  return (
    <GameFrame>
      <div className="flex items-start gap-3">
        <Avatar
          config={child.avatarConfig ? JSON.parse(child.avatarConfig) as AvatarConfig : null}
          name={child.displayName}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="font-brand text-lg font-bold" style={{ color: "var(--gold-bright)" }}>
            {child.displayName}
          </p>
          <p className="text-xs text-muted-foreground">Level {level} · {xpInLevel}/100 XP</p>
          <div className="xp-bar-track mt-1">
            <div className="xp-bar-fill" style={{ width: `${xpInLevel}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span style={{ color: "var(--streak)" }}>{child.currentStreak} day streak</span>
            <span>{total === 0 ? "No quests today" : `${completed}/${total} today`}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-medium">
        <Link href={`/quests?child=${child.id}`} className="text-primary hover:underline">
          Quest log →
        </Link>
        <Link href={`/scrolls?child=${child.id}`} className="text-primary hover:underline">
          Assign quests →
        </Link>
      </div>
      <div className="mt-2 flex justify-center text-xs font-medium">
        <Link href={`/tavern?child=${child.id}`} className="flex items-center gap-1 text-primary hover:underline">
          <GameIcon name="tavern" className="size-3" />
          View {child.displayName}&apos;s Tavern →
        </Link>
      </div>
    </GameFrame>
  );
}
