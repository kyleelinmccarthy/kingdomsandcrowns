// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import type { RunStart } from "@/lib/utils/deed-run-types";

/**
 * Whether a hero has answered a bench task before, against a REAL libsql database: the question is
 * asked in SQL over stored JSON, so an old row of an odd shape must be passed over, never throw
 * (a throw would block the child from starting any run).
 */
const client = testDatabase("deed-run-store-db");
vi.mock("@/lib/db", () => ({ db: client.db }));

const { benchDemoAt } = await import("./deed-run-store");

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

describe("benchDemoAt reads old runs of any shape", () => {
  it("passes over a string among the questions, and an object-shaped questions, without throwing", async () => {
    await seed("odd", '["a string", {"kind":"measure"}, 3, null]', '["x",null,"x","x"]');
    await seed("odd", '{"kind":"measure","0":{"kind":"measure"}}', '["x"]');
    await seed("odd", '"kind":"measure"', '["x"]'); // not JSON at all
    await expect(benchDemoAt("odd", "2", current)).resolves.toBe(0);
  });

  it("still finds a genuine answered bench run beside the odd ones", async () => {
    await seed("mixed", '["a string", {"kind":"measure"}]', '["x",null]');
    await seed("mixed", '{"kind":"measure"}', '["x"]');
    await seed("mixed", JSON.stringify([choice, measure]), JSON.stringify(["a", [0, 1]]));
    await expect(benchDemoAt("mixed", "2", current)).resolves.toBeNull();
  });

  it("an unanswered bench task alone is not enough", async () => {
    await seed("unanswered", JSON.stringify([measure]), JSON.stringify([null]));
    await expect(benchDemoAt("unanswered", "2", current)).resolves.toBe(0);
  });
});
