// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { lockRight as right, lockWrong as wrong } from "@/test/lock-answers";
import { DEFAULT_REALM_SETTINGS, enabledHandsOnKinds } from "@/lib/utils/realm-settings";
import { FINISHED, NOT_IN_CHRONICLE, TOWER_SHUT, WORLD_HERO_ONLY, WORLD_LOCKS_OFF, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_STORY, DOOR_STORY, TOWER_STORY } from "@/lib/utils/world-lock-copy";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { lockLevel, lockRun } from "@/lib/utils/practice-run";
import { findSkill, type SkillArea } from "@/lib/utils/skills";
import { worldObjectById } from "@/lib/realm/world-objects";
import type { ClientTask, Task } from "@/lib/tasks/types";
import type { Grade } from "@/lib/utils/grade-levels";
import {
  DEED_RUN_DDL, REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_MATERIAL_DDL, REALM_PLACE_FOUND_DDL, REALM_SETTINGS_DDL, REALM_WORLD_STATE_DDL,
  SKILL_MASTERY_DDL,
} from "@/test/realm-db-ddl";

/**
 * Opening a chest or a vault door against a REAL libsql database (R-G3, PC-G2, RG-c, RG-n): a
 * `world` run of one lock, named by the object, started by the hero alone; finished right, the
 * run's close, the object's "open" and its rewards land in one locked transaction, once.
 */
const client = testDatabase("world-locks-db");
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
// The server's day, in the family's zone (F17): the zone is mocked, `usableTimeZone` is the real one.
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: vi.fn(async () => ({ date: "2026-11-09", timeOfDay: "10:00" })) }));
vi.mock("@/lib/services/family-timezone", async () => ({
  ...(await vi.importActual<typeof import("@/lib/services/family-timezone")>("@/lib/services/family-timezone")),
  getTimezoneForChild: async () => "America/Denver",
}));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: vi.fn(async () => null) }));
vi.mock("@/lib/services/realm-world-state", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/realm-world-state")>("@/lib/services/realm-world-state");
  return { ...actual, recordTowerSolve: vi.fn(actual.recordTowerSolve) };
});
vi.mock("@/lib/services/realm-places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/realm-places")>("@/lib/services/realm-places");
  return { ...actual, addPlacesFound: vi.fn(actual.addPlacesFound) };
});
/** Every strand spelled out (RG-d): the ones a lock must not draw from sit far from the ones it should. */
const HERO = (over: Partial<Record<SkillArea, Grade>> = {}, enabled = true) => ({
  enabled, tone: "gentle" as const, band: "g45" as const,
  grades: { math: "8", reading: "8", language: "8", science: "8", logic: "5", ...over } as Record<SkillArea, Grade>,
});
vi.mock("@/lib/services/deeds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/deeds")>("@/lib/services/deeds");
  return { ...actual, loadHeroLevels: vi.fn(async () => HERO()) };
});

const { startTowerRun, startWorldLockRun } = await import("./world-locks");
const { startPracticeRun } = await import("./practice");
const { answerDeedQuestion, completeDeedRun, resolveDeedQuestion, retryDeedQuestion } = await import("./deeds");
const { loadFoundPages, loadStarredBands, loadWorldRaw, loadWorldRows, recordTowerSolve, starredBandsQuery, worldClock, worldRowsQuery } = await import("@/lib/services/realm-world-state");
const { requireChildAccess } = await import("@/lib/auth/access");
const { loadHeroLevels } = await import("@/lib/services/deeds");
const { loadRealmSettings, paySideQuest } = await import("@/lib/services/realm-play");
const { realmNow } = await import("@/lib/services/realm-clock");
const { addPlacesFound } = await import("@/lib/services/realm-places");

const DDL = [
  ...DEED_RUN_DDL,
  ...SKILL_MASTERY_DDL,
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
  ...REALM_MATERIAL_DDL,
  ...REALM_WORLD_STATE_DDL,
  ...REALM_PLACE_FOUND_DDL,
  `CREATE TABLE learning_focus (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL, created_at integer NOT NULL)`,
];
const TABLES = [
  "deed_run", "skill_mastery", "realm_settings", "realm_play_ledger", "child", "realm_material", "realm_world_state", "realm_place_found", "learning_focus",
];

const GROWN_UP = { access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>;
const LOCKS_OFF = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: false } };
/** A week before the mocked day, so a chest opened then has relocked by it (F17: never "now minus 7 days"). */
const LAST_WEEK = new Date("2026-11-01T12:00:00Z");

const count = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
const runs = () => count("SELECT count(*) AS n FROM deed_run");
const stateRows = () => count("SELECT count(*) AS n FROM realm_world_state");
const rewardRows = () => count("SELECT count(*) AS n FROM realm_world_state WHERE object_id LIKE 'decor:%' OR object_id LIKE 'lore:%'");
async function worldState(): Promise<Record<string, string>> {
  const rows = (await client.query("SELECT object_id, state FROM realm_world_state ORDER BY object_id")).rows;
  return Object.fromEntries(rows.map((r) => [r.object_id as string, r.state as string]));
}
async function storedTasks(runId: string): Promise<Task[]> {
  return JSON.parse((await client.query("SELECT questions FROM deed_run WHERE id = ?1", [runId])).rows[0].questions as string) as Task[];
}
const skillsOf = async (runId: string) => [...new Set((await storedTasks(runId)).map((t) => t.skillId))];
const openedAt = (objectId: string, at: Date) => client.query("UPDATE realm_world_state SET updated_at = ?1 WHERE object_id = ?2", [at, objectId]);
/** Starts a lock and answers it right first time, ready to finish. */
async function solved(objectId: string): Promise<string> {
  const start = await startWorldLockRun("c1", objectId);
  await answerDeedQuestion(start.runId, 0, right((await storedTasks(start.runId))[0]));
  return start.runId;
}
/** Opens the object as the hero would: a right answer, then Done. */
async function open(objectId: string) {
  return completeDeedRun(await solved(objectId));
}
/** Two right runs for one object: the first left past the resume window, so the second start writes a new one. */
async function twoRightRuns(objectId: string): Promise<[string, string]> {
  const first = await solved(objectId);
  await client.query("UPDATE deed_run SET started_at = started_at - 7200 WHERE id = ?1", [first]);
  const second = await solved(objectId);
  expect(second).not.toBe(first);
  return [first, second];
}
const viewOf = (q: ClientTask) => (q as { view: { puzzle: string } }).view;

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of TABLES) await client.query(`DELETE FROM ${t}`);
  await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c1', 'f1', 'Ada')");
  vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
  vi.mocked(loadHeroLevels).mockResolvedValue(HERO() as never);
  vi.mocked(realmNow).mockResolvedValue({ date: "2026-11-09", timeOfDay: "10:00" });
  vi.mocked(requireChildAccess).mockClear();
});

afterAll(async () => {
  client.close();
});

describe("the world's clock and rows", () => {
  it("reads the server's day in the family's zone", async () => {
    expect(await worldClock("c1")).toEqual({ today: "2026-11-09", zone: "America/Denver" });
  });

  it("reads a row's time back as the same instant it was written (epoch seconds, never milliseconds)", async () => {
    const at = new Date("2026-11-03T06:30:00Z");
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('w1', 'c1', 'chest:west-lane', 'open', ?1)", [at]);
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('w2', 'c2', 'chest:west-lane', 'open', ?1)", [at]);
    const rows = await loadWorldRows("c1");
    expect(rows).toEqual([{ objectId: "chest:west-lane", state: "open", updatedAt: at }]);
    expect(rows[0].updatedAt.getTime()).toBe(at.getTime());
  });
});

describe("found pages", () => {
  const lore = (id: string, at: Date, row: string) =>
    client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES (?1, 'c1', ?2, 'found', ?3)", [row, `lore:${id}`, at]);

  it("lists the hero's pages in the order they were found, with their title and text", async () => {
    await lore("the-locksmith", new Date("2026-11-05T12:00:00Z"), "p2");
    await lore("the-first-lock", new Date("2026-11-03T12:00:00Z"), "p1");
    const pages = await loadFoundPages("c1");
    expect(pages.map((p) => p.id)).toEqual(["the-first-lock", "the-locksmith"]);
    expect(pages[0]).toEqual({ id: "the-first-lock", title: "The First Lock", text: expect.stringContaining("smith") });
  });

  it("breaks a tie on the time by object id, so the order never wobbles", async () => {
    const at = new Date("2026-11-03T12:00:00Z");
    await lore("the-locksmith", at, "p2");
    await lore("the-first-lock", at, "p1");
    await lore("the-castle-cellar", at, "p3");
    expect((await loadFoundPages("c1")).map((p) => p.id)).toEqual(["the-castle-cellar", "the-first-lock", "the-locksmith"]);
  });

  it("skips an id that is not in the catalog, and rows that are not pages", async () => {
    await lore("nope", new Date("2026-11-03T12:00:00Z"), "p1");
    await lore("the-first-lock", new Date("2026-11-04T12:00:00Z"), "p2");
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('d1', 'c1', 'decor:sundial', 'placed', ?1)", [new Date()]);
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('d2', 'c1', 'chest:west-lane', 'open', ?1)", [new Date()]);
    expect((await loadFoundPages("c1")).map((p) => p.id)).toEqual(["the-first-lock"]);
  });

  it("reads only this hero's pages", async () => {
    await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c2', 'f1', 'Bo')");
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('o1', 'c2', 'lore:the-locksmith', 'found', ?1)", [new Date()]);
    await lore("the-first-lock", new Date(), "p1");
    expect((await loadFoundPages("c1")).map((p) => p.id)).toEqual(["the-first-lock"]);
    expect((await loadFoundPages("c2")).map((p) => p.id)).toEqual(["the-locksmith"]);
  });

  it("is empty for a hero who has found none", async () => {
    expect(await loadFoundPages("c1")).toEqual([]);
  });

  it("gives the pages whatever the locks switch says (R-G7: what was found stays)", async () => {
    await lore("the-first-lock", new Date("2026-11-04T12:00:00Z"), "p1");
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF as never);
    expect((await loadFoundPages("c1")).map((p) => p.id)).toEqual(["the-first-lock"]);
  });

  it("the pages a door and a chest really gave are the pages found", async () => {
    await open("door:ringstones");
    expect((await loadFoundPages("c1")).map((p) => p.id)).toEqual(["ringstones-map"]);
  });
});

describe("startWorldLockRun", () => {
  it("starts one lock at the hero's logic grade, a world run named by the chest", async () => {
    const start = await startWorldLockRun("c1", "chest:west-lane");
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(start.kind).toBe("world");
    expect(start.deed).toEqual({ id: "chest:west-lane", title: "The old chest", story: CHEST_STORY, area: "logic" });
    expect(start.questions).toHaveLength(1);
    expect(start.questions[0].kind).toBe("lock");
    expect(await skillsOf(start.runId)).toEqual(["logic-g45"]);
    const row = (await client.query("SELECT deed_id, source_ref, kind, band, skill_ids, second_chances FROM deed_run WHERE id = ?1", [start.runId])).rows[0];
    expect(row).toMatchObject({ deed_id: null, source_ref: "chest:west-lane", kind: "world", band: "g45", skill_ids: '["logic-g45"]', second_chances: 1 });
  });

  it("names a vault door's run by the door", async () => {
    const start = await startWorldLockRun("c1", "door:ringstones");
    expect(start.deed).toEqual({ id: "door:ringstones", title: "The vault door", story: DOOR_STORY, area: "logic" });
  });

  it("never sends the solution, fresh or resumed, for a grid or a sort (Review Focus 4)", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ language: "4", logic: "4" }) as never);
    for (const id of ["chest:west-lane", "chest:library"]) {
      const fresh = await startWorldLockRun("c1", id);
      const resumed = await startWorldLockRun("c1", id);
      expect(resumed.runId).toBe(fresh.runId);
      for (const s of [fresh, resumed]) expect(JSON.stringify(s)).not.toMatch(/"solution"|"fits"/);
    }
    expect(await runs()).toBe(2);
  });

  it("the library chest: a vocabulary sort within the hero's band, else their logic lock, never a choice (Review Focus 5)", async () => {
    const cases: [Partial<Record<SkillArea, Grade>>, string][] = [
      [{ language: "4", logic: "4" }, "vocab-g45"],
      [{ language: "2", logic: "2" }, "logic-g23"],
      [{ language: "2", logic: "5" }, "logic-g45"],
    ];
    for (const [grades, skill] of cases) {
      await client.query("DELETE FROM deed_run");
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO(grades) as never);
      const start = await startWorldLockRun("c1", "chest:library");
      expect(await skillsOf(start.runId), skill).toEqual([skill]);
      expect(start.questions.map((q) => q.kind)).toEqual(["lock"]);
      if (skill.startsWith("vocab")) expect(viewOf(start.questions[0]).puzzle).toBe("sort");
      expect(start.deed.area).toBe(skill.startsWith("vocab") ? "language" : "logic");
    }
  });

  it("the garden chest: the science sort of the hero's science band", async () => {
    for (const [science, skill] of [["6", "science-g68"], ["3", "science-g23"]] as const) {
      await client.query("DELETE FROM deed_run");
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ science }) as never);
      const start = await startWorldLockRun("c1", "chest:garden");
      expect(await skillsOf(start.runId)).toEqual([skill]);
      expect(viewOf(start.questions[0]).puzzle).toBe("sort");
    }
  });

  it("refuses a grown-up, an unknown id, and practice, writing nothing", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow(WORLD_HERO_ONLY);
    await expect(startWorldLockRun("c1", "chest:nowhere")).rejects.toThrow(NOT_IN_CHRONICLE);
    await expect(startWorldLockRun("c1", "practice")).rejects.toThrow(NOT_IN_CHRONICLE);
    for (const junk of ["__proto__", "toString", "", null, 42]) {
      await expect(startWorldLockRun("c1", junk as never)).rejects.toThrow(NOT_IN_CHRONICLE);
    }
    expect(await runs()).toBe(0);
    expect(await stateRows()).toBe(0);
  });

  it("refuses a hero the caller may not act for (outside the family), and writes nothing", async () => {
    vi.mocked(requireChildAccess).mockRejectedValueOnce(new Error("Not your hero."));
    await expect(startWorldLockRun("c2", "chest:west-lane")).rejects.toThrow("Not your hero.");
    expect(await runs()).toBe(0);
  });

  it("refuses while locks are off, even with a run open, keeping everything found (R-G7)", async () => {
    const before = await startWorldLockRun("c1", "chest:east-lane");
    await client.query(
      `INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES
        ('a', 'c1', 'chest:west-lane', 'open', ?1), ('b', 'c1', 'decor:stone-bench', 'placed', ?1), ('c', 'c1', 'lore:the-first-lock', 'found', ?1)`,
      [LAST_WEEK],
    );
    await client.query("INSERT INTO realm_place_found (id, child_id, place_id, found_at) VALUES ('p', 'c1', 'summit-7', ?1)", [LAST_WEEK]);
    const snapshot = async () => [
      (await client.query("SELECT * FROM realm_world_state ORDER BY id")).rows,
      (await client.query("SELECT * FROM realm_place_found ORDER BY id")).rows,
      (await client.query("SELECT id, completed_at FROM deed_run ORDER BY id")).rows,
    ];
    const was = await snapshot();
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow(WORLD_LOCKS_OFF);
    await expect(startWorldLockRun("c1", "chest:east-lane")).rejects.toThrow(WORLD_LOCKS_OFF);
    await expect(startWorldLockRun("c1", "door:ringstones")).rejects.toThrow(WORLD_LOCKS_OFF);
    expect(await snapshot()).toEqual(was);
    expect(await runs()).toBe(1);
    expect(before.runId).toBeTruthy();
  });

  it("is refused while the Realm is closed", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO({}, false) as never);
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow("The Realm is closed");
    expect(await runs()).toBe(0);
  });

  it("relocks on the seventh local day: opened 23:30 in Denver (06:30 UTC the next day) (Review Focus 2)", async () => {
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('a', 'c1', 'chest:west-lane', 'open', ?1)", [
      new Date("2026-11-03T06:30:00Z"),
    ]);
    expect((await startWorldLockRun("c1", "chest:west-lane")).kind).toBe("world");
    await client.query("DELETE FROM deed_run");
    await openedAt("chest:west-lane", new Date("2026-11-03T18:00:00Z"));
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow(WORLD_OPEN);
    expect(await runs()).toBe(0);
  });
});

describe("a lock run picked back up, or drawn fresh (G2 m2, m3)", () => {
  /** Two starts on two server clocks: the seed is the clock (PC-G3), so a fresh draw is a fresh puzzle. */
  const at = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(ms);
  const taskId = async (runId: string) => (await storedTasks(runId))[0].id;

  it("leaves an open run whose stored skill this build no longer has behind, and starts fresh; the fresh one is resumed next", async () => {
    const old = await startWorldLockRun("c1", "chest:west-lane");
    // Started a minute before (still inside the resume window), with a skill this build has dropped.
    await client.query(`UPDATE deed_run SET skill_ids = '["no-such-skill"]', started_at = started_at - 60 WHERE id = ?1`, [old.runId]);
    const fresh = await startWorldLockRun("c1", "chest:west-lane");
    expect(fresh.runId).not.toBe(old.runId);
    expect(await skillsOf(fresh.runId)).toEqual(["logic-g45"]);
    expect((await startWorldLockRun("c1", "chest:west-lane")).runId).toBe(fresh.runId);
    expect(await runs()).toBe(2);
  });

  it("gives a resumed run Pip's demo by the grade of the stored skill's strand, not the strand a fresh pick would draw", async () => {
    // Young in science, not in logic: the garden chest draws a science sort, with Pip's demo.
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ science: "2", logic: "8" }) as never);
    const garden = await startWorldLockRun("c1", "chest:garden");
    expect(garden.deed.area).toBe("science");
    expect(garden.demo).toEqual({ at: 0 });
    // The same open run, now owned by the west-lane chest, whose fresh pick would be grade-8 logic (no demo).
    await client.query("UPDATE deed_run SET source_ref = 'chest:west-lane' WHERE id = ?1", [garden.runId]);
    const resumed = await startWorldLockRun("c1", "chest:west-lane");
    expect(resumed.runId).toBe(garden.runId);
    expect(resumed.deed.area).toBe("science");
    expect(resumed.demo).toEqual({ at: 0 });
    // And a fresh west-lane run, on a hero old for logic, has none.
    await client.query("DELETE FROM deed_run");
    expect(await startWorldLockRun("c1", "chest:west-lane")).not.toHaveProperty("demo");
  });

  it("after a miss, the next start is a fresh puzzle, not the one missed", async () => {
    const clock = at(1_001);
    try {
      const start = await startWorldLockRun("c1", "chest:west-lane");
      const [task] = await storedTasks(start.runId);
      await answerDeedQuestion(start.runId, 0, wrong(task));
      await resolveDeedQuestion(start.runId, 0);
      await completeDeedRun(start.runId);
      clock.mockReturnValue(2_002);
      const next = await startWorldLockRun("c1", "chest:west-lane");
      expect(next.runId).not.toBe(start.runId);
      expect(await taskId(next.runId)).not.toBe(task.id);
    } finally {
      clock.mockRestore();
    }
  });

  it("a chest relocked by the week opens on a fresh puzzle, not last week's", async () => {
    const clock = at(1_001);
    try {
      const first = await solved("chest:west-lane");
      const firstTask = await taskId(first);
      await completeDeedRun(first);
      await openedAt("chest:west-lane", LAST_WEEK);
      clock.mockReturnValue(2_002);
      const refill = await startWorldLockRun("c1", "chest:west-lane");
      expect(refill.runId).not.toBe(first);
      expect(await taskId(refill.runId)).not.toBe(firstTask);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("finishing a chest or vault door's run", () => {
  it("a right answer opens the chest and gives its first reward", async () => {
    const summary = await open("chest:west-lane");
    expect(summary.world).toEqual({ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] });
    expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed" });
  });

  it("a second-try right answer opens it too", async () => {
    const start = await startWorldLockRun("c1", "chest:west-lane");
    const [task] = await storedTasks(start.runId);
    expect(await answerDeedQuestion(start.runId, 0, wrong(task))).toMatchObject({ correct: false, secondChance: true });
    expect(await retryDeedQuestion(start.runId, 0, right(task))).toMatchObject({ correct: true });
    expect((await completeDeedRun(start.runId)).world).toEqual({ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] });
  });

  it("a miss leaves it locked; the next start is a new run with a new lock", async () => {
    const start = await startWorldLockRun("c1", "chest:west-lane");
    const [task] = await storedTasks(start.runId);
    await answerDeedQuestion(start.runId, 0, wrong(task));
    await resolveDeedQuestion(start.runId, 0);
    expect((await completeDeedRun(start.runId)).world).toEqual({ objectId: "chest:west-lane", opened: false, reason: "missed", rewards: [] });
    expect(await stateRows()).toBe(0);
    const next = await startWorldLockRun("c1", "chest:west-lane");
    expect(next.runId).not.toBe(start.runId);
  });

  it("the next week's opening gives the next reward", async () => {
    await open("chest:west-lane");
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow(WORLD_OPEN);
    await openedAt("chest:west-lane", LAST_WEEK);
    expect((await open("chest:west-lane")).world?.rewards).toEqual([{ kind: "decor", id: "sundial" }]);
    await openedAt("chest:west-lane", LAST_WEEK);
    expect((await open("chest:west-lane")).world?.rewards).toEqual([{ kind: "lore", id: "the-first-lock" }]);
    expect(await worldState()).toEqual({
      "chest:west-lane": "open", "decor:stone-bench": "placed", "decor:sundial": "placed", "lore:the-first-lock": "found",
    });
  });

  it("an emptied chest relocks weekly, opens with a fresh puzzle, and never writes a reward twice (R-G2)", async () => {
    await client.query(
      `INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES
        ('a', 'c1', 'chest:west-lane', 'open', ?1), ('b', 'c1', 'decor:stone-bench', 'placed', ?1),
        ('c', 'c1', 'decor:sundial', 'placed', ?1), ('d', 'c1', 'lore:the-first-lock', 'found', ?1)`,
      [LAST_WEEK],
    );
    const objectIds = async () => (await client.query("SELECT object_id FROM realm_world_state WHERE object_id NOT LIKE 'chest:%' ORDER BY object_id")).rows.map((r) => r.object_id);
    const owned = ["decor:stone-bench", "decor:sundial", "lore:the-first-lock"];
    const first = await open("chest:west-lane");
    expect(first.world).toEqual({ objectId: "chest:west-lane", opened: true, rewards: [] });
    expect(await rewardRows()).toBe(3);
    expect(await objectIds()).toEqual(owned);
    await expect(startWorldLockRun("c1", "chest:west-lane")).rejects.toThrow(WORLD_OPEN);
    await openedAt("chest:west-lane", LAST_WEEK);
    const second = await open("chest:west-lane");
    expect(second.world).toMatchObject({ opened: true, rewards: [] });
    expect(await objectIds()).toEqual(owned);
    expect(await worldState()).toMatchObject({ "chest:west-lane": "open" });
  });

  it("a vault door marks its place found and gives its page, and never relocks", async () => {
    const summary = await open("door:ringstones");
    expect(summary.world).toEqual({
      objectId: "door:ringstones", opened: true, rewards: [{ kind: "fragment", placeId: "summit-7" }, { kind: "lore", id: "ringstones-map" }],
    });
    expect((await client.query("SELECT place_id FROM realm_place_found WHERE child_id = 'c1'")).rows.map((r) => r.place_id)).toEqual(["summit-7"]);
    expect(await worldState()).toEqual({ "door:ringstones": "open", "lore:ringstones-map": "found" });
    vi.mocked(realmNow).mockResolvedValue({ date: "2026-12-09", timeOfDay: "10:00" });
    await openedAt("door:ringstones", LAST_WEEK);
    await expect(startWorldLockRun("c1", "door:ringstones")).rejects.toThrow(WORLD_OPEN);
  });

  describe("a second finish is a no-op (RG-c, Review Focus 1)", () => {
    it("two right runs for one chest, finished one after the other: the chest opens once", async () => {
      const [a, b] = await twoRightRuns("chest:west-lane");
      expect((await completeDeedRun(a)).world).toMatchObject({ opened: true });
      expect((await completeDeedRun(b)).world).toEqual({ objectId: "chest:west-lane", opened: false, reason: "already-open", rewards: [] });
      expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed" });
    });

    it("two right runs for one chest, finished at once: one opens it, the other finds it open", async () => {
      const [a, b] = await twoRightRuns("chest:west-lane");
      const both = await Promise.all([completeDeedRun(a), completeDeedRun(b)]);
      expect(both.map((s) => s.world?.opened).sort()).toEqual([false, true]);
      expect(both.find((s) => !s.world?.opened)?.world?.reason).toBe("already-open");
      expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed" });
    });

    it("one run finished twice: FINISHED the second time, with no second row", async () => {
      const id = await solved("chest:west-lane");
      await completeDeedRun(id);
      await expect(completeDeedRun(id)).rejects.toThrow(FINISHED);
      await expect(Promise.all([completeDeedRun(id), completeDeedRun(id)])).rejects.toThrow(FINISHED);
      expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed" });
    });

    it("one run finished twice at once: one finish, one FINISHED", async () => {
      const id = await solved("door:ringstones");
      const settled = await Promise.allSettled([completeDeedRun(id), completeDeedRun(id)]);
      expect(settled.map((s) => s.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect((settled.find((s) => s.status === "rejected") as PromiseRejectedResult).reason.message).toBe(FINISHED);
      expect(await worldState()).toEqual({ "door:ringstones": "open", "lore:ringstones-map": "found" });
      expect(await count("SELECT count(*) AS n FROM realm_place_found")).toBe(1);
    });
  });

  it("if opening throws, the run stays open and finishes on a retry (RG-n)", async () => {
    const id = await solved("door:ringstones");
    vi.mocked(addPlacesFound).mockRejectedValueOnce(new Error("the disk is full"));
    await expect(completeDeedRun(id)).rejects.toThrow("the disk is full");
    expect((await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [id])).rows[0].completed_at).toBeNull();
    expect(await stateRows()).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_place_found")).toBe(0);
    const retried = await completeDeedRun(id);
    expect(retried.world).toMatchObject({ objectId: "door:ringstones", opened: true });
    expect(await worldState()).toEqual({ "door:ringstones": "open", "lore:ringstones-map": "found" });
    expect(await count("SELECT count(*) AS n FROM realm_place_found")).toBe(1);
  });

  it("a grown-up can't finish the hero's chest run, and nothing is written (Review Focus 3)", async () => {
    const id = await solved("chest:west-lane");
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    await expect(completeDeedRun(id)).rejects.toThrow(WORLD_HERO_ONLY);
    expect((await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [id])).rows[0].completed_at).toBeNull();
    expect(await stateRows()).toBe(0);
    // The hero still can.
    expect((await completeDeedRun(id)).world?.opened).toBe(true);
  });

  it("pays nothing, earns no star, writes no material", async () => {
    vi.mocked(paySideQuest).mockClear();
    const id = await solved("chest:west-lane");
    const summary = await completeDeedRun(id);
    expect(summary).toMatchObject({ kind: "world", stars: 0, minutesEarned: 0, counted: false, building: null });
    expect(paySideQuest).not.toHaveBeenCalled();
    expect(Number((await client.query("SELECT stars FROM deed_run WHERE id = ?1", [id])).rows[0].stars)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material")).toBe(0);
  });

  it("Puzzle practice finishes with no world outcome", async () => {
    const start = await startPracticeRun("c1");
    const tasks = await storedTasks(start.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(start.runId, i, right(t));
    const summary = await completeDeedRun(start.runId);
    expect(summary.kind).toBe("world");
    expect(summary).not.toHaveProperty("world");
    expect(await stateRows()).toBe(0);
  });

  it("every object in the catalog can be started by id", async () => {
    // A guard that the catalog and the action agree: each id resolves, and a start writes its own run.
    for (const id of ["chest:west-lane", "chest:east-lane", "chest:castle-back", "door:highcairn", "door:appleway"]) {
      expect(worldObjectById(id)).not.toBeNull();
      expect((await startWorldLockRun("c1", id)).deed.id).toBe(id);
    }
  });
});

describe("the Puzzle Tower", () => {
  const LOCK_DEEDS = ["well-water", "mill-wheel", "chapel-stars", "watchtower-signals", "garden-bees"];
  /** A finished side quest run, as the Tower's one query reads it. */
  let seq = 0;
  const sideQuest = (over: { deed?: string; band?: string; stars?: number; kind?: string; completed?: boolean; child?: string } = {}) =>
    client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, started_at, completed_at, created_at, updated_at, stars, kind)
       VALUES (?1, ?2, ?3, '[]', ?4, '[]', ?5, ?6, ?5, ?5, ?7, ?8)`,
      [`sq${++seq}`, over.child ?? "c1", over.deed ?? "well-water", over.band ?? "g23", LAST_WEEK, over.completed === false ? null : LAST_WEEK, over.stars ?? 3, over.kind ?? "deed"],
    );
  /** The hero of the brief's cases: grade 4 in logic and science, so the Tower shows floors k1, g23 and g45. */
  const GRADE_FOUR = () => vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ logic: "4", science: "4" }) as never);
  const bands = async () => [...(await loadStarredBands("c1"))].sort();
  /** Starts a floor and answers its lock right first time, ready to finish. */
  async function climbed(band: string): Promise<string> {
    const start = await startTowerRun("c1", band);
    await answerDeedQuestion(start.runId, 0, right((await storedTasks(start.runId))[0]));
    return start.runId;
  }
  const solvedAt = async (band: string) => (await client.query("SELECT state FROM realm_world_state WHERE object_id = ?1", [`tower:${band}`])).rows[0]?.state;

  beforeEach(() => {
    GRADE_FOUR();
  });

  describe("loadStarredBands", () => {
    it("reads the bands with a 3-star run of a science lock side quest", async () => {
      await sideQuest({ band: "g23" });
      expect(await bands()).toEqual(["g23"]);
    });

    it("counts each of the five lock side quests, once a band however many runs", async () => {
      for (const [i, deed] of LOCK_DEEDS.entries()) await sideQuest({ deed, band: i % 2 === 0 ? "g45" : "k1" });
      await sideQuest({ band: "g45" });
      await sideQuest({ band: "g45" });
      expect(await bands()).toEqual(["g45", "k1"]);
    });

    it("counts nothing for 2 stars, another side quest, a challenge, a world run, or a run still open", async () => {
      await sideQuest({ stars: 2 });
      await sideQuest({ deed: "well-stones" });
      await sideQuest({ deed: "well-signs" });
      await sideQuest({ kind: "challenge" });
      await sideQuest({ kind: "world" });
      await sideQuest({ kind: "tower" });
      await sideQuest({ stars: 0, completed: false });
      expect(await bands()).toEqual([]);
    });

    it("reads only this hero's runs", async () => {
      await sideQuest({ child: "c2", band: "g68" });
      await sideQuest({ band: "k1" });
      expect(await bands()).toEqual(["k1"]);
    });

    it("is the empty set for a hero with no side quests", async () => {
      expect(await loadStarredBands("c1")).toEqual(new Set());
    });

    it("the bundle's read hands it up as `starred`", async () => {
      await sideQuest({ band: "g23" });
      expect((await loadWorldRaw("c1")).starred).toEqual(new Set(["g23"]));
    });

    it("reads through the executor it is handed, as the world rows' read does (G5 m5)", async () => {
      await sideQuest({ band: "g23" });
      const inTx = await testDb.transaction(async (tx) => loadStarredBands("c1", tx));
      expect(inTx).toEqual(new Set(["g23"]));
      expect(starredBandsQuery("c1", testDb).toSQL().sql).toBe(starredBandsQuery("c1").toSQL().sql);
    });

    it("the bundle's world read is exactly two queries, run in parallel (G5 m1, PC-G15)", async () => {
      await sideQuest({ band: "g23" });
      // The libsql client's own `execute` (the test client wraps it, and calls it on the real client).
      type Execute = typeof client.client.execute;
      const real = (Object.getPrototypeOf(client.client) as { execute: Execute }).execute;
      let inFlight = 0;
      let most = 0;
      const exec = vi.spyOn(client.client, "execute").mockImplementation(async function (this: unknown, ...args: Parameters<Execute>) {
        inFlight += 1;
        most = Math.max(most, inFlight);
        try {
          // A pause on every query, so two in parallel are both in flight at once and two in a row never are.
          await new Promise((r) => setTimeout(r, 20));
          return await (real as (...a: Parameters<Execute>) => ReturnType<Execute>).apply(this, args);
        } finally {
          inFlight -= 1;
        }
      } as Execute);
      try {
        const raw = await loadWorldRaw("c1");
        expect(raw.starred).toEqual(new Set(["g23"]));
        expect(exec).toHaveBeenCalledTimes(2);
        expect(most).toBe(2);
      } finally {
        exec.mockRestore();
      }
    });
  });

  describe("the query plans (RG-h)", () => {
    const plan = (built: { toSQL: () => { sql: string; params: unknown[] } }) => {
      const { sql, params } = built.toSQL();
      return client.explain(sql, params);
    };

    it("the floor query searches by hero through deed_run_child_completed_idx and scans nothing", async () => {
      const lines = await plan(starredBandsQuery("c1"));
      expect(lines.some((l) => /SEARCH deed_run USING INDEX deed_run_child_completed_idx \(child_id=\?\)/.test(l)), lines.join(" | ")).toBe(true);
      expect(lines.filter((l) => /\bSCAN\b/.test(l) && /deed_run/.test(l)), lines.join(" | ")).toEqual([]);
    });

    it("the floor query names the five lock side quests, 3 stars and the deed kind in its SQL", () => {
      const { sql, params } = starredBandsQuery("c1").toSQL();
      expect(sql).toMatch(/distinct/i);
      expect(params).toEqual(expect.arrayContaining(["c1", "deed", 3, ...LOCK_DEEDS]));
    });

    it("the world rows' read searches by hero through realm_world_state_child_object_idx", async () => {
      const lines = await plan(worldRowsQuery("c1"));
      expect(lines.some((l) => /SEARCH realm_world_state USING (COVERING )?INDEX realm_world_state_child_object_idx \(child_id=\?\)/.test(l)), lines.join(" | ")).toBe(true);
      expect(lines.filter((l) => /\bSCAN\b/.test(l)), lines.join(" | ")).toEqual([]);
    });
  });

  describe("startTowerRun", () => {
    beforeEach(async () => {
      await sideQuest({ band: "g45" });
    });

    it("opens the floors up to the hero's own for a hero with 3 stars at their band, and no higher", async () => {
      for (const band of ["k1", "g23", "g45"]) {
        await client.query("DELETE FROM deed_run WHERE kind = 'tower'");
        expect((await startTowerRun("c1", band)).kind, band).toBe("tower");
      }
      await expect(startTowerRun("c1", "g68")).rejects.toThrow(TOWER_SHUT);
      await expect(startTowerRun("c1", "g912")).rejects.toThrow(TOWER_SHUT);
    });

    it("refuses every floor but the stars' own when only a lower band is starred: the hero's own floor still waits", async () => {
      await client.query("DELETE FROM deed_run");
      await sideQuest({ band: "k1" });
      expect((await startTowerRun("c1", "k1")).kind).toBe("tower");
      await expect(startTowerRun("c1", "g23")).rejects.toThrow(TOWER_SHUT);
      await expect(startTowerRun("c1", "g45")).rejects.toThrow(TOWER_SHUT);
    });

    it("judges the floors by the science band when it differs from the logic band (PC-G18)", async () => {
      // Grade 4 in logic (own floor g45), grade 2 in science (science band g23).
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ logic: "4", science: "2" }) as never);
      await client.query("DELETE FROM deed_run");
      // Three stars at the science band open every floor up to the hero's own, though none was earned at g45.
      await sideQuest({ band: "g23" });
      for (const band of ["k1", "g23", "g45"]) expect((await startTowerRun("c1", band)).kind, band).toBe("tower");
      await expect(startTowerRun("c1", "g68")).rejects.toThrow(TOWER_SHUT);
      // Science far above logic: stars at the science band open up to the hero's own floor, and nothing above it.
      await client.query("DELETE FROM deed_run");
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ logic: "2", science: "6" }) as never);
      await sideQuest({ band: "g68" });
      for (const band of ["k1", "g23"]) expect((await startTowerRun("c1", band)).kind, band).toBe("tower");
      for (const band of ["g45", "g68"]) await expect(startTowerRun("c1", band), band).rejects.toThrow(TOWER_SHUT);
      // Stars at a band that is neither the science band nor at or below the hero's own open nothing.
      await client.query("DELETE FROM deed_run");
      await sideQuest({ band: "g45" });
      for (const band of ["k1", "g23"]) await expect(startTowerRun("c1", band), band).rejects.toThrow(TOWER_SHUT);
    });

    it("refuses the hero's own floor with no stars at all", async () => {
      await client.query("DELETE FROM deed_run");
      await expect(startTowerRun("c1", "g45")).rejects.toThrow(TOWER_SHUT);
      expect(await runs()).toBe(0);
    });

    it("refuses a band that is not one, before anything is read: junk never reaches the query", async () => {
      for (const junk of ["g7", "toString", "__proto__", "constructor", "", "K1", "tower:g23", null, 42, undefined]) {
        await expect(startTowerRun("c1", junk as never), String(junk)).rejects.toThrow(NOT_IN_CHRONICLE);
      }
      expect(await count("SELECT count(*) AS n FROM deed_run WHERE kind = 'tower'")).toBe(0);
    });

    it("starts a floor's run: one logic lock, the floor's skill, no second chances, no demo, named by the floor", async () => {
      const start = await startTowerRun("c1", "g23");
      expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
      expect(start.kind).toBe("tower");
      expect(start.deed).toEqual({ id: "tower:g23", title: "The Puzzle Tower", story: TOWER_STORY, area: "logic" });
      expect(start.questions).toHaveLength(1);
      expect(start.questions[0].kind).toBe("lock");
      expect(await skillsOf(start.runId)).toEqual(["logic-g23"]);
      expect(start).not.toHaveProperty("demo");
      const row = (await client.query("SELECT deed_id, source_ref, kind, band, skill_ids, second_chances FROM deed_run WHERE id = ?1", [start.runId])).rows[0];
      expect(row).toMatchObject({ deed_id: null, source_ref: "tower:g23", kind: "tower", band: "g23", skill_ids: '["logic-g23"]', second_chances: 0 });
    });

    it("gives a young hero no demo (R-F10 is for chests and practice)", async () => {
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ logic: "2", science: "2" }) as never);
      await client.query("DELETE FROM deed_run");
      await sideQuest({ band: "g23" });
      expect(await startTowerRun("c1", "g23")).not.toHaveProperty("demo");
    });

    it("resumes the open run for a floor, never stacks a second, and keeps floors apart", async () => {
      const first = await startTowerRun("c1", "g23");
      const again = await startTowerRun("c1", "g23");
      expect(again.runId).toBe(first.runId);
      const other = await startTowerRun("c1", "k1");
      expect(other.runId).not.toBe(first.runId);
      expect(await count("SELECT count(*) AS n FROM deed_run WHERE kind = 'tower'")).toBe(2);
    });

    it("never sends the solution or its fits, fresh or resumed (RG-g, Review Focus 4)", async () => {
      for (const band of ["k1", "g23", "g45"]) {
        const fresh = await startTowerRun("c1", band);
        const resumed = await startTowerRun("c1", band);
        expect(resumed.runId).toBe(fresh.runId);
        for (const s of [fresh, resumed]) expect(JSON.stringify(s), band).not.toMatch(/"solution"|"fits"/);
      }
    });

    it("draws a lock one level harder than the hero's mastery of the floor's skill, capped at the top", async () => {
      const profile = profileFromRow(null);
      const enabledKinds = enabledHandsOnKinds(DEFAULT_REALM_SETTINGS);
      const now = vi.spyOn(Date, "now").mockReturnValue(4242);
      try {
        for (const mastery of [0, 2, 4]) {
          await client.query("DELETE FROM deed_run WHERE kind = 'tower'");
          await client.query("DELETE FROM skill_mastery");
          if (mastery > 0) {
            await client.query(
              "INSERT INTO skill_mastery (id, child_id, skill_id, level, created_at, updated_at) VALUES ('m1', 'c1', 'logic-g23', ?1, ?2, ?2)", [mastery, LAST_WEEK],
            );
          }
          const start = await startTowerRun("c1", "g23");
          const expected = lockRun({ skill: findSkill("logic-g23")!, level: lockLevel(mastery, 1), count: 1, seed: 4242, enabledKinds, profile });
          expect(start.questions[0].id, `mastery ${mastery}`).toBe(expected.questions[0].id);
        }
      } finally {
        now.mockRestore();
      }
    });

    it("refuses a grown-up, writing nothing", async () => {
      vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
      await expect(startTowerRun("c1", "g23")).rejects.toThrow(WORLD_HERO_ONLY);
      expect(await count("SELECT count(*) AS n FROM deed_run WHERE kind = 'tower'")).toBe(0);
      expect(await stateRows()).toBe(0);
    });

    it("refuses a hero the caller may not act for, and writes nothing", async () => {
      vi.mocked(requireChildAccess).mockRejectedValueOnce(new Error("Not your hero."));
      await expect(startTowerRun("c2", "g23")).rejects.toThrow("Not your hero.");
      expect(await count("SELECT count(*) AS n FROM deed_run WHERE kind = 'tower'")).toBe(0);
    });

    it("is refused while the Realm is closed", async () => {
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ logic: "4", science: "4" }, false) as never);
      await expect(startTowerRun("c1", "g23")).rejects.toThrow("The Realm is closed");
    });

    it("refuses while locks are off, even with a run open, and keeps every tower record (R-G7, PC-G6)", async () => {
      const open = await startTowerRun("c1", "g23");
      await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('t1', 'c1', 'tower:g23', '3', ?1)", [LAST_WEEK]);
      const snapshot = async () => [
        (await client.query("SELECT * FROM realm_world_state ORDER BY id")).rows,
        (await client.query("SELECT id, completed_at FROM deed_run ORDER BY id")).rows,
      ];
      const was = await snapshot();
      vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
      for (const band of ["k1", "g23", "g45"]) await expect(startTowerRun("c1", band), band).rejects.toThrow(WORLD_LOCKS_OFF);
      expect(await snapshot()).toEqual(was);
      expect(await solvedAt("g23")).toBe("3");
      expect(open.runId).toBeTruthy();
    });

    it("answers a shut floor with the locks off as the locks being off, never the floor's own refusal", async () => {
      vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
      await expect(startTowerRun("c1", "g68")).rejects.toThrow(WORLD_LOCKS_OFF);
    });
  });

  describe("finishing a floor's run", () => {
    beforeEach(async () => {
      await sideQuest({ band: "g45" });
    });

    it("a right answer counts one solved, and the next counts two", async () => {
      expect((await completeDeedRun(await climbed("g23"))).tower).toEqual({ band: "g23", solved: 1, solvedNow: true });
      expect(await solvedAt("g23")).toBe("1");
      expect((await completeDeedRun(await climbed("g23"))).tower).toEqual({ band: "g23", solved: 2, solvedNow: true });
      expect(await solvedAt("g23")).toBe("2");
    });

    it("keeps each floor's count apart, under its own ref, and writes nothing else", async () => {
      await completeDeedRun(await climbed("g23"));
      await completeDeedRun(await climbed("k1"));
      await completeDeedRun(await climbed("k1"));
      expect(await worldState()).toEqual({ "tower:g23": "1", "tower:k1": "2" });
    });

    it("a miss leaves the count where it was, and writes no row for a floor never solved", async () => {
      const start = await startTowerRun("c1", "g23");
      await answerDeedQuestion(start.runId, 0, wrong((await storedTasks(start.runId))[0]));
      expect((await completeDeedRun(start.runId)).tower).toEqual({ band: "g23", solved: 0, solvedNow: false });
      expect(await stateRows()).toBe(0);
      await completeDeedRun(await climbed("g23"));
      const again = await startTowerRun("c1", "g23");
      await answerDeedQuestion(again.runId, 0, wrong((await storedTasks(again.runId))[0]));
      expect((await completeDeedRun(again.runId)).tower).toEqual({ band: "g23", solved: 1, solvedNow: false });
      expect(await solvedAt("g23")).toBe("1");
    });

    it("a floor's run has no second chance: a wrong answer is a miss at once", async () => {
      const start = await startTowerRun("c1", "g23");
      const result = await answerDeedQuestion(start.runId, 0, wrong((await storedTasks(start.runId))[0]));
      expect(result).toMatchObject({ correct: false, secondChance: false });
    });

    it("pays and moves nothing else: no mastery, no stars, no minutes, no material, no place (R-G4b)", async () => {
      vi.mocked(paySideQuest).mockClear();
      const id = await climbed("g23");
      const summary = await completeDeedRun(id);
      expect(summary).toMatchObject({ kind: "tower", stars: 0, minutesEarned: 0, counted: false, building: null, masteryChanges: [] });
      expect(summary).not.toHaveProperty("world");
      expect(paySideQuest).not.toHaveBeenCalled();
      expect(await count("SELECT count(*) AS n FROM skill_mastery")).toBe(0);
      expect(Number((await client.query("SELECT stars FROM deed_run WHERE id = ?1", [id])).rows[0].stars)).toBe(0);
      expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
      expect(await count("SELECT count(*) AS n FROM realm_material")).toBe(0);
      expect(await count("SELECT count(*) AS n FROM realm_place_found")).toBe(0);
      expect(await rewardRows()).toBe(0);
    });

    it("leaves the hero's side quest stars as they were: its own run is never touched", async () => {
      await completeDeedRun(await climbed("g23"));
      expect(await bands()).toEqual(["g45"]);
    });

    it("finished twice, it counts once: FINISHED the second time", async () => {
      const id = await climbed("g23");
      await completeDeedRun(id);
      await expect(completeDeedRun(id)).rejects.toThrow(FINISHED);
      await expect(Promise.all([completeDeedRun(id), completeDeedRun(id)])).rejects.toThrow(FINISHED);
      expect(await solvedAt("g23")).toBe("1");
    });

    it("two runs finished at once both count: the lock serialises the bump, so neither is lost", async () => {
      const first = await climbed("g23");
      await client.query("UPDATE deed_run SET started_at = started_at - 7200 WHERE id = ?1", [first]);
      const second = await climbed("g23");
      expect(second).not.toBe(first);
      const both = await Promise.all([completeDeedRun(first), completeDeedRun(second)]);
      expect(both.map((s) => s.tower?.solved).sort()).toEqual([1, 2]);
      expect(await solvedAt("g23")).toBe("2");
    });

    it("a grown-up can't finish the hero's floor, and nothing is written (PC-G7)", async () => {
      const id = await climbed("g23");
      vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
      await expect(completeDeedRun(id)).rejects.toThrow(WORLD_HERO_ONLY);
      expect((await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [id])).rows[0].completed_at).toBeNull();
      expect(await stateRows()).toBe(0);
      expect((await completeDeedRun(id)).tower?.solved).toBe(1);
    });

    it("if recording the solve throws after writing, the run stays open and the count rolls back (RG-n)", async () => {
      const id = await climbed("g23");
      const actual = await vi.importActual<typeof import("@/lib/services/realm-world-state")>("@/lib/services/realm-world-state");
      vi.mocked(recordTowerSolve).mockImplementationOnce(async (...args) => {
        await actual.recordTowerSolve(...args);
        throw new Error("the disk is full");
      });
      await expect(completeDeedRun(id)).rejects.toThrow("the disk is full");
      expect((await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [id])).rows[0].completed_at).toBeNull();
      expect(await stateRows()).toBe(0);
      expect((await completeDeedRun(id)).tower).toEqual({ band: "g23", solved: 1, solvedNow: true });
      expect(await solvedAt("g23")).toBe("1");
    });

    it("a locked-off hero can still finish a run they had open, and the record keeps", async () => {
      const id = await climbed("g23");
      vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF);
      expect((await completeDeedRun(id)).tower?.solved).toBe(1);
    });

    it("does not read a chest or a door's run as a tower run, nor a tower run as a chest's", async () => {
      const chest = await open("chest:west-lane");
      expect(chest).not.toHaveProperty("tower");
      expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed" });
    });
  });
});
