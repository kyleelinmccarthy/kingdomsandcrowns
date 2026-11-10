// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * Excusing one quest, against a REAL libsql database: only that quest is
 * excused, and the day itself is excused once every quest on it has been.
 */
const client = testDatabase("excused-days-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "edit" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/streaks", () => ({ recomputeFamilyStreaks: vi.fn(async () => {}) }));
vi.mock("@/lib/services/family-timezone", () => ({
  getFamilyTimezone: vi.fn(async () => "UTC"),
  getTimezoneForChild: vi.fn(async () => "UTC"),
}));

const { excuseAssignment } = await import("./excused-days");
const { requireChildAccess } = await import("@/lib/auth/access");
const { recomputeFamilyStreaks } = await import("@/lib/services/streaks");

// The tables the action touches, as the migrations make them (foreign keys left out).
const DDL = [
  `CREATE TABLE quest_assignment (
    id text PRIMARY KEY NOT NULL, quest_id text NOT NULL, child_id text NOT NULL, date text NOT NULL,
    original_date text, status text DEFAULT 'pending' NOT NULL, activity_log_id text,
    completed_at integer, notes text, status_reason text,
    created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE TABLE excused_day (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, reason text NOT NULL,
    note text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX excused_day_child_date_idx ON excused_day (child_id, date)`,
];

const DAY = "2026-09-03";

async function seed(id: string, status: string, date = DAY) {
  await client.query(
    `INSERT INTO quest_assignment (id, quest_id, child_id, date, status, created_at, updated_at)
     VALUES (?1, ?2, 'c1', ?3, ?4, unixepoch(), unixepoch())`,
    [id, `q-${id}`, date, status],
  );
}

async function assignment(id: string): Promise<{ status: string; status_reason: string | null }> {
  const r = await client.query("SELECT status, status_reason FROM quest_assignment WHERE id = ?1", [id]);
  return r.rows[0];
}

async function excusedDays(): Promise<{ date: string; reason: string; note: string | null }[]> {
  const r = await client.query("SELECT date, reason, note FROM excused_day WHERE child_id = 'c1' ORDER BY date");
  return r.rows;
}

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["quest_assignment", "excused_day"]) await client.query(`DELETE FROM ${t}`);
  vi.mocked(recomputeFamilyStreaks).mockClear();
});

afterAll(async () => {
  client.close();
});

describe("excuseAssignment", () => {
  it("excuses just that quest, with its reason, and leaves the rest of the day owed", async () => {
    await seed("math", "completed");
    await seed("science", "pending");
    await seed("reading", "pending");

    await excuseAssignment("science", "other", "Field trip");

    expect(await assignment("science")).toEqual({ status: "excused", status_reason: "Other — Field trip" });
    expect((await assignment("reading")).status).toBe("pending");
    expect((await assignment("math")).status).toBe("completed");
    expect(await excusedDays()).toEqual([]);
  });

  it("excuses the day once every quest on it has been excused", async () => {
    await seed("math", "excused");
    await seed("science", "stuck");

    await excuseAssignment("science", "sick", "Flu");

    expect(await excusedDays()).toEqual([{ date: DAY, reason: "sick", note: "Flu" }]);
    expect(recomputeFamilyStreaks).toHaveBeenCalledWith("f1");
  });

  it("does not excuse the day when work on it was done", async () => {
    await seed("math", "completed");
    await seed("science", "pending");

    await excuseAssignment("science", "sick", "");

    expect(await excusedDays()).toEqual([]);
  });

  it("leaves other days alone", async () => {
    await seed("science", "pending");
    await seed("tomorrow", "pending", "2026-09-04");

    await excuseAssignment("science", "sick", "");

    expect(await excusedDays()).toEqual([{ date: DAY, reason: "sick", note: null }]);
    expect((await assignment("tomorrow")).status).toBe("pending");
  });

  it("refuses a hero", async () => {
    await seed("science", "pending");
    vi.mocked(requireChildAccess).mockResolvedValueOnce({
      access: { userId: "child:c1" },
      familyId: "f1",
    } as never);

    await expect(excuseAssignment("science", "sick", "")).rejects.toThrow(/grown-up/i);
    expect((await assignment("science")).status).toBe("pending");
  });

  it("refuses a quest that is no longer owed", async () => {
    await seed("math", "completed");

    await expect(excuseAssignment("math", "sick", "")).rejects.toThrow();
    expect((await assignment("math")).status).toBe("completed");
  });
});
