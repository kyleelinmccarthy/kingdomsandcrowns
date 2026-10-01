# Quest Log calendar — design

**Status:** approved in brainstorm, 2026-09-17
**Branch:** `quest-log-calendar`, branched from `excused-days` (not from `main`)
**Scope:** a month view of a hero's work in the parent's Quest Log, marking days off from it, and the one parity gap excused days still have

---

## 1. What started this

> on the parent view in quest log - add a calendar view snapshot of the students work completed with the ability to mark a day as excused absence/holiday and have it retroactively fix a streak if that day is what impacted a streak

## 2. What already exists

Verified against the code, not assumed. Most of the "mark a day and fix the streak" half is **already built on `excused-days`**, which is why this branch starts there rather than on `main`.

**The retroactive repair works today.** `computeStreak` (`src/lib/utils/streak.ts`) skips non-school weekdays, optional days, breaks, and — on this branch — excused dates, via a single `isDayOff`. Both `computeStreak` and `computeLongestStreak` route through it, so current and longest streaks honour a newly excused day alike. `recomputeFamilyStreaks` (`src/lib/services/streaks.ts`) re-derives every hero's stored streak, and `excuseDay` / `unexcuseDay` both call it on completion. Marking a day therefore already heals the streak that day broke.

**The excused-day concept is already modelled**, per-child, in `excused_day` — `child_id` + `date`, unique per pair, a `reason` of sick/appointment/family/holiday/other, and an optional note. `excuseDay(childId, date, reason, note?, { applyToAll })` is idempotent (re-excusing edits the reason rather than failing), marks the day's *unfinished* assignments `excused` while leaving completed work credited, and with `applyToAll` writes one row per hero the actor may write to. `unexcuseDay` reverses it, returning excused assignments to `pending`.

**So this branch is not building excused days.** It is building the thing that branch has no surface for.

**What does not exist anywhere:**

- **No month grid.** `SchoolCalendar` is a text list of break ranges grouped by school year, on `/schedule` and inside Long Rest. The `excused-days` branch's entry point is a **Missed Days** list on the two tavern screens — a list of problem days, not a view of the work.
- **Nothing in the Quest Log's parent view.** Its tabs are Today and Complete Adventure.
- **No month-scale activity query.** `getRecentActivities(childId, 50)` cannot back a grid; a busy fortnight exhausts fifty rows.
- **No parity in the Realm.** `isSchoolDay` in `src/lib/actions/realm-play.ts` consults `school_break` only, so an excused day still gates realm play as a school day. This is the one place excused days are *not* yet honoured, and it is in scope here.

**Two things that sound related and are not:**

- There is no "you missed a day" nagging to suppress. `parentAlert` rows come only from a hero skipping or getting stuck on a quest. The `missedSubject` table has **no readers anywhere in `src`**.
- Quest assignments generate on family holidays — `school_break` does not suppress them. Inherited behavior, recorded so it is not mistaken for something this work introduced.

## 3. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where the calendar lives | **A third tab**: Today / Complete Adventure / Calendar, parent-only. |
| 2 | What a day cell shows | **Subject dots**, one per subject in its own color, capped at four with a `+N`. |
| 3 | What clicking a day does | **A detail panel** beneath the grid, naming the day and what was logged, offering both scopes, then stating the streak change in plain numbers. |
| 4 | How a day is marked | **The existing `excuseDay` action.** No new table, no migration. |
| 5 | What "for everyone" means | **`applyToAll`** — one `excused_day` row per hero, following the existing branch's ruling that scope is a UI affordance, not a second column. |
| 6 | Reason vs. free label | **The existing `reason` enum plus the optional note.** |
| 7 | The realm-play gap | **Closed here** — excused days become days off for the realm gate too. |

On decision 5, the original brainstorm proposed writing a single-day `school_break` for "holiday for everyone". That is dropped: `excused-days` already ruled that "apply to all heroes is a UI affordance that writes one row per child, not a second scope in the schema", and two mechanisms for one concept is what this branch exists to avoid. **The visible consequence:** a holiday marked from this grid does *not* appear in the School Calendar list on `/schedule`, because it is not a `school_break`. Planned, school-is-closed holidays still belong in that panel; this grid is for accounting for days after the fact.

On decision 6, the brainstorm proposed a free-text label. The enum is better — it is already there, already rendered by `EXCUSE_REASON_LABELS`, and it keeps the door open for the attendance reporting the `excused-days` design listed as a non-goal. The note field carries anything freeform.

## 4. Backend work

No schema change. Four pieces:

### 4.1 `recomputeFamilyStreaks` returns detail instead of a count

```ts
{ childId, previousStreak, currentStreak, previousLongest, longestStreak }[]
```

All existing callers ignore the return value, and `.length` is the old number, so nothing breaks. This is the only way the UI can state *"Aria's streak went from 6 to 21 days"* — the feature's whole proof that it worked.

`excuseDay` and `unexcuseDay` currently return `void`; both change to return the `streakChanges` from the recompute they already run.

### 4.2 Realm-play parity

`isSchoolDay(childId, familyId, date)` in `src/lib/actions/realm-play.ts` gains an `excused_day` check beside its `school_break` check: a date excused for that hero is not a school day for them. This is a genuine behavior change — a hero excused for being sick is no longer held to the school-day realm gate — and it is what "full parity with a holiday" means.

### 4.3 A month-scale activity read

`getActivityDaysInRange(childId, startDate, endDate)` in `activities.ts`: `{ date, subjectId, count, minutes }` grouped by day and subject, so one query backs the whole grid.

### 4.4 One read action for the page

`getCalendarMonth(childId, month)` returning everything the grid needs in one authorized call — activity days, the hero's subjects, that month's `excused_day` rows and overlapping `school_break` rows, and the hero's `schoolDays` / `streakOptionalDays`. `requireChildAccess`, and the page renders nothing editable unless the actor is a parent.

## 5. The calendar tab

**Routing.** `?view=calendar`, parent-only — `QuestViewTabs` gains the third entry only when `!isChildView`, and a hero who types the URL falls back to Today. Month is a `?month=YYYY-MM` param, so `‹ ›` are plain links and the view stays a server component. `?child=` is preserved.

**Server.** A `CalendarView` sibling to `TodayView` / `AdventureView` in `src/app/(app)/quests/page.tsx`, calling `getCalendarMonth`.

**Client.** `src/components/work-calendar.tsx`, Monday-first to match `getWeekStartDate` and `DAYS_OF_WEEK`.

A day can be several things at once, so a day off shows its marker **and** its dots when work happened anyway — work logged on a holiday still counts toward the streak, and hiding it would misreport the child's own effort. Otherwise: dots for work, `✖` for a school day with nothing, muted for a non-school day, blank for the future.

```
┌─ September 2026 ──────── ‹  › ─┐
│  M   T   W   T   F   S   S     │
│  1   2   3   4   5   6   7     │
│ ●●  ●●●  ○   ●●  ●   ·   ·     │
│  8   9  10  11  12  13  14     │
│ ✖   ●   ☘   ●●● ●   ·   ·      │
└────────────────────────────────┘
┌─ Tue, Sep 8 ───────────────────┐
│ Nothing logged. School day.    │
│ Reason: [ Sick day      ▾ ]    │
│ Note:   [ ______________ ]     │
│ [ Excuse just Aria ]           │
│ [ Excuse everyone ]            │
└────────────────────────────────┘
🔥 14 day streak · 18 of 21 school days
```

Legend: `●` a subject logged · `✖` expected, nothing logged · `☘` family holiday (`school_break`) · `○` excused (`excused_day`) · `·` not a school day.

The panel docks beneath the grid rather than floating: `components/ui` has `dialog` and `dropdown-menu` but no popover, a floating panel over a seven-column grid lands half off-screen at phone width, and inline editing is how `school-calendar.tsx` and `quest-log.tsx` already work.

After saving, the panel becomes the result line — *"Sep 8 excused — Aria's streak went from 6 to 21 days. [Undo]"* — and calls `router.refresh()`. Undo calls `unexcuseDay`. Cells are buttons whose aria-labels state the day's status, so the grid works without seeing the glyphs.

The footer's "18 of 21 school days" counts, over the visible month only, cells the grid already classified: days expected (school weekday, not optional, not off, not future) and how many of those carry work.

The cell rules are extracted to `src/lib/utils/work-calendar.ts` as `buildMonthGrid({ month, activityDays, excusedDays, breaks, schoolDays, optionalDays, today })`, returning cells with their status — so precedence, expected-empty, future and dot-capping are pure-function tests rather than DOM assertions. Excused days and breaks stay separate arguments, because that is what distinguishes `○` from `☘`.

## 6. Edge cases

| Case | Behavior |
|---|---|
| Excusing a day that already has work | Allowed; completed work keeps its credit and still counts toward the streak. Only *unfinished* assignments become `excused` — existing `excuseDay` behavior, which the panel states rather than implying anything is erased. |
| Marking a future day | Allowed — planned appointments are the point. No streak effect until that day arrives, since `computeStreak` walks backward from today. |
| Undo | `unexcuseDay` returns the day's excused assignments to `pending` and recomputes; the streak can *drop*. The panel reports the drop plainly instead of only celebrating gains. |
| Excusing a day older than 365 days | No change — outside `computeStreak`'s cap. The panel says "No change to the streak" rather than claiming a repair. |
| `longest_streak` asymmetry | `recomputeFamilyStreaks` takes `max(stored, current, computed)`, so excusing can raise the record but un-excusing never lowers it. Existing behavior, unchanged here — but it means Undo does not fully undo, and that is worth knowing before someone reports it as a bug. |
| "Excuse everyone" | Writes one `excused_day` per hero **the actor may write to** — a scoped guardian's "everyone" is their own scope, already enforced by `getWritableChildIds`. It does not create a `school_break`, so it will not appear in the School Calendar list on `/schedule`. |
| Realm play on an excused day | After §4.2, the realm's school-day gate no longer applies to that hero on that date. New behavior, deliberately chosen. |
| Timezone | The grid is server-rendered; only the "today" ring is corrected client-side, via `useBrowserToday`, as `SchoolCalendar` does. |

## 7. Tests

Pure-function tests, matching this repo's convention (no test mocks `@/lib/db`):

- `src/lib/utils/work-calendar.test.ts` — cell precedence, excused vs. break vs. expected-empty vs. non-school-day, future cells, dot capping at four with `+N`, a day that is both off and worked, and the footer's expected/logged counts

Component test:

- `src/components/work-calendar.test.tsx` — dots in subject colors, `✖` / `☘` / `○` rendering, the detail panel's copy per state, the reason picker, the streak-change line after a mocked save, Undo, and month navigation links

Regression:

- `src/lib/utils/streak.test.ts` already covers excused dates as days off; add a case pinning that the realm-play notion of a school day and the streak notion agree on an excused date, so §4.2 cannot drift back apart.

## 8. Verification

`npm run test`, `npm run typecheck`, `npm run lint`, and a browser pass on the new tab. Baseline at branch point: 446 tests passing across 33 files.
