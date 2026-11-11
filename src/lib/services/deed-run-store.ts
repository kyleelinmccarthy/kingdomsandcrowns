import { and, desc, eq, gt, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { RUN_EFFECTS, kindsThatFeedReview } from "@/lib/utils/deed-scoring";
import { records, resumeIndex, statusOf } from "@/lib/utils/deed-attempts";
import { hintFor } from "@/lib/utils/skill-hints";
import { isRegisteredKind, isTaskCorrect, toClientTask, type Task } from "@/lib/tasks/registry";
import type { RunStart } from "@/lib/utils/deed-run-types";

/**
 * What every run start shares, whether the run belongs to a side quest (`actions/deeds.ts`) or to
 * nothing (`actions/review.ts`): reading a child's mastery and recent misses, finding an open run
 * to resume, reading a stored run, and writing a fresh one. Plain module, not a server action file.
 */
export const RESUME_WINDOW_MS = 60 * 60 * 1000;

export type DeedRunRow = typeof schema.deedRun.$inferSelect;
export type NewDeedRun = typeof schema.deedRun.$inferInsert;

export async function loadMasteryRows(childId: string) {
  return db.select().from(schema.skillMastery).where(eq(schema.skillMastery.childId, childId));
}

/**
 * Tasks the hero got wrong in their last five finished runs of a kind that feeds review
 * (`RUN_EFFECTS`: deeds and reviews), newest first, each graded by its own kind. Only first answers
 * are read: a task put right on the second try still needed help. A Crown Challenge's misses never
 * come back (`RUN_EFFECTS.challenge.feedsReview` is false). A task of a kind this build does not
 * know (saved by a newer deploy) is skipped, not graded; a row that will not parse is skipped whole.
 */
export async function loadRecentMisses(childId: string): Promise<Task[]> {
  const runs = await db
    .select({ questions: schema.deedRun.questions, responses: schema.deedRun.responses })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt), inArray(schema.deedRun.kind, kindsThatFeedReview())))
    .orderBy(desc(schema.deedRun.completedAt))
    .limit(5);
  const misses: Task[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    let qs: Task[];
    let rs: (string | null)[];
    try {
      qs = JSON.parse(run.questions) as Task[];
      rs = JSON.parse(run.responses) as (string | null)[];
    } catch {
      continue; // a malformed old row is skipped, never fatal
    }
    // Runs are newest first, so the first time an id is seen is its newest miss; a
    // task missed again in an older run is not pushed a second time.
    qs.forEach((q, i) => {
      if (q.kind !== undefined && !isRegisteredKind(q.kind)) return;
      const stored = rs[i];
      if (stored !== null && stored !== undefined && !isTaskCorrect(q, stored) && !seen.has(q.id)) {
        seen.add(q.id);
        misses.push(q);
      }
    });
  }
  return misses.slice(0, 5);
}

/** Said when a stored run holds a task kind this build does not know. */
export const NEWER_VERSION = "This side quest was saved by a newer version. Start it again.";

/** A stored run's questions and both tries, read the same way by every action. */
export function parseRun(run: DeedRunRow) {
  // Stored rows predate kinds: an absent `kind` reads as choice (`kindOf`).
  const questions = JSON.parse(run.questions) as Task[];
  // Deploys are forward-only: a run saved by a newer build may hold a kind this one cannot grade or show.
  if (questions.some((q) => q.kind !== undefined && !isRegisteredKind(q.kind))) throw new Error(NEWER_VERSION);
  const responses = JSON.parse(run.responses) as (string | null)[];
  const secondTries = JSON.parse(run.secondTries) as (string | null)[];
  // The run's own snapshot, never today's setting; and a kind that allows none has none.
  const allows = run.secondChances && RUN_EFFECTS[run.kind].allowsSecondChances;
  const attempts = records(questions.map((_, i) => responses[i] ?? null), secondTries);
  const statuses = questions.map((q, i) => statusOf(q, attempts[i], allows));
  return { questions, responses, secondTries, allows, attempts, statuses };
}

/** Whether this build can show and grade every task a stored run holds (a newer deploy may have saved others). */
export function isReadableRun(run: Pick<DeedRunRow, "questions">): boolean {
  try {
    const questions = JSON.parse(run.questions) as Task[];
    return questions.every((q) => q.kind === undefined || isRegisteredKind(q.kind));
  } catch {
    return false;
  }
}

/**
 * A run abandoned minutes ago, left open, so a start picks it back up rather than restarting. A run
 * this build cannot read is not "open" for a start: the hero begins fresh rather than meeting an
 * error (the actions that read an existing run by id still refuse it clearly, `parseRun`).
 */
export async function findOpenRun(where: SQL | undefined): Promise<DeedRunRow | null> {
  const since = new Date(Date.now() - RESUME_WINDOW_MS);
  const open = await db
    .select()
    .from(schema.deedRun)
    .where(and(where, isNull(schema.deedRun.completedAt), gt(schema.deedRun.startedAt, since)));
  return open.find(isReadableRun) ?? null;
}

/** What the browser is handed when it picks an open run back up, reopening a second chance in place. */
export function resumedStart(run: DeedRunRow, header: RunStart["deed"]): RunStart {
  const { questions, responses, attempts, statuses } = parseRun(run);
  const at = resumeIndex(statuses);
  const pending = statuses[at] === "open"
    ? { index: at, ruledOut: attempts[at].first ?? "", hint: hintFor(questions[at].skillId) }
    : null;
  return { runId: run.id, deed: header, questions: questions.map(toClientTask), responses, kind: run.kind, pending };
}

/** Writes a fresh, unanswered run and hands the browser its first screen. */
export async function insertRun(
  values: Omit<NewDeedRun, "responses" | "correctCount" | "flawless" | "startedAt" | "completedAt" | "createdAt" | "updatedAt" | "questions">,
  tasks: Task[],
  header: RunStart["deed"],
): Promise<RunStart> {
  const now = new Date();
  await db.insert(schema.deedRun).values({
    ...values, questions: JSON.stringify(tasks), responses: JSON.stringify(tasks.map(() => null)), correctCount: 0, flawless: false,
    startedAt: now, completedAt: null, createdAt: now, updatedAt: now,
  });
  return {
    runId: values.id, deed: header, questions: tasks.map(toClientTask), responses: tasks.map(() => null),
    kind: values.kind ?? "deed", pending: null,
  };
}
