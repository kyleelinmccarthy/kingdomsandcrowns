import { and, desc, eq, gt, inArray, isNotNull, isNull, like, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { RUN_EFFECTS, kindsThatFeedReview } from "@/lib/utils/deed-scoring";
import { records, resumeIndex, statusOf } from "@/lib/utils/deed-attempts";
import { hintFor } from "@/lib/utils/skill-hints";
import { isRegisteredKind, isTaskCorrect, kindOf, toClientTask, type Task } from "@/lib/tasks/registry";
import type { RunStart } from "@/lib/utils/deed-run-types";
import type { ImprovementId } from "@/lib/realm/improvements";

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
 * `keep` says which misses the caller can re-ask (a review run takes choice only), and the cap of
 * five counts only those, so misses the caller would drop never crowd out ones it would ask.
 */
export async function loadRecentMisses(childId: string, keep: (t: Task) => boolean = () => true): Promise<Task[]> {
  const runs = await db
    .select({ questions: schema.deedRun.questions, responses: schema.deedRun.responses })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt), inArray(schema.deedRun.kind, kindsThatFeedReview())))
    .orderBy(desc(schema.deedRun.completedAt))
    .limit(5);
  const misses: Task[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    let qs: unknown;
    let rs: unknown;
    try {
      qs = JSON.parse(run.questions);
      rs = JSON.parse(run.responses);
    } catch {
      continue; // a malformed old row is skipped, never fatal
    }
    // Valid JSON of the wrong shape (null, an object) is just as unreadable.
    if (!Array.isArray(qs) || !Array.isArray(rs)) continue;
    // Runs are newest first, so the first time an id is seen is its newest miss; a
    // task missed again in an older run is not pushed a second time.
    (qs as (Task | null)[]).forEach((q, i) => {
      if (q == null || typeof q !== "object") return;
      if (q.kind !== undefined && !isRegisteredKind(q.kind)) return;
      if (!keep(q)) return;
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
    .where(and(where, isNull(schema.deedRun.completedAt), gt(schema.deedRun.startedAt, since)))
    // Newest first so the pick is deterministic; the cap only bounds the scan (one open run is the norm).
    .orderBy(desc(schema.deedRun.startedAt))
    .limit(10);
  return open.find(isReadableRun) ?? null;
}

/**
 * What the browser is handed when it picks an open run back up, reopening a second chance in place.
 * A side quest's run brings its `site`, and a build run its `plan`, each with the bench tasks it
 * already put right (first try or second) counted in, so the bench draws what was laid before.
 */
export function resumedStart(
  run: DeedRunRow,
  header: RunStart["deed"],
  site?: { stage: number; complete: boolean },
  plan?: { improvementId: ImprovementId; level: number },
): RunStart {
  const { questions, responses, attempts, statuses } = parseRun(run);
  const at = resumeIndex(statuses);
  const pending = statuses[at] === "open"
    ? { index: at, ruledOut: attempts[at].first ?? "", hint: hintFor(questions[at].skillId) }
    : null;
  const start: RunStart = { runId: run.id, deed: header, questions: questions.map(toClientTask), responses, kind: run.kind, pending };
  if (!site && !plan) return start;
  const placed = questions.filter((q, i) => kindOf(q) === "measure" && (statuses[i] === "right-first" || statuses[i] === "right-second")).length;
  return { ...start, ...(site ? { site: { ...site, placed } } : {}), ...(plan ? { plan: { ...plan, placed } } : {}) };
}

/** The grades that watch Aldo first (R-C9): the hero's grade in the deed's strand, K to 3. */
const DEMO_GRADES: readonly string[] = ["K", "1", "2", "3"];

/**
 * Whether the hero has answered a bench task in any run but `runId`: some task of kind measure with
 * a stored response, finished run or not. A run that merely held a bench task, left unanswered, is
 * not enough. Read in the database (SQLite's JSON functions), so it costs one row whatever the
 * history; a row whose JSON will not parse, or parses to an odd shape (questions not an array, an
 * element not an object), is passed over, never fatal.
 */
async function hasAnsweredBench(childId: string, runId: string): Promise<boolean> {
  const { questions, responses } = schema.deedRun;
  // Valid JSON of the wrong shape throws in SQLite just as invalid JSON does (a string element is
  // "malformed JSON" to json_extract; an object's keys make a bad `$[key]` path), and SQLite does
  // not promise AND short-circuits, so every shape guard is a CASE, nested in the order it is needed.
  const answered = sql`CASE WHEN json_valid(${questions}) AND json_valid(${responses}) THEN
    CASE WHEN json_type(${questions}) = 'array' AND json_type(${responses}) = 'array' THEN EXISTS (
      SELECT 1 FROM json_each(${questions}) AS task
      WHERE CASE WHEN task.type = 'object' THEN json_extract(task.value, '$.kind') ELSE NULL END = 'measure'
        AND json_extract(${responses}, '$[' || task.key || ']') IS NOT NULL
    ) ELSE 0 END
  ELSE 0 END = 1`;
  const rows = await db
    .select({ id: schema.deedRun.id })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), ne(schema.deedRun.id, runId), like(questions, '%"kind":"measure"%'), answered))
    .limit(1);
  return rows.length > 0;
}

/**
 * Where a side quest's run shows Aldo's worked example, if it does (R-C9): at the run's first bench
 * task, wherever it falls, for a hero whose grade in the strand is K to 3, while that task is still
 * unanswered and the hero has never answered a bench task in another run. A build run's bench tasks
 * count the same as a side quest's (R-D6). A review or a Crown Challenge never has one. The cheap
 * checks come first, so the history is only read for a run that could show it.
 */
export async function benchDemoAt(childId: string, grade: string, run: Pick<RunStart, "runId" | "kind" | "questions" | "responses">): Promise<number | null> {
  if ((run.kind !== "deed" && run.kind !== "build") || !DEMO_GRADES.includes(grade)) return null;
  const at = run.questions.findIndex((q) => q.kind === "measure");
  if (at === -1 || (run.responses[at] ?? null) !== null) return null;
  return (await hasAnsweredBench(childId, run.runId)) ? null : at;
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
