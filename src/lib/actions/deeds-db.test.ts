// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { hintFor } from "@/lib/utils/skill-hints";
import { starsFor } from "@/lib/utils/deed-scoring";
import type { Question } from "@/lib/utils/drill-generators";

/**
 * The second-chance contract against a REAL Postgres database. Every rule here is enforced from
 * the stored run, so the test drives the actions against rows it seeded itself, and checks both
 * what reaches the browser (no answer while a try is open) and what was written (nothing, on a
 * refusal). Runs in its own schema so it can share a Postgres server with the other
 * real-database tests.
 */
const SCHEMA = "test_deeds_db";
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
});
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => ({ access: { userId: "child:c1" }, familyId: "f1" }),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-play", () => ({ loadRealmSettings: vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS })) }));
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
const { loadRealmSettings } = await import("@/lib/services/realm-play");
const { buildDeedRun } = await import("@/lib/utils/deed-engine");

// The tables the run touches, as the migrations make them (foreign keys left out); `subject` and
// `activity_log` carry only the columns the school count reads.
const DDL = [
  `CREATE TABLE deed_run (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, deed_id text NOT NULL, skill_ids text NOT NULL,
    band text NOT NULL, questions text NOT NULL, responses text DEFAULT '[]' NOT NULL,
    mastery_start text DEFAULT '{}' NOT NULL, correct_count integer DEFAULT 0 NOT NULL,
    flawless boolean DEFAULT false NOT NULL, started_at timestamptz NOT NULL, completed_at timestamptz,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    second_tries text DEFAULT '[]' NOT NULL, stars integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'deed' NOT NULL, second_chances boolean DEFAULT false NOT NULL)`,
  `CREATE TABLE skill_mastery (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL,
    level integer DEFAULT 0 NOT NULL, recent_results text DEFAULT '[]' NOT NULL,
    correct_total integer DEFAULT 0 NOT NULL, attempt_total integer DEFAULT 0 NOT NULL,
    last_practiced_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`,
  `CREATE UNIQUE INDEX skill_mastery_child_skill_idx ON skill_mastery (child_id, skill_id)`,
  `CREATE TABLE kingdom_progress (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, building_id text NOT NULL,
    deeds_done integer DEFAULT 0 NOT NULL, completed_at timestamptz,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`,
  `CREATE UNIQUE INDEX kingdom_progress_child_building_idx ON kingdom_progress (child_id, building_id)`,
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, spell_school text DEFAULT 'none' NOT NULL)`,
  `CREATE TABLE activity_log (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, subject_id text NOT NULL)`,
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
     VALUES ($1, 'c1', 'well-stones', $2, '3-5', $3, $4, '{}', NOW(), $5, NOW(), NOW(), $6, $7, $9, $8)`,
    [
      id, JSON.stringify([SKILL]), JSON.stringify(qs), JSON.stringify(over.responses ?? qs.map(() => null)),
      over.completed ? new Date() : null, over.secondTries ?? "[]", over.stars ?? 0, over.secondChances ?? true,
      over.kind ?? "deed",
    ],
  );
  return id;
}

async function stored(id = "run1"): Promise<{ responses: string; second_tries: string; stars: number; completed_at: Date | null }> {
  const r = await client.query("SELECT responses, second_tries, stars, completed_at FROM deed_run WHERE id = $1", [id]);
  return r.rows[0];
}

async function deedsDone(): Promise<number> {
  const r = await client.query("SELECT coalesce(sum(deeds_done), 0) AS n FROM kingdom_progress WHERE child_id = 'c1'");
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["deed_run", "skill_mastery", "kingdom_progress"]) await client.query(`DELETE FROM ${t}`);
  vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
  vi.mocked(buildDeedRun).mockClear();
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
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

  it("a right retry resolves with the answer, and mastery read only the first try", async () => {
    await seedRun();
    await answerDeedQuestion("run1", 1, "6");
    const r = await retryDeedQuestion("run1", 1, "9");
    expect(r).toMatchObject({ correct: true, secondChance: false, answer: "9" });
    const row = await client.query("SELECT recent_results, attempt_total FROM skill_mastery WHERE child_id = 'c1' AND skill_id = $1", [SKILL]);
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
    expect(s).toMatchObject({ stars: 1, previousBest: 0, counted: true, kind: "deed", correctCount: 2, total: 4, flawless: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 1, stars: 0, maxStars: 0 });
    expect((await stored()).stars).toBe(1);
    expect(await deedsDone()).toBe(1);
  });

  it("a starless run teaches but does not build, and reports the best it did not beat", async () => {
    await seedRun({ id: "old", responses: ["6", "9", "12", "15"], secondTries: "[]", completed: true, stars: 2 });
    await seedRun({ responses: ["5", "6", "7", "8"], secondTries: JSON.stringify(["", "", "", ""]) });
    const s = await completeDeedRun("run1");
    expect(s).toMatchObject({ stars: 0, previousBest: 2, counted: false });
    expect(s.building).toMatchObject({ label: "Village Well", done: 0 });
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

  it("does not open the Crown Challenge yet", async () => {
    await expect(startDeedRun("c1", "well-stones", "realm", { challenge: true })).rejects.toThrow("The Crown Challenge is not open yet.");
  });
});

describe("startDeedRun begins a fresh run on the grown-up's settings", () => {
  it("asks the side-quest length and snapshots second chances onto the row", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, sideQuestLength: 5, secondChances: false });
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r).toMatchObject({ kind: "deed", pending: null });
    expect(r.questions).toHaveLength(5);
    const row = await client.query("SELECT kind, second_chances, second_tries FROM deed_run WHERE id = $1", [r.runId]);
    expect(row.rows[0]).toEqual({ kind: "deed", second_chances: false, second_tries: "[]" });
  });

  it("second chances on in the settings are on for the run", async () => {
    const r = await startDeedRun("c1", "well-stones", "realm");
    expect(r.questions).toHaveLength(DEFAULT_REALM_SETTINGS.sideQuestLength);
    const row = await client.query("SELECT second_chances FROM deed_run WHERE id = $1", [r.runId]);
    expect(row.rows[0].second_chances).toBe(true);
  });

  it("brings back a side quest's misses, never a challenge's", async () => {
    const miss = (id: string): Question => ({ ...QUESTIONS[0], id, prompt: `${id}?` });
    await seedRun({ id: "deed-old", questions: [miss("deed-miss")], responses: ["5"], completed: true });
    await seedRun({ id: "crown-old", questions: [miss("crown-miss")], responses: ["5"], completed: true, kind: "challenge" });
    await startDeedRun("c1", "well-stones", "realm");
    const asked = vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id);
    expect(asked).toEqual(["deed-miss"]);
  });

  it("a miss put right on the second try still comes back", async () => {
    await seedRun({ id: "deed-old", questions: [QUESTIONS[1]], responses: ["6"], secondTries: JSON.stringify(["9"]), completed: true });
    await startDeedRun("c1", "well-stones", "realm");
    expect(vi.mocked(buildDeedRun).mock.calls[0][0].recentMisses.map((q) => q.id)).toEqual(["q1"]);
  });
});

describe("getSchoolCounts", () => {
  it("counts finished side quests, never a Crown Challenge", async () => {
    await seedRun({ id: "deed-done", responses: ["6", "9", "12", "15"], completed: true });
    await seedRun({ id: "crown-done", responses: ["6", "9", "12", "15"], completed: true, kind: "challenge" });
    expect((await getSchoolCounts("c1")).form).toBe(1);
  });
});
