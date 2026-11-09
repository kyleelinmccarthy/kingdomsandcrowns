# Realm Earning Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower the barrier to Realm time: a free daily allowance, side quests that pay minutes by stars, a capped carry-over bank, a quiet world and a gate quest board at 0 minutes, idle time given back — all on a server-owned day.

**Architecture:** Ledger arithmetic, access, carry, pay amounts, quiet surfaces and copy are pure functions (`src/lib/utils/realm-access.ts`, `src/lib/realm/play-clock.ts`, `src/lib/realm/spells/bounty.ts`, new small modules). Server writes stay in `src/lib/services/realm-play.ts` under the child's `pg_advisory_xact_lock`. A single `realmNow(childId)` helper replaces every client-sent date/time on Realm ledger paths. UI changes are new components mounted with one- or two-line edits.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before Next-specific APIs — AGENTS.md), React, Drizzle on Postgres 18, Vitest (+ real-Postgres `*-db.test.ts`), three.js scene components only where noted.

**Spec:** `docs/superpowers/specs/2026-11-09-realm-earning-time-design.md` — read §1–§8 (and §2a) before any task.

## Global Constraints

- Binding agent rules: `.superpowers/realm-rules.md` in full (one agent at a time; `npx vitest run --maxWorkers=2 <files>`; full suite once before the task's commit; `tsc` at most twice per task; never `next build`; no `three` under Vitest; no `Math.random()`/`Date.now()` in simulation code; protected big files `spike-scene.tsx`, `realm-game.tsx`, `frame-hud.tsx`, `hud.tsx`, `hud-bus.ts` get additive one- or two-line edits; new UI in new files).
- Real-DB tests need `set -a; . ./.env.local; set +a` before vitest.
- Foreign uncommitted files — never touch/stage: `src/components/realm3d/hero-figure.tsx`, `tsconfig.json`, `AGENTS.md`.
- Branch `realm-earning-time`; `git branch --show-current` before every commit; no `git stash`; `git add` by name; trailer `Co-Authored-By: <your model> <noreply@anthropic.com>` as a second `-m`.
- `"use server"` files export only async functions and inline `export type X = …` (never `export type { X }` re-exports). Next hides thrown server-action messages in production: child-facing errors go through `deedErrorLine` (`src/lib/utils/deed-refusals.ts`) or equivalent.
- Settings convention: reject out-of-range writes, default on bad reads (`src/lib/utils/realm-settings.ts`).
- Child copy never says "behind", "ahead", "failed", "level", "grade", or "out of time"; invite, don't refuse.
- **Numbers (spec §4.8, §4.6):** `dailyAllowanceMinutes` 10 (0–60); `minutesPerStar` 1 (0–5); `sideQuestDailyCapMinutes` 15 (0–120); `bankCapMinutes` 30 (0–240); `IDLE_MS` stays 2 minutes; refund per call `1..ceil(IDLE_MS/60_000)`; at most one refund per `IDLE_MS` of wall time.
- **Exact copy (spec):** pause title `Are you there, {name}?`; resume button `I'm back!`; refund reason `You stepped away, so the Realm paused and gave back {n} minute(s).` (`minute`/`minutes` by n); no-refund reason `You stepped away, so the Realm paused — your minutes stopped too.`; quiet HUD line `Earn play time with a side quest`; wake toast `+{n} minutes — the Realm wakes up!` (`minute` when 1); gate buttons `Side quests here`, `Walk in the quiet Realm`, `Enter the Realm`; result card when the day's side-quest pay is used up `You've earned all your side-quest minutes for today — great work!`.
- Access modes table (spec §4.7) binds every task: allowance, practice pay, carry, quiet world and gate board apply in `earned` and `both` only.

## Review Focus

1. **A child who already has minutes** must enter exactly as before (no gate, clock running, troubles on). → Task 8 test `a child with minutes enters straight in`.
2. **Playing across the server's midnight:** a charge lands on the new day before the new day is opened. Opening it later must still add the allowance and carry correctly, and the old day must not be re-carried. → Task 4 db test `a charge before the day opens`.
3. **A grown-up changes a setting mid-day** (allowance or bank cap): today's already-written rows are not rewritten; the change applies from the next opened day. → Task 4 db test `settings change applies next day`.
4. **A grown-up's preview or visit** never writes allowance/carry/practice/refund rows and is never put in the quiet world. → Task 4 test `a grown-up's access check writes nothing` and Task 7 test `a parent visit is never quiet`.
5. **Two tabs open the same day / finish the same run / refund at once** → exactly one allowance, one carry, one practice row per run, one refund per window. → Tasks 4, 5, 9 concurrency db tests (`Promise.all` of two calls).

---

### Task 1: Ledger arithmetic

**Files:**
- Modify: `src/lib/utils/realm-access.ts` (`LedgerKind`, `minutesSpent`, `ledgerBalance`), Test: `realm-access.test.ts`
- Create: `src/lib/utils/realm-ledger.ts` (new pure helpers), Test: `realm-ledger.test.ts`
- Modify: `src/lib/realm/spells/bounty.ts` (`questMinutesToday` reads `earned` + `practice`), Test: `bounty.test.ts`

**Interfaces:**
- Produces:
  - `LedgerKind = "earned" | "granted" | "spent" | "bonus" | "practice" | "allowance" | "carried" | "refund"`
  - `minutesSpent(rows): number` = max(0, Σspent − Σrefund)
  - `ledgerBalance(rows): number` = max(0, Σcredits − minutesSpent(rows)); credits = every kind except `spent` and `refund`
  - `realm-ledger.ts`: `sumKind(rows, kind): number`; `carryable(rows: readonly LedgerRow[], bankCap: number): number` — spend is charged to `allowance` first, then to all other credits; returns `clamp(nonAllowanceCredits − max(0, minutesSpent − allowance), 0, bankCap)`; `practicePaidToday(rows): number` (= `sumKind(rows, "practice")`).

- [ ] **Step 1: Failing tests:** `minutesSpent([{spent,5},{refund,2}])` = 3; refund larger than spent → 0; `ledgerBalance` with allowance 10, earned 5, spent 12, refund 2 → 5; `carryable` cases: allowance 10 + earned 5, spent 8 → 5 (allowance absorbed the spend); spent 12 → 3; earned 40, spent 0, cap 30 → 30; cap 0 → 0; only allowance → 0; carried 20 + earned 5, spent 0, cap 30 → 25 (a bank rolls forward); `questMinutesToday([{earned,5},{practice,3},{bonus,1}])` = 8.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement. **Step 4:** run touched tests + existing `realm-access`, `bounty`, `play-clock` tests — PASS.
- [ ] **Step 5: Commit** `feat(realm): ledger kinds for allowance, carry, side-quest pay and refunds`.

### Task 2: Schema and settings

**Files:**
- Modify: `src/lib/db/schema.ts` (`realmSettings`, `realmPlayLedger`), generated migration in `src/lib/db/migrations/`
- Modify: `src/lib/utils/realm-settings.ts`, Test: `realm-settings.test.ts`
- Update hand-written DDL in real-DB tests that create `realm_settings` / `realm_play_ledger` (grep `CREATE TABLE realm_`).

**Interfaces:**
- Produces:
  - `realm_settings`: `daily_allowance_minutes int not null default 10`, `minutes_per_star int not null default 1`, `side_quest_daily_cap_minutes int not null default 15`, `bank_cap_minutes int not null default 30` (Drizzle: `dailyAllowanceMinutes`, `minutesPerStar`, `sideQuestDailyCapMinutes`, `bankCapMinutes`).
  - `realm_play_ledger`: `source_run_id text null` (Drizzle `sourceRunId`); partial unique indexes `realm_play_ledger_allowance_day_idx (child_id, date) WHERE kind = 'allowance'`, `realm_play_ledger_carried_day_idx (child_id, date) WHERE kind = 'carried'`, `realm_play_ledger_practice_run_idx (source_run_id) WHERE kind = 'practice'`; and a plain index on `(child_id, date)` if none exists (the carry query reads "latest earlier date").
  - `RealmSettings` gains the four fields; `ALLOWANCE_RANGE {0,60}`, `MINUTES_PER_STAR_RANGE {0,5}`, `SIDE_QUEST_PAY_CAP_RANGE {0,120}`, `BANK_CAP_RANGE {0,240}`; error copy e.g. `Free minutes must be 0–60 a day.`
- [ ] **Step 1: Failing settings tests** (read default on out-of-range; reject on write; accept boundaries) for all four.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** edit schema, `npm run db:generate` (a hook may auto-run migrate — verify with `\d realm_play_ledger`), `npm run db:migrate`; update test DDL; run the real-DB test files that create these tables — PASS.
- [ ] **Step 6: Commit** `feat(db): Realm settings for allowance, star pay, side-quest cap and bank; ledger run link and once-per-day indexes`.

### Task 3: The server owns the day

**Files:**
- Create: `src/lib/services/realm-clock.ts`, Test: `realm-clock.test.ts`
- Modify: `src/lib/actions/realm-play.ts` (`getRealmAccess`, `recordRealmPlay`, `grantRealmMinutes`, `getTroubleBounty`, `recordTroubleClears`), `src/app/api/realm/play/route.ts`, `src/app/api/realm/troubles/route.ts`, `src/lib/utils/realm-play-charge.ts`, `src/lib/utils/realm-clear-beacon.ts`, `src/lib/services/realm-play.ts` (`grantEarnedMinutesForCompletion` writes on today), `src/lib/actions/quest-assignments.ts:483`
- Modify every caller: `src/components/realm/use-play-clock.ts`, `src/components/realm3d/realm-frame.tsx`, `src/components/realm3d/use-trouble-bounty.ts`, the flat Realm (`src/components/realm/realm-shell.tsx`) and the settings panel's grant, plus their tests.

**Interfaces:**
- Produces:
  - `realmNow(childId: string, now?: Date): Promise<{ date: string; timeOfDay: string }>` — family timezone via `getTimezoneForChild` + `usableTimeZone`; `date` from `todayInZone`; `timeOfDay` `HH:mm` in the same zone (`Intl.DateTimeFormat` `hourCycle: "h23"`). A pure `nowInZone(timeZone, now): { date; timeOfDay }` beside it carries the logic and the tests.
  - New signatures (date/time params removed): `getRealmAccess(childId)`, `recordRealmPlay(childId, minutes)`, `grantRealmMinutes(childId, minutes)`, `getTroubleBounty(childId)`, `recordTroubleClears(childId, homeIds)`; play and trouble beacons ignore any client date and use `realmNow`. `parsePlayCharge` / clear-beacon parsers drop `date` (accept and ignore it if present, so an old tab's beacon still parses).
  - `grantEarnedMinutesForCompletion(childId, assignmentId)` — writes on `realmNow(childId).date`.
- [ ] **Step 1: Failing tests:** `nowInZone("America/Denver", new Date("2026-11-10T05:30:00Z"))` → `{ date: "2026-11-09", timeOfDay: "22:30" }`; `"Pacific/Auckland"` same instant → `2026-11-10`, `18:30`; an invalid zone falls back to `America/Denver` (through `usableTimeZone`); `getRealmAccess` reads the ledger for the server's date even when the device would say otherwise (mock `realmNow`); the play beacon with a body date of `"2099-01-01"` charges today; a quest finished today for yesterday's assignment writes `earned` on today.
- [ ] **Step 2–4:** FAIL → implement → PASS for touched files.
- [ ] **Step 5:** full suite (env sourced), name failures; `tsc`; eslint on changed files.
- [ ] **Step 6: Commit** `feat(realm): the server decides the day for every Realm minute`.

### Task 4: Opening a day, and the quiet access state

**Files:**
- Modify: `src/lib/utils/realm-access.ts` (`AccessResult` source `"quiet"`; `computeRealmAccess`), Test
- Create: `src/lib/utils/realm-day.ts` (pure: `dayOpeningRows(previousDayRows, settings): { allowance: number; carried: number }`, `previewToday(todayRows, previousDayRows, settings): LedgerRow[]`), Test
- Modify: `src/lib/services/realm-play.ts` (`openDay`, `loadPreviousActiveDay`), Create: `src/lib/services/realm-day-db.test.ts`
- Modify: `src/lib/actions/realm-play.ts` (`getRealmAccess` opens the day for a child actor only; `getRealmPlaySummary` uses `previewToday`; `recordTroubleClears` pays nothing at balance 0)
- Modify: `src/lib/realm/spells/bounty.ts` only if the balance check belongs in the pure award (preferred: `awardClears` gets `balance` and pays 0 when it is 0)

**Interfaces:**
- Produces:
  - `AccessResult` allowed `source: "off_hours" | "recess" | "earned" | "open" | "quiet"`. `computeRealmAccess`: when `usesEarned` and balance is 0 and (not in a recess block) → `{ allowed: true, minutesRemaining: 0, source: "quiet" }` instead of `no_minutes`. Order unchanged otherwise; `cap_reached` and `disabled` still first.
  - `dayOpeningRows(prev, s)`: allowance = `s.dailyAllowanceMinutes` if mode earns & enabled else 0; carried = mode earns & enabled ? `carryable(prev, s.bankCapMinutes)` : 0.
  - `openDay(childId: string, date: string, settings: RealmSettings, exec?): Promise<void>` — under `pg_advisory_xact_lock(hashtext(childId))`; if no `allowance` row for `date`, inserts `allowance` and `carried` rows (both, 0 allowed) with `onConflictDoNothing`. `loadPreviousActiveDay(childId, before: string, exec)` returns that day's rows (most recent `date < before` with any rows; `[]` if none).
- [ ] **Step 1: Failing pure tests:** quiet result for earned/both at 0; recess still wins in both; `scheduled` at 0 still `outside_recess`; `open` unaffected; `cap_reached` beats quiet; `dayOpeningRows` per mode; `previewToday` adds allowance/carried rows only when today has no `allowance` row.
- [ ] **Step 2: Failing db tests:** first child check writes exactly one allowance and one carried row (also under `Promise.all` of two); a day with no play still writes a 0 carried row and the next day carries 0, not the older bank; `a charge before the day opens` (spent row exists, then `openDay`) → balance = allowance + carry − spent; `settings change applies next day`; `a grown-up's access check writes nothing`; a quiet child's clear earns 0.
- [ ] **Step 3–4:** implement → PASS. **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Commit** `feat(realm): every day opens with free minutes and yesterday's bank; at 0 the Realm goes quiet instead of shut`.

### Task 5: Side quests pay minutes by stars

**Files:**
- Create: `src/lib/utils/side-quest-pay.ts` (pure), Test
- Modify: `src/lib/actions/deeds.ts` (`completeDeedRun`), `src/lib/services/realm-play.ts` (`paySideQuest`), `src/lib/utils/deed-run-types.ts` (`RunSummary.minutesEarned`, `RunSummary.sideQuestPayFull`), `src/lib/realm3d/talk.ts` (`resultMinutesLine`), `src/components/realm3d/deed-board.tsx` and `src/components/deed-results.tsx` (show the line), `src/lib/actions/deeds-db.test.ts`

**Interfaces:**
- Produces:
  - `sideQuestPay(stars: number, s: Pick<RealmSettings, "enabled" | "accessMode" | "minutesPerStar" | "sideQuestDailyCapMinutes">, paidToday: number): { minutes: number; full: boolean }` — 0 unless enabled and mode earns; `minutes = min(stars × minutesPerStar, max(0, cap − paidToday))`; `full` true when `paidToday + minutes >= cap` and cap > 0.
  - `paySideQuest(childId: string, runId: string, stars: number): Promise<{ minutes: number; full: boolean }>` — under the advisory lock: `realmNow`, `loadRealmSettings`, `openDay` (so a run before any access check still has today's rows), today's `practicePaidToday`, insert one `practice` row with `sourceRunId = runId` (`onConflictDoNothing` on the run index; on conflict return the earlier row's minutes).
  - `completeDeedRun` calls it only when the run counted (`RUN_EFFECTS[kind].earnsStars`), stars > 0, and the actor is the child (`isChildActor`).
  - `resultMinutesLine(summary): string | null` — `+{n} minutes earned` (`minute` at 1), the "used up" line when `sideQuestPayFull && minutesEarned === 0`, else null.
- [ ] **Step 1: Failing tests:** pure pay cases (3 stars × 1 = 3; cap 15 with 14 paid → 1 and full; cap 0 → 0; `scheduled` → 0; challenge never calls it); db: a run pays once even if `completeDeedRun` is raced (`Promise.all`); a grown-up actor's page run pays 0; the day's sum never exceeds the cap under concurrency; the result card shows the line on both boards.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Commit** `feat(realm): side quests pay play minutes for their stars, up to a daily limit`.

### Task 6: The play clock knows "quiet"

**Files:**
- Modify: `src/lib/realm/play-clock.ts` (`applyAccess`, `tickClock`, `gateCopy`), `src/components/realm/use-play-clock.ts`, `src/lib/realm3d/frame.ts` (`entryPhase`, `AccessSource`), and their tests; flat `realm-shell.tsx` only as needed to compile.

**Interfaces:**
- Produces:
  - One `AccessSource` (`"off_hours" | "recess" | "earned" | "open" | "quiet"`) exported from `src/lib/utils/realm-access.ts`; `frame.ts` and `use-play-clock.ts` import it (delete both local copies).
  - `PlayClock` gains `quiet: boolean`. `applyAccess`: allowed with `source: "quiet"` → `{ quiet: true, minutesRemaining: 0, closed: false }`, event `"quiet"`; allowed with minutes after quiet → `quiet: false`, event `"wake"`; not allowed → close as today. `ClockEvent` adds `"quiet" | "wake"`.
  - `tickClock`: when `quiet`, never counts, never records, never closes. When `minutesRemaining` reaches 0 while playing it emits a new event `"empty"` (and no longer closes by itself); the hook answers `"empty"` by calling `refresh()`, and `applyAccess` turns the server's answer into quiet (allowed `quiet`) or close (any denial, e.g. `cap_reached`). `ClockEvent` therefore adds `"quiet" | "wake" | "empty"`.
  - `usePlayClock` returns `{ …, quiet: boolean, refresh }`; `onQuiet?: () => void`, `onWake?: (minutes: number) => void` callbacks.
  - `entryPhase`: allowed `quiet` → a new phase `{ kind: "quiet-gate" }` for a child view (Task 8 renders it); a parent view is never quiet (it has no clock; treat as `open`).
- [ ] **Step 1: Failing tests:** each of the four former close-at-0 paths now goes quiet when the server answers quiet and closes when it answers `cap_reached`; quiet ticks never record; a wake from quiet restarts counting; `entryPhase(quiet)` child → `quiet-gate`, parent → open.
- [ ] **Step 2–4:** FAIL → implement → PASS (`play-clock`, `use-play-clock`, `frame`, `realm-shell` tests). **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Commit** `feat(realm): the play clock goes quiet at zero instead of closing, and wakes when minutes land`.

### Task 7: The quiet world

**Files:**
- Create: `src/lib/realm3d/quiet.ts` (pure `quietSurfaces(quiet: boolean): { troubles: boolean; riding: boolean; recess: boolean }`), Test
- Create: `src/components/realm3d/quiet-hud.tsx` (the HUD line and the wake toast), Test
- Modify: `src/components/realm3d/realm-game.tsx` (additive: read `clock.quiet`; pass `quietSurfaces` into the existing troubles/ride/recess wiring; mount `QuietHud`; after a deed result, call `clock.refresh()`), `realm-game.test.tsx`

**Interfaces:**
- Consumes: `usePlayClock` `quiet`, `refresh`, `onWake` (Task 6); `RunSummary.minutesEarned` (Task 5).
- Produces: in quiet, troubles are not spawned/active, the mount/ride control is hidden or disabled with the HUD reason, recess cannot start; everything else unchanged. On wake: toast `+{n} minutes — the Realm wakes up!`, systems on.
- [ ] **Step 1: Failing tests:** `quietSurfaces` truth table; `realm-game` in quiet hides the minutes chip and shows `Earn play time with a side quest`, troubles bus empty, ride control disabled, recess arch refuses; after a paying deed result `refresh` is called and the world wakes with the toast; `a parent visit is never quiet`; calm/lowStimulus + quiet still render.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Browser check** (agent dev server per `.superpowers/realm-rules.md` and the screenshot memory; never click the canvas): a child with 0 minutes in the quiet world (no troubles, HUD line), then a side quest that wakes it. Look at each screenshot.
- [ ] **Step 7: Commit** `feat(realm): a quiet Realm at zero minutes — walk, talk and learn, and it wakes when a side quest pays`.

### Task 8: The gate and its quest board

**Files:**
- Create: `src/components/realm3d/gate-quest-board.tsx` (list villagers' side quests by building; opens the existing `DeedBoard` for one villager), Test
- Create: `src/components/realm3d/quiet-gate.tsx` (gate screen for `quiet-gate`: earning lines + `Side quests here` + `Walk in the quiet Realm` / `Enter the Realm`), Test
- Modify: `src/components/realm3d/realm-frame.tsx` (render `quiet-gate`; re-check access after a gate run; refetch the kingdom via `getRealmKingdom` before mounting the world when a gate run finished), `src/lib/realm/spells/bounty.ts` (`earningLines` covers allowance, stars and bank), tests

**Interfaces:**
- Consumes: `DeedBoard` props (villager, site, viewer, heroName, waiting, numerals, profile, calm, onResult, onClose); `villagerForBuilding`; kingdom `buildings` from the frame snapshot; `getRealmAccess(childId)` (Task 3); `getRealmKingdom`.
- Produces: `earningLines(settings, status, accessMode)` adds, in earn modes, `You get {n} free minutes every day.` (when allowance > 0), `Side quests earn {m} minute(s) per star, up to {cap} a day.` (when both > 0), `Unspent minutes are kept for tomorrow, up to {bank}.` (when bank > 0) — still the only place this copy is written.
- [ ] **Step 1: Failing tests:** `a child with minutes enters straight in` (no gate); quiet → gate with both buttons; `Side quests here` lists every building's side quests and opens the board; finishing a paying run turns the second button into `Enter the Realm`; entering after a gate run shows the refetched village (a building raised at the gate stands); `earningLines` new lines and their 0-setting omissions; a parent never sees the quiet gate.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Commit** `feat(realm): the gate offers side quests to earn minutes without entering`.

### Task 9: Idle time given back

**Files:**
- Modify: `src/lib/realm/play-clock.ts` (`PlayClock.countedSinceInput`, `noteInput(clock)`, `idleGiveBack(clock, pending): { clock; dropPending: number; refundRecorded: number }`), `src/components/realm/use-play-clock.ts` (`noteInput`, `giveBackIdle(): Promise<number>`), `src/components/realm3d/use-pause.ts` (tell the clock about input; on idle pause call `giveBackIdle` and pass the refunded count to the copy), `src/lib/realm3d/pause.ts` (`pauseCopy(why, viewer, heroName, refunded?)`), tests
- Modify: `src/lib/actions/realm-play.ts` (`refundIdleMinutes`), `src/lib/services/realm-play.ts` (`refundIdle`), Create db tests

**Interfaces:**
- Produces:
  - `refundIdleMinutes(childId: string, minutes: number): Promise<{ refunded: number }>` — child actor only; Realm enabled; integer `1..ceil(IDLE_MS/60_000)`; under the advisory lock: `refunded = min(minutes, minutesSpent(today))`; refused (refunded 0, nothing written) if the latest `refund` row is newer than `IDLE_MS`; writes one `refund` row when > 0.
  - `pauseCopy("idle", "child", name, refunded)` → title `Are you there, {name}?`, reason per refund count (Global Constraints copy), resume `I'm back!`.
  - `idleGiveBack`: seconds in the current minute counted since input are rewound; whole minutes counted since input and still pending are dropped from pending (`dropPending`); minutes counted since input and already recorded are `refundRecorded` (capped at the refund bound).
- [ ] **Step 1: Failing tests:** pure give-back cases (all within the current minute; spans a pending minute; spans a recorded minute; input resets the counter); `pauseCopy` copy exact; db: refund bounded by spent, by the per-call max, refused within `IDLE_MS` of the last refund, refused for a grown-up, two concurrent refunds write one row; `minutesSpent` drops after a refund so access reflects it.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** full suite, tsc, eslint.
- [ ] **Step 6: Commit** `feat(realm): idle time is given back — "Are you there?" pauses and returns the minutes`.

### Task 10: Grown-up settings

**Files:**
- Modify: `src/app/(app)/settings/realm-settings-panel.tsx`, Test

**Interfaces:**
- Consumes: the four settings and ranges (Task 2); today's preview from `getRealmPlaySummary` (Task 4).
- [ ] **Step 1: Failing tests:** an "Earning time" group with `Free minutes each day`, `Minutes per side-quest star`, `Most minutes side quests can earn a day`, `Most unspent minutes kept for tomorrow`; each saves exactly its one field; min/max from the range constants; today's summary includes the allowance and carry preview.
- [ ] **Step 2–4:** FAIL → implement following the panel's existing number-input pattern → PASS.
- [ ] **Step 5: Commit** `feat(settings): grown-ups set free minutes, star pay, side-quest limit and the bank`.

### Task 11: Whole-branch verification

- [ ] **Step 1:** nothing of yours running (`ps aux | grep -E "vitest|next dev"`).
- [ ] **Step 2:** full suite (env sourced), `npx tsc --noEmit`, `npx eslint src` (known baseline error in `quest-template-list.tsx`).
- [ ] **Step 3: Browser pass as the child** (keys and DOM only, never click the canvas): a fresh day with 10 free minutes; spend to 0 → quiet world; gate quest board run pays → `Enter the Realm`; idle pause shows `Are you there, Emma?` with a refund line; Settings → Realm shows the Earning time group. Restore any local data you change.
- [ ] **Step 4:** stop the dev server by process group; `rm -rf .next-agent`.
- [ ] **Step 5:** whole-branch review (superpowers:requesting-code-review), one fix wave.
