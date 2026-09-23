// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { DEFAULT_SOUND } from "@/lib/realm3d/sound/settings";

/**
 * The pause menu's sound settings, against a real libsql database. The gate is mocked as the
 * actor: the hero, or a grown-up with edit or view-only access. Its `write` rule is the real
 * one — a view-only member is refused a write — so a save that asks for write access fails here
 * exactly as it does in the app.
 */
const dir = mkdtempSync(path.join(tmpdir(), "realm-sound-"));
const client: Client = createClient({ url: `file:${path.join(dir, "sound.db")}` });
const testDb = drizzle(client, { schema });

type Actor = { userId: string; permission: "edit" | "view" };
let actor: Actor = { userId: "child:c1", permission: "edit" };
const requireChildAccess = vi.fn(async (_childId: string, opts?: { write?: boolean }) => {
  if (opts?.write && actor.permission !== "edit") throw new Error("Read-only access — you do not have permission to make changes.");
  return { access: actor, familyId: "f1" };
});

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (childId: string, opts?: { write?: boolean }) => requireChildAccess(childId, opts),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { saveRealmSound } = await import("./realm-sound");
const { loadRealmSound } = await import("@/lib/services/realm-sound");

const DDL = [
  `CREATE TABLE realm_settings (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL UNIQUE,
    enabled integer DEFAULT true NOT NULL, access_mode text DEFAULT 'earned' NOT NULL,
    earned_minutes_per_quest integer DEFAULT 5 NOT NULL, off_hours_enabled integer DEFAULT false NOT NULL,
    daily_cap_minutes integer DEFAULT 30 NOT NULL, tone_mode text DEFAULT 'gentle' NOT NULL,
    help_seen_at integer, starter_spell_at integer, depth_override text DEFAULT 'auto' NOT NULL,
    tutorial_step integer DEFAULT 0 NOT NULL, trouble_bonus_cap_minutes integer DEFAULT 5 NOT NULL,
    sound text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE TABLE realm_visitor_sound (
    user_id text PRIMARY KEY NOT NULL, sound text NOT NULL, updated_at integer NOT NULL)`,
];

const mom: Actor = { userId: "u-mom", permission: "edit" };
const dad: Actor = { userId: "u-dad", permission: "edit" };
const tutor: Actor = { userId: "u-tutor", permission: "view" };
const hero: Actor = { userId: "child:c1", permission: "edit" };
const quiet = { master: 10, effects: 20, music: 0, muted: false };
const loud = { master: 100, effects: 100, music: 100, muted: false };

beforeAll(async () => {
  for (const sql of DDL) await client.execute(sql);
});

beforeEach(async () => {
  await client.execute("DELETE FROM realm_settings");
  await client.execute("DELETE FROM realm_visitor_sound");
  requireChildAccess.mockClear();
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("saveRealmSound — whose settings", () => {
  it("keeps each grown-up's own: one parent's mute is not the other's, nor the tutor's", async () => {
    actor = mom;
    await saveRealmSound("c1", { ...quiet, muted: true });
    expect(await loadRealmSound("c1", "u-mom")).toEqual({ ...quiet, muted: true });
    expect(await loadRealmSound("c1", "u-dad")).toEqual(DEFAULT_SOUND);
    expect(await loadRealmSound("c1", "u-tutor")).toEqual(DEFAULT_SOUND);

    actor = dad;
    await saveRealmSound("c1", loud);
    expect(await loadRealmSound("c1", "u-dad")).toEqual(loud);
    expect(await loadRealmSound("c1", "u-mom")).toEqual({ ...quiet, muted: true });
  });

  it("lets a view-only grown-up save their own, since it writes nothing of the child's", async () => {
    actor = tutor;
    await expect(saveRealmSound("c1", quiet)).resolves.toBeUndefined();
    expect(requireChildAccess).toHaveBeenCalledWith("c1", undefined);
    expect(await loadRealmSound("c1", "u-tutor")).toEqual(quiet);
  });

  it("never touches the hero's own settings on a visit, and the hero's never touch a visitor's", async () => {
    actor = hero;
    await saveRealmSound("c1", loud);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    actor = mom;
    await saveRealmSound("c1", quiet);
    expect(await loadRealmSound("c1", null)).toEqual(loud);
    expect(await loadRealmSound("c1", "u-mom")).toEqual(quiet);
  });
});
