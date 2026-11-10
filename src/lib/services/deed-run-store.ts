import { and, desc, eq, gt, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { gradeAnswer } from "@/lib/utils/deed-engine";
import type { Question } from "@/lib/utils/drill-generators";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { records, resumeIndex, statusOf } from "@/lib/utils/deed-attempts";
import { hintFor } from "@/lib/utils/skill-hints";
import { toClientTask, type Task } from "@/lib/tasks/registry";
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
 * Questions the hero got wrong in their last five finished deeds, newest first. Only first
 * answers are read: a question put right on the second try still needed help. A Crown
 * Challenge's misses never come back (`RUN_EFFECTS.challenge.feedsReview`).
 */
export async function loadRecentMisses(childId: string): Promise<Question[]> {
  const runs = await db
    .select({ questions: schema.deedRun.questions, responses: schema.deedRun.responses })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt), eq(schema.deedRun.kind, "deed")))
    .orderBy(desc(schema.deedRun.completedAt))
    .limit(5);
  const misses: Question[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    try {
      const qs = JSON.parse(run.questions) as Question[];
      const rs = JSON.parse(run.responses) as (string | null)[];
      // Runs are newest first, so the first time an id is seen is its newest miss; a
      // question missed again in an older run is not pushed a second time.
      qs.forEach((q, i) => {
        if (rs[i] !== null && rs[i] !== undefined && !gradeAnswer(q, rs[i]!) && !seen.has(q.id)) {
          seen.add(q.id);
          misses.push(q);
        }
      });
    } catch { /* a malformed old run is skipped, never fatal */ }
  }
  return misses.slice(0, 5);
}

/** A stored run's questions and both tries, read the same way by every action. */
export function parseRun(run: DeedRunRow) {
  // Stored rows predate kinds: an absent `kind` reads as choice (`kindOf`).
  const questions = JSON.parse(run.questions) as Task[];
  const responses = JSON.parse(run.responses) as (string | null)[];
  const secondTries = JSON.parse(run.secondTries) as (string | null)[];
  // The run's own snapshot, never today's setting; and a kind that allows none has none.
  const allows = run.secondChances && RUN_EFFECTS[run.kind].allowsSecondChances;
  const attempts = records(questions.map((_, i) => responses[i] ?? null), secondTries);
  const statuses = questions.map((q, i) => statusOf(q, attempts[i], allows));
  return { questions, responses, secondTries, allows, attempts, statuses };
}

/** A run abandoned minutes ago, left open, so a start picks it back up rather than restarting. */
export async function findOpenRun(where: SQL | undefined): Promise<DeedRunRow | null> {
  const since = new Date(Date.now() - RESUME_WINDOW_MS);
  const open = await db
    .select()
    .from(schema.deedRun)
    .where(and(where, isNull(schema.deedRun.completedAt), gt(schema.deedRun.startedAt, since)))
    .limit(1);
  return open[0] ?? null;
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
