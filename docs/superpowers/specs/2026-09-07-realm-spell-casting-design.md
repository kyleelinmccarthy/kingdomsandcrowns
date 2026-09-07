# Realm: Spell Casting — Design

**Date:** 2026-09-07
**Slice:** 5b of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1–5, in particular `2026-09-02-realm-spellbook-design.md` for the cast contract and `2026-09-04-realm-shell-design.md` / `2026-09-06-realm-deeds-in-realm-design.md` for the world)
**Status:** approved in conversation; spec for the implementation plan

## Goal

Let the hero cast the pages of their spellbook inside the Realm. Spells are only the resolved
mix-and-match combos the spellbook already stores (element, form, modifier); nothing is generated.
Casting has a purpose: gentle "troubles" drift near the unfinished kingdom sites and clear when hit.
The parent's monsters toggle reskins the same troubles as cartoon monsters. Nothing is rewarded or
written to the server in this slice; a clear tally is kept in the session so rewards can attach later.

Out of scope: rewards or ledger writes for clears, new spell parts, mounts, recess changes, monsters
as anything other than a skin, hero health or death of any kind.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Purpose | Troubles near the sites that clear when hit; tally only, no rewards yet. |
| Input | Pick a page (tap or keys 1–9), then tap where it goes; self spells cast immediately; Space fires at the nearest trouble in range. |
| Architecture | Pure simulation in `src/lib/realm/spells/`, stepped in the scene's frame loop from refs; the scene only draws. |
| Consequence | A blob reaching an unshielded hero causes "lost focus": a 1.5 s dazzle, the blob retreats. No damage, no loss. |
| Server | Read-only: the bundle carries the spellbook pages; no writes. |

## A. Troubles (`src/lib/realm/spells/troubles.ts`)

```ts
export type TroubleKind = "fog" | "cursed-stone" | "shadow-blob";
export type Trouble = {
  id: string; kind: TroubleKind; position: Vec2; hitsLeft: number;
  statuses: { kind: StatusKind; until: number }[]; // ms timestamps in the simulation clock
  spawnedAt: number;
};
export type TroubleCopy = { gentle: string; monsters: string; gentleName: string; monstersName: string; spriteGentle: string; spriteMonsters: string };
export const TROUBLE_COPY: Record<TroubleKind, TroubleCopy>;
```

| kind | hits | speed (u/s) | behaviour | gentle clear copy | monsters clear copy | gentle / monsters name |
|---|---|---|---|---|---|---|
| fog | 1 | 0.6 | drifts on a slow random walk within 3 units of its spawn | "The fog thins." | "The mist-wisp scatters!" | Fog / Mist-wisp |
| cursed-stone | 2 | 0 | stationary | "The stone's curse lifts." | "The gargoyle crumbles!" | Cursed stone / Gargoyle |
| shadow-blob | 1 | 1.8 | wanders; within 6 units of the hero it approaches | "The shadow slips away." | "The blob bounces off!" | Shadow / Blob |

- **Spawning** `spawnTroubles(input: { seed: number; now: number; layout: WorldLayout; troubles: Trouble[]; lowStimulus: boolean }): Trouble[]` keeps at most `MAX_TROUBLES = 6` (`3` under `lowStimulus`) alive. Each incomplete site (a `foundation` prop) attracts one trouble at a seeded position 3–5 units from its slot, never inside a collider, never within 1.5 units of a villager or the path tiles, and never within 4 units of spawn. Complete sites attract none. Kinds rotate by site index (fog, stone, blob, …). A cleared trouble's site respawns one after `RESPAWN_MS = 20_000` of simulation time. Random numbers come from `seededRng` (mulberry32) in `@/lib/utils/drill-generators`, seeded per site and spawn count, so tests are deterministic.
- **Stepping** `stepTroubles(troubles, hero: Vec2, dt, colliders, opts: { now; lowStimulus; reducedMotion; shielded: boolean }): { troubles; focusLost: boolean }`. Fog drift is off under `reducedMotion`. Blob approach is off under `lowStimulus`. Statuses: `chilled` halves speed, `slowed` multiplies by 0.4, `bound` freezes; expired statuses are dropped. A blob within `HERO_RADIUS + 0.5` of an unshielded hero reports `focusLost: true` once and is pushed 4 units away along its approach vector; during the hero's dazzle (1.5 s) it does not re-trigger.
- **Hits** `hitTrouble(trouble, point: Vec2, radius: number): boolean` (circle test, trouble radius 0.7). `applyHit(trouble, spell: SpellDefinition, now): { trouble; cleared: boolean }` decrements `hitsLeft`, appends the spell's statuses with `until = now + durationMs` (`durationMs: 0` statuses are not stored on troubles), reports `cleared` when `hitsLeft` reaches 0.
- **Tally** `ClearTally = { session: number; byKind: Record<TroubleKind, number> }`, `recordClear(tally, kind)`.

## B. Mana, casting, effects (`src/lib/realm/spells/`)

### Mana (`mana.ts`)
`MANA_MAX = 100`, `MANA_REGEN_PER_S = 5`, `startMana()`, `stepMana(mana, dt)` (clamped), `canCast(mana, spell)`, `spend(mana, spell)`, `refund(mana, spell)` (mend, clamped to max).

### Caster (`caster.ts`)
```ts
export type CastTarget = Vec2;
export type CasterState = { selectedSlot: number | null; casting: { spell: SpellDefinition; slot: number; target: CastTarget; startedAt: number; releaseAt: number } | null };
export function selectSlot(state, slot: number | null): CasterState;
export function beginCast(state, spell, hero: Vec2, target: CastTarget, mana, now): { state; mana; refused: "mana" | "busy" | null };
export function stepCaster(state, now): { state; released: { spell; slot; target } | null };
```
`beginCast` refuses with `"busy"` while a cast is in flight and `"mana"` when `canCast` fails; otherwise spends mana and sets `releaseAt = now + castMs` (quicken is already halved in `castMs`). For `area` and `barrier` shapes the target is clamped to `range` from the hero; for `self` shapes the target is the hero; for `beam` the target is the hero plus the unit direction times `range`. The hero cannot walk while casting (`castMs` is at most 900 ms).

### Effects (`effects.ts`)
```ts
export type SpellEffect =
  | { kind: "projectile"; id; spell; position: Vec2; velocity: Vec2; travelled: number; bounced: boolean; radius: number }
  | { kind: "area"; id; spell; position: Vec2; radius: number; until: number; hit: Set<string> }
  | { kind: "beam"; id; spell; from: Vec2; to: Vec2; until: number; nextHitAt: number }
  | { kind: "barrier"; id; spell; a: Vec2; b: Vec2; until: number }
  | { kind: "self"; id; spell; until: number; nextHitAt: number } // shield: no hits; aura: pulses
  | { kind: "summon"; id; spell; position: Vec2; until: number; nextShotAt: number };
export function releaseEffect(spell, hero: Vec2, target: CastTarget, now, id): SpellEffect;
export function stepEffects(effects, troubles, hero, colliders, dt, now): { effects; hits: { effectId; troubleId; spell }[]; spawned: SpellEffect[] };
export function barrierColliders(effects): Prop[]; // walls as thin solid props for blobs only
export function heroShielded(effects, now): boolean;
```
Rules (units are world units, times in ms):
- **projectile**: moves at `spell.speed`; dies when `travelled > spell.range` or on hit. Hit radius 0.6, doubled linearly over the flight under `grown`. `seeking` steers up to 90°/s toward the nearest trouble within 3 units. `bounce` reflects once off a collider (axis reflect on the face hit) instead of dying.
- **area**: at the clamped target, radius 2 (3 under `grown`), hits each trouble once, lives 400 ms.
- **beam**: segment from the hero of length `range`; every 200 ms hits the nearest trouble within 0.8 units of the segment; lives 600 ms.
- **barrier**: a 4-unit segment centred on the target, perpendicular to the cast direction, lives 6000 ms; `barrierColliders` turns it into a `Prop` of size `{ w: 4 or 0.4 by orientation, d: 0.4 or 4, h: 1.2 }` used only by `stepTroubles` (the hero walks through walls).
- **self**: shield → `heroShielded` true for 5000 ms; aura → every 500 ms hits every trouble within `range` (5) for 3000 ms.
- **summon**: a sprite following 1.2 units behind the hero for 8000 ms; every 1500 ms fires a mini projectile (speed 10, range 4, no modifier) at the nearest trouble within 4 units.
- **mend**: on any hit by a spell with `mended`, `refund` the caster.

### Focus
`FocusState = { dazzledUntil: number }`; `stepFocus(state, focusLost, now)` sets `dazzledUntil = now + 1500` and the shell shows "You lost focus for a moment." for that duration; movement input is ignored while dazzled.

## C. Scene, HUD, input, data

### Data
`RealmBundle.spellbook: { spells: SpellRecord[]; slots: number }`, loaded by a new `loadSpellbookPages(childId)` in `src/lib/services/spells.ts` (the existing `getSpellbook` action delegates to it for its `spells`/`slots`; unlock logic stays in the action). Pages resolve client-side with `resolveSpell`; a page that fails to resolve is shown faded with the title "This page is faded." and cannot be selected.

### Spell bar (`src/components/realm/spell-bar.tsx`)
A DOM row at the bottom centre of `.realm-root` (`.realm-spellbar`, above the stick): one 44 px button per page showing a swatch in the element colour, the form icon, the page name (`adjective noun`), and the mana cost when selected. Keys 1–9 select the page at that index (0-based slot + 1); tapping the selected page or pressing Escape deselects; pages the hero cannot afford are dimmed but selectable. `fewerChoices` shows only the first four pages. Hidden while a deed panel is open and in the parent preview.

### Input
`useRealmInput` gains `castRequest: RefObject<{ target: Vec2 } | { nearest: true } | null>` set by the scene's ground/trouble tap when a page is selected (the scene knows the selection through a `selectedSlot` prop) and by Space (`{ nearest: true }`). Taps with no page selected keep walking. The scene consumes and clears the request each frame.

### Scene
`SpellLayer` inside `World`: refs for mana, caster, effects, troubles, focus, tally; stepped in `useFrame` after the hero step, frozen while `!interactive`. Draws: troubles as billboards from a new `TroubleFigure` SVG set (six small figures: three gentle, three monster; rasterised through the sprite pipeline with keys `trouble:{kind}:{skin}`), projectiles as spheres (radius 0.3, element colour, emissive), bursts as flat rings, beams and walls as thin boxes, self spells as a translucent ring at the hero's feet, the summon as a small sprite, and a 12-particle instanced burst on each hit (off under `reducedMotion`). Calm palette desaturates element colours by 40 percent. Discrete events (clear copy, tally, mana refused, focus lost, cast state) reach React through `queueMicrotask` callbacks, never `setState` in the frame loop.

### HUD
Mana bar with number (heroes only), "Cleared: N", the clear copy line for 2 s after each clear, "Not enough mana yet." for 1.5 s on refusal, "You lost focus for a moment." while dazzled. Monsters tone uses the monsters copy and names; the villager greetings and deed stories are unchanged.

### Pause and preview
Casting, mana regen, effects, and troubles freeze while a deed panel is open. Parents see troubles drift and have no spell bar; they cannot cast.

### Copy (verbatim)
Trouble clear lines and names from section A; "This page is faded."; "Not enough mana yet."; "You lost focus for a moment."; "Cleared: {n}"; mana label "Mana".

## D. Testing
- `troubles.test.ts`: spawn caps (6 / 3), placement constraints, kind rotation, respawn timing, drift off under reduced motion, blob approach and its off switch, statuses (chilled, slowed, bound, expiry), hit circle, `applyHit` and clear, focus-lost push-back and no re-trigger while dazzled, tally.
- `mana.test.ts`, `caster.test.ts` (refusals, release timing with quicken, target clamping per shape).
- `effects.test.ts`: one seeded scenario per shape; seek, bounce, grow, mend refund, barrier blocking only troubles, shield immunity, summon cadence, `stepEffects` expiry.
- `spell-bar.test.tsx`: renders pages, key selection, deselect, fewer choices, faded page unselectable, dimmed when unaffordable.
- `realm-hud.test.tsx`: mana bar, cleared count, clear copy, refusal copy.
- `realm-shell.test.tsx`: bar hidden while a panel is open and in preview; Space with a page selected produces a cast request (scene mocked).
- Final headless pass: hero with minutes casts a bolt at fog near the well; "The fog thins." and "Cleared: 1" appear; monsters tone shows the mist-wisp copy after toggling `toneMode` for the demo hero (temporary settings row).

## E. Plan shape
1. Troubles module (pure, tests first).
2. Mana, caster, effects, focus (pure).
3. Spellbook service + bundle field; trouble figures + sprite pipeline keys.
4. Spell bar + HUD additions + input cast request.
5. Scene `SpellLayer` + shell wiring (selection, pause, preview, events).
6. Final verification and browser pass.
