# The mount gets a job, and the companion gets one too

**Date:** 2026-09-10
**Status:** Design spec. Written up front under decision 1 (plan the whole programme, write implementation plans per slice at build time). Not yet planned; no file:line implementation plan exists and none should be written until slices 1–6 have landed.
**Programme:** Slice 7 of 13 in the Realm presentation overhaul (`2026-09-10-realm-presentation-overhaul-brief.md`). Depends on **slice 3 `ability-bar-and-mount-slot`** (the mount slot exists and is present-but-empty), **slice 4 `village-ground`** (districts, the road graph, `roadPath()`, `open-ground.ts`, the 64-unit reframe) and **slice 6 `doors-and-the-tavern`** (the door list this slice's companion sits at). Consumed by **slice 8** (troubles must not contradict the ruling in §5.4), **slice 9** (the tutorial teaches riding and flips `fastTravel`), **slice 12** (persists the two lap records this slice splits) and **slice 13** (the session report counts rides and reads the lap split).

This slice exists because decision 2 was taken. The full village bought "WAY more development in the world" and paid for it in seconds of walking. This is the slice that pays it back, which is why the programme forbids it slipping any later than here.

---

## 1. Why — the complaints and audit findings this answers

The user's verdict, in the two fragments this slice is downstream of:

> there are not slots for the mount … should be WAY more development in the world

Slice 3 gave the mount a slot. That made a real problem legible rather than solving it, which the brief said in as many words:

> ### Q4. WHAT IS THE MOUNT FOR? We are giving it a slot, a picker and a sprite, which makes it legible — but you can cross this world in about ten seconds, so an eight-tier mount ladder with speeds from 4.2 to 7.0 against a hero's 3.5 is mechanically close to meaningless, and a slot for it just makes the emptiness legible
>
> Do you want riding to be cosmetic (present it as a pet, not a vehicle), or should it get a job — fast travel between the gate and the far sites, a recess lap advantage, reaching somewhere you cannot walk? The same question applies to the companion, which currently renders, follows, and does nothing.

**Decision 5 answered it: give it a job — fast travel, the ladder made meaningful, a recess lap advantage, and an answer for the companion.**

### The findings this slice discharges

**"there are not slots for the mount" — _blocking, medium effort_** (HUD cluster):

> There are 8 mounts in the catalog with real stats (avatar-catalog.ts:310-320, speeds 4.2-7.0 vs HERO_SPEED 3.5) and none of that is visible: no mount icon, no name, no speed, no indication one exists. […] The `M` keybinding (realm-shell.tsx:311-318) is documented only inside the help card (realm-help.tsx:32).

Slice 3 gives the mount a face. This slice gives the speeds a consequence. Verified in the code as it stands: `MOUNTS` (avatar-catalog.ts:310-320) is eight tiers from `donkey` 4.2 to `wyrm` 7.0; `HERO_SPEED = 3.5` (movement.ts:3); the scene already passes the mount's speed into `stepHero` while riding (`riding ? mountSpeed : HERO_SPEED`, realm-scene.tsx:154). The ladder is wired end to end and has nothing to do.

**"implied — the world is a diorama, not a place" — _blocking, large effort_** (world-art cluster):

> The world is 40x40 = 1600 sq units and 9.2% of it is occupied. […] Worse, the camera frames all of it at once: orthographic zoom 40 at the 35.26-degree isometric angle gives 37.8 x 36.8 world units at 1512x850, and 48 x 46.8 at 1920x1080 -- larger than the entire world. There is nothing off-screen, nothing to walk toward, no reveal.

Slice 4 fixes the diorama. The moment it does, distance exists — and distance in a metered game is a bill. §3.2 states the bill in seconds and §3.3 pays it.

**"implied — 'WAY more development' / the road goes nowhere" — _major, medium effort_**:

> The road is a single 2-unit-wide straight line at x=0 from z=17 down to z=-11 (15 tiles), and it passes nothing. The eight sites sit at |x| in {5,6,7,9}, so every one of them is 5 to 9 units off the road, reachable only by walking across open grass. There are no side paths, no junction, no plaza, no square.

Slice 4 grows that into a graph. This slice is the first consumer of the graph that is not scenery: `roadPath()` becomes the thing a mount runs on, which is also what stops a ride from ever crossing a building.

**The companion, from the hero-and-NPC cluster's "Missing entirely":**

> - Any pointer interaction with a character — villagers, hero and companion have no click/tap handlers at all.

and from "Not complained about yet, but will be":

> - Hero and companion bob on the same expression with no phase offset (realm-scene.tsx:177, 197), so the pair rises and falls in perfect unison — this reads as floating, and is probably part of why the field looks 'flat'.

Slice 2 gives the companion a phase offset. It still does nothing. Read `stepCompanion` (movement.ts:103-125) and the whole of its behaviour is one goal point: `hero.position − FACING_VEC[hero.facing] * gap`. It follows, it never crowds, and that is the entire creature. **The change this slice makes is which goal point it eases toward.** No new mechanic, no new query, no new art.

**"no quest log or tracking" — _major, medium effort_** (HUD cluster), the half that belongs to me:

> The three numbers that look like tracking are per-visit `useState` and are never persisted or read back: `cleared` (realm-shell.tsx:170 …) and `recess` gleams/laps/bestLap (realm-shell.tsx:173 …). […] A child who beats their best lap loses it by walking to the Spellbook.

Slice 12 persists them. This slice makes sure the number slice 12 persists is not a lie: once a mount can lap the ring, one pony ride permanently erases a child's own foot record unless the two are recorded apart. That has to be settled *before* persistence, not after — a stored best is very hard to un-poison.

**"implied — judging walled garden vs. app-nav-reachable" — _blocking, medium effort_**:

> Separately: flush the clock in a `useEffect` cleanup so leaving is honest

Confirmed in code: `flushPending` is exposed at use-play-clock.ts:126-130 and the only caller is the HUD's Try-again button (realm-shell.tsx:543). This slice adds a second thing that must survive an unmount — the district-visit record — and it rides in the same cleanup slice 1 installs. §4.4.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D7.1 | What is riding *for*? | Two things, and only two. **Free-roam speed** (already built: `stepHero` takes the mount's speed) and **fast travel between districts**. No mount-only terrain, no mounted combat, no mount stats beyond `speed`. |
| D7.2 | Menu-and-fade, or a real ride? | A real ride. The hero rides `roadPath()` at a canter, the camera pulls back, the town goes past. 1.4–6.7 seconds depending on route and mount (§3.3 table). No loading screen, no black fade. |
| D7.3 | Where can you start one? | Only at a **hitching post**. One post per district, standing at the district's road entrance. This is what stops fast travel being a teleport menu you can open in a hedge, and it is what makes "walk there once" a legible unlock rule. |
| D7.4 | How fast is a ride? | `travelSpeed = mountSpeed × TRAVEL_CANTER`, `TRAVEL_CANTER = 2.2`. A scripted run down a road with no steering can safely exceed free-roam speed; the constant is chosen so the longest route lands at 3.9–6.5 s. A ride longer than ~7 s reads as a loading screen inside a 300-second grant. |
| D7.5 | Which destinations are offered? | Districts, never doors. A ride ends at the destination district's post apron and the child walks the spur. This keeps arrival on open ground and keeps the destination list to five rows instead of nine. |
| D7.6 | How does a district unlock? | You touched its hitching post. Plus three free grants: the gate you spawn at, any district holding a **completed** building, and the district holding the **current objective** — so the game will always ride you toward the thing it is asking you to do. |
| D7.7 | Is travel ever mandatory? | No. Every destination is walkable, every door is walkable, no side quest, deed run, panel or Tavern route consults travel state. A hero with no mount equipped loses seconds and nothing else. Covered by a test (§7.1, T-ECON-1/2). |
| D7.8 | Does a ride earn anything? | No. Rides earn no minutes, no XP, no gleams, no loot. Gleams are not collected during a ride (§5.4). The economy still has exactly one door. |
| D7.9 | What is the companion for? | It is the **living marker**. It trots to the current objective and waits there; it noses toward the nearest gleam at recess; it sits at a door the hero is in reach of; at full depth it breaks off toward an uncleared trouble near the road. It never blocks, never fights, never has to be fed. |
| D7.10 | Is the companion the *only* marker? | Never. Slice 1's beacon, `!` and `edgeArrow` are the marker of record. The companion is an addition for the child who has one, and a hero with `companion: null` loses nothing. |
| D7.11 | Mounted laps vs foot laps | Recorded separately, in memory here, persisted in slice 12. A lap counts as mounted if the hero was mounted at **any** frame of it. A pony can never erase a foot record. |
| D7.12 | Does riding cancel a lap? | Fast travel does (you left the ring). The sheet says so before the child taps, on a line above the list. Free-roam riding does not — it makes the lap a mounted lap. |
| D7.13 | Complexity axis | `surfacesFor(depth, profile).fastTravel`. Simple depth substitutes the five-row sheet with a one-row "Ride to {district}?" pointed at the objective's district — a substitution, never a removal. `fewerChoices` forces that single row at **both** depths and holds the companion to the objective at both depths. |
| D7.14 | Reduced motion | The ride is replaced by an instant arrival plus a message; the camera never moves. Low stimulus keeps the ride and loses only the camera pull-back and the dust — muted, not emptied. New `RenderSettings.travelStyle`. |
| D7.15 | Parent preview | Posts render (they are scenery a parent should see and they explain the world). The sheet never opens, no visit is ever recorded from a preview, and no code path reads the nulled `mana`/`ride`/`minutes`. |
| D7.16 | Schema | One column, `realm_settings.districts_visited`, a JSON array of district ids. The migration takes whatever number drizzle-kit assigns; recorded here at build time. Existing rows are `NULL` and degrade to "the gate, plus every district you have already built in". |

---

## 3. Design

### 3.0 The shape of it, in one paragraph

A hitching post stands at the road entrance of every district. Walk within three units of one and that district goes on your map for good. Mount anywhere (`M`, or the mount slot); ride free at your mount's own speed as you do today. Stand at a post while mounted and the post lights: tap it (or hold the mount slot, or press Enter) and a short sheet asks where to. Pick a district and the hero canters the road there — camera pulled back, town going past, three to seven seconds — and steps down on open ground at the far post. Move the stick and the hero pulls up at the next waypoint, still mounted, still yours. Meanwhile the dog is not behind you any more: it is standing at the well, looking at you.

### 3.1 New pure modules

Everything below lives in `src/lib/realm/**` with a colocated test and imports no three.js.

#### `src/lib/realm/travel.ts` (+ `travel.test.ts`)

```ts
import type { Vec2, Prop, WorldLayout } from "./layout";
import type { Facing } from "./movement";
import type { District, DistrictId, Facing } from "./village";      // slice 4 — there is no VillageGraph;
                                                                    // village.ts IS the graph, as module constants

/** Ride speed is the mount's free-roam speed under canter. A scripted run needs no steering. */
export const TRAVEL_CANTER = 2.2;
/** The sheet closes, the hero squares up to the road, then moves. Included in every quoted estimate. */
export const TRAVEL_LEAD_IN_S = 0.25;
/** How close the hero must be to a post to use it, and to bank the district. */
export const HITCH_RADIUS = 3;
/** A route is resampled so no leg is longer than this: a cancel lands within TRAVEL_WAYPOINT_MAX / speed seconds. */
export const TRAVEL_WAYPOINT_MAX = 4;
/** Where a ride ends: this far off the road on the district side of the post. */
export const POST_APRON = 1.5;
export const TRAVEL_ARRIVE_RADIUS = 0.35;

export type MountingPost = { districtId: DistrictId; label: string; position: Vec2; facing: Facing };
export type TravelReason = "no_mount" | "away_from_post" | "not_unlocked" | "already_here" | "no_route" | "busy";
export type TravelCheck = { ok: true; post: MountingPost } | { ok: false; reason: TravelReason };

export type TravelHero = { position: Vec2; mounted: boolean };
export type TravelContext = {
  hero: TravelHero;
  // no graph parameter: village.ts's module-level constants are the graph
  unlocked: DistrictId[];
  busy: boolean;              // dazzled, mid-cast, ceremony running, or a panel is open
  hasMount: boolean;          // an unlocked mount is equipped
};

/** One post per district, at the district's road entrance, facing the district centre. Never a collider. */
export function hitchingPosts(): MountingPost[];
/** The post the hero may use, or null. Ties resolve to district declaration order. */
export function nearestPost(hero: Vec2, posts: MountingPost[]): MountingPost | null;

/** The road polyline from a point to a district's post apron, resampled to TRAVEL_WAYPOINT_MAX legs. [] when unreachable. */
export function travelRoute(from: Vec2, to: DistrictId): Vec2[];
export function routeLength(route: Vec2[]): number;
export function travelSpeed(mountSpeed: number): number;               // mountSpeed * TRAVEL_CANTER
export function travelSeconds(route: Vec2[], speed: number): number;   // routeLength / speed, no lead-in
/** What the picker quotes and the stopwatch should match: travelSeconds + TRAVEL_LEAD_IN_S, to 0.1 s. */
export function travelEstimate(route: Vec2[], speed: number): number;

export function canTravel(context: TravelContext): TravelCheck;
/** Whether a *specific* destination may be ridden to from where the hero stands. */
export function canTravelTo(context: TravelContext, to: DistrictId): TravelCheck;

export type TravelDestination = {
  districtId: DistrictId;
  label: string;
  state: "ready" | "here" | "locked" | "unreachable";
  seconds: number | null;    // null unless state === "ready"
  words: string | null;      // travelWords(seconds); null unless state === "ready"
};
export function travelDestinations(context: TravelContext, mountSpeed: number): TravelDestination[];
/** Numerals are a full-depth surface; simple depth reads these words. */
export function travelWords(seconds: number): string;   // "a moment" under 2.5 s, else "about N seconds"

export type RouteRun = { route: Vec2[]; index: number };
export type RouteStep = { run: RouteRun; position: Vec2; facing: Facing; done: boolean; waypoint: boolean };
/** One frame along a polyline at constant speed. Shared with companion.ts so both use the same road. */
export function stepAlongRoute(run: RouteRun, from: Vec2, dt: number, speed: number): RouteStep;

export type TravelRun = {
  to: DistrictId;
  label: string;
  route: RouteRun;
  speed: number;
  elapsed: number;      // seconds, including the lead-in
  cancelling: boolean;
};
export function startTravel(post: MountingPost, to: DistrictId, context: TravelContext, mountSpeed: number): TravelRun | null;
export function stepTravel(run: TravelRun, from: Vec2, dt: number): { run: TravelRun; position: Vec2; facing: Facing; done: boolean };
/** Ask to stop. The run ends at the next waypoint, never mid-leg, so the hero always halts on the road. */
export function requestStop(run: TravelRun): TravelRun;
/** Where a completed ride puts the hero down: the post apron, validated clear, else the post's own road waypoint. */
export function arrivalPoint(post: MountingPost, layout: WorldLayout, colliders: Prop[]): Vec2;
```

`travelRoute` is **`routeBetween(from, entranceOf(to))`** — slice 4's point-to-point router, which is what every Vec2-to-Vec2 caller uses; `roadPath` takes node **ids** and this slice never calls it — plus two things slice 4 does not owe me: a resample so no leg exceeds `TRAVEL_WAYPOINT_MAX`, and an apron leg appended at the far end. Both are mine and both are tested here.

#### `src/lib/realm/companion.ts` (+ `companion.test.ts`)

```ts
import type { Vec2, WorldLayout } from "./layout";
// no village type is imported here; the module reads village.ts directly
import type { Surfaces } from "./depth";           // slice 1

export type CompanionMode = "heel" | "lead" | "sit" | "sniff";
export type CompanionGoal = { mode: CompanionMode; point: Vec2 | null; routed: boolean };

/** The hero must be at least this far from the objective before the companion leaves their side. */
export const COMPANION_LEAD_MIN = 6;
/** Added to COMPANION_LEAD_MIN before the companion goes back to heel, so it never flickers on the boundary. */
export const COMPANION_LEAD_HYSTERESIS = 1.5;
/** How close the hero must be to a door before the companion sits at it. */
export const COMPANION_SIT_RANGE = 3;
/** The companion only notices gleams inside this radius; beyond it, it leads or heels. */
export const COMPANION_SNIFF_RANGE = 14;
/** Full depth only: a trouble this close to the companion's road pulls it off the objective. */
export const COMPANION_TROUBLE_RANGE = 10;
export const COMPANION_LEAD_SPEED = 4.025;  // HERO_SPEED * 1.15 — it has to be able to get ahead
export const COMPANION_ARRIVE_RADIUS = 0.4;

export type CompanionInput = {
  hero: Vec2;
  companion: Vec2;
  mode: CompanionMode;                 // last frame's, for hysteresis
  objective: Vec2 | null;              // layout.props.find(p => p.focus)?.position ?? null   (slice 1)
  doorInReach: Vec2 | null;            // slice 6
  gleams: Vec2[];                      // [] outside recess
  troubles: Vec2[];                    // [] at simple depth and under fewerChoices
  surfaces: Surfaces;
  fewerChoices: boolean;
  travelling: boolean;                 // a ride is running: the companion is carried
};

/** Pure. One goal point and the reason for it. Precedence: sit > sniff > lead > heel. */
export function companionGoal(input: CompanionInput): CompanionGoal;
```

Precedence, and why: **sit** first because a child standing at a door is about to open it and the dog should be pointing at the door, not two districts away; **sniff** next because recess is a different game and the gleam in front of you beats the objective behind you; **lead** next; **heel** as the floor. `travelling: true` short-circuits to `{ mode: "heel", point: null, routed: false }` and the scene hides the sprite (§3.6).

#### `src/lib/realm/districts.ts` (+ `districts.test.ts`)

```ts
import type { DistrictId, District } from "./village";     // slice 4
import type { SiteProgress } from "./layout";

/** Tolerant: a null column, a corrupt string, a non-array or a non-string member all yield []. Never throws. */
export function parseDistrictsVisited(raw: string | null): DistrictId[];
export function serializeDistrictsVisited(ids: DistrictId[]): string;
/** null when `id` is already present — the caller then skips the write entirely. */
export function markVisited(visited: DistrictId[], id: DistrictId): DistrictId[] | null;

export type UnlockInput = {
  visited: DistrictId[];
  buildings: SiteProgress[];
  districts: District[];
  objectiveDistrictId: DistrictId | null;
  gateDistrictId: DistrictId;
};
/** The union in D7.6, deduped, in `districts` declaration order. Never empty: the gate is always in it. */
export function districtsUnlocked(input: UnlockInput): DistrictId[];
```

#### Changes to existing pure modules

`src/lib/realm/movement.ts`:

```ts
/** When `goal` is set it replaces the behind-the-hero point and the crowding correction is skipped:
 *  a companion standing at a door is *meant* to be away from the hero. */
export function stepCompanion(
  companion: CompanionState,
  hero: HeroState,
  dt: number,
  opts: { gap?: number; speed?: number; goal?: Vec2 } = {}
): CompanionState;
```

`src/lib/realm/render-settings.ts`:

```ts
export type RenderSettings = {
  motion: boolean;
  calmPalette: boolean;
  showStick: boolean;
  hudScale: number;
  travelStyle: "ride" | "instant";   // NEW: "instant" only for reducedMotion
};
// travelStyle: profile.reducedMotion ? "instant" : "ride"
```

Note it is keyed on `reducedMotion` **alone**, not on `motion`. `motion` is `!(reducedMotion || lowStimulus)` (render-settings.ts:13), and collapsing the ride for a low-stimulus child would empty the feature rather than mute it. A low-stimulus child gets the ride, without the camera pull-back and without dust.

`src/lib/realm/recess/recess.ts`:

```ts
export type RecessState = {
  /* …unchanged… */
  bestLapMs: number | null;         // on foot
  bestMountedLapMs: number | null;  // NEW
  mountedThisLap: boolean;              // NEW: latched true by any mounted frame of the running lap
};
export type RecessEvent =
  | { kind: "gleam"; count: number }
  | { kind: "lap"; lapMs: number; laps: number; best: boolean; mounted: boolean };   // + mounted

/** `opts.mounted` latches `mountedThisLap`; `opts.travelling` suppresses gleam collection entirely. */
export function stepRecess(
  state: RecessState,
  hero: Vec2,
  now: number,
  opts: { mounted?: boolean; travelling?: boolean } = {}
): { state: RecessState; events: RecessEvent[] };

/** Fast travel voids the running lap. Tallies and both bests are untouched. */
export function voidLap(state: RecessState): RecessState;
```

`startRecess()` gains `bestMountedLapMs: null, mountedThisLap: false`. `setRecessActive(state, false)` clears `mountedThisLap` alongside `lapStartedAt` and `nextWaypoint` (recess.ts:57). The default `opts = {}` keeps the existing signature and every line of `recess.test.ts` passing unchanged.

### 3.2 The bill the village handed us, in seconds

Slice 4 states the definitive geometry and this table is generated from it. Post-to-post distances are `routeBetween(entranceOf(a), entranceOf(b))` over slice 4's 28-node, 31-edge graph; `travel.test.ts` regenerates every figure below from the real graph at build time and fails if any drifts more than 0.3 s, so this is a **fixture, not a claim**.

(Slice 4's own §3.10 table measures district **centre** to **centre** and reports a worst walk of 70 units. This table measures **entrance to entrance**, because that is where the posts stand and where a ride begins and ends. The worst is 58 units. Both are correct; they measure different journeys.)

The eight destinations, and the road distance between each pair of hitching posts:

| | gate-quarter | market-plaza | scholars-row | chapel-hill | millrace | keep-approach | garden-terrace | watch-hill |
|---|---|---|---|---|---|---|---|---|
| **gate-quarter** | — | 6 | 25 | 25 | 22 | 38 | 57 | 57 |
| **market-plaza** | 6 | — | 19 | 19 | 16 | 32 | 51 | 51 |
| **scholars-row** | 25 | 19 | — | 26 | 23 | 39 | 32 | **58** |
| **chapel-hill** | 25 | 19 | 26 | — | 23 | 39 | **58** | 32 |
| **millrace** | 22 | 16 | 23 | 23 | — | 16 | 35 | 35 |
| **keep-approach** | 38 | 32 | 39 | 39 | 16 | — | 31 | 19 |
| **garden-terrace** | 57 | 51 | 32 | **58** | 35 | 31 | — | 50 |
| **watch-hill** | 57 | 51 | **58** | 32 | 35 | 19 | 50 | — |

On foot at `HERO_SPEED` 3.5 that is **1.7 s** at the shortest and **16.6 s** at the longest, with a median across the 28 unordered pairs of ≈ 32 units, **9.1 s**.

**That is the cost decision 2 introduced.** A child who visits three districts in a 300-second grant spends roughly 45 s walking — 15% of the session — and does it again on the way back. Nothing about that is acceptable on a metered clock without an answer, and this is the answer.

### 3.3 The speed ladder, made honest

`travelSpeed(mountSpeed) = mountSpeed × TRAVEL_CANTER (2.2)`. Quoted seconds are `travelEstimate` — route ÷ speed, plus the 0.25 s `TRAVEL_LEAD_IN_S` — which is what the sheet prints and what a stopwatch should read.

Three routes, chosen because they are the shortest, the median and the longest in the table above:

| Mount | free-roam | canter | Gate → Market (6u) | Gate → Keep (38u) | Scholars' Row → Watch Hill (58u) |
|---|---|---|---|---|---|
| Donkey | 4.2 | 9.24 | 0.9 s | 4.4 s | 6.5 s |
| Pony | 4.5 | 9.90 | 0.9 s | 4.1 s | 6.1 s |
| Goat | 4.8 | 10.56 | 0.8 s | 3.9 s | 5.7 s |
| Boar | 5.2 | 11.44 | 0.8 s | 3.6 s | 5.3 s |
| Stag | 5.5 | 12.10 | 0.8 s | 3.4 s | 5.0 s |
| Direwolf | 5.8 | 12.76 | 0.7 s | 3.2 s | 4.8 s |
| Gryphon | 6.5 | 14.30 | 0.7 s | 2.9 s | 4.3 s |
| Wyrm | 7.0 | 15.40 | 0.6 s | 2.7 s | 4.0 s |
| _on foot_ | 3.5 | — | _1.7 s_ | _10.9 s_ | _16.6 s_ |

**Where the ladder reads, and where it does not — stated honestly because the copy has to be true.** Across all eight tiers the spread is 1.7 s on the Gate→Keep route and 2.5 s on the longest — a 38–40% difference, felt back to back and checkable against the clock in the corner. On the short Gate→Market hop the spread is 0.3 s and a child will not feel it. So the sheet quotes a **per-row estimate** rather than a speed number: "the Stag is faster" is a claim the child verifies against a printed second count on the route they are actually taking, not against a stat we assert.

Free-roam riding carries the ladder too, and always has — Gate→Keep is 9.0 s on a Donkey and 5.4 s on a Wyrm, against 10.9 s on foot. That path needs no new code; slice 3 made it reachable and this slice makes it worth reaching for.

**Net effect on the clock.** Three district hops per session: ~45 s walking becomes ~12 s riding, minus roughly 7 s of walking to posts (§3.4) — a saving of about 26 s, ~9% of a five-minute grant, given back to play. Fast travel wins on every route of 16 units or more and is roughly neutral below that, which is why the sheet never offers the district the hero is standing in and why the Gate→Market row reads `about a second` rather than a number a child would compare to their own legs.

### 3.4 Hitching posts

One per district, standing at `District.entrance` — the named, on-road, inside-the-district node slice 4 publishes — derived by `hitchingPosts()` rather than hand-typed, so the count and the placement are structurally correct and the string `There's one at every district.` is true by construction and asserted by a test.

**They are called hitching posts, and the code calls them `hitch`.** Slice 12 plants eight *lap-course* posts on road nodes, waist-high, non-solid, proximity-triggered — a child would meet both in the same frame with no way to tell them apart, and the two would collide on `PropKind`, on `HITCH_RADIUS` and on the texture key. So: this slice owns **`hitch`** (`PropKind "hitch"`, `HITCH_RADIUS`, `hitchingPosts()`, `HitchingPostFigure`, catalog key `prop:hitch`) and slice 12 keeps **`post`** (`prop:post` / `prop:post-lit`). A hitching post is dark iron with a ring and a rail; a course post is a pale timber pole that lights as you pass it.

**The unlock rule is `districtAt`, not post proximity.** An earlier draft unlocked a district by walking within `HITCH_RADIUS` of its post and claimed "every road route into a district passes within `HITCH_RADIUS` of that district's post". That claim is **false** on slice 4's real graph: `millrace` alone is entered from six different nodes (`bridge-s`, `ford-s`, `lane-e` from `hill`, `lane-w` from `west-north`, `east-north`, and `keep-approach`), and one post cannot cover six approaches. So the rule becomes the thing that is true by construction:

> **A district is unlocked the first frame `districtAt(hero.position)` returns its id.**

Slice 4 already computes and debounces that signal for slice 5's arrival announcement; this slice adds one listener to it. Being *in* a district is exactly what "you have been here" means, it cannot be dodged by an approach the graph happens to allow, and the copy — `Walk here once and you can ride back any time.` — is then literally what the code does. The post stops being a gate and becomes only what it should have been: the place you stand to start a ride.

- **Prop:** `{ kind: "hitch", solid: false, size: { w: 0.6, d: 0.6, h: 1.4 } }`. **Not a collider.** An invisible collider planted on a road shoulder is precisely the wedge failure decision 2(b) names, and a rail you can walk through costs nothing a child will ever notice.
- **No floating label.** Posts are excluded from the scene's `standing` label pass (realm-scene.tsx:243). The nine DOM label pills are already a complaint and slice 10 removes them; this slice adds none.
- **Figure:** one new sprite kind. See §3.8.
- **Walk cost:** a post sits at its district's road entrance, so the walk from a door to its own post is the spur the child walked in on — 5 to 8 units, 1.4–2.3 s. That cost is in the net figure above.
- **Reach state:** a post within `HITCH_RADIUS` (3 units) is "at hand". The scene reports it exactly the way it already reports villager reach — on change only, through `queueMicrotask` (realm-scene.tsx:200-205 is the pattern).
- **Banking:** unlocking is `districtAt`'s, not the post's (above). Standing at a post in a district you have never entered is impossible, so the two coincide in practice and differ only where the graph has a back way in.

**Precedence when a villager and a post are both in reach: the villager wins.** Talking is the game's job and a side quest is the point of the app; a hitching post has never been urgent. The post's bubble is suppressed while a villager is in reach, and Enter talks.

### 3.5 The ride

1. **Open.** Three ways in, all equivalent: tap the post in the world while mounted; hold the mount slot for 500 ms; press Enter while at a post with no villager in reach. `canTravel` runs first and a refusal shows its message instead of the sheet (§3.7).
2. **Choose.** The sheet (§3.7) lists districts. Picking one closes it.
3. **Lead-in, 0.25 s.** The hero turns to face the road. The camera begins easing out from slice 4's `VILLAGE_CAMERA_ZOOM` to `TRAVEL_ZOOM = 44` over 0.6 s — overlapping the ride, not added to it. Under `!settings.motion` the camera does not move at all.
4. **Ride.** `stepTravel` walks the resampled `roadPath()` polyline at `travelSpeed`. `stepHero` does not run; the input axis is read only as a stop request. Facing comes from the leg direction, so the sprite mirrors correctly all the way round a corner (the `facing === "w"` mirror at realm-scene.tsx:180 is unchanged).
5. **Stop.** Any of: stick or key input, a tap anywhere on the ground, `Escape`, or the "Stop" button on the ride banner. `requestStop` sets `cancelling` and the run ends **at the next waypoint** — at worst `TRAVEL_WAYPOINT_MAX / speed` = 4 ÷ 9.24 = **0.43 s** later, and always on the road. The hero stays mounted and in control.
6. **Arrive.** The run finishes at the apron; `arrivalPoint` validates it against `layout.colliders` and falls back to the post's own road waypoint if anything sits there. The hero is placed, `unstickHero` runs once as a belt-and-braces recovery, and **the hero dismounts** — because a mounted hero cannot cast ("Dismount to cast.", realm-shell.tsx:276) and arriving is the moment before a child talks to somebody or clears something. The camera eases back to `VILLAGE_CAMERA_ZOOM` over 0.6 s.

Slice 1's `edgeArrow` stays live throughout: a wider frame with no off-screen objective arrow is how you lose a six-year-old, and the widest frame in the programme is the one this ride opens.

### 3.6 The companion

`stepCompanion` already eases toward a goal point (movement.ts:103-125). The whole change is which point:

| Mode | Goal | When |
|---|---|---|
| `sit` | the door's threshold | a door is in reach (slice 6) |
| `sniff` | the nearest gleam | recess is active and a gleam is within `COMPANION_SNIFF_RANGE` (14) |
| `lead` | the objective site | the hero is more than `COMPANION_LEAD_MIN` (6) from it. It arrives, then **waits there** — it does not orbit back |
| `heel` | behind the hero, as today | everything else, and the hero is within 6 + 1.5 of the objective |

Full depth only, and never under `fewerChoices`: a `lead` companion within `COMPANION_TROUBLE_RANGE` (10) of an uncleared trouble breaks off toward it for as long as the trouble lives, then resumes leading. That is the whole of the "more than one thing to look at" affordance a thirteen-year-old gets, and it costs one array in the input.

- **Pathing.** In `lead` and `sniff` mode over more than 8 units, the companion follows `roadPath()` through `stepAlongRoute` — the same helper the ride uses. Under 8 units it eases directly, as today. This is the cross-cutting village invariant: **no cross-map route in this slice is a straight line**, so the dog never walks through the chapel.
- **Speed.** `COMPANION_LEAD_SPEED` 4.025 (HERO_SPEED × 1.15) while leading. Heel speed is unchanged.
- **Reduced motion.** No trot: the companion is *placed* at its goal when the goal changes. It still relocates and still points. This mirrors `followCamera`'s existing reduced-motion snap (camera.ts:10).
- **During a ride.** The companion is carried. Its sprite fades out over the 0.25 s lead-in and fades in at the heel point on arrival (with motion off, it simply moves). Drawing a rabbit sprinting at 15.4 units per second would be worse than not drawing it.
- **No companion equipped.** `textures.companion` is already `null` when `config.companion` is unset (sprite-source.tsx:172). Every mode short-circuits, nothing renders, and slice 1's beacon, `!` and edge arrow are unaffected. The companion is never the only marker.
- **Preview.** The companion leads in preview too — a parent seeing the dog standing at the well is being shown exactly what their child is being pointed at. It reads no nulled hero state.

### 3.7 Every visible string

All notices go to slice 1's centred `.realm-messages` lane and its `aria-live="polite"` region, set regardless of `readAloud` so the announcement is free. Read-aloud variants are written for the ear (no punctuation a voice will read as a pause in the wrong place, no "s" abbreviation for seconds).

**The destination sheet — full depth**

| Element | String |
|---|---|
| Title | `Where to?` |
| Subtitle | `Pick a place, or walk there yourself.` |
| Lap warning line (recess, lap running) | `Riding will end this lap.` |
| Ready row | `{districtLabel}` · full depth: `{seconds} s` · simple depth: `{words}` |
| Row you are standing in | `{districtLabel}` · `You're here` |
| Locked row | `{districtLabel}` · `Walk here once to open it.` |
| Dismount action | `Get down` |
| Cancel action | `Stay here` |
| Sheet, no reachable district | `No roads from here yet.` |

`travelWords(seconds)` → `a moment` below 2.5 s, otherwise `about {N} seconds` with N rounded. Full depth shows the numeral **and** the words are still the accessible name; simple depth shows only the words. Numerals for words is the same substitution slice 1 makes with pips.

**The destination sheet — simple depth, or `fewerChoices` at any depth**

| Element | String |
|---|---|
| Title | `Ride to {districtLabel}?` |
| Confirm | `Yes, ride` |
| Cancel | `Not now` |
| Lap warning line | `Riding will end this lap.` |

The single district offered is the one holding the current objective; when the objective's district is where the hero already stands, it is the nearest other unlocked district; when there is none, the sheet does not open and `No roads from here yet.` shows.

**The ride banner** (`.realm-ride-banner`, centred, above the ability bar)

| Input mode | String |
|---|---|
| touch | `Riding to {districtLabel}` + button `Stop` |
| keyboard / auto | `Riding to {districtLabel} · Esc to stop` |

**Messages**

| Moment | On screen | Read aloud |
|---|---|---|
| Ride starts | `Off we go!` | `Off we go. Riding to {districtLabel}.` |
| Ride arrives | `You're at {districtLabel}.` | `You are at {districtLabel}.` |
| Ride stopped early | `Whoa! You stopped on the road.` | `Whoa. You stopped on the road.` |
| A post banked for the first time | `{districtLabel} is on your map now.` | `{districtLabel} is on your map now.` |
| Refused — no mount equipped | `Pick a mount first.` | `Pick a mount first.` |
| Refused — not at a post | `Ride from a hitching post. There's one at every district.` | `Ride from a hitching post. There is one at every district.` |
| Refused — district not unlocked | `Walk there once, and you can ride to it after.` | `Walk there once, and you can ride to it after.` |
| Refused — already there | `You're already here.` | `You are already here.` |
| Refused — busy | `Finish this first.` | `Finish this first.` |

**In the world**

| Element | String |
|---|---|
| Post bubble, touch | `Ride` |
| Post bubble, keyboard | `Ride · Enter` |
| Post accessible name | `Hitching post` |

**The mount slot** (slice 3's slot; these are the labels this slice sets)

| State | `aria-label` | `title` |
|---|---|---|
| Not riding | `Ride your {mountLabel}` | `Ride · M` |
| Riding, away from a post | `Get down from your {mountLabel}` | `Get down · M` |
| Riding, at a post | `Get down from your {mountLabel}, or hold to pick a place` | `Hold to pick a place` |

**Recess laps** (the panel that shows these is slice 12's; the strings and the split are this slice's)

| Moment | String |
|---|---|
| First lap on foot | `First lap on foot: {t} s!` |
| New best on foot | `New best on foot: {t} s!` |
| Lap on foot, not a best | `Lap done: {t} s. Your best on foot is {b} s.` |
| First lap riding | `First lap riding: {t} s!` |
| New best riding | `New best riding: {t} s!` |
| Lap riding, not a best | `Lap done riding: {t} s. Your best riding is {b} s.` |
| Record labels | `On foot` / `Riding` |

`{t}` and `{b}` use the existing `formatLap` (one decimal, recess.ts:127).

**The companion**, appended to slice 1's objective announcement, spoken once per objective change, only when `config.companion` is set **and** `textures.companion` is non-null:

> `Your {companionLabel} will show you the way.`

**The help card** — `helpGroups` (realm-help.tsx:31-33) currently reads "Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring." The Ride button it names is deleted in slice 3, so this string is already false by the time this slice starts. Rewritten here (and replaced wholesale by slice 9's tutorial):

| Input mode | Group `Ride and recess` |
|---|---|
| touch | `Tap your mount to ride. At a hitching post, tap the post to ride right across the village. At recess, collect gleams and run the lap ring.` |
| keyboard | `Press M to ride. At a hitching post, press Enter to ride right across the village. At recess, collect gleams and run the lap ring.` |

No string in this slice promises anything the code does not do. Each was checked against its mechanism: posts exist per district by construction; "walk here once" is banked by the post-reach check; "riding will end this lap" is `voidLap`; the quoted seconds are the same function the simulation runs on.

### 3.8 Scene, DOM and rasterisation

**One new sprite kind, and it is a `FIGURE_CATALOG` row, not a `spriteSizeFor` case.** `HitchingPostFigure` in `world-figures.tsx`, `data-figure="prop" data-figure-id="hitch"`, catalog key **`prop:hitch`** (slice 2's `family:id` rule — never a bare or double-prefixed key like `world:post`), registered through `registerFigures` so its box comes from `figureSize("prop:hitch")`, it appears in `/dev/figures`, and it is counted against `RASTER_BUDGET_TEXELS`. Rasterised in `SpriteSource` whenever `world` is set — **deliberately not behind `world.decor`**. The decor branch (sprite-source.tsx:154-159) is skipped under `calmPalette` (realm-shell.tsx passes `decor: !settings.calmPalette`), which is the "low stimulus EMPTIES rather than MUTES" defect the cross-cutting concerns name. A low-stimulus child must not lose fast travel.

Budget: **+1 kind** against village-life's running total. Kinds are billed, instances are free (`sprite-texture.ts` caches by key), so five posts cost one 96×96 raster. It joins slice 2's parallel batch, whose wall clock is bounded by its slowest member and not by its sum, so the expected effect on first paint is **≤8 ms**; the browser pass (§7.2) records the real before/after number rather than trusting this one.

**Scene props added to `RealmSceneProps`** — every one referentially stable, so the `World` memo (realm-scene.tsx:71) keeps shielding the scene from the ~5 re-renders/second `setMana` drives:

```ts
travelRef: RefObject<TravelRequest | null>;      // shell writes, scene reads-and-clears — the castRef pattern
onTravelEvent: (e: TravelEvent) => void;         // useCallback
postId: string | null;                           // last-known post in reach, mirrors reachId
onPostChange: (districtId: string | null) => void;
```

```ts
export type TravelRequest = { to: DistrictId } | { stop: true };
export type TravelEvent =
  | { kind: "start"; to: DistrictId; label: string }
  | { kind: "arrive"; to: DistrictId; label: string }
  | { kind: "stopped" };
```

**The companion needs no new prop at all.** Its objective comes from `layout.props[].focus` (slice 1 put it on the layout precisely so the memo survives), doors from `layout` (slice 6), gleams from the scene's own `recessRef`, troubles from `simRef`, and depth from `surfaces`, which slice 1 already passes and memoises. That is the argument for slice 1's decision, cashed.

Every scene→React hop goes through `queueMicrotask` (realm-scene.tsx:118, 133, 158, 162, 203). No synchronous `setState` in an effect. No render-time ref writes. `useMemo` results are treated as immutable.

**Frame order** inside the `interactive` branch, before `stepHero`: if a travel run is active, `stepTravel` owns the hero's position and `stepHero` is skipped entirely; the input axis is read only to set `cancelling`. `stepSpellSim` still runs (§5.4). `stepRecess` runs with `travelling: true`.

**DOM.** New `src/components/realm/travel-sheet.tsx` — a `role="dialog"` panel positioned by `bottom: calc(var(--realm-bar-bottom) + var(--realm-bar-height) + 0.75rem)` using slice 3's published custom property, so it inherits the fix for the four hand-tuned offsets rather than adding a fifth. Sizes derive from `--realm-hud-scale` (slice 3's one knob). New classes:

`.realm-travel`, `.realm-travel--single`, `.realm-travel--plain` (low-stimulus, the `.realm-hud-toast--plain` treatment), `.realm-travel-title`, `.realm-travel-sub`, `.realm-travel-lap`, `.realm-travel-list`, `.realm-travel-row`, `.realm-travel-row--here`, `.realm-travel-row--locked`, `.realm-travel-name`, `.realm-travel-time`, `.realm-travel-actions`, `.realm-travel-cancel`, `.realm-ride-banner`, `.realm-ride-stop`, `.realm-post-bubble`.

Every row is `min-height: calc(56px * var(--realm-hud-scale))`. `.realm-ride-banner` is `pointer-events: none` with `auto` on `.realm-ride-stop` alone — the top-band tap-eating defect (globals.css:1705 defeating 1707) is not repeated here.

While the sheet is open the scene is `interactive={false}`, so a tap outside closes the sheet and does **not** walk the hero. One dead tap beats "the menu vanished and now I'm walking".

### 3.9 Input

| Input | Result |
|---|---|
| `M` | Mount / dismount. Unchanged (realm-shell.tsx:305-314). Never opens the sheet — a child must always be able to get down with one key. |
| Mount slot tap | Mount / dismount. Slice 3's behaviour, unchanged. |
| Mount slot hold, 500 ms | Opens the sheet (mounting first if not mounted). Pointer-capture based, cancelled by movement over 10 px. |
| Tap a post in the world, mounted | Opens the sheet. |
| `Enter` at a post, mounted, no villager in reach | Opens the sheet. |
| `Escape` | Closes the sheet; during a ride, stops it. |
| Arrow keys / `Tab` in the sheet | Move between rows; the sheet is focus-trapped like `RealmHelp` (realm-help.tsx:64-72). |
| Stick, WASD, arrows, ground tap during a ride | Stop at the next waypoint. |

---

## 4. Data model

### 4.1 The column

```ts
// src/lib/db/schema.ts — realmSettings
districtsVisited: text("districts_visited"),   // JSON array of district ids; NULL until the first post is touched
```

- **Table:** `realm_settings`, one row per child. It already carries per-hero realm flags (`helpSeenAt`, `starterSpellAt`, schema.ts:694-695), so this is the established home rather than a new table.
- **Type:** `text`, nullable, **no default**. JSON array of strings, e.g. `["gate","market","millrace"]`. Precedent: `child.avatarConfig` is JSON in a text column.
- **Migration:** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan. What matters is the column, not the ordinal.
- **Verification:** `npm run db:generate`, then `npm run db:migrate`, then **read back the generated SQL and the `meta/_journal.json` entry**. The hook runs migrate silently; a silent success is not evidence.

### 4.2 What existing rows do

Every existing `realm_settings` row has `districts_visited = NULL`. `parseDistrictsVisited(null)` returns `[]`, and `districtsUnlocked` then hands back the gate plus **every district holding a completed building** plus the objective's district. So:

- A brand-new hero: the gate only. They cannot ride anywhere yet, which is correct — they have not been anywhere. The objective clause immediately grants the well's district as soon as slice 1 picks an objective, so the very first ride available is the one toward the thing they are being asked to do.
- An existing hero mid-kingdom with the Well and the Mill built: those districts are unlocked on their first visit after this ships, without ever having touched a post. This is the important one. A child who has demonstrably walked to the mill a hundred times must not be told to walk there once more.
- A hero whose column holds garbage (hand-edited, a half-written value, an id from a district slice 4 later renamed): `parseDistrictsVisited` returns `[]` and unknown ids are dropped by `districtsUnlocked`'s intersection with `districts`. No crash, and the completed-building clause still restores most of what they had.

**Nothing about the meaning of an existing stored value changes**, so no one-time message to the child is owed. The column is purely additive.

### 4.3 Reading and writing

`RealmBundle` (actions/realm.ts:18-33) gains `districtsVisited: string[]`, parsed server-side from the settings row already being loaded by `loadRealmSettings` in the existing `Promise.all` (actions/realm.ts:61-72). **No new round trip** — `loadRealmSettings` selects the row; it selects one more column.

New server action, `src/lib/actions/realm-travel.ts`:

```ts
"use server";
/** Banks one district. Idempotent; returns the full list so the client never guesses. */
export async function recordDistrictVisits(childId: string, districtIds: string[]): Promise<{ visited: string[] }>;
```

One exported async function; the file exports nothing else, per the `"use server"` rule. It re-reads, unions, writes only if the union differs, and is guarded by `requireChildAccess(childId)` like every other realm action.

Client side: the shell keeps the visited list in state, unions locally the instant a post is banked (so the ride works immediately, before any round trip), and batches unwritten ids. Writes fire at most once per district per visit.

### 4.4 The flush

Unwritten visits are flushed in the **same `useEffect` cleanup** that slice 1 installs for `clock.flushPending()` — so the last post a child touched on their way out is not lost, and so this slice does not add a second exit path that bypasses the clock. A failed write costs nothing this visit (the in-memory list holds) and is retried the next time the hero touches that post. It never surfaces an error to the child.

**Preview writes nothing.** The banking call is gated on `isChildView`. A parent walking their child's realm must not stamp a visit into the child's record.

### 4.5 Attribution

This slice stamps no child's name into the world. The two lap records it splits are per-hero state persisted by slice 12 and reported by slice 13; the `raisedByName ?? liveName` snapshot-or-live rule is theirs to state, and the split this slice ships is what makes "Emma's best on foot" a sentence that survives a sibling borrowing the pony.

---

## 5. Errors and edge cases

### 5.1 Refusals

Every refusal is a `TravelReason` with one written string (§3.7), shown in the message lane, spoken under `readAloud`, and announced in the aria-live region regardless. None of them is a dead end: walking is always available.

| Reason | Cause | What the child can still do |
|---|---|---|
| `no_mount` | `avatarConfig.mount` is null, or the equipped id is no longer in `bundle.mounts.unlocked` (a retired quest reward). | Slice 3's mount picker opens from the same tap. Every hero has Pony and Donkey as `free` unlocks (avatar-catalog.ts:311-312), so a hero with genuinely no mount cannot occur; this is a defensive path for a corrupt or revoked config. |
| `away_from_post` | Not within `HITCH_RADIUS` of any post. | Walk to the post; it is on the road they are already on. |
| `not_unlocked` | District not in `districtsUnlocked`. | Walk there once. |
| `already_here` | Destination is the district the hero stands in. Rendered as a disabled `You're here` row, never as a message. | — |
| `no_route` | `roadPath()` returned an empty polyline. A data bug in the graph. | The row is omitted from the sheet; if every row is omitted, the sheet does not open and `No roads from here yet.` shows. A `console.error` names the district so we find it. |
| `busy` | Dazzled, mid-cast, a panel open, or the ceremony running. | Wait 1.5 s (`DAZZLE_MS`) or finish. |

### 5.2 A ride that cannot finish

- **Route ends inside a collider.** `arrivalPoint` validates the apron against `layout.colliders` and falls back to the post's own road waypoint, which is on the road and clear by construction. `unstickHero` (movement.ts:85-89) runs once after placement as the final net.
- **A building completes mid-ride** and its foundation becomes solid under the route. The route is a road polyline and buildings do not stand on roads (slice 4's corridor invariant), so this cannot put a collider under the hero; if it somehow does, the per-frame position write is followed by `unstickHero` on the `layout.colliders` change, which the scene already runs (realm-scene.tsx:100-102).
- **The tab is hidden mid-ride.** `dt` is clamped to 0.05 (realm-scene.tsx:104), so a backgrounded tab cannot teleport the rider; the ride resumes from where it was.
- **The ceremony begins mid-ride.** `beginCeremonyIfWaiting` already sets `setRiding(false)` because the mount sprite would overlap the crown (realm-shell.tsx:252). The scene ends any active run on the same transition and places the hero at the current waypoint; the ceremony then walks them from there as it does from anywhere.
- **The play clock closes mid-ride.** The run is abandoned with the world; nothing is owed. No minutes were earned by it and none can be lost by it.
- **`textures.world["post"]` failed to rasterise.** `SpriteSource` continues silently past a missing figure (sprite-source.tsx:104-109). Posts then render as the existing box fallback and everything still works — but `hitchingPosts` is computed from the graph, not from textures, so travel is unaffected either way.

### 5.3 Recess

- **Fast travel with a lap running.** The sheet shows `Riding will end this lap.` above the list *before* the child taps. Choosing a destination calls `voidLap`: `nextWaypoint → 0`, `lapStartedAt → null`, `mountedThisLap → false`. Tallies, `bestLapMs` and `bestMountedLapMs` are untouched. No confirm dialog — a confirm is a second tap for a six-year-old and the warning is already on screen.
- **Mount mid-lap.** `mountedThisLap` latches true and stays true for the rest of that lap. You cannot ride nine tenths of a ring and step down at the line to bank a foot record.
- **Dismount mid-lap.** Does not clear the latch. Same reason.
- **Recess ends mid-lap.** `setRecessActive(state, false)` clears the running lap and the latch, as it already clears `lapStartedAt` and `nextWaypoint` (recess.ts:57).

### 5.4 Two rulings other slices must not contradict

**Troubles do not interrupt a ride.** While a travel run is active the dazzle check in `stepSpellSim` does not apply to the hero. A cancelled ride leaves a child stranded in a district they did not choose, on a metered clock, for a reason they cannot see — that is the worst outcome available. It cannot be exploited, because a ride always ends and always ends dismounted. **Slice 8 must not make troubles able to stop a ride.**

**Gleams are not collected during a ride.** `stepRecess` is called with `travelling: true`, which suppresses collection outright. At 15.4 units per second a ride would hoover a line across the map; a shortcut must not become a score exploit. Lap waypoints are likewise not advanced during a ride, which is moot since the ride voids the lap.

### 5.5 The four full-village engineering problems (decision 2)

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** This slice adds five non-solid, 0.6×0.6 props and takes no ground out of any spawn pool: posts are neither `solid` nor `kind === "foundation"`, so `spawnGleams`'s obstacle filter (recess.ts:66) ignores them, and they are not foundations so the trouble spawner does not see them at all. The net effect on spawn density is zero. Fast travel *increases* the number of distinct foundations a child stands next to per session, which helps rather than hurts; zone-based spawning remains slice 8's to build.

**(b) New solid props can wedge the hero, and the ceremony walk and the recess lap ring both cross the map.** Posts are `solid: false` — nothing this slice adds is a collider, so no new footprint grown by `HERO_RADIUS` can intersect a road corridor. Both cross-map routes this slice introduces (the ride and the leading companion) run on `roadPath()`, never a straight line. Arrival goes through `arrivalPoint` → `openGround` validation → fallback to a road waypoint → `unstickHero`. Four layers, each of which alone would be sufficient.

**(c) Sprite rasterisation already blocks first paint and more figures makes it worse.** One new kind, billed once; instances free; joins slice 2's parallel batch; measured effect ≤8 ms, recorded for real in the browser pass. Crucially the post is rasterised outside the `world.decor` branch, so no accessibility setting can remove it.

**(d) Gleam spawning needs open ground.** Posts add **no** exclusion zone. Gleams may spawn beside a hitching post and that is fine. Adding a clearance radius around five posts would shrink the open-ground pool for no gain, which is the exact failure mode (d) warns about.

---

## 6. Accessibility

### 6.1 The complexity axis

Every surface below consumes `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1). No rule in this slice is invented locally. `Surfaces` needs one field this slice reads:

```ts
fastTravel: boolean;   // one of slice 1's thirteen published fields; this slice is its first consumer
```

| Surface | Simple depth | Full depth |
|---|---|---|
| Destination sheet | One row: `Ride to {districtLabel}?` pointed at the objective's district, `Yes, ride` / `Not now` | Five rows, `Where to?`, locked and here states shown |
| Ride time | Words: `about 5 seconds` | Words **and** the numeral: `5.3 s` |
| Post bubble | Same | Same |
| Ride banner | Same | Same |
| Companion | Objective only | Objective, plus break-off toward an uncleared trouble within 10 units |
| Lap records | `On foot` / `Riding` bests only | Bests plus the current lap time |

The three invariants, checked:

1. **`fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `earned` at both depths** — this slice adds no objective and no ability slot, and honours the spirit: `fewerChoices` forces the single-row sheet at both depths and holds the companion to the objective at both depths (never a trouble break-off).
2. **Depth is never a word a child reads.** No string in §3.7 contains "depth", "simple", "advanced", "beginner" or a level number. The single-row sheet does not announce itself as a reduced version of anything.
3. **Every simple-depth surface is a substitution, never a removal.** A menu of five becomes one button that rides you to the place the game is already pointing at. A six-year-old at simple depth can reach every district by fast travel — one at a time, the one that matters — and can walk to all of them regardless. Nothing is taken away.

The patronising-risk escape hatches from decision 7 apply unchanged: slice 1's "Show me everything" control on the gate flips depth, and a parent can set the override in the Realm settings panel. A thirteen-year-old who has done neither is one tap from both.

### 6.2 The learning profile, all of it

| Setting | Behaviour |
|---|---|
| `reducedMotion` | `travelStyle: "instant"`. No ride, no camera movement at all: the hero is placed at the destination and the lane says `You're at {districtLabel}.` The child still gets the seconds back — this is the accommodation, not a lesser version of the feature. The companion is placed at its goal rather than trotting; it still relocates and still points. The **non-motion substitute for every motion cue in this slice is a written message** (start, arrive, stop, bank), so no feedback is motion-only — unlike the single combat particle gated on `motion`, which erases 100% of combat feedback for exactly the children the setting exists for. |
| `lowStimulus` | The ride plays at full speed. What goes: the camera pull-back (`settings.motion` is false), any dust or trail, and the gold sheet styling — `.realm-travel--plain` uses the `.realm-hud-toast--plain` treatment (flat dark, no animation). What stays: the ride, the posts, the sheet, the destinations, the estimates. **Muted, not emptied.** The post texture is deliberately rasterised outside the `world.decor` branch precisely so this setting cannot delete a mode of travel. |
| `largerText` | Every sheet and banner size derives from `--realm-hud-scale` (slice 3's one knob), which is `settings.hudScale` = 1.25 here. Rows are `min-height: calc(56px * var(--realm-hud-scale))` → 70px. The world post bubble uses slice 1's world-label scaling, so it is not the 11px orphan the current `.realm-label` is. |
| `fewerChoices` | Single-row sheet at both depths; companion held to the objective at both depths. |
| `readAloud` | Every message in §3.7 has a spoken variant, fired through the existing `speak()` helper (utils/speech.ts) behind a last-spoken ref so re-renders do not stutter it. Row focus speaks `{districtLabel}. About {N} seconds by {mountLabel}.` The objective announcement gains `Your {companionLabel} will show you the way.` once per objective change. |
| `inputMode: touch` | Post tap and slot hold. The ride banner carries a real `Stop` button (56px). No key is required for anything. |
| `inputMode: keyboard` | `M` to mount, `Enter` at a post, arrows in the sheet, `Escape` to close or to stop. No pointer is required for anything. |
| `inputMode: auto` | Resolved by `renderSettingsFor(profile, isTouchDevice)` (render-settings.ts:15) exactly as today; both paths are always wired. |
| `soundEnabled` | Slice 9 ships sound. This slice reserves four cue ids and implements none: **`travelStart`, `travelArrive`, `travelStop`, `companionPoint`** — camelCase, matching slice 9's `CueId` union, which carries all four with authored tone rows. A reserved id with no `CUES` row is a test failure in slice 9, so none of these can become a sound that silently does not exist. Every one of them already has a written message besides, so a sound-off child loses nothing. |

### 6.3 Parent preview (`isChildView: false`)

| Surface | Preview |
|---|---|
| Hitching posts | **Render.** They are scenery, and they explain the world to the adult looking at it. |
| Post bubble | Suppressed — a parent cannot mount. |
| Destination sheet | **Never opens.** `canTravel` is short-circuited by `hasMount: false` (the shell already forces preview to a non-riding state, realm-shell.tsx:475-477). |
| Ride banner | Never renders. |
| Companion | Runs, and leads to the objective — informative for the adult. |
| Visit banking | **Never written.** Gated on `isChildView`. |
| Lap split | `hudRecess` is already `null` in preview (realm-shell.tsx:474). Unchanged. |

No surface in this slice reads `mana`, `cleared`, `ride` or `minutes`, so none can crash on the preview's nulls. The hero selector injected into the top row is untouched.

---

## 7. Testing

### 7.1 Unit-testable (Vitest, jsdom, nothing imports three)

**`travel.test.ts`**

- T-POST-1 `hitchingPosts().length === DISTRICTS.length`, each post sits exactly at its district's `entrance`, and `districtAt(post.position)` returns that district's own id — the structural guarantee behind `There's one at every district.`
- T-POST-2 **The unlock rule is total.** For all 56 ordered district pairs, walking `routeBetween(centreA, centreB)` at dt 1/60 causes `districtAt` to return B's id before arrival, so every approach unlocks. This replaces the old "every route passes a post" invariant, which is false on slice 4's graph for `millrace`.
- T-POST-2 `roadPath()` from the gate to any district passes within `HITCH_RADIUS` of that district's post — the guarantee behind "Walk here once to open it": you cannot enter a district by road without banking it.
- T-POST-3 No post's footprint grown by `HERO_RADIUS` intersects a road corridor, and no post is `solid`.
- T-ROUTE-1 `travelRoute` resamples so no leg exceeds `TRAVEL_WAYPOINT_MAX`; the last leg is the apron.
- T-ROUTE-2 `travelRoute` to an unreachable district returns `[]`; `canTravelTo` then yields `no_route`.
- T-SPEED-1 **The §3.3 table, regenerated from the real graph.** Every cell within 0.3 s of the printed figure, `travelEstimate` strictly decreasing across the eight mounts on every route, and every route strictly faster ridden than walked.
- T-SPEED-2 `travelWords`: 2.4 → `a moment`, 2.6 → `about 3 seconds`, 6.7 → `about 7 seconds`.
- T-CHECK-1..6 One case per `TravelReason`, each asserting the exact string in §3.7 is the one produced.
- T-DEST-1 `travelDestinations` marks the standing district `here`, an unvisited one `locked`, and never returns a `ready` row with a null `seconds`.
- T-STOP-1 `requestStop` mid-leg ends at the next waypoint, never mid-leg; the stop point is on the route polyline.
- T-ARRIVE-1 `arrivalPoint` for all 20 ordered district pairs is outside every collider grown by `HERO_RADIUS`; a synthetic collider parked on an apron forces the road-waypoint fallback.

**`companion.test.ts`**

- T-COMP-1 Mode precedence: door beats gleam beats objective beats heel.
- T-COMP-2 Hysteresis: crossing 6 units leads, coming back inside 6 keeps leading until 7.5, then heels. No flicker at the boundary.
- T-COMP-3 `fewerChoices: true` never yields a trouble goal at either depth.
- T-COMP-4 `surfaces.troubleDetail` false (simple depth) never yields a trouble goal.
- T-COMP-5 `objective: null` and `gleams: []` → `heel`, `point: null`.
- T-COMP-6 `travelling: true` → `heel`, `point: null`, regardless of every other input.
- T-COMP-7 A goal more than 8 units away sets `routed: true`.

**`districts.test.ts`**

- T-DIST-1 `parseDistrictsVisited` round-trips; `null`, `""`, `"{}"`, `"[1,2]"` and `"not json"` all yield `[]` and never throw.
- T-DIST-2 `districtsUnlocked` with `visited: []` and two complete buildings unlocks the gate, both those districts and the objective's — the existing-row case from §4.2, asserted as behaviour.
- T-DIST-3 Ids not present in `districts` are dropped.
- T-DIST-4 `markVisited` returns `null` for an id already present, so the caller skips the write.

**`recess.test.ts`** (additions; every existing case passes unchanged against the defaulted `opts`)

- T-LAP-1 A lap with one mounted frame records as mounted and updates `bestMountedLapMs` only; `bestLapMs` is untouched.
- T-LAP-2 A faster mounted lap never overwrites a slower foot best. **This is the honesty test the whole split exists for.**
- T-LAP-3 Dismounting mid-lap does not clear the latch.
- T-LAP-4 `voidLap` clears the running lap and the latch and leaves both bests and the tallies alone.
- T-LAP-5 `travelling: true` collects no gleam even with the hero standing on one.

**`movement.test.ts`**

- T-MOVE-1 `stepCompanion` with `opts.goal` eases toward the goal, not toward the hero's tail, and does **not** apply the `COMPANION_MIN_GAP` crowding correction.
- T-MOVE-2 Without `opts.goal`, behaviour is byte-identical to today.

**`render-settings.test.ts`**

- T-RS-1 `travelStyle` is `"instant"` for `reducedMotion` and `"ride"` for `lowStimulus` alone — the mute-not-empty rule, asserted.

**`realm-shell.test.tsx`** (jsdom; the scene is mocked as it already is)

- T-SHELL-1 The sheet renders five rows at full depth and one at simple depth.
- T-SHELL-2 `fewerChoices` forces the single row at full depth.
- T-SHELL-3 The lap warning line appears only while a lap is running.
- T-SHELL-4 Preview never opens the sheet and never calls `recordDistrictVisits`.
- T-SHELL-5 `Escape` closes the sheet; `Escape` during a ride stops it.
- T-SHELL-6 A villager and a post both in reach: `Enter` talks.
- T-ECON-1 **A hero with `avatarConfig.mount: null` and `fastTravel: false` can open a villager's `DeedPanel` and finish a side quest.** Riding gates nothing.
- T-ECON-2 No travel event, ride, lap or gleam produces a ledger write. The economy still has one door.
- T-CLOCK-1 Unmounting with unwritten visits calls the flush; unmounting flushes the clock in the same cleanup.

**`world-figures.test.tsx`** — `HitchingPostFigure` draws inside the 64×64 viewBox (the existing `assertInside` pattern).

**`sprite-source.test.tsx`** — `prop:hitch` is present in `textures.world` whenever `world` is set, including under the calm palette, because the hitching post is not behind a decor flag.

### 7.2 The browser pass (the real acceptance gate)

On the documented port-3100 setup (`reference_local_screenshot_setup.md`):

1. **The stopwatch.** Ride Scholars' Row → Watch Hill (the longest route, 58 units) on a Donkey, then on a Wyrm. Confirm **6.5 s** and **4.0 s** within 0.5 s of the sheet's own quote. This is the whole claim of §3.3, and it either survives contact with a real frame loop or `TRAVEL_CANTER` changes.
2. **Twenty arrivals.** A dev harness rides all 20 ordered district pairs and asserts the hero is never inside a collider and never further than `POST_APRON + 0.5` from the far post.
3. **The interrupt.** Start the longest ride, jam the stick at four different moments, and confirm the hero pulls up on the road within half a second every time, still mounted.
4. **The dog.** Stand at the gate with an objective on Watch Hill and watch the companion route down the road, arrive, and stand there. Then walk to the Village Well and watch it come back to heel. Same-framing screenshots before and after.
5. **Reduced motion.** Toggle it and confirm the ride becomes an instant arrival with no camera movement and the message still lands.
6. **Low stimulus.** Confirm the posts are still there, the ride still plays, and only the camera move and the gold styling are gone.
7. **Touch.** On a phone: tap a post, tap a row, tap Stop. Then hold the mount slot. Confirm no target under 56px and no horizontal scroll.
8. **First paint.** Record the before/after first-paint number for the extra kind and write it into the implementation plan. If it is not ≤8 ms, say so.

Scene files cannot be unit-tested. Everything in §3.1 is pure and colocated precisely so the only thing left for the browser is the thing a browser is actually needed for.

---

## 8. Interfaces

### Produces

**Module `src/lib/realm/travel.ts`**

```
TRAVEL_CANTER = 2.2
TRAVEL_LEAD_IN_S = 0.25
HITCH_RADIUS = 3
TRAVEL_WAYPOINT_MAX = 4
POST_APRON = 1.5
TRAVEL_ARRIVE_RADIUS = 0.35
TRAVEL_ZOOM = 44

type MountingPost = { districtId: DistrictId; label: string; position: Vec2; facing: Facing }
type TravelReason = "no_mount" | "away_from_post" | "not_unlocked" | "already_here" | "no_route" | "busy"
type TravelCheck = { ok: true; post: MountingPost } | { ok: false; reason: TravelReason }
type TravelHero = { position: Vec2; mounted: boolean }
type TravelContext = { hero: TravelHero; unlocked: DistrictId[]; busy: boolean; hasMount: boolean }
type TravelDestination = { districtId: DistrictId; label: string; state: "ready" | "here" | "locked" | "unreachable"; seconds: number | null; words: string | null }
type RouteRun = { route: Vec2[]; index: number }
type RouteStep = { run: RouteRun; position: Vec2; facing: Facing; done: boolean; waypoint: boolean }
type TravelRun = { to: DistrictId; label: string; route: RouteRun; speed: number; elapsed: number; cancelling: boolean }

hitchingPosts(): MountingPost[]
nearestPost(hero: Vec2, posts: MountingPost[]): MountingPost | null
travelRoute(from: Vec2, to: DistrictId): Vec2[]
routeLength(route: Vec2[]): number
travelSpeed(mountSpeed: number): number
travelSeconds(route: Vec2[], speed: number): number
travelEstimate(route: Vec2[], speed: number): number
travelWords(seconds: number): string
canTravel(context: TravelContext): TravelCheck
canTravelTo(context: TravelContext, to: DistrictId): TravelCheck
travelDestinations(context: TravelContext, mountSpeed: number): TravelDestination[]
stepAlongRoute(run: RouteRun, from: Vec2, dt: number, speed: number): RouteStep
startTravel(post: MountingPost, to: DistrictId, context: TravelContext, mountSpeed: number): TravelRun | null
stepTravel(run: TravelRun, from: Vec2, dt: number): { run: TravelRun; position: Vec2; facing: Facing; done: boolean }
requestStop(run: TravelRun): TravelRun
arrivalPoint(post: MountingPost, layout: WorldLayout, colliders: Prop[]): Vec2
```

**Module `src/lib/realm/companion.ts`**

```
COMPANION_LEAD_MIN = 6
COMPANION_LEAD_HYSTERESIS = 1.5
COMPANION_SIT_RANGE = 3
COMPANION_SNIFF_RANGE = 14
COMPANION_TROUBLE_RANGE = 10
COMPANION_LEAD_SPEED = 4.025
COMPANION_ARRIVE_RADIUS = 0.4

type CompanionMode = "heel" | "lead" | "sit" | "sniff"
type CompanionGoal = { mode: CompanionMode; point: Vec2 | null; routed: boolean }
type CompanionInput = { hero: Vec2; companion: Vec2; mode: CompanionMode; objective: Vec2 | null; doorInReach: Vec2 | null; gleams: Vec2[]; troubles: Vec2[]; surfaces: Surfaces; fewerChoices: boolean; travelling: boolean }

companionGoal(input: CompanionInput): CompanionGoal
```

**Module `src/lib/realm/districts.ts`**

```
type UnlockInput = { visited: DistrictId[]; buildings: SiteProgress[]; districts: District[]; objectiveDistrictId: DistrictId | null; gateDistrictId: DistrictId }

parseDistrictsVisited(raw: string | null): DistrictId[]
serializeDistrictsVisited(ids: DistrictId[]): string
markVisited(visited: DistrictId[], id: DistrictId): DistrictId[] | null
districtsUnlocked(input: UnlockInput): DistrictId[]
```

**Changed exports**

```
src/lib/realm/movement.ts
  stepCompanion(companion, hero, dt, opts: { gap?: number; speed?: number; goal?: Vec2 }): CompanionState

src/lib/realm/render-settings.ts
  RenderSettings.travelStyle: "ride" | "instant"

src/lib/realm/recess/recess.ts
  RecessState.bestMountedLapMs: number | null
  RecessState.mountedThisLap: boolean
  RecessEvent lap variant gains  mounted: boolean
  stepRecess(state, hero, now, opts: { mounted?: boolean; travelling?: boolean }): { state; events }
  voidLap(state: RecessState): RecessState

src/lib/realm/layout.ts
  PropKind gains  "hitch"   (the FULL accumulated union after this slice:
                 "castle"|"building"|"foundation"|"path"|"villager"|"barrier"|"banner"|
                 "water"|"scenery"|"sign"|"landmark"|"hitch")
  spriteSizeFor  gains a "post" case → { w: 0.8, h: 1.6 }

src/lib/actions/realm.ts
  RealmBundle.districtsVisited: string[]
```

**Server action `src/lib/actions/realm-travel.ts`**

```
recordDistrictVisits(childId: string, districtIds: string[]): Promise<{ visited: string[] }>
```

**Schema / migration**

```
table  realm_settings
column districts_visited   TEXT   nullable, no default, JSON array of district ids
migration number assigned by drizzle-kit at build time
```

**Scene props added to `RealmSceneProps` (`src/components/realm/realm-scene.tsx`)**

```
travelRef: RefObject<TravelRequest | null>
onTravelEvent: (e: TravelEvent) => void
postId: string | null
onPostChange: (districtId: string | null) => void

type TravelRequest = { to: DistrictId } | { stop: true }
type TravelEvent = { kind: "start"; to: DistrictId; label: string } | { kind: "arrive"; to: DistrictId; label: string } | { kind: "stopped" }
```

**Components**

```
src/components/realm/travel-sheet.tsx
  TravelSheet({ destinations, single, lapRunning, mountLabel, plain, hudScale, onPick, onDismount, onClose })
src/components/realm/world-figures.tsx
  HitchingPostFigure()            data-figure="prop" data-figure-id="hitch"   catalog key "prop:hitch"
                                  (one FIGURE_CATALOG row; no spriteSizeFor case)
```

**CSS classes**

```
.realm-travel  .realm-travel--single  .realm-travel--plain
.realm-travel-title  .realm-travel-sub  .realm-travel-lap  .realm-travel-list
.realm-travel-row  .realm-travel-row--here  .realm-travel-row--locked
.realm-travel-name  .realm-travel-time  .realm-travel-actions  .realm-travel-cancel
.realm-ride-banner  .realm-ride-stop  .realm-post-bubble
```

**Sound cue names reserved for slice 9**

```
travelStart   travelArrive   travelStop   companionPoint
// camelCase, matching slice 9's CueId union, which carries all four with authored tone rows.
// A reserved id with no CUES row is a test failure there, so none of these is a silent promise.
```

**Routes** — none. This slice adds no page and no navigation. It is entirely inside the walled garden.

### Consumes

**From slice 1 `first-impression`**

```
src/lib/realm/depth.ts
  surfacesFor(depth: Depth, profile: LearningProfile): Surfaces
  Surfaces.fastTravel: boolean        ← published by slice 1's closed thirteen-field table; first consumer here
  Surfaces.troubleDetail: boolean     ← gates the companion's trouble break-off
// This slice adds NOTHING to depth.ts. Slice 1's table is closed before slice 1 is built.
Prop.focus  on the layout (the objective site) — read by companionGoal, never a new scene prop
realm-messages.tsx  centred message lane + aria-live region
camera.ts  edgeArrow(camTarget, target, viewport)
the useEffect cleanup that calls clock.flushPending()
```

**From slice 2 `sprite-budget-and-gallery`**

```
the parallelised, warm, kind-keyed raster cache   (the post joins the same batch)
the derived raster scale                          (the post is scaled by it, not by a constant)
/dev/figures                                      (the post is reviewed there before it ships)
```

**From slice 3 `ability-bar-and-mount-slot`**

```
the mount slot component and its keycap M
--realm-bar-height, --realm-bar-bottom, --realm-hud-scale
the mount picker over bundle.mounts.unlocked
```
Two props are added to slice 3's mount slot by this slice: `atPost: boolean` and `onHold: (() => void) | null`.

**From slice 4 `village-ground`**

```
src/lib/realm/village.ts
  DISTRICTS: District[]
  District = { id: DistrictId; label: string; entrance: Vec2; centre: Vec2; buildingIds: string[] }
  DistrictId
  DISTRICTS, District.entrance, District.entranceFacing, District.label, districtAt(p)
  routeBetween(from: Vec2, to: Vec2): Vec2[]      ← NOT roadPath, which takes node ids
  WORLD_SIZE = 64                                  ← NOT VILLAGE_SIZE
  CAMERA_ZOOM = 64                                 ← NOT VILLAGE_CAMERA_ZOOM
src/lib/realm/open-ground.ts
  SPAWN_ZONES
  isOpenGround(p, layout, rules, hero?) and openPointInZone(zone, layout, seed, rules, hero?)
                                                   ← NOT openGroundNear; arrivalPoint composes these two
the road-corridor invariant (no solid's footprint grown by HERO_RADIUS intersects a corridor)
```

The **eight** district labels this spec's copy is written against are `DISTRICTS[].label` from slice 4, verbatim: `the Gate Quarter`, `Scholars' Row`, `the Market Plaza`, `Chapel Hill`, `the Millrace`, `the Garden Terrace`, `the Keep Approach`, `Watch Hill`. Every string in §3.7 interpolates `{districtLabel}` from that field — never from slice 5's `DISTRICT_SIGN_COPY`, which carries the *carved* name for a wooden board and is a different string for a different surface. `travel.test.ts` regenerates §3.2's and §3.3's tables from the real graph, so a coordinate that drifts at build time moves the printed seconds with it.

**From slice 6 `doors-and-the-tavern`**

```
the door list on the layout (position + reach), for CompanionInput.doorInReach
```

**Existing code**

```
src/lib/utils/avatar-catalog.ts     MOUNTS, MountItem.speed, findMount
src/lib/realm/movement.ts           HERO_SPEED, HERO_RADIUS, unstickHero, setMounted, toggleMount, COMPANION_GAP_MOUNTED
src/lib/realm/recess/recess.ts      formatLap
// LAP_WAYPOINTS, LAP_START and WAYPOINT_RADIUS are GONE — slice 4 deleted them and laid the
// course as COURSE_NODES / COURSE_START (slice 4 §3.8). Slice 12 owns the LapCourse object built
// from them. This slice imports neither; it only voids a lap and flags it mounted.
src/lib/utils/speech.ts             speak
src/lib/utils/side-quest-copy.ts    SIDE_QUEST_LOWER
src/lib/services/realm-play.ts      loadRealmSettings  (one extra column, no new round trip)
src/lib/auth/access.ts              requireChildAccess
```

---

## 9. Out of scope

| Left out | Whose slice |
|---|---|
| Persisting best lap on foot, best lap riding, lifetime gleams and lap counts. This slice splits them in memory and defines the two record names; nothing is written to the server. | **slice 12 `recess-that-counts`** |
| The lap course itself. Slice 4 laid it on the road as `COURSE_NODES` (128 units, 36.6 s); slice 12 builds the `LapCourse` object, the lit posts, the arch and the persisted records. This slice adds only the two fairness rulings below. | **slice 4** (the course) and **slice 12** (everything else) |
| Trouble names, threat plates, hit feedback, and minutes earned from clearing troubles. This slice only rules that troubles cannot stop a ride (§5.4). | **slice 8 `troubles-that-read-and-pay`** |
| Sound. Four cue names are reserved and none is implemented; every cue already has a written message so nothing is motion- or sound-only. | **slice 9 `sound-and-first-five-minutes`** |
| Teaching riding and fast travel to a new player, and the ceremony that flips `fastTravel` on. This slice ships the surface; the tutorial is what turns it on. | **slice 9** |
| The mount slot's visual design, the empty-but-present socket, the in-bar mount picker, `--realm-bar-height`. | **slice 3 `ability-bar-and-mount-slot`** |
| The district plan, the road graph, `roadPath()`, `open-ground.ts`, the wall, the gate, the 64-unit camera reframe. Consumed here, built there. | **slice 4 `village-ground`** |
| Props, stalls, signs, the palette module, and the calm mode that mutes rather than empties (this slice fixes only the post's own instance of that bug). | **slice 5 `village-life`** |
| The door list, the Tavern building, the sibling board. The companion's `sit` mode consumes doors and does nothing without them. | **slice 6 `doors-and-the-tavern`** |
| Redrawing the companion, the mount, or the post in 3/4 isometric. `HitchingPostFigure` here is a working figure at the slice-2 scale ladder, reviewed in `/dev/figures`, and redrawn with everything else. | **slice 11 `building-redraw`** |
| The session report counting rides, and any attribution of a lap record to a named child. | **slice 13 `record-of-the-work`** |
| Fast travel to a *door* rather than a district; a map screen; a minimap; waypoint pinning. Districts are the granularity, and a map screen is a HUD answer to a question the world should answer. Not planned in this programme. | — |
| Mounted combat, mount stamina, mount feeding, a mount roster page, mount stats beyond `speed`, mount-only terrain. Deliberately declined: every one of them is a new mechanic, and the brief's direction is that we make existing mechanics readable. | — |
| A companion that fights, carries, fetches or talks. It is a marker. Giving it a second job would make the first one ambiguous, and the first one is the one decision 5 asked for. | — |

### The companion's place on the bar — decided here, not deferred

Slice 3 reserved the seam (`.realm-bar-tail`, beside the mount slot) and declined to fill it, correctly: "giving it a socket before it has a job would be a second empty promise on the same bar." This slice gives it a job, so the question comes due, and the answer is **yes, it gets a slot** — one 56-px square in `.realm-bar-tail`, after the mount slot, sharing every rule the mount slot already has:

- **Present but empty** when the hero has no companion, with the same recessed silhouette and the same `No companions yet. Keep going to earn one.` grammar as the mount slot's empty state. A child with no companion is told one exists to be earned; they are not shown nothing.
- **No keycap and no tap-to-act.** The mount slot is a control; the companion slot is a **readout**. Tapping it does nothing, because the companion has nothing a child commands — it goes where the game is pointing, which is the whole design. Making it tappable would promise a command that does not exist, which is the failure this programme is named after.
- **Caption = the mode, in child words**, from `companionGoal(input).mode`, so the slot is the one place on screen that says what the animal is doing and why: `Heeling` / `Leading` / `Waiting` / `Sniffing`. Full depth only; at simple depth the caption is the companion's name alone.
- `aria-label`: `{companionName}, {caption lowercased}` — e.g. `Pip, leading`.

That is four strings and one component that reuses `.realm-slot--mount`'s CSS wholesale. It closes decision 5's second half — "the companion needs an answer too" — with an answer a child can see from outside the world, rather than one that is only visible if they happen to look at the dog.
