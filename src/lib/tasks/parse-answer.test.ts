import { describe, expect, it } from "vitest";
import { formatRational, parseAnswer, sameValue, type Rational } from "./parse-answer";

// tsconfig targets ES2017, so bigint literals (1n) are unavailable; build with BigInt().
const r = (n: number, d: number): Rational => ({ n: BigInt(n), d: BigInt(d) });
const parse = (s: string): Rational => {
  const v = parseAnswer(s);
  if (!v) throw new Error(`expected "${s}" to parse`);
  return v;
};

describe("parseAnswer", () => {
  it.each(["3/4", "0.75", ".75", " 6/8 ", "\t0.750\n"])("reads %j as 3/4", (s) => {
    expect(parseAnswer(s)).toEqual(r(3, 4));
  });

  it("reads mixed numbers, integers and thousands commas", () => {
    expect(parseAnswer("1 1/2")).toEqual(r(3, 2));
    expect(parseAnswer("-2")).toEqual(r(-2, 1));
    expect(parseAnswer("1,000")).toEqual(r(1000, 1));
    expect(parseAnswer("1,234,567.5")).toEqual(r(2469135, 2));
    expect(parseAnswer("7")).toEqual(r(7, 1));
    expect(parseAnswer("0")).toEqual(r(0, 1));
  });

  it("accepts a leading minus on every form", () => {
    expect(parseAnswer("-0.5")).toEqual(r(-1, 2));
    expect(parseAnswer("-.5")).toEqual(r(-1, 2));
    expect(parseAnswer("-3/6")).toEqual(r(-1, 2));
    expect(parseAnswer("-1 1/2")).toEqual(r(-3, 2));
  });

  it("normalises zero and signs", () => {
    expect(parseAnswer("-0")).toEqual(r(0, 1));
    expect(parseAnswer("0/9")).toEqual(r(0, 1));
    expect(parseAnswer("-0/9")).toEqual(r(0, 1));
  });

  it("is exact for large values", () => {
    expect(parseAnswer("12345678901234567890")).toEqual({
      n: BigInt("12345678901234567890"),
      d: BigInt(1),
    });
  });

  it.each([
    "1/0",
    "abc",
    "1//2",
    "",
    "   ",
    "+1",
    "1,00",
    "1,0000",
    ",100",
    "1,000/2",
    "1.2.3",
    "5.",
    ".",
    "-",
    "1 3/2",
    "1 2/2",
    "1  1/2",
    "1 1 /2",
    "3 / 4",
    "1/2/3",
    "1/-2",
    "--1",
    "1e3",
    "0x10",
    "1+1",
    "1/2 1",
    "1 1/0",
    "9".repeat(51),
  ])("rejects %j", (s) => {
    expect(parseAnswer(s)).toBeNull();
  });

  it("allows exactly 50 characters", () => {
    expect(parseAnswer("9".repeat(50))).not.toBeNull();
  });
});

describe("sameValue", () => {
  it("compares exactly without a tolerance", () => {
    expect(sameValue(parse("3/4"), parse("0.75"))).toBe(true);
    expect(sameValue(parse("1/3"), parse("0.333"))).toBe(false);
    expect(sameValue(parse("-1/2"), parse("1/2"))).toBe(false);
  });

  it("honours an inclusive tolerance", () => {
    expect(sameValue(parse("0.333"), r(1, 3), r(1, 100))).toBe(true);
    expect(sameValue(parse("0.5"), parse("0.4"), r(1, 10))).toBe(true);
    expect(sameValue(parse("0.5"), parse("0.3"), r(1, 10))).toBe(false);
    expect(sameValue(parse("0.3"), parse("0.5"), r(1, 10))).toBe(false);
  });
});

describe("formatRational", () => {
  it("formats mixed numbers", () => {
    expect(formatRational(r(3, 2), "mixed")).toBe("1 1/2");
    expect(formatRational(r(1, 2), "mixed")).toBe("1/2");
    expect(formatRational(r(4, 2), "mixed")).toBe("2");
    expect(formatRational(r(0, 1), "mixed")).toBe("0");
    expect(formatRational(r(-3, 2), "mixed")).toBe("-1 1/2");
    expect(formatRational(r(-1, 2), "mixed")).toBe("-1/2");
  });

  it("formats reduced fractions", () => {
    expect(formatRational(parse("6/8"), "fraction")).toBe("3/4");
    expect(formatRational(r(4, 2), "fraction")).toBe("2");
    expect(formatRational(r(-3, 2), "fraction")).toBe("-3/2");
    expect(formatRational(r(0, 1), "fraction")).toBe("0");
  });

  it("formats decimals exactly when terminating", () => {
    expect(formatRational(r(3, 4), "decimal")).toBe("0.75");
    expect(formatRational(r(3, 2), "decimal")).toBe("1.5");
    expect(formatRational(r(5, 1), "decimal")).toBe("5");
    expect(formatRational(r(-1, 8), "decimal")).toBe("-0.125");
    expect(formatRational(r(1, 20), "decimal")).toBe("0.05");
    expect(formatRational(r(1, 65536), "decimal")).toBe("0.0000152587890625");
    expect(formatRational(r(0, 1), "decimal")).toBe("0");
  });

  it("rounds non-terminating decimals to 4 places, trimming zeros", () => {
    expect(formatRational(r(1, 3), "decimal")).toBe("0.3333");
    expect(formatRational(r(2, 3), "decimal")).toBe("0.6667");
    expect(formatRational(r(-1, 3), "decimal")).toBe("-0.3333");
    expect(formatRational(r(1, 7), "decimal")).toBe("0.1429");
    expect(formatRational(r(1001, 3000), "decimal")).toBe("0.3337");
    expect(formatRational(r(1, 30000), "decimal")).toBe("0");
    expect(formatRational(r(-1, 30000), "decimal")).toBe("0");
    expect(formatRational(r(19999, 30000), "decimal")).toBe("0.6666");
    expect(formatRational(r(29999, 3), "decimal")).toBe("9999.6667");
    expect(formatRational(r(99999, 30000), "decimal")).toBe("3.3333");
    expect(formatRational(r(299999, 300000), "decimal")).toBe("1");
  });
});
