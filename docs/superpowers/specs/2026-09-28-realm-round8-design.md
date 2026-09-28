# Realm round 8 — the owner's list of 2026-09-28

Branch `realm-foundations` (unmerged, the owner decides integration). Ledger:
`.superpowers/sdd/realm-3d-round2-ledger.md`, "Round 8" and "HANDOFF". Agent rules:
`.superpowers/realm-rules.md` (binding, including the resource limits).

## What the owner asked for

> spellbook icon should be a book
> also there are too many icons/tabs on the nav bar - maybe we can combine some into drop-down type
> menus such as Quests with Quest Giver + Quest Log + Side Quests and Loot + Ranks combined
> for students & parents for applicable tabs
> the mouse cursor needs to be a better icon that fits the aesthethic on the site and in the game
> the movement in game is still a bit clunky - it should feel more like minecraft/world of warcraft
> where you can move dynamically with wasd with strafing and using the mouse to control the camera
> also players should be able to pause the game to not use up their minutes and should be able to
> customize their character and their companion from within the game
> also please make sure tis aware of day/night cycles based on the players timezone
> and the word raised feels odd - I think it should be "built"?
> NPCs are missing their faces and hands
> also it still zooms in when going into objects like trees and it shouldnt do that
> please address all of these things and follow code principles SOLID, DRY, KISS and TDD

The players are two children, Emma (11) and Noah (8), on PCs. The standing bar is "a real,
working game that kids can play and enjoy that looks good and they will actually want to play."

**Done when:** every item below is in the branch, tested first, seen working in a browser, and a
principles-and-correctness review has found nothing left open.

## Already done (committed before this spec)

- `e24ddd0` The Spellbook is an open book everywhere (`SPELLBOOK_ICON`).
- `ce2abe2` "Raised" is "built" in all child- and parent-facing text.
- `959b017` The bus's contract for looking with the mouse: `onLookFreed`,
  `requestLook`/`setLookRequester`, `look`/`setLook` (`src/lib/realm3d/hud-bus.ts`).

## Decisions (approved by the owner on 2026-09-28)

1. **Nav:** two drop-down medallions, **Quests** (Quest Giver, parents only; Quest Log; Side
   Quests) and **Rewards** (Loot, Ranks), on both bars.
2. **Cursor:** a gilded pointer everywhere, a gold gauntlet over anything clickable, and a small
   gold reticle at the centre of the game while the mouse is captured.
3. **Controls:** Minecraft's mouse capture plus WoW's right-drag, WASD relative to the camera.
4. **Camera:** it never zooms or turns by itself; what hides the hero dithers see-through.
5. **Pause:** a visible Pause button, and auto-pause when the child is away or idle.
6. **Wardrobe:** the existing avatar customizer, opened inside the game.
7. **Day/night:** by the family's saved timezone, falling back to the browser's.
8. **NPCs:** the hero's own figure, so they have faces and hands.

## 1. Nav drop-downs

**Behaviour.** The bar shows Tavern · Quests ▾ · Spellbook · Realm · Rewards ▾ · Schedule. A group
opens on click or tap (never hover: touch screens) upward out of the bar, is keyboard-operable
(Enter/Space/arrows/Escape) and lights like a medallion when the current page is one of its own. A
hero's Quests menu has Quest Log and Side Quests (Quest Giver is parents-only). A group left with
one destination for a viewer renders as that plain link; a group left with none is not shown.

**Design.** `nav-items.ts` holds `NavLink`, `NavGroup`, `NavEntry`; `visibleNav` (per-viewer
filtering and the one-item rule), `navLinks` (flatten, for the guide and anything listing every
page) and `isNavActive`. `nav-group-menu.tsx` renders a group with the existing
`ui/dropdown-menu`. `game-nav.tsx` renders entries. The guide (`quest-helper.tsx`) lists
destinations through `navLinks` so it does not duplicate the list.

**State.** Written in the main checkout, 38 tests green, uncommitted, never seen in a browser.
Remaining: a browser pass at desktop and phone width for both viewers, then commit.

## 2. Cursors and the reticle

**Behaviour.** Across the site and the game's menus: a small gilded arrow is the default cursor;
a gold gauntlet (pointing finger) replaces the hand over links, buttons and anything with
`cursor: pointer`. Text fields keep the text caret; disabled controls keep their not-allowed/
default cursor. In the game, while the mouse is captured the browser hides the cursor and a small
gold reticle shows at the centre of the view; it disappears the moment the mouse is freed or a
panel opens. Aiming a spell keeps its crosshair, themed gold.

**Design.** Cursor art as small SVG files under `public/cursors/` (arrow, gauntlet, crosshair),
each with a CSS keyword fallback. Declared once as CSS custom properties in `globals.css` and
applied by a few global rules (including Tailwind's `cursor-pointer` utility), so no component
changes. The reticle is a small component in its own file that follows `pointerlockchange`
(a document-like interface handed in, so it tests without a browser) and is mounted in the
frame with one line.

**Tests first.** The reticle shows on capture, hides on release and while paused. A stylesheet
test asserts every `url(...)` cursor in `globals.css` names a file that exists and carries a
keyword fallback.

## 3. Controls — WASD, strafing, mouse look

**Behaviour.**
- Clicking the world captures the mouse (Pointer Lock). Moving it turns the camera (yaw) and
  tilts it (pitch), with no button held. Esc frees it, and freeing it opens the pause menu.
- While the mouse is free, holding the right button and dragging turns the camera (WoW), without
  capturing, so the HUD stays clickable.
- WASD walks relative to the camera. A/D are true strafes, S backpedals, diagonals are no faster.
  The body faces the camera's heading while moving and while the mouse has the camera.
- Movement has weight: 0.1 s to full speed, 0.08 s to stop, a little air control; identical at
  30, 60 and 144 fps.
- The wheel zooms (the child's choice, clamped). Sensitivity and invert-Y come from the pause
  menu's Mouse settings (item 5).
- The same input drives the island, the rooms (with the room's limits) and riding.

**Design.** Already written, in worktree `agent-a109ca79e88f9d194`, not yet wired:
- `look-input.ts` — `mouseLook(el, doc, options)`: one input source emitting look deltas in
  pixels, owning capture, right-drag, wheel, Esc detection, the Chrome re-capture refusal and the
  hand-over between the island canvas and a room's.
- `locomotion.ts` — velocity with weight (`stepMotion`, `keepMotion`), and the legs' read of it
  (`readStride`, `strideRate`) so a strafe steps sideways and a backpedal runs the stride in reverse.
- `controls.ts` — `lookBy`/`zoomBy` with `LookLimits` (island and room), `bodyFacing`,
  `chaseLens`. The deprecated `orbitDrag`, `orbitZoom`, `swingAllowed`, `ASSIST_GRACE` are
  deleted once the scenes move over.
- `jump.ts` — the exact arc, so a jump is the same height at any frame rate.

Remaining: wire `mouseLook` into the island (`CameraInput` in `spike-scene.tsx` is replaced),
the room (`interior-scene.tsx`'s own drag handlers are replaced) and riding; wire locomotion into
the hero's mover; delete what they replace.

## 4. Camera — no zooming into trees; see-through instead

**Behaviour.** The camera sits where the child put it: their yaw, their pitch, their distance. It
never pulls in, ducks, lifts or swings by itself. The one thing it does on its own is stay above
the ground under it (`chaseLens`), which only ever raises it. Whatever stands between the camera
and the hero (a tree, a roof, a wall, the castle) turns see-through in a soft dithered circle
around the hero, so the child is always visible and the view never jumps.

**Design.** A shared material hook, `seeThrough(material)`, generalises the existing
`nearCutout` (`geo-kit.ts`), which already dithers fragments near the lens using the shared
hero-position uniform written by `doorstep.tsx`. A fragment is dithered when it lies closer to
the camera than the hero and within a radius of the camera-to-hero line. It is per-fragment, so it
works on instanced trees, which is why the old camera comment's reason for rejecting fading no
longer applies. It is applied to every material that can stand in front of the hero: scenery,
world props, buildings, the castle and landmarks. It is never applied to the hero, the companion,
mounts or villagers.

The geometry of "is this point in the way" lives in a pure, tested module (`see-through.ts`),
and the GLSL follows it line for line.

**Deleted:** `camera-boom.ts` and its test (the swing, duck, lift, lens-fraction and inside-wall
logic, 513 lines) and the `Rig` code that drives it, replaced by `chaseLens` and the see-through.
The occluder list that fed the camera goes too, if nothing else reads it.

**Tests first.** `see-through.ts`: a point on the line in front of the hero is dithered; a point
behind the hero, beside the line or past the radius is not. `chaseLens`: the lens holds the child's
yaw, pitch and distance and only rises over ground. A regression test that no code path shortens
the boom.

## 5. Pause and mouse settings

**Behaviour.**
- A Pause button with the pause glyph, the word and its key (P) in the clock corner. P and Esc
  pause and resume.
- The game pauses by itself when the tab is hidden, the window loses focus, the captured mouse is
  freed (Esc), or after two minutes with no input. It never opens over a panel that is already
  open. A visiting grown-up has no clock, so only Esc and P pause them.
- The pause board says why: "Paused while you were away — your minutes stopped too.", or for idle,
  "Still there?" with an "I'm here!" button. It always keeps "The world waits for you. Your
  minutes are not ticking."
- Resume re-captures the mouse if it was captured when the pause began (the one moment the browser
  allows it).
- The pause menu gains a Mouse section: look speed (25–300%) and Invert up/down, kept on this
  computer, live from the first frame.

**Design.** Already written, in worktree `agent-a1c840e04096e9d05`: `pause.ts` (`autoPause`,
`pauseCopy`), `use-pause.ts`, `look-settings.ts`, `look-controls.tsx`, `device-storage.ts` (shared
by `use-places-found.ts`, which loses its private copy). The minutes clock already stops while any
overlay is open (`usePlayClock`), so no clock change is needed. Remaining: merge onto the wired
controls, where `onLookFreed` fires for real, and a browser pass.

## 6. Wardrobe — the hero and the companion, inside the game

**Behaviour.** The pause menu gains a Wardrobe item (the child's own Realm only; a visiting
grown-up walks as the wizard and does not get one). It opens the same avatar customizer the Tavern
uses, with its Pet tab for the companion, while the game stays paused. Saving applies the new look
to the hero and the companion at once, in the world, without reloading the page or leaving.

**Design.** `AvatarCustomizer` gains two optional props, making it extensible without touching its
other callers:
- `onSaved(config)`: when given, it is called with the saved config instead of `router.refresh()`.
  The game must not refresh or revalidate `/realm`.
- `initialTab`, so the game can open it on the Pet tab if needed.

The customizer's unlock data (level, earned badges, quest-unlocked items, crown choices) is loaded
when the wardrobe first opens, by one server action that reuses the queries `updateAvatarConfig`
and the Tavern already run. It is not added to every Realm load, because the database is a remote
Turso and each query is a round trip. `realm-game.tsx` holds the worn avatar in state, starting
from the snapshot, and passes it down. Changing it re-renders `World` once per save, which is the
one legitimate new identity for that prop. `heroLook` is already memoised on the avatar. The
overlay is a new `Overlay` kind (`{ kind: "wardrobe" }`) through `go()`, so it pauses like any
panel.

**Tests first.** The customizer calls `onSaved` and not `router.refresh` when given one. The pause
menu shows Wardrobe for a child and not for a visitor. Saving swaps the hero's look without a
remount (the composed path through `realm-game`, not just the parts).

## 7. Day and night by the player's timezone

**Behaviour.** The island's light follows the local time in the family's saved timezone
(`family.timezone`), or the browser's timezone when the family has none. Dawn, day, dusk and a
moonlit night blend into each other. Night stays playable: a cool blue moonlight, lantern glows
and lit windows, never dark enough to lose the hero or a villager. The light moves on as the real
clock does during a visit. Rooms keep their own lamplight. In development, `?hour=21` forces an
hour for screenshots.

**Design.** A pure module, `day-cycle.ts`:
- `localHour(now, timeZone)` uses `Intl.DateTimeFormat` and falls back to the browser's zone.
- `lightAt(hour, out)` interpolates a small keyframe table into the sun's direction, colour and
  intensity, the hemisphere and ambient light, the sky's top and low colours, the fog colour and
  how strongly lamps glow. It writes into a caller's object.

The scene reads it in a small `DayLight` component, which replaces the fixed constants in `Sun`,
`SkyDome` and the fog. It re-evaluates once a minute, not once a frame. The bundle gains
`timezone` (read with the bundle's existing queries in parallel).

**Tests first.** `localHour` across zones and the fallback. `lightAt` at noon, midnight, dawn and
dusk, continuity across keyframes and midnight, and a floor on night brightness (the "playable
night" rule as a number).

## 8. NPC faces and hands

**Behaviour.** The eight villagers on the green, and the keepers indoors, are the hero's own
figure (`hero-figure.tsx`) wearing each villager's look: face, hands, hair, clothes. It is the same
look the talk panel's portrait is drawn from, so the portrait and the person agree. They face the
road and turn to a child who comes near.

**Design.** Already written, in worktree `agent-a21e189f5a1874721`:
- `villager-look.ts` — one look per villager, built from `villagerAvatar` through `heroLook`.
- `attention.ts` — `noticeFacing`, one rule shared by the green and the rooms.
- `villagers.tsx`.
- `figure-bake.tsx` with `bake-surface.ts` — merges a standing figure into a few meshes, so eight
  villagers cost a few dozen draws, not a few hundred.

The old faceless `Villager` in `spike-scene.tsx` is deleted, and the keeper indoors uses the same
look and turn rule. Remaining: merge, a draw-count check against the pre-change baseline, and a
browser pass by day and by night.

## Sequence

One agent at a time (the resource rules). Each item is tested first, committed on its own, and
seen in a browser before the next starts.

1. Nav drop-downs: finish and commit (main checkout).
2. Cursors and reticle.
3. NPC faces and hands: move the worktree's work onto the branch.
4. Controls: move the worktree's work over and wire it into the island, rooms and riding.
5. Camera: see-through and the deletions (builds on 4).
6. Pause and mouse settings: move the worktree's work over (builds on 4).
7. Wardrobe.
8. Day/night.
9. A principles-and-correctness review of the whole round, then a fix wave.

The worktrees' uncommitted work is brought over as patches, not by reusing the worktrees. The
worktrees are then removed. Their branches sit at `959b017`, and the branch has moved one commit
since (`e24ddd0` touched `frame-hud.tsx`, `game-icon.tsx` and `nav-items.ts`), so the pause lane's
patch is checked by hand against it.

## Verification, every item

- Tests red first, then green. `npx vitest run --maxWorkers=2` on the touched files while
  working, and the full suite once before each commit.
- `npx tsc --noEmit` and `npx eslint src` before each commit. The baseline is one known lint
  error, at `quest-template-list.tsx:70`.
- A browser pass with the agent dev server (`NEXT_DIST_DIR=.next-agent`, port 3177) and headless
  Chromium: screenshots for anything visible. For the Realm, the demo child with a play-ledger row.
- Where the scene changes, draw calls at spawn are no worse than before.

## Constraints

- **Foreign uncommitted work.** `src/app/(app)/tavern/page.tsx`, `src/components/avatar.tsx`,
  `src/components/avatar-figures.test.tsx` and `src/app/(app)/hud-panel-wrappers.test.ts` belong
  to another piece of work. They are never staged or edited.
- **Stability files.** The uncommitted `tsconfig.json` exclude and `.vscode/settings.json` are
  kept: they stopped VS Code hanging on the worktrees.
- **Three.js boundaries.** Nothing under Vitest imports `three`. `World`'s props stay
  referentially stable. Nothing is allocated per frame.

## Out of scope

Touch controls for the game. A first-person camera. Seasons or weather. Real sunrise times by
latitude. A wardrobe for a visiting grown-up. Changes to the 2D avatar (that is the foreign work
above).
