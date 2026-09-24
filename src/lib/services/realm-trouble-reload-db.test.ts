// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { RELOAD_MEMORY_MS, STAMP_SLACK_MS } from "@/lib/realm3d/trouble-reload";

/**
 * What a reload reads back (`loadRecentTroubleClears`), against a real libsql database: the
 * table stores `created_at` to the second, and the read must turn that into each home's latest
 * clear as an age, for this hero only, paid and unpaid alike, across the hero's local midnight.
 */
const dir = mkdtempSync(path.join(tmpdir(), "reload-db-"));
const client: Client = createClient({ url: `file:${path.join(dir, "reload.db")}` });
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db", () => ({ db: testDb }));

const { loadRecentTroubleClears } = await import("./realm-play");

beforeAll(async () => {
  await client.execute(`CREATE TABLE realm_trouble_clear (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, home_id text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)`);
});
beforeEach(async () => {
  await client.execute("DELETE FROM realm_trouble_clear");
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
/** A clear at `at`, stored as the table stores it (whole seconds). */
async function clear(childId: string, homeId: string, at: Date, minutes = 0, date = "2026-09-24") {
  await client.execute({
    sql: "INSERT INTO realm_trouble_clear (id, child_id, date, home_id, minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [`c${n++}`, childId, date, homeId, minutes, Math.floor(at.getTime() / 1000)],
  });
}

describe("loadRecentTroubleClears", () => {
  const now = new Date("2026-09-24T15:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("gives each home's latest clear, paid or not, as an age a second short of the stored one", async () => {
    await clear("c1", "rim-0", ago(40_000), 1);
    await clear("c1", "rim-0", ago(6_000), 0);
    await clear("c1", "place-ringstones", ago(12_000), 1);
    const out = await loadRecentTroubleClears("c1", now);
    expect(out).toHaveLength(2);
    expect(out).toEqual(
      expect.arrayContaining([
        { homeId: "rim-0", agoMs: 6_000 - STAMP_SLACK_MS },
        { homeId: "place-ringstones", agoMs: 12_000 - STAMP_SLACK_MS },
      ]),
    );
  });

  it("is this hero's alone", async () => {
    await clear("c2", "rim-0", ago(3_000));
    expect(await loadRecentTroubleClears("c1", now)).toEqual([]);
  });

  it("forgets clears past the window, and reads across the hero's local date", async () => {
    await clear("c1", "rim-1", ago(RELOAD_MEMORY_MS + 5_000));
    await clear("c1", "rim-2", ago(9_000), 0, "2026-09-23");
    expect(await loadRecentTroubleClears("c1", now)).toEqual([{ homeId: "rim-2", agoMs: 9_000 - STAMP_SLACK_MS }]);
  });
});
