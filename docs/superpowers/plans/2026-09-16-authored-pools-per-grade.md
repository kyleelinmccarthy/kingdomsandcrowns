# Authored Pools Per Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every grade K–12 its own Reading, Language Arts and Science practice, authored and independently checked, so no child is ever handed another year's work.

**Architecture:** These three strands are **authored, not generated** — a person writes each question and its wrong answers, so there is no formula to verify against. The safety comes from three checks instead (spec §6.5): a validator that runs over every pool in CI, an **independent blind answer pass** where a second reader answers every question without seeing the key, and `/dev/content` extended so a parent can read a whole grade. The skill table moves from bands to grades exactly as math already did.

**Tech Stack:** TypeScript, Vitest, JSON pool files under `src/content/drills/`, seeded into `drill_item` by `npm run db:seed-drills`. No new dependencies. No schema migration.

**Spec:** `docs/superpowers/specs/2026-09-14-grade-appropriate-content-design.md` (§6.2, §6.4, §6.5, §6.6)
**Skill map:** `docs/content/ela-science-skill-map.md` — the authority for which skill belongs to which grade. Where this plan and the map disagree, **the map wins**; report the disagreement rather than silently picking one.
**Companion:** `docs/superpowers/plans/2026-09-15-math-generators-per-grade.md` did this job for math. Its hard-won rules are carried into Global Constraints below.

## Global Constraints

- **Never rename, reuse or delete a skill id.** `skill_mastery` is keyed by skill id; re-keying silently resets every child's practice history. Twelve pool skill ids exist today and all twelve keep their ids, their items and their grade assignment from the map.
- **Never delete an authored item.** A pool that stops being offered keeps its rows; a retired item simply stops being drawn.
- **Every item has exactly four choices**: one answer and three distractors, all distinct, with the answer never among the distractors.
- **Every item carries a `readAloud`.** A child using read-aloud support hears it literally, so it must be speakable English — no bare `- × ÷ % ¢ $ ² ³ √ π ^ /`, and no "5th" where "fifth" is meant.
- **A question a child can pass by looking is not a question.** This was found six times in the math plan and never once by a test: the answer must not be identifiable by length, by being the only one of its shape, by always sitting in the same place once sorted, or by being the only plausible-sounding option. The validator enforces the measurable parts (Task 2) and the blind pass catches the rest (Task 4).
- **Reading passages are two to four sentences.** They must fit the side-quest panel without scrolling.
- **`level` is 0–4**, easiest to hardest *within that grade*, and every pool must use the whole range.
- Run each git command on its own line; never chain with `&&`. **Never use `git stash`.**
- Every commit message ends with a second `-m` carrying exactly:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/content/drills/*.json` | **Create 27, modify 12.** One pool per strand per grade. The file's `band` field becomes `grade`. |
| `src/lib/utils/skills.ts` | **Modify.** The 12 carried skills get a single grade; 27 new skill rows are added. |
| `src/lib/content/pool-validate.ts` | **Create.** The pure validator: structure, distinctness, level spread, readability, surface tells. |
| `src/lib/content/pool-validate.test.ts` | **Create.** Runs the validator over every pool file in the repo, and tests the validator itself against known-bad fixtures. |
| `src/lib/db/seed-drills.ts` | **Modify.** Read `grade` instead of `band`; keep filling the `band` column from `bandForGrade` so the schema is untouched. |
| `src/app/dev/content/` | **Modify.** Render pool skills properly instead of the "arrives in a later plan" note. |

Twenty-seven new pool files is a lot of JSON, but they are data, not code: one file per grade per strand keeps each reviewable on its own and keeps a bad batch from touching a good one.

---

## Task 1: Move the three strands onto grades

A structural change with **no new content**. Every carried pool lands whole at the grade the map gives it, and the eleven grades with nothing yet keep falling back exactly as they do today — until Task 5 onwards fills them.

**Files:**
- Modify: `src/lib/utils/skills.ts`
- Modify: `src/content/drills/*.json` (the `band` field becomes `grade`)
- Modify: `src/lib/db/seed-drills.ts`
- Test: `src/lib/utils/skills.test.ts`

**Interfaces:**
- Consumes: `Grade`, `GRADES`, `bandForGrade` from `src/lib/utils/grade-levels.ts`.
- Produces: twelve pool skills each at exactly one grade, and a pool file format carrying `grade`.

- [ ] **Step 1: Write the map test first, before touching the table**

`skills.test.ts` already parses `math-skill-map.md` and asserts the math table matches it. Extend the
same mechanism to the new map. Read the existing math version and follow it — do not invent a second
parser.

```ts
it("serves exactly the ELA and science map's skills at every grade", () => {
  const expected = new Map<string, string[]>();
  for (const { grade, skillId, strand } of elaMapRows()) {
    const key = `${strand}:${grade}`;
    expected.set(key, [...(expected.get(key) ?? []), skillId].sort());
  }
  for (const area of ["reading", "language", "science"] as const) {
    for (const grade of GRADES) {
      expect(skillsFor(area, grade).map((s) => s.id).sort(), `${area} grade ${grade}`)
        .toEqual(expected.get(`${area}:${grade}`) ?? []);
    }
  }
});
```

Run it. **Expect failure**, naming every grade that does not yet match. If the map's row count is not
39 with 12 carried forward, **stop and report** — the map has changed since this plan was written and
needs a ruling, not an adjusted number.

- [ ] **Step 2: Give each carried skill its single grade**

Per the map: `sight-k1`→K, `sight-g23`→2, `spell-g23`→2, `spell-g45`→4, `vocab-g45`→5, `vocab-g68`→6,
`vocab-g912`→9, `science-k1`→K, `science-g23`→2, `science-g45`→4, `science-g68`→6, `science-g912`→9.
**Change only the `grades` field.** Ids, labels, areas and sources stay exactly as they are.

- [ ] **Step 3: Change the pool file format from band to grade**

Each of the twelve JSON files gets `"grade": "<G>"` in place of `"band": "<band>"`. Update the
`PoolFile` type in `seed-drills.ts`, and keep writing the `band` column from
`bandForGrade(pool.grade)` so the database schema needs no migration. Say in a comment that the column
is derived and no longer an axis.

- [ ] **Step 4: Prove the fallback got no worse**

This is the step that matters. Moving `sight-g23` from "grades 2 and 3" to "grade 2" means a grade-3
child now falls back to grade 2 — fine. But check the whole ladder:

```ts
it("never walks UP to find content, except where the map says a grade is still empty", () => {
  const climbs: string[] = [];
  for (const area of ["reading", "language", "science"] as const) {
    for (const grade of GRADES) {
      const served = chooseSkills({ area } as Deed, grade);
      for (const s of served) {
        const servedAt = s.grades[0];
        if (gradeIndex(servedAt) > gradeIndex(grade)) climbs.push(`${area} grade ${grade} climbs to ${servedAt}`);
      }
    }
  }
  expect(climbs.sort()).toEqual(EXPECTED_CLIMBS);
});
```

`EXPECTED_CLIMBS` is the honest inventory of where a child is still handed a harder grade's work,
**and it must shrink to `[]` by the end of this plan.** Write it out as a literal with a comment saying
so. Today it should contain the Language Arts K and grade-1 entries, and nothing else.

- [ ] **Step 5: Run everything, then commit**

`npx vitest run`, `npx tsc --noEmit`, `npm run build`. The Task 1 math snapshot in `skills.test.ts`
pins reading, language and science — **it will change in this task, and that is correct**, because the
grades those skills serve is exactly what is moving. Read the diff and check that no skill gained a
grade it should not have, then update it deliberately.

```bash
git add src/lib/utils/skills.ts src/lib/utils/skills.test.ts src/content/drills src/lib/db/seed-drills.ts
git commit -m "refactor(content): key the authored strands by grade, not by band" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The validator

Math's safety came from a verifier that recomputed every answer. Authored content has no formula to
recompute, so this is what stands in its place: everything about an item that **can** be checked
mechanically, run over every pool in the repo, in CI.

**Files:**
- Create: `src/lib/content/pool-validate.ts`
- Create: `src/lib/content/pool-validate.test.ts`

**Interfaces:**
- Consumes: the pool JSON shape; `GRADES` from `grade-levels`.
- Produces: `validatePool(pool): Problem[]` where `Problem = { itemId: string | null; rule: string; detail: string }`. An empty array means the pool passes. Later tasks import this.

- [ ] **Step 1: Write the rules**

Each rule gets its own named function so a failure says which rule broke:

1. **Four distinct choices.** Exactly three distractors; none equal to the answer; no two equal. Compare **trimmed and case-insensitively** — "Cat" and "cat" are the same choice to a child.
2. **No duplicate prompts within a pool**, compared the same way.
3. **Levels span 0–4.** Every level present, and no level holding more than half the pool.
4. **Pool size.** At least 40 items (a deed asks 8; the target is 45).
5. **Read-aloud present and speakable.** No banned character; no digit-ordinal like `5th`; not empty.
6. **Reading level within tolerance of the target grade.** Use Flesch–Kincaid grade level over the **prompt only** — never over an answer or distractor, which are often single words. Tolerance is **±2 grades**, and it applies from grade 2 up: K and 1 prompts are phonics and sight words, where the formula is meaningless. State the formula and the tolerance in a comment, per spec §6.5.1.
7. **No length tell.** The answer must not be the longest choice in more than 60% of a pool's items, nor the shortest in more than 60%. This is the authored twin of the position tell that appeared nineteen times in math, and it is the cheapest way a child games multiple choice.
8. **No "all of the above" or "none of the above"**, which are always either the answer or filler.

- [ ] **Step 2: Test the validator against known-bad fixtures, not against the real pools**

A validator tested only on content that passes proves nothing. Write one deliberately broken fixture
per rule and assert that rule fires **and that the others do not**. Then a final test runs
`validatePool` over every real file in `src/content/drills/` and expects no problems.

- [ ] **Step 3: Prove it bites on real content**

Break one real item in a real pool — make a distractor equal to its answer — and confirm the suite
fails naming that item id. Revert. **Record what failed.**

- [ ] **Step 4: Commit**

```bash
git add src/lib/content
git commit -m "test(content): check every authored pool for what a machine can see" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Fix what the validator finds in the existing pools

The twelve pools that exist were written against the old band scheme and have never faced these rules.
**Expect real failures.** This task is fixing them, and its report is the interesting part.

**Files:** Modify `src/content/drills/*.json` only.

- [ ] **Step 1: Run the validator and read every problem**

Do not fix anything yet. Write the full list into your report, grouped by rule, with counts. Rules 6
and 7 in particular may fire widely.

- [ ] **Step 2: Fix them, item by item**

Where an item is wrong, rewrite the item — do not weaken the rule. The one exception is **rule 6 on a
carried pool that is now at a lower grade than it was written for**, where a prompt may read slightly
above its new grade; if that is the only problem and it is within one grade of tolerance, record it
rather than dumbing the passage down.

**If a rule turns out to be wrong** — too strict, or measuring the wrong thing — say so and change the
rule, with the reason in a comment. A rule nobody can satisfy gets suppressed, which is worse than no
rule.

- [ ] **Step 3: Commit**

```bash
git add src/content/drills
git commit -m "fix(content): bring the existing pools up to the validator's rules" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The blind answer pass

Spec §6.5.2. The validator sees structure; **this is the only check that sees meaning.** An independent
reader answers every question without seeing the key, and anything where they disagree — or where two
options are defensible — is flagged.

This is the authored equivalent of math's independent verifier, and it is the reason authored content
can be trusted at all.

**Files:**
- Create: `src/lib/content/blind-pass.ts` — extracts every item into a key-free form for review, and
  reads a returned answer sheet back to compare.
- Create: `src/content/review/` — where answer sheets live, one per pool.

- [ ] **Step 1: Build the extractor**

Given a pool, emit each item as its prompt and four **shuffled** choices with no indication of which is
correct, in a stable order seeded by the item id so a re-run produces the same sheet.

- [ ] **Step 2: Build the comparator**

Given a pool and an answer sheet, report every item where the sheet's answer differs from the key, and
every item the sheet marked ambiguous. **A disagreement is not automatically a content bug** — the
reviewer can be wrong — but every one must be resolved by a person and recorded.

- [ ] **Step 3: Pin the workflow with a test**

The comparator must catch a wrong key. Build a fixture pool with a deliberately wrong answer, run a
sheet with the *right* answer against it, and assert the disagreement is reported.

- [ ] **Step 4: Run the blind pass over the twelve existing pools**

They have never had one. Record every disagreement and resolve each. **Report how many items were
checked and how many were wrong** — that number is the honest measure of what authored content costs.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content src/content/review
git commit -m "test(content): answer every question blind, and compare" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Tasks 5–11: Write the content

Twenty-seven new pools, about 1,215 questions. Each task below takes a group, and **every task follows
the same five steps**, written out once here:

1. **Write the pool file** at `src/content/drills/<poolId>.json`, with `grade`, and 45 items each
   carrying `id`, `prompt`, `answer`, `distractors` (3), `readAloud`, `level` (0–4).
2. **Add the skill row** to `skills.ts` with the id and grade the map gives it.
3. **Run the validator.** `npx vitest run src/lib/content` must pass with no problems for your pools.
4. **Run the blind pass** over what you wrote, and resolve every disagreement.
5. **Run the full gates** and commit.

**On writing the wrong answers.** This is the part that decides whether a question teaches anything.
A distractor should be what a child who misunderstands *actually* picks — the opposite process, the
commonly confused word, the plausible-but-unsupported inference. Three near-identical fillers make a
question that tests nothing and gives itself away. Vary the length of the answer against the
distractors deliberately: the validator checks that the answer is not usually the longest or shortest,
and that rule is there because it is the cheapest way a child games multiple choice.

**On levels.** Level 0 must be genuinely approachable by a child at the *start* of that grade, and
level 4 stretching by its end. Spread the 45 items across all five.

| Task | Strand | Grades | Pools |
|---|---|---|---|
| 5 | Reading | 1, 3, 4 | `read-g1`, `read-g3`, `read-g4` |
| 6 | Reading | 5, 6, 7 | `read-g5`, `read-g6`, `read-g7` |
| 7 | Reading | 8, 9, 10, 11, 12 | `read-g8`…`read-g12` |
| 8 | Language Arts | K, 1, 3 | `lang-gk`, `lang-g1`, `lang-g3` |
| 9 | Language Arts | 7, 8, 10, 11, 12 | `lang-g7`, `lang-g8`, `lang-g10`, `lang-g11`, `lang-g12` |
| 10 | Science | 1, 3, 5 | `science-g1`, `science-g3`, `science-g5` |
| 11 | Science | 7, 8, 10, 11, 12 | `science-g7`, `science-g8`, `science-g10`, `science-g11`, `science-g12` |

Each task's grades and topics come from `docs/content/ela-science-skill-map.md`. **Read the map row for
each grade you write** — it names the standard, and the standard is what the questions must actually
practise.

**Language Arts K and grade 1 are the most important pools in this plan.** They are what stops a
kindergartener being handed grade 2–3 spelling, which is happening today.

---

## Task 12: Render pools on `/dev/content`

`/dev/content` currently shows math properly and a "authored pools arrive in a later plan" note for the
other three strands. Now they exist.

**Files:** Modify `src/app/dev/content/`.

- [ ] **Step 1** — render each pool skill's items: prompt, all four choices with the answer marked,
  the read-aloud text, and the level. Reading passages are long, so lay them out so a parent can scan
  forty questions quickly rather than beautifully.
- [ ] **Step 2** — show the validator's verdict per pool, loudly if it fails.
- [ ] **Step 3** — extend the existing test that the page marks exactly one choice as the answer, and
  which choice, to cover a pool skill.
- [ ] **Step 4** — prove it bites, then commit.

---

## Task 13: Close the fallback

**Files:** Modify `src/lib/utils/deed-engine.ts` (comment only) and `src/lib/utils/skills.test.ts`.

- [ ] **Step 1: Empty the climb inventory**

`EXPECTED_CLIMBS` from Task 1 step 4 must now be `[]` — every grade in every strand has its own
content, so nothing walks upward. Assert exactly that, and delete the literal.

- [ ] **Step 2: Correct the docblock that was false**

`chooseSkills` says `nearestGrades` walks "easier grades first, so a hero is never handed harder work
than their own grade." That became true for math when math filled every grade; it becomes true for
everything here. Rewrite it to say what is now the case, and note that it holds **because** every
strand has content at every grade — so the next strand added without full coverage breaks it again.

- [ ] **Step 3: Re-seed and check by hand**

```bash
npm run db:seed-drills
```
Then load `/dev/content`, pick grade K and Language Arts, and read it. Confirm a kindergartener now
gets kindergarten work.

- [ ] **Step 4: Commit**

---

## What this plan deliberately does not do

- **Change math.** It is done.
- **Split an existing band pool item by item across grades.** Each carried pool lands whole at the
  lowest grade of its old band (§the map).
- **Add a second skill per strand per grade.** One pool of 45 against a deed of 8 is enough variety.
- **Generate reading passages.** They are authored; that is the point.

## Testing

- **Validator:** every rule tested against a deliberately broken fixture, and the whole corpus checked in CI.
- **Blind pass:** every item answered without the key before its pool ships; disagreements resolved by a person.
- **Structural:** the skill table matches the map; every grade in every strand has content; nothing walks upward.
- **Mastery:** all twelve carried skill ids still resolve, each at exactly one grade.
- **Copy:** no child-facing string names a level (the existing rule from the subject-levels plan).

## Self-review

- **Spec coverage.** §6.2 the map exists and Task 1 binds the code to it; §6.4 Tasks 5–11 with the shapes the spec names (phonics at K–1, passages from grade 2, grammar/conventions/spelling/vocabulary for Language Arts); §6.5.1 Task 2; §6.5.2 Task 4; §6.5.3 Task 12; §6.6 Global Constraints plus Task 1 step 2.
- **Placeholder scan.** Tasks 5–11 share one steps list written out in full once. Every pool names its grade, its skill id and its standard via the map.
- **Type consistency.** `Problem` is introduced in Task 2 and used unchanged. The pool file's `grade` replaces `band` in Task 1, before any new pool is written.
- **Known risk, stated.** This plan's safety rests on the blind pass, which is a *person reading*, not a formula. Task 4 step 4 runs it over the existing pools first precisely so the cost is known before 1,215 new questions depend on it.
