# Upkeep Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional per-family chore-tracking module ("Upkeep") where parents assign recurring tasks with an optional dollar value and a required/optional flag, children complete them, and the app tracks wages earned and paid.

**Architecture:** Four new `upkeep_*` / `wage_ledger_entry` tables parallel to the existing quest tables, rather than a discriminator on `quest` — so no existing school query changes and chores cannot leak into the learning log, streaks, or school XP. All decision logic lives in pure, unit-tested modules under `src/lib/utils/`; server actions are thin shells that call them. Recurrence reuses the existing `getScheduledDates` unchanged, passing `schoolDays: null` so chores run on weekends.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Drizzle ORM over libSQL/Turso, TypeScript, Vitest + Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-02-upkeep-module-design.md` — read it alongside this plan.

## Global Constraints

- **Money is integer cents everywhere.** Columns are `valueCents` / `amountCents`. No floating-point arithmetic in the money path at any layer.
- **Children see gold pieces, parents see dollars.** 1 gp = 10 sp = 100 cp maps exactly onto dollars/dimes/cents. `1250` renders as `12 gp 5 sp` for a hero and `$12.50` for a parent.
- **`"use server"` files may export ONLY async functions.** Every shared constant, type, and pure helper goes in a plain module under `src/lib/utils/`. This is a hard project rule — a non-async export from an action file breaks the build.
- **Never touch school state.** No upkeep code may write `activity_log`, `child.currentXp`, `child.currentStreak`, or `child.longestStreak`. Chore XP goes to `child.upkeepXp` only. Task 13 adds an architecture test that enforces this by inspecting the source of every upkeep module.
- **Statuses are exactly:** `pending`, `awaiting_approval`, `completed`, `excused`. There is no child-facing skip. "Missed" is **derived** (`isRequired && status === "pending" && date < today`), never stored.
- **Wages never appear on any leaderboard.** The new `upkeep` leaderboard category ranks by `child.upkeepXp` and is labelled **"Steward's Renown"** with value label **"Renown"**.
- **Naming:** the section is "Upkeep", one item is a "task" in UI copy and `upkeepTask` in code.
- **Terminology in UI copy:** wages, Steward's Ledger, Steward's Renown.
- **Migrations:** after editing `src/lib/db/schema.ts`, run `npm run db:generate` then `npm run db:migrate`, and read the generated SQL in `src/lib/db/migrations/` before migrating. A hook may run migrate automatically — do not trust it silently.
- **Test command:** `npx vitest run <path>` for one file, `npm test` for the suite. `npm run typecheck` must pass before every commit.
- **Existing test suite has no database harness.** All tests in this plan are pure-function or component tests. Do not build a DB integration harness; instead push logic into the pure modules, which is why Tasks 1-5 exist.

---

## File Structure

**New pure modules** (no database, fully unit-tested — these hold every decision the feature makes):

| File | Responsibility |
|---|---|
| `src/lib/utils/wages.ts` | Money formatting, parsing, and summation. |
| `src/lib/utils/upkeep-status.ts` | Status types, the derived "missed" rule, and the transition table that decides all crediting. |
| `src/lib/utils/upkeep-enabled.ts` | Combines the family and per-child toggles. |
| `src/lib/utils/upkeep-planning.ts` | Which (task, date) assignment rows generation should insert. |

**Modified pure module:**

| File | Change |
|---|---|
| `src/lib/utils/assignment-pruning.ts` | Rename `questId` → `sourceId`, `questIsActive` → `sourceIsActive` so both quests and upkeep share it. |

**Schema:**

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `upkeepTask`, `upkeepTaskSchedule`, `upkeepTaskAssignment`, `wageLedgerEntry`; add 2 columns to `family`, 2 to `child`. |

**Server actions** (thin shells over the pure modules):

| File | Responsibility |
|---|---|
| `src/lib/actions/upkeep-settings.ts` | Family and per-child toggles; loading the enablement context. |
| `src/lib/actions/upkeep-tasks.ts` | Task template CRUD. |
| `src/lib/actions/upkeep-schedules.ts` | Task schedule upsert/delete. |
| `src/lib/actions/upkeep-assignments.ts` | Generation, reads, and status transitions. |
| `src/lib/actions/wages.ts` | Balance, ledger history, payouts. |
| `src/lib/services/upkeep-assignment-sync.ts` | Prunes stale pending assignments. Plain module, not an action file. |

**Modified server files:**

| File | Change |
|---|---|
| `src/lib/auth/access.ts` | Add `requireUpkeepTaskAccess`, `requireUpkeepAssignmentAccess`. |
| `src/lib/services/quest-assignment-sync.ts` | Update field names for the Task 5 rename. |
| `src/lib/actions/leaderboard.ts` | Add the `upkeep` category. |

**UI:**

| File | Responsibility |
|---|---|
| `src/components/upkeep-task-card.tsx` | One task row: wage, done control, notes, approve/reject. |
| `src/components/upkeep-today-list.tsx` | The child-facing Upkeep tab body. |
| `src/components/upkeep-task-form.tsx` | Parent's create/edit task form. |
| `src/components/upkeep-task-list.tsx` | Parent's task template list. |
| `src/components/stewards-ledger.tsx` | Balance, history, record-payment. |
| `src/components/upkeep-approval-queue.tsx` | Pending approvals. |
| `src/components/wages-panel.tsx` | Balance panel for the Loot page. |
| `src/app/(app)/settings/upkeep-settings-panel.tsx` | Family toggles. |
| `src/app/(app)/settings/child-upkeep-toggle.tsx` | Per-child toggle — a separate file because `child-list.tsx` is already 1350 lines. |

**Modified UI:**

| File | Change |
|---|---|
| `src/components/quest-view-tabs.tsx` | Add the conditional Upkeep tab. |
| `src/app/(app)/quests/page.tsx` | Render the Upkeep view. |
| `src/app/(app)/scrolls/page.tsx` | Add the parent Upkeep tab. |
| `src/app/(app)/loot/page.tsx` | Add the wages panel. |
| `src/app/(app)/settings/page.tsx` | Mount the family toggles. |
| `src/app/(app)/settings/child-list.tsx` | Mount the per-child toggle. |
| `src/components/leaderboard-tabs.tsx` | Add the Steward's Renown label. |
| `src/components/nav-items.ts` | Reword Quest Log's description. |

---

## Task 1: Wage money module

Money formatting, parsing and summation. Pure, no database. Everything else in the feature depends on this, so it goes first.

**Files:**
- Create: `src/lib/utils/wages.ts`
- Test: `src/lib/utils/wages.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatWagesAsCoin(cents: number): string`
  - `formatWagesAsDollars(cents: number): string`
  - `parseDollarsToCents(input: string): number` — throws `Error` on invalid input
  - `sumCents(entries: { amountCents: number }[]): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/wages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  formatWagesAsCoin,
  formatWagesAsDollars,
  parseDollarsToCents,
  sumCents,
} from "./wages";

describe("formatWagesAsCoin", () => {
  it("renders zero as 0 gp", () => {
    expect(formatWagesAsCoin(0)).toBe("0 gp");
  });

  it("renders whole dollars as gold only", () => {
    expect(formatWagesAsCoin(1200)).toBe("12 gp");
  });

  it("renders dimes as silver", () => {
    expect(formatWagesAsCoin(1250)).toBe("12 gp 5 sp");
  });

  it("renders a sub-dollar amount as silver only", () => {
    expect(formatWagesAsCoin(50)).toBe("5 sp");
  });

  it("renders odd cents as copper", () => {
    expect(formatWagesAsCoin(1253)).toBe("12 gp 5 sp 3 cp");
  });

  it("omits zero denominations in the middle", () => {
    expect(formatWagesAsCoin(1003)).toBe("10 gp 3 cp");
  });

  it("renders a single copper", () => {
    expect(formatWagesAsCoin(1)).toBe("1 cp");
  });

  it("renders negative amounts with a leading minus", () => {
    expect(formatWagesAsCoin(-500)).toBe("-5 gp");
  });
});

describe("formatWagesAsDollars", () => {
  it("renders zero", () => {
    expect(formatWagesAsDollars(0)).toBe("$0.00");
  });

  it("always shows two decimal places", () => {
    expect(formatWagesAsDollars(1250)).toBe("$12.50");
    expect(formatWagesAsDollars(1200)).toBe("$12.00");
    expect(formatWagesAsDollars(5)).toBe("$0.05");
  });

  it("puts the minus outside the dollar sign", () => {
    expect(formatWagesAsDollars(-500)).toBe("-$5.00");
  });
});

describe("parseDollarsToCents", () => {
  it("parses a plain dollar amount", () => {
    expect(parseDollarsToCents("12")).toBe(1200);
  });

  it("parses dollars and cents", () => {
    expect(parseDollarsToCents("12.50")).toBe(1250);
  });

  it("pads a single decimal place", () => {
    expect(parseDollarsToCents("12.5")).toBe(1250);
  });

  it("parses a leading-dot amount", () => {
    expect(parseDollarsToCents(".50")).toBe(50);
  });

  it("tolerates a dollar sign and surrounding whitespace", () => {
    expect(parseDollarsToCents("  $12.50 ")).toBe(1250);
  });

  it("rejects an empty string", () => {
    expect(() => parseDollarsToCents("")).toThrow();
  });

  it("rejects non-numeric input", () => {
    expect(() => parseDollarsToCents("abc")).toThrow();
  });

  it("rejects negative input — the caller decides the sign", () => {
    expect(() => parseDollarsToCents("-5")).toThrow();
  });

  it("rejects more than two decimal places", () => {
    expect(() => parseDollarsToCents("1.234")).toThrow();
  });
});

describe("sumCents", () => {
  it("is zero for no entries", () => {
    expect(sumCents([])).toBe(0);
  });

  it("nets earned against payouts", () => {
    expect(
      sumCents([
        { amountCents: 500 },
        { amountCents: 250 },
        { amountCents: -300 },
      ])
    ).toBe(450);
  });

  it("goes negative when a parent overpays", () => {
    expect(sumCents([{ amountCents: 200 }, { amountCents: -500 }])).toBe(-300);
  });

  it("nets an earned and its reversal to zero", () => {
    expect(sumCents([{ amountCents: 250 }, { amountCents: -250 }])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/wages.test.ts`
Expected: FAIL — cannot resolve `./wages`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/wages.ts`:

```ts
/**
 * Wages are stored as signed integer cents everywhere — never floats. This
 * module is the only place that converts between cents and something a human
 * reads or types.
 *
 * Children see gold pieces because D&D's own ratios (1 gp = 10 sp = 100 cp)
 * land exactly on dollars, dimes and cents, so no exchange rate is invented.
 * Parents see the real currency, because they are the ones actually paying.
 */

/** Renders cents as coin for heroes: 1250 -> "12 gp 5 sp". */
export function formatWagesAsCoin(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));

  const gp = Math.floor(abs / 100);
  const sp = Math.floor((abs % 100) / 10);
  const cp = abs % 10;

  const parts: string[] = [];
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (cp) parts.push(`${cp} cp`);
  // An all-zero amount still needs to say something.
  if (parts.length === 0) return "0 gp";

  return sign + parts.join(" ");
}

/** Renders cents as currency for grown-ups: 1250 -> "$12.50". */
export function formatWagesAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Parses a parent-typed dollar amount into whole cents.
 *
 * Deliberately rejects negatives: a payout is entered as a positive amount and
 * negated by the caller that writes it, so the sign convention lives in exactly
 * one place instead of depending on how someone typed it.
 */
export function parseDollarsToCents(input: string): number {
  const trimmed = input.trim().replace(/^\$/, "");
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) throw new Error("Enter an amount like 2.50");

  const [, whole, frac] = match;
  if (!whole && frac === undefined) throw new Error("Enter an amount like 2.50");

  const dollars = whole ? parseInt(whole, 10) : 0;
  const cents = frac ? parseInt(frac.padEnd(2, "0"), 10) : 0;
  return dollars * 100 + cents;
}

/**
 * Nets a set of ledger rows. Used for two things that are the same sum over
 * different rows: a child's balance (all their entries) and one assignment's
 * net (its entries only — zero means nothing is currently owed for it).
 */
export function sumCents(entries: { amountCents: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/wages.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/utils/wages.ts src/lib/utils/wages.test.ts
git commit -m "Add wage money module for the Upkeep feature

Money is integer cents everywhere. Children see D&D coin (1 gp = 10 sp =
100 cp maps exactly onto dollars/dimes/cents, so no exchange rate is
invented); parents see currency. parseDollarsToCents rejects negatives so
the payout sign convention lives in one place.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Upkeep status module

The status vocabulary, the derived "missed" rule, and the transition table that decides every wage and XP side effect. Pure, no database.

**Files:**
- Create: `src/lib/utils/upkeep-status.ts`
- Test: `src/lib/utils/upkeep-status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type UpkeepStatus = "pending" | "awaiting_approval" | "completed" | "excused"`
  - `type DerivedUpkeepStatus = UpkeepStatus | "missed"`
  - `type UpkeepCredit = { postWages: boolean; reverseWages: boolean; grantXp: boolean; revokeXp: boolean }`
  - `type UpkeepDaySummary = { total: number; done: number; awaitingApproval: number; missed: number }`
  - `deriveUpkeepStatus(assignment: { status: UpkeepStatus; date: string }, task: { isRequired: boolean }, today: string): DerivedUpkeepStatus`
  - `resolveUpkeepTransition(prev: UpkeepStatus, next: UpkeepStatus): UpkeepCredit`
  - `summarizeUpkeepDay(rows: { assignment: { status: UpkeepStatus; date: string }; task: { isRequired: boolean } }[], today: string): UpkeepDaySummary`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/upkeep-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveUpkeepStatus,
  resolveUpkeepTransition,
  summarizeUpkeepDay,
  type UpkeepStatus,
} from "./upkeep-status";

const TODAY = "2026-09-02";

function row(status: UpkeepStatus, date: string, isRequired = true) {
  return { assignment: { status, date }, task: { isRequired } };
}

describe("deriveUpkeepStatus", () => {
  it("reports a required past pending task as missed", () => {
    const r = row("pending", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("missed");
  });

  it("never reports an optional task as missed", () => {
    const r = row("pending", "2026-09-01", false);
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("does not report today's pending task as missed", () => {
    const r = row("pending", TODAY);
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("does not report a future pending task as missed", () => {
    const r = row("pending", "2026-09-03");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("pending");
  });

  it("leaves a past completed task alone", () => {
    const r = row("completed", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("completed");
  });

  it("leaves a past excused task alone", () => {
    const r = row("excused", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("excused");
  });

  it("does not report a past task awaiting approval as missed", () => {
    const r = row("awaiting_approval", "2026-09-01");
    expect(deriveUpkeepStatus(r.assignment, r.task, TODAY)).toBe("awaiting_approval");
  });
});

describe("resolveUpkeepTransition", () => {
  it("credits when a task is completed directly", () => {
    expect(resolveUpkeepTransition("pending", "completed")).toEqual({
      postWages: true,
      reverseWages: false,
      grantXp: true,
      revokeXp: false,
    });
  });

  it("credits when an approval completes the task", () => {
    expect(resolveUpkeepTransition("awaiting_approval", "completed")).toEqual({
      postWages: true,
      reverseWages: false,
      grantXp: true,
      revokeXp: false,
    });
  });

  it("credits nothing when a child submits for approval", () => {
    expect(resolveUpkeepTransition("pending", "awaiting_approval")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("credits nothing on rejection back to pending", () => {
    expect(resolveUpkeepTransition("awaiting_approval", "pending")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("credits nothing when a task is excused", () => {
    expect(resolveUpkeepTransition("pending", "excused")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("does not double-pay a task that is already completed", () => {
    expect(resolveUpkeepTransition("completed", "completed")).toEqual({
      postWages: false,
      reverseWages: false,
      grantXp: false,
      revokeXp: false,
    });
  });

  it("reverses when a completed task is un-completed", () => {
    expect(resolveUpkeepTransition("completed", "pending")).toEqual({
      postWages: false,
      reverseWages: true,
      grantXp: false,
      revokeXp: true,
    });
  });

  it("reverses when a completed task is later excused", () => {
    expect(resolveUpkeepTransition("completed", "excused")).toEqual({
      postWages: false,
      reverseWages: true,
      grantXp: false,
      revokeXp: true,
    });
  });
});

describe("summarizeUpkeepDay", () => {
  it("is all zeroes for no rows", () => {
    expect(summarizeUpkeepDay([], TODAY)).toEqual({
      total: 0,
      done: 0,
      awaitingApproval: 0,
      missed: 0,
    });
  });

  it("counts each derived status", () => {
    const rows = [
      row("completed", TODAY),
      row("completed", TODAY),
      row("awaiting_approval", TODAY),
      row("pending", TODAY),
      row("pending", "2026-09-01"), // required + past = missed
      row("pending", "2026-09-01", false), // optional + past = not missed
      row("excused", TODAY),
    ];
    expect(summarizeUpkeepDay(rows, TODAY)).toEqual({
      total: 7,
      done: 2,
      awaitingApproval: 1,
      missed: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/upkeep-status.test.ts`
Expected: FAIL — cannot resolve `./upkeep-status`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/upkeep-status.ts`:

```ts
/**
 * The status vocabulary for upkeep tasks, and the two rules that everything
 * else in the module defers to.
 *
 * There is deliberately no child-facing "skipped": a quest has skip/stuck
 * because a hero needs to say "I couldn't do this schoolwork, and here's why",
 * but an undone chore is simply undone. "excused" is the parent's counterpart
 * ("we were travelling") and is the only way to retire a task without claiming
 * the work happened.
 */

export type UpkeepStatus =
  | "pending"
  | "awaiting_approval"
  | "completed"
  | "excused";

/** A stored status, plus "missed" — which is computed, never written down. */
export type DerivedUpkeepStatus = UpkeepStatus | "missed";

/** What a status change owes the child, decided in one place. */
export type UpkeepCredit = {
  postWages: boolean;
  reverseWages: boolean;
  grantXp: boolean;
  revokeXp: boolean;
};

export type UpkeepDaySummary = {
  total: number;
  done: number;
  awaitingApproval: number;
  missed: number;
};

/**
 * "Missed" is derived rather than stored: a required task whose day has passed
 * while still pending. Keeping it computed means no nightly sweep, no extra
 * status, and no state that can drift out of sync with the calendar.
 *
 * Optional tasks are never missed — that is the whole of what optional means.
 */
export function deriveUpkeepStatus(
  assignment: { status: UpkeepStatus; date: string },
  task: { isRequired: boolean },
  today: string
): DerivedUpkeepStatus {
  if (
    assignment.status === "pending" &&
    task.isRequired &&
    assignment.date < today
  ) {
    return "missed";
  }
  return assignment.status;
}

/**
 * The single guard against double-paying. Wages and XP move only when a task
 * crosses into or out of `completed`; every other transition is inert, so
 * re-approving, re-saving, or a duplicated request costs nothing.
 */
export function resolveUpkeepTransition(
  prev: UpkeepStatus,
  next: UpkeepStatus
): UpkeepCredit {
  const becameComplete = prev !== "completed" && next === "completed";
  const stoppedBeingComplete = prev === "completed" && next !== "completed";

  return {
    postWages: becameComplete,
    grantXp: becameComplete,
    reverseWages: stoppedBeingComplete,
    revokeXp: stoppedBeingComplete,
  };
}

/** Counts for the parent's at-a-glance header. */
export function summarizeUpkeepDay(
  rows: {
    assignment: { status: UpkeepStatus; date: string };
    task: { isRequired: boolean };
  }[],
  today: string
): UpkeepDaySummary {
  const summary: UpkeepDaySummary = {
    total: rows.length,
    done: 0,
    awaitingApproval: 0,
    missed: 0,
  };

  for (const row of rows) {
    const status = deriveUpkeepStatus(row.assignment, row.task, today);
    if (status === "completed") summary.done++;
    else if (status === "awaiting_approval") summary.awaitingApproval++;
    else if (status === "missed") summary.missed++;
  }

  return summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/upkeep-status.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/utils/upkeep-status.ts src/lib/utils/upkeep-status.test.ts
git commit -m "Add upkeep status module

Holds the two rules the rest of the feature defers to: 'missed' is derived
(required + past + pending) rather than stored, so no sweep job is needed;
and resolveUpkeepTransition gates all wage/XP movement on crossing into or
out of completed, which is the single guard against double-paying.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Enablement helper

The one place the family and per-child toggles are combined.

**Files:**
- Create: `src/lib/utils/upkeep-enabled.ts`
- Test: `src/lib/utils/upkeep-enabled.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isUpkeepEnabled(family: { upkeepEnabled: boolean } | null | undefined, child: { upkeepEnabled: boolean } | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/upkeep-enabled.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isUpkeepEnabled } from "./upkeep-enabled";

describe("isUpkeepEnabled", () => {
  it("is on when both toggles are on", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, { upkeepEnabled: true })).toBe(true);
  });

  it("is off when the family toggle is off, whatever the child says", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: false }, { upkeepEnabled: true })).toBe(false);
  });

  it("is off when the child is opted out", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, { upkeepEnabled: false })).toBe(false);
  });

  it("is off when there is no family", () => {
    expect(isUpkeepEnabled(null, { upkeepEnabled: true })).toBe(false);
  });

  it("is off when there is no child", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, null)).toBe(false);
  });

  it("is off when both are missing", () => {
    expect(isUpkeepEnabled(undefined, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/upkeep-enabled.test.ts`
Expected: FAIL — cannot resolve `./upkeep-enabled`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/upkeep-enabled.ts`:

```ts
/**
 * Upkeep is gated by two switches: the family's master toggle (off by default)
 * and a per-child toggle (on by default, so flipping the family switch works
 * immediately for every hero and parents opt individual children *out*).
 *
 * Every surface — nav copy, tabs, server actions, assignment generation — asks
 * this one function, so there is no second opinion about whether chores are on.
 */
export function isUpkeepEnabled(
  family: { upkeepEnabled: boolean } | null | undefined,
  child: { upkeepEnabled: boolean } | null | undefined
): boolean {
  return Boolean(family?.upkeepEnabled && child?.upkeepEnabled);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/upkeep-enabled.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/utils/upkeep-enabled.ts src/lib/utils/upkeep-enabled.test.ts
git commit -m "Add upkeep enablement helper

Single source of truth for combining the family master toggle with the
per-child opt-out, so no surface can form its own opinion about whether
chores are on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Assignment planning module

Decides which (task, date) rows generation should insert. Pure, so the one behaviour that most distinguishes chores from quests — running on weekends — is testable without a database.

**Files:**
- Create: `src/lib/utils/upkeep-planning.ts`
- Test: `src/lib/utils/upkeep-planning.test.ts`

**Interfaces:**
- Consumes: `getScheduledDates` from `src/lib/utils/schedule.ts` (already exists, unchanged).
- Produces:
  - `type UpkeepScheduleShape = { frequency: "once" | "daily" | "weekly" | "monthly"; daysOfWeek: string | null; intervalWeeks: number | null; startDate: string; endDate: string | null }`
  - `type PlannableTask = { taskId: string; schedule: UpkeepScheduleShape }`
  - `planUpkeepAssignments(tasks: PlannableTask[], existingKeys: Set<string>, rangeStart: string, rangeEnd: string): { taskId: string; date: string }[]`
  - `assignmentKey(taskId: string, date: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/upkeep-planning.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  assignmentKey,
  planUpkeepAssignments,
  type PlannableTask,
} from "./upkeep-planning";

function daily(taskId: string, startDate = "2026-09-01"): PlannableTask {
  return {
    taskId,
    schedule: {
      frequency: "daily",
      daysOfWeek: null,
      intervalWeeks: null,
      startDate,
      endDate: null,
    },
  };
}

describe("planUpkeepAssignments", () => {
  it("plans a daily task across the whole range including the weekend", () => {
    // 2026-09-05 is a Saturday and 2026-09-06 a Sunday. Chores are not limited
    // to school days, which is the key divergence from quest generation.
    const result = planUpkeepAssignments(
      [daily("t1")],
      new Set(),
      "2026-09-04",
      "2026-09-07"
    );
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-06" },
      { taskId: "t1", date: "2026-09-07" },
    ]);
  });

  it("skips dates that already have an assignment", () => {
    const existing = new Set([assignmentKey("t1", "2026-09-05")]);
    const result = planUpkeepAssignments(
      [daily("t1")],
      existing,
      "2026-09-04",
      "2026-09-06"
    );
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-06" },
    ]);
  });

  it("is idempotent — replanning over its own output produces nothing", () => {
    const first = planUpkeepAssignments([daily("t1")], new Set(), "2026-09-04", "2026-09-06");
    const keys = new Set(first.map((r) => assignmentKey(r.taskId, r.date)));
    const second = planUpkeepAssignments([daily("t1")], keys, "2026-09-04", "2026-09-06");
    expect(second).toEqual([]);
  });

  it("honours weekly daysOfWeek", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: JSON.stringify(["sat"]),
        intervalWeeks: 1,
        startDate: "2026-09-01",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-14");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-12" },
    ]);
  });

  it("honours an every-other-week interval", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: JSON.stringify(["sat"]),
        intervalWeeks: 2,
        startDate: "2026-09-05",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-30");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-05" },
      { taskId: "t1", date: "2026-09-19" },
    ]);
  });

  it("stops at the schedule's end date", () => {
    const task = daily("t1");
    task.schedule.endDate = "2026-09-05";
    const result = planUpkeepAssignments([task], new Set(), "2026-09-04", "2026-09-08");
    expect(result).toEqual([
      { taskId: "t1", date: "2026-09-04" },
      { taskId: "t1", date: "2026-09-05" },
    ]);
  });

  it("plans a one-off on exactly its start date", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "once",
        daysOfWeek: null,
        intervalWeeks: null,
        startDate: "2026-09-05",
        endDate: null,
      },
    };
    const result = planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-30");
    expect(result).toEqual([{ taskId: "t1", date: "2026-09-05" }]);
  });

  it("plans several tasks together", () => {
    const result = planUpkeepAssignments(
      [daily("t1"), daily("t2")],
      new Set([assignmentKey("t2", "2026-09-04")]),
      "2026-09-04",
      "2026-09-04"
    );
    expect(result).toEqual([{ taskId: "t1", date: "2026-09-04" }]);
  });

  it("tolerates malformed daysOfWeek JSON without throwing", () => {
    const task: PlannableTask = {
      taskId: "t1",
      schedule: {
        frequency: "weekly",
        daysOfWeek: "not json",
        intervalWeeks: 1,
        startDate: "2026-09-01",
        endDate: null,
      },
    };
    expect(planUpkeepAssignments([task], new Set(), "2026-09-01", "2026-09-14")).toEqual([]);
  });

  it("plans nothing for no tasks", () => {
    expect(planUpkeepAssignments([], new Set(), "2026-09-01", "2026-09-30")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/upkeep-planning.test.ts`
Expected: FAIL — cannot resolve `./upkeep-planning`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/upkeep-planning.ts`:

```ts
import { getScheduledDates } from "@/lib/utils/schedule";

/** A task schedule as it is stored — daysOfWeek is still a JSON string here. */
export type UpkeepScheduleShape = {
  frequency: "once" | "daily" | "weekly" | "monthly";
  daysOfWeek: string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

export type PlannableTask = {
  taskId: string;
  schedule: UpkeepScheduleShape;
};

/** Stable key for "this task on this day", used to dedupe against existing rows. */
export function assignmentKey(taskId: string, date: string): string {
  return `${taskId}:${date}`;
}

function parseDaysOfWeek(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    // A corrupt column must not take assignment generation down for the whole
    // family; the schedule simply plans nothing until it is fixed.
    return null;
  }
}

/**
 * Expands every task's schedule across [rangeStart, rangeEnd] and returns the
 * rows that do not exist yet.
 *
 * `getScheduledDates` is reused exactly as quests use it, with one difference
 * that is the whole point: `schoolDays` is null, so chores are planned on every
 * day the pattern names — weekends and school breaks included.
 */
export function planUpkeepAssignments(
  tasks: PlannableTask[],
  existingKeys: Set<string>,
  rangeStart: string,
  rangeEnd: string
): { taskId: string; date: string }[] {
  const planned: { taskId: string; date: string }[] = [];
  const seen = new Set(existingKeys);

  for (const task of tasks) {
    const dates = getScheduledDates(
      task.schedule.frequency,
      parseDaysOfWeek(task.schedule.daysOfWeek),
      task.schedule.intervalWeeks,
      task.schedule.startDate,
      task.schedule.endDate,
      rangeStart,
      rangeEnd,
      null // chores are never limited to school days
    );

    for (const date of dates) {
      const key = assignmentKey(task.taskId, date);
      if (seen.has(key)) continue;
      seen.add(key);
      planned.push({ taskId: task.taskId, date });
    }
  }

  return planned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/upkeep-planning.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/utils/upkeep-planning.ts src/lib/utils/upkeep-planning.test.ts
git commit -m "Add upkeep assignment planning module

Reuses getScheduledDates unchanged with schoolDays: null, which is the
whole divergence from quest generation — chores run on weekends and
through school breaks. Keeping the expansion pure makes that testable
without a database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Share the pruning module between quests and upkeep

`findStaleAssignmentIds` is already domain-agnostic apart from two field names. Rename them so upkeep can use it instead of growing a second copy.

**Files:**
- Modify: `src/lib/utils/assignment-pruning.ts`
- Modify: `src/lib/utils/assignment-pruning.test.ts`
- Modify: `src/lib/services/quest-assignment-sync.ts` (the only caller)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PendingAssignmentRow` with fields `{ id: string; sourceId: string; date: string; sourceIsActive: boolean; schedule: PruneSchedule | null }` — was `questId` / `questIsActive`.

- [ ] **Step 1: Rename in the test first**

In `src/lib/utils/assignment-pruning.test.ts`, rename every occurrence of the row field `questId` to `sourceId` and `questIsActive` to `sourceIsActive`. Do not change any assertion or any behaviour — only the two field names.

```bash
sed -i 's/\bquestId\b/sourceId/g; s/\bquestIsActive\b/sourceIsActive/g' src/lib/utils/assignment-pruning.test.ts
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/assignment-pruning.test.ts`
Expected: FAIL — TypeScript object-literal errors, or assertions failing because rows no longer carry the field the implementation reads.

- [ ] **Step 3: Rename in the implementation**

```bash
sed -i 's/\bquestId\b/sourceId/g; s/\bquestIsActive\b/sourceIsActive/g; s/scheduledDatesByQuestId/scheduledDatesBySourceId/g' src/lib/utils/assignment-pruning.ts
```

Then update the doc comment on `findStaleAssignmentIds` so it no longer says "quest". Replace the existing comment block above `export function findStaleAssignmentIds` with:

```ts
/**
 * Decides which already-materialized `pending` assignments no longer belong to
 * the plan, so removing the thing that generated them — or its repeat —
 * actually clears it out of the day's list instead of leaving orphan rows.
 *
 * Shared by quests and upkeep tasks: `sourceId` is whichever template owns the
 * assignment. Only `pending` rows should ever be handed in — completed rows are
 * the child's history and must survive a template being retired.
 *
 * Three rules, in order:
 *  - The source was removed (soft-deleted) -> every pending row is stale.
 *  - The source still has a schedule -> a pending row is stale unless the
 *    schedule, as it reads today, still calls for that date. This prunes
 *    leftovers when a repeat is narrowed or given an end date.
 *  - The source has no schedule -> keep. Unscheduled templates produce ad hoc
 *    assignments that are never the scheduler's to delete.
 */
```

- [ ] **Step 4: Update the one caller**

In `src/lib/services/quest-assignment-sync.ts`, `loadPendingRows` builds the row objects. Change its return mapping so the two renamed fields are produced:

```ts
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.questId,
    date: r.date,
    sourceIsActive: r.questIsActive,
    schedule: r.scheduleId
      ? {
          frequency: r.frequency!,
          daysOfWeek: r.daysOfWeek,
          intervalWeeks: r.intervalWeeks,
          startDate: r.scheduleStartDate!,
          endDate: r.scheduleEndDate,
        }
      : null,
  }));
```

The `.select({...})` above it keeps its own `questId` / `questIsActive` aliases — those name Drizzle columns, not the shared row shape.

- [ ] **Step 5: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS — every previously passing test still passes. This rename must be behaviour-neutral.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/utils/assignment-pruning.ts src/lib/utils/assignment-pruning.test.ts src/lib/services/quest-assignment-sync.ts
git commit -m "Generalize assignment pruning to any scheduled source

findStaleAssignmentIds was already domain-agnostic apart from two field
names. Renaming questId to sourceId lets the upkeep module reuse it rather
than growing a second copy of the staleness rules. Behaviour-neutral.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Schema and migration

Four new tables plus four new columns. Additive only — every new column has a default, so no backfill is needed.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create (generated): `src/lib/db/migrations/*.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `schema.upkeepTask`, `schema.upkeepTaskSchedule`, `schema.upkeepTaskAssignment`, `schema.wageLedgerEntry`; `family.upkeepEnabled`, `family.upkeepRequiresApproval`, `child.upkeepEnabled`, `child.upkeepXp`.

- [ ] **Step 1: Add the two family columns**

In `src/lib/db/schema.ts`, inside the `family` table definition, after `loginCode`:

```ts
    // ── Upkeep (chores) ──────────────────────────────────────────
    // Master switch for the optional chore-tracking module. Off by default:
    // families who never turn it on must see no trace of it.
    upkeepEnabled: integer("upkeep_enabled", { mode: "boolean" }).notNull().default(false),
    // When on, a hero marking a task done lands it in `awaiting_approval`
    // rather than `completed`, and no wages post until a grown-up confirms.
    upkeepRequiresApproval: integer("upkeep_requires_approval", { mode: "boolean" })
      .notNull()
      .default(false),
```

- [ ] **Step 2: Add the two child columns**

In the `child` table definition, after `schoolingModeOverrides`:

```ts
    // ── Upkeep (chores) ──────────────────────────────────────────
    // Per-hero opt-out, under the family's master switch. Defaults to true so
    // that turning the module on for a family immediately works for everyone
    // and a parent opts individual heroes out, rather than the module
    // appearing to do nothing when it is first enabled.
    upkeepEnabled: integer("upkeep_enabled", { mode: "boolean" }).notNull().default(true),
    // Chore XP is deliberately its own column, never folded into currentXp:
    // activities.ts recomputes currentXp as (activity count x 10) + bonusXp
    // whenever schoolwork is logged, which would silently erase it.
    upkeepXp: integer("upkeep_xp").notNull().default(0),
```

- [ ] **Step 3: Add the four tables**

Append to the end of `src/lib/db/schema.ts`:

```ts
// ── Upkeep (chores) ─────────────────────────────────────────

/**
 * A chore a parent has defined for one hero. The template, not the doing of it
 * — `upkeepTaskAssignment` holds a specific day's instance.
 *
 * Kept entirely separate from `quest` rather than sharing it behind a
 * discriminator: chores must never be able to reach the learning log, the
 * streak, or school XP, and separate tables make that structural instead of a
 * filter someone can forget.
 */
export const upkeepTask = sqliteTable(
  "upkeep_task",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // Null means an unpaid task: it shows no wages and posts nothing to the
    // ledger. The money is optional, the chore is not.
    valueCents: integer("value_cents"),
    // False marks a nice-to-have: it still pays and still grants XP when done,
    // but it never reads as missed and never counts as outstanding.
    isRequired: integer("is_required", { mode: "boolean" }).notNull().default(true),
    rewardXp: integer("reward_xp"),
    estimatedMinutes: integer("estimated_minutes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("upkeep_task_child_active_idx").on(table.childId, table.isActive),
  ]
);

/** How often a task recurs. Same shape as questSchedule, minus school days. */
export const upkeepTaskSchedule = sqliteTable("upkeep_task_schedule", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => upkeepTask.id, { onDelete: "cascade" }),
  frequency: text("frequency", { enum: ["once", "daily", "weekly", "monthly"] }).notNull(),
  daysOfWeek: text("days_of_week"), // JSON array e.g. ["sat"]; used when weekly
  intervalWeeks: integer("interval_weeks"), // used when weekly; 1 = every week
  startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
  endDate: text("end_date"), // null = indefinite
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * One materialized row per (task, day).
 *
 * There is no "skipped": a quest has skip/stuck because a hero needs to explain
 * unfinished schoolwork, but an undone chore is simply undone and derives as
 * missed. "excused" is the parent's counterpart — the only way to retire a
 * task without claiming the work happened.
 *
 * "missed" is NOT a status here. It is derived (required + past + pending) so
 * the feature needs no sweep job and no state that can drift.
 */
export const upkeepTaskAssignment = sqliteTable(
  "upkeep_task_assignment",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => upkeepTask.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO YYYY-MM-DD
    status: text("status", {
      enum: ["pending", "awaiting_approval", "completed", "excused"],
    })
      .notNull()
      .default("pending"),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    // Not foreign keys: a PIN hero has no row in `user` (they are recorded as
    // "child:<id>"), and the demo actor has none either. Same reasoning as
    // parentAlertDismissal.userId.
    completedByUserId: text("completed_by_user_id"),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    approvedByUserId: text("approved_by_user_id"),
    notes: text("notes"),
    // Why it was excused, or why an approval was turned down.
    statusReason: text("status_reason"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("upkeep_assignment_child_task_date_idx").on(
      table.childId,
      table.taskId,
      table.date
    ),
    index("upkeep_assignment_child_date_idx").on(table.childId, table.date),
    index("upkeep_assignment_child_status_idx").on(
      table.childId,
      table.status,
      table.date
    ),
  ]
);

/**
 * Append-only record of wages. Never updated, never deleted.
 *
 * Un-completing a paid task posts a `reversal` rather than removing the
 * `earned` row, so history stays auditable and the balance is always plainly
 * SUM(amount_cents).
 *
 * `taskTitle` is snapshotted rather than joined, for the same reason
 * parentAlert copies its quest details in: a ledger line has to still read
 * correctly after the task is renamed or retired.
 */
export const wageLedgerEntry = sqliteTable(
  "wage_ledger_entry",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["earned", "payout", "reversal"] }).notNull(),
    // Signed: earned positive, payout and reversal negative.
    amountCents: integer("amount_cents").notNull(),
    taskAssignmentId: text("task_assignment_id").references(
      () => upkeepTaskAssignment.id,
      { onDelete: "set null" }
    ),
    taskTitle: text("task_title"),
    date: text("date").notNull(), // ISO YYYY-MM-DD
    note: text("note"),
    createdByUserId: text("created_by_user_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("wage_ledger_child_idx").on(table.childId, table.createdAt),
    index("wage_ledger_assignment_idx").on(table.taskAssignmentId),
  ]
);
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new `.sql` file appears under `src/lib/db/migrations/`.

- [ ] **Step 5: Read the generated SQL before applying it**

Run: `cat src/lib/db/migrations/$(ls -t src/lib/db/migrations | head -1)`

Verify by eye:
- Four `CREATE TABLE` statements.
- Four `ALTER TABLE ... ADD ... DEFAULT ...` statements — two on `family`, two on `child`.
- No `DROP` of anything.

If any `DROP TABLE` or `DROP COLUMN` appears, stop and investigate; this migration must be purely additive.

- [ ] **Step 6: Apply the migration**

Run: `npm run db:migrate`

Then confirm against the local database:

```bash
sqlite3 local.db ".schema upkeep_task_assignment"
sqlite3 local.db "SELECT upkeep_enabled, upkeep_requires_approval FROM family LIMIT 1;"
sqlite3 local.db "SELECT upkeep_enabled, upkeep_xp FROM child LIMIT 1;"
```

Expected: the assignment table's schema prints; `family` shows `0|0`; `child` shows `1|0`.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/db/schema.ts src/lib/db/migrations
git commit -m "Add Upkeep schema: tasks, schedules, assignments, wage ledger

Parallel upkeep_* tables rather than a discriminator on quest, so chores
cannot structurally reach the learning log, streaks, or school XP. The
wage ledger is append-only with a snapshotted task title, so a line still
reads correctly after its task is renamed or retired.

Purely additive: every new column carries a default, no backfill needed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Authorization guards

**Files:**
- Modify: `src/lib/auth/access.ts`

**Interfaces:**
- Consumes: `requireChildAccess` (exists).
- Produces:
  - `requireUpkeepTaskAccess(taskId: string, opts?: { write?: boolean })`
  - `requireUpkeepAssignmentAccess(assignmentId: string, opts?: { write?: boolean })`

Both return the same `{ access, familyId }` shape as `requireChildAccess`.

- [ ] **Step 1: Add the guards**

In `src/lib/auth/access.ts`, immediately after `requireScheduleBlockAccess`, following the identical shape of the guards above it:

```ts
/** Resolve access via an upkeep-task id (looks up the owning child). */
export async function requireUpkeepTaskAccess(
  taskId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.upkeepTask.childId })
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.id, taskId))
    .limit(1);
  if (!rows[0]) throw new Error("Upkeep task not found.");
  return requireChildAccess(rows[0].childId, opts);
}

/** Resolve access via an upkeep-assignment id (looks up the owning child). */
export async function requireUpkeepAssignmentAccess(
  assignmentId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.upkeepTaskAssignment.childId })
    .from(schema.upkeepTaskAssignment)
    .where(eq(schema.upkeepTaskAssignment.id, assignmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Upkeep assignment not found.");
  return requireChildAccess(rows[0].childId, opts);
}
```

- [ ] **Step 2: Verify nothing regressed**

Run: `npm run typecheck && npx vitest run src/lib/auth`
Expected: typecheck clean, existing access tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/access.ts
git commit -m "Add upkeep authorization guards

Same shape as requireQuestAccess: resolve the owning child, then defer to
requireChildAccess so family scope and the child-acting-for-themself rule
are enforced in exactly one place.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Enablement context and settings actions

Loads the two toggles and exposes the mutations that flip them. Everything that follows depends on `assertUpkeepEnabled`, so it comes before the other actions.

**Files:**
- Create: `src/lib/services/upkeep-context.ts`
- Create: `src/lib/actions/upkeep-settings.ts`

**Interfaces:**
- Consumes: `isUpkeepEnabled` (Task 3); `requireChildAccess`, `requireFamilyAccess` (existing); `requireAdultActor` from `@/lib/auth/actor`.
- Produces:
  - `type UpkeepContext = { childId: string; familyId: string; enabled: boolean; requiresApproval: boolean }`
  - `loadUpkeepContext(childId: string): Promise<UpkeepContext | null>`
  - `assertUpkeepEnabled(childId: string): Promise<UpkeepContext>` — throws when off
  - Actions: `getUpkeepSettings(childId)`, `setFamilyUpkeepEnabled(enabled)`, `setFamilyUpkeepRequiresApproval(enabled)`, `setChildUpkeepEnabled(childId, enabled)`

- [ ] **Step 1: Create the context service**

`upkeep-context.ts` is a plain module, not an action file, because `UpkeepContext` is a type export and action files may export only async functions.

Create `src/lib/services/upkeep-context.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isUpkeepEnabled } from "@/lib/utils/upkeep-enabled";

export type UpkeepContext = {
  childId: string;
  familyId: string;
  /** Both toggles agree the module is on for this hero. */
  enabled: boolean;
  /** Family setting: a hero's completion waits for a grown-up to confirm. */
  requiresApproval: boolean;
};

/**
 * Reads both upkeep toggles in one round-trip. Returns null when the child
 * does not exist. Callers must have authorized the child already — this does
 * no access checking of its own.
 */
export async function loadUpkeepContext(
  childId: string
): Promise<UpkeepContext | null> {
  const rows = await db
    .select({
      childId: schema.child.id,
      familyId: schema.child.familyId,
      childEnabled: schema.child.upkeepEnabled,
      familyEnabled: schema.family.upkeepEnabled,
      requiresApproval: schema.family.upkeepRequiresApproval,
    })
    .from(schema.child)
    .innerJoin(schema.family, eq(schema.child.familyId, schema.family.id))
    .where(eq(schema.child.id, childId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    childId: row.childId,
    familyId: row.familyId,
    enabled: isUpkeepEnabled(
      { upkeepEnabled: row.familyEnabled },
      { upkeepEnabled: row.childEnabled }
    ),
    requiresApproval: row.requiresApproval,
  };
}

/**
 * Gate every upkeep mutation goes through. A stale client — a tab left open
 * after a parent turned the module off — must not be able to write chore rows
 * into a family that has it disabled.
 */
export async function assertUpkeepEnabled(childId: string): Promise<UpkeepContext> {
  const context = await loadUpkeepContext(childId);
  if (!context?.enabled) {
    throw new Error("Upkeep is not enabled for this hero.");
  }
  return context;
}
```

- [ ] **Step 2: Create the settings actions**

Create `src/lib/actions/upkeep-settings.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, requireFamilyAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import { loadUpkeepContext } from "@/lib/services/upkeep-context";

/** Both toggles as they apply to one hero. Safe for a child to read. */
export async function getUpkeepSettings(childId: string) {
  await requireChildAccess(childId);
  return loadUpkeepContext(childId);
}

/** The family's master switch. */
export async function setFamilyUpkeepEnabled(enabled: boolean) {
  await requireAdultActor();
  const access = await requireFamilyAccess({ write: true });
  await db
    .update(schema.family)
    .set({ upkeepEnabled: enabled, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
}

/** Whether a hero's completion waits on a grown-up before wages post. */
export async function setFamilyUpkeepRequiresApproval(enabled: boolean) {
  await requireAdultActor();
  const access = await requireFamilyAccess({ write: true });
  await db
    .update(schema.family)
    .set({ upkeepRequiresApproval: enabled, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
}

/** Per-hero opt-out, under the family switch. */
export async function setChildUpkeepEnabled(childId: string, enabled: boolean) {
  await requireAdultActor();
  await requireChildAccess(childId, { write: true });
  await db
    .update(schema.child)
    .set({ upkeepEnabled: enabled, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean. In particular, no error about a non-async export from a `"use server"` file — if one appears, a type or constant leaked into the action file and belongs in the service module.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/upkeep-context.ts src/lib/actions/upkeep-settings.ts
git commit -m "Add upkeep enablement context and settings actions

assertUpkeepEnabled is the gate every upkeep mutation goes through, so a
tab left open after a parent disables the module cannot write chore rows.
The type lives in a plain service module because action files may only
export async functions.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Assignment sync service and schedule actions

Prunes assignment rows the schedule no longer calls for, and exposes schedule upsert/delete. Mirrors `quest-assignment-sync.ts` and `quest-schedules.ts`; read both before writing.

**Files:**
- Create: `src/lib/services/upkeep-assignment-sync.ts`
- Create: `src/lib/actions/upkeep-schedules.ts`

**Interfaces:**
- Consumes: `findStaleAssignmentIds`, `PendingAssignmentRow` (Task 5); `requireUpkeepTaskAccess` (Task 7).
- Produces:
  - `clearPendingUpkeepAssignmentsForTask(taskId: string, fromDate: string): Promise<number>`
  - `syncPendingUpkeepAssignmentsToSchedule(taskId: string, fromDate: string): Promise<number>`
  - `pruneStaleUpkeepAssignmentsInRange(childId: string, startDate: string, endDate: string): Promise<number>`
  - Actions: `getUpkeepSchedulesForChild(childId)`, `getUpkeepSchedule(taskId)`, `upsertUpkeepSchedule(taskId, data)`, `deleteUpkeepSchedule(taskId)`

- [ ] **Step 1: Create the sync service**

Create `src/lib/services/upkeep-assignment-sync.ts`:

```ts
import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  findStaleAssignmentIds,
  type PendingAssignmentRow,
} from "@/lib/utils/assignment-pruning";

/**
 * Keeps materialized upkeep assignments in step with the tasks and schedules
 * that produced them. The upkeep counterpart of quest-assignment-sync.ts.
 *
 * Everything here deletes only `pending` rows. A completed row is history the
 * wage ledger points at, and an excused row is a decision a parent made — both
 * must survive a task being retired or its repeat narrowed.
 *
 * Plain module, not a "use server" action file: these are internal helpers and
 * their callers have already authorized the task or child.
 *
 * Structurally parallel to the quest sync service. That duplication is
 * deliberate — the decision logic is shared through findStaleAssignmentIds,
 * and making the Drizzle table access generic would cost far more in
 * unreadable types than the repetition saves.
 */

/** Pending rows joined to their task's schedule as it currently reads. */
async function loadPendingRows(where: SQL | undefined): Promise<PendingAssignmentRow[]> {
  const rows = await db
    .select({
      id: schema.upkeepTaskAssignment.id,
      taskId: schema.upkeepTaskAssignment.taskId,
      date: schema.upkeepTaskAssignment.date,
      taskIsActive: schema.upkeepTask.isActive,
      scheduleId: schema.upkeepTaskSchedule.id,
      frequency: schema.upkeepTaskSchedule.frequency,
      daysOfWeek: schema.upkeepTaskSchedule.daysOfWeek,
      intervalWeeks: schema.upkeepTaskSchedule.intervalWeeks,
      scheduleStartDate: schema.upkeepTaskSchedule.startDate,
      scheduleEndDate: schema.upkeepTaskSchedule.endDate,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .leftJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTaskSchedule.taskId, schema.upkeepTask.id)
    )
    .where(where);

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.taskId,
    date: r.date,
    sourceIsActive: r.taskIsActive,
    schedule: r.scheduleId
      ? {
          frequency: r.frequency!,
          daysOfWeek: r.daysOfWeek,
          intervalWeeks: r.intervalWeeks,
          startDate: r.scheduleStartDate!,
          endDate: r.scheduleEndDate,
        }
      : null,
  }));
}

async function deleteAssignments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db
    .delete(schema.upkeepTaskAssignment)
    .where(inArray(schema.upkeepTaskAssignment.id, ids));
  return ids.length;
}

/** Drops every not-yet-actioned assignment for a task from `fromDate` onward. */
export async function clearPendingUpkeepAssignmentsForTask(
  taskId: string,
  fromDate: string
): Promise<number> {
  const rows = await db
    .delete(schema.upkeepTaskAssignment)
    .where(
      and(
        eq(schema.upkeepTaskAssignment.taskId, taskId),
        eq(schema.upkeepTaskAssignment.status, "pending"),
        gte(schema.upkeepTaskAssignment.date, fromDate)
      )
    )
    .returning({ id: schema.upkeepTaskAssignment.id });
  return rows.length;
}

/**
 * Re-checks one task's future pending assignments against its schedule as it
 * now reads, so narrowing a repeat clears the days no longer planned.
 */
export async function syncPendingUpkeepAssignmentsToSchedule(
  taskId: string,
  fromDate: string
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.upkeepTaskAssignment.taskId, taskId),
      eq(schema.upkeepTaskAssignment.status, "pending"),
      gte(schema.upkeepTaskAssignment.date, fromDate)
    )
  );
  if (pending.length === 0) return 0;

  const rangeEnd = pending.reduce((max, r) => (r.date > max ? r.date : max), fromDate);
  // schoolDays is null for chores: they are planned on every day their pattern
  // names, so pruning must use the same rule generation did.
  const stale = findStaleAssignmentIds(pending, {
    rangeStart: fromDate,
    rangeEnd,
    schoolDays: null,
  });
  return deleteAssignments(stale);
}

/** Self-healing sweep run alongside generation over the window being generated. */
export async function pruneStaleUpkeepAssignmentsInRange(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.upkeepTaskAssignment.childId, childId),
      eq(schema.upkeepTaskAssignment.status, "pending"),
      gte(schema.upkeepTaskAssignment.date, startDate),
      lte(schema.upkeepTaskAssignment.date, endDate)
    )
  );
  if (pending.length === 0) return 0;

  const stale = findStaleAssignmentIds(pending, {
    rangeStart: startDate,
    rangeEnd: endDate,
    schoolDays: null,
  });
  return deleteAssignments(stale);
}
```

- [ ] **Step 2: Create the schedule actions**

Create `src/lib/actions/upkeep-schedules.ts`:

```ts
"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/dates";
import { requireChildAccess, requireUpkeepTaskAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import {
  clearPendingUpkeepAssignmentsForTask,
  syncPendingUpkeepAssignmentsToSchedule,
} from "@/lib/services/upkeep-assignment-sync";

export async function getUpkeepSchedulesForChild(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({ schedule: schema.upkeepTaskSchedule })
    .from(schema.upkeepTaskSchedule)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTask.id, schema.upkeepTaskSchedule.taskId)
    )
    .where(eq(schema.upkeepTask.childId, childId));
  return rows.map((r) => r.schedule);
}

export async function getUpkeepSchedule(taskId: string) {
  await requireUpkeepTaskAccess(taskId);
  const rows = await db
    .select()
    .from(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertUpkeepSchedule(
  taskId: string,
  data: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  }
) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });

  const existing = await db
    .select({ id: schema.upkeepTaskSchedule.id })
    .from(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId))
    .limit(1);

  const isWeekly = data.frequency === "weekly";
  const values = {
    frequency: data.frequency,
    daysOfWeek: isWeekly && data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
    intervalWeeks: isWeekly ? (data.intervalWeeks ?? 1) : null,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
  };

  if (existing[0]) {
    await db
      .update(schema.upkeepTaskSchedule)
      .set(values)
      .where(eq(schema.upkeepTaskSchedule.id, existing[0].id));
    // Narrowing a repeat leaves rows the old pattern already generated. Drop
    // the days the schedule no longer calls for.
    await syncPendingUpkeepAssignmentsToSchedule(taskId, formatDate(new Date()));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(schema.upkeepTaskSchedule).values({
    id,
    taskId,
    ...values,
    createdAt: new Date(),
  });
  return { id };
}

export async function deleteUpkeepSchedule(taskId: string) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });
  await db
    .delete(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId));

  // Turning the repeat off has to retract the days it already planned.
  await clearPendingUpkeepAssignmentsForTask(taskId, formatDate(new Date()));
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, full suite still passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/upkeep-assignment-sync.ts src/lib/actions/upkeep-schedules.ts
git commit -m "Add upkeep assignment sync service and schedule actions

Shares the staleness rules with quests through findStaleAssignmentIds and
passes schoolDays: null, so pruning uses exactly the rule generation used.
Only pending rows are ever deleted — completed rows are pointed at by the
wage ledger, and excused rows are a parent's decision.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Task template CRUD

**Files:**
- Create: `src/lib/actions/upkeep-tasks.ts`

**Interfaces:**
- Consumes: `assertUpkeepEnabled` (Task 8); `requireChildAccess`, `requireUpkeepTaskAccess` (Task 7); `requireAdultActor`; `sanitizeName`, `sanitizeText`; `clearPendingUpkeepAssignmentsForTask` (Task 9).
- Produces:
  - `getUpkeepTasks(childId): Promise<(UpkeepTaskRow & { hasSchedule: boolean })[]>`
  - `getUpkeepTask(taskId)`
  - `createUpkeepTask(data): Promise<{ id: string; title: string }>`
  - `updateUpkeepTask(taskId, data): Promise<void>`
  - `deleteUpkeepTask(taskId): Promise<void>`

`createUpkeepTask` data shape:
```ts
{
  childId: string;
  title: string;
  description?: string;
  valueCents?: number | null;
  isRequired?: boolean;
  rewardXp?: number | null;
  estimatedMinutes?: number | null;
  schedule?: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  };
}
```

- [ ] **Step 1: Write the action file**

Create `src/lib/actions/upkeep-tasks.ts`. This mirrors `src/lib/actions/quests.ts` closely — read that file first so the shapes match.

```ts
"use server";

import { nanoid } from "nanoid";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";
import { requireChildAccess, requireUpkeepTaskAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import { assertUpkeepEnabled } from "@/lib/services/upkeep-context";
import { clearPendingUpkeepAssignmentsForTask } from "@/lib/services/upkeep-assignment-sync";

/** Active task templates for a hero, flagged with whether each one repeats. */
export async function getUpkeepTasks(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      task: schema.upkeepTask,
      hasSchedule: sql<boolean>`${schema.upkeepTaskSchedule.id} is not null`,
    })
    .from(schema.upkeepTask)
    .leftJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTaskSchedule.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTask.childId, childId),
        eq(schema.upkeepTask.isActive, true)
      )
    )
    .orderBy(schema.upkeepTask.sortOrder);
  return rows.map((r) => ({ ...r.task, hasSchedule: r.hasSchedule }));
}

export async function getUpkeepTask(taskId: string) {
  try {
    await requireUpkeepTaskAccess(taskId);
  } catch {
    return null;
  }
  const rows = await db
    .select()
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.id, taskId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUpkeepTask(data: {
  childId: string;
  title: string;
  description?: string;
  valueCents?: number | null;
  isRequired?: boolean;
  rewardXp?: number | null;
  estimatedMinutes?: number | null;
  schedule?: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  };
}) {
  await requireAdultActor();
  await requireChildAccess(data.childId, { write: true });
  await assertUpkeepEnabled(data.childId);

  const title = sanitizeName(data.title);
  if (!title) throw new Error("Task title is required");

  // Money is always whole cents. A fractional value here means a caller did
  // its own arithmetic instead of using parseDollarsToCents.
  if (data.valueCents != null && !Number.isInteger(data.valueCents)) {
    throw new Error("Task value must be whole cents");
  }
  if (data.valueCents != null && data.valueCents < 0) {
    throw new Error("Task value cannot be negative");
  }

  const existing = await db
    .select({ sortOrder: schema.upkeepTask.sortOrder })
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.childId, data.childId));
  const maxSort = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1);

  const id = nanoid();
  const now = new Date();

  await db.insert(schema.upkeepTask).values({
    id,
    childId: data.childId,
    title,
    description: data.description ? sanitizeText(data.description) : null,
    valueCents: data.valueCents ?? null,
    isRequired: data.isRequired ?? true,
    rewardXp: data.rewardXp ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    isActive: true,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  });

  if (data.schedule) {
    const isWeekly = data.schedule.frequency === "weekly";
    await db.insert(schema.upkeepTaskSchedule).values({
      id: nanoid(),
      taskId: id,
      frequency: data.schedule.frequency,
      daysOfWeek:
        isWeekly && data.schedule.daysOfWeek
          ? JSON.stringify(data.schedule.daysOfWeek)
          : null,
      intervalWeeks: isWeekly ? (data.schedule.intervalWeeks ?? 1) : null,
      startDate: data.schedule.startDate,
      endDate: data.schedule.endDate ?? null,
      createdAt: now,
    });
  }

  return { id, title };
}

export async function updateUpkeepTask(
  taskId: string,
  data: {
    title?: string;
    description?: string | null;
    valueCents?: number | null;
    isRequired?: boolean;
    rewardXp?: number | null;
    estimatedMinutes?: number | null;
    isActive?: boolean;
  }
) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title) updates.title = sanitizeName(data.title);
  if (data.description !== undefined)
    updates.description = data.description ? sanitizeText(data.description) : null;
  if (data.valueCents !== undefined) {
    if (data.valueCents != null && !Number.isInteger(data.valueCents)) {
      throw new Error("Task value must be whole cents");
    }
    if (data.valueCents != null && data.valueCents < 0) {
      throw new Error("Task value cannot be negative");
    }
    updates.valueCents = data.valueCents;
  }
  if (data.isRequired !== undefined) updates.isRequired = data.isRequired;
  if (data.rewardXp !== undefined) updates.rewardXp = data.rewardXp;
  if (data.estimatedMinutes !== undefined)
    updates.estimatedMinutes = data.estimatedMinutes;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  await db
    .update(schema.upkeepTask)
    .set(updates)
    .where(eq(schema.upkeepTask.id, taskId));
}

/**
 * Soft-deletes the template and retracts the days it had already planned.
 *
 * Only pending rows from today forward: completed and excused assignments are
 * the hero's history, and the ledger lines that reference them must keep
 * making sense.
 */
export async function deleteUpkeepTask(taskId: string) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });

  await db
    .update(schema.upkeepTask)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.upkeepTask.id, taskId));

  await clearPendingUpkeepAssignmentsForTask(taskId, formatDate(new Date()));
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean. Every import resolves — `clearPendingUpkeepAssignmentsForTask` came from Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/upkeep-tasks.ts
git commit -m "Add upkeep task template CRUD

Mirrors quests.ts. Deleting soft-deletes and retracts only pending future
assignments: completed and excused rows are the hero's history, and the
ledger lines referencing them have to keep making sense.

Rejects fractional or negative valueCents — a fractional value means a
caller did its own money arithmetic instead of using parseDollarsToCents.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Assignment generation and reads

**Files:**
- Create: `src/lib/actions/upkeep-assignments.ts`

**Interfaces:**
- Consumes: `planUpkeepAssignments`, `assignmentKey` (Task 4); `pruneStaleUpkeepAssignmentsInRange` (Task 9); `loadUpkeepContext` (Task 8); `requireChildAccess` (existing).
- Produces:
  - `generateUpkeepAssignments(childId: string, startDate: string, endDate: string): Promise<number>`
  - `getUpkeepAssignmentsForDate(childId: string, date: string): Promise<UpkeepRow[]>`
  - `getOutstandingUpkeepAssignments(childId: string, today: string): Promise<UpkeepRow[]>`
  - `getUpkeepAwaitingApproval(childId: string): Promise<UpkeepRow[]>`

where each `UpkeepRow` is `{ assignment: <upkeepTaskAssignment row>, task: <upkeepTask row> }`.

- [ ] **Step 1: Write the action file**

Create `src/lib/actions/upkeep-assignments.ts`:

```ts
"use server";

import { nanoid } from "nanoid";
import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadUpkeepContext } from "@/lib/services/upkeep-context";
import { pruneStaleUpkeepAssignmentsInRange } from "@/lib/services/upkeep-assignment-sync";
import { assignmentKey, planUpkeepAssignments } from "@/lib/utils/upkeep-planning";

/** How far back the "still owing" list looks. Beyond this, a missed chore is history. */
const OUTSTANDING_LOOKBACK_DAYS = 30;

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Idempotent housekeeping that materializes recurring tasks into assignment
 * rows for a window. Runs on page load, so a hero viewing their own data must
 * be able to trigger it — requireChildAccess covers both in-scope adults and a
 * child acting for themself.
 *
 * Returns 0 without writing anything when the module is off, rather than
 * throwing: page loads call this unconditionally.
 */
export async function generateUpkeepAssignments(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  await requireChildAccess(childId, { write: true });

  const context = await loadUpkeepContext(childId);
  if (!context?.enabled) return 0;

  // Generation only ever adds rows, so a retired task or a narrowed repeat
  // would otherwise leave the days it had already planned sitting in the list.
  await pruneStaleUpkeepAssignmentsInRange(childId, startDate, endDate);

  const tasksWithSchedules = await db
    .select({
      taskId: schema.upkeepTask.id,
      frequency: schema.upkeepTaskSchedule.frequency,
      daysOfWeek: schema.upkeepTaskSchedule.daysOfWeek,
      intervalWeeks: schema.upkeepTaskSchedule.intervalWeeks,
      startDate: schema.upkeepTaskSchedule.startDate,
      endDate: schema.upkeepTaskSchedule.endDate,
    })
    .from(schema.upkeepTask)
    .innerJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTask.id, schema.upkeepTaskSchedule.taskId)
    )
    .where(
      and(
        eq(schema.upkeepTask.childId, childId),
        eq(schema.upkeepTask.isActive, true)
      )
    );

  if (tasksWithSchedules.length === 0) return 0;

  const existing = await db
    .select({
      taskId: schema.upkeepTaskAssignment.taskId,
      date: schema.upkeepTaskAssignment.date,
    })
    .from(schema.upkeepTaskAssignment)
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        gte(schema.upkeepTaskAssignment.date, startDate),
        lte(schema.upkeepTaskAssignment.date, endDate)
      )
    );

  const existingKeys = new Set(existing.map((a) => assignmentKey(a.taskId, a.date)));

  const planned = planUpkeepAssignments(
    tasksWithSchedules.map((t) => ({
      taskId: t.taskId,
      schedule: {
        frequency: t.frequency,
        daysOfWeek: t.daysOfWeek,
        intervalWeeks: t.intervalWeeks,
        startDate: t.startDate,
        endDate: t.endDate,
      },
    })),
    existingKeys,
    startDate,
    endDate
  );

  if (planned.length === 0) return 0;

  const now = new Date();
  let created = 0;

  for (const row of planned) {
    // onConflictDoNothing guards a concurrent call (a prefetched route) racing
    // this same check-then-insert; the unique index is what actually prevents
    // the duplicate.
    const inserted = await db
      .insert(schema.upkeepTaskAssignment)
      .values({
        id: nanoid(),
        taskId: row.taskId,
        childId,
        date: row.date,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.upkeepTaskAssignment.id });
    if (inserted.length > 0) created++;
  }

  return created;
}

/** One day's tasks, newest-defined last, joined to their template. */
export async function getUpkeepAssignmentsForDate(childId: string, date: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.date, date)
      )
    )
    .orderBy(asc(schema.upkeepTask.sortOrder));
}

/**
 * Required tasks whose day has passed while still pending — what
 * `deriveUpkeepStatus` will render as missed. Filtered here rather than in the
 * caller so the query stays cheap, and windowed so the list cannot grow without
 * bound.
 */
export async function getOutstandingUpkeepAssignments(childId: string, today: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.status, "pending"),
        eq(schema.upkeepTask.isRequired, true),
        lt(schema.upkeepTaskAssignment.date, today),
        gte(
          schema.upkeepTaskAssignment.date,
          shiftDate(today, -OUTSTANDING_LOOKBACK_DAYS)
        )
      )
    )
    .orderBy(desc(schema.upkeepTaskAssignment.date));
}

/** The parent's approval queue for one hero. */
export async function getUpkeepAwaitingApproval(childId: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.status, "awaiting_approval")
      )
    )
    .orderBy(desc(schema.upkeepTaskAssignment.date));
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, suite passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/upkeep-assignments.ts
git commit -m "Add upkeep assignment generation and reads

Generation returns 0 without writing when the module is off, because page
loads call it unconditionally. The date expansion itself lives in the pure
planning module, so weekend coverage is tested without a database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Status transitions, wages, and the ledger

The heart of the feature: the one path through which any status change moves money or XP.

**Files:**
- Create: `src/lib/services/upkeep-transitions.ts`
- Create: `src/lib/actions/wages.ts`
- Modify: `src/lib/actions/upkeep-assignments.ts` (append the mutation actions)

**Interfaces:**
- Consumes: `resolveUpkeepTransition`, `UpkeepStatus` (Task 2); `sumCents`, `parseDollarsToCents` (Task 1); `requireUpkeepAssignmentAccess` (Task 7); `assertUpkeepEnabled`, `loadUpkeepContext` (Task 8).
- Produces:
  - `applyUpkeepTransition(params): Promise<void>`
  - Actions on `upkeep-assignments.ts`: `markUpkeepDone(assignmentId, notes?)`, `approveUpkeep(assignmentId)`, `rejectUpkeep(assignmentId, reason)`, `excuseUpkeep(assignmentId, reason)`, `uncompleteUpkeep(assignmentId)`
  - Actions on `wages.ts`: `getWageBalance(childId)`, `getWageLedger(childId, limit?)`, `recordWagePayout(childId, amount, note?)`

- [ ] **Step 1: Create the transition service**

Create `src/lib/services/upkeep-transitions.ts`:

```ts
import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sumCents } from "@/lib/utils/wages";
import {
  resolveUpkeepTransition,
  type UpkeepStatus,
} from "@/lib/utils/upkeep-status";

/**
 * The single path any upkeep status change takes, and therefore the single
 * place wages or XP can move.
 *
 * resolveUpkeepTransition decides whether anything is owed; this function only
 * carries it out. That split is what makes double-paying testable without a
 * database — re-approving an already-completed task resolves to "do nothing"
 * before a query is ever issued.
 *
 * Plain module, not an action file: callers have already authorized the row.
 */
export async function applyUpkeepTransition(params: {
  assignmentId: string;
  next: UpkeepStatus;
  actorUserId: string;
  notes?: string | null;
  statusReason?: string | null;
}): Promise<void> {
  const rows = await db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(eq(schema.upkeepTaskAssignment.id, params.assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Upkeep assignment not found.");

  const prev = row.assignment.status as UpkeepStatus;
  const credit = resolveUpkeepTransition(prev, params.next);
  const now = new Date();

  // Ledger rows already posted against this assignment. Their net is 0 when
  // nothing is currently owed for it — which is both the double-pay guard and
  // the amount a reversal has to undo.
  const existingEntries = await db
    .select({ amountCents: schema.wageLedgerEntry.amountCents })
    .from(schema.wageLedgerEntry)
    .where(eq(schema.wageLedgerEntry.taskAssignmentId, params.assignmentId));
  const netPosted = sumCents(existingEntries);

  await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = {
      status: params.next,
      updatedAt: now,
    };
    if (params.notes !== undefined) updates.notes = params.notes;
    if (params.statusReason !== undefined) updates.statusReason = params.statusReason;

    if (params.next === "completed") {
      updates.completedAt = now;
      updates.completedByUserId = row.assignment.completedByUserId ?? params.actorUserId;
      updates.approvedAt = now;
      updates.approvedByUserId = params.actorUserId;
    } else if (params.next === "awaiting_approval") {
      updates.completedAt = now;
      updates.completedByUserId = params.actorUserId;
    } else if (params.next === "pending") {
      // Sent back — clear the claim so the row reads as genuinely undone.
      updates.completedAt = null;
      updates.completedByUserId = null;
      updates.approvedAt = null;
      updates.approvedByUserId = null;
    }

    await tx
      .update(schema.upkeepTaskAssignment)
      .set(updates)
      .where(eq(schema.upkeepTaskAssignment.id, params.assignmentId));

    // Wages. A task with no value posts nothing, but still grants XP below.
    if (credit.postWages && row.task.valueCents && netPosted === 0) {
      await tx.insert(schema.wageLedgerEntry).values({
        id: nanoid(),
        childId: row.assignment.childId,
        type: "earned",
        amountCents: row.task.valueCents,
        taskAssignmentId: params.assignmentId,
        taskTitle: row.task.title,
        date: row.assignment.date,
        createdByUserId: params.actorUserId,
        createdAt: now,
      });
    }

    if (credit.reverseWages && netPosted !== 0) {
      await tx.insert(schema.wageLedgerEntry).values({
        id: nanoid(),
        childId: row.assignment.childId,
        type: "reversal",
        amountCents: -netPosted,
        taskAssignmentId: params.assignmentId,
        taskTitle: row.task.title,
        date: row.assignment.date,
        note: "Task marked not done",
        createdByUserId: params.actorUserId,
        createdAt: now,
      });
    }

    // XP. upkeepXp only — never currentXp, which activities.ts recomputes.
    if (row.task.rewardXp) {
      if (credit.grantXp) {
        await tx
          .update(schema.child)
          .set({
            upkeepXp: sql`${schema.child.upkeepXp} + ${row.task.rewardXp}`,
            updatedAt: now,
          })
          .where(eq(schema.child.id, row.assignment.childId));
      } else if (credit.revokeXp) {
        await tx
          .update(schema.child)
          .set({
            upkeepXp: sql`max(0, ${schema.child.upkeepXp} - ${row.task.rewardXp})`,
            updatedAt: now,
          })
          .where(eq(schema.child.id, row.assignment.childId));
      }
    }
  });
}
```

If `db.transaction` throws at runtime against Turso, replace the `db.transaction(async (tx) => {...})` wrapper with sequential `db.` calls in the same order. The `netPosted === 0` guard already makes a retry after a partial failure safe for wages.

- [ ] **Step 2: Append the mutation actions**

Append to `src/lib/actions/upkeep-assignments.ts`. Extend the **existing** `@/lib/auth/access` import rather than adding a second one (a duplicate import is a lint error):

```ts
import { requireChildAccess, requireUpkeepAssignmentAccess } from "@/lib/auth/access";
```

and add these new imports:

```ts
import { getActor, requireAdultActor } from "@/lib/auth/actor";
import { assertUpkeepEnabled } from "@/lib/services/upkeep-context";
import { applyUpkeepTransition } from "@/lib/services/upkeep-transitions";
import { sanitizeText } from "@/lib/utils/sanitize";
```

Then append:

```ts
/** Identifies the acting user, including a PIN hero who has no `user` row. */
async function actingUserId(): Promise<string> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  return actor.kind === "child" ? `child:${actor.childId}` : actor.userId;
}

/**
 * A hero (or a parent) marks a task done. Where the family requires approval,
 * a hero's claim lands in `awaiting_approval` and no wages post; a parent
 * marking it done completes it outright, since they are the approver.
 */
export async function markUpkeepDone(assignmentId: string, notes?: string) {
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  const rows = await db
    .select({ childId: schema.upkeepTaskAssignment.childId })
    .from(schema.upkeepTaskAssignment)
    .where(eq(schema.upkeepTaskAssignment.id, assignmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Upkeep assignment not found.");

  const context = await assertUpkeepEnabled(rows[0].childId);
  const actor = await getActor();
  const isChild = actor?.kind === "child";

  await applyUpkeepTransition({
    assignmentId,
    next: context.requiresApproval && isChild ? "awaiting_approval" : "completed",
    actorUserId: await actingUserId(),
    notes: notes ? sanitizeText(notes, 2000) : undefined,
    statusReason: null,
  });
}

/** A grown-up confirms a hero's claim; wages and XP post here. */
export async function approveUpkeep(assignmentId: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await applyUpkeepTransition({
    assignmentId,
    next: "completed",
    actorUserId: await actingUserId(),
  });
}

/** Sends the task back with a reason. Nothing posts. */
export async function rejectUpkeep(assignmentId: string, reason: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await applyUpkeepTransition({
    assignmentId,
    next: "pending",
    actorUserId: await actingUserId(),
    statusReason: sanitizeText(reason, 500),
  });
}

/** Parent-only: retires a task for the day without claiming it was done. */
export async function excuseUpkeep(assignmentId: string, reason: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await applyUpkeepTransition({
    assignmentId,
    next: "excused",
    actorUserId: await actingUserId(),
    statusReason: sanitizeText(reason, 500),
  });
}

/** Parent-only: undoes a completion, reversing any wages and XP it granted. */
export async function uncompleteUpkeep(assignmentId: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await applyUpkeepTransition({
    assignmentId,
    next: "pending",
    actorUserId: await actingUserId(),
  });
}
```

- [ ] **Step 3: Create the wage actions**

Create `src/lib/actions/wages.ts`:

```ts
"use server";

import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { getActor, requireAdultActor } from "@/lib/auth/actor";
import { parseDollarsToCents, sumCents } from "@/lib/utils/wages";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";

/** What a hero is currently owed, in cents. Negative if a parent overpaid. */
export async function getWageBalance(childId: string): Promise<number> {
  await requireChildAccess(childId);
  const rows = await db
    .select({ amountCents: schema.wageLedgerEntry.amountCents })
    .from(schema.wageLedgerEntry)
    .where(eq(schema.wageLedgerEntry.childId, childId));
  return sumCents(rows);
}

/** Ledger history, newest first. */
export async function getWageLedger(childId: string, limit = 100) {
  await requireChildAccess(childId);
  return db
    .select()
    .from(schema.wageLedgerEntry)
    .where(eq(schema.wageLedgerEntry.childId, childId))
    .orderBy(desc(schema.wageLedgerEntry.createdAt))
    .limit(limit);
}

/**
 * Records money actually handed over. The parent types a positive amount —
 * `parseDollarsToCents` rejects negatives — and the sign is applied here, so
 * the convention lives in exactly one place and the balance stays a plain sum.
 */
export async function recordWagePayout(
  childId: string,
  amount: string,
  note?: string
) {
  await requireAdultActor();
  await requireChildAccess(childId, { write: true });

  const cents = parseDollarsToCents(amount);
  if (cents === 0) throw new Error("Enter an amount greater than zero");

  const actor = await getActor();
  await db.insert(schema.wageLedgerEntry).values({
    id: nanoid(),
    childId,
    type: "payout",
    amountCents: -cents,
    taskAssignmentId: null,
    taskTitle: null,
    date: formatDate(new Date()),
    note: note ? sanitizeText(note, 500) : null,
    createdByUserId: actor?.kind === "adult" ? actor.userId : null,
    createdAt: new Date(),
  });
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, suite passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/upkeep-transitions.ts src/lib/actions/wages.ts src/lib/actions/upkeep-assignments.ts
git commit -m "Add upkeep status transitions, wages, and the ledger

All wage and XP movement goes through one path, gated by the pure
resolveUpkeepTransition — so re-approving an already-completed task
resolves to 'do nothing' before a query is issued. Un-completing posts a
reversal rather than deleting the earned row, keeping the ledger
append-only and the balance a plain SUM.

XP lands on child.upkeepXp only; currentXp is never touched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Isolation architecture test

The spec's central invariant is that chores cannot touch school state. This test enforces it structurally by inspecting the source of every upkeep module, so a future edit that reaches for `currentXp` fails CI rather than quietly corrupting a hero's school standing.

**Files:**
- Create: `src/test/upkeep-isolation.test.ts`

**Interfaces:**
- Consumes: the files created in Tasks 8-12.
- Produces: nothing importable.

- [ ] **Step 1: Write the test**

Create `src/test/upkeep-isolation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Upkeep must never write school state. This is the feature's central
 * invariant, and it is the kind that decays silently: nothing fails loudly if
 * someone adds `currentXp` to a chore completion — a hero's school XP just
 * starts drifting.
 *
 * So it is checked structurally. Every upkeep module is read as text and
 * asserted not to mention the school-side identifiers at all.
 */
const UPKEEP_MODULES = [
  "src/lib/actions/upkeep-tasks.ts",
  "src/lib/actions/upkeep-schedules.ts",
  "src/lib/actions/upkeep-assignments.ts",
  "src/lib/actions/upkeep-settings.ts",
  "src/lib/actions/wages.ts",
  "src/lib/services/upkeep-assignment-sync.ts",
  "src/lib/services/upkeep-context.ts",
  "src/lib/services/upkeep-transitions.ts",
];

/** School state an upkeep module must never read or write. */
const FORBIDDEN = [
  "activityLog",
  "activity_log",
  "currentXp",
  "current_xp",
  "bonusXp",
  "currentStreak",
  "longestStreak",
  "weeklySummary",
  // The alert bell means "a hero told you something about school". A missed
  // chore is an absence of action, not a statement, and keeping upkeep out of
  // parentAlert is what preserves that meaning.
  "parentAlert",
  "parent_alert",
];

describe("upkeep isolation from school state", () => {
  for (const path of UPKEEP_MODULES) {
    it(`${path} does not touch school state`, () => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      const found = FORBIDDEN.filter((token) => source.includes(token));
      expect(found).toEqual([]);
    });
  }

  it("covers every upkeep module that exists", () => {
    // Guards against the list above going stale as modules are added.
    for (const path of UPKEEP_MODULES) {
      expect(() => readFileSync(resolve(process.cwd(), path), "utf8")).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/test/upkeep-isolation.test.ts`
Expected: PASS, 9 tests. If any fails, the named module reaches into school state and must be changed — not the test.

- [ ] **Step 3: Commit**

```bash
git add src/test/upkeep-isolation.test.ts
git commit -m "Enforce upkeep isolation from school state with an architecture test

The invariant decays silently — nothing fails loudly if a chore completion
starts writing currentXp, a hero's school XP just drifts. Checking it
structurally makes the regression a red test instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Task card component

One task row. Renders wages in the viewer's own units and offers the right control for who is looking.

**Files:**
- Create: `src/components/upkeep-task-card.tsx`
- Test: `src/components/upkeep-task-card.test.tsx`

**Interfaces:**
- Consumes: `formatWagesAsCoin`, `formatWagesAsDollars` (Task 1); `deriveUpkeepStatus`, `UpkeepStatus` (Task 2); the actions from Task 12.
- Produces:
  - `type UpkeepCardData = { assignment: { id: string; status: UpkeepStatus; date: string; notes: string | null; statusReason: string | null }; task: { id: string; title: string; description: string | null; valueCents: number | null; isRequired: boolean; rewardXp: number | null } }`
  - `<UpkeepTaskCard data={...} isChildView={boolean} today={string} />`

- [ ] **Step 1: Write the failing test**

Create `src/components/upkeep-task-card.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UpkeepTaskCard, type UpkeepCardData } from "./upkeep-task-card";

vi.mock("@/lib/actions/upkeep-assignments", () => ({
  markUpkeepDone: vi.fn(),
  approveUpkeep: vi.fn(),
  rejectUpkeep: vi.fn(),
  excuseUpkeep: vi.fn(),
  uncompleteUpkeep: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TODAY = "2026-09-02";

function data(overrides: Partial<UpkeepCardData["task"]> = {}, assignmentOverrides = {}): UpkeepCardData {
  return {
    assignment: {
      id: "a1",
      status: "pending",
      date: TODAY,
      notes: null,
      statusReason: null,
      ...assignmentOverrides,
    },
    task: {
      id: "t1",
      title: "Feed the chickens",
      description: null,
      valueCents: 250,
      isRequired: true,
      rewardXp: null,
      ...overrides,
    },
  };
}

afterEach(cleanup);

describe("UpkeepTaskCard", () => {
  it("shows the task title", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByText("Feed the chickens")).toBeInTheDocument();
  });

  it("shows wages in gold to a hero", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByText("2 gp 5 sp")).toBeInTheDocument();
  });

  it("shows wages in dollars to a parent", () => {
    render(<UpkeepTaskCard data={data()} isChildView={false} today={TODAY} />);
    expect(screen.getByText("$2.50")).toBeInTheDocument();
  });

  it("shows no wages for an unpaid task", () => {
    render(<UpkeepTaskCard data={data({ valueCents: null })} isChildView today={TODAY} />);
    expect(screen.queryByText(/\d+ (gp|sp|cp)/)).not.toBeInTheDocument();
  });

  it("marks an optional task as optional", () => {
    render(<UpkeepTaskCard data={data({ isRequired: false })} isChildView today={TODAY} />);
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("shows a required past pending task as missed", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { date: "2026-09-01" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("does not call an optional past pending task missed", () => {
    render(
      <UpkeepTaskCard
        data={data({ isRequired: false }, { date: "2026-09-01" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
  });

  it("offers a done control on a pending task", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByRole("button", { name: /mark done/i })).toBeInTheDocument();
  });

  it("offers approve and send-back to a parent on an awaiting task", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { status: "awaiting_approval" })}
        isChildView={false}
        today={TODAY}
      />
    );
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send back/i })).toBeInTheDocument();
  });

  it("does not offer approval to a hero", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { status: "awaiting_approval" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows the reason a task was sent back", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { statusReason: "The coop still needs sweeping" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.getByText(/coop still needs sweeping/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/upkeep-task-card.test.tsx`
Expected: FAIL — cannot resolve `./upkeep-task-card`.

- [ ] **Step 3: Write the component**

Create `src/components/upkeep-task-card.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GameIcon } from "@/components/game-icon";
import { formatWagesAsCoin, formatWagesAsDollars } from "@/lib/utils/wages";
import { deriveUpkeepStatus, type UpkeepStatus } from "@/lib/utils/upkeep-status";
import {
  approveUpkeep,
  excuseUpkeep,
  markUpkeepDone,
  rejectUpkeep,
  uncompleteUpkeep,
} from "@/lib/actions/upkeep-assignments";

export type UpkeepCardData = {
  assignment: {
    id: string;
    status: UpkeepStatus;
    date: string;
    notes: string | null;
    /** Why it was excused, or why a grown-up sent it back. */
    statusReason: string | null;
  };
  task: {
    id: string;
    title: string;
    description: string | null;
    valueCents: number | null;
    isRequired: boolean;
    rewardXp: number | null;
  };
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  completed: "Done",
  excused: "Excused",
  missed: "Missed",
};

export function UpkeepTaskCard({
  data,
  isChildView,
  today,
}: {
  data: UpkeepCardData;
  isChildView: boolean;
  /** Passed in rather than read from the clock so the card renders the same on server and client. */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  const { assignment, task } = data;
  const status = deriveUpkeepStatus(assignment, task, today);

  // Heroes are paid in coin, grown-ups in the money they actually hand over.
  const wages =
    task.valueCents == null
      ? null
      : isChildView
        ? formatWagesAsCoin(task.valueCents)
        : formatWagesAsDollars(task.valueCents);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      setShowReason(false);
      setReason("");
      router.refresh();
    });
  }

  const isOpen = status === "pending" || status === "missed";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{task.title}</h3>
          {task.description && (
            <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {!task.isRequired && (
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                Optional
              </span>
            )}
            {STATUS_LABELS[status] && (
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                {STATUS_LABELS[status]}
              </span>
            )}
            {task.rewardXp ? <span className="text-muted-foreground">+{task.rewardXp} XP</span> : null}
          </div>
          {assignment.statusReason && (
            <p className="mt-2 text-sm text-muted-foreground">{assignment.statusReason}</p>
          )}
        </div>

        {wages && (
          <span className="flex shrink-0 items-center gap-1 font-medium text-[var(--gold-bright)]">
            <GameIcon name="gem" className="size-4" />
            {wages}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {isOpen && (
          <Button size="sm" disabled={pending} onClick={() => run(() => markUpkeepDone(assignment.id))}>
            Mark done
          </Button>
        )}

        {!isChildView && status === "awaiting_approval" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => approveUpkeep(assignment.id))}>
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowReason(true)}>
              Send back
            </Button>
          </>
        )}

        {!isChildView && isOpen && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowReason(true)}>
            Excuse
          </Button>
        )}

        {!isChildView && status === "completed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => uncompleteUpkeep(assignment.id))}
          >
            Undo
          </Button>
        )}
      </div>

      {showReason && (
        <div className="mt-3 flex gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            aria-label="Reason"
          />
          <Button
            size="sm"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(() =>
                status === "awaiting_approval"
                  ? rejectUpkeep(assignment.id, reason)
                  : excuseUpkeep(assignment.id, reason)
              )
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/upkeep-task-card.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/components/upkeep-task-card.tsx src/components/upkeep-task-card.test.tsx
git commit -m "Add upkeep task card

Renders wages in the viewer's own units — coin for heroes, currency for
the grown-ups actually paying. 'today' is passed in rather than read from
the clock so the derived missed state renders identically on server and
client.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: The Upkeep tab in the Quest Log

**Files:**
- Modify: `src/components/quest-view-tabs.tsx`
- Create: `src/components/quest-view-tabs.test.tsx`
- Create: `src/components/upkeep-today-list.tsx`
- Modify: `src/app/(app)/quests/page.tsx`

**Interfaces:**
- Consumes: `UpkeepTaskCard`, `UpkeepCardData` (Task 14); `summarizeUpkeepDay` (Task 2); the read actions (Task 11); `loadUpkeepContext` (Task 8).
- Produces:
  - `<QuestViewTabs active={"today" | "adventure" | "upkeep"} showUpkeep={boolean} />`
  - `<UpkeepTodayList today={...} outstanding={...} isChildView={...} todayDate={...} />`

- [ ] **Step 1: Write the failing tabs test**

Create `src/components/quest-view-tabs.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuestViewTabs } from "./quest-view-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("QuestViewTabs", () => {
  it("always shows the school tabs", () => {
    render(<QuestViewTabs active="today" showUpkeep={false} />);
    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete adventure/i })).toBeInTheDocument();
  });

  it("hides Upkeep when the module is off", () => {
    render(<QuestViewTabs active="today" showUpkeep={false} />);
    expect(screen.queryByRole("button", { name: /upkeep/i })).not.toBeInTheDocument();
  });

  it("shows Upkeep when the module is on", () => {
    render(<QuestViewTabs active="today" showUpkeep />);
    expect(screen.getByRole("button", { name: /upkeep/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/quest-view-tabs.test.tsx`
Expected: FAIL — `showUpkeep` is not a prop, and no Upkeep tab exists.

- [ ] **Step 3: Update the tabs component**

In `src/components/quest-view-tabs.tsx`, replace the `TABS` constant and the component signature:

```tsx
const SCHOOL_TABS = [
  { value: "today", label: "Today", icon: "swords" },
  { value: "adventure", label: "Complete Adventure", icon: "campfire" },
] as const;

const UPKEEP_TAB = { value: "upkeep", label: "Upkeep", icon: "tavern" } as const;

export type QuestView = "today" | "adventure" | "upkeep";

export function QuestViewTabs({
  active,
  showUpkeep = false,
}: {
  active: QuestView;
  /** Upkeep is an optional module — the tab does not exist until it is on. */
  showUpkeep?: boolean;
}) {
```

Keep `switchTab` exactly as it is — `"today"` still clears the `view` param and anything else sets it, which already handles `upkeep`. Then replace `TABS.map(...)` with:

```tsx
      {[...SCHOOL_TABS, ...(showUpkeep ? [UPKEEP_TAB] : [])].map((tab) => (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/quest-view-tabs.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Create the list component**

Create `src/components/upkeep-today-list.tsx`:

```tsx
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { UpkeepTaskCard, type UpkeepCardData } from "@/components/upkeep-task-card";
import { summarizeUpkeepDay } from "@/lib/utils/upkeep-status";

export function UpkeepTodayList({
  today,
  outstanding,
  isChildView,
  todayDate,
}: {
  today: UpkeepCardData[];
  /** Required tasks from earlier days still not done. */
  outstanding: UpkeepCardData[];
  isChildView: boolean;
  todayDate: string;
}) {
  const summary = summarizeUpkeepDay(today, todayDate);

  if (today.length === 0 && outstanding.length === 0) {
    return (
      <GameFrame>
        <div className="py-4 text-center">
          <GameIcon name="tavern" className="mx-auto size-10 text-[var(--gold-bright)]" />
          <p className="mt-3 text-muted-foreground">
            Nothing to tend today — the hold is in order.
          </p>
        </div>
      </GameFrame>
    );
  }

  return (
    <div className="space-y-6">
      {outstanding.length > 0 && (
        <section className="space-y-3">
          <h2 className="page-title text-2xl">Still owing</h2>
          <p className="text-sm text-muted-foreground">
            {isChildView
              ? "These days have passed, but they can still be done."
              : "Required tasks whose day has passed. They can be done late or excused."}
          </p>
          {outstanding.map((row) => (
            <UpkeepTaskCard
              key={row.assignment.id}
              data={row}
              isChildView={isChildView}
              today={todayDate}
            />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="page-title text-2xl">Today</h2>
          <span className="text-sm text-muted-foreground">
            {summary.done} of {summary.total} done
            {summary.awaitingApproval > 0 && ` · ${summary.awaitingApproval} awaiting approval`}
          </span>
        </div>
        {today.map((row) => (
          <UpkeepTaskCard
            key={row.assignment.id}
            data={row}
            isChildView={isChildView}
            today={todayDate}
          />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into the Quest Log page**

In `src/app/(app)/quests/page.tsx`:

Add imports:

```ts
import { loadUpkeepContext } from "@/lib/services/upkeep-context";
import {
  generateUpkeepAssignments,
  getUpkeepAssignmentsForDate,
  getOutstandingUpkeepAssignments,
} from "@/lib/actions/upkeep-assignments";
import { UpkeepTodayList } from "@/components/upkeep-today-list";
```

Change the view resolution near the top of the component (currently `const activeView = view === "adventure" ? "adventure" : "today";`) to:

```ts
  const activeView =
    view === "adventure" ? "adventure" : view === "upkeep" ? "upkeep" : "today";
```

After `activeChild` is resolved, load the upkeep context and — only when enabled — generate and read:

```ts
  const upkeepContext = await loadUpkeepContext(activeChild.id);
  const showUpkeep = Boolean(upkeepContext?.enabled);

  const todayDate = formatDate(new Date());
  let upkeepToday: Awaited<ReturnType<typeof getUpkeepAssignmentsForDate>> = [];
  let upkeepOutstanding: Awaited<ReturnType<typeof getOutstandingUpkeepAssignments>> = [];

  if (showUpkeep) {
    // Same idempotent on-load housekeeping quests use. Generates a fortnight
    // ahead so a weekly chore is visible before its day arrives.
    await generateUpkeepAssignments(activeChild.id, todayDate, shiftDays(todayDate, 14));
    [upkeepToday, upkeepOutstanding] = await Promise.all([
      getUpkeepAssignmentsForDate(activeChild.id, todayDate),
      getOutstandingUpkeepAssignments(activeChild.id, todayDate),
    ]);
  }
```

Add this helper above the page component in the same file:

```ts
function shiftDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

Pass `showUpkeep` to the existing `<QuestViewTabs active={activeView} />` usage:

```tsx
<QuestViewTabs active={activeView} showUpkeep={showUpkeep} />
```

And render the Upkeep view where the page branches on `activeView`, before the existing `today` / `adventure` branches:

```tsx
{activeView === "upkeep" && showUpkeep && (
  <UpkeepTodayList
    today={upkeepToday}
    outstanding={upkeepOutstanding}
    isChildView={isChildView}
    todayDate={todayDate}
  />
)}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, whole suite passing.

Then run the app and check it by hand:

```bash
npm run dev
```

Visit `/quests` and confirm **no Upkeep tab appears** — the module is off by default and this is the regression that matters most for existing families.

- [ ] **Step 8: Commit**

```bash
git add src/components/quest-view-tabs.tsx src/components/quest-view-tabs.test.tsx src/components/upkeep-today-list.tsx "src/app/(app)/quests/page.tsx"
git commit -m "Add the Upkeep tab to the Quest Log

The tab does not exist until both toggles are on, so families who never
enable the module see no trace of it. Generation runs on load exactly as
quest generation does, a fortnight ahead so a weekly chore is visible
before its day arrives.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Parent task management in the Quest Giver

**Files:**
- Create: `src/components/upkeep-task-form.tsx`
- Create: `src/components/upkeep-task-list.tsx`
- Test: `src/components/upkeep-task-form.test.tsx`
- Modify: `src/app/(app)/scrolls/page.tsx`

**Interfaces:**
- Consumes: `createUpkeepTask`, `updateUpkeepTask`, `deleteUpkeepTask` (Task 10); `upsertUpkeepSchedule` (Task 9); `parseDollarsToCents`, `formatWagesAsDollars` (Task 1).
- Produces: `<UpkeepTaskForm childId={...} task={...|null} onDone={...} />`, `<UpkeepTaskList childId={...} tasks={...} />`

- [ ] **Step 1: Write the failing form test**

Create `src/components/upkeep-task-form.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpkeepTaskForm } from "./upkeep-task-form";

const createUpkeepTask = vi.fn().mockResolvedValue({ id: "t1", title: "Dishes" });

vi.mock("@/lib/actions/upkeep-tasks", () => ({
  createUpkeepTask: (...args: unknown[]) => createUpkeepTask(...args),
  updateUpkeepTask: vi.fn(),
}));
vi.mock("@/lib/actions/upkeep-schedules", () => ({ upsertUpkeepSchedule: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  createUpkeepTask.mockClear();
});

describe("UpkeepTaskForm", () => {
  it("converts the typed dollar amount to whole cents", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.type(screen.getByLabelText(/worth/i), "2.50");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "c1", title: "Dishes", valueCents: 250 })
    );
  });

  it("sends a null value when no amount is given", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} />);

    await user.type(screen.getByLabelText(/title/i), "Tidy the hall");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ valueCents: null })
    );
  });

  it("shows an error and does not submit an unparseable amount", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.type(screen.getByLabelText(/worth/i), "lots");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText(/amount like/i)).toBeInTheDocument();
    expect(createUpkeepTask).not.toHaveBeenCalled();
  });

  it("defaults a task to required", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ isRequired: true })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/upkeep-task-form.test.tsx`
Expected: FAIL — cannot resolve `./upkeep-task-form`.

- [ ] **Step 3: Write the form**

Create `src/components/upkeep-task-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createUpkeepTask, updateUpkeepTask } from "@/lib/actions/upkeep-tasks";
import { upsertUpkeepSchedule } from "@/lib/actions/upkeep-schedules";
import { parseDollarsToCents } from "@/lib/utils/wages";
import { formatDate } from "@/lib/utils/dates";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type ExistingTask = {
  id: string;
  title: string;
  description: string | null;
  valueCents: number | null;
  isRequired: boolean;
  rewardXp: number | null;
};

export function UpkeepTaskForm({
  childId,
  task,
  onDone,
}: {
  childId: string;
  task: ExistingTask | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  // Held as the string the parent typed; converted once, on submit.
  const [amount, setAmount] = useState(
    task?.valueCents != null ? (task.valueCents / 100).toFixed(2) : ""
  );
  const [isRequired, setIsRequired] = useState(task?.isRequired ?? true);
  const [rewardXp, setRewardXp] = useState(task?.rewardXp?.toString() ?? "");
  const [frequency, setFrequency] = useState<"once" | "daily" | "weekly" | "monthly">("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([]);

  function toggleDay(day: string) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function submit() {
    setError(null);

    if (!title.trim()) {
      setError("Give the task a name");
      return;
    }

    // An empty box means an unpaid task, which is different from zero.
    let valueCents: number | null = null;
    if (amount.trim()) {
      try {
        valueCents = parseDollarsToCents(amount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enter an amount like 2.50");
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload = {
          title,
          description: description.trim() || undefined,
          valueCents,
          isRequired,
          rewardXp: rewardXp.trim() ? parseInt(rewardXp, 10) : null,
        };

        if (task) {
          await updateUpkeepTask(task.id, payload);
          await upsertUpkeepSchedule(task.id, {
            frequency,
            daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
            startDate: formatDate(new Date()),
          });
        } else {
          await createUpkeepTask({
            childId,
            ...payload,
            schedule: {
              frequency,
              daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
              startDate: formatDate(new Date()),
            },
          });
        }
        onDone();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the task");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="upkeep-title">Title</Label>
        <Input
          id="upkeep-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feed the chickens"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-description">Description</Label>
        <Input
          id="upkeep-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="upkeep-amount">Worth (leave blank for an unpaid task)</Label>
        <Input
          id="upkeep-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="2.50"
          inputMode="decimal"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-xp">Reward XP (optional)</Label>
        <Input
          id="upkeep-xp"
          value={rewardXp}
          onChange={(e) => setRewardXp(e.target.value)}
          inputMode="numeric"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-frequency">How often</Label>
        <Select
          id="upkeep-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
        >
          <option value="once">Just once</option>
          <option value="daily">Every day</option>
          <option value="weekly">Certain days each week</option>
          <option value="monthly">Once a month</option>
        </Select>
      </div>

      {frequency === "weekly" && (
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={daysOfWeek.includes(day) ? "default" : "outline"}
              onClick={() => toggleDay(day)}
            >
              {day}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor="upkeep-required">Required</Label>
        <Switch
          checked={isRequired}
          onCheckedChange={() => setIsRequired((v) => !v)}
          aria-label="Required"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        An optional task still pays when it is done, but is never counted as missed.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button disabled={pending} onClick={submit}>
        Save
      </Button>
    </div>
  );
}
```

If `Select` in this codebase does not accept `id`/`value`/`onChange` in this form, match its actual API — check `src/components/ui/select.tsx` and follow how `quest-schedule-form.tsx` uses it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/upkeep-task-form.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the list component**

Create `src/components/upkeep-task-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { UpkeepTaskForm } from "@/components/upkeep-task-form";
import { deleteUpkeepTask } from "@/lib/actions/upkeep-tasks";
import { formatWagesAsDollars } from "@/lib/utils/wages";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  valueCents: number | null;
  isRequired: boolean;
  rewardXp: number | null;
};

export function UpkeepTaskList({
  childId,
  tasks,
}: {
  childId: string;
  tasks: TaskRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      await deleteUpkeepTask(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && !editing && (
        <Button onClick={() => setCreating(true)}>Add a task</Button>
      )}

      {(creating || editing) && (
        <GameFrame>
          <UpkeepTaskForm
            childId={childId}
            task={editing}
            onDone={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </GameFrame>
      )}

      {tasks.length === 0 && !creating && (
        <p className="text-muted-foreground">No tasks yet.</p>
      )}

      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="min-w-0">
            <h3 className="font-medium">{task.title}</h3>
            {task.description && (
              <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {task.valueCents == null ? "Unpaid" : formatWagesAsDollars(task.valueCents)}
              {!task.isRequired && " · Optional"}
              {task.rewardXp ? ` · +${task.rewardXp} XP` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(task)}>
              Edit
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => remove(task.id)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add the Upkeep tab to the Quest Giver page**

In `src/app/(app)/scrolls/page.tsx`, add imports:

```ts
import { loadUpkeepContext } from "@/lib/services/upkeep-context";
import { getUpkeepTasks } from "@/lib/actions/upkeep-tasks";
import { UpkeepTaskList } from "@/components/upkeep-task-list";
```

After the existing `Promise.all` that loads subjects/quests/etc., add:

```ts
  const upkeepContext = await loadUpkeepContext(activeChild.id);
  const upkeepTasks = upkeepContext?.enabled ? await getUpkeepTasks(activeChild.id) : [];
```

Then render, at the end of the page's main content:

```tsx
{upkeepContext?.enabled && (
  <section className="space-y-4">
    <h2 className="page-title text-2xl">Upkeep</h2>
    <p className="text-sm text-muted-foreground">
      Chores for {activeChild.displayName}. A task can be worth wages, repeat on a
      schedule, and be required or merely welcome.
    </p>
    <UpkeepTaskList childId={activeChild.id} tasks={upkeepTasks} />
  </section>
)}
```

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean and passing.

```bash
git add src/components/upkeep-task-form.tsx src/components/upkeep-task-form.test.tsx src/components/upkeep-task-list.tsx "src/app/(app)/scrolls/page.tsx"
git commit -m "Add upkeep task management to the Quest Giver

The form holds the typed amount as a string and converts once on submit
through parseDollarsToCents, so no partial input is ever turned into money
and an empty box stays an unpaid task rather than becoming zero.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Steward's Ledger, approval queue, and the wages panel

**Files:**
- Create: `src/components/stewards-ledger.tsx`
- Create: `src/components/upkeep-approval-queue.tsx`
- Create: `src/components/wages-panel.tsx`
- Test: `src/components/wages-panel.test.tsx`
- Modify: `src/app/(app)/scrolls/page.tsx`
- Modify: `src/app/(app)/loot/page.tsx`

**Interfaces:**
- Consumes: `getWageBalance`, `getWageLedger`, `recordWagePayout` (Task 12); `getUpkeepAwaitingApproval` (Task 11); `formatWagesAsCoin`, `formatWagesAsDollars` (Task 1); `UpkeepTaskCard` (Task 14).
- Produces: `<StewardsLedger childId={...} balanceCents={...} entries={...} />`, `<UpkeepApprovalQueue rows={...} today={...} />`, `<WagesPanel balanceCents={...} isChildView={...} />`

- [ ] **Step 1: Write the failing wages-panel test**

Create `src/components/wages-panel.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WagesPanel } from "./wages-panel";

afterEach(cleanup);

describe("WagesPanel", () => {
  it("shows a hero their balance in coin", () => {
    render(<WagesPanel balanceCents={1250} isChildView />);
    expect(screen.getByText("12 gp 5 sp")).toBeInTheDocument();
  });

  it("shows a parent the balance in currency", () => {
    render(<WagesPanel balanceCents={1250} isChildView={false} />);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  it("shows a zero balance rather than hiding the panel", () => {
    render(<WagesPanel balanceCents={0} isChildView />);
    expect(screen.getByText("0 gp")).toBeInTheDocument();
  });

  it("labels a negative balance as paid ahead", () => {
    render(<WagesPanel balanceCents={-500} isChildView={false} />);
    expect(screen.getByText(/paid ahead/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wages-panel.test.tsx`
Expected: FAIL — cannot resolve `./wages-panel`.

- [ ] **Step 3: Write the wages panel**

Create `src/components/wages-panel.tsx`:

```tsx
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { formatWagesAsCoin, formatWagesAsDollars } from "@/lib/utils/wages";

export function WagesPanel({
  balanceCents,
  isChildView,
}: {
  balanceCents: number;
  isChildView: boolean;
}) {
  const display = isChildView
    ? formatWagesAsCoin(balanceCents)
    : formatWagesAsDollars(balanceCents);

  return (
    <GameFrame>
      <div className="flex items-center gap-3 py-2">
        <GameIcon name="gem" className="size-8 text-[var(--gold-bright)]" />
        <div>
          <p className="text-sm text-muted-foreground">Wages earned</p>
          <p className="text-2xl font-medium">{display}</p>
          {balanceCents < 0 && (
            <p className="text-xs text-muted-foreground">Paid ahead</p>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wages-panel.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the ledger**

Create `src/components/stewards-ledger.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordWagePayout } from "@/lib/actions/wages";
import { formatWagesAsDollars } from "@/lib/utils/wages";

type LedgerEntry = {
  id: string;
  type: "earned" | "payout" | "reversal";
  amountCents: number;
  taskTitle: string | null;
  date: string;
  note: string | null;
};

const TYPE_LABELS: Record<LedgerEntry["type"], string> = {
  earned: "Earned",
  payout: "Paid",
  reversal: "Reversed",
};

export function StewardsLedger({
  childId,
  balanceCents,
  entries,
}: {
  childId: string;
  balanceCents: number;
  entries: LedgerEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pay() {
    setError(null);
    startTransition(async () => {
      try {
        // A positive amount; recordWagePayout applies the sign.
        await recordWagePayout(childId, amount, note || undefined);
        setAmount("");
        setNote("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record the payment");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Outstanding balance</p>
        <p className="text-2xl font-medium">{formatWagesAsDollars(balanceCents)}</p>
        {balanceCents < 0 && (
          <p className="text-xs text-muted-foreground">Paid ahead of what has been earned.</p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <Label htmlFor="payout-amount">Record a payment</Label>
        <div className="flex gap-2">
          <Input
            id="payout-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            inputMode="decimal"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            aria-label="Payment note"
          />
          <Button disabled={pending || !amount.trim()} onClick={pay}>
            Record
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-1">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
          >
            <div className="min-w-0">
              <span className="text-muted-foreground">{entry.date}</span>{" "}
              <span>{entry.taskTitle ?? TYPE_LABELS[entry.type]}</span>
              {entry.note && (
                <span className="text-muted-foreground"> — {entry.note}</span>
              )}
            </div>
            <span
              className={
                entry.amountCents < 0 ? "text-muted-foreground" : "text-[var(--gold-bright)]"
              }
            >
              {formatWagesAsDollars(entry.amountCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the approval queue**

Create `src/components/upkeep-approval-queue.tsx`:

```tsx
import { UpkeepTaskCard, type UpkeepCardData } from "@/components/upkeep-task-card";

export function UpkeepApprovalQueue({
  rows,
  today,
}: {
  rows: UpkeepCardData[];
  today: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="page-title text-xl">Awaiting your approval</h3>
      {rows.map((row) => (
        <UpkeepTaskCard
          key={row.assignment.id}
          data={row}
          isChildView={false}
          today={today}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 7: Mount the ledger and queue in the Quest Giver**

In `src/app/(app)/scrolls/page.tsx`, extend the upkeep loading added in Task 16:

```ts
  const upkeepContext = await loadUpkeepContext(activeChild.id);
  const upkeepEnabled = Boolean(upkeepContext?.enabled);
  const todayDate = formatDate(new Date());

  const [upkeepTasks, wageBalance, wageLedger, awaitingApproval] = upkeepEnabled
    ? await Promise.all([
        getUpkeepTasks(activeChild.id),
        getWageBalance(activeChild.id),
        getWageLedger(activeChild.id),
        getUpkeepAwaitingApproval(activeChild.id),
      ])
    : [[], 0, [], []];
```

Add the imports it needs:

```ts
import { formatDate } from "@/lib/utils/dates";
import { getWageBalance, getWageLedger } from "@/lib/actions/wages";
import { getUpkeepAwaitingApproval } from "@/lib/actions/upkeep-assignments";
import { StewardsLedger } from "@/components/stewards-ledger";
import { UpkeepApprovalQueue } from "@/components/upkeep-approval-queue";
```

Then render inside the Upkeep section from Task 16, after `<UpkeepTaskList .../>`:

```tsx
    <UpkeepApprovalQueue rows={awaitingApproval} today={todayDate} />

    <div className="space-y-3">
      <h3 className="page-title text-xl">Steward&apos;s Ledger</h3>
      <StewardsLedger
        childId={activeChild.id}
        balanceCents={wageBalance}
        entries={wageLedger}
      />
    </div>
```

- [ ] **Step 8: Mount the wages panel on Loot**

In `src/app/(app)/loot/page.tsx`, add:

```ts
import { loadUpkeepContext } from "@/lib/services/upkeep-context";
import { getWageBalance } from "@/lib/actions/wages";
import { WagesPanel } from "@/components/wages-panel";
```

After the existing `Promise.all` that loads badges and rewards:

```ts
  const upkeepContext = await loadUpkeepContext(activeChild.id);
  const wageBalance = upkeepContext?.enabled ? await getWageBalance(activeChild.id) : null;
```

And render above the badge grid:

```tsx
{wageBalance !== null && (
  <WagesPanel balanceCents={wageBalance} isChildView={isChildView} />
)}
```

- [ ] **Step 9: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean and passing.

```bash
git add src/components/stewards-ledger.tsx src/components/upkeep-approval-queue.tsx src/components/wages-panel.tsx src/components/wages-panel.test.tsx "src/app/(app)/scrolls/page.tsx" "src/app/(app)/loot/page.tsx"
git commit -m "Add the Steward's Ledger, approval queue, and wages panel

Heroes see their balance in coin on the Loot page; parents manage the
ledger and record payments from the Quest Giver. The ledger renders the
append-only history as-is, so a reversal reads as its own line rather than
a deletion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Settings toggles

**Files:**
- Create: `src/app/(app)/settings/upkeep-settings-panel.tsx`
- Create: `src/app/(app)/settings/child-upkeep-toggle.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/(app)/settings/child-list.tsx`

The per-child toggle is a separate file rather than more code inside `child-list.tsx`, which is already 1350 lines.

**Interfaces:**
- Consumes: `setFamilyUpkeepEnabled`, `setFamilyUpkeepRequiresApproval`, `setChildUpkeepEnabled` (Task 8).
- Produces: `<UpkeepSettingsPanel enabled={...} requiresApproval={...} />`, `<ChildUpkeepToggle childId={...} enabled={...} disabled={...} />`

- [ ] **Step 1: Write the family panel**

Create `src/app/(app)/settings/upkeep-settings-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import {
  setFamilyUpkeepEnabled,
  setFamilyUpkeepRequiresApproval,
} from "@/lib/actions/upkeep-settings";

export function UpkeepSettingsPanel({
  enabled: initialEnabled,
  requiresApproval: initialRequiresApproval,
}: {
  enabled: boolean;
  requiresApproval: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [requiresApproval, setRequiresApproval] = useState(initialRequiresApproval);

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      await setFamilyUpkeepEnabled(next);
      router.refresh();
    });
  }

  function toggleApproval() {
    const next = !requiresApproval;
    setRequiresApproval(next);
    startTransition(async () => {
      await setFamilyUpkeepRequiresApproval(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Upkeep</p>
          <p className="text-sm text-muted-foreground">
            Track chores alongside school. Tasks can be worth wages, repeat on a
            schedule, and be required or merely welcome.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggleEnabled}
          disabled={pending}
          aria-label="Enable Upkeep"
        />
      </div>

      {enabled && (
        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="font-medium">Approve completed tasks</p>
            <p className="text-sm text-muted-foreground">
              When on, a hero marking a task done waits for a grown-up before any
              wages are earned.
            </p>
          </div>
          <Switch
            checked={requiresApproval}
            onCheckedChange={toggleApproval}
            disabled={pending}
            aria-label="Require approval for completed tasks"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the per-child toggle**

Create `src/app/(app)/settings/child-upkeep-toggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setChildUpkeepEnabled } from "@/lib/actions/upkeep-settings";

export function ChildUpkeepToggle({
  childId,
  enabled: initialEnabled,
  /** True when the family switch is off — the per-hero choice has no effect then. */
  familyDisabled,
}: {
  childId: string;
  enabled: boolean;
  familyDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);

  if (familyDisabled) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Upkeep</p>
        <p className="text-xs text-muted-foreground">
          Whether this hero has chores of their own.
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={() => {
          const next = !enabled;
          setEnabled(next);
          startTransition(async () => {
            await setChildUpkeepEnabled(childId, next);
            router.refresh();
          });
        }}
        disabled={pending}
        aria-label="Upkeep for this hero"
      />
    </div>
  );
}
```

- [ ] **Step 3: Mount the family panel**

In `src/app/(app)/settings/page.tsx`:

- Add `import { UpkeepSettingsPanel } from "./upkeep-settings-panel";`
- The page already narrows `family` to `{ id, familyName, timezone }`. Widen that type annotation and both queries to also select `upkeepEnabled` and `upkeepRequiresApproval`.
- Render, in the adult-only section alongside the other family settings:

```tsx
{!isChildView && family && (
  <GameFrame>
    <UpkeepSettingsPanel
      enabled={family.upkeepEnabled}
      requiresApproval={family.upkeepRequiresApproval}
    />
  </GameFrame>
)}
```

- [ ] **Step 4: Mount the per-child toggle**

In `src/app/(app)/settings/child-list.tsx`, import `ChildUpkeepToggle` and render it in each child's settings block, passing `childId={child.id}`, `enabled={child.upkeepEnabled}`, and `familyDisabled={!familyUpkeepEnabled}`. Thread `familyUpkeepEnabled` down from the page as a prop on `ChildList`; the child rows must already carry `upkeepEnabled`, so include it in whatever query supplies them.

- [ ] **Step 5: Verify by hand**

Run: `npm run typecheck && npm test`, then `npm run dev` and walk the whole loop:

1. `/settings` — Upkeep is **off**. Confirm `/quests` shows no Upkeep tab.
2. Turn Upkeep on. `/quests` now shows the tab; the per-child toggle appears and is already on.
3. `/scrolls` — add a task worth `2.50`, repeating daily.
4. `/quests` Upkeep tab — the task appears showing `2 gp 5 sp`. Mark it done.
5. `/loot` — the wages panel reads `2 gp 5 sp`.
6. `/scrolls` — the ledger shows one `$2.50` earned line. Record a `$2.50` payment; the balance returns to `$0.00` and the history shows both lines.
7. Turn on "Approve completed tasks", mark another task done as a hero, and confirm it waits in the approval queue and posts no wages until approved.
8. Turn the family switch back off and confirm every upkeep surface disappears.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/settings/upkeep-settings-panel.tsx" "src/app/(app)/settings/child-upkeep-toggle.tsx" "src/app/(app)/settings/page.tsx" "src/app/(app)/settings/child-list.tsx"
git commit -m "Add Upkeep settings toggles

Family master switch plus a per-hero opt-out, which is hidden entirely
while the family switch is off since it has no effect there. The per-child
toggle is its own file rather than more code in child-list.tsx, which is
already 1350 lines.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Steward's Renown leaderboard category and final polish

**Files:**
- Modify: `src/lib/actions/leaderboard.ts`
- Modify: `src/components/leaderboard-tabs.tsx`
- Modify: `src/components/nav-items.ts`

**Interfaces:**
- Consumes: `child.upkeepXp` (Task 6).
- Produces: `LeaderboardCategory` gains `"upkeep"`.

- [ ] **Step 1: Add the category to the action**

In `src/lib/actions/leaderboard.ts`:

Widen the type:

```ts
export type LeaderboardCategory = "xp" | "streak" | "longestStreak" | "badges" | "upkeep";
```

Extend the `orderColumn` chain in `getCommunityLeaderboard` so `"upkeep"` maps to `schema.child.upkeepXp`:

```ts
  const orderColumn =
    category === "xp"
      ? schema.child.currentXp
      : category === "streak"
        ? schema.child.currentStreak
        : category === "longestStreak"
          ? schema.child.longestStreak
          : category === "upkeep"
            ? schema.child.upkeepXp
            : null;
```

Then, in the shared query below the `badges` branch, add the upkeep filter. Families who never enabled the module must not pad the board with zeroes:

```ts
  // Chore XP is ranked separately from school XP so that doing chores can
  // never inflate — or be crowded out of — the school standings. Only heroes
  // who have actually earned any appear at all.
  const categoryFilter =
    category === "upkeep" ? [gt(schema.child.upkeepXp, 0)] : [];
```

and include `...categoryFilter` in that query's `and(...)`. Add `gt` to the `drizzle-orm` import at the top of the file.

Also add `upkeepXp: schema.child.upkeepXp` to the `getFamilyLeaderboard` select so the family board can show the column.

**Wages must not appear here.** The community board spans families, and ranking children by household money is not a comparison this app should create. XP only.

- [ ] **Step 2: Add the label**

In `src/components/leaderboard-tabs.tsx`, add to `CATEGORY_LABELS`:

```ts
  upkeep: { label: "Steward's Renown", valueLabel: "Renown" },
```

Add `upkeepXp: number` to the `FamilyEntry` type, and render it in the family table wherever the other category columns are rendered.

- [ ] **Step 3: Reword the nav description**

In `src/components/nav-items.ts`, the Quest Log entry currently promises chores to every family, including those with the module off. Change its `description` to:

```ts
    description: "Your quests for today — complete them to earn XP and rewards.",
```

- [ ] **Step 4: Full verification**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all four clean. `npm test` must show every pre-existing test still passing plus the new ones — roughly 80 new assertions across `wages`, `upkeep-status`, `upkeep-enabled`, `upkeep-planning`, `upkeep-isolation`, `upkeep-task-card`, `upkeep-task-form`, `quest-view-tabs`, and `wages-panel`.

- [ ] **Step 5: Confirm the school side is untouched**

This is the regression that matters. With the module **on** and a task completed:

```bash
sqlite3 local.db "SELECT current_xp, upkeep_xp, current_streak FROM child WHERE id = '<the child id>';"
sqlite3 local.db "SELECT count(*) FROM activity_log WHERE child_id = '<the child id>';"
```

Expected: `upkeep_xp` reflects the chore XP; `current_xp` and `current_streak` are **unchanged** from before the task was completed; the `activity_log` count is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/leaderboard.ts src/components/leaderboard-tabs.tsx src/components/nav-items.ts
git commit -m "Add the Steward's Renown leaderboard category

Ranks child.upkeepXp separately from school XP, so chores can neither
inflate school standings nor be crowded out of them, and filters to heroes
who have actually earned some. Wages are deliberately absent: the
community board spans families, and ranking children by household money is
not a comparison this app should create.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done

At this point the module is complete and behind two toggles that are off by default. Follow up with `superpowers:requesting-code-review` before merging `feature/upkeep-module`.
