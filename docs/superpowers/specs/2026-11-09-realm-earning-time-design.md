# Realm time: a lower barrier to entry

**Date:** 2026-11-09 · **Base:** `dev` (playability round merged at 7b382c3)
**Owner's request:** "review the way kids earn time in the realm because that seems to have too large of a barrier to entry currently." Principles: SOLID, DRY, KISS, configurability, dynamicness, scalability, security, sturdy long-term architecture.

## 1. Why

How time works today (read from the code on 2026-11-09):

- The default access mode is `earned`. Each day's ledger starts empty, so every child begins every day **locked out** (`realm-access.ts:97` → `no_minutes`).
- The **only** way to earn is a parent-assigned, real-world quest marked done: `earnedMinutesPerQuest` (5) per quest (`services/realm-play.ts` `grantEarnedMinutesForCompletion`).
- **Learning inside the Realm pays nothing.** Side quests earn stars and mastery but no minutes, and the locked gate blocks the side quests too.
- The trouble bounty (1 minute per clear) pays only from inside the world, which a locked-out child cannot reach.
- **Minutes vanish at midnight:** the ledger is per local date and nothing carries.
- The 2-minute idle auto-pause ("Still there?", `realm3d/pause.ts`) stops the clock, but the two idle minutes before it fired were already charged.

The owner confirmed all four barriers: locked at day start, earning needs assigned quests, Realm learning pays nothing, minutes vanish overnight.

## 2. What the owner decided (2026-11-09)

1. **At 0 minutes, both:** learning stays reachable, *and* every child gets a small free daily allowance.
2. **Learning reachable two ways:** a **quest board on the locked gate** (play side quests without entering the world) *and* a **quiet world** (enter and walk to villagers; troubles, riding and recess are off while at 0).
3. **Side quests pay minutes by stars**, every run, up to a **parent-set daily limit** for side-quest minutes.
4. **Unspent minutes carry over**, up to a parent-set bank limit.
5. **Gentle defaults:** 10 free minutes a day, 1 minute per star, side quests pay up to 15 a day, the bank holds up to 30. Every number is adjustable by a grown-up.
6. **Quiet time is free**: it spends nothing and does not count toward the daily cap.
7. **Idle detection gives time back:** when the child is detected idle, the time charged while they were idle is refunded, the game auto-pauses with **"Are you there, {name}?"**, and a button lets them carry on when they return.
8. **Quiet world scope:** everything except troubles, riding and recess stays on (spells, buildings, exploring, places, wardrobe, companion, castle). **No limit** on quiet time — not the daily cap, not school hours.
9. **The server decides "today"** from the family's timezone; the device clock is ignored for every Realm ledger write and read.

## 2a. Calls settled after the builder check (designer's, for the owner to check)

- **The server's day is the only day.** Every Realm ledger read and write — access, the play clock's charge and its page-hide beacon, the trouble bounty, side-quest pay, idle refunds, real-world quest earnings, and grown-up grants — uses `todayInZone(usableTimeZone(family.timezone))` (`services/family-timezone.ts`, `utils/dates.ts`), computed on the server. Client-sent `date` parameters are removed from those actions. Consequences:
  - Past days are frozen in practice: nothing writes to a day once the server's day has moved on. A real-world quest assigned for yesterday but finished today earns into **today** (not `assignment.date`); a grown-up's grant lands on today.
  - The carry snapshot (§4.4) is therefore exact: the previous day can no longer change after today has opened, and no device can open tomorrow early.
- **Only the hero's own run pays minutes.** A grown-up finishing a side quest on the Side Quests page still records stars and mastery as today, but `practice` minutes are written only when the actor is the child (`isChildActor`).
- **Opening a day always writes its rows**, including a 0-minute `carried` row, so a day with no play still breaks the carry chain (an old bank is never carried twice).
- **Only the child's own access check opens a day.** `getRealmAccess` from a grown-up's preview computes access without writing; the settings panel shows a *preview* of today's allowance and carry (pure computation over the same rows) when the day is not yet opened.
- **The bounty pays only while the balance is above 0** (server-side check in `recordTroubleClears`), so a forged clear from the quiet world earns nothing.

## 3. Goals, non-goals, anti-goals

**Goals**
- A child can always do *something* useful in the Realm: learn, and with learning earn the right to play.
- Earning is reachable without a grown-up assigning anything that day.
- Effort carries over; nothing earned is thrown away at midnight (up to the bank limit).
- A child is never charged for time they were not playing.
- One place owns each rule, and every number is a grown-up's setting.

**Non-goals**
- Changing what the daily cap means for real play (it stays the hard screen-time limit for spent minutes).
- Changing `scheduled` or `open` access modes (they never read the balance; §4.7).
- New cosmetics or rewards for minutes.

**Anti-goals**
- A loophole that lets a child mint minutes: refunds and side-quest pay must be bounded on the server.
- A child told they are "behind", "failed", or "out of time" in a way that shames them; gate copy invites ("Earn minutes with a side quest") rather than refuses.
- Rows that can be double-written by two tabs or a retry (allowance twice, carry twice, a run paid twice).

## 4. The design

### 4.1 One ledger, new kinds

`realm_play_ledger` stays append-only and per local date. Its `kind` gains four values:

| Kind | Sign | Written when | Counts toward the daily cap? | Carries over? |
|---|---|---|---|---|
| `earned` | credit | a real-world quest is finished (unchanged) | — | yes |
| `granted` | credit | a grown-up grants minutes (unchanged) | — | yes |
| `bonus` | credit | troubles cleared (unchanged) | — | yes |
| **`practice`** | credit | a side quest run finishes with stars (§4.3) | — | yes |
| **`allowance`** | credit | first access check of the day (§4.2) | — | **no** |
| **`carried`** | credit | first access check of the day (§4.4) | — | (it *is* the carry) |
| `spent` | debit | the play clock records a minute (unchanged) | yes | — |
| **`refund`** | reverses a debit | idle time given back (§4.6) | reduces spent | — |

One pure module owns the arithmetic (`src/lib/utils/realm-access.ts`, extended, or a new `realm-ledger.ts` it re-exports from — builder's call): `minutesSpent(rows) = Σspent − Σrefund` (never below 0), `ledgerBalance(rows) = Σcredits − minutesSpent(rows)` (never below 0), and `carryable(rows, bankCap)` (§4.4). Every caller (access, bounty, settings panel, help copy) reads these; no other module sums ledger rows.

### 4.2 The daily allowance

- New setting `dailyAllowanceMinutes` (default **10**, range 0–60). 0 turns it off.
- Applies in `earned` and `both` modes when the Realm is enabled.
- **Lazily materialised:** the child's own first access check of the server's day (`getRealmAccess`, child actor only — the call `realm-frame.tsx` makes on entry) writes one `allowance` row for that date via `openDay` (§5). A unique partial index `(child_id, date) WHERE kind = 'allowance'` plus `onConflictDoNothing` makes it exactly once, whatever tabs or retries do.
- Use-it-or-lose-it: allowance never carries (otherwise the bank fills with no effort).
- Spend order for carry purposes: allowance is spent first, then everything else (§4.4).

### 4.3 Side quests pay by stars

- New settings `minutesPerStar` (default **1**, range 0–5) and `sideQuestDailyCapMinutes` (default **15**, range 0–120). Either at 0 turns side-quest pay off.
- In `completeDeedRun`, after stars are computed and only when `RUN_EFFECTS[kind].earnsStars` (so never a Crown Challenge): pay `min(stars × minutesPerStar, sideQuestDailyCap − practicePaidToday)` minutes as one `practice` row, if > 0 and the mode earns (`earned` / `both`) and the Realm is enabled.
- Every run pays (replays included), bounded by the daily cap. A run pays once: the `practice` row carries `source_run_id` (new nullable column) with a unique partial index `(source_run_id) WHERE kind = 'practice'`, and completion's existing compare-and-set on `completed_at` already guarantees one completion.
- Pays from both the Realm board and the Side Quests page (same action) — the learning is the same — but only when the actor is the child (§2a).
- `RunSummary` gains `minutesEarned: number`; the result card says "+3 minutes" (or nothing when 0). When the day's side-quest pay is used up, the card says so gently ("You've earned all your side-quest minutes for today — great work!").
- `practice` counts as schoolwork for the trouble bounty's sub-cap (`bounty.ts` `questMinutesToday` reads `earned` + `practice`), since side quests are schoolwork.

### 4.4 Carry-over

- New setting `bankCapMinutes` (default **30**, range 0–240). 0 turns carry-over off (today's behaviour).
- On the child's first access check of the server's day, the server finds the child's **most recent earlier date with ledger rows** (one indexed query), computes `carryable(thatDay'sRows, bankCap)` and writes one `carried` row for today — **always, even when it is 0**. Unique partial index `(child_id, date) WHERE kind = 'carried'` + `onConflictDoNothing`.
- `carryable(rows, cap)`: the day's unspent balance **excluding** allowance — spend is charged against allowance first, then everything else — clamped to `[0, cap]`. Pure and tested. Because that day's own `carried` row is part of its rows, a bank rolls forward across days and across gaps (a weekend away keeps the bank).
- A setting change applies from the next carry; it never rewrites history.

### 4.5 Reaching learning at 0 minutes

**Access result.** `computeRealmAccess` gains one allowed source, `"quiet"`: when the mode earns, the Realm is enabled, the daily cap is not reached, and the balance is 0, the result is `{ allowed: true, minutesRemaining: 0, source: "quiet" }` instead of `no_minutes`. `no_minutes` remains only for a hypothetical caller that asks for strict play (none in this round — keep the reason for the flat Realm's copy). `cap_reached`, `disabled`, `school_hours` and `outside_recess` are unchanged and still come first.

**The quiet world (3D Realm).**
- The play clock does not run in `quiet` (nothing to spend, nothing charged, not counted toward the cap). Quiet time has no limit and no school-hours rule (owner's decision).
- Troubles, riding/mounts and recess are off while quiet; everything else (spells, buildings, exploring, places, wardrobe, companion, castle) stays on. The rule lives in one pure function (e.g. `quietSurfaces(source)` → which systems are on) read by the composition root; the scene gets it through existing props/bus fields where they exist, additively otherwise.
- A HUD line (in the existing meta/minutes corner) replaces the minute count: "Earn play time with a side quest" and the gold ! points to the objective villager as today.
- When a side quest pays (or any credit lands), the frame must re-check access explicitly — today `clock.refresh` runs only from the clock's interval and the bounty's `onAwarded`, neither of which runs while quiet. The deed result path calls it. The world then wakes: source becomes `earned`, the clock starts, troubles/riding/recess turn on, a toast says "+3 minutes — the Realm wakes up!".
- When minutes run out mid-visit, the world **goes quiet** instead of closing. Reaching the **daily cap** still closes the Realm, as now. The clock code closes at 0 in four places today and each must route "0 left, still allowed" to quiet instead: `applyAccess` (`play-clock.ts:86`), the hook's allowed-but-0 → `no_minutes` mapping (`use-play-clock.ts:71,118`), `tickClock`'s local close at 0 (`play-clock.ts:57`, `use-play-clock.ts:146`), and `entryPhase` with 0 minutes (`frame.ts:59`). `AccessSource` is declared twice (`frame.ts:20`, `use-play-clock.ts:14`) — consolidate to one declaration while adding `"quiet"` (and the recess mapping at `realm-game.tsx:754`).

**The quest board on the gate.** When a child's own visit checks access and gets `quiet`, the frame does not enter the world straight away. It shows the gate screen with the earning lines and two buttons: **Side quests here** and **Walk in the quiet Realm**. "Side quests here" lists the village's side quests grouped by villager and plays them in the existing `DeedBoard` panel, without the 3D world. A run finished there pays minutes like any other; the gate then re-checks access, and once the balance is above 0 the second button becomes **Enter the Realm** (a normal, clocked entry). A child who already has minutes enters as today, with no gate.
- The gate board reuses `DeedBoard` / `DeedRun` / `useDeedFlow` as they are; the list component is new and small.
- Building rises from gate-board runs: `RealmFrame` snapshots its props once and `RealmGame` seeds the kingdom from that snapshot, so entering from the gate after a gate-board run must refetch the kingdom (`getRealmKingdom`, already used at `realm-game.tsx:835`) before the world mounts.

### 4.6 Idle: give the time back

- Idle detection stays where it is (`usePause` → `autoPause("idle")` after `IDLE_MS`, today 2 minutes, one constant).
- What is refunded is what the **clock charged** while the child was idle, not wall time: the clock tracks "visible seconds counted since the last input" (the pause hook tells it when input happens). When the idle pause fires:
  - seconds in the clock's current minute are rewound locally;
  - whole minutes counted during the idle span but not yet written (`pendingRef`) are dropped from pending rather than refunded;
  - whole minutes already written as `spent` during the span are refunded through a new action `refundIdleMinutes(childId, minutes)` (no client date — §2a).
- **Server bounds:** child actor only, Realm enabled; `minutes` an integer in `1..ceil(IDLE_MS/60_000)`; `minutes ≤ minutesSpent(today)`; at most one refund per `IDLE_MS` of wall time per child (checked against the latest `refund` row's `created_at` under the child's advisory lock, the bounty's pattern). These stop a forged refund from **minting credit** (it can never exceed what was spent). They do not protect the daily cap from a determined forger — but neither does today's design, which already trusts the client to send `spent` at all. The refund adds no new trust.
- The pause screen copy changes: title **"Are you there, {name}?"**, reason "You stepped away, so the Realm paused and gave back {n} minute(s)." (or "…paused — your minutes stopped too." when nothing needed refunding), button **"I'm back!"** which resumes (and recaptures the mouse if it was captured, as Resume does today).
- In the quiet world the clock is not running, so there is nothing to refund; the idle pause still shows (to stop a forgotten tab), with the plain copy.

### 4.7 Access modes

| Mode | Allowance | Side-quest pay | Carry | Quiet world | Gate quest board |
|---|---|---|---|---|---|
| `earned` | yes | yes | yes | yes | yes |
| `both` | yes | yes | yes | yes (outside recess) | yes |
| `scheduled` | no | no | no | no (gate as today) | no |
| `open` | no | no | no | n/a (always open) | n/a |

`scheduled` and `open` never read the balance, so minutes there would be unspendable promises (the bounty's own rule).

### 4.8 Parent configuration

Four new `realm_settings` columns, grown-up only via `updateRealmSettings`, validated in `utils/realm-settings.ts` with the existing convention (reject out-of-range writes, default on bad reads), shown in Settings → Realm under a new "Earning time" group beside the existing minutes-per-quest and daily cap:

| Column | Default | Range | Label |
|---|---|---|---|
| `daily_allowance_minutes` | 10 | 0–60 | Free minutes each day |
| `minutes_per_star` | 1 | 0–5 | Minutes per side-quest star |
| `side_quest_daily_cap_minutes` | 15 | 0–120 | Most minutes side quests can earn a day |
| `bank_cap_minutes` | 30 | 0–240 | Most unspent minutes kept for tomorrow |

`earningLines` (`bounty.ts`), the single source of "how you earn" copy, is extended for allowance, stars and the bank, and stays the only place that copy is written.

## 5. Architecture

- **Pure first.** Ledger arithmetic, carryable, side-quest pay amount, quiet surfaces, idle refund amount, and earning copy are pure functions with unit tests.
- **One daily-rows writer.** A service function `openDay(childId, settings, exec)` takes the server's day, writes the day's `allowance` and `carried` rows idempotently (both always, 0 allowed), under the child's advisory lock. Only the child's own `getRealmAccess` calls it; nothing else writes those kinds.
- **One day authority.** A single server helper `realmToday(childId)` (family timezone via the child's family, `usableTimeZone`, `todayInZone`) feeds every Realm ledger path. Client-supplied dates are removed from `getRealmAccess`, `recordRealmPlay` and its beacon, `getTroubleBounty`, `recordTroubleClears`, and the new actions.
- **Transactions where amounts depend on reads.** Side-quest pay (reads today's `practice` sum) and idle refund (reads today's spent and last refund) run under the child's `pg_advisory_xact_lock`, the pattern `awardTroubleClears` already uses.
- **Schema (one migration):** `realm_play_ledger.kind` is plain text in the database (a TypeScript union only, `schema.ts:937`), so the four new kinds need no DB change — only the TS union. New nullable `realm_play_ledger.source_run_id`; partial unique indexes for `allowance` and `carried` per `(child_id, date)` and for `practice` per `source_run_id`; four `realm_settings` columns. All additive. The Turso importer needs no change (new columns have defaults; the kinds are new values).
- **Shared big files** (`realm-game.tsx`, `spike-scene.tsx`, `frame-hud.tsx`, `hud.tsx`, `hud-bus.ts`) get additive one- or two-line edits; new UI goes in new files.

## 6. Security

- All amounts and dates are computed on the server from stored rows; the client sends only intent (finish run, refund N idle minutes).
- Refund: bounded per call, by today's net spend, and by one per idle window of wall time.
- Side-quest pay: bounded by the daily cap, once per run (unique index), never for a challenge, never for a grown-up's visit (runs are hero-only already).
- Allowance/carry: exactly once per day per child (unique indexes), computed from the child's own rows, on the server's day — changing the device date or timezone changes nothing.
- Quiet world: the bounty pays nothing at a 0 balance (server check), so a forged clear while quiet earns nothing.
- Settings: grown-up only, range-checked.

## 7. Testing and verification

- TDD per `.superpowers/realm-rules.md`.
- Pure tests for every rule in §4 (including carry across a gap, allowance never carrying, spend-order, refund bounds, quiet surfaces, modes table).
- Real-Postgres tests (the `*-db.test.ts` pattern) for: allowance/carry written once under concurrent first checks; practice pay once per run and capped per day under concurrency; refund bounds and rate limit.
- A composed test: a fresh day → allowance + carry rows → quiet when balance hits 0 → a side quest pays → access returns `earned`.
- Browser pass as the child (keys only, never click the canvas): gate with "Side quests here", a gate-board run paying minutes, entering the quiet world, the world waking after a side quest, and the idle pause copy.

## 8. Calls made by the designer (for the owner to check)

1. The free allowance never carries over; only earned, granted, bonus and practice minutes do.
2. The allowance and side-quest pay apply only in `earned` and `both` modes.
3. Side quests on the Side Quests page pay minutes too, not only in the Realm.
4. A Crown Challenge pays no minutes (it earns no stars).
5. Side-quest minutes count as schoolwork for the trouble bounty's limit.
6. When minutes run out mid-visit the world goes quiet instead of closing; the daily cap still closes it.
7. Idle refunds are limited to one per idle window of real time, and to what was spent today.
8. The idle threshold stays 2 minutes (one constant).
9. New defaults apply to existing children immediately (the migration's column defaults).
10. A real-world quest finished today for yesterday's date earns into today; a grown-up's grant lands on today.
11. A grown-up finishing a side quest on the child's behalf earns the child no minutes.
12. Gate-board runs refresh the village before the child enters, so a building raised at the gate is standing when they walk in.
