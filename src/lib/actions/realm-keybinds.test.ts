// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_SETTINGS_DDL } from "@/test/realm-db-ddl";
import { defaultKeymap, keymapFrom } from "@/lib/realm3d/keymap";

/**
 * The hero's keybinds, against a real libsql database. The gate is mocked as the actor: the hero,
 * or a grown-up with edit or view-only access. Its `write` rule is the real one — a view-only
 * member is refused a write — so a save that asks for write access fails here exactly as it does
 * in the app. Mirrors `realm-sound.test.ts`.
 */
const client = testDatabase("realm-keybinds");
const testDb = client.db;

type Actor = { userId: string; permission: "edit" | "view" };
let actor: Actor | null = { userId: "child:c1", permission: "edit" };
const requireChildAccess = vi.fn(async (_childId: string, opts?: { write?: boolean }) => {
  if (!actor) throw new Error("No access to this child.");
  if (opts?.write && actor.permission !== "edit") throw new Error("Read-only access — you do not have permission to make changes.");
  return { access: actor, familyId: "f1" };
});

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (childId: string, opts?: { write?: boolean }) => requireChildAccess(childId, opts),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { saveRealmKeybinds } = await import("./realm-keybinds");
const { loadRealmKeybinds } = await import("@/lib/services/realm-keybinds");

const DDL = [
  ...REALM_SETTINGS_DDL,
  `CREATE TABLE realm_visitor_keybinds (
    user_id text PRIMARY KEY NOT NULL, keybinds text, updated_at integer NOT NULL)`,
];

const mom: Actor = { userId: "u-mom", permission: "edit" };
const tutor: Actor = { userId: "u-tutor", permission: "view" };
const hero: Actor = { userId: "child:c1", permission: "edit" };
const wasd = { jump: ["KeyJ"], interact: ["KeyQ"] };

async function settingsKeybinds(): Promise<unknown> {
  const rows = (await client.query("SELECT keybinds FROM realm_settings WHERE child_id = 'c1'")).rows;
  return rows[0]?.keybinds;
}

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  await client.query("DELETE FROM realm_settings");
  await client.query("DELETE FROM realm_visitor_keybinds");
  requireChildAccess.mockClear();
  actor = hero;
});

afterAll(async () => {
  client.close();
});

describe("saveRealmKeybinds", () => {
  it("a hero's save writes their Realm's row, and loading with no visitor returns it", async () => {
    actor = hero;
    await saveRealmKeybinds("c1", wasd);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(JSON.parse(String(await settingsKeybinds()))).toEqual(wasd);
    const loaded = await loadRealmKeybinds("c1", null);
    expect(loaded.jump).toEqual(["KeyJ"]);
    expect(loaded.interact).toEqual(["KeyQ"]);
    expect(loaded).toEqual(keymapFrom(wasd));
  });

  it("a parent's save writes their own row and leaves the child's null", async () => {
    actor = hero;
    await saveRealmKeybinds("c1", {}); // makes the hero's row, all defaults
    actor = mom;
    await saveRealmKeybinds("c1", wasd);
    expect(await settingsKeybinds()).toBeNull();
    const rows = (await client.query("SELECT user_id, keybinds FROM realm_visitor_keybinds")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("u-mom");
    expect(await loadRealmKeybinds("c1", "u-mom")).toEqual(keymapFrom(wasd));
    expect(await loadRealmKeybinds("c1", null)).toEqual(defaultKeymap());
    expect(await loadRealmKeybinds("c1", "u-dad")).toEqual(defaultKeymap());
  });

  it("a view-only member can save their own", async () => {
    actor = tutor;
    await expect(saveRealmKeybinds("c1", wasd)).resolves.toBeUndefined();
    expect(requireChildAccess).toHaveBeenCalledWith("c1", undefined);
    expect(await loadRealmKeybinds("c1", "u-tutor")).toEqual(keymapFrom(wasd));
  });

  it("a reset stores null, on the visitor's row too, rather than deleting it", async () => {
    actor = mom;
    await saveRealmKeybinds("c1", wasd);
    await saveRealmKeybinds("c1", {});
    const rows = (await client.query("SELECT keybinds FROM realm_visitor_keybinds")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].keybinds).toBeNull();
    expect(await loadRealmKeybinds("c1", "u-mom")).toEqual(defaultKeymap());
  });

  it("garbage is stored cleaned: null, all defaults", async () => {
    actor = hero;
    await saveRealmKeybinds("c1", { jump: ["Escape"], hack: 1 });
    expect(await settingsKeybinds()).toBeNull();
    expect(await loadRealmKeybinds("c1", null)).toEqual(defaultKeymap());
    actor = mom;
    await saveRealmKeybinds("c1", "not even an object");
    const rows = (await client.query("SELECT keybinds FROM realm_visitor_keybinds")).rows;
    expect(rows[0].keybinds).toBeNull();
  });

  it("keeps an explicit empty list: an unbound action stays unbound", async () => {
    actor = hero;
    await saveRealmKeybinds("c1", { jump: [] });
    expect(JSON.parse(String(await settingsKeybinds()))).toEqual({ jump: [] });
    expect((await loadRealmKeybinds("c1", null)).jump).toEqual([]);
  });

  it("refuses a user with no access, writing nothing", async () => {
    actor = null;
    await expect(saveRealmKeybinds("c1", wasd)).rejects.toThrow(/access/i);
    expect((await client.query("SELECT * FROM realm_visitor_keybinds")).rows).toHaveLength(0);
    expect((await client.query("SELECT * FROM realm_settings")).rows).toHaveLength(0);
  });
});
