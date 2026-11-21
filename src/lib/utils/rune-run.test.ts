import { describe, expect, it } from "vitest";
import { RUNE_OBJECTS, runeObjectById, type RuneObject } from "@/lib/realm/rune-objects";
import { runePoolFor } from "@/lib/tasks/runes";
import type { RuneTask, TaskKind } from "@/lib/tasks/types";
import { GRADES, type Grade } from "./grade-levels";
import { findSkill, type Skill } from "./skills";
import { runeObjectRun, runeSkill } from "./rune-run";

const ALL_ON: ReadonlySet<TaskKind> = new Set<TaskKind>(["measure", "lock", "trail", "rune"]);
const RUNES_OFF: ReadonlySet<TaskKind> = new Set<TaskKind>(["measure", "lock", "trail"]);
const PROFILE = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };
const skill = (id: string): Skill => findSkill(id)!;
const wagon = runeObjectById("rune:west-wagon")!;

describe("runeSkill: the language skill a rune world run is drawn at (R-I1, R-I7)", () => {
  const byGrade: Record<Grade, string> = {
    K: "lang-gk", 1: "spell-g1", 2: "spell-g23", 3: "lang-g3", 4: "spell-g45", 5: "vocab-g45",
    6: "vocab-g68", 7: "vocab-g68", 8: "vocab-g68", 9: "vocab-g912", 10: "vocab-g912", 11: "vocab-g912", 12: "vocab-g912",
  };

  it("gives every grade, K to 12, a skill a rune pool presents", () => {
    for (const g of GRADES) {
      const s = runeSkill(g, []);
      expect(s?.id, `grade ${g}`).toBe(byGrade[g]);
      expect(runePoolFor(s!.id), `grade ${g}`).toBeDefined();
    }
  });

  it("takes a grown-up's focus pick a rune pool presents, inside the hero's window", () => {
    expect(runeSkill("4", ["vocab-g45"])?.id).toBe("vocab-g45");
    // The first pick that a rune presents wins, in the grown-up's order.
    expect(runeSkill("4", ["lang-g3", "vocab-g45"])?.id).toBe("lang-g3");
  });

  it("passes over a focus pick no rune pool presents, and one outside the window", () => {
    expect(runeSkill("1", ["lang-g1"])?.id).toBe("spell-g1");
    expect(runeSkill("4", ["vocab-g912"])?.id).toBe("spell-g45");
    expect(runeSkill("4", ["math-nope", "add-10"])?.id).toBe("spell-g45");
  });
});

describe("runeObjectRun: one word for the object's effect (R-I1)", () => {
  const draw = (object: RuneObject, over: Partial<Parameters<typeof runeObjectRun>[0]> = {}) =>
    runeObjectRun({ skill: skill("vocab-g68"), level: 2, object, seed: 7, enabledKinds: ALL_ON, profile: PROFILE, avoid: new Set(), ...over });

  it("is one rune task of the object's effect, bound to the object by id and label", () => {
    for (const object of RUNE_OBJECTS) {
      const run = draw(object);
      expect(run.skillIds).toEqual(["vocab-g68"]);
      expect(run.questions).toHaveLength(1);
      const [task] = run.questions as RuneTask[];
      expect(task.kind).toBe("rune");
      expect(task.skillId).toBe("vocab-g68");
      expect(task.effect).toBe(object.effect);
      expect(task.object).toEqual({ id: object.id, label: object.label });
    }
  });

  it("is the same task from the same seed, and a different one from another", () => {
    expect(draw(wagon)).toEqual(draw(wagon));
    const ids = new Set(Array.from({ length: 12 }, (_, seed) => draw(wagon, { seed }).questions[0].id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it("passes over the entries met lately while it has others", () => {
    const first = draw(wagon).questions[0] as RuneTask;
    const next = draw(wagon, { avoid: new Set([first.entry]) }).questions[0] as RuneTask;
    expect(next.entry).not.toBe(first.entry);
  });

  it("is empty with runes off, or for a skill no rune pool presents", () => {
    expect(draw(wagon, { enabledKinds: RUNES_OFF })).toEqual({ skillIds: [], questions: [] });
    expect(draw(wagon, { skill: skill("lang-g1") })).toEqual({ skillIds: [], questions: [] });
  });
});
