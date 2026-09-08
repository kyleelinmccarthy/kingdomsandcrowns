# Realm: Season's End — Design

**Date:** 2026-09-08
**Slice:** 7 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1–6, in particular `2026-09-02-realm-foundations-design.md` §A for seasons and crowns)
**Status:** approved in conversation; spec for the implementation plan

## Goal

Give the crown its moment. Slice 1 mints a crown when a parent advances a hero's grade; nothing
yet shows it. This slice adds the crown ceremony in the Realm (with a Tavern card for heroes who
never open the Realm), makes earned crowns wearable and visible on the castle, and defines what
clearing a grade means for the open season. Everything a hero built carries into the next season.

Out of scope: any reset of kingdom, mastery, spells, or mounts between seasons; new crown tiers;
ceremonies for anything other than a completed season; parent-authored ceremonies.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Where the ceremony plays | In the Realm at the castle on the hero's next visit after a promotion; a Tavern card announces the crown and can dismiss it for heroes who never open the Realm. |
| Carryover | Nothing resets. Each completed season adds a banner on the castle and makes its crown wearable on the avatar. |
| Grade removal | An open season with activity pauses (kept, no crown); an empty one is deleted. Setting a grade again follows the existing rules. |
| Persistence | One migration: `season.ceremony_seen_at`. Regalia is derived from completed seasons; the worn crown is an avatar-config field validated against earned crowns. |

## A. Season model additions

### Migration 0024
`season.ceremony_seen_at` integer timestamp, nullable. Existing completed seasons stay null.

### Grade removal (`src/lib/utils/seasons.ts`)
`TransitionInput.newGrade: string | null`. New plan types:
```ts
| { type: "pause"; seasonId: string }        // open season has activity: keep it, no crown
| { type: "delete_open"; seasonId: string }  // open season has no activity: a label that never became a year
```
Rows: `newGrade === null` and no open season → `noop`; open season with activity → `pause`; without → `delete_open`. `syncSeasonForGrade(childId, newGrade | null, today)` applies `pause` as a no-op write and `delete_open` as a delete. The children update action passes `null` when the grade is cleared. A paused season shows in the settings season panel with "No grade set: the season is paused."

### Ceremony selection
```ts
export type SeasonWithCeremony = SeasonRecord & { ceremonySeenAt: string | null; completedAt: string | null };
export function pendingCeremony(seasons: SeasonWithCeremony[]): SeasonWithCeremony | null; // newest completed with crownId and no ceremonySeenAt
export function completedCrowns(seasons): CrownTier[];       // newest first, unknown ids skipped
export function bannerCount(seasons): number;                // completed count, capped at BANNER_CAP = 8
export function wearableCrownIds(seasons): Set<string>;
```
Service `markCeremonySeen(childId, seasonId)`: sets `ceremony_seen_at = now` on that season and on every older completed season still unmarked (a backlog never plays as a queue).

### Avatar crown
`AvatarConfig.crown: string | null` (default null), normalised and validated (null or a catalog crown id). `updateAvatarConfig` refuses a crown not in the hero's `wearableCrownIds` ("That crown is not yours yet."). `CrownLayer` draws a circlet above the hair in the tier's colour (`CROWNS[].color`), 36×48 canvas, inside `AvatarFigure` and `Avatar` (so the Tavern, Chronicle, and Realm all show it). The customizer gains a "Crown" tab listing earned crowns only (icon in tier colour, label, season label) plus "None"; with none earned it shows "Finish a season to earn your first crown."

### Actions
`getSeasons(childId)` returns `ceremonySeenAt` on each row plus `pending: SeasonWithCeremony | null`. New `markCeremonySeen(childId, seasonId)` (hero or a family member with access; write gate). `updateChild` passes `null` grades to the sync.

## B. The ceremony in the Realm

### Trigger and bundle
`RealmBundle.ceremony: { seasonId: string; crownId: string; ordinal: number; grade: string; seasonLabel: string } | null` from `pendingCeremony`; `RealmBundle.banners: number` from `bannerCount`; `RealmBundle.wornCrown: CrownTier | null` from `avatarConfig.crown`. When `ceremony` is non-null and the viewer is the hero, the shell starts the ceremony as soon as textures are ready and the world is interactive: input disabled (`useRealmInput enabled: false`), clock paused, spell bar hidden, deed panel cannot open, stick hidden.

### Script (`src/lib/realm/ceremony/ceremony.ts`, pure)
```ts
export type CeremonyStep = "walk" | "gather" | "descend" | "hail" | "done";
export type CeremonyState = { step: CeremonyStep; elapsed: number; hero: Vec2; villagers: Record<string, Vec2>; crownY: number; skipped: boolean };
export const CEREMONY_MARKS: { hero: Vec2; villagers: Vec2[] }; // hero at the castle's south face on the path; eight villager marks in a half circle two units south of the hero, facing the castle
export function startCeremony(layout: WorldLayout, hero: Vec2, reducedMotion: boolean): CeremonyState;
export function stepCeremony(state, dt, colliders, reducedMotion): { state; entered: CeremonyStep | null };
export function skipCeremony(state): CeremonyState; // jumps to "hail" with everyone at their marks and the crown down, then done after HAIL_MS
```
Timing: `walk` until everyone is within 0.3 of their marks (at walking speed 3.5, villagers 3.0; colliders honoured with the same axis-cancel slide as the hero); `gather` holds `GATHER_MS = 3000` with the notice "The people of the Realm gather."; `descend` lowers `crownY` from 4 to 1.9 over `DESCEND_MS = 1500` (ease-out); `hail` holds `HAIL_MS = 4000` with the notice "Hail, {name}, {crown label}!" and the toast "Season {ordinal} complete"; then `done`. Reduced motion: `walk` and `descend` are skipped (everyone starts at their marks, the crown appears at 1.9), and each notice still holds its time so it can be read. Read-aloud speaks both notices when the profile asks.

### Scene
`CeremonyLayer` draws the crown sprite (`CrownFigure` in the tier colour, rasterised through the sprite pipeline with key `crown:{id}`) at `(hero.x, crownY, hero.z)` and, while the ceremony runs, drives the eight villager sprites and the hero sprite from `CeremonyState` instead of the layout and input (the scene keeps a `ceremonyRef`; when null, positions come from the usual sources). Sparkles (the spell layer's burst, gold) fire once at the end of `descend` under motion. After `done`, the crown sprite stays above the hero for the rest of the visit at `crownY = 1.9`, following them.

### Castle banners
`buildWorldLayout({ …, banners })` places `banners` props of `kind: "banner"` (0.4×0.4×1.6, `solid: false`, labels omitted) on eight fixed poles around the castle footprint (two per side, clockwise from the south-west corner), each carrying the tier colour of that ordinal; the scene draws them as thin boxes topped with a `BannerFigure` sprite tinted by the colour.

### Completion
On `done` (or Skip), the shell calls `markCeremonySeen`; on success it restores input, the clock, and the bars, and adds the crown badge ("{crown label}") to the HUD row for the session; on failure it shows the HUD error with retry ("Try again" calls the action again) and still restores play (the ceremony is not replayed this visit; the card and the next visit will offer it again). Skip is a 44 px HUD button and Escape.

### Parent preview
Parents never see the ceremony in the world (the bundle's `ceremony` is null for parent views). They see the Tavern card and the Chronicle's Crowns panel.

## C. Tavern card, Loot, Chronicle, copy, errors

### Tavern card
`CrownCard` on the hero's Tavern and the parent's view of that hero when `pending` is non-null: crown icon in tier colour, "A crown awaits, {name}!", "{seasonLabel} · {grade}", actions "See the ceremony" (link to `/realm`, hero only) and "Hail!" (calls `markCeremonySeen`; parents see only "Hail!"). The card disappears once marked.

### Loot and Chronicle
The Crowns panel shows "Ceremony held" or "Ceremony awaits" per crown. The Chronicle's grade control allows clearing the grade; the season panel shows "No grade set: the season is paused." for a paused season.

### Copy (verbatim)
"The people of the Realm gather.", "Hail, {name}, {crown label}!", "Season {ordinal} complete", "Skip", "A crown awaits, {name}!", "See the ceremony", "Hail!", "Finish a season to earn your first crown.", "Ceremony held", "Ceremony awaits", "No grade set: the season is paused.", "That crown is not yours yet.", customizer tab "Crown".

### Errors
`markCeremonySeen` failures as above. An unknown `crownId` on a season renders with the copper crown's look and the label "Crown"; `completedCrowns` skips it for the customizer. A ceremony whose hero cannot reach the castle mark within 20 s of `walk` (blocked) proceeds to `gather` anyway (the timer is a safety net, not a race).

### Accessibility
Reduced motion and calm palette as in §B; the notices are held 3 s minimum; Skip reachable by keyboard; "Leave the Realm" always works.

## D. Testing
- `seasons.test.ts`: `pause` and `delete_open` rows; `pendingCeremony` newest-only; `completedCrowns`/`bannerCount` cap/`wearableCrownIds`.
- `season-sync`: apply `pause`/`delete_open`; `markCeremonySeen` marks older unmarked seasons (service-level test with the local DB if the repo has a pattern; otherwise pure helper `seasonsToMark(seasons, seasonId)` tested).
- `avatar-catalog.test.ts`: crown normalise/validate; `avatar-figures.test.tsx`: `CrownLayer` present only with a crown, coloured by tier.
- `ceremony.test.ts`: marks inside the world and outside colliders; `walk` completes; step timing; skip; reduced-motion variants; the 20 s safety net.
- `layout.test.ts`: banner props count/cap/colours.
- Components: `CrownCard` hero/parent variants and Hail!; customizer Crown tab earned-only and empty state; HUD crown badge and Skip; shell: ceremony start → done → `markCeremonySeen`, Skip, error retry, parent exclusion.
- Final browser pass: seed an activity row in the demo hero's open season, bump the grade (parent), open the Realm as the hero, watch to "Hail, Emma, Copper Circlet!", confirm a banner at the castle, then confirm the Tavern card is gone.

## E. Plan shape
1. Migration + season rules (pause/delete_open, pendingCeremony, crowns helpers) + service + actions (+ tests).
2. Avatar crown field, `CrownLayer`, customizer Crown tab, save validation (+ tests).
3. Ceremony script (pure) + layout banners (+ tests).
4. Scene: `CrownFigure`/sprite key, `CeremonyLayer`, villager/hero override, banners; HUD crown badge + Skip.
5. Shell wiring + bundle fields + Tavern `CrownCard` + Loot/Chronicle lines (+ tests).
6. Final verification and the browser pass.
