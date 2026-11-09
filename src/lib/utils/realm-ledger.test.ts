import { describe, expect, it } from "vitest";
import type { LedgerRow } from "./realm-access";
import { carryable, practicePaidToday, sumKind } from "./realm-ledger";

const row = (kind: LedgerRow["kind"], minutes: number): LedgerRow => ({ kind, minutes });

describe("sumKind", () => {
  it("adds only the rows of one kind", () => {
    expect(sumKind([row("earned", 5), row("earned", 2), row("spent", 3)], "earned")).toBe(7);
    expect(sumKind([], "bonus")).toBe(0);
  });
});

describe("practicePaidToday", () => {
  it("is the side-quest pay already banked", () => {
    expect(practicePaidToday([row("practice", 3), row("practice", 4), row("earned", 9)])).toBe(7);
  });
});

describe("carryable — what a day leaves in the bank", () => {
  it("lets the allowance absorb the spend first", () => {
    expect(carryable([row("allowance", 10), row("earned", 5), row("spent", 8)], 30)).toBe(5);
  });
  it("charges only the overflow past the allowance to the other credits", () => {
    expect(carryable([row("allowance", 10), row("earned", 5), row("spent", 12)], 30)).toBe(3);
  });
  it("is capped by the bank", () => {
    expect(carryable([row("earned", 40)], 30)).toBe(30);
    expect(carryable([row("earned", 40)], 0)).toBe(0);
  });
  it("never carries the allowance itself", () => {
    expect(carryable([row("allowance", 10)], 30)).toBe(0);
  });
  it("rolls a bank forward", () => {
    expect(carryable([row("carried", 20), row("earned", 5)], 30)).toBe(25);
  });
  it("never goes below zero when the spend outruns everything", () => {
    expect(carryable([row("allowance", 10), row("earned", 5), row("spent", 40)], 30)).toBe(0);
  });
  it("counts a refund as spend given back", () => {
    expect(carryable([row("allowance", 10), row("earned", 5), row("spent", 12), row("refund", 2)], 30)).toBe(5);
  });
  it("a refund larger than the spend changes nothing", () => {
    expect(carryable([row("allowance", 10), row("earned", 5), row("spent", 3), row("refund", 9)], 30)).toBe(5);
  });
  it("charges overflow to a carried bank too", () => {
    expect(carryable([row("allowance", 10), row("carried", 20), row("spent", 15)], 30)).toBe(15);
  });
});
