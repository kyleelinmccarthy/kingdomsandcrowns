# The building redraw

**Date:** 2026-09-10
**Status:** Design spec. Written up front per decision 1; the implementation plan is written at build time, because a plan citing file:line would be stale by the time slices 1–10 have landed.
**Programme:** [The Realm: Presentation Overhaul — Design Brief](./2026-09-10-realm-presentation-overhaul-brief.md), slice 11 of 13. Effort: large.
**Depends on:** slice 2 `sprite-budget-and-gallery` (the raster budget and the `/dev/figures` gallery), slice 10 `plots-signs-and-the-keep` (the keep's stage/skin split and the retirement of the cosmetic watchtower tier), slice 5 `village-life` (the world palette module and the prop set this redraw must sit beside).
**Consumed by:** nothing. This is the last art slice; slice 12 `recess-that-counts` and slice 13 `record-of-the-work` build on top of a world whose figures no longer change.
**Acceptance:** the user looks at the gallery and at a same-framing screenshot of the two views they photographed. There is no test that can replace this.

---

## 1. Why — the complaints and the audit findings this answers

The verdict, verbatim, the two clauses this slice is accountable for:

> the world still looks pretty rough **since the buildings are flat** … its really, really rough in a bad way and needs to improve a LOT. … **also the castle looks like a TeePee.**

The audit findings this slice closes, quoted from Appendix A of the brief:

**"the buildings are flat"** — _blocking, large effort_

> Three compounding causes. (1) Projection mismatch: the ground is a true 35.26-degree isometric plane, but every building figure is a straight-on front elevation -- a rectangle facade with a triangle roof seen edge-on (well, mill, chapel, library, market, cottage, manor all follow this). No roof plane, no side wall, no depth cue of any kind. (2) Unlit material: props are three.js `<sprite>` billboards with spriteMaterial, which ignores lights entirely, so the ambientLight 0.9 and directionalLight 0.8 in the scene do nothing to them -- there is no light direction and no form shading beyond what is baked flat into the SVG. (3) No grounding … Net effect: cardboard stickers standing on a lawn.
>
> *Where:* `src/components/realm/realm-scene.tsx:249-250, src/components/realm/realm-scene.tsx:305-313, src/components/realm/world-figures.tsx:185, src/components/realm/world-figures.tsx:309, src/lib/realm/tiles.ts:6`
>
> *Fix:* Redraw the eight buildings and eight castle tiers in 3/4 isometric: visible roof plane, one lit face and one shaded face, matching the ground's 2:1-ish diamond. … Keep spriteMaterial (billboards are correct for a fixed camera) but bake a consistent key light from the upper-left into every figure so the whole set shares one sun.

Cause (3) is closed by slice 1's contact shadows. Causes (1) and (2) are this slice. **The fix as written contains one arithmetic error, which section 3.1 corrects: the ground's diamond is √3:1 (1.732:1), not 2:1.** Drawing roof planes at 2:1 would put every roof 15% out of register with the shadow underneath it, which is the same class of wrongness we are here to remove.

**"the castle looks like a TeePee"** — _blocking, medium effort_

> (1) CastleFigure's default branch is literally a tent: two triangles plus a campfire, and it is the default so any unknown tier also draws a tent. … The centrepiece of a game called Kingdoms & Crowns is a 120-px teepee.
>
> *Where:* `src/components/realm/world-figures.tsx:170-180, src/lib/realm/layout.ts:34-44, src/lib/utils/avatar-catalog.ts:535-536, src/lib/actions/realm.ts:96`

Slice 10 fixed *which* keep is shown (progress drives the stage, the cosmetic ladder becomes a skin). This slice draws it. Verified still true at `world-figures.tsx:170-180`: the default branch is `<polygon points="8,56 32,20 56,56" fill="#c9b27a" />` plus a campfire.

**implied — "silhouette readability"** — _major, medium effort_

> First: CastleFigure's "watchtower" tier (a stone tower with merlons, a gold window and a wood door) is near-identical to BuildingFigure's "watchtower" (a stone tower with merlons, a gold window and a wood door). At level 60-64 the player's castle is a stone tower standing 9.2 units from an identical stone tower labelled "Watchtower" -- the two are told apart only by the DOM label. Second: BuildingFigure "bridge" paints its own river (#1e3a8a fill across the bottom of the figure) but the layout has no water anywhere … Third: the garden figure is #5aa55a/#3d8a4a against #2e5a3a/#33633f grass -- green on green, it will disappear.
>
> *Where:* `src/components/realm/world-figures.tsx:67-78, src/components/realm/world-figures.tsx:278-288, src/components/realm/world-figures.tsx:220-231, src/components/realm/world-figures.tsx:290-304`

All three verified in the file as it stands. The keep-kit decision in 3.6 makes the first structurally impossible rather than merely fixed.

**implied — "what a player's eye is drawn to"** — _major, medium effort_

> The world's own accent colours -- GOLD #fde68a windows, FLAG #c0563d, the market's red/green/orange crates -- are 4-6 unit details on a 64-unit figure, which after the 2.7x minification land at 8-9 screen px. So the intended focal points are smaller than the chrome that is competing with them. … *Fix:* … Enlarge the gold accents in the figures so they survive minification.

Verified: `world-figures.tsx:90-91` draws the keep's gold windows as `width={4} height={6}` on a 64-unit canvas.

**implied — art direction is inconsistent** — _minor, small effort_

> colorFor(prop) feeds only the boxGeometry fallback path, which runs solely when a figure fails to rasterise; the sprite path uses whatever is baked into the SVG. So the file that looks like the world's palette definition is dead art direction, and the SVGs each invent their own colours independently -- which is why the garden ends up green-on-green and the well's body #7d7d7d is pixel-identical to the rock decoration's #7d7d7d.
>
> *Where:* `src/lib/realm/layout.ts:58-67, src/components/realm/realm-scene.tsx:232, src/components/realm/realm-scene.tsx:318-322, src/components/realm/world-figures.tsx:15-25`

**implied — buildings do not feel placed in the world** — _major, small effort_

> Billboards are anchored to the footprint CENTRE, but the collider covers the whole footprint plus the hero radius, so there is a two-unit invisible dead zone in front of every building. … the child walks up to a chapel, is stopped about 50-65 px short of it, and nothing explains why.

Slice 2 patched this by eye (anchor to the near edge). This slice replaces the eyeballed offset with a derived one (3.2), because with a real isometric figure the anchor is computable.

**implied — "scale relative to the hero sprite"** — _major, small effort_

> BUILDING_SIZE is {w:3,d:3,h:2.5} for seven of the eight, so spriteSizeFor makes them a uniform 3.5 x 3.5 -- a Chapel, a Library and a Market Square are all the same 1.75-hero-heights-tall box with the same footprint, meaning the skyline is eight identical blobs … Villagers are 2 units tall standing next to 3.5-unit buildings — they are more than half the height of their own chapel and could not fit through its door.

Slice 2 owns the scale ladder. This slice owns the consequence the ladder cannot state on its own: **the current sprite quad is too narrow for a correct isometric base to fit inside it** (3.5 units wide against a 3×3 footprint whose projected diamond is 4.24 units wide). That is the mechanical reason nobody could have drawn a roof plane before now, and section 3.2 fixes it.

---

## 2. Decisions

| # | Question | Decision | Because |
|---|---|---|---|
| D1 | What is the ground's diamond ratio? | **√3 : 1 (1.7320508…)**, not 2:1. Every roof plane, base plate and top face is generated from `diamondPoints()`, never drawn by hand. | The camera is `CAMERA_OFFSET {12,12,12}` (`camera.ts:4`) — a true isometric view down (1,1,1). A world unit in x or z runs 0.70711 across and 0.40825 down on screen; the ratio is exactly √3. A 2:1 roof would sit 15% wide of the contact shadow slice 1 draws underneath it. |
| D2 | Which face is lit? | The **left-hand wall on screen — the world's +z face** — takes `lit`. The **right-hand wall, the +x face** takes `shade`. The roof takes `top`. One sun for all sixteen figures, from the upper left. | Worked in world space in 3.1: a sun at screen-upper-left is world ≈ (−0.79, 0.58, 0.21); its dot with (0,1,0) is 0.58, with (0,0,1) is +0.21, with (1,0,0) is −0.79. |
| D3 | Where is the door? | Always on the **+z face** (`DOOR_FACE`), the face that looks south down the road toward the spawn. Minimum 1.4 world units wide and 1.9 tall. | One rule means slice 4's spur always meets a door, slice 6's Tavern threshold is where the child expects it, and a 1.9-unit door is one a 1.8-unit villager could walk through — the audit's complaint. 1.4 units is 90 screen px at `CAMERA_ZOOM` 64 — comfortably over slice 1's 56-px world touch-target floor, which 1.4 units already cleared at zoom 40. |
| D4 | How are the five keep stages × eight skins drawn without 40 figures? | **Seven reusable kit pieces**, arranged per stage by a pure `keepPieces(stage)`, with the skin passed into the figure as palette props so the cache key is `keep:<piece>:<skin>` and exactly one skin is ever live. | Multiplying `spriteMaterial.color` is not available: `realm-scene.tsx:309` already spends it on `CALM_TINT`, and a multiply would muddy the gold anyway. A kit also makes each stage differ by *mass added*, not by repaint, and drops the citadel from a single 3-megapixel canvas to seven small ones. |
| D5 | Does the keep share any primitive with a kingdom building? | **No.** The kit is walls, drum towers, a gatehouse arch, a donjon and a treadwheel crane. No kingdom building uses a merlon, a drum, an arch or a curtain wall. | Slice 10 retired the cosmetic watchtower tier; this makes the collision impossible to reintroduce rather than merely absent. Enforced by a test on `SILHOUETTE_KEYS`. |
| D6 | Does the bridge still paint its own river? | **No** — and it does not need to, because **slice 4 cuts a real river**. The deck gap between `water-mid` and `water-east` is **6 units wide across x** (x ∈ (−3, 3)), carrying the Kingsway, and the bridge's footprint is slice 4's **6 × 5**. So the figure is drawn as three stone arches spanning the full 6-unit channel with cut-stone abutments landing on the banks at x = ±3 — the abutments are *part of* the 6-unit span, not extra width outside it. No `≤ 4 units` constraint is published, because the channel is 6 and the bridge is drawn to it. | A painted blue puddle in a dry field is the thing the audit laughed at; a bridge that cannot reach its own banks would be the same joke inverted. Slice 4 owns the geometry and this figure is computed from it. |
| D7 | Do the figures change with the complexity axis? | **No. The world is identical at simple and full depth.** `surfacesFor()` is not consulted by any figure. | Two children in one house look at the same town. A "simple" art set is exactly the patronising failure decision 7 names, and there is no removal here to substitute for. |
| D8 | Is there a schema change? | **None.** This slice takes no migration and reserves no number; numbers are drizzle-kit's, assigned in build order. | Nothing stored changes value or meaning. See 4. |
| D9 | Is there a "the builders repainted" message on the first visit after? | **No.** | A redraw that needs an apology is a redraw that failed. The buildings a child raised are still there, in the same places, with the same names and the same counts. |
| D10 | How does a tripled pixel bill not re-block first paint? | `SpriteSource` rasterises in **two waves**: wave one is everything the world can currently show; wave two is the figures for buildings not yet raised. | A new child today pays for eight building textures to look at zero buildings. Wave one for a new child comes out *smaller* than today's single wave. Numbers in 3.8. |
| D11 | Pixel-art or vector? | **Flat vector on a coarse grid**, 16 SVG units to the world unit, with **antialiasing confined to the isometric diagonals and nothing else**. Horizontals, verticals, every face edge, every door, every window and every accent land on integer grid units and are drawn `shape-rendering="crispEdges"`. Only the ground-plane diagonals — which have no whole-pixel representation at √3:1 — take their exact fractional coordinates on an antialiased sub-path. | See the reconciliation note below: this is the one place the three drawing slices could have diverged, and it is settled here. |

**The one art-direction ruling the three drawing slices share, settled before any of them is built.** Slice 2's acceptance criterion is *"every figure's edges land on whole pixels; merlon teeth are even; a flag pole is a solid 2 px at 1×, 4 px at 2×"*. Slice 5 hand-authors a 5×7 pixel font rather than use platform type, and refuses per-instance rotation, both because resampling a nearest-filtered sprite off the texel grid is the mechanism slice 2 identified as the cause of "rough". Those two are one direction: **the world is pixel art on a coarse grid.** A third direction — sixteen large figures whose every edge is antialiased — would put soft-edged buildings beside a hand-stepped font and a whole-pixel treeline, in one frame, which is precisely the inconsistency the user's word "rough" was describing.

So D11 is **not** "antialias freely". It is:

1. **Everything structural is on the grid.** `quantise(units)` is applied to every authored point in every figure. Faces, roofs, doors, windows, merlons, posts, sills, bands: integer grid units, `crispEdges`, no exceptions, asserted by `iso.test.ts` over the path data of all sixteen figures.
2. **The isometric diagonal is the single exception**, and it is exempt because it *cannot* be on the grid: the ground diamond's slope is 1:√3, which is irrational, so a "whole-pixel" diagonal would be a hand-stepped staircase whose step size would have to be re-authored at every zoom. Slice 4 has already changed the zoom once. Stepping them would cost about a week and would have to be paid again.
3. **The exemption is bounded and visible.** A diagonal is at most two edges of any one face, always meets the grid at both ends, and — because slice 2 makes texel:device-pixel exactly 1 — its antialiased source pixels arrive on screen one-for-one rather than being resampled. That is a soft *drawn* edge, not a soft *sampled* one, and it is the difference between a drawn line and the shimmer the audit measured.
4. **`/dev/figures` is where this is confirmed, at Checkpoint 3's judgement**, with one building shown beside slice 5's carved district sign and a treeline: if the buildings still read as a different medium from the props, the answer is to step the diagonals and pay the week, and that lever is named here rather than discovered.
| D12 | Does anything animate? | **No.** The mill's sails are drawn canted ~20° off the vertical so they read as caught mid-turn rather than frozen at a dead stop. | Animation is a scene change, not a figure change, and the programme has no slice for it. Canting the sails is free and removes the only place a static figure looks broken. |

---

## 3. Design

### 3.1 The projection, worked

`CAMERA_OFFSET = { x: 12, y: 12, z: 12 }` with `camera.lookAt(t.x, 0, t.z)` and three's default up of (0,1,0) gives a view basis of:

```
screen-right = ( 1/√2,      0,     −1/√2 ) = ( 0.70711, 0,       −0.70711 )
screen-up    = (−1/√6,  2/√6,      −1/√6 ) = (−0.40825, 0.81650, −0.40825 )
```

From which, per world unit:

| world axis | screen x | screen y |
|---|---|---|
| +x | +0.70711 | −0.40825 |
| +z | −0.70711 | −0.40825 |
| +y | 0 | +0.81650 |

So a unit square on the ground projects to a rhombus **1.41421 wide by 0.81650 tall — a ratio of exactly √3 : 1**, with its axes 30° off the screen horizontal. This is *true* isometric, not the 2:1 dimetric that pixel-art tooling assumes. Every diamond in the world — a footprint, a roof plane, a contact shadow, a plot outline — is 1.732:1, and the whole set has to agree or it reads as slop.

Three constants follow, and they are the whole geometric contract:

```
ISO_RUN  = 0.7071067811865476   // screen-x travelled per world x or z unit
ISO_RISE = 0.4082482904638631   // screen-y dropped per world x or z unit
ISO_LIFT = 0.8164965809277260   // screen-y gained per world y unit
```

`ISO_LIFT` is the one people get wrong. A `<sprite>` is a camera-facing quad, so its own height is *not* foreshortened: a sprite 4 world units tall covers `4 × CAMERA_ZOOM` screen pixels. But a real vertical of 4 world units covers `4 × 0.8165 × CAMERA_ZOOM`. **So a wall of world height h must be drawn `h × ISO_LIFT` quad-units tall, not h.** Every figure in the world today draws its walls at full height, which is why they are all 22% too tall for their own footprints — a second, quieter reason they read as stickers.

**The sun.** "Upper left of the screen" is, in world terms, `0.707·(−screen-right) + 0.707·(screen-up)` ≈ `(−0.789, 0.577, 0.211)`. Dotted against the three visible face normals:

| face | normal | dot with sun | value |
|---|---|---|---|
| roof / top | (0, 1, 0) | +0.577 | `top` — brightest |
| +z face (screen-left wall) | (0, 0, 1) | +0.211 | `lit` |
| +x face (screen-right wall) | (1, 0, 0) | −0.789 | `shade` |

The two visible walls meet at the near corner and form a V: the left wall's base runs down-and-right, the right wall's base runs up-and-right. The near vertical corner where they meet is drawn in `line`, one grid unit wide. That single dark vertical is the strongest "this is a solid" cue available and every figure has one.

### 3.2 The sprite quad, and why nothing could have been drawn correctly before

A prop with footprint `w × d` and height `h`, with a roof overhang `o` per side, needs a quad of:

```
W = (w + d + 2o) × ISO_RUN
H = (w + d + 2o) × ISO_RISE + h × ISO_LIFT
```

Both quantised down to 1/16 of a world unit so the SVG viewBox comes out in whole units.

For today's shared `BUILDING_SIZE {w:3, d:3, h:2.5}` that is **W = 4.60**. `spriteSizeFor` gives `prop.size.w + 0.5 = 3.5` (`layout.ts:111`). The quad is 24% narrower than the footprint's own projected diamond. There has never been room in the canvas to draw a correct isometric base, which is why every figure is a front elevation: a front elevation is the only thing that fits.

Two derived values complete the anchoring, both replacing eyeballed constants:

```
spriteAnchorY(size, o) = ( H/2 − ((w + d)/2 + o) × ISO_RISE ) / ISO_LIFT
```

The sprite keeps its default centre anchor and is positioned at the prop's world centre lifted by `spriteAnchorY`. The footprint diamond is horizontally *and* vertically symmetric about the footprint centre for any w and d (the extremes are ±(w+d)/2 × ISO_RUN and ∓(w+d)/2 × ISO_RISE), so no horizontal offset is ever needed. This supersedes slice 2's `center = (0.5, 0)` plus near-edge nudge: the offset is now exact rather than tuned.

**It supersedes it for every billboard, not only for buildings — and migrating the rest is in this slice's scope.** Slice 5 places roughly 96 seeded props, eight district signs and (with slice 10) nine signboards against `center = (0.5, 0)`. Leaving two anchoring conventions on one ground plane would put the buildings' feet in one place and the barrels' in another, at the same z, which is exactly the "floating" read slice 1 spent a section fixing. So:

- `spriteAnchorFor(prop)` is the **one** anchor entry point, and it is what `realm-scene.tsx` calls for every sprite it places: hero, companion, mount, villagers, troubles, props, signs, plots, the Tavern and every keep piece.
- For figures with a **footprint** (buildings, the Tavern, keep pieces, solid props) it returns `spriteAnchorY(size, overhang)`.
- For figures with **no meaningful footprint** — a person, a trouble, a gleam, a flat sign on a post — it returns the baseline form, `baseAnchor(grid, baselineRow)` from slice 2's catalog, which is the same computation expressed on the authored grid.
- `figure-catalog.ts`'s `FigureEntry.anchor` (`"base" | "centre"`) is what chooses between them, so the decision is data in the catalog rather than a branch at the call site.

Added to this slice's test list: **every** `FIGURE_CATALOG` entry resolves through `spriteAnchorFor` to a y that puts its painted baseline on the ground plane, asserted for a person, a prop, a sign, a building and a keep piece — and to this slice's browser pass: a screenshot of the Market Plaza with buildings, props and signs in one frame, checking that nothing floats and nothing sinks. Slice 5's props are in that frame, which is why the migration is here and not deferred.

```
riseTransform(size, o, s) = { scaleY: H × s, posY: groundY + (H/2 − ((w+d)/2 + o) × ISO_RISE) × s / ISO_LIFT }
```

The rise tween at `realm-scene.tsx:211-227` currently does `obj.scale.y = h * s; obj.position.y = (h * s) / 2`, which grows the sprite about its own centre. With the new anchor that would grow a building downward into the ground as well as up. `riseTransform` grows it about the ground origin, so a completing building comes up out of its plot.

**Consequence for the dead zone.** The collider stops the hero at `size.w/2 + HERO_RADIUS` (`movement.ts:24-28`). With the drawn base now equal to the footprint, the hero stops 0.45 units — about 29 screen px at `CAMERA_ZOOM` 64 — outside the drawn wall, instead of the 50–65 px the audit measured at zoom 40. It does not vanish, and it should not: half a hero's width reads as "standing at the wall".

### 3.3 The authoring grid and the shape of a figure

`FIGURE_GRID = 16` SVG units per world unit. `viewBoxFor(size, o)` returns `"0 0 ${W*16} ${H*16}"` — integers by construction, and **its aspect ratio equals the sprite quad's aspect ratio exactly**, which is unit-testable and is the guard against stretched art.

Every building figure is drawn back-to-front in this order. The order is the recipe; sixteen figures are affordable only because it is the same sixteen times.

1. **Base course.** `diamondPoints(size, { inset: 0 })` filled `material("stone").shade`, then the same diamond raised 0.25 world units filled `material("stone").lit` — a plinth, not a shadow. The contact shadow is slice 1's ground decal and no figure draws one. The baked `<rect x=4 y=56 width=56 height=4 fill="#24492e">` strip that slice 2 deleted does not come back; a test asserts no figure contains `#24492e`.
2. **Left wall** — the +z face, `facePoints("+z", …)`, filled `lit`.
3. **Right wall** — the +x face, filled `shade`.
4. **Near corner post** — one grid unit wide, full wall height, `line`.
5. **Eaves shadow** — a band one grid unit deep along the top of both walls, `line` at 45% alpha. The roof casting onto its own wall is the second strongest depth cue after the corner post.
6. **Roof planes** — `gableRoof()` / `hipRoof()` / `flatRoof()`. The sun-facing plane `top`, the other `shade`, ridge and eaves lines in `line`.
7. **Door** on the +z wall, ≥ 1.4 × 1.9 world units, `material("timber").shade` with a `line` frame and a `top` step below it.
8. **Windows and accents.** Every accent block is at least `MIN_ACCENT_SVG = 6` grid units on its shorter side — **24 screen px at the shipped `CAMERA_ZOOM` of 64** — against the 8–9 px the audit measured.
9. **The identity detail** — the one thing that names the place.

### 3.4 The palette

Slice 5 creates **`src/lib/realm/palette.ts`** — the one palette module in the programme — and it already carries the shade ladder this slice needs: `Shade`, `MaterialName`, `MATERIALS`, `material(name, palette?)` and `ACCENT_GOLD` are declared with their values in slice 5 §3.1, precisely so this slice imports them rather than starting a rival `palette.ts`. **There is no `palette.ts`.** This slice adds material *entries* if a figure needs one that is not in the fifteen, and nothing else.

```ts
export type Shade = { top: string; lit: string; shade: string; line: string };
export type MaterialName =
  | "stone" | "plaster" | "timber" | "thatch" | "clay-tile" | "slate"
  | "lead" | "brick" | "cloth" | "water" | "leaf" | "earth" | "iron";
export const MATERIALS: Record<MaterialName, Shade>;
```

Four steps per material, `top` → `lit` → `shade` → `line`, each step a fixed −12% relative luminance so that **the lit:shade luminance ratio is never below 1.35**. That floor is what keeps form shading alive under low-stimulus mode, where `realm-scene.tsx:309` multiplies the whole sprite by `CALM_TINT #a9aaa4`: a uniform multiply preserves ratios, so a 1.35 separation stays a 1.35 separation. Baked shading is the *right* choice for calm mode for exactly this reason, and it is why keeping `spriteMaterial` (which ignores the scene's lights entirely) costs us nothing.

The two colour rules the audit's failures imply, both enforced by test:

- `separationFromGrass(hex): { deltaL: number; deltaHueDeg: number }` — every wall, roof and hedge value must clear `ΔL ≥ 0.18` **or** `Δhue ≥ 25°` against each of `GRASS_COLORS[0..2]` (`#2e5a3a`, `#33633f`, `#24492e`). The garden's `#5aa55a` fails this today; its replacement is a blue-shifted hedge green at Δhue 31°.
- No two *different* materials may share a `lit` value. The well's body and the rock decoration are both `#7d7d7d` today.

`BUILDING_COLORS` is **gone** — slice 5 deleted it from `layout.ts`, and this slice does not resurrect it. The box-geometry fallback at `realm-scene.tsx:317-325` calls **`buildingColor(id, palette)`** from `palette.ts`, which slice 5 made live art direction with three real consumers. One source for a building's colour, not two: `buildingColor(id)` returns `material(SILHOUETTES[id].wallMaterial).lit` once `SILHOUETTES` exists, and slice 5's own value before that.

### 3.5 The eight kingdom buildings

**Footprints are `buildingFootprint(id)` from slice 4's `village.ts` — the one footprint table in the programme.** `w` and `d` are the town plan's (they are the collider, the road clearance and the door point, all computed against the street grid); `h` is slice 2's `BUILDING_HEIGHTS`. **This slice publishes no footprint table of its own**, and nothing below is a number a reader should trust over `buildingFootprint(id)`: every quad, viewBox and texture size in the table is *derived* from it and from `CAMERA_ZOOM`, and `iso.test.ts` regenerates the whole table at build time rather than comparing against these literals.

Two consequences worth stating before the numbers, because an earlier draft of this section carried neither:

1. **Seven of eight footprints are larger than the draft assumed.** Slice 4 sites a 6 × 4 market, a 6 × 5 library, a 5 × 6 chapel, a 5 × 5 mill, a 6 × 5 bridge, a 7 × 6 garden and a 3 × 3 watchtower. A 7 × 6 garden alone is nearly twice the drawn area of the 5 × 4 the draft used.
2. **The zoom is 64, not 40.** Slice 4 moved it and re-derived the catalog (slice 4 §3.9), including a one-`px`-step reduction on exactly these eight kinds. Texture sizes below are quoted at **zoom 64, dpr 2, after that reduction** — i.e. a net 1.28× linear against the old zoom-40 figures, not 1.6×.

| id | w × d × h (slice 4) | o | quad W × H | viewBox | texture @ zoom 64, dpr 2, one `px` step down |
|---|---|---|---|---|---|
| well | 3.0 × 3.0 × 3.0 | 0.25 | 4.5 × 5.0 | `0 0 72 80` | 360 × 400 = 144 kpx |
| mill | 5.0 × 5.0 × 6.0 | 0.30 | 7.4 × 9.0 | `0 0 118 144` | 590 × 720 = 425 kpx |
| bridge | 6.0 × 5.0 × 2.5 | 0.20 | 8.3 × 6.3 | `0 0 133 101` | 665 × 505 = 336 kpx |
| chapel | 5.0 × 6.0 × 6.0 | 0.40 | 8.4 × 9.7 | `0 0 134 155` | 670 × 775 = 519 kpx |
| market | 6.0 × 4.0 × 3.0 | 0.50 | 8.2 × 6.7 | `0 0 131 107` | 655 × 535 = 350 kpx |
| library | 6.0 × 5.0 × 4.5 | 0.40 | 8.4 × 8.1 | `0 0 134 130` | 670 × 650 = 436 kpx |
| watchtower | 3.0 × 3.0 × 9.0 | 0.20 | 4.4 × 10.7 | `0 0 70 171` | 350 × 855 = 299 kpx |
| garden | 7.0 × 6.0 × 2.0 | 0.20 | 9.9 × 7.1 | `0 0 158 114` | 790 × 570 = 450 kpx |

**Village Well** — a stone drum wellhead drawn as an octagon so the iso reads round, a peaked shingle canopy on four timber posts, a bucket on a rope hanging off the axis so the silhouette is asymmetric, and a crank handle in iron. The water is a dark disc down inside the drum, not the `#1e3a8a` rectangle it is today. Accent: the lantern hook over the mouth. No door — the mouth is the affordance — but `doorAnchor()` still resolves, so slice 4's spur ends at the south side of the canopy. Identity: the only figure with a hanging element.

**Grain Mill** — a battered stone drum tapering upward to a timber gallery ring at two thirds height, a conical shingle cap, and four sails on an axle canted ~20° off vertical (D12). Door on the +z face; sacks and a handcart at the base. Accent: warm cream sailcloth, which also gives the mill the widest silhouette in the town after the keep. Identity: the sails break the roofline.

**River Bridge** — three stone arches running along **x**, cut-stone abutments at both ends, a shadowed gully beneath the centre arch, parapets on both long sides (near parapet `shade`, far parapet `lit`, so the deck between them reads as a walkable surface). Accent: a gold-capped waymarker post at the near abutment. Identity: the only figure whose long axis is x — the one horizontal in a skyline of verticals.

**Chapel** — a nave running along z under a steep gable, plus a square bell tower at the north end rising to 8.0 with a pyramidal cap and a visible bell in an arched opening. Round-arched timber door on the +z face under a small porch roof. Accent: three lancet windows in warm amber down the lit wall, each 6 × 16 grid units, and the bell. Identity: the only building whose mass steps *up* rather than out.

**Market Square** — not a shed. An open timber frame with four striped awnings over trestle tables, crates, barrels, a hanging scale, and a low stone kerb marking the paved square. Two awnings lit, two shaded. No walls at all: you see through it, and the hero can be seen *behind* it. Accent: awning stripes in `material("cloth").lit` and the brass scale pan. Identity: the only figure with no walls.

**Library** — a stone hall under a **hipped** slate roof (the only hip among the eight), a three-step entrance to a pair of tall timber doors under a lintel, and a clerestory band of small windows above the eaves. Accent: one large arched window in amber on the lit wall, 10 × 18 grid units, and the doors' brass rings. Identity: the hip plus the stair.

**Watchtower** — a square tower on a battered base with a stringcourse at mid-height, a corbelled parapet, merlons **six grid units wide with four-unit gaps** (against the three-of-sixty-four that vanished), and a timber hoarding on the lit face. Door at the base, three arrow slits above. Accent: the brazier at the top, the single highest gold in the world after the keep. Identity: tallest and narrowest — the vertical.

**Royal Garden** — a walled garden, and the only figure that is mostly *enclosed ground* rather than roof: a low stone wall you look over, a timber gate on the +z face, an arbour of four posts with a vine canopy, clipped hedges in the blue-shifted green from 3.4, gravel paths in the cobble ochre, a bench and a beehive. Accent: flower blocks in rose and gold at 6 grid units each, and the gate's gold latch. Identity: you can see into it.

**The Tavern** (slice 6's landmark, redrawn here — **same family, same key**) — slice 4's footprint **7.0 × 6.0 × 7.0**, o 0.50, quad 10.2 × 11.6, viewBox `0 0 163 186`, texture 815 × 930 = 758 kpx. It keeps `data-figure="landmark" data-figure-id="tavern"` and the catalog key **`landmark:tavern`** that slice 6 registered; this is a **redraw, not a re-keying**, because changing the family would break `spriteFor`'s landmark branch and the catalog row slice 6 added. The door stays on the **west** face (slice 4 sites it facing the Kingsway), which is the one place this figure departs from `DOOR_FACE`'s +z rule, and `iso.test.ts` asserts the exception explicitly so it cannot spread. Two storeys with the upper floor **jettied** 0.4 units out over the lower — free and very strong depth, and it is the reason the Tavern reads as the biggest thing in town without being the tallest. Half-hipped roof with two dormers, a stone chimney on the shaded side, warm windows on both floors, a hanging sign on a wrought-iron bracket over the door, a lantern beside it. Accent: five gold windows, the largest gold mass outside the keep. Identity: the only jetty and the only chimney.

### 3.6 The keep: seven pieces, five stages, eight skins

Slice 10 owns `keepStageFor(buildingsComplete)` and the stages, and they are **numeric**: `KeepStage = 0 | 1 | 2 | 3 | 4`, with `KEEP_STAGE_LABELS` carrying the child-facing words (`Stone and scaffolding`, `Stone walls`, `Walls and a gatehouse`, `Walls, a gatehouse and towers`, `A citadel`). This slice uses those numbers and invents no id of its own; the piece table in §3.6 is keyed on them.

A monolithic citadel figure would be a single canvas of about 2180 × 2250 px at `CAMERA_ZOOM` 64 / dpr 2 — nearly five megapixels, twenty megabytes of GPU memory, most of it empty sky. (At zoom 40 it was three megapixels; the zoom change alone is why a kit stopped being an optimisation and became a requirement.) Seven small pieces, arranged, come to **1.72 Mpx** for the heaviest stage and are shared across all five, and only the pieces a stage uses are ever rasterised.

| piece | w × d × h | o | quad W × H | viewBox | texture |
|---|---|---|---|---|---|
| `wall-x` | 4.0 × 1.0 × 3.0 | 0.10 | 3.6875 × 4.5625 | `0 0 59 73` | 295 × 365 = 108 kpx |
| `wall-z` | 1.0 × 4.0 × 3.0 | 0.10 | 3.6875 × 4.5625 | `0 0 59 73` | 295 × 365 = 108 kpx |
| `tower` | 2.5 × 2.5 × 5.5 | 0.20 | 3.8125 × 6.6875 | `0 0 61 107` | 305 × 535 = 163 kpx |
| `gate` | 4.5 × 2.5 × 5.5 | 0.30 | 5.375 × 7.5625 | `0 0 86 121` | 430 × 605 = 260 kpx |
| `donjon` | 5.0 × 4.0 × 9.0 | 0.40 | 6.9375 × 11.375 | `0 0 111 182` | 555 × 910 = 505 kpx |
| `hall` | 5.0 × 3.0 × 5.0 | 0.40 | 6.25 × 7.6875 | `0 0 100 123` | 500 × 615 = 308 kpx |
| `scaffold` | 3.0 × 3.0 × 4.5 | 0.30 | 4.6875 × 6.375 | `0 0 75 102` | 375 × 510 = 191 kpx |

`wall-z` is drawn, not mirrored: billboards cannot rotate, and a mirrored east-west wall would put its merlon perspective backwards.

- **`wall-x` / `wall-z`** — curtain wall: battered base, a wall walk, merlons six grid units wide with four-unit gaps, arrow loops on the lit face.
- **`tower`** — a drum tower on a splayed plinth, machicolated corbel course, conical roof, one gold arrow-slit at 6 × 14.
- **`gate`** — twin half-drums flanking a pointed arch **1.6 world units wide** (102 screen px at `CAMERA_ZOOM` 64), portcullis behind it, drawbridge chains, banner brackets either side. This is the keep's door and slice 4's road terminates at its `doorAnchor`.
- **`donjon`** — the great tower: battered plinth, three storeys of paired windows, four corner turrets, a hipped lead roof and a weathervane.
- **`hall`** — a long great hall with a steep roof and four tall windows, appearing only at citadel.
- **`scaffold`** — timber scaffolding around a rising stone course, with a treadwheel crane, a rope and a hook. This is the piece that says *the kingdom is being built*, and it appears at every stage where the next mass has not yet gone up.

`keepPieces(stage)` returns placements relative to `CASTLE_POSITION`:

**Stages are slice 10's `KeepStage = 0 | 1 | 2 | 3 | 4`**, with slice 10's thresholds (`0 → 0`, `1–2 → 1`, `3–4 → 2`, `5–7 → 3`, `8 → 4`) and slice 10's footprints. This slice names no stage of its own and invents no threshold; `KEEP_STAGE_LABELS` is slice 10's child-facing copy.

| stage | buildings | `keepFootprintFor` | pieces |
|---|---|---|---|
| 0 *(Stone and scaffolding)* | 0 | 6 × 5 × 5 | `donjon` (0, 0) at one storey; `scaffold` wrapping it; a banner pole on the roof |
| 1 *(Stone walls)* | 1–2 | 8 × 6 × 6 | scaffolding struck; four `wall-x` / `wall-z` runs closing an 8 × 6 courtyard around the `donjon`; `tower` at both south corners |
| 2 *(Walls and a gatehouse)* | 3–4 | 9 × 7 × 7 | as stage 1 at 9 × 7, with `gate` (0, +3.5) replacing the centre south run; `tower` at all four corners; `scaffold` (0, −1) beside the donjon, which is still rising |
| 3 *(Walls, a gatehouse and towers)* | 5–7 | 11 × 8 × 9 | as stage 2 at 11 × 8; the `donjon` gains a storey and a hipped roof, replacing the scaffold; two further `tower` on the north corners |
| 4 *(A citadel)* | 8 | 12 × 9 × 11 | as stage 3 at 12 × 9, plus `hall` (+3.5, −1.5) and the full six towers; the season banners from `layout.ts:139-148` hang on the tower brackets |

Each stage differs from its neighbour by **a mass that was not there before**, never by a repaint — which matters because at simple depth the keep *is* the progress display, and a child has to be able to tell "something went up" from across the plaza (6.1).

Live pixel bill by stage at `CAMERA_ZOOM` 64, dpr 2, after slice 4's `px` step-down: stage 0 **552 kpx** · stage 1 690 · stage 2 995 · stage 3 1 370 · stage 4 **1 720**. Today's single castle sprite is 512 × 512 = 262 kpx at zoom 40, so a new child's keep costs about 290 kpx more, at 1.6× the zoom, and looks like a fortification under construction instead of a tent.

**Draw order.** `paintOrder(p) = Math.round((p.x + p.z) * 100)` is the isometric painter's key: larger (x+z) is nearer the camera and drawn later. `alphaTest` already gives correct occlusion for opaque texels, but two wall runs whose sprite centres are nearly coplanar will flicker as the camera follows the hero, so every keep piece sets `renderOrder = paintOrder(piece.position)` explicitly.

**Skins.** `KEEP_SKINS` is **slice 10's**, in `keep.ts`: it maps the eight `CASTLE_TYPES` ids to `{ id; stone: Shade; roof: Shade; trim: string; banner: string; flourish: KeepFlourish }`, and `keepSkinFor(castleType)` is the lookup. This slice declares none of it; the figure takes a skin as a prop: `<KeepPieceFigure piece="donjon" skin={skin} />`. The cache key is `keep:${piece}:${skinId}`, so exactly one skin is resident. A child who has been saving toward `citadel` since level 100 gets black granite and gold trim on whatever stage their kingdom has actually reached; a child with no castle row gets the `campsite` skin, which is now *rough grey fieldstone with birch scaffolding* rather than a tent. Nobody loses what they were saving toward, and nobody is shown a tent.

### 3.7 The gallery

Slice 2 built `/dev/figures`. This slice adds the five things a redraw needs and cannot do without.

- **Before / after.** The pre-redraw figures are kept for the duration of the slice as `src/components/realm/world-figures-legacy.tsx`, imported by the gallery and by nothing else, and deleted in the slice's final commit.
- **The town row.** All sixteen figures at true relative scale on one strip of real grass with the 2-unit hero standing among them, so the ladder is judged as a set rather than figure by figure.
- **Silhouette mode.** Every figure re-rendered as flat `#000` at 25% size. If two are hard to tell apart here, they are hard to tell apart at play size.
- **Calm preview.** The `CALM_TINT #a9aaa4` multiply applied over the figure, so low-stimulus mode is looked at rather than assumed.
- **Sun arrow.** A fixed arrow from the upper left drawn over each figure, so a wrongly lit face is visible instead of merely wrong.

Gallery copy, verbatim. It is a `/dev` route and no child sees it, but no string ships unwritten:

- Page title: `Figure gallery`
- Section headings: `Kingdom buildings` · `The keep` · `The Tavern` · `Decorations` · `Troubles`
- Toggles: `Grass` · `Calm palette` · `Silhouettes` · `Show the old figures` · `Rulers` · `Sun arrow`
- Ruler caption: `The hero is 2 units tall.`
- Per-figure caption: `Village Well · 2.5 × 2.5 × 3 units · 310 × 375 px`
- Failure: `This figure did not draw. Check the console.`

### 3.8 The two-wave raster, and the pixel bill

`SpriteSource` (`sprite-source.tsx:143-161`) rasterises the castle, **all eight buildings**, the foundation and six decorations before it calls `onReady` once. A brand-new hero pays for eight building textures in order to look at zero buildings. This slice splits it:

- **Wave one** — the keep pieces for the current stage, the Tavern, the plot/foundation figures, the decorations, and the buildings that are *already raised*. `onReady` fires here.
- **Wave two** — the figures for buildings not yet raised, so a site completing mid-visit still has its sprite ready and never box-flashes (the behaviour commit `86bdeed` added and this must preserve). `onReady` fires a second time with a superset. Both waves are `Promise.all` over slice 2's parallelised `textureFor`.

Cold-start bill at **`CAMERA_ZOOM` 64, dpr 2**, at slice 4's footprints and after slice 4's one-`px`-step reduction — the worst case, since dpr 1 is a quarter of these. The eight buildings above total **2.96 Mpx**; the Tavern adds 0.65 Mpx; the keep's kit is 0.55 Mpx at stage 0 and 1.72 Mpx at stage 4.

| | today (zoom 40) | after (zoom 64) |
|---|---|---|
| New hero, wave one | 1.44 Mpx (castle + 8 buildings) | **1.20 Mpx** (keep at stage 0 + the Tavern) |
| New hero, wave two | — | 2.96 Mpx, after first paint, invisible |
| 8/8 kingdom, wave one | 1.44 Mpx | **5.33 Mpx** (8 buildings + citadel kit + Tavern) |

So first paint gets *faster* for the child who has just arrived — 1.20 against 1.44 Mpx, at a 1.6× higher zoom — and slower for the child who has played a whole season and has eight buildings on screen to justify it. The 8/8 figure sits inside slice 4's re-costed `RASTER_BUDGET_TEXELS` of 6.5 M with the rest of the world's kinds counted, which is exactly why slice 4 raised it once rather than this slice raising it again.

**Budget: ≤ 250 ms added to a cold first paint at dpr 2 on the reference machine, 0 ms on a warm return** (slice 2 keeps the cache across a short round trip). Measured in the browser pass; if the 8/8 case exceeds it, the lever is to reduce the citadel's piece heights, **never** to lower texel density for one figure — mixed texel sizes across a set are visible and are the thing this whole programme exists to stop.

**Kind count rises, and the earlier draft's "unchanged" was wrong.** The cache is keyed by figure kind (`sprite-source.tsx:39-45`), so instances are free and kinds are billed. Before: 1 castle + 8 buildings + 1 foundation + 6 decor = 16 world kinds. After: 7 keep kit pieces + 8 buildings + 1 Tavern + slice 10's 4 plot stages + 6 decor = 26 **registered** kinds, of which typically 3–5 keep pieces are live at once. Against a **live**-kind count the citadel case is **+7** and the new-hero case **+2**; against the registered count it is +10, and every one of those ten is a `FIGURE_CATALOG` row counted automatically against the budget. The bill this slice moves is mostly in pixels, and section 5 covers what happens when one of them fails.

### 3.9 The four full-village engineering problems (decision 2)

This slice does not add a prop, a spawn or a route. It does change **footprints**, and a footprint is a collider, so all four objections apply.

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** Growing seven of eight footprints (from a shared 3 × 3 to as much as 6 × 5) shrinks open ground. This slice publishes the new footprint table to slice 4's `open-ground.ts` and re-runs its zone computation, and adds a colocated test asserting every `SPAWN_ZONES` entry still holds at least the minimum clear area slice 4 set. Slice 8 moved trouble spawning onto zones rather than foundations; that stays true and gets a larger, not smaller, argument, because a bigger building is a bigger thing for a trouble to be *next to*.

**(b) New solids can wedge the hero, and the ceremony walk and lap ring cross the map.** Four guarantees, all tested:

1. No building's footprint grown by `HERO_RADIUS` (0.45) satisfies slice 4's `roadCorridorContains(p, HERO_RADIUS)` over any `ROAD_QUAD` — streets, spurs and plazas alike. (There is no `roadCorridors()`.)
2. `doorAnchor(slot, footprint)` — the point 0.5 units outside the +z face — is not inside any collider, so slice 4's spur can always reach the door and slice 6's threshold is always standable.
3. **The layout must not depend on a single push.** `unstickHero` was rewritten in **slice 3** (eight passes, smallest-penetration axis, every overlapping collider collected) and gained a road-node rescue list in **slice 4**. The "resolves exactly one collider and pushes south" behaviour at `movement.ts:85-89` is **eight slices gone** by the time this one runs, and an earlier draft of this section argued against the rewrite as though it were still pending — it is not, and proving one push is enough is neither cheaper nor safer than the resolver that already exists.

   What this slice does assert, against the **redrawn** footprints and slice 5's prop placements, is that the resolver actually terminates somewhere sensible: `unstickHero(state, colliders, ROAD_NODE_POSITIONS)` called from the **centre of every solid prop in the generated layout** — nine buildings, the keep at every stage, every solid seeded prop — returns a position that is clear of every collider and inside the world bounds, at 0, 4 and 8 buildings complete. That is a stronger test than the single-push one, it exercises the code that ships, and it is the test that catches a redraw that grew a footprint into its neighbour.
4. **The ceremony plaza moves with the keep.** `ceremonyMarks` reads `castle.size.d` (`ceremony/ceremony.ts:49-53`) to place the hero and the eight villager marks. Changing the keep's footprint therefore moves the plaza, the road terminus and the ring. `keepBounds(stage)` is the single source: `layout.ts` reports it as the castle prop's `size`, `ceremonyMarks` reads it as it already does, and slice 4's paving and slice 12's lap ring derive from the same call. The existing `ceremony.test.ts:34` loop over every castle footprint becomes a loop over every keep stage.

Nothing here can strand a hero at load, because **no hero position is persisted anywhere** — `hero.current` initialises to `layout.spawn` on every mount (`realm-scene.tsx:73`). The only live risk is a building completing under a standing hero mid-visit, which `realm-scene.tsx:100-102` already handles by calling `unstickHero` on every `layout.colliders` change, and guarantee 3 makes that call sufficient.

**(c) Sprite rasterisation blocks first paint and more figures makes it worse.** Answered in 3.8: zero new kinds, a two-wave order that makes a new child's first paint smaller than today's, an explicit millisecond budget and a stated lever.

**(d) Gleam spawning needs open ground.** Same publication as (a). Slice 12's recess gleams draw from `SPAWN_ZONES`; the recomputed zones are the ones they use, and the same minimum-area test covers both.

---

## 4. Data model

**One non-schema state change worth naming: `PROP_SEED_VERSION` goes 1 → 2.** Seven of eight footprints grow, which changes slice 5's placement rule 4 exclusion zones, which moves whatever collided. Slice 5 §4 rules that any slice bumping the constant says so in its own spec, and this is the slice that bumps it. The child sees one toast on their next visit, in slice 1's message lane at `notice` priority: `The builders tidied the town while you were away.` — read aloud as written, no control, once. Nothing is stored, so nothing migrates; the seeded rank ordering keeps the change local, moving the props that collided and leaving the rest where they were.

**No schema change. No migration.** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan. This slice takes none, so it consumes no number and shifts none.

Nothing this slice touches is persisted. The figures are code. The sprite cache is an in-memory `Map` in `sprite-texture.ts:51` disposed on unmount. Keep stage is derived from `kingdom.buildings` at render time by slice 10's `keepStageFor`. Keep skin is read from the existing `castle` row through `getRealmBundle` (`actions/realm.ts:96`), which slice 10 already re-pointed at the skin axis; the eight `CASTLE_TYPES` ids are unchanged and `KEEP_SKINS` is keyed on exactly those eight, so **every existing castle row keeps working with no data change at all** and a child who owns `citadel` sees citadel livery from the first frame.

What existing rows do, stated the way the programme requires rather than as "it's nullable":

- A child with **no castle row** resolves `castleType` to `"campsite"` (`actions/realm.ts:96`), which `KEEP_SKINS.campsite` renders as rough grey fieldstone with birch scaffolding. They stop seeing a tent without anything being written.
- A child with a castle row naming a type not in `KEEP_SKINS` — impossible today, possible if the catalog grows — falls back to `KEEP_SKINS.keep`, not to a throw. `layout.ts:125` already applies the same defensive check for footprints.
- A child mid-season with 4 of 8 buildings sees stage `gatehouse` on their next visit rather than whatever tier their level bought. That change of meaning is **slice 10's**, and slice 10 owns the one-time message that goes with it. This slice only redraws what slice 10 already decided to show, which is why D9 says no second message: the same child would otherwise get two.

---

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| A building figure fails to rasterise (`sprite-source.tsx:149-150` finds no SVG, or `svgElementToTexture` rejects) | `spriteFor` returns `undefined` and `realm-scene.tsx:317-325` draws the box fallback at `buildingColor(id, palette)` from slice 5's `palette.ts`, which is live art direction rather than the dead `BUILDING_COLORS` the audit found, so the fallback is at least the right material. The label path is slice 10's signboard, unaffected. |
| **One keep piece fails while the others succeed** | The keep renders **all or nothing**. If any piece of the current stage is missing, the whole keep draws as a single box at `keepBounds(stage)` in `material("stone").lit`. A citadel with a hole where its gate should be is worse than a plain grey mass; a child must never see their castle broken. |
| Wave two rejects | Caught separately from wave one and logged; it must **not** call `onError`, which tears the world down. The world keeps running: the affected figures are for buildings not yet raised, which nothing is drawing. |
| A building completes while wave two is still pending | The shell holds `risingId` until `textures.world["building:" + id]` exists, then releases it. Without this the rise silently no-ops — `buildingObjects.current.get(r.id)` returns `undefined` at `realm-scene.tsx:213` — and the building pops in, which is the exact box-flash commit `86bdeed` fixed. |
| An unknown building id (a ninth building added later) | `silhouetteFor(id)` returns a default spec — cottage massing, gable roof, plaster walls, timber trim — rather than throwing. Tested. |
| An unknown keep skin id | Falls back to `KEEP_SKINS.keep`. Tested. |
| A figure's viewBox aspect drifts from its quad aspect | The art is stretched on screen and no human notices until the screenshot pass. Caught by test (7). |
| An accent drawn under `MIN_ACCENT_SVG` | Reintroduces the 8-px-gold failure. Caught by test (7). |
| Two figures with the same silhouette key | Reintroduces the castle-tier-versus-watchtower collision. Caught by test (7). |
| Slice 4's water channel and the bridge figure disagree | Cannot happen silently: the figure's quad is computed from `buildingFootprint("bridge")` (6 × 5 × 2.5) and `iso.test.ts` asserts the drawn span matches the gap between `WATER_BANDS.water-mid`'s east edge and `WATER_BANDS.water-east`'s west edge. If slice 4 ever narrows the gap, the figure narrows with it and the test says so. |
| `CAMERA_ZOOM` — already 64 by the time this slice runs | Slice 4 moved it 40 → 64 and **re-derived the whole catalog there** (slice 4 §3.9): the lattice re-snapped to 1.0 world units, every `px` was re-authored, the eight largest kinds dropped one `px` step, and `RASTER_BUDGET_TEXELS` rose once to 6.5 M. Nothing in this slice hardcodes a pixel size — every quad is in world units and every texture size comes from `rasterScaleFor(quad, dpr)` — but **§3.5, §3.6 and §3.8's numbers are all computed at zoom 64 and at slice 4's footprints**, not at the zoom-40 figures an earlier draft carried. See the note at the head of §3.5. |
| Parent preview (`isChildView: false`) | Every figure is drawn from layout data alone and reads identically. The one preview-specific rule: the keep skin comes from the **previewed child's** castle row, never the adult's, so a parent looking at a six-year-old's realm sees the six-year-old's fieldstone. Nothing in this slice reads mana, cleared, ride or minutes, so there is nothing here to null. |

---

## 6. Accessibility

### 6.1 The complexity axis

**This slice's surfaces are identical at simple depth and at full depth, and it does not call `surfacesFor(depth, profile)`.** That is a decision, not an omission (D7): the world is the one surface where two children in the same house must be looking at the same place, and a "simplified" art set would be precisely the patronising failure decision 7 names. The invariant that simple depth is a *substitution* and never a *removal* is satisfied trivially, because nothing here is depth-gated in either direction. The nearest depth-sensitive surface, the plot's progress readout — pips at simple, numerals at full — is slice 10's signboard and stays there.

The axis does impose one real constraint on this slice, in the other direction. At simple depth **the keep's silhouette is the kingdom progress display**: a child who is shown pips rather than numerals still has to be able to see that something went up. Hence the rule in 3.6 that each stage differs from its neighbour by a mass that was not there before, never by a repaint — a change a six-year-old can register from across the plaza without reading anything.

### 6.2 Per learning-profile setting

- **reducedMotion** — nothing in this slice moves, so there is no motion cue needing a non-motion substitute. This is worth stating plainly because the codebase has a live counterexample: the single combat particle is gated on `motion`, so reducedMotion currently erases 100% of combat feedback. Baked shading is a *static* depth cue, and a child who has turned motion off gets the full benefit of this slice. The mill's canted sails (D12) are the only place a static figure might read as frozen, and they are drawn mid-turn rather than square.
- **lowStimulus** — `calmPalette` multiplies every standing sprite by `CALM_TINT #a9aaa4` (`realm-scene.tsx:235, 309`). It **mutes, it does not empty**: the world keeps every figure. A uniform multiply preserves luminance ratios, so the 1.35 lit:shade floor from 3.4 survives it and the form shading — the entire point of the redraw — is intact for the children who most need visual anchoring. The gallery's calm preview (3.7) is how that gets checked rather than assumed. Note the standing counterexample this slice does *not* repeat: `realm-shell.tsx:215,223` passes `decor: !settings.calmPalette`, which empties the world of decoration under low stimulus; slice 5 owns that fix and this slice adds nothing that would be stripped by it.
- **largerText** — no text. `globals.css:243-246` scopes `data-larger-text` to `.realm-panel`, which touches nothing here. The building's *name* lives on slice 10's signboard and scales there.
- **fewerChoices** — no choices added. The cap of `trackedObjectives` at 1 and `abilitySlots` at `'earned'` is untouched at both depths.
- **readAloud** — every figure is `aria-hidden="true"` (`world-figures.tsx:29`) and rasterised to a texture; there is nothing to speak. The building name that *is* spoken belongs to slice 10's signboard and slice 1's reach announcement.
- **inputMode (touch / keyboard / auto)** — no new interaction, but two consequences for reach. First, the invisible dead zone in front of every building drops from 50–65 screen px to about 13 (3.2), so a child walking to a door on touch now stops where the drawing says they should. Second, D3's 1.4-unit minimum door is **90 screen px at the shipped zoom of 64**, clearing slice 1's raised world touch-target floor, so slice 10's door interactions have something big enough to hit on a tablet.
- **soundEnabled** — nothing in this slice makes a sound.

### 6.3 Colour is never the only channel

Each of the eight buildings is distinguished by **mass and roof**, not paint: a drum with sails, a horizontal three-arch span, a nave with a tower, a walls-free frame, a hipped hall on a stair, a narrow vertical, a low walled enclosure, a canopy on four posts. A colour-blind child, and a child looking at a phone in sunlight, both read the town. The gallery's silhouette mode (3.7) is where that is judged, and test (7) forbids two figures sharing a silhouette key.

---

## 7. Testing

### What is unit-testable — and more of it than the brief expected

The brief said "roughly 13 hand-authored SVG figures with no unit test that can judge any of them". That is true of whether something *looks like a chapel*. It is not true of the geometry, the palette or the budget, because this slice moves all three into pure modules. Colocated Vitest, no three import at module load.

**`iso.test.ts`**
1. `ISO_RUN`, `ISO_RISE`, `ISO_LIFT` match the derivation in 3.1 to 1e-12, and `ISO_RUN / ISO_RISE === √3`.
2. `projectGround` round-trips the four footprint corners to a diamond that is horizontally and vertically symmetric about the centre, for w ≠ d as well as w = d.
3. `quadFor` returns values quantised to 1/16 and `viewBoxFor` returns four integers whose aspect equals the quad's aspect exactly.
4. `gableRoof` / `hipRoof` / `flatRoof` return polygons entirely inside the viewBox, with the lit plane's centroid to the left of the shade plane's, for every one of the sixteen figures' dimensions.
5. `spriteAnchorY` places the ground origin exactly on y = 0 for a range of footprints.
6. `riseTransform(size, o, s)` holds the ground origin fixed for s ∈ {0.1, 0.5, 1} — a building grows up out of its plot, never down into it.
7. `paintOrder` orders every pair of keep pieces in every stage correctly (nearer piece last).

**`palette.test.ts`** (slice 5's, extended)
8. Every material's `lit`:`shade` luminance ratio is ≥ 1.35.
9. `separationFromGrass` clears ΔL ≥ 0.18 or Δhue ≥ 25° for every wall, roof and hedge value against `GRASS_COLORS[0..2]`.
10. No two different materials share a `lit` value (the well-versus-rock `#7d7d7d` failure).
11. `KEEP_SKINS` has an entry for all eight `CASTLE_TYPES` ids, and `keepSkin("nonsense")` returns the `keep` skin.

**`silhouettes.test.ts`**
12. `SILHOUETTE_KEYS` — the `(massing, roof, storeys, height-band)` tuple — is unique across all sixteen figures. This is the test that makes the castle-tier-versus-watchtower collision structurally impossible.
13. `silhouetteFor("unknown")` returns the cottage default rather than throwing.
14. Every `SILHOUETTES` entry's footprint is `buildingFootprint(id)` — no second copy of the collider dimensions.

**`world-figures.test.tsx`** (the existing file, rewritten)
15. `assertInside` generalised from the hardcoded `"0 0 64 64"` at line 11 to each figure's own `viewBoxFor(...)`.
16. Every figure's base plate polygon equals `diamondPoints(buildingFootprint(id))` — **the drawing and the collider cannot drift**.
17. Every accent block is ≥ `MIN_ACCENT_SVG` (6) grid units on its shorter side.
18. Every door is ≥ 1.4 × 1.9 world units on the +z face.
19. No figure contains `#24492e` — the deleted fake shadow strip cannot come back.
20. Line 56's `expect(WORLD_SPRITE_SCALE).toEqual({...})` is deleted; slice 2 removed the constant.

**`layout.test.ts`** (existing, updated)
21. Lines 159–165's `spriteSizeFor` assertions are rewritten against `quadFor`; `expect(spriteSizeFor(well)).toEqual({ w: 3.5, h: 3.5 })` becomes the derived quad.
22. Line 17/19's `CASTLE_FOOTPRINTS` assertions become `keepBounds(stage)` assertions.
23. The village invariants from 3.9: no grown footprint intersects a road corridor; every `doorAnchor` is clear; **every solid prop's `unstickHero` exit point is clear of every other collider**.

**`ceremony.test.ts`** (existing, updated) — line 34's loop over `CASTLE_FOOTPRINTS` becomes a loop over the five keep stages, asserting all eight villager marks and the hero mark stay inside the world and clear of colliders at every stage.

### What needs the browser pass

Everything that matters. `assertInside` on a viewBox proves nothing about whether something looks like a chapel.

1. **Per figure**, in `/dev/figures` on the documented port-3100 setup: against real grass, at real display size, in both palettes, with the ruler, with the old figure beside it.
2. **The town row**, all sixteen at true relative scale with the hero, judged as a set. The question is whether the skyline has eight different shapes in it.
3. **Silhouette mode**, all sixteen in flat black at 25%. Anything ambiguous here is redrawn.
4. **Sun check** — a walk of all sixteen with the sun arrow on, confirming no right-hand face is drawn `lit`.
5. **The two views the user photographed**, same framing, before and after. This is the acceptance criterion and there is no substitute for it.
6. **All five keep stages** in the world at the real camera, and a keep-versus-Watchtower shot with both in frame at their real 9.2-unit separation.
7. **A completing building's rise**, watched at full speed and with `reducedMotion` on, confirming it grows out of the plot and does not sink.
8. **First paint measured** cold and warm, at dpr 1 and dpr 2, for a 0/8 kingdom and an 8/8 kingdom, against the ≤ 250 ms budget in 3.8.
9. **A one-piece-missing keep**, forced by clearing a cache entry, confirming the all-or-nothing box.

### The metered clock

This slice adds **no new beat**: no ride, no ceremony, no tutorial step, no fade, no panel. Its entire cost to a child's minutes is first paint, budgeted at **≤ 250 ms added cold, 0 ms warm**, and for a brand-new hero it is *negative* (3.8). No exit path is added or changed, so `clock.flushPending()` on unmount is untouched. Nothing here touches the ledger: Realm minutes still come only from completed side quests and, from slice 8, cleared troubles under their sub-cap, bounded by `dailyCapMinutes`. **No building, door, plot or keep drawn by this slice gates a side quest, blocks a door or stands between a child and their schoolwork**, and test 23's door-anchor clearance is the check that nothing accidentally does.

---

## 8. Interfaces

### Produces

**`src/lib/realm/iso.ts`** — **new, created here.** Slice 5 creates no iso module (its props are authored on slice 2's grids and placed by `props.ts`), so there is no conditional: this slice authors it outright and budgets it as a new module.

```ts
export const ISO_RUN: number;              // 0.7071067811865476
export const ISO_RISE: number;             // 0.4082482904638631
export const ISO_LIFT: number;             // 0.8164965809277260
export const ISO_DIAMOND_RATIO: number;    // 1.7320508075688772 (√3)
export const ISO_AXIS_DEG: number;         // 30
export const FIGURE_GRID: number;          // 16 SVG units per world unit
export const MIN_ACCENT_SVG: number;       // 6
export const DOOR_FACE: "+z";
export const MIN_DOOR: { w: number; h: number };   // { w: 1.4, h: 1.9 } world units

export type Size3 = { w: number; d: number; h: number };
export type SvgPoint = { x: number; y: number };

export function projectGround(p: { x: number; z: number }, y?: number): { sx: number; sy: number };
export function quantise(units: number): number;
export function quadFor(size: Size3, overhang?: number): { w: number; h: number };
export function viewBoxFor(size: Size3, overhang?: number): string;
export function groundOrigin(size: Size3, overhang?: number): SvgPoint;
export function spriteAnchorY(size: Size3, overhang?: number): number;
export function riseTransform(size: Size3, overhang: number, s: number): { scaleY: number; posY: number };
export function paintOrder(p: { x: number; z: number }): number;
export function doorAnchor(position: { x: number; z: number }, size: Size3): { x: number; z: number };

export function diamondPoints(size: Size3, opts?: { origin?: SvgPoint; inset?: number; y?: number }): string;
export function facePoints(face: "+z" | "+x", size: Size3, opts: { origin: SvgPoint; from?: number; to: number }): string;
export function gableRoof(size: Size3, opts: { origin: SvgPoint; eaveY: number; ridgeRise: number; axis: "x" | "z"; overhang?: number }): { lit: string; shade: string; gableNear: string; gableFar: string; ridge: string };
export function hipRoof(size: Size3, opts: { origin: SvgPoint; eaveY: number; ridgeRise: number; overhang?: number }): { lit: string; shade: string; far: string; near: string; ridge: string };
export function flatRoof(size: Size3, opts: { origin: SvgPoint; y: number; parapet: number; overhang?: number }): { top: string; parapetLit: string; parapetShade: string };
```

**`src/lib/realm/palette.ts`** — slice 5's module, **consumed**. This slice declares no palette type and no palette constant; `Shade`, `MaterialName`, `MATERIALS`, `material` and `ACCENT_GOLD` are slice 5's, with their values written there.

```ts
export type Shade = { top: string; lit: string; shade: string; line: string };
export type MaterialName = "stone" | "plaster" | "timber" | "thatch" | "clay-tile"
  | "slate" | "lead" | "brick" | "cloth" | "water" | "leaf" | "earth" | "iron";
export const MATERIALS: Record<MaterialName, Shade>;
export function material(name: MaterialName): Shade;
export const ACCENT_GOLD: string;
export function separationFromGrass(hex: string): { deltaL: number; deltaHueDeg: number };

// NONE OF THESE ARE THIS SLICE'S. keep.ts (slice 10) owns the keep's stages, footprints and skins:
//   KeepStage, KEEP_STAGES, KEEP_STAGE_FOOTPRINTS, KEEP_MAX_FOOTPRINT, KEEP_STAGE_LABELS,
//   keepStageFor, keepFootprintFor, KeepSkinId, KeepSkin, KEEP_SKINS, keepSkinFor, KEEP_ANCHORS.
// KeepSkin's final shape is settled in slice 10 as
//   { id: KeepSkinId; stone: Shade; roof: Shade; trim: string; banner: string; flourish: KeepFlourish }
// — this slice's Shade-based tones with slice 10's flourish retained — so slice 10 authors against
// the final type and nothing is redeclared here. The lookup is keepSkinFor(castleType), not keepSkinFor.
```

**`src/lib/realm/silhouettes.ts`** — new.

```ts
export type Massing = "cottage" | "hall" | "tower" | "span" | "open" | "walled" | "wellhead" | "inn";
export type RoofKind = "gable" | "hip" | "half-hip" | "flat" | "conical" | "pyramid" | "awning" | "none";
export type SilhouetteSpec = {
  id: string;
  massing: Massing;
  roof: RoofKind;
  roofMaterial: MaterialName;
  wallMaterial: MaterialName;
  accent: MaterialName | typeof ACCENT_GOLD;   // never a hex literal; see the table below
  storeys: number;
  overhang: number;      // world units per side
  doorWidth: number;     // world units on the +z face
};
export const SILHOUETTES: Record<string, SilhouetteSpec>;   // 8 buildings + "tavern"
export function silhouetteFor(id: string): SilhouetteSpec;  // unknown → the cottage default
export function silhouetteKey(id: string): string;          // `${massing}:${roof}:${storeys}:${band}`
export function quadForBuilding(id: string): { w: number; h: number };
```

**`SILHOUETTES` in full.** `accent` and `doorWidth` were described in prose in an earlier draft and are tabulated here, because an accent colour chosen at authoring time is exactly the way nine figures come to invent nine palettes. Every `accent` is a `MaterialName` or `ACCENT_GOLD` from `palette.ts` — **never a hex literal**, which `palette.test.ts`'s figure-module grep enforces. `overhang` is world units per side; `doorWidth` is world units on the door face and may never fall below `MIN_DOOR` (1.4).

| id | massing | roof | roofMaterial | wallMaterial | accent | storeys | overhang | doorWidth |
|---|---|---|---|---|---|---|---|---|
| `well` | `wellhead` | `conical` | `thatch` | `stone` | `ACCENT_GOLD` (the bucket's iron band, gilded) | 1 | 0.25 | 1.4 |
| `mill` | `tower` | `conical` | `slate` | `plaster` | `material("timber").lit` (the sail frames and the shaft) | 2 | 0.30 | 1.4 |
| `bridge` | `span` | `none` | — | `cutStone` | `material("cutStone").lit` (the parapet coping) | 1 | 0.20 | — (no door; the deck is the way through) |
| `chapel` | `hall` | `gable` | `slate` | `cutStone` | `material("glass").lit` (three lancet windows, warm amber, each 6 × 16 grid units) | 1 | 0.40 | 1.6 |
| `market` | `open` | `awning` | `canvas` | `timber` | `material("brass").lit` (the scale pan over the centre stall) | 1 | 0.50 | 2.0 |
| `library` | `hall` | `hip` | `tile` | `plaster` | `ACCENT_GOLD` (the rose window over the door) | 2 | 0.40 | 1.6 |
| `watchtower` | `tower` | `pyramid` | `lead` | `stone` | `material("glass").lit` (the lit lantern room at the top) | 3 | 0.20 | 1.4 |
| `garden` | `walled` | `none` | — | `cutStone` | `material("timber").lit` (the arbour frame and the gate) | 1 | 0.20 | 1.6 |
| `tavern` | `inn` | `half-hip` | `tile` | `plaster` | `material("glass").lit` (five warm windows — the largest gold mass outside the keep) | 2 | 0.50 | 1.6 |

`accent` is typed `MaterialName | typeof ACCENT_GOLD` rather than `string`, so an inline hex is a compile error rather than a test failure. `MIN_ACCENT_SVG` (the minimum accent area, in grid units squared) is asserted per figure: the audit's finding was that gold windows at 4–6 units on a 64-unit figure land at 8–9 screen px, smaller than the chrome competing with them, and the floor is set so every accent is at least 18 screen px on its long axis at `CAMERA_ZOOM` 64.

**`src/lib/realm/keep-pieces.ts`** — new.

```ts
export const KEEP_PIECES = ["wall-x", "wall-z", "tower", "gate", "donjon", "hall", "scaffold"] as const;
export type KeepPieceId = (typeof KEEP_PIECES)[number];
export const KEEP_PIECE_SIZE: Record<KeepPieceId, Size3>;
export const KEEP_PIECE_OVERHANG: Record<KeepPieceId, number>;
export type KeepPiece = { piece: KeepPieceId; offset: { x: number; z: number }; order: number };
export function keepPieces(stage: KeepStage): KeepPiece[];   // ordered by paintOrder
export function keepBounds(stage: KeepStage): Size3;         // the castle prop's footprint
export function keepPieceKeys(stage: KeepStage, skin: KeepSkinId): string[];  // cache keys for wave one
```

**Figure components** — `src/components/realm/world-figures.tsx` (rewritten) and `src/components/realm/keep-figures.tsx` (**rewritten; created in slice 10**, which shipped `KeepFigure({ stage, skin })` on a 96 viewBox). This slice replaces the five monolithic silhouettes with the seven-piece kit and `KeepPieceFigure`; `KeepFigure` becomes a thin arranger over `keepPieces(stage)`. That duplication is deliberate and is priced in the roadmap: slice 10 needs a keep that is not a tent before this slice exists, and this slice needs a kit before eight skins are affordable.

```ts
export function BuildingFigure({ id }: { id: string }): JSX.Element;               // data-figure="building" data-figure-id={id}
export function TavernFigure(): JSX.Element;   // data-figure="landmark" data-figure-id="tavern" — UNCHANGED from slice 6
export function KeepPieceFigure({ piece, skin }: { piece: KeepPieceId; skin: KeepSkin }): JSX.Element;
                                                                                   // data-figure="keep" data-figure-id={`${piece}:${skin.id}`}
```

`CastleFigure` and `CASTLE_TIERS` were **deleted in slice 10** and are not re-listed here. `world-figures-legacy.tsx` holds the pre-redraw figures for the gallery only and is deleted in this slice's final commit.

**Texture cache keys** — `building:${id}` unchanged; **`landmark:tavern` unchanged** (redrawn, not re-keyed — slice 6 owns that key and this slice must not publish `building:tavern`); slice 10's `keep:{stage}:{skinId}` is replaced by `keep:{piece}:{skinId}`. `castle:${castleType}` was already deleted **by slice 10** and is not this slice's to delete.

**Changed signatures elsewhere**

```ts
// src/lib/realm/layout.ts
export function spriteSizeFor(prop: Prop): { w: number; h: number };   // now derived via quadFor
// BUILDING_COLORS is NOT republished: slice 5 deleted it from layout.ts and the box fallback
// calls buildingColor(id, palette) from palette.ts. One source for a building's colour.
export function spriteAnchorFor(prop: Prop): number;                   // new; wraps spriteAnchorY

// src/components/realm/sprite-source.tsx
// The FULL accumulated SpriteSource surface, diffed against slices 2 and 5 — nothing is dropped:
onReady: (textures: SpriteTextures, stats: { ms; entries; texels; fromCache }) => void;  // slice 2's
                                               // second argument RETAINED; now called TWICE
onVillageReady?: (t: { props; signs }) => void;  // slice 5's — RETAINED
dpr: DprBucket;                                 // slice 2's — RETAINED
world?: { castleType: string; palette: PaletteVariant; keepStage: KeepStage; keepSkin: KeepSkinId };
// `decor` is NOT reinstated: slice 5 deleted the flag and replaced it with `palette`.
world?: { keepStage: KeepStage; keepSkin: KeepSkinId; built: string[]; decor: boolean } | null;
```

**Constraints this slice publishes to other slices**

- `DOOR_FACE = "+z"`: every spur, threshold and fast-travel arrival point lands at `doorAnchor(slot, footprint)`.
- The bridge figure spans **slice 4's 6-unit channel** (x ∈ (−3, 3)) end to end, abutments included, from `buildingFootprint("bridge")` = 6 × 5 × 2.5. **This slice publishes no constraint on slice 4's water**; it reads slice 4's geometry, which is the right direction for the dependency to run.
- `keepBounds(stage)` is **defined as `keepFootprintFor(stage)`** from slice 10's `keep.ts` — an alias for the kit's convenience, never a rival source. The keep's footprint has exactly one owner, and it is `keep.ts`. The ceremony plaza, the road terminus, the paving and the lap ring all derive from it, and `ceremonyMarks` measures its clearance from **`KEEP_MAX_FOOTPRINT`** (slice 10's ruling) so a keep growing mid-ceremony can never strand the hero inside it.
- `paintOrder(p)` is the world's isometric draw-order key; any slice that stacks overlapping sprites uses it.

### Consumes

From **slice 2 `sprite-budget-and-gallery`** — `rasterScaleFor(quad: { w: number; h: number }, dpr: DprBucket): number` (the integer texel:device-pixel scale, replacing the deleted `WORLD_SPRITE_SCALE`), `textureSize`, `figureSize`, `baseAnchor`, `registerFigures` and `FIGURE_CATALOG` (**every figure this slice draws is a catalog row**, and `quadFor` becomes the catalog's `grid`→box derivation rather than a parallel path), the parallelised rasterisation and warm cache in `sprite-source.tsx` / `sprite-texture.ts`, `BUILDING_HEIGHTS`, and the `/dev/figures` route. Footprints come from **slice 4's** `buildingFootprint(id)` in `village.ts`, not from slice 2.

From **slice 10 `plots-signs-and-the-keep`** — the whole of `src/lib/realm/keep.ts`: `type KeepStage`, `KEEP_STAGES`, `KEEP_STAGE_FOOTPRINTS`, `KEEP_MAX_FOOTPRINT`, `KEEP_STAGE_LABELS`, `keepStageFor(buildingsComplete)`, `keepFootprintFor(stage)`, `type KeepSkinId`, `type KeepSkin`, `KEEP_SKINS`, **`keepSkinFor(castleType)`** — an earlier draft of this spec called it `castleSkinFor`, which slice 10 does not export and `KEEP_ANCHORS`. Also the in-world signboards that replaced the nine DOM label pills, and `signFootprints()` as a spawn exclusion.

**Slice 10 does not retire the cosmetic watchtower tier**, and this slice must not say it does: decision 4 preserves every `CASTLE_TYPES` tier, every level gate and every unlock **as a skin**, so that no child loses what they were saving toward. `KEEP_SKINS.watchtower` is one of the eight liveries and it is applied to whatever *stage* the child's kingdom has reached. What went away is the tier driving the *silhouette*; the tier itself is intact.

From **slice 5 `village-life`** — `src/lib/realm/palette.ts` (there is no `palette.ts`): `Shade`, `MaterialName`, `MATERIALS`, `material`, `ACCENT_GOLD`, `buildingColor`, `ENVIRONMENT_COLORS`, `paletteFor`, and `pixel-font.ts` if a figure ever carries a word. Plus the prop set this redraw sits beside, whose anchoring this slice migrates (§3.2).

From **slice 4 `village-ground`** — `ROAD_QUADS` and `roadCorridorContains(p, margin?)`, `BUILDING_SLOTS`, `BUILDING_FOOTPRINTS` and `buildingFootprint(id)` (**the one footprint table**), `WATER_BANDS` (the bridge spans its real channel), `KEEP_PRECINCT`, and `CAMERA_ZOOM = 64` with the re-derived catalog from slice 4 §3.9. `SPAWN_ZONES` from `src/lib/realm/open-ground.ts`. There is no `roadCorridors()`, no `VillagePlan` and no `village/` directory.

From **slice 1 `first-impression`** — the contact-shadow decal (this slice's figures draw no shadow of their own) and `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts`, which section 6.1 deliberately does not call.

From **slice 6 `doors-and-the-tavern`** — the Tavern's slot, footprint and threshold.

*If slice 2, 5 or 10 named any of these differently, this slice's implementation plan adopts their names. The shapes are what is fixed here.*

---

## 9. Out of scope

- **Village props and district signage.** Authored in the correct direction in slice 5, after the pixel budget was fixed, so they are not redrawn. Scope reduced from the brief on exactly this point.
- **The six decorations** (oak, pine, bush, rock, fence, lantern). Slice 2 set their scale and slice 5 reauthored them; they are in the gallery for comparison and are not touched. If the town row shows them fighting the new buildings, that is a slice 5 follow-up, not a re-scoping of this one.
- **The trouble figures.** Slice 8 gave them outlines, ground shadows and a reserved violet key. Untouched.
- **The hero, companion, mount and villager figures.** They are 36 × 48 avatar figures on a different grid with a different pipeline (`SPRITE_SCALE`, `spriteKey`), and they are people rather than architecture. A hero redraw is not in the programme at all, and this slice does not start one.
- **The ground, the grass tile, the cobble and the plot dirt.** Slice 2 owns the tile sampling and the flower palette; slice 10 owns the plot's ochre and its rope-and-stake border.
- **Signboards, plaques and the "Raised by Emma · Spring 2026" stamp.** The signboard is slice 10's, and **slice 10's `SignModel.line3` is the one home for attribution** — a reserved, sized, positioned row on a board a child already reads, filled by slice 13. This slice therefore **reserves no wall panel and draws nothing for it**, and `BuildingFigure` takes **no attribution parameter**: `BuildingFigure({ id }: { id: string })` is the whole signature.

  An earlier draft reserved a 1.2 × 0.8 panel on each building's lit wall *and* slice 10 reserved line 3, which would have been two homes for one sentence and one of them unclaimed. One home, on the board, where the building's name and progress already are.

  What slice 13 does still get from this slice is the two figures that carry *what a child actually did* rather than who did it: the **Well's plaque** and the **Library's filled shelf**. Both are drawn here as **a second registered catalog row** — `building:well-plaque` and `building:library-full` — selected by `figureKeyFor(prop)` from `SiteProgress.complete`, rather than as a boolean parameter on `BuildingFigure`. That keeps the component signature clean, keeps both variants in `/dev/figures`, and counts both against the raster budget. Slice 13 consumes them by name and needs no change to this file.
- **Animation of any kind** — turning sails, chimney smoke, water motion, flickering lanterns, swaying trees. There is no slice for it in the programme. If it is wanted, it is a new slice after 13, and section 6.2's reducedMotion rule (every motion cue needs a non-motion substitute) applies to it from the first line.
- **Building interiors.** All eight remain solid colliders. Slice 6 made specific doors *navigate*; nothing in this programme makes a building enterable.
- **Day/night, weather and lighting change.** `spriteMaterial` ignores the scene's lights and this slice deliberately keeps it that way (D2). A time-of-day system would mean a second baked set of every figure, and it is not in the programme.
- **Reducing the citadel's pixel bill below the 3.8 budget.** If the 8/8 measurement exceeds 250 ms, the stated lever is to shorten the citadel's pieces, and that adjustment happens inside this slice's browser pass. Lowering texel density for one figure is ruled out permanently, not deferred.
