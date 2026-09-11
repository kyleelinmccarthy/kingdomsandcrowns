# The village takes shape: districts, roads and a way through them

**Date:** 2026-09-10
**Status:** Design spec. Written up front per programme decision 1; the implementation plan for this slice is written at build time, not now.
**Programme:** The Realm Presentation Overhaul, `docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`. Slice 4 of 13 (`village-ground`), large.
**Depends on:** slice 1 `first-impression` (the beacon, the `!`, `edgeArrow`, `depth.ts`), slice 2 `sprite-budget-and-gallery` (the parallelised, warm, kind-keyed raster cache and the mip chain — a hard dependency, see §3.9).
**Depended on by:** `village-life` (5), `doors-and-the-tavern` (6), `fast-travel-and-the-companion` (7), `troubles-that-read-and-pay` (8), `plots-signs-and-the-keep` (10), `building-redraw` (11), `recess-that-counts` (12), `record-of-the-work` (13). Every one of those is sited in coordinates this slice publishes.
**Applies decisions:** D2 (the full village — the first of the two extra large slices the user accepted) and D5 (the mount — this slice creates the distance fast travel exists to solve, and publishes the road graph riding will follow).

---

## 1. Why — the complaints and audit findings this answers

The user's verdict, the clause this slice is built against:

> should be WAY more development in the world

And the clause every slice is built against:

> this doesnt feel like a well thought out game at all.

### 1.1 The findings, quoted

**"should be WAY more development in the world"** — _blocking, large effort_

> The world is 40x40 = 1600 sq units and 9.2% of it is occupied. A fresh player's layout is 44 props: 1 castle (a 2x2 campsite footprint), 15 flat 2x2 path tiles, 8 site diamonds (67 sq units), 8 villagers, 12 decorations -- 147 sq units total, the rest identical tiling grass. Worse, the camera frames all of it at once: orthographic zoom 40 at the 35.26-degree isometric angle gives 37.8 x 36.8 world units at 1512x850, and 48 x 46.8 at 1920x1080 -- larger than the entire world. There is nothing off-screen, nothing to walk toward, no reveal. And 10 of the 12 decorations sit at |x| >= 13.5 (DECOR_SPOTS), i.e. on the outer rim outside the play corridor where sites live at |x| <= 9 -- they are framing, not content.
>
> *Where:* `src/lib/realm/layout.ts:7, src/lib/realm/layout.ts:90-103, src/lib/realm/layout.ts:127-179, src/lib/realm/camera.ts:49-50`
>
> *Fix:* Two separate moves. (1) Zoom in so the world is bigger than the screen: raise CAMERA_ZOOM to ~64-80 so the frame is ~19-24 units and the player has to travel to discover things; that alone turns a diorama into a place. (2) Fill the interior, not the rim.

**implied — "WAY more development" / the road goes nowhere** — _major, medium effort_

> The road is a single 2-unit-wide straight line at x=0 from z=17 down to z=-11 (15 tiles), and it passes nothing. The eight sites sit at |x| in {5,6,7,9}, so every one of them is 5 to 9 units off the road, reachable only by walking across open grass. There are no side paths, no junction, no plaza, no square. The 'Market Square' at (-5,-6) is a single market-stall figure standing alone in a field -- it is an object, not a square. The road exists to point at the castle and does nothing else, which is why the field between road and sites reads as unclaimed lawn.
>
> *Where:* `src/lib/realm/layout.ts:131-135, src/lib/realm/layout.ts:47-56`
>
> *Fix:* Grow the path into a road network: a spur from the main road to each site's front door, a widened cobbled plaza at the castle's south face, and a market square as an actual paved area.

**implied — the hero stands in a large empty field with no edge** — _major, small effort_

> The world has no edges. movement.ts clamps the hero to +/-19.55 (WORLD_SIZE/2 - HERO_RADIUS), but realm-scene draws the ground as a 120x120 plane -- WORLD_SIZE*3 -- so the player walks into an invisible wall with 50 units of identical grass stretching visibly past it in every direction. There is no fence, wall, cliff, water or treeline marking the boundary. PropKind includes "barrier" and realm-scene has a full render path for it, but buildWorldLayout never creates one.
>
> *Where:* `src/lib/realm/movement.ts:17-21, src/components/realm/realm-scene.tsx:266, src/lib/realm/layout.ts:127-179`

**implied — "silhouette readability"** (the bridge half of it) — _major, medium effort_

> BuildingFigure "bridge" paints its own river (#1e3a8a fill across the bottom of the figure) but the layout has no water anywhere -- so the completed River Bridge is a bridge with a painted puddle sitting in a dry field at (-7,0), and its description reads "A crossing that holds in any weather."
>
> *Fix:* Cut a river through the layout -- a band of water tiles crossing z ~ 0 -- and move the bridge slot onto it so the bridge is a crossing; the river also breaks the empty field in half for free.

**"the world still looks pretty rough"** (the road half of it) — _major, medium effort_

> The cobble path is worse: each path tile is its own 2x2 plane with repeat 1, so the 8-px stone pattern restarts at every tile boundary -- 15 visible seams down a 30-unit road.
>
> *Where:* `src/components/realm/realm-scene.tsx:269-274`
>
> *Fix:* For the path, render it as one continuous strip mesh with a UV repeat proportional to length instead of 15 independent quads.

**The world goes inert at the finish line** — from the slice-9 draft, and the reason objection (a) is load-bearing:

> A completion state at 8 of 8, which does not exist anywhere in the codebase [...] spawnTroubles only spawns at foundations, so a finished kingdom currently has zero enemies and an ability bar with nothing to point at.

**The wedge, named before the walls existed** — from the slice-4 draft:

> Strengthen unstickHero before any walls exist: it currently resolves a single overlapping collider and only pushes south, so a gated plaza will trap a child.

**Enemies materialise next to you** — _major, small effort_

> spawnTroubles places a new trouble 3-5 units from its site and only checks clearance against colliders, villagers (1.5), path props (2.5) and the fixed SPAWN point (4) -- it never considers where the HERO currently is (troubles.ts:91-99). So an enemy can materialise a couple of units from the player.

**And the objection the brief raised against building this at all** (Q3), which decision 2 converts into this slice's job:

> It is the most exciting version and it is also the one the engineering read says will starve enemy spawns, wedge the hero on new walls, and push the sprite rasterisation past 60 on a path that already blocks first paint.

§3.9 answers all four in code.

### 1.2 What this slice does not answer

It does not paint anything. Every finding about how the world *looks* — flat buildings, the teepee, the green-on-green garden, the missing shadows, the dead `BUILDING_COLORS` palette, the 12 rim decorations — belongs to slices 5, 10 and 11. This slice builds the ground plan those slices stand on, and it is deliberately judged on shape, not on paint.

---

## 2. Decisions

| # | Decision | Ruling |
|---|---|---|
| D-VG-1 | World size | `WORLD_SIZE` 40 → **64**. Every downstream bound is re-derived from it or replaced by an explicit village constant; none is re-typed. |
| D-VG-2 | Who owns village geography | A new pure `src/lib/realm/village.ts`. `BUILDING_SLOTS` **moves** there from `layout.ts`; `layout.ts` re-exports it so no caller breaks. `village.ts` imports only `type { Vec2 }` from `layout.ts` (type-only, erased at compile time — no runtime cycle). |
| D-VG-3 | District count and names | Eight, one per named place a child can be told they are in: Gate Quarter, Market Plaza, Scholars' Row, Chapel Hill, Millrace, Garden Terrace, Keep Approach, Watch Hill. They partition the walled area exactly; outside the wall is `null`. |
| D-VG-4 | Road geometry | Every street and every spur is **axis-aligned**. That is not an aesthetic choice: it makes the corridor-clearance invariant a rectangle test instead of a segment-box distance test, it makes the town read as a plan rather than as spaghetti, and it makes the merged road geometry 4 verts per edge. |
| D-VG-5 | Road rendering | One merged `BufferGeometry` built from `ROAD_QUADS`, one mesh, one cobble material, UVs scaled by quad length so the stone runs continuously. `PropKind "path"` props remain in the layout **as data** for clearance rules and are never rendered individually. 15 meshes today → 1. |
| D-VG-6 | The world's edge | A town wall ring of `barrier` props at \|x\| = 30, z = ±30, with a gate in the south wall. `PropKind` already has `barrier` and `realm-scene.tsx:316-324` already renders it; `buildWorldLayout` has never emitted one. |
| D-VG-7 | Water | An east–west river band, `z ∈ [-5.75, -2.25]`, running from the west wall to a spring pool in the east — **not** the full width. Two crossings: the River Bridge on the Kingsway and the Mill Ford on West Street. The east side of the map is dry, so Watch Hill and Chapel Hill are not behind a chokepoint. |
| D-VG-8 | The bridge is walkable | The River Bridge is the one kingdom building that stays `solid: false` when complete. `WALKABLE_BUILDINGS = new Set(["bridge"])`. Its plot is the gap between two water colliders, so the crossing exists from a child's first visit and completing it never unlocks or locks anything. |
| D-VG-9 | Enemy spawning | `spawnTroubles` stops filtering `p.kind === "foundation"` and takes **zones**. A finished kingdom keeps its enemies. Shared module `open-ground.ts`. |
| D-VG-10 | Gleam spawning | `spawnGleams` takes the same zones. One module, one answer, no second rejection sampler. |
| D-VG-11 | Camera | `CAMERA_ZOOM` 40 → **64**, plus a 2.5-unit follow deadzone and a 3-unit look-ahead in the facing direction, plus a clamp so the frame never shows past the wall. This is the only camera change in the whole programme and it lands after slice 1's markers, per the sequencing rule. |
| D-VG-12 | Villager positions | `villagerPosition(slot, footprint)` (always due south) is replaced by `villagerStandFor(buildingId)` — the doorstep, 1.55 units outside the building's grown footprint on its door face. The Mill's old south-facing stand would have put Miller Tessa in the millrace. |
| D-VG-13 | Long walks | Tap-to-walk beyond `ROUTE_MIN_DISTANCE` (12 units) follows the road via `routeBetween` instead of a straight line. This is for **reliability, not speed** — a straight grass line is often shorter and remains available for short taps. |
| D-VG-14 | Ceremony and lap routes | Both re-pathed onto `roadPath`. The recess lap is **laid once, here**, as `COURSE_NODES` — a 13-node, 128-unit closed circuit, 36.6 s on foot — sized to slice 12's 35–48 s budget and guarded by a test, so slice 12 consumes it rather than re-routing the town. `LAP_WAYPOINTS`, `LAP_ROUTE`, `LAP_START` and `WAYPOINT_RADIUS` are deleted. |
| D-VG-15 | The metered cost, stated | The worst district-to-district walk is **70 road units = 20.0 s on foot**. §3.10 writes the whole table. This is over the 12-second line, so slice 7 is not optional: it is the fix for a cost this slice introduces. |
| D-VG-16 | Schema | **No migration.** This slice adds no column. The one column a returning-to-your-district feature would want (`last_district`) belongs with slice 7, where fast travel gives it meaning. §4 says so plainly rather than inventing 0026. |
| D-VG-17 | Rasterisation | **+1 tile kind (water), +0 sprite kinds.** Roads, plazas, walls, the gate and the water are geometry and tiles, not sprites. §3.9(c). |
| D-VG-18 | Calm mode | Roads, plazas, walls, the gate and the water are emitted **regardless of `calmPalette`**. A low-stimulus child gains structure; they never lose content. `decor: !calmPalette` stays broken until slice 5 — this slice must not make it worse and does not. |

---

## 3. Design

### 3.1 The world, and the constants that follow it

`WORLD_SIZE` goes 40 → **64**. Half-extent 32. Every bound below is derived or replaced; none is re-typed as a new magic number.

| Constant | Where | Today | After | How |
|---|---|---|---|---|
| `LIMIT` (movement) | `movement.ts:17` | `WORLD_SIZE/2 - HERO_RADIUS` = 19.55 | 31.55 | Already derived. Becomes a **backstop**, not a wall: the town wall stops the hero at 29.05. |
| `LIMIT` (troubles) | `troubles.ts:44` | `WORLD_SIZE/2 - 1` = 19 | **deleted** | Replaced by `SPAWN_ZONES` bounds and `isOpenGround`. |
| `LIMIT` (recess) | `recess.ts:35` | `WORLD_SIZE/2 - 2` = 18 | **deleted** | Same. |
| `GRASS_REPEAT` | `sprite-source.tsx:37` | `(WORLD_SIZE*3)/TILE_WORLD` (slice 2 set the period to 3.2) | **`GROUND_SIZE / TILE_WORLD` = 88 / 3.2 = 27.5** | New `GROUND_SIZE = WORLD_SIZE + 24` = 88, so grass shows past the wall but the void never does. The divisor is `TILE_WORLD`, imported from `tiles.ts`, **not the literal 2** — slice 2 doubled the tile period from 2 to 3.2 precisely to break the visible repeat, and dividing by 2 here would silently undo it. `tiles.test.ts` gains `GRASS_REPEAT * TILE_WORLD === GROUND_SIZE`, so no future world-size change can revert it by arithmetic. |
| Ground plane | `realm-scene.tsx:266` | `WORLD_SIZE*3` = 120 | `GROUND_SIZE` = 88 | With the camera clamp (§3.8) the plane edge is never in frame. |
| `CASTLE_POSITION` | `layout.ts:29` | (0, −14) | **(0, −24.5)** | Keep Approach, at the head of the Kingsway, with its back to the north wall. The half-unit north of the obvious −24 buys slice 10's grown 12 × 9 citadel 0.8 units of clearance from the North Way's corridor instead of 0.3 — see `KEEP_PRECINCT`, §3.5. |
| `SPAWN` | `layout.ts:30` | (0, 15) | **(0, 26.5)** | Two and a half units inside the gate. |
| `GATE_Z` | `layout.ts:31` | 17 | **28.5** | The gate node. |
| Spawn facing | `realm-scene.tsx:73` | `"s"` | `"n"` | You walk in through the gate facing the town, not out of it. |
| `BUILDING_SLOTS` | `layout.ts:47-56` | 8 slots on a 40-lawn | moved to `village.ts`, re-sited | §3.3 |
| `DECOR_SPOTS` | `layout.ts:90-103` | 12 hand-typed spots | `decorSpots(seed)` via `openPoints` | Minimum viable re-siting so nothing stands on a road; slice 5 replaces it with seeded clusters. |
| `ceremonyMarks` | `ceremony.ts:49` | derived from layout | unchanged | Already derived from the castle prop, so it follows the keep for free. The **walk** changes (§3.7). |
| `COURSE_NODES` | `recess.ts:25-34` | 8 hand-typed ring points (`LAP_WAYPOINTS`) | a 13-node road circuit, §3.8 | The lap is **defined once, here**, at the length slice 12 needs. `LAP_WAYPOINTS`, `LAP_ROUTE`, `LAP_START` and `WAYPOINT_RADIUS` are deleted **in this slice**; slice 12 builds its course object from `COURSE_NODES`. |

Orientation, stated once because every number below depends on it: **+z is south, −z is north, +x is east.** The gate is south, the keep is north.

### 3.2 The districts

`DISTRICTS` is ordered south to north, then west to east. `districtAt(p)` returns the first district whose bounds contain `p`; ties resolve to array order; a point outside the wall returns `null`. The eight bounds partition the walled area exactly.

| id | `name` (the child reads this) | `centre` | `entrance` (node) | `entranceFacing` | bounds x | bounds z | `buildingIds` |
|---|---|---|---|---|---|---|---|
| `gate-quarter` | Gate Quarter | (0, 21) | `gate-square` (0, 21) | `n` | [−29, 29] | [16, 29] | `["well", "tavern"]` |
| `scholars-row` | Scholars' Row | (−19, 9) | `library-door` (−13, 9) | `w` | [−29, −11] | [1, 16] | `["library"]` |
| `market-plaza` | Market Plaza | (0, 9) | `plaza-s` (0, 15) | `n` | [−11, 11] | [1, 16] | `["market"]` |
| `chapel-hill` | Chapel Hill | (19, 9) | `chapel-door` (13, 9) | `e` | [11, 29] | [1, 16] | `["chapel"]` |
| `millrace` | Millrace | (0, −9) | `bridge-s` (0, −1) | `n` | [−29, 29] | [−16, 1] | `["mill", "bridge"]` |
| `garden-terrace` | Garden Terrace | (−25, −17) | `west-north` (−19, −17) | `w` | [−29, −9] | [−29, −16] | `["garden"]` |
| `keep-approach` | Keep Approach | (0, −17) | `keep-approach` (0, −17) | `n` | [−9, 9] | [−29, −16] | `[]` |
| `watch-hill` | Watch Hill | (25, −17) | `east-north` (19, −17) | `e` | [9, 29] | [−29, −16] | `["watchtower"]` |

**`entrance` and `entranceFacing`** are published because two later slices need a named, on-road, inside-the-district point per district and would otherwise each invent one: slice 5 stands its carved district sign there facing into the district, and slice 7 plants its hitching post there. Every `entrance` is a `ROAD_NODES` id and `village.test.ts` asserts each lies inside its own district's bounds. `entranceFacing` is the direction a child is facing as they walk **in** — the way the sign reads and the way a dismounting rider is left pointing.

Every `centre` is exactly a road node position. That is deliberate: the centre is the district's **arrival point** — where the ceremony walk aims, where a recess lap passes, and where slice 7's fast travel sets a rider down. It is never a point in a field.

`Keep Approach` carries no building and, by decision, no spawn zone (§3.4). It is the coronation ground and it stays clear.

**Arrival is announced, but not by this slice.** Crossing a district boundary is a real event and a child should be told where they are — but the announcement is built **once**, in slice 5 (`village-life`), which is also the slice that carves the wooden sign a child can tap to hear it again. Building a pill here and a sign there would put two announcements on screen for the same crossing. So this slice ships the *detection* and the *words*, and slice 5 ships the surface:

- `districtAt(p)` — the boundary test, called once per frame against a `lastDistrict` ref.
- `District.name` — `Gate Quarter`, `Scholars' Row`, `Market Plaza`, `Chapel Hill`, `Millrace`, `Garden Terrace`, `Keep Approach`, `Watch Hill`.
- `District.label` — the same names in a sentence: `the Gate Quarter`, `Scholars' Row`, `the Market Plaza`, `Chapel Hill`, `the Millrace`, `the Garden Terrace`, `the Keep Approach`, `Watch Hill`.
- `District.spoken` — written for the ear, and the single source for both `speak()` and the `aria-live` string: `You're in the Gate Quarter.` · `You're on Scholars' Row.` · `You're in the Market Plaza.` · `You're on Chapel Hill.` · `You're at the Millrace.` · `You're on the Garden Terrace.` · `You're at the Keep Approach.` · `You're on Watch Hill.`

Slice 5's `DISTRICT_SIGN_COPY` supplies the rest — the arrival line at each depth, the emblem, and the carved name on the board — and reads `spoken` from here rather than re-declaring it. This slice therefore ships **no CSS class, no message-lane entry and no depth key** of its own; §3.11 has exactly one visible string, and it is a recovery message.

**Boundary jitter** is still this slice's problem, because it is a property of `districtAt`: the detection is gated on a `lastDistrict` ref plus a 1.5-second minimum between changes, so a child pacing a line cannot make anything stutter. Slice 5 consumes an already-debounced signal.

### 3.3 The eight sites

`BUILDING_FOOTPRINTS` gives each building its own ground footprint, **and it is the only footprint table in the programme**. It lives here, in `village.ts`, because a footprint is a town-plan fact before it is anything else: it is the collider, the road clearance, the door point, the villager stand, the contact-shadow size, the sign position and the sprite quad, and every one of those is computed from this table and from nowhere else.

The table carries `{ w, d, h }`. **`w` and `d` are this slice's**, derived from the street plan below. **`h` is slice 2's scale ladder**, which publishes heights only (`BUILDING_HEIGHTS`) and ships no footprint of its own. Slice 11 computes every quad, viewBox and texture size from `buildingFootprint(id)` and publishes no third table. There is no fallback branch: slice 2 ships two slices earlier, so `BUILDING_HEIGHTS` exists by the time this module is written.

| building | `slot` | w × d × h | grown box (± `HERO_RADIUS` 0.45) | door face | `SITE_DOORS[id].node` | spur? | villager stand |
|---|---|---|---|---|---|---|---|
| `well` | (−7, 21) | 3 × 3 × 3.0 | x[−8.95, −5.05] z[19.05, 22.95] | east | `well-door` (−3.5, 21) | yes, from `gate-square` | (−3.5, 21) |
| `tavern` | (10.5, 24.5) | 7 × 6 × 7.0 | x[6.55, 14.45] z[21.05, 27.95] | **west** | `tavern-door` (5.0, 24.5) | yes, from `gate-apron` | (5.0, 24.5) |
| `market` | (7, 4) | 6 × 4 × 3.0 | x[3.55, 10.45] z[1.55, 6.45] | south | `market-door` (7, 9), on the Market Cross | no | (7, 8) |
| `library` | (−13, 14.5) | 6 × 5 × 4.5 | x[−16.45, −9.55] z[11.55, 17.45] | south | `library-door` (−13, 9), on the Market Cross | no | (−13, 10) |
| `chapel` | (13, 15) | 5 × 6 × 6.0 | x[10.55, 15.45] z[11.55, 18.45] | south | `chapel-door` (13, 9), on the Market Cross | no | (13, 10) |
| `mill` | (−13, −14) | 5 × 5 × 6.0 | x[−15.95, −10.05] z[−16.95, −11.05] | south | `mill-door` (−13, −9), on Millrace Lane | no | (−13, −9.5) |
| `bridge` | (0, −4) | 6 × 5 × 2.5 | **not a collider** — walkable, D-VG-8 | — | the Kingsway crosses it | — | (4, −1.5) |
| `garden` | (−25, −24) | 7 × 6 × 2.0 | x[−28.95, −21.05] z[−27.45, −20.55] | south | `garden-door` (−25, −19) | yes, from `garden-jct` | (−25, −19) |
| `watchtower` | (25, −24) | 3 × 3 × 9.0 | x[23.05, 26.95] z[−25.95, −22.05] | south | `watch-door` (25, −20.5) | yes, from `watch-jct` | (25, −20.5) |

**Nine plots, eight of them kingdom buildings.** The ninth is the **Tavern**, slice 6's inn and the world's exit. It is sited here rather than reserved in slice 6 for the same reason every other footprint is: it is the largest new solid in the programme (7 × 6 × 7 — taller than everything but the Watchtower and the keep) and it has to be in the table `layout.test.ts` asserts non-overlap over, not proved in prose in another document. `village.ts` also exports `KINGDOM_BUILDING_IDS: ReadonlySet<string>` — the eight — so `buildWorldLayout` knows which plots are driven by kingdom progress and which is simply always there.

**The Tavern's clearances, derived from the numbers above rather than asserted:**

| claim | arithmetic | result |
|---|---|---|
| clears the Kingsway | corridor is x ∈ [−2, 2] grown to [−2.45, 2.45]; the Tavern's grown west face is 6.55 | **4.10 units** |
| clears the gate apron | apron is x[−4, 4] z[24, 29]; grown west face 6.55 | **2.55 units** |
| clears the town wall | east wall inner face 29.5, grown 29.05; grown east face 14.45 | **14.60 units** |
| clears the south wall | south wall inner face 29.5 grown 29.05; grown south face 27.95 | **1.10 units** |
| door is reachable | drawn west wall at x = 7.0; door node at x = 5.0; the hero stands `HERO_RADIUS` from the node | **2.00 units, inside `REACH` 2.5** |
| door is a short walk from `SPAWN` | `SPAWN` (0, 26.5) → `tavern-door` (5.0, 24.5) = √(25 + 4) | **5.39 units, 1.5 s at `HERO_SPEED`** |

The Tavern sits **east** of the Kingsway, mirroring the Well on the west, so a child walking in through the gate has a landmark on each hand and the world's exit is the first building they can see. `SPAWN` stays at **(0, 26.5)** — dead centre of the gate apron, facing north — and no other spec may restate it.

`gate-green-east`'s spawn zone is cut back from x[11, 28] to **x[15, 28]** so no trouble, gleam or prop can ever be placed inside the Tavern's grown box (§3.7).

**The doorstep rule.** A door node sits `DOORSTEP = 1.55` units outside the building's grown footprint on the outward normal of its door face. Where that point already falls inside a street corridor, the door node *is* a node on that street and there is no spur (`SITE_DOORS[id].spur === false`). Where the building is set back, a short axis-aligned spur runs from the nearest street node to the door node.

The doorstep rule also quietly answers the audit's "~2-unit invisible dead zone in front of every building": a hero walking to a door node stands `HERO_RADIUS + 1.55` = 2.0 units from the drawn wall, which is inside `REACH` (2.5), so the door is always in reach from a point the road actually takes you to.

**Carpenter Aldo** stands beside the bridge, not on it, at (4, −1.5) on the south bank, east of the deck — clear of the Kingsway corridor (x ∈ [−2, 2]) so he is never in the way of a rider.

### 3.4 The road network

Six streets, all axis-aligned, named because slice 5 will sign them and slice 7 will route along them.

| Street | Axis | Extent | Width | Notes |
|---|---|---|---|---|
| **The Kingsway** | x = 0 | z 28.5 → −17 | 4 | Gate to Keep Approach. Crosses the river on the River Bridge. |
| **The Market Cross** | z = 9 | x −19 → 19 | 4 | Scholars' Row to Chapel Hill through the plaza. Three doors open straight onto it. |
| **West Street** | x = −19 | z 9 → −17 | 3 | Crosses the river at the Mill Ford. |
| **East Street** | x = 19 | z 9 → −17 | 3 | Dry the whole way. |
| **Millrace Lane** | z = −9 | x −19 → 19 | 3 | The north bank. The Mill's door opens onto it. |
| **The North Way** | z = −17 | x −25 → 25 | 3.5 | Garden Terrace to Watch Hill across the head of the Kingsway. |

`ROAD_NODES` — 28 nodes, of which 8 are door terminals.

| id | position | district |
|---|---|---|
| `gate` | (0, 28.5) | `gate-quarter` |
| `gate-apron` | (0, 24.5) | `gate-quarter` |
| `tavern-door` | (5.0, 24.5) | `gate-quarter` |
| `gate-square` | (0, 21) | `gate-quarter` |
| `well-door` | (−3.5, 21) | `gate-quarter` |
| `plaza-s` | (0, 15) | `market-plaza` |
| `plaza` | (0, 9) | `market-plaza` |
| `plaza-w` | (−11, 9) | `market-plaza` |
| `plaza-e` | (11, 9) | `market-plaza` |
| `plaza-n` | (0, 3) | `market-plaza` |
| `market-door` | (7, 9) | `market-plaza` |
| `library-door` | (−13, 9) | `scholars-row` |
| `row` | (−19, 9) | `scholars-row` |
| `chapel-door` | (13, 9) | `chapel-hill` |
| `hill` | (19, 9) | `chapel-hill` |
| `bridge-s` | (0, −1) | `millrace` |
| `bridge-n` | (0, −9) | `millrace` |
| `ford-s` | (−19, −1) | `millrace` |
| `lane-w` | (−19, −9) | `millrace` |
| `mill-door` | (−13, −9) | `millrace` |
| `lane-e` | (19, −9) | `millrace` |
| `west-north` | (−19, −17) | `garden-terrace` |
| `garden-jct` | (−25, −17) | `garden-terrace` |
| `garden-door` | (−25, −19) | `garden-terrace` |
| `keep-approach` | (0, −17) | `keep-approach` |
| `east-north` | (19, −17) | `watch-hill` |
| `watch-jct` | (25, −17) | `watch-hill` |
| `watch-door` | (25, −20.5) | `watch-hill` |

(28 rows, counted: 20 street and junction nodes plus 8 door terminals — `tavern-door`, `well-door`, `market-door`, `library-door`, `chapel-door`, `mill-door`, `garden-door`, `watch-door`. `village.test.ts` asserts the row count matches `ROAD_NODES.length`, so the table and the module cannot drift apart, and asserts connectivity from `gate` besides.)

`ROAD_EDGES: [fromId, toId, width][]` — 31 edges:

`gate`–`gate-apron` 4 · `gate-apron`–`tavern-door` 2.5 (the Tavern spur, along z = 24.5) · `gate-apron`–`gate-square` 4 · `gate-square`–`well-door` 2.5 · `gate-square`–`plaza-s` 4 · `plaza-s`–`plaza` 4 · `plaza`–`plaza-w` 4 · `plaza-w`–`library-door` 4 · `library-door`–`row` 4 · `plaza`–`market-door` 4 · `market-door`–`plaza-e` 4 · `plaza-e`–`chapel-door` 4 · `chapel-door`–`hill` 4 · `plaza`–`plaza-n` 4 · `plaza-n`–`bridge-s` 4 · `bridge-s`–`bridge-n` **5** (the deck is wider than the road) · `bridge-n`–`keep-approach` 4 · `bridge-n`–`mill-door` 3 · `mill-door`–`lane-w` 3 · `bridge-n`–`lane-e` 3 · `row`–`ford-s` 3 · `ford-s`–`lane-w` 3 (the Mill Ford) · `lane-w`–`west-north` 3 · `hill`–`lane-e` 3 · `lane-e`–`east-north` 3 · `west-north`–`garden-jct` 3.5 · `garden-jct`–`keep-approach` 3.5 · `keep-approach`–`east-north` 3.5 · `east-north`–`watch-jct` 3.5 · `garden-jct`–`garden-door` 2.5 · `watch-jct`–`watch-door` 2.5

(31 edges listed. `village.test.ts` asserts `ROAD_EDGES.length === 31` and that every endpoint is a known node id, so a hand edit to either table fails the build rather than silently disconnecting a district.)

The graph is connected and contains cycles — `plaza → plaza-w → row → ford-s → lane-w → bridge-n → plaza-n → plaza` is the big one — so `roadPath` has real choices and one blocked segment is never fatal.

**Paved ground.** Three plazas, emitted as `path` props and folded into the same merged road mesh:

- **Market Plaza**: x [−9, 9], z [3, 15]. The town's centre of gravity and the destination slice 7's fast travel points at.
- **Keep Approach**: x [−8, 8], z [−19, −14.5]. The ceremony ground. Its north edge stops at −19 so it never runs under `KEEP_PRECINCT` (§3.5), which begins at −19.25.
- **The gate apron**: x [−4, 4], z [24, 29]. Where a child lands, with the Well to the west and the Tavern to the east.

### 3.5 The wall, the gate and the water

**Wall.** `WALL_SEGMENTS` emits `barrier` props on a ring at \|x\| = 30, z = ±30, thickness 1.0, height 3.5, in segments of at most 10 units (24 props; the south wall is split around the gate opening at x ∈ [−4, 4]). They are `solid: true`, carry `label: ""` so `realm-scene.tsx:323` draws no pill, and are **rendered as one merged mesh** — physics is per-prop, drawing is one draw call.

The wall's grown inner face is at 29.05, comfortably inside the movement clamp at 31.55. The clamp stops being a wall you bump into for no reason; it becomes the backstop it always should have been.

**Gate.** Two piers, `gate-pier-w` at (−5, 29) and `gate-pier-e` at (5, 29), each 2 × 2 × 6, solid barriers. The walkable gap between their grown faces is x ∈ (−3.55, 3.55) — 7.1 units, and the Kingsway corridor (4 wide) fits through it with 1.55 units to spare on each side. One `gate-arch` prop spans them at (0, 29), size 12 × 2 × 1.5, `solid: false`, `elevation: 5`.

`elevation?: number` is a new optional field on `Prop`: the height at which a non-solid barrier's box is drawn. `realm-scene` adds it to the box's y. It exists so an arch can be over your head instead of in your way. Nothing else uses it in this slice.

**The keep precinct.** The keep is the only thing in the world that *grows* while a child is inside it (slice 10 takes it from 6 × 5 to a 12 × 9 citadel), so the ground it will eventually need is reserved now, as a named rectangle, rather than discovered by slice 10 at build time:

```ts
export const KEEP_PRECINCT: Rect = { minX: -8, maxX: 8, minZ: -30, maxZ: -19.25 };
export const KEEP_APPROACH_CLEAR_Z = -19.25;  // the southernmost z the keep's grown south face may reach
```

Three rules come with it, and all three are tested here rather than asserted in slice 10:

1. **No road quad, no plaza, no spawn zone and no prop may intersect `KEEP_PRECINCT`.** The North Way's corridor (z ∈ [−18.75, −15.25]) clears its south edge by 0.5 units; the Keep Approach plaza clears it by 0.25. `village.test.ts` asserts both, and asserts that `SPAWN_ZONES` and `decorSpots(seed)` produce nothing inside it.
2. **The keep's back is the north wall.** At `CASTLE_POSITION` (0, −24.5) a 12 × 9 citadel occupies z ∈ [−29, −20], whose grown north face (−29.45) is *past* the wall's grown inner face (−29.05). That is deliberate: the strip behind the keep is not a 0.4-unit pinch a child can wedge in, because it is inside a solid. `buildWorldLayout` extends the keep's collider north to `−WALL_INSET` at every stage, so at stage 0 the small keep still has no walkable gap behind it. The only approach is from the south, across the ceremony ground, which is what a keep should be.
3. **The keep's grown south face may never cross `KEEP_APPROACH_CLEAR_Z`.** At the maximum footprint it reaches −19.55, clearing the limit by 0.3 and the North Way's corridor by 0.8. `village.test.ts` iterates every keep stage slice 10 will publish (via `KEEP_STAGE_FOOTPRINTS`, imported type-only until slice 10 lands, and every tier of `CASTLE_FOOTPRINTS` before that) and fails the moment one crosses it. This is the trap laid for slice 10 — slice 10 gets a red test, never a hero wedged at a coronation.

**Water.** A new `PropKind: "water"`. Solid (so the hero cannot walk into the river) but drawn as a flat ground decal at **`GROUND_Y.water`** — slice 1's named ladder gains this rung as its lowest, so the river sits under the road quads and the foundations rather than fighting them; no spec writes a y literal — with a new `waterTile(seed)` from `tiles.ts`, never as a standing box and never with a label. Emitted as four props so the two crossings are gaps, not special cases:

| id | centre | size (w × d) | covers |
|---|---|---|---|
| `water-west` | (−25.25, −4) | 9.5 × 3.5 | x [−30, −20.5] — west wall to the ford |
| `water-mid` | (−10.25, −4) | 14.5 × 3.5 | x [−17.5, −3] — ford to the bridge deck |
| `water-east` | (8, −4) | 10 × 3.5 | x [3, 13] — bridge deck to the pool |
| `water-pool` | (13, −3.5) | 6 × 5 | the spring, where the river rises in the eastern hills |

The gaps are x ∈ (−20.5, −17.5) — the **Mill Ford**, 3 units wide, carrying West Street — and x ∈ (−3, 3) — the **River Bridge deck**, 6 units wide, carrying the Kingsway. Both gaps contain their street's full corridor; `village.test.ts` T4 asserts it.

The river stops at x = 13. East of the spring pool the ground is dry, so East Street crosses nothing and neither Chapel Hill nor Watch Hill sits behind a chokepoint. This is the single decision that keeps a full village from becoming a one-bridge bottleneck, and it is also why the Millrace district reads as a place with a source rather than a band of blue across a map.

The River Bridge now stands on water. "A crossing that holds in any weather" becomes a true sentence for the first time. Painting it — the wheel, the mill race, the water's motion — is slice 5.

### 3.6 `src/lib/realm/village.ts` — the new pure module

```ts
import type { Vec2 } from "./layout"; // type-only: erased, no runtime cycle

export type DistrictId =
  | "gate-quarter" | "scholars-row" | "market-plaza" | "chapel-hill"
  | "millrace" | "garden-terrace" | "keep-approach" | "watch-hill";

export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

export type Facing = "n" | "s" | "e" | "w";

export type District = {
  id: DistrictId;
  name: string;            // "Market Plaza" — the child reads this
  label: string;           // "the Market Plaza" — for a sentence
  spoken: string;          // "You're in the Market Plaza." — written for speech, the one source for speak() and aria-live
  centre: Vec2;            // exactly a road node position: the arrival point fast travel sets a rider down at
  entrance: Vec2;          // exactly a road node position, inside `bounds`: where the sign and the hitching post stand
  entranceFacing: Facing;  // the way a child faces walking in
  bounds: Rect;
  buildingIds: string[];
};

export type RoadNodeId = string;
export type RoadNode = { id: RoadNodeId; position: Vec2; districtId: DistrictId };
export type RoadEdge = [RoadNodeId, RoadNodeId, number]; // from, to, width
export type RoadQuad = { id: string; centre: Vec2; w: number; d: number; kind: "street" | "spur" | "plaza" };
export type SiteDoor = { buildingId: string; node: RoadNodeId; face: "n" | "s" | "e" | "w"; spur: boolean };
export type WallSegment = { id: string; centre: Vec2; w: number; d: number; h: number };

export const DISTRICTS: District[];
export const ROAD_NODES: RoadNode[];
export const ROAD_EDGES: RoadEdge[];
export const ROAD_QUADS: RoadQuad[];        // one per edge + one per plaza; feeds the merged mesh and the clearance rules
export const SITE_DOORS: Record<string, SiteDoor>;
export const BUILDING_SLOTS: Record<string, Vec2>;                              // nine plots: the eight + `tavern`
export const BUILDING_FOOTPRINTS: Record<string, { w: number; d: number; h: number }>;  // the ONLY footprint table
export const WALKABLE_BUILDINGS: ReadonlySet<string>;   // ["bridge"]
export const WALL_SEGMENTS: WallSegment[];
export const GATE_PIERS: WallSegment[];
export const WATER_BANDS: { id: string; centre: Vec2; w: number; d: number }[];
export const PLAZAS: { id: string; districtId: DistrictId; bounds: Rect }[];

export const WORLD_HALF: number;            // WORLD_SIZE / 2
export const WALL_INSET: number;            // 30
export const DOORSTEP: number;              // 1.55
export const KEEP_PRECINCT: Rect;           // reserved ground for the keep at its maximum footprint
export const KEEP_APPROACH_CLEAR_Z: number; // -19.25 — the southernmost z the keep's grown south face may reach
export const KINGDOM_BUILDING_IDS: ReadonlySet<string>;  // the eight; `tavern` is a plot but not a kingdom building

export function districtAt(p: Vec2): DistrictId | null;
export function districtById(id: DistrictId): District;
/** Which district a building's plot stands in. One line over DISTRICTS; slices 5 and 10 both need it. */
export function districtFor(buildingId: string): DistrictId | null;
export function buildingFootprint(id: string): { w: number; d: number; h: number };
export function nodeById(id: RoadNodeId): RoadNode;
export function nearestRoadNode(p: Vec2): RoadNode;
export function roadPath(fromNodeId: RoadNodeId, toNodeId: RoadNodeId): Vec2[];
export function routeBetween(from: Vec2, to: Vec2): Vec2[];
export function onRoad(p: Vec2, margin?: number): boolean;
export function roadCorridorContains(p: Vec2, margin?: number): boolean;
export function villagerStandFor(buildingId: string): Vec2;
export function doorPointFor(buildingId: string): Vec2;
export function districtWalkSeconds(from: DistrictId, to: DistrictId, speed?: number): number;
export function worstDistrictWalkSeconds(speed?: number): { from: DistrictId; to: DistrictId; seconds: number };
```

- `roadPath` is Dijkstra over `ROAD_EDGES` weighted by segment length. It returns node **positions**, inclusive of both ends. An unknown node id returns `[]`; callers fall back to a straight line rather than throwing.
- `routeBetween(from, to)` = `[from, ...roadPath(nearestRoadNode(from).id, nearestRoadNode(to).id), to]`, with the first and last deduplicated when they are within `ARRIVE_RADIUS` of the adjacent node. This is the one function the ceremony, the recess lap, tap-to-walk, slice 7's fast travel and slice 7's companion pathing all call.
- `onRoad(p, margin = 0)` tests `p` against every `ROAD_QUAD` grown by `margin`. It replaces the `CLEAR_FROM_PATH` / `CLEAR_PATH` distance-to-tile-centre tests, which were correct for 2 × 2 tiles and meaningless for a 45-unit street quad.
- `districtWalkSeconds` and `worstDistrictWalkSeconds` exist so the metered-clock table in §3.10 is a **test**, not a comment that rots.

### 3.7 `src/lib/realm/open-ground.ts` — the shared spawn module

This is the answer to engineering objections (a) and (d) in one place, so there is one rule and not two.

```ts
import type { Vec2, WorldLayout } from "./layout";
import type { DistrictId, Rect } from "./village";

export type SpawnZone = { id: string; districtId: DistrictId; bounds: Rect; weight: number };

export type OpenGroundRules = {
  clearOfColliders: number;  // pad added to every solid's footprint
  clearOfRoad: number;       // margin outside every road quad and plaza
  clearOfVillagers: number;
  clearOfSpawn: number;      // the gate landing point
  clearOfHero: number;       // 0 disables
  clearOfWater: number;
};

export const SPAWN_ZONES: SpawnZone[];
export const TROUBLE_RULES: OpenGroundRules;  // { colliders: 0.9, road: 2.5, villagers: 1.5, spawn: 5, hero: 8, water: 1 }
export const GLEAM_RULES: OpenGroundRules;    // { colliders: 1.0, road: 2.0, villagers: 2.0, spawn: 3, hero: 0, water: 1 }
export const DECOR_RULES: OpenGroundRules;    // { colliders: 1.2, road: 2.0, villagers: 2.0, spawn: 4, hero: 0, water: 1.5 }

export function isOpenGround(p: Vec2, layout: WorldLayout, rules: OpenGroundRules, hero?: Vec2): boolean;
export function openPointInZone(zone: SpawnZone, layout: WorldLayout, seed: number, rules: OpenGroundRules, hero?: Vec2): Vec2 | null;
export function openPoints(layout: WorldLayout, seed: number, rules: OpenGroundRules, opts: { count: number; districts?: DistrictId[]; hero?: Vec2 }): Vec2[];
export function zonesFor(districts: DistrictId[] | null): SpawnZone[];
export function zoneAt(p: Vec2): SpawnZone | null;
```

`SPAWN_ZONES` — ten rectangles of open ground, seven districts:

| id | district | bounds | weight |
|---|---|---|---|
| `gate-green-west` | `gate-quarter` | x [−28, −11] z [17, 28] | 3 |
| `gate-green-east` | `gate-quarter` | x [15, 28] z [17, 28] | 3 |
| `row-yards` | `scholars-row` | x [−28, −12] z [2, 15] | 3 |
| `plaza-edge` | `market-plaza` | x [−9, −3] z [2, 15] | 1 |
| `hill-slopes` | `chapel-hill` | x [12, 28] z [2, 15] | 3 |
| `millrace-south` | `millrace` | x [−28, 28] z [−2, 0] | 2 |
| `millrace-north-west` | `millrace` | x [−28, −2] z [−15, −11] | 2 |
| `millrace-north-east` | `millrace` | x [2, 28] z [−15, −7] | 2 |
| `garden-grounds` | `garden-terrace` | x [−28, −8] z [−28, −18] | 3 |
| `watch-slopes` | `watch-hill` | x [8, 28] z [−28, −18] | 3 |

**Keep Approach has no spawn zone, by decision.** Nothing spawns on the coronation ground. That is stated here so slice 8 and slice 12 do not have to rediscover it, and `KEEP_PRECINCT` (§3.5) is additionally excluded by `isOpenGround` regardless of zone, so a later slice cannot re-admit it by adding a zone.

**`gate-green-east` is cut back to x ≥ 15** to clear the Tavern's grown box (x ≤ 14.45, §3.3). That is the only zone the Tavern touches; `open-ground.test.ts` asserts no zone intersects any plot's grown footprint, so a future plot move cannot silently put spawns inside a wall.

**These ten zones are the whole vocabulary.** Slice 8 and slice 12 both sample from them by id; neither invents a zone, a tag or a second shape. A `SpawnZone` is a **rectangle with a weight** — never a centre and a radius — and its district is the only thing that says what belongs in it.

`openPointInZone` draws candidate points with `seededRng(seed)` — same seed, same world — and rejects any that fail `isOpenGround`, up to 24 attempts, returning `null` on exhaustion. `openPoints` walks zones by weight so a big zone sees more darts than a thin one, and never returns two points closer than 1.5 units to each other.

### 3.8 What changes in the existing modules

**`troubles.ts` — objection (a).** `spawnTroubles`'s `input.layout.props.filter((p) => p.kind === "foundation")` (troubles.ts:81) goes. The new shape:

```ts
export type SpawnInput = {
  seed: number;
  now: number;
  layout: WorldLayout;
  troubles: Trouble[];
  clearedZones: Record<string, number>;  // zoneId → sim time the last trouble there was cleared
  lowStimulus: boolean;
  hero: Vec2;
  districts?: DistrictId[] | null;       // null/absent = the whole village
};
```

`Trouble.siteId: string` becomes `Trouble.zoneId: string`, plus a new `nearSiteId: string | null` — the nearest site within 8 units, so slice 8 can write "the fog by the Mill" without re-deriving it. `clearedSites` becomes `clearedZones` in `use-spell-sim.ts:27, :35, :94, :102, :117`.

Rules: at most one trouble per zone; `MAX_TROUBLES` 6 and `LOW_STIMULUS_MAX` 3 unchanged; placement via `openPointInZone(zone, layout, seed, TROUBLE_RULES, hero)`; `RESPAWN_MS` 20 000 now keyed per zone. Two consequences fall out for free:

1. **A finished kingdom keeps its enemies.** With 10 zones and a cap of 6, 8-of-8 spawns exactly as many troubles as 0-of-8. The bug slice 13 would otherwise have inherited is fixed here, because fixing it anywhere else means writing a second spawner.
2. **Enemies stop materialising next to you.** `TROUBLE_RULES.clearOfHero = 8`; `hero` is now passed in from `use-spell-sim.ts:61`, which already holds it.

`moveWithin` and `pushback` swap their `Math.abs(next.x) > LIMIT` bound for `isOpenGround(next, layout, { ...TROUBLE_RULES, clearOfHero: 0 })`, so a pushed trouble cannot be shoved into the river or through a wall.

**`recess.ts` — objection (d).** `spawnGleams`'s 20 random darts at the whole world (recess.ts:78-86) become `openPoints(layout, seed, GLEAM_RULES, { count })`, one call, zones weighted. `GLEAM_COUNT` 12 and `GLEAM_COUNT_LOW` 6 unchanged. The per-slot respawn seed bump (recess.ts:87-89) is preserved verbatim — it is the thing that stops a dead slot retrying the same twenty dead points.

**The lap course is defined once, here, at the length slice 12 needs.** Slice 12 owns the `LapCourse` object, the persisted records and the lit posts; it does not get to re-route the town, and this slice does not get to publish a lap that slice 12 has to throw away. So this slice publishes the node list and the guard test, and slice 12 builds its course object from them.

```ts
/** The road nodes the recess lap threads, in running order, from the arch clockwise. */
export const COURSE_NODES: RoadNodeId[] = [
  "plaza",          // the arch: start and finish, on the Market Plaza
  "plaza-n", "bridge-s", "bridge-n",        // south down the Kingsway and over the River Bridge
  "mill-door", "lane-w",                    // west along Millrace Lane, past the Mill
  "west-north", "keep-approach", "east-north",  // the North Way, across the head of the Kingsway
  "lane-e", "hill",                         // north up East Street, onto Chapel Hill
  "plaza-e", "market-door",                 // west along the Market Cross, past the Market
];                                          // and back to "plaza"
export const COURSE_START: Vec2 = nodeById("plaza").position;  // (0, 9)
export const COURSE_LENGTH_UNITS = 128;     // asserted, not asserted-about
```

Leg by leg: 6 + 4 + 8 + 13 + 6 + 8 + 19 + 19 + 8 + 18 + 8 + 4 + 7 = **128 road units**, a closed circuit entirely on road, touching six of the eight districts and crossing the river twice.

| speed | lap |
|---|---|
| `HERO_SPEED` 3.5, on foot | **36.6 s** |
| 4.2, the first mount | 30.5 s |
| 7.0, the top mount | **18.3 s** |

**The guard test** (`village.test.ts`, and slice 12 re-runs it against its own course object): the lap must be a closed cycle whose every sampled point at 1-unit intervals lies inside a road corridor, and `128 / HERO_SPEED` must fall between **35 and 48 seconds**. 36.6 s clears the floor by 1.6 s, which is 5.6 road units — well outside the ±1-unit build-time coordinate drift §3.3 sanctions. A re-route that pushes the lap under 35 s or over 48 s fails the build, which is the point: a 21-second lap is not worth a persisted best time, and a 90-second lap eats a fifth of a five-minute grant.

`LAP_ROUTE`, `LAP_WAYPOINTS`, `LAP_START` and `WAYPOINT_RADIUS` are **deleted** in this slice, not carried forward — the eight hand-typed ring points they held were for a 40-unit lawn. Slice 7 (which imported them) and slice 12 (which owns what replaces them) both read `COURSE_NODES` and `COURSE_START` instead.

Recess runs on scheduled time (`accessMode: "scheduled"`), not on earned minutes, so a 36-second lap spends nothing a child earned. And this is the first place in the game where the eight-tier mount ladder is something a child can *feel* — 36.6 s against 18.3 s is a difference you can see on a clock, which is why decision 5 and decision 2 had to be adjacent.

**`movement.ts` — objection (b)(ii).** **Slice 3 already rewrote the resolver**: `unstickHero` collects every overlapping collider and pushes along the smallest-penetration axis over up to `UNSTICK_PASSES` (8) iterations, because slice 3 made riding reachable at 7.0 units/s one slice before this one. What this slice adds is the third parameter — a **rescue list** — because in a walled town with a gate, a plaza and four street corners, eight passes can still fail to find open ground and the right answer is then "put me back on the road", not "push me further into a wall". The accumulated signature:

```ts
export function unstickHero(state: HeroState, colliders: Prop[], rescue?: Vec2[]): HeroState;
```

1. Collect **every** collider whose footprint grown by `HERO_RADIUS` contains the position. *(slice 3)*
2. None → return `state` unchanged (the common case, and it must stay allocation-free). *(slice 3)*
3. Up to `UNSTICK_PASSES` (8) iterations: take the deepest penetration, push along that box's **smallest-penetration axis**, re-collect. *(slice 3)* Where `rescue` is given, break ties toward the direction that decreases distance to the nearest rescue point. *(this slice)*
4. Still overlapping after 8 passes → teleport to the nearest point in `rescue` that is itself clear of every collider. *(this slice)*
5. No clear rescue point exists (pathological) → return the state unchanged rather than teleporting into a wall.
6. Always clear `target` and `route`.

The scene passes `ROAD_NODE_POSITIONS` as `rescue`, which is what "push toward the nearest road node instead of always south" means concretely.

`HeroState` gains `route: Vec2[] | null; routeIndex: number`, and `movement.ts` gains:

```ts
export const ROUTE_MIN_DISTANCE: number; // 12
export function setRoute(state: HeroState, target: Vec2, colliders: Prop[]): HeroState;
export function clearRoute(state: HeroState): HeroState;
```

`setRoute` keeps `setTarget`'s straight line for taps under 12 units; beyond that it calls `routeBetween` and walks the waypoints in order. `stepHero` advances `routeIndex` on arriving within `ARRIVE_RADIUS` of the current waypoint, and drops the whole route the moment stick or key input arrives — exactly as it drops a tap target today (movement.ts:57). A route whose next waypoint the hero cannot make progress toward is dropped, same rule as line 80, so a blocked route never pins a child.

**`ceremony.ts` — objection (b)(iii).** `walk()`'s `squareCorners` heuristic (ceremony.ts:95-99) exists because `BUILDING_SLOTS` alternated sides of one road. With eight districts it is not enough, and the comment at :55-59 says as much about a world a quarter this size. Both the hero and the villagers now walk `routeBetween(start, mark)`.

`CeremonyState` gains `routes: Record<string, Vec2[]>`, `routeIndex: Record<string, number>`, `heroRoute: Vec2[]`, `heroRouteIndex: number`. `startCeremony` builds them; `stepCeremony`'s `"walk"` case targets `route[index]` and advances on `MARK_RADIUS`; `squareCorners` is deleted.

Walk speeds rise, because the map did: `CEREMONY_HERO_SPEED = 6.0` and `VILLAGER_SPEED` 3 → **5.0**. Justification and cost in §3.10. `WALK_TIMEOUT_MS` stays 20 000 and remains the safety net for a hero who cannot reach the mark.

**`camera.ts` — the one camera change in the programme.**

```ts
export const CAMERA_OFFSET = { x: 12, y: 12, z: 12 };  // unchanged
export const CAMERA_ZOOM = 64;                          // was 40
export const CAMERA_DEADZONE = 2.5;                     // world units
export const CAMERA_LOOKAHEAD = 3;                      // world units, in the facing direction
export const CAMERA_EDGE_MARGIN = 2;                    // how far past the wall the frame may show

export function followCamera(
  current: Vec2,
  hero: Vec2,
  dt: number,
  opts: { reducedMotion: boolean; facing?: Facing; deadzone?: number; lookAhead?: number }
): Vec2;

export function clampCameraToWorld(target: Vec2, viewport: { w: number; h: number }): Vec2;
```

At zoom 64 a 1512 × 850 viewport frames roughly **23.6 × 23.0 world units** — about 13% of a 64-unit world, against 100%-plus today. Things go off screen. That is the point, and it is why this lands after slice 1's beacon, `!` and `edgeArrow`: a larger frame without an off-screen objective arrow is how you lose a six-year-old.

- **Deadzone**: the follow point does not move while the hero is within `deadzone` units of it. The world stops sliding under a child who is stepping back and forth at a door.
- **Look-ahead**: the follow point aims at `hero + FACING_VEC[facing] * lookAhead`, eased at the existing 0.25 s constant. You see where you are going, not where you have been.
- **`reducedMotion`**: no easing and no look-ahead — the follow point snaps, as today — but the **deadzone still applies**, because a 23-unit frame snapping to every 0.05-unit wobble is worse for a reduced-motion child than either. This is a deliberate change to the existing snap semantics and `camera.test.ts:15-17` moves with it.
- **`clampCameraToWorld`**: given the viewport, keeps the frame inside \|x\|, \|z\| ≤ `WALL_INSET + CAMERA_EDGE_MARGIN`, so the ground plane's edge and the void beyond it are never visible. On a viewport wider than the world (it can happen on a large monitor at zoom 64? no — 23.6 < 64 always) the clamp degrades to centring.

**`layout.ts`.** `buildWorldLayout` grows four emitters — roads (from `ROAD_QUADS`), plazas (from `PLAZAS`), walls and the gate (from `WALL_SEGMENTS`, `GATE_PIERS`), water (from `WATER_BANDS`) — and one rule: a complete building in `WALKABLE_BUILDINGS` is emitted `solid: false`. `WorldLayout` gains nothing; `colliders` is still `props.filter((p) => p.solid)`, which now includes walls, piers and water.

**`realm-scene.tsx`.** Three render changes, no new sprite path:

1. `layout.props.filter((p) => p.kind === "path").map(...)` (realm-scene.tsx:269-274) — 15 meshes today, 150+ if left alone — becomes **one** `<mesh>` with a merged `BufferGeometry` built from `ROAD_QUADS`, UVs scaled by quad length so the cobble runs continuously and the 15 visible seams go away.
2. A second merged mesh for `WALL_SEGMENTS` + `GATE_PIERS`; the arch is one box at `elevation`.
3. Water renders as ground decals at `GROUND_Y.water` with `textures.tiles.water`, and is excluded from `standing` and from `PropLabel`.

### 3.9 The four engineering objections, answered

Decision 2 converts the audit's objections from reasons to decline into problems to solve. Here is each one, and where in this spec it is solved.

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** Solved by §3.7 + §3.8: spawning moves off foundations and onto ten `SPAWN_ZONES` that do not depend on kingdom progress at all. The spawner cannot starve because the zones do not shrink as the child builds; and the same change fixes the finished-kingdom-goes-inert bug that slice 13 would have inherited. Test: `spawnTroubles` at 8-of-8 complete returns the same count as at 0-of-8.

**(b) New solid props can wedge the hero, and the ceremony walk and recess lap ring both cross the map.** Four separate answers, all of them enforced:

- **(i) A hard invariant, tested over the generated layout.** No solid prop's footprint grown by `HERO_RADIUS` may intersect a road corridor (the edge's swept rectangle, half-width = `width/2 + HERO_RADIUS`), with one stated exception: the building a spur terminates at, for which the requirement is instead that the door node sits at least `DOORSTEP` (1.55) outside the grown footprint and the corridor is tested only over the portion outside it. Run over `buildWorldLayout` at 0, 4 and 8 buildings complete, for every tier in `CASTLE_FOOTPRINTS`, with and without decor. **The test is authoritative**: the coordinates in §3.3 and §3.4 are a plan, and any of them may move by up to a unit at build time to satisfy it.
- **(ii) `unstickHero` rewritten** to resolve every overlapping collider and push toward the nearest road node — §3.8.
- **(iii) The ceremony walk and the recess lap both re-pathed onto `roadPath`** — §3.8. Neither crosses a built-up district any more; both follow streets.
- **(iv) A traversal test**: `stepHero` is simulated from every district centre to every other along `routeBetween`, at dt 1/60, and must arrive within `ARRIVE_RADIUS` inside 60 simulated seconds. 56 ordered pairs, every one of them asserted. A wedge anywhere in the town plan fails this test before a child ever meets it.

Additionally: `KEEP_PRECINCT` and `KEEP_APPROACH_CLEAR_Z` are exported and asserted (§3.5). Slice 10 grows the keep's footprint 6 → 12; the moment its grown south face crosses −19.25, or anything else is placed inside the precinct, the test fails and slice 10 gets a red build instead of a wedged hero at a coronation.

**(c) Sprite rasterisation already blocks first paint and more figures makes it worse.** This slice adds **zero sprite kinds**. Roads, plazas, walls, gate piers and the arch are geometry; water is a tile. Running kind count:

| | today | after this slice |
|---|---|---|
| SVG sprite kinds | 35 (1 hero, 1 companion, 8 villagers, 3 troubles, 1 mount, 1 mounted hero, 1 gleam, 1 recess banner, 1 crown, 1 castle banner, 1 castle, 8 buildings, 1 foundation, 6 decor) | **35** |
| Tile kinds | 2 (grass, cobble) | **3** (+ water) |
| **Total rasterisations** | 37 | **38** |

Measured effect on first paint: one extra 32 × 32 tile canvas, ≈ 3 ms, and it goes through slice 2's parallelised awaits and stays in the warm kind-keyed cache across a short round trip. Slice 2 is a hard dependency for exactly this reason: without its cache, this slice's world would re-pay 38 rasterisations on every return, and with it the world's *shape* costs nothing to redraw.

**But the zoom change is not free, and this is where that bill is paid.** Slice 2's entire pixel budget — every `px` in `FIGURE_CATALOG`, the 1.6-unit snapping lattice, the world-size column of all four ladder tables, `groundTexturePx`, and the 3.20 M-texel dpr-2 manifest measured against `RASTER_BUDGET_TEXELS = 6_000_000` — is quantised to `CAMERA_ZOOM = 40`. Slice 2 says so explicitly and names the handoff: *"Slice 4 changes the zoom, which invalidates every catalog entry at once."* This slice is the receiver of that handoff, and the arithmetic is not small.

`rasterScaleFor` holds **one texel per device pixel**, so a figure's texture is `worldSize × zoom × dpr` on a side. Holding world sizes fixed and raising the zoom from 40 to 64 multiplies every linear dimension by **1.6** and every texel count by **2.56**. Slice 2's default-visit manifest of 3.20 M texels at dpr 2 becomes **8.19 M** — 37% over slice 2's own ceiling, on a path that already blocks first paint on a metered clock. Left undeclared, that is a 200-millisecond regression discovered in the browser in slice 11.

**What this slice does about it, in order:**

1. **Re-snap the lattice.** Slice 2's lattice step is one authored art pixel at the camera's scale. At zoom 40 on the 64-grid that was 1.6 world units; at zoom 64 it is **1.0 world unit**, and on the 36 × 48 character grid it is **0.75**. `snapWorldHeight(units, grid, zoom)` already takes `zoom` as a parameter and re-derives the whole ladder from it — the function does not change, its inputs do.
2. **Re-run the catalog.** `figure-catalog.test.ts` fails on every entry the moment `CAMERA_ZOOM` moves, which is the designed alarm. This slice **runs it, reads the failures and re-authors `FIGURE_CATALOG`'s `px` column** rather than leaving a red suite for slice 5 to find. Concretely, every world size re-snaps to the finer lattice: the hero's drawn height moves off exactly 1.9, and `HERO_RADIUS`, `REACH`, `TROUBLE_RADIUS` and `villagerStandFor`'s offset are re-checked against the re-snapped figure sizes in the same commit. **`figure-catalog.test.ts` and `pixel-budget.test.ts` join this slice's §7.1 list.**
3. **Pay the budget down rather than raise it.** Holding 8.19 M would mean ~32 MB of GPU texture memory for a default visit, against slice 2's measured 12.8 MB — on a tablet, that is the wrong trade. So `px` drops **one step on the eight largest kinds** (the eight buildings; slice 10's keep stages and slice 11's keep pieces inherit the lower step). One step down is a 1.25× linear reduction, 1.56× in texels, which brings the largest half of the bill from ~5.6 M to ~3.6 M and the total to **≈ 6.2 M** — within 4% of the ceiling, and `RASTER_BUDGET_TEXELS` rises once, deliberately, from 6.0 M to **6.5 M**, with the GPU-memory number (≈ 26 MB at dpr 2) written into `pixel-budget.ts` as a comment beside it.
4. **State the visual consequence honestly.** A building drawn one `px` step lower at 1.6× the zoom is still **1.28× more resolved on screen** than it was at zoom 40 before this slice. Nothing gets rougher. The re-snap is what makes that true, and `/dev/figures` at zoom 64 is the browser-pass item that confirms it (§7.2).
5. **Re-cost slice 11 from these numbers, not from slice 2's.** Slice 11's §3.8 first-paint bill is quoted at "CAMERA_ZOOM 40, dpr 2" and is therefore wrong by 2.56× before its own footprint changes are counted. Its §3.5 table is recomputed from `buildingFootprint(id)` at this zoom — that is stated as an obligation in slice 11's spec and it is this section the recomputation starts from.

**`groundTexturePx`** takes `zoom` too, so the grass, cobble, dirt and water tiles re-derive with everything else; the tile *period* on the ground is unchanged at `TILE_WORLD` = 3.2 world units, because that is a world measurement, not a pixel one. `GRASS_REPEAT` follows from `GROUND_SIZE / TILE_WORLD` (§3.1) and no arithmetic in this slice may re-introduce the literal 2.

Draw calls go **down**: 15 path meshes + 1 ground → 1 road mesh + 1 wall mesh + 4 water decals + 1 ground = 7, against 16, before any of the new content exists.

**(d) Gleam spawning needs open ground.** `spawnGleams` takes `SPAWN_ZONES` and `GLEAM_RULES` from the same `open-ground.ts` module the troubles use — §3.7. One rule, one module, one test. A denser world cannot starve gleams because the zones are the open ground, by definition, rather than the whole world minus rejections.

### 3.10 The metered clock, in seconds

Play is earned in five-minute grants. Here is every second this slice spends.

**What did not get longer.** The opening beat is unchanged. The hero lands at (0, 26.5), 2.5 units inside the gate; the first objective is the Village Well at (−7, 21), **9.0 road units away — 2.6 s at `HERO_SPEED` 3.5**. Today it is 2.9 s. A child's first ten seconds in a 64-unit village are identical to their first ten seconds on the 40-unit lawn, and that is the single most important number in this section.

**What got longer: crossing the town.** District-to-district, on foot, by road:

| from → to | road units | seconds @ 3.5 | @ 4.2 (first mount) | @ 7.0 (top mount) |
|---|---|---|---|---|
| Gate Quarter → Market Plaza | 12 | 3.4 | 2.9 | 1.7 |
| Millrace → Keep Approach | 8 | 2.3 | 1.9 | 1.1 |
| Market Plaza → Scholars' Row | 19 | 5.4 | 4.5 | 2.7 |
| Market Plaza → Chapel Hill | 19 | 5.4 | 4.5 | 2.7 |
| Market Plaza → Millrace | 18 | 5.1 | 4.3 | 2.6 |
| Keep Approach → Watch Hill | 25 | 7.1 | 6.0 | 3.6 |
| Gate Quarter → Millrace | 30 | 8.6 | 7.1 | 4.3 |
| Scholars' Row → Garden Terrace | 32 | 9.1 | 7.6 | 4.6 |
| Chapel Hill → Watch Hill | 32 | 9.1 | 7.6 | 4.6 |
| Millrace → Watch Hill | 33 | 9.4 | 7.9 | 4.7 |
| Gate Quarter → Keep Approach | 38 | 10.9 | 9.0 | 5.4 |
| Chapel Hill → Keep Approach | 45 | 12.9 | 10.7 | 6.4 |
| Garden Terrace → Watch Hill | 50 | 14.3 | 11.9 | 7.1 |
| Market Plaza → Watch Hill | 51 | 14.6 | 12.1 | 7.3 |
| Gate Quarter → Watch Hill | 63 | 18.0 | 15.0 | 9.0 |
| **Scholars' Row → Watch Hill** | **70** | **20.0** | 16.7 | **10.0** |
| **Chapel Hill → Garden Terrace** | **70** | **20.0** | 16.7 | **10.0** |

Median over all 28 unordered pairs: ≈ 34 units, **9.7 s**. Worst: **70 units, 20.0 s**.

**The ruling this produces, stated as decision D-VG-15 requires:** six of twenty-eight district pairs exceed 12 seconds on foot. A five-minute grant is 300 seconds; a child who crosses the town four times spends 27% of their session walking. **Slice 7 is therefore not optional — it is the fix for a cost this slice introduces**, and its fast travel should run node-to-node between the eight district arrival nodes in `DISTRICTS[].centre`, which is why those are road node positions and not points in a field. The mount ladder now spans 20.0 s → 10.0 s on the worst walk, which is the first time the 4.2-to-7.0 spread has meant anything.

**Mitigations this slice ships so the cost is bounded before slice 7 lands:**

- Tap-to-walk follows the road past 12 units (D-VG-13), so a long walk is a walk and not a walk-then-stuck-on-a-corner-then-walk.
- The spawn sits inside the gate facing the town (§3.1), so nobody walks 20 units before the game starts.
- Slice 1's `edgeArrow` fires more often at zoom 64 and points at the one objective, so a long walk is always a walk toward something.

**Every other new beat:**

| Beat | Cost | Notes |
|---|---|---|
| First paint | **+3 ms** | One water tile. Zero new sprite kinds. |
| Road geometry build | **+0.4 ms** | 30 quads, 120 verts, once per mount. |
| Wall geometry build | **+0.3 ms** | 26 boxes merged, once per mount. |
| District banner | **2.2 s visible, 0 s of play** | `pointer-events: none`, lowest priority in the slice-1 lane, never blocks input, never pauses the clock. |
| Camera reframe | **0 s** | No transition. It is a constant. |
| Ceremony walk | **+4.4 s per season** | Worst case 8.4 s at the new speeds, against ~4 s today. Once per season. See below. |
| Recess lap | **36.6 s on foot / 18.3 s mounted** | Scheduled time, not earned minutes. Sized here to slice 12's 35–48 s budget so the course is laid once. |
| Clock pauses added | **none** | The clock is paused in exactly one place in the programme — slice 9's opening banner — and this slice adds no second place. |

Ceremony arithmetic: the worst walk is a villager from Chapel Hill (13, 10) to the gather ring at roughly (0, −17.5) — 42 road units. At the old `VILLAGER_SPEED` 3 that is 14.0 s, uncomfortably close to `WALK_TIMEOUT_MS` 20 000 and long enough to feel like a bug. At 5.0 it is 8.4 s, and people hurrying to a crowning is exactly what it should look like. The hero's worst case, from the gate, is 45 units: 12.9 s at 3.5, **7.5 s at `CEREMONY_HERO_SPEED` 6.0**. Total ceremony: 8.4 + 3.0 gather + 1.5 descend + 4.0 hail = **16.9 s**, against ~12.5 s today. Under `reducedMotion` everyone still snaps to their marks and the walk costs nothing, as today.

**`clock.flushPending()`** runs on every unmount from slice 1 onward. This slice adds no exit path — no door, no portal, no navigation — so there is nothing here that could bypass it.

### 3.11 Every visible string, verbatim

This slice puts **one** string on screen. The district names, labels and spoken lines it publishes are data that slice 5 renders; they are listed in §3.2 and reproduced in slice 5's `DISTRICT_SIGN_COPY` table, where the surface that shows them lives.

**The recovery message**, shown at most once per visit, only when `unstickHero` reaches its step-4 teleport (§3.8), `aria-live="polite"`:

`The road brings you back.`

That sentence is true of what the code does: the hero is moved to the nearest clear road node. It promises nothing. The rule the help card taught us — `Clear troubles to protect the sites` was true of nothing, and it shipped — applies to every string in this slice, and this one survives it.

**No string in this slice uses the word "deed."** Nothing here names a side quest; where a later slice does, it takes its nouns from `src/lib/utils/side-quest-copy.ts`.

**Errors.** The two failure modes with user-visible text are in §5. Neither is new copy invented for a hypothetical: each one names something the code actually does.

---

## 4. Data model

**This slice adds no migration.** The last migration is `0025_worried_tyrannus.sql` and this slice does not add `0026`.

That is a decision, not an omission. The obvious candidate is remembering which district a child was last in so a return puts them back there instead of at the gate.

**It is refused, not deferred, and no slice in the programme adds it.** Three reasons, stated here so the gap is a ruling rather than a dropped handoff:

1. **The opening beat is the thing being protected.** You walk in through the gate, facing the town, with the Well on your left and the Tavern on your right. That is 2.6 seconds to the first objective and it is identical every visit — the single most valuable property of the opening, and the reason a six-year-old can find their footing in a 64-unit world at all. Restoring a position is restoring *confusion*: a child who left at the Watchtower returns to a corner of the map with no landmark and no idea how they got there.
2. **The cost it would buy back is bought back better by slice 7.** Fast travel makes the worst crossing 6.7 seconds from any hitching post. Spending a migration to save a walk that riding already saves is paying twice.
3. **A stored district id is a stored world coordinate**, and this programme's one clean property is that `schema.ts` holds none. `KEEP_PRECINCT` moves, districts get renamed, slice 10 grows the keep — every one of those would become a data-migration question the moment a district id is persisted.

Slice 7 adds `realm_settings.districts_visited` for a different purpose (which districts a child has *ever* walked into, so fast travel can open a destination the first time), and it is not this column wearing a different name. Nothing in the thirteen slices resumes a position.

**Nothing this slice changes is stored.** Verified by inspection: `schema.ts` holds no world coordinate, no hero position, no gleam position, no lap waypoint. `realmSettings` stores access mode, minutes per quest, off-hours, the daily cap, tone, `helpSeenAt` and `starterSpellAt`. Recess state (`realm-shell.tsx:173`) is per-visit `useState`. `ClearTally` is per-visit. So moving the world from 40 units to 64 changes the meaning of **no stored value**, and no child needs a one-time "these things moved while you were away" message.

**What existing rows do:** exactly what they did. A hero who last played on the 40-unit lawn opens the 64-unit village with the same minutes, the same tone, the same help-seen state and the same kingdom progress. The world around them is different; nothing they had recorded is.

**Verification step**, because the hook runs `db:migrate` silently and must not be trusted: this slice's build runs `npm run db:generate` and confirms it emits **no new migration file**, then runs `npm run db:migrate` and confirms `drizzle/meta/_journal.json` still ends at 0025. A migration appearing here would mean someone added a column that this spec did not sanction, and that is a stop-the-line event, not a merge conflict.

---

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| `roadPath` called with an unknown node id | Returns `[]`. `routeBetween` falls back to `[from, to]` — a straight line. Nothing is thrown and nothing is shown; the hero walks the old way. |
| `routeBetween` target is inside a collider | `setRoute` trims the route at the last waypoint that is clear, then `setTarget`'s existing rule (movement.ts:39) rejects the final leg. The hero walks as close as the road goes and stops. No message. |
| Hero wedged inside one or more colliders | `unstickHero`'s 8-pass resolve (§3.8). Silent — this is a frame-level correction and it fires most often the instant a foundation becomes a building, which already has its own rise animation and toast. |
| Hero wedged and unresolvable after 8 passes | Teleport to the nearest clear road node, and show `The road brings you back.` once per visit, `aria-live="polite"`. |
| No clear road node exists (pathological: every node covered) | Return the state unchanged. Better a stuck hero than a hero inside a wall; the movement clamp and the ground tap still work, and the traversal test makes this unreachable in the shipped layout. |
| `openPointInZone` exhausts its 24 attempts | Returns `null`. `spawnTroubles` spawns fewer than the cap this frame and retries next frame with the zone's bumped seed. `spawnGleams` leaves the slot empty and bumps `slotSpawns` — the existing behaviour at recess.ts:87-89, preserved verbatim, and the reason a dead slot does not retry the same twenty dead points forever. |
| Every zone exhausted (a world so full nothing can spawn) | Zero troubles and zero gleams, no error. `village.test.ts` asserts this cannot happen at 0, 4 or 8 buildings with decor on. |
| A building id with no entry in `BUILDING_SLOTS` | Skipped, as today (layout.ts:158). `layout.test.ts` already covers it with the `"nope"` building. |
| A building id with no entry in `SITE_DOORS` | `villagerStandFor` falls back to the old rule — the point `d/2 + 1.5` due south of the slot — so a future ninth building renders a villager somewhere sane instead of throwing. |
| Bridge complete, water gap misaligned | Caught by test T4 (§7): the walkable gap between `water-mid` and `water-east` must contain the Kingsway corridor over its full width. |
| Keep footprint grown past `KEEP_APPROACH_CLEAR_Z`, or any prop inside `KEEP_PRECINCT` | Caught by test T1 and the precinct test (§7.1). This is the trap laid for slice 10. |
| Viewport narrower than the camera deadzone | `followCamera` clamps `deadzone` to `min(deadzone, frameHalfWidth / 2)` so a phone-width frame still follows. |
| Viewport wider than the world | Cannot happen at zoom 64 (frame ≤ 32 units against a 64-unit world), but `clampCameraToWorld` degrades to centring if it ever does. |
| A tap outside the wall | `setTarget` clamps to `LIMIT` (31.55), then the wall collider rejects it (movement.ts:39) and the tap is ignored — which is now visibly correct, because there is a wall there. |
| Two colliders overlapping (a wall segment and a corner building) | Legal and expected. `unstickHero` resolves multiple overlaps by design; `blocked()` is unchanged and does not care. |
| `districtAt` outside the wall | `null`. The banner shows nothing and `speak()` says nothing. Walking out of a district into no district is silent; walking into one announces it. |
| District boundary jitter (hero pacing across a line) | The banner is gated on a `lastDistrict` ref plus a 1.5 s minimum between announcements, so pacing a boundary cannot stutter either the pill or the speech. |

---

## 6. Accessibility

### 6.1 The complexity axis

Every surface below consumes `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1) and invents no rule of its own.

| Surface | Simple depth | Full depth |
|---|---|---|
| District arrival | **Not this slice's surface.** This slice publishes `District.name`/`.label`/`.spoken` and the debounced boundary signal; slice 5 renders the arrival and reads `Surfaces.districtDetail`. |  |
| Roads, plazas, walls, gate, water | Identical. The world is the same world at both depths. | Identical. |
| Camera | Identical zoom, deadzone and look-ahead. | Identical. |
| Tap-to-walk routing | Identical. | Identical. |

**This slice needs no key from `depth.ts` and requests none.** It has no depth-sensitive surface of its own: the world is the same world at both depths. The one place depth reaches this slice's data is slice 5's arrival announcement, which reads `Surfaces.districtDetail` — a field slice 1 already publishes in the closed thirteen-field table (first-impression §3.1), so there is nothing here to add and nothing to negotiate.

The three invariants hold: `fewerChoices` is irrelevant here because this slice adds no choice, no tracked objective and no ability slot; depth is never a word or a label a child reads; and every simple-depth surface is a substitution.

### 6.2 The learning profile, all of it

| Setting | What this slice does |
|---|---|
| `reducedMotion` | Camera snaps (no ease, no look-ahead) **but the deadzone still applies**, because a 23-unit frame snapping to a 0.05-unit idle wobble is worse than either. The ceremony still snaps everyone to their marks, as today, so the longer walk costs a reduced-motion child nothing. No new motion cue is introduced anywhere in this slice, so there is no motion cue lacking a non-motion substitute. |
| `lowStimulus` | **Mutes, never empties.** The roads, plazas, walls, gate, arch and water are emitted regardless of `calmPalette` — they take the calm tint at `realm-scene.tsx:235` like everything else. A low-stimulus child gains structure: a walled town with named streets is easier to hold than an unbounded lawn. Trouble and gleam caps are unchanged (3 and 6), but they now spread across ten zones instead of clustering at foundations, which is calmer, not busier. This slice does not touch `decor: !settings.calmPalette` (realm-shell.tsx:215, :223) — that counterexample is slice 5's to fix — but it adds content that arrives *under* the calm palette rather than being stripped by it, so the gap narrows here rather than widening. |
| `largerText` | This slice puts one string on screen — `The road brings you back.` — and it goes through slice 1's message lane, which scales by `--realm-hud-scale`. The nine floating world pills are slice 10's to delete. |
| `fewerChoices` | No new choice, no new control, no new tracked objective, no new ability slot. The invariant (`trackedObjectives` capped at 1, `abilitySlots` at `"earned"`, at both depths) is untouched and unthreatened. |
| `readAloud` | This slice writes `District.spoken` for the ear — "You're on Scholars' Row", not "Scholars' Row district entered" — and debounces the boundary signal that will drive it. Slice 5 calls `speak()` with it, behind the last-spoken ref pattern. |
| `inputMode` (`touch` / `keyboard` / `auto`) | Touch: tap-to-walk now routes past 12 units, which matters most on touch where a long drag across a 64-unit world was never possible. The on-screen stick is unchanged. Keyboard: no new key and no new focus stop — this slice adds no interactive element. `auto`: unchanged. |
| `soundEnabled` | No sound in this slice. The feedback channel the settings page promises parents arrives in slice 9. This slice adds nothing that would need a sound to be legible. |

### 6.3 Parent preview (`isChildView: false`)

The village renders identically in preview. This slice reads none of the values preview nulls — no mana, no cleared count, no ride state, no minutes — so there is no nulled-hero-state crash surface to defend.

Deliberate decisions, per the cross-cutting rule:

- **District detection runs in preview**, so slice 5's arrival announcement works there. It names a place, not a child's state, and a parent walking the preview should be able to see that the Millrace is a place with a mill in it.
- **Troubles still spawn and step in preview**, as they do today — and now they spawn in zones, so a parent opening the preview sees an inhabited town rather than a town whose enemies depend on which buildings the child has finished.
- **No attribution surface exists in this slice**, so there is nothing here that could stamp a previewing adult's name into the world. Slice 13 owns that rule.

---

## 7. Testing

### 7.1 Unit-testable, and where

Everything below is pure. Nothing under Vitest imports three.

**`src/lib/realm/village.test.ts` (new)**

- **T1 — corridor clearance (objection b.i).** For every road edge and every solid prop in the generated layout: the prop's footprint grown by `HERO_RADIUS` does not intersect the edge's swept corridor, except the building a spur terminates at, for which the door node is at least `DOORSTEP` outside the grown footprint. Run at 0, 4 and 8 buildings complete, decor on and off, for **every** tier in `CASTLE_FOOTPRINTS`.
- **T2 — traversal (objection b.iv).** `stepHero` walked along `routeBetween(centreA, centreB)` at dt 1/60 arrives within `ARRIVE_RADIUS` inside 60 simulated seconds, for all 56 ordered district-centre pairs.
- **T3 — door reach.** From every `SITE_DOORS[id].node`, `villagerStandFor(id)` is within `REACH` (2.5) and is not inside any collider.
- **T4 — river gaps.** The gap between `water-west` and `water-mid` contains West Street's full corridor; the gap between `water-mid` and `water-east` contains the Kingsway's full corridor.
- **Connectivity.** Every node in `ROAD_NODES` is reachable from `gate`.
- **`roadPath`.** Symmetric in length; returns node positions; an unknown id returns `[]`.
- **`districtAt`.** Every district centre maps to its own id; the eight bounds partition the walled area with no overlap and no hole; a point outside the wall returns `null`.
- **`nearestRoadNode`.** Returns a node whose position is within `WORLD_SIZE` of any point in the world; is stable under ties by array order.
- **The clock table is a test.** `worstDistrictWalkSeconds()` asserted `< 22`, so a future edit cannot silently double the cost this spec priced. `districtWalkSeconds("gate-quarter", "market-plaza")` asserted `< 4` — the opening beat.
- **`KEEP_PRECINCT` and `KEEP_APPROACH_CLEAR_Z`.** No road quad, plaza, spawn zone, wall segment or seeded prop intersects `KEEP_PRECINCT`; every `CASTLE_FOOTPRINTS` tier and every keep stage clears `KEEP_APPROACH_CLEAR_Z`; the keep's collider reaches the north wall at every stage, so there is no walkable strip behind it. The trap for slice 10.

**`src/lib/realm/figure-catalog.test.ts` and `src/lib/realm/pixel-budget.test.ts` (slice 2's, re-run and re-baselined here)**

- Every `FIGURE_CATALOG` entry is on the pixel lattice at `CAMERA_ZOOM = 64` (`isOnPixelGrid`), which is the assertion that fails on the zoom change and the reason these suites are this slice's responsibility and not slice 5's to discover.
- `snapWorldHeight(units, grid, 64)` reproduces every published world size in the ladder.
- `manifestTexels(defaultVisit, 2)` is **under `RASTER_BUDGET_TEXELS`** at its new value of 6_500_000, and `manifestTexels(fullKingdom, 2)` is reported in the test output so slice 11 inherits a measured number rather than a guess.
- `HERO_DRAWN_HEIGHT`, `HERO_RADIUS`, `REACH` and `TROUBLE_RADIUS` are mutually consistent at the re-snapped sizes: a hero standing at a door node is inside `REACH` of the villager, and a trouble at `TROUBLE_RADIUS` does not visually overlap the hero's ring.

**`src/lib/realm/open-ground.test.ts` (new)**

- `openPoints` never returns a point inside a collider, inside water, on a road (within `clearOfRoad`), within `clearOfVillagers` of a villager, or within `clearOfHero` of the hero.
- Determinism: the same seed and the same layout give the same points.
- **The finished-kingdom regression:** `openPoints` returns at least one point in at least eight zones with all eight buildings complete and decor on.
- Exhaustion returns fewer points, never `undefined`, never throws.

**`src/lib/realm/spells/troubles.test.ts` (extended)**

- Spawns at 8-of-8 complete, and the count matches 0-of-8. This is the objection-(a) test.
- At most one trouble per zone; `MAX_TROUBLES` and `LOW_STIMULUS_MAX` respected.
- Never within `TROUBLE_RULES.clearOfHero` (8) of the hero.
- Deterministic by seed.
- `clearedZones` gates respawn per zone for `RESPAWN_MS`.
- `moveWithin` and `pushback` never put a trouble in water or outside the wall.

**`src/lib/realm/recess/recess.test.ts` (extended)**

- `spawnGleams` fills all 12 slots in a fully-built world (objection d).
- **The lap guard.** `COURSE_NODES` are all real road node ids; the route is a closed cycle; every point sampled at 1-unit intervals along it lies inside a road corridor; the total is 128 units ± 5%; `128 / HERO_SPEED` is between **35 and 48 seconds**; a hero walked along it completes exactly one lap. Slice 12 re-runs this test against `buildLapCourse`'s output.
- `COURSE_START` is the plaza, not `SPAWN`.
- The slot-seed bump on total failure is preserved.

**`src/lib/realm/movement.test.ts` (extended)**

- `unstickHero` resolves two overlapping colliders in one call (slice 3's test, re-run against the village's colliders).
- Pushes toward the nearest **rescue point** when one is given, rather than merely along the smallest-penetration axis — asserted with a collider whose south side is blocked and whose north side is open.
- Teleports to a clear road node when boxed in after 8 passes.
- Never returns a position inside a collider.
- Returns the state unchanged when no rescue point is clear.
- `setRoute` uses a straight line under `ROUTE_MIN_DISTANCE` and a road route above it; input drops the route; an unreachable waypoint drops the route.

**`src/lib/realm/camera.test.ts` (rewritten)**

- The follow point does not move while the hero is inside the deadzone.
- The follow point leads the facing by `CAMERA_LOOKAHEAD` when moving.
- `reducedMotion` snaps **and still respects the deadzone** (this replaces the current `:15-17` assertion, which asserts a bare snap).
- `clampCameraToWorld` keeps the frame inside the wall plus `CAMERA_EDGE_MARGIN` at 1512 × 850 and at 400 × 800.
- `CAMERA_ZOOM` is 64 (replacing the `:18-21` assertion of 40).

**`src/lib/realm/layout.test.ts` (extended)**

- Walls, gate piers and water are emitted and are colliders; the arch is not.
- A complete bridge is `solid: false`; every other complete building is `solid: true`.
- Road props are emitted from `ROAD_QUADS` and are never colliders (the existing assertion at `:84` survives the rewrite).
- `SPAWN` is inside the wall and inside the gate opening.
- `decorSpots(seed)` puts no decoration on a road, in water, or inside a collider.

**`src/lib/realm/ceremony/ceremony.test.ts` (extended)**

- Every walker arrives at their mark; no route waypoint is inside a collider.
- The worst-case walk (hero from the gate, villager from Chapel Hill) completes inside `WALK_TIMEOUT_MS`.
- `reducedMotion` still snaps everyone to their marks with no walk at all.
- The existing iteration over `CASTLE_FOOTPRINTS` is re-run against the new keep position.

### 7.2 What needs the browser pass

Unit tests cannot judge whether a town looks like a town. On the documented port-3100 `?preview` setup:

1. **Same-framing before/after** at the gate and at the plaza — the two views the user photographed — at zoom 40 and zoom 64.
1b. **`/dev/figures` at zoom 64**, against the same grass, with the hero ruler: confirm the re-snapped ladder still reads as sharp, that the one-step `px` reduction on the eight buildings is invisible (they should be *better* resolved than before this slice, §3.9), and that no figure's edges have gone fractional.
2. **Walk the Kingsway end to end**: gate → plaza → bridge → Keep Approach. Confirm no wedge, no invisible wall, the cobble runs continuously with no seams, and the bridge reads as a crossing over water.
3. **Walk every district boundary** and confirm the banner fires once per crossing and does not stutter when pacing a line.
4. **Confirm the frame is smaller than the world**: things go off screen, and slice 1's `edgeArrow` appears when the objective does.
5. **Confirm the camera never shows past the wall** at 1512 × 850, at 1920 × 1080 and at 400 × 800.
6. **Calm palette**: confirm the roads, walls, water and gate are all present and muted, not absent.
7. **The ceremony**, forced with all eight villagers at their new sites: confirm everyone arrives, nobody clips a building, and the whole beat reads as people hurrying rather than as a bug.
8. **Touch**: a long tap across the map routes along the road and arrives.

The browser pass is the acceptance gate. The invariant tests are what stop it from being the only one.

---

## 8. Interfaces

### 8.1 Produces

**New module `src/lib/realm/village.ts`** — every export in §3.6, verbatim. The ones later slices will actually reach for:

- `type DistrictId` — the eight ids, and **the only definition of them in the programme**
- `type District`, `type Facing`, `type RoadNode`, `type RoadEdge`, `type RoadQuad`, `type SiteDoor`, `type Rect`, `type WallSegment`
- `DISTRICTS: District[]` — `id`, `name`, `label`, `spoken`, `centre`, `entrance`, `entranceFacing`, `bounds`, `buildingIds`
- `ROAD_NODES: RoadNode[]` (28), `ROAD_EDGES: RoadEdge[]` (31), `ROAD_QUADS: RoadQuad[]`
- `SITE_DOORS: Record<string, SiteDoor>` — nine, including `tavern`
- `BUILDING_SLOTS: Record<string, Vec2>` — nine plots (moved here from `layout.ts`, which re-exports it)
- `BUILDING_FOOTPRINTS: Record<string, { w: number; d: number; h: number }>` — **the only footprint table in the programme**; `w`/`d` are this slice's, `h` is slice 2's `BUILDING_HEIGHTS`
- `buildingFootprint(id: string): { w: number; d: number; h: number }`
- `KINGDOM_BUILDING_IDS: ReadonlySet<string>` — the eight, so `tavern` is a plot and not a kingdom building
- `WALKABLE_BUILDINGS: ReadonlySet<string>` — `["bridge"]`
- `WALL_SEGMENTS`, `GATE_PIERS`, `WATER_BANDS`, `PLAZAS`
- `WORLD_HALF`, `WALL_INSET` (30), `DOORSTEP` (1.55), `KEEP_APPROACH_CLEAR_Z` (−19.25), `KEEP_PRECINCT: Rect`, `SPAWN` (0, 26.5)
- `COURSE_NODES: RoadNodeId[]` (13), `COURSE_START: Vec2`, `COURSE_LENGTH_UNITS` (128)
- `districtAt(p: Vec2): DistrictId | null`
- `districtById(id: DistrictId): District`
- `districtFor(buildingId: string): DistrictId | null`
- `nodeById(id: RoadNodeId): RoadNode`
- `nearestRoadNode(p: Vec2): RoadNode`
- `roadPath(fromNodeId: RoadNodeId, toNodeId: RoadNodeId): Vec2[]`
- `routeBetween(from: Vec2, to: Vec2): Vec2[]`
- `onRoad(p: Vec2, margin?: number): boolean`
- `roadCorridorContains(p: Vec2, margin?: number): boolean`
- `villagerStandFor(buildingId: string): Vec2`
- `doorPointFor(buildingId: string): Vec2`
- `districtWalkSeconds(from: DistrictId, to: DistrictId, speed?: number): number`
- `worstDistrictWalkSeconds(speed?: number): { from: DistrictId; to: DistrictId; seconds: number }`

**This list is frozen before slice 5 begins.** Six later specs were written in parallel with this one and reached for names that do not exist. The table below is the reconciliation; every later spec's Consumes section is written against the right-hand column and no spec adds an alias.

| a later spec asked for | it gets | who asked |
|---|---|---|
| `ROAD_CORRIDORS`, `roadCorridors()` | `ROAD_QUADS` + `roadCorridorContains(p, margin?)` | 5, 6, 10, 11 |
| `DOOR_SPURS` | `SITE_DOORS` | 5 |
| `PLAZA` | `PLAZAS` | 5 |
| `RIVER_COURSE` | `WATER_BANDS` + `waterTile` | 5 |
| `VILLAGE_PLOTS`, `VILLAGE_PLOTS.tavern` | `BUILDING_SLOTS` + `BUILDING_FOOTPRINTS`, which now carry nine plots including `tavern` | 6, 10, 12 |
| `VillageGraph`, `VillagePlan` | nothing — this module's exports **are** the graph, and no function takes one as a parameter | 7, 12 |
| `VILLAGE_SIZE`, `VILLAGE_CAMERA_ZOOM` | `WORLD_SIZE` (64), `CAMERA_ZOOM` (64) | 7 |
| `roadPath(from: Vec2, to: Vec2)` or `roadPath(from, to, graph)` | **`routeBetween(from: Vec2, to: Vec2)`** — `roadPath` takes node **ids**, and every point-to-point caller wants `routeBetween` | 5, 6, 7, 12 |
| `districtFor(siteId)` | added above | 10 |
| `KEEP_PRECINCT` | added, §3.5 | 10 |
| `District.entrance`, `District.entranceFacing` | added, §3.2 | 5, 7 |
| `LAP_WAYPOINTS`, `LAP_START`, `WAYPOINT_RADIUS` | **deleted**; `COURSE_NODES` / `COURSE_START` | 7 (imported them), 12 (deleted them) |
| `openGround.ts` (camelCase) | `open-ground.ts` — every other file in `src/lib/realm` is kebab-case | 5, 8, 11, 12 |
| `openGroundPoint(zone, rng, layout, clearances)`, `pickOpenPoint(rng, {zones, clear})`, `openGroundNear(point, layout, opts)` | **`openPointInZone(zone, layout, seed, rules, hero?)`** and **`openPoints(layout, seed, rules, opts)`** | 7, 8, 12 |
| `SpawnZone = { center, radius, mix? }` | `SpawnZone = { id, districtId, bounds: Rect, weight }` — rectangles, and the **district** says what belongs in a zone, not a `mix` field | 8 |

**New module `src/lib/realm/open-ground.ts`** — every export in §3.7:

- `type SpawnZone`, `type OpenGroundRules`
- `SPAWN_ZONES: SpawnZone[]` (ten, listed in §3.7)
- `TROUBLE_RULES`, `GLEAM_RULES`, `DECOR_RULES`
- `isOpenGround(p, layout, rules, hero?): boolean`
- `openPointInZone(zone, layout, seed, rules, hero?): Vec2 | null`
- `openPoints(layout, seed, rules, { count, districts?, hero? }): Vec2[]`
- `zonesFor(districts: DistrictId[] | null): SpawnZone[]`
- `zoneAt(p: Vec2): SpawnZone | null`

**Changed in `src/lib/realm/layout.ts`**

- `WORLD_SIZE = 64`, `GROUND_SIZE = 88` (new export), `CASTLE_POSITION = { x: 0, z: -24.5 }`, `SPAWN = { x: 0, z: 26.5 }`, `GATE_Z = 28.5`
- `PropKind` gains `"water"`
- `Prop` gains `elevation?: number`
- `decorSpots(seed?: number): { kind: string; x: number; z: number }[]` replaces `DECOR_SPOTS`
- `buildingFootprint(id)` now reads `BUILDING_FOOTPRINTS` for w/d
- `BUILDING_SLOTS` re-exported from `village.ts`

**Changed in `src/lib/realm/movement.ts`**

- `HeroState` gains `route: Vec2[] | null; routeIndex: number`
- `ROUTE_MIN_DISTANCE = 12`, `UNSTICK_PASSES = 8`
- `setRoute(state, target, colliders): HeroState`
- `clearRoute(state): HeroState`
- `unstickHero(state, colliders, rescue?: Vec2[]): HeroState` — third parameter is new

**Changed in `src/lib/realm/camera.ts`**

- `CAMERA_ZOOM = 64`, `CAMERA_DEADZONE = 2.5`, `CAMERA_LOOKAHEAD = 3`, `CAMERA_EDGE_MARGIN = 2`
- `followCamera(current, hero, dt, { reducedMotion, facing?, deadzone?, lookAhead? })`
- `clampCameraToWorld(target, viewport: { w: number; h: number }): Vec2`

**Changed in `src/lib/realm/spells/troubles.ts`** — **this slice owns the move off foundations and the rename.** Slice 8 builds on the result and does not re-perform it.

- `Trouble.siteId` → `Trouble.zoneId: string`; new `Trouble.nearSiteId: string | null` (the nearest site within 8 units, so slice 8 can write "the fog by the Mill")
- `SpawnInput.clearedSites` → `SpawnInput.clearedZones`; new `SpawnInput.hero: Vec2`, `SpawnInput.districts?: DistrictId[] | null`; the rename runs through `use-spell-sim.ts:27, :35, :94, :102, :117`
- The full `SpawnInput` at the end of the programme, with the owning slice against each field, so slice 8 republishes this shape and not a subset:
  ```ts
  type SpawnInput = {
    seed: number; now: number; layout: WorldLayout; troubles: Trouble[]; lowStimulus: boolean;  // existing
    zones: readonly SpawnZone[];        // this slice
    clearedZones: Record<string, number>;  // this slice (renamed from clearedSites)
    hero: Vec2;                         // this slice
    districts?: DistrictId[] | null;    // this slice
    objectiveZoneId?: string | null;    // slice 8 — prefer the objective's district
  };
  ```
- module-local `LIMIT` deleted

**Changed in `src/lib/realm/recess/recess.ts`**

- `COURSE_NODES: RoadNodeId[]`, `COURSE_START: Vec2`, `COURSE_LENGTH_UNITS = 128` (new exports, §3.8)
- **DELETED:** `LAP_ROUTE`, `LAP_WAYPOINTS`, `LAP_START`, `WAYPOINT_RADIUS` — slice 7 and slice 12 both read `COURSE_NODES`/`COURSE_START`
- module-local `LIMIT`, `CLEAR_COLLIDER`, `CLEAR_VILLAGER`, `CLEAR_PATH`, `CLEAR_SPAWN` deleted in favour of `GLEAM_RULES`

**Changed in `src/lib/realm/ceremony/ceremony.ts`**

- `CeremonyState` gains `routes: Record<string, Vec2[]>`, `routeIndex: Record<string, number>`, `heroRoute: Vec2[]`, `heroRouteIndex: number`
- `VILLAGER_SPEED` 3 → 5.0; new `CEREMONY_HERO_SPEED = 6.0`
- `squareCorners` deleted

**Changed in `src/lib/realm/villagers.ts`**

- `villagerPosition(slot, footprint)` deleted; callers use `villagerStandFor(buildingId)` from `village.ts`
- `VILLAGER_OFFSET` retained only as the fallback constant in `villagerStandFor`

**Changed in `src/lib/realm/tiles.ts`**

- `waterTile(seed: number, size?: number): Tile` and `WATER_COLORS: string[]` (new)

**Changed in `src/components/realm/realm-scene.tsx`**

- One merged road mesh replacing the per-path-prop meshes at `:269-274`
- One merged wall mesh; the gate arch drawn at `prop.elevation`
- Water rendered as ground decals at `GROUND_Y.water` (new lowest rung on slice 1's ladder), excluded from `standing` and from `PropLabel`
- Hero spawn facing `"n"`

**Changed in `src/components/realm/sprite-source.tsx`**

- `SpriteTextures["tiles"]` gains `water: THREE.CanvasTexture`
- `GRASS_REPEAT = GROUND_SIZE / 2`

**CSS class names**: **none**. This slice adds no DOM. Its one string goes through slice 1's existing `.realm-message`. No new route paths. No new column names.

### 8.2 Consumes

**From slice 1 (`first-impression`):**

- The centred message lane component (`realm-messages.tsx`) and its priority ladder — used once, for `The road brings you back.` at `"notice"` priority. This slice requests **no** field from `depth.ts`; slice 1's table is closed and complete.
- `edgeArrow(camTarget, target, viewport)` in `camera.ts` — this slice's zoom change makes it fire far more often, and slice 1's marker set is the reason a 23-unit frame is safe
- The `speak()` wiring and its last-spoken ref pattern

**From slice 2 (`sprite-budget-and-gallery`):**

- The parallelised `SpriteSource` awaits and the warm kind-keyed cache across a short round trip — a **hard** dependency; without it the village re-pays 38 rasterisations on every return
- `generateMipmaps` + `LinearMipmapNearestFilter` on ground textures — the road and water tiles are new minified repeating textures and would crawl without it
- The building height ladder; this slice sets w and d only and composes h from slice 2's values

**From the existing codebase:** `HERO_RADIUS`, `HERO_SPEED`, `ARRIVE_RADIUS`, `stepHero`, `blocked` semantics (`movement.ts`); `REACH` (`villagers.ts`); `seededRng` (`drill-generators.ts`); `BUILDINGS` (`kingdom.ts`); `cobbleTile`, `grassTile` (`tiles.ts`); `tileToTexture` (`tile-texture.ts`); `RenderSettings` (`render-settings.ts`).

---

## 9. Out of scope

Named, with the slice that owns each.

- **Painting any of it.** The road's stone, the wall's masonry, the gate's timber, the river's water, the mill wheel, the market stalls, the district signs, the shared palette module, prop jitter, the dozens of seeded props, and fixing `decor: !calmPalette` — **slice 5 (`village-life`)**. This slice ships the town's shape and hands slice 5 a plan to fill. That split is deliberate: slice 5 is the one the user paid two large slices for, and it should spend all of its budget on content rather than half of it on geometry.
- **Doors and the world's exits.** This slice sites the **Tavern's plot, footprint, door node and spur** (§3.3, §3.4) because it is the largest new solid in the programme and must be in the table `layout.test.ts` asserts non-overlap over. What happens when a child walks into it — the door list, `nearestInteractable`, the quests panel, the Kingdom panel, the exit and the siblings' board — **slice 6 (`doors-and-the-tavern`)**. Slice 6 derives its door point from `doorPointFor("tavern")` and its Keep door from `keepFootprintFor(layout.keepStage)`, never from a coordinate of its own.
- **Fast travel, the mount's job and the companion's.** This slice produces the distance and publishes the road graph; it does not spend a single line on riding. The 20-second worst walk and the `DISTRICTS[].centre` arrival nodes are the brief slice 7 inherits — **slice 7 (`fast-travel-and-the-companion`)**.
- **Trouble names, health, hit reactions, death beats, the alert tell, and the minutes clearing earns.** This slice changes only *where* troubles spawn and adds `nearSiteId` so slice 8 can name a place. Everything a child sees about an enemy — **slice 8 (`troubles-that-read-and-pay`)**.
- **Sound, and the tutorial that would teach the town's shape.** A tutorial written against a village that is still gaining doors, riding and combat rewards would be written three times — **slice 9 (`sound-and-first-five-minutes`)**.
- **The keep's silhouette, the five plot stages, the in-world signboards and deleting the nine floating DOM label pills.** This slice moves the keep and exports `KEEP_APPROACH_CLEAR_Z` as a tripwire for growing it; it does not change a pixel of what it looks like — **slice 10 (`plots-signs-and-the-keep`)**.
- **The building redraw.** Fourteen hand-authored figures — **slice 11 (`building-redraw`)**.
- **Persisting gleams and lap times, the lit posts, the arch, the ghost and the board.** This slice lays the course at the length slice 12 needs (128 units, 36.6 s) and guards it with a test; making a lap *survive the visit* needs the schema change and the records surface — **slice 12 (`recess-that-counts`)**.
- **Attribution, the 8-of-8 completion state, the session summary and the parent's Realm panel.** — **slice 13 (`record-of-the-work`)**.
- **Returning to where you were.** **Refused, not deferred** — §4 gives the three reasons. Every visit starts at the gate, facing the town. Slice 7's `districts_visited` is a different column for a different feature.
- **A sky, a horizon and a backdrop — refused, and the refusal is the ruling.** The audit found that `<color attach="background">` at `realm-scene.tsx:247` is never visible, because the 120-unit ground plane always covers the ~48-unit frame: the world has no horizon and no sky at all. This slice does not add one. `clampCameraToWorld` keeps the frame inside `WALL_INSET + CAMERA_EDGE_MARGIN`, so the ground plane's edge and the void beyond it are never in shot, and **the 3.5-unit town wall is the edge of the world, permanently**. That is a defensible choice for a fixed tabletop camera — a painted sky on a billboard world is a second art direction — but it must be a *decision* rather than a hole, so: there is no sky; the wall is the horizon; the background colour stays unseen and `realm-scene.tsx:247` is left alone rather than tuned. If a later programme wants a treeline or hills beyond the wall, the place for it is a painted band drawn *outside* the wall in slice 5's palette, and the camera clamp would have to be loosened to show it.
- **Elevation, terrain variation, day/night, weather, building interiors, ambient crowds and animals.** Not in this programme at all. The ground stays one flat plane; "Chapel Hill" and "Watch Hill" are names on a map, not slopes. If the user wants real elevation it is a separate programme, and it would invalidate the billboard-sprite decision the whole art direction rests on.
