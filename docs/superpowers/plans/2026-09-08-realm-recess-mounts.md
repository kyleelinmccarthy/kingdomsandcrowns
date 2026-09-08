# Realm: Recess and Mounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mount catalog that unlocks like spell parts and equips through the avatar, let the hero ride it faster around the Realm, and give recess something to do: gleams to collect and a lap ring, tallied for the session.

**Architecture:** Mounts are catalog items plus two avatar-config fields (no migration), validated and unlocked through the existing avatar paths. Riding is a `mounted` flag on the hero state with a speed parameter in `stepHero`. Recess play is a pure module (`src/lib/realm/recess/`) stepped from refs in the scene's frame loop, drawn by a pooled `RecessLayer`, and reported to React through `queueMicrotask` events; it is active exactly when the play clock's access source is `recess`.

**Tech Stack:** Next.js 16, React 19, three 0.185 / @react-three/fiber 9.7 / drei 10.7, Drizzle, Vitest + Testing Library (jsdom, no WebGL).

**Spec:** `docs/superpowers/specs/2026-09-08-realm-recess-mounts-design.md`

## Global Constraints

- Mount ids are disjoint from every companion id (the unlock table is keyed by item id alone). Ids: `pony`, `donkey`, `goat`, `stag`, `boar`, `direwolf`, `gryphon`, `wyrm` (the spec's `wolf`/`griffin`/`dragon` collide with companions and are renamed here; labels Direwolf, Gryphon, Wyrm). Speeds 4.5, 4.2, 4.8, 5.5, 5.2, 5.8, 6.5, 7; unlocks free, free, level 3, level 8, badge `badge-streak-7` "Week Warrior", level 15, quest, quest. Walking stays `HERO_SPEED = 3.5`.
- `AvatarConfig.mount: string | null`, `mountColor` default `"#8b5e3c"`; unlock category `mount`; category label "Mount"; Loot line "Mounts: {n} of 8"; Chronicle line "Rides: {label}".
- Copy verbatim: "Ride", "Dismount", "Dismount to cast.", "A gleam! {n} so far.", "Lap done: {t} s!", "Gleams: {n}", "Laps: {n}", "Best {t} s", "Recess!", customizer tab "Mount". Times with one decimal.
- Numbers: `COMPANION_GAP_MOUNTED = 2.0`; `GLEAM_COUNT = 12`, `GLEAM_COUNT_LOW = 6`, `GLEAM_RADIUS = 0.8`, `GLEAM_RESPAWN_MS = 10_000`, `WAYPOINT_RADIUS = 2`, eight `LAP_WAYPOINTS`, `LAP_START = SPAWN`; gleams spawn on walkable ground ≥ 1 unit outside colliders, ≥ 2 from villagers and path tiles, ≥ 3 from spawn; the lap timer runs continuously.
- Recess active exactly when the last access result's `source === "recess"` and the viewer is the hero; parents never collect; nothing is written to the server during play; a mounted hero cannot cast.
- Reduced motion: no gleam bob or burst, static markers; low stimulus: `GLEAM_COUNT_LOW` and no running lap timer in the HUD; larger text reaches the new HUD fields through `hudScale`.
- Pure logic with colocated tests first; three.js runtime imports only in `realm-scene.tsx`, `spell-layer.tsx`, and the new `recess-layer.tsx`; no synchronous setState in effects; discrete scene events via `queueMicrotask`; no `any`, no `eslint-disable`; `"use server"` files export only async functions and declared types.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Known pre-existing lint error in `src/components/quest-template-list.tsx` is accepted.

---

### Task 1: Mount catalog, avatar config fields, unlocks, Loot and Chronicle lines

**Files:**
- Modify: `src/lib/utils/avatar-catalog.ts`, `src/lib/utils/avatar-catalog.test.ts`, `src/lib/actions/avatar.ts`, `src/app/(app)/loot/page.tsx`, `src/app/(app)/settings/child-list.tsx`

**Interfaces:**
- Produces: `MountItem = AvatarItem & { speed: number }`, `MOUNTS`, `MOUNT_COLORS`, `findMount(id): MountItem | null`; `AvatarConfig.mount`, `AvatarConfig.mountColor`; category `mount` in the reward flow; `updateAvatarConfig` validates the mount's unlock.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/avatar-catalog.test.ts` (extend the import line with `MOUNTS, COMPANIONS, findMount, normalizeAvatarConfig, isValidAvatarConfig, DEFAULT_AVATAR`):

```ts
describe("mounts", () => {
  it("has eight mounts with unique ids that never collide with companion ids", () => {
    expect(MOUNTS.length).toBe(8);
    const ids = MOUNTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(8);
    const companionIds = new Set(COMPANIONS.map((c) => c.id));
    for (const id of ids) expect(companionIds.has(id)).toBe(false);
    expect(findMount("pony")).toMatchObject({ label: "Pony", speed: 4.5, unlock: { type: "free" } });
    expect(findMount("nope")).toBeNull();
    for (const m of MOUNTS) expect(m.speed).toBeGreaterThan(3.5);
  });
  it("lists the quest mounts under the mount category and labels them", () => {
    const entries = getQuestUnlockableItems().filter((e) => e.category === "mount").map((e) => e.item.id).sort();
    expect(entries).toEqual(["gryphon", "wyrm"]);
    expect(getRewardItemLabel(JSON.stringify({ category: "mount", itemId: "pony" }))).toBe("Mount: Pony");
    expect(getCategoryLabel("mount")).toBe("Mount");
  });
  it("normalises and validates the mount fields", () => {
    const bare = normalizeAvatarConfig({});
    expect(bare.mount).toBeNull();
    expect(bare.mountColor).toBe("#8b5e3c");
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: "pony", mountColor: "#123456" })).toBe(true);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: "nope" })).toBe(false);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/avatar-catalog.test.ts`
Expected: FAIL (`MOUNTS` not exported).

- [ ] **Step 3: Catalog and config**

In `src/lib/utils/avatar-catalog.ts`:
- `AvatarConfig` gains `mount: string | null;` and `mountColor: string;` after `companionColor`. `DEFAULT_AVATAR` gains `mount: null, mountColor: "#8b5e3c"`. `normalizeAvatarConfig` gains `mount: (raw.mount as string) ?? null, mountColor: (raw.mountColor as string) ?? DEFAULT_AVATAR.mountColor`.
- After `COMPANIONS`, add:

```ts
// ── Mounts ───────────────────────────────────────────────────

/** A mount carries the hero through the Realm faster than walking (HERO_SPEED 3.5). Ids never overlap companion ids. */
export type MountItem = AvatarItem & { speed: number };

export const MOUNTS: MountItem[] = [
  { id: "pony", label: "Pony", speed: 4.5, unlock: { type: "free" } },
  { id: "donkey", label: "Donkey", speed: 4.2, unlock: { type: "free" } },
  { id: "goat", label: "Goat", speed: 4.8, unlock: { type: "level", level: 3 } },
  { id: "stag", label: "Stag", speed: 5.5, unlock: { type: "level", level: 8 } },
  { id: "boar", label: "Boar", speed: 5.2, unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" } },
  { id: "direwolf", label: "Direwolf", speed: 5.8, unlock: { type: "level", level: 15 } },
  { id: "gryphon", label: "Gryphon", speed: 6.5, unlock: { type: "quest" } },
  { id: "wyrm", label: "Wyrm", speed: 7, unlock: { type: "quest" } },
];

export const MOUNT_COLORS: ColorOption[] = SHARED_COLORS;

export function findMount(id: string): MountItem | null {
  return MOUNTS.find((m) => m.id === id) ?? null;
}
```

- In `getQuestUnlockableItems`, add `for (const item of MOUNTS) { if (item.unlock.type === "quest") items.push({ category: "mount", item }); }` after the companions loop.
- `CATEGORY_LABELS` gains `mount: "Mount"`; `CATEGORY_ITEMS` gains `mount: MOUNTS`.
- `isValidAvatarConfig`: add `const validMount = c.mount === null || c.mount === undefined || MOUNTS.some((m) => m.id === c.mount);` and `const validMountColor = c.mountColor === undefined || isHex(c.mountColor);` and include both in the returned conjunction.

- [ ] **Step 4: Save validation, Loot, Chronicle**

- `src/lib/actions/avatar.ts` (`updateAvatarConfig`): import `MOUNTS`; add `const mountItem = config.mount ? MOUNTS.find((m) => m.id === config.mount) : null;` and include `mountItem` in the `items` array that is checked with `isUnlocked`.
- `src/app/(app)/loot/page.tsx`: import `getChildAvatarUnlocks` from `@/lib/actions/avatar` and `MOUNTS, isUnlocked` from the catalog; add `getChildAvatarUnlocks(activeChild.id)` to the `Promise.all` (as `avatarUnlocks`); compute `const questUnlockedSet = new Set(avatarUnlocks.map((u) => u.itemId)); const mountsUnlocked = MOUNTS.filter((m) => isUnlocked(m, level, [...earnedIds], questUnlockedSet)).length;`; in the Spellbook `GameFrame`'s paragraph append ` · Mounts: {mountsUnlocked} of {MOUNTS.length}` (use `&middot;` like the existing text).
- `src/app/(app)/settings/child-list.tsx`: where the hero card renders `<Avatar config={config} name={child.displayName} size="lg" />` (around line 902), add below it `{config.mount && <p className="text-xs text-muted-foreground">Rides: {findMount(config.mount)?.label ?? config.mount}</p>}` (import `findMount`).

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run src/lib/utils/ src/components/` then `npm run typecheck` and `npx eslint src/lib/utils/avatar-catalog.ts src/lib/actions/avatar.ts "src/app/(app)/loot/page.tsx" "src/app/(app)/settings/child-list.tsx"`
Expected: pass. Existing tests that build `AvatarConfig` objects via `DEFAULT_AVATAR` spreads keep passing; any test that constructs a full `AvatarConfig` literal must add the two fields.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/avatar-catalog.ts src/lib/utils/avatar-catalog.test.ts src/lib/actions/avatar.ts "src/app/(app)/loot/page.tsx" "src/app/(app)/settings/child-list.tsx"
git commit -m "Mount catalog, avatar mount fields, unlock category, Loot and Chronicle lines"
```

---

### Task 2: Riding in the movement model

**Files:**
- Modify: `src/lib/realm/movement.ts`, `src/lib/realm/movement.test.ts`

**Interfaces:**
- Produces: `HeroState.mounted: boolean`; `stepHero(state, input, dt, colliders, speed = HERO_SPEED)`; `setMounted(state, mounted)`, `toggleMount(state, canRide)`; `COMPANION_GAP_MOUNTED = 2.0`; `stepCompanion(companion, hero, dt, opts?: { gap?: number; speed?: number })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/realm/movement.test.ts` (import `setMounted, toggleMount, COMPANION_GAP_MOUNTED` too; update every existing `HeroState` literal in the file to include `mounted: false`):

```ts
describe("riding", () => {
  const colliders: Prop[] = [];
  it("moves at the given speed", () => {
    const start: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null, mounted: true };
    const walked = stepHero(start, { axis: { x: 1, z: 0 } }, 1, colliders);
    const rode = stepHero(start, { axis: { x: 1, z: 0 } }, 1, colliders, 7);
    expect(walked.position.x).toBeCloseTo(3.5, 5);
    expect(rode.position.x).toBeCloseTo(7, 5);
    expect(rode.mounted).toBe(true);
  });
  it("mounts and dismounts, clearing the walk target, only when riding is allowed", () => {
    const start: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: { x: 3, z: 3 }, mounted: false };
    const up = toggleMount(start, true);
    expect(up.mounted).toBe(true);
    expect(up.target).toBeNull();
    expect(toggleMount(up, true).mounted).toBe(false);
    expect(toggleMount(start, false)).toBe(start);
    expect(setMounted(start, false)).toBe(start);
    expect(setMounted(start, true).mounted).toBe(true);
  });
  it("lets the companion follow further back and faster while mounted", () => {
    const hero: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null, mounted: true };
    let companion = { position: { x: 0, z: -1.2 } };
    for (let i = 0; i < 300; i++) companion = stepCompanion(companion, hero, 1 / 60, { gap: COMPANION_GAP_MOUNTED, speed: 7 });
    expect(companion.position.z).toBeCloseTo(-COMPANION_GAP_MOUNTED, 1);
    const slow = stepCompanion({ position: { x: 0, z: -10 } }, hero, 1, { gap: COMPANION_GAP_MOUNTED, speed: 7 });
    expect(slow.position.z).toBeCloseTo(-10 + 7 * 0.9, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/movement.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/realm/movement.ts`:
- `export type HeroState = { position: Vec2; facing: Facing; target: Vec2 | null; mounted: boolean };`
- `export const COMPANION_GAP_MOUNTED = 2.0;`
- `stepHero(state, input, dt, colliders, speed: number = HERO_SPEED)`: replace both uses of `HERO_SPEED` inside the function with `speed`; the returned object is `{ position, facing, target, mounted: state.mounted }`; the early returns keep `state`.
- `unstickHero` spreads `state` already (keeps `mounted`).
- Add:

```ts
/** Riding is a flag on the hero; a mount's speed is passed to stepHero by the scene. Mounting drops any walk target. */
export function setMounted(state: HeroState, mounted: boolean): HeroState {
  if (state.mounted === mounted) return state;
  return { ...state, mounted, target: null };
}

export function toggleMount(state: HeroState, canRide: boolean): HeroState {
  if (!canRide) return state;
  return setMounted(state, !state.mounted);
}
```

- `stepCompanion(companion, hero, dt, opts: { gap?: number; speed?: number } = {})`: `const gap = opts.gap ?? COMPANION_GAP; const speed = opts.speed ?? HERO_SPEED;` use `gap` in the goal and `speed * 0.9 * dt` for the step.
- Update the scene's initial hero state in `src/components/realm/realm-scene.tsx` (`mounted: false`) so the build keeps compiling; the shell test fixtures do not construct hero states.

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run src/lib/realm/ src/components/realm/` then `npm run typecheck` and `npx eslint src/lib/realm/ src/components/realm/realm-scene.tsx`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realm/movement.ts src/lib/realm/movement.test.ts src/components/realm/realm-scene.tsx
git commit -m "Realm movement: mount speed, mounted state, companion gap while riding"
```

---

### Task 3: Recess module (pure)

**Files:**
- Create: `src/lib/realm/recess/recess.ts`, `src/lib/realm/recess/recess.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `Prop`, `WorldLayout`, `SPAWN`, `WORLD_SIZE` from `../layout`; `seededRng` from `@/lib/utils/drill-generators`.
- Produces: `Gleam`, `RecessState`, `RecessEvent`, `GLEAM_COUNT`, `GLEAM_COUNT_LOW`, `GLEAM_RADIUS`, `GLEAM_RESPAWN_MS`, `LAP_WAYPOINTS`, `LAP_START`, `WAYPOINT_RADIUS`, `startRecess`, `setRecessActive`, `spawnGleams`, `stepRecess`, `formatLap(ms): string`.

- [ ] **Step 1: Write the failing tests**

`src/lib/realm/recess/recess.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout, SPAWN } from "../layout";
import {
  startRecess, setRecessActive, spawnGleams, stepRecess, formatLap,
  GLEAM_COUNT, GLEAM_COUNT_LOW, GLEAM_RADIUS, GLEAM_RESPAWN_MS, LAP_WAYPOINTS, LAP_START, WAYPOINT_RADIUS,
} from "./recess";

const layout = buildWorldLayout({ castleType: "keep", buildings: [{ id: "well", done: 5, total: 5, complete: true }] });
const active = setRecessActive(startRecess(), true);

describe("gleams", () => {
  it("spawns the full count on walkable ground, deterministically", () => {
    const a = spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: false });
    const b = spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: false });
    expect(a.gleams.length).toBe(GLEAM_COUNT);
    expect(a.gleams).toEqual(b.gleams);
    for (const g of a.gleams) {
      for (const c of layout.colliders) {
        const inside = Math.abs(g.position.x - c.position.x) < c.size.w / 2 + 1 && Math.abs(g.position.z - c.position.z) < c.size.d / 2 + 1;
        expect(inside).toBe(false);
      }
      for (const v of layout.villagers) expect(Math.hypot(g.position.x - v.position.x, g.position.z - v.position.z)).toBeGreaterThanOrEqual(2);
      for (const p of layout.props.filter((p) => p.kind === "path")) expect(Math.hypot(g.position.x - p.position.x, g.position.z - p.position.z)).toBeGreaterThanOrEqual(2);
      expect(Math.hypot(g.position.x - SPAWN.x, g.position.z - SPAWN.z)).toBeGreaterThanOrEqual(3);
    }
    expect(spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: true }).gleams.length).toBe(GLEAM_COUNT_LOW);
    expect(spawnGleams({ seed: 5, now: 0, layout, state: startRecess(), lowStimulus: false }).gleams.length).toBe(0); // inactive: nothing spawns
  });

  it("collects a gleam within reach, counts it, and respawns its slot after ten seconds elsewhere", () => {
    const spawned = spawnGleams({ seed: 1, now: 0, layout, state: active, lowStimulus: false });
    const target = spawned.gleams[0];
    const hero = { x: target.position.x + GLEAM_RADIUS - 0.05, z: target.position.z };
    const { state, events } = stepRecess(spawned, hero, 100);
    expect(events).toEqual([{ kind: "gleam", count: 1 }]);
    expect(state.collected).toBe(1);
    expect(state.gleams.some((g) => g.id === target.id)).toBe(false);
    const soon = spawnGleams({ seed: 1, now: 5_000, layout, state, lowStimulus: false });
    expect(soon.gleams.length).toBe(GLEAM_COUNT - 1);
    const later = spawnGleams({ seed: 1, now: 100 + GLEAM_RESPAWN_MS, layout, state, lowStimulus: false });
    expect(later.gleams.length).toBe(GLEAM_COUNT);
    const replacement = later.gleams.find((g) => g.slot === target.slot)!;
    expect(replacement.position).not.toEqual(target.position);
  });
});

describe("laps", () => {
  it("starts timing at the first waypoint, advances in order, completes at the start line, and keeps the best", () => {
    let state = active;
    let events: ReturnType<typeof stepRecess>["events"] = [];
    const visit = (p: { x: number; z: number }, now: number) => {
      const r = stepRecess(state, p, now);
      state = r.state;
      events = events.concat(r.events);
    };
    visit(LAP_START, 0);
    expect(state.lapStartedAt).toBeNull();
    visit(LAP_WAYPOINTS[3], 500); // out of order: ignored
    expect(state.nextWaypoint).toBe(0);
    LAP_WAYPOINTS.forEach((w, i) => visit({ x: w.x + WAYPOINT_RADIUS - 0.1, z: w.z }, 1_000 + i * 5_000));
    expect(state.lapStartedAt).toBe(1_000);
    expect(state.nextWaypoint).toBe(LAP_WAYPOINTS.length);
    visit(LAP_START, 41_300);
    expect(state.laps).toBe(1);
    expect(state.bestLapMs).toBe(40_300);
    expect(events.at(-1)).toEqual({ kind: "lap", lapMs: 40_300, laps: 1, best: true });
    expect(state.nextWaypoint).toBe(0);
    expect(state.lapStartedAt).toBe(41_300);
    // a slower second lap keeps the best
    LAP_WAYPOINTS.forEach((w, i) => visit(w, 50_000 + i * 6_000));
    visit(LAP_START, 100_000);
    expect(state.laps).toBe(2);
    expect(state.bestLapMs).toBe(40_300);
    expect(events.at(-1)).toMatchObject({ kind: "lap", best: false });
  });

  it("deactivating clears gleams and the running lap but keeps the tallies", () => {
    let state = spawnGleams({ seed: 2, now: 0, layout, state: active, lowStimulus: false });
    state = { ...state, collected: 4, laps: 2, bestLapMs: 30_000, lapStartedAt: 10, nextWaypoint: 3 };
    const off = setRecessActive(state, false);
    expect(off.active).toBe(false);
    expect(off.gleams).toEqual([]);
    expect(off.lapStartedAt).toBeNull();
    expect(off.nextWaypoint).toBe(0);
    expect(off).toMatchObject({ collected: 4, laps: 2, bestLapMs: 30_000 });
    expect(stepRecess(off, LAP_WAYPOINTS[0], 20).state).toBe(off);
  });

  it("formats lap times with one decimal", () => {
    expect(formatLap(40_300)).toBe("40.3");
    expect(formatLap(999)).toBe("1.0");
  });

  it("keeps every waypoint inside the world and away from the castle", () => {
    for (const w of LAP_WAYPOINTS) {
      expect(Math.abs(w.x)).toBeLessThan(19);
      expect(Math.abs(w.z)).toBeLessThan(19);
      expect(layout.colliders.some((c) => Math.abs(w.x - c.position.x) < c.size.w / 2 + 1 && Math.abs(w.z - c.position.z) < c.size.d / 2 + 1)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/recess/`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/realm/recess/recess.ts`:

```ts
import { SPAWN, WORLD_SIZE, type Prop, type Vec2, type WorldLayout } from "../layout";
import { seededRng } from "@/lib/utils/drill-generators";

export type Gleam = { id: string; slot: number; position: Vec2; spawnedAt: number };
export type RecessEvent = { kind: "gleam"; count: number } | { kind: "lap"; lapMs: number; laps: number; best: boolean };
export type RecessState = {
  active: boolean;
  gleams: Gleam[];
  collected: number;
  laps: number;
  lapStartedAt: number | null;
  bestLapMs: number | null;
  nextWaypoint: number;
  slotRespawnAt: Record<number, number>; // slot → simulation time it may spawn again
  slotSpawns: Record<number, number>; // slot → how many times it has spawned (seeds variety)
};

export const GLEAM_COUNT = 12;
export const GLEAM_COUNT_LOW = 6;
export const GLEAM_RADIUS = 0.8;
export const GLEAM_RESPAWN_MS = 10_000;
export const WAYPOINT_RADIUS = 2;
export const LAP_START: Vec2 = SPAWN;
/** A ring around the kingdom's sites, clockwise from the gate, staying clear of the largest castle footprint. */
export const LAP_WAYPOINTS: Vec2[] = [
  { x: -9, z: 11 },
  { x: -12, z: 1 },
  { x: -12, z: -9 },
  { x: -6, z: -17 },
  { x: 6, z: -17 },
  { x: 12, z: -9 },
  { x: 12, z: 1 },
  { x: 9, z: 11 },
];
const LIMIT = WORLD_SIZE / 2 - 2;
const CLEAR_COLLIDER = 1;
const CLEAR_VILLAGER = 2;
const CLEAR_PATH = 2;
const CLEAR_SPAWN = 3;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

export function startRecess(): RecessState {
  return { active: false, gleams: [], collected: 0, laps: 0, lapStartedAt: null, bestLapMs: null, nextWaypoint: 0, slotRespawnAt: {}, slotSpawns: {} };
}

/** Turning recess off clears the field and the running lap; what was collected and lapped stays on the HUD. */
export function setRecessActive(state: RecessState, active: boolean): RecessState {
  if (state.active === active) return state;
  if (active) return { ...state, active: true };
  return { ...state, active: false, gleams: [], lapStartedAt: null, nextWaypoint: 0, slotRespawnAt: {} };
}

export type SpawnGleamsInput = { seed: number; now: number; layout: WorldLayout; state: RecessState; lowStimulus: boolean };

/** Fills empty gleam slots on walkable ground. Seeded per slot and spawn count so a respawn lands somewhere new but tests are stable. */
export function spawnGleams(input: SpawnGleamsInput): RecessState {
  if (!input.state.active) return input.state;
  const count = input.lowStimulus ? GLEAM_COUNT_LOW : GLEAM_COUNT;
  const paths = input.layout.props.filter((p) => p.kind === "path");
  const gleams = input.state.gleams.slice();
  const slotSpawns = { ...input.state.slotSpawns };
  for (let slot = 0; slot < count; slot++) {
    if (gleams.some((g) => g.slot === slot)) continue;
    const respawnAt = input.state.slotRespawnAt[slot];
    if (respawnAt !== undefined && input.now < respawnAt) continue;
    const spawns = slotSpawns[slot] ?? 0;
    const rng = seededRng((input.seed + slot * 7919 + spawns * 104729) >>> 0);
    for (let attempt = 0; attempt < 20; attempt++) {
      const p = { x: (rng() * 2 - 1) * LIMIT, z: (rng() * 2 - 1) * LIMIT };
      if (input.layout.colliders.some((c) => insideProp(p, c, CLEAR_COLLIDER))) continue;
      if (input.layout.villagers.some((v) => dist(p, v.position) < CLEAR_VILLAGER)) continue;
      if (paths.some((t) => dist(p, t.position) < CLEAR_PATH)) continue;
      if (dist(p, SPAWN) < CLEAR_SPAWN) continue;
      gleams.push({ id: `gleam-${slot}-${spawns}`, slot, position: p, spawnedAt: input.now });
      slotSpawns[slot] = spawns + 1;
      break;
    }
  }
  return { ...input.state, gleams, slotSpawns };
}

/** One frame of recess: collect gleams in reach and advance the lap. */
export function stepRecess(state: RecessState, hero: Vec2, now: number): { state: RecessState; events: RecessEvent[] } {
  if (!state.active) return { state, events: [] };
  const events: RecessEvent[] = [];
  let next = state;
  const remaining: Gleam[] = [];
  let collected = state.collected;
  const slotRespawnAt = { ...state.slotRespawnAt };
  for (const g of state.gleams) {
    if (dist(g.position, hero) <= GLEAM_RADIUS) {
      collected += 1;
      slotRespawnAt[g.slot] = now + GLEAM_RESPAWN_MS;
      events.push({ kind: "gleam", count: collected });
    } else {
      remaining.push(g);
    }
  }
  if (collected !== state.collected) next = { ...next, gleams: remaining, collected, slotRespawnAt };

  if (next.nextWaypoint < LAP_WAYPOINTS.length) {
    const w = LAP_WAYPOINTS[next.nextWaypoint];
    if (dist(hero, w) <= WAYPOINT_RADIUS) {
      next = { ...next, nextWaypoint: next.nextWaypoint + 1, lapStartedAt: next.lapStartedAt ?? now };
    }
  } else if (dist(hero, LAP_START) <= WAYPOINT_RADIUS && next.lapStartedAt !== null) {
    const lapMs = now - next.lapStartedAt;
    const best = next.bestLapMs === null || lapMs < next.bestLapMs;
    next = { ...next, laps: next.laps + 1, bestLapMs: best ? lapMs : next.bestLapMs, nextWaypoint: 0, lapStartedAt: now };
    events.push({ kind: "lap", lapMs, laps: next.laps, best });
  }
  return { state: next, events };
}

export function formatLap(ms: number): string {
  return (ms / 1000).toFixed(1);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/realm/recess/`
Expected: pass. If a seeded placement test fails because a slot found no spot in 20 attempts on the keep layout, raise the attempts to 40 and note it in the report.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realm/recess/
git commit -m "Realm recess model: seeded gleams, collection, lap ring"
```

---

### Task 4: Figures, sprite pipeline, customizer mount tab

**Files:**
- Modify: `src/components/avatar.tsx`, `src/components/avatar-figures.test.tsx`, `src/components/realm/sprite-source.tsx`, `src/components/realm/sprite-source.test.tsx`, `src/components/avatar-customizer.tsx`, `src/components/realm/realm-shell.test.tsx` (mock fixture)
- Create: `src/components/realm/recess-figures.tsx`, `src/components/realm/recess-figures.test.tsx`, `src/components/avatar-customizer.test.tsx`

**Interfaces:**
- Produces: `MountFigure({ mount, color, size? })` (svg `data-figure="mount"`, `data-figure-id={mount}`); `AvatarFigure` prop `mounted?: boolean`; `GleamFigure()` (`data-figure="gleam"`), `BannerFigure()` (`data-figure="banner"`); `SpriteSource` props `mount?: { id: string; color: string } | null`, `recess?: boolean`; `SpriteTextures` gains `mount: CanvasTexture | null`, `heroMounted: CanvasTexture | null`, `gleam: CanvasTexture | null`, `banner: CanvasTexture | null`; customizer tab `mount`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/avatar-figures.test.tsx` (import `MountFigure` and `MOUNTS`):

```tsx
describe("MountFigure and the mounted rider", () => {
  it("draws every mount with figure attributes", () => {
    for (const m of MOUNTS) {
      const { container } = render(<MountFigure mount={m.id} color="#8b5e3c" />);
      const svg = container.querySelector('svg[data-figure="mount"]')!;
      expect(svg.getAttribute("data-figure-id")).toBe(m.id);
      expect(svg.getAttribute("viewBox")).toBe("0 0 36 48");
      expect(svg.querySelectorAll("rect,path,circle,polygon,ellipse").length).toBeGreaterThan(2);
      cleanup();
    }
  });
  it("draws the mounted rider without legs or boots, shifted up", () => {
    const walking = render(<AvatarFigure config={config} />).container.querySelectorAll(SHAPES).length;
    cleanup();
    const riding = render(<AvatarFigure config={config} mounted />).container;
    expect(riding.querySelector('svg[data-figure="hero"]')!.getAttribute("data-mounted")).toBe("true");
    expect(riding.querySelectorAll(SHAPES).length).toBeLessThan(walking);
  });
});
```

Create `src/components/realm/recess-figures.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GleamFigure, BannerFigure } from "./recess-figures";

afterEach(cleanup);

describe("recess figures", () => {
  it("draws a gleam and a banner on the sprite canvas", () => {
    const gleam = render(<GleamFigure />).container.querySelector('svg[data-figure="gleam"]')!;
    expect(gleam.getAttribute("viewBox")).toBe("0 0 36 48");
    expect(gleam.querySelectorAll("path,polygon,circle").length).toBeGreaterThan(0);
    cleanup();
    const banner = render(<BannerFigure />).container.querySelector('svg[data-figure="banner"]')!;
    expect(banner.querySelectorAll("rect,path,polygon").length).toBeGreaterThan(1);
  });
});
```

Append to `src/components/realm/sprite-source.test.tsx`:

```tsx
  it("rasterizes the mount, the mounted rider, and the recess figures when asked", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} mount={{ id: "pony", color: "#8b5e3c" }} recess onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const t = onReady.mock.calls[0][0];
    expect(t.mount).toMatchObject({ id: "pony" });
    expect(t.heroMounted).toMatchObject({ id: "hero" });
    expect(t.gleam).toMatchObject({ id: "gleam" });
    expect(t.banner).toMatchObject({ id: "banner" });
    expect(svgElementToTexture).toHaveBeenCalledTimes(5); // hero, rider, mount, gleam, banner
  });
```

(The test's mock keys textures by `data-figure-id` falling back to `data-figure`; the rider svg carries `data-figure="hero"` and `data-mounted="true"`, so distinguish it in the query by the attribute, not the id.)

Create `src/components/avatar-customizer.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AvatarCustomizer } from "./avatar-customizer";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/avatar", () => ({ updateAvatarConfig: vi.fn().mockResolvedValue(undefined) }));

afterEach(cleanup);

describe("AvatarCustomizer mount tab", () => {
  it("lists mounts, gates locked ones by level, and allows none", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Mount" }));
    expect(screen.getByRole("button", { name: /Pony/ })).toBeEnabled();
    const goat = screen.getByRole("button", { name: /Goat/ });
    expect(goat).toBeDisabled();
    expect(goat.textContent).toContain("Reach Level 3");
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pony/ }));
    expect(screen.getByText("Coat")).toBeInTheDocument();
  });
});
```

If the dialog renders in a portal or needs a provider, follow how `tavern-avatar-card.tsx` mounts it; if locked chips are not `disabled` buttons in the existing `NullableItemGrid`, assert on the chip's `aria-disabled` or class the grid actually uses (read the grid first) and note the adjustment in the report.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/avatar-figures.test.tsx src/components/realm/recess-figures.test.tsx src/components/realm/sprite-source.test.tsx src/components/avatar-customizer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Figures**

In `src/components/avatar.tsx`:
- `AvatarFigure` gains `mounted?: boolean` (default false) and sets `data-mounted={mounted ? "true" : undefined}`. When `mounted`, the inner group is `<g transform="translate(0, 0)">` (instead of `translate(0, 8)`) and the `LegsLayer`/`BootsLayer` lines are omitted, so the rider sits higher with the saddle hiding the legs.
- Append `MountFigure`:

```tsx
export function MountFigure({ mount, color, size = "xl", className = "" }: { mount: string; color: string; size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" className={className} style={{ imageRendering: "pixelated" }} aria-hidden="true" data-figure="mount" data-figure-id={mount}>
      <MountLayer mount={mount} color={color} />
    </svg>
  );
}
```

and a module-private `MountLayer({ mount, color })` that switches on the id and draws each animal from rects (body, head, legs, tail, saddle in `darken(color, 0.3)`, eye `#1a1a2e`), using `lighten`/`darken` like `CompanionLayer`. Shapes (all within x 2–34, y 18–46 so the rider above fits): pony (rounded body, mane), donkey (long ears), goat (horns, beard), stag (antlers), boar (tusks, bristles), direwolf (long snout, pointed ears), gryphon (wings, beak), wyrm (long body, small wings, tail). Each case returns a `<g>` with at least four shapes.

Create `src/components/realm/recess-figures.tsx`:

```tsx
/** A gleam: the recess collectible. Gold four-point star with a soft core. */
export function GleamFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="gleam">
      <polygon points="18,10 21,21 32,24 21,27 18,38 15,27 4,24 15,21" fill="#fde68a" />
      <polygon points="18,16 20,22 26,24 20,26 18,32 16,26 10,24 16,22" fill="#fffbeb" />
      <circle cx="18" cy="24" r="2" fill="#fff" />
    </svg>
  );
}

/** The lap start banner at the gate. */
export function BannerFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="banner">
      <rect x="16" y="6" width="3" height="40" fill="#6b4226" />
      <path d="M19 8 L34 13 L19 18 Z" fill="#c0563d" />
      <path d="M19 10 L30 13 L19 16 Z" fill="#fde68a" />
      <rect x="12" y="44" width="11" height="2" fill="#4a3728" />
    </svg>
  );
}
```

- [ ] **Step 4: Sprite source**

In `src/components/realm/sprite-source.tsx`: import `MountFigure` from `@/components/avatar` and `GleamFigure, BannerFigure` from `./recess-figures`; extend `SpriteTextures` with `mount: THREE.CanvasTexture | null; heroMounted: THREE.CanvasTexture | null; gleam: THREE.CanvasTexture | null; banner: THREE.CanvasTexture | null;`; add props `mount?: { id: string; color: string } | null` (default null) and `recess?: boolean` (default false); in the effect after troubles:

```ts
      let mountTexture: THREE.CanvasTexture | null = null;
      let heroMounted: THREE.CanvasTexture | null = null;
      if (mount) {
        const mountSvg = root.querySelector<SVGSVGElement>(`svg[data-figure="mount"][data-figure-id="${mount.id}"]`);
        const riderSvg = root.querySelector<SVGSVGElement>('svg[data-figure="hero"][data-mounted="true"]');
        if (mountSvg) mountTexture = await textureFor(`mount:${mount.id}:${mount.color}`, mountSvg);
        if (riderSvg) heroMounted = await textureFor(`${key}:mounted`, riderSvg);
      }
      let gleam: THREE.CanvasTexture | null = null;
      let banner: THREE.CanvasTexture | null = null;
      if (recess) {
        const gleamSvg = root.querySelector<SVGSVGElement>('svg[data-figure="gleam"]');
        const bannerSvg = root.querySelector<SVGSVGElement>('svg[data-figure="banner"]');
        if (gleamSvg) gleam = await textureFor("gleam", gleamSvg);
        if (bannerSvg) banner = await textureFor("banner", bannerSvg);
      }
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures, troubles: troubleTextures, mount: mountTexture, heroMounted, gleam, banner });
```

Render in the hidden host: `{mount && <MountFigure mount={mount.id} color={mount.color} size="xl" />}`, `{mount && <AvatarFigure config={config} size="xl" mounted />}`, `{recess && <GleamFigure />}`, `{recess && <BannerFigure />}`. Add `mount` and `recess` to the deps; callers must pass a memoised `mount` object. The hero svg query must exclude the rider: `'svg[data-figure="hero"]:not([data-mounted])'`.

Update the `SpriteSource` mock in `realm-shell.test.tsx` to report `mount: null, heroMounted: null, gleam: null, banner: null` too, and any other test that builds a `SpriteTextures` literal.

- [ ] **Step 5: Customizer**

In `src/components/avatar-customizer.tsx`: add `"mount"` to `Tab`, `{ id: "mount", label: "Mount" }` after the Pet tab; import `MOUNTS, MOUNT_COLORS`; render:

```tsx
          {tab === "mount" && (
            <NullableItemGrid
              items={MOUNTS}
              selected={config.mount}
              onSelect={(id) => update({ mount: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}
```

and the colour row:

```tsx
        {tab === "mount" && config.mount && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Coat</p>
            <ColorGrid colors={MOUNT_COLORS} selected={config.mountColor} onSelect={(hex) => update({ mountColor: hex })} />
          </div>
        )}
```

`randomAvatarConfig` leaves `mount: null, mountColor: DEFAULT_AVATAR.mountColor`.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run src/components/` then `npm run typecheck` and `npx eslint src/components/avatar.tsx src/components/avatar-customizer.tsx src/components/realm/`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/avatar.tsx src/components/avatar-figures.test.tsx src/components/realm/recess-figures.tsx src/components/realm/recess-figures.test.tsx src/components/realm/sprite-source.tsx src/components/realm/sprite-source.test.tsx src/components/avatar-customizer.tsx src/components/avatar-customizer.test.tsx src/components/realm/realm-shell.test.tsx
git commit -m "Mount and recess figures through the sprite pipeline; customizer mount tab"
```

---

### Task 5: Bundle, play-clock source, recess layer, HUD, shell wiring

**Files:**
- Create: `src/lib/services/mounts.ts`, `src/components/realm/use-recess-sim.ts`, `src/components/realm/use-recess-sim.test.ts`, `src/components/realm/recess-layer.tsx`
- Modify: `src/lib/actions/realm.ts`, `src/components/realm/use-play-clock.ts`, `src/components/realm/use-play-clock.test.ts`, `src/components/realm/realm-hud.tsx`, `src/components/realm/realm-hud.test.tsx`, `src/components/realm/realm-scene.tsx`, `src/components/realm/realm-shell.tsx`, `src/components/realm/realm-shell.test.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: `RealmBundle.mounts: { unlocked: string[] }`; `usePlayClock({ …, initialSource })` returns `source: AccessSource | null`; `RealmHud` props `recess: { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null } | null`, `ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null`; `RealmSceneProps` adds `riding: boolean`, `mountSpeed: number`, `recessActive: boolean`, `onRecessEvent: (e: RecessSimEvent) => void`; `RecessSimEvent = RecessEvent | { kind: "lapTick"; lapMs: number }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/realm/use-play-clock.test.ts`:

```ts
  it("exposes the access source, starting from the initial one and following refreshes", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 9, source: "recess" });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 10, onClose: vi.fn(), initialSource: "earned" }));
    expect(result.current.source).toBe("earned");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("recess");
  });
```

Append to `src/components/realm/realm-hud.test.tsx` (add `recess={null} ride={null}` to every existing render):

```tsx
  it("shows recess tallies and the ride button", () => {
    const onToggle = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={50} cleared={0} notice={null} recess={{ gleams: 3, laps: 1, bestLapMs: 40_300, lapMs: 12_000 }} ride={{ riding: false, disabled: false, onToggle }} />);
    expect(screen.getByText("Gleams: 3")).toBeInTheDocument();
    expect(screen.getByText(/Laps: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Best 40\.3 s/)).toBeInTheDocument();
    expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ride" }));
    expect(onToggle).toHaveBeenCalled();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={50} cleared={0} notice={null} recess={null} ride={{ riding: true, disabled: true, onToggle }} />);
    expect(screen.getByRole("button", { name: "Dismount" })).toBeDisabled();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
  });
```

Create `src/components/realm/use-recess-sim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout, SPAWN } from "@/lib/realm/layout";
import { LAP_WAYPOINTS } from "@/lib/realm/recess/recess";
import { startRecessSim, stepRecessSim, type RecessSimEvent } from "./use-recess-sim";

const layout = buildWorldLayout({ castleType: "keep", buildings: [] });

describe("stepRecessSim", () => {
  it("spawns gleams only while active, collects one the hero walks over, and ticks the lap timer once a second", () => {
    const events: RecessSimEvent[] = [];
    const emit = (e: RecessSimEvent) => events.push(e);
    let sim = startRecessSim();
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: false, lowStimulus: false, seed: 3 }, emit);
    expect(sim.state.gleams.length).toBe(0);
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(sim.state.gleams.length).toBe(12);
    expect(events.filter((e) => e.kind === "recessStart").length).toBe(1);
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events.filter((e) => e.kind === "recessStart").length).toBe(1); // only on the flip
    const target = sim.state.gleams[0];
    sim = stepRecessSim(sim, { layout, hero: target.position, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events).toContainEqual({ kind: "gleam", count: 1 });
    // start a lap and run 2.5 s: two ticks
    sim = stepRecessSim(sim, { layout, hero: LAP_WAYPOINTS[0], dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    for (let i = 0; i < 150; i++) sim = stepRecessSim(sim, { layout, hero: LAP_WAYPOINTS[0], dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events.filter((e) => e.kind === "lapTick").length).toBe(2);
    const off = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: false, lowStimulus: false, seed: 3 }, emit);
    expect(off.state.active).toBe(false);
    expect(off.state.gleams.length).toBe(0);
    expect(off.state.collected).toBe(1);
  });
});
```

Append to `src/components/realm/realm-shell.test.tsx` (extend the scene mock to expose `data-riding={String(props.riding)}` and `data-recess={String(props.recessActive)}`; the fixture bundle gains `mounts: { unlocked: ["pony"] }`):

```tsx
  it("turns recess on only for a hero whose access source is recess, with a toast", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "true");
    expect(screen.getByText("Gleams: 0")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "recessStart" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Recess!");
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "gleam", count: 1 });
    });
    expect(screen.getByText("A gleam! 1 so far.")).toBeInTheDocument();
    expect(screen.getByText("Gleams: 1")).toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
  });

  it("rides an unlocked equipped mount, blocks casting while riding, and hides the button otherwise", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    expect((sceneProps.mountSpeed as number)).toBe(4.5);
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Dismount to cast.")).toBeInTheDocument();
    expect(sceneProps.selectedSpell).toBeNull();
    fireEvent.keyDown(document.body, { code: "KeyM", key: "m" });
    await waitFor(() => expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "false"));
    cleanup();
    render(<RealmShell bundle={{ ...riderBundle, mounts: { unlocked: [] } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ride" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/realm/`
Expected: FAIL.

- [ ] **Step 3: Bundle and service**

Create `src/lib/services/mounts.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { levelFromXp } from "@/lib/utils/level";
import { isUnlocked, MOUNTS } from "@/lib/utils/avatar-catalog";

/** Ids of the mounts this hero may ride, from level, badges, and quest rewards. */
export async function loadUnlockedMountIds(childId: string): Promise<string[]> {
  const [childRows, badges, unlocks] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db.select({ itemId: schema.childAvatarUnlock.itemId }).from(schema.childAvatarUnlock).where(eq(schema.childAvatarUnlock.childId, childId)),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  const badgeIds = badges.map((b) => b.badgeId);
  const questIds = new Set(unlocks.map((u) => u.itemId));
  return MOUNTS.filter((m) => isUnlocked(m, level, badgeIds, questIds)).map((m) => m.id);
}
```

In `src/lib/actions/realm.ts`: add `mounts: { unlocked: string[] };` to `RealmBundle`, `loadUnlockedMountIds(childId)` to the `Promise.all` (no catch), and `mounts: { unlocked }` to the return.

- [ ] **Step 4: Play clock source**

In `src/components/realm/use-play-clock.ts`: add `initialSource?: AccessSource | null` to the options (`export type AccessSource = "off_hours" | "recess" | "earned";`), `const [source, setSource] = useState<AccessSource | null>(initialSource ?? null);`, and in both `refresh` and `settle` after `applyAccess`: `if (access.allowed) setSource(access.source);`. Return `source` too.

- [ ] **Step 5: Recess sim hook**

`src/components/realm/use-recess-sim.ts`:

```ts
"use client";

import { useRef, useState, type RefObject } from "react";
import type { Vec2, WorldLayout } from "@/lib/realm/layout";
import { setRecessActive, spawnGleams, startRecess, stepRecess, type RecessEvent, type RecessState } from "@/lib/realm/recess/recess";

export type RecessSimEvent = RecessEvent | { kind: "lapTick"; lapMs: number } | { kind: "recessStart" };
export type RecessSim = { state: RecessState; now: number; lastTickAt: number };
export type RecessSimInput = { layout: WorldLayout; hero: Vec2; dt: number; active: boolean; lowStimulus: boolean; seed: number };

export function startRecessSim(): RecessSim {
  return { state: startRecess(), now: 0, lastTickAt: 0 };
}

/** One frame of recess: activation, spawns, collection, laps, and a once-a-second lap tick for the HUD. */
export function stepRecessSim(sim: RecessSim, input: RecessSimInput, emit: (e: RecessSimEvent) => void): RecessSim {
  const now = sim.now + input.dt * 1000;
  let state = setRecessActive(sim.state, input.active);
  if (state.active && !sim.state.active) emit({ kind: "recessStart" });
  state = spawnGleams({ seed: input.seed, now, layout: input.layout, state, lowStimulus: input.lowStimulus });
  const stepped = stepRecess(state, input.hero, now);
  state = stepped.state;
  for (const e of stepped.events) emit(e);
  let lastTickAt = sim.lastTickAt;
  if (state.active && state.lapStartedAt !== null && now - lastTickAt >= 1000) {
    lastTickAt = now;
    emit({ kind: "lapTick", lapMs: now - state.lapStartedAt });
  }
  return { state, now, lastTickAt };
}

export function useRecessSimRef(): RefObject<RecessSim> {
  const [initial] = useState<RecessSim>(startRecessSim);
  return useRef<RecessSim>(initial);
}
```

- [ ] **Step 6: Recess layer**

`src/components/realm/recess-layer.tsx` (three.js allowed; imported by the scene only):

```tsx
"use client";

import "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { RecessSim } from "./use-recess-sim";
import type { SpriteTextures } from "./sprite-source";
import { GLEAM_COUNT, LAP_START, LAP_WAYPOINTS } from "@/lib/realm/recess/recess";

/** Pooled gleam sprites, the ring markers, and the start banner; visible only while recess is active. */
export function RecessLayer({ sim, textures, calm, motion }: { sim: RefObject<RecessSim>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const gleamSprites = useRef<(THREE.Sprite | null)[]>([]);
  const ring = useRef<THREE.Group>(null);

  useFrame((state) => {
    const s = sim.current.state;
    if (ring.current) ring.current.visible = s.active;
    for (let i = 0; i < GLEAM_COUNT; i++) {
      const sprite = gleamSprites.current[i];
      if (!sprite) continue;
      const g = s.gleams[i];
      if (!s.active || !g) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const bob = motion ? Math.sin(state.clock.elapsedTime * 3 + i) * 0.1 : 0;
      sprite.position.set(g.position.x, 0.8 + bob, g.position.z);
    }
  });

  const marker = calm ? "#8a7d5a" : "#c9a84c";
  return (
    <>
      {Array.from({ length: GLEAM_COUNT }, (_, i) => (
        <sprite key={`g${i}`} ref={(el) => { gleamSprites.current[i] = el; }} visible={false} scale={[0.9, 1.2, 1]}>
          <spriteMaterial map={textures.gleam ?? undefined} transparent alphaTest={0.1} />
        </sprite>
      ))}
      <group ref={ring} visible={false}>
        {LAP_WAYPOINTS.map((w, i) => (
          <mesh key={`w${i}`} position={[w.x, 0.05, w.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 16]} />
            <meshStandardMaterial color={marker} />
          </mesh>
        ))}
        {textures.banner && (
          <sprite position={[LAP_START.x, 1, LAP_START.z - 1.5]} scale={[1.5, 2, 1]}>
            <spriteMaterial map={textures.banner} transparent alphaTest={0.1} />
          </sprite>
        )}
      </group>
    </>
  );
}
```

- [ ] **Step 7: Scene**

In `src/components/realm/realm-scene.tsx`:
- Props: `riding: boolean; mountSpeed: number; recessActive: boolean; onRecessEvent: (e: RecessSimEvent) => void;` (import the type from `./use-recess-sim`; import `RecessLayer`; import `setMounted, COMPANION_GAP_MOUNTED` from movement).
- `const recessRef = useRecessSimRef(); const mountSprite = useRef<THREE.Sprite>(null);`
- Effect: `useEffect(() => { hero.current = setMounted(hero.current, riding); }, [riding]);`
- In `useFrame` (interactive branch): `stepHero(..., riding ? mountSpeed : HERO_SPEED)` (import `HERO_SPEED`); `stepCompanion(companion.current, hero.current, dt, riding ? { gap: COMPANION_GAP_MOUNTED, speed: mountSpeed + 0.5 } : undefined)`; after the spell sim: `recessRef.current = stepRecessSim(recessRef.current, { layout, hero: hero.current.position, dt, active: recessActive, lowStimulus: settings.calmPalette, seed }, (e) => queueMicrotask(() => onRecessEvent(e)));`.
- Sprite updates each frame: when `riding`, set the hero sprite's material map to `textures.heroMounted ?? textures.hero` (swap only when it differs, with `needsUpdate`), position the hero sprite at `y = 1.6 + bob` and the mount sprite at `(p.x, 0.7 + bob, p.z)` with the same flip as the hero, `mountSprite.visible = true`; when not riding, map `textures.hero`, hero at `SPRITE_H / 2 + bob`, `mountSprite.visible = false`.
- Render `{textures.mount && <sprite ref={mountSprite} visible={false} scale={[SPRITE_W, SPRITE_H, 1]}><spriteMaterial map={textures.mount} transparent alphaTest={0.1} /></sprite>}` before the hero sprite, and `<RecessLayer sim={recessRef} textures={textures} calm={settings.calmPalette} motion={settings.motion} />` after the spell layer.

- [ ] **Step 8: HUD**

In `src/components/realm/realm-hud.tsx`: add props `recess: { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null } | null; ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null;` import `formatLap`; in the row after the cleared count:

```tsx
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
```

CSS: `.realm-hud-ride { min-height: 44px; min-width: 44px; }`.

- [ ] **Step 9: Shell**

In `src/components/realm/realm-shell.tsx`:
- `Phase` open gains `source: AccessSource | null` (set from `result.allowed ? result.source : null`; parents `null`); `RealmOpen` receives `source`.
- State: `riding` (false), `recess` (`{ gleams: 0, laps: 0, bestLapMs: null, lapMs: null }`), `recessSeen` (false, for the toast).
- `const clock = usePlayClock({ …, initialSource: source });` and `const recessActive = isChildView && clock.source === "recess";`.
- Toast: the recess sim emits `{ kind: "recessStart" }` on the frame recess becomes active (Step 5), and `onRecessEvent` handles it with `setToast("Recess!")` (the existing 4 s toast timer clears it; that is acceptable against the spec's 2 s). No effect sets state. Drop the `recessSeen` state.
- Mount: `const mountItem = bundle.avatarConfig?.mount ? findMount(bundle.avatarConfig.mount) : null; const canRide = mountItem !== null && bundle.mounts.unlocked.includes(mountItem.id) && isChildView;` `const mountSpeed = mountItem?.speed ?? HERO_SPEED;` `const mountTexture = useMemo(() => (mountItem && bundle.avatarConfig ? { id: mountItem.id, color: bundle.avatarConfig.mountColor } : null), [mountItem, bundle.avatarConfig]);` passed to `SpriteSource` as `mount` with `recess={isChildView}`.
- `onToggleRide = useCallback(() => { if (!canRide) return; setRiding((r) => !r); setSelectedSlot(null); }, [canRide]);` M key: in the existing window keydown effect (the talk handler), add `if (e.code === "KeyM" && !e.repeat) { e.preventDefault(); onToggleRide(); return; }` before the Enter/Space logic (respect the same interactive-element guard).
- Casting block: pass `onSelect={(slot) => { if (riding && slot !== null) { setNotice("Dismount to cast."); return; } setSelectedSlot(slot); }}` to `SpellBar`; also `castEnabled` includes `!riding`.
- `onRecessEvent = useCallback((e: RecessSimEvent) => { if (!isChildView) return; switch (e.kind) { case "recessStart": setToast("Recess!"); break; case "gleam": setRecess((r) => ({ ...r, gleams: e.count })); setNotice(`A gleam! ${e.count} so far.`); break; case "lap": setRecess((r) => ({ ...r, laps: e.laps, bestLapMs: e.best ? e.lapMs : r.bestLapMs, lapMs: null })); setNotice(`Lap done: ${formatLap(e.lapMs)} s!`); break; case "lapTick": if (!settings.calmPalette) setRecess((r) => ({ ...r, lapMs: e.lapMs })); break; } }, [isChildView, settings.calmPalette]);`
- Scene props: `riding`, `mountSpeed`, `recessActive`, `onRecessEvent`. HUD props: `recess={recessActive || recess.laps > 0 || recess.gleams > 0 ? recess : null}` for heroes (null for parents), `ride={canRide ? { riding, disabled: false, onToggle: onToggleRide } : null}` (parents: `mountItem && bundle.mounts.unlocked.includes(mountItem.id) ? { riding: false, disabled: true, onToggle: () => {} } : null`).

- [ ] **Step 10: Run everything**

Run: `npx vitest run` then `npm run typecheck`, `npx eslint src/components/realm/ src/lib/services/ src/lib/actions/realm.ts src/app/globals.css`, and `npm run build` (chunks containing `WebGLRenderer` must still be referenced only by the realm react-loadable manifest).
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/services/mounts.ts src/lib/actions/realm.ts src/components/realm/ src/app/globals.css
git commit -m "Realm recess and riding: bundle mounts, recess layer, HUD tallies, ride button"
```

---

### Task 6: Final verification and the browser pass

**Files:** none new in the repo (screenshots land in the scratchpad).

- [ ] **Step 1: Full gate** — `npm run typecheck && npx vitest run`; `npm run lint` shows only the pre-existing error.
- [ ] **Step 2: Bundle isolation** — `npm run build`; every chunk containing `WebGLRenderer` is referenced only from `.next/server/app/(app)/realm/page/react-loadable-manifest.json`.
- [ ] **Step 3: Browser pass** — dev server on 3111 with `DEMO_MODE=true`. Insert a `recess_block` row for `demo-child-1` covering the current local time (`day_of_week` as the schema stores it, `start_time` 10 minutes ago, `end_time` 30 minutes ahead) and set the hero's avatar config `mount` to `pony` (temporary update of `child.avatar_config`; note the prior JSON). As `demo_persona=lily`: open `/realm`, confirm "Recess!" and "Gleams: 0"; click "Ride", confirm the button reads "Dismount"; walk with W for two seconds and confirm the hero moved further than an unmounted walk would (compare with a second run after dismounting, or read the HUD lap tick); tap the spell bar page (insert the temporary `sdd-spell` row as in slice 5b) and confirm "Dismount to cast."; walk toward a gleam (read `sceneProps` is not available in the browser: instead hold keys toward the nearest visible gleam in the screenshot, or walk the ring's first leg) and confirm "A gleam! 1 so far." if reached within 20 s; screenshot. As `demo_persona=parent` with `?child=demo-child-1`: no "Recess!", no gleam count, Ride button disabled. Afterwards delete the recess block and the spell row, restore the avatar config, and stop the server.
- [ ] **Step 4: Spec walk** — A catalog/config/unlocks/figures/Loot/Chronicle/bundle → Tasks 1, 4, 5; B riding/recess state/gleams/laps/tallies/accessibility → Tasks 2, 3, 5; C scene/HUD/input/copy/errors → Task 5; D tests → Tasks 1–5. Anything missing is a new task.
- [ ] **Step 5: Hand off** — `superpowers:finishing-a-development-branch` (the branch now carries slices 1–6).
