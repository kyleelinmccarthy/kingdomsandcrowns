# The frame cost, measured — and the deep water

Branch `realm-foundations`, from `971c592`. Two jobs: close the frame-budget question that has
been open since slice 1, and fix the one thing the ground pass left looking wrong.

---

## Job 1 — what was measured, how, and what it says

### The instrument

Frame **time** could not be resolved here and still cannot: SwiftShader on WSL is a CPU
rasteriser, the rAF clock here reports 86–144 ms/frame across runs of the *same* code, and the
hero's position after a timed walk is itself a function of frame time, so two runs do not even
stand in the same place. That is the same wall two acceptance passes hit.

So frame time is not what was measured. **Fill rate was**, and fill rate does not need a clock:

> A blended quad costs a shaded, blended, framebuffer-written fragment for **every screen pixel
> its footprint covers**, whatever the alpha of the texel there — the soft ground materials set
> `transparent` and no `alphaTest`, so a fully transparent texel was still a full fragment. The
> cost is therefore the screen-space area of the submitted quads, which is a function of pure
> layout data and the camera's own projection.

`scratchpad/overdraw.ts` is that instrument: it takes the real `buildWorldLayout()` output and
the real `worldToScreen()` from `camera.ts`, projects every ground patch and every prop shadow
onto a 1280×720 raster at `CAMERA_ZOOM` (40 px/unit), and counts layers per pixel. It is
deterministic, it runs in 0.4 s, and it reports three columns per camera:

- **submitted** — fragments the GPU shades, per screen pixel
- **inked** — of those, the ones whose *actual texel alpha* (read out of `surfaceTile()`, nearest
  filtering, exactly as the GPU samples it) is non-zero, i.e. what survives an alpha test
- **opaque** — the opaque ground passes, for scale

### What it found

Eight cameras, `decor` on, 1280×720. **Before** anything changed:

```
spawn       blended submitted 0.97x (p99  9, max 11)  inked 0.43x  opaque 1.16x
village     blended submitted 1.43x (p99  9, max 11)  inked 0.63x  opaque 1.09x
wood-edge   blended submitted 7.11x (p99 23, max 29)  inked 3.23x  opaque 1.21x
deep-wood   blended submitted 7.18x (p99 19, max 23)  inked 3.21x  opaque 1.13x
fells       blended submitted 6.93x (p99 21, max 24)  inked 3.06x  opaque 1.11x
longwater   blended submitted 1.85x (p99  7, max 10)  inked 0.85x  opaque 1.55x
fields      blended submitted 1.24x (p99  8, max 10)  inked 0.56x  opaque 1.78x
orchard     blended submitted 0.62x (p99  4, max  6)  inked 0.30x  opaque 1.14x
```

Per-layer, at `deep-wood`: `meadow 1.84, grove 4.71, scree 0.36, propShadow 0.25`.

Three findings, in order of how much they change the picture:

1. **The Old Wood and the fells cost 7.2 blended fragments per screen pixel, 23 layers deep at
   the 99th percentile.** At 1280×720 that is 6.6 M blended, framebuffer-writing fragments a
   frame. This is the number nobody had, and draw-call counting could never have seen it: the
   draw count in the wood is *thirty*.
2. **The ~1,950 scenery shadow quads are not the cost, and never were.** They contribute
   **0.01×–0.25×** at every camera. The suspicion recorded against them is refuted. They are
   small, sparse and cheap; leave them alone.
3. **57% of every feathered patch is fully transparent texels** — measured directly off the real
   tiles, not estimated. Of the 7.18× submitted in the wood, only 3.21× ever had anything in it.
   More than half the worst pass in the game was being spent on nothing at all.

### What was done about it

Two changes, both in `GroundBatch`, both with **zero visual change by construction**:

- **`SOFT_PATCH`** — feathered patches are drawn on a `CircleGeometry(0.5, 12)` instead of a
  quad. `feather()` zeroes alpha beyond `r = 0.92` (its `edge` is `0.52 + wobble * 0.4`,
  `wobble ≤ 1`), while a quad reaches `r = 1.414` into its corners. A regular 12-gon's inradius
  is `cos(15°) = 0.966` of its circumradius, so it contains the whole painted disc with margin
  and costs `3.00 r²` against the quad's `4.00`. `CircleGeometry`'s uv maps its bounding square
  to 0..1 exactly as `PlaneGeometry(1, 1)` does, so the tile lands identically.
- **`SOFT_ALPHA_TEST = 0.02`** — the soft materials now discard the transparent texels before the
  blend. The threshold is tiny on purpose: the feather's ramp is linear over the outer third of
  the disc and 0.02 drops only what rounds to nothing.

Re-measured, same instrument, same fixture:

```
                      submitted            inked
wood-edge    7.11x -> 5.42x  (-24%)   3.23x -> 3.23x
deep-wood    7.18x -> 5.42x  (-25%)   3.21x -> 3.21x
fells        6.93x -> 5.23x  (-25%)   3.06x -> 3.06x
village      1.43x -> 1.08x  (-24%)   0.63x -> 0.63x
longwater    1.85x -> 1.43x  (-23%)   0.85x -> 0.85x
```

**The `inked` column is identical to three significant figures at all eight cameras.** That is
the proof that the 12-gon clips nothing: it removed only fragments the tile had already zeroed.
A screenshot of the Old Wood confirms it (`scratchpad/wood-after.png`) — the floor still reads as
a wood with a ragged edge, no polygon silhouette anywhere.

So, in the worst place in the game:

| | before | after |
|---|---|---|
| fragments shaded | 7.18× | 5.42× (−25%) |
| fragments blended and written | 7.18× | 3.21× (**−55%**) |
| at 1280×720 | 6.6 M/frame | 3.0 M/frame |

### What is still unmeasured, and what would answer it

**No frame-time number is claimed, on any device.** What is now known is the fragment count; what
turns a fragment count into milliseconds is a device's blended fill rate, and nothing here can
supply that. Concretely, to close it:

- Run the realm on **the tablet the children actually use**, at the `wood-edge` camera, and read
  `EXT_disjoint_timer_query_webgl2` (available on any real GPU, absent under SwiftShader) or a
  300-frame rAF histogram in Chrome with the tab in the foreground.
- Make it a **counterfactual, not an absolute**: swap `SOFT_PATCH` back to `UNIT_PLANE` and drop
  `SOFT_ALPHA_TEST`, and measure the same fixture twice. That A/B changes *nothing but fragment
  count*, so the delta is a direct read of the device's blended fill rate — and this branch now
  knows exactly what the fragment delta is (3.97× of screen, per pixel), which is what makes the
  timing answer interpretable rather than another 0.42 ms shrug.
- A SwiftShader A/B was considered and rejected: at the one camera that is reproducible (spawn,
  standing still) the predicted delta is 0.24 fragments/pixel, below the noise floor that
  defeated two previous passes; and at the camera where it would show (the wood) the hero cannot
  be put in the same place twice, because where he ends up depends on the frame rate being
  measured.

Two caveats on the instrument itself, stated so nobody over-reads it:

- `inked` counts a texel as inked at alpha byte > 2, while the shipped `alphaTest` of 0.02 cuts
  at 5.1/255. The three byte values between are ≤ 2% alpha; the real saving is very slightly
  larger than reported, never smaller.
- The model counts fragments, not milliseconds, and it does not model early-Z, tile-based
  deferred rendering, texture-cache behaviour or the vertex cost of the extra 7,854 triangles the
  12-gon adds (against 2,071 instanced scenery quads — a rounding error).

### What was deliberately **not** changed

`inked` in the wood is 3.2×, and no geometry trick reduces it: blended overdraw is total painted
area ÷ region area, so making the grove's 338 patches fewer-and-bigger leaves it exactly where it
is. Cutting it means painting less forest floor, i.e. changing a look the user has just approved.
It is measured, it is recorded in the `GroundBatch` docblock, and it is the next lever if a real
device says the budget is still short.

---

## Job 2 — the deep water

The lake read as a hole cut in the ground: a large near-uniform blue against ground that now has
clumping, wash and grain everywhere else, with one set of ripple stripes across it.

**What it got, and why in this form.** Deep water cannot take the treatment the land got — the
deep rectangles *are* the colliders, so a feathered patch would put the edge a child sees in a
different place from the edge they bump into. So:

- **`DeepWater` in `realm-scene.tsx`** replaces the water `GroundBatch`. The four deep rectangles
  are **meshed**, not instanced: a vertex every 1.6 units, `waterShade` written into vertex
  colours once on mount, and uv in **world** units so one continuous ripple runs across all four
  with no seam at the joins. Because both the colour and the uv are functions of world position
  alone, the places where the lake's rectangles overlap paint exactly the same thing twice and
  the join is invisible — which is what lets the shape stay a union of rectangles, and the
  colliders stay exactly where they were.
- **`waterShade(x, z, bank, strength)` in `tiles.ts`** — `meadowShade`'s idea plus the one thing
  land has no use for: **depth**. `bank` is `bankDistance()` (new, in `layout.ts`, pure, tested):
  how far in from the nearest shore a point lies, taken as the *furthest-in* answer over the
  union so four rectangles shelve as one lake. Smoothstepped over `WATER_DEPTH_REACH = 7`. Water
  at the bank is ~30% paler and a touch green — water over a sandy bottom, and a plain hint about
  where a boat goes in; out in the middle it is darker and bluer. On top of that, a swell at a
  lake's scale, and cubed **glint lanes** of light lying across the open water only.
- **`rippleTile`** — one set of stripes is a barcode, which is what the lake was. Two wave sets
  now cross at a shallow angle, both phased by the wrapping noise field and both at whole numbers
  of periods across the tile, so the bands bunch and thin along their length and the tile still
  tiles seamlessly in both axes (which is what `DeepWater`'s world-space uv requires). Glints are
  short dashes lying along the bands. `WATER_TILE_UNITS = 3.6` sets the water pixel at ~4.4
  screen px, between the grass's 2.5 and the old lake's 10.8.

**How it was weighed against Job 1.** It costs nothing Job 1 is protecting: same one draw call,
same one material, same one texture, **opaque, depth-writing, not one blended fragment**, and
nothing touched per frame (`instPerFrame` 5600 → 5596, `drawsPerFrame` 30 → 30, measured in the
browser). Animation was considered and declined: a scrolling `texture.offset` really would be one
uniform write a frame and would not show up in the fill measurement at all — but with
`NearestFilter` pixel art a scrolling tile reads as crawling pixels rather than as water, and the
brief asks for charming rather than simulated. The variation is therefore all static.

**Did it work?** Measured off the two screenshots, at the scale the eye actually reads — mean
luminance of 3-world-unit blocks that are *entirely* water, which is well above the ripple
frequency and well below the lake:

```
before   17 blocks   min 56.1  median 58.3  max 60.1   spread max/min = 1.07
after    40 blocks   min 54.0  median 57.1  max 65.0   spread max/min = 1.20
```

The old lake varied by **7%** across its whole visible surface — which is what "reads flat" means
numerically. It now varies by **20%**, and the median barely moved (58.3 → 57.1), so the lake
gained a pale shelf and a dark middle without getting darker overall.

`lowStimulus` halves the swing, exactly as `meadowShade` does; it never flattens it.

---

## Verification

- `npx vitest run` — **127 files / 3210 tests, all passing**, no flakes on the run.
- `npx tsc --noEmit` — clean.
- `npm run lint` — the one pre-existing error at `src/components/quest-template-list.tsx:70`
  from `main`, and nothing new.
- Looked at in the running app on port 3177: `scratchpad/longwater-before.png` (flat lake),
  `scratchpad/lake2.png` (after), `scratchpad/wood-after.png` (the Old Wood, unchanged by the
  fill-rate work).
- New tests: `waterShade` shelving, bounds, calm and locality in `tiles.test.ts`; `bankDistance`
  over the union in `layout.test.ts`.

## Committed from a private index

Another agent had in-flight edits on disk in `realm-scene.tsx` (the SITE SPRITE block, the
`site:<id>:<stage>` lookup) and in `sprite-source.tsx` / `world-figures.tsx`. `git add` would have
swept them in, so the commit was built with `git hash-object` + `git update-index` into a private
`GIT_INDEX_FILE`, `git write-tree`, `git commit-tree`, and verified standalone in a throwaway
worktree before `git update-ref` moved the branch. Their hunks are untouched and still sitting in
the working tree.
