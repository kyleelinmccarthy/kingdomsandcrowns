// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { hintFor } from "@/lib/utils/skill-hints";
import { CHALLENGE, starsFor } from "@/lib/utils/deed-scoring";
import { CHALLENGE_NOT_READY } from "@/lib/utils/deed-refusals";
import type { Question } from "@/lib/utils/drill-generators";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

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
const { loadDeedBest } = await import("@/lib/services/deeds");
const { loadRealmSettings, paySideQuest } = await import("@/lib/services/realm-play");
const { buildDeedRun } = await import("@/lib/utils/deed-engine");
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
  `CREATE TABLE kingdom_progress (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, building_id text NOT NULL,
    deeds_done integer DEFAULT 0 NOT NULL, completed_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX kingdom_progress_child_building_idx ON kingdom_progress (child_id, building_id)`,
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, spell_school text DEFAULT 'none' NOT NULL)`,
  `CREATE TABLE activity_log (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, subject_id text NOT NULL)`,
  `CREATE TABLE learning_focus (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL, created_at integer NOT NULL)`,
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
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
  secondChances?: boolean; completed?: boolean; stars?: number; kind?: "deed" | "challenge";
};

async function seedRun(over: Seed = {}): Promise<string> {
  const id = over.id ?? "run1";
  const qs = over.questions ?? QUESTIONS;
  await client.query(
    `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
       started_at, completed_at, created_at, updated_at, second_tries, stars, kind, second_chances)
     VALUES (?1, 'c1', 'well-stones', ?2, '3-5', ?3, ?4, '{}', unixepoch(), ?5, unixepoch(), unixepoch(), ?6, ?7, ?9, ?8)`,
    [
      id, JSON.stringify([SKILL]), JSON.stringify(qs), JSON.stringify(over.responses ?? qs.map(() => null)),
      over.completed ? new Date() : null, over.secondTries ?? "[]", over.stars ?? 0, over.secondChances ?? true,
      over.kind ?? "deed",
    ],
  );
  return id;
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
  for (const t of ["deed_run", "skill_mastery", "kingdom_progress", "realm_settings", "realm_play_ledger", "recess_block", "learning_focus"]) await client.query(`DELETE FROM ${t}`);
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
    await seedRun({ id: "old", responses: ["6", "9", "12", "15"], secondTries: "[]", completed: true, stars: 2 });
    await seedRun({ responses: ["5", "6", "7", "8"], secondTries: JSON.stringify(["", "", "", ""]) });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: 0, previousBest: 2, deedBest: 2, counted: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 0, stars: 2, maxStars: 9 });
    expect(await deedsDone()).toBe(0);
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

describe("the Crown Challenge", () => {
  const runCount = async () => Number((await client.query("SELECT count(*) AS n FROM deed_run")).rows[0].n);
  const masteryCount = async () => Number((await client.query("SELECT count(*) AS n FROM skill_mastery")).rows[0].n);
  const threeStars = () => seedRun({ id: "earned", responses: ["6", "9", "12", "15"], completed: true, stars: 3 });
  /** Starts a challenge and answers it from the stored questions: `right` decides each answer. */
  async function playChallenge(right: boolean[]): Promise<string> {
    const r = await startDeedRun("c1", "well-stones", "realm", { challenge: true });
    const row = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [r.runId]);
    const qs = JSON.parse(row.rows[0].questions) as Question[];
    for (const [i, q] of qs.entries()) {
      await answerDeedQuestion(r.runId, i, right[i] ? q.answer : q.choices.find((c) => c !== q.answer)!);
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
    // div-facts is a third-grade skill: inside the grade-3 window. read-k1 sits two grades away.
    for (const [i, skill] of ["div-facts", "sight-k1"].entries()) {
      await client.query("INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES (?1, 'c1', ?2, unixepoch() + ?3)", [`f${i}`, skill, i]);
    }
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.questions.length).toBeGreaterThan(0);
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].focusSkillIds).toEqual(["div-facts"]);
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
    expect(start.questions[0]).toMatchObject({ kind: "choice", id: "q0", view: { prompt: "2 x 3?", choices: ["6", "5", "8", "9"] } });
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
    expect(fresh.questions.every((q) => q.kind === "choice")).toBe(true);
  });
});
