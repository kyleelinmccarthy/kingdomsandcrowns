# You can tell what to do — design

**Status:** approved in brainstorm, 2026-09-12
**Programme:** [Realm presentation overhaul](./2026-09-10-realm-overhaul-roadmap.md)
**Position:** inserted after slice 1 (*It's a game now*), before slice 2 (*Stop looking rough*)

---

## 1. What started this

The user played the Realm after slice 1 shipped and reported seven things:

> there is still no minimap in the upper right, the leave the realm, timer and question mark need moved to the bottom right.
> the buildings still look like shit. especially the castle.
> the player name should be in the bottom left
> the movement and casting still isnt clear between using mouse vs wasd and 1-4 vs clicking left click... this needs cleaned up/simplified.
> the quest log should be on the upper left.
> I still think there should be a tutorial somehow/somewhere.

Reading the two screenshots alongside the code turned up one thing they did not name, and reframed one thing they did.

**Every site is labelled twice.** `PropLabel` (`realm-scene.tsx:129`) renders `prop.label` and `prop.tag` over all nine props, and slice 1 added villager nameplates carrying the same words on top. The original verdict was that nine labels float over scenery; slice 1 made it eighteen.

**The castle is a tent because it is a tent.** `CASTLE_TIERS` is `campsite, cottage, watchtower, keep, manor, castle, fortress, citadel`, and `layout.ts:48` calls them "tent-sized to towering". The hero is on tier 1, so the beige triangle is a *campsite, drawn correctly*. The `castle` tier already has merlons, corner towers, a gate and two flags. Redrawing cannot fix this; only changing what decides the silhouette can.

## 2. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Sequence the layout work or the art first? | **Everything now**, accepting that the art gets a second pass after slice 2's sampling fix. |
| 2 | Which input model is primary? | **Keyboard-primary. The mouse drives the HUD and casting; it never walks and never talks.** |
| 3 | Cast binding | **`1`–`4` cast directly, and left click re-casts the selection.** `Space` is removed. |
| 4 | Talk binding | **`E`, an interact key**, not a talk key. |
| 5 | Movement teaching | The tutorial must teach **all four of WASD**, not `W` alone. |

Decision 1 is deliberately against the roadmap's first sequencing rule ("the sampling fix lands before any art is redrawn"). The cost is accepted and recorded: the building art in §5 will be re-rasterised at slice 2 and may be revised again at slice 11. §5.2 reduces that cost from a redraw to a re-sample.

## 3. The screen

### 3.1 Delete `PropLabel`

Remove the component and its two call sites' worth of markup, along with the `.realm-label` and `.realm-label-tag` rules. The villager nameplates become the only labels in the world. Slice 10 already planned this deletion ("the nine floating white-on-black pills … are deleted"); this pulls it forward.

A prop with no villager — the castle, decor, barriers — carries no label at all. Its identity comes from its shape and, from slice 10, from a signboard.

### 3.2 Four corners

Slice 1's three top zones (`identity` / `objective` / `meta`) are re-cut into four:

| Corner | Class | Contents |
|---|---|---|
| Upper left | `.realm-hud-objective` | The quest log: current site, who waits there, `n of 5`, then the next two sites |
| Upper right | `.realm-minimap` *(new)* | The minimap (§3.3) |
| Bottom left | `.realm-hud-identity` | Hero name, `n of 8 raised`, and the mana strip |
| Bottom right | `.realm-hud-meta` | Leave the Realm, minutes remaining, `?` |

Bottom-centre holds the ability bar and nothing else, which is the surface slice 3 will build on.

The three class names survive so their existing styling, tests and the depth-axis wiring carry over; only their placement and contents change. `.realm-mana-pips` moves inside `.realm-hud-identity`, which resolves the parked slice-3 finding that the mana strip overlapped the ability bar below 640px — it is no longer near it.

### 3.3 The minimap

A flat 2D readout drawn from the same `layout` the world already uses. No new art, no second scene, no `three`.

It shows: the village bounds; the hero as a gold dot with a facing tick; the eight building sites, hollow when unbuilt and filled when raised; the current objective as a gold ring; troubles as violet dots.

It is **not interactive** — tapping or clicking it does nothing. That keeps it entirely outside the input model of §4, which is the point of §4.

`Surfaces` gains one field, `minimap: "full" | "objectiveOnly"`, under the extension rule. At simple depth it shows the bounds, the hero and the objective and omits the site and trouble dots — a substitution, not a removal: the child still has a map, with less on it.

## 4. The controls

### 4.1 Five verbs

| Input | Does |
|---|---|
| `W` `A` `S` `D` | Walk, in any combination |
| `1`–`4` | Cast that spell, and make it the selection |
| Left click | Cast the current selection |
| `E` | Interact |
| `Esc` | Close whatever is open |

**Clicking the world never walks and never talks.** Left click casts, and that is the only thing it does in the world.

**`Space` is removed.** "1 or left click" is the answer to how you cast; a third binding would be exactly the hidden duplication this slice exists to delete.

### 4.2 Targeting

One rule: **the trouble you are pointing at, or the nearest one in range.** A mouse aims when the player wants it to; the number keys work without aiming.

With nothing in range, a cast **refuses** with the existing `.realm-mana-pips--refused` cue and costs no mana. This kills the parked bug where `Space` fired north into empty grass — tolerable when Space was a secondary binding, not tolerable now that casting is the primary verb.

### 4.3 Why `E` and not `Enter`

`E` is bound to *interact*, not to *talk*, because three later slices need the same verb for things that are not people: slice 6 turns the Tavern, Keep and Library into doors; slice 7 adds hitching posts; slice 10 adds readable signboards. Binding the key to talking would mean inventing a second key for doors.

The bubble keycap reads `Talk · E`. A door's will read `Enter · E`.

### 4.4 What comes out

Deleting tap-to-move and tap-to-talk removes slice 1's pending-talk state machine: `onVillagerPick`, `PENDING_TALK_MS`, the eight-second deadline, and its six clear sites. This is accepted work removal, not a regression — it is the duplication decision 2 exists to end.

### 4.5 Touch

Every verb survives without a keyboard:

| Verb | Touch |
|---|---|
| Walk | The on-screen stick, which now carries all movement |
| Cast | Tap an ability slot; a dedicated **Cast** button opposite the stick re-casts the selection |
| Interact | The bubble's Talk button |
| Close | The panel's own close control |

Tapping the world does nothing on touch. A stray tap while a spell was armed is already a logged complaint; a visible button is the deliberate version of the same action.

### 4.6 The legend

A single strip above the ability bar: `WASD move · 1-4 cast · E interact · Click cast`.

Always visible, desktop only — hidden on touch, where those keys do not exist and the buttons are self-describing. It is not in the help card. The user has twice reported that the controls are unclear, and a card you have to open is what failed both times.

### 4.7 The tutorial

Four steps, each gated on **doing**, not on reading:

| # | Prompt | Completes when |
|---|---|---|
| 1 | "Use W, A, S and D to walk." | The hero has travelled a threshold distance **and** used more than one of the four keys (the plan pins the distance; it must be reachable in a few seconds of ordinary walking) |
| 2 | "Go where the light is." | The hero reaches the objective site |
| 3 | "Stand close and press E." | The interaction panel opens |
| 4 | "Press 1." | A cast lands |

Step 1's two-key condition is deliberate: a child who only ever presses `W` has not learned to move, and telling them they have is how they get stuck later.

Step 2 teaches the beacon and the off-screen arrow together, without naming either.

The tutorial is persisted per hero, resumable across sessions, skippable by a parent, and re-runnable from the `?` card. It needs one new column; see §6.

Four steps rather than slice 9's eight, because steps 5–8 there teach troubles that read, doors, and the mount's job — none of which exist yet. **Slice 9 extends this tutorial rather than replacing it.**

## 5. The art

### 5.1 The keep's silhouette comes from progress

The cosmetic tier stops deciding the shape. **Kingdom progress — buildings raised, 0 through 8 — decides the silhouette; the chosen tier supplies its livery** (colours, banners, trim). This is the decision already taken during the overhaul brainstorm and parked in slice 10; it is pulled forward because it is the only thing that fixes the tent.

At 0 of 8 the hero sees a small but genuinely stone keep. It grows as they raise buildings.

### 5.2 Widen the sprite box first

Every figure draws into `viewBox="0 0 64 64"`. A correct 3/4 isometric base is a diamond wider than it is tall, so a square box forces each building to shrink to fit its own diagonal. This is the roadmap's "24% too narrow", and it is why no one *could* have drawn a good isometric building.

Widening the box off square is a small mechanical change, and it is what turns decision 1's cost from *draw the buildings twice* into *draw once now, re-sample at slice 2*. The drawn geometry survives; only the rasterisation changes.

The implementation plan pins the exact `viewBox`, governed by one constraint: **a building's isometric base diamond must fit at its full intended footprint without being scaled down to clear the box's diagonal.** All four entries in `WORLD_SPRITE_SCALE` (`castle`, `building`, `foundation`, `decor`) re-derive from whatever box is chosen, and every existing figure is re-centred in it — the box change is not per-family.

### 5.3 Foundations read as construction sites

At 0 of 8 raised, what the player mostly sees is eight flat tan slabs. Give an unbuilt site staked corners, a low stone course and a timber frame, so an empty village reads as one *being built* rather than one that is broken. This is slice 10's plot stage 1, pulled forward.

### 5.4 Redraw the eight buildings

In the widened box, each building gets a roof plane, a lit wall and a shaded wall, against one shared sun direction across the whole set.

## 6. Data

One migration: a tutorial-progress column on `realm_settings`, holding the highest completed step (0–4) and defaulting to 0. A constant-default add, the same safe shape as slice 1's `depth_override`.

Resetting it re-runs the tutorial, which is what the `?` card's control does.

## 7. What this deliberately does not do

- **The sampling fixes.** Ground shimmer, integer-pixel crispness at both screen densities, and trees being shorter than the people walking past them are slice 2's. The art here will be better *shaped* but no *sharper*.
- **Doors** (slice 6), **the mount's job** (slice 7), **troubles that read and pay** (slice 8), **sound** (slice 9), **recess persistence** (slice 12).
- **The full eight-step walkthrough** (slice 9), which extends §4.7 rather than replacing it.
- **Signboards in the world** (slice 10). §3.1 deletes the pills; it does not replace them.
- **Minimap interaction.** Never a control, in this slice or a later one.

## 8. Contracts this re-cuts

Slice 1 froze these. Each change is deliberate:

| Frozen thing | Change |
|---|---|
| Three top HUD zones | Become four corners (§3.2). Class names survive; placement changes. |
| `.realm-label`, `.realm-label-tag` | Deleted with `PropLabel` (§3.1). |
| `Surfaces` closed at thirteen fields | Gains `minimap`, making fourteen (§3.3). |
| `PENDING_TALK_MS`, the six clears, `onVillagerPick` | Deleted (§4.4). |
| The sprite `viewBox` | Widened off square (§5.2). |
| Castle tier decides the silhouette | Progress decides it; tier becomes livery (§5.1). |

Unchanged and still binding: `GROUND_Y` as the single source of every ground-decal y; the ring, beacon and shadow constants; `--realm-touch` at 56px for world controls and 44px for panel buttons; depth never being a word a child reads; `World` staying memoised with referentially stable props; no `three` under Vitest.

## 9. Testing

The split established in slice 1 holds: pure modules carry the tests, scene files carry none.

- **Pure and testable:** minimap projection (world → map coordinates, including the hero tick and the hollow/filled rule), the targeting rule of §4.2 including the refusal, tutorial step advancement including step 1's two-key condition, the keep's progress→silhouette mapping, and the four-corner surface table at both depths.
- **Component tests:** the legend renders on desktop and not on touch; the four corners hold what §3.2 says; the tutorial prompt advances and persists; `Esc` closes.
- **Not unit-testable, gated by typecheck, lint and a browser pass:** everything in `realm-scene.tsx`, the art itself, and the touch Cast button's placement.
- **A browser harness needs a negative control.** Slice 1's acceptance harness carried ten defects that each silently produced a *wrong* answer, and it reported success by construction until corrected. Any harness this slice builds proves it can fail before its results are believed.

## 10. Two plans, not one

§3, §4 and §6 — the screen, the controls, the tutorial and its migration — share no code with §5, the art. They are independent subsystems that happen to ship together, so this spec produces **two implementation plans, executed in order**:

1. **The screen and the controls** (§3, §4, §6). Unblocked, and it is what makes the game legible and teachable.
2. **The art** (§5). Depends on nothing in plan 1 except that the keep's new silhouette rule feeds the minimap's "filled when raised" dot, so the minimap's site states must exist first.

Splitting them keeps each plan reviewable and lets plan 1's result be played before plan 2's art lands.

## 11. Risks

| Risk | Mitigation |
|---|---|
| The art is redrawn twice | Accepted by decision 1; §5.2 reduces it to a re-rasterise |
| Deleting tap-to-talk strands touch users | §4.5 routes every verb through a visible control before the deletion lands |
| Four corners crowd a phone | Slice 1 measured the HUD ending at y317 of 844 at `hudScale` 1.25 with the longest content; the four-corner split has more room than the three-zone row it replaces, but it is measured, not assumed |
| `Surfaces` grows without discipline | One field, named in §8, under the same extension rule slice 1 used once |
