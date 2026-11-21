// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";

/**
 * A grown-up's settings save, against a real libsql database: the `mechanics` switches are one
 * JSON column, so a patch is merged over the stored switches and written as text, never spread
 * into the UPDATE as an object.
 */
const client = testDatabase("realm-settings");
const testDb = client.db;

let actor = { userId: "u-mom" };
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: actor, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { updateRealmSettings, getRealmSettings } = await import("./realm-settings");

const storedMechanics = async (): Promise<unknown> => (await client.query("SELECT mechanics FROM realm_settings WHERE child_id = 'c1'")).rows[0]?.mechanics;

beforeAll(async () => {
  for (const sql of REALM_SETTINGS_DDL) await client.query(sql);
});

beforeEach(async () => {
  await client.query("DELETE FROM realm_settings");
  actor = { userId: "u-mom" };
});

afterAll(async () => {
  client.close();
});

describe("updateRealmSettings and the mechanics switches", () => {
  it("reads all on for a hero who has never set them", async () => {
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: true, lock: true, trail: true });
    expect(await storedMechanics()).toBeNull();
  });

  it("stores a switched-off kind as JSON text, and reads it back", async () => {
    await updateRealmSettings("c1", { mechanics: { measure: false } });
    expect(await storedMechanics()).toBe('{"measure":false,"lock":true,"trail":true}');
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: false, lock: true, trail: true });
  });

  it("merges over what is stored: switching it back on, and leaving every other setting alone", async () => {
    await updateRealmSettings("c1", { secondChances: false, mechanics: { measure: false } });
    await updateRealmSettings("c1", { sideQuestLength: 5 });
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: false, lock: true, trail: true });
    await updateRealmSettings("c1", { mechanics: { measure: true } });
    expect(await storedMechanics()).toBe('{"measure":true,"lock":true,"trail":true}');
    const s = await getRealmSettings("c1");
    expect(s).toEqual({ ...DEFAULT_REALM_SETTINGS, secondChances: false, sideQuestLength: 5, mechanics: { measure: true, lock: true, trail: true } });
  });

  it("switches the locks alone, and a row stored before locks existed reads them on", async () => {
    await updateRealmSettings("c1", { secondChances: false });
    await client.query(`UPDATE realm_settings SET mechanics = '{"measure":false}' WHERE child_id = 'c1'`);
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: false, lock: true, trail: true });
    await updateRealmSettings("c1", { mechanics: { lock: false } });
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: false, lock: false, trail: true });
    await updateRealmSettings("c1", { mechanics: { lock: true } });
    expect((await getRealmSettings("c1")).mechanics).toEqual({ measure: false, lock: true, trail: true });
  });

  it("refuses an unknown kind or a non-boolean before any write", async () => {
    await expect(updateRealmSettings("c1", { mechanics: { origami: true } } as never)).rejects.toThrow(/mechanics/);
    await expect(updateRealmSettings("c1", { mechanics: { measure: "off" } } as never)).rejects.toThrow(/mechanics/);
    expect(await storedMechanics()).toBeUndefined(); // not even the settings row was made
  });

  it("round-trips the two real-work dials, and reads them as 1 and off for a hero who never set them", async () => {
    const fresh = await getRealmSettings("c1");
    expect(fresh.materialsPerQuest).toBe(1);
    expect(fresh.showMinutesOnQuests).toBe(false);
    await updateRealmSettings("c1", { materialsPerQuest: 3, showMinutesOnQuests: true });
    const s = await getRealmSettings("c1");
    expect(s.materialsPerQuest).toBe(3);
    expect(s.showMinutesOnQuests).toBe(true);
    await updateRealmSettings("c1", { materialsPerQuest: 0 });
    expect((await getRealmSettings("c1")).materialsPerQuest).toBe(0);
    expect((await getRealmSettings("c1")).showMinutesOnQuests).toBe(true);
  });

  it("refuses a pinned plan as a setting, and a count out of range, before any write", async () => {
    await expect(updateRealmSettings("c1", { pinnedPlan: "x" } as never)).rejects.toThrow("Unknown Realm setting: pinnedPlan");
    await expect(updateRealmSettings("c1", { materialsPerQuest: 4 })).rejects.toThrow("Materials per quest must be 0–3.");
  });

  it("is a grown-up's switch alone: the hero cannot turn a mechanic off", async () => {
    actor = { userId: "child:c1" };
    await expect(updateRealmSettings("c1", { mechanics: { measure: false } })).rejects.toThrow("Only a grown-up");
  });
});
