import { describe, expect, it } from "vitest";
import type { Question } from "@/lib/utils/drill-generators";
import { TASK_KINDS, isRegisteredKind, isTaskCorrect, kindForSkill, kindOf, taskDef, taskDefOf, toClientTask } from "./registry";

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

  it("knows which kinds are registered, and nothing else (measure joins in C5)", () => {
    expect(isRegisteredKind("choice")).toBe(true);
    expect(isRegisteredKind("measure")).toBe(false);
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
});
