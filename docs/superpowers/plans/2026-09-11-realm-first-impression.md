# Realm Slice 1: It's a Game Now — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Realm from a lawn with anonymous figures into a game a child can read at a glance — the hero marked, the villagers named, one starting quest lit and tracked, every message centred, and the corner scoreboard replaced by three anchored zones — so that the verdict "this doesnt feel like a well thought out game at all" is answered on sight.

**Architecture:** Seven new or extended pure modules under `src/lib/realm/**` (`depth`, `objective`, `markers`, `messages`, `camera`, `layout`, `play-clock`) hold every rule this slice adds, each with a colocated Vitest suite, so the decisions are testable without WebGL. `realm-scene.tsx` reads them to draw geometry (ground ring, contact shadows, beacon) and to write the edge arrow straight to a DOM ref, while the React layer above it — `realm-messages.tsx`, `villager-plate.tsx`, a rewritten `realm-hud.tsx` and `realm-shell.tsx` — renders every string, so all of the copy is unit-testable in jsdom. One new column, `realm_settings.depth_override`, plus a server-computed `RealmBundle.depth`, carries the complexity axis that all twelve later slices consume.

**Tech Stack:** Next.js 16 App Router, React 19 with the React Compiler, TypeScript, Drizzle ORM + libsql (SQLite), Vitest + Testing Library (jsdom, no WebGL), Tailwind v4 with `src/app/globals.css`, three 0.185 / @react-three/fiber 9 / @react-three/drei 10.

**Spec:** `/home/kylee/projects/kingdoms-and-crowns/docs/superpowers/specs/2026-09-10-realm-first-impression-design.md`

## Global Constraints

- Three.js runtime imports live ONLY in `realm-scene.tsx`, the `*-layer.tsx` files and the dynamic `await import("three")` inside `sprite-texture.ts` / `tile-texture.ts`. Nothing under Vitest may import three at module load. Ruling for this slice: `villager-plate.tsx` is therefore pure DOM and the drei `<Html>` wrapper stays in `realm-scene.tsx` — §3.10's props (§8) are unchanged by that, and it is what makes §3.10's copy unit-testable.
- Nothing under `src/lib/realm/**` imports three at module load. `camera.ts`, `markers.ts` and `messages.ts` are arithmetic and strings only; the scene reads them.
- The scene's `World` component is memoised — every scene prop must be referentially stable (`arrowRef` is a ref, `surfaces` is a `useMemo` on `[depth, profile]`, `onVillagerPick` is a `useCallback`).
- Scene-to-React events go through `queueMicrotask`; `react-hooks/set-state-in-effect` forbids synchronous `setState` in effects; the React Compiler forbids render-time ref writes and treats `useMemo` results as immutable. The edge arrow is written straight to `el.hidden` and `el.style.transform` — no `setState`, no `queueMicrotask`.
- `"use server"` files export only async functions; never `export type { X }` from one. `setRealmDepth` calls `requireChildAccess(childId, { write: true })` WITHOUT the `isChildActor` refusal; `updateRealmSettings` stays parent-only.
- Learning-profile settings are honoured everywhere: `reducedMotion`, `lowStimulus`, `largerText`, `fewerChoices`, `readAloud`, `inputMode`. No cue in this slice exists only as motion, and `lowStimulus` mutes, never empties.
- The three depth invariants, verbatim: (1) `profile.fewerChoices` caps `trackedObjectives` at 1, `abilitySlots` at `"earned"` and `listRows` at 3 at both depths — `surfacesFor` applies this and nobody re-implements it; (2) Depth is never a word or a label a child reads — no "simple mode" badge, no "advanced" toggle, no depth name anywhere on screen; (3) every simple-depth surface is a substitution, never a removal.
- The `Surfaces` table is closed: thirteen fields, thirteen consumers. No later slice adds a field; `PROBLEM_ORDER` and `SPEECH_ORDER` are closed unions a later slice extends, never a new lane. **Slice 1 itself uses that extension rule exactly once**: §8 lists five `ProblemKind`s, but §3.20 requires a sixth, `questTimer` (`Your {subject} timer finished.` / `Go to it →`, at warning priority above `lastMinute`). Task 6 ships the five; task 20's steps 13b–13c add the sixth to the union, to `PROBLEM_ORDER` and to both `Record<ProblemKind, …>` tables. No lane is added, and `SPEECH_ORDER` stays at three.
- Every ground decal takes its `y` from a NAMED rung of `GROUND_Y`. No file writes a `y` literal for a ground decal. `GROUND_Y = { water: 0.02, path: 0.03, foundation: 0.04, propShadow: 0.045, lapWaypoint: 0.05, figureShadow: 0.055, heroRing: 0.06 }`.
- The village invariant, asserted by a test: `buildWorldLayout` with and without `objectiveIds` yields identical `props.map(({id,kind,position,size,solid}))` and a deep-equal `colliders` array. `focus` never changes `kind`, `solid`, `position` or `size`. Nothing this slice adds enters `layout.props`.
- No new code reads `BUILDING_SLOTS`, `SPAWN`, `CASTLE_POSITION` or any other hard-coded coordinate — the beacon, the edge arrow, the plates and the approach points all read positions from the `layout` object.
- This slice adds ZERO new rasterised sprite kinds. Nothing new goes through `svgElementToTexture`; first paint is byte-for-byte the same work. Budget: ≤ 1.0 ms/frame added and 0 ms added to `onReady`.
- Hero, mount and companion shadows never take `bob`; the shadow stays at the figure's true ground x/z while the sprite rises. Shadow constants: `SHADOW_OPACITY` 0.22, `SHADOW_OPACITY_CALM` 0.14, a 4-segment `circleGeometry(0.5, 4)` scaled to `shadowFootprint`.
- Ring constants: `RING_INNER` 0.42, `RING_OUTER` 0.55, `RING_NOTCH_ARC` `Math.PI/3`, `RING_GOLD` `"#c9a84c"`, `RING_CALM` `"#8a7d5a"`; `facingAngle` n:0, e:-PI/2, s:PI, w:PI/2, asserted against `FACING_VEC` rather than hardcoded. `BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 }`.
- `edgeArrow`'s margin defaults to 56 px and zoom to `CAMERA_ZOOM` (40); a zero-size viewport returns `null`. `CAMERA_OFFSET` and `CAMERA_ZOOM` are untouched in this slice.
- `PENDING_TALK_MS = 8000`. A pending talk is cleared when: the hero's target is dropped, another villager is picked, the panel opens, the ceremony starts, or the deadline passes.
- `ROUND_UP_SECONDS = 30`. `minutesToSettle`: `clock.closed` → 0; otherwise `pending + (secondsThisMinute >= 30 ? 1 : 0)`, clamped to `[0, minutesRemaining]` and to the server's ceiling of 30.
- CSS custom properties on `.realm-root`, frozen names: `--realm-hud-scale` (from `settings.hudScale`, 1 | 1.25), `--realm-bar-bottom` (`1.25rem`, or `9.5rem` when `settings.showStick`), `--realm-touch` (`56px`). Every control that sits over the 3D world is 56px; panel buttons stay at 44px.
- Frozen CSS class names (later slices restyle, never rename): `.realm-hud-identity` `.realm-hud-meta` `.realm-hud-objective` `.realm-messages` `.realm-message` `.realm-message--problem` `.realm-message--stage` `.realm-message--cheer` `.realm-message--plain` `.realm-edge-arrow` `.realm-plate` `.realm-plate-name` `.realm-plate-tag` `.realm-plate-badge` `.realm-plate-badge--quest` `.realm-plate-badge--done` `.realm-pips` `.realm-pip` `.realm-pip--on` `.realm-mana-pips` `.realm-mana-pips--refused` `.realm-mount-button` `.realm-bubble-key` `.realm-hud-chip`.
- `globals.css:1705` (`.realm-hud > * { pointer-events: auto }`) is DELETED; the auto rule is narrowed to `.realm-hud button, .realm-hud a, .realm-hud-selector *, .realm-messages button`. The three load-bearing `pointer-events` values are ALSO set inline so a jsdom test can read them (D10.1).
- `.realm-root` goes `z-index: 45` → `60`, and `body:has(.realm-root)` hides `.floating-dock`, `.quest-timer-popup` and `.schedule-notification-popup`, with the `data-realm-open` attribute as the tested fallback.
- Every pip row is `role="img"` with a numeric `aria-label` at BOTH depths — pips substitute for numerals on screen, never in the accessible name. The progress row's name is always `"N of M side quests done."`, built from `SIDE_QUESTS_LOWER`; "deed" never reaches the screen.
- Message action labels, verbatim: `spriteError` → `Try again`; `kingdomError` → `Wake the villagers`; `ceremonyError` → `Try again`; `lastMinute` and `preview` → `null`. Tones: `ceremony` → `"stage"`; `toast` → `"cheer"`, or `"plain"` when calm; `notice` → `"plain"`.
- The migration SQL is exactly: ``ALTER TABLE `realm_settings` ADD `depth_override` text DEFAULT 'auto' NOT NULL;`` — the number is drizzle-kit's to assign (0026 predicted). After editing `schema.ts` run `npm run db:generate` then `npm run db:migrate`, then CHECK, do not trust: `PRAGMA table_info(realm_settings)` shows `depth_override | text | notnull=1 | dflt_value='auto'`, and a pre-existing row reads `'auto'`.
- Copy is written, never placeholdered, and every user-visible string in this plan is the verbatim string from the spec. The two `complete` strings (`Every building is raised.` / `Nothing is waiting. Walk where you like.`) and `objectiveSpeech`'s complete line are labelled interim and name slice 13 as their heir in a code comment.
- The clock is paused in exactly one place in the whole programme (slice 9's opening banner) and nowhere else: `usePlayClock`'s `paused` argument stays `panelOpen || ceremonyRunning || helpOpen`, unchanged. Toast holds 4000 ms and notice 2000 ms, both unchanged.
- The objective card is a suggestion, never a gate: `objectiveState` cannot return a value that disables a Talk, and nothing in this slice blocks `startDeedRun`, the `SiteCard` or `Begin`.
- Git: each git command on its own line, never chained with `&&`. Every commit message ends with a second `-m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`. Branch: `realm-foundations`.
- Lint has ONE pre-existing error in `src/components/quest-template-list.tsx` that this branch never touched; it is not a regression. Any other lint error is.
- `realm-scene.tsx` cannot be unit-tested (it imports three; Vitest runs in jsdom with no WebGL). Every task that touches it is gated by `npm run typecheck`, `npm run lint`, a green `npm test`, and its named browser-pass check on the documented port-3100 setup.

---

### Task 1: The complexity-axis contract (depth.ts)

The one answer twelve later slices consume instead of inventing nine. A pure module: no three, no React, no DB. Nothing imports it when this task ends — tasks 8, 10, 11, 12, 15 and 18 are its first consumers.

**Files:**
- Create: `src/lib/realm/depth.ts`
- Create (test): `src/lib/realm/depth.test.ts`
- Modify: none

**Interfaces:**

Consumes (from earlier tasks): nothing. This is the first task in the slice.

Consumes (from the repo as it exists today):
```ts
// src/lib/utils/learning-profile.ts — already exists, unchanged by this task
export type LearningProfile = {
  readingFont: boolean; largerText: boolean; extraSpacing: boolean; readAloud: boolean;
  untimed: boolean; sessionMinutes: number | null; fewerChoices: boolean; reducedMotion: boolean;
  lowStimulus: boolean; predictableRoutine: boolean; soundEnabled: boolean; inputMode: InputMode;
};
export const DEFAULT_LEARNING_PROFILE: LearningProfile;
```

Produces (exact names and types later tasks rely on):
```ts
// src/lib/realm/depth.ts
export type RealmDepth = "simple" | "full";
export type DepthOverride = "auto" | "simple" | "full";
export type Surfaces = {
  numerals: boolean; trackedObjectives: number; abilitySlots: "earned" | "all";
  keycapHints: boolean; listRows: number; districtDetail: boolean; fastTravel: boolean;
  troubleNames: boolean; troubleDetail: boolean; troubleHitPips: boolean;
  clearCount: boolean; bountyLedgerLine: boolean; lapTimes: boolean;
};
export const DEPTH_OVERRIDES: DepthOverride[];          // ["auto", "simple", "full"]
export const DEFAULT_DEPTH_OVERRIDE: DepthOverride;     // "auto"
export function isDepthOverride(value: unknown): value is DepthOverride;
export function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth;
export function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces;
```
Task 8 imports `DepthOverride`, `isDepthOverride`, `DEFAULT_DEPTH_OVERRIDE` and `realmDepth`. Tasks 10, 11, 12 and 15 import `Surfaces` and `surfacesFor`. Task 18 imports `RealmDepth`. Task 19 imports `DEPTH_OVERRIDES` and `DepthOverride`.

---

- [ ] **Step 1: Write the failing test for the truth table and the override guard.**

  Create `src/lib/realm/depth.test.ts` with exactly this content. (House style, matched from `src/lib/realm/render-settings.test.ts`: `import { describe, it, expect } from "vitest";`, the module under test by relative path, shared fixtures from the `@/` alias, which `vitest.config.ts` maps to `./src`.)

  ```ts
  import { describe, it, expect } from "vitest";
  import {
    DEFAULT_DEPTH_OVERRIDE,
    DEPTH_OVERRIDES,
    isDepthOverride,
    realmDepth,
    surfacesFor,
  } from "./depth";
  import type { Surfaces } from "./depth";
  import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

  const FEWER = { ...DEFAULT_LEARNING_PROFILE, fewerChoices: true };

  describe("realmDepth", () => {
    it("follows the tutorial when the override is auto", () => {
      expect(realmDepth({ tutorialComplete: false, override: "auto" })).toBe("simple");
      expect(realmDepth({ tutorialComplete: true, override: "auto" })).toBe("full");
    });
    it("lets an explicit override win whatever the tutorial says", () => {
      expect(realmDepth({ tutorialComplete: false, override: "simple" })).toBe("simple");
      expect(realmDepth({ tutorialComplete: true, override: "simple" })).toBe("simple");
      expect(realmDepth({ tutorialComplete: false, override: "full" })).toBe("full");
      expect(realmDepth({ tutorialComplete: true, override: "full" })).toBe("full");
    });
  });

  describe("isDepthOverride", () => {
    it("accepts exactly the three override strings", () => {
      expect(isDepthOverride("auto")).toBe(true);
      expect(isDepthOverride("simple")).toBe(true);
      expect(isDepthOverride("full")).toBe(true);
    });
    it("rejects anything that is not one of the three", () => {
      for (const bad of [null, undefined, "", "Simple", "FULL", " auto", 0, 1, true, {}, ["auto"]]) {
        expect(isDepthOverride(bad)).toBe(false);
      }
    });
    it("lists the three overrides in order and defaults to auto", () => {
      expect(DEPTH_OVERRIDES).toEqual(["auto", "simple", "full"]);
      expect(DEFAULT_DEPTH_OVERRIDE).toBe("auto");
      expect(DEPTH_OVERRIDES.every((o) => isDepthOverride(o))).toBe(true);
    });
  });
  ```

  Leave `surfacesFor` imported but unused for one step — step 2 adds its block. (`surfacesFor` and `Surfaces` are referenced in step 2's code, so no lint run happens between the two steps.)

- [ ] **Step 2: Append the failing test for the thirteen surfaces, the key count and the fewerChoices caps.**

  Append this to the end of `src/lib/realm/depth.test.ts`. `SIMPLE_TABLE` and `FULL_TABLE` are §3.1's table transcribed by hand — they are the second copy that makes a drift in `depth.ts` fail, and because both are annotated `: Surfaces`, a fourteenth field added to the type breaks this file's typecheck as well as its key count.

  ```ts

  /** §3.1's table, transcribed. If this and depth.ts disagree, depth.ts is wrong. */
  const SIMPLE_TABLE: Surfaces = {
    numerals: false,
    trackedObjectives: 1,
    abilitySlots: "earned",
    keycapHints: false,
    listRows: 3,
    districtDetail: false,
    fastTravel: false,
    troubleNames: false,
    troubleDetail: false,
    troubleHitPips: false,
    clearCount: false,
    bountyLedgerLine: false,
    lapTimes: false,
  };

  const FULL_TABLE: Surfaces = {
    numerals: true,
    trackedObjectives: 3,
    abilitySlots: "all",
    keycapHints: true,
    listRows: 8,
    districtDetail: true,
    fastTravel: true,
    troubleNames: true,
    troubleDetail: true,
    troubleHitPips: true,
    clearCount: true,
    bountyLedgerLine: true,
    lapTimes: true,
  };

  describe("surfacesFor", () => {
    it("draws every simple surface exactly as the table says", () => {
      expect(surfacesFor("simple", DEFAULT_LEARNING_PROFILE)).toEqual(SIMPLE_TABLE);
    });
    it("draws every full surface exactly as the table says", () => {
      expect(surfacesFor("full", DEFAULT_LEARNING_PROFILE)).toEqual(FULL_TABLE);
    });
    it("declares exactly thirteen surfaces, and the same thirteen at both depths", () => {
      const simpleKeys = Object.keys(surfacesFor("simple", DEFAULT_LEARNING_PROFILE)).sort();
      const fullKeys = Object.keys(surfacesFor("full", DEFAULT_LEARNING_PROFILE)).sort();
      expect(simpleKeys).toHaveLength(13);
      expect(fullKeys).toEqual(simpleKeys);
      expect(Object.keys(SIMPLE_TABLE).sort()).toEqual(simpleKeys);
    });
    it("caps tracked objectives, ability slots and list rows under fewerChoices at both depths", () => {
      for (const depth of ["simple", "full"] as const) {
        const s = surfacesFor(depth, FEWER);
        expect(s.trackedObjectives).toBe(1);
        expect(s.abilitySlots).toBe("earned");
        expect(s.listRows).toBe(3);
      }
    });
    it("leaves every other surface alone under fewerChoices", () => {
      const capped = new Set<string>(["trackedObjectives", "abilitySlots", "listRows"]);
      for (const depth of ["simple", "full"] as const) {
        const plain = surfacesFor(depth, DEFAULT_LEARNING_PROFILE);
        const fewer = surfacesFor(depth, FEWER);
        for (const key of Object.keys(plain) as (keyof Surfaces)[]) {
          if (capped.has(key)) continue;
          expect(fewer[key]).toBe(plain[key]);
        }
      }
    });
    it("returns a fresh object each call, so no caller can poison the table", () => {
      const a = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
      const b = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
  ```

- [ ] **Step 3: Run the test and watch it fail because the module does not exist.**

  ```
  npx vitest run src/lib/realm/depth.test.ts
  ```

  Expected: the suite never runs. Vitest reports `Test Files  1 failed (1)` / `Tests  no tests` with

  ```
  Error: Failed to load url ./depth (resolved id: ./depth) in /home/kylee/projects/kingdoms-and-crowns/src/lib/realm/depth.test.ts. Does the file exist?
  ```

  The error must name `./depth`. If it names anything else, fix the test file before going on — do not create `depth.ts` to chase a different error.

- [ ] **Step 4: Write the module.**

  Create `src/lib/realm/depth.ts` with exactly this content. The doc comments are the spec's own (§3.1) and they are the contract's documentation for the twelve later slices — keep them.

  ```ts
  import type { LearningProfile } from "@/lib/utils/learning-profile";

  export type RealmDepth = "simple" | "full";
  export type DepthOverride = "auto" | "simple" | "full";
  export const DEPTH_OVERRIDES: DepthOverride[] = ["auto", "simple", "full"];
  export const DEFAULT_DEPTH_OVERRIDE: DepthOverride = "auto";

  /**
   * What each surface shows. This is the **whole** contract: every field any of the thirteen
   * slices reads is declared here, once, in one vocabulary. No later spec adds a field, and no
   * later spec invents a local rule. A slice that wants a new surface amends this type and this
   * table in slice 1's spec first.
   */
  export type Surfaces = {
    /** false → pips (●●○○○), true → numerals. One vocabulary for progress, mana, signs and laps. */
    numerals: boolean;
    /** How many objectives the card tracks at once. Capped at 1 by `fewerChoices` at both depths. */
    trackedObjectives: number;
    /** Which spell pages the ability bar contains. */
    abilitySlots: "earned" | "all";
    /** Whether number keycaps are drawn on the ability bar's slots. */
    keycapHints: boolean;
    /** Rows a list shows before it collapses the rest behind "and N more". Capped at 3 by `fewerChoices`. */
    listRows: number;
    /** false → a district announces its name alone; true → its name and what stands in it. */
    districtDetail: boolean;
    /** Whether the hitching-post sheet offers every unlocked district or only the objective's. */
    fastTravel: boolean;
    /** false → a trouble's plate is the ⚠ glyph; true → it carries the name from TROUBLE_COPY. */
    troubleNames: boolean;
    /** Per-trouble detail: the companion's trouble break-off, the plate's second line. */
    troubleDetail: boolean;
    /** The damage pip row on a plate for kinds with maxHits > 1. */
    troubleHitPips: boolean;
    /** The running `Cleared 4` chip on the ability bar's status row. */
    clearCount: boolean;
    /** Whether the clock's accessible text names bonus minutes as a separate source. */
    bountyLedgerLine: boolean;
    /** Whether lap times are shown as times rather than as "a new best". */
    lapTimes: boolean;
  };

  const SIMPLE: Surfaces = {
    numerals: false,
    trackedObjectives: 1,
    abilitySlots: "earned",
    keycapHints: false,
    listRows: 3,
    districtDetail: false,
    fastTravel: false,
    troubleNames: false,
    troubleDetail: false,
    troubleHitPips: false,
    clearCount: false,
    bountyLedgerLine: false,
    lapTimes: false,
  };

  const FULL: Surfaces = {
    numerals: true,
    trackedObjectives: 3,
    abilitySlots: "all",
    keycapHints: true,
    listRows: 8,
    districtDetail: true,
    fastTravel: true,
    troubleNames: true,
    troubleDetail: true,
    troubleHitPips: true,
    clearCount: true,
    bountyLedgerLine: true,
    lapTimes: true,
  };

  export function isDepthOverride(value: unknown): value is DepthOverride {
    return typeof value === "string" && DEPTH_OVERRIDES.includes(value as DepthOverride);
  }

  /** `auto` follows the tutorial; an explicit override always wins. */
  export function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth {
    if (input.override !== "auto") return input.override;
    return input.tutorialComplete ? "full" : "simple";
  }

  /**
   * The surfaces for a depth, with the profile's caps applied. `fewerChoices` caps
   * `trackedObjectives` at 1, `abilitySlots` at "earned" and `listRows` at 3 at **both** depths —
   * this is the only place that rule is written, and no consumer re-implements it. Every simple
   * surface is a substitution, never a removal: pips replace numerals, one tracked objective
   * replaces three, earned slots replace all slots.
   */
  export function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces {
    const out: Surfaces = { ...(depth === "simple" ? SIMPLE : FULL) };
    if (profile.fewerChoices) {
      out.trackedObjectives = Math.min(out.trackedObjectives, 1);
      out.abilitySlots = "earned";
      out.listRows = Math.min(out.listRows, 3);
    }
    return out;
  }
  ```

- [ ] **Step 5: Run the test and watch it pass.**

  ```
  npx vitest run src/lib/realm/depth.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  11 passed (11)`.

- [ ] **Step 6: Typecheck and lint the two new files.**

  ```
  npx tsc --noEmit
  ```
  Expected: no output, exit 0.

  ```
  npx eslint src/lib/realm/depth.ts src/lib/realm/depth.test.ts
  ```
  Expected: no output, exit 0. (The one pre-existing lint error on this branch is in `src/components/quest-template-list.tsx`, which this scoped run does not touch.)

- [ ] **Step 7: Commit.**

  Check the branch first — several sessions share this checkout.

  ```
  git branch --show-current
  ```
  Expected: `realm-foundations`. If it is anything else, stop and switch before committing.

  ```
  git add src/lib/realm/depth.ts src/lib/realm/depth.test.ts
  ```
  ```
  git status --short
  ```
  Expected: exactly two `A` lines, for `src/lib/realm/depth.ts` and `src/lib/realm/depth.test.ts`, and nothing else staged.
  ```
  git commit -m "feat(realm): add the complexity-axis contract with its thirteen closed surfaces" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2: The starting quest and the one rank (objective.ts), with deed-picker adopting it

**Files:**
- Create: `src/lib/realm/objective.ts`
- Create (test): `src/lib/realm/objective.test.ts`
- Modify: `src/components/deed-picker.tsx:10` (add the `rankBuildings` import after the `AREA_LABELS` import), `src/components/deed-picker.tsx:20-22` (delete the local `rank` and its sort — after the import insertion these are lines 21-23; the steps below edit by exact text, not by line number)
- Test (existing, unchanged, must stay green): `src/components/deed-picker.test.tsx`

**Interfaces:**

*Consumes* — nothing from earlier tasks in this slice. From the repo as it stands today:
```ts
// src/lib/utils/kingdom.ts
export const BUILDINGS: Building[]            // well, mill, bridge, chapel, market, library, watchtower, garden — in that order
export function findBuilding(id: string): Building | null   // Building = { id; label; description; deedsToBuild; icon }
// src/lib/realm/villagers.ts
export function villagerForBuilding(buildingId: string): Villager | null  // Villager = { id; buildingId; name; greeting; figure }
// src/lib/realm/layout.ts
export type SiteProgress = { id: string; done: number; total: number; complete: boolean }
// src/lib/utils/side-quest-copy.ts
export const SIDE_QUEST_LOWER = "side quest"
```

*Produces* — the frozen §8 contract that tasks 11, 17 and slices 8, 9, 10 and 13 consume:
```ts
// src/lib/realm/objective.ts
export type Objective = { buildingId: string; villagerId: string | null; label: string; villagerName: string | null; done: number; total: number }
export type ObjectiveState = { kind: "unknown" } | { kind: "complete" } | { kind: "next"; objectives: Objective[] }
export function objectiveRank(b: { done: number; complete: boolean }): 0 | 1 | 2
export function rankBuildings<T extends { done: number; complete: boolean }>(buildings: T[]): T[]
export function objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState
export function pickObjective(buildings: SiteProgress[]): Objective | null
export function riseToast(label: string, next: ObjectiveState): string
export function objectiveSpeech(state: ObjectiveState): string | null
```
Also produced: `src/components/deed-picker.tsx` no longer owns a ranking rule — the Side Quests page and the world sort by the same function, so they cannot disagree.

---

- [ ] **Step 1: Write the failing test for the rank (`objectiveRank`, `rankBuildings`)**

  Create `src/lib/realm/objective.test.ts` with exactly this content. The `fixture` is the eight buildings in six progress states (0, 1, 2, 3, 4 and 5 of 5) — the fixture §7 asks for, and the one that proves `rankBuildings` reproduces the order `deed-picker`'s local `rank` produced.

  ```ts
  import { describe, it, expect } from "vitest";
  import { objectiveRank, rankBuildings } from "./objective";
  import type { SiteProgress } from "./layout";

  // Every building is 5 side quests today; slice 13 lowers the real counts and re-baselines this fixture (spec §3.8).
  const site = (id: string, done: number): SiteProgress => ({ id, done, total: 5, complete: done >= 5 });

  describe("objectiveRank", () => {
    it("ranks work in progress first, untouched second, finished last", () => {
      expect(objectiveRank({ done: 2, complete: false })).toBe(0);
      expect(objectiveRank({ done: 0, complete: false })).toBe(1);
      expect(objectiveRank({ done: 5, complete: true })).toBe(2);
      // Complete rests at the end however its done count reads.
      expect(objectiveRank({ done: 0, complete: true })).toBe(2);
    });
  });

  describe("rankBuildings", () => {
    // The eight buildings in six progress states.
    const fixture = [
      site("well", 5), site("mill", 0), site("bridge", 2), site("chapel", 5),
      site("market", 0), site("library", 4), site("watchtower", 1), site("garden", 3),
    ];

    it("reproduces the order deed-picker's local rank produced", () => {
      // deed-picker.tsx:20-22, deleted in this task and re-expressed here so the two can never drift apart.
      const legacyRank = (b: { done: number; complete: boolean }) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
      const legacy = [...fixture].sort((a, b) => legacyRank(a) - legacyRank(b)).map((b) => b.id);
      expect(legacy).toEqual(["bridge", "library", "watchtower", "garden", "mill", "market", "well", "chapel"]);
      expect(rankBuildings(fixture).map((b) => b.id)).toEqual(legacy);
    });

    it("is stable within a rank and never mutates its input", () => {
      const before = fixture.map((b) => b.id);
      const ranked = rankBuildings(fixture);
      expect(ranked).not.toBe(fixture);
      expect(fixture.map((b) => b.id)).toEqual(before);
      // Equal ranks keep input order: library (4 of 5) does not overtake bridge (2 of 5). That tie-break
      // belongs to objectiveState, not here — deed-picker's list order must not change in this task.
      expect(ranked.slice(0, 4).map((b) => b.id)).toEqual(["bridge", "library", "watchtower", "garden"]);
    });
  });
  ```

- [ ] **Step 2: Run it and watch it fail**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: the suite fails to collect — `Error: Failed to load url ./objective (resolved id: /home/kylee/projects/kingdoms-and-crowns/src/lib/realm/objective) in /home/kylee/projects/kingdoms-and-crowns/src/lib/realm/objective.test.ts. Does the file exist?` — because `src/lib/realm/objective.ts` does not exist yet.

- [ ] **Step 3: Write the rank**

  Create `src/lib/realm/objective.ts` with exactly this content. The types are the whole §8 contract (they cost nothing to land now and the later steps fill in the functions); the two exported functions are the minimum that makes step 1's test pass.

  ```ts
  export type Objective = {
    buildingId: string;
    villagerId: string | null;   // null only if the catalogs ever disagree
    label: string;               // "Village Well"
    villagerName: string | null; // "Old Bram"
    done: number;
    total: number;
  };

  export type ObjectiveState =
    | { kind: "unknown" }                        // no kingdom data: the load failed
    | { kind: "complete" }                       // every building raised
    | { kind: "next"; objectives: Objective[] }; // 1..limit, best first

  /** Work in progress leads, untouched buildings follow, finished ones rest at the end. */
  export function objectiveRank(b: { done: number; complete: boolean }): 0 | 1 | 2 {
    return b.complete ? 2 : b.done > 0 ? 0 : 1;
  }

  /**
   * A stable sort by objectiveRank, and nothing else: deed-picker.tsx imports this, so the Side Quests
   * page and the world order their sites the same way. objectiveState adds the higher-done tie-break on
   * top of this rank; the list on the Side Quests page deliberately does not.
   */
  export function rankBuildings<T extends { done: number; complete: boolean }>(buildings: T[]): T[] {
    return [...buildings].sort((a, b) => objectiveRank(a) - objectiveRank(b));
  }
  ```

  The file has no imports yet — nothing in it needs one. Step 8 adds them.

- [ ] **Step 4: Run it and watch it pass**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.

- [ ] **Step 5: Commit the rank**

  ```
  git branch --show-current
  ```
  Expected output: `realm-foundations`. (Several sessions share this checkout — if it says anything else, stop and fix the branch before committing.)
  ```
  git add src/lib/realm/objective.ts src/lib/realm/objective.test.ts
  ```
  ```
  git commit -m "feat(realm): one shared rank for kingdom sites" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Write the failing test for `objectiveState` and `pickObjective`**

  First replace the two import lines at the top of `src/lib/realm/objective.test.ts`:

  ```ts
  import { objectiveRank, rankBuildings } from "./objective";
  import type { SiteProgress } from "./layout";
  ```

  with:

  ```ts
  import { objectiveRank, rankBuildings, objectiveState, pickObjective, type ObjectiveState } from "./objective";
  import type { SiteProgress } from "./layout";
  import { BUILDINGS } from "@/lib/utils/kingdom";
  ```

  Then append this to the end of the file:

  ```ts
  /** The ids of the tracked objectives, or the kind — so one assertion covers both the kind and the order. */
  const ids = (state: ObjectiveState) => (state.kind === "next" ? state.objectives.map((o) => o.buildingId) : state.kind);

  const newHero: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 0, total: b.deedsToBuild, complete: false }));

  describe("objectiveState", () => {
    it("gives a brand-new hero the well, the same way every time", () => {
      const expected = { kind: "next", objectives: [{ buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 0, total: 5 }] };
      expect(objectiveState(newHero, 1)).toEqual(expected);
      expect(objectiveState(newHero, 1)).toEqual(expected);
      expect(objectiveState(newHero, 1)).toEqual(expected);
      expect(pickObjective(newHero)?.buildingId).toBe("well");
    });

    it("puts work in progress ahead of untouched sites, highest done first", () => {
      const buildings = [site("well", 0), site("mill", 1), site("bridge", 0), site("chapel", 3), site("market", 0), site("library", 2), site("watchtower", 0), site("garden", 0)];
      expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "library", "mill", "well", "bridge", "market", "watchtower", "garden"]);
      expect(pickObjective(buildings)).toEqual({ buildingId: "chapel", villagerId: "wren", label: "Chapel", villagerName: "Sister Wren", done: 3, total: 5 });
    });

    it("never offers a building that is already raised", () => {
      const buildings = [site("well", 5), site("mill", 5), site("bridge", 0), site("chapel", 4)];
      expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "bridge"]);
    });

    it("reads an empty kingdom as unknown, never as complete", () => {
      expect(objectiveState([], 1)).toEqual({ kind: "unknown" });
      expect(objectiveState([], 8)).toEqual({ kind: "unknown" });
      // An id with no catalog entry has no site in the world either (layout.ts skips it), so it is not an
      // objective — and a payload of nothing but strangers is a failed load, not a finished kingdom.
      expect(objectiveState([{ id: "moon-base", done: 0, total: 5, complete: false }], 1)).toEqual({ kind: "unknown" });
      expect(pickObjective([])).toBeNull();
    });

    it("reports a finished kingdom when every building is raised", () => {
      const all: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
      expect(objectiveState(all, 3)).toEqual({ kind: "complete" });
      expect(pickObjective(all)).toBeNull();
    });

    it("clamps limit to 1..8 and caps the list", () => {
      expect(ids(objectiveState(newHero, 3))).toEqual(["well", "mill", "bridge"]);
      expect(ids(objectiveState(newHero, 0))).toEqual(["well"]);
      expect(ids(objectiveState(newHero, -4))).toEqual(["well"]);
      expect(ids(objectiveState(newHero, 1.9))).toEqual(["well"]);
      expect(ids(objectiveState(newHero, 99)).length).toBe(8);
    });
  });
  ```

- [ ] **Step 7: Run it and watch it fail**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: the six new tests fail with `TypeError: objectiveState is not a function` (or, depending on the Vite transform, the file fails to collect with `does not provide an export named 'objectiveState'`). The three rank tests from step 1 still pass if the file collects.

- [ ] **Step 8: Write `objectiveState` and `pickObjective`**

  Append this to `src/lib/realm/objective.ts`:

  ```ts
  /** BUILDINGS order — the last tie-break, and the reason a brand-new hero always starts at the well. */
  const ORDER = new Map(BUILDINGS.map((b, i) => [b.id, i]));

  /** The card tracks between one and all eight sites; Surfaces only ever asks for 1 or 3. */
  function clampLimit(limit: number): number {
    if (!Number.isFinite(limit)) return 1;
    return Math.min(8, Math.max(1, Math.floor(limit)));
  }

  function toObjective(p: SiteProgress): Objective {
    const villager = villagerForBuilding(p.id);
    return {
      buildingId: p.id,
      villagerId: villager?.id ?? null,
      // objectiveState filters to catalog ids first, so the id fallback is unreachable; it keeps this total.
      label: findBuilding(p.id)?.label ?? p.id,
      villagerName: villager?.name ?? null,
      done: p.done,
      total: p.total,
    };
  }

  /**
   * What to do next, best first. An empty `buildings` means the kingdom failed to load — "unknown", never
   * "complete", so a database hiccup can never tell a child their kingdom is finished.
   */
  export function objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState {
    // Ids with no catalog entry have no site in the world either (layout.ts skips them).
    const known = buildings.filter((b) => ORDER.has(b.id));
    if (known.length === 0) return { kind: "unknown" };
    const open = known.filter((b) => !b.complete);
    if (open.length === 0) return { kind: "complete" };
    const ranked = open.sort(
      (a, b) => objectiveRank(a) - objectiveRank(b) || b.done - a.done || (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0),
    );
    return { kind: "next", objectives: ranked.slice(0, clampLimit(limit)).map(toObjective) };
  }

  /** The single primary objective, or null. Convenience over objectiveState(buildings, 1). */
  export function pickObjective(buildings: SiteProgress[]): Objective | null {
    const state = objectiveState(buildings, 1);
    if (state.kind !== "next") return null;
    const [objective] = state.objectives;
    return objective ?? null;
  }
  ```

  and add these three import lines at the very top of the same file, above the `Objective` type:

  ```ts
  import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
  import { villagerForBuilding } from "./villagers";
  import type { SiteProgress } from "./layout";
  ```

  (`./layout` stays a type-only import: `layout.ts` pulls in the crown and season catalogs at runtime and this module must stay free of them for `deed-picker` to import it cheaply. Nothing here imports three.)

- [ ] **Step 9: Run it and watch it pass**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  9 passed (9)`.

- [ ] **Step 10: Commit the objective state**

  ```
  git add src/lib/realm/objective.ts src/lib/realm/objective.test.ts
  ```
  ```
  git commit -m "feat(realm): the starting quest, and the state behind it" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 11: Write the failing test for `riseToast` and `objectiveSpeech`**

  Replace the first import line of `src/lib/realm/objective.test.ts`:

  ```ts
  import { objectiveRank, rankBuildings, objectiveState, pickObjective, type ObjectiveState } from "./objective";
  ```

  with:

  ```ts
  import { objectiveRank, rankBuildings, objectiveState, pickObjective, riseToast, objectiveSpeech, type Objective, type ObjectiveState } from "./objective";
  ```

  Then append this to the end of the file. Every string here is verbatim from spec §3.2.

  ```ts
  const objective = (buildingId: string, label: string, villagerId: string | null, villagerName: string | null): Objective =>
    ({ buildingId, villagerId, label, villagerName, done: 0, total: 5 });

  describe("riseToast", () => {
    it("names the building that rose and the one that follows", () => {
      const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", "tessa", "Miller Tessa")] };
      expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill, with Miller Tessa.");
    });

    it("says the kingdom is finished when that was the last one", () => {
      // Interim copy: slice 13 (the record of the work) owns the final line and re-baselines this assertion.
      expect(riseToast("Royal Garden", { kind: "complete" })).toBe("The Royal Garden stands. Every building is raised.");
    });

    it("says only what it knows when the kingdom state is unknown", () => {
      expect(riseToast("Village Well", { kind: "unknown" })).toBe("The Village Well stands.");
      expect(riseToast("Village Well", { kind: "next", objectives: [] })).toBe("The Village Well stands.");
    });

    it("drops the companion clause when the next site has no villager", () => {
      const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] };
      expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill.");
    });
  });

  describe("objectiveSpeech", () => {
    it("reads the next objective aloud", () => {
      expect(objectiveSpeech(objectiveState(newHero, 1))).toBe("Your next side quest is at the Village Well. Old Bram is waiting.");
    });

    it("reads a finished kingdom aloud", () => {
      // Interim copy: slice 13 owns the final line and re-baselines this assertion.
      expect(objectiveSpeech({ kind: "complete" })).toBe("Every building is raised. Nothing is waiting.");
    });

    it("says nothing at all when the kingdom is unknown", () => {
      expect(objectiveSpeech({ kind: "unknown" })).toBeNull();
      expect(objectiveSpeech({ kind: "next", objectives: [] })).toBeNull();
    });

    it("drops the villager clause when the site has no villager", () => {
      expect(objectiveSpeech({ kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] })).toBe("Your next side quest is at the Grain Mill.");
    });

    it("never puts the word deed in a child's ear", () => {
      expect(objectiveSpeech(objectiveState(newHero, 1))).not.toMatch(/deed/i);
    });
  });
  ```

- [ ] **Step 12: Run it and watch it fail**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: the nine new tests fail with `TypeError: riseToast is not a function` / `objectiveSpeech is not a function` (or the file fails to collect with `does not provide an export named 'riseToast'`). The nine earlier tests still pass if the file collects.

- [ ] **Step 13: Write the toast and the spoken line**

  Append this to `src/lib/realm/objective.ts`:

  ```ts
  /**
   * The rise toast, with the next objective folded in so two toasts never queue: one 4-second toast
   * instead of two.
   */
  export function riseToast(label: string, next: ObjectiveState): string {
    const stands = `The ${label} stands.`;
    // Interim: slice 13 (the record of the work) owns the final completion line and moves it with its test.
    if (next.kind === "complete") return `${stands} Every building is raised.`;
    if (next.kind === "unknown") return stands;
    const [objective] = next.objectives;
    if (!objective) return stands;
    if (!objective.villagerName) return `${stands} Next: the ${objective.label}.`;
    return `${stands} Next: the ${objective.label}, with ${objective.villagerName}.`;
  }

  /** The read-aloud line, written for speech. Unknown says nothing: the problem lane already speaks for it. */
  export function objectiveSpeech(state: ObjectiveState): string | null {
    if (state.kind === "unknown") return null;
    // Interim: slice 13 owns the final completion line and moves it with its test.
    if (state.kind === "complete") return "Every building is raised. Nothing is waiting.";
    const [objective] = state.objectives;
    if (!objective) return null;
    const where = `Your next ${SIDE_QUEST_LOWER} is at the ${objective.label}.`;
    return objective.villagerName ? `${where} ${objective.villagerName} is waiting.` : where;
  }
  ```

  and add the copy import to the top of the same file, so the import block reads:

  ```ts
  import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
  import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
  import { villagerForBuilding } from "./villagers";
  import type { SiteProgress } from "./layout";
  ```

- [ ] **Step 14: Run it and watch it pass**

  ```
  npx vitest run src/lib/realm/objective.test.ts
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  18 passed (18)`.

- [ ] **Step 15: Commit the copy**

  ```
  git add src/lib/realm/objective.ts src/lib/realm/objective.test.ts
  ```
  ```
  git commit -m "feat(realm): the rise toast and the spoken objective" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 16: Confirm the test that guards the deed-picker change is green before you touch it**

  This is a refactor, so the test already exists: `src/components/deed-picker.test.tsx:29-35` asserts the headings read `["River Bridge", "Grain Mill", "Village Well"]` for a fixture of one in-progress, one untouched and one built site. Run it and record that it passes *before* the edit.

  ```
  npx vitest run src/components/deed-picker.test.tsx
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.

- [ ] **Step 17: Delete deed-picker's local rank and import the shared one**

  In `src/components/deed-picker.tsx`, add the import after the `AREA_LABELS` line (line 10), so the import block reads:

  ```tsx
  import { startDeedRun, type DeedsOverview, type RunStart } from "@/lib/actions/deeds";
  import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";
  import { rankBuildings } from "@/lib/realm/objective";
  import type { ProfileLike } from "@/lib/utils/deed-engine";
  ```

  Then replace these three lines (today `deed-picker.tsx:20-22`, lines 21-23 once the import is in):

  ```tsx
    // Work in progress leads, untouched buildings follow, finished ones rest at the end.
    const rank = (b: DeedsOverview["buildings"][number]) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
    const buildings = [...overview.buildings].sort((a, b) => rank(a) - rank(b));
  ```

  with these two:

  ```tsx
    // Work in progress leads, untouched buildings follow, finished ones rest at the end — the rank the world
    // sorts by too, so this page and the Realm can never disagree about what to do next.
    const buildings = rankBuildings(overview.buildings);
  ```

  Nothing else in the file changes: `DeedsOverview` is still used by the props type on line 14, and `rankBuildings` returns a new array, so `overview.buildings` is still never mutated.

- [ ] **Step 18: Run both test files, the typechecker and the linter**

  ```
  npx vitest run src/lib/realm/objective.test.ts src/components/deed-picker.test.tsx
  ```
  Expected: `Test Files  2 passed (2)` / `Tests  21 passed (21)` — the ordering assertion `["River Bridge", "Grain Mill", "Village Well"]` passes unchanged.
  ```
  npx tsc --noEmit
  ```
  Expected: no output, exit 0.
  ```
  npx eslint src/lib/realm/objective.ts src/lib/realm/objective.test.ts src/components/deed-picker.tsx
  ```
  Expected: no output, exit 0. (The one pre-existing lint error on this branch is in `src/components/quest-template-list.tsx`, which is not in this list and is not touched by this task.)

- [ ] **Step 19: Run the whole suite**

  ```
  npm test
  ```

  Expected: all test files pass. `deed-picker` was the only other holder of this rank (`grep -rn "complete ? 2" src` finds nothing else), so no other suite can be affected — this run proves it.

- [ ] **Step 20: Commit the adoption**

  ```
  git add src/components/deed-picker.tsx
  ```
  ```
  git commit -m "refactor(realm): the side quests page adopts the world's rank" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3: focus and status ride on the layout, and the village invariant

**Files:**
- Modify: `src/lib/realm/layout.ts` — types at :9-28 (`PropFocus` and `VillagerStatus` added above `Prop`; `Prop` gains `focus?`; `VillagerPlacement` gains `status`/`label`/`done`/`total`), and `buildWorldLayout` at :123-180 (input gains `objectiveIds?: string[]`; the `for (const building of BUILDINGS)` loop writes `focus` and `status`)
- Test: `src/lib/realm/layout.test.ts` — import line :2 extended, one new `describe` block appended after the current last line (:174)

**Interfaces:**

Consumes: nothing. This task has no dependency on Tasks 1 or 2 and can run in any order relative to them.

Produces (frozen by §8 — Tasks 4, 11, 12, 15 and 16 all read these names):
```ts
// src/lib/realm/layout.ts
export type PropFocus = "objective" | "tracked" | "done" | null;
export type VillagerStatus = "objective" | "work" | "built";
export type Prop = { /* …unchanged… */ focus?: PropFocus };
export type VillagerPlacement = {
  id: string; buildingId: string; position: Vec2;
  status: VillagerStatus; label: string; done: number; total: number;
};
export function buildWorldLayout(input: {
  castleType: string; buildings: SiteProgress[];
  villagers?: boolean; banners?: number; decor?: boolean; objectiveIds?: string[];
}): WorldLayout;
```

Two rulings this task makes, because §3.3's four bullets can both match one building (recorded in notes, and carried as a comment in the code):
1. **A raised site is never a quest.** `complete` beats membership in `objectiveIds`: a complete building gets `focus: "done"` / `status: "built"` even if the caller names it. `objectiveState` (Task 2) never returns a complete building, so this only ever fires defensively — but it is what makes `colliders` byte-identical with and without `objectiveIds`, since every collider is either the castle or a complete building.
2. **`focus` is written whether or not villagers are shown.** `villagers: false` (kingdom-error and the no-villager preview path) still marks the site prop; it just produces no `VillagerPlacement` to carry a `status`. The beacon in Task 16 reads `layout.props`, not `layout.villagers`, so it keeps working on that path.

`focus` is written as `PropFocus | undefined` and assigned unconditionally in the two site-prop literals. tsconfig has no `exactOptionalPropertyTypes`, so `focus: undefined` satisfies `focus?: PropFocus`, and `toEqual` treats an explicit `undefined` and a missing key as equal — which is what keeps the invariant assertion honest rather than accidentally true.

---

- [ ] **Step 1: Write the failing test — the village invariant, the four focus/status rules, and the villager's name and progress**

  In `src/lib/realm/layout.test.ts`, replace the import on line 2:

  ```ts
  import { buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR, BANNER_SIZE, BANNER_MARGIN, DECOR_SPOTS, spriteSizeFor } from "./layout";
  ```

  with:

  ```ts
  import { buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR, BANNER_SIZE, BANNER_MARGIN, DECOR_SPOTS, spriteSizeFor, type Prop } from "./layout";
  ```

  Then append this block to the end of the file (after the closing `});` of `describe("castle tier on the layout", …)` at line 174). It reuses the top-level `const none = { castleType: "campsite", buildings: [] };` already declared at line 8.

  ```ts

  describe("objective focus and villager status", () => {
    // The five fields §3.14(a) freezes: spawnTroubles, the gleam placement and the ceremony read only these.
    const strip = (p: Prop) => ({ id: p.id, kind: p.kind, position: p.position, size: p.size, solid: p.solid });
    const mixed = [
      { id: "well", done: 5, total: 5, complete: true },
      { id: "mill", done: 2, total: 5, complete: false },
      { id: "bridge", done: 1, total: 5, complete: false },
      { id: "chapel", done: 0, total: 5, complete: false },
    ];

    it("adds nothing to the village: with and without objectiveIds every prop and every collider is identical", () => {
      const plain = buildWorldLayout({ castleType: "keep", buildings: mixed, banners: 3 });
      const marked = buildWorldLayout({ castleType: "keep", buildings: mixed, banners: 3, objectiveIds: ["mill", "bridge", "well"] });
      expect(marked.props.map(strip)).toEqual(plain.props.map(strip));
      expect(marked.colliders).toEqual(plain.colliders);
      expect(marked.props.length).toBe(plain.props.length);
      expect(marked.spawn).toEqual(plain.spawn);
      // spawnTroubles filters kind === "foundation": same foundations, same order, same count.
      expect(marked.props.filter((p) => p.kind === "foundation").map((p) => p.id)).toEqual(plain.props.filter((p) => p.kind === "foundation").map((p) => p.id));
      expect(marked.villagers.map((v) => v.position)).toEqual(plain.villagers.map((v) => v.position));
    });

    it("marks the first objective, tracks the rest, calls a raised site done, and leaves everything else unmarked", () => {
      const layout = buildWorldLayout({ castleType: "keep", buildings: mixed, objectiveIds: ["mill", "bridge"] });
      const site = (id: string) => layout.props.find((p) => p.id === id)!;
      const villager = (buildingId: string) => layout.villagers.find((v) => v.buildingId === buildingId)!;
      expect(site("mill").focus).toBe("objective");
      expect(villager("mill").status).toBe("objective");
      expect(site("bridge").focus).toBe("tracked");
      expect(villager("bridge").status).toBe("work");
      expect(site("well").focus).toBe("done");
      expect(villager("well").status).toBe("built");
      expect(site("chapel").focus).toBeUndefined();
      expect(villager("chapel").status).toBe("work");
      // Only sites are ever marked: never the castle, a path tile, a banner, a villager prop or a decoration.
      expect(layout.props.filter((p) => p.focus !== undefined).map((p) => p.kind).sort()).toEqual(["building", "foundation", "foundation"]);
      expect(buildWorldLayout(none).props.every((p) => p.focus === undefined)).toBe(true);
      expect(buildWorldLayout({ ...none, objectiveIds: ["nope"] }).props.some((p) => p.focus === "objective")).toBe(false);
      // A raised site is never a quest, whatever the caller asks for.
      const built = buildWorldLayout({ castleType: "keep", buildings: [{ id: "well", done: 5, total: 5, complete: true }], objectiveIds: ["well"] });
      expect(built.props.find((p) => p.id === "well")!.focus).toBe("done");
      expect(built.villagers.find((v) => v.buildingId === "well")!.status).toBe("built");
    });

    it("gives every villager placement its site's name and progress", () => {
      const layout = buildWorldLayout({ castleType: "keep", buildings: mixed });
      expect(layout.villagers.find((v) => v.buildingId === "well")).toMatchObject({ label: "Village Well", done: 5, total: 5, status: "built" });
      expect(layout.villagers.find((v) => v.buildingId === "mill")).toMatchObject({ label: "Grain Mill", done: 2, total: 5, status: "work" });
      expect(layout.villagers.find((v) => v.buildingId === "garden")).toMatchObject({ label: "Royal Garden", done: 0, total: 5, status: "work" });
      expect(layout.villagers.every((v) => v.total > 0 && v.label.length > 0)).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it and watch two of the three fail**

  ```
  npx vitest run src/lib/realm/layout.test.ts
  ```

  Expected: `Tests  2 failed | 13 passed (15)`. The first failure is

  ```
  FAIL  src/lib/realm/layout.test.ts > objective focus and villager status > marks the first objective, tracks the rest, calls a raised site done, and leaves everything else unmarked
  AssertionError: expected undefined to be 'objective' // Object.is equality
  ```

  at `expect(site("mill").focus).toBe("objective")`; the second is the `toMatchObject` on the well placement, reporting `{ buildingId, id, position }` received against `{ done, label, status, total }` expected.

  The invariant test (`adds nothing to the village…`) **passes already, and must keep passing** — it is a regression guard, not a driver. The twelve pre-existing tests all still pass, including `stands a villager at every site, south of the footprint, never as a collider` at :49-63.

  `npx tsc --noEmit` reports errors on the test file at this point (`focus` and `status` do not exist yet, and `objectiveIds` is not in the input type). That is expected; typecheck is the gate in Step 6.

- [ ] **Step 3: Add the two types and the two additive fields**

  In `src/lib/realm/layout.ts`, insert the two new types between the `PropKind` alias (line 10) and `export type Prop` (line 12), so the file reads:

  ```ts
  export type Vec2 = { x: number; z: number };
  export type PropKind = "castle" | "building" | "foundation" | "path" | "villager" | "barrier" | "banner" | "decor";

  /** Which mark the scene draws over a site. Never changes a prop's kind, position, size or solidity. */
  export type PropFocus = "objective" | "tracked" | "done" | null;
  /** What the villager at a site is doing about it: waiting for you, working, or finished. */
  export type VillagerStatus = "objective" | "work" | "built";

  export type Prop = {
  ```

  Then replace the last line of the `Prop` body (line 21-22):

  ```ts
    solid: boolean; // walkable props (paths, foundations, villagers) are not colliders
  };
  ```

  with:

  ```ts
    solid: boolean; // walkable props (paths, foundations, villagers) are not colliders
    focus?: PropFocus; // a mark the scene draws over a site; additive only, and never read by colliders, spawns or the ceremony
  };
  ```

  And replace `VillagerPlacement` (line 26):

  ```ts
  export type VillagerPlacement = { id: string; buildingId: string; position: Vec2 };
  ```

  with:

  ```ts
  export type VillagerPlacement = {
    id: string;
    buildingId: string;
    position: Vec2;
    status: VillagerStatus;
    label: string; // the building's name: "Village Well"
    done: number;
    total: number;
  };
  ```

- [ ] **Step 4: Take `objectiveIds` and write `focus` and `status` in the building loop**

  In the same file, replace the signature and first line of `buildWorldLayout` (lines 123-124):

  ```ts
  export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number; decor?: boolean }): WorldLayout {
    const showVillagers = input.villagers ?? true;
  ```

  with:

  ```ts
  export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number; decor?: boolean; objectiveIds?: string[] }): WorldLayout {
    const showVillagers = input.villagers ?? true;
    const objectiveIds = input.objectiveIds ?? [];
  ```

  Then replace the body of the building loop (lines 157-167), from the `const p = progress.get(...)` line through the `villagers.push(...)` line:

  ```ts
      const p = progress.get(building.id) ?? { id: building.id, done: 0, total: building.deedsToBuild, complete: false };
      if (p.complete) {
        props.push({ id: building.id, kind: "building", label: building.label, tag: showVillagers ? "Built" : undefined, position: slot, size: footprint, color: BUILDING_COLORS[building.id] ?? "#888888", solid: true });
      } else {
        props.push({ id: building.id, kind: "foundation", label: building.label, tag: showVillagers ? `${p.done} of ${p.total}` : undefined, position: slot, size: { ...footprint, h: FOUNDATION_H }, color: FOUNDATION_COLOR, solid: false });
      }
      if (showVillagers) {
        const villager = VILLAGERS.find((v) => v.buildingId === building.id);
        if (villager) {
          const position = villagerPosition(slot, footprint);
          villagers.push({ id: villager.id, buildingId: building.id, position });
  ```

  with:

  ```ts
      const p = progress.get(building.id) ?? { id: building.id, done: 0, total: building.deedsToBuild, complete: false };
      // A raised site is never a quest, whatever the caller asks for, so a finished village can never grow a beacon.
      const rank = objectiveIds.indexOf(building.id);
      const focus: PropFocus | undefined = p.complete ? "done" : rank === 0 ? "objective" : rank > 0 ? "tracked" : undefined;
      const status: VillagerStatus = p.complete ? "built" : rank === 0 ? "objective" : "work";
      if (p.complete) {
        props.push({ id: building.id, kind: "building", label: building.label, tag: showVillagers ? "Built" : undefined, position: slot, size: footprint, color: BUILDING_COLORS[building.id] ?? "#888888", solid: true, focus });
      } else {
        props.push({ id: building.id, kind: "foundation", label: building.label, tag: showVillagers ? `${p.done} of ${p.total}` : undefined, position: slot, size: { ...footprint, h: FOUNDATION_H }, color: FOUNDATION_COLOR, solid: false, focus });
      }
      if (showVillagers) {
        const villager = VILLAGERS.find((v) => v.buildingId === building.id);
        if (villager) {
          const position = villagerPosition(slot, footprint);
          villagers.push({ id: villager.id, buildingId: building.id, position, status, label: building.label, done: p.done, total: p.total });
  ```

  Nothing else in the function changes. The `props.push({ id: \`villager-${villager.id}\`, … })` line directly below is untouched, the `decor` block is untouched, and the `return { props, spawn: SPAWN, colliders: props.filter((p) => p.solid), villagers, castleType }` line is untouched.

- [ ] **Step 5: Run it and watch all fifteen pass**

  ```
  npx vitest run src/lib/realm/layout.test.ts
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  15 passed (15)`.

- [ ] **Step 6: Prove nothing downstream moved — the realm suite, the typecheck and the lint**

  `VillagerPlacement` gained four required fields, so anything that builds one would now fail to compile. Nothing does: `buildWorldLayout` is the only construction site in the repo (`grep -rn "VillagerPlacement" src/` returns only `layout.ts`), and every reader — `ceremony.ts:77-81`, `recess/recess.ts:81`, `spells/troubles.ts:97`, `villagers.ts` `nearestVillager`, `realm-scene.tsx:145,206,234,327` — reads only `id`, `buildingId` and `position`. Run all three gates and confirm:

  ```
  npx vitest run src/lib/realm src/components/realm
  ```

  Expected: every file passes, including `ceremony.test.ts`, `troubles.test.ts`, `recess.test.ts`, `use-recess-sim.test.ts`, `use-spell-sim.test.ts` and `realm-shell.test.tsx`.

  ```
  npx tsc --noEmit
  ```

  Expected: no output, exit 0.

  ```
  npx eslint src/lib/realm/layout.ts src/lib/realm/layout.test.ts
  ```

  Expected: no output, exit 0. (The one pre-existing repo-wide lint error lives in `src/components/quest-template-list.tsx`, which this command does not touch.)

- [ ] **Step 7: Commit**

  This worktree is shared between sessions, so check the branch before staging, and stage only the two files this task touched.

  ```
  git branch --show-current
  ```

  Expected: `realm-foundations`.

  ```
  git status --short
  ```

  Expected: exactly `M src/lib/realm/layout.ts` and `M src/lib/realm/layout.test.ts`.

  ```
  git add src/lib/realm/layout.ts src/lib/realm/layout.test.ts
  ```

  ```
  git commit -m "feat(realm): carry objective focus and villager status on the world layout" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4: markers.ts — rings, shadows, the ground ladder and the beacon constants

One new pure module and its test. Nothing imports it yet: tasks 12, 13 and 16 do. The module is arithmetic and constants only — it imports `three` nowhere, and both of its imports are `import type`, so at runtime it pulls in nothing at all.

**Files:**
- Create: `src/lib/realm/markers.ts`
- Create (test): `src/lib/realm/markers.test.ts`
- Modify: none

**Interfaces:**

*Consumes* (both exist before this task runs):
- `type VillagerStatus = "objective" | "work" | "built"` — from `src/lib/realm/layout.ts`, added by **task 3**.
- `type Facing = "n" | "s" | "e" | "w"` and `const FACING_VEC: Record<Facing, Vec2>` — from `src/lib/realm/movement.ts`, which already exports both today (movement.ts:10 and :15). Unchanged by this task.

*Produces* (frozen by §8; tasks 12, 13 and 16 consume them):
```ts
export function facingAngle(facing: Facing): number
export function shadowFootprint(size: { w: number; d: number }): { w: number; d: number }
export type MarkerKind = "quest" | "done" | null
export function markerFor(status: VillagerStatus): MarkerKind
export const RING_INNER = 0.42
export const RING_OUTER = 0.55
export const RING_NOTCH_ARC = Math.PI / 3
export const RING_GOLD = "#c9a84c"
export const RING_CALM = "#8a7d5a"
export const SHADOW_OPACITY = 0.22
export const SHADOW_OPACITY_CALM = 0.14
export const GROUND_Y = { water: 0.02, path: 0.03, foundation: 0.04, propShadow: 0.045, lapWaypoint: 0.05, figureShadow: 0.055, heroRing: 0.06 } as const
export const BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 } as const
```

**The one piece of maths in this task, written out so the test can re-derive it.** The hero's ring is drawn as `<group position={[p.x, GROUND_Y.heroRing, p.z]} rotation={[-Math.PI/2, 0, facingAngle(hero.facing)]}>`, and both the notch in the `ringGeometry` and the solid arrowhead that fills it point along the geometry's **local +Y**. A three.js `Euler` with the default `"XYZ"` order and `y = 0` composes as `RX(x) · RZ(z)`. So local `+Y = (0,1,0)` goes:

- `RZ(a) · (0,1,0) = (−sin a, cos a, 0)`
- `RX(−π/2)` maps `(x, y, z) → (x, z, −y)` (because `cos(−π/2) = 0`, `sin(−π/2) = −1`)
- giving the world direction **`(x: −sin a, z: −cos a)`**

which is `n` at `a = 0`, `e` at `a = −π/2`, `s` at `a = π`, `w` at `a = π/2`. The test computes that expression and compares it to `FACING_VEC[facing]`, so `facingAngle` is never asserted against hardcoded numbers and a future ring rewrite cannot silently invert the cue.

---

- [ ] **Step 1: Confirm the branch and that task 3 has landed.**

  `markers.ts` imports `VillagerStatus` from `layout.ts`, which task 3 adds. Run each command on its own line:

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git branch --show-current
  git status --short
  grep -n "VillagerStatus\|FACING_VEC" src/lib/realm/layout.ts src/lib/realm/movement.ts
  ```

  Expected: `realm-foundations`; a clean working tree; and the grep printing `src/lib/realm/layout.ts:…:export type VillagerStatus = "objective" | "work" | "built";` alongside `src/lib/realm/movement.ts:15:export const FACING_VEC: Record<Facing, Vec2> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };`. If `VillagerStatus` is absent, task 3 is not committed yet — stop and finish task 3 first.

- [ ] **Step 2: Write the failing test for `facingAngle` and the ring constants.**

  Create `src/lib/realm/markers.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect } from "vitest";
  import { FACING_VEC, type Facing } from "./movement";
  import { facingAngle, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM } from "./markers";

  const FACINGS: Facing[] = ["n", "s", "e", "w"];

  /**
   * Where the ring's notch (and the arrowhead filling it) actually points, in world space.
   * The ring group is <group rotation={[-Math.PI/2, 0, facingAngle(f)]}> and the notch points
   * along the geometry's local +Y. A three.js Euler in the default "XYZ" order with y = 0
   * composes as RX(x)·RZ(z); RZ(a)·(0,1,0) = (-sin a, cos a, 0), and RX(-PI/2) maps
   * (x,y,z) -> (x, z, -y). So local +Y lands on (-sin a, 0, -cos a).
   * Derived here rather than hardcoded, so a future ring rewrite cannot silently invert the cue.
   */
  function notchDirection(angle: number): { x: number; z: number } {
    return { x: -Math.sin(angle), z: -Math.cos(angle) };
  }

  describe("facingAngle", () => {
    it("turns the notch to the direction the hero faces, derived from FACING_VEC", () => {
      for (const facing of FACINGS) {
        const dir = notchDirection(facingAngle(facing));
        expect(dir.x).toBeCloseTo(FACING_VEC[facing].x, 10);
        expect(dir.z).toBeCloseTo(FACING_VEC[facing].z, 10);
      }
    });
    it("gives each facing its own angle", () => {
      const angles = FACINGS.map(facingAngle);
      expect(new Set(angles).size).toBe(4);
    });
    it("is stable: the same facing always gives the same angle", () => {
      expect(facingAngle("n")).toBe(facingAngle("n"));
    });
  });

  describe("ring constants", () => {
    it("is a ring, not a disc", () => {
      expect(RING_INNER).toBe(0.42);
      expect(RING_OUTER).toBe(0.55);
      expect(RING_INNER).toBeLessThan(RING_OUTER);
    });
    it("notches 60 degrees out of the circle", () => {
      expect(RING_NOTCH_ARC).toBe(Math.PI / 3);
      expect(RING_NOTCH_ARC).toBeLessThan(Math.PI * 2);
    });
    it("carries a gold and a calm colour", () => {
      expect(RING_GOLD).toBe("#c9a84c");
      expect(RING_CALM).toBe("#8a7d5a");
    });
  });
  ```

- [ ] **Step 3: Run it and watch it fail.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 1, `Test Files  1 failed`, and no test executes — the file fails at import with `Error: Failed to load url ./markers (resolved id: ./markers) in /home/kylee/projects/kingdoms-and-crowns/src/lib/realm/markers.test.ts. Does the file exist?`

- [ ] **Step 4: Write `facingAngle` and the ring constants.**

  Create `src/lib/realm/markers.ts` with exactly this content:

  ```ts
  import type { Facing } from "./movement";

  /**
   * Local-Z rotation for the notched hero ring, so the notch points where the hero will walk.
   *
   * The ring group is rotated [-Math.PI/2, 0, facingAngle(facing)] and the notch — with the
   * solid arrowhead that fills it — points along the geometry's local +Y. Under that X
   * rotation local +Y lands on world (-sin a, 0, -cos a), which is what makes these four
   * numbers the four compass directions. markers.test.ts re-derives them from FACING_VEC
   * rather than trusting this table, so a ring rewrite cannot silently invert the cue.
   */
  const FACING_ANGLE: Record<Facing, number> = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 };

  export function facingAngle(facing: Facing): number {
    return FACING_ANGLE[facing];
  }

  export const RING_INNER = 0.42;
  export const RING_OUTER = 0.55;
  export const RING_NOTCH_ARC = Math.PI / 3; // 60°, centred on the facing direction
  export const RING_GOLD = "#c9a84c";
  export const RING_CALM = "#8a7d5a";
  ```

- [ ] **Step 5: Run it and watch it pass.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 0, `Test Files  1 passed`, `Tests  6 passed`.

- [ ] **Step 6: Write the failing test for `shadowFootprint`, the shadow opacities and the `GROUND_Y` ladder.**

  In `src/lib/realm/markers.test.ts`, replace the second import line

  ```ts
  import { facingAngle, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM } from "./markers";
  ```

  with

  ```ts
  import { facingAngle, shadowFootprint, GROUND_Y, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM } from "./markers";
  ```

  and append these two `describe` blocks to the end of the file:

  ```ts
  describe("shadowFootprint", () => {
    it("returns the prop's own width and depth, never a square", () => {
      expect(shadowFootprint({ w: 3, d: 1 })).toEqual({ w: 3, d: 1 });
      expect(shadowFootprint({ w: 0.6, d: 2.4 })).toEqual({ w: 0.6, d: 2.4 });
    });
    it("drops a prop size's height, so nothing scales a shadow by h", () => {
      // Bound to a const first: a fresh object literal passed straight in would trip
      // TypeScript's excess-property check on `{ w: number; d: number }`, and this is
      // exactly how realm-scene.tsx calls it — with a Prop's own `size`.
      const propSize = { w: 8, d: 6, h: 6 };
      expect(shadowFootprint(propSize)).toEqual({ w: 8, d: 6 });
    });
    it("returns a fresh object, so scaling a mesh can never write back into the layout", () => {
      const size = { w: 0.8, d: 0.8 };
      expect(shadowFootprint(size)).not.toBe(size);
    });
    it("keeps a figure's square footprint square", () => {
      expect(shadowFootprint({ w: 0.8, d: 0.8 })).toEqual({ w: 0.8, d: 0.8 });
    });
  });

  describe("shadow opacities", () => {
    it("is faint, and fainter still under a calm palette, but never gone", () => {
      expect(SHADOW_OPACITY).toBe(0.22);
      expect(SHADOW_OPACITY_CALM).toBe(0.14);
      expect(SHADOW_OPACITY_CALM).toBeLessThan(SHADOW_OPACITY);
      expect(SHADOW_OPACITY_CALM).toBeGreaterThan(0);
    });
  });

  describe("GROUND_Y", () => {
    it("names every rung of the ladder", () => {
      expect(GROUND_Y.water).toBe(0.02);
      expect(GROUND_Y.path).toBe(0.03);
      expect(GROUND_Y.foundation).toBe(0.04);
      expect(GROUND_Y.propShadow).toBe(0.045);
      expect(GROUND_Y.lapWaypoint).toBe(0.05);
      expect(GROUND_Y.figureShadow).toBe(0.055);
      expect(GROUND_Y.heroRing).toBe(0.06);
    });
    // Asserted over Object.values, in declaration order, so a later slice adding a rung has to
    // place it in the ladder rather than append it and quietly sink under a path tile.
    it("is strictly increasing in declaration order", () => {
      const rungs: number[] = Object.values(GROUND_Y);
      expect(rungs.length).toBeGreaterThanOrEqual(7);
      for (let i = 1; i < rungs.length; i++) {
        expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
      }
    });
    it("clears the path, the foundation and the recess waypoint with the marks that sit on them", () => {
      expect(GROUND_Y.propShadow).toBeGreaterThan(GROUND_Y.foundation);
      expect(GROUND_Y.figureShadow).toBeGreaterThan(GROUND_Y.lapWaypoint);
      expect(GROUND_Y.heroRing).toBeGreaterThan(GROUND_Y.figureShadow);
      expect(GROUND_Y.water).toBeLessThan(GROUND_Y.path);
    });
  });
  ```

- [ ] **Step 7: Run it and watch it fail.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 1, `Test Files  1 failed`, and the failure names the missing exports — vitest reports `SyntaxError: The requested module './markers.ts' does not provide an export named 'shadowFootprint'` at import; if the runner instead resolves it to `undefined`, the first shadow test fails with `TypeError: shadowFootprint is not a function`. Either way the run is red and the six passing tests from step 5 do not run.

- [ ] **Step 8: Write `shadowFootprint`, the opacities and the ladder.**

  Append to `src/lib/realm/markers.ts`:

  ```ts
  /**
   * The flat diamond a figure or prop drops on the ground: the footprint, never a bar.
   *
   * It is an indirection on purpose. It takes only w and d — a Prop's `size` also carries `h`,
   * and an `h` reaching a mesh scale is how a shadow becomes a wall — it returns a fresh object
   * so nothing can write back into a memoised layout, and it is the single place a later slice
   * pads or clamps every shadow in the world at once.
   */
  export function shadowFootprint(size: { w: number; d: number }): { w: number; d: number } {
    return { w: size.w, d: size.d };
  }

  export const SHADOW_OPACITY = 0.22;
  export const SHADOW_OPACITY_CALM = 0.14;

  /**
   * One ladder for everything that lies on the ground, so nothing hides under a path tile.
   * Every ground decal in the programme takes its y from a NAMED rung here; no file writes a
   * y literal for a ground decal. A later slice adding a rung inserts it in order — the test
   * walks Object.values and requires the ladder to stay strictly increasing.
   */
  export const GROUND_Y = {
    water: 0.02, // slice 4's river decals — the lowest rung, under everything
    path: 0.03, // existing: realm-scene.tsx:270
    foundation: 0.04, // existing: realm-scene.tsx:279
    propShadow: 0.045, // buildings, castle, decor — never on a path
    lapWaypoint: 0.05, // existing: recess-layer.tsx:43
    figureShadow: 0.055,
    heroRing: 0.06,
  } as const;
  ```

- [ ] **Step 9: Run it and watch it pass.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 0, `Test Files  1 passed`, `Tests  14 passed`.

- [ ] **Step 10: Write the failing test for `markerFor` and the beacon.**

  In `src/lib/realm/markers.test.ts`, add a third import line under the `./movement` import:

  ```ts
  import type { VillagerStatus } from "./layout";
  ```

  replace the `./markers` import line with

  ```ts
  import { facingAngle, shadowFootprint, markerFor, GROUND_Y, BEACON, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM, type MarkerKind } from "./markers";
  ```

  and append these two `describe` blocks to the end of the file:

  ```ts
  describe("markerFor", () => {
    it("marks the objective, the built and nothing else", () => {
      expect(markerFor("objective")).toBe("quest");
      expect(markerFor("built")).toBe("done");
      expect(markerFor("work")).toBeNull();
    });
    it("answers for every status a villager can hold", () => {
      const statuses: VillagerStatus[] = ["objective", "work", "built"];
      const marks: MarkerKind[] = statuses.map(markerFor);
      expect(marks).toEqual(["quest", null, "done"]);
    });
  });

  describe("BEACON", () => {
    it("is a thin gold column tall enough to read over a building", () => {
      expect(BEACON).toEqual({ radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 });
    });
    it("is shorter and quieter under a calm palette, and never absent", () => {
      expect(BEACON.calmHeight).toBeLessThan(BEACON.height);
      expect(BEACON.calmOpacity).toBeLessThan(BEACON.opacity);
      expect(BEACON.calmHeight).toBeGreaterThan(0);
      expect(BEACON.calmOpacity).toBeGreaterThan(0);
    });
    it("stands clear of the ground ladder", () => {
      expect(BEACON.height).toBeGreaterThan(GROUND_Y.heroRing);
    });
  });
  ```

- [ ] **Step 11: Run it and watch it fail.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 1, `Test Files  1 failed`, the failure naming `markerFor` — `SyntaxError: The requested module './markers.ts' does not provide an export named 'markerFor'` at import, or `TypeError: markerFor is not a function` in the first new test if the runner resolves it to `undefined`.

- [ ] **Step 12: Write `MarkerKind`, `markerFor` and `BEACON`.**

  Add the `VillagerStatus` type import at the top of `src/lib/realm/markers.ts`, directly under the `Facing` import:

  ```ts
  import type { VillagerStatus } from "./layout";
  ```

  (Both imports are `import type`, so `markers.ts` pulls in no module at runtime — §3.4's sketch also lists `Prop`, but nothing here takes a `Prop`, and an unused import is a lint error.)

  Then append to the end of the file:

  ```ts
  /** What floats over a villager's head: a quest mark, a done mark, or nothing at all. */
  export type MarkerKind = "quest" | "done" | null;

  const MARKER: Record<VillagerStatus, MarkerKind> = { objective: "quest", built: "done", work: null };

  export function markerFor(status: VillagerStatus): MarkerKind {
    return MARKER[status];
  }

  /** The gold column over the one objective site: thin, tall enough to clear a building, never solid. */
  export const BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 } as const;
  ```

- [ ] **Step 13: Run it and watch it pass.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx vitest run src/lib/realm/markers.test.ts
  ```

  Expected: exit code 0, `Test Files  1 passed`, `Tests  19 passed`.

- [ ] **Step 14: Typecheck and lint the two new files.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npm run typecheck
  npx eslint src/lib/realm/markers.ts src/lib/realm/markers.test.ts
  ```

  Expected: `tsc --noEmit` prints nothing and exits 0; `eslint` prints nothing and exits 0. (The one pre-existing lint error in `src/components/quest-template-list.tsx` is not in scope here — this command only lints the two new files.)

- [ ] **Step 15: Run the whole suite, so a new module is proved to break nothing.**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npm test
  ```

  Expected: exit code 0 and every test file passing, with `src/lib/realm/markers.test.ts` among them. `markers.ts` is imported by nothing yet — tasks 12, 13 and 16 are its first consumers — so no other suite can have changed.

- [ ] **Step 16: Commit.**

  Check the branch first (this checkout is shared between sessions), then commit — each command on its own line, never chained:

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git branch --show-current
  git status --short
  git add src/lib/realm/markers.ts src/lib/realm/markers.test.ts
  git commit -m "feat(realm): one ground ladder, the hero ring's facing, and the shadow footprint" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  Expected: `realm-foundations`; `git status --short` showing only the two new files as `??` before `git add`; the commit reporting `2 files changed`.

---

### Task 5: camera.ts — worldToScreen and the off-screen edge arrow

The Realm's one objective site can sit behind the camera edge, and a child who cannot see where to go has no game. This task adds the arithmetic that later turns into an arrow on the viewport border: a projection from ground coordinates to screen pixels for the fixed tabletop camera, and a clamp-to-the-border helper. Both are pure — no three, no DOM, no React. Task 16 drives them per frame; task 9 renders the element they position.

**No camera parameter changes in this slice.** `CAMERA_OFFSET`, `CAMERA_ZOOM`, `SMOOTHING_SECONDS` and `followCamera` are not edited — the reframe for a 64-unit world belongs to slice 4, which depends on this arrow already existing. The only change to `camera.ts` is an append after its last line.

**Files:**
- Modify: `src/lib/realm/camera.ts` — append after line 13 (the file is exactly 13 lines today: the `Vec2` import, `CAMERA_OFFSET`, `CAMERA_ZOOM`, `SMOOTHING_SECONDS`, `followCamera`). Nothing above line 13 is touched.
- Test: `src/lib/realm/camera.test.ts` — line 2 (the import) is edited twice; two new `describe` blocks are appended. The existing `followCamera`/constants describe block (lines 4-22 — the whole of the file below the import) is not edited.

**Interfaces:**

Consumes (from earlier tasks): nothing. `Vec2` (`{ x: number; z: number }`) is already imported at `src/lib/realm/camera.ts:1` from `./layout`; task 3's edits to `layout.ts` do not change it.

Produces (frozen by §8 — tasks 16 and slices 4, 7 and 12 consume these exact signatures):
```ts
export type Viewport = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };
export type EdgeArrow = { x: number; y: number; angle: number };
export function worldToScreen(camTarget: Vec2, world: Vec2, viewport: Viewport, zoom?: number): ScreenPoint;
export function edgeArrow(camTarget: Vec2, target: Vec2, viewport: Viewport, opts?: { margin?: number; zoom?: number }): EdgeArrow | null;
```
`zoom` defaults to `CAMERA_ZOOM` (40); `margin` defaults to 56 px (the `--realm-touch` world touch target, so the arrow never sits under a HUD zone's edge). The 56 stays module-private — §8 exports no constant for it.

---

- [ ] **Step 1: Write the failing test for `worldToScreen`.**

  Edit `src/lib/realm/camera.test.ts`. Change line 2 from:

  ```ts
  import { followCamera, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";
  ```

  to:

  ```ts
  import { followCamera, worldToScreen, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";
  ```

  Then append this block to the end of the file (after the closing `});` of the existing `describe("followCamera", ...)` on line 22, which is the last line of the 22-line file — do not edit anything inside it):

  ```ts

  // The fixed tabletop camera sits at (12, 12, 12) looking at (t.x, 0, t.z) with up (0, 1, 0),
  // so right = (1, 0, -1)/√2 and up = (-1, 2, -1)/√6. One world unit east therefore moves the
  // point CAMERA_ZOOM/√2 px right and CAMERA_ZOOM/√6 px *down* (screen y grows downward).
  const VIEW = { width: 800, height: 600 };

  describe("worldToScreen", () => {
    it("puts the camera target at the viewport centre", () => {
      expect(worldToScreen({ x: 0, z: 0 }, { x: 0, z: 0 }, VIEW)).toEqual({ x: 400, y: 300 });
      expect(worldToScreen({ x: 5, z: -3 }, { x: 5, z: -3 }, VIEW)).toEqual({ x: 400, y: 300 });
    });
    it("moves a point one unit east right by zoom/√2 and down by zoom/√6", () => {
      const p = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
      expect(p.x - 400).toBeCloseTo(CAMERA_ZOOM / Math.SQRT2, 10);
      expect(p.y - 300).toBeCloseTo(CAMERA_ZOOM / Math.sqrt(6), 10);
    });
    it("moves a point one unit north (−z) right by zoom/√2 and up by zoom/√6", () => {
      const p = worldToScreen({ x: 0, z: 0 }, { x: 0, z: -1 }, VIEW);
      expect(p.x - 400).toBeCloseTo(CAMERA_ZOOM / Math.SQRT2, 10);
      expect(p.y - 300).toBeCloseTo(-CAMERA_ZOOM / Math.sqrt(6), 10);
    });
    it("is linear: two units is exactly twice one unit", () => {
      const one = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
      const two = worldToScreen({ x: 0, z: 0 }, { x: 2, z: 0 }, VIEW);
      expect(two.x - 400).toBeCloseTo(2 * (one.x - 400), 10);
      expect(two.y - 300).toBeCloseTo(2 * (one.y - 300), 10);
    });
    it("measures the offset from the camera target, not from the world origin", () => {
      const a = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
      const b = worldToScreen({ x: 7, z: -2 }, { x: 8, z: -2 }, VIEW);
      expect(b).toEqual(a);
    });
    it("defaults zoom to CAMERA_ZOOM and scales with an explicit zoom", () => {
      const dflt = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
      expect(dflt).toEqual(worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW, CAMERA_ZOOM));
      const half = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW, CAMERA_ZOOM / 2);
      expect(half.x - 400).toBeCloseTo((dflt.x - 400) / 2, 10);
      expect(half.y - 300).toBeCloseTo((dflt.y - 300) / 2, 10);
    });
    it("centres on the viewport it is given", () => {
      expect(worldToScreen({ x: 0, z: 0 }, { x: 0, z: 0 }, { width: 360, height: 640 })).toEqual({ x: 180, y: 320 });
    });
  });
  ```

- [ ] **Step 2: Run the test and watch it fail.**

  ```
  npx vitest run src/lib/realm/camera.test.ts
  ```

  Expected: red. `worldToScreen` does not exist in `camera.ts` yet, so Vitest fails the module link — the output is either `SyntaxError: The requested module './camera.ts' does not provide an export named 'worldToScreen'` (the whole file fails to load, including the three `followCamera` tests) or, if the transform resolves it to `undefined`, seven failures reading `TypeError: worldToScreen is not a function`. Either shape is the expected red. Do **not** run `npm run typecheck` at this step — it will also fail, by design.

- [ ] **Step 3: Implement `worldToScreen`.**

  Append to `src/lib/realm/camera.ts`, after line 13 (the closing `}` of `followCamera`):

  ```ts

  export type Viewport = { width: number; height: number };
  /** Pixels from the viewport's top-left. */
  export type ScreenPoint = { x: number; y: number };

  /** Basis divisors for the fixed tabletop camera: right = (1, 0, -1)/√2, up = (-1, 2, -1)/√6. */
  const RIGHT_DIV = Math.SQRT2;
  const UP_DIV = Math.sqrt(6);

  /**
   * Where a ground point lands on screen, for the fixed tabletop camera.
   * Derived from CAMERA_OFFSET (12, 12, 12) looking at (target.x, 0, target.z) with up (0, 1, 0) —
   * never from a hard-coded screen coordinate. R3F's default orthographic frustum is the canvas in
   * pixels, so `zoom` is exactly pixels per world unit. Screen y grows downward.
   */
  export function worldToScreen(camTarget: Vec2, world: Vec2, viewport: Viewport, zoom: number = CAMERA_ZOOM): ScreenPoint {
    const dx = world.x - camTarget.x;
    const dz = world.z - camTarget.z;
    return {
      x: viewport.width / 2 + (zoom * (dx - dz)) / RIGHT_DIV,
      y: viewport.height / 2 + (zoom * (dx + dz)) / UP_DIV,
    };
  }
  ```

- [ ] **Step 4: Run the test and watch it pass.**

  ```
  npx vitest run src/lib/realm/camera.test.ts
  ```

  Expected: green — 10 passing (the 3 existing `followCamera`/constants tests plus the 7 new `worldToScreen` tests).

- [ ] **Step 5: Commit the projection.**

  ```
  git branch --show-current
  ```
  Expected output: `realm-foundations`. If it is anything else, stop and switch before committing — this checkout is shared.

  ```
  git add src/lib/realm/camera.ts src/lib/realm/camera.test.ts
  ```
  ```
  git commit -m "feat(realm): project ground points to screen for the tabletop camera" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Write the failing test for `edgeArrow`.**

  Edit `src/lib/realm/camera.test.ts` line 2 again, from:

  ```ts
  import { followCamera, worldToScreen, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";
  ```

  to:

  ```ts
  import { followCamera, worldToScreen, edgeArrow, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";
  ```

  Then append this block to the end of the file (after the `describe("worldToScreen", ...)` block added in step 1):

  ```ts

  // VIEW is 800×600, so with the default 56 px margin the inset rectangle is x ∈ [56, 744], y ∈ [56, 544]
  // and the centre is (400, 300). The four probe points below are chosen so each projects due right,
  // due left, straight down or straight up of that centre.
  describe("edgeArrow", () => {
    const AT = { x: 0, z: 0 };

    it("returns null while the target is comfortably on screen", () => {
      expect(edgeArrow(AT, { x: 0, z: 0 }, VIEW)).toBeNull();
      expect(edgeArrow(AT, { x: 1, z: 0 }, VIEW)).toBeNull();
      expect(edgeArrow(AT, { x: -2, z: 3 }, VIEW)).toBeNull();
    });

    it("clamps a target off the right edge and points at it", () => {
      // (10, -10) projects to x = 400 + 40·20/√2 ≈ 965.7, y = 300.
      const a = edgeArrow(AT, { x: 10, z: -10 }, VIEW);
      expect(a).not.toBeNull();
      expect(a?.x).toBe(744);
      expect(a?.y).toBe(300);
      expect(a?.angle).toBeCloseTo(0, 10);
    });

    it("clamps a target off the left edge and points at it", () => {
      // (-10, 10) projects to x ≈ -165.7, y = 300.
      const a = edgeArrow(AT, { x: -10, z: 10 }, VIEW);
      expect(a?.x).toBe(56);
      expect(a?.y).toBe(300);
      expect(Math.abs(a?.angle ?? 0)).toBeCloseTo(Math.PI, 10);
    });

    it("clamps a target off the bottom edge and points at it", () => {
      // (10, 10) projects to x = 400, y = 300 + 40·20/√6 ≈ 626.6.
      const a = edgeArrow(AT, { x: 10, z: 10 }, VIEW);
      expect(a?.x).toBe(400);
      expect(a?.y).toBe(544);
      expect(a?.angle).toBeCloseTo(Math.PI / 2, 10);
    });

    it("clamps a target off the top edge and points at it", () => {
      // (-10, -10) projects to x = 400, y ≈ -26.6.
      const a = edgeArrow(AT, { x: -10, z: -10 }, VIEW);
      expect(a?.x).toBe(400);
      expect(a?.y).toBe(56);
      expect(a?.angle).toBeCloseTo(-Math.PI / 2, 10);
    });

    it("takes the heading from the true target, not from the corner it was clamped into", () => {
      // (20, 0) projects to (≈965.7, ≈626.6): off both the right and the bottom edge.
      // The clamped corner (744, 544) would read atan2(244, 344) ≈ 0.617 rad; the true
      // bearing is atan2(40·20/√6, 40·20/√2) = atan2(1/√3, 1) = π/6. The arrow points at the site.
      const a = edgeArrow(AT, { x: 20, z: 0 }, VIEW);
      expect(a?.x).toBe(744);
      expect(a?.y).toBe(544);
      expect(a?.angle).toBeCloseTo(Math.PI / 6, 10);
    });

    it("returns null for a zero-size viewport — the first frame and a hidden tab", () => {
      expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 0, height: 0 })).toBeNull();
      expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 0, height: 600 })).toBeNull();
      expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 800, height: 0 })).toBeNull();
    });

    it("defaults the margin to 56 px", () => {
      // On a 200×200 viewport (1, -1) projects to x = 100 + 40·2/√2 ≈ 156.6, y = 100:
      // outside the default inset edge of 144, inside a 10 px one.
      const small = { width: 200, height: 200 };
      const a = edgeArrow(AT, { x: 1, z: -1 }, small);
      expect(a?.x).toBe(144);
      expect(a?.y).toBe(100);
      expect(a?.angle).toBeCloseTo(0, 10);
      expect(edgeArrow(AT, { x: 1, z: -1 }, small, { margin: 10 })).toBeNull();
    });

    it("defaults the zoom to CAMERA_ZOOM", () => {
      const small = { width: 200, height: 200 };
      expect(edgeArrow(AT, { x: 1, z: -1 }, small)).toEqual(edgeArrow(AT, { x: 1, z: -1 }, small, { zoom: CAMERA_ZOOM }));
      // At a quarter of the zoom the same point projects to ≈114 px and is comfortably on screen.
      expect(edgeArrow(AT, { x: 1, z: -1 }, small, { zoom: CAMERA_ZOOM / 4 })).toBeNull();
    });

    it("agrees with worldToScreen about where the target is", () => {
      const target = { x: 10, z: -10 };
      const p = worldToScreen(AT, target, VIEW);
      const a = edgeArrow(AT, target, VIEW);
      expect(a?.angle).toBeCloseTo(Math.atan2(p.y - 300, p.x - 400), 10);
    });
  });
  ```

- [ ] **Step 7: Run the test and watch it fail.**

  ```
  npx vitest run src/lib/realm/camera.test.ts
  ```

  Expected: red on the ten new `edgeArrow` tests — `edgeArrow` is not exported from `camera.ts`, so the failure is `SyntaxError: The requested module './camera.ts' does not provide an export named 'edgeArrow'` or ten `TypeError: edgeArrow is not a function`. The `worldToScreen` tests from step 1 are unaffected once the module links.

- [ ] **Step 8: Implement `edgeArrow`.**

  Append to `src/lib/realm/camera.ts`, after the `worldToScreen` function added in step 3:

  ```ts

  /** angle in radians, 0 = right, clockwise (screen y grows downward). */
  export type EdgeArrow = { x: number; y: number; angle: number };

  /** The world touch target (--realm-touch), so the arrow never sits under a HUD zone's edge. */
  const DEFAULT_ARROW_MARGIN = 56;

  function clampTo(value: number, lo: number, hi: number): number {
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
  }

  /**
   * Null when the target is comfortably on screen — inside the viewport inset by `margin`.
   * Otherwise the projection clamped to that inset rectangle, plus the heading from the viewport
   * centre to the *unclamped* projection, so the arrow points at the real site rather than at the
   * corner it was clamped into. A zero-size viewport (first frame, hidden tab) is null: there is no
   * rectangle to point across.
   */
  export function edgeArrow(
    camTarget: Vec2,
    target: Vec2,
    viewport: Viewport,
    opts?: { margin?: number; zoom?: number },
  ): EdgeArrow | null {
    const { width, height } = viewport;
    if (!(width > 0) || !(height > 0)) return null;
    const margin = opts?.margin ?? DEFAULT_ARROW_MARGIN;
    const point = worldToScreen(camTarget, target, viewport, opts?.zoom ?? CAMERA_ZOOM);
    const onScreen =
      point.x >= margin && point.x <= width - margin && point.y >= margin && point.y <= height - margin;
    if (onScreen) return null;
    return {
      x: clampTo(point.x, margin, width - margin),
      y: clampTo(point.y, margin, height - margin),
      angle: Math.atan2(point.y - height / 2, point.x - width / 2),
    };
  }
  ```

- [ ] **Step 9: Run the whole camera suite and watch it pass.**

  ```
  npx vitest run src/lib/realm/camera.test.ts
  ```

  Expected: green — 20 passing. Confirm by eye that the three original assertions are among them: `followCamera > eases toward the hero and converges`, `> snaps under reduced motion`, `> exposes the tabletop constants`.

- [ ] **Step 10: Typecheck and lint the two files.**

  ```
  npm run typecheck
  ```
  Expected: no output, exit 0.

  ```
  npx eslint src/lib/realm/camera.ts src/lib/realm/camera.test.ts
  ```
  Expected: no output, exit 0. (The one pre-existing repo lint error lives in `src/components/quest-template-list.tsx` and is not in this command's scope.)

  ```
  npm test
  ```
  Expected: the full suite green. Nothing else imports `camera.ts`'s new exports yet, so no other file can have moved.

- [ ] **Step 11: Commit the arrow.**

  ```
  git branch --show-current
  ```
  Expected output: `realm-foundations`.

  ```
  git add src/lib/realm/camera.ts src/lib/realm/camera.test.ts
  ```
  ```
  git commit -m "feat(realm): clamp an off-screen objective to the viewport border" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 6: messages.ts — two lanes, one message each, one written priority

The Realm shows too many things at once and, worse, the wrong one wins. `warning` stays `true` for the whole final minute of a metered visit (`use-play-clock.ts` sets it and only clears it above 1 minute), so a single literal priority chain `errors > one-minute banner > ceremony > toast > notice` would suppress every toast and every notice for that entire minute — exactly when `The Village Well stands.` matters most. This task writes the pure half of §3.6: two lanes (**persistent problems** and **things the game says**), one message in each, the brief's priority kept *inside* each lane. `realm-messages.tsx` (task 9) renders what these two functions return; nothing imports them yet.

**Files:**
- Create: `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/messages.ts`
- Create (test): `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/messages.test.ts`
- Modify: none

**Interfaces:**

*Consumes:* nothing. This module imports nothing at all — it is types, two frozen arrays, and two pure functions. It must never import `three`, React, or anything from `src/components/**`.

*Produces* (the frozen §8 contract — task 9 renders these, and slices 6, 8, 9, 12 and 13 extend the unions):
```ts
type ProblemKind = "spriteError" | "kingdomError" | "ceremonyError" | "lastMinute" | "preview"
type SpeechKind  = "ceremony" | "toast" | "notice"
type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string | null }
type RealmSpeech  = { kind: SpeechKind; text: string; tone: "stage" | "cheer" | "plain" }
type MessageInput = { spriteError: string; kingdomError: string; ceremonyError: string; lastMinute: boolean;
                      preview: string | null; ceremonyNotice: string | null; toast: string | null;
                      notice: string | null; calm: boolean }
const LAST_MINUTE_TEXT = "One minute left in the Realm today."
const PROBLEM_ORDER: ProblemKind[]      // ["spriteError","kingdomError","ceremonyError","lastMinute","preview"]
const SPEECH_ORDER: SpeechKind[]        // ["ceremony","toast","notice"]
function pickProblem(input: MessageInput): RealmProblem | null
function pickSpeech(input: MessageInput): RealmSpeech | null
```
Action labels, verbatim: `spriteError` → `Try again`; `kingdomError` → `Wake the villagers`; `ceremonyError` → `Try again`; `lastMinute` and `preview` → `null`. Tones: `ceremony` → `"stage"`; `toast` → `"cheer"`, or `"plain"` when `input.calm`; `notice` → `"plain"`.

*One later task in this slice extends this union.* §3.20 needs a sixth problem kind, `questTimer` — `Your {subject} timer finished.` with the action `Go to it →` — and task 20's steps 13b–13c add it to the union, to `PROBLEM_ORDER` (between `ceremonyError` and `lastMinute`), to `MessageInput` as `questTimerDone: string | null`, and to both tables below. That is §8's own rule for adding a kind, and it is why the two `Record<ProblemKind, …>` tables exist. Write the five here; do not anticipate the sixth.

---

- [ ] **Step 1: Write the failing test for `pickProblem` — the problem lane's priority, its texts and its verbatim action labels.**

  Create `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/messages.test.ts` with exactly this content. The four error/intro strings in the fixtures are the real ones this lane will carry: `realm-shell.tsx:42` (`VILLAGERS_RESTING`), `realm-shell.tsx:45` (`CEREMONY_FAILED`), `sprite-texture.ts:32,39` (the sprite failure), and §3.17's preview line.

  ```ts
  import { describe, it, expect } from "vitest";
  import { pickProblem, PROBLEM_ORDER, type MessageInput, type ProblemKind } from "./messages";

  /** Every lane quiet: the shape RealmShell holds on a calm, mid-session frame. */
  const QUIET: MessageInput = {
    spriteError: "",
    kingdomError: "",
    ceremonyError: "",
    lastMinute: false,
    preview: null,
    ceremonyNotice: null,
    toast: null,
    notice: null,
    calm: false,
  };

  const input = (patch: Partial<MessageInput>): MessageInput => ({ ...QUIET, ...patch });

  const SPRITE_FAILED = "The hero's picture could not be drawn.";
  const VILLAGERS_RESTING = "The villagers are resting. Try again.";
  const CEREMONY_FAILED = "The crown could not be recorded.";
  const PREVIEW_INTRO = "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.";

  describe("PROBLEM_ORDER", () => {
    it("is the closed list of problem kinds, in written priority order", () => {
      expect(PROBLEM_ORDER).toEqual(["spriteError", "kingdomError", "ceremonyError", "lastMinute", "preview"]);
    });
  });

  describe("pickProblem", () => {
    it("returns nothing when every field is empty", () => {
      expect(pickProblem(QUIET)).toBeNull();
    });

    it("returns one message, and each kind takes the lane in PROBLEM_ORDER as the one above it clears", () => {
      const clear: Record<ProblemKind, Partial<MessageInput>> = {
        spriteError: { spriteError: "" },
        kingdomError: { kingdomError: "" },
        ceremonyError: { ceremonyError: "" },
        lastMinute: { lastMinute: false },
        preview: { preview: null },
      };
      let live = input({
        spriteError: SPRITE_FAILED,
        kingdomError: VILLAGERS_RESTING,
        ceremonyError: CEREMONY_FAILED,
        lastMinute: true,
        preview: PREVIEW_INTRO,
      });
      for (const kind of PROBLEM_ORDER) {
        expect(pickProblem(live)?.kind).toBe(kind);
        live = { ...live, ...clear[kind] };
      }
      expect(pickProblem(live)).toBeNull();
    });

    it("carries each source's own text", () => {
      expect(pickProblem(input({ spriteError: SPRITE_FAILED }))?.text).toBe(SPRITE_FAILED);
      expect(pickProblem(input({ kingdomError: VILLAGERS_RESTING }))?.text).toBe(VILLAGERS_RESTING);
      expect(pickProblem(input({ ceremonyError: CEREMONY_FAILED }))?.text).toBe(CEREMONY_FAILED);
      expect(pickProblem(input({ preview: PREVIEW_INTRO }))?.text).toBe(PREVIEW_INTRO);
    });

    it("writes the last-minute banner itself, since the input carries only a flag", () => {
      expect(pickProblem(input({ lastMinute: true }))).toEqual({
        kind: "lastMinute",
        text: "One minute left in the Realm today.",
        actionLabel: null,
      });
    });

    it("labels each action verbatim", () => {
      expect(pickProblem(input({ spriteError: SPRITE_FAILED }))?.actionLabel).toBe("Try again");
      expect(pickProblem(input({ kingdomError: VILLAGERS_RESTING }))?.actionLabel).toBe("Wake the villagers");
      expect(pickProblem(input({ ceremonyError: CEREMONY_FAILED }))?.actionLabel).toBe("Try again");
      expect(pickProblem(input({ lastMinute: true }))?.actionLabel).toBeNull();
      expect(pickProblem(input({ preview: PREVIEW_INTRO }))?.actionLabel).toBeNull();
    });

    it("leaves the loser in the input, so it appears when the winner clears", () => {
      const both = input({ kingdomError: VILLAGERS_RESTING, preview: PREVIEW_INTRO });
      expect(pickProblem(both)?.kind).toBe("kingdomError");
      expect(both.preview).toBe(PREVIEW_INTRO);
      expect(pickProblem({ ...both, kingdomError: "" })?.kind).toBe("preview");
    });

    it("treats an empty string as no message, not as a blank pill", () => {
      expect(pickProblem(input({ preview: "" }))).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run it and watch it fail — there is no module to import.**

  ```
  npx vitest run src/lib/realm/messages.test.ts
  ```
  Expected: the file fails to collect, with `Error: Failed to resolve import "./messages" from "src/lib/realm/messages.test.ts". Does the file exist?` and `Test Files  1 failed`. No assertion runs.

- [ ] **Step 3: Write `messages.ts` — the types, `PROBLEM_ORDER`, and `pickProblem`.**

  Create `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/messages.ts` with exactly this content. Note the two `Record<ProblemKind, …>` tables: they are how a later slice adding a kind is *forced* to give it a text source and an action label — adding a member to the union without adding it to both tables is a type error, and adding it to the tables without adding it to `PROBLEM_ORDER` leaves it unreachable and visibly untested.

  ```ts
  /**
   * The Realm's two message lanes.
   *
   * The brief asked for one message at a time under
   * `errors > one-minute banner > ceremony narration > toast > notice`. Taken
   * literally that chain is a bug: `lastMinute` stays true for the whole final
   * minute of a metered visit, so it would swallow every toast and every notice
   * for that minute — and the last minute is exactly when `The Village Well
   * stands.` matters most. So the order is kept and split at its natural seam.
   * Persistent PROBLEMS get the top-centre band; things the game SAYS get the
   * bottom-centre lane above the ability bar. One message in each, never a
   * stack, and the loser of a lane is never destroyed — it stays in its own
   * state and appears the moment the winner clears.
   *
   * A later slice adding a message kind adds it to the union, to the ORDER
   * array and to the tables below. It does not add a lane.
   */

  export type ProblemKind = "spriteError" | "kingdomError" | "ceremonyError" | "lastMinute" | "preview";
  export type SpeechKind = "ceremony" | "toast" | "notice";

  export type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string | null };
  export type RealmSpeech = { kind: SpeechKind; text: string; tone: "stage" | "cheer" | "plain" };

  export type MessageInput = {
    spriteError: string; // "" when none
    kingdomError: string; // "" when none
    ceremonyError: string; // "" when none
    lastMinute: boolean;
    preview: string | null; // the parent's intro, with the gate note already appended
    ceremonyNotice: string | null;
    toast: string | null;
    notice: string | null;
    calm: boolean; // reducedMotion || lowStimulus: a cheer becomes plain
  };

  /**
   * The only copy this module owns. Every other string arrives on the input;
   * the last minute arrives as a flag, so the sentence lives here. It is the
   * one the `.realm-hud-banner` paragraph carried before task 9 deletes it.
   */
  export const LAST_MINUTE_TEXT = "One minute left in the Realm today.";

  export const PROBLEM_ORDER: ProblemKind[] = ["spriteError", "kingdomError", "ceremonyError", "lastMinute", "preview"];

  /** Where each problem's text comes from; `null` means that kind is not live. */
  const PROBLEM_TEXT: Record<ProblemKind, (input: MessageInput) => string | null> = {
    spriteError: (i) => i.spriteError || null,
    kingdomError: (i) => i.kingdomError || null,
    ceremonyError: (i) => i.ceremonyError || null,
    lastMinute: (i) => (i.lastMinute ? LAST_MINUTE_TEXT : null),
    preview: (i) => i.preview || null,
  };

  /** The verbatim label on the lane's one button; `null` means the pill has none. */
  const PROBLEM_ACTION: Record<ProblemKind, string | null> = {
    spriteError: "Try again",
    kingdomError: "Wake the villagers",
    ceremonyError: "Try again",
    lastMinute: null,
    preview: null,
  };

  /** The top-centre band: at most one persistent problem, highest priority first. */
  export function pickProblem(input: MessageInput): RealmProblem | null {
    for (const kind of PROBLEM_ORDER) {
      const text = PROBLEM_TEXT[kind](input);
      if (text) return { kind, text, actionLabel: PROBLEM_ACTION[kind] };
    }
    return null;
  }
  ```

- [ ] **Step 4: Run it and watch it pass.**

  ```
  npx vitest run src/lib/realm/messages.test.ts
  ```
  Expected: `Test Files  1 passed (1)` and `Tests  8 passed (8)` — the one `PROBLEM_ORDER` case plus the seven in `describe("pickProblem")`.

- [ ] **Step 5: Commit the problem lane.**

  ```
  git branch --show-current
  ```
  Expected: `realm-foundations`. (Several sessions share this checkout — if it says anything else, stop and fix the branch before committing.)
  ```
  git add src/lib/realm/messages.ts src/lib/realm/messages.test.ts
  ```
  ```
  git commit -m "feat(realm): pick one problem message by written priority" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Write the failing test for `pickSpeech` — including the regression this whole design exists to prevent.**

  First replace the import line at the top of `src/lib/realm/messages.test.ts`:

  ```ts
  import { pickProblem, PROBLEM_ORDER, type MessageInput, type ProblemKind } from "./messages";
  ```
  becomes
  ```ts
  import { pickProblem, pickSpeech, PROBLEM_ORDER, SPEECH_ORDER, type MessageInput, type ProblemKind, type SpeechKind } from "./messages";
  ```

  Then append these three fixtures immediately after the `PREVIEW_INTRO` constant (they are the real strings: `ceremony.ts:140`'s hail, the rise toast from `realm-shell.tsx:420`, and `realm-shell.tsx:43`'s refusal):

  ```ts
  const HAIL = "Hail, Lily, Crown of Spring!";
  const WELL_STANDS = "The Village Well stands.";
  const NOT_ENOUGH_MANA = "Not enough mana yet.";
  ```

  And append these two suites at the end of the file:

  ```ts
  describe("SPEECH_ORDER", () => {
    it("is the closed list of speech kinds, in written priority order", () => {
      expect(SPEECH_ORDER).toEqual(["ceremony", "toast", "notice"]);
    });
  });

  describe("pickSpeech", () => {
    it("returns nothing when every field is empty", () => {
      expect(pickSpeech(QUIET)).toBeNull();
    });

    it("returns one message, and each kind takes the lane in SPEECH_ORDER as the one above it clears", () => {
      const clear: Record<SpeechKind, Partial<MessageInput>> = {
        ceremony: { ceremonyNotice: null },
        toast: { toast: null },
        notice: { notice: null },
      };
      let live = input({ ceremonyNotice: HAIL, toast: WELL_STANDS, notice: NOT_ENOUGH_MANA });
      for (const kind of SPEECH_ORDER) {
        expect(pickSpeech(live)?.kind).toBe(kind);
        live = { ...live, ...clear[kind] };
      }
      expect(pickSpeech(live)).toBeNull();
    });

    it("does not let the one-minute banner suppress a toast — the lanes are independent", () => {
      const live = input({ lastMinute: true, toast: WELL_STANDS });
      expect(pickProblem(live)?.kind).toBe("lastMinute");
      expect(pickSpeech(live)).toEqual({ kind: "toast", text: WELL_STANDS, tone: "cheer" });
    });

    it("gives the ceremony the lane without destroying a spell notice fired beneath it", () => {
      const live = input({ ceremonyNotice: HAIL, notice: NOT_ENOUGH_MANA });
      expect(pickSpeech(live)).toEqual({ kind: "ceremony", text: HAIL, tone: "stage" });
      expect(live.notice).toBe(NOT_ENOUGH_MANA);
      expect(pickSpeech({ ...live, ceremonyNotice: null })).toEqual({ kind: "notice", text: NOT_ENOUGH_MANA, tone: "plain" });
    });

    it("turns a cheer plain under calm and leaves the other two tones alone", () => {
      expect(pickSpeech(input({ toast: WELL_STANDS }))?.tone).toBe("cheer");
      expect(pickSpeech(input({ toast: WELL_STANDS, calm: true }))?.tone).toBe("plain");
      expect(pickSpeech(input({ ceremonyNotice: HAIL, calm: true }))?.tone).toBe("stage");
      expect(pickSpeech(input({ notice: NOT_ENOUGH_MANA, calm: true }))?.tone).toBe("plain");
    });

    it("treats an empty string as no message, not as a blank pill", () => {
      expect(pickSpeech(input({ toast: "" }))).toBeNull();
    });
  });
  ```

- [ ] **Step 7: Run it and watch the speech suites fail.**

  ```
  npx vitest run src/lib/realm/messages.test.ts
  ```
  Expected: the file fails to collect with `SyntaxError: The requested module './messages' does not provide an export named 'pickSpeech'`. (If the transform resolves the missing exports to `undefined` instead of throwing, the run reports the eight existing assertions still passing and the seven new ones failing with `TypeError: pickSpeech is not a function` plus `expected undefined to deeply equal [ 'ceremony', 'toast', 'notice' ]`.) Either way `Test Files  1 failed`.

- [ ] **Step 8: Write `SPEECH_ORDER` and `pickSpeech`.**

  Append to `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/messages.ts`, after `pickProblem`:

  ```ts
  export const SPEECH_ORDER: SpeechKind[] = ["ceremony", "toast", "notice"];

  /** Where each spoken line comes from; `null` means that kind is not live. */
  const SPEECH_TEXT: Record<SpeechKind, (input: MessageInput) => string | null> = {
    ceremony: (i) => i.ceremonyNotice || null,
    toast: (i) => i.toast || null,
    notice: (i) => i.notice || null,
  };

  /**
   * The lane's voice. A toast cheers, unless the hero asked for less — which
   * preserves the existing `.realm-hud-toast--plain` behaviour exactly.
   */
  const SPEECH_TONE: Record<SpeechKind, (input: MessageInput) => RealmSpeech["tone"]> = {
    ceremony: () => "stage",
    toast: (i) => (i.calm ? "plain" : "cheer"),
    notice: () => "plain",
  };

  /** The bottom-centre lane: at most one thing the game says, highest priority first. */
  export function pickSpeech(input: MessageInput): RealmSpeech | null {
    for (const kind of SPEECH_ORDER) {
      const text = SPEECH_TEXT[kind](input);
      if (text) return { kind, text, tone: SPEECH_TONE[kind](input) };
    }
    return null;
  }
  ```

- [ ] **Step 9: Run it and watch the whole file pass.**

  ```
  npx vitest run src/lib/realm/messages.test.ts
  ```
  Expected: `Test Files  1 passed (1)` and `Tests  15 passed (15)` — the eight from step 1 plus the seven appended in step 6.

- [ ] **Step 10: Gate on typecheck, lint and the full suite.**

  ```
  npx tsc --noEmit
  ```
  Expected: no output, exit 0.
  ```
  npx eslint src/lib/realm/messages.ts src/lib/realm/messages.test.ts
  ```
  Expected: no output, exit 0.
  ```
  npm test
  ```
  Expected: every test file passes. This task adds one file and imports nothing, so no existing suite can change; if one did, the cause is elsewhere and must be found before committing.

- [ ] **Step 11: Commit the speech lane.**

  ```
  git add src/lib/realm/messages.ts src/lib/realm/messages.test.ts
  ```
  ```
  git commit -m "feat(realm): give the speech lane its own priority so a last-minute banner cannot eat a toast" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 7: The clock leak: minutesToSettle and flushPending on unmount

**Files:**
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/play-clock.ts` (append after `startClock`, which ends at line 14)
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/play-clock.test.ts` (extend: new `describe("minutesToSettle")` after the `gateCopy` block, which ends at line 104)
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/use-play-clock.ts` (line 5 import; `settle` at lines 73-101; the interval's call site at line 121; `flushPending` at lines 126-130)
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/use-play-clock.test.ts` (extend: two new cases after the existing `flushPending` case, which ends at line 86)
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.tsx` (insert the unmount cleanup effect immediately after the `usePlayClock` call at line 237)
- Modify: `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.test.tsx` (the `use-play-clock` mock wrapper at lines 41-56; a new case after the "retries loading the sprite after an error" case, which ends at line 147)
- Test: `src/lib/realm/play-clock.test.ts`, `src/components/realm/use-play-clock.test.ts`, `src/components/realm/realm-shell.test.tsx`

**Interfaces:**

*Consumes (from earlier tasks):* nothing. This task is independent of tasks 1-6 and touches no file they touch.

*Produces (later tasks and slices rely on these exact names):*
```ts
// src/lib/realm/play-clock.ts
export const ROUND_UP_SECONDS = 30;
export function minutesToSettle(clock: PlayClock, pending: number): number;
```
```ts
// src/components/realm/use-play-clock.ts — internal shape change, same public surface
settle(minutes: number): Promise<void>          // was settle(): Promise<void>
flushPending(): Promise<void>                    // now settles the sub-minute remainder too
```
```tsx
// src/components/realm/realm-shell.tsx — inside RealmOpen, immediately after the usePlayClock call
useEffect(() => () => { void clock.flushPending(); }, [clock.flushPending]);
```
`usePlayClock`'s returned object is unchanged (`{ minutesRemaining, warning, error, clearError, flushPending, source }`), so task 9's `onAction` routing for `spriteError` (`sprite retry + clock.clearError + flushPending`) needs no adjustment.

---

- [ ] **Step 1: Write the failing test for `minutesToSettle`.**

  Open `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/play-clock.test.ts`. Replace the import on line 1-2 with:

  ```ts
  import { describe, it, expect } from "vitest";
  import { startClock, tickClock, applyAccess, gateCopy, minutesToSettle, ROUND_UP_SECONDS, type PlayClock } from "./play-clock";
  ```

  Then append this block at the end of the file, after the closing `});` of `describe("gateCopy", …)` on line 104:

  ```ts
  describe("minutesToSettle", () => {
    const at = (secondsThisMinute: number, minutesRemaining = 10, closed = false): PlayClock => ({
      minutesRemaining,
      secondsThisMinute,
      warned: false,
      closed,
    });

    it("charges nothing once the gate has closed", () => {
      expect(minutesToSettle(at(59, 10, true), 3)).toBe(0);
      expect(minutesToSettle(at(0, 0, true), 0)).toBe(0);
    });

    it("rounds the minute in progress half-up", () => {
      expect(ROUND_UP_SECONDS).toBe(30);
      expect(minutesToSettle(at(0), 0)).toBe(0);
      expect(minutesToSettle(at(29), 0)).toBe(0);
      expect(minutesToSettle(at(ROUND_UP_SECONDS), 0)).toBe(1);
      expect(minutesToSettle(at(45), 0)).toBe(1);
      expect(minutesToSettle(at(59), 0)).toBe(1);
    });

    it("adds the records still pending", () => {
      expect(minutesToSettle(at(5), 2)).toBe(2);
      expect(minutesToSettle(at(45), 2)).toBe(3);
    });

    it("never charges more minutes than the hero has left", () => {
      expect(minutesToSettle(at(45, 0), 0)).toBe(0);
      expect(minutesToSettle(at(45, 1), 0)).toBe(1);
      expect(minutesToSettle(at(45, 2), 4)).toBe(2);
    });

    it("clamps to the ledger's 30-minute ceiling", () => {
      expect(minutesToSettle(at(45, 60), 40)).toBe(30);
      expect(minutesToSettle(at(5, 60), 30)).toBe(30);
    });
  });
  ```

- [ ] **Step 2: Run it and watch it fail.**

  ```
  npx vitest run src/lib/realm/play-clock.test.ts
  ```

  Expect the file to fail to load, because `play-clock.ts` has no such export yet: `SyntaxError: [vite] The requested module '/src/lib/realm/play-clock.ts' does not provide an export named 'minutesToSettle'` (Vitest may surface this instead as `TypeError: minutesToSettle is not a function` on the first assertion). Either way `src/lib/realm/play-clock.test.ts` is red and the pre-existing `tickClock` / `applyAccess` / `gateCopy` suites do not run.

- [ ] **Step 3: Write `ROUND_UP_SECONDS` and `minutesToSettle`.**

  In `/home/kylee/projects/kingdoms-and-crowns/src/lib/realm/play-clock.ts`, insert this immediately after the closing brace of `startClock` on line 14 (i.e. between line 14 and the `/**` of `tickClock`'s doc comment on line 16):

  ```ts
  /** At or above this many seconds into the current minute, the minute is charged. */
  export const ROUND_UP_SECONDS = 30;

  /**
   * Whole minutes to write when a visit ends: the records still pending, plus
   * the minute in progress rounded half-up. `flushPending` alone only rescues
   * whole minutes that were mid-flight or had failed to record — normally zero.
   * The free play came from `secondsThisMinute`, 0-59 seconds of real, visible,
   * already-played time thrown away on every unmount; a child who bounced out
   * every 50 seconds played forever for nothing.
   *
   * A child who leaves at 5 seconds is charged nothing; one who leaves at 50 is
   * charged the minute they played, so the leak is capped at 29 seconds a visit
   * instead of 59 and cannot be farmed. Clamped to the minutes the hero actually
   * has left and to the ledger's 30-minute ceiling, so `recordRealmPlay`'s
   * `assertMinutes(minutes, 30)` is never made to throw. A 0 is simply not sent:
   * `recordRealmPlay` rejects `minutes < 1`.
   */
  export function minutesToSettle(clock: PlayClock, pending: number): number {
    if (clock.closed) return 0; // the gate already charged and shut
    const owed = pending + (clock.secondsThisMinute >= ROUND_UP_SECONDS ? 1 : 0);
    return Math.max(0, Math.min(owed, clock.minutesRemaining, 30));
  }
  ```

- [ ] **Step 4: Run it and watch it pass.**

  ```
  npx vitest run src/lib/realm/play-clock.test.ts
  ```

  Expect `Test Files 1 passed (1)` and `Tests 15 passed (15)` — the ten pre-existing cases (seven in `describe("tickClock")`, one in `applyAccess`, two in `gateCopy`) plus the five new `minutesToSettle` cases.

- [ ] **Step 5: Commit the pure rule.**

  ```
  git branch --show-current
  ```
  Confirm it prints `realm-foundations` before going on (several sessions share this checkout).
  ```
  git add src/lib/realm/play-clock.ts src/lib/realm/play-clock.test.ts
  ```
  ```
  git commit -m "feat(realm): charge the part-minute a visit actually played" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

- [ ] **Step 6: Write the failing test for `flushPending` settling the remainder.**

  In `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/use-play-clock.test.ts`, insert these two cases immediately after the closing `});` of the existing `"flushPending retries a failed minute immediately, without waiting for the next boundary"` case on line 86, before the `"counts nothing while paused…"` case on line 88:

  ```ts
    it("flushPending settles the minute in progress, rounded half-up", async () => {
      recordRealmPlay.mockResolvedValue(undefined);
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 4, source: "earned" });

      const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

      // 45 visible seconds: no 60-second boundary crossed, so nothing has been
      // recorded and there is no pending whole minute to rescue.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });
      expect(recordRealmPlay).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.flushPending();
      });
      expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);
    });

    it("flushPending charges nothing for a visit under half a minute", async () => {
      recordRealmPlay.mockResolvedValue(undefined);
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 4, source: "earned" });

      const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_000);
      });
      await act(async () => {
        await result.current.flushPending();
      });
      expect(recordRealmPlay).not.toHaveBeenCalled();
    });
  ```

- [ ] **Step 7: Run it and watch it fail.**

  ```
  npx vitest run src/components/realm/use-play-clock.test.ts
  ```

  Expect exactly one failure, in `flushPending settles the minute in progress, rounded half-up`:

  ```
  AssertionError: expected "recordRealmPlay" to be called with arguments: [ 'c1', Any<String>, 1 ]
  Received: Number of calls: 0
  ```

  because today `flushPending` early-returns on `pendingRef.current === 0`. The second new case (`charges nothing for a visit under half a minute`) passes already — it is the guard that the fix must not over-charge.

- [ ] **Step 8: Teach `settle` what to send and `flushPending` to compute it.**

  In `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/use-play-clock.ts`:

  (a) Replace the import on line 5:

  ```ts
  import { applyAccess, minutesToSettle, startClock, tickClock, type PlayClock } from "@/lib/realm/play-clock";
  ```

  (b) Replace the whole `settle` callback (lines 73-101, from `const settle = useCallback(` through `[childId]\n  );`) with:

  ```ts
    /**
     * Writes `minutes` to the ledger and refreshes access. The caller decides the
     * number: the interval passes the whole minutes it has just banked, and
     * `flushPending` passes `minutesToSettle(…)`, which adds the rounded-up
     * remainder of the minute in progress. Nothing is sent for 0 — `recordRealmPlay`
     * rejects `minutes < 1`.
     */
    const settle = useCallback(
      async (minutes: number) => {
        const sent = Math.min(minutes, 30);
        if (sent < 1) return;
        recordingRef.current = true;
        try {
          const date = localDateOf(new Date());
          await recordRealmPlay(childId, date, sent);
          // Only the minutes actually sent are cleared: more may have accrued
          // locally while this round-trip was in flight, and those stay
          // pending for the next record. A rounded-up remainder is not a
          // pending record, so this floors at 0 rather than going negative.
          pendingRef.current = Math.max(0, pendingRef.current - sent);
          const access = await getRealmAccess(childId, date, currentTimeOfDay());
          const applied = applyAccess(clockRef.current, access);
          clockRef.current = applied.clock;
          setClock(applied.clock);
          setError("");
          if (access.allowed) setSource(access.source);
          if (applied.event === "warn") setWarning(true);
          if (applied.clock.minutesRemaining > 1) setWarning(false);
          if (applied.event === "close") closeRef.current(access.allowed ? "no_minutes" : access.reason);
        } catch (err) {
          // pendingRef is left as-is: the failed minutes carry into the next record.
          setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
        } finally {
          recordingRef.current = false;
        }
      },
      [childId]
    );
  ```

  (c) Replace the interval's call site — the line reading `      void settle();` (line 121 today) — with:

  ```ts
        void settle(pendingRef.current);
  ```

  (d) Replace the whole `flushPending` callback (lines 126-130) with:

  ```ts
    /**
     * Writes what this visit owes right now: the pending whole minutes plus the
     * minute in progress, rounded half-up. Called by the HUD's Try-again button
     * and — above all — by RealmOpen's unmount cleanup, so every exit path
     * charges the minute the child actually played.
     */
    const flushPending = useCallback(async () => {
      if (recordingRef.current) return;
      await settle(minutesToSettle(clockRef.current, pendingRef.current));
    }, [settle]);
  ```

- [ ] **Step 9: Run it and watch it pass.**

  ```
  npx vitest run src/lib/realm/play-clock.test.ts src/components/realm/use-play-clock.test.ts
  ```

  Expect `Test Files 2 passed (2)` and `Tests 22 passed (22)` — 15 in `play-clock.test.ts`, 7 in `use-play-clock.test.ts` (the five pre-existing cases plus the two new ones). In particular `carries a failed minute into the next record` must still assert `recordRealmPlay` was called with `2` on its second call: the periodic path still sends the whole pending count, unclamped.

- [ ] **Step 10: Commit the hook change.**

  ```
  git branch --show-current
  ```
  Confirm `realm-foundations`.
  ```
  git add src/components/realm/use-play-clock.ts src/components/realm/use-play-clock.test.ts
  ```
  ```
  git commit -m "fix(realm): settle the part-minute instead of dropping it on flush" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

- [ ] **Step 11: Write the failing test for the unmount flush.**

  In `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.test.tsx`:

  (a) Replace the `use-play-clock` mock (lines 37-56, the comment block through the closing `});`) with this. The wrapper must be memoised: `RealmOpen`'s cleanup keys on `clock.flushPending`, and a fresh arrow every render would re-run that cleanup on every render instead of once, on the real unmount.

  ```tsx
  // The real hook, with `flushPending` wrapped so tests can assert it was
  // called on retry and on unmount without duplicating use-play-clock.test.ts's
  // own coverage of what flushPending actually does. The wrapper is memoised on
  // the real hook's own stable `flushPending`, because RealmOpen's unmount
  // cleanup keys on that identity: a fresh arrow every render would fire the
  // cleanup on every render instead of once, on the real unmount.
  let flushPendingCalls = 0;
  vi.mock("./use-play-clock", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./use-play-clock")>();
    const React = await import("react");
    return {
      ...actual,
      usePlayClock: (...args: Parameters<typeof actual.usePlayClock>) => {
        const hook = actual.usePlayClock(...args);
        const inner = hook.flushPending;
        const flushPending = React.useCallback(() => {
          flushPendingCalls += 1;
          return inner();
        }, [inner]);
        return { ...hook, flushPending };
      },
    };
  });
  ```

  (b) Insert this case immediately after the closing `});` of the `"retries loading the sprite after an error"` case (line 147 today), before the `"carries the reading font attribute onto the realm root"` case:

  ```tsx
    it("charges the minute in progress when the Realm unmounts", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      const { unmount } = render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      // Not on every render — only on the real unmount.
      expect(flushPendingCalls).toBe(0);
      unmount();
      expect(flushPendingCalls).toBe(1);
    });
  ```

- [ ] **Step 12: Run it and watch it fail.**

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expect exactly one failure, in `charges the minute in progress when the Realm unmounts`:

  ```
  AssertionError: expected +0 to be 1 // Object.is equality
  ```

  at the `expect(flushPendingCalls).toBe(1)` after `unmount()` — nothing runs the flush on unmount today. The `expect(flushPendingCalls).toBe(0)` before it passes, and `retries loading the sprite after an error` still passes with its `toBe(1)`.

- [ ] **Step 13: Hang the flush off `RealmOpen`'s unmount.**

  In `/home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.tsx`, insert these lines immediately after line 237 (`const clock = usePlayClock({ … });`) and before line 238 (`const recessActive = …`):

  ```tsx
    // Every exit path — the `Leave the Realm` link, a router navigation, the gate
    // closing, the clock running out, a browser back — unmounts this component, so
    // hanging the flush off its cleanup is the one place that cannot be bypassed:
    // no later slice can add an exit that skips it. `flushPending` is a
    // `useCallback` on `[settle]` and `settle` on `[childId]`, so the identity is
    // stable and this runs exactly once, on the real unmount. `settle` catches its
    // own errors and only sets state, and a set on an unmounted component is a
    // no-op in React 19; the `void` keeps the floating promise lint-clean.
    useEffect(() => () => { void clock.flushPending(); }, [clock.flushPending]);
  ```

  `useEffect` is already imported on line 5 of this file; no import change is needed.

- [ ] **Step 14: Run it and watch it pass.**

  ```
  npx vitest run src/lib/realm/play-clock.test.ts src/components/realm/use-play-clock.test.ts src/components/realm/realm-shell.test.tsx
  ```

  Expect `Test Files 3 passed (3)` with no failures: the new unmount case is green, `retries loading the sprite after an error` still ends on `expect(flushPendingCalls).toBe(1)`, and `previews for a parent without recording anything` still asserts `recordRealmPlay` was never called (a parent's clock is `enabled: false`, its `secondsThisMinute` is 0, so the unmount flush computes 0 and sends nothing).

- [ ] **Step 15: Typecheck, lint and run the whole suite.**

  ```
  npx tsc --noEmit
  ```
  Expect no output (`settle`'s new required `minutes` argument is satisfied at both call sites).
  ```
  npx eslint src/lib/realm/play-clock.ts src/lib/realm/play-clock.test.ts src/components/realm/use-play-clock.ts src/components/realm/use-play-clock.test.ts src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expect no output — in particular no `react-hooks/exhaustive-deps` warning on the new effect (its only dependency is `clock.flushPending`, which it calls). The `void` in front of `clock.flushPending()` is house style, not a lint requirement: `eslint.config.mjs` composes only `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, neither of which enables the type-aware rules (`no-floating-promises`, `no-misused-promises`). Write the `void` anyway — it says the promise is deliberately unawaited.
  ```
  npm test
  ```
  Expect every file to pass. If anything outside these six files fails, it is not this task's change — stop and report it rather than editing another file.

- [ ] **Step 16: Commit the unmount cleanup.**

  ```
  git branch --show-current
  ```
  Confirm `realm-foundations`.
  ```
  git add src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  ```
  ```
  git commit -m "fix(realm): charge the clock on every way out of the Realm" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 8: realm_settings.depth_override, setRealmDepth, and the bundle's depth

The stored half of the complexity axis. Task 1 wrote the pure contract and nothing imported it; this task gives it a column, a tolerant read, a narrow hero-or-parent write, and a place on `RealmBundle` so slices 3, 9, 12 and 13 read one server-computed answer instead of recomputing it from two fields and disagreeing.

**Files:**
- Create: `src/lib/db/migrations/0026_<drizzle-name>.sql` — generated by `npm run db:generate`, never hand-written. The same command also writes `src/lib/db/migrations/meta/0026_snapshot.json` and appends to `src/lib/db/migrations/meta/_journal.json`. The real filename is read back in Step 8 and recorded in the commit message in Step 11.
- Modify: `src/lib/db/schema.ts` — insert three lines after line 695 (`starterSpellAt`), inside `realmSettings`.
- Modify: `src/lib/utils/realm-settings.ts` — line 1 (the import), lines 5-12 (`RealmSettings`), lines 14-21 (`DEFAULT_REALM_SETTINGS`), lines 32-42 (`settingsFromRow`), lines 45-76 (`validateRealmSettingsPatch`).
- Modify: `src/lib/actions/realm-settings.ts` — line 9 (the import) and a new function appended after line 44 (end of file).
- Modify: `src/lib/actions/realm.ts` — line 16 (the import), lines 18-33 (`RealmBundle`), line 91 (a `helpSeen` const) and lines 93-107 (the returned object).
- Test: `src/lib/utils/realm-settings.test.ts` — a new `describe` block appended after line 31.
- Test: `src/components/realm/realm-shell.test.tsx` — line 95, the shared `bundle` fixture, which is typed by `RealmBundle` through `RealmShell`'s prop and stops compiling the moment the bundle gains two required fields.

**Interfaces:**

Consumes (task 1, `src/lib/realm/depth.ts` — pure, no `three`, safe to import from a server action and from `src/lib/utils`):
```ts
type RealmDepth = "simple" | "full"
type DepthOverride = "auto" | "simple" | "full"
const DEFAULT_DEPTH_OVERRIDE: DepthOverride            // "auto"
function isDepthOverride(value: unknown): value is DepthOverride
function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth
```

Produces:
```
realm_settings.depth_override                          // text, enum auto|simple|full, NOT NULL DEFAULT 'auto'
RealmSettings.depthOverride: DepthOverride             // src/lib/utils/realm-settings.ts
DEFAULT_REALM_SETTINGS.depthOverride === "auto"
settingsFromRow()                                      // coerces anything that is not one of the three to "auto"
validateRealmSettingsPatch()                           // case "depthOverride" → "Choose automatic, simple, or everything."
async function setRealmDepth(childId: string, override: DepthOverride): Promise<void>   // src/lib/actions/realm-settings.ts
RealmBundle.depthOverride: DepthOverride               // src/lib/actions/realm.ts
RealmBundle.depth: RealmDepth                          // realmDepth({ tutorialComplete: helpSeen, override: depthOverride })
```
Task 10 reads `bundle.depth` in `RealmOpen`'s `useState` initialiser; task 18 calls `setRealmDepth`; task 19 sends `{ depthOverride }` through `updateRealmSettings`.

---

- [ ] **Step 1: Write the failing depth-override tests for the settings reader and validator.**

  Append this block to the end of `src/lib/utils/realm-settings.test.ts` (after line 31). The existing imports on line 2 already bring in all three symbols; add nothing to them.

  ```ts

  describe("depthOverride", () => {
    it("defaults to automatic", () => {
      expect(DEFAULT_REALM_SETTINGS.depthOverride).toBe("auto");
    });

    it("passes the three stored values through and coerces anything else to auto", () => {
      expect(settingsFromRow({ depthOverride: "auto" }).depthOverride).toBe("auto");
      expect(settingsFromRow({ depthOverride: "simple" }).depthOverride).toBe("simple");
      expect(settingsFromRow({ depthOverride: "full" }).depthOverride).toBe("full");
      // A hand-edited database, a future enum change, a column that does not exist yet:
      // the Realm never crashes on a bad enum, it falls back to automatic.
      expect(settingsFromRow({ depthOverride: "Simple" }).depthOverride).toBe("auto");
      expect(settingsFromRow({ depthOverride: null }).depthOverride).toBe("auto");
      expect(settingsFromRow({ depthOverride: 7 }).depthOverride).toBe("auto");
      expect(settingsFromRow({ depthOverride: undefined }).depthOverride).toBe("auto");
      expect(settingsFromRow(null).depthOverride).toBe("auto");
    });

    it("accepts the three values in a patch and refuses anything else", () => {
      expect(validateRealmSettingsPatch({ depthOverride: "auto" })).toEqual({ depthOverride: "auto" });
      expect(validateRealmSettingsPatch({ depthOverride: "simple" })).toEqual({ depthOverride: "simple" });
      expect(validateRealmSettingsPatch({ depthOverride: "full" })).toEqual({ depthOverride: "full" });
      expect(() => validateRealmSettingsPatch({ depthOverride: "everything" })).toThrow("Choose automatic, simple, or everything.");
      expect(() => validateRealmSettingsPatch({ depthOverride: null })).toThrow("Choose automatic, simple, or everything.");
    });
  });
  ```

- [ ] **Step 2: Run the test and watch all three cases fail.**

  ```
  npx vitest run src/lib/utils/realm-settings.test.ts
  ```

  Expect `Tests  3 failed | 4 passed (7)`, with:
  - `defaults to automatic` → `AssertionError: expected undefined to be 'auto'`
  - `passes the three stored values through…` → `AssertionError: expected undefined to be 'auto'`
  - `accepts the three values in a patch…` → `Error: Unknown Realm setting: depthOverride` (today's `default:` branch rejects the key outright)

- [ ] **Step 3: Add `depthOverride` to the settings type, the default, the reader and the validator.**

  Four edits in `src/lib/utils/realm-settings.ts`.

  (a) Replace line 1 with the two imports:
  ```ts
  import type { RealmAccessMode } from "./realm-access";
  import { DEFAULT_DEPTH_OVERRIDE, isDepthOverride, type DepthOverride } from "@/lib/realm/depth";
  ```

  (b) Add the field to `RealmSettings` (lines 5-12), after `toneMode`:
  ```ts
  export type RealmSettings = {
    enabled: boolean;
    accessMode: RealmAccessMode;
    earnedMinutesPerQuest: number;
    offHoursEnabled: boolean;
    dailyCapMinutes: number;
    toneMode: ToneMode;
    /** How much the Realm shows. A hero may set their own — it changes presentation, never access. */
    depthOverride: DepthOverride;
  };
  ```

  (c) Add the default (lines 14-21), after `toneMode: "gentle",`:
  ```ts
  export const DEFAULT_REALM_SETTINGS: RealmSettings = {
    enabled: true,
    accessMode: "earned",
    earnedMinutesPerQuest: 5,
    offHoursEnabled: false,
    dailyCapMinutes: 30,
    toneMode: "gentle",
    depthOverride: DEFAULT_DEPTH_OVERRIDE,
  };
  ```

  (d) Add the tolerant read to `settingsFromRow` — one line after the `toneMode:` line inside the returned object (line 40):
  ```ts
      depthOverride: isDepthOverride(row.depthOverride) ? row.depthOverride : DEFAULT_REALM_SETTINGS.depthOverride,
  ```

  (e) Add the validator case in `validateRealmSettingsPatch`, immediately after the `case "toneMode":` block (after line 62, before `case "earnedMinutesPerQuest":`):
  ```ts
        case "depthOverride":
          if (!isDepthOverride(v)) throw new Error("Choose automatic, simple, or everything.");
          out.depthOverride = v;
          break;
  ```

- [ ] **Step 4: Run the test and watch it pass.**

  ```
  npx vitest run src/lib/utils/realm-settings.test.ts
  ```

  Expect `Tests  7 passed (7)`. Then confirm nothing else that reads a settings object broke:

  ```
  npx vitest run src/app/\(app\)/settings/realm-settings-panel.test.tsx
  ```

  Expect all passing — the panel's fixtures spread `DEFAULT_REALM_SETTINGS`, so the new field arrives for free.

- [ ] **Step 5: Confirm the branch, then commit the reader and validator.**

  ```
  git branch --show-current
  ```
  Expect `realm-foundations`. (Several sessions share this checkout; if it prints anything else, stop and fix the branch before committing.)

  ```
  git add src/lib/utils/realm-settings.ts src/lib/utils/realm-settings.test.ts
  ```
  ```
  git commit -m "feat(realm): carry a depth override in Realm settings, coerced on read" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  This commit is safe to land before the column exists: `loadRealmSettings` selects the row, `row.depthOverride` is `undefined` until the migration runs, and `settingsFromRow` reads that as `"auto"`.

- [ ] **Step 6: Add the column to the Drizzle schema.**

  In `src/lib/db/schema.ts`, inside `realmSettings`, insert after line 695 (`starterSpellAt: integer("starter_spell_at", { mode: "timestamp" }),`) and before `createdAt`:

  ```ts
      // Slice 1 of the presentation overhaul: how much the Realm shows.
      // 'auto' follows the tutorial; a hero or a grown-up can pin it either way.
      depthOverride: text("depth_override", { enum: ["auto", "simple", "full"] }).notNull().default("auto"),
  ```

  `text` is already imported at the top of the file and used by `toneMode` four lines above; add no import.

- [ ] **Step 7: Generate the migration.**

  ```
  npm run db:generate
  ```

  Expect drizzle-kit to print `1 tables` / `You're about to add depth_override column to realm_settings table with 'auto' default` style output and to finish with `[✓] Your SQL migration file ➜ src/lib/db/migrations/0026_<name>.sql 🚀`. It must **not** prompt: a new column with a default and no renames is unambiguous. If it does prompt with a rename question, answer with the `+ depth_override  create column` option.

  Note: a `PostToolUse` hook in `.claude/settings.local.json` silently runs `npm run db:migrate` after any command matching `db:generate`. That is exactly why Step 8 and Step 9 exist — the hook's output is discarded, so nothing it did is trusted.

- [ ] **Step 8: Read back the generated filename and SQL.**

  ```
  ls src/lib/db/migrations | tail -3
  ```
  Expect `0025_worried_tyrannus.sql`, `0026_<name>.sql`, `meta`.

  ```
  cat src/lib/db/migrations/0026_*.sql
  ```
  Expect exactly one statement, matching §4 character for character:
  ```sql
  ALTER TABLE `realm_settings` ADD `depth_override` text DEFAULT 'auto' NOT NULL;
  ```
  If it differs (a table rebuild, a second statement, a missing `NOT NULL`), stop: the schema edit in Step 6 is wrong, not the SQL. Delete the generated file plus its `meta/0026_snapshot.json`, revert the `_journal.json` entry, fix Step 6 and regenerate.

  ```
  tail -8 src/lib/db/migrations/meta/_journal.json
  ```
  Expect a new `"idx": 26` entry whose `"tag"` is the filename without `.sql`.

- [ ] **Step 9: Apply the migration explicitly.**

  ```
  npm run db:migrate
  ```

  Expect either `[✓] migrations applied successfully!` or — if the generate hook already applied it — a clean no-op finish. Either is fine; Step 10 is what decides whether the column is really there.

- [ ] **Step 10: Check the column and the backfill in the database, do not trust the hook.**

  `sqlite3` is not installed on this machine (`which sqlite3` finds nothing), so read the database through `@libsql/client`, which is already a dependency. Run this from the repo root — the URL is relative:

  ```
  node -e "const{createClient}=require('@libsql/client');const db=createClient({url:'file:./local.db'});(async()=>{const i=await db.execute('PRAGMA table_info(realm_settings)');console.log(i.rows.filter(r=>r.name==='depth_override').map(r=>[r.name,r.type,'notnull='+r.notnull,'dflt_value='+r.dflt_value].join(' | ')).join('\n')||'MISSING');const s=await db.execute('SELECT COUNT(*) AS total, SUM(depth_override IS NULL) AS nulls FROM realm_settings');console.log('rows/nulls:',JSON.stringify(s.rows[0]));const f=await db.execute('SELECT depth_override FROM realm_settings LIMIT 1');console.log('first row:',JSON.stringify(f.rows[0]??null));})()"
  ```

  Expect, exactly:
  ```
  depth_override | text | notnull=1 | dflt_value='auto'
  rows/nulls: {"total":<n>,"nulls":0}
  first row: {"depth_override":"auto"}
  ```

  Three things are being proved, and all three are required by §4: the column is `text`, it is `NOT NULL` with the literal default `'auto'`, and **every pre-existing row was backfilled** — `nulls` is 0 and a real row reads `'auto'` rather than null. If `first row: null`, the local database simply has no `realm_settings` row yet; in that case open the Realm once at `http://localhost:3100/realm` (which calls `loadRealmSettings` and creates the row) and re-run the command.

  If the command fails with `ERR_REQUIRE_ESM`, use the module form instead:
  ```
  node --input-type=module -e "import {createClient} from '@libsql/client';const db=createClient({url:'file:./local.db'});const i=await db.execute('PRAGMA table_info(realm_settings)');console.log(i.rows.filter(r=>r.name==='depth_override').map(r=>[r.name,r.type,'notnull='+r.notnull,'dflt_value='+r.dflt_value].join(' | ')).join('\n')||'MISSING');const f=await db.execute('SELECT depth_override FROM realm_settings LIMIT 1');console.log('first row:',JSON.stringify(f.rows[0]??null));"
  ```

- [ ] **Step 11: Commit the schema and the migration, recording the real filename.**

  ```
  git add src/lib/db/schema.ts src/lib/db/migrations
  ```
  ```
  git commit -m "feat(realm): add realm_settings.depth_override ($(ls src/lib/db/migrations | grep '^0026' | sed 's/\.sql$//'))" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  The command substitution puts drizzle-kit's real tag in the subject line, e.g. `feat(realm): add realm_settings.depth_override (0026_tense_lila_cheney)`. Confirm it landed:
  ```
  git log -1 --format=%s
  ```

- [ ] **Step 12: Add `setRealmDepth`, the narrow hero-or-parent write.**

  In `src/lib/actions/realm-settings.ts`, replace line 9 with the existing import plus the depth import:

  ```ts
  import { validateRealmSettingsPatch, type RealmSettings } from "@/lib/utils/realm-settings";
  import { isDepthOverride, type DepthOverride } from "@/lib/realm/depth";
  ```

  Then append to the end of the file (after line 44):

  ```ts

  /**
   * How much the Realm shows. A hero may set their own — it changes presentation, never access.
   * Deliberately NOT part of `updateRealmSettings`: this writes one validated column and cannot
   * touch `enabled`, `accessMode`, `dailyCapMinutes` or `toneMode`, which is the whole reason it
   * carries no `isChildActor` refusal. No `revalidatePath`: the Realm is a client tree and re-reads
   * its bundle on the next mount.
   */
  export async function setRealmDepth(childId: string, override: DepthOverride): Promise<void> {
    await requireChildAccess(childId, { write: true });
    if (!isDepthOverride(override)) throw new Error("Choose automatic, simple, or everything.");
    await loadRealmSettings(childId);
    const now = new Date();
    await db.update(schema.realmSettings).set({ depthOverride: override, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
  }
  ```

  `"use server"` allows only async function exports: this file gains one async function and a type-only import, and exports no type.

- [ ] **Step 13: Typecheck and lint the new action.**

  ```
  npx tsc --noEmit
  ```
  Expect no output (the `depthOverride` column now exists on the Drizzle table type, so `.set({ depthOverride: override })` compiles).

  ```
  npx eslint src/lib/actions/realm-settings.ts src/lib/db/schema.ts src/lib/utils/realm-settings.ts
  ```
  Expect no output.

- [ ] **Step 14: Commit the action.**

  ```
  git add src/lib/actions/realm-settings.ts
  ```
  ```
  git commit -m "feat(realm): add setRealmDepth, a hero-or-parent write of one column" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 15: Publish `depthOverride` and the computed `depth` on `RealmBundle`.**

  Three edits in `src/lib/actions/realm.ts`.

  (a) After line 16 (the `avatar-catalog` import), add:
  ```ts
  import { realmDepth, type DepthOverride, type RealmDepth } from "@/lib/realm/depth";
  ```

  (b) In the `RealmBundle` type (lines 18-33), replace the closing two lines — `helpSeen: boolean; // false until the hero has seen the how-to-play card` and `};` — with:
  ```ts
    helpSeen: boolean; // false until the hero has seen the how-to-play card
    /** The stored preference: 'auto' follows the tutorial, 'simple' and 'full' pin it. */
    depthOverride: DepthOverride;
    /**
     * Computed here, once, from `helpSeen` and `depthOverride`, so no client recomputes it from
     * two fields and gets a different answer. `RealmOpen` snapshots it for the visit.
     */
    depth: RealmDepth;
  };
  ```

  (c) In `getRealmBundle`, add one const after line 91 (`const wornCrown = …`):
  ```ts
    const helpSeen = flags.helpSeenAt !== null;
  ```
  and replace the last line of the returned object (line 106, `helpSeen: flags.helpSeenAt !== null,`) with:
  ```ts
      helpSeen,
      depthOverride: settings.depthOverride,
      depth: realmDepth({ tutorialComplete: helpSeen, override: settings.depthOverride }),
  ```

  `settings` is the `loadRealmSettings(childId)` result already in the `Promise.all` batch at line 64 and `flags` is already read at line 54 — **no new query**. A parent's preview gets the child's depth, not a parent default, because both inputs are the child's (§3.17).

- [ ] **Step 16: Give the shared shell fixture the two new fields.**

  `src/components/realm/realm-shell.test.tsx:95` builds the object literal that every `RealmShell` case renders, and it is checked against `RealmBundle` through the `bundle` prop, so it stops compiling the moment the type gains required fields. Replace the tail of line 95:

  ```
  wornCrown: null, helpSeen: true };
  ```
  with:
  ```
  wornCrown: null, helpSeen: true, depthOverride: "auto" as const, depth: "full" as const };
  ```

  `"full"` is the honest value for this fixture: it already sets `helpSeen: true`, and `realmDepth({ tutorialComplete: true, override: "auto" })` is `"full"`. Tasks 10, 11 and 18 build on this fixture and rely on it being full depth (numerals, three tracked objectives).

- [ ] **Step 17: Typecheck, lint and run the touched suites.**

  ```
  npx tsc --noEmit
  ```
  Expect no output.

  ```
  npx eslint src/lib/actions/realm.ts src/components/realm/realm-shell.test.tsx
  ```
  Expect no output.

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx src/lib/utils/realm-settings.test.ts
  ```
  Expect every test passing — this task changes no rendered output, so no shell assertion should move.

  ```
  npm run lint
  ```
  Expect exactly one error, the pre-existing one in `src/components/quest-template-list.tsx`, which this branch never touched. Any second error is a regression from this task.

- [ ] **Step 18: Commit the bundle change.**

  ```
  git add src/lib/actions/realm.ts src/components/realm/realm-shell.test.tsx
  ```
  ```
  git commit -m "feat(realm): publish depthOverride and the computed depth on RealmBundle" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 9: RealmMessages — two centred lanes, the state fix, and the three custom properties

**Files:**
- Create: `src/components/realm/realm-messages.tsx`, `src/components/realm/realm-messages.test.tsx`
- Modify: `src/components/realm/realm-hud.tsx:9-57` (props) and `:94-118` (the paragraph block), `src/components/realm/realm-shell.tsx:200` (arrowRef), `:475-479` (the message block), `:482-489` (the root's custom properties), `:517-546` (RealmHud's trimmed props + `<RealmMessages/>`), `src/app/globals.css:1702` (`.realm-root`), `:1711` (insert the lane block after it), `:1712-1714`, `:1716-1717` and `:1764-1765` (delete the dead HUD message rules — **`@keyframes realm-toast-in` at `:1715` is KEPT**, because the new `.realm-message--cheer` rule animates with it), `src/components/realm/realm-hud.test.tsx:1-181` (rewrite), `src/components/realm/realm-shell.test.tsx:126-127,198,321,325,381,385,487-489,499,468` (nine edits and three new cases)
- Test: `src/components/realm/realm-messages.test.tsx`, `src/components/realm/realm-hud.test.tsx`, `src/components/realm/realm-shell.test.tsx`

**Interfaces:**

*Consumes (task 6, `src/lib/realm/messages.ts`):*
```ts
type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string | null }
type RealmSpeech  = { kind: SpeechKind; text: string; tone: "stage" | "cheer" | "plain" }
type MessageInput = { spriteError: string; kingdomError: string; ceremonyError: string; lastMinute: boolean;
                      preview: string | null; ceremonyNotice: string | null; toast: string | null;
                      notice: string | null; calm: boolean }
function pickProblem(input: MessageInput): RealmProblem | null
function pickSpeech(input: MessageInput): RealmSpeech | null
```

*Produces:*
```tsx
// src/components/realm/realm-messages.tsx
export function RealmMessages(props: {
  problem: RealmProblem | null;
  speech: RealmSpeech | null;
  arrowRef: React.RefObject<HTMLDivElement | null>;
  onAction: () => void;
  hudScale: number;
}): React.JSX.Element
```
- `arrowRef` is created in `RealmOpen` (`useRef<HTMLDivElement>(null)`) and passed to `RealmMessages`; task 16 passes the same ref to `RealmScene`.
- CSS custom properties on `.realm-root`: `--realm-hud-scale` (`settings.hudScale`, 1 | 1.25), `--realm-bar-bottom` (`1.25rem`, or `9.5rem` when `settings.showStick`), `--realm-touch` (`56px`).
- CSS classes: `.realm-messages`, `.realm-message`, `.realm-message--problem`, `.realm-message--stage`, `.realm-message--cheer`, `.realm-message--plain`, `.realm-edge-arrow`.
- Test hooks: `data-testid="realm-messages"` (container, from the spec), plus `data-testid="realm-problem"` and `data-testid="realm-speech"` on the two always-mounted `<p>`s.
- `RealmHud` props removed here: `warning`, `error`, `onRetry`, `toast`, `calm`, `kingdomError`, `onKingdomRetry`, `notice`, `ceremonyError`, `onCeremonyRetry`. `preview` is retyped from `{ intro?: string; note: string | null } | null` to `boolean` (both preview `<p>`s are deleted, so neither field is read any more; the badge and the selector need truthiness only). Task 11 rewrites this component and must start from `preview: boolean`.
- `realm-shell.tsx` gains `previewText`, `messageInput`, `problem`, `speech`; `notice={ceremonyNoticeText ?? notice}` is gone.

---

- [ ] **Step 1: Write the failing test for `RealmMessages`.**

Create `src/components/realm/realm-messages.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmMessages } from "./realm-messages";

afterEach(cleanup);

const arrow = () => createRef<HTMLDivElement>();

describe("RealmMessages", () => {
  it("shows one problem and one speech message, each in its own lane", () => {
    render(
      <RealmMessages
        problem={{ kind: "kingdomError", text: "The villagers are resting. Try again.", actionLabel: "Wake the villagers" }}
        speech={{ kind: "toast", text: "The Village Well stands.", tone: "cheer" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    const problem = screen.getByTestId("realm-problem");
    const speech = screen.getByTestId("realm-speech");
    expect(problem).toHaveTextContent("The villagers are resting. Try again.");
    expect(problem).toHaveClass("realm-message", "realm-message--problem");
    expect(speech).toHaveTextContent("The Village Well stands.");
    expect(speech).toHaveClass("realm-message", "realm-message--cheer");
  });

  it("gives an error the alert role and a banner or a preview line the status role", () => {
    render(
      <RealmMessages
        problem={{ kind: "spriteError", text: "boom", actionLabel: "Try again" }}
        speech={null}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-problem")).toHaveAttribute("role", "alert");
    cleanup();
    render(
      <RealmMessages
        problem={{ kind: "lastMinute", text: "One minute left in the Realm today.", actionLabel: null }}
        speech={null}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-problem")).toHaveAttribute("role", "status");
    cleanup();
    render(
      <RealmMessages
        problem={{ kind: "preview", text: "You're looking at Lily's grounds.", actionLabel: null }}
        speech={null}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-problem")).toHaveAttribute("role", "status");
  });

  it("keeps both lanes mounted and empty when there is nothing to say", () => {
    render(<RealmMessages problem={null} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1} />);
    const problem = screen.getByTestId("realm-problem");
    const speech = screen.getByTestId("realm-speech");
    expect(problem.tagName).toBe("P");
    expect(speech.tagName).toBe("P");
    expect(problem).toBeEmptyDOMElement();
    expect(speech).toBeEmptyDOMElement();
    expect(problem).toHaveAttribute("aria-live", "polite");
    expect(speech).toHaveAttribute("aria-live", "polite");
  });

  it("lets pointers through the layer and takes them only in the action button", () => {
    render(
      <RealmMessages
        problem={{ kind: "kingdomError", text: "The villagers are resting. Try again.", actionLabel: "Wake the villagers" }}
        speech={null}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-messages").style.pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: "Wake the villagers" }).style.pointerEvents).toBe("auto");
  });

  it("calls onAction from the problem's action button, and renders no button without a label", () => {
    const onAction = vi.fn();
    render(
      <RealmMessages
        problem={{ kind: "ceremonyError", text: "The crown could not be recorded.", actionLabel: "Try again" }}
        speech={null}
        arrowRef={arrow()}
        onAction={onAction}
        hudScale={1}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    cleanup();
    render(
      <RealmMessages
        problem={{ kind: "lastMinute", text: "One minute left in the Realm today.", actionLabel: null }}
        speech={null}
        arrowRef={arrow()}
        onAction={onAction}
        hudScale={1}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("styles ceremony narration as the stage lane and a calm toast as the plain one", () => {
    render(
      <RealmMessages
        problem={null}
        speech={{ kind: "ceremony", text: "Hail, Lily, Crown of Spring!", tone: "stage" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-speech")).toHaveClass("realm-message--stage");
    cleanup();
    render(
      <RealmMessages
        problem={null}
        speech={{ kind: "toast", text: "The Village Well stands.", tone: "plain" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-speech")).toHaveClass("realm-message--plain");
  });

  it("hands the scene an edge-arrow node that is hidden and silent until the scene moves it", () => {
    const ref = arrow();
    render(<RealmMessages problem={null} speech={null} arrowRef={ref} onAction={() => {}} hudScale={1} />);
    const el = document.querySelector<HTMLDivElement>(".realm-edge-arrow")!;
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.hidden).toBe(true);
    expect(ref.current).toBe(el);
  });

  it("scales the lanes with the hero's HUD scale", () => {
    render(<RealmMessages problem={null} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1.25} />);
    expect(screen.getByTestId("realm-messages").style.fontSize).toBe("1.25em");
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

```
npx vitest run src/components/realm/realm-messages.test.tsx
```

Expected: the suite fails to collect — `Failed to resolve import "./realm-messages" from "src/components/realm/realm-messages.test.tsx"`.

- [ ] **Step 3: Write `RealmMessages`.**

Create `src/components/realm/realm-messages.tsx`:

```tsx
"use client";

import type { RealmProblem, RealmSpeech } from "@/lib/realm/messages";

/**
 * Two centred lanes, one message each (§3.6). Both <p>s are always mounted so the
 * live regions never remount and an announcement is never lost to a re-created node;
 * `.realm-message:empty { display: none }` is what hides the quiet one.
 *
 * The layer is pass-through: `pointerEvents: "none"` is set inline as well as in CSS
 * so a jsdom test can read it (D10.1), and the action button is the single element in
 * the layer that takes a pointer.
 */
const ALERT_KINDS = new Set<RealmProblem["kind"]>(["spriteError", "kingdomError", "ceremonyError"]);

export function RealmMessages({
  problem,
  speech,
  arrowRef,
  onAction,
  hudScale,
}: {
  problem: RealmProblem | null;
  speech: RealmSpeech | null;
  arrowRef: React.RefObject<HTMLDivElement | null>;
  onAction: () => void;
  hudScale: number;
}) {
  return (
    <div className="realm-messages" data-testid="realm-messages" style={{ pointerEvents: "none", fontSize: `${hudScale}em` }}>
      <p
        className="realm-message realm-message--problem"
        data-testid="realm-problem"
        // An error interrupts; a one-minute banner and the parent's preview line do not.
        // `aria-live="polite"` stays on both so an alert never talks over a child mid-sentence.
        role={problem && ALERT_KINDS.has(problem.kind) ? "alert" : "status"}
        aria-live="polite"
      >
        {problem?.text ?? ""}
        {problem?.actionLabel ? (
          <button type="button" style={{ pointerEvents: "auto" }} onClick={onAction}>
            {problem.actionLabel}
          </button>
        ) : null}
      </p>
      {/* Written per frame by the scene (task 16) straight to `hidden` and `style.transform`. */}
      <div ref={arrowRef} className="realm-edge-arrow" aria-hidden="true" hidden />
      <p
        className={`realm-message realm-message--${speech?.tone ?? "plain"}`}
        data-testid="realm-speech"
        role="status"
        aria-live="polite"
      >
        {speech?.text ?? ""}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass.**

```
npx vitest run src/components/realm/realm-messages.test.tsx
```

Expected: `Test Files 1 passed`, `Tests 8 passed`.

- [ ] **Step 5: Give `.realm-root` the three custom properties and the lanes their CSS.**

In `src/app/globals.css`, replace the `.realm-root` rule (currently line 1702):

```css
.realm-root { position: fixed; inset: 0; z-index: 45; background: #0a1220; }
```

with:

```css
/* `--realm-hud-scale` and `--realm-bar-bottom` are overwritten inline by RealmShell
   from the hero's render settings; these are the defaults. Every control that sits
   over the 3D world is `--realm-touch`; panel buttons stay at 44px. */
.realm-root { position: fixed; inset: 0; z-index: 45; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }
```

Then insert this block immediately after the line `.realm-hud-selector { display: contents; }`:

```css
/* Two centred message lanes: persistent problems in a band under the HUD zones,
   the things the game says in a lane above the ability bar. One message each. */
.realm-messages { position: absolute; inset: 0; z-index: 21; pointer-events: none; color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; }
.realm-message { position: absolute; left: 50%; margin: 0; transform: translateX(-50%); display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; max-width: min(30rem, calc(100vw - 2rem)); border-radius: 0.5rem; padding: 0.4rem 0.75rem; text-align: center; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
.realm-message:empty { display: none; }
.realm-message button { min-width: var(--realm-touch); min-height: var(--realm-touch); padding: 0 1rem; border-radius: 9999px; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font: inherit; font-weight: 700; cursor: pointer; }
.realm-message--problem { top: calc(3.5rem * var(--realm-hud-scale)); background: rgba(0, 0, 0, 0.75); border: 1px solid var(--gold-border); font-size: 0.95em; }
.realm-message--cheer, .realm-message--plain { bottom: calc(var(--realm-bar-bottom) + 4.5rem); font-size: 0.95em; }
.realm-message--cheer { background: rgba(201, 168, 76, 0.25); border: 1px solid var(--gold-border); color: var(--gold-bright); font-weight: 700; animation: realm-toast-in 300ms ease-out; }
.realm-message--plain { background: rgba(0, 0, 0, 0.45); }
@media (prefers-reduced-motion: reduce) { .realm-message--cheer { animation: none; } }
.realm-message--stage { top: 50%; transform: translate(-50%, -50%); font-size: calc(1.6rem * var(--realm-hud-scale)); font-weight: 700; color: var(--gold-bright); text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9); }
/* Position and pointer-events only. The scene (task 16) writes `hidden`, `transform`,
   `color`, `opacity` and `data-motion` on this element, and task 16's own rule draws the
   arrowhead as a `::before` triangle and gives it its 1 Hz pulse. Do NOT put a border
   triangle on the container here: task 16's rule cannot unset it, and the arrow would
   grow a second, unrotated head. */
.realm-edge-arrow { position: absolute; left: 0; top: 0; pointer-events: none; }
```

(No `color` here on purpose: task 16 appends the arrow's colour, its drop shadow, its `::before` arrowhead and its pulse as a second rule immediately below this one, and that colour is `#c9a84c` — `RING_GOLD`, the hero ring's gold — not `--gold-bright` (`#e0c068`), which is the HUD's. Declaring a *different* gold here would leave two rules for one selector disagreeing about the value, and task 16's browser check asserts the computed colour is `rgb(201, 168, 76)`. Position and pointer-events are all this task needs.)

- [ ] **Step 6: Typecheck and lint the two new files.**

```
npx tsc --noEmit
```
```
npx eslint src/components/realm/realm-messages.tsx src/components/realm/realm-messages.test.tsx
```

Expected: `tsc` prints nothing; `eslint` prints nothing. (`npm run lint` over the whole repo still shows the one pre-existing error in `src/components/quest-template-list.tsx`; that file is untouched here.)

- [ ] **Step 7: Commit the lanes.**

```
git -C /home/kylee/projects/kingdoms-and-crowns branch --show-current
```
Expected output: `realm-foundations`. If it is anything else, stop and fix the branch before committing.

```
git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/realm-messages.tsx src/components/realm/realm-messages.test.tsx src/app/globals.css
```
```
git -C /home/kylee/projects/kingdoms-and-crowns commit -m "feat(realm): add the two centred message lanes and the Realm's layout custom properties" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Rewrite `realm-hud.test.tsx` so it demands a HUD with no messages in it.**

Replace the whole of `src/components/realm/realm-hud.test.tsx` with:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

// Every message now lives in the two centred lanes (RealmMessages), so the HUD's prop
// list carries no string it could print: no toast, no notice, no error, no banner.
//
// `mana`, `cleared` and `ride` are deliberately carried through this task unchanged:
// this task's gate is the whole suite, and the shell still renders all three. Task 10
// evicts them — it deletes the two mana cases and the ride half of the recess case,
// and drops these three keys from `base`. Keeping them here for one task is coverage,
// not churn: they are the only thing testing a meter that is still on screen.
const base = {
  heroName: "Lily",
  minutesRemaining: 7 as number | null,
  preview: false,
  hudScale: 1,
  paused: false,
  mana: null as number | null,
  cleared: null as number | null,
  recess: null,
  ride: null,
};

describe("RealmHud", () => {
  it("shows the hero's minutes", () => {
    render(<RealmHud {...base} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
  });

  it("prints no message of its own — the lanes own every one", () => {
    render(<RealmHud {...base} minutesRemaining={1} />);
    expect(document.querySelector(".realm-hud-notice")).toBeNull();
    expect(document.querySelector(".realm-hud-toast")).toBeNull();
    expect(document.querySelector(".realm-hud-error")).toBeNull();
    expect(document.querySelector(".realm-hud-banner")).toBeNull();
    expect(document.querySelector(".realm-hud-note")).toBeNull();
    expect(screen.queryByText("One minute left in the Realm today.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });

  it("links back to the Tavern", () => {
    render(<RealmHud {...base} minutesRemaining={3} hudScale={1.25} />);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });

  it("shows the selector only in the preview HUD", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} selector={<span>picker</span>} />);
    expect(screen.getByText("picker")).toBeInTheDocument();
    cleanup();
    render(<RealmHud {...base} minutesRemaining={3} selector={<span>picker</span>} />);
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });

  it("marks the counter paused", () => {
    render(<RealmHud {...base} paused={true} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RealmHud {...base} minutesRemaining={null} preview={true} selector={<span>picker</span>} />);
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });

  it("shows mana and the cleared count", () => {
    render(<RealmHud {...base} mana={42} cleared={3} />);
    const bar = screen.getByRole("progressbar", { name: "Mana" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Cleared: 3")).toBeInTheDocument();
  });

  it("hides mana and the count in preview", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared:/)).not.toBeInTheDocument();
  });

  it("shows recess tallies and the ride button", () => {
    const onToggle = vi.fn();
    render(<RealmHud {...base} mana={50} cleared={0} recess={{ gleams: 3, laps: 1, bestLapMs: 40_300, lapMs: 12_000 }} ride={{ riding: false, disabled: false, onToggle }} />);
    expect(screen.getByText("Gleams: 3")).toBeInTheDocument();
    expect(screen.getByText(/Laps: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Best 40\.3 s/)).toBeInTheDocument();
    expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ride" }));
    expect(onToggle).toHaveBeenCalled();
    cleanup();
    render(<RealmHud {...base} mana={50} cleared={0} ride={{ riding: true, disabled: true, onToggle }} />);
    expect(screen.getByRole("button", { name: "Dismount" })).toBeDisabled();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
  });

  it("shows the worn crown and the ceremony's Skip button", () => {
    const onSkip = vi.fn();
    render(<RealmHud {...base} paused={true} crown={{ label: "Copper Circlet", color: "#b87333" }} ceremony={{ onSkip }} />);
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("offers How to play as a 44px button and disables it while a panel is open", () => {
    const onOpen = vi.fn();
    render(<RealmHud {...base} help={{ onOpen, disabled: false }} />);
    const button = screen.getByRole("button", { name: "How to play" });
    expect(button.className).toContain("realm-hud-help");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    cleanup();
    render(<RealmHud {...base} paused={true} help={{ onOpen, disabled: true }} />);
    expect(screen.getByRole("button", { name: "How to play" })).toBeDisabled();
  });
});
```

- [ ] **Step 9: Run the HUD test and watch it fail.**

```
npx vitest run src/components/realm/realm-hud.test.tsx
```

Expected: one failure — `prints no message of its own — the lanes own every one`, on `expect(document.querySelector(".realm-hud-notice")).toBeNull()` (`received: <p class="realm-hud-notice" aria-live="polite" />`), because `realm-hud.tsx:117` still renders the always-mounted notice paragraph.

- [ ] **Step 10: Update `realm-shell.test.tsx` for the two lanes.**

Eight replaced assertions — (a), (b), two in (b2), (c), one in (c2), (d), (e) — and five new cases: one in (c2), three in (f) and one in (g).

> **Read this before you start.** One lane now holds one message, and `SPEECH_ORDER` puts `toast` above `notice`. Three existing assertions in this file were written when a toast and a notice could be on screen at once, and they are the reason edits (b2) and (c2) exist. Wherever a test fires something that sets a toast — `onSelectSpell` (`setToast(CAST_HINT)`, realm-shell.tsx:282), `recessStart` (`setToast("Recess!")`, :367), a building rising (:420) or the ceremony's hail (:465) — every `setNotice` under it is *held*, not shown. This file uses no fake timers, so a toast owns the lane for its whole 4000 ms and the test never outlives it.

(a) In `previews for a parent without recording anything` (currently line 127), replace:

```tsx
    expect(screen.getByText("Closed for Lily: It's school time.")).toBeInTheDocument();
```

with:

```tsx
    // The intro and the gate note are one message in the problem lane now (§3.17).
    expect(screen.getByTestId("realm-problem")).toHaveTextContent(
      "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play. Closed for Lily: It's school time."
    );
```

(b) In `opens the site card from a villager in reach…` (currently line 198), replace:

```tsx
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
```

with:

```tsx
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("The Village Well stands.");
```

(b2) In `selects a page, passes the resolved spell to the scene, and reflects scene events in the HUD` (currently lines 321 and 325), two replacements. The `await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }))` near the top of that test fires `onSelectSpell`, which calls `setToast(CAST_HINT)` (realm-shell.tsx:282; `showStick` is `false` in jsdom, where `navigator.maxTouchPoints` is 0, so it is the long keyboard string). The toast holds the speech lane for 4000 ms of real time, so neither notice below it can reach the screen. Replace:

```tsx
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
```

with:

```tsx
    // The cast hint took the speech lane when the page was selected and holds it for its
    // four seconds; "The fog thins." is held in `notice`, not destroyed (§3.6). The cleared
    // copy is proved on its own by task 10's `says what a cleared trouble did` case, which
    // never selects a page.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent(
      "Tap or click where the spell should go, or press Space to aim at the nearest trouble."
    );
```

and replace:

```tsx
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
```

with:

```tsx
    // Same lane, same holder — and this is the priority rule stated outright. The refusal's
    // own copy is proved on its own by the new `shows a problem and a speech message at the
    // same time, one in each lane` case in edit (f) below, which raises no toast.
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent(
      "Tap or click where the spell should go, or press Space to aim at the nearest trouble."
    );
```

(c) In `turns recess on only for a hero whose access source is recess, with a toast` (currently line 381), replace:

```tsx
    expect(screen.getByRole("status")).toHaveTextContent("Recess!");
```

with:

```tsx
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
```

(c2) In the same test (currently line 385), `Recess!` is still holding the lane four lines later, so the gleam notice fired under it cannot be on screen either. Replace:

```tsx
    expect(screen.getByText("A gleam! 1 so far.")).toBeInTheDocument();
```

with:

```tsx
    // "Recess!" still owns the lane — the gleam notice is held beneath it. The tally is
    // the assertion that matters here, and the gleam's own copy is proved by the case below.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
```

Then insert this case immediately after the closing `});` of `turns recess on only for a hero whose access source is recess, with a toast`, so the gleam's copy is still covered somewhere:

```tsx
  it("says what a gleam did when no toast is holding the speech lane", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // No `recessStart` here, so nothing has raised a toast and the notice takes the lane.
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "gleam", count: 1 });
    });
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("A gleam! 1 so far.");
  });
```

(d) In `holds the ceremony for the hero, then records it and restores play` (currently lines 487-489), replace:

```tsx
    step("hail");
    expect(screen.getByText("Hail, Lily, Copper Circlet!")).toBeInTheDocument();
    expect(screen.getByText("Season 1 complete")).toBeInTheDocument();
```

with:

```tsx
    step("hail");
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Hail, Lily, Copper Circlet!");
    // The season toast is held, not destroyed: the ceremony owns the speech lane while it plays.
    expect(screen.queryByText("Season 1 complete")).not.toBeInTheDocument();
```

(e) In the same test, after the last line (currently line 499):

```tsx
    expect(screen.queryByText("Hail, Lily, Copper Circlet!")).not.toBeInTheDocument();
```

add:

```tsx
    // …and the toast that lost the lane appears the moment the ceremony clears it.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Season 1 complete");
```

(f) Insert these three cases immediately before the `});` that closes the first `describe("RealmShell", …)` block (currently line 469, after the `ignores M with a modifier chord` test):

```tsx
  it("sets the Realm's layout custom properties from the hero's settings", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const root = document.querySelector<HTMLElement>(".realm-root")!;
    expect(root.style.getPropertyValue("--realm-hud-scale")).toBe("1");
    expect(root.style.getPropertyValue("--realm-bar-bottom")).toBe("1.25rem");
    cleanup();
    render(
      <RealmShell
        bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, largerText: true, inputMode: "touch" as const } }}
        childId="c1"
        isChildView={true}
      />
    );
    await screen.findByTestId("scene");
    const raised = document.querySelector<HTMLElement>(".realm-root")!;
    expect(raised.style.getPropertyValue("--realm-hud-scale")).toBe("1.25");
    expect(raised.style.getPropertyValue("--realm-bar-bottom")).toBe("9.5rem");
  });

  it("shows a problem and a speech message at the same time, one in each lane", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(
      <RealmShell
        bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again.", spellbook: { spells: pages, slots: 4 } }}
        childId="c1"
        isChildView={true}
      />
    );
    await screen.findByTestId("scene");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(screen.getByTestId("realm-problem")).toHaveTextContent("The villagers are resting. Try again.");
    expect(screen.getByRole("button", { name: "Wake the villagers" })).toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Not enough mana yet.");
  });

  it("puts the HUD zones and the lanes ahead of the world in the tab order", async () => {
    // §6: "The eight plates sit in DOM order after the HUD zones." Task 15 mounts those
    // plates in drei <Html> portals, which drei appends inside the Canvas wrapper — so the
    // only way the plates can follow the HUD is for the HUD to precede the scene here.
    // Paint order is unaffected: .realm-hud is z-index 20 and .realm-messages 21, while the
    // Canvas div is z-index auto and every <Html> in the scene is pinned below 20 by its
    // own zIndexRange (realm-scene.tsx uses [10, 0] and [15, 0] today).
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    const hud = document.querySelector(".realm-hud")!;
    const messages = screen.getByTestId("realm-messages");
    expect(hud.compareDocumentPosition(scene) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(messages.compareDocumentPosition(scene) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

(g) Insert this case into `describe("RealmShell crown ceremony", …)`, immediately after the `holds the ceremony for the hero, then records it and restores play` test:

```tsx
  it("never lets a spell notice erase the crowning line", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    step("hail");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    // ceremonyNotice and notice are two separate props on RealmMessages: the picker
    // chooses, the loser is simply not shown rather than overwritten (§3.6, §5).
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Hail, Lily, Copper Circlet!");
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
  });
```

- [ ] **Step 11: Run the shell test and watch it fail.**

```
npx vitest run src/components/realm/realm-shell.test.tsx
```

Expected failures: `sets the Realm's layout custom properties from the hero's settings` (`expected '' to be '1'` — nothing sets the properties yet), `shows a problem and a speech message at the same time, one in each lane`, `never lets a spell notice erase the crowning line` and `says what a gleam did when no toast is holding the speech lane` (`Unable to find an element by: [data-testid="realm-problem"]` / `…"realm-speech"`), plus the same "unable to find" failures in every case edits (a)–(e) touched — `previews for a parent without recording anything`, `opens the site card from a villager in reach…`, `selects a page, passes the resolved spell to the scene…`, `turns recess on only for a hero whose access source is recess, with a toast` and `holds the ceremony for the hero, then records it and restores play`.

- [ ] **Step 12: Take every message out of `RealmHud`.**

Replace the whole of `src/components/realm/realm-hud.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import { formatLap } from "@/lib/realm/recess/recess";

export function RealmHud({
  heroName,
  minutesRemaining,
  preview,
  hudScale,
  selector,
  paused,
  mana,
  cleared,
  recess,
  ride,
  crown = null,
  ceremony = null,
  help = null,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  preview: boolean; // the badge and the hero selector; the parent's intro line is a problem-lane message now
  hudScale: number;
  selector?: React.ReactNode;
  paused: boolean;
  mana: number | null;
  cleared: number | null;
  recess: { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null } | null;
  ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null;
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  help?: { onOpen: () => void; disabled: boolean } | null;
}) {
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em` }}>
      <div className="realm-hud-row">
        <span className="realm-hud-name">{heroName}</span>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        {mana !== null && (
          <span className="realm-hud-mana" role="progressbar" aria-label="Mana" aria-valuemin={0} aria-valuemax={MANA_MAX} aria-valuenow={Math.round(mana)}>
            <span className="realm-hud-mana-fill" style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
            <span className="realm-hud-mana-text">Mana {Math.round(mana)}</span>
          </span>
        )}
        {cleared !== null && <span className="realm-hud-cleared">Cleared: {cleared}</span>}
        {recess && <span className="realm-hud-cleared">Gleams: {recess.gleams}</span>}
        {recess && (
          <span className="realm-hud-cleared">
            Laps: {recess.laps}
            {recess.bestLapMs !== null && ` · Best ${formatLap(recess.bestLapMs)} s`}
            {recess.lapMs !== null && ` · ${formatLap(recess.lapMs)} s`}
          </span>
        )}
        {ride && (
          <Button size="sm" variant="outline" className="realm-hud-ride" disabled={ride.disabled} onClick={ride.onToggle}>
            {ride.riding ? "Dismount" : "Ride"}
          </Button>
        )}
        {crown && (
          <span className="realm-hud-badge realm-hud-crown" style={{ color: crown.color }}>
            <GameIcon name="crown" className="size-4" /> {crown.label}
          </span>
        )}
        {ceremony && (
          <Button size="sm" variant="outline" className="realm-hud-skip" onClick={ceremony.onSkip}>Skip</Button>
        )}
        {help && (
          <Button size="sm" variant="outline" className="realm-hud-help" aria-label="How to play" disabled={help.disabled} onClick={help.onOpen}>?</Button>
        )}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&apos;s Realm</span>}
        {preview && <span className="realm-hud-selector">{selector}</span>}
        <Link href="/tavern" className="realm-hud-leave">Leave the Realm</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Wire the lanes into the shell and delete the collapsed notice.**

Five edits in `src/components/realm/realm-shell.tsx`.

(a) Add the import after `import { RealmHud } from "./realm-hud";` (currently line 30):

```tsx
import { RealmMessages } from "./realm-messages";
```

and the picker import after `import { hudRecessFor } from "@/lib/realm/recess/hud";` (currently line 20):

```tsx
import { pickProblem, pickSpeech, type MessageInput } from "@/lib/realm/messages";
```

(b) Add the arrow ref immediately after `const rootRef = useRef<HTMLDivElement>(null);` (currently line 200):

```tsx
  // Held here, rendered by RealmMessages, written per frame by the scene (task 16).
  const arrowRef = useRef<HTMLDivElement>(null);
```

(c) Replace the `hudRide` block (currently lines 475-477) — keep it, and append the message block after it, so the section reads:

```tsx
  const hudRide = isChildView
    ? (canRide ? { riding, disabled: ceremonyRunning, onToggle: onToggleRide } : null)
    : (mountItem && bundle.mounts.unlocked.includes(mountItem.id) ? { riding: false, disabled: true, onToggle: () => {} } : null);

  // The parent's intro carries the gate note as one message in the problem lane (§3.17).
  const previewText = isChildView
    ? null
    : `You're looking at ${bundle.heroName}'s grounds. Spells, ${SIDE_QUESTS_LOWER} and recess are theirs to play.${note ? ` ${note}` : ""}`;
  // Two lanes, one message each, and `ceremonyNoticeText` and `notice` stay two states:
  // a spell notice fired during the ceremony loses the lane, it does not erase the
  // crowning line, and the crown does not erase "Not enough mana yet." (§3.6, §5).
  const messageInput: MessageInput = {
    spriteError: spriteError || clock.error,
    kingdomError,
    ceremonyError,
    lastMinute: isChildView && clock.warning,
    preview: previewText,
    ceremonyNotice: ceremonyNoticeText,
    toast,
    notice,
    calm,
  };
  const problem = pickProblem(messageInput);
  const speech = pickSpeech(messageInput);
```

(d) Give the root div the two dynamic custom properties (currently lines 482-488):

```tsx
    <div
      ref={rootRef}
      className={`realm-root${selectedSpell ? " realm-root--aiming" : ""}`}
      tabIndex={-1}
      style={{ "--realm-hud-scale": String(settings.hudScale), "--realm-bar-bottom": settings.showStick ? "9.5rem" : "1.25rem" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      {...readingAttributes(bundle.profile)}
    >
```

(e) Replace the whole `<RealmHud … />` element (currently lines 517-546) with the trimmed HUD and the lanes beside it — and **move the pair above the `{textures && (<RealmScene … />)}` block**, so the order inside `.realm-root` becomes `<SpriteSource/>`, `<RealmHud/>`, `<RealmMessages/>`, `{textures && <RealmScene/>}`, `<TouchStick/>`, `<SpellBar/>`, the panels.

Why the move: §6 requires that "the eight plates sit in DOM order after the HUD zones", and task 15 mounts those plates in drei `<Html>` portals, which drei appends *inside* the Canvas wrapper. Leaving `<RealmHud/>` after `<RealmScene/>` would put all eight villager buttons ahead of the identity plate, the objective card and the meta zone's `?` and `Leave the Realm` in the tab order — the reverse of what §6 says. Nothing about the picture changes: `.realm-hud` is `z-index: 20` and `.realm-messages` is `z-index: 21`, while the Canvas div is `position: absolute` with `z-index: auto` (so it opens no stacking context) and every `<Html>` inside the scene is pinned below 20 by its own `zIndexRange` — `[10, 0]` for the prop labels, `[15, 0]` for the reach bubble. The `puts the HUD zones and the lanes ahead of the world in the tab order` case from edit (f) is what holds this.

```tsx
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        preview={!isChildView}
        hudScale={settings.hudScale}
        selector={selector}
        paused={panelOpen || ceremonyRunning || helpOpen}
        mana={isChildView ? mana : null}
        cleared={isChildView ? cleared : null}
        recess={hudRecess}
        ride={hudRide}
        crown={crown}
        ceremony={ceremonyStage === "running" ? { onSkip } : null}
        help={{ onOpen: openHelp, disabled: panelOpen || helpOpen }}
      />
      <RealmMessages
        problem={problem}
        speech={speech}
        arrowRef={arrowRef}
        hudScale={settings.hudScale}
        onAction={() => {
          if (!problem) return;
          if (problem.kind === "spriteError") {
            setSpriteError("");
            clock.clearError();
            setRetryKey((k) => k + 1);
            void clock.flushPending();
            return;
          }
          if (problem.kind === "kingdomError") {
            onKingdomRetry();
            return;
          }
          if (problem.kind === "ceremonyError") recordCeremony();
        }}
      />
```

- [ ] **Step 14: Run all three suites and watch them pass.**

```
npx vitest run src/components/realm/realm-messages.test.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.test.tsx
```

Expected: `Test Files 3 passed`, every test green, including the five new cases — `sets the Realm's layout custom properties from the hero's settings`, `shows a problem and a speech message at the same time, one in each lane`, `puts the HUD zones and the lanes ahead of the world in the tab order`, `says what a gleam did when no toast is holding the speech lane` and `never lets a spell notice erase the crowning line`.

If `selects a page, passes the resolved spell to the scene…` or `turns recess on only for a hero whose access source is recess…` is still red on `The fog thins.`, `Not enough mana yet.` or `A gleam! 1 so far.`, edits (b2) and (c2) were skipped: one lane holds one message, and a toast raised earlier in the same test is still holding it.

- [ ] **Step 15: Delete the CSS the deleted DOM used.**

In `src/app/globals.css`, delete these seven lines (the rules for nodes that no longer exist). Keep `@keyframes realm-toast-in` — `.realm-message--cheer` uses it.

```css
.realm-hud-note, .realm-hud-banner, .realm-hud-error { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(0, 0, 0, 0.45); font-size: 0.9em; }
.realm-hud-banner { border: 1px solid var(--gold-border); }
.realm-hud-toast { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(201, 168, 76, 0.25); border: 1px solid var(--gold-border); color: var(--gold-bright); font-weight: 700; font-size: 0.95em; animation: realm-toast-in 300ms ease-out; }
@media (prefers-reduced-motion: reduce) { .realm-hud-toast { animation: none; } }
.realm-hud-toast--plain { animation: none; background: rgba(0, 0, 0, 0.45); color: #fff; font-weight: 500; }
.realm-hud-notice { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(0, 0, 0, 0.45); font-size: 0.9em; }
.realm-hud-notice:empty { display: none; }
```

Confirm nothing that renders those nodes still references them. Scope the grep to the three files the rule is about — `realm-hud.test.tsx` names all five classes on purpose, in the step-8 assertions that they are *gone*, and a repo-wide grep would print those five lines and look like a failure:

```
grep -n "realm-hud-toast\|realm-hud-notice\|realm-hud-error\|realm-hud-banner\|realm-hud-note\b" src/app/globals.css src/components/realm/realm-hud.tsx src/components/realm/realm-shell.tsx
```

Expected: no output.

```
grep -c "realm-toast-in" src/app/globals.css
```

Expected: `2` — the `@keyframes realm-toast-in` block you kept at `:1715`, and the `.realm-message--cheer` rule added in step 5 that animates with it. If it prints `1`, the keyframes went out with the deletion; put them back.

- [ ] **Step 16: Verify the whole repo.**

```
npm test
```
Expected: all suites pass.

```
npm run typecheck
```
Expected: no output.

```
npm run lint
```
Expected: the single pre-existing error in `src/components/quest-template-list.tsx` and nothing else.

- [ ] **Step 17: Commit the move.**

```
git -C /home/kylee/projects/kingdoms-and-crowns branch --show-current
```
Expected output: `realm-foundations`.

```
git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/app/globals.css
```
```
git -C /home/kylee/projects/kingdoms-and-crowns commit -m "refactor(realm): move every HUD message into the two lanes, and stop the crown erasing a spell notice" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Deferred to task 21's browser pass** (nothing here imports three, so every unit is covered above; two of this task's claims are only provable on screen): check 6 — a `pointerdown` at top-centre while a toast is showing walks the hero, which proves `.realm-messages { pointer-events: none }` over the real canvas; and check 8 — with `reducedMotion` and `lowStimulus` both on, the `--cheer` lane still appears and does not slide.

---

### Task 10: The interim tenants: the mana pip strip and the round mount button

The corner scoreboard loses its two live readouts. Mana becomes a pip strip pinned directly above the ability bar, where cost and resource can finally be read together, and `Ride` becomes a round 56px button at the bottom-right — the exact square slice 3's mount slot will occupy, so nothing moves twice. `cleared` is deleted outright: it was per-visit `useState` that reset on every navigation, a scoreboard that lied. The shell also snapshots the visit's `depth` here, once, and derives `surfaces` from it — the two values every later surface in this slice reads.

**Files:**
- Modify: `src/components/realm/realm-hud.tsx` — add the `RealmManaPips` and `RealmMountButton` exports; delete `mana` (props line 23, type line 47, JSX 63-68), `cleared` (props 24, type 48, JSX 69) and `ride` (props 27, type 51, JSX 78-82). Task 9 has already rewritten this file's prop list, so those line numbers will have moved; every deletion below is anchored to its exact text instead.
- Modify: `src/components/realm/realm-shell.tsx` — delete the `cleared` state (line 170), its write in `onSpellEvent`'s `"cleared"` case (line 357) and the `cleared=` prop (line 531); add the visit's `depth` (after line 174), `surfaces` (after line 213), the `refusedAt` window (with the other message timers, after line 351) and both new components (before line 547).
- Modify: `src/app/globals.css` — append `.realm-mana-pips`, `.realm-pip`, `.realm-pip--on`, `.realm-mount-button` and the refusal keyframe; insert `.realm-spell--refused` and `@keyframes realm-slot-refused` after `.realm-spell--dim` (line 1742 today); delete the now-dead `.realm-hud-mana`, `.realm-hud-mana-fill`, `.realm-hud-mana-text`, `.realm-hud-ride` rules (lines 1755-1757, 1759-1760 today).
- Modify: `src/components/realm/spell-bar.tsx:13-29` (the `refused` prop) and `:112` (the selected slot's class) — the other half of §3.7's refusal cue.
- Test: `src/components/realm/spell-bar.test.tsx` — one new case, appended to the existing `describe("SpellBar", …)` (the file has ten cases today).
- Test: `src/components/realm/realm-hud.test.tsx` — new `RealmManaPips` and `RealmMountButton` describes; the mana/cleared/ride cases retired.
- Test: `src/components/realm/realm-shell.test.tsx` — the three `progressbar` assertions become pip-strip assertions, the two `Cleared:` assertions go, the `Ride`/`Dismount` accessible names become `Ride your mount` / `Get off your mount`, and three new cases. Line numbers are omitted on purpose: task 9 edits this file above every one of them, so step 17 anchors each edit on its exact text.

**Interfaces:**

*Consumes (from earlier tasks, exact signatures):*
```ts
// task 1 — src/lib/realm/depth.ts
type RealmDepth = "simple" | "full"
type Surfaces = { numerals: boolean; trackedObjectives: number; abilitySlots: "earned"|"all"; keycapHints: boolean;
                  listRows: number; districtDetail: boolean; fastTravel: boolean; troubleNames: boolean;
                  troubleDetail: boolean; troubleHitPips: boolean; clearCount: boolean; bountyLedgerLine: boolean; lapTimes: boolean }
function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces
// task 8 — src/lib/actions/realm.ts
RealmBundle.depth: RealmDepth          // computed server-side from helpSeen + depthOverride
// task 9 — src/app/globals.css, set on .realm-root
--realm-hud-scale   // settings.hudScale, 1 | 1.25
--realm-bar-bottom  // 1.25rem, or 9.5rem when settings.showStick
--realm-touch       // 56px
// existing
const MANA_MAX = 100                    // src/lib/realm/spells/mana.ts
```

*Produces (what later tasks rely on):*
```tsx
// src/components/realm/realm-hud.tsx
export function RealmManaPips({ mana, surfaces, refused }: { mana: number | null; surfaces: Surfaces; refused: boolean }): JSX.Element | null
export function RealmMountButton({ ride, showStick }: { ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null; showStick: boolean }): JSX.Element | null
// RealmHud props removed here: mana, cleared, ride
// src/components/realm/realm-shell.tsx, inside RealmOpen — both referentially stable
const [depth] = useState(() => bundle.depth)                                    // task 18 adds the setter
const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile])   // tasks 11, 15 pass this on
// src/components/realm/spell-bar.tsx
export function SpellBar({ …, refused = false }: { …; refused?: boolean }): JSX.Element   // marks the SELECTED slot
// CSS: .realm-mana-pips  .realm-mana-pips--refused  .realm-mount-button  .realm-pip  .realm-pip--on
//      (.realm-mana-bar, .realm-mana-fill, .realm-mount-key, .realm-spell--refused are this
//       task's own, not frozen names)
```

---

- [ ] **Step 1: Write the failing test for the mana pip strip.**

  Open `src/components/realm/realm-hud.test.tsx`. Change the import on line 3 to name the new component, and add the two new imports under it:

  ```tsx
  import { RealmHud, RealmManaPips } from "./realm-hud";
  import { surfacesFor } from "@/lib/realm/depth";
  import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
  ```

  Then append this to the very end of the file, after the closing `});` of the existing `describe("RealmHud", …)`:

  ```tsx
  // The two depths, taken from the contract itself rather than hand-built, so a
  // change to surfacesFor's table cannot leave these cases quietly testing nothing.
  const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);
  const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);

  describe("RealmManaPips", () => {
    it("draws ten pips, filled to the nearest ten, with a numeric name", () => {
      render(<RealmManaPips mana={65} surfaces={simple} refused={false} />);
      const strip = screen.getByRole("img", { name: "Mana 65 of 100." });
      expect(strip.querySelectorAll(".realm-pip")).toHaveLength(10);
      expect(strip.querySelectorAll(".realm-pip--on")).toHaveLength(7);
      expect(strip).not.toHaveTextContent("Mana 65");
    });

    it("reads the number itself at full depth, under the same accessible name", () => {
      render(<RealmManaPips mana={65} surfaces={full} refused={false} />);
      const strip = screen.getByRole("img", { name: "Mana 65 of 100." });
      expect(strip).toHaveTextContent("Mana 65");
      expect(strip.querySelectorAll(".realm-pip")).toHaveLength(0);
    });

    it("shows nothing at all when there is no mana to show", () => {
      const { container } = render(<RealmManaPips mana={null} surfaces={full} refused={false} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("marks the strip refused so the red flash has something to hang on", () => {
      render(<RealmManaPips mana={4} surfaces={simple} refused={true} />);
      expect(screen.getByRole("img", { name: "Mana 4 of 100." })).toHaveClass("realm-mana-pips--refused");
    });
  });
  ```

- [ ] **Step 2: Run it and watch it fail.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: the four `RealmManaPips` cases fail with `Element type is invalid: expected a string … but got: undefined` (there is no `RealmManaPips` export yet). Every existing `RealmHud` case still passes.

- [ ] **Step 3: Write the mana pip strip.**

  In `src/components/realm/realm-hud.tsx`, add the type import under the `MANA_MAX` import on line 6:

  ```tsx
  import type { Surfaces } from "@/lib/realm/depth";
  ```

  and append this to the end of the file, after `RealmHud`'s closing brace:

  ```tsx
  /** Ten pips of ten mana each. A fixed list so the keys are stable and no array is built per frame. */
  const MANA_PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /**
   * Mana, pinned directly above the ability bar so cost and resource read
   * together (§3.7). Pips for a pre-literate reader, the number itself at full
   * depth — and a numeric accessible name in *both* cases, because pips
   * substitute for numerals on screen, never in the accessible name.
   * An interim tenant: slice 3 gives mana its permanent home on the bar's top edge.
   */
  export function RealmManaPips({ mana, surfaces, refused }: { mana: number | null; surfaces: Surfaces; refused: boolean }) {
    if (mana === null) return null; // a parent's preview spends nothing, so it shows nothing
    const value = Math.round(mana);
    const filled = Math.round(value / 10);
    return (
      <div
        className={refused ? "realm-mana-pips realm-mana-pips--refused" : "realm-mana-pips"}
        role="img"
        aria-label={`Mana ${value} of ${MANA_MAX}.`}
      >
        {surfaces.numerals ? (
          <>
            <span>Mana {value}</span>
            <span className="realm-mana-bar" aria-hidden="true">
              <span className="realm-mana-fill" style={{ width: `${(value / MANA_MAX) * 100}%` }} />
            </span>
          </>
        ) : (
          MANA_PIPS.map((pip) => <span key={pip} className={pip <= filled ? "realm-pip realm-pip--on" : "realm-pip"} />)
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run it and watch it pass.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: every case in the file passes, including the four new ones.

- [ ] **Step 5: Commit the pip strip.**

  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns branch --show-current
  ```
  Expected output: `realm-foundations`. If it is anything else, stop and switch branch before committing — this checkout is shared.
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx
  ```
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns commit -m "feat(realm): read mana as a pip strip with a numeric name at both depths" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Write the failing test for the mount button.**

  In `src/components/realm/realm-hud.test.tsx`, extend the import on line 3 again:

  ```tsx
  import { RealmHud, RealmManaPips, RealmMountButton } from "./realm-hud";
  ```

  and append this describe to the end of the file:

  ```tsx
  describe("RealmMountButton", () => {
    it("offers a round Ride button with the M keycap for a keyboard hero", () => {
      const onToggle = vi.fn();
      render(<RealmMountButton ride={{ riding: false, disabled: false, onToggle }} showStick={false} />);
      const button = screen.getByRole("button", { name: "Ride your mount" });
      expect(button).toHaveClass("realm-mount-button");
      expect(button).toHaveTextContent("Ride");
      expect(button.querySelector(".realm-mount-key")).toHaveTextContent("M");
      fireEvent.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("says Dismount while riding, and drops the keycap on a touch device", () => {
      render(<RealmMountButton ride={{ riding: true, disabled: false, onToggle: () => {} }} showStick={true} />);
      const button = screen.getByRole("button", { name: "Get off your mount" });
      expect(button).toHaveTextContent("Dismount");
      expect(button.querySelector(".realm-mount-key")).toBeNull();
    });

    it("renders disabled for a parent, and nothing at all for a hero with no mount", () => {
      render(<RealmMountButton ride={{ riding: false, disabled: true, onToggle: () => {} }} showStick={false} />);
      expect(screen.getByRole("button", { name: "Ride your mount" })).toBeDisabled();
      cleanup();
      const { container } = render(<RealmMountButton ride={null} showStick={false} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
  ```

- [ ] **Step 7: Run it and watch it fail.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: the three `RealmMountButton` cases fail with `Element type is invalid: expected a string … but got: undefined`. Everything else still passes.

- [ ] **Step 8: Write the mount button.**

  Append to the end of `src/components/realm/realm-hud.tsx`:

  ```tsx
  /**
   * Ride, as a round 56px button at the bottom-right beside the ability bar —
   * the exact place slice 3's mount slot will occupy, so nothing moves twice
   * (D6.3). Deleting it outright would leave a touch hero with no way to mount
   * at all, since `M` is the only other way in. `ride.disabled` is what a
   * parent's preview and a running ceremony both use; the button stays visible
   * either way, because a control that vanishes teaches nothing.
   */
  export function RealmMountButton({ ride, showStick }: { ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null; showStick: boolean }) {
    if (!ride) return null;
    return (
      <button
        type="button"
        className="realm-mount-button"
        aria-label={ride.riding ? "Get off your mount" : "Ride your mount"}
        disabled={ride.disabled}
        onClick={ride.onToggle}
      >
        {ride.riding ? "Dismount" : "Ride"}
        {!showStick && <span className="realm-mount-key" aria-hidden="true">M</span>}
      </button>
    );
  }
  ```

- [ ] **Step 9: Run it and watch it pass.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: the whole file passes, the three new cases included.

- [ ] **Step 10: Commit the mount button.**

  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx
  ```
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns commit -m "feat(realm): give Ride a round 56px button beside the ability bar" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 11: Style both tenants.**

  Append this to the end of `src/app/globals.css` (the file currently ends with the `@media (max-width: 640px)` Realm rule). Nothing is deleted here — the old `.realm-hud-mana*` and `.realm-hud-ride` rules are still rendering until step 15, and they go in that commit.

  ```css

  /* ── Slice 1's interim tenants: the mana strip and the mount button ─────────── */
  /* Both sit over the 3D world beside the ability bar, so both take their size and
     their footing from .realm-root's custom properties rather than from a literal. */
  .realm-mana-pips { position: absolute; left: 50%; bottom: calc(var(--realm-bar-bottom) + 3.6rem); z-index: 20; display: flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.7rem; border-radius: 9999px; background: rgba(0, 0, 0, 0.5); color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: calc(12px * var(--realm-hud-scale)); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); pointer-events: none; transform: translateX(-50%); }
  .realm-pip { width: calc(8px * var(--realm-hud-scale)); height: calc(8px * var(--realm-hud-scale)); border-radius: 9999px; background: rgba(255, 255, 255, 0.22); }
  .realm-pip--on { background: var(--gold-bright); }
  /* Progress is gold; mana is the spell bar's blue, so the two pip rows never read as one scale. */
  .realm-mana-pips .realm-pip--on { background: rgba(96, 165, 250, 0.95); }
  .realm-mana-bar { position: relative; display: inline-block; width: 6rem; height: calc(4px * var(--realm-hud-scale)); border-radius: 9999px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
  .realm-mana-fill { position: absolute; inset: 0 auto 0 0; background: rgba(96, 165, 250, 0.95); }
  /* The refusal: red pips for the whole 600 ms window, and a 3-cycle 4px shake on top of
     them under motion. The red is the cue; the shake is the decoration — which is what
     makes reduced motion a substitution rather than a silence. The keyframes carry the
     centring translate, or the shake would throw the strip half a screen to the right. */
  .realm-mana-pips--refused .realm-pip, .realm-mana-pips--refused .realm-mana-fill { background: #ef4444; transition: none; }
  .realm-mana-pips--refused { animation: realm-mana-refused 200ms ease-in-out 3; }
  @keyframes realm-mana-refused {
    0%, 100% { transform: translateX(-50%); }
    25% { transform: translateX(calc(-50% - 4px)); }
    75% { transform: translateX(calc(-50% + 4px)); }
  }
  @media (prefers-reduced-motion: reduce) { .realm-mana-pips--refused { animation: none; } }
  .realm-mount-button { position: absolute; right: 1.25rem; bottom: var(--realm-bar-bottom); z-index: 21; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.05rem; min-width: var(--realm-touch); min-height: var(--realm-touch); padding: 0 0.5rem; border-radius: 9999px; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: calc(12px * var(--realm-hud-scale)); font-weight: 700; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); cursor: pointer; pointer-events: auto; }
  .realm-mount-button:disabled { opacity: 0.5; cursor: default; }
  .realm-mount-key { font-weight: 500; font-size: calc(10px * var(--realm-hud-scale)); color: rgba(255, 255, 255, 0.8); }
  ```

  **Paste the block flush-left, with no leading indentation** — it is indented here only because it sits inside a list item, and the checks below anchor on `^`.

  Then confirm nothing else already claims these names. Three exact-match greps, one per rule, so a descendant selector in the same block cannot inflate a count (`.realm-mana-pips .realm-pip--on` is a *different* rule and must survive):

  ```bash
  grep -c '^\.realm-pip {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  grep -c '^\.realm-pip--on {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  grep -c '^\.realm-mana-pips {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  grep -c '^\.realm-mount-button {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  ```

  Expected output: `1`, `1`, `1`, `1`. If any prints `0`, the block went in indented — re-paste it flush-left. If any prints `2`, an earlier task already declared that rule: delete the copy from **this** block, and never delete `.realm-mana-pips .realm-pip--on`, which is the override that keeps mana blue while progress stays gold. **This task owns `.realm-pip` and `.realm-pip--on` for the whole slice** — the mana strip is the first pip row to ship, and the HUD's progress rows (task 11) and the villager plate (task 12) reuse these exact rules. Task 11 adds only the `.realm-pips` row wrapper and must not redeclare either.

- [ ] **Step 12: Commit the styling.**

  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns add src/app/globals.css
  ```
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns commit -m "style(realm): pin the mana strip above the bar and the mount button beside it" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 13: Retire the HUD's mana, cleared and ride cases, and write the one that proves they are gone.**

  In `src/components/realm/realm-hud.test.tsx`:

  a. Delete the whole `it("shows mana and the cleared count", …)` case and the whole `it("hides mana and the count in preview", …)` case — task 9 wrote them as `<RealmHud {...base} mana={42} cleared={3} />` and `<RealmHud {...base} minutesRemaining={null} preview={true} />` respectively. Delete whichever case renders `mana={42}`, and the preview case that asserts `queryByRole("progressbar")`.

  a2. Drop the three dead keys from task 9's shared `base` fixture at the top of the file, so it stops describing props `RealmHud` will not have after step 15. It becomes:

  ```tsx
  const base = {
    heroName: "Lily",
    minutesRemaining: 7 as number | null,
    preview: false,
    hudScale: 1,
    paused: false,
    recess: null,
  };
  ```

  (`preview` is a `boolean` — task 9 retyped it when it deleted both preview `<p>`s. Never write `preview={null}` after task 9.)

  b. Replace the whole `it("shows recess tallies and the ride button", …)` case with these two — the recess tallies still belong to `RealmHud` until task 11, only the ride half leaves:

  ```tsx
    it("shows recess tallies", () => {
      render(<RealmHud {...base} recess={{ gleams: 3, laps: 1, bestLapMs: 40_300, lapMs: 12_000 }} />);
      expect(screen.getByText("Gleams: 3")).toBeInTheDocument();
      expect(screen.getByText(/Laps: 1/)).toBeInTheDocument();
      expect(screen.getByText(/Best 40\.3 s/)).toBeInTheDocument();
      expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
    });

    it("carries no mana meter, no cleared count and no mount button — the shell owns those now", () => {
      render(<RealmHud {...base} />);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/Cleared/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Ride|Dismount/ })).not.toBeInTheDocument();
    });
  ```

  c. Check that steps a, a2 and b took every mention of the three dead props with them. In the file task 9 wrote, `mana=`, `cleared=` and `ride=` appear on `<RealmHud …>` elements in exactly the three cases you have just deleted or replaced (`mana={42} cleared={3}`, `mana={50} cleared={0} recess={…} ride={{…}}`, `mana={50} cleared={0} ride={{…}}`); every other `<RealmHud …>` took them from the shared `base` you trimmed in step a2. So nothing needs stripping — only verifying:

  ```bash
  grep -n "mana=\|cleared=\|ride=" /home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-hud.test.tsx
  ```

  Expected: the only hits are the `<RealmManaPips mana={…}>` and `<RealmMountButton ride={…}>` lines of the two new describes. If a `<RealmHud …>` line still shows one, delete that attribute by hand — do not touch the `RealmManaPips` / `RealmMountButton` lines, which own those prop names now.

- [ ] **Step 14: Run it and watch it fail.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: `carries no mana meter, no cleared count and no mount button` fails on its first assertion — `expect(element).not.toBeInTheDocument()` for the `progressbar` role — because `mana` is now `undefined` rather than `null`, and `mana !== null` still renders the meter (with `Cleared: ` beside it). The `Ride` assertion already passes.

- [ ] **Step 15: Delete mana, cleared and ride from RealmHud, and their dead CSS.**

  In `src/components/realm/realm-hud.tsx`, make five deletions. Each is anchored to its exact text, because task 9 has already moved the line numbers:

  From the destructured parameter list, delete the three lines:
  ```tsx
    mana,
    cleared,
    ride,
  ```
  From the prop type, delete the three lines:
  ```tsx
    mana: number | null;
    cleared: number | null;
    ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null;
  ```
  From the row, delete the mana meter and the cleared chip:
  ```tsx
          {mana !== null && (
            <span className="realm-hud-mana" role="progressbar" aria-label="Mana" aria-valuemin={0} aria-valuemax={MANA_MAX} aria-valuenow={Math.round(mana)}>
              <span className="realm-hud-mana-fill" style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
              <span className="realm-hud-mana-text">Mana {Math.round(mana)}</span>
            </span>
          )}
          {cleared !== null && <span className="realm-hud-cleared">Cleared: {cleared}</span>}
  ```
  and the ride button:
  ```tsx
          {ride && (
            <Button size="sm" variant="outline" className="realm-hud-ride" disabled={ride.disabled} onClick={ride.onToggle}>
              {ride.riding ? "Dismount" : "Ride"}
            </Button>
          )}
  ```

  `MANA_MAX` stays imported — `RealmManaPips` in the same file reads it. `Button` stays imported — Skip and `?` still use it. `.realm-hud-cleared` stays in the stylesheet: the recess tallies still use that class until task 11.

  In `src/app/globals.css`, delete these five now-dead rules (lines 1755-1757 and 1759-1760 before task 9's edits):

  ```css
  .realm-hud-mana { position: relative; display: inline-block; min-width: 7rem; height: 1.3em; border-radius: 9999px; overflow: hidden; background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(59, 130, 246, 0.6); }
  .realm-hud-mana-fill { position: absolute; inset: 0 auto 0 0; background: rgba(59, 130, 246, 0.6); }
  .realm-hud-mana-text { position: relative; padding: 0 0.6rem; font-size: 0.8em; line-height: 1.3em; }
  ```
  ```css
  .realm-hud-ride { min-height: 44px; min-width: 44px; }
  .realm-hud .realm-hud-ride { font-size: 0.9em; }
  ```

- [ ] **Step 16: Run the HUD test and watch it pass.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx
  ```

  Expected: the whole file passes. `src/components/realm/realm-shell.test.tsx` is red from here until step 19 — the shell is still handing `RealmHud` three props it no longer has — and that is the point of the next step. Do not commit yet.

- [ ] **Step 17: Write the failing shell tests.**

  In `src/components/realm/realm-shell.test.tsx`:

  a. Make sure the `bundle` fixture (line 95) carries the visit's depth. Check first:

  ```bash
  grep -c "depth:" /home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.test.tsx
  ```

  If that prints `0`, task 8 did not update this fixture — add the two fields by replacing `wornCrown: null, helpSeen: true }` at the end of line 95 with:

  ```tsx
  wornCrown: null, helpSeen: true, depthOverride: "auto" as const, depth: "full" as const };
  ```

  (`helpSeen: true` with `override: "auto"` is exactly what `realmDepth` turns into `"full"`, so the fixture stays internally honest.) If it prints `1` or more, task 8 already did this; leave it.

  b. Rename the mount button's accessible name everywhere it is asserted:

  ```bash
  sed -i 's/{ name: "Ride" }/{ name: "Ride your mount" }/g; s/{ name: "Dismount" }/{ name: "Get off your mount" }/g' /home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.test.tsx
  ```

  c. Replace the three `progressbar` assertions and delete the two `Cleared:` ones. **Anchor on the exact strings, not on line numbers** — task 9 has already edited this file above these lines and moved every one of them down.

  In `shows the spell bar for a hero, hides it while a panel is open, and never for a parent`, the pair

  ```tsx
      expect(screen.getByRole("progressbar", { name: "Mana" })).toBeInTheDocument();
      expect(screen.getByText("Cleared: 0")).toBeInTheDocument();
  ```
  becomes the single line

  ```tsx
      expect(screen.getByRole("img", { name: "Mana 100 of 100." })).toBeInTheDocument();
  ```

  In `selects a page, passes the resolved spell to the scene, and reflects scene events in the HUD`, the pair

  ```tsx
      expect(screen.getByRole("progressbar", { name: "Mana" })).toHaveAttribute("aria-valuenow", "61");
      expect(screen.getByText("Cleared: 1")).toBeInTheDocument();
  ```
  becomes

  ```tsx
      expect(screen.getByRole("img", { name: "Mana 61 of 100." })).toBeInTheDocument();
  ```

  In `keeps the scene's settings and layout referentially stable across mana regen re-renders`,

  ```tsx
      expect(screen.getByRole("progressbar", { name: "Mana" })).toHaveAttribute("aria-valuenow", "70");
  ```
  becomes

  ```tsx
      expect(screen.getByRole("img", { name: "Mana 70 of 100." })).toBeInTheDocument();
  ```

  Then confirm none is left:

  ```bash
  grep -n 'progressbar", { name: "Mana" }\|Cleared: ' /home/kylee/projects/kingdoms-and-crowns/src/components/realm/realm-shell.test.tsx
  ```

  Expected: no output.

  d. Add three cases inside the first `describe("RealmShell", …)`, straight after the closing `});` of the `keeps the scene's settings and layout referentially stable across mana regen re-renders` case, so they can use the `const pages = [{ id: "p0", slot: 1, elementId: "ember", … }]` constant declared near the middle of that describe block:

  ```tsx
    it("flashes the mana strip red for 600 ms when a cast is refused, and still says why", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
      });
      expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
      expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
      // The window is 600 ms of wall clock; nothing here is on a fake timer, so wait it out.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 650));
      });
      expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
    });

    it("says what a cleared trouble did without keeping a score of it", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
      });
      expect(screen.getByText("The fog thins.")).toBeInTheDocument();
      expect(screen.queryByText(/Cleared/)).not.toBeInTheDocument();
    });

    it("suppresses the mana strip for a parent and offers the mount button disabled", async () => {
      getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
      render(<RealmShell bundle={{ ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" } }} childId="c1" isChildView={false} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      expect(document.querySelector(".realm-mana-pips")).toBeNull();
      expect(screen.getByRole("button", { name: "Ride your mount" })).toBeDisabled();
    });
  ```

- [ ] **Step 18: Run it and watch it fail.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expected: many cases fail. The three new ones fail on `document.querySelector(".realm-mana-pips")` being `null` and on `Unable to find an accessible element with the role "button" and name "Ride your mount"`; the rewritten `Mana 100 of 100.` assertions fail the same way; the six mount-button cases fail on the renamed accessible name. Nothing renders the two new components yet.

- [ ] **Step 19: Wire the shell: the visit's depth, the surfaces, the refusal window, and both tenants.**

  In `src/components/realm/realm-shell.tsx`, six edits.

  a. Extend the HUD import (line 30) and add the depth import under it:

  ```tsx
  import { RealmHud, RealmManaPips, RealmMountButton } from "./realm-hud";
  import { surfacesFor } from "@/lib/realm/depth";
  ```

  b. Delete the `cleared` state (line 170):

  ```tsx
    const [cleared, setCleared] = useState(0);
  ```

  and add the visit's depth and the refusal window in its place, next to the other per-visit snapshots (after `const [seed] = useState(() => Date.now() >>> 0);`, line 174):

  ```tsx
    // The visit's complexity depth, snapshotted once (§3.1): a surface must never flip
    // mid-play. The server computed it from helpSeen + depthOverride; task 18 adds the
    // setter so the help card's "Show me everything" can raise it for this visit.
    const [depth] = useState(() => bundle.depth);
    // A refused cast paints the mana strip red for 600 ms. The counter is what makes a
    // second refusal restart the window rather than ride out the first one's timer.
    const refusals = useRef(0);
    const [refusedAt, setRefusedAt] = useState(0);
  ```

  c. Derive the surfaces once, immediately after the `settings` memo (line 213):

  ```tsx
    const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile]);
  ```

  d. Add the 600 ms window beside the toast and notice timers, after the notice effect (line 351):

  ```tsx
    // The refusal flash clears itself, exactly like the toast and the notice.
    useEffect(() => {
      if (!refusedAt) return;
      const id = setTimeout(() => setRefusedAt(0), 600);
      return () => clearTimeout(id);
    }, [refusedAt]);
  ```

  e. In `onSpellEvent` (lines 357-358), drop the score and raise the flash:

  ```tsx
        case "cleared": setNotice(TROUBLE_COPY[e.troubleKind][troubleSkin]); break;
        case "refused": refusals.current += 1; setRefusedAt(refusals.current); setNotice(NOT_ENOUGH_MANA); break;
  ```

  f. Delete these three props from the `<RealmHud …>` call (lines 530-531 and 534):

  ```tsx
          mana={isChildView ? mana : null}
          cleared={isChildView ? cleared : null}
  ```
  ```tsx
          ride={hudRide}
  ```

  and render both tenants as siblings of the spell bar — insert immediately after `<RealmHud … />`'s closing `/>` and before the `{settings.showStick && …}` line (547):

  ```tsx
        {/* Mana sits above the bar and Ride beside it, where slice 3's real bar will find
            them. `mana === null` is the single gate: a parent spends nothing, so a parent
            sees nothing. The mount button stays visible in preview and merely disabled. */}
        <RealmManaPips mana={isChildView ? mana : null} surfaces={surfaces} refused={refusedAt !== 0} />
        <RealmMountButton ride={hudRide} showStick={settings.showStick} />
  ```

- [ ] **Step 20: Run both suites and watch them pass.**

  ```bash
  npx vitest run src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.test.tsx
  ```

  Expected: both files green, the three new shell cases included. If `Mana 100 of 100.` is not found but `Mana 100 of 100` is, the aria-label lost its full stop — restore it; the string is verbatim from §3.7.

- [ ] **Step 21: Gate the whole change.**

  ```bash
  npm test
  ```
  Expected: green — no other suite renders `RealmHud` or asserts on `Cleared:`.
  ```bash
  npx tsc --noEmit
  ```
  Expected: no output. If it names a missing required prop on one of the `<RealmHud …>` calls in `realm-hud.test.tsx`, task 9 kept a prop this plan assumed it had removed — add it to those render calls and re-run.
  ```bash
  npx eslint src/components/realm/realm-hud.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expected: no output. (The one pre-existing repo lint error lives in `src/components/quest-template-list.tsx`, which this task does not touch.)

- [ ] **Step 22: Commit the HUD's two evictions and the shell's rewiring.**

  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns branch --show-current
  ```
  Expected output: `realm-foundations`.
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/app/globals.css
  ```
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns commit -m "refactor(realm): move mana and Ride out of the corner, and delete the cleared score" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 23: Write the failing test for the refused slot's shake.**

  §3.7 spells out both halves of a refusal: "the strip takes `.realm-mana-pips--refused` for 600 ms — under motion, a 3-cycle 4px horizontal shake on **the selected slot** and the pips flash red". Steps 11 and 19 built the pips half. This is the other half: the shake belongs on the ability-bar slot whose cost the hero could not pay, because that is what ties *cost* to *refusal*. `.realm-spell--refused` is this task's own class name, not a frozen one — it joins `.realm-spell--selected` and `.realm-spell--dim`, which already live on the same button.

  In `src/components/realm/spell-bar.test.tsx`, append this case inside `describe("SpellBar", …)`, immediately before the `});` that closes it:

  ```tsx
    it("marks only the selected slot refused, so the shake lands on the spell that cost too much", () => {
      render(<SpellBar pages={pages} selectedSlot={2} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={true} />);
      expect(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }).className).toContain("realm-spell--refused");
      expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).not.toContain("realm-spell--refused");
      cleanup();
      render(<SpellBar pages={pages} selectedSlot={2} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={false} />);
      expect(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }).className).not.toContain("realm-spell--refused");
      cleanup();
      // A refusal with nothing selected — Space aimed at a trouble with no page picked —
      // marks no slot at all; the pip strip still carries the red on its own.
      render(<SpellBar pages={pages} selectedSlot={null} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={true} />);
      expect(document.querySelectorAll(".realm-spell--refused")).toHaveLength(0);
    });
  ```

- [ ] **Step 24: Run it and watch it fail.**

  ```bash
  npx vitest run src/components/realm/spell-bar.test.tsx
  ```

  Expected: the new case fails on its first assertion — `expected 'realm-spell realm-spell--selected realm-spell--dim' to contain 'realm-spell--refused'`. Vitest strips types rather than checking them, so the unknown `refused` prop is simply ignored. The ten pre-existing `SpellBar` cases still pass.

- [ ] **Step 25: Mark the selected slot refused.**

  In `src/components/realm/spell-bar.tsx`, add the prop to the destructured list (after `raised,`) and to the type, and put the class on the button.

  The parameter list becomes:

  ```tsx
  export function SpellBar({
    pages,
    selectedSlot,
    mana,
    fewerChoices,
    onSelect,
    raised,
    hudScale,
    refused = false,
  }: {
    pages: SpellPageView[];
    selectedSlot: number | null;
    mana: number;
    fewerChoices: boolean;
    onSelect: (slot: number | null) => void;
    raised: boolean;
    hudScale: number;
    // True for the 600 ms after a cast the hero could not pay for (§3.7). It shakes the
    // slot that was selected — never the whole bar — so the cue points at the cost.
    refused?: boolean;
  }) {
  ```

  and the non-empty page's `className` (today `` `realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}` ``) becomes:

  ```tsx
              className={`realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}${selected && refused ? " realm-spell--refused" : ""}`}
  ```

  Nothing else in the file changes.

- [ ] **Step 26: Run it and watch it pass.**

  ```bash
  npx vitest run src/components/realm/spell-bar.test.tsx
  ```

  Expected: eleven passed.

- [ ] **Step 27: Write the failing shell test for the wiring, then wire it.**

  In `src/components/realm/realm-shell.test.tsx`, add this case immediately after the `flashes the mana strip red for 600 ms when a cast is refused, and still says why` case added in step 17d:

  ```tsx
    it("shakes the slot the hero actually picked, for the same 600 ms as the pips", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      const user = userEvent.setup();
      render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
      });
      expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).toContain("realm-spell--refused");
      expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
      // One window, one state: both cues clear together when `refusedAt` resets.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 650));
      });
      expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).not.toContain("realm-spell--refused");
      expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
    });
  ```

  Run it and watch it fail:

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx -t "shakes the slot the hero actually picked"
  ```

  Expected: `expected 'realm-spell realm-spell--selected' to contain 'realm-spell--refused'` — the shell does not pass `refused` yet.

  Then in `src/components/realm/realm-shell.tsx`, add the one prop to the `<SpellBar …>` call, beside `hudScale`:

  ```tsx
          <SpellBar
            pages={pages}
            selectedSlot={selectedSlot}
            mana={mana}
            fewerChoices={bundle.profile.fewerChoices}
            onSelect={onSelectSpell}
            raised={settings.showStick}
            hudScale={settings.hudScale}
            refused={refusedAt !== 0}
          />
  ```

  (`refusedAt` is the state step 19b added; the 600 ms timer in step 19d clears it, so the slot and the pips share one window and can never disagree.)

- [ ] **Step 28: Style the shake, with its reduced-motion substitute.**

  In `src/app/globals.css`, insert these rules immediately after the `.realm-spell--dim { opacity: 0.55; }` line (today line 1742), flush-left:

  ```css
  /* §3.7: a refused cast shakes the SELECTED slot — three cycles of 4px — while the pips
     flash red. The red is the cue and the shake is the decoration, so reduce-motion drops
     the shake and keeps the red (§6's motion table). The slot is not translated for any
     other reason, so this keyframe needs no centring transform, unlike the pip strip's. */
  .realm-spell--refused { animation: realm-slot-refused 200ms ease-in-out 3; }
  @keyframes realm-slot-refused {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  @media (prefers-reduced-motion: reduce) { .realm-spell--refused { animation: none; } }
  ```

  Check it landed exactly once:

  ```bash
  grep -c '^\.realm-spell--refused {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  ```

  Expected: `1`.

- [ ] **Step 29: Gate and commit the slot shake.**

  ```bash
  npx vitest run src/components/realm/spell-bar.test.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expected: both files green.
  ```bash
  npx tsc --noEmit
  ```
  Expected: no output.
  ```bash
  npx eslint src/components/realm/spell-bar.tsx src/components/realm/realm-shell.tsx src/components/realm/spell-bar.test.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expected: no output.
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns add src/components/realm/spell-bar.tsx src/components/realm/spell-bar.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/app/globals.css
  ```
  ```bash
  git -C /home/kylee/projects/kingdoms-and-crowns commit -m "fix(realm): shake the slot a refused cast could not pay for, not just the pips" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

**Browser check for task 21 (this task's share of the acceptance pass).** On the documented port-3100 `?preview` setup: the mana strip sits directly above the spell bar and stays there when the joystick is on (`--realm-bar-bottom: 9.5rem`); the mount button is a round 56px circle at the bottom-right, level with the bar, showing `M` only when the joystick is off; a refused cast turns the pips red and shakes both the strip and the selected ability-bar slot without throwing the strip off-centre, and with the OS's reduce-motion setting on it turns them red without moving either; a parent's preview shows no strip and a dimmed, unclickable mount button.

---

### Task 11: The HUD's three anchored zones, the identity plate, the objective card and the recess pill

**Files:**

- Modify: `src/lib/realm/recess/hud.ts` — append `recessPillText` after `hudRecessFor` (the file is 11 lines today)
- Modify: `src/lib/realm/recess/hud.test.ts` — append one `describe` block (22 lines today)
- Modify: `src/components/realm/realm-hud.tsx` — replace the import block and the whole `export function RealmHud(...)`. **`RealmManaPips` and `RealmMountButton` (added by task 10, below `RealmHud`) are not touched.**
- Modify: `src/components/realm/realm-hud.test.tsx` — full rewrite (181 lines today)
- Modify: `src/components/realm/realm-shell.tsx` — the `objective` / `objectiveIds` memos above the `layout` memo (today at :214), `kingdomDone` / `kingdomTotal` / `recessPill` beside `hudRecess` (today at :474), `riseToast` in `onDeedFinished` (today at :413), the `<RealmHud/>` call site (today at :517)
- Modify: `src/components/realm/realm-shell.test.tsx` — three new cases, the four recess assertions, one `within` scoping fix
- Modify: `src/app/globals.css` — the Realm block, today lines 1704–1711 plus `.realm-hud-cleared` at 1758

> **Line numbers have drifted and will drift again.** Tasks 9 and 10 edit `realm-hud.tsx`, `realm-shell.tsx`, `realm-shell.test.tsx` and `globals.css` before this task runs. Every edit below is anchored to an **exact string**, never to a line number. Use the anchors.

**Interfaces:**

*Consumes*
- `surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces`, `type Surfaces` — `@/lib/realm/depth` (task 1)
- `objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState`, `riseToast(label: string, next: ObjectiveState): string`, `type ObjectiveState`, `type Objective` — `@/lib/realm/objective` (task 2)
- `buildWorldLayout(input: { castleType; buildings; villagers?; banners?; decor?; objectiveIds? })` and `Prop.focus` / `VillagerPlacement.status` — `@/lib/realm/layout` (task 3)
- `--realm-hud-scale` on `.realm-root` (task 9); `.realm-messages button` exists (task 9)
- `const [depth] = useState(() => bundle.depth)` and `const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile])` in `RealmOpen` (task 10)
- Existing: `hudRecessFor`, `findBuilding` / `BUILDINGS` (`@/lib/utils/kingdom`), `SIDE_QUESTS_LOWER`, `GameIcon`, `VILLAGERS`

*Produces*
- `function recessPillText(gleams: number, laps: number): string` — `src/lib/realm/recess/hud.ts`
- `RealmHud` props **added**: `objective: ObjectiveState; surfaces: Surfaces; kingdomDone: number; kingdomTotal: number; recessPill: string | null`
- `RealmHud` props **removed**: `mana`, `cleared`, `notice`, `toast`, `calm`, `error`, `kingdomError`, `onKingdomRetry`, `ceremonyError`, `onCeremonyRetry`, `onRetry`, `warning`, `ride`, and `recess` (replaced by `recessPill`); `preview` narrows to `boolean`
- `RealmHud` props **kept**: `heroName`, `minutesRemaining`, `preview`, `hudScale`, `selector`, `paused`, `crown`, `ceremony`, `help`
- CSS: `.realm-hud-identity`, `.realm-hud-meta`, `.realm-hud-objective`, `.realm-pips`, `.realm-pip`, `.realm-pip--on` (frozen names), plus the helpers `.realm-hud-plate`, `.realm-hud-count`, `.realm-objective-title`, `.realm-objective-line`, `.realm-objective-extra`
- `layout.objectiveIds` fed from the shell's one `objectiveState` call; `RealmOpen`'s `objective` and `objectiveIds`, both referentially stable

---

- [ ] **Step 1: Write the failing test for `recessPillText`.**

Append to `src/lib/realm/recess/hud.test.ts` (keep the existing `hudRecessFor` describe block above it, and add `recessPillText` to the import on line 2):

```ts
import { describe, it, expect } from "vitest";
import { hudRecessFor, recessPillText } from "./hud";
```

```ts
describe("recessPillText", () => {
  it("reads as one line, with plurals that match the counts", () => {
    expect(recessPillText(0, 0)).toBe("Recess · 0 gleams · 0 laps");
    expect(recessPillText(1, 1)).toBe("Recess · 1 gleam · 1 lap");
    expect(recessPillText(12, 3)).toBe("Recess · 12 gleams · 3 laps");
  });

  it("never shows a negative or fractional tally", () => {
    expect(recessPillText(-2, 1.7)).toBe("Recess · 0 gleams · 1 lap");
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

```
npx vitest run src/lib/realm/recess/hud.test.ts
```

Expected: the four `hudRecessFor` cases pass; both new cases fail with `TypeError: recessPillText is not a function`.

- [ ] **Step 3: Write `recessPillText`.**

Append to `src/lib/realm/recess/hud.ts`, after `hudRecessFor`:

```ts
/**
 * The recess pill's one line. Best lap and the running lap are deliberately not here:
 * a best lap that resets when the child walks to the Spellbook is a lie, so slice 1
 * deletes it and slice 12 persists it and brings it back as a record (D6.4).
 */
export function recessPillText(gleams: number, laps: number): string {
  const g = Math.max(0, Math.floor(gleams));
  const l = Math.max(0, Math.floor(laps));
  return `Recess · ${g} ${g === 1 ? "gleam" : "gleams"} · ${l} ${l === 1 ? "lap" : "laps"}`;
}
```

- [ ] **Step 4: Run it and watch it pass.**

```
npx vitest run src/lib/realm/recess/hud.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit the pill text.**

```
git branch --show-current
```
```
git add src/lib/realm/recess/hud.ts src/lib/realm/recess/hud.test.ts
```
```
git commit -m "feat(realm): the recess pill's one line, gleams and laps only" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

(The branch must print `realm-foundations`. Several sessions share this checkout — check before every commit.)

- [ ] **Step 6: Rewrite `realm-hud.test.tsx` against the three zones.**

**Before you overwrite anything, save the current file, because task 10's two describes — `describe("RealmManaPips", …)` and `describe("RealmMountButton", …)` — must survive this rewrite.** They test components that still exist and still live in `realm-hud.tsx`; deleting them is a coverage regression, and step 6a below puts them back from the copy you take here. Everything they need (`render`, `screen`, `cleanup`, `fireEvent`, `vi`, and the `simple`/`full` surfaces) is declared in the new file too, so they go back in unchanged.

```
cp src/components/realm/realm-hud.test.tsx /tmp/realm-hud.test.prev.tsx
```

(If the file has already been overwritten, the same content is one command away: `git show HEAD:src/components/realm/realm-hud.test.tsx > /tmp/realm-hud.test.prev.tsx` — task 10 committed it.)

Replace the **whole file** `src/components/realm/realm-hud.test.tsx` with:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { RealmHud } from "./realm-hud";
import { surfacesFor } from "@/lib/realm/depth";
import type { ObjectiveState } from "@/lib/realm/objective";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

afterEach(cleanup);

const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);
const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);

const next: ObjectiveState = {
  kind: "next",
  objectives: [{ buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 2, total: 5 }],
};
const nextThree: ObjectiveState = {
  kind: "next",
  objectives: [
    { buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 2, total: 5 },
    { buildingId: "mill", villagerId: "tessa", label: "Grain Mill", villagerName: "Miller Tessa", done: 1, total: 5 },
    { buildingId: "bridge", villagerId: "aldo", label: "River Bridge", villagerName: "Carpenter Aldo", done: 0, total: 5 },
  ],
};

function hud(overrides: Partial<ComponentProps<typeof RealmHud>> = {}) {
  const props: ComponentProps<typeof RealmHud> = {
    heroName: "Lily",
    minutesRemaining: 7,
    preview: false,
    hudScale: 1,
    paused: false,
    objective: next,
    surfaces: full,
    kingdomDone: 3,
    kingdomTotal: 8,
    recessPill: null,
    ...overrides,
  };
  return render(<RealmHud {...props} />);
}

const zone = (name: string) => document.querySelector<HTMLElement>(name)!;

describe("RealmHud zones", () => {
  it("lays out three pass-through zones whose controls still accept pointers", () => {
    hud({ ceremony: { onSkip: () => {} }, help: { onOpen: () => {}, disabled: false } });
    expect(zone(".realm-hud-identity").style.pointerEvents).toBe("none");
    expect(zone(".realm-hud-objective").style.pointerEvents).toBe("none");
    expect(zone(".realm-hud-meta").style.pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: "Skip" }).style.pointerEvents).toBe("auto");
    expect(screen.getByRole("button", { name: "How to play" }).style.pointerEvents).toBe("auto");
    expect(screen.getByRole("link", { name: "Leave the Realm" }).style.pointerEvents).toBe("auto");
  });

  it("has no scoreboard left in the corner", () => {
    hud({ recessPill: "Recess · 3 gleams · 1 lap" });
    expect(screen.queryByRole("progressbar", { name: "Mana" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Laps:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ride" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismount" })).not.toBeInTheDocument();
    expect(screen.getByText("Recess · 3 gleams · 1 lap")).toBeInTheDocument();
  });
});

describe("RealmHud identity plate", () => {
  it("shows the hero's name and the kingdom line as pips at simple depth", () => {
    hud({ surfaces: simple });
    const identity = zone(".realm-hud-identity");
    expect(within(identity).getByText("Lily")).toBeInTheDocument();
    const row = within(identity).getByRole("img", { name: "3 of 8 buildings raised." });
    expect(row.querySelectorAll(".realm-pip")).toHaveLength(8);
    expect(row.querySelectorAll(".realm-pip--on")).toHaveLength(3);
    expect(within(identity).queryByText("3 of 8 raised")).not.toBeInTheDocument();
  });

  it("shows the kingdom line as numerals at full depth, with the same accessible name", () => {
    hud({ surfaces: full });
    const identity = zone(".realm-hud-identity");
    const row = within(identity).getByRole("img", { name: "3 of 8 buildings raised." });
    expect(row).toHaveTextContent("3 of 8 raised");
    expect(identity.querySelectorAll(".realm-pip")).toHaveLength(0);
  });

  it("drops the kingdom line rather than saying 0 of 0 when the kingdom did not load", () => {
    hud({ kingdomDone: 0, kingdomTotal: 0, objective: { kind: "unknown" } });
    expect(screen.getByText("Lily")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /buildings raised\./ })).not.toBeInTheDocument();
  });
});

describe("RealmHud objective card", () => {
  it("names the next building, its villager and the side-quest progress", () => {
    hud({ surfaces: full });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Village Well")).toBeInTheDocument();
    expect(within(card).getByText("Old Bram is waiting.")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "2 of 5 side quests done." })).toHaveTextContent("2 of 5");
    expect(within(card).queryByText(/deed/i)).not.toBeInTheDocument();
  });

  it("keeps the progress row's accessible name numeric at simple depth, where it is pips", () => {
    hud({ surfaces: simple });
    const card = screen.getByRole("region", { name: "What to do next" });
    const row = within(card).getByRole("img", { name: "2 of 5 side quests done." });
    expect(row.querySelectorAll(".realm-pip")).toHaveLength(5);
    expect(row.querySelectorAll(".realm-pip--on")).toHaveLength(2);
    expect(row).not.toHaveTextContent("2 of 5");
  });

  it("tracks the extra objectives at full depth", () => {
    hud({ surfaces: full, objective: nextThree });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Grain Mill · 1 of 5")).toBeInTheDocument();
    expect(within(card).getByText("River Bridge · 0 of 5")).toBeInTheDocument();
  });

  it("says the kingdom stands when every building is raised", () => {
    hud({ objective: { kind: "complete" } });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Every building is raised.")).toBeInTheDocument();
    expect(within(card).getByText("Nothing is waiting. Walk where you like.")).toBeInTheDocument();
    expect(card.querySelectorAll(".realm-pips")).toHaveLength(0);
  });

  it("renders no card at all when the kingdom did not load", () => {
    hud({ objective: { kind: "unknown" } });
    expect(screen.queryByRole("region", { name: "What to do next" })).not.toBeInTheDocument();
    expect(screen.queryByText("Every building is raised.")).not.toBeInTheDocument();
  });
});

describe("RealmHud meta zone", () => {
  it("counts the minutes and marks them paused", () => {
    hud({ minutesRemaining: 7, paused: true });
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
  });

  it("hides the counter for a parent and tells them whose grounds these are, always in numbers", () => {
    hud({ preview: true, minutesRemaining: null, surfaces: simple, selector: <span>picker</span> });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Old Bram is waiting for Lily.")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "2 of 5 side quests done." })).toHaveTextContent("2 of 5");
    expect(document.querySelectorAll(".realm-pip")).toHaveLength(0);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("picker")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });

  it("shows the selector only in the preview HUD", () => {
    hud({ selector: <span>picker</span> });
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });

  it("keeps the crown badge, Skip, the help button and the Tavern link", () => {
    const onSkip = vi.fn();
    const onOpen = vi.fn();
    hud({ crown: { label: "Copper Circlet", color: "#b87333" }, ceremony: { onSkip }, help: { onOpen, disabled: false } });
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
    const helpButton = screen.getByRole("button", { name: "How to play" });
    expect(helpButton.className).toContain("realm-hud-help");
    fireEvent.click(helpButton);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });

  it("disables the help button while a panel is open", () => {
    hud({ help: { onOpen: () => {}, disabled: true } });
    expect(screen.getByRole("button", { name: "How to play" })).toBeDisabled();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    hud({ preview: true, minutesRemaining: null, selector: <span>picker</span> });
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });
});
```

- [ ] **Step 6a: Paste task 10's two describes back at the end of the file.**

`RealmManaPips` and `RealmMountButton` still live in `realm-hud.tsx` and are unchanged by this task, so their tests must survive its rewrite. Copy the two blocks out of `/tmp/realm-hud.test.prev.tsx` — `describe("RealmManaPips", …)` (4 cases) and `describe("RealmMountButton", …)` (3 cases) — and append them verbatim after the closing `});` of `describe("RealmHud meta zone", …)`. Do not bring the `const simple = …` / `const full = …` lines that sit above them in the old file; the new file already declares both.

```
sed -n '/^describe("RealmManaPips"/,$p' /tmp/realm-hud.test.prev.tsx >> src/components/realm/realm-hud.test.tsx
```

(That range is exactly the two describes: task 10 appended `RealmManaPips` and then `RealmMountButton` to the end of the file, and nothing follows them.)

Then confirm nothing was lost:

```
grep -c "^describe(" src/components/realm/realm-hud.test.tsx
```

Expected: `6` — the four `RealmHud …` describes written above plus `RealmManaPips` and `RealmMountButton`.

- [ ] **Step 7: Run it and watch it fail.**

```
npx vitest run src/components/realm/realm-hud.test.tsx
```

Expected: ten of the sixteen `RealmHud …` cases fail — the two `RealmHud zones` cases and the three `RealmHud identity plate` cases die on `TypeError: Cannot read properties of null (reading 'style')` (`.realm-hud-identity` does not exist), and the five `RealmHud objective card` cases die on `TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "What to do next"` (the sixth meta-zone case, `hides the counter for a parent…`, fails on the same card lookup). The remaining `RealmHud meta zone` cases — minutes, the crown, Skip, the help button, the Tavern link, the selector, the console-error guard — **already pass** against the post-task-10 `RealmHud`: `hud()` hands it unknown props (`objective`, `surfaces`, `kingdomDone`, `kingdomTotal`, `recessPill`), which vitest strips the types from and the component ignores at runtime. They are regression guards for this rewrite, not red-to-green drivers, so do not go looking for a sixteenth failure. The seven `RealmManaPips` / `RealmMountButton` cases restored in step 6a also still **pass** — this task does not touch those two components, and they are the proof that the rewrite did not take them with it.

- [ ] **Step 8: Rewrite `RealmHud`.**

This is the second time in the slice that `RealmHud`'s body is rewritten whole, and that is deliberate rather than churn: task 9 could only *subtract* (every message leaves), because its own gate is the full suite and the shell still rendered mana, `Cleared` and Ride at that point; task 10 evicted those three; and this task changes the shape — one wrapping flex row becomes three anchored zones with a card between them. There is no smaller edit that gets from a row to three zones, and no earlier task could have written the zones without the objective state task 2 and task 11 supply.

In `src/components/realm/realm-hud.tsx`, replace the import block at the top of the file and the whole `export function RealmHud(...) { ... }`. **Everything below `RealmHud` — `RealmManaPips` and `RealmMountButton`, added by task 10 — stays byte-for-byte as it is.** Keep any import those two still need (`MANA_MAX`, `Button`, `Surfaces`); `npx tsc --noEmit` in step 14 catches an omission. The `formatLap` import goes: the recess trio is deleted.

Import block:

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import type { Surfaces } from "@/lib/realm/depth";
import type { Objective, ObjectiveState } from "@/lib/realm/objective";
import { findBuilding } from "@/lib/utils/kingdom";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
```

(`ComponentProps` belongs to the **test** file's `hud()` helper, not to this one — do not import it here; an unused import is a lint error under `next/typescript`. `MANA_MAX` stays only because `RealmManaPips` below reads it; `RealmHud` itself no longer does. `formatLap` is dropped entirely.)

The component:

```tsx
/**
 * One progress row, in the one vocabulary the whole programme uses. Pips substitute for
 * numerals *on screen* at simple depth; the accessible name carries the count at BOTH
 * depths, because a pip is not a substitution for a screen reader (§6).
 */
function PipRow({ done, total, numerals, text, label }: { done: number; total: number; numerals: boolean; text: string; label: string }) {
  if (numerals) {
    return (
      <span className="realm-hud-count" role="img" aria-label={label}>
        {text}
      </span>
    );
  }
  return (
    <span className="realm-pips" role="img" aria-label={label}>
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <span key={i} className={i < done ? "realm-pip realm-pip--on" : "realm-pip"} />
      ))}
    </span>
  );
}

function ObjectiveRows({ objectives, heroName, preview, numerals }: { objectives: Objective[]; heroName: string; preview: boolean; numerals: boolean }) {
  const [first, ...rest] = objectives;
  if (!first) return null;
  return (
    <>
      <p className="realm-objective-title">
        <GameIcon name={findBuilding(first.buildingId)?.icon ?? "box"} className="size-4" /> {first.label}
      </p>
      {first.villagerName && (
        <p className="realm-objective-line">
          {preview ? `${first.villagerName} is waiting for ${heroName}.` : `${first.villagerName} is waiting.`}
        </p>
      )}
      <PipRow
        done={first.done}
        total={first.total}
        numerals={numerals}
        text={`${first.done} of ${first.total}`}
        label={`${first.done} of ${first.total} ${SIDE_QUESTS_LOWER} done.`}
      />
      {rest.map((o) => (
        <p key={o.buildingId} className="realm-objective-extra">{`${o.label} · ${o.done} of ${o.total}`}</p>
      ))}
    </>
  );
}

/** A suggestion, never a gate: nothing here can disable a Talk (§3.19). */
function ObjectiveCard({ objective, heroName, preview, numerals }: { objective: ObjectiveState; heroName: string; preview: boolean; numerals: boolean }) {
  // A kingdom that failed to load is not a finished kingdom. The card is simply absent and
  // the problem lane carries "The villagers are resting. Try again." instead (§5).
  if (objective.kind === "unknown") return null;
  return (
    <section className="realm-hud-objective realm-hud-plate" aria-label="What to do next" style={{ pointerEvents: "none" }}>
      {objective.kind === "complete" ? (
        // INTERIM COPY. True only until slice 8 makes clearing troubles pay minutes; from
        // then on "Nothing is waiting" is false. Slice 13 owns the final text
        // ("Your kingdom stands. Troubles still gather — clear them and earn more time
        // here.") and moves these two strings together with objective.ts's own.
        <>
          <p className="realm-objective-title">Every building is raised.</p>
          <p className="realm-objective-line">Nothing is waiting. Walk where you like.</p>
        </>
      ) : (
        <ObjectiveRows objectives={objective.objectives} heroName={heroName} preview={preview} numerals={numerals} />
      )}
    </section>
  );
}

export function RealmHud({
  heroName,
  minutesRemaining,
  preview,
  hudScale,
  selector,
  paused,
  objective,
  surfaces,
  kingdomDone,
  kingdomTotal,
  recessPill,
  crown = null,
  ceremony = null,
  help = null,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  preview: boolean; // the parent's view: the badge, the hero selector, and numbers everywhere
  hudScale: number;
  selector?: ReactNode;
  paused: boolean;
  objective: ObjectiveState;
  surfaces: Surfaces;
  kingdomDone: number;
  kingdomTotal: number;
  recessPill: string | null; // "Recess · 3 gleams · 1 lap", or null when recess has produced nothing
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  help?: { onOpen: () => void; disabled: boolean } | null;
}) {
  // A parent reads numbers, never pips (§3.17); a child reads what their depth says.
  const numerals = surfaces.numerals || preview;
  // Three zones, each pass-through. Only the buttons, the link and the selector take
  // pointers, so a pointerdown at top-centre reaches the ground mesh and walks the hero.
  // The values are inline as well as in CSS so a jsdom test can read them (D10.1).
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em`, pointerEvents: "none" }}>
      <div className="realm-hud-identity" style={{ pointerEvents: "none" }}>
        <div className="realm-hud-plate">
          <span className="realm-hud-name">{heroName}</span>
          {kingdomTotal > 0 && (
            <PipRow
              done={kingdomDone}
              total={kingdomTotal}
              numerals={numerals}
              text={`${kingdomDone} of ${kingdomTotal} raised`}
              label={`${kingdomDone} of ${kingdomTotal} buildings raised.`}
            />
          )}
        </div>
      </div>
      <ObjectiveCard objective={objective} heroName={heroName} preview={preview} numerals={numerals} />
      <div className="realm-hud-meta" style={{ pointerEvents: "none" }}>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        {crown && (
          <span className="realm-hud-badge realm-hud-crown" style={{ color: crown.color }}>
            <GameIcon name="crown" className="size-4" /> {crown.label}
          </span>
        )}
        {recessPill && <span className="realm-hud-badge">{recessPill}</span>}
        {ceremony && (
          <Button size="sm" variant="outline" className="realm-hud-skip" style={{ pointerEvents: "auto" }} onClick={ceremony.onSkip}>Skip</Button>
        )}
        {help && (
          <Button size="sm" variant="outline" className="realm-hud-help" aria-label="How to play" disabled={help.disabled} style={{ pointerEvents: "auto" }} onClick={help.onOpen}>?</Button>
        )}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&apos;s Realm</span>}
        {preview && <span className="realm-hud-selector" style={{ pointerEvents: "auto" }}>{selector}</span>}
        <Link href="/tavern" className="realm-hud-leave realm-hud-plate" style={{ pointerEvents: "auto" }}>Leave the Realm</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the HUD test and watch it pass.**

```
npx vitest run src/components/realm/realm-hud.test.tsx
```

Expected: 23 passed — the sixteen `RealmHud …` cases written in step 6 plus the seven `RealmManaPips` / `RealmMountButton` cases restored in step 6a. (`npm test` as a whole is still red — `realm-shell.tsx` passes the old props. Steps 10–13 fix that; do not commit yet.)

- [ ] **Step 10: Update `realm-shell.test.tsx` — the recess assertions, the `4 of 5` scoping, and the three new cases.**

**(a)** Add `within` to the Testing Library import and add two fixtures below the existing `const well = {...}` / `const bundle = {...}` block:

```tsx
import { render, screen, cleanup, act, waitFor, fireEvent, within } from "@testing-library/react";
```

```tsx
import { BUILDINGS } from "@/lib/utils/kingdom";
import { VILLAGERS } from "@/lib/realm/villagers";
```

```tsx
// A brand-new hero: all eight buildings at 0 of 5, each with one side quest to begin.
const newKingdom = BUILDINGS.map((b) => ({
  id: b.id, label: b.label, description: b.description, icon: b.icon,
  done: 0, total: b.deedsToBuild, complete: false,
  deeds: [{ id: `${b.id}-1`, title: `Help at the ${b.label}`, story: "There is work to do.", area: "math" as const }],
}));
// The same eight, every one of them raised.
const raisedKingdom = newKingdom.map((b) => ({ ...b, done: b.total, complete: true }));
```

If the `bundle` fixture does not already carry `depth` and `depthOverride` (tasks 8 and 10 add them to `RealmBundle`), add `depthOverride: "auto" as const, depth: "full" as const` to it now.

**(b)** In `it("opens the site card from a villager in reach, pauses the clock, and raises the building on completion")`, the objective card now also renders `4 of 5`. Scope the existing assertion to the panel:

```tsx
    expect(within(await screen.findByRole("dialog", { name: "Old Bram" })).getByText("4 of 5")).toBeInTheDocument();
```

replacing the pair of lines

```tsx
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("4 of 5")).toBeInTheDocument();
```

**(c)** In `it("turns recess on only for a hero whose access source is recess, with a toast")`, three replacements:

- `expect(screen.getByText("Gleams: 0")).toBeInTheDocument();` → `expect(screen.getByText("Recess · 0 gleams · 0 laps")).toBeInTheDocument();`
- `expect(screen.getByText("Gleams: 1")).toBeInTheDocument();` → `expect(screen.getByText("Recess · 1 gleam · 0 laps")).toBeInTheDocument();`
- the one occurrence of `expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();` (today at line 392, in the `source: "earned"` half of the same test) → `expect(screen.queryByText(/^Recess ·/)).not.toBeInTheDocument();`

**(d)** Replace the whole of `it("shows the running lap time while recess is active", ...)` with:

```tsx
  it("keeps the running lap and the best lap off the HUD, and counts finished laps in the pill", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lapTick", lapMs: 12_000 });
    });
    // D6.4: a best lap that resets on navigation is a lie, and the running clock is slice 12's.
    expect(screen.queryByText(/12\.0 s/)).not.toBeInTheDocument();
    expect(screen.getByText("Recess · 0 gleams · 0 laps")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lap", laps: 1, lapMs: 30_000, best: true });
    });
    expect(screen.getByText("Recess · 0 gleams · 1 lap")).toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
  });
```

**(e)** Append three cases to the main `describe("RealmShell", ...)` block:

```tsx
  it("marks the new hero's first site on the layout and names it on the objective card", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: newKingdom } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    const layout = sceneProps.layout as { props: { id: string; focus?: string }[]; villagers: { id: string; status: string }[] };
    // objectiveIds[0] is "well" for every brand-new hero: the opening is identical every time.
    expect(layout.props.find((p) => p.id === "well")!.focus).toBe("objective");
    expect(layout.villagers.find((v) => v.id === "bram")!.status).toBe("objective");
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Village Well")).toBeInTheDocument();
    expect(within(card).getByText("Old Bram is waiting.")).toBeInTheDocument();
  });

  it("folds the next objective into the rise toast, so two toasts never queue", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const user = userEvent.setup();
    const buildings = [well, ...newKingdom.filter((b) => b.id !== "well")];
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    await user.click(await screen.findByRole("button", { name: "Begin Count the Well Stones" }));
    await user.click(await screen.findByRole("button", { name: "finish" }));
    expect(await screen.findByText("The Village Well stands. Next: the Grain Mill, with Miller Tessa.")).toBeInTheDocument();
  });

  it("opens a site card for every villager, whatever the objective says", async () => {
    // §3.19: the objective card is a suggestion, never a gate.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    for (const buildings of [newKingdom, raisedKingdom]) {
      for (const depth of ["simple", "full"] as const) {
        for (const fewerChoices of [false, true]) {
          render(
            <RealmShell
              bundle={{ ...bundle, depth, kingdom: { tone: "gentle", buildings }, profile: { ...DEFAULT_LEARNING_PROFILE, fewerChoices } }}
              childId="c1"
              isChildView={true}
            />
          );
          expect(await screen.findByTestId("scene")).toBeInTheDocument();
          for (const v of VILLAGERS) {
            await act(async () => {
              (sceneProps.onTalk as (id: string) => void)(v.id);
            });
            const dialog = await screen.findByRole("dialog", { name: v.name });
            fireEvent.keyDown(dialog, { key: "Escape" });
          }
          cleanup();
        }
      }
    }
    // An unknown kingdom is the one closed door, and it is the pre-existing "no data for
    // this site yet" guard that closes it — not the objective, which renders no card at all.
    getRealmKingdom.mockResolvedValue({ tone: "gentle", buildings: newKingdom });
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What to do next" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wake the villagers" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "What to do next" })).toBeInTheDocument());
    for (const v of VILLAGERS) {
      await act(async () => {
        (sceneProps.onTalk as (id: string) => void)(v.id);
      });
      const dialog = await screen.findByRole("dialog", { name: v.name });
      fireEvent.keyDown(dialog, { key: "Escape" });
    }
  });
```

- [ ] **Step 11: Run the shell test and watch it fail.**

```
npx vitest run src/components/realm/realm-shell.test.tsx
```

Expected red: the recess cases fail with `Unable to find an element with the text: Recess · 0 gleams · 0 laps`; the three new cases fail with `Unable to find an accessible element with the role "region" and name "What to do next"` and `expected undefined to be "objective"`.

- [ ] **Step 12: Wire the shell — one objective, the layout, the pill, the toast.**

Four edits in `src/components/realm/realm-shell.tsx`.

**(a) Imports.** Add beside the existing realm imports:

```tsx
import { objectiveState, riseToast } from "@/lib/realm/objective";
```

and extend the existing recess-hud import:

```tsx
import { hudRecessFor, recessPillText } from "@/lib/realm/recess/hud";
```

**(b) The one objective state, above the layout.** Task 10 added `const [depth] = useState(() => bundle.depth)` and `const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile]);`. **They must sit above the `layout` memo** — `const` is not hoisted — so if task 10 placed them lower, move both up to immediately after

```tsx
  const settings = useMemo(() => renderSettingsFor(bundle.profile, isTouch), [bundle.profile, isTouch]);
```

Then, directly beneath them and above `const layout = useMemo(`, add:

```tsx
  // One objective state for the whole render: the card reads it and the layout marks its
  // sites from it, so the card and the world can never disagree about what to do next.
  const objective = useMemo(() => objectiveState(kingdom.buildings, surfaces.trackedObjectives), [kingdom.buildings, surfaces.trackedObjectives]);
  const objectiveIds = useMemo(() => (objective.kind === "next" ? objective.objectives.map((o) => o.buildingId) : []), [objective]);
```

and give the layout its new input — this is the only change to that memo:

```tsx
  const layout = useMemo(
    () => buildWorldLayout({ castleType: bundle.castleType, buildings: kingdom.buildings, villagers: !kingdomError, banners: bundle.banners, decor: !settings.calmPalette, objectiveIds }),
    [bundle.castleType, kingdom.buildings, kingdomError, bundle.banners, settings.calmPalette, objectiveIds]
  );
```

(`objectiveIds` is a `useMemo` over a `useMemo` over `kingdom.buildings`, so `layout` keeps its referential stability across the ~5 `setMana` re-renders a second — the existing "keeps the scene's settings and layout referentially stable" case proves it.)

**(c) The rise toast carries the next objective.** In `onDeedFinished`, replace

```tsx
      setToast(`The ${label} stands.`);
```

with

```tsx
      // One toast, not two queued: the rise and what comes next travel together (§3.18).
      setToast(riseToast(label, objectiveState(applied.state.buildings, 1)));
```

**(d) The pill and the kingdom line.** Replace

```tsx
  const hudRecess = isChildView ? hudRecessFor(recess, recessActive) : null;
```

with

```tsx
  const hudRecess = isChildView ? hudRecessFor(recess, recessActive) : null;
  // Gleams and laps collapse into one pill while recess runs; best lap is deleted (D6.4).
  const recessPill = hudRecess ? recessPillText(hudRecess.gleams, hudRecess.laps) : null;
  const kingdomDone = kingdom.buildings.filter((b) => b.complete).length;
  const kingdomTotal = kingdom.buildings.length; // 0 when the load failed: the plate drops the line
```

**(e) The call site.** Replace the whole `<RealmHud ... />` element with:

```tsx
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        preview={!isChildView}
        hudScale={settings.hudScale}
        selector={selector}
        paused={panelOpen || ceremonyRunning || helpOpen}
        objective={objective}
        surfaces={surfaces}
        kingdomDone={kingdomDone}
        kingdomTotal={kingdomTotal}
        recessPill={recessPill}
        crown={crown}
        ceremony={ceremonyStage === "running" ? { onSkip } : null}
        help={{ onOpen: openHelp, disabled: panelOpen || helpOpen }}
      />
```

Task 9 moved the preview intro (`You're looking at ${bundle.heroName}'s grounds. Spells, ${SIDE_QUESTS_LOWER} and recess are theirs to play.` plus `note`) into the problem lane's `MessageInput`, so the HUD no longer needs the object form of `preview`. If the `SIDE_QUESTS_LOWER` import in this file is now unused, task 9 already removed it; leave it alone either way and let `npm run lint` decide.

- [ ] **Step 13: Run all three suites and watch them pass.**

```
npx vitest run src/components/realm/realm-hud.test.tsx src/lib/realm/recess/hud.test.ts src/components/realm/realm-shell.test.tsx
```

Expected: 3 files, all green.

- [ ] **Step 14: Delete `globals.css:1705`, retire `.realm-hud-row`, and write the three zones.**

In `src/app/globals.css`, replace this exact block (today lines 1704–1711, immediately after `.realm-root:focus`):

```css
.realm-hud { position: absolute; top: 0.75rem; left: 0.75rem; right: 0.75rem; z-index: 20; pointer-events: none; color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; }
.realm-hud > * { pointer-events: auto; }
.realm-hud-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.realm-hud-row > * { pointer-events: auto; }
.realm-hud-name { font-weight: 700; }
.realm-hud-minutes, .realm-hud-badge { border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(201, 168, 76, 0.2); color: var(--gold-bright); font-size: 0.85em; }
.realm-hud-leave { margin-left: auto; color: var(--gold-bright); text-decoration: underline; font-size: 0.85em; }
.realm-hud-selector { display: contents; }
```

with:

```css
/* Three anchored zones. The HUD and all three zones are pass-through; a text-shadow floor
   keeps every bare-text element legible over grass, which the hero's name never had. */
.realm-hud { position: absolute; top: 0.75rem; left: 0.75rem; right: 0.75rem; z-index: 20; display: flex; align-items: flex-start; gap: 0.75rem; pointer-events: none; color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
.realm-hud button, .realm-hud a, .realm-hud-selector *, .realm-messages button { pointer-events: auto; }
.realm-hud-identity { flex: 1 1 0; min-width: 0; display: flex; font-size: calc(14px * var(--realm-hud-scale)); }
.realm-hud-objective { flex: 0 1 auto; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: min(16rem, 44vw); text-align: center; font-size: calc(14px * var(--realm-hud-scale)); }
.realm-hud-meta { flex: 1 1 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; font-size: calc(14px * var(--realm-hud-scale)); }
.realm-hud-plate { border-radius: 0.5rem; border: 1px solid var(--gold-border); background: rgba(0, 0, 0, 0.55); padding: 0.3rem 0.6rem; }
.realm-hud-identity .realm-hud-plate { display: flex; flex-direction: column; gap: 0.15rem; }
.realm-hud-name { font-weight: 700; }
.realm-hud-count { font-size: 0.85em; color: var(--gold-bright); }
.realm-objective-title { display: flex; align-items: center; justify-content: center; gap: 0.35rem; margin: 0; font-weight: 700; }
.realm-objective-line { margin: 0; font-size: 0.9em; }
.realm-objective-extra { margin: 0; font-size: 0.85em; opacity: 0.8; }
/* The pip ROW only. `.realm-pip` and `.realm-pip--on` were declared once by task 10, with
   the mana strip — the first pip row to ship — and are shared by the HUD's progress rows,
   the objective card and the villager plate. Do not redeclare them here: task 10's block
   sits later in the file and would win, so a second declaration is a silent no-op that
   reads like a rule. */
.realm-pips { display: inline-flex; align-items: center; gap: 0.18rem; }
.realm-hud-minutes, .realm-hud-badge { border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(201, 168, 76, 0.2); color: var(--gold-bright); font-size: 0.85em; }
.realm-hud-leave { display: inline-flex; align-items: center; min-height: 44px; color: var(--gold-bright); text-decoration: none; font-size: 0.85em; }
.realm-hud-selector { display: inline-flex; align-items: center; gap: 0.5rem; }
```

Then delete the now-unused rule (today line 1758) — the mana `Cleared` chip and the recess trio were its only users:

```css
.realm-hud-cleared { border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(74, 222, 128, 0.2); color: #bbf7d0; font-size: 0.85em; }
```

Leave `.realm-hud-note`, `.realm-hud-banner`, `.realm-hud-error`, `.realm-hud-toast`, `.realm-hud-notice` and `.realm-hud-mana*` alone (task 9's), and `.realm-hud-ride` alone (task 10's).

Check the deletion landed and nothing else references the retired names:

```
grep -rn "realm-hud-row\|realm-hud > \*\|realm-hud-cleared" src/
```

Expected: no output.

And check the pip rules are declared exactly once between this task and task 10 (paste the block above flush-left, with no leading indentation, or these `^` anchors match nothing):

```
grep -c '^\.realm-pip {' src/app/globals.css
grep -c '^\.realm-pip--on {' src/app/globals.css
grep -c '^\.realm-pips {' src/app/globals.css
```

Expected: `1`, `1`, `1`. If any prints `0`, the block went in indented — re-paste it flush-left. If either of the first two prints `2`, this task redeclared what task 10 already owns — delete the copy from the block above, never task 10's.

- [ ] **Step 15: Verify the whole suite, the types and the lint.**

```
npm test
```
Expected: all files green.

```
npm run typecheck
```
Expected: no output.

```
npm run lint
```
Expected: exactly one error, the pre-existing one in `src/components/quest-template-list.tsx`. Any other error is a regression from this task.

- [ ] **Step 16: Commit the HUD.**

```
git branch --show-current
```
```
git add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/app/globals.css
```
```
git commit -m "feat(realm): three anchored HUD zones, an identity plate and an objective card" -m "The single wrapping flex row becomes .realm-hud-identity / .realm-hud-objective / .realm-hud-meta, each pass-through with only its buttons, link and selector accepting pointers, so a tap at top-centre reaches the ground mesh; globals.css's .realm-hud > * { pointer-events: auto } is deleted and .realm-hud-row retired. The scoreboard goes with it: mana, Cleared, Gleams, Laps and Best lap leave the corner, gleams and laps collapsing into one recess pill (recessPillText) while recess runs. The identity plate carries the hero's name and the kingdom line as pips or numerals, and the objective card names what to do next for all three ObjectiveState kinds. The shell computes objectiveState once and feeds both the card and buildWorldLayout's objectiveIds, so the card and the world can never disagree, and the rise toast now folds in the next objective instead of queueing a second one." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 17: Confirm the commit is on the branch and the tree is clean.**

```
git status --short
```
Expected: no output (no stray files).

```
git log --oneline -1
```
Expected: the commit just written, on `realm-foundations`.

---

### Task 12: VillagerPlate — the name, the state and the marker, as pure DOM

The audit's finding is that `buildWorldLayout` already computes every villager's name and then throws it on the floor one filter before the screen. This task builds the thing that puts it back: one `<button>` plate carrying the badge, the name, the tag line and the pip row. It renders nothing yet — task 15 mounts it inside a drei `<Html>` in `realm-scene.tsx`. Because the `<Html>` wrapper stays in the scene, **this file imports no three and no drei**, which is exactly what makes every string of §3.10's copy unit-testable in jsdom.

**Files:**
- Create: `src/components/realm/villager-plate.tsx`
- Create (test): `src/components/realm/villager-plate.test.tsx`
- Modify: `src/app/globals.css` — lines 1718-1719 (`.realm-label` / `.realm-label-tag` adopt `--realm-hud-scale`), then the new `.realm-plate` block inserted immediately after line 1719

**Interfaces:**

*Consumes* (all must already exist on the branch when this task starts):
```ts
// src/lib/realm/layout.ts            — task 3
type VillagerStatus = "objective" | "work" | "built"
type VillagerPlacement = { id: string; buildingId: string; position: Vec2; status: VillagerStatus; label: string; done: number; total: number }

// src/lib/realm/markers.ts           — task 4
type MarkerKind = "quest" | "done" | null
function markerFor(status: VillagerStatus): MarkerKind      // objective→"quest", built→"done", work→null

// src/lib/realm/depth.ts             — task 1
type Surfaces = { numerals: boolean; /* …12 more fields… */ }
function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces   // test fixture only

// already in the codebase
function villagerById(id: string): Villager | null           // src/lib/realm/villagers.ts
const SIDE_QUESTS_LOWER = "side quests"                      // src/lib/utils/side-quest-copy.ts
const DEFAULT_LEARNING_PROFILE: LearningProfile              // src/lib/utils/learning-profile.ts  (test fixture only)
```

*Produces* (task 15 renders it; no other task changes its shape):
```tsx
<VillagerPlate
  villager={VillagerPlacement}
  surfaces={Surfaces}
  calm={boolean}          // settings.calmPalette
  motion={boolean}        // settings.motion
  onPick={(id: string) => void}
/>
```
CSS class names, frozen: `.realm-plate` `.realm-plate-name` `.realm-plate-tag` `.realm-plate-badge` `.realm-plate-badge--quest` `.realm-plate-badge--done`, plus the two locally-named state classes `.realm-plate-badge--bob` and `.realm-plate--outline` and the calm variant `.realm-plate--calm`.

The pip row uses the frozen `.realm-pips` / `.realm-pip` / `.realm-pip--on` class names. **Task 12 writes the markup and none of the CSS**: task 10 declared `.realm-pip` and `.realm-pip--on` with the mana strip (its step 11, the first pip row to ship), and task 11 declared `.realm-pips`, the row wrapper (its step 14). Between them all three rules already exist, with three callers — the mana strip, the HUD's progress rows and this plate. Add none of them here, and remove none of them in task 11. Nothing is visible in the browser in the gap, because no plate is mounted in the world until task 15, which lands after task 11.

---

- [ ] **Step 1: Write the failing test for the plate's copy, its marker, its pips and its tap.**

Create `src/components/realm/villager-plate.test.tsx` with exactly this:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { VillagerPlate } from "./villager-plate";
import { surfacesFor } from "@/lib/realm/depth";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import type { VillagerPlacement } from "@/lib/realm/layout";

afterEach(cleanup);

const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);

/** Old Bram at the Village Well, two side quests in. */
function bram(over: Partial<VillagerPlacement> = {}): VillagerPlacement {
  return { id: "bram", buildingId: "well", position: { x: -5, z: 9.5 }, status: "work", label: "Village Well", done: 2, total: 5, ...over };
}

describe("VillagerPlate", () => {
  it("names the objective villager with a gold, aria-hidden ! badge", () => {
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done. Waiting for you." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("!");
    expect(badge).toHaveClass("realm-plate-badge--quest");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("gives a working villager no badge", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." });
    expect(plate.querySelector(".realm-plate-badge")).toBeNull();
  });

  it("marks a built site with a dim check", () => {
    render(<VillagerPlate villager={bram({ status: "built", done: 5 })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, built." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("✓");
    expect(badge).toHaveClass("realm-plate-badge--done");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("swaps numerals for pips without changing the accessible count", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · 2 of 5")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
    cleanup();
    render(<VillagerPlate villager={bram()} surfaces={simple} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    const pips = screen.getByRole("img", { name: "2 of 5 side quests done." });
    expect(pips).toHaveClass("realm-pips");
    expect(pips.querySelectorAll(".realm-pip").length).toBe(5);
    expect(pips.querySelectorAll(".realm-pip--on").length).toBe(2);
  });

  it("reads Built at both depths", () => {
    const built = bram({ status: "built", done: 5 });
    render(<VillagerPlate villager={built} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    cleanup();
    render(<VillagerPlate villager={built} surfaces={simple} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });

  it("substitutes an outline for the bob when motion is off", () => {
    const objective = bram({ status: "objective" });
    render(<VillagerPlate villager={objective} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).not.toHaveClass("realm-plate--outline");
    cleanup();
    render(<VillagerPlate villager={objective} surfaces={full} calm={false} motion={false} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).not.toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--outline");
  });

  it("mutes the plate under a calm palette without dropping the badge", () => {
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} calm={true} motion={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--calm");
    expect(document.querySelector(".realm-plate-badge--quest")).toBeInTheDocument();
  });

  it("is a real button in the tab order and picks its villager", () => {
    const onPick = vi.fn();
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={onPick} />);
    const plate = screen.getByRole("button", { name: /^Old Bram\./ });
    expect(plate.tagName).toBe("BUTTON");
    expect(plate).toHaveAttribute("type", "button");
    expect(plate).not.toHaveAttribute("tabindex");
    expect(plate).not.toBeDisabled();
    fireEvent.click(plate);
    expect(onPick).toHaveBeenCalledWith("bram");
  });

  it("claims no progress when the kingdom's numbers never loaded", () => {
    render(<VillagerPlate villager={bram({ done: 0, total: 0 })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Old Bram. Village Well." })).toBeInTheDocument();
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail on the missing module.**

```
npx vitest run src/components/realm/villager-plate.test.tsx
```

Expect the whole file to fail to collect, with Vite reporting `Failed to resolve import "./villager-plate" from "src/components/realm/villager-plate.test.tsx"`. If instead it fails on `@/lib/realm/depth` or `@/lib/realm/markers`, tasks 1 and 4 have not landed on this branch — stop and land them first.

- [ ] **Step 3: Write the plate.**

Create `src/components/realm/villager-plate.tsx` with exactly this:

```tsx
"use client";

import { villagerById } from "@/lib/realm/villagers";
import { markerFor } from "@/lib/realm/markers";
import type { VillagerPlacement } from "@/lib/realm/layout";
import type { Surfaces } from "@/lib/realm/depth";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

/**
 * One villager's nameplate: who they are, which site they keep, and whether they
 * have work for you. `buildWorldLayout` has computed all three since the world was
 * first drawn; nothing rendered them.
 *
 * Plain DOM on purpose. The drei `<Html>` that anchors this over the sprite lives in
 * realm-scene.tsx, which is the only file in this layer allowed to import three — so
 * every string below is reachable from a jsdom test, and the camera being orthographic
 * means a DOM pill and a sprite are the same size at any distance anyway.
 */
export function VillagerPlate({
  villager,
  surfaces,
  calm,
  motion,
  onPick,
}: {
  villager: VillagerPlacement;
  surfaces: Surfaces;
  calm: boolean;
  motion: boolean;
  onPick: (id: string) => void;
}) {
  const name = villagerById(villager.id)?.name ?? villager.label;
  const marker = markerFor(villager.status);
  const built = villager.status === "built";
  // `total` is 0 only when the kingdom's progress never loaded. The plate then names the
  // person and the place and claims no progress at all, rather than inventing "0 of 0".
  const hasProgress = villager.total > 0;
  const progress = `${villager.done} of ${villager.total}`;
  // Pips substitute for numerals on screen, never in the accessible name (§6).
  const countName = `${progress} ${SIDE_QUESTS_LOWER} done.`;

  const tag = built
    ? `${villager.label} · Built`
    : hasProgress && surfaces.numerals
      ? `${villager.label} · ${progress}`
      : villager.label;

  const accessibleName = built
    ? `${name}. ${villager.label}, built.`
    : hasProgress
      ? `${name}. ${villager.label}, ${countName}${villager.status === "objective" ? " Waiting for you." : ""}`
      : `${name}. ${villager.label}.`;

  const showPips = !built && hasProgress && !surfaces.numerals;

  return (
    <button
      type="button"
      className={[
        "realm-plate",
        calm ? "realm-plate--calm" : "",
        // reducedMotion's substitute for the bobbing badge: the objective plate still
        // stands out, it just does it without moving.
        marker === "quest" && !motion ? "realm-plate--outline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={accessibleName}
      // The reach bubble does the same: a pointer that lands on a plate must never also
      // reach the canvas underneath and walk the hero somewhere vaguely nearby.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onPick(villager.id)}
    >
      <span className="realm-plate-name">
        {marker && (
          <span
            className={[
              "realm-plate-badge",
              marker === "quest" ? "realm-plate-badge--quest" : "realm-plate-badge--done",
              marker === "quest" && motion ? "realm-plate-badge--bob" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {marker === "quest" ? "!" : "✓"}
          </span>
        )}
        {name}
      </span>
      <span className="realm-plate-tag">{tag}</span>
      {showPips && (
        <span className="realm-pips" role="img" aria-label={countName}>
          {Array.from({ length: villager.total }, (_, i) => (
            <span key={i} className={i < villager.done ? "realm-pip realm-pip--on" : "realm-pip"} />
          ))}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run the test and watch all nine cases pass.**

```
npx vitest run src/components/realm/villager-plate.test.tsx
```

Expect `Test Files 1 passed (1)` and `Tests 9 passed (9)`.

- [ ] **Step 5: Give the plate its CSS, and close the largerText hole for the world's existing labels.**

In `src/app/globals.css`, replace lines 1718-1719 — currently exactly:

```css
.realm-label { white-space: nowrap; border-radius: 9999px; padding: 0.1rem 0.5rem; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 11px; pointer-events: none; }
.realm-label-tag { display: block; font-size: 10px; color: var(--gold-bright); }
```

with this block (the two edited rules, then the new plate rules):

```css
/* `--realm-hud-scale` is set once on `.realm-root` from settings.hudScale. It is what
   closes the largerText hole the audit found: globals.css:244's `zoom` rule is scoped to
   `.realm-panel`, so a hero who needs larger text got a 1.25x HUD and an unchanged 11px
   world. The `, 1` fallback keeps a plate legible when it is rendered outside
   `.realm-root` — a unit test, or any harness that mounts it on its own. */
.realm-label { white-space: nowrap; border-radius: 9999px; padding: 0.1rem 0.5rem; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: calc(11px * var(--realm-hud-scale, 1)); pointer-events: none; }
.realm-label-tag { display: block; font-size: calc(10px * var(--realm-hud-scale, 1)); color: var(--gold-bright); }
.realm-plate { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; min-height: 44px; white-space: nowrap; border-radius: 0.5rem; border: 1px solid var(--gold-border); padding: 0.25rem 0.5rem; background: rgba(0, 0, 0, 0.55); color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; text-align: center; pointer-events: auto; cursor: pointer; }
.realm-plate-name { display: flex; align-items: center; gap: 0.3rem; font-weight: 700; font-size: calc(13px * var(--realm-hud-scale, 1)); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
.realm-plate-tag { font-size: calc(11px * var(--realm-hud-scale, 1)); color: var(--gold-bright); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
.realm-plate-badge { display: inline-flex; align-items: center; justify-content: center; width: calc(14px * var(--realm-hud-scale, 1)); height: calc(14px * var(--realm-hud-scale, 1)); border-radius: 9999px; font-size: calc(11px * var(--realm-hud-scale, 1)); font-weight: 700; line-height: 1; }
.realm-plate-badge--quest { background: rgba(201, 168, 76, 0.35); color: var(--gold-bright); }
.realm-plate-badge--done { background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
/* 2 Hz, 3px: the objective villager's `!` is the one thing on a plate that moves. */
@keyframes realm-plate-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.realm-plate-badge--bob { animation: realm-plate-bob 500ms ease-in-out infinite; }
/* The non-motion substitute, set by the component from the learning profile. */
.realm-plate--outline { outline: 1px solid var(--gold-bright); outline-offset: 1px; }
/* And the same substitute again for an OS-level preference the profile never saw. */
@media (prefers-reduced-motion: reduce) {
  .realm-plate-badge--bob { animation: none; }
  .realm-plate:has(.realm-plate-badge--bob) { outline: 1px solid var(--gold-bright); outline-offset: 1px; }
}
/* lowStimulus mutes, never empties: the plate loses its gold border and darkens, the
   badge drops to muted gold, and every mark is still there. */
.realm-plate--calm { border-color: transparent; background: rgba(0, 0, 0, 0.7); }
.realm-plate--calm .realm-plate-tag { color: #cbbf9a; }
.realm-plate--calm .realm-plate-badge--quest { background: rgba(138, 125, 90, 0.35); color: #8a7d5a; }
```

Leave `.realm-pips` / `.realm-pip` / `.realm-pip--on` alone — task 10's step 11 already declared `.realm-pip` and `.realm-pip--on`, and task 11's step 14 already declared `.realm-pips`. All three exist before this task runs, and a fourth declaration here would sit later in the file and silently win. No plate is mounted in the world until task 15, so nothing is unstyled on screen in between.

- [ ] **Step 6: Verify the whole branch — typecheck, lint, full suite.**

`globals.css` is not unit-testable (jsdom never parses it), so its gate is lint plus a named browser check.

```
npm run typecheck
npx eslint src/components/realm/villager-plate.tsx src/components/realm/villager-plate.test.tsx src/app/globals.css
npm test
```

Expect: `typecheck` clean; `eslint` clean for these three files; `npm test` fully green. `npm run lint` across the repo still reports exactly **one** pre-existing error in `src/components/quest-template-list.tsx`, which this branch never touched — any second error is a regression.

Browser-pass check this task feeds, run by task 21 on the port-3100 `?preview` setup: **check 3 — all eight nameplates are legible at the default zoom and at `largerText`**, and **check 8 — `reducedMotion` and `lowStimulus` both on: every mark is still present and nothing moves** (the `!` badge static with its gold outline, the plate muted, the `✓` still there). Neither can run until task 15 mounts the plate in the scene.

- [ ] **Step 7: Commit.**

```
git branch --show-current
```
Expect `realm-foundations`. Several sessions share this checkout — if it prints anything else, stop and fix the branch before committing.

```
git add src/components/realm/villager-plate.tsx
git add src/components/realm/villager-plate.test.tsx
git add src/app/globals.css
git commit -m "feat(realm): name every villager on a plate that carries their state" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The scene grows shadows and the hero grows a ring

**Files:**
- Modify: `src/components/realm/realm-scene.tsx` — line numbers are the branch head (`d880906`) before tasks 1–12 land; tasks 14–16 also edit this file, so **anchor every edit on the quoted text, not on the number**:
  - `:1-22` the import block (add the `markers` import, extended twice)
  - `:50-54` the module constants (`SPRITE_W` … `CALM_TINT`) — the three figure footprints go after them
  - `:56-58` `easeOut` — `ContactShadow` goes after it
  - `:86-90` the ref block inside `World` (`ceremonyRef`, `villagerSprites`) — the four new refs go after it
  - `:176-199` the per-frame hero/companion block — the ring and the three figure shadows are written here, from `p` and `c`, never from `bob`
  - `:229-234` the derived render consts (`ground`, `sky`, `colorFor`, `reachVillager`, `reachPlacement`, `tint`) — `ringColor` goes after `tint`
  - `:270` the path decal `y` literal `0.03`, `:279` the foundation decal `y` literal `0.04`
  - `:291-326` the `standing.map` block — prop shadows go inside both branches
  - `:375-387` the mount / hero / companion sprites at the tail — the shadow groups and the ring group go here
- Modify: `src/components/realm/recess-layer.tsx:43` — the lap-waypoint `y` literal `0.05`
- Test: **none new.** `realm-scene.tsx` and `recess-layer.tsx` import three; Vitest runs in jsdom with no WebGL, and `realm-shell.test.tsx:15` mocks `./realm-scene` precisely so nothing loads three. The verification for every code step in this task is `npx tsc --noEmit` + `npx eslint <the files touched>` + a full `npx vitest run` that must not move, followed by browser-pass checks 1, 2 and 8 (partial) in steps 17–19.

**Interfaces:**

*Consumes* (all from task 4, `src/lib/realm/markers.ts`):
```ts
function facingAngle(facing: Facing): number                                  // n:0  e:-PI/2  s:PI  w:PI/2
function shadowFootprint(size: { w: number; d: number }): { w: number; d: number }
const RING_INNER: 0.42, RING_OUTER: 0.55, RING_NOTCH_ARC: number /* Math.PI/3 */
const RING_GOLD: "#c9a84c", RING_CALM: "#8a7d5a"
const SHADOW_OPACITY: 0.22, SHADOW_OPACITY_CALM: 0.14
const GROUND_Y: { water: 0.02; path: 0.03; foundation: 0.04; propShadow: 0.045; lapWaypoint: 0.05; figureShadow: 0.055; heroRing: 0.06 }
```
Also consumes, already in the file: `settings.calmPalette` and `settings.motion` (`RenderSettings`), `hero.current.position` / `hero.current.facing` (`HeroState`), `companion.current.position`, `riding`, `layout.spawn`, `prop.size`.

*Produces* (task 15 and task 16 rely on these exact names):
```tsx
function ContactShadow({ w, d, y, calm }: { w: number; d: number; y: number; calm: boolean }): JSX.Element
// a local component in realm-scene.tsx; a child of the thing it belongs to, positioned at local [0, y, 0]
const HERO_SHADOW: { w: number; d: number }       // shadowFootprint({ w: 0.8, d: 0.8 }) — task 15 reuses these numbers for villagers
const MOUNT_SHADOW: { w: number; d: number }      // shadowFootprint({ w: 1.1, d: 1.1 })
const COMPANION_SHADOW: { w: number; d: number }  // shadowFootprint({ w: 0.6, d: 0.6 })
const ringColor: string                            // settings.calmPalette ? RING_CALM : RING_GOLD — task 16's beacon reuses it
heroRing / heroShadow / mountShadow / companionShadow: RefObject<THREE.Group | null>
```
Ground decals in `realm-scene.tsx` and `recess-layer.tsx` carry **no** `y` literals after this task: `GROUND_Y.path`, `GROUND_Y.foundation`, `GROUND_Y.lapWaypoint`, `GROUND_Y.propShadow`, `GROUND_Y.figureShadow`, `GROUND_Y.heroRing`.

---

- [ ] **Step 1: Take the path and foundation decals from the GROUND_Y ladder**

  The ladder exists (task 4) and the global rule is that no file writes a `y` literal for a ground decal. These two are identity swaps — `GROUND_Y.path` **is** `0.03` and `GROUND_Y.foundation` **is** `0.04` — so nothing moves a pixel; they make the rule true in the file the rest of this task fills with decals.

  In `src/components/realm/realm-scene.tsx`, add the import immediately after the `camera` import:

  ```ts
  import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
  import { GROUND_Y } from "@/lib/realm/markers";
  ```

  Replace the path decal's `y` (the `layout.props.filter((p) => p.kind === "path")` block):

  ```tsx
        <mesh key={prop.id} position={[prop.position.x, GROUND_Y.path, prop.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
  ```

  and the foundation plane's `y` (inside the `kind === "foundation"` block):

  ```tsx
              <mesh position={[0, GROUND_Y.foundation, 0]} rotation={[-Math.PI / 2, 0, 0]}>
  ```

- [ ] **Step 2: Take the lap waypoint from the same ladder**

  `recess-layer.tsx:43` is the third rung the ladder documents. In `src/components/realm/recess-layer.tsx`, add to the imports:

  ```ts
  import { GLEAM_COUNT, LAP_START, LAP_WAYPOINTS } from "@/lib/realm/recess/recess";
  import { GROUND_Y } from "@/lib/realm/markers";
  ```

  and replace the waypoint disc's `y`:

  ```tsx
            <mesh key={`w${i}`} position={[w.x, GROUND_Y.lapWaypoint, w.z]} rotation={[-Math.PI / 2, 0, 0]}>
  ```

- [ ] **Step 3: Verify the ladder swap changes nothing**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx src/components/realm/recess-layer.tsx
  npx vitest run
  ```

  Expected: `tsc` prints nothing and exits 0. `eslint` prints nothing and exits 0. `vitest` reports the same file and test counts as the run before this task (at branch head `d880906` that was `98 passed (98)` files / `867 passed (867)` tests; tasks 1–12 add more — the number must not *drop*, and no test may fail).

- [ ] **Step 4: Commit the ladder adoption**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git status --short
  git add src/components/realm/realm-scene.tsx src/components/realm/recess-layer.tsx
  git commit -m "refactor(realm): take every existing ground decal's y from the GROUND_Y ladder" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  (`git status --short` first: this worktree is shared between sessions — confirm the branch is `realm-foundations` and that only these two files are staged.)

- [ ] **Step 5: Add the ContactShadow component and the three figure footprints**

  In `src/components/realm/realm-scene.tsx`, extend the markers import:

  ```ts
  import { GROUND_Y, shadowFootprint, SHADOW_OPACITY, SHADOW_OPACITY_CALM } from "@/lib/realm/markers";
  ```

  Add the three footprints after `CALM_TINT` (they are module constants because `shadowFootprint` is pure and the values never change):

  ```ts
  const CALM_TINT = "#a9aaa4";
  // §3.4's footprint table, every entry put through the one shared transform so
  // the whole programme's shadows keep the same shape rule. Task 15 gives each
  // villager the hero's 0.8 × 0.8.
  const HERO_SHADOW = shadowFootprint({ w: 0.8, d: 0.8 });
  const MOUNT_SHADOW = shadowFootprint({ w: 1.1, d: 1.1 });
  const COMPANION_SHADOW = shadowFootprint({ w: 0.6, d: 0.6 });
  ```

  and add the component immediately after `easeOut`:

  ```tsx
  function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  /**
   * The flat diamond a figure or a prop drops on the ground: a 4-segment circle
   * is an axis-aligned diamond, scaled to the footprint so a building's shadow is
   * its plan and never a bar. It is a child of the thing it belongs to and sits at
   * a named rung of GROUND_Y — and it never takes `bob`, which is the one detail
   * that turns "floating" into "standing" (D1.3, D1.4).
   */
  function ContactShadow({ w, d, y, calm }: { w: number; d: number; y: number; calm: boolean }) {
    return (
      <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, d, 1]}>
        <circleGeometry args={[0.5, 4]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={calm ? SHADOW_OPACITY_CALM : SHADOW_OPACITY}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    );
  }
  ```

- [ ] **Step 6: Give every standing prop its footprint shadow**

  `standing` is the castle, the buildings, the decor and the barriers — the four kinds that stand up off the ground. Foundations get none (a foundation is already a flat plane on the ground) and banners get none (a 0.12-wide pole). Replace the whole `{standing.map((prop) => { … })}` block with:

  ```tsx
        {standing.map((prop) => {
          const texture = spriteFor(prop);
          const { w, h } = spriteSizeFor(prop);
          const shadow = shadowFootprint(prop.size);
          const register = (obj: THREE.Object3D | null) => {
            if (prop.kind !== "building") return;
            if (obj) {
              obj.userData.h = h;
              obj.userData.box = !texture;
              obj.userData.boxH = prop.size.h;
              buildingObjects.current.set(prop.id, obj);
            } else {
              buildingObjects.current.delete(prop.id);
            }
          };
          if (texture) {
            return (
              <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
                <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
                <sprite ref={register} position={[0, h / 2, 0]} scale={[w, h, 1]}>
                  <spriteMaterial map={texture} color={tint} transparent alphaTest={0.1} />
                </sprite>
                {prop.kind !== "decor" && <PropLabel prop={prop} y={h + 0.4} />}
              </group>
            );
          }
          if (prop.kind === "decor") return null; // a decor figure that failed to rasterise never falls back to a box
          // No texture for this prop (a barrier, or a figure that failed to draw): the slice 4 box.
          return (
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
              <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
              <mesh ref={register} position={[0, prop.size.h / 2, 0]}>
                <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
                <meshStandardMaterial color={colorFor(prop)} />
              </mesh>
              {prop.kind !== "barrier" && <PropLabel prop={prop} y={prop.size.h + 0.6} />}
            </group>
          );
        })}
  ```

  Two things this deliberately does **not** do: the shadow is not a child of the sprite (the rise tween at `:212-227` scales the sprite's `scale.y`, and a shadow underneath it must not stretch), and nothing here touches `register`, so the rise tween and `buildingObjects` are unchanged.

- [ ] **Step 7: Verify the prop shadows**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  npx vitest run
  ```

  Expected: `tsc` silent, exit 0 (`prop.size` is `{ w; d; h }` and `shadowFootprint` takes `{ w; d }` — a variable, not a fresh object literal, so there is no excess-property error). `eslint` silent, exit 0. `vitest`: no change in counts, nothing red.

- [ ] **Step 8: Commit the prop shadows**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git add src/components/realm/realm-scene.tsx
  git commit -m "feat(realm): drop a footprint shadow under every standing prop" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 9: Add the hero, mount and companion shadow groups**

  Each moving figure's shadow is a `<ContactShadow>` inside a `<group>` the frame loop moves, so the component keeps its four props and the shadow's `y` stays on the ladder while the group rides at `y = 0`.

  Add the three refs after `villagerSprites` in the ref block:

  ```ts
    const villagerSprites = useRef(new Map<string, THREE.Sprite>());
    const heroShadow = useRef<THREE.Group>(null);
    const mountShadow = useRef<THREE.Group>(null);
    const companionShadow = useRef<THREE.Group>(null);
  ```

  Then replace the tail of the returned fragment — the mount, hero and companion sprites — with:

  ```tsx
        {textures.mount && (
          <>
            <group ref={mountShadow} visible={false} position={[layout.spawn.x, 0, layout.spawn.z]}>
              <ContactShadow w={MOUNT_SHADOW.w} d={MOUNT_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
            </group>
            <sprite ref={mountSprite} visible={false} scale={[SPRITE_W, SPRITE_H, 1]}>
              <spriteMaterial map={textures.mount} transparent alphaTest={0.1} />
            </sprite>
          </>
        )}
        <group ref={heroShadow} position={[layout.spawn.x, 0, layout.spawn.z]}>
          <ContactShadow w={HERO_SHADOW.w} d={HERO_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
        </group>
        <sprite ref={heroSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
          <spriteMaterial map={textures.hero} transparent alphaTest={0.1} />
        </sprite>
        {textures.companion && (
          <>
            <group ref={companionShadow} position={[layout.spawn.x, 0, layout.spawn.z + 1.2]}>
              <ContactShadow w={COMPANION_SHADOW.w} d={COMPANION_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
            </group>
            <sprite ref={companionSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z + 1.2]} scale={[SPRITE_W, SPRITE_H, 1]}>
              <spriteMaterial map={textures.companion} transparent alphaTest={0.1} />
            </sprite>
          </>
        )}
  ```

- [ ] **Step 10: Write the three shadows per frame from the TRUE ground position**

  In `useFrame`, the hero's position is already in `p` and the companion's in `c`. Insert the hero and mount shadow writes immediately after the closing brace of the `if (heroSprite.current) { … }` block, and the companion's after the `if (companionSprite.current) { … }` block:

  ```tsx
      const c = companion.current.position;
  ```

  becomes

  ```tsx
      // The marks on the ground take the figure's TRUE position. `bob` is applied
      // to the sprites above and to nothing down here: the hero rises, the shadow
      // does not, which is the difference between a hero who stands and one who hops.
      if (heroShadow.current) {
        heroShadow.current.position.set(p.x, 0, p.z);
        heroShadow.current.visible = !riding; // the mount's wider shadow stands in for both while mounted
      }
      if (mountShadow.current) {
        mountShadow.current.visible = riding;
        mountShadow.current.position.set(p.x, 0, p.z);
      }
      const c = companion.current.position;
  ```

  and after the companion sprite block:

  ```tsx
      if (companionSprite.current) {
        companionSprite.current.position.set(c.x, SPRITE_H / 2 + bob * 0.5, c.z);
        companionSprite.current.scale.set(c.x > p.x ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
      }
      if (companionShadow.current) companionShadow.current.position.set(c.x, 0, c.z);
  ```

- [ ] **Step 11: Verify the figure shadows**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  npx vitest run
  ```

  Expected: all three silent/green, counts unchanged. In particular eslint must not report `react-hooks/set-state-in-effect` or a react-compiler diagnostic: these are ref writes inside `useFrame`, which is where every other per-frame write in this file already lives.

- [ ] **Step 12: Commit the figure shadows**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git add src/components/realm/realm-scene.tsx
  git commit -m "feat(realm): give the hero, the mount and the companion shadows that never bob" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 13: Add the notched gold ring and its arrowhead under the hero**

  Extend the markers import once more:

  ```ts
  import { facingAngle, GROUND_Y, shadowFootprint, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM } from "@/lib/realm/markers";
  ```

  Add the ring's ref beside the three shadow refs:

  ```ts
    const heroRing = useRef<THREE.Group>(null);
  ```

  Add the colour to the derived consts, right after `tint`:

  ```ts
    const tint = settings.calmPalette ? CALM_TINT : "#ffffff";
    const ringColor = settings.calmPalette ? RING_CALM : RING_GOLD; // lowStimulus mutes the mark, never removes it
  ```

  and render the ring immediately after the hero's shadow group (later in the fragment than the shadow, so a depth tie paints the ring over it). The initial `rotation` uses the literal `"s"` because that is the hero ref's initial facing and the React Compiler forbids reading a ref during render:

  ```tsx
        <group ref={heroShadow} position={[layout.spawn.x, 0, layout.spawn.z]}>
          <ContactShadow w={HERO_SHADOW.w} d={HERO_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
        </group>
        {/* The hero's own mark: a gold ring with a 60° gap in the direction they will walk,
            and a solid arrowhead filling that gap so the cue is a positive mark and not only a hole.
            After the -π/2 X rotation, local +Y is world north, so the group's local-Z rotation is facingAngle(). */}
        <group ref={heroRing} position={[layout.spawn.x, GROUND_Y.heroRing, layout.spawn.z]} rotation={[-Math.PI / 2, 0, facingAngle("s")]}>
          <mesh>
            <ringGeometry args={[RING_INNER, RING_OUTER, 32, 1, Math.PI / 2 + RING_NOTCH_ARC / 2, Math.PI * 2 - RING_NOTCH_ARC]} />
            <meshBasicMaterial color={ringColor} transparent depthWrite={false} />
          </mesh>
          <mesh position={[0, RING_OUTER + 0.06, 0]}>
            <circleGeometry args={[0.16, 3, Math.PI / 2]} />
            <meshBasicMaterial color={ringColor} transparent depthWrite={false} />
          </mesh>
        </group>
  ```

- [ ] **Step 14: Turn the ring with the hero, per frame, from the true position**

  In `useFrame`, directly after the `mountShadow` write added in step 10:

  ```tsx
      if (mountShadow.current) {
        mountShadow.current.visible = riding;
        mountShadow.current.position.set(p.x, 0, p.z);
      }
      if (heroRing.current) {
        heroRing.current.position.set(p.x, GROUND_Y.heroRing, p.z);
        heroRing.current.rotation.set(-Math.PI / 2, 0, facingAngle(hero.current.facing));
      }
  ```

  The ring stays visible while mounted — it is the hero's identity mark, not a state badge — and like the shadows it never sees `bob`.

- [ ] **Step 15: Verify the ring**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  npx vitest run
  ```

  Expected: all silent/green, counts unchanged. Then the whole-repo lint, whose one and only error must be the pre-existing one:

  ```bash
  npm run lint
  ```

  Expected: exactly one error, in `src/components/quest-template-list.tsx`, which this branch never touched. Any other error is a regression from this task.

- [ ] **Step 16: Commit the ring**

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  git add src/components/realm/realm-scene.tsx
  git commit -m "feat(realm): mark the hero with a notched gold ground ring that turns with them" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 17: Browser-pass check 1 — the ring is under the hero and its notch turns (four directions, four screenshots)**

  The scene cannot be unit-tested, so this is the proof. Setup, once, per the documented local screenshot recipe:

  ```bash
  SCRATCH=/tmp/realm-slice1-task13   # or this session's scratchpad directory
  mkdir -p "$SCRATCH/chrome-deps" "$SCRATCH/shots"
  cd "$SCRATCH/chrome-deps"
  apt-get download libnspr4 libnss3 libasound2t64
  for d in *.deb; do dpkg-deb -x "$d" .; done
  ss -ltnp | grep -E ':3[0-9]{3}'   # reuse this repo's dev server if one is up (check /proc/<pid>/cwd)
  cd /home/kylee/projects/kingdoms-and-crowns
  PORT=3100 npm run dev              # only if nothing is already serving this repo
  ```

  `/realm` opens straight into the world for a parent actor (`RealmShell` sets `phase: "open"` with no gate and no help card, and `DEMO_MODE=true` in `.env.local` bypasses auth), keyboard input is live in preview, and the play clock is disabled — so nothing is spent. Write the driver:

  ```bash
  cat > "$SCRATCH/check1-ring.mjs" <<'EOF'
  import { chromium } from "/home/kylee/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs";

  const PORT = process.env.PORT ?? "3100";
  const OUT = process.env.OUT ?? "/tmp/realm-slice1-task13/shots";
  // World→screen for the fixed (12,12,12) tabletop at zoom 40: one world unit
  // north is 28.3px right and 16.3px up; one unit east is 28.3px right, 16.3px down.
  const STEP = { n: [113, -65], s: [-113, 65], e: [113, 65], w: [-113, -65] };

  const browser = await chromium.launch({
    executablePath: "/home/kylee/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${PORT}/realm`, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(4000); // sprite rasterisation + the camera settling
  const cx = 640, cy = 400;        // the hero's ground point is the viewport centre: the camera looks at it

  for (const [dir, [dx, dy]] of Object.entries(STEP)) {
    await page.mouse.click(cx + dx, cy + dy); // a ground tap walks the hero and sets facing
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/check1-tap-${dir}.png`, clip: { x: cx - 160, y: cy - 160, width: 320, height: 260 } });
  }
  for (const key of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/check1-key-${key}.png`, clip: { x: cx - 160, y: cy - 160, width: 320, height: 260 } });
  }
  await browser.close();
  console.log("wrote", OUT);
  EOF
  LD_LIBRARY_PATH="$SCRATCH/chrome-deps/usr/lib/x86_64-linux-gnu" OUT="$SCRATCH/shots" PORT=3100 node "$SCRATCH/check1-ring.mjs"
  ```

  Open the eight PNGs. Expected, and what to record for task 21:
  - A gold (`#c9a84c`) ring sits on the ground at the hero's feet in every shot, roughly 31 px wide and 25 px tall, with the hero standing inside it.
  - `check1-tap-n/-s/-e/-w.png` show the gap **and the solid arrowhead** on four different sides — north up-and-right, east down-and-right, south down-and-left, west up-and-left. These four are the deliverable's "four screenshots, four directions".
  - `check1-key-*.png` are the spec's literal W/A/S/D wording. Expect only **two** distinct notch directions from keys: `screenToWorldAxis` turns every key into a perfect 45° world diagonal, so `facingFrom`'s `Math.abs(dx) >= Math.abs(dz)` tie always resolves east or west. That is pre-existing hero behaviour (`movement.ts`), not a fault in the ring, and the tap shots are the ones that prove rotation. Record it as a finding for slice 4's movement work; **do not** change `movement.ts` here.
  - If the canvas is blank, the page will read "The Realm needs a browser with 3D graphics." — the launch flags failed to give this Chromium WebGL; retry with `--use-gl=swiftshader` alone before concluding anything about the ring.

- [ ] **Step 18: Browser-pass check 2 — the shadow does not bob**

  ```bash
  cat > "$SCRATCH/check2-nobob.mjs" <<'EOF'
  import { chromium } from "/home/kylee/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs";

  const PORT = process.env.PORT ?? "3100";
  const OUT = process.env.OUT ?? "/tmp/realm-slice1-task13/shots";
  const browser = await chromium.launch({
    executablePath: "/home/kylee/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${PORT}/realm`, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(4000);
  const cx = 640, cy = 400;
  await page.mouse.click(cx - 113, cy + 65); // face south, so the companion stands north of the hero and out of the ground band
  await page.waitForTimeout(3000);           // arrive, and let the camera ease settle

  const ground = { x: cx - 26, y: cy + 2, width: 52, height: 18 };  // strictly below the ground point: ring + shadow, no sprite
  const body = { x: cx - 30, y: cy - 60, width: 60, height: 40 };   // the hero's torso, which bobs
  const g = [], b = [];
  for (let i = 0; i < 6; i++) {
    g.push(await page.screenshot({ clip: ground, path: `${OUT}/check2-ground-${i}.png` }));
    b.push(await page.screenshot({ clip: body, path: `${OUT}/check2-body-${i}.png` }));
    await page.waitForTimeout(500); // the bob is a 3 rad/s sine: 500 ms is ~86° of phase
  }
  const groundSame = g.every((buf) => buf.equals(g[0]));
  const bodyMoved = b.filter((buf) => !buf.equals(b[0])).length;
  console.log(`ground band identical across 6 frames: ${groundSame}`);
  console.log(`body band differed from frame 0 in ${bodyMoved} of 5 later frames`);
  console.log(groundSame && bodyMoved >= 3 ? "CHECK 2 PASS" : "CHECK 2 INCONCLUSIVE - inspect the PNGs");
  await browser.close();
  EOF
  LD_LIBRARY_PATH="$SCRATCH/chrome-deps/usr/lib/x86_64-linux-gnu" OUT="$SCRATCH/shots" PORT=3100 node "$SCRATCH/check2-nobob.mjs"
  ```

  Expected output: `ground band identical across 6 frames: true`, `body band differed from frame 0 in 4 or 5 of 5 later frames`, `CHECK 2 PASS`. That is 3 s of an idle hero at 2 Hz sampling, and it is the mechanical form of "the shadow's screen position is constant while the sprite's is not".

  If the ground band differs: open `check2-ground-*.png` and find what moved into the band — a roaming trouble figure from the spell sim (which steps even in preview) or the companion. Walk the hero to empty grass (`page.mouse.click` a few units away) and re-run before treating it as a failure. If the body band never differs, the hero is not bobbing — check that the child's learning profile has `reduced_motion = 0` and `low_stimulus = 0` (step 19 flips them; make sure they were restored).

- [ ] **Step 19: Browser-pass check 8 (partial) — reducedMotion and lowStimulus together**

  Flip both toggles for every local child, re-run, then put them back. There is no `sqlite3` binary here; drive the local file DB through the client the app already depends on:

  ```bash
  cd /home/kylee/projects/kingdoms-and-crowns
  node -e "const{createClient}=require('@libsql/client');const c=createClient({url:'file:local.db'});c.execute('update learning_profile set reduced_motion=1, low_stimulus=1').then(r=>console.log('rows',r.rowsAffected))"
  LD_LIBRARY_PATH="$SCRATCH/chrome-deps/usr/lib/x86_64-linux-gnu" OUT="$SCRATCH/shots" PORT=3100 node "$SCRATCH/check1-ring.mjs"
  cp "$SCRATCH/shots/check1-tap-s.png" "$SCRATCH/shots/check8-calm-tap-s.png"
  node -e "const{createClient}=require('@libsql/client');const c=createClient({url:'file:local.db'});c.execute('update learning_profile set reduced_motion=0, low_stimulus=0').then(r=>console.log('restored',r.rowsAffected))"
  ```

  Expected in `check8-calm-tap-s.png`, against `check1-tap-s.png`:
  - The ring and its arrowhead are still there, in muted gold `#8a7d5a` instead of `#c9a84c`. **Present, not absent** — lowStimulus mutes.
  - The hero, the companion and every standing prop still have a shadow, at opacity 0.14 instead of 0.22 (visibly fainter, never gone).
  - Nothing moves: `motion` is false, so the sprite does not bob, and the ring and the shadows never did.
  - Decor props are absent from the world entirely — that is the pre-existing `decor: !settings.calmPalette` at `realm-shell.tsx:215`, named in §6 and owned by slice 5. Their missing shadows are not a fault of this task.

  Confirm the restore landed before moving on:

  ```bash
  node -e "const{createClient}=require('@libsql/client');const c=createClient({url:'file:local.db'});c.execute('select reduced_motion, low_stimulus from learning_profile').then(r=>console.log(r.rows))"
  ```

  Expected: every row `{ reduced_motion: 0, low_stimulus: 0 }`.

- [ ] **Step 20: Hand the evidence to task 21 and confirm the tree is clean**

  ```bash
  ls -1 "$SCRATCH/shots"
  cd /home/kylee/projects/kingdoms-and-crowns
  git status --short
  git log --oneline -4
  ```

  Expected: ten or more PNGs in the scratchpad (four tap directions, four key presses, the calm pair, the twelve check-2 bands) — task 21 re-uses them as the before/after framing for its own pass; nothing in the repo's working tree (`git status --short` prints nothing — no screenshot, no script, no scratch file is committed); and four new commits on `realm-foundations`, in order: the ladder refactor, the prop shadows, the figure shadows, the ring.

  Record in the slice's acceptance notes, for task 21: (a) which of checks 1, 2 and 8 passed and with which screenshot; (b) that W/A/S/D yields only east/west facings because of the 45° tie in `screenToWorldAxis` + `facingFrom`; (c) whether the arrowhead is legible when the hero faces **north** — the ring's far arc projects up-screen behind the hero's own sprite, which is opaque at the feet, so the north notch may be partly occluded. Both are observations about existing geometry and existing movement code, not defects introduced here, and neither is fixed in this slice.

---

### Task 14: Tap the thing, do the thing — and the bubble shrinks

**Files:**
- Modify: `src/components/realm/realm-scene.tsx` — imports (line 5, line 11), `RealmSceneProps` (lines 24-48), the module constants (lines 50-54), the `World` destructure (line 71), the per-frame loop (lines 109-228), the foundation group (line 278), the standing-prop groups (lines 307 and 318), the villager sprites (lines 327-343), the reach bubble (lines 360-374)
- Modify: `src/components/realm/realm-shell.tsx` — the `<RealmScene>` call (lines 491-515; `onTalk={onTalk}` is line 499): one new prop `onVillagerPick={onTalk}`
- Modify: `src/app/globals.css` — lines 1720-1722 (`.realm-bubble`, `.realm-bubble-text`, `.realm-bubble-talk`)
- Test: `src/components/realm/realm-shell.test.tsx` — one new case, inserted immediately after the case named `"opens the site card from a villager in reach, pauses the clock, and raises the building on completion"` (that case ends at line 202 today)

> `realm-scene.tsx` imports three and cannot be unit-tested (Vitest runs in jsdom with no WebGL). The jsdom test below covers the one half that *is* testable — the shell's wiring — and the scene half is gated by `npx tsc --noEmit`, `npx eslint`, and **browser-pass check 5**, which task 21 runs.

**Interfaces:**

*Consumes (all exist today, unchanged by this slice):*
- `setTarget(state: HeroState, target: Vec2, colliders: Prop[]): HeroState` — `src/lib/realm/movement.ts:37`. Returns the state **unchanged** (same object identity) when the target is inside a collider.
- `nearestVillager(hero: Vec2, villagers: { id: string; position: Vec2 }[]): string | null` — `src/lib/realm/villagers.ts:49`
- `villagerForBuilding(buildingId: string): Villager | null` — `src/lib/realm/villagers.ts:26`
- `RenderSettings.showStick: boolean` — `src/lib/realm/render-settings.ts:6`, already a field of the `settings` prop the scene receives
- CSS custom properties `--realm-touch` (56px) and `--realm-hud-scale`, set on `.realm-root` by task 9
- `layout.villagers: VillagerPlacement[]` and `layout.colliders: Prop[]` — `src/lib/realm/layout.ts`

*Produces:*
- `RealmSceneProps.onVillagerPick: (villagerId: string) => void` — the shell passes its existing `onTalk` callback (a `useCallback` with `[]` deps, so referentially stable for the memoised `World`)
- the scene-internal pick handler `pickVillager(id, point)`, its JSX binder `pickHandler(id)`, the site binder `sitePick(prop)`, and the module constant `PENDING_TALK_MS = 8000` (module-local; nothing imports it)
- the `pendingTalk` ref and its four clearing rules in the frame loop
- CSS `.realm-bubble-key`; `.realm-bubble-talk` at `min-height: var(--realm-touch)`; `.realm-bubble` without `max-width: 16rem` and without its 12px body text; `.realm-bubble-text` deleted (nothing renders it after this task)

---

- [ ] **Step 1: Write the failing test for the scene's pick door**

  Open `src/components/realm/realm-shell.test.tsx`. Find the case named `"opens the site card from a villager in reach, pauses the clock, and raises the building on completion"` and insert this new case immediately after its closing `});` (line 202 today, immediately before `it("lets a parent read a site card without a Begin button", ...)`):

  ```tsx
  it("hands the scene one pick door, the same one Talk opens, and keeps it referentially stable", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(typeof sceneProps.onVillagerPick).toBe("function");
    // One door: a tap on a sprite, a plate or a foundation opens exactly what
    // Enter and the bubble's Talk button open, so the world can never have two
    // ways to meet a villager that disagree.
    expect(sceneProps.onVillagerPick).toBe(sceneProps.onTalk);
    const pick = sceneProps.onVillagerPick;
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
    });
    // `World` is memoised: a prop that changes identity on every mana tick would
    // re-render the whole scene sixty times a second.
    expect(sceneProps.onVillagerPick).toBe(pick);
    await act(async () => {
      (sceneProps.onVillagerPick as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run it and watch it fail**

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx -t "hands the scene one pick door"
  ```

  Expected failure: `AssertionError: expected 'undefined' to be 'function' // Object.is equality` at the `expect(typeof sceneProps.onVillagerPick).toBe("function")` line. Nothing else in the file may fail.

- [ ] **Step 3: Add the prop to `RealmSceneProps` and pass it from the shell**

  In `src/components/realm/realm-scene.tsx`, replace line 32 (`  onTalk: (villagerId: string) => void;`) with:

  ```ts
    onTalk: (villagerId: string) => void;
    // A tap on a villager, on a villager's nameplate, or on a site. The shell
    // passes the same door `onTalk` opens; they are two props so a later slice
    // can tell a pointer from a keypress without rewiring the scene.
    onVillagerPick: (villagerId: string) => void;
  ```

  In `src/components/realm/realm-shell.tsx`, in the `<RealmScene …>` call, replace line 499 (`          onTalk={onTalk}`) with:

  ```tsx
          onTalk={onTalk}
          onVillagerPick={onTalk}
  ```

- [ ] **Step 4: Run it and watch it pass**

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```
  Expected: all cases in the file pass, including the new one.

  ```
  npx tsc --noEmit
  ```
  Expected: no output (the shell now satisfies the widened `RealmSceneProps`).

- [ ] **Step 5: Commit the door**

  ```
  git branch --show-current
  ```
  Expected: `realm-foundations`. If it prints anything else, stop and switch before committing.

  ```
  git add src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  ```
  ```
  git commit -m "feat(realm): give the scene one villager-pick door, wired to the shell's Talk" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Import what the handler needs, and name the deadline**

  In `src/components/realm/realm-scene.tsx`, replace line 5:

  ```ts
  import { Canvas, useFrame } from "@react-three/fiber";
  ```
  with:
  ```ts
  import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
  ```

  Replace line 11:

  ```ts
  import { nearestVillager, villagerById } from "@/lib/realm/villagers";
  ```
  with:
  ```ts
  import { nearestVillager, villagerById, villagerForBuilding } from "@/lib/realm/villagers";
  ```

  And after `export const RISE_MS = 900;` (line 52 today) add:

  ```ts
  /**
   * How long a tap on a distant villager stays queued. A talk that fires four
   * seconds after the child's mind moved on is worse than no talk at all.
   */
  const PENDING_TALK_MS = 8000;
  ```

- [ ] **Step 7: Add the pending-talk ref and its clearing rules in the frame loop**

  Still in `realm-scene.tsx`. After line 90 (`  const villagerSprites = useRef(new Map<string, THREE.Sprite>());`) add:

  ```ts
    const pendingTalk = useRef<{ id: string; until: number } | null>(null);
  ```

  Add `onVillagerPick` to the `World` destructure on line 71 — change `…onReachChange, onTalk, risingId…` to `…onReachChange, onTalk, onVillagerPick, risingId…` so the whole parameter list reads:

  ```ts
  const World = memo(function World({ layout, textures, settings, axisRef, interactive, reachId, onReachChange, onTalk, onVillagerPick, risingId, selectedSpell, selectedSlot, castRef, spellsEnabled, onSpellEvent, seed, riding, mountSpeed, recessActive, onRecessEvent, ceremonyActive, ceremonySkipRef, onCeremonyEvent }: RealmSceneProps) {
  ```

  Inside `useFrame`, immediately after `castRef.current = null;` (line 114 today) and before the `if (ceremonyActive && !ceremonyRef.current)` block, add:

  ```ts
      // A pending talk belongs to the walking hero alone: the deed panel opening,
      // the help card opening and the crown ceremony starting each cancel it.
      if (pendingTalk.current && (!interactive || ceremonyActive)) pendingTalk.current = null;
  ```

  Then replace the reach block (lines 205-210 today):

  ```ts
      // Reach is reported only when it changes, and outside the frame loop, so React never sets state mid-render.
      const near = nearestVillager(p, layout.villagers);
      if (near !== reachRef.current) {
        reachRef.current = near;
        queueMicrotask(() => onReachChange(near));
      }
  ```
  with:
  ```ts
      // Reach is reported only when it changes, and outside the frame loop, so React never sets state mid-render.
      const near = nearestVillager(p, layout.villagers);
      if (near !== reachRef.current) {
        reachRef.current = near;
        queueMicrotask(() => onReachChange(near));
      }
      // A tap on a distant villager becomes a talk on arrival — fired through
      // queueMicrotask, never as a synchronous setState from useFrame.
      const pending = pendingTalk.current;
      if (pending) {
        if (near === pending.id) {
          pendingTalk.current = null;
          queueMicrotask(() => onVillagerPick(pending.id));
        } else if (performance.now() >= pending.until || hero.current.target === null) {
          // The deadline passed, or `stepHero` dropped a target it could not reach.
          pendingTalk.current = null;
        }
      }
  ```

- [ ] **Step 8: Write the pick handler and its two JSX binders**

  Still in `realm-scene.tsx`, in the render body. After line 234 (`  const reachPlacement = reachId ? layout.villagers.find((v) => v.id === reachId) ?? null : null;`) add:

  ```tsx
    // One pick, wherever the child aimed it: a villager's sprite, a villager's
    // nameplate, a site's building or its bare foundation. In reach it talks;
    // otherwise it walks the hero over and the frame loop talks on arrival.
    const pickVillager = (id: string, point: Vec2) => {
      if (!interactive) return;
      if (selectedSpell) {
        // A page is selected: the tap casts where it landed, exactly as the ground
        // does. stopPropagation means the ground mesh never sees this one.
        castRef.current = { target: point };
        return;
      }
      if (reachRef.current === id) {
        onVillagerPick(id);
        return;
      }
      const v = layout.villagers.find((s) => s.id === id);
      if (!v) return;
      pendingTalk.current = { id, until: performance.now() + PENDING_TALK_MS };
      // The approach point is one unit toward spawn. `setTarget` refuses a point
      // inside a collider and hands back the state unchanged; a villager's own
      // square is never a collider, so that is the retry that always works.
      const before = hero.current;
      const walked = setTarget(before, { x: v.position.x, z: v.position.z + 1 }, layout.colliders);
      hero.current = walked === before ? setTarget(before, v.position, layout.colliders) : walked;
    };
    // stopPropagation first, so the tap never falls through to the ground mesh and
    // walks the hero vaguely nearby instead of to the person they pointed at.
    const pickHandler = (id: string) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.button !== 0 && e.button !== 2) return; // left and right pick or cast; the wheel does nothing
      pickVillager(id, { x: e.point.x, z: e.point.z });
    };
    // Tapping the well's foundation walks you to Old Bram. With no villager on a
    // site (the kingdom failed to load) no handler is attached at all, so the tap
    // still reaches the ground and the hero still walks.
    const sitePick = (prop: Prop): { onPointerDown?: (e: ThreeEvent<PointerEvent>) => void } => {
      if (prop.kind !== "building" && prop.kind !== "foundation") return {};
      const v = villagerForBuilding(prop.id);
      if (!v || !layout.villagers.some((s) => s.id === v.id)) return {};
      return { onPointerDown: pickHandler(v.id) };
    };
  ```

- [ ] **Step 9: Typecheck and lint the handler before it is bound to anything**

  ```
  npx tsc --noEmit
  ```
  Expected: no output. (`pickHandler` and `sitePick` are unused so far — TypeScript does not complain about unused locals here.)

  ```
  npx eslint src/components/realm/realm-scene.tsx
  ```
  Expected: no output. If it reports `pickHandler`/`sitePick` as unused (`@typescript-eslint/no-unused-vars` is a *warning* under `eslint-config-next/typescript`, and eslint prints warnings without `--quiet`), that is expected only until step 10 binds them — carry straight on to step 10 and re-run.

- [ ] **Step 10: Bind the handler to the villager sprites and the two site surfaces**

  Still in `realm-scene.tsx`.

  (a) The foundation group — replace line 278:

  ```tsx
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
  ```
  with:
  ```tsx
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
  ```

  (b) The textured standing prop — replace line 307:

  ```tsx
              <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
  ```
  with:
  ```tsx
              <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
  ```

  (c) The fallback box standing prop — replace line 318:

  ```tsx
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
  ```
  with:
  ```tsx
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
  ```

  (`sitePick` returns `{}` for the castle, decor and barriers, so only the eight sites ever carry a handler.)

  (d) The villager sprites — replace the whole block at lines 327-343:

  ```tsx
        {layout.villagers.map((v) => {
          const texture = textures.villagers[v.id];
          if (!texture) return null;
          return (
            <sprite
              key={v.id}
              ref={(el) => {
                if (el) villagerSprites.current.set(v.id, el);
                else villagerSprites.current.delete(v.id);
              }}
              position={[v.position.x, SPRITE_H / 2, v.position.z]}
              scale={[SPRITE_W, SPRITE_H, 1]}
            >
              <spriteMaterial map={texture} transparent alphaTest={0.1} />
            </sprite>
          );
        })}
  ```
  with:
  ```tsx
        {layout.villagers.map((v) => {
          const texture = textures.villagers[v.id];
          if (!texture) return null;
          return (
            <sprite
              key={v.id}
              ref={(el) => {
                if (el) villagerSprites.current.set(v.id, el);
                else villagerSprites.current.delete(v.id);
              }}
              position={[v.position.x, SPRITE_H / 2, v.position.z]}
              scale={[SPRITE_W, SPRITE_H, 1]}
              onPointerDown={pickHandler(v.id)}
            >
              <spriteMaterial map={texture} transparent alphaTest={0.1} />
            </sprite>
          );
        })}
  ```

- [ ] **Step 11: Typecheck, lint and run the suite**

  ```
  npx tsc --noEmit
  ```
  Expected: no output.

  ```
  npx eslint src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx
  ```
  Expected: no output.

  ```
  npm test
  ```
  Expected: every suite green (the scene itself has no suite; nothing that exists today changes behaviour in jsdom).

- [ ] **Step 12: Commit the pick**

  ```
  git branch --show-current
  ```
  Expected: `realm-foundations`.

  ```
  git add src/components/realm/realm-scene.tsx
  ```
  ```
  git commit -m "feat(realm): tap a villager or a site and the hero walks there and talks on arrival" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 13: Shrink the reach bubble to one 56px control**

  In `src/components/realm/realm-scene.tsx`, first declare the one local the new bubble reads. Put it in `World`'s render body directly above the bubble block — not earlier, or `npx eslint` in step 11 would have reported it unused and step 12 would have committed a warning:

  ```tsx
    const keyHint = !settings.showStick; // `Talk · Enter` for a keyboard, a plain `Talk` for a thumb
  ```

  Then replace the bubble block at lines 360-374 (which now sits a few lines lower):

  ```tsx
        {reachVillager && reachPlacement && interactive && (
          <Html position={[reachPlacement.position.x, SPRITE_H + 0.9, reachPlacement.position.z]} center zIndexRange={[15, 0]}>
            <div
              className="realm-bubble"
              role="group"
              aria-label={reachVillager.name}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="realm-bubble-text">{reachVillager.greeting}</p>
              <button type="button" className="realm-bubble-talk" onClick={() => onTalk(reachVillager.id)}>Talk</button>
            </div>
          </Html>
        )}
  ```
  with:
  ```tsx
        {reachVillager && reachPlacement && interactive && (
          <Html position={[reachPlacement.position.x, SPRITE_H + 0.9, reachPlacement.position.z]} center zIndexRange={[15, 0]}>
            {/*
              The greeting paragraph is gone: it was the SiteCard's subtitle
              verbatim, read twice, and it covered the villager it belonged to.
              What is left is one thing to press, at the size a six-year-old's
              thumb needs.
            */}
            <div
              className="realm-bubble"
              role="group"
              aria-label={reachVillager.name}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="realm-bubble-talk"
                aria-label={`Talk to ${reachVillager.name}`}
                onClick={() => onTalk(reachVillager.id)}
              >
                Talk{keyHint && <span className="realm-bubble-key"> · Enter</span>}
              </button>
            </div>
          </Html>
        )}
  ```

- [ ] **Step 14: Restyle the bubble in `globals.css`**

  In `src/app/globals.css`, replace lines 1720-1722:

  ```css
  .realm-bubble { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; max-width: 16rem; border-radius: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(0, 0, 0, 0.7); color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: 12px; text-align: center; pointer-events: auto; }
  .realm-bubble-text { margin: 0; }
  .realm-bubble-talk { min-width: 44px; min-height: 44px; border-radius: 9999px; padding: 0 1rem; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font-weight: 700; cursor: pointer; }
  ```
  with:
  ```css
  /* One control, no paragraph: the bubble is now a frame around the Talk button. */
  .realm-bubble { display: flex; flex-direction: column; align-items: center; border-radius: 9999px; padding: 0.25rem; background: rgba(0, 0, 0, 0.7); color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; text-align: center; pointer-events: auto; }
  /* Every control that sits over the 3D world is --realm-touch (56px); panel buttons stay at 44px. */
  .realm-bubble-talk { min-width: var(--realm-touch); min-height: var(--realm-touch); border-radius: 9999px; padding: 0 1.1rem; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font-size: calc(15px * var(--realm-hud-scale)); font-weight: 700; cursor: pointer; }
  .realm-bubble-key { font-weight: 600; opacity: 0.75; }
  ```

- [ ] **Step 15: Typecheck, lint and run the suite again**

  ```
  npx tsc --noEmit
  ```
  Expected: no output.

  ```
  npx eslint src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx
  ```
  Expected: no output.

  ```
  npm test
  ```
  Expected: every suite green.

  ```
  grep -rn "realm-bubble-text" src/
  ```
  Expected: no matches — the class is gone from both the markup and the stylesheet.

- [ ] **Step 16: Commit the bubble**

  ```
  git branch --show-current
  ```
  Expected: `realm-foundations`.

  ```
  git add src/components/realm/realm-scene.tsx src/app/globals.css
  ```
  ```
  git commit -m "feat(realm): shrink the reach bubble to one 56px Talk control" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 17: Record browser-pass check 5 for task 21**

  Nothing to change. Confirm the check below is on task 21's list, word for word, because no jsdom test can prove any of it (`realm-scene.tsx` imports three; Vitest runs in jsdom with no WebGL).

  Setup: the running dev server for this repo — find it rather than trusting a port (`ss -ltnp | grep -E ':3[0-9]{3}'`, then check `readlink -f /proc/<pid>/cwd` is `.../kingdoms-and-crowns` and the page `<title>` is `Kingdoms & Crowns — Be the Hero of Homeschool`); open `/realm?preview` per the documented headless-Chromium setup.

  **Browser-pass check 5 — tap the thing, do the thing:**
  1. With a mouse, click a villager on the far side of the map. The hero walks to them and the SiteCard opens **on arrival**, not on the click.
  2. Repeat as a touch tap (Playwright `page.touchscreen.tap`, or DevTools device emulation). Same result.
  3. Click the **bare foundation** of the well (not the villager): the hero walks to Old Bram and his card opens.
  4. Click a distant villager, then immediately walk away with `W`/`A`/`S`/`D`. Nine seconds later nothing opens (`PENDING_TALK_MS` is 8000).
  5. Click a distant villager, then open the help card (`?`) before the hero arrives. Close it: nothing opens.
  6. Click a villager the hero is already standing next to: the card opens immediately, with no walk.
  7. Select a spell page (`1`), then click on a villager: the spell casts at that point; no card opens, no walk.
  8. The reach bubble shows one pill reading `Talk · Enter` on a keyboard and `Talk` with `inputMode: touch`, with no greeting paragraph, and measures at least 56 px tall in both cases (`getBoundingClientRect().height >= 56`).

---

**Notes for the engineer**

- `pickVillager` is *not* guarded by `frozenRef.current`. A dazzled or mid-cast hero has its walk target dropped every frame by the existing rule at line 153, so the pending talk clears itself on the next frame through the `hero.current.target === null` branch — no extra case is needed, and a Talk in reach still works, exactly as the bubble's own button does today.
- The pending talk's resolution deliberately checks `near === pending.id` **before** the deadline and dropped-target branches: on the arrival frame `stepHero` nulls the target and `near` becomes the pending id in the same frame, and arriving must win.
- Nothing in this task enters `layout.props`, so no collider changes and `spawnTroubles`, the gleam placement and the ceremony walk are untouched (§3.14 a and b).

---

### Task 15: Villagers become groups: plates, shadows and a ceremony that carries them

Each villager stops being a bare `<sprite>` and becomes a `<group>` holding its contact shadow, its sprite and its `<Html>`-wrapped `VillagerPlate`. The map the ceremony writes into becomes `villagerGroups: Map<string, THREE.Object3D>` and its two write sites move the **group**, so plates, markers and shadows travel to the plaza with the eight villagers and land back at their sites — with no change at all to `ceremony.ts`. One `shown` `useMemo` filters villagers whose SVG never rasterised out of the render **and** out of `nearestVillager`, so no Talk bubble can float over bare grass.

**Files:**
- Modify: `src/components/realm/realm-scene.tsx` — imports (`useMemo`, `Surfaces`, `VillagerPlate`); `RealmSceneProps` (+`surfaces`, today at :24-48); `World`'s destructured params (today at :71); the villager ref map (today at :90); the `shown` memo (new, after the refs); the ceremony's two write sites (today at :139-146); `nearestVillager` (today at :206); `reachPlacement` (today at :234); the villager render block (today at :327-343)
- Modify: `src/components/realm/realm-shell.tsx` — one prop on `<RealmScene>` (today at :490-516)
- Test: `src/components/realm/realm-shell.test.tsx` — two new cases after the "keeps the scene's settings and layout referentially stable" case (today at :328-342)
- Browser pass (this file imports three and cannot be unit-tested): §7 checks **3** and **4**

> **Line numbers above are from the file as it stands today (2026-09-11, head `d880906`).** Tasks 13, 14 and 16 also edit `realm-scene.tsx` and will have shifted every one of them. Every edit below is anchored on quoted source text, not on a line number. Anchor on the text.

**Interfaces:**

*Consumes*
- Task 1 — `src/lib/realm/depth.ts`: `type Surfaces = { numerals: boolean; trackedObjectives: number; abilitySlots: "earned"|"all"; keycapHints: boolean; listRows: number; districtDetail: boolean; fastTravel: boolean; troubleNames: boolean; troubleDetail: boolean; troubleHitPips: boolean; clearCount: boolean; bountyLedgerLine: boolean; lapTimes: boolean }`
- Task 3 — `src/lib/realm/layout.ts`: `type VillagerPlacement = { id: string; buildingId: string; position: Vec2; status: VillagerStatus; label: string; done: number; total: number }`
- Task 4 — `src/lib/realm/markers.ts`: `const GROUND_Y: { water; path; foundation; propShadow; lapWaypoint; figureShadow; heroRing }`, `const SHADOW_OPACITY = 0.22` (used *inside* Task 13's `ContactShadow`, not directly here)
- Task 10 — `src/components/realm/realm-shell.tsx`: `const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile])`, referentially stable for the visit
- Task 12 — `src/components/realm/villager-plate.tsx`: `<VillagerPlate villager={VillagerPlacement} surfaces={Surfaces} calm={boolean} motion={boolean} onPick={(id: string) => void} />`, a named export, pure DOM, no three
- Task 13 — `realm-scene.tsx` local component: `<ContactShadow w={number} d={number} y={number} calm={boolean} />`, the module constant `const HERO_SHADOW = shadowFootprint({ w: 0.8, d: 0.8 })` (§3.4 gives a villager the hero's footprint, so step 7e reads this rather than retyping `0.8`), and the existing `import { … GROUND_Y } from "@/lib/realm/markers";` it added
- Task 14 — `realm-scene.tsx`'s local `pickVillager(id: string, point: Vec2)` and its JSX binder `pickHandler(id: string)`, plus the `RealmScene` prop `onVillagerPick: (id: string) => void` (the shell's `onTalk`, which the handler calls only when the hero is already in reach)

*Produces*
- `RealmScene` prop `surfaces: Surfaces` (§8's frozen contract) — read by Task 16 only through `World`, never re-derived
- `villagerGroups: Map<string, THREE.Object3D>` in `World`, replacing `villagerSprites: Map<string, THREE.Sprite>` — the ceremony's write target
- `const shown: VillagerPlacement[]` in `World` — the one list shared by the villager render, `nearestVillager`, the pick handler's lookup and `reachPlacement`

---

- [ ] **Step 1: Write the failing test — the shell hands the scene the visit's surfaces**

  Open `src/components/realm/realm-shell.test.tsx` and add these two cases immediately after the existing case that ends `expect(sceneProps.layout).toBe(layout);` (today at :342), inside the same `describe("RealmShell", …)` block:

  ```tsx
  it("hands the scene the visit's surfaces, and keeps them referentially stable across mana re-renders", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "full" as const }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.surfaces).toBeDefined();
    const surfaces = sceneProps.surfaces as { numerals: boolean; trackedObjectives: number };
    expect(surfaces.numerals).toBe(true);
    expect(surfaces.trackedObjectives).toBe(3);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 80 });
    });
    expect(sceneProps.surfaces).toBe(surfaces);
  });

  it("hands the scene pip surfaces for a hero at simple depth", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect((sceneProps.surfaces as { numerals: boolean; trackedObjectives: number }).numerals).toBe(false);
    expect((sceneProps.surfaces as { numerals: boolean; trackedObjectives: number }).trackedObjectives).toBe(1);
  });
  ```

  `depth` is passed explicitly rather than leaned on from the `bundle` fixture, so this case proves the scene gets *the visit's* depth and does not depend on what Task 8 chose as the fixture default.

- [ ] **Step 2: Run it and watch it fail**

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expected: both new cases fail. The first fails on `expect(sceneProps.surfaces).toBeDefined()` with `AssertionError: expected undefined to be defined`; the second fails on `Cannot read properties of undefined (reading 'numerals')`. Every other case in the file still passes.

- [ ] **Step 3: Add the `surfaces` prop to the scene's contract and pass it from the shell**

  In `src/components/realm/realm-scene.tsx`, add the type import beside the other lib type import:

  ```ts
  import type { RenderSettings } from "@/lib/realm/render-settings";
  import type { Surfaces } from "@/lib/realm/depth";
  ```

  In the same file, add the prop to `RealmSceneProps`, directly under `settings`:

  ```ts
    settings: RenderSettings;
    surfaces: Surfaces; // the visit's complexity axis; the villager plates read `numerals` from it
  ```

  In `src/components/realm/realm-shell.tsx`, add one line to the `<RealmScene …>` element, directly under `settings={settings}`:

  ```tsx
          settings={settings}
          surfaces={surfaces}
  ```

  Do **not** add `surfaces` to `World`'s destructured parameter list yet — nothing in `World` reads it until Step 7, and an unused destructured parameter trips `@typescript-eslint/no-unused-vars`.

- [ ] **Step 4: Run it and watch it pass**

  ```
  npx vitest run src/components/realm/realm-shell.test.tsx
  npx tsc --noEmit
  ```

  Expected: the test file is fully green (both new cases pass). `tsc` prints nothing.

- [ ] **Step 5: Commit**

  ```
  git branch --show-current
  git add src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  git commit -m "feat(realm): hand the scene the visit's surfaces" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  `git branch --show-current` must print `realm-foundations` before you commit — several sessions share this checkout.

- [ ] **Step 6: One `shown` list, read by the render, by reach, by the pick handler and by the bubble**

  All four edits are in `src/components/realm/realm-scene.tsx`.

  (a) Import `useMemo`:

  ```ts
  import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
  ```

  (b) Insert the memo immediately after the villager ref line (today `const villagerSprites = useRef(new Map<string, THREE.Sprite>());`, the last line of `World`'s ref block, before the first `useEffect`):

  ```ts
    // A villager whose figure never rasterised is not in the world at all. This one list
    // feeds the render AND `nearestVillager` below, so a missing sprite can never leave a
    // Talk bubble floating over bare grass (sprite-source.tsx silently continues past a
    // villager whose SVG is not in the DOM).
    const shown = useMemo(() => layout.villagers.filter((v) => Boolean(textures.villagers[v.id])), [layout.villagers, textures]);
  ```

  (c) In `useFrame`, point reach at it:

  ```ts
      const near = nearestVillager(p, shown);
  ```

  (the whole line today reads `const near = nearestVillager(p, layout.villagers);`)

  (d) Below the frame loop, point the reach bubble's placement lookup at it:

  ```ts
    const reachPlacement = reachId ? shown.find((v) => v.id === reachId) ?? null : null;
  ```

  (the whole line today reads `const reachPlacement = reachId ? layout.villagers.find((v) => v.id === reachId) ?? null : null;`)

  (e) In the pick handler Task 14 added inside `World`, change the one placement lookup from `layout.villagers` to `shown`:

  ```ts
      const v = shown.find((s) => s.id === id);
  ```

  The rule, so this is unambiguous if Task 14's wording differs: **every read of `layout.villagers` inside `World` becomes a read of `shown`, with exactly one exception** — the ceremony's reset loop in Step 7, which keeps iterating `layout.villagers` because its `villagerGroups.current.get(v.id)?.…` already filters to the villagers that actually mounted.

  Verify:

  ```
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  ```

  Expected: both print nothing. (`shown` is read in four places, so no unused-variable warning.)

- [ ] **Step 7: Villagers become groups, and the ceremony moves the group**

  Five edits, all in `src/components/realm/realm-scene.tsx`. Do them together — the file is inconsistent between the ref rename and the render rewrite, so `tsc` is only meaningful once all five have landed.

  (a) Import the plate beside the other local component imports (Task 13 already added the `@/lib/realm/markers` import that brings `GROUND_Y` in; add nothing there):

  ```ts
  import type { SpriteTextures } from "./sprite-source";
  import { VillagerPlate } from "./villager-plate";
  ```

  (b) Add `surfaces` to `World`'s destructured parameter list, immediately after `settings`. Today's opening reads `const World = memo(function World({ layout, textures, settings, axisRef, …` — change that fragment to:

  ```ts
  const World = memo(function World({ layout, textures, settings, surfaces, axisRef,
  ```

  (c) Replace the villager ref declaration:

  ```ts
    // The whole villager — sprite, plate and shadow — is one Object3D. The ceremony moves
    // the group, so every attachment travels with it and `ceremony.ts` needs no change.
    const villagerGroups = useRef(new Map<string, THREE.Object3D>());
  ```

  (it reads `const villagerSprites = useRef(new Map<string, THREE.Sprite>());` today)

  (d) Replace both ceremony write sites inside `useFrame`. Today:

  ```ts
        for (const [id, sprite] of villagerSprites.current) {
          const v = r.state.villagers[id];
          if (v) sprite.position.set(v.x, SPRITE_H / 2, v.z);
        }
        if (r.state.step === "done") {
          // The people return to their sites, where Talk expects them.
          for (const v of layout.villagers) villagerSprites.current.get(v.id)?.position.set(v.position.x, SPRITE_H / 2, v.position.z);
        }
  ```

  After:

  ```ts
        for (const [id, group] of villagerGroups.current) {
          const v = r.state.villagers[id];
          if (v) group.position.set(v.x, 0, v.z);
        }
        if (r.state.step === "done") {
          // The people return to their sites, where Talk expects them — and their plates,
          // markers and shadows are children of the group, so they come home too.
          for (const v of layout.villagers) villagerGroups.current.get(v.id)?.position.set(v.position.x, 0, v.position.z);
        }
  ```

  The group's origin is the villager's feet, so the y the ceremony writes is `0`, not `SPRITE_H / 2`; the sprite keeps its own local lift in (e).

  (e) Replace the whole villager render block — today `{layout.villagers.map((v) => { const texture = textures.villagers[v.id]; if (!texture) return null; return (<sprite … />); })}`, sitting between the `standing.map(…)` block and the banner block — with:

  ```tsx
        {shown.map((v) => (
          <group
            key={v.id}
            ref={(el) => {
              if (el) villagerGroups.current.set(v.id, el);
              else villagerGroups.current.delete(v.id);
            }}
            position={[v.position.x, 0, v.position.z]}
          >
            <ContactShadow w={HERO_SHADOW.w} d={HERO_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
            <sprite position={[0, SPRITE_H / 2, 0]} scale={[SPRITE_W, SPRITE_H, 1]} onPointerDown={pickHandler(v.id)}>
              <spriteMaterial map={textures.villagers[v.id]} transparent alphaTest={0.1} />
            </sprite>
            <Html position={[0, SPRITE_H + 0.35, 0]} center zIndexRange={[12, 0]}>
              <VillagerPlate
                villager={v}
                surfaces={surfaces}
                calm={settings.calmPalette}
                motion={settings.motion}
                onPick={(id) => pickVillager(id, v.position)}
              />
            </Html>
          </group>
        ))}
  ```

  Two names from Task 14 are load-bearing here, and they are not interchangeable:

  - **`pickHandler(id)`** is Task 14's JSX binder — `(id: string) => (e: ThreeEvent<PointerEvent>) => void` — which calls `e.stopPropagation()` first and then `pickVillager(id, { x: e.point.x, z: e.point.z })`. The sprite takes it directly; do not hand-write a second `stopPropagation` wrapper beside it.
  - **`pickVillager(id, point)`** is the handler itself, and it takes **two** arguments. `VillagerPlate`'s frozen `onPick` is `(id: string) => void`, so the plate gets the one-argument arrow above, which supplies the villager's own ground position as the point. That position is what the aiming branch casts at when a spell page is selected — the same place the sprite tap would have cast.
  - Neither is `onVillagerPick`, which is the `RealmScene` **prop** (the shell's `onTalk`). Task 14's handler calls that prop when the hero is already in reach; the plate and the sprite must go through the handler, not the prop, or a tap on a distant villager would open a card without walking there.

  The plate's own `<button>` also stops propagation on `pointerdown` (Task 12), so the pointer never reaches the canvas behind it.

  Nothing else in the block changes: the sprite keeps `SPRITE_W`/`SPRITE_H`, `transparent` and `alphaTest={0.1}`; the plate's `<Html>` sits at `zIndexRange={[12, 0]}`, above `PropLabel`'s `[10, 0]` and below the reach bubble's `[15, 0]` — and, critically, below `.realm-hud`'s `z-index: 20`, so the eight plates paint under the HUD even though task 9 moved the HUD ahead of them in DOM order to satisfy §6's tab order.

  `HERO_SHADOW` is task 13's module constant in this same file (`shadowFootprint({ w: 0.8, d: 0.8 })`), and §3.4's footprint table gives a villager the hero's 0.8 × 0.8. Read the constant rather than retyping the numbers: one edit to the table must move the hero and all eight villagers together.

- [ ] **Step 8: Run every gate this file has**

  ```
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  npx vitest run src/lib/realm/ceremony/ceremony.test.ts
  npm test
  ```

  Expected:
  - `tsc` prints nothing.
  - `eslint` prints nothing.
  - `ceremony.test.ts`: `Test Files 1 passed`, every test green — `ceremony.ts` is untouched by this task and the group move must not have disturbed it.
  - `npm test`: the whole suite green.
  - `npm run lint` (if you run it) shows only the one pre-existing error in `src/components/quest-template-list.tsx`, which this branch never touched.

- [ ] **Step 9: Commit**

  ```
  git branch --show-current
  git add src/components/realm/realm-scene.tsx
  git commit -m "feat(realm): give every villager a group that carries its plate, marker and shadow" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  `git branch --show-current` must print `realm-foundations`.

- [ ] **Step 10: Browser pass, check 3 — eight legible nameplates, at default zoom and at largerText**

  Find the app's dev server rather than starting a second one (a second `next dev` fails on `.next/dev/lock`):

  ```
  ss -ltnp | grep -E ':3[0-9]{3}'
  curl -s localhost:3100/ | grep -o '<title>[^<]*'
  ```

  Expected title: `<title>Kingdoms & Crowns — Be the Hero of Homeschool`. If nothing is listening on 3100, start one: `PORT=3100 npm run dev` (background).

  Write the screenshot driver once, into the scratchpad:

  ```js
  // /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/realm-shot.mjs
  const { chromium } = await import(process.env.PW_DIR + "/index.mjs");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:3100/realm", { waitUntil: "networkidle" });
  await page.waitForSelector(".realm-plate", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const plates = await page.locator(".realm-plate").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.textContent, x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), font: getComputedStyle(e.querySelector(".realm-plate-name")).fontSize };
    })
  );
  console.log(JSON.stringify(plates, null, 1));
  await page.screenshot({ path: process.env.OUT });
  await browser.close();
  ```

  Run it (the library paths drift; resolve them each time, per the documented WSL setup — the bundled Chromium needs `libnspr4`, `libnss3`, `libnssutil3` and `libasound2t64` unpacked into a directory on `LD_LIBRARY_PATH`, since there is no passwordless sudo here):

  ```
  PW_DIR=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1)
  CHROME_BIN=$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -1)
  LD_LIBRARY_PATH=$HOME/.cache/pw-libs/usr/lib/x86_64-linux-gnu PW_DIR=$PW_DIR CHROME_BIN=$CHROME_BIN OUT=/tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/plates-default.png node /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/realm-shot.mjs
  ```

  Expected, at default zoom: **8** plate objects logged, each with a distinct `name`, `h >= 44` (the plate's minimum hit area) and `font: "13px"`; no two plates share an `x`/`y` within a few pixels of each other, and in the screenshot every name is readable over the grass without squinting.

  Then turn on largerText: in the app, Settings → Learning profile → **Larger text** on for this hero, reload `/realm`, and re-run with `OUT=…/plates-larger.png`. Expected: the same 8 plates, `font: "16.25px"` (13 × 1.25), still 8 distinct names, still legible and not overlapping their neighbours. Turn Larger text back off when you are done.

- [ ] **Step 11: Browser pass, check 4 — the ceremony carries all eight plates to the plaza and back (the one every proposal missed)**

  The crown ceremony only runs for a child view with a pending, crowned season, so force one for the duration of this check, from a backup rather than from git (the branch has uncommitted work from later tasks):

  ```
  cp src/components/realm/realm-shell.tsx /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/realm-shell.bak.tsx
  ```

  Then change the one line in `src/components/realm/realm-shell.tsx` from

  ```tsx
    const [ceremonyPending] = useState(() => (isChildView ? bundle.ceremony : null));
  ```

  to

  ```tsx
    const [ceremonyPending] = useState(() => (isChildView ? bundle.ceremony ?? { seasonId: "dev-ceremony", crownId: "crown-copper", ordinal: 1, grade: "1", seasonLabel: "Spring 2026" } : null));
  ```

  (`markCeremonySeen` will reject the made-up season id at the end and the ceremony-failed message will appear; that is expected and irrelevant to this check — the plates have already made the round trip by then.)

  Add a second driver in the scratchpad that samples the plates' screen positions through the whole ceremony:

  ```js
  // scratchpad/realm-ceremony.mjs
  const { chromium } = await import(process.env.PW_DIR + "/index.mjs");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const sample = () =>
    page.locator(".realm-plate").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [e.textContent.trim().slice(0, 14), Math.round(r.x), Math.round(r.y)];
      })
    );
  await page.goto("http://localhost:3100/realm", { waitUntil: "networkidle" });
  await page.waitForSelector(".realm-plate", { timeout: 30000 });
  console.log("gather", JSON.stringify(await sample()));
  await page.screenshot({ path: process.env.OUT + "/ceremony-gather.png" });
  await page.waitForTimeout(6000);
  console.log("hail", JSON.stringify(await sample()));
  await page.screenshot({ path: process.env.OUT + "/ceremony-hail.png" });
  await page.waitForTimeout(10000);
  console.log("done", JSON.stringify(await sample()));
  await page.screenshot({ path: process.env.OUT + "/ceremony-done.png" });
  await browser.close();
  ```

  Run it the same way as Step 10 (`OUT` is a directory here). Expected:
  - **8** plates in all three samples — nobody is dropped mid-ceremony.
  - `hail`: the eight plates are clustered together near the castle (top of the frame), tens to hundreds of pixels from where they started, and the screenshot shows each plate sitting over its own villager with its badge, its name and its tag line — not stranded at an empty site.
  - `done`: the eight plates are back within a pixel or two of their `gather` positions.
  - In `ceremony-hail.png`, each villager's contact shadow is under that villager in the plaza, not left behind at the site.

  Then the missing-sprite half of check 4. Restore the shell and force one villager's texture to fail:

  ```
  cp /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/realm-shell.bak.tsx src/components/realm/realm-shell.tsx
  cp src/components/realm/sprite-source.tsx /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/sprite-source.bak.tsx
  ```

  In `src/components/realm/sprite-source.tsx`, inside the villager rasterising loop, change

  ```ts
        if (!svg) continue;
  ```

  to

  ```ts
        if (!svg || v.id === "bram") continue;
  ```

  Reload `/realm` and re-run the Step 10 driver. Expected: **7** plates, none of them reading `Old Bram`; no sprite and no shadow at the well's villager spot (the well's foundation and its `PropLabel` are still there, and Task 16's beacon still marks the site — §5: the place stays findable without the person); walking the hero onto that spot with `W`/`A`/`S`/`D` produces **no** reach bubble and no Talk button. Then restore:

  ```
  cp /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad/sprite-source.bak.tsx src/components/realm/sprite-source.tsx
  git status --short
  ```

  `git status --short` must show a clean tree for `src/components/realm/realm-shell.tsx` and `src/components/realm/sprite-source.tsx`. If either browser check fails, fix `realm-scene.tsx`, re-run Step 8's gates, and commit the fix on top with the same two-`-m` message form.

---

### Task 16: The beacon and the off-screen arrow

**Files:**
- Create: —
- Modify:
  - `src/components/realm/realm-scene.tsx` — today (before tasks 13-15 edit it) the anchors are: the camera import at `:10`, `RealmSceneProps` at `:24-48`, the `World` destructure at `:71`, the refs block at `:73-90`, the `setMounted` effect at `:105-107`, the frame loop at `:109-228`, the camera write at `:200-204`, the derived consts at `:230-243`, the foundation map at `:275`. **Tasks 13, 14 and 15 edit this file before you do, so every step below anchors on quoted text, never on a line number.**
  - `src/components/realm/realm-shell.tsx:491-516` — the `<RealmScene …>` element (`axisRef={axisRef}` is at `:495`); add `arrowRef={arrowRef}`.
  - `src/app/globals.css` — the Realm block (`.realm-root` is at `:1702`); extend the `.realm-edge-arrow` rule Task 9 added.
- Test: none created. `realm-scene.tsx` imports three and Vitest runs in jsdom with no WebGL, so this task's gate is `npm run typecheck` + `npx eslint <files>` + a green `npm test` + browser-pass checks **7** and **8**.

**Interfaces:**

*Consumes*
- Task 5, `src/lib/realm/camera.ts`: `type Viewport = { width: number; height: number }`, `type EdgeArrow = { x: number; y: number; angle: number }`, `function edgeArrow(camTarget: Vec2, target: Vec2, viewport: Viewport, opts?: { margin?: number; zoom?: number }): EdgeArrow | null` (margin defaults to 56 px, zoom to `CAMERA_ZOOM`, a zero-size viewport returns `null`).
- Task 4, `src/lib/realm/markers.ts`: `const BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 }`, `const GROUND_Y` (rung `heroRing`), `const RING_GOLD = "#c9a84c"`, `const RING_CALM = "#8a7d5a"`.
- Task 3, `src/lib/realm/layout.ts`: `Prop.focus?: PropFocus` where `PropFocus = "objective" | "tracked" | "done" | null`.
- Task 9: `const arrowRef = useRef<HTMLDivElement>(null)` held in `RealmOpen`, and the node `<div ref={arrowRef} className="realm-edge-arrow" aria-hidden="true" hidden />` rendered by `RealmMessages` inside `<div className="realm-messages">`.

*Produces*
- `RealmSceneProps.arrowRef: RefObject<HTMLDivElement | null>` — a ref, therefore referentially stable, therefore the `World` memo is untouched.
- The beacon group over the focused site: a gold `cylinderGeometry(BEACON.radius, BEACON.radius, height, 8)` at `y = height / 2` plus a ground ring at `GROUND_Y.heroRing - 0.005`.
- CSS: `.realm-edge-arrow` gold/calm colour, `pointer-events: none`, `@keyframes realm-arrow-pulse` (1 Hz on the `::before` arrowhead), the `prefers-reduced-motion` override and the `.realm-edge-arrow[data-motion="off"]` override the scene writes.

---

- [ ] **Step 1: Confirm the three contracts this task rides on are present and green.**

  This task writes no new pure module; it consumes three that earlier tasks built. Run them before touching the scene, so a failure here is never mistaken for a failure of this task:

  ```bash
  npx vitest run src/lib/realm/camera.test.ts src/lib/realm/markers.test.ts src/lib/realm/layout.test.ts
  ```

  Expected: three files pass, zero failures. `camera.test.ts` must include the `edgeArrow` cases from Task 5 (on-screen → `null`, four off-screen directions, zero-size viewport → `null`); `markers.test.ts` must include `GROUND_Y` and `BEACON`. Then confirm the symbols exist:

  ```bash
  grep -n "export function edgeArrow" src/lib/realm/camera.ts
  grep -n "export const BEACON\|export const GROUND_Y\|export const RING_GOLD\|export const RING_CALM" src/lib/realm/markers.ts
  grep -n "focus?: PropFocus" src/lib/realm/layout.ts
  grep -n "arrowRef" src/components/realm/realm-shell.tsx src/components/realm/realm-messages.tsx
  ```

  Expected: `edgeArrow` in camera.ts; `BEACON`, `GROUND_Y`, `RING_GOLD`, `RING_CALM` in markers.ts; `focus?: PropFocus` on `Prop`; `arrowRef` declared in `realm-shell.tsx` (Task 9's `useRef<HTMLDivElement>(null)`) and used in `realm-messages.tsx`. If any is missing, the earlier task did not land — stop and finish it first.

- [ ] **Step 2: Add the `arrowRef` prop to `RealmSceneProps` and to the `World` destructure.**

  In `src/components/realm/realm-scene.tsx`, find this line inside `RealmSceneProps` (it is the last member today; tasks 14 and 15 may have added `onVillagerPick` and `surfaces` after it):

  ```ts
    onCeremonyEvent: (e: CeremonyEvent) => void;
  ```

  Replace it with:

  ```ts
    onCeremonyEvent: (e: CeremonyEvent) => void;
    // The off-screen objective arrow, which lives in the HUD layer. A ref, so it is
    // referentially stable and the World memo never sees a changed prop; the scene
    // writes the element directly rather than routing a position through React.
    arrowRef: RefObject<HTMLDivElement | null>;
  ```

  `RefObject` is already imported as a type at the top of the file (`import { memo, useEffect, useRef, type RefObject } from "react";`) — no import change is needed.

  Then add `arrowRef` to the `World` destructure. Find the text:

  ```ts
  const World = memo(function World({ layout, textures, settings, axisRef,
  ```

  and change that prefix to:

  ```ts
  const World = memo(function World({ layout, textures, settings, axisRef, arrowRef,
  ```

  (Leave the rest of the destructure exactly as it is, including whatever tasks 14 and 15 appended.)

- [ ] **Step 3: Run the typecheck and see it fail at the one call site.**

  ```bash
  npx tsc --noEmit
  ```

  Expected failure, in `src/components/realm/realm-shell.tsx` at the `<RealmScene` element (line 491 today):

  ```
  src/components/realm/realm-shell.tsx(491,10): error TS2741: Property 'arrowRef' is missing in type '{ layout: WorldLayout; textures: SpriteTextures; ... }' but required in type 'RealmSceneProps'.
  ```

  This is the whole point of a required prop: the compiler, not a browser, finds the scene that was never handed its arrow.

- [ ] **Step 4: Pass the ref from the shell, and see the typecheck pass.**

  In `src/components/realm/realm-shell.tsx`, find:

  ```tsx
          axisRef={axisRef}
  ```

  and replace it with:

  ```tsx
          axisRef={axisRef}
          arrowRef={arrowRef}
  ```

  `arrowRef` is the `useRef<HTMLDivElement>(null)` Task 9 created in `RealmOpen` and already passes to `<RealmMessages arrowRef={arrowRef} …/>`; the same ref now reaches both the element and the scene that writes it. Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output (clean).

- [ ] **Step 5: The beacon — the focused site, the constants and the geometry.**

  First the import. Find the single line in `realm-scene.tsx` that imports from `@/lib/realm/markers` (Task 13 added it) and add `BEACON` to the names in its braces. After the edit it must contain all four of the names this task needs; verify with:

  ```bash
  grep -n 'from "@/lib/realm/markers"' src/components/realm/realm-scene.tsx
  ```

  Expected: one line containing `BEACON`, `GROUND_Y`, `RING_GOLD` and `RING_CALM` (alongside Task 13's `facingAngle`, `shadowFootprint`, `RING_INNER`, `RING_OUTER`, `RING_NOTCH_ARC`, `SHADOW_OPACITY`, `SHADOW_OPACITY_CALM`).

  Next the refs. Find:

  ```ts
    const ceremonyRef = useRef<CeremonyState | null>(null);
  ```

  and replace it with:

  ```ts
    const ceremonyRef = useRef<CeremonyState | null>(null);
    const beaconMaterial = useRef<THREE.MeshBasicMaterial>(null); // the breathing column; the ground ring holds still
    const arrowShown = useRef(false);
    const arrowAt = useRef({ x: 0, y: 0 });
  ```

  Next the focused site, declared **above** `useFrame` so the frame callback never closes over a binding declared later in the body. Find the mount effect:

  ```ts
    // Mounting/dismounting drops any walk target; the flag itself only ever changes here.
    useEffect(() => {
      hero.current = setMounted(hero.current, riding);
    }, [riding]);
  ```

  and append after it:

  ```ts
    // The one site the child is being sent to, read off the layout rather than out of
    // BUILDING_SLOTS: when slice 4 rewrites the town plan the beacon and the arrow move
    // with it and nothing needs re-siting. Null when the kingdom is complete, when the
    // load failed, and in every other state objectiveState calls `unknown` — no focus,
    // no beacon, no arrow.
    const objectiveSite = layout.props.find((p) => p.focus === "objective") ?? null;
  ```

  Now the drawing constants. Find:

  ```ts
    const standing = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "decor" || p.kind === "barrier");
  ```

  and append after it:

  ```ts
    // Calm shortens and quietens the beacon; it is never absent (§3.9, §6: lowStimulus mutes, never empties).
    const beaconColor = settings.calmPalette ? RING_CALM : RING_GOLD;
    const beaconHeight = settings.calmPalette ? BEACON.calmHeight : BEACON.height;
    const beaconOpacity = settings.calmPalette ? BEACON.calmOpacity : BEACON.opacity;
  ```

  Finally the geometry. Find the line that opens the foundation map:

  ```tsx
        {layout.props.filter((p) => p.kind === "foundation").map((prop) => {
  ```

  and insert this block immediately **before** it:

  ```tsx
        {objectiveSite && (
          <group position={[objectiveSite.position.x, 0, objectiveSite.position.z]}>
            {/* Geometry, not a sprite and not DOM (D3.2): a gold column reads across the
                field, costs no rasterised kind, and survives a failed sprite or a broken
                overlay — the cue of last resort for "where am I meant to go". */}
            <mesh position={[0, beaconHeight / 2, 0]}>
              <cylinderGeometry args={[BEACON.radius, BEACON.radius, beaconHeight, 8]} />
              <meshBasicMaterial ref={beaconMaterial} color={beaconColor} transparent opacity={beaconOpacity} depthWrite={false} />
            </mesh>
            <mesh position={[0, GROUND_Y.heroRing - 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[objectiveSite.size.w / 2 + 0.22, objectiveSite.size.w / 2 + 0.3, 32]} />
              <meshBasicMaterial color={beaconColor} transparent opacity={beaconOpacity} depthWrite={false} />
            </mesh>
          </group>
        )}
  ```

  Run:

  ```bash
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  ```

  Expected: both silent. (`beaconMaterial` is already "used" — the JSX `ref` — so no unused-variable error before the next step wires its per-frame write.)

- [ ] **Step 6: The per-frame writes — the beacon's breath and the arrow's transform.**

  First the import. Find:

  ```ts
  import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
  ```

  and replace it with:

  ```ts
  import { CAMERA_OFFSET, CAMERA_ZOOM, edgeArrow, followCamera } from "@/lib/realm/camera";
  ```

  Then, inside `useFrame`, find the camera write (it is the block just after the `followCamera` call and the hero/companion sprite writes):

  ```ts
      const t = camTarget.current;
      if (camera.current) {
        camera.current.position.set(t.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, t.z + CAMERA_OFFSET.z);
        camera.current.lookAt(t.x, 0, t.z);
      }
  ```

  and replace it with:

  ```ts
      const t = camTarget.current;
      if (camera.current) {
        camera.current.position.set(t.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, t.z + CAMERA_OFFSET.z);
        camera.current.lookAt(t.x, 0, t.z);
      }
      // The column breathes 0.35↔0.55 on a 1.2 Hz sine (2π · 1.2 = Math.PI * 2.4). A hero
      // who asked for less motion gets it held at BEACON.opacity, and a calm palette holds
      // it quieter still: the mark is always there, it just stops moving.
      if (beaconMaterial.current) {
        beaconMaterial.current.opacity = settings.calmPalette
          ? BEACON.calmOpacity
          : settings.motion
            ? BEACON.opacity + Math.sin(state.clock.elapsedTime * Math.PI * 2.4) * 0.1
            : BEACON.opacity;
      }
      // The off-screen arrow is written straight to the DOM: no setState, no queueMicrotask,
      // no React at all, so a memoised World is not re-rendered sixty times a second to move
      // one triangle. `t` is this frame's camera target, so the arrow and the camera can
      // never disagree by a frame. A move under half a pixel is skipped, which means a
      // standing hero writes nothing at all.
      const arrowEl = arrowRef.current;
      if (arrowEl) {
        const arrow = objectiveSite ? edgeArrow(t, objectiveSite.position, state.size) : null;
        if (!arrow) {
          if (arrowShown.current) {
            arrowShown.current = false;
            arrowEl.hidden = true;
          }
        } else if (!arrowShown.current || Math.abs(arrow.x - arrowAt.current.x) >= 0.5 || Math.abs(arrow.y - arrowAt.current.y) >= 0.5) {
          arrowAt.current = { x: arrow.x, y: arrow.y };
          arrowShown.current = true;
          arrowEl.style.transform = `translate(${arrow.x}px, ${arrow.y}px) translate(-50%, -50%) rotate(${arrow.angle}rad)`;
          arrowEl.hidden = false;
        }
      }
  ```

  `state.size` is R3F's canvas size (`{ width, height, top, left }`), which satisfies `Viewport`; on the first frame and in a hidden tab it is zero-sized and `edgeArrow` returns `null`, so the arrow simply stays hidden and nothing divides by zero (§5).

  Run:

  ```bash
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  ```

  Expected: both silent.

- [ ] **Step 7: Dress the arrow once per settings change, and hide it when the world goes away.**

  `RealmMessages` owns the element but takes no `calm` prop (§8 freezes its four props), so the scene — which already owns every calm-and-motion decision for this cue, and already imports `RING_GOLD`/`RING_CALM` for the hero's ground ring — writes the element's colour, its calm opacity and a `data-motion` flag the stylesheet reads. This is a settings-change write, not a per-frame one.

  Find the block you added in Step 5:

  ```ts
    const objectiveSite = layout.props.find((p) => p.focus === "objective") ?? null;
  ```

  and insert **before** it:

  ```ts
    // The arrow element lives in the HUD layer, so the scene dresses it: gold, or the
    // muted ring colour at 0.7 under a calm palette — shown in every mode, never hidden
    // by a setting (§3.5) — plus the flag globals.css reads to still the pulse for a hero
    // who asked for no motion. The cleanup hides it when the world unmounts, because the
    // element outlives the canvas and nothing else would.
    useEffect(() => {
      const el = arrowRef.current;
      if (!el) return;
      el.style.color = settings.calmPalette ? RING_CALM : RING_GOLD;
      el.style.opacity = settings.calmPalette ? "0.7" : "1";
      el.dataset.motion = settings.motion ? "on" : "off";
      return () => {
        el.hidden = true;
      };
    }, [arrowRef, settings.calmPalette, settings.motion]);

  ```

  Run:

  ```bash
  npx tsc --noEmit
  npx eslint src/components/realm/realm-scene.tsx
  ```

  Expected: both silent. In particular no `react-hooks/exhaustive-deps` warning: the ref's value is captured into `el` at the top of the effect and the cleanup closes over `el`, never over `arrowRef.current`.

- [ ] **Step 8: The stylesheet — the arrowhead, the pulse and the two ways to still it.**

  In `src/app/globals.css`, find the `.realm-edge-arrow` rule Task 9 added inside the Realm block — `.realm-edge-arrow { position: absolute; left: 0; top: 0; pointer-events: none; }` — and append these six lines immediately after it. They **add** to task 9's rule rather than restating it: task 9 owns position and pointer-events, this task owns colour, shadow, the arrowhead and the pulse, so neither declares a property the other also declares and there is no second, drifting copy of the same selector's geometry. If you find a `color`, a `border-bottom` or a `width: 0` on task 9's rule, delete them there before appending, or the container will draw a second, unrotated arrowhead of its own.

  ```css
  /* The off-screen objective arrow (§3.5). The scene writes `hidden`, `transform`,
     `color`, `opacity` and `data-motion`; the shape, the pulse and the ban on pointers
     live here. Shown in every mode — calm mutes it, never hides it — and the pulse is
     on the ::before arrowhead, never on the container, because a CSS animation would
     override the inline transform the scene writes sixty times a second. */
  .realm-edge-arrow { color: #c9a84c; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  .realm-edge-arrow[hidden] { display: none; }
  .realm-edge-arrow::before { content: ""; display: block; width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-left: 20px solid currentColor; animation: realm-arrow-pulse 1000ms ease-in-out infinite; }
  @keyframes realm-arrow-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .realm-edge-arrow[data-motion="off"]::before { animation: none; }
  @media (prefers-reduced-motion: reduce) { .realm-edge-arrow::before { animation: none; } }
  ```

  The arrowhead points **right** at rest, which is `angle = 0` for `edgeArrow` (0 = right, growing clockwise on a screen whose y grows downward), so the rotation the scene writes needs no offset. `left: 0; top: 0` plus the `translate(-50%, -50%)` in the scene's transform puts the arrowhead's centre exactly on the border point `edgeArrow` returned.

  Verify the file still parses and nothing else changed:

  ```bash
  grep -n "realm-edge-arrow\|realm-arrow-pulse" src/app/globals.css
  ```

  Expected: Task 9's rule plus the six lines above, and no other rule anywhere in the file uses those names.

- [ ] **Step 9: The full gate — the suite, the typecheck and the lint.**

  ```bash
  npm test
  npm run typecheck
  npm run lint
  ```

  Expected: `npm test` green (no test file was touched; `realm-shell.test.tsx` mocks `./realm-scene` with a props-record component, so a new required scene prop cannot break it). `npm run typecheck` silent. `npm run lint` reports exactly **one** error, the pre-existing one in `src/components/quest-template-list.tsx`, which this branch never touched. Any other error is a regression from this task.

- [ ] **Step 10: Browser pass, check 7 — the arrow appears, points, and goes away.**

  Find the running dev server rather than assuming a port (per the project's screenshot note): `ss -ltnp | grep -E ':3[0-9]{3}'`, then for each candidate confirm `readlink -f /proc/<pid>/cwd` ends in `kingdoms-and-crowns` and `curl -s localhost:<port>/ | grep -o '<title>[^<]*'` reads `<title>Kingdoms & Crowns — Be the Hero of Homeschool`. Start one with `PORT=<free> npm run dev` only if none is up. `DEMO_MODE=true` in `.env.local` means no login flow is needed.

  Open the Realm for a child whose kingdom has at least one unbuilt building, then:

  1. Stand on the spawn path facing the castle and walk north (`W`) until the objective site is behind you. **Expect:** a gold arrowhead appears on the bottom edge of the window, pointing back down-screen toward the site.
  2. Circle the map with `W`/`A`/`S`/`D`. **Expect:** the arrow slides along the viewport border and its heading always points at the beacon; it never leaves a 56 px margin of the edge (so it never hides behind the HUD zones).
  3. Walk back until the beacon column is comfortably inside the frame. **Expect:** the arrow disappears.
  4. In the devtools console confirm the mechanism, not just the pixels:

     ```js
     const a = document.querySelector(".realm-edge-arrow");
     [a.hidden, a.style.transform, a.style.color, a.dataset.motion];
     ```

     **Expect:** while off-screen, `hidden === false` and a `transform` of the form `translate(<x>px, <y>px) translate(-50%, -50%) rotate(<θ>rad)` whose x/y change as you walk; on-screen, `hidden === true`. `color` is `rgb(201, 168, 76)`. If the arrow is visibly offset from the border by a constant amount, an ancestor of `.realm-edge-arrow` has a `transform` or a non-zero inset and is acting as its containing block — the fix belongs in Task 9's `.realm-messages` rule (keep it `position: absolute; inset: 0` with no transform), not in the scene's arithmetic.
  5. Finish a kingdom (or point the session at a child whose eight buildings are all complete). **Expect:** no beacon and no arrow at all — `objectiveState` returns `complete`, no prop carries `focus: "objective"`, and both marks are simply absent (§5).

  Capture one screenshot with the arrow visible for the acceptance record Task 21 assembles.

- [ ] **Step 11: Browser pass, check 8 — reducedMotion and lowStimulus, both on.**

  In Settings → the child's learning profile, turn on **reduced motion** and **low stimulus**, then reopen the Realm.

  **Expect, all at once:**
  - The beacon is still there and is visibly **shorter** (`BEACON.calmHeight` 2.2 units against the 3.4 of the full column, roughly two-thirds the height of the building beside it) and **dimmer** (`BEACON.calmOpacity` 0.18), and its opacity does **not** breathe.
  - The beacon's ground ring and the column are the muted `#8a7d5a`, not gold.
  - The arrow is **present** and muted, and does not pulse. Confirm in the console:

    ```js
    const a = document.querySelector(".realm-edge-arrow");
    [a.style.color, a.style.opacity, a.dataset.motion, getComputedStyle(a, "::before").animationName];
    ```

    **Expect:** `"rgb(138, 125, 90)"`, `"0.7"`, `"off"`, `"none"`.
  - Turn low stimulus back off, leaving reduced motion on. **Expect:** the beacon is gold and full height, holding steady at 0.45 with no breath, and the arrow is gold and static (`data-motion` still `"off"`).

  Take the same-framing screenshot of the calm view for Task 21's before/after pair.

- [ ] **Step 12: Commit.**

  ```bash
  git branch --show-current
  ```

  Expected: `realm-foundations` (several sessions share this checkout — if it is anything else, stop and fix the branch before committing).

  ```bash
  git add src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/app/globals.css
  git status --short
  git commit -m "feat(realm): a gold beacon over the objective site and an off-screen arrow that points to it" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

  Expected from `git status --short`: exactly those three files staged, nothing else. Expected from `git commit`: one commit, three files changed.

---

### Task 17: The reach announcement and one wiring point for speech

**Files:**
- Modify: `src/components/realm/realm-shell.tsx` — `:164` (new `reachNotice` state beside `reachId`), `:266` (`onReachChange` writes the reach line), `:346-351` (a comment recording that the reach line takes no 2-second timer), `:458-467` (`onCeremonyEvent` loses its `speak()` call), and the message-picking block that task 9 added above `if (!portalTarget) return null;` (the `notice ?? reachNotice` merge, the objective effect above it, the lane effect below it)
- Modify: `src/lib/utils/speech.ts:5-10` (the doc comment recording that `readAloud` alone gates `speak()`)
- Test: `src/components/realm/realm-shell.test.tsx` — a `speak` mock beside the other module mocks, and one new `describe("RealmShell reach and speech")` block appended at the end of the file

**Interfaces:**

Consumes (exact signatures, all already in the tree by the time this task runs):
- `pickSpeech(input: MessageInput): RealmSpeech | null` and `type RealmSpeech = { kind: SpeechKind; text: string; tone: "stage"|"cheer"|"plain" }` — task 6, `src/lib/realm/messages.ts`. Task 9 already calls `pickProblem`/`pickSpeech` in the shell; this task only edits the `notice` field of the `MessageInput` it builds and reads the `speech` it produces.
- `objectiveSpeech(state: ObjectiveState): string | null` and `type ObjectiveState = { kind: "unknown" } | { kind: "complete" } | { kind: "next"; objectives: Objective[] }` — task 2, `src/lib/realm/objective.ts`.
- The `objective` memo in `RealmOpen` — `const objective = useMemo(() => objectiveState(kingdom.buildings, surfaces.trackedObjectives), …)`, added by task 11 and passed to `RealmHud` as `objective={objective}`. If task 11 bound it to a different identifier, use that identifier everywhere this task writes `objective`; the value is the same `ObjectiveState`.
- `villagerById(id: string): Villager | null` with `Villager.name` — existing, `src/lib/realm/villagers.ts:34`.
- `speak(text: string): void` — existing, `src/lib/utils/speech.ts:6`, already imported by `realm-shell.tsx:27`.
- The `shown`-filtered reach from task 15: `onReachChange` is only ever called with a villager the scene actually drew, so the reach line can never name an invisible person. Nothing to write here — it is why no extra guard is needed.

Produces (what later tasks and slices rely on):
- `reachNotice` state in `RealmOpen`, merged into the speech lane as `MessageInput.notice = notice ?? reachNotice`. Verbatim copy: `Old Bram is here. Press Enter to talk.` / `Old Bram is here. Tap Talk.`
- The single read-aloud wiring point: `const lastSpoken = useRef<string | null>(null)` + one effect on the picked speech-lane text, and `const spokenObjective = useRef(false)` + one effect for the once-per-visit objective line. No other file in the Realm calls `speak()` for a game message after this task (`realm-help.tsx:51` keeps its own call: it reads the whole card, which is not a lane message).
- `src/lib/utils/speech.ts`'s doc comment, which slice 9 must not contradict.

---

- [ ] **Step 1: Write the three failing reach-announcement tests.**

  Append this block to the very end of `src/components/realm/realm-shell.test.tsx` (after the closing `});` of `describe("RealmShell help card", …)`). It reuses the file's module-level `bundle`, `sceneProps` and `getRealmAccess`.

  ```tsx
  describe("RealmShell reach and speech", () => {
    const inReach = async (id: string | null) => {
      await act(async () => {
        (sceneProps.onReachChange as (id: string | null) => void)(id);
      });
    };

    it("announces the villager in reach whether or not read-aloud is on, and clears it on the way out", async () => {
      expect(bundle.profile.readAloud).toBe(false);
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument();
      await inReach(null);
      expect(screen.queryByText("Old Bram is here. Press Enter to talk.")).not.toBeInTheDocument();
      cleanup();
      render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, readAloud: true } }} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument();
    });

    it("names the touch control when the on-screen stick is showing", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      expect(screen.getByText("Old Bram is here. Tap Talk.")).toBeInTheDocument();
      expect(screen.queryByText("Old Bram is here. Press Enter to talk.")).not.toBeInTheDocument();
    });

    it("lets a spell notice borrow the lane, then puts the reach line back when it expires", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument();
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
      });
      expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
      expect(screen.queryByText("Old Bram is here. Press Enter to talk.")).not.toBeInTheDocument();
      // The spell notice clears itself after two seconds. The reach line never had a timer:
      // it is still there underneath, and comes back on its own.
      await waitFor(() => expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the new tests and watch all three fail.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx -t "RealmShell reach and speech"
  ```

  Expected: 3 failed. Each fails on the first reach assertion with `TestingLibraryElementError: Unable to find an element with the text: Old Bram is here. Press Enter to talk.` (the touch case: `…with the text: Old Bram is here. Tap Talk.`). Nothing in the shell writes a reach string yet.

- [ ] **Step 3: Hold the reach line in its own state and write it from `onReachChange`.**

  In `src/components/realm/realm-shell.tsx`, add the state beside `reachId` (line 164):

  ```tsx
  const [reachId, setReachId] = useState<string | null>(null);
  // The reach line lives beside `notice` rather than inside it: an ordinary notice clears
  // itself after two seconds, and this one must hold for as long as the hero is standing
  // next to someone. The lanes merge them (`notice ?? reachNotice`), so a spell notice
  // borrows the lane for its two seconds and the reach line comes back underneath.
  const [reachNotice, setReachNotice] = useState<string | null>(null);
  ```

  Replace `onReachChange` (line 266) with:

  ```tsx
  // Set whether or not read-aloud is on: the speech lane is an aria-live region, so a
  // screen reader announces the arrival for free, and everyone else reads it.
  const onReachChange = useCallback((id: string | null) => {
    setReachId(id);
    const villager = id ? villagerById(id) : null;
    if (!villager) {
      setReachNotice(null);
      return;
    }
    setReachNotice(settings.showStick ? `${villager.name} is here. Tap Talk.` : `${villager.name} is here. Press Enter to talk.`);
  }, [settings.showStick]);
  ```

  Extend the notice-timer comment (line 346) so the next reader does not "fix" the asymmetry:

  ```tsx
  // A spell notice (a clear, a refusal, lost focus) clears itself the same way.
  // `reachNotice` is deliberately not in this effect: it holds while the hero is in reach
  // and is cleared by `onReachChange` on the way out, never by a timer.
  ```

- [ ] **Step 4: Merge the reach line into the speech lane.**

  Find the `MessageInput` that task 9 built in `RealmOpen` (grep for `pickProblem(`). Two edits:

  1. Change its `notice` entry — task 9 wrote either `notice,` or `notice: notice,` — to:

  ```tsx
    notice: notice ?? reachNotice,
  ```

  2. If task 9 wrapped the input in a `useMemo`, add `reachNotice` to its dependency array (eslint's `react-hooks/exhaustive-deps` will demand it).

  Leave every other field of the object exactly as task 9 wrote it.

  While you are here, confirm the block that builds `messageInput` and calls `pickProblem`/`pickSpeech` sits **above** `if (!portalTarget) return null;` (line 478 before this slice). Step 7 adds two `useEffect`s around it, and a hook may not follow an early return — if task 9 placed the block inside the JSX region below that line, move the three statements verbatim to just above it now, and keep the JSX reading `problem={problem} speech={speech}`.

- [ ] **Step 5: Run the reach tests and watch them pass.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expected: the whole file passes, including the three new reach tests and the untouched ones that call `onReachChange("bram")` before talking (the rise toast still outranks the reach line in the speech lane).

- [ ] **Step 6: Commit the reach announcement.**

  ```bash
  git add src/components/realm/realm-shell.tsx
  ```
  ```bash
  git add src/components/realm/realm-shell.test.tsx
  ```
  ```bash
  git commit -m "feat(realm): announce the villager in reach in the speech lane" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 7: Write the failing read-aloud tests.**

  First add the `speak` mock to `src/components/realm/realm-shell.test.tsx`, immediately after the `vi.mock("@/lib/actions/realm-settings", …)` line (line 28 before this slice):

  ```tsx
  const speakMock = vi.fn();
  vi.mock("@/lib/utils/speech", () => ({
    speak: (text: string) => speakMock(text),
    canSpeak: () => true,
  }));
  ```

  (`vi.clearAllMocks()` in the file's `beforeEach` already resets it. jsdom has no `speechSynthesis`, so the real `speak` is a silent no-op and could never be asserted on.)

  Then append these four tests inside the `describe("RealmShell reach and speech")` block added in step 1, after the three reach tests:

  ```tsx
    const readAloudBundle = { ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, readAloud: true } };
    const OBJECTIVE_LINE = "Your next side quest is at the Village Well. Old Bram is waiting.";

    it("speaks the next objective once when the world first becomes interactive", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 80 });
      });
      expect(speakMock.mock.calls.filter((c) => c[0] === OBJECTIVE_LINE)).toHaveLength(1);
    });

    it("speaks each speech-lane message once, and never twice for the same words", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
      await inReach("bram");
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith("Old Bram is here. Press Enter to talk."));
      const spokenSoFar = speakMock.mock.calls.length;
      // Re-renders that change no message say nothing.
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
      });
      expect(speakMock).toHaveBeenCalledTimes(spokenSoFar);
      await act(async () => {
        (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
      });
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith("Not enough mana yet."));
      expect(speakMock.mock.calls.filter((c) => c[0] === "Old Bram is here. Press Enter to talk.")).toHaveLength(1);
    });

    it("speaks the ceremony narration through the lane, and the objective only once the ceremony is over", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      markCeremonySeen.mockResolvedValue(undefined);
      render(<RealmShell bundle={{ ...readAloudBundle, ceremony: { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" }, banners: 1 }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      // The world is not interactive while the ceremony plays, so the objective waits.
      expect(speakMock).not.toHaveBeenCalledWith(OBJECTIVE_LINE);
      await act(async () => {
        (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: "gather" });
      });
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith("The people of the Realm gather."));
      expect(speakMock.mock.calls.filter((c) => c[0] === "The people of the Realm gather.")).toHaveLength(1);
      await act(async () => {
        (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: "done" });
      });
      await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
      await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
    });

    it("speaks nothing when read-aloud is off, and nothing at all in preview", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument();
      expect(speakMock).not.toHaveBeenCalled();
      cleanup();
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
      render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={false} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await inReach("bram");
      // A parent sees the line and hears nothing: readAloud is the child's setting.
      expect(screen.getByText("Old Bram is here. Press Enter to talk.")).toBeInTheDocument();
      expect(speakMock).not.toHaveBeenCalled();
    });
  ```

- [ ] **Step 8: Run them and watch three fail.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx -t "RealmShell reach and speech"
  ```

  Expected: 3 failed, 4 passed.
  - *"speaks the next objective once…"* fails with `AssertionError: expected "spy" to be called with arguments: [ 'Your next side quest is at the Village Well. Old Bram is waiting.' ]` / `Number of calls: 0`.
  - *"speaks each speech-lane message once…"* fails the same way on its first `waitFor`.
  - *"speaks the ceremony narration through the lane…"* gets past the narration (today's `onCeremonyEvent` calls `speak` directly) and fails on the final `waitFor` for `OBJECTIVE_LINE`.
  - *"speaks nothing when read-aloud is off…"* already passes; it is the guard that fails the moment an implementation forgets the `isChildView` gate.

- [ ] **Step 9: Take the `speak()` call out of the ceremony handler.**

  In `src/components/realm/realm-shell.tsx`, `onCeremonyEvent` (line 458) becomes — note the deleted line and the dependency that goes with it:

  ```tsx
  const onCeremonyEvent = useCallback((e: CeremonyEvent) => {
    if (!ceremonyPending || !ceremonyCrown) return;
    const text = ceremonyNotice(e.step, bundle.heroName, ceremonyCrown.label);
    // The narration is spoken by the one read-aloud wiring point below, off the speech
    // lane it already owns — never from here, or a re-render would stutter it.
    if (text) setCeremonyNoticeText(text);
    if (e.step === "hail") setToast(`Season ${ceremonyPending.ordinal} complete`);
    if (e.step === "done") recordCeremony();
  }, [ceremonyPending, ceremonyCrown, bundle.heroName, recordCeremony]);
  ```

- [ ] **Step 10: Add the two speech effects around the message-picking block.**

  Still in `src/components/realm/realm-shell.tsx`. Add `objectiveSpeech` to the existing `@/lib/realm/objective` import that task 11 added:

  ```tsx
  import { objectiveSpeech, objectiveState, riseToast } from "@/lib/realm/objective";
  ```

  Insert this **immediately above** the `messageInput` / `pickProblem` / `pickSpeech` block:

  ```tsx
  // The one line spoken outside the lane: the objective, once per visit, when the world
  // first becomes interactive — textures loaded, help card closed, no panel, no ceremony.
  // Declared before the lane effect so that if both fire in one commit the lane's
  // higher-priority message takes the voice last (speak() cancels what is still playing).
  const spokenObjective = useRef(false);
  useEffect(() => {
    if (spokenObjective.current) return;
    if (!isChildView || !bundle.profile.readAloud) return; // a parent's preview never speaks
    if (!textures || panelOpen || ceremonyRunning || helpOpen) return;
    const line = objectiveSpeech(objective);
    if (!line) return; // an unknown kingdom says nothing; a successful retry can still speak it
    spokenObjective.current = true;
    speak(line);
  }, [textures, panelOpen, ceremonyRunning, helpOpen, isChildView, bundle.profile.readAloud, objective]);
  ```

  and this **immediately below** it (after `const speech = pickSpeech(messageInput);`):

  ```tsx
  // Read-aloud has exactly one wiring point: whatever the speech lane is showing is what
  // is read. Ceremony narration, the rise toast, the reach line, gleams, laps and every
  // notice are spoken once each, in the lane's own priority order, because speak()'s
  // cancel() hands the voice to the message that won. `lastSpoken` stops a re-render
  // stuttering the same sentence.
  const spokenText = speech?.text ?? null;
  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!isChildView || !bundle.profile.readAloud) return;
    if (!spokenText || spokenText === lastSpoken.current) return;
    lastSpoken.current = spokenText;
    speak(spokenText);
  }, [spokenText, isChildView, bundle.profile.readAloud]);
  ```

- [ ] **Step 11: Run the file and watch all seven pass.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expected: every test in the file passes, including the seven in `RealmShell reach and speech`. The older ceremony tests still pass: `onCeremonyEvent` still sets `ceremonyNoticeText`, so `Hail, Lily, Copper Circlet!` still renders; only the direct `speak()` left.

- [ ] **Step 12: Record the `soundEnabled` rule in `speech.ts`.**

  Replace the doc comment at `src/lib/utils/speech.ts:5` so the whole file reads:

  ```ts
  export function canSpeak(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
  }

  /**
   * Reads `text` aloud, replacing anything still being spoken. A no-op where speech is unavailable.
   *
   * Read-aloud is gated by `profile.readAloud` alone and never by `profile.soundEnabled`.
   * `readAloud` is an access feature; `soundEnabled` governs game sound, which is a
   * different channel. Nothing that mutes the game may be allowed to mute this call.
   */
  export function speak(text: string) {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  ```

- [ ] **Step 13: Verify the whole tree, then commit.**

  ```bash
  npm test
  ```
  Expected: all suites pass.
  ```bash
  npm run typecheck
  ```
  Expected: no output, exit 0.
  ```bash
  npx eslint src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/lib/utils/speech.ts
  ```
  Expected: no output. (The one pre-existing lint error lives in `src/components/quest-template-list.tsx`, which is not in this list.)
  ```bash
  git add src/components/realm/realm-shell.tsx
  ```
  ```bash
  git add src/components/realm/realm-shell.test.tsx
  ```
  ```bash
  git add src/lib/utils/speech.ts
  ```
  ```bash
  git commit -m "feat(realm): give read-aloud one wiring point and speak the objective once a visit" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 14: Hand browser-pass check 10 to task 21.**

  Nothing in this task touches `realm-scene.tsx`, so there is no scene gate here — but the spoken half cannot be proved in jsdom (the `speak` mock proves *what* is asked for, not that a voice says it once). Record for task 21, on the documented port-3100 `?preview` setup with a hero whose profile has `readAloud` on:

  > **Browser-pass check 10 — read-aloud.** Enter a villager's reach, finish a side quest, run a ceremony: three sentences, once each, no stutter. Specifically: walking into Old Bram's reach says `Old Bram is here. Press Enter to talk.` exactly once and does not repeat while standing there; the objective line `Your next side quest is at the Village Well. Old Bram is waiting.` is spoken once at the start of the visit and never again; a rise toast interrupts a standing notice rather than queueing behind it.

  No screenshot is needed for this check; note it in task 21's evidence as heard, not seen.

---

### Task 18: The help card: the false promise deleted, 'Where to go' added, and the child's escape hatch

**Files:**
- Create: —
- Modify:
  - `src/components/realm/realm-help.tsx:1-37` — imports gain `useState` and `type RealmDepth`; two module consts (`DEPTH_SAVE_FAILED`, `DEPTH_CONTROL`); `helpGroups` gains the `Where to go` group second and loses `Clear troubles to protect the sites.` from both Cast strings
  - `src/components/realm/realm-help.tsx:39-93` — `RealmHelp` gains `depth` and `onSetDepth`, a `saving`/`saveFailed` pair, the foot control with its hint and failure line, and a Tab cycle that now has two stops instead of one
  - `src/components/realm/realm-shell.tsx:9` — `import { markRealmHelpSeen, setRealmDepth } from "@/lib/actions/realm-settings";`
  - `src/components/realm/realm-shell.tsx` — the `@/lib/realm/depth` import added by task 10 gains `type RealmDepth`
  - `src/components/realm/realm-shell.tsx` — task 10's `const [depth] = useState(() => bundle.depth);` becomes `const [depth, setDepth] = useState(() => bundle.depth);`
  - `src/components/realm/realm-shell.tsx:383-393` — `canSetDepth` and the `onSetDepth` callback, added directly after the `onHelpClose` callback
  - `src/components/realm/realm-shell.tsx:571` — the `<RealmHelp …/>` render gains `depth` and `onSetDepth`
- Test:
  - `src/components/realm/realm-help.test.tsx:1-39` (the whole file is rewritten across steps 1 and 6)
  - `src/components/realm/realm-shell.test.tsx:27-28` (the `@/lib/actions/realm-settings` mock gains `setRealmDepth`), `:95` (the shared `bundle` literal), `:97-103` (`beforeEach`), `:608-686` (two cases appended inside the `RealmShell help card` describe)

**Interfaces:**

*Consumes*
```ts
// task 1 — src/lib/realm/depth.ts
type RealmDepth = "simple" | "full";
// task 8 — src/lib/actions/realm-settings.ts ("use server")
async function setRealmDepth(childId: string, override: DepthOverride): Promise<void>;
// task 8 — src/lib/actions/realm.ts
RealmBundle.depth: RealmDepth;
// task 10 — src/components/realm/realm-shell.tsx, inside RealmOpen
const [depth] = useState(() => bundle.depth);            // this task adds the setter
const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile]);
```

*Produces*
```ts
// src/components/realm/realm-help.tsx
export type HelpGroup = { icon: GameIconName; title: string; text: string };
export function helpGroups(touch: boolean, ceremony: boolean): HelpGroup[];
//   → titles ["Move", "Where to go", "Talk", "Cast", "Ride and recess"] (+ "Ceremony" when ceremony)
export function RealmHelp(props: {
  touch: boolean;
  ceremony: boolean;
  readAloud: boolean;
  depth: RealmDepth;
  onSetDepth: ((d: RealmDepth) => void) | null;   // null in preview and under fewerChoices
  onClose: () => void;
}): React.JSX.Element;
// src/components/realm/realm-shell.tsx, inside RealmOpen
const [depth, setDepth] = useState(() => bundle.depth);
const canSetDepth: boolean;                        // isChildView && !bundle.profile.fewerChoices
const onSetDepth: (next: RealmDepth) => Promise<void>;  // writes, then moves the visit's depth
```

The prop type `((d: RealmDepth) => void) | null` is §8's frozen signature and is not widened. The shell's implementation returns the write's promise anyway (a promise-returning function is assignable to a void-returning type), and the card wraps the call in `Promise.resolve(...)` so it can wait for the column. That is the whole mechanism behind "the visit's depth is **not** changed" on failure (§5).

---

- [ ] **Step 1: Rewrite the `helpGroups` describe in `src/components/realm/realm-help.test.tsx` for the five titles, the two new Cast strings and the deleted promise.**

  Replace lines 1-26 of `src/components/realm/realm-help.test.tsx` (the imports, `afterEach` and the whole `describe("helpGroups", …)` block — everything above the blank line before `describe("RealmHelp"`) with:

  ```tsx
  import { describe, it, expect, vi, afterEach } from "vitest";
  import { render, screen, cleanup, fireEvent } from "@testing-library/react";
  import { RealmHelp, helpGroups } from "./realm-help";

  afterEach(cleanup);

  describe("helpGroups", () => {
    it("speaks keys to a keyboard hero and taps to a touch hero", () => {
      const keys = helpGroups(false, false);
      expect(keys.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
      expect(keys[0].text).toBe("WASD or the arrow keys, or click where you want to go.");
      expect(keys[1].text).toBe("Follow the gold light. Someone is waiting there.");
      expect(keys[2].text).toBe("Walk up to a villager and press Enter, or tap Talk. They'll give you a side quest.");
      expect(keys[3].text).toBe("Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.");
      expect(keys[4].text).toBe("Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
      const touch = helpGroups(true, false);
      expect(touch.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
      expect(touch[0].text).toBe("Drag the stick, or tap where you want to go.");
      expect(touch[1].text).toBe("Follow the gold light. Someone is waiting there.");
      expect(touch[2].text).toBe("Walk up to a villager and tap Talk. They'll give you a side quest.");
      expect(touch[3].text).toBe("Tap a spell page, then tap where the spell should go.");
      expect(touch[4].text).toBe("Tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
      // `.map` first: joining the group objects themselves compares "[object Object]" and asserts nothing.
      expect(touch.map((g) => g.text).join(" ")).not.toMatch(/WASD|Enter|Space|Press M|\(1, 2, 3, 4\)/);
    });

    it("promises nothing that clearing a trouble does not do", () => {
      for (const touch of [false, true]) {
        for (const ceremony of [false, true]) {
          for (const g of helpGroups(touch, ceremony)) expect(g.text).not.toMatch(/protect the sites/);
        }
      }
    });

    it("adds the ceremony line only during a ceremony", () => {
      expect(helpGroups(false, true).at(-1)?.text).toBe("Skip the ceremony with Escape or the Skip button.");
      expect(helpGroups(false, false).some((g) => g.title === "Ceremony")).toBe(false);
    });
  });
  ```

  The imports stay exactly as they are today apart from this rewrite; step 6 adds `act` when the first case needs it.

- [ ] **Step 2: Run the test and watch it fail on the missing group.**

  ```bash
  npx vitest run src/components/realm/realm-help.test.tsx
  ```

  Expect a failure in `speaks keys to a keyboard hero and taps to a touch hero`:
  `AssertionError: expected [ 'Move', 'Talk', 'Cast', 'Ride and recess' ] to deeply equal [ 'Move', 'Where to go', 'Talk', 'Cast', 'Ride and recess' ]`,
  and a second failure in `promises nothing that clearing a trouble does not do`:
  `expected 'Pick a spell page (1, 2, 3, 4) or tap …' not to match /protect the sites/`.

- [ ] **Step 3: Rewrite `helpGroups` in `src/components/realm/realm-help.tsx`.**

  Replace lines 11-37 (the doc comment and the whole `helpGroups` function) with:

  ```tsx
  /** The controls, in the words the hero's input mode needs. Written for a reader of about eight. */
  export function helpGroups(touch: boolean, ceremony: boolean): HelpGroup[] {
    const groups: HelpGroup[] = [
      { icon: "compass", title: "Move", text: touch ? "Drag the stick, or tap where you want to go." : "WASD or the arrow keys, or click where you want to go." },
      // Second, because the card has never said what the world is for. The gold light is the
      // beacon over the objective site and the edge arrow that points at it when it is off-screen.
      { icon: "map", title: "Where to go", text: "Follow the gold light. Someone is waiting there." },
      {
        icon: "scroll",
        title: "Talk",
        text: touch
          ? `Walk up to a villager and tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`
          : `Walk up to a villager and press Enter, or tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`,
      },
      {
        // No stakes clause. Nothing a trouble does touches a site, a building, a villager or the
        // kingdom — the worst it does is a 1.5-second dazzle — so the card says nothing about
        // stakes, which is true, rather than something false. Slice 8 writes the replacement when
        // clearing a trouble actually earns Realm minutes.
        icon: "sparkles",
        title: "Cast",
        text: touch
          ? "Tap a spell page, then tap where the spell should go."
          : "Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.",
      },
      {
        icon: "map",
        title: "Ride and recess",
        text: touch ? "Tap Ride to get on your mount. At recess, collect gleams and run the lap ring." : "Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.",
      },
    ];
    if (ceremony) groups.push({ icon: "crown", title: "Ceremony", text: "Skip the ceremony with Escape or the Skip button." });
    return groups;
  }
  ```

- [ ] **Step 4: Run the test and watch it pass.**

  ```bash
  npx vitest run src/components/realm/realm-help.test.tsx
  ```

  Expect `Test Files 1 passed (1)`, `Tests 4 passed (4)` — the three `helpGroups` cases plus the untouched `RealmHelp` dialog case.

- [ ] **Step 5: Commit the copy change.**

  ```bash
  git add src/components/realm/realm-help.tsx src/components/realm/realm-help.test.tsx
  ```
  ```bash
  git commit -m "fix(realm): delete the help card's false promise and say where to go" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Add the view-control cases to `src/components/realm/realm-help.test.tsx`.**

  First extend line 2 so `act` is available:

  ```tsx
  import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
  ```

  Then replace the whole `describe("RealmHelp", …)` block (the last block in the file) with:

  ```tsx
  describe("RealmHelp", () => {
    it("is a dialog named How to play that closes on Close and on Escape", () => {
      const onClose = vi.fn();
      render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onClose={onClose} />);
      const dialog = screen.getByRole("dialog", { name: "How to play" });
      expect(dialog).toHaveFocus();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("offers everything on the simple view and simplicity on the full one, naming no axis", async () => {
      const onSetDepth = vi.fn();
      const { rerender } = render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Show me everything" })).toBeInTheDocument();
      expect(screen.getByText("More numbers, more to do. You can change it back.")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
      });
      expect(onSetDepth).toHaveBeenCalledWith("full");
      rerender(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={onSetDepth} onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Keep it simple" })).toBeInTheDocument();
      expect(screen.getByText("Fewer numbers, one thing at a time.")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Keep it simple" }));
      });
      expect(onSetDepth).toHaveBeenLastCalledWith("simple");
      // "Depth", "simple mode" and "advanced" are never words a child reads.
      expect(document.body.textContent).not.toMatch(/depth|simple mode|advanced/i);
    });

    it("shows no view control when the card is not allowed to offer one", () => {
      render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={null} onClose={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Keep it simple" })).not.toBeInTheDocument();
      expect(screen.queryByText("More numbers, more to do. You can change it back.")).not.toBeInTheDocument();
    });

    it("says so when the write does not land, and keeps offering the same swap", async () => {
      const onSetDepth = vi.fn(() => Promise.reject(new Error("offline")));
      render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onClose={vi.fn()} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
      });
      expect(screen.getByRole("alert")).toHaveTextContent("That didn't save. Try again.");
      expect(screen.getByRole("button", { name: "Show me everything" })).toBeEnabled();
    });

    it("keeps Tab inside the card, cycling its own two controls", () => {
      render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={vi.fn()} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog", { name: "How to play" });
      const close = screen.getByRole("button", { name: "Close" });
      const control = screen.getByRole("button", { name: "Show me everything" });
      fireEvent.keyDown(dialog, { key: "Tab" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: "Tab" });
      expect(control).toHaveFocus();
      fireEvent.keyDown(control, { key: "Tab" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(control).toHaveFocus();
    });
  });
  ```

- [ ] **Step 7: Run the test and watch it fail on the missing props.**

  ```bash
  npx vitest run src/components/realm/realm-help.test.tsx
  ```

  Expect the four new cases to fail — `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Show me everything"` — and `npx tsc --noEmit` would report `Property 'depth' does not exist on type …`. (The dialog case still passes: the extra props are ignored at runtime.)

- [ ] **Step 8: Add the view control to `src/components/realm/realm-help.tsx`.**

  Replace lines 1-9 (the imports and the `HelpGroup` type) with:

  ```tsx
  "use client";

  import { useEffect, useRef, useState } from "react";
  import { Button } from "@/components/ui/button";
  import { GameIcon, type GameIconName } from "@/components/game-icon";
  import type { RealmDepth } from "@/lib/realm/depth";
  import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
  import { speak } from "@/lib/utils/speech";

  export type HelpGroup = { icon: GameIconName; title: string; text: string };

  /** The write did not land, so the card says so rather than showing a view the column does not hold. */
  const DEPTH_SAVE_FAILED = "That didn't save. Try again.";

  /**
   * The hero's own escape hatch. The button names the outcome, never the axis: "depth",
   * "simple mode" and "advanced" are words no child reads. Slice 9 moves this control onto
   * the real opening gate and off the card.
   */
  const DEPTH_CONTROL: Record<RealmDepth, { next: RealmDepth; label: string; hint: string }> = {
    simple: { next: "full", label: "Show me everything", hint: "More numbers, more to do. You can change it back." },
    full: { next: "simple", label: "Keep it simple", hint: "Fewer numbers, one thing at a time." },
  };
  ```

  Then replace everything from `/** The how-to-play card:` to the end of the file with:

  ```tsx
  /** The how-to-play card: a dialog inside .realm-root; the world's controls are disabled while it is open. */
  export function RealmHelp({
    touch,
    ceremony,
    readAloud,
    depth,
    onSetDepth,
    onClose,
  }: {
    touch: boolean;
    ceremony: boolean;
    readAloud: boolean;
    depth: RealmDepth;
    onSetDepth: ((d: RealmDepth) => void) | null;
    onClose: () => void;
  }) {
    const panel = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const depthButton = useRef<HTMLButtonElement>(null);
    const [saving, setSaving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);
    const groups = helpGroups(touch, ceremony);
    const control = DEPTH_CONTROL[depth];

    useEffect(() => {
      panel.current?.focus();
    }, []);

    // Read-aloud speaks the whole card once; the effect only starts speech, it sets no state.
    useEffect(() => {
      if (readAloud) speak(groups.map((g) => `${g.title}. ${g.text}`).join(" "));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readAloud]);

    // The prop is typed `(d: RealmDepth) => void` — the frozen interface — but the shell's
    // implementation hands back the write's promise. Wrapping the call in Promise.resolve is
    // what lets the card wait for the column: on a rejection the view does not move and the
    // card says so, so the control never lies about what was stored.
    const onDepthPress = () => {
      if (!onSetDepth) return;
      setSaving(true);
      setSaveFailed(false);
      void Promise.resolve(onSetDepth(control.next)).then(
        () => setSaving(false),
        () => {
          setSaving(false);
          setSaveFailed(true);
        }
      );
    };

    return (
      <div className="realm-overlay" onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={panel}
          className="realm-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="realm-help-title"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            } else if (e.key === "Tab") {
              // Tab cycles the card's own controls — Close, and the view control when it is
              // offered — and never wanders out into the HUD behind the card.
              e.preventDefault();
              const stops = [closeButton.current, depthButton.current].filter((el): el is HTMLButtonElement => el !== null);
              if (stops.length === 0) return;
              const at = stops.indexOf(document.activeElement as HTMLButtonElement);
              const step = e.shiftKey ? stops.length - 1 : 1;
              stops[at === -1 ? (e.shiftKey ? stops.length - 1 : 0) : (at + step) % stops.length].focus();
            }
          }}
        >
          <div className="realm-panel-head">
            <GameIcon name="book" className="size-6 text-[var(--gold-bright)]" />
            <h2 id="realm-help-title" className="text-lg font-bold">How to play</h2>
            <Button ref={closeButton} size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Close</Button>
          </div>
          <ul className="realm-help-list">
            {groups.map((g) => (
              <li key={g.title} className="realm-help-item">
                <GameIcon name={g.icon} className="size-6 shrink-0 text-[var(--gold-bright)]" />
                <div>
                  <p className="font-medium">{g.title}</p>
                  <p className="text-sm text-muted-foreground">{g.text}</p>
                </div>
              </li>
            ))}
          </ul>
          {onSetDepth && (
            <div className="flex flex-col gap-1 border-t border-[var(--gold-dim)] pt-3">
              <Button ref={depthButton} variant="outline" size="lg" disabled={saving} onClick={onDepthPress}>{control.label}</Button>
              <p className="text-sm text-muted-foreground">{control.hint}</p>
              {saveFailed && <p role="alert" className="text-sm text-destructive">{DEPTH_SAVE_FAILED}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

  `.realm-panel button { min-height: 44px }` (globals.css:1733) already gives the control a 44px target — it sits inside a panel, not over the 3D world, so it takes the panel size, not `--realm-touch`.

- [ ] **Step 9: Run the card's tests and watch them pass.**

  ```bash
  npx vitest run src/components/realm/realm-help.test.tsx
  ```

  Expect `Test Files 1 passed (1)`, `Tests 8 passed (8)`. `npx tsc --noEmit` still fails at this point with `Property 'depth' is missing in type … but required in type …` at `realm-shell.tsx:571` — step 12 closes that.

- [ ] **Step 10: Wire `setRealmDepth` into `src/components/realm/realm-shell.test.tsx` and add the two shell cases.**

  First, replace line 28 (the `@/lib/actions/realm-settings` mock) with:

  ```tsx
  const setRealmDepth = vi.fn();
  vi.mock("@/lib/actions/realm-settings", () => ({
    markRealmHelpSeen: (...a: unknown[]) => markRealmHelpSeen(...a),
    setRealmDepth: (...a: unknown[]) => setRealmDepth(...a),
  }));
  ```

  Second, confirm the shared `bundle` literal (line 95) already carries the fields task 8 added to `RealmBundle`:

  ```bash
  grep -n 'depth: "' src/components/realm/realm-shell.test.tsx
  ```

  If that prints nothing, append `, depth: "full" as const, depthOverride: "auto" as const` inside the `bundle` object literal, immediately after `helpSeen: true`.

  Third, add to `beforeEach` (after `vi.clearAllMocks();`, which clears calls but not implementations):

  ```tsx
    setRealmDepth.mockResolvedValue(undefined);
  ```

  Fourth, insert these two cases inside `describe("RealmShell help card", …)`, immediately before its closing `});`:

  ```tsx
    it("lets a hero swap views from the card, and keeps the visit's view when the write fails", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      setRealmDepth.mockRejectedValueOnce(new Error("offline"));
      render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      fireEvent.click(screen.getByRole("button", { name: "How to play" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
      });
      expect(setRealmDepth).toHaveBeenCalledWith("c1", "full");
      expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
      // The write never landed, so the visit is still on the simple view.
      expect(screen.getByRole("button", { name: "Show me everything" })).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
      });
      expect(setRealmDepth).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Keep it simple" })).toBeInTheDocument();
      expect(screen.queryByText("That didn't save. Try again.")).not.toBeInTheDocument();
    });

    it("never offers the view control to a parent, or to a hero who needs fewer choices", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
      render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={false} />);
      await screen.findByTestId("scene");
      fireEvent.click(screen.getByRole("button", { name: "How to play" }));
      expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
      cleanup();
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={{ ...bundle, depth: "simple" as const, profile: { ...DEFAULT_LEARNING_PROFILE, fewerChoices: true } }} childId="c1" isChildView={true} />);
      await screen.findByTestId("scene");
      fireEvent.click(screen.getByRole("button", { name: "How to play" }));
      expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
      expect(setRealmDepth).not.toHaveBeenCalled();
    });
  ```

- [ ] **Step 11: Run the shell's tests and watch the new cases fail.**

  ```bash
  npx vitest run src/components/realm/realm-shell.test.tsx
  ```

  Expect `lets a hero swap views from the card…` to fail with `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Show me everything"` — the shell is still passing `onSetDepth` nowhere, so the card renders no control. The parent/fewerChoices case passes already (a missing control is missing for everyone); it is the regression guard, and it must stay green through step 13.

- [ ] **Step 12: Wire the shell to the action and to the visit's depth.**

  In `src/components/realm/realm-shell.tsx`:

  1. Replace line 9 with:
     ```tsx
     import { markRealmHelpSeen, setRealmDepth } from "@/lib/actions/realm-settings";
     ```
  2. Extend the `@/lib/realm/depth` import that task 10 added so it also brings the type:
     ```tsx
     import { surfacesFor, type RealmDepth, type Surfaces } from "@/lib/realm/depth";
     ```
  3. Give task 10's depth snapshot a setter:
     ```tsx
     const [depth, setDepth] = useState(() => bundle.depth);
     ```
  4. Directly after the `onHelpClose` callback (which ends `}, [childId, isChildView, beginCeremonyIfWaiting, returnFocus]);` at line 393), add:
     ```tsx
     // The hero's own escape hatch (§3.15). A parent never presses it — they change the same
     // column in Settings, under the child's name — and fewerChoices removes the choice rather
     // than offering it. `setDepth` runs only after the write resolves, so the visit never shows
     // a view the column does not hold; the card renders "That didn't save. Try again." when the
     // promise rejects. `surfaces` re-derives from `depth`, and nothing else in the world moves.
     const canSetDepth = isChildView && !bundle.profile.fewerChoices;
     const onSetDepth = useCallback((next: RealmDepth) => setRealmDepth(childId, next).then(() => setDepth(next)), [childId]);
     ```
  5. Replace line 571 (the `RealmHelp` render) with:
     ```tsx
           {helpOpen && (
             <RealmHelp
               touch={settings.showStick}
               ceremony={ceremonyRunning}
               readAloud={bundle.profile.readAloud}
               depth={depth}
               onSetDepth={canSetDepth ? onSetDepth : null}
               onClose={onHelpClose}
             />
           )}
     ```

- [ ] **Step 13: Run both test files and watch them pass.**

  ```bash
  npx vitest run src/components/realm/realm-help.test.tsx src/components/realm/realm-shell.test.tsx
  ```

  Expect `Test Files 2 passed (2)` and every case green, including the two new shell cases and the untouched `RealmShell help card` cases above them.

- [ ] **Step 14: Typecheck, lint and the whole suite.**

  ```bash
  npm run typecheck
  ```
  Expect no output (exit 0).

  ```bash
  npx eslint src/components/realm/realm-help.tsx src/components/realm/realm-help.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expect no output (exit 0).

  ```bash
  npm test
  ```
  Expect every file green.

  ```bash
  npm run lint
  ```
  Expect exactly one error, the pre-existing one in `src/components/quest-template-list.tsx`, which this branch never touched.

- [ ] **Step 15: Commit the escape hatch.**

  ```bash
  git add src/components/realm/realm-help.tsx src/components/realm/realm-help.test.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
  ```
  ```bash
  git commit -m "feat(realm): give a hero their own way out of the simple view" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 19: The parent's three-way depth control in Realm settings

A grown-up gets the same escape hatch the child has on the help card (task 18), in the place a grown-up already goes: the Realm panel under the child's name in Settings. Three radios — **Automatic**, **Simple**, **Everything** — written straight through the existing `save` helper as `{ depthOverride }`, which `updateRealmSettings` already validates (task 8). Spec §2 D7.3/D7.4, §4 (type and action changes), §3.17 (`'Show me everything'` is suppressed in the parent's preview; a parent changes it here instead).

The binding rule for this task: **the word "depth" never reaches a screen.** It is a code word for the complexity axis, not a word a family reads. The parent reads "How much the Realm shows".

**Files:**
- Modify: `src/app/(app)/settings/realm-settings-panel.tsx` — import `DEPTH_OVERRIDES` / `DepthOverride` (after line 16), add the `DEPTH_LABELS` record (after the `MODES` const, which ends at line 22), and add the fieldset between the tone-mode row (ends line 138) and the banked-minutes row (starts line 140). No other change; `save`, `run`, `busy` and `error` are reused exactly as they are.
- Test: `src/app/(app)/settings/realm-settings-panel.test.tsx` — three cases appended inside the existing `describe("RealmSettingsPanel")` block (the block closes at line 58 today).

**Interfaces:**

Consumes (exact signatures, both from earlier tasks):
```ts
// src/lib/realm/depth.ts                              (task 1)
export type DepthOverride = "auto" | "simple" | "full";
export const DEPTH_OVERRIDES: DepthOverride[];        // ["auto", "simple", "full"]

// src/lib/utils/realm-settings.ts                     (task 8)
export type RealmSettings = { …; depthOverride: DepthOverride };
export const DEFAULT_REALM_SETTINGS: RealmSettings;   // .depthOverride === "auto"
// validateRealmSettingsPatch: case "depthOverride" → isDepthOverride(v) or throw
//   "Choose automatic, simple, or everything."

// src/lib/actions/realm-settings.ts                   (existing, parent-only, unchanged)
export async function updateRealmSettings(childId: string, patch: Partial<RealmSettings>): Promise<void>;
```

Produces (nothing later in this slice consumes it; it is a leaf):
- the parent-facing three-way control in `RealmSettingsPanel`, writing `{ depthOverride }` through `updateRealmSettings`.

**This task must run after tasks 1 and 8.** Task 1 creates `src/lib/realm/depth.ts`; task 8 puts `depthOverride` on `RealmSettings`, on `DEFAULT_REALM_SETTINGS` and into `validateRealmSettingsPatch`. Without both, step 3 does not compile and step 5 cannot go green.

---

- [ ] **Step 1: Write the three failing tests.**

Open `src/app/(app)/settings/realm-settings-panel.test.tsx`. The file's last test today is `"lets a parent show the how-to-play card again"`, which ends with `});` on line 57, followed by the describe block's closing `});` on line 58. Insert the three cases below **between those two lines** — i.e. after the how-to-play test's closing `});`, still inside `describe`.

```tsx
  it("offers three ways the Realm can look, with the stored one checked", () => {
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, depthOverride: "simple" }} summary={summary} />);
    expect(screen.getByRole("radio", { name: "Automatic" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Simple" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Everything" })).not.toBeChecked();
    expect(screen.getByText("Simple at first, everything once they know the world.")).toBeInTheDocument();
    expect(screen.getByText("Fewer numbers, one thing at a time.")).toBeInTheDocument();
    expect(screen.getByText("More numbers, more to do.")).toBeInTheDocument();
  });

  it("saves a change to how much the Realm shows", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("radio", { name: "Simple" }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { depthOverride: "simple" });
  });

  it("never says the word depth on screen", () => {
    const { container } = render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(container.textContent?.toLowerCase()).not.toContain("depth");
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")?.toLowerCase()).not.toContain("depth");
    }
  });
```

Nothing else in the file changes: `render`, `screen`, `userEvent`, `DEFAULT_REALM_SETTINGS` and the `updateRealmSettings` mock are already imported at lines 1-18, and `beforeEach(() => vi.clearAllMocks())` at line 22 keeps the mock call counts honest between cases.

- [ ] **Step 2: Run the tests and watch them fail.**

```bash
npx vitest run "src/app/(app)/settings/realm-settings-panel.test.tsx"
```

Expected: `Tests 6 passed | 2 failed (8)` — the five pre-existing cases plus the third new one, against the two new failures. The first and second new cases fail with `TestingLibraryElementError: Unable to find an accessible element with the role "radio" and name "Automatic"` (the control does not exist yet); the third passes vacuously — it is the guard that stays true for the life of the file, not a red-to-green case.

- [ ] **Step 3: Add the import and the parent-facing wording.**

In `src/app/(app)/settings/realm-settings-panel.tsx`, add one import line directly after line 16 (`import type { RealmAccessMode } from "@/lib/utils/realm-access";`):

```tsx
import { DEPTH_OVERRIDES, type DepthOverride } from "@/lib/realm/depth";
```

Then, directly after the `MODES` const (its closing `];` is line 22), add:

```tsx
/**
 * The parent's words for the complexity axis. "depth" is a code word — it never reaches a screen,
 * here or in the Realm (§2 D7.3). Keyed by DepthOverride, so a fourth override fails the build.
 */
const DEPTH_LABELS: Record<DepthOverride, { label: string; hint: string }> = {
  auto: { label: "Automatic", hint: "Simple at first, everything once they know the world." },
  simple: { label: "Simple", hint: "Fewer numbers, one thing at a time." },
  full: { label: "Everything", hint: "More numbers, more to do." },
};
```

- [ ] **Step 4: Render the fieldset.**

In the same file, insert the block below between the tone-mode row's closing `</div>` (line 138) and the banked-minutes row that opens on line 140 (`<div className="flex flex-wrap items-center justify-between gap-2 …">` whose first child paragraph reads `{summary.balance} minutes banked today`). It sits after tone because both answer "what is the world like", and before the minutes ledger because that answers "how much can they play".

```tsx
      <fieldset className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How much the Realm shows</legend>
        <p className="px-1 pb-2 text-xs text-muted-foreground">This changes what is on screen, never minutes, tone, or what the quests are.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTH_OVERRIDES.map((id) => (
            <label key={id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`realm-shows-${childId}`}
                value={id}
                checked={settings.depthOverride === id}
                disabled={busy}
                onChange={() => save({ depthOverride: id })}
                aria-label={DEPTH_LABELS[id].label}
              />
              <span>
                <span className="font-medium">{DEPTH_LABELS[id].label}</span>
                <span className="block text-xs text-muted-foreground">{DEPTH_LABELS[id].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
```

Three things this deliberately mirrors from the `How play time opens` fieldset immediately above it (lines 68-109): the radio group is named per child so two children's panels on one page do not share a group; `aria-label` carries the short label so the accessible name is `Automatic` and not the label plus its hint; and `disabled={busy}` keeps a second write out while the first is in flight. The radio order and completeness come from `DEPTH_OVERRIDES`, so the contract module owns the list and this file owns only the words.

- [ ] **Step 5: Run the tests and watch them pass.**

```bash
npx vitest run "src/app/(app)/settings/realm-settings-panel.test.tsx"
```

Expected: `Tests 8 passed (8)`. If `saves a change to how much the Realm shows` reports `updateRealmSettings` called with `{ depthOverride: "auto" }`, the `onChange` is reading `settings.depthOverride` instead of `id` — pass `id`.

- [ ] **Step 6: Typecheck, lint, and the whole suite.**

```bash
npm run typecheck
```
Expected: no output, exit 0. A `Property 'depthOverride' does not exist on type 'RealmSettings'` here means task 8 has not landed; stop and land it first rather than widening the type from this file.

```bash
npx eslint "src/app/(app)/settings/realm-settings-panel.tsx" "src/app/(app)/settings/realm-settings-panel.test.tsx"
```
Expected: no output, exit 0. Both files lint clean today, so anything reported here is this task's.

```bash
npm test
```
Expected: all files pass. `src/lib/utils/realm-settings.test.ts`, `src/lib/realm/depth.test.ts` and this file are the three that touch `depthOverride`; nothing else in the suite renders this panel.

- [ ] **Step 7: Commit.**

```bash
git add "src/app/(app)/settings/realm-settings-panel.tsx"
```
```bash
git add "src/app/(app)/settings/realm-settings-panel.test.tsx"
```
```bash
git commit -m "feat(realm): let a grown-up choose how much the Realm shows" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: The app chrome stops punching through the portal

Four pieces of the surrounding app currently float **over** the game board, because `.realm-root` is `z-index: 45` and `.floating-dock`, the quest-timer popup and the schedule-notification popup are all `z-index: 50`. The timer and schedule popups are the worse half — they fire unprompted, on a metered clock, and can cover the ability bar mid-cast. The sign-out pill is the more embarrassing half: it sits beside the mount slot where a child's thumb already is.

The fix is three lines and one rule: the portal rises to 60, one scoped CSS rule suppresses the app's floating chrome while the Realm is open (with a `data-realm-open` body attribute as the tested fallback, because jsdom cannot evaluate `:has()`), the quest timer is re-admitted *deliberately* as a chip inside the HUD's own meta zone, and the hero switcher is removed from a child's world outright and moved into the parent preview's header row.

**Files:**
- Create: `src/components/realm/realm-chrome.test.tsx`
- Modify: `src/app/globals.css` — the `.realm-root` rule as task 9 left it (z-index 45 → 60 **in place**; the comment and the three custom properties `--realm-hud-scale` / `--realm-bar-bottom` / `--realm-touch` are kept), then the suppression rule and `.realm-hud-chip` appended straight after `.realm-root:focus`
- Modify: `src/components/realm/realm-shell.tsx:206` (a stale comment naming z-index 45) and `:471-473` (the `data-realm-open` mount effect, inserted between the `onSkip` `useCallback` and `const calm = …`)
- Modify: `src/components/quest-timer-popup.tsx:117,168` (add the `quest-timer-popup` class name — it does not exist today)
- Modify: `src/components/schedule-notification-popup.tsx:125` (add the `schedule-notification-popup` class name — it does not exist today)
- Modify: `src/components/realm/realm-hud.tsx` (new `RealmTimerChip` export; rendered in the `.realm-hud-meta` zone task 11 built)
- Modify: `src/lib/realm/messages.ts` and `src/lib/realm/messages.test.ts` (steps 13b–13c: `ProblemKind` gains `questTimer`, `MessageInput` gains `questTimerDone`)
- Modify: `src/lib/actions/quest-assignments.ts:313-325` (step 13a: `getAssignmentQuestInfo` also returns `subjectName`)
- Modify: `src/components/realm/realm-shell.test.tsx` (step 13e: the `next/navigation` and `@/lib/actions/quest-assignments` mocks the shell's new imports require)
- Modify: `src/components/switch-hero.tsx:1-16,30-59` (the `useRealmOpen` subscription, the child-view suppression, and the `inline` prop)
- Modify: `src/app/(app)/realm/page.tsx:6-9,63` (the preview `selector` carries the inline hero switcher)
- Test: `src/components/realm/realm-chrome.test.tsx`

**Interfaces:**

Consumes (from earlier tasks, exact names):
- `.realm-hud-meta` — the HUD's top-right zone `<div>` (task 11). `RealmTimerChip` is inserted as its second child.
- `--realm-hud-scale` — the CSS custom property on `.realm-root` (task 9). `.realm-hud-chip` sizes from it.
- `RealmBundle.depthOverride: DepthOverride` and `RealmBundle.depth: RealmDepth` (task 8). The test fixture carries both, because `RealmShell` takes a whole `RealmBundle`.
- `setRealmDepth` in `@/lib/actions/realm-settings` (task 8). Mocked in the test file alongside `markRealmHelpSeen`.

Produces (what later slices rely on, exact names and types):
- `.realm-root { z-index: 60 }` — the portal is the top of the stack while it is open.
- The suppression rule: `body:has(.realm-root)` **and** `body[data-realm-open]`, each hiding `.floating-dock`, `.quest-timer-popup` and `.schedule-notification-popup`.
- `document.body[data-realm-open="true"]`, set and cleared by `RealmOpen`'s mount effect — the fallback path, and the only signal any component outside the Realm may read to know the portal is up.
- CSS class `.realm-hud-chip` — a chip in the HUD's meta zone.
- `export function RealmTimerChip()` in `src/components/realm/realm-hud.tsx` — no props; reads `useQuestTimer()` itself.
- `ProblemKind` gains `"questTimer"`, `PROBLEM_ORDER` becomes `["spriteError","kingdomError","ceremonyError","questTimer","lastMinute","preview"]`, and `MessageInput` gains `questTimerDone: string | null` — the one place slice 1 uses §8's extension rule. Slices 6, 8, 9, 12 and 13 extend the same union the same way.
- `getAssignmentQuestInfo(assignmentId)` returns `{ title, requireNotes, subjectName } | null` — `subjectName` is new and additive.
- `<SwitchHero isChildView={boolean} inline?: boolean />` — `inline` drops `.floating-dock` so the control can sit in a row; child view renders `null` while `data-realm-open` is set.

---

- [ ] **Step 1: Write the failing test for the portal's z-index, the suppression rule and the body attribute**

  Create `src/components/realm/realm-chrome.test.tsx` with exactly this content. The mock scaffolding mirrors `src/components/realm/realm-shell.test.tsx:9-89` (same technique: the factory closes over a `const` declared below it, which is legal because the arrow body only runs when the mocked function is called).

  ```tsx
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { render, screen, cleanup } from "@testing-library/react";
  import fs from "node:fs";
  import path from "node:path";
  import { RealmShell } from "./realm-shell";
  import { QuestTimerPopup } from "@/components/quest-timer-popup";
  import { SwitchHero } from "@/components/switch-hero";
  import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
  import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/realm",
  }));
  // The hand-off dialog's contents are not what this file is about, and mounting
  // them would try to fetch the family's heroes over the network.
  vi.mock("@/components/hero-login", () => ({ HeroLogin: () => <div /> }));
  vi.mock("@/lib/actions/quest-assignments", () => ({
    completeAssignment: vi.fn(),
    getAssignmentQuestInfo: vi.fn().mockResolvedValue({ requireNotes: false }),
  }));

  const getRealmAccess = vi.fn();
  vi.mock("@/lib/actions/realm-play", () => ({
    getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
    recordRealmPlay: vi.fn(),
  }));
  vi.mock("./realm-scene", () => ({ default: () => <div data-testid="scene" /> }));
  vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
  vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
  vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn() }));
  vi.mock("@/lib/actions/realm-settings", () => ({ markRealmHelpSeen: vi.fn(), setRealmDepth: vi.fn() }));
  vi.mock("./sprite-source", async () => {
    const React = await import("react");
    return {
      SpriteSource: ({ onReady }: { onReady: (t: unknown) => void }) => {
        React.useEffect(() => {
          onReady({ hero: {}, companion: null, villagers: {}, troubles: {}, mount: null, heroMounted: null, gleam: null, banner: null, crown: null, castleBanner: null, world: {}, tiles: null });
        }, [onReady]);
        return null;
      },
    };
  });

  const well = {
    id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 4, total: 5, complete: false,
    deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
  };
  const bundle = {
    heroName: "Lily",
    avatarConfig: DEFAULT_AVATAR,
    castleType: "campsite",
    kingdom: { tone: "gentle" as const, buildings: [well] },
    profile: DEFAULT_LEARNING_PROFILE,
    settings: { enabled: true, toneMode: "gentle" as const },
    spellbook: { spells: [], slots: 4 },
    mounts: { unlocked: ["pony"] },
    ceremony: null,
    banners: 0,
    wornCrown: null,
    helpSeen: true,
    depthOverride: "auto" as const,
    depth: "full" as const,
  };

  const QUEST_TIMER_KEY = "kingdomsandcrowns:quest-timer";
  // jsdom does not evaluate `:has()` and vitest never loads the app's stylesheet,
  // so the cascade half of this design is asserted against the stylesheet's text
  // and the behavioural half against the attribute the rule's fallback reads.
  const GLOBALS_CSS = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8").replace(/\s+/g, " ");

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.body.removeAttribute("data-realm-open");
  });
  afterEach(cleanup);

  describe("the portal and the app chrome", () => {
    it("marks the body while the world is open and clears it on the way out", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      const view = render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      expect(document.body).toHaveAttribute("data-realm-open", "true");
      view.unmount();
      expect(document.body).not.toHaveAttribute("data-realm-open");
    });

    it("suppresses a parent's floating dock by rule, without unmounting it", async () => {
      getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
      render(
        <>
          <SwitchHero isChildView={false} />
          <RealmShell bundle={bundle} childId="c1" isChildView={false} />
        </>
      );
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      // Nothing unmounts the app's chrome — the stylesheet hides it, keyed on the
      // attribute below (and, in a real browser, on `body:has(.realm-root)`).
      expect(document.querySelector(".floating-dock")).not.toBeNull();
      expect(document.body).toHaveAttribute("data-realm-open", "true");
    });

    it("raises the portal and hides the three floating chrome nodes, both ways", () => {
      // The whole rule, not a prefix: `--realm-touch` is declared here and nowhere else,
      // so a replacement that dropped it would leave every 56px control over the world
      // with no minimum size, and a prefix match would not notice.
      expect(GLOBALS_CSS).toContain(
        ".realm-root { position: fixed; inset: 0; z-index: 60; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }"
      );
      for (const target of [".floating-dock", ".quest-timer-popup", ".schedule-notification-popup"]) {
        expect(GLOBALS_CSS).toContain(`body:has(.realm-root) ${target},`);
        expect(GLOBALS_CSS).toContain(`body[data-realm-open] ${target}`);
      }
      expect(GLOBALS_CSS).toContain("body[data-realm-open] .schedule-notification-popup { display: none; }");
    });

    it("names the two unprompted popups so the rule can reach them", () => {
      localStorage.setItem(
        QUEST_TIMER_KEY,
        JSON.stringify({ assignmentId: "a1", startedAt: Date.now(), accumulatedMs: 0, resumedAt: Date.now() })
      );
      render(<QuestTimerPopup />);
      expect(document.querySelector(".quest-timer-popup")).not.toBeNull();
      const schedule = fs.readFileSync(path.join(__dirname, "../schedule-notification-popup.tsx"), "utf8");
      expect(schedule).toContain('className="schedule-notification-popup ');
    });
  });
  ```

- [ ] **Step 2: Run the test and watch all four cases fail**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  ```

  Expect four failures:
  - *marks the body while the world is open* — `expected <body /> to have attribute "data-realm-open"`.
  - *suppresses a parent's floating dock by rule* — same attribute assertion.
  - *raises the portal* — `expected '… .realm-root { position: fixed; inset: 0; z-index: 45; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; } …' to contain '.realm-root { position: fixed; inset: 0; z-index: 60; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }'` — the two strings differ in one character, the `45` that step 4 turns into `60`.
  - *names the two unprompted popups* — `expected null not to be null` (the `.quest-timer-popup` class does not exist yet).

- [ ] **Step 3: Stamp `data-realm-open` on the body for the life of the open world**

  In `src/components/realm/realm-shell.tsx`, insert the effect between the `onSkip` callback (currently ending at line 471) and `const calm = …` (currently line 473). It must sit above `if (!portalTarget) return null;` — that early return is below every hook in `RealmOpen`.

  ```tsx
  const onSkip = useCallback(() => {
    ceremonySkipRef.current = true;
  }, []);

  // The portal is the top of the stack while it is open (`.realm-root` is z-index 60).
  // This attribute is the second half of the rule that keeps the app's floating chrome —
  // the hero-switch pill, the quest-timer popup, the schedule notifications — behind it:
  // browsers match `body:has(.realm-root)`, and anything that cannot evaluate `:has()`
  // (jsdom included) matches this. Cleared on unmount, so every exit path — the Tavern
  // link, a route change, the gate closing — hands the chrome straight back.
  useEffect(() => {
    document.body.setAttribute("data-realm-open", "true");
    return () => {
      document.body.removeAttribute("data-realm-open");
    };
  }, []);

  const calm = bundle.profile.reducedMotion || bundle.profile.lowStimulus;
  ```

  In the same file, fix the now-stale comment at line 206 that names the old z-index. Replace

  ```tsx
  // context), so `.realm-root { z-index: 45 }` is compared against the
  ```

  with

  ```tsx
  // context), so `.realm-root { z-index: 60 }` is compared against the
  ```

- [ ] **Step 4: Raise the portal and write the suppression rule**

  In `src/app/globals.css`, this is an **in-place value change followed by an append — not a line replacement.** Task 9's step 5 has already rewritten the `.realm-root` rule and put a three-line comment above it, so the rule you will find is

  ```css
  /* `--realm-hud-scale` and `--realm-bar-bottom` are overwritten inline by RealmShell
     from the hero's render settings; these are the defaults. Every control that sits
     over the 3D world is `--realm-touch`; panel buttons stay at 44px. */
  .realm-root { position: fixed; inset: 0; z-index: 45; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }
  .realm-root:focus { outline: none; }
  ```

  Change **`z-index: 45` to `z-index: 60` and nothing else** — keep the comment, and keep all three custom properties. `--realm-touch` is defined here and nowhere else (`RealmShell` writes only `--realm-hud-scale` and `--realm-bar-bottom` inline), so dropping it silently collapses the 56px minimum on `.realm-bubble-talk`, `.realm-mount-button` and `.realm-message button` — with no error anywhere, because vitest never parses this stylesheet and the assertion below is a prefix match that would still pass.

  ```css
  /* `--realm-hud-scale` and `--realm-bar-bottom` are overwritten inline by RealmShell
     from the hero's render settings; these are the defaults. Every control that sits
     over the 3D world is `--realm-touch`; panel buttons stay at 44px. */
  .realm-root { position: fixed; inset: 0; z-index: 60; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }
  .realm-root:focus { outline: none; }
  /* While the Realm is open it is the top of the stack, and the app's floating chrome
     stays behind it. The quest-timer and schedule popups fire unprompted, on a metered
     clock, and were covering the ability bar mid-cast; the sign-out pill was landing
     beside the mount slot where a child's thumb already is. The `:has()` half is what
     browsers match; the `[data-realm-open]` half is the fallback RealmOpen sets on the
     body, and the path jsdom can test. The one piece of chrome a child must still be
     able to see — a running quest timer — comes back inside the HUD as .realm-hud-chip,
     rather than by out-ranking the portal. */
  body:has(.realm-root) .floating-dock,
  body:has(.realm-root) .quest-timer-popup,
  body:has(.realm-root) .schedule-notification-popup,
  body[data-realm-open] .floating-dock,
  body[data-realm-open] .quest-timer-popup,
  body[data-realm-open] .schedule-notification-popup { display: none; }
  ```

  Then prove the properties survived the edit:

  ```bash
  grep -c -- '--realm-touch: 56px' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  grep -c -- '--realm-bar-bottom: 1.25rem;' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  grep -c '^\.realm-root {' /home/kylee/projects/kingdoms-and-crowns/src/app/globals.css
  ```

  Expected: `1`, `1`, `1`. If the first prints `0`, this step replaced the rule instead of editing it — put the three custom properties back.

- [ ] **Step 5: Give the two unprompted popups the class names the rule targets**

  In `src/components/quest-timer-popup.tsx`, both the stopped-state wrapper (line 117) and the running-state wrapper (line 168) read

  ```tsx
        <div className="fixed right-4 top-4 z-50 animate-in fade-in slide-in-from-right-4">
  ```

  Change **both** to

  ```tsx
        <div className="quest-timer-popup fixed right-4 top-4 z-50 animate-in fade-in slide-in-from-right-4">
  ```

  In `src/components/schedule-notification-popup.tsx`, line 125 reads

  ```tsx
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
  ```

  Change it to

  ```tsx
      <div className="schedule-notification-popup fixed right-4 top-4 z-50 flex flex-col gap-2">
  ```

- [ ] **Step 6: Run the test, the typechecker and the linter**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  npm run typecheck
  npm run lint
  ```

  Expect 4 passed in `realm-chrome.test.tsx`, no typecheck output, and exactly one lint error — the pre-existing one in `src/components/quest-template-list.tsx`.

- [ ] **Step 7: Commit the portal's rise**

  ```bash
  git add src/app/globals.css src/components/realm/realm-shell.tsx src/components/realm/realm-chrome.test.tsx src/components/quest-timer-popup.tsx src/components/schedule-notification-popup.tsx
  ```
  ```bash
  git commit -m "fix(realm): raise the portal above the app's floating chrome" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 8: Write the failing test for the re-admitted quest-timer chip**

  §7 asks `realm-chrome.test.tsx` to prove "the quest-timer chip renders in the meta zone with the verbatim string". The chip's verbatim string is its accessible name, `Quest timer: MM:SS` (and `Quest timer paused: MM:SS`), which is what these three cases assert; §3.20's *other* verbatim string, `Your {subject} timer finished.`, belongs to the problem lane and is asserted by steps 13b and 13d. Between them the whole of §3.20's item 2 is covered.

  In `src/components/realm/realm-chrome.test.tsx`, add this second `describe` block after the closing `});` of `describe("the portal and the app chrome", …)`.

  ```tsx
  describe("the re-admitted quest timer", () => {
    it("renders as a chip in the HUD's meta zone with the running quest's elapsed time", async () => {
      const now = Date.now();
      localStorage.setItem(
        QUEST_TIMER_KEY,
        JSON.stringify({ assignmentId: "a1", startedAt: now - 42_000, accumulatedMs: 42_000, resumedAt: now })
      );
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      const chip = screen.getByLabelText("Quest timer: 00:42");
      expect(chip).toHaveClass("realm-hud-chip");
      const meta = document.querySelector(".realm-hud-meta");
      expect(meta).not.toBeNull();
      expect(meta!.contains(chip)).toBe(true);
    });

    it("shows nothing when no quest timer is running", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Quest timer/)).not.toBeInTheDocument();
    });

    it("says so when the timer is paused", async () => {
      localStorage.setItem(
        QUEST_TIMER_KEY,
        JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 90_000, accumulatedMs: 90_000, resumedAt: Date.now() - 90_000, pausedAt: Date.now() })
      );
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      expect(screen.getByLabelText("Quest timer paused: 01:30")).toHaveTextContent("01:30");
    });
  });
  ```

- [ ] **Step 9: Run the test and watch the three chip cases fail**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  ```

  Expect the first and third to fail with `Unable to find a label with the text of: Quest timer: 00:42` / `Quest timer paused: 01:30`. The second ("shows nothing when no quest timer is running") passes already — it is the guard that keeps the chip from leaking in once it exists.

- [ ] **Step 10: Add `RealmTimerChip` and render it in the meta zone**

  In `src/components/realm/realm-hud.tsx`, add the import beside the existing ones:

  ```tsx
  import { useQuestTimer, formatElapsed } from "@/hooks/use-quest-timer";
  ```

  Add this component **above** `export function RealmHud(`:

  ```tsx
  /**
   * The one piece of app chrome re-admitted to the open Realm. Every other floating
   * popup is suppressed while the portal is up (globals.css); a running quest timer is
   * the one thing whose whole purpose is to tell a child their chore ran out, so it
   * comes back inside the Realm's own layers as a chip rather than by out-ranking the
   * portal's z-index. Its own component so the timer's 1 Hz tick re-renders 20 bytes
   * of chip and not the whole HUD.
   */
  export function RealmTimerChip() {
    const { activeTimer, elapsedSeconds, isPaused } = useQuestTimer();
    if (!activeTimer) return null;
    const elapsed = formatElapsed(elapsedSeconds);
    return (
      <span className="realm-hud-chip" aria-label={`${isPaused ? "Quest timer paused" : "Quest timer"}: ${elapsed}`}>
        <GameIcon name="timer" className="size-4" />
        {elapsed}
      </span>
    );
  }
  ```

  Then render it in the `.realm-hud-meta` zone task 11 built, on the line directly after the minutes counter, so it sits between the clock and the crown. **Add the one line only — leave the zone's opening tag exactly as task 11 wrote it, `style={{ pointerEvents: "none" }}` included** (task 11's zone test reads that inline value, and the chip is not interactive, so it inherits the pass-through):

  ```tsx
        <div className="realm-hud-meta" style={{ pointerEvents: "none" }}>
          {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
          <RealmTimerChip />
          {crown && (
  ```

- [ ] **Step 11: Style the chip**

  In `src/app/globals.css`, append this rule directly after the suppression rule added in step 4 (that is, after the line ending `body[data-realm-open] .schedule-notification-popup { display: none; }`):

  ```css
  /* A chip in the HUD's meta zone: the shape the re-admitted quest timer wears, and the
     shape anything else re-admitted later wears. Not interactive, so it keeps .realm-hud's
     `pointer-events: none` — only buttons, links and the preview selector take pointers. */
  .realm-hud-chip { display: inline-flex; align-items: center; gap: 0.3rem; border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(0, 0, 0, 0.55); border: 1px solid var(--gold-border); color: var(--gold-bright); font-size: calc(12px * var(--realm-hud-scale, 1)); font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
  ```

- [ ] **Step 12: Run the test, the typechecker and the linter**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  npm run typecheck
  npm run lint
  ```

  Expect 7 passed, no typecheck output, and the one pre-existing lint error in `quest-template-list.tsx`.

- [ ] **Step 13: Commit the re-admitted timer**

  ```bash
  git add src/components/realm/realm-hud.tsx src/app/globals.css src/components/realm/realm-chrome.test.tsx
  ```
  ```bash
  git commit -m "feat(realm): re-admit the quest timer as a chip in the HUD's meta zone" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

> **Steps 13a–13g: the other half of §3.20's item 2.** The chip above says how long a chore has been running. §3.20 also requires the moment it *ends* to reach the child: "speaking through the problem lane at `priority: \"warning\"` when it expires. Copy, verbatim: `Your {subject} timer finished.` with the action button `Go to it →`, which routes out of the Realm the same way any navigation does — through the unmount cleanup in §3.16, so the minute is charged."
>
> Two things have to be settled before it can be built, and both are settled here rather than deferred.
>
> **What "expires" means.** `useQuestTimer` counts *up*; it has no deadline and no expiry event. What it does have is `stoppedResult` — the state it writes when a timer is stopped, which normally makes `QuestTimerPopup` ask "complete or discard?". While the portal is up that popup is `display: none` (step 4), so a chore that finished says nothing at all. That is the gap §3.20 names, and `stoppedResult` becoming non-null is the event that fills it.
>
> **The union.** §8 freezes `ProblemKind` as five members, and §3.20 needs a sixth. They contradict each other, and §8 resolves it itself: *"A later slice adding a message kind adds it to the union, to the ORDER array, and to the picker — it does not add a lane."* This is the one place slice 1 uses that rule. `questTimer` goes in at warning priority — below the three errors, **above** `lastMinute`, because a chore that ran out outranks the one-minute banner — and the lane count stays at two.

- [ ] **Step 13a: Give `getAssignmentQuestInfo` the quest's subject name**

  The stored timer carries an assignment id and nothing else, so `{subject}` has to be looked up. In `src/lib/actions/quest-assignments.ts`, replace `getAssignmentQuestInfo` (today at line 313):

  ```ts
  export async function getAssignmentQuestInfo(assignmentId: string) {
    await requireAssignmentAccess(assignmentId);
    const rows = await db
      .select({
        title: schema.quest.title,
        requireNotes: schema.quest.requireNotes,
      })
      .from(schema.questAssignment)
      .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
      .where(eq(schema.questAssignment.id, assignmentId))
      .limit(1);
    return rows[0] ?? null;
  }
  ```

  with:

  ```ts
  export async function getAssignmentQuestInfo(assignmentId: string) {
    await requireAssignmentAccess(assignmentId);
    const rows = await db
      .select({
        title: schema.quest.title,
        requireNotes: schema.quest.requireNotes,
        // §3.20: the Realm's problem lane says "Your {subject} timer finished.", and the
        // stored timer carries only an assignment id. `quest.subject_id` is NOT NULL, so
        // this inner join can never drop a row the previous query would have returned.
        subjectName: schema.subject.name,
      })
      .from(schema.questAssignment)
      .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
      .innerJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
      .where(eq(schema.questAssignment.id, assignmentId))
      .limit(1);
    return rows[0] ?? null;
  }
  ```

  The only other caller is `src/components/quest-timer-popup.tsx:55`, which reads `info?.requireNotes` and is unaffected by an added column. Nothing else in this file changes — the access check, the `"use server"` contract and the return shape's nullability are all as they were.

- [ ] **Step 13b: Write the failing test for the sixth problem kind**

  In `src/lib/realm/messages.test.ts` (task 6's file), five edits. `TIMER_DONE` is the verbatim §3.20 sentence with a real subject in it.

  (a) Add the fixture beside the other copy constants, under `PREVIEW_INTRO`:

  ```ts
  const TIMER_DONE = "Your Math timer finished.";
  ```

  (b) Add the field to `QUIET`, after `lastMinute: false,`:

  ```ts
    questTimerDone: null,
  ```

  (c) Replace the `PROBLEM_ORDER` expectation:

  ```ts
      expect(PROBLEM_ORDER).toEqual(["spriteError", "kingdomError", "ceremonyError", "questTimer", "lastMinute", "preview"]);
  ```

  (d) In `returns one message, and each kind takes the lane in PROBLEM_ORDER as the one above it clears`, add `questTimer: { questTimerDone: null },` to the `clear` table (after the `ceremonyError` row) and `questTimerDone: TIMER_DONE,` to the `live` input (after `ceremonyError: CEREMONY_FAILED,`).

  (e) Append this case to `describe("pickProblem", …)`:

  ```ts
    it("gives a finished quest timer the lane above the one-minute banner, with its own action", () => {
      // §3.20: a chore that ran out outranks the clock's own warning — the child can come
      // back to the Realm, but the chore is what a grown-up is waiting on.
      const live = input({ questTimerDone: TIMER_DONE, lastMinute: true });
      expect(pickProblem(live)).toEqual({ kind: "questTimer", text: TIMER_DONE, actionLabel: "Go to it →" });
      expect(pickProblem({ ...live, questTimerDone: null })?.kind).toBe("lastMinute");
      // …and it still loses to a real error, which is the thing that actually broke.
      expect(pickProblem({ ...live, kingdomError: VILLAGERS_RESTING })?.kind).toBe("kingdomError");
    });
  ```

  Run it:

  ```bash
  npx vitest run src/lib/realm/messages.test.ts
  ```

  Expected: `Tests 14 passed | 2 failed (16)` — `is the closed list of problem kinds, in written priority order` fails on the six-member array, and the new case fails with `expected null to deeply equal { kind: 'questTimer', … }`. (`questTimerDone` is an unknown key on `MessageInput` at this point; vitest strips types, so it does not stop the run. `npx tsc --noEmit` would report it, and step 13c fixes both.)

- [ ] **Step 13c: Add `questTimer` to `messages.ts`**

  Four edits in `src/lib/realm/messages.ts`.

  (a) The union:

  ```ts
  export type ProblemKind = "spriteError" | "kingdomError" | "ceremonyError" | "questTimer" | "lastMinute" | "preview";
  ```

  (b) `MessageInput`, after `lastMinute: boolean;`:

  ```ts
    // §3.20's re-admitted quest timer, already formatted as "Your {subject} timer
    // finished." by the shell — this module owns no copy but the last-minute banner.
    questTimerDone: string | null;
  ```

  (c) `PROBLEM_ORDER`:

  ```ts
  export const PROBLEM_ORDER: ProblemKind[] = ["spriteError", "kingdomError", "ceremonyError", "questTimer", "lastMinute", "preview"];
  ```

  (d) One row in each table. In `PROBLEM_TEXT`, after the `ceremonyError` row:

  ```ts
    questTimer: (i) => i.questTimerDone || null,
  ```

  and in `PROBLEM_ACTION`, after the `ceremonyError` row:

  ```ts
    questTimer: "Go to it →",
  ```

  This is §8's own extension rule in action — union, ORDER array, both tables. No lane is added, `SPEECH_ORDER` is untouched, and the two `Record<ProblemKind, …>` tables are exactly what forces every one of these four edits.

  ```bash
  npx vitest run src/lib/realm/messages.test.ts
  ```

  Expected: `Tests 16 passed (16)`.

- [ ] **Step 13d: Write the failing test for the sentence and the way out**

  In `src/components/realm/realm-chrome.test.tsx`, four edits.

  (a) Widen the Testing Library import:

  ```tsx
  import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
  ```

  (b) Replace the `next/navigation` mock so the push is assertable:

  ```tsx
  const routerPush = vi.fn();
  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/realm",
  }));
  ```

  (c) Replace the quest-assignments mock so each case can choose the subject:

  ```tsx
  const getAssignmentQuestInfo = vi.fn();
  vi.mock("@/lib/actions/quest-assignments", () => ({
    completeAssignment: vi.fn(),
    getAssignmentQuestInfo: (...a: unknown[]) => getAssignmentQuestInfo(...a),
  }));
  ```

  and add the stopped-timer key beside `QUEST_TIMER_KEY`:

  ```tsx
  const STOPPED_TIMER_KEY = "kingdomsandcrowns:quest-timer:stopped";
  ```

  (d) Add this `describe` after the closing `});` of `describe("the re-admitted quest timer", …)`:

  ```tsx
  describe("a quest timer that ran out", () => {
    it("names the subject in the problem lane and hands the child the way out", async () => {
      // The popup that would normally ask "complete or discard?" is display:none while the
      // portal is up, so this is the only thing that tells a child their chore ended.
      getAssignmentQuestInfo.mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" });
      localStorage.setItem(
        STOPPED_TIMER_KEY,
        JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 600_000, endedAt: Date.now(), durationMinutes: 10 })
      );
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("realm-problem")).toHaveTextContent("Your Math timer finished."));
      fireEvent.click(screen.getByRole("button", { name: "Go to it →" }));
      expect(routerPush).toHaveBeenCalledWith("/quests");
      // Consumed on the way out, so the sentence cannot greet the child again next visit.
      await waitFor(() => expect(localStorage.getItem(STOPPED_TIMER_KEY)).toBeNull());
    });

    it("says nothing at all when no timer has stopped", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      expect(screen.queryByText(/timer finished\./)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Go to it →" })).not.toBeInTheDocument();
      expect(getAssignmentQuestInfo).not.toHaveBeenCalled();
    });
  });
  ```

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  ```

  Expected: the first new case fails inside the `waitFor` with `expected element to have text content "Your Math timer finished."` — task 9's `realm-problem` node is there, empty. The second passes already; it is the guard.

- [ ] **Step 13e: Wire the sentence and the exit into the shell**

  Four edits in `src/components/realm/realm-shell.tsx` — (a) to (d) — plus two mocks in `realm-shell.test.tsx`, in (e).

  (a) Three imports, beside the existing ones:

  ```tsx
  import { useRouter } from "next/navigation";
  import { useQuestTimer } from "@/hooks/use-quest-timer";
  import { getAssignmentQuestInfo } from "@/lib/actions/quest-assignments";
  ```

  (b) In `RealmOpen`, immediately after `const arrowRef = useRef<HTMLDivElement>(null);` (task 9 added it):

  ```tsx
    const router = useRouter();
    // Only the stopped half is read here; `RealmTimerChip` owns the running clock so its
    // 1 Hz tick repaints a chip rather than the HUD. The hook's own interval still ticks
    // this component once a second while a chore timer runs, which is strictly less than
    // the ~5 re-renders a second mana regen already causes, and `settings` and `layout`
    // are useMemo'd, so the memoised `World` still never re-renders from it.
    const { stoppedResult, clearStoppedResult } = useQuestTimer();
    // The timer stores an assignment id, not a subject, so the sentence needs one lookup.
    const [timerSubject, setTimerSubject] = useState<{ assignmentId: string; subject: string } | null>(null);
    useEffect(() => {
      if (!stoppedResult) return;
      let cancelled = false;
      getAssignmentQuestInfo(stoppedResult.assignmentId).then((info) => {
        if (cancelled || !info) return;
        setTimerSubject({ assignmentId: stoppedResult.assignmentId, subject: info.subjectName });
      });
      return () => {
        cancelled = true;
      };
    }, [stoppedResult]);
    // Derived, never stored: when the stopped result goes away — the child pressed
    // "Go to it →", or finished the quest in another tab — the sentence goes with it, and
    // no effect writes state synchronously (react-hooks/set-state-in-effect).
    const questTimerDone =
      stoppedResult && timerSubject?.assignmentId === stoppedResult.assignmentId
        ? `Your ${timerSubject.subject} timer finished.`
        : null;
  ```

  (c) Add the one field to the `messageInput` object task 9 built, after `lastMinute:`:

  ```tsx
      questTimerDone,
  ```

  (d) Add the branch to `RealmMessages`'s `onAction`, above the `ceremonyError` line:

  ```tsx
            if (problem.kind === "questTimer") {
              // Out of the Realm the ordinary way. The unmount cleanup task 7 added runs on
              // the route change and flushes the part-minute, so the visit is charged (§3.16).
              clearStoppedResult();
              router.push("/quests");
              return;
            }
  ```

  (e) `realm-shell.test.tsx` now renders a component that calls `useRouter` and imports a `"use server"` module, so add both mocks beside the existing ones at the top of that file:

  ```tsx
  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/realm",
  }));
  vi.mock("@/lib/actions/quest-assignments", () => ({
    completeAssignment: vi.fn(),
    getAssignmentQuestInfo: vi.fn().mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" }),
  }));
  ```

  Without them every case in that file throws `invariant expected app router to be mounted`.

- [ ] **Step 13f: Run everything this touched**

  ```bash
  npx vitest run src/lib/realm/messages.test.ts src/components/realm/realm-chrome.test.tsx src/components/realm/realm-shell.test.tsx
  ```
  Expected: three files green — `messages.test.ts` at 16, `realm-chrome.test.tsx` at 9 (4 + 3 + 2), `realm-shell.test.tsx` unchanged and green.
  ```bash
  npm test
  ```
  Expected: green. Any suite that mocks `getAssignmentQuestInfo` still passes — the action gained a column, not a signature.
  ```bash
  npm run typecheck
  ```
  Expected: no output. If it names `questTimerDone` as missing on a `MessageInput`, a construction site was missed — the only one is task 9's `messageInput` in `realm-shell.tsx`.
  ```bash
  npm run lint
  ```
  Expected: the one pre-existing error in `src/components/quest-template-list.tsx` and nothing else.

- [ ] **Step 13g: Commit the finished-timer message**

  ```bash
  git add src/lib/realm/messages.ts src/lib/realm/messages.test.ts src/lib/actions/quest-assignments.ts src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/components/realm/realm-chrome.test.tsx
  ```
  ```bash
  git commit -m "feat(realm): say when a quest timer finished, and hand the child the way out" -m "The quest-timer popup is suppressed while the portal is up, so a chore that ran out said nothing at all. Its stopped result now speaks through the problem lane as 'Your {subject} timer finished.' with a 'Go to it -> ' button that routes to /quests, charging the part-minute through the unmount cleanup. ProblemKind gains its sixth member under section 8's own extension rule: union, ORDER array and both tables, and no new lane." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 14: Write the failing test for the hero switcher**

  In `src/components/realm/realm-chrome.test.tsx`, add this third `describe` block after the closing `});` of `describe("a quest timer that ran out", …)`. (The Testing Library import already carries `waitFor` — step 13d widened it.)

  ```tsx
  describe("the hero switcher", () => {
    it("leaves a child's world outright, and stays put everywhere else", async () => {
      getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
      render(
        <>
          <SwitchHero isChildView={true} />
          <RealmShell bundle={bundle} childId="c1" isChildView={true} />
        </>
      );
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("button", { name: /Leave \(switch hero\)/ })).not.toBeInTheDocument());
      cleanup();
      // Off the Realm the pill is exactly as it was: the only way to hand the device back.
      render(<SwitchHero isChildView={true} />);
      expect(screen.getByRole("button", { name: /Leave \(switch hero\)/ })).toBeInTheDocument();
    });

    it("sits in the preview header row for a parent, not in a floating dock", async () => {
      getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
      render(
        <RealmShell
          bundle={bundle}
          childId="c1"
          isChildView={false}
          selector={<SwitchHero isChildView={false} inline />}
        />
      );
      expect(await screen.findByTestId("scene")).toBeInTheDocument();
      const control = screen.getByRole("button", { name: "Play as a hero" });
      expect(control).not.toHaveClass("floating-dock");
      expect(document.querySelector(".floating-dock")).toBeNull();
      const meta = document.querySelector(".realm-hud-meta");
      expect(meta).not.toBeNull();
      expect(meta!.contains(control)).toBe(true);
    });
  });
  ```

- [ ] **Step 15: Run the test and watch both switcher cases fail**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  ```

  Expect *leaves a child's world outright* to fail on the `waitFor` (`expected … not.toBeInTheDocument`, because the pill is still mounted), and *sits in the preview header row* to fail at `expect(control).not.toHaveClass("floating-dock")` — vitest strips types rather than checking them, so the unknown `inline` prop is simply ignored and the control still renders as a floating dock. (`npm run typecheck` would report `Property 'inline' does not exist on type '{ isChildView: boolean; }'` for the same reason; it is checked at step 18.)

- [ ] **Step 16: Suppress the switcher in a child's open world and give it an inline form**

  Replace the whole of `src/components/switch-hero.tsx` with:

  ```tsx
  "use client";

  import { useState, useSyncExternalStore } from "react";
  import { useRouter } from "next/navigation";
  import { cn } from "@/lib/utils";
  import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { HeroLogin } from "@/components/hero-login";
  import { GameIcon } from "@/components/game-icon";

  // `RealmOpen` stamps `data-realm-open` on <body> while the Realm's portal is up (see
  // realm-shell.tsx), and the stylesheet hides `.floating-dock` from there. A child's
  // pill is removed outright rather than merely hidden: it is the only DOM control over
  // the game world, it lands beside the mount slot where a thumb already is, and a child
  // leaves the Realm through the Tavern link inside it. Subscribed rather than read
  // during render so the pill comes back the moment the portal closes — and with a
  // server snapshot of `false`, because this renders on every page, SSR included.
  const realmOpenListeners = new Set<() => void>();
  let realmOpenObserver: MutationObserver | null = null;

  function subscribeRealmOpen(callback: () => void) {
    realmOpenListeners.add(callback);
    if (!realmOpenObserver) {
      realmOpenObserver = new MutationObserver(() => {
        realmOpenListeners.forEach((fn) => fn());
      });
      realmOpenObserver.observe(document.body, { attributes: true, attributeFilter: ["data-realm-open"] });
    }
    return () => {
      realmOpenListeners.delete(callback);
    };
  }
  function getRealmOpen() {
    return document.body.hasAttribute("data-realm-open");
  }
  function getServerRealmOpen() {
    return false;
  }

  /**
   * Floating control for shared-device hero hand-off (production, non-demo).
   * - Adult signed in: "Play as a hero" → pick a family hero + PIN.
   * - Child (PIN) signed in: "Leave" → clears the child session, returning the
   *   device to the parent (or the login screen).
   *
   * `inline` drops the `.floating-dock` anchoring so the control can sit in a row —
   * the Realm's parent preview puts it in the HUD header beside the child selector,
   * because a control that floats over a game board is the thing being fixed.
   */
  export function SwitchHero({ isChildView, inline = false }: { isChildView: boolean; inline?: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const realmOpen = useSyncExternalStore(subscribeRealmOpen, getRealmOpen, getServerRealmOpen);

    async function leave() {
      setLeaving(true);
      try {
        await fetch("/api/child-auth/signout", { method: "POST" });
        router.refresh();
      } finally {
        setLeaving(false);
      }
    }

    if (isChildView && realmOpen) return null;

    const pill = cn(
      inline ? "" : "floating-dock",
      "flex items-center gap-2 rounded-full border-2 border-dashed",
      "border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm",
      "text-amber-700 transition-all hover:scale-105 hover:bg-amber-500/20 dark:text-amber-300",
    );

    if (isChildView) {
      return (
        <button onClick={leave} disabled={leaving} className={pill}>
          {leaving ? (
            "Leaving..."
          ) : (
            <>
              <GameIcon name="door" className="size-4 text-[var(--gold-bright)]" />
              Leave (switch hero)
            </>
          )}
        </button>
      );
    }

    return (
      <>
        <button onClick={() => setOpen(true)} className={pill}>
          <GameIcon name="swords" className="size-4 text-[var(--gold-bright)]" />
          Play as a hero
        </button>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Play as a Hero</DialogTitle>
          </DialogHeader>
          <HeroLogin mode="handoff" onDone={() => setOpen(false)} />
        </Dialog>
      </>
    );
  }
  ```

- [ ] **Step 17: Put the switcher in the preview header row**

  In `src/app/(app)/realm/page.tsx`, add the import beside the existing component imports (after line 9):

  ```tsx
  import { SwitchHero } from "@/components/switch-hero";
  ```

  Then replace line 63, which today reads

  ```tsx
          selector={!isChildView && allChildren.length > 1 ? <ChildSelector kids={allChildren} selectedId={activeChild.id} /> : undefined}
  ```

  with

  ```tsx
          selector={
            // The hero switcher is a floating dock everywhere else; over a game board it
            // would sit on the world, so in preview it rides the HUD's header row beside
            // the child selector — the control a parent comparing two children actually uses.
            isChildView ? undefined : (
              <>
                {allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
                {process.env.DEMO_MODE !== "true" && <SwitchHero isChildView={false} inline />}
              </>
            )
          }
  ```

- [ ] **Step 18: Run the file, the whole suite, the typechecker and the linter**

  ```bash
  npx vitest run src/components/realm/realm-chrome.test.tsx
  ```
  ```bash
  npm test
  ```
  ```bash
  npm run typecheck
  ```
  ```bash
  npm run lint
  ```

  Expect 11 passed in `realm-chrome.test.tsx` (4 portal + 3 chip + 2 finished-timer + 2 switcher); a green full suite; no typecheck output; and exactly one lint error — the pre-existing one in `src/components/quest-template-list.tsx`.

- [ ] **Step 19: Commit the switcher's move**

  ```bash
  git add src/components/switch-hero.tsx "src/app/(app)/realm/page.tsx" src/components/realm/realm-chrome.test.tsx
  ```
  ```bash
  git commit -m "fix(realm): take the hero switcher out of the world and into the preview header" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 21: The acceptance pass: the ten browser checks and the frame budget

**Files:**
- **Create (scratchpad only — nothing in this task belongs in the repo):**
  - `$SC/realm-db.mjs` — one SQL statement against `local.db` (there is no `sqlite3` CLI in this environment)
  - `$SC/realm-pass.mjs` — the Playwright harness; `STEP=<name>` selects one browser check
  - `$SC/frame-budget.mjs` — the §3.13 frame-time and `onReady` measurement, run against one base URL
  - `$SC/evidence/` — every screenshot and every recorded number
  - `$SC/acceptance.md` — the written record handed back at the end
  where `$SC` = `/tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session>/scratchpad` (this session's scratchpad; any writable dir outside the repo will do)
- **Modify:** none — **unless** check 9 fails its budget, in which case **Step 24** applies the recorded fallback to `src/components/realm/realm-scene.tsx` and commits it.
- **Test:** `npm test` (whole suite), `npm run typecheck`, `npm run lint`, `npm run build`, then the ten browser checks of §7 plus the two preview/clock audits, on the documented local Chromium setup, child view at `http://localhost:3100/realm` and parent preview at `http://localhost:3100/realm?child=demo-child-1`.

**Interfaces:**

Consumes (every earlier task; these are the exact names the harness reaches for):
- CSS classes: `.realm-root`, `.realm-plate`, `.realm-plate-name`, `.realm-plate-tag`, `.realm-plate-badge`, `.realm-hud-identity`, `.realm-hud-objective`, `.realm-hud-meta`, `.realm-messages`, `.realm-message--problem`, `.realm-message--cheer`, `.realm-message--stage`, `.realm-edge-arrow`, `.realm-mana-pips`, `.realm-mount-button`, `.realm-bubble-talk`, `.realm-hud-chip`, `.realm-spell--selected`, `.realm-spell--refused`, `.floating-dock` (tasks 9-12, 20)
- CSS custom properties `--realm-hud-scale`, `--realm-bar-bottom`, `--realm-touch` on `.realm-root` (task 9)
- Copy, verbatim: `Old Bram is waiting.`, `The Village Well stands. Next: the Grain Mill, with Miller Tessa.`, `Your next side quest is at the Village Well. Old Bram is waiting.`, `Old Bram is here. Press Enter to talk.`, `Talk · Enter`, `Follow the gold light. Someone is waiting there.`, `Show me everything`, `You're looking at Emma's grounds. Spells, side quests and recess are theirs to play.` (tasks 2, 9-14, 17, 18)
- `realm_settings.depth_override` and `setRealmDepth` (task 8), `flushPending` on unmount (task 7)

Produces (evidence only — no code, no repo file):
- `$SC/evidence/before/*.png`, `$SC/evidence/after/*.png` — same-framing before/after of the two views
- `$SC/evidence/checks/*.png` and `$SC/evidence/checks/*.json` — one artefact per numbered check
- `$SC/evidence/frame-budget.json` — median frame time and `onReady`, before and after, three runs each
- `$SC/acceptance.md` — the ten checks with PASS/FAIL, the measured numbers against the budget, and the two before/after pairs

---

- [ ] **Step 1: Guard the branch and record the baseline commit**

Several sessions share this checkout, so confirm the branch before anything else, and pin the commit the "before" measurements come from.

```bash
cd /home/kylee/projects/kingdoms-and-crowns
git rev-parse --abbrev-ref HEAD
git status --short
git log --oneline -1 ce227c5
git log --oneline --ancestry-path ce227c5..HEAD | tail -1
```

Expected: the branch is `realm-foundations`; `git status --short` is empty; `ce227c5` is `docs(realm): record the kingdom-length decision (twenty side quests)`; the last line of the fourth command is Task 1's commit (`feat(realm): the complexity-axis contract` or similar). **BASE is the parent of that commit — `ce227c5` unless the slice started from a later docs commit.** Export it for the rest of the task:

```bash
export BASE_SHA=ce227c5
# Use THIS session's own scratchpad directory, the one named in your environment — never
# guess it by modification time, or you will write evidence into another session's folder.
export SC=<this session's scratchpad directory>   # e.g. /tmp/claude-1000/-home-kylee-projects-kingdoms-and-crowns/<session-id>/scratchpad
test -d "$SC" || { echo "SC is not a directory: $SC"; exit 1; }
mkdir -p $SC/evidence/before $SC/evidence/after $SC/evidence/checks
```

- [ ] **Step 2: The whole suite is green**

```bash
cd /home/kylee/projects/kingdoms-and-crowns
npm test 2>&1 | tail -20
```

Expected: `Test Files  N passed`, `Tests  M passed`, zero failed. M is the slice-8 baseline (867) plus every test tasks 1-20 added — roughly 940-980. Record the exact `Test Files`/`Tests` line; it goes in `acceptance.md`. If anything fails, stop: the acceptance pass does not start on a red suite.

- [ ] **Step 3: Typecheck is clean**

```bash
cd /home/kylee/projects/kingdoms-and-crowns
npm run typecheck
```

Expected: no output and exit code 0. A `Property 'depthOverride' does not exist` here means task 8's bundle change did not land; a `Property 'focus' does not exist on type 'Prop'` means task 3's did not.

- [ ] **Step 4: Lint carries exactly one error, the pre-existing one**

```bash
cd /home/kylee/projects/kingdoms-and-crowns
npm run lint 2>&1 | tee /tmp/lint-out.txt | tail -30
grep -c "error" /tmp/lint-out.txt
grep -B2 "error" /tmp/lint-out.txt | head -10
```

Expected: every `error` line belongs to `src/components/quest-template-list.tsx` (the one this branch never touched). Warnings are allowed; any error in a file this slice touched is a regression and must be fixed before the pass continues.

- [ ] **Step 5: The production build succeeds**

```bash
cd /home/kylee/projects/kingdoms-and-crowns
npm run build 2>&1 | tail -25
```

Expected: `Compiled successfully`, the route list contains `/realm`, and there is no `"use server" file exports non-async` error — the build is the only check that catches task 8's `setRealmDepth` breaking the server-action export rule, because Vitest imports that module directly.

- [ ] **Step 6: Stand up Chromium (libs, Playwright, the binary)**

The bundled Chromium is missing four libs and there is no passwordless sudo; fetch them into the scratchpad and discover today's paths (both drift between sessions — never reuse a remembered number).

```bash
mkdir -p $SC/chromium-libs
cd $SC/chromium-libs
apt-get download libnspr4 libnss3 libasound2t64
for f in *.deb; do dpkg-deb -x "$f" .; done
ls -d /home/kylee/.npm/_npx/*/node_modules/playwright
ls /home/kylee/.cache/ms-playwright/ | grep headless_shell
```

Then export the three variables every later step uses (substitute the paths the two `ls` calls printed — today they are `e41f203b7505f1fb` and `chromium_headless_shell-1234`):

```bash
export LD_LIBRARY_PATH=$SC/chromium-libs/usr/lib/x86_64-linux-gnu
export PLAYWRIGHT_PATH=/home/kylee/.npm/_npx/e41f203b7505f1fb/node_modules/playwright
export CHROME_PATH=/home/kylee/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
$CHROME_PATH --version
```

Expected: the last command prints a Chromium version rather than a missing-library error. (The MCP Playwright browser tool looks for Google Chrome at `/opt/google/chrome/chrome` and will fail here — drive Playwright from the npx cache as above.)

- [ ] **Step 7: Write the one-statement DB helper**

```bash
cat > $SC/realm-db.mjs <<'EOF'
// One SQL statement against the app's local libsql file. There is no sqlite3 CLI here.
//   node realm-db.mjs "select * from kingdom_progress where child_id = 'demo-child-1'"
import { createRequire } from "module";

const REPO = "/home/kylee/projects/kingdoms-and-crowns";
const require = createRequire(REPO + "/package.json");
const { createClient } = require("@libsql/client");

const client = createClient({ url: `file:${REPO}/local.db` });
const sql = process.argv.slice(2).join(" ");
const res = await client.execute(sql);
console.log(JSON.stringify(res.rows, null, 2));
console.log(`rowsAffected=${res.rowsAffected}`);
EOF
node $SC/realm-db.mjs "select id, display_name, grade from child where id = 'demo-child-1'"
```

Expected: one row, `display_name` `Emma` (the demo hero behind persona `lily`). Every string asserted in the browser checks below that names the hero uses **this** value, not the spec's illustrative `Lily`.

- [ ] **Step 8: Seed the acceptance fixture, then read it back**

Four things the pass needs: minutes to enter, the help card already seen, a kingdom whose objective is the well at 4 of 5 (so one run completes it and the rise toast reads exactly the spec's sentence), and a crowned season whose ceremony nobody has watched. Record what you overwrite so Step 25 can restore it.

```bash
node $SC/realm-db.mjs "select * from kingdom_progress where child_id = 'demo-child-1'" > $SC/evidence/fixture-before-kingdom.json
node $SC/realm-db.mjs "select child_id, help_seen_at, starter_spell_at, depth_override from realm_settings where child_id = 'demo-child-1'" > $SC/evidence/fixture-before-settings.json
node $SC/realm-db.mjs "select id, grade, ordinal, completed_at, crown_id, ceremony_seen_at from season where child_id = 'demo-child-1'" > $SC/evidence/fixture-before-season.json

node $SC/realm-db.mjs "insert into realm_play_ledger (id, child_id, date, kind, minutes, created_at) values ('acc-s1', 'demo-child-1', date('now'), 'earned', 30, unixepoch())"
node $SC/realm-db.mjs "update realm_settings set help_seen_at = unixepoch() where child_id = 'demo-child-1'"
node $SC/realm-db.mjs "insert into kingdom_progress (id, child_id, building_id, deeds_done, created_at, updated_at) values ('acc-well', 'demo-child-1', 'well', 4, unixepoch(), unixepoch()) on conflict(child_id, building_id) do update set deeds_done = 4"
node $SC/realm-db.mjs "insert into kingdom_progress (id, child_id, building_id, deeds_done, created_at, updated_at) values ('acc-mill', 'demo-child-1', 'mill', 1, unixepoch(), unixepoch()) on conflict(child_id, building_id) do update set deeds_done = 1"
node $SC/realm-db.mjs "insert into season (id, child_id, grade, ordinal, start_date, end_date, completed_at, crown_id, ceremony_seen_at, created_at, updated_at) values ('acc-season', 'demo-child-1', '3', 1, '2025-09-01', '2026-06-01', unixepoch(), 'crown-copper', null, unixepoch(), unixepoch())"

node $SC/realm-db.mjs "pragma table_info(realm_settings)" | grep -A4 depth_override
node $SC/realm-db.mjs "select building_id, deeds_done from kingdom_progress where child_id = 'demo-child-1' order by building_id"
node $SC/realm-db.mjs "select id, crown_id, ceremony_seen_at from season where child_id = 'demo-child-1'"
```

Expected: `depth_override` shows `text`, `notnull` 1, default `'auto'` (task 8's migration, confirmed not trusted); `well` is 4 and `mill` is 1; the season row exists with `crown-copper` and a null `ceremony_seen_at`. With this fixture the objective card must read `Village Well` / `Old Bram is waiting.` and its pips `4 of 5`.

- [ ] **Step 9: Start the "after" server on 3100 and prove it is this app**

Ports drift and other projects on this machine use 3100; check, then start.

```bash
ss -ltnp | grep -E ':31[0-9]{2}' || echo "3100 and 3101 are free"
cd /home/kylee/projects/kingdoms-and-crowns
grep -n '^DEMO_MODE' .env.local
PORT=3100 npm run dev > $SC/dev-after.log 2>&1 &
sleep 12
curl -s localhost:3100/ | grep -o '<title>[^<]*'
```

Expected: `DEMO_MODE=true` in `.env.local` — that is what lets the `demo_persona` cookie stand in for a login, so every browser check below opens straight into the world with no sign-in flow. If it is missing or `false`, add `DEMO_MODE=true` before starting the servers and put the file back in Step 26. Then `<title>Kingdoms &amp; Crowns — Be the Hero of Homeschool`. If 3100 is taken by something else, pick a free port, `export BASE_AFTER=http://localhost:<port>`, and record the substitution in `acceptance.md`. Otherwise `export BASE_AFTER=http://localhost:3100`.

- [ ] **Step 10: Start the "before" server on 3101 from a worktree at BASE_SHA**

The before/after comparison needs the pre-slice code running at the same time against the same database.

```bash
cd /home/kylee/projects/kingdoms-and-crowns
git worktree add $SC/before $BASE_SHA
ln -s /home/kylee/projects/kingdoms-and-crowns/node_modules $SC/before/node_modules
cp /home/kylee/projects/kingdoms-and-crowns/.env.local $SC/before/.env.local
cd $SC/before
TURSO_DATABASE_URL=file:/home/kylee/projects/kingdoms-and-crowns/local.db PORT=3101 npm run dev > $SC/dev-before.log 2>&1 &
sleep 20
curl -s localhost:3101/ | grep -o '<title>[^<]*'
export BASE_BEFORE=http://localhost:3101
```

Expected: the same title. The worktree has its own `.next`, so there is no `Unable to acquire lock at .next/dev/lock`. Both servers share the one `local.db`, so the Step 8 fixture applies to both. If the symlinked `node_modules` misbehaves (Next resolving the repo's `src` through it), run `npm ci` inside `$SC/before` instead and note the extra minutes in `acceptance.md`.

- [ ] **Step 11: Write the browser harness**

One file, one `STEP`. Every later check runs it with a different `STEP` and writes into `$SC/evidence/checks`.

```bash
cat > $SC/realm-pass.mjs <<'EOF'
// Slice 1 acceptance harness. Scratchpad only — nothing here belongs in the repo.
//   LD_LIBRARY_PATH=$LD_LIBRARY_PATH STEP=ring node realm-pass.mjs
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const REPO = "/home/kylee/projects/kingdoms-and-crowns";
const require = createRequire(REPO + "/package.json");
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const sharp = require("sharp");

const BASE = process.env.BASE || "http://localhost:3100";
const EXEC = process.env.CHROME_PATH;
const OUT = process.env.OUT || path.join(process.env.SC, "evidence", "checks");
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 1280, height: 800 };
const CENTRE = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};

// Records every spoken sentence and stamps the moment the world's canvas first exists.
function initScript() {
  window.__spoken = [];
  const record = (u) => { window.__spoken.push(typeof u === "string" ? u : u.text); };
  if (!("speechSynthesis" in window) || !window.speechSynthesis) {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak: record, getVoices: () => [] },
    });
  } else {
    window.speechSynthesis.speak = record;
  }
  if (typeof window.SpeechSynthesisUtterance !== "function") {
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  }
  window.__firstCanvas = null;
  const obs = new MutationObserver(() => {
    if (window.__firstCanvas === null && document.querySelector(".realm-root canvas")) {
      window.__firstCanvas = performance.now();
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement, { subtree: true, childList: true });
}

async function open({ persona = "lily", query = "", touch = false, closeHelp = true, settle = 2000 } = {}) {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, hasTouch: touch });
  await context.addCookies([{ name: "demo_persona", value: persona, domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" }]);
  await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}/realm${query}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".realm-root canvas", { timeout: 60000 });
  await page.evaluate(() => { document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()); });
  if (closeHelp) {
    const close = page.locator('.realm-panel button:has-text("Close")');
    if (await close.count()) await close.first().click();
  }
  await page.waitForTimeout(settle);
  return { browser, context, page, errors };
}

/** drei's <Html> writes translate3d on the wrapper every frame: a DOM-readable position probe. */
const platePositions = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".realm-plate")).map((el) => {
      const wrap = el.closest("div[style*='translate3d']");
      const px = wrap ? [...wrap.style.transform.matchAll(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/g)] : [];
      const last = px[px.length - 1];
      return {
        name: (el.querySelector(".realm-plate-name") || el).textContent.trim(),
        x: last ? Number(last[1]) : null,
        y: last ? Number(last[2]) : null,
      };
    })
  );

const walk = async (page, keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(400);
};

/** Gold pixels (#c9a84c / calm #8a7d5a), as angles around the crop centre. */
async function goldAngles(page, name, box) {
  const buf = await page.screenshot({ clip: box });
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const cx = info.width / 2, cy = info.height / 2;
  const pts = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const gold = Math.abs(r - 201) < 34 && Math.abs(g - 168) < 34 && Math.abs(b - 76) < 40;
      const calm = Math.abs(r - 138) < 30 && Math.abs(g - 125) < 30 && Math.abs(b - 90) < 30;
      if (gold || calm) pts.push({ x: x - cx, y: y - cy, r: Math.hypot(x - cx, y - cy) });
    }
  }
  // The arrowhead is the gold that sits outside the ring's outer radius (0.55 units * zoom 40 = 22px).
  const head = pts.filter((p) => p.r > 24 && p.r < 40);
  if (head.length === 0) return { count: pts.length, head: 0, angle: null };
  const mx = head.reduce((s, p) => s + p.x, 0) / head.length;
  const my = head.reduce((s, p) => s + p.y, 0) / head.length;
  return { count: pts.length, head: head.length, angle: Math.round((Math.atan2(my, mx) * 180) / Math.PI) };
}

const STEPS = {};

async function main() {
  const step = process.env.STEP;
  if (!STEPS[step]) throw new Error(`unknown STEP: ${step}`);
  await STEPS[step]();
  fs.writeFileSync(path.join(OUT, `${step}.json`), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? `ALL PASS (${results.length})` : `FAILED ${failed.length}/${results.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}
EOF
echo "harness written"
```

The per-check bodies are appended in the steps below (each one adds a `STEPS.<name> = async () => {…}` block **before** the final `main()` call). Add each with a small edit that inserts above `async function main()`, then run it.

- [ ] **Step 12: Check 1 — the ring and its notch turn with W, A, S, D**

Insert into `$SC/realm-pass.mjs` above `async function main()`:

```js
STEPS.ring = async () => {
  const { browser, page } = await open();
  const box = { x: CENTRE.x - 70, y: CENTRE.y - 70, width: 140, height: 140 };
  const seen = {};
  for (const [key, facing] of [["w", "n"], ["d", "e"], ["s", "s"], ["a", "w"]]) {
    await walk(page, [key], 700);
    seen[facing] = await goldAngles(page, `check1-ring-${facing}`, box);
    check(`ring drawn facing ${facing}`, seen[facing].count > 80, seen[facing]);
    check(`arrowhead found facing ${facing}`, seen[facing].head > 0, seen[facing]);
  }
  const angles = Object.entries(seen).map(([f, v]) => ({ f, a: v.angle }));
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      const d = Math.abs(((angles[i].a - angles[j].a + 540) % 360) - 180);
      check(`notch differs ${angles[i].f} vs ${angles[j].f}`, 180 - d > 45, { a: angles[i].a, b: angles[j].a });
    }
  }
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=ring node $SC/realm-pass.mjs
```

Expected: `ALL PASS`, and four PNGs (`check1-ring-n/e/s/w.png`) in which the gold ring is visible under the hero with its 60° gap and solid arrowhead pointing a different way in each. **Look at the four images** — the automated part proves the arrowhead moved, your eyes prove it points where the hero walks (in this isometric world W walks screen-up-and-left; the arrowhead must agree with the direction the hero just travelled).

- [ ] **Step 13: Check 2 — shadows do not bob**

```js
STEPS.bob = async () => {
  const { browser, page } = await open({ settle: 3000 });
  const groundBox = { x: CENTRE.x - 40, y: CENTRE.y - 12, width: 80, height: 24 }; // ring + contact shadow
  const spriteBox = { x: CENTRE.x - 40, y: CENTRE.y - 80, width: 80, height: 60 }; // the bobbing figure
  const ground = [], sprite = [];
  for (let i = 0; i < 12; i++) {
    ground.push(await page.screenshot({ clip: groundBox }));
    sprite.push(await page.screenshot({ clip: spriteBox }));
    await page.waitForTimeout(250);
  }
  fs.writeFileSync(path.join(OUT, "check2-ground-first.png"), ground[0]);
  fs.writeFileSync(path.join(OUT, "check2-sprite-first.png"), sprite[0]);
  fs.writeFileSync(path.join(OUT, "check2-sprite-last.png"), sprite[sprite.length - 1]);
  const same = (a, b) => Buffer.compare(a, b) === 0;
  const groundStill = ground.every((b) => same(b, ground[0]));
  const spriteMoved = sprite.filter((b) => !same(b, sprite[0])).length;
  check("the shadow and ring hold still for 3 s", groundStill, { frames: ground.length });
  check("the sprite does not hold still (it bobs)", spriteMoved >= 4, { differing: spriteMoved, of: sprite.length });
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=bob node $SC/realm-pass.mjs
```

Expected: both PASS — the ground band is byte-identical across twelve captures over 3 s while the sprite band differs in at least four. If `groundStill` fails, open `check2-ground-first.png`: a trouble wandering into the crop is the usual cause — walk the hero to open grass (`walk(page, ["w"], 1500)`) before sampling and re-run. If it still fails, the shadow is taking `bob` and task 13 is wrong.

- [ ] **Step 14: Check 3 — eight legible nameplates, default and largerText**

```js
STEPS.plates = async () => {
  const { browser, page } = await open();
  const names = await page.$$eval(".realm-plate-name", (els) => els.map((e) => e.textContent.trim()));
  check("eight villager plates", names.length === 8, names);
  check("Old Bram is named", names.includes("Old Bram"), names);
  const size = await page.$eval(".realm-plate-name", (e) => getComputedStyle(e).fontSize);
  const tag = await page.$eval(".realm-plate-tag", (e) => e.textContent.trim());
  check("plate name is 13px at hudScale 1", size === "13px", { size });
  check("the objective plate carries its site and progress", /Village Well/.test(tag), { tag });
  fs.writeFileSync(path.join(OUT, "check3-plates-default.png"), await page.screenshot());
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=plates node $SC/realm-pass.mjs
node $SC/realm-db.mjs "insert into learning_profile (id, child_id, larger_text, created_at, updated_at) values ('acc-lp', 'demo-child-1', 1, unixepoch(), unixepoch()) on conflict(child_id) do update set larger_text = 1"
BASE=$BASE_AFTER SC=$SC STEP=plates OUT=$SC/evidence/checks node $SC/realm-pass.mjs 2>&1 | tail -6
```

The second run is expected to FAIL the `13px` assertion with `16.25px` — that is the pass condition for largerText (`calc(13px * 1.25)`). Rename the screenshot it wrote so both survive, then put the profile back:

```bash
mv $SC/evidence/checks/check3-plates-default.png $SC/evidence/checks/check3-plates-larger.png
node $SC/realm-db.mjs "update learning_profile set larger_text = 0 where child_id = 'demo-child-1'"
BASE=$BASE_AFTER SC=$SC STEP=plates node $SC/realm-pass.mjs
```

Expected: eight plates both times, `13px` then `16.25px` then `13px`, and two screenshots in which every one of the eight names is readable at 1280×800 — read them yourself; "legible" is not an assertion a script can make.

- [ ] **Step 15: Check 4 — the crown ceremony carries plates, markers and shadows**

```js
STEPS.ceremony = async () => {
  const { browser, page } = await open({ closeHelp: true, settle: 1000 });
  const start = await platePositions(page);
  check("eight plates before the ceremony", start.length === 8, start.map((p) => p.name));
  const samples = [];
  for (let i = 0; i < 24; i++) {
    samples.push(await platePositions(page));
    if (i === 8) fs.writeFileSync(path.join(OUT, "check4-ceremony-mid.png"), await page.screenshot());
    await page.waitForTimeout(500);
  }
  const spread = (s) => Math.max(...s.map((p) => p.x)) - Math.min(...s.map((p) => p.x));
  const moved = samples.some((s) => s.length === 8 && s.some((p, i) => Math.abs(p.x - start[i].x) > 30));
  const gathered = Math.min(...samples.filter((s) => s.length === 8).map(spread));
  const neverDropped = samples.every((s) => s.length === 8);
  check("plates travelled with their villagers", moved, { moved });
  check("plates gathered at the plaza", gathered < spread(start) * 0.6, { gathered, at_start: spread(start) });
  check("no plate detached during the ceremony", neverDropped, { samples: samples.length });
  const back = await platePositions(page);
  check("plates came home", back.every((p, i) => Math.abs(p.x - start[i].x) < 25), back.map((p) => Math.round(p.x)));
  fs.writeFileSync(path.join(OUT, "check4-ceremony-after.png"), await page.screenshot());
  await browser.close();
};
```

Then re-arm the ceremony and run it:

```bash
node $SC/realm-db.mjs "update season set ceremony_seen_at = null where id = 'acc-season'"
BASE=$BASE_AFTER SC=$SC STEP=ceremony node $SC/realm-pass.mjs
```

Expected: `ALL PASS`. `check4-ceremony-mid.png` must show the eight plates, the gold `!`, the dim `✓` badges and the contact shadows **at the plaza with their villagers**, not hovering over empty foundations — this is the check every proposal missed, so look at the image as well as the assertions. If `plates travelled` fails, the ceremony is still writing to a sprite instead of the group (task 15).

- [ ] **Step 16: Check 5 — tap-to-talk, with a mouse and on touch**

```js
const talkRun = async (touch) => {
  const { browser, page } = await open({ touch });
  const plates = await platePositions(page);
  const far = plates.map((p, i) => ({ i, p, d: Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y) })).sort((a, b) => b.d - a.d)[0];
  const boxes = await page.$$eval(".realm-plate", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; }));
  const b = boxes[far.i];
  const target = { x: b.x, y: b.y + b.h + 40 }; // the sprite body under the plate, not the plate itself
  if (touch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  const opened = await page.waitForSelector('[role="dialog"]', { timeout: 12000 }).then(() => true).catch(() => false);
  check(`${touch ? "touch" : "mouse"}: a distant villager opens the site card on arrival`, opened, { villager: far.p.name });
  fs.writeFileSync(path.join(OUT, `check5-talk-${touch ? "touch" : "mouse"}.png`), await page.screenshot());
  await browser.close();
};
/**
 * The other six clauses of §3.11, which task 14 named and no jsdom test can reach:
 * the foundation tap, the in-reach shortcut, the aiming branch, the 8-second deadline,
 * the help-card cancel, and the bubble's one 56px control.
 */
const talkRest = async () => {
  const { browser, page } = await open();

  // (3) the bare foundation of the well walks you to Old Bram.
  const bram = page.locator(".realm-plate", { hasText: "Old Bram" });
  const plateBox = await bram.boundingBox();
  await page.mouse.click(plateBox.x + plateBox.width / 2, plateBox.y + plateBox.height + 95); // the foundation slab under the villager
  const viaSite = await page.waitForSelector('[role="dialog"]', { timeout: 12000 }).then(() => true).catch(() => false);
  check("tapping the well's foundation opens Old Bram's card", viaSite, {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // (8) the reach bubble: one control, the right words, 56px.
  const talk = page.locator(".realm-bubble-talk");
  const bubble = await talk.first().boundingBox();
  check("the reach bubble's Talk control is at least 56px tall", bubble !== null && bubble.height >= 56, bubble);
  check("the keyboard hero is told the key", (await talk.first().textContent()).replace(/\s+/g, " ").trim() === "Talk · Enter", { text: await talk.first().textContent() });
  check("the greeting paragraph is gone", (await page.$$(".realm-bubble p")).length === 0, {});

  // (6) a villager already in reach opens immediately, with no walk.
  const before = await platePositions(page);
  await bram.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  const after = await platePositions(page);
  check("a villager in reach opens at once, without walking", after.every((p, i) => Math.abs(p.x - before[i].x) < 6), { before: before[0], after: after[0] });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // (7) with a spell page selected, a tap on a villager casts and does not open a card.
  await page.keyboard.press("1");
  await page.waitForTimeout(400);
  await bram.click();
  await page.waitForTimeout(1500);
  check("a tap on a villager while aiming casts instead of talking", (await page.$$('[role="dialog"]')).length === 0, {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // (4) walk away from a queued talk: nothing opens after the 8 s deadline.
  const far = (await platePositions(page)).map((p, i) => ({ i, d: Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y) })).sort((a, b) => b.d - a.d)[0];
  const boxes = await page.$$eval(".realm-plate", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; }));
  await page.mouse.click(boxes[far.i].x, boxes[far.i].y + boxes[far.i].h + 40);
  await walk(page, ["s"], 1500); // change the hero's mind straight away
  await page.waitForTimeout(9000); // past PENDING_TALK_MS (8000)
  check("a queued talk the hero walked away from expires silently", (await page.$$('[role="dialog"]')).length === 0, {});

  // (5) opening the help card cancels a queued talk.
  await page.mouse.click(boxes[far.i].x, boxes[far.i].y + boxes[far.i].h + 40);
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="How to play"]').click();
  await page.waitForTimeout(1200);
  await page.locator('.realm-panel button:has-text("Close")').click();
  await page.waitForTimeout(7000);
  check("opening the help card cancels a queued talk", (await page.$$('[role="dialog"]')).length === 0, {});

  fs.writeFileSync(path.join(OUT, "check5-talk-rest.png"), await page.screenshot());
  await browser.close();
};
STEPS.talk = async () => { await talkRun(false); await talkRun(true); await talkRest(); };
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=talk node $SC/realm-pass.mjs
```

Expected: `ALL PASS` — the two `talkRun` cases plus the eight `talkRest` ones, which together are all eight clauses task 14 listed for this check. Each screenshot shows the SiteCard for the villager whose plate was farthest from the centre. A failure with `opened: false` means either the pick handler never fired (task 14) or the pending talk expired before arrival — `PENDING_TALK_MS` is 8000 and the harness waits 12 s, so an expiry means the walk was blocked. If the foundation click lands on grass instead (the offset depends on the site's footprint), nudge the `+ 95` until the ray hits the slab and record the number you used.

- [ ] **Step 17: Check 6 — a pointerdown at top-centre, while a toast shows, still walks the hero**

```js
STEPS.toptap = async () => {
  const { browser, page } = await open();
  await page.keyboard.press("1");
  await page.keyboard.press("1"); // select then deselect: the cast-hint toast holds 4 s, nothing is armed
  const toast = await page.$eval(".realm-message--cheer, .realm-message--plain", (e) => e.textContent.trim()).catch(() => "");
  check("a toast is showing", toast.length > 0, { toast });
  const before = await platePositions(page);
  await page.mouse.click(CENTRE.x, 24);
  await page.waitForTimeout(1200);
  const afterTop = await platePositions(page);
  check("a tap at top-centre walked the hero", afterTop.some((p, i) => Math.abs(p.x - before[i].x) > 8 || Math.abs(p.y - before[i].y) > 8), { before: before[0], after: afterTop[0] });
  const card = await page.$(".realm-hud-objective");
  const r = await card.boundingBox();
  const mid = await platePositions(page);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(1200);
  const afterCard = await platePositions(page);
  check("a tap on the objective card itself walked the hero", afterCard.some((p, i) => Math.abs(p.x - mid[i].x) > 8 || Math.abs(p.y - mid[i].y) > 8), { before: mid[0], after: afterCard[0] });
  fs.writeFileSync(path.join(OUT, "check6-toptap.png"), await page.screenshot());
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=toptap node $SC/realm-pass.mjs
```

Expected: `ALL PASS`. Plate positions move because the camera follows the hero; if they do not, `globals.css:1705` is still turning the whole HUD band back on and task 11's pointer-events narrowing did not land.

- [ ] **Step 18: Check 7 — the edge arrow tracks the off-camera objective**

```js
STEPS.arrow = async () => {
  const { browser, page } = await open();
  const read = () => page.evaluate(() => {
    const el = document.querySelector(".realm-edge-arrow");
    return el ? { hidden: el.hidden, transform: el.style.transform } : null;
  });
  check("the arrow is hidden while the well is on camera", (await read())?.hidden === true, await read());
  await walk(page, ["s"], 4000); // south, away from the well
  const away = await read();
  check("the arrow appears when the objective leaves the camera", away && away.hidden === false, away);
  fs.writeFileSync(path.join(OUT, "check7-arrow-visible.png"), await page.screenshot());
  const seen = [away.transform];
  for (const keys of [["a"], ["w"], ["d"]]) {
    await walk(page, keys, 2500);
    seen.push((await read()).transform);
  }
  check("the arrow re-aims as the hero circles", new Set(seen).size >= 3, seen);
  fs.writeFileSync(path.join(OUT, "check7-arrow-circled.png"), await page.screenshot());
  await browser.close();
};

/** §5: a finished kingdom carries no focus, so it grows neither a beacon nor an arrow. */
STEPS.arrowdone = async () => {
  const { browser, page } = await open();
  check("no site is focused when every building is raised", (await page.$$(".realm-plate-badge--quest")).length === 0, {});
  check("every plate reads Built", (await page.$$eval(".realm-plate-tag", (els) => els.every((e) => /· Built$/.test(e.textContent.trim())))), {});
  await walk(page, ["s"], 4000);
  const el = await page.evaluate(() => { const a = document.querySelector(".realm-edge-arrow"); return a ? { hidden: a.hidden } : null; });
  check("the arrow stays hidden with nothing to point at", el !== null && el.hidden === true, el);
  check("the objective card reads the completion line", /Every building is raised\./.test(await page.$eval(".realm-hud-objective", (e) => e.textContent)), {});
  fs.writeFileSync(path.join(OUT, "check7-arrow-complete.png"), await page.screenshot());
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=arrow node $SC/realm-pass.mjs
```

Then the finished-kingdom half — raise all eight buildings, run it, and put the fixture straight back so the later checks still see the well at 4 of 5:

```bash
node $SC/realm-db.mjs "insert into kingdom_progress (id, child_id, building_id, deeds_done, created_at, updated_at) select 'acc-all-' || b.id, 'demo-child-1', b.id, 5, unixepoch(), unixepoch() from (select 'well' as id union select 'mill' union select 'bridge' union select 'chapel' union select 'market' union select 'library' union select 'watchtower' union select 'garden') b on conflict(child_id, building_id) do update set deeds_done = 5"
BASE=$BASE_AFTER SC=$SC STEP=arrowdone node $SC/realm-pass.mjs
node $SC/realm-db.mjs "delete from kingdom_progress where child_id = 'demo-child-1' and id like 'acc-all-%'"
node $SC/realm-db.mjs "update kingdom_progress set deeds_done = 4 where child_id = 'demo-child-1' and building_id = 'well'"
node $SC/realm-db.mjs "update kingdom_progress set deeds_done = 1 where child_id = 'demo-child-1' and building_id = 'mill'"
node $SC/realm-db.mjs "select building_id, deeds_done from kingdom_progress where child_id = 'demo-child-1' order by building_id"
```

Expected: `ALL PASS` for `arrowdone` — no gold `!` anywhere, no beacon column in `check7-arrow-complete.png`, the arrow node present but `hidden`, and the card reading `Every building is raised.` / `Nothing is waiting. Walk where you like.` Then the last read-back shows `well` at 4 and `mill` at 1 again, with no other building above 0 that was not there in `fixture-before-kingdom.json`.

Expected: `ALL PASS`, and in both screenshots the gold arrow sits on the screen edge pointing back toward the well. A `hidden: true` after walking south means `edgeArrow` never returned a point — check the viewport it is being handed is not zero-size (§5).

- [ ] **Step 19: Check 8 — reducedMotion and lowStimulus together: every mark present, nothing moving**

```js
STEPS.calm = async () => {
  const { browser, page } = await open({ settle: 3000 });
  const plates = await page.$$eval(".realm-plate", (e) => e.length);
  const badges = await page.$$eval(".realm-plate-badge", (e) => e.length);
  const arrowExists = await page.$(".realm-edge-arrow");
  check("all eight plates are present in calm mode", plates === 8, { plates });
  check("the status badges are present in calm mode", badges >= 1, { badges });
  check("the edge arrow node still exists", Boolean(arrowExists), {});
  const a = await page.screenshot();
  await page.waitForTimeout(1500);
  const b = await page.screenshot();
  check("nothing in the world moves", Buffer.compare(a, b) === 0, { bytes: a.length });
  const pos1 = await platePositions(page);
  await page.waitForTimeout(800);
  const pos2 = await platePositions(page);
  check("no plate moves", JSON.stringify(pos1) === JSON.stringify(pos2), { pos1: pos1[0], pos2: pos2[0] });
  fs.writeFileSync(path.join(OUT, "check8-calm.png"), b);
  await browser.close();
};
```

```bash
node $SC/realm-db.mjs "update learning_profile set reduced_motion = 1, low_stimulus = 1 where child_id = 'demo-child-1'"
BASE=$BASE_AFTER SC=$SC STEP=calm node $SC/realm-pass.mjs
node $SC/realm-db.mjs "update learning_profile set reduced_motion = 0, low_stimulus = 0 where child_id = 'demo-child-1'"
```

Expected: `ALL PASS` — two full-page screenshots 1.5 s apart are byte-identical (no bob, no beacon breathing, no badge bobbing, no arrow pulse) while the ring, the eight plates, the badges, the shadows and the beacon are all still on screen, muted. `check8-calm.png` is the evidence that lowStimulus mutes and never empties.

- [ ] **Step 19b: Check 11 — the interim tenants sit where the bar will find them**

§7's list has ten checks; this is the eleventh, and it is task 10's, which named it and could not run it. The mana strip's footing and the mount button's size and place are pure CSS over the canvas — the jsdom tests prove the markup, only the browser proves the geometry.

```js
STEPS.tenants = async () => {
  const { browser, page } = await open();
  const geom = () => page.evaluate(() => {
    const strip = document.querySelector(".realm-mana-pips");
    const mount = document.querySelector(".realm-mount-button");
    const bar = document.querySelector(".realm-spellbar");
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    return {
      strip: r(strip),
      mount: r(mount),
      bar: r(bar),
      barBottom: getComputedStyle(document.querySelector(".realm-root")).getPropertyValue("--realm-bar-bottom").trim(),
      touch: getComputedStyle(document.querySelector(".realm-root")).getPropertyValue("--realm-touch").trim(),
      key: mount ? Boolean(mount.querySelector(".realm-mount-key")) : null,
      refused: strip ? strip.className.includes("realm-mana-pips--refused") : null,
      // §3.7's other half: the shake belongs on the slot whose cost could not be paid.
      slotRefused: Boolean(document.querySelector(".realm-spell--refused")),
      slotIsSelected: Boolean(document.querySelector(".realm-spell--selected.realm-spell--refused")),
    };
  });
  const g = await geom();
  check("--realm-touch is 56px", g.touch === "56px", g);
  check("--realm-bar-bottom is the desktop footing", g.barBottom === "1.25rem", g);
  check("the mana strip sits above the spell bar", g.strip !== null && g.bar !== null && g.strip.bottom <= g.bar.top + 2, { strip: g.strip, bar: g.bar });
  check("the mana strip is centred", g.strip !== null && Math.abs(g.strip.x + g.strip.width / 2 - VIEWPORT.width / 2) < 4, g.strip);
  check("the mount button is a 56px round control at the bottom-right", g.mount !== null && g.mount.width >= 56 && g.mount.height >= 56 && g.mount.x > VIEWPORT.width * 0.75, g.mount);
  check("the keyboard hero gets the M keycap", g.key === true, { key: g.key });
  fs.writeFileSync(path.join(OUT, "check11-tenants.png"), await page.screenshot());

  // The refusal: cast the dearest page with no mana to spend, and watch the strip go red.
  await page.keyboard.press("4");
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(CENTRE.x + 60, CENTRE.y + 40);
    await page.waitForTimeout(250);
  }
  const during = await geom();
  check("a refused cast marks the strip refused", during.refused === true, during);
  check("a refused cast shakes the selected slot too", during.slotRefused === true && during.slotIsSelected === true, during);
  check("the refusal shake does not throw the strip off-centre", during.strip !== null && Math.abs(during.strip.x + during.strip.width / 2 - VIEWPORT.width / 2) < 12, during.strip);
  check("the refusal says why", /Not enough mana yet\./.test(await page.$eval(".realm-messages", (e) => e.textContent)), {});
  fs.writeFileSync(path.join(OUT, "check11-refused.png"), await page.screenshot());
  await page.waitForTimeout(900);
  const after = await geom();
  check("the refusal clears itself after 600 ms", after.refused === false, {});
  check("the slot stops shaking with it", after.slotRefused === false, {});

  // §6: "The eight plates sit in DOM order after the HUD zones." The plates are drei <Html>
  // portals inside the Canvas wrapper, so this holds only while realm-shell.tsx renders the
  // HUD and the lanes ABOVE <RealmScene> (task 9, step 13e). jsdom proves the shell's own
  // order; only a browser proves where drei actually put the portals.
  const order = await page.evaluate(() => {
    const hud = document.querySelector(".realm-hud-identity");
    const plate = document.querySelector(".realm-plate");
    if (!hud || !plate) return null;
    return { bothPresent: true, hudFirst: Boolean(hud.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check("the HUD zones precede the villager plates in DOM order", order !== null && order.hudFirst === true, order);
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=tenants node $SC/realm-pass.mjs
```

Expected: `ALL PASS`. If `--realm-bar-bottom` reads `9.5rem`, the hero's profile is on `inputMode: "touch"` — set it back to `auto` and re-run, then record that the raised-bar case was checked by hand instead. If the strip does not go red, either `onSpellEvent`'s `refused` case is not raising `refusedAt` (task 10) or the hero has mana to spare — hold the cast longer, or seed a cheaper page. If the strip goes red but no slot does, the `refused` prop is not reaching `SpellBar` (task 10, step 27). If `the HUD zones precede the villager plates` fails, `realm-shell.tsx` is still rendering `<RealmScene>` before `<RealmHud>` — fix the order there (task 9, step 13e), not with `tabindex`.

- [ ] **Step 20: Check 10 — read-aloud: three sentences, once each, no stutter**

```js
STEPS.speech = async () => {
  const { browser, page } = await open({ settle: 2500 });
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  check("the objective is spoken once on arrival", (await spoken()).filter((s) => s === "Your next side quest is at the Village Well. Old Bram is waiting.").length === 1, await spoken());
  // reach: walk to Old Bram through his plate's pick handler, then wait out the walk
  const plate = page.locator(".realm-plate", { hasText: "Old Bram" });
  await plate.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 12000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  const afterReach = await spoken();
  check("the reach line is spoken once", afterReach.filter((s) => s === "Old Bram is here. Press Enter to talk.").length === 1, afterReach);
  // finish the well's last side quest: the rise toast is the third sentence
  await plate.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 12000 });
  await page.locator('button:has-text("Begin")').first().click();
  for (let q = 0; q < 5; q++) {
    await page.locator(".realm-panel button, [role='dialog'] button").filter({ hasNotText: "Read aloud" }).nth(1).click();
    const next = page.locator('button[aria-label="Next question"], button[aria-label="Finish side quest"]');
    await next.first().click();
    await page.waitForTimeout(600);
  }
  await page.locator('button:has-text("Back to the Realm")').click();
  await page.waitForTimeout(1500);
  const all = await spoken();
  const rise = "The Village Well stands. Next: the Grain Mill, with Miller Tessa.";
  check("the rise toast is spoken once, carrying the next objective", all.filter((s) => s === rise).length === 1, all);
  check("no sentence is spoken twice", new Set(all).size === all.length, all);
  fs.writeFileSync(path.join(OUT, "check10-speech.json"), JSON.stringify(all, null, 2));
  await browser.close();
};
```

```bash
node $SC/realm-db.mjs "update learning_profile set read_aloud = 1 where child_id = 'demo-child-1'"
node $SC/realm-db.mjs "update kingdom_progress set deeds_done = 4, completed_at = null where child_id = 'demo-child-1' and building_id = 'well'"
BASE=$BASE_AFTER SC=$SC STEP=speech node $SC/realm-pass.mjs
```

Expected: `ALL PASS` and `check10-speech.json` holding the three sentences, each exactly once, in order. The answer-picking selector clicks whatever choice sits second in the dialog — correctness does not matter, only that the run finishes. If the loop desynchronises (a differently-shaped panel), finish the five questions by hand with `PWDEBUG=1` and record that you did. Leave `read_aloud = 1` for Step 21; Step 25 restores it.

Then, for the ceremony's narration — the third read-aloud surface the spec names — re-arm and watch one:

```bash
node $SC/realm-db.mjs "update season set ceremony_seen_at = null where id = 'acc-season'"
BASE=$BASE_AFTER SC=$SC STEP=ceremony node $SC/realm-pass.mjs
```

Expected: PASS as in Step 15, and (read `$SC/evidence/checks/check4-ceremony-mid.png`) the narration renders as `.realm-message--stage` **centre screen**, not as a small left-aligned line in the corner. That is the "emotional payoff" clause of §1.

- [ ] **Step 21: Check 9a — the frame budget, before and after**

```bash
cat > $SC/frame-budget.mjs <<'EOF'
// Median frame time and onReady, on one base URL. Run it against both servers.
//   BASE=http://localhost:3101 RUNS=3 node frame-budget.mjs
import { createRequire } from "module";
import fs from "fs";
const REPO = "/home/kylee/projects/kingdoms-and-crowns";
const require = createRequire(REPO + "/package.json");
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const BASE = process.env.BASE;
const EXEC = process.env.CHROME_PATH;
const RUNS = Number(process.env.RUNS || 3);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "demo_persona", value: "lily", domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" }]);
  await context.addInitScript(() => {
    window.__firstCanvas = null;
    const obs = new MutationObserver(() => {
      if (window.__firstCanvas === null && document.querySelector(".realm-root canvas")) {
        window.__firstCanvas = performance.now();
        obs.disconnect();
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(`${BASE}/realm`, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".realm-root canvas", { timeout: 60000 });
  const onReady = await page.evaluate(() => window.__firstCanvas);
  const close = page.locator('.realm-panel button:has-text("Close")');
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(4000); // warm up: textures settled, first GC past
  const get = (m, n) => m.metrics.find((x) => x.name === n).value;
  const m0 = await cdp.send("Performance.getMetrics");
  await page.evaluate(() => { window.__f = []; const tick = (t) => { window.__f.push(t); window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick); });
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(10000);
  await page.keyboard.up("w");
  await page.keyboard.up("d");
  const stamps = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__f; });
  const m1 = await cdp.send("Performance.getMetrics");
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]);
  const taskMs = (get(m1, "TaskDuration") - get(m0, "TaskDuration")) * 1000;
  runs.push({
    onReadyMs: Math.round(onReady),
    frames: deltas.length,
    medianFrameMs: Number(median(deltas).toFixed(2)),
    p95FrameMs: Number([...deltas].sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)].toFixed(2)),
    mainThreadMsPerFrame: Number((taskMs / deltas.length).toFixed(3)),
  });
  await browser.close();
}
console.log(JSON.stringify({ base: BASE, runs, median: {
  onReadyMs: median(runs.map((r) => r.onReadyMs)),
  medianFrameMs: median(runs.map((r) => r.medianFrameMs)),
  mainThreadMsPerFrame: median(runs.map((r) => r.mainThreadMsPerFrame)),
} }, null, 2));
EOF
BASE=$BASE_BEFORE RUNS=3 node $SC/frame-budget.mjs > $SC/evidence/frame-before.json
BASE=$BASE_AFTER RUNS=3 node $SC/frame-budget.mjs > $SC/evidence/frame-after.json
node -e "const b=require('$SC/evidence/frame-before.json'),a=require('$SC/evidence/frame-after.json');const d={frameDelta:+(a.median.medianFrameMs-b.median.medianFrameMs).toFixed(2),mainThreadDelta:+(a.median.mainThreadMsPerFrame-b.median.mainThreadMsPerFrame).toFixed(3),onReadyDelta:a.median.onReadyMs-b.median.onReadyMs};console.log(JSON.stringify({before:b.median,after:a.median,...d},null,2));require('fs').writeFileSync('$SC/evidence/frame-budget.json',JSON.stringify({before:b,after:a,delta:d},null,2))"
```

Expected, against §3.13's budget: `mainThreadDelta` ≤ **1.0** ms/frame and `frameDelta` ≤ **1.0** ms. `mainThreadMsPerFrame` is the decisive number — under software rendering the rAF delta can be dominated by the GPU emulation and hide a main-thread regression, so record both and judge on the main-thread figure. Write the three numbers into `acceptance.md`. If `mainThreadDelta` > 1.0, go to Step 24.

- [ ] **Step 22: Check 9b — `onReady` costs nothing new**

Read `onReadyMs` out of the same two files (the metric is the moment the world's canvas first exists, which the shell mounts only once `SpriteTextures` have arrived — the honest DOM proxy for `onReady`, and it exists identically in both builds):

```bash
node -e "const b=require('$SC/evidence/frame-before.json'),a=require('$SC/evidence/frame-after.json');console.log('before',b.runs.map(r=>r.onReadyMs),'median',b.median.onReadyMs);console.log('after ',a.runs.map(r=>r.onReadyMs),'median',a.median.onReadyMs)"
```

Expected: the two medians are within dev-server noise of each other (±150 ms on this machine; three runs each is what makes that judgement possible). §3.13's claim is **0 ms added**, and the mechanism is that this slice adds zero rasterised sprite kinds — so also prove the claim structurally:

```bash
cd /home/kylee/projects/kingdoms-and-crowns
git diff $BASE_SHA..HEAD -- src/components/realm/sprite-source.tsx src/components/realm/sprite-texture.ts src/components/realm/world-figures.tsx | head -20
```

Expected: **empty**. No sprite kind was added, changed, or re-sized; the first-paint bill is byte-for-byte the same work. Record both the timing and the empty diff.

- [ ] **Step 23: The preview matrix, seen (§3.17), and the clock audit (§3.18)**

```js
STEPS.preview = async () => {
  const { browser, page } = await open({ persona: "parent", query: "?child=demo-child-1", closeHelp: false });
  const text = await page.$eval(".realm-message--problem", (e) => e.textContent.trim());
  check("the preview line is in the problem lane", /You're looking at Emma's grounds\./.test(text), { text });
  check("the objective card renders in preview", Boolean(await page.$(".realm-hud-objective")), {});
  const card = await page.$eval(".realm-hud-objective", (e) => e.textContent);
  check("preview line 2 names the hero", /Old Bram is waiting for Emma\./.test(card), { card });
  check("preview objective always shows numbers", /4 of 5/.test(card), { card });
  check("mana pips are suppressed in preview", (await page.$$(".realm-mana-pips")).length === 0, {});
  // The pill is a `.realm-hud-badge` carrying recessPillText, so assert on the copy, not on a class.
  check("the recess pill is suppressed in preview", !/Recess ·/.test(await page.$eval(".realm-hud-meta", (e) => e.textContent)), { meta: await page.$eval(".realm-hud-meta", (e) => e.textContent) });
  const mount = await page.$(".realm-mount-button");
  check("the mount button renders disabled in preview", mount !== null && (await mount.isDisabled()), {});
  check("'Show me everything' is suppressed in preview", (await page.$$('button:has-text("Show me everything")')).length === 0, {});
  check("eight plates render in preview", (await page.$$(".realm-plate")).length === 8, {});
  check("nothing was spoken in preview", (await page.evaluate(() => window.__spoken)).length === 0, await page.evaluate(() => window.__spoken));
  check("the floating dock does not float over the portal", await page.evaluate(() => { const d = document.querySelector(".floating-dock"); return !d || getComputedStyle(d).display === "none"; }), {});
  // §3.20: the portal is the top of the stack, and the hero switcher rides the header row.
  check("the body is marked while the portal is open", await page.evaluate(() => document.body.getAttribute("data-realm-open") === "true"), {});
  check("the portal outranks the app chrome", await page.evaluate(() => getComputedStyle(document.querySelector(".realm-root")).zIndex === "60"), {});
  check("the hero switcher is in the HUD header, not over the world", await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((e) => e.textContent.trim() === "Play as a hero");
    const meta = document.querySelector(".realm-hud-meta");
    return !b || (meta !== null && meta.contains(b) && !b.classList.contains("floating-dock"));
  }), {});
  fs.writeFileSync(path.join(OUT, "check-preview.png"), await page.screenshot());
  await browser.close();
};

/** §3.20, the child's half: a running quest timer comes back as a chip, nothing else does. */
STEPS.chrome = async () => {
  const { browser, page, context } = await open({ closeHelp: true, settle: 500 });
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem("kingdomsandcrowns:quest-timer", JSON.stringify({ assignmentId: "a1", startedAt: now - 42_000, accumulatedMs: 42_000, resumedAt: now }));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".realm-root canvas", { timeout: 60000 });
  await page.waitForTimeout(2000);
  const chip = await page.$(".realm-hud-chip");
  check("a running quest timer returns as a HUD chip", chip !== null, {});
  check("the chip is inside the meta zone", await page.evaluate(() => { const c = document.querySelector(".realm-hud-chip"); const m = document.querySelector(".realm-hud-meta"); return Boolean(c && m && m.contains(c)); }), {});
  check("the quest-timer popup is suppressed", await page.evaluate(() => { const p = document.querySelector(".quest-timer-popup"); return !p || getComputedStyle(p).display === "none"; }), {});
  check("a child's hero-switch pill is gone from the world", await page.evaluate(() => !Array.from(document.querySelectorAll("button")).some((e) => /Leave \(switch hero\)/.test(e.textContent))), {});
  fs.writeFileSync(path.join(OUT, "check-chrome.png"), await page.screenshot());
  await page.evaluate(() => localStorage.removeItem("kingdomsandcrowns:quest-timer"));
  await context.close();
  await browser.close();
};
```

```bash
BASE=$BASE_AFTER SC=$SC STEP=preview node $SC/realm-pass.mjs
BASE=$BASE_AFTER SC=$SC STEP=chrome node $SC/realm-pass.mjs
cd /home/kylee/projects/kingdoms-and-crowns
grep -n "paused: panelOpen || ceremonyRunning || helpOpen" src/components/realm/realm-shell.tsx
git diff $BASE_SHA..HEAD -- src/components/realm/use-play-clock.ts | grep -E "^[-+].*paused" || echo "the paused argument is untouched"
node $SC/realm-db.mjs "select count(*) as spent from realm_play_ledger where child_id = 'demo-child-1' and kind = 'spent' and date = date('now')"
```

Then play and leave, to prove task 7's unmount flush charges the minute:

```bash
BASE=$BASE_AFTER SC=$SC STEP=leave node $SC/realm-pass.mjs
node $SC/realm-db.mjs "select count(*) as spent from realm_play_ledger where child_id = 'demo-child-1' and kind = 'spent' and date = date('now')"
```

with, inserted into the harness:

```js
STEPS.leave = async () => {
  const { browser, page } = await open();
  await walk(page, ["w"], 20000);
  await walk(page, ["s"], 20000); // ~40 s of visible play: under a minute, so only the round-up can charge it
  await page.locator('a:has-text("Leave the Realm")').click();
  await page.waitForTimeout(3000);
  check("the world unmounted", (await page.$$(".realm-root canvas")).length === 0, {});
  await browser.close();
};
```

Expected: `paused:` appears exactly once and unchanged; the `use-play-clock.ts` diff touches `flushPending`/`minutesToSettle` but no `paused` line; the `spent` count rises by one across the leave (40 s rounds up through `ROUND_UP_SECONDS`), which is the leak §1 named, closed. Record both counts.

- [ ] **Step 24 (only if Step 21 failed the budget): apply the recorded fallback**

The fallback was written into the spec so it is not invented under pressure: render plates only for the four villagers nearest the camera target, toggled by `el.hidden` in the frame loop, never by `setState`. In `src/components/realm/realm-scene.tsx`, add beside the other module constants:

```tsx
/** §3.13's recorded fallback: the plate budget. Applied only if the measured frame cost exceeds 1.0 ms. */
const PLATE_BUDGET = 4;
```

inside `World`, beside the other refs:

```tsx
const plateEls = useRef<Map<string, HTMLDivElement>>(new Map());
```

in the villager group, wrap the plate so each has an element to toggle:

```tsx
<Html position={[0, SPRITE_H + 0.35, 0]} center zIndexRange={[12, 0]}>
  <div
    ref={(el) => {
      if (el) plateEls.current.set(v.id, el);
      else plateEls.current.delete(v.id);
    }}
  >
    <VillagerPlate villager={v} surfaces={surfaces} calm={settings.calmPalette} motion={settings.motion} onPick={(id) => pickVillager(id, v.position)} />
  </div>
</Html>
```

and at the end of the `useFrame` body, after `p` is known:

```tsx
// Only the four plates nearest the hero are drawn. el.hidden, never setState: the World
// component is memoised and a re-render here would cost more than the plates ever do.
if (plateEls.current.size > PLATE_BUDGET) {
  const ranked = shown
    .map((v) => ({ id: v.id, d: (v.position.x - p.x) ** 2 + (v.position.z - p.z) ** 2 }))
    .sort((a, b) => a.d - b.d);
  for (let i = 0; i < ranked.length; i++) {
    const el = plateEls.current.get(ranked[i].id);
    if (el) el.hidden = i >= PLATE_BUDGET;
  }
}
```

Re-measure and re-verify, then commit:

```bash
cd /home/kylee/projects/kingdoms-and-crowns
npm run typecheck
npx eslint src/components/realm/realm-scene.tsx
npm test
BASE=$BASE_AFTER RUNS=3 node $SC/frame-budget.mjs > $SC/evidence/frame-after-fallback.json
BASE=$BASE_AFTER SC=$SC STEP=plates node $SC/realm-pass.mjs
```

Expected: typecheck clean, eslint clean, suite green, `mainThreadMsPerFrame` now within 1.0 ms of the before figure. Note that `check3` will now report four plates rather than eight — that is the fallback working, and `acceptance.md` must say so.

```bash
git add src/components/realm/realm-scene.tsx
git commit -m "perf(realm): draw only the four nearest villager plates" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

If Step 21 passed, skip this step entirely and write "fallback not needed" in `acceptance.md`.

- [ ] **Step 25: The same-framing before/after screenshots of the two views**

The spec does not name the two views the user photographed; these two reproduce them and are deterministic on both servers, because the camera follows the hero and both runs drive the hero identically from spawn.

```js
STEPS.shots = async () => {
  const tag = process.env.TAG; // "before" | "after"
  const dir = path.join(process.env.SC, "evidence", tag);
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await open({ settle: 3000 });
  fs.writeFileSync(path.join(dir, "view-a-field.png"), await page.screenshot());
  await walk(page, ["w", "d"], 2000); // up the path toward the castle, the same two seconds on both builds
  await page.waitForTimeout(1500);
  await page.keyboard.press("1"); // the spell bar with a page selected, the corner HUD, the world behind
  await page.waitForTimeout(800);
  fs.writeFileSync(path.join(dir, "view-b-bar-and-corner.png"), await page.screenshot());
  check(`${tag} shots written`, true, { dir });
  await browser.close();
};
```

```bash
BASE=$BASE_BEFORE SC=$SC TAG=before STEP=shots node $SC/realm-pass.mjs
BASE=$BASE_AFTER SC=$SC TAG=after STEP=shots node $SC/realm-pass.mjs
ls -la $SC/evidence/before $SC/evidence/after
```

Expected: four PNGs, 1280×800, framed identically within a hero-step. **View A** is the verdict's field: before, anonymous figures on a lawn with a left-aligned HUD stack; after, the gold ring under the hero, eight named plates, one gold `!`, the beacon, the centred lanes and the three anchored zones. **View B** is the bar and the corner: before, the mana bar and the scoreboard in the top-left; after, the mana pips above the bar, the round mount button beside it, and identity/objective/meta in their three anchors. Look at all four; these are what the user re-judges the slice on.

- [ ] **Step 26: Restore the fixture, stop the servers, remove the worktree**

```bash
node $SC/realm-db.mjs "delete from realm_play_ledger where id = 'acc-s1'"
node $SC/realm-db.mjs "delete from season where id = 'acc-season'"
node $SC/realm-db.mjs "delete from kingdom_progress where id in ('acc-well','acc-mill')"
node $SC/realm-db.mjs "update learning_profile set read_aloud = 0, larger_text = 0, reduced_motion = 0, low_stimulus = 0 where child_id = 'demo-child-1'"
node $SC/realm-db.mjs "update realm_settings set help_seen_at = null, depth_override = 'auto' where child_id = 'demo-child-1'"
node $SC/realm-db.mjs "delete from deed_run where child_id = 'demo-child-1' and started_at > unixepoch() - 7200"
node $SC/realm-db.mjs "select building_id, deeds_done from kingdom_progress where child_id = 'demo-child-1'"
```

Compare the last output with `$SC/evidence/fixture-before-kingdom.json`; if the pre-existing rows differed from what the deletes left, restore them by hand from that file. Then:

```bash
fuser -k 3100/tcp
fuser -k 3101/tcp
cd /home/kylee/projects/kingdoms-and-crowns
git worktree remove --force $SC/before
git worktree list
```

Expected: the kingdom reads as it did in `fixture-before-kingdom.json`, both dev servers are down, and `git worktree list` no longer names `$SC/before`.

- [ ] **Step 27: Write the acceptance record and confirm the repo is untouched**

```bash
cd /home/kylee/projects/kingdoms-and-crowns
git rev-parse --abbrev-ref HEAD
git status --short
git log --oneline $BASE_SHA..HEAD | wc -l
```

Expected: still `realm-foundations`; `git status --short` empty (every script lives in `$SC`, nothing in the repo); the commit count is the slice's — 20 tasks' commits, plus one more if Step 24 ran.

Then write `$SC/acceptance.md` with, in this order: the branch and head SHA; the `npm test` / `typecheck` / `lint` / `build` results from Steps 2-5 (with the exact test count and the one pre-existing lint error named); a table, one row per browser check, each with PASS/FAIL and the path to its screenshot and its `*.json` — §7's ten (`ring`, `bob`, `plates`, `ceremony`, `talk`, `toptap`, `arrow` + `arrowdone`, `calm`, the frame budget, `speech`) plus check 11 (`tenants`, task 10's) and the two §3.20 rows (`chrome`, and the chrome half of `preview`); the frame-budget block (`before`, `after`, `frameDelta`, `mainThreadDelta`, `onReadyDelta`) against the ≤ 1.0 ms/frame and 0 ms budget, plus the empty sprite-pipeline diff from Step 22; the preview-matrix row and the clock audit from Step 23; whether the Step 24 fallback was applied; and the four before/after paths from Step 25 with one sentence each on what changed. **This task creates and modifies no repo file, so there is nothing to commit** — the record is handed back in the session, not written into `docs/`.

Report the fragment's headline in the hand-off exactly as the evidence supports it, e.g.: *"Ten of ten browser checks pass; +0.42 ms main-thread per frame against a 1.0 ms budget; onReady unchanged (sprite pipeline diff empty); suite 961 green; lint carries only the pre-existing quest-template-list error."*
