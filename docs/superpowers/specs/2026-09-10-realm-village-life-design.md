# The village fills up

**Date:** 2026-09-10
**Status:** Design complete. Implementation plan written at build time, per programme decision 1.
**Programme:** The Realm: Presentation Overhaul — `docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`. Slice **5 of 13** (`village-life`, large).
**Depends on:** slice 2 `sprite-budget-and-gallery` (the raster budget, the warm kind-keyed cache, the scale ladder, the `/dev/figures` gallery), slice 4 `village-ground` (the town plan: districts, road corridors, plaza, wall, gate, river course, `open-ground.ts` spawn zones, the 64-unit world, the reframed camera).
**Depended on by:** slice 6 `doors-and-the-tavern` (the Tavern stands in the Gate Quarter, among these props), slice 7 `fast-travel-and-the-companion` (fast travel's destination vocabulary is these district names), slice 8 `troubles-that-read-and-pay` (troubles become residents of these districts and spawn in the zones this slice keeps clear), slice 10 `plots-signs-and-the-keep` (the plot signboards use this slice's pixel font and palette), slice 11 `building-redraw` (draws the eight buildings from this slice's palette), slice 12 `recess-that-counts` (gleams spawn in the zones this slice keeps clear).
**Checkpoint:** CHECKPOINT 2 falls at the end of this slice. The user replays and re-judges *"should be WAY more development in the world"* — the complaint they paid two extra large slices for — before `doors-and-the-tavern` starts.

---

## 1. Why — the complaints and audit findings this answers

The verdict, verbatim, in the two clauses this slice owns:

> the world still looks pretty rough … and should be WAY more development in the world … this doesnt feel like a well thought out game at all.

Six audit findings sit under those clauses. Quoted from Appendix A of the brief.

**"should be WAY more development in the world"** — _blocking, large effort_

> The world is 40x40 = 1600 sq units and 9.2% of it is occupied. A fresh player's layout is 44 props: 1 castle (a 2x2 campsite footprint), 15 flat 2x2 path tiles, 8 site diamonds (67 sq units), 8 villagers, 12 decorations — 147 sq units total, the rest identical tiling grass. … And 10 of the 12 decorations sit at |x| >= 13.5 (DECOR_SPOTS), i.e. on the outer rim outside the play corridor where sites live at |x| <= 9 — they are framing, not content. Under the calm palette the shell passes decor:false (realm-shell.tsx:215,223), so a low-stimulus child gets grass, one road, eight diamonds and a tent: 32 props, zero decoration.
>
> *Where:* `src/lib/realm/layout.ts:7, src/lib/realm/layout.ts:90-103, src/lib/realm/layout.ts:127-179, src/lib/realm/camera.ts:49-50, src/components/realm/realm-shell.tsx:215, src/components/realm/realm-shell.tsx:223`
>
> *Fix:* … (2) Fill the interior, not the rim … Move DECOR_SPOTS inward and generate 60-100 instances from seeded clusters instead of 12 hand-typed singletons. Do not strip decor under calmPalette — swap to a muted palette and drop animation instead.

Slice 4 does move (1) — the camera and the town plan. This slice does move (2), and it is the whole of this slice's mandate.

**implied — "WAY more development" / the road goes nowhere** — _major, medium effort_

> The 'Market Square' at (-5,-6) is a single market-stall figure standing alone in a field — it is an object, not a square.
>
> *Where:* `src/lib/realm/layout.ts:131-135, src/lib/realm/layout.ts:47-56`
>
> *Fix:* … a market square as an actual paved area with several stalls, crates and awnings rather than one stall sprite. Paths are the cheapest possible way to make a world look inhabited — they turn empty grass into 'the space between places'.

**implied — art direction is inconsistent** — _minor, small effort_

> BUILDING_COLORS defines eight per-building colours that are never used for anything a player normally sees. colorFor(prop) feeds only the boxGeometry fallback path, which runs solely when a figure fails to rasterise; the sprite path uses whatever is baked into the SVG. So the file that looks like the world's palette definition is dead art direction, and the SVGs each invent their own colours independently — which is why the garden ends up green-on-green and the well's body #7d7d7d is pixel-identical to the rock decoration's #7d7d7d.
>
> *Where:* `src/lib/realm/layout.ts:58-67, src/components/realm/realm-scene.tsx:232, src/components/realm/realm-scene.tsx:318-322, src/components/realm/world-figures.tsx:15-25`
>
> *Fix:* Promote one palette module for the whole world — ground, props, accents, shadow — and make every figure and BUILDING_COLORS draw from it, so hue separation from the grass can be checked in one place. Either delete BUILDING_COLORS or make the sprite path tint from it.

**implied — "silhouette readability"** — _major, medium effort_ (the third of its three problems)

> Third: the garden figure is #5aa55a/#3d8a4a against #2e5a3a/#33633f grass — green on green, it will disappear.
>
> *Where:* `src/components/realm/world-figures.tsx:290-304, src/lib/realm/layout.ts:50`

**Missing entirely** (four of that list belong here):

> - Any water at all — no river, pond, sea or stream, despite the 'River Bridge' building drawing its own painted river (world-figures.tsx:220-231) and the 'Village Well' drawing a blue water disc. The layout has one terrain type: grass.
> - Any animated world prop — no swaying trees, no smoke from a chimney, no turning mill sail (the mill has sails drawn but they are a static baked sprite), no water motion, no flickering lantern. The only motion in the world is the hero's 0.05-unit sine bob (realm-scene.tsx:177).
> - Ambient villagers, animals or crowds. There are exactly 8 NPCs, one per site, standing motionless at fixed offsets (villagers.ts:298-300).
> - Prop variation of any kind — no rotation, no scale jitter, no per-instance seeding. The two oaks in DECOR_SPOTS are pixel-identical, as are the two pines.

**Not complained about yet, but will be:**

> Low-stimulus mode makes the world EMPTIER, not calmer: realm-shell.tsx:215/223 passes `decor: !settings.calmPalette`, so the children who most need visual anchoring get a world of grass, one road, eight dirt diamonds and a tent — 32 props total.

That last one is the finding this slice takes most personally. `renderSettingsFor` (`src/lib/realm/render-settings.ts:13`) sets `calmPalette: profile.lowStimulus`, and the shell turns that straight into `decor: !settings.calmPalette` at `realm-shell.tsx:215` and again at `:223`. A child with `lowStimulus` set does not get a calmer village; they get no village. That inversion is deleted here.

**And decision 2, verbatim from the programme brief:** the user chose the full village over the scoped version, accepting roughly two extra large slices, and ruled that the audit's four objections are *engineering problems to solve, not reasons to decline*. Section 3.4 solves them.

---

## 2. Decisions

| # | Decision | Ruling |
|---|---|---|
| D5.1 | Where the world's colours live | One `src/lib/realm/palette.ts` with two variants (`bright`, `calm`). Every figure, tile and layer reads it. Hue separation from grass is a unit test, not an opinion. |
| D5.2 | `BUILDING_COLORS` | Deleted from `layout.ts`. Its eight values move into `palette.ts` as `buildingColor(id)` and get three real consumers: the box fallback, the district-sign colour chip, and (slice 10) the plot rope-and-stake border. |
| D5.3 | Prop placement | Deterministic and derived, never stored. `seedProps(...)` from a seed hashed off `childId`, so a child's town is the same town every visit and no migration exists to get wrong. |
| D5.4 | Per-instance variation | **Mirror, quantised scale and authored variants — never rotation.** Rotating a nearest-filtered pixel sprite resamples it off the texel grid and reintroduces exactly the aliasing slice 2 just paid to remove. Ground decals may rotate in 90° steps only. |
| D5.5 | Are seeded props solid? | Non-solid by default. A five-kind whitelist (`cart`, `stall`, `hay-bale`, `water-trough`, `planter`) is solid, placed only against a wall or plaza edge, never within 1.5 u of another solid, and covered by a flood-fill reachability test. |
| D5.6 | Spawn zones | Props may not enter an `open-ground.ts` `SPAWN_ZONE`. Trouble and gleam spawning is therefore unaffected by density **by construction**, and neither `troubles.ts` nor `recess.ts` changes in this slice. |
| D5.7 | Calm mode | A muted palette variant, motion off, density × 0.6 — and the calm town is a strict **subset** of the bright town, selected by seeded rank, so it is the same town with fewer things in it, not a different town. Never zero. |
| D5.8 | Where district names come from | Baked into the sign textures with a hand-authored 5×7 pixel font (`pixel-font.ts`), not a system font and not a DOM pill. The nine floating `.realm-label` pills leave in slice 10; this slice does not add a tenth. |
| D5.9 | How a child who cannot read learns a district | Every sign carries an emblem beside the name, and entering a district announces it once per visit in slice 1's centred message lane, spoken when `readAloud` is on. Tapping a sign announces it again, any time. |
| D5.10 | Rasterisation | Two waves. Nine kinds a child needs to read the town block first paint; eleven ambient kinds arrive after `onReady` and appear progressively. Wave 2 is held back until any pending ceremony is `done`. |
| D5.11 | Draw calls | One `THREE.SpriteMaterial` per (kind, tint) pair, shared across every instance. Instances are free in GPU state as well as in rasterisation. |
| D5.12 | Where the art lives | `decor` figures move out of `world-figures.tsx` into a new `village-figures.tsx`. `world-figures.tsx` keeps only the castle, the eight buildings and the foundation — exactly the set slices 10 and 11 redraw. |
| D5.13 | Schema | **None.** This slice adds no column and takes no migration. It reserves no number either — numbers are drizzle-kit's, assigned in build order, and only seven slices in the programme take one. |
| D5.14 | Ambient wandering villagers | Parked, not deferred to a named slice. See §9. |

---

## 3. Design

### 3.1 `src/lib/realm/palette.ts` — one palette for the whole world

Pure, no three, no React. Every colour a child sees in the world resolves through it.

```ts
export type PaletteVariant = "bright" | "calm";

export type GroundPalette = {
  grassA: string; grassB: string; tuft: string; flowers: string[];
  dirt: string; dirtDark: string;
  road: string; roadMortar: string;
  plaza: string; plazaMortar: string;
  water: string; waterDeep: string; waterEdge: string; foam: string;
  bank: string; reed: string;
};

export type PropPalette = {
  wood: string; woodLight: string; woodDark: string;
  stone: string; stoneLight: string; stoneDark: string;
  plaster: string; plasterShade: string;
  thatch: string; thatchDark: string;
  cloth: string; clothLight: string; clothShade: string;
  leaf: string; leafLight: string; pine: string; pineLight: string;
  iron: string; rope: string; soil: string;
};

export type AccentPalette = { gold: string; flag: string; lamp: string; ropeGold: string };

export type Palette = {
  variant: PaletteVariant;
  ground: GroundPalette;
  props: PropPalette;
  accents: AccentPalette;
  outline: string;   // the 1-unit dark keyline every prop figure carries
  shadow: string;    // rgba() the slice-1 contact decal tints with
  buildings: Record<string, string>; // the eight ids from BUILDINGS
};

export const BRIGHT: Palette;
export const CALM: Palette;
export function paletteFor(variant: PaletteVariant): Palette;
export function paletteVariantFor(settings: { calmPalette: boolean }): PaletteVariant;
export function buildingColor(id: string, palette?: Palette): string;

/** OKLab ΔE between two #rrggbb strings. Pure arithmetic; used by the separation tests. */
export function deltaE(a: string, b: string): number;
export function separatesFromGround(color: string, palette: Palette): boolean;
export const MIN_SEPARATION = 12;

/** Reserved for slice 8's troubles. No environment token may come within MIN_SEPARATION of it. */
export const TROUBLE_VIOLET = "#a78bfa";
/** The deep companion violet — cracks, motes, the dying beat. Slice 8 consumes both; it declares neither. */
export const TROUBLE_VIOLET_DEEP = "#7c3aed";

/**
 * Every non-trouble colour the environment draws, flattened. This is the input to slice 8's
 * violet-key lock test, and it is exhaustive by construction: it is built by walking BRIGHT and
 * CALM's ground, props, accents, buildings, outline and every MATERIALS shade, so a token added
 * to the palette is in the list automatically and cannot escape the lock.
 * A colour drawn inline in a figure and never registered here is a test failure (§7).
 */
export const ENVIRONMENT_COLORS: readonly string[];

// ── The shade ladder (slice 11 extends this module; it does not start a second one) ───────────
/** A material's three tones under the one baked upper-left sun. */
export type Shade = { lit: string; mid: string; shade: string };
export type MaterialName =
  | "stone" | "cutStone" | "plaster" | "timber" | "darkTimber" | "thatch" | "slate"
  | "tile" | "lead" | "glass" | "water" | "soil" | "iron" | "canvas" | "brass";
export const MATERIALS: Record<MaterialName, Shade>;
export function material(name: MaterialName, palette?: Palette): Shade;
/** The one gold every accent in the world uses. Slice 11's windows, slice 10's crown, slice 1's ring. */
export const ACCENT_GOLD: string;
```

**Why the shade ladder lives here and not in a second module.** Slice 11 needs `lit`/`mid`/`shade` per material to draw a roof plane, a lit wall and a shaded wall from one sun. That is the same art direction this module exists to hold, so it is declared here — with its values — and slice 11 *extends* `palette.ts` rather than creating a rival `world-palette.ts`. **There is one palette module in the programme and it is `src/lib/realm/palette.ts`.** `separatesFromGround` is its only separation predicate; there is no second `separationFromGrass`.

`MATERIALS` bright values, each a lit/mid/shade triple derived from the props palette above so the two never drift:

| material | lit | mid | shade |
|---|---|---|---|
| `stone` | `#b3b3bf` | `#8e8e9c` | `#63636f` |
| `cutStone` | `#c6c1b2` | `#a39d8c` | `#7a7466` |
| `plaster` | `#e6ddcd` | `#d8cfc0` | `#b9b0a2` |
| `timber` | `#a07b4a` | `#6b4226` | `#4a2d19` |
| `darkTimber` | `#6b4226` | `#4a2d19` | `#33200f` |
| `thatch` | `#c99f68` | `#b08a5a` | `#8a6a42` |
| `slate` | `#7b8492` | `#5c6472` | `#414856` |
| `tile` | `#c4674a` | `#a14f36` | `#743725` |
| `lead` | `#8d9099` | `#6d7078` | `#4e5158` |
| `glass` | `#ffd98a` | `#e0b463` | `#a67f3d` |
| `water` | `#7fb3c4` | `#2f6f8f` | `#23566f` |
| `soil` | `#8a7a55` | `#6f6242` | `#54492f` |
| `iron` | `#7a7a86` | `#5c5c66` | `#3e3e46` |
| `canvas` | `#efe4cc` | `#d5c6a6` | `#a89a7c` |
| `brass` | `#f2d16b` | `#c9a84c` | `#8f7530` |

`ACCENT_GOLD = "#f2d16b"` — the same value as `accents.gold`, exported under a second name only because slice 11 reads it as an accent rule rather than as a palette slot, and a hex written twice is a hex that drifts.

Calm `MATERIALS` are produced by the same chroma-reduction rule as the calm palette, not hand-typed: `material(name, CALM)` desaturates each of the three tones by 40% and holds lightness.

**Bright values.** Ground: `grassA #33603c`, `grassB #2c5535`, `tuft #24492e`, `flowers ["#e8c96a", "#e7a2c0"]` (slice 2 already dropped `#ffffff`; the palette never reintroduces it), `dirt #8a7a55`, `dirtDark #6f6242`, `road #c9b27a`, `roadMortar #8f7d55`, `plaza #b9a679`, `plazaMortar #8f7d55`, `water #2f6f8f`, `waterDeep #23566f`, `waterEdge #7fb3c4`, `foam #cfe7ee`, `bank #b6a173`, `reed #6d8f4a`.
Props: `wood #6b4226`, `woodLight #a07b4a`, `woodDark #4a2d19`, `stone #8e8e9c`, `stoneLight #b3b3bf`, `stoneDark #63636f`, `plaster #d8cfc0`, `plasterShade #b9b0a2`, `thatch #b08a5a`, `thatchDark #8a6a42`, `cloth #c0563d`, `clothLight #d97a5f`, `clothShade #93392a`, `leaf #4f9440`, `leafLight #6cb355`, `pine #2a6b3c`, `pineLight #3d8a4f`, `iron #5c5c66`, `rope #c4a678`, `soil #6a4a30`.
Accents: `gold #f2d16b`, `flag #c0563d`, `lamp #ffd98a`, `ropeGold #d4a843`.
`outline #1c2a1e`. `shadow "rgba(20, 30, 22, 0.35)"`.
Buildings: `well #5b8fb9`, `mill #b08a5a`, `bridge #8c7a6b`, `chapel #d8cfc0`, `market #c0563d`, `library #6f5a8a`, `watchtower #7d7d7d`, `garden #b58a4a` — the garden's entry moves from `#5aa55a` to the arbour's warm timber, because a green chip for the building that disappears into green grass is the same mistake twice.

**Calm values** are the bright ones with chroma reduced by roughly 40% and lightness held, not darkened: `grassA #46604a`, `grassB #405843`, `road #bdae8c`, `plaza #b3a893`, `water #4a6f80`, `cloth #a5675c`, `leaf #6a8f60`, `gold #ddc98f`, `lamp #e9d9b4`, `outline #24302a`. Lightness is deliberately preserved so calm stays *legible*; the current implementation dims (`CALM_FOUNDATION #5a5750`, `CALM_TINT #a9aaa4` at `realm-scene.tsx:53-54`) and legibility is the first casualty.

**The two invariants palette.test.ts enforces.** (1) Every value in `props`, `accents` and `buildings` satisfies `separatesFromGround` against both `grassA` and `grassB`, in both variants. This is the finding about the garden, made mechanical: green-on-green cannot ship again without a red test. (2) No environment value comes within `MIN_SEPARATION` of `TROUBLE_VIOLET`, so slice 8's enemies own a hue that appears nowhere in the scenery.

**Deletions.** `BUILDING_COLORS` leaves `layout.ts:58-67`. The module-local constants at `world-figures.tsx:15-25` (`STONE`, `ROOF`, `WOOD`, `PLASTER`, `FLAG`, `GOLD`, `LEAF`, `LEAF_LIGHT`, `PINE`) are deleted and every figure imports from `palette.ts` instead. `CALM_FOUNDATION` and `CALM_TINT` are deleted from `realm-scene.tsx`; `color={tint}` on prop, tile and foundation materials becomes `#ffffff` always, because the palette now does the work in the raster rather than by multiplying every pixel toward grey.

### 3.2 `src/lib/realm/pixel-font.ts` — legible carved text at 16 screen pixels

A district sign has to say a word. `<text>` inside a data-URI SVG resolves against whatever font the platform happens to have, at whatever hinting it happens to apply, and then gets minified onto a texel grid we control to the pixel — which is precisely the mechanism slice 2 identified as the cause of "rough". So the letters are drawn as rectangles from a hand-authored 5×7 uppercase font.

```ts
export type PixelRect = { x: number; y: number; w: number; h: number };
export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Uppercase A–Z, 0–9, space, hyphen, apostrophe and the middot. Each glyph is 7 strings of 5 characters, "#" on and "." off. */
export const FONT_5X7: Record<string, readonly string[]>;

export type PixelTextOptions = { x: number; y: number; scale?: number; letterSpacing?: number; align?: "left" | "center" };
/** Rects in the caller's SVG user units. Unknown characters render as a space. Lowercase is uppercased. */
export function pixelTextRects(text: string, opts: PixelTextOptions): PixelRect[];
export function pixelTextWidth(text: string, opts?: { scale?: number; letterSpacing?: number }): number;
```

`DistrictSignFigure` calls it once per sign at `scale: 2`, `letterSpacing: 1`, `align: "center"`. Slice 10's plot signboards ("VILLAGE WELL", "2 OF 5") use the same module, which is why it is a module and not a helper inside the figure file.

Sign geometry: `DISTRICT_SIGN_VIEWBOX = { w: 96, h: 64 }`, board from `y 8` to `y 40`, two posts `y 40..62`, emblem at `x 8..28`, text centred at `x 60`. Displayed at 3.0 × 2.0 world units (aspect 1.5, exact). A 7-unit glyph is 0.22 world units, ≈16 screen px at slice 4's camera zoom — the same height as the HUD's smallest type, and drawn on the texel grid rather than resampled onto it.

### 3.3 `src/lib/realm/props.ts` — the town's things

```ts
export type PropKindId =
  // wave 1 — a child needs these to read the town
  | "stall" | "crate" | "barrel" | "cart" | "fingerpost"
  // wave 2 — ambience
  | "hedge" | "hay-bale" | "washing-line" | "planter" | "water-trough"
  | "log-pile" | "reeds" | "bench" | "sack-pile"
  // repainted and rescaled, not new (moved from DECOR_KINDS)
  | "oak" | "oak-2" | "pine" | "pine-2" | "bush" | "rock" | "fence" | "lantern";

export type PropDensity = "full" | "calm";

export type SeededProp = {
  id: string;                 // "prop-market-014"
  kind: PropKindId;
  districtId: DistrictId;     // from village.ts
  position: Vec2;
  size: { w: number; d: number; h: number };
  rank: number;               // 0..1, stable per seed. calm keeps rank < CALM_DENSITY
  mirrored: boolean;          // flips scale.x; exact, no resampling
  scale: number;              // one of PROP_SCALES
  tint: string | null;        // stall awnings and washing only; null everywhere else
  solid: boolean;
  swaying: boolean;           // reeds, washing-line: eligible for the ambient bob. TWO kinds set it,
                              // and both are driven in this slice (§3.7). It is not a field waiting
                              // for a feature: if a later slice wants smoke or turning sails, those
                              // are overlay quads on the emitting building, not this flag.
};

export type SeedPropsInput = {
  layout: WorldLayout;
  seed: number;
  density?: PropDensity;      // default "full"
  palette?: Palette;          // supplies the tint values; default BRIGHT
};

export function seedProps(input: SeedPropsInput): SeededProp[];
export function townSeed(childId: string): number;              // FNV-1a, mirrors troubles.ts:57 hashId
export function propsToLayoutProps(props: SeededProp[]): Prop[]; // solid ones only, kind: "scenery"
export function propReachability(input: {
  colliders: Prop[]; start: Vec2; bounds: number; step?: number;  // step default 0.3
}): { cells: Set<string>; reaches(target: Vec2): boolean };

export const PROP_KINDS: readonly PropKindId[];
export const WAVE_ONE_KINDS: readonly PropKindId[];
export const WAVE_TWO_KINDS: readonly PropKindId[];
export const PROP_FOOTPRINTS: Record<PropKindId, { w: number; d: number; h: number }>;
export const PROP_SOLID_KINDS: ReadonlySet<PropKindId>;
export const PROP_SCALES: readonly number[];   // [0.875, 1, 1.125]
export const PROP_BUDGET = 96;
export const CALM_DENSITY = 0.6;
export const DISTRICT_QUOTA: Record<DistrictId, number>;
export const PROP_SEED_VERSION = 1;
```

**The seed.** `townSeed(childId)` hashes the child's id with FNV-1a and mixes in `PROP_SEED_VERSION`, so a child's town is identical on every visit and across devices, and no row is stored. The existing per-visit `seed` at `realm-shell.tsx:174` (`Date.now() >>> 0`) drives troubles and gleams and stays exactly as it is — those *should* differ per visit. The town should not.

**Placement.** For each district, a quota of prop slots. Each slot draws its kind from a district-character weighting, then rejection-samples a point inside that district's fill polygon (from `village.ts`) with a bounded 24 attempts, rejecting a candidate if any of these hold:

1. it lies inside any `SPAWN_ZONE` from `open-ground.ts` (D5.6), or inside `KEEP_PRECINCT`;
2. `roadCorridorContains(p, HERO_RADIUS + 0.4)` is true — slice 4's corridor test over `ROAD_QUADS`, which covers streets, spurs **and** the three plazas in one call;
3. it lies within 1.2 u of a door point, `doorPointFor(id)` for each of the nine entries in `SITE_DOORS`;
4. it lies inside any of the nine `BUILDING_SLOTS` footprints (from `BUILDING_FOOTPRINTS`, slice 4's one table) padded by 1.5 — *whether or not that building is built yet*, so a building that rises mid-visit never lands on a barrel, and including the Tavern, which is always there;
5. it lies within 2.0 u of a villager stand (`villagerStandFor(id)`);
6. it lies within 2.4 u of the recess lap course — the polyline through `COURSE_NODES` (slice 4 §3.8), sampled at 1-unit intervals;
7. it lies within 1.0 u of an already-placed prop of any kind, or — if it is solid — within 1.5 u of another solid;
8. if it is solid, it does not sit within 2.5 u of a building wall or a plaza edge;
9. it lies inside a `WATER_BAND` grown by 1.0 (reeds are the one exception: they are placed *on* the bank, tested against the band's edge rather than its interior).

A slot that exhausts its attempts is dropped.

**`DISTRICT_QUOTA`**, over slice 4's eight real districts — `Record<DistrictId, number>`, so it type-checks against `village.ts` and a renamed district is a compile error:

| district | quota | why |
|---|---|---|
| `market-plaza` | **26** | The town's centre of gravity. A plaza is a plaza because of what is standing on it. |
| `gate-quarter` | 14 | The first thing a child sees, and the widest district; the Well on one hand, the Tavern on the other. |
| `millrace` | 14 | The river's whole length, both banks, the ford and the bridge. Reeds, log piles, water troughs. |
| `scholars-row` | 10 | Quiet by design. Hedges, benches, a fingerpost. |
| `chapel-hill` | 10 | Quiet by design, and the slope reads through the props rather than the ground. |
| `garden-terrace` | 8 | Planters, hedges, hay bales. |
| `watch-hill` | 8 | Rocks, pines, a log pile. Sparse on purpose: it is the edge of the world. |
| `keep-approach` | **6** | The coronation ground stays clear. Six props, all on the rim of the plaza, none inside `KEEP_PRECINCT`. |
| **total** | **96** | `= PROP_BUDGET` |

There is no `wild` quota. Slice 4's districts partition the whole walled area, so every point inside the wall is in exactly one district and there is nothing outside the wall a child can reach. `props.test.ts` asserts `sum(DISTRICT_QUOTA) === PROP_BUDGET` and that every key is a `DistrictId`.

The **ten-prop floor** the earlier draft implied does not survive eight districts (8 × 10 = 80 of a 96 budget, which would collapse the plaza). The floor is **six**, and it binds only on `keep-approach`; every other district is above it by design.

**Density in the frame, which is the number that matters.** Slice 4's camera frames roughly 19–24 world units. Standing in the Market Plaza a child sees ≈28 props; standing on the treeline rim they see ≈6. Today, standing anywhere, they see between 0 and 3. That contrast — a busy place and a quiet edge, both on the same walk — is what "development in the world" means, and it is measured in the browser pass, not asserted here.

**Variation without rotation (D5.4).** Each prop gets `mirrored` from one bit of its slot's RNG and `scale` from `PROP_SCALES = [0.875, 1, 1.125]`. Slice 2's raster scale is chosen so a prop's base display width is a multiple of 8 device pixels, which makes all three scales land on whole pixels. Two oaks side by side therefore differ in facing and mass without a single resampled edge, and `oak-2`/`pine-2` add a second authored silhouette per tree species on top. The placement rule additionally forbids two neighbours within 3 u sharing the same `(kind, mirrored, scale)` triple.

### 3.4 The four full-village engineering problems

Decision 2 named four objections and ruled them engineering problems. Here is how this slice handles each.

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** Two halves. The half this slice owns: **props never enter a spawn zone.** `open-ground.ts` (slice 4) publishes `SPAWN_ZONES` — named regions of guaranteed-clear ground, one or more per district — and rejection rule 1 above excludes every one of them. `props.test.ts` asserts, at full density on the real layout, that zero props fall inside any zone and that every zone retains enough clear area to seat `MAX_TROUBLES` (6, `troubles.ts:29`) plus `GLEAM_COUNT` (12, `recess.ts:17`) simultaneously at their own clearances. So the density this slice adds cannot starve anything. The other half — replacing `spawnTroubles`' foundation-anchored rule with zone-anchored spawning so a *finished* kingdom is not inert — is slice 8's, and is named there. Nothing in `troubles.ts` changes here.

**(b) New solid props can wedge the hero, and the ceremony walk and recess lap ring cross the map.** Four defences, in order of strength.
- Almost nothing is solid. 15 of the 20 kinds are walk-through scenery; `PROP_SOLID_KINDS` is `{ cart, stall, hay-bale, water-trough, planter }`.
- Solids are placed only against a wall or a plaza edge (rule 8), never within 1.5 u of another solid (rule 7) — the hero's diameter is 0.9 u, so a gap always exists — and never inside a road corridor grown by `HERO_RADIUS + 0.4` (rule 2).
- **A flood fill is the acceptance test, not a spot check.** `propReachability` walks a 0.3-unit grid from `SPAWN` over the walkable set, and `props.test.ts` asserts it reaches every door spur endpoint, every villager stand, every district sign, every spawn zone, the ceremony plaza marks from `ceremonyMarks(layout)`, and every recess lap waypoint. If a single seeded prop closes a route, the test goes red before a child ever walks it.
- Every cross-map route uses `roadPath()` from `village.ts`, and solids cannot be in a corridor, so the ceremony walk and the lap ring are structurally clear. `unstickHero` — in slice 4's nearest-free-point form — recovers the hero from any solid this slice adds, including the case where a building completes mid-visit and re-seeds the layout under the hero's feet (`realm-scene.tsx:100-102` already runs it on every `layout.colliders` change).

**(c) Sprite rasterisation already blocks first paint and more figures makes it worse.** Three moves. The cache is keyed by kind and by palette variant, so 34 barrels cost one rasterisation, not 34 — instances are free, kinds are billed. Kinds are split into two waves (§3.11): nine block first paint, eleven do not. And a child's profile does not change mid-visit, so the palette-variant key never doubles a real child's bill. Measured first-paint delta is a browser-pass gate, stated in §7.

**(d) Gleam spawning needs open ground.** Same mechanism as (a): `spawnGleams` (`recess.ts:63`) rejection-samples against colliders, foundations, paths, villagers and spawn, with 20 attempts per slot. Because props never enter a spawn zone, and because the zones are sized in the test to hold the full gleam count, gleam placement succeeds at exactly the rate it does today. `recess.ts` is not touched in this slice.

### 3.5 The Market Plaza

The largest concentration of props in the world, sited on slice 4's paved junction where the road network converges.

Four stalls stand on the plaza edge under awnings, arranged so their fronts face the paved centre and the hero can walk the full ring between them and the buildings. A stall is one authored kind with a white awning, tinted per instance from `palette.accents.flag`, `palette.props.clothLight`, `palette.accents.gold` and `palette.props.plaster` — four visibly different stalls, one rasterisation. Around them: crates and barrels stacked against the stall backs, a cart with its shafts down beside the north stall, sack piles, two benches on the plaza's south edge, planters at the corners, and four lanterns on the plaza rim which are the world's brightest points after the keep. The market building's own figure stops being the only market thing in the market.

The plaza ground is a `plazaTile` — larger flagstones than the road's cobble, mortar in `plazaMortar` — drawn by slice 4's ground pass from this slice's tile. The plaza is one continuous quad with a UV repeat proportional to its size, so the flagstone pattern does not restart at a seam.

The plaza's `SPAWN_ZONE` is its paved centre. It stays empty of props, which is both the engineering answer and the right composition: the middle of a square is where people stand.

### 3.6 District signage and arrival

**This slice owns the arrival announcement, end to end.** Slice 4 detects the boundary crossing (debounced, `districtAt` behind a `lastDistrict` ref and a 1.5 s minimum) and publishes the words — `District.name`, `District.label`, `District.spoken`. It ships no pill, no CSS class and no depth key of its own, precisely so this is built once. This is the slice that also carves the wooden sign a child can tap to hear it again, and an announcement and a re-hearable sign belong together.

`src/lib/realm/signage.ts`:

```ts
export type EmblemId = "arch" | "book" | "basket" | "bell" | "wave" | "leaf" | "crown" | "lantern";

export type DistrictSign = {
  id: string;              // "sign-millrace"
  districtId: DistrictId;
  position: Vec2;          // District.entrance, offset 1.6 u to the right of entranceFacing
  facing: Facing;          // District.entranceFacing
  carved: string;          // the text on the board, already uppercase
  emblem: EmblemId;
};

export type DistrictSignCopy = {
  carved: string;          // two rows on the board; up to 16 characters per row
  emblem: EmblemId;
  arrival: string;         // full depth, in slice 1's message lane
  arrivalSimple: string;   // simple depth
  spokenFull: string;      // readAloud at full depth; written for the ear
  // The simple-depth spoken line is District.spoken from village.ts. It is NOT duplicated here.
};

export const DISTRICT_SIGN_COPY: Record<DistrictId, DistrictSignCopy>;

/** One sign per district, standing at District.entrance, 1.6 u to the right of the way in. */
export function districtSigns(layout: WorldLayout): DistrictSign[];

export type DistrictArrival = { districtId: DistrictId; text: string; spoken: string };
export type ArrivalState = { current: DistrictId | null; seen: DistrictId[] };
export function startArrivals(): ArrivalState;
/** Fires once per district per visit on entry. A sign tap calls announceFor directly and always returns copy. */
export function stepArrival(state: ArrivalState, at: DistrictId | null, surfaces: { districtDetail: boolean }): { state: ArrivalState; announce: DistrictArrival | null };
export function announceFor(districtId: DistrictId, surfaces: { districtDetail: boolean }): DistrictArrival;
```

`announceFor` composes rather than storing twice:

```
text   = surfaces.districtDetail ? copy.arrival    : copy.arrivalSimple
spoken = surfaces.districtDetail ? copy.spokenFull : districtById(id).spoken
```

The scene holds an `ArrivalState` in a ref, reads slice 4's debounced district signal each frame, and on a change emits through `queueMicrotask` to `onDistrictArrival`. The shell routes it into slice 1's centred message lane at toast priority. Nothing pauses, nothing blocks, nothing modal.

Signs are pointer targets: `onPointerDown` on the sign sprite calls `announceFor` directly and re-announces, at any time, however many times a child wants. That is the affordance for "I forgot where I am", and it is also the read-aloud path for a child who cannot read the carved letters.

**Where a sign stands.** At `District.entrance` — slice 4's named, on-road, inside-the-district node — offset 1.6 units to the right of `entranceFacing`, so it is beside the road a child walks in on and never in it. `signage.test.ts` asserts every sign position is outside every road corridor by at least `HERO_RADIUS`, outside every building's grown footprint, and inside its own district's bounds.

**The copy, verbatim.** Building names are `BUILDINGS[].label` from `src/lib/utils/kingdom.ts:7-14` **exactly** — `Village Well`, `Grain Mill`, `River Bridge`, `Chapel`, `Market Square`, `Library`, `Watchtower`, `Royal Garden` — with a leading `the` where the sentence needs one. `signage.test.ts` asserts that every building name appearing in an arrival string is a verbatim `BUILDINGS[].label` and that `districtFor(id)` puts that building in that district, so a copy edit that moves a building between districts fails the build.

| district | carved on the board | emblem |
|---|---|---|
| `gate-quarter` | `GATE` / `QUARTER` | arch |
| `scholars-row` | `SCHOLARS'` / `ROW` | book |
| `market-plaza` | `MARKET` / `PLAZA` | basket |
| `chapel-hill` | `CHAPEL` / `HILL` | bell |
| `millrace` | `MILLRACE` | wave |
| `garden-terrace` | `GARDEN` / `TERRACE` | leaf |
| `keep-approach` | `KEEP` / `APPROACH` | crown |
| `watch-hill` | `WATCH` / `HILL` | lantern |

The board carries **two rows** of the 5×7 pixel font (§3.2), which is why a fourteen-character name like `GARDEN TERRACE` needs no truncation and why `DISTRICT_SIGN_SIZE` is 3.0 × 2.0 rather than a long thin plank. `MILLRACE` centres on one row.

**Arrival, full depth** (`districtDetail: true`) — shown in the message lane:

| district | string |
|---|---|
| `gate-quarter` | `Gate Quarter. The Village Well, the Tavern, and the way home.` |
| `scholars-row` | `Scholars' Row. The Library, and the quietest street in town.` |
| `market-plaza` | `Market Plaza. Market Square, and every road in the village.` |
| `chapel-hill` | `Chapel Hill. The Chapel, and a bell you can hear from the gate.` |
| `millrace` | `Millrace. The Grain Mill, the River Bridge and the water between them.` |
| `garden-terrace` | `Garden Terrace. The Royal Garden.` |
| `keep-approach` | `Keep Approach. The keep, and the ground where crowns are given.` |
| `watch-hill` | `Watch Hill. The Watchtower, and the long view east.` |

**Arrival, simple depth** (`districtDetail: false`) — the bare name, which is `District.name`:

`Gate Quarter` · `Scholars' Row` · `Market Plaza` · `Chapel Hill` · `Millrace` · `Garden Terrace` · `Keep Approach` · `Watch Hill`

**Spoken at full depth** (`spokenFull`, written for the ear rather than the eye):

| district | string |
|---|---|
| `gate-quarter` | `You're in the Gate Quarter. The Village Well is here, and the Tavern, and the way home.` |
| `scholars-row` | `You're on Scholars' Row. The Library is here. It's the quietest street in town.` |
| `market-plaza` | `You're in the Market Plaza. Market Square is here, and every road in the village meets here.` |
| `chapel-hill` | `You're on Chapel Hill. The Chapel is here, and a bell you can hear all the way from the gate.` |
| `millrace` | `You're at the Millrace. The Grain Mill is here, and the River Bridge, and the water between them.` |
| `garden-terrace` | `You're on the Garden Terrace. The Royal Garden is here.` |
| `keep-approach` | `You're at the Keep Approach. The keep is here, and this is where crowns are given.` |
| `watch-hill` | `You're on Watch Hill. The Watchtower is here, and you can see a long way east.` |

**Spoken at simple depth** is `District.spoken` from `village.ts`, unchanged and not restated here: `You're in the Gate Quarter.` · `You're on Scholars' Row.` · `You're in the Market Plaza.` · `You're on Chapel Hill.` · `You're at the Millrace.` · `You're on the Garden Terrace.` · `You're at the Keep Approach.` · `You're on Watch Hill.`

The `aria-live` announcement is the arrival text itself; slice 1's lane already announces whatever it shows, so a screen reader hears `Millrace. The Grain Mill, the River Bridge and the water between them.` with no extra plumbing.

**Nothing above promises anything.** Each string names what is standing there, and placement rule 4 plus the `districtFor` assertion guarantee it. The one clause that is not a building — "the way home" for the Gate Quarter — is true because the Tavern's door is the exit (slice 6), and it is written *after* that slice in build order for exactly that reason. If slice 6 were cut, this clause would have to go with it.

### 3.7 The river painted

Slice 4 owns the river's geometry — four `WATER_BANDS` rectangles (centre z = −4, depth 3.5, so the channel is z ∈ [−5.75, −2.25]) with two gaps, the Mill Ford at x ∈ (−20.5, −17.5) and the River Bridge deck at x ∈ (−3, 3) — because the bridge slot, the road crossing and the corridor colliders depend on it. This slice paints it, against those published extents and no others.

- **The water band.** One strip mesh along the course with `waterTile`, UV repeat proportional to length, drawn at `y = 0.02`.
- **A reflection band.** A second, narrower quad over the water in `foam`, at low opacity, scrolling along the course at 0.06 u/s when `settings.motion` is true and sitting still at its mid position when it is false.
- **Banks.** A `bankTile` strip either side, two units wide, in `bank`, which is the same warm ochre family as the plots' dirt — so the water is edged rather than pasted onto grass.
- **Reeds.** The `reeds` prop kind seeds densely along both banks (part of the **Millrace**'s quota of 14), swaying with a 0.03-unit vertical bob at 0.6 Hz with a per-instance phase from `rank`.
- **The crossing reads as a crossing.** The River Bridge sits on the course, so the puddle the audit found — "a bridge with a painted puddle sitting in a dry field at (-7,0)" — becomes an actual span over actual water. The bridge *figure's* redraw is slice 11's; what this slice does is put water under it, which is the half that makes the existing art make sense.

New tile functions in `src/lib/realm/tiles.ts`:

```ts
export function waterTile(seed: number, size?: number, ground?: GroundPalette): Tile;
export function bankTile(seed: number, size?: number, ground?: GroundPalette): Tile;
export function plazaTile(seed: number, size?: number, ground?: GroundPalette): Tile;
export function dirtTile(seed: number, size?: number, ground?: GroundPalette): Tile;
```

and `grassTile` / `cobbleTile` gain the same optional third parameter, defaulting to `paletteFor("bright").ground`, so the two existing call sites and both existing assertions in `tiles.test.ts` keep working unchanged.

### 3.8 Decorations: inward, varied, rescaled

`DECOR_SPOTS` (`layout.ts:90-103`) is deleted — twelve hand-typed singletons, ten of them on a rim that no longer exists in a 64-unit world. `DECOR_KINDS` and `DecorFigure` move out of `world-figures.tsx` into `village-figures.tsx` and become six of the twenty `PROP_KINDS`, repainted from `palette.ts` and rescaled onto slice 2's ladder against the 2-unit hero:

| kind | w × h (world units) | was |
|---|---|---|
| `oak`, `oak-2` | 4.0 × 5.0 | 1.2 × 1.6 |
| `pine`, `pine-2` | 3.4 × 6.0 | 1.2 × 1.6 |
| `bush` | 1.2 × 1.0 | 0.9 × 0.9 |
| `rock` | 1.4 × 1.0 | 0.9 × 0.9 |
| `fence` | 2.4 × 1.2 | 0.9 × 0.9 |
| `lantern` | 0.8 × 2.5 | 0.9 × 0.9 |

Trees stop being shorter than the person walking past them, the fence's three-post span stops being squashed into a square, and lanterns become the 2.5-unit lamp posts the plaza and the gate need. The new kinds' footprints: `stall 3.0 × 2.6`, `cart 2.2 × 1.4`, `crate 0.8 × 0.8`, `barrel 0.7 × 0.9`, `sack-pile 0.9 × 0.7`, `hedge 1.8 × 1.1`, `hay-bale 1.2 × 1.0`, `washing-line 3.2 × 1.8`, `planter 1.0 × 0.8`, `water-trough 1.6 × 0.6`, `log-pile 1.6 × 0.9`, `reeds 1.2 × 1.0`, `bench 1.4 × 0.8`, `fingerpost 1.4 × 2.4`, district sign `3.0 × 2.0`.

Every prop figure carries a 1-unit `palette.outline` keyline on its silhouette. That, plus slice 1's contact shadow, is what guarantees separation even where a hue lands close to the grass — and it is why the treeline can stay green.

**The garden repaint.** The contents of this slice call for repainting the garden away from `#5aa55a`/`#3d8a4a` on `#2e5a3a` grass. Done here as a *palette* repaint — the arbour and beds move to `woodLight`, `soil`, `leafLight` and gold/pink flowers, with the outline keyline — while the garden's *geometry* redraw (a walled place with a fence, arbour and path, as the audit's fix describes) is slice 11's, with the other seven buildings. That split is deliberate: this slice is allowed to touch colour everywhere and shape nowhere except its own props.

### 3.9 Calm mode: quieter, not emptier

`realm-shell.tsx:215` and `:223` pass `decor: !settings.calmPalette`. Both are deleted. `buildWorldLayout`'s `decor` input is removed; the `world` memo becomes `{ castleType, palette: paletteVariantFor(settings) }`.

Calm is now three things:
1. **The muted palette variant** (§3.1), baked into the rasterised figures and the tiles, not multiplied on by a grey `spriteMaterial.color`.
2. **No ambient motion.** `renderSettingsFor` already sets `motion: false` when `lowStimulus` is true; the sway, the lamp pulse and the reflection scroll all read that flag and stop at their mid frame.
3. **Density × 0.6**, and only that. `CALM_DENSITY = 0.6`, applied by keeping props whose `rank < 0.6`. Because `rank` is stable per seed, **the calm town is a strict subset of the bright town** — the same barrels in the same places, fewer of them. `props.test.ts` asserts `seedProps({density:"calm"})` is a subset of `seedProps({density:"full"})` by id.

Floors, which is the part the finding demands: every district keeps its sign; the Market Plaza keeps all four stalls (they are the place, not decoration); every district keeps at least ten props. A calm town is ≈58 props against a bright town's ≈96. It is never 32 props and zero decoration, and it is never a different town from the one the child's sibling sees.

### 3.10 Rendering: `village-layer.tsx`

A new `src/components/realm/village-layer.tsx` — a `*-layer.tsx`, so three imports are allowed there.

```tsx
export type VillageLayerProps = {
  scenery: SeededProp[];
  signs: DistrictSign[];
  textures: SpriteTextures;
  palette: Palette;
  motion: boolean;
  onSignTap: (districtId: DistrictId) => void;
};
export function VillageLayer(props: VillageLayerProps): JSX.Element;
```

- **Shared materials.** One `THREE.SpriteMaterial` per `(kind, tint)` pair, built in a `useMemo` on `[textures.props, palette]` and attached with `material={…}`. Ninety-six sprites cost twenty materials and twenty textures. Materials are disposed in the memo's cleanup.
- **Baseline anchoring** comes from slice 2: `material.center = (0.5, 0)` and the sprite placed at the ground point, so a barrel's painted base sits on the ground rather than 0.09 h below it.
- **Per-instance transform** is `scale.set(size.w * scale * (mirrored ? -1 : 1), size.h * scale, 1)`. No rotation, ever (D5.4).
- **Ambient motion**, all gated on `motion`: reeds and washing lines bob ≤ 0.04 units vertically at 0.6 Hz with per-instance phase `rank * 2π`; lanterns pulse their glow quad between 0.7 and 1.0 opacity at 0.5 Hz (lanterns get per-instance materials — there are six of them). The reflection band scrolls. Nothing else moves. **No information is carried by any of it**, which is why the non-motion substitute is simply the static mid frame rather than a second channel: with `motion` false the lamps sit at 0.85 opacity, lit, and the reeds stand upright.
- **Signs** render as a sprite plus an invisible pointer plane sized to at least 56 CSS px at the current zoom, with `onPointerDown` → `e.stopPropagation()` → `onSignTap(districtId)`. Stopping propagation matters: without it the tap falls through to the ground mesh at `realm-scene.tsx:253` and walks the hero somewhere they did not ask to go, which is the exact failure slice 1 fixed for villagers.
- **A missing texture draws nothing.** No box fallback for scenery, matching the existing decor behaviour at `realm-scene.tsx:315` — a grey cube in a market square is worse than an absent barrel.

`realm-scene.tsx` changes: `standing` (line 243) keeps its four kinds and gains nothing, because `"scenery"` and `"sign"` are excluded; `<VillageLayer>` mounts alongside `<SpellLayer>`, `<RecessLayer>` and `<CeremonyLayer>`; `RealmSceneProps` gains `scenery`, `signs`, `palette` and `onDistrictArrival`; the arrival ref is stepped inside the existing `useFrame`, after the camera follow.

**Referential stability.** `scenery`, `signs` and `palette` are memoised in the shell on `[layout]`, `[layout]` and `[settings.calmPalette]` respectively, and `onDistrictArrival` / `onSignTap` are `useCallback`s with empty-ish deps. The `World` memo (`realm-scene.tsx:71`) is shielding the scene from roughly five re-renders a second of `setMana`; nothing here is allowed to punch through it.

### 3.11 Rasterisation: two waves and the budget

`SpriteSource` gains one prop and one callback:

```ts
village?: { palette: PaletteVariant; kinds: readonly PropKindId[]; signs: readonly DistrictId[] } | null;  // must be memoised
onVillageReady?: (textures: { props: Record<string, THREE.CanvasTexture>; signs: Record<string, THREE.CanvasTexture> }) => void;
```

and `SpriteTextures` gains `props: Record<string, THREE.CanvasTexture>` and `signs: Record<string, THREE.CanvasTexture>`, both keyed `kind:variant` / `districtId:variant`.

**Wave 1 — nine new kinds, inside the `onReady` batch:** `stall`, `crate`, `barrel`, `cart`, `fingerpost`, and the four district signs. These are what a child needs in order to read the town on the first frame.

**Wave 2 — eleven new kinds, after `onReady` resolves:** `hedge`, `hay-bale`, `washing-line`, `planter`, `water-trough`, `log-pile`, `reeds`, `bench`, `sack-pile`, `oak-2`, `pine-2`. They rasterise in a second parallel batch and land through `onVillageReady`, which merges them into the textures object. The layer renders whatever is present, so the ambience fills in over a few hundred milliseconds rather than holding the world shut.

Wave 2 is **held until any pending ceremony reaches `done`** (`ceremonyStage`, `realm-shell.tsx`), so nothing pops into frame during the crown walk — the emotional payoff of a whole season is not the moment to have hay bales appear.

**The bill.** Current kind count in `sprite-source.tsx` is 34–37 depending on which optional paths are active (hero, companion, 8 villagers, 3 troubles, mount + mounted rider, gleam, banner, crown, castle banner, 1 castle, 8 buildings, foundation, 6 decor, 2 tiles). Slice 4 adds the gate, the wall, the plaza and road tiles and the bridge deck. **This slice adds 20 new kinds** — 9 before first paint, 11 after — plus four new tiles, and repaints six existing decor kinds at no new cost. Running total ≈ 58–61 kinds, of which ≈ 45 block first paint. Six of the twenty new kinds carry more than one instance; the heaviest, `crate`, carries fourteen — and costs one rasterisation. Measured first-paint effect is a browser-pass gate (§7), not a claim made here.

**One extra `World` re-render.** `onVillageReady` calls `setTextures`, which re-renders `World` once. Hero position, camera target, companion, spell sim, recess sim and ceremony state all live in refs (`realm-scene.tsx:73-90`), so nothing resets and nothing jumps. That is the entire cost of the second wave, and it is stated so no later slice is surprised by it.

### 3.12 Copy, verbatim

Every string a person reads because of this slice.

**Carved into the world** (uppercase, drawn as pixels, not DOM, two rows per board): `GATE QUARTER`, `SCHOLARS' ROW`, `MARKET PLAZA`, `CHAPEL HILL`, `MILLRACE`, `GARDEN TERRACE`, `KEEP APPROACH`, `WATCH HILL`.

**Arrival, in the centred message lane** — full depth, simple depth and spoken: all twenty-four strings are in §3.6 and are not repeated here.

**Sign tap** produces the arrival copy for that district. There is no bubble and no prompt string: the sign is a 56-px target that speaks when pressed, which is one fewer thing on screen than a prompt.

**The one error string a child can see**, shown as a toast in the message lane if a whole rasterisation batch rejects:

> Part of the village didn't draw. Everything still works.

Read aloud, if `readAloud` is on:

> Part of the village didn't draw. Everything still works.

No retry button. A retry would re-pay the whole rasterisation bill and cost first paint a second time, to recover some barrels. Per-kind failures produce no child-facing string at all — a single `console.warn("A village prop could not be drawn", kind)`, once per kind, and that kind is simply absent. This is a deliberate exception to "every error has copy": an error banner about a barrel is worse than the missing barrel.

**Parent preview** adds no new strings. The district arrival renders for a previewing adult exactly as it does for the child (§6).

---

## 4. Data model

**No schema change. No migration. No new column, table, index or JSON field.**

This slice reserves no migration number and none is set aside for it. Numbers are drizzle-kit's, assigned in build order to the seven slices that actually take one (1, 7, 8, 9, 10, 12, 13).

**What existing rows do:** nothing changes for them. The town is derived, not stored: `townSeed(childId)` hashes the child's existing id, so every child who has ever opened the Realm has a town the moment this ships, and it is the same town on their tablet as on the family laptop.

**Why derived rather than stored.** A stored prop layout would need a migration, a backfill for every existing child, a conflict rule when the plan changes, and a decision about what happens to a stored barrel whose coordinates fall inside a building the next slice adds. A derived layout has none of those, costs one hash, and is verified by a determinism test rather than by trusting a backfill.

**The honest cost of that choice.** `PROP_SEED_VERSION` is a module constant, and bumping it re-rolls every child's town. Slices 10 and 11 will change the building footprints and the plot geometry, which changes rule 4's exclusion zones, which moves some props. A child who has learned "my cart is by the mill" may find it two units left after an update. We accept this: the alternative is storage, and the mitigation is that the seeded rank ordering keeps changes local — a footprint change moves the props it collides with and leaves the other ninety alone. `PROP_SEED_VERSION` is bumped only deliberately, never as a side effect, and any slice that bumps it says so in its own spec.

**Who actually bumps it, decided here rather than left to discovery.** Slice 11 changes seven of eight building footprints, which changes rule 4's exclusion zones. **Slice 11 bumps `PROP_SEED_VERSION` to 2**, once, in the same commit as the redraw, and shows the child a single toast on their next visit, in slice 1's message lane at `notice` priority, verbatim:

> `The builders tidied the town while you were away.`

Read aloud, the same sentence. There is no control and no undo — there is nothing to undo, because nothing was stored — and it appears exactly once, gated on a `prop_seed_version` value the child's `realm_settings` row does not have and does not need: the toast is shown when the town a child sees differs from the one they last saw, which is knowable only from the version constant, so it is shown to **everyone** on the first visit after the bump and to nobody after. Slice 10 changes no footprint (plots and signs are non-solid and sit inside existing exclusions) and does **not** bump it.

**What is *not* stored and must not become stored later without a spec:** the calm density factor (derived from `lowStimulus`), the palette variant (derived from `lowStimulus`), and district arrival "seen" state (per visit, in a ref, deliberately forgotten — a child should be told where they are again tomorrow).

---

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| One prop kind fails to rasterise | That kind is absent. `console.warn` once. No child-facing string, no box fallback (matches `realm-scene.tsx:315`). |
| A district sign fails to rasterise | The board is absent; the **arrival announcement still fires**, so the district still teaches its name. The tap target is not rendered (nothing to tap). |
| A whole rasterisation batch rejects | One toast: "Part of the village didn't draw. Everything still works." `console.error`. The world remains fully playable — buildings, villagers, roads and the keep come from other batches. |
| Wave 2 resolves after unmount | The existing `cancelled` flag pattern (`sprite-source.tsx:94, 163`) covers it; `onVillageReady` is not called. |
| Wave 2 resolves during a ceremony | Held until `ceremonyStage === "done"`, then merged. Nothing appears mid-ceremony. |
| A district's quota cannot be filled | Slots that exhaust 24 attempts are dropped. `seedProps` is bounded and cannot loop. The test asserts ≥ 80% of `PROP_BUDGET` is placed on the real layout; below that is a layout bug, not a runtime error. |
| `childId` is empty or missing | `townSeed("")` returns a fixed constant. The town renders; it is simply the same town for everyone in that (impossible) state. |
| A building completes mid-visit | `layout` re-memoises, `seedProps` re-runs with the same seed. Rule 4 excluded that building's padded footprint from the start, so no prop was ever inside it and nothing moves. `unstickHero` still runs on the collider change, as today. |
| The hero stands where a solid prop would seed | Cannot happen at mount (props seed before the hero moves) and cannot happen on re-seed (the set is identical for the same seed). If a future change makes it possible, `unstickHero` recovers. |
| `districtAt` returns `null` (the hero is in the wild between districts) | `stepArrival` sets `current: null` and announces nothing. Re-entering a district already in `seen` does not re-announce. Tapping its sign always does. |
| The hero crosses a district boundary repeatedly | Announced once per district per visit, by `seen`. Boundary jitter cannot produce a stutter. |
| `village.ts` publishes a district id with no copy entry | `DISTRICT_SIGN_COPY` is typed `Record<DistrictId, …>`, so this is a compile error, not a runtime fallback. A district cannot ship nameless. |
| A prop kind is added to `PROP_KINDS` with no footprint | `PROP_FOOTPRINTS` is typed `Record<PropKindId, …>` — compile error. |
| A palette token fails the separation test | `palette.test.ts` goes red. There is no runtime path; the colour never ships. |
| Calm mode with a very small district | The ten-prop floor and the sign are exempt from the density cut, so a small district never empties. |

---

## 6. Accessibility

### The complexity axis (decision 7)

This slice consumes `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1) and **adds one field to the shared `Surfaces` type**, per the programme rule that each surface unlocks in the slice that builds it:

```ts
districtDetail: boolean;   // true at full depth, false at simple depth
```

| Surface | Simple depth | Full depth |
|---|---|---|
| District arrival | `arrivalSimple` — the name alone, 3.2 s in the lane | `arrival` — the name and what is there, 2.4 s in the lane |
| District sign board | Name plus emblem | Name plus emblem — **identical** |
| Fingerposts | Emblem arms | Emblem arms — **identical** |
| Prop density | ≈96 props | ≈96 props — **identical** |

Two of the three invariants apply directly. **Depth is never a word a child reads** — nothing here says "simple", "full", "level" or "mode"; the only difference a child could ever notice is that one sentence is shorter. **Every simple-depth surface is a substitution, never a removal** — the arrival still fires, still speaks, still names the place; the older child gets the extra clause naming the buildings, and the younger child gets the name they can actually hold. Nothing is taken away, and in particular **the village is not simplified for a six-year-old**: density, signs and emblems are identical at both depths, because a busy town is not a complexity surface, it is the thing the user asked for.

The third invariant, `fewerChoices` capping `trackedObjectives` and `abilitySlots`, has no surface in this slice — see below.

**The patronising test.** A thirteen-year-old at full depth sees a town with named districts, carved signs, four market stalls, a river with reeds and a treeline, and a one-line arrival that tells them what a district holds. Nothing on that list reads as a children's mode. A six-year-old sees the same town and a two-word arrival read aloud. That is the whole axis in this slice, and it is deliberately small: the village is the surface that scales with the reader for free.

### Per learning-profile setting

| Setting | What this slice does |
|---|---|
| `reducedMotion` | `renderSettingsFor` already sets `motion: false`. Reed and washing sway, lantern pulse and reflection scroll all stop at their mid frame — lamps lit at 0.85, reeds upright, reflection static. No information is carried by any of that motion, so the substitute is the still frame and nothing is lost. This is deliberately unlike the existing combat particle (`spell-layer.tsx`), which is gated on `motion` and therefore erases 100% of combat feedback for exactly the children the setting exists for; that fix is slice 8's. |
| `lowStimulus` | §3.9 in full: muted palette variant, motion off, density × 0.6 with a ten-prop-per-district floor, all four stalls and every sign kept. `decor: !settings.calmPalette` is deleted from `realm-shell.tsx:215` and `:223`. Calm **mutes**; it no longer **empties**. |
| `largerText` | No baked text scales, so legibility is designed in rather than scaled up: sign glyphs are authored at 0.22 world units (≈16 screen px), the same height as the HUD's smallest type. The arrival toast is DOM and inherits `settings.hudScale` (1.25) through slice 1's lane. Arrival duration is multiplied by 1.5 when `largerText` is on, because a larger sentence takes longer to read. And the sign tap is the reread path: a child who missed it presses the board again. |
| `fewerChoices` | **No effect, deliberately.** This slice adds no menu, no picker and no branch. Density is a stimulus concern, not a choice count, so `fewerChoices` does not reduce props. Stated explicitly so no later slice wires it to density by analogy. |
| `readAloud` | `speak()` is called with the spoken variant on every arrival and every sign tap, behind a last-spoken ref so a boundary re-cross or a double tap cannot stutter it. Full depth uses `DISTRICT_SIGN_COPY[id].spokenFull`, simple depth uses `District.spoken` from `village.ts` — both written for the ear, not read off the sign: *"You're at the Millrace. The Grain Mill is here, and the River Bridge, and the water between them."* |
| `inputMode` (touch / keyboard / auto) | Sign tap targets are at least 56 CSS px at the current zoom, matching slice 1's raise from the 44-px adult minimum. Keyboard players never need the tap: arrival fires on entry, which is the primary channel; signs are world objects and are not in the tab order, by design, because thirty tab stops between a child and the Spellbook is worse than a sign they can walk past again. |
| `soundEnabled` | No sound in this slice. `onDistrictArrival` is the named hook slice 9 attaches the arrival chime to; it fires exactly once per district per visit, which is the right cadence for a sound. |
| `predictableRoutine` | The setting this slice serves best. `townSeed(childId)` means the town is bit-identical every visit, on every device, forever — the cart is where the cart was. |
| `readingFont` / `extraSpacing` | The arrival toast renders inside `.realm-root`, which already carries `readingAttributes(bundle.profile)` (`realm-shell.tsx`), so both apply to it with no new work. Carved sign text is art and does not change font — the spoken and toast paths are the accessible channels for it. |

### Parent preview (`isChildView: false`)

The preview nulls mana, cleared, ride and minutes and injects a hero selector. This slice's surfaces do not touch any of that.

- **Props, signs, the plaza and the river render identically in preview.** They are the child's world, and a parent looking at it should see what the child sees. Nothing here reads hero state, so nothing here can crash on nulled hero state.
- **District arrival renders in preview.** A parent walking the world gets the toast, because it is world information, not child state.
- **`speak()` is never called when `isChildView` is false.** The child's `readAloud` setting is the child's; an adult previewing at their desk did not ask the machine to talk.
- **No attribution surface exists in this slice**, so the snapshot-or-live rule has nothing to apply to here. The signboard (slice 10), the Tavern board (slice 6) and the session summary (slice 13) carry names; a district sign carries a place name and never a person's.

### The metered clock, in seconds

| Beat | Cost to the child's minutes |
|---|---|
| District arrival toast | **0 s.** Non-modal, non-blocking, the clock keeps running. Visible 2.4 s (full depth) / 3.2 s (simple) / ×1.5 with `largerText`. |
| Sign tap | **0 s.** Instant; announces on the same frame. |
| Wave-1 rasterisation | Target **≤ 120 ms** added to first paint, measured (§7). |
| Wave-2 rasterisation | **0 ms** added to first paint, by construction — it starts after `onReady`. |
| Traversal | **0 s of detour**, by construction. Props never enter a road corridor, never come within 1.2 u of a door spur endpoint, and the flood-fill test proves every destination is still reachable. A denser village must not make a child walk further to the same door. |
| Pauses | **None.** This slice pauses the clock nowhere. The only pause in the whole programme is slice 9's opening banner. |
| Exit paths | **None added.** `clock.flushPending()` on unmount is untouched; there is no new route out of the Realm here. |

### The economy

This slice touches the economy at zero points. It grants no minutes, spends no minutes, and gates nothing. No prop, sign, district or plaza stands between a child and a side quest, a villager, a door or their schoolwork — the flood-fill reachability test in §7 is exactly the proof of that claim, and it is the test that would go red if a later change violated it.

### The village invariants

The four statements every spec from slice 4 onward must make:

1. **No new solid's footprint grown by `HERO_RADIUS` intersects a road corridor.** Placement rule 2 rejects any candidate where `roadCorridorContains(p, HERO_RADIUS + 0.4)` is true, and `props.test.ts` re-asserts it against the produced set rather than trusting the sampler.
2. **Anything spawned on open ground goes through `open-ground.ts`'s `SPAWN_ZONES`.** This slice spawns nothing on open ground — it *reserves* open ground, by excluding every zone from placement (rule 1). Troubles and gleams are unchanged and unaffected.
3. **Any cross-map route uses `roadPath()` from `village.ts`.** This slice adds no route. The routes that exist — the ceremony walk, the recess lap, and slice 7's fast travel — are protected by rules 2 and 6 and by the reachability test, which includes every ceremony mark and every lap waypoint as a target.
4. **`unstickHero` can recover the hero from whatever this slice adds.** Five solid kinds, all convex, all axis-aligned, all at least 1.5 u apart, all against a wall or plaza edge. Slice 4's nearest-free-point `unstickHero` handles each of them, and `realm-scene.tsx:100-102` already runs it on every collider change.

*(Filename note: the brief calls the module `open-ground.ts`; the codebase convention throughout `src/lib/realm` is kebab-case — `sprite-texture.ts`, `render-settings.ts`, `play-clock.ts` — so this spec writes `open-ground.ts`. Slice 4 owns the file and the final name.)*

### The three.js boundary

`palette.ts`, `pixel-font.ts`, `props.ts`, `signage.ts` and `tiles.ts` are pure and import no three. `village-figures.tsx` renders SVG only — no three import, so it is testable under jsdom like `world-figures.tsx` is today. `village-layer.tsx` is a `*-layer.tsx` and is the only new file allowed a three import; it is not unit-tested and its correctness is a browser-pass question. Scene-to-React events (`onDistrictArrival`, `onSignTap`) go through `queueMicrotask`. No synchronous `setState` in an effect, no render-time ref write, and `useMemo` results — the material map, the scenery array, the sign array — are treated as immutable.

---

## 7. Testing

### Unit-testable (Vitest, jsdom, no three at module load)

**`src/lib/realm/palette.test.ts`**
- Every value in `props`, `accents` and `buildings` satisfies `separatesFromGround` against `grassA` and `grassB`, in **both** variants. This is the green-on-green finding made permanent.
- No environment value is within `MIN_SEPARATION` of `TROUBLE_VIOLET` **or** `TROUBLE_VIOLET_DEEP`.
- `ENVIRONMENT_COLORS` contains every hex reachable from `BRIGHT`, `CALM` and `MATERIALS` by structural walk, and contains neither violet. **The exhaustiveness guard:** a second test greps every figure module (`world-figures.tsx`, `village-figures.tsx`, and later `keep-figures.tsx`, `plot-figures.tsx`, `sign-figures.tsx`) for `#rrggbb` literals and fails on any that is not in `ENVIRONMENT_COLORS`. Without that grep the violet lock is only as good as an author's memory, which is how `#7d7d7d` came to be both a well and a rock.
- `BRIGHT` and `CALM` have identical key sets (a token added to one and forgotten in the other is a red test, not a missing colour at runtime).
- `CALM` has strictly lower chroma than `BRIGHT` for every token, and lightness contrast against the ground is **not** lower — calm must not become dim.
- `deltaE` against known OKLab pairs; `deltaE(x, x) === 0`; symmetry.
- `buildingColor(id)` covers all eight `BUILDINGS` ids and falls back for an unknown id.

**`src/lib/realm/pixel-font.test.ts`**
- Every character in every one of the four carved names has a glyph.
- `pixelTextWidth` equals the extent of `pixelTextRects`.
- Rects stay inside a stated box for the longest single row (`APPROACH`, 8 characters) at `scale: 2` inside the 96×64 sign viewBox, and two rows of that height fit vertically with the emblem.
- Unknown characters render as a space rather than throwing; lowercase input matches uppercase output.

**`src/lib/realm/props.test.ts`** — the heart of the slice.
- **Determinism:** two calls with the same seed are deeply equal; different seeds differ; the same seed on the same layout after a building completes produces the same ids in the same places.
- **Calm is a subset:** every id in `density:"calm"` appears in `density:"full"`, at the same position, with the same `mirrored` and `scale`.
- **Density floors:** calm keeps every sign, all four plaza stalls, and ≥ 10 props per district.
- **Spawn zones:** zero props inside any `SPAWN_ZONE` at full density; each zone retains clear area for `MAX_TROUBLES + GLEAM_COUNT` at their own clearances.
- **Corridors:** no prop, grown by `HERO_RADIUS`, satisfies `roadCorridorContains` — tested over every `ROAD_QUAD`, streets, spurs and plazas alike.
- **Doorsteps:** no prop within 1.2 u of any `doorPointFor(id)`; none within 2.0 u of any `villagerStandFor(id)`.
- **The keep precinct:** no prop inside `KEEP_PRECINCT`, at any density.
- **Building slots:** no prop inside any of the eight `BUILDING_SLOTS` footprints padded 1.5, built or unbuilt.
- **Solids:** every solid is in `PROP_SOLID_KINDS`; no two solids within 1.5 u; every solid within 2.5 u of a wall or plaza edge.
- **Reachability:** `propReachability` from `SPAWN` reaches every door spur endpoint, every villager stand, every district sign, every spawn zone centre, every `ceremonyMarks(layout)` mark, and every recess lap waypoint. **This is the acceptance test for "the hero can never be wedged."**
- **Variation:** no two props within 3 u share `(kind, mirrored, scale)`; `scale` is always in `PROP_SCALES`; `rotation` does not exist on the type.
- **Budget:** ≥ 80% of `PROP_BUDGET` placed on the real layout; `DISTRICT_QUOTA` sums to `PROP_BUDGET`; the function terminates on a fully blocked layout (the pattern `recess.test.ts` already uses for `spawnGleams`).
- **`townSeed`:** stable, distinct for distinct ids, defined for `""`.

**`src/lib/realm/signage.test.ts`**
- `DISTRICT_SIGN_COPY` has an entry for every `DistrictId`; every `arrival`, `arrivalSimple` and `spoken` is non-empty; `arrival` ≤ 64 characters and `arrivalSimple` ≤ 20, so the lane never wraps to three lines.
- Every building named in an `arrival` string is a `BUILDINGS[].label` **and** is actually sited in that district by `village.ts` — the mechanical version of "no string may promise something the code does not do".
- `stepArrival` announces once per district, does not re-announce on return, announces nothing for `null`, and returns `arrivalSimple` when `districtDetail` is false.
- `announceFor` always returns copy, regardless of `seen`.
- `districtSigns(layout)` returns one sign per district, none inside a road corridor.

**`src/lib/realm/tiles.test.ts`** (extended)
- `waterTile`, `bankTile`, `plazaTile`, `dirtTile`: deterministic per seed, correct size, every colour drawn from the supplied `GroundPalette`.
- `grassTile(7)` and `cobbleTile(11)` still pass their two existing assertions with the new optional third parameter defaulted.

**`src/components/realm/village-figures.test.tsx`**
- `assertInside` (the existing helper, `world-figures.test.tsx:9`) for every `PROP_KIND` against its declared viewBox, and for all four district signs against 96×64.
- **Every `fill` attribute in every figure is a value present in the palette.** This is the one-palette rule made mechanical: an inline hex cannot be reintroduced without a red test.
- Every prop figure carries an outline element in `palette.outline`.
- `PROP_KINDS`, `WAVE_ONE_KINDS` and `WAVE_TWO_KINDS` partition correctly and `PROP_FOOTPRINTS` covers all of them.

**Existing tests that must change in the same commit**
- `src/lib/realm/layout.test.ts:124-165` — the twelve-decoration block. `DECOR_SPOTS` is gone; these become scenery assertions delegated to `props.test.ts`, and `buildWorldLayout` without a `seed` must still produce zero scenery so the other layout tests are unaffected.
- `src/components/realm/world-figures.test.tsx` — the `DECOR_KINDS` / `DecorFigure` block moves to `village-figures.test.tsx`.
- `src/components/realm/realm-shell.test.tsx` — any assertion on `decor: !settings.calmPalette`.

### Needs the browser pass (port 3100, `?preview`, per `reference_local_screenshot_setup`)

Unit tests cannot judge whether a town looks inhabited. These are the real acceptance criteria.

1. **Same-framing before/after screenshots of the two views the user photographed.** The standing rule for every slice in this programme.
2. **First paint, measured.** The delta between `SpriteSource` mount and `onReady`, before and after, on a cold load and on a return from the Spellbook (the warm-cache case slice 2 built). Gate: wave 1 adds ≤ 120 ms; wave 2 adds 0 ms to `onReady`.
3. **Props visible per screen**, counted from screenshots at the **Market Plaza** (quota 26), in the **Millrace** (14), on **Watch Hill** (8) and at the **Keep Approach** (6). The plaza should read as crowded, Watch Hill as sparse and the Keep Approach as deliberately clear.
4. **Calm mode beside bright**, same framing, same hero position. The judgement: quieter, not emptier. If the calm shot reads as a different, poorer town, `CALM_DENSITY` is wrong.
5. **Walk the whole road network and every district**, on touch and on keyboard, and confirm no wedge — the flood fill says it is impossible, and the browser pass is where we find out whether the flood fill modelled the right thing.
6. **The water band while the camera follows.** No shimmer, no crawl, no seam at the strip's UV repeat.
7. **Sign legibility at the real zoom**, on a 1x and a 2x display, at `hudScale` 1 and 1.25.
8. **Tap every district sign** and confirm the announcement fires, the hero does not walk, and speech does not stutter on a double tap.
9. **A ceremony with wave 2 pending** — start the crown walk before the second batch lands and confirm nothing appears mid-ceremony.
10. **`/dev/figures`** (slice 2's gallery) rendering all twenty prop kinds at true display size against both palettes with the 2-unit hero ruler. This is what turns the art from one blind pass into ten.
11. **CHECKPOINT 2.** The user replays and re-judges "should be WAY more development in the world" before `doors-and-the-tavern` starts. The plan is allowed to change here.

---

## 8. Interfaces

### Produces

**`src/lib/realm/palette.ts`**
```ts
export type PaletteVariant = "bright" | "calm";
export type GroundPalette = { grassA: string; grassB: string; tuft: string; flowers: string[]; dirt: string; dirtDark: string; road: string; roadMortar: string; plaza: string; plazaMortar: string; water: string; waterDeep: string; waterEdge: string; foam: string; bank: string; reed: string };
export type PropPalette = { wood: string; woodLight: string; woodDark: string; stone: string; stoneLight: string; stoneDark: string; plaster: string; plasterShade: string; thatch: string; thatchDark: string; cloth: string; clothLight: string; clothShade: string; leaf: string; leafLight: string; pine: string; pineLight: string; iron: string; rope: string; soil: string };
export type AccentPalette = { gold: string; flag: string; lamp: string; ropeGold: string };
export type Palette = { variant: PaletteVariant; ground: GroundPalette; props: PropPalette; accents: AccentPalette; outline: string; shadow: string; buildings: Record<string, string> };
export const BRIGHT: Palette;
export const CALM: Palette;
export const MIN_SEPARATION: number;          // 12
export const TROUBLE_VIOLET: string;          // "#a78bfa" — reserved for slice 8
export const TROUBLE_VIOLET_DEEP: string;     // "#7c3aed" — reserved for slice 8
export const ENVIRONMENT_COLORS: readonly string[];  // the flat, exhaustive list slice 8's lock test reads
export type Shade = { lit: string; mid: string; shade: string };
export type MaterialName = "stone" | "cutStone" | "plaster" | "timber" | "darkTimber" | "thatch" | "slate" | "tile" | "lead" | "glass" | "water" | "soil" | "iron" | "canvas" | "brass";
export const MATERIALS: Record<MaterialName, Shade>;   // slice 11 draws every wall, roof and face from these
export const ACCENT_GOLD: string;                      // "#f2d16b"
export function material(name: MaterialName, palette?: Palette): Shade;
export function paletteFor(variant: PaletteVariant): Palette;
export function paletteVariantFor(settings: { calmPalette: boolean }): PaletteVariant;
export function buildingColor(id: string, palette?: Palette): string;
export function deltaE(a: string, b: string): number;
export function separatesFromGround(color: string, palette: Palette): boolean;
```
**There is no `world-palette.ts`.** Slice 11 extends this module. Slice 8 consumes `ENVIRONMENT_COLORS`, `TROUBLE_VIOLET` and `TROUBLE_VIOLET_DEEP` and declares none of them.

**`src/lib/realm/pixel-font.ts`**
```ts
export type PixelRect = { x: number; y: number; w: number; h: number };
export type PixelTextOptions = { x: number; y: number; scale?: number; letterSpacing?: number; align?: "left" | "center" };
export const GLYPH_W: number;                 // 5
export const GLYPH_H: number;                 // 7
export const FONT_5X7: Record<string, readonly string[]>;
export function pixelTextRects(text: string, opts: PixelTextOptions): PixelRect[];
export function pixelTextWidth(text: string, opts?: { scale?: number; letterSpacing?: number }): number;
```

**`src/lib/realm/props.ts`**
```ts
export type PropKindId = "stall" | "crate" | "barrel" | "cart" | "fingerpost" | "hedge" | "hay-bale" | "washing-line" | "planter" | "water-trough" | "log-pile" | "reeds" | "bench" | "sack-pile" | "oak" | "oak-2" | "pine" | "pine-2" | "bush" | "rock" | "fence" | "lantern";
export type PropDensity = "full" | "calm";
export type SeededProp = { id: string; kind: PropKindId; districtId: DistrictId; position: Vec2; size: { w: number; d: number; h: number }; rank: number; mirrored: boolean; scale: number; tint: string | null; solid: boolean; swaying: boolean };
export type SeedPropsInput = { layout: WorldLayout; seed: number; density?: PropDensity; palette?: Palette };
export function seedProps(input: SeedPropsInput): SeededProp[];
export function townSeed(childId: string): number;
export function propsToLayoutProps(props: SeededProp[]): Prop[];
export function propReachability(input: { colliders: Prop[]; start: Vec2; bounds: number; step?: number }): { cells: Set<string>; reaches(target: Vec2): boolean };
export const PROP_KINDS: readonly PropKindId[];
export const WAVE_ONE_KINDS: readonly PropKindId[];
export const WAVE_TWO_KINDS: readonly PropKindId[];
export const PROP_FOOTPRINTS: Record<PropKindId, { w: number; d: number; h: number }>;
export const PROP_SOLID_KINDS: ReadonlySet<PropKindId>;
export const PROP_SCALES: readonly number[];  // [0.875, 1, 1.125]
export const PROP_BUDGET: number;             // 96
export const CALM_DENSITY: number;            // 0.6
export const DISTRICT_QUOTA: Record<DistrictId, number>;
export const PROP_SEED_VERSION: number;       // 1
```

**`src/lib/realm/signage.ts`**
```ts
export type EmblemId = "arch" | "book" | "basket" | "bell" | "wave" | "leaf" | "crown" | "lantern";  // one per district
export type DistrictSign = { id: string; districtId: DistrictId; position: Vec2; facing: Facing; carved: string; emblem: EmblemId };
export type DistrictSignCopy = { carved: string; emblem: EmblemId; arrival: string; arrivalSimple: string; spokenFull: string };
// No `spoken` field: the simple-depth spoken line is District.spoken from village.ts, read not copied.
export type DistrictArrival = { districtId: DistrictId; text: string; spoken: string };
export type ArrivalState = { current: DistrictId | null; seen: DistrictId[] };
export const DISTRICT_SIGN_COPY: Record<DistrictId, DistrictSignCopy>;
export const DISTRICT_SIGN_VIEWBOX: { w: number; h: number };   // { w: 96, h: 64 }
// Named DISTRICT_* because slice 10's sign.ts ships SIGN_SIZE / SIGN_ROWS / SIGN_MAX_CHARS for the
// per-building signboards, which are a different object on a different post. Two modules,
// two prefixes, one pixel font (pixel-font.ts) shared between them.
export const DISTRICT_SIGN_SIZE: { w: number; h: number };               // { w: 3.0, h: 2.0 } world units
export function districtSigns(layout: WorldLayout): DistrictSign[];
export function startArrivals(): ArrivalState;
export function stepArrival(state: ArrivalState, at: DistrictId | null, surfaces: { districtDetail: boolean }): { state: ArrivalState; announce: DistrictArrival | null };
export function announceFor(districtId: DistrictId, surfaces: { districtDetail: boolean }): DistrictArrival;
```

**`src/lib/realm/tiles.ts`** — one accumulating file, three slices. Each row says who created it and what this slice adds.
```ts
export function waterTile(seed: number, size?: number, ground?: GroundPalette): Tile;   // created slice 4; palette parameter added here
export function bankTile(seed: number, size?: number, ground?: GroundPalette): Tile;    // NEW here
export function plazaTile(seed: number, size?: number, ground?: GroundPalette): Tile;   // NEW here
export function dirtTile(seed: number, size?: number, ground?: GroundPalette): Tile;    // created slice 2; palette parameter added here
export function grassTile(seed: number, size?: number, ground?: GroundPalette): Tile;   // existing; palette parameter added here
export function cobbleTile(seed: number, size?: number, ground?: GroundPalette): Tile;  // existing; palette parameter added here
// Unchanged and NOT re-declared: TILE_WORLD (3.2), TILE_CELLS, GRASS_REPEAT — all slice 2's, and
// GRASS_REPEAT's divisor stays TILE_WORLD (slice 4 §3.1).
```

**`src/lib/realm/layout.ts`** (changes)
```ts
// The FULL accumulated union, diffed against slice 4: "water" is slice 4's and survives; this slice
// removes "decor" and adds "scenery" and "sign". Slices 6 and 7 append "landmark" and "hitch".
export type PropKind =
  | "castle" | "building" | "foundation" | "path" | "villager" | "barrier" | "banner"
  | "water"      // slice 4 — the river. Deleting it would delete the river's colliders.
  | "scenery"    // this slice
  | "sign";      // this slice

// The FULL accumulated WorldLayout at this point in the programme.
export type WorldLayout = {
  props: Prop[]; spawn: Vec2; colliders: Prop[]; villagers: VillagerPlacement[]; castleType: string;
  scenery: SeededProp[];
  districtSigns: DistrictSign[];   // the carved district markers. NOT `signs` — slice 10 owns that name
                                   // for its per-building signboards, which are a different object.
};

export function buildWorldLayout(input: {
  castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number;
  objectiveIds?: string[];                                   // slice 1 — kept, not dropped
  seed?: number; density?: PropDensity; palette?: PaletteVariant;   // this slice
}): WorldLayout;
// REMOVED by this slice: BUILDING_COLORS, DECOR_SPOTS, the `decor` input.
// Omitting `seed` produces `scenery: []` and `districtSigns: []`, so existing tests are unaffected.
```

**`src/components/realm/village-figures.tsx`**
```tsx
export function PropFigure({ kind, palette }: { kind: PropKindId; palette: Palette }): JSX.Element;   // data-figure="prop" data-figure-id={kind}
export function DistrictSignFigure({ districtId, palette }: { districtId: DistrictId; palette: Palette }): JSX.Element; // data-figure="sign" data-figure-id={districtId}
export const PROP_VIEWBOX: Record<PropKindId, { w: number; h: number }>;
```

**`src/components/realm/village-layer.tsx`**
```tsx
export type VillageLayerProps = { scenery: SeededProp[]; districtSigns: DistrictSign[]; textures: SpriteTextures; palette: Palette; motion: boolean; onSignTap: (districtId: DistrictId) => void };
export function VillageLayer(props: VillageLayerProps): JSX.Element;
```

**`src/components/realm/sprite-source.tsx`** (additions)
```ts
export type SpriteTextures = { /* …existing… */ props: Record<string, THREE.CanvasTexture>; signs: Record<string, THREE.CanvasTexture> };
// The FULL accumulated SpriteSource surface at this point, diffed against slice 2:
//   onReady: (textures: SpriteTextures, stats: { ms; entries; texels; fromCache }) => void   (slice 2 — kept)
//   dpr: DprBucket                                                                          (slice 2 — kept)
//   village?: { palette: PaletteVariant; kinds: readonly PropKindId[]; signs: readonly DistrictId[] } | null  (NEW, must be memoised)
//   onVillageReady?: (t: { props: Record<string, THREE.CanvasTexture>; signs: Record<string, THREE.CanvasTexture> }) => void  (NEW)
// texture cache keys follow slice 2's family:id rule — `prop:${kind}:${variant}` and `sign:${districtId}:${variant}`
// the `world` prop becomes { castleType: string; palette: PaletteVariant }  ("decor" removed)
```

**`src/components/realm/realm-scene.tsx`** (`RealmSceneProps` additions)
```ts
scenery: SeededProp[];                    // memoised on [layout]
signs: DistrictSign[];                    // memoised on [layout]
palette: Palette;                         // memoised on [settings.calmPalette]
surfaces: { districtDetail: boolean };    // from surfacesFor(); memoised
onDistrictArrival: (a: DistrictArrival) => void;   // useCallback; emitted via queueMicrotask
```

**`src/lib/realm/depth.ts`** (one field added to slice 1's `Surfaces`)
```ts
districtDetail: boolean;   // true at full depth, false at simple depth
```

**CSS classes** (`src/app/globals.css`)
```
.realm-arrival            /* the arrival pill inside slice 1's message lane */
.realm-arrival-emblem     /* the district emblem beside the name */
.realm-arrival-name       /* the district name */
```

**Routes:** none added. `/dev/figures` (slice 2's) gains this slice's twenty kinds and four signs.

### Consumes

**From slice 2 `sprite-budget-and-gallery`**
- `rasterScaleFor(quad: { w: number; h: number }, dpr: DprBucket): number` and the deleted `WORLD_SPRITE_SCALE` — every prop and sign rasterises through the derived budget, never a fixed constant.
- `registerFigures(entries)` and `FIGURE_CATALOG` — **every one of this slice's twenty-two prop kinds and eight district signs is a catalog row**, filling slice 2's deliberately-empty `village` and `sign` families. No prop adds a case to `spriteSizeFor`, and `PROP_VIEWBOX` is the catalog's `grid` per row rather than a parallel table.
- `BUILDING_HEIGHTS` — the height ladder. Footprints come from slice 4's `BUILDING_FOOTPRINTS`, not from here.
- Baseline anchoring: `spriteMaterial.center = (0.5, 0)` and ground-point placement, via `baseAnchor(grid, baselineRow)`.
- Parallelised awaits and the cache kept warm across a short round trip in `sprite-texture.ts` / `sprite-source.tsx`.
- The scale ladder against the 2-unit hero (bush 1, fence 2.4 wide, lantern 2.5, oak 5, pine 6), **as re-snapped by slice 4 at `CAMERA_ZOOM` 64** (slice 4 §3.9). Every prop size in §3.8 is on the finer 1.0-unit lattice, not slice 2's 1.6.
- `/dev/figures` and `GROUND_Y` (slice 1's named ladder) — no y literal anywhere in this slice.

**From slice 4 `village-ground`** — `src/lib/realm/village.ts`, against its frozen §8.1 contract
- `DistrictId`, `Facing` and `DISTRICTS: District[]` with, per district, `id`, `name`, `label`, `spoken`, `centre`, `entrance: Vec2`, `entranceFacing: Facing`, `bounds: Rect` and `buildingIds`. **Districts are rectangles, not polygons** — `bounds` is the fill region and `districtAt` is the containment test.
- `districtAt(p: Vec2): DistrictId | null`, debounced by slice 4 behind a `lastDistrict` ref and a 1.5 s minimum.
- `districtFor(buildingId)`, `districtById(id)`.
- `ROAD_QUADS` and `roadCorridorContains(p, margin?)` — one call covering streets, spurs **and** plazas. (There is no `ROAD_CORRIDORS`, no `DOOR_SPURS` and no `PLAZA`.)
- `SITE_DOORS`, `doorPointFor(id)`, `villagerStandFor(id)`, `BUILDING_SLOTS`, `BUILDING_FOOTPRINTS` (nine plots, `{w,d,h}`), `KEEP_PRECINCT`.
- `routeBetween(from: Vec2, to: Vec2)` — the point-to-point router. (`roadPath` takes node **ids**; this slice never calls it.)
- `WATER_BANDS` — four rectangles with the two crossing gaps. **This is the river**, and this slice paints its banks, reeds and reflection band against the published band extent (centre z = −4, depth 3.5, so z ∈ [−5.75, −2.25]). There is no `RIVER_COURSE` and this slice adds none.
- `COURSE_NODES` — the recess lap course, for placement rule 6.
- `WORLD_SIZE = 64`, `CAMERA_ZOOM = 64` and the reframed camera.

**From slice 4** — `src/lib/realm/open-ground.ts`
- `SPAWN_ZONES: SpawnZone[]` (ten rectangles with weights) and `isOpenGround(p, layout, rules, hero?)`, plus `DECOR_RULES` — the rule set this slice's placement pass uses so props and spawns share one definition of "open".
- The strengthened multi-pass `unstickHero(state, colliders, rescue?)` in `movement.ts`.

**From slice 1 `first-impression`**
- `surfacesFor(depth, profile)` and `RealmDepth` from `src/lib/realm/depth.ts`, reading exactly one field: **`districtDetail: boolean`**. Slice 1's thirteen-field table is closed and already carries it; this slice adds nothing to `depth.ts`.
- The centred message lane (`realm-messages.tsx`) and its toast channel — arrivals enter at toast priority.
- The wired `speak()` helper and its last-spoken ref pattern.
- The contact-shadow decal (props tint it with `palette.shadow`).
- The 56-px world touch-target minimum.

**From the existing codebase**
- `seededRng` (`src/lib/utils/drill-generators.ts:17`), `BUILDINGS` (`src/lib/utils/kingdom.ts:7`), `HERO_RADIUS` (`movement.ts:5`), `ceremonyMarks` (`ceremony/ceremony.ts:49`), `MAX_TROUBLES` (`spells/troubles.ts:29`), `GLEAM_COUNT` (`recess/recess.ts:17`), `renderSettingsFor` (`render-settings.ts:13`), `readingAttributes`. (`LAP_WAYPOINTS` is **gone** — slice 4 deleted it; the lap is `COURSE_NODES`.)

**Published for later slices** — the names each will use: slice 6's Tavern stands in `gate-quarter`, on the plot slice 4 sited, and takes its name from `BUILDINGS`-style copy of its own, not from `DISTRICT_SIGN_COPY`; slice 7's fast-travel destinations are `DISTRICTS` and its labels are **`District.label`** from `village.ts`, not this module; slice 8's troubles become residents of `DistrictId` and spawn in `SPAWN_ZONES` this slice keeps clear; slice 10's plot signboards use `pixel-font.ts` and `buildingColor(id)`; slice 11 draws all eight buildings from `palette.ts` and is forbidden inline hex by `village-figures.test.tsx`'s palette assertion, extended to `world-figures.tsx`; slice 12's lap ring must stay 2.4 u clear of props, which placement rule 6 already enforces.

---

## 9. Out of scope

**Deferred to a named slice**
- **The eight kingdom buildings' geometry, the five keep stages and the Tavern figure** — slice 11 `building-redraw` (buildings, keep) and slice 6 `doors-and-the-tavern` (the Tavern). This slice repaints them from the palette and does not redraw a single roofline. That split is the whole reason art is authored here and not re-authored later: the twenty prop kinds are drawn once, in the 3/4 iso direction, on slice 2's fixed budget.
- **Plot signboards, the rising stone course, and the removal of the nine floating `.realm-label` pills** — slice 10 `plots-signs-and-the-keep`. This slice adds no DOM pill and no floating label; district names are carved into textures precisely so slice 10 has fewer, not more, pills to remove.
- **Zone-based trouble spawning** (replacing the foundation-anchored rule at `troubles.ts:100` so a finished kingdom is not inert), **trouble names and counts**, and **troubles as district residents** — slice 8 `troubles-that-read-and-pay`. This slice reserves the ground they will need and changes no line of `troubles.ts`.
- **Persisted gleams and lap times, and the lap ring moved onto the village road** — slice 12 `recess-that-counts`. This slice changes no line of `recess.ts` and keeps the current ring clear.
- **Sound** — slice 9 `sound-and-first-five-minutes`. `onDistrictArrival` is the hook.
- **Fast travel between districts** — slice 7. It consumes these names; it is not built here.
- **The camera, the world size, the road geometry, the wall, the gate, the river's course** — slice 4 `village-ground`. This slice paints the river; it does not route it.
- **Attribution** — slice 10 (the signboard) and slice 13 (the record). No surface here carries a child's name.
- **Numbers vs pips on district signs** — the pip/numeral vocabulary belongs to the objective card (slice 1) and the plot sign (slice 10). District signs carry a place name and an emblem at both depths and never a progress readout, which is also what keeps their textures static for the whole visit.

**Parked, with no slice**
- **Ambient wandering villagers, animals and crowds.** The audit's "Missing entirely" list names them and the fourth proposal wanted two or three villagers on short fixed routes. They are not in the thirteen-slice programme and this slice does not add them: eight NPCs who each mean something, plus a town full of their belongings, is a better answer to "development in the world" than background extras who mean nothing, and every moving figure is a raster kind, a pathing rule and a collision case.

  **But CHECKPOINT 2 is the end of *this* slice, so "revisit after it" is not a plan unless the lever is costed before the checkpoint, not invented under pressure at it.** It is costed here, and it is small:

  > **Two wanderers, `walker-a` and `walker-b`**, on fixed `roadPath` loops between named nodes — `gate-square → plaza → market-door → plaza → gate-square` and `plaza-w → row → ford-s → lane-w → mill-door → plaza-w` — stepped by the **existing** `stepCompanion` easing (`movement.ts:103-125`) with `goal` swapped at each waypoint, exactly as slice 7 does for the companion. **One** new sprite kind (`person:walker`, one figure mirrored and tinted twice), **zero** colliders, **zero** new pathing code, and the routes are already proved traversable by slice 4's 56-pair test. Cost: about half a day, well inside the slack a single-slice checkpoint response has.

  Three levers exist at CHECKPOINT 2 if the town still reads thin, in the order they should be tried: raise `PROP_BUDGET` and rebalance `DISTRICT_QUOTA` (hours), add the two wanderers above (half a day), author more prop kinds (days per kind). Naming them in that order now is what stops the checkpoint becoming a redesign.
- **Chimney smoke, turning mill sails, day/night, weather, elevation and terrain height.** All named in the audit's "Missing entirely" list, none in the programme. Smoke and sails in particular belong with the buildings that emit them, which are redrawn in slice 11 — if they happen, they happen there.
- **Building interiors.** Every building is a solid collider; slice 6 makes doors into route triggers, not rooms.
- **Sibling towns.** Decision 8 rules the family surface is a Tavern board (slice 6), not a visitable realm. A sibling's town is generated from their own `childId` and is never rendered here.

**A limitation stated rather than hidden**
- `PROP_SEED_VERSION` means a later footprint change can move a child's props. §4 states why we accept it, what bounds the damage, and that bumping the constant is always a deliberate act with a note in the bumping slice's spec.
