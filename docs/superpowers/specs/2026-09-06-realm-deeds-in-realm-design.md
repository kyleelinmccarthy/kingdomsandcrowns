# Realm: Deeds in the Realm — Design

**Date:** 2026-09-06
**Slice:** 5 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1–4, in particular `2026-09-02-realm-deeds-design.md` and `2026-09-04-realm-shell-design.md`)
**Status:** approved in conversation; spec for the implementation plan

## Goal

Bring the deeds into the world. Every kingdom building has a site in the Realm with a villager who
needs help; walking up and talking opens that site's deeds; the deed plays inside the Realm with the
play clock paused; finishing a deed raises the building where the hero stands. The Deeds page keeps
working unchanged as the second way in.

Out of scope (later slices): spell casting and visual effects, monsters as entities, mounts, recess
free-roam changes, new deeds or drill content, any change to mastery or kingdom progress rules.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Scope | Deeds only; spell casting becomes its own slice (5b) before Recess and mounts. |
| Entry | A villager at every building slot; walking within reach shows a prompt; tapping it opens the site card. |
| Clock | Paused while a deed panel is open; deeds never bank play minutes. |
| State flow | The bundle carries kingdom state; a completed deed's summary patches it locally, no refetch, no remount. |
| Parent preview | Parents can read villagers, stories, and progress; Begin is hidden and the server refuses parent-started runs in the Realm. |

## A. World model (pure, `src/lib/realm/`)

### Sites

`buildWorldLayout` changes its input from `builtBuildingIds: string[]` to
`buildings: SiteProgress[]` where `SiteProgress = { id: string; done: number; total: number; complete: boolean }`
(the shape of `BuildingOverview` minus copy). Every entry in `BUILDINGS` with a slot in
`BUILDING_SLOTS` yields a site, whether or not it appears in `buildings` (missing means `0 of N`):

- **Complete:** the building box exactly as slice 4 draws it (`kind: "building"`, solid, `BUILDING_COLORS[id]`), label `"{label}"` with the tag `"Built"`.
- **Incomplete:** a foundation slab, `kind: "foundation"`, same `w`/`d` as the building, `h: 0.2`, colour `FOUNDATION_COLOR = "#6b665a"` (calm palette: `"#5a5750"`), `solid: false`, label `"{label}"` with the tag `"{done} of {total}"`.

`Prop` gains an optional `tag?: string` rendered under the label. `PropKind` gains `"foundation"` and
`"villager"`. Colliders are still exactly the solid props (castle and complete buildings).

### Villagers

`src/lib/realm/villagers.ts`:

```ts
export type Villager = { id: string; buildingId: string; name: string; greeting: string; figure: VillagerFigureConfig };
export const VILLAGERS: Villager[]; // one per building, in BUILDINGS order
export function villagerForBuilding(buildingId: string): Villager | null;
export const VILLAGER_OFFSET = 1.5; // units toward spawn (positive z) from the slot's south edge
export function villagerPosition(slot: Vec2, footprint: { d: number }): Vec2; // { x: slot.x, z: slot.z + footprint.d / 2 + VILLAGER_OFFSET }
export const REACH = 2.5;
export function nearestVillager(hero: Vec2, villagers: { id: string; position: Vec2 }[]): string | null;
```

Names and greetings (gentle voice; the monsters toggle changes deed stories, not greetings):

| building | name | greeting |
|---|---|---|
| well | Old Bram | "The bucket's dry again. Have you a moment for the well?" |
| mill | Miller Tessa | "Sacks everywhere and no one to count them. Lend a hand?" |
| bridge | Carpenter Aldo | "Planks to measure and a river that won't wait. Help me?" |
| chapel | Sister Wren | "The bell wants numbers and the scroll wants reading. Will you?" |
| market | Crier Pip | "Prices, words, and a market that opens at noon. Join me?" |
| library | Librarian Hesper | "Every scroll has a place. Shall we find them?" |
| watchtower | Mason Gerd | "Stones to count before the lantern's lit. Are you willing?" |
| garden | Keeper Ivy | "The bees have questions. Come see the beds?" |

`nearestVillager` returns the id of the villager within `REACH` of the hero with the smallest
distance, or null; ties resolve to the first in array order. Distances use `Math.hypot` on x/z.

`buildWorldLayout` places one `kind: "villager"` prop per site at `villagerPosition`, `size: { w: 0.9, d: 0.9, h: 1.8 }`, `solid: false`, `label: villager.name`, and the layout exposes
`villagers: { id: string; buildingId: string; position: Vec2 }[]` alongside `props` and `colliders`.

### Villager figures

`avatar.tsx` gains `VillagerFigure({ config, size?, className? })` where `VillagerFigureConfig` is a
fixed `AvatarConfig` subset (body, hair, skin, outfit, accessory) chosen per villager in
`villagers.ts`; it draws the hero layers without crest or companion, `data-figure="villager"`.
Textures go through the slice-4 cache with `spriteKey({ ...DEFAULT_AVATAR, ...config })` prefixed
`"villager:"`. `SpriteSource` accepts an optional `villagers: Villager[]` and reports
`SpriteTextures.villagers: Record<string, CanvasTexture>` once all are ready (eight small rasters;
the spike measured 2–6 ms each).

### Kingdom reducer

`src/lib/realm/kingdom-state.ts`:

```ts
export type KingdomState = { tone: "gentle" | "monsters"; buildings: BuildingOverview[] };
export function applyDeedResult(state: KingdomState, buildingId: string, result: { done: number; total: number; complete: boolean }): { state: KingdomState; rose: boolean };
```

`rose` is true only when the building's `complete` flips from false to true. Unknown `buildingId`
returns the same state object and `rose: false`.

### Rise animation

The scene keeps `risingRef: { id: string; startedAt: number } | null`. When the shell reports a rise
and `settings.motion` is true, the new building box scales its y from 0.1 to 1 over `RISE_MS = 900`
with an ease-out curve inside `useFrame`; with motion off it appears at full size. The label tag
reads "Built" from the first frame.

## B. The deed flow (`src/components/realm/`)

### Reach and the prompt bubble

The scene calls `nearestVillager` each frame with the hero's position and keeps the result in a ref;
when it changes it calls `onReachChange(id | null)` (a prop, invoked outside `useFrame` via a queued
microtask so no state is set during the render loop). The shell stores `reachId` in state. While a
villager is in reach and no panel is open, a drei `Html` bubble above that villager shows the
greeting and a **Talk** button (`min-height: 44px`, `min-width: 44px`). Talk, or Enter/Space while a
villager is in reach and the panel is closed, opens the site card.

### Site card

`SiteCard({ villager, building, tone, preview, busy, error, onBegin, onClose })` is an overlay panel
inside `.realm-root` (`.realm-panel`, centred, max-width 36rem, scrollable, `role="dialog"`,
`aria-labelledby` the villager's name). Contents: villager name and greeting; the building's label,
progress bar and "2 of 5" (or "Built"); each of the site's deeds as a row with title, story in the
hero's tone (`deedStory`), and a **Begin** button. Built sites still list their deeds (any building
can be worked at any time). In preview, Begin is replaced by the text "Deeds are for the hero to play."
A **Close** button and Escape close the card.

### Deed panel

Begin calls `startDeedRun(childId, deedId, "realm")`. On success the panel body becomes
`DeedPlayer` with the bundle's profile and calm flag; `DeedPlayer.onFinished` changes to
`(summary: RunSummary) => void` (the Deeds page ignores the argument). While the panel is open:

- `useRealmInput` is given `enabled: false` and clears its keys; the stick is hidden; ground taps are ignored (`RealmScene` prop `interactive: false`).
- The panel traps focus (first focusable on open, Tab cycles inside, focus returns to the Talk button on close).
- **Leave the deed** and Escape close the panel; the run stays resumable for an hour through the existing resume window, so leaving loses nothing.

### Clock pause

`usePlayClock` gains `paused: boolean`. While paused, the interval callback returns before
`tickClock`: no seconds count, no records, no warn or close. When `paused` flips back to false the
next tick first calls `getRealmAccess` and `applyAccess` (one refresh, tracked by a ref) so a gate
that shut during a long deed closes the world with the real reason. The HUD shows
"{n} min left · paused" while paused.

### Results and the rise

`DeedResults` renders as on the Deeds page. Its Done handler: `applyDeedResult` on the shell's
kingdom state; close the panel; if `rose`, hand the building id to the scene (`risingId` prop) and
show the HUD toast "The {label} stands." for 4 s (calm palette or reduced motion: no fade, plain
text, same duration). The layout is `useMemo`'d on the kingdom state, so only that site's props
change and the hero keeps their position.

### Parent preview

Parents (`isChildView === false`) can open bubbles and site cards; Begin is hidden. No run starts,
no write happens, and the clock stays disabled as in slice 4.

## C. Data, actions, errors

### Bundle

`RealmBundle` replaces `builtBuildingIds` with `kingdom: KingdomState`. `getRealmBundle` and
`getDeedsOverview` share one implementation, `loadKingdomOverview(childId)` in a new
`src/lib/services/deeds.ts`, returning `{ tone, buildings }` (the existing overview logic moved,
not rewritten); `getDeedsOverview` keeps its shape by spreading that result. No schema change.

### Actions

`startDeedRun(childId, deedId, context: "page" | "realm" = "page")`: in the `"realm"` context a parent
actor is refused with "Deeds are for the hero to play." The page context keeps today's rule (parents
may run a deed for their child). `answerDeedQuestion` and `completeDeedRun` are unchanged.

### Errors

- `startDeedRun` failure: message in the site card with **Try again**.
- Answer/complete failures: handled inside `DeedPlayer` as today.
- Kingdom load failure inside `getRealmBundle`: the action catches it and returns
  `kingdom: { tone: "gentle", buildings: [] }` plus `kingdomError: string`; the shell renders the
  world without villagers and a HUD banner "The villagers are resting. Try again." whose retry
  calls a new `getRealmKingdom(childId)` action and patches the state.

### Copy

Villager greetings as tabled above; "Talk", "Begin", "Close", "Leave the deed", "Deeds are for the
hero to play.", "The {label} stands.", "The villagers are resting. Try again.", HUD "· paused".
Deed stories come from `deedStory(deed, tone)`.

## D. Testing

- `layout.test.ts`: sites for complete/incomplete/missing progress (kind, tag, solid), villager props and `villagers` list, colliders unchanged.
- `villagers.test.ts`: one villager per building, `villagerPosition`, `nearestVillager` (none in reach, one, two with tie order, exactly at `REACH`).
- `kingdom-state.test.ts`: patch, `rose` only on the false→true flip, unknown id no-op.
- `use-play-clock.test.ts`: paused ticks record nothing and never warn or close; unpausing triggers one access refresh; a denied refresh closes with its reason.
- `site-card.test.tsx`: lists deeds with tone-aware stories, progress text, Begin calls `onBegin`, preview hides Begin, Escape closes.
- `realm-shell.test.tsx` (scene mocked): reach change shows the bubble; Talk opens the card; Begin mounts `DeedPlayer` (actions mocked) and pauses the clock; Done applies the reducer and shows the rise toast; keyboard input ignored while open.
- `deeds.test.ts` (actions): `startDeedRun` refuses a parent in the realm context and allows one in the page context.
- Final browser pass: hero with minutes walks to the well, Talk, Begin, answer all, Done, the well rises and the toast shows; parent preview shows the card without Begin.

## E. Plan shape

1. Layout sites, villagers module, kingdom reducer (pure, tests first).
2. Villager figures and textures; `SpriteSource` villagers.
3. Bundle: shared kingdom loader, `getRealmKingdom`, `startDeedRun` context guard, `DeedPlayer.onFinished(summary)`.
4. Scene: foundations, villager billboards, tags, reach reporting, rise tween, `interactive` prop.
5. Site card, deed panel, focus trap, input disable, clock pause, results and toast, kingdom error banner.
6. Final verification: full gate, bundle isolation unchanged, browser pass, spec walk, hand-off.
