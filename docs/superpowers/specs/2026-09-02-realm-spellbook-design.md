# Realm Spellbook — Design

**Date:** 2026-09-02
**Slice:** 2 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slice 1, `2026-09-02-realm-foundations-design.md`)
**Status:** Approved in brainstorming; awaiting written-spec review

## Goal

Give every hero a personal spellbook without any AI: spells are assembled from a fixed catalog of
parts (element + form + optional modifier), parts unlock through schoolwork, and each spell is named
from a curated word bank. The resolved spell definition is the contract the 3D slices will cast. When
this slice ships a hero can build, name, and keep spells on a new Spellbook page; a parent can steer
which subjects feed which school of magic and award specific parts as quest rewards.

## Non-goals

No casting, mana pools, 3D visuals, drill-mastery unlocks (slice 3), or sharing spells between
siblings. No free-text names.

## A. Catalog and spell resolution

### Parts

`src/lib/utils/spell-catalog.ts` exports three lists, following the avatar-catalog pattern.

Shared types:

```ts
export type SpellSchool = "element" | "form" | "modifier";
export type SpellUnlock =
  | { type: "free" }
  | { type: "level"; level: number }
  | { type: "badge"; badgeId: string; badgeName: string }
  | { type: "quest" }
  | { type: "school"; school: SpellSchool; count: number };
export type StatusKind =
  | "slowed" | "bounce" | "seeking" | "grown" | "mended" | "bound" | "quickened" | "chilled";
export type SpellStatus = { kind: StatusKind; durationMs: number }; // 0 = for the spell's lifetime
```

**Elements** (`SpellElement = { id, label, adjectives: [string, string, string], color, particle, unlock, onHit?: SpellStatus }`):

| id | label | adjectives | color | particle | unlock | onHit |
|---|---|---|---|---|---|---|
| ember | Ember | Ember, Cinder, Blaze | #f97316 | sparks | free | — |
| tide | Tide | Tide, Ripple, Wave | #3b82f6 | droplets | free | — |
| stone | Stone | Stone, Pebble, Boulder | #a16207 | pebbles | school element 5 | — |
| gale | Gale | Gale, Breeze, Zephyr | #22d3ee | wisps | school element 15 | — |
| light | Light | Radiant, Sunlit, Gleaming | #fde68a | motes | level 10 | — |
| shadow | Shadow | Umbral, Dusk, Shade | #6d28d9 | smoke | school element 30 | — |
| frost | Frost | Frost, Rime, Glacial | #bae6fd | crystals | badge `badge-streak-7` "Week Warrior" | chilled 800 |
| storm | Storm | Storm, Thunder, Tempest | #818cf8 | bolts | quest | — |
| bloom | Bloom | Bloom, Petal, Verdant | #4ade80 | petals | quest | — |

**Forms** (`SpellForm = { id, label, nouns: [string, string, string], icon: GameIconName, shape, manaCost, castMs, range, speed, unlock }`; `shape` is `"projectile" | "area" | "barrier" | "beam" | "summon" | "self"`):

| id | label | nouns | icon | shape | mana | cast ms | range | speed | unlock |
|---|---|---|---|---|---|---|---|---|---|
| bolt | Bolt | Bolt, Dart, Lance | lightning | projectile | 10 | 300 | 12 | 14 | free |
| orb | Orb | Orb, Sphere, Globe | gem | projectile | 15 | 500 | 10 | 8 | free |
| burst | Burst | Burst, Nova, Flare | sparkles | area | 20 | 600 | 4 | 0 | school form 5 |
| wall | Wall | Wall, Rampart, Bulwark | stoneTower | barrier | 25 | 800 | 6 | 0 | school form 15 |
| beam | Beam | Beam, Ray, Shaft | sun | beam | 20 | 400 | 14 | 0 | level 10 |
| shield | Shield | Shield, Ward, Aegis | shield | self | 15 | 300 | 0 | 0 | school form 30 |
| sprite | Sprite | Sprite, Wisp, Familiar | bee | summon | 30 | 900 | 8 | 6 | badge `badge-volume-25` "Dedicated Scholar" |
| aura | Aura | Aura, Halo, Mantle | fireRing | self | 25 | 700 | 5 | 0 | quest |

**Modifiers** (`SpellModifier = { id, label, suffix, icon, status: SpellStatus, manaCostDelta, unlock }`). "None" is represented by `modifierId: null`, never a catalog entry:

| id | label | suffix | icon | status (kind, ms) | mana Δ | unlock |
|---|---|---|---|---|---|---|
| slow | Slow | of Slowing | hourglass | slowed 2000 | +5 | free |
| bounce | Bounce | of Bouncing | compass | bounce 0 | +5 | school modifier 5 |
| seek | Seek | of Seeking | telescope | seeking 0 | +10 | school modifier 15 |
| grow | Grow | of Growing | upgrade | grown 0 | +10 | level 10 |
| mend | Mend | of Mending | flower | mended 0 | +10 | school modifier 30 |
| bind | Bind | of Binding | link | bound 1500 | +15 | badge `badge-streak-30` "Monthly Master" |
| quicken | Quicken | of Quickening | timer | quickened 0 | +5 | quest |

Range and speed are in world units the 3D slices define; `castMs` is milliseconds. Tone (gentle vs
monsters) is a rendering concern for later slices; descriptions here use neutral verbs ("clears",
"dazzles", "holds").

### Unlock evaluation

```ts
export type SpellUnlockContext = {
  level: number;
  earnedBadgeIds: string[];
  questUnlockedIds: Set<string>;                 // itemIds from child_avatar_unlock with spell categories
  schoolCounts: Record<SpellSchool, number>;     // all-time activity counts per school
};
export function isSpellPartUnlocked(unlock: SpellUnlock, ctx: SpellUnlockContext): boolean;
export function unlockedPartIds(ctx: SpellUnlockContext): Set<string>;   // across all three lists
export function spellUnlockHint(unlock: SpellUnlock, ctx, subjectNamesBySchool: Record<SpellSchool, string[]>): string | null;
```

Hint copy examples: "Reach level 10.", "Earn the Week Warrior badge.", "A grown-up can award this
as a quest reward.", "Log 12 more Reading or History quests." (count remaining, subject names from
the hero's own subjects; if no subject feeds that school: "Ask a grown-up to point a subject at the
School of Elements."). `null` when unlocked.

### Resolution

```ts
export type SpellParts = { elementId: string; formId: string; modifierId: string | null };
export type SpellDefinition = {
  parts: SpellParts;
  color: string; particle: string; shape: SpellForm["shape"];
  manaCost: number; castMs: number; range: number; speed: number;
  statuses: SpellStatus[];                        // element onHit (if any) then modifier status (if any)
};
export function resolveSpell(parts: SpellParts): SpellDefinition | null;   // null on any unknown id
export function describeSpell(parts: SpellParts): string;                  // "" on unknown ids
```

`manaCost = form.manaCost + (modifier?.manaCostDelta ?? 0)`; `castMs` halves (rounded) when the
modifier is `quicken`; `range` and `speed` come from the form; `grown` is left to the renderer (the
definition only carries the status). Description grammar: "A {form label lowercased} of {element
label lowercased}{, that {modifier verb phrase}}." with verb phrases: slows what it touches / bounces
onward / seeks its mark / grows as it goes / mends the caster / holds its target still / is cast in
a flash; frost adds " It chills." when present.

### Names and slots

`src/lib/utils/spell-names.ts`:

```ts
export function spellNameOptions(parts: SpellParts): { adjectives: string[]; nouns: string[]; suffix: string | null };
export function defaultSpellName(parts: SpellParts): { adjective: string; noun: string };   // first of each
export function isValidSpellName(parts: SpellParts, adjective: string, noun: string): boolean;
export function displaySpellName(parts: SpellParts, adjective: string, noun: string): string; // "Ember Bolt of Slowing"
```

`src/lib/utils/spell-slots.ts`: `spellSlots(level) = Math.min(12, 4 + Math.floor(level / 10))`;
slots are numbered 1..n.

## B. Schools of magic and subjects

### Schema

`subject.spellSchool`: text enum `element | form | modifier | none`, NOT NULL, default `"none"`.
One migration adds the column.

### Defaults and backfill

`src/lib/utils/spell-schools.ts`:

```ts
export type SubjectSchool = SpellSchool | "none";
export function defaultSchoolForSubject(name: string): SubjectSchool;
export const SCHOOL_LABELS: Record<SubjectSchool, string>;   // "School of Elements", "School of Forms", "School of Modifiers", "No school"
```

Name matching is case-insensitive on whole words: reading, writing, ela, english, history, language,
spelling, grammar, literature → element; math, mathematics, arithmetic, algebra, geometry → form;
science, art, music, biology, chemistry, physics → modifier; anything else → none.

- `createSubject` (parent-added and the five defaults in `createChild`) sets `spellSchool` with
  `defaultSchoolForSubject(name)` unless the caller passes one.
- `updateSubject` accepts `spellSchool`.
- `src/lib/db/backfill-spell-schools.ts` (npm script `db:backfill-spell-schools`, same shape as the
  existing backfill scripts) sets the school for every existing subject that is still `none`, by
  name. Safe to re-run: it never overwrites a non-`none` value.

### School counts

`getSchoolCounts(childId): Promise<Record<SpellSchool, number>>` in `src/lib/actions/subjects.ts`:
counts `activity_log` rows joined to `subject` grouped by `spellSchool`, all-time, zeros filled in.
Hero may read their own.

### Subject Manager

Each subject row gains a "School of Magic" `Select` (parent-only) with the four `SCHOOL_LABELS`,
saving through `updateSubject`. A short caption under the manager explains: "Quests logged in a
subject unlock spell parts from its school."

## C. Spellbook data, actions, and quest rewards

### Table `spell`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `childId` | text FK child, cascade | |
| `slot` | integer | 1-based |
| `elementId`, `formId` | text | catalog ids |
| `modifierId` | text, nullable | null = no modifier |
| `adjective`, `noun` | text | word-bank picks |
| `createdAt`, `updatedAt` | timestamp | |

Unique index on `(childId, slot)`; index on `childId`. Same migration as the subject column.

### Quest-reward unlocks

Reuse `child_avatar_unlock` with categories `spellElement`, `spellForm`, `spellModifier`. The quest
`rewardAvatarItem` JSON keeps its `{ category, itemId }` shape. `completeAssignment` and the
revise/reverse path need no change. In `avatar-catalog.ts`, `getQuestUnlockableItems` also returns
the spell parts whose unlock is `quest` (category as above, `item` as `{ id, label, unlock }`),
`CATEGORY_LABELS` gains `spellElement: "Spell Element"`, `spellForm: "Spell Form"`,
`spellModifier: "Spell Modifier"`, and `CATEGORY_ITEMS` gains the three lists, so
`getRewardItemLabel` and the Quest Giver's grouped dropdown work unchanged apart from the new group.
`getChildAvatarUnlocks` already returns `{ category, itemId }`; the spellbook filters the spell
categories out of it.

### Actions (`src/lib/actions/spells.ts`)

- `getSpellbook(childId)` → `{ spells: SpellRecord[]; slots: number; level: number; unlocked: string[]; schoolCounts; subjectNamesBySchool }`. Loads the child (level via `levelFromXp`), badges, quest unlocks, school counts, and subject names; evaluates `unlockedPartIds` once. Hero may read their own.
- `saveSpell(childId, slot, input: { elementId, formId, modifierId, adjective, noun })` → `SpellRecord`. `requireChildAccess(childId, { write: true })` (hero or parent). Rejects: slot outside `1..spellSlots(level)` ("That page of the spellbook isn't open yet."), any part not unlocked for this hero ("That part is still sealed."), invalid name for the parts ("Pick a name from the word bank."). Upserts on `(childId, slot)`. `revalidatePath("/spellbook")` and `/loot`.
- `clearSpell(childId, slot)` — same access; deletes the row if present.

`SpellRecord = { id, slot, elementId, formId, modifierId, adjective, noun }`.

## D. Page, nav, Loot, and tests

### Route `/spellbook`

`src/app/(app)/spellbook/page.tsx`, an async server page shaped like Loot: `requireActor`,
`resolveActiveChild(searchParams.child)`, family/hero empty states, child selector for parents. It
calls `getSpellbook` and renders `<SpellbookBuilder>`.

`src/components/spellbook-builder.tsx` (client):
- **Slot list** (left on wide screens, top on narrow): one card per slot 1..n. A filled slot shows
  `displaySpellName`, three colored part icons, and `describeSpell`; a Clear button. An empty slot
  shows "Empty page" and selects itself for building.
- **Builder**: three grids titled Elements, Forms, Modifiers (Modifiers includes a "None" tile).
  Each tile: icon in the part's color, label; locked tiles are dimmed with a lock icon and the hint
  from `spellUnlockHint` as visible caption (not only a tooltip). Tiles are buttons with
  `aria-pressed` for selection; locked tiles are `aria-disabled`.
- **Name picker**: adjective chips and noun chips from `spellNameOptions`, default preselected,
  the suffix shown read-only; a live preview line with the full name and description.
- **Save** calls `saveSpell` for the selected slot, then `router.refresh()`. Errors from the action
  show in the panel's error box. `reducedMotion` / `lowStimulus` from the learning profile are not
  read here; the builder has no motion beyond focus and selection outlines.
- Parents build for a hero the same way (write access), matching how avatars work.

### Nav and Loot

- `MAIN_NAV` gains `{ href: "/spellbook", label: "Spellbook", icon: "crystalBall", description: "Your book of spells — assemble what you've unlocked and name your magic." }` after Schedule (alphabetical rule).
- Loot page: a small "Spellbook" `GameFrame` card above Claimed Treasures showing "N spells kept · M of T parts unlocked" and a link to `/spellbook`. Uses `getSpellbook` for the counts.

### Access control summary

| Action | Parent | Child (own id) |
|---|---|---|
| getSpellbook, getSchoolCounts | yes | yes |
| saveSpell, clearSpell | yes | yes |
| updateSubject(spellSchool) | yes | no (existing subject gating) |

### Error handling

Actions throw `Error` with player-facing copy (above). `resolveSpell`/`describeSpell` never throw;
unknown ids yield `null`/`""`, and `saveSpell` rejects before writing. `getSpellbook` tolerates
`child_avatar_unlock` rows with unknown item ids (ignored).

### Testing (tests first)

- `spell-catalog.test.ts`: each list has unique ids; every `badge` unlock references a seeded badge id; one case per unlock kind in `isSpellPartUnlocked`; `unlockedPartIds` for a fresh hero contains exactly the free parts; `resolveSpell` math (mana sum, quicken halving, statuses order, frost chill) and `null` on bad ids; `describeSpell` sentences for a plain spell, a modified spell, and frost.
- `spell-names.test.ts`: options match the parts, default is first of each, validation rejects a foreign adjective, display includes the suffix.
- `spell-slots.test.ts`: 4 at level 1, 5 at 10, 12 at 100, capped at 12.
- `spell-schools.test.ts`: default mapping including case and whole-word behavior ("Mathematics" → form, "reading" → element, "Piano" → none). When a name contains words from two schools, the schools are checked in the order element, form, modifier and the first match wins, so "Art History" → element; a test pins that order.
- `spell-unlock-hint` cases inside the catalog test: remaining count, no-subject copy, null when unlocked.
- `spellbook-builder.test.tsx`: locked tile is not selectable; choosing parts updates the name chips; Save calls `saveSpell` with slot, parts, and name; a filled slot renders its description.
- Avatar-catalog test additions: `getQuestUnlockableItems` includes storm/bloom/aura/quicken with spell categories; `getRewardItemLabel` renders "Spell Element: Storm".

Actions and the backfill script are thin and untested. `npm run typecheck`, `npm run lint` (no new errors), `npm test` gate the slice.

### Migration

One migration: add `subject.spell_school` (NOT NULL default `'none'`) and create `spell` with its
unique index. Run the backfill script once after migrating.

## File map

```
src/lib/utils/spell-catalog.ts (+test)
src/lib/utils/spell-names.ts (+test)
src/lib/utils/spell-slots.ts (+test)
src/lib/utils/spell-schools.ts (+test)
src/lib/utils/avatar-catalog.ts (+test additions: spell categories in reward helpers)
src/lib/actions/spells.ts
src/lib/actions/subjects.ts (spellSchool on create/update; getSchoolCounts)
src/lib/actions/children.ts (default subjects get a school)
src/lib/db/schema.ts, migrations/0022_*.sql, src/lib/db/backfill-spell-schools.ts, package.json script
src/components/spellbook-builder.tsx (+test)
src/app/(app)/spellbook/page.tsx
src/components/nav-items.ts
src/app/(app)/loot/page.tsx (Spellbook card)
src/app/(app)/settings/child-list.tsx (School of Magic select in SubjectManager)
src/components/quest-template-form.tsx (Spell Parts group appears via getQuestUnlockableItems; verify grouping by category label)
```
