import { describe, expect, it } from "vitest";
import {
  outcomeOf,
  records,
  refuseGiveUp,
  refuseRetry,
  resumeIndex,
  secondChanceAllowed,
  statusOf,
  type AttemptRecord,
  type QuestionStatus,
} from "./deed-attempts";
import type { Task } from "@/lib/tasks/registry";
import { ALREADY_ANSWERED, ANSWER_FIRST, NO_SECOND_TRIES, PICK_SHOWN, TRY_DIFFERENT } from "./deed-refusals";

const base = { id: "add-10:2:2", skillId: "add-10", prompt: "2 + 2 = ?", answer: "4" };
const four: Task = { ...base, choices: ["1", "2", "3", "4"] };
const two: Task = { ...base, choices: ["3", "4"] };
const rec = (first: string | null, second: string | null = null): AttemptRecord => ({ first, second });

describe("secondChanceAllowed", () => {
  it("needs the run to allow it and at least three choices", () => {
    expect(secondChanceAllowed(four, true)).toBe(true);
    expect(secondChanceAllowed(four, false)).toBe(false);
    expect(secondChanceAllowed(two, true)).toBe(false);
  });
});

describe("statusOf", () => {
  it("covers every status", () => {
    expect(statusOf(four, rec(null), true)).toBe("unanswered");
    expect(statusOf(four, rec("4"), true)).toBe("right-first");
    expect(statusOf(four, rec(" 4 "), true)).toBe("right-first");
    expect(statusOf(four, rec("1"), true)).toBe("open");
    expect(statusOf(four, rec("1", "4"), true)).toBe("right-second");
    expect(statusOf(four, rec("1", "2"), true)).toBe("missed");
    expect(statusOf(four, rec("1", ""), true)).toBe("missed");
  });

  it("misses at once when the run allows no second chances", () => {
    expect(statusOf(four, rec("1"), false)).toBe("missed");
  });

  it("misses at once on a two-choice question even when the run allows retries", () => {
    expect(statusOf(two, rec("3"), true)).toBe("missed");
  });
});

describe("outcomeOf", () => {
  it("maps statuses to outcomes; unresolved ones are null", () => {
    expect(outcomeOf("right-first")).toBe("first");
    expect(outcomeOf("right-second")).toBe("second");
    expect(outcomeOf("missed")).toBe("miss");
    expect(outcomeOf("unanswered")).toBeNull();
    expect(outcomeOf("open")).toBeNull();
  });
});

describe("records", () => {
  it("pairs responses with second tries", () => {
    expect(records(["a", null], ["b", null])).toEqual([
      { first: "a", second: "b" },
      { first: null, second: null },
    ]);
  });

  it("reads a short or empty secondTries (old rows) as nulls", () => {
    expect(records(["a"], [])).toEqual([{ first: "a", second: null }]);
    expect(records(["a", "b"], ["x"])).toEqual([
      { first: "a", second: "x" },
      { first: "b", second: null },
    ]);
  });
});

describe("refuseRetry", () => {
  it("allows a valid retry", () => {
    expect(refuseRetry(four, rec("1"), true, "2")).toBeNull();
    expect(refuseRetry(four, rec("1"), true, " 4 ")).toBeNull();
  });

  it.each([
    ["first unanswered", rec(null), true, "2"],
    ["first right", rec("4"), true, "2"],
    ["second already taken", rec("1", "2"), true, "3"],
    ["already gave up", rec("1", ""), true, "3"],
    ["run allows no retries", rec("1"), false, "2"],
    ["same answer as first", rec("1"), true, " 1 "],
    ["not among the choices", rec("1"), true, "9"],
    ["empty", rec("1"), true, ""],
    ["whitespace only", rec("1"), true, "   "],
  ])("refuses: %s", (_name, r, runAllows, answer) => {
    const msg = refuseRetry(four, r, runAllows, answer);
    expect(msg).toEqual(expect.any(String));
    expect(msg).not.toBe("");
  });

  it("refuses a retry on a two-choice question", () => {
    expect(refuseRetry(two, rec("3"), true, "4")).toEqual(expect.any(String));
  });

  it("never takes a non-string response as a pick", () => {
    expect(refuseRetry(four, rec("1"), true, 5)).toBe(PICK_SHOWN);
    expect(refuseRetry(four, rec("1"), true, null)).toBe(PICK_SHOWN);
    expect(refuseRetry(four, rec("1"), true, undefined)).toBe(PICK_SHOWN);
    expect(refuseRetry(four, rec("1"), true, ["4"])).toBe(PICK_SHOWN);
  });

  it("asks for a different answer when the retry equals the first pick after trimming", () => {
    expect(refuseRetry(four, rec("1"), true, " 1 ")).toBe(TRY_DIFFERENT);
    expect(refuseRetry(four, rec(" 2 "), true, "2")).toBe(TRY_DIFFERENT);
  });

  it("keeps the order of checks", () => {
    expect(refuseRetry(four, rec(null), true, 5)).toBe(ANSWER_FIRST);
    expect(refuseRetry(four, rec("4"), true, 5)).toBe(ALREADY_ANSWERED);
    expect(refuseRetry(four, rec("1"), false, 5)).toBe(NO_SECOND_TRIES);
    expect(refuseRetry(four, rec("1", "2"), true, 5)).toBe(ALREADY_ANSWERED);
  });
});

describe("refuseGiveUp", () => {
  it("allows only when the second chance is open", () => {
    expect(refuseGiveUp(four, rec("1"), true)).toBeNull();
    expect(refuseGiveUp(four, rec(null), true)).toEqual(expect.any(String));
    expect(refuseGiveUp(four, rec("4"), true)).toEqual(expect.any(String));
    expect(refuseGiveUp(four, rec("1", "2"), true)).toEqual(expect.any(String));
    expect(refuseGiveUp(four, rec("1", ""), true)).toEqual(expect.any(String));
    expect(refuseGiveUp(four, rec("1"), false)).toEqual(expect.any(String));
    expect(refuseGiveUp(two, rec("3"), true)).toEqual(expect.any(String));
  });
});

describe("resumeIndex", () => {
  it("returns the first unanswered or open question", () => {
    const s: QuestionStatus[] = ["right-first", "open", "unanswered"];
    expect(resumeIndex(s)).toBe(1);
    expect(resumeIndex(["right-first", "missed", "unanswered"])).toBe(2);
    expect(resumeIndex(["unanswered", "unanswered"])).toBe(0);
  });

  it("returns the last index when everything is resolved", () => {
    expect(resumeIndex(["right-first", "missed", "right-second"])).toBe(2);
  });
});
