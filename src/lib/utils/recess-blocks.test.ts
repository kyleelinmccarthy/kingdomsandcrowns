import { describe, it, expect } from "vitest";
import { findRecessConflict, isValidTimeRange } from "./recess-blocks";

const math = { startTime: "09:00", endTime: "10:00" };
const recess = { startTime: "10:30", endTime: "10:45" };

describe("isValidTimeRange", () => {
  it("requires HH:mm and a start before the end", () => {
    expect(isValidTimeRange("09:00", "09:30")).toBe(true);
    expect(isValidTimeRange("09:30", "09:30")).toBe(false);
    expect(isValidTimeRange("9:00", "09:30")).toBe(false);
  });
});

describe("findRecessConflict", () => {
  it("returns the class block a recess would overlap", () => {
    expect(findRecessConflict({ startTime: "09:45", endTime: "10:15" }, [math], [])).toEqual(math);
  });
  it("returns another recess block it would overlap", () => {
    expect(findRecessConflict({ startTime: "10:40", endTime: "11:00" }, [math], [recess])).toEqual(recess);
  });
  it("treats an identical range as a conflict, unlike class-on-class", () => {
    expect(findRecessConflict({ ...math }, [math], [])).toEqual(math);
  });
  it("allows back-to-back blocks", () => {
    expect(findRecessConflict({ startTime: "10:00", endTime: "10:30" }, [math], [recess])).toBeNull();
  });
});
