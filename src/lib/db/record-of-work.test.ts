// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { testDatabase } from "@/test/libsql-test-db";
import { KINGDOM_PROGRESS_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { deedsForBuilding } from "@/lib/utils/deeds";
import { RECORD_OF_WORK_SQL, RECORD_OF_WORK_STATEMENTS } from "./record-of-work";

/**
 * Migration 0042's data step (D13.5), against a real libsql database: rows already complete are
 * marked announced; rows the new rule finishes (each story of the building once, with a star, on a
 * side-quest run) are completed and left for the world to announce; those heroes are flagged.
 */
const MIGRATIONS = join(__dirname, "migrations");
const client = testDatabase("record-of-work");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/services/realm-play", async () => ({
  ...(await vi.importActual<typeof import("@/lib/services/realm-play")>("@/lib/services/realm-play")),
  loadRealmSettings: vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS })),
}));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: async () => null }));

const { loadKingdomOverview } = await import("@/lib/services/deeds");

const DDL = [
  `CREATE TABLE deed_run (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, deed_id text, completed_at integer,
    stars integer DEFAULT 0 NOT NULL, kind text DEFAULT 'deed' NOT NULL, flawless integer DEFAULT false NOT NULL)`,
  ...KINGDOM_PROGRESS_DDL,
  ...REALM_SETTINGS_DDL,
  // The columns the overview's hero reads use (`loadHeroLevels`, `loadHeroName`).
  `CREATE TABLE child (id text PRIMARY KEY, display_name text NOT NULL, grade text, birth_year integer, age_mode text DEFAULT 'elementary' NOT NULL)`,
];

const DAY = 86_400;
const T0 = 1_776_000_000; // April 2026, in seconds

let n = 0;
async function run(childId: string, deedId: string, stars: number, at: number | null, kind = "deed"): Promise<void> {
  n += 1;
  await client.query("INSERT INTO deed_run (id, child_id, deed_id, completed_at, stars, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", [`r${n}`, childId, deedId, at, stars, kind]);
}
async function progress(childId: string, buildingId: string, deedsDone: number, completedAt: number | null = null): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
    [`kp${n}`, childId, buildingId, deedsDone, completedAt, T0],
  );
}
async function settings(childId: string): Promise<void> {
  await client.query("INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES (?1, ?2, unixepoch(), unixepoch())", [`s-${childId}`, childId]);
}
type Row = { completed_at: number | null; announced_at: number | null; raised_by_name: string | null; raised_season_id: string | null };
async function row(childId: string, buildingId: string): Promise<Row> {
  const r = await client.query("SELECT completed_at, announced_at, raised_by_name, raised_season_id FROM kingdom_progress WHERE child_id = ?1 AND building_id = ?2", [childId, buildingId]);
  return r.rows[0];
}
async function regradedAt(childId: string): Promise<number | null> {
  return (await client.query("SELECT regraded_at FROM realm_settings WHERE child_id = ?1", [childId])).rows[0].regraded_at;
}
async function migrate(): Promise<void> {
  for (const statement of RECORD_OF_WORK_STATEMENTS) await client.query(statement);
}

describe("the record-of-the-work migration SQL", () => {
  it("is pasted verbatim into migration 0042", () => {
    const file = readdirSync(MIGRATIONS).find((f) => f.startsWith("0042_") && f.endsWith(".sql"));
    expect(file).toBeDefined();
    expect(readFileSync(join(MIGRATIONS, file!), "utf8")).toContain(RECORD_OF_WORK_SQL);
  });

  it("is the statements, split where drizzle splits them", () => {
    expect(RECORD_OF_WORK_SQL.split("--> statement-breakpoint").map((s) => s.trim())).toEqual(RECORD_OF_WORK_STATEMENTS.map((s) => s.trim()));
    // Announce what already stood first, then complete, then flag: the order the flags rely on.
    expect(RECORD_OF_WORK_STATEMENTS[0]).toMatch(/SET announced_at = completed_at/);
    expect(RECORD_OF_WORK_STATEMENTS.at(-1)).toMatch(/UPDATE realm_settings/);
    expect(RECORD_OF_WORK_STATEMENTS).toHaveLength(BUILDINGS.length + 2);
  });

  it("names exactly each building's stories and count, as the catalog has them, so it cannot drift", () => {
    const written = new Map<string, { ids: string[][]; counts: number[] }>();
    for (const statement of RECORD_OF_WORK_STATEMENTS) {
      const building = statement.match(/WHERE building_id = '([a-z]+)'/)?.[1];
      if (!building) continue;
      const ids = [...statement.matchAll(/deed_id IN \(([^)]*)\)/g)].map((m) => m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort());
      const counts = [...statement.matchAll(/\) >= (\d+);?\s*$/gm)].map((m) => Number(m[1]));
      written.set(building, { ids, counts });
    }
    expect([...written.keys()].sort()).toEqual(BUILDINGS.map((b) => b.id).sort());
    for (const b of BUILDINGS) {
      const stories = deedsForBuilding(b.id).map((d) => d.id).sort();
      const w = written.get(b.id)!;
      // Both the dating subquery and the counting subquery name the same stories.
      expect(w.ids, b.id).toEqual([stories, stories]);
      expect(w.counts, b.id).toEqual([b.deedsToBuild]);
      expect(b.deedsToBuild, b.id).toBe(stories.length);
    }
  });

  it("counts only finished side-quest runs with a star, in seconds", () => {
    for (const statement of RECORD_OF_WORK_STATEMENTS.slice(1, -1)) {
      expect(statement.match(/dr\.kind = 'deed' AND dr\.stars >= 1 AND dr\.completed_at IS NOT NULL/g)).toHaveLength(2);
    }
    expect(RECORD_OF_WORK_SQL).toContain("CAST(strftime('%s','now') AS INTEGER)");
    expect(RECORD_OF_WORK_SQL).not.toMatch(/unixepoch|\* 1000/);
  });

  describe("against libsql", () => {
    beforeAll(async () => {
      for (const sql of DDL) await client.query(sql);
    });
    beforeEach(async () => {
      for (const t of ["deed_run", "kingdom_progress", "realm_settings", "child"]) await client.query(`DELETE FROM ${t}`);
    });
    afterAll(() => client.close());

    it("completes a site whose stories were each done once with a star, dated by its last such run, unannounced and unnamed", async () => {
      await settings("ada");
      await run("ada", "bridge-planks", 1, T0);
      await run("ada", "bridge-toll", 2, T0 + DAY);
      await run("ada", "bridge-toll", 3, T0 + 2 * DAY);
      await progress("ada", "bridge", 3);
      await migrate();
      expect(await row("ada", "bridge")).toEqual({ completed_at: T0 + 2 * DAY, announced_at: null, raised_by_name: null, raised_season_id: null });
      expect(await regradedAt("ada")).toBeGreaterThan(T0);
    });

    it("needs every story of the building: two of the well's three do not finish it", async () => {
      await settings("ada");
      await run("ada", "well-stones", 3, T0);
      await run("ada", "well-signs", 1, T0);
      await run("ada", "well-stones", 2, T0 + DAY);
      await progress("ada", "well", 3);
      await migrate();
      expect((await row("ada", "well")).completed_at).toBeNull();
      expect(await regradedAt("ada")).toBeNull();
    });

    it("never counts a starless run, an unfinished one, or a Crown Challenge", async () => {
      await settings("bo");
      await run("bo", "market-prices", 2, T0);
      await run("bo", "market-crier", 0, T0); // a starless replay
      await run("bo", "market-crier", 3, null); // never finished
      await run("bo", "market-crier", 3, T0, "challenge");
      await progress("bo", "market", 4);
      await migrate();
      expect((await row("bo", "market")).completed_at).toBeNull();
      expect(await regradedAt("bo")).toBeNull();
    });

    it("marks a site that already stood as announced at its own date, and flags no one for it", async () => {
      await settings("cy");
      await progress("cy", "chapel", 5, T0 - 30 * DAY);
      await migrate();
      expect(await row("cy", "chapel")).toMatchObject({ completed_at: T0 - 30 * DAY, announced_at: T0 - 30 * DAY });
      expect(await regradedAt("cy")).toBeNull();
    });

    // Drizzle applies a migration once. Were it ever run again, step 1 would mark the retro rows
    // announced (it cannot tell them from rows that stood before); nothing is re-dated or re-flagged.
    it("a second run dates nothing again, and keeps a hero's first flag", async () => {
      await settings("ada");
      await run("ada", "garden-beds", 1, T0);
      await run("ada", "garden-bees", 1, T0);
      await progress("ada", "garden", 2);
      await progress("ada", "chapel", 5, T0 - DAY);
      await migrate();
      const snapshot = async () => (await client.query("SELECT building_id, completed_at FROM kingdom_progress ORDER BY building_id")).rows;
      const before = await snapshot();
      const flagged = await regradedAt("ada");
      await client.query("UPDATE realm_settings SET regraded_at = ?1 WHERE child_id = 'ada'", [T0]);
      await migrate();
      expect(await snapshot()).toEqual(before);
      expect(flagged).not.toBeNull();
      expect(await regradedAt("ada")).toBe(T0);
    });

    it("a hero with no settings row is completed all the same", async () => {
      await run("dee", "watchtower-height", 1, T0);
      await run("dee", "watchtower-signals", 1, T0);
      await progress("dee", "watchtower", 2);
      await migrate();
      expect((await row("dee", "watchtower")).completed_at).toBe(T0);
    });

    it("a building the migration raised reads as raised by the hero's live name, on the date of its work", async () => {
      await client.query("INSERT INTO child (id, display_name, grade) VALUES ('ada', 'Ada', '3')");
      await settings("ada");
      await run("ada", "bridge-planks", 1, T0);
      await run("ada", "bridge-toll", 1, T0 + DAY);
      await progress("ada", "bridge", 2);
      await migrate();
      const { buildings } = await loadKingdomOverview("ada");
      expect(buildings.find((b) => b.id === "bridge")).toMatchObject({ complete: true, done: 2, total: 2, raisedBy: "Ada", raisedAt: T0 + DAY });
      expect(buildings.find((b) => b.id === "well")).toMatchObject({ complete: false, raisedBy: null, raisedAt: null });
    });
  });
});
