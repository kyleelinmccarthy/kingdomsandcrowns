# Excused Days and Missed-Assignment Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent see which past days were missed, excuse a day after the fact so it stops breaking a hero's streak, and either excuse or reschedule that day's work — with a coherent experience for every kind of logged-in actor.

**Architecture:** A new per-child `excused_day` table feeds a new `excusedDates` option into the existing pure streak functions, so current and longest streaks treat an excused day exactly like a school break. A new pure `missed-days.ts` selector reuses the streak module's own `isDayOff` rule to decide which past dates count as missed, keeping the panel and the streak from drifting apart. Thin server actions wrap the writes and call the existing `recomputeFamilyStreaks`, so a streak repairs the moment a day is excused rather than waiting for a hero's next activity.

**Tech Stack:** Next.js App Router (server actions), Drizzle ORM on libSQL/Turso, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-07-excused-days-design.md`

## Global Constraints

- Branch: `excused-days`, already rebased onto `origin/main`. Do not rebase again mid-plan.
- Work only inside the worktree `.claude/worktrees/excused-days`. The main checkout has unrelated uncommitted work.
- Reason values are exactly `"sick" | "appointment" | "family" | "holiday" | "other"`.
- Assignment statuses after this plan are exactly `"pending" | "completed" | "skipped" | "stuck" | "excused"`.
- The parent missed-day window is **30 days**. The child catch-up window stays at `MAKEUP_LOOKBACK_DAYS = 7`. Do not change the latter.
- **Testing convention (important):** this repo has **no server-action tests**. Pure modules under `src/lib/utils/` get Vitest unit tests; components get tests with actions mocked via `vi.mock`. Server actions in `src/lib/actions/` are kept thin and are not directly unit-tested — push any real decision-making into a pure util so it *can* be tested. Follow this; do not introduce a new action-testing harness.
- After any `src/lib/db/schema.ts` edit, run `npm run db:generate` then `npm run db:migrate`.
- Run `npx vitest run` before every commit. All tests must pass.
- `longest_streak` must never be lowered by any code path.
- A hero (`isChildActor`) must never see missed-day accounting or excuse controls.

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0022_*.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `schema.excusedDay` table object with columns `id, childId, date, reason, note, createdAt, updatedAt`; `schema.questAssignment.originalDate`; `"excused"` as a legal `questAssignment.status` value.

Note: in SQLite a Drizzle `text(..., { enum: [...] })` column is plain `TEXT` — the enum is compile-time only. Widening `status` therefore generates **no** SQL. Only the new table and the new `original_date` column produce migration statements.

- [ ] **Step 1: Add the `excused_day` table to schema.ts**

Add immediately after the `makeupDay` table definition:

```ts
/**
 * A date a grown-up has excused for one hero after the fact — a sick day, an
 * appointment, a family day, a holiday nobody had entered yet.
 *
 * An excused date is skipped by the streak exactly the way a school break is:
 * it neither extends a streak nor breaks one. Per-child rather than per-family
 * because the ordinary case is one hero out and the other not; "apply to all"
 * is a convenience in the UI that writes one row per hero.
 */
export const excusedDay = sqliteTable(
  "excused_day",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO YYYY-MM-DD
    reason: text("reason", {
      enum: ["sick", "appointment", "family", "holiday", "other"],
    }).notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("excused_day_child_date_idx").on(table.childId, table.date),
    index("excused_day_child_idx").on(table.childId),
  ]
);
```

- [ ] **Step 2: Widen the assignment status enum and add `original_date`**

In `src/lib/db/schema.ts`, find the `questAssignment` table's `status` column (currently `text("status", { enum: ["pending", "completed", "skipped", "stuck"] })`) and change it to:

```ts
    // "excused" is a grown-up saying this day did not count — a sick day, an
    // appointment. Deliberately distinct from "skipped", which is a decision
    // not to do a particular quest.
    status: text("status", {
      enum: ["pending", "completed", "skipped", "stuck", "excused"],
    })
      .notNull()
      .default("pending"),
```

Then add this column to the same table, directly after `date`:

```ts
    // Set the first time an assignment is moved to another day, and never
    // overwritten after — a quest moved twice still points at the day it was
    // originally set for.
    originalDate: text("original_date"),
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0022_*.sql` containing `CREATE TABLE excused_day`, its two indexes, and `ALTER TABLE quest_assignment ADD original_date`. It must NOT contain any change to the `status` column.

- [ ] **Step 4: Apply the migration locally**

Run: `npm run db:migrate`
Expected: completes without error.

- [ ] **Step 5: Verify the suite still passes**

Run: `npx vitest run`
Expected: 411 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations
git commit -m "Add excused_day table and assignment excused status"
```

---

### Task 2: Streak honours excused dates

**Files:**
- Modify: `src/lib/utils/streak.ts`
- Test: `src/lib/utils/streak.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (pure module).
- Produces:
  - `StreakOptions.excusedDates?: readonly string[] | null`
  - `export function isDayOff(isoDate: string, options: StreakOptions): boolean` — note the signature changes from four positional args to `(isoDate, options)`; update its two internal callers.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/streak.test.ts`:

```ts
describe("excused days", () => {
  const today = new Date("2026-09-07T12:00:00Z"); // a Monday
  const schoolDays = ["mon", "tue", "wed", "thu", "fri"];

  it("skips an excused day instead of breaking the streak", () => {
    // Fri 4th, Thu 3rd logged; Wed 2nd excused; Tue 1st, Mon 31st logged.
    const dates = ["2026-09-04", "2026-09-03", "2026-09-01", "2026-08-31"];
    expect(computeStreak(dates, today, { schoolDays })).toBe(2);
    expect(
      computeStreak(dates, today, { schoolDays, excusedDates: ["2026-09-02"] })
    ).toBe(4);
  });

  it("still counts activity logged on an excused day", () => {
    const dates = ["2026-09-04", "2026-09-03", "2026-09-02"];
    expect(
      computeStreak(dates, today, { schoolDays, excusedDates: ["2026-09-03"] })
    ).toBe(3);
  });

  it("honours excused dates in computeLongestStreak", () => {
    const dates = ["2026-09-04", "2026-09-03", "2026-09-01", "2026-08-31"];
    expect(computeLongestStreak(dates, { schoolDays })).toBe(2);
    expect(
      computeLongestStreak(dates, { schoolDays, excusedDates: ["2026-09-02"] })
    ).toBe(4);
  });

  // The production regression this feature exists to fix. Both heroes'
  // real histories, read from prod on 2026-09-07.
  describe("the Aug 31 regression", () => {
    const asOf = new Date("2026-09-04T19:36:00Z");
    const options = { schoolDays, optionalDays: ["fri"] };
    const lily = [
      "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01",
      "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24",
      "2026-08-20", "2026-08-19",
    ];
    const lucas = [
      "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01",
      "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24",
      "2026-08-20", "2026-08-19",
    ];

    it("reproduces the broken streak of 4", () => {
      expect(computeStreak(lily, asOf, options)).toBe(4);
      expect(computeStreak(lucas, asOf, options)).toBe(4);
    });

    it("restores the streak once Aug 31 is excused", () => {
      const excused = { ...options, excusedDates: ["2026-08-31"] };
      expect(computeStreak(lily, asOf, excused)).toBe(11);
      expect(computeStreak(lucas, asOf, excused)).toBe(10);
    });
  });
});

describe("isDayOff", () => {
  it("is true for a non-school weekday, an optional day, a break, and an excused date", () => {
    const opts = {
      schoolDays: ["mon", "tue", "wed", "thu", "fri"],
      optionalDays: ["fri"],
      breaks: [{ startDate: "2026-09-07", endDate: "2026-09-07" }],
      excusedDates: ["2026-08-31"],
    };
    expect(isDayOff("2026-09-05", opts)).toBe(true); // Saturday
    expect(isDayOff("2026-09-04", opts)).toBe(true); // optional Friday
    expect(isDayOff("2026-09-07", opts)).toBe(true); // break
    expect(isDayOff("2026-08-31", opts)).toBe(true); // excused
    expect(isDayOff("2026-09-03", opts)).toBe(false); // ordinary Thursday
  });
});
```

Update the import at the top of the file to:

```ts
import { computeStreak, computeLongestStreak, isDayOff } from "./streak";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/streak.test.ts`
Expected: FAIL — `isDayOff` is not exported, and the excused assertions return the unexcused numbers.

- [ ] **Step 3: Implement**

In `src/lib/utils/streak.ts`, add to `StreakOptions`:

```ts
  /**
   * Dates a grown-up excused after the fact — a sick day, an appointment.
   * Skipped exactly like a break: an empty one never resets the streak, and
   * activity logged on one still counts toward it.
   */
  excusedDates?: readonly string[] | null;
```

Replace the private `isDayOff` with this exported version:

```ts
/**
 * True when nothing is expected on this date — not a school day, marked
 * optional, inside a break, or excused after the fact.
 *
 * Exported because the missed-days panel must ask the same question the streak
 * asks. Two copies of this rule is how the two would drift apart.
 */
export function isDayOff(isoDate: string, options: StreakOptions): boolean {
  const weekday = weekdayOfDate(isoDate);
  if (options.schoolDays?.length && !options.schoolDays.includes(weekday)) return true;
  if (options.optionalDays?.includes(weekday)) return true;
  if (options.excusedDates?.includes(isoDate)) return true;
  return (options.breaks ?? []).some((b) => isoDate >= b.startDate && isoDate <= b.endDate);
}
```

In `computeStreak`, delete the local `schoolDaySet` / `optionalDaySet` / `breaks` bindings and change the loop's else-branch to:

```ts
    } else if (i !== 0 && !isDayOff(dateStr, options)) {
```

In `computeLongestStreak`, delete the same local bindings and change `gapIsAllDaysOff` to take options:

```ts
/** True when every day strictly between two active dates is a day off. */
function gapIsAllDaysOff(from: string, to: string, options: StreakOptions): boolean {
  for (let day = addDaysToDate(from, 1); day < to; day = addDaysToDate(day, 1)) {
    if (!isDayOff(day, options)) return false;
  }
  return true;
}
```

and its call site to `gapIsAllDaysOff(previous, date, options)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/streak.test.ts`
Expected: PASS, including the two Aug 31 regression tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all pass. `isDayOff`'s signature change is internal to `streak.ts`; nothing else called it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/streak.ts src/lib/utils/streak.test.ts
git commit -m "Treat excused dates as days off in streak math"
```

---

### Task 3: The missed-days selector

**Files:**
- Create: `src/lib/utils/missed-days.ts`
- Test: `src/lib/utils/missed-days.test.ts`

**Interfaces:**
- Consumes: `isDayOff`, `StreakOptions`, `DateRange` from `./streak` (Task 2).
- Produces:
  - `export const MISSED_DAYS_WINDOW = 30`
  - `export type MissedDay = { date: string; unfinishedCount: number; empty: boolean; brokeStreak: boolean }`
  - `export type MissedDaysInput = { today: string; windowDays?: number; activeDates: Iterable<string>; assignments: readonly { date: string; status: string }[] } & StreakOptions`
  - `export function selectMissedDays(input: MissedDaysInput): MissedDay[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/missed-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectMissedDays } from "./missed-days";

const schoolDays = ["mon", "tue", "wed", "thu", "fri"];
// 2026-09-07 is a Monday.
const base = { today: "2026-09-07", schoolDays, assignments: [], activeDates: [] };

describe("selectMissedDays", () => {
  it("reports a required school day with no activity", () => {
    const result = selectMissedDays({ ...base, activeDates: ["2026-09-04"] });
    expect(result.map((d) => d.date)).toContain("2026-09-03");
  });

  it("never reports weekends, optional days, breaks, or excused days", () => {
    const result = selectMissedDays({
      ...base,
      optionalDays: ["fri"],
      breaks: [{ startDate: "2026-09-02", endDate: "2026-09-02" }],
      excusedDates: ["2026-09-01"],
    });
    const dates = result.map((d) => d.date);
    expect(dates).not.toContain("2026-09-05"); // Saturday
    expect(dates).not.toContain("2026-09-06"); // Sunday
    expect(dates).not.toContain("2026-09-04"); // optional Friday
    expect(dates).not.toContain("2026-09-02"); // break
    expect(dates).not.toContain("2026-09-01"); // excused
  });

  it("excludes today itself", () => {
    const result = selectMissedDays(base);
    expect(result.map((d) => d.date)).not.toContain("2026-09-07");
  });

  it("reports a day that has activity but still owes work", () => {
    const result = selectMissedDays({
      ...base,
      activeDates: ["2026-09-03"],
      assignments: [
        { date: "2026-09-03", status: "completed" },
        { date: "2026-09-03", status: "pending" },
        { date: "2026-09-03", status: "stuck" },
        { date: "2026-09-03", status: "skipped" },
      ],
    });
    const day = result.find((d) => d.date === "2026-09-03");
    expect(day).toBeDefined();
    expect(day!.empty).toBe(false);
    expect(day!.unfinishedCount).toBe(2); // pending + stuck, not skipped
  });

  it("marks only the most recent empty day as the streak breaker", () => {
    const result = selectMissedDays({
      ...base,
      activeDates: ["2026-09-04", "2026-09-03"],
    });
    const breakers = result.filter((d) => d.brokeStreak).map((d) => d.date);
    expect(breakers).toEqual(["2026-09-02"]);
  });

  it("returns newest first", () => {
    const result = selectMissedDays(base);
    const dates = result.map((d) => d.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("honours the window bound", () => {
    const result = selectMissedDays({ ...base, windowDays: 3 });
    expect(result.every((d) => d.date >= "2026-09-04")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/missed-days.test.ts`
Expected: FAIL — cannot resolve `./missed-days`.

- [ ] **Step 3: Implement**

Create `src/lib/utils/missed-days.ts`:

```ts
import { addDaysToDate } from "./schedule-days";
import { isDayOff, type StreakOptions } from "./streak";

/**
 * How far back a grown-up's missed-day list reaches.
 *
 * Deliberately longer than the hero-facing catch-up window
 * (`MAKEUP_LOOKBACK_DAYS`, 7 days): a parent needs to see far enough back to
 * find the day that cost a streak, while a hero should never be handed a
 * month of backlog.
 */
export const MISSED_DAYS_WINDOW = 30;

/** Statuses that mean the work on that day is still owed. */
const UNFINISHED = new Set(["pending", "stuck"]);

export type MissedDay = {
  date: string;
  /** Assignments still owed on that day. */
  unfinishedCount: number;
  /** True when nothing at all was logged that day. */
  empty: boolean;
  /** True for the one day that terminates the current streak. */
  brokeStreak: boolean;
};

export type MissedDaysInput = StreakOptions & {
  today: string;
  windowDays?: number;
  activeDates: Iterable<string>;
  assignments: readonly { date: string; status: string }[];
};

/**
 * The days a grown-up may still want to do something about: required school
 * days, inside the window, that either logged nothing or left work owed.
 *
 * Day-off-ness is asked of `isDayOff` — the streak's own rule — so excusing a
 * day removes it from this list by the same act that repairs the streak.
 *
 * `brokeStreak` marks the newest empty day, which is by construction the date
 * where `computeStreak` stops counting.
 */
export function selectMissedDays(input: MissedDaysInput): MissedDay[] {
  const { today, windowDays = MISSED_DAYS_WINDOW, assignments } = input;
  const active = new Set(input.activeDates);

  const unfinishedByDate = new Map<string, number>();
  for (const a of assignments) {
    if (!UNFINISHED.has(a.status)) continue;
    unfinishedByDate.set(a.date, (unfinishedByDate.get(a.date) ?? 0) + 1);
  }

  const days: MissedDay[] = [];
  let breakerFound = false;

  for (let i = 1; i <= windowDays; i++) {
    const date = addDaysToDate(today, -i);
    if (isDayOff(date, input)) continue;

    const empty = !active.has(date);
    const unfinishedCount = unfinishedByDate.get(date) ?? 0;
    if (!empty && unfinishedCount === 0) continue;

    const brokeStreak = empty && !breakerFound;
    if (brokeStreak) breakerFound = true;

    days.push({ date, unfinishedCount, empty, brokeStreak });
  }

  return days;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/missed-days.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/missed-days.ts src/lib/utils/missed-days.test.ts
git commit -m "Add the missed-days selector"
```

---

### Task 4: Excused-day plumbing in the streak writers

**Files:**
- Modify: `src/lib/actions/activities.ts` (`updateStreakAndXp`)
- Modify: `src/lib/services/streaks.ts` (`recomputeFamilyStreaks`)
- Modify: `src/lib/db/backfill-streaks.ts`

**Interfaces:**
- Consumes: `schema.excusedDay` (Task 1), `excusedDates` option and `computeLongestStreak` (Task 2).
- Produces: all three streak writers honour excused days; `longest_streak` self-heals.

This task has no new unit tests — these are server-side DB wrappers, which this repo does not unit-test. Task 2's tests cover the maths; correctness here is verified by the full suite plus the manual check in Task 9.

- [ ] **Step 1: Wire `updateStreakAndXp`**

In `src/lib/actions/activities.ts`, add a fourth query to the existing `Promise.all` (after the `breaks` query), destructuring it as `excused`:

```ts
    // Days a grown-up excused after the fact: skipped, not streak-breaking.
    db
      .select({ date: schema.excusedDay.date })
      .from(schema.excusedDay)
      .where(
        and(
          eq(schema.excusedDay.childId, childId),
          gte(schema.excusedDay.date, formatDate(windowStart)),
        ),
      ),
```

Update the destructuring line to `const [activeDays, totalCount, childRow, breaks, excused] = await Promise.all([`.

Build the options once and reuse them:

```ts
  const dates = activeDays.map((row) => row.date);
  const options = {
    schoolDays: parseSchoolDays(childRow[0]?.schoolDays),
    optionalDays: parseStreakOptionalDays(childRow[0]?.streakOptionalDays),
    breaks,
    excusedDates: excused.map((e) => e.date),
  };

  const streak = computeStreak(dates, today, options);
```

- [ ] **Step 2: Fix the `longest_streak` ratchet in the same file**

Replace:

```ts
  const longestStreak = Math.max(streak, childRow[0]?.longestStreak ?? 0);
```

with:

```ts
  // Also recompute the longest run from history, not just ratchet from the
  // current one: records written before days off were understood are frozen
  // too low, and only a recompute recovers them. Still monotonic — a stored
  // value is never lowered.
  const longestStreak = Math.max(
    childRow[0]?.longestStreak ?? 0,
    streak,
    computeLongestStreak(dates, options)
  );
```

Update the import to `import { computeStreak, computeLongestStreak } from "@/lib/utils/streak";`.

- [ ] **Step 3: Wire `recomputeFamilyStreaks`**

In `src/lib/services/streaks.ts`, add a third query to the `Promise.all`, destructured as `excusedRows`:

```ts
    db
      .select({ childId: schema.excusedDay.childId, date: schema.excusedDay.date })
      .from(schema.excusedDay)
      .where(
        and(
          inArray(schema.excusedDay.childId, childIds),
          gte(schema.excusedDay.date, windowStartDate)
        )
      ),
```

Group them beside the existing `datesByChild` map:

```ts
  const excusedByChild = new Map<string, string[]>();
  for (const row of excusedRows) {
    const list = excusedByChild.get(row.childId);
    if (list) list.push(row.date);
    else excusedByChild.set(row.childId, [row.date]);
  }
```

and add `excusedDates: excusedByChild.get(child.id) ?? []` to the per-child `options` object.

- [ ] **Step 4: Wire the backfill script**

In `src/lib/db/backfill-streaks.ts`, add an `excused_day` read for the child alongside the existing breaks read and pass `excusedDates` into the `options` object it already builds. Follow the shape used in Step 1.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/activities.ts src/lib/services/streaks.ts src/lib/db/backfill-streaks.ts
git commit -m "Honour excused days in every streak writer and heal longest_streak"
```

---

### Task 5: Excused-day and move server actions

**Files:**
- Create: `src/lib/actions/excused-days.ts`
- Modify: `src/lib/actions/quest-assignments.ts` (export a status guard used by the card)

**Interfaces:**
- Consumes: `schema.excusedDay`, `schema.questAssignment.originalDate` (Task 1); `selectMissedDays`, `MISSED_DAYS_WINDOW` (Task 3); `recomputeFamilyStreaks` (Task 4).
- Produces:
  - `export type ExcuseReason = "sick" | "appointment" | "family" | "holiday" | "other"`
  - `export async function getMissedDaysView(childId: string, today: string): Promise<{ missed: MissedDay[]; excused: { date: string; reason: ExcuseReason; note: string | null }[]; canEdit: boolean }>`
  - `export async function excuseDay(childId: string, date: string, reason: ExcuseReason, note?: string, opts?: { applyToAll?: boolean }): Promise<void>`
  - `export async function unexcuseDay(childId: string, date: string): Promise<void>`
  - `export async function moveAssignmentsToDate(assignmentIds: string[], targetDate: string): Promise<void>`
  - `export async function moveDayToDate(childId: string, fromDate: string, targetDate: string): Promise<void>`
  - `export async function getWritableChildIds(familyId: string): Promise<string[]>`

Keep every function thin: validation that can be expressed purely belongs in `src/lib/utils/`. Mirror the `requireParent` helper already at the top of `src/lib/actions/makeup.ts`.

Behaviour each function must implement, per the spec:

- `excuseDay` — parent-only. Upsert on `(childId, date)`: an already-excused day updates `reason`/`note` rather than erroring. Set every assignment on that date whose status is `pending` or `stuck` to `excused`. Call `recomputeFamilyStreaks(familyId)`. With `applyToAll`, repeat for every hero returned by `getWritableChildIds` — never for heroes outside the actor's scope.
- `unexcuseDay` — parent-only. Delete the row, set that date's `excused` assignments back to `pending` (leaving `statusReason` intact), recompute.
- `moveAssignmentsToDate` — parent-only. Throw if `targetDate` is before today. Skip any assignment not `pending` or `stuck`. Set `date = targetDate` and `originalDate = COALESCE(original_date, date)` — never overwrite an existing `originalDate`. No streak recompute: moving planned work changes no activity history.
- `getMissedDaysView` — readable by any in-scope adult *and* by the hero (the page decides what to render); returns `canEdit` from `access.permission === "edit" && !isChildActor(access)`.

- [ ] **Step 1: Write the actions file**

Follow the file layout of `src/lib/actions/makeup.ts`: `"use server"` header, `requireParent` helper, then the exported functions in the order listed above. Reuse `ISO_DATE = /^\d{4}-\d{2}-\d{2}$/` for date validation and `sanitizeText` for the note.

Per the repo's `"use server"` rule, this file may export **only** async functions. Put `ExcuseReason` and the reason labels in `src/lib/utils/excused-days.ts` instead (see Step 2).

- [ ] **Step 2: Create the shared pure module**

Create `src/lib/utils/excused-days.ts`:

```ts
/** Why a grown-up excused a day. */
export const EXCUSE_REASONS = ["sick", "appointment", "family", "holiday", "other"] as const;
export type ExcuseReason = (typeof EXCUSE_REASONS)[number];

/** How each reason reads on screen. */
export const EXCUSE_REASON_LABELS: Record<ExcuseReason, string> = {
  sick: "Sick day",
  appointment: "Appointment",
  family: "Family day",
  holiday: "Holiday",
  other: "Other",
};

export function parseExcuseReason(raw: string | null | undefined): ExcuseReason {
  return EXCUSE_REASONS.includes(raw as ExcuseReason) ? (raw as ExcuseReason) : "other";
}
```

- [ ] **Step 3: Write the failing test for the pure module**

Create `src/lib/utils/excused-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseExcuseReason, EXCUSE_REASON_LABELS, EXCUSE_REASONS } from "./excused-days";

describe("parseExcuseReason", () => {
  it("accepts every known reason", () => {
    for (const r of EXCUSE_REASONS) expect(parseExcuseReason(r)).toBe(r);
  });

  it("falls back to other for anything unrecognized", () => {
    expect(parseExcuseReason("nonsense")).toBe("other");
    expect(parseExcuseReason(null)).toBe("other");
    expect(parseExcuseReason(undefined)).toBe("other");
  });

  it("has a label for every reason", () => {
    for (const r of EXCUSE_REASONS) expect(EXCUSE_REASON_LABELS[r]).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/utils/excused-days.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add src/lib/actions/excused-days.ts src/lib/utils/excused-days.ts src/lib/utils/excused-days.test.ts
git commit -m "Add excuse-day and move-work server actions"
```

---

### Task 6: The Missed Days panel

**Files:**
- Create: `src/components/missed-days.tsx`
- Test: `src/components/missed-days.test.tsx`

**Interfaces:**
- Consumes: `MissedDay` (Task 3); `EXCUSE_REASONS`, `EXCUSE_REASON_LABELS` (Task 5); the actions from Task 5.
- Produces:

```ts
export function MissedDays(props: {
  childId: string;
  childName: string;
  missed: MissedDay[];
  canEdit: boolean;
  /** Heroes this actor may write to. Drives the "apply to all" checkbox. */
  writableChildCount: number;
}): JSX.Element | null;
```

Returns `null` when `missed` is empty, so a family with nothing outstanding sees no empty panel.

Actor rules this component must satisfy (from the spec's actor matrix):
- Never rendered for a hero — the *caller* gates on `isChildView`, and the component additionally renders no action buttons when `canEdit` is false.
- `canEdit === false` (read-only guardian): rows render with their facts, no Excuse or Move controls.
- The "apply to all heroes" checkbox appears only when `writableChildCount > 1`.
- The row with `brokeStreak` is visually emphasised and labelled as the day the streak broke.

- [ ] **Step 1: Write the failing test**

Create `src/components/missed-days.test.tsx`, modelled on `src/components/makeup-quests.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MissedDays } from "./missed-days";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/excused-days", () => ({
  excuseDay: vi.fn(),
  unexcuseDay: vi.fn(),
  moveDayToDate: vi.fn(),
  moveAssignmentsToDate: vi.fn(),
}));

const missed = [
  { date: "2026-08-31", unfinishedCount: 9, empty: true, brokeStreak: true },
  { date: "2026-08-27", unfinishedCount: 2, empty: false, brokeStreak: false },
];

afterEach(cleanup);

describe("MissedDays", () => {
  it("renders nothing when there are no missed days", () => {
    const { container } = render(
      <MissedDays childId="c1" childName="Lily" missed={[]} canEdit writableChildCount={2} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the day that broke the streak", () => {
    render(<MissedDays childId="c1" childName="Lily" missed={missed} canEdit writableChildCount={2} />);
    expect(screen.getByText(/streak broke/i)).toBeInTheDocument();
  });

  it("offers excuse and move controls to an editing adult", () => {
    render(<MissedDays childId="c1" childName="Lily" missed={missed} canEdit writableChildCount={2} />);
    expect(screen.getAllByRole("button", { name: /excuse/i }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /move/i }).length).toBe(2);
  });

  it("shows the facts but no controls to a read-only guardian", () => {
    render(
      <MissedDays childId="c1" childName="Lily" missed={missed} canEdit={false} writableChildCount={2} />
    );
    expect(screen.getByText(/Aug 31|8\/31|2026-08-31/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excuse/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move/i })).toBeNull();
  });

  it("hides apply-to-all when the actor can write to only one hero", async () => {
    render(<MissedDays childId="c1" childName="Lily" missed={missed} canEdit writableChildCount={1} />);
    screen.getAllByRole("button", { name: /excuse/i })[0].click();
    expect(screen.queryByLabelText(/all heroes/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/missed-days.test.tsx`
Expected: FAIL — cannot resolve `./missed-days`.

- [ ] **Step 3: Implement the component**

Build it as a `"use client"` component using the existing `GameFrame`, `GameIcon`, `Button` primitives, matching the visual language of `src/components/makeup-quests.tsx`. Each row shows the weekday and date (use `formatMissedDate` from `src/lib/utils/makeup.ts` for the friendly label), the unfinished count, and — when `brokeStreak` — a line reading "Streak broke here". Excuse opens an inline form with a reason `<select>` built from `EXCUSE_REASONS`/`EXCUSE_REASON_LABELS`, an optional note field, and the apply-to-all checkbox gated on `writableChildCount > 1`. Move opens an inline `<input type="date">` defaulting to today, minimum today. Both call the Task 5 actions and then `router.refresh()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/missed-days.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add src/components/missed-days.tsx src/components/missed-days.test.tsx
git commit -m "Add the Missed Days panel"
```

---

### Task 7: Wire the panel into both tavern screens

**Files:**
- Modify: `src/app/(app)/tavern/page.tsx`
- Modify: `src/app/(app)/tavern/parent-dashboard.tsx`

**Interfaces:**
- Consumes: `getMissedDaysView`, `getWritableChildIds` (Task 5); `MissedDays` (Task 6).
- Produces: no new exports.

Recall the two screens: `ParentDashboard` renders only when a parent has selected no hero (`tavern/page.tsx` line ~82); the hero-selected view below it is what shows `currentStreak`.

- [ ] **Step 1: Add the panel to the hero-selected tavern view**

In `src/app/(app)/tavern/page.tsx`, add `getMissedDaysView(activeChild.id, today)` to the existing `Promise.all`. Render `<MissedDays />` directly beneath the streak block (around line 244), gated on `!isChildView`. A hero never sees it.

- [ ] **Step 2: Add the streak pointer**

In the same file, when `missed.find((d) => d.brokeStreak)` exists and `!isChildView`, render one line under the streak figure: `Streak broke on {formatMissedDate(date, today)} — excuse this day?`. It is copy, not a link — the panel is directly below it.

- [ ] **Step 3: Add the panel to the parent dashboard**

In `src/app/(app)/tavern/parent-dashboard.tsx`, add `getMissedDaysView(child.id, today)` to the existing per-child `Promise.all`, and render one `<MissedDays />` section per hero below the summary cards. `writableChildCount` comes from `getWritableChildIds(familyId).length`.

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/tavern/page.tsx" "src/app/(app)/tavern/parent-dashboard.tsx"
git commit -m "Show missed days on both tavern screens"
```

---

### Task 8: Render excused and moved work on quest cards

**Files:**
- Modify: `src/components/quest-assignment-card.tsx`
- Test: `src/components/quest-assignment-card.test.tsx`
- Test: `src/lib/utils/makeup.test.ts`

**Interfaces:**
- Consumes: `"excused"` status and `originalDate` (Task 1); `EXCUSE_REASON_LABELS` (Task 5).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/makeup.test.ts` — this pins the ripple effect the spec relies on:

```ts
it("never resurfaces excused work", () => {
  const rows = [
    { assignment: { id: "a", status: "excused", date: "2026-09-01" }, quest: { sortOrder: 0 } },
    { assignment: { id: "b", status: "pending", date: "2026-09-01" }, quest: { sortOrder: 1 } },
  ];
  const picked = selectMakeupAssignments(rows, "2026-09-03");
  expect(picked.map((r) => r.assignment.id)).toEqual(["b"]);
});
```

Append to `src/components/quest-assignment-card.test.tsx`, following the existing render helper in that file:

```tsx
it("shows an excused assignment as excused, with no undo for a hero", () => {
  renderCard({ status: "excused", statusReason: "Sick day" }, { isChildView: true });
  expect(screen.getByText(/excused/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
});

it("lets a grown-up undo an excused assignment", () => {
  renderCard({ status: "excused", statusReason: "Sick day" }, { isChildView: false });
  expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
});

it("says where moved work came from", () => {
  renderCard({ status: "pending", date: "2026-09-03", originalDate: "2026-08-31" }, {});
  expect(screen.getByText(/moved from/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/makeup.test.ts src/components/quest-assignment-card.test.tsx`
Expected: FAIL — the card renders no excused state and no moved-from line.

- [ ] **Step 3: Implement**

In `src/components/quest-assignment-card.tsx`:
- add `const isExcused = assignment.status === "excused";`
- render an excused badge with the reason alongside the existing skipped/stuck branches, worded neutrally for a hero ("Excused — sick day"), never as a failure
- for `!isChildView && isExcused`, add an "Undo" button calling `reviseAssignment(id, "pending")`
- when `assignment.originalDate` is set, render "moved from {formatMissedDate(originalDate, today)}"
- confirm `isOpen` stays `isPending || (isStuck && isMakeup)` — an excused assignment is not open for work

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/makeup.test.ts src/components/quest-assignment-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add src/components/quest-assignment-card.tsx src/components/quest-assignment-card.test.tsx src/lib/utils/makeup.test.ts
git commit -m "Render excused and moved work on quest cards"
```

---

### Task 9: Whole-app verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Full suite and typecheck**

Run: `npx vitest run`
Expected: all pass, including the new tests from Tasks 2, 3, 5, 6 and 8.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds. This catches `"use server"` export violations, which typecheck alone does not.

- [ ] **Step 3: Drive the real app**

REQUIRED SUB-SKILL: use the `run` skill to launch the app and exercise the flow. Seed local data with `npm run db:seed-demo` if needed. Walk all four actors:
1. Parent, no hero selected → dashboard shows Missed Days per hero
2. Parent, hero selected → streak pointer and panel appear; excuse a day; confirm the streak number rises immediately and the day leaves the list
3. Hero logged in as themselves → no panel, no accounting; excused work is gone from the catch-up list and reads neutrally
4. Move a day's work to a later date → it appears on that date with "moved from"

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found in whole-app verification"
```

---

### Task 10: Production repair — REQUIRES EXPLICIT APPROVAL

**Do not run any part of this task without the user explicitly approving each write.** These are writes to the live Turso database.

- [ ] **Step 1: Deploy order**

Migration `0022` must be applied to production **before** the new code is serving. Confirm with the user how they deploy, then apply.

- [ ] **Step 2: Heal `longest_streak`**

Run: `npm run db:backfill-streaks` against production (`--env-file=.env.prod`).
Expected: Lily 7 → 11, Lucas 6 → 10. The script only ever raises `longest_streak`.

- [ ] **Step 3: Excuse 2026-08-31 through the UI**

Not via a script. In the running app, excuse 2026-08-31 for both heroes with reason and the "apply to all heroes" checkbox. This exercises the real path and is the acceptance test for the whole feature.

Expected afterwards: Lily `current_streak` 11, Lucas 10; both heroes' Aug 31 assignments read `excused`; the day disappears from the Missed Days panel.

- [ ] **Step 4: Confirm with a read-only query**

Re-run the read-only diagnostic against production and confirm the stored streaks match the values Task 2's regression test predicts.

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — data model → 1; streak integration and the `longest_streak` fix → 2 and 4; missed-day selection → 3; server actions → 5; UI → 6 and 7; the actor matrix → 5 (`canEdit`, `getWritableChildIds`), 6 (tests) and 7 (`isChildView` gating); ripple effects → 8; production repair → 10.

**Deviation from the spec, deliberate:** the spec proposed `excused-days.test.ts` covering server actions. This repo has no server-action test harness and no such tests anywhere, so that would have meant inventing one. Instead the testable logic moved into `src/lib/utils/excused-days.ts` and `src/lib/utils/missed-days.ts`, which are unit-tested, and the actions stay thin. Actor enforcement is asserted at the component level in Task 6 and by `requireParent` in the actions. This is a smaller net for the actions than the spec implied — Task 9's four-actor walkthrough is what covers them.
