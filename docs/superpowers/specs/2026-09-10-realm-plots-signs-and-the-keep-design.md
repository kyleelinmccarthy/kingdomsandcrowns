# Plots you can read, signs you can read, and a keep that is not a tent

**Date:** 2026-09-10
**Status:** Design spec. Written up front under decision 1; the implementation plan is written at build time.
**Programme:** *The Realm: Presentation Overhaul* (`docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`), slice **10 of 13**, effort **large**.
**Depends on:** `sprite-budget-and-gallery` (2) — nothing here is drawn before the raster scale is derived and the gallery exists to judge it in; `village-ground` (4) — the keep precinct, the road corridors and the district table; `village-life` (5) — `palette.ts`; `first-impression` (1) — `depth.ts`, the objective `focus` flag, the centred message lane.
**Feeds:** `building-redraw` (11) redraws what this slice stands up; `record-of-the-work` (13) fills the sign's third row; `troubles-that-read-and-pay` (8) spawns against the anchors this slice makes permanent; `recess-that-counts` (12) laps around the precinct this slice fixes the size of.
**Decisions applied:** D2 (full village), D4 (the castle), D9 (attribution).

---

## 1. Why — the complaints and the findings, quoted

The user's verdict, verbatim, in the three places it lands on this slice:

> the castle looks like a TeePee

> should be WAY more development in the world

> no quest log or tracking

> the world still looks pretty rough

Four audit findings from Appendix A own this slice.

**"the castle looks like a TeePee"** — *blocking, medium effort*:

> Two problems, and the second is worse. (1) CastleFigure's default branch is literally a tent: two triangles plus a campfire, and it is the default so any unknown tier also draws a tent. Its footprint is {w:2,d:2,h:1.5}, and spriteSizeFor gives 3x3 units = 120x120 CSS px — 1.5x the hero's 2-unit height. The centrepiece of a game called Kingdoms & Crowns is a 120-px teepee. (2) The tier is not driven by the Realm at all: getRealmBundle reads castleRows[0]?.type ?? "campsite", and CASTLE_TYPES gates campsite at levelRequired 50 and cottage at 55. So a child below level 50 has no castle row and gets "campsite"; a child at 50-54 gets "campsite" too. The tent is the view from level 1 to level 55. And building all eight kingdom buildings — the entire loop the Realm is about — changes the castle by zero pixels, because the tier comes from the /castle cosmetic page, not from kingdom progress. The layout.ts comment "tent-sized to towering" shows this was deliberate; it is the design error.
>
> *Where:* `src/components/realm/world-figures.tsx:170-180, src/lib/realm/layout.ts:34-44, src/lib/utils/avatar-catalog.ts:535-536, src/lib/actions/realm.ts:96`

Verified in the tree at head `d880906`: `CastleFigure`'s `default:` branch (world-figures.tsx:170-180) is `<polygon points="8,56 32,20 56,56">` plus a campfire; `CASTLE_FOOTPRINTS.campsite` is `{ w: 2, d: 2, h: 1.5 }` (layout.ts:36); `CASTLE_TYPES[0]` is `{ id: "campsite", levelRequired: 50 }` (avatar-catalog.ts:535); `castleType: castleRows[0]?.type ?? "campsite"` (actions/realm.ts:96). Nothing in `buildWorldLayout` reads `input.buildings` when sizing or choosing the castle.

**"the screenshots show flat dark diamonds where sites should be"** — *blocking, medium effort*:

> An unbuilt site is not a sprite at all: it is a planeGeometry rotated -PI/2, lying flat on the ground at y=0.04 with the foundation texture, sized prop.size.w x prop.size.d. Under the 35.26-degree camera an axis-aligned 3x3 ground square projects to a rhombus — literally a diamond. Colour separation is near zero: the figure paints #6b665a and #7a7464 against grass #2e5a3a/#33633f — both dark, both desaturated, no hue contrast; the calm palette makes it worse by darkening it to CALM_FOUNDATION #5a5750. The drawing wastes most of its canvas: the dirt only covers y 20..56 of the 64 viewBox, so on a 3x3 plane the visible patch is ~2.6 x 1.7 units, smaller than the footprint. The "sign" (a plaster rect at y 8..16 with a post) is painted flat into the ground and seen from above, so it is a pale smudge in the grass, not a sign. There is nothing vertical, nothing gold, nothing with a silhouette. Seven of the eight sites are in this state for a new player, so seven of the eight things in the world are invisible dirt patches whose only affordance is an 11-px black DOM pill floating 0.8 units up.
>
> *Where:* `src/components/realm/realm-scene.tsx:275-290, src/components/realm/world-figures.tsx:315-328, src/lib/realm/layout.ts:73, src/app/globals.css:1718-1719`

**"what a player's eye is drawn to"** — *major, medium effort*:

> The highest-contrast objects in the frame are UI chrome, not the world. Nine .realm-label pills (eight sites plus the castle) render as DOM <Html> at a fixed 11 px, pure white on rgba(0,0,0,0.55), each with a gold 10-px tag underneath. Against a mid-dark green field with unlit, desaturated props, black-and-white pills win every time — in the screenshots they ARE the composition. They do not scale, do not depth-sort against geometry (drei <Html> with zIndexRange but no occlude), so a label for a prop behind the castle draws straight through it.
>
> *Where:* `src/components/realm/realm-scene.tsx:60-69, src/components/realm/realm-scene.tsx:287, src/components/realm/realm-scene.tsx:311, src/app/globals.css:1718-1719`

**"silhouette readability"** — *major, medium effort*, the half that belongs here:

> CastleFigure's "watchtower" tier (a stone tower with merlons, a gold window and a wood door) is near-identical to BuildingFigure's "watchtower" (a stone tower with merlons, a gold window and a wood door). At level 60-64 the player's castle is a stone tower standing 9.2 units from an identical stone tower labelled "Watchtower" — the two are told apart only by the DOM label.
>
> *Where:* `src/components/realm/world-figures.tsx:67-78, src/components/realm/world-figures.tsx:278-288`

And from **"Not complained about yet, but will be"**:

> Building the entire kingdom changes the castle by zero pixels.
> The child will see a teepee from level 1 to level 55.
> Low-stimulus mode makes the world EMPTIER, not calmer.
> Any progressive world change tied to kingdom progress other than a building appearing — [missing entirely]. The castle, ground, roads and decoration are identical at 0 buildings and at 8.

That last line is the whole slice in one sentence. A child does five hours of maths, and the world is pixel-identical. This slice makes the landscape the record.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D10.1 | What drives the keep's silhouette? | `keepStageFor(buildingsComplete)` — five stages, changing at 1, 3, 5 and 8 buildings. Never a tent at any stage. |
| D10.2 | What happens to `CASTLE_TYPES`? | It becomes a **skin**: palette + banner trim + one flourish. Same eight ids, same eight `levelRequired` values, nothing withdrawn. 5 silhouettes × 8 palettes, **not** 40 figures. |
| D10.3 | Where do the footprints live? | `CASTLE_FOOTPRINTS` (layout.ts:35-44) is deleted; `KEEP_STAGE_FOOTPRINTS` in the new `keep.ts` replaces it, keyed by stage. The eight-key map survives as `KEEP_SKINS`, carrying colour rather than size. **`keep.ts` is the sole owner of the keep's stages, footprints and skins for the life of the programme** — slice 11 imports `KeepStage`, `KEEP_STAGES`, `KEEP_STAGE_FOOTPRINTS`, `KEEP_MAX_FOOTPRINT`, `keepStageFor`, `keepFootprintFor`, `KeepSkinId`, `KeepSkin`, `KEEP_SKINS` and `keepSkinFor`, and adds only the piece kit. |
| D10.4 | How many drawn plot states? | Four unbuilt (`marked`, `timber`, `stone`, `framed`) plus the raised building = five states per site, chosen by `plotStageFor(done, total)`. |
| D10.5 | Count-driven or fraction-driven plot stages? | Fraction-driven, with `done === total - 1` pinned to `framed`. Slice 13 changes `deedsToBuild` per building; a count table would have to be rewritten then. This one survives. |
| D10.6 | What replaces the nine DOM pills? | Nine in-world signboards — eight sites and one at the keep. `PropLabel`, `Prop.tag`, `.realm-label` and `.realm-label-tag` are all deleted. |
| D10.7 | Are all nine signs legible all the time? | No. `signDetailFor(distance, isFocus, fewerChoices)` gives `board` / `name` / `full`. At most the two or three nearest signs plus the objective site read in full. This is what stops the signs becoming the pills again. |
| D10.8 | Where does the sign's text come from? | Baked into the texture — board+name is one composite per site (nine, fixed forever), line 2 is a second small quad keyed by its content, line 3 is a reserved empty quad. No `<Html>`, no DOM font. |
| D10.9 | What fills line 3? | Nothing, this slice. The row's height is reserved so slice 13 can fill it without redrawing the board or changing the silhouette. |
| D10.10 | Do plots or signs become colliders? | No. Only the keep is solid. This is the whole answer to "a denser world wedges the hero". |
| D10.11 | How is a bigger keep kept off the road? | Slice 4 publishes **`KEEP_PRECINCT: Rect`** = `{ minX: -8, maxX: 8, minZ: -30, maxZ: -19.25 }` and `KEEP_APPROACH_CLEAR_Z` = −19.25, and already asserts that no road quad, plaza, spawn zone or prop intersects it. This slice's job is to stay inside it: a test grows every stage by `HERO_RADIUS` and asserts containment in `KEEP_PRECINCT` and no intersection with any `ROAD_QUAD` via `roadCorridorContains`. The keep's collider is extended north to the wall at every stage (slice 4 §3.5), so there is no walkable strip behind it to wedge in. |
| D10.12 | What happens to `ceremonyMarks`? | It measures clearance from `KEEP_MAX_FOOTPRINT.d`, not the current stage's, so marks are stage-independent and a keep that grows mid-ceremony can never strand the hero inside it. |
| D10.13 | Does the keep re-rasterise as it grows? | No. Stage `n` and stage `n+1` are rasterised eagerly; stages 0-4 are backfilled after first paint. A stage only ever rises by one step, so the next one is always warm. |
| D10.14 | What does a child who chose "citadel" see at 0 buildings? | A **stage-0 keep in citadel colours** — gold trim, a weathervane, scaffolding. Not a citadel. Once, on the next visit, the Realm says so. |
| D10.15 | Does the /castle page lose anything? | No. Every tier, every level gate, every unlock stays. The page is recopied to "Choose your castle's colours" and gains a line saying where the size comes from. |
| D10.16 | Simple depth vs full depth on a sign | Simple: a pip row. Full: `Scholars' Row · 3 of 5`. Substitution, never removal — both say the same thing. |

---

## 3. Design

### 3.1 The keep

#### Stages

```ts
// src/lib/realm/keep.ts
export type KeepStage = 0 | 1 | 2 | 3 | 4;
export type KeepFootprint = { w: number; d: number; h: number };

export const KEEP_STAGES: readonly KeepStage[];                       // [0,1,2,3,4]
export const KEEP_STAGE_FOOTPRINTS: Record<KeepStage, KeepFootprint>;
export const KEEP_MAX_FOOTPRINT: KeepFootprint;                       // === KEEP_STAGE_FOOTPRINTS[4]
export const KEEP_STAGE_LABELS: Record<KeepStage, string>;            // child-facing, never the word "stage"

export function keepStageFor(buildingsComplete: number): KeepStage;
export function keepFootprintFor(stage: KeepStage): KeepFootprint;
export function keepStagesToRasterise(stage: KeepStage): KeepStage[];
export function keepGrewNotice(from: KeepStage, to: KeepStage): string | null;
export function keepGrewSpeech(from: KeepStage, to: KeepStage): string | null;
export function keepProgressLine(buildingsComplete: number): string;
```

`keepStageFor` clamps to `[0, 8]` and maps: `0 → 0`, `1-2 → 1`, `3-4 → 2`, `5-7 → 3`, `8 → 4`. Non-finite or negative input returns `0`; anything above 8 returns `4`. Four visible changes across a kingdom, at the 1st, 3rd, 5th and 8th building.

| Stage | Silhouette | Footprint `w × d × h` | `KEEP_STAGE_LABELS` |
|---|---|---|---|
| 0 | A square stone keep in scaffolding, one banner pole on the roof, a timber hoarding at the base. **A building, not a tent.** | 6 × 5 × 5 | `Stone and scaffolding` |
| 1 | Scaffolding struck; a low curtain wall runs around the keep, merlons along the top. | 8 × 6 × 6 | `Stone walls` |
| 2 | The wall gains a gatehouse on the south face with an arch and a raised portcullis. | 9 × 7 × 7 | `Walls and a gatehouse` |
| 3 | Two corner towers rise above the wall; the keep gains a storey and a pitched roof. | 11 × 8 × 9 | `Walls, a gatehouse and towers` |
| 4 | Four towers, a great hall roof above the wall line, the banner ring complete. | 12 × 9 × 11 | `A citadel` |

`spriteSizeFor` keeps its `castle` case (`{ w: size.w + 1, h: size.h + 1.5 }`), so the citadel billboard is 13 × 12.5 units — the largest canvas in the game. Section 3.6 costs it.

#### Skins

```ts
export type KeepSkinId = "campsite" | "cottage" | "watchtower" | "keep" | "manor" | "castle" | "fortress" | "citadel";
export type KeepFlourish = "awning" | "thatch" | "brazier" | "portcullis" | "rose-window" | "pennants" | "barbican" | "weathervane";
// `Shade` is slice 5's, from palette.ts: { lit, mid, shade } under the one baked upper-left sun.
// Using it here rather than two flat hex strings is what lets slice 11 arrange the same skin
// across a seven-piece kit without re-deriving a third and a fourth tone per material.
// THIS IS THE FINAL SHAPE. Slice 11 imports it and declares no KeepSkin of its own.
export type KeepSkin = { id: KeepSkinId; stone: Shade; roof: Shade; trim: string; banner: string; flourish: KeepFlourish };

export const KEEP_SKINS: Record<KeepSkinId, KeepSkin>;
export function keepSkinFor(castleType: string | null | undefined): KeepSkin;   // unknown/absent → KEEP_SKINS.campsite
```

| Skin | `stone` | `stoneDark` | `roof` | `trim` | Flourish |
|---|---|---|---|---|---|
| campsite | `#9a9aa8` | `#6f6f7c` | `#7b3f3f` | `#c9b27a` | `awning` — a canvas awning over the gate |
| cottage | `#c4b49a` | `#95866f` | `#8a5a3a` | `#d8cfc0` | `thatch` — a thatched porch over the door |
| watchtower | `#8f939a` | `#63666d` | `#5a5f66` | `#a8b0bb` | `brazier` — a lit beacon on the tallest tower |
| keep | `#8e8c86` | `#605e59` | `#5a2d2d` | `#6b4226` | `portcullis` — an iron grille in the gate arch |
| manor | `#d6cbb4` | `#a89a80` | `#6d4f6d` | `#e8dfc8` | `rose-window` — a round window on the south face |
| castle | `#a3a6b4` | `#71748a` | `#7b3f3f` | `#fde68a` | `pennants` — twin pennants on the gate towers |
| fortress | `#7d8189` | `#54575e` | `#4a2b2b` | `#8c7a6b` | `barbican` — a spiked barbican before the gate |
| citadel | `#b7b3c6` | `#7f7b92` | `#5b3a6b` | `#fde68a` | `weathervane` — a gold weathervane on the highest roof |

**The combinatorial trap, and the escape.** Eight skins × five stages is 40 pictures if each is drawn. It is 13 if it is not. `KeepFigure` takes `{ stage, skin }`; the five silhouettes are authored once each with every fill supplied from the skin (no inline hex anywhere in the keep figures), and each of the eight flourishes is authored once and drawn relative to a single per-stage anchor:

```ts
export type KeepAnchor = { gateX: number; gateY: number; peakX: number; peakY: number }; // 96-unit viewBox coords
export const KEEP_ANCHORS: Record<KeepStage, KeepAnchor>;
```

Five silhouettes + eight flourishes + five anchor rows = 13 authored pieces and one lookup. A reviewer should reject any change that adds a `switch (skin)` inside a silhouette body.

The keep figures live in a new `src/components/realm/keep-figures.tsx` on a **96 × 96** viewBox — not the world's 64 — because a 12-unit citadel next to a 3-unit cottage on the same grid is the reason the current tiers all look like the same box at different scales. `CastleFigure` and `CASTLE_TIERS` are deleted from `world-figures.tsx`; the audit confirms `CastleFigure` is imported only by `sprite-source.tsx` and `world-figures.test.tsx`, and `/castle` renders `GameIcon`/`CASTLE_ICONS`, not these SVGs.

#### Where the keep stands

`CASTLE_POSITION` is `village-ground`'s — **(0, −24.5)**, half a unit north of the obvious −24 precisely to buy the grown 12 × 9 citadel 0.8 units of clearance from the North Way's corridor. This slice fixes the *size* and publishes it. Two invariants that `village-ground` has already built and this slice tests from its own side:

1. **The precinct.** Slice 4 ships `KEEP_PRECINCT: Rect` — `{ minX: -8, maxX: 8, minZ: -30, maxZ: -19.25 }` around `CASTLE_POSITION` (0, −24.5) — and tests that nothing else is inside it. This slice asserts the other direction: **every** stage's footprint grown by `HERO_RADIUS` is *contained* in `KEEP_PRECINCT`, and no stage's grown south face crosses `KEEP_APPROACH_CLEAR_Z` (−19.25). At stage 4 the grown south face is −19.55, clearing by 0.3 and clearing the North Way's corridor by 0.8. **Slice 4 has already built this; this slice does not place an obligation on it.**
2. **No pinch behind it.** The gap between the keep's north face grown by `HERO_RADIUS` and the world clamp (`WORLD_SIZE / 2 - HERO_RADIUS`, movement.ts:17) must be either ≥ 2 units of walkable ground or closed by a barrier prop, so a hero can never be pinned in a strip they cannot turn around in. On today's 40-unit world with the keep at `z = -14` that gap is 0.6 units; on the 64-unit village it is comfortable, and the test states the number rather than trusting it.

Banner poles already derive from the castle footprint (layout.ts:141-146), so they hug the keep as it grows with no code change. A hero with eight season banners at stage 0 has them at ±3.6 / ±3.1 units instead of today's ±(w/2 + 0.6) for their cosmetic tier. No data changes; the poles simply follow the wall.

### 3.2 Plots

```ts
// src/lib/realm/plot.ts
export type PlotStage = "marked" | "timber" | "stone" | "framed";
export const PLOT_STAGES: readonly PlotStage[];
export const PLOT_SPRITE_H: Record<PlotStage, number>;      // billboard height in world units
export function plotStageFor(done: number, total: number): PlotStage;
export function plotStageNotice(stage: PlotStage, buildingLabel: string): string | null;
export function plotStageSpeech(stage: PlotStage, buildingLabel: string): string | null;
```

```
plotStageFor(done, total):
  d = clamp(done, 0, max(total, 0))
  if d <= 0                 -> "marked"
  if total > 0 && d >= total - 1 -> "framed"
  if total > 0 && d / total >= 0.5 -> "stone"
  -> "timber"
```

For today's `total = 5`: `0 → marked`, `1 → timber`, `2 → timber`, `3 → stone`, `4 → framed`. For slice 13's two-side-quest buildings: `0 → marked`, `1 → framed`. For a three: `0 → marked`, `1 → timber`, `2 → framed`. The `total - 1` pin is deliberate: **"one more and it rises" is always its own picture**, at every total, which is the single most motivating state a plot can be in.

| Stage | Drawn | `PLOT_SPRITE_H` |
|---|---|---|
| `marked` | Four corner stakes with rope strung between them; a coil of rope and a mallet on the dirt. | 0.9 |
| `timber` | The rope stays; a stack of squared timber and two sawhorses stand on the south half of the plot. | 1.3 |
| `stone` | A knee-high course of dressed stone runs the footprint's outline; a mortar tub and a barrow stand inside it. | 1.6 |
| `framed` | A timber frame with rafters and a half-laid roof, wrapped in scaffold poles with a ladder against it. | 2.6 |

The flat dirt quad stays as the base (realm-scene.tsx:279-286) — it is what makes the plot read as *marked ground* — and the standing content is a billboard above it, anchored at the ground point. Figures live in a new `src/components/realm/plot-figures.tsx`; `PlotFigure({ stage })` on the world's 64 viewBox, registered as four `FIGURE_CATALOG` rows (`plot:marked`, `plot:timber`, `plot:stone`, `plot:framed`). **`FoundationFigure` was deleted in slice 2**, which replaced the stretched figure with a tiled ochre dirt texture; this slice stands content *on* that dirt and must not re-list slice 2's deletion. `PlotFigure` is a new thing, not a rename.

**Plots are not solid.** `Prop.solid` stays `false` for foundations (layout.ts:161). A child can walk across their own building site; a scaffold you can walk through is a smaller fiction than a hero wedged behind one. This is the answer to objection (b) for everything in this slice except the keep.

**The dirt.** `FOUNDATION_COLOR` (`#6b665a`, layout.ts:73) and the figure's `#6b665a`/`#7a7464` (world-figures.tsx:318-319) are replaced by tokens this slice requires `palette.ts` (slice 5) to carry:

```ts
plotDirt:      "#8a7a55"   // warm ochre; grass is #2e5a3a, hue 135° vs 45°
plotDirtLight: "#a2915f"
plotDirtCalm:  "#7a715c"   // low-stimulus: muted, still warmer than grass, LIGHTER than today's #5a5750
plotRope:      "#d8c9a0"
plotTimber:    "#8a6a42"
plotStone:     "#9a9aa8"
```

`CALM_FOUNDATION = "#5a5750"` (realm-scene.tsx:53) and the `colorFor` special case (realm-scene.tsx:232) are deleted. Low stimulus currently *darkens* the one thing a child most needs to find; it will mute it instead.

### 3.3 Signs

Nine boards replace nine pills, one for one.

```ts
// src/lib/realm/sign.ts — the per-BUILDING signboards.
// Distinct from slice 5's signage.ts, which carves the per-DISTRICT markers and exports
// DISTRICT_SIGN_SIZE / DISTRICT_SIGN_VIEWBOX. Two objects, two modules, two prefixes —
// and one shared pixel font, so a child sees one typeface in the world.
export type SignDetail = "board" | "name" | "full";
export type SignLine2 =
  | { kind: "pips"; filled: number; total: number }
  | { kind: "text"; text: string };
export type Rect = { x: number; z: number; w: number; d: number };

export type SignModel = {
  id: string;              // "sign:well" … "sign:keep"
  siteId: string;          // "well" … or "keep"
  position: Vec2;
  line1: string;
  line2: SignLine2;
  line3: string | null;    // always null in this slice; slice 13 fills it
  footprint: Rect;
};

export type SignInput = {
  buildings: SiteProgress[];
  buildingsComplete: number;
  districtFor: (siteId: string) => string | null;
  numerals: boolean;       // depth axis: false → pips, true → text
  focusId: string | null;  // slice 1's objective site
};

export const SIGN_SIZE: { w: number; h: number };          // { w: 3.4, h: 2.4 }
export const SIGN_ROWS: { line1: number; line2: number; line3: number };  // 0.78, 0.50, 0.24 as fractions of h
export const SIGN_MAX_CHARS: { line1: number; line2: number; line3: number }; // 16, 24, 28
export const SIGN_NEAR: number;    // 6
export const SIGN_FAR: number;     // 14
export const SIGN_PIP_MAX: number; // 8

export function signModelsFor(input: SignInput): SignModel[];
export function signPositionFor(slot: Vec2, footprint: { w: number; d: number }): Vec2;
export function signDetailFor(distance: number, isFocus: boolean, fewerChoices: boolean): SignDetail;
export function signWorldScale(largerText: boolean): number;   // 1 | 1.25
export function signFootprints(models: SignModel[]): Rect[];
export function signAnchors(models: SignModel[]): { id: string; siteId: string; position: Vec2 }[];
export function signLine2Key(line2: SignLine2): string;
export function truncate(text: string, max: number): string;   // ellipsis is "…", never a hard cut
```

**Placement.** `signPositionFor(slot, footprint)` returns `{ x: slot.x - footprint.w / 2 + 0.6, z: slot.z + footprint.d / 2 + 0.7 }` — the plot's south-west corner, on the approach side, clear of `villagerPosition`'s `slot.z + d/2 + 1.5` (villagers.ts:44-46) so the sign never stands in front of the person who is waiting. The keep's sign sits at a **fixed** offset from `CASTLE_POSITION` computed against `KEEP_MAX_FOOTPRINT`, not the current stage, so it never jumps when the keep grows.

**Detail by distance.** The camera is orthographic (`camera.ts`), so a sign is the same number of screen pixels at 30 units as at 3 — which is exactly how nine 11-px pills came to be the composition. Distance therefore has to gate *content*, not size:

```
signDetailFor(distance, isFocus, fewerChoices):
  if isFocus                          -> "full"
  if fewerChoices                     -> distance <= SIGN_NEAR ? "full" : "board"
  if distance <= SIGN_NEAR            -> "full"
  if distance <= SIGN_FAR             -> "name"
  -> "board"
```

The objective site always reads in full, at any distance, so tracking is never lost. Everything else fades to a wooden board. In a 24-unit frame that is two or three legible signs at a time, not nine.

Detail is evaluated in the frame loop against `hero.current.position` and applied by toggling `.visible` on the line-2 and line-3 quad refs — no React state, no re-render, and the `World` memo stays intact. With `settings.motion` the quads cross-fade over 200 ms via `material.opacity`; without it they snap.

**Copy, verbatim.**

Line 1 is the building label, consumed from `BUILDINGS` (kingdom.ts:6-15), never retyped: `Village Well`, `Grain Mill`, `River Bridge`, `Chapel`, `Market Square`, `Library`, `Watchtower`, `Royal Garden`. The keep's sign reads `The Keep`. All nine fit `SIGN_MAX_CHARS.line1 = 16`.

Line 2, **full depth** (`numerals: true`), where `{district}` comes from `districtFor(siteId)`:

| State | String | Example |
|---|---|---|
| A site with a district, unbuilt | `{district} · {done} of {total}` | `Scholars' Row · 3 of 5` |
| A site with a district, built | `{district} · Built` | `Scholars' Row · Built` |
| A site with no district | `{done} of {total}` | `3 of 5` |
| A site with no district, built | `Built` | `Built` |
| The keep, below 8 | `The Kingdom · {n} of 8` | `The Kingdom · 3 of 8` |
| The keep, at 8 | `The Kingdom · Whole` | `The Kingdom · Whole` |

`village-ground` owes district labels of **13 characters or fewer** so `{district} · 3 of 5` stays inside 24. Anything longer is truncated by `truncate` with `…` rather than overflowing the board.

Line 2, **simple depth** (`numerals: false`): a pip row, `filled` of `total`, using the same ●/○ vocabulary as slice 1's objective card. Eight pips maximum (the keep); at eight, each pip is ~0.32 units ≈ 15 CSS px at the village's camera zoom with a 2-px gap — the densest thing on any sign, and a named check in the browser pass.

Line 3: **reserved and empty**. The quad exists, sized and positioned, with no texture and `visible = false`. Slice 13 sets `line3` and the row lights up. Reserving the row now is the whole point: the board's silhouette, its post height and its texture layout never change when attribution arrives, so no sign is redrawn twice.

**Why this is not the pills again.** The pills were pure `#fff` on `rgba(0,0,0,0.55)` at a fixed 11 px, floating in screen space over scenery, nine at a time, drawing through geometry (`<Html>` with `zIndexRange` and no `occlude`). The boards are dark brown type on lit wood, part of the art, sized in world units so they scale with the frame, depth-sorted like every other sprite, and at most three are legible at once. It is the same information and the opposite composition.

### 3.4 How the sign is drawn

Three stacked quads in one group, on one billboard plane each:

1. **Board + name** — one composite texture per site, key `sign:{siteId}:{scale}`. Nine of them, rasterised once, never invalidated (a building's name never changes).
2. **Line 2** — a small strip texture, key `signline:{line2Key}:{scale}` where `line2Key` is `pips:3/5` or `text:Scholars' Row · 3 of 5`. Re-composited when a side quest completes; the old key stays cached, so walking away and back costs nothing.
3. **Line 3** — nothing today.

The compositor is a new export on `sprite-texture.ts`, beside `svgElementToTexture`, sharing its dynamic `await import("three")` so the three.js boundary is unchanged:

```ts
// src/lib/realm/sprite-texture.ts
// TextRow is DELETED. Rows are pixel-font rectangles, from slice 5's pixelTextRects.
export type PixelRow = { text: string; yFraction: number; scale: number; color: string; align: "center" };
export type PipRow = { filled: number; total: number; yFraction: number; radiusPx: number; gapPx: number; filledColor: string; emptyColor: string };

export async function compositeTexture(
  svg: SVGSVGElement | null,
  size: { w: number; h: number },
  rows: PixelRow[],
  pips: PipRow[],
  scale: number,
): Promise<CanvasTexture>;
```

It draws the board SVG (when given) into a canvas of `size × scale`, then composites rows with `ctx.fillText` and pips with `ctx.arc`, `imageSmoothingEnabled = false` throughout, returning a `NearestFilter` texture exactly like `svgElementToTexture` does today (sprite-texture.ts:40-48).

**Line 1 and line 2 are drawn with slice 5's `pixel-font.ts`, not with `ctx.fillText`.** Slice 5 created a hand-authored 5×7 uppercase font as a module rather than a helper inside its figure file *precisely so this slice could use it*, and for the reason slice 5 gives: `<text>` in a data-URI SVG resolves against whatever font the platform happens to have, at whatever hinting it applies, and then gets minified onto a texel grid we control to the pixel — the mechanism slice 2 identified as the cause of "rough". A child standing between a carved district sign and a building signboard must not be looking at two typefaces at two renderings; that inconsistency *is* the complaint.

So `compositeTexture` composites **rects, not glyphs**: `pixelTextRects(text, opts)` produces the rectangles, `compositeTexture` fills them plus the pip rows onto the board SVG. `TextRow` and `ctx.fillText` are deleted from this spec.

At `SIGN_SIZE` 3.4 × 2.4 world units and `CAMERA_ZOOM` 64 at dpr 2, the board is 218 × 154 CSS px and a 436 × 308 canvas. The 5×7 font at `scale: 3` gives a 15 × 21 px capital for line 1 and at `scale: 2` a 10 × 14 px capital for lines 2 and 3 — every edge on a whole pixel, by construction. Under `largerText` the board is 4.25 × 3.0 units at scales 4 and 3.

**If the 5×7 font at this size is unreadable, the answer is a bigger board, not a second text pipeline.** `SIGN_SIZE.w` goes up and the placement clearance against `villagerStandFor` is re-checked. That is the named lever in the browser pass below.

At `SIGN_SIZE` 3.4 × 2.4 units and a village camera zoom of ~48 at dpr 2, the board is 163 × 115 CSS px and a 326 × 230 canvas. Line 1 is set at 16 px, lines 2 and 3 at 12 px. Under `largerText` the board is 4.25 × 3.0 units and the type is 20 px / 15 px.

Only **one** SVG figure is needed for all nine boards — `SignBoardFigure` in a new `src/components/realm/sign-figures.tsx`, a plank board on two posts with a top rail and three ruled text rows — so `SpriteSource` renders one more figure and composites nine textures from it.

### 3.5 What leaves the screen

- `PropLabel` (realm-scene.tsx:60-69) — deleted, with its three call sites (`:287`, `:311`, `:323`).
- `.realm-label` and `.realm-label-tag` (globals.css:1718-1719) — deleted.
- `Prop.tag` (layout.ts:16) and its two writes (layout.ts:159, 161) — deleted. **Interface note for slice 1:** if the villager nameplate's second line reads `prop.tag`, it must read the villager's own `status` instead; `tag` does not survive this slice.
- `Html` is no longer imported by `realm-scene.tsx` unless another slice still needs it; nine `<Html>` nodes leave the frame loop.
- `CastleFigure`, `CASTLE_TIERS`, `CastleTier` (world-figures.tsx:8-9, 51-188) — **deleted here, once, by this slice.** Slice 11 replaces this slice's `keep:{stage}:{skinId}` with `keep:{piece}:{skinId}` and must not re-list these deletions. (`FoundationFigure` went in slice 2 and is not this slice's to delete.)
- `CASTLE_FOOTPRINTS` (layout.ts:34-44) — deleted.
- `FOUNDATION_COLOR` (layout.ts:73) and `CALM_FOUNDATION` (realm-scene.tsx:53) — deleted, replaced by palette tokens.

### 3.6 The rasterisation budget

`sprite-texture.ts` caches by key, so instances are free and **kinds are billed** (sprite-source.tsx:39-45). Today's world pass is 1 castle + 8 buildings + 1 foundation + 6 decor + 2 tiles = 18 world kinds inside a total of roughly 34.

This slice's ledger:

| Change | Kinds | Eager at first paint | Canvas area each (zoom 48, dpr 2) |
|---|---|---|---|
| castle → keep stages | 1 → 5 (**+4**) | **2** (current stage and the next) | up to 1152 × 1056 ≈ 1.2 Mpx |
| foundation → plot stages | 1 → 4 (**+3**) | 4 | ≈ 336 × 250 ≈ 0.08 Mpx |
| sign board + name | **+9** | 9 | 326 × 230 ≈ 0.075 Mpx |
| sign line 2 | **+9 live**, bounded ≤ 60 over a kingdom | 9 | 326 × 34 ≈ 0.011 Mpx |
| **Net** | **+25 kinds** | **+15 eager**, ≈ **+2.0 Mpx** | |

Two rules keep this off the first-paint path, which is objection (c):

1. **`keepStagesToRasterise(stage)` returns `[stage, min(stage + 1, 4)]`.** A stage rises by exactly one step, only when a building completes, so the next stage is always warm and a growing keep never box-flashes — the failure commit `86bdeed` already fixed once for buildings. The other three stages are backfilled after `onReady` in a `requestIdleCallback` (with a `setTimeout(…, 0)` fallback), through the same `textureFor` cache so nothing is drawn twice.
2. **The `world` memo keys on the skin, not the stage.** `realm-shell.tsx:222-226` memoises `{ castleType, decor }` precisely so `SpriteSource` does not re-run mid-visit. It becomes `{ keepSkinId, keepStage, decor }` — and `keepStage` *is* in the key, because a rise must warm stage `n+2`. The comment at realm-shell.tsx:218-221 is rewritten to say so. The re-run is cheap by construction: every previously-drawn key is a cache hit, and the only new work is one keep stage.

Line-2 recomposites happen once per completed side quest — a 0.011 Mpx canvas, well under a millisecond, off the first-paint path entirely.

### 3.7 The /castle page

`CASTLE_TYPES` keeps its ids, its order and its `levelRequired` values exactly. Only the `description` strings change, from silhouettes to colours (avatar-catalog.ts:534-543):

```ts
{ id: "campsite",   label: "Campsite",   description: "Grey stone and a red roof, with a canvas awning over the gate", levelRequired: 50 },
{ id: "cottage",    label: "Cottage",    description: "Warm sandstone and a thatched porch",                            levelRequired: 55 },
{ id: "watchtower", label: "Watchtower", description: "Cold grey stone with a beacon burning on the tallest tower",     levelRequired: 60 },
{ id: "keep",       label: "Keep",       description: "Dark stone and an iron portcullis in the gate",                  levelRequired: 65 },
{ id: "manor",      label: "Manor",      description: "Pale stone, a plum roof, and a rose window facing south",        levelRequired: 70 },
{ id: "castle",     label: "Castle",     description: "Blue-grey stone with gold trim and twin pennants",               levelRequired: 80 },
{ id: "fortress",   label: "Fortress",   description: "Iron-grey stone and a spiked barbican before the gate",          levelRequired: 90 },
{ id: "citadel",    label: "Citadel",    description: "Violet stone, gold trim, and a gold weathervane at the peak",    levelRequired: 100 },
```

New copy module, so every string is testable:

```ts
// src/lib/utils/castle-copy.ts
export const CASTLE_COLOURS_TITLE_CHILD: string;
export const CASTLE_COLOURS_TITLE_PARENT: string;
export const CASTLE_COLOURS_SUBTITLE_CHILD: string;
export function castleColoursSubtitleParent(childName: string): string;
export const CASTLE_SIZE_EXPLAINER: string;
export function castleSizeLine(buildingsComplete: number): string;
export const CASTLE_LOCKED_TITLE: string;
export function castleLockedBody(level: number): string;
export const CASTLE_SECTION_AVAILABLE: string;
export const CASTLE_SECTION_FUTURE: string;
export const CASTLE_SECTION_ALL: string;
export const CASTLE_USE_BUTTON: string;
export const CASTLE_CLAIM_TITLE: string;
export const CASTLE_CLAIM_BODY_CHILD: string;
export const CASTLE_CLAIM_BUTTON: string;
```

Verbatim:

- `CASTLE_COLOURS_TITLE_CHILD` — `Choose your castle's colours`
- `CASTLE_COLOURS_TITLE_PARENT` — `The Castle`
- `CASTLE_COLOURS_SUBTITLE_CHILD` — `Your castle's colours. Its size comes from the kingdom you are building.`
- `castleColoursSubtitleParent("Emma")` — `Emma's castle colours. The castle's size comes from the kingdom she is building in the Realm.`
- `CASTLE_SIZE_EXPLAINER` — `Your castle grows as your kingdom does. Raise a building in the Realm and the keep gets bigger — walls, then a gatehouse, then towers, and a whole citadel at eight of eight. What you choose here is its colours: the stone, the roof, and the trim on the banners. Every colour you have unlocked is still here, and there are more to come.`
- `castleSizeLine(0)` — `You have raised no buildings yet. Your keep is stone and scaffolding — every building you raise makes it bigger.`
- `castleSizeLine(n)` for `1 ≤ n ≤ 7` — `You have raised {n} of 8 buildings. Your keep has {label}.` with `label` the lower-cased `KEEP_STAGE_LABELS` entry, e.g. `You have raised 3 of 8 buildings. Your keep has walls and a gatehouse.`
- `castleSizeLine(8)` — `You have raised all 8 buildings. Your keep is a citadel.`
- `CASTLE_LOCKED_TITLE` — `Your castle is already standing`
- `castleLockedBody(12)` — `Your castle is in the Realm right now, and it grows every time you raise a building. Choosing its colours unlocks at Level 50. You are Level 12.`
- `CASTLE_SECTION_ALL` — `Castle colours`
- `CASTLE_SECTION_AVAILABLE` — `Colours you can use`
- `CASTLE_SECTION_FUTURE` — `Colours still to come`
- `CASTLE_USE_BUTTON` — `Use these colours`
- `CASTLE_CLAIM_TITLE` — `Pick your colours`
- `CASTLE_CLAIM_BODY_CHILD` — `You've reached Level 50. Choose the colours your castle wears — you can change them whenever you like.`
- `CASTLE_CLAIM_BUTTON` — `Choose colours`

**A child at level 12 with 3 of 8 buildings** (level < 50, no `castle` row — the common case, and the one the audit says shows a padlock today) sees: the page title `Choose your castle's colours`; then `CASTLE_LOCKED_TITLE`; then `castleLockedBody(12)`; then `castleSizeLine(3)` — *"You have raised 3 of 8 buildings. Your keep has walls and a gatehouse."*; then the level meter that is already there (page.tsx:73-82); then the full `Castle colours` list, every tier visible with its level and its new description, dimmed above their level exactly as today (page.tsx:85-91). They read a gain and a fact about their own keep, not a padlock. The word `Locked` does not appear on the page.

The upgrade action is unchanged: `upgradeCastle` still validates against `levelRequired` (actions/castle.ts:62-79). `initializeCastle`'s hard `level < 50` throw stays. `CASTLE_ICONS`/`GameIcon` on the page stay as they are.

### 3.8 What the world says when it changes

All of it goes through slice 1's centred message lane at `notice` priority; none of it pauses the clock.

Plot stage advanced (a side quest completed, the building did not rise) — `plotStageNotice`:

| To | String |
|---|---|
| `timber` | `Timber arrives at the {label}.` |
| `stone` | `The {label}'s walls are going up.` |
| `framed` | `The {label} is one side quest from finished.` |
| `marked` | *(null — a plot never goes backwards)* |

`plotStageSpeech`, written for the ear rather than the eye:

| To | Spoken |
|---|---|
| `timber` | `Wood has arrived at the {label}. Your work is showing.` |
| `stone` | `The walls of the {label} are going up.` |
| `framed` | `One more side quest and the {label} is finished.` |

Keep grew — `keepGrewNotice(from, to)`, `null` when `to <= from`:

| To | String | Spoken |
|---|---|---|
| 1 | `Your keep grew: stone walls.` | `Look at your keep. It grew. It has stone walls now.` |
| 2 | `Your keep grew: walls and a gatehouse.` | `Look at your keep. It grew. It has a gatehouse now.` |
| 3 | `Your keep grew: walls, a gatehouse and towers.` | `Look at your keep. It grew. It has towers now.` |
| 4 | `Your keep is a citadel. Eight of eight.` | `Your keep is a citadel. You raised all eight buildings.` |

Reading a sign aloud (`readAloud`, hero within `SIGN_NEAR` for 1.2 s, once per sign per approach behind a last-spoken ref):

- Unbuilt: `Village Well. Three side quests done, out of five.`
- Built: `Village Well. Built.`
- The keep: `The Keep. Three of eight buildings raised.`

Every one of these is true of code that runs. Nothing here promises a thing the slice does not do — the rule the help card's `Clear troubles to protect the sites` taught us.

### 3.9 The one-time note

Copy, shown once, in the message lane, dismissible, auto-clearing after 6 s:

- On screen: `Your castle changed. It grows with your kingdom now — every building you raise makes it bigger. The colours you chose are still yours.`
- Touch/keyboard dismiss button: `Got it`
- Spoken (`readAloud`): `Your castle looks different. It grows as your kingdom grows. Every building you raise makes it bigger. The colours you picked are still there.`
- `aria-live` (polite): `Your castle changed. It grows with your kingdom now. The colours you chose are still yours.`

---

## 4. Data model

### 4.1 Migration

**`<next>_<drizzle-name>.sql`.** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan. The DDL below is what matters.

```sql
ALTER TABLE `realm_settings` ADD `keep_note_seen_at` integer;
```

```ts
// src/lib/db/schema.ts, realm_settings (currently schema.ts:673-699)
// Slice 10: when the hero was told the castle now grows with the kingdom. Null means never told.
keepNoteSeenAt: integer("keep_note_seen_at", { mode: "timestamp" }),
```

Nullable, no default, no backfill. Verification: run `npm run db:generate` then `npm run db:migrate`, then **check** — `sqlite3 … "PRAGMA table_info(realm_settings)"` — rather than trusting it, because the hook runs migrate silently.

### 4.2 What existing rows do

The note must reach the children who had a tent and must never reach a child who never did.

**Rule:** show the note when `keepNoteSeenAt IS NULL AND helpSeenAt IS NOT NULL`.

- A row that exists today has `keepNoteSeenAt = NULL`. If `helpSeenAt` is set, that hero has been in the Realm and has seen the tent: they get the note once, on their next visit, and dismissing it stamps `keepNoteSeenAt`.
- A row that exists today with `helpSeenAt = NULL` has a hero who has never opened the Realm. They never see the note, and they never will, because —
- **Both auto-insert sites are amended to stamp it at creation:** `loadRealmSettings` (realm-play.ts:17-20) and `loadRealmFlags` (realm-play.ts:38-41) both insert `{ id, childId, createdAt: now, updatedAt: now }`; both gain `keepNoteSeenAt: now`. Every row created from this slice onward is born stamped, so a hero who first opens the Realm after this slice can never be told their castle "changed".

Both halves are required. Without the stamp-at-insert, a brand-new hero would get `helpSeenAt` set by the help card and then be told, on their second visit, that a castle they never saw had changed.

**Action** (in `src/lib/actions/realm-settings.ts`, a `"use server"` file that exports only async functions — the existing `markRealmHelpSeen` at :30-36 is the pattern):

```ts
export async function markKeepNoteSeen(childId: string): Promise<void>;
```

It requires child access, sets `keepNoteSeenAt` and `updatedAt` to now, and returns. It is called **only from the child view**; a parent preview neither reads nor writes it (section 6).

`loadRealmFlags`'s return type gains `keepNoteSeenAt: Date | null` and `getRealmBundle` gains `keepNoteSeen: flags.keepNoteSeenAt !== null` beside the existing `helpSeen` (actions/realm.ts:106). No extra round trip: it rides the same select (realm-play.ts:34).

### 4.3 No other schema change

The keep's stage is derived, never stored: it is `keepStageFor(kingdom.buildings.filter(b => b.complete).length)`, computed from data that already exists. The `castle` table is untouched — same rows, same `type` values, same meaning for the /castle page's purposes, one narrower job in the world. A child who never claimed a castle still has no row, and `keepSkinFor(null)` gives them the campsite palette. Nothing a child owns is deleted, downgraded or re-pointed.

### 4.4 Every existing combination

| `castle.type` | Buildings complete | What renders |
|---|---|---|
| *(no row — level < 50, the common case)* | 0 | Stage 0 keep, campsite colours: grey stone, red roof, canvas awning, scaffolding |
| *(no row)* | 3 | Stage 2 keep (walls + gatehouse), campsite colours |
| `campsite` | 0 | Stage 0, campsite colours — the same picture as the no-row case |
| `campsite` | 8 | Stage 4 citadel silhouette, campsite colours |
| `citadel` | 0 | **Stage 0 keep in citadel colours** — violet stone, gold trim, gold weathervane, still in scaffolding. Not a citadel. The note fires once. |
| `citadel` | 8 | Stage 4 citadel silhouette in citadel colours. The best-looking thing in the game. |
| `watchtower` | any | Stage-driven silhouette in cold grey with a lit beacon. It can no longer be confused with the Watchtower *building* 9.2 units away, because the keep family has its own silhouette and its own 96-unit grid. |
| `"moon-base"` or any unknown | any | `keepSkinFor` returns `KEEP_SKINS.campsite` silently, mirroring `buildWorldLayout`'s existing unknown-type fallback (layout.ts:125). No throw, no console noise. |

The only child who loses a picture is one at level 60+ who chose `watchtower` or above *and* has few buildings: their world keep gets smaller. They are told once, they keep every tier they unlocked, they keep the colours, and their keep now grows again — which it had stopped doing at whatever level they reached. That trade is the decision, made deliberately, and the copy in 3.9 is written to say so honestly.

---

## 5. Errors and edge cases

- **The keep figure fails to rasterise.** The existing box fallback runs (realm-scene.tsx:317-325) at the stage's footprint. `PropLabel` is gone, so the box is unnamed — but the keep's **sign** is a separate object with its own textures and still reads `The Keep · 3 of 8`, so the centrepiece is never anonymous.
- **A plot figure fails.** The dirt quad still renders; the site is a marked plot with no standing content. The sign still names it. No crash, no `<Html>`.
- **A sign board composite fails.** That sign renders nothing at all rather than an untextured white quad; `signModelsFor` output is unaffected, so `signAnchors` (slice 8) and `signFootprints` (spawn exclusion) still work off the model, not the texture.
- **A line-2 composite fails.** Detail degrades to `name`: the board and the building's name still show. The failure is per-sign and per-value, so one bad string cannot blank the world.
- **`buildingsComplete` out of range.** `keepStageFor` clamps `[0, 8]`; non-finite returns 0.
- **`done > total`.** `buildingProgress` already clamps (kingdom.ts:22); `plotStageFor` clamps again rather than trusting its caller.
- **`total === 0`** (possible after slice 13 sets real counts if a building ends with no side quests): `buildingProgress(0, b)` reports `complete: true`, so the building renders raised and `plotStageFor` is never called for it. Called directly it returns `marked`. Stated so slice 13 knows.
- **The keep grows while the hero stands where the new wall will be.** `layout.colliders` changes, which fires the existing unstick effect (realm-scene.tsx:100-102) and steps the hero out. A test asserts `unstickHero` recovers from every point inside `KEEP_STAGE_FOOTPRINTS[4]` grown by `HERO_RADIUS`, at the village's `CASTLE_POSITION`, to a point that is outside every collider and inside the clamp.
- **A trouble is standing where the new wall will be.** `spawnTroubles` re-filters live troubles against colliders on every call (troubles.ts:84), so it is dropped on the next tick without any new code.
- **The keep grows mid-ceremony.** `startCeremony` captures `marks` once (ceremony.ts:75-83); a footprint that grows underneath them could put the hero's mark inside the new wall at 8 of 8 — the exact moment the ceremony matters most. **Fix:** `ceremonyMarks` computes `south` from `CASTLE_POSITION.z + KEEP_MAX_FOOTPRINT.d / 2` instead of the live prop's `size.d` (ceremony.ts:52). Marks become stage-independent, and the whole class of bug goes away. The cost is that at stage 0 the hero stands about 2 units further from the wall than they strictly need to; that is a better trade than a conditional re-derivation that would teleport eight villagers mid-walk.
- **`markKeepNoteSeen` fails** (offline, remote Turso hiccup). The note shows again next visit. It is fire-and-forget from the shell; the rejection is swallowed at the call site and never reaches the scene or blocks play.
- **A sign line overflows.** `truncate(text, SIGN_MAX_CHARS.line2)` with `…`, plus `compositeTexture`'s own measure-and-drop-one-scale-step using `pixelTextWidth`. Both, because a district name is another slice's string — and because slice 5's longest is `GARDEN TERRACE` at 14 characters, which fits line 2's 24 with room.
- **`districtFor` returns null** for a site (slice 4 has not placed it, or the map drifts). Line 2 falls back to the bare count. Never `null · 3 of 5`, never an empty separator.
- **A completed kingdom.** The foundation-only spawn rule was **already deleted, in slice 4**, which moved spawning onto ten `SPAWN_ZONES` that do not depend on kingdom progress; slice 8 then added the objective preference and the hero clearance. By the time this slice runs, an 8-of-8 kingdom already keeps its enemies. What this slice contributes is that all nine **signs stand after completion**, so `signAnchors()` gives a permanent, named, positioned anchor per site for anything that wants to speak about a place — and `signFootprints()` becomes a spawn *exclusion*, through the `clearOfSigns` clause this slice adds to `OpenGroundRules`.

---

## 6. Accessibility, and the complexity axis

Every surface consumes `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1). This slice requires two keys and defaults defensively if they are absent, so it can never crash on a contract mismatch:

```ts
const surfaces = surfacesFor(depth, profile);
const numerals  = surfaces.numerals;        // slice 1's closed table; false → pips, the simple form
const districts = surfaces.districtDetail;  // slice 1's closed table; false → bare count
```

| Surface | Simple depth | Full depth |
|---|---|---|
| Sign line 2, a site | Pip row, `filled` of `total` | `Scholars' Row · 3 of 5` |
| Sign line 2, the keep | Pip row, 8 pips | `The Kingdom · 3 of 8` |
| Sign line 2, built | All pips filled | `Scholars' Row · Built` |
| Plot stages | Identical at both depths — a picture is not a reading level | Identical |
| Keep stages | Identical at both depths | Identical |
| /castle page | Identical — it is outside the Realm and outside the axis | Identical |

The three invariants hold: `fewerChoices` does not touch `trackedObjectives` or `abilitySlots` here (this slice owns neither), the word "depth" never reaches a child, and every simple-depth surface is a **substitution** — pips say what numerals say. A six-year-old is never shown less than a thirteen-year-old; they are shown the same fact in a form they can read.

| Setting | What this slice does |
|---|---|
| `reducedMotion` | The keep swap and the plot stage swap are instant (no 900 ms `RISE_MS` tween); sign detail snaps with no cross-fade. **Non-motion substitute, mandatory:** the change still produces its message-lane line *and* its `aria-live` announcement, so a reducedMotion child gets the same information through a channel that is not motion. The counterexample this rule exists for — the single combat particle gated on `motion` — is not repeated here. |
| `lowStimulus` | **Mutes, never empties.** Every sign, every plot stage and the keep all render. `plotDirtCalm` (`#7a715c`) replaces `plotDirt`; the sign board and its type drop to the calm palette's lower contrast; the keep's skin colours are muted through `palette.ts`'s calm variant rather than swapped for grey. `CALM_FOUNDATION`'s current *darkening* of the plot is deleted outright — it made the one thing a low-stimulus child most needs to find harder to see. Nothing is removed from the frame. |
| `largerText` | `signWorldScale(true) = 1.25`: the board's world size grows to 4.25 × 3.0 units **and** the baked type is composited at 20 px / 15 px, so the text is bigger rather than merely magnified and blurrier. This is the direct fix for `globals.css:243-246` scoping `data-larger-text` to `.realm-panel` only, which left the whole world at 11 px for a largerText hero — the world no longer uses DOM text at all. |
| `fewerChoices` | `signDetailFor` drops the middle `name` tier: only signs within `SIGN_NEAR`, plus the objective's sign, carry any text. At most two boards are ever readable at once. Removal of *choices*, not of *content* — every sign is still there and every one still reads when you walk to it. |
| `readAloud` | Plot-stage lines, keep-grew lines and the one-time note all go through `speak()` in their spoken variants (3.8, 3.9). Standing within `SIGN_NEAR` of a sign for 1.2 s speaks its two lines once per approach, behind a last-spoken ref so re-renders cannot stutter it. The notice strings are set regardless of `readAloud` so the `aria-live` lane announces them for free. |
| `inputMode` (touch / keyboard / auto) | Each sign group carries an `onPointerDown` that mirrors its site group's — in reach, open the site; out of reach, walk there. The board is 163 × 115 CSS px at the village zoom, comfortably over the 56 px world-touch minimum slice 1 sets. Keyboard users reach signs through the site they belong to; a sign is never the only route to anything. |
| `soundEnabled` | Two cue ids are reserved and emitted here: **`plotStage`** and **`keepGrew`** — camelCase, matching slice 9's `CueId` union, which carries both with authored tone rows (`keepGrew` deliberately shares `buildingRises`'s shape a fifth lower, so a child hears "something went up" and then "something bigger went up" as one family). They are no-ops until slice 9 ships the sound channel. **No string written in this slice claims a sound.** |

---

## 7. Testing

**Unit-testable, colocated, no three.js at module load:**

- `keep.test.ts` — `keepStageFor` across `-1 … 9`, non-finite and fractional input; the stage boundaries at 1/3/5/8 exactly; `KEEP_MAX_FOOTPRINT === KEEP_STAGE_FOOTPRINTS[4]`; footprints strictly increase in `w`, `d` and `h`; `keepSkinFor` for all eight ids, `null`, `undefined` and `"moon-base"`; `keepStagesToRasterise` returns `[n, n+1]` and `[4, 4]` at the top; `keepGrewNotice` returns null for equal and descending stages and a string for every ascent; `keepProgressLine` at 0, 1, 7 and 8.
- `keep.village.test.ts` — every stage's footprint grown by `HERO_RADIUS`, centred on `CASTLE_POSITION` (0, −24.5), satisfies `roadCorridorContains` for **no** point (streets, spurs and plazas alike); every stage is contained in `KEEP_PRECINCT`; no stage's grown south face crosses `KEEP_APPROACH_CLEAR_Z` (−19.25); and the strip north of the keep is **closed**, not narrow — `buildWorldLayout` extends the keep's collider to the wall's inner face at every stage, so there is no walkable gap behind it to wedge in.
- `plot.test.ts` — `plotStageFor` for every `(done, total)` with `total ∈ {0,1,2,3,5,8}` and `done ∈ [-1, total+1]`; the `total - 1 → framed` pin at every total; the `0 → marked` precedence at `total === 1`; `plotStageNotice`/`plotStageSpeech` return null only for `marked` and interpolate the label everywhere else.
- `sign.test.ts` — `signModelsFor` produces exactly nine models for a full kingdom and nine for an empty one; `line3` is `null` in every one; line 2 is pips when `numerals: false` and the exact strings in 3.8 when true; the district-absent fallbacks; `truncate` at, one under and one over each `SIGN_MAX_CHARS`; `signDetailFor` at `0, SIGN_NEAR, SIGN_NEAR + ε, SIGN_FAR, SIGN_FAR + ε` for `isFocus` both ways and `fewerChoices` both ways; the focus sign is `full` at distance 1000; `signPositionFor` never lands within 0.5 units of `villagerPosition(slot, footprint)`; the keep's sign position is identical at every stage; `signLine2Key` is stable and collision-free across all nine sites × every progress value.
- `layout.test.ts` — rewritten where it touches the castle: `CASTLE_FOOTPRINTS` is gone, so lines 12-19 and 157-159 assert `KEEP_STAGE_FOOTPRINTS` and stage-derived sizing instead; `tag` is gone from every prop; the castle prop's `size` equals `keepFootprintFor(keepStageFor(n))` for `n` in 0…8; `buildWorldLayout` returns `keepStage` and `keepSkinId`.
- `ceremony.test.ts` — rewritten. The `for (const castleType of Object.keys(CASTLE_FOOTPRINTS))` loop at :34 becomes a loop over `KEEP_STAGES`, keeping every assertion it already makes (marks inside the world, clear of every collider grown by `HERO_RADIUS`, villagers south of the hero) and adding one: **`ceremonyMarks` returns identical marks at every stage**, which is what makes a mid-ceremony growth safe.
- `castle-copy.test.ts` — every exported string is non-empty, contains no `TODO`, and `castleSizeLine` produces the exact strings in 3.7 for 0, 1, 3, 7 and 8; `castleLockedBody` interpolates the level and contains neither the word `Locked` nor the word `unlock your castle`.
- `world-figures.test.tsx` — the `CastleFigure`/`CASTLE_TIERS` cases are removed (the `FoundationFigure` case went in slice 2); `keep-figures.test.tsx` and `plot-figures.test.tsx` take over with `assertInside` on the 96 and 64 viewBoxes for all 5 × 8 keep combinations and all 4 plot stages, plus an assertion that **no keep silhouette body contains a literal hex string** (the anti-combinatorial guard from 3.1).
- `sign-figures.test.tsx` — the board renders with three ruled rows at `SIGN_ROWS`' fractions and `assertInside` passes.

**Not unit-testable — the browser pass is the acceptance criterion:**

- Does the stage-0 keep read as a *building under construction* rather than a tent, at the village's camera zoom, on grass, in both palettes? Screenshot all five stages in `/dev/figures` against the 2-unit hero ruler.
- Do the four plot stages read as *different amounts of progress* from across the frame, or do they all read as "a brown patch with stuff on it"? This is the whole slice; if a same-framing before/after does not show it, the stages need redrawing, not re-speccing.
- Is a `scale: 2` pixel-font line (10 × 14 px capitals) readable on a real 400 px-wide phone frame at `largerText: false`? If not, `SIGN_SIZE.w` goes up before anything else changes — never a switch back to platform type, which would put two typefaces in one frame.
- Are three legible boards at once calmer than nine pills, or has the composition simply moved? Compare against the user's original screenshot at the same framing.
- Eight pips on the keep's sign at simple depth: countable, or mush?
- First paint, measured: the number of eager rasterisations and the milliseconds to `onReady`, recorded in the implementation notes rather than asserted here. If the eager keep pair pushes it, drop to one eager stage and accept a single box-flash at the moment of a rise.

---

## 8. Interfaces

### Produces

**`src/lib/realm/keep.ts`**
```ts
type KeepStage = 0 | 1 | 2 | 3 | 4;
type KeepFootprint = { w: number; d: number; h: number };
type KeepSkinId = "campsite" | "cottage" | "watchtower" | "keep" | "manor" | "castle" | "fortress" | "citadel";
type KeepFlourish = "awning" | "thatch" | "brazier" | "portcullis" | "rose-window" | "pennants" | "barbican" | "weathervane";
type KeepSkin = { id: KeepSkinId; stone: string; stoneDark: string; roof: string; trim: string; flourish: KeepFlourish };
type KeepAnchor = { gateX: number; gateY: number; peakX: number; peakY: number };

const KEEP_STAGES: readonly KeepStage[];
const KEEP_STAGE_FOOTPRINTS: Record<KeepStage, KeepFootprint>;
const KEEP_MAX_FOOTPRINT: KeepFootprint;              // { w: 12, d: 9, h: 11 }
const KEEP_STAGE_LABELS: Record<KeepStage, string>;
const KEEP_SKINS: Record<KeepSkinId, KeepSkin>;
const KEEP_ANCHORS: Record<KeepStage, KeepAnchor>;

function keepStageFor(buildingsComplete: number): KeepStage;
function keepFootprintFor(stage: KeepStage): KeepFootprint;
function keepSkinFor(castleType: string | null | undefined): KeepSkin;
function keepStagesToRasterise(stage: KeepStage): KeepStage[];
function keepGrewNotice(from: KeepStage, to: KeepStage): string | null;
function keepGrewSpeech(from: KeepStage, to: KeepStage): string | null;
function keepProgressLine(buildingsComplete: number): string;
```

**`src/lib/realm/plot.ts`**
```ts
type PlotStage = "marked" | "timber" | "stone" | "framed";
const PLOT_STAGES: readonly PlotStage[];
const PLOT_SPRITE_H: Record<PlotStage, number>;
function plotStageFor(done: number, total: number): PlotStage;
function plotStageNotice(stage: PlotStage, buildingLabel: string): string | null;
function plotStageSpeech(stage: PlotStage, buildingLabel: string): string | null;
```

**`src/lib/realm/sign.ts`**
```ts
type SignDetail = "board" | "name" | "full";
type SignLine2 = { kind: "pips"; filled: number; total: number } | { kind: "text"; text: string };
type Rect = { x: number; z: number; w: number; d: number };
type SignModel = { id: string; siteId: string; position: Vec2; line1: string; line2: SignLine2; line3: string | null; footprint: Rect };
type SignInput = { buildings: SiteProgress[]; buildingsComplete: number; districtFor: (siteId: string) => string | null; numerals: boolean; focusId: string | null };

const SIGN_SIZE: { w: number; h: number };
const SIGN_ROWS: { line1: number; line2: number; line3: number };
const SIGN_MAX_CHARS: { line1: number; line2: number; line3: number };
const SIGN_NEAR: number;
const SIGN_FAR: number;
const SIGN_PIP_MAX: number;

function signModelsFor(input: SignInput): SignModel[];
function signPositionFor(slot: Vec2, footprint: { w: number; d: number }): Vec2;
function signDetailFor(distance: number, isFocus: boolean, fewerChoices: boolean): SignDetail;
function signWorldScale(largerText: boolean): number;
function signFootprints(models: SignModel[]): Rect[];
function signAnchors(models: SignModel[]): { id: string; siteId: string; position: Vec2 }[];
function signLine2Key(line2: SignLine2): string;
function truncate(text: string, max: number): string;
```

**`src/lib/realm/sprite-texture.ts`** (addition)
```ts
type TextRow = { text: string; yFraction: number; px: number; color: string; weight: number; align: "center" };
type PipRow = { filled: number; total: number; yFraction: number; radiusPx: number; gapPx: number; filledColor: string; emptyColor: string };
function compositeTexture(svg: SVGSVGElement | null, size: { w: number; h: number }, rows: TextRow[], pips: PipRow[], scale: number): Promise<CanvasTexture>;
```

**`src/lib/realm/layout.ts`** (changed)
```ts
type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[]; villagers: VillagerPlacement[]; castleType: string; keepStage: KeepStage; keepSkinId: KeepSkinId; signs: SignModel[] };
type Prop = { /* … `tag` REMOVED … */ };
function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number; decor?: boolean; numerals?: boolean; focusId?: string | null }): WorldLayout;
```

**Components** (no three.js at module load; rendered off-screen by `SpriteSource`)
```
src/components/realm/keep-figures.tsx   → KeepFigure({ stage: KeepStage; skin: KeepSkin }), KEEP_VIEWBOX = 96
src/components/realm/plot-figures.tsx   → PlotFigure({ stage: PlotStage })
src/components/realm/sign-figures.tsx   → SignBoardFigure()
```

**Texture keys** (the sprite cache contract other slices must not collide with)
```
keep:{stage}:{skinId}       e.g. keep:2:citadel
plot:{stage}                e.g. plot:framed
sign:{siteId}:{scale}       e.g. sign:library:1.25   — siteId is a building id or "keep"
signline:{line2Key}:{scale} e.g. signline:pips:3/5:1 , signline:text:Scholars' Row · 3 of 5:1
```

**Schema / actions / routes**
```
realm_settings.keep_note_seen_at   (integer timestamp, nullable)    → Drizzle field keepNoteSeenAt
markKeepNoteSeen(childId: string): Promise<void>                    → src/lib/actions/realm-settings.ts
loadRealmFlags(childId): { helpSeenAt, starterSpellAt, tutorialStep, tutorialDoneAt,   → src/lib/services/realm-play.ts
                           soundMuted, keepNoteSeenAt }
// Full accumulated shape after this slice. tutorialStep/tutorialDoneAt/soundMuted are slice 9's;
// this slice adds keepNoteSeenAt only. Slice 13 adds regradedAt. Nothing is ever removed.
RealmBundle.keepNoteSeen: boolean                                   → src/lib/actions/realm.ts
src/lib/utils/castle-copy.ts                                        → the /castle page's strings
route /castle                                                       → unchanged path, recopied content
```

**Sound cue ids reserved for slice 9:** `plotStage`, `keepGrew` — both have rows in slice 9's `CUES` table.

**REMOVED by this slice — other specs must not reference these, and no other spec may re-list them:** `Prop.tag`, `CASTLE_FOOTPRINTS`, `FOUNDATION_COLOR`, `CALM_FOUNDATION`, `CastleFigure`, `CASTLE_TIERS`, `CastleTier`, `PropLabel`, CSS classes `.realm-label` and `.realm-label-tag`, texture key `castle:{tier}`.

**Already removed elsewhere — not this slice's, and listed so the audit trail is one line each:** `FoundationFigure` and texture key `foundation` (slice 2, replaced by the tiled dirt), `BUILDING_COLORS` and `DECOR_SPOTS` (slice 5).

**Callers this slice's removals break, and who re-points them — this slice, in the same commit:**

| removed | who used it | fix |
|---|---|---|
| `CASTLE_FOOTPRINTS` | slice 6's `doorsFor`, for the Keep door | `doorsFor`'s `keep` site reads `keepFootprintFor(layout.keepStage)`. `doors.test.ts` gains a case asserting the Keep door point moves with the stage and always clears the grown footprint by `DOOR_CLEARANCE`. |
| `CASTLE_FOOTPRINTS` | `ceremony.test.ts:34`'s loop, `village.test.ts`'s keep tripwire | Both become loops over `KEEP_STAGES` / `KEEP_STAGE_FOOTPRINTS`. |
| `Prop.tag` | slice 1's villager plate, if it was specced to read it | The plate reads `VillagerPlacement.status`, `.label`, `.done` and `.total` — never `tag`. Confirmed against slice 1 §3.10. |
| `PropLabel` | nine floating DOM pills | Replaced by the nine in-world signboards this slice ships. This is the slice that finally answers the highest-contrast objects in the user's screenshots — and until it lands, they are still on screen. |

### Consumes

| From | Name | Used for | If it is missing |
|---|---|---|---|
| slice 1 `src/lib/realm/depth.ts` | `surfacesFor(depth, profile)` → `.numerals`, `.districtDetail` | pips vs numerals; district on line 2 | None needed — both are in slice 1's closed thirteen-field table. This slice adds nothing to `depth.ts`. |
| slice 1 | the objective `focus` flag on the layout | `signDetailFor(_, isFocus, _)` | `focusId: null` — every sign obeys distance alone |
| slice 1 | the centred message lane, `notice` priority | `plotStage`, `keepGrew` and the one-time note | nothing is announced; the world still changes |
| slice 1 | `clock.flushPending()` on unmount | this slice adds no exit path that bypasses it | — |
| slice 2 | the derived raster scale and the warm cache | every texture key above | first paint regresses; do not ship |
| slice 2 | `/dev/figures` | judging 5 keep stages, 4 plot stages, 8 skins | the browser pass has no instrument |
| slice 4 `src/lib/realm/village.ts` | `CASTLE_POSITION` (0, −24.5), `KEEP_PRECINCT: Rect`, `KEEP_APPROACH_CLEAR_Z` (−19.25), `ROAD_QUADS` + `roadCorridorContains(p, margin?)`, `DISTRICTS`, `districtFor(buildingId)`, `BUILDING_SLOTS`, `buildingFootprint(id)` | siting, the precinct test, line 2 | **None needed** — slice 4's §8.1 is frozen and ships all of these. There is no `roadCorridors()`. |
| slice 4 `src/lib/realm/open-ground.ts` | `SPAWN_ZONES` | must exclude `KEEP_PRECINCT` at max footprint and every `signFootprints()` rect | gleams and troubles can spawn inside a wall |
| slice 5 `src/lib/realm/palette.ts` | `plotDirt`, `plotDirtLight`, `plotDirtCalm`, `plotRope`, `plotTimber`, `plotStone`, and calm variants of the keep skin colours | plot and keep colour | the plot stays green-on-brown; do not ship |
| existing | `BUILDINGS` (kingdom.ts:6-15), `buildingProgress` (kingdom.ts:21-24) | line 1 and progress | — |
| existing | `SIDE_QUEST_LOWER` (side-quest-copy.ts:7) | `plotStageNotice`'s `framed` string | — |
| existing | `unstickHero` (movement.ts), the colliders effect (realm-scene.tsx:100-102) | keep-growth recovery | — |

**Obligations this slice places on others**, stated plainly so they are not discovered late — and all but one are already met by the specs as written:

| obligation | on | status |
|---|---|---|
| Reserve `KEEP_PRECINCT` around a 12 × 9 keep, roads outside it, no pinch behind it | slice 4 | **Met.** Slice 4 §3.5 ships the rect, the clear-z and the keep-backs-onto-the-wall rule. |
| Carry the six plot tokens (`plotDirt`, `plotDirtLight`, `plotDirtCalm`, `plotRope`, `plotTimber`, `plotStone`) in `palette.ts` | slice 5 | Requested here; slice 5 owns the one palette module and these join it. |
| Publish `numerals` and `districtDetail` in `Surfaces` | slice 1 | **Met.** Both are in slice 1's closed thirteen-field table. This slice requests no new field and adds nothing to `depth.ts`. |
| Fill `SignModel.line3` without changing `SIGN_SIZE`, `SIGN_ROWS` or the board figure | slice 13 | Stated below. **Line 3 is the one home for attribution**; slice 11 draws no wall plaque and `BuildingFigure` takes no attribution parameter. |

**Obligations this slice takes on itself**, rather than pushing onto an earlier slice that cannot meet them:

- **Sign footprints as spawn exclusions.** An earlier draft asked slice 4's static `SPAWN_ZONES` table to exclude every rect `signFootprints()` returns — impossible, since `signFootprints()` is produced *here*, six slices later. Instead this slice adds the rule where the rule belongs: `OpenGroundRules` gains `clearOfSigns: number` and `isOpenGround` tests the layout's `signs` array, the same way it already tests `villagers`. Slice 4's data is untouched; one predicate gains one clause.
- **Re-pointing `doorsFor`.** This slice deletes `CASTLE_FOOTPRINTS`, which slice 6's Keep door is derived from. **This slice re-points it**: `doorsFor`'s `keep` site reads `keepFootprintFor(layout.keepStage)`, and `doors.test.ts` gains a case asserting the Keep door point moves with the stage and always clears the grown footprint by `DOOR_CLEARANCE`. Removing a constant without auditing its callers is how a slice breaks the only in-world route to the Kingdom panel.

**Attribution, degrading (D9).** Line 3 is reserved, empty, and reads no data in this slice — so there is nothing here to degrade yet. The contract slice 13 inherits: the string is `Raised by {raisedByName ?? liveName} · {season}`; if both names are missing the row stays hidden and the board is unchanged; if the season is missing the string is `Raised by {name}`; a renamed hero keeps the name the stone was laid with (`raisedByName` is a snapshot, written once at completion) while every live surface follows the current name; a retired hero's buildings keep their stone. In **parent preview** the row shows the previewed child's snapshot name and never the previewing adult's. Reserving the row rather than the data is the design so that the sign is drawn exactly once.

**Parent preview (`isChildView: false`).** Signs, plots and the keep all render normally — they are driven by the previewed child's `kingdom.buildings`, and nothing in this slice reads `mana`, `cleared`, `ride` or `minutes`, so there is no nulled-hero crash surface. Two deliberate suppressions: the one-time note **does not render and `markKeepNoteSeen` is never called** in preview, because stamping it from a parent's device would silently rob the child of the one explanation they get; and `readAloud` sign speech is suppressed, matching the rest of the preview's silence. The /castle page already handles preview (`isChildView` at page.tsx:53, 116-119) and keeps doing so with the new copy.

**The metered clock.** Every new beat, in seconds: a keep stage change rides the existing `RISE_MS` 900 ms tween and adds none of its own; a plot stage change is instant (the texture swaps on the same billboard); a sign detail change is a 200 ms cross-fade, 0 ms under `reducedMotion`; the one-time note occupies the message lane for 6 s and **pauses nothing**; first paint gains the rasterisations costed in 3.6. **The clock is not paused anywhere in this slice** — the one pause in the whole programme is slice 9's opening banner. No exit path is added, so `clock.flushPending()` on unmount is untouched.

**The economy.** This slice grants no minutes, spends no minutes, and gates nothing. A plot stage, a sign, a keep and the /castle page are all read-only surfaces over work that was already recorded. Nothing here can stand between a child and a side quest: `signDetailFor` never blocks a pointer, plots are not solid, and the only new collider — the keep — sits inside a precinct with roads around it. The `castle-copy.test.ts` and `sign.test.ts` suites both assert no string in this slice asks a child to do anything before playing.

---

## 9. Out of scope

- **The 3/4-isometric redraw** of the five keep stages, the four plot stages and the signboard. This slice authors them as workmanlike front-elevation figures in the codebase's existing idiom, because the alternative is drawing them twice. **`building-redraw` (slice 11)** redraws all of them with a roof plane, a lit and a shaded face and one baked upper-left sun — the keep and plot figures are explicitly on its list, and its dependency on this slice is why.
- **Attribution content** — `raisedByName`, `raisedAtSeason`, the columns, the migration, the copy. Only the row is reserved. **`record-of-the-work` (slice 13)**.
- **District names, the road graph, the precinct, `open-ground.ts`, the market plaza, the camera reframe.** **`village-ground` (slice 4)**; this slice states what it needs from them and tests against them.
- **`palette.ts` itself**, the seeded props, the district signs at district entrances, the calm palette's variants. **`village-life` (slice 5)**; this slice names the six tokens it needs.
- **Zone-based trouble spawning.** Already done, two and six slices earlier: **slice 4** moved `spawnTroubles` off foundations onto `SPAWN_ZONES` and **slice 8** added the objective preference, the hero clearance and the death beat. This slice neither performs nor re-performs it; it only adds `clearOfSigns` to `OpenGroundRules` so nothing spawns inside a signboard.
- **The Kingdom Board panel behind the keep's door** — eight rows, done/total, next side quest. The keep is a solid collider here, not a door. **`doors-and-the-tavern` (slice 6)**.
- **Sound.** Two cue ids are reserved and nothing is played. **`sound-and-first-five-minutes` (slice 9)**.
- **Per-building real `deedsToBuild` counts** and the retro-completion migration they carry. `plotStageFor` is written fraction-safe specifically so it needs no edit when they land. **`record-of-the-work` (slice 13)**.
- **The recess lap ring's route around the keep precinct.** **`recess-that-counts` (slice 12)**.
- **A keep thumbnail on the /castle page.** The page keeps `GameIcon`/`CASTLE_ICONS`; showing the real stage-and-skin figure there would need the rasteriser outside the Realm shell. A candidate for slice 11, not a promise.
- **Retiring `BUILDING_COLORS`** (layout.ts:58-67), the dead palette that only renders in the box-fallback path. It is `village-life`'s to delete along with the rest of the palette consolidation; this slice does not touch it and does not add to it.
