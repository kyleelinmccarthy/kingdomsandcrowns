import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  validatePool,
  RULES,
  LENGTH_TELL_MAX_SHARE,
  READABILITY_MIN_WORDS,
  fleschKincaidGrade,
  countSyllables,
  soundAlike,
  type Pool,
  type PoolItem,
  type Problem,
} from "./pool-validate";
import type { Grade } from "../utils/grade-levels";

/**
 * A validator tested only against content that already passes proves nothing: it can be entirely
 * vacuous and look green forever. So every rule gets a deliberately broken fixture, and each one
 * asserts BOTH that its rule fires and that no other rule does. The real corpus comes last.
 */

// ---------------------------------------------------------------------------
// A pool that passes every rule, built so that breaking one thing breaks one rule.
// ---------------------------------------------------------------------------

/** Distinct filler of an exact length, so an item's four choices have controlled lengths. */
function filler(item: number, slot: number, length: number): string {
  const head = `w${item}s${slot}`;
  return (head + "abcdefghij".repeat(4)).slice(0, Math.max(head.length, length));
}

/**
 * The answer is the longest choice in a quarter of the items and the shortest in a quarter —
 * roughly what chance gives, and well under the 60% cap, so rule 7 passes without being vacuous.
 * Prompts run to 15 plain words, over the 12-word floor rule 6 needs, and score about grade 4.4,
 * so a grade-4 pool clears the grade-6 ceiling with room but is genuinely measured.
 */
function baseItem(i: number): PoolItem {
  const rotations = [
    [14, 4, 7, 10],
    [4, 14, 10, 7],
    [10, 4, 14, 7],
    [7, 10, 4, 14],
  ];
  const lengths = rotations[i % 4];
  return {
    id: `base-${i}`,
    prompt: `Which of these is the word that best fits the empty space in sentence number ${i}?`,
    answer: filler(i, 0, lengths[0]),
    distractors: [filler(i, 1, lengths[1]), filler(i, 2, lengths[2]), filler(i, 3, lengths[3])],
    level: i % 5,
  };
}

function basePool(): Pool {
  return { poolId: "fixture", grade: "4" as Grade, items: Array.from({ length: 45 }, (_, i) => baseItem(i)) };
}

/** A pool with one item rewritten — the whole point of a fixture. */
function withItem(pool: Pool, index: number, patch: Partial<PoolItem>): Pool {
  const items = pool.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
  return { ...pool, items };
}

function rulesFired(problems: Problem[]): string[] {
  return [...new Set(problems.map((p) => p.rule))].sort();
}

describe("the fixture pool itself", () => {
  it("passes every rule, so a fixture's failure is the thing the fixture broke", () => {
    expect(validatePool(basePool())).toEqual([]);
  });

  it("is not vacuous: its prompts are long enough for rule 6 to measure them", () => {
    const prompt = basePool().items[0].prompt;
    expect((prompt.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length).toBeGreaterThanOrEqual(READABILITY_MIN_WORDS);
    expect(fleschKincaidGrade(prompt)!).toBeLessThan(6);
  });

  it("is not vacuous for rule 7 either: the answer is sometimes longest and sometimes shortest", () => {
    const items = basePool().items;
    const longest = items.filter((it) => it.answer.length > Math.max(...it.distractors.map((d) => d.length))).length;
    const shortest = items.filter((it) => it.answer.length < Math.min(...it.distractors.map((d) => d.length))).length;
    expect(longest).toBeGreaterThan(0);
    expect(shortest).toBeGreaterThan(0);
    expect(longest / items.length).toBeLessThan(LENGTH_TELL_MAX_SHARE);
    expect(shortest / items.length).toBeLessThan(LENGTH_TELL_MAX_SHARE);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — four distinct choices
// ---------------------------------------------------------------------------

describe("rule 1: four distinct choices", () => {
  it("fires when a distractor repeats the answer, and nothing else fires", () => {
    const pool = basePool();
    const broken = withItem(pool, 3, { distractors: [pool.items[3].answer, "alpha", "beta"] });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.choices]);
    expect(problems.map((p) => p.itemId)).toEqual(["base-3"]);
    expect(problems[0].detail).toContain("repeats the answer");
  });

  it("compares trimmed and case-insensitively: \"Cat\" and \" cat \" are one choice", () => {
    const broken = withItem(basePool(), 5, { answer: "Cat", distractors: [" cat ", "dog", "hen"] });
    expect(rulesFired(validatePool(broken))).toEqual([RULES.choices]);
  });

  it("fires when two distractors are the same", () => {
    const broken = withItem(basePool(), 6, { answer: "owl", distractors: ["Fox", "fox", "hen"] });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.choices]);
    expect(problems[0].detail).toContain("two distractors are the same");
  });

  it("fires when there are not exactly three distractors", () => {
    const broken = withItem(basePool(), 7, { distractors: ["one", "two"] });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.choices]);
    expect(problems[0].detail).toContain("2 distractors");
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — no duplicate prompts
// ---------------------------------------------------------------------------

describe("rule 2: no two items asking the same question", () => {
  it("fires on a repeated prompt with a shared choice, and nothing else fires", () => {
    const pool = basePool();
    const twin = pool.items[2];
    const broken = withItem(pool, 6, {
      prompt: `  ${twin.prompt.toUpperCase()}  `,
      answer: twin.answer,
      distractors: ["alpha one", "beta two", "gamma three"],
    });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.duplicatePrompt]);
    expect(problems[0].itemId).toBe("base-6");
    expect(problems[0].detail).toContain("base-2");
  });

  /** The severe case: one question, two answer keys. One of them is wrong. */
  it("fires when the same prompt carries two different answers drawn from the same choices", () => {
    const pool = basePool();
    const a = { prompt: "Which is the driest habitat?", answer: "Desert", distractors: ["Forest", "Ocean", "Tundra"] };
    const b = { prompt: "Which is the driest habitat?", answer: "Tundra", distractors: ["Desert", "Forest", "Ocean"] };
    const problems = validatePool(withItem(withItem(pool, 20, a), 21, b));
    expect(rulesFired(problems)).toEqual([RULES.duplicatePrompt]);
  });

  /**
   * The departure from the brief, guarded. A spelling item's prompt is a standing instruction —
   * naming the word would spell it — so the question lives entirely in the choices.
   */
  it("does not fire on a standing instruction whose items share no choice", () => {
    const pool = basePool();
    const words = [
      ["believe", "beleive", "beleave", "belive"],
      ["separate", "seperate", "separete", "sepparate"],
      ["rhythm", "rythm", "rhythem", "rhithm"],
    ];
    let broken = pool;
    words.forEach((w, n) => {
      broken = withItem(broken, 30 + n, { prompt: "Which is spelled correctly?", answer: w[0], distractors: w.slice(1), readAloud: w[0] });
    });
    expect(validatePool(broken)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — levels span 0-4
// ---------------------------------------------------------------------------

describe("rule 3: levels span 0-4", () => {
  it("fires when a level is missing, and nothing else fires", () => {
    const pool = basePool();
    const items = pool.items.map((it) => (it.level === 4 ? { ...it, level: 3 } : it));
    const problems = validatePool({ ...pool, items });
    expect(rulesFired(problems)).toEqual([RULES.levelSpread]);
    expect(problems).toHaveLength(1);
    expect(problems[0].detail).toBe("no item at level 4");
    expect(problems[0].itemId).toBeNull();
  });

  it("fires when one level holds more than half the pool", () => {
    const pool = basePool();
    const items = pool.items.map((it, i) => ({ ...it, level: i < 5 ? i : 2 }));
    const problems = validatePool({ ...pool, items });
    expect(rulesFired(problems)).toEqual([RULES.levelSpread]);
    expect(problems.map((p) => p.detail)).toEqual([`level 2 holds 41 of 45 items, more than half`]);
  });

  it("fires on a level off the 0-4 ladder", () => {
    const broken = withItem(basePool(), 0, { level: 7 });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.levelSpread]);
    expect(problems.map((p) => p.detail)).toEqual(["level 7 is outside 0-4"]);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — pool size
// ---------------------------------------------------------------------------

describe("rule 4: pool size", () => {
  it("fires below 40 items, and nothing else fires", () => {
    const pool = basePool();
    const problems = validatePool({ ...pool, items: pool.items.slice(0, 39) });
    expect(rulesFired(problems)).toEqual([RULES.poolSize]);
    expect(problems[0].detail).toContain("39 items");
  });

  it("does not fire at exactly 40", () => {
    const pool = basePool();
    expect(validatePool({ ...pool, items: pool.items.slice(0, 40) })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — read-aloud present and speakable
// ---------------------------------------------------------------------------

describe("rule 5: read-aloud present and speakable", () => {
  it("fires on a prompt with a blank line and no readAloud to speak instead", () => {
    const broken = withItem(basePool(), 1, { prompt: "The cat ___ on the mat and then it went to sleep for a while." });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.readAloud]);
    expect(problems[0].detail).toContain("give it a readAloud");
  });

  it("does not fire when that same prompt carries a readAloud that can be spoken", () => {
    const broken = withItem(basePool(), 1, {
      prompt: "The cat ___ on the mat and then it went to sleep for a while.",
      readAloud: "The cat blank on the mat and then it went to sleep for a while.",
    });
    expect(validatePool(broken)).toEqual([]);
  });

  it("fires on an empty readAloud", () => {
    const problems = validatePool(withItem(basePool(), 2, { readAloud: "   " }));
    expect(rulesFired(problems)).toEqual([RULES.readAloud]);
    expect(problems[0].detail).toBe("readAloud is empty");
  });

  it("fires on a digit ordinal, which a voice reads as \"five th\"", () => {
    const problems = validatePool(withItem(basePool(), 4, { readAloud: "Which word comes 5th in the line?" }));
    expect(rulesFired(problems)).toEqual([RULES.readAloud]);
    expect(problems[0].detail).toContain("5th");
  });

  it("fires on a banned character inside a readAloud", () => {
    const problems = validatePool(withItem(basePool(), 8, { readAloud: "cat / dog" }));
    expect(rulesFired(problems)).toEqual([RULES.readAloud]);
    expect(problems[0].detail).toContain("read out literally");
  });

  it("leaves quotation marks alone: a quoted target word is how half the prompts are written", () => {
    const broken = withItem(basePool(), 10, { readAloud: `Which word is "because"? Say it out loud.` });
    expect(validatePool(broken)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — readability
// ---------------------------------------------------------------------------

describe("rule 6: reading level", () => {
  it("fires on a prompt that reads far above the pool's grade, and nothing else fires", () => {
    const broken = withItem(basePool(), 11, {
      prompt:
        "Which alternative most accurately characterises the fundamental relationship between atmospheric precipitation and the subsequent evaporation processes occurring continuously?",
    });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.readability]);
    expect(problems[0].itemId).toBe("base-11");
    expect(problems[0].detail).toContain("above the grade 6 ceiling");
  });

  it("uses the prompt only, never an answer or a distractor", () => {
    const broken = withItem(basePool(), 12, {
      answer: "photosynthesis",
      distractors: ["chlorophyll", "transpiration", "condensation"],
    });
    expect(validatePool(broken)).toEqual([]);
  });

  it("exempts K and 1, where the formula is meaningless", () => {
    const hard =
      "Which alternative most accurately characterises the fundamental relationship between atmospheric precipitation and the subsequent evaporation processes occurring continuously?";
    for (const grade of ["K", "1"] as Grade[]) {
      const pool = withItem({ ...basePool(), grade }, 13, { prompt: hard });
      expect(validatePool(pool), `grade ${grade}`).toEqual([]);
    }
  });

  /**
   * The departure from the brief, guarded so it cannot be quietly undone. Both of these are
   * correct content that the brief's rule as written would have flagged.
   */
  it("does not fire on a short stem whose one hard word is the thing being taught", () => {
    const pool = { ...basePool(), grade: "6" as Grade };
    // Flesch-Kincaid scores this 13.1 — the syllables-per-word term with nothing to dilute it.
    expect(validatePool(withItem(pool, 14, { prompt: "What is photosynthesis?" }))).toEqual([]);
    expect(fleschKincaidGrade("What is photosynthesis?")!).toBeGreaterThan(10);
  });

  it("has no lower bound: a plainly-worded stem in a high grade is not a defect", () => {
    const pool = { ...basePool(), grade: "12" as Grade };
    const plain = "Which one of these words is the one that means the same thing as the first word?";
    expect(fleschKincaidGrade(plain)!).toBeLessThan(10 - 2);
    expect(validatePool(withItem(pool, 15, { prompt: plain }))).toEqual([]);
  });

  it("computes Flesch-Kincaid from the stated formula", () => {
    // "The cat sat on the mat." — 6 words, 1 sentence, 6 syllables.
    // 0.39*6 + 11.8*1 - 15.59 = -1.45
    expect(fleschKincaidGrade("The cat sat on the mat.")!).toBeCloseTo(-1.45, 2);
    expect(fleschKincaidGrade("")).toBeNull();
    expect(countSyllables("photosynthesis")).toBeGreaterThanOrEqual(4);
    expect(countSyllables("cat")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — no length tell
// ---------------------------------------------------------------------------

describe("rule 7: no length tell", () => {
  it("fires when the answer is the longest choice too often, and nothing else fires", () => {
    const pool = basePool();
    const items = pool.items.map((it, i) => ({
      ...it,
      answer: filler(i, 0, 20),
      distractors: [filler(i, 1, 4), filler(i, 2, 6), filler(i, 3, 8)],
    }));
    const problems = validatePool({ ...pool, items });
    expect(rulesFired(problems)).toEqual([RULES.lengthTell]);
    expect(problems).toHaveLength(1);
    expect(problems[0].itemId).toBeNull();
    expect(problems[0].detail).toContain("longest choice in 45 of 45");
  });

  it("fires the other way when the answer is the shortest choice too often", () => {
    const pool = basePool();
    const items = pool.items.map((it, i) => ({
      ...it,
      answer: filler(i, 0, 4),
      distractors: [filler(i, 1, 14), filler(i, 2, 16), filler(i, 3, 18)],
    }));
    const problems = validatePool({ ...pool, items });
    expect(rulesFired(problems)).toEqual([RULES.lengthTell]);
    expect(problems[0].detail).toContain("shortest choice in 45 of 45");
  });

  /** A tie is no tell: "pick the long one" cannot choose between two equally long choices. */
  it("does not fire when the answer only ties for longest", () => {
    const pool = basePool();
    const items = pool.items.map((it, i) => ({
      ...it,
      answer: filler(i, 0, 20),
      distractors: [filler(i, 1, 20), filler(i, 2, 6), filler(i, 3, 8)],
    }));
    expect(validatePool({ ...pool, items })).toEqual([]);
  });

  it("tolerates a tell in half a pool, so ordinary content is not flagged", () => {
    const pool = basePool();
    const items = pool.items.map((it, i) =>
      i % 2 === 0
        ? { ...it, answer: filler(i, 0, 20), distractors: [filler(i, 1, 4), filler(i, 2, 6), filler(i, 3, 8)] }
        : it,
    );
    expect(validatePool({ ...pool, items })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — all / none of the above
// ---------------------------------------------------------------------------

describe("rule 8: no \"all of the above\" or \"none of the above\"", () => {
  it("fires on a distractor, and nothing else fires", () => {
    const broken = withItem(basePool(), 16, { distractors: ["All of the above", "alpha", "beta"] });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.aboveOrBelow]);
    expect(problems[0].itemId).toBe("base-16");
  });

  it("fires when it is the answer, which is the worse case", () => {
    const broken = withItem(basePool(), 17, { answer: "none of these", distractors: ["alpha", "beta", "gamma"] });
    expect(rulesFired(validatePool(broken))).toEqual([RULES.aboveOrBelow]);
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — a homophone pair the audio cannot tell apart
// ---------------------------------------------------------------------------

/**
 * The defect this rule exists for, as a fixture: a sight-word item whose spoken form is the bare
 * answer word, with that word's homophone sitting among the choices. In print it is a fine
 * question. Spoken, it is "right" — and the child is asked to choose between `right` and `write`.
 *
 * Every test here breaks it on purpose, the way the rest of this file does, because a rule
 * exercised only against content that passes would go green just as happily if it checked nothing.
 */
const BY_EAR = { answer: "right", distractors: ["write", "night", "light"] };

describe("rule 9: answerable by ear", () => {
  it("fires when the spoken form is the bare word and a distractor is its homophone", () => {
    const broken = withItem(basePool(), 20, {
      ...BY_EAR,
      prompt: "Which word is \"right\"?",
      readAloud: "right",
    });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.homophone]);
    expect(problems).toHaveLength(1);
    expect(problems[0].itemId).toBe("base-20");
    expect(problems[0].detail).toContain("write");
  });

  /** `deed-player.tsx` speaks `readAloud ?? prompt`, so the fallback is a spoken form too. */
  it("fires on the prompt when there is no readAloud, because the prompt is what gets spoken", () => {
    const broken = withItem(basePool(), 21, { ...BY_EAR, prompt: "Which word is \"right\"?" });
    const problems = validatePool(broken);
    expect(rulesFired(problems)).toEqual([RULES.homophone]);
    expect(problems[0].itemId).toBe("base-21");
  });

  it("is not satisfied by the question frame alone: a stem of function words is not context", () => {
    const broken = withItem(basePool(), 22, {
      ...BY_EAR,
      prompt: "Which word is \"right\"?",
      readAloud: "Which one of these is the word right?",
    });
    expect(rulesFired(validatePool(broken))).toEqual([RULES.homophone]);
  });

  it("is quiet once the spoken form carries a sense phrase that tells the pair apart", () => {
    const fixed = withItem(basePool(), 20, {
      ...BY_EAR,
      prompt: "Which word is \"right\"?",
      readAloud: "Which word is right, as in turn right at the corner?",
    });
    expect(validatePool(fixed)).toEqual([]);
  });

  it("is quiet when the choices only look alike, which is what a sight-word pool is for", () => {
    const fine = withItem(basePool(), 23, {
      answer: "right",
      distractors: ["night", "light", "bright"],
      prompt: "Which word is \"right\"?",
      readAloud: "right",
    });
    expect(validatePool(fine)).toEqual([]);
  });

  it("knows a homophone from a near-miss", () => {
    expect(soundAlike("their", "there")).toBe(true);
    expect(soundAlike("you're", "your")).toBe(true);
    expect(soundAlike("Buy", " by ")).toBe(true);
    expect(soundAlike("right", "right")).toBe(false);
    expect(soundAlike("right", "night")).toBe(false);
    expect(soundAlike("made", "mode")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real corpus
// ---------------------------------------------------------------------------

const DIR = path.join(__dirname, "../../content/drills");

function loadPools(): Pool[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Pool);
}

/**
 * NOTHING LEFT TO KNOW ABOUT — and this list was Task 3's progress bar, exactly as Task 1's
 * `POOLS_NOT_YET_WRITTEN` was its own.
 *
 * The twelve pools were written against the old band scheme and had never faced these rules, so
 * they arrived with 22 problems: 21 prompts reading above their grade ceiling and one prompt
 * containing `=`. Rather than let the corpus test report and assert nothing — the same
 * vacuousness the fixtures above exist to avoid — every problem the corpus produced was written
 * down here and the test asserted the corpus produced EXACTLY those.
 *
 * That made it fail in both directions, deliberately: a NEW problem failed the suite, and so did
 * a FIXED one until its line was deleted. Task 3 emptied the list by rewriting the items, so the
 * rule is now simply "no pool has a problem". A new problem still fails here; anything added to
 * this list from now on is a defect being tolerated, and needs a reason beside it.
 *
 * Format: `poolId | rule | itemId`.
 */
const KNOWN_PROBLEMS: string[] = [];

function fingerprint(pool: Pool, p: Problem): string {
  return `${pool.poolId} | ${p.rule} | ${p.itemId ?? "(pool)"}`;
}

describe("every authored pool in the repo", () => {
  const pools = loadPools();

  it("finds the pools", () => {
    expect(pools.length).toBeGreaterThanOrEqual(12);
  });

  it("has exactly the problems still listed as known, and no others", () => {
    const found = pools.flatMap((pool) => validatePool(pool).map((p) => fingerprint(pool, p))).sort();
    expect(found).toEqual([...KNOWN_PROBLEMS].sort());
  });
});
