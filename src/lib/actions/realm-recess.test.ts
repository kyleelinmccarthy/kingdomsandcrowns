// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { COURSE_ID, minLapMs, ringCourse } from "@/lib/realm3d/recess/course";
import { LAP_TOO_FAST } from "@/lib/realm/recess/record";

/**
 * The Ring's record against a real libsql database. The gate is mocked as the actor — the hero, or
 * a grown-up with edit or view-only access — with the real `write` rule.
 */
const dir = mkdtempSync(path.join(tmpdir(), "realm-recess-"));
const client: Client = createClient({ url: `file:${path.join(dir, "recess.db")}` });
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

const { recordRecessResult, getRecessRecord } = await import("./realm-recess");
const { loadRecessRecord } = await import("@/lib/services/recess");

const DDL = [
  `CREATE TABLE realm_recess_record (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, total_gleams integer DEFAULT 0 NOT NULL, laps integer DEFAULT 0 NOT NULL,
    best_lap_ms integer, best_mounted_lap_ms integer, course_id text DEFAULT 'island-ring-1' NOT NULL, last_lap_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX realm_recess_record_child_id_unique ON realm_recess_record (child_id)`,
  // The minutes ledger, to count: the Ring must never write to it.
  `CREATE TABLE realm_play_ledger (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, kind text NOT NULL, minutes integer NOT NULL, created_at integer NOT NULL)`,
];

const hero: Actor = { userId: "child:c1", permission: "edit" };
const mom: Actor = { userId: "u-mom", permission: "edit" };
const tutor: Actor = { userId: "u-tutor", permission: "view" };
const lap = 36000;

async function count(table: string): Promise<number> {
  const r = await client.execute(`SELECT count(*) AS n FROM ${table}`);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  for (const sql of DDL) await client.execute(sql);
});

beforeEach(async () => {
  await client.execute("DELETE FROM realm_recess_record");
  requireChildAccess.mockClear();
  actor = hero;
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("recordRecessResult — who writes", () => {
  it("records the hero's own run, asking for write access, and answers with the merged record", async () => {
    const first = await recordRecessResult("c1", { gleams: 7, lapMs: lap, mounted: false, courseId: COURSE_ID });
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(first).toMatchObject({ first: true, best: true, reset: false });
    expect(first.record).toMatchObject({ totalGleams: 7, laps: 1, bestLapMs: lap, bestMountedLapMs: null, courseId: COURSE_ID });
    const second = await recordRecessResult("c1", { gleams: 3, lapMs: lap + 2000, mounted: false, courseId: COURSE_ID });
    expect(second).toMatchObject({ first: false, best: false });
    const ride = await recordRecessResult("c1", { gleams: 0, lapMs: 20000, mounted: true, courseId: COURSE_ID });
    expect(ride).toMatchObject({ first: true, best: true });
    expect(await loadRecessRecord("c1")).toMatchObject({ totalGleams: 10, laps: 3, bestLapMs: lap, bestMountedLapMs: 20000 });
    expect(await count("realm_recess_record")).toBe(1);
  });

  it("refuses a parent visitor with edit rights, and writes nothing", async () => {
    actor = mom;
    await expect(recordRecessResult("c1", { gleams: 5, lapMs: lap, mounted: false, courseId: COURSE_ID })).rejects.toThrow("Only the hero runs the Ring in their own Realm.");
    expect(await count("realm_recess_record")).toBe(0);
  });

  it("refuses a view-only grown-up, and writes nothing", async () => {
    actor = tutor;
    await expect(recordRecessResult("c1", { gleams: 5, lapMs: null, mounted: false, courseId: COURSE_ID })).rejects.toThrow("Read-only");
    expect(await count("realm_recess_record")).toBe(0);
  });

  it("lets a visiting grown-up read the record, and a first read makes one empty row", async () => {
    actor = mom;
    expect(await getRecessRecord("c1")).toMatchObject({ totalGleams: 0, laps: 0, bestLapMs: null, courseId: COURSE_ID });
    await Promise.all([loadRecessRecord("c1"), loadRecessRecord("c1")]);
    expect(await count("realm_recess_record")).toBe(1);
  });
});

describe("recordRecessResult — what it accepts", () => {
  it("refuses a lap faster than the course allows, with the child's words, and writes nothing", async () => {
    await expect(recordRecessResult("c1", { gleams: 0, lapMs: minLapMs(ringCourse()) - 1, mounted: true, courseId: COURSE_ID })).rejects.toThrow(LAP_TOO_FAST);
    expect(await count("realm_recess_record")).toBe(0);
  });

  it("refuses a made-up course and an empty call", async () => {
    await expect(recordRecessResult("c1", { gleams: 1, lapMs: null, mounted: false, courseId: "elsewhere" })).rejects.toThrow();
    await expect(recordRecessResult("c1", { gleams: 0, lapMs: null, mounted: false, courseId: COURSE_ID })).rejects.toThrow();
    expect(await count("realm_recess_record")).toBe(0);
  });

  it("keeps each hero's record apart", async () => {
    await recordRecessResult("c1", { gleams: 4, lapMs: null, mounted: false, courseId: COURSE_ID });
    actor = { userId: "child:c2", permission: "edit" };
    await recordRecessResult("c2", { gleams: 9, lapMs: null, mounted: false, courseId: COURSE_ID });
    expect((await loadRecessRecord("c1")).totalGleams).toBe(4);
    expect((await loadRecessRecord("c2")).totalGleams).toBe(9);
  });
});

describe("gleams are not minutes (D12.1)", () => {
  it("writes no row to the minutes ledger, however many gleams and however good the lap", async () => {
    const before = await count("realm_play_ledger");
    await recordRecessResult("c1", { gleams: 40, lapMs: lap, mounted: false, courseId: COURSE_ID });
    await recordRecessResult("c1", { gleams: 40, lapMs: lap - 5000, mounted: false, courseId: COURSE_ID });
    expect(await count("realm_play_ledger")).toBe(before);
  });
});
