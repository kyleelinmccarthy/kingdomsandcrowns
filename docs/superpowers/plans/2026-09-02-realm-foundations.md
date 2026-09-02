# Realm Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the three.js Realm will read from, with no 3D: seasons and crowns driven by the hero's grade, per-hero Realm settings, recess blocks, a learning profile of accommodation toggles, an append-only play-time ledger with access rules, and one tested level formula.

**Architecture:** Every rule is a pure function in `src/lib/utils/` with a colocated test written first. Server actions in `src/lib/actions/` stay thin: gate with `requireChildAccess`, call the pure function, write with Drizzle, `revalidatePath`. Cross-action orchestration lives in `src/lib/services/`. Panels are small client components, one file each, mounted from existing pages.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45 on libsql/Turso, Vitest 4 + Testing Library, Tailwind v4, shadcn primitives in `src/components/ui/`.

**Spec:** `docs/superpowers/specs/2026-09-02-realm-foundations-design.md` (read it first; program context in `docs/superpowers/specs/2026-09-02-realm-program-overview.md`).

## Global Constraints

- Branch: work on `realm-foundations` (already created). Never commit to `main`.
- `"use server"` files export only async functions. Types, constants, and pure helpers go in `src/lib/utils/`.
- Parent-only mutations: `const { access, familyId } = await requireChildAccess(childId, { write: true }); if (isChildActor(access)) throw new Error("...")` (pattern in `src/lib/actions/quest-assignments.ts:735`).
- IDs are `nanoid()`. Timestamps are `new Date()` into `integer(..., { mode: "timestamp" })`. Dates are ISO `YYYY-MM-DD` strings. Times are `"HH:mm"` 24h strings.
- Copy uses the app's medieval voice (hero, grown-up, Chronicle, Realm). Error messages are player-facing sentences.
- Vitest: `npx vitest run <path>` for one file, `npm test` for all. Tests live next to source as `*.test.ts(x)`.
- After editing `src/lib/db/schema.ts`: `npm run db:generate` then `npm run db:migrate` (a hook may also run migrate; verify instead of trusting it).
- Comments explain *why* a rule exists, matching the repo's register.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Final gate: `npm run typecheck && npm run lint && npm test` all pass.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/utils/level.ts` (+test) | `XP_PER_LEVEL`, `levelFromXp` |
| `src/lib/utils/age-mode.ts` (+test, exists) | add `resolveAge`, `gradeIndex`, `compareGrades` |
| `src/lib/utils/crown-catalog.ts` | 13 crown tiers, `crownForOrdinal`, `crownById` |
| `src/lib/utils/seasons.ts` (+test) | season types, `seasonLabel`, `nextOrdinal`, `planSeasonTransition` |
| `src/lib/services/season-sync.ts` | `syncSeasonForGrade`, `ensureSeason` (DB) |
| `src/lib/actions/seasons.ts` | `getSeasons` |
| `src/lib/actions/children.ts` (exists) | import `resolveAge` from utils; call season sync |
| `src/components/crown-badge.tsx` | one crown icon with tier color and label |
| `src/app/(app)/settings/season-panel.tsx` (+test) | read-only season history in the Chronicle |
| `src/components/crowns-panel.tsx` | Crowns panel on Loot |
| `src/lib/utils/learning-profile.ts` (+test) | profile type, defaults, presets, `applyPreset`, `profileFromRow`, `readingAttributes` |
| `src/lib/actions/learning-profile.ts` | get-or-create, update, apply preset |
| `src/app/(app)/settings/learning-profile-panel.tsx` (+test) | presets + toggles |
| `src/lib/utils/realm-access.ts` (+test) | ledger math, `computeRealmAccess` |
| `src/lib/utils/realm-settings.ts` (+test) | settings type, defaults, `validateRealmSettingsPatch` |
| `src/lib/services/realm-play.ts` | `loadRealmSettings`, `loadLedger`, `grantEarnedMinutesForCompletion` |
| `src/lib/actions/realm-play.ts` | `getRealmAccess`, `recordRealmPlay`, `grantRealmMinutes`, `getRealmPlaySummary` |
| `src/lib/actions/realm-settings.ts` | `getRealmSettings`, `updateRealmSettings` |
| `src/app/(app)/settings/realm-settings-panel.tsx` (+test) | Realm settings + grant minutes |
| `src/lib/utils/recess-blocks.ts` (+test) | `isValidTimeRange`, `findRecessConflict` |
| `src/lib/actions/recess-blocks.ts` | list, add, remove |
| `src/components/recess-blocks-panel.tsx` | Recess panel on Schedule |
| `src/lib/db/schema.ts` (exists) | five new tables |

---

### Task 1: Level util and refactor

**Files:**
- Create: `src/lib/utils/level.ts`, `src/lib/utils/level.test.ts`
- Modify: `src/lib/actions/castle.ts:35,64`, `src/lib/actions/badges.ts:142`, `src/lib/actions/avatar.ts:39`, `src/app/(app)/tavern/page.tsx:124`, `src/app/(app)/tavern/parent-dashboard.tsx:162`, `src/app/(app)/settings/child-list.tsx:819`, `src/app/(app)/castle/page.tsx:42`, `src/app/(app)/loot/page.tsx:68`

**Interfaces:**
- Produces: `XP_PER_LEVEL: 100`, `levelFromXp(xp: number): number`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/level.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { levelFromXp, XP_PER_LEVEL } from "./level";

describe("levelFromXp", () => {
  it("starts at level 1 with no XP", () => {
    expect(levelFromXp(0)).toBe(1);
  });
  it("stays on level 1 just below the threshold", () => {
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1);
  });
  it("reaches level 2 exactly at the threshold", () => {
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2);
  });
  it("scales linearly (level 50 is the castle unlock)", () => {
    expect(levelFromXp(4900)).toBe(50);
  });
  it("treats negative XP as level 1", () => {
    expect(levelFromXp(-10)).toBe(1);
  });
  it("treats NaN as level 1", () => {
    expect(levelFromXp(Number.NaN)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/level.test.ts`
Expected: FAIL, cannot resolve `./level`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/level.ts`:
```ts
/** XP needed to climb one level. Level 1 starts at 0 XP. */
export const XP_PER_LEVEL = 100;

/**
 * The one level formula. It used to be inlined in nine places; anything that
 * shows or gates on a level must call this so the rule can change in one spot.
 * Unusable input (negative, NaN) is level 1 rather than an exception, because
 * a display should never crash over a bad counter.
 */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/level.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Replace the nine inline formulas**

In each file add `import { levelFromXp } from "@/lib/utils/level";` and replace the line:

| File | Old | New |
|---|---|---|
| `src/lib/actions/castle.ts` (two sites) | `const level = Math.floor(child.currentXp / 100) + 1;` | `const level = levelFromXp(child.currentXp);` |
| `src/lib/actions/badges.ts` | `const level = Math.floor(child[0].currentXp / 100) + 1;` | `const level = levelFromXp(child[0].currentXp);` |
| `src/lib/actions/avatar.ts` | `const level = Math.floor(child.currentXp / 100) + 1;` | `const level = levelFromXp(child.currentXp);` |
| `src/app/(app)/tavern/page.tsx` | `const level = Math.floor(activeChild.currentXp / 100) + 1;` | `const level = levelFromXp(activeChild.currentXp);` |
| `src/app/(app)/tavern/parent-dashboard.tsx` | `const level = Math.floor(child.currentXp / 100) + 1;` | `const level = levelFromXp(child.currentXp);` |
| `src/app/(app)/settings/child-list.tsx` | `const level = Math.floor(child.currentXp / 100) + 1;` | `const level = levelFromXp(child.currentXp);` |
| `src/app/(app)/castle/page.tsx` | `const level = Math.floor(activeChild.currentXp / 100) + 1;` | `const level = levelFromXp(activeChild.currentXp);` |
| `src/app/(app)/loot/page.tsx` | `const level = Math.floor(xp / 100) + 1;` | `const level = levelFromXp(xp);` |

Leave the `xpInLevel = ... % 100` lines alone. Confirm none remain: `grep -rn "currentXp / 100\|xp / 100" src` must print nothing.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean typecheck, all tests pass.

```bash
git add src/lib/utils/level.ts src/lib/utils/level.test.ts src/lib/actions src/app
git commit -m "Extract level formula into one tested util

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the `castle` table, around line 628)
- Generated: `src/lib/db/migrations/0021_*.sql`

**Interfaces:**
- Produces: Drizzle tables `season`, `realmSettings`, `recessBlock`, `learningProfile`, `realmPlayLedger` exported from `@/lib/db/schema`.

- [ ] **Step 1: Add the `sql` import**

At the top of `src/lib/db/schema.ts` add:
```ts
import { sql } from "drizzle-orm";
```

- [ ] **Step 2: Append the five tables**

```ts
// ── The Realm: seasons and crowns ───────────────────────────

/**
 * A season is a hero's time in one grade. It opens when the hero gets a grade
 * and completes when a grown-up moves them up a grade — that promotion is the
 * signal that the grade is done, so no one has to "end" anything by hand. The
 * crown for a completed season is chosen by ordinal (first season, second...),
 * which is stored rather than derived so a tier never changes after the fact.
 */
export const season = sqliteTable(
  "season",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(), // "K", "1".."12"
    ordinal: integer("ordinal").notNull(),
    startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
    endDate: text("end_date"), // ISO YYYY-MM-DD, set on completion
    completedAt: integer("completed_at", { mode: "timestamp" }), // null = open
    crownId: text("crown_id"), // crown-catalog id, minted on completion
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("season_child_idx").on(table.childId),
    // At most one open season per hero.
    uniqueIndex("season_open_unique_idx")
      .on(table.childId)
      .where(sql`${table.completedAt} IS NULL`),
  ]
);

// ── The Realm: parent-controlled settings ───────────────────

export const realmSettings = sqliteTable(
  "realm_settings",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .unique()
      .references(() => child.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // earned: minutes come from completed quests; scheduled: recess blocks;
    // both: either opens the Realm.
    accessMode: text("access_mode", { enum: ["earned", "scheduled", "both"] })
      .notNull()
      .default("earned"),
    earnedMinutesPerQuest: integer("earned_minutes_per_quest").notNull().default(5),
    // Play allowed outside school hours and on non-school days.
    offHoursEnabled: integer("off_hours_enabled", { mode: "boolean" }).notNull().default(false),
    // Hard screen-time ceiling per local day, whatever the mode.
    dailyCapMinutes: integer("daily_cap_minutes").notNull().default(30),
    toneMode: text("tone_mode", { enum: ["gentle", "monsters"] }).notNull().default("gentle"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  }
);

/**
 * Scheduled recess. Its own table, not a subject-less schedule_block: thirteen
 * files assume a schedule block has a subject, and a break must not ripple
 * through all of them.
 */
export const recessBlock = sqliteTable(
  "recess_block",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week", {
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    }).notNull(),
    startTime: text("start_time").notNull(), // "HH:mm"
    endTime: text("end_time").notNull(), // "HH:mm"
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("recess_block_child_day_idx").on(table.childId, table.dayOfWeek)]
);

// ── The Realm: learning profile ─────────────────────────────

/**
 * Accommodation toggles only. Presets in the UI pre-fill these; the preset
 * name is never stored and no column names a diagnosis. A child's record
 * should describe what helps them, not label them.
 */
export const learningProfile = sqliteTable(
  "learning_profile",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .unique()
      .references(() => child.id, { onDelete: "cascade" }),
    readingFont: integer("reading_font", { mode: "boolean" }).notNull().default(false),
    largerText: integer("larger_text", { mode: "boolean" }).notNull().default(false),
    extraSpacing: integer("extra_spacing", { mode: "boolean" }).notNull().default(false),
    readAloud: integer("read_aloud", { mode: "boolean" }).notNull().default(false),
    untimed: integer("untimed", { mode: "boolean" }).notNull().default(false),
    sessionMinutes: integer("session_minutes"), // null = no break suggestion
    fewerChoices: integer("fewer_choices", { mode: "boolean" }).notNull().default(false),
    reducedMotion: integer("reduced_motion", { mode: "boolean" }).notNull().default(false),
    lowStimulus: integer("low_stimulus", { mode: "boolean" }).notNull().default(false),
    predictableRoutine: integer("predictable_routine", { mode: "boolean" }).notNull().default(false),
    soundEnabled: integer("sound_enabled", { mode: "boolean" }).notNull().default(true),
    inputMode: text("input_mode", { enum: ["auto", "touch", "keyboard"] }).notNull().default("auto"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  }
);

// ── The Realm: play-time ledger ─────────────────────────────

/**
 * Append-only. A day's balance is earned + granted − spent, recomputed from
 * rows every time, the same discipline XP follows. Nothing here is updated
 * or deleted by the app.
 */
export const realmPlayLedger = sqliteTable(
  "realm_play_ledger",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // hero's local ISO day
    kind: text("kind", { enum: ["earned", "granted", "spent"] }).notNull(),
    minutes: integer("minutes").notNull(),
    // No FK: assignments can be deleted and the minutes must survive.
    sourceAssignmentId: text("source_assignment_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("realm_play_ledger_child_date_idx").on(table.childId, table.date)]
);
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0021_<name>.sql` creating five tables and the partial unique index (`CREATE UNIQUE INDEX \`season_open_unique_idx\` ON \`season\` (\`child_id\`) WHERE "season"."completed_at" IS NULL`). Open the file and confirm.

Run: `npm run db:migrate`
Expected: applies without error.

Verify: `node -e "const {createClient}=require('@libsql/client');createClient({url:'file:./local.db'}).execute(\"select name from sqlite_master where type='table' and name in ('season','realm_settings','recess_block','learning_profile','realm_play_ledger')\").then(r=>console.log(r.rows))"`
Expected: five rows.

- [ ] **Step 4: Commit**

Run: `npm run typecheck`
```bash
git add src/lib/db
git commit -m "Add season, realm settings, recess block, learning profile, and play ledger tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Grade helpers move into `age-mode.ts`

**Files:**
- Modify: `src/lib/utils/age-mode.ts`, `src/lib/utils/age-mode.test.ts`, `src/lib/actions/children.ts:20-38`

**Interfaces:**
- Produces: `resolveAge(birthYear?: number, grade?: string): { birthYear: number | null; grade: string | null; ageMode: AgeMode }`, `gradeIndex(grade: string): number`, `compareGrades(a: string, b: string): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/age-mode.test.ts` (keep existing imports; add `resolveAge, compareGrades, gradeIndex` to the import from `./age-mode`):
```ts
describe("gradeIndex", () => {
  it("places kindergarten before first grade", () => {
    expect(gradeIndex("K")).toBe(0);
    expect(gradeIndex("1")).toBe(1);
  });
});

describe("compareGrades", () => {
  it("orders K below 1", () => {
    expect(compareGrades("K", "1")).toBeLessThan(0);
  });
  it("orders numerically, not as strings", () => {
    expect(compareGrades("3", "10")).toBeLessThan(0);
    expect(compareGrades("10", "9")).toBeGreaterThan(0);
  });
  it("returns 0 for the same grade", () => {
    expect(compareGrades("7", "7")).toBe(0);
  });
});

describe("resolveAge", () => {
  it("prefers grade and derives its age band", () => {
    expect(resolveAge(undefined, "4")).toEqual({ birthYear: null, grade: "4", ageMode: "elementary" });
  });
  it("falls back to birth year", () => {
    const year = new Date().getFullYear() - 16;
    expect(resolveAge(year, undefined)).toEqual({ birthYear: year, grade: null, ageMode: "high" });
  });
  it("rejects an unknown grade", () => {
    expect(() => resolveAge(undefined, "13")).toThrow("valid grade");
  });
  it("requires one of the two", () => {
    expect(() => resolveAge(undefined, undefined)).toThrow("birth year or a grade");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/age-mode.test.ts`
Expected: FAIL, `resolveAge`/`compareGrades`/`gradeIndex` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/utils/age-mode.ts`:
```ts
/** Kindergarten sorts before "1"; everything else is its number. */
export function gradeIndex(grade: string): number {
  if (grade === "K") return 0;
  const n = parseInt(grade, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Negative when a is the lower grade, zero when equal, positive when higher. */
export function compareGrades(a: string, b: string): number {
  return gradeIndex(a) - gradeIndex(b);
}

/**
 * Resolve age inputs into the stored fields. The parent provides EITHER a birth
 * year or a grade; ageMode is derived from whichever is present.
 */
export function resolveAge(
  birthYear?: number,
  grade?: string
): { birthYear: number | null; grade: string | null; ageMode: AgeMode } {
  if (grade) {
    if (!isValidGrade(grade)) throw new Error("Please choose a valid grade.");
    return { birthYear: null, grade, ageMode: ageModeFromGrade(grade) };
  }
  if (birthYear) {
    return { birthYear, grade: null, ageMode: deriveAgeMode(birthYear) };
  }
  throw new Error("Add a birth year or a grade for this hero.");
}
```

In `src/lib/actions/children.ts`: delete the local `resolveAge` function (lines 20-38) and change the import to
```ts
import { resolveAge } from "@/lib/utils/age-mode";
```
(remove `deriveAgeMode`, `ageModeFromGrade`, `isValidGrade`, `AgeMode` from that import if nothing else in the file uses them; typecheck will tell you).

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/utils/age-mode.test.ts && npm run typecheck`
Expected: pass.
```bash
git add src/lib/utils/age-mode.ts src/lib/utils/age-mode.test.ts src/lib/actions/children.ts
git commit -m "Move resolveAge into age-mode utils and add grade comparison

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Crown catalog and season transition rules

**Files:**
- Create: `src/lib/utils/crown-catalog.ts`, `src/lib/utils/seasons.ts`, `src/lib/utils/seasons.test.ts`

**Interfaces:**
- Consumes: `compareGrades` from Task 3.
- Produces:
  - `CrownTier = { ordinal: number; id: string; label: string; description: string; icon: "crown" | "fireCrown"; color: string }`, `CROWNS: CrownTier[]`, `crownForOrdinal(ordinal: number): CrownTier`, `crownById(id: string): CrownTier | null`
  - `SeasonRecord = { id: string; grade: string; ordinal: number; startDate: string; endDate: string | null; crownId: string | null }`
  - `SeasonLike = Pick<SeasonRecord, "id" | "grade" | "ordinal" | "startDate">`
  - `TransitionInput`, `TransitionPlan` (below), `seasonLabel(startDate: string): string`, `nextOrdinal(count: number): number`, `planSeasonTransition(input: TransitionInput): TransitionPlan`

- [ ] **Step 1: Write the crown catalog (data only, no test needed beyond the seasons test that reads it)**

`src/lib/utils/crown-catalog.ts`:
```ts
/** Crowns ascend by season ordinal, so a returning learner always earns a grander one. */
export type CrownTier = {
  ordinal: number;
  id: string;
  label: string;
  description: string;
  icon: "crown" | "fireCrown"; // GameIcon registry names
  color: string;
};

export const CROWNS: CrownTier[] = [
  { ordinal: 1, id: "crown-copper", label: "Copper Circlet", description: "A first crown, humble and hard-won.", icon: "crown", color: "#b87333" },
  { ordinal: 2, id: "crown-iron", label: "Iron Crown", description: "Forged by a second year of learning.", icon: "crown", color: "#8a8f98" },
  { ordinal: 3, id: "crown-silver", label: "Silver Crown", description: "Three seasons bright.", icon: "crown", color: "#c0c0c0" },
  { ordinal: 4, id: "crown-gold", label: "Gold Crown", description: "Four years of steady rule.", icon: "crown", color: "#d4a843" },
  { ordinal: 5, id: "crown-jeweled", label: "Jeweled Crown", description: "Set with the gems of five seasons.", icon: "crown", color: "#3ecfff" },
  { ordinal: 6, id: "crown-emerald", label: "Emerald Crown", description: "Green as a kingdom in full growth.", icon: "crown", color: "#22c55e" },
  { ordinal: 7, id: "crown-sapphire", label: "Sapphire Crown", description: "Deep as seven years of wisdom.", icon: "crown", color: "#3b82f6" },
  { ordinal: 8, id: "crown-ruby", label: "Ruby Crown", description: "Eight seasons burning bright.", icon: "crown", color: "#ef4444" },
  { ordinal: 9, id: "crown-amethyst", label: "Amethyst Crown", description: "Royal purple for a ninth year.", icon: "crown", color: "#a855f7" },
  { ordinal: 10, id: "crown-diamond", label: "Diamond Crown", description: "Ten seasons, unbreakable.", icon: "crown", color: "#e0f2fe" },
  { ordinal: 11, id: "crown-starlight", label: "Starlight Crown", description: "Lit by eleven years of quests.", icon: "crown", color: "#fde68a" },
  { ordinal: 12, id: "crown-sunfire", label: "Sunfire Crown", description: "Twelve seasons ablaze.", icon: "fireCrown", color: "#f97316" },
  { ordinal: 13, id: "crown-radiant", label: "Radiant Crown", description: "The legendary crown of a full journey, K through 12.", icon: "fireCrown", color: "#fff7cc" },
];

/** Ordinals past the last tier keep earning the last tier. */
export function crownForOrdinal(ordinal: number): CrownTier {
  const clamped = Math.min(Math.max(1, Math.floor(ordinal)), CROWNS.length);
  return CROWNS[clamped - 1];
}

export function crownById(id: string): CrownTier | null {
  return CROWNS.find((c) => c.id === id) ?? null;
}
```

- [ ] **Step 2: Write the failing seasons test**

`src/lib/utils/seasons.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planSeasonTransition, seasonLabel, nextOrdinal, type TransitionInput } from "./seasons";
import { crownForOrdinal, CROWNS } from "./crown-catalog";

const open = { id: "s-open", grade: "3", ordinal: 2, startDate: "2026-08-15" };
const previous = { id: "s-prev", grade: "2", ordinal: 1, startDate: "2025-08-15" };

const base: TransitionInput = {
  openSeason: open,
  previousCompleted: previous,
  openSeasonHasActivity: true,
  newGrade: "4",
  today: "2027-06-01",
  seasonCount: 2,
};

describe("seasonLabel", () => {
  it("names the school year by its start", () => {
    expect(seasonLabel("2026-08-15")).toBe("2026–27");
  });
  it("wraps the century", () => {
    expect(seasonLabel("2099-09-01")).toBe("2099–00");
  });
});

describe("nextOrdinal", () => {
  it("is one more than the seasons so far", () => {
    expect(nextOrdinal(0)).toBe(1);
    expect(nextOrdinal(4)).toBe(5);
  });
});

describe("crownForOrdinal", () => {
  it("gives the copper circlet first", () => {
    expect(crownForOrdinal(1).id).toBe("crown-copper");
  });
  it("clamps past the last tier", () => {
    expect(crownForOrdinal(40).id).toBe(CROWNS[CROWNS.length - 1].id);
    expect(crownForOrdinal(0).id).toBe("crown-copper");
  });
});

describe("planSeasonTransition", () => {
  it("opens a first season when none is open", () => {
    expect(
      planSeasonTransition({ ...base, openSeason: null, previousCompleted: null, seasonCount: 0, newGrade: "K" })
    ).toEqual({ type: "open", grade: "K", ordinal: 1, startDate: "2027-06-01" });
  });

  it("does nothing when the grade is unchanged", () => {
    expect(planSeasonTransition({ ...base, newGrade: "3" })).toEqual({ type: "noop" });
  });

  it("completes the season and mints its crown when the hero moves up", () => {
    expect(planSeasonTransition(base)).toEqual({
      type: "complete_and_open",
      completeId: "s-open",
      endDate: "2027-06-01",
      crownId: "crown-iron",
      open: { grade: "4", ordinal: 3, startDate: "2027-06-01" },
    });
  });

  it("treats a grade skip as one completed season", () => {
    const plan = planSeasonTransition({ ...base, newGrade: "5" });
    expect(plan.type).toBe("complete_and_open");
    if (plan.type === "complete_and_open") expect(plan.open.grade).toBe("5");
  });

  it("moves from kindergarten to first grade as a promotion", () => {
    const plan = planSeasonTransition({
      ...base,
      openSeason: { ...open, grade: "K", ordinal: 1 },
      previousCompleted: null,
      seasonCount: 1,
      newGrade: "1",
    });
    expect(plan.type).toBe("complete_and_open");
  });

  it("only relabels an empty season on a grade increase (a fixed typo is not a finished grade)", () => {
    expect(planSeasonTransition({ ...base, openSeasonHasActivity: false })).toEqual({
      type: "relabel",
      seasonId: "s-open",
      grade: "4",
    });
  });

  it("reverses a mistaken promotion when the new season is still empty", () => {
    expect(planSeasonTransition({ ...base, openSeasonHasActivity: false, newGrade: "2" })).toEqual({
      type: "reopen_previous",
      deleteId: "s-open",
      reopenId: "s-prev",
      grade: "2",
    });
  });

  it("relabels on a grade decrease when the season has activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: "2" })).toEqual({
      type: "relabel",
      seasonId: "s-open",
      grade: "2",
    });
  });

  it("relabels on a grade decrease when there is nothing to reopen", () => {
    expect(
      planSeasonTransition({ ...base, openSeasonHasActivity: false, previousCompleted: null, newGrade: "2" })
    ).toEqual({ type: "relabel", seasonId: "s-open", grade: "2" });
  });

  it("never ends a season before it started", () => {
    const plan = planSeasonTransition({ ...base, today: "2026-08-01" });
    if (plan.type !== "complete_and_open") throw new Error("expected completion");
    expect(plan.endDate).toBe("2026-08-15");
    expect(plan.open.startDate).toBe("2026-08-15");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/utils/seasons.test.ts`
Expected: FAIL, cannot resolve `./seasons`.

- [ ] **Step 4: Implement `seasons.ts`**

```ts
import { compareGrades } from "./age-mode";
import { crownForOrdinal } from "./crown-catalog";

export type SeasonRecord = {
  id: string;
  grade: string;
  ordinal: number;
  startDate: string;
  endDate: string | null;
  crownId: string | null;
};

export type SeasonLike = Pick<SeasonRecord, "id" | "grade" | "ordinal" | "startDate">;

export type TransitionInput = {
  openSeason: SeasonLike | null;
  /** Most recently completed season, if any. */
  previousCompleted: SeasonLike | null;
  /** Any activity_log row dated inside the open season. */
  openSeasonHasActivity: boolean;
  newGrade: string;
  today: string; // ISO date
  /** Every season row this hero has, open or not. */
  seasonCount: number;
};

export type TransitionPlan =
  | { type: "noop" }
  | { type: "open"; grade: string; ordinal: number; startDate: string }
  | { type: "relabel"; seasonId: string; grade: string }
  | {
      type: "complete_and_open";
      completeId: string;
      endDate: string;
      crownId: string;
      open: { grade: string; ordinal: number; startDate: string };
    }
  | { type: "reopen_previous"; deleteId: string; reopenId: string; grade: string };

/** "2026–27" from the season's start date. */
export function seasonLabel(startDate: string): string {
  const year = parseInt(startDate.slice(0, 4), 10);
  const next = String((year + 1) % 100).padStart(2, "0");
  return `${year}–${next}`;
}

export function nextOrdinal(existingSeasonCount: number): number {
  return existingSeasonCount + 1;
}

/**
 * What a grade change means for the hero's seasons. Promotion is the only
 * completion signal (a homeschool parent moving a hero up a grade is how they
 * say "this grade is done"), and a season with no activity is treated as a
 * label rather than a year, so a typo fixed the next day can't mint a crown.
 */
export function planSeasonTransition(input: TransitionInput): TransitionPlan {
  const { openSeason, previousCompleted, openSeasonHasActivity, newGrade, today, seasonCount } = input;

  if (!openSeason) {
    return { type: "open", grade: newGrade, ordinal: nextOrdinal(seasonCount), startDate: today };
  }

  const direction = compareGrades(newGrade, openSeason.grade);
  if (direction === 0) return { type: "noop" };

  if (direction > 0) {
    if (!openSeasonHasActivity) {
      return { type: "relabel", seasonId: openSeason.id, grade: newGrade };
    }
    // A clock that says "today" is before the season began is a skew, not a
    // time machine: never end a season before it started.
    const endDate = today < openSeason.startDate ? openSeason.startDate : today;
    return {
      type: "complete_and_open",
      completeId: openSeason.id,
      endDate,
      crownId: crownForOrdinal(openSeason.ordinal).id,
      open: { grade: newGrade, ordinal: openSeason.ordinal + 1, startDate: endDate },
    };
  }

  // Lower grade: a correction. Undo a mistaken promotion if nothing has
  // happened in the new season yet; otherwise just fix the label.
  if (!openSeasonHasActivity && previousCompleted) {
    return { type: "reopen_previous", deleteId: openSeason.id, reopenId: previousCompleted.id, grade: newGrade };
  }
  return { type: "relabel", seasonId: openSeason.id, grade: newGrade };
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/lib/utils/seasons.test.ts`
Expected: all pass.
```bash
git add src/lib/utils/crown-catalog.ts src/lib/utils/seasons.ts src/lib/utils/seasons.test.ts
git commit -m "Add crown catalog and season transition rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Season sync service, seasons action, and the grade hook

**Files:**
- Create: `src/lib/services/season-sync.ts`, `src/lib/actions/seasons.ts`
- Modify: `src/lib/actions/children.ts` (`createChild`, `updateChild`)

**Interfaces:**
- Consumes: `planSeasonTransition`, `TransitionPlan`, `SeasonRecord` (Task 4); `schema.season` (Task 2); `formatDate` from `@/lib/utils/dates`.
- Produces:
  - service: `syncSeasonForGrade(childId: string, newGrade: string, today: string): Promise<TransitionPlan>`, `ensureSeason(childId: string): Promise<void>`
  - action: `getSeasons(childId: string): Promise<{ open: SeasonRecord | null; history: SeasonRecord[] }>`
  - `updateChild(childId, data, today?)` now returns `Promise<{ seasonTransition: TransitionPlan | null }>`

- [ ] **Step 1: Write the service**

`src/lib/services/season-sync.ts`:
```ts
import { and, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/dates";
import { planSeasonTransition, type TransitionPlan } from "@/lib/utils/seasons";

/**
 * Keeps a hero's seasons in step with their grade. Plain module, not a
 * "use server" file: callers (the children actions) have already authorized
 * the child. The rules live in utils/seasons.ts; this file only loads state
 * and applies the plan.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadSeasonState(childId: string) {
  const rows = await db.select().from(schema.season).where(eq(schema.season.childId, childId));
  const open = rows.find((r) => r.completedAt === null) ?? null;
  const completed = rows
    .filter((r) => r.completedAt !== null)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  return { open, previousCompleted: completed[0] ?? null, count: rows.length };
}

async function hasActivitySince(childId: string, startDate: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.activityLog.id })
    .from(schema.activityLog)
    .where(and(eq(schema.activityLog.childId, childId), gte(schema.activityLog.date, startDate)))
    .limit(1);
  return rows.length > 0;
}

async function applyPlan(childId: string, plan: TransitionPlan): Promise<void> {
  const now = new Date();
  switch (plan.type) {
    case "noop":
      return;
    case "open":
      await db.insert(schema.season).values({
        id: nanoid(),
        childId,
        grade: plan.grade,
        ordinal: plan.ordinal,
        startDate: plan.startDate,
        createdAt: now,
        updatedAt: now,
      });
      return;
    case "relabel":
      await db
        .update(schema.season)
        .set({ grade: plan.grade, updatedAt: now })
        .where(eq(schema.season.id, plan.seasonId));
      return;
    case "complete_and_open":
      // One transaction so grade and season can never disagree: the old season
      // must be closed before the new one is inserted (the partial unique
      // index allows only one open season per hero).
      await db.transaction(async (tx) => {
        await tx
          .update(schema.season)
          .set({ endDate: plan.endDate, completedAt: now, crownId: plan.crownId, updatedAt: now })
          .where(eq(schema.season.id, plan.completeId));
        await tx.insert(schema.season).values({
          id: nanoid(),
          childId,
          grade: plan.open.grade,
          ordinal: plan.open.ordinal,
          startDate: plan.open.startDate,
          createdAt: now,
          updatedAt: now,
        });
      });
      return;
    case "reopen_previous":
      await db.transaction(async (tx) => {
        await tx.delete(schema.season).where(eq(schema.season.id, plan.deleteId));
        await tx
          .update(schema.season)
          .set({ grade: plan.grade, endDate: null, completedAt: null, crownId: null, updatedAt: now })
          .where(eq(schema.season.id, plan.reopenId));
      });
      return;
  }
}

/** Called whenever a hero's grade is set. `today` is the caller's local ISO date. */
export async function syncSeasonForGrade(
  childId: string,
  newGrade: string,
  today: string
): Promise<TransitionPlan> {
  const date = ISO_DATE.test(today) ? today : formatDate(new Date());
  const state = await loadSeasonState(childId);
  const plan = planSeasonTransition({
    openSeason: state.open,
    previousCompleted: state.previousCompleted,
    openSeasonHasActivity: state.open ? await hasActivitySince(childId, state.open.startDate) : false,
    newGrade,
    today: date,
    seasonCount: state.count,
  });
  await applyPlan(childId, plan);
  return plan;
}

/**
 * Heroes who existed before seasons did get one opened lazily, dated from
 * when they joined, so history reads as if seasons were always there.
 */
export async function ensureSeason(childId: string): Promise<void> {
  const state = await loadSeasonState(childId);
  if (state.count > 0) return;
  const rows = await db
    .select({ grade: schema.child.grade, createdAt: schema.child.createdAt })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child?.grade) return;
  await applyPlan(childId, {
    type: "open",
    grade: child.grade,
    ordinal: 1,
    startDate: formatDate(child.createdAt),
  });
}
```

- [ ] **Step 2: Write the action**

`src/lib/actions/seasons.ts`:
```ts
"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { ensureSeason } from "@/lib/services/season-sync";
import type { SeasonRecord } from "@/lib/utils/seasons";

function toRecord(row: typeof schema.season.$inferSelect): SeasonRecord {
  return {
    id: row.id,
    grade: row.grade,
    ordinal: row.ordinal,
    startDate: row.startDate,
    endDate: row.endDate,
    crownId: row.crownId,
  };
}

/** The open season plus completed history, newest first. A hero may read their own. */
export async function getSeasons(
  childId: string
): Promise<{ open: SeasonRecord | null; history: SeasonRecord[] }> {
  await requireChildAccess(childId);
  await ensureSeason(childId);
  const rows = await db
    .select()
    .from(schema.season)
    .where(eq(schema.season.childId, childId))
    .orderBy(desc(schema.season.ordinal));
  const openRow = rows.find((r) => r.completedAt === null);
  return {
    open: openRow ? toRecord(openRow) : null,
    history: rows.filter((r) => r.completedAt !== null).map(toRecord),
  };
}
```

- [ ] **Step 3: Hook the children actions**

In `src/lib/actions/children.ts` add imports:
```ts
import { formatDate } from "@/lib/utils/dates";
import { syncSeasonForGrade } from "@/lib/services/season-sync";
import type { TransitionPlan } from "@/lib/utils/seasons";
```
In `createChild`, after the default-subjects loop and before `return`:
```ts
  // A hero with a grade starts their first season the day they're summoned.
  if (grade) await syncSeasonForGrade(id, grade, formatDate(now));
```
Change `updateChild` to accept and return:
```ts
export async function updateChild(
  childId: string,
  data: { displayName?: string; birthYear?: number; grade?: string },
  today?: string
): Promise<{ seasonTransition: TransitionPlan | null }> {
```
and after the `db.update(...)` call:
```ts
  // Changing the grade is what opens, completes, or corrects a season.
  let seasonTransition: TransitionPlan | null = null;
  if (data.grade) {
    seasonTransition = await syncSeasonForGrade(childId, data.grade, today ?? formatDate(new Date()));
  }
  return { seasonTransition };
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: pass (no callers depend on `updateChild` returning void; confirm with `grep -rn "updateChild(" src`).
```bash
git add src/lib/services/season-sync.ts src/lib/actions/seasons.ts src/lib/actions/children.ts
git commit -m "Sync seasons from grade changes and expose getSeasons

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Season panel, crowns panel, tavern crown count

**Files:**
- Create: `src/components/crown-badge.tsx`, `src/app/(app)/settings/season-panel.tsx`, `src/app/(app)/settings/season-panel.test.tsx`, `src/components/crowns-panel.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (per-child data), `src/app/(app)/settings/child-list.tsx` (`Child` type, `ChildCard` render, `ChildInfoEditor` notice), `src/app/(app)/loot/page.tsx`, `src/app/(app)/tavern/page.tsx`

**Interfaces:**
- Consumes: `getSeasons` (Task 5), `crownById`, `seasonLabel`, `SeasonRecord`, `TransitionPlan`.
- Produces: `CrownBadge({ crownId, size?: "sm" | "md" | "lg", showLabel? })`, `SeasonPanel({ displayName, hasGrade, open, history })`, `CrownsPanel({ history })`.

- [ ] **Step 1: Write the failing panel test**

`src/app/(app)/settings/season-panel.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeasonPanel } from "./season-panel";

afterEach(cleanup);

describe("SeasonPanel", () => {
  it("asks for a grade when the hero has none", () => {
    render(<SeasonPanel displayName="Lily" hasGrade={false} open={null} history={[]} />);
    expect(screen.getByText(/set a grade to begin the season/i)).toBeInTheDocument();
  });

  it("shows the open season and explains how it completes", () => {
    render(
      <SeasonPanel
        displayName="Lily"
        hasGrade={true}
        open={{ id: "s2", grade: "4", ordinal: 2, startDate: "2026-08-15", endDate: null, crownId: null }}
        history={[]}
      />
    );
    expect(screen.getByText(/grade 4/i)).toBeInTheDocument();
    expect(screen.getByText("2026–27")).toBeInTheDocument();
    expect(screen.getByText(/moving lily up a grade/i)).toBeInTheDocument();
  });

  it("lists earned crowns in the history", () => {
    render(
      <SeasonPanel
        displayName="Lily"
        hasGrade={true}
        open={null}
        history={[
          { id: "s1", grade: "3", ordinal: 1, startDate: "2025-08-15", endDate: "2026-06-01", crownId: "crown-copper" },
        ]}
      />
    );
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.getByText(/grade 3/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/(app)/settings/season-panel.test.tsx"`
Expected: FAIL, cannot resolve `./season-panel`.

- [ ] **Step 3: Write `CrownBadge`**

`src/components/crown-badge.tsx`:
```tsx
import { GameIcon } from "@/components/game-icon";
import { crownById } from "@/lib/utils/crown-catalog";

const SIZE = { sm: "size-5", md: "size-8", lg: "size-12" } as const;

/** One earned crown: tier icon in its tier color, optional label. */
export function CrownBadge({
  crownId,
  size = "md",
  showLabel = false,
}: {
  crownId: string;
  size?: keyof typeof SIZE;
  showLabel?: boolean;
}) {
  const crown = crownById(crownId);
  if (!crown) return null;
  return (
    <span className="inline-flex items-center gap-2" title={crown.description}>
      {/* GameIcon takes only name and className; the tier color is inherited via currentColor. */}
      <span className="inline-flex" style={{ color: crown.color }}>
        <GameIcon name={crown.icon} className={`${SIZE[size]} drop-shadow-[0_0_6px_var(--glow-gold)]`} />
      </span>
      {showLabel && <span className="text-sm font-medium">{crown.label}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Write `SeasonPanel`**

`src/app/(app)/settings/season-panel.tsx`:
```tsx
import { CrownBadge } from "@/components/crown-badge";
import { GameIcon } from "@/components/game-icon";
import { seasonLabel, type SeasonRecord } from "@/lib/utils/seasons";

function gradeName(grade: string) {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

/**
 * Read-only. Seasons open, complete, and correct themselves from the grade a
 * grown-up sets, so this panel only explains and shows history.
 */
export function SeasonPanel({
  displayName,
  hasGrade,
  open,
  history,
}: {
  displayName: string;
  hasGrade: boolean;
  open: SeasonRecord | null;
  history: SeasonRecord[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Seasons &amp; Crowns</h4>
      <div className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5 text-sm">
        {!hasGrade ? (
          <p className="text-muted-foreground">
            Set a grade to begin the season. Each grade is one season, and finishing it earns a crown.
          </p>
        ) : open ? (
          <>
            <p>
              <span className="font-medium">{gradeName(open.grade)}</span>
              <span className="text-muted-foreground"> &middot; Season {open.ordinal} &middot; </span>
              <span>{seasonLabel(open.startDate)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Moving {displayName} up a grade completes this season and earns its crown. A season with no
              quests logged is only relabeled, so a fixed typo never counts as a finished year.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No season is open yet.</p>
        )}
      </div>
      {history.length > 0 && (
        <ul className="space-y-1">
          {history.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-md border border-gold-dim px-3 py-2 text-sm">
              <span>
                {gradeName(s.grade)} <span className="text-muted-foreground">&middot; {seasonLabel(s.startDate)}</span>
              </span>
              {s.crownId ? (
                <CrownBadge crownId={s.crownId} size="sm" showLabel />
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <GameIcon name="crown" className="size-4 opacity-40" /> no crown
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the panel test**

Run: `npx vitest run "src/app/(app)/settings/season-panel.test.tsx"`
Expected: 3 passed.

- [ ] **Step 6: Wire into settings**

`src/app/(app)/settings/page.tsx`: import `getSeasons` from `@/lib/actions/seasons`; inside the `childrenWithSubjects` map add `getSeasons(child.id)` to the `Promise.all` array (destructure as `seasons`) and include `seasons` in the returned object.

`src/app/(app)/settings/child-list.tsx`:
- imports: `import { SeasonPanel } from "./season-panel";`, `import { crownById } from "@/lib/utils/crown-catalog";`, `import type { SeasonRecord } from "@/lib/utils/seasons";`, `import { localDateOf } from "@/lib/utils/schedule-days";`
- `Child` type: add `seasons?: { open: SeasonRecord | null; history: SeasonRecord[] };`
- In `ChildCard`'s JSX, directly after `<AvatarSection child={child} />`, add (visible to parent and hero):
```tsx
        <SeasonPanel
          displayName={child.displayName}
          hasGrade={!!child.grade}
          open={child.seasons?.open ?? null}
          history={child.seasons?.history ?? []}
        />
```
- In `ChildInfoEditor`: add `const [crownNotice, setCrownNotice] = useState("");`. Change the save call to:
```tsx
      const result = await updateChild(
        child.id,
        {
          displayName: name !== child.displayName ? name : undefined,
          birthYear:
            ageMode === "birthYear" && ageChanged && birthYear ? parseInt(birthYear) : undefined,
          grade: ageMode === "grade" && ageChanged && grade ? grade : undefined,
        },
        localDateOf(new Date())
      );
      const plan = result?.seasonTransition;
      if (plan?.type === "complete_and_open") {
        setCrownNotice(`${child.displayName} finished the season and earned the ${crownById(plan.crownId)?.label ?? "crown"}!`);
      }
```
and render under the error block:
```tsx
      {crownNotice && (
        <div className="rounded-md border border-[var(--gold-border)] bg-muted/30 p-2 text-sm">
          <GameIcon name="crown" className="mr-1 inline size-4 text-[var(--gold-bright)]" /> {crownNotice}
        </div>
      )}
```

- [ ] **Step 7: Crowns on Loot and the Tavern**

`src/components/crowns-panel.tsx`:
```tsx
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { CrownBadge } from "@/components/crown-badge";
import { seasonLabel, type SeasonRecord } from "@/lib/utils/seasons";

export function CrownsPanel({ history }: { history: SeasonRecord[] }) {
  const earned = history.filter((s) => s.crownId);
  return (
    <GameFrame
      title={`Crowns (${earned.length})`}
      icon={<GameIcon name="crown" className="size-4 text-[var(--gold-bright)]" />}
    >
      {earned.length === 0 ? (
        <div className="py-6 text-center">
          <GameIcon name="crown" className="mx-auto size-10 text-[var(--gold-bright)] opacity-50" />
          <p className="mt-3 text-sm text-muted-foreground">Finish this grade to earn your first crown.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {earned.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2">
              <CrownBadge crownId={s.crownId!} size="lg" />
              <div>
                <p className="text-sm font-medium">{seasonLabel(s.startDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {s.grade === "K" ? "Kindergarten" : `Grade ${s.grade}`} &middot; Season {s.ordinal}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GameFrame>
  );
}
```
`src/app/(app)/loot/page.tsx`: import `getSeasons` and `CrownsPanel`; add `getSeasons(activeChild.id)` to the existing `Promise.all` (destructure `seasons`); render `<CrownsPanel history={seasons.history} />` directly above the "Claimed treasures" `GameFrame`.

`src/app/(app)/tavern/page.tsx`: import `getSeasons`; add it to the page's `Promise.all` of child data (destructure `seasons`); compute `const crownCount = seasons.history.filter((s) => s.crownId).length;`. Directly after the element containing `Level {level} Champion` add:
```tsx
                {crownCount > 0 && (
                  <p className="text-xs text-[var(--gold-bright)]">
                    <GameIcon name="crown" className="mr-1 inline size-3.5" />
                    {crownCount} {crownCount === 1 ? "Crown" : "Crowns"}
                  </p>
                )}
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: pass. Then start the dev server, open Settings as a parent, and confirm the Seasons panel shows for a hero with a grade.
```bash
git add src/components/crown-badge.tsx src/components/crowns-panel.tsx "src/app/(app)"
git commit -m "Show seasons and crowns in the Chronicle, Loot, and Tavern

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Learning profile rules

**Files:**
- Create: `src/lib/utils/learning-profile.ts`, `src/lib/utils/learning-profile.test.ts`

**Interfaces:**
- Produces:
  - `InputMode = "auto" | "touch" | "keyboard"`
  - `LearningProfile = { readingFont: boolean; largerText: boolean; extraSpacing: boolean; readAloud: boolean; untimed: boolean; sessionMinutes: number | null; fewerChoices: boolean; reducedMotion: boolean; lowStimulus: boolean; predictableRoutine: boolean; soundEnabled: boolean; inputMode: InputMode }`
  - `DEFAULT_LEARNING_PROFILE: LearningProfile`, `LEARNING_PROFILE_KEYS: (keyof LearningProfile)[]`
  - `LearningPresetId = "reading-support" | "focus-support" | "sensory-routine-support"`, `LearningPreset = { id: LearningPresetId; label: string; description: string; toggles: Partial<LearningProfile> }`, `LEARNING_PRESETS: LearningPreset[]`
  - `applyPreset(current: LearningProfile, presetId: string): LearningProfile`
  - `profileFromRow(row: Partial<Record<keyof LearningProfile, unknown>> | null | undefined): LearningProfile`
  - `validateProfilePatch(patch: unknown): Partial<LearningProfile>` (throws on bad values)
  - `readingAttributes(profile: LearningProfile): Record<string, "on">`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/learning-profile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEARNING_PROFILE,
  LEARNING_PRESETS,
  applyPreset,
  profileFromRow,
  readingAttributes,
  validateProfilePatch,
} from "./learning-profile";

describe("profileFromRow", () => {
  it("returns defaults for a missing row", () => {
    expect(profileFromRow(null)).toEqual(DEFAULT_LEARNING_PROFILE);
  });
  it("keeps defaults for columns the row lacks", () => {
    expect(profileFromRow({ untimed: true })).toEqual({ ...DEFAULT_LEARNING_PROFILE, untimed: true });
  });
  it("ignores an unknown input mode", () => {
    expect(profileFromRow({ inputMode: "gamepad" }).inputMode).toBe("auto");
  });
});

describe("LEARNING_PRESETS", () => {
  it("each preset sets exactly its toggles on top of the current profile", () => {
    for (const preset of LEARNING_PRESETS) {
      expect(applyPreset(DEFAULT_LEARNING_PROFILE, preset.id)).toEqual({
        ...DEFAULT_LEARNING_PROFILE,
        ...preset.toggles,
      });
    }
  });
  it("reading support turns on the reading toggles", () => {
    const p = applyPreset(DEFAULT_LEARNING_PROFILE, "reading-support");
    expect(p.readingFont).toBe(true);
    expect(p.largerText).toBe(true);
    expect(p.extraSpacing).toBe(true);
    expect(p.readAloud).toBe(true);
  });
  it("does not clear unrelated toggles", () => {
    const p = applyPreset({ ...DEFAULT_LEARNING_PROFILE, untimed: true }, "reading-support");
    expect(p.untimed).toBe(true);
  });
  it("leaves the profile alone for an unknown preset", () => {
    expect(applyPreset(DEFAULT_LEARNING_PROFILE, "nope")).toEqual(DEFAULT_LEARNING_PROFILE);
  });
});

describe("validateProfilePatch", () => {
  it("passes booleans and a valid session length", () => {
    expect(validateProfilePatch({ untimed: true, sessionMinutes: 15 })).toEqual({ untimed: true, sessionMinutes: 15 });
  });
  it("allows clearing the session length", () => {
    expect(validateProfilePatch({ sessionMinutes: null })).toEqual({ sessionMinutes: null });
  });
  it("rejects a session length outside 5..120", () => {
    expect(() => validateProfilePatch({ sessionMinutes: 2 })).toThrow();
    expect(() => validateProfilePatch({ sessionMinutes: 500 })).toThrow();
  });
  it("rejects a non-boolean toggle and an unknown key", () => {
    expect(() => validateProfilePatch({ untimed: "yes" })).toThrow();
    expect(() => validateProfilePatch({ diagnosis: "x" })).toThrow();
  });
});

describe("readingAttributes", () => {
  it("is empty when nothing is on", () => {
    expect(readingAttributes(DEFAULT_LEARNING_PROFILE)).toEqual({});
  });
  it("emits one attribute per reading toggle", () => {
    expect(
      readingAttributes({ ...DEFAULT_LEARNING_PROFILE, readingFont: true, largerText: true, extraSpacing: true })
    ).toEqual({ "data-reading-font": "on", "data-larger-text": "on", "data-extra-spacing": "on" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/learning-profile.test.ts`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/learning-profile.ts`:
```ts
export type InputMode = "auto" | "touch" | "keyboard";
const INPUT_MODES: InputMode[] = ["auto", "touch", "keyboard"];

/**
 * What helps this hero learn. Toggles only — a preset is a shortcut that fills
 * these in, never a label that gets stored.
 */
export type LearningProfile = {
  readingFont: boolean;
  largerText: boolean;
  extraSpacing: boolean;
  readAloud: boolean;
  untimed: boolean;
  sessionMinutes: number | null;
  fewerChoices: boolean;
  reducedMotion: boolean;
  lowStimulus: boolean;
  predictableRoutine: boolean;
  soundEnabled: boolean;
  inputMode: InputMode;
};

export const DEFAULT_LEARNING_PROFILE: LearningProfile = {
  readingFont: false,
  largerText: false,
  extraSpacing: false,
  readAloud: false,
  untimed: false,
  sessionMinutes: null,
  fewerChoices: false,
  reducedMotion: false,
  lowStimulus: false,
  predictableRoutine: false,
  soundEnabled: true,
  inputMode: "auto",
};

export const LEARNING_PROFILE_KEYS = Object.keys(DEFAULT_LEARNING_PROFILE) as (keyof LearningProfile)[];

export type LearningPresetId = "reading-support" | "focus-support" | "sensory-routine-support";

export type LearningPreset = {
  id: LearningPresetId;
  label: string;
  description: string;
  toggles: Partial<LearningProfile>;
};

export const LEARNING_PRESETS: LearningPreset[] = [
  {
    id: "reading-support",
    label: "Reading support",
    description: "A clearer font, larger text, more spacing, and read-aloud in the Realm.",
    toggles: { readingFont: true, largerText: true, extraSpacing: true, readAloud: true },
  },
  {
    id: "focus-support",
    label: "Focus support",
    description: "No timers, fewer choices, a steady routine, and a break every 15 minutes.",
    toggles: { untimed: true, fewerChoices: true, predictableRoutine: true, sessionMinutes: 15 },
  },
  {
    id: "sensory-routine-support",
    label: "Sensory & routine support",
    description: "Calm visuals, no sudden motion, sound off, and a predictable order of play.",
    toggles: { reducedMotion: true, lowStimulus: true, predictableRoutine: true, soundEnabled: false },
  },
];

export function applyPreset(current: LearningProfile, presetId: string): LearningProfile {
  const preset = LEARNING_PRESETS.find((p) => p.id === presetId);
  return preset ? { ...current, ...preset.toggles } : current;
}

const SESSION_MIN = 5;
const SESSION_MAX = 120;

function isSessionMinutes(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= SESSION_MIN && v <= SESSION_MAX;
}

/** Tolerant read from a DB row: missing or malformed columns fall back to defaults. */
export function profileFromRow(
  row: Partial<Record<keyof LearningProfile, unknown>> | null | undefined
): LearningProfile {
  if (!row) return { ...DEFAULT_LEARNING_PROFILE };
  const out: LearningProfile = { ...DEFAULT_LEARNING_PROFILE };
  for (const key of LEARNING_PROFILE_KEYS) {
    const v = row[key];
    if (key === "sessionMinutes") {
      out.sessionMinutes = isSessionMinutes(v) ? v : null;
    } else if (key === "inputMode") {
      out.inputMode = INPUT_MODES.includes(v as InputMode) ? (v as InputMode) : "auto";
    } else if (typeof v === "boolean") {
      out[key] = v;
    }
  }
  return out;
}

/** Strict read from a client: anything unexpected is an error, not a default. */
export function validateProfilePatch(patch: unknown): Partial<LearningProfile> {
  if (!patch || typeof patch !== "object") throw new Error("Nothing to change.");
  const out: Partial<LearningProfile> = {};
  for (const [key, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!LEARNING_PROFILE_KEYS.includes(key as keyof LearningProfile)) {
      throw new Error(`Unknown learning setting: ${key}`);
    }
    if (key === "sessionMinutes") {
      if (v !== null && !isSessionMinutes(v)) {
        throw new Error(`Break length must be between ${SESSION_MIN} and ${SESSION_MAX} minutes.`);
      }
      out.sessionMinutes = v as number | null;
    } else if (key === "inputMode") {
      if (!INPUT_MODES.includes(v as InputMode)) throw new Error("Choose touch, keyboard, or auto.");
      out.inputMode = v as InputMode;
    } else {
      if (typeof v !== "boolean") throw new Error(`${key} must be on or off.`);
      out[key as Exclude<keyof LearningProfile, "sessionMinutes" | "inputMode">] = v;
    }
  }
  return out;
}

/** Data attributes the app shell sets so CSS can restyle text for this hero. */
export function readingAttributes(profile: LearningProfile): Record<string, "on"> {
  const attrs: Record<string, "on"> = {};
  if (profile.readingFont) attrs["data-reading-font"] = "on";
  if (profile.largerText) attrs["data-larger-text"] = "on";
  if (profile.extraSpacing) attrs["data-extra-spacing"] = "on";
  return attrs;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/utils/learning-profile.test.ts`
Expected: all pass.
```bash
git add src/lib/utils/learning-profile.ts src/lib/utils/learning-profile.test.ts
git commit -m "Add learning profile defaults, presets, and validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Learning profile action, panel, and app-wide reading support

**Files:**
- Create: `src/lib/actions/learning-profile.ts`, `src/app/(app)/settings/learning-profile-panel.tsx`, `src/app/(app)/settings/learning-profile-panel.test.tsx`
- Modify: `src/app/layout.tsx` (Lexend), `src/app/globals.css` (reading rules), `src/app/(app)/layout.tsx` (attributes), `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/child-list.tsx`

**Interfaces:**
- Consumes: Task 7 exports; `schema.learningProfile`.
- Produces: `getLearningProfile(childId): Promise<LearningProfile>`, `updateLearningProfile(childId, patch: Partial<LearningProfile>): Promise<void>`, `applyLearningPreset(childId, presetId: string): Promise<void>`, `LearningProfilePanel({ childId, profile })`.

- [ ] **Step 1: Write the action**

`src/lib/actions/learning-profile.ts`:
```ts
"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import {
  applyPreset,
  profileFromRow,
  validateProfilePatch,
  LEARNING_PRESETS,
  type LearningProfile,
} from "@/lib/utils/learning-profile";

/** Insert-if-missing then select, so two first reads can't make two rows. */
async function loadOrCreate(childId: string) {
  const now = new Date();
  await db
    .insert(schema.learningProfile)
    .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(schema.learningProfile)
    .where(eq(schema.learningProfile.childId, childId))
    .limit(1);
  return rows[0];
}

async function requireParent(childId: string) {
  const { access, familyId } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change learning settings.");
  return familyId;
}

/** A hero may read their own profile; the app shell relies on that. */
export async function getLearningProfile(childId: string): Promise<LearningProfile> {
  await requireChildAccess(childId);
  return profileFromRow(await loadOrCreate(childId));
}

export async function updateLearningProfile(
  childId: string,
  patch: Partial<LearningProfile>
): Promise<void> {
  await requireParent(childId);
  const clean = validateProfilePatch(patch);
  await loadOrCreate(childId);
  await db
    .update(schema.learningProfile)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function applyLearningPreset(childId: string, presetId: string): Promise<void> {
  await requireParent(childId);
  if (!LEARNING_PRESETS.some((p) => p.id === presetId)) throw new Error("Unknown preset.");
  const current = profileFromRow(await loadOrCreate(childId));
  const next = applyPreset(current, presetId);
  await db
    .update(schema.learningProfile)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Write the failing panel test**

`src/app/(app)/settings/learning-profile-panel.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningProfilePanel } from "./learning-profile-panel";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const updateLearningProfile = vi.fn().mockResolvedValue(undefined);
const applyLearningPreset = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/learning-profile", () => ({
  updateLearningProfile: (...a: unknown[]) => updateLearningProfile(...a),
  applyLearningPreset: (...a: unknown[]) => applyLearningPreset(...a),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LearningProfilePanel", () => {
  it("applies a preset by id", async () => {
    const user = userEvent.setup();
    render(<LearningProfilePanel childId="c1" profile={DEFAULT_LEARNING_PROFILE} />);
    await user.click(screen.getByRole("button", { name: /reading support/i }));
    expect(applyLearningPreset).toHaveBeenCalledWith("c1", "reading-support");
  });

  it("flips a single toggle", async () => {
    const user = userEvent.setup();
    render(<LearningProfilePanel childId="c1" profile={DEFAULT_LEARNING_PROFILE} />);
    await user.click(screen.getByRole("switch", { name: /no timers/i }));
    expect(updateLearningProfile).toHaveBeenCalledWith("c1", { untimed: true });
  });

  it("renders the stored state", () => {
    render(<LearningProfilePanel childId="c1" profile={{ ...DEFAULT_LEARNING_PROFILE, lowStimulus: true }} />);
    expect(screen.getByRole("switch", { name: /calm visuals/i })).toHaveAttribute("aria-checked", "true");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run "src/app/(app)/settings/learning-profile-panel.test.tsx"`
Expected: FAIL, cannot resolve.

- [ ] **Step 4: Write the panel**

`src/app/(app)/settings/learning-profile-panel.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { applyLearningPreset, updateLearningProfile } from "@/lib/actions/learning-profile";
import { LEARNING_PRESETS, type LearningProfile, type InputMode } from "@/lib/utils/learning-profile";

type BoolKey = Exclude<keyof LearningProfile, "sessionMinutes" | "inputMode">;

const GROUPS: { title: string; items: { key: BoolKey; label: string; hint: string }[] }[] = [
  {
    title: "Reading",
    items: [
      { key: "readingFont", label: "Reading font", hint: "Use Lexend, a font designed for reading fluency, everywhere." },
      { key: "largerText", label: "Larger text", hint: "Everything a little bigger." },
      { key: "extraSpacing", label: "Extra spacing", hint: "More room between lines and letters." },
      { key: "readAloud", label: "Read aloud", hint: "Offer to read questions out loud in the Realm." },
    ],
  },
  {
    title: "Attention & pacing",
    items: [
      { key: "untimed", label: "No timers", hint: "Trials never count down." },
      { key: "fewerChoices", label: "Fewer choices", hint: "Two answers to pick from instead of four." },
      { key: "predictableRoutine", label: "Predictable routine", hint: "Same order every time, with a warning before anything changes." },
    ],
  },
  {
    title: "Sensory",
    items: [
      { key: "reducedMotion", label: "Reduce motion", hint: "No sudden movement, whatever the device says." },
      { key: "lowStimulus", label: "Calm visuals", hint: "Fewer sparkles, softer colors, nothing flashes." },
      { key: "soundEnabled", label: "Sound", hint: "Music and effects in the Realm." },
    ],
  },
];

export function LearningProfilePanel({ childId, profile }: { childId: string; profile: LearningProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Learning Profile</h4>
      <p className="text-xs text-muted-foreground">
        What helps this hero learn. Presets only pre-fill the switches below; nothing but the switches is saved.
      </p>
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {LEARNING_PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="outline"
            className="!border-[var(--gold-border)]"
            disabled={busy}
            title={p.description}
            onClick={() => run(() => applyLearningPreset(childId, p.id))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {GROUPS.map((group) => (
        <div key={group.title} className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <Switch
                  aria-label={item.label}
                  checked={profile[item.key]}
                  disabled={busy}
                  onCheckedChange={() =>
                    run(() => updateLearningProfile(childId, { [item.key]: !profile[item.key] }))
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Suggest a break every</span>
          <Select
            value={profile.sessionMinutes === null ? "" : String(profile.sessionMinutes)}
            disabled={busy}
            onChange={(e) =>
              run(() =>
                updateLearningProfile(childId, {
                  sessionMinutes: e.target.value === "" ? null : parseInt(e.target.value, 10),
                })
              )
            }
          >
            <option value="">Never</option>
            {[10, 15, 20, 30, 45].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Play with</span>
          <Select
            value={profile.inputMode}
            disabled={busy}
            onChange={(e) => run(() => updateLearningProfile(childId, { inputMode: e.target.value as InputMode }))}
          >
            <option value="auto">Whatever the device has</option>
            <option value="touch">Touch</option>
            <option value="keyboard">Keyboard &amp; mouse</option>
          </Select>
        </label>
      </div>
    </div>
  );
}
```
If `Select` does not accept `disabled`, check `src/components/ui/select.tsx` and pass through native props; it wraps a native `<select>`.

- [ ] **Step 5: Run the panel test**

Run: `npx vitest run "src/app/(app)/settings/learning-profile-panel.test.tsx"`
Expected: 3 passed.

- [ ] **Step 6: Wire the panel into settings**

`src/app/(app)/settings/page.tsx`: import `getLearningProfile`; in the per-child `Promise.all` add `isChildView ? null : getLearningProfile(child.id)` (destructure `learningProfile`) and return it.

`src/app/(app)/settings/child-list.tsx`: import `LearningProfilePanel` and `type LearningProfile`; add `learningProfile?: LearningProfile | null;` to `Child`; in `ChildCard` after the `SchoolingModeSettings` block:
```tsx
        {!isChildView && child.learningProfile && (
          <LearningProfilePanel childId={child.id} profile={child.learningProfile} />
        )}
```

- [ ] **Step 7: Lexend and the reading CSS**

`src/app/layout.tsx`: add `Lexend` to the `next/font/google` import and
```ts
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
```
and append `${lexend.variable}` to the body `className` template.

`src/app/globals.css`, after the `.game-shell { ... }` block:
```css
/* ── Reading support (learning profile) ──────────────────────
   Set as data attributes on .game-shell for the signed-in hero. The reading
   font replaces every face, decorative headings included: a gothic title is
   the hardest thing on the page for a reader who needs Lexend. */
.game-shell[data-reading-font="on"] {
  --font-sans: var(--font-lexend);
  --font-serif: var(--font-lexend);
  --font-brand: var(--font-lexend);
  font-family: var(--font-lexend), ui-sans-serif, system-ui, sans-serif;
}
.game-shell[data-reading-font="on"] :is(h1, h2, h3, h4, button, [role="button"], input, select, textarea, .page-title) {
  font-family: var(--font-lexend), ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.01em;
}
.game-shell[data-larger-text="on"] {
  zoom: 1.125;
}
.game-shell[data-extra-spacing="on"] {
  line-height: 1.75;
  letter-spacing: 0.03em;
  word-spacing: 0.08em;
}
```

- [ ] **Step 8: Apply the attributes in the app shell**

`src/app/(app)/layout.tsx`: import `profileFromRow, readingAttributes` from `@/lib/utils/learning-profile`. In the `actor.kind === "child"` branch, alongside the display-name query, read the profile without creating it (a layout render must not write):
```ts
  let readingAttrs: Record<string, "on"> = {};
  if (actor.kind === "child") {
    const profileRows = await db
      .select()
      .from(schema.learningProfile)
      .where(eq(schema.learningProfile.childId, actor.childId))
      .limit(1);
    readingAttrs = readingAttributes(profileFromRow(profileRows[0] ?? null));
  }
```
and spread onto the shell: `<div className="game-shell relative flex min-h-svh flex-col overflow-hidden" {...readingAttrs}>`.

- [ ] **Step 9: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`. Then in the dev server, as a parent, click "Reading support" on a hero, switch to that hero (demo persona switcher), and confirm the font changes.
```bash
git add src/lib/actions/learning-profile.ts "src/app" 
git commit -m "Add learning profile settings and app-wide reading support

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Play-time ledger math and access rules

**Files:**
- Create: `src/lib/utils/realm-access.ts`, `src/lib/utils/realm-access.test.ts`

**Interfaces:**
- Consumes: `timeToMinutes` from `@/lib/utils/schedule-days`.
- Produces:
  - `RealmAccessMode = "earned" | "scheduled" | "both"`, `LedgerKind = "earned" | "granted" | "spent"`
  - `LedgerRow = { kind: LedgerKind; minutes: number }`, `TimeBlock = { startTime: string; endTime: string }`
  - `RealmSettingsLike = { enabled: boolean; accessMode: RealmAccessMode; offHoursEnabled: boolean; dailyCapMinutes: number }`
  - `AccessInput = { timeOfDay: string; isSchoolDay: boolean; settings: RealmSettingsLike; ledgerToday: LedgerRow[]; classBlocksToday: TimeBlock[]; recessBlocksToday: TimeBlock[] }`
  - `AccessDenied = "disabled" | "cap_reached" | "school_hours" | "outside_recess" | "no_minutes"`
  - `AccessResult = { allowed: true; minutesRemaining: number; source: "off_hours" | "recess" | "earned" } | { allowed: false; reason: AccessDenied }`
  - `ledgerBalance(rows): number`, `minutesSpent(rows): number`, `isOutsideSchoolHours(timeOfDay, isSchoolDay, classBlocks): boolean`, `computeRealmAccess(input): AccessResult`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/realm-access.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeRealmAccess,
  isOutsideSchoolHours,
  ledgerBalance,
  minutesSpent,
  type AccessInput,
} from "./realm-access";

const settings = { enabled: true, accessMode: "earned" as const, offHoursEnabled: false, dailyCapMinutes: 30 };
const classes = [
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "13:00", endTime: "14:00" },
];
const base: AccessInput = {
  timeOfDay: "10:30",
  isSchoolDay: true,
  settings,
  ledgerToday: [{ kind: "earned", minutes: 10 }],
  classBlocksToday: classes,
  recessBlocksToday: [],
};

describe("ledger math", () => {
  it("balance is earned plus granted minus spent, never negative", () => {
    expect(ledgerBalance([{ kind: "earned", minutes: 5 }, { kind: "granted", minutes: 10 }, { kind: "spent", minutes: 7 }])).toBe(8);
    expect(ledgerBalance([{ kind: "spent", minutes: 7 }])).toBe(0);
  });
  it("spent sums only spent rows", () => {
    expect(minutesSpent([{ kind: "earned", minutes: 5 }, { kind: "spent", minutes: 3 }, { kind: "spent", minutes: 4 }])).toBe(7);
  });
});

describe("isOutsideSchoolHours", () => {
  it("is true on a non-school day", () => {
    expect(isOutsideSchoolHours("10:30", false, classes)).toBe(true);
  });
  it("is true when there are no class blocks", () => {
    expect(isOutsideSchoolHours("10:30", true, [])).toBe(true);
  });
  it("is true before the first class and at or after the last", () => {
    expect(isOutsideSchoolHours("08:59", true, classes)).toBe(true);
    expect(isOutsideSchoolHours("14:00", true, classes)).toBe(true);
  });
  it("is false between classes on a school day (a gap is still school time)", () => {
    expect(isOutsideSchoolHours("10:30", true, classes)).toBe(false);
  });
  it("treats a malformed time as during school (fail closed)", () => {
    expect(isOutsideSchoolHours("noon", true, classes)).toBe(false);
  });
});

describe("computeRealmAccess", () => {
  it("denies when disabled", () => {
    expect(computeRealmAccess({ ...base, settings: { ...settings, enabled: false } })).toEqual({ allowed: false, reason: "disabled" });
  });
  it("denies at the daily cap, whatever the mode", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "both", offHoursEnabled: true },
      isSchoolDay: false,
      ledgerToday: [{ kind: "earned", minutes: 60 }, { kind: "spent", minutes: 30 }],
    });
    expect(r).toEqual({ allowed: false, reason: "cap_reached" });
  });
  it("allows off hours with cap minus spent remaining", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, offHoursEnabled: true },
      isSchoolDay: false,
      ledgerToday: [{ kind: "spent", minutes: 12 }],
    });
    expect(r).toEqual({ allowed: true, minutesRemaining: 18, source: "off_hours" });
  });
  it("allows a recess block and limits to the block's remaining time", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled" },
      ledgerToday: [],
      recessBlocksToday: [{ startTime: "10:15", endTime: "10:40" }],
    });
    expect(r).toEqual({ allowed: true, minutesRemaining: 10, source: "recess" });
  });
  it("denies outside the recess block in scheduled mode", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled" },
      recessBlocksToday: [{ startTime: "11:00", endTime: "11:20" }],
    });
    expect(r).toEqual({ allowed: false, reason: "outside_recess" });
  });
  it("allows earned minutes and limits to the smaller of balance and cap headroom", () => {
    expect(computeRealmAccess(base)).toEqual({ allowed: true, minutesRemaining: 10, source: "earned" });
    const nearCap = computeRealmAccess({ ...base, ledgerToday: [{ kind: "earned", minutes: 50 }, { kind: "spent", minutes: 25 }] });
    expect(nearCap).toEqual({ allowed: true, minutesRemaining: 5, source: "earned" });
  });
  it("denies with no_minutes when the balance is empty in earned mode", () => {
    expect(computeRealmAccess({ ...base, ledgerToday: [] })).toEqual({ allowed: false, reason: "no_minutes" });
  });
  it("in both mode, recess wins when active and earned minutes cover the rest", () => {
    const both = { ...settings, accessMode: "both" as const };
    const inRecess = computeRealmAccess({ ...base, settings: both, recessBlocksToday: [{ startTime: "10:00", endTime: "11:00" }] });
    expect(inRecess).toEqual({ allowed: true, minutesRemaining: 30, source: "recess" });
    const afterRecess = computeRealmAccess({ ...base, settings: both, recessBlocksToday: [{ startTime: "09:00", endTime: "09:30" }] });
    expect(afterRecess).toEqual({ allowed: true, minutesRemaining: 10, source: "earned" });
  });
  it("names the most helpful denial in both mode", () => {
    const both = { ...settings, accessMode: "both" as const };
    expect(computeRealmAccess({ ...base, settings: both, ledgerToday: [] })).toEqual({ allowed: false, reason: "no_minutes" });
  });
  it("denies with school_hours when only off-hours access is on", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled", offHoursEnabled: true },
      recessBlocksToday: [],
    });
    expect(r).toEqual({ allowed: false, reason: "outside_recess" });
    const offOnly = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "earned", offHoursEnabled: true },
      ledgerToday: [],
    });
    expect(offOnly).toEqual({ allowed: false, reason: "no_minutes" });
  });
});
```
Note on `school_hours`: every access mode includes earned or scheduled, so the fallthrough reason is unreachable today. It stays in the type and the implementation so an "off-hours only" mode can be added later without touching the rules.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/realm-access.test.ts`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/realm-access.ts`:
```ts
import { timeToMinutes } from "./schedule-days";

export type RealmAccessMode = "earned" | "scheduled" | "both";
export type LedgerKind = "earned" | "granted" | "spent";
export type LedgerRow = { kind: LedgerKind; minutes: number };
export type TimeBlock = { startTime: string; endTime: string };

export type RealmSettingsLike = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  offHoursEnabled: boolean;
  dailyCapMinutes: number;
};

export type AccessInput = {
  timeOfDay: string; // "HH:mm"
  isSchoolDay: boolean;
  settings: RealmSettingsLike;
  ledgerToday: LedgerRow[];
  classBlocksToday: TimeBlock[];
  recessBlocksToday: TimeBlock[];
};

export type AccessDenied = "disabled" | "cap_reached" | "school_hours" | "outside_recess" | "no_minutes";

export type AccessResult =
  | { allowed: true; minutesRemaining: number; source: "off_hours" | "recess" | "earned" }
  | { allowed: false; reason: AccessDenied };

const TIME = /^\d{2}:\d{2}$/;

export function minutesSpent(rows: LedgerRow[]): number {
  return rows.filter((r) => r.kind === "spent").reduce((sum, r) => sum + r.minutes, 0);
}

/** Earned + granted − spent. Never negative: an over-spend is a cap problem, not debt. */
export function ledgerBalance(rows: LedgerRow[]): number {
  const credit = rows.filter((r) => r.kind !== "spent").reduce((sum, r) => sum + r.minutes, 0);
  return Math.max(0, credit - minutesSpent(rows));
}

function blockContains(block: TimeBlock, timeOfDay: string): boolean {
  return block.startTime <= timeOfDay && timeOfDay < block.endTime;
}

/**
 * "School hours" run from the first class to the end of the last one; the gaps
 * between classes are still school. A time we can't read counts as school so
 * a broken clock never opens the Realm.
 */
export function isOutsideSchoolHours(timeOfDay: string, isSchoolDay: boolean, classBlocks: TimeBlock[]): boolean {
  if (!isSchoolDay || classBlocks.length === 0) return true;
  if (!TIME.test(timeOfDay)) return false;
  const first = classBlocks.map((b) => b.startTime).sort()[0];
  const last = classBlocks.map((b) => b.endTime).sort().at(-1)!;
  return timeOfDay < first || timeOfDay >= last;
}

/** The rules, in order. Every allowed result is already capped by the daily ceiling. */
export function computeRealmAccess(input: AccessInput): AccessResult {
  const { timeOfDay, isSchoolDay, settings, ledgerToday, classBlocksToday, recessBlocksToday } = input;
  if (!settings.enabled) return { allowed: false, reason: "disabled" };

  const spent = minutesSpent(ledgerToday);
  const headroom = settings.dailyCapMinutes - spent;
  if (headroom <= 0) return { allowed: false, reason: "cap_reached" };

  if (settings.offHoursEnabled && isOutsideSchoolHours(timeOfDay, isSchoolDay, classBlocksToday)) {
    return { allowed: true, minutesRemaining: headroom, source: "off_hours" };
  }

  const usesRecess = settings.accessMode === "scheduled" || settings.accessMode === "both";
  const usesEarned = settings.accessMode === "earned" || settings.accessMode === "both";
  const validTime = TIME.test(timeOfDay);

  if (usesRecess && validTime) {
    const block = recessBlocksToday.find((b) => blockContains(b, timeOfDay));
    if (block) {
      const left = timeToMinutes(block.endTime) - timeToMinutes(timeOfDay);
      return { allowed: true, minutesRemaining: Math.min(left, headroom), source: "recess" };
    }
  }

  if (usesEarned) {
    const balance = ledgerBalance(ledgerToday);
    if (balance > 0) {
      return { allowed: true, minutesRemaining: Math.min(balance, headroom), source: "earned" };
    }
  }

  if (usesEarned) return { allowed: false, reason: "no_minutes" };
  if (usesRecess) return { allowed: false, reason: "outside_recess" };
  return { allowed: false, reason: "school_hours" };
}
```
Note: `timeToMinutes` exists at `src/lib/utils/schedule-days.ts:85`; confirm its signature is `(time: string) => number`.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/utils/realm-access.test.ts`
Expected: all pass.
```bash
git add src/lib/utils/realm-access.ts src/lib/utils/realm-access.test.ts
git commit -m "Add Realm play-time ledger math and access rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Realm settings rules, play service, actions, and the completion hook

**Files:**
- Create: `src/lib/utils/realm-settings.ts`, `src/lib/utils/realm-settings.test.ts`, `src/lib/services/realm-play.ts`, `src/lib/actions/realm-play.ts`, `src/lib/actions/realm-settings.ts`
- Modify: `src/lib/actions/quest-assignments.ts` (`completeAssignment`, after the avatar-item reward block, before `return { activityId }`)

**Interfaces:**
- Consumes: Task 9 types and `computeRealmAccess`; `schema.realmSettings`, `schema.realmPlayLedger`, `schema.recessBlock`, `schema.scheduleBlock`, `schema.schoolBreak`; `parseSchoolDays`, `weekdayOfDate` from `schedule-days`.
- Produces:
  - utils: `RealmSettings = { enabled: boolean; accessMode: RealmAccessMode; earnedMinutesPerQuest: number; offHoursEnabled: boolean; dailyCapMinutes: number; toneMode: "gentle" | "monsters" }`, `DEFAULT_REALM_SETTINGS`, `validateRealmSettingsPatch(patch: unknown): Partial<RealmSettings>`, `settingsFromRow(row | null): RealmSettings`
  - service: `loadRealmSettings(childId): Promise<RealmSettings>`, `loadLedger(childId, date): Promise<LedgerRow[]>`, `grantEarnedMinutesForCompletion(childId, assignmentId, date): Promise<void>`
  - actions (realm-settings): `getRealmSettings(childId): Promise<RealmSettings>`, `updateRealmSettings(childId, patch): Promise<void>`
  - actions (realm-play): `getRealmAccess(childId, date, timeOfDay): Promise<AccessResult>`, `recordRealmPlay(childId, date, minutes): Promise<void>`, `grantRealmMinutes(childId, date, minutes): Promise<void>`, `getRealmPlaySummary(childId, date): Promise<{ date: string; balance: number; spent: number }>`

- [ ] **Step 1: Write the failing settings test**

`src/lib/utils/realm-settings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_REALM_SETTINGS, settingsFromRow, validateRealmSettingsPatch } from "./realm-settings";

describe("settingsFromRow", () => {
  it("falls back to defaults", () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_REALM_SETTINGS);
    expect(settingsFromRow({ dailyCapMinutes: 45 })).toEqual({ ...DEFAULT_REALM_SETTINGS, dailyCapMinutes: 45 });
  });
});

describe("validateRealmSettingsPatch", () => {
  it("accepts valid values", () => {
    expect(
      validateRealmSettingsPatch({ accessMode: "both", earnedMinutesPerQuest: 10, dailyCapMinutes: 60, toneMode: "monsters", enabled: false, offHoursEnabled: true })
    ).toEqual({ accessMode: "both", earnedMinutesPerQuest: 10, dailyCapMinutes: 60, toneMode: "monsters", enabled: false, offHoursEnabled: true });
  });
  it("rejects an unknown mode or tone", () => {
    expect(() => validateRealmSettingsPatch({ accessMode: "always" })).toThrow();
    expect(() => validateRealmSettingsPatch({ toneMode: "gory" })).toThrow();
  });
  it("bounds minutes per quest to 0..60 and the cap to 5..240", () => {
    expect(() => validateRealmSettingsPatch({ earnedMinutesPerQuest: 61 })).toThrow();
    expect(() => validateRealmSettingsPatch({ earnedMinutesPerQuest: -1 })).toThrow();
    expect(() => validateRealmSettingsPatch({ dailyCapMinutes: 4 })).toThrow();
    expect(() => validateRealmSettingsPatch({ dailyCapMinutes: 241 })).toThrow();
    expect(validateRealmSettingsPatch({ earnedMinutesPerQuest: 0, dailyCapMinutes: 5 })).toEqual({ earnedMinutesPerQuest: 0, dailyCapMinutes: 5 });
  });
  it("rejects unknown keys", () => {
    expect(() => validateRealmSettingsPatch({ childId: "x" })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/realm-settings.test.ts`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement the settings util**

`src/lib/utils/realm-settings.ts`:
```ts
import type { RealmAccessMode } from "./realm-access";

export type ToneMode = "gentle" | "monsters";

export type RealmSettings = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  earnedMinutesPerQuest: number;
  offHoursEnabled: boolean;
  dailyCapMinutes: number;
  toneMode: ToneMode;
};

export const DEFAULT_REALM_SETTINGS: RealmSettings = {
  enabled: true,
  accessMode: "earned",
  earnedMinutesPerQuest: 5,
  offHoursEnabled: false,
  dailyCapMinutes: 30,
  toneMode: "gentle",
};

const ACCESS_MODES: RealmAccessMode[] = ["earned", "scheduled", "both"];
const TONES: ToneMode[] = ["gentle", "monsters"];
export const EARNED_MINUTES_RANGE = { min: 0, max: 60 } as const;
export const DAILY_CAP_RANGE = { min: 5, max: 240 } as const;

function inRange(v: unknown, r: { min: number; max: number }): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max;
}

export function settingsFromRow(row: Partial<Record<keyof RealmSettings, unknown>> | null | undefined): RealmSettings {
  if (!row) return { ...DEFAULT_REALM_SETTINGS };
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_REALM_SETTINGS.enabled,
    accessMode: ACCESS_MODES.includes(row.accessMode as RealmAccessMode) ? (row.accessMode as RealmAccessMode) : DEFAULT_REALM_SETTINGS.accessMode,
    earnedMinutesPerQuest: inRange(row.earnedMinutesPerQuest, EARNED_MINUTES_RANGE) ? row.earnedMinutesPerQuest : DEFAULT_REALM_SETTINGS.earnedMinutesPerQuest,
    offHoursEnabled: typeof row.offHoursEnabled === "boolean" ? row.offHoursEnabled : DEFAULT_REALM_SETTINGS.offHoursEnabled,
    dailyCapMinutes: inRange(row.dailyCapMinutes, DAILY_CAP_RANGE) ? row.dailyCapMinutes : DEFAULT_REALM_SETTINGS.dailyCapMinutes,
    toneMode: TONES.includes(row.toneMode as ToneMode) ? (row.toneMode as ToneMode) : DEFAULT_REALM_SETTINGS.toneMode,
  };
}

/** Strict: a grown-up's form must send exactly what the schema allows. */
export function validateRealmSettingsPatch(patch: unknown): Partial<RealmSettings> {
  if (!patch || typeof patch !== "object") throw new Error("Nothing to change.");
  const out: Partial<RealmSettings> = {};
  for (const [key, v] of Object.entries(patch as Record<string, unknown>)) {
    switch (key) {
      case "enabled":
      case "offHoursEnabled":
        if (typeof v !== "boolean") throw new Error(`${key} must be on or off.`);
        out[key] = v;
        break;
      case "accessMode":
        if (!ACCESS_MODES.includes(v as RealmAccessMode)) throw new Error("Choose earned, scheduled, or both.");
        out.accessMode = v as RealmAccessMode;
        break;
      case "toneMode":
        if (!TONES.includes(v as ToneMode)) throw new Error("Choose gentle or monsters.");
        out.toneMode = v as ToneMode;
        break;
      case "earnedMinutesPerQuest":
        if (!inRange(v, EARNED_MINUTES_RANGE)) throw new Error(`Minutes per quest must be ${EARNED_MINUTES_RANGE.min}–${EARNED_MINUTES_RANGE.max}.`);
        out.earnedMinutesPerQuest = v;
        break;
      case "dailyCapMinutes":
        if (!inRange(v, DAILY_CAP_RANGE)) throw new Error(`The daily cap must be ${DAILY_CAP_RANGE.min}–${DAILY_CAP_RANGE.max} minutes.`);
        out.dailyCapMinutes = v;
        break;
      default:
        throw new Error(`Unknown Realm setting: ${key}`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the settings test**

Run: `npx vitest run src/lib/utils/realm-settings.test.ts`
Expected: pass.

- [ ] **Step 5: Write the service**

`src/lib/services/realm-play.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { settingsFromRow, type RealmSettings } from "@/lib/utils/realm-settings";
import type { LedgerRow } from "@/lib/utils/realm-access";

/**
 * Realm play-time plumbing shared by the actions and the quest-completion
 * hook. Plain module: callers have already authorized the child.
 */

/** Insert-if-missing then select, so two first reads can't make two rows. */
export async function loadRealmSettings(childId: string): Promise<RealmSettings> {
  const now = new Date();
  await db
    .insert(schema.realmSettings)
    .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return settingsFromRow(rows[0] ?? null);
}

export async function loadLedger(childId: string, date: string): Promise<LedgerRow[]> {
  return db
    .select({ kind: schema.realmPlayLedger.kind, minutes: schema.realmPlayLedger.minutes })
    .from(schema.realmPlayLedger)
    .where(and(eq(schema.realmPlayLedger.childId, childId), eq(schema.realmPlayLedger.date, date)));
}

export async function appendLedger(
  childId: string,
  date: string,
  kind: LedgerRow["kind"],
  minutes: number,
  sourceAssignmentId: string | null = null
): Promise<void> {
  await db.insert(schema.realmPlayLedger).values({
    id: nanoid(),
    childId,
    date,
    kind,
    minutes,
    sourceAssignmentId,
    createdAt: new Date(),
  });
}

/**
 * Called once per completed quest. Minutes earned stay earned: revising the
 * quest later never claws them back, which keeps the ledger append-only and
 * the balance never negative.
 */
export async function grantEarnedMinutesForCompletion(
  childId: string,
  assignmentId: string,
  date: string
): Promise<void> {
  const settings = await loadRealmSettings(childId);
  const earns = settings.accessMode === "earned" || settings.accessMode === "both";
  if (!settings.enabled || !earns || settings.earnedMinutesPerQuest <= 0) return;
  await appendLedger(childId, date, "earned", settings.earnedMinutesPerQuest, assignmentId);
}
```

- [ ] **Step 6: Write the settings action**

`src/lib/actions/realm-settings.ts`:
```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { validateRealmSettingsPatch, type RealmSettings } from "@/lib/utils/realm-settings";

/** A hero may read their own settings; the Realm page will need them. */
export async function getRealmSettings(childId: string): Promise<RealmSettings> {
  await requireChildAccess(childId);
  return loadRealmSettings(childId);
}

export async function updateRealmSettings(childId: string, patch: Partial<RealmSettings>): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change Realm settings.");
  const clean = validateRealmSettingsPatch(patch);
  await loadRealmSettings(childId);
  await db
    .update(schema.realmSettings)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(schema.realmSettings.childId, childId));
  revalidatePath("/settings");
}
```

- [ ] **Step 7: Write the play action**

`src/lib/actions/realm-play.ts`:
```ts
"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { appendLedger, loadLedger, loadRealmSettings } from "@/lib/services/realm-play";
import { computeRealmAccess, ledgerBalance, minutesSpent, type AccessResult } from "@/lib/utils/realm-access";
import { parseSchoolDays, weekdayOfDate } from "@/lib/utils/schedule-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function assertDate(date: string) {
  if (!ISO_DATE.test(date)) throw new Error("That date doesn't look right.");
}

function assertMinutes(minutes: number, max: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > max) {
    throw new Error(`Minutes must be a whole number from 1 to ${max}.`);
  }
}

/** Is `date` a school day for this hero: a listed weekday and not inside a Long Rest. */
async function isSchoolDay(childId: string, familyId: string, date: string): Promise<boolean> {
  const child = await db
    .select({ schoolDays: schema.child.schoolDays })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!parseSchoolDays(child[0]?.schoolDays).includes(weekdayOfDate(date))) return false;
  const breaks = await db
    .select({ id: schema.schoolBreak.id })
    .from(schema.schoolBreak)
    .where(
      and(
        eq(schema.schoolBreak.familyId, familyId),
        lte(schema.schoolBreak.startDate, date),
        gte(schema.schoolBreak.endDate, date)
      )
    )
    .limit(1);
  return breaks.length === 0;
}

/** May the hero enter the Realm right now? Heroes may ask about themselves. */
export async function getRealmAccess(childId: string, date: string, timeOfDay: string): Promise<AccessResult> {
  const { familyId } = await requireChildAccess(childId);
  assertDate(date);
  if (!TIME.test(timeOfDay)) throw new Error("That time doesn't look right.");
  const day = weekdayOfDate(date);
  const [settings, ledgerToday, classBlocksToday, recessBlocksToday, schoolDay] = await Promise.all([
    loadRealmSettings(childId),
    loadLedger(childId, date),
    db
      .select({ startTime: schema.scheduleBlock.startTime, endTime: schema.scheduleBlock.endTime })
      .from(schema.scheduleBlock)
      .where(and(eq(schema.scheduleBlock.childId, childId), eq(schema.scheduleBlock.dayOfWeek, day))),
    db
      .select({ startTime: schema.recessBlock.startTime, endTime: schema.recessBlock.endTime })
      .from(schema.recessBlock)
      .where(and(eq(schema.recessBlock.childId, childId), eq(schema.recessBlock.dayOfWeek, day))),
    isSchoolDay(childId, familyId, date),
  ]);
  return computeRealmAccess({ timeOfDay, isSchoolDay: schoolDay, settings, ledgerToday, classBlocksToday, recessBlocksToday });
}

/** The Realm's heartbeat will call this; capped per call so a stuck client can't burn a day at once. */
export async function recordRealmPlay(childId: string, date: string, minutes: number): Promise<void> {
  await requireChildAccess(childId, { write: true });
  assertDate(date);
  assertMinutes(minutes, 30);
  await appendLedger(childId, date, "spent", minutes);
}

export async function grantRealmMinutes(childId: string, date: string, minutes: number): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can grant Realm minutes.");
  assertDate(date);
  assertMinutes(minutes, 240);
  await appendLedger(childId, date, "granted", minutes);
  revalidatePath("/settings");
}

export async function getRealmPlaySummary(
  childId: string,
  date: string
): Promise<{ date: string; balance: number; spent: number }> {
  await requireChildAccess(childId);
  assertDate(date);
  const rows = await loadLedger(childId, date);
  return { date, balance: ledgerBalance(rows), spent: minutesSpent(rows) };
}
```

- [ ] **Step 8: Hook quest completion**

In `src/lib/actions/quest-assignments.ts` add `import { grantEarnedMinutesForCompletion } from "@/lib/services/realm-play";` and, inside `completeAssignment`, after the `rewardAvatarItem` block and before `return { activityId };`:
```ts
  // Finishing a quest can earn Realm play minutes; the service decides based
  // on the hero's Realm settings.
  await grantEarnedMinutesForCompletion(row.assignment.childId, assignmentId, row.assignment.date);
```

- [ ] **Step 9: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: pass. Smoke: in the dev server complete a quest as a hero, then query the ledger:
`node -e "const {createClient}=require('@libsql/client');createClient({url:'file:./local.db'}).execute('select kind,minutes,date from realm_play_ledger order by created_at desc limit 3').then(r=>console.log(r.rows))"`
Expected: one `earned` row of 5 minutes.
```bash
git add src/lib/utils/realm-settings.ts src/lib/utils/realm-settings.test.ts src/lib/services/realm-play.ts src/lib/actions/realm-play.ts src/lib/actions/realm-settings.ts src/lib/actions/quest-assignments.ts
git commit -m "Add Realm settings, play-time ledger actions, and earned minutes on quest completion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Realm settings panel

**Files:**
- Create: `src/app/(app)/settings/realm-settings-panel.tsx`, `src/app/(app)/settings/realm-settings-panel.test.tsx`
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/child-list.tsx`

**Interfaces:**
- Consumes: `getRealmSettings`, `updateRealmSettings` (Task 10), `grantRealmMinutes`, `getRealmPlaySummary` (Task 10), `RealmSettings`, `EARNED_MINUTES_RANGE`, `DAILY_CAP_RANGE`, `localDateOf`.
- Produces: `RealmSettingsPanel({ childId, settings, summary })` where `summary = { date: string; balance: number; spent: number }`.

- [ ] **Step 1: Write the failing test**

`src/app/(app)/settings/realm-settings-panel.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmSettingsPanel } from "./realm-settings-panel";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const updateRealmSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/realm-settings", () => ({
  updateRealmSettings: (...a: unknown[]) => updateRealmSettings(...a),
}));
const grantRealmMinutes = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/realm-play", () => ({
  grantRealmMinutes: (...a: unknown[]) => grantRealmMinutes(...a),
}));

const summary = { date: "2026-09-02", balance: 10, spent: 5 };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RealmSettingsPanel", () => {
  it("hides minutes-per-quest in scheduled mode", () => {
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode: "scheduled" }} summary={summary} />);
    expect(screen.queryByLabelText(/minutes per quest/i)).not.toBeInTheDocument();
  });

  it("shows minutes-per-quest in earned mode and saves a mode change", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByLabelText(/minutes per quest/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /both/i }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { accessMode: "both" });
  });

  it("grants minutes for today", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("button", { name: /grant 15/i }));
    expect(grantRealmMinutes).toHaveBeenCalledWith("c1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 15);
  });

  it("shows today's balance and spent minutes", () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByText(/10 minutes banked/i)).toBeInTheDocument();
    expect(screen.getByText(/5 of 30 played/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/(app)/settings/realm-settings-panel.test.tsx"`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Write the panel**

`src/app/(app)/settings/realm-settings-panel.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateRealmSettings } from "@/lib/actions/realm-settings";
import { grantRealmMinutes } from "@/lib/actions/realm-play";
import { localDateOf } from "@/lib/utils/schedule-days";
import {
  DAILY_CAP_RANGE,
  EARNED_MINUTES_RANGE,
  type RealmSettings,
} from "@/lib/utils/realm-settings";
import type { RealmAccessMode } from "@/lib/utils/realm-access";

const MODES: { id: RealmAccessMode; label: string; hint: string }[] = [
  { id: "earned", label: "Earned", hint: "Each finished quest banks minutes." },
  { id: "scheduled", label: "Scheduled", hint: "Recess blocks on the schedule open the Realm." },
  { id: "both", label: "Both", hint: "Either one opens the Realm." },
];

export function RealmSettingsPanel({
  childId,
  settings,
  summary,
}: {
  childId: string;
  settings: RealmSettings;
  summary: { date: string; balance: number; spent: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [perQuest, setPerQuest] = useState(String(settings.earnedMinutesPerQuest));
  const [cap, setCap] = useState(String(settings.dailyCapMinutes));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const save = (patch: Partial<RealmSettings>) => run(() => updateRealmSettings(childId, patch));
  const usesEarned = settings.accessMode === "earned" || settings.accessMode === "both";

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">The Realm</h4>
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.enabled ? "The Realm is open to this hero." : "The Realm is closed to this hero."}</p>
          <p className="text-xs text-muted-foreground">The 3D world where quests become deeds and seasons earn crowns.</p>
        </div>
        <Switch aria-label="Realm enabled" checked={settings.enabled} disabled={busy} onCheckedChange={() => save({ enabled: !settings.enabled })} />
      </div>

      <fieldset className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How play time opens</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`realm-mode-${childId}`}
                value={m.id}
                checked={settings.accessMode === m.id}
                disabled={busy}
                onChange={() => save({ accessMode: m.id })}
                aria-label={m.label}
              />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {usesEarned && (
          <div className="mt-3 flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`per-quest-${childId}`}>Minutes per quest</Label>
              <Input
                id={`per-quest-${childId}`}
                type="number"
                min={EARNED_MINUTES_RANGE.min}
                max={EARNED_MINUTES_RANGE.max}
                value={perQuest}
                onChange={(e) => setPerQuest(e.target.value)}
                className="w-24"
              />
            </div>
            <Button size="sm" variant="outline" disabled={busy || perQuest === String(settings.earnedMinutesPerQuest)} onClick={() => save({ earnedMinutesPerQuest: parseInt(perQuest, 10) })}>
              Save
            </Button>
            <p className="pb-2 text-xs text-muted-foreground">Minutes earned stay earned.</p>
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.offHoursEnabled ? "Open outside school hours." : "School hours only."}</p>
          <p className="text-xs text-muted-foreground">Before the first class, after the last, and on days off. The daily cap still applies.</p>
        </div>
        <Switch aria-label="Off-hours play" checked={settings.offHoursEnabled} disabled={busy} onCheckedChange={() => save({ offHoursEnabled: !settings.offHoursEnabled })} />
      </div>

      <div className="flex items-end gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="space-y-1">
          <Label htmlFor={`cap-${childId}`}>Daily cap (minutes)</Label>
          <Input id={`cap-${childId}`} type="number" min={DAILY_CAP_RANGE.min} max={DAILY_CAP_RANGE.max} value={cap} onChange={(e) => setCap(e.target.value)} className="w-24" />
        </div>
        <Button size="sm" variant="outline" disabled={busy || cap === String(settings.dailyCapMinutes)} onClick={() => save({ dailyCapMinutes: parseInt(cap, 10) })}>
          Save
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">Screen time in the Realm never passes this, whatever opens it.</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.toneMode === "gentle" ? "Gentle: fog, shadows, and statues to clear." : "Monsters: cartoon slimes and skeletons."}</p>
          <p className="text-xs text-muted-foreground">Nothing bleeds either way, and a hero never dies — they lose focus and try again.</p>
        </div>
        <Button size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => save({ toneMode: settings.toneMode === "gentle" ? "monsters" : "gentle" })}>
          {settings.toneMode === "gentle" ? "Allow Monsters" : "Keep It Gentle"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{summary.balance} minutes banked today</p>
          <p className="text-xs text-muted-foreground">{summary.spent} of {settings.dailyCapMinutes} played</p>
        </div>
        <div className="flex gap-2">
          {[15, 30].map((m) => (
            <Button key={m} size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => run(() => grantRealmMinutes(childId, localDateOf(new Date()), m))}>
              Grant {m}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the panel test**

Run: `npx vitest run "src/app/(app)/settings/realm-settings-panel.test.tsx"`
Expected: 4 passed.

- [ ] **Step 5: Wire into settings**

`src/app/(app)/settings/page.tsx`: import `getRealmSettings` from `@/lib/actions/realm-settings`, `getRealmPlaySummary` from `@/lib/actions/realm-play`, `formatDate` from `@/lib/utils/dates`. In the per-child `Promise.all` add `isChildView ? null : getRealmSettings(child.id)` and `isChildView ? null : getRealmPlaySummary(child.id, formatDate(new Date()))` (destructure `realmSettings`, `realmPlay`) and return both.

`src/app/(app)/settings/child-list.tsx`: import `RealmSettingsPanel` and `type RealmSettings`; add to `Child`:
```ts
  realmSettings?: RealmSettings | null;
  realmPlay?: { date: string; balance: number; spent: number } | null;
```
and in `ChildCard`, after the `LearningProfilePanel` block:
```tsx
        {!isChildView && child.realmSettings && child.realmPlay && (
          <RealmSettingsPanel childId={child.id} settings={child.realmSettings} summary={child.realmPlay} />
        )}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add "src/app/(app)/settings"
git commit -m "Add the Realm settings panel to the Chronicle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Recess blocks

**Files:**
- Create: `src/lib/utils/recess-blocks.ts`, `src/lib/utils/recess-blocks.test.ts`, `src/lib/actions/recess-blocks.ts`, `src/components/recess-blocks-panel.tsx`
- Modify: `src/app/(app)/schedule/page.tsx`

**Interfaces:**
- Consumes: `timeRangesOverlap`, `DAYS_OF_WEEK`, `DAY_LABELS`, `DayOfWeek` from `schedule-days`; `TimeBlock` from `realm-access`.
- Produces:
  - utils: `isValidTimeRange(start: string, end: string): boolean`, `findRecessConflict(candidate: TimeBlock, classBlocks: TimeBlock[], recessBlocks: TimeBlock[]): TimeBlock | null`
  - actions: `RecessBlockRecord = { id: string; dayOfWeek: DayOfWeek; startTime: string; endTime: string }`, `getRecessBlocks(childId): Promise<RecessBlockRecord[]>`, `addRecessBlock(childId, block: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }): Promise<void>`, `removeRecessBlock(blockId: string): Promise<void>`
  - `RecessBlocksPanel({ childId, blocks })`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/recess-blocks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { findRecessConflict, isValidTimeRange } from "./recess-blocks";

const math = { startTime: "09:00", endTime: "10:00" };
const recess = { startTime: "10:30", endTime: "10:45" };

describe("isValidTimeRange", () => {
  it("requires HH:mm and a start before the end", () => {
    expect(isValidTimeRange("09:00", "09:30")).toBe(true);
    expect(isValidTimeRange("09:30", "09:30")).toBe(false);
    expect(isValidTimeRange("9:00", "09:30")).toBe(false);
  });
});

describe("findRecessConflict", () => {
  it("returns the class block a recess would overlap", () => {
    expect(findRecessConflict({ startTime: "09:45", endTime: "10:15" }, [math], [])).toEqual(math);
  });
  it("returns another recess block it would overlap", () => {
    expect(findRecessConflict({ startTime: "10:40", endTime: "11:00" }, [math], [recess])).toEqual(recess);
  });
  it("treats an identical range as a conflict, unlike class-on-class", () => {
    expect(findRecessConflict({ ...math }, [math], [])).toEqual(math);
  });
  it("allows back-to-back blocks", () => {
    expect(findRecessConflict({ startTime: "10:00", endTime: "10:30" }, [math], [recess])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/recess-blocks.test.ts`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement the util**

`src/lib/utils/recess-blocks.ts`:
```ts
import { timeRangesOverlap } from "./schedule-days";
import type { TimeBlock } from "./realm-access";

const TIME = /^\d{2}:\d{2}$/;

export function isValidTimeRange(start: string, end: string): boolean {
  return TIME.test(start) && TIME.test(end) && start < end;
}

/**
 * Recess uses plain overlap, not `timeRangesConflict`: two classes may share
 * one slot on purpose, but a recess sitting on a class would leave no honest
 * answer to "is it class or recess at 9:30?"
 */
export function findRecessConflict(
  candidate: TimeBlock,
  classBlocks: TimeBlock[],
  recessBlocks: TimeBlock[]
): TimeBlock | null {
  const hit = [...classBlocks, ...recessBlocks].find((b) =>
    timeRangesOverlap(candidate.startTime, candidate.endTime, b.startTime, b.endTime)
  );
  return hit ?? null;
}
```

- [ ] **Step 4: Run the util test**

Run: `npx vitest run src/lib/utils/recess-blocks.test.ts`
Expected: pass.

- [ ] **Step 5: Write the action**

`src/lib/actions/recess-blocks.ts`:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { DAYS_OF_WEEK, type DayOfWeek } from "@/lib/utils/schedule-days";
import { findRecessConflict, isValidTimeRange } from "@/lib/utils/recess-blocks";

export type RecessBlockRecord = { id: string; dayOfWeek: DayOfWeek; startTime: string; endTime: string };

export async function getRecessBlocks(childId: string): Promise<RecessBlockRecord[]> {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      id: schema.recessBlock.id,
      dayOfWeek: schema.recessBlock.dayOfWeek,
      startTime: schema.recessBlock.startTime,
      endTime: schema.recessBlock.endTime,
    })
    .from(schema.recessBlock)
    .where(eq(schema.recessBlock.childId, childId));
  return rows.sort((a, b) =>
    a.dayOfWeek === b.dayOfWeek
      ? a.startTime.localeCompare(b.startTime)
      : DAYS_OF_WEEK.indexOf(a.dayOfWeek) - DAYS_OF_WEEK.indexOf(b.dayOfWeek)
  );
}

export async function addRecessBlock(
  childId: string,
  block: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }
): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can schedule recess.");
  if (!DAYS_OF_WEEK.includes(block.dayOfWeek)) throw new Error("Pick a day of the week.");
  if (!isValidTimeRange(block.startTime, block.endTime)) throw new Error("Recess must start before it ends.");

  const [classes, recesses] = await Promise.all([
    db
      .select({ startTime: schema.scheduleBlock.startTime, endTime: schema.scheduleBlock.endTime })
      .from(schema.scheduleBlock)
      .where(and(eq(schema.scheduleBlock.childId, childId), eq(schema.scheduleBlock.dayOfWeek, block.dayOfWeek))),
    db
      .select({ startTime: schema.recessBlock.startTime, endTime: schema.recessBlock.endTime })
      .from(schema.recessBlock)
      .where(and(eq(schema.recessBlock.childId, childId), eq(schema.recessBlock.dayOfWeek, block.dayOfWeek))),
  ]);
  const clash = findRecessConflict(block, classes, recesses);
  if (clash) throw new Error(`That overlaps ${clash.startTime}–${clash.endTime}. Recess needs its own time.`);

  const now = new Date();
  await db.insert(schema.recessBlock).values({ id: nanoid(), childId, ...block, createdAt: now, updatedAt: now });
  revalidatePath("/schedule");
}

export async function removeRecessBlock(blockId: string): Promise<void> {
  const rows = await db
    .select({ childId: schema.recessBlock.childId })
    .from(schema.recessBlock)
    .where(eq(schema.recessBlock.id, blockId))
    .limit(1);
  if (!rows[0]) throw new Error("That recess is already gone.");
  const { access } = await requireChildAccess(rows[0].childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can remove recess.");
  await db.delete(schema.recessBlock).where(eq(schema.recessBlock.id, blockId));
  revalidatePath("/schedule");
}
```

- [ ] **Step 6: Write the panel**

`src/components/recess-blocks-panel.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { addRecessBlock, removeRecessBlock, type RecessBlockRecord } from "@/lib/actions/recess-blocks";
import { DAYS_OF_WEEK, DAY_LABELS, formatTimeOfDay, type DayOfWeek } from "@/lib/utils/schedule-days";

export function RecessBlocksPanel({ childId, blocks }: { childId: string; blocks: RecessBlockRecord[] }) {
  const router = useRouter();
  const [day, setDay] = useState<DayOfWeek>("mon");
  const [start, setStart] = useState("10:30");
  const [end, setEnd] = useState("10:45");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameFrame title="Recess" icon={<GameIcon name="campfire" className="size-4 text-[var(--gold-bright)]" />}>
      <p className="mb-3 text-xs text-muted-foreground">
        Scheduled time in the Realm. Only counts when the hero&rsquo;s Realm play is set to scheduled or both.
      </p>
      {error && <div className="mb-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      {blocks.length > 0 && (
        <ul className="mb-3 space-y-1">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-md border border-gold-dim px-3 py-1.5 text-sm">
              <span>
                {DAY_LABELS[b.dayOfWeek]} &middot; {formatTimeOfDay(b.startTime)}–{formatTimeOfDay(b.endTime)}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removeRecessBlock(b.id))} aria-label={`Remove ${DAY_LABELS[b.dayOfWeek]} recess`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)} className="w-28" aria-label="Day">
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>{DAY_LABELS[d]}</option>
          ))}
        </Select>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-32" aria-label="Start" />
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32" aria-label="End" />
        <Button size="sm" disabled={busy} onClick={() => run(() => addRecessBlock(childId, { dayOfWeek: day, startTime: start, endTime: end }))}>
          Add Recess
        </Button>
      </div>
    </GameFrame>
  );
}
```
`campfire` is a registered GameIcon name (see `src/components/game-icon.tsx`); if the typecheck disagrees, use `hourglass`.

- [ ] **Step 7: Mount on the Schedule page**

`src/app/(app)/schedule/page.tsx`: import `getRecessBlocks` and `RecessBlocksPanel`; add `isChildView ? [] : getRecessBlocks(activeChild.id)` to the page's `Promise.all` (destructure `recessBlocks`); render after the `StudentScheduleEditor` / empty-subjects branch:
```tsx
      {!isChildView && <RecessBlocksPanel childId={activeChild.id} blocks={recessBlocks} />}
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`. Smoke in the dev server: add a recess that overlaps a class and confirm the error; add a clean one and confirm it lists.
```bash
git add src/lib/utils/recess-blocks.ts src/lib/utils/recess-blocks.test.ts src/lib/actions/recess-blocks.ts src/components/recess-blocks-panel.tsx "src/app/(app)/schedule/page.tsx"
git commit -m "Add scheduled recess blocks with conflict checking

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Final verification

**Files:** none new.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all three clean. Paste the summary line of the test run into the PR description.

- [ ] **Step 2: Migration sanity**

Run: `ls src/lib/db/migrations | tail -3` and confirm exactly one new migration (`0021_*`) was added by this branch; `git diff main --stat -- src/lib/db/migrations` should show one `.sql` plus the `meta/` journal and snapshot.

- [ ] **Step 3: Spec walk**

Open `docs/superpowers/specs/2026-09-02-realm-foundations-design.md` and tick each section against the code: A (seasons: Tasks 4–6), B settings and profile (Tasks 7–8, 10–11), B recess (Task 12), C ledger and access (Tasks 9–10), D level (Task 1), access-control table (every parent-only action rejects `isChildActor`). Anything missing is a new task, not a note.

- [ ] **Step 4: Hand off**

Use `superpowers:finishing-a-development-branch` to merge or open the PR from `realm-foundations`.
