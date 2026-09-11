# The record of the work

**Date:** 2026-09-10
**Status:** Design spec. Written up front per decision 1; the implementation plan (with file:line citations) is written at build time, not now.
**Programme:** *The Realm: Presentation Overhaul* — `docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`, as revised by the user's nine decisions. This is **slice 13 of 13**, the last.
**Depends on:** `plots-signs-and-the-keep` (10) for the signboard's reserved third line and the keep's citadel stage; `troubles-that-read-and-pay` (8) for zone-based spawning and the bonus-minute ledger kind; `doors-and-the-tavern` (6) for the siblings' board this slice re-points at snapshot names; `recess-that-counts` (12) for the lap and gleam records the session summary reports.
**Effort:** large.

---

## 1. Why — the complaints and audit findings this answers

### From the verdict, verbatim

> no quest log or tracking. no starting quest. … this doesnt feel like a well thought out game at all.

### From Appendix A, verbatim

**"no quest log or tracking" — _major, medium effort_**

> A child cannot tell which side quests they have already finished — not in the world, not on the Side Quests page. BuildingOverview.deeds carries only {id, title, story, area} (services/deeds.ts:11-15, built at 32-41); there is no per-deed done flag even though completed runs are recorded in schema.deedRun with completedAt (actions/deeds.ts:223). SiteCard therefore renders the same two or three rows with an identical 'Begin' button forever (site-card.tsx:73-85), and it renders them even when the building is complete (site-card.tsx:80-81 gates only on `preview`), while the villager keeps standing there with the same static greeting (villagers.ts:16-23; layout.ts:163-169 places a villager regardless of `complete`). 'Built' appears in the header (site-card.tsx:65) but the offer of work does not change, so the child's only feedback for finishing a building is a tag they have to walk up to and open a dialog to read.

**"implied — 'no starting quest', 'doesnt feel like a well thought out game'" — _major, medium effort_**

> The long-term goal is arithmetically unsatisfying and partly invisible. Every building demands 5 completed runs (deedsToBuild: 5 for all eight, kingdom.ts:6-15; incremented one per completed run at actions/deeds.ts:237-239), but DEEDS only supplies 3 stories each for well/mill/chapel/library and 2 each for bridge/market/watchtower/garden (utils/deeds.ts:20-41; counted: 20 deeds total). So raising the Market means replaying the same two stories two or three times, with no marker saying you have played them (see the finding above), and the whole kingdom is 40 runs × 8 questions = 320 questions across 20 stories. buildingProgress clamps at 5 (kingdom.ts:21-24), so a sixth run on a built site is silently discarded — the villager still says Begin, the child still answers eight questions, and nothing anywhere moves. … Nothing detects or celebrates 'all eight raised' — a grep for a completion state finds only the per-building applyDeedResult (realm-shell.tsx:413-424).

**"implied — session goal is invisible" — _major, small effort_**

> The only thing the world tells a child about the session is a countdown. The HUD prints '{n} min left' (realm-hud.tsx:62) and the clock ticks it down (play-clock.ts:23-46), but nothing inside the Realm says where those minutes came from, how many were earned today, or what earns more. The explanation exists only on the locked-out screen the child sees when they CANNOT play ('Every quest you complete banks minutes here', play-clock.ts:65) and on the gate's link to the Quest Log (realm-gate.tsx:13). Inside, the perceived session goal is 'a number is going down', which reads as a punishment clock rather than a goal. When the clock runs out the child gets 'Well played, {name}!' plus the gate body and a link back to the Tavern (realm-closed.tsx:5-16) — no summary of what they actually did: no deeds finished, no building progress, no troubles cleared, nothing to be proud of.

**"implied — 'this doesnt feel like a well thought out game at all'" — _major, medium effort_ (the part this slice owns)**

> And because troubles only exist at unfinished sites, a child who finishes the kingdom finds the spell bar has nothing left to point at.

**From "Not complained about yet, but will be":**

> - Four of the eight buildings can only be finished by replaying the same 2 stories 2-3 times: deedsToBuild is 5 for every building (kingdom.ts:6-15) but bridge, market, watchtower and garden have only 2 deeds each (utils/deeds.ts:20-41). Completing the whole kingdom is 40 runs / 320 questions drawn from 20 stories.
> - A sixth run on a finished building is silently thrown away — buildingProgress clamps at 5 (kingdom.ts:21-24) — yet the villager still stands there and SiteCard still shows 'Begin' (layout.ts:163-169; site-card.tsx:80-81). The child answers eight questions and nothing moves.
> - Once all eight buildings are built the world goes inert: spawnTroubles only spawns at foundations (troubles.ts:81), so there are zero enemies and the spell bar has nothing to target.

**From "Missing entirely":**

> - Any surfacing of an unfinished side quest, even though startDeedRun resumes one within the hour (actions/deeds.ts:39, 109-120)
> - Any per-deed completion mark — BuildingOverview.deeds has no done flag (services/deeds.ts:11-15)
> - Any completion/victory state for the kingdom; nothing anywhere detects all eight complete
> - Any end-of-session summary; RealmClosed shows one sentence and a link (realm-closed.tsx:5-16)
> - Any change in a villager's dialogue as their building progresses or completes (villagers.ts:16-23 are static strings)

### From section 6, the open questions this slice answers

**Q9. THE CHILD'S NAME ON THE WORK**

> We want the finished building to carry 'Raised by Nasrin · Spring 2026', and where it is cheap, what they actually did. It is the strongest emotional payoff available and it costs almost nothing — but it also permanently stamps a child's name into the world in a way that matters if heroes are ever renamed, retired, or shared between siblings. Confirm you want it.

**Recommendation (decision 9 was not put to the user directly): take it.** It is the only change in the whole programme that makes a child want to open the app a second time for a reason that is not a mechanic. The data risk the question names is real and it is answerable in two nullable columns — see §3.6 and §4. Renaming, retiring and sharing each get a stated rule, and every one of them degrades to something readable rather than to a crash or a blank.

**Q8 (siblings)** is answered by decision 8 and built in slice 6; this slice supplies the name the board prints. **Q1 (the castle)** is answered by decision 4 and built in slice 10; this slice is where the 8-of-8 payoff that makes the citadel stage reachable actually fires. **Q5 (combat stakes)** is answered by decision 3 and built in slice 8; this slice is where the bonus minutes it grants become legible to the person paying for them.

### Verified against the code, today

| Claim | Verified at |
|---|---|
| `deedsToBuild` is 5 for all eight buildings | `src/lib/utils/kingdom.ts:7-14` |
| `DEEDS` supplies 20 stories: 3 each for well/mill/chapel/library, 2 each for bridge/market/watchtower/garden | `src/lib/utils/deeds.ts:20-41`, counted |
| Progress clamps to the total, so extra runs vanish | `src/lib/utils/kingdom.ts:21-24` |
| `deeds_done` is a raw counter incremented once per completed run, with no notion of *which* deed | `src/lib/actions/deeds.ts:237-239` |
| `completed_at` on `kingdom_progress` exists and is set once, on the run that completes the building | `src/lib/actions/deeds.ts:248-252`, `src/lib/db/schema.ts:898` |
| `BuildingOverview.deeds` has no done flag | `src/lib/services/deeds.ts:11-15, 38` |
| `SiteCard` renders `Begin` on every row including on a complete building | `src/components/realm/site-card.tsx:73-85` |
| Villager greetings are static strings with no built variant | `src/lib/realm/villagers.ts:7, 16-23` |
| `RealmClosed` is one heading, one sentence and a link | `src/components/realm/realm-closed.tsx:5-16` |
| The HUD's only time copy is `{n} min left` | `src/components/realm/realm-hud.tsx:62` |
| The earned explanation exists only on the gate the child sees when locked out | `src/lib/realm/play-clock.ts:65` |
| The crown ceremony already pauses the play clock via `ceremonyRunning` | `src/components/realm/realm-shell.tsx:238` |
| `kingdom_progress` cascades on child delete | `src/lib/db/schema.ts:893-895` |
| There is no retired/archived flag on `child` | `src/lib/db/schema.ts:164-215`, grepped |
| `seasonLabel` produces a grade-year label ("2026–27"), not a calendar season | `src/lib/utils/seasons.ts:44-48` |
| Drizzle sqlite `mode: "timestamp"` stores **seconds** (`new Date(value * 1e3)` on read) | `node_modules/drizzle-orm/sqlite-core/columns/integer.js:65-70` |
| The last migration is 0025 | `src/lib/db/migrations/0025_worried_tyrannus.sql` |

---

## 2. Decisions

| # | Decision | Ruling |
|---|---|---|
| D13.1 | What `deedsToBuild` becomes | Explicit literals matching each building's real story count: well 3, mill 3, bridge 2, chapel 3, market 2, library 3, watchtower 2, garden 2. Twenty runs raise the whole kingdom, each story played once. Not derived from `deedsForBuilding().length` — an explicit number guarded by a test, so adding a story later is a deliberate act with a stated procedure, not a silent re-grade. |
| D13.2 | What counts as progress | **Distinct completed side quests at that site**, not total runs. Replaying one story is practice; it teaches, it moves mastery, and it does not raise walls. This is the other half of the audit's complaint — lowering the totals without this leaves "four buildings can only be finished by replaying the same two stories" literally still true. |
| D13.3 | What `deeds_done` means from now on | A lifetime run counter at that site, used for "Practised 4 more times" and the parent panel. It no longer decides progress. A stored value changing meaning triggers the one-time message rule (D13.5). |
| D13.4 | Once raised, always raised | A building whose `completed_at` is set is complete forever, whatever any future count says. Held in one pure place (`buildingProgress`), so no later slice can un-build a child's wall by writing a new story. |
| D13.5 | The migration hazard | Nothing rises silently. `announced_at` records whether the world has shown a rise; the migration marks already-complete rows announced and leaves the retro-completions unannounced; the next visit plays them as a rise with copy that says *why*. `regraded_at` on `realm_settings` records which heroes this actually happened to, so no one else gets a message about nothing. |
| D13.6 | Where the rise is announced | `announced_at` means "the hero has seen this building rise **in the world**". The Side Quests page never sets it. This fixes a latent gap for free: a building finished on the phone now rises in the Realm on the next visit, instead of having quietly appeared. |
| D13.7 | Attribution storage | Two nullable snapshot columns on `kingdom_progress`, written once at completion: `raised_by_name`, `raised_season_id`. Live derivation is rejected: renaming a hero would rewrite history on every stone they ever laid, and `planSeasonTransition` can relabel, reopen and even delete a season row (`seasons.ts:60-99`), so the season a stone was laid in is not safely re-derivable either. |
| D13.8 | Two things are called "season" | The sign speaks **calendar seasons** — "Spring 2026" — because that is what a child remembers. The parent panel and any future transcript speak **grade-year seasons** — `seasonLabel()`'s "2026–27" — because that is what a record needs. `raised_season_id` feeds the second and never the first; the child-facing phrase always comes from `completed_at`, which is a fact that never moves. |
| D13.9 | No backfill of names | Every row completed before this slice keeps `raised_by_name = NULL` and falls back to the live hero name, exactly as decision 9 states. Stamping a name onto old rows would be fabricating a record we never kept. |
| D13.10 | The 8-of-8 ceremony does not make the child walk | The villagers come to the hero. Marks are built around the hero's current position, so there is no cross-map hero walk, no wedged-hero failure mode, and no minutes spent on traversal. Maximum 12.5 s, once per kingdom, ever. |
| D13.11 | The world after 8 of 8 | Not inert, and we say what to do instead. This slice consumes slice 8's zone-based spawning and ships the completed-kingdom objective copy, with a stated fallback string if the bonus-minute reward did not ship. |
| D13.12 | The session summary is not a modal | It replaces the body of `RealmClosed`, and it is also what the deliberate exit shows. No Realm minutes are recorded while it is on screen, and it mounts only after `clock.flushPending()` settles (capped at 1500 ms), so no exit path bypasses the ledger. |
| D13.13 | The clock is reframed without new permanent chrome | The earned clause is a 4-second opening beat in slice 1's centred message lane, the under-two-minutes banner, and the summary — not a fourth chip in the corner. Slice 1 deleted the fake scoreboard; this slice does not rebuild it. |
| D13.14 | The earned clause is conditional on the access mode | "Every quest you complete banks minutes here" is false for a hero on `accessMode: "scheduled"`. The banner reads the mode and says something true instead. |
| D13.15 | Parent preview | Every one-time surface in this slice is suppressed in preview and records nothing: no rise walkthrough, no kingdom ceremony, no summary, no `announced_at` write. A parent must never consume a child's once-ever message. Attribution in preview shows the snapshot, or the hero's own name from the bundle — never the previewing adult's. |
| D13.16 | Two figure marks, no more | The built Well gets a plaque and the built Library gets a filled shelf, drawn by slice 11 as **two extra registered catalog rows** — `building:well-plaque` and `building:library-full` — selected by `figureKeyFor(prop)` from `SiteProgress.complete`. Not boolean parameters: slice 11 ships `BuildingFigure({ id })` and a second row is cheaper than a widened signature, keeps both variants in `/dev/figures`, and counts both against the raster budget. Every other "what they actually did" is text on the SiteCard, where there is room and where a parent can read it. |

---

## 3. Design

### 3.1 The real deed counts

`src/lib/utils/kingdom.ts` — `deedsToBuild` per building becomes:

| Building | Stories in `DEEDS` | `deedsToBuild` |
|---|---|---|
| well | well-stones, well-signs, well-water | 3 |
| mill | mill-sacks, mill-ledger, mill-wheel | 3 |
| bridge | bridge-planks, bridge-toll | 2 |
| chapel | chapel-bell, chapel-scroll, chapel-stars | 3 |
| market | market-prices, market-crier | 2 |
| library | library-shelves, library-catalog, library-scribe | 3 |
| watchtower | watchtower-height, watchtower-signals | 2 |
| garden | garden-beds, garden-bees | 2 |

The whole kingdom becomes **20 runs × 8 questions = 160 questions across 20 distinct stories, each played once**, down from 40 runs / 320 questions drawn from the same 20. The arc a child can hold in their head is "do each of these once", which is the audit's own recommendation.

A guard test asserts `b.deedsToBuild === deedsForBuilding(b.id).length` for all eight. Adding a story later fails that test, which is the point: the author must then raise the number deliberately, and D13.4 guarantees no already-raised building falls back down.

`kingdom.ts` gains an import of `deedsForBuilding` **only in the test file**, not in the module — the literals stay literals so the module has no dependency on the story catalogue at runtime.

### 3.2 Progress is distinct side quests, and once raised is always raised

`buildingProgress` changes shape so the two inputs cannot be confused:

```ts
// src/lib/utils/kingdom.ts
export type SiteTally = {
  /** Distinct deeds at this site with at least one completed run. Decides progress. */
  distinctDone: number;
  /** Every completed run at this site, ever. Display only; never progress. */
  runsDone: number;
  /** The site has a completed_at. Once raised, always raised. */
  raised: boolean;
};

export function buildingProgress(
  tally: SiteTally,
  building: Building
): { done: number; total: number; complete: boolean };
```

Rules: `complete = tally.raised || tally.distinctDone >= building.deedsToBuild`; `done = complete ? total : clamp(distinctDone, 0, total)`; `total = building.deedsToBuild`.

**Every call site this signature change breaks, and what each becomes.** `buildingProgress(deedsDone: number, building)` is called from more places than the two an earlier draft named, and three of them are surfaces earlier slices shipped. There is **no back-compatible overload**: a numeric first argument would silently mean "runs" where the new rule means "distinct stories", which is the exact confusion the type change exists to prevent. All of these move in one commit.

| call site | today | becomes |
|---|---|---|
| `src/lib/services/deeds.ts:35` (`buildKingdomOverview`) | `buildingProgress(row.deedsDone, b)` | builds a `SiteTally` from `ProgressRow` + `loadDeedTallies`, passes it |
| `src/lib/actions/deeds.ts:247` (`applyDeedResult`) | same | same, from the runs it has just written |
| `src/lib/realm/tavern-board.ts` (**slice 6**, `recentRaisings`) | `buildingProgress(deedsDone, b).complete` decides what counts as a raising | reads `row.completedAt !== null` directly. **This is the important one**: under the new rule, a hero who replayed one story three times must not appear on the family board as having raised a two-story building. Slice 6's own test case (`completedAt` null but `deedsDone >= total` → included) is **rewritten** to exclude that row, and the board's rule becomes "a raising is a `completed_at`", which is what the board always meant. |
| `src/lib/realm/objective.ts` (**slice 1**) | `objectiveState`/`pickObjective` take `SiteProgress[]` carrying `{done, total, complete}` | unchanged in shape — `buildKingdomOverview` still produces `{done, total, complete}`, now computed from distinct stories. The objective card's pip count goes from five pips to two or three per building, which slice 1's §3.6 illustrative "of 5" strings anticipate; the rendered strings derive from `done`/`total` and need no edit, but **slice 1's test fixtures and pip mockups are re-baselined here**, in this slice's commit. |
| `src/components/realm/deed-picker.tsx`, `kingdom-panel.tsx` (**slice 6**) | read `{done, total}` off `BuildingOverview` | unchanged; the numbers are smaller |
| `src/lib/realm/plot.ts` (**slice 10**, `plotStageFor(done, total)`) | fraction-driven | unchanged by design — `plotStageFor` was written fraction-driven *precisely* so a lowered `total` moves a plot to the right stage rather than to a wrong one. But it **does** move: a site at 3 of 5 (0.60 → `stone`) becomes 3 of 3 (raised). Covered by the rise beats in §3.3 and by the migration's `announced_at`. |
| `src/lib/realm/sign.ts` (**slice 10**, signboard line 2) | `{done} of {total}` or a pip row | unchanged in shape; the pip row goes from five pips to two or three, which is **inside** `SIGN_PIP_MAX` (8) and needs no re-layout |

The last two are the answer to "does the re-grade retro-change surfaces earlier slices shipped": yes, three of them — the Tavern board, the plot stages and the signboards — and all three are driven from `completed_at` or from a fraction, so all three land correctly. The board is the only one whose *rule* changes, and it changes to the stricter, truer one.

**The one case where a child's bar shrinks, stated honestly.** A child who played `bridge-planks` four times and `bridge-toll` never went from "4 of 5" to "1 of 2". Their bar is shorter and their *remaining work is identical* — one more run either way. A heavier replayer (four runs of `chapel-bell`, nothing else) goes from "4 of 5, one to go" to "1 of 3, two to go" and genuinely owes two more runs. That is the child for whom the new rule is most obviously right, the delta is capped at `total - 1` (two runs at most), the walkthrough in §3.3 tells them the rule changed, and no child anywhere loses a building they had already raised.

### 3.3 The rise the child never saw

Three things can make a building complete without the child watching it rise: the migration in §4, a side quest finished on the Side Quests page, and (in principle) a parent's repair. One mechanism covers all three.

**`announced_at`** on `kingdom_progress` is "the world has shown this rise". `pendingRises()` finds the complete rows that have none, and the world plays them at the top of the next visit, in `BUILDINGS` order.

```ts
// src/lib/realm/rises.ts
export type RiseRow = { id: string; label: string; complete: boolean; announced: boolean };
export type RiseBeat = { text: string; spoken: string; holdMs: number; buildingIds: string[] };

/** Complete sites the world has not yet shown rising, in BUILDINGS order. */
export function pendingRises(buildings: RiseRow[]): RiseRow[];

/**
 * The centred-lane beats for a pending set. One building gets the normal rise
 * line; two or more get the collective line then the roll-call. `regraded`
 * appends the sentence that says why, once ever (see regraded_at).
 */
export function riseBeats(rises: RiseRow[], regraded: boolean): RiseBeat[];
```

**Copy, verbatim.**

One building:

- Beat 1 (2500 ms): `The Village Well stands.` — generic: `The ${label} stands.`
- Spoken: `The Village Well stands.`

Two or more:

- Beat 1 (2000 ms): `Four buildings rose while you were away.` — generic: `${countWord(n)} buildings rose while you were away.`
- Beat 2 (3000 ms): `The River Bridge, the Market Square, the Watchtower and the Royal Garden.` — generic: `${listBuildings(labels)}.`
- Spoken (one utterance across both beats, so `speak()`'s cancel does not clip it): `Four buildings rose while you were away: the River Bridge, the Market Square, the Watchtower and the Royal Garden.`

When `regraded` is true, one extra beat is appended, once ever:

- Beat 3 (3500 ms): `Each building needs fewer side quests now — so the work you already did was enough.`
- Spoken: `Each building needs fewer side quests now, so the work you already did was enough.`

**No pause, no input block.** The beats run in slice 1's centred message lane at the `toast` priority while the child walks. Total 2.5 s for one building, 5.0 s for several, 8.5 s in the single worst case (several buildings *and* a re-grade, which can only happen once per hero in the app's whole life). The play clock keeps ticking; §3.11 states the cost.

**The buildings themselves.** The layout is already memoised on `kingdom.buildings` (`realm-shell.tsx:214-217`), so the completed sites are drawn as buildings from the first frame. What the beat adds is slice 10's rise animation, replayed for the pending set. The scene prop stays `risingId: string | null` — the queue lives in a ref in the shell and the shell hands the scene one id at a time, because a freshly-allocated `string[]` prop every render would break the `World` memo that is shielding the scene from ~5 re-renders/second of `setMana`.

After the last beat, the shell calls `markKingdomAnnounced(childId, ids)`. Failure is silent and the beats simply play again next visit (see §5).

### 3.4 Per-deed history on the site card

`BuildingOverview.deeds` gains two fields, fed by one extra indexed query grouped on `deed_id`:

```ts
// src/lib/services/deeds.ts
export type DeedTally = { deedId: string; timesCompleted: number; inProgress: boolean };
export type DeedOverview = {
  id: string; title: string; story: string; area: SkillArea;
  timesCompleted: number;   // completed runs of this story
  inProgress: boolean;      // an unfinished run inside the resume window
};
```

`inProgress` uses the same rule `startDeedRun` already uses: an unfinished run started inside `RESUME_WINDOW_MS` (`actions/deeds.ts:39, 109-120`). The world has never said this out loud; now it does.

```ts
/** Resumable first, then never-played in DEEDS order, then least-practised. */
export function sortDeedsForSite(deeds: DeedOverview[]): DeedOverview[];
```

Rank: `inProgress` → 0; `timesCompleted === 0` → 1; otherwise 2, tie-broken by `timesCompleted` ascending then `DEEDS` order. The resumable row leads because it expires within the hour and its answered questions are lost with it — at most one row ever holds that rank.

**SiteCard copy, verbatim.**

Header subtitle is `villager.greeting` today; on a complete building it becomes `villager.builtGreeting` (§3.5).

Progress row, unchanged shape: `Village Well` and `Built` or `2 of 3`.

New line under the progress bar, only when complete, class `realm-panel-raised`:

- `Raised by Emma · Spring 2026` — and every degraded form in §3.6.

New line under that, only when complete, class `realm-panel-practice`:

- Full depth: `3 side quests · 24 questions answered.` — generic: `${runsDone} ${plural(runsDone, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER)} · ${runsDone * 8} questions answered.`
- Simple depth: `3 side quests here.`
- When `runsDone > total`: a second sentence, ` Practised 1 more time.` / ` Practised 4 more times.`

New note above the deed list, only when complete:

- `The Village Well already stands. Playing again is practice — it still teaches.`

Deed rows:

| State | Row mark | Button label | `aria-label` |
|---|---|---|---|
| never played | none | `Begin` | `Begin Count the Well Stones` |
| resumable | none | `Continue` | `Continue Count the Well Stones` |
| finished, simple depth | check icon + `Done` | `Begin` | `Begin Count the Well Stones` |
| finished, full depth, once | check icon + `Done` | `Begin` | as above |
| finished, full depth, more | check icon + `Done · 3 times` | `Begin` | as above |
| any row on a complete building | as above | `Practise again` | `Practise Count the Well Stones again` |

The resumable row also carries, under its story: `You started this one — pick it up where you left off.`

**`DeedResults` stops lying.** `RunSummary.building` gains `practice: boolean`, true when the building was already complete before this run. `deed-results.tsx:22-26` becomes:

- rose this run: `Village Well is built!` (unchanged)
- practice: `The Village Well already stands — that practice went to your skills.`
- otherwise: `Village Well: 2 of 3 side quests` (unchanged)

### 3.5 The villagers stop begging for a well they have

`Villager` gains `builtGreeting: string`. All eight, verbatim:

| Villager | `builtGreeting` |
|---|---|
| Old Bram | `The bucket comes up full now. Sit a while — the water's cold and sweet.` |
| Miller Tessa | `The wheel turns and the sacks are counted. The baker has flour by morning.` |
| Carpenter Aldo | `Every plank holds. Folk cross dry-shod now, and they say your name when they do.` |
| Sister Wren | `The bell rings out over the whole valley. You gave it its voice.` |
| Crier Pip | `Stalls up, prices fair, and bread in the air. Come hear the news.` |
| Librarian Hesper | `Every scroll is shelved and safe. The catalog is true because you read it true.` |
| Mason Gerd | `The lantern's lit and the hills are watched. We sleep easy, thanks to you.` |
| Keeper Ivy | `The bees found the beds. Sit on the bench and listen a moment.` |

```ts
// src/lib/realm/villagers.ts
export function greetingFor(villager: Villager, complete: boolean): string;
```

Every surface that shows a greeting calls `greetingFor`, so none of them can disagree: the SiteCard subtitle, slice 1's villager status line, and (from slice 9) the read-aloud on reach.

### 3.6 Attribution — the stone keeps the name it was laid with

```ts
// src/lib/realm/attribution.ts   (pure; no three, no db, safe under Vitest)
export type Hemisphere = "north" | "south";

/**
 * Derived, not hardcoded. The season phrase is stamped onto a permanent in-world signboard and
 * onto the family Tavern board, so "Spring 2026" in September is the one piece of copy in the
 * programme that is wrong for half the world AND cannot be corrected after the fact.
 * `family.timezone` already exists and already identifies the hemisphere for every IANA zone;
 * a one-line lookup over the zone's region prefix is enough, and it needs no new column, no
 * settings UI and no migration.
 */
export function hemisphereForTimezone(tz: string | null | undefined): Hemisphere;
export const DEFAULT_HEMISPHERE: Hemisphere;  // "north" — only when the timezone is absent or unknown

export type RaisedInput = {
  /** Written into the stone at completion. null for every row raised before this slice. */
  snapshotName: string | null;
  /** The hero's name right now — always the hero's, never the viewing adult's. */
  liveName: string | null;
  /** kingdom_progress.completed_at. null while the site is unraised. */
  completedAt: Date | string | null;
};
export type RaisedLine = { name: string | null; season: string | null; text: string | null };

/** "Spring 2026". Meteorological seasons on the date's own calendar year. */
export function seasonPhrase(date: Date | string, hemisphere?: Hemisphere): string;

/** snapshotName ?? liveName, trimmed; an empty string counts as missing. */
export function raisedName(input: RaisedInput): string | null;

/** The sign's third line, plus its halves for surfaces that lay them out separately. */
export function raisedLine(input: RaisedInput, hemisphere?: Hemisphere): RaisedLine;

/** "the Chapel" · "the Chapel and the Mill" · "the A, the B and the C". */
export function listBuildings(labels: string[]): string;
```

`seasonPhrase` mapping, northern: Mar–May `Spring`, Jun–Aug `Summer`, Sep–Nov `Autumn`, Dec–Feb `Winter`; southern flips Spring↔Autumn and Summer↔Winter. The year is the date's own calendar year in every case, so both January 2026 and December 2026 read `Winter 2026`. "Autumn" over "Fall" for the app's register (`Hail, traveler!`, `The villagers are resting.`).

**`raisedLine` — every case, spelled out.**

| `snapshotName` | live name | `completedAt` | `text` |
|---|---|---|---|
| `"Emma"` | anything | 2026-04-10 | `Raised by Emma · Spring 2026` |
| `null` | `"Emma"` | 2026-04-10 | `Raised by Emma · Spring 2026` |
| `"Emma"` | anything | `null` | `Raised by Emma` |
| `null` | `null` | 2026-04-10 | `Raised in Spring 2026` |
| `null` | `null` | `null` | `null` — the sign shows only the building name |
| `"   "` | `"Emma"` | 2026-04-10 | `Raised by Emma · Spring 2026` (blank snapshot is missing, not a name) |

**The four data situations decision 9 warned about.**

- **A renamed hero.** The stone keeps the name it was laid with; the nameplate, the HUD, the Tavern board's *hero* column and the parent panel all show the new name. A stone is a record of who did the work under the name they had; everything else follows the live name.
- **A retired hero.** There is no retired flag on `child` (schema.ts:164-215). Retiring means one of two things. If the row is deleted, `kingdom_progress` cascades (schema.ts:893-895) and there is nothing left to render — the snapshot cannot save a row that no longer exists, and the Tavern board simply loses those entries. If the hero is merely no longer played, the row is intact, the live name is intact, and the snapshot wins anyway.
- **A shared hero.** Two children playing one hero produce one name on every stone: the hero's. That is what the data says and this slice does not pretend otherwise. `raised_by_name` snapshots the hero's display name at completion, which is exactly as true as the app's own model.
- **A parent previewing.** `liveName` is always `bundle.heroName`, sourced from the child row the page resolved (`realm/page.tsx:48`), never from the actor. A test asserts a preview of Emma's realm never renders the adult's name.

**Where the line appears.** On the finished signboard's third line — the line slice 10 reserved (§8). On the SiteCard, class `realm-panel-raised`. On the Tavern board (§3.8). In the session summary's rise line when a building rose this visit. In the parent panel's newest-building line.

**What they actually did, in the world, where it is cheap.** Two marks only (D13.16), both **built-state catalog rows** slice 11 has already authored (`building:well-plaque`, `building:library-full`), both visible only in a built state that is reached exactly when the work is done:

- The built **Village Well** carries a small plaque on its wall. A raised well means all three of its side quests were played, so the plaque is honest by construction.
- The built **Library** shows three filled scroll slots on its shelf. A raised library means shelves, catalog and scribe were all played, so a full shelf is likewise honest.

Neither is a new sprite kind: both are the built state of a figure that already has one (see §3.13, rasterisation budget). If slice 11's redraw makes the parameter impractical, both drop to the SiteCard text in §3.4 and nothing else changes.

### 3.7 The Tavern board takes snapshot names

Slice 6 built the board. This slice changes exactly one expression in it — the name — and publishes the helper:

```ts
raisedName({ snapshotName: row.raisedByName, liveName: row.childDisplayName, completedAt: row.completedAt })
```

Resulting copy, in the board's own voice:

- `Emma raised the Grain Mill yesterday.` (recent, board's existing relative-date phrasing)
- `Emma raised the Grain Mill · Spring 2026` (older entries)
- `The Grain Mill was raised · Spring 2026` (no name available at all — the `!name && season` case)

If slice 6's board keyed its rows on the live child name, this is a one-line change at its row builder plus two extra selected columns.

### 3.8 Eight of eight

Nothing in the codebase detects all eight complete. This adds it.

**Trigger.** `applyDeedResult` (`kingdom-state.ts:11-19`) already reports `rose`. The shell additionally computes `crowned = rose && every building complete`. Because the eighth rise happens while the child is standing at that villager (they just closed the DeedPanel), the hero is already somewhere sensible and nobody has to walk anywhere.

**Script.** `src/lib/realm/ceremony/ceremony.ts` is extended, not duplicated — it is already pure, already tested, and already stepped by the scene's frame loop.

```ts
export type CeremonyKind = "crown" | "kingdom";
export const KINGDOM_WALK_TIMEOUT_MS = 6000;
export const KINGDOM_GATHER_MS = 2500;

/** Marks in a half circle around the hero where they stand — no cross-map hero walk. */
export function kingdomMarks(hero: Vec2, layout: WorldLayout): CeremonyMarks;
export function startKingdomCeremony(layout: WorldLayout, hero: Vec2, reducedMotion: boolean): CeremonyState;
export function kingdomNotice(step: CeremonyStep, heroName: string): string | null;
```

`CeremonyState` gains `kind: CeremonyKind`. Three behaviours key off it and nothing else does: the walk timeout (6 s instead of 20 s), the gather length (2500 ms instead of `GATHER_MS` 3000), and `gather → hail` directly with no `descend` (there is no crown to lower). `ceremony-layer.tsx:33` becomes `s.kind === "crown" && s.step !== "walk"` so the crown sprite stays hidden; the gold sparkle burst at `hail` fires for both kinds, because it is the payoff.

**Route.** From slice 4 onward, every cross-map route uses `roadPath()` from `village.ts`. `startKingdomCeremony` builds each villager's route as `roadPath(villagerPosition, mark)` and `stepCeremony` walks the waypoints with the existing `stepHero` slide; the 6-second timeout snaps anyone still walking to their mark. The hero is never moved, so the hero cannot be wedged by this ceremony, and slice 4's `unstickHero` is not disabled while it runs.

**Copy, verbatim.**

- On `gather` (centred lane, large): `The people of the Realm come to see it.`
- On `hail` (centred lane, large): `Eight of eight. The kingdom stands, Emma.` — generic `Eight of eight. The kingdom stands, ${heroName}.`
- Toast at `hail`: `Your kingdom is complete.`
- Spoken once, at `hail`: `Eight of eight. The kingdom stands, Emma.`
- `aria-live` (polite): the same sentence.

**The keep.** The layout is memoised on `kingdom.buildings`, so slice 10's `keepStageFor(8)` returns the citadel on the same render the eighth building completes — the child is looking at the citadel throughout the hail. The cosmetic `CASTLE_TYPES` skin from decision 4 still applies on top; no child loses a tier they were saving toward, and this slice changes nothing on `/castle`.

**Ordering against the crown ceremony.** Both cannot run at once. The crown ceremony is queued at mount (`ceremonyPending`, `realm-shell.tsx:181`) and always wins; the kingdom ceremony waits in a ref and starts when `ceremonyStage` reaches `"done"`. If the kingdom is crowned during a visit whose crown ceremony has not yet played, the crown plays first and the kingdom ceremony follows it in the same visit.

**The world does not go inert.** Slice 8's zone-based spawning means a finished kingdom still has troubles and the ability bar still has something to point at. This slice ships the completed-kingdom objective line for slice 1's objective card, which renders it when `pickObjective` returns `null`:

- `Your kingdom stands. Troubles still gather — clear them and earn more time here.`
- **Stated fallback** if slice 8's bonus minutes did not ship: `Your kingdom stands. Walk it whenever you like.` — because no string may promise what the code does not do, and "Clear troubles to protect the sites" is the reason that rule exists.

### 3.9 The session summary

`RealmClosed` keeps its name and its file (`realm-closed.tsx`); it gains a `summary` prop and now serves two exits: the clock closing, and the child choosing to leave.

```ts
// src/lib/realm/session.ts
export type KingdomSnapshot = { id: string; label: string; done: number; total: number; complete: boolean }[];
export type SessionCounters = {
  sideQuestsFinished: number;
  troublesCleared: number;      // slice 8
  bonusMinutes: number;         // slice 8, from the ledger
  minutesPlayed: number;        // clock records emitted this visit
  minutesRemaining: number;
  questCount: number;           // "earned" ledger rows today
  gleams: number; laps: number; bestLapMs: number | null;  // slice 12
};
export type SessionTally = {
  sideQuestsFinished: number;
  advanced: { label: string; from: number; to: number; total: number; rose: boolean }[];
  raisedNow: number; raisedBefore: number;
  troublesCleared: number; bonusMinutes: number;
  minutesPlayed: number; minutesRemaining: number;
  gleams: number; laps: number; bestLapMs: number | null;
};
export type SummaryCopy = { headline: string; lines: string[]; forward: string | null; spoken: string };

export function snapshotKingdom(buildings: BuildingOverview[]): KingdomSnapshot;
export function tallySession(start: KingdomSnapshot, now: KingdomSnapshot, counters: SessionCounters): SessionTally;
export function summaryLines(
  tally: SessionTally,
  heroName: string,
  next: { label: string; villager: string; remaining: number } | null,
  opts: { numerals: boolean; fewerChoices: boolean; accessMode: RealmAccessMode }
): SummaryCopy;

export const KINGDOM_COMPLETE_OBJECTIVE: string;   // §3.8, replacing slice 1's interim pair
export const KINGDOM_COMPLETE_OBJECTIVE_NO_BONUS: string;
// These REPLACE slice 1's `Every building is raised.` / `Nothing is waiting. Walk where you like.`
// Slice 1 labelled that pair an interim and named this slice as its heir; the two strings and
// `objective.test.ts`'s assertions on them move in THIS slice's commit, not before.
```

The start snapshot is taken once, at mount: `useState(() => snapshotKingdom(bundle.kingdom.buildings))` — referentially stable, never recomputed, so it cannot disturb the `World` memo. Both halves of the diff are already in shell state, exactly as the brief says.

**Copy, verbatim, in order.** Zero-valued lines are omitted entirely.

- Headline: `Well played, Emma!` (unchanged from `realm-closed.tsx:10`)
- `3 side quests finished.` / `1 side quest finished.` — `${n} ${plural(n, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER)} finished.`
- Per advanced building: `Village Well — 2 of 3.` and, when it rose: `The Village Well rose today — raised by Emma · Spring 2026.`
- Kingdom line, full depth: `Your kingdom: 4 of 8 raised.` Simple depth: the same sentence with a pip row `●●●●○○○○` and `aria-label="4 of 8 raised"`.
- Slice 8: `You cleared 6 troubles and earned 2 extra minutes.` / `You cleared 1 trouble and earned 1 extra minute.` / when troubles were cleared but no minutes were granted (sub-cap reached): `You cleared 6 troubles.`
- Slice 12: `9 gleams · best lap 41.2 s.` / `9 gleams.` when no lap was completed.
- Time: `You played 12 minutes today.` / `You played 1 minute today.`
- Then, whichever is true:
  - minutes remain: `You have 5 minutes left.`
  - none remain and the hero earns minutes (`accessMode` `earned` or `both`): `Every quest you complete banks minutes here.` (`play-clock.ts:65`, verbatim)
  - none remain, `accessMode: "scheduled"`: `The Realm opens again at recess.`
- Forward hook, from slice 1's `pickObjective`: `Next: the Grain Mill needs 2 more side quests. Miller Tessa is waiting.` / `…needs 1 more side quest.` When the kingdom is complete: `Your kingdom is finished. The Realm is yours to wander.`
- Nothing happened at all: `You wandered the Realm for 4 minutes.` then `Nothing rose today. Old Bram is still waiting at the Village Well.` (the villager and site come from `pickObjective`.)
- Links: `Back to the Tavern →` (existing, `realm-closed.tsx:12`) and, when minutes have run out and the hero earns them, `Open Emma's Quest Log →` (`realm-gate.tsx:13`, verbatim).

Spoken (one utterance on mount, behind a last-spoken ref, numbers as words):

`Well played, Emma. You finished three side quests. The Village Well rose today. Your kingdom is four of eight. Next, the Grain Mill needs two more side quests.`

**Exit paths, and the door this attaches to.** `realm-hud.tsx:96`'s `Leave the Realm` link **does not exist by this slice** — slice 6 deleted it and made the world's exit the **Tavern door**. So the summary attaches to the door slice 6 built, not to a link slice 6 removed:

> The Tavern panel's **`Go in`** button becomes the summary trigger. It awaits `clock.flushPending()` — capped at 1500 ms via `Promise.race` — and then swaps the panel **in place** to the summary phase. The summary's own `Back to the Tavern →` performs the `router.push("/tavern")`.

Slice 6's copy stays true word for word: `Going in ends your visit here. Come back any time you have minutes left.` The visit *does* end at that button; the summary is what ending looks like. Slice 6's other two easy exits — `Open the full Quest Log →` and the Library door — are **navigations, not endings**, and they keep slice 6's fire-and-forget `void clock.flushPending(); router.push(href)` with no summary: a child going to build a spell has not finished playing.

While the flush is in flight the summary shows `Adding up your visit…` in place of the lines. The clock-close path already routes through `onClose` (`realm-shell.tsx:110-112`), which unmounts `RealmOpen`; the counters and the start snapshot are therefore lifted into a ref that `RealmShell` owns and `RealmOpen` writes, so the summary survives the unmount. **No Realm minutes are recorded while the summary is on screen** — the clock is gone with `RealmOpen`.

`largerText` must survive too: the summary renders outside the `document.body` portal and therefore outside `.realm-root`'s `readingAttributes` (`realm-shell.tsx:485`), so `RealmClosed` carries `readingAttributes(bundle.profile)` itself. Without this, the largest, proudest screen in the app is the one screen that ignores the setting.

### 3.10 The clock, reframed as earned

Ledger reads gain one pure splitter:

```ts
// src/lib/utils/realm-access.ts
export type Earnings = {
  questCount: number; questMinutes: number;
  bonusCount: number; bonusMinutes: number;
  grantedMinutes: number; spentMinutes: number; balance: number;
};
export function splitEarnings(rows: LedgerRow[]): Earnings;
```

`questCount` is the number of `"earned"` rows, which is one per completed quest — `grantEarnedMinutesForCompletion` dedupes by `sourceAssignmentId` (`realm-play.ts:88-101`), so the count is exact. `bonusCount`/`bonusMinutes` read slice 8's ledger kind. `ledgerBalance` already treats every non-`"spent"` kind as credit (`realm-access.ts:37-40`) and `computeRealmAccess` already clamps to `dailyCapMinutes - spent` (`realm-access.ts:64-66`), so bonus minutes are inside the parent's ceiling by construction and no new capping code is written.

```ts
// src/lib/actions/realm-play.ts  ("use server", async only)
export async function getRealmEarnings(childId: string, date: string): Promise<Earnings>;
```

One indexed query on `realm_play_ledger` (`realm_play_ledger_child_date_idx`). Called once at mount, in parallel with the existing `getRealmAccess` in the shell's mount effect, and once more when the summary is built. `LedgerRow` needs no schema change — counts are `rows.length` per kind.

**Copy, verbatim.**

*Opening beat*, once per visit, in slice 1's centred lane at `notice` priority, 4000 ms, no pause, no input block:

- `12 minutes in the Realm today — earned from 3 quests.`
- Singular: `5 minutes in the Realm today — earned from 1 quest.`
- Minutes from a grant or off-hours, no quests today: `12 minutes in the Realm today.`
- Recess source (`clock.source === "recess"`): `Recess! 12 minutes in the Realm.`
- Spoken: `You have twelve minutes in the Realm today. You earned them from three quests.`

*Under-two-minutes banner*, replacing `One minute left in the Realm today.` (`realm-hud.tsx:100`). Second sentence chosen by `accessMode` so it is never false (D13.14):

- earned / both: `2 minutes left. Every quest you complete banks minutes here.` and `1 minute left. Every quest you complete banks minutes here.`
- scheduled: `2 minutes left in recess.` / `1 minute left in recess.`
- off-hours source: `2 minutes left today.` / `1 minute left today.`

The permanent HUD chip stays what slice 1 made it — the clock icon and `12 min` — with `· paused` while paused. This slice adds no fourth chip to the corner row that slice 1 emptied.

`RealmBundle.settings` gains `accessMode: RealmAccessMode` so the shell can pick the true sentence. `usePlayClock` returns one new field, `minutesPlayed: number`, incremented by `ticked.records` inside the interval callback (never during render).

### 3.11 What the parent sees

A new `RealmPanel` server component on the existing parent dashboard (`src/app/(app)/tavern/parent-dashboard.tsx`), rendered after the per-hero summary cards.

```ts
// src/lib/realm/parent-report.ts   (pure)
export type DayCell = { date: string; sideQuests: number; questMinutes: number; bonusMinutes: number; spentMinutes: number };
export type HeroReport = {
  childId: string; name: string;
  days: DayCell[];                       // oldest → newest, one per day in range, zero-filled
  totals: { sideQuests: number; questMinutes: number; bonusMinutes: number; spentMinutes: number };
  raised: number; ofTotal: number;       // buildings raised, of 8
  newest: { label: string; raised: string | null } | null;   // raised = raisedLine().text
  capMinutes: number; usedToday: number;
};
export function reportRange(today: string, days: number): string[];
export function buildHeroReport(input: {
  childId: string; name: string; dates: string[];
  runs: { date: string }[]; ledger: { date: string; kind: LedgerKind; minutes: number }[];
  buildings: { label: string; complete: boolean; completedAt: string | null; raisedByName: string | null }[];
  capMinutes: number; today: string;
}): HeroReport;
export function reportLines(report: HeroReport): { activity: string; kingdom: string; cap: string };
```

Fourteen days. Two extra queries per hero (completed `deed_run` rows by date; `realm_play_ledger` rows by date), added to the dashboard's existing per-hero `Promise.all` so they cost one round trip of latency, not two — the production database is remote Turso and round-trip fan-out is the thing to avoid here.

**Copy, verbatim.**

- Panel title: `The Realm`
- Under the title: `Realm minutes are earned from schoolwork. If the two rows move together, the reward is pulling the work along.`
- Range label: `Last 14 days`
- Activity line: `11 side quests · 55 min earned · 8 min from troubles · 47 min played`
- Kingdom line: `4 of 8 buildings raised · newest: the Chapel, Raised by Emma · Spring 2026` — with no completed buildings: `No buildings raised yet.`
- Cap line: `Daily cap 30 min · 12 used today.`
- Hero with no activity: `Emma hasn't opened the Realm in the last 14 days.`
- Family with no Realm activity at all: `No Realm activity in the last 14 days.`
- Link: `Open Emma's Realm →` → `/realm?child={childId}` (the Realm page already reads `?child`, `realm/page.tsx:11-14`)

**Rendering.** No chart library. Per hero, a 14-column grid: a dot row on top whose filled dots are side quests finished that day (`--streak`), and under it a stacked bar of quest minutes (`--gold-bright`) and bonus minutes (a muted accent), heights scaled to the hero's own 14-day maximum. The bars are `aria-hidden`; underneath them a visually-hidden `<table>` carries the same numbers with the caption `Side quests finished and Realm minutes earned by day for Emma, last 14 days.` — so the person the panel exists for gets the numbers whether or not they can read a bar.

The panel is a parent surface only; there is no child view of it, and it is not reachable from the Realm.

### 3.12 New and changed modules, with signatures

**New, pure, all under `src/lib/realm/**` with colocated tests, none importing three:**

```ts
// src/lib/realm/words.ts
export function countWord(n: number): string;                       // "one".."twelve", then digits
export function plural(n: number, one: string, many: string): string;
export function listOf(items: string[]): string;                    // "a, b and c"
export function spokenNumber(n: number): string;                    // words to 20, digits beyond
```

```ts
// src/lib/realm/attribution.ts   — §3.6
export function hemisphereForTimezone(tz: string | null | undefined): Hemisphere;
export const DEFAULT_HEMISPHERE: Hemisphere;
export function seasonPhrase(date: Date | string, hemisphere?: Hemisphere): string;
export function raisedName(input: RaisedInput): string | null;
export function raisedLine(input: RaisedInput, hemisphere?: Hemisphere): RaisedLine;
export function listBuildings(labels: string[]): string;
```

```ts
// src/lib/realm/rises.ts        — §3.3
export function pendingRises(buildings: RiseRow[]): RiseRow[];
export function riseBeats(rises: RiseRow[], regraded: boolean): RiseBeat[];
```

```ts
// src/lib/realm/session.ts      — §3.9
export function snapshotKingdom(buildings: BuildingOverview[]): KingdomSnapshot;
export function tallySession(start: KingdomSnapshot, now: KingdomSnapshot, counters: SessionCounters): SessionTally;
export function summaryLines(tally, heroName, next, opts): SummaryCopy;
export const KINGDOM_COMPLETE_OBJECTIVE: string;
export const KINGDOM_COMPLETE_OBJECTIVE_NO_BONUS: string;
```

```ts
// src/lib/realm/parent-report.ts — §3.11
export function reportRange(today: string, days: number): string[];
export function buildHeroReport(input): HeroReport;
export function reportLines(report: HeroReport): { activity: string; kingdom: string; cap: string };
```

**Changed, pure:**

```ts
// src/lib/utils/kingdom.ts
export function buildingProgress(tally: SiteTally, building: Building): { done: number; total: number; complete: boolean };

// src/lib/utils/realm-access.ts
export function splitEarnings(rows: LedgerRow[]): Earnings;

// src/lib/realm/villagers.ts
export function greetingFor(villager: Villager, complete: boolean): string;

// src/lib/realm/ceremony/ceremony.ts
export function kingdomMarks(hero: Vec2, layout: WorldLayout): CeremonyMarks;
export function startKingdomCeremony(layout: WorldLayout, hero: Vec2, reducedMotion: boolean): CeremonyState;
export function kingdomNotice(step: CeremonyStep, heroName: string): string | null;

// src/lib/services/deeds.ts
export function buildKingdomOverview(progress: ProgressRow[], tone: ToneMode, runs?: DeedTally[]): BuildingOverview[];
export function sortDeedsForSite(deeds: DeedOverview[]): DeedOverview[];
export async function loadDeedTallies(childId: string): Promise<DeedTally[]>;
```

**Changed, server actions (`"use server"`, async exports only):**

```ts
// src/lib/actions/realm.ts
export async function markKingdomAnnounced(childId: string, buildingIds: string[]): Promise<void>;

// src/lib/actions/realm-play.ts
export async function getRealmEarnings(childId: string, date: string): Promise<Earnings>;
```

`markKingdomAnnounced` requires write access, validates every id against `BUILDINGS`, and updates only rows where `completed_at IS NOT NULL AND announced_at IS NULL` — idempotent, and it can never mark an unraised site.

**The three.js boundary.** This slice adds no three import anywhere. Its only scene-file edit is one condition in `ceremony-layer.tsx` (already a `*-layer.tsx`). Every rule, tally, route, placement and string above lives in a pure module with a colocated test. Scene props stay referentially stable (`risingId` stays a `string | null`, the start snapshot is a lazy `useState` initialiser, `layout` keeps its existing memo). Scene-to-React events keep going through `queueMicrotask`; no effect writes state synchronously; no ref is written during render; no `useMemo` result is mutated.

**The rasterisation budget.** `sprite-texture.ts` bills kinds, not instances. This slice adds:

- **0** new sign kinds. Slice 10's signboard is already keyed per building and per progress state; a complete building has exactly one such state, and the raised line composes into it. It is per-hero text, but the cache is per-hero anyway.
- **+2** figure kinds, both authored in slice 11 and registered there: `building:well-plaque` and `building:library-full`. They are counted here rather than assumed free, and slice 11's §3.8 bill already includes them.
- **0** ceremony kinds: the kingdom ceremony reuses the existing sprite set and shows no crown; the sparkle burst is a `points` material with no texture.

Net **0 to +2 kinds** against a running total of roughly 34 rasterisations at slice 2's parallelised, kind-keyed, warm cache. **No new `await` is added to `SpriteSource`, so the measured effect on first paint is zero.**

**The village invariants.** This slice adds **no prop, no collider, no door, no spawn and no route across open ground**. The plaque and shelf are painted into existing building figures, so no footprint changes and no solid's footprint-plus-`HERO_RADIUS` moves. It adds one cross-map route — the villagers' walk to the kingdom ceremony — and that route uses `roadPath()` from `village.ts`, per the standing rule. The hero is never moved by it, so no hero can be wedged by anything this slice ships, and `unstickHero` is not disabled while it runs. It spawns nothing on open ground, so `open-ground.ts`'s `SPAWN_ZONES` are not touched; it *depends* on them, because an 8-of-8 kingdom with foundation-only spawning would have zero troubles and an ability bar with nothing to point at.

**The economy has one door.** Nothing in this slice gates a side quest, blocks a door, or stands between a child and their schoolwork. `startDeedRun` gains no precondition; `SiteCard`'s button is still disabled only by `busy` and `preview`. Gleams are not minutes and laps are not minutes — `tallySession` reports them on their own lines and never adds them to `minutesPlayed`. Bonus minutes are ledger rows bounded by `dailyCapMinutes` through the check that already exists. Three tests in §7 hold each of these.

---

## 4. Data model

### The migration

Numbered from position (13th slice, last existing is 0025). `drizzle-kit generate` assigns the real index at generate time — **read the filename it prints and use that**, rather than assuming, because earlier slices in the programme may ship fewer migrations than slices.

**Columns.**

| Table | Column | Type | Null | Default | Meaning |
|---|---|---|---|---|---|
| `kingdom_progress` | `raised_by_name` | `text` | yes | none | The hero's display name at the moment this building was completed. NULL on every pre-existing row and on any row whose name lookup failed. |
| `kingdom_progress` | `raised_season_id` | `text` | yes | none | The hero's open `season.id` at completion. Feeds the parent panel and any future transcript; **never** the child-facing season phrase. |

**Nothing stores the season *phrase*, only the date it is derived from.** `completed_at` is the input and `seasonPhrase(completed_at, hemisphereForTimezone(family.timezone))` is computed at render. That is deliberate: a family that moves, or a hemisphere lookup we get wrong, re-renders correctly on the next paint rather than leaving a wrong word carved into a stone. Snapshotting the *name* is right (a rename must not rewrite history); snapshotting the *phrase* would be wrong (a derivation should stay derivable).
| `kingdom_progress` | `announced_at` | `integer` (timestamp, **seconds**) | yes | none | When the world showed this building rise. NULL means the rise is still owed to the child. |
| `realm_settings` | `regraded_at` | `integer` (timestamp, **seconds**) | yes | none | Set only for heroes whose kingdom this migration re-graded. Drives the once-ever "needs fewer side quests now" sentence, and stands afterwards as a durable record of what was done to this hero's data. |

`regraded_at` deliberately stays **out of** the `RealmSettings` type and out of `validateRealmSettingsPatch` — it is a record, not a parent setting, and no form may write it. It is read by `loadRealmFlags`, which already selects two timestamps off that row:

```ts
// The full accumulated shape at the end of the programme. This slice adds regradedAt and removes nothing.
export async function loadRealmFlags(childId: string): Promise<{
  helpSeenAt: Date | null; starterSpellAt: Date | null;
  tutorialStep: number | null; tutorialDoneAt: Date | null; soundMuted: boolean;   // slice 9
  keepNoteSeenAt: Date | null;                                                     // slice 10
  regradedAt: Date | null;                                                         // this slice
}>;
```

### The migration body

`db:generate` writes the four `ALTER TABLE … ADD` statements. The backfill is then **hand-appended to the generated file** (with `--> statement-breakpoint` between statements), before it is applied anywhere — editing a migration after it has run breaks drizzle's content hash.

Statement order is load-bearing.

**A. Everything already complete is already announced.** Runs *before* B, while the retro rows still have `completed_at IS NULL`:

```sql
UPDATE kingdom_progress SET announced_at = completed_at
 WHERE completed_at IS NOT NULL AND announced_at IS NULL;
```

**B. Complete the sites the new counts finish, and date them honestly.** One statement per building. `deed_id` values are enumerated rather than parsed out of the id — the `<buildingId>-<story>` convention holds for all twenty today, but a migration should not depend on a naming convention surviving. The date is the newest completed run at that site, so the stone is dated when the work was actually finished, not when the migration ran:

```sql
UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('bridge-planks','bridge-toll')),
         CAST(strftime('%s','now') AS INTEGER))
 WHERE building_id = 'bridge'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('bridge-planks','bridge-toll')) >= 2;
```

Repeated for: `well` ≥3 `('well-stones','well-signs','well-water')`; `mill` ≥3 `('mill-sacks','mill-ledger','mill-wheel')`; `chapel` ≥3 `('chapel-bell','chapel-scroll','chapel-stars')`; `market` ≥2 `('market-prices','market-crier')`; `library` ≥3 `('library-shelves','library-catalog','library-scribe')`; `watchtower` ≥2 `('watchtower-height','watchtower-signals')`; `garden` ≥2 `('garden-beds','garden-bees')`.

Note the threshold is **distinct completed stories**, matching D13.2 — so the migration completes exactly the sites the running code will consider complete, and no others. `CAST(strftime('%s','now') AS INTEGER)` rather than `unixepoch()` for older-SQLite tolerance, and **seconds, not milliseconds**, because drizzle's `mode: "timestamp"` reads `new Date(value * 1e3)`. Getting this wrong dates every stone in the app to 1970.

**C. Record which heroes were re-graded.** Runs after A and B; the only rows now complete-but-unannounced are the ones B just created:

```sql
UPDATE realm_settings
   SET regraded_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE child_id IN (SELECT child_id FROM kingdom_progress
                     WHERE completed_at IS NOT NULL AND announced_at IS NULL);
```

**No name backfill** (D13.9): `raised_by_name` and `raised_season_id` stay NULL on every pre-existing row and fall back at render time.

The whole body is idempotent — A is guarded by `announced_at IS NULL`, B by `completed_at IS NULL`, C is a set-to-constant on a shrinking selector — so a re-run changes nothing.

### What existing rows do

- **A row completed before this slice** (`completed_at` set): `announced_at` is set to its own `completed_at`, so the child is not told about a rise they watched months ago. `raised_by_name` is NULL, so its sign reads `Raised by {live hero name} · {seasonPhrase(completed_at)}` — a true sentence built from data we actually have. `raised_season_id` is NULL, which affects only the parent panel's grade-year grouping, and that panel falls back to the calendar phrase.
- **A row at 4 of 5 on a two-story building**: completed by B, dated to its last real run, left unannounced. The child's next visit plays the rise and the "needs fewer side quests now" sentence. Their sign shows the live name and the season of the run that actually finished it.
- **A row at 4 runs all on one story**: *not* completed by B (distinct = 1 < 2), left as-is. It reads `1 of 2` instead of `4 of 5`, needs the same one more run it needed before, and gets the same explanatory sentence on the next visit because their hero is flagged by C only if some *other* site of theirs was re-graded. If none was, they see no sentence and no rise — correct, because nothing rose.
- **A row at 0**: untouched everywhere.
- **A hero with no `realm_settings` row**: C no-ops; `loadRealmSettings` creates the row later with `regraded_at` NULL, so they get their rises without the extra sentence. Reaching this state requires having completed a run without ever loading realm settings, which `loadHeroBand` makes impossible (`services/deeds.ts:27`) — it is documented, not expected.
- **A hero created after the migration**: `regraded_at` NULL forever; the sentence never appears; rises fire normally the first time a building is finished outside the world.

### Verification, checked rather than trusted

The Drizzle hook runs `db:migrate` silently, so the build step is:

1. `npm run db:generate` — read the printed filename; confirm four `ADD` statements and nothing else.
2. Hand-append A, B and C with `--> statement-breakpoint` separators. Re-read the file.
3. `npm run db:migrate`.
4. `SELECT COUNT(*) FROM pragma_table_info('kingdom_progress') WHERE name IN ('raised_by_name','raised_season_id','announced_at');` → 3.
5. `SELECT COUNT(*) FROM pragma_table_info('realm_settings') WHERE name='regraded_at';` → 1.
6. `SELECT child_id, building_id, deeds_done, completed_at, announced_at FROM kingdom_progress WHERE announced_at IS NULL AND completed_at IS NOT NULL;` → exactly the retro-completions, each with a `completed_at` in the past, none dated to the migration minute unless that site genuinely has no completed run.
7. `SELECT COUNT(*) FROM realm_settings WHERE regraded_at IS NOT NULL;` → equals the distinct `child_id` count from step 6.
8. Open the Realm as one re-graded hero on the documented port-3100 setup and confirm the beats play once and never again.

### Runtime writes

`completeDeedRun` (`actions/deeds.ts:248-252`), on the run that sets `completed_at`, also writes `raised_by_name` and `raised_season_id` in the same `UPDATE`. Two small selects are added on that branch only — the hero's `display_name`, and the open season (`season` where `child_id = ? AND completed_at IS NULL`, covered by `season_open_unique_idx`). That branch runs at most eight times in a hero's life. Either lookup failing leaves its column NULL and the rise still happens (§5).

`completeDeedRun` also gains `revalidatePath("/tavern")` alongside its existing three, because the parent panel and the siblings' board now show kingdom data.

---

## 5. Errors and edge cases

| Situation | Behaviour |
|---|---|
| `markKingdomAnnounced` fails | Silent. No error banner, no retry button. The beats play again next visit — a duplicate celebration is a far smaller harm than an error message on a child's proudest screen. |
| `getRealmEarnings` fails | The opening beat is skipped and the under-two banner drops its second sentence. No banner: the clock's own error path (`use-play-clock.ts:69`) already owns time failures, and two errors about time would be worse than one. |
| Hero-name lookup fails while raising | `raised_by_name` stays NULL; the sign falls back to the live name. Indistinguishable to the child. |
| Open-season lookup fails while raising | `raised_season_id` stays NULL. The child-facing phrase is unaffected by design (D13.8); the parent panel groups that stone by calendar season instead. |
| Hero renamed after a stone was laid | The stone keeps the old name. Nameplate, HUD, board and parent panel show the new one. Test: `raisedLine({snapshotName:"Emma", liveName:"Em"})` → `Raised by Emma · …`. |
| Hero row deleted | `kingdom_progress` cascades (schema.ts:893-895). Nothing to render anywhere; the Tavern board simply has fewer rows. The snapshot columns cannot preserve a row that no longer exists, and this slice does not pretend they can. |
| Parent preview | No rise beats, no ceremony, no summary, no `announced_at` write, no `regraded_at` read. The sign shows the snapshot or `bundle.heroName` — never the actor's name. |
| Two heroes in one family share a name | Both stones read the same name; the season disambiguates them on the board. Accepted. |
| A story is retired from `DEEDS` later | Its runs stop counting toward `distinctDone` (progress is computed over the building's *current* deeds) but still count in `runsDone`. A building that had been raised stays raised via `raised` (D13.4). |
| A story is added to `DEEDS` later | The guard test in §3.1 fails, forcing a deliberate decision. If the count is raised, already-raised buildings stay raised and unfinished ones simply gain a row. |
| Eighth building completes while a crown ceremony is pending | The crown ceremony runs first; the kingdom ceremony is held in a ref and starts when `ceremonyStage` reaches `"done"`. Never both at once. |
| Eighth building completes on the Side Quests page | It arrives as a pending rise; the kingdom ceremony plays on the next Realm visit, after the rise beats. |
| Clock reaches zero during the kingdom ceremony | It cannot — the ceremony rides the existing `ceremonyRunning` pause (`realm-shell.tsx:238`). If minutes hit zero the instant before it starts, the close wins, `announced_at` is unwritten, and the ceremony plays on the next visit. |
| `flushPending()` rejects on the Leave path | The summary renders anyway once the 1500 ms cap elapses; the unrecorded minutes stay in `pendingRef` and settle on the next visit's first record, exactly as they do today. |
| Zero-activity visit | The summary shows the wander lines in §3.9. It never shows an empty card and never says "0 side quests". |
| A villager fails to rasterise during the kingdom ceremony | Slice 1 already filters `layout.villagers` by `textures.villagers[v.id]`; `startKingdomCeremony` takes its ids from the same filtered list, so a missing sprite means a missing walker, not a hovering mark. |
| A villager cannot reach its mark | `KINGDOM_WALK_TIMEOUT_MS` (6000) snaps it, exactly as `WALK_TIMEOUT_MS` does for the crown ceremony — bounded at a third of the length, because 20 seconds of a metered session is not acceptable for a beat the child did not ask for. |
| Migration re-applied | Every statement is guarded; a re-run is a no-op. |
| `deeds_done` disagrees with the run table | The run table wins for progress; `deeds_done` is display only (D13.3). |

---

## 6. Accessibility

### The complexity axis

Every surface below reads `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1) and invents no rule of its own. This slice consumes exactly two of its fields — `numerals` and `trackedObjectives` — and requests no new axis field.

| Surface | Simple depth | Full depth |
|---|---|---|
| SiteCard finished rows | check icon + `Done` | check icon + `Done · 3 times` when practised more than once |
| SiteCard practice line | `3 side quests here.` | `3 side quests · 24 questions answered.` |
| Summary kingdom line | pip row `●●●●○○○○` with `aria-label="4 of 8 raised"`, alongside the same sentence | `Your kingdom: 4 of 8 raised.` |
| Summary forward hook | one objective (`trackedObjectives`) | one objective |
| Summary recess line | `9 gleams.` | `9 gleams · best lap 41.2 s.` |
| Rise beats, ceremony, attribution, greetings, opening beat | identical at both depths | identical at both depths |

Every simple-depth surface is a **substitution**, never a removal: pips stand in for a numeral, a shorter true sentence stands in for a longer true sentence. Nothing a child can do at full depth is unavailable at simple depth. **Depth is never a word a child reads** — the string "depth" appears in no copy in this spec.

`fewerChoices` caps at **both** depths, per the standing invariant: the SiteCard deed list shows `sortDeedsForSite()[0]` plus a disclosure button `Show the other 2` / `Show fewer` (`aria-expanded`); the summary's advanced-building list shows two entries and then `and 1 more.`; the kingdom count and the single forward hook are never capped, because they are the thing being tracked, not a menu.

### Per learning-profile setting

- **reducedMotion.** The kingdom ceremony starts already gathered (the existing `reducedMotion` branch in `startCeremony`, reused), the crown descent does not exist for it anyway, and the sparkle burst is skipped. **Its non-motion substitute:** slice 1's gold ground ring under the hero turns to the crown colour for the whole `hail` beat, and the centred `Eight of eight. The kingdom stands, Emma.` holds for the full four seconds. The rise beats keep their text and their duration; only slice 10's rise tween is dropped, and the building simply is there. No motion cue in this slice is the only carrier of its meaning.
- **lowStimulus.** Mutes, never empties. The ceremony plays in the muted palette with sparkles off; every message, every building and every summary line still appears. The parent panel's bars use the muted accent. Nothing in this slice is gated on `!calmPalette` — the mistake `realm-shell.tsx:215` makes today with `decor`.
- **largerText.** `RealmClosed` carries `readingAttributes(bundle.profile)` itself, because it renders outside `.realm-root`'s portal and would otherwise be the one screen in the Realm that ignores the setting (§3.9). The SiteCard is already inside `.realm-panel`, which `globals.css:243-246` scopes. The parent panel inherits the app shell's scoping.
- **fewerChoices.** As above.
- **readAloud.** One utterance per beat, each behind a last-spoken ref so re-renders do not stutter it: the rise beats (one utterance spanning both, so `speak()`'s cancel cannot clip the roll-call), the ceremony `hail`, the opening earned beat, the summary on mount. Every one is written for the ear, not the eye — numbers as words via `spokenNumber`, no `·` separators, no parentheses. The corresponding text is set into the `aria-live="polite"` notice lane **regardless of `readAloud`**, so a screen-reader user gets it whether or not speech is on.
- **inputMode.** Touch: the summary's links and the SiteCard disclosure are ≥56 px targets (the world's raised minimum, not the 44 px adult one); nothing depends on hover. Keyboard: the summary focuses its heading on mount and its links are in DOM order; the disclosure is a real `<button>`; the ceremony is skippable with Escape through the existing `ceremonySkipRef` path. Touch copy differs nowhere in this slice — no string in it names a key or a gesture.
- **soundEnabled.** Slice 9 owns the audio channel and ships before this slice, so these are **bound**, not reserved. This slice emits **`buildingRises`** for a rise beat (slice 9's existing cue — there is no separate `rise`, which would have been a duplicate of the same moment), **`kingdomHail`** for the 8-of-8 hail and **`summary`** when the session summary appears. All three have rows in slice 9's `CUES` table, and every one is silent when `soundEnabled` is false with the visual beat unchanged.

### Parent preview (`isChildView: false`)

Suppressed and recording nothing: rise beats, the kingdom ceremony, the session summary, the opening earned beat, the under-two banner, `markKingdomAnnounced`. Rendered: the SiteCard's per-deed counts and its attribution line (they are the hero's record and a parent wants to read them), and the villagers' built greetings. Attribution shows the snapshot or `bundle.heroName`, never the previewing adult's name. Nothing in this slice reads `mana`, `cleared`, `ride` or `minutes` without a null check, so no surface can crash on the nulled preview state.

---

## 7. Testing

### Unit (Vitest, colocated, nothing imports three)

- **`kingdom.test.ts`** — the eight counts are 3/3/2/3/2/3/2/2; the guard `b.deedsToBuild === deedsForBuilding(b.id).length`; `buildingProgress` for `distinctDone` under, at and over `total`; `raised: true` forcing `complete` and `done === total` even when `distinctDone` is lower; `runsDone` never affecting the result.
- **`deeds.test.ts` (services)** — `buildKingdomOverview` folds `DeedTally` rows into `timesCompleted`/`inProgress`; `done` counts distinct completed stories, not runs; a row with `completedAt` set stays complete at any count; an unknown `deedId` in the tallies is ignored by the deed list and does not crash; `sortDeedsForSite` puts resumable first, then never-played in `DEEDS` order, then least-practised.
- **`attribution.test.ts`** — all six `raisedLine` cases in §3.6's table; `seasonPhrase` at every month boundary in both hemispheres, and December reading `Winter {that year}`; **`hemisphereForTimezone`** over a fixture of real IANA zones (`Australia/Sydney`, `Pacific/Auckland`, `America/Sao_Paulo`, `Africa/Johannesburg` → south; `America/New_York`, `Europe/London`, `Asia/Tokyo` → north; `null`, `""`, `"Nonsense/Place"` → `DEFAULT_HEMISPHERE`); rename (snapshot wins), missing snapshot (live wins), both missing with a date, both missing without one; `listBuildings` for 1, 2 and 4 labels.
- **`rises.test.ts`** — `pendingRises` returns complete-and-unannounced in `BUILDINGS` order and never an incomplete site; `riseBeats` for 1, 2 and 8 buildings, with and without `regraded`; the spoken string is one sentence and contains every label.
- **`session.test.ts`** — `tallySession` diffs the snapshots correctly for advanced, risen and untouched buildings; `summaryLines` for zero activity, one side quest (singular), several, a rise with and without attribution, a completed kingdom, minutes remaining vs not, each `accessMode`, both depths, `fewerChoices` capping the advanced list; **gleams and laps never appear in `minutesPlayed`**.
- **`realm-access.test.ts`** — `splitEarnings` counts and sums each kind; **a hero with 40 bonus minutes and a 30-minute cap gets 30** (the cap is enforced by the code that already exists).
- **`parent-report.test.ts`** — `reportRange` returns 14 contiguous ISO dates ending today; `buildHeroReport` zero-fills empty days, totals correctly, picks the newest raised building, and renders `No buildings raised yet.` for an empty kingdom; `reportLines` singular/plural.
- **`words.test.ts`** — `countWord`, `plural`, `listOf`, `spokenNumber` boundaries.
- **`ceremony.test.ts`** — `kingdomMarks` places every villager within `GATHER_RADIUS` of the hero and never inside a collider; `startKingdomCeremony` under `reducedMotion` starts at `gather` with everyone on their marks; `stepCeremony` for `kind: "kingdom"` goes `gather → hail` with no `descend`; `KINGDOM_WALK_TIMEOUT_MS` snaps a blocked villager; `kingdomNotice` copy.
- **`villagers.test.ts`** — every villager has a non-empty `builtGreeting` distinct from its `greeting`; `greetingFor` switches on `complete`.
- **Economy guard test** — `startDeedRun` succeeds for a hero with zero minutes, zero troubles cleared and an unfinished kingdom. Nothing in the Realm gates a side quest.

### Browser pass (port 3100, `?preview`, same-framing before/after)

Unit tests cannot judge any of the following, and each is a real acceptance criterion:

1. A re-graded hero opens the Realm: four buildings rise, the two beats and the explanatory sentence read cleanly in the centred lane, the child can still walk throughout, and the sequence does not repeat on a second visit.
2. The eighth building completes: the villagers come to the hero without any of them walking through a wall, the citadel is visible behind the hail, the whole thing is under 12.5 s, and Escape skips it.
3. The finished signboard's third line is legible at the orthographic camera's distance, at `largerText`, and in the calm palette.
4. The session summary at 400 px width, at `largerText`, with eight lines and two links — nothing truncated, nothing horizontally scrolling.
5. The Tavern door's `Go in` mid-visit: the summary appears **in the panel**, the minute count in it matches the ledger, `Back to the Tavern →` navigates, and a following `getRealmPlaySummary` shows the flushed minute. Separately: `Open the full Quest Log →` navigates with **no** summary.
6. The parent panel on a family of three heroes: bars scale per hero, the hidden table reads correctly to a screen reader, and the page does not gain a visible round trip.
7. `reducedMotion` + `lowStimulus` together: the ceremony still communicates, the ring substitute is visible, and no beat is missing.

---

## 8. Interfaces

### Produces

**Pure modules and exported signatures** — `src/lib/realm/words.ts`: `countWord(n: number): string`, `plural(n: number, one: string, many: string): string`, `listOf(items: string[]): string`, `spokenNumber(n: number): string`. `src/lib/realm/attribution.ts`: `hemisphereForTimezone(tz): Hemisphere`, `DEFAULT_HEMISPHERE`, `seasonPhrase(date: Date | string, hemisphere?: Hemisphere): string`, `raisedName(input: RaisedInput): string | null`, `raisedLine(input: RaisedInput, hemisphere?: Hemisphere): RaisedLine`, `listBuildings(labels: string[]): string`, and the types `Hemisphere`, `RaisedInput`, `RaisedLine`. `src/lib/realm/rises.ts`: `pendingRises(buildings: RiseRow[]): RiseRow[]`, `riseBeats(rises: RiseRow[], regraded: boolean): RiseBeat[]`, types `RiseRow`, `RiseBeat`. `src/lib/realm/session.ts`: `snapshotKingdom`, `tallySession`, `summaryLines`, `KINGDOM_COMPLETE_OBJECTIVE`, `KINGDOM_COMPLETE_OBJECTIVE_NO_BONUS`, types `KingdomSnapshot`, `SessionCounters`, `SessionTally`, `SummaryCopy`. `src/lib/realm/parent-report.ts`: `reportRange`, `buildHeroReport`, `reportLines`, types `DayCell`, `HeroReport`.

**Changed signatures** — `buildingProgress(tally: SiteTally, building: Building)` (`src/lib/utils/kingdom.ts`, with the new `SiteTally` type); `buildKingdomOverview(progress: ProgressRow[], tone: ToneMode, runs?: DeedTally[])` and new `sortDeedsForSite`, `loadDeedTallies`, types `ProgressRow`, `DeedTally`, `DeedOverview` (`src/lib/services/deeds.ts`); `splitEarnings(rows: LedgerRow[]): Earnings` and type `Earnings` (`src/lib/utils/realm-access.ts`); `greetingFor(villager, complete)` and `Villager.builtGreeting: string` (`src/lib/realm/villagers.ts`); `kingdomMarks`, `startKingdomCeremony`, `kingdomNotice`, `KINGDOM_WALK_TIMEOUT_MS`, `KINGDOM_GATHER_MS`, `CeremonyKind`, and `CeremonyState.kind` (`src/lib/realm/ceremony/ceremony.ts`); `loadRealmFlags` returning `regradedAt` (`src/lib/services/realm-play.ts`); `usePlayClock` returning `minutesPlayed: number`.

**Server actions** — `markKingdomAnnounced(childId: string, buildingIds: string[]): Promise<void>` in `src/lib/actions/realm.ts`; `getRealmEarnings(childId: string, date: string): Promise<Earnings>` in `src/lib/actions/realm-play.ts`.

**Types crossing the wire** — `BuildingOverview` gains `completedAt: string | null` (ISO), `raisedByName: string | null`, `raisedSeasonId: string | null`, `announced: boolean`, `runsDone: number`, and `deeds: DeedOverview[]`. `RunSummary.building` gains `practice: boolean`. `RealmBundle` gains `regraded: boolean` and `settings.accessMode: RealmAccessMode`.

**Columns** — `kingdom_progress.raised_by_name` (text, null), `kingdom_progress.raised_season_id` (text, null), `kingdom_progress.announced_at` (integer timestamp/seconds, null), `realm_settings.regraded_at` (integer timestamp/seconds, null). Migration number assigned by drizzle-kit at build time (see §4).

**CSS classes** — `.realm-panel-raised`, `.realm-panel-practice`, `.realm-summary`, `.realm-summary-lines`, `.realm-summary-pips`, `.realm-summary-forward`, `.realm-report`, `.realm-report-row`, `.realm-report-day`, `.realm-report-bar`, `.realm-report-bar--quest`, `.realm-report-bar--bonus`, `.realm-report-dot`.

**Routes** — none new. `/tavern` (parent view) gains the Realm panel; `/realm?child={id}` is linked from it and already supported.

**Sound cues bound here, all from slice 9's `CUES`** — `buildingRises` (reused, not duplicated), `kingdomHail`, `summary`.

**Copy other slices may reuse** — `KINGDOM_COMPLETE_OBJECTIVE` for slice 1's objective card when `pickObjective` returns `null`; `greetingFor` for every surface that shows a villager line; `raisedLine`/`raisedName` for the signboard, the Tavern board and any later record.

### Consumes

- **Slice 1** — `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts`, fields `numerals` and `trackedObjectives`; `pickObjective(buildings)` from `src/lib/realm/objective.ts` for the forward hook and the wander line; the centred message lane (`realm-messages.tsx`) with its priority order, for the rise beats, the ceremony narration and the opening earned beat; the gold ground ring, recoloured as the reduced-motion substitute in the hail; `clock.flushPending()` on unmount, which this slice must not bypass and does not.
- **Slice 6** — the Tavern board's row builder, whose name expression becomes `raisedName(...)`, and its two extra selected columns.
- **Slice 8** — the bonus-minute ledger kind (`"bonus"` on `LedgerKind`, or whatever kind slice 8 published; only `splitEarnings` reads it, so one function changes if it differs), the per-day sub-cap it states, `troublesCleared` as a session counter, and `SPAWN_ZONES`/`open-ground.ts` so an 8-of-8 kingdom is not inert. If the reward did not ship, `KINGDOM_COMPLETE_OBJECTIVE_NO_BONUS` is used instead.
- **Slice 10** — the signboard's reserved third line and its per-building/per-state sprite key; `keepStageFor(buildingsComplete)` and the citadel stage; the rise animation the beats replay.
- **Slice 11** — the two built-state figures `building:well-plaque` and `building:library-full`, registered in `FIGURE_CATALOG` and selected by `figureKeyFor(prop)`. **Also from slice 10: `SignModel.line3`**, which is the one home for the attribution line. Slice 11 reserves no wall panel and `BuildingFigure` takes no attribution parameter.
- **Slice 12** — persisted gleam and lap records for the summary's recess line.
- **Slice 4** — `roadPath()` from `village.ts` for the ceremony walkers; `unstickHero`, which this slice does not disable.

---

## 9. Out of scope

- **The signboard itself** — its sprite, its position, its pip row, its legibility at camera distance. Slice 10 `plots-signs-and-the-keep`. This slice writes only its third line.
- **The keep's stages and the citadel figure.** Slice 10. This slice only makes 8-of-8 reachable and confirms the citadel is on screen during the hail.
- **The building figures.** Slice 11 `building-redraw`. The Well plaque and Library shelf are two built-state catalog rows slice 11 authored and registered; this slice selects them and draws nothing.
- **Trouble spawn zones, trouble legibility, and the bonus-minute grant.** Slice 8 `troubles-that-read-and-pay`. This slice consumes them and reports them.
- **The Tavern board's construction, its date phrasing and its sibling filtering.** Slice 6 `doors-and-the-tavern`. This slice changes one expression in it.
- **Recess persistence.** Slice 12 `recess-that-counts`. This slice reads its records.
- **Sound.** Slice 9 `sound-and-first-five-minutes`. Three cue names are published; no audio is emitted here.
- **The complexity-axis contract itself.** Slice 1. This slice consumes `surfacesFor` and requests no new field.
- **A hemisphere *setting*.** The hemisphere is **derived** from `family.timezone` by `hemisphereForTimezone` (§3.6), which covers every family whose timezone is set — which is every family, since the timezone drives the off-hours window already. What is out of scope is an explicit *override*: a family in an unusual zone, or one that wants "Fall" rather than "Autumn", has no control. That is a family-settings change outside this programme, and because nothing stores the phrase, adding it later corrects every stone retroactively.
- **A Chronicle or transcript view of raised buildings.** `raised_season_id` is laid so it can be built later; nothing renders it in this slice except the parent panel's grouping.
- **Retiring or archiving a hero.** There is no such column, this slice does not add one, and §5 states what happens under both real-world meanings of "retired".
- **XP, levels, badges, and the cosmetic `/castle` ladder.** Untouched. Decision 4 keeps the ladder as a skin; this slice changes no copy and no gate on that page.
- **Backfilling names onto pre-existing stones.** Deliberately not done (D13.9) — it would be a fabricated record in an app whose job is recording real work accurately.
