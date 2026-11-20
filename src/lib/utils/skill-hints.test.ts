import { describe, expect, it } from "vitest";
import { GRADES } from "./grade-levels";
import { GENERIC_HINT, hintFor, SKILL_HINTS, SORT_HINTS, taskHint } from "./skill-hints";
import { SKILLS, skillsFor } from "./skills";
import type { ClientTask, Task } from "@/lib/tasks/types";
import { BENCH } from "@/lib/tasks/bench";
import { LOCKS } from "@/lib/tasks/locks";
import { SORT_POOL_FILES } from "@/lib/tasks/locks/sort-pool-files";
import { PATTERN } from "@/test/lock-stubs";

// Whole words only, so "already" or "leveled-off" style substrings do not trip the guard.
const BANNED = ["behind", "ahead", "level", "grade", "rung", "review", "failed"];
const bannedRe = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");

const servable = SKILLS.filter((s) => GRADES.some((g) => skillsFor(s.area, g).some((x) => x.id === s.id)));

describe("skill hints", () => {
  it("covers every servable skill", () => {
    expect(servable.filter((s) => !SKILL_HINTS[s.id]).map((s) => s.id)).toEqual([]);
  });

  it.each(servable.map((s) => [s.id] as const))("%s has a short, safe, specific hint", (id) => {
    const hint = SKILL_HINTS[id];
    expect(hint).toBeTruthy();
    expect(hint).not.toBe(GENERIC_HINT);
    expect(hint.length).toBeLessThanOrEqual(160);
    expect(hint).not.toMatch(bannedRe);
    expect(hint).not.toMatch(/\d/); // a digit would be a fact from some question
    expect(hint.split(/[.!?]+(?:\s+|$)/).filter(Boolean).length).toBeLessThanOrEqual(2); // one or two sentences
  });

  it("has no hint for an id that is not a skill", () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    expect(Object.keys(SKILL_HINTS).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("falls back to the generic hint, which obeys the same rules", () => {
    expect(hintFor("no-such-skill")).toBe(GENERIC_HINT);
    expect(hintFor("mul-facts")).toBe(SKILL_HINTS["mul-facts"]);
    expect(GENERIC_HINT.length).toBeLessThanOrEqual(160);
    expect(GENERIC_HINT).not.toMatch(bannedRe);
  });

  it("the banned-word guard matches whole words only", () => {
    expect(bannedRe.test("Look ahead.")).toBe(true);
    expect(bannedRe.test("Next Grade!")).toBe(true);
    expect(bannedRe.test("Bring it to the stand already")).toBe(false);
  });
});

/** A task of each face, for a skill: the hint follows what the child is looking at. */
const choiceTask = (skillId: string): Task => ({ id: "q", skillId, prompt: "p", choices: ["a", "b"], answer: "a" });
const sortTask = (skillId: string): Task => ({
  kind: "lock", id: "s", skillId, prompt: "Sort these: A or B?", puzzle: "sort", categories: ["A", "B"],
  items: [{ id: "i1", label: "x" }, { id: "i2", label: "y" }], fits: [[0], [1]], solution: { puzzle: "sort", cells: [1, 2] },
});
const SORT_SKILLS = ["science-k1", "science-g23", "science-g45", "science-g68", "science-g912", "vocab-g45", "vocab-g68", "vocab-g912"];
const SAY_EACH_WORD = "Say each word, then think about which group it belongs in.";

describe("a hint fits the task's face (taskHint)", () => {
  it("a word sort never talks about choices, in every band, and K–3 science hears the plain line", () => {
    for (const id of SORT_SKILLS) {
      const hint = taskHint(sortTask(id));
      expect(hint, id).not.toMatch(/choice/i);
      expect(hint, id).toBe(SORT_HINTS[id]);
    }
    expect(taskHint(sortTask("science-k1"))).toBe(SAY_EACH_WORD);
    expect(taskHint(sortTask("science-g23"))).toBe(SAY_EACH_WORD);
  });

  it("a vocabulary sort is worded about meaning", () => {
    for (const id of ["vocab-g45", "vocab-g68", "vocab-g912"]) expect(SORT_HINTS[id], id).toMatch(/mean/i);
  });

  it("every sort pool's skill has a sort hint, and only skills a sort pool credits do", () => {
    const pooled = SORT_POOL_FILES.map((p) => (p as { skillId: string }).skillId);
    expect(Object.keys(SORT_HINTS).sort()).toEqual([...new Set(pooled)].sort());
  });

  it.each(Object.entries(SORT_HINTS))("the %s sort hint is short and safe", (_, hint) => {
    expect(hint.length).toBeLessThanOrEqual(160);
    expect(hint).not.toMatch(bannedRe);
    expect(hint).not.toMatch(/\d/);
    expect(hint.split(/[.!?]+(?:\s+|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("a choice task keeps its skill's hint exactly, and hintFor still reads as choice", () => {
    for (const id of [...SORT_SKILLS, "mul-facts"]) expect(taskHint(choiceTask(id))).toBe(SKILL_HINTS[id]);
    expect(taskHint(choiceTask("no-such-skill"))).toBe(GENERIC_HINT);
    expect(hintFor("science-g23")).toBe(SKILL_HINTS["science-g23"]);
  });

  it("no bench task, logic lock or unknown skill on a board is told about choices", () => {
    const boards: Task[] = [
      ...Object.keys(BENCH).map((skillId): Task => ({ kind: "measure", id: "m", skillId, prompt: "p", mode: "cut", unit: "", bridge: "" })),
      ...Object.keys(LOCKS).map((skillId): Task => ({ ...PATTERN, skillId })),
      { ...PATTERN, skillId: "no-such-skill" },
      sortTask("no-such-skill"),
    ];
    for (const t of boards) expect(taskHint(t), t.skillId).not.toMatch(/choice/i);
    expect(taskHint({ ...PATTERN, skillId: "logic-k1" })).toBe(SKILL_HINTS["logic-k1"]);
  });

  it("reads a lock's puzzle from the browser's view too", () => {
    const sort = { kind: "lock", id: "s", skillId: "science-g23", prompt: "p", view: { puzzle: "sort", categories: ["A", "B"], items: [] } } as ClientTask;
    expect(taskHint(sort)).toBe(SORT_HINTS["science-g23"]);
    expect(taskHint({ kind: "choice", id: "q", skillId: "science-g23", prompt: "p", view: { choices: [] } })).toBe(SKILL_HINTS["science-g23"]);
  });
});
