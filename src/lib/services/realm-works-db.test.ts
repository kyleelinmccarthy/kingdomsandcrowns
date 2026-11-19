// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { IMPROVEMENTS } from "@/lib/realm/improvements";
import { REALM_IMPROVEMENT_DDL, REALM_MATERIAL_DDL, REALM_PLAQUE_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/** What the Realm reads about the hero's works, against a REAL libsql database. */
const pool = testDatabase("realm-works-db");
vi.mock("@/lib/db", () => ({ db: pool.db }));

const { loadWorks, setPinnedPlan, advanceDeliverySeen } = await import("@/lib/services/realm-materials");

const DDL = [...REALM_SETTINGS_DDL, ...REALM_MATERIAL_DDL, ...REALM_IMPROVEMENT_DDL, ...REALM_PLAQUE_DDL];
const TABLES = ["realm_settings", "realm_material", "realm_improvement", "quest_assignment", "quest", "subject", "season"];

beforeAll(async () => {
  for (const sql of DDL) await pool.query(sql);
});
beforeEach(async () => {
  for (const t of TABLES) await pool.query(`DELETE FROM ${t}`);
});
afterAll(() => pool.close());

let n = 0;
async function settings(over: { pinned?: string | null; seen?: number | null } = {}): Promise<void> {
  await pool.query(
    "INSERT INTO realm_settings (id, child_id, pinned_plan, delivery_seen_at, created_at, updated_at) VALUES ('s1', 'c1', ?1, ?2, unixepoch(), unixepoch())",
    [over.pinned ?? null, over.seen ?? null],
  );
}
/** A quest the hero finished, with its title, and (optionally) the earned row it minted. */
async function earned(
  materialId: string, amount: number, createdAt: number,
  opts: { title?: string | null; origin?: "quest" | "welcome"; kind?: "earned" | "spent"; childId?: string } = {},
): Promise<void> {
  n += 1;
  const { title = `Quest ${n}`, origin = "quest", kind = "earned", childId = "c1" } = opts;
  let assignment: string | null = null;
  if (title !== null) {
    assignment = `a${n}`;
    await pool.query("INSERT INTO quest (id, title) VALUES (?1, ?2)", [`q${n}`, title]);
    await pool.query("INSERT INTO quest_assignment (id, quest_id, child_id, date) VALUES (?1, ?2, ?3, '2026-11-01')", [assignment, `q${n}`, childId]);
  } else {
    // An assignment whose quest is gone.
    assignment = `a${n}`;
    await pool.query("INSERT INTO quest_assignment (id, quest_id, child_id, date) VALUES (?1, 'gone', ?2, '2026-11-01')", [assignment, childId]);
  }
  await pool.query(
    `INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [`m${n}`, childId, materialId, amount, kind, origin, kind === "earned" ? assignment : null, createdAt],
  );
}
async function improvement(
  improvementId: string, level: number, builtAt: number,
  opts: { seasonId?: string | null; sources?: string; stars?: number; by?: string; childId?: string } = {},
): Promise<void> {
  n += 1;
  const { seasonId = null, sources = "[]", stars = 3, by = "Emma", childId = "c1" } = opts;
  await pool.query(
    `INSERT INTO realm_improvement (id, child_id, improvement_id, level, stars, season_id, built_by_name, sources, built_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [`i${n}`, childId, improvementId, level, stars, seasonId, by, sources, builtAt],
  );
}

describe("loadWorks: nothing yet", () => {
  it("is empty for a hero with no rows at all, and creates nothing", async () => {
    const w = await loadWorks("c1");
    expect(w).toEqual({
      balance: { stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 },
      built: {}, plaques: [], pinned: null, delivery: null,
    });
    expect((await pool.query("SELECT count(*) AS n FROM realm_settings")).rows[0].n).toBe(0);
  });
});

describe("loadWorks: the satchel", () => {
  it("is earned minus spent for this hero alone", async () => {
    await earned("stone", 3, 100);
    await earned("stone", 1, 200, { kind: "spent" });
    await earned("ink", 2, 300);
    await earned("herbs", 9, 400, { childId: "c2" });
    expect((await loadWorks("c1")).balance).toEqual({ stone: 2, ink: 2, herbs: 0, thread: 0, dye: 0, timber: 0 });
  });
});

describe("loadWorks: the delivery", () => {
  it("lists the earned rows after delivery_seen_at, oldest first, with the quest's title", async () => {
    await settings({ seen: 200 });
    await earned("stone", 1, 100, { title: "Old news" });
    await earned("ink", 1, 200, { title: "Exactly at the mark" });
    await earned("stone", 2, 400, { title: "Fractions p.12" });
    await earned("ink", 1, 300, { title: "Spelling" });
    await earned("stone", 1, 500, { kind: "spent" });
    const d = (await loadWorks("c1")).delivery;
    expect(d).toEqual({
      rows: [
        { materialId: "ink", amount: 1, title: "Spelling", origin: "quest" },
        { materialId: "stone", amount: 2, title: "Fractions p.12", origin: "quest" },
      ],
      through: 400,
    });
  });

  it("a null seen-at means every earned row is in the delivery", async () => {
    await settings({ seen: null });
    await earned("stone", 1, 100, { title: "A" });
    await earned("ink", 1, 200, { title: "B" });
    const d = (await loadWorks("c1")).delivery;
    expect(d?.rows.map((r) => r.title)).toEqual(["A", "B"]);
    expect(d?.through).toBe(200);
  });

  it("takes the pin and the delivery mark from a settings row it is handed, rather than reading its own (M-5)", async () => {
    // The database says: nothing seen, no pin. The row handed in says otherwise, and wins.
    await settings({ seen: null, pinned: null });
    await earned("stone", 1, 100, { title: "Old news" });
    await earned("ink", 1, 300, { title: "Spelling" });
    const handed = Promise.resolve({ pinnedPlan: "village-banners", deliverySeenAt: new Date(200 * 1000) });
    const w = await loadWorks("c1", handed);
    expect(w.pinned).toBe("village-banners");
    expect(w.delivery?.rows.map((r) => r.title)).toEqual(["Spelling"]);
    // A handed null is a hero with no row: everything is new, nothing pinned.
    const none = await loadWorks("c1", Promise.resolve(null));
    expect(none.pinned).toBeNull();
    expect(none.delivery?.rows).toHaveLength(2);
  });

  it("a hero with no settings row yet counts as null: all rows", async () => {
    await earned("stone", 1, 100, { title: "A" });
    expect((await loadWorks("c1")).delivery?.rows).toHaveLength(1);
  });

  it("is null when nothing is newer than the mark", async () => {
    await settings({ seen: 500 });
    await earned("stone", 1, 100);
    await earned("ink", 1, 500);
    expect((await loadWorks("c1")).delivery).toBeNull();
  });

  it("keeps the welcome origin, so a welcome-only delivery can be told apart", async () => {
    await earned("stone", 4, 100, { title: "Fractions", origin: "welcome" });
    await earned("ink", 2, 100, { title: "Reading", origin: "welcome" });
    const d = (await loadWorks("c1")).delivery;
    expect(d?.rows.every((r) => r.origin === "welcome")).toBe(true);
    expect(d?.rows).toHaveLength(2);
  });

  it("reads 'A quest' when the quest's title is gone", async () => {
    await earned("stone", 1, 100, { title: null });
    expect((await loadWorks("c1")).delivery?.rows[0].title).toBe("A quest");
  });

  it("ignores another hero's rows", async () => {
    await earned("stone", 1, 100, { childId: "c2" });
    expect((await loadWorks("c1")).delivery).toBeNull();
  });
});

describe("loadWorks: built levels and plaques", () => {
  it("takes the highest level per improvement, and a plaque per built level, oldest first", async () => {
    await improvement("well-house", 2, 2000, { sources: JSON.stringify([{ title: "Fractions p.12", subject: "Math", date: "2026-11-01" }, { title: "Times tables", subject: "Math", date: "2026-11-02" }]), stars: 2 });
    await improvement("well-house", 1, 1000, { by: "Emma" });
    await improvement("village-lamps", 1, 3000, { by: "Bo" });
    await improvement("village-statue", 3, 1000, { childId: "c2" }); // another hero's
    const w = await loadWorks("c1");
    expect(w.built).toEqual({ "well-house": 2, "village-lamps": 1 });
    expect(w.plaques.map((p) => [p.improvementId, p.level])).toEqual([["well-house", 1], ["well-house", 2], ["village-lamps", 1]]);
    expect(w.plaques[1]).toEqual({
      improvementId: "well-house", level: 2, label: IMPROVEMENTS["well-house"].label, builtBy: "Emma", season: null,
      sources: ["Fractions p.12", "Times tables"], stars: 2,
    });
    expect(w.plaques[2].builtBy).toBe("Bo");
  });

  it("labels the season from the season row, and reads null when the season is gone", async () => {
    await pool.query("INSERT INTO season (id, child_id, ordinal, start_date) VALUES ('se1', 'c1', 1, '2026-08-15')");
    await improvement("well-house", 1, 1000, { seasonId: "se1" });
    await improvement("well-house", 2, 2000, { seasonId: "deleted-season" });
    await improvement("well-house", 3, 3000, { seasonId: null });
    expect((await loadWorks("c1")).plaques.map((p) => p.season)).toEqual(["2026–27", null, null]);
  });

  it("reads bad sources as none, and never throws", async () => {
    await improvement("well-house", 1, 1000, { sources: "{not json" });
    await improvement("well-house", 2, 2000, { sources: '{"title":"not an array"}' });
    await improvement("well-house", 3, 3000, { sources: '[{"subject":"no title"},7,null,{"title":"Kept"}]' });
    await improvement("well-house", 4, 4000, { sources: "null" });
    const w = await loadWorks("c1");
    expect(w.plaques.map((p) => p.sources)).toEqual([[], [], ["Kept"], []]);
  });

  it("ignores an improvement id the catalog no longer has", async () => {
    await improvement("moat-of-doom", 2, 1000);
    await improvement("well-house", 1, 2000);
    const w = await loadWorks("c1");
    expect(w.built).toEqual({ "well-house": 1 });
    expect(w.plaques).toHaveLength(1);
    expect(Object.hasOwn(w.built, "moat-of-doom")).toBe(false);
  });

  it("does not take a prototype key as an improvement", async () => {
    await improvement("constructor", 1, 1000);
    await improvement("__proto__", 1, 1000);
    const w = await loadWorks("c1");
    expect(w.built).toEqual({});
    expect(w.plaques).toEqual([]);
  });
});

describe("loadWorks: the pinned plan", () => {
  it("is the stored id when it is in the catalog", async () => {
    await settings({ pinned: "village-lamps" });
    expect((await loadWorks("c1")).pinned).toBe("village-lamps");
  });

  it("is null when the stored id is not in the catalog, or not set", async () => {
    await settings({ pinned: "moat-of-doom" });
    expect((await loadWorks("c1")).pinned).toBeNull();
    await pool.query("UPDATE realm_settings SET pinned_plan = 'constructor'");
    expect((await loadWorks("c1")).pinned).toBeNull();
    await pool.query("UPDATE realm_settings SET pinned_plan = NULL");
    expect((await loadWorks("c1")).pinned).toBeNull();
  });
});

describe("setPinnedPlan and advanceDeliverySeen", () => {
  it("pin and unpin write the plan, creating the settings row when there is none", async () => {
    await setPinnedPlan("c1", "well-house");
    expect((await loadWorks("c1")).pinned).toBe("well-house");
    await setPinnedPlan("c1", null);
    expect((await loadWorks("c1")).pinned).toBeNull();
    expect((await pool.query("SELECT count(*) AS n FROM realm_settings")).rows[0].n).toBe(1);
  });

  it("moves the mark forward, clamps a future value to now, and never goes back", async () => {
    const now = Math.floor(Date.now() / 1000);
    const seen = async () => (await pool.query("SELECT delivery_seen_at AS v FROM realm_settings WHERE child_id = 'c1'")).rows[0].v as number;
    await advanceDeliverySeen("c1", 1000);
    expect(await seen()).toBe(1000);
    await advanceDeliverySeen("c1", 500);
    expect(await seen()).toBe(1000);
    await advanceDeliverySeen("c1", now + 10_000_000);
    expect(await seen()).toBeGreaterThanOrEqual(now);
    expect(await seen()).toBeLessThan(now + 100);
    const clamped = await seen();
    await advanceDeliverySeen("c1", 2000);
    expect(await seen()).toBe(clamped);
  });
});
