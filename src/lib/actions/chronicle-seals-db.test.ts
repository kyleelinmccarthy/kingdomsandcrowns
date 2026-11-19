// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { applyMigrations } from "@/test/apply-migrations";

/**
 * A grown-up's seal on a finished quest, against a REAL libsql database built from the real
 * migrations: who may seal, what may be sealed, what is stored and that a refusal writes nothing.
 */
const client = testDatabase("chronicle-seals-db");
const testDb = client.db;

const actor = { userId: "u1" };
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/auth/access", () => ({
  requireAssignmentAccess: vi.fn(async () => ({ access: { ...actor, permission: "edit" } })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { sealEntry, unsealEntry } = await import("./chronicle-seals");
const { requireAssignmentAccess } = await import("@/lib/auth/access");
const { revalidatePath } = await import("next/cache");
const { parseSeal, SEAL_PHRASES } = await import("@/lib/utils/seals");

async function seed(status: string, seal: string | null = null) {
  await client.query("INSERT INTO quest (id, child_id, subject_id, title, created_at, updated_at) VALUES ('q1', 'c1', 's1', 'Garden', unixepoch(), unixepoch())");
  await client.query(
    `INSERT INTO quest_assignment (id, quest_id, child_id, date, status, seal, created_at, updated_at)
     VALUES ('a1', 'q1', 'c1', '2026-01-05', ?1, ?2, unixepoch(), unixepoch())`,
    [status, seal],
  );
}

async function storedSeal(): Promise<string | null> {
  return (await client.query("SELECT seal FROM quest_assignment WHERE id = 'a1'")).rows[0].seal;
}

beforeAll(async () => {
  await applyMigrations(client);
});

beforeEach(async () => {
  for (const t of ["quest_assignment", "quest", "user"]) await client.query(`DELETE FROM ${t}`);
  await client.query("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Mama Bear', 'm@x.test', 1, unixepoch(), unixepoch())");
  actor.userId = "u1";
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(requireAssignmentAccess).mockClear();
});

afterAll(() => {
  client.close();
});

describe("sealEntry", () => {
  it("stores a grown-up's phrase seal with who and when (epoch seconds)", async () => {
    await seed("completed");
    const before = Math.floor(Date.now() / 1000);
    await sealEntry("a1", { phrase: 2 });
    const seal = parseSeal(await storedSeal());
    expect(seal).toMatchObject({ phrase: 2, by: "Mama Bear" });
    expect(SEAL_PHRASES[seal!.phrase!]).toBe("You kept going!");
    expect(seal!.at).toBeGreaterThanOrEqual(before);
    expect(seal!.at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(requireAssignmentAccess).toHaveBeenCalledWith("a1", { write: true });
    expect(revalidatePath).toHaveBeenCalledWith("/quests");
    expect(revalidatePath).toHaveBeenCalledWith("/tavern");
  });

  it("stores a sanitized note seal, and replaces an earlier seal", async () => {
    await seed("completed", JSON.stringify({ phrase: 0, by: "Dad", at: 1 }));
    await sealEntry("a1", { note: "  You drew the <b>whole</b> map!  " });
    const seal = parseSeal(await storedSeal());
    expect(seal).toMatchObject({ note: "You drew the whole map!", by: "Mama Bear" });
    expect(seal!.phrase).toBeUndefined();
  });

  it("refuses a hero, and writes nothing", async () => {
    await seed("completed");
    actor.userId = "child:c1";
    await expect(sealEntry("a1", { phrase: 1 })).rejects.toThrow("Only a grown-up can seal a page of the Chronicle.");
    expect(await storedSeal()).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a quest that is not finished", async () => {
    for (const status of ["pending", "skipped", "stuck", "excused"]) {
      await client.query("DELETE FROM quest_assignment");
      await client.query("DELETE FROM quest");
      await seed(status);
      await expect(sealEntry("a1", { phrase: 1 })).rejects.toThrow("Only a finished quest can be sealed.");
      expect(await storedSeal()).toBeNull();
    }
  });

  it("refuses an invalid input, and writes nothing", async () => {
    await seed("completed");
    const bad: unknown[] = [
      { phrase: 6 },
      { phrase: 1, note: "both" },
      {},
      { note: "x".repeat(61) },
      { note: "two\nlines" },
      { note: "ok", by: "Someone else", at: 1 },
      "phrase",
      null,
    ];
    for (const input of bad) await expect(sealEntry("a1", input)).rejects.toThrow("That seal couldn't be pressed.");
    expect(await storedSeal()).toBeNull();
  });

  it("names an unnamed grown-up plainly", async () => {
    await seed("completed");
    actor.userId = "ghost";
    await sealEntry("a1", { phrase: 0 });
    expect(parseSeal(await storedSeal())?.by).toBe("A grown-up");
  });
});

describe("unsealEntry", () => {
  const SEALED = JSON.stringify({ phrase: 1, by: "Dad", at: 5 });

  it("clears the seal", async () => {
    await seed("completed", SEALED);
    await unsealEntry("a1");
    expect(await storedSeal()).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/quests");
    expect(revalidatePath).toHaveBeenCalledWith("/tavern");
  });

  it("refuses a hero, and leaves the seal", async () => {
    await seed("completed", SEALED);
    actor.userId = "child:c1";
    await expect(unsealEntry("a1")).rejects.toThrow("Only a grown-up can seal a page of the Chronicle.");
    expect(await storedSeal()).toBe(SEALED);
  });

  it("refuses a quest that is not finished", async () => {
    await seed("pending", SEALED);
    await expect(unsealEntry("a1")).rejects.toThrow("Only a finished quest can be sealed.");
    expect(await storedSeal()).toBe(SEALED);
  });
});
