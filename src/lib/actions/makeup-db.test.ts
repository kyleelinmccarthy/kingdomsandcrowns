// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * The catch-up list (the parent dashboard's "N to catch up"), against a REAL
 * libsql database for the hero's school days, optional days and excused days.
 *
 * It must never count work on a day the Missed Days panel leaves out: that
 * panel is where a parent excuses missed work, so anything it doesn't show can
 * never be cleared, and "to catch up" stays on the dashboard for good.
 */
const client = testDatabase("makeup-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  // A view-only guardian, so the action reads rows without generating any.
  requireChildAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "view" }, familyId: "f1" })),
  isChildActor: () => false,
}));
vi.mock("@/lib/services/family-timezone", () => ({
  getTimezoneForChild: vi.fn(async () => "UTC"),
}));
vi.mock("@/lib/actions/school-breaks", () => ({ getSchoolBreaks: vi.fn(async () => []) }));
vi.mock("@/lib/actions/quest-assignments", () => ({
  generateAssignmentsFromSchedules: vi.fn(async () => {}),
  getAssignmentsForDateRange: vi.fn(async () => []),
}));

const { getMakeupView } = await import("./makeup");
const { getAssignmentsForDateRange } = await import("@/lib/actions/quest-assignments");

const DDL = [
  `CREATE TABLE child (
    id text PRIMARY KEY NOT NULL, created_at integer NOT NULL, school_days text,
    streak_optional_days text, makeup_mode text, makeup_days text)`,
  `CREATE TABLE makeup_day (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, note text)`,
  `CREATE TABLE excused_day (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, reason text NOT NULL,
    note text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
];

// 2026-11-23 is a Monday; 2026-11-20 a Friday, 2026-11-22 a Sunday.
const TODAY = "2026-11-23";
const owed = (date: string, id = date) => ({
  assignment: { id, status: "pending", date },
  quest: { sortOrder: 0 },
});

async function seedChild(schoolDays: string | null, optionalDays: string | null) {
  await client.query(
    `INSERT INTO child (id, created_at, school_days, streak_optional_days) VALUES ('c1', ?1, ?2, ?3)`,
    [Math.floor(Date.parse("2026-01-01") / 1000), schoolDays, optionalDays],
  );
}

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["child", "makeup_day", "excused_day"]) await client.query(`DELETE FROM ${t}`);
});

afterAll(async () => {
  client.close();
});

describe("getMakeupView", () => {
  it("does not count work on the hero's optional days", async () => {
    await seedChild(JSON.stringify(["mon", "tue", "wed", "thu", "fri", "sun"]), JSON.stringify(["fri", "sun"]));
    vi.mocked(getAssignmentsForDateRange).mockResolvedValueOnce(
      [owed("2026-11-20"), owed("2026-11-22"), owed("2026-11-19")] as never,
    );

    const { assignments } = await getMakeupView("c1", TODAY);

    expect(assignments.map((a) => a.assignment.date)).toEqual(["2026-11-19"]);
  });

  it("does not count work on a day off or an excused day", async () => {
    await seedChild(JSON.stringify(["mon", "tue", "wed", "thu", "fri"]), null);
    await client.query(
      `INSERT INTO excused_day (id, child_id, date, reason, created_at, updated_at)
       VALUES ('e1', 'c1', '2026-11-18', 'sick', unixepoch(), unixepoch())`,
    );
    vi.mocked(getAssignmentsForDateRange).mockResolvedValueOnce(
      [owed("2026-11-22"), owed("2026-11-18"), owed("2026-11-19")] as never,
    );

    const { assignments } = await getMakeupView("c1", TODAY);

    expect(assignments.map((a) => a.assignment.date)).toEqual(["2026-11-19"]);
  });
});
