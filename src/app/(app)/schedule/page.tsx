import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import {
  getSchoolDays,
  getScheduleBlocks,
  getScheduleSelfManage,
  getStreakOptionalDays,
} from "@/lib/actions/student-schedule";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { StudentScheduleEditor } from "@/components/student-schedule-editor";
import { SchoolCalendar } from "@/components/school-calendar";
import { ScheduleGapNotice } from "@/components/schedule-gap-notice";
import { getSubjectScheduleGaps } from "@/lib/actions/schedule-gaps";
import { getSchoolBreaks } from "@/lib/actions/school-breaks";
import { formatDate } from "@/lib/utils/dates";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Weekly Schedule</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="calendar" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to build a schedule.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const [subjects, schoolDays, optionalDays, blocks, selfManageEnabled, scheduleGaps, breaks] =
    await Promise.all([
      getSubjects(activeChild.id),
      getSchoolDays(activeChild.id),
      getStreakOptionalDays(activeChild.id),
      getScheduleBlocks(activeChild.id),
      getScheduleSelfManage(activeChild.id),
      getSubjectScheduleGaps(activeChild.id),
      getSchoolBreaks(activeChild.familyId),
    ]);

  const canEdit = !isChildView || selfManageEnabled;

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">
            {isChildView ? "My Schedule" : "Weekly Schedule"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? "Here's what your school days look like."
              : `Plan ${activeChild.displayName}'s classes for each day of the week.`}
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && (
          <ChildSelector kids={allChildren} selectedId={activeChild.id} />
        )}
      </div>

      {/* Scheduled quests whose discipline has no class time on the days they
          come up. Named here because this page is where the gap gets closed. */}
      {!isChildView && (
        <ScheduleGapNotice heroes={[{ gaps: scheduleGaps }]} showFixLink={false} />
      )}

      {/* The year of days off, alongside the week that repeats. A parent looking
          for "today is a holiday" looks at the schedule, not the chronicle. A
          hero sees the same calendar read-only, and only once it has something
          on it — it's how they know a quiet day isn't costing them a streak. */}
      {(!isChildView || breaks.length > 0) && (
        <SchoolCalendar
          familyId={activeChild.familyId}
          breaks={breaks}
          today={formatDate(new Date())}
          canEdit={!isChildView}
        />
      )}

      {subjects.length === 0 ? (
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="book" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              {isChildView
                ? "Ask a parent to add some disciplines before building a schedule."
                : (
                  <>
                    <Link href="/settings" className="text-primary hover:underline">Add some disciplines</Link> for {activeChild.displayName} before building a schedule.
                  </>
                )}
            </p>
          </div>
        </GameFrame>
      ) : (
        <StudentScheduleEditor
          childId={activeChild.id}
          subjects={subjects}
          schoolDays={schoolDays}
          optionalDays={optionalDays}
          blocks={blocks}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
