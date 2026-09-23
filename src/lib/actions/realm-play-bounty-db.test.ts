// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

/**
 * The bounty against a REAL libsql database, which is what production runs (Turso is libsql).
 * The other bounty test mocks the services; this one exists because the defect was between the
 * services — a read of the allowance, then an award, then the writes — and only a real database
 * shows two calls interleaving across those awaits.
 */
const dir = mkdtempSync(path.join(tmpdir(), "bounty-db-"));
const client: Client = createClient({ url: `file:${path.join(dir, "bounty.db")}` });
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => ({ access: { userId: "child:c1" }, familyId: "f1" }),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { recordTroubleClears } = await import("./realm-play");

async function clearsRecorded(): Promise<number> {
  const r = await client.execute({ sql: "SELECT count(*) AS n FROM realm_trouble_clear WHERE child_id = 'c1'", args: [] });
  return Number(r.rows[0].n);
}

// The three tables the bounty touches, as the migrations make them (foreign keys left out: no
// child or family rows are needed to prove the ledger's arithmetic).
const DDL = [
  `CREATE TABLE realm_settings (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL UNIQUE,
    enabled integer DEFAULT true NOT NULL, access_mode text DEFAULT 'earned' NOT NULL,
    earned_minutes_per_quest integer DEFAULT 5 NOT NULL, off_hours_enabled integer DEFAULT false NOT NULL,
    daily_cap_minutes integer DEFAULT 30 NOT NULL, tone_mode text DEFAULT 'gentle' NOT NULL,
    help_seen_at integer, starter_spell_at integer, depth_override text DEFAULT 'auto' NOT NULL,
    tutorial_step integer DEFAULT 0 NOT NULL, trouble_bonus_cap_minutes integer DEFAULT 5 NOT NULL,
    sound text, visitor_sound text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE TABLE realm_play_ledger (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, kind text NOT NULL,
    minutes integer NOT NULL, source_assignment_id text, created_at integer NOT NULL)`,
  `CREATE TABLE realm_trouble_clear (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, home_id text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX realm_trouble_clear_paid_unique_idx ON realm_trouble_clear (child_id, date, home_id) WHERE "realm_trouble_clear"."minutes" > 0`,
];

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  for (const sql of DDL) await client.execute(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await client.execute(`DELETE FROM ${t}`);
  // Plenty of schoolwork, so the parent's cap of 5 is the only ceiling.
  await client.execute({
    sql: "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('e1', 'c1', ?, 'earned', 20, 0)",
    args: [today],
  });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function bonusBanked(): Promise<number> {
  const r = await client.execute({
    sql: "SELECT coalesce(sum(minutes), 0) AS n FROM realm_play_ledger WHERE child_id = 'c1' AND date = ? AND kind = 'bonus'",
    args: [today],
  });
  return Number(r.rows[0].n);
}

async function clearsPaid(): Promise<number> {
  const r = await client.execute({
    sql: "SELECT coalesce(sum(minutes), 0) AS n FROM realm_trouble_clear WHERE child_id = 'c1' AND date = ?",
    args: [today],
  });
  return Number(r.rows[0].n);
}

describe("recordTroubleClears — two calls at once (two tabs, or a replayed request)", () => {
  it("pays the day's allowance once between them, never once each", async () => {
    const a = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn"];
    const b = ["place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    const results = await Promise.allSettled([recordTroubleClears("c1", today, a), recordTroubleClears("c1", today, b)]);
    for (const r of results) expect(r.status, String((r as PromiseRejectedResult).reason)).toBe("fulfilled");
    const awarded = results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.awarded : 0), 0);

    expect(await bonusBanked()).toBe(5);
    expect(await clearsPaid()).toBe(5);
    expect(awarded).toBe(5);
  });
});

describe("recordTroubleClears — what a batch earns", () => {
  it("pays a minute a clear, once per home, up to the day's cap", async () => {
    const first = await recordTroubleClears("c1", today, ["rim-0", "rim-1", "rim-0"]);
    expect(first.awarded).toBe(2);
    expect(first.status).toMatchObject({ paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    const more = await recordTroubleClears("c1", today, ["rim-2", "place-cove-7", "place-summit-3", "place-mire-4"]);
    expect(more.awarded).toBe(3);
    expect(more.status.remainingMinutes).toBe(0);
    const capped = await recordTroubleClears("c1", today, ["place-ringstones"]);
    expect(capped.awarded).toBe(0);
    expect(capped.status.clearsToday).toBe(8);
    expect(await bonusBanked()).toBe(5);
  });

  it("drops clears past the per-minute limit instead of recording them", async () => {
    const homes = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn", "place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    await recordTroubleClears("c1", today, homes); // 10
    await recordTroubleClears("c1", today, homes.slice(0, 9)); // 19
    const r = await recordTroubleClears("c1", today, ["rim-0", "rim-1", "rim-2"]);
    expect(r.status.clearsToday).toBe(20);
    await recordTroubleClears("c1", today, ["place-cove-7"]);
    expect(await clearsRecorded()).toBe(20);
  });

  it("pays nothing in open mode, where minutes are never read", async () => {
    await client.execute(
      "INSERT INTO realm_settings (id, child_id, access_mode, created_at, updated_at) VALUES ('s1', 'c1', 'open', 0, 0)",
    );
    const r = await recordTroubleClears("c1", today, ["rim-0"]);
    expect(r.awarded).toBe(0);
    expect(r.status.enabled).toBe(false);
    expect(await bonusBanked()).toBe(0);
  });
});
