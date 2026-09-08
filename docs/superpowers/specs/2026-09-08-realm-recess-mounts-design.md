# Realm: Recess and Mounts — Design

**Date:** 2026-09-08
**Slice:** 6 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1–5b, in particular `2026-09-02-realm-foundations-design.md` for recess access and `2026-09-07-realm-spell-casting-design.md` for the scene layers)
**Status:** approved in conversation; spec for the implementation plan

## Goal

Give recess something to do and give heroes something to ride. Mounts are a new catalog that unlocks
like spell parts, equips through the avatar, and carries the hero faster around the kingdom. When the
Realm is open through a scheduled recess block, gleams scatter across the grounds and a lap ring
circles the kingdom; collecting and lapping are tallied for the session. Nothing is written to the
server during play.

Out of scope: rewards or persistence for gleams and laps, mount-only areas, mounted combat, the
season-end ceremony (slice 7), new troubles or spell parts.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Earning mounts | Same rules as spell parts: one free starter, others by level, badge, or parent-picked quest reward through the avatar-unlock table (category `mount`). No new tables. |
| Recess play | Gleams to collect and a lap ring; session tallies only. |
| Where the mount lives | A field on the avatar config (`mount`, `mountColor`); no migration. |
| Riding and casting | A mounted hero cannot cast ("Dismount to cast."). |
| Recess activation | Exactly when the access source is `recess`. |

## A. Mount catalog and data

### Catalog (`src/lib/utils/avatar-catalog.ts`)
```ts
export type MountItem = AvatarItem & { speed: number };
export const MOUNTS: MountItem[];
```
| id | label | speed (u/s) | unlock |
|---|---|---|---|
| pony | Pony | 4.5 | free |
| donkey | Donkey | 4.2 | free |
| goat | Goat | 4.8 | level 3 |
| stag | Stag | 5.5 | level 8 |
| boar | Boar | 5.2 | badge `badge-streak-7` (Week Warrior) |
| direwolf | Direwolf | 5.8 | level 15 |
| gryphon | Gryphon | 6.5 | quest |
| wyrm | Wyrm | 7 | quest |

Walking stays `HERO_SPEED = 3.5`. Mount ids are disjoint from companion ids (the unlock table is keyed by item id alone; `wolf`, `griffin`, and `dragon` are companions, hence the names above). `findMount(id)`.

### Avatar config
`AvatarConfig` gains `mount: string | null` and `mountColor: string` (default `"#8b5e3c"`); `DEFAULT_AVATAR.mount = null`; `normalizeAvatarConfig` fills both like `companion`/`companionColor`; `isValidAvatarConfig` accepts null or a catalog mount id. The existing avatar save path stores it. `spriteKey` keeps mount fields (they change the drawn figure).

### Unlocks
The avatar-unlock category `mount` joins the quest-reward flow: `getRewardableItems` lists mounts under "Mounts"; `getRewardItemLabel` resolves them; the customizer's unlock check for mounts reads level, badges, and the unlock table exactly as for accessories. The avatar customizer gains a "Mount" section (chips, "None" allowed, locked chips show the requirement) using the existing pattern, plus a colour swatch row like the companion's.

### Figures
`MountFigure({ mount, color, size? })` draws a saddled animal on the 36×48 canvas with `data-figure="mount"` and `data-figure-id={mount}` (eight small pixel figures). `AvatarFigure` gains `mounted?: boolean`: when true the layers render in a group translated up by 8 units with the legs and boots omitted, so the rider sits on the saddle. `SpriteSource` rasterises the mount texture keyed `mount:{id}:{color}` and reports `SpriteTextures.mount: CanvasTexture | null` and `SpriteTextures.heroMounted: CanvasTexture | null` (the rider variant, key `spriteKey(config) + ":mounted"`).

### Loot and Chronicle
Loot shows "Mounts: n of 8" (unlocked count) next to the spell-part count. The Chronicle hero card shows "Rides: {label}" under the avatar when a mount is equipped. The "Recess!" toast is triggered by a `recessStart` event the recess simulation emits on the frame recess becomes active.

### Bundle
`RealmBundle.mounts: { unlocked: string[] }`, computed server-side from the same unlock context the spellbook uses (level, badges, unlock table). The equipped mount is `avatarConfig.mount`; it rides only when its id is in `unlocked` (a removed reward rides as none).

## B. Riding and recess play

### Riding (`src/lib/realm/movement.ts`)
- `HeroState` gains `mounted: boolean` (false at spawn). `stepHero(state, input, dt, colliders, speed = HERO_SPEED)`; the scene passes the mount's speed while mounted.
- `COMPANION_GAP_MOUNTED = 2.0`: `stepCompanion` takes an optional gap.
- Mount/dismount: `toggleMount(state, canRide): HeroState` (no-op when `!canRide`). The HUD button reads "Ride" / "Dismount"; the M key toggles. Mounting clears the walk target.
- Casting is refused while mounted: the spell bar stays visible but selecting a page shows the notice "Dismount to cast." and does not select.

### Recess state (`src/lib/realm/recess/recess.ts`)
```ts
export type Gleam = { id: string; position: Vec2; spawnedAt: number };
export type RecessState = { active: boolean; gleams: Gleam[]; collected: number; laps: number; lapStartedAt: number | null; bestLapMs: number | null; nextWaypoint: number; lastCollectedAt: Record<string, number> };
export const GLEAM_COUNT = 12, GLEAM_COUNT_LOW = 6, GLEAM_RADIUS = 0.8, GLEAM_RESPAWN_MS = 10_000;
export const LAP_WAYPOINTS: Vec2[]; // eight points ~12 units from the centre, past every building slot, in ring order
export const LAP_START: Vec2; // = SPAWN
export const WAYPOINT_RADIUS = 2;
export function startRecess(): RecessState;
export function setRecessActive(state, active): RecessState; // deactivating clears gleams and the running lap; tallies stay
export function spawnGleams(input: { seed; now; layout; state; lowStimulus }): RecessState;
export function stepRecess(state, hero: Vec2, now): { state; events: RecessEvent[] };
export type RecessEvent = { kind: "gleam"; count: number } | { kind: "lap"; lapMs: number; laps: number; best: boolean };
```
- **Gleams** spawn on walkable ground (not inside colliders padded by 1, ≥ 2 units from villagers and path tiles, ≥ 3 from spawn, inside the world), seeded per slot index and respawn count; a gleam within `GLEAM_RADIUS` of the hero is collected; its slot respawns elsewhere after `GLEAM_RESPAWN_MS`.
- **Laps**: the hero within `WAYPOINT_RADIUS` of `LAP_WAYPOINTS[nextWaypoint]` advances it; when `nextWaypoint === 8` and the hero is within `WAYPOINT_RADIUS` of `LAP_START`, a lap completes: `laps + 1`, `lapMs = now − lapStartedAt`, `bestLapMs = min`, `nextWaypoint = 0`, `lapStartedAt = now`. The first lap starts when the hero first reaches waypoint 0 (`lapStartedAt` set then). Leaving the ring pauses nothing; the timer keeps running, which is the honest lap time.
- **Activation**: `active` exactly when the play clock's last access result has `source === "recess"`; on activation a "Recess!" toast shows for 2 s; on deactivation gleams and ring markers unmount and the tallies stay in the HUD until the world closes.

### Accessibility
Reduced motion: no gleam bob or sparkle, static markers, no gold burst. Low stimulus: `GLEAM_COUNT_LOW`, no ticking lap timer in the HUD (counts only). Larger text reaches the new HUD fields through `hudScale`.

## C. Scene, HUD, data, errors

### Scene
`RecessLayer` beside `SpellLayer`: 12 pooled gleam sprites from one gold gleam figure (`GleamFigure`, texture key `gleam`), eight ring marker discs (radius 0.6, `#c9a84c` or `#8a7d5a` under calm), a start banner sprite at `LAP_START` (`BannerFigure`, key `banner`), stepped in the frame loop and frozen under a panel; visible only while `recessActive`. The hero group renders the mount sprite under the rider when mounted (mount at y 0.7, rider at y 1.6, both flip with facing). Events reach React via `queueMicrotask`.

### HUD
While recess is active: "Gleams: {n}" and "Laps: {n}" plus "Best {t} s" once a lap exists, and the running lap time (unless low stimulus). The Ride/Dismount button (44 px) appears when an unlocked mount is equipped; disabled in preview. Notices: "A gleam! {n} so far." and "Lap done: {t} s!" (t with one decimal).

### Input
M toggles the mount (ignored inside inputs, dialogs, and while a panel is open). Everything else is unchanged; while mounted the spell bar's `onSelect` is intercepted by the shell to show "Dismount to cast.".

### Copy (verbatim)
"Ride", "Dismount", "Dismount to cast.", "A gleam! {n} so far.", "Lap done: {t} s!", "Gleams: {n}", "Laps: {n}", "Best {t} s", "Recess!", customizer section title "Mount", Loot "Mounts: {n} of 8".

### Errors
No new server calls during play. An unknown or locked mount id rides as none and the Ride button is hidden. If the mount texture fails to rasterise, the existing sprite error and retry apply.

## D. Testing
- `avatar-catalog.test.ts`: mount ids unique and disjoint from companions; every badge unlock references a seeded badge; normalise/validate round-trip with and without a mount; reward label for a mount.
- `movement.test.ts`: speed parameter; `toggleMount` clears the target and respects `canRide`; companion gap while mounted.
- `recess.test.ts`: gleam placement rules, deterministic seed, collection radius, respawn timing, low-stimulus count; waypoint advance in order, lap completion, best time, deactivation clearing gleams but not tallies.
- `avatar-figures.test.tsx`: `MountFigure` for every mount; `AvatarFigure mounted` omits legs; `sprite-source.test.tsx` reports `mount` and `heroMounted` textures.
- `avatar-customizer.test.tsx`: mount section lists chips, locked chip shows the requirement, "None" clears.
- `realm-hud.test.tsx`: recess fields and the Ride button states; `realm-shell.test.tsx`: recess active only under `source: "recess"`, "Recess!" toast, Ride toggles and blocks casting with the notice, preview never collects.
- Final browser pass: give the demo hero a recess block covering now and a pony; open `/realm`, confirm "Recess!", ride, collect a gleam ("A gleam! 1 so far."), and read "Gleams: 1".

## E. Plan shape
1. Catalog, avatar config fields, unlock category, reward label, Loot/Chronicle counts (+ tests).
2. Movement: speed, mounted state, toggle, companion gap (+ tests).
3. Recess module (+ tests).
4. Figures (mount, rider variant, gleam, banner) and sprite pipeline; customizer mount section.
5. Bundle `mounts`, scene `RecessLayer` and mounted hero, HUD fields and Ride button, shell wiring (recess source, toast, M key, cast block).
6. Final verification and the browser pass.
