# Realm: Deeds in the Realm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a villager at every kingdom building site in the Realm; talking to one opens that site's deeds, the deed plays inside the Realm with the play clock paused, and finishing a deed raises the building where the hero stands.

**Architecture:** The pure world model (`src/lib/realm/`) gains sites (foundation or building per progress), villager placement and reach, and a kingdom-state reducer. The bundle carries kingdom state from a loader shared with the Deeds page; a completed deed's summary patches that state locally so the layout rebuilds in place. The scene draws foundations, villager billboards, a prompt bubble, and a rise tween; the shell owns the site card and deed panel overlay, pauses the clock and disables world input while a deed runs, and shows the rise toast. `DeedPlayer`/`DeedResults` are reused unchanged apart from `onFinished(summary)`.

**Tech Stack:** Next.js 16 App Router, React 19, three 0.185 / @react-three/fiber 9.7 / drei 10.7, Drizzle, Vitest + Testing Library (jsdom, no WebGL).

**Spec:** `docs/superpowers/specs/2026-09-06-realm-deeds-in-realm-design.md`

## Global Constraints

- Pure logic in `src/lib/realm/` with colocated tests written first; no three.js runtime imports outside `realm-scene.tsx` (type imports allowed); `realm-scene.tsx` is never imported by a test.
- Lint rule `react-hooks/set-state-in-effect`: no synchronous setState in effect bodies; no `any`; no `eslint-disable`.
- `"use server"` files export only async functions and types. Hero-or-parent writes use `requireChildAccess(childId, { write: true })`; `startDeedRun` in the `"realm"` context refuses parent actors with "Deeds are for the hero to play."
- Copy verbatim: villager greetings (table in Task 1), "Talk", "Begin", "Close", "Leave the deed", "Deeds are for the hero to play.", "The {label} stands.", "The villagers are resting. Try again.", "Built", "{done} of {total}", HUD "· paused". Deed stories via `deedStory(deed, tone)`.
- `REACH = 2.5`, `VILLAGER_OFFSET = 1.5`, `RISE_MS = 900`, foundation `h: 0.2`, `FOUNDATION_COLOR = "#6b665a"` (calm `"#5a5750"`), toast 4 s, Talk button 44 px minimum.
- While a deed panel is open: clock paused (no seconds, records, warn, close), keyboard input disabled and keys cleared, stick hidden, ground taps ignored, focus trapped in the panel. Unpausing triggers exactly one access refresh.
- Parent preview: bubbles and site cards open, Begin replaced by "Deeds are for the hero to play.", no run starts, clock stays disabled.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Known pre-existing lint error in `src/components/quest-template-list.tsx` is accepted.

---

### Task 1: Sites, villagers, and the kingdom reducer (pure)

**Files:**
- Modify: `src/lib/realm/layout.ts`, `src/lib/realm/layout.test.ts`
- Create: `src/lib/realm/villagers.ts`, `src/lib/realm/villagers.test.ts`, `src/lib/realm/kingdom-state.ts`, `src/lib/realm/kingdom-state.test.ts`

**Interfaces:**
- Consumes: `BUILDINGS`, `findBuilding` from `@/lib/utils/kingdom`; `AvatarConfig`, `DEFAULT_AVATAR` from `@/lib/utils/avatar-catalog`.
- Produces: `SiteProgress = { id; done; total; complete }`, `PropKind` adds `"foundation" | "villager"`, `Prop.tag?: string`, `VillagerPlacement = { id; buildingId; position }`, `WorldLayout.villagers`, `buildWorldLayout({ castleType, buildings: SiteProgress[] })`, `buildingFootprint(id)`, `FOUNDATION_COLOR`; `Villager`, `VILLAGERS`, `villagerForBuilding`, `villagerAvatar(v): AvatarConfig`, `VILLAGER_OFFSET`, `villagerPosition`, `REACH`, `nearestVillager`; `KingdomState`, `BuildingProgress`, `applyDeedResult`.

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/realm/layout.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR } from "./layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { REACH, VILLAGER_OFFSET } from "./villagers";

const none = { castleType: "campsite", buildings: [] };

describe("buildWorldLayout", () => {
  it("places a castle scaled to its tier, defaulting unknown tiers to a campsite", () => {
    const citadel = buildWorldLayout({ ...none, castleType: "citadel" });
    const camp = buildWorldLayout(none);
    const unknown = buildWorldLayout({ ...none, castleType: "moon-base" });
    const c = citadel.props.find((p) => p.kind === "castle")!;
    expect(c.position).toEqual(CASTLE_POSITION);
    expect(c.size).toEqual(CASTLE_FOOTPRINTS.citadel);
    expect(c.size.h).toBeGreaterThan(camp.props.find((p) => p.kind === "castle")!.size.h);
    expect(unknown.props.find((p) => p.kind === "castle")!.size).toEqual(CASTLE_FOOTPRINTS.campsite);
  });

  it("gives every building a site: a building when complete, a foundation otherwise, missing progress meaning none", () => {
    const layout = buildWorldLayout({
      castleType: "keep",
      buildings: [
        { id: "well", done: 5, total: 5, complete: true },
        { id: "library", done: 2, total: 5, complete: false },
        { id: "nope", done: 9, total: 9, complete: true },
      ],
    });
    const buildings = layout.props.filter((p) => p.kind === "building");
    const foundations = layout.props.filter((p) => p.kind === "foundation");
    expect(buildings.map((b) => b.id)).toEqual(["well"]);
    expect(buildings[0].tag).toBe("Built");
    expect(buildings[0].solid).toBe(true);
    expect(buildings[0].position).toEqual(BUILDING_SLOTS.well);
    expect(foundations.length).toBe(BUILDINGS.length - 1);
    const library = foundations.find((f) => f.id === "library")!;
    expect(library.tag).toBe("2 of 5");
    expect(library.solid).toBe(false);
    expect(library.size).toEqual({ ...buildingFootprint("library"), h: 0.2 });
    expect(library.color).toBe(FOUNDATION_COLOR);
    expect(library.label).toBe("Library");
    const mill = foundations.find((f) => f.id === "mill")!;
    expect(mill.tag).toBe("0 of 5");
    expect(layout.props.some((p) => p.id === "nope")).toBe(false);
  });

  it("stands a villager at every site, south of the footprint, never as a collider", () => {
    const layout = buildWorldLayout({ ...none, buildings: [{ id: "well", done: 5, total: 5, complete: true }] });
    expect(layout.villagers.length).toBe(BUILDINGS.length);
    const villagerProps = layout.props.filter((p) => p.kind === "villager");
    expect(villagerProps.length).toBe(BUILDINGS.length);
    const well = layout.villagers.find((v) => v.buildingId === "well")!;
    expect(well.position).toEqual({ x: BUILDING_SLOTS.well.x, z: BUILDING_SLOTS.well.z + buildingFootprint("well").d / 2 + VILLAGER_OFFSET });
    expect(layout.props.find((p) => p.id === `villager-${well.id}`)!.label).toBe("Old Bram");
    expect(layout.colliders.some((c) => c.kind === "villager" || c.kind === "foundation")).toBe(false);
    expect(layout.colliders.map((c) => c.id).sort()).toEqual(["castle", "well"]);
    // A villager stands within reach of the walkable ground beside the site, not inside the box.
    const box = layout.props.find((p) => p.id === "well")!;
    expect(well.position.z - box.position.z).toBeGreaterThan(box.size.d / 2);
    expect(REACH).toBeGreaterThan(0);
  });

  it("lays a walkable path from the gate to the castle and keeps it out of the colliders", () => {
    const layout = buildWorldLayout({ ...none, castleType: "castle" });
    const path = layout.props.filter((p) => p.kind === "path");
    expect(path.length).toBeGreaterThan(5);
    for (const tile of path) expect(tile.solid).toBe(false);
    expect(layout.colliders.every((c) => c.solid)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "path")).toBe(false);
    expect(Math.max(...path.map((p) => p.position.z))).toBe(17);
  });

  it("spawns inside the world, south of the castle", () => {
    const layout = buildWorldLayout(none);
    expect(layout.spawn).toEqual(SPAWN);
    expect(Math.abs(layout.spawn.z)).toBeLessThan(WORLD_SIZE / 2);
    expect(layout.spawn.z).toBeGreaterThan(CASTLE_POSITION.z);
  });

  it("gives every building slot a home inside the world", () => {
    for (const slot of Object.values(BUILDING_SLOTS)) {
      expect(Math.abs(slot.x)).toBeLessThan(WORLD_SIZE / 2 - 2);
      expect(Math.abs(slot.z)).toBeLessThan(WORLD_SIZE / 2 - 2);
    }
  });
});
```

Create `src/lib/realm/villagers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VILLAGERS, villagerForBuilding, villagerAvatar, villagerPosition, nearestVillager, REACH, VILLAGER_OFFSET } from "./villagers";
import { BUILDINGS } from "@/lib/utils/kingdom";

describe("villagers", () => {
  it("has exactly one villager per building, in building order, each with a name and greeting", () => {
    expect(VILLAGERS.map((v) => v.buildingId)).toEqual(BUILDINGS.map((b) => b.id));
    const ids = new Set(VILLAGERS.map((v) => v.id));
    expect(ids.size).toBe(VILLAGERS.length);
    for (const v of VILLAGERS) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.greeting.endsWith("?")).toBe(true);
    }
    expect(villagerForBuilding("well")!.name).toBe("Old Bram");
    expect(villagerForBuilding("nope")).toBeNull();
  });

  it("builds a full avatar config for a villager with no companion or crest", () => {
    const cfg = villagerAvatar(villagerForBuilding("mill")!);
    expect(cfg.companion).toBeNull();
    expect(cfg.outfit).toBe("vest");
    expect(typeof cfg.skinTone).toBe("string");
  });

  it("stands the villager south of the footprint by the offset", () => {
    expect(villagerPosition({ x: -5, z: 8 }, { d: 3 })).toEqual({ x: -5, z: 8 + 1.5 + VILLAGER_OFFSET });
  });

  it("finds the nearest villager within reach, ties to array order, none out of reach", () => {
    const vs = [
      { id: "a", position: { x: 0, z: 0 } },
      { id: "b", position: { x: 2, z: 0 } },
      { id: "c", position: { x: 0, z: 2 } },
    ];
    expect(nearestVillager({ x: 10, z: 10 }, vs)).toBeNull();
    expect(nearestVillager({ x: 1.6, z: 0 }, vs)).toBe("b"); // 0.4 from b, 1.6 from a
    expect(nearestVillager({ x: 1, z: 1 }, vs)).toBe("a"); // all three at 1.41: equal distances resolve to array order
    expect(nearestVillager({ x: 0, z: REACH }, [vs[2]])).toBe("c"); // exactly at reach counts
    expect(nearestVillager({ x: 0, z: REACH + 0.01 }, [vs[2]])).toBeNull();
  });
});
```

Create `src/lib/realm/kingdom-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyDeedResult, type KingdomState } from "./kingdom-state";

const state: KingdomState = {
  tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "", icon: "box", done: 4, total: 5, complete: false, deeds: [] },
    { id: "mill", label: "Grain Mill", description: "", icon: "compass", done: 5, total: 5, complete: true, deeds: [] },
  ],
};

describe("applyDeedResult", () => {
  it("patches the building's progress and reports a rise when it completes", () => {
    const { state: next, rose } = applyDeedResult(state, "well", { done: 5, total: 5, complete: true });
    expect(rose).toBe(true);
    expect(next.buildings[0]).toMatchObject({ id: "well", done: 5, complete: true, label: "Village Well" });
    expect(next.buildings[1]).toBe(state.buildings[1]);
    expect(state.buildings[0].done).toBe(4);
  });

  it("does not report a rise for progress short of complete or for an already built site", () => {
    expect(applyDeedResult(state, "well", { done: 4, total: 5, complete: false }).rose).toBe(false);
    expect(applyDeedResult(state, "mill", { done: 5, total: 5, complete: true }).rose).toBe(false);
  });

  it("returns the same state for an unknown building", () => {
    const { state: next, rose } = applyDeedResult(state, "nope", { done: 1, total: 5, complete: false });
    expect(next).toBe(state);
    expect(rose).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/layout.test.ts src/lib/realm/villagers.test.ts src/lib/realm/kingdom-state.test.ts`
Expected: FAIL (missing modules / properties).

- [ ] **Step 3: Write the villagers module**

Create `src/lib/realm/villagers.ts`:

```ts
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { Vec2 } from "./layout";

/** The visual half of an avatar config: what the villager wears, never a crest or companion. */
export type VillagerFigureConfig = Pick<AvatarConfig, "skinTone" | "hairStyle" | "hairColor" | "outfit" | "outfitColor" | "legwear" | "legwearColor" | "boots" | "bootsColor" | "accessory" | "accessoryColor">;

export type Villager = { id: string; buildingId: string; name: string; greeting: string; figure: VillagerFigureConfig };

const base: VillagerFigureConfig = {
  skinTone: "medium", hairStyle: "short", hairColor: "#4a3728", outfit: "tunic", outfitColor: "#8c7a6b",
  legwear: "pants", legwearColor: "#4a3728", boots: "leather-boots", bootsColor: "#6b4226", accessory: null, accessoryColor: "#d4a843",
};

/** One villager per building, in BUILDINGS order. Greetings are gentle; the monsters toggle changes deed stories, not greetings. */
export const VILLAGERS: Villager[] = [
  { id: "bram", buildingId: "well", name: "Old Bram", greeting: "The bucket's dry again. Have you a moment for the well?", figure: { ...base, skinTone: "medium-dark", hairStyle: "short", hairColor: "#6b7280", outfit: "tunic", outfitColor: "#5b8fb9" } },
  { id: "tessa", buildingId: "mill", name: "Miller Tessa", greeting: "Sacks everywhere and no one to count them. Lend a hand?", figure: { ...base, skinTone: "light", hairStyle: "bun", hairColor: "#b87333", outfit: "vest", outfitColor: "#b08a5a" } },
  { id: "aldo", buildingId: "bridge", name: "Carpenter Aldo", greeting: "Planks to measure and a river that won't wait. Help me?", figure: { ...base, skinTone: "olive", hairStyle: "curly", hairColor: "#1a1a2e", outfit: "vest", outfitColor: "#8c7a6b", accessory: "bandana", accessoryColor: "#c0563d" } },
  { id: "wren", buildingId: "chapel", name: "Sister Wren", greeting: "The bell wants numbers and the scroll wants reading. Will you?", figure: { ...base, skinTone: "pale", hairStyle: "long", hairColor: "#f0f0f0", outfit: "robe", outfitColor: "#d8cfc0" } },
  { id: "pip", buildingId: "market", name: "Crier Pip", greeting: "Prices, words, and a market that opens at noon. Join me?", figure: { ...base, skinTone: "medium-light", hairStyle: "spiky", hairColor: "#f97316", outfit: "tunic", outfitColor: "#c0563d" } },
  { id: "hesper", buildingId: "library", name: "Librarian Hesper", greeting: "Every scroll has a place. Shall we find them?", figure: { ...base, skinTone: "dark", hairStyle: "braided", hairColor: "#1a1a2e", outfit: "robe", outfitColor: "#6f5a8a", accessory: "glasses", accessoryColor: "#c0c0c0" } },
  { id: "gerd", buildingId: "watchtower", name: "Mason Gerd", greeting: "Stones to count before the lantern's lit. Are you willing?", figure: { ...base, skinTone: "bronze", hairStyle: "short", hairColor: "#4a3728", outfit: "armor", outfitColor: "#7d7d7d" } },
  { id: "ivy", buildingId: "garden", name: "Keeper Ivy", greeting: "The bees have questions. Come see the beds?", figure: { ...base, skinTone: "medium", hairStyle: "ponytail", hairColor: "#22c55e", outfit: "tunic", outfitColor: "#5aa55a", accessory: "flower-crown", accessoryColor: "#ec4899" } },
];

export function villagerForBuilding(buildingId: string): Villager | null {
  return VILLAGERS.find((v) => v.buildingId === buildingId) ?? null;
}

export function villagerById(id: string): Villager | null {
  return VILLAGERS.find((v) => v.id === id) ?? null;
}

/** A full avatar config the figure components accept; the crest and companion are never drawn on a villager. */
export function villagerAvatar(villager: Villager): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...villager.figure, companion: null };
}

/** Units toward spawn (positive z) from the site's south edge. */
export const VILLAGER_OFFSET = 1.5;
/** A hero this close (or closer) can talk. */
export const REACH = 2.5;

export function villagerPosition(slot: Vec2, footprint: { d: number }): Vec2 {
  return { x: slot.x, z: slot.z + footprint.d / 2 + VILLAGER_OFFSET };
}

/** The id of the nearest villager within REACH, ties resolved to array order; null when none is close enough. */
export function nearestVillager(hero: Vec2, villagers: { id: string; position: Vec2 }[]): string | null {
  let best: { id: string; d: number } | null = null;
  for (const v of villagers) {
    const d = Math.hypot(v.position.x - hero.x, v.position.z - hero.z);
    if (d > REACH) continue;
    if (!best || d < best.d) best = { id: v.id, d };
  }
  return best?.id ?? null;
}
```

- [ ] **Step 4: Update the layout module**

In `src/lib/realm/layout.ts`, change the imports and types at the top:

```ts
import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
import { VILLAGERS, villagerPosition } from "./villagers";

/** Units are abstract; the camera zoom maps them to pixels. The ground is WORLD_SIZE² centered on the origin. */
export const WORLD_SIZE = 40;

export type Vec2 = { x: number; z: number };
export type PropKind = "castle" | "building" | "foundation" | "path" | "villager";

export type Prop = {
  id: string;
  kind: PropKind;
  label: string;
  tag?: string; // a second line under the label: "Built" or "2 of 5"
  position: Vec2; // center
  size: { w: number; d: number; h: number }; // footprint width (x), depth (z), height (y)
  color: string;
  solid: boolean; // walkable props (paths, foundations, villagers) are not colliders
};

/** Progress for one kingdom building, as the deeds overview reports it. */
export type SiteProgress = { id: string; done: number; total: number; complete: boolean };
export type VillagerPlacement = { id: string; buildingId: string; position: Vec2 };

export type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[]; villagers: VillagerPlacement[] };
```

Replace the constants after `BUILDING_COLORS` and the whole `buildWorldLayout` function with:

```ts
const BUILDING_SIZE = { w: 3, d: 3, h: 2.5 };
const WATCHTOWER_SIZE = { w: 2, d: 2, h: 5 };
const CASTLE_COLOR = "#9a9aa8";
const PATH_COLOR = "#c9b27a";
export const FOUNDATION_COLOR = "#6b665a";
const FOUNDATION_H = 0.2;
const VILLAGER_SIZE = { w: 0.9, d: 0.9, h: 1.8 };

export function buildingFootprint(id: string): { w: number; d: number; h: number } {
  return id === "watchtower" ? WATCHTOWER_SIZE : BUILDING_SIZE;
}

export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[] }): WorldLayout {
  const castleSize = CASTLE_FOOTPRINTS[input.castleType] ?? CASTLE_FOOTPRINTS.campsite;
  const props: Prop[] = [
    { id: "castle", kind: "castle", label: "Castle", position: CASTLE_POSITION, size: castleSize, color: CASTLE_COLOR, solid: true },
  ];

  // A row of flat tiles from the south gate to the castle's south face.
  const castleSouth = CASTLE_POSITION.z + castleSize.d / 2 + 1;
  for (let z = GATE_Z; z >= castleSouth; z -= 2) {
    props.push({ id: `path-${z}`, kind: "path", label: "Path", position: { x: 0, z }, size: { w: 2, d: 2, h: 0.05 }, color: PATH_COLOR, solid: false });
  }

  // Every building has a site: the building once complete, a foundation until then. Missing progress means none yet.
  const progress = new Map(input.buildings.map((b) => [b.id, b]));
  const villagers: VillagerPlacement[] = [];
  for (const building of BUILDINGS) {
    const slot = BUILDING_SLOTS[building.id];
    if (!slot) continue;
    const footprint = buildingFootprint(building.id);
    const p = progress.get(building.id) ?? { id: building.id, done: 0, total: building.deedsToBuild, complete: false };
    if (p.complete) {
      props.push({ id: building.id, kind: "building", label: building.label, tag: "Built", position: slot, size: footprint, color: BUILDING_COLORS[building.id] ?? "#888888", solid: true });
    } else {
      props.push({ id: building.id, kind: "foundation", label: building.label, tag: `${p.done} of ${p.total}`, position: slot, size: { ...footprint, h: FOUNDATION_H }, color: FOUNDATION_COLOR, solid: false });
    }
    const villager = VILLAGERS.find((v) => v.buildingId === building.id);
    if (villager) {
      const position = villagerPosition(slot, footprint);
      villagers.push({ id: villager.id, buildingId: building.id, position });
      props.push({ id: `villager-${villager.id}`, kind: "villager", label: villager.name, position, size: VILLAGER_SIZE, color: "#000000", solid: false });
    }
  }

  return { props, spawn: SPAWN, colliders: props.filter((p) => p.solid), villagers };
}
```

`findBuilding` is no longer used in this file; drop it from the import if the linter flags it (keep `BUILDINGS`).

- [ ] **Step 5: Write the kingdom reducer**

Create `src/lib/realm/kingdom-state.ts`:

```ts
import type { BuildingOverview } from "@/lib/services/deeds";

export type KingdomState = { tone: "gentle" | "monsters"; buildings: BuildingOverview[] };
export type BuildingProgress = { done: number; total: number; complete: boolean };

/**
 * Applies a finished deed's building progress. `rose` is true only when the
 * building went from unfinished to complete in this step, which is when the
 * world should raise it.
 */
export function applyDeedResult(state: KingdomState, buildingId: string, result: BuildingProgress): { state: KingdomState; rose: boolean } {
  const index = state.buildings.findIndex((b) => b.id === buildingId);
  if (index === -1) return { state, rose: false };
  const before = state.buildings[index];
  const rose = !before.complete && result.complete;
  const buildings = state.buildings.slice();
  buildings[index] = { ...before, done: result.done, total: result.total, complete: result.complete };
  return { state: { ...state, buildings }, rose };
}
```

`BuildingOverview` moves to `src/lib/services/deeds.ts` in Task 3. For this task, create that file with only the type so the import resolves (Task 3 fills it in):

```ts
import type { GameIconName } from "@/components/game-icon";
import type { SkillArea } from "@/lib/utils/skills";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};
```

Also update `src/lib/actions/deeds.ts`: delete its local `BuildingOverview` type and add `import type { BuildingOverview } from "@/lib/services/deeds"; export type { BuildingOverview };` so existing importers keep working.

- [ ] **Step 6: Fix the two call sites of the old `builtBuildingIds` input**

`src/components/realm/realm-shell.tsx` (the `layout` memo) and `src/lib/actions/realm.ts` still use `builtBuildingIds`. Make the smallest change that compiles now; Task 3 and Task 6 replace both properly:

- In `realm-shell.tsx`: `buildWorldLayout({ castleType: bundle.castleType, buildings: bundle.builtBuildingIds.map((id) => ({ id, done: 0, total: 0, complete: true })) })`.
- In `src/components/realm/realm-shell.test.tsx`, nothing changes yet (the bundle still has `builtBuildingIds: []`).

- [ ] **Step 7: Run the tests and the full suite**

Run: `npx vitest run src/lib/realm/` then `npx vitest run` and `npm run typecheck` and `npx eslint src/lib/realm/ src/components/realm/realm-shell.tsx`
Expected: all pass. Note `realm-scene.tsx` renders every prop as a box; foundation and villager props get boxes for now (Task 4 draws them properly).

- [ ] **Step 8: Commit**

```bash
git add src/lib/realm/ src/lib/services/deeds.ts src/lib/actions/deeds.ts src/components/realm/realm-shell.tsx
git commit -m "Realm sites, villagers, and the kingdom reducer"
```

---

### Task 2: Villager figures and textures

**Files:**
- Modify: `src/components/avatar.tsx` (the `AvatarFigure` export), `src/components/avatar-figures.test.tsx`, `src/components/realm/sprite-source.tsx`
- Create: `src/components/realm/sprite-source.test.tsx`

**Interfaces:**
- Consumes: `VILLAGERS`, `villagerAvatar` (Task 1); `spriteKey`, `svgElementToTexture`, cache helpers.
- Produces: `AvatarFigure` accepts `figure?: "hero" | "villager"` and `figureId?: string` (rendered as `data-figure` / `data-figure-id`); `VillagerFigure({ villager, size?, className? })`; `SpriteSource` prop `villagers?: Villager[]`; `SpriteTextures.villagers: Record<string, THREE.CanvasTexture>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/avatar-figures.test.tsx` (inside the file, after the existing describes):

```tsx
import { VillagerFigure } from "./avatar";
import { VILLAGERS } from "@/lib/realm/villagers";

describe("VillagerFigure", () => {
  it("draws a villager with its own figure attributes and no companion", () => {
    const v = VILLAGERS[0];
    const { container } = render(<VillagerFigure villager={v} />);
    const svg = container.querySelector('svg[data-figure="villager"]')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("data-figure-id")).toBe(v.id);
    expect(container.querySelector('svg[data-figure="companion"]')).toBeNull();
    expect(svg.querySelectorAll("rect,path,circle,polygon,ellipse,line").length).toBeGreaterThan(0);
  });
});
```

(Move the two imports to the top of the file with the others.)

Create `src/components/realm/sprite-source.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { SpriteSource } from "./sprite-source";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { VILLAGERS } from "@/lib/realm/villagers";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";

const svgElementToTexture = vi.fn();
vi.mock("@/lib/realm/sprite-texture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realm/sprite-texture")>();
  return { ...actual, svgElementToTexture: (...a: unknown[]) => svgElementToTexture(...a) };
});

beforeEach(() => {
  vi.clearAllMocks();
  disposeSpriteTextures();
  svgElementToTexture.mockImplementation(async (svg: SVGSVGElement) => ({ id: svg.getAttribute("data-figure-id") ?? svg.getAttribute("data-figure"), dispose: () => {} }));
});
afterEach(cleanup);

describe("SpriteSource", () => {
  it("rasterizes the hero, the companion, and every villager, keyed by villager id", async () => {
    const onReady = vi.fn();
    const config = { ...DEFAULT_AVATAR, companion: "cat" };
    render(<SpriteSource config={config} villagers={VILLAGERS.slice(0, 2)} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(textures.hero).toMatchObject({ id: "hero" });
    expect(textures.companion).toMatchObject({ id: "companion" });
    expect(Object.keys(textures.villagers).sort()).toEqual([VILLAGERS[0].id, VILLAGERS[1].id].sort());
    expect(svgElementToTexture).toHaveBeenCalledTimes(4);
  });

  it("reuses cached villager textures on a second mount", async () => {
    const onReady = vi.fn();
    const { unmount } = render(<SpriteSource config={DEFAULT_AVATAR} villagers={[VILLAGERS[0]]} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    unmount();
    render(<SpriteSource config={DEFAULT_AVATAR} villagers={[VILLAGERS[0]]} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    expect(svgElementToTexture).toHaveBeenCalledTimes(2); // hero + villager once; second mount hits the cache
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/avatar-figures.test.tsx src/components/realm/sprite-source.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Extend `AvatarFigure` and add `VillagerFigure`**

In `src/components/avatar.tsx`, change the `AvatarFigure` signature and the svg attributes:

```tsx
export function AvatarFigure({
  config,
  size = "xl",
  className = "",
  figure = "hero",
  figureId,
}: {
  config: AvatarConfig;
  size?: keyof typeof SIZE_MAP;
  className?: string;
  figure?: "hero" | "villager";
  figureId?: string;
}) {
```

and on the `<svg>`: `data-figure={figure}` and `data-figure-id={figureId}` (React omits the attribute when undefined). Then append at the end of the file:

```tsx
export function VillagerFigure({ villager, size = "xl", className = "" }: { villager: Villager; size?: keyof typeof SIZE_MAP; className?: string }) {
  return <AvatarFigure config={villagerAvatar(villager)} size={size} className={className} figure="villager" figureId={villager.id} />;
}
```

with `import { villagerAvatar, type Villager } from "@/lib/realm/villagers";` at the top of `avatar.tsx`. (`villagers.ts` imports only `avatar-catalog` and a type from `layout`, so there is no cycle.)

- [ ] **Step 4: Extend `SpriteSource`**

Replace `src/components/realm/sprite-source.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure, VillagerFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { villagerAvatar, type Villager } from "@/lib/realm/villagers";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";

export type SpriteTextures = { hero: THREE.CanvasTexture; companion: THREE.CanvasTexture | null; villagers: Record<string, THREE.CanvasTexture> };

async function textureFor(key: string, svg: SVGSVGElement): Promise<THREE.CanvasTexture> {
  const cached = getCachedTexture(key);
  if (cached) return cached;
  const texture = await svgElementToTexture(svg);
  setCachedTexture(key, texture);
  return texture;
}

/**
 * Renders the hero, companion, and villager figures off-screen and rasterizes
 * them. The SVG must exist in the DOM to be serialized, which is why this is a
 * component rather than a plain function.
 */
export function SpriteSource({
  config,
  villagers = [],
  onReady,
  onError,
}: {
  config: AvatarConfig;
  villagers?: Villager[];
  onReady: (textures: SpriteTextures) => void;
  onError: (error: Error) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const root = host.current;
    const heroSvg = root?.querySelector<SVGSVGElement>('svg[data-figure="hero"]');
    if (!root || !heroSvg) return;
    const key = spriteKey(config);
    (async () => {
      const hero = await textureFor(key, heroSvg);
      let companion: THREE.CanvasTexture | null = null;
      const companionSvg = root.querySelector<SVGSVGElement>('svg[data-figure="companion"]');
      if (companionSvg && config.companion) companion = await textureFor(`${key}:companion`, companionSvg);
      const villagerTextures: Record<string, THREE.CanvasTexture> = {};
      for (const v of villagers) {
        const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="villager"][data-figure-id="${v.id}"]`);
        if (!svg) continue;
        villagerTextures[v.id] = await textureFor(`villager:${v.id}:${spriteKey(villagerAvatar(v))}`, svg);
      }
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, villagers, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
      {villagers.map((v) => <VillagerFigure key={v.id} villager={v} size="xl" />)}
    </div>
  );
}
```

Callers must pass a stable `villagers` array (module constant `VILLAGERS`), or the effect re-runs each render.

- [ ] **Step 5: Fix existing consumers of `SpriteTextures`**

`src/components/realm/realm-shell.test.tsx`'s `SpriteSource` mock reports `{ hero: {}, companion: null }`; add `villagers: {}`. `realm-scene.tsx` compiles unchanged (it only reads `hero`/`companion`).

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run src/components/` then `npm run typecheck` and `npx eslint src/components/avatar.tsx src/components/realm/`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/avatar.tsx src/components/avatar-figures.test.tsx src/components/realm/sprite-source.tsx src/components/realm/sprite-source.test.tsx src/components/realm/realm-shell.test.tsx
git commit -m "Villager figures and textures in the sprite pipeline"
```

---

### Task 3: Shared kingdom loader, bundle kingdom state, realm-context guard

**Files:**
- Modify: `src/lib/services/deeds.ts`, `src/lib/actions/deeds.ts`, `src/lib/actions/realm.ts`, `src/components/deed-player.tsx`, `src/components/realm/realm-shell.tsx`, `src/components/realm/realm-shell.test.tsx`
- Create: `src/lib/services/deeds.test.ts`

**Interfaces:**
- Consumes: `KingdomState` (Task 1).
- Produces: `loadHeroBand(childId)`, `loadKingdomOverview(childId): Promise<{ enabled; band; tone; buildings: BuildingOverview[] }>`, `buildKingdomOverview(progressRows, tone)` (pure, tested); `RealmBundle.kingdom: KingdomState`, `RealmBundle.kingdomError?: string`, `getRealmKingdom(childId): Promise<KingdomState>`; `startDeedRun(childId, deedId, context: "page" | "realm" = "page")`; `DeedPlayer.onFinished: (summary: RunSummary) => void`.

- [ ] **Step 1: Write the failing test for the pure overview builder**

Create `src/lib/services/deeds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildKingdomOverview } from "./deeds";
import { BUILDINGS } from "@/lib/utils/kingdom";

describe("buildKingdomOverview", () => {
  it("lists every building with progress, clamped, and tone-aware stories", () => {
    const gentle = buildKingdomOverview([{ buildingId: "well", deedsDone: 3 }, { buildingId: "bridge", deedsDone: 9 }], "gentle");
    expect(gentle.length).toBe(BUILDINGS.length);
    expect(gentle.find((b) => b.id === "well")).toMatchObject({ done: 3, total: 5, complete: false });
    expect(gentle.find((b) => b.id === "bridge")).toMatchObject({ done: 5, total: 5, complete: true });
    expect(gentle.find((b) => b.id === "mill")).toMatchObject({ done: 0, complete: false });
    const planks = gentle.find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    const monsters = buildKingdomOverview([], "monsters").find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    expect(planks.story).not.toBe(monsters.story);
    expect(monsters.story).toMatch(/Shadow blobs/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/services/deeds.test.ts`
Expected: FAIL (`buildKingdomOverview` is not exported).

- [ ] **Step 3: Write the service**

Replace `src/lib/services/deeds.ts` with:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { bandForHero, type ContentBand } from "@/lib/utils/content-bands";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { SkillArea } from "@/lib/utils/skills";
import type { GameIconName } from "@/components/game-icon";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};

export type HeroBand = { band: ContentBand; enabled: boolean; tone: "gentle" | "monsters" };

/** The hero's content band, Realm switch, and story tone; shared by the Deeds page and the Realm. */
export async function loadHeroBand(childId: string): Promise<HeroBand> {
  const rows = await db
    .select({ grade: schema.child.grade, ageMode: schema.child.ageMode })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) throw new Error("Hero not found.");
  const settings = await loadRealmSettings(childId);
  return { band: bandForHero(rows[0].grade, rows[0].ageMode), enabled: settings.enabled, tone: settings.toneMode };
}

/** Every building with its progress and deeds, from raw progress rows. Pure, so the shape is testable without a database. */
export function buildKingdomOverview(progress: { buildingId: string; deedsDone: number }[], tone: "gentle" | "monsters"): BuildingOverview[] {
  const doneBy = new Map(progress.map((p) => [p.buildingId, p.deedsDone]));
  return BUILDINGS.map((b) => {
    const { done, total, complete } = buildingProgress(doneBy.get(b.id) ?? 0, b);
    return {
      id: b.id, label: b.label, description: b.description, icon: b.icon, done, total, complete,
      deeds: deedsForBuilding(b.id).map((d) => ({ id: d.id, title: d.title, story: deedStory(d, tone), area: d.area })),
    };
  });
}

export async function loadKingdomOverview(childId: string): Promise<HeroBand & { buildings: BuildingOverview[] }> {
  const hero = await loadHeroBand(childId);
  const progress = await db
    .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone })
    .from(schema.kingdomProgress)
    .where(eq(schema.kingdomProgress.childId, childId));
  return { ...hero, buildings: buildKingdomOverview(progress, hero.tone) };
}
```

- [ ] **Step 4: Use the service in the deeds actions and add the realm-context guard**

In `src/lib/actions/deeds.ts`:

- Remove the private `loadHero` function and the now-unused imports (`bandForHero`, `BUILDINGS`, `buildingProgress`, `deedsForBuilding` if unused elsewhere in the file; keep `deedStory`, `findDeed`, `findBuilding`, `BAND_LABELS`, `ContentBand`).
- Add `import { loadHeroBand, loadKingdomOverview, type BuildingOverview } from "@/lib/services/deeds";` and `import { isChildActor, requireChildAccess } from "@/lib/auth/access";`, and `export type { BuildingOverview };`.
- Replace `getDeedsOverview` with:

```ts
export async function getDeedsOverview(childId: string): Promise<DeedsOverview> {
  await requireChildAccess(childId);
  const [kingdom, mastery] = await Promise.all([loadKingdomOverview(childId), loadMasteryRows(childId)]);
  return {
    enabled: kingdom.enabled, band: kingdom.band, bandLabel: BAND_LABELS[kingdom.band], tone: kingdom.tone,
    buildings: kingdom.buildings, mastery: mastery.map(masteryRow).filter((m): m is MasteryRow => m !== null),
  };
}
```

- Change `startDeedRun`'s head to:

```ts
const HERO_ONLY = "Deeds are for the hero to play.";

export async function startDeedRun(childId: string, deedId: string, context: "page" | "realm" = "page"): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  // In the world, only the hero plays; a parent previewing the Realm reads stories but never starts a run.
  if (context === "realm" && !isChildActor(access)) throw new Error(HERO_ONLY);
  const deed = findDeed(deedId);
  if (!deed) throw new Error("That deed is not in the chronicle.");
  const hero = await loadHeroBand(childId);
  if (!hero.enabled) throw new Error(CLOSED);
```

(the rest of the function is unchanged; every other `loadHero(` call in the file becomes `loadHeroBand(`).

This repo has no action-level test harness (no `src/lib/actions/*.test.ts`), so the guard is not unit-tested; it is exercised by the parent-preview browser pass in Task 7 and by `HERO_ONLY` matching the site card's copy.

- [ ] **Step 5: Bundle kingdom state and the kingdom action**

Replace `src/lib/actions/realm.ts` with:

```ts
"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadKingdomOverview } from "@/lib/services/deeds";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";

export type RealmBundle = {
  heroName: string;
  avatarConfig: AvatarConfig | null;
  castleType: string;
  kingdom: KingdomState;
  kingdomError?: string; // set when the kingdom could not load; the world still opens, without villagers
  profile: LearningProfile;
  settings: { enabled: boolean; toneMode: "gentle" | "monsters" };
};

const VILLAGERS_RESTING = "The villagers are resting. Try again.";

async function loadKingdomState(childId: string): Promise<KingdomState> {
  const overview = await loadKingdomOverview(childId);
  return { tone: overview.tone, buildings: overview.buildings };
}

/** The kingdom alone, for the HUD's retry after a failed bundle load. */
export async function getRealmKingdom(childId: string): Promise<KingdomState> {
  await requireChildAccess(childId);
  return loadKingdomState(childId);
}

/** Everything the Realm page needs, in one round of parallel reads. A hero may read their own. */
export async function getRealmBundle(childId: string): Promise<RealmBundle> {
  await requireChildAccess(childId);
  const [childRows, castleRows, profileRows, settings, kingdomResult] = await Promise.all([
    db.select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ type: schema.castle.type }).from(schema.castle).where(eq(schema.castle.childId, childId)).limit(1),
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
    loadRealmSettings(childId),
    loadKingdomState(childId).then((kingdom) => ({ kingdom, error: undefined as string | undefined })).catch(() => ({ kingdom: { tone: "gentle" as const, buildings: [] }, error: VILLAGERS_RESTING })),
  ]);
  const child = childRows[0];
  if (!child) throw new Error("Hero not found.");

  let avatarConfig: AvatarConfig | null = null;
  if (child.avatarConfig) {
    try {
      const parsed = JSON.parse(child.avatarConfig) as unknown;
      const normalized = normalizeAvatarConfig((parsed ?? {}) as Record<string, unknown>);
      avatarConfig = isValidAvatarConfig(normalized) ? normalized : null;
    } catch {
      avatarConfig = null; // a corrupt look falls back to the placeholder sprite, never a crash
    }
  }

  return {
    heroName: child.displayName,
    avatarConfig,
    castleType: castleRows[0]?.type ?? "campsite",
    kingdom: kingdomResult.kingdom,
    ...(kingdomResult.error ? { kingdomError: kingdomResult.error } : {}),
    profile: profileFromRow(profileRows[0] ?? null),
    settings: { enabled: settings.enabled, toneMode: settings.toneMode },
  };
}
```

- [ ] **Step 6: `DeedPlayer.onFinished(summary)` and the shell's interim layout call**

In `src/components/deed-player.tsx`: change the prop type to `onFinished: (summary: RunSummary) => void;` and the results render to `<DeedResults summary={summary} deedTitle={run.deed.title} onDone={() => onFinished(summary)} />`. `DeedPicker` passes `onFinished={() => {...}}`, which still typechecks.

In `src/components/realm/realm-shell.tsx`, replace the Task 1 interim memo with:

```ts
const layout = useMemo(() => buildWorldLayout({ castleType: bundle.castleType, buildings: bundle.kingdom.buildings }), [bundle.castleType, bundle.kingdom.buildings]);
```

In `src/components/realm/realm-shell.test.tsx`, replace `builtBuildingIds: []` in the `bundle` fixture with `kingdom: { tone: "gentle" as const, buildings: [] }`.

- [ ] **Step 7: Run everything**

Run: `npx vitest run` then `npm run typecheck` and `npx eslint src/lib/services/ src/lib/actions/ src/components/deed-player.tsx src/components/realm/`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/deeds.ts src/lib/services/deeds.test.ts src/lib/actions/deeds.ts src/lib/actions/realm.ts src/components/deed-player.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx
git commit -m "Shared kingdom loader, Realm bundle kingdom state, hero-only realm deeds"
```

---

### Task 4: Scene — foundations, villagers, reach, bubble, rise

**Files:**
- Modify: `src/components/realm/realm-scene.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `WorldLayout.villagers`, `Prop.tag`, `nearestVillager`, `REACH`, `villagerById` (Task 1); `SpriteTextures.villagers` (Task 2).
- Produces: `RealmScene` props `{ layout, textures, settings, axisRef, interactive: boolean, reachId: string | null, onReachChange: (id: string | null) => void, onTalk: (villagerId: string) => void, risingId: string | null }` (exported as `RealmSceneProps`). No test (never imported by tests); verified by typecheck, lint, build, and the browser pass in Task 7.

- [ ] **Step 1: Rewrite the scene**

Replace `src/components/realm/realm-scene.tsx` with:

```tsx
"use client";

import "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, type Prop, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import { nearestVillager, villagerById } from "@/lib/realm/villagers";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { SpriteTextures } from "./sprite-source";

export type RealmSceneProps = {
  layout: WorldLayout;
  textures: SpriteTextures;
  settings: RenderSettings;
  axisRef: RefObject<Vec2>;
  interactive: boolean; // false while a panel is open: ground taps are ignored
  reachId: string | null; // the villager the hero can talk to, as the shell last heard it
  onReachChange: (id: string | null) => void;
  onTalk: (villagerId: string) => void;
  risingId: string | null; // a building that just completed; the scene tweens it up once
};

const SPRITE_W = 1.5;
const SPRITE_H = 2;
export const RISE_MS = 900;
const CALM_FOUNDATION = "#5a5750";

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function World({ layout, textures, settings, axisRef, interactive, reachId, onReachChange, onTalk, risingId }: RealmSceneProps) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const reachRef = useRef<string | null>(null);
  const buildingMeshes = useRef(new Map<string, THREE.Mesh>());
  const rising = useRef<{ id: string; startedAt: number } | null>(null);

  // A completed building scales up from the ground once; with motion off it simply appears.
  useEffect(() => {
    if (!risingId) return;
    rising.current = settings.motion ? { id: risingId, startedAt: performance.now() } : null;
  }, [risingId, settings.motion]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // a tab that was hidden must not teleport the hero on return
    hero.current = stepHero(hero.current, { axis: axisRef.current ?? { x: 0, z: 0 } }, dt, layout.colliders);
    companion.current = stepCompanion(companion.current, hero.current, dt);
    camTarget.current = followCamera(camTarget.current, hero.current.position, dt, { reducedMotion: !settings.motion });
    const bob = settings.motion ? Math.sin(state.clock.elapsedTime * 3) * 0.05 : 0;
    const p = hero.current.position;
    if (heroSprite.current) {
      heroSprite.current.position.set(p.x, SPRITE_H / 2 + bob, p.z);
      heroSprite.current.scale.set(hero.current.facing === "w" ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
    }
    const c = companion.current.position;
    if (companionSprite.current) {
      companionSprite.current.position.set(c.x, SPRITE_H / 2 + bob * 0.5, c.z);
      companionSprite.current.scale.set(c.x > p.x ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
    }
    const t = camTarget.current;
    if (camera.current) {
      camera.current.position.set(t.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, t.z + CAMERA_OFFSET.z);
      camera.current.lookAt(t.x, 0, t.z);
    }
    // Reach is reported only when it changes, and outside the frame loop, so React never sets state mid-render.
    const near = nearestVillager(p, layout.villagers);
    if (near !== reachRef.current) {
      reachRef.current = near;
      queueMicrotask(() => onReachChange(near));
    }
    const r = rising.current;
    if (r) {
      const mesh = buildingMeshes.current.get(r.id);
      const k = Math.min(1, (performance.now() - r.startedAt) / RISE_MS);
      const s = 0.1 + 0.9 * easeOut(k);
      if (mesh) {
        mesh.scale.y = s;
        mesh.position.y = (mesh.userData.h as number) * (s - 1) / 2; // keep the base on the ground while it grows
      }
      if (k >= 1) rising.current = null;
    }
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";
  const colorFor = (prop: Prop) => (prop.kind === "foundation" && settings.calmPalette ? CALM_FOUNDATION : prop.color);
  const reachVillager = reachId ? villagerById(reachId) : null;
  const reachPlacement = reachId ? layout.villagers.find((v) => v.id === reachId) ?? null : null;

  return (
    <>
      <color attach="background" args={[sky]} />
      <OrthographicCamera ref={camera} makeDefault position={[CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z]} zoom={CAMERA_ZOOM} near={0.1} far={200} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 10, 5]} intensity={settings.calmPalette ? 0.5 : 0.8} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!interactive) return;
          hero.current = setTarget(hero.current, { x: e.point.x, z: e.point.z }, layout.colliders);
        }}
      >
        {/* Visual only: the ground plane is drawn larger than the playable world so its edge never shows past the backdrop. */}
        <planeGeometry args={[WORLD_SIZE * 3, WORLD_SIZE * 3]} />
        <meshStandardMaterial color={ground} />
      </mesh>
      {layout.props.filter((prop) => prop.kind !== "villager").map((prop) => (
        <group key={prop.id} position={[prop.position.x, prop.size.h / 2, prop.position.z]}>
          <mesh
            ref={(mesh) => {
              if (prop.kind !== "building") return;
              if (mesh) {
                mesh.userData.h = prop.size.h;
                buildingMeshes.current.set(prop.id, mesh);
              } else {
                buildingMeshes.current.delete(prop.id);
              }
            }}
          >
            <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
            <meshStandardMaterial color={colorFor(prop)} />
          </mesh>
          {prop.kind !== "path" && (
            <Html position={[0, prop.size.h / 2 + 0.6, 0]} center zIndexRange={[10, 0]}>
              <span className="realm-label">
                {prop.label}
                {prop.tag && <span className="realm-label-tag">{prop.tag}</span>}
              </span>
            </Html>
          )}
        </group>
      ))}
      {layout.villagers.map((v) => {
        const texture = textures.villagers[v.id];
        if (!texture) return null;
        return (
          <sprite key={v.id} position={[v.position.x, SPRITE_H / 2, v.position.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
            <spriteMaterial map={texture} transparent alphaTest={0.1} />
          </sprite>
        );
      })}
      {reachVillager && reachPlacement && interactive && (
        <Html position={[reachPlacement.position.x, SPRITE_H + 0.9, reachPlacement.position.z]} center zIndexRange={[15, 0]}>
          <div className="realm-bubble" role="group" aria-label={reachVillager.name}>
            <p className="realm-bubble-text">{reachVillager.greeting}</p>
            <button type="button" className="realm-bubble-talk" onClick={() => onTalk(reachVillager.id)}>Talk</button>
          </div>
        </Html>
      )}
      <sprite ref={heroSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
        <spriteMaterial map={textures.hero} transparent alphaTest={0.1} />
      </sprite>
      {textures.companion && (
        <sprite ref={companionSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z + 1.2]} scale={[SPRITE_W, SPRITE_H, 1]}>
          <spriteMaterial map={textures.companion} transparent alphaTest={0.1} />
        </sprite>
      )}
    </>
  );
}

export default function RealmScene(props: RealmSceneProps) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
      <World {...props} />
    </Canvas>
  );
}
```

Notes: the villager `Prop` entries exist for layout consumers (labels are not drawn for villagers; their name appears in the bubble). `mesh.userData.h` is set in the ref callback so the rise tween can keep the base grounded. If typecheck rejects `mesh.userData.h as number`, type it as `(mesh.userData as { h: number }).h`.

- [ ] **Step 2: Add the bubble and tag styles**

Append to the Realm block in `src/app/globals.css` (after `.realm-label`):

```css
.realm-label-tag { display: block; font-size: 10px; color: var(--gold-bright); }
.realm-bubble { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; max-width: 16rem; border-radius: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(0, 0, 0, 0.7); color: #fff; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: 12px; text-align: center; pointer-events: auto; }
.realm-bubble-text { margin: 0; }
.realm-bubble-talk { min-width: 44px; min-height: 44px; border-radius: 9999px; padding: 0 1rem; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font-weight: 700; cursor: pointer; }
```

- [ ] **Step 3: Update the shell to compile against the new props (interim)**

In `src/components/realm/realm-shell.tsx`'s `RealmOpen`, pass the new props with inert values for now (Task 6 wires them): `interactive={true} reachId={null} onReachChange={() => {}} onTalk={() => {}} risingId={null}` and `villagers={VILLAGERS}` on `SpriteSource` (import `VILLAGERS` from `@/lib/realm/villagers`).

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npx eslint src/components/realm/ && npm run build`
Expected: clean; build succeeds with `/realm`.

- [ ] **Step 5: Commit**

```bash
git add src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/app/globals.css
git commit -m "Realm scene: foundations, villagers, reach bubble, rise tween"
```

---

### Task 5: Site card, deed panel, paused clock, disabled input

**Files:**
- Create: `src/components/realm/site-card.tsx`, `src/components/realm/site-card.test.tsx`, `src/components/realm/deed-panel.tsx`, `src/components/realm/deed-panel.test.tsx`
- Modify: `src/components/realm/use-play-clock.ts`, `src/components/realm/use-play-clock.test.ts`, `src/components/realm/use-realm-input.ts`, `src/components/realm/use-realm-input.test.ts`, `src/app/globals.css`

**Interfaces:**
- Consumes: `BuildingOverview`, `Villager`, `startDeedRun(childId, deedId, "realm")`, `DeedPlayer`, `RunSummary`, `RunStart`.
- Produces: `SiteCard({ villager, building, preview, busy, error, onBegin, onClose })`; `DeedPanel({ childId, villager, building, profile, calm, preview, onFinished, onClose })` (owns start → play → results); `usePlayClock({ ..., paused })`; `useRealmInput({ enabled })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/realm/site-card.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SiteCard } from "./site-card";
import { VILLAGERS } from "@/lib/realm/villagers";

afterEach(cleanup);

const building = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const,
  done: 2, total: 5, complete: false,
  deeds: [
    { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const },
    { id: "well-signs", title: "Signs for the Well", story: "The well needs a sign every traveler can read.", area: "reading" as const },
  ],
};

describe("SiteCard", () => {
  it("shows the villager, progress, and each deed with a Begin button", () => {
    const onBegin = vi.fn();
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={onBegin} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    expect(screen.getByText("Old Bram's bucket keeps coming up dry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Begin Signs for the Well" }));
    expect(onBegin).toHaveBeenCalledWith("well-signs");
  });

  it("says Built for a complete site and still lists its deeds", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={{ ...building, done: 5, complete: true }} preview={false} busy={false} error="" onBegin={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Built")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Begin / }).length).toBe(2);
  });

  it("hides Begin in preview and explains why", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={true} busy={false} error="" onBegin={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Begin / })).not.toBeInTheDocument();
    expect(screen.getByText("Deeds are for the hero to play.")).toBeInTheDocument();
  });

  it("closes on the Close button and on Escape, and shows an error with retry", () => {
    const onClose = vi.fn();
    const onBegin = vi.fn();
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="No deeds are ready for this hero yet." onBegin={onBegin} onClose={onClose} />);
    expect(screen.getByText("No deeds are ready for this hero yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

Create `src/components/realm/deed-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeedPanel } from "./deed-panel";
import { VILLAGERS } from "@/lib/realm/villagers";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

const startDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: (...a: unknown[]) => startDeedRun(...a),
  answerDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/components/deed-player", () => ({
  DeedPlayer: ({ run, onFinished }: { run: { deed: { title: string } }; onFinished: (s: unknown) => void }) => (
    <div>
      <p>Playing {run.deed.title}</p>
      <button type="button" onClick={() => onFinished({ building: { label: "Village Well", done: 5, total: 5, complete: true } })}>finish</button>
    </div>
  ),
}));

const building = {
  id: "well", label: "Village Well", description: "", icon: "box" as const, done: 4, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Dry again.", area: "math" as const }],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DeedPanel", () => {
  it("starts a run in the realm context on Begin, plays it, and reports the summary with the building id", async () => {
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const onFinished = vi.fn();
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={onFinished} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(startDeedRun).toHaveBeenCalledWith("c1", "well-stones", "realm");
    fireEvent.click(screen.getByRole("button", { name: "finish" }));
    expect(onFinished).toHaveBeenCalledWith("well", { label: "Village Well", done: 5, total: 5, complete: true });
  });

  it("shows a start failure in the card with the card still open", async () => {
    startDeedRun.mockRejectedValue(new Error("No deeds are ready for this hero yet."));
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("No deeds are ready for this hero yet.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers Leave the deed while playing and closes on it", async () => {
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const onClose = vi.fn();
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    await screen.findByText("Playing Count the Well Stones");
    fireEvent.click(screen.getByRole("button", { name: "Leave the deed" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

Append to `src/components/realm/use-play-clock.test.ts` (inside the describe):

```ts
  it("counts nothing while paused and refreshes access once when unpaused", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    const onClose = vi.fn();
    const { result, rerender } = renderHook(({ paused }) => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose, paused }), { initialProps: { paused: true } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.warning).toBe(false);
    expect(result.current.minutesRemaining).toBe(1);

    rerender({ paused: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("school_hours");
  });
```

Append to `src/components/realm/use-realm-input.test.ts` (inside the describe; match the file's existing helper style for dispatching key events):

```ts
  it("ignores keys and clears held ones while disabled", () => {
    const { result, rerender } = renderHook(({ enabled }) => useRealmInput({ enabled }), { initialProps: { enabled: true } });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(result.current.axisRef.current.x).not.toBe(0);
    rerender({ enabled: false });
    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
    rerender({ enabled: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(result.current.axisRef.current.x).not.toBe(0);
  });
```

Existing calls `useRealmInput()` in that test file stay valid because the option is optional.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/realm/`
Expected: FAIL (missing modules / options).

- [ ] **Step 3: Pause the clock**

In `src/components/realm/use-play-clock.ts`: add `paused = false` to the options (`paused?: boolean;` in the type) and a ref for the pending refresh:

```ts
  const pausedRef = useRef(paused);
  const refreshOnResumeRef = useRef(false);
  // Refs change in an effect, never during render (the React Compiler rejects render-time ref writes).
  useEffect(() => {
    if (pausedRef.current && !paused) refreshOnResumeRef.current = true; // leaving a pause: check the gate on the next tick
    pausedRef.current = paused;
  }, [paused]);
```

(these lines sit after `closeRef.current = onClose;`). Add a `refresh` callback next to `settle`:

```ts
  const refresh = useCallback(async () => {
    try {
      const date = localDateOf(new Date());
      const access = await getRealmAccess(childId, date, currentTimeOfDay());
      const applied = applyAccess(clockRef.current, access);
      clockRef.current = applied.clock;
      setClock(applied.clock);
      if (applied.event === "warn") setWarning(true);
      if (applied.clock.minutesRemaining > 1) setWarning(false);
      if (applied.event === "close") closeRef.current(access.allowed ? "no_minutes" : access.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
    }
  }, [childId]);
```

and in the interval callback, before the `tickClock` call:

```ts
      if (pausedRef.current) return; // a deed is running: no seconds, no records, no warnings
      if (refreshOnResumeRef.current) {
        refreshOnResumeRef.current = false;
        void refresh();
        return;
      }
```

Add `refresh` to the effect's dependency array. Also reuse `refresh`'s body inside `settle` if you like, but keep `settle`'s pending semantics unchanged.

- [ ] **Step 4: Disable input**

In `src/components/realm/use-realm-input.ts`: change the signature to `export function useRealmInput({ enabled = true }: { enabled?: boolean } = {})`. In the effect, add `if (!enabled) { keys.current.clear(); stick.current = { x: 0, y: 0 }; recompute(); return; }` as the first statement (before adding listeners) and add `enabled` to the dependency array. Because the effect re-runs on `enabled` changes, listeners detach while disabled and reattach after.

- [ ] **Step 5: Site card**

Create `src/components/realm/site-card.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";

export const HERO_ONLY = "Deeds are for the hero to play.";

export function SiteCard({
  villager,
  building,
  preview,
  busy,
  error,
  onBegin,
  onClose,
}: {
  villager: Villager;
  building: BuildingOverview;
  preview: boolean;
  busy: boolean;
  error: string;
  onBegin: (deedId: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `site-${building.id}-title`;

  // Focus lands on the panel when it opens so Escape and Tab work at once.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      ref={panel}
      className="realm-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="realm-panel-head">
        <GameIcon name={building.icon} className="size-6 text-[var(--gold-bright)]" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-bold">{villager.name}</h2>
          <p className="text-sm text-muted-foreground">{villager.greeting}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="realm-panel-progress">
        <span className="font-medium">{building.label}</span>
        <span className="text-xs text-muted-foreground">{building.complete ? "Built" : `${building.done} of ${building.total}`}</span>
      </div>
      <div className="xp-bar-track"><div className="xp-bar-fill" style={{ width: `${(building.done / building.total) * 100}%` }} /></div>
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}
      <ul className="realm-panel-deeds">
        {building.deeds.map((d) => (
          <li key={d.id} className="realm-panel-deed">
            <div className="min-w-0">
              <p className="text-sm font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">{d.story}</p>
            </div>
            {preview ? null : (
              <Button size="sm" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => onBegin(d.id)}>Begin</Button>
            )}
          </li>
        ))}
      </ul>
      {preview && <p className="text-sm text-muted-foreground">{HERO_ONLY}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Deed panel**

Create `src/components/realm/deed-panel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeedPlayer } from "@/components/deed-player";
import { startDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { SiteCard } from "./site-card";

/**
 * The overlay a villager opens: the site card first, then the deed itself,
 * then its results. The world underneath is paused by the shell while this
 * is mounted; leaving mid-deed is safe because an unfinished run resumes
 * within the hour.
 */
export function DeedPanel({
  childId,
  villager,
  building,
  profile,
  calm,
  preview,
  onFinished,
  onClose,
}: {
  childId: string;
  villager: Villager;
  building: BuildingOverview;
  profile: ProfileLike;
  calm: boolean;
  preview: boolean;
  onFinished: (buildingId: string, result: RunSummary["building"]) => void;
  onClose: () => void;
}) {
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  // Keep Tab inside the panel while it is open; the world's controls are disabled meanwhile.
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [run]);

  async function begin(deedId: string) {
    setBusy(true);
    setError("");
    try {
      setRun(await startDeedRun(childId, deedId, "realm"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={panel} className="realm-overlay">
      {run ? (
        <div className="realm-panel" role="dialog" aria-modal="true" aria-label={run.deed.title} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
          <div className="realm-panel-head">
            <span className="text-sm text-muted-foreground">{villager.name}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Leave the deed</Button>
          </div>
          <DeedPlayer childId={childId} run={run} profile={profile} calm={calm} onFinished={(summary) => onFinished(building.id, summary.building)} />
        </div>
      ) : (
        <SiteCard villager={villager} building={building} preview={preview} busy={busy} error={error} onBegin={begin} onClose={onClose} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Panel styles**

Append to the Realm block in `src/app/globals.css`:

```css
.realm-overlay { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 1rem; background: rgba(0, 0, 0, 0.55); overflow-y: auto; }
.realm-panel { width: min(36rem, 100%); max-height: calc(100vh - 2rem); overflow-y: auto; border-radius: 1rem; border: 1px solid var(--gold-border); background: var(--background, #0f1626); color: var(--foreground, #fff); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; outline: none; }
.realm-panel-head { display: flex; align-items: center; gap: 0.75rem; }
.realm-panel-progress { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.realm-panel-deeds { display: flex; flex-direction: column; gap: 0.5rem; list-style: none; margin: 0; padding: 0; }
.realm-panel-deed { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid var(--gold-dim, rgba(201, 168, 76, 0.3)); padding: 0.5rem 0.75rem; }
.realm-panel button { min-height: 44px; }
```

Check the existing theme variable names in the `@theme` block at the top of `globals.css` (`--background`, `--foreground`, `--gold-dim`) and use the ones that exist; the fallbacks above cover a missing one.

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `npx vitest run src/components/realm/` then `npm run typecheck` and `npx eslint src/components/realm/`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/realm/site-card.tsx src/components/realm/site-card.test.tsx src/components/realm/deed-panel.tsx src/components/realm/deed-panel.test.tsx src/components/realm/use-play-clock.ts src/components/realm/use-play-clock.test.ts src/components/realm/use-realm-input.ts src/components/realm/use-realm-input.test.ts src/app/globals.css
git commit -m "Realm site card and deed panel; paused clock and disabled input while a deed runs"
```

---

### Task 6: Shell integration — reach, panel, kingdom state, toast, kingdom retry

**Files:**
- Modify: `src/components/realm/realm-shell.tsx`, `src/components/realm/realm-shell.test.tsx`, `src/components/realm/realm-hud.tsx`, `src/components/realm/realm-hud.test.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `getRealmKingdom` (Task 3).
- Produces: `RealmHud` props `paused: boolean`, `toast: string | null`, `kingdomError: string`, `onKingdomRetry: () => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/realm/realm-hud.test.tsx`:

```tsx
  it("marks the counter paused and shows a toast", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." kingdomError="" onKingdomRetry={() => {}} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
  });

  it("shows the kingdom error with its own retry", () => {
    const onKingdomRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="The villagers are resting. Try again." onKingdomRetry={onKingdomRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Wake the villagers" }));
    expect(onKingdomRetry).toHaveBeenCalled();
  });
```

(add `vi` and `fireEvent` to that file's imports if missing; existing `RealmHud` renders in the file need the four new props added: `paused={false} toast={null} kingdomError="" onKingdomRetry={() => {}}`).

Update `src/components/realm/realm-shell.test.tsx`:

- Extend the scene mock so tests can drive reach and Talk:

```tsx
let sceneProps: Record<string, unknown> = {};
vi.mock("./realm-scene", () => ({
  default: (props: Record<string, unknown>) => {
    sceneProps = props;
    return <div data-testid="scene" data-interactive={String(props.interactive)} data-rising={String(props.risingId ?? "")} />;
  },
}));
```

- Mock the deeds actions and the deed player:

```tsx
const startDeedRun = vi.fn();
const getRealmKingdom = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: (...a: unknown[]) => startDeedRun(...a), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: (...a: unknown[]) => getRealmKingdom(...a) }));
vi.mock("@/components/deed-player", () => ({
  DeedPlayer: ({ run, onFinished }: { run: { deed: { title: string } }; onFinished: (s: unknown) => void }) => (
    <div>
      <p>Playing {run.deed.title}</p>
      <button type="button" onClick={() => onFinished({ correctCount: 8, total: 8, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 5, total: 5, complete: true } })}>finish</button>
    </div>
  ),
}));
```

- Give the fixture a kingdom with the well at 4 of 5:

```tsx
const well = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 4, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};
const bundle = { heroName: "Lily", avatarConfig: DEFAULT_AVATAR, castleType: "campsite", kingdom: { tone: "gentle" as const, buildings: [well] }, profile: DEFAULT_LEARNING_PROFILE, settings: { enabled: true, toneMode: "gentle" as const } };
```

- Add these tests (inside the describe; `act` and `waitFor` imported from `@testing-library/react`):

```tsx
  it("opens the site card from a villager in reach, pauses the clock, and raises the building on completion", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const user = userEvent.setup();
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("4 of 5")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "false");
    expect(screen.getByText("12 min left · paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(startDeedRun).toHaveBeenCalledWith("c1", "well-stones", "realm");
    await user.click(screen.getByRole("button", { name: "finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "true");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-rising", "well");
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
    expect(screen.getByText("12 min left")).toBeInTheDocument();
    const layout = sceneProps.layout as { props: { id: string; kind: string; tag?: string }[] };
    expect(layout.props.find((p) => p.id === "well")).toMatchObject({ kind: "building", tag: "Built" });
  });

  it("lets a parent read a site card without a Begin button", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Begin / })).not.toBeInTheDocument();
    expect(screen.getByText("Deeds are for the hero to play.")).toBeInTheDocument();
    expect(startDeedRun).not.toHaveBeenCalled();
  });

  it("opens the world without villagers when the kingdom failed to load, and retries from the HUD", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    getRealmKingdom.mockResolvedValue({ tone: "gentle", buildings: [well] });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("The villagers are resting. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Wake the villagers" }));
    await waitFor(() => expect(screen.queryByText("The villagers are resting. Try again.")).not.toBeInTheDocument());
    const layout = sceneProps.layout as { props: { id: string; tag?: string }[] };
    expect(layout.props.find((p) => p.id === "well")!.tag).toBe("4 of 5");
  });
```

Note: with an empty `buildings` array the layout still shows every site at "0 of N" (villagers are always placed). "Without villagers" in the spec means without kingdom data; the assertion checks the retry patched progress in.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/realm/realm-shell.test.tsx src/components/realm/realm-hud.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Extend the HUD**

In `src/components/realm/realm-hud.tsx`, add the props `paused: boolean; toast: string | null; kingdomError: string; onKingdomRetry: () => void;` and render:

- the minutes as `{minutesRemaining} min left{paused ? " · paused" : ""}` inside the existing span;
- after the error paragraph: `{kingdomError && (<p className="realm-hud-error">{kingdomError} <Button size="xs" variant="ghost" onClick={onKingdomRetry}>Wake the villagers</Button></p>)}`;
- after that: `{toast && <p className="realm-hud-toast" role="status">{toast}</p>}`.

- [ ] **Step 4: Wire the shell**

Replace `RealmOpen` in `src/components/realm/realm-shell.tsx` with:

```tsx
function RealmOpen({
  bundle,
  childId,
  isChildView,
  isTouch,
  minutes,
  note,
  onClose,
  selector,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  isTouch: boolean;
  minutes: number;
  note: string | null;
  onClose: (reason: CloseReason) => void;
  selector?: React.ReactNode;
}) {
  const [textures, setTextures] = useState<SpriteTextures | null>(null);
  const [spriteError, setSpriteError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [kingdom, setKingdom] = useState<KingdomState>(bundle.kingdom);
  const [kingdomError, setKingdomError] = useState(bundle.kingdomError ?? "");
  const [reachId, setReachId] = useState<string | null>(null);
  const [openVillagerId, setOpenVillagerId] = useState<string | null>(null);
  const [risingId, setRisingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // See slice 4: the world portals to document.body so the app banner and nav never cover it.
  const [portalTarget] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.body));
  const layout = useMemo(() => buildWorldLayout({ castleType: bundle.castleType, buildings: kingdom.buildings }), [bundle.castleType, kingdom.buildings]);
  const settings = renderSettingsFor(bundle.profile, isTouch);
  const panelOpen = openVillagerId !== null;
  const { axisRef, setStick } = useRealmInput({ enabled: !panelOpen });
  const config = bundle.avatarConfig ?? DEFAULT_AVATAR;
  const clock = usePlayClock({ enabled: isChildView, childId, initialMinutes: minutes, onClose, paused: panelOpen });
  const onReady = useCallback((t: SpriteTextures) => setTextures(t), []);
  const onError = useCallback((e: Error) => setSpriteError(e.message), []);
  const onReachChange = useCallback((id: string | null) => setReachId(id), []);
  const onTalk = useCallback((id: string) => setOpenVillagerId(id), []);

  // Enter or Space talks to the villager in reach when no panel is open.
  useEffect(() => {
    if (panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if ((e.key === "Enter" || e.key === " ") && reachId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setOpenVillagerId(reachId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, reachId]);

  // The rise toast clears itself; the timer is the only place that clears it.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // The latest kingdom, readable from event handlers without a stale closure and without side effects in an updater.
  const kingdomRef = useRef(kingdom);
  useEffect(() => {
    kingdomRef.current = kingdom;
  }, [kingdom]);

  const onDeedFinished = useCallback((buildingId: string, result: { done: number; total: number; complete: boolean }) => {
    const applied = applyDeedResult(kingdomRef.current, buildingId, result);
    kingdomRef.current = applied.state;
    setKingdom(applied.state);
    if (applied.rose) {
      const label = applied.state.buildings.find((b) => b.id === buildingId)?.label ?? "building";
      setRisingId(buildingId);
      setToast(`The ${label} stands.`);
    }
    setOpenVillagerId(null);
  }, []);

  const onKingdomRetry = useCallback(() => {
    getRealmKingdom(childId)
      .then((k) => {
        setKingdom(k);
        setKingdomError("");
      })
      .catch(() => setKingdomError(VILLAGERS_RESTING));
  }, [childId]);

  const openVillager = openVillagerId ? villagerById(openVillagerId) : null;
  const openBuilding = openVillager ? kingdom.buildings.find((b) => b.id === openVillager.buildingId) ?? null : null;
  const calm = bundle.profile.reducedMotion || bundle.profile.lowStimulus;

  if (!portalTarget) return null;

  return createPortal(
    <div className="realm-root" {...readingAttributes(bundle.profile)}>
      <SpriteSource key={retryKey} config={config} villagers={VILLAGERS} onReady={onReady} onError={onError} />
      {textures && (
        <RealmScene
          layout={layout}
          textures={textures}
          settings={settings}
          axisRef={axisRef}
          interactive={!panelOpen}
          reachId={reachId}
          onReachChange={onReachChange}
          onTalk={onTalk}
          risingId={risingId}
        />
      )}
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        warning={clock.warning}
        preview={isChildView ? null : { note }}
        hudScale={settings.hudScale}
        error={spriteError || clock.error}
        selector={selector}
        paused={panelOpen}
        toast={toast}
        kingdomError={kingdomError}
        onKingdomRetry={onKingdomRetry}
        onRetry={() => {
          setSpriteError("");
          clock.clearError();
          setRetryKey((k) => k + 1);
          void clock.flushPending();
        }}
      />
      {settings.showStick && !panelOpen && <TouchStick onChange={setStick} />}
      {openVillager && openBuilding && (
        <DeedPanel
          childId={childId}
          villager={openVillager}
          building={openBuilding}
          profile={bundle.profile}
          calm={calm}
          preview={!isChildView}
          onFinished={onDeedFinished}
          onClose={() => setOpenVillagerId(null)}
        />
      )}
    </div>,
    portalTarget
  );
}
```

Add the imports: `useRef` to the React import, `import { getRealmKingdom, type RealmBundle } from "@/lib/actions/realm";` (replacing the type-only import), `import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";`, `import { VILLAGERS, villagerById } from "@/lib/realm/villagers";`, `import { DeedPanel } from "./deed-panel";`, and `const VILLAGERS_RESTING = "The villagers are resting. Try again.";`.

If a site's building is missing from `kingdom.buildings` (kingdom failed to load), `openBuilding` is null and Talk does nothing visible; that is acceptable because the HUD already shows the kingdom error with its retry.

- [ ] **Step 5: Toast style**

Append to the Realm block in `src/app/globals.css`:

```css
.realm-hud-toast { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(201, 168, 76, 0.25); border: 1px solid var(--gold-border); color: var(--gold-bright); font-weight: 700; font-size: 0.95em; animation: realm-toast-in 300ms ease-out; }
@keyframes realm-toast-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .realm-hud-toast { animation: none; } }
```

- [ ] **Step 6: Run tests, typecheck, lint, build**

Run: `npx vitest run` then `npm run typecheck`, `npx eslint src/components/realm/ src/app/globals.css`, `npm run build`
Expected: all pass; `/realm` builds.

- [ ] **Step 7: Commit**

```bash
git add src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/app/globals.css
git commit -m "Realm shell: villagers open deeds, clock pauses, buildings rise"
```

---

### Task 7: Final verification and the browser pass

**Files:** none new in the repo (screenshots land in the scratchpad).

- [ ] **Step 1: Full gate** — `npm run typecheck && npx vitest run`; `npm run lint` shows only the pre-existing error.

- [ ] **Step 2: Bundle isolation unchanged** — `npm run build`, then `grep -l WebGLRenderer .next/static/chunks/*.js`; every listed chunk must be referenced only from `.next/server/app/(app)/realm/page/react-loadable-manifest.json` (not the client-reference manifest). `site-card.tsx`, `deed-panel.tsx`, and `deed-player.tsx` must not pull `three` into the eager graph.

- [ ] **Step 3: Browser pass** — Start `PORT=3111 npm run dev` in the background with `DEMO_MODE=true`. Insert a temporary `realm_play_ledger` row (`id 'sdd-browser-pass'`, `demo-child-1`, today's local date, `earned`, 10 minutes) so the hero's gate opens. With the local headless Chromium (see the project memory note on Chromium libs and the `realm-pass.mjs` pattern in the scratchpad), as `demo_persona=lily`: open `/realm`, walk to the well (villager stands at about x −5, z 11; from spawn (0, 15) hold `a` then `w`, or click the ground near (−5, 12)), confirm the bubble with "Talk" appears, click Talk, confirm the site card shows "Old Bram" and "0 of 5", click Begin on the first deed, answer all questions (click the first choice each time, then Next), click Done, and screenshot. Record: whether the clock read "· paused" during the deed, the results text, and whether the foundation tag changed to "1 of 5". Then as `demo_persona=parent` with `?child=demo-child-1`: walk to the well, Talk, confirm no Begin button and the "Deeds are for the hero to play." line. Delete the temporary ledger row and any `deed_run` rows created for `demo-child-1` during the pass, reset that hero's `kingdom_progress` and `skill_mastery` rows touched by the pass (note the ids before and after), and stop the dev server.

- [ ] **Step 4: Spec walk** — A sites/villagers/reach/reducer/rise → Tasks 1, 4; B bubble/site card/deed panel/pause/results/preview → Tasks 4, 5, 6; C bundle/actions/errors/copy → Tasks 3, 5, 6; D tests → Tasks 1–6. Anything missing is a new task.

- [ ] **Step 5: Hand off** — `superpowers:finishing-a-development-branch` (the branch now carries slices 1–5).
