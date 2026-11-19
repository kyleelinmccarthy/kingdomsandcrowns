// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { KINGDOM_PROGRESS_DDL, REALM_IMPROVEMENT_DDL, REALM_LEDGER_DDL, REALM_MATERIAL_DDL, REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";

/**
 * What a finished quest made, read from a REAL libsql database: the "+1 Ink · the Chronicle Hall
 * needs 3 more" line and the minutes the quest earned. The deed_run table has only the columns the
 * plan input reads (it needs them to know which buildings stand).
 */
const pool = testDatabase("realm-quest-rewards-db");
vi.mock("@/lib/db", () => ({ db: pool.db }));

type Services = typeof import("@/lib/services/realm-materials");
let svc: Services;

const DDL = [
  ...REALM_SETTINGS_DDL,
  ...REALM_MATERIAL_DDL,
  ...REALM_IMPROVEMENT_DDL,
  ...REALM_LEDGER_DDL,
  ...KINGDOM_PROGRESS_DDL,
  `CREATE TABLE deed_run (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, deed_id text, kind text DEFAULT 'deed' NOT NULL, stars integer DEFAULT 0 NOT NULL, flawless integer DEFAULT false NOT NULL, completed_at integer)`,
];
const TABLES = ["realm_settings", "realm_material", "realm_improvement", "realm_play_ledger", "kingdom_progress", "deed_run"];

beforeAll(async () => {
  for (const sql of DDL) await pool.query(sql);
  svc = await import("@/lib/services/realm-materials");
});
beforeEach(async () => {
  for (const t of TABLES) await pool.query(`DELETE FROM ${t}`);
});
afterAll(async () => {
  pool.close();
});

let n = 0;
async function earn(child: string, material: string, amount: number, assignment: string): Promise<void> {
  n += 1;
  await pool.query(
    `INSERT INTO realm_material (id, child_id, material_id, amount, kind, origin, source_assignment_id, created_at) VALUES (?1, ?2, ?3, ?4, 'earned', 'quest', ?5, ?6)`,
    [`m${n}`, child, material, amount, assignment, 1000 + n],
  );
}
async function minutes(child: string, assignment: string, mins: number, kind = "earned"): Promise<void> {
  n += 1;
  await pool.query(
    `INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, source_assignment_id, created_at) VALUES (?1, ?2, '2026-11-19', ?3, ?4, ?5, 1)`,
    [`l${n}`, child, kind, mins, assignment],
  );
}
async function settings(child: string, set: { pinned?: string; showMinutes?: boolean }): Promise<void> {
  await pool.query(
    `INSERT INTO realm_settings (id, child_id, show_minutes_on_quests, pinned_plan, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, 1)`,
    [`s-${child}`, child, set.showMinutes ? 1 : 0, set.pinned ?? null],
  );
}

describe("loadQuestRewards", () => {
  it("is an empty map for no ids", async () => {
    expect(await svc.loadQuestRewards("c1", [])).toEqual({});
  });

  it("says what the quest made and where the pinned plan stands", async () => {
    await settings("c1", { pinned: "village-statue" });
    await earn("c1", "ink", 1, "a1");
    // The Statue costs 4 stone and 2 ink: one ink in hand leaves 1 ink to find.
    expect(await svc.loadQuestRewards("c1", ["a1"])).toEqual({ a1: { made: "+1 Ink · the Statue needs 1 more", minutes: null } });
  });

  it("falls back to the nearest plan that wants the material when nothing is pinned", async () => {
    await settings("c1", {});
    await earn("c1", "dye", 1, "a1");
    await earn("c1", "stone", 2, "a2");
    // With 1 dye and 2 stone, the Banners (3 more dye), the Fountain and the Statue (each a secondary
    // share any material can pay, RD-t) want dye, all 3 short in all: the Banners come first.
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+1 Dye · the Banners need 3 more");
  });

  it("falls back from a pin that does not want the material", async () => {
    // The Chronicle Hall is short only of its own ink, which dye cannot pay for.
    await settings("c1", { pinned: "chronicle-hall" });
    await earn("c1", "dye", 1, "a1");
    await earn("c1", "stone", 2, "a2");
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+1 Dye · the Banners need 3 more");
  });

  it("names a pinned plan whose secondary share the material can pay (RD-t)", async () => {
    await settings("c1", { pinned: "village-lamps" });
    await earn("c1", "dye", 1, "a1");
    // The Lamps want 4 thread and 2 stone; the dye pays a stone, so 1 more.
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+1 Dye · the Lamps need 1 more");
  });

  it("ignores a pin on a plan that is fully built", async () => {
    await settings("c1", { pinned: "village-statue" });
    for (const level of [1, 2, 3]) {
      await pool.query(
        `INSERT INTO realm_improvement (id, child_id, improvement_id, level, stars, built_by_name, sources, built_at) VALUES (?1, 'c1', 'village-statue', ?2, 1, 'Ada', '[]', 1)`,
        [`i${level}`, level],
      );
    }
    await earn("c1", "ink", 1, "a1");
    // The Chronicle Hall (4 ink, 2 stone) is the nearest plan that still wants ink: 3 more.
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+1 Ink · the Chronicle Hall needs 3 more");
  });

  it("points timber at the nearest short plan overall, with its whole shortfall", async () => {
    await settings("c1", {});
    await earn("c1", "timber", 1, "a1");
    // Every plan costs 6 across two materials; a timber covers one of them, so 5 more. The Chronicle Hall is first in catalog order.
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+1 Timber · the Chronicle Hall needs 5 more");
  });

  it("has no hint when no plan needs what was made", async () => {
    await settings("c1", {});
    await earn("c1", "herbs", 6, "a1");
    // Six herbs build the Fountain outright (4 herbs, and herbs pay its 2 stone); every other plan
    // is short only of its own primary, which herbs cannot pay (RD-t).
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toBe("+6 Herbs");
  });

  it("reads the minutes a quest earned only when the setting is on", async () => {
    await settings("c1", {});
    await earn("c1", "ink", 1, "a1");
    await minutes("c1", "a1", 5);
    await minutes("c1", "a1", 2);
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.minutes).toBeNull();

    await pool.query("UPDATE realm_settings SET show_minutes_on_quests = 1 WHERE child_id = 'c1'");
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.minutes).toBe(7);
  });

  it("counts only earned minutes, and none for a quest that paid none", async () => {
    await settings("c1", { showMinutes: true });
    await earn("c1", "ink", 1, "a1");
    await earn("c1", "ink", 1, "a2");
    await minutes("c1", "a1", 5);
    await minutes("c1", "a1", 3, "bonus");
    expect(await svc.loadQuestRewards("c1", ["a1", "a2"])).toMatchObject({ a1: { minutes: 5 }, a2: { minutes: null } });
  });

  it("ignores another hero's rows", async () => {
    await settings("c1", { showMinutes: true });
    await settings("c2", { showMinutes: true });
    await earn("c2", "ink", 1, "a-other");
    await minutes("c2", "a-other", 5);
    const out = await svc.loadQuestRewards("c1", ["a-other"]);
    expect(out["a-other"]).toEqual({ made: null, minutes: null });
  });

  it("answers every id asked about with one entry, and no others", async () => {
    await settings("c1", {});
    await earn("c1", "ink", 1, "a1");
    await earn("c1", "ink", 1, "a2");
    const out = await svc.loadQuestRewards("c1", ["a1", "a3"]);
    expect(Object.keys(out).sort()).toEqual(["a1", "a3"]);
    expect(out.a3).toEqual({ made: null, minutes: null });
  });

  it("reads nothing about the kingdom or the settings when they are handed in: the line and the minutes follow what it was given", async () => {
    // The database says: Statue pinned, minutes off. What is handed in says otherwise.
    await settings("c1", { pinned: "village-statue" });
    await earn("c1", "ink", 1, "a1");
    await minutes("c1", "a1", 5);
    const known = {
      materialsPerQuest: 1, enabled: true, showMinutes: true, pinned: "village-banners",
      built: {}, raised: [], balance: { stone: 0, ink: 1, herbs: 0, thread: 0, dye: 0, timber: 0 },
    };
    // The pin handed in is the Banners, whose thread share the ink pays for (RD-t), so 1 more: not the Statue the database pins.
    expect(await svc.loadQuestRewards("c1", ["a1"], known)).toEqual({ a1: { made: "+1 Ink · the Banners need 1 more", minutes: 5 } });
    // And with minutes off in what was handed in, none are read.
    expect((await svc.loadQuestRewards("c1", ["a1"], { ...known, showMinutes: false })).a1.minutes).toBeNull();
  });

  it("works for a hero with no settings row", async () => {
    await earn("c1", "stone", 1, "a1");
    expect((await svc.loadQuestRewards("c1", ["a1"])).a1.made).toMatch(/^\+1 Stone · /);
  });
});

describe("loadPlanCardData", () => {
  it("is the defaults for a hero with nothing, and creates no settings row", async () => {
    const d = await svc.loadPlanCardData("c1");
    expect(d).toMatchObject({ materialsPerQuest: 1, enabled: true, showMinutes: false, pinned: null, built: {}, raised: [] });
    expect(d.balance).toEqual({ stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 });
    expect(Number((await pool.query("SELECT count(*) AS n FROM realm_settings")).rows[0].n)).toBe(0);
  });

  it("carries the pin, the setting, the built levels, the standing buildings and the satchel", async () => {
    await pool.query("INSERT INTO realm_settings (id, child_id, enabled, show_minutes_on_quests, materials_per_quest, pinned_plan, created_at, updated_at) VALUES ('s', 'c1', 0, 1, 0, 'village-banners', 1, 1)");
    await earn("c1", "dye", 3, "a1");
    await pool.query(
      `INSERT INTO realm_improvement (id, child_id, improvement_id, level, stars, built_by_name, sources, built_at) VALUES ('i1', 'c1', 'village-lamps', 2, 1, 'Ada', '[]', 1)`,
    );
    await pool.query(
      `INSERT INTO kingdom_progress (id, child_id, building_id, deeds_done, completed_at, created_at, updated_at) VALUES ('k1', 'c1', 'library', 0, 5, 1, 1)`,
    );
    expect(await svc.loadPlanCardData("c1")).toMatchObject({
      materialsPerQuest: 0,
      enabled: false,
      showMinutes: true,
      pinned: "village-banners",
      built: { "village-lamps": 2 },
      raised: ["library"],
      balance: { dye: 3, stone: 0 },
    });
  });

  it("ignores another hero's rows", async () => {
    await earn("c2", "dye", 3, "a-other");
    expect((await svc.loadPlanCardData("c1")).balance.dye).toBe(0);
  });
});
