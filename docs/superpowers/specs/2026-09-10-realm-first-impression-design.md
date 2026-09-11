# It's a game now

**Date:** 2026-09-10
**Status:** Design spec. Complete and buildable. The implementation plan is written at build time, per decision 1.
**Programme:** [The Realm: Presentation Overhaul](./2026-09-10-realm-presentation-overhaul-brief.md), slice **1 of 13** (`first-impression`, large).
**Depends on:** nothing. This slice stands alone and ships first.
**Depended on by:** every other slice. `sprite-budget-and-gallery` (2), `ability-bar-and-mount-slot` (3), `village-ground` (4), `sound-and-first-five-minutes` (9) and `plots-signs-and-the-keep` (10) name it directly; all thirteen consume `src/lib/realm/depth.ts`.
**Decisions applied:** D7 (the complexity axis — the contract module and the `depth_override` escape hatch ship here), D3 (combat stakes — the false help-card promise is deleted here; the true one is written in slice 8), D1 (process — this spec is written most literally, because this is the slice that re-earns the user's patience).

---

## 1. Why — the complaints and the findings this answers

### The verdict clauses this slice owns

> **this doesnt feel like a well thought out game at all**

> **there should be an indicator over or under the character**

> **names over NPCs**

> **no starting quest**

> **no quest log or tracking**

> **messages are left aligned rather than centered which is no good**

> **i dont like the location of the mana or player name/health**

### The audit findings, quoted

**"there should be an indicator over or under the character"** — _blocking, medium effort_

> The hero and the eight villagers are literally the same art asset pipeline at the same pixel size, and the hero carries no distinguishing mark of any kind. […] A brand-new hero with the default look — blue tunic #3b82f6, pants, leather boots — stands next to Old Bram in a blue tunic #5b8fb9, pants, leather boots (villagers.ts:10-11, 16). They are the same figure.

**implied — "the world still looks pretty rough", "doesnt feel like a well thought out game"** — _major, small effort_

> Nothing in the Realm casts a shadow or has ground contact. […] Worse, the hero and the companion are permanently airborne by a sine: `bob = Math.sin(elapsedTime * 3) * 0.05` is computed once per frame (realm-scene.tsx:177) and added to the hero's y (line 187) and to the companion's at half amplitude (line 197) whether or not anyone is moving. […] Critically the shadow must NOT take the bob — it stays at the figure's true ground x/z while the sprite bobs above it, which is what converts "floating" into "hopping".

**implied — the player cannot tell where their character is pointing** — _major, medium effort_

> `facingFrom()` returns n/s/e/w properly (movement.ts:30-34) and the state carries it (movement.ts:11), but the renderer only ever mirrors on west: `flip = facing === "w" ? -SPRITE_W : SPRITE_W` (realm-scene.tsx:180). So facing "n", "s" and "e" all draw the exact same unmirrored front-facing pose […] *Fix:* put the facing tell in the marker, not the figure. Make the ground ring from finding 1 a ring with a notch/arrowhead.

**"names over NPCs"** — _blocking, medium effort_

> No villager is named anywhere in the 3D world — and the name is already computed and then thrown on the floor. `buildWorldLayout` pushes a real prop for every villager carrying the name […] (layout.ts:168). The scene never renders props of kind "villager": the `standing` filter takes only castle/building/decor/barrier (realm-scene.tsx:243) […] The pipeline for nameplates is complete end to end and is dropped one filter before the screen. There is a passing test asserting the named prop exists (layout.test.ts:52-56), which makes it look implemented when nothing draws it.

**"names over NPCs" (the availability half: which of these people has work for me)** — _major, medium effort_

> Nothing distinguishes a villager who has deeds to give from one whose building is finished, and the data to do it is already sitting in client state one component away. The shell holds `kingdom.buildings` […] (realm-shell.tsx:162; deeds.ts:11-15) and passes exactly none of it to the scene […] This is the single change that most makes the field read as a quest world rather than a lawn.

**implied — approach to villagers** — _major, medium effort_

> the render is all-or-nothing — the entire bubble, a full greeting paragraph up to 16rem wide plus a 44px Talk button, pops into existence at 2.5 units and vanishes at 2.5 units (realm-scene.tsx:360-374 […]). At HERO_SPEED 3.5 […] the hero crosses the whole 5-unit reach zone in about 1.4 seconds, so the bubble flickers on and off while walking past. […] The reward for pressing Talk is also anticlimactic: the bubble shows villager.greeting (realm-scene.tsx:370) and the SiteCard that opens shows the identical sentence again (site-card.tsx:59).

**implied — a child's first instinct is to tap the person** — _major, small effort_

> Villagers are not clickable. The villager `<sprite>` elements carry no pointer handlers at all (realm-scene.tsx:331-342). A tap on a villager raycasts the sprite, finds no handler, and propagates to the ground plane behind it, whose `onPointerDown` calls `setTarget` and walks the hero (realm-scene.tsx:253-263).

**implied — accessibility of the reach/talk moment** — _minor, small effort_

> Entering a villager's reach is announced to nobody. […] `RealmHud` never receives it […] and the aria-live notice paragraph (realm-hud.tsx:117) is never set on reach. […] A hero using read-aloud gets no signal that a person is standing next to them.

**implied — names over NPCs (correctness of the reach system)** — _minor, small effort_

> A villager whose sprite failed to rasterise still triggers a talk bubble over empty grass. The scene bails on rendering when the texture is missing — `if (!texture) return null` (realm-scene.tsx:328-329) — but `layout.villagers` still contains that placement, so `nearestVillager` (line 206) reports reach for the invisible person […] SpriteSource silently `continue`s past any villager whose SVG it cannot find (sprite-source.tsx:105-109), so this is a reachable state, not a theoretical one.

**"no starting quest"** — _blocking, medium effort_

> There is no first objective and no sequence of any kind. `buildWorldLayout` places all eight foundations and all eight villagers at once, in a fixed loop over BUILDINGS (layout.ts:153-171), each with an identical grey foundation […] Notably the 2D Side Quests page DOES have an ordering rule — deed-picker.tsx:20-22, 'Work in progress leads, untouched buildings follow, finished ones rest at the end' — and the 3D world, which needs it far more, does not use it.

**"no quest log or tracking"** — _blocking, medium effort_

> There is no objective tracker of any kind in the world, and the data for one is already sitting in memory unused. […] None of it is passed to `RealmHud` — look at the prop list at realm-shell.tsx:517-543 […] No buildings, no progress, no 'what should I do next'. […] A child dropped into the field has no way to answer 'what am I here to do' without touring the map.

**"messages are left aligned rather than centered which is no good"** — _blocking, small effort_

> Every message type is a block-level `<p>` inside `.realm-hud`, which is stretched `left: 0.75rem; right: 0.75rem` across the entire viewport (globals.css:1704). None of the message rules sets `text-align` […] There are SEVEN of these paragraphs stacked in source order […] In a bad moment (ceremony running, kingdom load failed, one minute left) four bands stack down the top-left of the screen. This is also where the crown ceremony's narration lands (`notice={ceremonyNoticeText ?? notice}`, realm-shell.tsx:531) — the emotional payoff of a whole season reads as a small left-aligned line in the corner while the ceremony plays centre-screen.

**"i dont like the location of the mana or player name/health"** — _blocking, medium effort_

> (1) POSITION: the camera keeps the hero at screen centre, but the name and mana bar sit in the top-left corner […] (2) WRONG RESOURCE FEATURED: mana is `MANA_MAX = 100` regenerating at `MANA_REGEN_PER_S = 5` […] against a cheapest spell cost of 10 and a dearest of 45 […] Mana is full within 2-9 seconds of any cast and effectively never gates play, yet it gets a 7rem bar in prime real estate.

**implied — HUD grouping** — _major, medium effort_

> The HUD is one wrapping flex row holding up to thirteen heterogeneous items with a uniform `gap: .75rem` and no grouping […] Identity, a session timer, a resource meter, three scores, two action buttons, a badge and a navigation link are all peers at the same weight in the same corner.

**implied — the HUD eats taps** — _major, small effort_

> `.realm-hud` correctly sets `pointer-events: none`, but the very next rule turns every direct child back on: `.realm-hud > * { pointer-events: auto }` (globals.css:1705). `.realm-hud-row` is a direct child and a full-width block, so the entire top band is click-blocking even where there are no chips […] The redundant `.realm-hud-row > * { pointer-events: auto }` at globals.css:1707 shows the author intended the row itself to be pass-through; rule 1705 defeats it. On a phone with a wrapped 3-row HUD plus a toast showing, roughly the top quarter of the world is dead to touch.

**"no quest log or tracking" (the fake scoreboard)** — _major, medium effort_

> The three numbers that look like tracking are per-visit `useState` and are never persisted or read back: `cleared` (realm-shell.tsx:170 […]) and `recess` gleams/laps/bestLap (realm-shell.tsx:173 […]). […] The moment the child follows 'Leave the Realm' the whole `RealmOpen` tree unmounts and all three reset to zero […] A child who beats their best lap loses it by walking to the Spellbook.

**"i dont like the location of the mana or player name/health"** — _minor, small effort_

> The hero name is bare white text with no plate and no shadow: `.realm-hud-name { font-weight: 700 }` inheriting `color: #fff` from `.realm-hud` (globals.css:1704,1708). Every other chip in the row has a translucent pill behind it […] so the name is the least legible thing in the row despite being the identity anchor — and it sits over `#2e5a3a` grass.

**Not complained about yet, but will be** (the largerText hole)

> The world's only text is 11px and is deliberately excluded from the larger-text accessibility setting — globals.css:237-245 scopes `data-larger-text` to `.realm-panel` only […] So a hero who needs larger text gets a 1.25x HUD and 1.125x dialogs and an unchanged 11px world label.

**"no tutorial"** (the clause this slice deletes, D3)

> Worse, the Cast group promises something untrue: 'Clear troubles to protect the sites' (realm-help.tsx:26-27) — nothing a trouble does touches a site or a building.

**Q7, the decision that becomes this slice's contract**

> This brief is tuned for the youngest — pips instead of numbers, one objective at a time, a bobbing gold marker, a guided first five minutes. A thirteen-year-old may find that patronising and simply not come back.

### Two findings this slice picks up that the draft put later

**The clock leak.** `usePlayClock` exposes `flushPending` and exactly one caller uses it — the HUD's Try-again button (realm-shell.tsx:543). Nothing runs it on unmount, so `secondsThisMinute` (0-59 s of real, visible, already-played time) is discarded every time the tree unmounts, and any minute that was mid-flight or had failed to record goes with it. A child who bounces out of the Realm every 50 seconds plays forever for free. The leak is live today and does not need the doors slice.

**The single notice slot.** `notice={ceremonyNoticeText ?? notice}` (realm-shell.tsx:532) is not a display bug, it is a state bug: ceremony narration and ordinary spell notices occupy one string, so each erases the other. Centring a lane fed by one string still drops messages; it just drops them in the middle.

---

## 2. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1.1 | How does a child tell which figure is theirs? | A gold ground ring with a facing notch, permanently under the hero, plus a contact shadow no other figure's marker shares. | The hero and the villagers are the same asset at the same size (audit). A ring under the feet reads at any zoom and costs no art. |
| D1.2 | Four-direction art? | No. The facing tell goes in the ring's notch, rotated from `hero.facing`. | Four poses means new art for every outfit, hair and boot layer in `avatar.tsx`. The ring is 12 lines and works today. |
| D1.3 | Do shadows bob? | No. The shadow stays at the figure's true ground x/z while the sprite rises. | This one detail converts "floating" into "hopping". |
| D1.4 | Shadow shape? | A flat 4-segment circle (a diamond) scaled to the prop's `size.w × size.d`. | A building's shadow must be its footprint, not a bar. |
| D2.1 | Where do villager nameplates come from? | The label `layout.ts:168` already builds, rendered as a drei `<Html>` child of a new per-villager `<group>`. | The pipeline is complete and dropped one filter before the screen. |
| D2.2 | How do plates survive the crown ceremony? | Each villager becomes a `<group>` holding sprite + plate + shadow; the ceremony moves the **group**, not the sprite. | `stepCeremony` writes into `villagerSprites.current` while `layout.villagers[].position` stays at the site (realm-scene.tsx:139-146). Moving the group makes every attachment follow for free and needs no change to `ceremony.ts`. |
| D2.3 | A villager whose sprite failed to rasterise? | Filtered out of plates **and** `nearestVillager` by one shared `useMemo`. | Otherwise a Talk bubble floats over bare grass (sprite-source.tsx:104-109 silently continues). |
| D3.1 | Are markers sprites or DOM? | **DOM.** The `!` and the `✓` are part of the nameplate. | The camera is orthographic — a sprite and an `<Html>` pill are the same size at any distance — so DOM costs zero new rasterised kinds and inherits `largerText` for free. |
| D3.2 | Is there a world-space cue that survives a DOM failure? | Yes: the beacon over the objective site is scene **geometry**, not a sprite and not DOM. | A gold column reads across the field and costs no texture. |
| D4.1 | Where does the starting objective come from? | New pure `src/lib/realm/objective.ts`, using the rank already written at deed-picker.tsx:20-22, with `deed-picker` importing it. | The Side Quests page and the world can then never disagree. A brand-new hero always gets the well. |
| D4.2 | Where does the result live? | On the `layout` object, as per-prop `focus` and per-villager `status`. | `layout` is already `useMemo`'d on `kingdom.buildings`, so the `World` memo — which is shielding the scene from ~5 re-renders/second of `setMana` — stays intact for free. |
| D5.1 | One message lane or two? | **Two lanes, one message each**, under one written priority order. | A strict single chain lets the persistent one-minute banner mute every toast and notice for the child's last minute of play — exactly when the rise toast matters most. Stated and justified in §3.6. |
| D5.2 | How is the notice/ceremony collision fixed? | `RealmMessages` receives `ceremonyNotice` and `notice` as **separate** props; the pure picker decides. `notice={ceremonyNoticeText ?? notice}` is deleted. | Fix the state, not the CSS. |
| D6.1 | What leaves the corner? | The mana meter, `Cleared`, `Gleams`, `Laps/Best`, and the Ride button. | Mana never gates play; the other three are per-visit `useState` that reset on navigate — a scoreboard that lies. |
| D6.2 | Where does mana go in the interim? | A pip strip pinned above the spell bar, plus a slot shake (and a non-motion substitute) on refusal. | Cost and resource must read together. Slice 3 gives it its permanent home on the bar's top edge. |
| D6.3 | Where does Ride go in the interim? | A round button at the **bottom-right, beside the ability bar** — the exact place slice 3's mount slot will occupy. | Deleting it outright would leave touch heroes with no way to mount at all (only the `M` key). Nothing moves twice. |
| D6.4 | What happens to Gleams / Laps / Best lap? | Gleams and laps collapse into one recess-only pill while recess is running. **Best lap is deleted.** | A best lap that resets when the child walks to the Spellbook is a lie. Slice 12 persists it and brings it back as a record. |
| D7.1 | Does the complexity axis get its own slice? | No. `depth.ts` + `depth_override` ship here; each surface unlocks in the slice that builds it; the flip becomes a visible ceremony in slice 9. | A contract is a 60-line pure module with a test, not a slice — and a late axis would mean eight slices of hardcoded simple view and then a rewrite of nine surfaces. |
| D7.2 | What decides depth before the tutorial exists? | `tutorialComplete: bundle.helpSeen` — the one-shot help card is today's tutorial. Slice 9 swaps the input for the real `tutorialStep` and adds the flip ceremony. | A returning hero gets the full view immediately; a brand-new hero gets the simple one. Nobody is demoted later. |
| D7.3 | Where does a thirteen-year-old escape? | A **Show me everything** control at the foot of the how-to-play card (which is the gate a new hero passes through today), plus a three-way parent control in the Realm settings panel. | The tutorial gate does not exist until slice 9; the control moves onto it then. |
| D7.4 | May a child write `depth_override`? | Yes, through a new narrow action `setRealmDepth`, which writes that one validated column and nothing else. `updateRealmSettings` (parent-only) stays parent-only. | Depth changes presentation only — never access, minutes, tone or content. |
| D8.1 | Does the false help-card promise get replaced or deleted? | **Deleted.** The card says nothing about stakes until slice 8 makes clearing pay. | No string may promise something the code does not do. Half a truth beats a whole lie. |
| D9.1 | Does the clock leak get fixed here? | Yes. `flushPending()` on unmount, plus a written half-up rule for the sub-minute remainder. | `flushPending` alone rescues only whole pending minutes; the 0-59 s remainder is the actual free-play leak. §3.9. |
| D10.1 | Does the pointer-events fix live in CSS? | The mechanism is CSS; the three load-bearing `pointer-events` values are set **inline** so a jsdom test can read them. | jsdom does not parse `globals.css`, and this property is the difference between a world that responds to taps and one that ignores them. |

---

## 3. Design

### 3.0 The shape of the change

```
src/lib/realm/depth.ts           NEW  the complexity-axis contract  (+ depth.test.ts)
src/lib/realm/objective.ts       NEW  what to do next               (+ objective.test.ts)
src/lib/realm/markers.ts         NEW  rings, shadows, marker kinds  (+ markers.test.ts)
src/lib/realm/messages.ts        NEW  message priority, two lanes   (+ messages.test.ts)
src/lib/realm/camera.ts          EDIT worldToScreen + edgeArrow     (camera.test.ts extended)
src/lib/realm/layout.ts          EDIT focus / status on the layout  (layout.test.ts extended)
src/lib/realm/play-clock.ts      EDIT minutesToSettle               (play-clock.test.ts extended)
src/lib/realm/recess/hud.ts      EDIT recessPillText                (hud.test.ts extended)
src/lib/utils/realm-settings.ts  EDIT depthOverride
src/lib/actions/realm-settings.ts EDIT setRealmDepth
src/lib/actions/realm.ts         EDIT bundle carries depthOverride
src/lib/db/schema.ts             EDIT realm_settings.depth_override
src/lib/db/migrations/0026_*.sql NEW

src/components/realm/realm-messages.tsx  NEW  two centred lanes
src/components/realm/villager-plate.tsx  NEW  plate + marker + shadow, one villager
src/components/realm/realm-hud.tsx       REWRITE three anchored zones, no scoreboard
src/components/realm/realm-scene.tsx     EDIT  rings, shadows, groups, taps, arrow
src/components/realm/realm-shell.tsx     EDIT  objective, depth, lanes, flush on unmount
src/components/realm/realm-help.tsx      EDIT  false clause deleted, 'Where to go', depth control
src/components/deed-picker.tsx           EDIT  imports rankBuildings
src/app/globals.css                      EDIT  zones, lanes, plates, pointer-events, --realm-hud-scale
src/app/(app)/settings/realm-settings-panel.tsx  EDIT  parent depth control
```

Nothing under `src/lib/realm/**` imports three at module load. `camera.ts`, `markers.ts` and `messages.ts` are arithmetic and strings only; the scene reads them.

---

### 3.1 `depth.ts` — the complexity-axis contract

The one answer twelve later specs consume instead of inventing nine.

```ts
// src/lib/realm/depth.ts
import type { LearningProfile } from "@/lib/utils/learning-profile";

export type RealmDepth = "simple" | "full";
export type DepthOverride = "auto" | "simple" | "full";
export const DEPTH_OVERRIDES: DepthOverride[] = ["auto", "simple", "full"];
export const DEFAULT_DEPTH_OVERRIDE: DepthOverride = "auto";

/**
 * What each surface shows. This is the **whole** contract: every field any of the thirteen
 * slices reads is declared here, once, in one vocabulary. No later spec adds a field, and no
 * later spec invents a local rule. A slice that wants a new surface amends this type and this
 * table in slice 1's spec first.
 */
export type Surfaces = {
  /** false → pips (●●○○○), true → numerals. One vocabulary for progress, mana, signs and laps. */
  numerals: boolean;
  /** How many objectives the card tracks at once. Capped at 1 by `fewerChoices` at both depths. */
  trackedObjectives: number;
  /** Which spell pages the ability bar contains. */
  abilitySlots: "earned" | "all";
  /** Whether number keycaps are drawn on the ability bar's slots. */
  keycapHints: boolean;
  /** Rows a list shows before it collapses the rest behind "and N more". Capped at 3 by `fewerChoices`. */
  listRows: number;
  /** false → a district announces its name alone; true → its name and what stands in it. */
  districtDetail: boolean;
  /** Whether the hitching-post sheet offers every unlocked district or only the objective's. */
  fastTravel: boolean;
  /** false → a trouble's plate is the ⚠ glyph; true → it carries the name from TROUBLE_COPY. */
  troubleNames: boolean;
  /** Per-trouble detail: the companion's trouble break-off, the plate's second line. */
  troubleDetail: boolean;
  /** The damage pip row on a plate for kinds with maxHits > 1. */
  troubleHitPips: boolean;
  /** The running `Cleared 4` chip on the ability bar's status row. */
  clearCount: boolean;
  /** Whether the clock's accessible text names bonus minutes as a separate source. */
  bountyLedgerLine: boolean;
  /** Whether lap times are shown as times rather than as "a new best". */
  lapTimes: boolean;
};

export function isDepthOverride(value: unknown): value is DepthOverride;

/** `auto` follows the tutorial; an explicit override always wins. */
export function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth;

/** The surfaces for a depth, with the profile's caps applied. */
export function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces;
```

Behaviour, exactly:

| input | `realmDepth` |
|---|---|
| `override: "simple"` | `"simple"` (whatever the tutorial says) |
| `override: "full"` | `"full"` (whatever the tutorial says) |
| `override: "auto"`, `tutorialComplete: false` | `"simple"` |
| `override: "auto"`, `tutorialComplete: true` | `"full"` |

| surface | `simple` | `full` | who reads it |
|---|---|---|---|
| `numerals` | `false` | `true` | 1 (objective card, identity plate, villager plate, mana strip), 3 (mana strip, slot costs), 10 (signboards), 12 (recess board), 13 (summary, parent panel) |
| `trackedObjectives` | `1` | `3` | 1 (objective card), 13 (summary forward hook) |
| `abilitySlots` | `"earned"` | `"all"` | 3 (the bar) |
| `keycapHints` | `false` | `true` | 3 (slot keycaps) |
| `listRows` | `3` | `8` | 6 (the Tavern panel's quest list) |
| `districtDetail` | `false` | `true` | 5 (the district arrival pill and the carved sign), 10 (signboard line 2's district clause) |
| `fastTravel` | `false` | `true` | 7 (the hitching-post sheet), 9 (the depth-open card) |
| `troubleNames` | `false` | `true` | 8 (the threat plate), 9 (tutorial step 6's noun, the depth-open card) |
| `troubleDetail` | `false` | `true` | 7 (the companion's trouble break-off), 8 (the plate's second line) |
| `troubleHitPips` | `false` | `true` | 8 (the damage pip row) |
| `clearCount` | `false` | `true` | 8 (the `Cleared 4` chip) |
| `bountyLedgerLine` | `false` | `true` | 8 (the clock's accessible text) |
| `lapTimes` | `false` | `true` | 12 (the recess board) |

**This table is closed.** Thirteen fields, thirteen consumers named. A later slice that finds it wants a fourteenth amends this section — it does not add a field to `depth.ts` on its own, and no spec in the programme carries an "if slice 1 ships without X, this slice adds it" clause. That clause is how a contract module becomes nine private rules, which is the exact failure the axis exists to prevent.

**The three invariants no spec may break.**

1. `profile.fewerChoices` caps `trackedObjectives` at `1`, `abilitySlots` at `"earned"` and `listRows` at `3` at **both** depths. `surfacesFor` applies this; nobody re-implements it.
2. **Depth is never a word or a label a child reads.** There is no "simple mode" badge, no "advanced" toggle, no depth name anywhere on screen. The child-facing control says what changes, not what it is called (§3.11).
3. Every simple-depth surface is a **substitution**, never a removal: pips replace numerals, one tracked objective replaces three, earned slots replace all slots. Nothing a child can otherwise do disappears at simple depth. A simple-depth child can still walk to any villager, talk to any of the eight, and cast any spell they own.

**Where the input comes from in slice 1.** `RealmOpen` calls `realmDepth({ tutorialComplete: bundle.helpSeen, override: bundle.depthOverride })` **once**, in a `useState` initialiser, so depth is snapshotted for the visit and no surface flips mid-play. Slice 9 replaces `bundle.helpSeen` with the real `tutorialStep === "complete"` and adds the flip ceremony; the module's signature does not change.

---

### 3.2 `objective.ts` — the starting quest, and the one rank

```ts
// src/lib/realm/objective.ts
import type { SiteProgress } from "./layout";

export type Objective = {
  buildingId: string;
  villagerId: string | null; // null only if the catalogs ever disagree
  label: string;             // "Village Well"
  villagerName: string | null; // "Old Bram"
  done: number;
  total: number;
};

export type ObjectiveState =
  | { kind: "unknown" }                        // no kingdom data: the load failed
  | { kind: "complete" }                       // every building raised
  | { kind: "next"; objectives: Objective[] }; // 1..limit, best first

/** Work in progress leads, untouched buildings follow, finished ones rest at the end. */
export function objectiveRank(b: { done: number; complete: boolean }): 0 | 1 | 2;

/** A stable sort by objectiveRank. deed-picker.tsx imports this; the two screens cannot disagree. */
export function rankBuildings<T extends { done: number; complete: boolean }>(buildings: T[]): T[];

export function objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState;

/** The single primary objective, or null. Convenience over objectiveState(buildings, 1). */
export function pickObjective(buildings: SiteProgress[]): Objective | null;

/** The rise toast, with the next objective folded in so two toasts never queue. */
export function riseToast(label: string, next: ObjectiveState): string;

/** The read-aloud line, written for speech. */
export function objectiveSpeech(state: ObjectiveState): string | null;
```

Rules:

- `objectiveState([], n)` → `{ kind: "unknown" }`. An empty `buildings` array means the kingdom failed to load, **not** that everything is built. This distinction is the reason the return type is a union rather than `Objective | null`, and it is what stops the world telling a child their kingdom is finished because the database hiccuped.
- Every building complete → `{ kind: "complete" }`.
- Otherwise: rank by `objectiveRank` (in progress `done > 0 && !complete` → 0; untouched → 1; complete → 2), tie-broken by **higher `done` first**, then by `BUILDINGS` order. Take the first `limit` non-complete buildings.
- A brand-new hero (all eight at `0 of 5`) gets `well` — first in `BUILDINGS` order. **The opening is identical every time.**
- `limit` is clamped to `1..8`.
- `deed-picker.tsx:20-22` deletes its local `rank` and calls `rankBuildings(overview.buildings)`.

`riseToast` output, verbatim:

- with a next objective: `The Village Well stands. Next: the Grain Mill, with Miller Tessa.`
- when that was the last one: `The Royal Garden stands. Every building is raised.`
- when the kingdom state is unknown: `The Village Well stands.`

`objectiveSpeech` output, verbatim:

- `next`: `Your next side quest is at the Village Well. Old Bram is waiting.`
- `complete`: `Every building is raised. Nothing is waiting.` *(interim — slice 13 replaces it; see §3.8)*
- `unknown`: `null` (nothing is spoken; the problem lane already says the villagers are resting).

---

### 3.3 `layout.ts` — focus and status ride on the layout

Two additive fields and one new input. No prop is added, moved, resized, re-kinded or made solid.

```ts
export type PropFocus = "objective" | "tracked" | "done" | null;
export type VillagerStatus = "objective" | "work" | "built";

export type Prop = { /* …unchanged… */ focus?: PropFocus };

export type VillagerPlacement = {
  id: string;
  buildingId: string;
  position: Vec2;
  status: VillagerStatus;
  label: string;   // "Village Well"
  done: number;
  total: number;
};

export function buildWorldLayout(input: {
  castleType: string;
  buildings: SiteProgress[];
  villagers?: boolean;
  banners?: number;
  decor?: boolean;
  objectiveIds?: string[]; // primary first; [] when unknown or complete
}): WorldLayout;
```

- `objectiveIds[0]` → that building's site prop gets `focus: "objective"` and its villager `status: "objective"`.
- `objectiveIds[1..]` → `focus: "tracked"`, villager `status: "work"`.
- A complete building → `focus: "done"`, villager `status: "built"`.
- Everything else → `focus: undefined`, villager `status: "work"`.

**Invariant, asserted by a test:** `buildWorldLayout` called with and without `objectiveIds` produces `props` that differ **only** in the `focus` field, and produces a byte-identical `colliders` array. `focus` never changes `kind`, `solid`, `position` or `size`. This is what keeps `spawnTroubles` (which filters `kind === "foundation"`, troubles.ts:81), the recess gleam placement and the ceremony marks unaffected by anything this slice does.

---

### 3.4 `markers.ts` — rings, shadows, and the ground ladder

```ts
// src/lib/realm/markers.ts
import type { Facing } from "./movement";
import type { Prop, VillagerStatus } from "./layout";

/** Local-Z rotation for the notched hero ring, so the notch points where the hero will walk. */
export function facingAngle(facing: Facing): number; // n:0  e:-PI/2  s:PI  w:PI/2

export const RING_INNER = 0.42;
export const RING_OUTER = 0.55;
export const RING_NOTCH_ARC = Math.PI / 3; // 60°, centred on the facing direction
export const RING_GOLD = "#c9a84c";
export const RING_CALM = "#8a7d5a";

/** The flat diamond a figure or prop drops on the ground: the footprint, never a bar. */
export function shadowFootprint(size: { w: number; d: number }): { w: number; d: number };
export const SHADOW_OPACITY = 0.22;
export const SHADOW_OPACITY_CALM = 0.14;

/** One ladder for everything that lies on the ground, so nothing hides under a path tile. */
export const GROUND_Y = {
  water: 0.02,       // slice 4's river decals — the lowest rung, under everything
  path: 0.03,        // existing: realm-scene.tsx:270
  foundation: 0.04,  // existing: realm-scene.tsx:279
  propShadow: 0.045, // buildings, castle, decor — never on a path
  lapWaypoint: 0.05, // existing: recess-layer.tsx:43
  figureShadow: 0.055,
  heroRing: 0.06,
} as const;

export type MarkerKind = "quest" | "done" | null;
export function markerFor(status: VillagerStatus): MarkerKind; // objective→"quest", built→"done", work→null

export const BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 } as const;
```

**Why the Y values are not the brief's `y=0.02`.** Path tiles sit at `y=0.03` and foundation planes at `y=0.04`. A hero walks along the path constantly and stands on foundations to talk; a ring or shadow at 0.02 would simply vanish underneath them. `figureShadow: 0.055` and `heroRing: 0.06` clear the path, the foundation and the recess waypoint disc, in that order.

**Ring geometry.** A `<group position={[p.x, GROUND_Y.heroRing, p.z]} rotation={[-Math.PI/2, 0, facingAngle(hero.facing)]}>` containing:

- `<ringGeometry args={[RING_INNER, RING_OUTER, 32, 1, Math.PI/2 + RING_NOTCH_ARC/2, Math.PI*2 - RING_NOTCH_ARC]} />` — a ring with a 60° gap. After the `-π/2` X rotation, local `+Y` maps to world `-Z` (north), so a local-Z rotation of `0` points the gap north; `facingAngle` is derived from that mapping and asserted by a test against `FACING_VEC`.
- `<circleGeometry args={[0.16, 3, Math.PI/2]} />` at local `[0, RING_OUTER + 0.06, 0]` — a small solid arrowhead filling the gap, so the cue is a positive mark and not only a hole.

Both use `meshBasicMaterial` (no lighting), colour `RING_GOLD`, `RING_CALM` under `settings.calmPalette`, `transparent`, `depthWrite={false}`. The ring is written from the same per-frame block that already positions the hero (realm-scene.tsx:178-194) and takes the hero's **true** ground position, never `bob`.

**Shadows.** One `<ContactShadow>` local component in `realm-scene.tsx`: a `circleGeometry(0.5, 4)` — a 4-segment circle is an axis-aligned diamond — rotated flat, scaled `[w, d, 1]` from `shadowFootprint`, `meshBasicMaterial` black at `SHADOW_OPACITY`, `transparent`, `depthWrite={false}`, `polygonOffset` with `polygonOffsetFactor: -1`.

Who gets one:

| figure | footprint source | y |
|---|---|---|
| hero | `{ w: 0.8, d: 0.8 }` | `figureShadow` |
| mount (while riding) | `{ w: 1.1, d: 1.1 }` | `figureShadow` |
| companion | `{ w: 0.6, d: 0.6 }` | `figureShadow` |
| each villager | `{ w: 0.8, d: 0.8 }` | `figureShadow` (inside the villager group, at local `[0, y, 0]`) |
| castle, buildings, decor, barriers | `prop.size.w × prop.size.d` | `propShadow` |
| foundations | none | — (a foundation is already a flat plane on the ground) |
| banners | none | — (a 0.12-wide pole) |

Hero, mount and companion shadows are written per frame from the true ground position; **they never take `bob`**. Villager and prop shadows are static children of their group and need no per-frame work.

**Mesh count.** 1 hero + 1 mount + 1 companion + 8 villagers + up to 21 standing props = **32 new flat meshes**, plus 2 for the ring and 2 for the beacon. All `meshBasicMaterial`, no textures, no lights, no shadow maps. See §3.13 for the budget.

---

### 3.5 `camera.ts` — the off-screen arrow

The only camera-adjacent change in this slice, and the marker layer every later camera change depends on. **No camera parameter changes here** — `CAMERA_OFFSET` and `CAMERA_ZOOM` are untouched; the reframe for a 64-unit world is slice 4's, and slice 4 depends on this arrow existing first.

```ts
export type Viewport = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };      // pixels from the viewport's top-left
export type EdgeArrow = { x: number; y: number; angle: number }; // angle in radians, 0 = right, clockwise

/** Where a ground point lands on screen, for the fixed tabletop camera. */
export function worldToScreen(camTarget: Vec2, world: Vec2, viewport: Viewport, zoom?: number): ScreenPoint;

/** Null when the target is comfortably on screen; otherwise a point on the viewport border and a heading. */
export function edgeArrow(camTarget: Vec2, target: Vec2, viewport: Viewport, opts?: { margin?: number; zoom?: number }): EdgeArrow | null;
```

The projection, derived from the fixed offset `(12, 12, 12)` looking at `(t.x, 0, t.z)` with up `(0,1,0)`:

```
right = (1, 0, -1)/√2        up = (-1, 2, -1)/√6
dx = world.x - camTarget.x   dz = world.z - camTarget.z
screenX = viewport.width/2  + zoom * (dx - dz) / √2
screenY = viewport.height/2 + zoom * (dx + dz) / √6      // y grows downward
```

`zoom` defaults to `CAMERA_ZOOM` (40): R3F's default orthographic frustum is the canvas in pixels, so `zoom` is exactly pixels-per-world-unit. `margin` defaults to `56` px (the world touch target, so the arrow never sits under a HUD zone's edge).

`edgeArrow` returns `null` when the projected point lies inside the viewport inset by `margin`. Otherwise it clamps the point to that inset rectangle and returns `angle = Math.atan2(screenY - cy, screenX - cx)`.

**How it is driven without a re-render.** `RealmScene` takes one new prop, `arrowRef: RefObject<HTMLDivElement | null>` — a ref, therefore referentially stable, therefore the `World` memo is untouched. Each frame the scene reads the focused site from `layout` (`props.find(p => p.focus === "objective")`), calls `edgeArrow(camTarget.current, site.position, state.size)` and writes `el.hidden` and `el.style.transform` directly. No `setState`, no `queueMicrotask`, no React involvement. The write is skipped when the position moved less than 0.5 px and the hidden flag has not changed.

The arrow element itself lives in the HUD layer (`RealmMessages` renders it, since that is the component that owns the non-interactive overlay), is `aria-hidden="true"` and `pointer-events: none`. It is **shown in every mode** — calm mutes it, never hides it: gold `#c9a84c` at full opacity becomes `#8a7d5a` at 0.7 opacity under `settings.calmPalette`, the same swap the ground ring takes (§6). Under `reducedMotion` it does not pulse; it is simply present at its muted-or-gold colour.

---

### 3.6 `messages.ts` and `realm-messages.tsx` — the centred lanes

**Why two lanes and not one chain.** The brief asked for one message at a time under `errors > one-minute banner > ceremony narration > toast > notice`. Implemented literally, `warning` — which stays `true` for the whole final minute of play (use-play-clock.ts sets it and only clears it above 1 minute) — would suppress every toast and every notice for that minute. The last minute of a metered session is exactly when `The Village Well stands.` matters most. So the order is kept, but split at the natural seam: **persistent problems** get a top-centre band, **things the game says** get a bottom-centre lane above the ability bar. One message in each, never a stack. Priority within each lane is the brief's order.

```ts
// src/lib/realm/messages.ts
export type ProblemKind = "spriteError" | "kingdomError" | "ceremonyError" | "lastMinute" | "preview";
export type SpeechKind = "ceremony" | "toast" | "notice";

export type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string | null };
export type RealmSpeech = { kind: SpeechKind; text: string; tone: "stage" | "cheer" | "plain" };

export type MessageInput = {
  spriteError: string;      // "" when none
  kingdomError: string;
  ceremonyError: string;
  lastMinute: boolean;
  preview: string | null;   // the parent's intro, with the gate note already appended
  ceremonyNotice: string | null;
  toast: string | null;
  notice: string | null;
  calm: boolean;            // reducedMotion || lowStimulus: a cheer becomes plain
};

export const PROBLEM_ORDER: ProblemKind[] = ["spriteError", "kingdomError", "ceremonyError", "lastMinute", "preview"];
export const SPEECH_ORDER: SpeechKind[] = ["ceremony", "toast", "notice"];

export function pickProblem(input: MessageInput): RealmProblem | null;
export function pickSpeech(input: MessageInput): RealmSpeech | null;
```

Action labels, verbatim: `spriteError` → `Try again`; `kingdomError` → `Wake the villagers`; `ceremonyError` → `Try again`; `lastMinute` and `preview` → `null`.

Tones: `ceremony` → `"stage"`; `toast` → `"cheer"`, or `"plain"` when `input.calm` (this preserves the existing `.realm-hud-toast--plain` behaviour); `notice` → `"plain"`.

`realm-messages.tsx` renders three always-mounted nodes so the live regions are stable and never remount:

```tsx
<div className="realm-messages" style={{ pointerEvents: "none" }} data-testid="realm-messages">
  <p className="realm-message realm-message--problem" role={isError ? "alert" : "status"} aria-live="polite"> … </p>
  <div ref={arrowRef} className="realm-edge-arrow" aria-hidden="true" hidden />
  <p className={`realm-message realm-message--${speech.tone}`} role="status" aria-live="polite"> … </p>
</div>
```

Empty `<p>`s are hidden by `:empty { display: none }` — the pattern `.realm-hud-notice:empty` already uses. The problem `<p>`'s action button carries `style={{ pointerEvents: "auto" }}` inline (D10.1) and is the only pointer-accepting element in the layer.

Layout:

| lane | position | type |
|---|---|---|
| `.realm-message--problem` | `top: calc(3.5rem * var(--realm-hud-scale)); left: 50%; translateX(-50%)` — under the HUD zones | inline-block pill, `text-align: center`, max-width `min(30rem, calc(100vw - 2rem))` |
| `.realm-message--plain` / `--cheer` | `bottom: calc(var(--realm-bar-bottom) + 4.5rem)` — clear of the spell bar and the mana pips | inline-block pill, centred |
| `.realm-message--stage` (ceremony) | `top: 50%; left: 50%; translate(-50%,-50%)` | `font-size: calc(1.6rem * var(--realm-hud-scale))`, gold, text-shadow, no background plate |

`--realm-bar-bottom` is a new custom property on `.realm-root` (`1.25rem`, or `9.5rem` when `settings.showStick`), so the lane and the bar stop being independently hand-tuned. Slice 3 adds `--realm-bar-height` beside it and retires the four remaining hand-tuned offsets.

**The state fix.** `RealmShell` stops collapsing two strings into one. `RealmMessages` receives `ceremonyNotice={ceremonyNoticeText}` and `notice={notice}` as separate props; `notice={ceremonyNoticeText ?? notice}` (realm-shell.tsx:532) is deleted. A spell notice fired during the ceremony no longer erases `Hail, Lily, Crown of Spring!`, and the crown no longer erases `Not enough mana yet.` — the picker decides, and the loser is simply not shown rather than destroyed.

---

### 3.7 `realm-hud.tsx` — three anchored zones, and the scoreboard deleted

The single wrapping flex row becomes three positioned zones. Each is its own container with `style={{ pointerEvents: "none" }}`; every button, link and selector inside carries `style={{ pointerEvents: "auto" }}`.

```
┌──────────────────────────────────────────────────────────────┐
│ [ Lily          ]      ┌──────────────┐    [🕐 12 min left ] │
│ [ ●●●○○○○○      ]      │ Village Well │    [ 👑 Crown…    ] │
│                        │ Old Bram is  │    [ ? ] [ Leave  ] │
│                        │  waiting.    │                     │
│                        │ ●●○○○        │                     │
│                        └──────────────┘                     │
```

**`.realm-hud-identity` (top-left).** A gold-bordered plate — `background: rgba(0,0,0,.55); border: 1px solid var(--gold-border)` and `text-shadow: 0 1px 2px rgba(0,0,0,.8)` as a floor on every bare-text HUD element, which the name has never had. Line 1: `{heroName}`. Line 2, kingdom progress:

- `numerals: false` → eight pips, `role="img"`, `aria-label="3 of 8 buildings raised."`
- `numerals: true` → the text `3 of 8 raised`, `aria-label="3 of 8 buildings raised."`

**`.realm-hud-meta` (top-right).** Minutes (`{n} min left`, `· paused` appended while paused — unchanged strings), the crown badge, the recess pill while recess runs, the Skip button during a ceremony, the `?` button, the preview badge, the hero selector, and `Leave the Realm` — now a plate-styled link rather than gold underlined text on grass.

**`.realm-hud-objective` (top-centre).** The objective card, §3.8.

**What leaves.** `mana`, `cleared`, `recess` (the trio), `ride`, `notice`, `toast`, the one-minute banner, all three error paragraphs, and both preview `<p>`s. The `RealmHud` prop list drops `mana`, `cleared`, `notice`, `toast`, `calm`, `error`, `kingdomError`, `onKingdomRetry`, `ceremonyError`, `onCeremonyRetry`, `onRetry`, `warning`, `ride` and gains `objective`, `surfaces`, `kingdomDone`, `kingdomTotal`, `recessPill`.

**The recess pill**, in `recess/hud.ts`:

```ts
export function recessPillText(gleams: number, laps: number): string;
```

Verbatim output: `Recess · 0 gleams · 0 laps`, `Recess · 1 gleam · 1 lap`, `Recess · 12 gleams · 3 laps`. `bestLapMs` and the running `lapMs` are not shown at all in slice 1 — see §9.

**The mount button** (`.realm-mount-button`), bottom-right beside the ability bar, at `bottom: var(--realm-bar-bottom)`, `min-width/min-height: 56px`, round: label `Ride` / `Dismount`, `aria-label="Ride your mount"` / `"Get off your mount"`, with a `M` keycap shown when `!settings.showStick`. Disabled and non-interactive in preview exactly as `hudRide` already arranges (realm-shell.tsx:475-477). Slice 3 replaces it in place with the real mount slot.

**The mana pip strip** (`.realm-mana-pips`), pinned directly above the spell bar at `bottom: calc(var(--realm-bar-bottom) + 3.6rem)`:

- `numerals: false` → ten pips of 10 mana each, filled by `Math.round(mana / 10)`, `role="img"`, `aria-label="Mana 65 of 100."`
- `numerals: true` → the text `Mana 65` plus a 6rem thin bar, same `aria-label`.
- On refusal (`SpellEvent { kind: "refused" }`): the strip takes `.realm-mana-pips--refused` for 600 ms — under motion, a 3-cycle 4px horizontal shake on the selected slot **and** the pips flash red; under `reducedMotion`, the shake is skipped and the pips hold a flat red for the same 600 ms with no transition. The existing notice `Not enough mana yet.` is unchanged and now lands centre-screen.

**Pointer-events.** `globals.css:1705` (`.realm-hud > * { pointer-events: auto }`) is **deleted**. `.realm-hud`, `.realm-hud-row` (retired), the three zones and `.realm-messages` are pass-through; the auto rule is narrowed to `.realm-hud button, .realm-hud a, .realm-hud-selector *, .realm-messages button`. The three load-bearing values are additionally set inline so a jsdom test can read them (D10.1).

---

### 3.8 The objective card

`.realm-hud-objective`, a `<section aria-label="What to do next">`, top-centre, a plate with the building's `GameIcon`.

| state | line 1 | line 2 | progress row |
|---|---|---|---|
| `next`, child | `Village Well` | `Old Bram is waiting.` | pips or `2 of 5` |
| `next`, preview | `Village Well` | `Old Bram is waiting for Lily.` | always `2 of 5` (a parent reads numbers) |
| `next`, extra tracked rows (full depth, `trackedObjectives: 3`) | — | `Grain Mill · 1 of 5` | — |
| `complete` | `Every building is raised.` | `Nothing is waiting. Walk where you like.` | none |

> **`complete`'s two strings are an interim and are labelled as such.** Until slice 8 makes clearing troubles pay, `Nothing is waiting` is true. From slice 8 onward it is false — there *is* something waiting, and it earns minutes — which makes it exactly the kind of sentence this programme exists to delete. **Slice 13 owns the final text** (`record-of-the-work` §3.8: `Your kingdom stands. Troubles still gather — clear them and earn more time here.`), and slice 13's commit moves these two strings *and* `objective.test.ts`'s assertions on them together. No child sees the stale line, because no child reaches 8 of 8 before slice 13 in practice — but the rule is that a string with a known expiry names its heir in the spec, and this one does.
| `unknown` | *the card is not rendered* | | |

> **A note on the number 5, which appears in every illustration above.** Today `deedsToBuild` is `5` for all eight buildings, so `2 of 5` and a five-pip strip are what a child sees when slice 1 ships. **Slice 13 lowers every building to its real story count** — 3/3/2/3/2/3/2/2 — so the same surfaces will read `2 of 3` and carry two- or three-pip strips. Nothing in this slice's *code* changes: every string derives from `done`/`total` and every pip row is `total` wide. What does change is this spec's illustrations and `objective.test.ts`'s fixtures, and **slice 13's commit re-baselines both**, as §3.2 of that spec records. Read every `of 5` below as "of `total`".

The progress row's accessible name is always numeric, at both depths: `aria-label="2 of 5 side quests done."` Pips are a visual substitution for a pre-literate reader; they are never a substitution for a screen reader, which is why the accessible name carries the count in both cases. The noun is `side quests`, from `SIDE_QUESTS_LOWER` in `src/lib/utils/side-quest-copy.ts` — "deed" never reaches the screen.

At `unknown` the card is suppressed and the problem lane already carries `The villagers are resting. Try again.` with its `Wake the villagers` button. The world must never tell a child their kingdom is finished because a query failed.

---

### 3.9 The world: what the scene draws

**The hero.** Ring + arrowhead (§3.4) written from the true ground position; the sprite keeps its `bob`. No new textures.

**The beacon** over the one objective site: a `<group position={[site.x, 0, site.z]}>` holding a `cylinderGeometry(BEACON.radius, BEACON.radius, BEACON.height, 8)` in gold, `meshBasicMaterial`, `transparent`, `opacity: BEACON.opacity`, `depthWrite: false`, positioned at `y = BEACON.height / 2`; plus a ground ring at `GROUND_Y.heroRing - 0.005` of radius `site.size.w / 2 + 0.3`. Under `settings.motion` the column's opacity breathes between 0.35 and 0.55 on a 1.2 Hz sine; under `reducedMotion` it holds 0.45. Under `calmPalette` it is `BEACON.calmHeight` tall at `BEACON.calmOpacity` — shorter and quieter, never absent.

**Villagers become groups.** The map `villagerSprites: Map<string, THREE.Sprite>` becomes `villagerGroups: Map<string, THREE.Object3D>`. Each villager renders as:

```tsx
<group key={v.id} ref={register(v.id)} position={[v.position.x, 0, v.position.z]}>
  <ContactShadow w={0.8} d={0.8} y={GROUND_Y.figureShadow} calm={calm} />
  <sprite position={[0, SPRITE_H / 2, 0]} scale={[SPRITE_W, SPRITE_H, 1]}>…</sprite>
  <VillagerPlate villager={v} status={v.status} surfaces={surfaces} onPick={onVillagerPick} />
</group>
```

The ceremony's two write sites change from `sprite.position.set(v.x, SPRITE_H/2, v.z)` to `group.position.set(v.x, 0, v.z)` (realm-scene.tsx:141) and the same for the reset loop at :145. `ceremony.ts` is not touched. Plates, markers and shadows now follow the eight villagers across the plaza for the whole crown ceremony, which is the emotional payoff of a season, and they land back at their sites when it ends.

**The texture filter.** One `useMemo` in `World`:

```ts
const shown = useMemo(() => layout.villagers.filter((v) => Boolean(textures.villagers[v.id])), [layout.villagers, textures]);
```

`shown` feeds the villager render **and** `nearestVillager(p, shown)` in the frame loop. A villager whose SVG never rasterised is simply not there: no plate, no marker, no reach, no Talk bubble over bare grass.

---

### 3.10 `villager-plate.tsx` — names, state, and the marker

One component, one `<Html position={[0, SPRITE_H + 0.35, 0]} center zIndexRange={[12, 0]}>`, rendered as a `<button>` so a tap on the name does what a tap on the person does.

```
 ┌───────────────┐
 │ !  Old Bram   │
 │ Village Well  │
 │ ●●○○○         │
 └───────────────┘
```

| status | badge | line 2, `numbers` | line 2, `pips` | accessible name |
|---|---|---|---|---|
| `objective` | gold `!` | `Village Well · 2 of 5` | `Village Well` + pip row | `Old Bram. Village Well, 2 of 5 side quests done. Waiting for you.` |
| `work` | none | `Village Well · 2 of 5` | `Village Well` + pip row | `Old Bram. Village Well, 2 of 5 side quests done.` |
| `built` | dim `✓` | `Village Well · Built` | `Village Well · Built` | `Old Bram. Village Well, built.` |

The badge is `aria-hidden="true"` (the meaning is in the accessible name). Under `settings.motion` the gold `!` bobs on a 2 Hz CSS keyframe with a 3px amplitude; under `reducedMotion` it is static and takes a 1px gold outline instead, so the objective villager still stands out without moving.

Type sizes use the new knob: `.realm-plate-name { font-size: calc(13px * var(--realm-hud-scale)) }`, `.realm-plate-tag { font-size: calc(11px * var(--realm-hud-scale)) }`. This is the fix for the largerText hole — `globals.css:244` scopes `data-larger-text` to `.realm-panel` only, so the world has been unreadable for a largerText hero. `--realm-hud-scale` is set once on `.realm-root` from `settings.hudScale` and `.realm-label` / `.realm-label-tag` adopt it in the same change.

The plate's minimum hit area is 44px tall; the reach bubble's Talk control goes to **56px** (`--realm-touch: 56px` on `.realm-root`, applied to every control that sits over the 3D world and is aimed at during play — the Talk button and the mount button; panel buttons stay at 44px, since a dialog is not a moving target).

---

### 3.11 Tap-the-thing-does-the-thing, and the shrunk bubble

**Villager sprite and plate.** Both call one handler:

```ts
function onVillagerPick(id: string) {
  if (!interactive) return;
  if (reachRef.current === id) { onTalk(id); return; }
  pendingTalk.current = { id, until: performance.now() + PENDING_TALK_MS };
  const v = shown.find((s) => s.id === id);
  if (v) hero.current = setTarget(hero.current, { x: v.position.x, z: v.position.z + 1 }, layout.colliders);
}
```

The `onPointerDown` on both surfaces calls `e.stopPropagation()` first, so the tap never falls through to the ground mesh and walks the hero "vaguely nearby". `setTarget` already refuses a point inside a collider and returns the state unchanged; if it does, the handler retries with the villager's own position, which is always walkable (villagers are never colliders — asserted at layout.test.ts:56).

`PENDING_TALK_MS = 8000`. In the frame loop, once `near === pendingTalk.current.id`, the scene clears the pending talk and fires `onTalk` through `queueMicrotask` (never a synchronous `setState` from `useFrame`). The pending talk is also cleared when: the hero's target is dropped (a blocked path — `stepHero` already nulls an unreachable target), another villager is picked, the panel opens, the ceremony starts, or the deadline passes. A talk that fires four seconds after the child's mind moved on is worse than no talk at all.

**Site groups.** The same handler is mirrored on the foundation group and on the building sprite, resolved through `villagerForBuilding(prop.id)`. Tapping the well's foundation walks you to Old Bram.

**The reach bubble** loses the greeting paragraph, which was already the SiteCard's subtitle verbatim (site-card.tsx:59), and becomes:

```tsx
<button className="realm-bubble-talk" aria-label={`Talk to ${reachVillager.name}`} onClick={…}>
  Talk{keyHint && <span className="realm-bubble-key"> · Enter</span>}
</button>
```

Keyboard: `Talk · Enter`. Touch (`settings.showStick`): `Talk`. `.realm-bubble` loses its `max-width: 16rem` paragraph and its 12px body text; the control is 56px tall.

---

### 3.12 Speech, and the reach announcement

`onReachChange` in the shell now sets the notice string **regardless of `readAloud`**, so the aria-live lane announces it for free:

- keyboard: `Old Bram is here. Press Enter to talk.`
- touch: `Old Bram is here. Tap Talk.`
- on leaving reach: the notice is cleared to `null`.

The reach notice does **not** take the 2-second self-clearing timer that ordinary notices take (realm-shell.tsx:347-351) — it holds while the hero is in reach and clears on exit. Implementation: the reach string is held in its own `reachNotice` state and merged into `MessageInput.notice` as `notice ?? reachNotice`, so a spell notice temporarily wins and the reach line returns when it expires.

`speak()` (`src/lib/utils/speech.ts`) is currently wired to the two least important strings in the Realm — the help card and the ceremony narration. It gets a single wiring point instead of five scattered calls:

```ts
const lastSpoken = useRef<string | null>(null);
useEffect(() => {
  if (!bundle.profile.readAloud) return;
  const text = speech?.text ?? null;
  if (!text || text === lastSpoken.current) return;
  lastSpoken.current = text;
  speak(text);
}, [speech, bundle.profile.readAloud]);
```

`speech` is the picked speech-lane message, so ceremony narration, the rise toast, the reach line, gleams, laps and every notice are spoken once each, in priority order, with `speak()`'s own `cancel()` giving the higher-priority message the voice. The `lastSpoken` ref stops a re-render stuttering the same sentence.

One string is spoken outside the lane: the objective, once per visit, when the world first becomes interactive (textures loaded, help card closed), behind `spokenObjective.current`:

`Your next side quest is at the Village Well. Old Bram is waiting.`

Written for speech, not for the eye: no `·`, no `2 of 5`, no keycaps.

**Read-aloud is gated by `profile.readAloud` alone and never by `profile.soundEnabled`.** `soundEnabled` governs game sound, which slice 9 ships. A note to that effect goes in `speech.ts`'s doc comment so slice 9 does not accidentally mute an access feature.

---

### 3.13 The rasterisation budget

**This slice adds zero new rasterised sprite kinds.**

`sprite-texture.ts` caches by figure kind, so instances are free and kinds are billed. The running total is unchanged: hero (1) + mounted hero (1) + companion (0-1) + villagers (8) + troubles (3) + mount (1) + gleam (1) + banner (1) + crown (0-1) + castle banner (0-1) + castle (1) + buildings (8) + foundation (1) + decor (6) + tiles (2) = **35 worst case, before and after**.

The markers are DOM (`<Html>`), the ring and beacon are geometry, and the shadows are geometry. Nothing new goes through `svgElementToTexture`, so **first paint is not touched at all** — the `onReady` path is byte-for-byte the same work it does today. This is the honest answer to audit objection (c) from decision 2: this slice makes the world read better without spending a single millisecond of the rasterisation budget that slice 2 is about to parallelise.

What it does spend is per-frame work: **+34 flat `meshBasicMaterial` meshes** (no textures, no lights, no shadow maps) and **+8 drei `<Html>` plates**. The scene already mounts 9 `PropLabel` `<Html>` nodes with no culling, so this is a proportional increase of the same class. Peak DOM label count between this slice and slice 10 is 17; slice 10 deletes the nine floating site pills and brings it back to 8.

**Acceptance measurement** (browser pass, port 3100, `?preview`): median frame time over 10 s of walking, before and after, on the reference machine. Budget: **≤ 1.0 ms/frame added**, and **0 ms added to `onReady`**. If the plates blow the frame budget, the fallback — recorded here so it is not invented under pressure — is to render plates only for the four villagers nearest the camera target, recomputed in the frame loop and applied by toggling `el.hidden` on a ref, never by `setState`.

---

### 3.14 The four full-village engineering problems (decision 2)

This slice ships before the village and must not make it harder to build.

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** This slice adds no props to the layout and changes no prop's `kind`. `focus` is a new optional field on `Prop` and `status` a new field on `VillagerPlacement`; the foundation props `spawnTroubles` filters on (troubles.ts:81) are identical in count, position, kind and size. A test asserts that `buildWorldLayout` with and without `objectiveIds` yields the same `props.map(p => ({id, kind, position, size, solid}))`.

**(b) New solid props can wedge the hero, and cross-map routes break.** Every mark this slice adds — the ring, the arrowhead, the beacon, 34 shadows, 8 plates, the edge arrow — is a **scene mesh or DOM node, not a `Prop`**. None of them enters `layout.props`, so none can enter `layout.colliders` (`props.filter(p => p.solid)`, layout.ts:179). A test asserts `layout.colliders` is unchanged by `objectiveIds`. `unstickHero` needs no new case because there is nothing new to be stuck inside. The ceremony walk and the recess lap ring are untouched.

**(c) Sprite rasterisation already blocks first paint and more figures makes it worse.** §3.13: zero new kinds, zero added first-paint cost.

**(d) Gleam spawning needs open ground.** `stepRecessSim` places gleams against `layout` (recess/recess.ts), and `layout`'s prop set is unchanged, so open ground is exactly as open as it was.

**One forward-compatibility rule this slice adopts on the village's behalf:** no new code reads `BUILDING_SLOTS`, `SPAWN`, `CASTLE_POSITION` or any other hard-coded coordinate. The beacon, the edge arrow, the plates and the approach points all read positions **from the `layout` object**. When slice 4 rewrites the town plan, every mark in this slice moves with it and nothing needs re-siting.

---

### 3.15 The help card: the false promise, deleted

`realm-help.tsx` — `Clear troubles to protect the sites.` is removed from both Cast strings. Nothing a trouble does touches a site, a building, a villager or the kingdom; the worst it does is a 1.5-second dazzle (focus.ts:8-11). The card now says nothing about stakes, which is true, rather than something false. Slice 8 writes the replacement when clearing actually earns Realm minutes.

New Cast text, verbatim:

- keyboard: `Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.`
- touch: `Tap a spell page, then tap where the spell should go.`

One group is **added**, second in the list, because the card has never said what the world is for:

- title `Where to go`, icon `map`, both input modes: `Follow the gold light. Someone is waiting there.`

`helpGroups(touch, ceremony)` now returns `["Move", "Where to go", "Talk", "Cast", "Ride and recess"]` and `realm-help.test.tsx` is updated to those five titles and the two new Cast strings in the same commit.

**The 'Show me everything' control** sits at the foot of the card, shown only in a child's own view and only when `!profile.fewerChoices`:

| current depth | button | hint under it |
|---|---|---|
| `simple` | `Show me everything` | `More numbers, more to do. You can change it back.` |
| `full` | `Keep it simple` | `Fewer numbers, one thing at a time.` |

On failure: `That didn't save. Try again.` The word "depth" appears nowhere. Pressing it calls `setRealmDepth(childId, "full" | "simple")` and updates the visit's depth immediately (the surfaces re-derive; nothing else in the world moves). It is hidden in a parent's preview, mirroring `markRealmHelpSeen`, which already refuses to record on a hero's behalf (realm-shell.tsx:388).

When slice 9 ships the real opening gate, this control moves onto it and off the card.

---

### 3.16 The clock leak

Two halves, both here.

**Half one: `flushPending()` on unmount.**

```ts
useEffect(() => () => { void clock.flushPending(); }, [clock.flushPending]);
```

`flushPending` is a `useCallback` on `[settle]`, and `settle` on `[childId]`, so the identity is stable and the cleanup runs exactly once, on the real unmount. Because it hangs off `RealmOpen` itself, **every** exit path runs it: the `Leave the Realm` link, a router navigation, the gate closing, the clock running out, a browser back. No spec may add an exit that bypasses it, and there is no way to add one — the cleanup is on the component every exit unmounts.

**Half two: the sub-minute remainder, which is the actual leak.** `flushPending` alone only rescues whole minutes that were mid-flight or had failed to record — normally zero. The free play comes from `secondsThisMinute`, which is 0-59 seconds of real play thrown away on every unmount. A child who bounces out every 50 seconds plays forever for nothing.

New pure rule in `play-clock.ts`, with a colocated test:

```ts
export const ROUND_UP_SECONDS = 30;

/** Whole minutes to write when the visit ends: pending records, plus the remainder rounded half-up. */
export function minutesToSettle(clock: PlayClock, pending: number): number;
```

- `clock.closed` → `0` (the gate already charged and shut).
- otherwise `pending + (clock.secondsThisMinute >= ROUND_UP_SECONDS ? 1 : 0)`, clamped to `[0, clock.minutesRemaining]` and to the server's ceiling of 30.

A child who leaves at 5 seconds is charged nothing; one who leaves at 50 is charged the minute they played. The leak is capped at 29 seconds a visit instead of 59 and cannot be farmed. `recordRealmPlay` rejects `minutes < 1` (realm-play.ts:19-23), so a zero result is simply not sent.

This is a change to what a stored value **means** only in the mildest sense — the ledger already means "minutes spent", and this makes it more accurate, not different — so it needs no one-time message to the child.

---

### 3.17 Parent preview (`isChildView: false`)

Every new surface, decided deliberately:

| surface | in preview |
|---|---|
| hero identity plate | **Renders**, with the child's name and the child's kingdom progress. |
| objective card | **Renders**, always with numbers, line 2 reading `Old Bram is waiting for Lily.` |
| villager plates and markers | **Render.** A parent should see exactly what the child sees. |
| hero ring, shadows, beacon, edge arrow | **Render.** |
| problem lane | **Renders**, carrying `You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.` with the gate note appended when there is one. |
| speech lane | **Renders but is empty in practice** — `onSpellEvent` and `onRecessEvent` already return early for a parent, the ceremony is null for a parent, and `Begin` is hidden in the SiteCard, so no rise toast can fire. |
| mana pips | **Suppressed** (`mana === null`). |
| mount button | **Renders disabled**, exactly as `hudRide` already arranges. |
| recess pill | **Suppressed** (`hudRecess` is already null for a parent). |
| tap-to-talk | **Works.** A parent may open a SiteCard; `Begin` stays hidden and `HERO_ONLY` still explains why. |
| 'Show me everything' | **Suppressed.** A parent changes it in the settings panel, under the child's name. |
| depth | The **child's** depth, not a parent default, so the preview is honest about what the child sees. |
| speech | **Never speaks.** `readAloud` is the child's setting and `speak()` is not called in preview. |

No surface reads `mana`, `cleared`, `ride` or `minutes` without a null check, and the objective card takes `kingdom.buildings`, which is populated in preview.

---

### 3.18 The metered clock: what this slice costs, in seconds

Play is earned in five-minute grants. Every new beat, priced:

| beat | cost |
|---|---|
| ring, shadows, plates, markers, beacon | **0 s** — no gate, no animation the child waits behind |
| objective card appearing | **0 s** — it is rendered with the first HUD frame |
| edge arrow | **0 s** |
| message lanes | **0 s of new hold time.** Toast holds 4000 ms and notice 2000 ms, both unchanged; ceremony narration holds until its next step, unchanged. Splitting into two lanes shows *more* per second, never less. |
| tap-to-talk | **saves ~1 s per villager visit** — the child no longer taps, walks, and taps again |
| rise toast carrying the next objective | **saves 4 s** — one 4-second toast instead of two queued |
| first paint | **0 ms added** (§3.13) |
| `flushPending` on unmount | **off the clock** — it runs after the world is gone |

**The clock is paused in exactly one place in the whole programme (slice 9's opening banner) and nowhere else.** This slice adds no pause: `usePlayClock`'s `paused` argument stays `panelOpen || ceremonyRunning || helpOpen`, unchanged.

---

### 3.19 The economy has one door

Realm minutes come from completed side quests, bounded by the parent's `dailyCapMinutes`, which `computeRealmAccess` already enforces. This slice adds no earning and no spending, and it introduces nothing that can stand between a child and their schoolwork:

- The objective card is a **suggestion**, never a gate. Every one of the eight villagers is talkable at any time, in any order, at either depth; `objectiveState` cannot return a value that disables a Talk.
- The beacon and the `!` mark one site. They do not lock the other seven.
- The mana pip strip shows a resource that already gates only casting, and casting is not required to do anything.
- Nothing in this slice blocks `startDeedRun`, the SiteCard, or the `Begin` button.

A test asserts that with a full kingdom, an empty kingdom, an unknown kingdom and every depth/profile combination, `onTalk` opens the SiteCard for all eight villagers.

---

### 3.20 The app chrome that punches through the portal

This slice is already rebuilding the HUD layer and already editing `globals.css:1702-1710`, so it is the slice that owns the audit's z-index finding rather than leaving it homeless. Four pieces of the surrounding app currently float **over** the game board:

| what | where | z-index |
|---|---|---|
| the log-out / hero-switch pill | `switch-hero.tsx:37,59` via `.floating-dock` | `globals.css:403` — **50** |
| the demo persona switcher | `demo-persona-switcher.tsx` via `.floating-dock` | **50** |
| the quest-timer popup | `quest-timer-popup.tsx:117,168` | **50** |
| the schedule-notification popup | `schedule-notification-popup.tsx:125` | **50** |
| **the Realm itself** | `.realm-root`, `globals.css:1702` | **45** |

The timer and schedule popups are the worse half: they fire **unprompted**, on a metered clock, and can cover the ability bar mid-cast. The sign-out pill is the more embarrassing half — after slice 6 deletes `.realm-hud-leave` it is the only DOM link over the game world, sitting beside the mount slot where a child's thumb already is.

**The fix, three lines and one rule.**

1. `.realm-root` rises to `z-index: 60`. The portal is a portal: while it is open, it is the top of the stack. Nothing outside it may cover the world by accident again.
2. `.realm-root` is the only thing allowed above the app chrome, and the chrome that genuinely needs to reach a child during play is **re-admitted deliberately, inside the Realm's own layers**, never by out-ranking it. In this slice exactly one thing qualifies: the quest timer, whose whole purpose is to tell a child their chore ran out. It becomes a chip in the HUD's meta zone (top-right, beside the clock and the crown), reading the same `QuestTimerContext` the popup reads, styled as a `.realm-hud-chip`, and speaking through the problem lane at `priority: "warning"` when it expires. Copy, verbatim: `Your {subject} timer finished.` with the action button `Go to it →`, which routes out of the Realm the same way any navigation does — through the unmount cleanup in §3.16, so the minute is charged.
3. Everything else is suppressed while the portal is open, by one scoped rule rather than by editing four components:

```css
/* While the Realm is open, the app's floating chrome stays behind it. */
body:has(.realm-root) .floating-dock,
body:has(.realm-root) .quest-timer-popup,
body:has(.realm-root) .schedule-notification-popup { display: none; }
```

`:has()` is supported in every browser this app targets and the app already relies on modern CSS selectors; the fallback if it ever is not is a `data-realm-open` attribute set on `<body>` by `RealmOpen`'s mount effect, which is one line and testable.

**Where the hero switcher goes instead.** It is not deleted — it is the only way to change hero — it is simply not a thing that floats over a game. In child view it is suppressed outright (a child does not switch heroes mid-visit; they leave through the Tavern door, which slice 6 builds). In **parent preview** it moves into the preview header row, where the hero selector already lives (§3.17), so a parent comparing two children keeps the control they actually use.

**Tested.** `realm-chrome.test.tsx`: with `.realm-root` mounted, `document.querySelector(".floating-dock")` is present in the DOM but computes `display: none`; the quest-timer chip renders in the meta zone with the verbatim string; the chip is absent when no timer is running; in preview the hero selector is in the header and not in a floating dock. The computed-style half needs jsdom's `:has()` support — if the installed jsdom does not evaluate it, the test asserts the `data-realm-open` attribute path instead and the CSS rule is written against that attribute.

---

## 4. Data model

### The migration

One column. **This slice is the first of the seven that take a migration**, so drizzle-kit will assign it `0026` — the next number after the last committed `0025_worried_tyrannus`. That is a prediction, not a reservation: the build step runs `npm run db:generate`, reads the filename it produced, and records it here. Numbers are the tool's. The other six migration-taking slices (7, 8, 9, 10, 12, 13) follow as 0027–0032 in build order.

```sql
-- src/lib/db/migrations/0026_<drizzle-name>.sql
ALTER TABLE `realm_settings` ADD `depth_override` text DEFAULT 'auto' NOT NULL;
```

Schema (`src/lib/db/schema.ts`, inside `realmSettings`, after `starterSpellAt`):

```ts
// Slice 1 of the presentation overhaul: how much the Realm shows.
// 'auto' follows the tutorial; a hero or a grown-up can pin it either way.
depthOverride: text("depth_override", { enum: ["auto", "simple", "full"] }).notNull().default("auto"),
```

### What existing rows do

Every existing `realm_settings` row is backfilled with `'auto'` by the `NOT NULL DEFAULT` — SQLite's `ADD COLUMN` writes the default into every existing row, so there is no null to handle and no read path that can see one. Concretely:

- **A hero who has played before** has `help_seen_at` set, so `realmDepth({ tutorialComplete: true, override: "auto" })` → `"full"`. They open the Realm to numbers, three tracked objectives and every ability slot — the same information density they had yesterday, better organised. **Nothing they could see is taken away.**
- **A hero who has never opened the Realm** has `help_seen_at` null → `"simple"`. They get pips and one objective on their first visit, and full depth from their second, at a visit boundary.
- **A child with no `realm_settings` row at all** is handled by `loadRealmSettings`, which creates the row from `DEFAULT_REALM_SETTINGS`; `depthOverride` joins that constant as `"auto"`.
- **A malformed value** (a hand-edited database, a future enum change) is coerced by `settingsFromRow` through `isDepthOverride`, falling back to `"auto"`. The Realm never crashes on a bad enum.

### Does a stored value change meaning?

`help_seen_at` gains a second consumer: it already meant "this hero has seen the how-to-play card", and it now also answers "has this hero been introduced to the world". That is the same fact read for a second purpose, not a redefinition, and the surfaces it now drives are ones the affected heroes (who all have it set) already had. **No one-time message to the child is needed**, and none is shipped: nothing on screen names depth, and the only heroes who experience a change are brand-new ones between their first and second visit — which is a visit boundary, the least jarring place for it. Slice 9 turns that boundary into a visible ceremony with its own copy.

### Type and action changes

```ts
// src/lib/utils/realm-settings.ts
export type RealmSettings = { …; depthOverride: DepthOverride };
export const DEFAULT_REALM_SETTINGS = { …, depthOverride: "auto" };
// settingsFromRow: isDepthOverride(row.depthOverride) ? row.depthOverride : "auto"
// validateRealmSettingsPatch: case "depthOverride" → isDepthOverride(v) or throw
//   "Choose automatic, simple, or everything."
```

```ts
// src/lib/actions/realm-settings.ts  ("use server": async functions only)
/** How much the Realm shows. A hero may set their own — it changes presentation, never access. */
export async function setRealmDepth(childId: string, override: DepthOverride): Promise<void>;
```

`setRealmDepth` calls `requireChildAccess(childId, { write: true })` **without** the `isChildActor` refusal that `updateRealmSettings` carries, validates through `isDepthOverride`, and writes that one column plus `updatedAt`. It does not `revalidatePath` — the Realm is a client tree and re-reads on its next mount. It cannot change `enabled`, `accessMode`, `dailyCapMinutes`, `toneMode` or anything else; that is the whole reason it is a separate action rather than a widened `updateRealmSettings`.

`RealmBundle` gains `depthOverride: DepthOverride`, read from the `loadRealmSettings` result already in the parallel batch (realm.ts:64) — **no new query**.

### Verification

`npm run db:generate` then `npm run db:migrate`, then **checked, not trusted**: the post-commit hook runs migrate silently, so the build step reads back
`PRAGMA table_info(realm_settings)` and confirms `depth_override | text | notnull=1 | dflt_value='auto'`, and selects one pre-existing row to confirm it reads `'auto'` rather than null.

---

## 5. Errors and edge cases

| case | behaviour |
|---|---|
| `kingdom.buildings` is empty (the load failed) | `objectiveState` → `{ kind: "unknown" }`. The objective card is not rendered. No beacon, no `!`, no edge arrow. Villager plates render with no tag line (there is no progress to show). The problem lane carries `The villagers are resting. Try again.` with `Wake the villagers`. |
| Every building complete | `{ kind: "complete" }`. Card reads `Every building is raised.` / `Nothing is waiting. Walk where you like.` No beacon, no `!`, all eight plates show `· Built` and a dim `✓`. |
| A villager's SVG failed to rasterise | Filtered from `shown`: no sprite, no plate, no shadow, no reach, no Talk bubble. If that villager was the objective, the **site** still gets its beacon and the card still names the building — the place is still findable without the person. |
| The objective's building has no villager in `VILLAGERS` | `Objective.villagerId` and `villagerName` are `null`; the card's line 2 is omitted and the beacon still marks the site. |
| A tap on a villager whose approach point is inside a collider | `setTarget` returns the state unchanged; the handler retries with the villager's own position, which is always walkable. |
| Pending talk never resolves (path blocked, child wandered off) | Cleared after `PENDING_TALK_MS` (8 s), on another pick, on the panel opening, or when `stepHero` drops the unreachable target. |
| The crown ceremony starts while a pending talk is queued | The pending talk is cleared when `ceremonyActive` becomes true. |
| A pointer down on the objective card, the identity plate or the meta zone | Passes through to the ground mesh — those containers are `pointer-events: none`. Only buttons, links and the selector accept pointers. |
| `edgeArrow` with a zero-size viewport (first frame, hidden tab) | `state.size.width === 0` → the function returns `null` and the arrow stays hidden; no division by zero. |
| Two messages of the same lane at once | The pure picker returns exactly one. The loser is not destroyed — it is still in its own state and appears when the winner clears. |
| A spell notice fires during the crown ceremony | The ceremony wins the speech lane; the spell notice's 2-second timer still expires on schedule and it is simply never shown. |
| `setRealmDepth` fails (offline, server error) | The card shows `That didn't save. Try again.` and the visit's depth is **not** changed — the control never lies about what was stored. |
| A parent presses the depth control | Impossible: it is not rendered in preview. |
| `flushPending` throws on unmount | `settle` already catches and only sets state; a set on an unmounted component is a no-op in React 19. The `void` keeps the floating promise lint-clean. |
| `minutesToSettle` would exceed the ledger's 30-minute ceiling | Clamped to 30 by the function; `recordRealmPlay`'s `assertMinutes(minutes, 30)` is never made to throw. |
| A hero with `fewerChoices` at full depth | `trackedObjectives` is capped at 1 and `abilitySlots` at `"earned"` by `surfacesFor`. The extra tracked rows never render. |
| WebGL missing / `unsupported` phase | Unchanged: `RealmShell` returns before `RealmOpen` mounts, so none of this slice's surfaces exist. |

---

## 6. Accessibility

### Per learning-profile setting

**`reducedMotion`** — the standing rule is that every motion cue needs a non-motion substitute, because the single existing combat particle is gated on `motion`, which means `reducedMotion` currently erases 100% of combat feedback for exactly the children the setting exists for. In this slice:

| cue | motion | reducedMotion substitute |
|---|---|---|
| gold `!` badge | bobs at 2 Hz | static, plus a 1px gold outline on the plate |
| beacon column | opacity breathes 0.35↔0.55 | holds 0.45 |
| edge arrow | 1 Hz pulse | static |
| mana refusal | slot shake + red pips | red pips only, held 600 ms, no transition |
| toast entry | `realm-toast-in` slide | none (the existing `prefers-reduced-motion` rule and `--plain` variant already cover it) |
| hero bob | existing, already gated at realm-scene.tsx:177 | shadows and ring are unaffected either way — they never bob |

No cue in this slice exists *only* as motion.

**`lowStimulus` (`calmPalette`)** — the standing rule is that lowStimulus **mutes**, never **empties**. Every mark in this slice is present in calm mode, quieter: ring gold `#c9a84c` → `#8a7d5a` (the swap `recess-layer.tsx:33` already makes); shadows 0.22 → 0.14; beacon 3.4 units at 0.45 → 2.2 units at 0.18; the `!` badge in muted gold; the plate background from `rgba(0,0,0,.55)` to `rgba(0,0,0,.7)` with no gold border. **Nothing is removed.** The existing counterexample — `realm-shell.tsx:215` passes `decor: !settings.calmPalette`, so the children who most need visual anchoring get zero decoration — is named and left to slice 5, which owns the "quieter rather than emptier" calm mode.

**`largerText` (`hudScale: 1.25`)** — this slice ships the fix for the hole the audit found. `--realm-hud-scale` is set once on `.realm-root` from `settings.hudScale`; the HUD zones, both message lanes, the objective card, the villager plates, `.realm-label`, `.realm-label-tag` and the mana pips all derive from it. `globals.css:244`'s `.realm-panel`-only `zoom` rule stays exactly as it is (zooming the root would break drei's `Html` positioning, which tracks the scene in unzoomed screen pixels) — the world scales by font size instead. The spell bar's second, incompatible base (`12 * hudScale` px, spell-bar.tsx:81) is left to slice 3 with the rest of the bar, but the property it will consume ships here.

**`fewerChoices`** — `trackedObjectives` capped at 1 and `abilitySlots` at `"earned"` at both depths (the depth invariant). The objective card shows one row. The message lanes already show one message each. The 'Show me everything' control on the help card is **hidden**, because it is a choice and a parent still has it in Settings.

**`readAloud`** — §3.12. One wiring point, every speech-lane message spoken once, `lastSpoken` guarding re-renders, `speak()`'s own `cancel()` giving priority the voice. All spoken strings are written for speech: no `·`, no keycaps, no `2 of 5` fragments. Gated by `readAloud` alone, never by `soundEnabled`.

**`inputMode`** (`touch` / `keyboard` / `auto`) — `settings.showStick` selects the copy, as `helpGroups(touch)` already does: `Talk · Enter` vs `Talk`; `Old Bram is here. Press Enter to talk.` vs `Old Bram is here. Tap Talk.`; the mount button shows an `M` keycap only when `!showStick`. Every control that sits over the 3D world is 56px (`--realm-touch`).

**`soundEnabled`** — this slice adds no sound. Slice 9 ships the feedback channel the settings page already promises parents. The rule recorded here: `soundEnabled` never gates `speak()`.

**`readingFont` / `extraSpacing`** — carried by `readingAttributes(bundle.profile)` on `.realm-root` (realm-shell.tsx:487) and inherited by every new lane, plate and card, because all of them are inside that root.

**`untimed` / `sessionMinutes` / `predictableRoutine`** — untouched by this slice.

### Screen readers and keyboard

- Both message lanes are always-mounted `<p>` elements with `aria-live="polite"`, hidden by `:empty`. A stable node is what makes the announcement reliable.
- An error takes `role="alert"`; everything else `role="status"`.
- The objective card is `<section aria-label="What to do next">`, not a live region — it is persistent, not an announcement.
- Every pip row is `role="img"` with a numeric `aria-label` at **both** depths. Pips substitute for numerals on screen, never in the accessible name.
- Villager plates are real `<button>`s in the tab order, with the full accessible names in §3.10. The eight plates sit in DOM order after the HUD zones.
- The edge arrow and both marker badges are `aria-hidden="true"`; their meaning is in text elsewhere.
- Existing keyboard paths are unchanged: `Enter`/`Space` talks (realm-shell.tsx:315-321), `M` mounts, `Escape` skips the ceremony, `1-4` selects a spell.

### The complexity axis

| surface | `simple` | `full` |
|---|---|---|
| identity plate, kingdom line | 8 pips | `3 of 8 raised` |
| objective card, progress | 5 pips | `2 of 5` |
| objective card, tracked rows | 1 | up to 3 (`Grain Mill · 1 of 5`) |
| villager plate, line 2 | `Village Well` + pips | `Village Well · 2 of 5` |
| mana strip | 10 pips | `Mana 65` + bar |
| ability slots | (slice 3 consumes `abilitySlots` and `keycapHints`) | |
| list rows | (slice 6 consumes `listRows`) | |
| district arrival | (slice 5 consumes `districtDetail`) | |
| trouble plates | (slice 8 consumes `troubleNames`, `troubleDetail`, `troubleHitPips`, `clearCount`, `bountyLedgerLine`) | |
| lap times | (slice 12 consumes `lapTimes`) | |
| fast travel | (slice 7 consumes `fastTravel`) | |

Every one of these is a substitution. Nothing a simple-depth child can do is removed, and the word "depth" appears nowhere a child can read.

---

## 7. Testing

### Unit-testable (Vitest, no three, colocated)

**`depth.test.ts`** — the truth table for `realmDepth`; **every one of the thirteen fields** of `surfacesFor` at both depths, asserted exhaustively against the table in §3.1 with a key-count assertion so a field added without amending the spec fails the build; `fewerChoices` caps `trackedObjectives` at 1, `abilitySlots` at `"earned"` and `listRows` at 3 at **both** depths; `isDepthOverride` accepts exactly three strings and rejects `null`, `""`, `"Simple"`, `0`; `DEFAULT_DEPTH_OVERRIDE === "auto"`.

**`objective.test.ts`** — a brand-new hero (all `0 of 5`) gets `well`, every time, on repeated calls; in-progress beats untouched; higher `done` wins among in-progress; complete buildings never appear; `[]` → `unknown`, never `complete`; all-complete → `complete`; `limit` clamps to 1..8 and caps the array; `rankBuildings` returns the same order `deed-picker`'s deleted local `rank` produced, asserted against a fixture of the eight buildings in six progress states; `riseToast` and `objectiveSpeech` return the three exact strings in §3.2.

**`markers.test.ts`** — `facingAngle` maps each of `n/s/e/w` to an angle whose ring-plane direction equals `FACING_VEC[facing]`, computed from the mapping in §3.4 rather than hardcoded, so a future ring rewrite cannot silently invert it; `shadowFootprint` returns the prop's own `w × d`, never a square; `GROUND_Y` is strictly ordered `water < path < foundation < propShadow < lapWaypoint < figureShadow < heroRing`, asserted over `Object.values(GROUND_Y)` so a later slice adding a rung must place it; `markerFor` maps the three statuses.

**`messages.test.ts`** — `pickProblem` and `pickSpeech` return exactly one message each, in `PROBLEM_ORDER` / `SPEECH_ORDER`; **a `lastMinute` banner does not suppress a toast** (the regression this design exists to prevent); a ceremony narration and a spell notice can be live simultaneously and the ceremony wins the lane without the notice being destroyed; `calm` turns a `toast` from `"cheer"` to `"plain"`; every field empty → both null; the exact action labels.

**`camera.test.ts`** (extended) — `worldToScreen` puts the camera target at the viewport centre; a point one unit east moves right and down by the derived amounts; the projection is linear (2 units is twice 1 unit); `edgeArrow` returns `null` for an on-screen target, a border point for each of the four off-screen directions with an angle that points away from the centre, and `null` for a zero-size viewport; the existing `followCamera` tests are untouched, as are `CAMERA_OFFSET` and `CAMERA_ZOOM`.

**`layout.test.ts`** (extended) — with and without `objectiveIds`, `props.map(({id,kind,position,size,solid}) => …)` is deep-equal and `colliders` is deep-equal (the village invariant, §3.14); `objectiveIds[0]` sets `focus: "objective"` on that site and `status: "objective"` on that villager; extras get `"tracked"` / `"work"`; complete buildings get `"done"` / `"built"`; a villager placement carries `label`, `done` and `total`; the existing assertion at :52-56 still passes.

**`play-clock.test.ts`** (extended) — `minutesToSettle` returns 0 when closed; rounds 30-59 s up and 0-29 s down; clamps to `minutesRemaining`; clamps to 30; adds pending records.

**`hud.test.ts`** (recess, extended) — `recessPillText` singulars and plurals, verbatim.

**`realm-help.test.tsx`** (updated in the same commit) — the five group titles; the two new Cast strings; **an assertion that no help string contains `protect the sites`**, so the deleted promise cannot come back by accident; the touch variant still contains no key names.

**`realm-hud.test.tsx`** (rewritten) — the three zones exist; mana, `Cleared`, `Gleams`, `Laps`, `Best` and the Ride button are **absent** from the HUD; the objective card renders each of the three `ObjectiveState` kinds with the exact copy; pips and numerals swap with `numerals` while the `aria-label` stays numeric at both; the preview line reads `Old Bram is waiting for Lily.`; `minutesRemaining: null` hides the counter.

**`realm-messages.test.tsx`** (new) — one problem and one speech message at a time; an error takes `role="alert"`; the container's `style.pointerEvents === "none"` and the action button's is `"auto"` (D10.1 — the assertion that stands in for the tap test jsdom cannot run); ceremony narration takes `.realm-message--stage`.

**`realm-shell.test.tsx`** (extended) — `flushPending` is called on unmount (the existing wrapper at :38-45 already counts calls); the objective passed into the mocked scene's `layout` marks the well for a new hero; the reach notice is set regardless of `readAloud`; `notice` and `ceremonyNotice` reach `RealmMessages` as two separate props; `setRealmDepth` is called when the help card's control is pressed and **not** called in preview; talking is possible with all eight villagers at every depth (the economy assertion, §3.19).

### What needs the browser pass

`realm-scene.tsx` cannot be unit-tested — it imports three, and Vitest runs in jsdom with no WebGL. The following are the browser pass, on the documented port-3100 `?preview` setup, with same-framing before/after screenshots of the two views the user photographed:

1. The gold ring sits under the hero and its notch turns with `W`, `A`, `S`, `D` — four screenshots, four directions.
2. Shadows do not bob. Record 3 s of the idle hero at 60fps and confirm the shadow's screen position is constant while the sprite's is not.
3. All eight nameplates are legible at the default zoom, and at `largerText`.
4. **The crown ceremony:** all eight plates, markers and shadows travel with their villagers to the plaza and back. This is the one that every proposal missed.
5. A tap on a distant villager walks the hero there and opens the SiteCard on arrival — on touch and with a mouse.
6. A `pointerdown` at top-centre, while a toast is showing, walks the hero. (The jsdom test asserts the property; only the browser proves the tap.)
7. The edge arrow appears when the objective is off camera and points at it while the hero circles the map.
8. `reducedMotion` and `lowStimulus`, both on: every mark is still present and nothing moves.
9. Frame-time and `onReady` measurement against the §3.13 budget.
10. Read-aloud: enter reach, finish a side quest, run a ceremony — three sentences, once each, no stutter.

---

## 8. Interfaces

### Produces

**`src/lib/realm/depth.ts`** — consumed by all twelve later slices
```ts
type RealmDepth = "simple" | "full"
type DepthOverride = "auto" | "simple" | "full"
type Surfaces = { numerals: boolean; trackedObjectives: number; abilitySlots: "earned"|"all";
                  keycapHints: boolean; listRows: number; districtDetail: boolean; fastTravel: boolean;
                  troubleNames: boolean; troubleDetail: boolean; troubleHitPips: boolean;
                  clearCount: boolean; bountyLedgerLine: boolean; lapTimes: boolean }
// This is the closed union. No later slice adds a field; see §3.1.
const DEPTH_OVERRIDES: DepthOverride[]
const DEFAULT_DEPTH_OVERRIDE: DepthOverride
function isDepthOverride(value: unknown): value is DepthOverride
function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth
function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces
```

**`src/lib/realm/objective.ts`** — consumed by 8 (spawn zones), 9 (tutorial steps), 10 (plots), 13 (the record)
```ts
type Objective = { buildingId: string; villagerId: string|null; label: string; villagerName: string|null; done: number; total: number }
type ObjectiveState = { kind: "unknown" } | { kind: "complete" } | { kind: "next"; objectives: Objective[] }
function objectiveRank(b: { done: number; complete: boolean }): 0|1|2
function rankBuildings<T extends { done: number; complete: boolean }>(buildings: T[]): T[]
function objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState
function pickObjective(buildings: SiteProgress[]): Objective | null
function riseToast(label: string, next: ObjectiveState): string
function objectiveSpeech(state: ObjectiveState): string | null
```

**`src/lib/realm/markers.ts`** — consumed by 4 (village props), 5 (village life), 7 (mount/companion shadows), 8 (trouble shadows), 10 (plots), 11 (the redraw)
```ts
function facingAngle(facing: Facing): number
function shadowFootprint(size: { w: number; d: number }): { w: number; d: number }
function markerFor(status: VillagerStatus): "quest" | "done" | null
const RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM
const SHADOW_OPACITY, SHADOW_OPACITY_CALM
const GROUND_Y: { water; path; foundation; propShadow; lapWaypoint; figureShadow; heroRing }
// Every ground decal in the programme takes its y from a NAMED rung here. No spec writes a y literal.
const BEACON: { radius; height; calmHeight; opacity; calmOpacity }
```

**`src/lib/realm/messages.ts`** — consumed by 6 (door prompts), 8 (combat feedback), 9 (tutorial banners), 12 (lap results), 13 (the session report)
```ts
type ProblemKind = "spriteError"|"kingdomError"|"ceremonyError"|"lastMinute"|"preview"
type SpeechKind = "ceremony"|"toast"|"notice"
type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string|null }
type RealmSpeech  = { kind: SpeechKind; text: string; tone: "stage"|"cheer"|"plain" }
type MessageInput = { spriteError; kingdomError; ceremonyError: string; lastMinute: boolean; preview: string|null;
                      ceremonyNotice; toast; notice: string|null; calm: boolean }
const PROBLEM_ORDER: ProblemKind[]
const SPEECH_ORDER: SpeechKind[]
function pickProblem(input: MessageInput): RealmProblem | null
function pickSpeech(input: MessageInput): RealmSpeech | null
```
*A later slice adding a message kind adds it to the union, to the ORDER array, and to the picker — it does not add a lane.*

**`src/lib/realm/camera.ts`** (added) — consumed by 4 (the reframe), 7 (fast-travel destinations), 12 (the lap ring)
```ts
type Viewport = { width: number; height: number }
type ScreenPoint = { x: number; y: number }
type EdgeArrow = { x: number; y: number; angle: number }
function worldToScreen(camTarget: Vec2, world: Vec2, viewport: Viewport, zoom?: number): ScreenPoint
function edgeArrow(camTarget: Vec2, target: Vec2, viewport: Viewport, opts?: { margin?: number; zoom?: number }): EdgeArrow | null
```

**`src/lib/realm/layout.ts`** (added) — consumed by 4, 5, 8, 10, 11
```ts
type PropFocus = "objective" | "tracked" | "done" | null
type VillagerStatus = "objective" | "work" | "built"
Prop.focus?: PropFocus
VillagerPlacement: { id; buildingId; position; status: VillagerStatus; label: string; done: number; total: number }
buildWorldLayout(input: { castleType; buildings; villagers?; banners?; objectiveIds? })
```
**`buildWorldLayout`'s input is additive-only, for the life of the programme.** Later slices add optional keys and never remove one, never rename one, and never republish a subset. The accumulated shape at the end of the programme is
`{ castleType; buildings; villagers?; banners?; objectiveIds?; seed?; density?; palette?; numerals? }`
— slice 5 adds `seed`, `density` and `palette` and **removes `decor`** (the old boolean flag, replaced by `palette`); slice 10 adds `numerals` and reads `Prop.focus` rather than taking a `focusId` of its own. **A spec that republishes a type it did not originate must show the full accumulated shape and diff it against the previous slice's version, never a remembered subset.** That rule governs `WorldLayout`, `PropKind`, `SpellEvent`, `SpawnInput`, `RealmBundle`, `RealmSettings`, `loadRealmFlags`'s return and `SpriteSource`'s props as much as it governs this one.

`WorldLayout` accumulates the same way. Its shape at the end of the programme, with the owning slice against each field:
```ts
type WorldLayout = {
  props: Prop[]; spawn: Vec2; colliders: Prop[]; villagers: VillagerPlacement[]; castleType: string;  // existing
  scenery: SeededProp[];          // slice 5
  districtSigns: DistrictSign[];  // slice 5 — the carved wooden district markers
  doors: Door[];                  // slice 6
  keepStage: KeepStage;           // slice 10
  keepSkinId: KeepSkinId;         // slice 10
  signs: SignModel[];             // slice 10 — the per-building signboards
};
```
`districtSigns` and `signs` are **two different objects** and keep two different names: slice 5's carved district markers and slice 10's per-building boards. Neither may be spelled the other way.

**`src/lib/realm/play-clock.ts`** (added) — consumed by 6 (doors), 9 (the one paused banner), 13 (the report)
```ts
const ROUND_UP_SECONDS = 30
function minutesToSettle(clock: PlayClock, pending: number): number
```

**`src/lib/realm/recess/hud.ts`** (added) — consumed by 12
```ts
function recessPillText(gleams: number, laps: number): string
```

**Schema / actions / bundle**
```
realm_settings.depth_override   text, enum auto|simple|full, NOT NULL DEFAULT 'auto', migration 0026
RealmSettings.depthOverride: DepthOverride
RealmBundle.depthOverride: DepthOverride
RealmBundle.depth: RealmDepth          // computed server-side from helpSeen + depthOverride; slices 3, 9, 12, 13 read this
setRealmDepth(childId: string, override: DepthOverride): Promise<void>   // src/lib/actions/realm-settings.ts
```
`RealmBundle.depth` exists so no later slice recomputes `realmDepth(...)` from two fields and gets a different answer. The server already knows `helpSeen` and `depthOverride`; it computes once and publishes the result beside them. `RealmOpen` still snapshots it in a `useState` initialiser, so nothing flips mid-visit.

`RealmBundle`, `RealmSettings` and `loadRealmFlags`'s return type accumulate across seven slices. Each spec that touches one **states the full accumulated shape at its own point in the programme**; the final shapes are recorded in the programme roadmap, `2026-09-10-realm-overhaul-roadmap.md`.

**Components**
```
<RealmMessages problem={RealmProblem|null} speech={RealmSpeech|null} arrowRef={RefObject<HTMLDivElement|null>}
               onAction={() => void} hudScale={number} />          // src/components/realm/realm-messages.tsx
<VillagerPlate villager={VillagerPlacement} surfaces={Surfaces} calm={boolean} motion={boolean}
               onPick={(id: string) => void} />                     // src/components/realm/villager-plate.tsx
RealmScene props added:  arrowRef: RefObject<HTMLDivElement|null>
                         surfaces: Surfaces
                         onVillagerPick: (id: string) => void
RealmHud props added:    objective: ObjectiveState; surfaces: Surfaces;
                         kingdomDone: number; kingdomTotal: number; recessPill: string | null
RealmHud props removed:  mana, cleared, notice, toast, calm, error, kingdomError, onKingdomRetry,
                         ceremonyError, onCeremonyRetry, onRetry, warning, ride
RealmHelp props added:   depth: RealmDepth; onSetDepth: ((d: RealmDepth) => void) | null   // null in preview / fewerChoices
```

**CSS custom properties, set on `.realm-root`** — consumed by 3 (the bar), 6 (doors), 12 (recess)
```
--realm-hud-scale   from settings.hudScale (1 | 1.25)
--realm-bar-bottom  1.25rem, or 9.5rem when settings.showStick
--realm-touch       56px
```

**CSS class names** — later slices restyle these, they do not rename them
```
.realm-hud-identity  .realm-hud-meta  .realm-hud-objective
.realm-messages  .realm-message  .realm-message--problem  .realm-message--stage
.realm-message--cheer  .realm-message--plain  .realm-edge-arrow
.realm-plate  .realm-plate-name  .realm-plate-tag  .realm-plate-badge
.realm-plate-badge--quest  .realm-plate-badge--done
.realm-pips  .realm-pip  .realm-pip--on
.realm-mana-pips  .realm-mana-pips--refused
.realm-mount-button  .realm-bubble-key
.realm-hud-chip                      /* §3.20 — the re-admitted quest-timer chip */
```
Plus one z-index change and one suppression rule (§3.20): `.realm-root` goes `z-index: 45` → **60**, and `body:has(.realm-root)` hides `.floating-dock`, `.quest-timer-popup` and `.schedule-notification-popup`.

**Routes** — none added. `/realm`, `/settings` and `/side-quests` are unchanged in shape.

### Consumes

Nothing from an earlier slice — this is slice 1. From the existing codebase:

```
src/lib/utils/kingdom.ts        BUILDINGS, buildingProgress
src/lib/services/deeds.ts       BuildingOverview
src/lib/realm/kingdom-state.ts  KingdomState, applyDeedResult
src/lib/realm/villagers.ts      VILLAGERS, villagerById, villagerForBuilding, nearestVillager, REACH
src/lib/realm/movement.ts       Facing, FACING_VEC, setTarget, stepHero, HERO_RADIUS
src/lib/realm/render-settings.ts RenderSettings (motion, calmPalette, showStick, hudScale)
src/lib/utils/learning-profile.ts LearningProfile, readingAttributes
src/lib/utils/side-quest-copy.ts SIDE_QUESTS_LOWER
src/lib/utils/speech.ts         speak, canSpeak
src/lib/realm/ceremony/ceremony.ts ceremonyNotice, CeremonyEvent   (read only; not modified)
src/components/game-icon.tsx    GameIcon, GameIconName
src/components/realm/use-play-clock.ts  usePlayClock().flushPending
```

---

## 9. Out of scope

Named, with the slice that owns each.

- **The sprite resolution fix, the scale ladder and the `/dev/figures` gallery.** `WORLD_SPRITE_SCALE` stays a fixed constant and minification stays 2.13x-5.33x with no mip chain. Nothing in this slice redraws a figure, precisely because the redraw would have to be done twice. → **slice 2**, which is the hard prerequisite for every art slice.
- **The ability bar.** The spell chips stay text pills of different widths, the cost still only shows on the selected chip, empty pages still impersonate abilities, and the bar still unmounts rather than dimming. The mana pips and the round mount button are interim tenants of the space the bar will own. → **slice 3**.
- **The mount slot, the mount picker, and the Spellbook button that can never disappear.** The `M` key and the interim button are the only ways to ride; the only `/spellbook` link is still behind an empty chip. → **slice 3**.
- **The village, the road network, the market plaza and the camera reframe.** The world stays 40 units with eight slots on a lawn. This slice ships the marker layer that a larger frame requires (a bigger frame without an off-screen objective arrow is how you lose a six-year-old) and changes no camera parameter. → **slices 4 and 5**.
- **The Tavern, the doors, and the siblings' board.** `Leave the Realm` is still a link to `/tavern`, now on a plate. → **slice 6**.
- **Fast travel and the companion's job.** `fastTravel` is defined in `depth.ts` and read by nobody. The companion still renders, follows, and does nothing — it gets a shadow here and a purpose there. → **slice 7**.
- **Combat legibility, the hero's dazzle and shield readouts, and the true help-card promise.** The `castState` event is still discarded (realm-shell.tsx:360), the dazzle still has no cue on the hero, there is still no hero health, and the help card now says nothing about stakes rather than something false. `troubleNames`, `troubleDetail`, `troubleHitPips`, `clearCount` and `bountyLedgerLine` are defined and unread. → **slice 8**.
- **Sound, the real tutorial, and the visible flip to full depth.** Between this slice and slice 9 the depth flip is silent and happens at a visit boundary, which is deliberate (§4). `tutorialComplete` is fed by `bundle.helpSeen` until then. → **slice 9**.
- **The nine floating DOM label pills, the plots that rise, the keep that is not a tent, and the villager whose building is finished still begging for help.** `builtGreeting` is not written here; a built villager still greets with `The bucket's dry again.` and `SiteCard` still shows `Begin` on a finished building. → **slice 10**.
- **The building redraw.** "The buildings are flat" stays literally true of the screen. Contact shadows here are the preparation: a footprint diamond is what a 3/4-isometric building will sit on. → **slice 11**.
- **Persisted gleams, lap times and best laps.** Best lap is deleted from the HUD in this slice rather than kept as a lie; gleams and laps survive only as a live pill during recess. → **slice 12**.
- **The kingdom completion state, the session report, `Raised by Emma · Spring 2026`, and the `deedsToBuild` migration.** `objectiveState` returns `complete` and the card says so in one line; nothing celebrates it, nothing records it, and no building carries a name. → **slice 13**.
- **Per-deed completion marks and `timesCompleted`.** `BuildingOverview.deeds` still has no done flag, so `SiteCard` still shows three identical `Begin` rows. → **slice 13**.
- **A quest log panel, a minimap or a compass.** The objective card answers "what am I here to do" for one to three buildings; it does not expand, and it links nowhere. → **slice 6** for the doors, **slice 13** for the whole-kingdom view.
- **An in-world pause menu.** **Refused for the whole programme**, with the ruling in slice 6 §9: the exit is two doors in the world, and the only interruption the metered clock forgives is the deed panel, because that is the one where a child is doing real schoolwork. A pause for standing still would make a five-minute grant unbounded.
- **`.realm-panel`'s `zoom` rule and the spell bar's second font-size base.** `--realm-hud-scale` ships here and the bar adopts it later. → **slice 3**.
