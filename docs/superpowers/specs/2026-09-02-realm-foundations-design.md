# Realm Foundations — Design

**Date:** 2026-09-02
**Slice:** 1 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`)
**Status:** Approved in brainstorming; awaiting written-spec review

## Goal

Put in place everything the three.js Realm will read from, without any 3D: a season and crown
record per hero, per-hero Realm settings a parent controls, scheduled recess blocks, a learning
profile of accommodation toggles, an append-only play-time ledger with the access rules that read
it, and a single tested level formula. When this slice ships, a parent can fully configure the
Realm for each hero, begin and end seasons, and see earned crowns, even though the Realm itself
does not exist yet.

## Non-goals

No 3D, spells, drill content, mounts, or the heartbeat that spends play minutes. No changes to
existing schedule blocks, quests, or XP rules beyond extracting the level formula.

## A. Seasons and Crowns

### Data

New table `season`:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `childId` | text FK child, cascade | |
| `grade` | text | `"K"`, `"1"`..`"12"`, snapshot at start |
| `ordinal` | integer | 1 for the hero's first season, 2 for the second, and so on |
| `startDate` | text | ISO `YYYY-MM-DD` |
| `endDate` | text, nullable | ISO date, set on end |
| `completedAt` | integer timestamp, nullable | null means the season is open |
| `crownId` | text, nullable | catalog id minted on a qualifying end |
| `createdAt`, `updatedAt` | integer timestamp | |

Indexes: `season_child_idx` on `childId`; partial unique index `season_open_unique_idx` on
`childId` where `completed_at IS NULL`, so a hero has at most one open season.

`ordinal` is stored, not derived, so a crown's tier never changes if history rows are later
removed. On begin, ordinal = (count of this hero's seasons) + 1.

### Crown catalog

`src/lib/utils/crown-catalog.ts` exports `CROWNS: CrownTier[]`, thirteen entries keyed by
ordinal 1..13, each `{ ordinal, id, label, description, icon, color }`. Labels ascend from
"Copper Circlet" through silver, gold, jeweled, and radiant tiers. `crownForOrdinal(ordinal)`
returns the tier for that ordinal, clamping ordinals above 13 to the final tier.

### Rules (`src/lib/utils/seasons.ts`)

- `seasonLabel(startDate)` → `"2026–27"` style label from the start year.
- `MIN_ACTIVE_DAYS_FOR_CROWN = 20`.
- `seasonQualifiesForCrown(activeDayCount)` → boolean.
- `nextOrdinal(existingSeasonCount)` → number.
- `crownForOrdinal` re-exported for convenience.

### Actions (`src/lib/actions/seasons.ts`)

- `getSeasons(childId)` — all seasons newest first, plus the open one. Child may read own.
- `beginSeason(childId, { grade, startDate })` — parent only. Rejects if a season is open.
  Validates grade with `isValidGrade` and date format. Updates `child.grade` and `child.ageMode`
  through `resolveAge`, which moves from the children action file into `src/lib/utils/age-mode.ts`
  (it is pure, and `"use server"` files may only export async functions); the children action
  imports it from there. Inserts the season.
- `endSeason(childId, { endDate })` — parent only. Rejects if no season is open or if
  `endDate < startDate`. Counts distinct `activity_log.date` values within
  `[startDate, endDate]`. If qualified, sets `crownId = crownForOrdinal(ordinal).id`. Sets
  `endDate`, `completedAt`. Returns `{ crownId | null, activeDays }` so the UI can explain.
- `previewSeasonEnd(childId, endDate)` — read-only: returns `activeDays` and whether it qualifies,
  used by the End the Season confirmation.

Revalidates `/settings`, `/loot`, `/tavern`.

### UI

- **Season panel** (`src/app/(app)/settings/season-panel.tsx`), parent-only, inside the hero's
  Chronicle: shows the open season (grade, label, start date, active days so far) with an
  "End the Season" button that opens a confirm dialog stating whether a crown will be earned and
  why. When no season is open, shows "Begin the Season" with grade (pre-filled from the child)
  and start date (defaults to today). Below, a compact history list of past seasons with crown
  icon or "no crown".
- **Crowns panel** on `/loot` (`src/components/crowns-panel.tsx`): earned crowns with tier label
  and season label. Empty state copy invites the parent to begin a season.
- **Tavern HUD**: crown count beside level, only when greater than zero.

## B. Realm Settings and Learning Profile

### `realm_settings` (one row per hero, created lazily with defaults on first read)

| Column | Type | Default |
|---|---|---|
| `id` | text PK | |
| `childId` | text FK child, cascade, unique | |
| `enabled` | boolean | true |
| `accessMode` | text enum `earned`, `scheduled`, `both` | `earned` |
| `earnedMinutesPerQuest` | integer | 5 |
| `offHoursEnabled` | boolean | false |
| `dailyCapMinutes` | integer | 30 |
| `toneMode` | text enum `gentle`, `monsters` | `gentle` |
| `createdAt`, `updatedAt` | timestamp | |

Validation: `earnedMinutesPerQuest` 0..60, `dailyCapMinutes` 5..240.

### `recess_block`

| Column | Type |
|---|---|
| `id` | text PK |
| `childId` | text FK child, cascade |
| `dayOfWeek` | text enum mon..sun |
| `startTime`, `endTime` | text `"HH:mm"` |
| `createdAt`, `updatedAt` | timestamp |

Index on `(childId, dayOfWeek)`. Separate from `schedule_block` on purpose: thirteen files
assume a schedule block has a subject.

`src/lib/utils/recess-blocks.ts` exports `findRecessConflict(candidate, classBlocksSameDay,
recessBlocksSameDay)` which reuses `timeRangesOverlap` from `schedule-days.ts` (not
`timeRangesConflict`, which deliberately permits identical ranges for class-on-class) and returns
the first overlapping block or null. Any overlap with a class block or another recess block is a
conflict, identical ranges included, and the test says so.

### `learning_profile` (one row per hero, lazy defaults)

| Column | Type | Default | Meaning |
|---|---|---|---|
| `id` | text PK | | |
| `childId` | text FK child, cascade, unique | | |
| `readingFont` | boolean | false | Use Lexend across the app for this hero |
| `largerText` | boolean | false | Bump base font size |
| `extraSpacing` | boolean | false | Wider line height and letter spacing |
| `readAloud` | boolean | false | Offer text-to-speech in drills (consumed in slice 3) |
| `untimed` | boolean | false | No countdown timers in trials |
| `sessionMinutes` | integer, nullable | null | Suggest a break after N minutes in the Realm |
| `fewerChoices` | boolean | false | Two answer choices instead of four |
| `reducedMotion` | boolean | false | Force reduced motion regardless of OS setting |
| `lowStimulus` | boolean | false | Fewer particles, muted palette, no shake or flashing |
| `predictableRoutine` | boolean | false | Fixed activity order, warn before transitions |
| `soundEnabled` | boolean | true | |
| `inputMode` | text enum `auto`, `touch`, `keyboard` | `auto` | |
| `createdAt`, `updatedAt` | timestamp | | |

No column stores a diagnosis, condition, or preset name.

`src/lib/utils/learning-profile.ts`:
- `LearningProfile` type and `DEFAULT_LEARNING_PROFILE`.
- `LEARNING_PRESETS`: `reading-support` (readingFont, largerText, extraSpacing, readAloud),
  `focus-support` (untimed, sessionMinutes 15, fewerChoices, predictableRoutine),
  `sensory-routine-support` (reducedMotion, lowStimulus, predictableRoutine, soundEnabled false).
  Each is `{ id, label, description, toggles: Partial<LearningProfile> }`.
- `applyPreset(current, presetId)` → merged profile, pure.
- `profileFromRow(row | null)` → profile with defaults for missing rows or columns.
- `readingAttributes(profile)` → `{ "data-reading-font"?: "on", "data-larger-text"?: "on",
  "data-extra-spacing"?: "on" }` for the app shell.

### Actions

`src/lib/actions/realm-settings.ts`: `getRealmSettings(childId)` (get or create, child may read
own), `updateRealmSettings(childId, patch)` (parent only, validated).

`src/lib/actions/learning-profile.ts`: `getLearningProfile(childId)` (get or create),
`updateLearningProfile(childId, patch)` and `applyLearningPreset(childId, presetId)` (parent only).

`src/lib/actions/recess-blocks.ts`: `getRecessBlocks(childId)`, `addRecessBlock(childId, block)`
(parent only, runs `findRecessConflict` against that day's class and recess blocks),
`removeRecessBlock(blockId)` (parent only; access via the block's child).

### UI

- **Realm Settings panel** (`settings/realm-settings-panel.tsx`), parent-only in the Chronicle:
  enabled switch, access mode radio, earned minutes per quest, off-hours switch, daily cap,
  tone radio, and a "Grant minutes" control (see C).
- **Learning Profile panel** (`settings/learning-profile-panel.tsx`), parent-only: three preset
  buttons at top with a one-line description each, then grouped toggles (Reading, Attention and
  pacing, Sensory and routine, Input). Copy explains that presets only pre-fill toggles.
- **Recess panel** on `/schedule` (`src/components/recess-blocks-panel.tsx`), parent-only: list of
  recess blocks by day with remove, and a small add form (day, start, end) that surfaces the
  conflict message from the action.
- **App shell**: `(app)/layout.tsx` loads the active hero's learning profile when the actor is a
  child and spreads `readingAttributes` onto the `game-shell` div. `globals.css` adds rules under
  `[data-reading-font="on"]`, `[data-larger-text="on"]`, `[data-extra-spacing="on"]`. Lexend is
  added to the font imports in the root layout with a real fallback stack.

## C. Play-time Ledger and Access Rules

### `realm_play_ledger` (append-only)

| Column | Type |
|---|---|
| `id` | text PK |
| `childId` | text FK child, cascade |
| `date` | text ISO `YYYY-MM-DD`, the hero's local day |
| `kind` | text enum `earned`, `granted`, `spent` |
| `minutes` | integer, positive |
| `sourceAssignmentId` | text, nullable, no FK (assignments can be deleted) |
| `createdAt` | timestamp |

Index on `(childId, date)`. Rows are never updated or deleted by the app.

### Rules (`src/lib/utils/realm-access.ts`)

```ts
type LedgerRow = { kind: "earned" | "granted" | "spent"; minutes: number };
type AccessInput = {
  timeOfDay: string;            // "HH:mm"
  isSchoolDay: boolean;
  settings: RealmSettingsLike;  // enabled, accessMode, offHoursEnabled, dailyCapMinutes
  ledgerToday: LedgerRow[];
  classBlocksToday: { startTime: string; endTime: string }[];
  recessBlocksToday: { startTime: string; endTime: string }[];
};
type AccessResult =
  | { allowed: true; minutesRemaining: number; source: "off_hours" | "recess" | "earned" }
  | { allowed: false; reason: "disabled" | "cap_reached" | "school_hours" | "outside_recess" | "no_minutes" };
```

- `ledgerBalance(rows)` → earned + granted − spent (may not go below zero in results).
- `minutesSpent(rows)` → sum of spent.
- `isOutsideSchoolHours(timeOfDay, isSchoolDay, classBlocksToday)` → true on non-school days, when
  there are no class blocks, or when `timeOfDay` is before the earliest start or at/after the latest end.
- `computeRealmAccess(input)` applies, in order:
  1. `!settings.enabled` → `disabled`.
  2. `minutesSpent >= dailyCapMinutes` → `cap_reached`.
  3. `offHoursEnabled && isOutsideSchoolHours` → allowed, `off_hours`, remaining = cap − spent.
  4. mode `scheduled`/`both` and a recess block contains `timeOfDay` → allowed, `recess`,
     remaining = min(block minutes left, cap − spent).
  5. mode `earned`/`both` and balance > 0 → allowed, `earned`, remaining = min(balance, cap − spent).
  6. Otherwise denied. Reason: if mode includes `earned` and balance is 0 → `no_minutes`;
     else if mode includes `scheduled` → `outside_recess`; else (off-hours only, during school) →
     `school_hours`.

### Earning hook (`src/lib/services/realm-play.ts`)

`grantEarnedMinutesForCompletion(childId, assignmentId, date)`: reads settings; if
`enabled` and mode is `earned` or `both` and `earnedMinutesPerQuest > 0`, inserts one `earned`
row. Called once at the end of `completeAssignment` in `quest-assignments.ts`, after rewards.
Revising a completed quest does not remove earned minutes (documented in the panel copy: "Minutes
earned stay earned").

### Actions (`src/lib/actions/realm-play.ts`)

- `getRealmAccess(childId, date, timeOfDay)` — child may call for self. Loads settings, today's
  ledger, class blocks and recess blocks for the weekday of `date`, and whether it's a school day
  (using the child's `schoolDays` through the existing parser), then returns `computeRealmAccess`.
- `recordRealmPlay(childId, date, minutes)` — child may call for self; inserts `spent`. Validates
  1..30 minutes per call so a stuck client cannot burn a day in one write.
- `grantRealmMinutes(childId, date, minutes)` — parent only; inserts `granted`; 1..240.
- `getRealmPlaySummary(childId, date)` — balance and spent for the settings panel.

## D. Level Util and Refactor

`src/lib/utils/level.ts`: `XP_PER_LEVEL = 100`, `levelFromXp(xp)` = `floor(xp / 100) + 1`,
guarding negative or non-finite input to level 1. Test first. Then replace the eight inline
formulas: `actions/castle.ts` (2), `actions/badges.ts`, `actions/avatar.ts`,
`tavern/page.tsx`, `tavern/parent-dashboard.tsx`, `settings/child-list.tsx`, `castle/page.tsx`.
Behavior is unchanged; the existing tests must stay green.

## Access control summary

| Action | Parent | Child (own id) |
|---|---|---|
| get* (all domains) | yes | yes |
| beginSeason, endSeason | yes | no |
| updateRealmSettings, grantRealmMinutes | yes | no |
| updateLearningProfile, applyLearningPreset | yes | no |
| addRecessBlock, removeRecessBlock | yes | no |
| getRealmAccess, recordRealmPlay | yes | yes |

Parent-only checks use `requireChildAccess(childId, { write: true })` plus the `isChildActor`
rejection already used by `setSkipQuestsEnabled`.

## Error handling

- Actions throw `Error` with player-facing medieval copy, matching the repo (for example
  "A season is already underway for this hero.").
- Lazy get-or-create for settings and profile uses insert with `onConflictDoNothing` then select,
  so two concurrent first reads cannot create two rows.
- Ledger inserts validate minutes as positive integers; anything else is rejected before the DB.
- `computeRealmAccess` never throws; malformed times are treated as outside all blocks.

## Testing

Tests are written before implementation for every util:

- `level.test.ts`: boundaries at 0, 99, 100, negative, NaN.
- `seasons.test.ts`: label, qualification threshold, ordinal, crown clamping.
- `learning-profile.test.ts`: defaults, each preset's toggles, merge does not clear unrelated
  toggles, row parsing with missing columns, reading attributes.
- `recess-blocks.test.ts`: conflict with class block, conflict with recess block, identical range
  to class is a conflict, adjacent ranges are fine.
- `realm-access.test.ts`: one case per rule and per denial reason, cap precedence over everything,
  `both` mode combining recess and earned, remaining-minutes math, off-hours with no class blocks.

Component tests (Testing Library, jsdom, following `student-schedule-editor.test.tsx`):
- Season panel: begin form shown when no open season; end dialog shows crown outcome text.
- Learning profile panel: clicking a preset calls the action with the preset id; toggles render
  from the profile.
- Realm settings panel: access mode switch shows and hides the earned-minutes field.

Actions and the completion hook are thin and follow repo convention of not being unit tested.
`npm run typecheck`, `npm run lint`, and `npm test` must pass.

## Migration

Edit `src/lib/db/schema.ts`, then `npm run db:generate` for one migration adding five tables:
`season`, `realm_settings`, `recess_block`, `learning_profile`, `realm_play_ledger`. No existing
columns change. The repo's hook auto-runs `db:migrate`; verify the migration applied rather than
trusting it silently.

## File map

```
src/lib/utils/level.ts (+test)
src/lib/utils/seasons.ts (+test)
src/lib/utils/crown-catalog.ts
src/lib/utils/learning-profile.ts (+test)
src/lib/utils/recess-blocks.ts (+test)
src/lib/utils/realm-access.ts (+test)
src/lib/actions/seasons.ts
src/lib/actions/realm-settings.ts
src/lib/actions/learning-profile.ts
src/lib/actions/recess-blocks.ts
src/lib/actions/realm-play.ts
src/lib/services/realm-play.ts
src/app/(app)/settings/season-panel.tsx (+test)
src/app/(app)/settings/realm-settings-panel.tsx (+test)
src/app/(app)/settings/learning-profile-panel.tsx (+test)
src/components/recess-blocks-panel.tsx
src/components/crowns-panel.tsx
src/lib/db/schema.ts, src/lib/db/migrations/0021_*.sql
src/app/(app)/layout.tsx, src/app/layout.tsx, src/app/globals.css (reading attributes, Lexend)
src/app/(app)/settings/child-list.tsx, (app)/schedule/page.tsx, (app)/loot/page.tsx,
(app)/tavern/page.tsx (mount the panels and crown count)
src/lib/actions/quest-assignments.ts (one call to the earning hook)
```
