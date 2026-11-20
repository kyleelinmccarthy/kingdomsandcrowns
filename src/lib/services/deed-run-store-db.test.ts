// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import type { RunStart } from "@/lib/utils/deed-run-types";

/**
 * Whether a hero has answered a hands-on task of a kind before (a bench task, a lock), against a REAL libsql database: the question is
 * asked in SQL over stored JSON, so an old row of an odd shape must be passed over, never throw
 * (a throw would block the child from starting any run).
 */
const client = testDatabase("deed-run-store-db");
vi.mock("@/lib/db", () => ({ db: client.db }));

const { demoAt } = await import("./deed-run-store");

const DDL = `CREATE TABLE deed_run (
  id text PRIMARY KEY NOT NULL, child_id text NOT NULL, deed_id text, source_ref text, skill_ids text NOT NULL,
  band text NOT NULL, questions text NOT NULL, responses text DEFAULT '[]' NOT NULL,
  mastery_start text DEFAULT '{}' NOT NULL, correct_count integer DEFAULT 0 NOT NULL,
  flawless integer DEFAULT false NOT NULL, started_at integer NOT NULL, completed_at integer,
  created_at integer NOT NULL, updated_at integer NOT NULL,
  second_tries text DEFAULT '[]' NOT NULL, stars integer DEFAULT 0 NOT NULL,
  kind text DEFAULT 'deed' NOT NULL, second_chances integer DEFAULT false NOT NULL)`;

let n = 0;
async function seed(childId: string, questions: string, responses: string) {
  n += 1;
  await client.query(
    `INSERT INTO deed_run (id, child_id, skill_ids, band, questions, responses, started_at, created_at, updated_at) VALUES (?1, ?2, '[]', '3-5', ?3, ?4, 1, 1, 1)`,
    [`old${n}`, childId, questions, responses],
  );
}

const measure = { kind: "measure", id: "m", skillId: "add-10", prompt: "p", mode: "assemble", unit: "blocks", bridge: "1 + 8 = 9" };
const choice = { kind: "choice", id: "q", skillId: "add", prompt: "p", choices: ["a", "b"], answer: "a" };
// The run being started: a bench task first, unanswered.
const current: Pick<RunStart, "runId" | "kind" | "questions" | "responses"> = {
  runId: "now", kind: "deed", responses: [null],
  questions: [{ kind: "measure", id: "m", skillId: "add-10", prompt: "p", view: { mode: "assemble", unit: "blocks" } }] as RunStart["questions"],
};

beforeAll(async () => { await client.query(DDL); });
afterAll(() => client.close());

describe("demoAt reads old runs of any shape", () => {
  it("passes over a string among the questions, and an object-shaped questions, without throwing", async () => {
    await seed("odd", '["a string", {"kind":"measure"}, 3, null]', '["x",null,"x","x"]');
    await seed("odd", '{"kind":"measure","0":{"kind":"measure"}}', '["x"]');
    await seed("odd", '"kind":"measure"', '["x"]'); // not JSON at all
    await expect(demoAt("odd", "2", current)).resolves.toBe(0);
  });

  it("still finds a genuine answered bench run beside the odd ones", async () => {
    await seed("mixed", '["a string", {"kind":"measure"}]', '["x",null]');
    await seed("mixed", '{"kind":"measure"}', '["x"]');
    await seed("mixed", JSON.stringify([choice, measure]), JSON.stringify(["a", [0, 1]]));
    await expect(demoAt("mixed", "2", current)).resolves.toBeNull();
  });

  it("an unanswered bench task alone is not enough", async () => {
    await seed("unanswered", JSON.stringify([measure]), JSON.stringify([null]));
    await expect(demoAt("unanswered", "2", current)).resolves.toBe(0);
  });
});

describe("demoAt by run kind", () => {
  it("shows Aldo's demo on a build run under the same young-hero rule as a side quest", async () => {
    await expect(demoAt("kinds", "2", { ...current, kind: "build" })).resolves.toBe(0);
    await expect(demoAt("kinds", "4", { ...current, kind: "build" })).resolves.toBeNull();
  });

  it("never shows it on a review or a Crown Challenge", async () => {
    await expect(demoAt("kinds", "2", { ...current, kind: "review" })).resolves.toBeNull();
    await expect(demoAt("kinds", "2", { ...current, kind: "challenge" })).resolves.toBeNull();
  });

  it("is not shown once the hero has answered a bench task in another run", async () => {
    await seed("kinds-seen", JSON.stringify([measure]), JSON.stringify([[0, 1]]));
    await expect(demoAt("kinds-seen", "2", { ...current, kind: "build" })).resolves.toBeNull();
  });
});

describe("demoAt for a lock (R-F10)", () => {
  const pattern = { kind: "lock", id: "lp", skillId: "logic-k1", prompt: "p", view: { puzzle: "pattern", sequence: [null], tray: [] } };
  const sort1 = { kind: "lock", id: "ls", skillId: "logic-k1", prompt: "p", view: { puzzle: "sort1", items: [], bins: ["Red", "Blue"] } };
  const balance = { kind: "lock", id: "lb", skillId: "logic-g23", prompt: "p", view: { puzzle: "balance", weights: [1], target: 1 } };
  const asked = { kind: "choice", id: "q", skillId: "add", prompt: "p", view: { choices: ["a"] } };
  const shapes3 = { kind: "lock", id: "lg", skillId: "logic-g23", prompt: "p", view: { puzzle: "shapes3", symbols: [], givens: [] } };
  const words = { kind: "lock", id: "lw", skillId: "science-k1", prompt: "p", view: { puzzle: "sort", categories: ["Living", "Not living"], items: [] } };
  const cage4 = { kind: "lock", id: "lc", skillId: "logic-g45", prompt: "p", view: { puzzle: "cage4", cages: [] } };
  const storedLock = { kind: "lock", id: "old", skillId: "logic-k1", prompt: "p", puzzle: "pattern", sequence: [null], tray: [], solution: { puzzle: "pattern", cells: [1] } };
  const run = (questions: unknown[], responses?: (string | null)[]) =>
    ({ runId: "now", kind: "deed", questions, responses: responses ?? questions.map(() => null) }) as Pick<RunStart, "runId" | "kind" | "questions" | "responses">;

  it("marks the first lock of a run for a young hero who has never answered one, wherever it falls", async () => {
    await expect(demoAt("lock-new", "K", run([asked, pattern, sort1]))).resolves.toBe(1);
    await expect(demoAt("lock-new", "3", run([sort1]))).resolves.toBe(0);
  });

  it("not for an older hero, nor on a review", async () => {
    await expect(demoAt("lock-new", "4", run([pattern]))).resolves.toBeNull();
    await expect(demoAt("lock-new", "K", { ...run([pattern]), kind: "review" })).resolves.toBeNull();
  });

  it("every first lock a K–3 hero can meet has Pip (RF-g): a balance, a shape grid, a word sort", async () => {
    await expect(demoAt("lock-new", "2", run([balance, pattern]))).resolves.toBe(0);
    await expect(demoAt("lock-new", "2", run([asked, shapes3]))).resolves.toBe(1);
    await expect(demoAt("lock-new", "1", run([words]))).resolves.toBe(0);
  });

  it("only a lock Pip can show: an older hero's cage first is passed over for the pattern after it", async () => {
    await expect(demoAt("lock-new", "3", run([cage4, pattern]))).resolves.toBe(1);
    await expect(demoAt("lock-new", "3", run([cage4]))).resolves.toBeNull();
  });

  it("not once a lock is answered, in another run or earlier in this one", async () => {
    await seed("lock-seen", JSON.stringify([choice, storedLock]), JSON.stringify(["a", "pattern:1"]));
    await expect(demoAt("lock-seen", "K", run([pattern]))).resolves.toBeNull();
    await expect(demoAt("lock-mid", "K", run([balance, pattern], ["balance:1", null]))).resolves.toBeNull();
  });

  it("an answered bench task is not an answered lock, and the bench's demo still comes first in its own run", async () => {
    await seed("bench-only", JSON.stringify([measure]), JSON.stringify([[0, 1]]));
    await expect(demoAt("bench-only", "1", run([pattern]))).resolves.toBe(0);
    const bench = current.questions[0];
    await expect(demoAt("bench-only", "1", run([bench, pattern]))).resolves.toBe(1);
    await expect(demoAt("fresh-both", "1", run([bench, pattern]))).resolves.toBe(0);
  });

  it("an unanswered lock in another run is not enough", async () => {
    await seed("lock-left", JSON.stringify([storedLock]), JSON.stringify([null]));
    await expect(demoAt("lock-left", "K", run([pattern]))).resolves.toBe(0);
  });
});
