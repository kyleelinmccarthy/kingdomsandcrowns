// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { runeRight as right, runeWrong as wrong } from "@/test/rune-answers";
import { lockRight } from "@/test/lock-answers";
import { runeStub } from "@/test/rune-stubs";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { FINISHED, NOT_IN_CHRONICLE, RUNE_HERO_ONLY, RUNES_OFF } from "@/lib/utils/deed-refusals";
import { HELD, asRun } from "@/test/object-start";
import { RUNE_STORY, RUNE_TITLE } from "@/lib/tasks/rune-copy";
import { RUNE_OBJECTS, VILLAGE_RUNE_OBJECTS } from "@/lib/realm/rune-objects";
import type { SkillArea } from "@/lib/utils/skills";
import type { ClientTask, RuneTask, Task } from "@/lib/tasks/types";
import type { Grade } from "@/lib/utils/grade-levels";
import type { RunStart } from "@/lib/utils/deed-run-types";
import {
  DEED_RUN_DDL, REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_MATERIAL_DDL, REALM_PLACE_FOUND_DDL, REALM_SETTINGS_DDL, REALM_WORLD_STATE_DDL,
  SKILL_MASTERY_DDL,
} from "@/test/realm-db-ddl";

/**
 * Fixing a rune object any time against a REAL libsql database (R-I1, R-I3, R-I13, PC-G2, RG-c,
 * RG-n): a `world` run of one rune, named by the object, started by the hero alone; finished, the
 * run's close and the object's "fixed" land in one locked transaction, once. It pays nothing.
 */
const client = testDatabase("world-runes-db");
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
  return { ...actual, fixRuneObjects: vi.fn(actual.fixRuneObjects) };
});
/** Every strand spelled out: the rune must draw from language, which sits far from the others. */
const HERO = (over: Partial<Record<SkillArea, Grade>> = {}, enabled = true) => ({
  enabled, tone: "gentle" as const, band: "g68" as const,
  grades: { math: "3", reading: "3", language: "8", science: "3", logic: "3", ...over } as Record<SkillArea, Grade>,
});
vi.mock("@/lib/services/deeds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/deeds")>("@/lib/services/deeds");
  return { ...actual, loadHeroLevels: vi.fn(async () => HERO()) };
});

const runeObjects = await import("./rune-objects");
// The starts as runs; the held answer itself is asked of the action (`runeObjects.startRuneObjectRun`).
const startRuneObjectRun = asRun(runeObjects.startRuneObjectRun);
const startWorldLockRun = asRun((await import("./world-locks")).startWorldLockRun);
const { answerDeedQuestion, completeDeedRun, resolveDeedQuestion, retryDeedQuestion } = await import("./deeds");
const realmWorldState = await import("@/lib/services/realm-world-state");
const { fixRuneObjects, worldClock } = realmWorldState;
const actualFix = (await vi.importActual<typeof import("@/lib/services/realm-world-state")>("@/lib/services/realm-world-state")).fixRuneObjects;
const { requireChildAccess } = await import("@/lib/auth/access");
const { loadHeroLevels } = await import("@/lib/services/deeds");
const { loadRealmSettings, paySideQuest } = await import("@/lib/services/realm-play");
const { realmNow } = await import("@/lib/services/realm-clock");

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
const RUNES_OFF_SETTINGS = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: true, trail: true, rune: false } };
const LOCKS_OFF_SETTINGS = { ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: false, trail: true, rune: true } };
const WAGON = "rune:west-wagon";
const LANTERN = "rune:lane-lantern";

const count = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
const runs = () => count("SELECT count(*) AS n FROM deed_run");
const stateRows = () => count("SELECT count(*) AS n FROM realm_world_state");
async function worldState(): Promise<Record<string, string>> {
  const rows = (await client.query("SELECT object_id, state FROM realm_world_state ORDER BY object_id")).rows;
  return Object.fromEntries(rows.map((r) => [r.object_id as string, r.state as string]));
}
async function storedTasks(runId: string): Promise<Task[]> {
  return JSON.parse((await client.query("SELECT questions FROM deed_run WHERE id = ?1", [runId])).rows[0].questions as string) as Task[];
}
const storedRune = async (runId: string) => (await storedTasks(runId))[0] as RuneTask;
const completedAt = async (runId: string) => (await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [runId])).rows[0].completed_at;
const fixedAt = (objectId: string, at: Date) => client.query("UPDATE realm_world_state SET updated_at = ?1 WHERE object_id = ?2", [at, objectId]);
const insertFixed = (objectId: string, at: Date) =>
  client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES (?1, 'c1', ?2, 'fixed', ?3)", [`w-${objectId}`, objectId, at]);
/** Starts a rune and casts it right first time, ready to finish. */
async function cast(objectId: string): Promise<string> {
  const start = await startRuneObjectRun("c1", objectId);
  await answerDeedQuestion(start.runId, 0, right(await storedRune(start.runId)));
  return start.runId;
}
/** Fixes the object as the hero would: a right cast, then Done. */
async function fix(objectId: string) {
  return completeDeedRun(await cast(objectId));
}
/** Two right runs for one object: the first left past the resume window, so the second start writes a new one. */
async function twoRightRuns(objectId: string): Promise<[string, string]> {
  const first = await cast(objectId);
  await client.query("UPDATE deed_run SET started_at = started_at - 7200 WHERE id = ?1", [first]);
  const second = await cast(objectId);
  expect(second).not.toBe(first);
  return [first, second];
}
const viewOf = (q: ClientTask) => (q as Extract<ClientTask, { kind: "rune" }>).view;

/**
 * What a start must never carry before the cast resolves (R-I17): an accepted word (as a plain
 * substring of the lower-cased JSON, the strictest reading), the entry, the hint or the why. A
 * dictation (k1, g23) says its word in `readAloud` by design (R-I18), and its effect id may be its
 * word, so for one of those both are taken out before the scan, and nothing else.
 */
function leaks(start: RunStart, task: RuneTask): string[] {
  const shown = start.questions.map((q) => {
    if (!task.listen) return q;
    const { readAloud: _spoken, ...rest } = q as ClientTask & { readAloud?: string };
    void _spoken;
    return { ...rest, view: { ...(rest as Extract<ClientTask, { kind: "rune" }>).view, effect: "" } };
  });
  const json = JSON.stringify({ ...start, questions: shown }).toLowerCase();
  const secrets = [...task.words, task.entry, task.hint, ...(task.explain ? [task.explain] : [])];
  return secrets.filter((s) => json.includes(s.toLowerCase()));
}

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
  vi.mocked(fixRuneObjects).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  client.close();
});

describe("startRuneObjectRun", () => {
  it("a broken object starts a world run of one rune at the hero's language skill", async () => {
    const start = await startRuneObjectRun("c1", WAGON);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(start.kind).toBe("world");
    expect(start.deed).toEqual({ id: WAGON, title: RUNE_TITLE, story: RUNE_STORY, area: "language" });
    expect(start.questions).toHaveLength(1);
    expect(start.questions[0].kind).toBe("rune");
    expect(viewOf(start.questions[0])).toMatchObject({ effect: "mend", object: { id: WAGON, label: "the broken wagon" }, listen: false });
    const task = await storedRune(start.runId);
    expect(task).toMatchObject({ kind: "rune", skillId: "vocab-g68", effect: "mend", object: { id: WAGON, label: "the broken wagon" } });
    const row = (await client.query("SELECT deed_id, source_ref, kind, band, skill_ids, second_chances FROM deed_run WHERE id = ?1", [start.runId])).rows[0];
    expect(row).toMatchObject({ deed_id: null, source_ref: WAGON, kind: "world", band: "g68", skill_ids: '["vocab-g68"]', second_chances: 1 });
    expect(leaks(start, task)).toEqual([]);
    expect(JSON.stringify(start)).not.toMatch(/"words"|"entry"|"hint"|"explain"/);
  });

  it("draws each object's own effect, and binds the task to it", async () => {
    for (const object of RUNE_OBJECTS) {
      const start = await startRuneObjectRun("c1", object.id);
      expect(viewOf(start.questions[0]), object.id).toMatchObject({ effect: object.effect, object: { id: object.id, label: object.label } });
      expect(start.deed.id).toBe(object.id);
    }
    expect(await runs()).toBe(RUNE_OBJECTS.length);
  });

  it("never sends a word, its entry, its hint or its why, fresh or resumed, at any grade (R-I17)", async () => {
    let tick = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => (tick += 7_919));
    for (const language of ["K", "3", "5", "7", "10"] as const) {
      await client.query("DELETE FROM deed_run");
      vi.mocked(loadHeroLevels).mockResolvedValue(HERO({ language }) as never);
      for (const object of VILLAGE_RUNE_OBJECTS) {
        const fresh = await startRuneObjectRun("c1", object.id);
        const resumed = await startRuneObjectRun("c1", object.id);
        expect(resumed.runId).toBe(fresh.runId);
        const task = await storedRune(fresh.runId);
        expect(task.listen, `grade ${language}`).toBe(language === "K" || language === "3");
        for (const s of [fresh, resumed]) expect(leaks(s, task), `grade ${language} ${object.id} ${task.entry}`).toEqual([]);
      }
    }
  });

  it("an open second chance hands back the hint, never the word, fresh or resumed", async () => {
    const start = await startRuneObjectRun("c1", LANTERN);
    const task = await storedRune(start.runId);
    const result = await answerDeedQuestion(start.runId, 0, wrong(task));
    expect(result).toMatchObject({ correct: false, secondChance: true });
    expect(result).not.toHaveProperty("answer");
    expect(result).not.toHaveProperty("reveal");
    const json = JSON.stringify(result).toLowerCase();
    for (const w of task.words) expect(json).not.toContain(w);
    const resumed = await startRuneObjectRun("c1", LANTERN);
    expect(resumed.runId).toBe(start.runId);
    expect(JSON.stringify(resumed).toLowerCase()).not.toMatch(new RegExp(task.words.join("|")));
    // Resolved, the miss shows the word: the rule is "before resolution".
    const again = await retryDeedQuestion(start.runId, 0, wrong(task) === "r:0" ? "r:1" : "r:0");
    expect(again.correct).toBe(false);
    expect(again.secondChance).toBe(false);
    expect(again.answer).toContain(task.words[0]);
  });

  it("the same object resumes; another object starts its own", async () => {
    const a = await startRuneObjectRun("c1", WAGON);
    const again = await startRuneObjectRun("c1", WAGON);
    expect(again.runId).toBe(a.runId);
    expect(again.questions).toEqual(a.questions);
    const b = await startRuneObjectRun("c1", LANTERN);
    expect(b.runId).not.toBe(a.runId);
    expect(viewOf(b.questions[0]).effect).toBe("light");
    expect(await runs()).toBe(2);
  });

  it("refuses a grown-up, writing nothing", async () => {
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    await expect(startRuneObjectRun("c1", WAGON)).rejects.toThrow(RUNE_HERO_ONLY);
    expect(await runs()).toBe(0);
  });

  it("refuses a hero the caller may not act for (outside the family), and writes nothing", async () => {
    vi.mocked(requireChildAccess).mockRejectedValueOnce(new Error("Not your hero."));
    await expect(startRuneObjectRun("c2", WAGON)).rejects.toThrow("Not your hero.");
    expect(await runs()).toBe(0);
  });

  it("refuses an id that is not a rune object, before anything is read", async () => {
    for (const junk of ["rune:nope", "chest:west-lane", "door:ringstones", "practice", "tower:g45", "__proto__", "toString", "", null, 42, {}]) {
      await expect(startRuneObjectRun("c1", junk as never)).rejects.toThrow(NOT_IN_CHRONICLE);
    }
    expect(requireChildAccess).not.toHaveBeenCalled();
    expect(await runs()).toBe(0);
  });

  it("refuses while runes are off, even with a run open, and keeps every fixed record (R-I13)", async () => {
    const before = await startRuneObjectRun("c1", WAGON);
    await insertFixed(LANTERN, new Date("2026-11-09T18:00:00Z"));
    const snapshot = async () => [
      (await client.query("SELECT * FROM realm_world_state ORDER BY id")).rows,
      (await client.query("SELECT id, completed_at FROM deed_run ORDER BY id")).rows,
    ];
    const was = await snapshot();
    vi.mocked(loadRealmSettings).mockResolvedValue(RUNES_OFF_SETTINGS);
    await expect(startRuneObjectRun("c1", WAGON)).rejects.toThrow(RUNES_OFF);
    await expect(startRuneObjectRun("c1", LANTERN)).rejects.toThrow(RUNES_OFF);
    await expect(startRuneObjectRun("c1", "rune:old-tree")).rejects.toThrow(RUNES_OFF);
    expect(await snapshot()).toEqual(was);
    expect(before.runId).toBeTruthy();
    // The locks have their own switch: a chest still starts with runes off.
    expect((await startWorldLockRun("c1", "chest:west-lane")).questions[0].kind).toBe("lock");
  });

  it("starts with the locks off: the runes have their own switch", async () => {
    vi.mocked(loadRealmSettings).mockResolvedValue(LOCKS_OFF_SETTINGS);
    expect((await startRuneObjectRun("c1", WAGON)).questions[0].kind).toBe("rune");
  });

  it("refuses an object whose rune still holds, writing nothing", async () => {
    await insertFixed(WAGON, new Date("2026-11-09T18:00:00Z"));
    await expect(runeObjects.startRuneObjectRun("c1", WAGON)).resolves.toEqual(HELD);
    expect(await runs()).toBe(0);
    // Another object is its own.
    expect((await startRuneObjectRun("c1", LANTERN)).deed.id).toBe(LANTERN);
  });

  it("is refused while the Realm is closed", async () => {
    vi.mocked(loadHeroLevels).mockResolvedValue(HERO({}, false) as never);
    await expect(startRuneObjectRun("c1", WAGON)).rejects.toThrow("The Realm is closed");
    expect(await runs()).toBe(0);
  });

  it("the object breaks again on its fourth local day", async () => {
    await fix(WAGON);
    await client.query("DELETE FROM deed_run");
    // Fixed at 11:00 on the 9th in Denver.
    await fixedAt(WAGON, new Date("2026-11-09T18:00:00Z"));
    for (const date of ["2026-11-09", "2026-11-10", "2026-11-12"]) {
      vi.mocked(realmNow).mockResolvedValue({ date, timeOfDay: "10:00" });
      await expect(runeObjects.startRuneObjectRun("c1", WAGON), date).resolves.toEqual(HELD);
    }
    vi.mocked(realmNow).mockResolvedValue({ date: "2026-11-13", timeOfDay: "10:00" });
    expect((await startRuneObjectRun("c1", WAGON)).deed.id).toBe(WAGON);
  });

  it("judges the day in the family's zone: fixed 23:30 in Denver (06:30 UTC the next day) breaks on the 13th, not the 14th", async () => {
    await insertFixed(WAGON, new Date("2026-11-10T06:30:00Z"));
    vi.mocked(realmNow).mockResolvedValue({ date: "2026-11-12", timeOfDay: "10:00" });
    await expect(runeObjects.startRuneObjectRun("c1", WAGON)).resolves.toEqual(HELD);
    vi.mocked(realmNow).mockResolvedValue({ date: "2026-11-13", timeOfDay: "10:00" });
    expect((await startRuneObjectRun("c1", WAGON)).kind).toBe("world");
  });
});

describe("finishing a rune object's run", () => {
  it("a right cast fixes it in the same transaction, and pays nothing", async () => {
    vi.mocked(paySideQuest).mockClear();
    const id = await cast(WAGON);
    const before = Math.floor(Date.now() / 1000);
    const summary = await completeDeedRun(id);
    const after = Math.ceil(Date.now() / 1000);
    expect(summary.runes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(summary).not.toHaveProperty("world");
    expect(summary).not.toHaveProperty("tower");
    expect(summary).toMatchObject({ kind: "world", stars: 0, minutesEarned: 0, counted: false, building: null });
    expect(await worldState()).toEqual({ [WAGON]: "fixed" });
    // Written in the column's timestamp mode: epoch seconds of the finish, never milliseconds.
    const raw = Number((await client.query("SELECT updated_at FROM realm_world_state WHERE object_id = ?1", [WAGON])).rows[0].updated_at);
    expect(raw).toBeGreaterThanOrEqual(before);
    expect(raw).toBeLessThanOrEqual(after);
    expect(await completedAt(id)).not.toBeNull();
    expect(paySideQuest).not.toHaveBeenCalled();
    expect(Number((await client.query("SELECT stars FROM deed_run WHERE id = ?1", [id])).rows[0].stars)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_place_found")).toBe(0);
    // The cast moved the hero's mastery of the skill it was drawn at (RUN_EFFECTS.world).
    const mastery = (await client.query("SELECT skill_id, attempt_total, correct_total FROM skill_mastery WHERE child_id = 'c1'")).rows;
    expect(mastery).toEqual([expect.objectContaining({ skill_id: "vocab-g68", attempt_total: 1, correct_total: 1 })]);
    // And now it holds.
    await expect(runeObjects.startRuneObjectRun("c1", WAGON)).resolves.toEqual(HELD);
  });

  it("a second-try right cast fixes it too", async () => {
    const start = await startRuneObjectRun("c1", WAGON);
    const task = await storedRune(start.runId);
    expect(await answerDeedQuestion(start.runId, 0, wrong(task))).toMatchObject({ correct: false, secondChance: true });
    expect(await retryDeedQuestion(start.runId, 0, right(task))).toMatchObject({ correct: true });
    expect((await completeDeedRun(start.runId)).runes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(await worldState()).toEqual({ [WAGON]: "fixed" });
  });

  it("a miss leaves it broken, and a fresh start draws a fresh word", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 17));
    const start = await startRuneObjectRun("c1", WAGON);
    const task = await storedRune(start.runId);
    await answerDeedQuestion(start.runId, 0, wrong(task));
    await resolveDeedQuestion(start.runId, 0);
    expect((await completeDeedRun(start.runId)).runes).toEqual([{ objectId: WAGON, fixed: false, reason: "missed" }]);
    expect(await stateRows()).toBe(0);
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 17, 5));
    const next = await startRuneObjectRun("c1", WAGON);
    expect(next.runId).not.toBe(start.runId);
    const fresh = await storedRune(next.runId);
    expect(fresh.id).not.toBe(task.id);
    expect(fresh.entry).not.toBe(task.entry);
    expect(fresh.effect).toBe("mend");
  });

  describe("a second finish writes nothing twice (RG-c)", () => {
    it("one run finished twice at once: one finish, one FINISHED, one row", async () => {
      const id = await cast(WAGON);
      const settled = await Promise.allSettled([completeDeedRun(id), completeDeedRun(id)]);
      expect(settled.map((s) => s.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect((settled.find((s) => s.status === "rejected") as PromiseRejectedResult).reason.message).toBe(FINISHED);
      expect(await stateRows()).toBe(1);
      expect(await worldState()).toEqual({ [WAGON]: "fixed" });
    });

    it("one run finished twice, one after the other: FINISHED, and the row is not written again", async () => {
      const id = await cast(WAGON);
      await completeDeedRun(id);
      await fixedAt(WAGON, new Date("2026-11-09T18:00:00Z"));
      await expect(completeDeedRun(id)).rejects.toThrow(FINISHED);
      expect(Number((await client.query("SELECT updated_at FROM realm_world_state WHERE object_id = ?1", [WAGON])).rows[0].updated_at))
        .toBe(Date.UTC(2026, 10, 9, 18) / 1000);
    });

    it("two right runs for one object, finished at once: one fixes it, the other finds it already fixed", async () => {
      const [a, b] = await twoRightRuns(WAGON);
      const both = await Promise.all([completeDeedRun(a), completeDeedRun(b)]);
      expect(both.map((s) => s.runes?.[0].fixed).sort()).toEqual([false, true]);
      expect(both.find((s) => !s.runes?.[0].fixed)?.runes).toEqual([{ objectId: WAGON, fixed: false, reason: "already-fixed" }]);
      expect(await stateRows()).toBe(1);
    });
  });

  it("a throw while fixing rolls the close back, and the run finishes on a retry (RG-n)", async () => {
    const id = await cast(WAGON);
    // It throws after its write, so the write is rolled back with the close.
    vi.mocked(fixRuneObjects).mockImplementationOnce(async (...args) => {
      await actualFix(...args);
      throw new Error("the disk is full");
    });
    await expect(completeDeedRun(id)).rejects.toThrow("the disk is full");
    expect(await completedAt(id)).toBeNull();
    expect(await stateRows()).toBe(0);
    const retried = await completeDeedRun(id);
    expect(retried.runes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(await worldState()).toEqual({ [WAGON]: "fixed" });
  });

  it("fixes inside the one locked finish, with the object, the cast's outcome, the finish's time and the server's clock", async () => {
    const id = await cast(WAGON);
    await completeDeedRun(id);
    expect(fixRuneObjects).toHaveBeenCalledTimes(1);
    const [, childId, fixes, now, clock, renew] = vi.mocked(fixRuneObjects).mock.calls[0];
    expect(childId).toBe("c1");
    expect(fixes).toEqual([{ objectId: WAGON, outcome: "first" }]);
    expect(now).toBeInstanceOf(Date);
    expect(clock).toEqual(await worldClock("c1"));
    expect(renew).toBe(false);
  });

  it("only the hero finishes it: a grown-up is refused and nothing is written", async () => {
    const id = await cast(WAGON);
    vi.mocked(requireChildAccess).mockResolvedValueOnce(GROWN_UP);
    await expect(completeDeedRun(id)).rejects.toThrow(RUNE_HERO_ONLY);
    expect(await completedAt(id)).toBeNull();
    expect(await stateRows()).toBe(0);
    expect((await completeDeedRun(id)).runes?.[0].fixed).toBe(true);
  });

  it("runes off after the start: the run still finishes and fixes (R-I13)", async () => {
    const id = await cast(WAGON);
    vi.mocked(loadRealmSettings).mockResolvedValue(RUNES_OFF_SETTINGS);
    expect((await completeDeedRun(id)).runes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(await worldState()).toEqual({ [WAGON]: "fixed" });
  });

  it("a stored rune world run whose object has left the catalog grades, finishes and fixes nothing (RI-a / N3)", async () => {
    const task = runeStub({ object: { id: "rune:gone", label: "the broken gone" } });
    const at = new Date();
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, source_ref, skill_ids, band, questions, responses, started_at, created_at, updated_at, kind, second_chances)
       VALUES ('gone', 'c1', NULL, 'rune:gone', '["lang-gk"]', 'k1', ?1, '[null]', ?2, ?2, ?2, 'world', 1)`,
      [JSON.stringify([task]), at],
    );
    expect(await answerDeedQuestion("gone", 0, right(task))).toMatchObject({ correct: true });
    const summary = await completeDeedRun("gone");
    expect(summary).not.toHaveProperty("runes");
    expect(summary).not.toHaveProperty("world");
    expect(summary).toMatchObject({ kind: "world", correctCount: 1, stars: 0, minutesEarned: 0 });
    expect(await completedAt("gone")).not.toBeNull();
    expect(await stateRows()).toBe(0);
    expect(fixRuneObjects).not.toHaveBeenCalled();
  });

  it("a chest's run takes no rune path, and a rune's run opens nothing", async () => {
    const start = await startWorldLockRun("c1", "chest:west-lane");
    await answerDeedQuestion(start.runId, 0, lockRight((await storedTasks(start.runId))[0]));
    const chest = await completeDeedRun(start.runId);
    expect(chest.world).toMatchObject({ objectId: "chest:west-lane", opened: true });
    expect(chest).not.toHaveProperty("runes");
    expect(fixRuneObjects).not.toHaveBeenCalled();
    const rune = await fix(WAGON);
    expect(rune).not.toHaveProperty("world");
    expect(await worldState()).toEqual({ "chest:west-lane": "open", "decor:stone-bench": "placed", [WAGON]: "fixed" });
  });
});

describe("fixRuneObjects", () => {
  const CLOCK = { today: "2026-11-09", zone: "America/Denver" };
  const NOW = new Date("2026-11-09T18:00:00Z");
  /** Runs it in a transaction on the test database, counting the reads it makes. */
  async function run(fixes: Parameters<typeof actualFix>[2], renew = false, now = NOW, clock = CLOCK) {
    let selects = 0;
    const outcomes = await testDb.transaction(async (tx) => {
      const counted = new Proxy(tx, {
        get(target, prop) {
          if (prop === "select") selects += 1;
          const value = Reflect.get(target, prop, target) as unknown;
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      return actualFix(counted, "c1", fixes, now, clock, renew);
    });
    return { outcomes, selects };
  }
  const updatedAt = async (objectId: string) =>
    Number((await client.query("SELECT updated_at FROM realm_world_state WHERE object_id = ?1", [objectId])).rows[0].updated_at);

  it("fixes a broken object on a right cast, first or second try, reading the rows once", async () => {
    const { outcomes, selects } = await run([{ objectId: WAGON, outcome: "first" }, { objectId: LANTERN, outcome: "second" }]);
    expect(outcomes).toEqual([{ objectId: WAGON, fixed: true }, { objectId: LANTERN, fixed: true }]);
    expect(selects).toBe(1);
    expect(await worldState()).toEqual({ [LANTERN]: "fixed", [WAGON]: "fixed" });
    expect(await updatedAt(WAGON)).toBe(NOW.getTime() / 1000);
  });

  it("a miss writes nothing", async () => {
    expect((await run([{ objectId: WAGON, outcome: "miss" }])).outcomes).toEqual([{ objectId: WAGON, fixed: false, reason: "missed" }]);
    expect(await stateRows()).toBe(0);
  });

  it("an object still fixed is already fixed, and its row is not touched", async () => {
    const was = new Date("2026-11-08T18:00:00Z");
    await insertFixed(WAGON, was);
    expect((await run([{ objectId: WAGON, outcome: "first" }])).outcomes).toEqual([{ objectId: WAGON, fixed: false, reason: "already-fixed" }]);
    expect(await updatedAt(WAGON)).toBe(was.getTime() / 1000);
  });

  it("an object broken again is fixed again, its row rewritten", async () => {
    await insertFixed(WAGON, new Date("2026-11-01T18:00:00Z"));
    expect((await run([{ objectId: WAGON, outcome: "first" }])).outcomes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(await updatedAt(WAGON)).toBe(NOW.getTime() / 1000);
    expect(await stateRows()).toBe(1);
  });

  it("renews a fixed object when asked (R-I22): the row is written fixed with now", async () => {
    await insertFixed(WAGON, new Date("2026-11-08T18:00:00Z"));
    expect((await run([{ objectId: WAGON, outcome: "first" }], true)).outcomes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect(await updatedAt(WAGON)).toBe(NOW.getTime() / 1000);
  });

  it("gives an unknown id no outcome, and counts only the first entry for an id", async () => {
    const { outcomes } = await run([
      { objectId: "rune:gone", outcome: "first" }, { objectId: "chest:west-lane", outcome: "first" }, { objectId: "__proto__", outcome: "first" },
      { objectId: WAGON, outcome: "miss" }, { objectId: WAGON, outcome: "first" },
    ]);
    expect(outcomes).toEqual([{ objectId: WAGON, fixed: false, reason: "missed" }]);
    expect(await stateRows()).toBe(0);
  });

  it("writes only this hero's row", async () => {
    await client.query("INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES ('o', 'c2', ?1, 'fixed', ?2)", [WAGON, NOW]);
    expect((await run([{ objectId: WAGON, outcome: "first" }])).outcomes).toEqual([{ objectId: WAGON, fixed: true }]);
    expect((await client.query("SELECT child_id FROM realm_world_state ORDER BY child_id")).rows.map((r) => r.child_id)).toEqual(["c1", "c2"]);
  });
});
