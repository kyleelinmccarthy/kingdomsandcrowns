import { describe, expect, it } from "vitest";
import { choiceTone, flowReducer, initialFlow, type FlowState } from "./deed-run-flow";

const q = (id: string) => ({ kind: "choice" as const, id, skillId: "s", view: { prompt: id, choices: ["a", "b", "c", "d"] } });
const run = { questions: [q("1"), q("2"), q("3")], responses: [null, null, null] as (string | null)[], pending: null };
const right = { correct: true, secondChance: false, answer: "a" };
const open = { correct: false, secondChance: true, hint: "Count again." };
const miss = { correct: false, secondChance: false, answer: "a", explain: "Because." };

describe("initialFlow", () => {
  it("opens a fresh run on the first question, asking", () => {
    expect(initialFlow(run)).toEqual({ index: 0, phase: "asking", ruledOut: [], picked: null, result: null, streak: 0 });
  });
  it("resumes at the first unanswered question, and on the last when none is left", () => {
    expect(initialFlow({ ...run, responses: ["a", null, null] }).index).toBe(1);
    expect(initialFlow({ ...run, responses: ["a", "a", "a"] }).index).toBe(2);
  });
  it("restores an open second chance: that question, the pick crossed, the hint shown", () => {
    const s = initialFlow({ ...run, responses: ["a", "b", null], pending: { index: 1, ruledOut: "b", hint: "Try the tens." } });
    expect(s).toMatchObject({ index: 1, phase: "second-chance", ruledOut: ["b"], picked: "b" });
    expect(s.result).toMatchObject({ secondChance: true, hint: "Try the tens." });
  });
});

describe("flowReducer", () => {
  const asking = initialFlow(run);

  it("a right first try resolves", () => {
    expect(flowReducer(asking, { type: "answered", choice: "a", result: right })).toMatchObject({ phase: "resolved", picked: "a", result: right, streak: 1 });
  });
  it("a wrong first try with a second chance rules the pick out and waits", () => {
    const s = flowReducer(asking, { type: "answered", choice: "b", result: open });
    expect(s).toMatchObject({ phase: "second-chance", ruledOut: ["b"], picked: "b", result: open, streak: 0 });
  });
  it("rules out the first pick the server stored, not the choice sent with a late repeat", () => {
    const s = flowReducer(asking, { type: "answered", choice: "a", result: { ...open, firstPick: "b" } });
    expect(s).toMatchObject({ phase: "second-chance", ruledOut: ["b"], picked: "b" });
  });
  it("a wrong first try with no second chance resolves at once", () => {
    expect(flowReducer(asking, { type: "answered", choice: "b", result: miss })).toMatchObject({ phase: "resolved", picked: "b", result: miss, streak: 0 });
  });
  it("a retry resolves, whether right or wrong", () => {
    const second = flowReducer(asking, { type: "answered", choice: "b", result: open });
    expect(flowReducer(second, { type: "answered", choice: "a", result: right })).toMatchObject({ phase: "resolved", picked: "a", ruledOut: ["b"] });
    expect(flowReducer(second, { type: "answered", choice: "c", result: miss })).toMatchObject({ phase: "resolved", picked: "c" });
  });
  it("showing the answer resolves and keeps the pick", () => {
    const second = flowReducer(asking, { type: "answered", choice: "b", result: open });
    expect(flowReducer(second, { type: "gave-up", result: miss })).toMatchObject({ phase: "resolved", picked: "b", result: miss, streak: 0 });
  });
  it("next moves on, asking, with everything cleared but the streak", () => {
    const done = flowReducer({ ...asking, streak: 2 }, { type: "answered", choice: "a", result: right });
    expect(flowReducer(done, { type: "next" })).toEqual({ index: 1, phase: "asking", ruledOut: [], picked: null, result: null, streak: 3 });
  });
  it("counts the streak over first tries only: right, right, wrong then right, right is 1, 2, 0, 1", () => {
    let s: FlowState = asking;
    const seen: number[] = [];
    const step = (events: Parameters<typeof flowReducer>[1][]) => {
      for (const e of events) s = flowReducer(s, e);
      seen.push(s.streak);
      s = flowReducer(s, { type: "next" });
    };
    step([{ type: "answered", choice: "a", result: right }]);
    step([{ type: "answered", choice: "a", result: right }]);
    step([{ type: "answered", choice: "b", result: open }, { type: "answered", choice: "a", result: right }]);
    step([{ type: "answered", choice: "a", result: right }]);
    expect(seen).toEqual([1, 2, 0, 1]);
  });
});

describe("choiceTone", () => {
  const asking = initialFlow(run);
  const second = flowReducer(asking, { type: "answered", choice: "b", result: open });
  it("is plain while asking", () => expect(choiceTone(asking, "b")).toBe("plain"));
  it("crosses the ruled-out pick on a second chance and leaves the rest plain", () => {
    expect(choiceTone(second, "b")).toBe("ruled-out");
    expect(choiceTone(second, "c")).toBe("plain");
  });
  it("marks the answer, both wrong picks, and fades the rest once resolved", () => {
    const done = flowReducer(second, { type: "answered", choice: "c", result: miss });
    expect(choiceTone(done, "a")).toBe("answer");
    expect(choiceTone(done, "c")).toBe("picked-wrong");
    expect(choiceTone(done, "b")).toBe("picked-wrong");
    expect(choiceTone(done, "d")).toBe("faded");
  });
  it("keeps the first wrong pick marked after a right retry, and after showing the answer", () => {
    const right2 = flowReducer(second, { type: "answered", choice: "a", result: right });
    expect(choiceTone(right2, "a")).toBe("answer");
    expect(choiceTone(right2, "b")).toBe("picked-wrong");
    expect(choiceTone(right2, "c")).toBe("faded");
    const shown = flowReducer(second, { type: "gave-up", result: miss });
    expect(choiceTone(shown, "b")).toBe("picked-wrong");
  });
  it("a right pick is the answer", () => {
    const done = flowReducer(asking, { type: "answered", choice: "a", result: right });
    expect(choiceTone(done, "a")).toBe("answer");
    expect(choiceTone(done, "b")).toBe("faded");
  });
});
