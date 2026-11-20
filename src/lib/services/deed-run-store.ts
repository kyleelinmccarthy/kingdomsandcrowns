import { and, desc, eq, gt, inArray, isNotNull, isNull, like, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { RUN_EFFECTS, kindsThatFeedReview, type RunKind } from "@/lib/utils/deed-scoring";
import { records, resumeIndex, statusOf } from "@/lib/utils/deed-attempts";
import { hintFor } from "@/lib/utils/skill-hints";
import { isRegisteredKind, isTaskCorrect, kindOf, toClientTask, type Task } from "@/lib/tasks/registry";
import { demoKeyOf } from "@/lib/tasks/demos";
import type { HandsOnKind } from "@/lib/tasks/kinds";
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
 * (`RUN_EFFECTS`: deeds, builds and reviews), newest first, each graded by its own kind. Only first answers
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

/** The grades that watch a worked example first (R-C9, R-F10): the hero's grade in the run's strand, K to 3. */
const DEMO_GRADES: readonly string[] = ["K", "1", "2", "3"];
/** The runs that show one: a side quest's, a build run, and a world run (Puzzle practice); never a review or a Crown Challenge. */
const DEMO_RUN_KINDS: readonly RunKind[] = ["deed", "build", "world"];

/**
 * Whether the hero has answered a task of `kind` (a hands-on kind: a bench task, a lock) in any run
 * but `runId`: some task of that kind with a stored response, finished run or not. A run that merely
 * held one, left unanswered, is not enough. Read in the database (SQLite's JSON functions), so it
 * costs one row whatever the history; a row whose JSON will not parse, or parses to an odd shape
 * (questions not an array, an element not an object), is passed over, never fatal.
 */
export async function hasAnsweredKind(childId: string, kind: HandsOnKind, runId: string): Promise<boolean> {
  const { questions, responses } = schema.deedRun;
  // Valid JSON of the wrong shape throws in SQLite just as invalid JSON does (a string element is
  // "malformed JSON" to json_extract; an object's keys make a bad `$[key]` path), and SQLite does
  // not promise AND short-circuits, so every shape guard is a CASE, nested in the order it is needed.
  const answered = sql`CASE WHEN json_valid(${questions}) AND json_valid(${responses}) THEN
    CASE WHEN json_type(${questions}) = 'array' AND json_type(${responses}) = 'array' THEN EXISTS (
      SELECT 1 FROM json_each(${questions}) AS task
      WHERE CASE WHEN task.type = 'object' THEN json_extract(task.value, '$.kind') ELSE NULL END = ${kind}
        AND json_extract(${responses}, '$[' || task.key || ']') IS NOT NULL
    ) ELSE 0 END
  ELSE 0 END = 1`;
  const rows = await db
    .select({ id: schema.deedRun.id })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), ne(schema.deedRun.id, runId), like(questions, `%"kind":"${kind}"%`), answered))
    .limit(1);
  return rows.length > 0;
}

/**
 * Where a run shows a worked example, if it does (R-C9, R-F10): Aldo at the bench, or Pip at a lock
 * (`demoKeyOf` says which tasks have one). It is the first such task of a hands-on kind the hero has
 * never answered, wherever it falls, for a hero whose grade in the strand is K to 3: never answered
 * in another run (`hasAnsweredKind`), nor earlier in this one. A side quest's run, a build run (R-D6)
 * and a world run (Puzzle practice) show it; a review or a Crown Challenge never has one. With a new bench task and a new lock
 * in one run, the earlier is marked (one demo a run). The cheap checks come first, so the history is
 * only read for a run that could show one.
 */
export async function demoAt(childId: string, grade: string, run: Pick<RunStart, "runId" | "kind" | "questions" | "responses">): Promise<number | null> {
  if (!DEMO_RUN_KINDS.includes(run.kind) || !DEMO_GRADES.includes(grade)) return null;
  const tried = new Set<string>();
  for (const [at, q] of run.questions.entries()) {
    if (demoKeyOf(q) === null || tried.has(q.kind)) continue;
    tried.add(q.kind);
    const kind = q.kind as HandsOnKind;
    const answeredHere = run.questions.some((x, j) => x?.kind === kind && (run.responses[j] ?? null) !== null);
    if (!answeredHere && !(await hasAnsweredKind(childId, kind, run.runId))) return at;
  }
  return null;
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
