# Excused Days and Missed-Assignment Recovery

Date: 2026-09-07
Branch: `excused-days` (rebased on top of the catch-up work in `claude/missed-assignment-makeup-dz739a`)

## Problem

Lily's and Lucas's streaks both read 4 in production. The streak math is correct;
the cause is a single day. Both heroes have nine `pending` assignments on Monday
2026-08-31 and no `activity_log` rows anywhere between 2026-08-29 and 2026-08-31.
Aug 31 was a required school day (a Monday, not optional, not inside a break), so
`computeStreak` stopped there. Walking their real history back from their last
log on 2026-09-04 gives 4 for both. Treating Aug 31 as a day off gives 11 for
Lily and 10 for Lucas.

Two defects sit behind that one day.

1. **A day off can only be declared in advance.** The only lever that makes a
   date streak-neutral is `school_break`, which is family-wide and means "school
   is closed", not "Lily was at the doctor". Once a day has passed there is no
   way to say it should not have counted.
2. **`longest_streak` never heals.** `updateStreakAndXp` sets it to
   `max(stored, current)`. It never recomputes the longest run from history, so
   values written under the old weekend-breaking logic are frozen. Lily stores 7
   where her history supports 11; Lucas stores 6 where it supports 10.

A third, softer problem: nothing tells a parent that a day was missed. The nine
abandoned assignments on Aug 31 are the only trace, and no screen surfaces them
as a day rather than as a pile of stale quests.

## Goals

- A parent can excuse a past day for one hero or for every hero at once, with a
  reason, and the streak repairs immediately.
- A parent can see which past days were missed, per hero, and act on each.
- The work on a missed day can be excused outright or moved to a specific later
  date, keeping a record of where it came from.
- `longest_streak` self-heals from history instead of ratcheting.

## Non-goals

- Changing how the child-facing catch-up panel works. The 7-day resurfacing
  window and the `makeup_day` mechanism stay exactly as the rebased branch
  built them.
- Attendance reporting or export. The `excused` status is recorded so a future
  report *can* distinguish an excused absence from a declined assignment, but no
  report is built here.
- Automatic detection of holidays. The holiday preset work is separate.

## Data model

### New table `excused_day`

Per-child, one row per excused date. Shaped after the existing `makeup_day`
table for consistency.

```ts
export const excusedDay = sqliteTable(
  "excused_day",
  {
    id: text("id").primaryKey(),
    childId: text("child_id").notNull().references(() => child.id, { onDelete: "cascade" }),
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

Per-child rather than family-wide because the common case — one child sick, the
other not — cannot be expressed family-wide. "Apply to all heroes" is a UI
affordance that writes one row per child, not a second scope in the schema.

### Changes to `quest_assignment`

- `status` enum gains `"excused"`, becoming
  `["pending", "completed", "skipped", "stuck", "excused"]`.
  Distinct from `skipped` so the record separates "a grown-up excused this
  absence" from "we chose not to do this".
- New nullable column `original_date` (`text`). Set the first time an
  assignment is moved and never overwritten afterwards, so a quest moved twice
  still points at the day it was originally set for.

Migration `0022_excused_days.sql`, generated with `npm run db:generate` and
applied with `npm run db:migrate`.

## Streak integration

`StreakOptions` in `src/lib/utils/streak.ts` gains:

```ts
/** Dates a parent excused after the fact. Skipped exactly like a break. */
excusedDates?: readonly string[] | null;
```

`isDayOff` returns true when the date is in that set, alongside the existing
non-school-weekday, optional-weekday and break checks. Because both
`computeStreak` and `computeLongestStreak` route through `isDayOff`, current and
longest streaks honour excused days without further change.

Three call sites pass the new option, each querying `excused_day` over the same
365-day window they already use for breaks:

| Call site | Change |
|---|---|
| `updateStreakAndXp` (`src/lib/actions/activities.ts`) | add an `excused_day` select to the existing `Promise.all`; pass `excusedDates` |
| `recomputeFamilyStreaks` (`src/lib/services/streaks.ts`) | one family-wide `excused_day` read, grouped by child, alongside the existing breaks read |
| `backfillStreaks` (`src/lib/db/backfill-streaks.ts`) | same, per child |

`excuseDay` and `unexcuseDay` call `recomputeFamilyStreaks` on completion, the
same way `createSchoolBreak` / `updateSchoolBreak` / `deleteSchoolBreak` already
do. This is what makes the streak repair the instant a parent excuses a day,
rather than waiting for the hero's next activity — which, on a day nobody was
schooling, is precisely the thing that will not happen.

### Fixing `longest_streak`

`updateStreakAndXp` currently computes:

```ts
const longestStreak = Math.max(streak, childRow[0]?.longestStreak ?? 0);
```

It becomes the same formula `backfill-streaks.ts` already uses:

```ts
const longestStreak = Math.max(
  childRow[0]?.longestStreak ?? 0,
  streak,
  computeLongestStreak(dates, options)
);
```

Still monotonic — it never lowers a stored value — but it now recovers a longest
run the stored number missed. Production self-heals on each hero's next logged
activity instead of depending on a script being remembered.

## Missed-day selection

New pure module `src/lib/utils/missed-days.ts`, testable without a database.

```ts
export type MissedDay = {
  date: string;
  /** Assignments still owed on that day (pending or stuck). */
  unfinishedCount: number;
  /** True when the day has no logged activity at all. */
  empty: boolean;
  /** True for the day that terminates the current streak. */
  brokeStreak: boolean;
};

export function selectMissedDays(input: {
  today: string;
  windowDays?: number;      // default 30
  activeDates: Iterable<string>;
  assignments: { date: string; status: string }[];
  schoolDays?: readonly string[] | null;
  optionalDays?: readonly string[] | null;
  breaks?: readonly DateRange[] | null;
  excusedDates?: readonly string[] | null;
}): MissedDay[];
```

Walking back from yesterday over `windowDays`, a date is a missed day when it is
**not** a day off under the same `isDayOff` rules the streak uses (so excusing a
day removes it from this list too) **and** it either has no logged activity or
still carries unfinished assignments. Results are newest first.

`isDayOff` is currently private to `streak.ts`. It becomes an exported function
so this module reuses it rather than restating the rules. A second copy of
"which days count" is exactly how the panel and the streak would drift apart.

`brokeStreak` marks the first empty day encountered walking backwards — by
construction the exact date where `computeStreak` stops. It drives the pointer
on the tavern page and the emphasis on the panel's first row.

The parent window is 30 days. The child-facing catch-up window stays at
`MAKEUP_LOOKBACK_DAYS = 7`: a parent needs to see far enough back to find the day
that cost the streak, while a hero should never be handed a month of backlog.

## Server actions

New file `src/lib/actions/excused-days.ts`. Every mutating action is
parent-only, following the `requireParent` helper pattern already in
`src/lib/actions/makeup.ts`.

- `getExcusedDays(childId, fromDate)` — read, in-scope adult or the hero.
- `excuseDay(childId, date, reason, note?, { applyToAll })` — upserts the
  `excused_day` row (idempotent, updating reason/note when the day is already
  excused), sets every `pending` or `stuck` assignment on that date to
  `excused`, and recomputes streaks. With `applyToAll`, repeats for every
  non-banished hero in the family.
- `unexcuseDay(childId, date)` — deletes the row, reverts that date's `excused`
  assignments to `pending`, recomputes. Completed and skipped work is untouched.
  Work that was `stuck` before being excused comes back as `pending` rather than
  `stuck`; its `statusReason` is preserved, so nothing a hero wrote is lost, but
  the day starts clean rather than re-raising a stale alert.
- `moveAssignmentsToDate(assignmentIds, targetDate)` — parent-only. Refuses
  anything not `pending` or `stuck`, and refuses a target before today. Sets
  `date = targetDate` and `originalDate = COALESCE(original_date, date)`.
- `moveDayToDate(childId, fromDate, targetDate)` — the whole-day convenience
  wrapper over the above.
- `getMissedDaysView(childId, today)` — assembles child settings, activity
  dates, assignments, breaks and excused days, and returns
  `selectMissedDays(...)` plus the excused rows for the window.

## UI

**`src/components/missed-days.tsx`** — a parent-only panel, one section per
hero, rendering `MissedDay` rows: weekday and date, unfinished count, and a
marker on the row that broke the streak. Each row offers:

- **Excuse day** — reason picker (sick / appointment / family / holiday /
  other), optional note, and an "apply to all heroes" checkbox when the family
  has more than one hero.
- **Move work to…** — a date input defaulting to today, moving that day's
  unfinished assignments.

The tavern renders two different screens, so the panel appears in both:

**`src/app/(app)/tavern/parent-dashboard.tsx`** — shown when a parent has no
hero selected. Renders the panel below the per-child summary cards, one section
per hero, so a parent sees the whole family's missed days at a glance. The
existing `makeupCount` badge stays as it is.

**`src/app/(app)/tavern/page.tsx`** — shown when a parent has selected a hero,
and the screen that displays `currentStreak`. For a non-child viewer, renders
the panel scoped to that one hero, directly beneath the streak figure, preceded
by a single line when the streak was broken inside the window: "Streak broke on
Mon Aug 31 — excuse this day?". The panel sits immediately below it, so the fix
is in the same eyeline as the problem rather than behind a link. Children never
see the panel.

**`src/components/quest-assignment-card.tsx`** — renders the `excused` status
(badge plus reason) and, for a grown-up, an "Undo" that returns it to `pending`.
A card whose `originalDate` is set shows "moved from <weekday>".

## Who sees what

The tavern and quest screens are shared by four kinds of actor. Every surface
below is specified for all four, so no one lands on a control they cannot use or
a screen that reads like an accusation.

| Actor | Missed Days panel | Excuse / Move controls | Excused card | Moved card |
|---|---|---|---|---|
| Hero on own profile (`isChildActor`) | hidden | hidden | "Excused — sick day", neutral tone, no undo | "Moved to Thursday" |
| Adult, `permission: "edit"` | visible | enabled | badge + reason + Undo | "moved from Monday" + Move again |
| Adult, `permission: "view"` | visible, read-only | hidden | badge + reason, no Undo | "moved from Monday" |
| Adult, `scope: "specific"` | only heroes in scope | enabled, in-scope heroes only | as edit/view above | as edit/view above |

Three consequences that the implementation must honour:

- **"Apply to all heroes" means all heroes the actor can write to.** An adult
  scoped to one hero excusing a day with the checkbox ticked affects that hero
  only. The checkbox is hidden outright when the actor can write to exactly one
  hero, rather than shown as a no-op.
- **A hero is never told they missed a day.** The panel is the grown-ups'
  accounting. What a hero sees is the existing catch-up list, and an excused day
  simply removes work from it. No "you broke your streak" messaging anywhere.
- **A read-only guardian sees the same facts, not the same buttons.** They are
  a real audience for "was anything missed this week", and hiding the panel from
  them would make the app look broken rather than restricted. Server actions
  enforce this independently of the UI via `requireChildAccess(id, { write: true })`.

Streak repair is actor-independent: `recomputeFamilyStreaks` runs on the family
whose calendar changed, whoever triggered it.

## Ripple effects

- `UNFINISHED_STATUSES` in `src/lib/utils/makeup.ts` stays `{pending, stuck}`.
  Because `excused` is a new status outside that set, excused work stops
  resurfacing in the catch-up panel with no change to that module. This is
  asserted by a test rather than left implicit.
- The learning log needs no change: `learning-log-format.ts` already filters to
  `status === "completed"`.
- `visibleAssignment` in `quest-assignments.ts` is
  `isActive OR status != "pending"`, so excused rows stay visible. No change.
- `getScheduledDates` / assignment generation are untouched — an excused day
  still generates its assignments; they are simply marked excused.

## Testing

Test-driven, following the existing suite's structure.

- `streak.test.ts` — excused dates skip like breaks in `computeStreak`; an
  excused day with activity still counts; `computeLongestStreak` honours excused
  dates; the Lily and Lucas histories from production produce 4 unexcused and
  11 / 10 with Aug 31 excused.
- `missed-days.test.ts` — non-school, optional, break and excused days are never
  missed days; a day with activity but unfinished work is; `brokeStreak` lands
  on the right date; the window boundary holds.
- `excused-days.test.ts` — parent-only enforcement; idempotent re-excusing;
  `applyToAll` covers every hero; unexcuse reverts only `excused` assignments;
  move refuses completed work and past targets; `originalDate` is not
  overwritten on a second move.
- `makeup.test.ts` — an excused assignment does not appear in
  `selectMakeupAssignments`.
- `missed-days.test.tsx` — panel renders rows, marks the streak-breaking day,
  and wires the two actions.
- Actor coverage, asserted rather than assumed: the panel is absent for a hero,
  read-only for a view-permission adult, and the "apply to all" checkbox is
  hidden when the actor can write to only one hero. `excused-days.test.ts`
  covers the server-side half — a hero and a view-only adult are both refused.

## Production repair

Two writes, each requiring explicit approval before it runs.

1. Run `backfill-streaks.ts` against production to correct `longest_streak`
   (Lily 7 → 11, Lucas 6 → 10). After the `updateStreakAndXp` change this is a
   one-time cleanup rather than a recurring chore.
2. Excuse 2026-08-31 for both heroes, through the new UI rather than a script,
   which restores their current streaks to 11 and 10 and exercises the real
   path.

Deployment order matters: migration `0022` must be applied before the new code
reads `excused_day` or writes the `excused` status.
