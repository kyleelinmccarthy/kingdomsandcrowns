# Enemies you can read, and combat that pays

**Date:** 2026-09-10
**Status:** Design spec. Written up front per decision 1; the implementation plan (with file:line citations) is written at build time, immediately before this slice starts.
**Programme:** *The Realm: Presentation Overhaul* — `docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`, revised by the user's nine decisions. This is **slice 8 of 13**, `troubles-that-read-and-pay`, effort **large**.
**Depends on:** `sprite-budget-and-gallery` (2) — raster scale, the warm cache, the parallelised awaits, the `/dev/figures` gallery; `village-ground` (4) — `SPAWN_ZONES`, `open-ground.ts`, the road graph, the 64-unit world; `ability-bar-and-mount-slot` (3) — the fixed-shape slots and the mana strip the cast wind-up reads back to. Also consumes `first-impression` (1) transitively for the centred message lane, the hero identity plate, the depth contract and `layout.focus`.
**Consumed by:** `sound-and-first-five-minutes` (9) — the tutorial's "meet one trouble → cast" steps and the cue table's `impact`, `clear`, `dazzle` events; `record-of-the-work` (13) — the day's cleared tally and the bonus rows in the session report.
**Decisions applied:** D3 (combat stakes — clearing earns minutes, never gates a quest, and the help card's false promise is finally replaced with a true one), D2 (full village — zone-based spawning is objection (a) landing where it is actually consumed), D7 (complexity axis — trouble names and clear counts are a full-depth surface; at simple depth a child sees the face and the reward, not a tally).

---

## 1. Why — the complaints and the audit findings this answers

The user's verdict, verbatim, in the two clauses this slice owns:

> its not clear that the clouds are enemies

> this doesnt feel like a well thought out game at all

> i dont like the location of the mana or player name/health

The audit's Enemies-and-combat cluster, quoted from Appendix A of the brief.

**On the figures.**

> The gentle skin is defined by DELETING the only thing that says "creature": the face. […] Fog (gentle) is three grey ellipses, fill `#cbd5e1` at 0.85 opacity, no eyes, no mouth, no outline, no ground shadow — a weather sprite. […] On top of that, SpellLayer draws them floating at y=0.9 with no cast shadow (spell-layer.tsx:63), so the fog literally hangs in the air like sky. The user did not misread the screen; the screen is drawing weather.

And its own scope correction, which this spec adopts:

> The gentle cursed stone is nearly the same object as the decorative rock: enemy fill `#6b7280` (trouble-figures.tsx:27) vs decor rock `#7d7d7d`/`#9a9aa8` […] The enemy is bigger (1.4x1.8 world units vs 0.9x0.9 for decor) and floats at y=0.9 — so it is a hovering rock, which is confusing rather than threatening.

Verified against the source before writing this spec: `Shadow()` (trouble-figures.tsx:45-53) already carries two `#c7d2fe` eyes; `CursedStone()` (:24-32) already carries two `#7c3aed` cracks. **Only `Fog()` (:5-13) is genuinely featureless**, and Fog is the shape in the user's screenshot. This is one redraw plus a shared treatment, not three.

**On the naming, which is inverted today.**

> Every other object in the world carries a floating name label — the castle, every building, every foundation (realm-scene.tsx:287, :311, :323 render PropLabel for all prop kinds except decor and barrier). Troubles are the ONLY things on screen with no label. So the labelled objects are the harmless scenery and the unlabelled objects are the enemies — exactly backwards. Worse, the names already exist and are dead code: TROUBLE_COPY carries gentleName/monstersName […] and a grep shows those two fields are never read anywhere outside their own definition.

**On the real bug.**

> SpellLayer maps pooled sprite index i to sim.troubles[i] (spell-layer.tsx:47-53), and use-spell-sim.ts:103 removes a cleared trouble with `troubles.filter((_, i) => i !== index)`, shifting every later element down one. Clearing the trouble at index 0 while others are alive makes pooled sprite 0 instantly adopt the position AND texture of the trouble that was at index 1 — an enemy teleports across the map and may visibly change species — while the last sprite blinks off. So killing one enemy scrambles the others on screen. spawnTroubles preserves order (troubles.ts:84, then pushes new ones at the end), so this fires on essentially every kill with 2+ enemies alive.

**On hitting and dying.**

> There is no hit reaction anywhere in the pipeline. applyHit only decrements hitsLeft and appends statuses — it records no hurt timestamp, no flash state, no knockback (troubles.ts:184-188). […] Hitting a cursed stone (2 HP) for the first time changes literally nothing on screen.

> Death is a one-frame disappearance. […] The ONLY particle in the game is the burst in spell-layer.tsx:115-143, and it is not tied to a kill at all: it fires whenever a projectile or area effect vanished, and a projectile vanishes identically whether it hit a trouble (effects.ts:146-150), ran out of range (effects.ts:151), or hit a wall (effects.ts:152-162). […] So the same 12-particle puff plays on a hit, on a miss, and on a wall — the game's one piece of combat feedback carries zero information. It is also gated on `motion` (spell-layer.tsx:115), so with reduced motion on, hitting and killing are 100% invisible.

> Only projectile and area effects are ever recorded in lastVanished (use-spell-sim.ts:87-91). Beam, self/aura, shield, summon and summon shots therefore produce no burst and, since troubles have no hit reaction at all, produce no visual whatsoever when they connect.

**On the three moments that read as the game freezing.**

> beginCast stores a Casting with releaseAt = now + spell.castMs (caster.ts:42-51) — 300ms for Bolt, up to 900ms for Sprite […] and during that window realm-scene.tsx:148-154 freezes the hero […] So pressing cast = the character stops dead for up to a second, then a ball appears from nowhere. That reads as input lag, not as charging a spell.

> On blob contact (troubles.ts:169-173) the BLOB is pushed 4 units away instantly — a teleport, PUSHBACK = 4 applied in one frame — and the hero is dazzled for DAZZLE_MS = 1500 (focus.ts:1-11). […] So from the child's seat: a blob touches you, it vanishes 4 units away, and your controls die for a second and a half with no flash, no hero hurt sprite, no vignette, no shake, no sound — just a small left-aligned line of text […] That reads as the game freezing, not as being hit.

> spawnTroubles […] never considers where the HERO currently is (troubles.ts:91-99). So an enemy can materialise a couple of units from the player. And it materialises instantly: SpellLayer sets sprite.visible = !!tex with no fade or scale-in.

**On four of the six things on screen being furniture.**

> SPEED = { fog: 0.6, "cursed-stone": 0, "shadow-blob": 1.8 } (troubles.ts:40): the stone never moves at all, and the fog only wanders within WANDER = 3 units of its spawn origin […] so it can never reach the player. Only the shadow-blob approaches, and only within BLOB_SENSE = 6 and only when lowStimulus is off (troubles.ts:160). Kind is assigned by site index % 3 (troubles.ts:100) with cap 6, so at most TWO blobs exist at once — i.e. 4 of the 6 things on screen are inert props by design. There is also no aggro tell […] The player's evidence that these are enemies is: nothing.

> Low-stimulus / calm mode makes the ONLY active enemy passive: the blob's chase is skipped when lowStimulus is true (troubles.ts:160), and the cap drops to 3 (LOW_STIMULUS_MAX). Calm mode is six inert props. Reduced motion additionally freezes the fog entirely (troubles.ts:163).

**On the stated purpose of combat being fiction — the finding this slice's whole second half exists to answer.**

> "Cleared" means nothing to a player and the game can't tell them otherwise. The clear tally computes byKind counts (troubles.ts:190-198) that a grep shows are never read anywhere. The session count feeds one small green pill in the HUD row (realm-hud.tsx:69) and is never persisted — realm-play has no action for clears at all, so it resets to 0 every visit. Cleared sites respawn every 20s forever (troubles.ts:32, :88-89) so the count is unbounded and unearned. Nothing is dropped, no mana returned, no quest progress […] And the help card promises "Clear troubles to protect the sites" (realm-help.tsx:26-27) while nothing in the codebase lets a trouble harm a site, a building, or the kingdom — the only consequence a trouble can produce is focusLost (troubles.ts:172). **The stated purpose of combat is fiction.**

And the user's answer to Q5, which is decision 3: clearing troubles **earns Realm minutes**. It must never gate a side quest and never stand between a child and their schoolwork.

**On the silent deletions.**

> spawnTroubles keeps only troubles whose siteId still matches a foundation prop (troubles.ts:81-84), so the moment a deed completes a building the trouble standing at that site blinks out of existence mid-screen with no clear event, no particle, no notice.

**On hero health, which the user asked about and which does not exist.**

> Any hero health. There is no HP, no hearts, no damage — the only consequence of contact is a 1500ms dazzle (focus.ts). The user's phrase "player name/health" refers to something that does not exist.

---

## 2. Decisions — what this slice settles

| # | Question | Decision | Why |
|---|---|---|---|
| D8.1 | How many figures get redrawn? | **One** (gentle `Fog`), plus a shared treatment applied to all six figures (three kinds × two skins). | Verified against source: Shadow has eyes, CursedStone has violet cracks. Only Fog is blank, and Fog is what the user photographed. |
| D8.2 | What makes a trouble legible? | One rule, learned once: **violet + a face + a nameplate = zap it.** `#a78bfa` / `#7c3aed` are reserved and appear nowhere in the environment palette. | Grey is the decor rock at `#7d7d7d`, white is the grass flower, green is the bush. The enemy cannot own a colour the scenery already owns. |
| D8.3 | Nameplates: DOM or canvas? | **Canvas-texture sprites**, rasterised once per kind per skin at `SpriteSource` time. | Six live troubles as drei `<Html>` adds six DOM nodes to the frame loop and reintroduces exactly the pointer-events problem slice 1 fixed. |
| D8.4 | How do pooled sprites bind to troubles? | By **trouble id**, through a `Map<string, number>` free-list in a ref. Slots release only after the death beat ends. | The index binding is a real, visible bug: every kill with 2+ alive teleports the survivors and can change their species mid-frame. |
| D8.5 | What is enemy health? | `hitsLeft`/`maxHits` become visible two ways: a **cracked second texture** for any kind with `maxHits > 1`, and a **pip row on the nameplate** at full depth only. 1-hit kinds show neither. | Only the cursed stone has 2 HP. A bar over a 1-hit enemy is noise. |
| D8.6 | Where does combat feedback come from? | From **`stepEffects`' hits**, every frame, at the real hit point. `lastVanished` is deleted; projectile expiry becomes a separate, dim, grey `fizzle`. | One change fixes three bugs: the burst-on-miss, the silence of beam/aura/summon, and the burst that carries zero information. |
| D8.7 | Does a hero have health? | **No, and we are not adding one.** The consequence of contact is the 1500 ms dazzle; the shield exists; the hero plate carries `Dazzled` and `Shielded`. The word "health" gets an answer, not a bar. | This is a homeschool tracker. A losable hero turns a metered five-minute grant into a thing a child can fail out of. |
| D8.8 | Does a trouble threaten a site, a quest or a door? | **Never.** No trouble may block a side quest, a panel, a door, a villager or a building. Enforced by a test that reads the source of every gating surface. | Decision 3, and the reason the Q5 recommendation went the way it did. |
| D8.9 | What does clearing pay? | **1 Realm minute per cleared trouble**, appended to `realm_play_ledger` as a new `bonus` kind, bounded by a per-day sub-cap. | Decision 3. Minutes are the only currency this app has that a child already values. |
| D8.10 | What stops a child farming the fields instead of doing schoolwork? | A stated sub-cap: `min(parentCap, max(questMinutesToday, max(1, earnedMinutesPerQuest)))`, default parent cap **5 minutes a day**, and the existing `dailyCapMinutes` still binds every path. | The parent's number is the ceiling; the schoolwork term is the guarantee that a raised ceiling can never outrun the day's real work by more than one grant. |
| D8.11 | Does the bounty run in every access mode? | **No.** It is off when `accessMode === "scheduled"`, because in that mode `ledgerBalance` is never consulted and the minutes would be unspendable. The help card's promise is suppressed with it. | A promise the code cannot keep is the exact failure the help card taught us. |
| D8.12 | Where do troubles spawn now? | From slice 4's **`SPAWN_ZONES`** — and **slice 4 already moved them there** and already renamed `Trouble.siteId` → `zoneId` and `clearedSites` → `clearedZones`. What *this* slice adds on top is the `objectiveZoneId` preference, `CLEAR_FROM_HERO`, the `maxHits`/`hurtUntil`/`dyingUntil` fields, and excluding dying troubles from the per-zone occupancy check. | Objection (a) is slice 4's, because slice 4 is the slice that deletes the foundation filter. Claiming it twice is how two slices come to write the same rename. |
| D8.13 | Calm mode | Calm **mutes, it does not empty**: the blob still approaches, at 0.6× inside a 4-unit sense radius with a 600 ms tell; the fog patrols a 5-unit tether; the stone telegraphs a harmless violet pulse. `LOW_STIMULUS_MAX` stays 3. | "Calm mode is six inert props" is the counterexample the cross-cutting rule was written from. |
| D8.14 | reducedMotion | Every cue gets a **non-motion substitute** — never a removal. The kill burst is no longer gated on `motion`; with motion off it becomes a 250 ms fade plus a static star. Fog slows to 0.25× rather than freezing. | Today `motion` gating erases 100% of combat feedback for exactly the children the setting exists for. |
| D8.15 | Does anything here pause the clock or take control away? | **Nothing.** Total added time in which a child cannot act: **0 seconds.** The one control-removing beat, the 1500 ms dazzle, is unchanged in length — only made visible. | The metered clock. Slice 9's opening banner is the only pause in the programme. |

---

## 3. Design

### 3.1 The violet key, and the lock that keeps it

One accent belongs to troubles and to nothing else:

- **`--trouble-violet` `#a78bfa`** — the light key: motes, the alert bubble's ground, the nameplate border, the dazzle vignette.
- **`--trouble-violet-deep` `#7c3aed`** — the dark key: the cursed stone's fissure (already there today), the nameplate ground, the targeting reticle.
- **`--trouble-ink` `#1e293b`** — the shared 1.5 px outline and every eye pupil.

Slice 5 put the environment palette in one module. This slice adds the lock:

```ts
// src/lib/realm/palette.ts — slice 5 owns the module; this slice adds two exports
// CONSUMED, not declared. Slice 5 owns the palette and reserves both violets:
import { TROUBLE_VIOLET, TROUBLE_VIOLET_DEEP, ENVIRONMENT_COLORS } from "@/lib/realm/palette";
// This slice declares no colour of its own. A hex written in two modules is a hex that drifts,
// and the whole value of the violet key is that exactly one module knows it.
export const TROUBLE_INK = "#1e293b";
```

and slice 5's colocated `palette.test.ts` asserts that no colour in **`ENVIRONMENT_COLORS: readonly string[]`** is within a perceptual distance of either violet key (ΔRGB Euclidean ≥ 90 on 0–255 axes; the current worst offender, the decor rock `#7d7d7d` against `#a78bfa`, sits at 96). Slice 5 builds that list by walking `BRIGHT`, `CALM` and `MATERIALS` structurally, so it is exhaustive by construction rather than by an author's memory, and slice 5 ships a second test that greps every figure module for `#rrggbb` literals not in the list. That pair is what makes "violet means enemy" a property of the codebase rather than a note in a spec.

### 3.2 The figures — one redraw, one shared treatment

All figures stay on the shared 36×48 viewBox. Coordinates below are in that space.

**Gentle `Fog`, redrawn.** A lumpy grey-lilac body, not three grey ellipses:

- Body: one path, a rounded lumpy blob from `(6,38)` up over three bumps at `(11,20) (19,16) (27,21)` and back down to `(30,38)`, fill `#c4bcd6` (grey-lilac — reads as cloud, not as rock, and is not `#cbd5e1`), outline `#1e293b` at 1.5 px, opacity **1.0** (the 0.85 that made it read as sky is gone).
- Two stubby arm-puffs: circles r=3.5 at `(5,29)` and `(31,29)`, same fill and outline. These are the silhouette change — nothing else in the world has arms.
- Big half-closed grumpy eyes: two `#ffffff` circles r=3 at `(14,25)` and `(23,25)`, each with a `#1e293b` pupil r=1.6 sitting low, and a `#c4bcd6` lid rectangle covering the top 40% of each — the "half-closed" read.
- A small frown: `M14 33 Q18.5 30 23 33`, stroke `#1e293b`, 1.5 px.
- Three violet motes orbiting: circles r=1.2 at `(4,18) (32,17) (18,10)`, fill `#a78bfa`. **Dropped under `lowStimulus`** (see §6).

**Shared treatment, applied to all six figures (three kinds × two skins):**

1. **A 1.5 px `#1e293b` outline** on every filled body shape.
2. **A ground shadow inside the sprite**: an ellipse at `cx=18 cy=45 rx=11 ry=3`, fill `#000000` at 0.28 opacity, drawn first. Not the grass-coloured fake strip slice 2 deleted from the buildings — a true dark ellipse, and it lands where slice 2's baseline anchoring (`spriteMaterial.center = (0.5, 0)`) puts the sprite's foot on the ground. Troubles then sit at **y = 0** like everything else instead of hanging at y = 0.9. The bob is applied above that baseline.
3. **The violet key** on each figure: fog motes; the cursed stone's fissure (already `#7c3aed`, widened to 2.5 px with a `#a78bfa` inner glow line and the two eyes moved *into* the fissure at `(17,26)` and `(21,30)`); the shadow gains a violet ring at its base — ellipse `cx=18 cy=41 rx=10 ry=2.5`, stroke `#a78bfa` 1.5 px, no fill — and two small foot-nubs at `(13,40)` and `(23,40)` so it stands rather than floats.
4. **Silhouette separation from decor**, checked in the `/dev/figures` gallery from slice 2 at true display size against the real grass: fog has arms; the cursed stone is violet-tinted (`#6b7280` → `#6f6478`) and taller than the 0.9-unit decor rock; the shadow has feet.

**The monsters skin keeps its faces and gains 1, 2 and 4.** `MistWisp`, `Gargoyle` and `Blob` are already legible creatures; they get the outline, the ground shadow, and the violet key (Gargoyle's eyes stay `#fbbf24` — the yellow is its character — but its wing tips take a violet edge; Blob keeps `#22c55e` but gains a violet base ring, because green is the bush and the ring is what separates them).

**The cracked second texture.** `TroubleFigure` gains a `hurt` prop:

```tsx
export function TroubleFigure({ kind, skin, hurt = false, size = 96 }: {
  kind: TroubleKind; skin: TroubleSkin; hurt?: boolean; size?: number;
}): React.JSX.Element
```

Only `cursed-stone` draws anything different when `hurt` is true (it is the only kind with `maxHits > 1`): the fissure widens to 4 px, a second crack runs from `(24,22)` to `(28,38)`, one eye closes to a `#1e293b` arc, and two violet motes rise off the top. `SpriteSource` rasterises `trouble:cursed-stone:{skin}:hurt` alongside the base. Every other kind returns the base figure, so adding a 2-HP kind later is one `hurt` branch, not a new pipeline.

### 3.3 Nameplates, the alert tell, and the pip row

**Nameplates.** `TROUBLE_COPY.gentleName` / `.monstersName` — written, typed, and read by nothing anywhere in the app (troubles.ts:21-27) — are finally rendered. Two new pure exports in `troubles.ts` are the only readers, so the strings have exactly one door:

```ts
export function troubleName(kind: TroubleKind, skin: TroubleSkin): string;
export function clearNotice(kind: TroubleKind, skin: TroubleSkin): string;
```

The plate is a **canvas texture**, rasterised once per kind per skin, and drawn as a pooled sprite above each live trouble. The rasteriser lives in `sprite-texture.ts` — the file that already owns the only dynamic `await import("three")` in the sprite path — so this slice adds **no new three importer**:

```ts
// src/lib/realm/sprite-texture.ts
export type PlateStyle = { ground: string; border: string; text: string; pips?: { filled: number; total: number } };
export async function textToTexture(text: string, style: PlateStyle): Promise<CanvasTexture>;
```

Threat plate style, distinct from the neutral `.realm-label` black pill the scenery wears: ground `rgba(76, 29, 149, 0.82)`, 1.5 px `#a78bfa` border, 9999 px corners, text `#ffffff` at a weight of 700, and a `⚠` glyph before the name at full depth. The pip row (`●●` → `●○`) is drawn into the same canvas for kinds with `maxHits > 1`, so a damaged cursed stone shows its remaining hit on the plate as well as in its texture — two channels, one of them non-motion.

Plate sprites are pooled `TROUBLE_POOL`-wide next to the figure sprites, bound to the same slot map, positioned at `trouble.position` + `y = 2.4` with `sizeAttenuation` on, and hidden during the death beat.

**The alert tell.** `Trouble` gains `alertedAt: number`. A trouble that has just noticed the hero shows a violet `!` bubble (one rasterised texture, `trouble-alert`, reused across all kinds) above the plate for `ALERT_MS`, and the blob **waits** that long before it starts moving. That is not a cost to the child — it is 400 ms of warning the game does not currently give. Each of the three kinds shows the same bubble, so the "noticed you" state is one thing a child learns once:

- fog: puffs up 12% and swaps to the frown (already its resting face — the puff is the tell)
- cursed stone: emits a slow violet ground ring, telegraphing a harmless pulse
- shadow-blob: squashes 15%, shows the bubble, then approaches

**The pip row and the clear count are full-depth only.** See §6.

### 3.4 The slot bug

`SpellLayer` keeps `troubleSlots: useRef(new Map<string, number>())` and a free-list. Each frame:

1. Release any slot whose trouble id is no longer in `sim.troubles` (i.e. after the death beat has reaped it).
2. Assign a free slot to any id that does not have one.
3. Drive figure sprite, plate sprite, shadow and every per-slot tween (bob phase, hurt flash, death timing, materialise scale) from the **slot's bound id**, not from `sim.troubles[i]`.

Bob phase is seeded from a hash of the trouble id rather than the slot index, so a trouble that changes slot (it cannot any more, but the property is worth having) does not visibly jump its bob.

### 3.5 Hit, hurt, and die

**`Trouble` gains five fields** (all with defaults that make an existing test-constructed trouble valid):

```ts
export type Trouble = {
  id: string;
  kind: TroubleKind;
  zoneId: string;              // was siteId
  position: Vec2;
  origin: Vec2;
  drift: Vec2;
  hitsLeft: number;
  maxHits: number;             // NEW — so the plate and the cracked swap never re-derive HITS
  statuses: TroubleStatus[];
  spawnedAt: number;
  retreatUntil: number;
  alertedAt: number;           // NEW — 0 until it notices the hero
  hurtUntil: number;           // NEW — 0 when not hurt
  hurtDir: Vec2;               // NEW — unit vector, away from the incoming hit
  dyingUntil: number;          // NEW — 0 while alive; > 0 means the death beat is running
  recoil: { from: Vec2; to: Vec2; until: number } | null; // NEW — the tweened pushback
};
```

**New constants in `troubles.ts`:**

```ts
export const HURT_MS = 180;
export const DYING_MS = 350;
export const MATERIALISE_MS = 400;
export const ALERT_MS = 400;
export const ALERT_CALM_MS = 600;
export const PUSH_MS = 200;
export const CLEAR_FROM_HERO = 7;
export const BLOB_SENSE_CALM = 4;
export const CALM_SPEED = 0.6;   // multiplier under lowStimulus
export const FOG_TETHER = 5;     // was the private WANDER = 3
export const REDUCED_FOG_SPEED = 0.25;
```

**`applyHit` takes the hit point:**

```ts
export function applyHit(
  trouble: Trouble,
  spell: SpellDefinition,
  now: number,
  at: Vec2 | null
): { trouble: Trouble; cleared: boolean };
```

It sets `hurtUntil = now + HURT_MS` and `hurtDir = unit(trouble.position − at)` (falling back to `{x:0,z:-1}` when `at` is null or coincident), decrements `hitsLeft`, and appends the spell's timed statuses exactly as today.

**The layer's hurt reaction** — every cue paired with a non-motion substitute:

| Cue | motion on | motion off |
|---|---|---|
| Flash | `mat.color.lerp(white, 0.8)` easing back over 180 ms | the same colour lerp, held flat for 180 ms then cut (a colour change is not motion) |
| Punch | scale ×1.15 with an ease-out | no scale change |
| Recoil | position offset 0.25 units along `hurtDir`, eased back | no offset |
| Damage | swap to the cracked texture when `hitsLeft < maxHits` | identical — a texture swap is not motion |
| Plate | pip goes `●●` → `●○` | identical |

**Death is a beat, not a frame.** New pure helpers:

```ts
export function isLive(t: Trouble): boolean;                     // t.dyingUntil === 0
export function liveTroubles(ts: Trouble[]): Trouble[];
export function killTrouble(t: Trouble, now: number): Trouble;   // dyingUntil = now + DYING_MS
export function driftAway(t: Trouble, now: number): Trouble;     // same fade, no burst, no tag, no bounty
export function reapTroubles(ts: Trouble[], now: number): Trouble[]; // drops t.dyingUntil > 0 && now >= t.dyingUntil
```

**`isLive` gates five call sites, and missing any one is a bug the audit already predicted:**

1. `stepTroubles` — a dying trouble does not move, does not chase, and cannot dazzle.
2. `stepEffects`' targeting — `use-spell-sim` passes `liveTroubles(troubles)` in, so a corpse cannot absorb a bolt.
3. The hit loop in `use-spell-sim` — a second effect landing on the same frame as the kill is skipped.
4. `spawnTroubles`' per-zone occupancy check — **miss this one and a cleared zone stops respawning for 350 ms of dying and then respawns instantly, or worse, never**.
5. `nearestTroubleOrAhead` — Space must not aim at a corpse.

**The death beat**, over 350 ms:

- squash to 1.3× wide / 0.6× tall, spin 1.5 turns, fade opacity to 0 → **motion off:** a 250 ms straight opacity fade with a static 6-point violet star sprite at the position, no squash, no spin.
- 16 particles in the trouble's own accent (fog `#c4bcd6`, cursed stone `#a78bfa`, shadow `#818cf8`), spawned **at the trouble's position** → **motion off:** the particles are not spawned; the static star is the substitute. **The burst is no longer gated on `motion` for kills** — the substitution is, which is the whole point.
- the plate hides at t=0; the nameplate is a live-enemy affordance.
- the reward tag rises from t=+100 ms (§3.11).

### 3.6 Honest feedback — hits, not vanishings

`lastVanished` is deleted. `stepEffects` reports what actually happened:

```ts
export type EffectHit = { effectId: string; troubleId: string; spell: SpellDefinition; at: Vec2 };
export type EffectFizzle = { effectId: string; at: Vec2; color: string; reason: "range" | "wall" | "expired" };

export function stepEffects(
  effects: SpellEffect[], troubles: Trouble[], hero: Vec2, colliders: Prop[], dt: number, now: number
): { effects: SpellEffect[]; hits: EffectHit[]; spawned: SpellEffect[]; fizzles: EffectFizzle[] };
```

`at` is the effect's own position at the moment it connected: the projectile's position, the area's centre, the beam's origin, the hero for an aura, the mini-bolt's position for a summon shot. That gives every one of the five shapes a real impact point and a real recoil direction, and it is what makes beam and aura hits — completely silent today — spark like everything else.

`SpellSim` replaces one field with two per-frame arrays:

```ts
export type HitFlash = { x: number; z: number; color: string };
// SpellSim: … hits: HitFlash[]; fizzles: HitFlash[]; …   (lastVanished removed)
```

`SpellLayer` spawns a **6-particle spark** at every `hits` entry each frame, in the spell's colour, 200 ms, and a **4-particle dim grey `#9ca3af` fizzle** at every `fizzles` entry, 150 ms, at 0.5 opacity. A child can now tell a hit from a miss from a wall, which is three bugs closed by one change.

Under `motion === false` the spark becomes a **static ring decal** on the ground at the hit point at 0.15 opacity for 250 ms — visible, informative, and not moving.

### 3.7 The wind-up and the reticle

`Casting` gains the target it silently picked, so the reticle can track a moving blob:

```ts
export type Casting = {
  spell: SpellDefinition; slot: number; target: CastTarget;
  startedAt: number; releaseAt: number;
  targetTroubleId: string | null;   // NEW
};

export function beginCast(
  state: CasterState, spell: SpellDefinition, slot: number, hero: Vec2, tap: Vec2,
  mana: number, now: number, targetTroubleId?: string | null   // NEW, defaults to null
): { state: CasterState; mana: number; refused: Refusal };

export function castProgress(casting: Casting | null, now: number): number; // NEW — 0..1, 0 when idle
```

`use-spell-sim` passes the id whenever the request came from `nearestTroubleOrAhead`, and whenever a tapped point lands within `TROUBLE_RADIUS + 0.4` of a live trouble — so a deliberate tap on an enemy is acknowledged too.

`SpellLayer` renders the wind-up, which is drawn by nothing today:

- **A glow orb at the hero**, `spell.color`, scaling `0 → 0.55` across `castProgress`, at `y = 1.3`.
- **A ground ring that closes**: a torus at `y = 0.05`, radius `1.4 → 0.4`, same colour, 0.6 opacity.
- **A reticle on the chosen trouble**: a violet `#7c3aed` ring at `y = 0.05` under it, tracking its position each frame, plus a 1.15× outline pulse on the plate. If the target dies or is reaped mid-wind-up, the reticle hides and the cast still releases at the frozen point `castTargetFor` already computed — the shot does not re-aim, because re-aiming mid-cast is the kind of magic that makes a game feel unpredictable.

**Under `motion === false`:** the orb appears at 60% scale at the start and holds (no growth), the ring is drawn at its final radius, and the reticle is a static square bracket rather than a pulse. The wind-up is still *visible* — that is the accommodation, and the alternative (nothing) is what ships today.

**Cost:** zero added seconds. `castMs` (300 ms for Bolt, 900 ms for Sprite) is unchanged. This slice draws the window that already exists.

### 3.8 The dazzle, and the ruling on hero health

> **RULING: there is no hero health in this game and we are not adding one.**
>
> The only thing a trouble can do to the hero is `focusLost` → a 1500 ms dazzle (`focus.ts`), and the shield can prevent it. That is the whole risk model and it is deliberate: play is metered in five-minute grants earned from schoolwork, and a hero who can be defeated turns a child's earned minutes into something they can lose to an arcade toy. The user's phrase "player name/health" is answered by **saying so on screen** — the hero plate carries a status row (`Dazzled`, `Shielded`) where a health bar would be, so the thing they were looking for is present as state rather than absent as a bar.

**Making it the hero's, not the enemy's.** Today the blob teleports 4 units away and the hero's controls die silently.

- **The pushback is tweened.** `stepTroubles` sets `recoil = { from: position, to: pushback(...), until: now + PUSH_MS }` instead of writing the position directly, and interpolates each frame. `pushback()` already validates every candidate against the world limit and every collider, and the tween only ever interpolates toward an already-validated endpoint, so no new penetration is possible.
- **The hero flashes**: white for 120 ms, then 0.75 opacity for the rest of the 1500 ms.
- **Dizzy stars**: three small `#fde68a` stars orbiting above the head for the full window — the classic, non-scary child-game read. **Motion off:** three static stars, same position, fading out over the window.
- **A violet screen-edge vignette**: `.realm-dazzle` — `position: fixed; inset: 0; pointer-events: none; box-shadow: inset 0 0 90px 30px rgba(124,58,237,0.35)`. **Motion off / lowStimulus:** the same vignette at 0.18 with no fade-in animation.
- **The notice lands in slice 1's centred lane**, not in the top-left stack.
- **The hero plate carries the state** (§3.14 for the copy).

New pure module, so the plate's contents are testable without three:

```ts
// src/lib/realm/hero-status.ts
export type HeroStatusId = "dazzled" | "shielded";
export type HeroStatus = { id: HeroStatusId; label: string; spoken: string; icon: GameIconName; tone: "warn" | "good" };
export const HERO_STATUS: Record<HeroStatusId, HeroStatus>;
export function heroStatuses(input: { dazzled: boolean; shielded: boolean }): HeroStatus[];
```

`heroStatuses` returns at most two entries, `dazzled` first. It returns `[]` in parent preview (the shell passes both false), so the plate never renders a status row for a parent looking at a child's grounds.

### 3.9 Calm mode stops being furniture

troubles.ts:160 skips the blob's chase entirely under `lowStimulus`; combined with the stone's `SPEED 0` and the fog's 3-unit tether, calm mode is six pieces of furniture. `reducedMotion` additionally freezes the fog (troubles.ts:163). Both change:

| Kind | Today | This slice |
|---|---|---|
| fog | wanders within 3 units of origin at 0.6; **frozen entirely under reducedMotion** | patrols a 5-unit tether at 0.6; under `reducedMotion` moves at `0.6 × 0.25` — slow and smooth, never frozen. Puffs and frowns inside 5 units of the hero. |
| cursed-stone | `SPEED 0`, no tell, indistinguishable from a bound enemy | still stationary — it is a stone — but telegraphs a violet ground ring every 3 s. **The pulse does nothing**: it is a tell with no mechanic behind it, and this spec says so rather than promising a turret it does not implement. |
| shadow-blob | chases inside 6 units; **chase skipped entirely under lowStimulus** | chases inside 6 units after a 400 ms tell. Under `lowStimulus`: chases inside **4** units at **0.6×** after a **600 ms** tell, and `RETREAT_MS` rises to 6000 so it backs off longer after contact. |

`LOW_STIMULUS_MAX` stays 3. The distinction the cross-cutting rule demands is honoured: calm mode is **quieter, not emptier** — fewer troubles, slower, longer warnings, no sparkles, no shake — but it is not a diorama.

**Kind assignment** moves off `index % 3`, which guaranteed at most two blobs. Zones carry a `mix` weight from slice 4 (a market plaza gets fog, the outskirts get blobs); absent one, the fallback is a seeded pick from `KIND_ORDER` per zone so a world of six troubles is not four-sixths inert by construction.

### 3.10 Zone spawning, and the four village objections

**Slice 4 already moved `spawnTroubles` off foundations and onto zones**, and already renamed `Trouble.siteId` → `zoneId` and `SpawnInput.clearedSites` → `clearedZones` through the five call sites in `use-spell-sim.ts`. That had to happen there, because slice 4 is the slice that deletes the foundation filter. This slice adds three things on top, and claims neither the move nor the rename:

```ts
// The FULL accumulated shape. Only `objectiveZoneId` is new here.
export type SpawnInput = {
  seed: number;
  now: number;
  layout: WorldLayout;
  troubles: Trouble[];
  lowStimulus: boolean;
  zones: readonly SpawnZone[];             // slice 4
  clearedZones: Record<string, number>;    // slice 4 (renamed from clearedSites)
  hero: Vec2;                              // slice 4 — nothing spawns near the child
  districts?: DistrictId[] | null;         // slice 4
  objectiveZoneId?: string | null;         // NEW here: preferred first, so troubles are where the child is going
};

export function spawnTroubles(input: SpawnInput): Trouble[];
export function objectiveZoneFor(layout: WorldLayout, zones: readonly SpawnZone[]): string | null;
```

1. **`objectiveZoneId`** — the objective's district's zone is drawn first, so a child walking toward the Mill meets something on the way rather than finding the world's six troubles in Watch Hill.
2. **`CLEAR_FROM_HERO` 7** — nothing materialises inside the frame the child is looking at.
3. **Dying troubles keep their zone.** `isLive` filters the per-zone occupancy check, so a 350 ms death beat neither double-fills a zone nor blocks its respawn timer.

**The trouble mix per zone is derived, not declared.** `SpawnZone` carries `id`, `districtId`, `bounds` and `weight` — no `mix` field — so a zone's character comes from the district it is in, which is the same fact expressed once instead of twice:

| district | mix |
|---|---|
| `millrace`, `garden-terrace` | fog-weighted (damp ground, low places) |
| `watch-hill`, `chapel-hill` | cursed-stone-weighted (the high, old places) |
| `gate-quarter`, `market-plaza`, `scholars-row` | shadow-weighted (where people are) |
| `keep-approach` | no zone at all — the coronation ground stays clear (slice 4 §3.7) |

`troubleMixFor(districtId)` is one pure function over that table, colocated and tested; a district with no entry falls back to an even split rather than throwing.

`objectiveZoneFor` reads the `focus` flag slice 1 already puts on the layout's props and returns the zone whose centre is nearest it, so no new scene prop is needed and the memoised `World` is untouched.

**The four engineering problems named in decision 2, each with its answer:**

**(a) `spawnTroubles` only spawns at unbuilt foundations, so a denser world starves enemy spawns.** Solved here, and this is the slice where it lands. Spawning is per **zone**, and zones are a property of the town plan, not of kingdom progress. A child at 8-of-8 with every foundation built still has every zone. A denser village has *more* zones, not fewer. The cap is unchanged (`MAX_TROUBLES` 6, `LOW_STIMULUS_MAX` 3) so a bigger world does not mean a busier screen; it means the six are better distributed. Placement uses **`openPointInZone(zone, layout, seed, TROUBLE_RULES, hero)`** from `open-ground.ts` rather than rejection-sampling the world, so slice 5's dozens of new props cannot starve it — the zone module owns the knowledge of what is open. Clearances passed: `TROUBLE_RADIUS` against colliders, `CLEAR_FROM_VILLAGER` 1.5, `CLEAR_FROM_PATH` 2.5 (roads), `CLEAR_FROM_SPAWN` 4, and the new `CLEAR_FROM_HERO` 7.

**(b) New solid props can wedge the hero; the ceremony walk and the recess lap ring cross the map.** **This slice adds no solid prop and no collider.** Troubles have never been colliders (they are not in `layout.colliders` and nothing puts them there), and nothing here changes that: a trouble cannot block the hero, a door, a road or the lap ring. The only push in the system pushes the *trouble*, and `pushback()` already validates its endpoint against the world limit and every collider; the new tween interpolates toward that validated endpoint, so it cannot deposit a trouble inside a wall. `unstickHero` is not touched and does not need to be. The one route this slice adds — the blob's chase — is a per-frame step through `moveWithin`, which rejects any step into a collider, so a chasing blob crossing a road corridor is legal and a chasing blob entering a building is not.

**(c) Sprite rasterisation already blocks first paint and more figures makes it worse.** `sprite-texture.ts` caches **by kind**, so instances are free and kinds are billed. This slice's kind bill:

| New kind | Count |
|---|---|
| `trouble:cursed-stone:{skin}:hurt` (the cracked texture; only kind with `maxHits > 1`) | 1 |
| `trouble-plate:{kind}:{skin}` (three nameplates, current skin only) | 3 |
| `trouble-alert` (the shared `!` bubble) | 1 |
| `dizzy-star` | 1 |
| **Total new kinds** | **6** |

Against a running total of roughly 34 rasterisations today, that is **+18%**. Slice 2 parallelised the awaits and keeps the cache warm across a short round trip, so the batch's wall clock is bounded by its *largest* canvas (the citadel), not by the sum, and four of the six new kinds are tiny text/glyph canvases measured in tenths of a millisecond. **Budget, to be measured at the browser pass and recorded in the implementation plan: ≤ 25 ms added to a cold first paint, 0 ms on a warm return.** If the measurement exceeds that, the three nameplates collapse to one texture per skin with the name drawn as a sub-rect (an atlas), which is a half-day and is the stated fallback.

**(d) Gleam spawning needs open ground.** Troubles and gleams both draw from `SPAWN_ZONES` and both go through `openPointInZone`, so neither rejection-samples the world and neither can starve the other. They do not exclude each other: a gleam and a trouble may share a zone, because a gleam is a pickup and a trouble is not a collider. Recess does **not** suppress troubles — a clear during recess still pays, under the same sub-cap, because the ledger's daily ceiling binds either way. Slice 12 owns the recess side of that contract; the obligation this slice takes on is only that it never claims a zone exclusively.

**One deletion falls out for free.** Because spawning no longer filters by `siteIds`, the silent-deletion path at troubles.ts:81-84 — "the moment a deed completes a building the trouble standing at that site blinks out of existence mid-screen" — is gone. The other silent deletion, a trouble found inside a collider (which is how one of slice 5's new props could eat one), routes through `driftAway`: a 250 ms fade with no burst, no reward tag, no tally and no bounty, so a vanishing enemy is always visibly a *fade* and never mistaken for a kill the child did not make.

### 3.11 The bounty — combat that pays

**The economy has one door, and this is the second key that fits it.** Realm minutes come from completed side quests and, from this slice, from cleared troubles, bounded in both cases by the parent's `dailyCapMinutes`, which `computeRealmAccess` already enforces at realm-access.ts:64-66.

**Buildability finding, verified against the emitted DDL.** `migrations/0021_round_the_initiative.sql` creates `realm_play_ledger` with `` `kind` text NOT NULL `` and **no CHECK constraint**. Adding a `"bonus"` kind is therefore a **TypeScript-only change** to `LedgerKind` and the Drizzle enum — no data migration for the ledger, no backfill, no rewrite of existing rows. `ledgerBalance` (realm-access.ts:37-40) already counts every non-`"spent"` kind as credit, so bonus minutes become spendable the moment they land, with no change to the access rules at all.

**The rule.** One cleared trouble = **1 Realm minute** (`MINUTES_PER_CLEAR = 1`), subject to a per-day sub-cap the ledger does not give us for free:

```
questMinutesToday = Σ rows where kind === "earned"
floor             = max(1, settings.earnedMinutesPerQuest)          // "one grant", never zero
subCap            = capMinutes === 0 ? 0 : min(capMinutes, max(questMinutesToday, floor))
paidToday         = Σ rows where kind === "bonus"
headroom          = max(0, settings.dailyCapMinutes − minutesSpent(rows))
allowance         = max(0, min(subCap − paidToday, headroom))
awarded           = min(clears × MINUTES_PER_CLEAR, allowance)
```

At default settings (`troubleBonusCapMinutes` 5, `earnedMinutesPerQuest` 5, `dailyCapMinutes` 30) the parent's cap binds and the ceiling is **one quest's worth of extra time per day**. The schoolwork term binds only when a parent raises the cap above one grant — which is exactly its job: *the parent's number is the ceiling; the schoolwork rule is the guarantee that the ceiling can never outrun the day's real work by more than one grant.* A child can never skip schoolwork and farm the fields instead, and if a parent decides five minutes a day of bounty is too much, it is one number in one column.

**What happens at a raised cap, and why the formula does not simply let the child out.** Decision 3 says clearing must never stand between a child and their schoolwork, and the `no-gating` test proves it cannot *block* one. The harder question is whether it can *displace* one, and the sub-cap's `max(questMinutesToday, floor)` term is the answer. Worked, at `troubleBonusCapMinutes = 30`:

| the child's day | `questMinutesToday` | sub-cap | what clearing can add |
|---|---|---|---|
| no quests finished | 0 | `max(0, 5)` = **5** | one grant, then `Cleared!` |
| one quest finished | 5 | `max(5, 5)` = **5** | one more grant |
| three quests finished | 15 | `max(15, 5)` = **15** | three more grants |
| six quests finished | 30 | `min(30, 30)` = **30** | but `dailyCapMinutes` 30 is already spent — headroom 0 |

**Bonus minutes can never exceed the minutes the day's real work already earned**, at any cap a parent can set, because the sub-cap tracks `questMinutesToday` upward and the parent's number only ever *lowers* it. A child who does nothing all day gets one grant's worth of fighting and then the tag reads `Cleared!` — which is the honest outcome, and it is also the outcome at the default. `bounty.test.ts` asserts the table above at caps of 0, 5, 15 and 30, so "raising the cap cannot let clearing outrun schoolwork" is a property with a test rather than a claim in a spec.

**New pure module:**

```ts
// src/lib/realm/spells/bounty.ts   (+ colocated bounty.test.ts)
import { minutesSpent, type LedgerRow, type RealmAccessMode } from "@/lib/utils/realm-access";

export const MINUTES_PER_CLEAR = 1;
export const BOUNTY_FLOOR_MINUTES = 1;
export const CLEARS_PER_FLUSH = 3;        // flush after this many unpaid clears…
export const FLUSH_IDLE_MS = 4000;        // …or this long after the last one
export const MAX_CLEARS_PER_CALL = 12;    // a stuck client cannot bank a day

export type BountySettings = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  earnedMinutesPerQuest: number;
  dailyCapMinutes: number;
  troubleBonusCapMinutes: number;
};

export type BountyStatus = {
  enabled: boolean;
  capMinutes: number;
  subCapMinutes: number;
  paidMinutes: number;
  remainingMinutes: number;
};

export type BountyAward = { minutes: number; capped: boolean; status: BountyStatus };

/** Off when the Realm is off, the cap is 0, or the mode is "scheduled" — where ledgerBalance is never consulted and the minutes would be unspendable. */
export function bountyEnabled(settings: BountySettings): boolean;
export function questMinutesToday(ledgerToday: LedgerRow[]): number;
export function bonusMinutesToday(ledgerToday: LedgerRow[]): number;
export function bountySubCap(ledgerToday: LedgerRow[], settings: BountySettings): number;
export function bountyStatusFor(ledgerToday: LedgerRow[], settings: BountySettings): BountyStatus;
export function bonusMinutesFor(clears: number, ledgerToday: LedgerRow[], settings: BountySettings): BountyAward;

/** The client's optimistic half: what the world may promise at the moment of a kill. */
export type BountyPurse = { remaining: number; known: boolean };
export function startPurse(): BountyPurse;                    // { remaining: 0, known: false }
export function seedPurse(status: BountyStatus): BountyPurse;
export function applyAward(purse: BountyPurse, status: BountyStatus): BountyPurse;  // the server always wins
export function takeBountyMinute(purse: BountyPurse): { purse: BountyPurse; paid: boolean };
```

`takeBountyMinute` returns `paid: false` whenever `!known` or `remaining <= 0`. **That is what stops the world lying**: until the server has told us what is left today, the death beat does not claim a minute.

**Two new server actions** in `src/lib/actions/realm-play.ts` (a `"use server"` file; both are async, as the rule requires):

```ts
export async function getTroubleBounty(childId: string, date: string): Promise<BountyStatus>;
export async function recordTroubleBounty(
  childId: string, date: string, clears: number
): Promise<{ awarded: number; status: BountyStatus }>;
```

`recordTroubleBounty` calls `requireChildAccess(childId, { write: true })` (a hero may bank their own), `assertDate(date)`, and a new `assertClears(clears)` (a whole number 1..`MAX_CLEARS_PER_CALL`, error text in §5); loads settings and today's ledger; computes `bonusMinutesFor`; and appends **one** `bonus` row for the whole batch when `awarded > 0`. `sourceAssignmentId` is null — a bonus has no assignment. It does not `revalidatePath`: nothing server-rendered depends on it mid-visit.

**The flush, and how the tag stays honest.** Per-kill round trips would be six round trips in twenty seconds. The shell instead:

- holds `purseRef: RefObject<BountyPurse>` — a ref, referentially stable for the component's life, passed straight through `RealmScene` → `SpellLayer`, so the memoised `World` is not disturbed;
- seeds it from `getTroubleBounty` in a mount effect, one round trip, off the critical path and off the frame loop (until it resolves, `known` is false and no minute is promised — a kill inside the first few hundred milliseconds of a visit is not physically possible, since troubles must spawn and a cast must wind up);
- on each `cleared` event calls `takeBountyMinute` and writes the result back to the ref, increments `unpaidRef`, and schedules a flush at `CLEARS_PER_FLUSH` clears or `FLUSH_IDLE_MS` idle, whichever comes first;
- on the flush's reply calls `applyAward(purse, status)` — **the server's number always overwrites the client's** — and then `clock.refresh()`.

The death beat reads the ref at **t = +100 ms**, not on the kill frame, which is six or more frames after the shell's `queueMicrotask` has settled the clear. That ordering is the whole reason the tag can be trusted.

**`usePlayClock` gains one export.** It already has a private `refresh` callback; it is added to the returned object so the corner clock can be told to go up. That is the entire change to the clock:

```ts
return { minutesRemaining, warning, error, clearError, flushPending, refresh, source };
```

**The clock ticks up.** When `awarded > 0` and the refreshed `minutesRemaining` is higher than before, the corner clock plays `.realm-clock--gained`: a 600 ms gold pulse. **Motion off / lowStimulus:** the numeral turns `var(--gold-bright)` for 1200 ms with no animation. This is the first time a number on this screen has gone the good way, and it should be the thing a child notices.

**No exit path bypasses the flush.** The shell's unmount effect (slice 1's `clock.flushPending()`) becomes `void Promise.all([clock.flushPending(), flushBounty()])`, and the HUD's existing **Try again** control flushes both. Both are covered in §7.

> **RULING: clearing troubles never gates anything.** No door, no panel, no side-quest start, no villager, no building and no ceremony may consult trouble state — not `sim.troubles`, not the tally, not `clearedZones`, not the bounty. Combat is a way to earn minutes and nothing else. Covered by a test (§7).

#### The Tavern panel's earning line, rewritten

Slice 6 ships this string on the Tavern door panel:

> `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here, up to {dailyCapMinutes} a day.`

It becomes **false** the moment this slice lands, because it is no longer the only way to earn. Slice 6 hands the rewrite here, and here it is — all three access modes, plus the spent-sub-cap case, verbatim:

| condition | string |
|---|---|
| `accessMode` `earned` or `both`, bounty **on**, allowance remaining | `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here. Clearing troubles earns a minute each, up to {subCap} a day.` |
| `accessMode` `earned` or `both`, bounty **on**, `allowance === 0` because the sub-cap is spent | `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here. You've had all today's minutes from clearing troubles.` |
| `accessMode` `earned` or `both`, bounty **off** (`troubleBonusCapMinutes === 0`) | `Finish a quest and you earn {earnedMinutesPerQuest} more minutes here, up to {dailyCapMinutes} a day.` — slice 6's line, unchanged, because with the bounty off it is still exactly true |
| `accessMode` `scheduled` | `Your Realm time comes from recess, not from quests.` — slice 6's line, **unchanged**, because D8.11 turns the bounty off entirely in scheduled mode (`ledgerBalance` is never consulted there, so the minutes would be unspendable and the promise unkeepable). A scheduled-mode child is never told that clearing pays, and it never does. |

`{subCap}` is `bountyStatusFor(ledgerToday, settings).subCap`, which is already computed for the HUD, so the panel adds no query. Read aloud, the two-clause versions are spoken as written — they are short, concrete sentences with no glyphs.

**The same rewrite applies to the help card** (§3.13) and to the gate's closed-screen `extra` line, and all three read from one place: `earningLines(settings, status, accessMode)` in `bounty.ts`, asserted verbatim by `bounty.test.ts`. One source, so the next time the economy gains a door there is one string to change and a test that fails if it is not changed.

**What no version of this line says** is that clearing troubles is *required*, or that it protects anything. It earns time. That is the whole claim, and it is true.

### 3.12 The parent's control

One new setting, one new column, rendered in the existing Realm settings panel beside the daily cap.

```ts
// src/lib/utils/realm-settings.ts
export type RealmSettings = { …; troubleBonusCapMinutes: number };
export const TROUBLE_BONUS_RANGE = { min: 0, max: 30 } as const;
// DEFAULT_REALM_SETTINGS.troubleBonusCapMinutes = 5
```

`settingsFromRow` reads it through the existing `inRange` guard (falling back to 5 for a malformed value), and `validateRealmSettingsPatch` gains a `troubleBonusCapMinutes` case. A `0` turns the bounty off; the panel renders that as a switch over a number field, so a parent never has to know that 0 is the off value.

`getRealmPlaySummary` gains `bonus`, so the panel can show where a day's minutes came from:

```ts
export async function getRealmPlaySummary(childId: string, date: string):
  Promise<{ date: string; balance: number; spent: number; bonus: number }>;
```

### 3.13 The true help card

The clause `Clear troubles to protect the sites` was true of nothing and it shipped. Slice 1 deletes it. This slice writes the replacement, and the replacement is conditional on the promise actually being keepable:

```ts
export function helpGroups(touch: boolean, ceremony: boolean, bounty: boolean): HelpGroup[];
```

`RealmShell` passes `bundle.bounty.enabled` — computed server-side from the hero's Realm settings, so the card is correct the instant it opens, with no round trip to wait for. `realm-help.test.tsx` is updated in the same commit; the existing assertions on the Cast strings are replaced with assertions on both branches.

### 3.14 Every visible string, verbatim

**Trouble names** (already written at troubles.ts:24-26; this slice is the first thing that renders them):

| kind | gentle | monsters |
|---|---|---|
| fog | `Fog` | `Mist-wisp` |
| cursed-stone | `Cursed stone` | `Gargoyle` |
| shadow-blob | `Shadow` | `Blob` |

**Clear notices** (unchanged, and now they name a word the child has read on the thing they zapped):

| kind | gentle | monsters |
|---|---|---|
| fog | `The fog thins.` | `The mist-wisp scatters!` |
| cursed-stone | `The stone's curse lifts.` | `The gargoyle crumbles!` |
| shadow-blob | `The shadow slips away.` | `The blob bounces off!` |

**The reward tag** (rises off the death beat, 900 ms):

- paid: `+1 min`
- unpaid (cap reached, bounty off, or the purse is not yet known): `Cleared!`

**The cap message**, shown once per visit in the centred lane the first time a clear pays nothing because the day's allowance is used up:

- on screen: `That's all the extra time for today. Come back tomorrow for more.`
- read-aloud: `That is all the extra time for today. Come back tomorrow for more.`

**The aria-live announcement** on a clear, into slice 1's polite lane:

- paid: `The fog thins. You earned one more minute in the Realm.`
- unpaid: `The fog thins.`
- (the first sentence is `clearNotice(kind, skin)`; the second is fixed, and it is `one more minute` in words, not `+1 min`, because a screen reader reading `+1` says "plus one".)

**The dazzle notice**, replacing `You lost focus for a moment.`, in the centred lane:

- gentle: `The shadow bumped you. Give it a moment.`
- monsters: `The blob bumped you! Give it a moment.`
- read-aloud: as written above.
- aria-live: `Dazzled. Your hero moves again in a moment.`

**The hero plate's status row** (`src/lib/realm/hero-status.ts`):

| id | label | spoken | icon | tone |
|---|---|---|---|---|
| `dazzled` | `Dazzled` | `Your hero is dazzled and will move again in a moment.` | `sparkles` | `warn` |
| `shielded` | `Shielded` | `Your hero is shielded.` | `shield` | `good` |

**The help card's Cast group**, replacing the false clause:

- keyboard, bounty on: `Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble. Clear the troubles and you earn more time in the Realm.`
- touch, bounty on: `Tap a spell page, then tap where the spell should go. Clear the troubles and you earn more time in the Realm.`
- keyboard, bounty off: `Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.`
- touch, bounty off: `Tap a spell page, then tap where the spell should go.`

**The closed screen**, when minutes were banked after the gate shut (`RealmClosed` gains an optional `extra?: string`):

- plural: `You earned 3 more minutes for clearing troubles. They're saved for your next visit today.`
- singular: `You earned 1 more minute for clearing troubles. It's saved for your next visit today.`

**Errors** (all in the HUD's existing error lane, each with the existing **Try again**):

- bounty write failed: `The Realm couldn't save your extra minutes.`
- bounty read failed at open: *(silent — the purse stays unknown, the tag says `Cleared!`, and nothing is promised. A child is never shown an error for a feature they have not tried to use yet.)*
- `assertClears` (server, never expected to reach a child): `Cleared troubles must be a whole number from 1 to 12.`

**Parent settings panel** (`RealmSettingsPanel`, in the fieldset after the daily cap):

- legend: `Clearing troubles`
- switch `aria-label`: `Minutes for clearing troubles`
- on: `Clearing a trouble in the Realm earns 1 extra minute.`
- off: `Clearing troubles earns no extra minutes.`
- hint: `Extra minutes never rise above the minutes earned from quests today, and the daily cap still applies.`
- number field label: `Most extra minutes a day`
- validation error: `Extra minutes a day must be 0–30.`
- shown when `accessMode === "scheduled"`: `Extra minutes need Earned or Both, so the Realm can spend them.`
- summary line: `Today: 12 minutes left · 8 spent · 3 from clearing troubles`

**Nothing above promises anything the code does not do.** The bounty line is suppressed when the bounty cannot pay; the tag says `Cleared!` when it is not paying; the cap line says the truth and offers tomorrow; and no string anywhere says a trouble threatens a site, a building, a villager or a quest, because none of them can.

---

## 4. Data model

### 4.1 The ledger — no migration

`realm_play_ledger.kind` gains `"bonus"`:

```ts
// src/lib/db/schema.ts
kind: text("kind", { enum: ["earned", "granted", "spent", "bonus"] }).notNull(),
// src/lib/utils/realm-access.ts
export type LedgerKind = "earned" | "granted" | "spent" | "bonus";
```

**Verified:** `migrations/0021_round_the_initiative.sql` emits `` `kind` text NOT NULL `` with **no CHECK constraint**, so the enum is a TypeScript-level narrowing only. `drizzle-kit generate` will emit **no SQL** for this change. **Existing rows:** unchanged and unaffected — every historic row is `earned`, `granted` or `spent`, all three still valid, and `ledgerBalance`'s `kind !== "spent"` rule already classified a future `bonus` row correctly. Nothing changes what a stored value *means*, so no one-time message to the child is owed.

### 4.2 `realm_settings` — one column

```sql
ALTER TABLE `realm_settings` ADD `trouble_bonus_cap_minutes` integer DEFAULT 5 NOT NULL;
```

```ts
troubleBonusCapMinutes: integer("trouble_bonus_cap_minutes").notNull().default(5),
```

- **Migration number:** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan.
- **Existing rows:** SQLite's `ADD COLUMN … NOT NULL DEFAULT 5` backfills every existing `realm_settings` row to **5**, so every hero who already exists gets the bounty on at the default ceiling on their next visit. That is the intent: the feature is new, small, and bounded by a cap the parent already set. A hero with **no** `realm_settings` row is unaffected — `loadRealmSettings` inserts one, and Drizzle's default applies.
- **Older client compatibility:** a build that predates the column never selects it (`settingsFromRow` reads named fields), so a rollback is safe in both directions.
- **Verification, checked rather than trusted** (the hook runs `db:migrate` silently): `npm run db:generate`, confirm a new file appears under `src/lib/db/migrations/` and that `migrations/meta/_journal.json` gained exactly one entry; `npm run db:migrate`; then `PRAGMA table_info(realm_settings)` against the local dev database and confirm `trouble_bonus_cap_minutes` is present with `dflt_value = 5` and `notnull = 1`. Production is remote Turso, so the same `PRAGMA` is run against it once after deploy before the feature is announced to a parent.

### 4.3 Per-visit state that is deliberately not persisted

`SpellSim` (troubles, effects, `clearedZones`, hits, fizzles, the tally) is created once per visit and thrown away. Nothing in it is written to the database by this slice; the only durable trace a session leaves is its `bonus` ledger rows. `ClearTally.byKind`, computed on every kill and read by nothing, is finally read — by the full-depth clear chip — but it is still not persisted here. **Slice 13 owns the durable record of troubles cleared**, and it will read it from the `bonus` rows plus its own counter; naming the future reader is the reason `byKind` is kept rather than deleted.

---

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| **`getTroubleBounty` fails at open** | The purse stays `{ remaining: 0, known: false }`. Every kill shows `Cleared!` and nothing is promised. No error is shown. The next successful flush seeds the purse. |
| **`recordTroubleBounty` fails** | `unpaidRef` is **not** cleared, so the clears carry into the next flush (exactly the discipline `usePlayClock.settle` already uses for pending minutes). The HUD shows `The Realm couldn't save your extra minutes.` with **Try again**, which flushes both the clock and the bounty. |
| **The visit ends with unflushed clears** | The unmount effect runs `Promise.all([clock.flushPending(), flushBounty()])`. If the page is being torn down and the request never lands, the minutes are lost. That is deliberate: the ledger is append-only and losing an arcade bonus is strictly better than double-crediting one. |
| **Minutes land after the gate has shut** | The flush still records them (they are today's ledger, and today is not over). `RealmClosed` shows the `extra` line so the child knows where they went. |
| **A clear is worth nothing because the day's allowance is used up** | The tag reads `Cleared!`; the cap line appears once per visit in the centred lane; the notice and the aria announcement drop the "one more minute" sentence. |
| **`accessMode === "scheduled"`** | `bountyEnabled` is false: no rows are written, the tag never says `+1 min`, and the help card omits the promise. |
| **`troubleBonusCapMinutes === 0`** | Same as above. The parent has turned it off. |
| **`earnedMinutesPerQuest === 0`** | The floor is `max(1, 0) = 1`, so the sub-cap does not collapse to zero and the promise stays keepable at one minute a day. |
| **`dailyCapMinutes` already reached** | `headroom` is 0, `allowance` is 0, nothing is awarded, and `computeRealmAccess` was already returning `cap_reached`. Bonus minutes can never lift a child past the parent's ceiling. |
| **Two effects hit the same trouble on the same frame** (an aura tick plus a beam tick) | The first may clear it; the second is skipped by the `isLive` guard in the hit loop. Exactly one `cleared` event, one death beat, one bounty minute. |
| **A hit references a trouble that has already been reaped** | `findIndex` returns −1 and the hit is dropped, as today. |
| **A trouble dies during its own materialise** | The death beat wins; `spawnedAt` scaling is skipped for a dying trouble. |
| **The reticle's target dies mid-wind-up** | The reticle hides. The cast releases at the point `castTargetFor` froze at `beginCast`; it does not re-aim. |
| **`nearestTroubleOrAhead` with only dying troubles nearby** | They are filtered by `isLive`, so Space aims ahead of the hero as it does with none alive. |
| **A slice-5 prop appears where a trouble is standing** | `driftAway`: a 250 ms fade, no burst, no tag, no tally, no bounty. |
| **A zone's every candidate point is blocked** | `openPointInZone` returns null after its 24 attempts; the zone is skipped this frame and retried next frame. The cap is a maximum, never a quota, so a temporarily crowded world simply has fewer troubles. |
| **The hero stands in a zone that is due a spawn** | `CLEAR_FROM_HERO` 7 rejects it. If every candidate in the zone is inside that radius, nothing spawns there while the child stands there — which is the correct behaviour, not a bug. |
| **Parent preview** (`isChildView: false`) | `spellsEnabled` is false, so no cast, no hit, no kill, no bounty. `StepOptions.canDazzle` is false, so a blob touching a previewing parent's hero pushes back but never dazzles and never freezes the scene. Nameplates, alert tells, ground shadows and the redrawn figures all render — a parent should see exactly what their child sees. The purse stays unknown; no tag ever appears. `heroStatuses` returns `[]`. |
| **`fewerChoices`** | Unchanged by this slice's mechanics; see §6. |
| **A child clears more than 12 troubles between two flushes** | Impossible under `CLEARS_PER_FLUSH = 3` plus the idle timer, but `assertClears` bounds the server anyway and the shell clamps the batch to `MAX_CLEARS_PER_CALL`, carrying any remainder to the next flush. |

---

## 6. Accessibility — per learning-profile setting, and the complexity axis

**The complexity axis.** Every surface below is read from slice 1's `surfacesFor(depth, profile)` in `src/lib/realm/depth.ts`; this slice invents no rule of its own. It adds four keys to slice 1's `Surfaces` record:

| Key | Simple depth | Full depth |
|---|---|---|
| `troubleNames` | `false` — the plate shows the `⚠` glyph and the pip row only, no words | `true` — the plate shows the name from `TROUBLE_COPY` |
| `troubleHitPips` | `false` — damage reads through the cracked texture alone | `true` — the pip row is drawn on the plate for kinds with `maxHits > 1` |
| `clearCount` | `false` — no running tally on screen | `true` — a `Cleared 4` chip on the ability bar's status row |
| `bountyLedgerLine` | `false` | `true` — the corner clock's tooltip/aria text names the source: `12 minutes left, 3 of them from clearing troubles` |

Every simple-depth surface is a **substitution, never a removal**. A six-year-old still sees a plate (it just carries a glyph instead of a word), still sees damage (through the crack), and still gets the reward (`+1 min` — the numeral stays at both depths, because minutes are the app's unit and the corner clock is already a numeral; hiding it at simple depth would remove the reward rather than substitute for it). **Depth is never a word a child reads**, here or anywhere.

The two invariants that hold at both depths: `fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `"earned"` — neither is touched by this slice, and this slice adds no ability, no slot and no tracked objective.

**Per setting:**

| Setting | What this slice does |
|---|---|
| **reducedMotion** | The non-negotiable. Today `motion` gates the only combat particle, so reduced motion erases 100% of combat feedback. Here, **every cue has a non-motion substitute and none is removed**: hurt flash → same colour lerp held flat; hurt punch/recoil → dropped, the flash carries it; death squash/spin/burst → 250 ms fade plus a static violet star; hit spark → a static ground ring decal at the hit point; cast orb growth → the orb drawn at 60% and held; closing ground ring → drawn at its final radius; reticle pulse → a static bracket; dizzy stars → three static stars fading over the window; dazzle vignette → drawn without a fade-in; clock gain pulse → the numeral held gold for 1200 ms; materialise scale-in → a 200 ms opacity fade; trouble bob → none, as today. Fog is **no longer frozen** (troubles.ts:163): it moves at 0.25× — smooth, slow locomotion is not the thing this setting exists to prevent, and a frozen enemy is indistinguishable from a bound one. |
| **lowStimulus** | **Mutes, does not empty.** Kept: every face, every outline, every ground shadow, every nameplate, the alert tell, the hurt flash, the death fade, the reward tag. Dropped: fog motes, the orbiting sparkles, the particle bursts (replaced by the static star), the dazzle vignette drops to 0.18 opacity, the violet keys desaturate 30% toward the calm tint. Behaviour: `LOW_STIMULUS_MAX` 3 troubles, blob sense 4 units at 0.6× after a 600 ms tell, `RETREAT_MS` 6000. Calm mode is quieter and slower — it is not six pieces of furniture. |
| **largerText** | The nameplate canvas is rasterised at `hudScale` (1 or 1.25) so a plate is legible for a largerText hero; the reward tag and the cap line live in slice 1's centred lane, which is already scaled. globals.css:243-246 scopes `data-larger-text` to `.realm-panel` only, so anything drawn into the world must carry the scale itself — the plate rasteriser takes it as a parameter rather than relying on CSS. |
| **fewerChoices** | No new choice is added anywhere: no picker, no menu, no mode. The bounty is automatic; the tag is not a control. |
| **readAloud** | `speak()` is wired to three moments, each behind a last-spoken ref so re-renders do not stutter it: the first paid clear of a visit (`You earned one more minute in the Realm.`), the cap line, and the dazzle notice. Every clear is **not** spoken — six clears a minute would be intolerable. All three read-aloud strings are written for speech in §3.14 (`+1 min` is never spoken; `one more minute` is). |
| **inputMode (touch/keyboard/auto)** | Touch: the reticle matters more, because a tap targets a point and the child needs to see what was selected; world touch targets stay at slice 1's 56 px and troubles gain **no** pointer handler — tapping a trouble while a page is selected casts at it, which is what `castTargetFor` already does. Keyboard: Space's silent `nearestTroubleOrAhead` pick is now shown by the reticle, which is the single largest legibility win in §3.7 for a keyboard hero. Help copy branches on `settings.showStick` exactly as `helpGroups(touch, …)` already does. |
| **soundEnabled** | No sound ships here — slice 9 owns the cue synth. This slice ships the **events** slice 9's cue table needs (`hit`, `cleared`, `focusLost`, `alert`, `castState`, `shield`) and nothing in this spec assumes an audio channel exists. No string promises a sound. |
| **aria-live** | The clear notice, the cap line and the dazzle notice all set the notice string **regardless of `readAloud`**, so slice 1's polite lane announces them for free. The alert tell is visual only and deliberately not announced: six troubles noticing a walking child would flood the lane. |

---

## 7. Testing

### Unit-testable (Vitest, jsdom, no three at module load)

**`src/lib/realm/spells/bounty.test.ts`** — the largest of the new suites, because it is the economy:

- `bonusMinutesFor(1, [], defaults)` awards 1; `(6, …)` awards 5 and reports `capped: true`.
- The sub-cap formula at each binding term: parent cap binds at defaults; `questMinutesToday` binds when the cap is raised to 30 and the child has done one quest; the floor binds when the child has done none.
- `earnedMinutesPerQuest: 0` → floor 1, not 0.
- `troubleBonusCapMinutes: 0` → `bountyEnabled` false, award 0.
- `accessMode: "scheduled"` → `bountyEnabled` false, award 0. `"both"` and `"earned"` → true.
- `dailyCapMinutes` headroom binds: with 30 spent of 30, award 0 even with allowance left.
- Idempotence over the ledger: awarding twice with the first award's rows present never exceeds the sub-cap.
- `takeBountyMinute` on an unknown purse returns `paid: false` and does not decrement.
- `applyAward` lets the server's `remainingMinutes` overwrite a drifted client value in both directions.

**`src/lib/realm/spells/troubles.test.ts`** (rewritten — the existing suite constructs troubles by hand and asserts on `siteId`, so it moves in the same commit):

- `spawnTroubles` places one trouble per zone up to the cap, deterministically for a seed, never within `CLEAR_FROM_HERO` of the hero, never inside a collider, never on a road, and **still spawns when every foundation is built** (the 8-of-8 regression that objection (a) is about).
- `spawnTroubles` prefers `objectiveZoneId` first.
- A dying trouble still occupies its zone: `spawnTroubles` does not double-fill a zone during a death beat.
- `reapTroubles` removes at `now >= dyingUntil` and not before; `isLive`/`liveTroubles` agree.
- `applyHit` sets `hurtUntil` and a `hurtDir` pointing away from `at`; a null `at` gives the north fallback; a coincident `at` gives the north fallback.
- `applyHit` on a 2-HP stone returns `cleared: false` then `cleared: true`, and `maxHits` never changes.
- `stepTroubles` does not move, chase, alert or dazzle a dying trouble.
- The recoil tween lands exactly on `pushback`'s validated endpoint at `PUSH_MS` and never inside a collider at any intermediate `t`.
- Calm mode: the blob **does** approach under `lowStimulus` (the direct inversion of today's behaviour at troubles.ts:160), at 0.6× inside 4 units, after `ALERT_CALM_MS`.
- reducedMotion: the fog **moves** (the inversion of troubles.ts:163), at 0.25×.
- `canDazzle: false` (parent preview) → `focusLost` never true.
- `troubleName` / `clearNotice` return every one of the twelve strings in §3.14 for both skins.

**`src/lib/realm/spells/effects.test.ts`** (extended): every one of the five shapes reports a hit with a sensible `at`; a projectile that expires by range reports a `fizzle` with `reason: "range"` and **no** hit; one that hits a wall reports `reason: "wall"`; an area that expires having hit nothing reports `reason: "expired"` and no hit. This is the direct test of the burst-on-miss bug.

**`src/lib/realm/spells/caster.test.ts`** (extended): `beginCast` stores `targetTroubleId` and defaults it to null; `castProgress` is 0 before the cast, monotonic across the window, clamped to 1, and 0 for a null casting.

**`src/lib/realm/hero-status.test.ts`**: `heroStatuses` orders `dazzled` first, returns `[]` when both are false, and every label and spoken string matches §3.14.

**`src/lib/realm/palette.test.ts`** (slice 5's module, this slice's assertion): no environment colour is within ΔRGB 90 of either violet key.

**`src/lib/utils/realm-access.test.ts`** (extended): a ledger with `bonus` rows credits the balance; `minutesSpent` ignores them; `computeRealmAccess` caps a bonus-rich day at `dailyCapMinutes` and returns `cap_reached` rather than allowing the overflow.

**`src/lib/utils/realm-settings.test.ts`** (extended): `troubleBonusCapMinutes` round-trips, clamps out-of-range to the default, and rejects 31 and −1 with the §3.14 error text.

**`src/components/realm/realm-help.test.tsx`** (updated in the same commit): all four Cast strings from §3.14, and an assertion that no help string contains `protect`.

**`src/lib/realm/spells/no-gating.test.ts`** — the ruling, as a test. It reads the source of every surface that could gate a child's schoolwork — `src/components/realm/deed-panel.tsx`, `src/components/realm/site-card.tsx`, `src/lib/actions/deeds.ts`, `src/lib/realm/kingdom-state.ts`, and (from slice 6) the door module — and asserts that none of them mentions `trouble`, `Trouble`, `cleared`, `clearedZones` or `bounty` in any form. A source-reading test is the only kind that can assert an *absence* across files, and this absence is the promise decision 3 makes.

**`src/components/realm/use-spell-sim.test.ts`** (extended): a clear emits exactly one `cleared` event even when two effects land on the same frame; `hits` and `fizzles` are replaced (not appended) each frame; the trouble stays in the array for `DYING_MS`; the zone's respawn timer starts at the kill, not at the reap.

### Needs the browser pass (port 3100, `?preview`, per `reference_local_screenshot_setup.md`)

Unit tests cannot judge any of this, and the browser pass is the real acceptance criterion:

1. **The screenshot that started this.** Same framing as the user's photograph, gentle skin: does the thing in the field read as a creature? Before/after, side by side.
2. **The `/dev/figures` gallery** (slice 2): all six figures at true display size against the real grass, in both palettes, next to the decor rock and the bush — is the violet key doing its job, and is any silhouette confusable with scenery?
3. **Kill three troubles with two or more alive** and confirm nothing teleports or changes species. This is the bug that "will read to the user as the game glitching".
4. **Hit the cursed stone once** and confirm the crack, the pip and the flash all land.
5. **Cast every one of the six shapes** (bolt, orb, burst, wall, beam, shield, sprite, aura) and confirm each produces a spark at a real hit point — beam and aura are silent today.
6. **Cast with Space** and confirm the reticle appears on the trouble the game silently picked.
7. **Get dazzled** and confirm the blob slides rather than teleports, the stars spin, the vignette shows, and the notice is centred.
8. **Turn reducedMotion on and repeat 3–7.** Nothing may be invisible.
9. **Turn lowStimulus on** and confirm calm mode is quieter, not empty: the blob still comes, slowly, with a long tell.
10. **Clear a trouble and watch the corner clock go up.** This is the beat the whole second half of the slice exists for.
11. **Clear past the cap** and confirm the tag changes to `Cleared!` and the cap line appears exactly once.
12. **Build all eight buildings** (or seed a completed kingdom) and confirm troubles still spawn — objection (a), in the browser.
13. **Parent preview**: figures, plates and tells render; nothing can be cast; no tag; no status row; a blob bump does not freeze the parent's view.
14. **Measure first paint cold and warm** against the ≤ 25 ms / 0 ms budget in §3.10(c).

---

## 8. Interfaces

### Produces — exact names later slices consume

**`src/lib/realm/spells/troubles.ts`** (extended)

```ts
// The FULL accumulated shape. `zoneId` and `nearSiteId` are slice 4's; the rest of the new fields are this slice's.
export type Trouble = { id: string; kind: TroubleKind; position: Vec2; origin: Vec2; drift: Vec2;
  zoneId: string;                    // slice 4 (renamed from siteId)
  nearSiteId: string | null;         // slice 4 — the nearest site within 8 units. THIS SLICE'S NAMEPLATES
                                     // AND CLEAR NOTICES READ IT ("the fog by the Mill"); it must not be dropped.
  hitsLeft: number; maxHits: number; statuses: TroubleStatus[]; spawnedAt: number; retreatUntil: number;
  alertedAt: number; hurtUntil: number; hurtDir: Vec2; dyingUntil: number;
  recoil: { from: Vec2; to: Vec2; until: number } | null };
// The FULL accumulated shape. Everything but `objectiveZoneId` is slice 4's.
export type SpawnInput = { seed: number; now: number; layout: WorldLayout; troubles: Trouble[];
  lowStimulus: boolean;
  zones: readonly SpawnZone[]; clearedZones: Record<string, number>; hero: Vec2;   // slice 4
  districts?: DistrictId[] | null;                                                 // slice 4
  objectiveZoneId?: string | null };                                               // NEW here
export type StepOptions = { now: number; lowStimulus: boolean; reducedMotion: boolean; shielded: boolean; dazzled: boolean; canDazzle: boolean };

export const HURT_MS: 180; export const DYING_MS: 350; export const MATERIALISE_MS: 400;
export const ALERT_MS: 400; export const ALERT_CALM_MS: 600; export const PUSH_MS: 200;
export const CLEAR_FROM_HERO: 7; export const BLOB_SENSE_CALM: 4; export const CALM_SPEED: 0.6;
export const FOG_TETHER: 5; export const REDUCED_FOG_SPEED: 0.25;

export function spawnTroubles(input: SpawnInput): Trouble[];
export function stepTroubles(troubles: Trouble[], hero: Vec2, dt: number, colliders: Prop[], opts: StepOptions):
  { troubles: Trouble[]; focusLost: boolean; focusLostKind: TroubleKind | null; alerted: string[] };
export function applyHit(trouble: Trouble, spell: SpellDefinition, now: number, at: Vec2 | null): { trouble: Trouble; cleared: boolean };
export function isLive(t: Trouble): boolean;
export function liveTroubles(ts: Trouble[]): Trouble[];
export function killTrouble(t: Trouble, now: number): Trouble;
export function driftAway(t: Trouble, now: number): Trouble;
export function reapTroubles(ts: Trouble[], now: number): Trouble[];
export function troubleName(kind: TroubleKind, skin: TroubleSkin): string;
export function clearNotice(kind: TroubleKind, skin: TroubleSkin): string;
export function objectiveZoneFor(layout: WorldLayout, zones: readonly SpawnZone[]): string | null;
```

**`src/lib/realm/spells/bounty.ts`** (new) — the full signature list is in §3.11. The names slices 9, 12 and 13 will use: `MINUTES_PER_CLEAR`, `BountySettings`, `BountyStatus`, `BountyAward`, `BountyPurse`, `bountyEnabled`, `bountySubCap`, `bountyStatusFor`, `bonusMinutesFor`, `bonusMinutesToday`, `startPurse`, `seedPurse`, `applyAward`, `takeBountyMinute`.

**`src/lib/realm/hero-status.ts`** (new) — `HeroStatusId`, `HeroStatus`, `HERO_STATUS`, `heroStatuses`.

**`src/lib/realm/spells/effects.ts`** (extended) — `EffectHit` now carries `at: Vec2`; `EffectFizzle = { effectId: string; at: Vec2; color: string; reason: "range" | "wall" | "expired" }`; `stepEffects` returns `{ effects, hits, spawned, fizzles }`.

**`src/lib/realm/spells/caster.ts`** (extended) — `Casting.targetTroubleId: string | null`; `beginCast(…, targetTroubleId?: string | null)`; `castProgress(casting, now): number`.

**`src/lib/realm/sprite-texture.ts`** (extended) — `PlateStyle`, `textToTexture(text, style): Promise<CanvasTexture>`. Slice 10's signboard and slice 13's attribution plate should use this rather than adding a second rasteriser.

**`src/components/realm/trouble-figures.tsx`** — `TroubleFigure({ kind, skin, hurt?, size? })`.

**`src/components/realm/use-spell-sim.ts`**

```ts
export type HitFlash = { x: number; z: number; color: string };
// The FULL accumulated union, diffed against slice 3. A spec republishing a union it did not
// originate must show the whole thing and say what it changed; this one adds `hit`, `alert`,
// `shield` and `dying`, widens `focusLost`, and CHANGES NOTHING ELSE.
export type SpellEvent =
  | { kind: "mana"; current: number }
  | { kind: "cleared"; troubleKind: TroubleKind; count: number }
  | { kind: "hit"; troubleId: string; hitsLeft: number }                              // NEW here
  | { kind: "dying"; troubleId: string; troubleKind: TroubleKind }                    // NEW here
  | { kind: "alert"; troubleKind: TroubleKind }                                       // NEW here
  | { kind: "shield"; on: boolean }                                                   // NEW here
  | { kind: "refused" }
  | { kind: "focusLost"; troubleKind: TroubleKind }                                   // troubleKind added here
  | { kind: "castState"; casting: boolean; slot: number; castMs: number };            // slot/castMs are SLICE 3's — PRESERVED
// `dying` fires once, at the top of the 350 ms death beat this slice already models internally via
// `dyingUntil`. It is published because slice 9's `cueForSpellEvent` needs a death moment to map a
// cue from, and because the beat is already being computed — not emitting it was an oversight.
// `castState` keeps `slot` and `castMs`: slice 3's whole cast-progress sweep (`beginSweep`,
// `--cast-ms`, `.realm-slot[data-casting="on"]`) reads both, and dropping them would delete the
// only cast feedback in the game.
// SpellSim: lastVanished removed; hits: HitFlash[] and fizzles: HitFlash[] added.
// `clearedSites → clearedZones` was done in SLICE 4 and is not re-performed here.
```

**`src/components/realm/spell-layer.tsx`** — new prop `purseRef: RefObject<BountyPurse>`; new prop `surfaces: Surfaces` (slice 1's type). Both are referentially stable.

**`src/components/realm/realm-scene.tsx`** — `RealmSceneProps` gains `purseRef: RefObject<BountyPurse>`. No other prop changes; `zones` and `objectiveZoneId` are derived inside the sim from module constants and the existing `layout`, precisely so the memoised `World` is not disturbed.

**`src/components/realm/use-play-clock.ts`** — the returned object gains `refresh: () => Promise<void>`.

**`src/components/realm/realm-help.tsx`** — `helpGroups(touch: boolean, ceremony: boolean, bounty: boolean): HelpGroup[]`.

**`src/components/realm/realm-closed.tsx`** — `RealmClosed({ heroName, body, extra? }: { heroName: string; body: string; extra?: string })`.

**Server actions, `src/lib/actions/realm-play.ts`**

```ts
export async function getTroubleBounty(childId: string, date: string): Promise<BountyStatus>;
export async function recordTroubleBounty(childId: string, date: string, clears: number): Promise<{ awarded: number; status: BountyStatus }>;
export async function getRealmPlaySummary(childId: string, date: string): Promise<{ date: string; balance: number; spent: number; bonus: number }>;
```

**`src/lib/actions/realm.ts`** — `RealmBundle` gains `bounty: { enabled: boolean; capMinutes: number }`, computed from the hero's Realm settings inside the existing parallel read batch (no extra round trip, no date needed).

**Schema and utils** — `realm_play_ledger.kind` enum gains `"bonus"`; `LedgerKind` gains `"bonus"`; `realm_settings.trouble_bonus_cap_minutes` / `RealmSettings.troubleBonusCapMinutes`; `TROUBLE_BONUS_RANGE = { min: 0, max: 30 }`.

**Depth keys read from slice 1's closed `Surfaces` table** — `troubleNames: boolean`, `troubleDetail: boolean`, `troubleHitPips: boolean`, `clearCount: boolean`, `bountyLedgerLine: boolean`. All five are already published (first-impression §3.1); **this slice adds nothing to `depth.ts`.**

**CSS class names** (globals.css, `.realm-*` namespace) — `.realm-dazzle` (the vignette), `.realm-clock--gained` (the upward pulse), `.realm-status-row`, `.realm-status--warn`, `.realm-status--good`. Everything else this slice draws is a canvas texture or a three object and carries no class.

**Route paths** — none added. `/dev/figures` (slice 2) gains the six new figures and their `hurt` variants; that is a page slice 2 owns.

### Consumes — from earlier slices

| From | What | Exact names required |
|---|---|---|
| Slice 1 | The centred message lane, for the clear notice, the dazzle notice and the cap line | one message at a time under the documented priority; this slice's messages enter at the `notice` tier |
| Slice 1 | The hero identity plate, for the status row | the plate accepts `statuses: HeroStatus[]`; if it does not, this slice adds the slot, and the type is defined here |
| Slice 1 | `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` and the `Surfaces` type | this slice adds four keys, invents no rule |
| Slice 1 | `layout` props carrying `focus`, read by `objectiveZoneFor` | the flag slice 1 puts on the objective site |
| Slice 1 | `clock.flushPending()` on unmount | this slice adds `flushBounty()` alongside it in the same `Promise.all` |
| Slice 2 | Raster scale derived from zoom and world size; `spriteMaterial.center = (0.5, 0)` baseline anchoring | this is what lets troubles sit at y = 0 with a real ground shadow instead of hanging at y = 0.9 |
| Slice 2 | Parallelised `SpriteSource` awaits and a cache warm across a short round trip | the +6 kinds budget in §3.10(c) assumes both |
| Slice 2 | `/dev/figures` | the acceptance surface for the redraw |
| Slice 3 | The ability bar's status row | where the full-depth `Cleared 4` chip lands |
| Slice 3 | The mana strip above the bar | the cast wind-up's refusal shake reads back to it; unchanged by this slice |
| Slice 4 | `src/lib/realm/open-ground.ts` — `SPAWN_ZONES: readonly SpawnZone[]` (ten rectangles), `SpawnZone = { id: string; districtId: DistrictId; bounds: Rect; weight: number }`, `TROUBLE_RULES: OpenGroundRules`, `openPointInZone(zone, layout, seed, rules, hero?): Vec2 \| null`, `zonesFor(districts)`, `zoneAt(p)` | Slice 4's §8.1 is frozen and this is it verbatim. Zones are **rectangles with a weight**, not centres and radii, and there is no `mix` field: **a zone's trouble mix is derived from its `districtId`** (§3.10), which is the same fact expressed once instead of twice. The placement call is `openPointInZone`, not `openGroundPoint`. |
| Slice 4 | `roadPath()` from `village.ts` | not used — this slice adds no cross-map route |
| Slice 5 | `ENVIRONMENT_COLORS: readonly string[]` from `src/lib/realm/palette.ts` | the input to the violet-key lock test |
| Slice 6 | The door module | read (not imported) by `no-gating.test.ts` |

---

## 9. Out of scope

- **Sound.** No cue, no `AudioContext`, no `soundEnabled` wiring. This slice ships the `SpellEvent` variants slice 9's cue table needs (`hit`, `cleared`, `alert`, `focusLost`, `shield`, `castState`) and nothing more. **Slice 9, `sound-and-first-five-minutes`.**
- **The tutorial's combat steps** — "meet one trouble", "cast" — and holding the first trouble spawn until its own step. **Slice 9.**
- **Persisting the clear tally as a durable record.** The only durable trace this slice leaves is `bonus` ledger rows. `ClearTally.byKind` is finally read (by the full-depth chip) but still not written to the database. **Slice 13, `record-of-the-work`,** which owns the session report and the long arc.
- **The Tavern board line for troubles cleared** ("Emma cleared six troubles yesterday"). **Slice 6 owns the board; slice 13 owns what it says about combat.**
- **Status-effect rendering** — the ice tint for `bound`, the blue shift for `chilled`/`slowed`, the frost ring. There is **no spell-visual pass** in the thirteen slices, so deferring it to one would be deferring it to nothing. It is **taken here**, in reduced form, because the finding is real (a child who builds a Freeze spell has no way to know it worked, and `speedFactor` already handles bound/chilled/slowed while `SpellLayer` never reads `statuses`) and because this slice is already rewriting the trouble figure's material every frame for the hurt flash:

  `TroubleFigure` gains one more optional prop, `status: "none" | "chilled" | "bound"`, derived by a pure `dominantStatus(t.statuses)` in `troubles.ts`. `chilled` multiplies the material colour toward `#bcd8e8` at 0.35; `bound` holds it at 0.6 and adds a two-frame static frost ring decal at `GROUND_Y.propShadow` sized from `TROUBLE_RADIUS`. **Both are colour and a static decal, never motion**, so the `reducedMotion` substitute is the effect itself. Cost: one more branch in a material update that already exists, one decal, and **no new raster kind** — the frost ring is a ring geometry with a flat material, like slice 1's hero ring.

  What is still deliberately out: per-status particles, a status row on the trouble's plate, and any status the spell system does not already apply. This is "you can see it worked", not a status-effect system.
- **A trouble that threatens anything.** No trouble may dim a site, haze a foundation, slow a build or block a door. This is not deferred — it is declined, by decision 3 and ruling D8.8.
- **Hero health, hearts, damage, defeat or a fail state.** Declined by ruling D8.7, permanently.
- **New trouble kinds.** Three kinds, two skins, six figures. A fourth kind is a new rasterisation kind, a new nameplate, a new spawn weight and a new balance question, and there is no complaint asking for one.
- **Recess interaction with troubles** — whether a lap ring crossing a trouble should do anything. **Slice 12, `recess-that-counts`.**
- **The keep's and the plots' reaction to a cleared world.** **Slice 10, `plots-signs-and-the-keep`.**
- **Camera changes of any kind.** The programme's only camera change is slice 4's reframing for the 64-unit world. Nothing here moves, shakes or zooms the camera — including on a kill, which is the obvious temptation and is exactly what `reducedMotion` exists to prevent.
