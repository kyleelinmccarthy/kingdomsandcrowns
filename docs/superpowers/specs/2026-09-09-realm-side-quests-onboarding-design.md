# Realm Slice 8: Side Quests, Onboarding, and the Pixel World

**Date:** 2026-09-09
**Status:** Approved design, ready for planning
**Builds on:** slices 1–7 on branch `realm-foundations` (head ce65bd3, which includes main as of 2026-09-09)
**Program overview:** `docs/superpowers/specs/2026-09-02-realm-program-overview.md`

## 1. Why

A parent playing as their hero completed a quest and a deed, opened the Realm, and found no spell bar, no explanation of what the villagers' tasks teach, no way to learn the controls, and a world of grey boxes. Three separate gaps caused that:

- The spell bar only shows spells the hero has saved in the Spellbook, and nothing tells them the Spellbook exists.
- "Deeds" collide with quests in a child's head, and no screen shows which subject a deed practices.
- Nothing in the game explains its own controls, and the world is still the slice 4 placeholder art.

This slice makes the Realm explain itself and look finished.

## 2. Decisions

| Decision | Choice |
|---|---|
| The new name for deeds | **Side Quests** ("side quest", "side quests", "Side Quest", "Side Quests") |
| Rename scope | Every visible string, the nav item, and the URL (`/deeds` → `/side-quests`, with a permanent redirect). Code identifiers stay (`deed_run`, `DeedPanel`, `startDeedRun`, the `deeds` catalog). |
| First spell | Seed one starter spell automatically **and** prompt from every empty page of the bar. |
| Help "first visit" | A per-hero timestamp in the database (`realm_settings.help_seen_at`), not browser storage. |
| Art style | Pixel-art SVG figures for the whole world, rasterised through the existing sprite pipeline; tiled pixel ground and path. |
| Art timing | In this slice, not a later one. |

## 3. Words and wayfinding

### 3.1 The rename

A single copy table in `src/lib/utils/side-quest-copy.ts` exports the four nouns (`SIDE_QUEST`, `SIDE_QUESTS`, `SIDE_QUEST_LOWER`, `SIDE_QUESTS_LOWER`) and every screen builds its strings from them. Strings that change:

| Where | Before | After |
|---|---|---|
| Nav item (`nav-items.ts`) | Deeds / "Help the folk of your kingdom — each deed raises a building and strengthens your magic." | Side Quests / "Help the folk of your kingdom. Each side quest raises a building and strengthens your magic." |
| Page title | My Deeds / {name}'s Deeds | My Side Quests / {name}'s Side Quests |
| Page blurb | "Help the folk of the kingdom. Each deed raises a building…" | "Help the folk of the kingdom. Each side quest raises a building and strengthens your magic." |
| Picker | "No deeds are ready for this hero yet", "No deeds yet", "Back to deeds" | "No side quests are ready for this hero yet", "No side quests yet", "Back to side quests" |
| Player | "Finish deed", "Leave the deed", "Deed done" | "Finish side quest", "Leave the side quest", "Side quest done" |
| Realm site card | "Deeds are for the hero to play." | "Side quests are for the hero to play." |
| Realm page blurb | "…visit what your deeds have raised…" | "…visit what your side quests have raised…" |
| Tavern | "…to take up deeds" | "…to take up side quests" |
| Chronicle mastery / Realm settings panels | any "deed(s)" | side quest(s) |
| Marketing walkthrough | "…a 3D world where quests become deeds…" | "…a 3D world where side quests raise a kingdom…" |

The Adventure Log line "A growing record of your heroic deeds" uses the ordinary word and stays.

The page moves to `src/app/(app)/side-quests/page.tsx`. `next.config.ts` gains `redirects()` with `{ source: "/deeds", destination: "/side-quests", permanent: true }`. `revalidatePath("/deeds")` in the deeds actions becomes `/side-quests`. A comment at the top of `src/lib/utils/deeds.ts` says: `// "Deed" in code is "side quest" on screen. Identifiers are not renamed; copy comes from side-quest-copy.ts.`

### 3.2 Subjects on every side quest

`src/lib/utils/skills.ts` gains:

```ts
export const AREA_LABELS: Record<SkillArea, { label: string; color: string }> = {
  math: { label: "Math", color: "#3b82f6" },
  reading: { label: "Reading", color: "#22c55e" },
  language: { label: "Language", color: "#a855f7" },
  science: { label: "Science", color: "#f97316" },
};
```

A `SubjectChip({ area, size })` component (`src/components/subject-chip.tsx`) renders the label in its colour with an `aria-label` of "Subject: {label}". It appears on each side quest in the picker, on each side quest in the Realm site card, in the player's header while a side quest is running, and on the results screen. The picker gains a filter row (All, Math, Reading, Language, Science) that hides buildings whose side quests are all filtered out; the filter is not persisted.

### 3.3 How side quests make magic

The Side Quests page gets a frame under the banner titled "How side quests make magic" with one line per spell school, built from `AREA_SCHOOL`:

- "Math side quests unlock Forms: Bolt, Orb, Burst and more."
- "Reading and Language side quests unlock Elements: Ember, Tide, Stone and more."
- "Science side quests unlock Modifiers."

Each line links to the Spellbook (`/spellbook`, or `/spellbook?child=` for a parent). A pure helper `schoolLines(): { school: SpellSchool; areas: SkillArea[]; examples: string[] }[]` in `src/lib/utils/spell-schools.ts` (or next to `AREA_SCHOOL`) produces the data; the copy is assembled in the component. The Spellbook builder's sealed-part hints gain the same subject phrasing ("Finish 5 more math side quests to unseal Burst" where the count and school already exist).

### 3.4 Parent preview

In a parent preview the HUD note becomes: "You're looking at {name}'s grounds. Spells, side quests and recess are theirs to play." followed on its own line by the closed reason when there is one ("Closed for {name}: …").

## 4. Spells and the bar

### 4.1 Starter spell

`ensureStarterSpell(childId)` in `src/lib/services/spells.ts`:

1. Read `realm_settings.starter_spell_at` (migration 0025, nullable timestamp, alongside `help_seen_at`). If set, return.
2. If the hero has any `spell` row, set `starter_spell_at = now` and return (an existing hero who already built spells is not re-seeded).
3. Otherwise insert slot 1 as `{ elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }` and set `starter_spell_at = now`.

Called from hero creation (next to the season sync), from `getSpellbook`, and from `getRealmBundle`. The Spellbook shows the page as an ordinary editable page; clearing it does not re-seed because the timestamp is set.

### 4.2 The bar always shows for the hero

`resolvePages` keeps returning saved pages. The shell renders the bar whenever the hero is in the world (not for parents, not during a panel or the ceremony), passing saved pages plus one `{ slot, spell: null }` entry per remaining slot. `SpellBar` draws an empty page as a dashed chip labelled "Empty" with `title="Make a spell in your Spellbook"`. Tapping an empty page opens a small panel above the bar:

> Your spellbook has room. Make a spell to fill this page.
> [Open the Spellbook] [Close]

"Open the Spellbook" is a link to `/spellbook`. Empty pages are never selectable, are skipped by number keys, and are `aria-disabled`.

### 4.3 Casting explained once

The first time a page is selected in a visit, the HUD notice shows "Tap or click where the spell should go, or press Space to aim at the nearest trouble." (touch input mode: "Tap where the spell should go."). A `castHintShown` flag in the shell keeps later selections quiet. The canvas gets `cursor: crosshair` while a page is selected (a class on `.realm-root`).

## 5. Controls and help

### 5.1 Input

- Number keys `Digit1`–`Digit4` select the matching page; pressing the selected page's key again deselects. Empty pages are skipped. Ignored inside inputs, textareas, selects, dialogs, and while the ceremony runs. Handled in the shell's key effect beside `KeyM`.
- Right-click (`button === 2`) on the ground does what left-click does: walk, or cast when a page is selected. `.realm-root` handles `onContextMenu` with `preventDefault`, so no browser menu appears anywhere over the world.
- When the world opens, focus moves to the world root so keys work without a first click (the existing `returnFocus` helper).

### 5.2 The help card

`RealmHelp` (`src/components/realm/realm-help.tsx`) is a dialog inside `.realm-root` (stopping pointer propagation), opened by a 44 px HUD button labelled "How to play" (a "?" icon), closed by "Close" or Escape. Four groups, copy per input mode:

| Group | Keyboard and mouse | Touch |
|---|---|---|
| Move | "WASD or the arrow keys, or click where you want to go." | "Drag the stick, or tap where you want to go." |
| Talk | "Walk up to a villager and press Enter, or tap Talk. They'll give you a side quest." | "Walk up to a villager and tap Talk. They'll give you a side quest." |
| Cast | "Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble. Clear troubles to protect the sites." | "Tap a spell page, then tap where the spell should go. Clear troubles to protect the sites." |
| Ride and recess | "Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring." | "Tap Ride to get on your mount. At recess, collect gleams and run the lap ring." |

During a ceremony a fifth line reads "Skip the ceremony with Escape or the Skip button." The card carries the reading attributes and read-aloud reads its text when the profile asks. Parents can open it too.

### 5.3 First visit

`realm_settings.help_seen_at` (migration 0025). The bundle carries `helpSeen: boolean`. For a hero whose `helpSeen` is false, the card opens by itself once textures are ready; a pending ceremony waits until the card closes (the ceremony stage stays "waiting" while the card is open). Closing calls `markRealmHelpSeen(childId)` (hero or parent, write gate); a failed call still closes the card and the next visit shows it again. Parents never get the automatic card. The Chronicle's Realm settings panel gains a button "Show the how-to-play card again" that clears the timestamp through `resetRealmHelp(childId)`.

### 5.4 Escape order

One key, one action: Escape closes the help card if open; else skips a running ceremony; else closes the side quest panel. The empty-page panel from 4.2 closes on Escape before any of these.

## 6. The pixel world

### 6.1 Figures

`src/components/realm/world-figures.tsx` exports React SVG figures on a 64×64 grid, each with `data-figure` and `data-figure-id`:

- `CastleFigure({ tier })` for the eight tiers: campsite (tent and fire), cottage, watchtower, keep, manor, castle, fortress, citadel.
- `BuildingFigure({ id })` for well, mill, bridge, chapel, market, library, watchtower, garden.
- `FoundationFigure()`: staked dirt with a small sign.
- `DecorFigure({ kind })` for oak, pine, bush, rock, fence, lantern.

`svgElementToTexture` takes the scale it already accepts; `SpriteSource` rasterises each world figure at a scale from a `WORLD_SPRITE_SCALE` table (castles 8, buildings 6, foundation and decor 4). Texture keys: `castle:{tier}`, `building:{id}`, `foundation`, `decor:{kind}`. `SpriteSource` gains a `world: { castleType: string; buildingIds: string[]; decor: boolean } | null` prop (memoised by the shell) and `SpriteTextures` gains `world: Record<string, THREE.CanvasTexture>`.

### 6.2 Placement

`src/lib/realm/layout.ts` gains `spriteSizeFor(prop): { w: number; h: number }` (castle: footprint width plus 1 by height plus 1.5; buildings: width plus 0.5 by height plus 1; decor: 1.2×1.6 for trees, 0.9×0.9 for the rest) and `kind: "decor"` props from a `DECOR_SPOTS` table of twelve fixed positions with kinds. Decor is non-solid. A layout test asserts every spot is at least 3.5 from the path centre line in x, 2 outside every site footprint, 2 from every lap waypoint, and outside the ceremony gathering area (x within 4.5 and z between the castle's south face and 8 units south of it).

In the scene, castles, buildings and decor are billboard sprites at the prop position with the size from `spriteSizeFor`; foundations are flat planes on the ground textured with the foundation figure; a rising building tweens the sprite's vertical scale with the existing ease. Colliders do not change. Labels stay where they are.

### 6.3 Ground and path

`src/lib/realm/tiles.ts` exports pure painters returning colour grids: `grassTile(seed, size = 32): string[][]` (two greens with darker tufts and a few flowers) and `cobbleTile(seed, size = 32)`. A small adapter in `src/lib/realm/tile-texture.ts` paints a grid to a canvas texture with `RepeatWrapping` and nearest filtering. The ground plane repeats the grass tile so each tile spans two world units; each path prop is a plane with the cobble tile.

### 6.4 Palette and motion

Calm palette tints every world sprite and tile forty percent toward grey through the material colour, like the spell layer. Decor is skipped entirely under the low-stimulus profile. Nothing new animates.

## 7. Data model

Migration 0025 adds to `realm_settings`:

- `help_seen_at` integer timestamp, nullable.
- `starter_spell_at` integer timestamp, nullable.

Existing heroes: both null, so the next visit seeds a spell (if they have none) and shows the help card once.

## 8. Errors

- `ensureStarterSpell` failures are logged and swallowed by the callers that only read (spellbook, bundle) so a page still loads; hero creation lets the error surface as it does for the season sync.
- `markRealmHelpSeen` failure: the card closes, no message; the card returns next visit.
- Texture rasterisation failure for a world figure falls back to the slice 4 box for that prop (the scene keeps the box path for props with no texture) and the existing sprite error and retry cover the rest.

## 9. Accessibility

Chips carry `aria-label`; the help card is a dialog with focus trapped and returned; the empty-page panel is labelled; all new buttons are 44 px in the HUD; copy per input mode; reading attributes on every new overlay; read-aloud on the help card; calm and low-stimulus palettes honoured by the art.

## 10. Testing

- Copy: rendering the nav, the Side Quests page, the picker, the player, the site card and the Realm page contains no "deed" (case-insensitive) outside identifiers; the redirect entry exists in `next.config.ts`.
- `SubjectChip` per area; picker filter hides and shows buildings; `schoolLines` from `AREA_SCHOOL`.
- `ensureStarterSpell`: seeds once; never twice; not for a hero who already has spells (pure decision helper `starterSpellDecision(hasSpells, starterSpellAt)` tested; the DB wrapper typechecked).
- Bar: empty pages rendered, not selectable, skipped by number keys; the empty-page panel opens with the link and closes on Escape; parents see no bar; cast hint once per visit and per input mode.
- Input: number keys select and deselect; ignored in dialogs and during the ceremony; right-click walks and casts; context menu prevented.
- Help card: copy per input mode; ceremony line; auto-open once and action call; failed action still closes; pending ceremony starts after close; Escape order; "Show the how-to-play card again" calls the reset action.
- World: every figure renders with its ids and inside its viewBox; `spriteSizeFor` per tier and building; decor clearances; tiles deterministic by seed and the right size; calm tint helper.
- Scene and layers: typecheck and lint; browser pass with before-and-after screenshots of the campsite and the citadel, the help card, the empty bar and its panel, and a cast via number key and right-click.

## 11. Plan shape

1. Rename and subjects: copy table, page move and redirect, chips, filter, school lines, parent note.
2. Starter spell and the bar: migration 0025 (both columns), service, bar empty pages and panel, cast hint.
3. Input and help: number keys, right-click, context menu, help card, first-visit flow, settings reset button.
4. World figures and tiles (pure and testable): figures, `spriteSizeFor`, decor spots, tile painters.
5. Scene and sprite pipeline: `SpriteSource` world set, billboards, foundation planes, ground and path textures, calm tint.
6. Verification and the browser pass.

## 12. Out of scope

Renaming code identifiers or tables; new side quest content; sound; a day-night cycle; PNG art assets; wiring the school-holiday presets into `SchoolCalendar` (a separate follow-up noted at the merge).
