// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import type { RunStart } from "@/lib/utils/deed-run-types";

/**
 * Whether a hero has seen a demo before (any bench task; a lock of one of the demo's puzzles), against a REAL libsql database: the question is
 * asked in SQL over stored JSON, so an old row of an odd shape must be passed over, never throw
 * (a throw would block the child from starting any run).
 */
const client = testDatabase("deed-run-store-db");
vi.mock("@/lib/db", () => ({ db: client.db }));

const { collectTaskKeys, demoAt, loadRecentRuneKeys, loadRecentTrailIds, RUNE_MEMORY_RUNS, TRAIL_MEMORY_RUNS } = await import("./deed-run-store");
const { RUNE_DEED_IDS, TRAIL_DEED_IDS } = await import("@/lib/utils/deeds");

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

describe("each of Pip's demos shows once, by its own puzzles (RF-g)", () => {
  // Stored as the server keeps them: `puzzle` on the task itself.
  const stored = (puzzle: string, id = puzzle) => ({ kind: "lock", id, skillId: "logic-g23", prompt: "p", puzzle, solution: { puzzle, cells: [1] } });
  const view = (puzzle: string, id = puzzle) => ({ kind: "lock", id, skillId: "logic-g23", prompt: "p", view: { puzzle } });
  const run = (questions: unknown[], responses?: (string | null)[], kind: RunStart["kind"] = "deed") =>
    ({ runId: "now", kind, questions, responses: responses ?? questions.map(() => null) }) as Pick<RunStart, "runId" | "kind" | "questions" | "responses">;

  it("a hero who answered a word sort earlier still meets Pip at their first shape grid", async () => {
    await seed("words-then-shapes", JSON.stringify([stored("sort")]), JSON.stringify(["sort:1"]));
    await expect(demoAt("words-then-shapes", "2", run([view("shapes3")]))).resolves.toBe(0);
    // In Puzzle practice too (a world run).
    await expect(demoAt("words-then-shapes", "2", run([view("shapes3")], undefined, "world"))).resolves.toBe(0);
    // A later word sort has no demo: that one is seen.
    await expect(demoAt("words-then-shapes", "2", run([view("sort"), view("shapes3")]))).resolves.toBe(1);
  });

  it("a hero who answered a shape grid gets no shape-grid demo again", async () => {
    await seed("shapes-seen", JSON.stringify([stored("shapes3")]), JSON.stringify(["shapes3:1"]));
    await expect(demoAt("shapes-seen", "2", run([view("shapes3")]))).resolves.toBeNull();
  });

  it("the two shape sorts are one demo: an answered sort2 covers a sort1", async () => {
    await seed("sort2-seen", JSON.stringify([stored("sort2")]), JSON.stringify(["sort2:1"]));
    await expect(demoAt("sort2-seen", "2", run([view("sort1")]))).resolves.toBeNull();
    await expect(demoAt("sort2-seen", "2", run([view("sort1"), view("balance")]))).resolves.toBe(1);
  });

  it("still one demo a run: the first new one, and none once the run is past it", async () => {
    await expect(demoAt("fresh-locks", "1", run([view("sort"), view("shapes3")]))).resolves.toBe(0);
    // Resumed after the word sort was answered: the shape grid is not a second demo.
    await expect(demoAt("fresh-locks", "1", run([view("sort"), view("shapes3")], ["sort:1", null]))).resolves.toBeNull();
    // A seen word sort first, then a new shape grid: the grid is the run's demo, before and after the sort is answered.
    await seed("words-seen", JSON.stringify([stored("sort")]), JSON.stringify(["sort:1"]));
    await expect(demoAt("words-seen", "1", run([view("sort"), view("shapes3")], ["sort:1", null]))).resolves.toBe(1);
  });

  it("the bench is unchanged: any answered bench task, assemble or cut, ends Aldo's demos", async () => {
    await seed("cut-seen", JSON.stringify([{ ...measure, mode: "cut" }]), JSON.stringify(["c:3"]));
    await expect(demoAt("cut-seen", "2", current)).resolves.toBeNull();
    const cut = { kind: "measure", id: "c", skillId: "sub-10", prompt: "p", view: { mode: "cut", unit: "blocks" } };
    await expect(demoAt("fresh-bench", "2", run([cut, current.questions[0]]))).resolves.toBe(0);
    await expect(demoAt("fresh-bench", "2", run([cut, current.questions[0]], ["c:3", null]))).resolves.toBeNull();
  });
});

describe("demoAt for a trail: Watch Pip follow a clue (R-H16)", () => {
  // As the browser is shown a clue, and as the server stores one.
  const shown = (id = "t1") => ({ kind: "trail", id, skillId: "read-g1", prompt: "Go to the mill.", view: {} });
  const stored = { kind: "trail", id: "old", skillId: "read-g1", prompt: "Go to the mill.", answer: "landmark:mill", redirect: "r", trail: "trail-k1/mill" };
  const storedLock = { kind: "lock", id: "lk", skillId: "logic-k1", prompt: "p", puzzle: "pattern", sequence: [null], tray: [], solution: { puzzle: "pattern", cells: [1] } };
  const run = (questions: unknown[], responses?: (string | null)[]) =>
    ({ runId: "now", kind: "deed", questions, responses: responses ?? questions.map(() => null) }) as Pick<RunStart, "runId" | "kind" | "questions" | "responses">;

  it("marks a K hero's first clue, and a grade-3 hero's, never an older hero's", async () => {
    await expect(demoAt("trail-new", "K", run([shown("a"), shown("b")]))).resolves.toBe(0);
    await expect(demoAt("trail-new", "3", run([shown()]))).resolves.toBe(0);
    await expect(demoAt("trail-new", "4", run([shown()]))).resolves.toBeNull();
  });

  it("is not shown after a clue answered in another run, nor past one answered in this run", async () => {
    await seed("trail-seen", JSON.stringify([stored]), JSON.stringify(["landmark:well"]));
    await expect(demoAt("trail-seen", "K", run([shown()]))).resolves.toBeNull();
    await expect(demoAt("trail-mid", "K", run([shown("a"), shown("b")], ["landmark:mill", null]))).resolves.toBeNull();
  });

  it("a clue left unanswered in another run is not enough", async () => {
    await seed("trail-left", JSON.stringify([stored]), JSON.stringify([null]));
    await expect(demoAt("trail-left", "1", run([shown()]))).resolves.toBe(0);
  });

  it("a lock or a bench task answered elsewhere does not hide it", async () => {
    await seed("trail-lock", JSON.stringify([storedLock]), JSON.stringify(["pattern:1"]));
    await seed("trail-lock", JSON.stringify([measure]), JSON.stringify([[0, 1]]));
    await expect(demoAt("trail-lock", "2", run([shown()]))).resolves.toBe(0);
  });

  it("an answered clue hides neither Pip's lock demo nor Aldo's", async () => {
    await seed("trail-only", JSON.stringify([stored]), JSON.stringify(["landmark:mill"]));
    const pattern = { kind: "lock", id: "lp", skillId: "logic-k1", prompt: "p", view: { puzzle: "pattern", sequence: [null], tray: [] } };
    await expect(demoAt("trail-only", "K", run([pattern]))).resolves.toBe(0);
    await expect(demoAt("trail-only", "K", current)).resolves.toBe(0);
  });
});

describe("demoAt for a rune: Watch Pip build a rune (R-I12)", () => {
  // As the browser is shown a rune, and as the server stores one.
  const shown = (id = "r1") => ({ kind: "rune", id, skillId: "spell-g23", prompt: "The wagon is broken. Build the word you hear.", view: { effect: "mend", object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: ["d", "m", "a", "e", "n", "i"], listen: true } });
  const stored = {
    kind: "rune", id: "old", skillId: "spell-g23", prompt: "p", effect: "mend", object: { id: "rune:west-wagon", label: "the broken wagon" },
    tiles: ["d", "m", "a", "e", "n", "i"], listen: true, words: ["mend"], hint: "h", entry: "rune-g23/fx-mend-01",
  };
  const storedClue = { kind: "trail", id: "oc", skillId: "read-g1", prompt: "Go to the mill.", answer: "landmark:mill", redirect: "r", trail: "trail-k1/mill" };
  const storedLock = { kind: "lock", id: "lk", skillId: "logic-k1", prompt: "p", puzzle: "pattern", sequence: [null], tray: [], solution: { puzzle: "pattern", cells: [1] } };
  const run = (questions: unknown[], responses?: (string | null)[]) =>
    ({ runId: "now", kind: "deed", questions, responses: responses ?? questions.map(() => null) }) as Pick<RunStart, "runId" | "kind" | "questions" | "responses">;

  it("marks a grade-2 hero's first rune, and a K hero's, never an older hero's", async () => {
    await expect(demoAt("rune-new", "2", run([shown("a"), shown("b")]))).resolves.toBe(0);
    await expect(demoAt("rune-new", "K", run([shown()]))).resolves.toBe(0);
    await expect(demoAt("rune-new", "4", run([shown()]))).resolves.toBeNull();
  });

  it("is not shown after a rune answered in another run", async () => {
    await seed("rune-seen", JSON.stringify([stored]), JSON.stringify(["r:1,3,4,0"]));
    await expect(demoAt("rune-seen", "2", run([shown()]))).resolves.toBeNull();
  });

  it("a lock or a clue answered elsewhere does not hide it", async () => {
    await seed("rune-others", JSON.stringify([storedLock]), JSON.stringify(["pattern:1"]));
    await seed("rune-others", JSON.stringify([storedClue]), JSON.stringify(["landmark:mill"]));
    await expect(demoAt("rune-others", "2", run([shown()]))).resolves.toBe(0);
  });
});

describe("loadRecentTrailIds: the trails a hero met in their last reading side quests (R-H11)", () => {
  /** A stored clue of trail `key`, as the server keeps it. */
  const clue = (key: string, i = 0) => ({
    kind: "trail", id: `read-g3:trail:${key.length.toString(16).padStart(4, "0")}${i}`, skillId: "read-g3", prompt: "p",
    answer: "landmark:mill", redirect: "r", trail: key,
  });
  let startedAt = 1000;
  async function reading(childId: string, deedId: string, questions: string, over: { completed?: boolean; kind?: string } = {}) {
    n += 1;
    startedAt += 60;
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, skill_ids, band, questions, responses, started_at, completed_at, created_at, updated_at, kind)
       VALUES (?1, ?2, ?3, '[]', 'g23', ?4, '[]', ?5, ?6, ?5, ?5, ?7)`,
      [`trail${n}`, childId, deedId, questions, startedAt, over.completed ? startedAt + 30 : null, over.kind ?? "deed"],
    );
  }

  it("is a week of three reading side quests a day, and names the three reading deeds", () => {
    expect(TRAIL_MEMORY_RUNS).toBe(21);
    expect([...TRAIL_DEED_IDS]).toEqual(["well-signs", "chapel-scroll", "library-catalog"]);
  });

  it("reads the last 21 reading runs only, open or finished, of any kind, and ignores every other side quest", async () => {
    // 22 reading runs, oldest first: run 0 falls out of the memory.
    for (let i = 0; i < 22; i++) {
      const deed = TRAIL_DEED_IDS[i % 3];
      await reading("mem", deed, JSON.stringify([clue(`trail-g23/r${i}a`), clue(`trail-g23/r${i}a`, 1), clue(`trail-g23/r${i}b`)]), {
        completed: i % 2 === 0, kind: i === 5 ? "challenge" : "deed",
      });
    }
    // A newer side quest of another deed that somehow held a trail task: not a reading run, not read.
    await reading("mem", "well-stones", JSON.stringify([clue("trail-g23/stones")]));
    // Another hero's reading run.
    await reading("other", "well-signs", JSON.stringify([clue("trail-g23/theirs")]));

    const ids = await loadRecentTrailIds("mem", TRAIL_DEED_IDS);
    const expected = Array.from({ length: 21 }, (_, k) => 21 - k).flatMap((i) => [`trail-g23/r${i}a`, `trail-g23/r${i}b`]);
    expect(ids).toEqual(expected);
    expect(ids).not.toContain("trail-g23/r0a");
    expect(ids).not.toContain("trail-g23/stones");
    expect(ids).not.toContain("trail-g23/theirs");
  });

  it("skips a row that will not parse or has an odd shape, and reads the trail tasks of the rest", async () => {
    await reading("odd", "well-signs", "nope");
    await reading("odd", "chapel-scroll", '{"kind":"trail","trail":"trail-g23/object"}');
    await reading("odd", "library-catalog", JSON.stringify([
      "a string", null, 7, { kind: "trail", trail: 5 }, { kind: "choice", trail: "trail-g23/not-a-trail-task" }, { trail: "trail-g23/no-kind" },
      clue("trail-g23/kept"),
    ]));
    await reading("odd", "well-signs", JSON.stringify([{ id: "q", skillId: "read-g3", prompt: "p", choices: ["a", "b"], answer: "a" }]));
    await expect(loadRecentTrailIds("odd", TRAIL_DEED_IDS)).resolves.toEqual(["trail-g23/kept"]);
  });

  it("is empty for a hero with no reading runs, or when asked of no deed", async () => {
    await expect(loadRecentTrailIds("nobody", TRAIL_DEED_IDS)).resolves.toEqual([]);
    await reading("asked-none", "well-signs", JSON.stringify([clue("trail-g23/x")]));
    await expect(loadRecentTrailIds("asked-none", [])).resolves.toEqual([]);
  });
});

describe("collectTaskKeys: the keys a hero's stored runs hold, of one kind", () => {
  const rows = (...qs: unknown[]) => qs.map((q) => ({ questions: typeof q === "string" ? q : JSON.stringify(q) }));

  it("reads one field of one kind's tasks, row by row, each key once", () => {
    const keys = collectTaskKeys(rows(
      [{ kind: "rune", entry: "rune-g68/b" }, { kind: "trail", trail: "trail-g23/t" }, { kind: "rune", entry: "rune-g68/a" }],
      [{ kind: "rune", entry: "rune-g68/a" }, { kind: "rune", entry: "rune-g68/c" }],
    ), "rune", "entry");
    expect(keys).toEqual(["rune-g68/b", "rune-g68/a", "rune-g68/c"]);
    expect(collectTaskKeys(rows([{ kind: "trail", trail: "trail-g23/t" }, { kind: "rune", entry: "x" }]), "trail", "trail")).toEqual(["trail-g23/t"]);
  });

  it("skips a row that will not parse or has an odd shape, never throwing", () => {
    expect(collectTaskKeys(rows(
      "nope", '{"kind":"rune","entry":"rune-k1/object"}', "null",
      ["a string", null, 7, { kind: "rune", entry: 5 }, { kind: "trail", entry: "rune-k1/a-trail" }, { entry: "rune-k1/no-kind" }, { kind: "rune", entry: "rune-k1/kept" }],
    ), "rune", "entry")).toEqual(["rune-k1/kept"]);
    expect(collectTaskKeys([], "rune", "entry")).toEqual([]);
  });
});

describe("loadRecentRuneKeys: the rune entries a hero met in their last rune runs (R-I19)", () => {
  /** A stored rune task of entry `key`, as the server keeps it. */
  const word = (key: string) => ({
    kind: "rune", id: `vocab-g68:rune:${key.length.toString(16).padStart(8, "0")}`, skillId: "vocab-g68", prompt: "p", effect: "mend",
    object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: ["a", "b"], listen: false, words: ["ab"], hint: "h", entry: key,
  });
  let startedAt = 5000;
  async function run(childId: string, questions: string, over: { kind?: string; sourceRef?: string | null; deedId?: string | null; completed?: boolean } = {}) {
    n += 1;
    startedAt += 60;
    await client.query(
      `INSERT INTO deed_run (id, child_id, deed_id, source_ref, skill_ids, band, questions, responses, started_at, completed_at, created_at, updated_at, kind)
       VALUES (?1, ?2, ?3, ?4, '[]', 'g68', ?5, '[]', ?6, ?7, ?6, ?6, ?8)`,
      [`rune${n}`, childId, over.deedId ?? null, over.sourceRef === undefined ? "rune:west-wagon" : over.sourceRef, questions, startedAt,
        over.completed ? startedAt + 30 : null, over.kind ?? "world"],
    );
  }

  it("is a week of three rune runs a day, and no side quest plays runes yet", () => {
    expect(RUNE_MEMORY_RUNS).toBe(21);
    expect([...RUNE_DEED_IDS]).toEqual([]);
  });

  it("reads the last 21 rune world runs only, open or finished, newest first", async () => {
    // 22 rune world runs, oldest first, on several objects: run 0 falls out of the memory.
    const objects = ["rune:west-wagon", "rune:lane-lantern", "rune:appleway-cart"];
    for (let i = 0; i < 22; i++) {
      await run("mem", JSON.stringify([word(`rune-g68/w${i}`)]), { sourceRef: objects[i % 3], completed: i % 2 === 0 });
    }
    const keys = await loadRecentRuneKeys("mem");
    expect(keys).toEqual(Array.from({ length: 21 }, (_, k) => `rune-g68/w${21 - k}`));
    expect(keys).not.toContain("rune-g68/w0");
  });

  it("ignores a chest's run, Puzzle practice, a tower run, a side quest, another hero's runs, and a row that will not parse", async () => {
    await run("mixed", JSON.stringify([word("rune-g68/kept")]));
    await run("mixed", JSON.stringify([word("rune-g68/chest")]), { sourceRef: "chest:west-lane" });
    await run("mixed", JSON.stringify([word("rune-g68/practice")]), { sourceRef: "practice" });
    await run("mixed", JSON.stringify([word("rune-g68/no-ref")]), { sourceRef: null });
    await run("mixed", JSON.stringify([word("rune-g68/tower")]), { kind: "tower", sourceRef: "rune:west-wagon" });
    await run("mixed", JSON.stringify([word("rune-g68/side-quest")]), { kind: "deed", deedId: "mill-ledger", sourceRef: null });
    await run("mixed", "nope");
    await run("someone-else", JSON.stringify([word("rune-g68/theirs")]));
    expect(await loadRecentRuneKeys("mixed")).toEqual(["rune-g68/kept"]);
  });

  it("never lets other runs crowd the memory: newer chest runs push no rune run out", async () => {
    for (let i = 0; i < 21; i++) await run("crowd", JSON.stringify([word(`rune-g68/c${i}`)]));
    for (let i = 0; i < 5; i++) await run("crowd", JSON.stringify([word("rune-g68/chest")]), { sourceRef: "chest:east-lane" });
    const keys = await loadRecentRuneKeys("crowd");
    expect(keys).toHaveLength(21);
    expect(keys).toContain("rune-g68/c0");
  });

  it("is empty for a hero with no rune runs", async () => {
    await expect(loadRecentRuneKeys("nobody")).resolves.toEqual([]);
  });
});
