// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_IMPROVEMENT_DDL, REALM_MATERIAL_DDL, REALM_ACCESS_DDL, REALM_PLAQUE_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";
import { MATERIAL_IDS } from "@/lib/realm/materials";

/**
 * Finishing a build against a REAL libsql database, as two server instances see it: the spend is one
 * locked transaction, so two finishes at once never overspend and never build a level twice. Each
 * "instance" is its own fresh import of the service (`vi.resetModules`), so its in-process queue is
 * its own and only the database's write lock stands between two calls.
 */
const pool = testDatabase("improvements-finish-db");
const testDb = pool.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Service = typeof import("./improvements");

/** One isolate: its own copy of the service, and so its own in-process queue. */
async function isolate(): Promise<Service> {
  vi.resetModules();
  return import("./improvements");
}

const DDL = [...REALM_SETTINGS_DDL, ...REALM_LEDGER_DDL, ...REALM_ACCESS_DDL, ...REALM_MATERIAL_DDL, ...REALM_IMPROVEMENT_DDL, ...REALM_PLAQUE_DDL];
const TABLES = ["realm_material", "realm_improvement", "quest_assignment", "quest", "subject", "season", "child"];
const NOW = new Date("2026-11-19T12:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

beforeAll(async () => {
  for (const sql of DDL) await pool.query(sql);
});

beforeEach(async () => {
  for (const t of TABLES) await pool.query(`DELETE FROM ${t}`);
  await pool.query("INSERT INTO child (id, family_id, display_name) VALUES ('c1', 'f1', 'Ada')");
});

afterAll(async () => {
  pool.close();
});

let n = 0;
let clock = 1_000;
/** A quest the hero finished: assignment, quest and subject rows, so a plaque can name it. */
async function quest(id: string, title: string, subject: string | null, date: string): Promise<void> {
  await pool.query("INSERT INTO quest_assignment (id, quest_id, child_id, date) VALUES (?1, ?2, 'c1', ?3)", [id, `q-${id}`, date]);
  await pool.query("INSERT INTO quest (id, title, subject_id) VALUES (?1, ?2, ?3)", [`q-${id}`, title, subject ? `s-${subject}` : null]);
  if (subject) await pool.query("INSERT OR IGNORE INTO subject (id, name) VALUES (?1, ?2)", [`s-${subject}`, subject]);
}
/** Earned materials in hand, minted in the order the calls are made (each a second later). */
async function earn(materialId: string, amount: number, assignmentId: string | null = null): Promise<void> {
  n += 1;
  clock += 1;
  await pool.query(
    `INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at)
     VALUES (?1, 'c1', ?2, ?3, 'earned', 'quest', ?4, ?5)`,
    [`m${n}`, materialId, amount, assignmentId ?? `a${n}`, clock],
  );
}
async function builtLevel(improvementId: string, level: number, stars = 1): Promise<void> {
  n += 1;
  await pool.query(
    `INSERT INTO realm_improvement (id, child_id, improvement_id, level, stars, built_by_name, sources, built_at) VALUES (?1, 'c1', ?2, ?3, ?4, 'Old Name', '[]', unixepoch())`,
    [`imp${n}`, improvementId, level, stars],
  );
}
const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
const improvements = async () => (await pool.query("SELECT * FROM realm_improvement ORDER BY improvement_id, level")).rows;
const spent = async () =>
  (await pool.query("SELECT material_id, amount, improvement_id, level, created_at FROM realm_material WHERE kind = 'spent' ORDER BY material_id")).rows;
/** Banners level 1 costs 4 dye and 2 thread. */
const stockBanners = async () => {
  await earn("dye", 4);
  await earn("thread", 2);
};
const BANNERS = { improvementId: "village-banners" as const, level: 1 };

describe("finishBuild", () => {
  it("spends the cost, writes the level with who built it and when, and returns its plaque", async () => {
    await quest("a1", "Fractions drill", "Math", "2026-11-02");
    await quest("a2", "Read aloud", "Reading", "2026-11-03");
    await earn("dye", 4, "a1");
    await earn("thread", 3, "a2");
    await pool.query("INSERT INTO season (id, child_id, start_date, completed_at) VALUES ('se1', 'c1', '2026-08-24', NULL)");
    const { finishBuild } = await isolate();

    const r = await finishBuild("c1", BANNERS, 2, NOW);

    expect(r).toMatchObject({ id: "village-banners", label: "Banners", level: 1, built: true, balance: { dye: 0, thread: 1, stone: 0, ink: 0, herbs: 0, timber: 0 } });
    expect(r.reason).toBeUndefined();
    expect(r.plaque).toEqual({
      improvementId: "village-banners", level: 1, label: "Banners", builtBy: "Ada", season: "2026–27", sources: ["Fractions drill", "Read aloud"], stars: 2,
    });
    const rows = await improvements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ child_id: "c1", improvement_id: "village-banners", level: 1, stars: 2, season_id: "se1", built_by_name: "Ada" });
    expect(Number(rows[0].built_at)).toBe(NOW_SEC);
    expect(JSON.parse(rows[0].sources as string)).toEqual([
      { title: "Fractions drill", subject: "Math", date: "2026-11-02" },
      { title: "Read aloud", subject: "Reading", date: "2026-11-03" },
    ]);
    // One spent row per material paid, tied to the level, and exactly the cost.
    expect((await spent()).map((s) => ({ ...s, amount: Number(s.amount), level: Number(s.level), created_at: Number(s.created_at) }))).toEqual([
      { material_id: "dye", amount: 4, improvement_id: "village-banners", level: 1, created_at: NOW_SEC },
      { material_id: "thread", amount: 2, improvement_id: "village-banners", level: 1, created_at: NOW_SEC },
    ]);
  });

  it("has no season on the plaque when none is open, and ignores a completed season", async () => {
    await pool.query("INSERT INTO season (id, child_id, start_date, completed_at) VALUES ('se0', 'c1', '2025-08-25', 1000)");
    await stockBanners();
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 1, NOW);
    expect(r.plaque?.season).toBeNull();
    expect((await improvements())[0].season_id).toBeNull();
  });

  it("says a level already built is built, spending nothing, and hands back the plaque already on record (the two-tabs case)", async () => {
    await builtLevel("village-banners", 1, 3);
    await stockBanners();
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 1, NOW);
    expect(r).toMatchObject({ id: "village-banners", level: 1, built: true, balance: { dye: 4, thread: 2 } });
    // The client was never told of this level, so it gets the first build's own plaque: never a built level with none.
    expect(r.plaque).toEqual({ improvementId: "village-banners", level: 1, label: "Banners", builtBy: "Old Name", season: null, sources: [], stars: 3 });
    expect(r.reason).toBeUndefined();
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
    // The first build's record stands, untouched.
    const rows = await improvements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stars: 3, built_by_name: "Old Name" });
  });

  it("is short when the materials are not there: nothing is written, and the balance comes back", async () => {
    await earn("dye", 4);
    await earn("thread", 1);
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 3, NOW);
    expect(r).toMatchObject({ id: "village-banners", level: 1, built: false, reason: "short", balance: { dye: 4, thread: 1 } });
    expect(r.plaque).toBeUndefined();
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
  });

  it("pays a shortfall from timber, and writes those spent rows under timber", async () => {
    await earn("dye", 1);
    await earn("timber", 5);
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 1, NOW);
    expect(r).toMatchObject({ built: true, balance: { dye: 0, thread: 0, timber: 0 } });
    // 4 dye and 2 thread: 1 dye in hand, the other 5 units from timber.
    expect((await spent()).map((s) => [s.material_id, Number(s.amount)])).toEqual([["dye", 1], ["timber", 5]]);
  });

  it("lets another material pay the secondary share (RD-t), and writes the spent rows under what was really taken", async () => {
    // The fountain's first level: 4 stone and 2 herbs. 1 herbs in hand, no timber; ink pays the other herbs.
    await quest("st", "Fractions drill", "Math", "2026-11-02");
    await quest("he", "Seeds", "Science", "2026-11-03");
    await quest("in", "Read aloud", "Reading", "2026-11-04");
    await earn("stone", 4, "st");
    await earn("herbs", 1, "he");
    await earn("ink", 3, "in");
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", { improvementId: "village-fountain", level: 1 }, 3, NOW);
    expect(r).toMatchObject({ built: true, balance: { stone: 0, herbs: 0, ink: 2, timber: 0 } });
    expect((await spent()).map((s) => [s.material_id, Number(s.amount)])).toEqual([["herbs", 1], ["ink", 1], ["stone", 4]]);
    expect(r.plaque?.sources).toEqual(["Fractions drill", "Seeds", "Read aloud"]);
  });

  it("refuses level 2 while level 1 is not built: error, and nothing is written", async () => {
    await earn("dye", 6);
    await earn("thread", 3);
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", { improvementId: "village-banners", level: 2 }, 3, NOW);
    expect(r).toMatchObject({ id: "village-banners", level: 2, built: false, reason: "error", balance: { dye: 6, thread: 3 } });
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(0);
  });

  it("builds level 2 once level 1 stands", async () => {
    await builtLevel("village-banners", 1);
    await earn("dye", 6);
    await earn("thread", 3);
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", { improvementId: "village-banners", level: 2 }, 1, NOW);
    expect(r).toMatchObject({ level: 2, built: true, balance: { dye: 0, thread: 0 } });
    expect(r.plaque).toMatchObject({ level: 2, stars: 1 });
  });

  it("refuses a level that is not in the catalog", async () => {
    await stockBanners();
    const { finishBuild } = await isolate();
    expect(await finishBuild("c1", { improvementId: "village-banners", level: 4 }, 1, NOW)).toMatchObject({ built: false, reason: "error" });
    expect(await finishBuild("c1", { improvementId: "village-banners", level: 0 }, 1, NOW)).toMatchObject({ built: false, reason: "error" });
    expect(await count("SELECT count(*) AS n FROM realm_improvement")).toBe(0);
  });

  it("names its sources oldest first, only the quests that paid, and reads a deleted quest as 'a quest'", async () => {
    // The fountain's third level costs 8 stone and 4 herbs: twelve quests' worth.
    await builtLevel("village-fountain", 1);
    await builtLevel("village-fountain", 2);
    for (let i = 1; i <= 8; i++) {
      if (i !== 3) await quest(`s${i}`, `Stone quest ${i}`, i % 2 ? "Math" : null, `2026-10-${String(i).padStart(2, "0")}`);
      await earn("stone", 1, `s${i}`);
    }
    for (let i = 1; i <= 4; i++) {
      await quest(`h${i}`, `Herb quest ${i}`, "Science", `2026-10-2${i}`);
      await earn("herbs", 1, `h${i}`);
    }
    // Newer surplus: not spent, so not a source.
    await quest("extra", "Later quest", "Math", "2026-11-01");
    await earn("stone", 2, "extra");
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", { improvementId: "village-fountain", level: 3 }, 2, NOW);
    expect(r.built).toBe(true);
    const sources = JSON.parse((await improvements()).find((x) => Number(x.level) === 3)!.sources as string) as { title: string; subject: string | null; date: string | null }[];
    expect(sources).toHaveLength(12);
    expect(sources.map((s) => s.title)).toEqual([
      "Stone quest 1", "Stone quest 2", "a quest", "Stone quest 4", "Stone quest 5", "Stone quest 6", "Stone quest 7", "Stone quest 8",
      "Herb quest 1", "Herb quest 2", "Herb quest 3", "Herb quest 4",
    ]);
    expect(sources[0]).toEqual({ title: "Stone quest 1", subject: "Math", date: "2026-10-01" });
    // A quest with no subject has none; a deleted one has neither subject nor date.
    expect(sources[1]).toEqual({ title: "Stone quest 2", subject: null, date: "2026-10-02" });
    expect(sources[2]).toEqual({ title: "a quest", subject: null, date: null });
    expect(r.plaque?.sources).toEqual(sources.map((s) => s.title));
    expect(r.balance.stone).toBe(2);
  });

  it("names a quest done twice once on the plaque, keeping the order the quests paid in", async () => {
    // Two assignments of one quest (two different days), then another quest: the plaque says each title once.
    await quest("w1", "Science Worksheet", "Science", "2026-11-02");
    await quest("m1", "Maps", "History", "2026-11-03");
    await pool.query("INSERT INTO quest_assignment (id, quest_id, child_id, date) VALUES ('w2', 'q-w1', 'c1', '2026-11-04')");
    await earn("dye", 2, "w1");
    await earn("dye", 1, "m1");
    await earn("dye", 1, "w2");
    await quest("t1", "Spinning", "Art", "2026-11-05");
    await earn("thread", 2, "t1");
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 3, NOW);
    expect(r.plaque?.sources).toEqual(["Science Worksheet", "Maps", "Spinning"]);
    const stored = JSON.parse((await improvements())[0].sources as string) as { title: string }[];
    expect(stored.map((s) => s.title)).toEqual(["Science Worksheet", "Maps", "Spinning"]);
  });

  it("with no child row, still builds (the name reads as a hero)", async () => {
    await pool.query("DELETE FROM child");
    await stockBanners();
    const { finishBuild } = await isolate();
    const r = await finishBuild("c1", BANNERS, 1, NOW);
    expect(r.plaque?.builtBy).toBe("A hero");
  });
});

describe("finishBuild, raced", () => {
  it("two finishes of one level at once build it once and spend once, even with the materials for two", async () => {
    // Enough for the level twice over: only the unique row and the lock stand between them and a double spend.
    await earn("dye", 8);
    await earn("thread", 4);
    const [a, b] = [await isolate(), await isolate()];
    const results = await Promise.all([a.finishBuild("c1", BANNERS, 3, NOW), b.finishBuild("c1", BANNERS, 3, NOW)]);
    expect(results.every((r) => r.built && r.reason === undefined)).toBe(true);
    // Exactly one call built it; the other found it built. Both carry the one plaque on record.
    expect(results.every((r) => r.plaque)).toBe(true);
    expect(results[0].plaque).toEqual(results[1].plaque);
    expect(await improvements()).toHaveLength(1);
    expect((await spent()).map((s) => [s.material_id, Number(s.amount)])).toEqual([["dye", 4], ["thread", 2]]);
  });

  it("two finishes of one level at once, with only one level's worth, both say built and spend once", async () => {
    await stockBanners();
    const [a, b] = [await isolate(), await isolate()];
    const results = await Promise.all([a.finishBuild("c1", BANNERS, 1, NOW), b.finishBuild("c1", BANNERS, 1, NOW)]);
    expect(results.every((r) => r.built && r.reason === undefined && r.plaque?.level === 1)).toBe(true);
    expect(await improvements()).toHaveLength(1);
    expect(await count("SELECT count(*) AS n FROM realm_material WHERE kind = 'spent'")).toBe(2);
  });

  it("two different plans racing for the last materials: one is built, the other is short, and no balance goes below zero", async () => {
    // Banners (4 dye, 2 thread) and Lamps (4 thread, 2 stone) both want the thread; there is only 4.
    await earn("dye", 4);
    await earn("thread", 4);
    await earn("stone", 2);
    const [a, b] = [await isolate(), await isolate()];
    const results = await Promise.all([
      a.finishBuild("c1", BANNERS, 1, NOW),
      b.finishBuild("c1", { improvementId: "village-lamps", level: 1 }, 1, NOW),
    ]);
    expect(results.filter((r) => r.built)).toHaveLength(1);
    const loser = results.find((r) => !r.built)!;
    expect(loser.reason).toBe("short");
    expect(await improvements()).toHaveLength(1);
    // The ledger itself, summed by hand: earned minus spent, per material.
    const rows = (await pool.query("SELECT material_id, kind, amount FROM realm_material")).rows;
    for (const id of MATERIAL_IDS) {
      const net = rows.filter((r) => r.material_id === id).reduce((sum, r) => sum + (r.kind === "earned" ? 1 : -1) * Number(r.amount), 0);
      expect(net, id).toBeGreaterThanOrEqual(0);
    }
    for (const id of MATERIAL_IDS) expect(loser.balance[id], id).toBeGreaterThanOrEqual(0);
  });
});
