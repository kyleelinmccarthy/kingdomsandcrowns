# The screen and the controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Realm legible and teachable — four HUD corners with a minimap, one keyboard-primary input model, and a four-step tutorial that gates on doing.

**Architecture:** Pure simulation stays in `src/lib/realm/**` with colocated tests; the scene file remains untestable and is gated by typecheck, lint and a browser pass. Two new pure modules (`minimap.ts`, `tutorial.ts`) carry this plan's real test weight. The input model collapses from two parallel schemes into one: the keyboard owns movement and interaction, the pointer owns casting and the HUD, and clicking the world never walks or talks.

**Tech Stack:** Next.js 16 App Router (RSC, server actions), React 19 + React Compiler, Drizzle + @libsql, Vitest + Testing Library (jsdom, no WebGL), Tailwind v4, three 0.185 / @react-three/fiber 9 / drei 10.

**Spec:** [docs/superpowers/specs/2026-09-12-realm-legible-and-teachable-design.md](../specs/2026-09-12-realm-legible-and-teachable-design.md) — this plan implements §3, §4 and §6 only. §5 (the art) is plan 2.

## Global Constraints

- **`Surfaces` goes from thirteen fields to fourteen, exactly once, in Task 1.** The new field is `minimap: "full" | "objectiveOnly"`. No other task may add a field.
- **`profile.fewerChoices` caps `trackedObjectives` at 1, `abilitySlots` at `"earned"`, `listRows` at 3, and `minimap` at `"objectiveOnly"` — at BOTH depths.** Every simple-depth surface is a substitution, never a removal.
- **Depth is never a word a child reads** — not in rendered text, not in `aria-label`, not in `title`.
- **The five verbs are the whole input model**: `WASD` walk, `1`–`4` cast, left click cast, `E` interact, `Esc` close. `Space` is removed. Clicking the world never walks and never talks.
- **Targeting is one rule**: the trouble under the pointer, or the nearest in range. With nothing in range a cast refuses via `.realm-mana-pips--refused` and costs no mana.
- **`GROUND_Y` is the single source of every ground-decal y** — no y literal, no arithmetic on a rung. Rungs: `water` .02, `path` .03, `foundation` .04, `propShadow` .045, `lapWaypoint` .05, `objectiveRing` .052, `figureShadow` .055, `heroRing` .06.
- **Ring and beacon constants are unchanged**: `RING_INNER` 0.42, `RING_OUTER` 0.55, `RING_NOTCH_ARC` `Math.PI/3`, `RING_GOLD` `"#c9a84c"`, `RING_CALM` `"#8a7d5a"`; `facingAngle` n:0, e:-PI/2, s:PI, w:PI/2; `BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 }`; `SHADOW_OPACITY` 0.22, `SHADOW_OPACITY_CALM` 0.14.
- **`PENDING_TALK_MS` and the pending-talk state machine are DELETED in Task 10**, not preserved. No later task may reintroduce them.
- **CSS custom properties on `.realm-root` stay frozen**: `--realm-hud-scale` (1 or 1.25), `--realm-bar-bottom` (`1.25rem`, or `9.5rem` with the stick), `--realm-touch` (`56px`). Never put `zoom` on `.realm-root`. World controls are `--realm-touch`; panel buttons stay 44px.
- **`.realm-root` stays at z-index 60** and nothing else changes z-index. `body:has(.realm-root)` keeps hiding `.floating-dock`, `.quest-timer-popup`, `.schedule-notification-popup`, `.parent-alert-popup`.
- **Class names.** These survive with new placement: `.realm-hud-identity` `.realm-hud-meta` `.realm-hud-objective`. These are deleted: `.realm-label` `.realm-label-tag`. These are added, and no others: `.realm-minimap` `.realm-minimap-ground` `.realm-minimap-site` `.realm-minimap-site--raised` `.realm-minimap-objective` `.realm-minimap-dot` `.realm-minimap-hero` `.realm-hud-corner` `.realm-legend` `.realm-legend-key` `.realm-cast-button` `.realm-tutorial` `.realm-tutorial-step`.
- **`World` is memoised — every scene prop must stay referentially stable.** `realm-shell.test.tsx` asserts all 26 and genuinely fails if one regresses; keep it passing as the prop list changes. Scene→React events go through `queueMicrotask`, never a direct setState from the frame loop.
- **Lint rule `react-hooks/set-state-in-effect` is on**; React Compiler forbids render-time ref writes and treats `useMemo` results as immutable.
- **`"use server"` files export only async functions** — never `export type { X }`.
- **Nothing reachable from a Vitest module graph may import `three` at module load.** Runtime `three` lives only in `realm-scene.tsx`, `*-layer.tsx`, and dynamic `await import("three")` in the two texture modules.
- **Never `revalidatePath("/realm")`** from an action called inside the Realm.
- **Git:** branch `realm-foundations`. Each git command on its own line, never chained with `&&`. Never use `git stash`. Every commit ends with a second `-m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`.
- **Baselines to match or beat:** `npm test` 105 files / 1056 tests passing; `npx tsc --noEmit` clean; `npm run lint` exactly ONE error, the pre-existing `src/components/quest-template-list.tsx:70` — it comes from `main` and is not a regression.

---

## A note on the three scene tasks

Tasks 7, 9, 10 and part of 13 edit `src/components/realm/realm-scene.tsx`. That file has no unit tests — the runner is jsdom with no WebGL and the scene is mocked out wholesale in every shell test — so its gate is typecheck, lint, the full suite staying green, and a browser check.

Their steps name the exact symbols, line numbers and behaviour to change but do **not** transcribe replacement bodies, because the surrounding code is long and an invented line is worse than a precise instruction. Each of those steps opens with a `grep` that lists every site to touch, so nothing is missed. If a grep returns a site the step does not describe, stop and report it rather than guessing.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/lib/realm/minimap.ts` | Pure world→map projection, bounds, and the dot set. No React, no `three`. |
| `src/lib/realm/minimap.test.ts` | Its tests. |
| `src/components/realm/realm-minimap.tsx` | Renders the projection as inline SVG. Pure DOM, three-free. |
| `src/components/realm/realm-minimap.test.tsx` | Its tests. |
| `src/lib/realm/tutorial.ts` | Pure step model: the four steps, their prompts, and `advanceTutorial`. |
| `src/lib/realm/tutorial.test.ts` | Its tests. |
| `src/components/realm/realm-legend.tsx` | The desktop control legend strip. |
| `src/components/realm/realm-tutorial.tsx` | The current step's prompt, and the parent's skip control. |
| `src/lib/db/migrations/0027_*.sql` | `realm_settings.tutorial_step`, generated by `npm run db:generate`. |

**Modify:**

| File | Change |
|---|---|
| `src/lib/realm/depth.ts` | `Surfaces` gains `minimap`; `surfacesFor` caps it under `fewerChoices` at both depths. |
| `src/lib/db/schema.ts` | `tutorialStep` column. |
| `src/lib/utils/realm-settings.ts` | `tutorialStep` in `RealmSettings`, its default, its row coercion, its patch validation. |
| `src/lib/actions/realm-settings.ts` | `setTutorialStep` (hero or parent). |
| `src/lib/actions/realm.ts` | The bundle carries `tutorialStep`. |
| `src/components/realm/use-realm-input.ts` | `Space` cast removed; `1`–`4` and left click cast; `E` interact. |
| `src/components/realm/spell-bar.tsx` | Digits cast rather than select; the keycap legend follows. |
| `src/components/realm/realm-hud.tsx` | Three zones become four corners; mana moves into identity. |
| `src/components/realm/realm-shell.tsx` | `E` replaces `Enter`/`Space` for talk; tutorial state and wiring; the four-corner render. |
| `src/components/realm/realm-scene.tsx` | `PropLabel` deleted; pending-talk deleted; pointer casting with the targeting rule. |
| `src/components/realm/realm-help.tsx` | The card stops describing two input systems; gains "Show me the tutorial again". |
| `src/app/globals.css` | Four corners, minimap, legend, cast button, tutorial; `.realm-label*` deleted. |

---

## Task 1: `Surfaces` gains the minimap field

**Files:**
- Modify: `src/lib/realm/depth.ts:14-46` (the `Surfaces` type), and `surfacesFor`
- Test: `src/lib/realm/depth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Surfaces.minimap: "full" | "objectiveOnly"`. Tasks 3 and 6 read it.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/realm/depth.test.ts`:

```ts
it("carries fourteen surfaces, the minimap included", () => {
  const s = surfacesFor("full", { fewerChoices: false, largerText: false, reducedMotion: false, lowStimulus: false });
  expect(Object.keys(s)).toHaveLength(14);
  expect(s.minimap).toBe("full");
});

it("shows a simpler minimap under fewerChoices, at both depths, and never removes it", () => {
  for (const depth of ["simple", "full"] as const) {
    const s = surfacesFor(depth, { fewerChoices: true, largerText: false, reducedMotion: false, lowStimulus: false });
    expect(s.minimap).toBe("objectiveOnly");
  }
  // A substitution, not a removal: the child still has a map.
  const plain = surfacesFor("simple", { fewerChoices: false, largerText: false, reducedMotion: false, lowStimulus: false });
  expect(plain.minimap).toBe("full");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/realm/depth.test.ts`
Expected: FAIL — `Object.keys(s)` has 13, and `s.minimap` is `undefined`.

- [ ] **Step 3: Add the field to the type**

In `src/lib/realm/depth.ts`, inside `Surfaces`, after `abilitySlots`:

```ts
  /**
   * How much the minimap draws. "full" is bounds, hero, every site and every trouble;
   * "objectiveOnly" is bounds, hero and the objective. Capped at "objectiveOnly" by
   * `fewerChoices` at both depths — a substitution, never a removal: the child keeps a map.
   */
  minimap: "full" | "objectiveOnly";
```

- [ ] **Step 4: Set it at both depths, then cap it**

In `surfacesFor`, give both the simple and full branches `minimap: "full"`, and add the cap alongside the three existing ones — **outside** the depth branch, where `trackedObjectives`, `abilitySlots` and `listRows` are already capped:

```ts
  if (profile.fewerChoices) {
    // ...existing caps...
    out.minimap = "objectiveOnly";
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/realm/depth.test.ts`
Expected: PASS, including the existing both-depths cap test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/realm/depth.ts src/lib/realm/depth.test.ts
git commit -m "feat(realm): the complexity axis gains a minimap surface" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The minimap projection

**Files:**
- Create: `src/lib/realm/minimap.ts`, `src/lib/realm/minimap.test.ts`

**Interfaces:**
- Consumes: `WorldLayout`, `Prop`, `Vec2` from `src/lib/realm/layout.ts`; `Facing` from `src/lib/realm/movement.ts`; `facingAngle` from `src/lib/realm/markers.ts`; `Surfaces` from Task 1.
- Produces:
  - `type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number }`
  - `type MinimapDot = { id: string; kind: "site" | "trouble" | "objective"; x: number; y: number; filled: boolean }`
  - `type MinimapView = { bounds: MinimapBounds; hero: { x: number; y: number; angle: number }; dots: MinimapDot[] }`
  - `type MinimapInput = { layout: WorldLayout; hero: Vec2; facing: Facing; troubles: { id: string; position: Vec2 }[]; surfaces: Surfaces }`
  - `worldBounds(layout: WorldLayout): MinimapBounds`
  - `projectToMap(p: Vec2, bounds: MinimapBounds): { x: number; y: number }` — 0..1 in both axes, clamped
  - `minimapView(input: MinimapInput): MinimapView`

**Read this before writing the module.** The layout already carries everything the map needs, so do NOT add `raisedIds` or `objectiveId` parameters:

- A **raised** site is `kind: "building"` (`layout.ts:184`); an **unbuilt** one is `kind: "foundation"` (`layout.ts:186`). So `filled` is `p.kind === "building"`, not a separate list.
- The **current objective** is already `focus === "objective"` on the prop (`layout.ts:181`). Duplicating either into a parameter would be a second source of truth for something the village invariant already guarantees.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/realm/minimap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { worldBounds, projectToMap, minimapView } from "./minimap";
import { buildWorldLayout } from "./layout";
import { surfacesFor } from "./depth";

// SiteProgress is { id, done, total, complete } — the label comes from BUILDINGS in
// src/lib/utils/kingdom.ts, keyed by id, so these ids must be real ones ("well", "mill",
// "bridge", "chapel", "market", "library", "watchtower", "garden").
const PROGRESS = [
  { id: "well", done: 0, total: 5, complete: false },
  { id: "mill", done: 5, total: 5, complete: true },
];
const layout = buildWorldLayout({ castleType: "campsite", buildings: PROGRESS, objectiveIds: ["well"] });
const profile = { fewerChoices: false, largerText: false, reducedMotion: false, lowStimulus: false };
const full = surfacesFor("full", profile);
const simple = surfacesFor("full", { ...profile, fewerChoices: true });
const base = { layout, hero: layout.spawn, facing: "n" as const, troubles: [] as { id: string; position: { x: number; z: number } }[], surfaces: full };

describe("worldBounds", () => {
  it("contains every prop and the spawn", () => {
    const b = worldBounds(layout);
    for (const p of layout.props) {
      expect(p.position.x).toBeGreaterThanOrEqual(b.minX);
      expect(p.position.x).toBeLessThanOrEqual(b.maxX);
      expect(p.position.z).toBeGreaterThanOrEqual(b.minZ);
      expect(p.position.z).toBeLessThanOrEqual(b.maxZ);
    }
    expect(layout.spawn.x).toBeGreaterThanOrEqual(b.minX);
    expect(layout.spawn.z).toBeGreaterThanOrEqual(b.minZ);
  });

  it("is never degenerate, so a one-prop world cannot divide by zero", () => {
    const b = worldBounds({ ...layout, props: [layout.props[0]] });
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxZ).toBeGreaterThan(b.minZ);
  });
});

describe("projectToMap", () => {
  const b = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  it("puts the centre at the centre and the corners at the corners", () => {
    expect(projectToMap({ x: 0, z: 0 }, b)).toEqual({ x: 0.5, y: 0.5 });
    expect(projectToMap({ x: -10, z: -10 }, b)).toEqual({ x: 0, y: 0 });
    expect(projectToMap({ x: 10, z: 10 }, b)).toEqual({ x: 1, y: 1 });
  });

  it("clamps a point outside the bounds instead of drawing off the map", () => {
    expect(projectToMap({ x: -999, z: 999 }, b)).toEqual({ x: 0, y: 1 });
  });
});

describe("minimapView", () => {
  it("fills a raised site and leaves an unbuilt one hollow, reading the kind the layout already set", () => {
    const view = minimapView(base);
    const mill = view.dots.find((d) => d.id === "mill");
    expect(mill).toMatchObject({ kind: "site", filled: true });
  });

  it("draws the objective as its own kind rather than as another site", () => {
    const view = minimapView(base);
    expect(view.dots.find((d) => d.id === "well")).toMatchObject({ kind: "objective" });
    expect(view.dots.filter((d) => d.id === "well")).toHaveLength(1); // never both
  });

  it("carries the hero's facing as an angle the component can rotate a tick by", () => {
    expect(minimapView({ ...base, facing: "n" }).hero.angle).toBe(0);
    expect(minimapView({ ...base, facing: "s" }).hero.angle).toBeCloseTo(Math.PI);
  });

  it("puts a trouble on the map at full, and never a villager, path or decor prop", () => {
    const view = minimapView({ ...base, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.dots.some((d) => d.kind === "trouble" && d.id === "t1")).toBe(true);
    expect(view.dots.every((d) => !d.id.startsWith("decor-") && !d.id.startsWith("villager-"))).toBe(true);
  });

  it("drops sites and troubles under objectiveOnly, and keeps the hero and the objective", () => {
    const view = minimapView({ ...base, surfaces: simple, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.dots.some((d) => d.kind === "site")).toBe(false);
    expect(view.dots.some((d) => d.kind === "trouble")).toBe(false);
    expect(view.dots.some((d) => d.kind === "objective")).toBe(true);
    expect(view.hero).toBeTruthy();
  });

  it("draws a map with no objective at all rather than throwing", () => {
    const none = buildWorldLayout({ castleType: "campsite", buildings: PROGRESS });
    const view = minimapView({ ...base, layout: none });
    expect(view.dots.some((d) => d.kind === "objective")).toBe(false);
    expect(view.dots.some((d) => d.kind === "site")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/realm/minimap.test.ts`
Expected: FAIL — `Cannot find module './minimap'`.

- [ ] **Step 3: Write the module**

Create `src/lib/realm/minimap.ts`:

```ts
import type { Prop, Vec2, WorldLayout } from "./layout";
import type { Facing } from "./movement";
import type { Surfaces } from "./depth";
import { facingAngle } from "./markers";

export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MinimapDot = { id: string; kind: "site" | "trouble" | "objective"; x: number; y: number; filled: boolean };
export type MinimapView = { bounds: MinimapBounds; hero: { x: number; y: number; angle: number }; dots: MinimapDot[] };

export type MinimapInput = {
  layout: WorldLayout;
  hero: Vec2;
  facing: Facing;
  troubles: { id: string; position: Vec2 }[];
  surfaces: Surfaces;
};

/** A little air around the outermost prop so nothing is drawn against the frame. */
const PAD = 2;
/** A world with one prop would otherwise divide by zero when projected. */
const MIN_SPAN = 1;

/** A site on the map is a kingdom building, raised or not. Nothing else is mapped. */
const isSite = (p: Prop) => p.kind === "building" || p.kind === "foundation";

export function worldBounds(layout: WorldLayout): MinimapBounds {
  const xs = [layout.spawn.x, ...layout.props.map((p) => p.position.x)];
  const zs = [layout.spawn.z, ...layout.props.map((p) => p.position.z)];
  let [minX, maxX] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD];
  let [minZ, maxZ] = [Math.min(...zs) - PAD, Math.max(...zs) + PAD];
  if (maxX - minX < MIN_SPAN) { minX -= MIN_SPAN / 2; maxX += MIN_SPAN / 2; }
  if (maxZ - minZ < MIN_SPAN) { minZ -= MIN_SPAN / 2; maxZ += MIN_SPAN / 2; }
  return { minX, maxX, minZ, maxZ };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function projectToMap(p: Vec2, bounds: MinimapBounds): { x: number; y: number } {
  return {
    x: clamp01((p.x - bounds.minX) / (bounds.maxX - bounds.minX)),
    y: clamp01((p.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)),
  };
}

export function minimapView({ layout, hero, facing, troubles, surfaces }: MinimapInput): MinimapView {
  const bounds = worldBounds(layout);
  const dots: MinimapDot[] = [];

  for (const p of layout.props) {
    if (!isSite(p)) continue;
    const objective = p.focus === "objective";
    // Under objectiveOnly the map keeps the one place the child is meant to go and drops the rest.
    if (!objective && surfaces.minimap !== "full") continue;
    const { x, y } = projectToMap(p.position, bounds);
    dots.push({ id: p.id, kind: objective ? "objective" : "site", x, y, filled: p.kind === "building" });
  }

  if (surfaces.minimap === "full") {
    for (const t of troubles) {
      const { x, y } = projectToMap(t.position, bounds);
      dots.push({ id: t.id, kind: "trouble", x, y, filled: true });
    }
  }

  return { bounds, hero: { ...projectToMap(hero, bounds), angle: facingAngle(facing) }, dots };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/realm/minimap.test.ts`
Expected: PASS, all ten.

- [ ] **Step 5: Confirm it pulls in no `three`**

Run: `npx vitest run src/lib/realm/minimap.test.ts` (already proves it — the suite has no WebGL), then `grep -rn "three" src/lib/realm/minimap.ts`
Expected: no grep output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/realm/minimap.ts src/lib/realm/minimap.test.ts
git commit -m "feat(realm): project the world onto a minimap" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The minimap component

**Files:**
- Create: `src/components/realm/realm-minimap.tsx`, `src/components/realm/realm-minimap.test.tsx`
- Modify: `src/app/globals.css` (add `.realm-minimap*` rules)

**Interfaces:**
- Consumes: `minimapView`, `MinimapView` from Task 2.
- Produces: `<RealmMinimap view={MinimapView} />`, rendering inline SVG inside `.realm-minimap`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/realm/realm-minimap.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RealmMinimap } from "./realm-minimap";
import type { MinimapView } from "@/lib/realm/minimap";

const view: MinimapView = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  hero: { x: 0.5, y: 0.5, angle: 0 },
  dots: [
    { id: "well", kind: "site", x: 0.25, y: 0.25, filled: false },
    { id: "mill", kind: "site", x: 0.75, y: 0.25, filled: true },
    { id: "bridge", kind: "objective", x: 0.5, y: 0.9, filled: false },
    { id: "t1", kind: "trouble", x: 0.1, y: 0.8, filled: true },
  ],
};

describe("RealmMinimap", () => {
  it("draws one mark per dot plus the hero", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect(container.querySelectorAll(".realm-minimap-site")).toHaveLength(2);
    expect(container.querySelectorAll(".realm-minimap-dot")).toHaveLength(1);
    expect(container.querySelectorAll(".realm-minimap-hero")).toHaveLength(1);
  });

  it("names itself for a screen reader without using the word depth", () => {
    render(<RealmMinimap view={view} />);
    const map = screen.getByRole("img", { name: /map/i });
    expect(map).toBeInTheDocument();
    expect(map.getAttribute("aria-label")).not.toMatch(/depth|simple mode|advanced/i);
  });

  it("is inert: nothing inside it is focusable or clickable", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    expect(getComputedStyle(container.firstElementChild as Element).pointerEvents).not.toBe("auto");
  });

  it("renders with no dots at all rather than throwing", () => {
    const { container } = render(<RealmMinimap view={{ ...view, dots: [] }} />);
    expect(container.querySelector(".realm-minimap-hero")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/realm/realm-minimap.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/components/realm/realm-minimap.tsx`:

```tsx
"use client";

import type { MinimapView } from "@/lib/realm/minimap";

const SIZE = 100; // SVG user units; the rendered size comes from CSS

/**
 * A readout, never a control. It takes no pointer events and holds nothing focusable,
 * which is what keeps it outside the input model entirely.
 */
export function RealmMinimap({ view }: { view: MinimapView }) {
  const hx = view.hero.x * SIZE;
  const hy = view.hero.y * SIZE;
  return (
    <div className="realm-minimap" style={{ pointerEvents: "none" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Map of the Realm" aria-hidden={false}>
        <rect x={0} y={0} width={SIZE} height={SIZE} className="realm-minimap-ground" />
        {view.dots.map((d) =>
          d.kind === "objective" ? (
            <circle key={d.id} className="realm-minimap-objective" cx={d.x * SIZE} cy={d.y * SIZE} r={4} />
          ) : d.kind === "trouble" ? (
            <circle key={d.id} className="realm-minimap-dot" cx={d.x * SIZE} cy={d.y * SIZE} r={2.5} />
          ) : (
            <rect
              key={d.id}
              className={d.filled ? "realm-minimap-site realm-minimap-site--raised" : "realm-minimap-site"}
              x={d.x * SIZE - 2.5}
              y={d.y * SIZE - 2.5}
              width={5}
              height={5}
            />
          )
        )}
        <g className="realm-minimap-hero" transform={`translate(${hx} ${hy}) rotate(${(view.hero.angle * 180) / Math.PI})`}>
          <circle r={3} />
          <line x1={0} y1={0} x2={0} y2={-6} />
        </g>
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

In `src/app/globals.css`, directly after the `.realm-hud-*` block (near line 1754), add:

```css
/* The minimap is a readout: it never takes a pointer event and holds nothing focusable. */
.realm-minimap { width: calc(9rem * var(--realm-hud-scale)); aspect-ratio: 1; border-radius: 0.5rem; border: 1px solid var(--gold-border); background: rgba(0, 0, 0, 0.55); overflow: hidden; pointer-events: none; }
.realm-minimap svg { display: block; width: 100%; height: 100%; }
.realm-minimap-ground { fill: rgba(40, 70, 40, 0.5); }
.realm-minimap-site { fill: none; stroke: var(--gold-border); stroke-width: 1.5; }
.realm-minimap-site--raised { fill: var(--gold-bright); stroke: var(--gold-bright); }
.realm-minimap-objective { fill: none; stroke: #c9a84c; stroke-width: 2; }
.realm-minimap-dot { fill: #a78bfa; }
.realm-minimap-hero circle { fill: var(--gold-bright); }
.realm-minimap-hero line { stroke: var(--gold-bright); stroke-width: 1.5; }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/realm/realm-minimap.test.tsx`
Expected: PASS, all four.

- [ ] **Step 6: Commit**

```bash
git add src/components/realm/realm-minimap.tsx src/components/realm/realm-minimap.test.tsx src/app/globals.css
git commit -m "feat(realm): draw the minimap as an inert SVG readout" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The tutorial model

**Files:**
- Create: `src/lib/realm/tutorial.ts`, `src/lib/realm/tutorial.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const TUTORIAL_STEPS` — four entries, frozen order
  - `type TutorialStep = 1 | 2 | 3 | 4`
  - `type TutorialSignal = { kind: "walked"; keys: string[]; distance: number } | { kind: "reachedObjective" } | { kind: "interacted" } | { kind: "castLanded" }`
  - `type TutorialState = { completed: number }` — the highest completed step, 0..4
  - `tutorialPrompt(state: TutorialState): string | null` — null once finished
  - `advanceTutorial(state: TutorialState, signal: TutorialSignal): TutorialState`
  - `WALK_DISTANCE = 4`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/realm/tutorial.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { advanceTutorial, tutorialPrompt, TUTORIAL_STEPS, WALK_DISTANCE } from "./tutorial";

const start = { completed: 0 };

describe("tutorialPrompt", () => {
  it("names all four movement keys at step one, not W alone", () => {
    const prompt = tutorialPrompt(start)!;
    for (const key of ["W", "A", "S", "D"]) expect(prompt).toContain(key);
  });

  it("says nothing once all four steps are done", () => {
    expect(tutorialPrompt({ completed: 4 })).toBeNull();
  });

  it("never says a word about depth", () => {
    for (let c = 0; c <= 4; c++) {
      expect(tutorialPrompt({ completed: c }) ?? "").not.toMatch(/depth|simple mode|advanced/i);
    }
  });
});

describe("advanceTutorial", () => {
  it("does not finish step one for a child who only ever presses W", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW"], distance: 999 });
    expect(after.completed).toBe(0);
  });

  it("does not finish step one for two keys and no distance", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW", "KeyD"], distance: 0 });
    expect(after.completed).toBe(0);
  });

  it("finishes step one on two keys and the distance together", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW", "KeyD"], distance: WALK_DISTANCE });
    expect(after.completed).toBe(1);
  });

  it("ignores a signal for a step that is not the current one", () => {
    // Reaching the objective before learning to walk must not skip step one.
    expect(advanceTutorial(start, { kind: "reachedObjective" })).toEqual(start);
    // And a walk signal after step one is done changes nothing.
    const one = { completed: 1 };
    expect(advanceTutorial(one, { kind: "walked", keys: ["KeyW", "KeyA"], distance: 99 })).toEqual(one);
  });

  it("walks the whole ladder in order and then stops", () => {
    let s = start;
    s = advanceTutorial(s, { kind: "walked", keys: ["KeyW", "KeyS"], distance: WALK_DISTANCE });
    s = advanceTutorial(s, { kind: "reachedObjective" });
    s = advanceTutorial(s, { kind: "interacted" });
    s = advanceTutorial(s, { kind: "castLanded" });
    expect(s.completed).toBe(4);
    expect(advanceTutorial(s, { kind: "castLanded" })).toEqual({ completed: 4 });
  });

  it("never returns a completed count outside 0..4", () => {
    expect(advanceTutorial({ completed: -5 }, { kind: "interacted" }).completed).toBeGreaterThanOrEqual(0);
    expect(advanceTutorial({ completed: 99 }, { kind: "castLanded" }).completed).toBeLessThanOrEqual(4);
  });

  it("has exactly four steps, in the frozen order", () => {
    expect(TUTORIAL_STEPS.map((s) => s.signal)).toEqual(["walked", "reachedObjective", "interacted", "castLanded"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/realm/tutorial.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/lib/realm/tutorial.ts`:

```ts
export type TutorialStep = 1 | 2 | 3 | 4;

export type TutorialSignal =
  | { kind: "walked"; keys: string[]; distance: number }
  | { kind: "reachedObjective" }
  | { kind: "interacted" }
  | { kind: "castLanded" };

export type TutorialState = { completed: number };

/** Far enough to be a walk rather than a twitch, close enough to reach in a few seconds. */
export const WALK_DISTANCE = 4;

/**
 * Four steps, each gated on doing the thing. The prompts are the only tutorial words a
 * child reads, so they name keys and never name the complexity axis.
 */
export const TUTORIAL_STEPS = [
  { step: 1 as TutorialStep, signal: "walked" as const, prompt: "Use W, A, S and D to walk." },
  { step: 2 as TutorialStep, signal: "reachedObjective" as const, prompt: "Go where the light is." },
  { step: 3 as TutorialStep, signal: "interacted" as const, prompt: "Stand close and press E." },
  { step: 4 as TutorialStep, signal: "castLanded" as const, prompt: "Press 1." },
];

const clampCompleted = (n: number) => Math.max(0, Math.min(TUTORIAL_STEPS.length, Math.floor(n)));

export function tutorialPrompt(state: TutorialState): string | null {
  const done = clampCompleted(state.completed);
  return TUTORIAL_STEPS[done]?.prompt ?? null;
}

export function advanceTutorial(state: TutorialState, signal: TutorialSignal): TutorialState {
  const done = clampCompleted(state.completed);
  const current = TUTORIAL_STEPS[done];
  if (!current || current.signal !== signal.kind) return { completed: done };
  // Step one needs both halves: a child who only presses W has not learned to move, and
  // telling them they have is how they get stuck later.
  if (signal.kind === "walked") {
    const distinct = new Set(signal.keys).size;
    if (distinct < 2 || signal.distance < WALK_DISTANCE) return { completed: done };
  }
  return { completed: done + 1 };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/realm/tutorial.test.ts`
Expected: PASS, all nine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realm/tutorial.ts src/lib/realm/tutorial.test.ts
git commit -m "feat(realm): a four-step tutorial that gates on doing" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Persist the tutorial step

**Files:**
- Modify: `src/lib/db/schema.ts` (the `realmSettings` table), `src/lib/utils/realm-settings.ts`, `src/lib/actions/realm-settings.ts`, `src/lib/actions/realm.ts`
- Create: `src/lib/db/migrations/0027_*.sql` (generated)
- Test: `src/lib/utils/realm-settings.test.ts`

**Interfaces:**
- Consumes: `TutorialState` from Task 4.
- Produces: `RealmSettings.tutorialStep: number`; the server action `setTutorialStep(childId: string, step: number): Promise<void>`; `bundle.tutorialStep: number`.

- [ ] **Step 1: Write the failing validation test**

Add to `src/lib/utils/realm-settings.test.ts`:

```ts
it("accepts a tutorial step in range and refuses one outside it", () => {
  expect(validateRealmSettingsPatch({ tutorialStep: 0 })).toEqual({ tutorialStep: 0 });
  expect(validateRealmSettingsPatch({ tutorialStep: 4 })).toEqual({ tutorialStep: 4 });
  expect(() => validateRealmSettingsPatch({ tutorialStep: 5 })).toThrow();
  expect(() => validateRealmSettingsPatch({ tutorialStep: -1 })).toThrow();
  expect(() => validateRealmSettingsPatch({ tutorialStep: 1.5 })).toThrow();
});

it("defaults a missing or corrupt tutorial step to the beginning", () => {
  expect(DEFAULT_REALM_SETTINGS.tutorialStep).toBe(0);
  expect(settingsFromRow({ ...ROW, tutorialStep: 99 }).tutorialStep).toBe(0);
});
```

`ROW` is the existing row fixture in that file; add `tutorialStep: 0` to it.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/utils/realm-settings.test.ts`
Expected: FAIL — `Unknown Realm setting: tutorialStep`.

- [ ] **Step 3: Add the column**

In `src/lib/db/schema.ts`, in `realmSettings` after `depthOverride`:

```ts
    // The highest tutorial step the hero has finished, 0 through 4. Resetting it to 0
    // re-runs the walkthrough, which is what the help card's control does.
    tutorialStep: integer("tutorial_step").notNull().default(0),
```

- [ ] **Step 4: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: a new `src/lib/db/migrations/0027_*.sql` containing exactly
``ALTER TABLE `realm_settings` ADD `tutorial_step` integer DEFAULT 0 NOT NULL;``
Open it and confirm it is that one statement and nothing else. A constant-default add does not rewrite the table, so it is safe forward on a populated database.

- [ ] **Step 5: Thread it through the settings util**

In `src/lib/utils/realm-settings.ts`: add `tutorialStep: number` to `RealmSettings`; `tutorialStep: 0` to `DEFAULT_REALM_SETTINGS`; in `settingsFromRow`, `tutorialStep: isTutorialStep(row.tutorialStep) ? row.tutorialStep : DEFAULT_REALM_SETTINGS.tutorialStep`; and a case in `validateRealmSettingsPatch`:

```ts
      case "tutorialStep":
        if (!isTutorialStep(v)) throw new Error("That tutorial step doesn't look right.");
        out.tutorialStep = v;
        break;
```

with, beside the other helpers in that file:

```ts
const isTutorialStep = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4;
```

- [ ] **Step 6: Add the action**

In `src/lib/actions/realm-settings.ts`, beside `setRealmDepth` (hero or parent — a child advances their own tutorial):

```ts
/** The hero finished a tutorial step, or a grown-up reset the walkthrough. Hero or parent. */
export async function setTutorialStep(childId: string, step: number): Promise<void> {
  await requireChildAccess(childId, { write: true });
  if (!Number.isInteger(step) || step < 0 || step > 4) throw new Error("That tutorial step doesn't look right.");
  await loadRealmSettings(childId);
  await db.update(schema.realmSettings).set({ tutorialStep: step, updatedAt: new Date() }).where(eq(schema.realmSettings.childId, childId));
}
```

No `revalidatePath` — this is called from inside the Realm, and revalidating would tear down the running world.

- [ ] **Step 7: Carry it on the bundle**

In `src/lib/actions/realm.ts`, add `tutorialStep: settings.tutorialStep` where the bundle already carries `depthOverride` and `depth`, and add `tutorialStep: number` to the `RealmBundle` type.

- [ ] **Step 8: Run the gates**

```bash
npx vitest run src/lib/utils/realm-settings.test.ts
npx tsc --noEmit
```
Expected: tests PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations src/lib/utils/realm-settings.ts src/lib/utils/realm-settings.test.ts src/lib/actions/realm-settings.ts src/lib/actions/realm.ts
git commit -m "feat(realm): remember how far the tutorial got" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Four corners

**Files:**
- Modify: `src/components/realm/realm-hud.tsx:106-190` (`RealmHud`), `src/app/globals.css:1734-1782`
- Test: `src/components/realm/realm-hud.test.tsx`

**Interfaces:**
- Consumes: `Surfaces` (Task 1), `<RealmMinimap>` (Task 3).
- Produces: `RealmHud` gains a `minimap?: React.ReactNode` prop rendered in the upper-right corner. `RealmManaPips` moves inside `.realm-hud-identity`.

**The layout it must produce**, from spec §3.2:

| Corner | Class | Contents |
|---|---|---|
| Upper left | `.realm-hud-objective` | Quest log: site, who waits, `n of 5`, then the next two |
| Upper right | `.realm-minimap` | The minimap |
| Bottom left | `.realm-hud-identity` | Hero name, `n of 8 raised`, mana |
| Bottom right | `.realm-hud-meta` | Leave the Realm, minutes, `?` |

- [ ] **Step 1: Write the failing tests**

Add to `src/components/realm/realm-hud.test.tsx`:

```tsx
it("puts the quest log top-left and the controls bottom-right", () => {
  const { container } = render(<RealmHud {...props} minimap={<div data-testid="map" />} />);
  const root = container.querySelector(".realm-hud")!;
  const objective = container.querySelector(".realm-hud-objective")!;
  const meta = container.querySelector(".realm-hud-meta")!;
  // Order in the DOM is the order in the corners: objective, minimap, identity, meta.
  const zones = [...root.children].map((el) => el.className.split(" ")[0]);
  expect(zones).toEqual(["realm-hud-objective", "realm-hud-corner", "realm-hud-identity", "realm-hud-meta"]);
  expect(objective).toBeInTheDocument();
  expect(meta).toBeInTheDocument();
});

it("holds the mana strip in the identity corner, not loose at the bottom centre", () => {
  const { container } = render(<RealmHud {...props} mana={7} />);
  expect(container.querySelector(".realm-hud-identity .realm-mana-pips")).toBeInTheDocument();
});

it("renders without a minimap rather than throwing", () => {
  const { container } = render(<RealmHud {...props} minimap={null} />);
  expect(container.querySelector(".realm-hud-identity")).toBeInTheDocument();
});
```

`props` is the existing fixture in that file. Add `minimap: null` to it so the other tests keep passing.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: FAIL — the zone order is the old three, and the mana strip is not inside identity.

- [ ] **Step 3: Restructure the component**

In `RealmHud`, render exactly four children of `.realm-hud`, in this order: the objective card, a `<div className="realm-hud-corner">` holding `{minimap}`, the identity block (name, count, and `RealmManaPips`), and the meta block. Keep every existing `style={{ pointerEvents: "none" }}` on the zones.

- [ ] **Step 4: Replace the CSS layout**

In `src/app/globals.css`, replace the `.realm-hud` flex row (line 1734) and the three zone rules (1736-1738) with a grid. Keep every other declaration on those selectors — the fonts, plates, `min-width: 0`, `overflow-wrap` and the `pointer-events` rule at 1735 are all still needed:

```css
/* Four corners. The grid is the whole play area so each zone sits in its own corner and
   nothing has to be positioned against another zone's height. */
.realm-hud { position: absolute; inset: 0.75rem; z-index: 20; display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto 1fr auto; gap: 0.75rem; pointer-events: none; color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
.realm-hud-objective { grid-column: 1; grid-row: 1; justify-self: start; align-self: start; display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; width: min(16rem, 44vw); text-align: left; font-size: calc(14px * var(--realm-hud-scale)); }
.realm-hud-corner { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; }
.realm-hud-identity { grid-column: 1; grid-row: 3; justify-self: start; align-self: end; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; font-size: calc(14px * var(--realm-hud-scale)); }
.realm-hud-meta { grid-column: 3; grid-row: 3; justify-self: end; align-self: end; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; font-size: calc(14px * var(--realm-hud-scale)); }
```

The objective card's text goes left-aligned because it now sits in a corner rather than centred over the world.

- [ ] **Step 5: Fix the phone breakpoint**

The 640px block (around line 1775) currently wraps a flex row. Replace its `.realm-hud` and `.realm-hud-meta` rules with grid-aware ones, keeping `.realm-hud-objective`'s width rule:

```css
  .realm-hud { gap: 0.5rem; }
  .realm-hud-objective { width: min(16rem, 60vw); }
  .realm-minimap { width: calc(6rem * var(--realm-hud-scale)); }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 7: Verify in a browser at both scales and both widths**

Start a dev server on a free port. At 1280×800 and 390×844, at `--realm-hud-scale` 1 and 1.25, confirm: the four zones are in the four corners; no zone overlaps another; the ability bar at bottom-centre is clear of both bottom corners; and the page does not scroll horizontally. Record the measured bounding boxes in your report — slice 1's lesson was that reasoned layout claims were wrong three times out of three.

- [ ] **Step 8: Commit**

```bash
git add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/app/globals.css
git commit -m "feat(realm): move the HUD into four corners" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Delete `PropLabel`

**Files:**
- Modify: `src/components/realm/realm-scene.tsx:129-138` (the component) and its three call sites at `:599`, `:625`, `:638`; `src/app/globals.css:1808-1809`
- Test: none — `realm-scene.tsx` has no unit tests. Gated by typecheck, lint, the full suite staying green, and the browser check in Step 4.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task only removes.

Spec §3.1. The villager nameplates already carry the site's name and `n of 5`; `PropLabel` renders the same words underneath, which is why every site in the user's screenshots is labelled twice.

- [ ] **Step 1: Delete the component and its call sites**

Remove the `PropLabel` function (`realm-scene.tsx:129-138`) and all three usages:
- `:599` — `<PropLabel prop={prop} y={0.8} />`
- `:625` — `{prop.kind !== "decor" && <PropLabel prop={prop} y={h + 0.4} />}`
- `:638` — `{prop.kind !== "barrier" && <PropLabel prop={prop} y={prop.size.h + 0.6} />}`

Delete any `Html` import that becomes unused. **Do not touch `VillagerPlate`'s `<Html>`** — that is the label that stays.

- [ ] **Step 2: Delete the CSS**

Remove `.realm-label` (globals.css:1808) and `.realm-label-tag` (1809).

- [ ] **Step 3: Confirm nothing else references them**

```bash
grep -rn "PropLabel\|realm-label" src/
```
Expected: no output. If a test asserts on `.realm-label`, it was asserting on the duplicate — delete that assertion and say so in your report.

- [ ] **Step 4: Gates, including the browser check**

```bash
npx tsc --noEmit
npx eslint src/components/realm/realm-scene.tsx
npm test
```
Expected: clean, clean, 105 files passing.

Then in a browser: every site shows exactly ONE label — the villager's nameplate. The castle, trees, rocks and fences show none at all. Screenshot it; this is the clearest before/after in the plan.

- [ ] **Step 5: Commit**

```bash
git add src/components/realm/realm-scene.tsx src/app/globals.css
git commit -m "fix(realm): stop labelling every site twice" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: One input model

**Files:**
- Modify: `src/components/realm/use-realm-input.ts:20-70`, `src/components/realm/spell-bar.tsx:60-79`, `src/components/realm/realm-shell.tsx:398-421`
- Test: `src/components/realm/spell-bar.test.tsx`, `src/components/realm/realm-shell.test.tsx`

**Interfaces:**
- Consumes: `CastRequest = { target: Vec2 } | { nearest: true }` — already exists at `use-realm-input.ts:14` and already supports both targeting modes.
- Produces: `useRealmInput` gains `onInteract?: () => void`; its `castKey` handler is removed. `SpellBar`'s `onSelect(slot)` now means *cast this slot and select it*.

Spec §4.1 and §4.3. The five verbs are `WASD`, `1`–`4`, left click, `E`, `Esc`. `Space` is removed entirely.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/realm/spell-bar.test.tsx`:

```tsx
it("casts on a number key instead of only selecting", () => {
  const onSelect = vi.fn();
  render(<SpellBar {...props} onSelect={onSelect} selectedSlot={null} />);
  fireEvent.keyDown(window, { key: "1" });
  expect(onSelect).toHaveBeenCalledWith(1);
});

it("does not toggle a spell off when its key is pressed twice — a second press casts again", () => {
  const onSelect = vi.fn();
  render(<SpellBar {...props} onSelect={onSelect} selectedSlot={1} />);
  fireEvent.keyDown(window, { key: "1" });
  expect(onSelect).toHaveBeenCalledWith(1);
  expect(onSelect).not.toHaveBeenCalledWith(null);
});
```

Add to `src/components/realm/realm-shell.test.tsx`:

```tsx
it("talks on E and not on Enter or Space", async () => {
  getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
  render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
  expect(await screen.findByTestId("scene")).toBeInTheDocument();
  await act(async () => { (sceneProps.onReachChange as (id: string) => void)("bram"); });

  fireEvent.keyDown(window, { key: "Enter" });
  expect(screen.queryByTestId("deed-panel")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: " " });
  expect(screen.queryByTestId("deed-panel")).not.toBeInTheDocument();

  fireEvent.keyDown(window, { key: "e" });
  await waitFor(() => expect(screen.getByTestId("deed-panel")).toBeInTheDocument());
});

it("tells a keyboard child to press E, and a touch child to tap", async () => {
  getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
  render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
  expect(await screen.findByTestId("scene")).toBeInTheDocument();
  await act(async () => { (sceneProps.onReachChange as (id: string) => void)("bram"); });
  await waitFor(() => expect(screen.getByTestId("realm-speech")).toHaveTextContent(/press E to talk/i));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/realm/spell-bar.test.tsx src/components/realm/realm-shell.test.tsx`
Expected: FAIL — Enter still opens the panel, and the digit key toggles rather than casts.

- [ ] **Step 3: Remove `Space` from the input hook and add `E`**

In `src/components/realm/use-realm-input.ts`, delete the whole `castKey` function and its `window.addEventListener("keydown", castKey)` / removal, and the `castEnabled` option that only served it. Add an interact key in the same effect:

```ts
    function interactKey(e: KeyboardEvent) {
      if (e.code !== "KeyE" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [role='dialog']")) return;
      e.preventDefault();
      onInteract?.();
    }
    window.addEventListener("keydown", interactKey);
```

and remove `interactKey` in the cleanup alongside `down` and `up`. Add `onInteract` to the hook's options and to its dependency list.

- [ ] **Step 4: Make digits cast**

In `src/components/realm/spell-bar.tsx:75`, replace the toggle with a plain cast:

```ts
      // A number key casts. It never toggles off: pressing 1 twice casts twice, which is
      // what "1 or left click" means. Escape is the way to put a spell away.
      onSelect(page.slot);
```

Leave the `Escape` branch at `:66-68` exactly as it is.

- [ ] **Step 5: Move talk onto `E` in the shell**

In `src/components/realm/realm-shell.tsx:398-421`, replace the Enter/Space branch with an `E` branch. Keep the `KeyM` branch and the interactive-element guard untouched:

```ts
      if (e.code !== "KeyE" || e.repeat) return;
      if (!reachId) return;
      if (onInteractiveElement) return;
      e.preventDefault();
      setOpenVillagerId(reachId);
```

Drop `selectedSlot` from the effect's dependency list — it was only there for the Space-versus-talk split, which no longer exists.

Update the comment above the effect to say what is now true: `E` interacts with whatever is in reach; `M` mounts or dismounts.

- [ ] **Step 6: Update the reach notice**

At `realm-shell.tsx:362`, the keyboard branch reads "Press Enter to talk." Change it to `Press E to talk.`, leaving the touch branch ("Tap Talk.") alone.

- [ ] **Step 7: Update the bubble keycap**

Wherever `Talk · Enter` is rendered, change it to `Talk · E`. Find it with:

```bash
grep -rn "Talk · Enter\|Talk · " src/
```

- [ ] **Step 8: Run the tests**

```bash
npx vitest run src/components/realm
npx tsc --noEmit
```
Expected: PASS; typecheck clean. Existing tests that press Enter or Space to talk will fail — **update them to `E` rather than reintroducing the old keys**, and list each one you changed in your report.

- [ ] **Step 9: Confirm `Space` is gone from the Realm**

```bash
grep -rn '"Space"\|=== " "\|key === " "' src/components/realm/
```
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/components/realm src/app/globals.css
git commit -m "feat(realm): one input model — WASD, 1-4, E, and the pointer" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Pointer casting and the targeting rule

**Files:**
- Create: `src/lib/realm/targeting.ts`, `src/lib/realm/targeting.test.ts`
- Modify: `src/components/realm/realm-scene.tsx` (the ground mesh's pointer handler)

**Interfaces:**
- Consumes: `Vec2` from layout.
- Produces: `pickTarget(input: TargetInput): TargetResult`, where
  - `type Targetable = { id: string; position: Vec2 }`
  - `type TargetInput = { pointer: Vec2 | null; hero: Vec2; troubles: Targetable[]; range: number; pointerRadius: number }`
  - `type TargetResult = { id: string; position: Vec2 } | { refused: true }`

Spec §4.2: the trouble under the pointer, or the nearest one in range; nothing in range refuses and costs no mana.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/realm/targeting.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickTarget } from "./targeting";

const hero = { x: 0, z: 0 };
const near = { id: "near", position: { x: 1, z: 0 } };
const far = { id: "far", position: { x: 4, z: 0 } };
const base = { hero, troubles: [near, far], range: 6, pointerRadius: 1.5 };

describe("pickTarget", () => {
  it("takes the trouble under the pointer even when another is nearer the hero", () => {
    const r = pickTarget({ ...base, pointer: { x: 4.2, z: 0 } });
    expect(r).toMatchObject({ id: "far" });
  });

  it("falls back to the nearest in range when the pointer is over open grass", () => {
    const r = pickTarget({ ...base, pointer: { x: 40, z: 40 } });
    expect(r).toMatchObject({ id: "near" });
  });

  it("uses the nearest when there is no pointer at all, which is the number-key case", () => {
    const r = pickTarget({ ...base, pointer: null });
    expect(r).toMatchObject({ id: "near" });
  });

  it("refuses when nothing is in range, rather than firing at grass", () => {
    const r = pickTarget({ ...base, pointer: null, troubles: [{ id: "miles", position: { x: 99, z: 99 } }] });
    expect(r).toEqual({ refused: true });
  });

  it("refuses when there are no troubles at all", () => {
    expect(pickTarget({ ...base, pointer: { x: 1, z: 0 }, troubles: [] })).toEqual({ refused: true });
  });

  it("will not take a pointed-at trouble that is beyond the hero's range", () => {
    // Pointing at something far away is not a way to out-range the spell.
    const r = pickTarget({ ...base, pointer: { x: 99, z: 99 }, troubles: [{ id: "miles", position: { x: 99, z: 99 } }] });
    expect(r).toEqual({ refused: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/realm/targeting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/lib/realm/targeting.ts`:

```ts
import type { Vec2 } from "./layout";

export type Targetable = { id: string; position: Vec2 };
export type TargetInput = { pointer: Vec2 | null; hero: Vec2; troubles: Targetable[]; range: number; pointerRadius: number };
export type TargetResult = { id: string; position: Vec2 } | { refused: true };

const dist2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * One rule for both ways of casting: the trouble you are pointing at, or the nearest one
 * in range. Pointing does not extend the spell's reach — a pointed-at trouble still has to
 * be inside `range`, or the cast refuses like any other.
 */
export function pickTarget({ pointer, hero, troubles, range, pointerRadius }: TargetInput): TargetResult {
  const inRange = troubles.filter((t) => dist2(hero, t.position) <= range * range);
  if (inRange.length === 0) return { refused: true };

  if (pointer) {
    let pointed: Targetable | null = null;
    let best = pointerRadius * pointerRadius;
    for (const t of inRange) {
      const d = dist2(pointer, t.position);
      if (d <= best) { best = d; pointed = t; }
    }
    if (pointed) return { id: pointed.id, position: pointed.position };
  }

  let nearest = inRange[0];
  for (const t of inRange) if (dist2(hero, t.position) < dist2(hero, nearest.position)) nearest = t;
  return { id: nearest.id, position: nearest.position };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/realm/targeting.test.ts`
Expected: PASS, all six.

- [ ] **Step 5: Wire the pointer into the scene**

In `realm-scene.tsx`, the ground mesh's `onPointerDown` currently calls `setTarget` to walk. Replace its body with a cast: take the intersection point as `pointer`, call `pickTarget` with the hero's position, the live trouble list, the spell's range and a `pointerRadius` of `1.5`, and either push the resulting `{ target }` onto `castRef.current` or, on `{ refused: true }`, emit the existing refusal event so the mana strip flashes. **The hero must not move.**

- [ ] **Step 6: Gates**

```bash
npx tsc --noEmit
npx eslint src/lib/realm/targeting.ts src/components/realm/realm-scene.tsx
npm test
```
Expected: clean, clean, all passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/realm/targeting.ts src/lib/realm/targeting.test.ts src/components/realm/realm-scene.tsx
git commit -m "feat(realm): cast at what you point at, or the nearest thing" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Delete tap-to-move and tap-to-talk

**Files:**
- Modify: `src/components/realm/realm-scene.tsx`, `src/components/realm/realm-shell.tsx`
- Test: `src/components/realm/realm-shell.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RealmSceneProps` loses `onVillagerPick`. The scene prop count drops from 26 to 25 — **update the all-props stability test's expected count** rather than deleting the test. (Task 13 adds one back, taking it to 26 again; each task updates the number it changes.)

Spec §4.4. This removes slice 1's pending-talk state machine wholesale: `onVillagerPick`, `PENDING_TALK_MS`, the eight-second deadline, and all six clear sites. It is accepted work removal, not a regression.

- [ ] **Step 1: Delete the machinery in the scene**

Remove from `realm-scene.tsx`: the `pendingTalk` ref and every read and write of it (five in the frame loop, one in the ground mesh's pointer handler), the `PENDING_TALK_MS` constant, `pickVillager`, and the `onVillagerPick` prop from `RealmSceneProps`. The villager's own `<Html>` Talk button stays — that is touch's route to interacting.

Find every site first so none is orphaned:

```bash
grep -n "pendingTalk\|PENDING_TALK_MS\|pickVillager\|onVillagerPick" src/components/realm/realm-scene.tsx
```

- [ ] **Step 2: Delete the shell's half**

Remove the `onVillagerPick` callback from `realm-shell.tsx` and from the props passed to `<RealmScene>`. `onTalk` stays — the bubble's Talk button and `E` both use it.

- [ ] **Step 3: Confirm the ground no longer walks**

```bash
grep -n "setTarget" src/components/realm/realm-scene.tsx
```
Expected: only the walk driven by the movement axis. The ground mesh's handler should now only cast (Task 9) and never call `setTarget`.

- [ ] **Step 4: Update the stability test's count**

In `realm-shell.test.tsx`, the all-props test asserts 26 scene props. It is now 25. Change the number; do not weaken the assertion.

- [ ] **Step 5: Gates**

```bash
npx tsc --noEmit
npx eslint src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx
npm test
```
Expected: clean, clean, all passing. Any test that clicked a villager to talk must be updated to press `E` or click the bubble's Talk button — list them in your report.

- [ ] **Step 6: Commit**

```bash
git add src/components/realm
git commit -m "refactor(realm): delete tap-to-move and tap-to-talk" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: The legend

**Files:**
- Create: `src/components/realm/realm-legend.tsx`, `src/components/realm/realm-legend.test.tsx`
- Modify: `src/components/realm/realm-shell.tsx` (render it), `src/app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `<RealmLegend showStick={boolean} />` — renders nothing when `showStick` is true.

Spec §4.6. Always visible on desktop, never in the help card.

- [ ] **Step 1: Write the failing tests**

Create `src/components/realm/realm-legend.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RealmLegend } from "./realm-legend";

describe("RealmLegend", () => {
  it("names all five verbs on a keyboard", () => {
    render(<RealmLegend showStick={false} />);
    const text = screen.getByTestId("realm-legend").textContent ?? "";
    for (const bit of ["WASD", "1-4", "E", "Click"]) expect(text).toContain(bit);
  });

  it("shows nothing on touch, where those keys do not exist", () => {
    const { container } = render(<RealmLegend showStick={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("never mentions Space, which the input model no longer has", () => {
    render(<RealmLegend showStick={false} />);
    expect(screen.getByTestId("realm-legend").textContent).not.toMatch(/space/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/realm/realm-legend.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/components/realm/realm-legend.tsx`:

```tsx
"use client";

/** The five verbs, always on screen. Not in the help card: a card you have to open is
 *  what failed the two previous times the controls were reported as unclear. */
export function RealmLegend({ showStick }: { showStick: boolean }) {
  if (showStick) return null; // touch has buttons, and no keyboard to describe
  return (
    <p className="realm-legend" data-testid="realm-legend" aria-label="Controls">
      <span className="realm-legend-key">WASD</span> move
      <span className="realm-legend-key">1-4</span> cast
      <span className="realm-legend-key">E</span> interact
      <span className="realm-legend-key">Click</span> cast
    </p>
  );
}
```

- [ ] **Step 4: Add the CSS**

```css
/* Sits directly above the ability bar, which owns --realm-bar-bottom. */
.realm-legend { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--realm-bar-bottom) + 4.6rem); z-index: 20; display: flex; align-items: center; gap: 0.35rem; margin: 0; padding: 0.15rem 0.6rem; border-radius: 9999px; background: rgba(0, 0, 0, 0.45); color: rgba(255, 255, 255, 0.85); font-size: calc(11px * var(--realm-hud-scale)); white-space: nowrap; pointer-events: none; }
.realm-legend-key { margin-left: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--gold-border); padding: 0 0.3rem; color: var(--gold-bright); font-weight: 700; }
.realm-legend-key:first-child { margin-left: 0; }
```

- [ ] **Step 5: Render it in the shell**

Inside `.realm-root`, beside the ability bar, render `<RealmLegend showStick={settings.showStick} />`.

- [ ] **Step 6: Run the tests and check the browser**

Run: `npx vitest run src/components/realm/realm-legend.test.tsx`
Expected: PASS.

In a browser at 1280×800 and 390×844: the legend clears both the ability bar and the mana strip at `--realm-hud-scale` 1 and 1.25, and is absent when the stick is on. Record the measurements.

- [ ] **Step 7: Commit**

```bash
git add src/components/realm/realm-legend.tsx src/components/realm/realm-legend.test.tsx src/components/realm/realm-shell.tsx src/app/globals.css
git commit -m "feat(realm): put the controls on screen, not in a card" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: The touch Cast button

**Files:**
- Modify: `src/components/realm/realm-hud.tsx` (beside `RealmMountButton`), `src/app/globals.css`
- Test: `src/components/realm/realm-hud.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RealmCastButton({ onCast, disabled, showStick })` — renders only when `showStick` is true.

Spec §4.5. Touch has no keyboard and no left click, so the selected spell needs a visible trigger. A dedicated button rather than a double-tap on the slot: tap-to-select-then-tap-again-to-fire is the hidden second meaning this slice deletes everywhere else.

- [ ] **Step 1: Write the failing tests**

```tsx
it("shows the cast button only on touch, and fires the selection", async () => {
  const onCast = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<RealmCastButton onCast={onCast} disabled={false} showStick={true} />);
  await user.click(screen.getByRole("button", { name: /cast/i }));
  expect(onCast).toHaveBeenCalled();
  rerender(<RealmCastButton onCast={onCast} disabled={false} showStick={false} />);
  expect(screen.queryByRole("button", { name: /cast/i })).not.toBeInTheDocument();
});

it("is a world control, so it meets the 56px touch target", () => {
  const { container } = render(<RealmCastButton onCast={() => {}} disabled={false} showStick={true} />);
  expect(container.querySelector(".realm-cast-button")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: FAIL — `RealmCastButton` is not exported.

- [ ] **Step 3: Write it**

```tsx
export function RealmCastButton({ onCast, disabled, showStick }: { onCast: () => void; disabled: boolean; showStick: boolean }) {
  if (!showStick) return null; // a keyboard and a mouse both already have a way to cast
  return (
    <button type="button" className="realm-cast-button" disabled={disabled} onClick={onCast} aria-label="Cast">
      Cast
    </button>
  );
}
```

- [ ] **Step 4: CSS, at `--realm-touch` because it sits over the world**

```css
.realm-cast-button { position: absolute; right: 1.25rem; bottom: var(--realm-bar-bottom); z-index: 20; min-width: var(--realm-touch); min-height: var(--realm-touch); border-radius: 9999px; border: 1px solid var(--gold-border); background: rgba(0, 0, 0, 0.55); color: var(--gold-bright); font-weight: 700; pointer-events: auto; }
.realm-cast-button:disabled { opacity: 0.5; }
```

- [ ] **Step 5: Wire it in the shell**

Render it beside the mount button, passing `disabled={selectedSlot === null || riding}` and an `onCast` that pushes `{ nearest: true }` onto `castRef.current`.

- [ ] **Step 6: Tests and browser**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: PASS. In a browser with the stick on, confirm the button is 56×56 or larger and does not overlap the stick or the ability bar.

- [ ] **Step 7: Commit**

```bash
git add src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/components/realm/realm-shell.tsx src/app/globals.css
git commit -m "feat(realm): give touch a cast button of its own" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: The tutorial on screen

**Files:**
- Create: `src/components/realm/realm-tutorial.tsx`, `src/components/realm/realm-tutorial.test.tsx`
- Modify: `src/components/realm/realm-shell.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `tutorialPrompt`, `advanceTutorial`, `TutorialSignal`, `WALK_DISTANCE` (Task 4); `setTutorialStep` (Task 5); `bundle.tutorialStep` (Task 5).
- Produces: `<RealmTutorial prompt={string | null} onSkip={() => void} />`, and ONE new scene prop, `onTutorialSignal: (s: TutorialSignal) => void`, which carries the `walked` and `reachedObjective` signals out of the frame loop. It must be a stable `useCallback` like every other scene prop, and it takes the scene prop count from 25 back to 26 — **update the all-props stability test's expected count again.**

- [ ] **Step 1: Write the failing component tests**

```tsx
it("shows the current prompt and nothing once finished", () => {
  const { rerender, container } = render(<RealmTutorial prompt="Use W, A, S and D to walk." onSkip={() => {}} />);
  expect(screen.getByText(/Use W, A, S and D to walk\./)).toBeInTheDocument();
  rerender(<RealmTutorial prompt={null} onSkip={() => {}} />);
  expect(container.firstChild).toBeNull();
});

it("offers a way out that a grown-up can press", async () => {
  const onSkip = vi.fn();
  const user = userEvent.setup();
  render(<RealmTutorial prompt="Press 1." onSkip={onSkip} />);
  await user.click(screen.getByRole("button", { name: /skip/i }));
  expect(onSkip).toHaveBeenCalled();
});

it("announces politely so a screen reader hears each new step", () => {
  render(<RealmTutorial prompt="Press 1." onSkip={() => {}} />);
  expect(screen.getByTestId("realm-tutorial")).toHaveAttribute("aria-live", "polite");
});
```

- [ ] **Step 2: Run to verify it fails, then write it**

```tsx
"use client";

export function RealmTutorial({ prompt, onSkip }: { prompt: string | null; onSkip: () => void }) {
  if (!prompt) return null;
  return (
    <div className="realm-tutorial" data-testid="realm-tutorial" role="status" aria-live="polite">
      <p className="realm-tutorial-step">{prompt}</p>
      <button type="button" onClick={onSkip}>Skip</button>
    </div>
  );
}
```

```css
.realm-tutorial { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--realm-bar-bottom) + 7.4rem); z-index: 21; display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0.8rem; border-radius: 0.5rem; border: 1px solid var(--gold-border); background: rgba(0, 0, 0, 0.7); font-size: calc(13px * var(--realm-hud-scale)); pointer-events: none; }
.realm-tutorial button { min-height: 44px; color: var(--gold-bright); pointer-events: auto; }
.realm-tutorial-step { margin: 0; }
```

- [ ] **Step 3: Hold the state in the shell**

```ts
const [tutorial, setTutorial] = useState<TutorialState>(() => ({ completed: bundle.tutorialStep }));
const walkKeys = useRef(new Set<string>());
const walkDistance = useRef(0);

// Persisting is fire-and-forget: a failed write costs the child a repeated step next
// visit, which is far better than a thrown error over a running world.
const signal = useCallback((s: TutorialSignal) => {
  setTutorial((prev) => {
    const next = advanceTutorial(prev, s);
    if (next.completed !== prev.completed) void setTutorialStep(childId, next.completed).catch(() => {});
    return next;
  });
}, [childId]);
```

`signal` must be referentially stable — it is passed to the memoised scene.

- [ ] **Step 4: Feed it the four signals**

- **walked**: the scene already steps the hero every frame. Accumulate distance in a ref and the pressed key codes in a ref, and emit one `{ kind: "walked", keys, distance }` through `queueMicrotask` when the distance first passes `WALK_DISTANCE`. Never call `setState` from the frame loop.
- **reachedObjective**: the beacon already knows when the hero arrives; emit there.
- **interacted**: in `onTalk`.
- **castLanded**: in the existing spell-event handler, on a cast that is not refused.

- [ ] **Step 5: Render it and wire skip**

```tsx
<RealmTutorial prompt={tutorialPrompt(tutorial)} onSkip={() => signalSkip()} />
```

where `signalSkip` sets `{ completed: 4 }` and calls `setTutorialStep(childId, 4)`.

- [ ] **Step 6: Add the shell test**

```tsx
it("advances the tutorial only when the child does the thing, and remembers it", async () => {
  getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
  render(<RealmShell bundle={{ ...bundle, tutorialStep: 2 }} childId="c1" isChildView={true} />);
  expect(await screen.findByTestId("scene")).toBeInTheDocument();
  expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Stand close and press E.");
  await act(async () => { (sceneProps.onTalk as (id: string) => void)("bram"); });
  await waitFor(() => expect(setTutorialStep).toHaveBeenCalledWith("c1", 3));
});
```

- [ ] **Step 7: Gates**

```bash
npx vitest run src/components/realm
npx tsc --noEmit
npx eslint src/components/realm
```
Expected: all PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/realm src/app/globals.css
git commit -m "feat(realm): teach the four verbs by doing them" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: The help card tells the truth

**Files:**
- Modify: `src/components/realm/realm-help.tsx`
- Test: `src/components/realm/realm-help.test.tsx`

**Interfaces:**
- Consumes: `setTutorialStep` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

```tsx
it("describes one input model, not two", () => {
  render(<RealmHelp {...props} />);
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/space/i);
  expect(text).not.toMatch(/click .*(walk|move)/i);
  expect(text).toMatch(/W, A, S and D/);
  expect(text).toMatch(/\bE\b/);
});

it("can start the walkthrough again", async () => {
  const user = userEvent.setup();
  render(<RealmHelp {...props} />);
  await user.click(screen.getByRole("button", { name: /show me the tutorial again/i }));
  expect(setTutorialStep).toHaveBeenCalledWith("c1", 0);
});
```

- [ ] **Step 2: Update the card's copy**

Replace the Move / Talk / Cast rows so they match §4.1 exactly:

- **Move** — "Use W, A, S and D to walk."
- **Where to go** — "Follow the gold light. Someone is waiting there." *(unchanged)*
- **Talk** — "Stand close to someone and press E."
- **Cast** — "Press 1, 2, 3 or 4 — or click what you want to hit."
- **Ride and recess** — unchanged.

Delete any sentence mentioning Space, tapping the ground to walk, or clicking a villager to talk.

- [ ] **Step 3: Add the replay control**

A button reading **Show me the tutorial again** that calls `setTutorialStep(childId, 0)` and closes the card. Give it the same `aria-disabled`-while-saving treatment as the existing view control — **never `disabled`**, which strands focus on `<body>` and kills the dialog's Escape and Tab trap.

- [ ] **Step 4: Gates and commit**

```bash
npx vitest run src/components/realm/realm-help.test.tsx
git add src/components/realm/realm-help.tsx src/components/realm/realm-help.test.tsx
git commit -m "fix(realm): the help card describes the controls that exist" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: The acceptance pass

**Files:**
- Modify: none, unless a check fails.
- Test: the whole suite, plus a browser pass.

**Interfaces:**
- Consumes: everything.
- Produces: a written acceptance record in the task report.

- [ ] **Step 1: The repo gates**

```bash
git branch --show-current
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: `realm-foundations`; all tests passing; typecheck clean; **exactly one** lint error, the pre-existing `quest-template-list.tsx:70`; build succeeds.

- [ ] **Step 2: Prove the harness can fail before believing it**

Slice 1's acceptance harness carried ten defects that each silently produced a *wrong* answer — it reported success by construction until corrected. Before running any browser check, break one thing on purpose (hide the minimap with devtools, say) and confirm the check for it **fails**. Record that it did. A harness that has never failed has not been tested.

- [ ] **Step 3: The ten checks**

Run each in a browser on a dev server, as the child (not the parent preview), and record a screenshot and a PASS/FAIL for each:

1. **One label per site.** Every building shows exactly one nameplate. The castle, trees, rocks and fences show none.
2. **Four corners.** Quest log upper left, minimap upper right, name and mana bottom left, Leave/timer/`?` bottom right. No two zones overlap at 1280×800 or 390×844, at `--realm-hud-scale` 1 and 1.25.
3. **The minimap reads.** The hero dot moves as you walk and its tick turns with facing. An unbuilt site is hollow; a raised one is filled; the objective is a ring.
4. **WASD.** All four keys walk, and diagonals work.
5. **Clicking the world never walks and never talks.** Click open grass, a villager, and a building. The hero does not move and no panel opens.
6. **`1` casts, and so does left click.** With a spell earned, `1` fires it; clicking a trouble fires at that trouble; clicking grass with a trouble in range fires at the nearest.
7. **A cast with nothing in range refuses.** The mana pips flash red, the mana total does not drop, and nothing is fired into empty grass.
8. **`E` interacts, `Enter` and `Space` do nothing.** Stand in reach: `Enter` and `Space` open nothing; `E` opens the panel.
9. **The legend is on screen** on desktop, absent on touch, and clears both the ability bar and the mana strip at both HUD scales.
10. **The tutorial gates on doing.** In a fresh hero: pressing only `W` does not complete step 1; pressing `W` and `D` and walking does. Reload mid-tutorial and confirm it resumes at the same step. Press Skip and confirm it does not return.

- [ ] **Step 4: The depth check**

With `fewerChoices` on, confirm the minimap still renders and shows the hero and the objective but no site or trouble dots — **a substitution, not a removal.** Confirm the word "depth" appears nowhere on screen, including in `title` and `aria-label` attributes (check the accessibility tree, not just the rendered text).

- [ ] **Step 5: Clean up**

Kill any dev server you started. Delete any fixture rows you created. Confirm `git status --short` is empty and the repo is exactly as you found it.

- [ ] **Step 6: Write the acceptance record**

In the task report: every check with PASS/FAIL and its screenshot path, the measured HUD bounding boxes from Steps 6 and 11 of the earlier tasks, what you broke in Step 2 and that the check caught it, and anything you could not verify with the reason.
