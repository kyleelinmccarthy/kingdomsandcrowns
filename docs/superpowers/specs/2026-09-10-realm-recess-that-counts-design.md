# Recess that counts

**Date:** 2026-09-10
**Status:** Design spec. Complete and buildable. The implementation plan is written at build time, per programme decision 1.
**Programme:** [The Realm: Presentation Overhaul](2026-09-10-realm-presentation-overhaul-brief.md) — slice **12 of 13**, effort **medium**.
**Depends on:** slice 4 `village-ground` (the road graph, `roadPath()`, `open-ground.ts`'s `SPAWN_ZONES`, the 64-unit world), slice 7 `fast-travel-and-the-companion` (the mounted-vs-foot fairness ruling, the fast-travel event this slice must void a lap on), slice 6 `doors-and-the-tavern` (the Tavern as a building with a threshold, the shared Tavern board, `WorldLayout.doors` / `nearestInteractable`).
**Also consumes:** slice 1 `first-impression` (`surfacesFor()` from `depth.ts`, the centred message layer, `clock.flushPending()` on unmount), slice 5 `village-life` (the road's lamp posts), slice 2 `sprite-budget-and-gallery` (the warm, parallelised raster cache).
**Feeds:** slice 13 `record-of-the-work` (the session summary reports the run; the parent report reads the record).

**Decisions applied:** **D6** recess is kept and fixed — persisted, re-routed onto the real road, folded into the redesign. **D5** the mount gets a second job: mounted laps, with separate records as the fairness answer. **D3** combat stakes — the ruling that gleams are not minutes is what keeps the economy to one door. **D7** the complexity axis — pips and a jar at simple depth, seconds and splits at full depth.

---

## 1. Why — the complaints and audit findings this answers

The user's verdict does not name recess. It names the thing recess is an instance of:

> "no quest log or tracking … this doesnt feel like a well thought out game at all."

Recess is where that sentence is most literally true, because recess is the one part of the Realm that already *keeps score* and then throws the score away. The audit found it twice.

**Finding — "no quest log or tracking", _major, medium effort_** (brief §7, Cluster: HUD and screen layout):

> The three numbers that look like tracking are per-visit `useState` and are never persisted or read back: `cleared` (realm-shell.tsx:170, only ever set from `case "cleared"` at 357) and `recess` gleams/laps/bestLap (realm-shell.tsx:173, set at 366-370). Nothing in `src/lib/actions` or `src/lib/services` ever receives them — a grep for a persisted 'cleared' or 'gleam' returns nothing outside the realm sim. The moment the child follows 'Leave the Realm' (realm-hud.tsx:96) the whole `RealmOpen` tree unmounts and all three reset to zero, along with `seed` (realm-shell.tsx:174) and mana. So the HUD's most score-like chips — 'Cleared: 7', 'Gleams: 12', 'Best 40.3 s' — are a scoreboard that resets whenever you tab away, sitting in the corner next to the one number that IS durable (minutes). A child who beats their best lap loses it by walking to the Spellbook.
>
> *Fix:* … Better: record best lap and lifetime gleams/cleared through a server action the way play minutes already are (use-play-clock.ts:73-101 is the pattern) and show a personal best next to the current run, so the number means something.

**Finding — "Not complained about yet, but will be"** (same cluster):

> The 'Cleared', 'Gleams', 'Laps' and 'Best lap' numbers are pure per-visit React state (realm-shell.tsx:170,173) and are never written to the server — a child who sets a best lap loses it the second they navigate. They will notice this the first time they try to beat it.

**Finding — the HUD row, _major, small effort_** (same cluster):

> *Fix:* … Scores (Cleared/Gleams/Laps) belong with recess, not permanently in the corner — show them in a recess-only panel that appears when `recessActive`, and drop 'Cleared' from the standing HUD entirely (see the per-visit-state finding).

**Open question Q6, which the user answered "keep it and fix it"** (brief §6):

> The candidate for deletion is recess — roughly 384 lines across seven files producing three HUD chips of per-visit state that resets whenever the child navigates and is never persisted. Cutting it concentrates the work and removes a whole surface from the redesign. Keep it, cut it, or park it behind a setting?

**Judge 3, "What all of them missed"** (brief §8) — the two rulings this slice is bound by:

> THE TEN-MINUTE BUDGET IS THE DESIGN CONSTRAINT, AND ALL FOUR IGNORED IT. The Realm is a reward gated at roughly ten earned minutes a day. That single fact should dominate every decision: no travel overhead, no grinding, no 20-second respawn loops, no long onboarding.

> NOBODY DESIGNED WHAT THE MOUNT IS FOR. … Eight mounts exist with real speeds (4.2-7.0 against HERO_SPEED 3.5) in a world you can cross in about ten seconds, which makes a 2x mount mechanically meaningless … Give riding a job (fast travel between districts, reaching something on foot you can't, a recess lap advantage) or admit it is cosmetic.

And the finding this slice inherits from the world rewrite, because the lap ring is one of the two cross-map routes the brief named as an engineering objection to the full village (brief §6 Q3, "starve enemy spawns, wedge the hero on new walls"): `LAP_WAYPOINTS` (`recess.ts:25-34`) is eight hand-placed points on a ±12 ring around a 40-unit lawn, and `spawnGleams` throws twenty random darts at the whole square (`recess.ts:78-79`, `const p = { x: (rng() * 2 - 1) * LIMIT, z: (rng() * 2 - 1) * LIMIT }`). Both are wrong the moment slice 4 lands: the ring runs through where the market plaza will be, and rejection sampling over a dense town rejects most of its darts.

**Two more things the code says that the audit did not surface, and this spec has to rule on.**

1. **Most families have never seen recess at all.** `recessActive` is `isChildView && clock.source === "recess"` (`realm-shell.tsx:238`), and `computeRealmAccess` only returns `source: "recess"` when `accessMode` is `"scheduled"` or `"both"` *and* the clock is inside a `recess_block` (`realm-access.ts:72-82`). `realm_settings.accessMode` defaults to `"earned"` (`schema.ts:684-686`). A default family has never had a gleam spawn. Persisting a record that never fills is not a fix.
2. **"Recess" already means something else in this codebase.** `recess_block`, `outside_recess`, `AccessSource "recess"` and the gate copy "Recess hasn't started." all refer to the *parent-scheduled play window*. The in-world running-and-collecting mode is a different noun wearing the same name. Section 3 fixes this the way `side-quest-copy.ts` fixes "deed": the code keeps `recess`, the child reads **the Ring**.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D12.1 | Do gleams convert to Realm minutes? | **No. Never.** The economy has one door: `realm_play_ledger` credit rows are `earned` (a completed side quest, via `grantEarnedMinutesForCompletion`) and `granted` (a grown-up), plus slice 8's capped trouble bonus. Gleams and laps write to `realm_recess_record` only. Enforced by a test that `recordRecessResult` performs no ledger write. |
| D12.2 | What are gleams *for*, then? | Two long-arc, purely cosmetic sinks in the world: lifetime gleams light the road's lamp posts one at a time (25 gleams a lamp), and fill a jar on the Tavern shelf (1000 gleams full). Neither unlocks anything, gates anything, or is spendable. |
| D12.3 | When can a child run the course? | Two doors. **(a)** Automatically, whenever `clock.source === "recess"` — unchanged, and it preserves the parent's intent that a scheduled break is play. **(b)** Deliberately, at the start arch on the road outside the Tavern, at any time the Realm is open. (b) is what makes this slice visible to the default `accessMode: "earned"` family that has never seen a gleam. |
| D12.4 | Where does the lap course run? | On slice 4's road graph. `buildLapCourse(plan)` walks a fixed sequence of road node ids through `roadPath()`, so every metre of the course is road. Eight marker posts, one arch. No hardcoded coordinates survive this slice. |
| D12.5 | How long is a lap? | Budgeted, not accidental — **and slice 4 laid the road to this budget** rather than this slice re-routing the town to hit it. `expectedLapSeconds(course, HERO_SPEED)` must fall in **35–48 s**; a test fails the build outside that, in slice 4 *and* here. Slice 4's `COURSE_NODES` is **128 units** → **36.6 s** on foot, 30.5 s on a Donkey (4.2), **18.3 s** on a Wyrm (7.0). The floor has 1.6 s (5.6 road units) of headroom against the ±1-unit build-time drift slice 4 sanctions. |
| D12.6 | Foot and mounted records: one or two? | **Two, always separate** (slice 7's fairness ruling). A Wyrm at 7.0 is exactly twice a hero at 3.5; one column would let a fourteen-year-old's mount permanently erase a six-year-old's foot time on a shared family board. |
| D12.7 | What counts as a mounted lap? | Mounted for *any* part of the lap ⇒ the lap is mounted. Not "mounted at the start". This makes mid-lap mounting a non-event rather than a voided lap, and it is impossible to game the foot record with it. |
| D12.8 | Does the ghost replay the actual run? | **No — it is a pace ghost.** It travels the course at the even pace implied by the stored best (`length / bestLapMs`). No per-frame telemetry is recorded, because storing a path per lap is a data decision nothing in this programme has asked for. The child is told nothing false: the ghost is presented as "your best", not "you". |
| D12.9 | Does a dazzle during a lap ruin the time? | No. A `focusLost` event adds its 1500 ms to `pausedMs` and the lap clock subtracts it. The game does not charge a child for something it did to them. |
| D12.10 | Does fast travel void a lap? | **Yes** (slice 7). Teleporting between districts mid-lap would produce a 4-second lap. The run resets to the start with one message; nothing is lost but the running lap. |
| D12.11 | Where do the three HUD chips go? | Deleted. `src/lib/realm/recess/hud.ts` (including slice 1's `recessPillText`) and `hudRecessFor` are removed outright, along with `RealmHud`'s `recessPill` prop, which is slice 1's interim tenant. The board replaces them: shown for 3 s at the start of a run, 4 s at the end, and permanently on `/tavern`. Nothing recess-shaped stands in the corner of the world. |
| D12.12 | Does the record need a course id? | **Yes** — one column beyond the slice sketch, and the justification is the whole point of the slice. A best lap is a number about a specific piece of road. When slice 13, or a later re-tune, moves a road node, every stored time silently becomes a record on a course that no longer exists. `courseId` makes that a visible, explained reset instead of a lie. |
| D12.13 | Does this slice add a single collider? | **No.** Gleams, marker posts, the arch, the ghost and the lit lamps are all `solid: false`. The hero cannot be wedged by anything in this slice, and `unstickHero` needs no change. |
| D12.14 | What does the child call it? | **The Ring** — the course, not a place. "Recess" stays in code and in the parent's schedule; the thing a child runs has its own name, so the two meanings stop colliding. It is not called *the Green*, which an earlier draft used: slice 4's town has eight named districts and no green, and naming a place that does not exist is the failure this programme is named after. The Ring is a **route** — it starts and ends at the arch on the Market Plaza and threads six districts — and `COURSE_ID` has always been `village-ring-1`. |

---

## 3. Design

### 3.1 The shape of a run

```
        arch (start / finish, on the Market Plaza at road node `plaza`)
          │
   ┌──────┴──────────────────────────────────────────────┐
   │  post 1 → post 2 → … → post 8 → back through the arch │
   └──────────────────────────────────────────────────────┘
       every segment is roadPath(node[i], node[i+1]) — slice 4's node-id router
```

**Slice 4 laid this course, and this slice runs on it.** Slice 4 §3.8 publishes `COURSE_NODES` (thirteen road nodes), `COURSE_START` and `COURSE_LENGTH_UNITS` (128), sized to the 35–48-second budget this slice needs and guarded by a test there, because a lap is a property of the *road* and re-routing the town in slice 12 would force a `COURSE_ID` bump that wiped the bests this slice had just created. This slice builds the `LapCourse` object from them, plants the posts and the arch, and owns everything a child sees.

**The arch stands at `plaza` — road node `(0, 9)`, the Market Plaza.** Not "3 units north of the Tavern door": that point is roughly `(5.0, 21.5)`, which is off every `ROAD_QUAD` and would fail this slice's own on-road assertion before the first post. `plaza` is on the Kingsway, on the Market Cross, at the junction a child arriving from `SPAWN` first reaches, inside a district with a name, and it is where `COURSE_NODES` begins and ends.

A run has three beats and no menus.

**Start.** Either the access clock says `source === "recess"` (the run begins the moment the world opens), or the child walks to the arch and takes its prompt. The board slides in centre-screen for 3.0 s, showing what there is to beat. The lit post is post 1. Gleams appear.

**Middle.** The child collects gleams (they respawn per slot after 10 s, unchanged) and runs post to post. Only the *next* post is lit; passing it lights the following one. The ghost — a translucent copy of the hero sprite — runs the child's own best pace. If there is no best on this course, there is no ghost.

**Finish.** Crossing back through the arch closes the lap. The board slides in for 4.0 s with the time, the record, and whether it moved. Then it goes away. The lap and the gleams are written to the server before the child can reach the Tavern door.

### 3.2 New pure modules

All four live under `src/lib/realm/recess/` with colocated `.test.ts` files. None imports three.

#### `src/lib/realm/recess/course.ts`

```ts
import type { Vec2 } from "../layout";
import { COURSE_NODES, COURSE_START, COURSE_LENGTH_UNITS, roadPath, nodeById } from "../village"; // slice 4
// NOTE: the module is `src/lib/realm/village.ts` — a file, not a `village/` directory — and
// `roadPath` takes node **ids**, which is exactly what a course of named nodes wants.
// There is no `VillagePlan` and no graph parameter: village.ts's module constants ARE the graph.

export type CoursePost = { index: number; nodeId: string; position: Vec2; label: string };
export type LapCourse = {
  id: string;              // COURSE_ID; changes when the route changes
  start: Vec2;             // the arch, on the road
  posts: CoursePost[];     // in running order
  path: Vec2[];            // the full closed polyline, arch → posts → arch
  lengthUnits: number;
};

/** Bump whenever slice 4's COURSE_NODES or the road graph moves a node on the course. */
export const COURSE_ID = "village-ring-1";
export const POST_RADIUS = 2;          // unchanged from the old WAYPOINT_RADIUS
export const ARCH_RADIUS = 2.5;        // a little wider: it is also the finish line
export const COURSE_TARGET_SECONDS = 36.6;   // slice 4's 128 units at HERO_SPEED 3.5
export const COURSE_MIN_SECONDS = 35;
export const COURSE_MAX_SECONDS = 48;

/**
 * The eight nodes that carry a LIT POST, a subset of slice 4's thirteen `COURSE_NODES`.
 * The other five (`plaza-n`, `lane-w`, `plaza-e`, and the arch node `plaza` at both ends)
 * are corners the path turns at, not things to run to.
 */
export const POST_NODES = [
  "bridge-s",       // 1 — onto the River Bridge
  "bridge-n",       // 2 — off it, into the Millrace
  "mill-door",      // 3 — past the Grain Mill
  "west-north",     // 4 — the west end of the North Way
  "keep-approach",  // 5 — across the head of the Kingsway, under the keep
  "east-north",     // 6 — the east end of the North Way
  "hill",           // 7 — up onto Chapel Hill
  "market-door",    // 8 — back along the Market Cross, past Market Square
] as const;

export function buildLapCourse(): LapCourse;   // no parameter: it reads slice 4's constants
export function courseLength(path: Vec2[]): number;
export function expectedLapSeconds(course: LapCourse, speed: number): number;
/** The fastest physically possible lap, minus 20% slack. A time under this is rejected. */
export function minLapMs(course: LapCourse): number;
/** 0..1 along `course.path`, by nearest-segment projection. Used by the ghost gap and the pip. */
export function progressAlong(course: LapCourse, p: Vec2): number;
/** The post the hero must reach next, or null once every post is passed. */
export function nextPost(course: LapCourse, passed: number): CoursePost | null;
```

`buildLapCourse` resolves slice 4's `COURSE_NODES` to positions and concatenates `roadPath(a, b)` for each consecutive pair plus the closing pair back to `COURSE_START`, then tags the eight `POST_NODES` as `CoursePost`s in running order. If a node id is missing from `ROAD_NODES` it throws `Error("The course is missing a road node: " + id)` — a build-time failure caught by the test below, never a runtime surprise for a child. It **does not re-route the town**: slice 4 owns the node list and the guard test, and this slice re-runs that guard against its own output so the two can never drift.

`minLapMs` is `(lengthUnits / MAX_MOUNT_SPEED) * 1000 * 0.8`, where `MAX_MOUNT_SPEED` is `Math.max(...MOUNTS.map(m => m.speed))` = 7.0. At slice 4's **128 units** that is **14 630 ms**. Any submitted lap faster than that did not happen.

#### `src/lib/realm/recess/ghost.ts`

```ts
import type { LapCourse } from "./course";
import type { Vec2 } from "../layout";

export type GhostSample = { position: Vec2; postIndex: number; progress: number };

/** The stored best, run at even pace. Null before the best exists or after the ghost finishes. */
export function ghostAt(course: LapCourse, bestLapMs: number, elapsedMs: number): GhostSample | null;
/** reducedMotion: the same ghost, snapped to the last post it passed, so it steps instead of gliding. */
export function ghostStep(course: LapCourse, bestLapMs: number, elapsedMs: number): GhostSample | null;
/** Positive when the hero is ahead of the ghost, negative when behind. Milliseconds. */
export function ghostGapMs(course: LapCourse, bestLapMs: number, elapsedMs: number, hero: Vec2): number;
```

#### `src/lib/realm/recess/record.ts`

```ts
export type RecessRecord = {
  totalGleams: number;
  laps: number;
  bestLapMs: number | null;
  bestMountedLapMs: number | null;
  lastLapAt: Date | null;
  courseId: string;
};
export type RecessResult = { gleams: number; lapMs: number | null; mounted: boolean; courseId: string };
export type MergeOutcome = {
  record: RecessRecord;
  best: boolean;     // this lap set a new best in its own category
  first: boolean;    // this lap is the first ever in its own category
  reset: boolean;    // the course changed: lap records cleared, gleams kept
};

export const EMPTY_RECESS_RECORD: RecessRecord;
export const GLEAMS_PER_LAMP = 25;
export const JAR_CAPACITY = 1000;
export const MAX_GLEAMS_PER_CALL = 200;
export const MAX_LAP_MS = 600_000;

export function mergeRecess(record: RecessRecord, result: RecessResult, now: Date): MergeOutcome;
/** Null when the result is acceptable; otherwise the message the child sees. */
export function validateRecessResult(result: RecessResult, course: LapCourse): string | null;
export function lampsLitFor(totalGleams: number, lampCount: number): number;
export function jarFillFor(totalGleams: number): number; // 0..1
export function hasAnyRecord(record: RecessRecord): boolean;
```

`mergeRecess` is additive, never a replacement: `totalGleams += result.gleams`, `laps += result.lapMs === null ? 0 : 1`, and the relevant best takes the `Math.min`. When `record.courseId !== result.courseId`, `bestLapMs` and `bestMountedLapMs` are cleared first, `courseId` is replaced, `reset` is true, and `totalGleams` and `laps` are untouched — the gleams a child collected are theirs whatever road they ran on.

#### `src/lib/realm/recess/copy.ts`

Every child- and parent-visible string in this slice, and the functions that choose between them. `depth` is `"simple" | "full"` — never a word on screen (§6).

```ts
import type { MergeOutcome } from "./record";

export type RecessDepth = "simple" | "full";
export type RecessLine = { text: string; speech: string };

export const RING = "The Ring";   // the course's child-facing name. There is no "Green".
export function lapLine(outcome: MergeOutcome, lapMs: number, mounted: boolean, depth: RecessDepth): RecessLine;
export function gleamLine(count: number, depth: RecessDepth): RecessLine;
export function startLine(depth: RecessDepth): RecessLine;
export function boardRows(record: RecessRecord, depth: RecessDepth, fewerChoices: boolean): { label: string; value: string }[];
export function lampLine(lit: number, total: number): string;
export function recessTavernLine(name: string, record: RecessRecord): string | null;
export function formatLap(ms: number): string;      // moved here from recess.ts, unchanged: "40.3"
export function formatLapSpeech(ms: number): string; // "40.3 seconds"
```

### 3.3 Every string, verbatim

**The arch prompt** (rendered in slice 6's interactable bubble, so it inherits the reach behaviour and the 44px tap target):

| inputMode | string |
|---|---|
| keyboard / auto-on-desktop | `Press Enter to run the course` |
| touch / auto-on-touch | `Tap to run the course` |
| while a run is already going | `Finish line` |

**Start of a run** — the board, centre screen, 3.0 s, `role="status"`:

| depth | heading | body |
|---|---|---|
| simple | `The Ring` | `Collect gleams. Follow the lit posts.` |
| full, no record yet | `The Ring` | `Collect gleams. Follow the lit posts. Eight posts, then back through the arch.` |
| full, with a foot best | `The Ring` | `Collect gleams. Follow the lit posts. Your best lap is 38.4 s.` |
| full, with a ride best, riding | `The Ring` | `Collect gleams. Follow the lit posts. Your best ride is 24.1 s.` |

Read-aloud (written for speech, not the eye): `The Ring. Collect gleams and follow the lit posts. Your best lap is 38.4 seconds.` — and with no record: `The Ring. Collect gleams and follow the lit posts. Run all the way round and back through the arch.`

**Collecting a gleam** — the centred message lane, 1.2 s:

| depth | text | speech |
|---|---|---|
| simple | `A gleam!` | `You found a gleam.` |
| full | `A gleam! 12 so far.` | `You found a gleam. Twelve so far.` |

**Passing a post** — no message. The post lights, the next one lights, and (with sound on) one cue. A message per post would fire eight times a lap into a lane that also carries errors.

**Off-course nudge** — once per run, the first time the child touches a post that is not the lit one:

> `Follow the lit posts.` — speech: `Follow the lit posts. The next one is glowing.`

**Finishing a lap** — the board, centre screen, 4.0 s:

| case | depth | text |
|---|---|---|
| first foot lap ever | simple | `Your first lap! That's the one to beat.` |
| first foot lap ever | full | `Your first lap — 44.8 s. That's the one to beat.` |
| new best on foot | simple | `A new best!` |
| new best on foot | full | `New best lap — 38.4 s!` |
| not a best, on foot | simple | `Lap done!` |
| not a best, on foot | full | `Lap done — 41.2 s. Your best is 38.4 s.` |
| first ride ever | simple | `Your first ride! That's the one to beat.` |
| first ride ever | full | `Your first ride — 26.0 s. That's the one to beat.` |
| new best riding | simple | `A new best ride!` |
| new best riding | full | `New best ride — 24.1 s!` |
| not a best, riding | simple | `Ride done!` |
| not a best, riding | full | `Ride done — 26.0 s. Your best ride is 24.1 s.` |

Speech versions read the number as `24.1 seconds` and drop the em dash: `New best ride. 24.1 seconds.`

**The course changed** — shown once, on the first run after `courseId` moves, before the start board:

> `The road through the village changed, so the course is new. Your gleams are safe — the lap times start again.`
>
> speech: `The road through the village changed, so the course is new. Your gleams are safe. The lap times start again.`

**A lap that does not count:**

| cause | text |
|---|---|
| fast travel mid-lap (slice 7) | `You took the fast road, so this lap doesn't count. Start again at the arch.` |
| the Realm closed mid-lap | `Recess is over. Your gleams are kept.` |
| the lap was rejected as impossible | `That lap was too fast to write down. Try it again.` |

**The board** — rows, in order. `fewerChoices` keeps only the first two.

| label | value, full depth | value, simple depth | empty |
|---|---|---|---|
| `Gleams collected` | `147` | the jar, drawn | `0` / an empty jar |
| `Best lap on foot` | `38.4 s` | a gold ribbon, or nothing | `No lap yet` |
| `Laps run` | `9` | nine pips, capped at ten with a `+` | `None yet` |
| `Best lap riding` | `24.1 s` | a gold ribbon, or nothing | `No ride yet` |
| `Last run` | `Yesterday` / `3 March` | same | `—` |

The lamp line, under the rows: `{lit} of {lampCount} lamps lit along the road.` and, when every lamp is lit, `Every lamp on the road is lit.` **`lampCount` is derived, never typed**: `seedProps(input).filter(p => p.kind === "lantern").length` over slice 5's seeded town, which is the only number that can be right, because the lanterns are seeded per child and a hardcoded 24 (or 16, or 6) would be wrong for everybody. `GLEAMS_PER_LAMP` is then tuned against the real count at build time so the whole road is lightable inside a plausible number of sessions — at slice 5's density the count is in the region of a dozen, so `GLEAMS_PER_LAMP` is set to put the last lamp within reach of a season's play, not a year's. The jar caption: `Gleam jar` — and when full, `The jar is full.`

**On the Tavern page** the card is headed `The Ring` with the sub-line `Gleams and lap times from the Realm.` For the shared sibling board (slice 6, decision 8), `recessTavernLine` returns one sentence per hero who has a record, or `null` for a hero who has none:

> `Emma ran the course in 38.4 s.`
> `Emma ran the course riding in 24.1 s.` (when only a ride record exists)

**Parent preview** (`isChildView: false`) — the in-world board is suppressed entirely; the arch prompt reads:

> `Emma runs the course here.`

**Errors:**

| where | text | control |
|---|---|---|
| a failed write, in the world | `Your lap couldn't be written down.` | `Try again` (the existing `.realm-hud-error` lane and button) |
| a failed write, after a retry | `Your lap couldn't be written down. It will keep trying.` | — |
| the board failed to load on `/tavern` | `The Ring's records are resting.` | `Try again` |
| a rejected payload from the action | `That lap was too fast to write down. Try it again.` | — |

**The help card correction.** `helpGroups` (`realm-help.tsx:29-33`) currently promises `"At recess, collect gleams and run the lap ring."` — which, for a default `accessMode: "earned"` family, is a promise of something that has never once happened. The line becomes:

| touch | `Tap your mount to ride. At the arch on the Market Plaza, tap to run the Ring.` |
| keyboard | `Press M to ride. At the arch on the Market Plaza, press Enter to run the Ring.` |

**Two rules this rewrite follows, and the programme should follow everywhere.** First: **there is no control called Ride.** Slice 3 deleted `.realm-hud-ride` and the `ride` prop and put the mount in the bar's mount slot; slice 7 already corrected this string to `Tap your mount to ride.` Writing `Tap Ride` here would ship a false instruction five slices after the button it names was deleted — which is the `Clear troubles to protect the sites` failure reproduced inside the slice that cites it. Second: **a slice rewriting a `helpGroups` string quotes the current text from the most recent spec that touched it, never from `realm-help.tsx` at HEAD**, and ships the verbatim-assertion test slice 3 introduced for `bar/copy.ts`. `recess/copy.test.ts` asserts both strings character for character.

### 3.4 Changes to `recess.ts`

`RecessState` gains four fields and loses one hardcoded ring.

```ts
export type RecessState = {
  active: boolean;
  runId: string | null;      // NEW: identifies this run to the writer
  gleams: Gleam[];
  collected: number;
  laps: number;
  lapStartedAt: number | null;
  pausedMs: number;          // NEW: dazzle time subtracted from the lap
  mountedThisLap: boolean;   // NEW: D12.7
  voided: boolean;           // NEW: fast travel happened; this lap cannot close
  bestLapMs: number | null;          // this run only; the durable best lives on the record
  bestMountedLapMs: number | null;   // NEW
  nextPost: number;          // renamed from nextWaypoint
  slotRespawnAt: Record<number, number>;
  slotSpawns: Record<number, number>;
};
```

New and changed exports:

```ts
export function startRecess(): RecessState;
export function setRecessActive(state: RecessState, active: boolean, runId?: string): RecessState;
export function pauseLap(state: RecessState, ms: number): RecessState;       // NEW — dazzle
export function voidLap(state: RecessState): RecessState;                    // NEW — fast travel
export function setMountedThisLap(state: RecessState): RecessState;          // NEW
export function spawnGleams(input: SpawnGleamsInput): RecessState;           // rewritten, §3.5
// The FINAL signature, and the one every caller uses. Slice 7 needs `opts` (a mounted frame
// latches the lap; a travelling frame collects no gleams); this slice needs `course`. One
// function, one superset, declared here because this slice owns recess.ts's final shape.
export function stepRecess(
  state: RecessState, hero: Vec2, now: number, course: LapCourse,
  opts?: { mounted?: boolean; travelling?: boolean }
):
  { state: RecessState; events: RecessEvent[] };                             // course is now a parameter
export type RecessEvent =
  | { kind: "gleam"; count: number }
  | { kind: "post"; index: number }                                          // NEW — lights the next post, fires a cue
  | { kind: "offCourse" }                                                    // NEW — the nudge, once per run
  | { kind: "lap"; lapMs: number; laps: number; mounted: boolean }            // `best` removed: the server owns "best"
  | { kind: "voided"; reason: "fastTravel" };                                // NEW
```

`LAP_WAYPOINTS`, `LAP_ROUTE`, `LAP_START` and `WAYPOINT_RADIUS` were **deleted in slice 4**, which laid the course as `COURSE_NODES`; nothing here re-deletes them and no later slice imports them. `formatLap` moves to `copy.ts`. `hud.ts` and `hudRecessFor` are **deleted here**.

The lap clock becomes `now - lapStartedAt - pausedMs`. `best` leaves the event because a run-local best is exactly the lie this slice exists to fix: whether a lap is a best is a fact about the stored record, decided by `mergeRecess` and reported back.

### 3.5 Gleams spawn from `SPAWN_ZONES` — objection (d), where it lands

`spawnGleams`'s twenty random darts at `±(WORLD_SIZE/2 - 2)` (`recess.ts:78-79`) are replaced by slice 4's open-ground sampler. The whole rejection loop — collider padding, villager clearance, path clearance, spawn clearance — goes away, because that is precisely what `SPAWN_ZONES` already encodes for the village.

```ts
export type SpawnGleamsInput = {
  seed: number; now: number; state: RecessState;
  course: LapCourse;          // replaces `layout: WorldLayout`; zones come from open-ground.ts
  course: LapCourse;
  lowStimulus: boolean;
};
```

Per empty slot, with the existing per-slot seed (`seed + slot * 7919 + spawns * 104729`), it calls slice 4's

```ts
openPointInZone(zone, layout, seed, GLEAM_RULES)   // → Vec2 | null, one zone at a time
openPoints(layout, seed, GLEAM_RULES, { count: GLEAM_COUNT })   // → Vec2[], zones weighted
```

**There is no `GLEAM_ZONES` and no zone tag.** Slice 4 ships ten `SpawnZone` rectangles and `GLEAM_RULES` — the clearance set written for gleams — and `openPoints` walks the zones by weight. Gleams sample **all ten**, which is the point: a gleam on Watch Hill is a reason to go to Watch Hill, and restricting them to a subset would put the whole of recess in one corner of a town this programme spent a large slice building. The ten, by their real ids, so no later reader has to guess: `gate-green-west`, `gate-green-east` (cut back to x ≥ 15 for the Tavern), `row-yards`, `plaza-edge`, `hill-slopes`, `millrace-south`, `millrace-north-west`, `millrace-north-east`, `garden-grounds`, `watch-slopes`. `keep-approach` has no zone by slice 4's decision and the coronation ground stays clear.

A `null` return still bumps `slotSpawns[slot]`, keeping the existing defence at `recess.ts:88-90`: a slot that fails tries fresh points next frame rather than retrying the same dead ones. Then one extra filter this slice owns: a gleam is rejected if it is within `POST_RADIUS + 0.5` of a post or the arch, so a gleam never sits inside a post's trigger and gets swept up by simply running the course.

The counts are unchanged: `GLEAM_COUNT = 12`, `GLEAM_COUNT_LOW = 6`, `GLEAM_RADIUS = 0.8`, `GLEAM_RESPAWN_MS = 10_000`.

### 3.6 The four full-village engineering problems

The brief requires every spec that touches the world to answer these. This slice's answers are unusually clean, because it adds nothing solid.

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** This slice adds zero buildings and zero foundations, so it removes no spawn site. It also cannot compete for one: gleams are non-solid, occupy no collider, and are sampled from the same ten `SPAWN_ZONES` slice 8's troubles are, through the same `openPointInZone` — under `GLEAM_RULES` rather than `TROUBLE_RULES`, which is the only difference. A gleam sitting on a point does not make that point unavailable to a trouble; nothing in either sampler treats the other's occupancy as an obstacle. The one interaction that *would* matter — a trouble parked on the course dazzling a child mid-lap — is handled by D12.9 rather than by suppressing spawns, so no spawn budget is touched.

**(b) New solid props can wedge the hero, and cross-map routes cross the map.** Nothing this slice adds is solid: gleams (`solid: false`, they are sprites with a pickup radius), the eight marker posts (`solid: false`, a flat road decal plus a thin pole), the arch (`solid: false` — it *straddles the road*, and a solid arch would be a wall across the only route through the gate), the ghost (a sprite with no collider), the lit lamps (slice 5's existing non-solid `lantern` decor, in a different material). `unstickHero` is unchanged and untested-against because there is nothing new to be stuck in. The cross-map route — the lap course itself — is built entirely from `roadPath()` calls, so it is on the road by construction, and the test in §7 asserts that every sampled point of `course.path` is inside a road corridor.

**(c) Sprite rasterisation blocks first paint and more figures makes it worse.** This slice adds **three** raster kinds, all registered as `FIGURE_CATALOG` rows through slice 2's `registerFigures` and all keyed `family:id`: **`prop:post`**, **`prop:arch`**, **`prop:lantern-lit`** (plus `prop:post-lit`, a colour swap over the same geometry). Not four — the ghost reuses the already-cached hero texture with a second `spriteMaterial` at `opacity: 0.45` and a cool tint, which is both cheaper and more legible than a separate figure (it is unmistakably *you*). The jar is DOM/SVG on `/tavern` and in the board, never a three.js texture. Against slice 2's parallelised, kind-keyed, warm-across-a-short-round-trip cache, three kinds at the measured ~4 ms each is ~12 ms, and it is off the first-paint path: `arch` and `post` rasterise with the village (they are always present), `lantern-lit` only when `totalGleams >= GLEAMS_PER_LAMP`. `sprite-texture.ts` caches by kind, so eight posts and sixteen lit lamps cost one rasterisation each, not twenty-four.

**(d) Gleam spawning needs open ground.** §3.5. This is the objection landing where it is consumed.

### 3.7 Rendering

`recess-layer.tsx` keeps its pooled-sprite shape and gains three groups. It stays a `*-layer.tsx` file, so the three imports stay legal.

- **Gleams** — unchanged pooling, `GLEAM_COUNT` sprites, `visible` toggled per frame, bob gated on `motion`.
- **Posts** — eight sprites plus the existing ground-ring mesh pattern (`circleGeometry`, `#c9a84c`, calm `#8a7d5a`). The *next* post's ring is at full brightness and, with motion, pulses at 1 Hz; every other post's ring is at 0.35 opacity. With `motion: false` the lit post is simply brighter, no pulse — the substitution rule.
- **Arch** — one sprite at `course.start`, plus a ground ring at `ARCH_RADIUS`.
- **Ghost** — one sprite, `textures.hero`, `opacity: 0.45`, `color` multiplied toward `#9fc7ff`. Position from `ghostAt` each frame, or `ghostStep` when `!settings.motion`. Hidden when there is no best on this course, when the lap is voided, and always in parent preview.

All of it reads `sim.current` inside `useFrame` and writes nothing to React, so the `World` memo keeps holding. The layer's props stay referentially stable: `course` is `useMemo`'d on the village plan in the shell and passed down; `record` is passed as a plain object memoised on the fetched record.

### 3.8 Persistence: service, action, hook

**Service** — `src/lib/services/recess.ts`. Plain module; callers have already authorised the child. Mirrors `realm-play.ts`'s insert-if-missing-then-select shape.

```ts
export async function loadRecessRecord(childId: string): Promise<RecessRecord>;
export async function saveRecessRecord(childId: string, record: RecessRecord): Promise<void>;
```

`loadRecessRecord` inserts a zero row on conflict-do-nothing, then selects, so two first reads cannot make two rows. It returns `EMPTY_RECESS_RECORD` shape for a fresh child.

**Action** — `src/lib/actions/realm-recess.ts`, `"use server"`, exporting only async functions.

```ts
export async function getRecessRecord(childId: string): Promise<RecessRecord>;
export async function recordRecessResult(
  childId: string,
  result: { gleams: number; lapMs: number | null; mounted: boolean; courseId: string }
): Promise<{ record: RecessRecord; best: boolean; first: boolean; reset: boolean }>;
```

Both are behind `requireChildAccess(childId)` — `recordRecessResult` with `{ write: true }`, so a hero writes their own and a scoped parent may not write another family's. `recordRecessResult` validates through `validateRecessResult` against a course rebuilt server-side by calling `buildLapCourse()` — which reads slice 4's module constants and takes no input, so server and client cannot disagree and there is no round trip — rejects with the message from §3.3, then loads, merges via `mergeRecess`, saves, and returns the merged outcome so the client shows the *server's* answer to "was that a best" rather than its own guess. It writes to `realm_recess_record` and to nothing else — no `revalidatePath` on `/realm` (which is fully dynamic and uncached anyway), one `revalidatePath("/tavern")` so the shared board is fresh when the child walks out of the door.

**Hook** — `src/components/realm/use-recess-record.ts`, modelled on `use-play-clock.ts:73-130`, which the audit named as the pattern to follow.

```ts
export function useRecessRecord({ enabled, childId, courseId }: {
  enabled: boolean; childId: string; courseId: string;
}): {
  record: RecessRecord | null;
  error: string;
  clearError: () => void;
  addGleams: (n: number) => void;           // buffers
  completeLap: (lapMs: number, mounted: boolean) => Promise<void>; // writes through
  flushPending: () => Promise<void>;
};
```

Write policy, which is the whole answer to "a bounce-out never loses a lap":

- A **lap writes through immediately**. A lap is the thing worth keeping and there is at most one every 35 seconds.
- **Gleams buffer** in a ref and flush when the buffer reaches 10, on every lap write (they ride along in the same call), on `visibilitychange → hidden`, on `pagehide`, and on unmount.
- On unmount, `RealmOpen`'s existing cleanup runs `void clock.flushPending()` **and** `void recess.flushPending()` — the same cleanup, so no exit path flushes one and not the other. This is a direct extension of the programme's standing rule that `clock.flushPending()` runs on every unmount from slice 1 onward.
- A failed call leaves the buffer intact for the next flush, exactly as `pendingRef` does in `use-play-clock.ts:93-95`.

Honest bound on loss: a hard tab-kill between flushes loses at most nine gleams and no laps. A lost *response* to a successful write double-counts at most nine gleams — rarer, and less harmful, than the alternative of dropping them, which is the same trade `use-play-clock.ts:42-45` already documents for a minute.

### 3.9 The board

`src/components/realm/recess-board.tsx` exports one component used in three places, so the copy cannot drift:

```tsx
export function RecessBoard({ record, depth, fewerChoices, calm, hudScale, lampCount, variant, heroName }: {
  record: RecessRecord | null;
  depth: RecessDepth;
  fewerChoices: boolean;
  calm: boolean;
  hudScale: number;
  lampCount: number;
  variant: "start" | "finish" | "page";
  heroName: string;
}): JSX.Element
```

- `variant: "start"` — centre screen, 3.0 s, `role="status"`, `pointer-events: none`.
- `variant: "finish"` — centre screen, 4.0 s, same.
- `variant: "page"` — a card on `/tavern`, no timer, focusable, full rows.

Classes: `.realm-recess-board`, `.realm-recess-board--start`, `.realm-recess-board--finish`, `.realm-recess-board--page`, `.realm-recess-row`, `.realm-recess-label`, `.realm-recess-value`, `.realm-recess-pips`, `.realm-recess-jar`, `.realm-recess-jar-fill`, `.realm-recess-lamps`. Every size derives from `--realm-hud-scale` (slice 1's single knob), never from a second base — the audit's "two different scaling bases" finding applies to any new HUD surface, and this is one.

`src/app/(app)/tavern/recess-board-card.tsx` wraps it for the Tavern page inside the existing `GameFrame`, reading the record with `getRecessRecord(child.id)` in the page's existing parallel batch.

### 3.10 What the clock costs, in seconds

The programme requires every new beat priced against a five-minute grant.

| beat | cost | notes |
|---|---|---|
| start board | **3.0 s** | non-blocking; the child can move, collect and run through it. The clock is **not** paused (the programme pauses it in exactly one place, slice 9's opening banner). |
| finish board | **4.0 s** | non-blocking, same. |
| gleam message | 1.2 s, overlapping | in slice 1's centred lane; never blocks input. |
| one lap on foot | **40.0 s** target, 35–48 s enforced | 13% of a five-minute grant. This is the only number in the slice that could hurt, which is why a test guards it. |
| one lap mounted | 20.0–33.3 s | Wyrm 7.0 to Donkey 4.2. The mount's second job, and the reason to have one. |
| walking to the arch from spawn | **~1 s** | the arch is 3 units from the Tavern door, and the Tavern door is where the hero spawns. This is not traversal overhead; it is the first thing in front of them. |
| `getRecessRecord` on open | **0 s of play** | it joins the existing bundle batch in `getRealmBundle`, not a serial round trip; the world does not wait on it (the board renders `null` → "No lap yet" until it lands). |
| `recordRecessResult` at a lap | **0 s of play** | fire-and-forget from `completeLap`; the finish board renders optimistically from the local merge and corrects if the server disagrees. |
| the whole board, on `/tavern` | **0 s of play** | `/tavern` is outside the Realm. The clock is not running. |

Nothing here spends a child's minutes on traversal, loading or onboarding. A run *is* the play.

---

## 4. Data model

### 4.1 New table

`src/lib/db/schema.ts`, placed after `realmPlayLedger`:

```ts
/**
 * The Ring: one durable row per hero. Gleams and laps are cumulative and never
 * reset by anything except a course change, which clears the lap bests only.
 * These are NOT currency: nothing here converts to Realm minutes.
 */
export const realmRecessRecord = sqliteTable("realm_recess_record", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().unique().references(() => child.id, { onDelete: "cascade" }),
  totalGleams: integer("total_gleams").notNull().default(0),
  laps: integer("laps").notNull().default(0),
  bestLapMs: integer("best_lap_ms"),
  bestMountedLapMs: integer("best_mounted_lap_ms"),
  courseId: text("course_id").notNull().default("village-ring-1"),
  lastLapAt: integer("last_lap_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

| column | type | null | default | meaning |
|---|---|---|---|---|
| `id` | text | no | — | nanoid |
| `child_id` | text | no | — | unique, FK → `child.id`, cascade delete. A deleted hero's record goes with them. |
| `total_gleams` | integer | no | `0` | lifetime, additive, never decremented |
| `laps` | integer | no | `0` | lifetime completed laps, foot and mounted together |
| `best_lap_ms` | integer | **yes** | — | fastest foot lap on `course_id`; null means "no lap yet" |
| `best_mounted_lap_ms` | integer | **yes** | — | fastest mounted lap on `course_id`; null means "no ride yet" |
| `course_id` | text | no | `'village-ring-1'` | which road the bests were set on (D12.12) |
| `last_lap_at` | integer (timestamp) | **yes** | — | null until the first lap |
| `created_at` / `updated_at` | integer (timestamp) | no | — | house convention |

No index beyond the unique constraint on `child_id`: every read is by `child_id`, and the Tavern board reads at most one row per hero in the family.

### 4.2 Migration

**`<next>_<drizzle-generated>.sql`.** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan. What this slice does require is *ordering*: it lands after slice 1's `depth_override` migration and after slice 9's tutorial migration, which build order already guarantees.

The generated SQL is a single `CREATE TABLE realm_recess_record (...)` plus `CREATE UNIQUE INDEX realm_recess_record_child_id_unique`. No `ALTER`, no backfill, no data movement.

**Verification, checked and not trusted** (the post-edit hook runs `db:migrate` silently, so a silent failure is the failure mode to guard):

1. `npm run db:generate` — confirm exactly one new file appears, and record the number it was given.
2. Read the generated SQL. Confirm it is `CREATE TABLE` only.
3. `npm run db:migrate`.
4. `sqlite3 <local db> ".schema realm_recess_record"` and confirm all nine columns and the unique index exist.
5. `npm test` — the service test writes and reads a row.

### 4.3 What existing rows do

**There are none.** This is a new table, and no code before this slice wrote a gleam or a lap anywhere. Concretely:

- A hero who has played the Realm for six months has **no row**. `loadRecessRecord` creates a zero row on first read. The board shows `Gleams collected: 0`, `Best lap on foot: No lap yet`, `Laps run: None yet`, `Best lap riding: No ride yet`, `Last run: —`, and an empty jar.
- **The first lap is always a best**, because `best_lap_ms` is null and `mergeRecess` treats null as "no time to beat". The child sees the first-lap copy, not the new-best copy — a distinction that matters, because "New best lap!" on lap one reads as a lie.
- The old per-visit `useState` values are **not migrated**, because they never existed anywhere but in a browser tab that has since closed. Nothing is lost that was ever kept.
- `course_id` defaults to `'village-ring-1'`, which is the course this slice ships, so the first row a child writes is already on the current course and no reset message fires.

### 4.4 When a stored value changes meaning

The one case is a course re-route, and it is designed rather than accidental. Changing `COURSE_NODES` (or slice 4's road graph moving a node the course uses) requires bumping `COURSE_ID`. On the child's next run, `mergeRecess` returns `reset: true`, the lap bests clear, gleams and lap count survive, and the child is shown the one-time message in §3.3 *before* the start board. The programme's rule — "anything that changes what a stored value MEANS needs a one-time message to the child the next time they visit" — is satisfied by `course_id` itself; no extra flag column is needed, because the mismatch is the flag and writing the new id is the acknowledgement.

---

## 5. Errors and edge cases

| case | behaviour |
|---|---|
| **No record row yet** | `loadRecessRecord` creates it. Board shows the empty copy. First lap is a first, not a best. |
| **The record fails to load** | The world opens anyway. The board renders from `null`: it shows the empty copy and does not claim a record of zero. `getRealmBundle`'s existing pattern — a failed sub-read degrades the bundle, never throws the page — is followed. The ghost does not render. |
| **A write fails** | The buffer is kept, the error lane shows `Your lap couldn't be written down.` with `Try again`, and the next flush retries. The run continues; a network failure never interrupts play. |
| **A write's response is lost after succeeding** | At most nine gleams double-count. A duplicated lap increments `laps` twice and cannot corrupt a best (a best is a `Math.min` of a value already stored). Documented, accepted, and the same trade the play clock already makes. |
| **A lap faster than `minLapMs`** | Rejected by `validateRecessResult` server-side, with the child-facing message. This is the cheat guard, and it also catches a clock that jumped. |
| **`lapMs > MAX_LAP_MS` (10 minutes)** | Rejected. A child who wandered off for ten minutes did not run a lap, and a ten-minute "best" would poison the record permanently. |
| **`gleams` outside `0..MAX_GLEAMS_PER_CALL`** | Rejected; the buffer is dropped rather than retried, so a corrupted client cannot loop forever on a bad payload. |
| **The hero is dazzled mid-lap** (`focusLost`) | `pauseLap(state, 1500)`. The lap clock subtracts it. No message — the dazzle already has one. |
| **The hero fast-travels mid-lap** (slice 7) | `voidLap(state)`. The run resets to the arch, `nextPost` returns to 0, the ghost hides, and the child sees `You took the fast road, so this lap doesn't count. Start again at the arch.` Gleams collected so far are kept. |
| **The hero mounts or dismounts mid-lap** | `setMountedThisLap`. The lap is mounted (D12.7). No message, no void. |
| **The Realm closes mid-lap** (minutes hit 0) | The lap is abandoned. `flushPending` runs on the unmount that `onClose` triggers, so the gleams land. `RealmClosed` is unchanged by this slice; slice 13 adds the run to its summary. |
| **A post is touched out of order** | Ignored, as today. The nudge fires once per run, then the run is silent about it. |
| **The child stands on the arch without ever leaving** | No lap: `stepRecess` only closes a lap when `nextPost === posts.length`. Unchanged behaviour, now with eight posts on a road instead of eight points in a field. |
| **The ceremony starts mid-run** | The scene already gates recess behind the ceremony (`realm-scene.tsx:123`). The lap clock keeps running and will produce a slow lap, so `setRecessActive(state, false)` is called for the ceremony's duration and the running lap is dropped — a ceremony is not a fair lap and is also once a season. Gleams collected are kept. |
| **A deed panel opens mid-run** | Same treatment. The world is paused behind a modal; the lap is dropped, the gleams are kept, and the child is not charged a best-lap attempt for doing schoolwork. This is the direct expression of "nothing in the Realm may stand between a child and their schoolwork." |
| **`buildLapCourse` cannot find a node** | Throws at module use. Caught by the course test, so it cannot ship. If it somehow reaches runtime, the shell renders the world without the arch, posts or gleams, and the arch prompt is absent — a missing feature, never a crash, and never a broken world. |
| **Parent preview** | No run may start from either door. No gleams spawn, no ghost, no board, no write. The arch prompt reads `Emma runs the course here.` |
| **A hero is renamed** | The record has no name column; every surface renders the live `child.displayName`. A rename follows everywhere immediately. |
| **A hero is banished** | `requireChildAccess` throws for a banished hero (`access.ts:281-283`) unless `allowBanished` is passed, which these actions do not pass. The record survives in the table for a restore; the Tavern board simply omits them. |
| **A hero is deleted** | `onDelete: "cascade"` removes the record with the child. |
| **`lowStimulus` mid-run** | Not possible mid-run (the profile is fetched once per visit), but `GLEAM_COUNT_LOW` applies from the first spawn and the record is untouched — muted, not emptied. |

---

## 6. Accessibility

### 6.1 The complexity axis

Every surface here consumes `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1) and reads one flag, `surfaces.numerals`. It invents no rule of its own. `depth` is mapped to `RecessDepth` at exactly one place — the shell — and passed down as a prop; the word "depth" appears in no string a child reads, and no label anywhere says "simple", "full", "beginner" or "advanced".

| surface | simple depth (`numerals: false`) | full depth (`numerals: true`) |
|---|---|---|
| gleams collected, in the world | `A gleam!` | `A gleam! 12 so far.` |
| gleams, on the board | a jar filling, `jarFillFor()` | `147` **and** the jar |
| lap result | `A new best!` / `Lap done!` | `New best lap — 38.4 s!` / `Lap done — 41.2 s. Your best is 38.4 s.` |
| best lap | a gold ribbon on the board | `38.4 s` |
| laps run | pips, capped at ten with a `+` | `9` |
| the ghost | present and identical | present and identical, plus a gap readout `+1.2 s` under the board's finish variant |
| the lit post | identical | identical |
| the lamp line | the lamps light in the world; no line on the board | `12 of 24 lamps lit along the road.` |

Every simple-depth surface is a **substitution, never a removal**: the jar is the gleam count, the pips are the lap count, the ribbon is the best. A six-year-old at simple depth can do every single thing a fourteen-year-old at full depth can do — run the course, collect gleams, beat their best, light the lamps. Only the notation changes. The gap readout is the one addition rather than substitution, and it is additive information about a ghost both depths can already see and race.

The three programme invariants: `fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `'earned'` **at both depths** — this slice honours it by adding **no** objective to the tracker at any depth (a running lap is not a quest, and making it one would be the second tracked objective the invariant forbids); depth is never a word on screen; nothing is removed at simple depth.

### 6.2 Per learning-profile setting

| setting | behaviour |
|---|---|
| **reducedMotion** | The ghost uses `ghostStep`: it holds at the last post it passed and jumps to the next, so it never glides. The lit post does not pulse — it is brighter instead (the required non-motion substitute for a motion cue). Gleams do not bob. The jar fills in one step, not an animation. The start and finish boards appear and disappear without the `realm-toast-in` slide, matching the existing `.realm-hud-toast--plain` treatment. |
| **lowStimulus** | `GLEAM_COUNT_LOW = 6` as today. **The record is kept in full** — this is the "mute, don't empty" rule: a child with `lowStimulus` gets a quieter Green, not a Green where their best lap stopped being recorded. Post rings use the calm `#8a7d5a` instead of `#c9a84c` (the existing swap, `recess-layer.tsx:68`). The ghost is drawn at 0.30 opacity rather than 0.45. No sparkle on pickup. Boards use the plain treatment. |
| **largerText** | Every board dimension is `calc(<base> * var(--realm-hud-scale))` from slice 1's single knob (`hudScale` 1 or 1.25). The board's own text never sets a second base — the audit's "two different scaling bases" finding (`realm-hud.tsx:59` vs `spell-bar.tsx:81`) applies to every new HUD surface, and this is one. At 1.25 on a 400px-wide phone the board is one column with rows stacked label-over-value. |
| **fewerChoices** | The board shows two rows: `Gleams collected` and `Best lap on foot` (or `Best lap riding` if the child is mounted and has a ride record but no foot record). The arch offers exactly one action. No objective is added to the tracker. |
| **readAloud** | Every board and message string has a speech variant written for the ear, listed verbatim in §3.3, spoken through the existing `speak()` (`src/lib/utils/speech.ts`). Speech is spoken once per event, and `speak()` already cancels the previous utterance, so a run of gleams does not queue eight sentences. The board's `role="status"` also announces to screen readers independently. |
| **inputMode** | `touch` → the arch is a tap target with the existing 44px minimum; `keyboard` → Enter at the arch, the same handler as Talk (`realm-shell.tsx:315-321`), with the same "not while a spell page is selected" guard; `auto` → resolved by `renderSettingsFor`. **The course itself adds no new control.** Running is walking. |
| **soundEnabled** | Three cues from slice 9's WebAudio cue table: `gleam` on pickup, `post` on passing a post, `lapBest` on a new best. When sound is off — or when it is on — the visible message is the primary channel and the cue is the addition, never the reverse. No cue carries information that is not also on screen. |
| **predictableRoutine** | The course is fixed. Same eight posts, same order, same arch, every visit. A run is the most predictable thing in the Realm, and that is deliberate. |
| **untimed / sessionMinutes** | Untouched. A lap timer is a *score*, not a session limit; it never ends anything, never counts down, and never appears when a run is not happening. |

### 6.3 Parent preview (`isChildView: false`)

The preview nulls mana, cleared, ride and minutes and injects a hero selector, and no surface may crash on nulled hero state. This slice's decisions:

- **In the world:** the arch, posts and lit lamps **render** (they are part of the village, and a parent looking at their child's world should see it as it is). Gleams, the ghost and the board **do not**. No run can start from either door. `useRecessRecord` is called with `enabled: false` and writes nothing.
- **On `/tavern`:** the board renders **read-only**, for the selected child, labelled with that child's live `displayName`. This is the parent surface for this slice, and it is the honest one — it is where a parent can see "Emma has run the course nine times."
- **Attribution:** the board never shows the previewing adult's name. The record has no name column; every render uses the child's live name resolved from `child.displayName` for the `childId` on the record. Where a snapshot name later exists (slice 13's `raisedByName ?? liveName` rule for buildings), this slice deliberately stays on the live-name side: a lap time is not a stone, and a renamed hero should see their new name on their own record.

---

## 7. Testing

### 7.1 Unit-testable (Vitest, colocated, no three import)

**`course.test.ts`**
- `buildLapCourse` returns eight posts in `COURSE_NODES` order, with a closed path whose first and last points are `course.start`.
- **Every sampled point of `course.path` (at 1-unit intervals) lies inside a road corridor** — the village invariant, asserted here rather than assumed.
- `expectedLapSeconds(course, HERO_SPEED)` is between `COURSE_MIN_SECONDS` and `COURSE_MAX_SECONDS`. **This test is the build guard on the metered clock**: a re-route that produces a 90-second lap fails CI rather than quietly eating a fifth of a child's session.
- `expectedLapSeconds(course, 7.0)` is under 30 — the mount's job is real.
- `minLapMs` is below the 7.0 lap time and above zero.
- `progressAlong` returns 0 at the arch, ~0.5 at the midpoint of the path, and is monotonic along the path.
- A missing node id throws the named error.

**`ghost.test.ts`**
- `ghostAt` returns `null` before the best exists and after `elapsedMs > bestLapMs`.
- At `elapsedMs === bestLapMs / 2` the ghost's `progress` is 0.5 within a tolerance.
- `ghostStep` returns positions drawn only from `course.posts` and `course.start` — it never returns an interpolated point.
- `ghostGapMs` is positive when the hero is further along than the ghost, negative when behind, zero at the same progress.

**`record.test.ts`**
- `mergeRecess` adds gleams, increments laps only when `lapMs` is non-null, and takes the minimum in the right column for `mounted: true` vs `false`.
- A mounted lap **never** touches `bestLapMs`, and a foot lap never touches `bestMountedLapMs`.
- First lap ⇒ `{ first: true, best: true }`; a slower second ⇒ `{ first: false, best: false }`; a faster third ⇒ `{ best: true }`.
- A `courseId` mismatch clears both bests, keeps `totalGleams` and `laps`, sets `reset: true`, and writes the new id.
- `validateRecessResult` rejects a lap under `minLapMs`, over `MAX_LAP_MS`, negative gleams, and gleams over `MAX_GLEAMS_PER_CALL`, each with the exact string from §3.3.
- `lampsLitFor(0, 24) === 0`; `lampsLitFor(25, 24) === 1`; `lampsLitFor(10_000, 24) === 24` (it clamps).
- `jarFillFor` is 0 at 0, 1 at `JAR_CAPACITY`, and clamps above.

**`recess.test.ts`** (rewritten)
- Every spawned gleam lies inside one of slice 4's ten `SPAWN_ZONES`, asserted against `SPAWN_ZONES` directly, and satisfies `isOpenGround(p, layout, GLEAM_RULES)`.
- No gleam spawns within `POST_RADIUS + 0.5` of a post or the arch.
- `lowStimulus` still yields `GLEAM_COUNT_LOW`.
- A dead slot still bumps `slotSpawns` (the existing defence, preserved).
- The lap advances post-to-post in order, ignores out-of-order posts, emits one `offCourse` per run, and closes only at the arch after every post.
- `pauseLap` reduces the reported `lapMs` by exactly the paused amount.
- `voidLap` makes the next arch crossing emit no `lap` event, and resets `nextPost`.
- A dismount mid-lap leaves `mountedThisLap` true.
- The `lap` event carries no `best` field (the type test is the compiler; the behavioural test is that the server's answer is what the UI renders).

**`copy.test.ts`**
- Every branch of `lapLine` at both depths returns the exact strings in §3.3, and no simple-depth string contains a digit. (This is the mechanical guard on "depth is never a word a child reads" and "simple depth shows no numerals".)
- `boardRows` returns two rows under `fewerChoices` and five otherwise.
- `recessTavernLine` returns `null` for an empty record.

**`src/lib/services/recess.test.ts`**
- `loadRecessRecord` on a fresh child creates exactly one row; two concurrent calls create exactly one row.
- `saveRecessRecord` round-trips every column including the nullables.

**`src/lib/actions/realm-recess.test.ts`** — the economy test:
- **`recordRecessResult` inserts no row into `realm_play_ledger`.** Asserted by counting ledger rows before and after a call that awards 40 gleams and a best lap. This is the mechanical enforcement of D12.1, and it is the test that keeps the metered clock meaning something.
- A child acting for another child is refused by `requireChildAccess`.
- A rejected payload returns the child-facing message and writes nothing.

**`recess-board.test.tsx`** (jsdom, no three)
- Renders the empty copy from a `null` record and from a zero record, and the two are the same.
- `variant: "page"` under a parent preview shows the child's name, not the adult's.
- At simple depth, no rendered text node matches `/\d/` except the `Last run` date.

### 7.2 What needs the browser pass

Unit tests cannot judge any of this. It is the real acceptance criterion, on the documented port-3100 `?preview` setup, with same-framing before/after screenshots.

1. **Can a child see the course without being told it exists?** Stand at spawn. Is the arch legible as a start line? Is the lit post distinguishable from the seven dim ones at the slice-4 camera frame?
2. **Is the ghost readable as "you, before"?** At 0.45 opacity and a cool tint, does it read as a ghost or as a second hero? This is the single riskiest visual in the slice.
3. **Is 40 seconds the right lap?** Run it. Then run it on a Donkey and on a Wyrm. If the foot lap feels long, the constant to move is `COURSE_NODES`, and the test bounds will catch an over-correction.
4. **Does the finish board land in the middle of the screen** (the user's own complaint about left-aligned messages), at `hudScale` 1 and 1.25, at 400px and at 1920px?
5. **Does the jar read as a jar?** At simple depth it is the entire gleam readout.
6. **Do the lamps read as lighting up?** With one lamp lit out of sixteen, is anything visible at all? If not, the honest fix is fewer lamps, not more gleams.
7. **reducedMotion pass:** is a stepping ghost still a race, or is it confusing?
8. **Touch pass:** can a six-year-old start a run at the arch on a tablet without help?

---

## 8. Interfaces

### 8.1 Produces

**Modules and exports**

| path | exports |
|---|---|
| `src/lib/realm/recess/course.ts` | `CoursePost`, `LapCourse`, `COURSE_ID`, `COURSE_NODES`, `POST_RADIUS`, `ARCH_RADIUS`, `COURSE_TARGET_SECONDS`, `COURSE_MIN_SECONDS`, `COURSE_MAX_SECONDS`, `buildLapCourse(): LapCourse`, `POST_NODES`, `courseLength(path: Vec2[]): number`, `expectedLapSeconds(course: LapCourse, speed: number): number`, `minLapMs(course: LapCourse): number`, `progressAlong(course: LapCourse, p: Vec2): number`, `nextPost(course: LapCourse, passed: number): CoursePost \| null` |
| `src/lib/realm/recess/ghost.ts` | `GhostSample`, `ghostAt(course, bestLapMs, elapsedMs): GhostSample \| null`, `ghostStep(course, bestLapMs, elapsedMs): GhostSample \| null`, `ghostGapMs(course, bestLapMs, elapsedMs, hero: Vec2): number` |
| `src/lib/realm/recess/record.ts` | `RecessRecord`, `RecessResult`, `MergeOutcome`, `EMPTY_RECESS_RECORD`, `GLEAMS_PER_LAMP = 25`, `JAR_CAPACITY = 1000`, `MAX_GLEAMS_PER_CALL = 200`, `MAX_LAP_MS = 600_000`, `mergeRecess(record, result, now: Date): MergeOutcome`, `validateRecessResult(result, course): string \| null`, `lampsLitFor(totalGleams: number, lampCount: number): number`, `jarFillFor(totalGleams: number): number`, `hasAnyRecord(record: RecessRecord): boolean` |
| `src/lib/realm/recess/copy.ts` | `RecessDepth`, `RecessLine`, `GREEN`, `lapLine`, `gleamLine`, `startLine`, `boardRows`, `lampLine`, `recessTavernLine(name: string, record: RecessRecord): string \| null`, `formatLap(ms: number): string`, `formatLapSpeech(ms: number): string` |
| `src/lib/realm/recess/recess.ts` | `Gleam`, `RecessEvent`, `RecessState`, `GLEAM_COUNT`, `GLEAM_COUNT_LOW`, `GLEAM_RADIUS`, `GLEAM_RESPAWN_MS`, `startRecess()`, `setRecessActive(state, active, runId?)`, `pauseLap(state, ms)`, `voidLap(state)`, `setMountedThisLap(state)`, `spawnGleams(input: SpawnGleamsInput)`, `stepRecess(state, hero, now, course)` |
| `src/lib/services/recess.ts` | `loadRecessRecord(childId: string): Promise<RecessRecord>`, `saveRecessRecord(childId: string, record: RecessRecord): Promise<void>` |
| `src/lib/actions/realm-recess.ts` | `getRecessRecord(childId: string): Promise<RecessRecord>`, `recordRecessResult(childId, result): Promise<MergeOutcome>` — async only, `"use server"` |
| `src/components/realm/use-recess-record.ts` | `useRecessRecord({ enabled, childId, courseId })` → `{ record, error, clearError, addGleams, completeLap, flushPending }` |
| `src/components/realm/recess-board.tsx` | `RecessBoard` with props `{ record, depth, fewerChoices, calm, hudScale, lampCount, variant, heroName }` |
| `src/components/realm/recess-figures.tsx` | existing `GleamFigure`, `BannerFigure`; **new** `PostFigure({ size?, lit }: { size?: number; lit: boolean })`, `ArchFigure({ size? })`, `LanternLitFigure({ size? })` — all three registered via `registerFigures` under `prop:post` / `prop:post-lit` / `prop:arch` / `prop:lantern-lit` |
| `src/app/(app)/tavern/recess-board-card.tsx` | `RecessBoardCard({ childId, heroName, depth, fewerChoices })` |

**Database**

Table `realm_recess_record`; columns `id`, `child_id` (unique), `total_gleams`, `laps`, `best_lap_ms`, `best_mounted_lap_ms`, `course_id`, `last_lap_at`, `created_at`, `updated_at`. Drizzle export `schema.realmRecessRecord`. Migration number assigned at build time.

**Sprite texture keys** (new entries on `SpriteTextures`, `sprite-source.tsx`)

`prop:post`, `prop:post-lit`, `prop:arch`, `prop:lantern-lit` — three authored figures, four cache keys, **four `FIGURE_CATALOG` rows** (slice 2's rule: a figure is a catalog row, never a `spriteSizeFor` case, and a key is always `family:id` — never a bare `post` or a double-prefixed `world:post`). `post-lit` reuses `post`'s geometry with a colour swap and is rasterised only when a run is active.

**A course post is not a hitching post.** Slice 7 plants a `hitch` at every district entrance — dark iron, a ring and a rail, `prop:hitch`, `HITCH_RADIUS` 3, the thing you start a *ride* from. This slice's posts are pale timber poles on the road, `prop:post` / `prop:post-lit`, `POST_RADIUS` 2, the thing you run *past*. A child will meet both in the same frame, so they must not read alike: the course post's whole identity is that **only the next one is lit**, banded warm amber from `palette.accents.lamp` while every other post on the ring is unlit timber. A hitching post never lights. That difference is the one a six-year-old reads, and it is why slice 7 renamed its own prop to `hitch` rather than sharing the word.

**CSS classes**

`.realm-recess-board`, `.realm-recess-board--start`, `.realm-recess-board--finish`, `.realm-recess-board--page`, `.realm-recess-row`, `.realm-recess-label`, `.realm-recess-value`, `.realm-recess-pips`, `.realm-recess-jar`, `.realm-recess-jar-fill`, `.realm-recess-lamps`.

**Routes**

None new. The board appears on the existing `/tavern`.

**Deleted, so no later slice imports them**

`src/lib/realm/recess/hud.ts` (**the whole file, including slice 1's `recessPillText(gleams, laps)`**), `hudRecessFor`, `RecessTally`, and **`RealmHud`'s `recessPill: string | null` prop** — which is what slice 1 actually ships. There is no `recess` prop to delete: slice 1 removed it and put `recessPill` in its place, and `recessPill` is what goes here, replaced by `RecessBoard variant="start" | "finish"`.

`LAP_WAYPOINTS`, `LAP_ROUTE`, `LAP_START` and `WAYPOINT_RADIUS` are **not on this list**: slice 4 deleted them eight slices earlier when it laid the course on the road.

Nothing is left behind producing a string nobody renders, and nothing is left rendering a string nobody produces — which is what happens when a deletion list is written from memory of an earlier draft rather than from the spec that shipped.

### 8.2 Consumes

| from | name | used for |
|---|---|---|
| slice 4 `village-ground` | `COURSE_NODES`, `COURSE_START`, `COURSE_LENGTH_UNITS`, `roadPath(fromNodeId: RoadNodeId, toNodeId: RoadNodeId): Vec2[]`, `nodeById`, `ROAD_QUADS`, `roadCorridorContains` — from `src/lib/realm/village.ts` | **the course, already laid on road at the length this slice needs.** No `VillagePlan`, no graph parameter, no `village/` directory. |
| slice 4 | `SPAWN_ZONES` (ten rectangles), `GLEAM_RULES`, `openPointInZone(zone, layout, seed, rules, hero?)` and `openPoints(layout, seed, rules, opts)` from `src/lib/realm/open-ground.ts` | gleam spawning — objection (d). There is no `pickOpenPoint`. |
| slice 4 | `COURSE_NODES` (13), `COURSE_START`, `COURSE_LENGTH_UNITS` (128), `roadPath(fromNodeId, toNodeId)`, `nodeById`, `ROAD_QUADS` / `roadCorridorContains`, `WORLD_SIZE = 64`, from `src/lib/realm/village.ts` — **a file, not a `village/` directory** | **the course itself.** Slice 4 laid it at 128 units / 36.6 s to this slice's 35–48 s budget, so this slice builds the `LapCourse` object rather than re-routing the town. `LAP_WAYPOINTS`, `LAP_ROUTE`, `LAP_START` and `WAYPOINT_RADIUS` were deleted **in slice 4** and are not this slice's to delete. |
| slice 5 `village-life` | `seedProps(input)` and the `lantern` `PropKindId` | which lamps light, and in what order along the road. **`lampCount` is derived here** — `seedProps(...).filter(p => p.kind === "lantern").length` — because slice 5 exports no count and the number is per-child by construction. |
| slice 6 `doors-and-the-tavern` | `WorldLayout.doors` / `nearestInteractable`, the interactable bubble and its Enter/tap handling, the Tavern page's board slot | the arch prompt, and the Tavern card's home |
| slice 7 `fast-travel-and-the-companion` | the fast-travel event the shell emits on a jump, and the two **fairness rulings** (a mounted frame latches the lap mounted; a jump voids it) | `voidLap` and `mountedThisLap`. **Slice 7 states the rulings and flags the events; this slice owns `recess.ts`'s final shape**, including `bestMountedLapMs`, `mountedThisLap`, `voidLap`, `runId`, `pausedMs` and `nextPost`. Slice 7 declares none of them — it consumes the signature below. |
| slice 1 `first-impression` | `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts`, reading `numerals: boolean`; `realm_settings.depth_override` | the complexity axis (§6.1) |
| slice 1 | the centred message layer and its setter | every in-world string in §3.3 |
| slice 1 | `--realm-hud-scale` | every board dimension |
| slice 1 | the standing `clock.flushPending()` on unmount | extended, in the same cleanup, to `recess.flushPending()` |
| slice 2 `sprite-budget-and-gallery` | the parallelised, kind-keyed, warm raster cache; the pixel-scale ladder | three new kinds without re-blocking first paint |
| slice 8 `troubles-that-read-and-pay` | nothing required; the existing `focusLost` spell event | `pauseLap` (D12.9) |
| existing code | `HERO_SPEED` (`movement.ts:3`), `MOUNTS[].speed` (`avatar-catalog.ts:310-318`), `requireChildAccess` (`access.ts:260`), `speak` (`speech.ts:6`), `seededRng` (`drill-generators.ts:17`), `nanoid`, `renderSettingsFor` | as named |

Every name above is slice 4's frozen §8.1 contract or slice 6's published interface, checked against them rather than remembered. Where an earlier draft of this spec reached for `pickOpenPoint`, `VillagePlan`, `GLEAM_ZONES` or `../village/village`, those names do not exist and have been replaced above with the ones that do.

---

## 9. Out of scope

| left out | why, and to whom |
|---|---|
| **A true replay ghost** — the ghost is a pace ghost (D12.8). | Recording a per-frame path per lap is a storage and data-retention decision nothing in this programme has asked for, and a pace ghost is indistinguishable from a replay for the thing it does (giving a child something to chase). **No later slice.** If it is ever wanted, it is its own decision. |
| **Gleams buying anything.** | Refused, not deferred (D12.1). The economy has one door. **No later slice may reopen this without reopening D3.** |
| **A second course, a time trial mode, or a leaderboard across siblings.** | Slice 6 owns the shared Tavern board and gets one line per hero from `recessTavernLine`. A competitive leaderboard between siblings of different ages is a family-dynamics decision, not an engineering one, and nobody has asked for it. |
| **Troubles behaving differently during a run** (holding position, not spawning on the course). | **Slice 8** owns trouble spawning and behaviour. This slice's only interaction is `pauseLap` on `focusLost`, which touches nothing slice 8 owns. |
| **The session summary that reports the run** — "you ran the course twice, best 38.4 s". | **Slice 13 `record-of-the-work`**, which owns `RealmClosed` and the close-of-session report. This slice ships the data it will read. |
| **The parent report / Chronicle view of the record.** | **Slice 13.** The `/tavern` card is the parent-visible surface this slice ships; anything in the settings or Chronicle belongs with the rest of the parent reporting. |
| **Changing when recess is scheduled, or the `accessMode` default.** | Parent settings are out of this slice entirely. D12.3's second door (the arch) is the fix for "a default family has never seen a gleam", and it changes no setting. |
| **The lamp and jar art beyond one variant each.** | `LanternLitFigure` is a palette swap of slice 5's `lantern`; the jar is an SVG in the board. Neither is a figure in slice 11's redraw list, and neither is deferred to it. If the browser pass says the lit lamp does not read, the fix is in this slice's own art, not a later one. |
| **A minimap or course overview.** | The eight lit posts on a road *are* the course display. A minimap would be the first minimap in the game and the brief explicitly declined one (§8, "back off to ~56 rather than adding a minimap, which would concede the whole argument"). |
| **Retro-filling records from anything.** | There is nothing to fill from (§4.3). Every hero starts at zero on the day this ships, and the first lap is honestly a first lap. |
