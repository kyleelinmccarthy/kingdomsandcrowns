// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * Focus skills against a REAL libsql database. The window is fixed by mocking the hero's grades
 * (every strand at grade 3), so which ids are in or out of reach is deterministic.
 */
const client = testDatabase("learning-focus-db");

vi.mock("@/lib/db", () => ({ db: client.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(async () => ({ access: { userId: "user:p1" }, familyId: "f1" })),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/deeds", () => ({
  loadHeroLevels: vi.fn(async () => ({ grades: { math: "3", reading: "3", language: "3", science: "3" } })),
}));
// `cache` memoizes per request; outside a request it would hold a stale read across tests.
vi.mock("react", async () => ({ ...(await vi.importActual<typeof import("react")>("react")), cache: <T,>(fn: T) => fn }));

const { setFocusSkills } = await import("./learning-focus");
const { loadFocusSkillIds } = await import("@/lib/services/learning-focus");
const { loadHeroLevels } = await import("@/lib/services/deeds");
const { requireChildAccess } = await import("@/lib/auth/access");

const IN = ["mul-facts", "div-facts", "place-value", "add-100"];

async function stored(): Promise<string[]> {
  const r = await client.query("SELECT skill_id FROM learning_focus WHERE child_id = 'c1' ORDER BY skill_id");
  return r.rows.map((x) => x.skill_id as string);
}

beforeAll(async () => {
  await client.query(
    `CREATE TABLE learning_focus (
      id text PRIMARY KEY NOT NULL, child_id text NOT NULL, skill_id text NOT NULL, created_at integer NOT NULL)`,
  );
  await client.query("CREATE UNIQUE INDEX learning_focus_child_skill_idx ON learning_focus (child_id, skill_id)");
});

beforeEach(async () => {
  await client.query("DELETE FROM learning_focus");
  vi.mocked(requireChildAccess).mockResolvedValue({ access: { userId: "user:p1" }, familyId: "f1" } as never);
});

afterAll(async () => {
  client.close();
});

describe("a grown-up setting focus skills", () => {
  it("sets two skills and reads them back", async () => {
    await setFocusSkills("c1", ["mul-facts", "place-value"]);
    expect((await loadFocusSkillIds("c1")).sort()).toEqual(["mul-facts", "place-value"]);
  });

  it("replaces the previous set, and an empty list clears it", async () => {
    await setFocusSkills("c1", ["mul-facts", "div-facts"]);
    await setFocusSkills("c1", ["div-facts", "add-100"]);
    expect(await stored()).toEqual(["add-100", "div-facts"]);
    await setFocusSkills("c1", []);
    expect(await stored()).toEqual([]);
  });

  it("keeps one row for a repeated id", async () => {
    await setFocusSkills("c1", ["mul-facts", "mul-facts"]);
    expect(await stored()).toEqual(["mul-facts"]);
  });

  it("only changes its own hero", async () => {
    await client.query(
      "INSERT INTO learning_focus (id, child_id, skill_id, created_at) VALUES ('x', 'c2', 'mul-facts', unixepoch())",
    );
    await setFocusSkills("c1", ["div-facts"]);
    const r = await client.query("SELECT skill_id FROM learning_focus WHERE child_id = 'c2'");
    expect(r.rows).toHaveLength(1);
  });
});

describe("refusals write nothing", () => {
  it("refuses a child setting their own focus", async () => {
    await setFocusSkills("c1", ["mul-facts"]);
    vi.mocked(requireChildAccess).mockResolvedValue({ access: { userId: "child:c1" }, familyId: "f1" } as never);
    await expect(setFocusSkills("c1", ["div-facts"])).rejects.toThrow(/grown-up/);
    expect(await stored()).toEqual(["mul-facts"]);
  });

  it("rejects four ids and changes nothing", async () => {
    await setFocusSkills("c1", ["mul-facts"]);
    await expect(setFocusSkills("c1", IN)).rejects.toThrow("Pick up to three skills.");
    expect(await stored()).toEqual(["mul-facts"]);
  });

  it("rejects an unknown id", async () => {
    await setFocusSkills("c1", ["mul-facts"]);
    await expect(setFocusSkills("c1", ["div-facts", "nope"])).rejects.toThrow(
      "That skill isn't one this hero can focus on.",
    );
    expect(await stored()).toEqual(["mul-facts"]);
  });

  it.each([
    ["no list at all", null],
    ["a bare string", "mul-facts"],
    ["an object", { 0: "mul-facts", length: 1 }],
    ["a number in the list", [1]],
    ["a null in the list", ["mul-facts", null]],
  ])("rejects %s before reading anything, and writes nothing", async (_name, skillIds) => {
    await setFocusSkills("c1", ["mul-facts"]);
    vi.mocked(loadHeroLevels).mockClear();
    await expect(setFocusSkills("c1", skillIds as never)).rejects.toThrow("That skill isn't one this hero can focus on.");
    expect(loadHeroLevels).not.toHaveBeenCalled();
    expect(await stored()).toEqual(["mul-facts"]);
  });

  it("rejects a skill two grades away", async () => {
    await expect(setFocusSkills("c1", ["frac-addsub"])).rejects.toThrow(
      "That skill isn't one this hero can focus on.",
    );
    expect(await stored()).toEqual([]);
  });
});

describe("reading focus back", () => {
  it("ignores a stored id that has fallen out of the window", async () => {
    await setFocusSkills("c1", ["mul-facts", "place-value"]);
    vi.mocked(loadHeroLevels).mockResolvedValueOnce({
      grades: { math: "6", reading: "3", language: "3", science: "3" },
    } as never);
    expect(await loadFocusSkillIds("c1")).toEqual([]);
    // The row is left alone: a demotion later brings the pick back.
    expect(await stored()).toEqual(["mul-facts", "place-value"]);
  });

  it("judges against grades the caller already holds, without reading them again", async () => {
    await setFocusSkills("c1", ["mul-facts", "place-value"]);
    vi.mocked(loadHeroLevels).mockClear();
    expect(await loadFocusSkillIds("c1", { math: "4", reading: "3", language: "3", science: "3" })).toEqual(["mul-facts", "place-value"]);
    expect(await loadFocusSkillIds("c1", { math: "6", reading: "3", language: "3", science: "3" })).toEqual([]);
    expect(loadHeroLevels).not.toHaveBeenCalled();
  });

  it("is empty for a hero with no picks", async () => {
    expect(await loadFocusSkillIds("c1")).toEqual([]);
  });
});
