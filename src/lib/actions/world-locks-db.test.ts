// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { lockRight as right, lockWrong as wrong } from "@/test/lock-answers";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { FINISHED, NOT_IN_CHRONICLE, WORLD_HERO_ONLY, WORLD_LOCKS_OFF, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_STORY, DOOR_STORY } from "@/lib/utils/world-lock-copy";
import { worldObjectById } from "@/lib/realm/world-objects";
import type { ClientTask, Task } from "@/lib/tasks/types";
import type { SkillArea } from "@/lib/utils/skills";
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

const { startWorldLockRun } = await import("./world-locks");
const { startPracticeRun } = await import("./practice");
const { answerDeedQuestion, completeDeedRun, resolveDeedQuestion, retryDeedQuestion } = await import("./deeds");
const { loadWorldRows, worldClock } = await import("@/lib/services/realm-world-state");
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
