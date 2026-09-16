import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  choicesFor,
  compareSheet,
  extractSheet,
  formatReport,
  loadPool,
  parseSheet,
  poolsWithSheets,
  questionCode,
  renderSheet,
  runPool,
  sheetPath,
  type Pool,
  type PoolItem,
  type Resolution,
} from "./blind-pass";

/**
 * A fixture pool whose third item carries a **deliberately wrong key**: `sun-rises` is keyed
 * to "In the west", which is false.
 *
 * This is the whole point of the test file. A comparator exercised only against a sheet that
 * agrees with the key proves nothing at all — it would pass just as happily if `compareSheet`
 * returned `ok: true` unconditionally, and a check that cannot fail is worse than no check
 * because it gets trusted. So the sheet below is filled in with the RIGHT answer, and the test
 * asserts the disagreement comes back.
 */
const WRONG_KEY_ITEM = "fix-sun-rises";

function fixture(): Pool {
  return {
    poolId: "fixture-pool",
    grade: "3",
    items: [
      {
        id: "fix-water-boils",
        prompt: "At what temperature does water boil at sea level?",
        answer: "100 degrees Celsius",
        distractors: ["0 degrees Celsius", "50 degrees Celsius", "200 degrees Celsius"],
        level: 0,
      },
      {
        id: "fix-plant-part",
        prompt: "Which part of a plant takes in water from the soil?",
        answer: "The roots",
        distractors: ["The petals", "The leaves", "The stem"],
        level: 1,
      },
      {
        id: WRONG_KEY_ITEM,
        prompt: "Where does the sun rise?",
        // WRONG ON PURPOSE. The sun rises in the east.
        answer: "In the west",
        distractors: ["In the east", "In the north", "In the south"],
        level: 1,
      },
    ],
  };
}

/**
 * Fills in a sheet the way a reviewer does: by reading the sheet text and nothing else.
 *
 * `answerFor` is handed the prompt and the four choices exactly as the sheet presents them —
 * it is never given the pool — so a test cannot accidentally "answer" by copying the key.
 */
function fillIn(
  markdown: string,
  answerFor: (prompt: string, choices: string[]) => { answer: string; alsoDefensible?: string[] } | null,
): string {
  const letters = ["A", "B", "C", "D"];
  return markdown
    .split(/^---$/m)
    .map((block) => {
      if (!/^## /m.test(block)) return block;
      const prompt = block.split("\n").filter((l) => l.trim())[1] ?? "";
      const choices: string[] = [];
      for (const line of block.split("\n")) {
        const option = line.match(/^- ([A-D])\.\s+(.*)$/);
        if (option) choices[letters.indexOf(option[1])] = option[2].trim();
      }
      const response = answerFor(prompt, choices);
      if (!response) return block;
      const letter = letters[choices.indexOf(response.answer)] ?? "?";
      const second = (response.alsoDefensible ?? [])
        .map((text) => letters[choices.indexOf(text)])
        .filter(Boolean)
        .join(", ");
      return block
        .replace(/^Answer:$/m, `Answer: ${letter}`)
        .replace(/^Also defensible:$/m, `Also defensible: ${second || "none"}`);
    })
    .join("---");
}

/** A reviewer who answers everything correctly, on the merits, without seeing the pool. */
function knowledgeable(prompt: string, choices: string[]) {
  const truth: Record<string, string> = {
    "At what temperature does water boil at sea level?": "100 degrees Celsius",
    "Which part of a plant takes in water from the soil?": "The roots",
    "Where does the sun rise?": "In the east",
  };
  const answer = truth[prompt];
  expect(choices, `fixture answer missing from the sheet for: ${prompt}`).toContain(answer);
  return { answer };
}

describe("blind pass — the sheet", () => {
  it("gives every item four choices and never says which is keyed", () => {
    const pool = fixture();
    const sheet = extractSheet(pool);
    expect(sheet.questions).toHaveLength(3);
    for (const question of sheet.questions) {
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
    }
    const markdown = renderSheet(sheet);
    // Nothing in the rendered sheet may mark, name or hint at the key.
    expect(markdown).not.toContain('"answer"');
    expect(markdown).not.toContain("distractor");
    // Every `Answer:` line is blank — the reviewer's to fill, not the sheet's to give.
    for (const line of markdown.split("\n").filter((l) => l.startsWith("Answer:"))) {
      expect(line).toBe("Answer:");
    }
  });

  it("orders the choices the same way on every run", () => {
    const pool = fixture();
    const once = renderSheet(extractSheet(pool));
    const again = renderSheet(extractSheet(fixture()));
    expect(again).toBe(once);
    expect(choicesFor(pool.items[0])).toEqual(choicesFor(fixture().items[0]));
  });

  /**
   * The presented order must depend on the item id and the set of options, never on which
   * option is keyed — otherwise the order leaks the key, and correcting a key would re-letter
   * a sheet somebody had already answered.
   */
  it("presents the same order whichever option is the key", () => {
    const item = fixture().items[0];
    const keyed: PoolItem = {
      ...item,
      answer: item.distractors[1],
      distractors: [item.answer, item.distractors[0], item.distractors[2]],
    };
    expect(choicesFor(keyed)).toEqual(choicesFor(item));
    expect(questionCode(keyed)).toBe(questionCode(item));

    // The strongest form of it: move the key on every item and the sheet does not change by
    // one byte. Whatever the reviewer reads, none of it came from the key.
    const pool = fixture();
    const permuted: Pool = {
      ...pool,
      items: pool.items.map((i) => ({
        ...i,
        answer: i.distractors[0],
        distractors: [i.answer, i.distractors[1], i.distractors[2]],
      })),
    };
    expect(renderSheet(extractSheet(permuted))).toBe(renderSheet(extractSheet(pool)));
  });

  /**
   * `readAloud` holds the answer word itself in every pool that has one — the sight-word and
   * spelling pools ask "Which word is X?" and put X in `readAloud`. Emitting it would hand the
   * reviewer the key.
   */
  it("never puts readAloud on the sheet", () => {
    const pool: Pool = {
      poolId: "leak-pool",
      grade: "1",
      items: [
        {
          id: "leak-us",
          prompt: 'Which word is "us"?',
          answer: "us",
          distractors: ["use", "our", "up"],
          readAloud: "PINEAPPLE",
          level: 0,
        },
      ],
    };
    expect(renderSheet(extractSheet(pool))).not.toContain("PINEAPPLE");
  });
});

describe("blind pass — the comparison", () => {
  /**
   * THE TRAP. The fixture keys "Where does the sun rise?" to "In the west". A reviewer who
   * knows better answers "In the east". If this test can be made to pass by a comparator that
   * reports nothing, the entire blind pass is decoration.
   */
  it("reports a wrong key when the reviewer answers correctly", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const report = compareSheet(pool, parseSheet(filled).answers);

    expect(report.ok).toBe(false);
    expect(report.checked).toBe(3);
    expect(report.agreed).toBe(2);
    expect(report.unresolved).toHaveLength(1);

    const flag = report.unresolved[0];
    expect(flag.itemId).toBe(WRONG_KEY_ITEM);
    expect(flag.kind).toBe("disagreement");
    expect(flag.key).toBe("In the west");
    expect(flag.reviewerChoice).toBe("In the east");
    expect(formatReport(report)).toContain("FAIL");
  });

  it("passes once the wrong key is corrected", () => {
    const pool = fixture();
    const item = pool.items.find((i) => i.id === WRONG_KEY_ITEM)!;
    item.answer = "In the east";
    item.distractors = ["In the west", "In the north", "In the south"];

    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const report = compareSheet(pool, parseSheet(filled).answers);
    expect(report.ok).toBe(true);
    expect(report.agreed).toBe(3);
    expect(report.flags).toHaveLength(0);
  });

  /**
   * The half of §6.5.2 that is easy to leave out. The reviewer agrees with the key and the
   * item is still defective, because a second option is also defensible.
   */
  it("flags an item where the reviewer agrees but calls another option defensible too", () => {
    const pool: Pool = {
      poolId: "ambiguous-pool",
      grade: "4",
      items: [
        {
          id: "amb-mammal",
          prompt: "Which of these is a mammal?",
          answer: "A whale",
          // "A bat" is also a mammal. The key is right and the question is still broken.
          distractors: ["A bat", "A shark", "A lizard"],
          level: 2,
        },
      ],
    };
    const filled = fillIn(renderSheet(extractSheet(pool)), () => ({
      answer: "A whale",
      alsoDefensible: ["A bat"],
    }));
    const report = compareSheet(pool, parseSheet(filled).answers);

    expect(report.ok).toBe(false);
    expect(report.agreed).toBe(0);
    expect(report.unresolved[0].kind).toBe("ambiguity");
    expect(report.unresolved[0].alsoDefensible).toEqual(["A bat"]);
  });

  it("flags an item the reviewer could not answer at all", () => {
    const pool = fixture();
    const markdown = renderSheet(extractSheet(pool)).replace(
      /^Answer:$/gm,
      "Answer: ?",
    ).replace(/^Also defensible:$/gm, "Also defensible: none");
    const report = compareSheet(pool, parseSheet(markdown).answers);
    expect(report.flags.map((f) => f.kind)).toEqual(["unanswerable", "unanswerable", "unanswerable"]);
    expect(report.ok).toBe(false);
  });

  it("counts an unanswered item against the pool rather than passing it in silence", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), (prompt, choices) =>
      prompt === "Where does the sun rise?" ? null : knowledgeable(prompt, choices),
    );
    const report = compareSheet(pool, parseSheet(filled).answers);
    expect(report.missing).toEqual([WRONG_KEY_ITEM]);
    expect(report.ok).toBe(false);
  });

  it("refuses an answer given before the question was edited", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const edited = fixture();
    edited.items[0].prompt = "At what temperature does water freeze at sea level?";
    edited.items[0].answer = "0 degrees Celsius";

    const report = compareSheet(edited, parseSheet(filled).answers);
    expect(report.stale).toEqual(["fix-water-boils"]);
    expect(report.missing).not.toContain("fix-water-boils");
    expect(report.ok).toBe(false);
  });

  it("reports an answer for an item the pool does not have", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable).replace(
      "`fix-plant-part`",
      "`fix-plant-part-renamed`",
    );
    const report = compareSheet(pool, parseSheet(filled).answers);
    expect(report.unknown).toEqual(["fix-plant-part-renamed"]);
    expect(report.ok).toBe(false);
  });
});

describe("blind pass — resolutions", () => {
  const settle = (pool: Pool, itemId: string, overrides: Partial<Resolution> = {}): Resolution => {
    const item = pool.items.find((i) => i.id === itemId)!;
    return {
      itemId,
      code: questionCode(item),
      keyAt: item.answer,
      verdict: "reviewer-was-wrong",
      note: "Checked against the source; the key stands.",
      resolvedBy: "kylee",
      resolvedAt: "2026-09-16",
      ...overrides,
    };
  };

  /**
   * A disagreement is not automatically a content bug — the reviewer can be wrong. Saying so
   * in writing is a legitimate settlement, and it is what stops the item being argued about
   * again on every future run.
   */
  it("lets a recorded settlement clear a flag without changing the item", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const answers = parseSheet(filled).answers;

    const before = compareSheet(pool, answers);
    expect(before.ok).toBe(false);

    const after = compareSheet(pool, answers, [settle(pool, WRONG_KEY_ITEM)]);
    expect(after.ok).toBe(true);
    expect(after.flags).toHaveLength(1);
    expect(after.unresolved).toHaveLength(0);
    expect(after.flags[0].resolution?.verdict).toBe("reviewer-was-wrong");
    expect(formatReport(after)).toContain("resolved: reviewer-was-wrong");
  });

  it("re-opens a settlement when the key it was about changes", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const resolution = settle(pool, WRONG_KEY_ITEM);

    const item = pool.items.find((i) => i.id === WRONG_KEY_ITEM)!;
    item.answer = "In the north";
    item.distractors = ["In the east", "In the west", "In the south"];

    const report = compareSheet(pool, parseSheet(filled).answers, [resolution]);
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0].key).toBe("In the north");
  });

  it("re-opens a settlement when the question itself is rewritten", () => {
    const pool = fixture();
    const filled = fillIn(renderSheet(extractSheet(pool)), knowledgeable);
    const resolution = settle(pool, WRONG_KEY_ITEM);

    const rewritten = fixture();
    const item = rewritten.items.find((i) => i.id === WRONG_KEY_ITEM)!;
    item.prompt = "In which direction does the sun rise?";

    const report = compareSheet(rewritten, parseSheet(filled).answers, [resolution]);
    // The answer was given for a question that no longer exists, so it is not evidence either
    // way, and the settlement it produced does not carry over.
    expect(report.stale).toContain(WRONG_KEY_ITEM);
    expect(report.ok).toBe(false);
  });
});

describe("blind pass — reading a sheet back", () => {
  const pool = fixture();
  const blank = renderSheet(extractSheet(pool));
  const choices = choicesFor(pool.items[0]);

  it.each([
    ["a bare letter", "B"],
    ["a lowercase letter", "b"],
    ["a letter with a full stop", "B."],
    ["a letter with a bracket", "B)"],
    ["the option written out", choices[1]],
  ])("accepts %s", (_label, written) => {
    const filled = blank.replace(/^Answer:$/m, `Answer: ${written}`);
    expect(parseSheet(filled).answers[0].choice).toBe(choices[1]);
  });

  it.each(["none", "None", "-", "n/a", ""])("treats %s as no second option", (written) => {
    const filled = blank
      .replace(/^Answer:$/m, "Answer: A")
      .replace(/^Also defensible:$/m, `Also defensible: ${written}`);
    expect(parseSheet(filled).answers[0].alsoDefensible).toEqual([]);
  });

  it("reads several defensible options however they are separated", () => {
    const filled = blank
      .replace(/^Answer:$/m, "Answer: A")
      .replace(/^Also defensible:$/m, "Also defensible: B and C");
    expect(parseSheet(filled).answers[0].alsoDefensible).toEqual([choices[1], choices[2]]);
  });

  it("ignores the reviewer's own answer repeated on the defensible line", () => {
    const filled = blank
      .replace(/^Answer:$/m, "Answer: A")
      .replace(/^Also defensible:$/m, "Also defensible: A");
    expect(parseSheet(filled).answers[0].alsoDefensible).toEqual([]);
  });

  it("names the pool the sheet was cut from", () => {
    expect(parseSheet(blank).poolId).toBe("fixture-pool");
  });
});

/**
 * The gate the content tasks are graded by.
 *
 * It is vacuous today — no sheets exist yet, and Task 3 owns running the pass over the twelve
 * pools that do. It stops being vacuous the moment a sheet lands in `src/content/review/`, and
 * from then on a sheet that disagrees with its pool, or a flag nobody settled, fails the suite
 * rather than sitting in a report nobody reads.
 */
describe("blind pass — the sheets on disk", () => {
  const poolIds = poolsWithSheets();

  it("names a pool that exists for every sheet", () => {
    for (const poolId of poolIds) {
      expect(fs.existsSync(sheetPath(poolId)), `sheet for ${poolId}`).toBe(true);
      expect(() => loadPool(poolId), `pool for sheet ${poolId}`).not.toThrow();
    }
  });

  for (const poolId of poolIds) {
    it(`has every flag on ${poolId} settled`, () => {
      const report = runPool(poolId);
      expect(formatReport(report), formatReport(report)).toContain("PASS");
      expect(report.ok).toBe(true);
    });
  }
});
