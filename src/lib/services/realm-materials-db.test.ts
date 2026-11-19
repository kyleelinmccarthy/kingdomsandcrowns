// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_MATERIAL_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * Minting against a REAL libsql database. Each "instance" is its own import of the service
 * (`vi.resetModules`), so only the database's write lock and the partial unique index stand
 * between two completions of one quest.
 */
const pool = testDatabase("realm-materials-db");
const testDb = pool.db;

vi.mock("@/lib/db", () => ({ db: testDb }));

type Services = typeof import("@/lib/services/realm-materials");

async function isolate(): Promise<Services> {
  vi.resetModules();
  return import("@/lib/services/realm-materials");
}

// Only the columns the service reads: drizzle selects what it is asked for.
const DDL = [
  ...REALM_SETTINGS_DDL,
  ...REALM_MATERIAL_DDL,
  `CREATE TABLE quest_assignment (id text PRIMARY KEY NOT NULL, quest_id text NOT NULL, child_id text NOT NULL)`,
  `CREATE TABLE quest (id text PRIMARY KEY NOT NULL, subject_id text)`,
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, name text NOT NULL, material text)`,
];

beforeAll(async () => {
  for (const sql of DDL) await pool.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_material", "quest_assignment", "quest", "subject"]) await pool.query(`DELETE FROM ${t}`);
  await pool.query("INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES ('s1', 'c1', unixepoch(), unixepoch())");
  await pool.query("INSERT INTO subject (id, name, material) VALUES ('sub-math', 'Math', NULL), ('sub-sci', 'Science', NULL), ('sub-art', 'Sketching', 'dye')");
  await pool.query("INSERT INTO quest (id, subject_id) VALUES ('q-math', 'sub-math'), ('q-sci', 'sub-sci'), ('q-art', 'sub-art'), ('q-none', NULL)");
  await pool.query(
    "INSERT INTO quest_assignment (id, quest_id, child_id) VALUES ('a-math', 'q-math', 'c1'), ('a-sci', 'q-sci', 'c1'), ('a-art', 'q-art', 'c1'), ('a-none', 'q-none', 'c1')",
  );
});

afterAll(async () => {
  pool.close();
});

async function rows(): Promise<{ material_id: string; amount: number; kind: string; origin: string; source_assignment_id: string }[]> {
  const r = await pool.query("SELECT * FROM realm_material WHERE child_id = 'c1' ORDER BY created_at, id");
  return r.rows as never;
}

describe("grantMaterialsForCompletion", () => {
  it("mints the subject's material once for a quest", async () => {
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "a-math")).toEqual({ materialId: "stone", amount: 1 });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ material_id: "stone", amount: 1, kind: "earned", origin: "quest", source_assignment_id: "a-math" });
  });

  it("two completions of one quest at once mint once", async () => {
    const [a, b] = [await isolate(), await isolate()];
    const [ra, rb] = await Promise.all([a.grantMaterialsForCompletion("c1", "a-math"), b.grantMaterialsForCompletion("c1", "a-math")]);
    expect(await rows()).toHaveLength(1);
    expect(ra).toEqual({ materialId: "stone", amount: 1 });
    expect(rb).toEqual({ materialId: "stone", amount: 1 });
  });

  it("a redo of the same assignment mints nothing new and reports the existing row", async () => {
    const s = await isolate();
    await s.grantMaterialsForCompletion("c1", "a-math");
    // Even if the setting changed since, the repeat reports what was minted.
    await pool.query("UPDATE realm_settings SET materials_per_quest = 3 WHERE child_id = 'c1'");
    expect(await s.grantMaterialsForCompletion("c1", "a-math")).toEqual({ materialId: "stone", amount: 1 });
    expect(await rows()).toHaveLength(1);
  });

  it("mints for a grown-up completing too: the grant never asks who completed", async () => {
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "a-sci")).toEqual({ materialId: "herbs", amount: 1 });
  });

  it("mints nothing when materialsPerQuest is 0", async () => {
    await pool.query("UPDATE realm_settings SET materials_per_quest = 0 WHERE child_id = 'c1'");
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "a-math")).toBeNull();
    expect(await rows()).toHaveLength(0);
  });

  it("still mints when the Realm is off, or play time is not earned", async () => {
    await pool.query("UPDATE realm_settings SET enabled = 0, access_mode = 'off' WHERE child_id = 'c1'");
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "a-math")).toEqual({ materialId: "stone", amount: 1 });
    expect(await rows()).toHaveLength(1);
  });

  it("a subject with no material set, named Science, brings herbs", async () => {
    const s = await isolate();
    expect((await s.grantMaterialsForCompletion("c1", "a-sci"))?.materialId).toBe("herbs");
  });

  it("a subject with an explicit material brings that material", async () => {
    const s = await isolate();
    expect((await s.grantMaterialsForCompletion("c1", "a-art"))?.materialId).toBe("dye");
  });

  it("materialsPerQuest 3 mints 3", async () => {
    await pool.query("UPDATE realm_settings SET materials_per_quest = 3 WHERE child_id = 'c1'");
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "a-math")).toEqual({ materialId: "stone", amount: 3 });
    expect((await rows())[0].amount).toBe(3);
  });

  it("a quest with no subject brings timber", async () => {
    const s = await isolate();
    expect((await s.grantMaterialsForCompletion("c1", "a-none"))?.materialId).toBe("timber");
  });

  it("an unknown assignment mints nothing", async () => {
    const s = await isolate();
    expect(await s.grantMaterialsForCompletion("c1", "missing")).toBeNull();
    expect(await rows()).toHaveLength(0);
  });
});

describe("loadMaterialLedger", () => {
  it("returns earned rows with createdAt in epoch seconds, oldest first, ties broken by id", async () => {
    await pool.query(
      `INSERT INTO realm_material (id, child_id, material_id, amount, kind, source_assignment_id, created_at) VALUES
        ('z', 'c1', 'stone', 1, 'earned', 'a1', 1000),
        ('b', 'c1', 'ink', 2, 'earned', 'a2', 2000),
        ('a', 'c1', 'herbs', 1, 'earned', 'a3', 2000),
        ('o', 'c2', 'stone', 1, 'earned', 'a4', 1500)`,
    );
    const s = await isolate();
    const ledger = await s.loadMaterialLedger("c1");
    expect(ledger.map((r) => r.sourceAssignmentId)).toEqual(["a1", "a3", "a2"]);
    expect(ledger[0]).toEqual({ materialId: "stone", amount: 1, kind: "earned", sourceAssignmentId: "a1", createdAt: 1000 });
  });
});
