import { and, desc, eq, gt, inArray, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { RUN_EFFECTS, kindsThatFeedReview, type RunKind } from "@/lib/utils/deed-scoring";
import { records, resumeIndex, statusOf } from "@/lib/utils/deed-attempts";
import { isRegisteredKind, isTaskCorrect, kindOf, secondChanceHint, storedFeedback, toClientTask, type Task } from "@/lib/tasks/registry";
import { demoKeyOf, demoKind, isLockDemo, LOCK_DEMO_PUZZLES, type DemoKey } from "@/lib/tasks/demos";
import type { HandsOnKind } from "@/lib/tasks/kinds";
import type { RunStart } from "@/lib/utils/deed-run-types";
import type { ImprovementId } from "@/lib/realm/improvements";
import { RUNE_DEED_IDS } from "@/lib/utils/deeds";

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
 * (`RUN_EFFECTS`: deeds, builds, reviews and world runs such as Puzzle practice), newest first,
 * each graded by its own kind. Only first answers
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

/**
 * How many of a hero's latest reading side quests the trail drawer remembers (R-H11, RH-a / F-11): a
 * week of three a day, one per reading deed. A run at the default length uses at most two trails, so
 * 21 runs use at most 42, and every pool holds at least 45: a week of reading side quests never meets
 * the same trail twice.
 */
export const TRAIL_MEMORY_RUNS = 21;

/**
 * The trails (`<poolId>/<trailId>`) the hero met in their last `TRAIL_MEMORY_RUNS` runs of `deedIds`
 * (`TRAIL_DEED_IDS`), newest run first, each key once. One query. Every run counts, of any kind and
 * open or finished, since a trail was read whether or not the run was. Only a stored task of kind
 * `"trail"` whose `trail` is a string is read; a row that will not parse, or parses to another shape,
 * is skipped, never fatal.
 */
export async function loadRecentTrailIds(childId: string, deedIds: readonly string[]): Promise<string[]> {
  if (deedIds.length === 0) return [];
  const runs = await db
    .select({ questions: schema.deedRun.questions })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), inArray(schema.deedRun.deedId, [...deedIds])))
    .orderBy(desc(schema.deedRun.startedAt))
    .limit(TRAIL_MEMORY_RUNS);
  return collectTaskKeys(runs, "trail", "trail");
}

/**
 * The keys stored runs' tasks of one `kind` hold in `field` (a trail's `trail`, a rune's `entry`),
 * in the rows' order, each key once. Only a task of that kind whose field is a string is read; a
 * row that will not parse, or parses to another shape, is skipped, never fatal.
 */
export function collectTaskKeys(rows: readonly { questions: string }[], kind: "trail" | "rune", field: "trail" | "entry"): string[] {
  const keys = new Set<string>();
  for (const run of rows) {
    let qs: unknown;
    try {
      qs = JSON.parse(run.questions);
    } catch {
      continue;
    }
    if (!Array.isArray(qs)) continue;
    for (const q of qs as unknown[]) {
      if (typeof q !== "object" || q === null) continue;
      const task = q as Record<string, unknown>;
      const key = task[field];
      if (task.kind === kind && typeof key === "string") keys.add(key);
    }
  }
  return [...keys];
}

/**
 * How many of a hero's latest rune runs the rune drawer remembers (R-I19): a week of three a day.
 * A run uses at most three words, so 21 runs use at most 63, and every pool holds 16 entries of
 * each effect (80 a band): a week of runes never meets an entry twice.
 */
export const RUNE_MEMORY_RUNS = 21;

/**
 * The rune entries (`<poolId>/<entryId>`) the hero met in their last `RUNE_MEMORY_RUNS` rune runs,
 * newest run first, each key once: their rune side quests (`RUNE_DEED_IDS`, any kind) and the rune
 * objects they set out to fix (`world` runs owned by a `rune:` object) together. One query. Open
 * and finished runs alike, since a word was met whether or not the run was finished. Nothing else
 * (a chest, Puzzle practice, a Tower floor) is read, so other runs never crowd the memory.
 */
export async function loadRecentRuneKeys(childId: string): Promise<string[]> {
  const R = schema.deedRun;
  const objects = and(eq(R.kind, "world"), like(R.sourceRef, "rune:%"));
  const runes = RUNE_DEED_IDS.length > 0 ? or(inArray(R.deedId, [...RUNE_DEED_IDS]), objects) : objects;
  const rows = await db
    .select({ questions: R.questions })
    .from(R)
    .where(and(eq(R.childId, childId), runes))
    .orderBy(desc(R.startedAt))
    .limit(RUNE_MEMORY_RUNS);
  return collectTaskKeys(rows, "rune", "entry");
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
  // The answer's feedback code rides along (every kind), so the reopened try leads with the kind's
  // own words (a lock's, a cut's, a trail's) and never falls back to "Not quite.".
  const feedback = statuses[at] === "open" ? storedFeedback(questions[at], attempts[at].first) : undefined;
  const pending = statuses[at] === "open"
    ? { index: at, ruledOut: attempts[at].first ?? "", hint: secondChanceHint(questions[at], attempts[at].first), ...(feedback ? { feedback } : {}) }
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
 * Which demos one answered task counts as seen: Aldo's two are one, so any bench task (as since
 * R-C9); each of Pip's is its own puzzles (`LOCK_DEMO_PUZZLES`, RF-g), so a word sort answered
 * never hides the shape grid's demo; and Pip's clue is any trail task (R-H16).
 */
const demoGroup = (key: DemoKey): string => (demoKind(key) === "measure" ? "bench" : key);

/**
 * Whether the hero has answered a task of demo `key`'s group (`demoGroup`) in any run but `runId`:
 * for a bench key any bench task, for a lock key a lock of one of its puzzles, for the trail's any
 * clue, with a stored
 * response, finished run or not. A run that merely held one, left unanswered, is not enough. Read
 * in the database (SQLite's JSON functions, on the stored task's own `kind` and `puzzle`), so it
 * costs one row whatever the history; a row whose JSON will not parse, or parses to an odd shape
 * (questions not an array, an element not an object), is passed over, never fatal.
 */
export async function hasAnsweredDemo(childId: string, key: DemoKey, runId: string): Promise<boolean> {
  const { questions, responses } = schema.deedRun;
  const kind: HandsOnKind = demoKind(key);
  const field = (path: string) => sql`CASE WHEN task.type = 'object' THEN json_extract(task.value, ${path}) ELSE NULL END`;
  const ofPuzzle = isLockDemo(key)
    ? sql` AND ${field("$.puzzle")} IN (${sql.join(LOCK_DEMO_PUZZLES[key].map((p) => sql`${p}`), sql`, `)})`
    : sql``;
  // Valid JSON of the wrong shape throws in SQLite just as invalid JSON does (a string element is
  // "malformed JSON" to json_extract; an object's keys make a bad `$[key]` path), and SQLite does
  // not promise AND short-circuits, so every shape guard is a CASE, nested in the order it is needed.
  const answered = sql`CASE WHEN json_valid(${questions}) AND json_valid(${responses}) THEN
    CASE WHEN json_type(${questions}) = 'array' AND json_type(${responses}) = 'array' THEN EXISTS (
      SELECT 1 FROM json_each(${questions}) AS task
      WHERE ${field("$.kind")} = ${kind}${ofPuzzle}
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
 * Where a run shows a worked example, if it does (R-C9, R-F10, R-H16): Aldo at the bench, Pip at a
 * lock, or Pip following a clue (`demoKeyOf` says which tasks have one). For a hero whose grade in the strand is K to 3, it is the
 * first task whose demo the hero has never seen in another run (`hasAnsweredDemo`, per demo: Aldo's
 * once, each of Pip's once), wherever it falls. That is the run's one demo: once a task of that demo
 * is answered in this run (a resumed run, past it), the run shows none, never a second. A side
 * quest's run, a build run (R-D6) and a world run (Puzzle practice) show it; a review or a Crown
 * Challenge never has one. The cheap checks come first, so the history is only read for a run that
 * could show one.
 */
export async function demoAt(childId: string, grade: string, run: Pick<RunStart, "runId" | "kind" | "questions" | "responses">): Promise<number | null> {
  if (!DEMO_RUN_KINDS.includes(run.kind) || !DEMO_GRADES.includes(grade)) return null;
  const keys = run.questions.map(demoKeyOf);
  const groups = keys.map((k) => (k === null ? null : demoGroup(k)));
  const tried = new Set<string>();
  for (const [at, key] of keys.entries()) {
    const group = groups[at];
    if (key === null || group === null || tried.has(group)) continue;
    tried.add(group);
    if (await hasAnsweredDemo(childId, key, run.runId)) continue;
    const answeredHere = groups.some((g, j) => g === group && (run.responses[j] ?? null) !== null);
    return answeredHere ? null : at;
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
