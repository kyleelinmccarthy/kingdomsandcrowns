// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

/**
 * The places a hero has found, against a real libsql database. The gate is mocked as the actor:
 * the hero, or a grown-up with edit or view-only access. Its `write` rule is the real one.
 */
const dir = mkdtempSync(path.join(tmpdir(), "realm-places-"));
const client: Client = createClient({ url: `file:${path.join(dir, "places.db")}` });
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

const { recordPlacesFound } = await import("./realm-places");
const { loadPlacesFound } = await import("@/lib/services/realm-places");

const DDL = [
  `CREATE TABLE realm_place_found (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, place_id text NOT NULL, found_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX realm_place_found_child_place_idx ON realm_place_found (child_id, place_id)`,
];

const hero: Actor = { userId: "child:c1", permission: "edit" };
const mom: Actor = { userId: "u-mom", permission: "edit" };
const tutor: Actor = { userId: "u-tutor", permission: "view" };

async function rowCount(): Promise<number> {
  const r = await client.execute("SELECT count(*) AS n FROM realm_place_found");
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  for (const sql of DDL) await client.execute(sql);
});

beforeEach(async () => {
  await client.execute("DELETE FROM realm_place_found");
  requireChildAccess.mockClear();
  actor = hero;
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("recordPlacesFound — who writes", () => {
  it("records the hero's own finds, asking for write access, and answers with every place found", async () => {
    expect(await recordPlacesFound("c1", ["farfurrow"])).toEqual(["farfurrow"]);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    const all = await recordPlacesFound("c1", ["summit-6", "cove-12"]);
    expect([...all].sort()).toEqual(["cove-12", "farfurrow", "summit-6"]);
    expect([...(await loadPlacesFound("c1"))].sort()).toEqual(["cove-12", "farfurrow", "summit-6"]);
  });

  it("refuses a parent visitor with edit rights, and writes nothing", async () => {
    actor = mom;
    await expect(recordPlacesFound("c1", ["farfurrow"])).rejects.toThrow("Only the hero finds places in their own Realm.");
    expect(await rowCount()).toBe(0);
  });

  it("refuses a view-only grown-up, and writes nothing", async () => {
    actor = tutor;
    await expect(recordPlacesFound("c1", ["farfurrow"])).rejects.toThrow();
    expect(await rowCount()).toBe(0);
  });
});

describe("recordPlacesFound — what is written", () => {
  it("is idempotent: the same place sent twice, or twice in one call, is one row", async () => {
    await recordPlacesFound("c1", ["farfurrow", "farfurrow"]);
    await recordPlacesFound("c1", ["farfurrow"]);
    expect(await rowCount()).toBe(1);
  });

  it("refuses an id that is not a place on the island, and writes none of the batch", async () => {
    for (const bad of [["nowhere"], ["farfurrow", "village"], ["place-summit-6"], ["summit-99"]]) {
      await expect(recordPlacesFound("c1", bad)).rejects.toThrow("That isn't a place the Realm knows.");
    }
    expect(await rowCount()).toBe(0);
  });

  it("refuses an empty or oversized call", async () => {
    await expect(recordPlacesFound("c1", [])).rejects.toThrow();
    await expect(recordPlacesFound("c1", Array.from({ length: 20 }, () => "farfurrow"))).rejects.toThrow();
    await expect(recordPlacesFound("c1", "farfurrow" as unknown as string[])).rejects.toThrow();
    expect(await rowCount()).toBe(0);
  });

  it("keeps each child's own", async () => {
    await recordPlacesFound("c1", ["farfurrow"]);
    await recordPlacesFound("c2", ["appleway"]);
    expect(await loadPlacesFound("c1")).toEqual(["farfurrow"]);
    expect(await loadPlacesFound("c2")).toEqual(["appleway"]);
  });
});
