import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getQuests } from "@/lib/actions/quests";
import { getSchedulesForChild } from "@/lib/actions/quest-schedules";
import { getLatestAssignmentStatusByQuest } from "@/lib/actions/quest-assignments";
import { getChildAvatarUnlocks } from "@/lib/actions/avatar";
import { getSchoolDays, getScheduleBlocks } from "@/lib/actions/student-schedule";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { QuestTemplateList } from "@/components/quest-template-list";
import { GameIcon } from "@/components/game-icon";
import { buildBlockDaysBySubject } from "@/lib/utils/schedule-gaps";

export default async function ManageQuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (isChildView) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Quest Giver</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="lock" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              Only parents may access the Quest Giver.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const family = await getFamily();
  if (!family) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Quest Giver</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="scroll" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before creating quests.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Quest Giver</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to create quests for.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const [subjects, quests, avatarUnlocks, schedules, schoolDays, assignmentStatusByQuest, blocks] =
    await Promise.all([
      getSubjects(activeChild.id),
      getQuests(activeChild.id),
      getChildAvatarUnlocks(activeChild.id),
      getSchedulesForChild(activeChild.id),
      getSchoolDays(activeChild.id),
      getLatestAssignmentStatusByQuest(activeChild.id),
      getScheduleBlocks(activeChild.id),
    ]);

  const childUnlockedItems = avatarUnlocks.map((u) => u.itemId);
  // Which disciplines are actually taught when, so the Quest Giver can say
  // up front when a repeat is pointed at a day with no class time for it.
  const blockDaysBySubject = buildBlockDaysBySubject(blocks);

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">Quest Giver</h1>
          <p className="mt-1 text-muted-foreground">
            Plan and manage {activeChild.displayName}&apos;s quest scrolls.
          </p>
        </div>
        <div className="flex gap-2">
          {allChildren.length > 1 && (
            <ChildSelector kids={allChildren} selectedId={activeChild.id} />
          )}
        </div>
      </div>

      <QuestTemplateList key={activeChild.id}
        childId={activeChild.id}
        quests={quests}
        subjects={subjects}
        childUnlockedItems={childUnlockedItems}
        schedules={schedules}
        schoolDays={schoolDays}
        assignmentStatusByQuest={assignmentStatusByQuest}
        blockDaysBySubject={blockDaysBySubject}
      />
    </div>
  );
}
