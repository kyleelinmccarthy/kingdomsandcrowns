# Stop looking rough, and build the tool that makes the art possible

**Date:** 2026-09-10
**Status:** Design. Written up front with the rest of the programme (decision 1). The implementation plan is written at build time, after slice 1 lands.
**Programme:** [The Realm: Presentation Overhaul](./2026-09-10-realm-presentation-overhaul-brief.md) — slice **2 of 13**, `sprite-budget-and-gallery`, effort **medium**.
**Depends on:** slice 1 `first-impression` (contact shadows, the ground ring, `depth.ts`).
**Depended on by:** every slice that draws anything — 4 `village-ground`, 5 `village-life`, 8 `troubles-that-read-and-pay`, 10 `plots-signs-and-the-keep`, 11 `building-redraw`, and 3 `ability-bar-and-mount-slot` for the mount figure's true size.
**Checkpoint:** this slice ends at **Checkpoint 1**. Ship 1 and 2, take same-framing before/after screenshots of the two views the user photographed, and have them play again. Slice 3 does not start until that feedback lands. Everything after this point in the programme is a proposal, not a commitment.

**What Checkpoint 1 is, and is not, judging — stated so the user is not surprised twice.** The screenshots are taken at the **current** framing: `CAMERA_ZOOM` 40, a 40-unit world, the frame larger than the world. Slice 4 changes all three — zoom 64, a 64-unit walled town, a frame showing about 13% of it — and re-derives this slice's whole pixel ladder in the process (slice 4 §3.9). So Checkpoint 1 answers one question honestly and cannot answer the other: **"is it still *rough*?"** — is the sampling fixed, do edges land on whole pixels, has the shimmer gone, are the scale relationships sane — is exactly what this slice fixes and exactly what the before/after pair shows. **"Is it a *place*?"** is not this checkpoint's question; it is Checkpoint 2's, at the end of slice 5, when the town and its contents exist.

Two consequences worth accepting deliberately rather than discovering: the castle is **still a tent** at Checkpoint 1 (slice 10 fixes it), and the nine white-on-black label pills are **still on screen** (slice 10 deletes them). Both are among the user's own complaints, both are the highest-contrast objects in their screenshots, and neither is answerable before slice 10 without doing the work twice. The checkpoint note should say so in one line, so the comparison is read for what it is.

---

## 1. Why — the complaints and the audit findings this answers

The verdict, verbatim, in the two clauses this slice owns:

> the world still looks pretty rough … its really, really rough in a bad way and needs to improve a LOT

And the implied one the user has not said yet but photographed:

> also the castle looks like a TeePee

The audit found the mechanical cause. Quoted from Appendix A, cluster *World art and legibility*:

> **"the world still looks pretty rough"** — _blocking, medium effort_
>
> Every world sprite is point-sampled at roughly a third to a fifth of its authored raster size, with NearestFilter and no mipmaps. Figures are drawn on a 64x64 SVG grid, rasterised at WORLD_SPRITE_SCALE (castle 8 -> 512px, building 6 -> 384px, foundation/decor 4 -> 256px), then displayed at CAMERA_ZOOM 40 on sprites 3 to 3.5 units wide = 120-140 CSS px. Measured minification: castle 4.27x, building 2.74x, foundation 2.13x, oak 5.33x, hero 3.60x. sprite-texture.ts sets magFilter AND minFilter to NearestFilter, so minification is raw point sampling with no mip chain. The result is that a 64-grid source pixel lands on 1.88 screen px (0.75 for an oak) -- a non-integer, so a 1-unit flag pole (world-figures.tsx:45 width={1}) is 1 px on one frame and 2 px on the next, and 3-px merlon teeth come out uneven. This is the mechanical cause of "rough": the pixel grid is destroyed at display time. Canvas dpr is also capped at [1,1.5] (realm-scene.tsx:394), so on a 2x display the browser then bilinearly upscales the point-sampled result.
>
> *Where:* `src/lib/realm/sprite-texture.ts:233-234, src/lib/realm/tile-texture.ts:77-78, src/components/realm/world-figures.tsx:13, src/lib/realm/camera.ts:50, src/components/realm/realm-scene.tsx:394`

> **"the world still looks pretty rough"** — _major, medium effort_
>
> The ground is one 32x32 tile, grassTile(7), repeated 3600 times. GRASS_REPEAT = (WORLD_SIZE*3)/2 = 60 across a 120-unit plane, so one 2x2-unit motif tiles the entire visible field. The tile itself has 6% tufts and 1.2% flowers, and the flower palette includes #ffffff -- white pixels on dark green, the highest-contrast pair in the frame, at roughly four per tile, repeating on an exact 2-unit grid. The eye locks onto the period instantly. The tile canvas is 128 px painted then displayed at ~80 CSS px per 2 units, minified with NearestFilter and no mipmaps, so the whole field shimmers and crawls whenever the camera follows the hero. The cobble path is worse: each path tile is its own 2x2 plane with repeat 1, so the 8-px stone pattern restarts at every tile boundary -- 15 visible seams down a 30-unit road.

> **implied — "scale relative to the hero sprite"** — _major, small effort_
>
> The scale relationships are wrong at every level. The hero sprite is 1.5 x 2 units. spriteSizeFor gives an oak or pine 1.2 x 1.6 units -- trees are SHORTER than the person walking past them -- and every other decoration (bush, rock, fence, lantern) 0.9 x 0.9, under half the hero's height. The fence figure draws a three-post span meant to be wide but is squashed into a 0.9 x 0.9 square. Buildings fare no better: BUILDING_SIZE is {w:3,d:3,h:2.5} for seven of the eight, so spriteSizeFor makes them a uniform 3.5 x 3.5 -- a Chapel, a Library and a Market Square are all the same 1.75-hero-heights-tall box with the same footprint, meaning the skyline is eight identical blobs and the villagers standing beside them are more than half as tall as their own buildings.

> **implied — buildings do not feel placed in the world** — _major, small effort_
>
> Billboards are anchored to the footprint CENTRE, but the collider covers the whole footprint plus the hero radius, so there is a two-unit invisible dead zone in front of every building. The sprite is positioned at [0, h/2, 0] inside a group at the prop centre; its painted ground line therefore projects roughly at the centre point. Meanwhile blocked() stops the hero at half-width + HERO_RADIUS = 1.95 units from that centre. Projected onto the screen, the near corner of a 3x3 footprint sits about 49 px below where the building's base is drawn -- so the child walks up to a chapel, is stopped about 50-65 px short of it, and nothing explains why. A second, smaller effect from the same anchoring: a billboard centred at y=h/2 has its bottom edge 0.092h BELOW the ground point … which is 0.87 units for the citadel and puts every sprite's baseline slightly out of register with its own footprint.

> **"the buildings are flat"** … (3) No grounding: there are no shadows anywhere in the scene … The only grounding is a baked strip `<rect x=4 y=56 width=56 height=4 fill="#24492e">` on every castle and building -- and #24492e is literally GRASS_COLORS[2], the tuft colour scattered through the grass texture, so it vanishes.

And the two from the "not complained about yet, but will be" list that this slice must clear before any later slice can draw:

> - dpr is capped at [1, 1.5] (realm-scene.tsx:394), so on a 2x display the browser bilinearly upscales the whole nearest-filtered scene — the exact opposite of what pixel art needs.
> - world-figures.test.tsx:56 asserts WORLD_SPRITE_SCALE deep-equals {castle:8, building:6, foundation:4, decor:4}, so any resolution fix must update that test; the rest of the art tests (assertInside on a 64x64 viewBox) will survive a redraw.

Finally the cost nobody had priced, which is why this slice is a hard prerequisite for the full village (decision 2, objection **(c)**):

> **PREREQUISITE, and the compound bill nobody costed:** SpriteSource performs ~34 rasterisations one `await` at a time and disposeSpriteTextures() runs on unmount, so the whole bill is re-paid on every return. Raising raster scale multiplies it — a citadel canvas goes from 512px to well over 1000px. Parallelise the awaits and keep the cache warm across a short round trip … before anything raises the texture budget.

One thing the audit did not say, which changes how this slice is judged: **`usePlayClock` is mounted in `RealmOpen` with `enabled: isChildView` and is not paused while textures load** (`realm-shell.tsx:240`, `use-play-clock.ts:103-124`). The `<RealmScene>` is rendered only once `textures` resolves (`realm-shell.tsx:490`). So the whole first-paint rasterisation bill is paid out of the child's metered minutes, every visit, today. The programme forbids pausing the clock anywhere except slice 9's opening banner, so the only legitimate fix is to make the bill small. That is this slice.

---

## 2. Decisions

| # | Decision | Chosen | Rejected, and why |
|---|---|---|---|
| D2.1 | How raster scale is set | One integer **`px`** per figure kind = *device pixels per authored art pixel at dpr 1*. Texture size, world size and anchor are all derived from it, so texel-per-device-pixel is **exactly 1** at both dpr buckets. | A fixed per-family `WORLD_SPRITE_SCALE`: it cannot be exact, because the display size is fixed by world height and zoom and the raster scale was chosen independently of both. |
| D2.2 | Which lever moves to make the ratio integral | The **sprite's world size**. The authored grids (64×64 world, 36×48 character) and `CAMERA_ZOOM` are held; every figure's world box is snapped to `px · grid / CAMERA_ZOOM`. | Re-authoring every grid (that is the slice-11 redraw) or changing `CAMERA_ZOOM` (slice 4 owns the only camera change in the programme). |
| D2.3 | dpr | Bucket to **1 or 2** from `window.devicePixelRatio`, read once per mount, shared by `<Canvas dpr>` and the rasteriser. A 3× phone renders at 2× and the browser upscales by 1.5 — capped deliberately, because 3× costs 2.25× the texels of 2×. | `[1, 1.5]`, which guarantees a fractional ratio and a bilinear upscale of point-sampled art. |
| D2.4 | Raster ordering | **`Promise.allSettled` over a declared manifest**, with an in-flight map so two callers of one key rasterise once. Only the hero is required; every other failure degrades exactly as it does today. | `Promise.all` — one bad decor SVG would fail the whole visit, which is worse than today's silent `continue`. |
| D2.5 | Cache lifetime | **Retain / release with a 90-second grace timer.** Leaving `/realm` schedules a dispose; coming back within 90 s cancels it and the return is warm. | Disposing on unmount (today): the full bill is re-paid on every round trip, out of the child's minutes. |
| D2.6 | Ground textures | Mipmaps on, `minFilter = LinearMipmapNearestFilter`, `magFilter = NearestFilter`, plus **anisotropy**, because the ground is foreshortened by `sin 35.26° = 0.577` and no isotropic mip level is right for it. Tile period doubled from 2 to **3.2 units**, `#ffffff` dropped from the flower palette, flower density halved per unit of area. | Leaving the tile at a 2-unit period: 3600 repeats of a motif on an exact grid is the field's dominant visual frequency. |
| D2.7 | The unbuilt plot | The foundation stops being a stretched 64×64 figure and becomes a **tiled ochre dirt texture**, 1:1 like the grass, covering the whole footprint. `FoundationFigure` is deleted. | Keeping one stretched figure across eight different footprints — it is the one texture that cannot be 1:1 for all of them, and the audit already calls its painted sign "a pale smudge in the grass". Standing content on the plot is slice 10. |
| D2.8 | Anchoring | `spriteMaterial.center = (0.5, (gridH − baselineRow)/gridH)`, sprite placed at the **ground point**; building sprites offset to the footprint's **near edge** (`z + d/2`). | `position=[0, h/2, 0]`, which puts every baseline 0.092·h below its own ground point and hides the collider. |
| D2.9 | Idle vs walk | Measured `moved = hypot(Δp)/dt` against a `lastPos` ref. Idle 0.02 @ 1.5 Hz; walking 0.08 @ 8 Hz with a ±0.035 rad alternating `material.rotation` step-lean; companion offset by π. All zero when `settings.motion` is false. | A single `sin(t·3)·0.05` for everything, which makes hero and companion pulse in lockstep and reads as floating. |
| D2.10 | The gallery | A **catalog-driven** dev route at `/dev/figures`, iterating `FIGURE_CATALOG`. Adding a figure to the catalog puts it in the gallery for free, which is what makes it the iteration tool for slices 5, 10 and 11 rather than a one-off page. | A hand-written page listing today's figures, which would be stale the first time slice 5 adds a prop. |
| D2.11 | Campsite size | The tent is **not** enlarged (`px 2` → a 3.2-unit box, drawn 1.9 units, essentially today's 3.0). | Applying the "never under 4 units" rule now, which would make "the castle looks like a TeePee" literally twice as true until slice 10 replaces the figure. Slice 10 raises it to `px 5` when it becomes a keep. |
| D2.12 | Schema | **None.** This slice stores nothing. | — |

---

## 3. Design

### 3.1 The pixel budget, stated once

The scene is an `OrthographicCamera` with `zoom = CAMERA_ZOOM = 40`, so **one world unit is exactly 40 CSS pixels** (the audit's own frame arithmetic — 1512 px / 40 = 37.8 units — confirms it). A billboard always faces the camera, so a sprite of world height `H` occupies `H · 40 · dpr` device pixels, whatever else is happening.

A figure authored on a grid `gh` units tall therefore puts one **art pixel** on

```
px = H · CAMERA_ZOOM · dpr / gh        device pixels
```

and that is the whole bug. `px` is 1.875 for a campsite, 2.19 for a building, 1.67 for the hero and 0.75 for an oak. Nothing downstream can repair a non-integer `px`; a nearest-filtered texture sampled at 0.75 loses a quarter of its rows, and which quarter changes as the sprite slides.

So we invert it. `px` becomes the **input** — one integer per figure kind — and everything else is derived:

```
world size    w = px · gw / CAMERA_ZOOM      h = px · gh / CAMERA_ZOOM
raster scale  s = px · dpr                   (texels per art pixel)
texture size  gw · s  ×  gh · s              texels  ==  the exact device-pixel footprint
```

Three consequences worth stating plainly:

1. **Texel-per-device-pixel is exactly 1 for every billboard at both dpr buckets.** There is no minification and no magnification, so `NearestFilter` never resamples. The only remaining error is sub-pixel sprite position, which is the normal pixel-art look and is stable frame to frame.
2. **Aspect is forced.** `w/h = gw/gh` always, so art pixels are square. Today they are not: a citadel is 11 × 9.5 units on a 64 × 64 grid (16 % horizontal stretch) and an oak is 1.2 × 1.6 (33 %).
3. **The ladder is quantised.** At `CAMERA_ZOOM 40` the step is `gh/40` — **1.6 units** on the 64-grid, **1.2 units** on the 36×48 character grid. Sizes off that lattice are illegal and a test says so.

`CAMERA_ZOOM` is slice 4's to change. When it does, `figure-catalog.test.ts` fails on every entry and `snapWorldHeight()` re-derives the ladder. That is the intended interface between the two slices, not an accident.

### 3.2 New pure module — `src/lib/realm/pixel-budget.ts`

No `three` import of any kind. `zoom` is a required parameter so this module never imports `camera.ts`.

```ts
export type DprBucket = 1 | 2;
export type Grid = { w: number; h: number };          // authored viewBox, in art pixels

/** ≥ 1.5 rounds up to 2; everything else is 1. A 3× screen renders at 2×. */
export function dprBucket(devicePixelRatio: number): DprBucket;

/** The world box a figure occupies: px · grid / zoom, on both axes. */
export function spriteWorldSize(grid: Grid, px: number, zoom: number): { w: number; h: number };

/** Texels per art pixel for this visit. Two call shapes, one implementation. */
export function rasterScale(px: number, dpr: DprBucket): number;
/**
 * The scale a figure of this world size must rasterise at to stay 1 texel per device pixel.
 * This is the name slices 5 and 11 call; it derives `px` from the quad rather than being handed it.
 * `rasterScaleFor({ w, h }, dpr) === rasterScale(pxForQuad({ w, h }), dpr)`.
 */
export function rasterScaleFor(quad: { w: number; h: number }, dpr: DprBucket): number;

/** The canvas to rasterise into — identical to the sprite's device-pixel footprint. */
export function textureSize(grid: Grid, px: number, dpr: DprBucket): { w: number; h: number };

/** Nearest legal world height to `units`, and the px that produces it. Never returns px < 1. */
export function snapWorldHeight(units: number, grid: Grid, zoom: number): { px: number; h: number };

/** True when a size is on the lattice and its aspect matches the grid. Tolerance 1e-9. */
export function isOnPixelGrid(size: { w: number; h: number }, grid: Grid, zoom: number): boolean;

/** spriteMaterial.center for a figure whose feet are drawn at row `baselineRow`. */
export function baseAnchor(grid: Grid, baselineRow: number): { x: number; y: number };

/** Texels a set of figures costs at one dpr bucket. */
export function rasterTexels(entries: { grid: Grid; px: number }[], dpr: DprBucket): number;

/** Ceiling the whole Realm must stay under at dpr 2. 6.0 M texels ≈ 24 MB RGBA. */
export const RASTER_BUDGET_TEXELS = 6_000_000;

/** Ground quads are sized in screen space too: worldUnits · zoom · dpr, rounded to an integer. */
export function groundTexturePx(worldUnits: number, zoom: number, dpr: DprBucket): number;
```

### 3.3 New pure module — `src/lib/realm/figure-catalog.ts`

The single table every drawn thing in the Realm comes from. Imports `CAMERA_ZOOM` from `camera.ts` (whose only import of `layout.ts` is `import type`, so there is no runtime cycle).

```ts
export type FigureFamily =
  | "person" | "keep" | "building" | "landmark" | "ground" | "prop" | "trouble" | "occasion" | "village" | "sign";
// "landmark" is here from the start so slice 6's Tavern is a catalog row and not a hand-tuned
// branch inside spriteSizeFor. See "The catalog is the only registry" below.
export type FigureAnchor = "base" | "centre";

export type FigureEntry = {
  key: string;              // cache key and gallery id, e.g. "building:chapel"
  family: FigureFamily;
  label: string;            // gallery only; never read by a child
  grid: Grid;               // authored viewBox
  px: number;               // device pixels per art pixel at dpr 1
  topRow: number;           // highest drawn row, measured from the figure
  baselineRow: number;      // the row the figure's feet stand on
  anchor: FigureAnchor;     // "base" puts baselineRow on the ground point
};

export const FIGURE_CATALOG: readonly FigureEntry[];

export function figureEntry(key: string): FigureEntry | undefined;
export function figureSize(key: string): { w: number; h: number };            // world units
export function figureAnchorPoint(key: string): { x: number; y: number };     // spriteMaterial.center
export function figureDrawnHeight(key: string): number;                       // world units, top to baseline
export function figureCanvasFill(key: string): number;                        // 0..1 — how much of the grid is used
export function figureKeyFor(prop: Prop): string | null;                      // layout Prop → catalog key
export function figureManifest(input: ManifestInput): readonly FigureEntry[]; // what one visit rasterises
export function manifestTexels(input: ManifestInput, dpr: DprBucket): number;

/** Registration for figures introduced after this slice. The catalog is append-only. */
export function registerFigures(entries: readonly FigureEntry[]): void;  // module-load time only, from the owning slice's module

export type ManifestInput = {
  castleType: string;
  villagerIds: readonly string[];
  troubleSkin: TroubleSkin | null;
  mountId: string | null;
  crownId: string | null;
  castleBanner: boolean;
  decor: boolean;
  recess: boolean;
  companion: boolean;
};

/** The drawn height of the hero, boot to hair: 1.9 units. The programme's "2-unit hero", as an exact number. */
export const HERO_DRAWN_HEIGHT = 1.9;
```

**The catalog is the only registry, and it is append-only.** Five later slices introduce figures this slice does not know about: slice 5's twenty-two prop kinds and eight district signs, slice 6's Tavern, slice 7's hitching post, slice 10's keep stages, plot stages and signboards, slice 11's keep pieces, and slice 12's arch and lit post. **Every one of them adds a `FigureEntry` row** — via `registerFigures` from its own module at load time, or by editing `FIGURE_CATALOG` directly where the figure is part of the base set — and **none of them adds a case to `spriteSizeFor`, a size table of its own, or a texture key outside `family:id`**. Three consequences, and they are the reason this module is worth building at all:

1. A new figure is in `/dev/figures` the moment it is registered, at its true display size against real grass, in both palettes. That is what makes the gallery an iteration tool for slices 5, 10, 11 and 12 rather than a one-off page.
2. A new figure is counted against `RASTER_BUDGET_TEXELS` automatically, and is rasterised in the same parallel batch as everything else rather than in a private `await`.
3. `isOnPixelGrid` runs over it, so a figure authored off the lattice fails the build instead of shipping soft.

`figureManifest`'s `ManifestInput` gains one optional field per later slice (`villageProps?`, `districtSigns?`, `keepStage?`, `courseArch?` …) — additive only, defaulting to absent, so a manifest written today still compiles. The `village` and `sign` families ship empty in this slice **with named owners**: slice 5 fills `village` (its twenty-two prop kinds) and `sign` (its eight district signs); slice 10 adds to `sign` (its nine building signboards). An empty family with no owner would be a placeholder; these have owners.

**Texture-key spelling is `family:id`, everywhere, for the life of the programme.** `building:chapel`, `castle:keep`, `decor:oak`, `landmark:tavern`, `prop:hitch`, `prop:post`, `prop:post-lit`, `prop:arch`, `sign:gate-quarter`, `keep:gatehouse:slate`. A bare key (`post`), a double-prefixed key (`world:post`) or a family invented at the call site is a test failure: `figure-catalog.test.ts` asserts every key in `SpriteTextures.world` matches `/^[a-z]+:[a-z0-9-]+(:[a-z0-9-]+)?$/` and resolves to a catalog entry.

### 3.4 The ladder, held

`gh/CAMERA_ZOOM` = **1.6** on the 64-grid, **1.2** on the 36×48 grid. "Drawn" is the figure's real height today — the box minus the empty rows the current art leaves. Slice 11's acceptance criterion is that `topRow ≤ 4` for every building, which converges drawn onto box.

**People and occasions** — grid 36 × 48, box `0.9·px × 1.2·px`:

| key | px | box (w × h) | top | base | drawn | anchor |
|---|---|---|---|---|---|---|
| `hero` | 2 | 1.8 × 2.4 | 8 | 46 | **1.90** | base |
| `hero:mounted` | 2 | 1.8 × 2.4 | 0 | 38 | 1.90 | base, at saddle y = 1.05 |
| `villager:<id>` ×8 | 2 | 1.8 × 2.4 | 8 | 46 | 1.90 | base |
| `mount:<id>` | 2 | 1.8 × 2.4 | 18 | 46 | 1.40 | base |
| `companion` | 2 | 1.8 × 2.4 | 36 | 45 | 0.45 | base |
| `trouble:<kind>:<skin>` ×3 | 2 | 1.8 × 2.4 | 14 | 40 | 1.30 | centre |
| `banner` | 2 | 1.8 × 2.4 | 6 | 46 | 2.00 | base |
| `gleam` | 1 | 0.9 × 1.2 | 10 | 38 | 0.70 | centre |
| `crown:<id>` | 1 | 0.9 × 1.2 | 9 | 35 | 0.65 | centre |
| `castle-banner` | 1 | 0.9 × 1.2 | 10 | 30 | 0.50 | centre |

**The keep** — grid 64 × 64, box `1.6·px` square:

| key | px | box | top | base | drawn |
|---|---|---|---|---|---|
| `castle:campsite` | 2 | 3.2 | 18 | 56 | 1.90 |
| `castle:cottage` | 3 | 4.8 | 10 | 56 | 3.45 |
| `castle:watchtower` | 5 | 8.0 | 2 | 56 | 6.75 |
| `castle:keep` | 5 | 8.0 | 6 | 56 | 6.25 |
| `castle:manor` | 5 | 8.0 | 8 | 56 | 6.00 |
| `castle:castle` | 6 | 9.6 | 4 | 56 | 7.80 |
| `castle:fortress` | 7 | 11.2 | 0 | 56 | 9.80 |
| `castle:citadel` | 8 | 12.8 | 2 | 56 | 10.80 |

**Kingdom buildings** — grid 64 × 64:

| key | px | box | top | base | drawn | ladder target |
|---|---|---|---|---|---|---|
| `building:well` | 2 | 3.2 | 10 | 56 | 2.30 | small |
| `building:garden` | 2 | 3.2 | 16 | 56 | 2.00 | low, wide |
| `building:bridge` | 3 | 4.8 | 24 | 56 | 2.40 | low, wide |
| `building:market` | 3 | 4.8 | 26 | 56 | 2.25 | cottage-class 4 |
| `building:library` | 3 | 4.8 | 14 | 56 | 3.15 | library 5 |
| `building:mill` | 4 | 6.4 | 4 | 56 | 5.20 | tall, sails |
| `building:chapel` | 4 | 6.4 | 2 | 56 | 5.40 | chapel 6, tower to 8 |
| `building:watchtower` | 6 | 9.6 | 8 | 56 | 7.20 | watchtower 9 |

**Trees and props** — grid 64 × 64:

| key | px | box | top | base | drawn | ladder target |
|---|---|---|---|---|---|---|
| `decor:bush` | 2 | 3.2 | 34 | 58 | 1.20 | bush 1 |
| `decor:rock` | 2 | 3.2 | 30 | 58 | 1.40 | — |
| `decor:fence` | 2 | 3.2 | 22 | 56 | 1.70 tall, **2.80 wide** | fence 1.2 × 2.4 wide |
| `decor:lantern` | 2 | 3.2 | 8 | 60 | 2.60 | lantern 2.5 |
| `decor:oak` | 4 | 6.4 | 10 | 58 | 4.80 | oak 5 |
| `decor:pine` | 4 | 6.4 | 4 | 58 | 5.40 | pine 6 |

Trees are now taller than the person walking past them, which is the point.

### 3.5 Per-building heights

`BUILDING_SIZE = { w: 3, d: 3, h: 2.5 }` (`layout.ts:69`) stops being one box for seven of eight buildings. **This slice owns the height ladder and nothing else about a building's footprint.**

```ts
// src/lib/realm/figure-catalog.ts
export const BUILDING_HEIGHTS: Record<string, number> = {
  well: 3.0, mill: 6.0, bridge: 2.5, chapel: 6.0,
  market: 3.0, library: 4.5, watchtower: 9.0, garden: 2.0,
  tavern: 7.0,   // slice 6's inn; its plot is slice 4's, its height is part of this ladder
};
```

**Why heights only.** `w` and `d` are a *town-plan* fact — they are the collider, the road clearance, the door point, the villager stand and the sign position, and every one of those is computed against the street grid. Slice 4 sites nine plots on that grid and publishes `BUILDING_FOOTPRINTS: Record<string, { w, d, h }>` in `village.ts`, composing `h` from this ladder. **There is exactly one footprint table in the programme and it is slice 4's.** This slice publishes no `BUILDING_FOOTPRINTS` and `layout.ts` gains none; `buildingFootprint(id)` moves to `village.ts` with the table.

Until slice 4 lands (two slices), `buildingFootprint(id)` keeps today's `BUILDING_SIZE`/`WATCHTOWER_SIZE` `w`/`d` and takes its `h` from the ladder above. That is a **two-slice interim, not a fallback branch**: slice 4 deletes it when it takes the table.

The height ladder against the 2-unit hero is the whole point — a Chapel at 6.0, a Watchtower at 9.0 and a Royal Garden at 2.0 stop being the same 2.5-unit box, and the skyline stops being eight identical blobs.

Grown by `HERO_RADIUS` these do not overlap each other, do not enter the path corridor `|x| ≤ 1`, and do not add a crossing to the recess lap ring (§5, §7). The eight silhouettes now differ in mass and not only in paint, and `villagerPosition(slot, footprint)` moves each villager out to its own building's depth for free.

### 3.6 Anchoring, and the dead zone

```tsx
<group position={[prop.position.x, 0, prop.position.z + prop.size.d / 2]}>
  <sprite position={[0, bob, 0]} scale={[size.w, size.h, 1]}>
    <spriteMaterial map={texture} color={tint} transparent alphaTest={0.1}
                    center-x={anchor.x} center-y={anchor.y} />
  </sprite>
</group>
```

`center-x` / `center-y` are r3f's dashed property form, so `realm-scene.tsx` needs no new `three` value import. For a world figure with `baselineRow = 56` on a 64-grid, `center.y = 8/64 = 0.125`; for a character at row 46 of 48, `0.0417`.

Two things fall out. The sprite's painted ground line now lands on its own ground point, so slice 1's contact shadow sits under the feet rather than 0.09·h out of register. And placing building sprites at the footprint's near edge `z + d/2` moves the drawn wall to where `blocked()` actually stops the hero (`half-width + HERO_RADIUS`), which gives the invisible dead zone a visible cause. The residual gap is `HERO_RADIUS = 0.45` units — 18 CSS px — instead of ~2 units.

Every `SPRITE_H / 2` y-position in the scene becomes the ground point: `realm-scene.tsx:141` and `:145` (ceremony villager writes), `:187` (hero), `:197` (companion), `:337` (villager sprites), `recess-layer.tsx:49` (the start banner). `SPRITE_W` / `SPRITE_H` at `realm-scene.tsx:50-51` are deleted; sizes come from `figureSize()`. The horizontal flip keeps working — it is `scale.x = ±w`.

`CROWN_LOW = 1.9` (`ceremony.ts:31`) is the height the ceremony crown descends to. The hero's drawn height was 1.583 units, so the crown has been stopping 0.32 units above the child's hair for the whole season-end ceremony. At `HERO_DRAWN_HEIGHT = 1.9` it lands on the head. No code change; the number was right and the hero was wrong.

### 3.7 The baked shadow

Delete `<rect x={4} y={56} width={56} height={4} fill="#24492e" />` from `CastleFigure` (`world-figures.tsx:185`) and `BuildingFigure` (`:309`). `#24492e` is `GRASS_COLORS[2]`, so it is the tuft colour scattered through the field it is supposed to sit on, and it is a horizontal bar under an isometric prop. Slice 1's contact shadow replaces it with a footprint diamond. A test asserts no figure in `world-figures.tsx` contains that fill.

### 3.8 Ground textures

```ts
export const TILE_WORLD = 3.2;   // world units one tile spans — on the pixel lattice (px 2, grid 64)
export const TILE_CELLS = 64;    // cells across a tile
```

At `CAMERA_ZOOM 40` that is a **128 px canvas at dpr 1, 256 px at dpr 2** — power-of-two, 1:1 with the screen, 2 device px per cell at dpr 1. `tileToTexture(tile, pixel)` takes its `pixel` from `groundTexturePx(TILE_WORLD, zoom, dpr) / TILE_CELLS`, sets `generateMipmaps = true`, `minFilter = LinearMipmapNearestFilter`, `magFilter = NearestFilter`, and `anisotropy = min(8, maxAnisotropy)`. Magnified pixels stay hard; the ground stops crawling when the camera follows the hero. Anisotropy matters more than the mip chain here: the ground is compressed by `sin 35.26° = 0.577` along one screen axis, so an isotropic mip level is always wrong for one of the two.

`GRASS_REPEAT` becomes `(WORLD_SIZE * 3) / TILE_WORLD = 37.5`. Fractional repeat is correct — the tile size on the ground is exactly 3.2 units everywhere and the only seam is at the plane edge, 60 units outside the frame. **The divisor is `TILE_WORLD`, never a literal.** Slice 4 changes the ground plane to `GROUND_SIZE` (88) and must write `GROUND_SIZE / TILE_WORLD` = 27.5; `tiles.test.ts` gains `GRASS_REPEAT * TILE_WORLD === <ground plane size>` so no later world-size change can revert the tile period by arithmetic.

Palette, in `tiles.ts`:

```ts
export const GRASS_COLORS = ["#2e5a3a", "#33633f", "#24492e", "#fde68a", "#f9a8d4"];  // #ffffff gone
const FLOWER_RATE = 0.004;   // was 0.012
export const DIRT_COLORS = ["#8a7a55", "#7d6e4b", "#9c8a62", "#6f6142"];
export function dirtTile(seed: number, size?: number): Tile;
```

White on dark green was the highest-contrast pair in the frame at roughly four per tile on an exact 2-unit grid. It is gone, the flower rate is a third of what it was, and the tile period doubles from 2 units to 3.2 — so the field's dominant repeat frequency drops by 38 % and its highest-contrast noise disappears. Breaking the period properly — variants, an atlas, dirt around sites, a mown plaza — is slice 5.

**The road, interim.** Each path quad keeps its own 2 × 2 plane but now clones the cobble texture and sets `repeat = (2/3.2, 2/3.2)` with `offset = (x/3.2, z/3.2)` from the quad's world position. Because the texture wraps, adjacent quads continue the same stone pattern and the 15 restarts down the road disappear. Fifteen `texture.clone()` calls share one image and cost one extra upload each. The real fix — one continuous strip mesh with UV repeat proportional to length — is slice 4, which is rebuilding the road anyway.

**The plot.** The foundation quad drops `FoundationFigure` and takes the dirt tile with `repeat = (w/3.2, d/3.2)` and a world-derived offset, so it is 1:1 for every one of the eight footprints and the dirt covers the whole plot instead of the middle 60 % of a stretched canvas. The ochre `#8a7a55` separates from `#2e5a3a` grass in hue as well as value, which the grey `#6b665a` never did. Under `calmPalette` the tint multiply `CALM_TINT #a9aaa4` already mutes it; `CALM_FOUNDATION` is deleted with the figure. Scaffold poles, rising stone and a real signboard are slice 10.

### 3.9 Rasterisation: parallel, deduplicated, and warm

**`src/lib/realm/sprite-texture.ts`** keeps `spriteKey` and `svgElementToTexture` and gains:

```ts
export const TEXTURE_GRACE_MS = 90_000;

/** Cache key. The scale is part of it: a dpr-1 texture is the wrong texture at dpr 2. */
export function textureCacheKey(logicalKey: string, scale: number): string;

/** Shares one rasterisation between concurrent callers of the same key. */
export function textureOnce(key: string, make: () => Promise<CanvasTexture>): Promise<CanvasTexture>;

export function retainSpriteTextures(): void;                       // cancels a pending dispose
export function releaseSpriteTextures(delayMs?: number): void;      // schedules one
export function disposeSpriteTextures(): void;                      // immediate; tests and hard exits
export function spriteCacheStats(): { entries: number; texels: number };
```

`realm-shell.tsx:110` changes from `useEffect(() => () => disposeSpriteTextures(), [])` to `useEffect(() => { retainSpriteTextures(); return () => releaseSpriteTextures(); }, [])`. Walking to the Tavern and back inside 90 seconds is free. The cost is up to 12.8 MB of GPU memory held for 90 seconds after the child leaves, which is stated here so nobody rediscovers it as a leak.

**`SpriteSource`** stops hand-listing figures. It renders `figureManifest(...)` and rasterises it with `Promise.allSettled`, so the 37 decodes overlap instead of queueing behind one another. Only `hero` is required; any other rejection leaves that key out of `SpriteTextures` and the scene degrades exactly as it does today (a missing villager texture returns `null` at `realm-scene.tsx:329`; a missing decor returns `null` at `:315`; a missing building falls back to the box at `:317`). `onReady` gains a second argument:

```ts
onReady: (textures: SpriteTextures, stats: { ms: number; entries: number; texels: number; fromCache: number }) => void
```

which `realm-shell` logs under `process.env.NODE_ENV !== "production"` as `console.info("[realm] sprites", stats)`. That is the number Checkpoint 1 records.

**dpr.** `realm-shell` resolves `const [dpr] = useState(() => dprBucket(window.devicePixelRatio))` — a number, so it is referentially stable and safe to pass into the memoised `World`. It goes to `<Canvas dpr={dpr}>` (replacing `[1, 1.5]` at `realm-scene.tsx:394`) and into `figureManifest`. A `matchMedia("(resolution: 1dppx)")` listener bumps a `dprKey` when the window moves between screens; that re-keys `SpriteSource`, disposes the cache and re-rasterises once.

### 3.10 The bill

Texels, computed from the tables above, for a default child visit (one castle tier, eight buildings, six decor kinds, eight villagers, three troubles, mount, companion, gleam, banner, crown, castle banner, three ground tiles) — **37 rasterisations, the same count as today**:

| | today | new, dpr 1 | new, dpr 2 |
|---|---|---|---|
| people and occasions (19) | 1.18 M | 0.12 M | 0.46 M |
| keep (1 tier) | 0.26 M | 0.02 M | 0.07 M |
| buildings (8) | 1.18 M | 0.42 M | 1.69 M |
| plot | 0.07 M | — (tiled) | — |
| props (6) | 0.39 M | 0.20 M | 0.79 M |
| ground tiles (3) | 0.03 M | 0.05 M | 0.20 M |
| **total** | **3.12 M** | **0.80 M** | **3.20 M** |

Today's 3.12 M is fixed whatever the screen. The new bill is **74 % smaller at 1×** and **3 % larger at 2×** — and every texel of it is a device pixel that is actually on screen, instead of three quarters of it being thrown away by a point-sampled minification.

`RASTER_BUDGET_TEXELS = 6_000_000` at dpr 2 leaves **2.80 M of headroom**. The allowance the later slices spend it against, at dpr 2: a `px 2` world kind costs 0.066 M, a `px 3` kind 0.147 M, a `px 4` kind 0.262 M. Slice 5's "dozens of props" fits comfortably as ≤ 20 new kinds with at most four above `px 2` (≈ 2.10 M). **Instances are free — kinds are billed**, because `sprite-texture.ts` caches by key, so thirty bushes cost one bush.

### 3.11 Idle versus walk

In `useFrame`, against a `lastPos` ref:

```
moved   = hypot(p.x - last.x, p.z - last.z) / dt          // units per second
walking = moved > 0.4
amp     = settings.motion ? (walking ? 0.08 : 0.02) : 0
freq    = walking ? 8 : 1.5                                // Hz
phase   = 0 for the hero, Math.PI for the companion
bob     = amp * Math.sin(state.clock.elapsedTime * freq * 2π + phase)
lean    = settings.motion && walking ? Math.sign(sin(...)) * 0.035 : 0   // radians, on material.rotation
```

The companion's π offset breaks the lockstep that is itself part of why the pair reads as floating. `lastPos` is written inside `useFrame`, never during render, so the React Compiler's render-time-ref-write rule is respected. With `settings.motion` false every term is exactly zero — no bob, no lean, no residual drift.

### 3.12 The gallery — `/dev/figures`

`src/app/dev/figures/page.tsx` is a server component that calls `notFound()` when `process.env.NODE_ENV === "production"`, then renders the client component `src/components/realm/figure-gallery.tsx`. It sits outside the `(app)` route group, so no game chrome, no bottom nav, and **no play clock** — opening it costs a child nothing because no child opens it. It imports no `three`: it paints the real grass and dirt tiles with a plain 2D canvas from `tiles.ts`, and renders each figure as its own SVG component at `px · gw` × `px · gh` **CSS** pixels with `image-rendering: pixelated`, which is exactly the size and sampling the scene gives it.

It iterates `FIGURE_CATALOG`, so slices 5, 10 and 11 get their new art on this page by adding a catalog row. The `village` and `sign` families are already in the type and render an honest empty state until then.

Copy, verbatim:

- Page title and `<h1>`: **"Figure gallery"**
- Standfirst: **"Every figure in the Realm, drawn at the exact size it appears on screen. This page is a tool for building the world — it is not part of the game."**
- Controls legend: **"Palette"**, radios **"Bright"** and **"Calm"**
- Checkbox: **"Show the ruler"**
- Checkbox: **"Show the canvas edge"**
- Screen readout: **"Drawing for a 1× screen."** / **"Drawing for a 2× screen."**
- Section headings, in order: **"People"**, **"The keep"**, **"Kingdom buildings"**, **"Ground"**, **"Trees and props"**, **"Troubles"**, **"Recess and ceremony"**, **"Village props"**, **"District signs"**
- Empty state, village: **"Nothing here yet. Village props arrive with the village."**
- Empty state, signs: **"Nothing here yet. District signs arrive with the signboards."**
- Ruler label: **"The hero — 1.9 units"**
- Card footnote, one line, e.g.: **"6.4 units tall · draws 5.4 · 256 × 256 at 1×"**
- Canvas-fill warning, shown when `figureCanvasFill(key) < 0.6`: **"Uses 47% of its canvas — the redraw should fill it."** (the number is computed)
- Bill line at the foot: **"37 figures · 0.80 M texels at 1× · 3.20 M at 2× · budget 6.00 M"**
- Over budget: **"Over budget. Trim a figure or lower a budget before this ships."**
- Ground section note: **"Grass and dirt tile every 3.2 units. One tile is shown four times so the repeat is visible."**

New CSS, appended to the Realm block in `globals.css`: `.figgal`, `.figgal-controls`, `.figgal-section`, `.figgal-grid`, `.figgal-card`, `.figgal-card--calm`, `.figgal-figure`, `.figgal-edge`, `.figgal-ruler`, `.figgal-note`, `.figgal-warn`, `.figgal-bill`.

---

## 4. Data model

**No schema change. No migration. Nothing is stored.**

Migration numbering for the programme, so nobody collides: the last shipped migration is `0025`. Slice 1 `first-impression` takes **0026** for `depth_override`. This slice reserves nothing, so the next slice that needs one — slice 3 `ability-bar-and-mount-slot` — takes **0027**.

Existing rows are untouched, and nothing this slice changes alters what a stored value *means*, so no one-time message to a child is owed.

The only persistent state involved is the browser's GPU texture memory, which is now held for `TEXTURE_GRACE_MS = 90_000` after the child leaves `/realm` instead of being freed on unmount. Worst case 12.8 MB at dpr 2; freed on the timer, on a reload, and on a dpr change.

---

## 5. Errors and edge cases

| Case | What happens |
|---|---|
| One figure's SVG fails to rasterise | `Promise.allSettled` isolates it. Its key is absent from `SpriteTextures` and the scene's existing null paths run: a villager is skipped (`realm-scene.tsx:329`), a decor is skipped (`:315`), a building or castle falls back to the coloured box (`:317`). Unchanged from today. |
| The **hero** fails to rasterise | The only required entry. `onError` fires with the existing copy — **"The hero's picture could not be drawn."** — and the shell's existing retry (`retryKey`) is offered. Unchanged from today. |
| Two callers want the same key at once | `textureOnce` returns the same in-flight promise; one rasterisation, two references. |
| The window moves to a different-dpr screen mid-visit | `matchMedia` fires, the cache is disposed, `SpriteSource` re-keys and re-rasterises once. Cost is a warm-path pass, measured at Checkpoint 1 against a ≤ 300 ms budget. The clock keeps running, because it runs everywhere except slice 9's banner. |
| `devicePixelRatio` is 3 (a high-end phone) | Bucketed to 2. The browser upscales a crisp 2× render by 1.5. Deliberate: 3× costs 2.25× the texels of 2× for a difference no child will name. |
| `devicePixelRatio` is 1.25 or 1.5 (Windows scaling) | Bucketed: 1.25 → 1, 1.5 → 2. The fractional case that guaranteed a non-integer ratio no longer exists. |
| A figure key is not in the catalog | `figureSize` returns the documented fallback `{ w: 1.8, h: 2.4 }` rather than throwing into a render. `figure-catalog.test.ts` asserts every key the scene can produce is present, so this path is a test failure, not a runtime surprise. |
| `CAMERA_ZOOM` changes (slice 4) | Every catalog entry is off the lattice and `figure-catalog.test.ts` fails loudly. `snapWorldHeight()` re-derives the ladder, and **slice 4 §3.9 is where that is done and re-costed** — it is on slice 4's test list, not left red for slice 5 to find. This is the designed handoff. |
| A hero standing where a foundation becomes a building | `unstickHero` already runs on every `layout.colliders` change (`realm-scene.tsx:100-102`). The larger footprints make this more likely, so §7 adds a test that it resolves from every site centre and every villager stand point, for the 0-built and 8-built layouts. |
| Troubles spawning into a larger plot | `spawnTroubles` places at a fixed `3 + rng()*2` units from the site centre (`troubles.ts:93-94`), which is inside a 6 × 5 plot. The ring becomes `siteClearance(site) + rng() * 2`, where `siteClearance = hypot(w, d)/2 + TROUBLE_RADIUS + 0.5`, so a trouble can never spawn on the plot it belongs to and every site still gets one. |
| Gleams starving on a denser world | Obstacle area rises from ~191 to ~293 of 1296 usable units², so open ground falls from 85 % to 77 %. With 20 rejection attempts the failure probability per slot is 0.23²⁰ ≈ 10⁻¹³. Safe now; slice 4 replaces rejection sampling with `open-ground.ts` `SPAWN_ZONES` before the village makes it marginal. |
| The recess lap ring | Two segments already clip a collider today — the garden at (9, −13) and the watchtower at (−9, −12). The new footprints must not add a third; `crossingsOf(LAP_WAYPOINTS, colliders, HERO_RADIUS)` is asserted against the recorded fixture `["garden", "watchtower"]`. Slice 12 moves the ring onto the road and clears both. |
| The ceremony walk | Villagers path with `stepHero`, which slides along colliders, under `WALK_TIMEOUT_MS = 20_000`. Larger footprints lengthen the worst walk, so §7 simulates the whole gather to completion and asserts it finishes inside the timeout. |
| Parent preview (`isChildView: false`) | `figureManifest` receives `recess: false` and `crownId: null` exactly as `SpriteSource` does today, so a parent's visit rasterises four kinds fewer and paints faster. Nothing in this slice reads `mana`, `cleared`, `ride` or `minutes`, so there is nothing to null. The gallery renders `DEFAULT_AVATAR` and never a real child. |

---

## 6. Accessibility

**The complexity axis (decision 7).** The pixel budget is a property of rendering, not a surface, and it is identical at simple and full depth. This slice adds **no** surface that consumes `surfacesFor(depth, profile)` and invents no rule of its own — it is saying so explicitly rather than leaving the question open. The gallery is a developer tool behind a `NODE_ENV` check and is not a child surface at any depth. Nothing here is a removal at simple depth, because nothing here is depth-conditional.

**Per learning-profile setting:**

- **reducedMotion** — idle bob, walk bob and step-lean are all exactly zero; the hero, companion and mount sit still on the ground. No information is lost: "am I moving" is carried by the change in position and by slice 1's ground ring, and the bob has never carried information. Camera easing already snaps (`followCamera`, `camera.ts:10`).
- **lowStimulus** — implies `motion: false` through `renderSettingsFor`. The `CALM_TINT #a9aaa4` multiply on every sprite and the calm ground colour are preserved. The new ochre plot is muted by the same multiply rather than replaced by the old near-black `CALM_FOUNDATION`, so a low-stimulus child now gets a plot they can actually see. **`realm-shell.tsx:215,223` still passes `decor: !settings.calmPalette`, so a low-stimulus child still gets no trees.** That is the wrong shape — calm should mute, not empty — and it is slice 5 `village-life`'s to fix. The manifest keeps the flag so slice 5 can flip it; the 0.79 M texels (dpr 2) of the six decor kinds are already inside the bill in §3.10, so flipping it costs slice 5 nothing it has not been given.
- **largerText** — no text is added to the world. The gallery uses app typography and inherits `data-larger-text` from the app shell.
- **fewerChoices** — no choice is added to any child surface. The gallery's three controls are developer controls. The invariants (`trackedObjectives` capped at 1, `abilitySlots` at `"earned"`) are untouched at both depths because this slice owns neither.
- **readAloud** — nothing here speaks, and nothing here is speakable. No `speak()` call is added or removed.
- **inputMode** — no input path changes. The gallery is fully keyboard-operable: radios and checkboxes only, in DOM order, no custom hit targets, no drag.
- **soundEnabled** — silent. The feedback channel the settings page promises is slice 9.
- **extraSpacing / readingFont** — inherited by the gallery through the app shell's `readingAttributes`; not applicable to the world.

**Legibility gains that are accessibility gains.** Crisp integer-scaled art is easier to parse for a child with low vision or a visual-processing difference than the same art with edges that shimmer between one and two pixels. Removing white flowers removes the highest-contrast, highest-frequency noise in the frame, which is the pattern most likely to pull a distractible eye off the objective. Trees taller than the hero give the scene a size reference a six-year-old can use without reading anything.

---

## 7. Testing

### Unit-testable, in Vitest, with no `three` at module load

**`src/lib/realm/pixel-budget.test.ts`**
- `dprBucket`: 1 → 1, 1.25 → 1, 1.49 → 1, 1.5 → 2, 2 → 2, 3 → 2.
- `spriteWorldSize({w:64,h:64}, 4, 40)` → `{ w: 6.4, h: 6.4 }`; `({w:36,h:48}, 2, 40)` → `{ w: 1.8, h: 2.4 }`.
- `textureSize` equals the device-pixel footprint: `textureSize(grid, px, dpr).h === spriteWorldSize(grid, px, 40).h * 40 * dpr` for every catalog entry at both buckets. This is the slice's central claim, asserted directly.
- `isOnPixelGrid` **rejects** today's sizes — `{1.5, 2}`, `{1.2, 1.6}`, `{0.9, 0.9}`, `{3.5, 3.5}`, `{1.4, 1.8}`, `{1.2, 1.2}`, `{0.9, 0.7}` — and accepts every new one.
- `snapWorldHeight(5, {w:64,h:64}, 40)` → `{ px: 3, h: 4.8 }`; never returns `px < 1`.
- `baseAnchor({w:64,h:64}, 56)` → `{ x: 0.5, y: 0.125 }`.

**`src/lib/realm/figure-catalog.test.ts`**
- Every entry is on the lattice at `CAMERA_ZOOM`, and every aspect equals its grid aspect.
- Keys are unique; every `px` is a positive integer.
- `manifestTexels(defaultVisit, 2) <= RASTER_BUDGET_TEXELS`, and the exact value is asserted (3.20 M) so any later slice's addition shows up as a deliberate number change in a diff.
- `figureManifest(defaultVisit)` has 37 entries; the parent-preview manifest has 33.
- `figureKeyFor` returns a key for every `PropKind` the scene draws as a sprite and `null` for `path`, `villager`, `banner` and `foundation`.
- `HERO_DRAWN_HEIGHT` equals `figureDrawnHeight("hero")`.

**`src/components/realm/world-figures.test.tsx`** — the existing `assertInside` suite stays; the `WORLD_SPRITE_SCALE` deep-assert at line 74 is deleted in the same commit as the constant.
- New: for every figure, the measured lowest and highest drawn coordinate equals the catalog's `baselineRow` / `topRow` within ±1 unit (the tolerance covers stroke width on the `<path>` figures, whose extents are read as coordinate pairs out of the `d` attribute).
- New: no figure's markup contains `#24492e`.

**`src/lib/realm/tiles.test.ts`**
- `GRASS_COLORS` does not contain `"#ffffff"`.
- Flower cells are under 0.5 % of a 64-cell tile.
- `grassTile(7, 64)` is 64 × 64 and deterministic; `cobbleTile(11, 64)` keeps mortar every 8 cells; `dirtTile(3, 64)` is deterministic and drawn only from `DIRT_COLORS`.

**`src/lib/realm/clearance.test.ts`** (new module, §8)
- Every id in `BUILDING_HEIGHTS` is a real building id (the eight, plus `tavern`), and every height is on the pixel lattice at the current `CAMERA_ZOOM`. Non-overlap of footprints is slice 4's test, over slice 4's table.
- No grown footprint enters the path corridor `|x| ≤ 1 + HERO_RADIUS`.
- Every `LAP_WAYPOINT` clears every collider by `HERO_RADIUS + 0.5`.
- `crossingsOf(LAP_WAYPOINTS, colliders, HERO_RADIUS)` equals the recorded fixture `["garden", "watchtower"]` — pre-existing, handed to slice 12, and now guarded so nothing adds a third.
- `unstickHero` resolves a hero placed at every site centre and every villager stand point, for the 0-built and 8-built layouts, and the resolved point is inside no collider.

**`src/lib/realm/ceremony/ceremony.test.ts`** — new case: step the ceremony at `dt = 1/60` on the 8-built layout with the new footprints and assert `gather` completes in under `WALK_TIMEOUT_MS`.

**`src/lib/realm/spells/troubles.test.ts`** — new cases: a trouble never spawns inside its own site's footprint; every unfinished site still receives one across 50 seeds on both the 0-built and 4-built layouts.

**`src/lib/realm/recess/recess.test.ts`** — new case: every gleam slot fills within its 20 attempts across 50 seeds with the new footprints.

**`src/lib/realm/sprite-texture.test.ts`** — new cases: `textureCacheKey` includes the scale so dpr 1 and dpr 2 never collide; `textureOnce` rasterises once for two concurrent callers; `releaseSpriteTextures` disposes after the grace period and `retainSpriteTextures` cancels a pending dispose; `spriteCacheStats` counts texels.

### Only the browser can judge these

`realm-scene.tsx`, the `*-layer.tsx` files and `figure-gallery.tsx` are not unit-testable — jsdom has no WebGL and no canvas rasteriser. The browser pass, on the documented local setup (find the running dev server by cwd and title; do not trust a port number):

1. **Crispness.** `/dev/figures` at 1× and at 2×. Every figure's edges land on whole pixels; merlon teeth are even; a flag pole is a solid 2 px at 1×, 4 px at 2×.
2. **Ground.** Walk the hero across the field and watch for crawl. Before and after, same framing.
3. **Registration.** Stand beside the chapel: the feet sit on slice 1's contact shadow, and the hero is stopped where the drawn wall is, not 50–65 px short of it.
4. **Idle versus walk.** Stand still, then walk: the bob visibly changes rate and depth; the companion is out of phase with the hero; with reducedMotion on, nothing bobs at all.
5. **First paint.** Cold load with the cache cleared, then a return trip inside 90 seconds. Budget: **≤ 900 ms cold at dpr 2, ≤ 250 ms warm**, read from the `[realm] sprites` console line. Record the real numbers in the checkpoint note — this is minutes off the child's clock, so the number matters more than the ratio.
6. **The gallery is complete.** Every catalog entry renders; the bill line matches `manifestTexels`; both palettes draw.
7. **Checkpoint 1 screenshots.** Same-framing before/after of the two views the user photographed, at 1512 × 850. The "before" is re-shot at `d880906` so the framing matches exactly; the user's own two screenshots are kept alongside as the original complaint.

---

## 8. Interfaces

### Produces

**`src/lib/realm/pixel-budget.ts`** (new, pure)
- `type DprBucket = 1 | 2`
- `type Grid = { w: number; h: number }`
- `dprBucket(devicePixelRatio: number): DprBucket`
- `spriteWorldSize(grid: Grid, px: number, zoom: number): { w: number; h: number }`
- `rasterScale(px: number, dpr: DprBucket): number`
- `rasterScaleFor(quad: { w: number; h: number }, dpr: DprBucket): number` — the name slices 5 and 11 call
- `textureSize(grid: Grid, px: number, dpr: DprBucket): { w: number; h: number }`
- `snapWorldHeight(units: number, grid: Grid, zoom: number): { px: number; h: number }`
- `isOnPixelGrid(size: { w: number; h: number }, grid: Grid, zoom: number): boolean`
- `baseAnchor(grid: Grid, baselineRow: number): { x: number; y: number }`
- `rasterTexels(entries: { grid: Grid; px: number }[], dpr: DprBucket): number`
- `groundTexturePx(worldUnits: number, zoom: number, dpr: DprBucket): number`
- `RASTER_BUDGET_TEXELS = 6_000_000`

**`src/lib/realm/figure-catalog.ts`** (new, pure)
- `type FigureFamily = "person" | "keep" | "building" | "landmark" | "ground" | "prop" | "trouble" | "occasion" | "village" | "sign"`
- `type FigureAnchor = "base" | "centre"`
- `type FigureEntry = { key, family, label, grid, px, topRow, baselineRow, anchor }`
- `type ManifestInput = { castleType, villagerIds, troubleSkin, mountId, crownId, castleBanner, decor, recess, companion }`
- `FIGURE_CATALOG: readonly FigureEntry[]`
- `figureEntry(key: string): FigureEntry | undefined`
- `figureSize(key: string): { w: number; h: number }`
- `figureAnchorPoint(key: string): { x: number; y: number }`
- `figureDrawnHeight(key: string): number`
- `figureCanvasFill(key: string): number`
- `figureKeyFor(prop: Prop): string | null`
- `figureManifest(input: ManifestInput): readonly FigureEntry[]` — `ManifestInput` is additive-only; later slices add optional fields
- `registerFigures(entries: readonly FigureEntry[]): void` — how slices 5, 6, 7, 10, 11 and 12 add their figures
- `BUILDING_HEIGHTS: Record<string, number>` — the height ladder. **This slice publishes no footprint table**; slice 4's `village.ts` owns `BUILDING_FOOTPRINTS`.
- `manifestTexels(input: ManifestInput, dpr: DprBucket): number`
- `HERO_DRAWN_HEIGHT = 1.9`

**`src/lib/realm/clearance.ts`** (new, pure) — slice 4's village invariants are checkable with this
- `grownFootprint(prop: Prop, pad: number): { minX: number; maxX: number; minZ: number; maxZ: number }`
- `pointClears(p: Vec2, props: Prop[], pad: number): boolean`
- `segmentClears(a: Vec2, b: Vec2, props: Prop[], pad: number): boolean`
- `crossingsOf(route: Vec2[], props: Prop[], pad: number): string[]`

**`src/lib/realm/sprite-texture.ts`** (extended)
- `TEXTURE_GRACE_MS = 90_000`
- `textureCacheKey(logicalKey: string, scale: number): string`
- `textureOnce(key: string, make: () => Promise<CanvasTexture>): Promise<CanvasTexture>`
- `retainSpriteTextures(): void` / `releaseSpriteTextures(delayMs?: number): void` / `disposeSpriteTextures(): void`
- `spriteCacheStats(): { entries: number; texels: number }`

**`src/lib/realm/tiles.ts`** (extended)
- `TILE_WORLD = 3.2`, `TILE_CELLS = 64`
- `DIRT_COLORS: string[]`, `dirtTile(seed: number, size?: number): Tile`
- `GRASS_COLORS` — now five entries, `#ffffff` removed

**`src/lib/realm/layout.ts`** (changed)
- **No `BUILDING_FOOTPRINTS`.** The ladder is `BUILDING_HEIGHTS` in `figure-catalog.ts`; the footprint table is slice 4's, in `village.ts`, and `buildingFootprint(id)` moves there with it. `BUILDING_SIZE`/`WATCHTOWER_SIZE` survive as this slice's two-slice interim `w`/`d` and slice 4 deletes them.
- `buildingFootprint(id: string)` — same signature, reads the table
- `spriteSizeFor(prop: Prop)` — same signature, delegates to `figureSize(figureKeyFor(prop))`. **No later slice adds a case to it.** A new figure is a catalog row; slice 11's `quadFor` becomes the catalog's `grid`→box derivation rather than a parallel path.
- **Removed:** `FOUNDATION_COLOR`, `BUILDING_SIZE`, `WATCHTOWER_SIZE` (internal)

**`src/components/realm/world-figures.tsx`** (changed)
- **Removed, by this slice and only this slice:** `WORLD_SPRITE_SCALE`, `FoundationFigure`. (Slice 10 must not re-list `FoundationFigure` as a removal — it replaces it with `PlotFigure`, which is a different thing.)
- Kept: `CastleFigure`, `BuildingFigure`, `DecorFigure`, `CASTLE_TIERS`, `DECOR_KINDS`, `CastleTier`, `DecorKind`. **`CastleFigure`, `CASTLE_TIERS`, `CastleTier` and the `castle:*` keys are slice 10's to delete, once, and slice 11 must not re-list them.** See §9 for why this slice pays for art that is replaced later.

**`src/components/realm/figure-registry.tsx`** (new) — the only place a catalog key becomes JSX
- `figureElement(entry: FigureEntry, opts?: { troubleSkin?: TroubleSkin; avatar?: AvatarConfig; mountColor?: string; crownColor?: string }): React.ReactNode`

**`src/components/realm/sprite-source.tsx`** (changed)
- `onReady: (textures: SpriteTextures, stats: { ms: number; entries: number; texels: number; fromCache: number }) => void`
- new prop `dpr: DprBucket`
- `SpriteTextures` keeps its shape; `world` is keyed by catalog key in the form `family:id` (`"building:chapel"`, `"castle:keep"`, `"decor:oak"`, later `"landmark:tavern"`, `"prop:hitch"`, `"keep:gatehouse:slate"`) and `tiles` gains `dirt`: `{ grass, cobble, dirt }`. **No key outside that form is legal**, at any point in the programme.

**Route and CSS**
- `/dev/figures` — `src/app/dev/figures/page.tsx`, 404 in production
- `src/components/realm/figure-gallery.tsx`
- CSS classes: `.figgal`, `.figgal-controls`, `.figgal-section`, `.figgal-grid`, `.figgal-card`, `.figgal-card--calm`, `.figgal-figure`, `.figgal-edge`, `.figgal-ruler`, `.figgal-note`, `.figgal-warn`, `.figgal-bill`

**Constants other slices will quote**
- `CAMERA_ZOOM` is unchanged at 40 and stays `camera.ts`'s. **Slice 4 owns the only change to it (40 → 64) and owns re-snapping this catalog**, re-running `figure-catalog.test.ts` and `pixel-budget.test.ts`, re-deriving the lattice (1.6 → 1.0 units on the 64-grid) and re-costing the manifest. Slice 4 §3.9 carries that arithmetic in full, including the one-step `px` reduction on the eight largest kinds and the single deliberate rise of `RASTER_BUDGET_TEXELS` to 6.5 M. This is the designed handoff, and it has a named receiver.
- Lattice step: **1.6 world units** on the 64-grid, **1.2** on the 36×48 grid, at zoom 40.
- Budget allowance at dpr 2: `px 2` = 0.066 M texels, `px 3` = 0.147 M, `px 4` = 0.262 M per **kind**. Instances are free.

### Consumes

From slice 1 `first-impression`:
- The **contact shadow** under the hero, companion, mount, villagers and every standing prop, at `GROUND_Y.figureShadow` / `GROUND_Y.propShadow` (slice 1's named ladder — **never a y literal**, because path tiles sit at 0.03 and foundations at 0.04 and a shadow at 0.02 would vanish under them), sized from `prop.size.w/d`, and exempt from the bob. This slice's per-building footprints change the shadow's size, and its baseline anchoring puts the sprite's painted feet on it; both are relied on, neither is re-specified here.
- The **ground ring** under the hero, which is the non-motion substitute that lets the bob carry no information.
- `depth.ts` / `surfacesFor(depth, profile)` — imported by nothing in this slice, deliberately (§6).
- Slice 1's `layout` extensions (`focus` on props, `status` on villagers) ride on the same `Prop` objects whose `size` this slice changes; the shapes do not collide.

From the existing codebase: `CAMERA_ZOOM` (`camera.ts`), `HERO_RADIUS`, `unstickHero`, `stepHero` (`movement.ts`), `VILLAGERS`, `villagerPosition`, `REACH` (`villagers.ts`), `BUILDINGS` (`kingdom.ts`), `LAP_WAYPOINTS`, `spawnGleams` (`recess.ts`), `spawnTroubles`, `TROUBLE_RADIUS` (`troubles.ts`), `CROWN_LOW`, `WALK_TIMEOUT_MS` (`ceremony.ts`), `renderSettingsFor` (`render-settings.ts`), `DEFAULT_AVATAR` (`avatar-catalog.ts`).

---

## 9. Out of scope

- **Redrawing anything.** Not one figure is re-authored here. That is the whole point of the ordering: fix the sampling, publish the box sizes and the canvas-fill numbers, build the gallery, then draw. Buildings are **slice 11 `building-redraw`**; the keep is **slice 10 `plots-signs-and-the-keep`**; troubles are **slice 8**; village props are **slice 5 `village-life`**. The `village` and `sign` families ship with no rows and **named owners**: slice 5 fills both, slice 10 adds nine more signs.
- **The eight `castle:*` catalog rows, which slice 10 throws away — deliberately, and it is worth naming the cost.** This slice measures and snaps eight cosmetic castle tiers, and slice 10 replaces the whole ladder with `keepStageFor(buildingsComplete)` and deletes `CastleFigure`, `CASTLE_TIERS` and the `castle:*` keys. Two reasons to pay for it anyway: (1) the castle is the largest figure in the frame and Checkpoint 1's before/after screenshots are worthless if the biggest object is still sampled at 4.27×; (2) the eight rows are eight lines in a table, not eight drawings — no art is authored here, only measured. What is *not* paid twice is the drawing, and that is the expensive half. Slice 11 must not re-list those deletions; they are slice 10's, once.
- **The world palette.** `BUILDING_COLORS` is still dead art direction that only renders in the box-fallback path, and the sixteen figures still invent their own hex. One shared palette module is **slice 5 `village-life`**, which is where the calm palette also stops emptying the world.
- **Standing content on a plot.** The plot becomes readable ochre dirt at the right size; scaffold poles, rising stone, the rope-and-stake border and the vertical signboard that replaces the DOM label are **slice 10**.
- **The road.** The per-quad UV offset removes the fifteen seams as an interim. One continuous strip mesh, spurs, a plaza and a junction are **slice 4 `village-ground`**.
- **Breaking the grass period properly.** Variants, an atlas, dirt around sites, a mown plaza, a shoreline — **slice 5**.
- **The camera.** `CAMERA_ZOOM` stays at 40 and the frame stays larger than the world. Reframing for a 64-unit world with a deadzone and a look-ahead is **slice 4**, and is the only camera change in the programme.
- **`open-ground.ts` and `SPAWN_ZONES`.** Rejection sampling still works at 77 % open ground; zone-based spawning arrives with the village in **slice 4**, and zone-based trouble spawning that survives a finished kingdom is **slice 8**.
- **The recess lap ring's two inherited collider crossings.** Recorded as a fixture and guarded; moved onto the road in **slice 12 `recess-that-counts`**.
- **The nine floating DOM label pills**, which are still the highest-contrast objects in the frame. **Slice 10**.
- **Sound.** **Slice 9**.
- **Lighting, real shadows, water, elevation, animated props.** No `castShadow`, no mip-mapped depth, no swaying trees. Sprites are unlit billboards and stay that way; billboards are correct for a fixed camera, and form comes from the art. **Slice 11** bakes one consistent key light into every figure.
- **Pausing the clock during load.** Forbidden by the programme; the fix is the smaller bill, and Checkpoint 1 records the seconds it actually returns.
