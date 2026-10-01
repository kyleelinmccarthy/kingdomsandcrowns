# Family-Timezone Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop deriving any user-facing calendar date from UTC — "today", "this week" and every weekday come from the owning family's configured timezone.

**Architecture:** One new primitive, `todayInZone(timeZone, now)`, becomes the only place an instant turns into a calendar date. Arithmetic over date-only strings keeps a fixed internal frame so a date cannot drift with host configuration. Call sites are migrated additively, the old UTC-deriving functions are deleted only once nothing calls them, and an architecture test stops them coming back.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Drizzle ORM over libSQL/Turso, TypeScript, Vitest, `Intl.DateTimeFormat` (no new dependency).

**Spec:** `docs/superpowers/specs/2026-09-03-family-timezone-dates-design.md` — read it alongside this plan.

## Global Constraints

- **The rule that decides every case:** a calendar date derived from an **instant** uses the family's timezone; a calendar date derived from another **calendar date** uses the fixed frame. Ask which one you have before touching a line.
- **`family.timezone` is the authority.** Never the server clock, never the browser clock. Default `America/Denver` (the schema default) when no family resolves.
- **No new dependency.** `Intl.DateTimeFormat` with a `timeZone` option and the `en-CA` locale formats as `YYYY-MM-DD` natively and is DST-correct.
- **Timestamps stay UTC instants.** `created_at` and friends are unaffected. Serializing one with `.toISOString()` for the client is NOT a calendar-date derivation and must not be changed — `src/app/(app)/settings/page.tsx:62` and `src/lib/actions/parent-alerts.ts:64` are both legitimate and stay.
- **Pure helpers take `timeZone` as an explicit parameter.** No ambient state, so tests need no clock or environment mocking.
- **Server lookups of the timezone are `cache()`-wrapped**, matching `getActor`/`getMemberships` in `src/lib/auth/access.ts`. Production is remote Turso and this value is needed on nearly every render.
- **Test commands:** `npx vitest run <path>` for one file, `npm test` for the suite. `npm run typecheck` and `npm run build` must pass before every commit.
- **Baseline:** 481 tests across 40 files, all passing. Any test that changes is a test that encoded the UTC bug — say which and why in your report.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## Three patterns you will meet

The spec names two; investigation found a third, already broken in production code. Learn to tell them apart before editing.

**Kind 1 — instant → calendar date. The bug this plan fixes.**
```ts
formatDate(new Date())              // "what day is it?" answered by UTC
new Date().toISOString().slice(0,10)
```
14 `formatDate(new Date())` sites plus several raw ones. Each becomes
`todayInZone(timeZone)`.

**Kind 2 — calendar date → calendar date. Correct; leave it alone.**
```ts
const d = new Date(isoDate + "T00:00:00Z");
d.setUTCDate(d.getUTCDate() + days);
```
The `Z` is not a timezone choice. It is a fixed frame that makes `"2026-09-02"`
mean the same day whatever the host is set to. Parsing it as local time on a
UTC+13 host yields September 1 — a Monday chore generated on Sunday.

**Kind 3 — mixed frame. Broken today; this plan removes it.**
```ts
const d = new Date(iso + "T12:00:00");   // parsed LOCAL
d.setDate(d.getDate() + days);           // stepped LOCAL
return d.toISOString().split("T")[0];    // formatted UTC
```
Noon-local was chosen to dodge DST, but the round trip through UTC breaks east
of UTC+12. Verified:

| TZ | `addDays("2026-01-15", 0)` | `addDays("2026-01-15", 1)` |
|---|---|---|
| America/Denver | 2026-01-15 ✓ | 2026-01-16 ✓ |
| Asia/Tokyo | 2026-01-15 ✓ | 2026-01-16 ✓ |
| Pacific/Auckland (NZDT) | 2026-01-14 ✗ | 2026-01-15 ✗ |
| Pacific/Kiritimati | 2026-01-14 ✗ | 2026-01-15 ✗ |

Kind 3 lives in `src/lib/utils/dates.ts` (`getWeekStartDate`, `getWeekEndDate`),
`src/components/long-rest.tsx` (a duplicate `addDays`, and `getThisWeekStart`),
and `src/app/(app)/quests/page.tsx:271-275` (an inline week-end). All are
replaced by shared Kind 2 helpers, which also removes the duplication.

---

## File Structure

**Modified — the date module (one responsibility: calendar dates):**

| File | Change |
|---|---|
| `src/lib/utils/dates.ts` | Gains `todayInZone`, `weekStartOf`, `weekEndOf`. Loses `formatDate`, `toISODate`, `getWeekStartDate`, `getWeekEndDate`. |

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/services/family-timezone.ts` | `cache()`-wrapped lookup of the active family's timezone. |
| `src/lib/utils/backfill-dates.ts` | Pure decision: is a stored row's date auto-derived (and therefore correctable) or deliberate? |
| `scripts/backfill-timezone-dates.ts` | Dry-run-by-default correction script. |
| `src/test/date-frame.test.ts` | Architecture guard. |

**Modified — call sites (server):** `src/lib/actions/activities.ts`, `quests.ts`, `quest-schedules.ts`, `upkeep-tasks.ts`, `upkeep-schedules.ts`, `wages.ts`; `src/app/(app)/quests/page.tsx`, `scrolls/page.tsx`, `tavern/page.tsx`, `tavern/parent-dashboard.tsx`.

**Modified — call sites (client, receive timezone as a prop):** `src/components/quest-schedule-form.tsx`, `quest-template-form.tsx`, `long-rest.tsx`, `upkeep-task-form.tsx`.

**Untouched deliberately:** `src/lib/utils/schedule.ts`, `schedule-days.ts`, `schedule-summary.ts`, `schedule-gaps.ts`, `upkeep-planning.ts`, `generation-range.ts` — all pure Kind 2. And the two timestamp serializations named in Global Constraints.

---

## Task 1: The timezone-aware date primitives

Adds the new functions **alongside** the old ones. Nothing is removed yet, so the suite stays green and every existing call site still compiles.

**Files:**
- Modify: `src/lib/utils/dates.ts`
- Modify: `src/lib/utils/dates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `todayInZone(timeZone: string, now?: Date): string`
  - `weekStartOf(isoDate: string): string` — the Monday of that date's week
  - `weekEndOf(isoDate: string): string` — the Sunday of that date's week

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/dates.test.ts` (keep every existing test in the file — they cover `addDays`, which is already correct):

```ts
import { todayInZone, weekStartOf, weekEndOf } from "./dates";

describe("todayInZone", () => {
  it("gives the local day, not the UTC day, for an evening instant", () => {
    // 02:00 UTC on the 3rd is 20:00 on the 2nd in Denver. This exact case is
    // the bug: work logged after 5pm was being filed under tomorrow.
    const instant = new Date("2026-09-03T02:00:00Z");
    expect(todayInZone("America/Denver", instant)).toBe("2026-09-02");
  });

  it("gives the next day for a zone ahead of UTC at the same instant", () => {
    const instant = new Date("2026-09-02T20:00:00Z");
    expect(todayInZone("Pacific/Auckland", instant)).toBe("2026-09-03");
  });

  it("is the identity for UTC itself", () => {
    expect(todayInZone("UTC", new Date("2026-09-02T23:59:59Z"))).toBe("2026-09-02");
  });

  it("handles the spring-forward transition", () => {
    // 2026-03-08 is when America/Denver jumps from MST to MDT at 02:00 local.
    expect(todayInZone("America/Denver", new Date("2026-03-08T09:30:00Z"))).toBe("2026-03-08");
    expect(todayInZone("America/Denver", new Date("2026-03-08T06:30:00Z"))).toBe("2026-03-07");
  });

  it("handles the fall-back transition", () => {
    // 2026-11-01, MDT -> MST at 02:00 local.
    expect(todayInZone("America/Denver", new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
    expect(todayInZone("America/Denver", new Date("2026-11-01T05:30:00Z"))).toBe("2026-10-31");
  });

  it("handles a leap day", () => {
    expect(todayInZone("America/Denver", new Date("2028-02-29T18:00:00Z"))).toBe("2028-02-29");
  });

  it("pads single-digit months and days", () => {
    expect(todayInZone("UTC", new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });
});

describe("weekStartOf / weekEndOf", () => {
  it("returns the Monday and Sunday bracketing a midweek date", () => {
    // 2026-09-02 is a Wednesday.
    expect(weekStartOf("2026-09-02")).toBe("2026-08-31");
    expect(weekEndOf("2026-09-02")).toBe("2026-09-06");
  });

  it("treats Monday as the first day of its own week", () => {
    expect(weekStartOf("2026-08-31")).toBe("2026-08-31");
    expect(weekEndOf("2026-08-31")).toBe("2026-09-06");
  });

  it("treats Sunday as the LAST day of the preceding week, not the first of the next", () => {
    // The single most common off-by-one in week maths.
    expect(weekStartOf("2026-09-06")).toBe("2026-08-31");
    expect(weekEndOf("2026-09-06")).toBe("2026-09-06");
  });

  it("crosses a month boundary", () => {
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28");
  });

  it("crosses a year boundary", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });

  it("is a pure function of the date string, with no dependence on the host clock", () => {
    // Kind 2: same input, same output, regardless of where this runs.
    expect(weekStartOf("2026-09-02")).toBe(weekStartOf("2026-09-02"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/dates.test.ts`
Expected: FAIL — `todayInZone`, `weekStartOf`, `weekEndOf` are not exported.

- [ ] **Step 3: Add the implementations**

Append to `src/lib/utils/dates.ts`:

```ts
/**
 * The calendar date at a given instant, in a given IANA timezone.
 *
 * This is the ONLY function that turns an instant into a calendar date. Every
 * "what day is it?" in the app goes through it, because the answer depends
 * entirely on where the family lives: 02:00 UTC is still yesterday evening in
 * Denver, and already tomorrow in Auckland.
 *
 * `en-CA` is used because it formats as YYYY-MM-DD natively, and Intl handles
 * DST transitions correctly — which a stored UTC offset would not.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The Monday of the week containing `isoDate`.
 *
 * Calendar arithmetic, not an instant: the fixed frame keeps the answer the
 * same regardless of the host's timezone. Sunday belongs to the week that just
 * ended, matching how the rest of the app reads a week.
 */
export function weekStartOf(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const weekday = d.getUTCDay(); // 0 = Sunday
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(isoDate, delta);
}

/** The Sunday of the week containing `isoDate`. See `weekStartOf` for why Sunday ends the week. */
export function weekEndOf(isoDate: string): string {
  return addDays(weekStartOf(isoDate), 6);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/dates.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Prove the timezone behaviour is not an artifact of the host clock**

Run each of these — all must give identical results, because `todayInZone` takes the zone explicitly:

```bash
TZ=UTC npx vitest run src/lib/utils/dates.test.ts
TZ=America/Denver npx vitest run src/lib/utils/dates.test.ts
TZ=Pacific/Kiritimati npx vitest run src/lib/utils/dates.test.ts
```

Expected: all three PASS. If any fails, an implementation is reading the host clock somewhere it should not.

- [ ] **Step 6: Typecheck, full suite, commit**

```bash
npm run typecheck && npm test
git add src/lib/utils/dates.ts src/lib/utils/dates.test.ts
git commit -m "Add timezone-aware date primitives

todayInZone is the one place an instant becomes a calendar date, so the
answer can depend on where the family actually lives. weekStartOf and
weekEndOf replace the existing week helpers' mixed local/UTC arithmetic
with the fixed frame already used by addDays.

Added alongside the old functions; call sites migrate next.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The cached family-timezone lookup

**Files:**
- Create: `src/lib/services/family-timezone.ts`

**Interfaces:**
- Consumes: `getActiveFamilyId` / `requireFamilyAccess` patterns from `src/lib/auth/access.ts`.
- Produces:
  - `getFamilyTimezone(): Promise<string>` — the active family's zone, or `DEFAULT_TIMEZONE`
  - `getTimezoneForChild(childId: string): Promise<string>` — the owning family's zone
  - `DEFAULT_TIMEZONE = "America/Denver"`

- [ ] **Step 1: Read the memoization pattern you must match**

Open `src/lib/auth/access.ts` and read how `getActor` / `getMemberships` are wrapped in `cache()` from `react`. Match that exactly — this project's standing rule is that per-request lookups against the remote database are cached, and this value is read on nearly every render.

- [ ] **Step 2: Create the service**

```ts
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getActiveFamilyId } from "@/lib/auth/access";

/** Matches the schema default on `family.timezone`. */
export const DEFAULT_TIMEZONE = "America/Denver";

/**
 * The active family's timezone — the authority for every "what day is it?"
 * in the app.
 *
 * cache()-wrapped for the same reason getActor is: production runs against a
 * remote Turso database and this is read on nearly every render, so an
 * uncached lookup would add a round trip per component that asks.
 *
 * Falls back to the schema default rather than throwing: a page that cannot
 * resolve a family still has to render, and a wrong-by-a-few-hours date is a
 * better failure than a crash.
 */
export const getFamilyTimezone = cache(async function getFamilyTimezone(): Promise<string> {
  const familyId = await getActiveFamilyId();
  if (!familyId) return DEFAULT_TIMEZONE;

  const rows = await db
    .select({ timezone: schema.family.timezone })
    .from(schema.family)
    .where(eq(schema.family.id, familyId))
    .limit(1);

  return rows[0]?.timezone || DEFAULT_TIMEZONE;
});

/**
 * The timezone of the family owning a given child.
 *
 * Server actions frequently know a childId but not which family is "active" —
 * and a guardian may hold several. Resolving through the child keeps the date
 * correct in those paths.
 */
export const getTimezoneForChild = cache(async function getTimezoneForChild(
  childId: string
): Promise<string> {
  const rows = await db
    .select({ timezone: schema.family.timezone })
    .from(schema.child)
    .innerJoin(schema.family, eq(schema.child.familyId, schema.family.id))
    .where(eq(schema.child.id, childId))
    .limit(1);

  return rows[0]?.timezone || DEFAULT_TIMEZONE;
});
```

If `getActiveFamilyId` is not exported from `src/lib/auth/access.ts`, export it — it already exists there and is used by `src/lib/actions/family.ts`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: clean, suite unchanged. This task adds no behaviour yet — nothing calls it until Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/family-timezone.ts src/lib/auth/access.ts
git commit -m "Add cached family-timezone lookup

The Realm Timezone has been collected in settings and promised by the
walkthrough since launch, but never read. This is the accessor that
finally reads it.

cache()-wrapped like getActor: production is remote Turso and this is
needed on nearly every render. getTimezoneForChild exists because server
actions usually know a childId rather than which family is active.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migrate the server call sites

Every `formatDate(new Date())` on the server becomes `todayInZone(...)`. There are 14, listed exhaustively below — work through them in order.

**Files:**
- Modify: `src/lib/actions/activities.ts:15`, `:108`, `:224`, `:255`, `:282`
- Modify: `src/lib/actions/quests.ts:155`
- Modify: `src/lib/actions/quest-schedules.ts:64`, `:88`
- Modify: `src/lib/actions/upkeep-tasks.ts:212`
- Modify: `src/lib/actions/upkeep-schedules.ts:86`, `:109`
- Modify: `src/lib/actions/wages.ts:60`
- Modify: `src/app/(app)/quests/page.tsx:87`, `:164`
- Modify: `src/app/(app)/scrolls/page.tsx:101`
- Modify: `src/app/(app)/tavern/page.tsx:85`
- Modify: `src/app/(app)/tavern/parent-dashboard.tsx:27`, `:30`

**Interfaces:**
- Consumes: `todayInZone`, `addDays` (Task 1); `getFamilyTimezone`, `getTimezoneForChild` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Migrate the action files**

In each **server action**, the owning child is known, so use `getTimezoneForChild`. The pattern:

```ts
// before
await clearPendingUpkeepAssignmentsForTask(taskId, formatDate(new Date()));

// after
const timeZone = await getTimezoneForChild(childId);
await clearPendingUpkeepAssignmentsForTask(taskId, todayInZone(timeZone));
```

Per file:

- **`quests.ts:155`** (`deleteQuest`) — the quest's `childId` is available from the access guard's lookup; if not already in scope, select it alongside the existing query rather than adding a second round trip.
- **`quest-schedules.ts:64`, `:88`** — same, via the quest.
- **`upkeep-tasks.ts:212`** (`deleteUpkeepTask`) — same, via the task.
- **`upkeep-schedules.ts:86`, `:109`** — same, via the task.
- **`wages.ts:60`** (`recordWagePayout`) — `childId` is a parameter; use it directly.
- **`activities.ts:15`** — `const targetDate = date ?? todayInZone(await getTimezoneForChild(childId))`.
- **`activities.ts:108`** — `date: data.date ?? todayInZone(timeZone)`. **This is one of the two columns the Task 7 backfill corrects.**
- **`activities.ts:282`** — `lastActiveDate: todayInZone(timeZone)`. **The other backfilled column.**
- **`activities.ts:224`, `:255`** — these pass `windowStart`, a `Date` stepped backwards by arithmetic. That is **Kind 2**, not an instant. Replace by computing the window in date-string space: derive today with `todayInZone`, then step back with `addDays`. Do not reach for a `Date` object at all.

- [ ] **Step 2: Migrate the page files**

Pages resolve the family directly, so use `getFamilyTimezone()`:

```ts
// before
const todayDate = formatDate(new Date());

// after
const todayDate = todayInZone(await getFamilyTimezone());
```

Apply at `quests/page.tsx:87` and `:164`, `scrolls/page.tsx:101`, `tavern/page.tsx:85`.

**`tavern/parent-dashboard.tsx:26-30`** needs care. It is an **async server component** (no `"use client"`; rendered as `<ParentDashboard allChildren={...} />` from `tavern/page.tsx:80`), so it may call `getFamilyTimezone()` directly. Its current code is:

```ts
const today = formatDate(new Date());        // Kind 1
const weekOutDate = new Date();
weekOutDate.setDate(weekOutDate.getDate() + 6);
const weekOut = formatDate(weekOutDate);     // Kind 2 on a stepped Date
```

Rewrite entirely in date-string space — note it is **6** days, not 7:

```ts
const timeZone = await getFamilyTimezone();
const today = todayInZone(timeZone);
const weekOut = addDays(today, 6);
```

- [ ] **Step 3: Verify no server `formatDate(new Date())` remains**

Run:
```bash
grep -rn "formatDate(new Date())" src/lib src/app --include=*.ts --include=*.tsx | grep -v ".test."
```
Expected: **no output**.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm test && npm run build
git add -A
git commit -m "Derive server-side dates from the family's timezone

Every 'what day is it?' on the server now asks the family's Realm
Timezone instead of UTC. Work logged at 6pm in Denver is filed under
today, not tomorrow.

Window calculations that stepped a Date backwards move into date-string
arithmetic, which has no timezone to get wrong.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrate the client components

Four client components derive "today" from the browser. They must take the family's timezone as a prop instead, so a parent travelling sees the same day as their child at home.

**Files:**
- Modify: `src/components/quest-schedule-form.tsx:46`
- Modify: `src/components/quest-template-form.tsx:118`, `:141`
- Modify: `src/components/upkeep-task-form.tsx:62`
- Modify: `src/components/long-rest.tsx:22-26`, `:51-56`
- Modify: their server parents to pass the prop

**Interfaces:**
- Consumes: `todayInZone`, `addDays`, `weekStartOf`, `weekEndOf` (Task 1); `getFamilyTimezone` (Task 2).
- Produces: each component gains a required `timeZone: string` prop.

- [ ] **Step 1: Add the prop and use it**

For each component, add `timeZone: string` to its props type and replace the derivation:

```ts
// quest-schedule-form.tsx:46 — before
const defaultStartDate = schedule?.startDate ?? new Date().toISOString().slice(0, 10);
// after
const defaultStartDate = schedule?.startDate ?? todayInZone(timeZone);
```

```ts
// quest-template-form.tsx:118 and :141 — same shape
const defaultRepeatStartDate = schedule?.startDate ?? todayInZone(timeZone);
const today = todayInZone(timeZone);
```

```ts
// upkeep-task-form.tsx:62 — before
task?.schedule?.startDate ?? formatDate(new Date())
// after
task?.schedule?.startDate ?? todayInZone(timeZone)
```

- [ ] **Step 2: Delete `long-rest.tsx`'s duplicated Kind 3 helpers**

`long-rest.tsx` carries its own `addDays` (lines 22-26) and `getThisWeekStart` (lines 51-56), both mixed-frame and both off by one east of UTC+12 (see "Three patterns you will meet"). Delete both and import the shared ones:

```ts
import { addDays, weekStartOf, todayInZone } from "@/lib/utils/dates";
```

Replace `getThisWeekStart()` with `weekStartOf(todayInZone(timeZone))`. Every other use of the local `addDays` resolves to the shared one with no change at the call site — the signatures are identical.

- [ ] **Step 3: Thread the prop from each server parent**

Each parent page already has, or can call, `getFamilyTimezone()`. Pass `timeZone={timeZone}` down. `upkeep-task-form.tsx` is rendered by `upkeep-task-list.tsx`, which is rendered by `scrolls/page.tsx` — thread through both.

- [ ] **Step 4: Update the affected component tests**

`src/components/upkeep-task-form.test.tsx` and any other component test that renders one of these now needs a `timeZone` prop. Add `timeZone="America/Denver"` to the render helpers. This is a prop addition, not a behaviour change — no assertion should need altering. If one does, stop and say why in your report.

- [ ] **Step 5: Verify no client-side date derivation remains**

Run:
```bash
grep -rn "toISOString().slice(0, *10)\|toISOString().split(\"T\")\[0\]" src/components src/app --include=*.tsx | grep -v ".test."
```
Expected: **no output**.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm test && npm run build
git add -A
git commit -m "Derive client-side dates from the family's timezone

Date inputs and the week navigator took their default from the browser
clock, so a parent in another timezone saw a different 'today' than their
child. They now receive the family's timezone as a prop.

Also deletes long-rest.tsx's private addDays and getThisWeekStart, which
parsed local and formatted UTC — off by one for any family east of
UTC+12. The shared helpers have no such frame to mix.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Delete the UTC-deriving functions

Nothing should call them now. The compiler proves it.

**Files:**
- Modify: `src/lib/utils/dates.ts`
- Modify: `src/lib/utils/dates.test.ts`
- Modify: `src/app/(app)/quests/page.tsx:270-275`

**Interfaces:**
- Consumes: `weekStartOf`, `weekEndOf`, `todayInZone` (Task 1).
- Produces: `dates.ts` exports exactly `todayInZone`, `addDays`, `weekStartOf`, `weekEndOf`.

- [ ] **Step 1: Replace the last week-helper caller**

`src/app/(app)/quests/page.tsx:270` calls `getWeekStartDate()`, and `:271-275` inlines a Kind 3 week-end. Replace both:

```ts
const weekStart = week ?? weekStartOf(todayInZone(timeZone));
const weekEnd = weekEndOf(weekStart);
```

- [ ] **Step 2: Delete the functions**

From `src/lib/utils/dates.ts`, delete `formatDate`, `toISODate`, `getWeekStartDate`, and `getWeekEndDate` entirely. Do not deprecate them — a deprecated helper is one someone reaches for anyway.

`toISODate` has no callers at all outside this file; it is dead code either way.

- [ ] **Step 3: Let the compiler find anything missed**

Run: `npm run typecheck`
Expected: **clean**. Any error names a call site Tasks 3 or 4 missed — fix it there, using the Kind 1 / Kind 2 rule, not by restoring the deleted function.

- [ ] **Step 4: Update the date tests**

Remove tests in `src/lib/utils/dates.test.ts` that exercised the deleted functions. Every removal must be one of: a test of `formatDate`/`toISODate` (gone), or a test of `getWeekStartDate(Date)`/`getWeekEndDate(Date)` now covered by the `weekStartOf`/`weekEndOf` tests from Task 1. **List each removed test and which of those two reasons applies, in your report.** Do not remove a test that was asserting behaviour still expected.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm test && npm run build
git add -A
git commit -m "Remove the UTC-deriving date functions

formatDate answered 'what day is it?' with UTC, and the week helpers
computed in local time then formatted in UTC. Both are now unreachable,
so they are deleted rather than deprecated — a deprecated helper is one
someone reaches for anyway.

toISODate had no callers at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Architecture guard

Stops UTC date derivation coming back. Follows `src/test/upkeep-isolation.test.ts`, which already guards a different invariant the same way — read it first.

**Files:**
- Create: `src/test/date-frame.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A calendar date must never be derived from UTC.
 *
 * This decays silently: nothing fails loudly when someone writes
 * `new Date().toISOString().slice(0, 10)` — a family in Denver just starts
 * seeing their evening work filed under tomorrow again. So it is checked
 * structurally.
 *
 * `src/lib/utils/dates.ts` is the one place allowed to do this, because that
 * is where the conversion is deliberately implemented and tested.
 */
const DATE_MODULE = "src/lib/utils/dates.ts";

/**
 * Patterns that turn a value into a calendar date string.
 *
 * NOT forbidden: a bare `.toISOString()` serializing a timestamp for the
 * client. That is a real instant crossing the wire, not a calendar date —
 * `settings/page.tsx` and `parent-alerts.ts` both do it legitimately.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/, why: "derives a calendar date from UTC" },
  { pattern: /toISOString\(\)\s*\.\s*split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/, why: "derives a calendar date from UTC" },
];

/** Strips comments so prose explaining a construct is not mistaken for using it. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const rel = join(dir, entry);
    if (statSync(resolve(process.cwd(), rel)).isDirectory()) {
      sourceFiles(rel, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(rel);
    }
  }
  return found;
}

describe("calendar dates are never derived from UTC", () => {
  const files = sourceFiles("src").filter((f) => f !== DATE_MODULE);

  it("finds source files to check", () => {
    // Guards against the walk silently matching nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file outside the date module derives a calendar date from UTC", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} — ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still allows serializing a timestamp for the client", () => {
    // A bare toISOString() on an instant is legitimate and must not be caught.
    const legitimate = "createdAt: alert.createdAt.toISOString(),";
    for (const { pattern } of FORBIDDEN) {
      expect(pattern.test(legitimate)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/date-frame.test.ts`
Expected: PASS, 3 tests. If the second fails, it names a file Tasks 3-5 missed — fix that file, never the test.

- [ ] **Step 3: Prove the guard actually catches a regression**

Do not skip this. A guard nobody has seen fail is a guard nobody knows works.

```bash
printf 'export const d = new Date().toISOString().slice(0, 10);\n' > src/lib/utils/tmp-decoy.ts
npx vitest run src/test/date-frame.test.ts   # MUST fail, naming tmp-decoy.ts
rm src/lib/utils/tmp-decoy.ts
npx vitest run src/test/date-frame.test.ts   # MUST pass again
```

Paste both outcomes into your report.

- [ ] **Step 4: Commit**

```bash
git add src/test/date-frame.test.ts
git commit -m "Guard against UTC calendar-date derivation returning

The invariant decays silently — nothing fails loudly when someone writes
toISOString().slice(0,10) again, a family in Denver just quietly starts
seeing evening work filed under tomorrow. Checking it structurally makes
the regression a red test.

Deliberately does not forbid a bare toISOString(): serializing a real
instant for the client is legitimate and unrelated.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The backfill

Corrects historical rows written with the UTC bug. **Only two columns qualify**, and only some of their rows.

**Files:**
- Create: `src/lib/utils/backfill-dates.ts`
- Test: `src/lib/utils/backfill-dates.test.ts`
- Create: `scripts/backfill-timezone-dates.ts`

**Interfaces:**
- Consumes: `todayInZone` (Task 1).
- Produces:
  - `type DateRowCandidate = { storedDate: string; createdAt: Date }`
  - `correctedDate(row: DateRowCandidate, timeZone: string): string | null` — the corrected date, or `null` when the row must not be touched

**Which columns, and why only these:**

| Column | Backfill? | Reason |
|---|---|---|
| `activity_log.date` | **Yes** | Written as `data.date ?? formatDate(now)` — an instant when auto-derived |
| `child.last_active_date` | **Yes** | Always `formatDate(now)` — always an instant |
| `quest_assignment.date` | **No** | Comes from `getScheduledDates` — calendar arithmetic. Shifting it moves a Monday quest to Sunday |
| `upkeep_task_assignment.date` | **No** | Same, and Upkeep has never shipped, so there is no production data |
| `weekly_summary.week_start_date` | **No** | Derived from a week calculation, not an instant |
| `missed_subject.week_start_date` | **No** | Same |
| `wage_ledger_entry.date` | **No** | Upkeep has never shipped |
| `parent_alert.date` | **No** | Copied from an assignment's date |

- [ ] **Step 1: Write the failing test for the discriminator**

```ts
import { describe, it, expect } from "vitest";
import { correctedDate } from "./backfill-dates";

const TZ = "America/Denver";

describe("correctedDate", () => {
  it("corrects a row whose stored date matches the UTC date of its creation", () => {
    // 02:00 UTC on the 3rd was 20:00 on the 2nd in Denver. The stored date is
    // the UTC one, which is exactly the fingerprint of an auto-derived row.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-03", createdAt }, TZ)).toBe("2026-09-02");
  });

  it("leaves a deliberately backdated row alone", () => {
    // A parent logging Monday's work on Wednesday. The dates disagree, so this
    // was a choice, not the bug — touching it would rewrite real history.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-08-31", createdAt }, TZ)).toBeNull();
  });

  it("leaves a row alone when the UTC and local dates already agree", () => {
    // Logged at midday; no correction needed, so nothing is written.
    const createdAt = new Date("2026-09-02T18:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-02", createdAt }, TZ)).toBeNull();
  });

  it("corrects in the other direction for a zone ahead of UTC", () => {
    const createdAt = new Date("2026-09-02T20:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-02", createdAt }, "Pacific/Auckland")).toBe("2026-09-03");
  });

  it("never touches a row for a family already in UTC", () => {
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-03", createdAt }, "UTC")).toBeNull();
  });

  it("handles a null stored date by leaving it alone", () => {
    // child.last_active_date is nullable.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "", createdAt }, TZ)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/utils/backfill-dates.test.ts`
Expected: FAIL — cannot resolve `./backfill-dates`.

- [ ] **Step 3: Implement the discriminator**

```ts
import { todayInZone } from "@/lib/utils/dates";

export type DateRowCandidate = {
  /** The calendar date as stored. */
  storedDate: string;
  /** When the row was written — a real instant. */
  createdAt: Date;
};

/**
 * The date a row should have had, or null when it must not be touched.
 *
 * The hard part is telling a row the bug corrupted from a date a parent chose
 * on purpose, because the row records only the result. The fingerprint:
 *
 *   An auto-derived date always equals the UTC calendar date of createdAt,
 *   because that is literally how it was computed. A deliberately backdated
 *   one almost never does.
 *
 * So only matching rows are corrected. A parent who backdated to exactly the
 * UTC date the system would have picked is indistinguishable in principle —
 * and for them, the correction produces the date they would have got had the
 * bug never existed.
 *
 * Returns null when nothing should change, so the caller writes only real
 * corrections and the dry run reports only real differences.
 */
export function correctedDate(row: DateRowCandidate, timeZone: string): string | null {
  if (!row.storedDate) return null;

  const utcDate = todayInZone("UTC", row.createdAt);
  if (row.storedDate !== utcDate) return null; // deliberate; leave it

  const localDate = todayInZone(timeZone, row.createdAt);
  return localDate === row.storedDate ? null : localDate;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/utils/backfill-dates.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the script**

Create `scripts/backfill-timezone-dates.ts`. **Dry run is the default**; it writes only with `--apply`.

```ts
/**
 * Corrects calendar dates stored by the UTC-derivation bug.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx scripts/backfill-timezone-dates.ts
 *   npx tsx scripts/backfill-timezone-dates.ts --apply
 *
 * Only two columns qualify: activity_log.date and child.last_active_date.
 * Everything else derives from calendar arithmetic over a schedule, and
 * shifting those would move scheduled work to the wrong day.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { correctedDate } from "../src/lib/utils/backfill-dates";
import { DEFAULT_TIMEZONE } from "../src/lib/services/family-timezone";

const APPLY = process.argv.includes("--apply");

async function main() {
  const families = await db
    .select({ id: schema.family.id, timezone: schema.family.timezone })
    .from(schema.family);
  const zoneByFamily = new Map(families.map((f) => [f.id, f.timezone || DEFAULT_TIMEZONE]));

  const children = await db
    .select({ id: schema.child.id, familyId: schema.child.familyId, lastActiveDate: schema.child.lastActiveDate, updatedAt: schema.child.updatedAt })
    .from(schema.child);
  const zoneByChild = new Map(
    children.map((c) => [c.id, zoneByFamily.get(c.familyId) ?? DEFAULT_TIMEZONE])
  );

  let activityChanges = 0;
  const activities = await db
    .select({ id: schema.activityLog.id, childId: schema.activityLog.childId, date: schema.activityLog.date, createdAt: schema.activityLog.createdAt })
    .from(schema.activityLog);

  for (const row of activities) {
    const tz = zoneByChild.get(row.childId) ?? DEFAULT_TIMEZONE;
    const next = correctedDate({ storedDate: row.date, createdAt: row.createdAt }, tz);
    if (!next) continue;
    activityChanges++;
    console.log(`activity_log ${row.id}  ${row.date} -> ${next}  (${tz})`);
    if (APPLY) {
      await db.update(schema.activityLog).set({ date: next }).where(eq(schema.activityLog.id, row.id));
    }
  }

  let childChanges = 0;
  for (const c of children) {
    if (!c.lastActiveDate) continue;
    const tz = zoneByChild.get(c.id) ?? DEFAULT_TIMEZONE;
    // last_active_date has no created_at of its own; updatedAt is when it was last written.
    const next = correctedDate({ storedDate: c.lastActiveDate, createdAt: c.updatedAt }, tz);
    if (!next) continue;
    childChanges++;
    console.log(`child ${c.id}  last_active_date ${c.lastActiveDate} -> ${next}  (${tz})`);
    if (APPLY) {
      await db.update(schema.child).set({ lastActiveDate: next }).where(eq(schema.child.id, c.id));
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY RUN — nothing written"}: ` +
      `${activityChanges} activity_log rows, ${childChanges} children.`
  );
  if (!APPLY && activityChanges + childChanges > 0) {
    console.log("Re-run with --apply to write these changes.");
  }
  console.log(
    "\nNote: streaks are computed from activity_log.date, so a child's current " +
      "streak may change after applying. That is the bug being corrected."
  );
}

main();
```

- [ ] **Step 6: Exercise the script against the local database**

The dev database has demo data, so this is safe. Run the dry run and confirm it writes nothing:

```bash
npx tsx scripts/backfill-timezone-dates.ts
```

Then verify the database is untouched:

```bash
python3 -c "
import sqlite3; c=sqlite3.connect('local.db')
print('activity dates unchanged:', list(c.execute('select count(*) from activity_log')))
print('sample:', list(c.execute('select date from activity_log limit 3')))"
```

Record the dry-run output in your report. Do **not** run `--apply` against the local database — leave the demo data as you found it, and say so.

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck && npm test
git add src/lib/utils/backfill-dates.ts src/lib/utils/backfill-dates.test.ts scripts/backfill-timezone-dates.ts
git commit -m "Add dry-run backfill for UTC-derived stored dates

Corrects only the two columns actually derived from an instant, and only
rows whose stored date equals the UTC date of their creation — the
fingerprint of an auto-derived value. A parent's deliberate backdate does
not match and is never touched.

Scheduled dates are excluded entirely: they come from calendar arithmetic
over a schedule, so shifting them would move a Monday quest to Sunday.

Dry run by default; writes only with --apply.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Whole-feature verification

**Files:** none created; this task produces evidence.

- [ ] **Step 1: Full gate**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run lint` has pre-existing failures in unrelated files — report whether any NEW problem appears in files this plan touched, not the raw result.

- [ ] **Step 2: Prove the suite is host-timezone independent**

The whole point of this work is that dates stop depending on where the code runs. Run the full suite under three very different host clocks:

```bash
TZ=UTC npm test
TZ=America/Denver npm test
TZ=Pacific/Kiritimati npm test
```

Expected: **identical results, all passing**. A failure under one host timezone but not another means a Kind 1 or Kind 3 site was missed. This is the single most valuable check in the plan — do not skip it.

- [ ] **Step 3: Confirm no derivation remains**

```bash
grep -rn "formatDate\|toISOString().slice(0, *10)\|toISOString().split(\"T\")\[0\]" src/ --include=*.ts --include=*.tsx | grep -v ".test." | grep -v "utils/dates.ts"
```
Expected: **no output**.

- [ ] **Step 4: Manual check in a real browser**

Start the dev server and confirm the app still works end to end. Use the family's timezone setting to make the bug's absence visible:

1. `/settings` — set the Realm Timezone to `Pacific/Kiritimati` (UTC+14).
2. `/quests` — the day shown should be the Kiritimati date, which will differ from UTC for most of the day.
3. Set it back to `America/Denver` and confirm the day changes accordingly.
4. Log an activity and confirm it lands on the family's today, not UTC's.

Record what you saw. Restore the timezone setting and remove any test data.

- [ ] **Step 5: Report the user-visible consequence**

Write a short release note into your report — not into the repo — covering: dates now follow the Realm Timezone; families outside UTC may see a one-day shift in historical entries after the backfill is applied; and current streaks may change, because they are computed from those dates.

- [ ] **Step 6: Final commit if anything changed**

```bash
git add -A
git commit -m "Verify family-timezone dates across host timezones

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done

Follow up with `superpowers:requesting-code-review` before merging.
