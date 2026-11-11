import { afterEach, describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { SKILLS } from "@/lib/utils/skills";
import { BENCH } from "./bench";
import { TASK_CODECS } from "./codecs";
import { TASK_DRAWERS } from "./draw";
import { measureKind } from "./measure";
import { isTaskCorrect, kindForSkill, taskDefOf, toClientTask } from "./registry";
import type { MeasureTask, TaskKind } from "./types";

const assemble: MeasureTask = {
  kind: "measure", id: "m:asm", skillId: "frac-addsub", prompt: "Build a beam three quarters of a foot long.",
  mode: "assemble", unit: "ft",
  pieces: [
    { label: "1/2 ft", value: "1/2" },
    { label: "1/4 ft", value: "1/4" },
    { label: "1/4 ft", value: "0.25" },
    { label: "1/8 ft", value: "1/8" },
  ],
  target: { label: "3/4 ft", value: "3/4" },
  solution: [0, 1],
  bridge: "1/2 + 1/4 = 3/4",
  explain: "A half and a quarter make three quarters.",
};

const cut: MeasureTask = {
  kind: "measure", id: "m:cut", skillId: "frac-addsub", prompt: "Cut a board three quarters of a foot long.",
  mode: "cut", unit: "ft", answer: "3/4", step: "1/4", maxLength: "2",
  bridge: "1/2 + 1/4 = 3/4",
};

const parse = (raw: unknown, t: MeasureTask) => measureKind.parseResponse(raw, t);

describe("measure: what the browser is shown", () => {
  it("an assemble view carries the mode, unit and labels only", () => {
    expect(measureKind.toView(assemble)).toEqual({ mode: "assemble", unit: "ft", pieces: ["1/2 ft", "1/4 ft", "1/4 ft", "1/8 ft"], target: "3/4 ft" });
  });

  it("a cut view carries its step and ruler length, never the answer", () => {
    expect(measureKind.toView(cut)).toEqual({ mode: "cut", unit: "ft", step: "1/4", maxLength: "2" });
  });

  it.each([assemble, cut])("the client task holds neither answer, solution nor bridge (%#)", (t) => {
    const json = JSON.stringify(toClientTask(t));
    for (const leak of ['"answer"', '"solution"', '"bridge"', '"explain"', '"tolerance"', t.bridge, '"value"']) expect(json).not.toContain(leak);
    expect(toClientTask(t)).toMatchObject({ kind: "measure", id: t.id, skillId: t.skillId, prompt: t.prompt });
  });
});

describe("measure: malformed responses are refused (Review Focus 2)", () => {
  it("assemble refuses out-of-range, duplicate, empty and non-integer picks, and anything not a list", () => {
    for (const raw of [[4], [-1], [0, 0], [], [0.5], ["0"], [0, 1, 2, 3, 4], "0,1", "a:", "a:0,0", "a:9", "a:-1", "a:0,x", "c:3/4", "a:" + "0,".repeat(200) + "1", 7, null, undefined, {}]) {
      expect(parse(raw, assemble)).toBeNull();
    }
  });

  it("cut refuses a 60-character length, a zero denominator, the wrong mode and non-strings", () => {
    for (const raw of ["x".repeat(60), "1".repeat(21), "c:" + "1".repeat(21), "1/0", "c:1/0", "", "  ", "abc", "a:0", "c:", [0], 0.75, null, {}]) {
      expect(parse(raw, cut)).toBeNull();
    }
  });

  it("assemble takes a list or its encoded string, sorted", () => {
    expect(parse([1, 0], assemble)).toEqual([0, 1]);
    expect(parse("a:2,0", assemble)).toEqual([0, 2]);
  });

  it("cut takes the typed length (trimmed) or its encoded string", () => {
    expect(parse(" 0.75 ", cut)).toBe("0.75");
    expect(parse("6/8", cut)).toBe("6/8");
    expect(parse("c:3/4", cut)).toBe("3/4");
  });
});

describe("measure: equivalent answers are right (Review Focus 3)", () => {
  it.each(["3/4", "0.75", "6/8", ".75", "c:3/4"])("a cut of %s is right", (raw) => {
    const r = parse(raw, cut)!;
    expect(measureKind.isCorrect(cut, r)).toBe(true);
    expect(isTaskCorrect(cut, measureKind.encode(r))).toBe(true);
  });

  it("a wrong cut is wrong; a tolerance widens the mark", () => {
    expect(measureKind.isCorrect(cut, "0.7")).toBe(false);
    const loose = { ...cut, tolerance: "1/8" };
    expect(measureKind.isCorrect(loose, "0.7")).toBe(true);
    expect(measureKind.isCorrect(loose, "7/8")).toBe(true);
    expect(measureKind.isCorrect(loose, "0.5")).toBe(false);
  });

  it("any subset of pieces that hits the mark is right, not only the stored solution", () => {
    expect(measureKind.isCorrect(assemble, [0, 1])).toBe(true);
    expect(measureKind.isCorrect(assemble, [0, 2])).toBe(true);
    expect(isTaskCorrect(assemble, "a:0,2")).toBe(true);
    expect(measureKind.isCorrect(assemble, [1, 2])).toBe(false);
    expect(measureKind.isCorrect(assemble, [0, 1, 2])).toBe(false);
  });

  it("a stored response of the other mode, or a task stored without its pieces, is simply wrong", () => {
    expect(isTaskCorrect(assemble, "c:3/4")).toBe(false);
    expect(isTaskCorrect(cut, "a:0,1")).toBe(false);
    expect(isTaskCorrect(assemble, "")).toBe(false);
    expect(isTaskCorrect({ ...assemble, pieces: undefined }, "a:0,1")).toBe(false);
    expect(isTaskCorrect({ ...cut, answer: undefined }, "c:3/4")).toBe(false);
  });
});

describe("measure: feedback", () => {
  it("says too long or too short, and nothing when right", () => {
    expect(measureKind.feedback(cut, "1")).toBe("too_long");
    expect(measureKind.feedback(cut, "1/2")).toBe("too_short");
    expect(measureKind.feedback(cut, "0.75")).toBe("none");
    expect(measureKind.feedback(assemble, [0, 1, 2])).toBe("too_long");
    expect(measureKind.feedback(assemble, [1, 3])).toBe("too_short");
    expect(measureKind.feedback(assemble, [0, 2])).toBe("none");
  });

  it("says nothing when the response cannot be measured", () => {
    expect(measureKind.feedback(cut, [0])).toBe("none");
    expect(measureKind.feedback({ ...cut, answer: undefined }, "1")).toBe("none");
  });
});

describe("measure: the codec", () => {
  it("never encodes to the give-up marker", () => {
    for (const r of [[], [0], [3, 1, 1], "", " ", "0.75", "nonsense", "a:", "c:"] as (number[] | string)[]) {
      expect(TASK_CODECS.measure.encode(r)).not.toBe("");
    }
  });

  it("writes picks sorted and unique, and a length in lowest terms", () => {
    const { encode } = TASK_CODECS.measure;
    expect(encode([3, 0, 2, 0])).toBe("a:0,2,3");
    expect(encode("0.75")).toBe("c:3/4");
    expect(encode("6/8")).toBe("c:3/4");
    expect(encode("2")).toBe("c:2");
    expect(encode("a:1,0")).toBe("a:0,1");
    expect(encode("c:0.75")).toBe("c:3/4");
  });

  it("reads back what it wrote, and nothing else", () => {
    const { decode, encode } = TASK_CODECS.measure;
    expect(decode(encode([2, 0]))).toEqual([0, 2]);
    expect(decode(encode("0.75"))).toBe("3/4");
    for (const s of ["", "zz", "a:x", "a:0,", "c:1/0", "c:", "3/4"]) expect(decode(s)).toBeNull();
  });

  it("compares responses by what they measure", () => {
    const { sameResponse } = TASK_CODECS.measure;
    expect(sameResponse("a:0,1", "a:1,0")).toBe(true);
    expect(sameResponse([0, 1], [1, 0])).toBe(true);
    expect(sameResponse("0.75", "3/4")).toBe(true);
    expect(sameResponse("a:0,1", "a:0,2")).toBe(false);
    expect(sameResponse("1/2", "3/4")).toBe(false);
  });

  it("the measure definition delegates to the codec (no second copy)", () => {
    expect(measureKind.encode).toBe(TASK_CODECS.measure.encode);
    expect(measureKind.decode).toBe(TASK_CODECS.measure.decode);
    expect(measureKind.sameResponse).toBe(TASK_CODECS.measure.sameResponse);
  });
});

describe("measure: the rest of the definition", () => {
  it("allows a second chance, names its answer by the bridge, and holds the bridge for a right answer", () => {
    expect(measureKind.allowsSecondChance(cut)).toBe(true);
    expect(measureKind.answerText(assemble)).toBe(assemble.bridge);
    expect(measureKind.bridge?.(cut)).toBe(cut.bridge);
    expect(taskDefOf(cut)).toBe(measureKind);
  });
});

describe("measure: what it presents, and how it draws", () => {
  const bench = BENCH as Record<string, unknown>;
  const skill = SKILLS.find((s) => s.id === "frac-addsub")!;
  afterEach(() => {
    delete bench["frac-addsub"];
  });

  it("presents no skill while the bench is empty, and never an inherited key", () => {
    expect(Object.keys(BENCH)).toEqual([]);
    for (const id of ["frac-addsub", "add-10", "toString", "constructor", "__proto__"]) expect(measureKind.presents(id)).toBe(false);
    expect(kindForSkill("measure", "frac-addsub", new Set<TaskKind>(["measure"]))).toBe("choice");
    expect(TASK_DRAWERS.measure(skill, 2, seededRng(1))).toBeNull();
  });

  it("presents a skill on the bench, and draws it from the bench's generator", () => {
    const calls: unknown[][] = [];
    bench["frac-addsub"] = (...args: unknown[]) => {
      calls.push(args);
      return cut;
    };
    expect(measureKind.presents("frac-addsub")).toBe(true);
    expect(kindForSkill("measure", "frac-addsub", new Set<TaskKind>(["measure"]))).toBe("measure");
    expect(kindForSkill("measure", "frac-addsub", new Set<TaskKind>())).toBe("choice");
    const rng = seededRng(1);
    expect(TASK_DRAWERS.measure(skill, 3, rng)).toBe(cut);
    expect(calls).toEqual([[3, rng, "frac-addsub"]]);
  });
});
