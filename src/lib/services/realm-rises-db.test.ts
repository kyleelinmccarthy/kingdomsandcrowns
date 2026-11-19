// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { KINGDOM_PROGRESS_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * Which buildings the world still has to show rising, read from a REAL libsql database: complete
 * (`completed_at`) and not yet announced (`announced_at`), in the kingdom's own order, and whether
 * the hero's buildings were completed by the retro-completion migration (`regraded_at`).
 */
const client = testDatabase("realm-rises-db");
vi.mock("@/lib/db", () => ({ db: client.db }));

const { loadRises } = await import("./realm-rises");

let n = 0;
async function site(childId: string, buildingId: string, completedAt: number | null, announcedAt: number | null): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, announced_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, 1, ?4, ?5, unixepoch(), unixepoch())`,
    [`kp${n}`, childId, buildingId, completedAt, announcedAt],
  );
}
async function settings(childId: string, regradedAt: number | null): Promise<void> {
  n += 1;
  await client.query(
    `INSERT INTO realm_settings (id, child_id, regraded_at, created_at, updated_at) VALUES (?1, ?2, ?3, unixepoch(), unixepoch())`,
    [`rs${n}`, childId, regradedAt],
  );
}

beforeAll(async () => {
  for (const sql of [...KINGDOM_PROGRESS_DDL, ...REALM_SETTINGS_DDL]) await client.query(sql);
});
beforeEach(async () => {
  await client.query("DELETE FROM kingdom_progress");
  await client.query("DELETE FROM realm_settings");
});
afterAll(async () => {
  client.close();
});

describe("loadRises", () => {
  it("lists the complete, unannounced buildings of this hero in the kingdom's order, not the insertion order", async () => {
    await site("c1", "garden", 1_700_000_000, null);
    await site("c1", "mill", 1_700_000_000, null);
    await site("c1", "well", 1_700_000_000, 1_700_000_100);
    await site("c1", "bridge", null, null);
    await site("c2", "chapel", 1_700_000_000, null);
    expect(await loadRises("c1")).toEqual({ unannounced: ["mill", "garden"], regraded: false });
  });

  it("drops a building the catalog no longer has, rather than offering the world a site it cannot draw", async () => {
    await site("c1", "lighthouse", 1_700_000_000, null);
    await site("c1", "well", 1_700_000_000, null);
    expect((await loadRises("c1")).unannounced).toEqual(["well"]);
  });

  it("says whether the retro-completion migration flagged the hero, and false when there is no settings row yet", async () => {
    expect((await loadRises("c1")).regraded).toBe(false);
    await settings("c1", 1_700_000_000);
    await settings("c2", null);
    expect((await loadRises("c1")).regraded).toBe(true);
    expect((await loadRises("c2")).regraded).toBe(false);
  });

  it("takes regraded from a settings row it is handed, rather than reading its own (M-5)", async () => {
    await settings("c1", null);
    await site("c1", "well", 1_700_000_000, null);
    expect(await loadRises("c1", Promise.resolve({ regradedAt: new Date(1_700_000_000_000) }))).toEqual({ unannounced: ["well"], regraded: true });
    expect((await loadRises("c1", Promise.resolve(null))).regraded).toBe(false);
  });

  it("is nothing for a hero with no kingdom yet", async () => {
    expect(await loadRises("c1")).toEqual({ unannounced: [], regraded: false });
  });
});
