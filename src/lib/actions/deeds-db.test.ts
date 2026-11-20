// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { hintFor } from "@/lib/utils/skill-hints";
import { CHALLENGE, SCORING, starsFor } from "@/lib/utils/deed-scoring";
import { CHALLENGE_NOT_READY, HERO_ONLY, PICK_SHOWN, TRY_DIFFERENT } from "@/lib/utils/deed-refusals";
import type { Question } from "@/lib/utils/drill-generators";
import type { LockTask, MeasureTask } from "@/lib/tasks/types";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { PATTERN } from "@/test/lock-stubs";
import { isTaskCorrect, kindOf, type Task } from "@/lib/tasks/registry";
import { BENCH } from "@/lib/tasks/bench";
import { KINGDOM_PROGRESS_DDL, REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * The second-chance contract against a REAL libsql database. Every rule here is enforced from
 * the stored run, so the test drives the actions against rows it seeded itself, and checks both
 * what reaches the browser (no answer while a try is open) and what was written (nothing, on a
 * refusal).
 */
const client = testDatabase("deeds-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "child:c1" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
// The run's own settings are mocked; side-quest pay is the real service, on the real ledger (it
// reads the hero's settings from `realm_settings` itself).
vi.mock("@/lib/services/realm-play", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/realm-play")>("@/lib/services/realm-play");
  return { ...actual, loadRealmSettings: vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS })), paySideQuest: vi.fn(actual.paySideQuest) };
});
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: "2026-11-09", timeOfDay: "10:00" }) }));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: async () => null }));
vi.mock("@/lib/utils/deed-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/deed-engine")>("@/lib/utils/deed-engine");
  return { ...actual, buildDeedRun: vi.fn(actual.buildDeedRun) };
});
vi.mock("@/lib/services/deeds", async () => ({
  ...(await vi.importActual<typeof import("@/lib/services/deeds")>("@/lib/services/deeds")),
  loadHeroLevels: vi.fn(async () => ({
    enabled: true, tone: "gentle", band: "3-5",
    grades: { math: "3", reading: "3", language: "3", science: "3" },
  })),
}));

const { answerDeedQuestion, retryDeedQuestion, resolveDeedQuestion, completeDeedRun, startDeedRun } = await import("./deeds");
const { getSchoolCounts } = await import("./subjects");
const { getRealmAccess, recordRealmPlay } = await import("./realm-play");
const { loadDeedBest, loadHeroLevels } = await import("@/lib/services/deeds");
const { loadRealmSettings, paySideQuest } = await import("@/lib/services/realm-play");
const { buildDeedRun } = await import("@/lib/utils/deed-engine");
const { buildDeedRun: realBuildDeedRun } = await vi.importActual<typeof import("@/lib/utils/deed-engine")>("@/lib/utils/deed-engine");
const { requireChildAccess } = await import("@/lib/auth/access");

// The tables the run touches, as the migrations make them (foreign keys left out); `subject` and
// `activity_log` carry only the columns the school count reads.
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
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, spell_school text DEFAULT 'none' NOT NULL)`,
  `CREATE TABLE activity_log (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, subject_id text NOT NULL)`,
  `CREATE TABLE learning_focus (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL, created_at integer NOT NULL)`,
  `CREATE TABLE drill_item (
    id text PRIMARY KEY NOT NULL, pool_id text NOT NULL, skill_id text NOT NULL, band text NOT NULL, prompt text NOT NULL,
    answer text NOT NULL, distractors text NOT NULL, read_aloud text, level integer DEFAULT 2 NOT NULL, updated_at integer NOT NULL)`,
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
  // The open season a raised building's record names (the columns `buildingAfter` reads).
  `CREATE TABLE season (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, ordinal integer DEFAULT 1 NOT NULL, start_date text NOT NULL, completed_at integer)`,
];

const SKILL = "mul-facts";
const QUESTIONS: Question[] = [
  { id: "q0", skillId: SKILL, prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" },
  { id: "q1", skillId: SKILL, prompt: "3 x 3?", choices: ["9", "6", "12", "8"], answer: "9" },
  { id: "q2", skillId: SKILL, prompt: "4 x 3?", choices: ["12", "7", "16", "10"], answer: "12", explain: "4 x 3 is 4 + 4 + 4 = 12." },
  { id: "q3", skillId: SKILL, prompt: "5 x 3?", choices: ["15", "8", "20", "18"], answer: "15" },
];

type Seed = {
  id?: string; questions?: Question[]; responses?: (string | null)[]; secondTries?: string;
  secondChances?: boolean; completed?: boolean; stars?: number; kind?: "deed" | "challenge" | "review";
  /** The side quest the run is of; the Village Well's "Count the Well Stones" unless given. */
  deedId?: string;
};

async function seedRun(over: Seed = {}): Promise<string> {
  const id = over.id ?? "run1";
  const qs = over.questions ?? QUESTIONS;
  await client.query(
    `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
       started_at, completed_at, created_at, updated_at, second_tries, stars, kind, second_chances)
     VALUES (?1, 'c1', ?10, ?2, '3-5', ?3, ?4, '{}', unixepoch(), ?5, unixepoch(), unixepoch(), ?6, ?7, ?9, ?8)`,
    [
      id, JSON.stringify([SKILL]), JSON.stringify(qs), JSON.stringify(over.responses ?? qs.map(() => null)),
      over.completed ? new Date() : null, over.secondTries ?? "[]", over.stars ?? 0, over.secondChances ?? true,
      over.kind ?? "deed", over.deedId ?? "well-stones",
    ],
  );
  return id;
}

/** A right and a surely wrong response for any stored task, from its own solution (a run drawn at random may hold either kind). */
function rightAndWrong(t: Task): { right: string | number[]; wrong: string | number[] } {
  if (kindOf(t) === "choice") {
    const q = t as Question;
    return { right: q.answer, wrong: q.choices.find((c) => c !== q.answer)! };
  }
  const m = t as MeasureTask;
  if (m.mode === "cut") return { right: m.answer!, wrong: "12345" };
  const wrong = m.pieces!.map((_, i) => [i]).find((picks) => !isTaskCorrect(t, `a:${picks.join(",")}`));
  return { right: m.solution!, wrong: wrong! };
}

async function stored(id = "run1"): Promise<{ responses: string; second_tries: string; stars: number; completed_at: number | null }> {
  const r = await client.query("SELECT responses, second_tries, stars, completed_at FROM deed_run WHERE id = ?1", [id]);
  return r.rows[0];
}

async function deedsDone(): Promise<number> {
  const r = await client.query("SELECT coalesce(sum(deeds_done), 0) AS n FROM kingdom_progress WHERE child_id = 'c1'");
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["deed_run", "skill_mastery", "kingdom_progress", "realm_settings", "realm_play_ledger", "recess_block", "learning_focus", "drill_item", "child", "season"]) await client.query(`DELETE FROM ${t}`);
  vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
  vi.mocked(buildDeedRun).mockClear();
});

afterAll(async () => {
  client.close();
});

describe("a wrong first answer with a second chance open", () => {
  it("sends a hint and keeps the answer and the explanation on the server", async () => {
    await seedRun();
    const r = await answerDeedQuestion("run1", 2, "7");
    expect(r).toMatchObject({ correct: false, secondChance: true, hint: hintFor(SKILL) });
    expect("answer" in r).toBe(false);
    expect("explain" in r).toBe(false);
  });

  it("a repeat of the first answer still keeps the answer hidden", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 2, "7");
    const again = await answerDeedQuestion("run1", 2, "16");
    expect(again.secondChance).toBe(true);
    expect("answer" in again).toBe(false);
  });

  it("echoes the stored first pick while the second chance is open, so a late repeat never rules out a new choice", async () => {
    await seedRun();
    expect((await answerDeedQuestion("run1", 2, "7")).firstPick).toBe("7");
    expect((await answerDeedQuestion("run1", 2, "12")).firstPick).toBe("7");
    expect("firstPick" in (await retryDeedQuestion("run1", 2, "16"))).toBe(false);
  });

  it("a right retry resolves with the answer, and mastery read only the first try", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    const r = await retryDeedQuestion("run1", 1, "9");
    expect(r).toMatchObject({ correct: true, secondChance: false, answer: "9" });
    const row = await client.query("SELECT recent_results, attempt_total FROM skill_mastery WHERE child_id = 'c1' AND skill_id = ?1", [SKILL]);
    expect(JSON.parse(row.rows[0].recent_results).at(-1)).toBe(false);
    expect(row.rows[0].attempt_total).toBe(1);
  });

  it("a wrong retry resolves with the answer and the explanation", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 2, "7");
    const r = await retryDeedQuestion("run1", 2, "16");
    expect(r).toMatchObject({ correct: false, secondChance: false, answer: "12", explain: QUESTIONS[2].explain });
  });

  it("giving up resolves as a miss with the answer, and the hint when there is no explanation", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    const r = await resolveDeedQuestion("run1", 1);
    expect(r).toMatchObject({ correct: false, secondChance: false, answer: "9", hint: hintFor(SKILL) });
    expect("explain" in r).toBe(false);
    expect(JSON.parse((await stored()).second_tries)[1]).toBe("");
  });
});

describe("the skill meter during a run", () => {
  const meterRow = (level: number, recent: boolean[]) =>
    client.query(
      `INSERT INTO skill_mastery (id, child_id, skill_id, level, recent_results, created_at, updated_at)
       VALUES ('m1', 'c1', ?1, ?2, ?3, unixepoch(), unixepoch())`,
      [SKILL, level, JSON.stringify(recent)],
    );

  it("a deed run's first answer returns the pips it moved, labelled by the skill", async () => {
    await seedRun();
    expect(await answerDeedQuestion("run1", 0, "6")).toMatchObject({ meter: { skillLabel: "Multiplication facts", filled: 1, needed: 7 }, rungChange: null });
    expect(await answerDeedQuestion("run1", 1, "6")).toMatchObject({ meter: { filled: 1, needed: 7 } });
  });

  it("a promotion says so, and the meter starts over", async () => {
    await meterRow(1, [true, true, true, false, true, true, true]);
    await seedRun();
    const r = await answerDeedQuestion("run1", 0, "6");
    expect(r.rungChange).toBe("Multiplication facts: getting stronger!");
    expect(r.meter).toEqual({ skillLabel: "Multiplication facts", filled: 0, needed: 7 });
  });

  it("a step down is never announced mid-run", async () => {
    await meterRow(2, [false, true, false, true, false]);
    await seedRun();
    const r = await answerDeedQuestion("run1", 0, "5");
    expect(r.rungChange).toBeNull();
    expect(r.meter).toEqual({ skillLabel: "Multiplication facts", filled: 0, needed: 7 });
  });

  it("reaching the top leaves no meter to show", async () => {
    await meterRow(3, [true, true, true, true, true, true, true]);
    await seedRun();
    const r = await answerDeedQuestion("run1", 0, "6");
    expect(r.rungChange).toBe("Multiplication facts: getting stronger!");
    expect(r.meter).toBeNull();
  });

  it("a Crown Challenge moves nothing, so it has no meter", async () => {
    await seedRun({ kind: "challenge" });
    const r = await answerDeedQuestion("run1", 0, "6");
    expect(r.meter ?? null).toBeNull();
    expect(r.rungChange ?? null).toBeNull();
  });

  it("a retry and a give-up carry no meter", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    expect((await retryDeedQuestion("run1", 1, "9")).meter ?? null).toBeNull();
    await answerDeedQuestion("run1", 0, "5");
    expect((await resolveDeedQuestion("run1", 0)).meter ?? null).toBeNull();
  });
});

describe("out-of-order and repeated calls are refused, and write nothing", () => {
  async function refused(call: () => Promise<unknown>, message: string) {
    const before = await stored();
    await expect(call()).rejects.toThrow(message);
    expect(await stored()).toEqual(before);
  }

  it("a retry before any answer", async () => {
    await seedRun();
    await refused(() => retryDeedQuestion("run1", 0, "5"), "Answer the question first.");
  });

  it("a retry sent twice", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    await retryDeedQuestion("run1", 1, "12");
    await refused(() => retryDeedQuestion("run1", 1, "9"), "That question has already been answered.");
  });

  it("a retry for a question answered right", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 0, "6");
    await refused(() => retryDeedQuestion("run1", 0, "5"), "That question has already been answered.");
  });

  it("a give-up, then a retry", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    await resolveDeedQuestion("run1", 1);
    await refused(() => retryDeedQuestion("run1", 1, "9"), "That question has already been answered.");
  });

  it("a give-up with no second chance open", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 0, "6");
    await refused(() => resolveDeedQuestion("run1", 0), "That question has already been answered.");
  });

  it("a retry with the same choice as the first", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    await refused(() => retryDeedQuestion("run1", 1, " 6 "), "Try a different answer this time.");
  });

  it("a retry with a string not among the choices", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    await refused(() => retryDeedQuestion("run1", 1, "nine"), "Pick one of the answers shown.");
  });

  it("an index out of range", async () => {
    await seedRun();
    await refused(() => retryDeedQuestion("run1", 4, "9"), "That question is not in this side quest.");
    await refused(() => resolveDeedQuestion("run1", 1.5), "That question is not in this side quest.");
  });

  it("finishing with a second chance still open", async () => {
    await seedRun({ responses: ["6", "6", "12", "15"] });
    await refused(() => completeDeedRun("run1"), "Answer every question before finishing the side quest.");
    expect(await deedsDone()).toBe(0);
  });

  it("anything on a finished run", async () => {
    await seedRun({ responses: ["6", "6", "12", "15"], secondTries: JSON.stringify([null, null, null, null]), completed: true });
    await refused(() => retryDeedQuestion("run1", 1, "9"), "already been finished");
    await refused(() => resolveDeedQuestion("run1", 1), "already been finished");
  });
});

describe("two first answers at once", () => {
  it("to one question: one is stored, mastery moves once, and both callers hear what was stored", async () => {
    await seedRun();
    const results = await Promise.all([answerDeedQuestion("run1", 1, "9"), answerDeedQuestion("run1", 1, "6")]);
    const first = JSON.parse((await stored()).responses)[1];
    expect(["9", "6"]).toContain(first);
    const m = await client.query("SELECT attempt_total FROM skill_mastery WHERE child_id = 'c1' AND skill_id = ?1", [SKILL]);
    expect(m.rows[0].attempt_total).toBe(1);
    // A wrong pick stored leaves the second chance open: neither caller may have the answer.
    for (const r of results) expect("answer" in r).toBe(first === "9");
    // The winner alone carries the meter its answer moved; the loser keeps the one it had.
    const bare = (r: (typeof results)[number]) => ({ ...r, meter: undefined, rungChange: undefined });
    expect(bare(results[0])).toEqual(bare(results[1]));
    expect(results.filter((r) => r.meter)).toHaveLength(1);
  });

  it("to two questions: both are kept, and the count is of what was stored", async () => {
    await seedRun();
    await Promise.all([answerDeedQuestion("run1", 0, "6"), answerDeedQuestion("run1", 1, "9")]);
    expect(JSON.parse((await stored()).responses)).toEqual(["6", "9", null, null]);
    const r = await client.query("SELECT correct_count FROM deed_run WHERE id = 'run1'");
    expect(r.rows[0].correct_count).toBe(2);
  });
});

describe("stars on a finished run", () => {
  it("scores first, second, miss, first as one star, and the run raises its building", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 0, "6");
    await answerDeedQuestion("run1", 1, "6");
    await retryDeedQuestion("run1", 1, "9");
    await answerDeedQuestion("run1", 2, "7");
    expect((await resolveDeedQuestion("run1", 2)).answer).toBe("12");
    await answerDeedQuestion("run1", 3, "15");

    const s = await completeDeedRun("run1");
    expect(starsFor(5, 8)).toBe(1);
    expect(s).toMatchObject({ stars: 1, previousBest: 0, deedBest: 1, counted: true, kind: "deed", correctCount: 2, total: 4, flawless: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 1, stars: 1, maxStars: 9 });
    expect((await stored()).stars).toBe(1);
    expect(await deedsDone()).toBe(1);
  });

  it("a starless run teaches but does not build, and reports the best it did not beat", async () => {
    await seedRun({ responses: ["5", "6", "7", "8"], secondTries: JSON.stringify(["", "", "", ""]) });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: 0, previousBest: 0, deedBest: 0, counted: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 0, total: 3, complete: false, practice: false, stars: 0, maxStars: 9 });
    // It counts in the site's runs only (D13.3): the lifetime count, never the progress.
    expect(await deedsDone()).toBe(1);
  });

  it("a starless replay of a story already done keeps its best and its one place in the building", async () => {
    await seedRun({ id: "old", responses: ["6", "9", "12", "15"], secondTries: "[]", completed: true, stars: 2 });
    await seedRun({ responses: ["5", "6", "7", "8"], secondTries: JSON.stringify(["", "", "", ""]) });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: 0, previousBest: 2, deedBest: 2, counted: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 1, stars: 2, maxStars: 9 });
  });

  it("an old run (no snapshot, no second tries) resolves a miss at once and completes from its first answers", async () => {
    await seedRun({ secondTries: "[]", secondChances: false });
    for (const [i, a] of ["6", "9", "12"].entries()) await answerDeedQuestion("run1", i, a);
    const miss = await answerDeedQuestion("run1", 3, "8");
    expect(miss).toMatchObject({ correct: false, secondChance: false, answer: "15" });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: starsFor(6, 8), counted: true, correctCount: 3 });
  });

  it("a two-choice question never offers a second chance", async () => {
    const two: Question[] = QUESTIONS.map((q) => ({ ...q, choices: [q.answer, q.choices[1]] }));
    await seedRun({ questions: two });
    const r = await answerDeedQuestion("run1", 2, "7");
    expect(r).toMatchObject({ correct: false, secondChance: false, answer: "12", explain: QUESTIONS[2].explain });
  });

  it("a second finish is refused and the building is raised once", async () => {
    await seedRun({ responses: ["6", "9", "12", "15"] });
    await completeDeedRun("run1");
    await expect(completeDeedRun("run1")).rejects.toThrow("already been finished");
    expect(await deedsDone()).toBe(1);
  });
});

describe("the record of the work: each story once raises a building, and it remembers who raised it (D13)", () => {
  const ALL_RIGHT = { responses: ["6", "9", "12", "15"] };
  type Row = { deeds_done: number; completed_at: number | null; announced_at: number | null; raised_by_name: string | null; raised_season_id: string | null };
  async function well(): Promise<Row | undefined> {
    const r = await client.query("SELECT deeds_done, completed_at, announced_at, raised_by_name, raised_season_id FROM kingdom_progress WHERE child_id = 'c1' AND building_id = 'well'");
    return r.rows[0];
  }
  async function hero(name: string): Promise<void> {
    await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c1', 'f1', ?1)", [name]);
    await client.query("INSERT INTO season (id, child_id, ordinal, start_date, completed_at) VALUES ('s-old', 'c1', 1, '2025-08-01', unixepoch())");
    await client.query("INSERT INTO season (id, child_id, ordinal, start_date, completed_at) VALUES ('s-open', 'c1', 2, '2026-08-01', NULL)");
  }

  it("replaying one story five times does not raise the well; each of its three stories once does", async () => {
    await hero("Ada");
    for (const id of ["r1", "r2", "r3", "r4", "r5"]) {
      await seedRun({ id, ...ALL_RIGHT });
      expect((await completeDeedRun(id)).building).toMatchObject({ done: 1, total: 3, complete: false, practice: false });
    }
    expect(await well()).toMatchObject({ deeds_done: 5, completed_at: null });

    await seedRun({ id: "signs", deedId: "well-signs", ...ALL_RIGHT });
    expect((await completeDeedRun("signs")).building).toMatchObject({ done: 2, total: 3, complete: false });
    await seedRun({ id: "water", deedId: "well-water", ...ALL_RIGHT });
    const s = await completeDeedRun("water");
    expect(s.building).toMatchObject({ label: "Village Well", done: 3, total: 3, complete: true, practice: false });
    // Raised with the hero's name and open season, and left for the world to announce (D13.6).
    expect(await well()).toMatchObject({ deeds_done: 7, raised_by_name: "Ada", raised_season_id: "s-open", announced_at: null });
    expect((await well())!.completed_at).not.toBeNull();
  });

  it("counts a run only when it moved the building: a story's first star does, a starred replay of it does not", async () => {
    await seedRun({ id: "first", ...ALL_RIGHT });
    expect(await completeDeedRun("first")).toMatchObject({ stars: 3, previousBest: 0, counted: true, building: { done: 1, complete: false } });
    // The same story again, three stars again: practice, and the well stays at 1 of 3.
    await seedRun({ id: "again", ...ALL_RIGHT });
    expect(await completeDeedRun("again")).toMatchObject({ stars: 3, previousBest: 3, counted: false, building: { done: 1, complete: false, practice: false } });
    // A new story's first star moves it on.
    await seedRun({ id: "signs", deedId: "well-signs", ...ALL_RIGHT });
    expect(await completeDeedRun("signs")).toMatchObject({ previousBest: 0, counted: true, building: { done: 2, complete: false } });
    // Practice at a building that already stands moves nothing either.
    await seedRun({ id: "water", deedId: "well-water", ...ALL_RIGHT });
    expect(await completeDeedRun("water")).toMatchObject({ counted: true, building: { done: 3, complete: true, practice: false } });
    await seedRun({ id: "after", deedId: "well-water", ...ALL_RIGHT });
    expect(await completeDeedRun("after")).toMatchObject({ counted: false, building: { complete: true, practice: true } });
  });

  it("a run whose write raised the building counted, even on a story already done (a completion that was never written)", async () => {
    await seedRun({ id: "stones", deedId: "well-stones", completed: true, stars: 1 });
    await seedRun({ id: "signs", deedId: "well-signs", completed: true, stars: 1 });
    await seedRun({ id: "water", deedId: "well-water", completed: true, stars: 1 });
    await seedRun(ALL_RIGHT);
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ previousBest: 1, counted: true, building: { complete: true } });
    expect((await well())!.completed_at).not.toBeNull();
  });

  it("a page run that finishes the building leaves it unannounced, for the world to raise on the next visit", async () => {
    await hero("Ada");
    await seedRun({ id: "stones", deedId: "well-stones", completed: true, stars: 1 });
    await seedRun({ id: "signs", deedId: "well-signs", completed: true, stars: 2 });
    // The page's own finish, by a grown-up beside the hero: the Side Quests page never announces a rise.
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>);
    await seedRun({ id: "water", deedId: "well-water", ...ALL_RIGHT });
    expect((await completeDeedRun("water")).building).toMatchObject({ complete: true });
    const row = await well();
    expect(row!.completed_at).not.toBeNull();
    expect(row!.announced_at).toBeNull();
    // The hero's name, never the grown-up's.
    expect(row!.raised_by_name).toBe("Ada");
  });

  it("a run on a raised building is practice: it counts a run, says so, and keeps the name it was raised with", async () => {
    await hero("Rowan");
    await client.query(
      `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, raised_by_name, created_at, updated_at)
       VALUES ('kp1', 'c1', 'well', 4, unixepoch() - 86400, 'Ada', unixepoch(), unixepoch())`,
    );
    const raisedAt = (await well())!.completed_at;
    await seedRun(ALL_RIGHT);
    const s = await completeDeedRun("run1");
    expect(s.building).toMatchObject({ done: 3, total: 3, complete: true, practice: true });
    expect(await well()).toMatchObject({ deeds_done: 5, completed_at: raisedAt, raised_by_name: "Ada", raised_season_id: null });
  });

  it("two stories finishing the building at once write one name", async () => {
    await hero("Ada");
    // Every write of a name is logged, so a second (overwriting) write would show.
    await client.query("CREATE TABLE raise_log (n integer)");
    await client.query("CREATE TRIGGER raise_logged AFTER UPDATE OF raised_by_name ON kingdom_progress BEGIN INSERT INTO raise_log VALUES (1); END");
    try {
      await seedRun({ id: "stones", deedId: "well-stones", completed: true, stars: 1 });
      await seedRun({ id: "signs", deedId: "well-signs", ...ALL_RIGHT });
      await seedRun({ id: "water", deedId: "well-water", ...ALL_RIGHT });
      const [a, b] = await Promise.all([completeDeedRun("signs"), completeDeedRun("water")]);
      // Whichever finished second sees both stories: the building is raised either way, never lost to the race.
      expect([a.building!.complete, b.building!.complete]).toContain(true);
      expect(await well()).toMatchObject({ deeds_done: 2, raised_by_name: "Ada" });
      expect((await well())!.completed_at).not.toBeNull();
      expect(Number((await client.query("SELECT count(*) AS n FROM raise_log")).rows[0].n)).toBe(1);
    } finally {
      await client.query("DROP TRIGGER raise_logged");
      await client.query("DROP TABLE raise_log");
    }
  });

  it("a failed name or season lookup still raises the building, with nothing written for it", async () => {
    await seedRun({ id: "stones", deedId: "well-stones", completed: true, stars: 1 });
    await seedRun({ id: "signs", deedId: "well-signs", completed: true, stars: 1 });
    await seedRun({ id: "water", deedId: "well-water", ...ALL_RIGHT });
    // No hero row (the name reads nothing) and no season table at all (the season read throws).
    await client.query("ALTER TABLE season RENAME TO season_away");
    try {
      expect((await completeDeedRun("water")).building).toMatchObject({ complete: true });
    } finally {
      await client.query("ALTER TABLE season_away RENAME TO season");
    }
    expect(await well()).toMatchObject({ raised_by_name: null, raised_season_id: null, announced_at: null });
    expect((await well())!.completed_at).not.toBeNull();
  });

  it("a Crown Challenge counts no run at the site", async () => {
    await seedRun({ id: "earned", completed: true, stars: 3 });
    await seedRun({ kind: "challenge", ...ALL_RIGHT });
    expect((await completeDeedRun("run1")).building).toMatchObject({ done: 1, complete: false, practice: false });
    expect(await deedsDone()).toBe(0);
  });
});

describe("the best stars a hero holds", () => {
  it("keeps the best finished side quest, ignores unfinished runs, and a challenge never moves it", async () => {
    await seedRun({ id: "a", completed: true, stars: 2 });
    await seedRun({ id: "b", completed: true, stars: 1 });
    await seedRun({ id: "open", stars: 3 });
    await seedRun({ id: "c", completed: true, stars: 3, kind: "challenge" });
    expect(await loadDeedBest("c1")).toEqual([{ deedId: "well-stones", bestStars: 2, crowned: false }]);
  });

  it("crowns a side quest once a challenge on it was finished flawless", async () => {
    await seedRun({ id: "c", completed: true, kind: "challenge" });
    await client.query("UPDATE deed_run SET flawless = true WHERE id = 'c'");
    await seedRun({ id: "d", kind: "challenge" });
    expect(await loadDeedBest("c1")).toEqual([{ deedId: "well-stones", bestStars: 0, crowned: true }]);
    expect(await loadDeedBest("someone-else")).toEqual([]);
  });

  it("finishing a challenge leaves the side quest's best where it was", async () => {
    await seedRun({ id: "old", completed: true, stars: 2 });
    await seedRun({ kind: "challenge", responses: ["6", "9", "12", "15"] });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ kind: "challenge", previousBest: 2, deedBest: 2, counted: false });
    expect(s.building).toMatchObject({ stars: 2, maxStars: 9 });
  });
});

describe("startDeedRun resumes an open second chance", () => {
  it("reopens on that question with the first pick ruled out and the hint", async () => {
    await seedRun({ responses: ["6", "6", null, null], secondTries: JSON.stringify([null, null, null, null]) });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.runId).toBe("run1");
    expect(r.kind).toBe("deed");
    expect(r.pending).toEqual({ index: 1, ruledOut: "6", hint: hintFor(SKILL) });
    expect(JSON.stringify(r.questions)).not.toMatch(/"answer"|"explain"/);
  });

  it("has nothing pending when the run stopped between questions", async () => {
    await seedRun({ responses: ["6", "9", null, null] });
    expect((await startDeedRun("c1", "well-stones", "realm")).pending).toBeNull();
  });
});

describe("a side quest's run says where its building stands, for the bench's drawing", () => {
  /** The well's progress row: its lifetime runs, and whether it was ever raised. */
  const progress = (runs: number, raised = false) => client.query(
    `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, created_at, updated_at)
     VALUES ('kp1', 'c1', 'well', ?1, ?2, unixepoch(), unixepoch())`, [runs, raised ? new Date() : null]);

  it("a fresh run and a resumed one carry the site's stage, from the building's stories done", async () => {
    expect((await startDeedRun("c1", "well-stones", "realm")).site).toEqual({ stage: 0, complete: false, placed: 0 });
    await client.query("DELETE FROM deed_run");
    // Two of the well's three stories done once each, after six runs: stage 3 (`siteStage(2, 3)`).
    await seedRun({ id: "signs", deedId: "well-signs", completed: true, stars: 1 });
    await seedRun({ id: "water", deedId: "well-water", completed: true, stars: 2 });
    await progress(6);
    expect((await startDeedRun("c1", "well-stones", "realm")).site).toEqual({ stage: 3, complete: false, placed: 0 });
    expect((await startDeedRun("c1", "well-stones", "realm")).site).toEqual({ stage: 3, complete: false, placed: 0 }); // resumed
  });

  it("many runs of one story are one story done", async () => {
    for (const id of ["a", "b", "c", "d", "e"]) await seedRun({ id, deedId: "well-signs", completed: true, stars: 3 });
    await progress(5);
    expect((await startDeedRun("c1", "well-stones", "realm")).site).toEqual({ stage: 2, complete: false, placed: 0 });
  });

  it("a finished building says so, even with no story counted since (raised stays raised)", async () => {
    await progress(0, true);
    expect((await startDeedRun("c1", "well-stones", "realm")).site).toEqual({ stage: 4, complete: true, placed: 0 });
  });

  it("a resumed run counts the bench tasks it already put right, first try or second, so its drawing picks up where it was (RC-l)", async () => {
    const cut = (id: string): MeasureTask => ({ kind: "measure", id, skillId: SKILL, prompt: "Cut it.", mode: "cut", unit: "ft", answer: "3/4", step: "1/4", maxLength: "2", bridge: "3/4" });
    const assemble: MeasureTask = {
      kind: "measure", id: "m-asm", skillId: SKILL, prompt: "Fit it.", mode: "assemble", unit: "ft",
      pieces: [{ label: "1/2 ft", value: "1/2" }, { label: "1/4 ft", value: "1/4" }, { label: "1/8 ft", value: "1/8" }],
      target: { label: "3/4 ft", value: "3/4" }, solution: [0, 1], bridge: "1/2 + 1/4 = 3/4",
    };
    await seedRun({
      questions: [cut("m1"), cut("m2"), assemble, QUESTIONS[0], cut("m3")] as unknown as Question[],
      // right first; right on the second try; missed twice; a choice put right (lays nothing); not yet answered
      responses: ["c:3/4", "c:1/2", "a:0", "6", null],
      secondTries: JSON.stringify([null, "c:3/4", "a:2", null, null]),
    });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.runId).toBe("run1");
    expect(r.site).toEqual({ stage: 0, complete: false, placed: 2 });
  });

  it("a Crown Challenge raises nothing, so it carries no site", async () => {
    await progress(5);
    await seedRun({ id: "earned", responses: ["6", "9", "12", "15"], completed: true, stars: 3 });
    const r = await startDeedRun("c1", "well-stones", "realm", { challenge: true });
    expect("site" in r).toBe(false);
  });
});

describe("a young hero watches Aldo before the run's first bench task (R-C9, I-1)", () => {
  const cut = (id: string): MeasureTask => ({ kind: "measure", id, skillId: SKILL, prompt: "Cut it.", mode: "cut", unit: "ft", answer: "3/4", step: "1/4", maxLength: "2", bridge: "3/4" });
  /** The next fresh run opens on a bench task, whatever the engine would have drawn (no skill is benched by the settings yet). */
  const benchFirst = (n = 2) => vi.mocked(buildDeedRun).mockReturnValueOnce({ skillIds: [SKILL], questions: [cut("m1"), ...QUESTIONS.slice(0, n - 1)] });
  /** The next fresh run opens on two choice tasks and meets the bench third. */
  const benchThird = () => vi.mocked(buildDeedRun).mockReturnValueOnce({ skillIds: [SKILL], questions: [QUESTIONS[0], QUESTIONS[1], cut("m1"), QUESTIONS[2]] });
  const gradeIs = (math: string) => vi.mocked(loadHeroLevels).mockResolvedValue({
    enabled: true, tone: "gentle", band: "3-5", grades: { math, reading: "3", language: "3", science: "3" },
  } as unknown as Awaited<ReturnType<typeof loadHeroLevels>>);
  const demoOf = async () => (await startDeedRun("c1", "well-stones", "realm")).demo;
  afterEach(() => gradeIs("3"));

  it("is at task 0 for a grade-2 hero with no bench task answered before, on a fresh run and on its resume", async () => {
    gradeIs("2");
    benchFirst();
    expect(await demoOf()).toEqual({ at: 0 });
    expect(await demoOf()).toEqual({ at: 0 }); // resumed, still unanswered
  });

  it("is at the run's first bench task, wherever it falls: a run that opens on choice meets Aldo at task 2", async () => {
    gradeIs("K");
    benchThird();
    expect(await demoOf()).toEqual({ at: 2 });
  });

  it("stays due on a resume while only the choice tasks before it are answered, and goes once the bench task is", async () => {
    gradeIs("2");
    benchThird();
    const r = await startDeedRun("c1", "well-stones", "realm");
    await answerDeedQuestion(r.runId, 0, "6");
    await answerDeedQuestion(r.runId, 1, "9");
    expect(await demoOf()).toEqual({ at: 2 });
    await answerDeedQuestion(r.runId, 2, "c:3/4");
    expect(await demoOf()).toBeUndefined();
  });

  it("is due for every grade from K to 3", async () => {
    for (const g of ["K", "1", "3"]) {
      await client.query("DELETE FROM deed_run");
      gradeIs(g);
      benchFirst();
      expect(await demoOf(), g).toEqual({ at: 0 });
    }
  });

  it("is gone once the demo task is answered: a resumed run does not show it again", async () => {
    gradeIs("2");
    benchFirst();
    const r = await startDeedRun("c1", "well-stones", "realm");
    await answerDeedQuestion(r.runId, 0, "c:3/4");
    expect(await demoOf()).toBeUndefined();
  });

  it("is gone once the hero has answered a bench task in an earlier run, finished or not; a choice run does not count", async () => {
    gradeIs("2");
    await seedRun({ id: "choice-done", responses: ["6", "9", "12", "15"], completed: true });
    benchFirst();
    expect(await demoOf()).toEqual({ at: 0 });
    await client.query("DELETE FROM deed_run WHERE id != 'choice-done'");
    await seedRun({ id: "bench-done", questions: [cut("old")] as unknown as Question[], responses: ["c:1/2"], completed: true });
    benchFirst();
    expect(await demoOf()).toBeUndefined();
    // A run left open after a bench answer counts too: the hero has worked the bench.
    await client.query("DELETE FROM deed_run WHERE id != 'choice-done'");
    await seedRun({ id: "bench-half", questions: [QUESTIONS[0], cut("old")] as unknown as Question[], responses: [null, "c:3/4"] });
    await client.query("UPDATE deed_run SET deed_id = 'mill-sacks' WHERE id = 'bench-half'");
    benchFirst();
    expect(await demoOf()).toBeUndefined();
  });

  it("stays due after an earlier run that held a bench task the hero never answered", async () => {
    gradeIs("2");
    // Finished on its choice tasks, the bench task left unanswered.
    await seedRun({ id: "skipped", questions: [QUESTIONS[0], cut("old"), QUESTIONS[1]] as unknown as Question[], responses: ["6", null, "9"], completed: true });
    benchThird();
    expect(await demoOf()).toEqual({ at: 2 });
  });

  it("is not read from another hero's runs, and a row that will not parse is passed over", async () => {
    gradeIs("2");
    await seedRun({ id: "half", questions: [cut("old")] as unknown as Question[], responses: [null] });
    await client.query("UPDATE deed_run SET deed_id = 'mill-sacks'");
    await seedRun({ id: "theirs", questions: [cut("old")] as unknown as Question[], responses: ["c:3/4"], completed: true });
    await client.query("UPDATE deed_run SET child_id = 'c2' WHERE id = 'theirs'");
    await seedRun({ id: "broken", questions: [cut("old")] as unknown as Question[], responses: ["c:3/4"], completed: true });
    await client.query(`UPDATE deed_run SET questions = '[{"kind":"measure"', responses = 'nope' WHERE id = 'broken'`);
    benchFirst();
    expect(await demoOf()).toEqual({ at: 0 });
  });

  it("is never due for a grade-5 hero", async () => {
    gradeIs("5");
    benchThird();
    expect(await demoOf()).toBeUndefined();
  });

  it("is never due in a run with no bench task, even for a grade-2 hero", async () => {
    gradeIs("2");
    // Math side quests are played at the bench now, so the grown-up's switch is what makes a run choice.
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: false, lock: true } });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.questions.every((q) => q.kind === "choice")).toBe(true);
    expect(r.demo).toBeUndefined();
  });

  it("is never due in a Crown Challenge", async () => {
    gradeIs("2");
    await seedRun({ id: "earned", responses: ["6", "9", "12", "15"], completed: true, stars: 3 });
    benchFirst(3);
    expect((await startDeedRun("c1", "well-stones", "realm", { challenge: true })).demo).toBeUndefined();
  });
});

describe("the Crown Challenge", () => {
  const runCount = async () => Number((await client.query("SELECT count(*) AS n FROM deed_run")).rows[0].n);
  const masteryCount = async () => Number((await client.query("SELECT count(*) AS n FROM skill_mastery")).rows[0].n);
  const threeStars = () => seedRun({ id: "earned", responses: ["6", "9", "12", "15"], completed: true, stars: 3 });
  /** Starts a challenge and answers it from the stored questions: `right` decides each answer. */
  async function playChallenge(right: boolean[]): Promise<string> {
    const r = await startDeedRun("c1", "well-stones", "realm", { challenge: true });
    const row = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [r.runId]);
    const qs = JSON.parse(row.rows[0].questions) as Task[];
    for (const [i, q] of qs.entries()) {
      const { right: yes, wrong } = rightAndWrong(q);
      await answerDeedQuestion(r.runId, i, right[i] ? yes : wrong);
    }
    return r.runId;
  }

  it("is refused until the side quest has all three stars, and nothing is written", async () => {
    await expect(startDeedRun("c1", "well-stones", "realm", { challenge: true })).rejects.toThrow("Earn three stars on this side quest first.");
    await seedRun({ id: "two", completed: true, stars: 2 });
    await expect(startDeedRun("c1", "well-stones", "realm", { challenge: true })).rejects.toThrow("Earn three stars on this side quest first.");
    expect(await runCount()).toBe(1);
  });

  it("is refused when the pool is too thin for all three questions, and nothing is written", async () => {
    await threeStars();
    vi.mocked(buildDeedRun).mockReturnValueOnce({ skillIds: [SKILL], questions: QUESTIONS.slice(0, CHALLENGE.questions - 1) });
    await expect(startDeedRun("c1", "well-stones", "realm", { challenge: true })).rejects.toThrow(CHALLENGE_NOT_READY);
    expect(await runCount()).toBe(1);
  });

  it("is refused to a grown-up, from the world or the page", async () => {
    await threeStars();
    const grownUp = { access: { userId: "u1" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>;
    vi.mocked(requireChildAccess).mockResolvedValueOnce(grownUp).mockResolvedValueOnce(grownUp);
    await expect(startDeedRun("c1", "well-stones", "realm", { challenge: true })).rejects.toThrow("Side quests are for the hero to play.");
    await expect(startDeedRun("c1", "well-stones", "page", { challenge: true })).rejects.toThrow("Side quests are for the hero to play.");
    expect(await runCount()).toBe(1);
  });

  it("asks three questions a rung up, with no second chances and nothing mixed in", async () => {
    await threeStars();
    await seedRun({ id: "deed-old", questions: [{ ...QUESTIONS[0], id: "deed-miss", prompt: "miss?" }], responses: ["5"], completed: true });
    const r = await startDeedRun("c1", "well-stones", "realm", { challenge: true });
    expect(r).toMatchObject({ kind: "challenge", pending: null });
    expect(r.questions).toHaveLength(CHALLENGE.questions);
    expect(JSON.stringify(r.questions)).not.toMatch(/"answer"|"explain"/);
    const row = await client.query("SELECT kind, second_chances FROM deed_run WHERE id = ?1", [r.runId]);
    expect(row.rows[0]).toEqual({ kind: "challenge", second_chances: 0 });
    expect(vi.mocked(buildDeedRun).mock.calls[0][0]).toMatchObject({
      questionCount: CHALLENGE.questions, levelBoost: CHALLENGE.levelBoost, dueSkillIds: [], recentMisses: [],
    });
  });

  it("an open side quest is not picked up as a challenge, nor a challenge as a side quest", async () => {
    await threeStars();
    await seedRun({ id: "open-deed" });
    const challenge = await startDeedRun("c1", "well-stones", "realm", { challenge: true });
    expect(challenge.runId).not.toBe("open-deed");
    expect((await startDeedRun("c1", "well-stones", "realm")).runId).toBe("open-deed");
  });

  it("all three right crowns the side quest and moves nothing else", async () => {
    await threeStars();
    const runId = await playChallenge([true, true, true]);
    const s = await completeDeedRun(runId);
    expect(s).toMatchObject({ kind: "challenge", flawless: true, crowned: true, stars: 0, previousBest: 3, deedBest: 3, counted: false, masteryChanges: [] });
    expect((await stored(runId)).stars).toBe(0);
    expect(await deedsDone()).toBe(0);
    expect(await masteryCount()).toBe(0);
    expect(await loadDeedBest("c1")).toEqual([{ deedId: "well-stones", bestStars: 3, crowned: true }]);
  });

  it("a miss costs nothing: no crown, no new best, and the next try is fresh", async () => {
    await threeStars();
    const runId = await playChallenge([true, false, true]);
    const s = await completeDeedRun(runId);
    expect(s).toMatchObject({ kind: "challenge", flawless: false, crowned: false, stars: 0, previousBest: 3, counted: false });
    expect(await masteryCount()).toBe(0);
    expect((await startDeedRun("c1", "well-stones", "realm", { challenge: true })).runId).not.toBe(runId);
  });

  it("a crown once earned stays when a later challenge has a miss", async () => {
    await threeStars();
    await completeDeedRun(await playChallenge([true, true, true]));
    expect((await completeDeedRun(await playChallenge([false, true, true]))).crowned).toBe(true);
  });
});

describe("startDeedRun begins a fresh run on the grown-up's settings", () => {
  it("asks the side-quest length and snapshots second chances onto the row", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, sideQuestLength: 5, secondChances: false });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r).toMatchObject({ kind: "deed", pending: null });
    expect(r.questions).toHaveLength(5);
    const row = await client.query("SELECT kind, second_chances, second_tries FROM deed_run WHERE id = ?1", [r.runId]);
    expect(row.rows[0]).toEqual({ kind: "deed", second_chances: 0, second_tries: "[]" });
  });

  it("second chances on in the settings are on for the run", async () => {
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.questions).toHaveLength(DEFAULT_REALM_SETTINGS.sideQuestLength);
    const row = await client.query("SELECT second_chances FROM deed_run WHERE id = ?1", [r.runId]);
    expect(row.rows[0].second_chances).toBe(1);
  });

  it("brings back a side quest's misses, never a challenge's", async () => {
    const miss = (id: string): Question => ({ ...QUESTIONS[0], id, prompt: `${id}?` });
    await seedRun({ id: "deed-old", questions: [miss("deed-miss")], responses: ["5"], completed: true });
    await seedRun({ id: "crown-old", questions: [miss("crown-miss")], responses: ["5"], completed: true, kind: "challenge" });
    await startDeedRun("c1", "well-stones", "realm");
    const asked = vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id);
    expect(asked).toEqual(["deed-miss"]);
  });

  it("hands the engine the hero's focus skills, and ignores a stored one outside their window", async () => {
    // div-facts is a third-grade skill: inside the grade-3 window. sight-k1 sits three grades away,
    // and "nope" is no skill at all.
    for (const [i, skill] of ["div-facts", "sight-k1", "nope"].entries()) {
      await client.query("INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES (?1, 'c1', ?2, unixepoch() + ?3)", [`f${i}`, skill, i]);
    }
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.questions.length).toBeGreaterThan(0);
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].focusSkillIds).toEqual(["div-facts"]);
  });

  it("serves a focus skill a grade above the hero's own in the deed's strand, from its own pool", async () => {
    // A grade-3 reader: read-g4 is inside the focus window but outside `chooseSkills`'s grade.
    for (const skill of ["read-g3", "read-g4"]) {
      for (let i = 0; i < 10; i++) {
        await client.query(
          `INSERT INTO drill_item (id, pool_id, skill_id, band, prompt, answer, distractors, level, updated_at)
           VALUES (?1, ?2, ?2, 'g45', ?3, 'yes', '["no","maybe","never"]', 2, unixepoch())`,
          [`${skill}-${i}`, skill, `${skill} prompt ${i}?`],
        );
      }
    }
    await client.query("INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES ('f0', 'c1', 'read-g4', unixepoch())");
    const now = vi.spyOn(Date, "now");
    try {
      let served: string[] | null = null;
      // The run's seed is the clock; a few fixed clocks make the draw deterministic.
      for (let t = 1_800_000_000_000; t < 1_800_000_000_020 && !served; t++) {
        now.mockReturnValue(t);
        vi.mocked(buildDeedRun).mockClear();
        const r = await startDeedRun("c1", "well-signs", "realm");
        const input = vi.mocked(buildDeedRun).mock.calls[0][0];
        expect(new Set(input.poolItems.map((p) => p.skillId))).toEqual(new Set(["read-g3", "read-g4"]));
        const row = await client.query("SELECT skill_ids FROM deed_run WHERE id = ?1", [r.runId]);
        const ids = JSON.parse(row.rows[0].skill_ids as string) as string[];
        if (ids.includes("read-g4")) served = r.questions.filter((q) => q.skillId === "read-g4").map((q) => q.id);
        await client.query("DELETE FROM deed_run");
      }
      expect(served?.length).toBeGreaterThan(0);
    } finally {
      now.mockRestore();
      await client.query("DELETE FROM drill_item");
    }
  });

  it("reads the hero's levels once: the focus picks are judged on the grades already in hand", async () => {
    vi.mocked(loadHeroLevels).mockClear();
    await startDeedRun("c1", "well-stones", "realm");
    expect(loadHeroLevels).toHaveBeenCalledTimes(1);
  });

  it("a run holding a kind this build does not play still returns its choice miss; that task is skipped", async () => {
    // A kind from a newer deploy (R-C7). Before misses were graded by kind, the unknown task threw and
    // dropped the whole run's misses.
    const newer = { kind: "nope", id: "n0", skillId: SKILL, prompt: "Cut it", answer: "3/4" } as unknown as Question;
    await seedRun({ id: "deed-old", questions: [newer, QUESTIONS[1]], responses: ["9/4", "6"], completed: true });
    await startDeedRun("c1", "well-stones", "realm");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["q1"]);
  });

  it("a measure miss is graded by its kind and handed to the engine beside the choice one", async () => {
    const cut = { kind: "measure", id: "m0", skillId: SKILL, prompt: "Cut it", mode: "cut", unit: "ft", answer: "3/4", bridge: "3/4" };
    const right = { ...cut, id: "m1" };
    await seedRun({ id: "deed-old", questions: [cut, right, QUESTIONS[1]] as unknown as Question[], responses: ["c:9/4", "c:3/4", "6"], completed: true });
    await startDeedRun("c1", "well-stones", "realm");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["m0", "q1"]);
  });

  it("a malformed stored run is skipped without hiding the others' misses", async () => {
    await seedRun({ id: "deed-old", questions: [QUESTIONS[1]], responses: ["6"], completed: true });
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES ('bad', 'c1', 'well-stones', '[]', '3-5', '{not json', '[]', '{}',
         unixepoch(), unixepoch() + 5, unixepoch(), unixepoch(), 'deed')`,
    );
    await startDeedRun("c1", "well-stones", "realm");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["q1"]);
  });

  it("a stored run whose JSON parses to the wrong shape is skipped, and other runs' misses still come back", async () => {
    await seedRun({ id: "deed-old", questions: [QUESTIONS[1]], responses: ["6"], completed: true });
    const rawRun = (id: string, questions: string, responses: string, offset: number) => client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES (?1, 'c1', 'well-stones', '[]', '3-5', ?2, ?3, '{}', unixepoch(), unixepoch() + ?4, unixepoch(), unixepoch(), 'deed')`,
      [id, questions, responses, offset],
    );
    await rawRun("q-null", "null", "[]", 1);
    await rawRun("q-object", "{}", "[]", 2);
    await rawRun("r-null", JSON.stringify([QUESTIONS[0]]), "null", 3);
    await rawRun("el-null", JSON.stringify([null, QUESTIONS[2]]), JSON.stringify(["x", "5"]), 4);
    await startDeedRun("c1", "well-stones", "realm");
    // The null element is skipped; the real task beside it is still a miss.
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("a miss put right on the second try still comes back", async () => {
    await seedRun({ id: "deed-old", questions: [QUESTIONS[1]], responses: ["6"], secondTries: JSON.stringify(["9"]), completed: true });
    await startDeedRun("c1", "well-stones", "realm");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["q1"]);
  });
});

describe("side quests pay play minutes by stars", () => {
  const ALL_RIGHT = { responses: ["6", "9", "12", "15"] };
  const GROWN_UP = { access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>;

  async function practiceRows(): Promise<{ minutes: number; source_run_id: string | null }[]> {
    const r = await client.query("SELECT minutes, source_run_id FROM realm_play_ledger WHERE child_id = 'c1' AND kind = 'practice' ORDER BY source_run_id");
    return r.rows;
  }
  async function realmSettings(cols: Record<string, string | number>) {
    await client.query("INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES ('s1', 'c1', unixepoch(), unixepoch()) ON CONFLICT DO NOTHING");
    for (const [col, v] of Object.entries(cols)) await client.query(`UPDATE realm_settings SET ${col} = ?1 WHERE child_id = 'c1'`, [v]);
  }

  it("a three-star run pays three minutes on the server's day, opening the day first", async () => {
    await seedRun(ALL_RIGHT);
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: 3, minutesEarned: 3, sideQuestPayFull: false });
    expect(await practiceRows()).toEqual([{ minutes: 3, source_run_id: "run1" }]);
    const opened = await client.query("SELECT kind FROM realm_play_ledger WHERE child_id = 'c1' AND date = '2026-11-09' ORDER BY kind");
    expect(opened.rows.map((r) => r.kind)).toEqual(["allowance", "carried", "practice"]);
  });

  it("pays only once the finish is won, then raises the building", async () => {
    await seedRun(ALL_RIGHT);
    let closedWhenAsked: unknown = null;
    let raisedWhenAsked: number | null = null;
    vi.mocked(paySideQuest).mockImplementationOnce(async () => {
      closedWhenAsked = (await stored()).completed_at;
      raisedWhenAsked = await deedsDone();
      return { minutes: 3, full: false };
    });
    // SQLite has one write lock: the pay's transaction ends before the building's write starts.
    expect(await completeDeedRun("run1")).toMatchObject({ minutesEarned: 3 });
    expect(closedWhenAsked).not.toBeNull();
    expect(raisedWhenAsked).toBe(0);
    expect(await deedsDone()).toBe(1);
  });

  it("pays once when the finish is raced, and the losing finish pays nothing", async () => {
    await seedRun(ALL_RIGHT);
    const results = await Promise.allSettled([completeDeedRun("run1"), completeDeedRun("run1")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await practiceRows()).toEqual([{ minutes: 3, source_run_id: "run1" }]);
  });

  it("asked twice for one run, the second pays nothing new and answers with what was paid", async () => {
    expect(await paySideQuest("c1", "run9", 2)).toEqual({ minutes: 2, full: false });
    expect(await paySideQuest("c1", "run9", 3)).toEqual({ minutes: 2, full: false });
    expect(await practiceRows()).toEqual([{ minutes: 2, source_run_id: "run9" }]);
  });

  it("two runs finished at once never pay past the day's limit, and the card says it is reached", async () => {
    await realmSettings({ side_quest_daily_cap_minutes: 4 });
    await seedRun({ ...ALL_RIGHT, id: "a" });
    await seedRun({ ...ALL_RIGHT, id: "b" });
    const [a, b] = await Promise.all([completeDeedRun("a"), completeDeedRun("b")]);
    expect([a.minutesEarned, b.minutesEarned].sort()).toEqual([1, 3]);
    // The second to the lock gets what is left, and reaches the limit.
    expect([a, b].find((x) => x.minutesEarned === 1)?.sideQuestPayFull).toBe(true);
    expect((await practiceRows()).reduce((n, r) => n + r.minutes, 0)).toBe(4);
    await seedRun({ ...ALL_RIGHT, id: "c" });
    expect(await completeDeedRun("c")).toMatchObject({ minutesEarned: 0, sideQuestPayFull: true });
    expect(await practiceRows()).toHaveLength(2);
  });

  it("a grown-up's run on the page records its stars and pays nothing", async () => {
    await seedRun(ALL_RIGHT);
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    expect(await completeDeedRun("run1")).toMatchObject({ stars: 3, minutesEarned: 0, sideQuestPayFull: false });
    expect(await practiceRows()).toEqual([]);
  });

  it("a starless run and a Crown Challenge pay nothing, and never ask", async () => {
    vi.mocked(paySideQuest).mockClear();
    await seedRun({ responses: ["5", "6", "7", "8"], secondTries: JSON.stringify(["", "", "", ""]) });
    expect(await completeDeedRun("run1")).toMatchObject({ stars: 0, minutesEarned: 0 });
    await seedRun({ id: "ch", kind: "challenge", questions: QUESTIONS.slice(0, 3), responses: ["6", "9", "12"], secondChances: false });
    expect(await completeDeedRun("ch")).toMatchObject({ kind: "challenge", minutesEarned: 0, sideQuestPayFull: false });
    expect(paySideQuest).not.toHaveBeenCalled();
    expect(await practiceRows()).toEqual([]);
  });

  it("a review never pays, even with every answer right", async () => {
    vi.mocked(paySideQuest).mockClear();
    await seedRun({ ...ALL_RIGHT, id: "rv", kind: "review" });
    expect(await completeDeedRun("rv")).toMatchObject({ kind: "review", minutesEarned: 0, sideQuestPayFull: false });
    expect(paySideQuest).not.toHaveBeenCalled();
    expect(await practiceRows()).toEqual([]);
  });

  it("pays nothing where minutes mean nothing (scheduled)", async () => {
    await realmSettings({ access_mode: "scheduled" });
    await seedRun(ALL_RIGHT);
    expect(await completeDeedRun("run1")).toMatchObject({ stars: 3, minutesEarned: 0, sideQuestPayFull: false });
    expect(await practiceRows()).toEqual([]);
  });

  it("a minute write that fails never fails the finish: the stars still show", async () => {
    await seedRun(ALL_RIGHT);
    vi.mocked(paySideQuest).mockRejectedValueOnce(new Error("connection reset"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await completeDeedRun("run1")).toMatchObject({ stars: 3, minutesEarned: 0, sideQuestPayFull: false });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect((await stored()).completed_at).not.toBeNull();
  });
});

describe("a measure task in a run", () => {
  // Seeded straight into the run: no skill is on the bench yet, so no start would draw one.
  const CUT: MeasureTask = {
    kind: "measure", id: "m-cut", skillId: SKILL, prompt: "Cut a board three quarters of a foot long.",
    mode: "cut", unit: "ft", answer: "3/4", step: "1/4", maxLength: "2", bridge: "1/2 + 1/4 = 3/4",
  };
  const ASSEMBLE: MeasureTask = {
    kind: "measure", id: "m-asm", skillId: SKILL, prompt: "Build a beam three quarters of a foot long.",
    mode: "assemble", unit: "ft",
    pieces: [{ label: "1/2 ft", value: "1/2" }, { label: "1/4 ft", value: "1/4" }, { label: "1/4 ft", value: "0.25" }, { label: "1/8 ft", value: "1/8" }],
    target: { label: "3/4 ft", value: "3/4" }, solution: [0, 1], bridge: "1/2 + 1/4 = 3/4",
  };
  const seedMeasure = () => seedRun({ questions: [CUT, ASSEMBLE] as unknown as Question[] });
  const masteryRows = async () => Number((await client.query("SELECT count(*) AS n FROM skill_mastery")).rows[0].n);

  async function refusedBeforeAnyWrite(call: () => Promise<unknown>, message = PICK_SHOWN) {
    const before = await stored();
    const rows = await masteryRows();
    await expect(call()).rejects.toThrow(message);
    expect(await stored()).toEqual(before);
    expect(await masteryRows()).toBe(rows);
  }

  it("a malformed response is refused before anything is written (Review Focus 2)", async () => {
    await seedMeasure();
    // index 0 is the cut, index 1 the assemble.
    for (const raw of ["x".repeat(60), "1/0", "c:1/0", "", "a:0", [0], 0.75, null, {}]) {
      await refusedBeforeAnyWrite(() => answerDeedQuestion("run1", 0, raw));
    }
    for (const raw of [[4], [-1], [0, 0], [], [0.5], "a:0,0", "a:9", "0,1", "c:3/4", "3/4", 7, {}]) {
      await refusedBeforeAnyWrite(() => answerDeedQuestion("run1", 1, raw));
    }
    expect((await stored()).responses).toBe("[null,null]");
  });

  it("a malformed retry is refused before anything is written, and so is the same length written another way", async () => {
    await seedMeasure();
    await answerDeedQuestion("run1", 0, "c:1/2");
    await answerDeedQuestion("run1", 1, "a:1,2");
    for (const raw of ["x".repeat(60), "1/0", [0]]) await refusedBeforeAnyWrite(() => retryDeedQuestion("run1", 0, raw));
    for (const raw of [[0, 0], [9], "c:3/4"]) await refusedBeforeAnyWrite(() => retryDeedQuestion("run1", 1, raw));
    await refusedBeforeAnyWrite(() => retryDeedQuestion("run1", 0, "0.5"), TRY_DIFFERENT);
    await refusedBeforeAnyWrite(() => retryDeedQuestion("run1", 1, "a:2,1"), TRY_DIFFERENT);
  });

  it.each(["3/4", "0.75", "6/8", "c:3/4"])("a cut of %s is right, stored in lowest terms, with the bridge (Review Focus 3)", async (raw) => {
    await seedMeasure();
    const r = await answerDeedQuestion("run1", 0, raw);
    expect(r).toMatchObject({ correct: true, secondChance: false, answer: "3/4 ft", bridge: CUT.bridge });
    expect(JSON.parse((await stored()).responses)[0]).toBe("c:3/4");
  });

  it("any set of pieces that hits the mark is right, not only the stored solution", async () => {
    await seedMeasure();
    const r = await answerDeedQuestion("run1", 1, "a:2,0");
    expect(r).toMatchObject({ correct: true, bridge: ASSEMBLE.bridge });
    expect(JSON.parse((await stored()).responses)[1]).toBe("a:0,2");
  });

  it("a child who hits the mark with another subset than the stored one gets their own pieces in the bridge (RC-g)", async () => {
    const BEAM: MeasureTask = {
      kind: "measure", id: "m-beam", skillId: SKILL, prompt: "The well-digger needs a beam 9 blocks long. Pick the pieces that make it.",
      mode: "assemble", unit: "blocks",
      pieces: [{ label: "6 blocks", value: "6" }, { label: "3 blocks", value: "3" }, { label: "12 blocks", value: "12" }, { label: "8 blocks", value: "8" }, { label: "1 block", value: "1" }],
      target: { label: "9 blocks", value: "9" }, solution: [3, 4], bridge: "1 + 8 = 9",
    };
    await seedRun({ questions: [BEAM, BEAM] as unknown as Question[] });
    // 6 + 3, not the stored 8 + 1.
    expect(await answerDeedQuestion("run1", 0, [1, 0])).toMatchObject({ correct: true, bridge: "6 + 3 = 9", answer: "Pieces that add up to 9 blocks, like 1 + 8 = 9." });
    // A repeat of the same answer hears the same bridge.
    expect(await answerDeedQuestion("run1", 0, [1, 0])).toMatchObject({ correct: true, bridge: "6 + 3 = 9" });
    // Right on the second try: the bridge is built from the retry.
    await answerDeedQuestion("run1", 1, [0]);
    expect(await retryDeedQuestion("run1", 1, [4, 3])).toMatchObject({ correct: true, bridge: "8 + 1 = 9" });
  });

  it("an assemble miss reads the pinned reveal and carries no bridge", async () => {
    await seedMeasure();
    await answerDeedQuestion("run1", 1, [0, 1, 2]);
    const r = await retryDeedQuestion("run1", 1, [3]);
    expect(r).toMatchObject({ correct: false, secondChance: false, answer: "Pieces that add up to 3/4 ft, like 1/2 + 1/4 = 3/4." });
    expect("bridge" in r).toBe(false);
  });

  it("a wrong length opens a second chance with which way it is off, and nothing of the answer", async () => {
    await seedMeasure();
    const r = await answerDeedQuestion("run1", 0, "c:1/2");
    expect(r).toMatchObject({ correct: false, secondChance: true, feedback: "too_short", firstPick: "c:1/2" });
    for (const k of ["answer", "bridge", "explain"]) expect(k in r).toBe(false);
    const long = await answerDeedQuestion("run1", 1, [0, 1, 2]);
    expect(long).toMatchObject({ secondChance: true, feedback: "too_long" });
    expect("bridge" in long).toBe(false);
  });

  it("a repeat of a wrong first length still hears which way the stored one is off", async () => {
    await seedMeasure();
    await answerDeedQuestion("run1", 0, "c:1/2");
    // A double tap, even of another length: it hears what was stored (too short), never a new grade.
    expect(await answerDeedQuestion("run1", 0, "c:1/2")).toMatchObject({ secondChance: true, feedback: "too_short", firstPick: "c:1/2" });
    expect(await answerDeedQuestion("run1", 0, "2")).toMatchObject({ secondChance: true, feedback: "too_short", firstPick: "c:1/2" });
    // Once the question is resolved, a late repeat hears the resolution only: no note about a try long gone.
    await retryDeedQuestion("run1", 0, "3/4");
    const late = await answerDeedQuestion("run1", 0, "c:1/2");
    expect(late).toMatchObject({ correct: true, secondChance: false });
    expect("feedback" in late).toBe(false);
  });

  it("the bridge comes with a right retry, and never with a wrong one or a give-up", async () => {
    await seedMeasure();
    await answerDeedQuestion("run1", 0, "1/2");
    expect(await retryDeedQuestion("run1", 0, "6/8")).toMatchObject({ correct: true, bridge: CUT.bridge });

    await answerDeedQuestion("run1", 1, "a:1,2");
    const wrong = await retryDeedQuestion("run1", 1, [0, 1, 2]);
    expect(wrong).toMatchObject({ correct: false, secondChance: false, feedback: "too_long", answer: "Pieces that add up to 3/4 ft, like 1/2 + 1/4 = 3/4." });
    expect("bridge" in wrong).toBe(false);
  });

  it("giving up resolves as a miss without the bridge", async () => {
    await seedMeasure();
    await answerDeedQuestion("run1", 0, "1");
    const r = await resolveDeedQuestion("run1", 0);
    expect(r).toMatchObject({ correct: false, secondChance: false });
    expect("bridge" in r).toBe(false);
  });

  it("a choice result never carries a bridge", async () => {
    await seedRun();
    expect("bridge" in (await answerDeedQuestion("run1", 0, "6"))).toBe(false);
  });
});

describe("a lock task in a run (R-F1, R-F2)", () => {
  // Seeded straight into the run: no skill is a lock yet (LOCKS is empty), so no start would draw one.
  const LOCK: LockTask = { ...PATTERN, skillId: SKILL };
  const SOLVED = TASK_CODECS.lock.encode(PATTERN.solution);
  const seedLock = (over: { secondChances?: boolean } = {}) => seedRun({ questions: [LOCK, QUESTIONS[0]] as unknown as Question[], ...over });

  it("a forged response is refused before anything is written (Review Focus 1)", async () => {
    await seedLock();
    for (const raw of ["pattern:1", "pattern:1,1,1", "pattern:4,4", "pattern:1.5,1", "cage4:1,1", "x".repeat(10_000), " pattern:1,1", [1, 1], { puzzle: "pattern", cells: [1, 1] }, null]) {
      await expect(answerDeedQuestion("run1", 0, raw)).rejects.toThrow(PICK_SHOWN);
    }
    expect((await stored()).responses).toBe("[null,null]");
  });

  it("another valid fill than the stored one is right, and sends no reveal (Review Focus 2)", async () => {
    await seedLock();
    const r = await answerDeedQuestion("run1", 0, "pattern:1,1");
    expect(r).toMatchObject({ correct: true, secondChance: false, answer: "Here is one way it fits." });
    expect("reveal" in r).toBe(false);
  });

  it("an open second chance says what kind of wrong it is, and reveals nothing", async () => {
    await seedLock();
    const broken = await answerDeedQuestion("run1", 0, "pattern:3,1");
    expect(broken).toMatchObject({ correct: false, secondChance: true, feedback: "rule_broken", firstPick: "pattern:3,1" });
    for (const k of ["answer", "reveal", "explain"]) expect(k in broken).toBe(false);
    // A repeat while the try is open hears the same, still with nothing revealed.
    expect("reveal" in (await answerDeedQuestion("run1", 0, "pattern:3,1"))).toBe(false);
  });

  it("an unfinished first try hears that spaces are left", async () => {
    await seedLock();
    expect(await answerDeedQuestion("run1", 0, "pattern:3,0")).toMatchObject({ secondChance: true, feedback: "incomplete" });
  });

  it("a resolved miss sends the stored solution, encoded, as the reveal", async () => {
    await seedLock();
    await answerDeedQuestion("run1", 0, "pattern:3,1");
    const r = await retryDeedQuestion("run1", 0, "pattern:2,1");
    expect(r).toMatchObject({ correct: false, secondChance: false, answer: "Here is one way it fits.", reveal: SOLVED });
    // A late repeat of the first answer replays the resolution, reveal and all.
    expect(await answerDeedQuestion("run1", 0, "pattern:3,1")).toMatchObject({ correct: false, reveal: SOLVED });
  });

  it("a right retry sends no reveal", async () => {
    await seedLock();
    await answerDeedQuestion("run1", 0, "pattern:3,1");
    const r = await retryDeedQuestion("run1", 0, "pattern:2,2");
    expect(r).toMatchObject({ correct: true, secondChance: false });
    expect("reveal" in r).toBe(false);
  });

  it("giving up, or a miss with no second chance, is a resolved miss: the reveal comes with it", async () => {
    await seedLock();
    await answerDeedQuestion("run1", 0, "pattern:3,1");
    expect(await resolveDeedQuestion("run1", 0)).toMatchObject({ correct: false, secondChance: false, reveal: SOLVED });
    await client.query("DELETE FROM deed_run");
    await seedLock({ secondChances: false });
    expect(await answerDeedQuestion("run1", 0, "pattern:3,1")).toMatchObject({ correct: false, secondChance: false, reveal: SOLVED });
  });

  it("a choice or measure miss never carries a reveal", async () => {
    await seedLock({ secondChances: false });
    const miss = await answerDeedQuestion("run1", 1, "5");
    expect(miss).toMatchObject({ correct: false, secondChance: false });
    expect("reveal" in miss).toBe(false);
  });
});

describe("the grown-up's switch for building by measuring (Review Focus 4)", () => {
  const HANDS_ON_OFF = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: false, lock: false } };
  const CUT: MeasureTask = {
    kind: "measure", id: "m-cut", skillId: SKILL, prompt: "Cut a board three quarters of a foot long.",
    mode: "cut", unit: "ft", answer: "3/4", step: "1/4", maxLength: "2", bridge: "1/2 + 1/4 = 3/4",
  };
  const enabledKindsOf = () => vi.mocked(buildDeedRun).mock.calls[0][0].enabledKinds;

  it("offers the engine every hands-on kind that is on, and no choice entry (choice is always there)", async () => {
    await startDeedRun("c1", "well-stones", "realm");
    expect(enabledKindsOf()).toEqual(new Set(["measure", "lock"]));
  });

  it("each switch is its own: the bench off leaves the locks on, and the locks off leave the bench", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValueOnce({ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: false, lock: true } });
    await startDeedRun("c1", "well-stones", "realm");
    expect(enabledKindsOf()).toEqual(new Set(["lock"]));
    vi.mocked(buildDeedRun).mockClear();
    await client.query("DELETE FROM deed_run");
    vi.mocked(loadRealmSettings).mockResolvedValueOnce({ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: false } });
    await startDeedRun("c1", "well-stones", "realm");
    expect(enabledKindsOf()).toEqual(new Set(["measure"]));
  });

  it("turned off, offers the engine no hands-on kind: a new run is all choice", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue(HANDS_ON_OFF);
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(enabledKindsOf()).toEqual(new Set());
    const built = vi.mocked(buildDeedRun).mock.results[0].value;
    expect((built.questions as Task[]).every((q) => kindOf(q) === "choice")).toBe(true);
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it("the setting applies on the page as it does in the world", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue(HANDS_ON_OFF);
    await startDeedRun("c1", "well-stones", "page");
    expect(enabledKindsOf()).toEqual(new Set());
  });

  it("an open measure run still resumes and completes after the switch goes off (runs are snapshots)", async () => {
    await seedRun({ questions: [CUT, QUESTIONS[0]] as unknown as Question[], secondChances: false });
    vi.mocked(loadRealmSettings).mockResolvedValue(HANDS_ON_OFF);
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.runId).toBe("run1");
    expect(vi.mocked(buildDeedRun)).not.toHaveBeenCalled();
    expect(r.questions[0]).toMatchObject({ kind: "measure", view: { mode: "cut" } });
    expect(await answerDeedQuestion("run1", 0, "3/4")).toMatchObject({ correct: true, bridge: CUT.bridge });
    expect(await answerDeedQuestion("run1", 1, "6")).toMatchObject({ correct: true });
    expect(await completeDeedRun("run1")).toMatchObject({ kind: "deed", flawless: true, stars: 3 });
  });
});

describe("the gate stays multiple choice (R-C4)", () => {
  const runCount = async () => Number((await client.query("SELECT count(*) AS n FROM deed_run")).rows[0].n);

  it("builds a gate run with no hands-on kind, whatever the grown-up has switched on", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: true } });
    const r = await startDeedRun("c1", "well-stones", "gate");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].enabledKinds).toEqual(new Set());
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.every((q) => q.kind === "choice")).toBe(true);
    expect(await runCount()).toBe(1);
  });

  it("is the hero's alone, like the world", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-mom" }, familyId: "f1" } as never);
    await expect(startDeedRun("c1", "well-stones", "gate")).rejects.toThrow(HERO_ONLY);
    expect(await runCount()).toBe(0);
    expect(vi.mocked(buildDeedRun)).not.toHaveBeenCalled();
  });

  it("keeps a Crown Challenge asked from the gate hero-only too", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-mom" }, familyId: "f1" } as never);
    await expect(startDeedRun("c1", "well-stones", "gate", { challenge: true })).rejects.toThrow(HERO_ONLY);
  });
});

describe("a grade-3 math side quest is played at the bench (slice 2, C13)", () => {
  const MEASURE_OFF = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: false, lock: true } };
  const GROWN_UP = { access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>;
  const benched = (skillId: string) => skillId in BENCH;

  const runCount = async () => Number((await client.query("SELECT count(*) AS n FROM deed_run")).rows[0].n);
  /** The tasks as stored on the run row: the only place the solution lives. */
  async function storedTasks(id: string): Promise<Task[]> {
    return JSON.parse((await client.query("SELECT questions FROM deed_run WHERE id = ?1", [id])).rows[0].questions) as Task[];
  }
  /** Div-facts has rested past its interval, so a run reviews it beside the skills it draws fresh. */
  async function restedDivFacts() {
    await client.query(
      `INSERT INTO skill_mastery (id, child_id, skill_id, level, recent_results, correct_total, attempt_total, last_practiced_at, created_at, updated_at)
       VALUES ('m1', 'c1', 'div-facts', 2, '[1,1]', 2, 2, unixepoch() - 864000, unixepoch(), unixepoch())`,
    );
  }
  /** The REAL engine, started at a chosen seed (the action seeds from the clock). */
  function atSeed(seed: number) {
    vi.mocked(buildDeedRun).mockImplementationOnce((i) => realBuildDeedRun({ ...i, seed }));
  }
  /** Starts a fresh well-stones run at the first seed that mixes the bench with a choice review; then it is the open run. */
  async function startMixed() {
    await restedDivFacts();
    for (let seed = 1; seed <= 200; seed++) {
      atSeed(seed);
      const start = await startDeedRun("c1", "well-stones", "realm");
      const tasks = await storedTasks(start.runId);
      if (tasks.some((t) => kindOf(t) === "measure") && tasks.some((t) => kindOf(t) === "choice")) return { start, tasks, seed };
      await client.query("DELETE FROM deed_run");
    }
    throw new Error("no seed mixed measure and choice tasks");
  }
  it("holds measure tasks for the benched skills and choice tasks for every other skill, the browser seeing views only", async () => {
    const { start, tasks } = await startMixed();
    expect(tasks).toHaveLength(8);
    for (const t of tasks) expect(kindOf(t), t.skillId).toBe(benched(t.skillId) ? "measure" : "choice");
    expect(start.questions.map((q) => q.kind)).toEqual(tasks.map((t) => kindOf(t)));
    expect(tasks.some((t) => ["area-perimeter", "frac-unit"].includes(t.skillId) && kindOf(t) === "measure")).toBe(true);
    // The solution stays on the server.
    for (const q of start.questions) expect(JSON.stringify(q)).not.toMatch(/"answer"|"solution"|"bridge"/);
  });

  it("answers, retries and completes through the real actions, with stars and pay as before", async () => {
    const { start, tasks } = await startMixed();
    const id = start.runId;
    const slow = tasks.findIndex((t) => kindOf(t) === "measure");
    expect(slow).toBeGreaterThanOrEqual(0);
    for (const [i, t] of tasks.entries()) {
      const { right, wrong } = rightAndWrong(t);
      if (i === slow) {
        // A wrong first try opens a second chance; the stored task's own answer then solves it.
        const miss = await answerDeedQuestion(id, i, wrong);
        expect(miss).toMatchObject({ correct: false, secondChance: true });
        for (const k of ["answer", "bridge", "explain"]) expect(k in miss).toBe(false);
        expect(await retryDeedQuestion(id, i, right)).toMatchObject({ correct: true, secondChance: false });
      } else {
        const r = await answerDeedQuestion(id, i, right);
        expect(r).toMatchObject({ correct: true });
        // Only a hands-on task teaches its notation.
        expect("bridge" in r).toBe(kindOf(t) === "measure");
      }
    }
    const points = (tasks.length - 1) * SCORING.firstTryPoints + SCORING.secondTryPoints;
    const stars = starsFor(points, tasks.length * SCORING.firstTryPoints);
    expect(stars).toBeGreaterThan(0);
    vi.mocked(paySideQuest).mockClear();
    const summary = await completeDeedRun(id);
    expect(summary).toMatchObject({ kind: "deed", stars, correctCount: tasks.length - 1, total: tasks.length, flawless: false, counted: true });
    expect(paySideQuest).toHaveBeenCalledWith("c1", id, stars);
    const paid = await client.query("SELECT coalesce(sum(minutes), 0) AS n FROM realm_play_ledger WHERE child_id = 'c1' AND kind = 'practice' AND source_run_id = ?1", [id]);
    expect(Number(paid.rows[0].n)).toBe(summary.minutesEarned);
    expect(summary.minutesEarned).toBeGreaterThan(0);
    expect(await deedsDone()).toBe(1);
  });

  it("pays a grown-up's run nothing, for a bench run as for any other", async () => {
    const { start, tasks } = await startMixed();
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(start.runId, i, rightAndWrong(t).right);
    vi.mocked(paySideQuest).mockClear();
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    expect(await completeDeedRun(start.runId)).toMatchObject({ stars: 3, minutesEarned: 0, sideQuestPayFull: false });
    expect(paySideQuest).not.toHaveBeenCalled();
  });

  it("with building by measuring off, the same run is all choice (the real engine)", async () => {
    const { seed, tasks } = await startMixed();
    await client.query("DELETE FROM deed_run");
    vi.mocked(loadRealmSettings).mockResolvedValue(MEASURE_OFF);
    atSeed(seed);
    const off = await startDeedRun("c1", "well-stones", "realm");
    const offTasks = await storedTasks(off.runId);
    expect(offTasks).toHaveLength(8);
    // The same skills were drawn; only how they are played changed.
    expect(new Set(offTasks.map((t) => t.skillId))).toEqual(new Set(tasks.map((t) => t.skillId)));
    expect(tasks.some((t) => benched(t.skillId))).toBe(true);
    for (const t of offTasks) expect(kindOf(t)).toBe("choice");
    expect(off.questions.every((q) => q.kind === "choice")).toBe(true);
  });

  it("leaves a reading side quest exactly as it was: choice tasks, with no kind stored", async () => {
    for (let i = 0; i < 30; i++) {
      await client.query(
        `INSERT INTO drill_item (id, pool_id, skill_id, band, prompt, answer, distractors, read_aloud, level, updated_at)
         VALUES (?1, 'p1', 'read-g3', '3-5', ?2, ?3, ?4, NULL, 2, unixepoch())`,
        [`read-g3-item-${i}`, `Prompt ${i}`, `A${i}`, JSON.stringify([`B${i}`, `C${i}`, `D${i}`])],
      );
    }
    atSeed(1);
    const start = await startDeedRun("c1", "well-signs", "realm");
    const tasks = await storedTasks(start.runId);
    // Recorded with this pool and seed 1 before any deed named a mechanic.
    expect(tasks.map((t) => t.id)).toEqual(["read-g3-item-14", "read-g3-item-24", "read-g3-item-8", "read-g3-item-10", "read-g3-item-16", "read-g3-item-6", "read-g3-item-11", "read-g3-item-12"]);
    for (const t of tasks) expect("kind" in t).toBe(false);
    expect(start.questions.every((q) => q.kind === "choice")).toBe(true);
    await client.query("DELETE FROM drill_item");
  });

  describe("the context is untrusted", () => {
    it("an arbitrary string behaves as the page: a grown-up may start the run, and the bench is on", async () => {
      vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
      await expect(startDeedRun("c1", "well-stones", "REALM" as never)).resolves.toBeDefined();
      expect(vi.mocked(buildDeedRun).mock.calls[0][0].enabledKinds).toEqual(new Set(["measure", "lock"]));
      expect(await runCount()).toBe(1);
    });

    it("is not the gate unless it says so exactly", async () => {
      await startDeedRun("c1", "well-stones", "gate " as never);
      expect(vi.mocked(buildDeedRun).mock.calls[0][0].enabledKinds).toEqual(new Set(["measure", "lock"]));
    });

    it("the two named worlds keep their rules: realm and gate refuse a grown-up", async () => {
      for (const context of ["realm", "gate"] as const) {
        vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
        await expect(startDeedRun("c1", "well-stones", context)).rejects.toThrow(HERO_ONLY);
      }
      expect(await runCount()).toBe(0);
    });
  });
});

describe("a run saved by a newer version", () => {
  const NEWER = "This side quest was saved by a newer version. Start it again.";

  it("is refused clearly by the actions that read it, and nothing is written", async () => {
    const unknown = [{ kind: "nope", id: "n0", skillId: SKILL, prompt: "?", answer: "x" }] as unknown as Question[];
    await seedRun({ questions: unknown });
    await expect(answerDeedQuestion("run1", 0, "x")).rejects.toThrow(NEWER);
    await expect(completeDeedRun("run1")).rejects.toThrow(NEWER);
    expect((await stored()).responses).toBe("[null]");
  });

  it("an open run holding a kind this build does not know is treated as no open run on start", async () => {
    const unknown = [{ kind: "nope", id: "n0", skillId: SKILL, prompt: "?", answer: "x" }] as unknown as Question[];
    await seedRun({ id: "newer", questions: unknown });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.runId).not.toBe("newer");
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it("an open choice run still resumes", async () => {
    await seedRun({ id: "same" });
    expect((await startDeedRun("c1", "well-stones", "realm")).runId).toBe("same");
  });

  it("parseRun throws that copy for an unregistered kind, and reads a choice-only run unchanged", async () => {
    const { parseRun } = await import("@/lib/services/deed-run-store");
    const row = (questions: unknown[]) => ({
      questions: JSON.stringify(questions), responses: JSON.stringify(questions.map(() => null)), secondTries: "[]",
      secondChances: true, kind: "deed",
    }) as unknown as Parameters<typeof parseRun>[0];
    expect(() => parseRun(row([{ kind: "nope", id: "n0", skillId: SKILL }]))).toThrow(NEWER);
    expect(() => parseRun(row([{ kind: "toString", id: "n0", skillId: SKILL }]))).toThrow(NEWER);
    expect(parseRun(row(QUESTIONS)).statuses).toEqual(["unanswered", "unanswered", "unanswered", "unanswered"]);
  });
});

describe("a day in the Realm, end to end (spec §7)", () => {
  it("a fresh day opens with its allowance and carry, goes quiet at 0, and a starred side quest wakes it", async () => {
    // Yesterday left 4 minutes unspent.
    await client.query(
      "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('y1', 'c1', '2026-11-08', 'earned', 4, unixepoch())",
    );
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 14, source: "earned" });
    const opened = await client.query("SELECT kind, minutes FROM realm_play_ledger WHERE child_id = 'c1' AND date = '2026-11-09' ORDER BY kind");
    expect(opened.rows).toEqual([{ kind: "allowance", minutes: 10 }, { kind: "carried", minutes: 4 }]);

    await recordRealmPlay("c1", 10);
    await recordRealmPlay("c1", 4);
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 0, source: "quiet" });

    await seedRun({ responses: ["6", "9", "12", "15"] });
    expect(await completeDeedRun("run1")).toMatchObject({ stars: 3, minutesEarned: 3 });
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 3, source: "earned" });
  });
});

describe("getSchoolCounts", () => {
  it("counts finished side quests, never a Crown Challenge", async () => {
    await seedRun({ id: "deed-done", responses: ["6", "9", "12", "15"], completed: true });
    await seedRun({ id: "crown-done", responses: ["6", "9", "12", "15"], completed: true, kind: "challenge" });
    expect((await getSchoolCounts("c1")).form).toBe(1);
  });

  it("ignores a logic run: logic belongs to no spell school", async () => {
    await seedRun({ id: "deed-done", responses: ["6", "9", "12", "15"], completed: true });
    await client.query("UPDATE deed_run SET skill_ids = '[\"logic-g23\"]' WHERE id = 'deed-done'");
    expect(await getSchoolCounts("c1")).toEqual({ form: 0, element: 0, modifier: 0 });
  });
});

describe("answers are parsed by their task kind, and the browser gets views", () => {
  async function attemptTotal(): Promise<number> {
    const r = await client.query("SELECT coalesce(sum(attempt_total), 0) AS n FROM skill_mastery WHERE child_id = 'c1'");
    return Number(r.rows[0].n);
  }

  it("a run stored before tasks had kinds resumes, answers and completes", async () => {
    // QUESTIONS are plain `Question` JSON with no `kind`, exactly as older rows hold them.
    await seedRun();
    const start = await startDeedRun("c1", "well-stones", "realm");
    expect(start.runId).toBe("run1");
    expect(start.questions[0]).toMatchObject({ kind: "choice", id: "q0", prompt: "2 x 3?", view: { choices: ["6", "5", "8", "9"] } });
    expect(await answerDeedQuestion("run1", 0, "6")).toMatchObject({ correct: true, secondChance: false, answer: "6" });
    for (const [i, a] of [[1, "9"], [2, "12"], [3, "15"]] as const) await answerDeedQuestion("run1", i, a);
    expect(await completeDeedRun("run1")).toMatchObject({ correctCount: 4, flawless: true, stars: 3 });
  });

  it("a malformed answer is refused and writes nothing", async () => {
    await seedRun();
    const before = await stored();
    const masteryBefore = await attemptTotal();
    for (const bad of [{}, 42, "x".repeat(10_001), "nine", null]) {
      await expect(answerDeedQuestion("run1", 0, bad)).rejects.toThrow("Pick one of the answers shown.");
    }
    expect(await stored()).toEqual(before);
    expect(await attemptTotal()).toBe(masteryBefore);
  });

  it("a malformed retry is refused and writes nothing", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    const before = await stored();
    for (const bad of [{}, 42, "x".repeat(10_001)]) {
      await expect(retryDeedQuestion("run1", 1, bad)).rejects.toThrow("Pick one of the answers shown.");
    }
    expect(await stored()).toEqual(before);
  });

  it("stores the answer as the trimmed choice and grades it", async () => {
    await seedRun();
    expect(await answerDeedQuestion("run1", 0, " 6 ")).toMatchObject({ correct: true });
    expect(JSON.parse((await stored()).responses)[0]).toBe("6");
  });

  it("the browser never sees an answer before resolution", async () => {
    await seedRun();
    const resumed = await startDeedRun("c1", "well-stones", "realm");
    expect(JSON.stringify(resumed.questions)).not.toMatch(/"answer"|"explain"/);
    await client.query("DELETE FROM deed_run");
    const fresh = await startDeedRun("c1", "well-stones", "realm");
    expect(fresh.runId).not.toBe("run1");
    expect(JSON.stringify(fresh.questions)).not.toMatch(/"answer"|"explain"/);
    // A grade-3 math run may hold bench tasks now; their views carry no answer either (asserted above).
    expect(fresh.questions.every((q) => q.kind === "choice" || q.kind === "measure")).toBe(true);
  });
});
