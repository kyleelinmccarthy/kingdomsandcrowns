# Doors, the Tavern, and the siblings' board

**Date:** 2026-09-10
**Status:** Design complete. Implementation plan written at build time, per programme decision 1.
**Programme:** *The Realm: Presentation Overhaul* — `docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`. Slice **6 of 13**, effort **medium**.
**Depends on:** slice 3 `ability-bar-and-mount-slot` (the `--realm-hud-scale` knob, the permanent Spellbook button that keeps the Library door from ever being load-bearing), slice 4 `village-ground` (the district plan, the road graph, `open-ground.ts`, the strengthened `unstickHero`, the 64-unit frame), slice 5 `village-life` (the landmark prop pipeline and the palette this slice's Tavern is painted in).
**Feeds:** slice 7 `fast-travel-and-the-companion` (the door list is fast travel's destination list), slice 9 `sound-and-first-five-minutes` (the tutorial's "walk to the door" beat and the reserved sound cues), slice 12 `recess-that-counts` (the lap course must clear the gate apron), slice 13 `record-of-the-work` (attribution flows into `recentRaisings` and the Kingdom panel rows through the interface stated in §8).
**Decisions applied:** **D8** — siblings get a Tavern board only: read-only, no visitable realms, no new table. **D2** — the full village, so the Tavern is sited by the district plan rather than at a hardcoded `(0,18)`.

---

## 1. Why — the complaints and the findings this answers

The user's verdict, verbatim, contains three complaints this slice owns:

> **theres no way to get to spellbook from here and no quest log or tracking.** … **no main tavern** … **should be WAY more development in the world.**

The audit found the world has, in total, two links.

> The entire open world contains exactly TWO links. `realm-hud.tsx:96` renders `<Link href="/tavern">Leave the Realm</Link>` and `spell-bar.tsx:145` renders `<Link href="/spellbook">Open the Spellbook</Link>`. That is the complete navigation inventory — I grepped every realm component for `next/link`/`useRouter`/`href=` and the only other two hits are on the gate and closed screens, which are not the game. The user is not exaggerating: there is one visible door out, and it is styled as 0.85em underlined text pinned to the far right of a wrapping flex row (`globals.css:1710` `.realm-hud-leave { margin-left: auto; font-size: 0.85em }`).

Both directions of the Tavern relationship are broken.

> There is no Tavern in the world and no Realm in the Tavern — both directions are broken. `BUILDING_SLOTS` (`layout.ts:47-56`) holds exactly eight sites: well, mill, bridge, chapel, market, library, watchtower, garden. No tavern, no inn, no hub. Going the other way, `grep -rni realm src/app/(app)/tavern/` returns ZERO hits — the page nav-items.ts:20 calls "Your home base" never mentions the Realm. … So "Leave the Realm" sends the hero to a page that has never heard of the Realm.

Re-run at design time, on the current branch: `grep -rn "realm" "src/app/(app)/tavern/"` still returns zero hits.

The castle — the object the whole progression is named after — is a wall.

> The castle is a wall. `layout.ts:128` pushes it with `solid: true`, so it is a collider; `realm-scene.tsx:243` includes `castle` in `standing` so it draws with a `PropLabel` reading "Castle" — and that is all it does. Interaction is villager-only: `realm-scene.tsx:206` calls `nearestVillager(p, layout.villagers)` and `layout.villagers` is populated exclusively from the eight building sites (`layout.ts:163-170`). The single largest, most central object in the world — the thing the whole progression is named after — cannot be entered, talked to, or clicked. The hero walks up to it and stops.

The mechanism that would fix it does not exist at all.

> - Any door/entrance mechanic at all. Reach is `nearestVillager` over `layout.villagers` only (realm-scene.tsx:206, villagers.ts:49-57); `WorldLayout` (layout.ts:28) has no concept of an interactable that isn't a villager.
> - Any in-world structure representing an app destination. `BUILDING_SLOTS` (layout.ts:47-56) has no tavern, no spellbook tower, no loot vault, no hall of ranks — only the eight side-quest sites.

The Spellbook route is gated behind failure.

> The Spellbook link is gated behind failure. It only renders inside the `hint` panel (`spell-bar.tsx:128-149`), and `hint` is only set by clicking a chip whose `className` is `realm-spell realm-spell--empty` … A hero who has filled every page has no path to /spellbook from inside the Realm at all.

A complete quest board is already in memory and none of it is shown.

> The world is already holding a complete quest board in memory and shows none of it. `actions/realm.ts:65` loads `loadKingdomState`, which returns `overview.buildings` whole — `BuildingOverview[]` (`services/deeds.ts:11-15`) carrying, per building: `label`, `description`, `icon`, `done`, `total`, `complete`, AND every deed's `id`, `title`, `story`, `area`. … A full in-world Kingdom Board costs zero new queries.

The one genuinely missing read is a single line in an existing batch.

> The one thing genuinely missing from the bundle is today's assignments — the actual Quest Log. `getRealmBundle`'s `Promise.all` (`actions/realm.ts:60-72`) loads child row, castle, profile, settings, kingdom, spellbook, mounts, seasons — but never `getAssignmentsForDate` … Separately, `loadSpellbookPages` already returns `level` (`services/spells.ts:27-35`) and `actions/realm.ts:101` throws it away.

And the audit's settled ruling on what may navigate at all:

> This settles the design question: the Realm MUST be a walled garden. Every destination whose data is already in the bundle becomes an in-world overlay (zero navigation, zero reboot) rendered the way `DeedPanel` already is at `realm-shell.tsx:559-570`. Only genuine editors (Spellbook builder, full Quest Log) navigate, and only from a deliberate door.

Finally, the exploit that easy exits create:

> Leaving refunds the current partial minute. `usePlayClock` never flushes on unmount (use-play-clock.ts:126-130 is only wired to the HUD's Try-again at realm-shell.tsx:543), so `secondsThisMinute` is thrown away — bouncing out and back every 50 seconds is unlimited free play. Any fix that adds convenient in-world exits will make this exploitable, so fix the flush in the same pass.

Slice 1 fixed the *whole-minute* half of that leak (`flushPending()` on unmount). The *partial* minute survives, and this is the slice that makes leaving a one-second decision instead of a hunt for an 0.85em link — so this is the slice that closes it (§3.9).

Decision 8 adds the one thing the brief called "probably a stronger reason to open this a second time than anything else":

> There are multiple heroes in this house — the hero-switcher floats over the game board today — and none of them can see each other's kingdoms. 'Nasrin raised the Mill yesterday' on the Tavern board, or a visitable sibling realm, is cheaper than a river and is probably a stronger reason to open this a second time than anything else in this brief.

---

## 2. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D6.1 | How does the world represent an interactable that is not a villager? | A `Door` on `WorldLayout.doors`, found by a generalised `nearestInteractable`. The reach transition, the bubble and the Enter handler work unchanged. | The scene already reports one reach id per frame and the shell already keys off it; making that id namespaced (`"villager:bram"` / `"door:tavern"`) is a ~30-line change that leaves the `World` memo, the prop shape and every existing test intact. |
| D6.2 | Where is the Tavern? | The ninth plot in slice 4's `BUILDING_SLOTS` / `BUILDING_FOOTPRINTS`: **Gate Quarter, east of the Kingsway**, centre `{ x: 10.5, z: 24.5 }`, `{ w: 7, d: 6, h: 7 }`, door face west, reached by the `gate-apron` → `tavern-door` spur. | Siting it at `(0,18)` in a 40-unit world and then rebuilding the town around it means placing it twice. Slice 4 owns the plan **and the plot**, so `layout.test.ts` asserts non-overlap over one table rather than this spec proving it in prose — which is how an earlier draft came to site it on top of the Village Well. |
| D6.3 | Does the hero spawn on the threshold? | Yes — on the gate apron, at slice 4's `SPAWN = { x: 0, z: 26.5 }`, facing `"n"`, with the inn filling the right of the frame, the Village Well the left, and the Kingsway running away north. **Not** inside the door's radius, and **this spec does not restate `SPAWN`** — slice 4 owns it. | "Spawns on its threshold" must not mean "the first thing a six-year-old sees is a Leave prompt." `SPAWN` sits 5.39 units from the door point against a 2.0 radius — a deliberate 0.97-second walk, and 1.5 s to the door itself. |
| D6.4 | Is the Tavern door the only exit? | No. Two exits, one of which can never disappear: the Tavern door, and `Leave the Realm` in the footer of the Kingdom panel behind the Keep door. Plus a failsafe button if `layout.doors` is ever empty. | `.realm-hud-leave` is being deleted. A world with exactly one exit that depends on one prop rasterising is a world a child can be trapped in. The Keep needs no texture — the scene already falls back to a box mesh. |
| D6.5 | Does the exit confirm? | The Tavern door opens a panel that *is* the confirm — it shows today's quests and the minutes line, then `Go in` / `Stay in the Realm`. The Library door navigates without a confirm. | The Tavern door ends the visit, so it earns a step. The Library door is the audit's own fix for "gated behind failure" and a confirm would put friction on the thing we are unblocking. |
| D6.6 | Do the panels pause the play clock? | **No.** `paused` stays `panelOpen \|\| ceremonyRunning \|\| helpOpen`. The door panels are excluded deliberately. | The cross-cutting rule allows exactly one pause point in the whole programme (slice 9's opening banner). The deed panel's pause exists because side quests are schoolwork and must never cost Realm minutes; reading your own kingdom board is play. An unpaused panel also cannot become a way to hold the clock open. |
| D6.7 | What does the Keep door open? | An in-world **Kingdom panel**: banners per completed season, the worn crown, eight building rows in objective rank order, each with a side quest line. Zero new queries. | `loadKingdomState` already returns whole `BuildingOverview` objects and the shell already holds and optimistically updates them (`realm-shell.tsx:162, 413-424`). |
| D6.8 | What navigates and what overlays? | Overlay: the Kingdom panel, the Tavern panel. Navigate: `/spellbook` (Library door), `/quests` (full Quest Log link inside the Tavern panel), `/tavern` (the exit). Nothing else. | `/realm` is uncached, `ensureStarterSpell` runs on every load, and returning re-rasterises the sprite set. Every destination whose data is already in the bundle stays in-world. |
| D6.9 | Does the partial minute survive an easy exit? | **Yes, and slice 1 already handles it.** The three easy exits call `clock.flushPending()`, fire-and-forget; slice 1's `minutesToSettle` charges the in-progress minute at ≥ 30 seconds on *every* unmount, deliberate or not. This slice adds **no** second rounding function. | Bouncing every 55 seconds must not be free play, and slice 1 closed that. A second rule that forgives interruptions cannot be implemented (an unmount cannot tell them apart), would be false on arrival, and would race the cleanup that already charges. |
| D6.10 | Whose names appear on the Tavern board, and what does a hero see versus a parent? | A hero sees every non-banished hero in their own family, themselves included (rendered as "You"). An adult sees the heroes inside their access scope. `showOnLeaderboard` is **not** consulted. | `resolveActiveChild` returns `allChildren: [self]` for a child actor (`resolve-child.ts:20-28`), so the board needs its own family-scoped read behind `requireFamilyReadAccess`, which exists for exactly this ("family-scoped data a hero legitimately views", `access.ts:238-254`). `showOnLeaderboard` governs the *public* leaderboard; using it to hide a sibling from their own family would be wrong. |
| D6.11 | Live name or snapshot name on the board? | `raisedByName ?? liveName`. The board passes the snapshot when slice 13 supplies one. | A raising is a dated event, so it behaves like a stone: "Emma raised the Mill in March" stays true after Emma is renamed. The Realm card and the parent panel show a *current* hero and follow the live name. |
| D6.12 | New `PropKind`? | Yes — `"landmark"`, appended to the accumulated union. The Tavern is `{ kind: "landmark", id: "tavern" }` under the texture key `landmark:tavern`, and it is a **`FIGURE_CATALOG` row in the `landmark` family** — slice 2 opened that family from the start for exactly this. | The Tavern is not a kingdom building: `KINGDOM_BUILDING_IDS` excludes it, so it stays out of the rise tween and out of the Kingdom panel's eight rows. The `landmark` family and the `landmark:tavern` key are **fixed for the life of the programme** — slice 11 redraws the figure and republishes neither. |
| D6.13 | Schema? | **None.** No migration, no new table, no new column. | Decision 8 is explicit: read-only, no visitable realms, no new schema. Everything the board needs is in `kingdom_progress` (`child_id`, `building_id`, `deeds_done`, `completed_at`, `updated_at`) and `child` (`display_name`, `family_id`, `banished_at`). |

---

## 3. Design

### 3.1 The village geometry this slice consumes and reserves

All coordinates are in slice 4's 64-unit frame (`x, z ∈ [-32, 32]`, south is `+z`).

**Every number in this table is slice 4's.** This slice reserves nothing and re-sites nothing: the Tavern is the largest new solid in the programme, so its plot lives in the one table `layout.test.ts` asserts non-overlap over (`village.ts`'s `BUILDING_SLOTS` / `BUILDING_FOOTPRINTS`, slice 4 §3.3), not in prose here.

| Feature | Owner | Value |
|---|---|---|
| **The Kingsway** — slice 4's name; an earlier draft of this spec called it "the High Road", which names no street in the town | slice 4 | `x = 0`, width **4**, so the corridor is `x ∈ [-2, 2]`, running north from the gate apron to the Keep Approach |
| Gate arch | slice 4 | `{ x: 0, z: 29 }`, spanning piers at `(∓5, 29)`, cut through the town wall |
| The gate apron (paved, walkable, `kind: "path"`) | slice 4 | `x ∈ [-4, 4]`, `z ∈ [24, 29]` |
| `BUILDING_SLOTS.tavern` + `BUILDING_FOOTPRINTS.tavern` | **slice 4** | centre `{ x: 10.5, z: 24.5 }`, `{ w: 7, d: 6, h: 7 }`, `solid: true`, door face **west** |
| `SITE_DOORS.tavern` | slice 4 | node `tavern-door` at `{ x: 5.0, z: 24.5 }`, spur from `gate-apron` `(0, 24.5)`, width 2.5 |
| `SPAWN` | **slice 4, unchanged by this slice** | `{ x: 0, z: 26.5 }`, facing `"n"` |

**The Tavern stands east of the Kingsway**, mirroring the Village Well on the west, so a child walking in through the gate has a landmark on each hand. Slice 4 §3.3 derives the six clearances; this slice re-states the two it depends on rather than re-deriving them:

- Grown footprint `x ∈ [6.55, 14.45]`, `z ∈ [21.05, 27.95]`; the grown **west** face at `x = 6.55` clears the Kingsway's grown corridor edge (`x = 2.45`) by **4.10 units** and the gate apron's east edge (`x = 4`) by 2.55.
- `distance(SPAWN (0, 26.5), doorPoint("tavern") (5.0, 24.5)) = hypot(5.0, 2.0) = 5.39` against a 2.0 radius — a margin of 3.39 units, **0.97 s** of walking at `HERO_SPEED` 3.5. The door never arms on the spawn frame, and the whole walk to the exit is **1.5 s**.

The Tavern is the largest built mass in the world after the keep: 7 wide × 7 tall against the height ladder (`BUILDING_HEIGHTS`, slice 2: cottage-class 3, library 4.5, chapel 6, watchtower 9 but only 3 wide). The watchtower is taller; the Tavern reads bigger, which is what "largest non-castle silhouette" means on screen.

### 3.2 `Door`, and the doors this slice cuts

New pure module **`src/lib/realm/doors.ts`**. No `three` import; nothing in it touches the DOM.

```ts
import type { Vec2 } from "./layout"; // type-only: no runtime cycle with layout.ts

export type DoorId = "tavern" | "keep" | "library";

export type DoorAction =
  | { kind: "panel"; panel: "tavern" | "kingdom" }
  | { kind: "navigate"; href: string };

export type Door = {
  id: DoorId;
  position: Vec2;      // where the hero must stand; always outside every grown collider
  radius: number;      // reach radius for this door
  label: string;       // the bubble's heading and the panel's aria-label
  prompt: string;      // the bubble's button, keyboard variant
  promptTouch: string; // the bubble's button, touch variant
  aloud: string;       // the aria-live / read-aloud line, keyboard variant
  aloudTouch: string;  // the aria-live / read-aloud line, touch variant
  action: DoorAction;
};

/** How far outside a face a door point sits: HERO_RADIUS (0.45) plus 0.95 of standing room. */
export const DOOR_CLEARANCE = 1.4;

export const DOOR_RADIUS: Record<DoorId, number> = { tavern: 2.0, keep: 2.4, library: 2.0 };

export const DOOR_COPY: Record<DoorId, Pick<Door, "label" | "prompt" | "promptTouch" | "aloud" | "aloudTouch">>;

export type DoorSite = { position: Vec2; size: { w: number; d: number } };

/** Every door the world currently has. `library` is null until the Library is complete. */
export function doorsFor(input: { tavern: DoorSite; keep: DoorSite; library: DoorSite | null }): Door[];

export function doorById(doors: readonly Door[], id: string): Door | null;
```

The door point formula is one line for all three doors, and it is why the clearance is constant:

- **Tavern**, **west** face: `{ x: p.x - w / 2 - DOOR_CLEARANCE, z: p.z }` → `{ x: 5.6, z: 24.5 }`. Slice 4's `tavern-door` road node sits at `x = 5.0` — `DOORSTEP` (1.55) outside the grown face — so the road puts a child 0.6 units *further out* than the door point requires, and the door is in reach from the node with room to spare.
- **Keep**, south face: `{ x: p.x, z: p.z + d / 2 + DOOR_CLEARANCE }`, where the footprint is **`keepFootprintFor(layout.keepStage)`** once slice 10 lands and `CASTLE_FOOTPRINTS[castleType]` until then. Slice 10 removes `CASTLE_FOOTPRINTS`, and **slice 10 §8 carries the obligation to re-point this call and to add the `doors.test.ts` case** asserting the Keep door point moves with the stage and always clears the grown footprint by `DOOR_CLEARANCE`. This slice states the dependency so that removal is not silent.
- **Library**, east face: `{ x: p.x + w / 2 + DOOR_CLEARANCE, z: p.z }`. Emitted only when the Library's `SiteProgress.complete` is true.

Every door point therefore sits exactly `0.95` units outside the wall it is cut into — enough to stand on, too little to hide in.

`buildWorldLayout` gains `doors: Door[]` on `WorldLayout` and calls `doorsFor` with the three sites it already computes. It needs **no new input**: all three come from `village.ts`'s `BUILDING_SLOTS` + `buildingFootprint(id)` — the Tavern is the ninth plot in that table — plus, for the keep, `layout.keepStage`, and, for the Library, the `SiteProgress` `buildWorldLayout` already has.

**The Tavern and Keep doors do not depend on kingdom data.** `buildWorldLayout` is called with `buildings: kingdom.buildings`, which is `[]` when the kingdom fails to load and the shell shows "The villagers are resting." Both doors still emit, so a child can always read their kingdom and always leave, even on the degraded path.

### 3.3 Reach, generalised

New pure module **`src/lib/realm/reach.ts`**. It takes ownership of `REACH` and `nearestVillager` so there is no import cycle; `villagers.ts` re-exports both, and `villagers.test.ts`'s five existing assertions pass unchanged.

```ts
import type { Vec2 } from "./layout";
import type { Door } from "./doors";

/** A hero this close (or closer) can talk. */
export const REACH = 2.5;

export type Interactable =
  | { kind: "villager"; id: string; position: Vec2; distance: number }
  | { kind: "door"; id: DoorId; position: Vec2; distance: number; door: Door };

/**
 * The nearest thing the hero can act on. Villagers use REACH; each door uses its
 * own radius. Ties go to the villager — talking is the game, a door is a way out
 * of it — and villager ties then resolve to array order, as before.
 */
export function nearestInteractable(
  hero: Vec2,
  villagers: readonly { id: string; position: Vec2 }[],
  doors: readonly Door[]
): Interactable | null;

/** "villager:bram" | "door:tavern" | null — the single string the scene reports to the shell. */
export function reachKey(i: Interactable | null): string | null;

/** Splits a reach key back apart; null for anything malformed. */
export function parseReachKey(key: string | null): { kind: "villager" | "door"; id: string } | null;

/** Unchanged behaviour, kept for every existing caller and test. */
export function nearestVillager(hero: Vec2, villagers: readonly { id: string; position: Vec2 }[]): string | null;
```

Scene change, `realm-scene.tsx` (~6 lines): `const near = nearestVillager(p, layout.villagers)` becomes `const near = reachKey(nearestInteractable(p, layout.villagers, layout.doors))`. The `!== reachRef.current` comparison, the `queueMicrotask(() => onReachChange(near))` and the `reachId: string | null` prop shape are all untouched, so the `World` memo and the scene's referential-stability contract are untouched.

**Villager/door separation invariant:** any door attached to a building site must be at least **3.0 units** from that site's villager, so the two never sit on top of each other and the tie rule almost never fires. For the Library at a 4×4 footprint the separation is `hypot(3.4, 3.5) = 4.88`; at the legacy 3×3 it is `4.17`. Asserted in `doors.test.ts`.

**Doors are disarmed whenever the world is not interactive.** The scene already gates the reach bubble on `interactive`, and `interactive` is already false during the ceremony, a panel, and the help card. This matters most for the crown ceremony, which walks the hero into the keep forecourt: no Kingdom prompt appears mid-ceremony, and when the ceremony ends the hero is standing at the Keep door and the bubble arms on the next frame. That is intended and it is a good beat.

### 3.4 The bubble — every string

The door bubble reuses `.realm-bubble` and its button class, so the focus-return path (`realm-shell.tsx`'s `returnFocus` queries `.realm-bubble-talk`), the 44px minimum and the calm-mode styling all come free. It adds one modifier class for the door key colour.

```
<div class="realm-bubble realm-bubble--door" role="group" aria-label="{door.label}">
  <p class="realm-bubble-text">{door.label}</p>
  <button class="realm-bubble-talk realm-bubble-talk--door">{prompt}</button>
</div>
```

| Door | `label` | `prompt` (keyboard) | `promptTouch` |
|---|---|---|---|
| tavern | `The Tavern` | `Open the door · Enter` | `Open the door` |
| keep | `The Keep` | `See your kingdom · Enter` | `See your kingdom` |
| library | `The Library` | `Open the Spellbook · Enter` | `Open the Spellbook` |

Read-aloud and aria-live lines. Per slice 1's rule the notice string is set **regardless of `readAloud`**, so the aria-live lane announces it for free; `speak()` fires only when `readAloud` is on, behind a last-spoken ref so re-renders do not stutter it.

| Door | `aloud` (keyboard) | `aloudTouch` |
|---|---|---|
| tavern | `You're at the Tavern door. Press Enter to open it.` | `You're at the Tavern door. Tap Open the door.` |
| keep | `You're at the Keep. Press Enter to see your kingdom.` | `You're at the Keep. Tap See your kingdom.` |
| library | `You're at the Library. Press Enter to open your Spellbook.` | `You're at the Library. Tap Open the Spellbook.` |

Enter handling in the shell: the existing keydown effect reads `reachId`, which is now a namespaced key. `parseReachKey(reachId)` decides — `{kind: "door"}` opens that door, `{kind: "villager"}` calls the existing `setOpenVillagerId`. The Space rule is unchanged: with a spell page selected, Space casts and does not open anything.

### 3.5 The Tavern panel — the exit that tells you what is through the door

`src/components/realm/door-panel.tsx`, rendered inside `.realm-root` as `.realm-overlay > .realm-panel .realm-door-panel`, exactly the way `DeedPanel` is at `realm-shell.tsx:559-570`. `role="dialog"`, `aria-modal="true"`, focus on mount, the same Tab trap and Escape-to-close as `SiteCard`.

Every string, verbatim:

- Heading: `The Tavern`
- Subhead: `Your quests, your family, and the rest of your kingdom are through this door.`
- Quest list heading, when the bundle's assignment date matches the client's local date: `Today's quests`
- Quest list heading otherwise: `Quests for {assignmentsDate}`
- Each row: `{subjectName} · {questTitle}` with a status word — `Done` / `Waiting` / `Skipped` / `Stuck` for `completed` / `pending` / `skipped` / `stuck`.
- Empty list: `No quests set for today.`
- Load failure: `The board is blank today.` followed by a `Try again` button.
- More than the row cap: `and {n} more waiting in the Tavern.`
- Minutes, child view, `n > 0`: `{n} minutes of Realm time left today.`
- Minutes, child view, `n === 0`: `No Realm minutes left today.`
- Earning line, `accessMode` is `earned` or `both`: `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here, up to {dailyCapMinutes} a day.`
- Earning line, `accessMode` is `scheduled`: `Your Realm time comes from recess, not from quests.`
- Full Quest Log link (full depth only): `Open the full Quest Log →` → `/quests`

  **Verified, because a link is a promise.** `/quests` exists (`src/app/(app)/quests/page.tsx`) and renders today's assignments through `getAssignmentsForDate`, the week's schedule through `TodaySchedule`, and the quest log through `quest-log.tsx` — the same assignments this panel is already showing three of. So the link goes somewhere real, and it goes to *more of the same thing*, which is what "the full log" has to mean for the sentence to be true. It is **not** the answer to the user's "no quest log or tracking" — that is slice 1's objective card, this slice's Kingdom panel and slice 10's signboards, all of which are in the world. This link is the third thing, for the child who wants the list.
- The line above the buttons: `Going in ends your visit here. Come back any time you have minutes left.`
- Primary button: `Go in`
- Ghost button: `Stay in the Realm`
- Read-aloud, spoken once on open: `The Tavern. Your quests, your family, and the rest of your kingdom are through this door. Going in ends your visit. Do you want to go in, or stay in the Realm?`

Nothing in that copy promises anything the code does not do. In particular there is no "your minutes stop counting" line, because on a deliberate exit the minute in progress may be charged (§3.9); `Come back any time you have minutes left` is true either way.

**Parent preview (`isChildView: false`).** The panel renders. The minutes line and the earning line are suppressed (`minutesRemaining` is `null` in preview and the panel must never read nulled hero state as a number). The primary button becomes `Leave the preview` and navigates to `/tavern?child={childId}` so the adult lands back on the hero they were watching. `flushPending` is not called — the clock is disabled for parents (`usePlayClock({ enabled: isChildView })`). The quest list renders normally: it is the child's schoolwork and a parent is entitled to it.

### 3.6 The Kingdom panel — zero new queries

`src/components/realm/kingdom-panel.tsx`, same overlay chrome. Driven entirely off `kingdom.buildings`, `bundle.banners`, `bundle.wornCrown` and `bundle.heroName`, all of which the shell already holds and already updates optimistically after a finished side quest (`realm-shell.tsx:413-424`), so a building raised this visit is on the board before the panel closes.

- Heading: `{heroName}'s Kingdom` — in preview too. The child's name, never the previewing adult's.
- Summary line, full depth: `{built} of 8 raised`
- Summary line, simple depth: eight pips, `●●●○○○○○`, with the accessible name `{built} of 8 raised`
- Seasons heading: `Seasons crowned`
- One banner chip per completed season in that season's crown colour, labelled with `seasonLabel(startDate)` — `2026–27`
- No seasons: `No seasons crowned yet. Finish a school year to earn your first crown.`
- Crown line, worn: `Wearing: {crown.label}`
- Crown line, none: `No crown yet.`
- Eight rows, ranked by the shared objective rank (in-progress first, then untouched, then built), each: the building's `GameIcon`, its `label`, its progress, and a third line.
  - Progress, full depth: `{done} of {total}`. Simple depth: five pips with the accessible name `{done} of {total}`.
  - Third line, incomplete: `{villagerName} — {deeds[0].title}`
  - Third line, complete: `Raised.`
  - Row for an unbuilt Library, appended to the third line: `Raise it and its door opens your Spellbook.`
- Row `aria-label`: `{label}, {done} of {total} side quests done. {villagerName} is waiting.` / for a built one, `{label}, built.`
- Footer: `Close` and, as the never-disappearing second exit, `Leave the Realm` (opens the Tavern panel in place).

**Why the third line is worded that way, and not "Next: …".** `BuildingOverview.deeds` carries `{id, title, story, area}` and no completion flag (`services/deeds.ts:11-15`), so the code cannot know which side quest is next. `{villagerName} — {deeds[0].title}` names a real person and a real side quest at that site without claiming it is unfinished. Slice 13 adds per-side-quest completion marks; the row's shape does not change when it does, only the line's contents.

**Attribution hook.** A complete row renders `Raised.` today and `Raised by {name} · {season}` when slice 13 supplies it, via the same `raisedByName ?? liveName` rule the board uses. The row component already takes an optional `raisedBy?: { name: string | null; season: string | null } | null` prop that is `null` in this slice, so slice 13 fills a hole rather than rewriting a component. When either half is missing the row falls back: name but no season → `Raised by {name}`; season but no name → `Raised.`

### 3.7 The Library door and the walled garden

The Library door exists only when the Library is complete, navigates to `/spellbook` without a confirm, and **is never the only route to the Spellbook** — slice 3 pins a permanent Spellbook button on the ability bar. That is the direct answer to the audit's "gated behind failure": an unbuilt Library locks nobody out, and a hero with four full pages still has a Spellbook button.

The cost of navigating is real and worth stating: `/realm` is uncached, so returning re-runs `getRealmBundle`. The sprite cache stays warm across a short round trip after slice 2, so the return does not re-rasterise. That is why this door is allowed to navigate at all.

**One guard this slice adds, because it is adding traffic to that path.** `ensureStarterSpell` (`actions/realm.ts:54`) is a **write** that runs on every single `/realm` load, and this slice makes returning to `/realm` a normal thing a child does several times a session rather than a rare one. Its steady-state path already short-circuits inside the service on `flags.starterSpellAt` (`services/spells.ts:56`), but the call still enters the action and still joins the request. One line, at the call site:

```ts
if (!flags.starterSpellAt && bundle.spellbook.pages.length === 0) await ensureStarterSpell(childId);
```

`starterSpellAt` is already loaded by `loadRealmFlags` in the same `Promise.all`, so the guard costs nothing and the write is attempted exactly once in a hero's life instead of on every visit. `realm.test.ts` gains a case: a hero with `starterSpellAt` set does not call `ensureStarterSpell`.

Everything else stays in-world. There is no Loot door, no Ranks door, no Side Quests door: the Kingdom panel is the side quests, the Tavern panel is today's quests, and Loot and Ranks are one button past the Tavern door.

### 3.8 The exit, and deleting `.realm-hud-leave`

- `realm-hud.tsx:96`'s `<Link href="/tavern" className="realm-hud-leave">Leave the Realm</Link>` is deleted, along with the now-unused `import Link from "next/link"` at line 3.
- `globals.css:1710`'s `.realm-hud-leave { margin-left: auto; color: var(--gold-bright); text-decoration: underline; font-size: 0.85em }` is deleted.
- `RealmHud` loses no props; it gains one, `exit: { onOpen: () => void } | null`, used **only** by the failsafe below.

**Failsafe.** If `layout.doors.length === 0` — a state `buildWorldLayout` cannot currently produce, since the Tavern and Keep doors do not depend on kingdom data — the HUD renders a real button in the message lane, not a link on grass:

- `.realm-hud-exit`, text: `Leave the Realm`

A layout test asserts `buildWorldLayout({ castleType: "campsite", buildings: [] }).doors` contains `tavern` and `keep`, so the failsafe is unreachable in practice and exists only so that a future layout bug cannot trap a child.

### 3.9 The clock: what a door costs and what it charges

**This slice adds no rounding rule, because slice 1 already shipped the only one.** An earlier draft of this section proposed a second function, `partialMinuteCharge`, charging the in-progress minute only on a *deliberate* exit and forgiving an interruption. It is **deleted**, for three reasons:

1. **Slice 1's rule already covers every exit.** `minutesToSettle(clock, pending)` = `pending + (secondsThisMinute >= ROUND_UP_SECONDS ? 1 : 0)`, run from `RealmOpen`'s unmount cleanup, and slice 1 §3.16 states that *every* path runs it — the door, a router navigation, the gate closing, the clock running out, a browser back. The partial minute is not a leak this slice inherits; it was closed in slice 1.
2. **The kinder-sounding rule is a rule nobody can implement.** An interruption and a deliberate exit are indistinguishable to an unmount cleanup. A "forgive the interrupted" policy would be false the moment it shipped, which is precisely the class of promise the `Clear troubles to protect the sites` finding taught us not to make.
3. **Two functions would double-charge.** `flushOnExit` writing a partial minute and then the unmount cleanup writing it again is a race with no owner, and neither spec named it.

So the three easy exits this slice cuts — the Tavern panel's `Go in`, its `Open the full Quest Log →`, and the Library door — all call **`clock.flushPending()`**, slice 1's existing method, fire-and-forget:

```ts
void clock.flushPending();
router.push(href);
```

`flushPending` already settles through `minutesToSettle`, so the deliberate exit charges exactly what the unmount cleanup would have charged a moment later, and the cleanup's second call is a no-op because the pending count is zero and `secondsThisMinute` has been reset by the settle. **Nothing waits for it** — the child never sits on a spinner to leave. A rejected flush forfeits at most one minute, in the child's favour, and leaving is never blocked by a network error.

**If a stricter rule is ever wanted**, it is an amendment to slice 1 §3.16 and to `minutesToSettle`, not a parallel path added downstream. A later slice cannot make the clock kinder to interruptions, because a later slice only ever sees the deliberate exits.

Every new beat, in seconds:

| Beat | Cost |
|---|---|
| Bubble arms / disarms | 0 — one comparison per frame in an existing loop |
| SPAWN → Tavern door | 1.3 s walking |
| Keep forecourt (`z ≈ -20`) → Tavern door, on the road | **12.6 s** walking at `HERO_SPEED` 3.5; ~7.3 s riding at a mid-tier mount's 6.0 |
| Opening either panel | < 50 ms — one render, no fetch; both are read off state the shell already holds |
| Time actually spent in the Kingdom panel | 5–12 s of the child's minutes, unpaused and deliberately so |
| Time actually spent in the Tavern panel | 4–8 s, then the visit ends |
| Exit | 0 s of added wait |
| `getAssignmentsForDate` in the bundle | no added latency — one more concurrent read in an 8-way `Promise.all` bounded by `loadKingdomState` |
| First paint | +1 sprite kind, ≤ 15 ms cold, 0 ms warm (§3.11) |

The 12.6-second walk is the honest number decision 2 bought and it is exactly why slice 7 exists. Two things keep it from ever costing a child their last minute: the exit is duplicated in the Kingdom panel at the keep itself, and **running out of minutes does not strand anyone** — `onClose` swaps the whole tree for `RealmClosed` wherever the hero is standing.

### 3.10 The bundle: two lines and one field

`src/lib/actions/realm.ts`, inside the existing `Promise.all` at `:60-72`, using the same `.catch` degradation pattern as `loadKingdomState`:

```ts
getAssignmentsForDate(childId, localDateOf(new Date()))
  .then((rows) => ({ rows, error: undefined as string | undefined }))
  .catch((err: unknown) => {
    console.error("Realm assignments failed to load", err);
    return { rows: [], error: ASSIGNMENTS_BLANK };
  }),
```

Mapped to a narrow shape — the full `{assignment, quest, subject}` rows are three whole tables and must not cross into a client component:

```ts
export type RealmAssignment = {
  id: string;                 // questAssignment.id
  title: string;              // quest.title
  subject: string;            // subject.name
  color: string | null;       // subject.color
  status: "pending" | "completed" | "skipped" | "stuck";
};
```

`RealmBundle` gains:

- `assignments: RealmAssignment[]`
- `assignmentsDate: string` — the ISO date the list was read for
- `assignmentsError?: string` — `"The board is blank today."`
- `spellbook.level: number` — stop discarding `level` at `actions/realm.ts:101`, so an empty ability slot can say what unlocks it (slice 3 consumes this)
- `settings.accessMode: "earned" | "scheduled" | "both"`
- `settings.earnedMinutesPerQuest: number`
- `settings.dailyCapMinutes: number`

All three settings fields come from the `loadRealmSettings(childId)` row already in the batch. **Zero extra queries**; the assignments line is one more concurrent read.

New sibling action, mirroring `getRealmKingdom`'s retry pattern:

```ts
export async function getRealmAssignments(childId: string, date: string): Promise<RealmAssignment[]>;
```

**Date honesty.** `getRealmBundle` runs on the server, so `localDateOf(new Date())` is the server's local date — the same assumption `TavernPage` already makes with `formatDate(new Date())`. The shell knows the client's date (it computes `localDateOf(new Date())` for `getRealmAccess` at `realm-shell.tsx:83`). When the two differ the panel heading becomes `Quests for {assignmentsDate}` instead of `Today's quests`, so the list is never mislabelled.

### 3.11 The Tavern figure, and the rasterisation budget

`src/components/realm/world-figures.tsx` gains `TavernFigure` — a two-storey inn: stone ground floor, timbered upper storey with four lit windows in a warmer key than any other building in the palette, a steep shingled roof, a chimney, and a hanging sign on an iron bracket over the door on the east face. It is authored at slice 2's derived raster scale against a 7 × 8.5 sprite box (footprint 7 wide, height 7, plus roof and sign) and carries `data-figure="landmark" data-figure-id="tavern"`.

`SpriteSource` rasterises it from a **module-level constant** `LANDMARK_KINDS = ["tavern"] as const`, iterated whenever `world` is set. The `world` prop's shape does not change, so the shell's `useMemo` at `realm-shell.tsx:222-225` and its referential stability are untouched.

**The budget.** `sprite-texture.ts` caches by figure kind, so instances are free and kinds are billed. This slice adds **exactly one kind**: `landmark:tavern`. The Keep door and the Library door add none — they reuse the castle and library figures that already exist. The lit windows and the hanging sign are inside the one SVG, not separate kinds.

Measured effect on first paint: at `CAMERA_ZOOM` 40 and dpr bucketed to 2, a 7-unit-wide sprite rasterises to roughly 560 × 680 device pixels — about 0.38 Mpx, one canvas, estimated 8–15 ms on a mid laptop and running in parallel with the rest after slice 2. Zero on a warm-cache return. The estimate is confirmed in the browser pass (§7), not asserted in a unit test.

Scene changes for the new kind, two lines and a catalog row: `"landmark"` joins the `standing` filter, and `spriteFor` gains `if (prop.kind === "landmark") return worldTex(\`landmark:${prop.id}\`)`. **`spriteSizeFor` gains nothing.** The Tavern's sprite box is a `FIGURE_CATALOG` entry — `{ key: "landmark:tavern", family: "landmark", grid, px, topRow, baselineRow, anchor: "base" }` — registered through slice 2's `registerFigures`, so the box comes from `figureSize("landmark:tavern")` exactly as every other figure's does, and the eyeballed `+0.75 / +1.5` constants that slice 2 exists to delete are never written. It also means the Tavern appears in `/dev/figures` and is counted against `RASTER_BUDGET_TEXELS` for free. A landmark with no texture falls through to the existing box-mesh path, so a rasterisation failure leaves a box and a working door.

The Tavern's `label` is `Tavern` and its `tag` is `undefined`. Slice 10 deletes the floating DOM label pills and replaces this one with the hanging sign the figure already draws.

### 3.12 The four full-village engineering problems

Decision 2 turned the audit's objections into problems to solve. Here is how this slice's props, doors and spawn point handle each.

**(a) A denser world starves enemy spawns.** Slice 4 already replaced the foundation-only rule with `open-ground.ts`'s ten `SPAWN_ZONES`, and already cut **`gate-green-east`** back from x ≥ 11 to **x ≥ 15** so no zone touches the Tavern's grown box. Slice 4's zones never covered the gate apron in the first place (`gate-green-west` and `gate-green-east` start at |x| ≥ 11 and ≥ 15 against an apron of x ∈ [−4, 4]), which is deliberate on two counts: a trouble sitting on the exit door is a bad first frame for a six-year-old, and the apron is the spawn point, so a trouble there would dazzle a child before they have moved. This slice adds **no** zone edit; `open-ground.test.ts` (slice 4's) already asserts that no zone intersects any plot's grown footprint, the Tavern included.

**(b) New solid props can wedge the hero.** The Tavern is the largest new solid in the programme so far, so it gets four guarantees, all asserted:

1. Its footprint grown by `HERO_RADIUS` intersects **no** road corridor — 4.10 units clear of the Kingsway's grown east edge, 2.55 clear of the gate apron.
2. `unstickHero` must recover from it — and by this slice it already does. Slice 3 replaced the single-collider, push-south resolver with the eight-pass smallest-penetration-axis version, and slice 4 added the road-node rescue list. From the Tavern's centre the smallest penetration is **west** (3.5 units to the west face against 3.0 to the north), so the hero lands toward the `gate-apron` → `tavern-door` spur rather than in the town wall. This slice adds that case to `movement.test.ts` and changes no code.
3. Every door point is outside every collider grown by `HERO_RADIUS`, and inside the world bounds. Asserted per door.
4. Any cross-map route near this slice's props is computed by `routeBetween()` from `village.ts`, never by a straight line. A layout test asserts that no waypoint of the ceremony walk and no node of slice 4's `COURSE_NODES` falls inside the Tavern's grown footprint.

**(c) Sprite rasterisation blocks first paint.** +1 kind, ≤ 15 ms cold, 0 warm — §3.11.

**(d) Gleam spawning needs open ground.** Gleams go through the same ten `SPAWN_ZONES`, so slice 4's `gate-green-east` cut-back protects them too, and no zone reaches the gate apron. A gleam on the apron would pull a child toward the exit door during recess, which is the opposite of what recess is for.

### 3.13 The Realm card on the Tavern page

`src/app/(app)/tavern/realm-card.tsx`, a server component, in a new `hud-row-realm` grid placed directly under the `CrownCard` and above `hud-row-main` — the first thing after the banner, because the Realm is the reward layer and this is the page that has never mentioned it. The grid stacks to one column under 640px.

The page adds `loadKingdomOverview(activeChild.id)` and `loadRealmSettings(activeChild.id)` to its existing eleven-way `Promise.all` — two more concurrent reads, no added latency, and the kingdom read is shared with the board.

Child view:

- Frame title: `The Realm`, icon `castle`
- `{built} of 8 buildings raised.` with eight pips beside it
- With an objective: `{villagerName} is waiting at the {buildingLabel}.`
- All eight built: `Every building is raised. Your kingdom is finished.`
- `accessMode` is `earned` or `both`: `Realm minutes come from finishing quests.`
- `accessMode` is `scheduled`: `The Realm opens at recess.`
- Link: `Walk your Realm →` → `/realm`
- Realm disabled for this hero: the title and body from `gateCopy({ allowed: false, reason: "disabled" })` — `The Realm is closed for this hero.` / `A grown-up can open it in the Chronicle.` — and no link. Calling `gateCopy` rather than retyping the strings is what keeps this card and the locked gate from ever disagreeing.

Parent view (a specific hero's Tavern page):

- Frame title: `{childName}'s Realm`
- The same built line and pips
- `You'll be looking, not playing — side quests and spells are theirs.`
- Link: `Look in on the Realm →` → `/realm?child={childId}`

The depth axis does not govern this card: the Tavern page is the 2D app, which uses numerals everywhere, so the card shows both pips and the numeral line. Depth is a Realm-surface rule, and mixing it into the app would put a complexity axis on a page a parent reads.

### 3.14 The siblings' board

New pure module **`src/lib/realm/tavern-board.ts`**:

```ts
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";

export type RaisingRow = {
  childId: string;
  liveName: string | null;        // child.display_name; null when the hero row is gone
  raisedByName?: string | null;   // slice 13's snapshot name; wins when present
  buildingId: string;
  deedsDone: number;
  completedAt: Date | null;       // kingdom_progress.completed_at
  updatedAt: Date;                // fallback for rows completed before completed_at was written
};

export type Raising = {
  key: string;           // `${childId}:${buildingId}` — stable React key
  childName: string;     // "Emma", or "You" for the viewer's own row
  buildingLabel: string; // "Grain Mill"
  whenLabel: string;     // "yesterday"
  self: boolean;
  raisedAt: Date;
};

/** "today" | "yesterday" | "3 days ago" | "2 weeks ago" | "a while ago" */
export function whenLabel(raisedAt: Date, now: Date): string;

/** "Emma raised the Grain Mill yesterday." / "You raised the Chapel today." */
export function raisingSentence(r: Raising): string;

export function recentRaisings(
  rows: readonly RaisingRow[],
  now: Date,
  opts?: { limit?: number; viewerChildId?: string | null }
): Raising[];
```

Rules, each with a test:

- A row is a raising when `completedAt !== null`, **or** when `buildingProgress(deedsDone, building).complete` is true. `raisedAt` is `completedAt ?? updatedAt`. Rows completed before `completed_at` was written (`actions/deeds.ts:247-252`) therefore still appear, dated by `updatedAt`, and a stale `updatedAt` lands on `a while ago` anyway.
- `childName = raisedByName ?? liveName`. Both missing → the row is **skipped**; a raising we cannot attribute is not a sentence we can write.
- `buildingId` not in `BUILDINGS` → skipped.
- `childId === viewerChildId` → `childName` is `You` and `self` is true, so the sentence reads `You raised the Chapel today.` rather than the third person.
- Sorted newest `raisedAt` first, ties broken by `childName` then `buildingId` so the order is deterministic across renders.
- `limit` defaults to 5.

Every one of the eight current `BUILDINGS` labels takes the definite article — Village Well, Grain Mill, River Bridge, Chapel, Market Square, Library, Watchtower, Royal Garden — so `the {label}` is safe. A test snapshots all eight sentences, so a future label that does not take an article (`Ada's Forge`) fails loudly rather than shipping.

New action file **`src/lib/actions/tavern-board.ts`** (`"use server"`, async exports only):

```ts
export async function getTavernBoard(
  viewerChildId: string,
  limit?: number
): Promise<{ raisings: Raising[]; heroCount: number; error?: string }>;
```

Implementation:

1. `const actor = await getActor()`. Family id is `actor.familyId` for a child actor; `await getActiveFamilyId()` for an adult.
2. `await requireFamilyReadAccess(familyId)` — the gate that exists for exactly this case ("family-scoped data a hero legitimately views about themselves", `access.ts:238-254`) and that admits a child reading their own family while still refusing another family's.
3. One join: `kingdom_progress` → `child`, filtered to `child.family_id = familyId` and `child.banished_at IS NULL`, ordered `completed_at DESC NULLS LAST, updated_at DESC`, limited to 40 rows. For an adult whose `access.scope === "specific"`, also filtered to `access.scopedChildIds` — a scoped guardian must not learn about children outside their grant.
4. `heroCount` is a `count(*)` over non-banished heroes in the same family under the same scope filter.
5. `recentRaisings(rows, new Date(), { limit, viewerChildId })`.

`src/app/(app)/tavern/tavern-board-card.tsx`, a server component beside the Realm card:

- Frame title: `The Tavern Board`, icon `tavern`
- One row per raising: `{sentence}` in `.tavern-board-item`, with the `whenLabel` in a muted `.tavern-board-when` span
- Empty, `heroCount >= 2`: `No buildings raised yet. Finish the side quests at a site and it goes up — and everyone here will see it.`
- **Hidden entirely when `heroCount < 2`.** A one-hero family does not get an empty board about siblings who do not exist.
- Load failure: the card is omitted. A board is a nice-to-have and must never break the Tavern page.

Privacy, stated plainly: this is a family board. A hero sees their siblings' raisings and their siblings see theirs. Nothing else crosses — no minutes, no XP, no quest titles, no avatar, no kingdom to visit. `showOnLeaderboard` is **not** consulted, because that flag governs the public community leaderboard and using it here would silently hide a child from their own family.

**There is no per-hero opt-out, and that is a ruling rather than an omission.** Three reasons: the board shows one fact per row — *this hero raised this building on this day* — which is the same fact the Chronicle already shows a parent; a family in one house is not an audience a child can meaningfully hide from, and a toggle would imply otherwise; and a hidden hero makes the board lie by omission, which is worse than a board that is simply true. If a family does want one, it is a column, a settings control and a filter on `recentRaisings`, and it belongs in its own slice with its own copy — not slipped in here.

**A hero played by two children** (decision 9's third case, and the realistic homeschool one) appears on this board **once, as the hero**. The row is `{heroName} raised the {building}`, not `{personName}`, and slice 13's attribution snapshots the *hero's* display name into `raised_by_name` for the same reason. The stone and the board both record which hero did the work; neither claims to know which pair of hands was on the tablet, and neither should.

Out of scope for the board: `ParentDashboard` (the parent's no-child-selected view at `tavern/page.tsx:83-85` returns early and is a different component). The board appears on a hero's Tavern page and on a parent's per-hero Tavern page.

---

## 4. Data model

**This slice ships no migration.** No new table, no new column, no changed meaning for any stored value. Decision 8 is explicit that the siblings' board is read-only with no new schema, and every other surface here reads data that already exists.

Existing rows, and what they do:

| Table | Column | What this slice does with it | What an old row does |
|---|---|---|---|
| `kingdom_progress` | `child_id`, `building_id`, `deeds_done` | Read by the board's join and by `loadKingdomOverview` | Unchanged |
| `kingdom_progress` | `completed_at` | The board's primary date | **Null on rows completed before `actions/deeds.ts:247-252` shipped.** Those rows fall back to `updated_at` and are still shown; a very old `updated_at` lands on `a while ago`. They are never dropped. |
| `kingdom_progress` | `updated_at` | Date fallback | Always set (`notNull`) |
| `child` | `display_name` | The board's live name | Always set |
| `child` | `banished_at` | Excludes a retired hero's raisings | Null for every active hero; a restored hero's raisings reappear with their live name |
| `child` | `show_on_leaderboard` | **Deliberately not read** | — |
| `realm_settings` | `access_mode`, `earned_minutes_per_quest`, `daily_cap_minutes` | Newly surfaced in `RealmBundle.settings` and in the Tavern panel's copy | Defaults `earned` / 5 / 30 already apply to every row |
| `quest_assignment` / `quest` / `subject` | — | `getAssignmentsForDate` in the bundle | Unchanged; the query already exists and is already guarded by `requireChildAccess` (`quest-assignments.ts:31-49`) |

Migration numbering: the last migration on the branch is `0025_worried_tyrannus.sql`. Slices 1–5 consume `0026` onward; this slice consumes none, so the next free number passes through unchanged to slice 7. If a build-time discovery forces a column, the verification step is the standard one: `db:generate`, then `db:migrate`, then **check** the generated SQL and the applied state rather than trusting the hook, which runs migrate silently.

Slice 13's schema change — lowering `deedsToBuild`, which retro-completes buildings — will retro-create raisings on this board, dated by `updated_at`. That is stated here so slice 13 owns it: a child who wakes up to "Emma raised the Watchtower today" for a building she did not finish today is a bad surprise, and slice 13's one-time message to the child must cover the board as well as the world.

---

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| Assignments query fails | `bundle.assignmentsError = "The board is blank today."`; the panel shows it plus a `Try again` that calls `getRealmAssignments(childId, date)`. The world still opens — the same `.catch` degradation the kingdom read uses. |
| Kingdom fails to load | `bundle.kingdomError` is set and `buildWorldLayout` gets `buildings: []`. The Tavern and Keep doors still emit, so a child can read the (empty) Kingdom panel and still leave. The Library door does not emit, because the Library is not known to be complete. |
| Tavern sprite fails to rasterise | `sprite-source.tsx:104-109` already continues silently. The scene's existing fallback draws a labelled box in the Tavern's colour. The door point is geometric, so the door works regardless. |
| Both landmark and castle textures fail | The Keep still draws as a box (the castle already has that path) and both doors still work. The failsafe `Leave the Realm` button is still not needed. |
| `layout.doors` is empty | `.realm-hud-exit` button appears in the message lane. Asserted unreachable by a layout test. |
| `flushPending` rejects on the way out | Navigation proceeds. At most one minute is forfeited, in the child's favour. Leaving is never blocked by a network error. |
| Library completes mid-visit | `layout` is a `useMemo` on `kingdom.buildings`, so the door appears on the next render. The foundation becomes solid and `unstickHero` runs on the `layout.colliders` change; the hero may land inside the new door's radius, and the bubble arms. That is correct and it is a nice moment. |
| The keep grows (slice 10) | The Keep door point is derived from the live castle footprint, so it tracks the silhouette with no change here. |
| Hero standing at a door when the ceremony starts | `interactive` goes false, the bubble unmounts, and no door can be opened. When the ceremony ends the bubble arms on the next frame. |
| A villager and a door both in reach | The nearer wins; an exact tie goes to the villager. Geometry keeps this to the Library, where the separation is ≥ 3.0 units. |
| A door opened while a spell page is selected | Space casts and does not open a door (existing rule, unchanged). Enter still opens the door; opening any panel clears `selectedSlot` the way the deed panel already does. |
| A child with no completions | They simply do not appear on the board. No placeholder row, no "0 raised" line. |
| A single-child family | The board is hidden entirely (`heroCount < 2`), not shown empty. |
| A multi-child family, nobody has raised anything | The board shows with `No buildings raised yet. Finish the side quests at a site and it goes up — and everyone here will see it.` |
| A retired (banished) hero | Their raisings vanish from the board while banished and return, under their live name, if they are restored. `accessibleChildren` and the board's join both filter on `banished_at IS NULL`. |
| A renamed hero | Rows follow the live name today. Once slice 13 stamps snapshots, `raisedByName ?? liveName` means past raisings keep the name they were made under, which is the point of a dated event. |
| A hero row deleted outright | Its `kingdom_progress` rows cascade away (`onDelete: "cascade"`). If a snapshot name outlives the row, `raisedByName` carries it; if neither name exists, the row is skipped. |
| A scoped guardian | Sees only heroes inside `access.scopedChildIds`, on both the board and the hero count — so the board can be hidden for them and visible for a family-wide guardian on the same family. Correct. |
| A parent previewing the Realm | The Tavern panel's primary button becomes `Leave the preview` → `/tavern?child={childId}`; the minutes and earning lines are suppressed; no clock flush. The Kingdom panel renders fully under the child's name. Neither panel reads `mana`, `cleared`, `ride` or `minutes`, so neither can crash on nulled hero state. |
| Client date ≠ bundle date | The quest heading becomes `Quests for {assignmentsDate}`. The list is never mislabelled as today's. |
| Zero minutes remaining | `onClose` swaps the tree for `RealmClosed` wherever the hero stands. Nobody has to walk to a door to be let out. |

---

## 6. Accessibility

### Per learning-profile setting

**`reducedMotion`.** No door bubble bobs, fades or slides; it appears and disappears on the frame the reach changes. The Tavern's windows are drawn lit, never flickering. The non-motion substitute for "something appeared": the reach notice is written to the aria-live lane on every door arm regardless of `readAloud`, so the arrival is announced rather than only animated. Neither panel animates in.

**`lowStimulus`.** Mutes, never empties — the rule the existing code breaks (`realm-shell.tsx` passes `decor: !settings.calmPalette`, so the children who most need visual anchoring get zero decoration). The Tavern keeps its sign, its windows and its cobbled plaza in the calm palette's muted key via the existing `CALM_TINT` path; nothing about it is removed. The Kingdom panel's banners render in muted crown colours rather than being hidden, because a banner is the record of a finished school year and hiding it would erase the payoff for exactly the child who needs the anchor most.

**`largerText`.** Both panels use `.realm-panel`, which is inside `.realm-root` carrying `readingAttributes(bundle.profile)`, and `globals.css:243-246` scopes `data-larger-text` to `.realm-panel` — so both scale correctly with no new CSS. The door **bubble** is a world `Html` element on `.realm-bubble`, which that scope does not cover; this slice sets its `font-size` from slice 3's `--realm-hud-scale` custom property so an 11px world label stops being unreadable for a `largerText` hero.

**`fewerChoices`.** The Tavern panel's quest list caps at 3 rows plus `and {n} more waiting in the Tavern.` — a substitution, not a removal: the rest are literally behind the door the child is standing at. The Kingdom panel keeps all eight rows (eight buildings are a fixed set, not a menu of choices) and drops the third line so each row is one line. The exit panel shows exactly two buttons at every setting. The invariant this slice must not break: `fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `"earned"` at **both** depths — neither is a surface this slice owns, and nothing here raises either.

**`readAloud`.** Three lines are spoken, each behind a last-spoken ref so re-renders do not stutter them: the door's `aloud` / `aloudTouch` on arm, the Tavern panel's read-aloud paragraph on open, and the Kingdom panel's summary line on open (`{heroName}'s Kingdom. {built} of 8 raised.`). Every one of those strings is written for the ear — no "→", no "·", no pip characters.

**`inputMode` (touch / keyboard / auto).** `settings.showStick` selects `promptTouch` over `prompt` and `aloudTouch` over `aloud`. The door bubble's button is a 56px world touch target (slice 1 raised world targets from the 44px adult minimum); the panel buttons inherit `.realm-panel button { min-height: 44px }`. Both panels trap Tab and close on Escape, copying `SiteCard`'s handler verbatim including its `stopPropagation` so the ceremony's Escape binding is not double-fired.

**`soundEnabled`.** This slice ships no audio. It reserves three cue ids for slice 9 to bind: **`doorReach`, `doorOpen`, `doorExit`** — camelCase, the convention slice 9's `CueId` union uses, and all three appear in slice 9's `CUES` table with a wave, a frequency, a duration and a calm variant. A reserved id with no `CUES` row is a test failure in slice 9, so this reservation cannot become a sound that silently does not exist.

**`predictableRoutine`, `untimed`, `readingFont`, `extraSpacing`.** Untouched. `readingFont` and `extraSpacing` flow through `readingAttributes` on `.realm-root`, which both panels are inside.

### The complexity axis

Both surfaces consume `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` rather than inventing a rule.

| Surface | Simple depth | Full depth |
|---|---|---|
| Kingdom panel summary | eight pips, accessible name `{built} of 8 raised` | `{built} of 8 raised` in numerals |
| Kingdom panel row progress | five pips, accessible name `{done} of {total}` | `{done} of {total}` |
| Kingdom panel row line 3 | hidden | `{villagerName} — {deeds[0].title}` |
| Tavern panel quest rows | `surfaces.listRows` (3) rows, no status word | all rows with status |
| Tavern panel Quest Log link | hidden — the door beside it goes to the same place | `Open the full Quest Log →` |
| Door bubble | identical at both depths | identical at both depths |

Every simple-depth difference is a **substitution**, not a removal: pips replace numerals, the door replaces the link, and the row's third line is information that is also standing at the site with a name over its head. Nothing a child can do at full depth is unavailable at simple depth. `depth` is never a word a child reads — the panels contain no "simple", no "advanced", no level indicator of any kind.

`surfacesFor` supplies one field this slice reads: **`listRows: number`** — 3 at simple depth, 8 at full, clamped to 3 whenever `profile.fewerChoices` is on at either depth. It is one of the thirteen fields in slice 1's closed table (first-impression §3.1). **There is no fallback clause**: this slice does not edit `depth.ts`.

### Parent preview

Stated in §3.5 and §3.6 and repeated here because the rule is absolute: `isChildView: false` nulls `mana`, `cleared`, `ride` and `minutes` and injects a hero selector. Neither panel reads any of those as a number. The Tavern panel suppresses the minutes and earning lines and swaps its primary button. The Kingdom panel renders in full under `{heroName}'s Kingdom` — the child's name, never the previewing adult's — which is also the attribution rule slice 13 inherits.

---

## 7. Testing

### Unit-testable (Vitest, jsdom, no `three` at module load)

**`src/lib/realm/doors.test.ts`**
- `doorsFor` always emits `tavern` and `keep`; emits `library` only when its site is passed.
- Every door point sits exactly `DOOR_CLEARANCE - HERO_RADIUS = 0.95` outside the face it is cut into.
- The Keep door tracks the castle footprint: `campsite` and `citadel` give different points, both with 0.95 clearance.
- `DOOR_COPY` has all five strings for all three ids, and no string is empty.
- The Library door is ≥ 3.0 units from the Library's villager at both the 3×3 and 4×4 footprints.

**`src/lib/realm/reach.test.ts`**
- Nearest wins across a mixed set; an exact tie between a villager and a door goes to the villager; villager ties still resolve to array order.
- A door outside its own radius is not returned even when inside `REACH`, and vice versa (the keep's 2.4 and a villager's 2.5 are distinguishable).
- `reachKey` / `parseReachKey` round-trip, and `parseReachKey` returns null for `""`, `"door"`, `"villager:"` and `"bram"`.
- `nearestVillager` reproduces `villagers.test.ts:29-40` exactly.

**`src/lib/realm/tavern-board.test.ts`**
- All eight sentences read naturally with the definite article (snapshot).
- `whenLabel` boundaries: same day → `today`; one day → `yesterday`; 3 → `3 days ago`; 8 → `1 week ago`; 20 → `2 weeks ago`; 40 → `a while ago`.
- `completedAt` null but `deedsDone >= total` → included, dated by `updatedAt`.
- `completedAt` null and incomplete → excluded.
- Both names missing → row skipped. `raisedByName` present → it wins over `liveName`.
- Unknown `buildingId` → skipped.
- `viewerChildId` match → `childName` is `You` and the sentence reads `You raised the Chapel today.`
- `limit` respected; ordering deterministic under equal timestamps.

**`src/lib/realm/play-clock.test.ts`** (added to the existing file)
- The three easy exits call `clock.flushPending()` and do **not** await it before `router.push`. (The 0/29/30/59 rounding behaviour itself is slice 1's `minutesToSettle` test, not re-asserted here.)

**`src/lib/realm/layout.test.ts`** (added to the existing file)
- `buildWorldLayout({ castleType: "campsite", buildings: [] }).doors` contains `tavern` and `keep` and not `library`.
- With the Library complete, `doors` contains `library`.
- Every door point is outside every collider grown by `HERO_RADIUS`, and inside the world bounds.
- The Tavern's grown footprint intersects no road corridor (`roadCorridorContains`) and no walkable part of the gate apron.
- `distance(SPAWN, doorPoint("tavern")) > DOOR_RADIUS.tavern + 2.0`.
- No ceremony-walk waypoint and no `COURSE_NODES` position falls inside the Tavern's grown footprint.
- No `SPAWN_ZONES` rectangle intersects the Tavern's grown box or the gate apron — slice 4's assertion, re-run here against the layout this slice generates.

**`src/lib/realm/movement.test.ts`** (added to the existing file)
- `unstickHero` from the Tavern's centre lands on walkable ground inside the wall (`z < 28`) and outside every collider.

**Component tests**
- `door-panel.test.tsx` — the quest list renders subject and title; the empty state; the error state and its `Try again`; `fewerChoices` caps at 3 with the "and n more" line; Escape closes; Tab is trapped; both buttons present; preview swaps the primary button and hides the minutes line.
- `kingdom-panel.test.tsx` — eight rows in objective rank order; pips at simple depth and numerals at full depth; the banners row and its empty line; the crown line both ways; the unbuilt-Library line; the `Leave the Realm` footer button; the preview heading uses the child's name.
- `realm-hud.test.tsx` (existing) — asserts no link to `/tavern` remains in the HUD, and that `.realm-hud-exit` renders only when `exit` is non-null.
- `realm-shell.test.tsx` (existing) — with `usePlayClock` mocked, `paused` stays false while a door panel is open and true while the deed panel is; the exit calls `clock.flushPending()` before `router.push` and does not await it.
- `realm-card.test.tsx` and `tavern-board-card.test.tsx` — the disabled-Realm copy matches `gateCopy`; the board is absent when `heroCount < 2` and shows its empty line when `heroCount >= 2` with no raisings.

### Needs the browser pass

On the documented port-3100 setup, same framing before and after:

1. The hero spawns on the gate apron facing north, the inn filling the **right** of the frame, the Village Well the left, the gate arch behind them, the Kingsway running away north. **The door bubble is not showing on the first frame.**
2. Walking west into the plaza arms the bubble; walking back to the road disarms it. No flicker at the boundary.
3. The Tavern reads as the biggest built mass in the world after the keep, and its lit windows read as lit in both palettes.
4. The Keep door arms immediately after the crown ceremony ends, with the hero standing in the forecourt.
5. The Library door appears on the first visit after the Library is raised, and `/spellbook` returns without re-rasterising (slice 2's warm cache).
6. `Go in` lands on `/tavern` with the Realm card above the fold, and the Tavern Board beside it on a multi-hero family.
7. The first paint cost of the added `landmark:tavern` kind, measured cold and warm, against the §3.11 estimate.
8. The whole flow once on touch and once on keyboard, since the prompt strings and the 56px target differ.

Unit tests cannot judge whether the Tavern looks like an inn or whether the plaza feels like the mouth of a town. The browser pass is the acceptance gate.

---

## 8. Interfaces

### Produces

**`src/lib/realm/doors.ts`**
- `type DoorId = "tavern" | "keep" | "library"`
- `type DoorAction = { kind: "panel"; panel: "tavern" | "kingdom" } | { kind: "navigate"; href: string }`
- `type Door = { id: DoorId; position: Vec2; radius: number; label: string; prompt: string; promptTouch: string; aloud: string; aloudTouch: string; action: DoorAction }`
- `type DoorSite = { position: Vec2; size: { w: number; d: number } }`
- `const DOOR_CLEARANCE = 1.4`
- `const DOOR_RADIUS: Record<DoorId, number>` — `{ tavern: 2.0, keep: 2.4, library: 2.0 }`
- `const DOOR_COPY: Record<DoorId, Pick<Door, "label" | "prompt" | "promptTouch" | "aloud" | "aloudTouch">>`
- `function doorsFor(input: { tavern: DoorSite; keep: DoorSite; library: DoorSite | null }): Door[]`
- `function doorById(doors: readonly Door[], id: string): Door | null`

**`src/lib/realm/reach.ts`**
- `const REACH = 2.5` (moved from `villagers.ts`, re-exported there)
- `type Interactable = { kind: "villager"; id: string; position: Vec2; distance: number } | { kind: "door"; id: DoorId; position: Vec2; distance: number; door: Door }`
- `function nearestInteractable(hero: Vec2, villagers: readonly { id: string; position: Vec2 }[], doors: readonly Door[]): Interactable | null`
- `function reachKey(i: Interactable | null): string | null` — `"villager:{id}"` / `"door:{id}"`
- `function parseReachKey(key: string | null): { kind: "villager" | "door"; id: string } | null`
- `function nearestVillager(hero: Vec2, villagers: readonly { id: string; position: Vec2 }[]): string | null` (moved, behaviour identical)

**`src/lib/realm/tavern-board.ts`**
- `type RaisingRow = { childId: string; liveName: string | null; raisedByName?: string | null; buildingId: string; deedsDone: number; completedAt: Date | null; updatedAt: Date }`
- `type Raising = { key: string; childName: string; buildingLabel: string; whenLabel: string; self: boolean; raisedAt: Date }`
- `function whenLabel(raisedAt: Date, now: Date): string`
- `function raisingSentence(r: Raising): string`
- `function recentRaisings(rows: readonly RaisingRow[], now: Date, opts?: { limit?: number; viewerChildId?: string | null }): Raising[]`

**`src/lib/realm/layout.ts`**
- `WorldLayout` gains `doors: Door[]`
- `PropKind` gains `"landmark"` — the **full accumulated union** after this slice is `"castle" | "building" | "foundation" | "path" | "villager" | "barrier" | "banner" | "water" | "scenery" | "sign" | "landmark"` (slice 7 appends `"hitch"`)
- One `FIGURE_CATALOG` row, `landmark:tavern`, registered via `registerFigures`. **No `spriteSizeFor` case.**
- `BUILDING_SLOTS.tavern` / `BUILDING_FOOTPRINTS.tavern` are **consumed** (slice 4 owns both)

**`src/lib/realm/play-clock.ts`**
- **Nothing.** `partialMinuteCharge` and `flushOnExit` are deleted from this spec; slice 1's `minutesToSettle` and `flushPending` are the whole rule (§3.9).

**`src/components/realm/use-play-clock.ts`**
- the hook's return is **unchanged**; the exits call the existing `flushPending`.

**`src/lib/actions/realm.ts`**
- `type RealmAssignment = { id: string; title: string; subject: string; color: string | null; status: "pending" | "completed" | "skipped" | "stuck" }`
- `RealmBundle` gains `assignments: RealmAssignment[]`, `assignmentsDate: string`, `assignmentsError?: string`
- `RealmBundle.spellbook` gains `level: number`
- `RealmBundle.settings` gains `accessMode: "earned" | "scheduled" | "both"`, `earnedMinutesPerQuest: number`, `dailyCapMinutes: number`
- `async function getRealmAssignments(childId: string, date: string): Promise<RealmAssignment[]>`

**`src/lib/actions/tavern-board.ts`**
- `async function getTavernBoard(viewerChildId: string, limit?: number): Promise<{ raisings: Raising[]; heroCount: number; error?: string }>`

**Components**
- `src/components/realm/door-panel.tsx` → `DoorPanel({ door, assignments, assignmentsDate, assignmentsError, clientDate, minutesRemaining, settings, surfaces, profile, isChildView, childId, onRetryAssignments, onLeave, onClose })`
- `src/components/realm/kingdom-panel.tsx` → `KingdomPanel({ heroName, buildings, banners, wornCrown, surfaces, onLeave, onClose })`, with a per-row optional `raisedBy?: { name: string | null; season: string | null } | null` that is `null` in this slice
- `src/app/(app)/tavern/realm-card.tsx` → `RealmCard({ childId, childName, isChildView, built, total, objective, accessMode, enabled })`
- `src/app/(app)/tavern/tavern-board-card.tsx` → `TavernBoardCard({ raisings, heroCount })`

**Scene props**
- `RealmSceneProps` gains `onDoor: (doorId: string) => void`
- `RealmSceneProps.reachId` remains `string | null` and now carries a namespaced reach key

**Sprite keys**
- `textures.world["landmark:tavern"]`, sourced from `svg[data-figure="landmark"][data-figure-id="tavern"]`
- `LANDMARK_KINDS = ["tavern"] as const` — a module constant in `sprite-source.tsx`, so `world` stays referentially stable

**Routes**
- No new routes. Navigations added: `/spellbook` (Library door), `/quests` (Tavern panel, full depth), `/tavern` and `/tavern?child={childId}` (the exit)

**CSS classes**
- `.realm-bubble--door`, `.realm-bubble-talk--door`
- `.realm-door-panel`, `.realm-door-panel-quests`, `.realm-door-quest`, `.realm-door-quest-subject`, `.realm-door-quest-status`, `.realm-door-warn`
- `.realm-kingdom-panel`, `.realm-kingdom-summary`, `.realm-kingdom-pips`, `.realm-kingdom-pip`, `.realm-kingdom-pip--filled`, `.realm-kingdom-banners`, `.realm-kingdom-banner`, `.realm-kingdom-rows`, `.realm-kingdom-row`, `.realm-kingdom-row--built`
- `.realm-hud-exit` (failsafe only)
- `.tavern-realm-card`, `.tavern-realm-pips`, `.tavern-realm-pip`, `.tavern-realm-pip--filled`, `.tavern-board`, `.tavern-board-item`, `.tavern-board-when`, `.hud-row-realm`
- **Deleted:** `.realm-hud-leave`

**Sound cue ids reserved for slice 9**
- `doorReach`, `doorOpen`, `doorExit` — camelCase, matching slice 9's `CueId` union, which carries all three with authored tone rows.

### Consumes

**From slice 1 `first-impression`**
- `surfacesFor(depth, profile)` and `Surfaces` from `src/lib/realm/depth.ts`; this slice reads exactly one field, **`listRows: number`**, which slice 1's closed thirteen-field table already publishes. This slice adds nothing to `depth.ts`.
- `rankedBuildings<T extends { done: number; complete: boolean }>(bs: readonly T[]): T[]` from `src/lib/realm/objective.ts`, so the Kingdom panel's row order and the Side Quests page can never disagree. If slice 1 ships only `pickObjective`, this slice adds `rankedBuildings` to the same module and test.
- `clock.flushPending()` on unmount. This slice adds no exit path that bypasses it.
- The centred message lane, for the door reach notice.

**From slice 3 `ability-bar-and-mount-slot`**
- `--realm-hud-scale` on `.realm-root`, used to size the door bubble.
- The permanent Spellbook button, which is what makes the Library door a second route rather than the only one.

**From slice 4 `village-ground`**
- `village.ts`, against its frozen §8.1 contract: `DISTRICTS` / `DistrictId` (the Tavern stands in `gate-quarter`), `BUILDING_SLOTS` and `BUILDING_FOOTPRINTS` (nine plots — slice 4 sites `tavern`), `SITE_DOORS` and `doorPointFor(id)`, `routeBetween(from: Vec2, to: Vec2)` (the point-to-point router; `roadPath` takes node ids and this slice never calls it), `roadCorridorContains(p, margin?)` (there is no `roadCorridors()`), `KEEP_PRECINCT`, `WORLD_SIZE` 64 and `SPAWN` `(0, 26.5)`.
- `open-ground.ts`: `SPAWN_ZONES`, from which this slice subtracts the Tavern plot and excludes the gate apron.
- `unstickHero(state, colliders, rescue?)` — the multi-pass resolver landed in **slice 3** and the road-node rescue list in slice 4. There is no conditional fix here; this slice contributes the Tavern case to `movement.test.ts` and nothing else.

**From slice 5 `village-life`**
- The `"landmark"` prop render path and the warm palette the Tavern is painted in.

**Unchanged from the existing codebase**
- `BUILDINGS` and `buildingProgress` (`src/lib/utils/kingdom.ts`)
- `BuildingOverview` (`src/lib/services/deeds.ts`)
- `gateCopy` (`src/lib/realm/play-clock.ts`) — called, not retyped
- `seasonLabel`, `crownForOrdinal`, `crownById`
- `requireFamilyReadAccess`, `getActor`, `getActiveFamilyId`, `accessibleChildren`
- `getAssignmentsForDate` (`src/lib/actions/quest-assignments.ts`)
- `SIDE_QUEST`, `SIDE_QUESTS_LOWER` (`src/lib/utils/side-quest-copy.ts`) — "deed" in code, "side quest" on screen
- `.realm-overlay` / `.realm-panel` chrome and `SiteCard`'s Escape and Tab handling

**For slice 13 `record-of-the-work`**
- `recentRaisings` already takes `raisedByName`; slice 13 fills it and the board applies `raisedByName ?? liveName` with no rewrite.
- `KingdomPanel`'s row `raisedBy` prop is already threaded and `null`; slice 13 fills it and the row renders `Raised by {name} · {season}` with the stated degradation.

---

## 9. Out of scope

- **The Tavern's finished art.** This slice ships a working two-storey figure at slice 2's scale ladder. The 3/4-isometric redraw with a roof plane, a lit face and a shaded face is **slice 11 `building-redraw`**.
- **A hanging sign as a separate readable object, and district signs.** The sign is drawn inside the Tavern's own SVG here. Signs as world objects, and deleting the nine floating DOM label pills that the Tavern's `PropLabel` currently joins, are **slice 10 `plots-signs-and-the-keep`**.
- **The keep's growing silhouette.** The Kingdom panel reads `bundle.castleType` today. Driving the keep off kingdom progress, with the cosmetic `CASTLE_TYPES` ladder preserved as a skin, is **slice 10**.
- **Per-side-quest completion marks**, which are what would let a Kingdom row truthfully say "Next: …". `BuildingOverview.deeds` has no completion flag and adding one is a query change on `loadKingdomOverview` — **slice 13 `record-of-the-work`**.
- **Attribution on the Kingdom rows and the Tavern board.** The interfaces are stated in §8 so slice 13 fills holes rather than rewriting; the stamping itself is **slice 13**.
- **Fast travel to a door.** The door list is the destination list, and riding to it is **slice 7 `fast-travel-and-the-companion`**.
- **A pause or main menu — refused for the whole programme, not deferred.** Three specs handed this to each other (slice 1 → slice 6, slice 3 → slice 6, slice 6 → slice 9), which is how a gap stays open, so the ruling is made here:

  **There is no menu, and there does not need to be one, because the two things a menu would do are already done by something better.**

  1. **"Let me out"** is the Tavern door and the Keep door's exit. A door in the world is a better answer than a menu for a six-year-old, and it is the whole point of this slice.
  2. **"Stop the clock"** already happens where it matters: `paused` is true while the **deed panel** is open (`realm-shell.tsx`), so a child doing real schoolwork inside the Realm is not charged for it — and that is the only interruption the metered clock has a duty to forgive. Reading the Tavern panel's quest list, walking about, or standing still are all *playing*, and charging for them is correct. A pause button that stopped the clock for standing still would turn a five-minute grant into an unbounded one, which is the exploit slice 1's `minutesToSettle` exists to close.

  **The key budget is the second reason and it is real**: Escape is double-bound already (spell deselect at `spell-bar.tsx:62`, ceremony skip at `realm-shell.tsx:330`), so a menu would need a third meaning on the one key a child already presses to get out of things. Freeing it would mean moving ceremony-skip, which is a change to the season's payoff moment for the sake of a menu nobody has asked for.

  If a future programme wants one, the prerequisite is stated: move ceremony-skip off Escape first.
- **Persisting the partial minute across visits.** The 30-second rounding rule (D6.9) is the answer; a resume path would need a column and is not worth a migration.
- **Recess gleams and lap times surviving the visit** — **slice 12 `recess-that-counts`**. This slice only guarantees the lap ring clears the gate apron.
- **Clearing troubles earning minutes** — **slice 8 `troubles-that-read-and-pay`**. The Tavern panel's earning line says quests, because today quests are the only door into the economy; slice 8 owns rewriting it.
- **The `ParentDashboard` view** (a parent with no hero selected, `tavern/page.tsx:83-85`). The Realm card and the board appear on a hero's Tavern page and on a parent's per-hero Tavern page. A family-wide roll-up for the dashboard is a separate, larger design.
- **Visitable sibling realms.** Refused by decision 8, permanently, not deferred.
- **The session summary.** `Go in` ends the visit; **slice 13 turns that same button into the summary trigger** rather than rewiring a link this slice deleted. Concretely, in slice 13 the handler becomes: await `clock.flushPending()` capped at 1500 ms via `Promise.race`, swap the panel in place to the summary phase, and let the summary's own `Back to the Tavern →` perform the `router.push("/tavern")`. `Going in ends your visit here. Come back any time you have minutes left.` stays true — the visit does end at that button; the summary is what the ending looks like. **Slice 13 must not rewire `realm-hud.tsx:96`'s `<Link>`, which this slice deletes.** → **slice 13 (`record-of-the-work`) §3.9**.
- **Rewriting the Tavern panel's earning line.** `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here, up to {dailyCapMinutes} a day.` becomes false the moment clearing troubles also pays. **Slice 8 owns the rewrite**, for all three access modes and for the case where the bounty sub-cap is already spent, and slice 8 §3.11 carries the replacement strings verbatim. → **slice 8 (`troubles-that-read-and-pay`)**.

### The app chrome over the portal — found here, owned by slice 1

The audit's finding is real:

> `.floating-dock` is `z-index: 50` (globals.css:403) vs `.realm-root` at 45 (globals.css:1702), and switch-hero.tsx:37/59 uses that class. So the one piece of app chrome that punches through the portal is the log-out control, sitting bottom-right near the spell bar where a child will hit it. … The quest-timer and schedule-notification popups also punch through at z-50.

An earlier draft of this spec flagged it and declined it. That was wrong: this slice deletes the one legitimate navigation link in the HUD, which makes the dangling sign-out pill *more* conspicuous, not less, and leaves a hole nobody has to close.

**It is now slice 1's, in full** — see first-impression §3.20. Slice 1 raises `.realm-root` to `z-index: 60`, suppresses `.floating-dock`, `.quest-timer-popup` and `.schedule-notification-popup` with one `body:has(.realm-root)` rule, re-admits the quest timer deliberately as a `.realm-hud-chip` in the HUD's meta zone (with its own copy and its own message-lane escalation), and moves the hero switcher into the parent-preview header. Slice 1 is the right owner because it is already rebuilding the HUD zones and already editing `globals.css:1702-1710`, and because the popups fire unprompted on a metered clock and should not wait six slices.

**What this slice depends on as a result:** by the time the Tavern door is the only way out, `.realm-hud-leave` is gone *and* the sign-out pill beside the ability bar is gone. Both halves have to be true, or deleting the link makes the screen worse.
