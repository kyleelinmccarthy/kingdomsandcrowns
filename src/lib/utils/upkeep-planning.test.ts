import { describe, it, expect } from "vitest";
import {
  assignmentKey,
  planUpkeepAssignments,
  type PlannableTask,
} from "./upkeep-planning";

function daily(taskId: string, startDate = "2026-09-01"): PlannableTask {
  return {
    taskId,
    schedule: {
      frequency: "daily",
      daysOfWeek: null,
      intervalWeeks: null,
      startDate,
      endDate: null,
    },
  };
}

describe("planUpkeepAssignments", () => {
  it("plans a daily task across the whole range including the weekend", () => {
    // 2026-09-05 is a Saturday and 2026-09-06 a Sunday. Chores are not limited
    // to school days, which is the key divergence from quest generation.
    const result = planUpkeepAssignments(
      [daily("t1")],
      new Set(),
      "2026-09-04",
      "2026-09-07"
    );
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-06" },
      { taskId: "t1", date: "2026-09-07" },
    ]);
  });

  it("skips dates that already have an assignment", () => {
    const existing = new Set([assignmentKey("t1", "2026-09-05")]);
    const result = planUpkeepAssignments(
      [daily("t1")],
      existing,
      "2026-09-04",
      "2026-09-06"
    );
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-06" },
    ]);
  });

  it("is idempotent — replanning over its own output produces nothing", () => {
    const first = planUpkeepAssignments([daily("t1")], new Set(), "2026-09-04", "2026-09-06");
    const keys = new Set(first.map((r) => assignmentKey(r.taskId, r.date)));
    const second = planUpkeepAssignments([daily("t1")], keys, "2026-09-04", "2026-09-06");
    expect(second).toEqual([]);
  });

  it("honours weekly daysOfWeek", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: JSON.stringify(["sat"]),
        intervalWeeks: 1,
        startDate: "2026-09-01",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-14");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-12" },
    ]);
  });

  it("honours an every-other-week interval", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: JSON.stringify(["sat"]),
        intervalWeeks: 2,
        startDate: "2026-09-05",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-30");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-19" },
    ]);
  });

  it("stops at the schedule's end date", () => {
    const task = daily("t1");
    task.schedule.endDate = "2026-09-05";
    const result = planUpkeepAssignments([task], new Set(), "2026-09-04", "2026-09-08");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-05" },
    ]);
  });

  it("plans a one-off on exactly its start date", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "once",
        daysOfWeek: null,
        intervalWeeks: null,
        startDate: "2026-09-05",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-30");
    expect(result).toEqual([{ taskId: "t1", date: "2026-09-05" }]);
  });

  it("plans several tasks together", () => {
    const result = planUpkeepAssignments(
      [daily("t1"), daily("t2")],
      new Set([assignmentKey("t2", "2026-09-04")]),
      "2026-09-04",
      "2026-09-04"
    );
    expect(result).toEqual([{ taskId: "t1", date: "2026-09-04" }]);
  });

  it("tolerates malformed daysOfWeek JSON without throwing", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: "not json",
        intervalWeeks: 1,
        startDate: "2026-09-01",
        endDate: null,
      },
    };
    expect(planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-14")).toEqual([]);
  });

  it("plans nothing for no tasks", () => {
    expect(planUpkeepAssignments([], new Set(), "2026-09-01", "2026-09-30")).toEqual([]);
  });
});
