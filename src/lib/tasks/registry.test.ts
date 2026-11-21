import { describe, expect, it } from "vitest";
import type { Question } from "@/lib/utils/drill-generators";
import { taskHint } from "@/lib/utils/skill-hints";
import { TRAIL, WELL_REDIRECT } from "@/test/trail-stubs";
import { RUNE, RUNE_HINT } from "@/test/rune-stubs";
import { isWalkingKind, isWalkingRun, WALKING_KINDS } from "./kinds";
import { PATTERN } from "@/test/lock-stubs";
import { __setRunePoolsForTest } from "./runes";
import { __setTrailPoolsForTest } from "./trails";
import { TASK_KINDS, isRegisteredKind, isTaskCorrect, kindForSkill, kindOf, secondChanceHint, storedFeedback, taskDef, taskDefOf, toClientTask } from "./registry";
import type { TaskKind } from "./types";

const q: Question = {
  id: "add-10:3:3",
  skillId: "add-10",
  prompt: "3 + 3 = ?",
  choices: ["5", "6", "7", "8"],
  answer: "6",
  readAloud: "Three plus three",
  explain: "Count up from three by three.",
};

describe("task kind registry", () => {
  it("hands back the one definition for a task, whatever its kind", () => {
    expect(taskDefOf(q)).toBe(TASK_KINDS.choice);
    expect(taskDefOf({ ...q, kind: "choice" })).toBe(taskDef("choice"));
  });

  it("knows which kinds are registered, and nothing else", () => {
    expect(isRegisteredKind("choice")).toBe(true);
    expect(isRegisteredKind("measure")).toBe(true);
    expect(isRegisteredKind("lock")).toBe(true);
    expect(isRegisteredKind("trail")).toBe(true);
    expect(isRegisteredKind("rune")).toBe(true);
    for (const k of ["nope", "", "toString", "constructor", "__proto__", "hasOwnProperty", 7, null, undefined, {}]) {
      expect(isRegisteredKind(k)).toBe(false);
    }
  });

  it("treats a stored question with no kind as a choice task", () => {
    expect(kindOf({ ...q })).toBe("choice");
    expect(kindOf({ ...q, kind: "choice" })).toBe("choice");
  });

  it("gives the client only the view, never the answer or the explanation", () => {
    const client = toClientTask(q);
    expect(client).toEqual({
      kind: "choice",
      id: q.id,
      skillId: q.skillId,
      readAloud: q.readAloud,
      prompt: q.prompt,
      view: { choices: q.choices },
    });
    expect(client.view).not.toHaveProperty("prompt");
    const json = JSON.stringify(client);
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain("explain");
    expect(json).not.toContain(q.explain!);
  });

  describe("choice parseResponse", () => {
    const parse = (raw: unknown, t: Question = q) => taskDef("choice").parseResponse(raw, t);
    it("accepts a listed choice, trimmed", () => {
      expect(parse("6")).toBe("6");
      expect(parse(" 6 ")).toBe("6");
    });
    it("rejects a string that is not one of the choices", () => {
      expect(parse("9")).toBeNull();
      expect(parse("7", { ...q, choices: ["5", "6"] })).toBeNull();
    });
    it("rejects non-strings and oversized strings", () => {
      expect(parse(42)).toBeNull();
      expect(parse({})).toBeNull();
      expect(parse("x".repeat(10_001))).toBeNull();
    });
  });

  it("grades a stored response exactly as trimmed equality", () => {
    expect(isTaskCorrect(q, " 6")).toBe(true);
    expect(isTaskCorrect(q, "6 ")).toBe(true);
    expect(isTaskCorrect(q, "7")).toBe(false);
  });

  it("allows a second chance only when there are three or more choices", () => {
    const def = TASK_KINDS.choice;
    expect(def.allowsSecondChance({ ...q, choices: ["5", "6"] })).toBe(false);
    expect(def.allowsSecondChance(q)).toBe(true);
  });

  it("round-trips encode/decode, compares responses, and names the answer", () => {
    const def = TASK_KINDS.choice;
    expect(def.decode(def.encode(" 6 "))).toBe("6");
    expect(def.sameResponse("6", "6")).toBe(true);
    expect(def.sameResponse("6", "7")).toBe(false);
    expect(def.answerText(q)).toBe("6");
    expect(def.feedback(q, "7")).toBe("none");
  });

  it("falls back to choice when no other mechanic applies", () => {
    expect(kindForSkill("choice", "add-10", new Set())).toBe("choice");
    expect(TASK_KINDS.choice.presents("anything")).toBe(true);
  });

  it("falls back to choice for a trail while no pool presents the skill", () => {
    __setTrailPoolsForTest([]);
    try {
      expect(kindForSkill("trail", "read-g3", new Set(["trail"]))).toBe("choice");
    } finally {
      __setTrailPoolsForTest(null);
    }
  });

  it("falls back to choice for a rune while no pool presents the skill (R-I5)", () => {
    const ALL = new Set<TaskKind>(["choice", "measure", "lock", "trail", "rune"]);
    // With no pool loaded (RI-a / S10): green before and after I5 ships the pools.
    __setRunePoolsForTest([]);
    try {
      expect(kindForSkill("rune", "spell-g23", ALL)).toBe("choice");
      expect(kindForSkill("rune", "lang-gk", ALL)).toBe("choice");
    } finally {
      __setRunePoolsForTest(null);
    }
  });
});

describe("the second-chance line (secondChanceHint, R-H7)", () => {
  it("is the entry's own hint for a rune, whatever was cast (R-I5)", () => {
    expect(secondChanceHint(RUNE, "r:0")).toBe(RUNE_HINT);
    expect(secondChanceHint(RUNE, "r:0,3,4,1")).toBe(RUNE_HINT);
  });

  it("is the chosen place's redirect for a trail", () => {
    expect(secondChanceHint(TRAIL, "landmark:well")).toBe(WELL_REDIRECT);
    expect(secondChanceHint(TRAIL, "landmark:garden")).toBe(TRAIL.redirect);
  });

  it("is the task's hint when the first pick will not decode, or is missing", () => {
    for (const pick of ["garbage", "", "__proto__", null, undefined]) expect(secondChanceHint(TRAIL, pick)).toBe(taskHint(TRAIL));
  });

  it("is the task's hint for a kind with no line of its own", () => {
    expect(secondChanceHint(q, "5")).toBe(taskHint(q));
    expect(secondChanceHint(PATTERN, "pattern:3,1")).toBe(taskHint(PATTERN));
  });
});

describe("the stored note on a response (storedFeedback)", () => {
  it("is a rune's wrong word, and nothing for a right cast or one that will not decode (R-I5)", () => {
    expect(storedFeedback(RUNE, "r:0")).toBe("wrong_word");
    expect(storedFeedback(RUNE, "r:1,3,4,0")).toBeUndefined();
    for (const s of ["", "r:0,0", "toString", null, undefined]) expect(storedFeedback(RUNE, s)).toBeUndefined();
  });
});

describe("walking kinds (R-H9, RI-a / B3)", () => {
  const trail = { kind: "trail" as const };
  const rune = { kind: "rune" as const };
  const choice = { kind: "choice" as const };

  it("are the trail and the rune, and nothing else", () => {
    expect(WALKING_KINDS).toEqual(["trail", "rune"]);
    expect(isWalkingKind("trail")).toBe(true);
    expect(isWalkingKind("rune")).toBe(true);
    for (const k of ["choice", "measure", "lock"] as const) expect(isWalkingKind(k)).toBe(false);
  });

  it("make a walking run only when there is a task and every task walks", () => {
    expect(isWalkingRun({ questions: [] })).toBe(false);
    expect(isWalkingRun({ questions: [trail] })).toBe(true);
    expect(isWalkingRun({ questions: [trail, trail] })).toBe(true);
    expect(isWalkingRun({ questions: [trail, choice] })).toBe(false);
    expect(isWalkingRun({ questions: [choice] })).toBe(false);
  });

  it("a run of runes walks; a rune beside a choice does not", () => {
    expect(isWalkingRun({ questions: [rune, rune] })).toBe(true);
    expect(isWalkingRun({ questions: [rune, choice] })).toBe(false);
  });
});
