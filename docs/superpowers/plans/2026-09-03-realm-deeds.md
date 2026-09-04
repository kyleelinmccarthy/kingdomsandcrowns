# Realm Drill Bank and Deeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A skill-based question bank (math generators plus seeded pools), a per-skill mastery ladder, and story-wrapped deeds a hero plays on a 2D Deeds page that honors their learning profile, raises kingdom buildings, and counts toward spell-part unlocks.

**Architecture:** Skills, generators, mastery rules, the deed engine, buildings, and deeds are pure modules in `src/lib/utils/` with colocated tests written first. Pool content is JSON in `src/content/drills/` seeded into a table. One `"use server"` action file gates and persists runs, grading answers server-side. Two client components (picker, player) render the flow; the 3D slices later replace only the presentation.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45 on libsql/Turso, Vitest 4 + Testing Library, Tailwind v4, Web Speech API for read-aloud.

**Spec:** `docs/superpowers/specs/2026-09-02-realm-deeds-design.md` (read it first; program context in `docs/superpowers/specs/2026-09-02-realm-program-overview.md`; slices 1–2 specs in the same folder).

## Global Constraints

- Branch: `realm-foundations` in the worktree `.claude/worktrees/realm-foundations`. Never commit to `main`. Confirm `git branch --show-current` before every commit. Run git as plain single commands (no command substitution around git; the harness refuses those).
- `"use server"` files export only async functions plus erased `type` exports. Types, constants, and pure helpers go in `src/lib/utils/`.
- Hero-or-parent writes: `requireChildAccess(childId, { write: true })` with no `isChildActor` rejection (a hero plays their own deeds; a parent may play for a hero).
- Deed runs never write `activity_log`, `currentXp`, `bonusXp`, streaks, or the learning log.
- Error copy verbatim: "The Realm is closed for this hero. A grown-up can open it in the Chronicle.", "No deeds are ready for this hero yet.", "That deed has already been finished.", "Answer every question before finishing the deed."
- Questions are multiple choice: 4 choices normally, exactly 2 after `fewerChoices` trimming, the answer always among them. No time limits in any mode.
- Mastery: levels 0–4; step up when ≥ 7 of the last 8 are correct; step down when ≥ 3 of the last 6 are wrong; history clears on a step. Deeds ask 8 questions with up to 2 review items.
- Buildings need 5 deeds each. Completed deed runs count toward school-of-magic totals by the first skill's area (`reading`/`language` → element, `math` → form, `science` → modifier).
- Content bands: `k1 | g23 | g45 | g68 | g912`. Pools: exactly three distractors per item, no distractor equal to the answer, unique ids across all pools, ≥ 40 items per pool.
- IDs are `nanoid()`. Timestamps are `new Date()`. Dates ISO. Comments explain why. Commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- After editing `src/lib/db/schema.ts`: `npm run db:generate` then `npm run db:migrate`; verify rather than trust. Seed with `npm run db:seed-drills` (idempotent).
- Vitest: `npx vitest run "<path>"` (quote paths with parentheses); `npm test` for all. Tests colocated as `*.test.ts(x)`. No `setState` inside `useEffect` (repo lint rule).
- Final gate: `npm run typecheck && npm test`; `npm run lint` adds no new errors (one pre-existing error in `src/components/quest-template-list.tsx` is known).

## File Map

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` (exists) | `drillItem`, `skillMastery`, `deedRun`, `kingdomProgress` tables |
| `src/lib/utils/drill-generators.ts` (+test) | `seededRng`, helpers, the nine math generators, `GENERATORS` |
| `src/content/drills/*.json` (12) + `src/lib/utils/drills-content.test.ts` | pool content and its validation |
| `src/lib/utils/content-bands.ts` (+test) | `ContentBand`, `bandForHero`, `BAND_LABELS` |
| `src/lib/utils/skills.ts` (+test) | `Skill`, `SKILLS`, `AREA_SCHOOL`, `skillsFor`, `findSkill`, `skillForPool` |
| `src/lib/db/seed-drills.ts` + `package.json` | seed pools into `drill_item` |
| `src/lib/utils/mastery.ts` (+test) | ladder rules and copy |
| `src/lib/utils/kingdom.ts` (+test), `src/lib/utils/deeds.ts` (+test) | buildings and deeds catalogs |
| `src/lib/utils/deed-engine.ts` (+test) | `chooseSkills`, `buildDeedRun`, `gradeAnswer`, `toClientQuestion` |
| `src/lib/actions/deeds.ts` | `getDeedsOverview`, `startDeedRun`, `answerDeedQuestion`, `completeDeedRun`, `getMasteryOverview` |
| `src/lib/actions/subjects.ts` (exists) | `getSchoolCounts` adds completed deed runs |
| `src/lib/utils/spell-catalog.ts` (+test, exist) | hint copy "quests or deeds" |
| `src/components/deed-player.tsx` (+test), `deed-results.tsx`, `deed-picker.tsx` (+test) | the 2D flow |
| `src/app/(app)/deeds/page.tsx`, `src/components/nav-items.ts` | route and nav |
| `src/app/(app)/settings/mastery-panel.tsx`, `settings/page.tsx`, `settings/child-list.tsx` | parent Mastery panel |

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the `spell` table)
- Generated: `src/lib/db/migrations/0023_*.sql`

**Interfaces:**
- Produces: `schema.drillItem`, `schema.skillMastery`, `schema.deedRun`, `schema.kingdomProgress`.

- [ ] **Step 1: Append the four tables**

```ts
// ── The Realm: drill bank and deeds ─────────────────────────

/**
 * One practice item from a seeded pool (sight words, spelling, vocabulary,
 * science facts). Math is generated at run time and never stored. Rows are
 * upserted from src/content/drills/*.json by the seed script, keyed by the
 * item id, so content edits propagate without a migration.
 */
export const drillItem = sqliteTable(
  "drill_item",
  {
    id: text("id").primaryKey(), // the JSON item id, e.g. "sight-g23-because"
    poolId: text("pool_id").notNull(),
    skillId: text("skill_id").notNull(),
    band: text("band", { enum: ["k1", "g23", "g45", "g68", "g912"] }).notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer").notNull(),
    distractors: text("distractors").notNull(), // JSON array of 3 strings
    readAloud: text("read_aloud"),
    level: integer("level").notNull().default(2), // 0–4
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("drill_item_pool_idx").on(table.poolId)]
);

/**
 * A hero's rung on one skill's ladder. Low mastery never locks anything; it
 * only picks easier questions, so a hard week costs nothing but practice.
 */
export const skillMastery = sqliteTable(
  "skill_mastery",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    level: integer("level").notNull().default(0), // 0–4
    recentResults: text("recent_results").notNull().default("[]"), // JSON booleans, newest last, max 10
    correctTotal: integer("correct_total").notNull().default(0),
    attemptTotal: integer("attempt_total").notNull().default(0),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("skill_mastery_child_skill_idx").on(table.childId, table.skillId)]
);

/**
 * One play of a deed. The questions (with answers) live here so grading is
 * server-side; the client only ever sees prompts and choices. Runs are the
 * Realm's own record and never touch the learning log or XP.
 */
export const deedRun = sqliteTable(
  "deed_run",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    deedId: text("deed_id").notNull(),
    skillIds: text("skill_ids").notNull(), // JSON string[]
    band: text("band", { enum: ["k1", "g23", "g45", "g68", "g912"] }).notNull(),
    questions: text("questions").notNull(), // JSON Question[] incl. answers — server-side only
    responses: text("responses").notNull().default("[]"), // JSON (string | null)[]
    // Mastery levels per skill when the run began, so the results screen can
    // say what changed without a second table.
    masteryStart: text("mastery_start").notNull().default("{}"), // JSON Record<skillId, level>
    correctCount: integer("correct_count").notNull().default(0),
    flawless: integer("flawless", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("deed_run_child_completed_idx").on(table.childId, table.completedAt)]
);

/** How far a hero has raised each kingdom building. Cumulative across seasons. */
export const kingdomProgress = sqliteTable(
  "kingdom_progress",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    buildingId: text("building_id").notNull(),
    deedsDone: integer("deeds_done").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("kingdom_progress_child_building_idx").on(table.childId, table.buildingId)]
);
```

- [ ] **Step 2: Generate, apply, verify**

Run: `npm run db:generate` → one new `0023_*.sql` creating four tables with `skill_mastery_child_skill_idx` and `kingdom_progress_child_building_idx` UNIQUE. Run: `npm run db:migrate`.
Verify: `node -e "const {createClient}=require('@libsql/client');createClient({url:'file:./local.db'}).execute(\"select name from sqlite_master where type='table' and name in ('drill_item','skill_mastery','deed_run','kingdom_progress')\").then(r=>console.log(r.rows))"` → four rows.

- [ ] **Step 3: Commit**

Run: `npm run typecheck`
```bash
git add src/lib/db
git commit -m "Add drill item, skill mastery, deed run, and kingdom progress tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Seeded rng and the math generators

**Files:**
- Create: `src/lib/utils/drill-generators.ts`, `src/lib/utils/drill-generators.test.ts`

**Interfaces:**
- Produces: `Question` type (`{ id, skillId, prompt, choices, answer, readAloud? }`), `Rng`, `seededRng(seed)`, `randInt(rng, min, max)`, `shuffle(items, rng)`, `numericDistractors(answer, rng, min?)`, `Generator` type, `GENERATORS: Record<string, Generator>` with keys `add`, `sub`, `mul`, `div`, `place-value`, `fractions-compare`, `integer-ops`, `percent-of`, `one-step-eq`.
- Prompt formats (tests parse them): `What is 7 + 9?`, `What is 15 - 6?`, `What is 6 × 7?`, `What is 42 ÷ 6?`, `What digit is in the tens place of 4,718?`, `Which fraction is the largest?` (choices like `3/4`), `What is -3 + 7?`, `What is 25% of 80?`, `Solve for x: x + 3 = 10` / `Solve for x: x - 4 = 2` / `Solve for x: 3x = 12`.

- [ ] **Step 1: Write the failing test**

`src/lib/utils/drill-generators.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, numericDistractors, shuffle, type Question } from "./drill-generators";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function evalArith(prompt: string): number | null {
  const m = prompt.match(/^What is (-?\d+) ([+\-×÷]) (-?\d+)\?$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2]) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return a / b;
  }
  return null;
}

function expectWellFormed(q: Question) {
  expect(q.choices).toHaveLength(4);
  expect(new Set(q.choices).size).toBe(4);
  expect(q.choices).toContain(q.answer);
  expect(q.id).toContain(":");
}

describe("seededRng", () => {
  it("is deterministic and in [0,1)", () => {
    const a = seededRng(7), b = seededRng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe("helpers", () => {
  it("numericDistractors gives three distinct values that are not the answer and respect min", () => {
    for (const seed of SEEDS) {
      const d = numericDistractors(12, seededRng(seed), 0);
      expect(d).toHaveLength(3);
      expect(new Set(d).size).toBe(3);
      expect(d).not.toContain("12");
      for (const x of d) expect(Number(x)).toBeGreaterThanOrEqual(0);
    }
  });
  it("shuffle keeps the multiset", () => {
    expect([...shuffle([1, 2, 3, 4], seededRng(3))].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("arithmetic generators", () => {
  const cases: [string, string, (a: number, b: number, lvl: number) => void][] = [
    ["add", "add-10", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl])],
    ["add", "add-20", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl])],
    ["add", "add-100", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([20, 40, 60, 80, 100][lvl])],
    ["sub", "sub-10", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    ["sub", "sub-20", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    ["mul", "mul-facts", (a, b, lvl) => { expect(Math.max(a, b)).toBeLessThanOrEqual([2, 4, 6, 9, 12][lvl]); }],
    ["div", "div-facts", (a, b, lvl) => { expect(b).toBeLessThanOrEqual([2, 4, 6, 9, 12][lvl]); expect(a % b).toBe(0); }],
    ["integer-ops", "integer-ops", (a, b, lvl) => { expect(Math.abs(a)).toBeLessThanOrEqual([10, 20, 30, 40, 50][lvl]); expect(Math.abs(b)).toBeLessThanOrEqual([10, 20, 30, 40, 50][lvl]); }],
  ];
  for (const [gen, skillId, check] of cases) {
    it(`${gen} for ${skillId} is correct and in range at every level`, () => {
      for (const lvl of LEVELS) for (const seed of SEEDS) {
        const q = GENERATORS[gen](lvl, seededRng(seed), skillId);
        expectWellFormed(q);
        const m = q.prompt.match(/^What is (-?\d+) [+\-×÷] (-?\d+)\?$/);
        expect(m).not.toBeNull();
        expect(Number(q.answer)).toBe(evalArith(q.prompt));
        check(Number(m![1]), Number(m![2]), lvl);
      }
    });
  }
  it("integer-ops uses only + and - below level 3", () => {
    for (const lvl of [0, 1, 2]) for (const seed of SEEDS) {
      expect(GENERATORS["integer-ops"](lvl, seededRng(seed), "integer-ops").prompt).not.toContain("×");
    }
  });
});

describe("place-value", () => {
  it("asks about a real digit and widens with level", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["place-value"](lvl, seededRng(seed), "place-value");
      expectWellFormed(q);
      const m = q.prompt.match(/^What digit is in the (ones|tens|hundreds|thousands|ten-thousands|hundred-thousands) place of ([\d,]+)\?$/);
      expect(m).not.toBeNull();
      const digits = m![2].replace(/,/g, "");
      expect(digits.length).toBe([2, 3, 4, 5, 6][lvl]);
      const idx = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"].indexOf(m![1]);
      expect(q.answer).toBe(digits[digits.length - 1 - idx]);
    }
  });
});

describe("fractions-compare", () => {
  it("answers with the largest of four distinct fractions", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["fractions-compare"](lvl, seededRng(seed), "fractions-compare");
      expectWellFormed(q);
      const vals = q.choices.map((c) => { const [n, d] = c.split("/").map(Number); return n / d; });
      expect(new Set(vals).size).toBe(4);
      const [an, ad] = q.answer.split("/").map(Number);
      expect(an / ad).toBe(Math.max(...vals));
    }
  });
});

describe("percent-of", () => {
  it("has whole-number answers and honors level ranges", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["percent-of"](lvl, seededRng(seed), "percent-of");
      expectWellFormed(q);
      const m = q.prompt.match(/^What is (\d+)% of (\d+)\?$/);
      expect(m).not.toBeNull();
      const p = Number(m![1]), n = Number(m![2]);
      expect((p * n) % 100).toBe(0);
      expect(Number(q.answer)).toBe((p * n) / 100);
      if (lvl === 0) { expect([10, 50]).toContain(p); expect(n % 10).toBe(0); expect(n).toBeLessThanOrEqual(100); }
      expect(n).toBeLessThanOrEqual([100, 200, 300, 400, 500][lvl]);
    }
  });
});

describe("one-step-eq", () => {
  it("has an integer solution that satisfies the equation", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["one-step-eq"](lvl, seededRng(seed), "one-step-eq");
      expectWellFormed(q);
      const x = Number(q.answer);
      const add = q.prompt.match(/^Solve for x: x \+ (-?\d+) = (-?\d+)$/);
      const sub = q.prompt.match(/^Solve for x: x - (-?\d+) = (-?\d+)$/);
      const mul = q.prompt.match(/^Solve for x: (-?\d+)x = (-?\d+)$/);
      expect(add || sub || mul).toBeTruthy();
      if (add) expect(x + Number(add[1])).toBe(Number(add[2]));
      if (sub) expect(x - Number(sub[1])).toBe(Number(sub[2]));
      if (mul) expect(Number(mul[1]) * x).toBe(Number(mul[2]));
      if (lvl === 0) expect(add).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/drill-generators.test.ts` → FAIL, cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/drill-generators.ts`:
```ts
/**
 * Math practice is generated, never stored: the ranges are tuned per skill and
 * mastery level, and a seeded rng makes every run reproducible in tests.
 */
export type Question = {
  id: string;        // stable; encodes the parameters so a miss can be re-asked verbatim
  skillId: string;
  prompt: string;
  choices: string[]; // 4 (2 after fewerChoices trimming)
  answer: string;    // always one of choices
  readAloud?: string;
};

export type Rng = () => number;

/** mulberry32: small, fast, deterministic. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive integer in [min, max]. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Three distinct near-miss distractors: off by one or two, off by ten, and a
 * random nudge — the mistakes a hero actually makes, never the answer itself.
 */
export function numericDistractors(answer: number, rng: Rng, min = -Infinity): string[] {
  const candidates = shuffle([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer + 3, answer - 3], rng);
  const out: number[] = [];
  for (const c of candidates) {
    if (c !== answer && c >= min && !out.includes(c)) out.push(c);
    if (out.length === 3) break;
  }
  let nudge = 4;
  while (out.length < 3) {
    const c = answer + nudge * (rng() < 0.5 ? 1 : -1);
    if (c !== answer && c >= min && !out.includes(c)) out.push(c);
    nudge += 1;
  }
  return out.map(String);
}

function makeQuestion(skillId: string, key: string, prompt: string, answer: string, distractors: string[], rng: Rng): Question {
  return { id: `${skillId}:${key}`, skillId, prompt, choices: shuffle([answer, ...distractors], rng), answer };
}

export type Generator = (level: number, rng: Rng, skillId: string) => Question;

const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

// Sum ceilings per level, keyed by skill so one generator serves three skills.
const ADD_MAX: Record<string, number[]> = { "add-10": [5, 6, 8, 9, 10], "add-20": [10, 12, 15, 18, 20], "add-100": [20, 40, 60, 80, 100] };
const SUB_MAX: Record<string, number[]> = { "sub-10": [5, 6, 8, 9, 10], "sub-20": [10, 12, 15, 18, 20] };
const FACT_MAX = [2, 4, 6, 9, 12];
const INT_MAX = [10, 20, 30, 40, 50];
const PLACE_DIGITS = [2, 3, 4, 5, 6];
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
const PERCENT_BASE_MAX = [100, 200, 300, 400, 500];

const add: Generator = (level, rng, skillId) => {
  const max = (ADD_MAX[skillId] ?? ADD_MAX["add-20"])[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, max - a);
  return makeQuestion(skillId, `${a}+${b}`, `What is ${a} + ${b}?`, String(a + b), numericDistractors(a + b, rng, 0), rng);
};

const sub: Generator = (level, rng, skillId) => {
  const max = (SUB_MAX[skillId] ?? SUB_MAX["sub-20"])[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, a);
  return makeQuestion(skillId, `${a}-${b}`, `What is ${a} - ${b}?`, String(a - b), numericDistractors(a - b, rng, 0), rng);
};

const mul: Generator = (level, rng, skillId) => {
  const max = FACT_MAX[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, max);
  return makeQuestion(skillId, `${a}x${b}`, `What is ${a} × ${b}?`, String(a * b), numericDistractors(a * b, rng, 0), rng);
};

const div: Generator = (level, rng, skillId) => {
  const max = FACT_MAX[L(level)];
  const b = randInt(rng, 1, max);
  const q = randInt(rng, 0, 12);
  const a = b * q;
  return makeQuestion(skillId, `${a}/${b}`, `What is ${a} ÷ ${b}?`, String(q), numericDistractors(q, rng, 0), rng);
};

const placeValue: Generator = (level, rng, skillId) => {
  const digits = PLACE_DIGITS[L(level)];
  const n = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
  const idx = randInt(rng, 0, digits - 1);
  const s = String(n);
  const answer = s[s.length - 1 - idx];
  const others = shuffle([...new Set(s.split(""))].filter((d) => d !== answer), rng);
  while (others.length < 3) {
    const d = String(randInt(rng, 0, 9));
    if (d !== answer && !others.includes(d)) others.push(d);
  }
  return makeQuestion(skillId, `${n}@${idx}`, `What digit is in the ${PLACES[idx]} place of ${n.toLocaleString("en-US")}?`, answer, others.slice(0, 3), rng);
};

const fractionsCompare: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const fractions = new Map<string, number>(); // "n/d" -> value
  const denomMax = [6, 10, 10, 8, 12][lvl];
  // Same-denominator rounds need a denominator of at least 5 so four distinct
  // fractions exist; smaller ones would spin forever looking for a fourth.
  const sameDenominator = lvl <= 1 ? randInt(rng, 5, denomMax) : null;
  while (fractions.size < 4) {
    const d = sameDenominator ?? randInt(rng, 2, denomMax);
    const n = randInt(rng, 1, d - 1);
    const value = n / d;
    if (![...fractions.values()].includes(value)) fractions.set(`${n}/${d}`, value);
  }
  const entries = [...fractions.entries()];
  const answer = entries.reduce((best, e) => (e[1] > best[1] ? e : best))[0];
  const key = entries.map(([k]) => k).join(",");
  return { id: `${skillId}:${key}`, skillId, prompt: "Which fraction is the largest?", choices: shuffle(entries.map(([k]) => k), rng), answer };
};

const integerOps: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const max = INT_MAX[lvl];
  const a = randInt(rng, -max, max);
  const b = randInt(rng, -max, max);
  const op = lvl >= 3 && rng() < 0.34 ? "×" : rng() < 0.5 ? "+" : "-";
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return makeQuestion(skillId, `${a}${op}${b}`, `What is ${a} ${op} ${b}?`, String(answer), numericDistractors(answer, rng), rng);
};

const percentOf: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const baseMax = PERCENT_BASE_MAX[lvl];
  let p: number, n: number;
  if (lvl === 0) {
    p = rng() < 0.5 ? 10 : 50;
    n = randInt(rng, 1, 10) * 10;
  } else {
    // Any multiple of 5 percent; pick n so the answer is whole.
    p = randInt(rng, 1, 19) * 5;
    const step = 100 / gcd(p, 100);
    n = randInt(rng, 1, Math.floor(baseMax / step)) * step;
  }
  const answer = (p * n) / 100;
  return makeQuestion(skillId, `${p}%${n}`, `What is ${p}% of ${n}?`, String(answer), numericDistractors(answer, rng, 0), rng);
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const oneStepEq: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const kind = lvl === 0 ? "add" : lvl === 1 ? "sub" : lvl === 2 ? "mul" : (["add", "sub", "mul"] as const)[randInt(rng, 0, 2)];
  const span = lvl >= 3 ? 20 : 10;
  const x = lvl >= 3 ? randInt(rng, -span, span) : randInt(rng, 0, span);
  let prompt: string, key: string;
  if (kind === "add") {
    const a = randInt(rng, 1, span);
    prompt = `Solve for x: x + ${a} = ${x + a}`; key = `x+${a}=${x + a}`;
  } else if (kind === "sub") {
    const a = randInt(rng, 1, span);
    prompt = `Solve for x: x - ${a} = ${x - a}`; key = `x-${a}=${x - a}`;
  } else {
    const a = lvl >= 3 ? randInt(rng, 2, 9) * (rng() < 0.3 ? -1 : 1) : randInt(rng, 2, 9);
    prompt = `Solve for x: ${a}x = ${a * x}`; key = `${a}x=${a * x}`;
  }
  return makeQuestion(skillId, key, prompt, String(x), numericDistractors(x, rng), rng);
};

export const GENERATORS: Record<string, Generator> = {
  add,
  sub,
  mul,
  div,
  "place-value": placeValue,
  "fractions-compare": fractionsCompare,
  "integer-ops": integerOps,
  "percent-of": percentOf,
  "one-step-eq": oneStepEq,
};
```

- [ ] **Step 4: Run the test, then commit**

Run: `npx vitest run src/lib/utils/drill-generators.test.ts` → all pass (if a generator fails a range or distinctness case, fix the generator, not the test).
```bash
git add src/lib/utils/drill-generators.ts src/lib/utils/drill-generators.test.ts
git commit -m "Add seeded math generators for the drill bank

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Pool content and its validation

**Files:**
- Create: `src/content/drills/sight-words-k1.json`, `sight-words-g23.json`, `spelling-g23.json`, `spelling-g45.json`, `vocab-g45.json`, `vocab-g68.json`, `vocab-g912.json`, `science-k1.json`, `science-g23.json`, `science-g45.json`, `science-g68.json`, `science-g912.json`; `src/lib/utils/drills-content.test.ts`

**Interfaces:**
- Produces: twelve pool files in the format below, each with ≥ 40 items. Later tasks read them by `poolId`.

File format (exact):
```json
{
  "poolId": "sight-words-g23",
  "band": "g23",
  "items": [
    { "id": "sight-g23-because", "prompt": "Which word is \"because\"?", "answer": "because", "distractors": ["become", "beside", "before"], "readAloud": "because", "level": 1 }
  ]
}
```
Item rules: `id` = `<pool short prefix>-<slug>` unique across every pool (prefixes: `sight-k1`, `sight-g23`, `spell-g23`, `spell-g45`, `vocab-g45`, `vocab-g68`, `vocab-g912`, `sci-k1`, `sci-g23`, `sci-g45`, `sci-g68`, `sci-g912`); exactly three `distractors`, none equal to the answer, all four choices distinct; `level` 0–4 (spread items across levels, roughly a bell around 2); `readAloud` optional (always set for sight words: the word itself; for spelling set it to the correct word so a hero can hear it).

Authoring guidance per pool (this is authoring work; the validation test enforces structure, and a reviewer checks quality):
- **sight-words-k1** (≥ 50): Dolch pre-primer, primer, and first-grade words (the, and, a, to, said, you, he, I, of, it, was, in, my, is, for, look, we, on, are, but, this, what, there, out, be, have, am, do, did, what, so, get, like, him, her, into, over, take, know, thank, ask, could, every, from, give, going, had, has, her, him, his, how, just, let, live, may, old, once, open, put, round, some, stop, then, think, walk, were, when). Prompt `Which word is "X"?`, distractors are visually similar real words of the same band.
- **sight-words-g23** (≥ 50): Dolch second/third-grade and Fry 100–200 words (always, around, because, been, before, best, both, buy, call, cold, does, don't, fast, first, five, found, gave, goes, green, its, made, many, off, or, pull, read, right, sing, sit, sleep, tell, their, these, those, upon, us, use, very, wash, which, why, wish, work, would, write, your, about, better, bring, carry, clean, cut, done, draw, drink, eight, fall, far, full, got, grow, hold, hot, hurt, if, keep, kind, laugh, light, long, much, myself, never, only, own, pick, seven, shall, show, six, small, start, ten, today, together, try, warm).
- **spelling-g23** (≥ 40) and **spelling-g45** (≥ 40): prompt `Which is spelled correctly?`, answer the correct word, distractors three plausible misspellings (doubled or dropped letters, swapped vowels). Use grade-appropriate words (g23: friend, because, school, people, again, animal, beautiful, enough, favorite, minute, Wednesday, February, together, tomorrow, thought, through, write, listen, laugh, caught; g45: separate, necessary, definitely, receive, believe, government, environment, decision, exercise, familiar, immediately, interrupt, knowledge, language, library, medicine, neighbor, occasion, opposite, particular, possession, recommend, rhythm, scissors, temperature, vegetable, weird, yacht, achieve, calendar, cemetery, conscience, embarrass, existence, foreign, guarantee, harass, height, humorous, independent).
- **vocab-g45**, **vocab-g68**, **vocab-g912** (≥ 40 each): prompt is a one-sentence definition (`Which word means "to make something bigger"?`), answer the word, distractors three real words of the same grade band. Use tier-2 academic vocabulary appropriate to each band (g45: expand, ancient, observe, predict, fragile, generous, hesitate, imitate, rapid, brief …; g68: abundant, analyze, benefit, contrast, evidence, hypothesis, infer, perspective, significant, transform …; g912: ambiguous, benevolent, candid, diligent, eloquent, feasible, inevitable, meticulous, pragmatic, resilient …).
- **science-k1**, **science-g23**, **science-g45**, **science-g68**, **science-g912** (≥ 40 each): prompt is a question, answer a short phrase, distractors three plausible wrong phrases. Topics by band: k1 living/non-living, five senses, weather, day/night, animal needs; g23 life cycles, habitats, states of matter, simple machines, the Moon; g45 ecosystems, the water cycle, electricity, the solar system, rocks and minerals; g68 cells, photosynthesis, plate tectonics, forces and motion, the periodic table basics; g912 genetics, chemical reactions, Newton's laws, energy transfer, the scientific method. Keep every fact uncontroversial and grade-standard.

- [ ] **Step 1: Write the failing validation test**

`src/lib/utils/drills-content.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(__dirname, "../../content/drills");
const BANDS = ["k1", "g23", "g45", "g68", "g912"];
const EXPECTED_POOLS = [
  "sight-words-k1", "sight-words-g23", "spelling-g23", "spelling-g45",
  "vocab-g45", "vocab-g68", "vocab-g912",
  "science-k1", "science-g23", "science-g45", "science-g68", "science-g912",
];

type PoolFile = { poolId: string; band: string; items: { id: string; prompt: string; answer: string; distractors: string[]; readAloud?: string; level?: number }[] };

function loadAll(): PoolFile[] {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as PoolFile;
    expect(parsed.poolId).toBe(f.replace(/\.json$/, ""));
    return parsed;
  });
}

describe("drill pool content", () => {
  const pools = loadAll();

  it("ships every expected pool and nothing unexpected", () => {
    expect(pools.map((p) => p.poolId).sort()).toEqual([...EXPECTED_POOLS].sort());
  });

  it("has a valid band and at least 40 items per pool", () => {
    for (const p of pools) {
      expect(BANDS).toContain(p.band);
      expect(p.items.length).toBeGreaterThanOrEqual(40);
    }
  });

  it("has unique item ids across all pools", () => {
    const ids = pools.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed items", () => {
    for (const p of pools) for (const i of p.items) {
      expect(i.prompt.trim().length).toBeGreaterThan(0);
      expect(i.answer.trim().length).toBeGreaterThan(0);
      expect(i.distractors).toHaveLength(3);
      expect(i.distractors).not.toContain(i.answer);
      expect(new Set([i.answer, ...i.distractors]).size).toBe(4);
      if (i.level !== undefined) { expect(i.level).toBeGreaterThanOrEqual(0); expect(i.level).toBeLessThanOrEqual(4); }
      if (p.poolId.startsWith("sight-words")) expect(i.readAloud).toBe(i.answer);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/drills-content.test.ts` → FAIL (directory missing).

- [ ] **Step 3: Author the twelve pool files**

Create `src/content/drills/` and each file per the rules above. Aim for 40–60 items per pool with `level` spread 0–4. Sight-word files must set `readAloud` to the word. Keep JSON valid (run the test often while authoring).

- [ ] **Step 4: Run the test, then commit**

Run: `npx vitest run src/lib/utils/drills-content.test.ts` → all pass.
```bash
git add src/content/drills src/lib/utils/drills-content.test.ts
git commit -m "Add starter drill pools for sight words, spelling, vocabulary, and science

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Content bands, the skills catalog, and the seed script

**Files:**
- Create: `src/lib/utils/content-bands.ts` (+test), `src/lib/utils/skills.ts` (+test), `src/lib/db/seed-drills.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `GENERATORS` (Task 2); pool files (Task 3); `SpellSchool` from `./spell-schools`; `AgeMode` from `./age-mode`.
- Produces:
  - `ContentBand`, `CONTENT_BANDS`, `BAND_LABELS`, `bandForHero(grade: string | null, ageMode: AgeMode): ContentBand`, `bandIndex(band)`, `nearestBands(band): ContentBand[]` (the band itself, then below, then above, outward)
  - `SkillArea`, `Skill`, `SKILLS`, `AREA_SCHOOL`, `skillsFor(area, band)`, `findSkill(id)`, `skillForPool(poolId)`
  - npm script `db:seed-drills`

- [ ] **Step 1: Write the failing tests**

`src/lib/utils/content-bands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bandForHero, nearestBands, BAND_LABELS, CONTENT_BANDS } from "./content-bands";

describe("bandForHero", () => {
  it("maps grades to bands", () => {
    expect(bandForHero("K", "elementary")).toBe("k1");
    expect(bandForHero("1", "elementary")).toBe("k1");
    expect(bandForHero("3", "elementary")).toBe("g23");
    expect(bandForHero("5", "elementary")).toBe("g45");
    expect(bandForHero("7", "middle")).toBe("g68");
    expect(bandForHero("12", "high")).toBe("g912");
  });
  it("falls back to the age band without a grade", () => {
    expect(bandForHero(null, "elementary")).toBe("g23");
    expect(bandForHero(null, "middle")).toBe("g68");
    expect(bandForHero(null, "high")).toBe("g912");
  });
});

describe("nearestBands", () => {
  it("starts with the band, then walks down, then up", () => {
    expect(nearestBands("g45")).toEqual(["g45", "g23", "k1", "g68", "g912"]);
    expect(nearestBands("k1")).toEqual(["k1", "g23", "g45", "g68", "g912"]);
  });
  it("labels every band", () => {
    for (const b of CONTENT_BANDS) expect(BAND_LABELS[b]).toBeTruthy();
  });
});
```

`src/lib/utils/skills.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL } from "./skills";
import { GENERATORS } from "./drill-generators";

describe("SKILLS", () => {
  it("has unique ids and resolvable sources", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKILLS) {
      if (s.source.kind === "generator") expect(GENERATORS[s.source.generatorId]).toBeTypeOf("function");
      else expect(fs.existsSync(path.join(__dirname, "../../content/drills", `${s.source.poolId}.json`))).toBe(true);
    }
  });
  it("maps every area to a school", () => {
    expect(AREA_SCHOOL).toEqual({ reading: "element", language: "element", math: "form", science: "modifier" });
  });
  it("finds skills by area and band, and pools by id", () => {
    expect(skillsFor("math", "g23").map((s) => s.id).sort()).toEqual(["add-100", "add-20", "sub-20"]);
    expect(skillsFor("language", "k1")).toEqual([]);
    expect(findSkill("mul-facts")?.label).toBe("Multiplication facts");
    expect(findSkill("nope")).toBeNull();
    expect(skillForPool("vocab-g68")?.id).toBe("vocab-g68");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/content-bands.test.ts src/lib/utils/skills.test.ts` → FAIL, cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/content-bands.ts`:
```ts
import type { AgeMode } from "./age-mode";

/** Five bands cover K–12; content is authored per band, not per grade. */
export type ContentBand = "k1" | "g23" | "g45" | "g68" | "g912";
export const CONTENT_BANDS: ContentBand[] = ["k1", "g23", "g45", "g68", "g912"];

export const BAND_LABELS: Record<ContentBand, string> = {
  k1: "Kindergarten – Grade 1",
  g23: "Grades 2–3",
  g45: "Grades 4–5",
  g68: "Grades 6–8",
  g912: "Grades 9–12",
};

/** A hero with only a birth year lands in the middle of their age band. */
export function bandForHero(grade: string | null, ageMode: AgeMode): ContentBand {
  if (grade === "K" || grade === "1") return "k1";
  const n = grade ? parseInt(grade, 10) : NaN;
  if (Number.isFinite(n)) {
    if (n <= 3) return "g23";
    if (n <= 5) return "g45";
    if (n <= 8) return "g68";
    return "g912";
  }
  return ageMode === "elementary" ? "g23" : ageMode === "middle" ? "g68" : "g912";
}

export function bandIndex(band: ContentBand): number {
  return CONTENT_BANDS.indexOf(band);
}

/** The band, then each band below (nearest first), then each band above. Easier before harder. */
export function nearestBands(band: ContentBand): ContentBand[] {
  const i = bandIndex(band);
  const below = CONTENT_BANDS.slice(0, i).reverse();
  const above = CONTENT_BANDS.slice(i + 1);
  return [band, ...below, ...above];
}
```

`src/lib/utils/skills.ts`:
```ts
import type { ContentBand } from "./content-bands";
import type { SpellSchool } from "./spell-schools";

export type SkillArea = "math" | "reading" | "language" | "science";

export type SkillSource = { kind: "generator"; generatorId: string } | { kind: "pool"; poolId: string };

export type Skill = { id: string; label: string; area: SkillArea; band: ContentBand; source: SkillSource };

/** Same mapping the subject defaults use, so deeds and schoolwork pull one way. */
export const AREA_SCHOOL: Record<SkillArea, SpellSchool> = {
  reading: "element",
  language: "element",
  math: "form",
  science: "modifier",
};

const gen = (generatorId: string): SkillSource => ({ kind: "generator", generatorId });
const pool = (poolId: string): SkillSource => ({ kind: "pool", poolId });

export const SKILLS: Skill[] = [
  { id: "add-10", label: "Addition within 10", area: "math", band: "k1", source: gen("add") },
  { id: "sub-10", label: "Subtraction within 10", area: "math", band: "k1", source: gen("sub") },
  { id: "add-20", label: "Addition within 20", area: "math", band: "g23", source: gen("add") },
  { id: "sub-20", label: "Subtraction within 20", area: "math", band: "g23", source: gen("sub") },
  { id: "add-100", label: "Addition within 100", area: "math", band: "g23", source: gen("add") },
  { id: "mul-facts", label: "Multiplication facts", area: "math", band: "g45", source: gen("mul") },
  { id: "div-facts", label: "Division facts", area: "math", band: "g45", source: gen("div") },
  { id: "place-value", label: "Place value", area: "math", band: "g45", source: gen("place-value") },
  { id: "fractions-compare", label: "Comparing fractions", area: "math", band: "g68", source: gen("fractions-compare") },
  { id: "integer-ops", label: "Integer operations", area: "math", band: "g68", source: gen("integer-ops") },
  { id: "percent-of", label: "Percent of a number", area: "math", band: "g912", source: gen("percent-of") },
  { id: "one-step-eq", label: "One-step equations", area: "math", band: "g912", source: gen("one-step-eq") },
  { id: "sight-k1", label: "Sight words", area: "reading", band: "k1", source: pool("sight-words-k1") },
  { id: "sight-g23", label: "Sight words", area: "reading", band: "g23", source: pool("sight-words-g23") },
  { id: "spell-g23", label: "Spelling", area: "language", band: "g23", source: pool("spelling-g23") },
  { id: "spell-g45", label: "Spelling", area: "language", band: "g45", source: pool("spelling-g45") },
  { id: "vocab-g45", label: "Vocabulary", area: "language", band: "g45", source: pool("vocab-g45") },
  { id: "vocab-g68", label: "Vocabulary", area: "language", band: "g68", source: pool("vocab-g68") },
  { id: "vocab-g912", label: "Vocabulary", area: "language", band: "g912", source: pool("vocab-g912") },
  { id: "science-k1", label: "Science facts", area: "science", band: "k1", source: pool("science-k1") },
  { id: "science-g23", label: "Science facts", area: "science", band: "g23", source: pool("science-g23") },
  { id: "science-g45", label: "Science facts", area: "science", band: "g45", source: pool("science-g45") },
  { id: "science-g68", label: "Science facts", area: "science", band: "g68", source: pool("science-g68") },
  { id: "science-g912", label: "Science facts", area: "science", band: "g912", source: pool("science-g912") },
];

export function skillsFor(area: SkillArea, band: ContentBand): Skill[] {
  return SKILLS.filter((s) => s.area === area && s.band === band);
}

export function findSkill(id: string): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

export function skillForPool(poolId: string): Skill | null {
  return SKILLS.find((s) => s.source.kind === "pool" && s.source.poolId === poolId) ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/utils/content-bands.test.ts src/lib/utils/skills.test.ts` → pass.

- [ ] **Step 5: Seed script**

`src/lib/db/seed-drills.ts`:
```ts
/**
 * Loads every pool in src/content/drills into drill_item, upserting by item
 * id so content edits propagate. Never deletes: a retired item simply stops
 * being drawn once its skill no longer references the pool.
 *
 * Idempotent. Run with:
 *   npx tsx --env-file=.env.prod src/lib/db/seed-drills.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { skillForPool } from "../utils/skills";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

type PoolFile = {
  poolId: string;
  band: "k1" | "g23" | "g45" | "g68" | "g912";
  items: { id: string; prompt: string; answer: string; distractors: string[]; readAloud?: string; level?: number }[];
};

async function main() {
  const dir = path.join(process.cwd(), "src/content/drills");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const file of files) {
    const pool = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as PoolFile;
    const skill = skillForPool(pool.poolId);
    if (!skill) {
      console.warn(`Skipping ${pool.poolId}: no skill references it.`);
      continue;
    }
    for (const item of pool.items) {
      const row = {
        id: item.id,
        poolId: pool.poolId,
        skillId: skill.id,
        band: pool.band,
        prompt: item.prompt,
        answer: item.answer,
        distractors: JSON.stringify(item.distractors),
        readAloud: item.readAloud ?? null,
        level: item.level ?? 2,
        updatedAt: new Date(),
      };
      await db.insert(schema.drillItem).values(row).onConflictDoUpdate({ target: schema.drillItem.id, set: row });
      count += 1;
    }
  }
  console.log(`Seeded ${count} drill items from ${files.length} pools.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
`package.json`: add `"db:seed-drills": "npx tsx src/lib/db/seed-drills.ts"` after `db:seed-badges`.

Run: `npm run db:seed-drills` (against the worktree's `local.db`) → "Seeded N drill items from 12 pools." Run it twice; the count is the same and no error.

- [ ] **Step 6: Commit**

Run: `npm run typecheck && npm test`
```bash
git add src/lib/utils/content-bands.ts src/lib/utils/content-bands.test.ts src/lib/utils/skills.ts src/lib/utils/skills.test.ts src/lib/db/seed-drills.ts package.json
git commit -m "Add content bands, the skills catalog, and the drill seed script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Mastery ladder

**Files:**
- Create: `src/lib/utils/mastery.ts`, `src/lib/utils/mastery.test.ts`

**Interfaces:**
- Produces: `MASTERY_MAX = 4`, `MasteryState = { level: number; recentResults: boolean[] }`, `recordResult(state, correct): MasteryState`, `masteryLabel(level): string`, `masteryChangeCopy(before, after, skillLabel): string | null`, `parseRecentResults(raw: string | null): boolean[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/utils/mastery.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { recordResult, masteryLabel, masteryChangeCopy, parseRecentResults, MASTERY_MAX } from "./mastery";

function run(state: { level: number; recentResults: boolean[] }, results: boolean[]) {
  return results.reduce((s, r) => recordResult(s, r), state);
}

describe("recordResult", () => {
  it("steps up after seven of the last eight are right and clears history", () => {
    const s = run({ level: 1, recentResults: [] }, [true, true, true, false, true, true, true, true]);
    expect(s.level).toBe(2);
    expect(s.recentResults).toEqual([]);
  });
  it("does not step up on six of eight", () => {
    const s = run({ level: 1, recentResults: [] }, [true, true, false, false, true, true, true, true]);
    expect(s.level).toBe(1);
    expect(s.recentResults).toHaveLength(8);
  });
  it("steps down after three of the last six are wrong and clears history", () => {
    const s = run({ level: 2, recentResults: [] }, [true, false, true, false, true, false]);
    expect(s.level).toBe(1);
    expect(s.recentResults).toEqual([]);
  });
  it("clamps at 0 and at MASTERY_MAX", () => {
    expect(run({ level: 0, recentResults: [] }, [false, false, false]).level).toBe(0);
    expect(run({ level: MASTERY_MAX, recentResults: [] }, Array(8).fill(true)).level).toBe(MASTERY_MAX);
  });
  it("keeps at most ten results", () => {
    const s = run({ level: 0, recentResults: [] }, [true, false, true, false, true, false, true, false, true, false, true, false]);
    expect(s.recentResults.length).toBeLessThanOrEqual(10);
  });
});

describe("copy", () => {
  it("labels every level", () => {
    expect([0, 1, 2, 3, 4].map(masteryLabel)).toEqual(["Just starting", "Warming up", "Getting stronger", "Nearly there", "Mastered"]);
  });
  it("describes a change and stays quiet otherwise", () => {
    expect(masteryChangeCopy(1, 2, "Addition within 20")).toBe("Addition within 20: getting stronger");
    expect(masteryChangeCopy(2, 1, "Spelling")).toBe("Spelling: we'll practice this more");
    expect(masteryChangeCopy(2, 2, "Spelling")).toBeNull();
  });
});

describe("parseRecentResults", () => {
  it("tolerates bad input", () => {
    expect(parseRecentResults(null)).toEqual([]);
    expect(parseRecentResults("nope")).toEqual([]);
    expect(parseRecentResults("[true,false]")).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/mastery.ts`:
```ts
export const MASTERY_MAX = 4;
const HISTORY = 10;

export type MasteryState = { level: number; recentResults: boolean[] };

/**
 * The ladder: seven of the last eight right climbs a rung, three of the last
 * six wrong steps down one. History clears on a step so a hero starts each
 * rung fresh. Low mastery never locks anything — it only picks easier work.
 */
export function recordResult(state: MasteryState, correct: boolean): MasteryState {
  const recent = [...state.recentResults, correct].slice(-HISTORY);
  const last8 = recent.slice(-8);
  const last6 = recent.slice(-6);
  const rightIn8 = last8.filter(Boolean).length;
  const wrongIn6 = last6.filter((r) => !r).length;
  if (last8.length === 8 && rightIn8 >= 7 && state.level < MASTERY_MAX) {
    return { level: state.level + 1, recentResults: [] };
  }
  if (last6.length === 6 && wrongIn6 >= 3 && state.level > 0) {
    return { level: state.level - 1, recentResults: [] };
  }
  return { level: state.level, recentResults: recent };
}

const LABELS = ["Just starting", "Warming up", "Getting stronger", "Nearly there", "Mastered"];

export function masteryLabel(level: number): string {
  return LABELS[Math.min(MASTERY_MAX, Math.max(0, Math.floor(level)))];
}

export function masteryChangeCopy(before: number, after: number, skillLabel: string): string | null {
  if (after > before) return `${skillLabel}: getting stronger`;
  if (after < before) return `${skillLabel}: we'll practice this more`;
  return null;
}

export function parseRecentResults(raw: string | null): boolean[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "boolean").slice(-HISTORY) : [];
  } catch {
    return [];
  }
}
```
Note the "three wrong in six" test: with results T F T F T F the sixth result makes three wrong → step down. The seven-of-eight test steps up on the eighth result.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/utils/mastery.test.ts` → pass.
```bash
git add src/lib/utils/mastery.ts src/lib/utils/mastery.test.ts
git commit -m "Add the skill mastery ladder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Kingdom buildings and deeds catalogs

**Files:**
- Create: `src/lib/utils/kingdom.ts`, `src/lib/utils/kingdom.test.ts`, `src/lib/utils/deeds.ts`, `src/lib/utils/deeds.test.ts`

**Interfaces:**
- Consumes: `SkillArea` (Task 4), `GameIconName`.
- Produces: `Building`, `BUILDINGS`, `findBuilding(id)`, `buildingProgress(deedsDone, building)`; `Deed`, `DEEDS`, `findDeed(id)`, `deedsForBuilding(buildingId)`, `deedStory(deed, tone)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/utils/kingdom.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BUILDINGS, buildingProgress, findBuilding } from "./kingdom";

describe("BUILDINGS", () => {
  it("has eight buildings with unique ids and five deeds each", () => {
    expect(BUILDINGS).toHaveLength(8);
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(8);
    for (const b of BUILDINGS) expect(b.deedsToBuild).toBe(5);
  });
  it("reports progress and completion", () => {
    const well = findBuilding("well")!;
    expect(buildingProgress(2, well)).toEqual({ done: 2, total: 5, complete: false });
    expect(buildingProgress(7, well)).toEqual({ done: 5, total: 5, complete: true });
    expect(findBuilding("moat")).toBeNull();
  });
});
```

`src/lib/utils/deeds.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEEDS, deedsForBuilding, deedStory, findDeed } from "./deeds";
import { BUILDINGS } from "./kingdom";

describe("DEEDS", () => {
  it("has twenty deeds with unique ids and valid buildings", () => {
    expect(DEEDS).toHaveLength(20);
    expect(new Set(DEEDS.map((d) => d.id)).size).toBe(20);
    const buildingIds = new Set(BUILDINGS.map((b) => b.id));
    for (const d of DEEDS) {
      expect(buildingIds.has(d.buildingId)).toBe(true);
      expect(d.questionCount).toBe(8);
      expect(d.story.length).toBeGreaterThan(20);
    }
  });
  it("gives every building at least two deeds and uses every area at least twice", () => {
    for (const b of BUILDINGS) expect(deedsForBuilding(b.id).length).toBeGreaterThanOrEqual(2);
    for (const area of ["math", "reading", "language", "science"]) {
      expect(DEEDS.filter((d) => d.area === area).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("picks the tone variant only when one exists", () => {
    const withMonsters = DEEDS.find((d) => d.monsterStory)!;
    expect(deedStory(withMonsters, "monsters")).toBe(withMonsters.monsterStory);
    expect(deedStory(withMonsters, "gentle")).toBe(withMonsters.story);
    const plain = DEEDS.find((d) => !d.monsterStory)!;
    expect(deedStory(plain, "monsters")).toBe(plain.story);
    expect(findDeed("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/kingdom.ts`:
```ts
import type { GameIconName } from "@/components/game-icon";

export type Building = { id: string; label: string; description: string; deedsToBuild: number; icon: GameIconName };

/** Deeds raise these in order of story, not difficulty; any building can be worked at any time. */
export const BUILDINGS: Building[] = [
  { id: "well", label: "Village Well", description: "Clean water for every doorstep.", deedsToBuild: 5, icon: "box" },
  { id: "mill", label: "Grain Mill", description: "Flour for the baker's ovens.", deedsToBuild: 5, icon: "compass" },
  { id: "bridge", label: "River Bridge", description: "A crossing that holds in any weather.", deedsToBuild: 5, icon: "link" },
  { id: "chapel", label: "Chapel", description: "A quiet place with a bell that carries.", deedsToBuild: 5, icon: "temple" },
  { id: "market", label: "Market Square", description: "Stalls, songs, and the smell of bread.", deedsToBuild: 5, icon: "gift" },
  { id: "library", label: "Library", description: "Every scroll in the realm, shelved and safe.", deedsToBuild: 5, icon: "book" },
  { id: "watchtower", label: "Watchtower", description: "Eyes on the hills and a lantern at night.", deedsToBuild: 5, icon: "watchtower" },
  { id: "garden", label: "Royal Garden", description: "Herbs, bees, and a bench in the sun.", deedsToBuild: 5, icon: "flower" },
];

export function findBuilding(id: string): Building | null {
  return BUILDINGS.find((b) => b.id === id) ?? null;
}

export function buildingProgress(deedsDone: number, building: Building): { done: number; total: number; complete: boolean } {
  const done = Math.min(Math.max(0, deedsDone), building.deedsToBuild);
  return { done, total: building.deedsToBuild, complete: done >= building.deedsToBuild };
}
```

`src/lib/utils/deeds.ts`:
```ts
import type { SkillArea } from "./skills";

export type Deed = {
  id: string;
  title: string;
  story: string;          // gentle default
  monsterStory?: string;  // only when the story mentions an opponent
  buildingId: string;
  area: SkillArea;
  questionCount: number;
};

const Q = 8;

/**
 * Deeds never name a skill: the engine picks skills for the hero's band and
 * the deed's area, so one story serves a first grader and a seventh grader.
 */
export const DEEDS: Deed[] = [
  { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry. Count the stones the well-diggers need before the cart leaves.", buildingId: "well", area: "math", questionCount: Q },
  { id: "well-signs", title: "Signs for the Well", story: "The well needs a sign every traveler can read. Help the sign-painter get the words just right.", buildingId: "well", area: "reading", questionCount: Q },
  { id: "well-water", title: "What Makes Water Clean", story: "The well-keeper wants to know why the deep water runs clear. Share what you know about the world.", buildingId: "well", area: "science", questionCount: Q },
  { id: "mill-sacks", title: "Sacks at the Mill", story: "Miller Tessa is counting sacks of grain. Add them up so the baker knows what to expect.", buildingId: "mill", area: "math", questionCount: Q },
  { id: "mill-ledger", title: "The Miller's Ledger", story: "Every sack is written in the ledger. Spell each entry so the record stands.", buildingId: "mill", area: "language", questionCount: Q },
  { id: "mill-wheel", title: "The Turning Wheel", story: "The great wheel turns with the river. Explain what moves it and the millwright will trust the design.", buildingId: "mill", area: "science", questionCount: Q },
  { id: "bridge-planks", title: "Planks for the Bridge", story: "The carpenter needs planks measured and matched. Count carefully so nothing falls short.", buildingId: "bridge", area: "math", questionCount: Q, monsterStory: "Shadow blobs chewed the old planks. Count the new ones so the carpenter can chase the dark off the river." },
  { id: "bridge-toll", title: "The Toll-Keeper's Words", story: "The toll-keeper greets every traveler. Help her choose the right words for the welcome sign.", buildingId: "bridge", area: "language", questionCount: Q },
  { id: "chapel-bell", title: "Ring the Bell", story: "The bell-founder needs numbers for the mold. Work them out and the chapel gets its voice.", buildingId: "chapel", area: "math", questionCount: Q },
  { id: "chapel-scroll", title: "The Chapel Scroll", story: "A faded scroll hangs by the door. Read its words aloud so they can be copied fresh.", buildingId: "chapel", area: "reading", questionCount: Q },
  { id: "chapel-stars", title: "Stars Over the Chapel", story: "The chapel window faces the night sky. Tell the glazier what shines there.", buildingId: "chapel", area: "science", questionCount: Q },
  { id: "market-prices", title: "Market Prices", story: "Stall-keepers argue over prices. Settle the sums and the market opens on time.", buildingId: "market", area: "math", questionCount: Q },
  { id: "market-crier", title: "The Town Crier", story: "The crier needs the right word for every announcement. Lend him your vocabulary.", buildingId: "market", area: "language", questionCount: Q },
  { id: "library-shelves", title: "Shelving the Scrolls", story: "The librarian sorts scrolls by number. Help her find each one's place.", buildingId: "library", area: "math", questionCount: Q },
  { id: "library-catalog", title: "The Catalog", story: "Every scroll gets a card with its name. Read each name so the catalog is true.", buildingId: "library", area: "reading", questionCount: Q },
  { id: "library-scribe", title: "The Scribe's Test", story: "The head scribe tests every helper's spelling. Pass it and the copying begins.", buildingId: "library", area: "language", questionCount: Q },
  { id: "watchtower-height", title: "How Tall the Tower", story: "The mason counts stones for each level. Add them up so the tower stands straight.", buildingId: "watchtower", area: "math", questionCount: Q, monsterStory: "A skeleton crew knocked the tower crooked. Count the stones the mason needs to set it right." },
  { id: "watchtower-signals", title: "Lantern Signals", story: "The watch signals with light. Explain how light travels and the signals will carry.", buildingId: "watchtower", area: "science", questionCount: Q },
  { id: "garden-beds", title: "Garden Beds", story: "The gardener lays out beds in rows. Work the numbers and every seed finds a home.", buildingId: "garden", area: "math", questionCount: Q },
  { id: "garden-bees", title: "The Bee Keeper", story: "The bee keeper wants to know what her bees need. Tell her, and the garden will hum.", buildingId: "garden", area: "science", questionCount: Q },
];

export function findDeed(id: string): Deed | null {
  return DEEDS.find((d) => d.id === id) ?? null;
}

export function deedsForBuilding(buildingId: string): Deed[] {
  return DEEDS.filter((d) => d.buildingId === buildingId);
}

export function deedStory(deed: Deed, tone: "gentle" | "monsters"): string {
  return tone === "monsters" && deed.monsterStory ? deed.monsterStory : deed.story;
}
```
The list is exactly twenty deeds: every building has at least two, every area at least two.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/utils/kingdom.test.ts src/lib/utils/deeds.test.ts` → pass.
```bash
git add src/lib/utils/kingdom.ts src/lib/utils/kingdom.test.ts src/lib/utils/deeds.ts src/lib/utils/deeds.test.ts
git commit -m "Add kingdom buildings and deeds catalogs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Deed engine

**Files:**
- Create: `src/lib/utils/deed-engine.ts`, `src/lib/utils/deed-engine.test.ts`

**Interfaces:**
- Consumes: `Question`, `GENERATORS`, `seededRng`, `shuffle` (Task 2); `Skill`, `skillsFor` (Task 4); `ContentBand`, `nearestBands` (Task 4); `Deed` (Task 6).
- Produces: `ProfileLike`, `PoolItem`, `BuildRunInput`, `BuiltRun`, `ClientQuestion`, `chooseSkills(deed, band)`, `buildDeedRun(input)`, `gradeAnswer(question, answer)`, `toClientQuestion(question)`.

- [ ] **Step 1: Write the failing test**

`src/lib/utils/deed-engine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDeedRun, chooseSkills, gradeAnswer, toClientQuestion, type BuildRunInput, type PoolItem } from "./deed-engine";
import { findDeed } from "./deeds";
import type { Question } from "./drill-generators";

const deedMath = findDeed("well-stones")!;      // math
const deedReading = findDeed("well-signs")!;    // reading
const deedLanguage = findDeed("mill-ledger")!;  // language

function poolItems(skillId: string, n: number, level = 2): PoolItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${skillId}-item-${i}`, skillId, prompt: `Prompt ${i}`, answer: `A${i}`, distractors: [`B${i}`, `C${i}`, `D${i}`], readAloud: null, level,
  }));
}

const profile = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };

function input(over: Partial<BuildRunInput> = {}): BuildRunInput {
  return { deed: deedReading, band: "g23", masteryBySkill: {}, profile, seed: 1, poolItems: poolItems("sight-g23", 30), recentMisses: [], ...over };
}

describe("chooseSkills", () => {
  it("picks the band's skills for the area, at most one generator and one pool", () => {
    expect(chooseSkills(deedMath, "g23").map((s) => s.id)).toHaveLength(1);
    expect(chooseSkills(deedReading, "g23").map((s) => s.id)).toEqual(["sight-g23"]);
  });
  it("falls back to the nearest band when the area has no skill there", () => {
    expect(chooseSkills(deedLanguage, "k1").map((s) => s.id)).toEqual(["spell-g23"]);
    expect(chooseSkills(deedReading, "g912").map((s) => s.id)).toEqual(["sight-g23"]);
  });
});

describe("buildDeedRun", () => {
  it("returns the deed's question count with four distinct choices each", () => {
    const run = buildDeedRun(input());
    expect(run.questions).toHaveLength(8);
    for (const q of run.questions) { expect(q.choices).toHaveLength(4); expect(q.choices).toContain(q.answer); }
    expect(run.skillIds).toEqual(["sight-g23"]);
  });
  it("is deterministic for a seed", () => {
    expect(buildDeedRun(input({ seed: 9 }))).toEqual(buildDeedRun(input({ seed: 9 })));
  });
  it("never repeats a pool item and draws near the mastery level, widening when needed", () => {
    const items = [...poolItems("sight-g23", 5, 0), ...poolItems("sight-g23", 3, 4).map((i) => ({ ...i, id: `${i.id}-hi` }))];
    const run = buildDeedRun(input({ poolItems: items, masteryBySkill: { "sight-g23": 4 } }));
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(run.questions.length);
    expect(run.questions.length).toBe(8);
  });
  it("mixes in at most two recent misses for the chosen skills", () => {
    const misses: Question[] = [0, 1, 2].map((i) => ({ id: `miss-${i}`, skillId: "sight-g23", prompt: `Miss ${i}`, choices: ["x", "y", "z", "w"], answer: "x" }));
    const run = buildDeedRun(input({ recentMisses: misses }));
    expect(run.questions.filter((q) => q.id.startsWith("miss-"))).toHaveLength(2);
    expect(run.questions).toHaveLength(8);
  });
  it("ignores misses from other skills", () => {
    const misses: Question[] = [{ id: "miss-other", skillId: "mul-facts", prompt: "6 × 7", choices: ["42", "41", "43", "40"], answer: "42" }];
    expect(buildDeedRun(input({ recentMisses: misses })).questions.some((q) => q.id === "miss-other")).toBe(false);
  });
  it("trims to two choices that include the answer under fewerChoices", () => {
    const run = buildDeedRun(input({ profile: { ...profile, fewerChoices: true } }));
    for (const q of run.questions) { expect(q.choices).toHaveLength(2); expect(q.choices).toContain(q.answer); }
  });
  it("groups by skill with review last under predictableRoutine", () => {
    const misses: Question[] = [{ id: "miss-0", skillId: "add-20", prompt: "1 + 1", choices: ["2", "3", "4", "5"], answer: "2" }];
    const run = buildDeedRun(input({ deed: deedMath, poolItems: [], recentMisses: misses, profile: { ...profile, predictableRoutine: true } }));
    expect(run.questions[run.questions.length - 1].id).toBe("miss-0");
  });
  it("uses generators for math deeds", () => {
    const run = buildDeedRun(input({ deed: deedMath, poolItems: [] }));
    expect(run.questions).toHaveLength(8);
    expect(run.questions.every((q) => q.skillId === run.skillIds[0])).toBe(true);
  });
  it("returns no questions when no skill or items exist", () => {
    expect(buildDeedRun(input({ poolItems: [] })).questions).toHaveLength(0);
  });
});

describe("grading and client shape", () => {
  it("grades by exact match after trimming", () => {
    const q: Question = { id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], answer: "b" };
    expect(gradeAnswer(q, " b ")).toBe(true);
    expect(gradeAnswer(q, "B")).toBe(false);
  });
  it("strips the answer for the client", () => {
    const q: Question = { id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], answer: "b", readAloud: "pee" };
    expect(toClientQuestion(q)).toEqual({ id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], readAloud: "pee" });
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/deed-engine.ts`:
```ts
import { GENERATORS, seededRng, shuffle, type Question, type Rng } from "./drill-generators";
import { nearestBands, type ContentBand } from "./content-bands";
import { skillsFor, type Skill } from "./skills";
import type { Deed } from "./deeds";

export type ProfileLike = { fewerChoices: boolean; predictableRoutine: boolean; untimed: boolean; readAloud: boolean };

export type PoolItem = {
  id: string;
  skillId: string;
  prompt: string;
  answer: string;
  distractors: string[];
  readAloud: string | null;
  level: number;
};

export type BuildRunInput = {
  deed: Deed;
  band: ContentBand;
  masteryBySkill: Record<string, number>;
  profile: ProfileLike;
  seed: number;
  poolItems: PoolItem[];
  recentMisses: Question[];
};

export type BuiltRun = { skillIds: string[]; questions: Question[] };

/** What the browser receives: everything but the answer. */
export type ClientQuestion = Omit<Question, "answer">;

const MAX_REVIEW = 2;

/**
 * Up to two skills for the deed's area: one generator and one pool when both
 * exist at the hero's band, otherwise the nearest band that has any — easier
 * bands first, so a hero is never handed harder work than their own grade.
 */
export function chooseSkills(deed: Deed, band: ContentBand): Skill[] {
  for (const b of nearestBands(band)) {
    const candidates = skillsFor(deed.area, b);
    if (candidates.length === 0) continue;
    const generator = candidates.find((s) => s.source.kind === "generator");
    const pool = candidates.find((s) => s.source.kind === "pool");
    const picked = [generator, pool].filter((s): s is Skill => !!s);
    return picked.length > 0 ? picked : [candidates[0]];
  }
  return [];
}

function poolQuestion(item: PoolItem, rng: Rng): Question {
  return {
    id: item.id,
    skillId: item.skillId,
    prompt: item.prompt,
    choices: shuffle([item.answer, ...item.distractors], rng),
    answer: item.answer,
    readAloud: item.readAloud ?? undefined,
  };
}

/** Items within one level of the hero's rung first; widen to everything if that runs short. */
function drawPool(items: PoolItem[], level: number, count: number, rng: Rng): Question[] {
  const near = shuffle(items.filter((i) => Math.abs(i.level - level) <= 1), rng);
  const far = shuffle(items.filter((i) => Math.abs(i.level - level) > 1), rng);
  return [...near, ...far].slice(0, count).map((i) => poolQuestion(i, rng));
}

function drawGenerated(skill: Skill, level: number, count: number, rng: Rng): Question[] {
  if (skill.source.kind !== "generator") return [];
  const generator = GENERATORS[skill.source.generatorId];
  const out: Question[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const q = generator(level, rng, skill.id);
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

function trimChoices(q: Question, rng: Rng): Question {
  const other = q.choices.find((c) => c !== q.answer) ?? q.answer;
  return { ...q, choices: shuffle([q.answer, other], rng) };
}

export function buildDeedRun(input: BuildRunInput): BuiltRun {
  const { deed, band, masteryBySkill, profile, seed, poolItems, recentMisses } = input;
  const rng = seededRng(seed);
  const skills = chooseSkills(deed, band);
  const skillIds = skills.map((s) => s.id);
  if (skills.length === 0) return { skillIds: [], questions: [] };

  const review = recentMisses.filter((m) => skillIds.includes(m.skillId)).slice(0, MAX_REVIEW);
  const reviewIds = new Set(review.map((m) => m.id));
  const target = deed.questionCount;
  const fresh = Math.max(0, target - review.length);

  // Split fresh questions across the chosen skills, first skill taking the remainder.
  const perSkill = skills.map((_, i) => Math.floor(fresh / skills.length) + (i < fresh % skills.length ? 1 : 0));
  const bySkill = skills.map((skill, i) => {
    const level = masteryBySkill[skill.id] ?? 0;
    if (skill.source.kind === "generator") return drawGenerated(skill, level, perSkill[i], rng);
    const items = poolItems.filter((p) => p.skillId === skill.id && !reviewIds.has(p.id));
    return drawPool(items, level, perSkill[i], rng);
  });

  // A skill that came up short (thin pool) hands its slots to the others.
  let questions = bySkill.flat();
  if (questions.length < fresh) {
    for (const [i, skill] of skills.entries()) {
      if (questions.length >= fresh) break;
      const have = new Set(questions.map((q) => q.id));
      const extra = skill.source.kind === "generator"
        ? drawGenerated(skill, masteryBySkill[skill.id] ?? 0, fresh - questions.length + have.size, rng).filter((q) => !have.has(q.id))
        : drawPool(poolItems.filter((p) => p.skillId === skill.id && !have.has(p.id) && !reviewIds.has(p.id)), masteryBySkill[skill.id] ?? 0, fresh - questions.length, rng);
      questions = [...questions, ...extra].slice(0, fresh);
      void i;
    }
  }

  if (questions.length === 0 && review.length === 0) return { skillIds, questions: [] };

  let ordered: Question[];
  if (profile.predictableRoutine) {
    // Same shape every time: skills in catalog order, review at the end.
    ordered = [...skills.flatMap((s) => questions.filter((q) => q.skillId === s.id)), ...review];
  } else {
    ordered = shuffle([...questions, ...review], rng);
  }

  const finalQuestions = profile.fewerChoices ? ordered.map((q) => trimChoices(q, rng)) : ordered;
  return { skillIds, questions: finalQuestions };
}

export function gradeAnswer(question: Question, answer: string): boolean {
  return question.answer.trim() === answer.trim();
}

export function toClientQuestion(question: Question): ClientQuestion {
  const { answer: _answer, ...rest } = question;
  return rest;
}
```
If ESLint flags the unused `_answer` or the `void i` idiom, use the repo's convention for intentionally unused variables (check `eslint.config.*`), or restructure the loop with `for (const skill of skills)` and drop `i`.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/utils/deed-engine.test.ts` → pass. If the "never repeats" case yields fewer than 8 because the fixture has exactly 8 items, that is expected to pass (8 available → 8 drawn).
```bash
git add src/lib/utils/deed-engine.ts src/lib/utils/deed-engine.test.ts
git commit -m "Add the deed engine: skill choice, question draw, review, profile shaping, grading

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Deed actions, school counts, and hint copy

**Files:**
- Create: `src/lib/actions/deeds.ts`
- Modify: `src/lib/actions/subjects.ts` (`getSchoolCounts`), `src/lib/utils/spell-catalog.ts` (`spellUnlockHint` school copy), `src/lib/utils/spell-catalog.test.ts` (two expectations)

**Interfaces:**
- Consumes: everything from Tasks 1–7; `loadRealmSettings` from `@/lib/services/realm-play`; `profileFromRow` from `@/lib/utils/learning-profile`; `requireChildAccess`.
- Produces (types exported from the action file):
  - `DeedsOverview = { enabled: boolean; band: ContentBand; bandLabel: string; tone: "gentle" | "monsters"; buildings: BuildingOverview[]; mastery: MasteryRow[] }`
  - `BuildingOverview = { id: string; label: string; description: string; icon: GameIconName; done: number; total: number; complete: boolean; deeds: { id: string; title: string; story: string; area: SkillArea }[] }`
  - `MasteryRow = { skillId: string; label: string; area: SkillArea; level: number; levelLabel: string; lastPracticedAt: string | null }`
  - `RunStart = { runId: string; deed: { id: string; title: string; story: string }; questions: ClientQuestion[] }`
  - `AnswerResult = { correct: boolean; answer: string }`
  - `RunSummary = { correctCount: number; total: number; flawless: boolean; masteryChanges: string[]; building: { label: string; done: number; total: number; complete: boolean } }`
  - `getDeedsOverview(childId): Promise<DeedsOverview>`, `startDeedRun(childId, deedId): Promise<RunStart>`, `answerDeedQuestion(runId, index, answer): Promise<AnswerResult>`, `completeDeedRun(runId): Promise<RunSummary>`, `getMasteryOverview(childId): Promise<MasteryRow[]>`
  - `getSchoolCounts` now includes completed deed runs.

- [ ] **Step 1: Update the hint copy test first**

In `src/lib/utils/spell-catalog.test.ts`, change the two school-hint expectations to `"12 more Reading or History quests or deeds to go."` and `"5 more Math quests or deeds to go."`. Run `npx vitest run src/lib/utils/spell-catalog.test.ts` → those two fail. In `spell-catalog.ts` `spellUnlockHint`, change the school case's return to `` `${remaining} more ${joinNames(names)} quests or deeds to go.` ``. Re-run → pass.

- [ ] **Step 2: Extend `getSchoolCounts`**

In `src/lib/actions/subjects.ts` add imports `import { isNotNull } from "drizzle-orm";` (merge into the existing drizzle import) and `import { findSkill, AREA_SCHOOL } from "@/lib/utils/skills";`. After the activity-row loop in `getSchoolCounts`, add:
```ts
  // Completed deeds count too — practice in the Realm and logged schoolwork
  // pull spell parts open together. A run's school is its first skill's area.
  const runs = await db
    .select({ skillIds: schema.deedRun.skillIds })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt)));
  for (const run of runs) {
    let first: string | undefined;
    try { first = (JSON.parse(run.skillIds) as string[])[0]; } catch { first = undefined; }
    const skill = first ? findSkill(first) : null;
    if (skill) counts[AREA_SCHOOL[skill.area]] += 1;
  }
```

- [ ] **Step 3: Write the action file**

`src/lib/actions/deeds.ts`:
```ts
"use server";

import { and, desc, eq, inArray, isNotNull, isNull, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { bandForHero, BAND_LABELS, type ContentBand } from "@/lib/utils/content-bands";
import { findSkill, SKILLS, type SkillArea } from "@/lib/utils/skills";
import { BUILDINGS, buildingProgress, findBuilding } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory, findDeed } from "@/lib/utils/deeds";
import {
  buildDeedRun,
  chooseSkills,
  gradeAnswer,
  toClientQuestion,
  type ClientQuestion,
  type PoolItem,
} from "@/lib/utils/deed-engine";
import { masteryChangeCopy, masteryLabel, parseRecentResults, recordResult } from "@/lib/utils/mastery";
import type { Question } from "@/lib/utils/drill-generators";
import type { GameIconName } from "@/components/game-icon";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};
export type MasteryRow = { skillId: string; label: string; area: SkillArea; level: number; levelLabel: string; lastPracticedAt: string | null };
export type DeedsOverview = {
  enabled: boolean; band: ContentBand; bandLabel: string; tone: "gentle" | "monsters";
  buildings: BuildingOverview[]; mastery: MasteryRow[];
};
export type RunStart = { runId: string; deed: { id: string; title: string; story: string }; questions: ClientQuestion[] };
export type AnswerResult = { correct: boolean; answer: string };
export type RunSummary = {
  correctCount: number; total: number; flawless: boolean; masteryChanges: string[];
  building: { label: string; done: number; total: number; complete: boolean };
};

const CLOSED = "The Realm is closed for this hero. A grown-up can open it in the Chronicle.";
const RESUME_WINDOW_MS = 60 * 60 * 1000;

async function loadHero(childId: string) {
  const rows = await db
    .select({ grade: schema.child.grade, ageMode: schema.child.ageMode })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) throw new Error("Hero not found.");
  const settings = await loadRealmSettings(childId);
  return { band: bandForHero(rows[0].grade, rows[0].ageMode), enabled: settings.enabled, tone: settings.toneMode };
}

async function loadMasteryRows(childId: string) {
  return db.select().from(schema.skillMastery).where(eq(schema.skillMastery.childId, childId));
}

function masteryRow(row: typeof schema.skillMastery.$inferSelect): MasteryRow | null {
  const skill = findSkill(row.skillId);
  if (!skill) return null;
  return {
    skillId: row.skillId, label: skill.label, area: skill.area, level: row.level,
    levelLabel: masteryLabel(row.level), lastPracticedAt: row.lastPracticedAt ? row.lastPracticedAt.toISOString() : null,
  };
}

/** Questions the hero got wrong in their last five finished deeds, newest first. */
async function loadRecentMisses(childId: string): Promise<Question[]> {
  const runs = await db
    .select({ questions: schema.deedRun.questions, responses: schema.deedRun.responses })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt)))
    .orderBy(desc(schema.deedRun.completedAt))
    .limit(5);
  const misses: Question[] = [];
  for (const run of runs) {
    try {
      const qs = JSON.parse(run.questions) as Question[];
      const rs = JSON.parse(run.responses) as (string | null)[];
      qs.forEach((q, i) => { if (rs[i] !== null && rs[i] !== undefined && !gradeAnswer(q, rs[i]!)) misses.push(q); });
    } catch { /* a malformed old run is skipped, never fatal */ }
  }
  return misses.slice(0, 5);
}

/** A hero may see their own deeds; a closed Realm shows as such rather than throwing. */
export async function getDeedsOverview(childId: string): Promise<DeedsOverview> {
  await requireChildAccess(childId);
  const hero = await loadHero(childId);
  const [progress, mastery] = await Promise.all([
    db.select().from(schema.kingdomProgress).where(eq(schema.kingdomProgress.childId, childId)),
    loadMasteryRows(childId),
  ]);
  const doneBy = new Map(progress.map((p) => [p.buildingId, p.deedsDone]));
  const buildings: BuildingOverview[] = BUILDINGS.map((b) => {
    const { done, total, complete } = buildingProgress(doneBy.get(b.id) ?? 0, b);
    return {
      id: b.id, label: b.label, description: b.description, icon: b.icon, done, total, complete,
      deeds: deedsForBuilding(b.id).map((d) => ({ id: d.id, title: d.title, story: deedStory(d, hero.tone), area: d.area })),
    };
  });
  return {
    enabled: hero.enabled, band: hero.band, bandLabel: BAND_LABELS[hero.band], tone: hero.tone,
    buildings, mastery: mastery.map(masteryRow).filter((m): m is MasteryRow => m !== null),
  };
}

export async function getMasteryOverview(childId: string): Promise<MasteryRow[]> {
  await requireChildAccess(childId);
  return (await loadMasteryRows(childId)).map(masteryRow).filter((m): m is MasteryRow => m !== null);
}

export async function startDeedRun(childId: string, deedId: string): Promise<RunStart> {
  await requireChildAccess(childId, { write: true });
  const deed = findDeed(deedId);
  if (!deed) throw new Error("That deed is not in the chronicle.");
  const hero = await loadHero(childId);
  if (!hero.enabled) throw new Error(CLOSED);
  const story = deedStory(deed, hero.tone);

  // A run abandoned minutes ago is picked back up rather than restarted.
  const since = new Date(Date.now() - RESUME_WINDOW_MS);
  const open = await db
    .select()
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), eq(schema.deedRun.deedId, deedId), isNull(schema.deedRun.completedAt), gt(schema.deedRun.startedAt, since)))
    .limit(1);
  if (open[0]) {
    const qs = JSON.parse(open[0].questions) as Question[];
    return { runId: open[0].id, deed: { id: deed.id, title: deed.title, story }, questions: qs.map(toClientQuestion) };
  }

  const skills = chooseSkills(deed, hero.band);
  const poolSkillIds = skills.filter((s) => s.source.kind === "pool").map((s) => s.id);
  const [profileRows, masteryRows, poolRows, recentMisses] = await Promise.all([
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
    loadMasteryRows(childId),
    poolSkillIds.length > 0
      ? db.select().from(schema.drillItem).where(inArray(schema.drillItem.skillId, poolSkillIds))
      : Promise.resolve([] as (typeof schema.drillItem.$inferSelect)[]),
    loadRecentMisses(childId),
  ]);
  const profile = profileFromRow(profileRows[0] ?? null);
  const masteryBySkill: Record<string, number> = {};
  for (const m of masteryRows) masteryBySkill[m.skillId] = m.level;
  const poolItems: PoolItem[] = poolRows.map((r) => ({
    id: r.id, skillId: r.skillId, prompt: r.prompt, answer: r.answer,
    distractors: JSON.parse(r.distractors) as string[], readAloud: r.readAloud, level: r.level,
  }));

  const built = buildDeedRun({ deed, band: hero.band, masteryBySkill, profile, seed: Date.now() >>> 0, poolItems, recentMisses });
  if (built.questions.length === 0) throw new Error("No deeds are ready for this hero yet.");

  const now = new Date();
  const runId = nanoid();
  const masteryStart: Record<string, number> = {};
  for (const id of built.skillIds) masteryStart[id] = masteryBySkill[id] ?? 0;
  await db.insert(schema.deedRun).values({
    id: runId, childId, deedId, skillIds: JSON.stringify(built.skillIds), band: hero.band,
    questions: JSON.stringify(built.questions), responses: JSON.stringify(built.questions.map(() => null)),
    masteryStart: JSON.stringify(masteryStart), correctCount: 0, flawless: false,
    startedAt: now, completedAt: null, createdAt: now, updatedAt: now,
  });
  return { runId, deed: { id: deed.id, title: deed.title, story }, questions: built.questions.map(toClientQuestion) };
}

async function loadRun(runId: string) {
  const rows = await db.select().from(schema.deedRun).where(eq(schema.deedRun.id, runId)).limit(1);
  if (!rows[0]) throw new Error("That deed is not in the chronicle.");
  await requireChildAccess(rows[0].childId, { write: true });
  return rows[0];
}

export async function answerDeedQuestion(runId: string, index: number, answer: string): Promise<AnswerResult> {
  const run = await loadRun(runId);
  if (run.completedAt) throw new Error("That deed has already been finished.");
  const questions = JSON.parse(run.questions) as Question[];
  const responses = JSON.parse(run.responses) as (string | null)[];
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) throw new Error("That question is not in this deed.");
  const question = questions[index];
  // A repeat answer to the same question (double tap, retry) is not re-graded.
  if (responses[index] !== null && responses[index] !== undefined) {
    return { correct: gradeAnswer(question, responses[index]!), answer: question.answer };
  }
  const correct = gradeAnswer(question, answer);
  responses[index] = answer;
  const now = new Date();
  await db
    .update(schema.deedRun)
    .set({ responses: JSON.stringify(responses), correctCount: run.correctCount + (correct ? 1 : 0), updatedAt: now })
    .where(eq(schema.deedRun.id, runId));

  // Mastery moves on every answer, not at the end, so an abandoned run still taught something.
  const existing = await db
    .select()
    .from(schema.skillMastery)
    .where(and(eq(schema.skillMastery.childId, run.childId), eq(schema.skillMastery.skillId, question.skillId)))
    .limit(1);
  const state = recordResult(
    { level: existing[0]?.level ?? 0, recentResults: parseRecentResults(existing[0]?.recentResults ?? null) },
    correct,
  );
  if (existing[0]) {
    await db.update(schema.skillMastery).set({
      level: state.level, recentResults: JSON.stringify(state.recentResults),
      correctTotal: existing[0].correctTotal + (correct ? 1 : 0), attemptTotal: existing[0].attemptTotal + 1,
      lastPracticedAt: now, updatedAt: now,
    }).where(eq(schema.skillMastery.id, existing[0].id));
  } else {
    await db.insert(schema.skillMastery).values({
      id: nanoid(), childId: run.childId, skillId: question.skillId, level: state.level,
      recentResults: JSON.stringify(state.recentResults), correctTotal: correct ? 1 : 0, attemptTotal: 1,
      lastPracticedAt: now, createdAt: now, updatedAt: now,
    }).onConflictDoNothing();
  }
  return { correct, answer: question.answer };
}

export async function completeDeedRun(runId: string): Promise<RunSummary> {
  const run = await loadRun(runId);
  if (run.completedAt) throw new Error("That deed has already been finished.");
  const questions = JSON.parse(run.questions) as Question[];
  const responses = JSON.parse(run.responses) as (string | null)[];
  if (responses.length !== questions.length || responses.some((r) => r === null || r === undefined)) {
    throw new Error("Answer every question before finishing the deed.");
  }
  const correctCount = questions.filter((q, i) => gradeAnswer(q, responses[i]!)).length;
  const flawless = correctCount === questions.length;
  const now = new Date();
  await db.update(schema.deedRun).set({ correctCount, flawless, completedAt: now, updatedAt: now }).where(eq(schema.deedRun.id, runId));

  const deed = findDeed(run.deedId);
  const building = deed ? findBuilding(deed.buildingId) : null;
  let progress = { done: 0, total: 5, complete: false };
  if (building) {
    const existing = await db
      .select()
      .from(schema.kingdomProgress)
      .where(and(eq(schema.kingdomProgress.childId, run.childId), eq(schema.kingdomProgress.buildingId, building.id)))
      .limit(1);
    const deedsDone = (existing[0]?.deedsDone ?? 0) + 1;
    progress = buildingProgress(deedsDone, building);
    if (existing[0]) {
      await db.update(schema.kingdomProgress)
        .set({ deedsDone, completedAt: existing[0].completedAt ?? (progress.complete ? now : null), updatedAt: now })
        .where(eq(schema.kingdomProgress.id, existing[0].id));
    } else {
      await db.insert(schema.kingdomProgress).values({
        id: nanoid(), childId: run.childId, buildingId: building.id, deedsDone,
        completedAt: progress.complete ? now : null, createdAt: now, updatedAt: now,
      }).onConflictDoNothing();
    }
  }

  const masteryStart = JSON.parse(run.masteryStart) as Record<string, number>;
  const skillIds = JSON.parse(run.skillIds) as string[];
  const current = await loadMasteryRows(run.childId);
  const masteryChanges: string[] = [];
  for (const id of skillIds) {
    const skill = findSkill(id);
    const after = current.find((m) => m.skillId === id)?.level ?? 0;
    const copy = skill ? masteryChangeCopy(masteryStart[id] ?? 0, after, skill.label) : null;
    if (copy) masteryChanges.push(copy);
  }

  revalidatePath("/deeds");
  revalidatePath("/spellbook");
  revalidatePath("/loot");
  return {
    correctCount, total: questions.length, flawless, masteryChanges,
    building: { label: building?.label ?? "the kingdom", ...progress },
  };
}
```
If `SKILLS` is unused, drop that import.

- [ ] **Step 4: Verify and commit**

`npm run typecheck && npm test`. Smoke with a throwaway `npx tsx` script under `/tmp/claude-1000/` (do not commit): against `file:./local.db`, insert a `deed_run` for a demo hero with two seeded questions, then exercise the pure `gradeAnswer`/`recordResult` path the actions use and an `onConflictDoNothing` insert into `skill_mastery` twice; clean up. Record observations.
```bash
git add src/lib/actions/deeds.ts src/lib/actions/subjects.ts src/lib/utils/spell-catalog.ts src/lib/utils/spell-catalog.test.ts
git commit -m "Add deed actions, count finished deeds toward schools of magic, update hint copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Deed player, results, and picker components

**Files:**
- Create: `src/components/deed-player.tsx`, `src/components/deed-player.test.tsx`, `src/components/deed-results.tsx`, `src/components/deed-picker.tsx`, `src/components/deed-picker.test.tsx`

**Interfaces:**
- Consumes: `startDeedRun`, `answerDeedQuestion`, `completeDeedRun`, types `DeedsOverview`, `RunStart`, `RunSummary`, `ClientQuestion`, `ProfileLike`.
- Produces: `DeedPlayer({ childId, run: RunStart, profile: ProfileLike, calm: boolean, onFinished: () => void })`, `DeedResults({ summary: RunSummary, deedTitle: string, onDone: () => void })`, `DeedPicker({ childId, overview: DeedsOverview, profile: ProfileLike, calm: boolean })`.
- Accessible names used by tests: choice buttons are named by their text; `Read aloud`; `Next question`; `Finish deed`; `Back to deeds`; picker deed buttons `Begin {deed title}`; progress `Question N of M`.

- [ ] **Step 1: Write the failing tests**

`src/components/deed-player.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPlayer } from "./deed-player";
import type { RunStart } from "@/lib/actions/deeds";

const answerDeedQuestion = vi.fn();
const completeDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: (...a: unknown[]) => answerDeedQuestion(...a),
  completeDeedRun: (...a: unknown[]) => completeDeedRun(...a),
}));

const run: RunStart = {
  runId: "r1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "Help the sign-painter." },
  questions: [
    { id: "q1", skillId: "sight-g23", prompt: 'Which word is "because"?', choices: ["because", "become", "beside", "before"], readAloud: "because" },
    { id: "q2", skillId: "sight-g23", prompt: 'Which word is "again"?', choices: ["again", "against"] },
  ],
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };
const summary = { correctCount: 1, total: 2, flawless: false, masteryChanges: ["Sight words: getting stronger"], building: { label: "Village Well", done: 1, total: 5, complete: false } };

beforeEach(() => {
  vi.clearAllMocks();
  answerDeedQuestion.mockResolvedValue({ correct: false, answer: "because" });
  completeDeedRun.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("DeedPlayer", () => {
  it("shows the question, grades a tap, and reveals the answer", async () => {
    const user = userEvent.setup();
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText('Which word is "because"?')).toBeInTheDocument();
    expect(screen.getByLabelText("Question 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "become" }));
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "become");
    expect(await screen.findByText("Not quite. The answer was because.")).toBeInTheDocument();
  });

  it("advances with Next and finishes after the last question", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: true, answer: "because" });
    const onFinished = vi.fn();
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={true} onFinished={onFinished} />);
    await user.click(screen.getByRole("button", { name: "because" }));
    await user.click(await screen.findByRole("button", { name: "Next question" }));
    expect(screen.getByText('Which word is "again"?')).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(again|against)$/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "again" }));
    await user.click(await screen.findByRole("button", { name: "Finish deed" }));
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(await screen.findByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByText("Sight words: getting stronger")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to deeds" }));
    expect(onFinished).toHaveBeenCalled();
  });

  it("hides the speaker when the browser cannot speak", () => {
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
  });
});
```

`src/components/deed-picker.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPicker } from "./deed-picker";
import type { DeedsOverview } from "@/lib/actions/deeds";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const startDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: (...a: unknown[]) => startDeedRun(...a),
  answerDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));

const overview: DeedsOverview = {
  enabled: true, band: "g23", bandLabel: "Grades 2–3", tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "Water.", icon: "box", done: 5, total: 5, complete: true, deeds: [{ id: "well-signs", title: "Signs for the Well", story: "Help.", area: "reading" }] },
    { id: "mill", label: "Grain Mill", description: "Flour.", icon: "compass", done: 0, total: 5, complete: false, deeds: [{ id: "mill-sacks", title: "Sacks at the Mill", story: "Count.", area: "math" }] },
    { id: "bridge", label: "River Bridge", description: "Cross.", icon: "link", done: 2, total: 5, complete: false, deeds: [{ id: "bridge-planks", title: "Planks for the Bridge", story: "Measure.", area: "math" }] },
  ],
  mastery: [],
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };

beforeEach(() => { vi.clearAllMocks(); startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "bridge-planks", title: "Planks for the Bridge", story: "Measure." }, questions: [{ id: "q", skillId: "add-20", prompt: "What is 1 + 1?", choices: ["2", "3", "4", "5"] }] }); });
afterEach(cleanup);

describe("DeedPicker", () => {
  it("lists in-progress buildings first and built ones last", () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["River Bridge", "Grain Mill", "Village Well"]);
    expect(within(screen.getByText("Village Well").closest("section")!).getByText("Built")).toBeInTheDocument();
  });

  it("begins a deed and mounts the player", async () => {
    const user = userEvent.setup();
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    await user.click(screen.getByRole("button", { name: "Begin Planks for the Bridge" }));
    expect(startDeedRun).toHaveBeenCalledWith("c1", "bridge-planks");
    expect(await screen.findByText("What is 1 + 1?")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Write the components**

`src/components/deed-results.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import type { RunSummary } from "@/lib/actions/deeds";

export function DeedResults({ summary, deedTitle, onDone }: { summary: RunSummary; deedTitle: string; onDone: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <GameIcon name={summary.flawless ? "star" : "check"} className="mx-auto size-10 text-[var(--gold-bright)]" />
      <h3 className="text-lg font-bold">{summary.flawless ? "Flawless!" : "Deed done!"}</h3>
      <p className="text-sm">{summary.correctCount} of {summary.total} right in {deedTitle}.</p>
      {summary.masteryChanges.length > 0 && (
        <ul className="space-y-1 text-sm">
          {summary.masteryChanges.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        {summary.building.complete
          ? `${summary.building.label} is built!`
          : `${summary.building.label}: ${summary.building.done} of ${summary.building.total} deeds`}
      </p>
      <Button onClick={onDone}>Back to deeds</Button>
    </div>
  );
}
```

`src/components/deed-player.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedResults } from "@/components/deed-results";
import { answerDeedQuestion, completeDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import type { ProfileLike } from "@/lib/utils/deed-engine";

type Feedback = { correct: boolean; answer: string };

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function DeedPlayer({
  childId,
  run,
  profile,
  calm,
  onFinished,
}: {
  childId: string;
  run: RunStart;
  profile: ProfileLike;
  calm: boolean;
  onFinished: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const speakable = canSpeak();
  const question = run.questions[index];
  const isLast = index === run.questions.length - 1;
  void childId;

  // Read-aloud is a side effect, not state: the profile asks for it, the effect obeys.
  useEffect(() => {
    if (profile.readAloud && question) speak(question.readAloud ?? question.prompt);
  }, [profile.readAloud, question]);

  // A soft elapsed-time chip when the hero hasn't asked for untimed play.
  useEffect(() => {
    if (profile.untimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile.untimed]);

  async function choose(choice: string) {
    if (feedback || busy) return;
    setBusy(true);
    setError("");
    try {
      setFeedback(await answerDeedQuestion(run.runId, index, choice));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!isLast) {
      setIndex(index + 1);
      setFeedback(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSummary(await completeDeedRun(run.runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <GameFrame title={run.deed.title} icon={<GameIcon name="map" className="size-4 text-[var(--gold-bright)]" />}>
        <DeedResults summary={summary} deedTitle={run.deed.title} onDone={onFinished} />
      </GameFrame>
    );
  }

  const minutes = Math.floor((now - startedAt) / 60_000);

  return (
    <GameFrame
      title={run.deed.title}
      icon={<GameIcon name="map" className="size-4 text-[var(--gold-bright)]" />}
      action={!profile.untimed ? <span className="text-xs text-muted-foreground">{minutes} min</span> : undefined}
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{run.deed.story}</p>
        <div className="flex items-center gap-1" aria-label={`Question ${index + 1} of ${run.questions.length}`} role="img">
          {run.questions.map((q, i) => (
            <span key={q.id} className={`size-2 rounded-full ${i < index ? "bg-[var(--gold-bright)]" : i === index ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error} <Button size="xs" variant="ghost" onClick={() => setError("")}>Try again</Button></div>}
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xl font-medium">{question.prompt}</p>
          {speakable && (
            <Button size="sm" variant="outline" aria-label="Read aloud" onClick={() => speak(question.readAloud ?? question.prompt)}>
              <GameIcon name="bellOff" className="size-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {question.choices.map((choice) => {
            const isAnswer = feedback?.answer === choice;
            const tone = feedback ? (isAnswer ? "border-[var(--gold-border)] bg-muted/40" : "opacity-60") : "border-gold-dim bg-muted/20";
            return (
              <button
                key={choice}
                type="button"
                disabled={!!feedback || busy}
                onClick={() => choose(choice)}
                className={`min-h-16 rounded-lg border px-4 py-3 text-lg ${tone} ${!calm && isAnswer && feedback?.correct ? "deed-sparkle" : ""}`}
              >
                {choice}
              </button>
            );
          })}
        </div>
        {feedback && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{feedback.correct ? "That's it!" : `Not quite. The answer was ${feedback.answer}.`}</p>
            <Button aria-label={isLast ? "Finish deed" : "Next question"} disabled={busy} onClick={next}>
              {isLast ? "Finish deed" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </GameFrame>
  );
}
```
Add to `src/app/globals.css`, near the other animations: `.deed-sparkle { animation: deed-sparkle 400ms ease-out; } @keyframes deed-sparkle { from { box-shadow: 0 0 0 0 var(--glow-gold); } to { box-shadow: 0 0 12px 4px transparent; } } @media (prefers-reduced-motion: reduce) { .deed-sparkle { animation: none; } }`. Choose a speaker-like icon that exists in the registry (`bellOff` is a placeholder name; if `sparkles` or another reads better, use it — the test only checks the accessible name).

`src/components/deed-picker.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { DeedPlayer } from "@/components/deed-player";
import { startDeedRun, type DeedsOverview, type RunStart } from "@/lib/actions/deeds";
import type { ProfileLike } from "@/lib/utils/deed-engine";

export function DeedPicker({ childId, overview, profile, calm }: { childId: string; overview: DeedsOverview; profile: ProfileLike; calm: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Work in progress leads, untouched buildings follow, finished ones rest at the end.
  const rank = (b: DeedsOverview["buildings"][number]) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
  const buildings = [...overview.buildings].sort((a, b) => rank(a) - rank(b));

  async function begin(deedId: string) {
    setBusy(true);
    setError("");
    try {
      setRun(await startDeedRun(childId, deedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  if (run) {
    return <DeedPlayer childId={childId} run={run} profile={profile} calm={calm} onFinished={() => { setRun(null); router.refresh(); }} />;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      {buildings.map((b) => (
        <section key={b.id} className="rounded-lg border border-gold-dim bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <GameIcon name={b.icon} className="size-6 text-[var(--gold-bright)]" />
            <div className="flex-1">
              <h3 className="font-medium">{b.label}</h3>
              <p className="text-xs text-muted-foreground">{b.description}</p>
            </div>
            {b.complete ? (
              <span className="rounded-full bg-[rgba(201,168,76,0.15)] px-2 py-0.5 text-xs font-semibold text-[var(--gold-bright)]">Built</span>
            ) : (
              <span className="text-xs text-muted-foreground">{b.done} of {b.total}</span>
            )}
          </div>
          <div className="xp-bar-track mt-2"><div className="xp-bar-fill" style={{ width: `${(b.done / b.total) * 100}%` }} /></div>
          <ul className="mt-3 space-y-2">
            {b.deeds.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold-dim px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.story}</p>
                </div>
                <Button size="sm" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => begin(d.id)}>Begin</Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests, commit**

Run: `npx vitest run src/components/deed-player.test.tsx src/components/deed-picker.test.tsx` → pass. Lint must add no new errors; the two effects call `speak` and `setInterval` only (no synchronous setState in an effect body).
```bash
git add src/components/deed-player.tsx src/components/deed-player.test.tsx src/components/deed-results.tsx src/components/deed-picker.tsx src/components/deed-picker.test.tsx src/app/globals.css
git commit -m "Add the deed player, results, and picker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Deeds page, nav, and the parent Mastery panel

**Files:**
- Create: `src/app/(app)/deeds/page.tsx`, `src/app/(app)/settings/mastery-panel.tsx`
- Modify: `src/components/nav-items.ts`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/child-list.tsx`

**Interfaces:**
- Consumes: `getDeedsOverview`, `getMasteryOverview`, `MasteryRow`; `getLearningProfile` from `@/lib/actions/learning-profile`; `DeedPicker`.
- Produces: `MasteryPanel({ mastery: MasteryRow[] })`.

- [ ] **Step 1: The page**

`src/app/(app)/deeds/page.tsx`:
```tsx
import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getDeedsOverview } from "@/lib/actions/deeds";
import { getLearningProfile } from "@/lib/actions/learning-profile";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedPicker } from "@/components/deed-picker";

export default async function DeedsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Deeds</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="map" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the kingdom can call for help.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Deeds</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to take up deeds.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const [overview, profile] = await Promise.all([getDeedsOverview(activeChild.id), getLearningProfile(activeChild.id)]);
  const calm = profile.reducedMotion || profile.lowStimulus;

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? "My Deeds" : `${activeChild.displayName}'s Deeds`}</h1>
          <p className="mt-1 text-muted-foreground">Help the folk of the kingdom. Each deed raises a building and strengthens your magic. &middot; {overview.bandLabel}</p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      {overview.enabled ? (
        <DeedPicker childId={activeChild.id} overview={overview} profile={profile} calm={calm} />
      ) : (
        <GameFrame>
          <p className="py-4 text-center text-muted-foreground">The Realm is closed for this hero. A grown-up can open it in the Chronicle.</p>
        </GameFrame>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Nav**

In `src/components/nav-items.ts` insert before the Loot entry:
```ts
  {
    href: "/deeds",
    label: "Deeds",
    icon: "map",
    description: "Help the folk of your kingdom — each deed raises a building and strengthens your magic.",
  },
```

- [ ] **Step 3: Mastery panel**

`src/app/(app)/settings/mastery-panel.tsx`:
```tsx
import type { MasteryRow } from "@/lib/actions/deeds";

const AREA_LABELS: Record<string, string> = { math: "Math", reading: "Reading", language: "Language", science: "Science" };

export function MasteryPanel({ mastery }: { mastery: MasteryRow[] }) {
  const areas = ["math", "reading", "language", "science"].filter((a) => mastery.some((m) => m.area === a));
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Deeds &amp; Mastery</h4>
      <p className="text-xs text-muted-foreground">
        Deeds are practice inside the Realm. They never appear in the learning log or count as school time.
      </p>
      {mastery.length === 0 ? (
        <p className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">No deeds yet.</p>
      ) : (
        areas.map((area) => (
          <div key={area} className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{AREA_LABELS[area]}</p>
            <ul className="space-y-1 text-sm">
              {mastery.filter((m) => m.area === area).map((m) => (
                <li key={m.skillId} className="flex justify-between gap-2">
                  <span>{m.label}</span>
                  <span className="text-muted-foreground">{m.levelLabel}{m.lastPracticedAt ? ` · ${new Date(m.lastPracticedAt).toLocaleDateString()}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
```
`src/app/(app)/settings/page.tsx`: import `getMasteryOverview`; in the per-child `Promise.all` add `isChildView ? null : getMasteryOverview(child.id)` (destructure `mastery`) and return it. `child-list.tsx`: import `MasteryPanel` and `type MasteryRow`; add `mastery?: MasteryRow[] | null;` to `Child`; render after `RealmSettingsPanel`:
```tsx
        {!isChildView && child.mastery && <MasteryPanel mastery={child.mastery} />}
```

- [ ] **Step 4: Verify and commit**

`npm run typecheck && npm run lint && npm test` (no new lint errors).
```bash
git add "src/app/(app)/deeds/page.tsx" src/components/nav-items.ts "src/app/(app)/settings/mastery-panel.tsx" "src/app/(app)/settings/page.tsx" "src/app/(app)/settings/child-list.tsx"
git commit -m "Add the Deeds page, nav item, and the parent Mastery panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full gate** — `npm run typecheck && npm test`; `npm run lint` shows only the pre-existing error.
- [ ] **Step 2: Data** — one new migration `0023_*`; `npm run db:seed-drills` twice reports the same count.
- [ ] **Step 3: Spec walk** — A bands/skills/generators/pools → Tasks 2–4; B mastery/engine → Tasks 5, 7; C buildings/deeds/tables/records/school counts/access → Tasks 1, 6, 8; D page/nav/player/picker/mastery panel → Tasks 9–10; access table: run mutations allow the hero (write access, no `isChildActor` rejection). Anything missing is a new task.
- [ ] **Step 4: Hand off** — `superpowers:finishing-a-development-branch` (the branch now carries slices 1–3).
