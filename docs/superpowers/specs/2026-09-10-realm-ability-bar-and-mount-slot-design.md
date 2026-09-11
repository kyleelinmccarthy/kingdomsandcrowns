# The ability bar, and the mount finally exists

**Date:** 2026-09-10
**Status:** Design spec. Written up front per programme decision 1; the implementation plan (with fresh file:line citations) is written when this slice is built.
**Programme:** [The Realm: Presentation Overhaul](2026-09-10-realm-presentation-overhaul-brief.md), slice **3 of 13** (`ability-bar-and-mount-slot`, large).
**Depends on:** slice 1 `first-impression` (the depth contract `surfacesFor()`, `bundle.depth`, the centred message lane, `clock.flushPending()` on unmount) and slice 2 `sprite-budget-and-gallery` (the parallelised, warm, kind-keyed raster cache).
**Depended on by:** slice 6 `doors-and-the-tavern`, slice 7 `fast-travel-and-the-companion`, slice 8 `troubles-that-read-and-pay`, slice 9 `sound-and-first-five-minutes`, slice 12 `recess-that-counts`.
**Code read at:** branch `realm-foundations`, HEAD `0c1df7a`. Every line number below was re-verified against that commit; where the brief's appendix cites a number that has since drifted, both are given.

---

## 1. Why — the complaints and audit findings this answers

### The verdict, in the user's words

> "...**the spell bar looks really rough and there are not slots for the mount. theres no way to get to spellbook from here** ... **i dont like the location of the mana** or player name/health. its really, really rough in a bad way and needs to improve a LOT ... this doesnt feel like a well thought out game at all."

Four of the eighteen problems are inside one strip of screen thirty pixels tall. This slice rebuilds that strip.

### The audit findings this slice answers, verbatim

**HUD cluster — "the spell bar looks really rough" — _major, large effort_**

> The bar is a row of text pills, not slots. Each chip is `display:flex` with `padding: 0 .7rem`, `border-radius: 9999px`, `white-space: nowrap` (globals.css:1740) holding a keycap number, a 10px dot, an icon and the spell's full name (spell-bar.tsx:119-123) — so chips are different widths depending on how long the child's spell name is, in a bar that then `overflow-x: auto` scrolls (globals.css:1738). Empty pages get the SAME pill with a dashed border (globals.css:1747), so three of the four things in the bar look like abilities the hero has, which is exactly what the screenshot shows. The mana cost is rendered only AFTER the page is selected (`{selected && page.spell && <span className="realm-spell-cost">`, spell-bar.tsx:123) — backwards; the cost is what you need to decide WHICH to pick. Unaffordable is a flat `opacity: .55` (globals.css:1742) with no number. There is no cooldown ring, no cast progress, no active-effect indication. At ≤640px the names are hidden outright (globals.css:1766) leaving an unlabelled number+dot. The bar also unmounts entirely when a panel, the ceremony or help opens (realm-shell.tsx:545) so it pops in and out rather than dimming.

**HUD cluster — "there are not slots for the mount" — _blocking, medium effort_**

> The mount is not an ability at all — it is a text `<Button>` labelled 'Ride'/'Dismount' wedged into the top-left status row between 'Cleared: N' and the crown badge (realm-hud.tsx:78-82, styled at globals.css:1759-1760). The spell bar has no mount slot, no companion slot, no anything but spell pages (spell-bar.tsx:85-126). There are 8 mounts in the catalog with real stats (avatar-catalog.ts:310-320, speeds 4.2-7.0 vs HERO_SPEED 3.5) and none of that is visible: no mount icon, no name, no speed, no indication one exists. Worse, `hudRide` is null when `canRide` is false (realm-shell.tsx:456-458 combined with 240-241: `canRide` requires `avatarConfig.mount` to be set AND unlocked), so a hero who owns three mounts but has not equipped one in the avatar editor sees no mount affordance whatsoever in the Realm, and there is no way to pick one from inside the world. The `M` keybinding (realm-shell.tsx:311-318) is documented only inside the help card (realm-help.tsx:32).

*(Verified at HEAD: `canRide` is realm-shell.tsx:240, `hudRide` is realm-shell.tsx:475-477, the M handler is realm-shell.tsx:307-313.)*

**Navigation cluster — "theres no way to get to spellbook from here" — _blocking, small effort_**

> The Spellbook link is gated behind failure. It only renders inside the `hint` panel (`spell-bar.tsx:128-149`), and `hint` is only set by clicking a chip whose `className` is `realm-spell realm-spell--empty` and whose `aria-label` is literally `Empty page N` (`spell-bar.tsx:87-103`). A hero who has filled every page has no path to /spellbook from inside the Realm at all. Under `fewerChoices` it's worse: `spell-bar.tsx:33-43` pads with empties only when fewer than four saved pages exist, so a hero with 4+ spells sees zero empty chips and zero Spellbook route.

**HUD cluster — "i dont like the location of the mana or player name/health" — _blocking, medium effort_** (the mana half; the hero-plate half is slice 1's)

> ...(2) WRONG RESOURCE FEATURED: mana is `MANA_MAX = 100` regenerating at `MANA_REGEN_PER_S = 5` (mana.ts:3-4) against a cheapest spell cost of 10 and a dearest of 45 (spell-catalog.ts:81-98). Mana is full within 2-9 seconds of any cast and effectively never gates play, yet it gets a 7rem bar in prime real estate (globals.css:1755-1757). ... The sim even emits `{kind:'castState', casting}` and the shell explicitly discards it: `case "castState": break;` (realm-shell.tsx:361).

*(Verified at HEAD: the discard is realm-shell.tsx:**360**.)*

> *Fix:* ...Keep a compact mana bar hugging the TOP EDGE of the ability bar (bottom-centre) so cost and resource read together — that is the convention every action bar uses. Consume the `castState` event to draw a cast-progress arc on the active slot (castMs is 300-900ms, spell-catalog.ts:81-88 — long enough to need feedback).

**HUD cluster — "the spell bar looks really rough" — _minor, small effort_**

> At ≤640px with the on-screen stick disabled, the empty-page hint dialog overlaps and covers the spell bar. `.realm-spellbar` drops to `bottom: 6.5rem` in the mobile query (globals.css:1766) but the hint's non-raised position stays at `bottom: 5.5rem` (globals.css:1748). ... It hides the only Spellbook link at exactly the moment it is being used.

> *Fix:* Stop hand-tuning four bottom offsets. Publish the bar's measured height as a CSS custom property (`--realm-bar-height`) the way GameNavBar already publishes `--game-navbar-height` (game-nav.tsx:74-90), and position the hint as `bottom: calc(var(--realm-bar-bottom) + var(--realm-bar-height) + 0.75rem)`. Delete the `--raised` and mobile bottom overrides in favour of the one computed value.

**HUD cluster — "implied" — _minor, small effort_**

> HUD text and spell-bar text scale on two different bases, so they cannot stay visually matched. The HUD sets `style={{ fontSize: `${hudScale}em` }}` (realm-hud.tsx:59) — an em relative to whatever body inherits — while the spell bar sets `style={{ fontSize: `${12 * hudScale}px` }}` (spell-bar.tsx:81), an absolute pixel base. On top of that, `.realm-root[data-larger-text="on"]` only zooms `.realm-panel`, deliberately not the root (globals.css:244-246), so there are three different largerText behaviours in one screen. A largerText hero gets a HUD that grows with the page font and a spell bar locked to 15px.

**HUD cluster — "Missing entirely"**

> - A mount slot, a companion slot, or any inventory representation in the ability bar (spell-bar.tsx:85-126).
> - Cooldown / cast-progress feedback on the ability bar, despite `castMs` running 300-900ms (spell-catalog.ts:81-88) and the sim emitting `castState`, which the shell throws away (realm-shell.tsx:361).
> - Any mobile/responsive treatment of the HUD. The only realm media query in globals.css (line 1766) touches the spell bar.

**HUD cluster — "Not complained about yet, but will be"**

> - The path to the Spellbook depends on the hero having an EMPTY spell slot (spell-bar.tsx:86-103,145). Filling all four pages — the natural goal — removes the link. This will break silently as soon as a child actually uses the Spellbook builder.
> - The mount disappears from the HUD entirely if `avatarConfig.mount` is unset, even when the hero has unlocked mounts (realm-shell.tsx:240-241,456-458). A child who earned a Stag at level 8 may never learn they can ride it.
> - Mana is nearly meaningless as a constraint: 100 pool, +5/s regen, spells cost 10-45 (mana.ts:3-4, spell-catalog.ts:81-98). Giving it the most prominent meter teaches children to watch a bar that is almost always full.

### Two findings of this slice's own, from reading the code for it

**F1. `spriteKey` varies on fields the hero figure does not draw.** `spriteKey(config)` deletes only `background` and `backgroundColor` from the avatar config before hashing (sprite-texture.ts:10-15), so `mount` and `mountColor` are part of the hero's texture key — yet `AvatarFigure` draws no mount pixels in either pose (avatar.tsx:1859-1863 branches only on `mounted`, and the mount is a separate `MountFigure`, avatar.tsx:1909). Changing a mount therefore invalidates the hero texture, the companion texture (`${key}:companion`, sprite-source.tsx:103) and the mounted-rider texture (`${key}:mounted`, sprite-source.tsx:124) — three rasterisations for a change that alters none of them. Nothing exposes this today because `avatarConfig` cannot change mid-visit; this slice makes it changeable, so the key must be fixed first.

**F2. The world has never had a mid-visit texture swap.** `SpriteSource`'s effect depends on `mount` (sprite-source.tsx:169) and today `mountTexture` is memoised on a bundle field that never changes (realm-shell.tsx:242-245). An in-bar mount picker introduces the first swap: a second `onReady`, a new `SpriteTextures` object, a re-render (not a remount) of the memoised `World`. §5 states what survives that and what has to be watched in the browser pass.

---

## 2. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Chips or slots? | Fixed-size square slots, `56px × --realm-hud-scale`, in a wrapping fixed-shape row. No `overflow-x` scroller. | The bar's shape must not depend on how long a child names a spell (globals.css:1740, `white-space: nowrap`). |
| D2 | When is the cost shown? | **Always**, bottom-right of every spell slot. Numeral at full depth, cost pips at simple depth. | "the cost is what you need to decide WHICH to pick" — spell-bar.tsx:123 shows it only after selection. |
| D3 | How does unaffordable read? | Desaturated icon + **red** cost, `aria-disabled` (still focusable, still explains itself). Never a blanket `opacity`. | globals.css:1742's `opacity:.55` hides the number too. |
| D4 | What does an empty page look like? | A recessed dashed socket: no keycap, no icon, no element colour, no swatch. | Three of the four things in the user's screenshot were empty pages wearing an ability's clothes. |
| D5 | How many slots does the bar show? | Every page the hero owns, always. Wraps to a second (rarely third) row; never truncates, never scrolls, never hides a castable page. | The complexity axis forbids removing something a child can otherwise do. §6 gives the measured heights this costs. |
| D6 | What does the discarded `castState` become? | A cast-progress sweep on the casting slot, driven by a CSS animation of exactly `castMs`. The event is widened to carry `slot` and `castMs`. | realm-shell.tsx:360 throws away the only signal of a 300-900ms freeze. |
| D7 | Where does mana live? | Hugging the top edge of the bar, inside it. `.realm-hud-mana` and its three rules (globals.css:1755-1757) are **deleted**, not moved. | Cost and resource must read together; the 7rem corner meter is the complaint. |
| D8 | Pips or numbers? | `surfacesFor(depth, profile).numerals` decides, for both the mana strip and the slot costs. One pip = 10 mana; a cost rounds **up** to whole pips. | One unit for both, so "this costs two of those" is legible without arithmetic. Rounding up never tells a child something is cheaper than it is. |
| D9 | Does the mount slot exist when nothing is equipped? | Yes — empty-but-present, with a silhouette, and a tap opens a picker over `bundle.mounts.unlocked`. | `hudRide` is null when `avatarConfig.mount` is unset; a child who earned a Stag at level 8 sees nothing. |
| D10 | Does the picker write to the hero's avatar? | Yes. A new narrow action `equipMount(childId, mountId)` writes `child.avatarConfig.mount`, so the choice survives the visit and matches the avatar editor at `/loot`. | A choice a child makes in the world that evaporates on leaving is the recess mistake (three chips of throwaway state) repeated. |
| D11 | Does riding do anything new here? | **No.** Riding is speed only, exactly as today. The slot ships now so the mount is legible; fast travel is slice 7, once there is somewhere to travel to. | Programme decision 5; the distance riding pays back does not exist until slice 4's 64-unit village. |
| D12 | How is the slot built to take fast travel later? | One shared `.realm-slot-fill` overlay element (the cast sweep on spell slots) is the same element slice 7 drives for hold-to-travel, and `MountSlot.hold` is a declared field, `null` in this slice. | "the slot must be built to take a second affordance without a rebuild" — with no dead code. |
| D13 | Is the Spellbook button ever hidden? | Never. Not by depth, not by `fewerChoices`, not by a full spellbook, not by a panel (it dims with the bar), not by preview. | Filling all four pages — the goal we set — currently deletes the only route to /spellbook. |
| D14 | Is the bar unmounted when a panel opens? | No. It dims: `inert`, `aria-hidden`, 35% opacity, and **its key listeners stand down** (see §5, E7). | realm-shell.tsx:545-558 pops it in and out. |
| D15 | One scale knob | `--realm-hud-scale` on `.realm-root` from `settings.hudScale`; every HUD and bar size derives from it. The two inline `fontSize` styles (realm-hud.tsx:59, spell-bar.tsx:81) are deleted. | Two bases can never stay matched. |
| D16 | ARIA role for the bar | `role="group" aria-label="Abilities"`, **not** `role="toolbar"`. | A toolbar promises arrow-key roving focus; arrows are the movement keys. The current `role="toolbar"` (spell-bar.tsx:82) makes a promise the world cannot keep. |
| D17 | Does the bar render in a parent preview? | Yes, read-only: slots and costs visible, nothing selectable, mana strip suppressed (never invented), mount slot showing the child's equipped mount, Spellbook link live. | "every spec decides deliberately whether its surface renders in preview" — a parent asking "what does my child see" should see the bar. |
| D18 | Schema change? | **None.** The only write is to the existing `child.avatar_config` TEXT column. | §4. |

---

## 3. Design

### 3.1 The shape of the bar

```
                       ┌─────────────────────────────────────────────────┐
   .realm-bar-mana  →  │ ●●●●●●○○○○                            Mana 62   │   14px strip, hugs the top edge
   .realm-bar-caption→ │ Ember Bolt · 10 mana                            │   one reserved line, 1.2em
                       │ ┌────┐ ┌────┐ ┌╌╌╌╌┐ ┌╌╌╌╌┐  │  ┌────┐  ┌────┐  │
   .realm-bar-row   →  │ │1 ⚡│ │2 💧│ ╎    ╎ ╎    ╎  │  │M 🦌│  │ 📖 │  │   56px × --realm-hud-scale
                       │ │  ①│ │  ②│ ╎    ╎ ╎    ╎  │  │    │  │    │  │
                       │ └────┘ └────┘ └╌╌╌╌┘ └╌╌╌╌┘  │  └────┘  └────┘  │
                       └─────────────────────────────────────────────────┘
                          spell   spell  empty  empty  ↑    mount   book
                                                    divider
```

The bar is one element, centred, at `bottom: var(--realm-bar-bottom)`, `z-index: 20`. It contains, in order: the mana strip, the caption line, and the slot row. The slot row contains the spell slots in book order, then `.realm-bar-divider`, then the mount slot, then the Spellbook button. The divider, the mount slot and the Spellbook button never wrap away from each other (`.realm-bar-tail { display: flex; flex: 0 0 auto }`).

**Shape stability.** Every slot is exactly `var(--realm-slot-size)` square. The caption line always occupies its height, empty or not. The mana strip always occupies its height (suppressed only in preview, where its height collapses once, at mount, never mid-visit). So the bar's height changes only when the slot row wraps — which changes only with the viewport or the hero's page count, never with what the child is doing.

### 3.2 The slot, in detail

| Zone | Content | Full depth | Simple depth |
|---|---|---|---|
| top-left | `.realm-slot-key` keycap | `1`–`9`, `M` | absent (the keys still work) |
| centre | `.realm-slot-icon` — `<GameIcon name={page.icon}>` at `size-6`, or `MountFigure` at `size="md"`, or `GameIcon name="book"` | shown | shown |
| frame | 2px border in `page.color` (the element colour) | shown | shown |
| bottom-right | `.realm-slot-cost` | numeral `10` | `.realm-slot-cost-pip` × `costPips(10)` = 1 |
| overlay | `.realm-slot-fill` — the cast sweep (this slice) / the hold-to-travel fill (slice 7) | shown | shown |

States, as modifier classes on `.realm-slot`:

- `.realm-slot--selected` — raised 2px, `box-shadow: 0 0 0 2px var(--gold-bright)`, `aria-pressed="true"`.
- `.realm-slot--unaffordable` — `filter: saturate(.25)` on the icon **only**; the cost turns `var(--danger)` and stays fully opaque; `aria-disabled="true"` (focusable; tapping it sets the caption to the cost, it does not select).
- `.realm-slot--empty` — `background: rgba(0,0,0,.35); border: 2px dashed rgba(255,255,255,.28); box-shadow: inset 0 2px 4px rgba(0,0,0,.5)`. No keycap, no icon, no colour, no swatch.
- `.realm-slot--faded` — a page whose spell parts are gone from the catalog. Grey frame, a `GameIcon name="scroll"` at 40% opacity, `disabled`, name `This page is faded.` (the existing `FADED_PAGE` constant, pages.ts:5). Shown at **both** depths: it is the only signal that something the child made has broken.
- `.realm-slot--riding` — the mount slot while mounted: pressed inset, gold frame, `aria-pressed="true"`.
- `.realm-slot[data-casting="on"]` — the sweep is running.

Touch targets: `--realm-slot-size` is 56px at scale 1 and 48px at ≤640px, both above the 44px floor the codebase already uses (`.realm-bubble-talk`, `.realm-hud-help`).

### 3.3 The caption line — the hover substitute that works on touch

There are no per-slot tooltips. One line, `.realm-bar-caption`, sits between the mana strip and the slot row and shows the name (and cost, at full depth) of whatever is **selected**, or — on a pointer device — whatever is hovered or keyboard-focused, hover/focus winning over selection. It is `aria-hidden="true"` (every slot already carries the same information in its own `aria-label`, and a live-region duplicate would double-speak).

Copy, verbatim:

| Situation | Caption |
|---|---|
| nothing selected, nothing hovered | *(empty; the line still reserves its height)* |
| spell slot, full depth | `Ember Bolt · 10 mana` |
| spell slot, simple depth | `Ember Bolt` |
| spell slot, unaffordable, full depth | `Ember Bolt · 10 mana — not enough yet` |
| spell slot, unaffordable, simple depth | `Ember Bolt — not enough yet` |
| empty socket | `Empty page. Make a spell in your Spellbook.` |
| faded page | `This page is faded.` |
| mount slot, equipped, full depth | `Stag · 1.6× walking speed` |
| mount slot, equipped, simple depth | `Stag` |
| mount slot, empty | `Choose a mount` |
| mount slot, saddling | `Your Stag is coming.` |
| mount slot, no mounts unlocked at all | `You'll earn your first mount soon.` |
| Spellbook button | `Spellbook` |
| the hero has no pages at all | `Your spellbook is empty. Open it to make your first spell.` |
| riding, a spell slot hovered | `Get down from your Stag to cast.` |

### 3.4 Mana, at the top edge

`.realm-bar-mana` is a `role="progressbar" aria-label="Mana" aria-valuemin={0} aria-valuemax={MANA_MAX} aria-valuenow={Math.round(mana)}` — the same accessible contract the corner meter has today (realm-hud.tsx:64), so a screen reader keeps the number at both depths.

- **Full depth:** ten pips plus the numeral `Mana 62` right-aligned (the string is `realm-hud.tsx:66`'s, kept verbatim).
- **Simple depth:** ten pips, no numeral.
- One pip = 10 mana (`MANA_PER_PIP`). The pip that mana is currently inside fills partially by width, so the strip drains smoothly rather than in steps.
- **Preview:** suppressed entirely. A parent is shown no invented number.
- `.realm-hud-mana`, `.realm-hud-mana-fill`, `.realm-hud-mana-text` (realm-hud.tsx:63-68) and their CSS (globals.css:1755-1757) are **deleted**. So is slice 1's interim pip strip above the bar — whatever slice 1 names that element, this slice deletes it and folds it into `.realm-bar-mana`.

### 3.5 The mount slot

Six states, from one pure function:

| State | When | Icon | Keycap | Interaction |
|---|---|---|---|---|
| `ready` | a mount is equipped, unlocked and rasterised; not riding | `MountFigure` thumbnail | `M` | tap or `M` mounts |
| `riding` | mounted | `MountFigure`, pressed | `M` | tap or `M` dismounts |
| `saddling` | equipped this visit, sprite not yet rasterised | `MountFigure` at 45% | none | disabled |
| `empty` | no mount equipped (or the equipped one is not unlocked), ≥1 unlocked | grey mount silhouette | none | tap opens the picker |
| `none` | zero unlocked mounts (see §5, E4) | grey silhouette, `.realm-slot--locked` | none | disabled |
| `preview` | `isChildView === false` | the child's mount, or the silhouette | none | disabled |

The thumbnail is `<MountFigure mount={id} color={mountColor} size="md" />` — a plain SVG component (avatar.tsx:1909), rendered straight into the DOM bar. **It costs zero rasterisations**; the sprite pipeline is not involved in drawing the bar.

Strings, verbatim:

| Element | String |
|---|---|
| `ready` aria-label | `Ride your Stag` |
| `riding` aria-label | `Get down from your Stag` |
| `saddling` aria-label | `Stag, getting ready` |
| `empty` aria-label | `Mount slot, empty. Choose a mount.` |
| `empty` title | `Choose a mount` |
| `none` aria-label | `Mount slot. You have no mount yet.` |
| `preview`, equipped, aria-label | `Emma's mount: Stag` |
| `preview`, empty, aria-label | `Emma has no mount yet` |

The preview strings use `bundle.heroName` — the child being previewed, never the adult previewing.

Notices (through slice 1's message lane, via the shell's existing `setNotice`, which self-clears after 2000ms at realm-shell.tsx:347-351):

| Event | Notice |
|---|---|
| mounted | `You're riding the Stag.` |
| dismounted | `Back on your feet.` |
| a mount chosen in the picker | `You chose the Stag.` |
| the chosen mount's sprite arrives | `Your Stag is ready.` |
| a spell tapped while riding | `Get down from your Stag to cast.` |
| the equip write fails | `That mount stayed in the stable. Try again.` |

`Get down from your Stag to cast.` **replaces** the existing `Dismount to cast.` (realm-shell.tsx:276). "Dismount" is not a word a six-year-old owns, and the same verb now has to work as the slot's own label. Where no mount name is available (unreachable while riding, but the type allows it) the fallback is `Get down to cast.`

### 3.6 The mount picker

A small panel over the bar's right end, `role="dialog" aria-label="Choose a mount"`, positioned at `bottom: calc(var(--realm-bar-bottom) + var(--realm-bar-height) + 0.75rem)` and right-aligned to the bar — the same anchoring the empty-page hint gets (§3.9).

```
┌──────────────────────────┐
│ Choose a mount           │
│ ┌──┐ Stag      ●●●○○  ✓  │
│ ┌──┐ Goat      ●●○○○     │
│ ┌──┐ Pony      ●○○○○     │
│ ┌──┐ Donkey    ●○○○○     │
│ ─────────────────────────│
│      On foot             │
│                    Close │
└──────────────────────────┘
```

- Lists `bundle.mounts.unlocked` only, ordered fastest first. Locked mounts are not shown and not teased (see §9).
- Each option: `<button role="option" aria-selected>` with the `MountFigure` thumbnail, the label, and the speed as pips (simple depth) or `1.6× walking speed` (full depth).
- The currently equipped option carries a check and the visually-hidden word `Chosen`.
- `On foot` un-equips (`onEquipMount(null)`), aria-label `Walk on your own feet`.
- `Close` closes and returns focus to the mount slot (the `hintOpener` focus-return pattern already in spell-bar.tsx:46,52-55).
- Under `fewerChoices`: the four quickest unlocked mounts plus `On foot`, with the note `Your four quickest.` under the title. Every mount stays choosable in the avatar editor at `/loot`, so this is a cap on a duplicate surface, not on the wardrobe.
- Escape closes. `M` closes. A pointerdown outside closes it **and is consumed** by a capture-phase listener on `.realm-root`, so dismissing the picker never also queues a walk on the ground mesh (realm-scene.tsx:253-264).
- The world keeps running and **the clock is not paused** — the programme allows exactly one pause, in slice 9. §6 states the seconds this costs.

Speed pips and speed text come from one table:

| Mount | speed | `speedPips` | `speedText` | speech |
|---|---|---|---|---|
| Donkey | 4.2 | 1 | `1.2× walking speed` | `A little quicker than walking.` |
| Pony | 4.5 | 1 | `1.3× walking speed` | `A little quicker than walking.` |
| Goat | 4.8 | 2 | `1.4× walking speed` | `Quicker than walking.` |
| Boar | 5.2 | 2 | `1.5× walking speed` | `Quicker than walking.` |
| Stag | 5.5 | 3 | `1.6× walking speed` | `Much quicker than walking.` |
| Direwolf | 5.8 | 3 | `1.7× walking speed` | `Much quicker than walking.` |
| Gryphon | 6.5 | 4 | `1.9× walking speed` | `Very fast.` |
| Wyrm | 7.0 | 5 | `2.0× walking speed` | `The fastest.` |

`speedPips(speed) = clamp(round((speed − HERO_SPEED) / 0.7), 1, 5)`; `speedText(speed) = \`${(speed / HERO_SPEED).toFixed(1)}× walking speed\``. The speech column is also the pip row's `aria-label`, so the pips are never mute.

### 3.7 The cast sweep

`SpellEvent`'s `castState` is widened to carry which slot and how long:

```ts
| { kind: "castState"; casting: boolean; slot: number; castMs: number }
```

Emitted at use-spell-sim.ts:75 with `{ casting: true, slot: input.selectedSlot, castMs: input.selectedSpell.castMs }` and at use-spell-sim.ts:81 with `{ casting: false, slot: release.released.slot, castMs: release.released.spell.castMs }`. Both values are already in hand (`Casting` carries `slot` and `spell`, caster.ts:6). Events still travel through `queueMicrotask` (realm-scene.tsx:159).

The shell holds `const [sweep, setSweep] = useState<CastSweep>(null)` and replaces `case "castState": break;` (realm-shell.tsx:360) with `beginSweep`/`endSweep`. Two state updates per cast, not per frame; `World`'s props are untouched, so the memo (realm-scene.tsx:71) still shields the scene.

Rendering: `.realm-slot-fill` on the casting slot animates `transform: scaleY(0 → 1)` from the bottom over `var(--cast-ms)`, `linear`, `transform-origin: bottom`, `animation-fill-mode: forwards`. The slot gets `data-casting="on"` and `aria-busy="true"`. No announcement — a 300ms event announced politely would fight everything else in the lane.

`reducedMotion` substitute (this is the rule the single combat particle broke): **no animation at all**; the slot gets a solid `2px var(--gold-bright)` ring plus a `GameIcon name="hourglass"` badge in the top-right for the duration, removed on release. The child still sees that the game is busy and why; it simply does not move.

### 3.8 The Spellbook button

`<Link href="/spellbook" className="realm-slot realm-slot--book" aria-label="Open the Spellbook">` with `GameIcon name="book"`, caption `Spellbook`, no keycap, pinned after the mount slot. It is a real anchor, so activating it unmounts the Realm tree and slice 1's `clock.flushPending()` cleanup runs — this slice adds **no** flush of its own and no `router.push` that could race that cleanup.

It survives every reduction: simple depth, `fewerChoices`, a full spellbook, a dimmed bar (dimmed with everything else), and preview.

The empty-page hint stays exactly as written (`EMPTY_HINT`, `Open the Spellbook`, `Close` — spell-bar.tsx:143-147) but is no longer load-bearing: it is now one of two doors, and the other one cannot disappear.

### 3.9 Sizes, offsets, and the end of the four hand-tuned bottoms

Custom properties, all on `.realm-root`:

| Property | Value | Set by |
|---|---|---|
| `--realm-hud-scale` | `settings.hudScale` (1 or 1.25) | inline style on `.realm-root` in realm-shell.tsx |
| `--realm-slot-size` | `calc(56px * var(--realm-hud-scale))`; `calc(48px * …)` at ≤640px | CSS |
| `--realm-stick-clearance` | `0px`; `8.25rem` under `.realm-root[data-stick="on"]` | CSS |
| `--realm-bar-bottom` | `calc(1.25rem + var(--realm-stick-clearance))` | CSS |
| `--realm-bar-height` | `4.5rem` fallback, then the measured pixel height | `AbilityBar`'s ResizeObserver |

`--realm-bar-height` is published the way `GameNavBar` publishes `--game-navbar-height` (game-nav.tsx:70-89) with two differences: it is set on the **`.realm-root` element** (`el.closest(".realm-root")`), not `documentElement`, so it cannot leak a stale value into the rest of the app after the portal unmounts; and a measured height of `0` is never published (jsdom, and any pre-layout paint, report 0 — the CSS fallback must stand). The observer is disconnected on unmount.

These four hand-tuned offsets are **deleted**: `.realm-spellbar { bottom: 1.25rem }` (globals.css:1738), `.realm-spellbar--raised { bottom: 9.5rem }` (1739), `.realm-spell-hint { bottom: 5.5rem }` (1748), `.realm-spell-hint--raised { bottom: 13.75rem }` (1749), along with the `bottom: 6.5rem` override in the mobile query (1766). The hint and the picker both become:

```css
bottom: calc(var(--realm-bar-bottom) + var(--realm-bar-height) + 0.75rem);
```

The `raised` prop disappears from the bar's API; the stick clearance is a data attribute on the root instead, so anything else that needs to clear the stick can use the same variable.

**Measured bar heights** (padding 6px, mana 14px, caption 16px, gaps 4px, at scale 1):

| Case | Rows | Height |
|---|---|---|
| 4 pages, scale 1 | 1 | 106px |
| 4 pages, scale 1.25 (largerText) | 1 | 130px |
| 4 pages, ≤640px, scale 1 | 1 | 98px |
| 12 pages, 1024px wide, scale 1 | 2 | 168px |
| 12 pages, 400px wide, scale 1.25 | 3 | 255px |

The last row is the honest cost of D5: a level-90 hero with twelve pages, on a phone, at largerText, gets a bar a third of the screen tall. The alternative — hiding pages 9-12 — removes an ability the child owns, which the complexity axis forbids outright. `fewerChoices` and simple depth both cut this to one row.

### 3.10 The ≤640px media query — the first one the HUD has ever had

```css
@media (max-width: 640px) {
  .realm-root { --realm-slot-size: calc(48px * var(--realm-hud-scale)); }
  .realm-bar { padding: 4px 6px; }
  .realm-bar-mana-text { display: none; }          /* pips only; the numeral returns above 640px */
  .realm-bar-caption { font-size: 11px; }
  .realm-hud-row { gap: 0.4rem; }                  /* slice 1's meta zone: text → icons */
  .realm-hud-row .realm-hud-label { display: none; }
}
```

The bar half of this is owned outright by this slice. The HUD half is written against slice 1's zone classes; if slice 1 names them differently the same two rules move to those names — the **rule** fixed here is: at ≤640px the meta zone drops its text to icons and the slot drops to 48px. `.realm-spell-name { display: none }` (globals.css:1766), which left an unlabelled number and dot, is deleted along with `.realm-spell-name` itself: the name now lives in the caption line, which is legible at every width.

### 3.11 The equip write

New action in `src/lib/actions/realm.ts` (a `"use server"` file; all exports are async functions):

```ts
/** Saddle a mount from inside the Realm. Writes only `mount` on the hero's avatar; a hero may equip their own. */
export async function equipMount(childId: string, mountId: string | null): Promise<{ mount: string | null; mountColor: string }>;
```

- `requireChildAccess(childId, { write: true })`.
- Reads `child.avatarConfig` and `loadUnlockedMountIds(childId)` in one `Promise.all`.
- `mountId !== null` and not in the unlocked list → `throw new Error("That mount isn't yours yet.")`.
- Parses and normalises the stored config with the existing `normalizeAvatarConfig` / `isValidAvatarConfig` pair (the same try/catch shape as `getRealmBundle`, realm.ts:76-85); a null or corrupt config becomes `DEFAULT_AVATAR` with `mount` set, so a hero with no saved look can still ride.
- Writes `{ avatarConfig: JSON.stringify({ ...config, mount: mountId }), updatedAt: new Date() }`.
- Revalidates `/tavern`, `/loot`, `/settings` — and deliberately **not** `/realm`, following the precedent and the comment already at seasons.ts:29-31: revalidating the open Realm hands the shell a refreshed bundle mid-visit, which changes `bundle.profile`'s identity, which changes `settings`, which rebuilds `layout`, which re-renders the memoised `World`. The Realm page reads cookies and is never cached, so the next navigation is fresh anyway.

It does not call `updateAvatarConfig` (avatar.ts:26) because that action takes and rewrites the **whole** config from the client — a Realm-side write of one field must not be able to clobber a look the child edited in another tab.

### 3.12 New pure modules, with signatures

**`src/lib/realm/bar/slots.ts`** — what the row contains, and which key selects what.

```ts
import type { GameIconName } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

/** Number keys only ever reach the first nine visible slots (window.onKey parses 1-9). */
export const BAR_KEYCAPS = 9;
/** fewerChoices shows at most this many spell slots. */
export const FEWER_SLOTS = 4;

export type BarSlot =
  | { kind: "spell"; slot: number; index: number; name: string; icon: GameIconName | null;
      color: string; manaCost: number; costPips: number; affordable: boolean;
      selected: boolean; keycap: string | null }
  | { kind: "faded"; slot: number; index: number; name: string }
  | { kind: "empty"; slot: number; index: number };

export type BarSlotsInput = {
  pages: SpellPageView[];          // already through withEmptyPages(), book order
  mana: number | null;             // null in a parent preview: nothing is affordable, nothing is dimmed
  selectedSlot: number | null;
  abilitySlots: "earned" | "all";  // surfacesFor(depth, profile).abilitySlots
  fewerChoices: boolean;
  keycapHints: boolean;            // surfacesFor(depth, profile).keycapHints
};

export function barSlots(input: BarSlotsInput): BarSlot[];

/** The page a number key selects, or null when that key maps to no castable page. */
export function pageForKeycap(slots: BarSlot[], key: number): number | null;
```

Rules, in order: drop `empty` pages when `abilitySlots === "earned"` or `fewerChoices` (faded pages always survive — §3.2); cap the list at `FEWER_SLOTS` when `fewerChoices`; assign `index` by visible position; assign `keycap` as `String(index + 1)` when `keycapHints` and `index < BAR_KEYCAPS`, else `null`; `affordable = mana !== null && mana >= manaCost`. **The existing "pad with empties to four" rule (spell-bar.tsx:33-43) is deleted** along with its test: padding existed to give a pill row a stable shape, and the fixed-size slots plus the permanent mount and Spellbook slots give the bar its shape without fake sockets.

**`src/lib/realm/bar/mount-slot.ts`** — the mount slot's whole state, in one function.

```ts
export type MountSlotState = "riding" | "ready" | "saddling" | "empty" | "none" | "preview";

export type MountSlot = {
  state: MountSlotState;
  mountId: string | null;
  label: string | null;      // "Stag"
  color: string;             // avatarConfig.mountColor, or DEFAULT_AVATAR.mountColor
  speed: number | null;      // 5.5
  speedPips: number;         // 0 when there is no mount
  keycap: "M" | null;
  ariaLabel: string;
  caption: string;
  pressed: boolean;
  disabled: boolean;
  /** Reserved for slice 7's hold-to-travel; always null here. */
  hold: null;
};

export function mountSlotFor(input: {
  equippedMountId: string | null;
  mountColor: string;
  unlocked: string[];
  riding: boolean;
  spriteReady: boolean;   // textures.mount is non-null for this mount id
  isChildView: boolean;
  heroName: string;
  busy: boolean;          // ceremony running, or a panel is open
  keycapHints: boolean;
  numerals: boolean;
}): MountSlot;

export function speedPips(speed: number): number;    // 1..5
export function speedText(speed: number): string;    // "1.6× walking speed"
export function speedSpeech(speed: number): string;  // "Much quicker than walking."
/** The picker's list: unlocked mounts, fastest first, capped at four under fewerChoices. */
export function pickerOptions(unlocked: string[], fewerChoices: boolean): MountItem[];
```

**`src/lib/realm/bar/readout.ts`** — pips and numerals, one unit.

```ts
export const MANA_PER_PIP = 10;   // MANA_MAX / 10 pips
export const MAX_COST_PIPS = 5;   // the dearest spell is 45

export type ManaReadout = { pips: number; filled: number; partial: number; text: string | null; valueNow: number };

/** null in a parent preview — the strip is suppressed rather than invented. */
export function manaReadout(mana: number | null, numerals: boolean): ManaReadout | null;

/** Rounds UP, so a cost never reads cheaper than it is. */
export function costPips(manaCost: number): number;
```

**`src/lib/realm/bar/cast.ts`** — the sweep's lifetime.

```ts
export type CastSweep = { slot: number; castMs: number; startedAt: number } | null;

export function beginSweep(current: CastSweep, e: { slot: number; castMs: number }, now: number): CastSweep;
export function endSweep(current: CastSweep, slot: number): CastSweep;
export function isSweeping(sweep: CastSweep, slot: number): boolean;
/** True when a sweep has outlived its own castMs plus the grace window (§5, E8). */
export function sweepExpired(sweep: CastSweep, now: number, graceMs?: number): boolean;
```

**`src/lib/realm/bar/copy.ts`** — every string in §3, as constants and small functions, so the component, the read-aloud path and the tests all read the same text. Exports (values are given verbatim in §3.3, §3.5, §3.6):

**Every constant, with its value.** Six of these were named in an earlier draft without text; they are written out here, so the file that exists to stop a placeholder shipping does not itself contain one.

```ts
export const SPELLBOOK_LABEL       = "Spellbook";
export const SPELLBOOK_ARIA        = "Open your Spellbook";
export const EMPTY_TITLE           = "An empty slot";
export const EMPTY_HINT            = "Build a spell to fill it.";
export const EMPTY_HINT_LINK       = "Go to the Spellbook";
export const EMPTY_HINT_CLOSE      = "Not now";
export const EMPTY_CAPTION         = "Empty";
export const BOOK_EMPTY_CAPTION    = "Build a spell";
export const MANA_LABEL            = "Mana";
export const PICKER_TITLE          = "Choose a mount";
export const PICKER_CLOSE          = "Close";
export const PICKER_ON_FOOT        = "On foot";
export const PICKER_ON_FOOT_ARIA   = "Go on foot, with no mount";
export const PICKER_CHOSEN         = "Chosen";
export const PICKER_FEWER_NOTE     = "Your fastest four.";
export const MOUNT_SAVE_FAILED     = "That didn't save. Try again.";
export const MOUNT_LOCKED          = "That mount isn't yours yet.";
export const MOUNT_SLOT_EMPTY_ARIA = "Choose a mount";
export const MOUNT_SLOT_EMPTY_CAPTION = "Mount";
export const MOUNT_SLOT_NONE_ARIA  = "No mounts yet. Keep going to earn one.";
export const MOUNT_SLOT_NONE_CAPTION = "Mount";
export const DISMOUNT_NOTICE       = "You're back on your feet.";
export const RIDE_BLOCKS_CAST_PLAIN = "Get down to cast.";   // when the mount has no label

export function manaText(mana: number): string;                                   // "Mana 62"
export function spellCaption(name: string, cost: number, affordable: boolean, numerals: boolean): string;
export function spellAria(name: string, cost: number, affordable: boolean): string;
export function spellSpeech(name: string, cost: number): string;                  // "Ember Bolt. Costs 10 mana."
export function mountRideAria(label: string): string;                             // "Ride your Stag"
export function mountDismountAria(label: string): string;                         // "Get down from your Stag"
export function mountSaddlingAria(label: string): string;                         // "Stag, getting ready"
export function mountCaption(label: string, speed: number, numerals: boolean): string;
export function previewMountAria(heroName: string, label: string | null): string; // "Emma's mount: Stag"
export function ridingNotice(label: string): string;                              // "You're riding the Stag."
export function mountChosenNotice(label: string): string;                         // "You chose the Stag."
export function mountReadyNotice(label: string): string;                          // "Your Stag is ready."
export function rideBlocksCast(label: string | null): string;                     // "Get down from your Stag to cast."
export function pickerSpeech(touch: boolean): string;
  // touch:    "Choose a mount. Tap the one you want."
  // keyboard: "Choose a mount. Use the arrow keys, then press Enter."
```

### 3.13 Components

- **`src/components/realm/ability-bar.tsx`** — `export function AbilityBar(props: AbilityBarProps)`. DOM only; imports no three. Replaces `spell-bar.tsx`, which is **deleted** (its two exported constants move to `bar/copy.ts`).
- **`src/components/realm/mount-picker.tsx`** — `export function MountPicker(props: MountPickerProps)`.
- **`src/components/realm/realm-hud.tsx`** — slice 1 already deleted the `ride` prop, `.realm-hud-ride` and the corner mana meter, so nothing of theirs is left to remove. What **this** slice deletes is slice 1's two interim tenants: **`.realm-mount-button`** (the round bottom-right button) and **`.realm-mana-pips`** / `.realm-mana-pips--refused` (the strip pinned above the spell bar), both of which move into the bar. The inline `fontSize` at `realm-hud.tsx:59` goes with them, replaced by `--realm-hud-scale`.
- **`src/components/realm/realm-shell.tsx`** — holds `equippedMountId`, `mountSaving`, `mountError`, `pickerOpen`, `sweep`; computes `mountSlot` with `mountSlotFor`; renders `<AbilityBar>` unconditionally with `dimmed`; sets `--realm-hud-scale` and `data-stick` on `.realm-root`; deletes `hudRide` (475-477).
- **`src/components/realm/use-realm-input.ts`** — the Space guard's `.realm-spellbar` escape becomes `.realm-slot--spell` (so Space casts when focus is on a spell slot but not when it is on the mount slot or the Spellbook link), and the arrow-key handler bails when the target is inside `[role="dialog"], [role="listbox"]`, matching the guard the cast key already uses.

```ts
export type AbilityBarProps = {
  pages: SpellPageView[];
  selectedSlot: number | null;
  mana: number | null;
  onSelect: (slot: number | null) => void;
  surfaces: Surfaces;            // slice 1's surfacesFor(depth, profile)
  fewerChoices: boolean;
  mount: MountSlot;
  mounts: { unlocked: string[] };
  onRideToggle: () => void;
  onEquipMount: (mountId: string | null) => void;
  mountError: string;
  onMountErrorDismiss: () => void;
  sweep: CastSweep;
  dimmed: boolean;
  touch: boolean;                // settings.showStick
  readAloud: boolean;
  heroName: string;
  isChildView: boolean;
};

export type MountPickerProps = {
  options: MountItem[];
  chosenId: string | null;
  numerals: boolean;
  fewerChoices: boolean;
  touch: boolean;
  readAloud: boolean;
  error: string;
  onChoose: (mountId: string | null) => void;
  onClose: () => void;
};
```

---

## 4. Data model

**No schema change. No migration.** The last migration is `0025_worried_tyrannus`; slices 1 and 2 take `0026` and `0027` if they need them, and this slice takes none. Verification is inverted: after building this slice, `pnpm db:generate` must produce **no** file. If it does, something drifted into `schema.ts` that does not belong to this slice.

The one persisted change is a write to the existing `child.avatar_config` TEXT column (schema: `child.avatarConfig`), setting the `mount` key inside the JSON blob — the same field, the same shape and the same validation the avatar editor at `/loot` already writes through `updateAvatarConfig` (avatar.ts:26-98).

What existing rows do:

| Existing row | Behaviour |
|---|---|
| `avatar_config` is NULL (a hero who never opened the editor) | The bar reads `DEFAULT_AVATAR` (`mount: null`, `mountColor: "#8b5e3c"`) exactly as the shell already does at realm-shell.tsx:236, so the slot renders `empty` with the picker live. Equipping writes a full `DEFAULT_AVATAR` with `mount` set. |
| `avatar_config` is unparseable JSON | Same as NULL. `getRealmBundle` already swallows the parse error (realm.ts:82-84); `equipMount` uses the same try/catch and overwrites with a valid config. |
| `avatar_config.mount` is set and unlocked | The slot renders `ready` on the first visit after this slice ships — which is the fix: today that hero has a `Ride` button in the corner and no way to see what they are riding. |
| `avatar_config.mount` is set but **not** unlocked (a level reset, a hand-edited row, a catalog change) | The slot renders `empty`, not `locked`: a child is never shown a padlock over something they believed they owned. The picker offers only what is unlocked; `equipMount` refuses the locked id with `That mount isn't yours yet.` |
| `avatar_config.mount` names an id no longer in `MOUNTS` | `findMount` returns null → treated as unset → `empty`. |

Nothing changes what a stored value *means*, so no one-time message to the child is needed.

---

## 5. Errors and edge cases

| # | Case | Behaviour |
|---|---|---|
| E1 | The equip write fails (offline, permission, Turso hiccup) | The optimistic `equippedMountId` reverts to its previous value, the picker stays open, and `That mount stayed in the stable. Try again.` renders inside the picker with a `Try again` button that retries the same id. The world never stops. |
| E2 | The equip succeeds but the mount's sprite fails to rasterise | The existing sprite-error path handles it unchanged: `SpriteSource`'s `onError` sets `spriteError`, the HUD shows it with the existing `Try again` (realm-shell.tsx:539-544) which bumps `retryKey` and remounts `SpriteSource`. The mount slot stays in `saddling` and is not tappable, so the hero can never ride an invisible mount. |
| E3 | The equipped mount is not unlocked | §4. Slot renders `empty`. |
| E4 | `bundle.mounts.unlocked` is empty | Unreachable in practice (Pony and Donkey are `unlock: { type: "free" }`, avatar-catalog.ts:311-312, so every hero has two from level 1) — but not impossible if the catalog changes. The slot renders `none`: present, silhouetted, disabled, caption `You'll earn your first mount soon.` There is no crash path and no empty picker. |
| E5 | The ceremony starts while riding | Unchanged: `beginCeremonyIfWaiting` already calls `setRiding(false)` (realm-shell.tsx:252) so the mount sprite cannot overlap the crown. The slot follows `riding` and leaves its pressed state. |
| E6 | A spell is tapped or keyed while riding | Unchanged rule, better feedback: `onSelectSpell` still refuses (realm-shell.tsx:275-277) with the notice now reading `Get down from your Stag to cast.`, and the spell slots render `aria-disabled` with that caption while `riding` — the child sees *why* before they tap. |
| E7 | **A number key is pressed while the deed panel is open** | The regression that dimming-instead-of-unmounting introduces: today the bar unmounts and its `window` keydown listener goes with it (spell-bar.tsx:57-75). Dimmed, the listener would still be alive and `2` typed inside a side quest would select a spell. The listener effect returns early when `dimmed`, and `dimmed` also closes the hint and the picker. A test covers exactly this. |
| E8 | A cast sweep whose release never arrives | `stepCaster` releases from inside the frame loop, which stops entirely when `interactive` goes false (realm-scene.tsx:147). A panel opened mid-cast therefore holds the sweep until the panel closes — correct, since the cast really is suspended. To bound the pathological case (an unmounting scene, a thrown frame), a `setTimeout` of `castMs + 400ms` calls `endSweep`, and `sweepExpired` is the pure predicate behind it. |
| E9 | The bar measures 0px | jsdom's `getBoundingClientRect` returns 0, and so does any paint before layout. A measured height of `0` is never published; the `4.5rem` fallback stands, so the hint and the picker are still clear of the bar in tests and on the first frame. |
| E10 | 12 pages on a 400px phone | Three rows, 255px. Documented, accepted, and stated in §3.9 rather than solved by hiding pages. |
| E11 | Double-tap on the mount slot | Two `setRiding` toggles; harmless and self-cancelling. Double-tap **inside the picker** is guarded: a `saving` flag refuses a second `equipMount` until the first settles. |
| E12 | The picker is open when the clock hits zero | `RealmShell` switches to the `closed` phase and the whole tree unmounts; an in-flight `equipMount` still lands server-side, and the mount is equipped on the next visit. Nothing is lost and nothing is half-written. |
| E13 | The hero has zero pages (the `ensureStarterSpell` catch path fired, realm.ts:55-60) | The slot row is empty at simple depth. The bar is still a bar: mana strip, the caption `Your spellbook is empty. Open it to make your first spell.`, divider, mount slot, Spellbook button. |
| E14 | The mid-visit textures swap (finding F2) | `World` re-renders, it does not remount, so `hero`, `simRef`, `recessRef` and `camTarget` — all `useRef` — survive; the mount `<sprite>` mounts with `visible={false}` and is positioned by the next frame, so nothing pops. One watch item for the browser pass: the hero `<sprite>` carries `position={[layout.spawn…]}` as an initial prop (realm-scene.tsx:380), and if R3F re-applies it on that re-render the hero hops to spawn for at most one frame before `useFrame` overwrites it. Equip a mount while walking and look for the hop. |
| E15 | An outside tap dismissing the picker | Consumed by a capture-phase pointerdown listener on `.realm-root`, so it cannot also queue a walk target on the ground mesh (realm-scene.tsx:253-264). |
| E16 | Arrow keys inside the picker | `useRealmInput`'s `down()` handler currently bails only for `HTMLInputElement`/`HTMLTextAreaElement` (use-realm-input.ts:54); it gains the `[role="dialog"], [role="listbox"]` guard, so navigating the picker does not walk the hero. |

---

## 6. Accessibility

### The complexity axis

Every surface below reads `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` (slice 1) and invents no rule of its own.

| Surface | Simple depth | Full depth |
|---|---|---|
| spell slots | `abilitySlots: "earned"` — only pages holding a spell (plus any faded page) | `abilitySlots: "all"` — every owned page, empty sockets included |
| keycaps | not drawn; **the keys still work** | `1`–`9` and `M` drawn |
| mana | ten pips | ten pips + `Mana 62` |
| slot cost | cost pips | numeral |
| mount slot | present, identical | present, identical |
| Spellbook button | present, identical | present, identical |
| picker speed | pips | `1.6× walking speed` |

The three invariants:

1. **`fewerChoices` caps `abilitySlots` at `"earned"` at BOTH depths**, and additionally caps the count at four. It never affects the mount slot or the Spellbook button.
2. **Depth is never a word a child reads.** Nothing in this slice's copy contains "simple", "full", "depth", "level of detail" or a toggle for it.
3. **Every simple-depth difference is a substitution, not a removal.** Pips replace numerals (the `aria-valuenow` still carries the number, so read-aloud and screen readers get it at both depths); the caption line replaces per-slot tooltips; hidden keycaps do not disable keys. The one thing simple depth genuinely does not show is the *empty socket* — and an empty socket is not an ability, it is an advertisement for the Spellbook, which now has a permanent button of its own. Nothing a child can do disappears.

### Per learning-profile setting

| Setting | What this slice does |
|---|---|
| `reducedMotion` | No cast sweep, no press-bounce, no pip transition. The **substitute** (§3.7): a static gold ring plus an hourglass badge on the casting slot for the duration. This is the rule the existing combat particle broke — a motion cue with no non-motion substitute erases the feedback for exactly the children the setting exists for. |
| `lowStimulus` | **Mutes, never empties.** Every slot, icon, cost and pip stays on screen. What changes: element-coloured frames desaturate toward a two-step palette, the selected glow becomes a flat 2px border instead of a bloom, the mana pips render flat slate-blue, and the sweep is off (it implies `!settings.motion`). No slot is removed — the counterexample in the codebase is `decor: !settings.calmPalette` (realm-shell.tsx:215), which hands the children who most need visual anchoring an empty field. |
| `largerText` | `settings.hudScale` is 1.25 (render-settings.ts:66) → `--realm-hud-scale: 1.25` → 70px slots, 1.25× caption, 1.25× mana. This is the whole point of D15. `.realm-root[data-larger-text="on"]` still zooms only `.realm-panel` and not the root (globals.css:244-246), because zooming the root breaks drei `Html` label positioning — the bar now scales through the custom property instead of fighting that. |
| `fewerChoices` | Four spell slots, earned only; four mounts in the picker plus `On foot`, with the note `Your four quickest.` Every mount stays reachable in the avatar editor at `/loot`. |
| `readAloud` | `speak()` (utils/speech.ts, already used by the help card and the ceremony) on four events, written for the ear: selecting a spell → `Ember Bolt. Costs 10 mana.`; opening the picker → `Choose a mount. Tap the one you want.` (touch) or `Choose a mount. Use the arrow keys, then press Enter.`; focusing a picker option → `Stag. Much quicker than walking.`; opening the empty-page hint → `Your spellbook has room. Make a spell to fill this page.` Riding and dismounting are already spoken by slice 1's message lane. |
| `inputMode: "touch"` | `settings.showStick` sets `data-stick="on"` on `.realm-root`, which raises `--realm-bar-bottom` by `8.25rem` — one variable in place of two `--raised` classes. Every control is ≥44px. No affordance is hover-only: the caption line is the hover substitute, and it is driven by *selection* on touch. |
| `inputMode: "keyboard"` | `1`–`9` select (through `pageForKeycap`, so the mapping follows the *visible* order under `fewerChoices` — the existing behaviour and its test survive), `Escape` deselects, `M` rides, `Tab` reaches every slot in DOM order, the picker is a listbox with arrows/Enter/Escape and returns focus to the mount slot. `role="group"` rather than `role="toolbar"` (D16), because a toolbar promises arrow-key roving focus and arrows drive the hero. |
| `soundEnabled` | Nothing. This slice ships no sound and promises none. Slice 9 adds the feedback channel and will read this flag; the bar's slots are where its select/cast cues will attach. |

### Parent preview (`isChildView: false`)

The bar renders, read-only. `mana` is null → the strip is suppressed, not faked. Every spell slot is `aria-disabled` and the key listener is never installed. The mount slot renders `preview`: the child's equipped mount as a static thumbnail, `Emma's mount: Stag`, disabled — or `Emma has no mount yet`. The Spellbook link stays live (a parent may want to look at the builder). Nothing in the bar reads `clock`, `cleared`, `riding` or `sweep` in preview, so no nulled hero state can crash it, and the attribution rule holds: the preview strings name `bundle.heroName`, never the adult.

### Pointer events

`.realm-bar` keeps `pointer-events: auto` — it is a control surface with a visible background and taps must not fall through it to the ground. Everything that floats *outside* the bar is `pointer-events: none`: the caption line (it is inside, but inert), and slice 1's message lane above it. While `dimmed`, the bar is `inert` and `pointer-events: none`, so a tap in that band reaches the world instead of a disabled button.

---

## 7. Testing

### Unit-testable (pure, colocated, no three at module load)

| Module | Test |
|---|---|
| `bar/slots.ts` | `earned` drops empties and keeps faded; `all` keeps both; `fewerChoices` caps at four and forces earned at both depths; `keycapHints: false` yields `keycap: null` while `pageForKeycap` still resolves key 3 to page 5 (the existing fewer-choices key-mapping test, ported); `mana: null` makes nothing affordable and nothing dimmed. |
| `bar/mount-slot.ts` | all six states from their inputs; `busy` disables without changing state; a locked equipped id yields `empty`, not `none`; `preview` strings name the hero; `speedPips` matches the eight-row table exactly; `pickerOptions` orders fastest-first and caps at four. |
| `bar/readout.ts` | `costPips` rounds up (10→1, 15→2, 45→5) and clamps; `manaReadout(null)` is null; `partial` drains within a pip; `text` is null when `numerals` is false. |
| `bar/cast.ts` | `beginSweep` replaces an in-flight sweep for a different slot; `endSweep` ignores a mismatched slot; `sweepExpired` at `castMs + grace`. |
| `bar/copy.ts` | every exported function's output is asserted verbatim (this is the file that stops a placeholder shipping). |
| `sprite-texture.test.ts` | `spriteKey` is **unchanged** by `mount` and `mountColor` and still changes with `outfit` (finding F1). |
| `use-spell-sim.test.ts` | `castState` carries the casting slot and that spell's `castMs` on begin and on release. |
| `use-realm-input.test.ts` | Space inside `.realm-slot--spell` still casts; Space inside `.realm-slot--mount` does not; arrows inside `[role="listbox"]` do not move the axis. |

### Component tests (jsdom + RTL — the bar imports no three)

`ability-bar.test.tsx`:
- Every spell slot shows its cost **before** anything is selected.
- An unaffordable slot shows a red cost and is not `opacity`-hidden; its `aria-label` ends `, not enough mana yet`.
- An empty socket has no keycap and no icon, and opens the hint.
- **With four filled pages and zero empty sockets, the Spellbook link is still in the document** — the exact regression the audit predicted.
- The mount slot is rendered when `avatarConfig.mount` is null, and tapping it opens the picker.
- `dimmed` sets `inert` and a number keypress does not call `onSelect` (E7).
- Simple depth draws no keycap while key `1` still selects.
- Publishing skips a 0 height (E9).

`mount-picker.test.tsx`: unlocked-only listing; `fewerChoices` shows four plus `On foot`; choosing calls `onEquipMount`; `Escape` closes and focus returns to the opener; the error string and its `Try again`.

`realm-hud.test.tsx`: the `ride` prop and the mana meter are gone; nothing else in the row regressed.

`realm-shell.test.tsx`: the bar renders in preview read-only; the bar dims rather than unmounting when the deed panel opens; `equipMount` failure restores the previous mount.

### Browser pass (the real acceptance gate — port 3100, `?preview`, per `reference_local_screenshot_setup`)

1. Same-framing before/after of the bar, at 1440px and at 400px, at hudScale 1 and 1.25 — the two views the user photographed.
2. A 300ms cast (Bolt) and a 900ms cast (Sprite): the sweep starts and ends with the freeze, and does not outlive it.
3. `reducedMotion` on: the ring-and-hourglass substitute appears and nothing moves.
4. Equip a mount from the picker **while walking**: watch for the one-frame spawn hop (E14), time the gap between the picker closing and the slot leaving `saddling`.
5. Ride and dismount by tap and by `M`; ride into the ceremony and confirm the slot un-presses.
6. 12 pages at 400px: measure the bar, confirm the hint and the message lane clear it.
7. A tap 4px above the bar reaches the ground and walks the hero (the pointer-events check).
8. Fill all four pages, then find the Spellbook — by hand, without being told where it is.

---

## 8. Interfaces

### Produces

**Pure modules** (`src/lib/realm/bar/`)

| Export | Signature |
|---|---|
| `slots.ts` `BAR_KEYCAPS` | `9` |
| `slots.ts` `FEWER_SLOTS` | `4` |
| `slots.ts` `BarSlot` | union of `{kind:"spell"…}` \| `{kind:"faded"…}` \| `{kind:"empty"…}` (§3.12) |
| `slots.ts` `barSlots` | `(input: BarSlotsInput) => BarSlot[]` |
| `slots.ts` `pageForKeycap` | `(slots: BarSlot[], key: number) => number \| null` |
| `mount-slot.ts` `MountSlotState` | `"riding" \| "ready" \| "saddling" \| "empty" \| "none" \| "preview"` |
| `mount-slot.ts` `MountSlot` | object type (§3.12), including `hold: null` reserved for slice 7 |
| `mount-slot.ts` `mountSlotFor` | `(input: {...}) => MountSlot` |
| `mount-slot.ts` `speedPips` | `(speed: number) => number` |
| `mount-slot.ts` `speedText` | `(speed: number) => string` |
| `mount-slot.ts` `speedSpeech` | `(speed: number) => string` |
| `mount-slot.ts` `pickerOptions` | `(unlocked: string[], fewerChoices: boolean) => MountItem[]` |
| `readout.ts` `MANA_PER_PIP` | `10` |
| `readout.ts` `MAX_COST_PIPS` | `5` |
| `readout.ts` `ManaReadout` | `{ pips; filled; partial; text: string \| null; valueNow }` |
| `readout.ts` `manaReadout` | `(mana: number \| null, numerals: boolean) => ManaReadout \| null` |
| `readout.ts` `costPips` | `(manaCost: number) => number` |
| `cast.ts` `CastSweep` | `{ slot: number; castMs: number; startedAt: number } \| null` |
| `cast.ts` `beginSweep` / `endSweep` / `isSweeping` / `sweepExpired` | §3.12 |
| `copy.ts` | every string and copy function in §3.12 |

**Components**

| Export | Where |
|---|---|
| `AbilityBar`, `AbilityBarProps` | `src/components/realm/ability-bar.tsx` |
| `MountPicker`, `MountPickerProps` | `src/components/realm/mount-picker.tsx` |

**Server action**

| Export | Signature |
|---|---|
| `equipMount` | `(childId: string, mountId: string \| null) => Promise<{ mount: string \| null; mountColor: string }>` in `src/lib/actions/realm.ts` |

**Widened event**

| Export | Change |
|---|---|
| `SpellEvent` (`use-spell-sim.ts`) | `{ kind: "castState"; casting: boolean; slot: number; castMs: number }` — `slot` and `castMs` are new |

**CSS custom properties** (all on `.realm-root`)

`--realm-hud-scale` · `--realm-slot-size` · `--realm-stick-clearance` · `--realm-bar-bottom` · `--realm-bar-height` (measured; fallback `4.5rem`) · `--cast-ms` (per-slot, on the sweeping slot only)

**CSS class names**

`.realm-bar` · `.realm-bar-mana` · `.realm-bar-pip` · `.realm-bar-pip--filled` · `.realm-bar-mana-text` · `.realm-bar-caption` · `.realm-bar-row` · `.realm-bar-divider` · `.realm-bar-tail` · `.realm-slot` · `.realm-slot--spell` · `.realm-slot--empty` · `.realm-slot--faded` · `.realm-slot--mount` · `.realm-slot--book` · `.realm-slot--selected` · `.realm-slot--unaffordable` · `.realm-slot--riding` · `.realm-slot--locked` · `.realm-slot-key` · `.realm-slot-icon` · `.realm-slot-cost` · `.realm-slot-cost-pip` · `.realm-slot-fill` · `.realm-mount-picker` · `.realm-mount-picker-title` · `.realm-mount-option` · `.realm-mount-option--chosen` · `.realm-mount-speed` · `.realm-mount-picker-note` · `.realm-mount-picker-close` · `.realm-mount-error`

**Data attributes**

`.realm-root[data-stick="on"]` · `.realm-bar[data-dimmed="true"]` · `.realm-slot[data-casting="on"]`

**Routes**

`/spellbook` — reached from `.realm-slot--book`, a real `<a href>`.

### Consumed by later slices — the contracts they may rely on

- **Slice 7 (`fast-travel-and-the-companion`)** takes `MountSlot.hold` from `null` to a real value and drives `.realm-slot-fill` on `.realm-slot--mount` with a hold-to-travel progress; adds a companion slot beside the mount slot inside `.realm-bar-tail`; and gets `speedPips`/`speedText` for free.

**One thing this slice pulls forward from slice 4, because it cannot wait.** Making riding reachable from level 1 — which is the whole point of the mount picker — means a child moves at up to **7.0 units/s** in the *current* world, one slice before slice 4 rebuilds it, against an `unstickHero` that resolves exactly one collider and only ever pushes south (`movement.ts:85-89`). At double hero speed that is a reachable wedge, and it would be this slice's bug.

So **the multi-pass `unstickHero` rewrite lands here**, not in slice 4:

```ts
export const UNSTICK_PASSES = 8;
export function unstickHero(state: HeroState, colliders: Prop[]): HeroState;
```

Collect **every** collider whose footprint grown by `HERO_RADIUS` contains the position; push along the deepest overlap's smallest-penetration axis; re-collect; up to eight passes; return unchanged when nothing overlaps (the common case, and it stays allocation-free). It is a pure module with a colocated test and it needs no village, so there is nothing to wait for. Slice 4 adds only the third parameter — `rescue?: Vec2[]`, the road-node teleport of last resort — on top of a function that already resolves multiple overlaps.

`movement.test.ts` gains, in this slice: two overlapping colliders resolved in one call; a collider whose south side is blocked and whose north is open pushes **north**; the result is never inside a collider; a hero stepped at 7.0 units/s into every building corner in today's layout ends up outside it.
- **Slice 8 (`troubles-that-read-and-pay`)** attaches trouble-count and reward readouts to `.realm-bar-caption` and may add a slot state for a spell on cooldown; it inherits `costPips` and `MANA_PER_PIP` for any new cost it prints.
- **Slice 9 (`sound-and-first-five-minutes`)** attaches its select/cast cues to `.realm-slot` and reads `soundEnabled`; its tutorial steps address slots by `BarSlot.index`, and the depth flip it ceremonially performs is what turns `abilitySlots: "earned"` into `"all"` on this bar.
- **Slice 12 (`recess-that-counts`)** must clear `--realm-bar-bottom + --realm-bar-height` for any recess readout it docks at the bottom of the screen, exactly as the hint and the picker do.
- **Every slice** that docks anything above the bottom edge uses `calc(var(--realm-bar-bottom) + var(--realm-bar-height) + …)` and never a hand-tuned `rem`.

### Consumes

**From slice 1 (`first-impression`)**

| Needed | Used for |
|---|---|
| `src/lib/realm/depth.ts` → `RealmDepth = "simple" \| "full"` | the axis |
| `surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces` | the single source for every reduction in this bar |
| `Surfaces.abilitySlots: "earned" \| "all"` | which spell slots the row contains |
| `Surfaces.numerals: boolean` | mana numeral and cost numerals vs pips |
| `Surfaces.keycapHints: boolean` | whether keycaps are drawn |
| `bundle.depth: RealmDepth` | the value passed to `surfacesFor` |
| the centred message lane and its `notice` priority | this slice's six mount notices; it adds no lane of its own |
| `clock.flushPending()` on unmount | so the Spellbook link is an honest exit and needs no flush of its own |
| slice 1's interim mana pip strip | **deleted** by this slice and folded into `.realm-bar-mana` |
| slice 1's HUD zone class names | the ≤640px HUD rules in §3.10 |

`keycapHints` is one of the thirteen fields slice 1's `Surfaces` table publishes (first-impression §3.1). **There is no fallback clause here and none is needed**: slice 1's table is closed before slice 1 is built, and a slice that wants a fourteenth field amends slice 1's spec rather than editing `depth.ts` on its own.

**From slice 2 (`sprite-budget-and-gallery`)**

| Needed | Used for |
|---|---|
| the parallelised `SpriteSource` await chain | a mid-visit re-run must be ~34 cache hits plus one real rasterisation, not 34 sequential awaits |
| the kind-keyed cache surviving a short round trip | the Spellbook button is a real navigation; returning must not re-rasterise the world |
| whatever `spriteKey` becomes | the F1 invariant stands however it is rewritten: **`spriteKey` must not vary on fields the hero figure does not draw** |

**From the existing codebase (unchanged)**

`SpellPageView`, `resolvePages`, `withEmptyPages`, `FADED_PAGE`, `EMPTY_PAGE` (`lib/realm/spells/pages.ts`) · `MANA_MAX` (`lib/realm/spells/mana.ts`) · `MOUNTS`, `MountItem`, `findMount`, `DEFAULT_AVATAR`, `normalizeAvatarConfig`, `isValidAvatarConfig` (`lib/utils/avatar-catalog.ts`) · `HERO_SPEED` (`lib/realm/movement.ts`) · `loadUnlockedMountIds` (`lib/services/mounts.ts`) · `requireChildAccess` (`lib/auth/access.ts`) · `MountFigure` (`components/avatar.tsx`) · `GameIcon` names `book`, `scroll`, `hourglass` (`components/game-icon.tsx`) · `speak` (`lib/utils/speech.ts`) · `renderSettingsFor().hudScale`, `.showStick` (`lib/realm/render-settings.ts`).

---

## 9. Out of scope

| Left out | Which slice takes it |
|---|---|
| **Fast travel** — riding as a way to cross distance, the hold-to-travel affordance, a destination list | **Slice 7** `fast-travel-and-the-companion`. The distance it solves does not exist until slice 4's village. This slice ships the slot and riding-as-speed only; `MountSlot.hold` and `.realm-slot-fill` are the seams it will use. |
| **The companion slot** — the companion currently renders, follows and does nothing | **Slice 7**. It belongs beside the mount slot in `.realm-bar-tail`; giving it a socket before it has a job would be a second empty promise on the same bar. |
| **What unlocks the *next* mount or spell page** ("Next: the Goat, at level 3") | **Slice 6** `doors-and-the-tavern`, which already carries "stop discarding `level` from `loadSpellbookPages` so an empty slot can say what unlocks it". `level` is not in `RealmBundle` today; adding it is that slice's job, and both surfaces get it at once. |
| **The HUD rebuild** — three anchored zones, the hero plate, the objective card, the centred message lane, the `.realm-hud > *` pointer-events fix | **Slice 1** `first-impression`. This slice deletes exactly three things from the HUD (the mana meter, the Ride button, the inline font-size) and adds nothing to it. |
| **Rehoming "Leave the Realm"** | **Slice 6**. The Tavern's door becomes the exit; the underlined gold link on grass is that slice's to delete. **A pause or main menu is refused for the whole programme** — slice 6 §9 gives the ruling and the two reasons (the doors are the exit; the deed panel is the only interruption the clock forgives). |
| **Sound** — a click on select, a cue on cast, a hoof on mount | **Slice 9** `sound-and-first-five-minutes`. Nothing here promises a sound. |
| **Cooldowns** | Nowhere. The sim has no cooldown; this slice does not invent one to have something to draw. |
| **Combat that pays Realm minutes** | **Slice 8** `troubles-that-read-and-pay`. Nothing in this bar prints, implies or promises a reward. |
| **The recess chips** (Gleams, Laps, Best) | **Slice 12** `recess-that-counts`. They stay where they are until then. |
| **Reordering which spellbook page sits in which slot** | Not in the programme. Named here as a known gap: it is the only clean answer to a twelve-page bar on a phone, and if the three-row height in §3.9 turns out to bother a real child, this is the fix to schedule. |
| **A minimap, a compass, a quest tracker in the bar** | Slice 1 (tracker) and nowhere (minimap). The bar is a control surface, not a readout. |
