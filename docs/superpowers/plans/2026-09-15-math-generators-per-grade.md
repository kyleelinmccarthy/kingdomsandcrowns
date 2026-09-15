# Math Generators Per Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every grade K–12 its own math practice, generated and independently verified, replacing a five-band ladder where one band spanned three grades.

**Architecture:** The skill table's axis changes from a band to a list of grades, which is a provably content-neutral refactor. Then a verifier harness is built that re-derives every generated question's answer **from its prompt text**, so a generator cannot carry a wrong answer key even in principle. Only then are generators added, grade by grade, each one dead on arrival unless its verifier agrees with it.

**Tech Stack:** TypeScript, Vitest, a seeded mulberry32 rng. No new dependencies. No database migration.

**Spec:** `docs/superpowers/specs/2026-09-14-grade-appropriate-content-design.md` (6.2, 6.3, 6.5, 6.6)
**Skill map:** `docs/content/math-skill-map.md` — the authority for which skill belongs to which grade. Where this plan and the map disagree, **the map wins**; report the disagreement rather than silently picking one.

## Global Constraints

- **Never rename or reuse an existing skill id.** Mastery is stored per skill id in `skill_mastery`; re-keying silently resets every child's practice history. Eleven math skill ids exist today and all eleven keep their ids (6.6).
- **Never delete a skill row or a mastery row.** A skill that stops being offered is simply not listed at any grade. `fractions-compare` is the only such skill.
- **A child is never handed harder work than their grade.** The fallback in `chooseSkills` walks `nearestGrades`, which is easier-first by design. Do not reorder it.
- **Every generator is pure and deterministic**: `(level: number, rng: Rng, skillId: string) => Question`, with all randomness drawn from `rng`. Never call `Math.random()` or `Date.now()` in a generator.
- **A question's `id` encodes its parameters** so a missed question can be re-asked verbatim. Same id ⟹ same prompt and same answer.
- **Every question has exactly 4 distinct choices, one of which is the answer**, and the answer is never among the distractors.
- **Every generator must have a verifier** (Task 3). A generator without one fails the suite. This is the mechanism behind spec 6.3's promise.
- **`readAloud` must be speakable**: no bare `-`, `×`, `÷`, `²`, `√`, `π`, `/` or `^` in read-aloud text. A child using read-aloud support hears it literally.
- Run each git command on its own line; never chain with `&&`. **Never use `git stash`.**
- Every commit message ends with a second `-m` carrying exactly:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/utils/skills.ts` | **Modify.** `Skill.band: ContentBand` becomes `Skill.grades: Grade[]`; the math rows are re-listed per the map. |
| `src/lib/utils/drill-generators.ts` | **Modify.** Stays the home of shared helpers (`seededRng`, `randInt`, `shuffle`, `numericDistractors`, `makeQuestion`) and the `GENERATORS` registry. |
| `src/lib/utils/generators/` | **Create.** One module per grade band of generators, so no single file grows past a few hundred lines: `elementary.ts` (K–2), `intermediate.ts` (3–5), `middle.ts` (6–8), `high.ts` (9–12). |
| `src/lib/utils/drill-verify.ts` | **Create.** The independent answer oracle: one verifier per generator, each re-deriving the answer from the question's prompt. |
| `src/lib/utils/drill-verify.test.ts` | **Create.** The universal property test: every generator × every level × many seeds, checked against its verifier and the structural rules. |
| `src/app/dev/content/page.tsx` | **Create.** Dev-only review page (6.5.3). |

`drill-generators.ts` is 214 lines today and would pass 1,500 if every new generator landed in it. Generators are grouped by the grades they serve because that is how they are read and reviewed — a grade's worth of math is the unit a parent checks.

---

## Task 1: Move the skill table from bands to grades

A pure refactor. **No child's content may change.** This is what makes every later task safe: once the axis is grades, adding a grade's math is additive.

**Files:**
- Modify: `src/lib/utils/skills.ts`
- Modify: `src/lib/utils/deed-engine.ts` (only if it reads `Skill.band`)
- Test: `src/lib/utils/skills.test.ts` — **this file already exists.** Read it before you add to it;
  some of what Step 1 asks for may already be there, and an existing assertion that contradicts the
  new axis is a finding to report, not a file to overwrite.

**Interfaces:**
- Consumes: `Grade`, `GRADES`, `bandForGrade` from `src/lib/utils/grade-levels.ts`; `ContentBand`, `bandForHero` from `src/lib/utils/content-bands.ts`.
- Produces: `Skill = { id, label, area, grades: Grade[], source }` and `skillsFor(area: SkillArea, grade: Grade): Skill[]` — an unchanged signature, so no caller changes.

- [ ] **Step 1: Write the equivalence test first — it is the whole point of this task**

This test must be written and passing against the CURRENT code before you change anything, so that it is proving the refactor and not describing it.

```ts
// src/lib/utils/skills.test.ts
import { describe, it, expect } from "vitest";
import { SKILLS, skillsFor, type SkillArea } from "./skills";
import { GRADES, bandForGrade, type Grade } from "./grade-levels";

const AREAS: SkillArea[] = ["math", "reading", "language", "science"];

describe("skillsFor is unchanged by the move from bands to grades", () => {
  /**
   * The oracle is the OLD rule, written out here by hand: a skill served grade g if and
   * only if its band was the band of g. Keeping this literal means the refactor is checked
   * against what the code used to do, not against the code as it now is.
   */
  it.each(AREAS.flatMap((area) => GRADES.map((g) => [area, g] as [SkillArea, Grade])))(
    "%s at grade %s returns exactly the old band's skills",
    (area, grade) => {
      const expected = SKILLS.filter(
        (s) => s.area === area && s.grades.some((sg) => bandForGrade(sg) === bandForGrade(grade))
      );
      // Not a subset check: the exact set, so a skill gained or lost is caught.
      expect(skillsFor(area, grade).map((s) => s.id).sort()).toEqual(expected.map((s) => s.id).sort());
    }
  );
});
```

Note this oracle is written in terms of `grades`, so it only compiles AFTER step 2. Write it, watch it fail to compile, and treat that as the red state. **Before** step 2, capture the current behaviour as a literal snapshot instead:

```ts
it("pins today's grade-to-skill-ids map so the refactor cannot move anyone", () => {
  const map = Object.fromEntries(
    AREAS.map((area) => [area, Object.fromEntries(GRADES.map((g) => [g, skillsFor(area, g).map((s) => s.id)]))])
  );
  expect(map).toMatchInlineSnapshot();
});
```

- [ ] **Step 2: Run it against the current code and let Vitest fill the inline snapshot in**

Run: `npx vitest run src/lib/utils/skills.test.ts -u`
Expected: PASS, and the snapshot is now written into the file with the pre-refactor mapping. **Read the snapshot and sanity-check it** — grade 3 math should show `add-20`, `sub-20`, `add-100`, and grade 6 reading should show `sight-g23`. Commit this snapshot BEFORE refactoring, so the refactor is measured against a committed baseline.

- [ ] **Step 3: Commit the baseline**

```bash
git add src/lib/utils/skills.test.ts
git commit -m "test(skills): pin every grade's skills before the axis moves" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Change the axis**

In `skills.ts`, replace the `band` field with `grades`, and expand each existing band to the grades it covered:

```ts
import { GRADES, type Grade } from "./grade-levels";

export type Skill = { id: string; label: string; area: SkillArea; grades: Grade[]; source: SkillSource };

/** The grades each old band covered. Kept as data so the expansion below is checkable by eye. */
const BAND_GRADES = {
  k1: ["K", "1"],
  g23: ["2", "3"],
  g45: ["4", "5"],
  g68: ["6", "7", "8"],
  g912: ["9", "10", "11", "12"],
} as const satisfies Record<string, readonly Grade[]>;

const k1 = [...BAND_GRADES.k1];
const g23 = [...BAND_GRADES.g23];
const g45 = [...BAND_GRADES.g45];
const g68 = [...BAND_GRADES.g68];
const g912 = [...BAND_GRADES.g912];
```

Then every row becomes e.g. `{ id: "add-10", label: "Addition within 10", area: "math", grades: k1, source: gen("add") }`. **Do not change any id, label, area or source in this task** — only the band field. Math rows get their real grades in Task 13; here they keep exactly the grades their band covered.

And `skillsFor` loses its band hop:

```ts
export function skillsFor(area: SkillArea, grade: Grade): Skill[] {
  return SKILLS.filter((s) => s.area === area && s.grades.includes(grade));
}
```

- [ ] **Step 5: Add the by-hand equivalence test from Step 1 and run everything**

Run: `npx vitest run`
Expected: PASS, **with the inline snapshot from Step 2 unchanged.** If Vitest reports a snapshot mismatch, the refactor moved a child's content — fix the expansion, do not update the snapshot.

- [ ] **Step 6: Prove the test bites**

Change `grades: g23` to `grades: g45` on `add-100` and run the suite. Expected: the snapshot test FAILS. Revert. **Record in your report which assertion failed** — if none did, the test is not protecting anything and must be fixed before you continue.

- [ ] **Step 7: Check `BAND_GRADES` against `bandForGrade`, not against your own reading**

```ts
it("expands each band to exactly the grades bandForGrade assigns it", () => {
  for (const [band, grades] of Object.entries(BAND_GRADES)) {
    expect(GRADES.filter((g) => bandForGrade(g) === band)).toEqual([...grades]);
  }
});
```
This needs `BAND_GRADES` exported. Export it; Task 13 deletes it along with the last band reference.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/skills.ts src/lib/utils/skills.test.ts
git commit -m "refactor(skills): key skills by grade, not by band" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Make every skill at a grade reachable

**This task fixes a live bug, and it must land before any generator is written.** Measured against
the current code, at every single grade, `chooseSkills` can only ever serve the *first* generator it
finds:

| Grade | Skills available | Actually served | Never served |
|---|---|---|---|
| K, 1 | add-10, sub-10 | add-10 | **sub-10** |
| 2, 3 | add-20, sub-20, add-100 | add-20 | **sub-20, add-100** |
| 4, 5 | mul-facts, div-facts, place-value | mul-facts | **div-facts, place-value** |
| 6, 7, 8 | fractions-compare, integer-ops | fractions-compare | **integer-ops** |
| 9–12 | percent-of, one-step-eq | percent-of | **one-step-eq** |

It is not only math. Language Arts at grades 4 and 5 offers `spell-g45` and `vocab-g45`, both pools,
and `find` takes spelling — so **`vocab-g45` is never served either**. Reading and Science happen to
have one skill per band today, so they are unaffected by luck rather than by design.

So today a grade-3 child does addition within 20 and nothing else, for as long as they play — no
subtraction, ever. A grade-5 child never sees division or place value. This is a large part of why
the math does not feel right, and it is independent of the band problem.

Measured, not inferred: the table above comes from running `chooseSkills` over every grade and
comparing what it returns against what `skillsFor` offers.

The cause is in `chooseSkills` (`src/lib/utils/deed-engine.ts`):

```ts
const generator = candidates.find((s) => s.source.kind === "generator");
const pool = candidates.find((s) => s.source.kind === "pool");
```

`find` takes the first match. With one generator per area per band that was invisible. **The skill map
puts five math skills at every grade, so shipping the generators on top of this would leave four
fifths of the new content unreachable** — and the bug would look like the generators not working.

**Files:**
- Modify: `src/lib/utils/deed-engine.ts`
- Test: `src/lib/utils/deed-engine.test.ts`

**Interfaces:**
- Consumes: `skillsFor` (now grade-keyed, from Task 1), `nearestGrades`, `masteryBySkill` and the
  seeded `rng` that `buildRun` already has.
- Produces: `chooseSkills(deed, grade): Skill[]` — **same signature**, now returning *every* candidate
  at the nearest grade that has any, rather than pre-selecting two. Selection moves into `buildRun`.

### Why selection moves rather than `chooseSkills` getting smarter

Picking well needs two things `chooseSkills` does not have: the child's mastery, and a seeded rng.
`buildRun` already has both. Meanwhile the action calls `chooseSkills` *before* mastery is loaded,
because it needs `poolSkillIds` to build the pool query — so teaching `chooseSkills` about mastery
would force a second database round trip against a remote Turso instance. Moving the choice into
`buildRun` costs nothing: there is at most one pool skill per area per grade, so the pool query's
`inArray` is the same size either way.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/utils/deed-engine.test.ts
describe("every skill at a hero's grade can actually be served", () => {
  it("reaches every math skill at a grade across a run of seeds", () => {
    for (const grade of GRADES) {
      const available = skillsFor("math", grade).map((s) => s.id);
      if (available.length === 0) continue;
      const served = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        // A hero with no mastery anywhere: the flattest case, where nothing but the
        // selection rule decides. If a skill is unreachable here it is unreachable.
        const built = buildDeedRun({ ...baseInput, grade, seed, masteryBySkill: {} });
        for (const id of built.skillIds) served.add(id);
      }
      const unreachable = available.filter((id) => !served.has(id));
      expect(unreachable, `grade ${grade} can never serve: ${unreachable.join(", ")}`).toEqual([]);
    }
  });

  it("practises the least-mastered skill first", () => {
    // Two generators at one grade, one already at level 4 and one at level 0.
    // The level-0 skill must be the one chosen, on every seed — this is not a tie.
    const built = buildDeedRun({ ...baseInput, grade: "3", seed: 99, masteryBySkill: { "add-20": 4, "sub-20": 0 } });
    expect(built.skillIds).toContain("sub-20");
  });
});
```

Build `baseInput` from whatever `deed-engine.test.ts` already uses — **read the file first**, it has
fixtures. Do not invent a second set.

- [ ] **Step 2: Run it and confirm it fails the way the table above predicts**

Run: `npx vitest run src/lib/utils/deed-engine.test.ts`
Expected: FAIL, naming `sub-10`, `sub-20`, `add-100`, `div-facts`, `place-value`, `integer-ops` and
`one-step-eq` as unreachable. **If it passes, stop and report it** — the bug described here would then
not exist and the rest of this task is wrong.

- [ ] **Step 3: Return all candidates from `chooseSkills`**

```ts
/**
 * Every skill for the deed's area at the hero's grade, or at the nearest grade that has
 * any — easier grades first, so a hero is never handed harder work than their own grade.
 * Which of these a run actually practises is decided in `buildRun`, where the hero's
 * mastery and the run's seed are both in hand.
 */
export function chooseSkills(deed: Deed, grade: Grade): Skill[] {
  for (const g of nearestGrades(grade)) {
    const candidates = skillsFor(deed.area, g);
    if (candidates.length > 0) return candidates;
  }
  return [];
}
```

- [ ] **Step 4: Select inside `buildRun`**

Add a pure, exported, separately testable selector and call it from `buildRun`:

```ts
/**
 * Up to two skills for one run: the least-practised generator, and the least-practised
 * pool when one exists — so a hero works on what they have done least rather than on
 * whatever happened to be listed first. Ties are broken by the run's seed, so a hero
 * with fresh mastery everywhere still meets all of their grade's skills over time
 * instead of the same one every day.
 */
export function selectSkills(candidates: Skill[], masteryBySkill: Record<string, number>, rng: Rng): Skill[] {
  const leastPractised = (pool: Skill[]): Skill | undefined => {
    if (pool.length === 0) return undefined;
    const lowest = Math.min(...pool.map((s) => masteryBySkill[s.id] ?? 0));
    const tied = pool.filter((s) => (masteryBySkill[s.id] ?? 0) === lowest);
    return shuffle(tied, rng)[0];
  };
  const generator = leastPractised(candidates.filter((s) => s.source.kind === "generator"));
  const pool = leastPractised(candidates.filter((s) => s.source.kind === "pool"));
  const picked = [generator, pool].filter((s): s is Skill => !!s);
  return picked.length > 0 ? picked : candidates.slice(0, 1);
}
```

In `buildRun`, replace the use of the passed-in skill list with `selectSkills(chooseSkills(deed, grade), masteryBySkill, rng)`.

**Careful:** `buildRun` draws the rng in a fixed order, and adding a `shuffle` call changes every
subsequent draw. Existing tests that pin exact generated questions for a given seed **will fail, and
that is correct** — the questions are equally valid, only the seed mapping moved. Update those
expectations, and say in your report how many you updated. If a test fails for any *other* reason,
stop and report it.

- [ ] **Step 5: Check the caller still works**

`src/lib/actions/deeds.ts` derives `poolSkillIds` from `chooseSkills`, which now returns more skills.
At most one is a pool skill per area per grade, so the `inArray` query is the same size in practice —
**verify that by test rather than by assumption**, and if a grade ever has two pool skills, the query
simply covers both, which is harmless. Confirm the action still typechecks and that `built.skillIds`
(which drives `masteryStart`) contains only the skills actually practised, not every candidate.

- [ ] **Step 6: Run everything and prove the fix bites**

Run: `npx vitest run`
Then revert `chooseSkills` to `find` and confirm the reachability test fails again. Restore.
**Record what failed in your report.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/deed-engine.ts src/lib/utils/deed-engine.test.ts
git commit -m "fix(deeds): serve every skill at a hero's grade, not just the first" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The verifier harness — make a wrong answer key impossible

Spec 6.3 promises "a generator cannot carry a wrong answer key". Today nothing enforces that: a generator computes both the question and the answer, so a bug in the formula produces a confidently wrong question that every structural check passes.

The fix is an **independent oracle**: a verifier that reads the generated `prompt` string and re-derives the answer without ever seeing the generator's internals. Two independent derivations agreeing is real evidence; one derivation checking itself is not.

**Files:**
- Create: `src/lib/utils/drill-verify.ts`
- Create: `src/lib/utils/drill-verify.test.ts`
- Read first: `src/lib/utils/drill-generators.test.ts` — **it already exists.** Whatever it already
  asserts about these nine generators is prior art: do not duplicate it, and if it contradicts a
  verifier you write, one of the two is wrong and that is a finding worth reporting.

**Interfaces:**
- Consumes: `GENERATORS`, `Question`, `seededRng` from `./drill-generators`; `SKILLS` from `./skills`.
- Produces: `VERIFIERS: Record<string, Verifier>` where `Verifier = (q: Question) => string`, returning the answer the verifier derives **from `q.prompt` alone**. Later tasks add one entry per new generator.

- [ ] **Step 1: Write the verifier module with the nine verifiers today's generators need**

```ts
// src/lib/utils/drill-verify.ts
import type { Question } from "./drill-generators";

/**
 * Re-derives a question's answer from its PROMPT TEXT, never from the generator that
 * produced it. The point is independence: if the generator's formula is wrong, the
 * verifier still reads the question a child would actually see and computes what the
 * right answer is. A generator and its verifier agreeing is two derivations agreeing.
 *
 * A verifier returns the answer as a string, or throws if the prompt does not parse —
 * a prompt the verifier cannot read is itself a defect worth failing on.
 */
export type Verifier = (q: Question) => string;

/** "What is 12 + 7?" / "What is -3 × 4?" / "What is 20% of 50?" */
const arithmetic: Verifier = (q) => {
  const m = /^What is (-?\d+) ([+\-×÷]) (-?\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`arithmetic verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2]) {
    case "+": return String(a + b);
    case "-": return String(a - b);
    case "×": return String(a * b);
    case "÷": {
      if (b === 0) throw new Error(`division by zero in: ${q.prompt}`);
      if (a % b !== 0) throw new Error(`non-integer quotient in: ${q.prompt}`);
      return String(a / b);
    }
    default: throw new Error(`unknown operator in: ${q.prompt}`);
  }
};

const percentOf: Verifier = (q) => {
  const m = /^What is (\d+)% of (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`percent verifier cannot parse: ${q.prompt}`);
  const value = (Number(m[1]) * Number(m[2])) / 100;
  if (!Number.isInteger(value)) throw new Error(`non-integer percent answer in: ${q.prompt}`);
  return String(value);
};

const placeValue: Verifier = (q) => {
  const m = /^What digit is in the ([a-z-]+) place of ([\d,]+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`place-value verifier cannot parse: ${q.prompt}`);
  const places = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
  const idx = places.indexOf(m[1]);
  if (idx < 0) throw new Error(`unknown place "${m[1]}"`);
  const digits = m[2].replace(/,/g, "");
  return digits[digits.length - 1 - idx];
};

/** "Which fraction is the largest?" — the choices ARE the data, so verify over them. */
const largestFraction: Verifier = (q) => {
  const value = (s: string) => {
    const m = /^(\d+)\/(\d+)$/.exec(s);
    if (!m) throw new Error(`not a fraction: ${s}`);
    return Number(m[1]) / Number(m[2]);
  };
  return q.choices.reduce((best, c) => (value(c) > value(best) ? c : best));
};

/** "Solve for x: x + 4 = 11" / "Solve for x: 3x = -12" */
const oneStepEq: Verifier = (q) => {
  const add = /^Solve for x: x \+ (-?\d+) = (-?\d+)$/.exec(q.prompt);
  if (add) return String(Number(add[2]) - Number(add[1]));
  const sub = /^Solve for x: x - (-?\d+) = (-?\d+)$/.exec(q.prompt);
  if (sub) return String(Number(sub[2]) + Number(sub[1]));
  const mul = /^Solve for x: (-?\d+)x = (-?\d+)$/.exec(q.prompt);
  if (mul) {
    const a = Number(mul[1]), c = Number(mul[2]);
    if (a === 0 || c % a !== 0) throw new Error(`no integer solution in: ${q.prompt}`);
    return String(c / a);
  }
  throw new Error(`equation verifier cannot parse: ${q.prompt}`);
};

export const VERIFIERS: Record<string, Verifier> = {
  add: arithmetic,
  sub: arithmetic,
  mul: arithmetic,
  div: arithmetic,
  "integer-ops": arithmetic,
  "percent-of": percentOf,
  "place-value": placeValue,
  "fractions-compare": largestFraction,
  "one-step-eq": oneStepEq,
};
```

- [ ] **Step 2: Write the universal property test**

```ts
// src/lib/utils/drill-verify.test.ts
import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, type Question } from "./drill-generators";
import { VERIFIERS } from "./drill-verify";
import { SKILLS } from "./skills";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

/** Every skill that names this generator — a generator's behaviour is skill-dependent. */
const skillIdsFor = (generatorId: string) =>
  SKILLS.filter((s) => s.source.kind === "generator" && s.source.generatorId === generatorId).map((s) => s.id);

const cases = Object.keys(GENERATORS).flatMap((genId) =>
  skillIdsFor(genId).flatMap((skillId) => LEVELS.map((level) => [genId, skillId, level] as const))
);

describe("every generated question is independently verifiable", () => {
  it("covers every generator, so the checks below are not vacuous", () => {
    expect(Object.keys(GENERATORS).length).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThanOrEqual(Object.keys(GENERATORS).length * LEVELS.length);
  });

  it("has a verifier for every generator, and no verifier without a generator", () => {
    expect(Object.keys(VERIFIERS).sort()).toEqual(Object.keys(GENERATORS).sort());
  });

  it("has at least one skill pointing at every generator, so none is dead", () => {
    const orphans = Object.keys(GENERATORS).filter((g) => skillIdsFor(g).length === 0);
    expect(orphans, `generators no skill uses: ${orphans.join(", ")}`).toEqual([]);
  });

  it.each(cases)("%s / %s / level %i produces questions that survive every check", (genId, skillId, level) => {
    const generate = GENERATORS[genId];
    const verify = VERIFIERS[genId];
    const byId = new Map<string, Question>();

    for (const seed of SEEDS) {
      const rng = seededRng(seed);
      for (let i = 0; i < 5; i++) {
        const q = generate(level, rng, skillId);

        // The answer is what an independent reading of the prompt says it is.
        expect(verify(q), `wrong answer key for "${q.prompt}"`).toBe(q.answer);

        // Structure: exactly four distinct choices, the answer among them.
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size, `duplicate choices in "${q.prompt}"`).toBe(4);
        expect(q.choices).toContain(q.answer);

        // Nothing malformed leaks into a child's screen.
        expect(q.prompt).not.toMatch(/NaN|undefined|Infinity/);
        expect(q.answer).not.toBe("");
        expect(q.skillId).toBe(skillId);

        // Read-aloud must be speakable: no symbol a screen reader would mangle.
        if (q.readAloud !== undefined) {
          expect(q.readAloud, `unspeakable read-aloud: ${q.readAloud}`).not.toMatch(/[-×÷²³√π^\/]/);
        }

        // The id encodes the parameters, so the same id is always the same question.
        const seen = byId.get(q.id);
        if (seen) {
          expect(q.prompt).toBe(seen.prompt);
          expect(q.answer).toBe(seen.answer);
        } else {
          byId.set(q.id, q);
        }
      }
    }
  });

  it("is deterministic: the same seed and level replay the same questions", () => {
    for (const [genId, skillId, level] of cases.slice(0, 20)) {
      const run = () => {
        const rng = seededRng(4242);
        return Array.from({ length: 5 }, () => GENERATORS[genId](level, rng, skillId).id);
      };
      expect(run()).toEqual(run());
    }
  });
});
```

- [ ] **Step 3: Run it. Expect real failures, and read them.**

Run: `npx vitest run src/lib/utils/drill-verify.test.ts`

This harness is being pointed at nine generators that have never faced an independent oracle. **Do not assume it passes.** If a check fails, the question is which side is wrong — the generator or the verifier:
- The verifier cannot parse a prompt → usually the verifier's regex is too narrow. Widen it.
- The verifier computes a different answer → **investigate the generator**. This is the case the harness exists for. Report it prominently; do not "fix" it by loosening the verifier.
- `readAloud` contains a banned symbol → the generator's spoken form is wrong and a child using read-aloud has been hearing it. Fix the generator.

Record in your report every failure you saw and which side you changed. A clean first run on nine unaudited generators is itself worth being suspicious of — say so if that happens.

- [ ] **Step 4: Prove the harness bites**

Change the `add` generator's answer from `String(a + b)` to `String(a + b + 1)` and run the suite.
Expected: the verifier check FAILS with "wrong answer key". Revert.

Then delete the `sub` entry from `VERIFIERS` and run.
Expected: the "has a verifier for every generator" test FAILS. Revert.

**Record both results.** If either mutation passes, the harness is decorative and must be fixed before any generator is written against it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/drill-verify.ts src/lib/utils/drill-verify.test.ts
git commit -m "test(drills): verify every generated answer against the prompt, independently" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
## How to add a generator (Tasks 4–12 all follow this)

Every generator task has the same five steps. They are written out once here; each task below
gives only what is specific to it — the generators, their exact parameters, and their verifiers.

1. **Write the generator** in the module named by the task, following the shape in `drill-generators.ts`.
   Use `randInt`, `shuffle`, `numericDistractors` and `makeQuestion` rather than re-implementing them.
2. **Write its verifier** in `drill-verify.ts` and register it in `VERIFIERS`. The verifier must derive
   the answer from `q.prompt` (or from `q.choices` where the choices are the data). It may not import
   the generator or duplicate its formula from the same source — **write the arithmetic the other way
   round where you can** (a generator that builds `a × b` from factors gets a verifier that parses the
   product and divides).
3. **Register the generator** in `GENERATORS` and **add its skill row** to `SKILLS` with the grades the
   map gives it. The universal test fails on a generator with no skill and on a skill with no verifier,
   so all three must land together.
4. **Run `npx vitest run`.** The universal property test in `drill-verify.test.ts` now covers the new
   generator automatically — 5 levels × 40 seeds × 5 draws each. Read any failure carefully: a verifier
   disagreeing with a generator means one of them is wrong, and it is usually not the verifier.
5. **Prove the new tests bite.** Break one new generator's answer formula (`+ 1` on the result) and
   confirm the suite fails; revert. **Record which assertion failed in your report.** A break that
   produces no failure is not evidence — it means the generator is not actually covered, and you must
   find out why before continuing.

**Level 0–4 means easiest to hardest within one grade.** Every parameter table below is indexed by
level. A child starts at level 0 in a new skill and climbs as they get answers right, so level 0 must
be genuinely approachable for a child at the very start of that grade and level 4 genuinely stretching
by its end.

**On distractors.** `numericDistractors(answer, rng, min)` gives three near-misses for a numeric
answer and is the default. Where a wrong answer has a *characteristic shape* — adding numerators when
adding fractions, dropping a negative, using diameter for radius — prefer distractors built from that
mistake, because a child who picks one has told you something. Each task names these where they matter.

---

## Task 4: Kindergarten and grade 1

**Files:**
- Create: `src/lib/utils/generators/elementary.ts`
- Modify: `src/lib/utils/drill-generators.ts` (register), `src/lib/utils/drill-verify.ts`, `src/lib/utils/skills.ts`
- Test: `src/lib/utils/generators/elementary.test.ts`

**Interfaces:**
- Consumes: `Generator`, `Rng`, `randInt`, `shuffle`, `numericDistractors`, `makeQuestion` — **export
  `makeQuestion` from `drill-generators.ts`**, which is currently module-private. It is the only
  change other tasks depend on, so make it in this task.
- Produces: generators `count-seq`, `compare-num`, `ten-more-less`; skills at grades K and 1.

### The generators

**`count-seq` — counting and number order to 20 (grade K)**
- Prompt: `What number comes after 7?` or `What number comes before 12?`
- Levels (max number): `[5, 10, 15, 20, 20]`. Level 4 also allows "before"; levels 0–2 are "after" only,
  since counting forward is learned first.
- Answer: `n + 1` for after, `n - 1` for before. Pick `n` in `[1, max - 1]` so both stay in range.
- Distractors: `numericDistractors(answer, rng, 0)`.
- Id key: `after-${n}` / `before-${n}`.
- Read-aloud: same as the prompt (it contains no symbols).
- Verifier: parse `after (\d+)` → `n + 1`; `before (\d+)` → `n - 1`.

**`compare-num` — which number is greater (grade K), and `compare-num-100` (grade 1)**

One generator, two skills, parameterised by skill id exactly as `add` is today:

```ts
const COMPARE_MAX: Record<string, number[]> = {
  "compare-num": [5, 10, 10, 10, 10],
  "compare-num-100": [20, 50, 99, 99, 99],
};

const compareNum: Generator = (level, rng, skillId) => {
  const max = (COMPARE_MAX[skillId] ?? COMPARE_MAX["compare-num"])[L(level)];
  // Four distinct numbers: the choices ARE the data, so the child compares a real set.
  const picked = new Set<number>();
  while (picked.size < 4) picked.add(randInt(rng, 0, max));
  const nums = [...picked];
  const answer = Math.max(...nums);
  return {
    id: `${skillId}:${[...nums].sort((a, b) => a - b).join(",")}`,
    skillId,
    prompt: "Which number is the greatest?",
    choices: shuffle(nums.map(String), rng),
    answer: String(answer),
    readAloud: "Which number is the greatest?",
  };
};
```

Note the id sorts the numbers, so the same *set* is the same question however it was drawn — which is
what "re-ask a miss verbatim" needs. Verifier: `Math.max` over `q.choices`, exactly like
`largestFraction` but for plain integers.

**`ten-more-less` — ten more, ten less (grade 1)**
- Prompt: `What is 10 more than 34?` / `What is 10 less than 56?`
- Levels (max start): `[20, 40, 60, 80, 99]`. Levels 0–1 are "more" only.
- For "less", draw the start in `[10, max]` so the answer never goes negative.
- Answer: `n ± 10`. Distractors: `numericDistractors(answer, rng, 0)` — `numericDistractors` already
  offers ±10 candidates, which here would collide with the answer's own shape; that is fine and
  desirable, since "34" is exactly the tempting wrong answer for "10 more than 34".
- Id key: `more-${n}` / `less-${n}`.
- Verifier: parse `10 (more|less) than (\d+)` and add or subtract 10.

### The skill rows to add

```ts
{ id: "count-seq", label: "Counting and number order", area: "math", grades: ["K"], source: gen("count-seq") },
{ id: "compare-num", label: "Comparing numbers", area: "math", grades: ["K"], source: gen("compare-num") },
{ id: "ten-more-less", label: "Ten more, ten less", area: "math", grades: ["1"], source: gen("ten-more-less") },
{ id: "compare-num-100", label: "Comparing two-digit numbers", area: "math", grades: ["1"], source: gen("compare-num") },
```

Leave the existing `add-10`, `sub-10`, `add-20`, `sub-20` rows alone in this task — Task 13 re-points
every math skill to its map grade in one reviewable commit.

- [ ] **Step 1: Export `makeQuestion` from `drill-generators.ts`**
- [ ] **Step 2: Write the three generators in `generators/elementary.ts`**
- [ ] **Step 3: Write their verifiers and register them**
- [ ] **Step 4: Register the generators and add the four skill rows**
- [ ] **Step 5: Run `npx vitest run` and read every failure**
- [ ] **Step 6: Prove the tests bite** (break `count-seq`'s answer to `n + 2`; expect a verifier failure; revert; record it)
- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/generators src/lib/utils/drill-generators.ts src/lib/utils/drill-verify.ts src/lib/utils/skills.ts
git commit -m "feat(drills): kindergarten and grade 1 math" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Grades 2 and 3

**Files:** Modify `generators/elementary.ts`; create `generators/intermediate.ts`; modify `drill-generators.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `sub-100` (a parameter row, not a new generator), `skip-count`, `time-clock`, `money-coins`, `frac-unit`, `area-perimeter`, `round-nearest`.

| Skill id | Grade | Prompt | Levels (param) | Answer | Distractors | Id key |
|---|---|---|---|---|---|---|
| `sub-100` | 2 | *(reuses `sub`)* | Add `"sub-100": [20, 40, 60, 80, 100]` to `SUB_MAX` | — | — | — |
| `skip-count` | 2 | `Count by 5s: 5, 10, 15, __` | step ∈ `[2],[2,5],[2,5,10],[2,5,10,3],[2,5,10,3,4]`; 3 shown terms | `start + 3 × step` | `numericDistractors(answer, rng, 0)` | `${step}from${start}` |
| `time-clock` | 2 | `The hour hand is on 4 and the minute hand is on 6. What time is it?` | minute granularity `[30, 30, 15, 5, 5]` | `4:30` as `H:MM` | Same hour wrong minutes, ±1 hour same minutes, and hour/minute swapped — the three real mistakes | `${h}:${m}` |
| `money-coins` | 2 | `How much is 3 dimes and 2 pennies?` | coin kinds `[1, 2, 2, 3, 4]` from quarters/dimes/nickels/pennies | total in cents, rendered `32¢` (or `$1.15` ≥ 100) | Count-of-coins instead of value; one coin miscounted; ±5¢ | sorted `q:d:n:p` counts |
| `frac-unit` | 3 | `A number line from 0 to 1 is split into 6 equal parts. What fraction is at the 5th mark?` | denominator `[2, 3, 4, 6, 8]` | `5/6` | Numerator and denominator swapped; off-by-one numerator; the whole `6/6` | `${n}/${d}` |
| `area-perimeter` | 3 | `A rectangle is 7 units wide and 4 units tall. What is its area?` (or perimeter) | max side `[5, 8, 10, 12, 15]`; perimeter appears from level 2 | `w × h` or `2(w + h)` | **The other measure** is always one distractor — the classic confusion — plus two near-misses | `${w}x${h}a` / `${w}x${h}p` |
| `round-nearest` | 3 | `Round 274 to the nearest 10.` | place `[10, 10, 100, 100, 1000]`; number size grows with it | standard rounding, `.5` rounds up | Rounded the wrong way; rounded to the wrong place; the original number | `${n}@${place}` |

### Things that will bite you

- **`time-clock` read-aloud.** `4:30` spoken as "four thirty"; `4:05` as "four oh five"; `4:00` as
  "four o'clock". The answer string itself contains a `:` which the harness does not ban, but the
  read-aloud must not.
- **`money-coins` read-aloud.** `32¢` must speak as "32 cents", `$1.15` as "1 dollar and 15 cents".
  `¢` and `$` are not in the banned set but are not speakable either — **add `¢` and `$` to the
  banned read-aloud characters in `drill-verify.test.ts` as part of this task.**
- **`frac-unit` answers are fractions, not numbers.** `numericDistractors` does not apply. Build the
  three distractors explicitly and assert they are distinct from each other and from the answer.
- **`area-perimeter` with `w === h`** makes area and perimeter collide when `w = h = 4` (16 and 16).
  Redraw when `w × h === 2 × (w + h)`, or the "other measure" distractor equals the answer and the
  question has two right answers. **This is exactly the class of bug the verifier harness catches** —
  it will fail on duplicate choices, so do not suppress it, fix the draw.
- **`round-nearest` at level 4** with a 4-digit number rounding to the nearest 1000: make sure the
  "original number" distractor is not itself the answer when the number is already round. Redraw.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 2 and grade 3 math`.

---

## Task 6: Grades 4 and 5

**Files:** Modify `generators/intermediate.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `mul-multi`, `div-multi`, `frac-equiv`, `factors`, `frac-addsub`, `frac-mul`, `dec-ops`, `volume-prism`, `order-ops`.

| Skill id | Grade | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|---|
| `mul-multi` | 4 | `What is 34 × 6?` | `[ [2,1], [2,1], [3,1], [2,2], [3,2] ]` as [digits a, digits b] | `a × b` | Partial product only (tens ignored); carry dropped; off by a factor of 10 |
| `div-multi` | 4 | `What is 47 ÷ 5? Give the remainder.` | divisor max `[5, 9, 9, 12, 12]`; dividend up to 12× | remainder, or quotient at even levels | Quotient when remainder asked; remainder when quotient asked; off by one |
| `frac-equiv` | 4 | `Which fraction is equal to 2/3?` | denominator multiplier max `[2, 3, 4, 6, 8]` | `4/6` etc. | Numerator scaled but not denominator; denominator scaled but not numerator; both scaled by different factors |
| `factors` | 4 | `Which number is a factor of 24?` | target max `[12, 24, 36, 60, 100]` | a true factor | Multiples of the target (the classic factor/multiple swap), and near-misses that do not divide |
| `frac-addsub` | 5 | `What is 1/4 + 2/4?` | denominators: like `[same, same, same, unlike, unlike]`, max `[6, 8, 10, 12, 12]` | reduced fraction | **Numerators and denominators both added** (`3/8`) — the single most common error, always include it; unreduced answer; wrong operation |
| `frac-mul` | 5 | `What is 2/3 × 3/5?` | denominator max `[4, 5, 6, 8, 10]` | reduced fraction | Cross-multiplied; added instead; unreduced |
| `dec-ops` | 5 | `What is 3.4 + 1.25?` | decimal places `[1, 1, 2, 2, 2]`, op `+`/`-` then `×` at level 4 | exact decimal, trailing zeros trimmed | Decimal point misplaced by one; digits aligned wrong (right-aligned rather than by point); off by a tenth |
| `volume-prism` | 5 | `A box is 3 by 4 by 2 units. What is its volume?` | max side `[3, 4, 5, 6, 8]` | `l × w × h` | Surface area; sum of the sides; two of three multiplied |
| `order-ops` | 5 | `What is 3 + 4 × 2?` | terms `[3, 3, 3, 4, 4]`, parentheses from level 3 | correct by precedence | **Strict left-to-right evaluation** — the error the skill exists to correct — plus two near-misses |

### Things that will bite you

- **Fractions need a shared representation.** Write one small helper in `intermediate.ts`:
  `frac(n, d)` reducing by `gcd` and rendering `"n/d"`, with `"3"` when `d` divides `n` and `"0"` when
  `n === 0`. Three fraction generators depend on it; do not write it three times. `gcd` already exists
  in `drill-generators.ts` — **export it** rather than redefining.
- **`dec-ops` and floating point.** `0.1 + 0.2` is `0.30000000000000004`. Do every decimal computation
  in integer cents-style scaled arithmetic (`Math.round(x * 100)`), then render. The verifier must do
  the same, independently. A generator that emits `0.30000000000000004` as an answer string will be
  caught by the harness, but only if you do not paper over it with `toFixed` in both places.
- **`frac-equiv` and `factors` have choices as data**, like `fractions-compare`. Their verifiers work
  over `q.choices` plus the number parsed from the prompt.
- **Reduction is a decision, not an accident.** Decide once: answers are always fully reduced, and the
  unreduced form is always offered as a distractor. State it in a comment. The verifier reduces too,
  so an unreduced answer fails.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 4 and grade 5 math`.

---
## Task 7: Grades 6 and 7

**Files:** Create `generators/middle.ts`; modify `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `ratio-rate`, `frac-div`, `eval-expr`, `proportion`, `rational-ops`, `percent-change`, `two-step-eq`, `circle-measure`.

| Skill id | Grade | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|---|
| `ratio-rate` | 6 | `A car travels 120 miles in 3 hours. What is the speed in miles per hour?` | total max `[60, 120, 240, 360, 500]`, divisor `[2..12]`, always exact | `total / divisor` | Total × divisor; the total itself; off by one |
| `frac-div` | 6 | `What is 3/4 ÷ 1/2?` | denominator max `[4, 5, 6, 8, 10]` | reduced fraction | **Multiplied without inverting** — the defining error; inverted the wrong fraction; unreduced |
| `eval-expr` | 6 | `If x = 4, what is 3x + 5?` | coefficient max `[5, 8, 10, 12, 12]`, x range `[0..10]` then negatives at level 4 | computed value | `3 + x + 5` (coefficient read as a term); x substituted into the wrong slot; sign dropped |
| `proportion` | 7 | `If 3 pencils cost $6, how much do 7 pencils cost?` | unit price integer, counts `[2..12]` | exact | Added the difference instead of scaling; unit price alone; counts swapped |
| `rational-ops` | 7 | `What is -3/4 + 1/2?` | denominator max `[4, 6, 8, 10, 12]`, signs from level 0 | reduced signed fraction | Sign dropped; numerators added directly; wrong operation |
| `percent-change` | 7 | `A price rises from $40 to $50. What is the percent increase?` | base multiples of 10 up to `[50, 100, 200, 400, 500]`, change always exact | whole percent, `25%` | **Change over the new value instead of the old** — the defining error; the raw difference; the ratio unconverted |
| `two-step-eq` | 7 | `Solve for x: 3x + 4 = 19` | coefficient `[2..5]` then `[2..9]`; negatives at level 3 | integer x | Solved in the wrong order (divided before subtracting); sign flipped; off by one |
| `circle-measure` | 7 | `A circle has a radius of 5. What is its area? Use 3.14 for pi.` | radius `[2..5]` up to `[2..12]`; circumference from level 1 | `78.5` — one decimal place | **Diameter used as radius** (or vice versa); circumference when area asked; `2πr²` |

### Things that will bite you

- **`circle-measure` read-aloud** must say "pi", never `π`, and "5 squared" rather than `5²`. The
  prompt may show `3.14`; the read-aloud says "three point one four".
- **`circle-measure` rounding.** Fix it at one decimal place and round with
  `Math.round(x * 10) / 10` in both generator and verifier, derived independently. Do not let the
  verifier call the generator's helper.
- **`percent-change` must never produce a 0% change** (the question becomes degenerate) and must not
  produce a change so large the "difference" distractor equals the answer. Redraw.
- **`eval-expr` at level 4 with negative x** — check the prompt reads `If x = -3, what is 3x + 5?` and
  not `3-3 + 5`. Render the substitution only in the read-aloud, never in the prompt.
- **`two-step-eq`'s verifier** should solve the equation by parsing `ax + b = c` → `(c - b) / a` and
  **throw if `(c - b) % a !== 0`**. A non-integer solution is a generator bug, and the throw surfaces it.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 6 and grade 7 math`.

---

## Task 8: Grade 8

**Files:** Modify `generators/middle.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `linear-eq`, `slope`, `exponent-rules`, `pythagorean`, `sci-notation`.

| Skill id | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|
| `linear-eq` | `Solve for x: 4x - 3 = 2x + 7` | variables on one side at levels 0–1, both sides from level 2; coefficients `[2..9]` | integer x | Collected terms with the wrong sign; divided by the wrong coefficient; off by one |
| `slope` | `What is the slope of the line through (2, 3) and (6, 11)?` | coordinate range `[-5..5]` widening to `[-12..12]`; always an integer slope | integer or reduced fraction | **Run over rise** (inverted); sign flipped; difference of x only |
| `exponent-rules` | `Simplify: x^3 · x^5` → answer `x^8` | exponents `[2..5]` widening; quotients from level 2, power-of-a-power at level 4 | `x^8` as a string | **Exponents multiplied instead of added**; bases multiplied; exponents subtracted |
| `pythagorean` | `A right triangle has legs 3 and 4. How long is the hypotenuse?` | Pythagorean triples only: (3,4,5), (6,8,10), (5,12,13), (8,15,17), (7,24,25), (9,12,15), (20,21,29) — scaled by level | integer | **Legs added** (3 + 4 = 7); a leg when the hypotenuse is asked; the square of the answer |
| `sci-notation` | `Write 4,500 in scientific notation.` | magnitude `[3, 4, 5, 6, 8]`, negative exponents at level 4 | `4.5 × 10^3` | Exponent off by one; the decimal point in the wrong place; mantissa not between 1 and 10 |

### Things that will bite you

- **`exponent-rules` and `sci-notation` have string answers with `^` and `×`.** The read-aloud must
  say "x to the eighth power" and "four point five times ten to the third power". `^` and `×` are both
  in the banned read-aloud set, which is exactly why they must be spelled out.
- **`pythagorean` must use triples, not arbitrary legs** — `√(3² + 5²)` is irrational and cannot be a
  multiple-choice integer. The triple list above is the whole allowed set; scale it by the level rather
  than inventing new legs. **Do not let a scaled triple exceed what a child can hold** (cap at 3×).
- **`slope` must never divide by zero** — reject a pair with equal x. Redraw.
- **`sci-notation`'s verifier** parses the mantissa and exponent back out of the answer and multiplies,
  then compares to the number parsed from the prompt (commas stripped). That is a genuinely independent
  derivation, and the one to write.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 8 math`.

---

## Task 9: Grade 9 — Algebra I

**Files:** Create `generators/high.ts`; modify `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `multi-step-eq`, `systems-eq`, `factor-quad`, `slope-intercept`, `inequalities`.

| Skill id | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|
| `multi-step-eq` | `Solve for x: 2(x + 3) = 4x - 8` | distribution from level 0; fractions at level 4 | integer x | Distributed to the first term only; sign error on the move; divided before distributing |
| `systems-eq` | `Solve: x + y = 10 and x - y = 4. What is x?` | coefficients `[1..4]`, solutions `[-10..10]`, integer only | integer x (or y at odd levels) | The *other* variable's value — always include it; the sum; sign flipped |
| `factor-quad` | `Factor: x² + 7x + 12` | roots `[1..6]` widening to `[-9..9]`; leading coefficient 1 throughout | `(x + 3)(x + 4)` | Signs flipped; factors that multiply right but add wrong; factors that add right but multiply wrong |
| `slope-intercept` | `A line has slope 3 and passes through (0, -2). Write it in slope-intercept form.` | slope `[-5..5]`, intercept `[-8..8]` | `y = 3x - 2` | Slope and intercept swapped; sign of the intercept flipped; `x` and `y` swapped |
| `inequalities` | `Solve: -2x + 1 < 9` | positive coefficients at levels 0–2, negative from level 3 | `x > -4` | **Inequality not flipped when dividing by a negative** — the defining error, mandatory at levels 3–4; sign error; strict/non-strict swapped |

### Things that will bite you

- **`factor-quad`'s answer is a factored string.** Canonicalise it: always `(x + a)(x + b)` with
  `a ≤ b`, and `(x - 3)` rather than `(x + -3)`. The verifier expands the answer string back out and
  compares the coefficients against the prompt's — expansion is the independent derivation here, and
  it catches a distractor that happens to be a second correct factorisation.
- **`inequalities` levels 3–4 must actually divide by a negative**, or the skill never exercises the
  rule it exists for. Assert that in a dedicated test: at level 4, over many seeds, at least some
  prompts have a negative leading coefficient.
- **`systems-eq` asks for one variable but the other is a distractor.** Make sure they differ —
  redraw when `x === y`, or the answer appears twice among the choices.
- **`x²` in a prompt** is fine on screen; the read-aloud says "x squared".

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 9 math`.

---

## Task 10: Grade 10 — Geometry

**Files:** Modify `generators/high.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `angle-pairs`, `similar-tri`, `trig-ratios`, `solid-measure`, `dist-midpoint`.

| Skill id | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|
| `angle-pairs` | `Two angles are supplementary. One is 65°. What is the other?` | complementary at levels 0–1, supplementary from 1, vertical and same-side from 3 | integer degrees | **Complement when supplement asked** (and vice versa) — mandatory; the original angle; 360 minus it |
| `similar-tri` | `Two similar triangles have sides 3 and 12 in ratio. If a second side of the first is 5, what is its match?` | scale factor `[2..4]` widening to `[2..8]` | integer | Scale added instead of multiplied; divided instead of multiplied; the unscaled side |
| `trig-ratios` | `In a right triangle, the side opposite angle A is 3 and the hypotenuse is 5. What is sin A?` | triples only, as in `pythagorean` | `3/5` reduced | cos when sin asked; the reciprocal; adjacent over opposite |
| `solid-measure` | `A cylinder has radius 3 and height 4. What is its volume? Use 3.14 for pi.` | prism at level 0, cylinder from 1, sphere and cone at 4 | one decimal place | Surface area when volume asked; the `1/3` factor dropped for a cone; diameter used as radius |
| `dist-midpoint` | `What is the distance between (1, 2) and (4, 6)?` | triples again, so distances are integers | integer, or `(2.5, 4)` for midpoint | Midpoint when distance asked; the sum of coordinates; one coordinate's difference |

### Things that will bite you

- **`trig-ratios` and `dist-midpoint` must use Pythagorean triples** for the same reason `pythagorean`
  does — otherwise the answers are irrational. **Export the triple table from `generators/middle.ts`**
  rather than copying it; three generators now depend on it.
- **`°` in a prompt** is fine; the read-aloud says "degrees".
- **`solid-measure` at level 4** mixes sphere (`4/3 πr³`) and cone (`1/3 πr²h`). Pick radii that keep
  the answer to one decimal place, and round identically and independently in the verifier.
- **`similar-tri`'s prompt above is hard to read.** Rewrite it in plain words before you implement it —
  a question a child cannot parse is a wrong question even with the right answer. Something like:
  `Two triangles are similar. The first has sides 3 and 5. The second's matching side to the 3 is 12. What is its matching side to the 5?` Keep it to one sentence if you can, two at most.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 10 math`.

---

## Task 11: Grade 11 — Algebra II

**Files:** Modify `generators/high.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `quad-formula`, `poly-ops`, `radical-ops`, `log-rules`, `fn-compose`.

| Skill id | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|
| `quad-formula` | `Solve: x² - 5x + 6 = 0. What is the larger root?` | integer roots `[1..6]` widening to `[-9..9]`; leading coefficient 1, then `[2..3]` at level 4 | integer | The smaller root — always include it; roots with flipped signs; the sum of the roots |
| `poly-ops` | `Expand: (x + 3)(x - 5)` | binomials at levels 0–2, trinomial × binomial at 3–4 | `x² - 2x - 15` | Middle term's sign wrong; middle term omitted (the FOIL shortcut error); constant's sign wrong |
| `radical-ops` | `Simplify: √72` | perfect-square factor `[4, 9, 16, 25, 36]` | `6√2` | Fully un-simplified; the wrong factor pulled out; the whole root as an integer |
| `log-rules` | `What is log₂(32)?` | base `[2, 2, 3, 5, 10]`, exponent `[1..6]` | integer | Base and result swapped; the exponent off by one; the argument divided by the base |
| `fn-compose` | `If f(x) = 2x + 1 and g(x) = x - 3, what is f(g(4))?` | coefficients `[1..5]`, inputs `[0..10]`, negatives at level 4 | integer | **g(f(4))** — the order reversed, mandatory; f(4) alone; g(4) alone |

### Things that will bite you

- **`√` and `₂` are banned in read-aloud** and must be spelled: "the square root of 72", "log base 2
  of 32". `radical-ops`'s answer `6√2` speaks as "6 times the square root of 2".
- **`quad-formula` must have distinct roots** — a repeated root makes "the larger root" meaningless and
  collides with the "smaller root" distractor. Redraw when the roots are equal.
- **`radical-ops` answers are strings** of the form `a√b` with `b` square-free, or a bare integer when
  the radicand is a perfect square. The verifier squares the answer back (`a² × b`) and compares to the
  radicand parsed from the prompt — independent, and it catches an incompletely simplified answer only
  if you ALSO assert `b` is square-free. Assert both.
- **`log-rules` with base 10** should render `log(1000)`, not `log₁₀(1000)`, matching convention.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 11 math`.

---

## Task 12: Grade 12 — Precalculus and statistics

**Files:** Modify `generators/high.ts`, `drill-verify.ts`, `skills.ts`; test alongside.

**Produces:** `unit-circle`, `sequences`, `probability`, `rational-expr`, `log-eq`.

| Skill id | Prompt | Levels (param) | Answer | Distractor shapes |
|---|---|---|---|---|
| `unit-circle` | `What is cos(60°)?` | special angles only: 0, 30, 45, 60, 90 and their reflections, widening by level | `1/2`, `√2/2`, `√3/2`, `0`, `1` | sin when cos asked; the negative; the reciprocal |
| `sequences` | `An arithmetic sequence starts at 4 with common difference 3. What is the 7th term?` | arithmetic at levels 0–2, geometric from 3; terms `[5..12]` | integer | Off by one term (`n` vs `n-1`) — the defining error; the sum instead of the term; the common difference added once |
| `probability` | `A bag has 3 red and 5 blue marbles. What is the probability of drawing red?` | single event at levels 0–2, two independent events at 3–4 | reduced fraction `3/8` | The complement; red over blue (part over part, not part over whole); the count alone |
| `rational-expr` | `Simplify: (x² - 9) / (x + 3)` | difference of squares at levels 0–2, general factoring from 3 | `x - 3` | Sign flipped; the unfactored form; cancelled a term rather than a factor |
| `log-eq` | `Solve: 2^x = 64` | base `[2, 2, 3, 5, 10]`, exponent `[1..6]` | integer x | The base; the argument divided by the base; the exponent off by one |

### Things that will bite you

- **`unit-circle` answers include `√2/2`.** Represent them as canonical strings from a fixed table
  rather than computing floats and rendering them — `Math.cos(Math.PI/3)` is `0.5000000000000001`.
  The verifier looks the angle up in an independently written table; **write the verifier's table in
  the other direction** (value → angles) so it is not a copy of the generator's.
- **`probability` distractors must not include the answer** when the complement happens to equal it
  (3 red and 3 blue gives `1/2` both ways). Redraw when red equals blue.
- **`rational-expr` needs a domain note?** No — keep it out. A child at this level is being asked to
  simplify, and adding "for x ≠ -3" to every prompt makes the panel unreadable. Note the omission in a
  comment so a future reader knows it was a decision.
- **`sequences` geometric terms grow fast.** Cap the ratio at 3 and the term index at 8, or level 4
  produces six-digit answers that are tedious rather than hard.

Steps 1–7 as in "How to add a generator". Commit: `feat(drills): grade 12 math`.

---
## Task 13: Point every math skill at its grade

Tasks 4–12 added generators and skills without disturbing the eleven that already exist. This task
moves those eleven onto the map — and it is **the only task in this plan that changes what a child is
served.** Everything before it was additive. Treat it accordingly.

**Files:**
- Modify: `src/lib/utils/skills.ts`
- Modify: `src/lib/utils/skills.test.ts` (the Task 1 snapshot is now expected to change)
- Modify: `src/lib/utils/drill-verify.test.ts` (the orphan-generator check)
- Test: `src/lib/utils/skills.test.ts`

**Interfaces:**
- Consumes: everything Tasks 4–12 produced.
- Produces: a `SKILLS` table whose math rows match `docs/content/math-skill-map.md` exactly.

- [ ] **Step 1: Write the test that the table matches the map, before touching the table**

The map is a markdown file; the skill table is TypeScript. Nothing keeps them in step unless something
reads both. Parse the map:

```ts
// src/lib/utils/skills.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The skill map is the curriculum's source of truth, and it is a document a parent can edit.
 * This reads it directly so the table cannot drift from it — if someone moves a skill to a
 * different grade in the map and not in the code, this fails and names the skill.
 */
function mapRows(): { grade: string; skillId: string }[] {
  const md = readFileSync(join(process.cwd(), "docs/content/math-skill-map.md"), "utf8");
  const rows: { grade: string; skillId: string }[] = [];
  let grade: string | null = null;
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A grade cell looks like "**K**" or "**9** *(Algebra I)*"; a continuation row leaves it empty.
    const g = /\*\*([K0-9]+)\*\*/.exec(cells[1] ?? "");
    if (g) grade = g[1];
    const id = /^`([a-z0-9-]+)`$/.exec(cells[2] ?? "");
    if (id && grade) rows.push({ grade, skillId: id[1] });
  }
  return rows;
}

describe("the math skill table follows the skill map", () => {
  it("finds every row in the map, so the comparison below is not vacuous", () => {
    expect(mapRows().length).toBe(64);
  });

  it("serves exactly the map's skills at every grade", () => {
    const expected = new Map<string, string[]>();
    for (const { grade, skillId } of mapRows()) {
      expected.set(grade, [...(expected.get(grade) ?? []), skillId].sort());
    }
    for (const grade of GRADES) {
      expect(skillsFor("math", grade).map((s) => s.id).sort(), `grade ${grade}`)
        .toEqual(expected.get(grade) ?? []);
    }
  });
});
```

- [ ] **Step 2: Run it. Expect failure, and read what it says.**

Run: `npx vitest run src/lib/utils/skills.test.ts`
Expected: FAIL, naming the grades whose skills do not yet match. **If the count assertion fails at
something other than 64, the map has changed since this plan was written — stop and report it rather
than adjusting the number.** The map is the authority; a changed map means the plan needs a ruling.

- [ ] **Step 3: Re-point the eleven existing math skills**

Set each row's `grades` to a single-element array per the map:

```ts
{ id: "add-10",   label: "Addition within 10",    area: "math", grades: ["K"], source: gen("add") },
{ id: "sub-10",   label: "Subtraction within 10", area: "math", grades: ["K"], source: gen("sub") },
{ id: "add-20",   label: "Addition within 20",    area: "math", grades: ["1"], source: gen("add") },
{ id: "sub-20",   label: "Subtraction within 20", area: "math", grades: ["1"], source: gen("sub") },
{ id: "add-100",  label: "Addition within 100",   area: "math", grades: ["2"], source: gen("add") },
{ id: "mul-facts",  label: "Multiplication facts", area: "math", grades: ["3"], source: gen("mul") },
{ id: "div-facts",  label: "Division facts",       area: "math", grades: ["3"], source: gen("div") },
{ id: "place-value", label: "Place value",         area: "math", grades: ["4"], source: gen("place-value") },
{ id: "integer-ops", label: "Integer operations",  area: "math", grades: ["6"], source: gen("integer-ops") },
{ id: "percent-of",  label: "Percent of a number", area: "math", grades: ["6"], source: gen("percent-of") },
{ id: "one-step-eq", label: "One-step equations",  area: "math", grades: ["9"], source: gen("one-step-eq") },
```

- [ ] **Step 4: Retire `fractions-compare` without deleting anything**

Give it `grades: []` and a comment saying why:

```ts
/**
 * Offered at no grade: comparing fractions is covered inside `frac-equiv` (grade 4) and
 * `frac-addsub` (grade 5). The row stays and the id is never reused, so the mastery rows
 * children have already earned on it are neither deleted nor silently attached to some
 * other skill. `skillsFor` returns it for no grade, so nothing serves it.
 */
{ id: "fractions-compare", label: "Comparing fractions", area: "math", grades: [], source: gen("fractions-compare") },
```

Its generator now has no grade serving it, so the **orphan-generator check from Task 3 will fail.**
That check exists to catch a generator nobody wired up; this is the one deliberate exception. Narrow
it rather than deleting it:

```ts
/** Retired skills keep their generator so old mastery rows still resolve; see skills.ts. */
const RETIRED = new Set(["fractions-compare"]);

it("has at least one skill pointing at every generator, so none is dead", () => {
  const orphans = Object.keys(GENERATORS)
    .filter((g) => !RETIRED.has(g))
    .filter((g) => skillIdsFor(g).length === 0);
  expect(orphans, `generators no skill uses: ${orphans.join(", ")}`).toEqual([]);
});
```

- [ ] **Step 5: Update the Task 1 snapshot deliberately, and read the diff**

Run: `npx vitest run src/lib/utils/skills.test.ts -u`

Then **read the snapshot diff in `git diff` before committing it.** This is the moment the content
actually moves, and the diff is the record of it. Check by eye that:
- no grade lost math entirely (every grade K–12 has at least three math skills);
- reading, language and science are **completely unchanged** — this task touches math only;
- `fractions-compare` disappears from every grade and no other id does.

Write what you saw into your report. If a non-math skill moved, something is wrong with the table, not
with the snapshot.

- [ ] **Step 6: Assert the invariants the snapshot cannot state**

```ts
it("gives every grade its own math, so no child falls back for math", () => {
  for (const grade of GRADES) expect(skillsFor("math", grade).length, `grade ${grade}`).toBeGreaterThanOrEqual(3);
});

it("keeps every skill id that has ever existed", () => {
  // The eleven ids that existed before this plan. Losing one silently orphans mastery rows.
  const before = ["add-10","sub-10","add-20","sub-20","add-100","mul-facts","div-facts",
                  "place-value","fractions-compare","integer-ops","percent-of","one-step-eq"];
  for (const id of before) expect(findSkill(id), `skill ${id} was removed`).not.toBeNull();
});

it("offers each math skill at exactly one grade", () => {
  const spread = SKILLS.filter((s) => s.area === "math" && s.grades.length > 1);
  expect(spread.map((s) => s.id), "a math skill spanning grades means the map was not applied").toEqual([]);
});
```

- [ ] **Step 7: Delete `BAND_GRADES` and the band equivalence test from Task 1**

They were scaffolding for the refactor and are now actively misleading — the math table no longer
agrees with the bands, so the equivalence oracle would be asserting something false. Delete both.

**Do not touch `bandForHero` in `content-bands.ts`**: `src/lib/services/deeds.test.ts` uses it as the
oracle proving the subject-levels plan moved nobody, and that proof is still wanted. `nearestBands` is
production-dead and may be deleted along with its one `describe` in `content-bands.test.ts`.

- [ ] **Step 8: Run everything**

Run: `npx vitest run`, then `npx tsc --noEmit`, then `npm run build`
Expected: all pass. There is **one pre-existing lint error** at `quest-template-list.tsx:70` from
`main` — leave it, and do not let it hide a new one.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/skills.ts src/lib/utils/skills.test.ts src/lib/utils/drill-verify.test.ts src/lib/utils/content-bands.ts src/lib/utils/content-bands.test.ts
git commit -m "feat(skills): give every grade its own math" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: The `/dev/content` review page

Spec 6.5.3: a dev-only page where a grown-up picks a grade and a strand and sees every question with
its answer marked. For generated math it draws a sample, since the questions are infinite.

**Files:**
- Create: `src/app/dev/content/page.tsx`
- Test: `src/app/dev/content/page.test.tsx`

**Interfaces:**
- Consumes: `GENERATORS`, `seededRng` from `drill-generators`; `SKILLS`, `skillsFor` from `skills`;
  `GRADES` from `grade-levels`; `VERIFIERS` from `drill-verify`.
- Produces: nothing other modules use.

- [ ] **Step 1: Confirm how this repo gates dev-only routes**

There is no `src/app/dev/` route today, so you are setting the precedent. Two pages already gate
themselves with `notFound()` — `src/app/(app)/admin/feedback/page.tsx` and
`src/app/(app)/scrolls/[questId]/page.tsx`; read both and follow whichever fits. Gate on
`process.env.NODE_ENV !== "production"` and call `notFound()` otherwise —
**and write the test that proves the gate works**, because an ungated page leaks answer keys to any
child who guesses the URL. State in your report which you found and which you did.

- [ ] **Step 2: Build the page**

A client component is fine; there is no data to load. Controls: a grade select (K–12) and a strand
select (math / reading / language arts / science). For each skill at that grade and strand:

- the skill's id and label;
- for a generator skill, **five questions at each level 0–4** drawn from a fixed seed so the page is
  stable across reloads, each showing the prompt, all four choices with the answer marked, and the
  read-aloud text where present;
- for a pool skill, a note that authored pools arrive in the next plan — do not try to read the
  database from this page.

Show, beside each generated question, whether its verifier agrees. A disagreement should be loud
and red: it means a wrong answer key reached a page a parent is reading.

- [ ] **Step 3: Test what actually matters**

Not the layout — these three:

```ts
it("is not reachable in production", () => { /* per the gate found in Step 1 */ });

it("shows every math skill the map gives a grade", () => {
  // Render at grade 6; expect ratio-rate, frac-div, integer-ops, eval-expr and percent-of by label.
});

it("marks exactly one choice as the answer for every question it renders", () => {
  // The page's own rendering, not the generator's output — a page that marks the wrong
  // choice is worse than no page, because a parent would trust it.
});
```

- [ ] **Step 4: Run, prove they bite, commit**

Break the answer-marking so it marks `choices[0]` unconditionally; expect the third test to fail;
revert; record it.

```bash
git add src/app/dev/content
git commit -m "feat(dev): a page for checking a grade's questions by eye" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## What this plan deliberately does not do

- **Reading, Language Arts and Science.** They keep their band-derived grades from Task 1 and are
  untouched. A grade-6 child's reading still falls back to grade 3, exactly as it does today. Plan 3
  fixes that with authored pools; this plan must not make it worse and must not pretend to fix it.
- **The readability checks in spec 6.5.1.** They apply to authored prompts. Generated math prompts are
  templates with numbers substituted, so a readability score on them measures the template, not the
  content. Plan 3 owns that check.
- **The blind answer pass (6.5.2).** For generated math the verifier harness in Task 3 is the
  equivalent and is stronger, because it runs on every question ever generated rather than on a sample.
  Plan 3 owns the blind pass for authored items.
- **Any change to mastery, the deed stories, the Realm, or the spell schools.**

## Self-review

Checked after writing, against the spec and the map:

- **Spec coverage.** 6.2 (the map): Task 13 makes the code follow it, and the map itself already
  exists. 6.3 (math is generated, answers computed, three plausible distinct distractors, none equal
  to the answer): Tasks 3–12, with Task 3 as the enforcement. 6.5.3 (`/dev/content`): Task 14. 6.6
  (mastery preserved): Global Constraints plus Task 13 steps 4 and 6. 6.5.1 and 6.5.2 are explicitly
  deferred above with reasons.
- **Placeholder scan.** Every generator has its prompt shape, its level-indexed parameter table, its
  answer formula, its distractor strategy and its id key. Tasks 4–12 share one steps list rather than
  repeating it eleven times; that list is written out in full once, above Task 4.
- **Type consistency.** `Skill.grades: Grade[]` is introduced in Task 1 and used unchanged after.
  `Verifier = (q: Question) => string` is introduced in Task 3 and used unchanged after.
  `makeQuestion` is exported in Task 4, which is the first task that needs it.
- **Known risk, stated rather than hidden.** Task 13 is the only task that changes a child's content,
  and it changes it for every child at once. Its snapshot diff is the record; step 5 requires reading
  it rather than accepting it.
- **Counts.** The map has 64 skill rows; Task 13 step 1 asserts 64 and is instructed to stop rather
  than adjust if the map has changed. Eleven ids carry forward and Task 13 step 6 asserts all eleven
  still resolve.
