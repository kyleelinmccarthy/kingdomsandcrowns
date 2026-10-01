# Family-timezone dates — removing UTC from user-facing days

**Date:** 2026-09-03
**Status:** Approved design, ready for implementation planning

## 1. Purpose

Every calendar date this app shows or stores is currently derived in UTC. A
family in `America/Denver` logging work at 6pm has it recorded as tomorrow.
That silently shifts streaks, learning-log entries, weekly summaries, and which
quests and chores appear today.

The app already collects a **Realm Timezone** per family, and the marketing
walkthrough tells users "the timezone governs quest days and streaks". The
column is written and never read. This work delivers what the product already
claims.

### Goal

No user-facing calendar date is ever derived from UTC. "Today", "this week",
and every weekday come from the owning family's configured timezone.

### Non-goals

Per-child timezones. Per-device timezones. Changing how timestamps
(`created_at` and friends) are stored — those stay UTC instants, which is
correct. Adding a date library.

## 2. Two kinds of UTC use — only one is a bug

This distinction is the whole design. Conflating them introduces bugs.

**Kind 1 — deriving a calendar date from an instant. This is the bug.**
`formatDate(new Date())` answers "what day is it?" by asking UTC. There are 14
such call sites, plus 12 raw `toISOString()` derivations outside `dates.ts`.
Every one is wrong for any family not living in UTC.

**Kind 2 — arithmetic on date-only strings. This is correct and stays.**
Twelve sites parse `"2026-09-02"` as `new Date("2026-09-02T00:00:00Z")` and use
`getUTCDay()` / `setUTCDate()`. Here UTC is not a timezone choice — it is a
*fixed frame* that makes a date-only string mean the same day regardless of how
the host is configured. Parsing `"2026-09-02"` in local time on a UTC+13 server
yields September 1, which would generate a Monday chore on Sunday.

These functions take a date and return a date; no instant is involved, so no
timezone applies. They keep their frame, with comments saying why, so a future
reader does not "fix" them.

### The rule

> A calendar date derived from an instant uses the family's timezone.
> A calendar date derived from another calendar date uses the fixed frame.

## 3. Core primitive

One new function in `src/lib/utils/dates.ts`:

```ts
todayInZone(timeZone: string, now: Date = new Date()): string
```

Implemented with `Intl.DateTimeFormat` and a `timeZone` option, using the
`en-CA` locale, which formats as `YYYY-MM-DD` natively. Chosen over a date
library (a dependency for something the platform does) and over storing a fixed
UTC offset per family (which breaks at both DST transitions).

`formatDate(date: Date)` — the current UTC-deriving function — is **removed**,
not deprecated. Leaving it in place guarantees someone reaches for it again.

Its 9 remaining non-`new Date()` call sites split two ways, and each must be
read individually rather than mechanically rewritten:

- Callers passing a `Date` that is really a calendar value stepped by
  arithmetic (`streak.ts` walking a cursor backwards, `activities.ts` computing
  a window start, `parent-dashboard.tsx` a week out). These are Kind 2 and move
  to a fixed-frame helper.
- Callers passing an actual instant (`activities.ts:108` writing
  `data.date ?? formatDate(now)`, and `:282` writing `lastActiveDate`). These
  are Kind 1 and take the family's timezone. They are also exactly the two
  columns the backfill corrects, which is not a coincidence — they are the only
  places an instant becomes a stored date.

The three internal uses inside `dates.ts` itself become the fixed-frame
implementation.

An invalid or unknown `timeZone` throws from `Intl`; callers pass a value that
came from the database, and `getFamilyTimezone` falls back to the schema
default, so this cannot reach a user.

## 4. Threading the timezone

Pure helpers take `timeZone` as an explicit parameter — no ambient state, so
they stay unit-testable with no clock or environment mocking.

Server code gets the value from a new `getFamilyTimezone()` in
`src/lib/services/family-timezone.ts`, `cache()`-wrapped exactly as `getActor`
and `getMemberships` are. Production runs on remote Turso, and this value is
needed on nearly every render; per-render round-trips are the thing that rule
exists to prevent. It falls back to the schema default `America/Denver` when no
family is resolvable.

Three client components (`quest-schedule-form.tsx`, `quest-template-form.tsx`,
`long-rest.tsx`) derive "today" for date inputs. They receive the family's
timezone as a prop from their server parent rather than reading a browser
clock, so a parent travelling does not see a different default than the child.

## 5. Backfill

Three stored columns are derived from an instant:

- `activity_log.date`
- `child.last_active_date`
- `wage_ledger_entry.date` — written correctly from `todayInZone` in
  `src/lib/actions/wages.ts`, and requires **no backfill**: the Upkeep feature
  that writes it has never shipped, so no row predates the fix and there is no
  historical wage data to correct.

The backfill script therefore only touches the first two — the ones with
pre-fix rows to correct.

**Everything else is left alone, deliberately.** `quest_assignment.date`,
`upkeep_task_assignment.date`, `weekly_summary.week_start_date` and
`missed_subject.week_start_date` come from calendar arithmetic over a schedule,
not from an instant. Shifting them would move scheduled work to the wrong day —
a corruption, not a correction.

### Telling a corrupted row from a deliberate one

`activity_log.date` is written as `data.date ?? formatDate(now)` — either a
parent deliberately logging past work, or an auto-derived value. The row does
not record which. The discriminator:

> An auto-derived row's `date` always equals the UTC calendar date of its
> `created_at`. A deliberately backdated row's does not.

So the backfill corrects a row only when `date === utcDate(created_at)`, and
recomputes it as `todayInZone(familyTimezone, created_at)`. Any row where they
differ was a deliberate choice and is never touched.

The one ambiguous case — a parent who backdated to exactly the UTC date the
system would have chosen — is indistinguishable in principle, and shifting it
produces the date they would have got had the bug never existed.

### Safety

The script defaults to a **dry run**, printing every row it would change with
its old and new value and a per-family summary. It writes only when passed an
explicit flag. It resolves each child's timezone through their family, so a
multi-family deployment is handled correctly.

### Consequence to expect

Streaks are computed from `activity_log.date`. A child's current streak can
change the first time this runs — that is the bug being corrected, but it will
be visible, and it should be stated in the release notes rather than discovered.

## 6. Preventing regression

An architecture test, following the pattern of `src/test/upkeep-isolation.test.ts`:
outside `src/lib/utils/dates.ts`, no file under `src/` may call `toISOString()`
or construct a calendar date from a raw `new Date()`. Comments are stripped
before scanning, for the reason established by the existing guard — a check that
forbids naming a construct in prose punishes the comments that explain it.

The test discovers files on disk rather than reading a hardcoded list, so a new
file cannot be silently unprotected.

## 7. Testing

Written before their implementation:

- `todayInZone` — a UTC instant late in the day resolving to the previous local
  day in `America/Denver`; the same instant resolving to the next day in
  `Pacific/Auckland`; both DST transitions in `America/Denver` (spring forward
  and fall back); UTC in, UTC out; a leap day.
- The fixed-frame helpers keep their existing tests unchanged — proving Kind 2
  behaviour did not move.
- The backfill discriminator as a pure function: a row whose date matches the
  UTC date of `created_at` is corrected; one that differs is left; the corrected
  value is the family-timezone date.
- The architecture guard.

The existing suite (481 tests) must stay green; any test that changes is a test
that encoded the UTC bug, and each such change is called out with its reason.

## 8. Migration

No schema change. `family.timezone` already exists with a default. The backfill
is a script under `scripts/`, run manually against an environment, not a Drizzle
migration — it corrects data conditionally rather than transforming a column,
and it must be dry-run and reviewed before it writes.
