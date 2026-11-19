// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { applyMigrations } from "@/test/apply-migrations";
import { MATERIALS } from "@/lib/realm/materials";

/**
 * The Chronicle's pages, against a REAL libsql database built from the real migrations: which
 * quests become entries, how they group into weeks, and that a missing quest or subject still
 * renders.
 */
const client = testDatabase("realm-chronicle-db");
const testDb = client.db;

let zone = "UTC";
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/services/family-timezone", () => ({
  getTimezoneForChild: vi.fn(async () => zone),
}));

const { loadChronicle } = await import("./realm-chronicle");

const DRAWING = { v: 1, strokes: [{ c: 2, w: 1, p: [10, 10, 50, 60] }] };
const SEAL = { phrase: 1, by: "Mama", at: 1_700_000_000 };
/** Wednesday 2026-11-18, midday UTC. */
const NOW = new Date("2026-11-18T12:00:00Z");

let seq = 0;

function at(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function subject(id: string, name: string, extra: { material?: string | null; active?: boolean; childId?: string } = {}) {
  await client.query(
    "INSERT INTO subject (id, child_id, name, is_active, material, created_at) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())",
    [id, extra.childId ?? "c1", name, extra.active ?? true, extra.material ?? null],
  );
}

async function quest(id: string, title: string, subjectId: string, childId = "c1") {
  await client.query("INSERT INTO quest (id, child_id, subject_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())", [id, childId, subjectId, title]);
}

async function assignment(
  id: string,
  questId: string,
  completedAt: string | null,
  extra: { notes?: string | null; drawing?: unknown; seal?: unknown; status?: string; childId?: string } = {},
) {
  const j = (v: unknown) => (v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v));
  await client.query(
    `INSERT INTO quest_assignment (id, quest_id, child_id, date, status, completed_at, notes, drawing, seal, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, unixepoch(), unixepoch())`,
    [
      id,
      questId,
      extra.childId ?? "c1",
      // The planned day is not what the Chronicle reads, but (child, quest, date) is unique.
      new Date(Date.UTC(2025, 0, 1 + seq++)).toISOString().slice(0, 10),
      extra.status ?? "completed",
      completedAt ? at(completedAt) : null,
      extra.notes ?? null,
      j(extra.drawing),
      j(extra.seal),
    ],
  );
}

beforeAll(async () => {
  await applyMigrations(client);
});

beforeEach(async () => {
  for (const t of ["quest_assignment", "quest", "subject"]) await client.query(`DELETE FROM ${t}`);
  zone = "UTC";
});

afterAll(() => {
  client.close();
});

describe("loadChronicle", () => {
  it("groups entries by Monday week, newest week first and newest entry first", async () => {
    await subject("s1", "Math");
    await quest("q1", "Fractions", "s1");
    await quest("q2", "Decimals", "s1");
    await quest("q3", "Old work", "s1");
    await assignment("a1", "q1", "2026-11-16T09:00:00Z", { notes: "Monday" }); // week of 11-16
    await assignment("a2", "q2", "2026-11-18T09:00:00Z", { notes: "Wednesday" }); // same week, newer
    await assignment("a3", "q3", "2026-11-10T09:00:00Z", { notes: "Tuesday before" }); // week of 11-09
    await assignment("a4", "q3", "2026-11-15T20:00:00Z", { notes: "Sunday" }); // Sunday ends week of 11-09
    const weeks = await loadChronicle("c1", { now: NOW });
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-11-16", "2026-11-09"]);
    expect(weeks[0].entries.map((e) => e.assignmentId)).toEqual(["a2", "a1"]);
    expect(weeks[1].entries.map((e) => e.assignmentId)).toEqual(["a4", "a3"]);
    expect(weeks[0].entries[0]).toMatchObject({ date: "2026-11-18", title: "Decimals", subject: "Math", notes: "Wednesday", drawing: null, seal: null });
  });

  it("keeps only quests with notes, a drawing or a seal", async () => {
    await subject("s1", "Math");
    await quest("q1", "Q", "s1");
    await assignment("plain", "q1", "2026-11-17T09:00:00Z");
    await assignment("blank", "q1", "2026-11-17T10:00:00Z", { notes: "   " });
    await assignment("notes", "q1", "2026-11-17T11:00:00Z", { notes: "Did it" });
    await assignment("drawn", "q1", "2026-11-17T12:00:00Z", { drawing: DRAWING });
    await assignment("sealed", "q1", "2026-11-17T13:00:00Z", { seal: SEAL });
    await assignment("pending", "q1", null, { notes: "not done", status: "pending" });
    const ids = (await loadChronicle("c1", { now: NOW })).flatMap((w) => w.entries.map((e) => e.assignmentId));
    expect(ids).toEqual(["sealed", "drawn", "notes"]);
  });

  it("leaves out another child's entries", async () => {
    await subject("s1", "Math");
    await subject("s2", "Math", { childId: "c2" });
    await quest("q1", "Mine", "s1");
    await quest("q2", "Theirs", "s2", "c2");
    await assignment("mine", "q1", "2026-11-17T09:00:00Z", { notes: "yes" });
    await assignment("theirs", "q2", "2026-11-17T09:00:00Z", { notes: "no", childId: "c2" });
    const ids = (await loadChronicle("c1", { now: NOW })).flatMap((w) => w.entries.map((e) => e.assignmentId));
    expect(ids).toEqual(["mine"]);
  });

  it("only reaches back the number of weeks asked for", async () => {
    await subject("s1", "Math");
    await quest("q1", "Q", "s1");
    await assignment("this", "q1", "2026-11-16T00:30:00Z", { notes: "n" });
    await assignment("last", "q1", "2026-11-10T09:00:00Z", { notes: "n" });
    await assignment("old", "q1", "2026-10-30T09:00:00Z", { notes: "n" });
    const two = await loadChronicle("c1", { weeks: 2, now: NOW });
    expect(two.map((w) => w.weekStart)).toEqual(["2026-11-16", "2026-11-09"]);
    const all = await loadChronicle("c1", { now: NOW });
    expect(all.flatMap((w) => w.entries.map((e) => e.assignmentId))).toEqual(["this", "last", "old"]);
    expect((await loadChronicle("c1", { weeks: 1, now: NOW })).flatMap((w) => w.entries.map((e) => e.assignmentId))).toEqual(["this"]);
  });

  it("dates an entry in the family's time zone", async () => {
    await subject("s1", "Math");
    await quest("q1", "Q", "s1");
    await assignment("a1", "q1", "2026-11-16T22:00:00Z", { notes: "late" });
    zone = "Pacific/Auckland"; // +13 in November: 22:00 UTC Monday is already Tuesday
    const auckland = await loadChronicle("c1", { now: NOW });
    expect(auckland[0].weekStart).toBe("2026-11-16");
    expect(auckland[0].entries[0].date).toBe("2026-11-17");
    await client.query("UPDATE quest_assignment SET completed_at = ?1", [at("2026-11-16T02:00:00Z")]);
    zone = "America/Denver"; // -7: 02:00 UTC Monday is still Sunday evening, in the week before
    const denver = await loadChronicle("c1", { now: NOW });
    expect(denver[0].weekStart).toBe("2026-11-09");
    expect(denver[0].entries[0].date).toBe("2026-11-15");
  });

  it("still renders a quest whose subject was deleted or switched off, and a deleted quest", async () => {
    await subject("s-off", "Latin", { active: false });
    await quest("q-off", "Declensions", "s-off");
    await quest("q-gone-subject", "Orphan quest", "s-missing");
    await assignment("off", "q-off", "2026-11-17T09:00:00Z", { notes: "n" });
    await assignment("nosubject", "q-gone-subject", "2026-11-17T10:00:00Z", { notes: "n" });
    await assignment("noquest", "q-deleted", "2026-11-17T11:00:00Z", { notes: "n" });
    const entries = (await loadChronicle("c1", { now: NOW })).flatMap((w) => w.entries);
    const by = Object.fromEntries(entries.map((e) => [e.assignmentId, e]));
    expect(by.off).toMatchObject({ title: "Declensions", subject: "Latin" });
    expect(by.nosubject).toMatchObject({ title: "Orphan quest", subject: null, materialColor: MATERIALS.timber.color });
    expect(by.noquest).toMatchObject({ title: "A quest", subject: null });
  });

  it("colours an entry by its subject's material", async () => {
    await subject("s1", "Anything", { material: "dye" });
    await subject("s2", "Math");
    await quest("q1", "A", "s1");
    await quest("q2", "B", "s2");
    await assignment("a1", "q1", "2026-11-17T09:00:00Z", { notes: "n" });
    await assignment("a2", "q2", "2026-11-17T10:00:00Z", { notes: "n" });
    const by = Object.fromEntries((await loadChronicle("c1", { now: NOW })).flatMap((w) => w.entries).map((e) => [e.assignmentId, e]));
    expect(by.a1.materialColor).toBe(MATERIALS.dye.color);
    expect(by.a2.materialColor).toBe(MATERIALS.stone.color);
  });

  it("reads a bad drawing or seal as null, without losing the entry", async () => {
    await subject("s1", "Math");
    await quest("q1", "Q", "s1");
    await assignment("a1", "q1", "2026-11-17T09:00:00Z", { notes: "n", drawing: { v: 1, strokes: [{ c: 9, w: 0, p: [1, 1] }] }, seal: "not json" });
    await assignment("a2", "q1", "2026-11-17T10:00:00Z", { drawing: DRAWING, seal: SEAL });
    const by = Object.fromEntries((await loadChronicle("c1", { now: NOW })).flatMap((w) => w.entries).map((e) => [e.assignmentId, e]));
    expect(by.a1).toMatchObject({ drawing: null, seal: null, notes: "n" });
    expect(by.a2.drawing).toEqual(DRAWING);
    expect(by.a2.seal).toEqual(SEAL);
  });

  it("drops an entry whose only content was a bad drawing and seal", async () => {
    await subject("s1", "Math");
    await quest("q1", "Q", "s1");
    await assignment("a1", "q1", "2026-11-17T09:00:00Z", { drawing: "garbage", seal: "garbage" });
    expect(await loadChronicle("c1", { now: NOW })).toEqual([]);
  });

  it("answers an empty chronicle with no weeks", async () => {
    expect(await loadChronicle("c1", { now: NOW })).toEqual([]);
  });
});
