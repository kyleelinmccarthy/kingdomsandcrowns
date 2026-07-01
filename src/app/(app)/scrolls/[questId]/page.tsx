import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getQuest } from "@/lib/actions/quests";
import { getSubjects } from "@/lib/actions/subjects";
import { getQuestResources } from "@/lib/actions/quest-resources";
import { getSchedule } from "@/lib/actions/quest-schedules";
import { getReminders } from "@/lib/actions/quest-reminders";
import { GameFrame } from "@/components/game-frame";
import { QuestResourceList } from "@/components/quest-resource-list";
import { QuestScheduleForm } from "@/components/quest-schedule-form";
import { QuestReminderForm } from "@/components/quest-reminder-form";
import { GameIcon } from "@/components/game-icon";

export default async function QuestDetailPage({
  params,
}: {
  params: Promise<{ questId: string }>;
}) {
  await requireSession();
  const { questId } = await params;

  const quest = await getQuest(questId);
  if (!quest) notFound();

  const { isChildView } = await resolveActiveChild();

  if (isChildView) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Quest Details</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="lock" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              Only parents may view quest configurations.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const [subjects, resources, schedule, reminders] = await Promise.all([
    getSubjects(quest.childId),
    getQuestResources(questId),
    getSchedule(questId),
    getReminders(questId),
  ]);

  const subject = subjects.find((s) => s.id === quest.subjectId);

  return (
    <div className="space-y-6">
      <div className="page-banner">
        <Link
          href={`/scrolls?child=${quest.childId}`}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          &larr; Back to Quest Giver
        </Link>
        <h1 className="page-title mt-2 text-4xl">{quest.title}</h1>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          {subject && (
            <>
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: subject.color ?? "#6b7280" }}
              />
              <span>{subject.name}</span>
            </>
          )}
          {quest.estimatedMinutes && (
            <span className="text-sm">~{quest.estimatedMinutes} minutes</span>
          )}
        </div>
        {quest.description && (
          <p className="mt-2 text-sm text-muted-foreground">{quest.description}</p>
        )}
      </div>

      <QuestScheduleForm questId={questId} schedule={schedule} />
      <QuestResourceList resources={resources} questId={questId} />
      <QuestReminderForm questId={questId} reminders={reminders} />
    </div>
  );
}
