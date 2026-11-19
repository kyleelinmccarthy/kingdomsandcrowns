// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { BUILD_HERO_ONLY, CLOSED, DELIVERY_HERO_ONLY, PIN_HERO_ONLY, PLAN_NOT_READY, RISE_HERO_ONLY } from "@/lib/utils/deed-refusals";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { kindOf } from "@/lib/tasks/registry";
import type { MeasureTask, Task } from "@/lib/tasks/types";
import {
  KINGDOM_PROGRESS_DDL, REALM_ACCESS_DDL, REALM_IMPROVEMENT_DDL, REALM_LEDGER_DDL, REALM_MATERIAL_DDL, REALM_PLAQUE_DDL, REALM_SETTINGS_DDL,
} from "@/test/realm-db-ddl";

/**
 * Starting a build run against a REAL libsql database: whether a plan is "ready" is judged from the
 * hero's own ledger, built levels and raised buildings, the run is the review run's cousin (no deed,
 * a `sourceRef` that names the plan and level), and a second start picks the open run back up.
 */
const client = testDatabase("improvements-db");
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
    loadHeroLevels: vi.fn(async () => ({
      enabled: true, tone: "gentle", band: "g23",
      grades: { math: "3", reading: "3", language: "3", science: "3" },
    })),
  };
});

const { markBuildingsAnnounced, markDeliverySeen, pinPlan, startBuildRun } = await import("./improvements");
const { answerDeedQuestion, completeDeedRun } = await import("./deeds");
const { requireChildAccess } = await import("@/lib/auth/access");
const { loadHeroLevels } = await import("@/lib/services/deeds");
const { loadRealmSettings } = await import("@/lib/services/realm-play");

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
  ...REALM_SETTINGS_DDL,
  ...REALM_LEDGER_DDL,
  ...REALM_ACCESS_DDL,
  ...REALM_MATERIAL_DDL,
  ...REALM_IMPROVEMENT_DDL,
  ...REALM_PLAQUE_DDL,
];

const TABLES = ["deed_run", "skill_mastery", "kingdom_progress", "realm_settings", "realm_play_ledger", "learning_focus", "realm_material", "realm_improvement", "quest_assignment", "quest", "subject", "season", "child"];

let n = 0;
/** Earned materials in hand. */
async function earn(materialId: string, amount: number): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at)
     VALUES (?1, 'c1', ?2, ?3, 'earned', 'quest', ?4, unixepoch())`,
    [`mat${n}`, materialId, amount, `a${n}`],
  );
}
/** Enough for the first level of the banners (4 dye and 2 thread). */
const stockBanners = async () => {
  await earn("dye", 4);
  await earn("thread", 2);
};
async function built(improvementId: string, level: number): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO realm_improvement (id, child_id, improvement_id, level, stars, built_by_name, sources, built_at) VALUES (?1, 'c1', ?2, ?3, 2, 'Ada', '[]', unixepoch())`,
    [`imp${n}`, improvementId, level],
  );
}
async function raise(buildingId: string): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, created_at, updated_at) VALUES (?1, 'c1', ?2, 5, unixepoch(), unixepoch(), unixepoch())`,
    [`kp${n}`, buildingId],
  );
}
async function count(sql: string): Promise<number> {
  return Number((await client.query(sql)).rows[0].n);
}
const runs = () => count("SELECT count(*) AS n FROM deed_run");
const mechanics = (measure: boolean) => ({ ...DEFAULT_REALM_SETTINGS, mechanics: { measure } });

async function storedTasks(runId: string): Promise<Task[]> {
  const row = await client.query("SELECT questions FROM deed_run WHERE id = ?1", [runId]);
  return JSON.parse(row.rows[0].questions as string) as Task[];
}
const rightResponse = (t: Task): string => {
  const m = t as MeasureTask;
  return TASK_CODECS.measure.encode(m.mode === "cut" ? m.answer! : m.solution!);
};

const wrongResponse = (t: Task): string => TASK_CODECS.measure.encode((t as MeasureTask).mode === "cut" ? "999" : []);

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of TABLES) await client.query(`DELETE FROM ${t}`);
  await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c1', 'f1', 'Ada')");
  vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS });
});

afterAll(async () => {
  client.close();
});

describe("which buildings stand, for the plans board", () => {
  /** A finished side-quest run on `deedId` with `stars`. */
  async function finished(deedId: string, stars: number): Promise<void> {
    n += 1;
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, started_at, completed_at, created_at, updated_at, stars, kind)
       VALUES (?1, 'c1', ?2, '[]', 'g23', '[]', unixepoch(), unixepoch(), unixepoch(), unixepoch(), ?3, 'deed')`,
      [`dr${n}`, deedId, stars],
    );
  }
  async function progress(buildingId: string, deedsDone: number, completed: boolean): Promise<void> {
    n += 1;
    await client.query(
      `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, created_at, updated_at)
       VALUES (?1, 'c1', ?2, ?3, ?4, unixepoch(), unixepoch())`,
      [`kp${n}`, buildingId, deedsDone, completed ? new Date() : null],
    );
  }

  it("agrees with the world's rule: each story once raises it, a raised one stays raised, replays raise nothing", async () => {
    const { loadPlanInput } = await import("@/lib/services/realm-materials");
    const { buildKingdomOverview, loadDeedBest } = await import("@/lib/services/deeds");
    const schema = await import("@/lib/db/schema");
    // The bridge: both its stories done once each, and no completion written yet.
    await finished("bridge-planks", 1);
    await finished("bridge-toll", 2);
    await progress("bridge", 2, false);
    // The well: five runs of one story, which the old count of runs would have called raised.
    for (let i = 0; i < 5; i++) await finished("well-stones", 3);
    await progress("well", 5, false);
    // The mill: raised long ago, with nothing counted since.
    await progress("mill", 0, true);
    // The chapel: two of its three stories, one of them starless.
    await finished("chapel-bell", 1);
    await finished("chapel-scroll", 0);
    await progress("chapel", 2, false);

    const { raised } = await loadPlanInput("c1");
    // The world's overview, from the same rows (`loadKingdomOverview` composes exactly these).
    const rows = await testDb.select().from(schema.kingdomProgress);
    const buildings = buildKingdomOverview(rows, "gentle", await loadDeedBest("c1"));
    expect([...raised].sort()).toEqual(["bridge", "mill"]);
    for (const b of buildings) expect(raised.has(b.id), b.id).toBe(b.complete);
  });
});

describe("startBuildRun", () => {
  it("starts a plan that is ready: three bench tasks, a build run owned by no deed, named by the plan and level", async () => {
    await stockBanners();
    const r = await startBuildRun("c1", "village-banners");
    expect(r.kind).toBe("build");
    expect(r.questions).toHaveLength(3);
    expect(r.questions.map((q) => q.kind)).toEqual(["measure", "measure", "measure"]);
    expect(r.pending).toBeNull();
    expect(r.deed).toMatchObject({ id: "build:village-banners:1", title: "Banners", area: "math" });
    expect(r.deed.story.length).toBeGreaterThan(10);
    expect(r.plan).toEqual({ improvementId: "village-banners", level: 1, placed: 0 });
    expect(r.site).toBeUndefined();
    const row = (await client.query("SELECT deed_id, source_ref, kind, band, second_chances FROM deed_run WHERE id = ?1", [r.runId])).rows[0];
    expect(row).toMatchObject({ deed_id: null, source_ref: "village-banners:1", kind: "build", band: "g23", second_chances: 1 });
  });

  it("draws the hero's two bench skills for their math grade", async () => {
    await stockBanners();
    const r = await startBuildRun("c1", "village-banners");
    const skills = new Set((await storedTasks(r.runId)).map((t) => t.skillId));
    expect([...skills].sort()).toEqual(["area-perimeter", "frac-unit"]);
  });

  it("freezes the second-chance setting on the run, as a review does", async () => {
    await stockBanners();
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, secondChances: false });
    const r = await startBuildRun("c1", "village-banners");
    expect(Number((await client.query("SELECT second_chances FROM deed_run WHERE id = ?1", [r.runId])).rows[0].second_chances)).toBe(0);
  });

  it("a second start picks the same open run back up, with what was laid so far", async () => {
    await stockBanners();
    const first = await startBuildRun("c1", "village-banners");
    const tasks = await storedTasks(first.runId);
    await answerDeedQuestion(first.runId, 0, rightResponse(tasks[0]));
    const again = await startBuildRun("c1", "village-banners");
    expect(again.runId).toBe(first.runId);
    expect(again.plan).toEqual({ improvementId: "village-banners", level: 1, placed: 1 });
    expect(again.deed).toEqual(first.deed);
    expect(again.kind).toBe("build");
    expect(await runs()).toBe(1);
  });

  it("a finished build run is not resumed", async () => {
    // Enough for level 1 and then level 2: finishing the first run builds level 1, so the next start is level 2.
    await stockBanners();
    await earn("dye", 6);
    await earn("thread", 3);
    const first = await startBuildRun("c1", "village-banners");
    const tasks = await storedTasks(first.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(first.runId, i, rightResponse(t));
    await completeDeedRun(first.runId);
    const next = await startBuildRun("c1", "village-banners");
    expect(next.runId).not.toBe(first.runId);
    expect(next.plan).toMatchObject({ level: 2 });
    expect(await runs()).toBe(2);
  });

  it("offers the next level once the one before is built", async () => {
    await built("village-banners", 1);
    await earn("dye", 6);
    await earn("thread", 3);
    const r = await startBuildRun("c1", "village-banners");
    expect(r.plan).toMatchObject({ level: 2 });
    expect(r.deed.id).toBe("build:village-banners:2");
    expect((await client.query("SELECT source_ref FROM deed_run WHERE id = ?1", [r.runId])).rows[0].source_ref).toBe("village-banners:2");
  });

  it("starts a wing once its building is raised, and not before", async () => {
    await earn("thread", 2);
    await earn("stone", 4);
    await expect(startBuildRun("c1", "well-house")).rejects.toThrow(PLAN_NOT_READY);
    await raise("well");
    const r = await startBuildRun("c1", "well-house");
    expect(r.plan).toMatchObject({ improvementId: "well-house", level: 1 });
  });

  it("pays for a shortfall in one material with timber, as planState does", async () => {
    await earn("dye", 2);
    await earn("timber", 4);
    expect((await startBuildRun("c1", "village-banners")).plan).toMatchObject({ level: 1 });
  });

  it("refuses a plan that is not ready, and writes nothing", async () => {
    await earn("dye", 1);
    await expect(startBuildRun("c1", "village-banners")).rejects.toThrow(PLAN_NOT_READY);
    expect(await runs()).toBe(0);
  });

  it("refuses a plan whose three levels all stand", async () => {
    for (const level of [1, 2, 3]) await built("village-banners", level);
    await earn("dye", 40);
    await earn("thread", 40);
    await expect(startBuildRun("c1", "village-banners")).rejects.toThrow(PLAN_NOT_READY);
  });

  it.each([null, undefined, 7, {}, "", "not-a-plan", "village-banners:1", "__proto__", "constructor"])("refuses %j, which is no plan in the catalog", async (id) => {
    await stockBanners();
    await expect(startBuildRun("c1", id as never)).rejects.toThrow(PLAN_NOT_READY);
    expect(await runs()).toBe(0);
  });

  it("refuses a grown-up, and writes nothing", async () => {
    await stockBanners();
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "parent:u1" }, familyId: "f1" } as never);
    await expect(startBuildRun("c1", "village-banners")).rejects.toThrow(BUILD_HERO_ONLY);
    expect(await runs()).toBe(0);
  });

  it("is closed for a hero whose Realm a grown-up has closed", async () => {
    await stockBanners();
    vi.mocked(loadHeroLevels).mockResolvedValueOnce({ enabled: false, tone: "gentle", band: "g23", grades: { math: "3", reading: "3", language: "3", science: "3" } } as never);
    await expect(startBuildRun("c1", "village-banners")).rejects.toThrow(CLOSED);
    expect(await runs()).toBe(0);
  });

  it("with the measure toggle off asks the same skills as choice tasks", async () => {
    await stockBanners();
    vi.mocked(loadRealmSettings).mockResolvedValue(mechanics(false));
    const r = await startBuildRun("c1", "village-banners");
    expect(r.questions).toHaveLength(3);
    expect(r.questions.map((q) => q.kind)).toEqual(["choice", "choice", "choice"]);
    expect([...new Set((await storedTasks(r.runId)).map((t) => t.skillId))].sort()).toEqual(["area-perimeter", "frac-unit"]);
    expect(r.demo).toBeUndefined();
  });

  describe("Aldo's demo (R-D6)", () => {
    it("shows a K to 3 hero's first build run the demo at its first bench task", async () => {
      await stockBanners();
      const r = await startBuildRun("c1", "village-banners");
      expect(r.demo).toEqual({ at: 0 });
    });

    it("shows it again on a resume until a bench task has been answered", async () => {
      await stockBanners();
      const first = await startBuildRun("c1", "village-banners");
      expect((await startBuildRun("c1", "village-banners")).demo).toEqual({ at: 0 });
      const tasks = await storedTasks(first.runId);
      await answerDeedQuestion(first.runId, 0, rightResponse(tasks[0]));
      expect((await startBuildRun("c1", "village-banners")).demo).toBeUndefined();
    });

    it("does not show a grade 4 hero the demo", async () => {
      await stockBanners();
      vi.mocked(loadHeroLevels).mockResolvedValue({ enabled: true, tone: "gentle", band: "g45", grades: { math: "4", reading: "4", language: "4", science: "4" } } as never);
      try {
        expect((await startBuildRun("c1", "village-banners")).demo).toBeUndefined();
      } finally {
        vi.mocked(loadHeroLevels).mockResolvedValue({ enabled: true, tone: "gentle", band: "g23", grades: { math: "3", reading: "3", language: "3", science: "3" } } as never);
      }
    });
  });

  async function answeredRun(improvementId = "village-banners"): Promise<string> {
    const r = await startBuildRun("c1", improvementId);
    const tasks = await storedTasks(r.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(r.runId, i, rightResponse(t));
    return r.runId;
  }

  it("finishing a build run builds the level, spends its cost and pays nothing: no minutes, no kingdom progress", async () => {
    await stockBanners();
    const s = await completeDeedRun(await answeredRun());
    expect(s).toMatchObject({ kind: "build", stars: 3, counted: false, building: null, minutesEarned: 0, correctCount: 3 });
    expect(s.improvement).toMatchObject({ id: "village-banners", label: "Banners", level: 1, built: true, balance: { dye: 0, thread: 0 } });
    expect(s.improvement?.reason).toBeUndefined();
    expect(s.improvement?.plaque).toEqual({
      improvementId: "village-banners", level: 1, label: "Banners", builtBy: "Ada", season: null, sources: ["A quest", "A quest"], stars: 3,
    });
    expect(await count("SELECT count(*) AS n FROM realm_play_ledger")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM kingdom_progress")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(2);
  });

  it("builds the level whatever the stars, and records them on the plaque", async () => {
    await stockBanners();
    // No second tries, so every wrong answer resolves at once.
    vi.mocked(loadRealmSettings).mockResolvedValue({ ...DEFAULT_REALM_SETTINGS, secondChances: false });
    const r = await startBuildRun("c1", "village-banners");
    const tasks = await storedTasks(r.runId);
    for (const [i, t] of tasks.entries()) await answerDeedQuestion(r.runId, i, wrongResponse(t));
    const s = await completeDeedRun(r.runId);
    expect(s.stars).toBe(0);
    expect(s.improvement).toMatchObject({ built: true });
    expect(s.improvement?.plaque?.stars).toBe(0);
    expect(Number((await client.query("SELECT stars FROM realm_improvement")).rows[0].stars)).toBe(0);
  });

  it("a build run finished short of materials builds nothing and spends nothing, and says so", async () => {
    await stockBanners();
    const runId = await answeredRun();
    // The materials were spent on something else while the hero was at the bench.
    await client.query("DELETE FROM realm_material");
    await earn("dye", 1);
    const s = await completeDeedRun(runId);
    expect(s).toMatchObject({ kind: "build", stars: 3, improvement: { id: "village-banners", level: 1, built: false, reason: "short", balance: { dye: 1, thread: 0 } } });
    expect(s.improvement?.plaque).toBeUndefined();
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
    // The run itself is closed, its stars kept.
    expect(Number((await client.query("SELECT stars FROM deed_run WHERE id = ?1", [runId])).rows[0].stars)).toBe(3);
  });

  it("only the hero can finish a build run: a grown-up is refused and nothing is written, then the hero finishes it", async () => {
    await stockBanners();
    const runId = await answeredRun();
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "parent:u1" }, familyId: "f1" } as never);
    await expect(completeDeedRun(runId)).rejects.toThrow(BUILD_HERO_ONLY);
    expect((await client.query("SELECT completed_at FROM deed_run WHERE id = ?1", [runId])).rows[0].completed_at).toBeNull();
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
    const s = await completeDeedRun(runId);
    expect(s.improvement).toMatchObject({ built: true });
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(1);
  });

  it("a failed spend undoes the level: no improvement row remains, and the summary says error", async () => {
    await stockBanners();
    const runId = await answeredRun();
    // The level insert wins, then the spent-row insert aborts: the whole transaction must roll back.
    await client.query("CREATE TRIGGER no_spend BEFORE INSERT ON realm_material WHEN NEW.kind = 'spent' BEGIN SELECT RAISE(ABORT, 'x'); END");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const s = await completeDeedRun(runId);
      expect(s.improvement).toMatchObject({ built: false, reason: "error", balance: { dye: 4, thread: 2 } });
    } finally {
      quiet.mockRestore();
      await client.query("DROP TRIGGER no_spend");
    }
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
  });

  it("a build that throws reports 'error' with the balance, never throws out of completion, and spends nothing", async () => {
    await stockBanners();
    const runId = await answeredRun();
    // The level table is gone: the build's transaction fails whole.
    await client.query("ALTER TABLE realm_improvement RENAME TO realm_improvement_gone");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const s = await completeDeedRun(runId);
      expect(s.improvement).toMatchObject({ id: "village-banners", level: 1, built: false, reason: "error", balance: { dye: 4, thread: 2 } });
      expect(s.stars).toBe(3);
    } finally {
      quiet.mockRestore();
      await client.query("ALTER TABLE realm_improvement_gone RENAME TO realm_improvement");
    }
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
  });

  it("two tabs finishing one build run build it once: the second is refused", async () => {
    await stockBanners();
    const runId = await answeredRun();
    const results = await Promise.allSettled([completeDeedRun(runId), completeDeedRun(runId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(2);
  });


  it("answering a build run moves skill_mastery", async () => {
    await stockBanners();
    const r = await startBuildRun("c1", "village-banners");
    const tasks = await storedTasks(r.runId);
    expect(kindOf(tasks[0])).toBe("measure");
    await answerDeedQuestion(r.runId, 0, rightResponse(tasks[0]));
    expect(await count("SELECT coalesce(sum(attempt_total), 0) AS n FROM skill_mastery WHERE child_id = 'c1'")).toBe(1);
  });
});

describe("markBuildingsAnnounced: the world says a rise once, for the hero alone", () => {
  /** A kingdom row for `childId`: raised (with `announced` or not), or still rising. */
  async function site(childId: string, buildingId: string, state: "rising" | "unannounced" | "announced"): Promise<void> {
    n += 1;
    await client.query(
      `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, announced_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, 3, ?4, ?5, unixepoch(), unixepoch())`,
      [`kp${n}`, childId, buildingId, state === "rising" ? null : 1_700_000_000, state === "announced" ? 1_700_000_500 : null],
    );
  }
  const announced = async (childId: string, buildingId: string): Promise<number | null> =>
    (await client.query("SELECT announced_at FROM kingdom_progress WHERE child_id = ?1 AND building_id = ?2", [childId, buildingId])).rows[0].announced_at as number | null;
  const asGrownUp = () => vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>);

  it("refuses a grown-up, and writes nothing", async () => {
    await site("c1", "well", "unannounced");
    asGrownUp();
    await expect(markBuildingsAnnounced("c1", ["well"])).rejects.toThrow(RISE_HERO_ONLY);
    expect(await announced("c1", "well")).toBeNull();
  });

  it("refuses an unknown id, a non-array and nine ids before any write", async () => {
    await site("c1", "well", "unannounced");
    const nine = ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden", "well"];
    for (const bad of [["well", "not-a-building"], ["__proto__"], [7], "well", null, undefined, { 0: "well", length: 1 }, nine]) {
      await expect(markBuildingsAnnounced("c1", bad), JSON.stringify(bad)).rejects.toThrow();
    }
    expect(await announced("c1", "well")).toBeNull();
  });

  it("marks only the complete, unannounced rows of this hero, with the server's clock", async () => {
    await client.query("INSERT INTO child (id, family_id, display_name) VALUES ('c2', 'f1', 'Bo')");
    await site("c1", "well", "unannounced");
    await site("c1", "mill", "rising");
    await site("c1", "bridge", "announced");
    await site("c1", "chapel", "unannounced");
    await site("c2", "well", "unannounced");
    const before = Math.floor(Date.now() / 1000);
    await markBuildingsAnnounced("c1", ["well", "mill", "bridge"]);
    expect(await announced("c1", "well")).toBeGreaterThanOrEqual(before);
    // Still rising: nothing to announce yet.
    expect(await announced("c1", "mill")).toBeNull();
    // Already announced: its first time stands.
    expect(await announced("c1", "bridge")).toBe(1_700_000_500);
    // Not asked for, and another hero's: left alone.
    expect(await announced("c1", "chapel")).toBeNull();
    expect(await announced("c2", "well")).toBeNull();
  });

  it("takes an empty list as nothing to do", async () => {
    await site("c1", "well", "unannounced");
    await markBuildingsAnnounced("c1", []);
    expect(await announced("c1", "well")).toBeNull();
  });
});

const revalidate = vi.mocked((await import("next/cache")).revalidatePath);

describe("pinPlan: the hero chooses what to build", () => {
  const pinned = async (): Promise<string | null> =>
    ((await client.query("SELECT pinned_plan FROM realm_settings WHERE child_id = 'c1'")).rows[0]?.pinned_plan as string | null | undefined) ?? null;
  const asGrownUp = () => vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>);

  it("pins a catalog plan for the hero and refreshes the Tavern", async () => {
    revalidate.mockClear();
    await pinPlan("c1", "well-house");
    expect(await pinned()).toBe("well-house");
    expect(revalidate).toHaveBeenCalledWith("/tavern");
  });

  it("null unpins", async () => {
    await pinPlan("c1", "village-lamps");
    await pinPlan("c1", null);
    expect(await pinned()).toBeNull();
  });

  it("refuses a grown-up, and writes nothing", async () => {
    asGrownUp();
    await expect(pinPlan("c1", "well-house")).rejects.toThrow(PIN_HERO_ONLY);
    expect(await pinned()).toBeNull();
  });

  it("refuses an id that is not in the catalog, before any write", async () => {
    for (const bad of ["moat-of-doom", "__proto__", "constructor", "toString", 7, undefined, {}, ["well-house"], ""]) {
      await expect(pinPlan("c1", bad), JSON.stringify(bad)).rejects.toThrow(PLAN_NOT_READY);
    }
    expect(await pinned()).toBeNull();
  });
});

describe("markDeliverySeen: the hero takes the delivery", () => {
  const seen = async (): Promise<number | null> =>
    ((await client.query("SELECT delivery_seen_at FROM realm_settings WHERE child_id = 'c1'")).rows[0]?.delivery_seen_at as number | null | undefined) ?? null;
  const asGrownUp = () => vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "u-parent" }, familyId: "f1" } as unknown as Awaited<ReturnType<typeof requireChildAccess>>);

  it("marks the delivery seen through the given second", async () => {
    await markDeliverySeen("c1", 1_700_000_000);
    expect(await seen()).toBe(1_700_000_000);
  });

  it("refuses a grown-up, and writes nothing", async () => {
    asGrownUp();
    await expect(markDeliverySeen("c1", 1_700_000_000)).rejects.toThrow(DELIVERY_HERO_ONLY);
    expect(await seen()).toBeNull();
  });

  it("refuses anything that is not a finite number of seconds", async () => {
    for (const bad of [NaN, Infinity, -Infinity, "1700000000", null, undefined, {}, [5]]) {
      await expect(markDeliverySeen("c1", bad), String(bad)).rejects.toThrow();
    }
    expect(await seen()).toBeNull();
  });

  it("clamps a future time to now", async () => {
    const before = Math.floor(Date.now() / 1000);
    await markDeliverySeen("c1", before + 86_400 * 365);
    const stored = (await seen())!;
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it("never moves the mark backwards", async () => {
    await markDeliverySeen("c1", 1_700_000_500);
    await markDeliverySeen("c1", 1_700_000_100);
    expect(await seen()).toBe(1_700_000_500);
    await markDeliverySeen("c1", -5);
    expect(await seen()).toBe(1_700_000_500);
  });
});
