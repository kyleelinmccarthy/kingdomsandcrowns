import { describe, it, expect } from "vitest";
import { compareNum, countSeq, moneyCoins, skipCount, tenMoreLess, timeClock } from "./elementary";
import { seededRng, type Question, type Rng } from "../drill-generators";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

/**
 * The shared checks in `drill-verify.test.ts` prove the answer key and the choice shape
 * for every generator. What is left for here is what only these generators promise: the
 * ranges a grade is meant to stay inside, and which phrasings each level may ask.
 */
function draws(gen: (l: number, r: Rng, s: string) => Question, level: number, skillId: string): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => gen(level, rng, skillId));
  });
}

describe("count-seq", () => {
  it("keeps every number it names inside the level's range", () => {
    // Written out by hand rather than imported, so a change to the generator's own
    // ceilings has to be made deliberately in two places instead of following itself.
    const max = [10, 12, 15, 20, 20];
    for (const lvl of LEVELS) {
      for (const q of draws(countSeq, lvl, "count-seq")) {
        const n = Number(/comes (?:after|before) (\d+)\?$/.exec(q.prompt)![1]);
        expect(n, q.prompt).toBeGreaterThanOrEqual(1);
        expect(n, q.prompt).toBeLessThanOrEqual(max[lvl] - 1);
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
        expect(Number(q.answer), q.prompt).toBeLessThanOrEqual(max[lvl]);
      }
    }
  });

  it("counts forward only until level 3, because counting forward is learned first", () => {
    for (const lvl of [0, 1, 2]) {
      for (const q of draws(countSeq, lvl, "count-seq")) expect(q.prompt).toContain("after");
    }
    // And counting back is genuinely reachable once it is allowed, or the rule above is
    // indistinguishable from a generator that never counts back at all.
    for (const lvl of [3, 4]) {
      expect(draws(countSeq, lvl, "count-seq").some((q) => q.prompt.includes("before")), `level ${lvl}`).toBe(true);
    }
  });

  it("speaks the question it shows", () => {
    for (const q of draws(countSeq, 4, "count-seq")) expect(q.readAloud).toBe(q.prompt);
  });
});

describe("compare-num", () => {
  it.each([
    ["compare-num", [5, 10, 10, 10, 10]],
    ["compare-num-100", [20, 50, 99, 99, 99]],
  ] as [string, number[]][])("keeps %s inside its own ceilings", (skillId, ceilings) => {
    for (const lvl of LEVELS) {
      for (const q of draws(compareNum, lvl, skillId)) {
        expect(q.choices).toHaveLength(4);
        for (const c of q.choices) {
          expect(Number(c), q.choices.join(",")).toBeGreaterThanOrEqual(0);
          expect(Number(c), q.choices.join(",")).toBeLessThanOrEqual(ceilings[lvl]);
        }
      }
    }
  });

  it("gives the same id to the same set however it was drawn, so a miss can be re-asked", () => {
    for (const q of draws(compareNum, 3, "compare-num-100")) {
      const inId = q.id.split(":")[1].split(",");
      expect([...inId].sort((a, b) => Number(a) - Number(b))).toEqual(inId);
      expect([...inId].sort()).toEqual([...q.choices].sort());
    }
  });
});

describe("ten-more-less", () => {
  it("never asks a question whose answer is below zero", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(tenMoreLess, lvl, "ten-more-less")) {
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("starts inside the level's range and only takes ten away from level 2", () => {
    const max = [20, 40, 60, 80, 99];
    for (const lvl of LEVELS) {
      for (const q of draws(tenMoreLess, lvl, "ten-more-less")) {
        const n = Number(/than (\d+)\?$/.exec(q.prompt)![1]);
        expect(n, q.prompt).toBeLessThanOrEqual(max[lvl]);
        if (lvl <= 1) expect(q.prompt).toContain("more");
      }
    }
    for (const lvl of [2, 3, 4]) {
      expect(draws(tenMoreLess, lvl, "ten-more-less").some((q) => q.prompt.includes("less")), `level ${lvl}`).toBe(true);
    }
  });
});

describe("skip-count", () => {
  it("shows a run that really does count by the step it names", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(skipCount, lvl, "skip-count")) {
        const m = /^Count by (\d+)s: (\d+), (\d+), (\d+), __$/.exec(q.prompt);
        expect(m, q.prompt).not.toBeNull();
        const [step, a, b, c] = m!.slice(1).map(Number);
        expect([b - a, c - b], q.prompt).toEqual([step, step]);
        // Runs start on a multiple of the step, the way skip counting is taught.
        expect(a % step, q.prompt).toBe(0);
      }
    }
  });

  it("uses only the steps its level has reached", () => {
    const ladder = [[2], [2, 5], [2, 5, 10], [2, 5, 10, 3], [2, 5, 10, 3, 4]];
    for (const lvl of LEVELS) {
      const used = new Set(draws(skipCount, lvl, "skip-count").map((q) => Number(/^Count by (\d+)s/.exec(q.prompt)![1])));
      for (const step of used) expect(ladder[lvl], `level ${lvl}`).toContain(step);
      // And every step the level offers is actually reachable, or the ladder is decoration.
      expect([...used].sort((x, y) => x - y)).toEqual([...ladder[lvl]].sort((x, y) => x - y));
    }
  });
});

describe("time-clock", () => {
  it("places the minute hand where the minutes actually are", () => {
    const grain = [30, 30, 15, 5, 5];
    for (const lvl of LEVELS) {
      for (const q of draws(timeClock, lvl, "time-clock")) {
        const hands = /on (\d+) and the minute hand is on (\d+)\./.exec(q.prompt)!;
        const [hour, minutes] = q.answer.split(":").map(Number);
        expect(Number(hands[1]), q.prompt).toBe(hour);
        // The hand points at 12 for o'clock, so it wraps rather than multiplying straight out.
        expect((Number(hands[2]) % 12) * 5, q.prompt).toBe(minutes);
        // A clock face is numbered 1-12 and has no 0 on it. This printed "the minute hand
        // is on 0" for every o'clock — half of all questions at levels 0 and 1 — and the
        // verifier encoded the same mistake, so nothing caught it.
        expect(Number(hands[2]), `${q.prompt} — no clock face has a 0`).toBeGreaterThanOrEqual(1);
        expect(Number(hands[2]), q.prompt).toBeLessThanOrEqual(12);
        expect(minutes % grain[lvl], q.prompt).toBe(0);
        expect(hour, q.prompt).toBeGreaterThanOrEqual(1);
        expect(hour, q.prompt).toBeLessThanOrEqual(12);
      }
    }
  });

  it("offers the hands-read-backwards mistake as a wrong answer, never as the right one", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(timeClock, lvl, "time-clock")) {
        const [hour, minutes] = q.answer.split(":").map(Number);
        const swapped = `${minutes / 5 === 0 ? 12 : minutes / 5}:${String((hour % 12) * 5).padStart(2, "0")}`;
        expect(q.choices, q.prompt).toContain(swapped);
        expect(swapped, `${q.prompt} has two right answers`).not.toBe(q.answer);
      }
    }
  });

  it("writes every time as a two-digit minute, so 4:05 is never 4:5", () => {
    for (const q of draws(timeClock, 4, "time-clock")) {
      for (const c of q.choices) expect(c, q.prompt).toMatch(/^([1-9]|1[0-2]):[0-5]\d$/);
    }
  });
});

describe("money-coins", () => {
  it("only offers the coin kinds its level has reached", () => {
    // The one new generator whose ladder nothing pinned: flattening it to four kinds at
    // every level passed the entire suite, which would have handed a grade-2 child
    // "7 quarters, 3 dimes, 8 nickels and 2 pennies" on their very first rung.
    // One coin is written "1 penny" and two are "2 pennies", so fold both spellings onto
    // one name before counting kinds — otherwise the singular reads as a fifth coin.
    const kindOf = (word: string) =>
      word.startsWith("quarter") ? "quarter" : word.startsWith("dime") ? "dime" : word.startsWith("nickel") ? "nickel" : "penny";
    const ladder = [["dime"], ["dime", "penny"], ["dime", "penny"], ["dime", "penny", "nickel"], ["dime", "penny", "nickel", "quarter"]];
    for (const lvl of LEVELS) {
      const used = new Set<string>();
      for (const q of draws(moneyCoins, lvl, "money-coins")) {
        for (const m of q.prompt.matchAll(/\d+ (quarters?|dimes?|nickels?|penny|pennies)/g)) used.add(kindOf(m[1]));
      }
      for (const coin of used) expect(ladder[lvl], `level ${lvl} used ${coin}`).toContain(coin);
      // And every kind the level allows is actually reachable, or the ladder is decoration.
      expect([...used].sort(), `level ${lvl}`).toEqual([...ladder[lvl]].sort());
    }
  });

  it("renders cents under a dollar and dollars above it", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(moneyCoins, lvl, "money-coins")) {
        for (const c of q.choices) expect(c, q.prompt).toMatch(/^(\d+¢|\$\d+\.\d\d)$/);
      }
    }
  });

  it("never lets counting the coins instead of their value be a right answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(moneyCoins, lvl, "money-coins")) {
        const coins = [...q.prompt.matchAll(/(\d+) (?:quarters?|dimes?|nickels?|penny|pennies)/g)]
          .reduce((sum, m) => sum + Number(m[1]), 0);
        expect(`${coins}¢`, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(`${coins}¢`);
      }
    }
  });

  it("says a single coin in the singular, so no child hears '1 pennies'", () => {
    for (const q of draws(moneyCoins, 4, "money-coins")) {
      expect(q.prompt, q.prompt).not.toMatch(/\b1 (quarters|dimes|nickels|pennies)\b/);
    }
  });

  it("keeps the money symbols out of the spoken form", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(moneyCoins, lvl, "money-coins")) {
        expect(q.readAloud, q.readAloud).not.toMatch(/[¢$]/);
      }
    }
  });
});
