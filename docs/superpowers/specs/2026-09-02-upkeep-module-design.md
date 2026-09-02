# Upkeep — chore tracking module

**Date:** 2026-09-02
**Status:** Approved design, ready for implementation planning

## 1. Purpose

Kingdoms & Crowns tracks homeschool work. This adds a second, **optional**
track for household chores: a parent assigns tasks, each with an optional
dollar value, an expected frequency, and a required/optional flag. Children
complete them and accrue wages the parent settles up.

The module is off until a family turns it on. Nothing about it may change how
the school side behaves for families that never enable it.

### Goals

- Parents assign recurring chores per child, with an optional money value.
- Children see today's tasks and mark them done.
- The app tracks what each child has earned and what has been paid out.
- Chores can grant XP and rank on their own leaderboard category without
  distorting school standings.

### Non-goals (deliberately excluded)

Manual ledger adjustments (bonuses/fines); chores shared across or rotating
between children; chore reminders or push notifications; a Tavern dashboard
panel; chore-specific badges; spending the balance inside the app.

## 2. Terminology

| Concept | Name |
|---|---|
| The module / section | **Upkeep** (D&D: maintaining a stronghold; ties to the existing Castle system) |
| One assignable item | a **task** (`upkeepTask` in code — a bare `task` table would be ambiguous) |
| Money earned | **wages** |
| Parent-side management view | **Steward's Ledger** |

"Upkeep" is a mass noun, so it names the section while `task` names the row.
This matches existing practice: the **Quest Giver** page manages `quest` rows,
**Treasure Chest** shows `badge` rows, **Ranks** renders the leaderboard.

## 3. Money representation

All money is stored as **signed integer cents** (`valueCents`, `amountCents`).
No floating point anywhere in the money path.

Display is audience-dependent, from one pure formatter module:

- **Children** see gold pieces. D&D's ratios (1 gp = 10 sp = 100 cp) map exactly
  onto dollars, dimes and cents, so no exchange rate is invented: `1250` renders
  as `12 gp 5 sp`.
- **Parents** see currency: `1250` renders as `$12.50`.

Formatting rules:

| cents | child | parent |
|---|---|---|
| 0 | `0 gp` | `$0.00` |
| 1250 | `12 gp 5 sp` | `$12.50` |
| 1200 | `12 gp` | `$12.00` |
| 50 | `5 sp` | `$0.50` |
| 1253 | `12 gp 5 sp 3 cp` | `$12.53` |
| -500 | `-5 gp` | `-$5.00` |

Zero-valued denominations are omitted, except that an all-zero amount renders
as `0 gp` / `$0.00`.

## 4. Data model

Four new tables in `src/lib/db/schema.ts`, following the file's existing
conventions (`text` ids from nanoid, `integer` timestamps, cascade deletes from
`child`).

### 4.1 `upkeep_task`

The template a parent defines. Mirrors `quest`.

| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `childId` | text notNull → `child.id` cascade | tasks belong to one hero |
| `title` | text notNull | |
| `description` | text | |
| `valueCents` | integer **nullable** | null = an unpaid task; shows no wages, posts nothing to the ledger |
| `isRequired` | boolean notNull default **true** | false = optional; see §6 |
| `rewardXp` | integer nullable | optional XP grant |
| `estimatedMinutes` | integer nullable | |
| `isActive` | boolean notNull default true | soft delete, as `quest` does |
| `sortOrder` | integer notNull default 0 | |
| `createdAt`/`updatedAt` | timestamp notNull | |

Index: `upkeep_task_child_active_idx` on (`childId`, `isActive`).

### 4.2 `upkeep_task_schedule`

Structurally identical to `quest_schedule`.

| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `taskId` | text notNull unique → `upkeep_task.id` cascade | at most one schedule per task |
| `frequency` | enum `once` \| `daily` \| `weekly` \| `monthly` | |
| `daysOfWeek` | text | JSON array, used when weekly |
| `intervalWeeks` | integer | used when weekly; 1 = every week |
| `startDate` | text notNull | ISO YYYY-MM-DD |
| `endDate` | text | null = indefinite |
| `createdAt` | timestamp notNull | |

A task with no schedule row is a one-off with no materialization — it is only
assigned if a parent creates the assignment directly.

### 4.3 `upkeep_task_assignment`

One materialized row per (task, date). Mirrors `quest_assignment`.

| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `taskId` | text notNull → `upkeep_task.id` cascade | |
| `childId` | text notNull → `child.id` cascade | |
| `date` | text notNull | ISO YYYY-MM-DD |
| `status` | enum `pending` \| `awaiting_approval` \| `completed` \| `excused` notNull default `pending` | see §5 |
| `completedAt` | timestamp | |
| `completedByUserId` | text, **no FK** | may be `child:<id>`; see note below |
| `approvedAt` | timestamp | |
| `approvedByUserId` | text, **no FK** | |
| `notes` | text | the child's own note about the work |
| `statusReason` | text | why it was excused, or why an approval was rejected |
| `createdAt`/`updatedAt` | timestamp notNull | |

Indexes: unique (`childId`, `taskId`, `date`); (`childId`, `date`);
(`childId`, `status`, `date`).

`completedByUserId` / `approvedByUserId` are deliberately not foreign keys, for
the same reason `parent_alert_dismissal.userId` is not: PIN children and the
demo actor have no row in `user`, and the record is worth keeping regardless.

### 4.4 `wage_ledger_entry`

Append-only. Never updated, never deleted.

| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `childId` | text notNull → `child.id` cascade | |
| `type` | enum `earned` \| `payout` \| `reversal` notNull | |
| `amountCents` | integer notNull | signed: `earned` positive, `payout` and `reversal` negative |
| `taskAssignmentId` | text → `upkeep_task_assignment.id` on delete set null | null for payouts |
| `taskTitle` | text | snapshot of the task's title at the time |
| `date` | text notNull | ISO date the wage was earned or paid |
| `note` | text | e.g. "paid in cash" |
| `createdByUserId` | text, no FK | |
| `createdAt` | timestamp notNull | |

Index: `wage_ledger_child_idx` on (`childId`, `createdAt`).

Two design points:

- **`taskTitle` is snapshotted**, following the `parent_alert` precedent: a
  ledger line must still read correctly after the task is renamed or retired.
- **Un-completing a paid task posts a `reversal` entry rather than deleting the
  `earned` one.** History stays auditable, and the balance is always plainly
  `SUM(amountCents)`.

`type` is a closed set of three system-generated kinds. It is *not* an opening
for parent-entered adjustments, which are out of scope.

A parent records a payout by entering a positive dollar amount ("paid $10");
`parseDollarsToCents` rejects negative input, and `recordWagePayout` negates the
parsed value when writing `amountCents`. The sign convention lives in exactly
one place, so the balance is always `SUM(amountCents)` with no special cases.

### 4.5 New columns on existing tables

On `family`:

- `upkeepEnabled` boolean notNull default **false** — the module's master switch.
- `upkeepRequiresApproval` boolean notNull default **false** — see §5.

On `child`:

- `upkeepEnabled` boolean notNull default **true**
- `upkeepXp` integer notNull default 0

The child default is `true` on purpose. The family switch is the real gate; a
parent who flips it on should immediately see it working for every hero, and
opt individual children *out*. Defaulting the child flag to false would make
enabling the module appear to do nothing.

All new columns have defaults, so the migration is additive and safe on
existing rows.

## 5. Status lifecycle

```
                 child or parent marks done
   pending ─────────────────────────────────────► completed
      │                                              ▲   │
      │  (approval on) child marks done              │   │  parent un-completes
      ▼                                              │   ▼
  awaiting_approval ──── parent approves ────────────┘  pending
      │
      └──── parent rejects (statusReason set) ──────► pending

   pending ──── parent excuses (statusReason set) ──► excused
```

- With `upkeepRequiresApproval` **off**, a child marking a task done goes
  straight to `completed`.
- With it **on**, a child marking done goes to `awaiting_approval`; a parent
  marking done goes straight to `completed` (they are the approver).
- Rejection returns the row to `pending` with `statusReason` set, so the child
  sees why, rather than adding a fifth status.
- `excused` is parent-only, for "we were travelling" — it suppresses the missed
  derivation in §6 without pretending the work was done.

There is **no child-facing skip.** A task the child does not do simply stays
`pending` and derives as missed. This is a deliberate divergence from quests
(which have `skipQuestsEnabled` and `skipped`/`stuck` statuses): chores do not
need an escape hatch with a reason attached, and leaving it out removes a
status, a parent toggle, and an alert path.

### Transitions drive all crediting

A single pure function decides every side effect:

```
resolveUpkeepTransition(prevStatus, nextStatus)
  -> { postWages, reverseWages, grantXp, revokeXp }
```

Wages and XP are credited **only** on a transition into `completed` from a
non-`completed` status, and reversed only on a transition out of `completed`.
This is the one guard against double-paying, and it is unit-testable with no
database. `computeAssignmentNet(entries)` in the wages module is a second,
belt-and-braces check that an assignment's ledger net is 0 before posting.

XP revocation clamps at zero (`max(0, upkeepXp - rewardXp)`), matching how
[quest-assignments.ts](../../../src/lib/actions/quest-assignments.ts) already
handles un-completing a quest.

## 6. Required vs optional, and "missed"

`isRequired` defaults to true. An optional task is a nice-to-have:

- It still appears on the child's list.
- It still pays and still grants XP when done.
- It **never** reads as missed and never appears in any "outstanding" count.

**`missed` is derived, never stored.** A task is missed when:

```
isRequired && status === "pending" && date < today
```

This is why "shows as missed, no alert" costs almost nothing: no nightly sweep,
no extra status, no background job, no state that can fall out of sync. It is a
pure function over rows the app already loads.

Missed tasks surface in the parent's Upkeep tab as outstanding, and can be
marked done late (which pays normally) or excused.

**Upkeep raises no parent alerts in v1.** The alert bell currently means "a hero
told you something about school" (`quest_skipped`, `quest_stuck`), and a missed
chore is an absence of action rather than a statement. Keeping chores out of the
bell preserves what the bell means. Revisitable later.

## 7. Recurrence

`getScheduledDates` in [schedule.ts](../../../src/lib/utils/schedule.ts) is
already pure, tested, and takes a nullable `schoolDays`. Upkeep reuses it
**unchanged**, passing `schoolDays: null`.

That single argument is the whole divergence from quests: quest generation
filters to the hero's school days, while chores run any day of the week
including weekends and school breaks.

Generation is triggered the same way quest generation is: idempotently on load
of the pages that read the data — `/quests` and `/scrolls` — and only when the
module is enabled for that family and child. There is no cron or background job.

`findStaleAssignmentIds` in
[assignment-pruning.ts](../../../src/lib/utils/assignment-pruning.ts) is also
domain-agnostic apart from one field name. Its `questId` field is renamed to
`sourceId` (and `questIsActive` to `sourceIsActive`) so both domains share it.
This is a pure rename inside a pure module; its existing tests carry over with
the field renamed, and the two quest-side callers are updated.

## 8. Isolation from the school side

These are invariants, each with its own test:

1. Completing an upkeep task writes **no** `activity_log` row.
2. It never modifies `currentStreak` or `longestStreak`.
3. It never appears in the learning log.
4. Chore XP accrues to `child.upkeepXp`, **never** to `child.currentXp`.
5. No existing quest/school query is modified by this feature.

Point 4 is a correctness requirement, not tidiness:
[activities.ts](../../../src/lib/actions/activities.ts) recomputes
`currentXp = activityCount * 10 + bonusXp` whenever an activity is logged, so
any chore XP folded into `currentXp` would be silently erased the next time the
child logged schoolwork.

### Leaderboard

`LeaderboardCategory` gains one member, `upkeep`, labelled **"Steward's Renown"**
with a value label of **"Renown"**, ranking by `child.upkeepXp`. The community query filters to `upkeepXp > 0` so
families who never enabled the module do not pad the board with zeroes. It joins
the existing `CATEGORY_LABELS` map and the combined "all" view.

**Wages never appear on any leaderboard.** The community board spans families,
and ranking children by household money is not a comparison this app should
create. XP only.

## 9. Enablement

A single pure helper is the only place the two toggles are combined:

```
isUpkeepEnabled(family: { upkeepEnabled }, child: { upkeepEnabled }) -> boolean
  = family.upkeepEnabled && child.upkeepEnabled
```

Every surface — nav description, tabs, actions, generation — asks this one
function. Server actions that mutate upkeep data check it and throw when the
module is off, so a stale client cannot write chore rows into a family that has
the module disabled.

## 10. Module layout

### Pure modules (no database, unit-tested first)

| Module | Responsibility |
|---|---|
| `src/lib/utils/wages.ts` | `formatWagesAsCoin`, `formatWagesAsDollars`, `parseDollarsToCents`, `computeBalance`, `computeAssignmentNet` |
| `src/lib/utils/upkeep-status.ts` | `deriveUpkeepStatus(assignment, today)`, `resolveUpkeepTransition(prev, next)`, `summarizeUpkeepDay(assignments, today)` |
| `src/lib/utils/upkeep-enabled.ts` | `isUpkeepEnabled(family, child)` |
| `src/lib/utils/schedule.ts` | **unchanged**, reused with `schoolDays: null` |
| `src/lib/utils/assignment-pruning.ts` | `questId` → `sourceId` rename so both domains share it |

Per the project's `"use server"` constraint, all shared constants and types live
in these plain modules and are never exported from action files.

### Server actions and services

| File | Responsibility |
|---|---|
| `src/lib/actions/upkeep-tasks.ts` | task CRUD (`getUpkeepTasks`, `createUpkeepTask`, `updateUpkeepTask`, `deleteUpkeepTask`) |
| `src/lib/actions/upkeep-schedules.ts` | schedule CRUD, mirroring `quest-schedules.ts` |
| `src/lib/actions/upkeep-assignments.ts` | `generateUpkeepAssignments`, `getUpkeepAssignmentsForDate`, `markUpkeepDone`, `approveUpkeep`, `rejectUpkeep`, `excuseUpkeep`, `uncompleteUpkeep` |
| `src/lib/actions/wages.ts` | `getWageBalance`, `getWageLedger`, `recordWagePayout` |
| `src/lib/actions/upkeep-settings.ts` | family and per-child toggles |
| `src/lib/services/upkeep-assignment-sync.ts` | prune stale pending assignments; mirrors `quest-assignment-sync.ts` |

All parent-entered text passes through the existing `sanitizeName` / `sanitizeText`
helpers before storage, exactly as `createQuest` does — titles via `sanitizeName`,
descriptions, notes and `statusReason` via `sanitizeText`.

### Authorization

New guards in [access.ts](../../../src/lib/auth/access.ts), following the shape
of `requireQuestAccess` / `requireAssignmentAccess`:

- `requireUpkeepTaskAccess(taskId, { write })`
- `requireUpkeepAssignmentAccess(assignmentId, { write })`

Adult-only actions (`approveUpkeep`, `rejectUpkeep`, `excuseUpkeep`,
`recordWagePayout`, and all task/schedule/settings mutations) additionally call
`requireAdultActor()`. Generation and `markUpkeepDone` must remain callable by a
child acting on their own profile, exactly as
`generateAssignmentsFromSchedules` is.

### Accepted duplication

`upkeep-assignment-sync.ts` will be structurally parallel to
`quest-assignment-sync.ts` (roughly 120 lines of similar shape). Abstracting the
Drizzle table plumbing behind a generic would cost more in unreadable type
gymnastics than the duplication saves. The *decision* logic — recurrence
expansion and staleness — is genuinely shared; only the table access repeats.

## 11. UI surfaces

Every surface below renders only when `isUpkeepEnabled` is true for the active
family and child.

**`/quests` — Quest Log (child and parent).** A third tab in `QuestViewTabs`
alongside Today and Complete Adventure, labelled **Upkeep**. Lists today's
tasks with their wage, a done control, and a notes field. Missed required tasks
from earlier dates appear in an "Still owing" group above today's.

**`/scrolls` — Quest Giver (parent only).** An **Upkeep** tab holding:
- task template CRUD — title, description, value (entered in dollars, stored as
  cents), frequency with the same controls as the quest schedule form,
  required/optional, optional XP;
- the approval queue when `upkeepRequiresApproval` is on;
- the **Steward's Ledger** — running balance, entry history, and a
  "Record payment" action that posts a `payout` entry.

**`/loot` — Treasure Chest.** A **Wages** panel showing the current balance:
gold pieces for a hero viewing their own chest, dollars for a parent.

**`/settings`.** Family section gains the Upkeep master toggle and the
"require approval" toggle. The child list gains a per-child Upkeep toggle.

**`/leaderboard` — Ranks.** The new "Steward's Renown" category.

**`nav-items.ts`.** Quest Log's description currently reads "Your tasks and
chores." — reword so it does not promise chores to families with the module off.

## 12. Test plan (TDD order)

Written before their implementation, in this order.

**`wages.test.ts`** — every row of the §3 formatting table; parse accepts
`"12.50"`, `"12"`, `".50"`, `"$12.50"` and rejects `""`, `"abc"`, negatives;
`computeBalance` over mixed earned/payout/reversal entries; balance may go
negative when a parent overpays; `computeAssignmentNet` returns 0 for an
earned+reversal pair.

**`upkeep-status.test.ts`** — a required past pending task is missed; an
optional past pending task is not; a past `completed`, `excused` or
`awaiting_approval` task is not; today's pending task is not missed;
`resolveUpkeepTransition` grants on pending→completed and
awaiting_approval→completed, grants nothing on pending→awaiting_approval,
pending→excused or completed→completed, and reverses on completed→pending.

**`upkeep-enabled.test.ts`** — family off overrides child on; both on is on.

**`assignment-pruning.test.ts`** — existing tests, field renamed; behaviour
unchanged.

**Assignment generation** — a daily task generates on Saturday and Sunday
(the key divergence from quests); a weekly task honours `daysOfWeek` and
`intervalWeeks`; generation is idempotent across repeat calls; a school break
does not suppress chores.

**Crediting** — approval posts exactly one `earned` entry; approving an already
completed task posts none; `awaiting_approval` posts nothing; rejection posts
nothing and sets `statusReason`; a complete→uncomplete→complete cycle leaves a
net of exactly one task value; a task with `valueCents` null posts no entry but
still grants XP if `rewardXp` is set.

**Isolation** — completing an upkeep task creates no `activity_log` row, leaves
`currentStreak` and `currentXp` unchanged, and increments only `upkeepXp`.

**Enablement enforcement** — an upkeep mutation throws when the family toggle
is off.

**Components** — the Upkeep tab does not render when the module is off; task
cards show wages in coin for a child and dollars for a parent.

## 13. Migration

Schema edits go in `src/lib/db/schema.ts`, then `npm run db:generate` followed
by `npm run db:migrate`, per this project's workflow. Verify the generated SQL
in `src/lib/db/migrations/` before migrating rather than trusting the hook.

All four new tables are additive and all new columns on `family` and `child`
carry defaults, so no backfill script is needed.
