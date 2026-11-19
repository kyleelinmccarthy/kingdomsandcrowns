// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_MATERIAL_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";
import { parseArgs, welcomeMaterials } from "./welcome-materials";

/**
 * The welcome delivery against a REAL libsql database: quests finished before materials shipped
 * get their materials once, and a second run changes nothing.
 */
const pool = testDatabase("welcome-materials");

// Only the columns the script reads: drizzle selects what it is asked for.
const DDL = [
  ...REALM_SETTINGS_DDL,
  ...REALM_MATERIAL_DDL,
  `CREATE TABLE quest_assignment (id text PRIMARY KEY NOT NULL, quest_id text NOT NULL, child_id text NOT NULL, status text NOT NULL, completed_at integer)`,
  `CREATE TABLE quest (id text PRIMARY KEY NOT NULL, subject_id text)`,
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, name text NOT NULL, material text)`,
];

const NOW = new Date("2026-11-19T12:00:00Z");
const DAY = 86_400;
const nowSec = Math.floor(NOW.getTime() / 1000);

beforeAll(async () => {
  for (const sql of DDL) await pool.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_material", "quest_assignment", "quest", "subject"]) await pool.query(`DELETE FROM ${t}`);
  await pool.query("INSERT INTO subject (id, name, material) VALUES ('sub-math', 'Math', NULL), ('sub-art', 'Sketching', 'dye')");
  await pool.query("INSERT INTO quest (id, subject_id) VALUES ('q-math', 'sub-math'), ('q-art', 'sub-art'), ('q-none', NULL)");
});

afterAll(async () => {
  pool.close();
});

async function assign(id: string, questId: string, childId: string, status: string, completedDaysAgo: number | null) {
  await pool.query("INSERT INTO quest_assignment (id, quest_id, child_id, status, completed_at) VALUES (?1, ?2, ?3, ?4, ?5)", [
    id,
    questId,
    childId,
    status,
    completedDaysAgo === null ? null : nowSec - completedDaysAgo * DAY,
  ]);
}

async function setMaterialsPerQuest(childId: string, n: number) {
  await pool.query("INSERT INTO realm_settings (id, child_id, materials_per_quest, created_at, updated_at) VALUES (?1, ?2, ?3, unixepoch(), unixepoch())", [
    `s-${childId}`,
    childId,
    n,
  ]);
}

async function ledger() {
  const r = await pool.query("SELECT child_id, material_id, amount, kind, origin, source_assignment_id, created_at FROM realm_material ORDER BY source_assignment_id");
  return r.rows as { child_id: string; material_id: string; amount: number; kind: string; origin: string; source_assignment_id: string; created_at: number }[];
}

describe("parseArgs", () => {
  it("defaults to a real run over 28 days", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, days: 28 });
  });

  it("reads --dry-run, and --days as two words or with an equals sign", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ dryRun: true, days: 28 });
    expect(parseArgs(["--days", "7"])).toEqual({ dryRun: false, days: 7 });
    expect(parseArgs(["--days=7", "--dry-run"])).toEqual({ dryRun: true, days: 7 });
  });

  it("needs --days to be a positive whole number", () => {
    for (const bad of [["--days", "0"], ["--days", "-1"], ["--days", "abc"], ["--days", "1.5"], ["--days"], ["--days="], ["--days=abc"]]) {
      expect(() => parseArgs(bad), bad.join(" ")).toThrow(/--days/);
    }
  });

  it("refuses a mistyped flag rather than guessing, so a typo never does a real write", () => {
    expect(() => parseArgs(["--dryrun"])).toThrow("Unknown option: --dryrun");
    expect(() => parseArgs(["--dry-run", "--frobnicate"])).toThrow("Unknown option: --frobnicate");
    expect(() => parseArgs(["7"])).toThrow("Unknown option: 7");
  });
});

describe("welcomeMaterials", () => {
  it("mints a recent completion once, as a welcome earning stamped with the run time", async () => {
    await assign("a1", "q-math", "c1", "completed", 3);
    const out = await welcomeMaterials(pool.db, { now: NOW });
    expect(out).toEqual({ perChild: { c1: 1 }, total: 1 });
    expect(await ledger()).toEqual([
      { child_id: "c1", material_id: "stone", amount: 1, kind: "earned", origin: "welcome", source_assignment_id: "a1", created_at: nowSec },
    ]);
  });

  it("skips a completion older than 28 days and keeps the boundary inclusive", async () => {
    await assign("old", "q-math", "c1", "completed", 29);
    await assign("edge", "q-math", "c1", "completed", 28);
    const out = await welcomeMaterials(pool.db, { now: NOW });
    expect(out.total).toBe(1);
    expect((await ledger()).map((r) => r.source_assignment_id)).toEqual(["edge"]);
  });

  it("honours --days", async () => {
    await assign("a1", "q-math", "c1", "completed", 10);
    expect((await welcomeMaterials(pool.db, { now: NOW, days: 7 })).total).toBe(0);
    expect((await welcomeMaterials(pool.db, { now: NOW, days: 14 })).total).toBe(1);
  });

  it("skips quests that are not completed", async () => {
    await assign("p", "q-math", "c1", "pending", null);
    await assign("s", "q-math", "c1", "skipped", 2);
    await assign("x", "q-math", "c1", "excused", 2);
    expect(await welcomeMaterials(pool.db, { now: NOW })).toEqual({ perChild: {}, total: 0 });
    expect(await ledger()).toEqual([]);
  });

  it("skips an assignment that already has an earned row", async () => {
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-math", "c1", "completed", 2);
    await pool.query(
      "INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at) VALUES ('m1', 'c1', 'stone', 2, 'earned', 'quest', 'a1', ?1)",
      [nowSec - 100],
    );
    const out = await welcomeMaterials(pool.db, { now: NOW });
    expect(out).toEqual({ perChild: { c1: 1 }, total: 1 });
    const rows = await ledger();
    expect(rows.find((r) => r.source_assignment_id === "a1")).toMatchObject({ origin: "quest", amount: 2 });
    expect(rows.find((r) => r.source_assignment_id === "a2")).toMatchObject({ origin: "welcome" });
  });

  it("a dry run writes nothing but reports the counts", async () => {
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-art", "c2", "completed", 1);
    const out = await welcomeMaterials(pool.db, { now: NOW, dryRun: true });
    expect(out).toEqual({ perChild: { c1: 1, c2: 1 }, total: 2 });
    expect(await ledger()).toEqual([]);
  });

  it("a second run is a no-op", async () => {
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-art", "c1", "completed", 2);
    expect((await welcomeMaterials(pool.db, { now: NOW })).total).toBe(2);
    const before = await ledger();
    expect(await welcomeMaterials(pool.db, { now: new Date(NOW.getTime() + 60_000) })).toEqual({ perChild: {}, total: 0 });
    expect(await ledger()).toEqual(before);
  });

  it("mints nothing for a child whose materialsPerQuest is 0, and the setting's amount for another", async () => {
    await setMaterialsPerQuest("c1", 0);
    await setMaterialsPerQuest("c2", 3);
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-math", "c2", "completed", 1);
    const out = await welcomeMaterials(pool.db, { now: NOW });
    expect(out).toEqual({ perChild: { c2: 1 }, total: 1 });
    expect(await ledger()).toMatchObject([{ child_id: "c2", amount: 3 }]);
  });

  it("a child with no settings row gets the default amount, whatever access the settings would say", async () => {
    await pool.query("INSERT INTO realm_settings (id, child_id, enabled, access_mode, created_at, updated_at) VALUES ('sx', 'c1', 0, 'scheduled', unixepoch(), unixepoch())");
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-math", "c2", "completed", 1);
    expect((await welcomeMaterials(pool.db, { now: NOW })).perChild).toEqual({ c1: 1, c2: 1 });
    expect((await ledger()).map((r) => r.amount)).toEqual([1, 1]);
  });

  it("uses a subject's explicit material, its name's default, and timber for no subject", async () => {
    await assign("a-art", "q-art", "c1", "completed", 1);
    await assign("a-math", "q-math", "c1", "completed", 1);
    await assign("a-none", "q-none", "c1", "completed", 1);
    await welcomeMaterials(pool.db, { now: NOW });
    const byAssignment = Object.fromEntries((await ledger()).map((r) => [r.source_assignment_id, r.material_id]));
    expect(byAssignment).toEqual({ "a-art": "dye", "a-math": "stone", "a-none": "timber" });
  });

  it("a dry run for a child whose materialsPerQuest is 0 reports nothing", async () => {
    await setMaterialsPerQuest("c1", 0);
    await assign("a1", "q-math", "c1", "completed", 1);
    expect(await welcomeMaterials(pool.db, { now: NOW, dryRun: true })).toEqual({ perChild: {}, total: 0 });
  });

  it("does not count an earning that lands between its select and its insert", async () => {
    await assign("a1", "q-math", "c1", "completed", 1);
    await assign("a2", "q-math", "c1", "completed", 1);
    // The live grant wins the race for a1: its earned row appears just before the script's insert runs.
    let raced = false;
    const racing = new Proxy(pool.db, {
      get(target, prop, receiver) {
        if (prop !== "insert") return Reflect.get(target, prop, receiver);
        return (table: Parameters<typeof target.insert>[0]) => {
          const builder = target.insert(table);
          return {
            values: (v: { sourceAssignmentId: string }) => ({
              onConflictDoNothing: () => ({
                returning: (cols: Parameters<ReturnType<typeof builder.values>["returning"]>[0]) => {
                  const real = builder.values(v as never).onConflictDoNothing().returning(cols);
                  return {
                    then: async (res: (x: unknown) => unknown, rej: (e: unknown) => unknown) => {
                      if (!raced && v.sourceAssignmentId === "a1") {
                        raced = true;
                        await pool.query(
                          "INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at) VALUES ('live', 'c1', 'stone', 1, 'earned', 'quest', 'a1', ?1)",
                          [nowSec - 5],
                        );
                      }
                      return real.then(res, rej);
                    },
                  };
                },
              }),
            }),
          };
        };
      },
    });
    const out = await welcomeMaterials(racing as typeof pool.db, { now: NOW });
    expect(raced).toBe(true);
    expect(out).toEqual({ perChild: { c1: 1 }, total: 1 });
    expect((await ledger()).map((r) => [r.source_assignment_id, r.origin])).toEqual([
      ["a1", "quest"],
      ["a2", "welcome"],
    ]);
  });
});
