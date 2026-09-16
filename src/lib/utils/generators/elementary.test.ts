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
        // Every number the prompt names, whichever phrasing it uses — "between 12 and 14"
        // names two, and both of them have to be inside the range as well.
        const named = [...q.prompt.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
        expect(named.length, q.prompt).toBeGreaterThanOrEqual(1);
        for (const n of named) {
          expect(n, q.prompt).toBeGreaterThanOrEqual(0);
          expect(n, q.prompt).toBeLessThanOrEqual(max[lvl]);
        }
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
        expect(Number(q.answer), q.prompt).toBeLessThanOrEqual(max[lvl]);
      }
    }
  });

  it("counts forward only until level 3, because counting forward is learned first", () => {
    // Three forward phrasings share these rungs — "after n", "1 more than n" and a run to
    // count on from — so the rule is that nothing counts BACK, not that every prompt says
    // "after". Each one is named here by hand, so adding a fourth phrasing has to be a
    // deliberate edit in two places rather than something this check waves through.
    const forward = [
      /^What number comes after (\d+)\?$/,
      /^What is 1 more than (\d+)\?$/,
      /^Count on: (\d+), (\d+), (\d+), __$/,
    ];
    for (const lvl of [0, 1, 2]) {
      for (const q of draws(countSeq, lvl, "count-seq")) {
        expect(forward.some((shape) => shape.test(q.prompt)), `level ${lvl} asked: ${q.prompt}`).toBe(true);
        // Whatever the wording, the answer is one step FORWARD from the last number shown.
        const named = [...q.prompt.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
        expect(Number(q.answer), q.prompt).toBe(named[named.length - 1] + 1);
      }
    }
    // Every phrasing the rung allows is really reachable, or the list above is decoration
    // and one of them could have quietly stopped being drawn.
    for (const lvl of [0, 1, 2]) {
      for (const shape of forward) {
        expect(draws(countSeq, lvl, "count-seq").some((q) => shape.test(q.prompt)), `level ${lvl} never asked ${shape}`).toBe(true);
      }
    }
    // And counting back is genuinely reachable once it is allowed, or the rule above is
    // indistinguishable from a generator that never counts back at all.
    for (const lvl of [3, 4]) {
      expect(draws(countSeq, lvl, "count-seq").some((q) => q.prompt.includes("before")), `level ${lvl}`).toBe(true);
    }
  });

  /**
   * Levels 3 and 4 both count to 20, which is this grade's whole number line, so the ceiling
   * cannot separate them and level 4 asked level 3's own 38 questions. "Between" is what
   * separates them instead — and it has to be absent below level 4, or the rung is decoration
   * again in the other direction.
   */
  it("asks what comes between only at level 4, and really does ask it there", () => {
    for (const lvl of [0, 1, 2, 3]) {
      for (const q of draws(countSeq, lvl, "count-seq")) {
        expect(q.prompt, `level ${lvl} asked between`).not.toContain("between");
      }
    }
    const betweens = draws(countSeq, 4, "count-seq").filter((q) => q.prompt.includes("between"));
    expect(betweens.length, "level 4 never asks what comes between").toBeGreaterThan(0);
    for (const q of betweens) {
      const [before, after] = [...q.prompt.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      // The two numbers named really are two apart, or nothing sits between them.
      expect(after - before, q.prompt).toBe(2);
      expect(Number(q.answer), q.prompt).toBe(before + 1);
    }
  });

  it("speaks the question it shows", () => {
    for (const q of draws(countSeq, 4, "count-seq")) {
      // A run prints a blank, which is the one thing a screen reader cannot say, so it is
      // the one phrasing whose spoken form differs — and it still has to say the same
      // numbers in the same order, and ask for the next one in words.
      if (q.prompt.startsWith("Count on:")) {
        const shown = [...q.prompt.matchAll(/(\d+)/g)].map((m) => m[1]);
        expect(q.readAloud, q.prompt).toBe(`Count on. ${shown.join(", ")}. What number comes next?`);
      } else {
        expect(q.readAloud).toBe(q.prompt);
      }
    }
  });
});

describe("compare-num", () => {
  it.each([
    ["compare-num", [5, 8, 10, 15, 20]],
    ["compare-num-100", [20, 50, 70, 85, 99]],
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

  /**
   * Both ceilings used to stop climbing partway up, so `compare-num` levels 1-4 shared one
   * pool of 326 sets and `compare-num-100` levels 2-4 shared 1440. Each rung has to reach a
   * number no rung below it could, which is what this asserts — not merely that the ceiling
   * constant changed, but that a set containing a number above the previous ceiling is really
   * drawn.
   */
  it.each([
    ["compare-num", [5, 8, 10, 15, 20]],
    ["compare-num-100", [20, 50, 70, 85, 99]],
  ] as [string, number[]][])("reaches past the rung below on every rung of %s", (skillId, ceilings) => {
    for (const lvl of [1, 2, 3, 4]) {
      const reached = draws(compareNum, lvl, skillId).some((q) =>
        q.choices.some((c) => Number(c) > ceilings[lvl - 1]));
      expect(reached, `${skillId} level ${lvl} never reaches past ${ceilings[lvl - 1]}`).toBe(true);
    }
  });

  /**
   * The ceiling is only half the ladder. `3, 18, 5, 2` is answered by spotting the long
   * number; `17, 19, 16, 18` has to be compared. The top two rungs draw from a narrow window
   * so the comparison is real — and for `compare-num-100` that means a shared tens digit,
   * which is 1.NBT.3.
   */
  it.each([
    ["compare-num", [20, 20, 20, 6, 4]],
    ["compare-num-100", [99, 99, 99, 20, 9]],
  ] as [string, number[]][])("draws %s from the level's own window", (skillId, spreads) => {
    for (const lvl of LEVELS) {
      for (const q of draws(compareNum, lvl, skillId)) {
        const nums = q.choices.map(Number);
        expect(Math.max(...nums) - Math.min(...nums), q.choices.join(",")).toBeLessThanOrEqual(spreads[lvl]);
      }
    }
    // And the window really does bite at the top, or it is a constant nothing reads.
    for (const lvl of [3, 4]) {
      const widest = Math.max(...draws(compareNum, lvl, skillId).map((q) => {
        const nums = q.choices.map(Number);
        return Math.max(...nums) - Math.min(...nums);
      }));
      expect(widest, `${skillId} level ${lvl} never fills its window`).toBe(spreads[lvl]);
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
        // Written out by hand, as every range in this file is: a run starts on one of the
        // first TWENTY multiples of its step, which is what takes level 0 — twos and
        // nothing else — from ten questions in existence to twenty.
        expect(a / step, q.prompt).toBeGreaterThanOrEqual(1);
        expect(a / step, q.prompt).toBeLessThanOrEqual(20);
      }
    }
  });

  it("really does start runs past the tenth multiple, or level 0 is still ten questions", () => {
    for (const lvl of LEVELS) {
      const far = draws(skipCount, lvl, "skip-count").filter((q) => {
        const [step, a] = /^Count by (\d+)s: (\d+),/.exec(q.prompt)!.slice(1).map(Number);
        return a / step > 10;
      });
      expect(far.length, `level ${lvl} never starts a run past the tenth multiple`).toBeGreaterThan(0);
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
    const grain = [60, 30, 15, 10, 5];
    for (const lvl of LEVELS) {
      for (const q of draws(timeClock, lvl, "time-clock")) {
        const hands = /(?:on|just past) (\d+) and the minute hand is on (\d+)\./.exec(q.prompt)!;
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

  /**
   * The grain was `[30, 30, 15, 5, 5]` and flat at both ends: levels 0 and 1 shared all 22
   * half-hour faces, levels 3 and 4 every five-minute one. Each rung has to put a mark on
   * the dial the rung below could not show — asserted as a real draw rather than as a
   * constant, because the constant above is the thing that was wrong.
   */
  it("shows a minute mark no earlier level could show, on every rung", () => {
    const grain = [60, 30, 15, 10, 5];
    for (const lvl of [1, 2, 3, 4]) {
      const earlier = new Set<number>();
      for (const below of [0, 1, 2, 3].slice(0, lvl)) {
        for (let m = 0; m < 60; m += grain[below]) earlier.add(m);
      }
      const fresh = draws(timeClock, lvl, "time-clock")
        .map((q) => Number(q.answer.split(":")[1]))
        .filter((m) => !earlier.has(m));
      expect(fresh.length, `level ${lvl} shows no minute level ${lvl - 1} could not`).toBeGreaterThan(0);
    }
  });

  it("writes every time as a two-digit minute, so 4:05 is never 4:5", () => {
    for (const q of draws(timeClock, 4, "time-clock")) {
      for (const c of q.choices) expect(c, q.prompt).toMatch(/^([1-9]|1[0-2]):[0-5]\d$/);
    }
  });

  /**
   * **The sentence has to be true of a real clock face.** "The hour hand is on 2 and the
   * minute hand is on 7" was printed for 2:35 — but at 2:35 the hour hand is five sixths of
   * the way from 2 to 3, so the number it is NEAREST is 3. The arithmetic was right on all
   * 300 draws and the sentence was wrong on every one of them that was not an o'clock, and
   * the sentence is what a child carries to a real clock: taught to read that face as "on 2",
   * they look at 2:35, see the hand by the 3, and say 3:35.
   *
   * On the hour and only on the hour is the hand ON its number, and both readings have to be
   * reachable or one of them is untested wording.
   */
  it("says the hour hand is ON the hour only at the hour, and just past it otherwise", () => {
    for (const lvl of LEVELS) {
      let onTheHour = 0, past = 0;
      for (const q of draws(timeClock, lvl, "time-clock")) {
        const minutes = Number(q.answer.split(":")[1]);
        const said = /^The hour hand is (on|just past) \d+ /.exec(q.prompt);
        expect(said, `time-clock wrote a face a child cannot read: ${q.prompt}`).not.toBeNull();
        expect(said![1] === "on", `${q.prompt} is not true at ${q.answer}`).toBe(minutes === 0);
        if (said![1] === "on") onTheHour += 1; else past += 1;
        // Whatever it says about the hour hand, it still says it out loud.
        expect(q.readAloud, q.prompt).toBe(q.prompt);
      }
      if (lvl === 0) expect(past, "level 0 is o'clock only").toBe(0);
      else expect(past, `level ${lvl} never draws a time past the hour`).toBeGreaterThan(0);
      if (lvl <= 1) expect(onTheHour, `level ${lvl} never draws an o'clock`).toBeGreaterThan(0);
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
    const ladder = [["dime", "nickel"], ["dime", "penny"], ["dime", "penny"], ["dime", "penny", "nickel"], ["dime", "penny", "nickel", "quarter"]];
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

  /**
   * Level 0 may draw a dime handful OR a nickel handful — twenty handfuls in existence
   * instead of nine, against a quest that asks eight — but never both coins at once. The
   * ladder check above counts kinds across every draw and so cannot tell those two apart:
   * without this, mixing dimes and nickels into one first-rung handful would pass it.
   */
  it("gives the first rung one kind of coin at a time", () => {
    for (const q of draws(moneyCoins, 0, "money-coins")) {
      const named = [...q.prompt.matchAll(/\d+ (quarters?|dimes?|nickels?|penny|pennies)/g)];
      expect(named.length, q.prompt).toBe(1);
    }
  });

  /**
   * Levels 1 and 2 both hold two coin kinds — dimes and pennies are worth two rungs, and a
   * third kind at level 2 would leave nothing for level 3 — so the handful size is what
   * separates them. Without it the two rungs were the same 81 handfuls.
   */
  it("keeps each handful inside the level's count, and opens it up at level 2", () => {
    const maxCount = [10, 5, 9, 9, 9];
    for (const lvl of LEVELS) {
      let biggest = 0;
      for (const q of draws(moneyCoins, lvl, "money-coins")) {
        for (const m of q.prompt.matchAll(/(\d+) (?:quarters?|dimes?|nickels?|penny|pennies)/g)) {
          expect(Number(m[1]), q.prompt).toBeGreaterThanOrEqual(1);
          expect(Number(m[1]), q.prompt).toBeLessThanOrEqual(maxCount[lvl]);
          biggest = Math.max(biggest, Number(m[1]));
        }
      }
      // And the ceiling is reachable, or level 2 is level 1 again with a bigger constant.
      expect(biggest, `level ${lvl} never draws a handful of ${maxCount[lvl]}`).toBe(maxCount[lvl]);
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
