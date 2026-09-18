# Quest Log Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the parent's Quest Log a month calendar of a hero's logged work, where clicking a day excuses it and the streak repair is stated in plain numbers.

**Architecture:** No schema change. The grid is a pure function (`buildMonthGrid`) over data one server action fetches; marking a day calls the `excuseDay` / `unexcuseDay` actions that already exist on this branch, which already recompute streaks. The only backend changes are returning *detail* from that recompute so the UI can state the repair, and closing the one place excused days are still ignored (the realm-play school-day gate).

**Tech Stack:** Next.js App Router (server components + `"use server"` actions), Drizzle ORM on SQLite/Turso, React 19, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-17-quest-log-calendar-design.md`

## Global Constraints

- **Branch:** `quest-log-calendar`, branched from `excused-days` — **not** from `main`. The `excused_day` table and the `excuseDay` / `unexcuseDay` actions already exist here.
- **No migration.** If you find yourself writing one, stop — the design explicitly rejects a second mechanism for excused days.
- **`"use server"` files may only export async functions.** Types, constants and pure helpers go in `src/lib/utils/*`, never in an action file.
- **No test mocks `@/lib/db`.** Pure logic gets unit tests; query code is verified by typecheck and the browser pass. Do not introduce a db mock.
- **Dates are ISO `YYYY-MM-DD` strings** and compared as strings. Build `Date` objects with `Date.UTC(...)` so a machine west of UTC cannot shift a month boundary.
- **Parent-only.** The calendar tab is never rendered for a hero (`isChildView`), and `canEdit` is `access.permission === "edit" && !isChildActor(access)`.
- Verification commands: `npm run test`, `npm run typecheck`, `npm run lint`. Baseline at branch point: **446 tests passing across 33 files**.

---

### Task 1: The month grid, as a pure function

**Files:**
- Create: `src/lib/utils/work-calendar.ts`
- Test: `src/lib/utils/work-calendar.test.ts`

**Interfaces:**
- Consumes: `weekdayOfDate`, `DAYS_OF_WEEK` from `src/lib/utils/schedule-days.ts`; `EXCUSE_REASON_LABELS`, `ExcuseReason` from `src/lib/utils/excused-days.ts`
- Produces: `buildMonthGrid(input: MonthGridInput): MonthGrid`, `cellMarker(cell: DayCell): CellMarker`, `MAX_DOTS`, and the types `DayCell`, `MonthGrid`, `MonthGridInput`, `SubjectDot`, `CellMarker`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/work-calendar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMonthGrid, cellMarker, MAX_DOTS } from "./work-calendar";

const subjects = [
  { id: "math", name: "Math", color: "#3b82f6" },
  { id: "read", name: "Reading", color: "#ef4444" },
  { id: "sci", name: "Science", color: "#22c55e" },
  { id: "art", name: "Art", color: "#eab308" },
  { id: "hist", name: "History", color: null },
];

// September 2026 starts on a Tuesday. 2026-09-15 is a Tuesday.
const base = {
  month: "2026-09",
  today: "2026-09-15",
  activityDays: [],
  subjects,
  excusedDays: [],
  breaks: [],
  schoolDays: ["mon", "tue", "wed", "thu", "fri"],
  optionalDays: [],
};

function cellFor(grid: ReturnType<typeof buildMonthGrid>, date: string) {
  const cell = grid.cells.find((c) => c.date === date);
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

describe("buildMonthGrid", () => {
  it("labels the month and its neighbours", () => {
    const grid = buildMonthGrid(base);
    expect(grid.label).toBe("September 2026");
    expect(grid.previousMonth).toBe("2026-08");
    expect(grid.nextMonth).toBe("2026-10");
  });

  it("rolls the year over at the boundaries", () => {
    const grid = buildMonthGrid({ ...base, month: "2026-01", today: "2026-01-15" });
    expect(grid.previousMonth).toBe("2025-12");
    expect(grid.nextMonth).toBe("2026-02");
  });

  it("emits whole Monday-first weeks, padding outside the month", () => {
    const grid = buildMonthGrid(base);
    expect(grid.cells.length % 7).toBe(0);
    // Sep 1 2026 is a Tuesday, so the grid opens on Monday Aug 31.
    expect(grid.cells[0].date).toBe("2026-08-31");
    expect(grid.cells[0].inMonth).toBe(false);
    expect(cellFor(grid, "2026-09-01").inMonth).toBe(true);
  });

  it("gives a worked day one dot per subject, in subject colour", () => {
    const grid = buildMonthGrid({
      ...base,
      activityDays: [
        { date: "2026-09-14", subjectId: "math", count: 2, minutes: 40 },
        { date: "2026-09-14", subjectId: "read", count: 1, minutes: 20 },
      ],
    });
    const cell = cellFor(grid, "2026-09-14");
    expect(cell.dots).toEqual([
      { subjectId: "math", name: "Math", color: "#3b82f6" },
      { subjectId: "read", name: "Reading", color: "#ef4444" },
    ]);
    expect(cell.questCount).toBe(3);
    expect(cell.minutes).toBe(60);
    expect(cellMarker(cell)).toBe("none");
  });

  it("falls back to a grey dot when a subject has no colour", () => {
    const grid = buildMonthGrid({
      ...base,
      activityDays: [{ date: "2026-09-14", subjectId: "hist", count: 1, minutes: 30 }],
    });
    expect(cellFor(grid, "2026-09-14").dots[0].color).toBe("#6b7280");
  });

  it("caps the dots and counts the remainder", () => {
    const grid = buildMonthGrid({
      ...base,
      activityDays: subjects.map((s) => ({
        date: "2026-09-14",
        subjectId: s.id,
        count: 1,
        minutes: 10,
      })),
    });
    const cell = cellFor(grid, "2026-09-14");
    expect(cell.dots).toHaveLength(MAX_DOTS);
    expect(cell.extraDots).toBe(subjects.length - MAX_DOTS);
  });

  it("marks an expected school day with nothing logged as missed", () => {
    const grid = buildMonthGrid(base);
    expect(cellMarker(cellFor(grid, "2026-09-14"))).toBe("missed");
  });

  it("does not call a weekend or an optional day missed", () => {
    const grid = buildMonthGrid({ ...base, optionalDays: ["fri"] });
    expect(cellMarker(cellFor(grid, "2026-09-12"))).toBe("off"); // Saturday
    expect(cellMarker(cellFor(grid, "2026-09-11"))).toBe("off"); // optional Friday
  });

  it("never calls today or a future day missed", () => {
    const grid = buildMonthGrid(base);
    expect(cellMarker(cellFor(grid, "2026-09-15"))).toBe("none"); // today
    expect(cellFor(grid, "2026-09-16").isFuture).toBe(true);
    expect(cellMarker(cellFor(grid, "2026-09-16"))).toBe("none");
  });

  it("shows an excused day with its reason label", () => {
    const grid = buildMonthGrid({
      ...base,
      excusedDays: [{ date: "2026-09-08", reason: "sick", note: null }],
    });
    const cell = cellFor(grid, "2026-09-08");
    expect(cellMarker(cell)).toBe("excused");
    expect(cell.dayOff).toEqual({ kind: "excused", label: "Sick day" });
  });

  it("shows a break day with its name", () => {
    const grid = buildMonthGrid({
      ...base,
      breaks: [{ name: "Fall Break", startDate: "2026-09-09", endDate: "2026-09-10" }],
    });
    expect(cellFor(grid, "2026-09-10").dayOff).toEqual({
      kind: "holiday",
      label: "Fall Break",
    });
  });

  it("keeps the dots on a day that was both off and worked", () => {
    const grid = buildMonthGrid({
      ...base,
      excusedDays: [{ date: "2026-09-08", reason: "sick", note: null }],
      activityDays: [{ date: "2026-09-08", subjectId: "math", count: 1, minutes: 15 }],
    });
    const cell = cellFor(grid, "2026-09-08");
    expect(cell.dots).toHaveLength(1);
    expect(cellMarker(cell)).toBe("excused");
  });

  it("counts expected and logged days within the month only", () => {
    const grid = buildMonthGrid({
      ...base,
      // Aug 31 is padding: expected, empty, but not this month's business.
      activityDays: [
        { date: "2026-08-31", subjectId: "math", count: 1, minutes: 10 },
        { date: "2026-09-01", subjectId: "math", count: 1, minutes: 10 },
        { date: "2026-09-02", subjectId: "math", count: 1, minutes: 10 },
      ],
      excusedDays: [{ date: "2026-09-03", reason: "sick", note: null }],
    });
    // Sep 1..15 weekdays = 11; minus the excused Sep 3 = 10 expected so far.
    expect(grid.expectedDays).toBe(10);
    expect(grid.loggedDays).toBe(2);
  });

  it("flags today", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-09-15").isToday).toBe(true);
    expect(cellFor(grid, "2026-09-14").isToday).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/work-calendar.test.ts`
Expected: FAIL — `Failed to resolve import "./work-calendar"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/work-calendar.ts`:

```ts
import { DAYS_OF_WEEK, weekdayOfDate } from "./schedule-days";
import { EXCUSE_REASON_LABELS, type ExcuseReason } from "./excused-days";

/** Subject dots shown on one day before the grid gives up and counts the rest. */
export const MAX_DOTS = 4;

/** What a subject with no colour of its own is drawn in. Matches the quest log. */
const DEFAULT_DOT_COLOR = "#6b7280";

export type SubjectDot = { subjectId: string; name: string; color: string };

/** The glyph a cell shows beside (or instead of) its dots. */
export type CellMarker = "excused" | "holiday" | "missed" | "off" | "none";

export type DayCell = {
  date: string;
  dayOfMonth: number;
  /** False for the leading/trailing days that only exist to square off the weeks. */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /**
   * Set when the day is excused or inside a break — independently of whether
   * work was logged, because a hero who worked on a holiday keeps the credit
   * and the day is still off.
   */
  dayOff: { kind: "excused" | "holiday"; label: string } | null;
  /** A school weekday the hero was expected to log on: not optional, not off. */
  expected: boolean;
  dots: SubjectDot[];
  /** Subjects beyond `MAX_DOTS`, rendered as "+N". */
  extraDots: number;
  questCount: number;
  minutes: number;
};

export type MonthGridInput = {
  /** "YYYY-MM". */
  month: string;
  /** Today, ISO — the boundary past which nothing can be missed. */
  today: string;
  activityDays: readonly { date: string; subjectId: string; count: number; minutes: number }[];
  subjects: readonly { id: string; name: string; color: string | null }[];
  excusedDays: readonly { date: string; reason: ExcuseReason; note: string | null }[];
  breaks: readonly { name: string; startDate: string; endDate: string }[];
  schoolDays: readonly string[];
  optionalDays: readonly string[];
};

export type MonthGrid = {
  month: string;
  /** "September 2026". */
  label: string;
  previousMonth: string;
  nextMonth: string;
  /** Always whole Monday-first weeks. */
  cells: DayCell[];
  /** School days this month up to today, excluding days off. */
  expectedDays: number;
  /** How many of those carry logged work. */
  loggedDays: number;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseMonth(month: string): { year: number; monthIndex: number } {
  const [year, m] = month.split("-").map(Number);
  return { year, monthIndex: m - 1 };
}

function isoOf(year: number, monthIndex: number, day: number): string {
  // UTC throughout: a machine west of UTC must not shift a month boundary.
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().split("T")[0];
}

function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = parseMonth(month);
  const d = new Date(Date.UTC(year, monthIndex + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The glyph for a cell. A day off shows its own marker even when work was
 * logged — the dots are drawn alongside, not instead.
 */
export function cellMarker(cell: DayCell): CellMarker {
  if (cell.isFuture) return "none";
  if (cell.dayOff) return cell.dayOff.kind;
  if (cell.dots.length > 0) return "none";
  // Today is allowed to be empty — the day is not over, and `computeStreak`
  // measures from yesterday for exactly this reason. Calling it missed would
  // scold a parent at breakfast.
  if (cell.isToday) return "none";
  return cell.expected ? "missed" : "off";
}

/**
 * One month of a hero's work, as cells ready to render.
 *
 * Pure: everything it needs is passed in, so every rendering rule — what counts
 * as missed, what a day off looks like when it was also worked, where the dots
 * stop — is a unit test rather than a DOM assertion.
 */
export function buildMonthGrid(input: MonthGridInput): MonthGrid {
  const { year, monthIndex } = parseMonth(input.month);
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const schoolDaySet = input.schoolDays.length ? new Set(input.schoolDays) : null;
  const optionalDaySet = new Set(input.optionalDays);
  const excusedByDate = new Map(input.excusedDays.map((e) => [e.date, e]));

  const byDate = new Map<string, { dots: SubjectDot[]; questCount: number; minutes: number }>();
  for (const row of input.activityDays) {
    const entry = byDate.get(row.date) ?? { dots: [], questCount: 0, minutes: 0 };
    const subject = subjectById.get(row.subjectId);
    entry.dots.push({
      subjectId: row.subjectId,
      name: subject?.name ?? "Unknown",
      color: subject?.color ?? DEFAULT_DOT_COLOR,
    });
    entry.questCount += row.count;
    entry.minutes += row.minutes;
    byDate.set(row.date, entry);
  }

  const firstOfMonth = isoOf(year, monthIndex, 1);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const lastOfMonth = isoOf(year, monthIndex, daysInMonth);

  // Square the grid off to whole Monday-first weeks.
  const leading = DAYS_OF_WEEK.indexOf(weekdayOfDate(firstOfMonth));
  const trailing = 6 - DAYS_OF_WEEK.indexOf(weekdayOfDate(lastOfMonth));

  const cells: DayCell[] = [];
  let expectedDays = 0;
  let loggedDays = 0;

  for (let offset = -leading; offset < daysInMonth + trailing; offset++) {
    const date = isoOf(year, monthIndex, offset + 1);
    const weekday = weekdayOfDate(date);
    const work = byDate.get(date);
    const excused = excusedByDate.get(date);
    const holiday = input.breaks.find((b) => date >= b.startDate && date <= b.endDate);

    const dayOff: DayCell["dayOff"] = excused
      ? { kind: "excused", label: EXCUSE_REASON_LABELS[excused.reason] }
      : holiday
        ? { kind: "holiday", label: holiday.name }
        : null;

    const isSchoolWeekday = !schoolDaySet || schoolDaySet.has(weekday);
    const expected = isSchoolWeekday && !optionalDaySet.has(weekday) && !dayOff;
    const inMonth = date >= firstOfMonth && date <= lastOfMonth;

    const dots = work?.dots ?? [];
    cells.push({
      date,
      dayOfMonth: Number(date.slice(8)),
      inMonth,
      isToday: date === input.today,
      isFuture: date > input.today,
      dayOff,
      expected,
      dots: dots.slice(0, MAX_DOTS),
      extraDots: Math.max(0, dots.length - MAX_DOTS),
      questCount: work?.questCount ?? 0,
      minutes: work?.minutes ?? 0,
    });

    // The footer speaks about this month only, and only about days that have
    // already happened — a month still in progress is not "3 of 21".
    if (inMonth && expected && date <= input.today) {
      expectedDays++;
      if (dots.length > 0) loggedDays++;
    }
  }

  return {
    month: input.month,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    previousMonth: shiftMonth(input.month, -1),
    nextMonth: shiftMonth(input.month, 1),
    cells,
    expectedDays,
    loggedDays,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/work-calendar.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/work-calendar.ts src/lib/utils/work-calendar.test.ts
git commit -m "Build the month grid as a pure function"
```

---

### Task 2: Say what the streak repair did

`excuseDay` and `unexcuseDay` already recompute streaks; they just throw the answer away. This task carries the before/after out to the caller and turns it into a sentence.

**Files:**
- Create: `src/lib/utils/streak-change.ts`
- Create: `src/lib/utils/streak-change.test.ts`
- Modify: `src/lib/services/streaks.ts` (`recomputeFamilyStreaks` return type, ~line 37 and ~line 140)
- Modify: `src/lib/actions/excused-days.ts` (`excuseDay` ~line 189, `unexcuseDay` ~line 250)

**Interfaces:**
- Produces: `type StreakChange`, `describeStreakChange(change, childName)`; `recomputeFamilyStreaks(familyId, today?): Promise<StreakChange[]>`; `excuseDay(...): Promise<StreakChange[]>`; `unexcuseDay(...): Promise<StreakChange[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/streak-change.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeStreakChange, type StreakChange } from "./streak-change";

const change = (over: Partial<StreakChange> = {}): StreakChange => ({
  childId: "c1",
  previousStreak: 6,
  currentStreak: 21,
  previousLongest: 14,
  longestStreak: 21,
  ...over,
});

describe("describeStreakChange", () => {
  it("states a repair in plain numbers", () => {
    expect(describeStreakChange(change({ previousLongest: 30, longestStreak: 30 }), "Aria")).toBe(
      "Aria's streak went from 6 to 21 days."
    );
  });

  it("calls out a new record", () => {
    expect(describeStreakChange(change(), "Aria")).toBe(
      "Aria's streak went from 6 to 21 days. That's a new record."
    );
  });

  it("reports a drop just as plainly", () => {
    expect(
      describeStreakChange(
        change({ previousStreak: 21, currentStreak: 6, previousLongest: 21, longestStreak: 21 }),
        "Aria"
      )
    ).toBe("Aria's streak went from 21 down to 6 days.");
  });

  it("says nothing changed rather than claiming a repair", () => {
    expect(
      describeStreakChange(
        change({ previousStreak: 6, currentStreak: 6, previousLongest: 14, longestStreak: 14 }),
        "Aria"
      )
    ).toBe("No change to the streak.");
  });

  it("says nothing changed when the hero is absent from the result", () => {
    expect(describeStreakChange(undefined, "Aria")).toBe("No change to the streak.");
  });

  it("counts one day as a day", () => {
    expect(
      describeStreakChange(
        change({ previousStreak: 0, currentStreak: 1, previousLongest: 5, longestStreak: 5 }),
        "Bram"
      )
    ).toBe("Bram's streak went from 0 to 1 day.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/streak-change.test.ts`
Expected: FAIL — `Failed to resolve import "./streak-change"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/streak-change.ts`:

```ts
/**
 * What one recompute did to one hero's stored streak.
 *
 * Kept as a type of its own, in a plain module, because both the streak
 * service and the client components that report a repair need it — and a
 * `"use server"` file may only export async functions.
 */
export type StreakChange = {
  childId: string;
  previousStreak: number;
  currentStreak: number;
  previousLongest: number;
  longestStreak: number;
};

function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * The one line a parent reads after marking a day.
 *
 * This is the whole proof that excusing a day did anything: without it the
 * repair happens silently in a column nobody is looking at. A drop is reported
 * as plainly as a gain — un-excusing a day can shorten a streak, and hiding
 * that would be a lie of omission.
 */
export function describeStreakChange(
  change: StreakChange | undefined,
  childName: string
): string {
  if (!change || change.currentStreak === change.previousStreak) {
    return "No change to the streak.";
  }

  const direction = change.currentStreak > change.previousStreak ? "to" : "down to";
  const sentence = `${childName}'s streak went from ${change.previousStreak} ${direction} ${days(change.currentStreak)}.`;

  return change.longestStreak > change.previousLongest
    ? `${sentence} That's a new record.`
    : sentence;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/streak-change.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Carry the detail out of the recompute**

In `src/lib/services/streaks.ts`, import the type and change the signature and the loop. Replace the `Promise<number>` return type:

```ts
import type { StreakChange } from "@/lib/utils/streak-change";
```

Change the function signature (currently `): Promise<number> {`) to:

```ts
): Promise<StreakChange[]> {
```

Replace `if (children.length === 0) return 0;` with:

```ts
  if (children.length === 0) return [];
```

Replace the `let changed = 0;` declaration with:

```ts
  const changes: StreakChange[] = [];
```

Replace the write block at the end of the per-child loop (the `await db.update(...)` and `changed++`) with:

```ts
    await db
      .update(schema.child)
      .set({ currentStreak, longestStreak, updatedAt: new Date() })
      .where(eq(schema.child.id, child.id));
    changes.push({
      childId: child.id,
      previousStreak: child.currentStreak,
      currentStreak,
      previousLongest: child.longestStreak,
      longestStreak,
    });
```

and `return changed;` with:

```ts
  return changes;
```

Update the docblock's closing line — it currently says it returns the number of heroes whose streak moved:

```ts
 * Returns one entry per hero whose stored streak actually moved, carrying the
 * before and after, so a caller can tell a parent what marking a day just did.
 * `.length` is the count this used to return.
 */
```

- [ ] **Step 6: Return it from the two actions**

In `src/lib/actions/excused-days.ts`, import the type:

```ts
import type { StreakChange } from "@/lib/utils/streak-change";
```

Change `excuseDay`'s return type from `Promise<void>` to `Promise<StreakChange[]>` and its final line from `await recomputeFamilyStreaks(familyId);` to:

```ts
  return recomputeFamilyStreaks(familyId);
```

Do the same for `unexcuseDay`: return type `Promise<StreakChange[]>`, final line `return recomputeFamilyStreaks(familyId);`.

- [ ] **Step 7: Verify nothing that ignored the old return value broke**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; 446 + 20 = **466 tests passing**. If typecheck flags a caller that used the number arithmetically, change it to `.length` — do not revert the return type.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/streak-change.ts src/lib/utils/streak-change.test.ts src/lib/services/streaks.ts src/lib/actions/excused-days.ts
git commit -m "Report what excusing a day did to the streak"
```

---

### Task 3: Honour excused days in the Realm's school-day gate

`isSchoolDay` in `realm-play.ts` consults `school_break` only, so a hero excused for being sick is still held to the school-day realm gate. This is the last place excused days are ignored.

**Files:**
- Create: `src/lib/utils/school-day.ts`
- Create: `src/lib/utils/school-day.test.ts`
- Modify: `src/lib/actions/realm-play.ts:25-43` (the `isSchoolDay` helper)

**Interfaces:**
- Produces: `isSchoolDayFor(input): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/school-day.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSchoolDayFor } from "./school-day";

// 2026-09-14 is a Monday, 2026-09-12 a Saturday.
const base = {
  schoolDays: ["mon", "tue", "wed", "thu", "fri"],
  breaks: [],
  excusedDates: [],
};

describe("isSchoolDayFor", () => {
  it("is true for a listed weekday with nothing in the way", () => {
    expect(isSchoolDayFor({ ...base, date: "2026-09-14" })).toBe(true);
  });

  it("is false for a weekday the hero does not school on", () => {
    expect(isSchoolDayFor({ ...base, date: "2026-09-12" })).toBe(false);
  });

  it("is false inside a family break", () => {
    expect(
      isSchoolDayFor({
        ...base,
        date: "2026-09-14",
        breaks: [{ startDate: "2026-09-14", endDate: "2026-09-18" }],
      })
    ).toBe(false);
  });

  it("is false on a day excused for this hero", () => {
    expect(
      isSchoolDayFor({ ...base, date: "2026-09-14", excusedDates: ["2026-09-14"] })
    ).toBe(false);
  });

  it("agrees with the streak rules: an excused school day is a day off", () => {
    // The streak treats an excused date as a day off; the realm gate must not
    // still call it a school day, or a sick hero is locked out of the Realm on
    // the very day a grown-up said did not count.
    const date = "2026-09-14";
    expect(isSchoolDayFor({ ...base, date, excusedDates: [date] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/school-day.test.ts`
Expected: FAIL — `Failed to resolve import "./school-day"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/school-day.ts`:

```ts
import { weekdayOfDate } from "./schedule-days";

/**
 * Is this a school day for this hero?
 *
 * The Realm's access gate asks this to decide whether school-hours rules
 * apply. It has to agree with the streak's notion of a day off, or a hero
 * excused for being sick is locked out of the Realm on the very day a grown-up
 * said did not count.
 *
 * Deliberately *not* checking optional weekdays: an optional day is one where
 * nothing needs logging, not one where school is closed, and the Realm's
 * school-hours rules still apply on it. That matches the behaviour this
 * replaces.
 */
export function isSchoolDayFor(input: {
  date: string;
  schoolDays: readonly string[];
  breaks: readonly { startDate: string; endDate: string }[];
  excusedDates: readonly string[];
}): boolean {
  if (!input.schoolDays.includes(weekdayOfDate(input.date))) return false;
  if (input.excusedDates.includes(input.date)) return false;
  return !input.breaks.some((b) => input.date >= b.startDate && input.date <= b.endDate);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/school-day.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in the realm-play gate**

In `src/lib/actions/realm-play.ts`, add to the imports:

```ts
import { isSchoolDayFor } from "@/lib/utils/school-day";
```

Replace the whole `isSchoolDay` helper (currently lines 25-43, the docblock and function) with:

```ts
/** Is `date` a school day for this hero: a listed weekday, not inside a Long Rest, not excused. */
async function isSchoolDay(childId: string, familyId: string, date: string): Promise<boolean> {
  const [child, breaks, excused] = await Promise.all([
    db
      .select({ schoolDays: schema.child.schoolDays })
      .from(schema.child)
      .where(eq(schema.child.id, childId))
      .limit(1),
    db
      .select({ startDate: schema.schoolBreak.startDate, endDate: schema.schoolBreak.endDate })
      .from(schema.schoolBreak)
      .where(
        and(
          eq(schema.schoolBreak.familyId, familyId),
          lte(schema.schoolBreak.startDate, date),
          gte(schema.schoolBreak.endDate, date)
        )
      ),
    db
      .select({ date: schema.excusedDay.date })
      .from(schema.excusedDay)
      .where(and(eq(schema.excusedDay.childId, childId), eq(schema.excusedDay.date, date)))
      .limit(1),
  ]);

  return isSchoolDayFor({
    date,
    schoolDays: parseSchoolDays(child[0]?.schoolDays),
    breaks,
    excusedDates: excused.map((e) => e.date),
  });
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; **471 tests passing**. If `weekdayOfDate` is now an unused import in `realm-play.ts`, leave it — it is still used by `getRealmAccess`. If lint says otherwise, remove it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/school-day.ts src/lib/utils/school-day.test.ts src/lib/actions/realm-play.ts
git commit -m "Let an excused day be a day off in the Realm too"
```

---

### Task 4: The data the calendar reads

Two queries. Neither is unit-testable under this repo's no-db-mock convention; they are verified by typecheck here and by the browser pass in Task 7.

**Files:**
- Modify: `src/lib/actions/activities.ts` (add an export beside `getActivityStats`, ~line 38)
- Create: `src/lib/actions/calendar.ts`

**Interfaces:**
- Consumes: `requireChildAccess`, `isChildActor` from `@/lib/auth/access`; `getWritableChildIds` from `@/lib/actions/excused-days`; `MonthGridInput` from Task 1
- Produces: `getActivityDaysInRange(childId, startDate, endDate)`; `getCalendarMonth(childId, month, today): Promise<CalendarMonth>`

- [ ] **Step 1: Add the month-scale activity read**

In `src/lib/actions/activities.ts`, add after `getActivityStats`:

```ts
/**
 * One row per day per subject over a date range — what the calendar grid draws.
 *
 * `getRecentActivities` cannot back a month: it takes a row limit, and a busy
 * fortnight exhausts fifty rows before the month is covered.
 */
export async function getActivityDaysInRange(
  childId: string,
  startDate: string,
  endDate: string
) {
  await requireChildAccess(childId);
  return db
    .select({
      date: schema.activityLog.date,
      subjectId: schema.activityLog.subjectId,
      count: sql<number>`count(*)`,
      minutes: sql<number>`coalesce(sum(${schema.activityLog.durationMinutes}), 0)`,
    })
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.childId, childId),
        gte(schema.activityLog.date, startDate),
        lte(schema.activityLog.date, endDate)
      )
    )
    .groupBy(schema.activityLog.date, schema.activityLog.subjectId);
}
```

- [ ] **Step 2: Write the one read the page calls**

Create `src/lib/actions/calendar.ts`:

```ts
"use server";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { getActivityDaysInRange } from "@/lib/actions/activities";
import { getSubjects } from "@/lib/actions/subjects";
import { getWritableChildIds } from "@/lib/actions/excused-days";
import { parseSchoolDays, parseStreakOptionalDays } from "@/lib/utils/schedule-days";
import { monthBounds } from "@/lib/utils/work-calendar";

/**
 * Everything one month of the calendar needs, in one authorized call.
 *
 * Deliberately a data bag rather than a rendered grid: `buildMonthGrid` is
 * pure and cheap, so the component can rebuild it as the parent navigates
 * without another round trip, and the component stays testable with plain
 * props.
 */
export async function getCalendarMonth(childId: string, month: string, today: string) {
  const { access } = await requireChildAccess(childId);
  const { firstDate, lastDate } = monthBounds(month);

  const [childRow, activityDays, subjects, excusedDays, breaks, writableChildIds] =
    await Promise.all([
      db
        .select({
          displayName: schema.child.displayName,
          schoolDays: schema.child.schoolDays,
          streakOptionalDays: schema.child.streakOptionalDays,
          currentStreak: schema.child.currentStreak,
          familyId: schema.child.familyId,
        })
        .from(schema.child)
        .where(eq(schema.child.id, childId))
        .limit(1),
      getActivityDaysInRange(childId, firstDate, lastDate),
      getSubjects(childId),
      db
        .select({
          date: schema.excusedDay.date,
          reason: schema.excusedDay.reason,
          note: schema.excusedDay.note,
        })
        .from(schema.excusedDay)
        .where(
          and(
            eq(schema.excusedDay.childId, childId),
            gte(schema.excusedDay.date, firstDate),
            lte(schema.excusedDay.date, lastDate)
          )
        )
        .orderBy(asc(schema.excusedDay.date)),
      db
        .select({
          name: schema.schoolBreak.name,
          startDate: schema.schoolBreak.startDate,
          endDate: schema.schoolBreak.endDate,
        })
        .from(schema.schoolBreak)
        .where(
          and(
            eq(schema.schoolBreak.familyId, (await currentFamilyId(childId)) ?? ""),
            lte(schema.schoolBreak.startDate, lastDate),
            gte(schema.schoolBreak.endDate, firstDate)
          )
        ),
      getWritableChildIds(childId),
    ]);

  return {
    month,
    today,
    childName: childRow[0]?.displayName ?? "",
    currentStreak: childRow[0]?.currentStreak ?? 0,
    activityDays,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    excusedDays,
    breaks,
    schoolDays: parseSchoolDays(childRow[0]?.schoolDays),
    optionalDays: parseStreakOptionalDays(childRow[0]?.streakOptionalDays),
    // A hero sees the month; only an editing grown-up gets the controls.
    canEdit: access.permission === "edit" && !isChildActor(access),
    writableChildCount: writableChildIds.length,
  };
}

/** The family a hero belongs to — needed before the breaks read can be scoped. */
async function currentFamilyId(childId: string): Promise<string | null> {
  const rows = await db
    .select({ familyId: schema.child.familyId })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  return rows[0]?.familyId ?? null;
}
```

**Note for the implementer:** `"use server"` files may export only async functions — `currentFamilyId` is async, so it is legal, but if lint objects, move it into the `Promise.all` by resolving `familyId` from `requireChildAccess` first (it returns `{ access, familyId }`) and drop the helper. That is the tidier shape; prefer it if the types line up:

```ts
const { access, familyId } = await requireChildAccess(childId);
```
then use `eq(schema.schoolBreak.familyId, familyId)` directly and delete `currentFamilyId`.

- [ ] **Step 3: Add the month-bounds helper Task 1 did not need**

In `src/lib/utils/work-calendar.ts`, add beside the other exports:

```ts
/** The first and last ISO date of a "YYYY-MM" month. */
export function monthBounds(month: string): { firstDate: string; lastDate: string } {
  const { year, monthIndex } = parseMonth(month);
  return {
    firstDate: isoOf(year, monthIndex, 1),
    lastDate: isoOf(year, monthIndex, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()),
  };
}
```

Add to `src/lib/utils/work-calendar.test.ts`:

```ts
import { monthBounds } from "./work-calendar";

describe("monthBounds", () => {
  it("covers the whole month", () => {
    expect(monthBounds("2026-09")).toEqual({
      firstDate: "2026-09-01",
      lastDate: "2026-09-30",
    });
  });

  it("handles February in a leap year", () => {
    expect(monthBounds("2028-02")).toEqual({
      firstDate: "2028-02-01",
      lastDate: "2028-02-29",
    });
  });
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/utils/work-calendar.test.ts && npm run typecheck`
Expected: PASS, 16 tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/activities.ts src/lib/actions/calendar.ts src/lib/utils/work-calendar.ts src/lib/utils/work-calendar.test.ts
git commit -m "Read a month of work in one call"
```

---

### Task 5: The grid

The calendar with no controls yet: cells, dots, markers, month navigation, footer. Task 6 adds the panel.

**Files:**
- Create: `src/components/work-calendar.tsx`
- Create: `src/components/work-calendar.test.tsx`

**Interfaces:**
- Consumes: `buildMonthGrid`, `cellMarker`, `DayCell` (Task 1); `useBrowserToday` from `@/hooks/use-browser-today`; `GameFrame`, `GameIcon`
- Produces: `<WorkCalendar {...CalendarMonthProps} />`, where the props are exactly the shape `getCalendarMonth` returns plus `childId` and `month`

- [ ] **Step 1: Write the failing test**

Create `src/components/work-calendar.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WorkCalendar } from "./work-calendar";

// `useSearchParams` is what builds the month links — without it in the mock the
// component throws before rendering a single cell.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("child=c1"),
}));
// Fully replaced, never partially: the real module is `"use server"` and pulls
// in `db`. The reason labels the panel renders come from `@/lib/utils/excused-days`,
// which is pure and stays real.
vi.mock("@/lib/actions/excused-days", () => ({
  excuseDay: vi.fn(),
  unexcuseDay: vi.fn(),
}));

const props = {
  childId: "c1",
  childName: "Aria",
  month: "2026-09",
  today: "2026-09-15",
  currentStreak: 14,
  activityDays: [
    { date: "2026-09-01", subjectId: "math", count: 1, minutes: 30 },
    { date: "2026-09-02", subjectId: "math", count: 1, minutes: 30 },
    { date: "2026-09-02", subjectId: "read", count: 1, minutes: 20 },
  ],
  subjects: [
    { id: "math", name: "Math", color: "#3b82f6" },
    { id: "read", name: "Reading", color: "#ef4444" },
  ],
  excusedDays: [{ date: "2026-09-08", reason: "sick" as const, note: null }],
  breaks: [{ name: "Fall Break", startDate: "2026-09-10", endDate: "2026-09-10" }],
  schoolDays: ["mon", "tue", "wed", "thu", "fri"],
  optionalDays: [],
  canEdit: true,
  writableChildCount: 2,
};

afterEach(cleanup);

describe("WorkCalendar", () => {
  it("names the month and offers navigation", () => {
    render(<WorkCalendar {...props} />);
    expect(screen.getByText("September 2026")).toBeTruthy();
    expect(screen.getByLabelText("Previous month").getAttribute("href")).toContain("month=2026-08");
    expect(screen.getByLabelText("Next month").getAttribute("href")).toContain("month=2026-10");
  });

  it("describes a worked day, its subjects and its count", () => {
    render(<WorkCalendar {...props} />);
    const day = screen.getByRole("button", { name: /September 2, 2026/ });
    expect(day.getAttribute("aria-label")).toContain("2 quests");
    expect(day.getAttribute("aria-label")).toContain("Math");
    expect(day.getAttribute("aria-label")).toContain("Reading");
  });

  it("names an excused day and a holiday in the cell label", () => {
    render(<WorkCalendar {...props} />);
    expect(
      screen.getByRole("button", { name: /September 8, 2026/ }).getAttribute("aria-label")
    ).toContain("Sick day");
    expect(
      screen.getByRole("button", { name: /September 10, 2026/ }).getAttribute("aria-label")
    ).toContain("Fall Break");
  });

  it("calls an empty school day missed, and says so without relying on the glyph", () => {
    render(<WorkCalendar {...props} />);
    expect(
      screen.getByRole("button", { name: /September 3, 2026/ }).getAttribute("aria-label")
    ).toContain("nothing logged");
  });

  it("does not call a future day missed", () => {
    render(<WorkCalendar {...props} />);
    const future = screen.getByRole("button", { name: /September 16, 2026/ });
    expect(future.getAttribute("aria-label")).not.toContain("nothing logged");
  });

  it("summarises the month against the streak", () => {
    render(<WorkCalendar {...props} />);
    expect(screen.getByText(/14 day streak/)).toBeTruthy();
    expect(screen.getByText(/2 of 9 school days/)).toBeTruthy();
  });

  it("shows the grid but no controls to a read-only viewer", () => {
    render(<WorkCalendar {...props} canEdit={false} />);
    expect(screen.getByText("September 2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /September 3, 2026/ })).toBeNull();
  });
});
```

**Note:** the `2 of 9 school days` figure is Sep 1–15 weekdays (11) minus the excused Sep 8 and the Sep 10 break = 9 expected, of which Sep 1 and Sep 2 carry work. If your `buildMonthGrid` disagrees, the grid is wrong, not the test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/work-calendar.test.tsx`
Expected: FAIL — `Failed to resolve import "./work-calendar"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/work-calendar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { useBrowserToday } from "@/hooks/use-browser-today";
import { buildMonthGrid, cellMarker, type CellMarker, type DayCell } from "@/lib/utils/work-calendar";
import type { ExcuseReason } from "@/lib/utils/excused-days";

const WEEKDAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

const MARKER_GLYPH: Record<CellMarker, string> = {
  excused: "○",
  holiday: "☘",
  missed: "✖",
  off: "·",
  none: "",
};

export type WorkCalendarProps = {
  childId: string;
  childName: string;
  month: string;
  today: string;
  currentStreak: number;
  activityDays: readonly { date: string; subjectId: string; count: number; minutes: number }[];
  subjects: readonly { id: string; name: string; color: string | null }[];
  excusedDays: readonly { date: string; reason: ExcuseReason; note: string | null }[];
  breaks: readonly { name: string; startDate: string; endDate: string }[];
  schoolDays: readonly string[];
  optionalDays: readonly string[];
  canEdit: boolean;
  writableChildCount: number;
};

/**
 * A month of a hero's work, for the grown-ups.
 *
 * The grid answers "how has this month actually gone" in one glance — which is
 * the question the quest list, being a reverse-chronological feed, cannot
 * answer. Every day is a button so the same view that shows a gap is the view
 * that lets a parent account for it.
 */
export function WorkCalendar(props: WorkCalendarProps) {
  const { date: today } = useBrowserToday(props.today, "");
  const [selected, setSelected] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const grid = buildMonthGrid({
    month: props.month,
    today,
    activityDays: props.activityDays,
    subjects: props.subjects,
    excusedDays: props.excusedDays,
    breaks: props.breaks,
    schoolDays: props.schoolDays,
    optionalDays: props.optionalDays,
  });

  function monthHref(month: string): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", "calendar");
    params.set("month", month);
    return `/quests?${params.toString()}`;
  }

  const selectedCell = grid.cells.find((c) => c.date === selected) ?? null;

  return (
    <GameFrame
      title="Calendar"
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
    >
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={monthHref(grid.previousMonth)}
          aria-label="Previous month"
          className="px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          ‹
        </Link>
        <h3 className="text-sm font-bold" style={{ color: "var(--gold-bright)" }}>
          {grid.label}
        </h3>
        <Link
          href={monthHref(grid.nextMonth)}
          aria-label="Next month"
          className="px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          ›
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADS.map((d, i) => (
          <div key={i} className="pb-1 text-center text-xs text-muted-foreground">
            {d}
          </div>
        ))}
        {grid.cells.map((cell) => (
          <DayButton
            key={cell.date}
            cell={cell}
            canEdit={props.canEdit}
            onSelect={() => setSelected(cell.date)}
            isSelected={cell.date === selected}
          />
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        <span style={{ color: "var(--streak)" }}>🔥 {props.currentStreak} day streak</span>
        {" · "}
        {grid.loggedDays} of {grid.expectedDays} school days
      </p>

      {selectedCell && <DayPanelPlaceholder cell={selectedCell} />}
    </GameFrame>
  );
}

/** Replaced in Task 6 by the real detail panel. */
function DayPanelPlaceholder({ cell }: { cell: DayCell }) {
  return <p className="mt-3 text-xs text-muted-foreground">{cell.date}</p>;
}

function DayButton({
  cell,
  canEdit,
  onSelect,
  isSelected,
}: {
  cell: DayCell;
  canEdit: boolean;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const marker = cellMarker(cell);
  const label = describeCell(cell, marker);

  const body = (
    <>
      <span className={cell.inMonth ? "" : "opacity-30"}>{cell.dayOfMonth}</span>
      <span className="mt-0.5 flex h-2 items-center justify-center gap-0.5">
        {cell.dots.map((dot, i) => (
          <span
            key={`${dot.subjectId}-${i}`}
            className="quest-dot size-1.5 rounded-full"
            style={{ backgroundColor: dot.color }}
          />
        ))}
        {cell.extraDots > 0 && (
          <span className="text-[9px] text-muted-foreground">+{cell.extraDots}</span>
        )}
        {cell.dots.length === 0 && MARKER_GLYPH[marker] && (
          <span className="text-[10px] text-muted-foreground">{MARKER_GLYPH[marker]}</span>
        )}
        {cell.dots.length > 0 && cell.dayOff && (
          <span className="text-[10px] text-muted-foreground">{MARKER_GLYPH[marker]}</span>
        )}
      </span>
    </>
  );

  const className = [
    "flex flex-col items-center rounded-md p-1 text-xs",
    cell.isToday ? "ring-1 ring-[var(--gold-bright)]" : "",
    isSelected ? "bg-muted" : "",
  ].join(" ");

  // A read-only viewer gets the same facts without controls that would fail.
  if (!canEdit) {
    return (
      <div className={className} aria-label={label}>
        {body}
      </div>
    );
  }

  return (
    <button type="button" onClick={onSelect} aria-label={label} className={className}>
      {body}
    </button>
  );
}

/** The cell's state in words, for anyone who cannot see the glyphs. */
function describeCell(cell: DayCell, marker: CellMarker): string {
  const parts = [formatCellDate(cell.date)];

  if (cell.dots.length > 0) {
    const names = cell.dots.map((d) => d.name).join(", ");
    parts.push(`${cell.questCount} ${cell.questCount === 1 ? "quest" : "quests"}`, names);
  }
  if (cell.dayOff) parts.push(cell.dayOff.label);
  if (marker === "missed") parts.push("nothing logged");
  if (cell.isToday) parts.push("today");

  return parts.join(" — ");
}

/** "September 2, 2026" — spelled out, because a cell is just a number. */
export function formatCellDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/work-calendar.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/work-calendar.tsx src/components/work-calendar.test.tsx
git commit -m "Draw a month of the work"
```

---

### Task 6: The day panel, and marking a day from it

**Files:**
- Modify: `src/components/work-calendar.tsx` (replace `DayPanelPlaceholder`)
- Modify: `src/components/work-calendar.test.tsx` (add the panel cases)

**Interfaces:**
- Consumes: `excuseDay`, `unexcuseDay` from `@/lib/actions/excused-days` (both now returning `StreakChange[]`, Task 2); `describeStreakChange` (Task 2); `EXCUSE_REASONS`, `EXCUSE_REASON_LABELS`

- [ ] **Step 1: Write the failing test**

Add to `src/components/work-calendar.test.tsx` — and change the top-level mock import so the test can drive it:

```tsx
import { excuseDay, unexcuseDay } from "@/lib/actions/excused-days";
import { fireEvent, waitFor } from "@testing-library/react";

describe("WorkCalendar day panel", () => {
  it("opens on a day and says what happened on it", () => {
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 3, 2026/ }));
    expect(screen.getByText(/Nothing logged/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Excuse just Aria/ })).toBeTruthy();
  });

  it("offers to excuse everyone only when there is more than one hero", () => {
    render(<WorkCalendar {...props} writableChildCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: /September 3, 2026/ }));
    expect(screen.queryByRole("button", { name: /Excuse everyone/ })).toBeNull();
  });

  it("excuses a day and states the streak repair", async () => {
    vi.mocked(excuseDay).mockResolvedValue([
      {
        childId: "c1",
        previousStreak: 6,
        currentStreak: 21,
        previousLongest: 21,
        longestStreak: 21,
      },
    ]);
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 3, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /Excuse just Aria/ }));

    await waitFor(() =>
      expect(screen.getByText(/Aria's streak went from 6 to 21 days\./)).toBeTruthy()
    );
    expect(vi.mocked(excuseDay)).toHaveBeenCalledWith("c1", "2026-09-03", "sick", "", {
      applyToAll: false,
    });
  });

  it("says plainly when nothing moved", async () => {
    vi.mocked(excuseDay).mockResolvedValue([]);
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 3, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /Excuse just Aria/ }));
    await waitFor(() => expect(screen.getByText(/No change to the streak\./)).toBeTruthy());
  });

  it("offers to undo an already-excused day, and warns the streak can drop", async () => {
    vi.mocked(unexcuseDay).mockResolvedValue([
      {
        childId: "c1",
        previousStreak: 21,
        currentStreak: 6,
        previousLongest: 21,
        longestStreak: 21,
      },
    ]);
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 8, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    await waitFor(() =>
      expect(screen.getByText(/Aria's streak went from 21 down to 6 days\./)).toBeTruthy()
    );
    expect(vi.mocked(unexcuseDay)).toHaveBeenCalledWith("c1", "2026-09-08");
  });

  it("does not offer to excuse a day already covered by a family break", () => {
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 10, 2026/ }));
    expect(screen.getByText(/Fall Break/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Excuse just Aria/ })).toBeNull();
  });

  it("says work is kept when excusing a day that already has some", () => {
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 2, 2026/ }));
    expect(screen.getByText(/keeps its credit/)).toBeTruthy();
  });

  it("reports a failure instead of implying success", async () => {
    vi.mocked(excuseDay).mockRejectedValue(new Error("Choose a reason."));
    render(<WorkCalendar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /September 3, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /Excuse just Aria/ }));
    await waitFor(() => expect(screen.getByText("Choose a reason.")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/work-calendar.test.tsx`
Expected: FAIL — the panel renders only `cell.date`, so `Nothing logged` is not found.

- [ ] **Step 3: Replace the placeholder with the real panel**

In `src/components/work-calendar.tsx`, add to the imports:

```tsx
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { excuseDay, unexcuseDay } from "@/lib/actions/excused-days";
import { describeStreakChange, type StreakChange } from "@/lib/utils/streak-change";
import { EXCUSE_REASONS, EXCUSE_REASON_LABELS } from "@/lib/utils/excused-days";
```

Replace the `{selectedCell && <DayPanelPlaceholder cell={selectedCell} />}` line with:

```tsx
      {selectedCell && props.canEdit && (
        <DayPanel
          key={selectedCell.date}
          cell={selectedCell}
          childId={props.childId}
          childName={props.childName}
          writableChildCount={props.writableChildCount}
          onDone={() => setSelected(null)}
        />
      )}
```

Delete `DayPanelPlaceholder` and add:

```tsx
/**
 * What happened on one day, and what a grown-up can do about it.
 *
 * Docked beneath the grid rather than floating over it: `components/ui` has no
 * popover, and a floating panel over a seven-column grid lands half off-screen
 * at phone width. Inline editing is how the school calendar and the quest log
 * already work.
 */
function DayPanel({
  cell,
  childId,
  childName,
  writableChildCount,
  onDone,
}: {
  cell: DayCell;
  childId: string;
  childName: string;
  writableChildCount: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<ExcuseReason>("sick");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const isHoliday = cell.dayOff?.kind === "holiday";
  const isExcused = cell.dayOff?.kind === "excused";

  async function run(action: () => Promise<StreakChange[]>) {
    setActing(true);
    setError(null);
    try {
      const changes = await action();
      // The repair is the point. State it in numbers, including when it is a
      // drop, and including when nothing moved at all.
      setResult(describeStreakChange(changes.find((c) => c.childId === childId), childName));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold">{formatCellDate(cell.date)}</h4>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {cell.dots.length > 0
          ? `${cell.questCount} ${cell.questCount === 1 ? "quest" : "quests"} logged${cell.minutes ? ` · ${cell.minutes} min` : ""}. Excusing the day keeps its credit.`
          : cell.expected
            ? "Nothing logged. School day."
            : "Nothing expected on this day."}
      </p>

      {cell.dayOff && (
        <p className="mt-1 text-xs text-muted-foreground">
          Already off — {cell.dayOff.label}
          {isHoliday ? " (whole family)." : "."}
        </p>
      )}

      {result ? (
        <p className="mt-2 text-xs">{result}</p>
      ) : (
        <>
          {!isHoliday && !isExcused && (
            <div className="mt-2 space-y-2">
              <label className="block text-xs text-muted-foreground">
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ExcuseReason)}
                  className="mt-1 block h-8 w-full rounded-md border bg-background px-2 text-xs"
                >
                  {EXCUSE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {EXCUSE_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="h-8 text-xs"
                aria-label="Note"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={acting}
                  onClick={() =>
                    run(() => excuseDay(childId, cell.date, reason, note, { applyToAll: false }))
                  }
                >
                  Excuse just {childName}
                </Button>
                {writableChildCount > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={acting}
                    onClick={() =>
                      run(() => excuseDay(childId, cell.date, reason, note, { applyToAll: true }))
                    }
                  >
                    Excuse everyone
                  </Button>
                )}
              </div>
            </div>
          )}

          {isExcused && (
            <Button
              size="sm"
              variant="ghost"
              disabled={acting}
              className="mt-2"
              onClick={() => run(() => unexcuseDay(childId, cell.date))}
            >
              Remove
            </Button>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

Add `ExcuseReason` to the existing type import at the top if it is not already imported as a value-free type:

```tsx
import { EXCUSE_REASONS, EXCUSE_REASON_LABELS, type ExcuseReason } from "@/lib/utils/excused-days";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/work-calendar.test.tsx`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/work-calendar.tsx src/components/work-calendar.test.tsx
git commit -m "Account for a day from the calendar that shows the gap"
```

---

### Task 7: Put it in the Quest Log

**Files:**
- Modify: `src/components/quest-view-tabs.tsx` (the `TABS` list and the `active` type)
- Modify: `src/app/(app)/quests/page.tsx` (the `searchParams` type, `activeView`, the tab render, a new `CalendarView`)

**Interfaces:**
- Consumes: `getCalendarMonth` (Task 4), `<WorkCalendar />` (Tasks 5–6)

- [ ] **Step 1: Let the tab strip carry a parent-only third tab**

Replace the top of `src/components/quest-view-tabs.tsx` through the component signature:

```tsx
const TABS = [
  { value: "today", label: "Today", icon: "swords" },
  { value: "adventure", label: "Complete Adventure", icon: "campfire" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
] as const;

export function QuestViewTabs({
  active,
  showCalendar,
}: {
  active: "today" | "adventure" | "calendar";
  /** The calendar is for grown-ups: a hero's screens show what to do next. */
  showCalendar: boolean;
}) {
```

and change the map to skip it:

```tsx
      {TABS.filter((tab) => tab.value !== "calendar" || showCalendar).map((tab) => (
```

- [ ] **Step 2: Wire the view into the page**

In `src/app/(app)/quests/page.tsx`:

Add the imports:

```tsx
import { getCalendarMonth } from "@/lib/actions/calendar";
import { WorkCalendar } from "@/components/work-calendar";
```

Widen the `searchParams` type:

```tsx
  searchParams: Promise<{ child?: string; week?: string; view?: string; month?: string }>;
```

and destructure `month`:

```tsx
  const { child: selectedChildId, week, view, month } = await searchParams;
```

Replace the `activeView` line. A hero who types the URL lands on Today:

```tsx
  const activeView =
    view === "adventure" ? "adventure" : view === "calendar" ? "calendar" : "today";
```

Replace `<QuestViewTabs active={activeView} />` with:

```tsx
      <QuestViewTabs active={activeView} showCalendar={!isChildView} />
```

Replace the view switch at the bottom of the page component:

```tsx
      {activeView === "today" ? (
        <TodayView
          key={activeChild.id}
          childId={activeChild.id}
          isChildView={isChildView}
          allowChildSkip={isChildView && activeChild.skipQuestsEnabled}
        />
      ) : activeView === "calendar" && !isChildView ? (
        <CalendarView key={activeChild.id} childId={activeChild.id} month={month} />
      ) : (
        <AdventureView
          key={activeChild.id}
          childId={activeChild.id}
          childName={activeChild.displayName}
          familyId={activeChild.familyId}
          isChildView={isChildView}
          week={week}
        />
      )}
```

Add the view beside `AdventureView`:

```tsx
async function CalendarView({ childId, month }: { childId: string; month?: string }) {
  const today = formatDate(new Date());
  // The month the parent asked for, else the one today falls in.
  const activeMonth = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.slice(0, 7);
  const data = await getCalendarMonth(childId, activeMonth, today);

  return <WorkCalendar childId={childId} {...data} />;
}
```

- [ ] **Step 3: Verify the whole suite and the types**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: **488 tests passing**, typecheck clean, lint clean. If `page.test.tsx` fails because it renders `QuestViewTabs` without the new prop, add `showCalendar` to that test's props rather than making the prop optional — a default would let a hero's page grow the tab silently.

- [ ] **Step 4: Browser pass**

Follow the local screenshot setup (app on port 3100). Check, as a parent:

1. The Calendar tab appears beside Today and Complete Adventure; a hero's Quest Log shows only two tabs.
2. A worked day shows one dot per subject in the subject's colour; a day with five or more shows four and a `+N`.
3. `‹` and `›` move by month and keep the selected child.
4. Clicking an empty school day opens the panel beneath the grid; excusing it states the streak change in numbers and the cell becomes `○`.
5. Removing that excuse reports the drop rather than going quiet.
6. The grid is usable at phone width with no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add src/components/quest-view-tabs.tsx "src/app/(app)/quests/page.tsx"
git commit -m "Give the Quest Log a calendar tab"
```

---

## Notes for the executor

- **Task 2 changes a shared return type.** `recomputeFamilyStreaks` is called from `school-breaks.ts`, `excused-days.ts` and the backfill. None uses the value today; if typecheck disagrees, use `.length`.
- **Task 3 is a real behavior change**, not a refactor: a hero excused for being sick is no longer held to the school-day realm gate. That is the intent — see §4.2 of the spec.
- **Do not add a `school_break.child_id` column.** An earlier draft of the design proposed it; it was dropped on finding `excused_day`. Two mechanisms for one concept is the thing this branch avoids.
