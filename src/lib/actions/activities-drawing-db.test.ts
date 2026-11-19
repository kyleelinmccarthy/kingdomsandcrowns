// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { applyMigrations } from "@/test/apply-migrations";

/**
 * Editing a chronicled quest's notes (`updateActivity`) honours the same "notes OR a drawing" rule
 * as the quest card: a drawing the quest already carries lets the notes be cleared.
 */
const client = testDatabase("activities-drawing-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireActivityAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "edit" } })),
  requireChildAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "edit" }, familyId: "f1" })),
}));
vi.mock("@/lib/services/family-timezone", () => ({
  getFamilyTimezone: vi.fn(async () => "UTC"),
  getTimezoneForChild: vi.fn(async () => "UTC"),
}));

const { updateActivity } = await import("./activities");

const STORED = JSON.stringify({ v: 1, strokes: [{ c: 0, w: 0, p: [1, 1, 9, 9] }] });
const GOOD_NOTES = "We measured the garden and wrote it down";

async function seed(drawing: string | null) {
  await client.query("INSERT INTO quest (id, child_id, subject_id, title, require_notes, created_at, updated_at) VALUES ('q1', 'c1', 's1', 'Garden', 1, unixepoch(), unixepoch())");
  await client.query(
    `INSERT INTO activity_log (id, child_id, subject_id, date, title, description, quest_assignment_id, created_at, updated_at)
     VALUES ('act1', 'c1', 's1', '2026-01-05', 'Garden', ?1, 'a1', unixepoch(), unixepoch())`,
    [GOOD_NOTES],
  );
  await client.query(
    `INSERT INTO quest_assignment (id, quest_id, child_id, date, status, activity_log_id, notes, drawing, created_at, updated_at)
     VALUES ('a1', 'q1', 'c1', '2026-01-05', 'completed', 'act1', ?1, ?2, unixepoch(), unixepoch())`,
    [GOOD_NOTES, drawing],
  );
}

async function notes(): Promise<string | null> {
  return (await client.query("SELECT notes FROM quest_assignment WHERE id = 'a1'")).rows[0].notes;
}

beforeAll(async () => {
  await applyMigrations(client);
});

beforeEach(async () => {
  for (const t of ["activity_log", "quest_assignment", "quest"]) await client.query(`DELETE FROM ${t}`);
});

afterAll(() => {
  client.close();
});

describe("updateActivity on a notes-required quest", () => {
  it("refuses clearing the notes when there is no drawing", async () => {
    await seed(null);
    await expect(updateActivity("act1", { description: "" })).rejects.toThrow(/Scribe's Notes or a drawing are required/);
    expect(await notes()).toBe(GOOD_NOTES);
  });

  it("allows clearing the notes when the quest carries a drawing", async () => {
    await seed(STORED);
    await updateActivity("act1", { description: "" });
    expect(await notes()).toBeNull();
  });
});
