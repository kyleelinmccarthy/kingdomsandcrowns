# Realm keybinds, big map, free-look camera and casting from the saddle

Date: 2026-11-23. Status: design, awaiting approval.

## 1. Intent

The owner asked for five changes to the 3D Realm (`/realm`):

1. **M opens a big map.** The minimap in the corner grows into a full map of the island.
2. **Mounting moves to Z.** M is needed for the map.
3. **Every key appears in the controls and can be changed.** M (map), Z (mount) and F (follow) must
   show wherever controls are listed, and every keyboard control must be rebindable.
4. **A mouse camera control that lets you see your hero's front**, as in World of Warcraft.
5. **Casting a spell gets you off your mount** instead of refusing.

Why: the Realm should feel like the games the children already know (WoW, Minecraft): a map key,
keys you can change, a camera you can swing round your hero. The owner's standing principles for
this work are SOLID, DRY, KISS, configurability, scalability, security, and sturdy long-term
architecture over quick patches.

### Goals

- One source of truth for what each key does. The scene, the rooms, riding, the companion, the
  map, pause, the controls panel, the hint strip, the how-to card and the tutorial all read it.
- Adding a new action later takes one entry in one table. Its default key, label, controls row
  and rebind UI follow from that entry.
- Each hero keeps their own keybinds on the server. Each visiting grown-up keeps their own, so a
  visit never changes the child's keys.

### Non-goals

- Rebinding mouse buttons, the wheel, or Esc.
- Gamepad or touch controls.
- Fast travel from the big map. The hitching posts stay the only way to ride somewhere.
- Moving the mouse settings (sensitivity, invert-Y) off the device. They stay in `localStorage`
  (`look-settings.ts`).

### Anti-goals

These would count as failures even if everything else worked:

- A key that does two things, or a controls list that names a key the game doesn't actually use.
- A key that acts while the child is typing into a HUD field, or acts under a menu it shouldn't.
- A visitor's rebinding that changes the child's keys.
- The camera moving by itself. The existing rule in `controls.ts` stays: only the child moves the
  camera, and anything in the way turns see-through.

## 2. How it works today

- **Keys are hard-coded in seven listeners:**
  - island scene, `spike-scene.tsx:1131`: WASD and arrows, Space, E, digits 1–9;
  - room scene, `interior-scene.tsx:196`: the same keys without digits;
  - riding, `riding-hud.tsx:223`: M;
  - companion, `companion-hud.tsx:253`: F;
  - Esc in the frame, `realm-game.tsx:858`;
  - P, `use-pause.ts:122`;
  - the tutorial's own listener, `realm-game.tsx:566`.

  `held-keys.ts` keeps a separate list of movement codes so whichever side takes over can start
  already walking (`seedMoves`). Its users are the room scene and `riding-scene.tsx:254,261`, the
  island picking up keys held through a door or a menu.

  **The listeners each check a different set of guards:**
  - M and F skip keys typed into a `[role='dialog']`, and they still act while the child is
    indoors.
  - P acts under overlays.
  - The scenes use `typingInto`, which does not check for dialogs.
  - The island's `bus.paused` is `overlay || inside` (`realm-game.tsx:464`).

  The router must keep these differences on purpose (§4.2).
- **Where controls are listed.** `controlRows()` and `keyHints()` in `frame.ts` build the list for
  the pause menu's Controls panel, the how-to card and the hint strip, with every key hard-coded.
  The M and F rows show only for a child (`mount`/`pet` set). The strip shows M only when the
  child has a mount and riding is unlocked, and F only when they have a pet.

  **Hard-coded key names in copy and keycaps** (every one of these must read the keymap):
  - `riding.ts:141`, the saddle line;
  - `riding-hud.tsx:170`, the spoken "Press W, A, S or D";
  - `riding-hud.tsx:261`;
  - `riding-hud.tsx:341`, the Ride slot's "M" keycap;
  - `hud.tsx:312,331`, the spell-slot keycaps;
  - `companion-hud.tsx:53-69`, "Press E" and "press F";
  - `companion-hud.tsx:339`, the pet slot's "F" keycap;
  - `frame-hud.tsx:75,121,561`, "press F" and "press E";
  - `tutorial.ts:201,209,215,220`, including `TUTORIAL_DONE`'s "Press P or Esc";
  - `guide-hud.tsx:72`, the "WASD" styling.

  Several of these are constants today and become functions of the keymap.
- **Minimap.** `Minimap` in `hud.tsx:141` is a 240-unit panning window: a baked land bitmap,
  roads, landmarks, found places, the goal `!` and the castle. `hud-driver.tsx` moves it every
  frame through `bus.setNode("mapWorld")`. The pure maths is in `lib/realm3d/minimap.ts`.
- **Mouse.** In `look-input.ts`, a left click captures the mouse (pointer lock) and a right-drag
  looks around while the mouse is free. `bodyFacing()` in `controls.ts` turns a standing body to
  face the camera's heading whenever `looking()` is true. So every way of looking also turns the
  hero, and the child can never see their hero's face.
- **Casting from the saddle.** `castBlocked(ride)` refuses every cast while `ride.phase !== "off"`
  and says `CAST_FROM_SADDLE`. Getting down is a timed moment (`phase "down"`, then a `dismounted`
  event) that can be refused in deep water (`canGetDown`).
- **Per-hero settings with a separate copy for visitors** already exist for sound:
  - the hero's own settings are JSON in `realm_settings.sound`;
  - a grown-up's are in `realm_visitor_sound`, one row per user;
  - `saveRealmSound` in `lib/actions/realm-sound.ts` works out from the session which row to
    write, never from the client;
  - `loadRealmSound` reads the right row.

  Keybinds copy this pattern.

## 3. Approaches

How the game reads rebindable keys:

- **A. One input router (chosen).** A single keyboard listener turns physical key codes into named
  actions using the active keymap. The shared guards live in that one place, and features
  subscribe to actions.
  - Gives: one door for all keys; rebinding takes effect everywhere at once; a new action is one
    table entry.
  - Costs: every existing listener is rewritten to subscribe.
- **B. Shared keymap lookup only.** Each listener stays where it is and asks the keymap
  "is this code bound to mount?".
  - Gives: a smaller change.
  - Costs: the guards stay copied across seven listeners, and the next feature can forget one.

The owner chose A.

How to see the hero's front:

- **Left-drag, WoW style (chosen).** Considered alongside a middle-button drag (some trackpads and
  kids' mice have no middle button) and a held key plus mouse.

The owner's other decisions:

- The big map is a panel that pauses the game.
- Every keyboard action is rebindable.
- Keybinds are saved per hero, with each visitor keeping their own.
- A spell key in the saddle dismounts the hero, then casts.

## 4. Design

### 4.1 The action table (`src/lib/realm3d/keymap.ts`, pure, no DOM)

```ts
type ActionId =
  | "walkForward" | "walkBack" | "strafeLeft" | "strafeRight"
  | "jump" | "interact"
  | "cast1" | ... | "cast9"
  | "pause" | "map" | "mount" | "follow";

type ActionDef = {
  id: ActionId;
  label: string;            // "Get on or off your mount"
  group: "move" | "act" | "spells" | "menus";
  defaults: string[];       // KeyboardEvent.code values, primary first; at most 2
  hold: boolean;            // true: down and up both matter (walking); false: one press (repeat dropped)
};
export const ACTIONS: readonly ActionDef[];
```

Defaults:

| Action | Default keys |
|--------|--------------|
| Walk forward | W, ↑ |
| Walk back | S, ↓ |
| Step left | A, ← |
| Step right | D, → |
| Jump | Space |
| Interact | E |
| Cast 1 to Cast 9 | 1 to 9 |
| Pause | P |
| Map | **M** |
| Mount | **Z** |
| Follow | F |

Functions in the module:

- `Keymap = Record<ActionId, string[]>`.
- `keymapFrom(raw: unknown): Keymap` validates and fills gaps. Anything unknown, malformed,
  reserved or not allowed falls back to that action's defaults. If a code is bound twice, the
  first action in table order keeps it.
- `keymapToStored(k): string` stores only the actions that differ from their defaults. An action
  added later then gets its default key with no data fix-up.
- `bind(k, action, code, slot): { keymap, displaced?: ActionId }` binds one key and swaps on
  conflict. The action that held the key takes over the key it replaces, so nothing is left
  unbound by accident. It returns `displaced` so the UI can say what moved.
- `resetKeymap()` restores all defaults.
- `actionFor(k, code): ActionId | null` is built as a reverse `Map` once per keymap. It is a
  lookup, not a scan.
- `keyLabel(code)` gives the display name: `KeyZ` becomes "Z", `ArrowUp` "↑", `Space` "Space",
  `Digit3` "3", `ShiftLeft` "Left Shift". Each surface reads the label through this function.

**Allowed codes:** `KeyA`–`KeyZ`, `Digit0`–`Digit9`, `Numpad0`–`Numpad9`, the arrows, `Space`,
`ShiftLeft`, `ShiftRight`, `Backquote`, `Minus`, `Equal`,
`BracketLeft`, `BracketRight`, `Semicolon`, `Quote`, `Comma`, `Period`, `Slash`, `Backslash`,
`Enter`, `Backspace`.

**Reserved codes, never bindable:**

- `Escape`: the browser uses it to free the mouse; it stays the frame's "back" key.
- `Tab`: keyboard focus.
- `Meta*`, `Alt*`, `Control*`. A held Ctrl-bound key plus W is Ctrl+W, which closes the tab, and
  no page can stop that.
- `F1`–`F12`: browser keys such as reload and fullscreen.

Saving runs `keymapFrom` again on the server, so the client is never trusted.

### 4.2 The input router (`src/lib/realm3d/input-router.ts`)

A framework-free class. The window or document is handed in, as `look-input.ts` already does, so
it can be tested with fakes.

```ts
createInputRouter({ target, keymap, typing: (t) => boolean }): InputRouter
type Scope = "island" | "room" | "play" | "always";
router.on(action, (e: { down: boolean; repeat: boolean }) => void, opts: { scope: Scope }): () => void
router.setKeymap(k)                 // rebinding applies at once
router.setState({ overlay, inside }) // written by the frame, beside bus.setPaused
router.held(action): boolean        // replaces held-keys.ts and seedMoves
```

**Scopes decide when a key down is delivered.** Each subscriber states its scope when it
registers.

| Scope | Delivered when | Used by |
|-------|----------------|---------|
| `island` | no overlay and not inside | island scene, tutorial |
| `room` | no overlay and inside | room scene |
| `play` | no overlay, on the island or inside | mount, follow, map |
| `always` | any time | pause (P toggles its own panel) and map (closes its own panel); each checks which overlay is open |

This replaces both today's single `paused` flag and the `insideRef` checks scattered across
`riding-hud` and `companion-hud`.

One `keydown` and one `keyup` listener on `window`, in the capture phase. The router applies the
shared rules once:

- **Typing:** key downs are ignored while the child is typing into a field (`typingInto`), for
  every scope.
- **Focus inside a dialog:** key downs are ignored when focus is inside a `[role='dialog']`, for
  every scope except `always`. This is what M and F do today. `always` is exempt because the
  pause menu and the map are themselves dialogs (`Panel`, `frame-hud.tsx:388`), and P and M must
  still close them.
- **Ctrl, Meta or Alt held:** ignored, so browser shortcuts still work. Shift on its own can be
  bound as a key; it does not set `ctrlKey`, `altKey` or `metaKey`, so this guard never drops it.
- **Auto-repeat:** dropped for one-press actions (`hold: false`).
- **Paused:** a key down reaches only handlers registered `whilePaused`. Map and Pause use this to
  close their own panels.
- **Key up:** always delivered, so nothing sticks held across a pause or a door.
- **`preventDefault`:** called only for keys bound to an action, and only while playing. This
  keeps the existing Space behaviour (no page scroll, no re-pressing the last-clicked button).
- **Window blur:** clears what is held and sends a key up for every held action, the job
  `releaseKeys` does today.

The router lives once per Realm mount, created in `realm-game.tsx` and provided by a small React
context (`useRealmInput()`). These subscribe by action:

- the island scene;
- the room scene;
- `riding-hud`;
- `riding-scene`;
- `companion-hud`;
- `use-pause`;
- the tutorial's listener;
- the new map panel.

`held-keys.ts` and its reference counting are removed. `seedMoves` is replaced by a router helper,
`seedMoves(router, keys)`, which reads `held()` for the four walk actions. The room scene and
`riding-scene.tsx` (both of today's callers) switch to it. The router knows what is physically held
in every scope, so a key held through a door or a menu still counts.

**Esc is not in the keymap.** It stays the frame's fixed "back" key. Board-local Esc handlers such
as `gate-quest-board.tsx` stay as they are.

### 4.3 Storage and security

- **Child's keybinds:** a new nullable column `realm_settings.keybinds` (text, JSON overrides).
  Null means all defaults.
- **Visitor's keybinds:** a new table `realm_visitor_keybinds`:
  - `userId` text, primary key, references `user.id` with `on delete cascade`;
  - `keybinds` text, not null;
  - `updatedAt`.

  This mirrors `realm_visitor_sound`. A separate table, rather than a column on the sound table,
  leaves the existing table and its `NOT NULL sound` untouched.
- **Service:** `loadRealmKeybinds(childId, visitorUserId)` in `lib/services/realm-keybinds.ts`.
  The Realm page loads it beside sound and passes it in as a prop.
- **Action:** `saveRealmKeybinds(childId, raw)` in `lib/actions/realm-keybinds.ts`, the same shape
  as `saveRealmSound`:
  - which row gets written is decided from `requireChildAccess`, never from the client;
  - a child needs write access to themselves;
  - a visitor writes only their own row, so read access to the child is enough;
  - the input is cleaned with `keymapFrom`.

  Per the "use server" rule, the action file exports only async functions.
- Run `npm run db:generate` and `npm run db:migrate`. The migration only adds a column and a
  table, so it is backward-compatible.

### 4.4 Rebinding UI (pause menu → Controls)

The Controls panel (`frame-hud.tsx`) keeps its rows, now built from `ACTIONS` grouped by `group`.

- **Changing a key.** Each keyboard row shows one or two key chips, which are buttons. Clicking a
  chip puts that row into listening mode ("Press a key… Esc to cancel"). The panel then captures
  the next allowed key itself and briefly sets the router aside, so the key isn't acted on.
- **A key already in use** is swapped (`bind` above). A line says what moved, for example "Z was
  Mount. Mount is now M."
- **A reserved key** gets a short line saying it can't be used, and the row keeps listening.
- **Reset to defaults** is one button.
- **Saving.** A change applies at once (`router.setKeymap`) and is saved through
  `saveRealmKeybinds`, debounced like the sound sliders. If the save fails, the new keys still
  work for this visit, and a quiet line says they weren't saved.
- **Mouse rows** (Click, Left drag, Right drag, Wheel) are listed but not editable.
- **Keyboard and screen readers.** Every chip is a focusable button with an `aria-label` such as
  "Mount: Z. Press to change." Listening mode announces itself through `aria-live`.

`controlRows()` and `keyHints()` take the keymap and build their rows from it:

- **Controls panel and how-to card:** the Map, Mount and Follow rows show for everyone. For a
  child without a mount or pet, the existing "once you've picked one in the Tavern" copy stays.
  For a visitor, the rows describe what the key does for the hero.
- **Hint strip:** Map always; Mount when the hero can ride; Follow when they have a pet. A key
  that does nothing yet is clutter on a strip meant for the first few verbs.
- **Copy that names a key** reads the current label: the saddle line, the "Get on your mount
  first" line, and the tutorial's "Press Space" and "Press M to get on". So a child who moved Jump
  to J is told "Press J".

### 4.5 The big map (M)

- **Opening and closing.** A new overlay kind, `{ kind: "map" }`. Map pressed while playing opens
  it. The frame's pause and the pointer-lock release come for free, as for any overlay. Map or Esc
  closes it. Opening it from another panel isn't supported: M does nothing under a different
  overlay.
- **What it shows.** The whole island, north up, fitted to the viewport (square, up to about 90vh
  or 90vw), with:
  - the baked land;
  - roads;
  - landmarks;
  - found places (unfound ones stay hidden, as on the minimap);
  - the castle;
  - the goal `!`;
  - the troubles' dots and other `extras`;
  - the hero's arrow, at their position and facing.

  The map is a still picture: the world is paused, so nothing needs to move each frame.
- **Where the extras come from.** The minimap's extras can't simply be drawn a second time. The
  trouble dots (`troubles-hud.tsx:59`, `tbus.setMark`) and the recess mark (`recess-hud.tsx:193`,
  `bus.setNode("mapMark")`) are placed each frame through single ref slots and start hidden, so a
  second copy would stay hidden while paused or take over the minimap's ref. Instead, the map gets
  a pull-based source:
  - a `MapMarks` registry on the HUD bus, where each feature registers a function returning its
    current marks: `{ id, x, z, kind, label }[]`;
  - the big map reads every registered source once, when it opens;
  - the minimap's per-frame ref path stays as it is.

  A future feature adds marks to the big map by registering a source.
- **Shared drawing code.** The SVG layers inside the minimap's panning group become a
  `MapLayers` component that both maps render:
  - the minimap keeps its circular clip and `MAP_WINDOW` window, moved by the driver;
  - the big map sets a fixed `viewBox` over `WORLD_HALF`.

  `useBakedLand` is shared. The bitmap is baked once and used by both maps. Landmark glyphs scale
  with the window, so they stay legible at the larger size (`GLYPH_SCALE` becomes a function of
  the window).
- **Inside a building.** The map shows the island, with the hero's arrow at the door they went in
  by.
- **Visitors** can open it too, and it shows what the hero has found.
- **Accessibility.** A labelled dialog ("Map of the island"), with focus moved to it on open and
  returned on close. Place names are in a visually hidden list for screen readers. The minimap
  stays `aria-hidden`.

### 4.6 Mount on Z, and casting from the saddle

- `riding-hud` subscribes to `mount` instead of listening for M. Its rules (refusals, resting,
  indoors, mid-travel) don't change.
- **Casting from the saddle.** When a cast action arrives (key or click on a spell) and
  `ride.phase` is `"on"`, `"up"` or `"down"`, and the hero is not on a fast-travel ride:
  - the cast is held as one pending slot on the ride bus (`ride.castAfter = n`; a newer press
    replaces it);
  - the hero is asked to get down with `ride.want = false`.

  **This is new behaviour during mount-up.** Today `stepRide` throws away `want = false` while
  `phase === "up"` (`riding.ts:362-379`). With a cast pending, the dismount is held instead and
  starts the moment the phase reaches `"on"`. Pressing the mount key during mount-up still does
  nothing, as now.
- **When the `dismounted` event lands,** the pending cast is pushed into the cast queue exactly as
  a normal cast is. Mana and cooldown are checked then.
- **The pending cast is dropped, silently, if** the dismount is refused (deep water: the existing
  `refused-deep` line plays), the child goes through a door (`parkNow`), the game pauses, or a
  fast-travel ride starts.
- **On a fast-travel ride,** spell keys still do nothing, with the existing line.
- **New pure functions** in `riding.ts`: `castFromSaddle(ride, slot)`, and `takeCastAfter(ride)`
  called on the `dismounted` event. `castBlocked` keeps its name but now means "can't cast at
  all": only during travel. `CAST_FROM_SADDLE` is removed. All of this is unit-tested in
  `riding.test.ts`.

### 4.7 Free look with the left drag

The mouse rules become:

| Input | Camera | Hero |
|-------|--------|------|
| Left button down, moved more than `CLICK_SLOP` (4 px) before release, mouse free | orbits (drag) | **does not turn** |
| Left click with no drag, mouse free | captures the mouse (as today) | as today |
| Left button held while the mouse is captured | orbits | **does not turn** |
| Right drag, mouse free | orbits | turns to the camera's heading (as today) |
| Mouse captured, no button | orbits | turns to the camera's heading (as today) |

**Capture now happens on release.** `look-input.ts` asks for the capture on `pointerup` once it
knows the press was a click, not on `pointerdown`. A pointer lock request needs user activation;
the `pointerdown` that just happened provides it, and Chrome keeps it for about 5 seconds, which
covers the gap. This must be checked by hand in Chrome and Firefox (the builder verifies it).

**What the hero does during free look.** The look source reports what kind of look it is:
`sink(dx, dy, mode: "turn" | "orbit")`. `LookState` gains `orbiting: boolean`. `bodyFacing()`
does not count an orbit as `looking`, so a standing hero keeps their facing while the camera
swings round to their front.

**Walking while orbiting:** the walk keys move the hero relative to the hero's own facing, not
the camera, so pressing forward walks them forward toward a camera that is looking at their face,
as in WoW. `moveIntent` takes the yaw it should use; the scene passes the body's facing while
orbiting and the camera yaw otherwise.

**When the drag ends,** the camera stays where it was left. It does not swing back, keeping the
"nothing else moves the camera" rule. The next walk key goes back to camera-relative walking, and
the hero turns to the camera's heading the usual way (`turnToward`, the short way round).

**In the saddle, or on a fast-travel ride, a left-drag only orbits the camera.** The walk keys
stay camera-relative, and the mount steers exactly as it does today (`rideFace`). Walking by the
body's facing is for a hero on foot only. A mount faces its direction of travel, so steering by
its facing would send it in circles.

The room scene gets the same behaviour; it already shares `bodyFacing` and `look-input`.

### 4.8 The tutorial and the copy that names keys

- `tutorial.ts` lessons that name keys (`keys: ["Space"]`, "Press Space", the ride lesson) take
  their labels from the keymap.
- The ride lesson's wording becomes "Press Z to get on, and Z again to get off", using whatever Z
  is bound to.
- The tutorial's own key listener in `realm-game.tsx` subscribes to the router (walk actions and
  `jump`) instead of reading codes.

### 4.9 Tests

- **`keymap.test.ts`:**
  - defaults have no duplicates and use only allowed codes;
  - `keymapFrom` handles garbage, reserved codes, duplicates and unknown actions;
  - the stored diff round-trips;
  - `bind` swaps on conflict and reports what was displaced;
  - `keyLabel`.
- **`input-router.test.ts`, with fake targets:** typing guard, modifier guard, repeat rule,
  delivery while paused, key up always delivered, blur releases held keys, `setKeymap` applies at
  once, `held()`.
- **`riding.test.ts`:** the queued cast fires after `dismounted`; it is dropped on a refused
  dismount, a door, or travel; a newer press replaces it.
- **`controls.test.ts`:** `bodyFacing` doesn't turn on an orbit; `moveIntent` follows the body's
  yaw while orbiting.
- **`look-input.test.ts`:** a left drag past `CLICK_SLOP` orbits and never captures; a click
  captures on release; holding left while captured orbits.
- **`frame.test.ts`:** `controlRows` and `keyHints` reflect a custom keymap; Map, Mount and Follow
  rows are present.
- **Component tests:**
  - the rebind panel: listen, swap line, reserved-key line, reset;
  - the map panel: M opens and closes it, Esc closes it;
  - the existing `realm-riding` and companion tests move from M to Z;
  - the existing `realm-game` tests use router actions.
- **Server:** `saveRealmKeybinds` writes the child's row for a child and the visitor row for a
  grown-up, and cleans its input.

## 5. Decided by the owner

- M opens a pausing full-island map panel; M or Esc closes it.
- Mount moves to Z by default.
- Every keyboard action is rebindable; mouse and Esc are not.
- Keybinds are saved per hero on the server; each visiting grown-up keeps their own.
- A spell key in the saddle dismounts, then casts once on foot; deep water refuses with a line.
- Left-drag orbits the camera without turning the hero; a click still captures; right-drag
  unchanged.
- One input router (approach A).

## 6. My calls (the owner may correct)

1. **Swap on conflict** when a key is already bound, with a line saying what moved, rather than
   refusing or leaving the other action unbound.
2. **Up to two keys per action**, so WASD and the arrows both keep working.
3. **Holding the left button while the mouse is captured** also orbits without turning the hero.
4. **Walking during a left drag** goes by the hero's facing (WoW), and the camera stays where it
   was left after the drag.
5. **Map, Mount and Follow rows always show** in the Controls panel and how-to card. The hint
   strip shows Map always, and Mount and Follow only when the hero has them.
6. **The map works indoors** and shows the island, with the hero at their door.
7. **A new `realm_visitor_keybinds` table** rather than widening `realm_visitor_sound`.
8. **Shift can be bound;** Ctrl, Alt, Meta, Tab, Esc and the F-keys cannot. A Ctrl binding would
   turn Ctrl+W into a closed tab.
9. **Router scopes** (`island`, `room`, `play`, `always`) replace the single paused flag and the
   scattered `inside` checks.
10. **In the saddle, a left-drag orbits the camera only.** Walking by the hero's facing applies
    on foot.
11. **The big map gets its extras from a pull-based `MapMarks` registry**, read once when it
    opens, not from the minimap's per-frame refs.
12. **A dismount requested by a cast during mount-up waits until the hero is fully on**, then
    happens. This is new behaviour.
13. **The dialog guard M and F use today applies to every action except the `always` scope.**
    That scope is used by the panels that close themselves.

## 7. Left to the builder

- The exact visual design of the map panel and the key chips, within the existing `r3-` panel
  styles.
- The debounce interval for saving keybinds (follow the sound panel's).
- Whether `MapLayers` lives in `hud.tsx` or its own file under `components/realm3d/`.
- Order of work. The suggested order is: keymap and router first (no behaviour change, only M
  becomes Z); then cast-dismount; then the big map; then free look; then the rebind UI and
  storage.
