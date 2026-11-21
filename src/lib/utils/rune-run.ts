/**
 * A rune run's skill and words (slice 6, R-I1). Server-only: it draws from the rune pools, which hold
 * every word. Pure otherwise: the seed and the words met lately come in, so one seed is one run.
 *
 * A rune object is fixed any time by a `world` run of ONE word (`runeObjectRun`), drawn for the
 * object's effect at the hero's language skill (`runeSkill`); `startRuneObjectRun`
 * (`actions/rune-objects.ts`) puts them on the shared start skeleton, `startLockRun`. A language side
 * quest's words are bound to village objects here too (`bindRuneObjects`, R-I22), after the draw has
 * passed over the effects with nothing broken to bind to (`runePassOver`).
 */
import { kindForSkill, kindOf, TASK_KINDS } from "@/lib/tasks/registry";
import { drawRuneFor } from "@/lib/tasks/runes/draw";
import { effectKey } from "@/lib/content/rune-pools";
import type { RuneTask, Task, TaskKind } from "@/lib/tasks/types";
import { RUNE_EFFECT_IDS, runeObjectById, type RuneObject } from "@/lib/realm/rune-objects";
import type { QuestionOutcome, RunKind } from "./deed-scoring";
import { chooseSkills, type BuiltRun, type ProfileLike } from "./deed-engine";
import { seededRng, type Rng } from "./drill-generators";
import { focusWindow } from "./focus";
import type { Grade } from "./grade-levels";
import type { Skill } from "./skills";

const EMPTY: BuiltRun = { skillIds: [], questions: [] };

const presentsRune = (s: Skill): boolean => TASK_KINDS.rune.presents(s.id);

/**
 * The language skill a rune is drawn at: the grown-up's first focus pick in the hero's window
 * (`focusWindow`, a grade either side) that a rune pool presents, else the nearest grade's own that
 * one does (so grade 1 is `spell-g1`, never `lang-g1`, R-I7). Null only if no pool presents any.
 */
export function runeSkill(grade: Grade, focusSkillIds: readonly string[]): Skill | null {
  const window = focusWindow({ language: grade });
  const focus = focusSkillIds.map((id) => window.find((s) => s.id === id)).find((s): s is Skill => s !== undefined && presentsRune(s));
  return focus ?? chooseSkills({ area: "language" }, grade, presentsRune)[0] ?? null;
}

/**
 * One rune of the object's effect, at `level`, bound to the object (its id and its broken label: it
 * is part of the question, never the answer, R-I2). Entries in `avoid` (`<poolId>/<entryId>`, met
 * lately) are taken last. Empty with the grown-up's runes off (`enabledKinds`), or for a skill no
 * rune pool presents: never a choice question.
 */
export function runeObjectRun(input: {
  skill: Skill;
  level: number;
  object: RuneObject;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`). */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
  avoid: ReadonlySet<string>;
}): BuiltRun {
  const { skill, object } = input;
  if (kindForSkill("rune", skill.id, input.enabledKinds) !== "rune") return EMPTY;
  const task = drawRuneFor(skill, input.level, object.effect, seededRng(input.seed), input.avoid);
  if (!task) return EMPTY;
  return { skillIds: [skill.id], questions: [{ ...task, object: { id: object.id, label: object.label } }] };
}

/**
 * The rune objects a finish fixes, with whether a right cast renews one already fixed, or null for none:
 *  - a rune world run's own object, fixed only while it is broken on the server's day (R-I1, `renew` false);
 *  - a side quest's or Crown Challenge's runes, each at the object it was bound to at the start, renewed
 *    even when fixed (R-I22, `renew` true), but only when the hero finishes: a grown-up finishing a
 *    page run mends nothing (RI-a / S8).
 * A task whose object has left the catalog fixes nothing (Review Focus 4), so neither does a run of only
 * those. Pure: `completeDeedRun` hands it the run, its tasks, their outcomes and who is finishing.
 */
export function runeFixesOf(
  run: { kind: RunKind; sourceRef: string | null }, questions: readonly Task[], outcomes: readonly QuestionOutcome[], byHero: boolean,
): { fixes: { objectId: string; outcome: QuestionOutcome }[]; renew: boolean } | null {
  if (run.kind === "world") {
    const object = runeObjectById(run.sourceRef);
    return object ? { fixes: [{ objectId: object.id, outcome: outcomes[0] }], renew: false } : null;
  }
  if ((run.kind !== "deed" && run.kind !== "challenge") || !byHero) return null;
  const fixes = questions.flatMap((q, i) => {
    const objectId = kindOf(q) === "rune" ? (q as RuneTask).object?.id : undefined;
    return runeObjectById(objectId) ? [{ objectId: objectId!, outcome: outcomes[i] }] : [];
  });
  return fixes.length > 0 ? { fixes, renew: true } : null;
}

/**
 * The effect keys (`effect:<e>`) of every effect with no broken object among `objects` (R-I22): handed
 * to the drawer in `recentRunes`, so a side quest's words go to effects that have something to mend
 * first, and an effect with nothing broken is drawn only once the others are used. In the effects' order.
 */
export function runePassOver(objects: readonly RuneObject[], broken: ReadonlySet<string>): string[] {
  return RUNE_EFFECT_IDS.filter((e) => !objects.some((o) => o.effect === e && broken.has(o.id))).map(effectKey);
}

/**
 * Binds each rune task, in order, to an unused object of its effect among `objects` (the village's, for
 * a side quest, R-I22): a broken one when any is left, chosen with the run's seeded `rng`, else a fixed
 * one, which a right cast renews. Either is named by its broken `label` ("the broken wagon"): the walk
 * draws every object it names broken until its word is cast (owner, 2026-11-21). A rune task whose effect has no
 * unused object left is dropped (three of one effect, two objects). A task of another kind passes
 * through untouched and draws nothing, so one seed is one binding. A task already bound (a miss
 * brought back) is bound afresh.
 */
export function bindRuneObjects(tasks: readonly Task[], objects: readonly RuneObject[], broken: ReadonlySet<string>, rng: Rng): Task[] {
  const used = new Set<string>();
  const out: Task[] = [];
  for (const task of tasks) {
    if (kindOf(task) !== "rune") {
      out.push(task);
      continue;
    }
    const rune = task as RuneTask;
    const free = objects.filter((o) => o.effect === rune.effect && !used.has(o.id));
    const fresh = free.filter((o) => broken.has(o.id));
    const from = fresh.length > 0 ? fresh : free;
    if (from.length === 0) continue;
    const object = from[Math.floor(rng() * from.length)];
    used.add(object.id);
    out.push({ ...rune, object: { id: object.id, label: object.label } });
  }
  return out;
}
