import { describe, it, expect } from "vitest";
import { areaPerimeter, fracUnit, roundNearest } from "./intermediate";
import { GENERATORS, seededRng, type Question, type Rng } from "../drill-generators";

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
  it("answers with the mark the prompt asks about", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracUnit, lvl, "frac-unit")) {
        const m = /split into (\d+) equal parts\. What fraction is at the (\d+)\w\w mark\?$/.exec(q.prompt)!;
        expect(q.answer, q.prompt).toBe(`${m[2]}/${m[1]}`);
        expect(Number(m[2]), q.prompt).toBeGreaterThanOrEqual(1);
        expect(Number(m[2]), q.prompt).toBeLessThan(Number(m[1]));
      }
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

  it("offers the three real mistakes: upside down, one mark out, and the whole line", () => {
    for (const q of draws(fracUnit, 4, "frac-unit")) {
      const [n, d] = q.answer.split("/").map(Number);
      expect(q.choices, q.prompt).toContain(`${d}/${n}`);
      expect(q.choices, q.prompt).toContain(`${d}/${d}`);
      const offByOne = n + 1 < d ? n + 1 : n - 1;
      expect(q.choices, q.prompt).toContain(`${offByOne}/${d}`);
    }
  });

  it("speaks the mark as a word, so read-aloud never says '5 t h'", () => {
    for (const q of draws(fracUnit, 2, "frac-unit")) {
      expect(q.readAloud, q.readAloud).toMatch(/at the (first|second|third|fourth|fifth|sixth|seventh) mark/);
    }
  });
});

describe("area-perimeter", () => {
  it("never draws a rectangle whose area and perimeter are the same number", () => {
    // 4 by 4 is 16 either way. The other measure is always a distractor, so such a
    // rectangle would put a second right answer among the choices.
    for (const lvl of LEVELS) {
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const [w, h] = /is (\d+) units wide and (\d+) units tall/.exec(q.prompt)!.slice(1).map(Number);
        expect(w * h, q.prompt).not.toBe(2 * (w + h));
      }
    }
  });

  it("always offers the other measure as a wrong answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(areaPerimeter, lvl, "area-perimeter")) {
        const [w, h] = /is (\d+) units wide and (\d+) units tall/.exec(q.prompt)!.slice(1).map(Number);
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
        const [w, h] = /is (\d+) units wide and (\d+) units tall/.exec(q.prompt)!.slice(1).map(Number);
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
    for (const lvl of LEVELS) {
      for (const q of draws(roundNearest, lvl, "round-nearest")) {
        const [n, place] = /^Round (\d+) to the nearest (\d+)\.$/.exec(q.prompt)!.slice(1).map(Number);
        if (n % place === place / 2) expect(Number(q.answer), q.prompt).toBe(n - n % place + place);
      }
    }
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

describe("a new generator can fill a deed", () => {
  /**
   * A deed asks eight questions and `drawGenerated` will not repeat an id, so a level
   * with fewer than eight distinct questions hands a child a short run. This is the check
   * that says so out loud, per level, rather than leaving it to be noticed in use.
   *
   * This test was written because `count-seq` level 0 had exactly four questions — the
   * brief capped it at 5 and drew n in [1, max - 1], so a kindergartener's first counting
   * deed was four questions long and nothing said so. The cap is now 10; there are no
   * exemptions, and there should never be one: a level that cannot fill a deed is a bug in
   * that level's range, not a fact to be recorded here.
   */
  const NEW = ["count-seq", "compare-num", "ten-more-less", "skip-count", "time-clock", "money-coins", "frac-unit", "area-perimeter", "round-nearest"];

  it.each(NEW.flatMap((id) => LEVELS.map((lvl) => [id, lvl] as [string, number])))(
    "%s at level %i offers at least eight different questions",
    (genId, lvl) => {
      const ids = new Set<string>();
      for (const seed of SEEDS) {
        const rng = seededRng(seed);
        for (let i = 0; i < 20; i++) ids.add(GENERATORS[genId](lvl, rng, genId).id);
      }
      expect(ids.size, `${genId} level ${lvl} can only ask ${ids.size} questions`).toBeGreaterThanOrEqual(8);
    }
  );
});
