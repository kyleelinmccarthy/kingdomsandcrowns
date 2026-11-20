// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { CLOSED, PRACTICE_HERO_ONLY, PRACTICE_OFF } from "@/lib/utils/deed-refusals";
import { PUZZLE_PRACTICE } from "@/lib/utils/practice-copy";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { TASK_KINDS, isTaskCorrect, kindOf } from "@/lib/tasks/registry";
import type { LockTask, Task } from "@/lib/tasks/types";
import { KINGDOM_PROGRESS_DDL, REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * Puzzle practice against a REAL libsql database (R-F8, R-F9): a `world` run of three logic locks
 * at the hero's own grade, owned by no deed, named by `sourceRef "practice"`. It is the hero's
 * alone, refused while locks are off, picked back up rather than stacked, and finished it moves
 * mastery and pays nothing.
 */
const client = testDatabase("practice-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "child:c1" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-play", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/realm-play")>("@/lib/services/realm-play");
  return { ...actual, loadRealmSettings: vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS })), paySideQuest: vi.fn(actual.paySideQuest) };
});
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: "2026-11-09", timeOfDay: "10:00" }) }));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: vi.fn(async () => null) }));
const HERO = (logic: string, enabled = true) => ({
  enabled, tone: "gentle" as const, band: "g45" as const,
  // Every strand but logic sits elsewhere, so a draw from the wrong strand would show.
  grades: { math: "8", reading: "8", language: "8", science: "8", logic } as never,
});
vi.mock("@/lib/services/deeds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/deeds")>("@/lib/services/deeds");
  return {
    ...actual,
    loadHeroLevels: vi.fn(async () => HERO("5")),
    // The page's overview: the kingdom itself is not what these tests are about.
    loadKingdomOverview: vi.fn(async () => ({ ...HERO("5"), buildings: [] })),
  };
});

const { startPracticeRun } = await import("./practice");
const { answerDeedQuestion, completeDeedRun, getDeedsOverview, resolveDeedQuestion } = await import("./deeds");
const { requireChildAccess } = await import("@/lib/auth/access");
const { loadHeroLevels } = await import("@/lib/services/deeds");
const { loadRealmSettings, paySideQuest } = await import("@/lib/services/realm-play");

const DDL = [
  `CREATE TABLE deed_run (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, deed_id text, source_ref text, skill_ids text NOT NULL,
    band text NOT NULL, questions text NOT NULL, responses text DEFAULT '[]' NOT NULL,
    mastery_start text DEFAULT '{}' NOT NULL, correct_count integer DEFAULT 0 NOT NULL,
    flawless integer DEFAULT false NOT NULL, started_at integer NOT NULL, completed_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL,
    second_tries text DEFAULT '[]' NOT NULL, stars integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'deed' NOT NULL, second_chances integer DEFAULT false NOT NULL)`,
  `CREATE TABLE skill_mastery (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL,
    level integer DEFAULT 0 NOT NULL, recent_results text DEFAULT '[]' NOT NULL,
    correct_total integer DEFAULT 0 NOT NULL, attempt_total integer DEFAULT 0 NOT NULL,
    last_practiced_at integer, created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX skill_mastery_child_skill_idx ON skill_mastery (child_id, skill_id)`,
  ...KINGDOM_PROGRESS_DDL,
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
];
const TABLES = ["deed_run", "skill_mastery", "kingdom_progress", "realm_settings", "realm_play_ledger", "child"];

const GROWN_UP = { access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>;
const LOCKS_OFF = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: false } };

const count = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
const runs = () => count("SELECT count(*) AS n FROM deed_run");
async function storedTasks(runId: string): Promise<Task[]> {
  return JSON.parse((await client.query("SELECT questions FROM deed_run WHERE id = ?1", [runId])).rows[0].questions as string) as Task[];
}
const right = (t: Task): string => TASK_CODECS.lock.encode((t as LockTask).solution);
/** A response the lock accepts as well formed that is still wrong: its own solution with one cell changed. */
function wrong(t: Task): string {
  const { puzzle, cells } = (t as LockTask).solution;
  for (const [i, c] of cells.entries()) {
    for (let v = 0; v <= 9; v++) {
      if (v === c) continue;
      const s = TASK_CODECS.lock.encode({ puzzle, cells: cells.map((x, j) => (j === i ? v : x)) } as LockTask["solution"]);
      if (TASK_KINDS.lock.parseResponse(s, t as LockTask) !== null && !isTaskCorrect(t, s)) return s;
    }
  }
  throw new Error(`no wrong response for ${t.id}`);
}

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of TABLES) await client.query(`DELETE FROM ${t}`);
  await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c1', 'f1', 'Ada')");
  vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
  vi.mocked(loadHeroLevels).mockResolvedValue(HERO("5") as never);
});

afterAll(async () => {
  client.close();
});

describe("startPracticeRun", () => {
  it("starts three logic locks at the hero's own grade: a world run owned by no deed, named practice", async () => {
    const r = await startPracticeRun("c1");
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(r.kind).toBe("world");
    expect(r.deed).toMatchObject({ id: "practice", title: PUZZLE_PRACTICE, area: "logic" });
    expect(r.questions).toHaveLength(3);
    expect(r.questions.every((q) => q.kind === "lock")).toBe(true);
    // The solution stays on the server.
    for (const q of r.questions) expect(JSON.stringify(q)).not.toMatch(/"solution"|"fits"/);
    expect(r.site).toBeUndefined();
    expect(r.plan).toBeUndefined();
    const tasks = await storedTasks(r.runId);
    expect(new Set(tasks.map((t) => t.skillId))).toEqual(new Set(["logic-g45"]));
    const row = (await client.query("SELECT deed_id, source_ref, kind, band, skill_ids, second_chances FROM deed_run WHERE id = ?1", [r.runId])).rows[0];
    expect(row).toMatchObject({ deed_id: null, source_ref: "practice", kind: "world", band: "g45", skill_ids: '["logic-g45"]', second_chances: 1 });
  });

  it("asks at the logic grade, whatever the other strands' grades are", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO("9") as never);
    const r = await startPracticeRun("c1");
    expect(new Set((await storedTasks(r.runId)).map((t) => t.skillId))).toEqual(new Set(["logic-g912"]));
  });

  it("freezes the second-chance setting on the run", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, secondChances: false });
    const r = await startPracticeRun("c1");
    expect(Number((await client.query("SELECT second_chances FROM deed_run WHERE id = ?1", [r.runId])).rows[0].second_chances)).toBe(0);
  });

  it("a second start picks the open practice run back up rather than stacking a new one", async () => {
    const first = await startPracticeRun("c1");
    const tasks = await storedTasks(first.runId);
    await answerDeedQuestion(first.runId, 0, right(tasks[0]));
    const again = await startPracticeRun("c1");
    expect(again.runId).toBe(first.runId);
    expect(again.kind).toBe("world");
    expect(again.deed).toEqual(first.deed);
    expect(again.responses[0]).not.toBeNull();
    expect(await runs()).toBe(1);
  });

  it("a finished practice run is not resumed, and neither is a review's open run", async () => {
    const first = await startPracticeRun("c1");
    const tasks = await storedTasks(first.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(first.runId, i, right(t));
    await completeDeedRun(first.runId);
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, source_ref, skill_ids, band, questions, responses, started_at, created_at, updated_at, kind)
       VALUES ('rev', 'c1', NULL, 'practice', '[]', 'g45', '[]', '[]', unixepoch(), unixepoch(), unixepoch(), 'review')`,
    );
    const next = await startPracticeRun("c1");
    expect([first.runId, "rev"]).not.toContain(next.runId);
    expect(await runs()).toBe(3);
  });

  it("refuses a grown-up, before anything is read or written", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    await expect(startPracticeRun("c1")).rejects.toThrow(PRACTICE_HERO_ONLY);
    expect(await runs()).toBe(0);
  });

  it("refuses a hero the caller may not act for (outside the family), and writes nothing", async () => {
    vi.mocked(requireChildAccess).mockRejectedValueOnce(new Error("Not your hero."));
    await expect(startPracticeRun("c2")).rejects.toThrow("Not your hero.");
    expect(await runs()).toBe(0);
  });

  it("is refused while the grown-up has locks switched off, even with a practice run open (Review Focus 4)", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
    await expect(startPracticeRun("c1")).rejects.toThrow(PRACTICE_OFF);
    expect(await runs()).toBe(0);
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
    await startPracticeRun("c1");
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
    await expect(startPracticeRun("c1")).rejects.toThrow(PRACTICE_OFF);
    expect(await runs()).toBe(1);
  });

  it("is refused while the Realm is closed", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO("5", false) as never);
    await expect(startPracticeRun("c1")).rejects.toThrow(CLOSED);
    expect(await runs()).toBe(0);
  });
});

describe("a finished Puzzle practice run", () => {
  it("moves mastery, pays nothing, earns no stars and raises nothing (R-F9)", async () => {
    const r = await startPracticeRun("c1");
    const tasks = await storedTasks(r.runId);
    // A miss given up, then two right first time.
    expect(await answerDeedQuestion(r.runId, 0, wrong(tasks[0]))).toMatchObject({ correct: false, secondChance: true });
    expect(await resolveDeedQuestion(r.runId, 0)).toMatchObject({ correct: false, reveal: right(tasks[0]) });
    for (const i of [1, 2]) expect(await answerDeedQuestion(r.runId, i, right(tasks[i]))).toMatchObject({ correct: true });
    vi.mocked(paySideQuest).mockClear();
    const summary = await completeDeedRun(r.runId);
    expect(summary).toMatchObject({
      kind: "world", correctCount: 2, total: 3, flawless: false, stars: 0, counted: false, building: null, minutesEarned: 0, sideQuestPayFull: false,
    });
    expect(paySideQuest).not.toHaveBeenCalled();
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger WHERE kind = 'practice'")).toBe(0);
    const m = (await client.query("SELECT correct_total, attempt_total FROM skill_mastery WHERE child_id = 'c1' AND skill_id = 'logic-g45'")).rows[0];
    expect(m).toMatchObject({ correct_total: 2, attempt_total: 3 });
  });

  it("every answer right still earns no star and pays nothing", async () => {
    const r = await startPracticeRun("c1");
    const tasks = await storedTasks(r.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(r.runId, i, right(t));
    expect(await completeDeedRun(r.runId)).toMatchObject({ kind: "world", flawless: true, stars: 0, minutesEarned: 0 });
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger WHERE kind = 'practice'")).toBe(0);
  });
});

describe("Pip shows a young hero their first lock in Puzzle practice (R-F10, F4 carry-over)", () => {
  it("is at the first lock for a grade-2 hero who never answered one, fresh and resumed", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO("2") as never);
    const fresh = await startPracticeRun("c1");
    expect(fresh.demo).toEqual({ at: 0 });
    expect((await startPracticeRun("c1")).demo).toEqual({ at: 0 });
  });

  it("is gone once that lock is answered", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO("2") as never);
    const fresh = await startPracticeRun("c1");
    const tasks = await storedTasks(fresh.runId);
    expect(kindOf(tasks[0])).toBe("lock");
    await answerDeedQuestion(fresh.runId, 0, right(tasks[0]));
    expect((await startPracticeRun("c1")).demo).toBeUndefined();
  });

  it("is never due for a grade-5 hero", async () => {
    expect((await startPracticeRun("c1")).demo).toBeUndefined();
  });
});

describe("the Side Quests page offers Puzzle practice only where it can start", () => {
  it("offers it to the hero while locks are on", async () => {
    expect((await getDeedsOverview("c1")).puzzlePractice).toBe(true);
  });

  it("hides it while locks are off (Review Focus 4)", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
    expect((await getDeedsOverview("c1")).puzzlePractice).toBe(false);
  });

  it("hides it from a grown-up looking at the hero's page, who could not start it", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    expect((await getDeedsOverview("c1")).puzzlePractice).toBe(false);
  });
});
