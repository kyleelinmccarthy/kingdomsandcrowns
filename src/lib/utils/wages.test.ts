import { describe, it, expect } from "vitest";
import {
  formatWagesAsCoin,
  formatWagesAsDollars,
  parseDollarsToCents,
  sumCents,
} from "./wages";

describe("formatWagesAsCoin", () => {
  it("renders zero as 0 gp", () => {
    expect(formatWagesAsCoin(0)).toBe("0 gp");
  });

  it("renders whole dollars as gold only", () => {
    expect(formatWagesAsCoin(1200)).toBe("12 gp");
  });

  it("renders dimes as silver", () => {
    expect(formatWagesAsCoin(1250)).toBe("12 gp 5 sp");
  });

  it("renders a sub-dollar amount as silver only", () => {
    expect(formatWagesAsCoin(50)).toBe("5 sp");
  });

  it("renders odd cents as copper", () => {
    expect(formatWagesAsCoin(1253)).toBe("12 gp 5 sp 3 cp");
  });

  it("omits zero denominations in the middle", () => {
    expect(formatWagesAsCoin(1003)).toBe("10 gp 3 cp");
  });

  it("renders a single copper", () => {
    expect(formatWagesAsCoin(1)).toBe("1 cp");
  });

  it("renders negative amounts with a leading minus", () => {
    expect(formatWagesAsCoin(-500)).toBe("-5 gp");
  });
});

describe("formatWagesAsDollars", () => {
  it("renders zero", () => {
    expect(formatWagesAsDollars(0)).toBe("$0.00");
  });

  it("always shows two decimal places", () => {
    expect(formatWagesAsDollars(1250)).toBe("$12.50");
    expect(formatWagesAsDollars(1200)).toBe("$12.00");
    expect(formatWagesAsDollars(5)).toBe("$0.05");
  });

  it("puts the minus outside the dollar sign", () => {
    expect(formatWagesAsDollars(-500)).toBe("-$5.00");
  });
});

describe("parseDollarsToCents", () => {
  it("parses a plain dollar amount", () => {
    expect(parseDollarsToCents("12")).toBe(1200);
  });

  it("parses dollars and cents", () => {
    expect(parseDollarsToCents("12.50")).toBe(1250);
  });

  it("pads a single decimal place", () => {
    expect(parseDollarsToCents("12.5")).toBe(1250);
  });

  it("parses a leading-dot amount", () => {
    expect(parseDollarsToCents(".50")).toBe(50);
  });

  it("tolerates a dollar sign and surrounding whitespace", () => {
    expect(parseDollarsToCents("  $12.50 ")).toBe(1250);
  });

  it("rejects an empty string", () => {
    expect(() => parseDollarsToCents("")).toThrow();
  });

  it("rejects non-numeric input", () => {
    expect(() => parseDollarsToCents("abc")).toThrow();
  });

  it("rejects negative input — the caller decides the sign", () => {
    expect(() => parseDollarsToCents("-5")).toThrow();
  });

  it("rejects more than two decimal places", () => {
    expect(() => parseDollarsToCents("1.234")).toThrow();
  });
});

describe("sumCents", () => {
  it("is zero for no entries", () => {
    expect(sumCents([])).toBe(0);
  });

  it("nets earned against payouts", () => {
    expect(
      sumCents([
        { amountCents: 500 },
        { amountCents: 250 },
        { amountCents: -300 },
      ])
    ).toBe(450);
  });

  it("goes negative when a parent overpays", () => {
    expect(sumCents([{ amountCents: 200 }, { amountCents: -500 }])).toBe(-300);
  });

  it("nets an earned and its reversal to zero", () => {
    expect(sumCents([{ amountCents: 250 }, { amountCents: -250 }])).toBe(0);
  });
});
