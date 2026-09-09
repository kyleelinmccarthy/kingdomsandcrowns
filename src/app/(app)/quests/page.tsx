import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getRecentActivities } from "@/lib/actions/activities";
import { getAssignmentsForDate, generateAssignmentsFromSchedules, getLatestAssignmentStatusByQuest } from "@/lib/actions/quest-assignments";
import { getQuests } from "@/lib/actions/quests";
import { getScheduleBlocks } from "@/lib/actions/student-schedule";
import { getSchoolingModeForDate } from "@/lib/actions/schooling-mode";
import { generateLearningLog, getSavedLog } from "@/lib/actions/chronicles";
import { getSchoolBreaks } from "@/lib/actions/school-breaks";
import { formatDate, getWeekStartDate } from "@/lib/utils/dates";
import { weekdayOfDate, currentTimeOfDay } from "@/lib/utils/schedule-days";
import { getStructuredCardLock } from "@/lib/utils/quest-ordering";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { QuestAssignmentCard } from "@/components/quest-assignment-card";
import { TodaySchedule } from "@/components/today-schedule";
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
  await requireActor();
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
      <div className="page-banner relative flex flex-col items-center gap-4 text-center">
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
        {!isChildView && (
          <div className="flex items-center gap-3 sm:absolute sm:right-6 sm:top-1/2 sm:-translate-y-1/2">
            <Link href={`/scrolls?child=${activeChild.id}`} className="text-xs font-medium text-primary hover:underline">
              Quest Giver →
            </Link>
            {allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
          </div>
        )}
      </div>

      <QuestViewTabs active={activeView} />

      {activeView === "today" ? (
        <TodayView
          key={activeChild.id}
          childId={activeChild.id}
          isChildView={isChildView}
          allowChildSkip={isChildView && activeChild.skipQuestsEnabled}
        />
      ) : (
        <AdventureView
          key={activeChild.id}
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

async function TodayView({
  childId,
  isChildView,
  allowChildSkip,
}: {
  childId: string;
  isChildView: boolean;
  /** Parent-granted: this hero may skip their own quests (a grown-up is alerted either way). */
  allowChildSkip: boolean;
}) {
  const today = formatDate(new Date());
  await generateAssignmentsFromSchedules(childId, today, today);

  const [subjects, activities, todayAssignments, quests, allBlocks, latestStatusByQuestId, schoolingMode] = await Promise.all([
    getSubjects(childId),
    getRecentActivities(childId, 50),
    getAssignmentsForDate(childId, today),
    getQuests(childId),
    getScheduleBlocks(childId),
    getLatestAssignmentStatusByQuest(childId),
    getSchoolingModeForDate(childId, today),
  ]);

  const todayWeekday = weekdayOfDate(today);
  const todaysBlocks = allBlocks.filter((b) => b.dayOfWeek === todayWeekday);

  const pendingIds = todayAssignments
    .filter((a) => a.assignment.status === "pending")
    .map((a) => a.assignment.id);

  const todayAssignmentIds = new Set(todayAssignments.map((a) => a.assignment.id));

  // On a structured day a hero works the schedule in order, so every assigned
  // quest but the next one is shown locked rather than with its own Start /
  // Quick Complete buttons — those bypassed the "Start a Quest" queue entirely
  // and only failed once the server refused the completion. Parents still act
  // on any quest in any order.
  const structuredNext = getStructuredCardLock({
    enabled: isChildView && schoolingMode === "structured",
    quests,
    todayAssignments,
    latestStatusByQuestId,
    todaysBlocks,
  });

  return (
    <>
      <TimerCleanup pendingAssignmentIds={pendingIds} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {todayAssignments.length > 0 && (
          <GameFrame title={isChildView ? "Today's Quests" : "Assigned Quests"} icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
            {todaysBlocks.length > 0 ? (
              <TodaySchedule
                blocks={todaysBlocks}
                subjects={subjects}
                assignments={todayAssignments}
                isChildView={isChildView}
                structuredNext={structuredNext}
                allowChildSkip={allowChildSkip}
              />
            ) : (
              <div className="space-y-2">
                {todayAssignments.map((a) => (
                  <QuestAssignmentCard
                    key={a.assignment.id}
                    data={a}
                    isChildView={isChildView}
                    structuredNext={structuredNext}
                    allowChildSkip={allowChildSkip}
                  />
                ))}
              </div>
            )}
          </GameFrame>
        )}

        <QuestForm
          childId={childId}
          subjects={subjects}
          quests={quests}
          todayAssignments={todayAssignments}
          todaysBlocks={todaysBlocks}
          nowTime={currentTimeOfDay()}
          latestStatusByQuestId={latestStatusByQuestId}
          today={today}
          initialSchoolingMode={schoolingMode}
          isChildView={isChildView}
        />
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
      key={weekStart}
      generatedText={logText}
      savedEditedText={savedLog?.editedText ?? null}
      childId={childId}
      startDate={weekStart}
      endDate={weekEnd}
      breaks={breaks}
      familyId={familyId}
      isChildView={isChildView}
      today={formatDate(new Date())}
    />
  );
}
