import { describe, it, expect } from "vitest";
import {
  deriveUpkeepStatus,
  resolveUpkeepTransition,
  summarizeUpkeepDay,
  type UpkeepStatus,
} from "./upkeep-status";

const TODAY = "2026-09-02";

function row(status: UpkeepStatus, date: string, isRequired = true) {
  return { assignment: { status, date }, task: { isRequired } };
}

describe("deriveUpkeepStatus", () => {
  it("reports a required past pending task as missed", () => {
    const r = row("pending", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("missed");
  });

  it("never reports an optional task as missed", () => {
    const r = row("pending", "2026-09-01", false);
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("does not report today's pending task as missed", () => {
    const r = row("pending", TODAY);
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("does not report a future pending task as missed", () => {
    const r = row("pending", "2026-09-03");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("leaves a past completed task alone", () => {
    const r = row("completed", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("completed");
  });

  it("leaves a past excused task alone", () => {
    const r = row("excused", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("excused");
  });

  it("does not report a past task awaiting approval as missed", () => {
    const r = row("awaiting_approval", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("awaiting_approval");
  });
});

describe("resolveUpkeepTransition", () => {
  it("credits when a task is completed directly", () => {
    expect(resolveUpkeepTransition("pending", "completed")).toEqual({
      postWages: true,
      reverseWages: false,
      grantXp: true,
      revokeXp: false,
    });
  });

  it("credits when an approval completes the task", () => {
    expect(resolveUpkeepTransition("awaiting_approval", "completed")).toEqual({
      postWages: true,
      reverseWages: false,
      grantXp: true,
      revokeXp: false,
    });
  });

  it("credits nothing when a child submits for approval", () => {
    expect(resolveUpkeepTransition("pending", "awaiting_approval")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("credits nothing on rejection back to pending", () => {
    expect(resolveUpkeepTransition("awaiting_approval", "pending")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("credits nothing when a task is excused", () => {
    expect(resolveUpkeepTransition("pending", "excused")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("does not double-pay a task that is already completed", () => {
    expect(resolveUpkeepTransition("completed", "completed")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("reverses when a completed task is un-completed", () => {
    expect(resolveUpkeepTransition("completed", "pending")).toEqual({
      postWages: false,
      reverseWages: true,
      grantXp: false,
      revokeXp: true,
    });
  });

  it("reverses when a completed task is later excused", () => {
    expect(resolveUpkeepTransition("completed", "excused")).toEqual({
      postWages: false,
      reverseWages: true,
      grantXp: false,
      revokeXp: true,
    });
  });
});

describe("summarizeUpkeepDay", () => {
  it("is all zeroes for no rows", () => {
    expect(summarizeUpkeepDay([], TODAY)).toEqual({
      total: 0,
      done: 0,
      awaitingApproval: 0,
      missed: 0,
    });
  });

  it("counts each derived status", () => {
    const rows = [
      row("completed", TODAY),
      row("completed", TODAY),
      row("awaiting_approval", TODAY),
      row("pending", TODAY),
      row("pending", "2026-09-01"), // required + past = missed
      row("pending", "2026-09-01", false), // optional + past = not missed
      row("excused", TODAY),
    ];
    expect(summarizeUpkeepDay(rows, TODAY)).toEqual({
      total: 7,
      done: 2,
      awaitingApproval: 1,
      missed: 1,
    });
  });
});
