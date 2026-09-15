# Subject levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each child a grade per subject strand, set by a parent as a gap from their own grade, and make the side-quest engine ask for content by grade rather than by one band for everything.

**Architecture:** A pure grade model (`src/lib/utils/grade-levels.ts`) carries the whole rule: grades K–12, an offset per strand, clamping, and the easier-first walk. Four integer columns on `learning_profile` store the offsets. The deed engine starts asking for a *grade per area* instead of one band per hero. Until the content plans land, a thin adapter maps a grade to the band that covers it, so today's 572 items keep working unchanged — and a parent's setting takes effect immediately, because moving Noah's math to grade 4 reaches the grades 4–5 band where multiplication lives.

**Tech Stack:** Next.js 16 App Router (RSC, server actions), React 19 + React Compiler, Drizzle + @libsql, Vitest + Testing Library (jsdom), Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-09-14-grade-appropriate-content-design.md](../specs/2026-09-14-grade-appropriate-content-design.md) — this plan implements §4 and §5 only. Math generators (§6.3) are plan 2; authored pools (§6.4–§6.6) are plan 3.

## Global Constraints

- **Grades are `"K"` and `"1"`–`"12"`.** `"K"` sorts as index 0. Never store or display a negative grade.
- **The stored value is an OFFSET, not a grade.** `effectiveGrade(childGrade, offset) = clamp(childGrade + offset, K, 12)`. Promotion must need no code path of its own.
- **The stored offset is never clamped on write.** Only the derived grade clamps, so a later promotion can bring an out-of-range offset back into range.
- **Four strands: `math`, `reading`, `language`, `science`.** These are the existing `SkillArea` ids and they do **not** change. Only the *label* for `language` changes, to "Language Arts".
- **Nothing child-facing ever says "behind", "ahead", or names a level.** A child below grade level simply receives work that fits. This is a firm rule, not a preference.
- **Parent-only.** The server action refuses a child's own account and a view-only family member, matching `updateRealmSettings`.
- **The panel binds displayed values straight to saved data — never copies them into `useState`.** Commit `8d07be4` fixed a bug where panels copied a child's values into state and wrote that copy onto a sibling after a switch. Follow `realm-settings-panel.tsx`'s depth control.
- **Existing skill ids are preserved.** Mastery rows are keyed by skill id; re-keying resets a child's progress.
- **`drill_item.band` is NOT touched in this plan.** The grade→band adapter keeps today's content working; plan 3 replaces it.
- **`"use server"` files export only async functions** — never `export type { X }`.
- **Migrations:** edit `src/lib/db/schema.ts`, then `npm run db:generate`, then `npm run db:migrate`. Never hand-write the SQL. A constant-default `ADD COLUMN` is the safe shape; confirm that is what was generated.
- **Git:** branch `realm-foundations`. Each git command on its own line, never chained with `&&`. Never use `git stash`. Every commit ends with a second `-m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`.
- **Baselines:** `npm test` 113 files / 1189 tests passing; `npx tsc --noEmit` clean; `npm run lint` exactly ONE error, the pre-existing `src/components/quest-template-list.tsx:70`, which comes from `main`.

---

## A note on the described steps

Tasks 3 and 5 edit existing multi-line functions (`chooseSkills`, `loadHeroBand`, the child detail's render). Those steps name the exact symbol, the exact change and the exact call site, but they do **not** transcribe a replacement body, because the surrounding code is long and an invented line is worse than a precise instruction. Every new file, column, action and selector in this plan *is* given verbatim.

If a step's described change does not match what you find — a different signature, an extra caller, a name that has moved — **stop and report it** rather than guessing. The plan's line numbers were read on 2026-09-15 at commit `dd9e711`.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/lib/utils/grade-levels.ts` | The whole pure rule: grades, offsets, clamping, the easier-first walk, the age estimate, and the parent-facing gap label. No React, no database. |
| `src/lib/utils/grade-levels.test.ts` | Its tests. |
| `src/app/(app)/settings/subject-levels-panel.tsx` | The parent panel. |
| `src/app/(app)/settings/subject-levels-panel.test.tsx` | Its tests. |
| `src/lib/db/migrations/0028_*.sql` | Four offset columns, generated. |

**Modify:**

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Four offset columns on `learning_profile`. |
| `src/lib/utils/learning-profile.ts` | `subjectOffsets` on the profile type, its default, its row coercion, its patch validation. |
| `src/lib/actions/learning-profile.ts` | `setSubjectOffset`. |
| `src/lib/services/deeds.ts` | `loadHeroBand` becomes `loadHeroLevels`, carrying a grade per area. |
| `src/lib/actions/deeds.ts` | Pass the area's grade to `chooseSkills`. |
| `src/lib/utils/deed-engine.ts` | `chooseSkills` takes a grade and walks nearest grades. |
| `src/lib/utils/skills.ts` | `skillsFor` takes a grade; the `language` label becomes "Language Arts". |
| `src/app/(app)/settings/child-list.tsx` | Render the panel; pass the offsets through. |

---

## Task 1: The grade model

**Files:**
- Create: `src/lib/utils/grade-levels.ts`, `src/lib/utils/grade-levels.test.ts`

**Interfaces:**
- Consumes: `ContentBand` and `CONTENT_BANDS` from `src/lib/utils/content-bands.ts`.
- Produces:
  - `type Grade = "K" | "1" | ... | "12"`, `const GRADES: Grade[]` (14 entries, K first)
  - `gradeIndex(g: Grade): number`, `gradeAt(i: number): Grade`
  - `type SubjectOffsets = { math: number; reading: number; language: number; science: number }`
  - `const NO_OFFSETS: SubjectOffsets` (all zero)
  - `effectiveGrade(childGrade: Grade, offset: number): Grade`
  - `estimateGrade(birthYear: number | null, today: Date): Grade | null`
  - `nearestGrades(g: Grade): Grade[]` — the grade, then each below nearest-first, then each above
  - `bandForGrade(g: Grade): ContentBand` — the adapter this plan needs
  - `gapLabel(childGrade: Grade, offset: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/grade-levels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  GRADES, gradeIndex, gradeAt, effectiveGrade, estimateGrade,
  nearestGrades, bandForGrade, gapLabel, NO_OFFSETS,
} from "./grade-levels";

describe("the grade ladder", () => {
  it("runs K through 12 with K at the bottom", () => {
    expect(GRADES).toHaveLength(13); // K plus 1-12
    expect(GRADES[0]).toBe("K");
    expect(GRADES.at(-1)).toBe("12");
    expect(gradeIndex("K")).toBe(0);
    expect(gradeIndex("3")).toBe(3);
    expect(gradeAt(0)).toBe("K");
    expect(gradeAt(6)).toBe("6");
  });

  it("starts every strand at grade level", () => {
    expect(NO_OFFSETS).toEqual({ math: 0, reading: 0, language: 0, science: 0 });
  });
});

describe("effectiveGrade", () => {
  it("is the child's own grade when the offset is zero", () => {
    expect(effectiveGrade("3", 0)).toBe("3");
  });

  it("moves up and down by the gap", () => {
    expect(effectiveGrade("3", 1)).toBe("4");
    expect(effectiveGrade("6", -2)).toBe("4");
  });

  it("clamps at both ends rather than inventing a grade", () => {
    expect(effectiveGrade("1", -5)).toBe("K");
    expect(effectiveGrade("11", 9)).toBe("12");
  });

  it("keeps the gap through a promotion, which is the whole point of storing an offset", () => {
    // Noah at grade 3 with +1 math is doing grade 4. Promote him and he is doing grade 5,
    // with nothing but his grade having changed.
    expect(effectiveGrade("3", 1)).toBe("4");
    expect(effectiveGrade("4", 1)).toBe("5");
  });

  it("brings a clamped offset back into range after a promotion, because the offset itself is never clamped", () => {
    expect(effectiveGrade("K", -2)).toBe("K");
    expect(effectiveGrade("3", -2)).toBe("1");
  });
});

describe("estimateGrade", () => {
  it("estimates age minus five for a child with only a birth year", () => {
    expect(estimateGrade(2018, new Date("2026-09-15"))).toBe("3");
    expect(estimateGrade(2015, new Date("2026-09-15"))).toBe("6");
  });

  it("clamps a very young or very old estimate onto the ladder", () => {
    expect(estimateGrade(2024, new Date("2026-09-15"))).toBe("K");
    expect(estimateGrade(1990, new Date("2026-09-15"))).toBe("12");
  });

  it("has nothing to estimate from without a birth year", () => {
    expect(estimateGrade(null, new Date("2026-09-15"))).toBeNull();
  });
});

describe("nearestGrades", () => {
  it("offers the grade itself, then easier ones nearest first, then harder", () => {
    expect(nearestGrades("2")).toEqual(["2", "1", "K", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });

  it("covers every grade exactly once, from any starting point", () => {
    for (const g of GRADES) {
      const walk = nearestGrades(g);
      expect(new Set(walk).size).toBe(GRADES.length);
      expect(walk[0]).toBe(g);
    }
  });
});

describe("bandForGrade", () => {
  it("maps each grade onto the band that covers it", () => {
    expect(bandForGrade("K")).toBe("k1");
    expect(bandForGrade("1")).toBe("k1");
    expect(bandForGrade("3")).toBe("g23");
    expect(bandForGrade("4")).toBe("g45");
    expect(bandForGrade("6")).toBe("g68");
    expect(bandForGrade("8")).toBe("g68");
    expect(bandForGrade("9")).toBe("g912");
    expect(bandForGrade("12")).toBe("g912");
  });

  it("covers every grade, so no grade can fall through", () => {
    for (const g of GRADES) expect(bandForGrade(g)).toBeTruthy();
  });
});

describe("gapLabel", () => {
  it("names the level and the gap the way a parent reads it", () => {
    expect(gapLabel("3", 0)).toBe("Grade 3 · at grade level");
    expect(gapLabel("3", 1)).toBe("Grade 4 · 1 ahead");
    expect(gapLabel("6", -1)).toBe("Grade 5 · 1 behind");
    expect(gapLabel("6", -2)).toBe("Grade 4 · 2 behind");
  });

  it("says where the ladder ends rather than showing an impossible gap", () => {
    expect(gapLabel("1", -5)).toBe("Grade K · the lowest level");
    expect(gapLabel("11", 9)).toBe("Grade 12 · the highest level");
  });

  it("never uses a word a child must not read about themselves", () => {
    // This label is parent-only. The test pins the vocabulary so a later edit cannot
    // quietly leak it into a child-facing surface with different words.
    expect(gapLabel("3", 0)).not.toMatch(/struggling|remedial|slow/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/utils/grade-levels.test.ts`
Expected: FAIL — `Cannot find module './grade-levels'`.

- [ ] **Step 3: Write the module**

Create `src/lib/utils/grade-levels.ts`:

```ts
import type { ContentBand } from "./content-bands";

/** K-12 as a ladder. K is index 0, so an offset is plain integer arithmetic. */
export const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export type Grade = (typeof GRADES)[number];

export type SubjectOffsets = { math: number; reading: number; language: number; science: number };
export const NO_OFFSETS: SubjectOffsets = { math: 0, reading: 0, language: 0, science: 0 };

export function gradeIndex(g: Grade): number {
  return GRADES.indexOf(g);
}

export function gradeAt(i: number): Grade {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, i))];
}

/**
 * The grade a strand is actually taught at. The OFFSET is what is stored, so a promotion
 * changes the child's grade and nothing else: "+1 math" follows them up the ladder by
 * itself. Only this derived grade clamps — the stored offset is left alone, so a child
 * clamped at K climbs back into range when they are promoted.
 */
export function effectiveGrade(childGrade: Grade, offset: number): Grade {
  return gradeAt(gradeIndex(childGrade) + Math.trunc(offset));
}

/** A child with only a birth year: roughly age minus five, on the ladder. Shown as estimated. */
export function estimateGrade(birthYear: number | null, today: Date): Grade | null {
  if (birthYear === null || !Number.isFinite(birthYear)) return null;
  return gradeAt(today.getFullYear() - birthYear - 5);
}

/** The grade, then each easier one nearest-first, then each harder one. Never handed harder work first. */
export function nearestGrades(g: Grade): Grade[] {
  const i = gradeIndex(g);
  const below = GRADES.slice(0, i).slice().reverse();
  const above = GRADES.slice(i + 1);
  return [g, ...below, ...above];
}

/**
 * Today's content is authored per band, so a grade has to reach the band that covers it.
 * This is the one bridge between the new grade axis and the old content, and it exists
 * only until the content plans key items by grade.
 */
export function bandForGrade(g: Grade): ContentBand {
  const i = gradeIndex(g);
  if (i <= 1) return "k1";
  if (i <= 3) return "g23";
  if (i <= 5) return "g45";
  if (i <= 8) return "g68";
  return "g912";
}

/** Parent-facing. Never rendered anywhere a child can read it. */
export function gapLabel(childGrade: Grade, offset: number): string {
  const grade = effectiveGrade(childGrade, offset);
  const actual = gradeIndex(grade) - gradeIndex(childGrade);
  if (actual !== Math.trunc(offset)) {
    return `Grade ${grade} · the ${gradeIndex(grade) === 0 ? "lowest" : "highest"} level`;
  }
  if (actual === 0) return `Grade ${grade} · at grade level`;
  return `Grade ${grade} · ${Math.abs(actual)} ${actual > 0 ? "ahead" : "behind"}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/utils/grade-levels.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Confirm the label rule holds by mutation**

Change `gapLabel`'s clamp branch to return the plain gap instead, re-run, and confirm the two clamp cases fail. Restore. Say in your report that you did — this is the branch a parent sees when a child is at either end of the ladder, and nothing else covers it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/grade-levels.ts src/lib/utils/grade-levels.test.ts
git commit -m "feat(content): a grade ladder with a per-strand gap" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Store the offsets

**Files:**
- Modify: `src/lib/db/schema.ts` (the `learningProfile` table), `src/lib/utils/learning-profile.ts`, `src/lib/actions/learning-profile.ts`
- Create: `src/lib/db/migrations/0028_*.sql` (generated)
- Test: `src/lib/utils/learning-profile.test.ts`

**Interfaces:**
- Consumes: `SubjectOffsets`, `NO_OFFSETS` from Task 1.
- Produces: `LearningProfile.subjectOffsets: SubjectOffsets`; the server action `setSubjectOffset(childId: string, area: "math" | "reading" | "language" | "science", offset: number): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/utils/learning-profile.test.ts`:

```ts
it("starts every strand at grade level", () => {
  expect(DEFAULT_LEARNING_PROFILE.subjectOffsets).toEqual({ math: 0, reading: 0, language: 0, science: 0 });
});

it("reads the offsets off a row", () => {
  const row = { ...ROW, mathOffset: 1, readingOffset: -2, languageOffset: 0, scienceOffset: 3 };
  expect(profileFromRow(row).subjectOffsets).toEqual({ math: 1, reading: -2, language: 0, science: 3 });
});

it("falls back to grade level for a corrupt or missing offset", () => {
  const row = { ...ROW, mathOffset: null as unknown as number, readingOffset: 1.5 };
  expect(profileFromRow(row).subjectOffsets.math).toBe(0);
  expect(profileFromRow(row).subjectOffsets.reading).toBe(0);
});
```

`ROW` is the file's existing row fixture; add the four offset fields to it as `0`. If the file has no such fixture, create one from `DEFAULT_LEARNING_PROFILE`'s shape and say so in your report.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/utils/learning-profile.test.ts`
Expected: FAIL — `subjectOffsets` is undefined.

- [ ] **Step 3: Add the columns**

In `src/lib/db/schema.ts`, in `learningProfile` after `inputMode`:

```ts
    // How far each strand sits from the child's own grade. 0 is at grade level. Stored as a
    // gap, not a grade, so a promotion carries it up the ladder with no code path of its own.
    mathOffset: integer("math_offset").notNull().default(0),
    readingOffset: integer("reading_offset").notNull().default(0),
    languageOffset: integer("language_offset").notNull().default(0),
    scienceOffset: integer("science_offset").notNull().default(0),
```

- [ ] **Step 4: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Open the generated `src/lib/db/migrations/0028_*.sql` and confirm it is exactly four constant-default `ADD COLUMN` statements and nothing else. That shape does not rewrite the table, so it is safe forward on a populated database.

- [ ] **Step 5: Thread it through the profile util**

In `src/lib/utils/learning-profile.ts`: add `subjectOffsets: SubjectOffsets` to `LearningProfile`; `subjectOffsets: NO_OFFSETS` to `DEFAULT_LEARNING_PROFILE`; and in `profileFromRow` read the four columns through a guard:

```ts
const offset = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : 0);
```

so a corrupt or fractional stored value falls back to grade level rather than reaching the engine.

- [ ] **Step 6: Add the action**

In `src/lib/actions/learning-profile.ts`, matching the parent-only shape of `updateRealmSettings`:

```ts
const AREAS = ["math", "reading", "language", "science"] as const;

/** A grown-up moves one strand away from the child's grade. Never the hero themselves. */
export async function setSubjectOffset(childId: string, area: (typeof AREAS)[number], offset: number): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can set subject levels.");
  if (!AREAS.includes(area)) throw new Error("That subject doesn't look right.");
  if (!Number.isInteger(offset) || Math.abs(offset) > GRADES.length) throw new Error("That level doesn't look right.");
  const column = { math: "mathOffset", reading: "readingOffset", language: "languageOffset", science: "scienceOffset" } as const;
  await db
    .update(schema.learningProfile)
    .set({ [column[area]]: offset, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
}
```

Import whatever `getLearningProfile` already uses to create a missing row, and call it first, so a child with no profile row still gets their offset saved.

- [ ] **Step 7: Gates**

```bash
npx vitest run src/lib/utils/learning-profile.test.ts
npx tsc --noEmit
```
Expected: PASS; clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations src/lib/utils/learning-profile.ts src/lib/utils/learning-profile.test.ts src/lib/actions/learning-profile.ts
git commit -m "feat(content): store a per-strand gap on the learning profile" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The engine asks by grade, per area

**Files:**
- Modify: `src/lib/utils/skills.ts`, `src/lib/utils/deed-engine.ts`, `src/lib/services/deeds.ts`, `src/lib/actions/deeds.ts`
- Test: `src/lib/utils/deed-engine.test.ts`

**Interfaces:**
- Consumes: `Grade`, `nearestGrades`, `bandForGrade`, `effectiveGrade`, `SubjectOffsets` from Task 1; `LearningProfile.subjectOffsets` from Task 2.
- Produces:
  - `skillsFor(area: SkillArea, grade: Grade): Skill[]`
  - `chooseSkills(deed: Deed, grade: Grade): Skill[]`
  - `loadHeroLevels(childId): Promise<{ grades: Record<SkillArea, Grade>; enabled: boolean; tone: "gentle" | "monsters" }>` replacing `loadHeroBand`

**The one thing to get right:** this task changes the *axis*, not the content. `skillsFor` keeps matching today's band-keyed `SKILLS` by mapping the grade through `bandForGrade`. Behaviour for a child at grade level is identical — grade 6 maps to `g68`, the same skills as before. What changes is that a parent's offset now reaches the engine, so Noah at grade 3 with "+1 math" maps to `g45` and finally sees multiplication.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/utils/deed-engine.test.ts`:

```ts
import { chooseSkills } from "./deed-engine";
import { findDeed } from "./deeds";

const mathDeed = findDeed("well-stones")!;   // area: "math"
const readingDeed = findDeed("well-signs")!; // area: "reading"

describe("chooseSkills by grade", () => {
  it("gives a grade-3 hero the skills their grade's content is authored for", () => {
    const ids = chooseSkills(mathDeed, "3").map((s) => s.id);
    expect(ids).toContain("add-20");
  });

  it("reaches multiplication when a grown-up moves a grade-3 hero's math up a year", () => {
    // The whole point of the setting: this is unreachable for grade 3 today.
    const ids = chooseSkills(mathDeed, "4").map((s) => s.id);
    expect(ids).toContain("mul-facts");
  });

  it("walks to easier grades, never harder, when a grade has nothing", () => {
    // Reading is authored no higher than grade 3 right now, so a grade-6 hero falls back
    // rather than being handed nothing. Plan 3 removes the need for this.
    const ids = chooseSkills(readingDeed, "6").map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("sight-g23");
  });

  it("returns nothing rather than throwing when an area has no content at all", () => {
    expect(() => chooseSkills(mathDeed, "K")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/utils/deed-engine.test.ts`
Expected: FAIL — `chooseSkills` takes a band, so `"3"` matches nothing.

- [ ] **Step 3: Make `skillsFor` take a grade**

In `src/lib/utils/skills.ts`:

```ts
export function skillsFor(area: SkillArea, grade: Grade): Skill[] {
  const band = bandForGrade(grade);
  return SKILLS.filter((s) => s.area === area && s.band === band);
}
```

Leave `SKILLS` and every skill id exactly as they are. Mastery rows are keyed by skill id and re-keying would reset every child's progress.

- [ ] **Step 4: Make `chooseSkills` walk grades**

In `src/lib/utils/deed-engine.ts`, change the signature to `chooseSkills(deed: Deed, grade: Grade)` and the loop to `for (const g of nearestGrades(grade))`. Keep the rest of the body — the generator-and-pool pick and the fallback comment — unchanged.

- [ ] **Step 5: Load a grade per area**

In `src/lib/services/deeds.ts`, replace `loadHeroBand` with `loadHeroLevels`. It reads the child's `grade`, `birthYear` and `ageMode`, and the learning profile's `subjectOffsets`, then:

- the child's own grade is their `grade` when set, else `estimateGrade(birthYear, new Date())`, else `"3"` as a last resort for a hero with neither;
- each area's grade is `effectiveGrade(ownGrade, subjectOffsets[area])`.

Return `{ grades, enabled, tone }`. Keep `HeroBand`'s other two fields exactly as they are so `loadKingdomOverview` and the Realm bundle need no change beyond the rename.

- [ ] **Step 6: Pass the area's grade at the call site**

In `src/lib/actions/deeds.ts`, `const skills = chooseSkills(deed, hero.grades[deed.area]);`, and rename the `loadHeroBand` import and its other use.

- [ ] **Step 7: Gates**

```bash
npx vitest run src/lib/utils src/lib/services
npx tsc --noEmit
npm test
```
Expected: PASS. Existing deed-engine tests that pass a band will fail to typecheck — **update them to pass the equivalent grade** (`"g23"` becomes `"3"`, `"g68"` becomes `"6"`), and list each one you changed in your report. Do not widen a signature to accept both.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/skills.ts src/lib/utils/deed-engine.ts src/lib/utils/deed-engine.test.ts src/lib/services/deeds.ts src/lib/actions/deeds.ts
git commit -m "feat(content): pick side-quest skills by grade, per subject" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The Subject Levels panel

**Files:**
- Create: `src/app/(app)/settings/subject-levels-panel.tsx`, `src/app/(app)/settings/subject-levels-panel.test.tsx`

**Interfaces:**
- Consumes: `Grade`, `GRADES`, `effectiveGrade`, `gradeIndex`, `gapLabel`, `SubjectOffsets` from Task 1; `setSubjectOffset` from Task 2.
- Produces: `<SubjectLevelsPanel childId={string} childGrade={Grade} estimated={boolean} offsets={SubjectOffsets} />`.

**The strands, in this order and grouping:** Math; then an **ELA** heading containing **Reading** and **Language Arts**; then Science.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const setSubjectOffset = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/learning-profile", () => ({ setSubjectOffset: (...a: unknown[]) => setSubjectOffset(...a) }));

import { SubjectLevelsPanel } from "./subject-levels-panel";

afterEach(() => { cleanup(); setSubjectOffset.mockClear(); });

const props = {
  childId: "c1",
  childGrade: "3" as const,
  estimated: false,
  offsets: { math: 0, reading: 0, language: 0, science: 0 },
};

describe("SubjectLevelsPanel", () => {
  it("shows every strand at grade level, grouped with reading and language arts under ELA", () => {
    render(<SubjectLevelsPanel {...props} />);
    expect(screen.getByText("ELA")).toBeInTheDocument();
    for (const label of ["Math", "Reading", "Language Arts", "Science"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Grade 3 · at grade level")).toHaveLength(4);
  });

  it("hides the grade picker until a grown-up says the strand is not at grade level", () => {
    render(<SubjectLevelsPanel {...props} />);
    expect(screen.queryByLabelText("Math level")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /math is not at grade level/i }));
    expect(screen.getByLabelText("Math level")).toBeInTheDocument();
  });

  it("saves the gap, not the grade, so a promotion carries it", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, math: 1 }} />);
    fireEvent.change(screen.getByLabelText("Math level"), { target: { value: "5" } });
    expect(setSubjectOffset).toHaveBeenCalledWith("c1", "math", 2);
  });

  it("returns a strand to grade level when the toggle goes off", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, reading: -1 }} />);
    fireEvent.click(screen.getByRole("switch", { name: /reading is not at grade level/i }));
    expect(setSubjectOffset).toHaveBeenCalledWith("c1", "reading", 0);
  });

  it("shows the saved value rather than a copy, so switching children cannot write one child's levels onto another", () => {
    const { rerender } = render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, math: 1 }} />);
    expect(screen.getByText("Grade 4 · 1 ahead")).toBeInTheDocument();
    rerender(<SubjectLevelsPanel {...props} childId="c2" childGrade="6" offsets={props.offsets} />);
    expect(screen.getByText("Grade 4 · 1 ahead")).not.toBeInTheDocument();
    expect(screen.getAllByText("Grade 6 · at grade level")).toHaveLength(4);
  });

  it("says a grade is estimated when the hero has only a birth year", () => {
    render(<SubjectLevelsPanel {...props} estimated={true} />);
    expect(screen.getByText(/estimated grade 3 from age/i)).toBeInTheDocument();
  });

  it("never uses a word about the child that a child should not read", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ math: -2, reading: 0, language: 0, science: 0 }} />);
    expect(document.body.textContent).not.toMatch(/struggling|remedial|slow|failing/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/(app)/settings/subject-levels-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the panel**

Follow `realm-settings-panel.tsx` exactly for its save shape: a `run()` helper holding `busy` and `error`, each control's value derived from props, no `useState` copy of any incoming value, and `router.refresh()` after a successful write. The only local state permitted is `busy` and `error`.

The grade picker is a `<select>` of `GRADES` labelled `${label} level`, whose value is the strand's effective grade. On change it computes the offset as `gradeIndex(picked) - gradeIndex(childGrade)` and calls `setSubjectOffset`. The toggle is a `Switch` named `${label} is not at grade level`; switching it off calls `setSubjectOffset(childId, area, 0)`.

Each strand renders `gapLabel(childGrade, offsets[area])`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app/(app)/settings/subject-levels-panel.test.tsx`
Expected: PASS, all seven.

- [ ] **Step 5: Prove the no-copy rule by mutation**

Add a `useState` seeded from `offsets`, render from it, re-run, and confirm the switching test fails. Restore. Say so in your report. That test is the guard against the bug `8d07be4` fixed, and it is worthless if it would pass against a copy.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/settings/subject-levels-panel.tsx" "src/app/(app)/settings/subject-levels-panel.test.tsx"
git commit -m "feat(settings): a grown-up sets a level per subject" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the panel in, and rename Language to Language Arts

**Files:**
- Modify: `src/app/(app)/settings/child-list.tsx`, `src/app/(app)/settings/page.tsx`, `src/lib/utils/skills.ts`
- Test: `src/app/(app)/settings/child-list.test.tsx`

**Interfaces:**
- Consumes: `<SubjectLevelsPanel>` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Render the panel**

In `child-list.tsx`, beside `<LearningProfilePanel childId={child.id} profile={child.learningProfile} />` (around line 470), render `<SubjectLevelsPanel>` for a grown-up only — the same `!isChildView` gate the other parent panels use. Its `childGrade` is the child's grade when set, otherwise the age estimate, with `estimated` true in that case. Pass `child.learningProfile?.subjectOffsets ?? NO_OFFSETS`.

If `Child` in that file needs the offsets, they arrive with `learningProfile`, which `settings/page.tsx` already loads — confirm the page selects the new columns and add them if it maps fields explicitly.

- [ ] **Step 2: Rename the label**

In `src/lib/utils/skills.ts`, `AREA_META.language.label` becomes `"Language Arts"`. **Do not touch the `language` id** — `SkillArea`, `AREA_SCHOOL`, every deed's `area`, and existing mastery rows all key off it.

- [ ] **Step 3: Add a test that a child's subject chip and a parent's setting use the same word**

```ts
import { AREA_META } from "@/lib/utils/skills";
it("calls the strand Language Arts everywhere a person reads it", () => {
  expect(AREA_META.language.label).toBe("Language Arts");
});
```

Put it in `src/lib/utils/skills.test.ts` if one exists, otherwise create it.

- [ ] **Step 4: Gates**

```bash
npx tsc --noEmit
npx eslint <files you touched>
npm test
```
Expected: clean; all passing. Any test asserting the old `"Language"` label must be updated to `"Language Arts"` — list them in your report.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings" src/lib/utils/skills.ts
git commit -m "feat(settings): show subject levels on a hero, and name the strand Language Arts" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The acceptance pass

**Files:** none, unless a check fails.

- [ ] **Step 1: The repo gates**

```bash
git branch --show-current
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: `realm-foundations`; all tests passing; typecheck clean; exactly one lint error, the pre-existing `quest-template-list.tsx:70`; build succeeds.

- [ ] **Step 2: Prove a check can fail before believing it**

Before running the browser checks, break one on purpose — set an offset directly in the database and confirm the panel shows the changed level — then confirm a check for something you did *not* change still reports unchanged. A check that has never failed has not been tested.

- [ ] **Step 3: The checks, as a parent**

Run a dev server on a free port, sign in as a grown-up, open Settings, and record a PASS/FAIL and a screenshot for each:

1. **Emma shows four strands at grade 6**, grouped Math / ELA (Reading, Language Arts) / Science, each reading `Grade 6 · at grade level`.
2. **Switching to Noah shows grade 3**, not Emma's levels, with no clicking twice and no refresh. This is the regression `8d07be4` fixed.
3. **Setting Noah's math to grade 4** saves and shows `Grade 4 · 1 ahead`.
4. **Noah's side quests then contain multiplication.** Start a math side quest for Noah and confirm at least one question is a multiplication fact. Before the change it was addition within 20 and multiplication was unreachable.
5. **Turning the toggle off** returns the strand to `Grade 3 · at grade level`.
6. **A hero with only a birth year** shows `Estimated grade N from age`.
7. **No child-facing surface shows a level.** Open the side quests page and the Realm as the child and confirm the words "ahead", "behind" and "Grade N ·" appear nowhere, including in `title` and `aria-label` attributes.

- [ ] **Step 4: Clean up**

Reset any offsets you set, kill the dev server, confirm `git status --short` is empty.

- [ ] **Step 5: Write the acceptance record**

In the task report: each check with PASS/FAIL and its evidence, what you broke in Step 2 and that the check caught it, and anything you could not verify with the reason.
