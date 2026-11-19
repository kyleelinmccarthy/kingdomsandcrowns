// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/** A subject's material against a REAL libsql database: only a grown-up chooses it, and null means "from the name". */
const client = testDatabase("subjects-db");

vi.mock("@/lib/db", () => ({ db: client.db }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "user:p1" }, familyId: "f1" })),
  requireSubjectAccess: vi.fn(async () => ({ access: { userId: "user:p1" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { createSubject, updateSubject } = await import("./subjects");
const { requireSubjectAccess } = await import("@/lib/auth/access");

async function stored(id: string): Promise<string | null> {
  const r = await client.query("SELECT material FROM subject WHERE id = ?1", [id]);
  return r.rows[0].material as string | null;
}

beforeAll(async () => {
  await client.query(
    `CREATE TABLE subject (
      id text PRIMARY KEY NOT NULL, child_id text NOT NULL, name text NOT NULL, color text, icon text,
      is_default integer DEFAULT 0 NOT NULL, is_required integer DEFAULT 0 NOT NULL, is_active integer DEFAULT 1 NOT NULL,
      spell_school text DEFAULT 'none' NOT NULL, material text, sort_order integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)`,
  );
});

beforeEach(async () => {
  await client.query("DELETE FROM subject");
  await client.query("INSERT INTO subject (id, child_id, name, created_at) VALUES ('s1', 'c1', 'Math', 0)");
  vi.mocked(requireSubjectAccess).mockResolvedValue({ access: { userId: "user:p1" }, familyId: "f1" } as never);
});

afterAll(async () => {
  client.close();
});

describe("choosing what a subject's work brings", () => {
  it("lets a grown-up set ink, then clear it back to the name", async () => {
    await updateSubject("s1", { material: "ink" });
    expect(await stored("s1")).toBe("ink");
    await updateSubject("s1", { material: null });
    expect(await stored("s1")).toBeNull();
  });

  it("refuses a hero, and changes nothing", async () => {
    vi.mocked(requireSubjectAccess).mockResolvedValue({ access: { userId: "child:c1" }, familyId: "f1" } as never);
    await expect(updateSubject("s1", { material: "ink" })).rejects.toThrow(
      "Only a grown-up can choose what a subject's work brings.",
    );
    expect(await stored("s1")).toBeNull();
  });

  it("refuses a value that is not a material", async () => {
    await expect(updateSubject("s1", { material: "gold" as never })).rejects.toThrow("Choose a material from the list.");
    expect(await stored("s1")).toBeNull();
  });

  it("leaves the material alone when an edit does not mention it, even a hero's rename", async () => {
    await updateSubject("s1", { material: "dye" });
    vi.mocked(requireSubjectAccess).mockResolvedValue({ access: { userId: "child:c1" }, familyId: "f1" } as never);
    await updateSubject("s1", { name: "Painting" });
    expect(await stored("s1")).toBe("dye");
  });
});

describe("creating a subject", () => {
  it("stores a grown-up's valid material", async () => {
    const { id } = await createSubject("c1", { name: "Latin", material: "ink" });
    expect(await stored(id)).toBe("ink");
  });

  it("stores null, not the name's default, when none is given", async () => {
    const { id } = await createSubject("c1", { name: "Math" });
    expect(await stored(id)).toBeNull();
  });

  it("stores null for an invalid material", async () => {
    const bad = await createSubject("c1", { name: "Latin", material: "gold" as never });
    expect(await stored(bad.id)).toBeNull();
  });

  it("stores null for a hero's attempt", async () => {
    const { requireChildAccess } = await import("@/lib/auth/access");
    vi.mocked(requireChildAccess).mockResolvedValueOnce({ access: { userId: "child:c1" }, familyId: "f1" } as never);
    const { id } = await createSubject("c1", { name: "Latin", material: "ink" });
    expect(await stored(id)).toBeNull();
  });
});
