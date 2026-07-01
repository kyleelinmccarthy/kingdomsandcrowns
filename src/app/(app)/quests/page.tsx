import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getRecentActivities } from "@/lib/actions/activities";
import { getAssignmentsForDate, generateAssignmentsFromSchedules } from "@/lib/actions/quest-assignments";
import { getQuests } from "@/lib/actions/quests";
import { generateLearningLog, getSavedLog } from "@/lib/actions/chronicles";
import { getSchoolBreaks } from "@/lib/actions/school-breaks";
import { formatDate, getWeekStartDate } from "@/lib/utils/dates";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { QuestAssignmentCard } from "@/components/quest-assignment-card";
import { QuestViewTabs } from "@/components/quest-view-tabs";
import { LongRest } from "@/components/long-rest";
import { TimerCleanup } from "@/components/timer-cleanup";
import { QuestForm } from "./quest-form";
import { QuestLog } from "./quest-log";

export default async function QuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; week?: string; view?: string }>;
}) {
  await requireSession();
  const { child: selectedChildId, week, view } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  const activeView = view === "adventure" ? "adventure" : "today";

  if (!isChildView) {
    const family = await getFamily();
    if (!family) {
      return (
        <div className="space-y-6">
          <h1 className="page-title text-4xl">Quest Log</h1>
          <GameFrame>
            <div className="py-4 text-center">
              <GameIcon name="scroll" className="mx-auto size-10 text-[var(--gold-bright)]" />
              <p className="mt-3 text-muted-foreground">
                <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before quests can be undertaken.
              </p>
            </div>
          </GameFrame>
        </div>
      );
    }
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Quest Log</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to embark upon quests.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">
            {isChildView ? "My Quests" : "Quest Log"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? "Chronicle your heroic deeds today!"
              : `Scribe and track ${activeChild.displayName}'s heroic endeavors.`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isChildView && allChildren.length > 1 && (
            <ChildSelector children={allChildren} selectedId={activeChild.id} />
          )}
        </div>
      </div>

      <QuestViewTabs active={activeView} />

      {activeView === "today" ? (
        <TodayView childId={activeChild.id} isChildView={isChildView} />
      ) : (
        <AdventureView
          childId={activeChild.id}
          childName={activeChild.displayName}
          familyId={activeChild.familyId}
          isChildView={isChildView}
          week={week}
        />
      )}
    </div>
  );
}

async function TodayView({ childId, isChildView }: { childId: string; isChildView: boolean }) {
  const today = formatDate(new Date());
  await generateAssignmentsFromSchedules(childId, today, today);

  const [subjects, activities, todayAssignments, quests] = await Promise.all([
    getSubjects(childId),
    getRecentActivities(childId, 50),
    getAssignmentsForDate(childId, today),
    getQuests(childId),
  ]);

  const pendingIds = todayAssignments
    .filter((a) => a.assignment.status === "pending")
    .map((a) => a.assignment.id);

  const todayAssignmentIds = new Set(todayAssignments.map((a) => a.assignment.id));

  return (
    <>
      <TimerCleanup pendingAssignmentIds={pendingIds} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {todayAssignments.length > 0 && (
          <GameFrame title={isChildView ? "Today's Quests" : "Assigned Quests"} icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
            <div className="space-y-2">
              {todayAssignments.map((a) => (
                <QuestAssignmentCard key={a.assignment.id} data={a} isChildView={isChildView} />
              ))}
            </div>
          </GameFrame>
        )}

        <QuestForm childId={childId} subjects={subjects} quests={quests} todayAssignments={todayAssignments} />
      </div>

      <GameFrame title={isChildView ? "Adventure Log" : "Recent Adventures"} icon={<GameIcon name="book" className="size-5 text-[var(--gold-bright)]" />}>
        <QuestLog
          activities={activities.filter(
            (a) => !todayAssignmentIds.has(a.questAssignmentId ?? "")
          )}
          subjects={subjects}
        />
      </GameFrame>
    </>
  );
}

async function AdventureView({
  childId,
  childName,
  familyId,
  isChildView,
  week,
}: {
  childId: string;
  childName: string;
  familyId: string;
  isChildView: boolean;
  week?: string;
}) {
  const weekStart = week ?? getWeekStartDate();
  const weekEnd = (() => {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  })();

  const [logText, savedLog, breaks] = await Promise.all([
    generateLearningLog(childId, childName, weekStart, weekEnd),
    getSavedLog(childId, weekStart),
    getSchoolBreaks(familyId),
  ]);

  return (
    <LongRest
      generatedText={logText}
      savedEditedText={savedLog?.editedText ?? null}
      summaryId={savedLog?.id ?? null}
      childId={childId}
      startDate={weekStart}
      endDate={weekEnd}
      breaks={breaks}
      familyId={familyId}
      isChildView={isChildView}
    />
  );
}
