import { describe, it, expect } from "vitest";
import { SKILLS } from "../skills";
import {
  addSubWithin1000,
  areaPerimeter,
  decOps,
  divMulti,
  divTwoDigit,
  factors,
  frac,
  fracAddsub,
  fracEquiv,
  fracMul,
  fracUnit,
  mulMulti,
  orderOps,
  roundNearest,
  speakFrac,
  volumePrism,
} from "./intermediate";
import { GENERATORS, seededRng, type Question, type Rng } from "../drill-generators";
import { VERIFIERS } from "../drill-verify";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

function draws(gen: (l: number, r: Rng, s: string) => Question, level: number, skillId: string): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => gen(level, rng, skillId));
  });
}

const value = (f: string) => {
  const [n, d] = f.split("/").map(Number);
  return n / d;
};

describe("frac-unit", () => {
  /**
   * Both shapes this skill asks in, read back from the printed prompt. The one-whole line
   * prints how many parts it is cut into; the longer line names the size of a part, because
   * "split into 8 equal parts" over two wholes would make a grade-3 child divide before they
   * could begin. The NAMES are written out here rather than imported, so a generator that
   * thought "sixths" meant eight parts is caught rather than followed.
   */
  const PARTS_NAMED: Record<string, number> = { thirds: 3, fourths: 4, sixths: 6, eighths: 8 };
  const line = (q: Question) => {
    const longer = /^A number line from 0 to (\d+) is marked in ([a-z]+)\. What fraction is at the (\d+)\w\w mark\?$/.exec(q.prompt);
    if (longer) {
      const parts = PARTS_NAMED[longer[2]];
      expect(parts, `${q.prompt} names a fraction this grade does not use`).toBeDefined();
      return { wholes: Number(longer[1]), parts, which: Number(longer[3]) };
    }
    const one = /^A number line from 0 to 1 is split into (\d+) equal parts\. What fraction is at the (\d+)\w\w mark\?$/.exec(q.prompt);
    expect(one, `frac-unit wrote a line a child cannot read: ${q.prompt}`).not.toBeNull();
    return { wholes: 1, parts: Number(one![1]), which: Number(one![2]) };
  };

  it("answers with the mark the prompt asks about", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const { wholes, parts, which } = line(q);
        expect(q.answer, q.prompt).toBe(`${which}/${parts}`);
        expect(which, q.prompt).toBeGreaterThanOrEqual(1);
        // The end of the line is not a mark, so the last one is `wholes * parts - 1`.
        expect(which, q.prompt).toBeLessThan(wholes * parts);
        // Nor is any whole number along the way: a mark that lands on one is a fraction a
        // child can pick out by its shape instead of by counting.
        expect(which % parts, `${q.prompt} lands on a whole number`).not.toBe(0);
      }
    }
  });

  /**
   * Seventeen. That is how many questions a line from 0 to 1 holds across every denominator
   * grade 3 owns with halves barred — 2 + 3 + 5 + 7 — and five rungs each needing eight of
   * their own do not fit in it, which is why the ladder used to repeat `[3, 4, 6]` and then
   * `[3, 4, 6, 8]`. The line running past one whole is what makes five rungs possible; this
   * pins that it is really where the top three rungs go, and that the first two are still the
   * plain 0-to-1 line a child starts on.
   */
  it("stays on one whole for the first two rungs and runs past it after", () => {
    for (const lvl of [0, 1]) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        expect(line(q).wholes, `level ${lvl} left the first whole: ${q.prompt}`).toBe(1);
      }
    }
    const wholes = [2, 2, 3];
    for (const lvl of [2, 3, 4]) {
      const seen = new Set(draws(fracUnit, lvl, "frac-unit").map((q) => line(q).wholes));
      expect([...seen], `level ${lvl}`).toEqual([wholes[lvl - 2]]);
      // And a mark past the first whole is genuinely drawn, or the longer line is decoration.
      const past = draws(fracUnit, lvl, "frac-unit").filter((q) => {
        const { parts, which } = line(q);
        return which > parts;
      });
      expect(past.length, `level ${lvl} never asks a mark past one whole`).toBeGreaterThan(0);
    }
  });

  it("builds three wrong fractions that are three different NUMBERS, not three spellings", () => {
    // `numericDistractors` does not apply to a fraction, so these are built by hand — and
    // "4/8" and "1/2" are the same number however differently they are written, which a
    // plain string comparison would wave through as two distinct choices.
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const values = q.choices.map(value);
        expect(new Set(values).size, `${q.prompt} offers the same number twice: ${q.choices.join(", ")}`).toBe(4);
        expect(values.filter((v) => v === value(q.answer)), q.prompt).toHaveLength(1);
      }
    }
  });

  it("offers the three real mistakes: upside down, one mark out, and the wrong whole", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const { wholes, parts } = line(q);
        const [n, d] = q.answer.split("/").map(Number);
        const marks = wholes * d - 1;
        // Each of the three is asserted to be ON the screen and NOT to be the answer: a
        // characteristic mistake that equals the answer is a question with two right answers,
        // and `toContain` alone would pass just as happily on one.
        const offByOne = n + 1 <= marks ? n + 1 : n - 1;
        // On one whole, calling the whole line a single part. On a longer line `d/d` IS a
        // mark, so the mistake worth offering is dividing by every mark rather than by the
        // parts in one whole.
        const misread = wholes === 1 ? `${d}/${d}` : `${n}/${wholes * d}`;
        for (const wrong of [`${d}/${n}`, `${offByOne}/${d}`, misread]) {
          expect(wrong, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${wrong}`).toContain(wrong);
        }
        expect(parts, q.prompt).toBe(d);
      }
    }
  });

  /**
   * The repair this pins: `2` used to be in `FRAC_DENOMS[0]`, and putting it back passed the
   * whole suite. A line split in two has exactly ONE interior mark, so the choices came out
   * `1/2, 2/1, 2/2, 0/2` — `0/2` is not a mark at all, and `1/2` is the only choice between
   * 0 and 1, so a child who had learned nothing but "the answer is under 1" scored every
   * halves question without counting a mark.
   *
   * Three assertions, each of which fires on its own when 2 goes back in: the denominator is
   * at least 3, no choice has a numerator of 0, and at least TWO choices are real interior
   * marks so the shortcut cannot win.
   *
   * NOT asserted, against the brief's wording: that no choice exceeds 1, and that `d/d` is
   * never offered. Both are deliberate — the fraction read upside down and the whole line
   * called one part are two of the three mistakes this question is built around, and they
   * are the reason a child must read the mark rather than the shape. Nor could they be
   * dropped: a line in 3 parts has 2 interior marks and a line in 4 has 3, so there are not
   * four distinct marks to fill four choices with at the low denominators this ladder uses.
   */
  it("never splits the line in two, and never offers 0 over anything", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const { wholes, parts: d } = line(q);
        expect(d, q.prompt).toBeGreaterThanOrEqual(3);
        const marks = new Set(Array.from({ length: wholes * d - 1 }, (_, i) => (i + 1) / d));
        let onTheLine = 0;
        for (const c of q.choices) {
          const [cn, cd] = c.split("/").map(Number);
          expect(cn, `${c} is 0 over something, which is not a mark: ${q.prompt}`).toBeGreaterThan(0);
          if (marks.has(cn / cd)) onTheLine += 1;
        }
        expect(onTheLine, `only ${onTheLine} of ${q.choices.join(", ")} is a mark on the line: ${q.prompt}`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("speaks the same mark it prints, as a word", () => {
    // The spoken ordinal must AGREE with the printed one, not merely be some word. This
    // asserted `[a-z]+` for a while, and two different off-by-one mutations of the spoken
    // word left all 2777 tests green: a child on read-aloud would be asked for the 4th mark,
    // answer 4/6, and be marked wrong because the screen said 5th. `[a-z]+` also happily
    // accepts "at the undefined mark".
    const WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
      "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth"];
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const printed = /at the (\d+)(?:st|nd|rd|th) mark/.exec(q.prompt);
        expect(printed, `could not read the printed mark from: ${q.prompt}`).not.toBeNull();
        const which = Number(printed![1]);
        expect(WORDS[which], `no word for mark ${which} — the ordinal table has been out-run`).toBeTruthy();
        expect(q.readAloud, `${q.prompt} is spoken as: ${q.readAloud}`).toContain(`at the ${WORDS[which]} mark`);
        expect(q.readAloud, q.readAloud).not.toMatch(/\d+(st|nd|rd|th)/);
        expect(q.readAloud, q.readAloud).not.toContain("undefined");
      }
    }
  });
});

describe("area-perimeter", () => {
  /**
   * The repair this pins: `unit()` used to return `"units"` for every side, and reverting it
   * to that passes every other test in the suite. A rectangle 1 unit wide reached the screen
   * as "1 units wide" and a screen reader said "one units tall", on better than a third of a
   * grade-3 child's first deed. The verifier's regex was widened to `units?` in the same
   * repair, so the second opinion accepts the broken spelling too and cannot catch this; the
   * regex stays permissive, because the prompt legitimately carries both forms, and the
   * generator is pinned here instead.
   *
   * The two flags are what keep this from passing vacuously: an assertion about the singular
   * proves nothing if no 1-unit side is ever drawn.
   */
  it("says 1 unit and 2 units, and never 1 units", () => {
    let sawSingular = false, sawPlural = false;
    for (const lvl of LEVELS) {
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const m = /^A rectangle is (\d+) (units?) wide and (\d+) (units?) tall\. What is its (?:area|perimeter)\?$/.exec(q.prompt);
        expect(m, q.prompt).not.toBeNull();
        const [w, wWord, h, hWord] = [Number(m![1]), m![2], Number(m![3]), m![4]];
        expect(wWord, q.prompt).toBe(w === 1 ? "unit" : "units");
        expect(hWord, q.prompt).toBe(h === 1 ? "unit" : "units");
        if (w === 1 || h === 1) sawSingular = true;
        if (w === 2 || h === 2) sawPlural = true;
        // Read-aloud is the prompt verbatim, so the same spelling is what a child hears.
        expect(q.readAloud, q.prompt).toBe(q.prompt);
      }
    }
    expect(sawSingular, "no 1-unit side was ever drawn, so the singular went untested").toBe(true);
    expect(sawPlural, "no 2-unit side was ever drawn, so the plural went untested").toBe(true);
  });

  it("never draws a rectangle whose area and perimeter are the same number", () => {
    // 4 by 4 is 16 either way. The other measure is always a distractor, so such a
    // rectangle would put a second right answer among the choices.
    for (const lvl of LEVELS) {
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const [w, h] = /is (\d+) units? wide and (\d+) units? tall/.exec(q.prompt)!.slice(1).map(Number);
        expect(w * h, q.prompt).not.toBe(2 * (w + h));
      }
    }
  });

  it("always offers the other measure as a wrong answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const [w, h] = /is (\d+) units? wide and (\d+) units? tall/.exec(q.prompt)!.slice(1).map(Number);
        const other = q.prompt.endsWith("area?") ? 2 * (w + h) : w * h;
        expect(q.choices, q.prompt).toContain(String(other));
      }
    }
  });

  it("keeps both sides inside the level's range and asks perimeter only from level 2", () => {
    const max = [5, 8, 10, 12, 15];
    for (const lvl of LEVELS) {
      const asked = new Set<string>();
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const [w, h] = /is (\d+) units? wide and (\d+) units? tall/.exec(q.prompt)!.slice(1).map(Number);
        expect(Math.max(w, h), q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(Math.min(w, h), q.prompt).toBeGreaterThanOrEqual(1);
        asked.add(q.prompt.endsWith("area?") ? "area" : "perimeter");
      }
      expect([...asked].sort(), `level ${lvl}`).toEqual(lvl >= 2 ? ["area", "perimeter"] : ["area"]);
    }
  });
});

describe("round-nearest", () => {
  it("never asks about a number that is already round", () => {
    // "The original number, left alone" is one of the distractors; a number already
    // sitting on the place would make that distractor the right answer.
    for (const lvl of LEVELS) {
      for (const q of draws(roundNearest, lvl, "round-nearest")) {
        const [n, place] = /^Round (\d+) to the nearest (\d+)\.$/.exec(q.prompt)!.slice(1).map(Number);
        expect(n % place, q.prompt).not.toBe(0);
        expect(q.choices, q.prompt).toContain(String(n));
        expect(String(n), `${q.prompt} has two right answers`).not.toBe(q.answer);
      }
    }
  });

  it("rounds a tie up", () => {
    // 275 to the nearest 10 is 280, not 270 — the one case where "nearest" needs a rule.
    // The assertion below only fires on an actual tie, so count them: at level 4 a tie is
    // roughly a 1-in-1000 draw and the level would otherwise contribute nothing at all
    // while still reading as covered.
    let ties = 0;
    for (const lvl of LEVELS) {
      for (const q of draws(roundNearest, lvl, "round-nearest")) {
        const [n, place] = /^Round (\d+) to the nearest (\d+)\.$/.exec(q.prompt)!.slice(1).map(Number);
        if (n % place === place / 2) {
          ties++;
          expect(Number(q.answer), q.prompt).toBe(n - n % place + place);
        }
      }
    }
    expect(ties, "no tie was ever drawn, so the rule above was never checked").toBeGreaterThan(0);
  });

  it("rounds to the place the level says, over numbers that grow with it", () => {
    const place = [10, 10, 100, 100, 1000];
    const range: [number, number][] = [[10, 99], [100, 999], [100, 999], [1000, 9999], [1000, 9999]];
    for (const lvl of LEVELS) {
      for (const q of draws(roundNearest, lvl, "round-nearest")) {
        const [n, p] = /^Round (\d+) to the nearest (\d+)\.$/.exec(q.prompt)!.slice(1).map(Number);
        expect(p, q.prompt).toBe(place[lvl]);
        expect(n, q.prompt).toBeGreaterThanOrEqual(range[lvl][0]);
        expect(n, q.prompt).toBeLessThanOrEqual(range[lvl][1]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Grades 4 and 5
// ---------------------------------------------------------------------------

/** A rendered fraction as an exact pair, so two of them are compared BY VALUE. */
const asPair = (f: string): [number, number] => {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(f);
  if (!m) throw new Error(`not a fraction: ${f}`);
  return [Number(m[1]), m[2] === undefined ? 1 : Number(m[2])];
};
const exactValue = (f: string) => {
  const [n, d] = asPair(f);
  return n / d;
};
const lowestTerms = (f: string) => {
  const [n, d] = asPair(f);
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  return g(Math.abs(n), Math.abs(d)) === 1;
};

/** Every choice a distinct NUMBER, and the answer among them exactly once. */
function expectFourDistinctValues(q: Question) {
  const values = q.choices.map(exactValue);
  expect(new Set(values).size, `${q.prompt} offers the same number twice: ${q.choices.join(", ")}`).toBe(4);
  expect(values.filter((v) => v === exactValue(q.answer)), `${q.prompt} has two right answers`).toHaveLength(1);
}

describe("frac", () => {
  it("reduces, renders a whole number as one, and never renders 0 as a fraction", () => {
    expect(frac(2, 4)).toBe("1/2");
    expect(frac(6, 2)).toBe("3");
    expect(frac(0, 5)).toBe("0");
    expect(frac(-2, 4)).toBe("-1/2");
    expect(frac(2, -4)).toBe("-1/2");
    expect(() => frac(1, 0)).toThrow();
  });

  it("speaks a fraction in words, because '/' is banned from read-aloud", () => {
    expect(speakFrac("1/2")).toBe("1 half");
    expect(speakFrac("3/4")).toBe("3 fourths");
    expect(speakFrac("5")).toBe("5");
    expect(speakFrac("7/20")).toBe("7 over 20");
    for (const spoken of ["1/2", "3/4", "7/20", "11/12"].map(speakFrac)) {
      expect(spoken, spoken).not.toMatch(/[-×÷%²³√π^\/¢$]/);
    }
  });
});

/** Every digit pair multiplied with its carry thrown away — written again, not imported. */
function carryDroppedProduct(a: number, b: number): number {
  const da = String(a).split("").reverse().map(Number);
  const db = String(b).split("").reverse().map(Number);
  let total = 0;
  for (let i = 0; i < da.length; i++) for (let j = 0; j < db.length; j++) total += ((da[i] * db[j]) % 10) * 10 ** (i + j);
  return total;
}

describe("mul-multi", () => {
  const operands = (q: Question) => /^What is (\d+) × (\d+)\?$/.exec(q.prompt)!.slice(1).map(Number) as [number, number];

  it("gives each level the digit counts the map asks for, and never a trailing zero", () => {
    // 4.NBT.5: up to four digits by one digit, and two two-digit numbers. Levels 0 and 1 both
    // read [2, 1] here, which is why a child mastering two-by-one was promoted to two-by-one.
    const digits: [number, number][] = [[2, 1], [3, 1], [4, 1], [2, 2], [3, 2]];
    for (const lvl of LEVELS) {
      for (const q of draws(mulMulti, lvl, "mul-multi")) {
        const [a, b] = operands(q);
        expect(String(a).length, q.prompt).toBe(digits[lvl][0]);
        expect(String(b).length, q.prompt).toBe(digits[lvl][1]);
        expect(a % 10, `${q.prompt} ends in 0, so "tens ignored" would be 0`).not.toBe(0);
        expect(b % 10, `${q.prompt} ends in 0`).not.toBe(0);
        expect(Number(q.answer), q.prompt).toBe(a * b);
      }
    }
  });

  it("never draws a product that needs no carry, so 'carry dropped' is always a wrong answer", () => {
    // 12 × 3 carries nowhere: dropping a carry leaves 36, which IS the answer.
    for (const lvl of LEVELS) {
      for (const q of draws(mulMulti, lvl, "mul-multi")) {
        const [a, b] = operands(q);
        expect(carryDroppedProduct(a, b), `${q.prompt} has two right answers`).not.toBe(a * b);
      }
    }
  });

  it("always offers the ones digit multiplied on its own, the mistake the skill exists for", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(mulMulti, lvl, "mul-multi")) {
        const [a, b] = operands(q);
        // On screen AND not the answer. `toContain` on its own would pass either way: when a
        // characteristic-error distractor equals the answer the choice builder quietly
        // backfills a near miss rather than offering a duplicate, so nothing would fire. It
        // cannot collide while `a` has two digits or more, which is now every rung — said
        // here rather than left to the ladder table, which is the thing that moved.
        expect(String((a % 10) * b), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(String((a % 10) * b));
      }
    }
  });
});

describe("div-multi", () => {
  const parts = (q: Question) => {
    const m = /^What is (\d+) ÷ (\d+)\? Give the (quotient|remainder)\.$/.exec(q.prompt)!;
    return { dividend: Number(m[1]), divisor: Number(m[2]), wants: m[3] };
  };

  it("keeps the divisor inside the level's range and the dividend inside twelve of them", () => {
    const max = [5, 9, 9, 12, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(divMulti, lvl, "div-multi")) {
        const { dividend, divisor } = parts(q);
        expect(divisor, q.prompt).toBeGreaterThanOrEqual(2);
        expect(divisor, q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(Math.floor(dividend / divisor), q.prompt).toBeGreaterThanOrEqual(1);
        expect(Math.floor(dividend / divisor), q.prompt).toBeLessThanOrEqual(12);
      }
    }
  });

  it("always leaves a remainder, and asks the quotient at even levels and the remainder at odd ones", () => {
    for (const lvl of LEVELS) {
      const asked = new Set<string>();
      for (const q of draws(divMulti, lvl, "div-multi")) {
        const { dividend, divisor, wants } = parts(q);
        expect(dividend % divisor, `${q.prompt} divides exactly, so there is no remainder to ask about`).not.toBe(0);
        expect(Number(q.answer), q.prompt).toBe(wants === "quotient" ? Math.floor(dividend / divisor) : dividend % divisor);
        asked.add(wants);
      }
      expect([...asked], `level ${lvl}`).toEqual([lvl % 2 === 0 ? "quotient" : "remainder"]);
    }
  });

  it("offers the measure it did not ask for, and never lets the two be the same number", () => {
    // Swapping quotient and remainder is THE mistake here, so the other one is always a
    // distractor — which means a draw where they are equal would have two right answers.
    for (const lvl of LEVELS) {
      for (const q of draws(divMulti, lvl, "div-multi")) {
        const { dividend, divisor, wants } = parts(q);
        const other = wants === "quotient" ? dividend % divisor : Math.floor(dividend / divisor);
        expect(String(other), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(String(other));
      }
    }
  });
});

describe("frac-equiv", () => {
  const base = (q: Question) => /^Which fraction is equal to (\d+)\/(\d+)\?$/.exec(q.prompt)!.slice(1).map(Number) as [number, number];

  it("asks about a fraction in lowest terms and answers with a whole-number scaling of it", () => {
    const kmax = [2, 3, 4, 6, 8];
    const dmax = [6, 8, 9, 10, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(fracEquiv, lvl, "frac-equiv")) {
        const [n, d] = base(q);
        expect(lowestTerms(`${n}/${d}`), `${q.prompt} is not in lowest terms`).toBe(true);
        expect(n, q.prompt).toBeLessThan(d);
        expect(d, q.prompt).toBeLessThanOrEqual(dmax[lvl]);
        const [an, ad] = asPair(q.answer);
        expect(ad % d, q.prompt).toBe(0);
        const k = ad / d;
        expect(k, q.prompt).toBeGreaterThanOrEqual(2);
        expect(k, q.prompt).toBeLessThanOrEqual(kmax[lvl]);
        expect(an, q.prompt).toBe(n * k);
      }
    }
  });

  it("leaves exactly one choice equal to the fraction in the prompt", () => {
    // The choices ARE the data here, so a second equal choice is a second right answer —
    // and "2/4" and "3/6" are the same number written two ways, which a string comparison
    // would wave through.
    for (const lvl of LEVELS) {
      for (const q of draws(fracEquiv, lvl, "frac-equiv")) {
        const [n, d] = base(q);
        const equal = q.choices.filter((c) => exactValue(c) === n / d);
        expect(equal, `${q.prompt} has ${equal.length} right answers: ${q.choices.join(", ")}`).toEqual([q.answer]);
        expectFourDistinctValues(q);
      }
    }
  });

  it("offers the half-scaled mistakes: numerator alone, denominator alone", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracEquiv, lvl, "frac-equiv")) {
        const [n, d] = base(q);
        const k = asPair(q.answer)[1] / d;
        expect(q.choices, q.prompt).toContain(`${n * k}/${d}`);
      }
    }
  });
});

describe("factors", () => {
  const target = (q: Question) => Number(/^Which number is a factor of (\d+)\?$/.exec(q.prompt)![1]);

  it("keeps the target inside the level's range and answers with a factor that is neither 1 nor the target", () => {
    const max = [20, 24, 36, 60, 100];
    for (const lvl of LEVELS) {
      for (const q of draws(factors, lvl, "factors")) {
        const t = target(q);
        expect(t, q.prompt).toBeGreaterThanOrEqual(4);
        expect(t, q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(t % Number(q.answer), q.prompt).toBe(0);
        expect(Number(q.answer), q.prompt).toBeGreaterThan(1);
        expect(Number(q.answer), q.prompt).toBeLessThan(t);
      }
    }
  });

  it("leaves exactly one choice that divides the target", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(factors, lvl, "factors")) {
        const t = target(q);
        const dividing = q.choices.filter((c) => t % Number(c) === 0);
        expect(dividing, `${q.prompt} has ${dividing.length} right answers: ${q.choices.join(", ")}`).toEqual([q.answer]);
      }
    }
  });

  it("always offers a multiple of the target — the factor/multiple swap", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(factors, lvl, "factors")) {
        const t = target(q);
        const multiples = q.choices.filter((c) => Number(c) > t && Number(c) % t === 0);
        expect(multiples.length, `${q.prompt} offers no multiple: ${q.choices.join(", ")}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("frac-addsub", () => {
  const parts = (q: Question) => {
    const m = /^What is (\d+)\/(\d+) ([+\-]) (\d+)\/(\d+)\?$/.exec(q.prompt)!;
    return { n1: Number(m[1]), d1: Number(m[2]), op: m[3], n2: Number(m[4]), d2: Number(m[5]) };
  };

  it("uses like denominators to level 2 and unlike from level 3, inside the level's ceiling", () => {
    const max = [6, 8, 10, 12, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(fracAddsub, lvl, "frac-addsub")) {
        const { n1, d1, n2, d2 } = parts(q);
        expect(Math.max(d1, d2), q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(Math.min(d1, d2), q.prompt).toBeGreaterThanOrEqual(2);
        // Operands stay proper until the top rung, where 5.NF.A.1's own worked example —
        // `2/3 + 5/4` — becomes askable. Nowhere may an operand land ON a whole number.
        if (lvl <= 3) {
          expect(n1, q.prompt).toBeLessThan(d1);
          expect(n2, q.prompt).toBeLessThan(d2);
        } else {
          expect(n1, q.prompt).toBeLessThan(2 * d1);
          expect(n2, q.prompt).toBeLessThan(2 * d2);
        }
        expect(n1 % d1, `${q.prompt} has a whole-number operand`).not.toBe(0);
        expect(n2 % d2, `${q.prompt} has a whole-number operand`).not.toBe(0);
        // Halves are barred only where the denominators are SHARED, because 1/2 is then the
        // only fraction on either side and every such draw is discarded downstream.
        if (lvl <= 2) {
          expect(d2, `level ${lvl}: ${q.prompt}`).toBe(d1);
          expect(d1, `level ${lvl}: ${q.prompt}`).toBeGreaterThanOrEqual(3);
        } else {
          expect(d2, `level ${lvl}: ${q.prompt}`).not.toBe(d1);
        }
      }
    }
    // Levels 3 and 4 were the same rung: unlike denominators to 12, answers past 1, 1129
    // questions shared. The improper operand is what separates them, so it has to be
    // genuinely reachable at level 4 and genuinely absent below it.
    const improper = draws(fracAddsub, 4, "frac-addsub").filter((q) => {
      const { n1, d1, n2, d2 } = parts(q);
      return n1 > d1 || n2 > d2;
    });
    expect(improper.length, "level 4 never draws an operand past one whole").toBeGreaterThan(0);
  });

  /**
   * 5.NF.A.1/A.2 includes sums over one — its own worked example is `2/3 + 5/4 = 23/12` — so
   * the last two rungs must reach past 1, and the first three must not. What every rung keeps
   * is that no choice is ever a whole number: among three fractions, a whole number is found
   * by its shape without doing any arithmetic.
   */
  it("holds every answer under 1 to level 2, reaches past it from level 3, and never renders a whole number", () => {
    for (const lvl of LEVELS) {
      let atLeastOne = 0;
      for (const q of draws(fracAddsub, lvl, "frac-addsub")) {
        for (const choice of q.choices) {
          expect(choice, `${q.prompt} offers the whole number ${choice}`).toMatch(/^\d+\/\d+$/);
        }
        const v = exactValue(q.answer);
        expect(Number.isInteger(v), `${q.prompt} answers ${q.answer}, a whole number`).toBe(false);
        if (lvl <= 2) expect(v, `level ${lvl}: ${q.prompt} answers ${q.answer}`).toBeLessThan(1);
        if (v > 1) atLeastOne += 1;
      }
      if (lvl >= 3) expect(atLeastOne, `level ${lvl} never asks a sum over 1`).toBeGreaterThan(0);
      else expect(atLeastOne, `level ${lvl} asked a sum over 1`).toBe(0);
    }
  });

  it("answers with a fully reduced fraction, never an unreduced one", () => {
    // Reduction is the decision: the verifiers reduce too, so an unreduced answer fails the
    // harness rather than passing quietly. Whether the answer is under 1 is a separate rule,
    // checked above — reduction holds at every level.
    for (const lvl of LEVELS) {
      for (const q of draws(fracAddsub, lvl, "frac-addsub")) {
        expect(q.answer, q.prompt).toMatch(/^\d+\/\d+$/);
        expect(lowestTerms(q.answer), `${q.prompt} answers ${q.answer}, which reduces further`).toBe(true);
        expect(exactValue(q.answer), q.prompt).toBeGreaterThan(0);
        expectFourDistinctValues(q);
      }
    }
  });

  it("always offers numerators AND denominators added, whenever the question adds", () => {
    // 1/4 + 2/4 = 3/8 is the single most common error at this age, so it is mandatory.
    // It can never collide with the answer: the mediant of two positive fractions lies
    // strictly between them and their sum is larger than both.
    for (const lvl of LEVELS) {
      let adding = 0;
      for (const q of draws(fracAddsub, lvl, "frac-addsub")) {
        const { n1, d1, op, n2, d2 } = parts(q);
        if (op !== "+") continue;
        adding += 1;
        // Not the answer, as well as on screen: an operand past one whole is new at level 4,
        // and `toContain` alone would pass silently if the mediant ever landed on the sum —
        // the choice builder drops a duplicate and backfills a near miss instead.
        expect(`${n1 + n2}/${d1 + d2}`, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer ${n1 + n2}/${d1 + d2}`).toContain(`${n1 + n2}/${d1 + d2}`);
      }
      expect(adding, `level ${lvl} never asks an addition`).toBeGreaterThan(0);
    }
  });
});

describe("frac-mul", () => {
  const parts = (q: Question) => {
    const m = /^What is (\d+)\/(\d+) × (\d+)\/(\d+)\?$/.exec(q.prompt)!;
    return { n1: Number(m[1]), d1: Number(m[2]), n2: Number(m[3]), d2: Number(m[4]) };
  };

  it("multiplies two proper fractions in lowest terms, inside the level's ceiling", () => {
    const max = [4, 5, 6, 8, 10];
    for (const lvl of LEVELS) {
      for (const q of draws(fracMul, lvl, "frac-mul")) {
        const { n1, d1, n2, d2 } = parts(q);
        for (const [n, d] of [[n1, d1], [n2, d2]]) {
          expect(d, q.prompt).toBeLessThanOrEqual(max[lvl]);
          expect(n, q.prompt).toBeLessThan(d);
          expect(lowestTerms(`${n}/${d}`), `${q.prompt} has an operand that is not in lowest terms`).toBe(true);
        }
      }
    }
  });

  it("answers with a fully reduced proper fraction and four different numbers", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracMul, lvl, "frac-mul")) {
        expect(q.answer, q.prompt).toMatch(/^\d+\/\d+$/);
        expect(lowestTerms(q.answer), `${q.prompt} answers ${q.answer}, which reduces further`).toBe(true);
        expectFourDistinctValues(q);
      }
    }
  });

  it("always offers the cross-multiplied answer, written the way a child would write it", () => {
    // 1/2 × 1/2 cross-multiplies to 2/2. Reduced to "1" it would be filtered out as a whole
    // number and the question would lose its headline distractor, so it is offered raw.
    for (const lvl of LEVELS) {
      for (const q of draws(fracMul, lvl, "frac-mul")) {
        const { n1, d1, n2, d2 } = parts(q);
        expect(q.choices, `${q.prompt} does not offer ${n1 * d2}/${d1 * n2}`).toContain(`${n1 * d2}/${d1 * n2}`);
      }
    }
  });

  it("always offers the two fractions added instead of multiplied", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracMul, lvl, "frac-mul")) {
        const { n1, d1, n2, d2 } = parts(q);
        const added = `${n1 * d2 + n2 * d1}/${d1 * d2}`;
        // Skipped only when cross-multiplying already produced the same NUMBER, in which
        // case it is on screen under a different spelling.
        if (exactValue(added) === (n1 * d2) / (d1 * n2)) continue;
        expect(q.choices, `${q.prompt} does not offer ${added}`).toContain(added);
      }
    }
  });
});

describe("dec-ops", () => {
  const parts = (q: Question) => {
    const m = /^What is (\d+(?:\.\d+)?) ([+\-×]) (\d+(?:\.\d+)?)\?$/.exec(q.prompt)!;
    return { a: m[1], op: m[2], b: m[3] };
  };
  /** Digits of a decimal string as an integer scaled by 10 000, read never as a float. */
  const scaled = (text: string) => {
    const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text)!;
    return Number(m[1]) * 10000 + Number((m[2] ?? "").padEnd(4, "0"));
  };

  it("never lets a floating-point artifact reach a child", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in JavaScript. Four digits after the point is the
    // most this generator can produce; anything longer is a float that leaked.
    for (const lvl of LEVELS) {
      for (const q of draws(decOps, lvl, "dec-ops")) {
        for (const choice of q.choices) {
          expect(choice, `${q.prompt} offers "${choice}"`).toMatch(/^\d+(\.\d{1,4})?$/);
          expect(choice, `${q.prompt} offers "${choice}"`).not.toMatch(/\.\d*0$/);
        }
      }
    }
  });

  it("keeps each operand inside the level's decimal places, and multiplies only at level 4", () => {
    const places = [1, 1, 2, 2, 2];
    for (const lvl of LEVELS) {
      const ops = new Set<string>();
      let threePlaceProduct = 0;
      for (const q of draws(decOps, lvl, "dec-ops")) {
        const { a, op, b } = parts(q);
        ops.add(op);
        const after = (operand: string) => (operand.split(".")[1] ?? "").length;
        for (const operand of [a, b]) {
          expect(after(operand), `${q.prompt} has an operand with ${after(operand)} decimal places`).toBeGreaterThanOrEqual(1);
          expect(after(operand), q.prompt).toBeLessThanOrEqual(places[lvl]);
        }
        // 5.NBT.B.7 asks for hundredths, so tenths × hundredths must be reachable. What stays
        // barred is hundredths × hundredths: a four-place product is stamina, not skill.
        if (op === "×") {
          expect(after(a) + after(b), `${q.prompt} multiplies to ${after(a) + after(b)} places`).toBeLessThanOrEqual(3);
          if (after(a) + after(b) === 3) threePlaceProduct += 1;
        }
      }
      expect([...ops].sort(), `level ${lvl}`).toEqual(lvl === 4 ? ["+", "-", "×"] : ["+", "-"]);
      if (lvl === 4) expect(threePlaceProduct, "level 4 never multiplies tenths by hundredths").toBeGreaterThan(0);
    }
  });

  /**
   * The five levels have to be five. `DEC_PLACES` is `[1, 1, 2, 2, 2]` and cannot climb past
   * hundredths without teaching past 5.NBT.B.7, so levels 0 and 1 had identical ranges and so
   * did 2 and 3 — a five-rung ladder that was really three. The whole part is the axis that
   * separates them instead, and this is the check that says so.
   */
  it("gives every level something no earlier level had", () => {
    const rungs = LEVELS.map((lvl) => {
      let whole = 0, places = 0;
      const ops = new Set<string>();
      for (const q of draws(decOps, lvl, "dec-ops")) {
        const { a, op, b } = parts(q);
        ops.add(op);
        if (op === "×") continue; // multiplication keeps its own small ceiling on purpose
        for (const operand of [a, b]) {
          whole = Math.max(whole, Number(operand.split(".")[0]));
          places = Math.max(places, (operand.split(".")[1] ?? "").length);
        }
      }
      return { whole, places, ops };
    });
    for (let lvl = 1; lvl < LEVELS.length; lvl++) {
      const before = rungs[lvl - 1], now = rungs[lvl];
      const newOp = [...now.ops].some((op) => !before.ops.has(op));
      const grew = now.whole > before.whole || now.places > before.places || newOp;
      expect(grew, `level ${lvl} is the same rung as level ${lvl - 1}: whole ${now.whole}, ${now.places} places, ops ${[...now.ops].sort().join("")}`).toBe(true);
    }
  });

  it("answers exactly, in scaled integers, and never with a whole number or zero", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(decOps, lvl, "dec-ops")) {
        const { a, op, b } = parts(q);
        const [sa, sb] = [scaled(a), scaled(b)];
        const expected = op === "+" ? sa + sb : op === "-" ? sa - sb : (sa * sb) / 10000;
        expect(scaled(q.answer), q.prompt).toBe(expected);
        expect(expected, q.prompt).toBeGreaterThan(0);
        expect(expected % 10000, `${q.prompt} comes out whole, leaving no point to place`).not.toBe(0);
      }
    }
  });
});

describe("volume-prism", () => {
  const sides = (q: Question) =>
    /^A box is (\d+) by (\d+) by (\d+) units\. What is its volume\?$/.exec(q.prompt)!.slice(1).map(Number) as [number, number, number];

  it("keeps every side inside the level's range and answers with the volume", () => {
    const max = [3, 4, 5, 6, 8];
    for (const lvl of LEVELS) {
      for (const q of draws(volumePrism, lvl, "volume-prism")) {
        const [l, w, h] = sides(q);
        for (const side of [l, w, h]) {
          expect(side, q.prompt).toBeGreaterThanOrEqual(1);
          expect(side, q.prompt).toBeLessThanOrEqual(max[lvl]);
        }
        expect(Number(q.answer), q.prompt).toBe(l * w * h);
      }
    }
  });

  it("never draws a box whose volume equals another measure of itself", () => {
    // All three distractors are measures of the same box. A 1 by 2 by 3 box has a volume
    // of 6 and sides summing to 6; a cube of side 6 has a volume and a surface area of
    // 216; and any box one unit deep has a volume equal to two of its sides multiplied.
    // Each puts a second right answer among the choices, so each is redrawn.
    for (const lvl of LEVELS) {
      for (const q of draws(volumePrism, lvl, "volume-prism")) {
        const [l, w, h] = sides(q);
        const volume = l * w * h;
        expect(volume, `${q.prompt} has two right answers (surface area)`).not.toBe(2 * (l * w + l * h + w * h));
        expect(volume, `${q.prompt} has two right answers (the sides added)`).not.toBe(l + w + h);
        expect(q.choices.filter((c) => Number(c) === volume), q.prompt).toHaveLength(1);
      }
    }
  });

  it("offers the surface area, the sides added, and two of the three multiplied", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(volumePrism, lvl, "volume-prism")) {
        const [l, w, h] = sides(q);
        expect(q.choices, q.prompt).toContain(String(2 * (l * w + l * h + w * h)));
        expect(q.choices, q.prompt).toContain(String(l + w + h));
        const pairs = [l * w, l * h, w * h].map(String);
        expect(q.choices.some((c) => pairs.includes(c)), `${q.prompt} offers no pair product: ${q.choices.join(", ")}`).toBe(true);
      }
    }
  });
});

describe("order-ops", () => {
  const expression = (q: Question) => /^What is (.+)\?$/.exec(q.prompt)![1];

  /**
   * Precedence is coded twice — once in the generator, once in the verifier — and described a
   * third time in this file, but until now no GOLDEN VALUE said what the rule actually comes
   * out to. Two codings that drift the same way agree with each other and with nothing else.
   * The two are structurally dissimilar, so this is insurance rather than a live bug.
   *
   * The verifier is anchored here, and the harness in `drill-verify.test.ts` anchors every
   * generated question to the verifier, so the generator's coding is pinned through it.
   *
   * Each case carries the left-to-right misreading beside the answer, and asserts they
   * DIFFER: `2 × 3 + 4` is 10 whichever way it is read, and a case like that would sit here
   * looking like coverage while testing nothing about precedence at all.
   */
  it("gets four hardcoded expressions right, multiplication before addition", () => {
    const golden: [string, string, string][] = [
      ["3 + 4 × 2", "11", "14"],
      ["10 - 2 × 3", "4", "24"],
      ["2 + 3 × 4 - 5", "9", "15"],
      ["2 + (3 + 4) × 2", "16", "18"],
    ];
    for (const [text, answer, misread] of golden) {
      expect(answer, `${text} reads the same either way, so it tests nothing`).not.toBe(misread);
      const q: Question = {
        id: "order-ops:golden",
        skillId: "order-ops",
        prompt: `What is ${text}?`,
        choices: [answer, misread, "97", "98"],
        answer,
      };
      expect(VERIFIERS["order-ops"](q), text).toBe(answer);
      // The misreading is what the verifier must NOT return, stated rather than implied.
      expect(readLeftToRight(text), text).toBe(Number(misread));
    }
  });

  /**
   * The expression read strictly left to right, with the bracket done first — the mistake
   * this skill exists to correct. Written here from the printed text, so it is not the
   * generator's own idea of what a child would do.
   */
  function readLeftToRight(text: string): number {
    const flattened = text.replace(/\((\d+) ([+\-×]) (\d+)\)/, (_, a, op, b) =>
      String(op === "+" ? Number(a) + Number(b) : op === "-" ? Number(a) - Number(b) : Number(a) * Number(b)));
    const tokens = flattened.split(" ");
    let total = Number(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const value = Number(tokens[i + 1]);
      total = tokens[i] === "+" ? total + value : tokens[i] === "-" ? total - value : total * value;
    }
    return total;
  }

  it("uses the level's number of terms, and brackets only from level 3", () => {
    // Staggered on purpose: these used to move together at levels 0-2 and again at 3-4, so
    // each of those was one rung printed twice. Now every rung has either a number or a term
    // the rung below could not put on screen.
    const terms = [3, 3, 4, 4, 5];
    const numMax = [9, 12, 12, 12, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(orderOps, lvl, "order-ops")) {
        const text = expression(q);
        const numbers = text.match(/\d+/g)!.map(Number);
        expect(numbers, q.prompt).toHaveLength(terms[lvl]);
        for (const n of numbers) {
          expect(n, q.prompt).toBeGreaterThanOrEqual(1);
          expect(n, q.prompt).toBeLessThanOrEqual(numMax[lvl]);
        }
        expect((text.match(/\(/g) ?? []).length, `level ${lvl}: ${q.prompt}`).toBe(lvl >= 3 ? 1 : 0);
        expect((text.match(/\)/g) ?? []).length, `level ${lvl}: ${q.prompt}`).toBe(lvl >= 3 ? 1 : 0);
        expect(Number(q.answer), q.prompt).toBeGreaterThan(0);
        expect(Number(q.answer), q.prompt).toBeLessThanOrEqual(200);
      }
    }
  });

  it("always offers the left-to-right reading, and never lets it be the right answer", () => {
    // An expression where ignoring precedence happens to give the right answer teaches
    // nothing AND puts the same number on screen twice, so it is redrawn rather than patched.
    for (const lvl of LEVELS) {
      for (const q of draws(orderOps, lvl, "order-ops")) {
        const ltr = readLeftToRight(expression(q));
        expect(String(ltr), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the left-to-right reading ${ltr}`).toContain(String(ltr));
      }
    }
  });

  it("speaks the brackets as words, so read-aloud never drops them in silence", () => {
    for (const q of draws(orderOps, 4, "order-ops")) {
      expect(q.readAloud, q.readAloud).toContain("open parenthesis");
      expect(q.readAloud, q.readAloud).toContain("close parenthesis");
      expect(q.readAloud, q.readAloud).not.toMatch(/[()]/);
    }
  });
});

/**
 * The column arithmetic, written out here rather than imported. Every assertion below reads
 * the two numbers off the PROMPT and works the columns itself, so a generator that had its
 * own idea of when a column regroups disagrees with this rather than being believed.
 */
const digitAt = (n: number, place: number) => Math.floor(n / place) % 10;

/** Whether each of the ones, tens and hundreds columns passes something to the next. */
function carriesOut(a: number, b: number): boolean[] {
  const out: boolean[] = [];
  let carry = 0;
  for (const place of [1, 10, 100]) {
    const sum = digitAt(a, place) + digitAt(b, place) + carry;
    carry = sum >= 10 ? 1 : 0;
    out.push(carry === 1);
  }
  return out;
}

function borrowsOut(a: number, b: number): boolean[] {
  const out: boolean[] = [];
  let borrow = 0;
  for (const place of [1, 10, 100]) {
    const diff = digitAt(a, place) - digitAt(b, place) - borrow;
    borrow = diff < 0 ? 1 : 0;
    out.push(borrow === 1);
  }
  return out;
}

/** Every regrouping skipped: the columns done as if they never talked to each other. */
function regroupingSkipped(a: number, b: number, adding: boolean): number {
  let out = 0;
  for (const place of [1, 10, 100]) {
    const x = digitAt(a, place), y = digitAt(b, place);
    out += (adding ? (x + y) % 10 : Math.abs(x - y)) * place;
  }
  return out;
}

describe("add-1000 and sub-1000", () => {
  const operands = (q: Question) => {
    const m = /^What is (\d+) ([+-]) (\d+)\?$/.exec(q.prompt);
    expect(m, `add-1000 wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return { a: Number(m![1]), adding: m![2] === "+", b: Number(m![3]) };
  };

  it("stays inside 1000, keeps both numbers real, and never asks for a negative answer", () => {
    for (const skillId of ["add-1000", "sub-1000"]) {
      for (const lvl of LEVELS) {
        for (const q of draws(addSubWithin1000, lvl, skillId)) {
          const { a, adding, b } = operands(q);
          expect(adding, `${skillId} asked the wrong operation: ${q.prompt}`).toBe(skillId === "add-1000");
          expect(a, q.prompt).toBeGreaterThanOrEqual(100);
          expect(b, q.prompt).toBeGreaterThanOrEqual(10);
          expect(Number(q.answer), q.prompt).toBe(adding ? a + b : a - b);
          expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
          expect(Number(q.answer), `${q.prompt} leaves 3.NBT.2 behind`).toBeLessThan(1000);
        }
      }
    }
  });

  /**
   * The ladder this skill has, stated per rung. 3.NBT.2 fixes the ceiling at 1000, so five
   * rungs of a widening ceiling would have been five rungs of the same work: what actually
   * gets harder is how many columns regroup, and — at the top — whether the regrouping is
   * one the child caused themselves a column earlier.
   */
  it("climbs by regrouping rather than by magnitude", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(addSubWithin1000, lvl, "add-1000")) {
        const { a, b } = operands(q);
        const [ones, tens, hundreds] = carriesOut(a, b);
        expect(hundreds, `${q.prompt} carries past the hundreds`).toBe(false);
        if (lvl === 0) expect(b, `${q.prompt} should add a two-digit number`).toBeLessThan(100);
        else expect(b, `${q.prompt} should add a three-digit number`).toBeGreaterThanOrEqual(100);
        if (lvl <= 1) expect([ones, tens], `${q.prompt} regroups on a rung that should not`).toEqual([false, false]);
        if (lvl === 2) expect([ones, tens].filter(Boolean).length, `${q.prompt} is not exactly one carry`).toBe(1);
        if (lvl >= 3) expect([ones, tens], `${q.prompt} is not two carries`).toEqual([true, true]);
        // The top rung is the carry a child creates: the tens sum to nine on their own and
        // only tip over because the ones column handed one up. Level 3's two carries are
        // independent of each other, which is what keeps the two rungs apart.
        const tensAlone = digitAt(a, 10) + digitAt(b, 10);
        if (lvl === 3) expect(tensAlone, `${q.prompt} only carries because the ones did`).toBeGreaterThanOrEqual(10);
        if (lvl === 4) expect(tensAlone, `${q.prompt} does not cascade`).toBe(9);
      }
      for (const q of draws(addSubWithin1000, lvl, "sub-1000")) {
        const { a, b } = operands(q);
        const [ones, tens] = borrowsOut(a, b);
        if (lvl === 0) expect(b, `${q.prompt} should subtract a two-digit number`).toBeLessThan(100);
        else expect(b, `${q.prompt} should subtract a three-digit number`).toBeGreaterThanOrEqual(100);
        if (lvl <= 1) expect([ones, tens], `${q.prompt} borrows on a rung that should not`).toEqual([false, false]);
        if (lvl === 2) expect([ones, tens], `${q.prompt} is not exactly one borrow`).toEqual([true, false]);
        if (lvl >= 3) expect([ones, tens], `${q.prompt} is not two borrows`).toEqual([true, true]);
        // The top rung is the borrow across a zero — 405 - 167, the shape a grade-3 class
        // spends a week on. Level 3 keeps a real digit in the tens, so the two differ.
        if (lvl === 3) expect(digitAt(a, 10), `${q.prompt} borrows across a zero on level 3`).not.toBe(0);
        if (lvl === 4) expect(digitAt(a, 10), `${q.prompt} has nothing to borrow across`).toBe(0);
      }
    }
  });

  it("offers the answer with every regrouping skipped, from the first rung that regroups", () => {
    for (const skillId of ["add-1000", "sub-1000"]) {
      for (const lvl of [2, 3, 4]) {
        for (const q of draws(addSubWithin1000, lvl, skillId)) {
          const { a, adding, b } = operands(q);
          const skipped = String(regroupingSkipped(a, b, adding));
          // On screen AND not the answer. `toContain` alone would pass either way: when a
          // characteristic-error distractor equals the answer the choice builder quietly
          // backfills a near miss instead of offering a duplicate, so nothing would fire.
          expect(skipped, `${q.prompt} has two right answers`).not.toBe(q.answer);
          expect(q.choices, q.prompt).toContain(skipped);
        }
      }
    }
    // Not vacuous the other way either: levels 0 and 1 regroup nowhere, so the "skipped"
    // answer IS the answer and must not be offered a second time.
    for (const skillId of ["add-1000", "sub-1000"]) {
      for (const lvl of [0, 1]) {
        for (const q of draws(addSubWithin1000, lvl, skillId)) {
          const { a, adding, b } = operands(q);
          expect(String(regroupingSkipped(a, b, adding)), q.prompt).toBe(q.answer);
        }
      }
    }
  });
});

describe("mul-standard", () => {
  const operands = (q: Question) => /^What is (\d+) × (\d+)\?$/.exec(q.prompt)!.slice(1).map(Number) as [number, number];
  const interiorZero = (n: number) => String(n).slice(1, -1).includes("0");

  it("gives each level the shape 5.NBT.5 asks for, and buys only one rung with a longer number", () => {
    // 5.NBT.5 is the standard algorithm, so the rungs are partial-product rows and the
    // places a child loses one — not four-digit numbers for their own sake. Levels 0 and 1
    // have identical digit counts and differ only in the zero inside the multiplicand.
    const digits: [number, number][] = [[3, 2], [3, 2], [4, 2], [3, 3], [3, 3]];
    const zeroInside: (boolean | null)[] = [false, true, null, false, true];
    for (const lvl of LEVELS) {
      for (const q of draws(mulMulti, lvl, "mul-standard")) {
        const [a, b] = operands(q);
        expect(String(a).length, q.prompt).toBe(digits[lvl][0]);
        expect(String(b).length, q.prompt).toBe(digits[lvl][1]);
        expect(a % 10, `${q.prompt} ends in 0, so "tens ignored" would be 0`).not.toBe(0);
        expect(b % 10, `${q.prompt} ends in 0`).not.toBe(0);
        if (zeroInside[lvl] !== null) expect(interiorZero(a), `${q.prompt} has the wrong zero shape`).toBe(zeroInside[lvl]);
        expect(Number(q.answer), q.prompt).toBe(a * b);
      }
    }
  });

  it("carries somewhere, and always offers the ones digit multiplied on its own", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(mulMulti, lvl, "mul-standard")) {
        const [a, b] = operands(q);
        expect(carryDroppedProduct(a, b), `${q.prompt} has two right answers`).not.toBe(a * b);
        expect(String((a % 10) * b), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(String((a % 10) * b));
      }
    }
  });
});

describe("div-2digit", () => {
  const parts = (q: Question) => {
    const m = /^What is (\d+) ÷ (\d+)\? Give the (quotient|remainder)\.$/.exec(q.prompt)!;
    return { dividend: Number(m[1]), divisor: Number(m[2]), wants: m[3] };
  };
  /** Dividing by the divisor rounded down to a whole ten — written again, not imported. */
  const tensOnly = (dividend: number, divisor: number) => Math.floor(dividend / (Math.floor(divisor / 10) * 10));

  it("always divides by a real two-digit divisor and never by a whole ten", () => {
    // `÷ 40` is a one-digit division with a place shift, not the algorithm 5.NBT.6 names.
    for (const lvl of LEVELS) {
      for (const q of draws(divTwoDigit, lvl, "div-2digit")) {
        const { dividend, divisor } = parts(q);
        expect(divisor, q.prompt).toBeGreaterThanOrEqual(11);
        expect(divisor, q.prompt).toBeLessThanOrEqual(99);
        expect(divisor % 10, `${q.prompt} divides by a whole ten`).not.toBe(0);
        expect(dividend, `${q.prompt} passes four digits`).toBeLessThanOrEqual(9999);
        expect(dividend, q.prompt).toBeGreaterThanOrEqual(100);
      }
    }
  });

  /**
   * The ladder is the digits of the QUOTIENT — how many times a child brings a digit down —
   * with the dividend following from that rather than driving it. The top rung is the
   * quotient with a zero inside it, the step that gets dropped.
   */
  it("climbs by the digits of the quotient, ending on the one with a zero inside it", () => {
    const quotientDigits = [1, 1, 2, 2, 3];
    for (const lvl of LEVELS) {
      for (const q of draws(divTwoDigit, lvl, "div-2digit")) {
        const { dividend, divisor, wants } = parts(q);
        const quotient = Math.floor(dividend / divisor);
        expect(String(quotient).length, q.prompt).toBe(quotientDigits[lvl]);
        expect(wants, `level ${lvl} asked for the ${wants}`).toBe(lvl % 2 === 0 ? "quotient" : "remainder");
        // Quotient rungs come out exactly, so the answer is the whole of the division;
        // remainder rungs always leave something, or there would be nothing to ask about.
        if (lvl % 2 === 0) expect(dividend % divisor, `${q.prompt} does not divide exactly`).toBe(0);
        else expect(dividend % divisor, `${q.prompt} has no remainder to ask about`).not.toBe(0);
        if (lvl === 4) expect(String(quotient).slice(1, -1), `${q.prompt} has no zero to drop`).toContain("0");
        expect(Number(q.answer), q.prompt).toBe(wants === "quotient" ? quotient : dividend % divisor);
      }
    }
  });

  it("puts the mistake each rung is about on the screen, and never as the right answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(divTwoDigit, lvl, "div-2digit")) {
        const { dividend, divisor, wants } = parts(q);
        const quotient = Math.floor(dividend / divisor);
        // Every rung offers the estimate taken for the answer, or — on a remainder rung —
        // the quotient, since swapping the two measures is THE mistake there. Each is
        // checked against the answer as well as for its presence: a characteristic-error
        // distractor that equals the answer is backfilled away, and `toContain` alone
        // would still pass while the question quietly had two right answers.
        const mistake = String(wants === "quotient" ? tensOnly(dividend, divisor) : quotient);
        expect(mistake, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(mistake);
        if (lvl === 4) {
          // The zero left out of the quotient: 3045 ÷ 15 answered 23 rather than 203.
          const dropped = String(Number(String(quotient).replace("0", "")));
          expect(dropped, `${q.prompt} has two right answers`).not.toBe(q.answer);
          expect(q.choices, q.prompt).toContain(dropped);
        }
      }
    }
  });
});

describe("every generated skill can fill a deed", () => {
  /**
   * A deed asks eight questions and `drawGenerated` will not repeat an id, so a level with
   * fewer than eight distinct questions hands a child a short run. This is the check that
   * says so out loud, per level, rather than leaving it to be noticed in use.
   *
   * Written because `count-seq` level 0 had exactly four questions in existence — a cap of
   * 5 drawing n in [1, max - 1] — so a kindergartener's first counting deed was four
   * questions long and nothing said so. There are no exemptions and there should never be
   * one: a level that cannot fill a deed is a bug in that level's range.
   *
   * Derived from SKILLS rather than a hand-kept list of generator ids, for two reasons. A
   * hand-kept list goes stale every time a grade is added. And a generator's behaviour
   * depends on WHICH SKILL asks it — `sub` serves `sub-10`, `sub-20` and `sub-100` off
   * different ceilings — so passing the generator's own id as the skill id, as this used
   * to, silently skipped every parameterised row and exercised a fallback branch instead
   * of the real ones.
   */
  const PAIRS = SKILLS.filter((s) => s.source.kind === "generator").flatMap((s) =>
    LEVELS.map((lvl) => [s.id, (s.source as { generatorId: string }).generatorId, lvl] as [string, string, number])
  );

  /**
   * Checked against an independent source rather than against the line that builds PAIRS.
   * `PAIRS.length === generatedSkills * LEVELS.length` merely restates the flatMap above and
   * would still hold if SKILLS came back empty; the registry is a second opinion, and the
   * floor is a number that only goes up as grades land.
   */
  it("covers every generated skill, so the check below is not vacuous", () => {
    const generatorIds = new Set(
      SKILLS.filter((s) => s.source.kind === "generator").map((s) => (s.source as { generatorId: string }).generatorId),
    );
    expect(generatorIds.size).toBe(Object.keys(GENERATORS).length);
    expect(PAIRS.length).toBeGreaterThanOrEqual(34 * LEVELS.length);
  });

  // `%i` on a three-element row consumes genId, so every title read "level NaN" and the
  // report never said which rung was covered. The title is formatted by hand instead.
  it.each(PAIRS.map((row) => [`${row[0]} at level ${row[2]}`, ...row] as [string, string, string, number]))(
    "%s offers at least eight different questions",
    (_title, skillId, genId, lvl) => {
      const ids = new Set<string>();
      for (const seed of SEEDS) {
        const rng = seededRng(seed);
        for (let i = 0; i < 20; i++) ids.add(GENERATORS[genId](lvl, rng, skillId).id);
      }
      expect(ids.size, `${skillId} level ${lvl} can only ask ${ids.size} questions`).toBeGreaterThanOrEqual(8);
    },
  );

  /**
   * Distinct ids are not distinct QUESTIONS. `drawGenerated` draws until it has eight ids,
   * so an id carrying a parameter that never reaches the screen — a shuffle order, a scale
   * factor — lets the same prompt through twice. `frac-equiv` was the worst of it: "Which
   * fraction is equal to 1/2?" asked twice, answered `2/4` the first time and `3/6` the
   * second, with `2/4` absent from the second question's choices. A child who reasons "I
   * answered this already" is marked wrong for being right.
   *
   * What a child recognises is the prompt. Two generators frame their question in a
   * sentence that names no number at all — "Which number is the greatest?" — and put the
   * data entirely in the choices; for those, and only those, the choices are part of the
   * question. Everywhere else the prompt IS the question and repeating it is the bug.
   */
  const questionIdentity = (q: Question): string =>
    /\d/.test(q.prompt) ? q.prompt : `${q.prompt}|${[...q.choices].sort().join(",")}`;

  it("only two generators frame their question without naming a number", () => {
    const frames = new Set<string>();
    for (const [skillId, genId, lvl] of PAIRS) {
      const q = GENERATORS[genId](lvl, seededRng(11), skillId);
      if (!/\d/.test(q.prompt)) frames.add(genId);
    }
    expect([...frames].sort()).toEqual(["compare-num", "fractions-compare"]);
  });

  it.each(PAIRS.map((row) => [`${row[0]} at level ${row[2]}`, ...row] as [string, string, string, number]))(
    "%s fills a deed without asking the same question twice",
    (_title, skillId, genId, lvl) => {
      for (const seed of SEEDS.slice(0, 50)) {
        const rng = seededRng(seed);
        const seen = new Set<string>();
        const asked: string[] = [];
        let guard = 0;
        while (asked.length < 8 && guard++ < 200) {
          const q = GENERATORS[genId](lvl, rng, skillId);
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          asked.push(questionIdentity(q));
        }
        expect(asked.length, `${skillId} L${lvl} seed ${seed} could not fill a deed`).toBe(8);
        expect(new Set(asked).size, `${skillId} L${lvl} seed ${seed} repeated a question`).toBe(asked.length);
      }
    },
  );
});
