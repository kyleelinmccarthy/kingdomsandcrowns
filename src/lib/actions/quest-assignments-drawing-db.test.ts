// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { applyMigrations } from "@/test/apply-migrations";

/**
 * A quest told with a drawing, against a REAL libsql database built from the real migrations:
 * the "notes OR a drawing" rule for a quest that asks for Scribe's Notes, what is stored, and
 * that a refused drawing writes nothing.
 */
const client = testDatabase("quest-assignments-drawing-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireAssignmentAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "edit" } })),
  requireChildAccess: vi.fn(async () => ({ access: { userId: "u1", permission: "edit" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/actions/activities", () => ({
  createActivity: vi.fn(async () => ({ id: "act-1", title: "t" })),
  deleteActivity: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/family-timezone", () => ({
  getFamilyTimezone: vi.fn(async () => "UTC"),
  getTimezoneForChild: vi.fn(async () => "UTC"),
}));
vi.mock("@/lib/services/realm-play", () => ({ grantEarnedMinutesForCompletion: vi.fn(async () => {}) }));
vi.mock("@/lib/services/realm-materials", () => ({ grantMaterialsSafely: vi.fn(async () => {}) }));

const { completeAssignment, updateAssignmentNotes } = await import("./quest-assignments");
const { createActivity } = await import("@/lib/actions/activities");

const DRAWING = { v: 1, strokes: [{ c: 2, w: 1, p: [10, 10, 50, 60, 120, 90] }] };
const STORED = JSON.stringify(DRAWING);
const GOOD_NOTES = "We measured the garden and wrote it down";

async function seed(requireNotes: boolean, extra: { notes?: string | null; drawing?: string | null; status?: string } = {}) {
  await client.query("INSERT INTO quest (id, child_id, subject_id, title, require_notes, created_at, updated_at) VALUES ('q1', 'c1', 's1', 'Garden', ?1, unixepoch(), unixepoch())", [requireNotes]);
  await client.query(
    `INSERT INTO quest_assignment (id, quest_id, child_id, date, status, activity_log_id, notes, drawing, created_at, updated_at)
     VALUES ('a1', 'q1', 'c1', '2026-01-05', ?1, ?2, ?3, ?4, unixepoch(), unixepoch())`,
    [extra.status ?? "pending", extra.status === "completed" ? "act-1" : null, extra.notes ?? null, extra.drawing ?? null],
  );
}

async function assignment(): Promise<{ status: string; notes: string | null; drawing: string | null }> {
  const r = await client.query("SELECT status, notes, drawing FROM quest_assignment WHERE id = 'a1'");
  return r.rows[0];
}

beforeAll(async () => {
  await applyMigrations(client);
});

beforeEach(async () => {
  for (const t of ["quest_assignment", "quest"]) await client.query(`DELETE FROM ${t}`);
  vi.mocked(createActivity).mockClear();
});

afterAll(() => {
  client.close();
});

describe("completeAssignment with a drawing", () => {
  it("completes a notes-required quest with only a drawing, and stores it", async () => {
    await seed(true);
    await completeAssignment("a1", { drawing: DRAWING });
    const a = await assignment();
    expect(a.status).toBe("completed");
    expect(a.drawing).toBe(STORED);
    expect(a.notes).toBeNull();
  });

  it("accepts the drawing as a JSON string and stores the normalised form", async () => {
    await seed(true);
    await completeAssignment("a1", { drawing: ` ${STORED}`.trim() });
    expect((await assignment()).drawing).toBe(STORED);
  });

  it("refuses a notes-required quest with neither notes nor a drawing", async () => {
    await seed(true);
    await expect(completeAssignment("a1", {})).rejects.toThrow(/Scribe's Notes or a drawing are required/);
    await expect(completeAssignment("a1", { description: "ok", drawing: { v: 1, strokes: [] } })).rejects.toThrow(/or a drawing/);
    expect((await assignment()).status).toBe("pending");
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("still completes on notes alone, with no drawing stored", async () => {
    await seed(true);
    await completeAssignment("a1", { description: GOOD_NOTES });
    const a = await assignment();
    expect(a.status).toBe("completed");
    expect(a.notes).toBe(GOOD_NOTES);
    expect(a.drawing).toBeNull();
  });

  it("stores a drawing on a quest that does not ask for notes, and null means none", async () => {
    await seed(false);
    await completeAssignment("a1", { drawing: null });
    expect((await assignment()).drawing).toBeNull();
  });

  it("refuses an invalid drawing and writes nothing", async () => {
    const forged: unknown[] = [
      { v: 1, strokes: [{ c: 9, w: 0, p: [1, 1] }] },
      { v: 1, strokes: [{ c: 0, w: 0, p: [1.5, 1] }] },
      { v: 1, strokes: [{ c: 0, w: 0, p: [1, 1], x: 1 }] },
      { v: 1, strokes: Array.from({ length: 41 }, () => ({ c: 0, w: 0, p: [1, 1] })) },
      "x".repeat(40 * 1024),
      "not json",
      42,
    ];
    for (const drawing of forged) {
      await client.query("DELETE FROM quest_assignment");
      await client.query("DELETE FROM quest");
      // Notes are fine here: a bad drawing must not slip through next to good notes.
      await seed(false);
      await expect(completeAssignment("a1", { description: GOOD_NOTES, drawing })).rejects.toThrow("That drawing couldn't be saved.");
      const a = await assignment();
      expect(a).toEqual({ status: "pending", notes: null, drawing: null });
    }
    expect(createActivity).not.toHaveBeenCalled();
  });
});

describe("updateAssignmentNotes with a drawing", () => {
  it("leaves the drawing alone when none is passed", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES, drawing: STORED });
    await updateAssignmentNotes("a1", "We measured the whole garden today");
    const a = await assignment();
    expect(a.notes).toBe("We measured the whole garden today");
    expect(a.drawing).toBe(STORED);
  });

  it("clears the drawing with null (notes keep the quest valid)", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES, drawing: STORED });
    await updateAssignmentNotes("a1", GOOD_NOTES, null);
    expect((await assignment()).drawing).toBeNull();
  });

  it("refuses clearing the drawing when the notes are also empty", async () => {
    await seed(true, { status: "completed", notes: null, drawing: STORED });
    await expect(updateAssignmentNotes("a1", "", null)).rejects.toThrow(/or a drawing/);
    expect((await assignment()).drawing).toBe(STORED);
  });

  it("allows clearing the notes while a stored drawing remains", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES, drawing: STORED });
    await updateAssignmentNotes("a1", "");
    const a = await assignment();
    expect(a.notes).toBeNull();
    expect(a.drawing).toBe(STORED);
  });

  it("refuses clearing the notes when there is no drawing", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES });
    await expect(updateAssignmentNotes("a1", "")).rejects.toThrow(/or a drawing/);
    expect((await assignment()).notes).toBe(GOOD_NOTES);
  });

  it("sets a new drawing, and an empty note is fine alongside it", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES });
    await updateAssignmentNotes("a1", "", DRAWING);
    const a = await assignment();
    expect(a.notes).toBeNull();
    expect(a.drawing).toBe(STORED);
  });

  it("refuses an invalid drawing and changes nothing", async () => {
    await seed(true, { status: "completed", notes: GOOD_NOTES, drawing: STORED });
    await expect(updateAssignmentNotes("a1", "Different words here", { v: 1, strokes: [{ c: 0, w: 3, p: [1, 1] }] })).rejects.toThrow(
      "That drawing couldn't be saved.",
    );
    const a = await assignment();
    expect(a.notes).toBe(GOOD_NOTES);
    expect(a.drawing).toBe(STORED);
  });

  it("treats an empty drawing as none when it is the only thing offered", async () => {
    await seed(true, { status: "completed", notes: null, drawing: STORED });
    await expect(updateAssignmentNotes("a1", "", { v: 1, strokes: [] })).rejects.toThrow(/or a drawing/);
  });
});
