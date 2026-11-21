import { describe, expect, it } from "vitest";
import { RUNE_EFFECT_IDS, RUNE_OBJECTS, VILLAGE_RUNE_OBJECTS, runeObjectById, type RuneEffect, type RuneObject } from "@/lib/realm/rune-objects";
import { effectKey } from "@/lib/content/rune-pools";
import { runePoolFor } from "@/lib/tasks/runes";
import type { ChoiceTask, RuneTask, Task, TaskKind } from "@/lib/tasks/types";
import { runeStub } from "@/test/rune-stubs";
import { seededRng } from "./drill-generators";
import { GRADES, type Grade } from "./grade-levels";
import { findSkill, type Skill } from "./skills";
import { bindRuneObjects, runeObjectRun, runePassOver, runeSkill } from "./rune-run";

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

describe("bindRuneObjects: each rune of a side quest at a village object of its effect (R-I22)", () => {
  const ALL = new Set(VILLAGE_RUNE_OBJECTS.map((o) => o.id));
  const NONE: ReadonlySet<string> = new Set();
  const of = (effect: RuneEffect) => VILLAGE_RUNE_OBJECTS.filter((o) => o.effect === effect);
  /** A rune task of `effect`, its object unbound (as the drawer hands it over). */
  const word = (effect: RuneEffect, n: number): RuneTask => runeStub({ id: `lang-gk:rune:0000000${n}`, effect, object: null, entry: `rune-k1/fx-${effect}-0${n}` });
  const choice: ChoiceTask = { id: "lang-gk-item-1", skillId: "lang-gk", prompt: "Which?", choices: ["a", "b"], answer: "a" };
  const objectOf = (t: Task) => (t as RuneTask).object;

  it("gives each rune task a distinct village object of its effect, by its broken label, and changes nothing else", () => {
    const tasks = [word("mend", 1), word("light", 2), word("grow", 3)];
    for (let seed = 1; seed <= 30; seed++) {
      const bound = bindRuneObjects(tasks, VILLAGE_RUNE_OBJECTS, ALL, seededRng(seed)) as RuneTask[];
      expect(bound).toHaveLength(3);
      bound.forEach((t, i) => {
        const object = runeObjectById(t.object!.id)!;
        expect(object.place, `seed ${seed}`).toBeNull();
        expect(object.effect).toBe(tasks[i].effect);
        expect(t.object).toEqual({ id: object.id, label: object.label });
        expect({ ...t, object: null }).toEqual(tasks[i]);
      });
      expect(new Set(bound.map((t) => t.object!.id)).size).toBe(3);
    }
  });

  it("takes the broken object of an effect first, then a fixed one, by its broken label too: the walk draws it broken until cast (owner, 2026-11-21)", () => {
    const [wagon, barrow] = of("mend");
    const broken = new Set([...ALL].filter((id) => id !== wagon.id));
    for (let seed = 1; seed <= 20; seed++) {
      expect(objectOf(bindRuneObjects([word("mend", 1)], VILLAGE_RUNE_OBJECTS, broken, seededRng(seed))[0])!.id, `seed ${seed}`).toBe(barrow.id);
    }
    const two = bindRuneObjects([word("mend", 1), word("mend", 2)], VILLAGE_RUNE_OBJECTS, broken, seededRng(4)).map(objectOf);
    expect(two).toEqual([{ id: barrow.id, label: barrow.label }, { id: wagon.id, label: wagon.label }]);
  });

  it("names a fixed object when none of its effect is broken, so a right cast there renews it", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const [t] = bindRuneObjects([word("mend", 1)], VILLAGE_RUNE_OBJECTS, NONE, seededRng(seed)) as RuneTask[];
      const object = runeObjectById(t.object!.id)!;
      expect(object.effect).toBe("mend");
      expect(t.object!.label).toBe(object.label);
      seen.add(object.id);
    }
    // Either may be named: the run's rng chooses.
    expect([...seen].sort()).toEqual(of("mend").map((o) => o.id).sort());
  });

  it("binds two of three mend tasks and drops the third: the village has two mend objects", () => {
    const bound = bindRuneObjects([word("mend", 1), word("light", 2), word("mend", 3), word("mend", 4)], VILLAGE_RUNE_OBJECTS, ALL, seededRng(7)) as RuneTask[];
    expect(bound.map((t) => t.id)).toEqual(["lang-gk:rune:00000001", "lang-gk:rune:00000002", "lang-gk:rune:00000003"]);
    expect(new Set(bound.map((t) => t.object!.id)).size).toBe(3);
  });

  it("passes a task of another kind through untouched, in its place, drawing nothing for it", () => {
    const bound = bindRuneObjects([choice, word("water", 1), choice], VILLAGE_RUNE_OBJECTS, ALL, seededRng(2));
    expect(bound[0]).toBe(choice);
    expect(bound[2]).toBe(choice);
    expect(bound[1]).toEqual(bindRuneObjects([word("water", 1)], VILLAGE_RUNE_OBJECTS, ALL, seededRng(2))[0]);
    expect(bindRuneObjects([choice], VILLAGE_RUNE_OBJECTS, ALL, seededRng(2))).toEqual([choice]);
  });

  it("rebinds a task that came bound (a miss brought back from another run)", () => {
    const old = runeStub({ effect: "light", object: { id: "rune:west-wagon", label: "the broken wagon" } });
    const [t] = bindRuneObjects([old], VILLAGE_RUNE_OBJECTS, ALL, seededRng(1)) as RuneTask[];
    expect(runeObjectById(t.object!.id)!.effect).toBe("light");
  });

  it("is the same binding from the same seed, and moves with the seed", () => {
    const tasks = [word("mend", 1), word("open", 2), word("water", 3)];
    const ids = (seed: number) => bindRuneObjects(tasks, VILLAGE_RUNE_OBJECTS, ALL, seededRng(seed)).map((t) => objectOf(t)!.id).join();
    expect(ids(11)).toBe(ids(11));
    expect(new Set(Array.from({ length: 12 }, (_, s) => ids(s))).size).toBeGreaterThan(1);
  });

  it("names only the objects it is given", () => {
    const only = of("grow");
    const [t] = bindRuneObjects([word("grow", 1)], only, ALL, seededRng(3)) as RuneTask[];
    expect(only.map((o) => o.id)).toContain(t.object!.id);
    expect(bindRuneObjects([word("mend", 1)], only, ALL, seededRng(3))).toEqual([]);
  });
});

describe("runePassOver: the effects a side quest's draw takes last (R-I22)", () => {
  const ids = (effects: readonly RuneEffect[]) => new Set(VILLAGE_RUNE_OBJECTS.filter((o) => effects.includes(o.effect)).map((o) => o.id));

  it("lists exactly the effects with nothing broken, as effect keys, in the effects' order", () => {
    expect(runePassOver(VILLAGE_RUNE_OBJECTS, ids(RUNE_EFFECT_IDS))).toEqual([]);
    expect(runePassOver(VILLAGE_RUNE_OBJECTS, new Set())).toEqual(RUNE_EFFECT_IDS.map(effectKey));
    expect(runePassOver(VILLAGE_RUNE_OBJECTS, ids(["mend", "water", "grow"]))).toEqual([effectKey("light"), effectKey("open")]);
  });

  it("counts an effect with one of its two objects broken as broken", () => {
    const [wagon] = VILLAGE_RUNE_OBJECTS.filter((o) => o.effect === "mend");
    expect(runePassOver(VILLAGE_RUNE_OBJECTS, new Set([wagon.id]))).toEqual((["light", "water", "open", "grow"] as const).map(effectKey));
  });

  it("reads only the objects it is given: a broken object at a named place keeps no effect off it", () => {
    const places = RUNE_OBJECTS.filter((o) => o.place !== null).map((o) => o.id);
    expect(runePassOver(VILLAGE_RUNE_OBJECTS, new Set(places))).toEqual(RUNE_EFFECT_IDS.map(effectKey));
  });
});
