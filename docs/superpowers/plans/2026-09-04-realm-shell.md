# Realm Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first walkable Realm: hero and companion sprites made from the app's own SVG avatar, walking castle grounds with the kingdom's built buildings under a fixed tabletop camera, gated by the slice-1 access rules, metered by a one-minute heartbeat, shaped by the learning profile, and previewable by parents.

**Architecture:** Game rules are pure modules in `src/lib/realm/` with colocated tests written first (layout, movement, camera, render settings, play clock). The react-three-fiber scene in `src/components/realm/` only draws state kept in refs and forwards input; it is loaded through `next/dynamic` with SSR off so three.js stays out of every other route. The shell component owns the access check and heartbeat through the existing slice-1 actions.

**Tech Stack:** Next.js 16 App Router, React 19, three ^0.185, @react-three/fiber ^9.7, @react-three/drei ^10.7, Drizzle on libsql, Vitest + Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-04-realm-shell-design.md` (read it first; program context in `docs/superpowers/specs/2026-09-02-realm-program-overview.md`; slice 1's access rules in `2026-09-02-realm-foundations-design.md`).

## Global Constraints

- Branch: `realm-foundations` in the worktree `.claude/worktrees/realm-foundations`. Never commit to `main`. Confirm `git branch --show-current` before every commit. Run git as plain single commands (no command substitution around git; the harness refuses those).
- World: `WORLD_SIZE = 40`; castle at `{ x: 0, z: -14 }`; spawn `{ x: 0, z: 15 }`; `HERO_SPEED = 3.5`; `ARRIVE_RADIUS = 0.25`; `HERO_RADIUS = 0.45`; companion gap `1.2`, minimum `0.8`, speed `HERO_SPEED * 0.9`; camera offset `{12, 12, 12}`, zoom `40`, smoothing time constant `0.25 s`, snap under reduced motion.
- Heartbeat: one minute recorded per 60 visible seconds; hidden tabs don't count; warn once at ≤ 1 minute; close at 0 or on a denied re-check; a failed record retries on the next minute, never double-charging. Heroes always see whole minutes remaining. Parents preview with no heartbeat and no recording.
- Render settings from the profile: `motion = !(reducedMotion || lowStimulus)`; `calmPalette = lowStimulus`; `showStick = inputMode === "touch" || (inputMode === "auto" && isTouchDevice)`; `hudScale = largerText ? 1.25 : 1`.
- Canvas: `dpr={[1, 1.5]}`, `gl={{ antialias: false, powerPreference: "high-performance" }}`; sprite textures nearest-filtered, sRGB, `alphaTest 0.1`; `SPRITE_SCALE = 6`.
- Gate copy verbatim from the spec (section A, `gateCopy`). Closed screen title "Well played, {name}!". WebGL-missing copy: "This device can't open the Realm yet. Try a newer browser or another device."
- `"use server"` files export only async functions plus erased types. Reads gate with `requireChildAccess(childId)`.
- No synchronous setState inside `useEffect` bodies (repo lint rule). Per-frame state lives in refs, never React state.
- Vitest: `npx vitest run "<path>"`; `npm test`. Tests colocated. jsdom has no WebGL: the scene is verified by the manual browser pass in Task 9, everything else by unit tests.
- Comments explain why. Commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Final gate: `npm run typecheck && npm test`; `npm run lint` adds no new errors (one pre-existing error in `src/components/quest-template-list.tsx` is known).

## File Map

| File | Responsibility |
|---|---|
| `package.json` | add three, @react-three/fiber, @react-three/drei |
| `src/lib/realm/layout.ts` (+test) | world constants, castle footprints, building slots, `buildWorldLayout` |
| `src/lib/realm/movement.ts` (+test) | hero and companion stepping, target seeking, collider slide |
| `src/lib/realm/camera.ts` (+test) | camera constants and `followCamera` |
| `src/lib/realm/render-settings.ts` (+test) | learning profile → `RenderSettings` |
| `src/lib/realm/play-clock.ts` (+test) | heartbeat state machine and gate copy |
| `src/lib/realm/sprite-texture.ts` (+test for `spriteKey`) | SVG element → nearest-filtered `CanvasTexture`, cache |
| `src/components/avatar.tsx` (exists, +test) | `AvatarFigure`, `CompanionFigure` |
| `src/lib/actions/realm.ts` | `getRealmBundle` |
| `src/components/nav-items.ts` (exists) | Realm entry |
| `src/components/realm/sprite-source.tsx` | renders hidden figures and rasterizes them |
| `src/components/realm/touch-stick.tsx` | on-screen joystick |
| `src/components/realm/use-realm-input.ts` | keyboard + stick + tap → `MoveInput` and targets |
| `src/components/realm/realm-scene.tsx` | the R3F canvas |
| `src/components/realm/realm-hud.tsx` | overlay: name, minutes, banner, leave, preview badge |
| `src/components/realm/realm-gate.tsx` (+test), `realm-closed.tsx` | closed gate and "Well played" |
| `src/components/realm/use-play-clock.ts` | heartbeat hook over the pure clock |
| `src/components/realm/realm-shell.tsx` (+test) | access check, clock, scene mount, preview |
| `src/app/(app)/realm/page.tsx` | route |

---

### Task 1: Dependencies and the world layout

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/lib/realm/layout.ts`, `src/lib/realm/layout.test.ts`

**Interfaces:**
- Produces: `WORLD_SIZE`, `Vec2`, `PropKind`, `Prop`, `WorldLayout`, `CASTLE_POSITION`, `SPAWN`, `CASTLE_FOOTPRINTS`, `BUILDING_SLOTS`, `BUILDING_COLORS`, `buildWorldLayout({ castleType, builtBuildingIds })`.

- [ ] **Step 1: Install the libraries**

Run: `npm install three@^0.185 @react-three/fiber@^9.7 @react-three/drei@^10.7 --no-audit --no-fund`
Expected: `package.json` gains the three dependencies; `npm ls three @react-three/fiber @react-three/drei --depth=0` shows 0.185.x, 9.7.x, 10.7.x.

- [ ] **Step 2: Write the failing test**

`src/lib/realm/layout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN } from "./layout";

describe("buildWorldLayout", () => {
  it("places a castle scaled to its tier, defaulting unknown tiers to a campsite", () => {
    const citadel = buildWorldLayout({ castleType: "citadel", builtBuildingIds: [] });
    const camp = buildWorldLayout({ castleType: "campsite", builtBuildingIds: [] });
    const unknown = buildWorldLayout({ castleType: "moon-base", builtBuildingIds: [] });
    const c = citadel.props.find((p) => p.kind === "castle")!;
    expect(c.position).toEqual(CASTLE_POSITION);
    expect(c.size).toEqual(CASTLE_FOOTPRINTS.citadel);
    expect(c.size.h).toBeGreaterThan(camp.props.find((p) => p.kind === "castle")!.size.h);
    expect(unknown.props.find((p) => p.kind === "castle")!.size).toEqual(CASTLE_FOOTPRINTS.campsite);
  });

  it("shows only built buildings, at their slots, and ignores unknown or repeated ids", () => {
    const layout = buildWorldLayout({ castleType: "keep", builtBuildingIds: ["well", "library", "well", "nope"] });
    const buildings = layout.props.filter((p) => p.kind === "building");
    expect(buildings.map((b) => b.id).sort()).toEqual(["library", "well"]);
    expect(buildings.find((b) => b.id === "well")!.position).toEqual(BUILDING_SLOTS.well);
    expect(buildings.find((b) => b.id === "well")!.label).toBe("Village Well");
  });

  it("lays a walkable path from the gate to the castle and keeps it out of the colliders", () => {
    const layout = buildWorldLayout({ castleType: "castle", builtBuildingIds: [] });
    const path = layout.props.filter((p) => p.kind === "path");
    expect(path.length).toBeGreaterThan(5);
    for (const tile of path) expect(tile.solid).toBe(false);
    expect(layout.colliders.every((c) => c.solid)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "path")).toBe(false);
    expect(Math.max(...path.map((p) => p.position.z))).toBe(17);
  });

  it("spawns inside the world, south of the castle", () => {
    const layout = buildWorldLayout({ castleType: "campsite", builtBuildingIds: [] });
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

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/realm/layout.test.ts` → FAIL, cannot resolve `./layout`.

- [ ] **Step 4: Implement**

`src/lib/realm/layout.ts`:
```ts
import { findBuilding } from "@/lib/utils/kingdom";

/** Units are abstract; the camera zoom maps them to pixels. The ground is WORLD_SIZE² centered on the origin. */
export const WORLD_SIZE = 40;

export type Vec2 = { x: number; z: number };
export type PropKind = "castle" | "building" | "path";

export type Prop = {
  id: string;
  kind: PropKind;
  label: string;
  position: Vec2; // center
  size: { w: number; d: number; h: number }; // footprint width (x), depth (z), height (y)
  color: string;
  solid: boolean; // walkable props (paths) are not colliders
};

export type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[] };

export const CASTLE_POSITION: Vec2 = { x: 0, z: -14 };
export const SPAWN: Vec2 = { x: 0, z: 15 };
const GATE_Z = 17;

/** Eight castle tiers, tent-sized to towering. Order matches CASTLE_TYPES in the avatar catalog. */
export const CASTLE_FOOTPRINTS: Record<string, { w: number; d: number; h: number }> = {
  campsite: { w: 2, d: 2, h: 1.5 },
  cottage: { w: 3, d: 3, h: 2.5 },
  watchtower: { w: 2.5, d: 2.5, h: 5 },
  keep: { w: 5, d: 4, h: 4 },
  manor: { w: 6, d: 5, h: 4.5 },
  castle: { w: 8, d: 6, h: 6 },
  fortress: { w: 9, d: 7, h: 7 },
  citadel: { w: 10, d: 8, h: 8 },
};

/** Where each kingdom building stands once its deeds are done. Alternating sides of the path. */
export const BUILDING_SLOTS: Record<string, Vec2> = {
  well: { x: -5, z: 8 },
  mill: { x: 6, z: 6 },
  bridge: { x: -7, z: 0 },
  chapel: { x: 7, z: -2 },
  market: { x: -5, z: -6 },
  library: { x: 6, z: -8 },
  watchtower: { x: -9, z: -12 },
  garden: { x: 9, z: -13 },
};

export const BUILDING_COLORS: Record<string, string> = {
  well: "#5b8fb9",
  mill: "#b08a5a",
  bridge: "#8c7a6b",
  chapel: "#d8cfc0",
  market: "#c0563d",
  library: "#6f5a8a",
  watchtower: "#7d7d7d",
  garden: "#5aa55a",
};

const BUILDING_SIZE = { w: 3, d: 3, h: 2.5 };
const WATCHTOWER_SIZE = { w: 2, d: 2, h: 5 };
const CASTLE_COLOR = "#9a9aa8";
const PATH_COLOR = "#c9b27a";

export function buildWorldLayout(input: { castleType: string; builtBuildingIds: string[] }): WorldLayout {
  const castleSize = CASTLE_FOOTPRINTS[input.castleType] ?? CASTLE_FOOTPRINTS.campsite;
  const props: Prop[] = [
    { id: "castle", kind: "castle", label: "Castle", position: CASTLE_POSITION, size: castleSize, color: CASTLE_COLOR, solid: true },
  ];

  // A row of flat tiles from the south gate to the castle's south face.
  const castleSouth = CASTLE_POSITION.z + castleSize.d / 2 + 1;
  for (let z = GATE_Z; z >= castleSouth; z -= 2) {
    props.push({ id: `path-${z}`, kind: "path", label: "Path", position: { x: 0, z }, size: { w: 2, d: 2, h: 0.05 }, color: PATH_COLOR, solid: false });
  }

  const seen = new Set<string>();
  for (const id of input.builtBuildingIds) {
    const slot = BUILDING_SLOTS[id];
    const building = findBuilding(id);
    if (!slot || !building || seen.has(id)) continue;
    seen.add(id);
    props.push({
      id,
      kind: "building",
      label: building.label,
      position: slot,
      size: id === "watchtower" ? WATCHTOWER_SIZE : BUILDING_SIZE,
      color: BUILDING_COLORS[id] ?? "#888888",
      solid: true,
    });
  }

  return { props, spawn: SPAWN, colliders: props.filter((p) => p.solid) };
}
```

- [ ] **Step 5: Run the test, gate, commit**

Run: `npx vitest run src/lib/realm/layout.test.ts && npm run typecheck`
```bash
git add package.json package-lock.json src/lib/realm/layout.ts src/lib/realm/layout.test.ts
git commit -m "Add three.js libraries and the Realm world layout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Hero and companion movement

**Files:**
- Create: `src/lib/realm/movement.ts`, `src/lib/realm/movement.test.ts`

**Interfaces:**
- Consumes: `WORLD_SIZE`, `Prop`, `Vec2` (Task 1).
- Produces: `HERO_SPEED`, `ARRIVE_RADIUS`, `HERO_RADIUS`, `COMPANION_GAP`, `COMPANION_MIN_GAP`, `Facing`, `HeroState`, `MoveInput`, `CompanionState`, `stepHero(state, input, dt, colliders)`, `setTarget(state, target, colliders)`, `stepCompanion(companion, hero, dt)`, `FACING_VEC`.

- [ ] **Step 1: Write the failing test**

`src/lib/realm/movement.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stepHero, setTarget, stepCompanion, HERO_SPEED, ARRIVE_RADIUS, HERO_RADIUS, COMPANION_MIN_GAP, type HeroState } from "./movement";
import { WORLD_SIZE, type Prop } from "./layout";

const idle: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null };
const noInput = { axis: { x: 0, z: 0 } };
const wall: Prop = { id: "wall", kind: "building", label: "Wall", position: { x: 3, z: 0 }, size: { w: 2, d: 2, h: 2 }, color: "#000", solid: true };

function run(state: HeroState, input: { axis: { x: number; z: number } }, seconds: number, colliders: Prop[] = []) {
  let s = state;
  const dt = 1 / 60;
  // Integer step count: accumulating 1/60 in floating point can run one extra frame.
  for (let i = 0; i < Math.round(seconds * 60); i++) s = stepHero(s, input, dt, colliders);
  return s;
}

describe("stepHero with axis input", () => {
  it("moves at HERO_SPEED and no faster on diagonals", () => {
    const east = run(idle, { axis: { x: 1, z: 0 } }, 1);
    expect(east.position.x).toBeCloseTo(HERO_SPEED, 1);
    const diag = run(idle, { axis: { x: 1, z: 1 } }, 1);
    expect(Math.hypot(diag.position.x, diag.position.z)).toBeCloseTo(HERO_SPEED, 1);
  });
  it("faces the dominant axis and keeps facing when idle", () => {
    expect(stepHero(idle, { axis: { x: -1, z: 0.2 } }, 1 / 60, []).facing).toBe("w");
    expect(stepHero(idle, { axis: { x: 0.1, z: -1 } }, 1 / 60, []).facing).toBe("n");
    expect(stepHero({ ...idle, facing: "e" }, noInput, 1 / 60, []).facing).toBe("e");
  });
  it("clears a pending target", () => {
    const withTarget = setTarget(idle, { x: 5, z: 5 }, []);
    expect(stepHero(withTarget, { axis: { x: 0, z: 1 } }, 1 / 60, []).target).toBeNull();
  });
  it("is unchanged with no input and no target", () => {
    expect(stepHero(idle, noInput, 1 / 60, [])).toBe(idle);
  });
});

describe("targets", () => {
  it("walks to a target and stops within ARRIVE_RADIUS, clearing it", () => {
    const s = run(setTarget(idle, { x: 4, z: 0 }, []), noInput, 3);
    expect(Math.hypot(s.position.x - 4, s.position.z)).toBeLessThanOrEqual(ARRIVE_RADIUS + 0.01);
    expect(s.target).toBeNull();
  });
  it("clamps a target into the world and refuses one inside a solid prop", () => {
    expect(setTarget(idle, { x: 100, z: -100 }, []).target).toEqual({ x: WORLD_SIZE / 2 - HERO_RADIUS, z: -(WORLD_SIZE / 2 - HERO_RADIUS) });
    expect(setTarget(idle, { x: 3, z: 0 }, [wall]).target).toBeNull();
  });
});

describe("colliders and bounds", () => {
  it("stops at a wall but keeps sliding along it", () => {
    const s = run(idle, { axis: { x: 1, z: 1 } }, 1.5, [wall]);
    expect(s.position.x).toBeLessThanOrEqual(wall.position.x - wall.size.w / 2 - HERO_RADIUS + 0.01);
    expect(s.position.z).toBeGreaterThan(1);
  });
  it("never leaves the ground", () => {
    const s = run(idle, { axis: { x: 1, z: 0 } }, 20);
    expect(s.position.x).toBeLessThanOrEqual(WORLD_SIZE / 2 - HERO_RADIUS);
  });
  it("drops a target it cannot reach", () => {
    const s = run(setTarget({ ...idle, position: { x: 0, z: 0 } }, { x: 6, z: 0 }, [wall]), noInput, 3, [wall]);
    expect(s.target).toBeNull();
  });
});

describe("stepCompanion", () => {
  it("settles behind the hero at the trailing gap", () => {
    let c = { position: { x: 5, z: 5 } };
    for (let i = 0; i < 600; i++) c = stepCompanion(c, idle, 1 / 60);
    expect(c.position.x).toBeCloseTo(0, 1);
    expect(c.position.z).toBeCloseTo(-1.2, 1);
  });
  it("never crowds closer than the minimum gap", () => {
    const c = stepCompanion({ position: { x: 0.1, z: 0 } }, idle, 1 / 60);
    expect(Math.hypot(c.position.x, c.position.z)).toBeGreaterThanOrEqual(COMPANION_MIN_GAP - 0.001);
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/realm/movement.ts`:
```ts
import { WORLD_SIZE, type Prop, type Vec2 } from "./layout";

export const HERO_SPEED = 3.5; // units per second
export const ARRIVE_RADIUS = 0.25;
export const HERO_RADIUS = 0.45;
export const COMPANION_GAP = 1.2;
export const COMPANION_MIN_GAP = 0.8;

export type Facing = "n" | "s" | "e" | "w";
export type HeroState = { position: Vec2; facing: Facing; target: Vec2 | null };
export type MoveInput = { axis: Vec2 }; // −1..1 per axis; zero when idle
export type CompanionState = { position: Vec2 };

export const FACING_VEC: Record<Facing, Vec2> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };

const LIMIT = WORLD_SIZE / 2 - HERO_RADIUS;

function clampToWorld(p: Vec2): Vec2 {
  return { x: Math.max(-LIMIT, Math.min(LIMIT, p.x)), z: Math.max(-LIMIT, Math.min(LIMIT, p.z)) };
}

/** True when a point sits inside a prop's footprint grown by the hero's radius. */
function blocked(p: Vec2, prop: Prop): boolean {
  const hw = prop.size.w / 2 + HERO_RADIUS;
  const hd = prop.size.d / 2 + HERO_RADIUS;
  return Math.abs(p.x - prop.position.x) < hw && Math.abs(p.z - prop.position.z) < hd;
}

function facingFrom(dx: number, dz: number, previous: Facing): Facing {
  if (dx === 0 && dz === 0) return previous;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? "e" : "w";
  return dz > 0 ? "s" : "n";
}

/** A tap sets a destination; a tap inside a wall is ignored rather than walking the hero into it. */
export function setTarget(state: HeroState, target: Vec2, colliders: Prop[]): HeroState {
  const t = clampToWorld(target);
  if (colliders.some((c) => blocked(t, c))) return state;
  return { ...state, target: t };
}

/**
 * One frame of hero motion. Stick or keys win over a pending tap. Movement is
 * applied one axis at a time and a blocked axis is simply cancelled, which is
 * what makes the hero slide along walls instead of sticking to them.
 */
export function stepHero(state: HeroState, input: MoveInput, dt: number, colliders: Prop[]): HeroState {
  let vx = 0;
  let vz = 0;
  let target = state.target;
  const len = Math.hypot(input.axis.x, input.axis.z);
  if (len > 0.01) {
    vx = (input.axis.x / len) * HERO_SPEED;
    vz = (input.axis.z / len) * HERO_SPEED;
    target = null;
  } else if (target) {
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_RADIUS) return { ...state, target: null };
    const step = Math.min(dist, HERO_SPEED * dt) / dt;
    vx = (dx / dist) * step;
    vz = (dz / dist) * step;
  } else {
    return state;
  }

  let x = state.position.x + vx * dt;
  let z = state.position.z;
  if (colliders.some((c) => blocked({ x, z }, c))) x = state.position.x;
  z = state.position.z + vz * dt;
  if (colliders.some((c) => blocked({ x, z }, c))) z = state.position.z;

  const position = clampToWorld({ x, z });
  const moved = position.x !== state.position.x || position.z !== state.position.z;
  const facing = facingFrom(position.x - state.position.x, position.z - state.position.z, state.facing);
  // A target the hero cannot make progress toward is dropped, so a tap behind a wall doesn't pin them.
  if (target && !moved) target = null;
  return { position, facing, target };
}

/** The companion eases toward a spot behind the hero and never crowds them. */
export function stepCompanion(companion: CompanionState, hero: HeroState, dt: number): CompanionState {
  const f = FACING_VEC[hero.facing];
  const goal = { x: hero.position.x - f.x * COMPANION_GAP, z: hero.position.z - f.z * COMPANION_GAP };
  const dx = goal.x - companion.position.x;
  const dz = goal.z - companion.position.z;
  const dist = Math.hypot(dx, dz);
  let next = companion.position;
  if (dist > 0.001) {
    const step = Math.min(dist, HERO_SPEED * 0.9 * dt);
    next = { x: companion.position.x + (dx / dist) * step, z: companion.position.z + (dz / dist) * step };
  }
  const hx = next.x - hero.position.x;
  const hz = next.z - hero.position.z;
  const hd = Math.hypot(hx, hz);
  if (hd < COMPANION_MIN_GAP) {
    const ux = hd > 0.001 ? hx / hd : -f.x;
    const uz = hd > 0.001 ? hz / hd : -f.z;
    next = { x: hero.position.x + ux * COMPANION_MIN_GAP, z: hero.position.z + uz * COMPANION_MIN_GAP };
  }
  return { position: next };
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/realm/movement.test.ts` → pass (tune nothing in the tests; if the slide test fails, check the axis order in `stepHero`).
```bash
git add src/lib/realm/movement.ts src/lib/realm/movement.test.ts
git commit -m "Add Realm hero and companion movement rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Camera follow and render settings

**Files:**
- Create: `src/lib/realm/camera.ts` (+test), `src/lib/realm/render-settings.ts` (+test)

**Interfaces:**
- Consumes: `Vec2` (Task 1); `LearningProfile` from `@/lib/utils/learning-profile`.
- Produces: `CAMERA_OFFSET`, `CAMERA_ZOOM`, `followCamera(current, hero, dt, { reducedMotion })`; `RenderSettings`, `renderSettingsFor(profile, isTouchDevice)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/realm/camera.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { followCamera, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";

describe("followCamera", () => {
  it("eases toward the hero and converges", () => {
    let cam = { x: 0, z: 0 };
    const hero = { x: 10, z: -4 };
    const first = followCamera(cam, hero, 1 / 60, { reducedMotion: false });
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(10);
    for (let i = 0; i < 300; i++) cam = followCamera(cam, hero, 1 / 60, { reducedMotion: false });
    expect(cam.x).toBeCloseTo(10, 1);
    expect(cam.z).toBeCloseTo(-4, 1);
  });
  it("snaps under reduced motion", () => {
    expect(followCamera({ x: 0, z: 0 }, { x: 10, z: -4 }, 1 / 60, { reducedMotion: true })).toEqual({ x: 10, z: -4 });
  });
  it("exposes the tabletop constants", () => {
    expect(CAMERA_OFFSET).toEqual({ x: 12, y: 12, z: 12 });
    expect(CAMERA_ZOOM).toBe(40);
  });
});
```

`src/lib/realm/render-settings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderSettingsFor } from "./render-settings";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

describe("renderSettingsFor", () => {
  it("keeps motion and the normal palette by default, stick only on touch devices", () => {
    expect(renderSettingsFor(DEFAULT_LEARNING_PROFILE, false)).toEqual({ motion: true, calmPalette: false, showStick: false, hudScale: 1 });
    expect(renderSettingsFor(DEFAULT_LEARNING_PROFILE, true).showStick).toBe(true);
  });
  it("disables motion for reduced motion or low stimulus, calm palette only for low stimulus", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, reducedMotion: true }, false)).toMatchObject({ motion: false, calmPalette: false });
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, lowStimulus: true }, false)).toMatchObject({ motion: false, calmPalette: true });
  });
  it("honors an explicit input mode over the device", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" }, false).showStick).toBe(true);
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, inputMode: "keyboard" }, true).showStick).toBe(false);
  });
  it("scales the HUD for larger text", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, largerText: true }, false).hudScale).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/realm/camera.ts`:
```ts
import type { Vec2 } from "./layout";

/** Fixed tabletop angle from the spike: equal offsets on all three axes, looking at the follow point. */
export const CAMERA_OFFSET = { x: 12, y: 12, z: 12 };
export const CAMERA_ZOOM = 40;
const SMOOTHING_SECONDS = 0.25;

/** Eases the follow point toward the hero; snaps when a hero has asked for no motion. */
export function followCamera(current: Vec2, hero: Vec2, dt: number, opts: { reducedMotion: boolean }): Vec2 {
  if (opts.reducedMotion) return { x: hero.x, z: hero.z };
  const k = 1 - Math.exp(-dt / SMOOTHING_SECONDS);
  return { x: current.x + (hero.x - current.x) * k, z: current.z + (hero.z - current.z) * k };
}
```

`src/lib/realm/render-settings.ts`:
```ts
import type { LearningProfile } from "@/lib/utils/learning-profile";

export type RenderSettings = {
  motion: boolean;      // idle bob, sparkle, camera easing
  calmPalette: boolean; // muted ground and sky, no day-night shift
  showStick: boolean;   // on-screen joystick
  hudScale: number;     // 1 or 1.25
};

/** The learning profile decides how the world moves and looks; nothing here is a preference the hero toggles in-game. */
export function renderSettingsFor(profile: LearningProfile, isTouchDevice: boolean): RenderSettings {
  return {
    motion: !(profile.reducedMotion || profile.lowStimulus),
    calmPalette: profile.lowStimulus,
    showStick: profile.inputMode === "touch" || (profile.inputMode === "auto" && isTouchDevice),
    hudScale: profile.largerText ? 1.25 : 1,
  };
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/realm/camera.test.ts src/lib/realm/render-settings.test.ts`
```bash
git add src/lib/realm/camera.ts src/lib/realm/camera.test.ts src/lib/realm/render-settings.ts src/lib/realm/render-settings.test.ts
git commit -m "Add Realm camera follow and profile-driven render settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Play clock and gate copy

**Files:**
- Create: `src/lib/realm/play-clock.ts`, `src/lib/realm/play-clock.test.ts`

**Interfaces:**
- Consumes: `AccessResult` from `@/lib/utils/realm-access`; `formatTimeOfDay` from `@/lib/utils/schedule-days`.
- Produces: `PlayClock`, `ClockEvent`, `startClock(minutesRemaining)`, `tickClock(clock, elapsedSeconds, visible)`, `applyAccess(clock, result)`, `gateCopy(result, next?)`, `GateCopy`.

- [ ] **Step 1: Write the failing test**

`src/lib/realm/play-clock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { startClock, tickClock, applyAccess, gateCopy } from "./play-clock";

function tickFor(clock: ReturnType<typeof startClock>, seconds: number, visible = true) {
  const events: string[] = [];
  let c = clock;
  for (let i = 0; i < seconds; i++) {
    const r = tickClock(c, 1, visible);
    c = r.clock;
    if (r.event) events.push(r.event);
  }
  return { clock: c, events };
}

describe("tickClock", () => {
  it("records once per 60 visible seconds", () => {
    const { clock, events } = tickFor(startClock(5), 125);
    expect(events.filter((e) => e === "record")).toHaveLength(2);
    expect(clock.secondsThisMinute).toBe(5);
  });
  it("ignores hidden time", () => {
    const { events } = tickFor(startClock(5), 200, false);
    expect(events).toEqual([]);
  });
  it("warns exactly once at one minute left", () => {
    const { events } = tickFor(startClock(1), 10);
    expect(events.filter((e) => e === "warn")).toHaveLength(1);
  });
  it("closes at zero", () => {
    const { clock, events } = tickFor(startClock(0), 2);
    expect(events[0]).toBe("close");
    expect(clock.closed).toBe(true);
  });
});

describe("applyAccess", () => {
  it("adopts the fresh minutes and warns or closes accordingly", () => {
    const c = startClock(5);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 3, source: "earned" }).clock.minutesRemaining).toBe(3);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 1, source: "earned" }).event).toBe("warn");
    expect(applyAccess(c, { allowed: true, minutesRemaining: 0, source: "earned" }).event).toBe("close");
    expect(applyAccess(c, { allowed: false, reason: "cap_reached" }).event).toBe("close");
  });
});

describe("gateCopy", () => {
  it("names each reason in the hero's terms", () => {
    expect(gateCopy({ allowed: false, reason: "no_minutes" })).toEqual({ title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" }, { recessStart: "10:30" })).toEqual({ title: "Recess hasn't started.", body: "Recess opens at 10:30 AM." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" }).body).toBe("Ask a grown-up when recess is.");
    expect(gateCopy({ allowed: false, reason: "cap_reached" })).toEqual({ title: "You've played your minutes for today.", body: "The Realm will be waiting tomorrow." });
    expect(gateCopy({ allowed: false, reason: "school_hours" })).toEqual({ title: "It's school time.", body: "The Realm opens after your last class." });
    expect(gateCopy({ allowed: false, reason: "disabled" })).toEqual({ title: "The Realm is closed for this hero.", body: "A grown-up can open it in the Chronicle." });
  });
  it("has nothing to say when access is allowed", () => {
    expect(gateCopy({ allowed: true, minutesRemaining: 5, source: "earned" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/realm/play-clock.ts`:
```ts
import type { AccessResult } from "@/lib/utils/realm-access";
import { formatTimeOfDay } from "@/lib/utils/schedule-days";

export type PlayClock = {
  minutesRemaining: number; // from the last access check
  secondsThisMinute: number; // 0..59 of visible play since the last record
  warned: boolean;
  closed: boolean;
};
export type ClockEvent = "record" | "warn" | "close" | null;

export function startClock(minutesRemaining: number): PlayClock {
  return { minutesRemaining: Math.max(0, Math.floor(minutesRemaining)), secondsThisMinute: 0, warned: false, closed: false };
}

/**
 * Only visible seconds count, so a tab left open in the background never
 * spends a hero's minutes. A record is emitted every 60 such seconds; the
 * caller writes it to the ledger and refreshes access.
 */
export function tickClock(clock: PlayClock, elapsedSeconds: number, visible: boolean): { clock: PlayClock; event: ClockEvent } {
  if (clock.closed) return { clock, event: null };
  if (clock.minutesRemaining <= 0) return { clock: { ...clock, closed: true }, event: "close" };
  if (!visible) return { clock, event: null };
  let seconds = clock.secondsThisMinute + elapsedSeconds;
  let event: ClockEvent = null;
  if (seconds >= 60) {
    seconds -= 60;
    event = "record";
  }
  let warned = clock.warned;
  if (!warned && clock.minutesRemaining <= 1) {
    warned = true;
    if (!event) event = "warn";
  }
  return { clock: { ...clock, secondsThisMinute: seconds, warned }, event };
}

/** A fresh access check replaces the remaining minutes and may warn or close. */
export function applyAccess(clock: PlayClock, result: AccessResult): { clock: PlayClock; event: ClockEvent } {
  if (!result.allowed || result.minutesRemaining <= 0) {
    return { clock: { ...clock, minutesRemaining: 0, closed: true }, event: "close" };
  }
  const minutesRemaining = Math.floor(result.minutesRemaining);
  const shouldWarn = minutesRemaining <= 1 && !clock.warned;
  return { clock: { ...clock, minutesRemaining, warned: clock.warned || shouldWarn }, event: shouldWarn ? "warn" : null };
}

export type GateCopy = { title: string; body: string };

/** Why the gate is shut, in the hero's own terms. Null when it is open. */
export function gateCopy(result: AccessResult, next?: { recessStart?: string }): GateCopy | null {
  if (result.allowed) return null;
  switch (result.reason) {
    case "no_minutes":
      return { title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." };
    case "outside_recess":
      return {
        title: "Recess hasn't started.",
        body: next?.recessStart ? `Recess opens at ${formatTimeOfDay(next.recessStart)}.` : "Ask a grown-up when recess is.",
      };
    case "cap_reached":
      return { title: "You've played your minutes for today.", body: "The Realm will be waiting tomorrow." };
    case "school_hours":
      return { title: "It's school time.", body: "The Realm opens after your last class." };
    case "disabled":
      return { title: "The Realm is closed for this hero.", body: "A grown-up can open it in the Chronicle." };
  }
}
```
If `formatTimeOfDay("10:30")` in `schedule-days.ts` does not produce exactly `10:30 AM`, adjust the test expectation to that function's real output (it is the app's one time formatter; do not write a second one).

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/realm/play-clock.test.ts`
```bash
git add src/lib/realm/play-clock.ts src/lib/realm/play-clock.test.ts
git commit -m "Add the Realm play clock and gate copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Avatar figures and the sprite texture pipeline

**Files:**
- Modify: `src/components/avatar.tsx` (append two exports at the end of the file)
- Create: `src/components/avatar-figures.test.tsx`, `src/lib/realm/sprite-texture.ts`, `src/lib/realm/sprite-texture.test.ts`, `src/lib/realm/input-mapping.ts`, `src/lib/realm/input-mapping.test.ts`

**Interfaces:**
- Consumes: the module-private layer components already in `avatar.tsx` (`BodyLayer`, `ArmsLayer`, `LegsLayer`, `BootsLayer`, `HeadLayer`, `HairLayer`, `AccessoryLayer`, `CompanionLayer`), `SIZE_MAP`, `normalizeAvatarConfig`, `SKIN_TONES`.
- Produces: `AvatarFigure({ config, size?, className? })` (svg with `data-figure="hero"`), `CompanionFigure({ companion, color, size?, className? })` (svg with `data-figure="companion"`); `SPRITE_SCALE`, `spriteKey(config)`, `svgElementToTexture(svg, scale?)`, `getCachedTexture(key)`, `setCachedTexture(key, texture)`, `disposeSpriteTextures()`; `screenToWorldAxis(screen: { x: number; y: number }): Vec2`.

- [ ] **Step 1: Write the failing tests**

`src/components/avatar-figures.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Avatar, AvatarFigure, CompanionFigure } from "./avatar";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

afterEach(cleanup);
const SHAPES = "rect,path,circle,polygon,ellipse,line";
const config = { ...DEFAULT_AVATAR, companion: "cat", accessory: "cape" };

describe("AvatarFigure", () => {
  it("draws the hero without the crest or the companion", () => {
    const full = render(<Avatar config={config} name="Lily" size="xl" />).container.querySelectorAll(SHAPES).length;
    cleanup();
    const figure = render(<AvatarFigure config={config} />).container;
    expect(figure.querySelector('svg[data-figure="hero"]')).not.toBeNull();
    expect(figure.querySelectorAll(SHAPES).length).toBeGreaterThan(0);
    expect(figure.querySelectorAll(SHAPES).length).toBeLessThan(full);
  });
});

describe("CompanionFigure", () => {
  it("draws only the companion, and nothing without one", () => {
    const withCat = render(<CompanionFigure companion="cat" color="#f0a050" />).container;
    expect(withCat.querySelector('svg[data-figure="companion"]')).not.toBeNull();
    expect(withCat.querySelectorAll(SHAPES).length).toBeGreaterThan(0);
    cleanup();
    const none = render(<CompanionFigure companion={null} color="#f0a050" />).container;
    expect(none.querySelectorAll(SHAPES).length).toBe(0);
  });
});
```

`src/lib/realm/sprite-texture.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { spriteKey } from "./sprite-texture";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

describe("spriteKey", () => {
  it("is stable for the same look and ignores the crest", () => {
    expect(spriteKey(DEFAULT_AVATAR)).toBe(spriteKey({ ...DEFAULT_AVATAR }));
    expect(spriteKey({ ...DEFAULT_AVATAR, background: "star", backgroundColor: "#000000" })).toBe(spriteKey(DEFAULT_AVATAR));
  });
  it("changes when the look changes", () => {
    expect(spriteKey({ ...DEFAULT_AVATAR, hairStyle: "ponytail" })).not.toBe(spriteKey(DEFAULT_AVATAR));
    expect(spriteKey({ ...DEFAULT_AVATAR, companion: "fox" })).not.toBe(spriteKey(DEFAULT_AVATAR));
  });
});
```

`src/lib/realm/input-mapping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { screenToWorldAxis } from "./input-mapping";

describe("screenToWorldAxis", () => {
  it("maps screen-up to away from the camera and screen-right to the camera's right", () => {
    const up = screenToWorldAxis({ x: 0, y: 1 });
    expect(up.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(up.z).toBeCloseTo(-Math.SQRT1_2, 5);
    const right = screenToWorldAxis({ x: 1, y: 0 });
    expect(right.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(right.z).toBeCloseTo(-Math.SQRT1_2, 5);
  });
  it("keeps zero at zero", () => {
    expect(screenToWorldAxis({ x: 0, y: 0 })).toEqual({ x: 0, z: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/avatar-figures.test.tsx src/lib/realm/sprite-texture.test.ts src/lib/realm/input-mapping.test.ts` → FAIL (missing exports and modules).

- [ ] **Step 3: Append the figures to `avatar.tsx`**

At the end of `src/components/avatar.tsx`:
```tsx
// ── Realm figures ────────────────────────────────────────────
// The Realm draws the hero and companion as separate sprites, so each gets
// its own SVG: the hero without the crest (a shield behind a walking figure
// looks wrong), the companion alone so it can trail behind.

export function AvatarFigure({
  config,
  size = "xl",
  className = "",
}: {
  config: AvatarConfig;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}) {
  const px = SIZE_MAP[size];
  const c = normalizeAvatarConfig(config as unknown as Record<string, unknown>);
  const skinHex = SKIN_TONES.find((s) => s.id === c.skinTone)?.hex ?? "#d4956b";
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 36 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
      data-figure="hero"
    >
      <g transform="translate(0, 8)">
        <BodyLayer outfit={c.outfit} outfitColor={c.outfitColor} />
        <ArmsLayer skinHex={skinHex} />
        <LegsLayer legwear={c.legwear} legwearColor={c.legwearColor} />
        <BootsLayer boots={c.boots} color={c.bootsColor} />
        <HeadLayer skinHex={skinHex} />
        <HairLayer style={c.hairStyle} color={c.hairColor} />
        <AccessoryLayer accessory={c.accessory} color={c.accessoryColor} />
      </g>
    </svg>
  );
}

export function CompanionFigure({
  companion,
  color,
  size = "xl",
  className = "",
}: {
  companion: string | null;
  color: string;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}) {
  const px = SIZE_MAP[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 36 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
      data-figure="companion"
    >
      <g transform="translate(0, 8)">
        <g transform="translate(4, 8)">
          <CompanionLayer companion={companion} color={color} />
        </g>
      </g>
    </svg>
  );
}
```
If the layer components in `avatar.tsx` use different prop names than shown (check the `Avatar` function body near the top of the file, which is the source of truth), use those names.

- [ ] **Step 4: Sprite texture util and input mapping**

`src/lib/realm/sprite-texture.ts`:
```ts
import * as THREE from "three";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";

/** 36×48 SVG units → 216×288 px: crisp at the tabletop zoom, small enough to rasterize in a few ms. */
export const SPRITE_SCALE = 6;
const SVG_W = 36;
const SVG_H = 48;

/** The fields that change the drawn figure. The crest never appears on a sprite, so it is excluded. */
export function spriteKey(config: AvatarConfig): string {
  const { background: _bg, backgroundColor: _bgColor, ...visual } = config;
  return JSON.stringify(visual, Object.keys(visual).sort());
}

/** Serializes an inline <svg> and draws it onto a canvas with smoothing off, so pixel art stays pixel art. */
export async function svgElementToTexture(svg: SVGSVGElement, scale = SPRITE_SCALE): Promise<THREE.CanvasTexture> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(SVG_W * scale));
  clone.setAttribute("height", String(SVG_H * scale));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The hero's picture could not be drawn."));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = SVG_W * scale;
  canvas.height = SVG_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The hero's picture could not be drawn.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  return texture;
}

const cache = new Map<string, THREE.CanvasTexture>();

export function getCachedTexture(key: string): THREE.CanvasTexture | undefined {
  return cache.get(key);
}

export function setCachedTexture(key: string, texture: THREE.CanvasTexture): void {
  cache.set(key, texture);
}

/** Called when the shell unmounts so GPU memory follows the page away. */
export function disposeSpriteTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
```
If ESLint objects to the unused `_bg`/`_bgColor` destructuring, build `visual` explicitly from the named fields instead (skinTone, hairStyle, hairColor, outfit, outfitColor, legwear, legwearColor, boots, bootsColor, accessory, accessoryColor, companion, companionColor).

`src/lib/realm/input-mapping.ts`:
```ts
import type { Vec2 } from "./layout";

/**
 * The camera sits at +x +y +z looking at the origin, so "up" on the screen
 * is the world direction (−1, −1) on the ground and "right" is (1, −1).
 * Stick and keys speak screen directions; the hero walks world directions.
 */
export function screenToWorldAxis(screen: { x: number; y: number }): Vec2 {
  const x = (screen.x - screen.y) * Math.SQRT1_2;
  const z = (-screen.x - screen.y) * Math.SQRT1_2;
  return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
}
```

- [ ] **Step 5: Run, gate, commit**

Run: `npx vitest run src/components/avatar-figures.test.tsx src/lib/realm/sprite-texture.test.ts src/lib/realm/input-mapping.test.ts && npm run typecheck`
```bash
git add src/components/avatar.tsx src/components/avatar-figures.test.tsx src/lib/realm/sprite-texture.ts src/lib/realm/sprite-texture.test.ts src/lib/realm/input-mapping.ts src/lib/realm/input-mapping.test.ts
git commit -m "Add Realm avatar figures, the sprite texture pipeline, and input mapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Realm bundle action and nav

**Files:**
- Create: `src/lib/actions/realm.ts`
- Modify: `src/components/nav-items.ts`

**Interfaces:**
- Consumes: `schema.child`, `schema.castle`, `schema.kingdomProgress`, `schema.learningProfile`; `loadRealmSettings` from `@/lib/services/realm-play`; `profileFromRow`, `LearningProfile`; `normalizeAvatarConfig`, `isValidAvatarConfig`, `AvatarConfig`.
- Produces: `type RealmBundle = { heroName: string; avatarConfig: AvatarConfig | null; castleType: string; builtBuildingIds: string[]; profile: LearningProfile; settings: { enabled: boolean; toneMode: "gentle" | "monsters" } }`, `getRealmBundle(childId): Promise<RealmBundle>`.

- [ ] **Step 1: Write the action**

`src/lib/actions/realm.ts`:
```ts
"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";

export type RealmBundle = {
  heroName: string;
  avatarConfig: AvatarConfig | null;
  castleType: string;
  builtBuildingIds: string[];
  profile: LearningProfile;
  settings: { enabled: boolean; toneMode: "gentle" | "monsters" };
};

/** Everything the Realm page needs, in one round of parallel reads. A hero may read their own. */
export async function getRealmBundle(childId: string): Promise<RealmBundle> {
  await requireChildAccess(childId);
  const [childRows, castleRows, progressRows, profileRows, settings] = await Promise.all([
    db.select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ type: schema.castle.type }).from(schema.castle).where(eq(schema.castle.childId, childId)).limit(1),
    db.select({ buildingId: schema.kingdomProgress.buildingId }).from(schema.kingdomProgress).where(and(eq(schema.kingdomProgress.childId, childId), isNotNull(schema.kingdomProgress.completedAt))),
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
    loadRealmSettings(childId),
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
    builtBuildingIds: progressRows.map((p) => p.buildingId),
    profile: profileFromRow(profileRows[0] ?? null),
    settings: { enabled: settings.enabled, toneMode: settings.toneMode },
  };
}
```

- [ ] **Step 2: Nav**

In `src/components/nav-items.ts`, insert after the Ranks (`/leaderboard`) entry and before Schedule:
```ts
  {
    href: "/realm",
    label: "Realm",
    icon: "castle",
    description: "Walk your kingdom — the castle, the buildings your deeds raised, and your companion at your side.",
  },
```

- [ ] **Step 3: Gate, commit**

Run: `npm run typecheck && npm test`
```bash
git add src/lib/actions/realm.ts src/components/nav-items.ts
git commit -m "Add the Realm bundle action and nav entry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Scene, input, stick, and HUD

**Files:**
- Create: `src/components/realm/sprite-source.tsx`, `src/components/realm/touch-stick.tsx`, `src/components/realm/use-realm-input.ts`, `src/components/realm/realm-scene.tsx`, `src/components/realm/realm-hud.tsx`, `src/components/realm/realm-hud.test.tsx`
- Modify: `src/app/globals.css` (Realm label and HUD styles)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `SpriteTextures = { hero: THREE.CanvasTexture; companion: THREE.CanvasTexture | null }`, `SpriteSource({ config, onReady, onError })`, `TouchStick({ onChange, size? })`, `useRealmInput(): { axisRef: RefObject<Vec2>; setStick: (screen: { x: number; y: number }) => void }`, `RealmScene({ layout, textures, settings })` (default export), `RealmHud({ heroName, minutesRemaining, warning, preview, hudScale, error, onRetry })`.

- [ ] **Step 1: Write the failing HUD test**

`src/components/realm/realm-hud.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

describe("RealmHud", () => {
  it("shows the hero's minutes and the one-minute banner", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
    expect(screen.queryByText(/one minute left/i)).not.toBeInTheDocument();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={1} warning={true} preview={null} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("One minute left in the Realm today.")).toBeInTheDocument();
  });
  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });
  it("links back to the Tavern", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={3} warning={false} preview={null} hudScale={1.25} error="" onRetry={() => {}} />);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });
});
```

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Write the components**

`src/components/realm/sprite-source.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";

export type SpriteTextures = { hero: THREE.CanvasTexture; companion: THREE.CanvasTexture | null };

/**
 * Renders the hero and companion figures off-screen and rasterizes them. The
 * SVG must exist in the DOM to be serialized, which is why this is a component
 * rather than a plain function.
 */
export function SpriteSource({
  config,
  onReady,
  onError,
}: {
  config: AvatarConfig;
  onReady: (textures: SpriteTextures) => void;
  onError: (error: Error) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const heroSvg = host.current?.querySelector<SVGSVGElement>('svg[data-figure="hero"]');
    const companionSvg = host.current?.querySelector<SVGSVGElement>('svg[data-figure="companion"]');
    if (!heroSvg) return;
    const key = spriteKey(config);
    (async () => {
      const hero = getCachedTexture(key) ?? (await svgElementToTexture(heroSvg));
      setCachedTexture(key, hero);
      let companion: THREE.CanvasTexture | null = null;
      if (companionSvg && config.companion) {
        companion = getCachedTexture(`${key}:companion`) ?? (await svgElementToTexture(companionSvg));
        setCachedTexture(`${key}:companion`, companion);
      }
      if (!cancelled) onReady({ hero, companion });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
    </div>
  );
}
```

`src/components/realm/touch-stick.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";

/** A thumb-sized joystick reporting a screen-space axis in −1..1. Pointer events, so it works with fingers and mice. */
export function TouchStick({ onChange, size = 120 }: { onChange: (axis: { x: number; y: number }) => void; size?: number }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const radius = size / 2;

  function update(e: React.PointerEvent) {
    const rect = base.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const clamp = Math.min(1, len / radius);
    const x = len === 0 ? 0 : (dx / len) * clamp;
    const y = len === 0 ? 0 : (-dy / len) * clamp; // screen y grows downward; "up" is positive for the stick
    setKnob({ x, y });
    onChange({ x, y });
  }

  function release(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  }

  return (
    <div
      ref={base}
      role="group"
      aria-label="Move"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="realm-stick"
      style={{ width: size, height: size }}
    >
      <div className="realm-stick-knob" style={{ transform: `translate(${knob.x * radius * 0.6}px, ${-knob.y * radius * 0.6}px)` }} />
    </div>
  );
}
```

`src/components/realm/use-realm-input.ts`:
```ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Vec2 } from "@/lib/realm/layout";
import { screenToWorldAxis } from "@/lib/realm/input-mapping";

const KEYS: Record<string, { x: number; y: number }> = {
  w: { x: 0, y: 1 }, ArrowUp: { x: 0, y: 1 },
  s: { x: 0, y: -1 }, ArrowDown: { x: 0, y: -1 },
  a: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  d: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};

/**
 * Keyboard and stick are folded into one world-space axis kept in a ref, so
 * the render loop reads it every frame without a React re-render per keypress.
 */
export function useRealmInput() {
  const axisRef = useRef<Vec2>({ x: 0, z: 0 });
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });

  const recompute = useCallback(() => {
    let screen = { x: 0, y: 0 };
    for (const key of keys.current) {
      const v = KEYS[key];
      if (v) screen = { x: screen.x + v.x, y: screen.y + v.y };
    }
    if (screen.x === 0 && screen.y === 0) screen = stick.current;
    axisRef.current = screenToWorldAxis({ x: Math.max(-1, Math.min(1, screen.x)), y: Math.max(-1, Math.min(1, screen.y)) });
  }, []);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (!(e.key in KEYS)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      keys.current.add(e.key);
      recompute();
    }
    function up(e: KeyboardEvent) {
      keys.current.delete(e.key);
      recompute();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [recompute]);

  const setStick = useCallback((screen: { x: number; y: number }) => {
    stick.current = screen;
    recompute();
  }, [recompute]);

  return { axisRef, setStick };
}
```

`src/components/realm/realm-scene.tsx`:
```tsx
"use client";

import { useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { SpriteTextures } from "./sprite-source";

type Props = { layout: WorldLayout; textures: SpriteTextures; settings: RenderSettings; axisRef: RefObject<Vec2> };

const SPRITE_W = 1.5;
const SPRITE_H = 2;

function World({ layout, textures, settings, axisRef }: Props) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);

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
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";

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
          hero.current = setTarget(hero.current, { x: e.point.x, z: e.point.z }, layout.colliders);
        }}
      >
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshStandardMaterial color={ground} />
      </mesh>
      {layout.props.map((prop) => (
        <group key={prop.id} position={[prop.position.x, prop.size.h / 2, prop.position.z]}>
          <mesh>
            <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
          {prop.kind !== "path" && (
            <Html position={[0, prop.size.h / 2 + 0.6, 0]} center zIndexRange={[10, 0]}>
              <span className="realm-label">{prop.label}</span>
            </Html>
          )}
        </group>
      ))}
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

export default function RealmScene(props: Props) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
      <World {...props} />
    </Canvas>
  );
}
```
The ground `onPointerDown` fires on any pointer, including the stick's, only when the pointer is over the canvas; the stick captures its own pointer so taps on it never reach the ground.

`src/components/realm/realm-hud.tsx`:
```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function RealmHud({
  heroName,
  minutesRemaining,
  warning,
  preview,
  hudScale,
  error,
  onRetry,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  warning: boolean;
  preview: { note: string | null } | null;
  hudScale: number;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em` }}>
      <div className="realm-hud-row">
        <span className="realm-hud-name">{heroName}</span>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left</span>}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&rsquo;s Realm</span>}
        <Link href="/tavern" className="realm-hud-leave">Leave the Realm</Link>
      </div>
      {preview?.note && <p className="realm-hud-note">{preview.note}</p>}
      {warning && minutesRemaining !== null && <p className="realm-hud-banner">One minute left in the Realm today.</p>}
      {error && (
        <p className="realm-hud-error">
          {error} <Button size="xs" variant="ghost" onClick={onRetry}>Try again</Button>
        </p>
      )}
    </div>
  );
}
```

`src/app/globals.css` additions (after the reading-support block):
```css
/* ── The Realm ──────────────────────────────────────────────── */
.realm-root { position: fixed; inset: 0; background: #0a1220; }
.realm-hud { position: absolute; top: 0.75rem; left: 0.75rem; right: 0.75rem; z-index: 20; pointer-events: none; color: #fff; font-family: var(--font-farro), ui-sans-serif, system-ui, sans-serif; }
.realm-hud > * { pointer-events: auto; }
.realm-hud-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.realm-hud-name { font-weight: 700; }
.realm-hud-minutes, .realm-hud-badge { border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(201, 168, 76, 0.2); color: var(--gold-bright); font-size: 0.85em; }
.realm-hud-leave { margin-left: auto; color: var(--gold-bright); text-decoration: underline; font-size: 0.85em; }
.realm-hud-note, .realm-hud-banner, .realm-hud-error { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(0, 0, 0, 0.45); font-size: 0.9em; }
.realm-hud-banner { border: 1px solid var(--gold-border); }
.realm-label { white-space: nowrap; border-radius: 9999px; padding: 0.1rem 0.5rem; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 11px; pointer-events: none; }
.realm-stick { position: absolute; left: 1.25rem; bottom: 1.25rem; z-index: 20; border-radius: 9999px; background: rgba(255, 255, 255, 0.12); border: 2px solid rgba(255, 255, 255, 0.35); touch-action: none; }
.realm-stick-knob { position: absolute; left: 50%; top: 50%; width: 44%; height: 44%; margin: -22% 0 0 -22%; border-radius: 9999px; background: rgba(255, 255, 255, 0.55); }
.realm-gate, .realm-closed { display: grid; place-items: center; min-height: 60vh; text-align: center; }
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx && npm run typecheck && npm run lint` (no new errors; if `@react-three/fiber` JSX intrinsics like `<sprite>` fail typecheck, add `import "@react-three/fiber"` at the top of `realm-scene.tsx` so its JSX namespace augmentation loads).
```bash
git add src/components/realm src/app/globals.css
git commit -m "Add the Realm scene, input, touch stick, and HUD

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Shell, gate, closed screen, play-clock hook, and the page

**Files:**
- Create: `src/components/realm/realm-gate.tsx` (+test), `src/components/realm/realm-closed.tsx`, `src/components/realm/use-play-clock.ts`, `src/components/realm/realm-shell.tsx` (+test), `src/app/(app)/realm/page.tsx`

**Interfaces:**
- Consumes: `getRealmAccess`, `recordRealmPlay` from `@/lib/actions/realm-play`; `getRealmBundle`, `RealmBundle`; the play clock, layout, render settings, `SpriteSource`, `RealmScene` (dynamic), `RealmHud`, `TouchStick`, `useRealmInput`; `localDateOf`, `currentTimeOfDay`; `DEFAULT_AVATAR`.
- Produces: `RealmGate({ copy, heroName })`, `RealmClosed({ heroName, body })`, `usePlayClock({ enabled, childId, initialMinutes, onClose })`, `RealmShell({ bundle, childId, isChildView })`.

- [ ] **Step 1: Write the failing tests**

`src/components/realm/realm-gate.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmGate } from "./realm-gate";
import { gateCopy } from "@/lib/realm/play-clock";

afterEach(cleanup);

describe("RealmGate", () => {
  it("shows the reason in the hero's terms", () => {
    render(<RealmGate copy={gateCopy({ allowed: false, reason: "no_minutes" })!} heroName="Lily" />);
    expect(screen.getByRole("heading", { name: "The Realm opens when you finish a quest." })).toBeInTheDocument();
    expect(screen.getByText("Every quest you complete banks minutes here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quest Log/ })).toHaveAttribute("href", "/quests");
  });
});
```

`src/components/realm/realm-shell.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmShell } from "./realm-shell";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

const getRealmAccess = vi.fn();
const recordRealmPlay = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: (...a: unknown[]) => recordRealmPlay(...a),
}));
vi.mock("./realm-scene", () => ({ default: () => <div data-testid="scene" /> }));
vi.mock("./sprite-source", async () => {
  const React = await import("react");
  return {
    SpriteSource: ({ onReady }: { onReady: (t: unknown) => void }) => {
      // Report readiness after mount, the way the real component does, so no parent state is set during render.
      React.useEffect(() => {
        onReady({ hero: {}, companion: null });
      }, [onReady]);
      return null;
    },
  };
});

const bundle = {
  heroName: "Lily",
  avatarConfig: DEFAULT_AVATAR,
  castleType: "campsite",
  builtBuildingIds: [],
  profile: DEFAULT_LEARNING_PROFILE,
  settings: { enabled: true, toneMode: "gentle" as const },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RealmShell", () => {
  it("gates a hero who has no minutes", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "no_minutes" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByText("The Realm opens when you finish a quest.")).toBeInTheDocument();
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
  });

  it("opens the world with the minute counter for a hero", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("12 min left")).toBeInTheDocument();
  });

  it("previews for a parent without recording anything", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: It's school time.")).toBeInTheDocument();
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("explains when the Realm is disabled", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "disabled" });
    render(<RealmShell bundle={{ ...bundle, settings: { enabled: false, toneMode: "gentle" } }} childId="c1" isChildView={true} />);
    expect(await screen.findByText("The Realm is closed for this hero.")).toBeInTheDocument();
  });
});
```
The shell must expose a WebGL check that passes in jsdom for these tests: implement `webglSupported()` as "true unless `document.createElement('canvas').getContext` exists and returns null for both `webgl2` and `webgl`"; jsdom's canvas `getContext` returns null, so the tests would fail — instead, treat a missing `HTMLCanvasElement.prototype.getContext` implementation (jsdom logs "not implemented" and returns null) as unknown and allow. Concretely: `const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl"); return gl !== null || typeof window.WebGL2RenderingContext === "undefined" && typeof window.WebGLRenderingContext === "undefined";` — in jsdom neither constructor exists, so the check passes; in a real browser without WebGL the constructors exist but contexts are null, so it fails correctly.

- [ ] **Step 2: Run to verify failure** → cannot resolve.

- [ ] **Step 3: Write the components**

`src/components/realm/realm-gate.tsx`:
```tsx
import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import type { GateCopy } from "@/lib/realm/play-clock";

export function RealmGate({ copy, heroName }: { copy: GateCopy; heroName: string }) {
  return (
    <GameFrame>
      <div className="realm-gate space-y-3 py-6">
        <GameIcon name="lock" className="size-10 text-[var(--gold-bright)]" />
        <h2 className="text-xl font-bold">{copy.title}</h2>
        <p className="text-muted-foreground">{copy.body}</p>
        <Link href="/quests" className="text-primary hover:underline">Open {heroName}&rsquo;s Quest Log →</Link>
      </div>
    </GameFrame>
  );
}
```

`src/components/realm/realm-closed.tsx`:
```tsx
import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";

export function RealmClosed({ heroName, body }: { heroName: string; body: string }) {
  return (
    <GameFrame>
      <div className="realm-closed space-y-3 py-6">
        <GameIcon name="star" className="size-10 text-[var(--gold-bright)]" />
        <h2 className="text-xl font-bold">Well played, {heroName}!</h2>
        <p className="text-muted-foreground">{body}</p>
        <Link href="/tavern" className="text-primary hover:underline">Back to the Tavern →</Link>
      </div>
    </GameFrame>
  );
}
```

`src/components/realm/use-play-clock.ts`:
```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { getRealmAccess, recordRealmPlay } from "@/lib/actions/realm-play";
import { applyAccess, startClock, tickClock, type PlayClock } from "@/lib/realm/play-clock";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";

/**
 * Ticks the pure clock once a second, writes a minute to the ledger every 60
 * visible seconds, and refreshes access after each write. State updates happen
 * inside the interval callback, never synchronously in the effect body.
 */
export function usePlayClock({
  enabled,
  childId,
  initialMinutes,
  onClose,
}: {
  enabled: boolean;
  childId: string;
  initialMinutes: number;
  onClose: () => void;
}) {
  const [clock, setClock] = useState<PlayClock>(() => startClock(initialMinutes));
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState("");
  const clockRef = useRef(clock);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    let recording = false;
    const id = setInterval(async () => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const ticked = tickClock(clockRef.current, 1, visible);
      clockRef.current = ticked.clock;
      setClock(ticked.clock);
      if (ticked.event === "warn") setWarning(true);
      if (ticked.event === "close") closeRef.current();
      if (ticked.event !== "record" || recording) return;
      recording = true;
      try {
        const date = localDateOf(new Date());
        await recordRealmPlay(childId, date, ticked.records);
        const access = await getRealmAccess(childId, date, currentTimeOfDay());
        const applied = applyAccess(clockRef.current, access);
        clockRef.current = applied.clock;
        setClock(applied.clock);
        setError("");
        if (applied.event === "warn") setWarning(true);
        if (applied.event === "close") closeRef.current();
      } catch (err) {
        // The minute is not re-charged: the clock already moved on. Next minute tries again.
        setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
      } finally {
        recording = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, childId]);

  return { minutesRemaining: clock.minutesRemaining, warning, error, clearError: () => setError("") };
}
```

`src/components/realm/realm-shell.tsx`:
```tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealmBundle } from "@/lib/actions/realm";
import { getRealmAccess } from "@/lib/actions/realm-play";
import { buildWorldLayout } from "@/lib/realm/layout";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { gateCopy, type GateCopy } from "@/lib/realm/play-clock";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";
import { SpriteSource, type SpriteTextures } from "./sprite-source";
import { RealmHud } from "./realm-hud";
import { RealmGate } from "./realm-gate";
import { RealmClosed } from "./realm-closed";
import { TouchStick } from "./touch-stick";
import { useRealmInput } from "./use-realm-input";
import { usePlayClock } from "./use-play-clock";

const RealmScene = dynamic(() => import("./realm-scene"), { ssr: false, loading: () => <p className="p-6 text-center text-muted-foreground">Opening the Realm…</p> });

type Phase = { kind: "checking" } | { kind: "gated"; copy: GateCopy } | { kind: "open"; minutes: number; note: string | null } | { kind: "closed"; body: string } | { kind: "unsupported" };

const UNSUPPORTED = "This device can't open the Realm yet. Try a newer browser or another device.";

/** True unless the browser clearly has WebGL support and refuses a context (jsdom has neither, and passes). */
function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  const hasApi = typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined";
  if (!hasApi) return true;
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
}

export function RealmShell({ bundle, childId, isChildView }: { bundle: RealmBundle; childId: string; isChildView: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [isTouch, setIsTouch] = useState(false);

  // The access check is async, so the state updates below are not synchronous effect writes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      const result = await getRealmAccess(childId, localDateOf(new Date()), currentTimeOfDay());
      if (cancelled) return;
      setIsTouch(touch);
      if (!webglSupported()) {
        setPhase({ kind: "unsupported" });
        return;
      }
      const copy = gateCopy(result);
      if (!isChildView) {
        // Parents look, never spend: the gate becomes an information line.
        setPhase({ kind: "open", minutes: 0, note: copy ? `Closed for ${bundle.heroName}: ${copy.title}` : null });
        return;
      }
      // `copy` is non-null exactly when access is denied.
      if (copy) {
        setPhase({ kind: "gated", copy });
        return;
      }
      setPhase({ kind: "open", minutes: result.allowed ? result.minutesRemaining : 0, note: null });
    })().catch((err: unknown) => {
      if (!cancelled) setPhase({ kind: "gated", copy: { title: "The Realm is out of reach right now.", body: err instanceof Error ? err.message : "Try again in a moment." } });
    });
    return () => {
      cancelled = true;
    };
  }, [childId, isChildView, bundle.heroName]);

  useEffect(() => () => disposeSpriteTextures(), []);

  const onClose = useCallback(() => {
    setPhase({ kind: "closed", body: gateCopy({ allowed: false, reason: "cap_reached" })!.body });
  }, []);

  if (phase.kind === "checking") return <p className="p-6 text-center text-muted-foreground">Checking the gate…</p>;
  if (phase.kind === "unsupported") return <p className="p-6 text-center text-muted-foreground">{UNSUPPORTED}</p>;
  if (phase.kind === "gated") return <RealmGate copy={phase.copy} heroName={bundle.heroName} />;
  if (phase.kind === "closed") return <RealmClosed heroName={bundle.heroName} body={phase.body} />;

  // The open world is its own component so the play clock mounts with the real
  // minute count, not a placeholder from before the access check resolved.
  return (
    <RealmOpen
      bundle={bundle}
      childId={childId}
      isChildView={isChildView}
      isTouch={isTouch}
      minutes={phase.minutes}
      note={phase.note}
      onClose={onClose}
    />
  );
}

function RealmOpen({
  bundle,
  childId,
  isChildView,
  isTouch,
  minutes,
  note,
  onClose,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  isTouch: boolean;
  minutes: number;
  note: string | null;
  onClose: () => void;
}) {
  const [textures, setTextures] = useState<SpriteTextures | null>(null);
  const [spriteError, setSpriteError] = useState("");
  const layout = useMemo(() => buildWorldLayout({ castleType: bundle.castleType, builtBuildingIds: bundle.builtBuildingIds }), [bundle.castleType, bundle.builtBuildingIds]);
  const settings = renderSettingsFor(bundle.profile, isTouch);
  const { axisRef, setStick } = useRealmInput();
  const config = bundle.avatarConfig ?? DEFAULT_AVATAR;
  const clock = usePlayClock({ enabled: isChildView, childId, initialMinutes: minutes, onClose });
  const onReady = useCallback((t: SpriteTextures) => setTextures(t), []);
  const onError = useCallback((e: Error) => setSpriteError(e.message), []);

  return (
    <div className="realm-root">
      <SpriteSource config={config} onReady={onReady} onError={onError} />
      {textures && <RealmScene layout={layout} textures={textures} settings={settings} axisRef={axisRef} />}
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        warning={clock.warning}
        preview={isChildView ? null : { note }}
        hudScale={settings.hudScale}
        error={spriteError || clock.error}
        onRetry={() => {
          setSpriteError("");
          clock.clearError();
        }}
      />
      {settings.showStick && <TouchStick onChange={setStick} />}
    </div>
  );
}
```
`src/app/(app)/realm/page.tsx`:
```tsx
import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getRealmBundle } from "@/lib/actions/realm";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { RealmShell } from "@/components/realm/realm-shell";

export default async function RealmPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">The Realm</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="castle" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the gates can open.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">The Realm</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to walk the Realm.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const bundle = await getRealmBundle(activeChild.id);

  return (
    <div className="space-y-4">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? "My Realm" : `${activeChild.displayName}'s Realm`}</h1>
          <p className="mt-1 text-muted-foreground">Walk the grounds, visit what your deeds have raised, and keep your companion close.</p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      <RealmShell bundle={bundle} childId={activeChild.id} isChildView={isChildView} />
    </div>
  );
}
```
Because `RealmShell` renders a fixed full-screen `realm-root` when open, the banner sits behind it; that is intended — the HUD's "Leave the Realm" link is the way back. When gated or closed, the banner and frame show normally.

- [ ] **Step 4: Run the tests, gate, commit**

Run: `npx vitest run src/components/realm/realm-gate.test.tsx src/components/realm/realm-shell.test.tsx && npm run typecheck && npm run lint && npm test`. Note for the shell test's parent case: the info line is `Closed for Lily: It's school time.` (the gate title verbatim after the colon).
```bash
git add src/components/realm "src/app/(app)/realm/page.tsx"
git commit -m "Add the Realm shell with access gate, play clock, parent preview, and page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Final verification and the browser pass

**Files:** none new in the repo (a screenshot lands in the scratchpad).

- [ ] **Step 1: Full gate** — `npm run typecheck && npm test`; `npm run lint` shows only the pre-existing error.

- [ ] **Step 2: Bundle isolation** — `npm run build`, then `grep -l WebGLRenderer .next/static/chunks/*.js` must list exactly one chunk, and `grep -rl <that chunk's basename> .next/server/app` must list only files under `.next/server/app/realm/`.

- [ ] **Step 3: Browser pass** — Start the dev server on a free port (`PORT=3111 npm run dev`, background). With `DEMO_MODE=true` in `.env.local`, the demo hero persona is selected by the cookie `demo_persona=lily`. Using the local headless Chromium (see the project memory note on Chromium libs: launch with `LD_LIBRARY_PATH` pointing at the downloaded libs and `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), write a throwaway Playwright script under `/tmp/claude-1000/…/scratchpad/` that: sets the cookie on `localhost`, opens `/realm`, waits for the canvas, presses `d` for one second, takes a screenshot, and reads the HUD text. Record in the plan report: the screenshot path, the HUD minutes text or the gate title, and whether the hero moved (compare two screenshots or read `window` state if the scene exposes none — a visual diff is enough). Repeat once with `demo_persona=parent` and `?child=<lily's id>` to see the preview badge. Stop the dev server afterward.

- [ ] **Step 4: Spec walk** — A layout/movement/camera/render settings/play clock → Tasks 1–4; B figures/pipeline/scene/input/stick/HUD → Tasks 5, 7; C entry/heartbeat/preview → Task 8; D page/nav/bundle → Tasks 6, 8; error handling (unsupported WebGL, sprite failure, action errors with retry) → Task 8. Anything missing is a new task.

- [ ] **Step 5: Hand off** — `superpowers:finishing-a-development-branch` (the branch now carries slices 1–4).
