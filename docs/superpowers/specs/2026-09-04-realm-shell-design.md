# Realm Shell — Design

**Date:** 2026-09-04
**Slice:** 4 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1–3)
**Status:** Approved in brainstorming; awaiting written-spec review

## Goal

The first walkable Realm: a hero and their companion, drawn from the app's own pixel-art SVG,
walking the castle grounds under a fixed tabletop camera in react-three-fiber, with the kingdom's
built buildings standing along the path. The slice-1 access rules gate entry, a heartbeat spends
play minutes, the learning profile shapes rendering and input, and parents can preview without
spending a hero's time. Deeds, NPCs, casting, mounts, and free roam come in later slices; this slice
gives them a world to happen in.

## Spike result (2026-09-04, throwaway, reverted)

three 0.185 + @react-three/fiber 9.7 + @react-three/drei 10.7 typecheck and run under Next 16 /
React 19. The real `Avatar` SVG, serialized and drawn onto a canvas with smoothing off, made a
nearest-filtered sprite that reads as the app's pixel art from the orthographic camera. Headless
software GL held 60 fps at 1, 60, and 200 billboards; rasterization took 2–6 ms. A production
build put three.js in one chunk referenced only by the spike route's loadable manifest. Two
adjustments for the real shell: omit the avatar's crest background layer, and draw the companion as
its own sprite.

## Non-goals

NPCs, trials, spell casting, mounts, free-roam recess mode, sound, saving the hero's position
between visits, multiplayer.

## A. World model (pure modules in `src/lib/realm/`)

A new folder `src/lib/realm/` holds the game rules so they stay separate from app utils. Every file
has a colocated test.

### `layout.ts`

```ts
export const WORLD_SIZE = 40;                       // units; ground is WORLD_SIZE × WORLD_SIZE centered on 0,0
export type Vec2 = { x: number; z: number };
export type Prop = {
  id: string;                                       // "castle" | building id | "path-N"
  kind: "castle" | "building" | "path";
  label: string;
  position: Vec2;                                   // center
  size: { w: number; d: number; h: number };        // footprint width/depth and height in units
  color: string;
  solid: boolean;                                   // path props are walkable
};
export type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[] };
export function buildWorldLayout(input: { castleType: string; builtBuildingIds: string[] }): WorldLayout;
export const CASTLE_FOOTPRINTS: Record<string, { w: number; d: number; h: number }>;  // eight tiers, campsite → citadel
export const BUILDING_SLOTS: Record<string, Vec2>;  // well, mill, bridge, chapel, market, library, watchtower, garden
```

- The castle sits at `{ x: 0, z: -14 }`; footprints grow with the tier from `{2,2,1.5}` (campsite)
  to `{10,8,8}` (citadel). Unknown types use the campsite footprint.
- The path is a row of walkable props from the south gate `{0, 17}` to the castle's south face.
- Buildings appear only when their id is in `builtBuildingIds`, at their fixed slot, footprint
  `{3,3,2.5}` (watchtower `{2,2,5}`), color from a small map, label from the kingdom catalog.
- `spawn` is `{0, 15}`. `colliders` is every prop with `solid: true`.

### `movement.ts`

```ts
export const HERO_SPEED = 3.5;                      // units per second
export const ARRIVE_RADIUS = 0.25;
export const HERO_RADIUS = 0.45;
export type Facing = "n" | "s" | "e" | "w";
export type HeroState = { position: Vec2; facing: Facing; target: Vec2 | null };
export type MoveInput = { axis: Vec2 };             // −1..1 from stick or WASD; zero when idle
export function stepHero(state: HeroState, input: MoveInput, dt: number, colliders: Prop[]): HeroState;
export function setTarget(state: HeroState, target: Vec2, colliders: Prop[]): HeroState;   // clamps into the world, ignores taps inside a solid prop
export type CompanionState = { position: Vec2 };
export function stepCompanion(companion: CompanionState, hero: HeroState, dt: number): CompanionState;
```

Rules: axis input wins over a target and clears it. Velocity is `normalize(axis) * HERO_SPEED`
(diagonals not faster). With a target, the hero walks toward it and stops (target cleared) within
`ARRIVE_RADIUS`. Movement is applied per axis with push-out from any collider's footprint expanded
by `HERO_RADIUS`, so the hero slides along walls. Position is clamped to
`±(WORLD_SIZE/2 − HERO_RADIUS)`. `facing` follows the dominant movement axis and is kept when idle.
The companion eases toward a point `1.2` units behind the hero's facing at `HERO_SPEED * 0.9`, never
closer than `0.8`.

### `camera.ts`

```ts
export const CAMERA_OFFSET = { x: 12, y: 12, z: 12 };
export const CAMERA_ZOOM = 40;
export function followCamera(current: Vec2, hero: Vec2, dt: number, opts: { reducedMotion: boolean }): Vec2;
```

Smoothed with a time constant of 0.25 s; with `reducedMotion` the camera snaps to the hero.

### `render-settings.ts`

```ts
export type RenderSettings = {
  motion: boolean;          // idle bob, particle sparkle, camera easing
  calmPalette: boolean;     // muted ground/sky, no day-night shift
  showStick: boolean;       // on-screen joystick
  hudScale: number;         // 1 or 1.25
};
export function renderSettingsFor(profile: LearningProfile, isTouchDevice: boolean): RenderSettings;
```

`motion = !(reducedMotion || lowStimulus)`; `calmPalette = lowStimulus`; `showStick =
inputMode === "touch" || (inputMode === "auto" && isTouchDevice)`; `hudScale = largerText ? 1.25 : 1`.

### `play-clock.ts`

```ts
export type PlayClock = {
  minutesRemaining: number;     // from the last access check
  secondsThisMinute: number;    // 0..59 of visible play since the last record
  warned: boolean;
  closed: boolean;
};
export type ClockEvent = "record" | "warn" | "close" | null;
export function startClock(minutesRemaining: number): PlayClock;
export function tickClock(clock: PlayClock, elapsedSeconds: number, visible: boolean): { clock: PlayClock; event: ClockEvent };
export function applyAccess(clock: PlayClock, minutesRemaining: number): { clock: PlayClock; event: ClockEvent };
export function gateCopy(result: AccessResult, next?: { recessStart?: string }): { title: string; body: string };
```

- `tickClock` adds visible seconds; hidden time is ignored. When `secondsThisMinute` reaches 60 it
  resets to 0 and emits `record`. Each tick, if `minutesRemaining <= 1 && !warned` emit `warn`
  (and set `warned`). If `minutesRemaining <= 0` emit `close` (and set `closed`).
- `applyAccess` replaces `minutesRemaining` from a fresh check; if the new value is 0 or the check
  was denied, emit `close`.
- `gateCopy` maps denial reasons to hero-facing copy: `no_minutes` → "The Realm opens when you
  finish a quest." / "Every quest you complete banks minutes here."; `outside_recess` → "Recess
  hasn't started." / "Recess opens at {recessStart}." when known, else "Ask a grown-up when recess
  is."; `cap_reached` → "You've played your minutes for today." / "The Realm will be waiting
  tomorrow."; `school_hours` → "It's school time." / "The Realm opens after your last class.";
  `disabled` → "The Realm is closed for this hero." / "A grown-up can open it in the Chronicle."

## B. Sprites and the scene

### Avatar figures (`src/components/avatar.tsx`, additive)

Two new exports alongside `Avatar`: `AvatarFigure({ config, size })` renders the same SVG minus
`BackgroundLayer` and `CompanionLayer`; `CompanionFigure({ companion, color, size })` renders only
the companion layer in a `36 × 48` viewBox. No existing output changes.

### Sprite pipeline (`src/lib/realm/sprite-texture.ts`, browser-only)

```ts
export const SPRITE_SCALE = 6;
export async function svgElementToTexture(svg: SVGSVGElement, scale?: number): Promise<THREE.CanvasTexture>;
export function spriteKey(config: AvatarConfig): string;   // stable JSON of the visual fields, for caching
```

Nearest filtering, sRGB color space, premultiplied alpha off, `alphaTest 0.1` on the material.
Textures are cached per key in module scope and disposed when the shell unmounts. A change to the
hero's config regenerates.

### Scene (`src/components/realm/`)

- `realm-scene.tsx` (client, imported through `next/dynamic` with `ssr: false` from the shell):
  `<Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }}>` with the
  drei `OrthographicCamera` at `CAMERA_OFFSET`, zoom `CAMERA_ZOOM`, looking at the follow target.
  Draws: ground plane (calm or normal palette), path tiles, castle and building boxes with labels
  (drei `Html` or a sprite label), hero sprite, companion sprite, ambient plus one directional
  light. Per-frame state (`HeroState`, `CompanionState`, camera target) lives in refs updated in
  `useFrame` using the pure model; React state changes only on discrete events (texture ready,
  facing flip for the sprite, close).
- `use-realm-input.ts`: unifies keyboard (WASD/arrows), the on-screen stick, and ground taps
  (raycast from the pointer onto the ground plane → `setTarget`). Returns the latest `MoveInput`
  and a `tap` callback. Keyboard listeners attach on mount and detach on unmount.
- `touch-stick.tsx`: an HTML joystick (pointer events) reporting an axis in −1..1, 120 px, bottom
  left, `aria-label="Move"`; hidden when `showStick` is false.
- `realm-hud.tsx`: hero name, minutes remaining (always visible for heroes), the one-minute
  banner, a `Leave the Realm` link back to `/tavern`, and the parent preview badge. Scaled by
  `hudScale`.
- Hero sprite flips horizontally for `facing: "w"`; the companion uses the same rule. Idle bob is a
  ±0.05 unit sine when `motion` is on.

## C. Access enforcement and the heartbeat

### Entry

`RealmShell` (client) receives a serializable bundle from the page and, on mount, calls
`getRealmAccess(childId, localDate, timeOfDay)` from the browser's clock (via `localDateOf` and
`currentTimeOfDay`). Denied → `RealmGate` with `gateCopy`. Allowed → `startClock(minutesRemaining)`
and mount the scene.

### Heartbeat

A `usePlayClock` hook runs a 1 s interval, feeding `tickClock` with `document.visibilityState ===
"visible"`. On `record` it awaits `recordRealmPlay(childId, localDate, 1)` then `getRealmAccess(...)`
and applies the result with `applyAccess`; a failed record is retried on the next minute (never
double-charged: the clock only emits once per 60 visible seconds). On `warn` the HUD banner shows.
On `close` the scene unmounts into `RealmClosed` ("Well played, {name}!" plus the `gateCopy` body
for `cap_reached` or `no_minutes`). The counter always shows whole minutes remaining.

### Parent preview

When the viewer is a parent (`isChildView` false), the shell skips the access call and the
heartbeat, mounts the scene with `minutesRemaining` hidden, shows a "Previewing {name}'s Realm"
badge, and shows the hero's current gate state as an info line ("Closed for {name}: it's school
time") rather than blocking. Nothing is recorded.

### Access control summary

| Action | Parent | Child (own id) |
|---|---|---|
| getRealmAccess, recordRealmPlay | existing rules (slice 1) | yes |
| page data (`getRealmBundle`) | yes | yes |

## D. Page, nav, and data

### Route `/realm`

`src/app/(app)/realm/page.tsx`: actor, active child, family/hero empty states, child selector for
parents. Loads in parallel through a new action `getRealmBundle(childId)` in
`src/lib/actions/realm.ts`: `{ heroName, avatarConfig, castleType, builtBuildingIds,
profile, settings: { enabled, toneMode } }` (castle from the castle table or "campsite"; built
buildings from `kingdom_progress` rows with `completedAt`; profile through the existing
get-or-create). Touch detection happens in the browser (`navigator.maxTouchPoints > 0`), not on
the server. Renders `<RealmShell bundle isChildView childId />`.

Nav: `{ href: "/realm", label: "Realm", icon: "castle", description: "Walk your kingdom — the
castle, the buildings your deeds raised, and your companion at your side." }` in alphabetical
position (after Ranks, before Schedule).

### Dependencies

`three@^0.185`, `@react-three/fiber@^9.7`, `@react-three/drei@^10.7` added to `dependencies`.

### Error handling

- WebGL unavailable (`Canvas` `onCreated` fails or `WebGLRenderingContext` missing): the shell
  shows "This device can't open the Realm yet. Try a newer browser or another device." and no
  minutes are recorded.
- Texture generation failure falls back to a colored placeholder sprite and logs once.
- Access or record action errors show in the HUD with a retry; the clock keeps running so a hero is
  never charged twice for a minute.

### Testing (tests first for every pure module)

- `layout.test.ts`: castle footprint per tier and unknown type; buildings only when built; path
  walkable; colliders exclude path; spawn inside the world.
- `movement.test.ts`: axis normalization (diagonal speed equals cardinal), target arrival and
  clearing, axis input clears a target, collider slide (moving into a wall keeps the tangential
  component), ground clamp, facing rules, companion trailing distance and minimum gap.
- `camera.test.ts`: smoothing converges; reduced motion snaps.
- `render-settings.test.ts`: each toggle's effect; auto stick on touch.
- `play-clock.test.ts`: record after 60 visible seconds and not after hidden seconds; warn once at
  one minute; close at zero; `applyAccess` with 0 or denied closes; gate copy per reason.
- Component tests (scene mocked): `RealmGate` shows the right copy for each reason; `RealmShell`
  in parent view shows the preview badge and never calls `recordRealmPlay`; the HUD shows minutes
  and the one-minute banner from a clock state.
- The scene itself is verified by a manual browser pass (jsdom has no WebGL); the plan's final
  task records that pass with a screenshot via the local headless Chromium setup.

### File map

```
src/lib/realm/layout.ts (+test), movement.ts (+test), camera.ts (+test), render-settings.ts (+test), play-clock.ts (+test), sprite-texture.ts
src/components/avatar.tsx (AvatarFigure, CompanionFigure)
src/components/realm/realm-scene.tsx, use-realm-input.ts, touch-stick.tsx, realm-hud.tsx, realm-gate.tsx (+test), realm-closed.tsx, realm-shell.tsx (+test), use-play-clock.ts
src/lib/actions/realm.ts
src/app/(app)/realm/page.tsx, src/components/nav-items.ts
package.json (three, fiber, drei)
```
