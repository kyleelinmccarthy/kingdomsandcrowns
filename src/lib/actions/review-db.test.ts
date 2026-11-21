// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { HERO_ONLY, NOT_IN_CHRONICLE } from "@/lib/utils/deed-refusals";
import { QUICK_REVIEW_TITLE, REVIEW_STORY, stoneTitle } from "@/lib/utils/review-copy";
import type { Question } from "@/lib/utils/drill-generators";
import { KINGDOM_PROGRESS_DDL, REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * A review run against a REAL libsql database: it teaches (mastery moves on a first answer) and
 * pays nothing (no ledger row, no kingdom progress, no stars), and finishing it twice at once
 * completes it once.
 */
const client = testDatabase("review-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "child:c1" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-play", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/realm-play")>("@/lib/services/realm-play");
  return { ...actual, loadRealmSettings: vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS })) };
});
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: "2026-11-09", timeOfDay: "10:00" }) }));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: vi.fn(async () => null) }));
vi.mock("@/lib/services/deeds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/deeds")>("@/lib/services/deeds");
  return {
    ...actual,
    loadDeedBest: vi.fn(actual.loadDeedBest),
    loadHeroLevels: vi.fn(async () => ({
      enabled: true, tone: "gentle", band: "g23",
      grades: { math: "3", reading: "3", language: "3", science: "3" },
    })),
  };
});

const { startReviewRun, getReviewDue } = await import("./review");
const { answerDeedQuestion, resolveDeedQuestion, completeDeedRun } = await import("./deeds");
const { loadRecentMisses } = await import("@/lib/services/deed-run-store");
const { loadDeedBest, loadHeroLevels } = await import("@/lib/services/deeds");
const { requireChildAccess } = await import("@/lib/auth/access");
const { loadLearningProfileRow } = await import("@/lib/services/learning-profile");

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
  `CREATE TABLE learning_focus (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL, created_at integer NOT NULL)`,
  `CREATE TABLE drill_item (
    id text PRIMARY KEY NOT NULL, pool_id text NOT NULL, skill_id text NOT NULL, band text NOT NULL, prompt text NOT NULL,
    answer text NOT NULL, distractors text NOT NULL, read_aloud text, level integer DEFAULT 2 NOT NULL, updated_at integer NOT NULL)`,
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
];

const LEARNED = ["mul-facts", "div-facts", "add-100", "place-value"];
const LONG_AGO = 1_700_000_000;
const PLACE = "ringstones";

async function learn(skills = LEARNED, level = 1): Promise<void> {
  for (const [i, skillId] of skills.entries()) {
    await client.query(
      `INSERT INTO skill_mastery (id, child_id, skill_id, level, last_practiced_at, created_at, updated_at)
       VALUES (?1, 'c1', ?2, ?3, ?4, unixepoch(), unixepoch())`,
      [`m${i}`, skillId, level, LONG_AGO],
    );
  }
}

async function started(): Promise<{ runId: string; questions: Question[] }> {
  const r = await startReviewRun("c1", { kind: "stone", placeId: PLACE });
  if ("empty" in r) throw new Error("expected a run");
  const row = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [r.runId]);
  return { runId: r.runId, questions: JSON.parse(row.rows[0].questions as string) as Question[] };
}

async function count(sql: string): Promise<number> {
  return Number((await client.query(sql)).rows[0].n);
}
const attemptTotal = () => count("SELECT coalesce(sum(attempt_total), 0) AS n FROM skill_mastery WHERE child_id = 'c1'");

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["deed_run", "skill_mastery", "kingdom_progress", "realm_settings", "realm_play_ledger", "learning_focus"]) await client.query(`DELETE FROM ${t}`);
});

afterAll(async () => {
  client.close();
});

describe("a riddle stone's review run", () => {
  it("brings in a focus skill the hero learned, ahead of the ones practised longest ago", async () => {
    // Nothing is overdue (all practised in the last few minutes), the focus skill the most recently.
    for (const [i, [skillId, secondsAgo]] of ([["mul-facts", 300], ["div-facts", 200], ["add-100", 100], ["place-value", 0]] as const).entries()) {
      await client.query(
        `INSERT INTO skill_mastery (id, child_id, skill_id, level, last_practiced_at, created_at, updated_at)
         VALUES (?1, 'c1', ?2, 1, unixepoch() - ?3, unixepoch(), unixepoch())`,
        [`m${i}`, skillId, secondsAgo],
      );
    }
    const skillsOf = async () => {
      const r = await startReviewRun("c1", { kind: "page" });
      if ("empty" in r) throw new Error("expected a run");
      const row = await client.query("SELECT skill_ids FROM deed_run WHERE id = ?1", [r.runId]);
      await client.query("DELETE FROM deed_run");
      return JSON.parse(row.rows[0].skill_ids as string) as string[];
    };
    expect(await skillsOf()).not.toContain("place-value");
    await client.query("INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES ('f1', 'c1', 'place-value', unixepoch())");
    expect(await skillsOf()).toContain("place-value");
  });

  it("builds three tasks from what the hero has learned, with the stone's header", async () => {
    await learn();
    const r = await startReviewRun("c1", { kind: "stone", placeId: PLACE });
    if ("empty" in r) throw new Error("expected a run");
    expect(r.questions).toHaveLength(3);
    expect(r).toMatchObject({
      kind: "review", pending: null,
      deed: { id: `review:${PLACE}`, title: stoneTitle("The Ringstones"), story: REVIEW_STORY, area: null },
    });
    const row = (await client.query("SELECT deed_id, source_ref, kind, band FROM deed_run WHERE id = ?1", [r.runId])).rows[0];
    expect(row).toMatchObject({ deed_id: null, source_ref: PLACE, kind: "review", band: "g23" });
  });

  it("the Quick review page wears its own header and names the page as its source", async () => {
    await learn();
    const r = await startReviewRun("c1", { kind: "page" });
    if ("empty" in r) throw new Error("expected a run");
    expect(r.deed).toEqual({ id: "review:page", title: QUICK_REVIEW_TITLE, story: REVIEW_STORY, area: null });
    expect((await client.query("SELECT source_ref FROM deed_run WHERE id = ?1", [r.runId])).rows[0].source_ref).toBe("page");
  });

  it("answering moves skill_mastery, and finishing pays nothing: no ledger row, no kingdom progress, no stars", async () => {
    await learn();
    const { runId, questions } = await started();
    for (const [i, q] of questions.entries()) await answerDeedQuestion(runId, i, q.answer);
    expect(await attemptTotal()).toBe(3);

    const s = await completeDeedRun(runId);
    expect(s).toMatchObject({ kind: "review", stars: 0, counted: false, building: null, minutesEarned: 0, correctCount: 3, flawless: true });
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM kingdom_progress")).toBe(0);
    const run = (await client.query("SELECT stars, completed_at FROM deed_run WHERE id = ?1", [runId])).rows[0];
    expect(run.stars).toBe(0);
    expect(run.completed_at).not.toBeNull();
  });

  it("finishing a review does not read the hero's best stars: it belongs to no deed", async () => {
    await learn();
    const { runId, questions } = await started();
    for (const [i, q] of questions.entries()) await answerDeedQuestion(runId, i, q.answer);
    vi.mocked(loadDeedBest).mockClear();
    await completeDeedRun(runId);
    expect(loadDeedBest).not.toHaveBeenCalled();
  });

  it("reads the hero's levels once: the focus picks are judged on the grades already in hand", async () => {
    await learn();
    vi.mocked(loadHeroLevels).mockClear();
    await started();
    expect(loadHeroLevels).toHaveBeenCalledTimes(1);
  });

  it("two tabs finishing one review complete it once", async () => {
    await learn();
    const { runId, questions } = await started();
    for (const [i, q] of questions.entries()) await answerDeedQuestion(runId, i, q.answer);
    const before = await attemptTotal();
    const results = await Promise.allSettled([completeDeedRun(runId), completeDeedRun(runId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await attemptTotal()).toBe(before);
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
  });

  it("an open review run for the same stone is resumed, a different stone starts its own", async () => {
    await learn();
    const first = await started();
    const again = await startReviewRun("c1", { kind: "stone", placeId: PLACE });
    if ("empty" in again) throw new Error("expected a run");
    expect(again.runId).toBe(first.runId);
    const other = await startReviewRun("c1", { kind: "stone", placeId: "highcairn" });
    if ("empty" in other) throw new Error("expected a run");
    expect(other.runId).not.toBe(first.runId);
    expect(await count("SELECT count(*) AS n FROM deed_run")).toBe(2);
  });

  it("a finished review run is not resumed", async () => {
    await learn();
    const { runId, questions } = await started();
    for (const [i, q] of questions.entries()) await answerDeedQuestion(runId, i, q.answer);
    await completeDeedRun(runId);
    const next = await startReviewRun("c1", { kind: "stone", placeId: PLACE });
    if ("empty" in next) throw new Error("expected a run");
    expect(next.runId).not.toBe(runId);
  });

  it("a brand-new child has nothing to review", async () => {
    expect(await startReviewRun("c1", { kind: "stone", placeId: PLACE })).toEqual({ empty: true });
    expect(await startReviewRun("c1", { kind: "page" })).toEqual({ empty: true });
    expect(await getReviewDue("c1")).toBe(false);
    expect(await count("SELECT count(*) AS n FROM deed_run")).toBe(0);
  });

  it("a hero with fewer choices sees two options on every task, the answer among them", async () => {
    await learn();
    vi.mocked(loadLearningProfileRow).mockResolvedValueOnce({ fewerChoices: true } as never);
    const { questions } = await started();
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.choices).toHaveLength(2);
      expect(q.choices).toContain(q.answer);
    }
  });

  it("skills only seen at level 0 are not reviewed", async () => {
    await learn(LEARNED, 0);
    expect(await startReviewRun("c1", { kind: "page" })).toEqual({ empty: true });
  });

  it("a grown-up starting a stone review is refused, and nothing is written", async () => {
    await learn();
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "parent:u1" }, familyId: "f1" } as never);
    await expect(startReviewRun("c1", { kind: "stone", placeId: PLACE })).rejects.toThrow(HERO_ONLY);
    expect(await count("SELECT count(*) AS n FROM deed_run")).toBe(0);
  });

  it("a grown-up may start Quick review from the page, as they may a side quest", async () => {
    await learn();
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "parent:u1" }, familyId: "f1" } as never);
    const r = await startReviewRun("c1", { kind: "page" });
    expect("empty" in r).toBe(false);
  });

  it.each([null, undefined, "stone", 7, {}, { kind: "garden" }, { kind: "stone" }, { kind: "stone", placeId: 7 }])(
    "a malformed origin %j is refused before anything is read or written",
    async (origin) => {
      await learn();
      await expect(startReviewRun("c1", origin as never)).rejects.toThrow(NOT_IN_CHRONICLE);
      expect(await count("SELECT count(*) AS n FROM deed_run")).toBe(0);
    },
  );

  it("a place the Realm does not know is refused", async () => {
    await learn();
    await expect(startReviewRun("c1", { kind: "stone", placeId: "nowhere" })).rejects.toThrow(NOT_IN_CHRONICLE);
    expect(await count("SELECT count(*) AS n FROM deed_run")).toBe(0);
  });
});

describe("never above the hero's own grade (RH-c): a K hero's read-g1 from trails", () => {
  const K = { enabled: true, tone: "gentle" as const, band: "k1" as const, grades: { math: "K", reading: "K", language: "K", science: "K", logic: "K" } as const };
  beforeEach(async () => {
    await client.query("DELETE FROM drill_item");
    for (const n of [1, 2, 3, 4]) {
      await client.query(
        `INSERT INTO drill_item (id, pool_id, skill_id, band, prompt, answer, distractors, level, updated_at)
         VALUES (?1, 'read-g1', 'read-g1', 'k1', ?2, 'cat', '["dog","sun","hat"]', 1, unixepoch())`,
        [`rg1-${n}`, `Which word is cat? ${n}`],
      );
    }
    await learn(["read-g1"], 2);
    vi.mocked(loadHeroLevels).mockResolvedValue(K as never);
  });
  afterEach(() => {
    vi.mocked(loadHeroLevels).mockReset();
    vi.mocked(loadHeroLevels).mockResolvedValue({ enabled: true, tone: "gentle", band: "g23", grades: { math: "3", reading: "3", language: "3", science: "3" } } as never);
  });

  it("is not reviewed at a riddle stone or on Quick review, and does not light the stones", async () => {
    expect(await startReviewRun("c1", { kind: "stone", placeId: PLACE })).toEqual({ empty: true });
    expect(await startReviewRun("c1", { kind: "page" })).toEqual({ empty: true });
    expect(await getReviewDue("c1")).toBe(false);
  });

  it("is reviewed, and lights the stones, when a grown-up picked it as a focus", async () => {
    await client.query("INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES ('f1', 'c1', 'read-g1', unixepoch())");
    expect(await getReviewDue("c1")).toBe(true);
    for (const origin of [{ kind: "stone", placeId: PLACE }, { kind: "page" }] as const) {
      const r = await startReviewRun("c1", origin);
      if ("empty" in r) throw new Error("expected a run");
      const row = await client.query("SELECT skill_ids FROM deed_run WHERE id = ?1", [r.runId]);
      expect(JSON.parse(row.rows[0].skill_ids as string)).toEqual(["read-g1"]);
    }
  });
});

describe("getReviewDue", () => {
  it("is true when something learned has rested past its interval, false when it was just practised", async () => {
    await learn();
    expect(await getReviewDue("c1")).toBe(true);
    await client.query("UPDATE skill_mastery SET last_practiced_at = unixepoch()");
    expect(await getReviewDue("c1")).toBe(false);
  });
});

describe("a finished review run and the best a side quest keeps", () => {
  it("loadDeedBest does not include it", async () => {
    await learn();
    const { runId, questions } = await started();
    for (const [i, q] of questions.entries()) await answerDeedQuestion(runId, i, q.answer);
    await completeDeedRun(runId);
    expect(await loadDeedBest("c1")).toEqual([]);
  });
});

describe("misses and what comes back", () => {
  it("a first-try miss in a finished review run comes back in a later review", async () => {
    await learn();
    const { runId, questions } = await started();
    const wrong = questions[0].choices.find((c) => c !== questions[0].answer)!;
    await answerDeedQuestion(runId, 0, wrong);
    await resolveDeedQuestion(runId, 0);
    for (const [i, q] of questions.entries()) if (i > 0) await answerDeedQuestion(runId, i, q.answer);
    await completeDeedRun(runId);

    expect((await loadRecentMisses("c1")).map((q) => q.id)).toEqual([questions[0].id]);
    const next = await startReviewRun("c1", { kind: "page" });
    if ("empty" in next) throw new Error("expected a run");
    const stored = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [next.runId]);
    expect((JSON.parse(stored.rows[0].questions as string) as Question[]).map((q) => q.id)).toContain(questions[0].id);
  });

  it("a task of a kind this build does not know is skipped, and the choice miss beside it still comes back", async () => {
    const odd = { kind: "nope", id: "m0", skillId: "mul-facts", prompt: "Cut it", answer: "3/4" };
    const q: Question = { id: "cq", skillId: "mul-facts", prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" };
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES ('r1', 'c1', 'well-stones', '["mul-facts"]', 'g23', ?1, '["x","5"]', '{}',
         unixepoch(), unixepoch(), unixepoch(), unixepoch(), 'deed')`,
      [JSON.stringify([odd, q])],
    );
    expect((await loadRecentMisses("c1")).map((m) => m.id)).toEqual(["cq"]);
  });

  it("an open review run holding a kind this build does not know is not resumed: a fresh one starts", async () => {
    await learn();
    const odd = { kind: "nope", id: "n0", skillId: "mul-facts", prompt: "?", answer: "x" };
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, source_ref, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES ('newer', 'c1', NULL, ?2, '["mul-facts"]', 'g23', ?1, '[null]', '{}',
         unixepoch(), NULL, unixepoch(), unixepoch(), 'review')`,
      [JSON.stringify([odd]), PLACE],
    );
    const r = await startReviewRun("c1", { kind: "stone", placeId: PLACE });
    if ("empty" in r) throw new Error("expected a run");
    expect(r.runId).not.toBe("newer");
  });

  it("bench misses do not crowd a choice miss out of a review run: the cap counts only what review re-asks", async () => {
    await learn();
    const cut = (i: number) => ({
      kind: "measure", id: `m${i}`, skillId: "add-100", prompt: "Cut it.", mode: "cut", unit: "feet",
      answer: "7", step: "1", maxLength: "20", bridge: "12 − 5 = 7",
    });
    const q: Question = { id: "cq", skillId: "mul-facts", prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" };
    const insert = (id: string, questions: unknown[], responses: string[], ago: number) => client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES (?1, 'c1', 'well-stones', '["add-100"]', 'g23', ?2, ?3, '{}',
         unixepoch() - ?4, unixepoch() - ?4, unixepoch(), unixepoch(), 'deed')`,
      [id, JSON.stringify(questions), JSON.stringify(responses), ago],
    );
    await insert("older", [q], ["5"], 600); // the choice miss, in the older run
    await insert("newer", [1, 2, 3, 4, 5].map(cut), ["c:8", "c:8", "c:8", "c:8", "c:8"], 60); // five bench misses since

    const next = await startReviewRun("c1", { kind: "page" });
    if ("empty" in next) throw new Error("expected a run");
    const stored = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [next.runId]);
    expect((JSON.parse(stored.rows[0].questions as string) as Question[]).map((x) => x.id)).toContain("cq");
  });

  it("a miss in a Crown Challenge never comes back", async () => {
    const q: Question = { id: "cq", skillId: "mul-facts", prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" };
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, mastery_start,
         started_at, completed_at, created_at, updated_at, kind)
       VALUES ('ch1', 'c1', 'well-stones', '["mul-facts"]', 'g23', ?1, '["5"]', '{}',
         unixepoch(), unixepoch(), unixepoch(), unixepoch(), 'challenge')`,
      [JSON.stringify([q])],
    );
    expect(await loadRecentMisses("c1")).toEqual([]);
  });
});
