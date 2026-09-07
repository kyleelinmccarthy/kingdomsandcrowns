# Realm: Spell Casting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the hero cast their spellbook pages inside the Realm at gentle "troubles" that drift near unfinished sites and clear when hit, with mana, cast time, element/form/modifier behaviour, the monsters skin, and a session tally.

**Architecture:** A pure simulation in `src/lib/realm/spells/` (troubles, mana, caster, effects, focus, page resolution) stepped from refs inside the scene's frame loop; the scene draws pooled meshes and sprites and reports discrete events through `queueMicrotask`; the shell owns selection, HUD state, and pause/preview rules; the bundle carries the spellbook pages read-only.

**Tech Stack:** Next.js 16, React 19, three 0.185 / @react-three/fiber 9.7 / drei 10.7, Drizzle, Vitest + Testing Library (jsdom, no WebGL).

**Spec:** `docs/superpowers/specs/2026-09-07-realm-spell-casting-design.md`

## Global Constraints

- Pure logic in `src/lib/realm/spells/` with colocated tests written first; no three.js runtime imports outside `realm-scene.tsx`; `realm-scene.tsx` never imported by a test.
- Lint rule `react-hooks/set-state-in-effect`: no synchronous setState in effect bodies; discrete scene events reach React via `queueMicrotask`; no `any`, no `eslint-disable`.
- `"use server"` files export only async functions and declared types (never `export type { X }` re-exports).
- Numbers verbatim from the spec: `MAX_TROUBLES = 6`, low-stimulus cap `3`, `RESPAWN_MS = 20_000`, trouble radius `0.7`, blob sense `6`, push-back `4`, `MANA_MAX = 100`, `MANA_REGEN_PER_S = 5`, projectile hit radius `0.6`, seek `3` units and `90°/s`, area radius `2` (`3` grown) for `400` ms, beam `0.8` width every `200` ms for `600` ms, barrier `4` units for `6000` ms, shield `5000` ms, aura every `500` ms for `3000` ms within range `5`, summon `8000` ms firing every `1500` ms at troubles within `4` (mini bolt speed `10`, range `4`), dazzle `1500` ms, fog speed `0.6`, blob speed `1.8`, stone hits `2`.
- Copy verbatim: trouble names and clear lines (Task 1 table); "This page is faded."; "Not enough mana yet."; "You lost focus for a moment."; "Cleared: {n}"; "Mana".
- Casting, mana regen, effects, and troubles freeze while a deed panel is open (`interactive` false); parents have no spell bar and cannot cast; the hero cannot walk while a cast is winding up or while dazzled.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Known pre-existing lint error in `src/components/quest-template-list.tsx` is accepted.

---

### Task 1: Troubles (pure)

**Files:**
- Create: `src/lib/realm/spells/troubles.ts`, `src/lib/realm/spells/troubles.test.ts`
- Modify: `src/lib/realm/layout.ts` (add `"barrier"` to `PropKind`)

**Interfaces:**
- Consumes: `Vec2`, `Prop`, `WorldLayout` from `../layout`; `HERO_RADIUS` from `../movement`; `seededRng` from `@/lib/utils/drill-generators`; `SpellDefinition`, `StatusKind` from `@/lib/utils/spell-catalog`.
- Produces: `TroubleKind`, `TroubleSkin`, `Trouble`, `TroubleStatus`, `TROUBLE_COPY`, `TROUBLE_RADIUS`, `MAX_TROUBLES`, `LOW_STIMULUS_MAX`, `RESPAWN_MS`, `BLOB_SENSE`, `FOCUS_RADIUS`, `PUSHBACK`, `spawnTroubles`, `stepTroubles`, `hitTrouble`, `applyHit`, `ClearTally`, `startTally`, `recordClear`, `speedFactor`.

- [ ] **Step 1: Write the failing tests**

`src/lib/realm/spells/troubles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout } from "../layout";
import { HERO_RADIUS } from "../movement";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import {
  spawnTroubles, stepTroubles, hitTrouble, applyHit, startTally, recordClear, speedFactor,
  MAX_TROUBLES, LOW_STIMULUS_MAX, RESPAWN_MS, TROUBLE_RADIUS, TROUBLE_COPY, PUSHBACK, type Trouble,
} from "./troubles";

const layout = buildWorldLayout({ castleType: "keep", buildings: [{ id: "well", done: 5, total: 5, complete: true }] });
const noOpts = { now: 0, lowStimulus: false, reducedMotion: false, shielded: false, dazzled: false };
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!;
const frostBolt = resolveSpell({ elementId: "frost", formId: "bolt", modifierId: "slow" })!;

function troubleAt(kind: Trouble["kind"], x: number, z: number, extra: Partial<Trouble> = {}): Trouble {
  return { id: `t-${kind}`, kind, siteId: "mill", position: { x, z }, origin: { x, z }, drift: { x: 1, z: 0 }, hitsLeft: kind === "cursed-stone" ? 2 : 1, statuses: [], spawnedAt: 0, ...extra };
}

describe("spawnTroubles", () => {
  it("spawns one trouble per unfinished site up to the cap, none for built sites, deterministically", () => {
    const a = spawnTroubles({ seed: 7, now: 0, layout, troubles: [], clearedSites: {}, lowStimulus: false });
    const b = spawnTroubles({ seed: 7, now: 0, layout, troubles: [], clearedSites: {}, lowStimulus: false });
    expect(a.length).toBe(MAX_TROUBLES);
    expect(a).toEqual(b);
    expect(a.some((t) => t.siteId === "well")).toBe(false);
    expect(new Set(a.map((t) => t.siteId)).size).toBe(a.length);
    // Kinds rotate by the site's index among the unfinished sites.
    const sites = layout.props.filter((p) => p.kind === "foundation").map((p) => p.id);
    for (const t of a) expect(t.kind).toBe(["fog", "cursed-stone", "shadow-blob"][sites.indexOf(t.siteId) % 3]);
  });

  it("keeps every spawn off colliders, villagers, the path, and the spawn point, and within 3–5 units of its site", () => {
    const troubles = spawnTroubles({ seed: 3, now: 0, layout, troubles: [], clearedSites: {}, lowStimulus: false });
    for (const t of troubles) {
      const site = layout.props.find((p) => p.id === t.siteId)!;
      const d = Math.hypot(t.position.x - site.position.x, t.position.z - site.position.z);
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(5);
      for (const c of layout.colliders) {
        const inside = Math.abs(t.position.x - c.position.x) < c.size.w / 2 + TROUBLE_RADIUS && Math.abs(t.position.z - c.position.z) < c.size.d / 2 + TROUBLE_RADIUS;
        expect(inside).toBe(false);
      }
      for (const v of layout.villagers) expect(Math.hypot(t.position.x - v.position.x, t.position.z - v.position.z)).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(t.position.x - layout.spawn.x, t.position.z - layout.spawn.z)).toBeGreaterThanOrEqual(4);
      for (const p of layout.props.filter((p) => p.kind === "path")) expect(Math.hypot(t.position.x - p.position.x, t.position.z - p.position.z)).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("caps at three under low stimulus and respects the respawn delay", () => {
    expect(spawnTroubles({ seed: 1, now: 0, layout, troubles: [], clearedSites: {}, lowStimulus: true }).length).toBe(LOW_STIMULUS_MAX);
    const existing = spawnTroubles({ seed: 1, now: 0, layout, troubles: [], clearedSites: {}, lowStimulus: false });
    const cleared = existing.filter((t) => t.siteId !== "mill");
    const soon = spawnTroubles({ seed: 1, now: 5_000, layout, troubles: cleared, clearedSites: { mill: 0 }, lowStimulus: false });
    expect(soon.some((t) => t.siteId === "mill")).toBe(false);
    const later = spawnTroubles({ seed: 1, now: RESPAWN_MS, layout, troubles: cleared, clearedSites: { mill: 0 }, lowStimulus: false });
    expect(later.some((t) => t.siteId === "mill")).toBe(true);
    expect(later.length).toBe(MAX_TROUBLES);
  });
});

describe("stepTroubles", () => {
  it("drifts fog, holds stones still, and stops fog under reduced motion", () => {
    const fog = troubleAt("fog", 0, 0);
    const stone = troubleAt("cursed-stone", 5, 5);
    const { troubles } = stepTroubles([fog, stone], { x: 20, z: 20 }, 1, [], noOpts);
    expect(troubles[0].position.x).toBeCloseTo(0.6, 5);
    expect(troubles[1].position).toEqual({ x: 5, z: 5 });
    const still = stepTroubles([fog], { x: 20, z: 20 }, 1, [], { ...noOpts, reducedMotion: true });
    expect(still.troubles[0].position).toEqual({ x: 0, z: 0 });
  });

  it("turns fog back toward its origin past three units", () => {
    const far = troubleAt("fog", 3.5, 0, { origin: { x: 0, z: 0 }, drift: { x: 1, z: 0 } });
    const { troubles } = stepTroubles([far], { x: 20, z: 20 }, 1, [], noOpts);
    expect(troubles[0].position.x).toBeLessThan(3.5);
  });

  it("makes a blob approach a hero within six units, but not under low stimulus", () => {
    const blob = troubleAt("shadow-blob", 0, 0);
    const near = stepTroubles([blob], { x: 4, z: 0 }, 1, [], noOpts).troubles[0];
    expect(near.position.x).toBeCloseTo(1.8, 5);
    const calm = stepTroubles([blob], { x: 4, z: 0 }, 1, [], { ...noOpts, lowStimulus: true }).troubles[0];
    expect(calm.position.x).not.toBeCloseTo(1.8, 5);
    // With the hero far off to the west, the blob wanders along its own drift (+x) instead of approaching.
    const farHero = stepTroubles([blob], { x: -20, z: 0 }, 1, [], noOpts).troubles[0];
    expect(farHero.position.x).toBeCloseTo(1.8, 5);
  });

  it("applies statuses: chilled halves, slowed multiplies by 0.4, bound freezes, expired ones drop", () => {
    expect(speedFactor([{ kind: "chilled", until: 10 }], 0)).toBe(0.5);
    expect(speedFactor([{ kind: "slowed", until: 10 }], 0)).toBe(0.4);
    expect(speedFactor([{ kind: "bound", until: 10 }, { kind: "chilled", until: 10 }], 0)).toBe(0);
    expect(speedFactor([{ kind: "chilled", until: 10 }], 11)).toBe(1);
    const blob = troubleAt("shadow-blob", 0, 0, { statuses: [{ kind: "bound", until: 500 }] });
    const frozen = stepTroubles([blob], { x: 4, z: 0 }, 1, [], { ...noOpts, now: 0 }).troubles[0];
    expect(frozen.position).toEqual({ x: 0, z: 0 });
    const thawed = stepTroubles([blob], { x: 4, z: 0 }, 1, [], { ...noOpts, now: 1000 }).troubles[0];
    expect(thawed.statuses).toEqual([]);
    expect(thawed.position.x).toBeGreaterThan(0);
  });

  it("never steps a trouble into a collider", () => {
    const wall = { id: "w", kind: "building" as const, label: "W", position: { x: 2, z: 0 }, size: { w: 2, d: 2, h: 2 }, color: "#000", solid: true };
    const blob = troubleAt("shadow-blob", 0, 0);
    const { troubles } = stepTroubles([blob], { x: 6, z: 0 }, 1, [wall], noOpts);
    expect(troubles[0].position.x).toBeLessThan(2 - 1 - TROUBLE_RADIUS + 1e-9);
  });

  it("reports lost focus once when a blob reaches an unshielded hero and pushes it back", () => {
    const blob = troubleAt("shadow-blob", 0.5, 0);
    const hero = { x: 0, z: 0 };
    const first = stepTroubles([blob], hero, 0.016, [], noOpts);
    expect(first.focusLost).toBe(true);
    expect(Math.hypot(first.troubles[0].position.x, first.troubles[0].position.z)).toBeCloseTo(0.5 + PUSHBACK, 1);
    expect(stepTroubles([blob], hero, 0.016, [], { ...noOpts, shielded: true }).focusLost).toBe(false);
    expect(stepTroubles([blob], hero, 0.016, [], { ...noOpts, dazzled: true }).focusLost).toBe(false);
    expect(HERO_RADIUS).toBeGreaterThan(0);
  });
});

describe("hits and tally", () => {
  it("hit-tests a circle and clears on the last hit, storing timed statuses only", () => {
    const stone = troubleAt("cursed-stone", 0, 0);
    expect(hitTrouble(stone, { x: 1.2, z: 0 }, 0.6)).toBe(true);
    expect(hitTrouble(stone, { x: 1.4, z: 0 }, 0.6)).toBe(false);
    const once = applyHit(stone, frostBolt, 100);
    expect(once.cleared).toBe(false);
    expect(once.trouble.hitsLeft).toBe(1);
    expect(once.trouble.statuses).toEqual([{ kind: "chilled", until: 900 }, { kind: "slowed", until: 2100 }]);
    const twice = applyHit(once.trouble, bolt, 200);
    expect(twice.cleared).toBe(true);
  });

  it("counts clears per kind and in total", () => {
    let tally = startTally();
    tally = recordClear(tally, "fog");
    tally = recordClear(tally, "fog");
    tally = recordClear(tally, "shadow-blob");
    expect(tally).toEqual({ session: 3, byKind: { fog: 2, "cursed-stone": 0, "shadow-blob": 1 } });
  });

  it("has gentle and monsters copy for every kind", () => {
    for (const copy of Object.values(TROUBLE_COPY)) {
      expect(copy.gentle.length).toBeGreaterThan(0);
      expect(copy.monsters.endsWith("!")).toBe(true);
    }
    expect(TROUBLE_COPY.fog.gentle).toBe("The fog thins.");
    expect(TROUBLE_COPY["cursed-stone"].monsters).toBe("The gargoyle crumbles!");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/spells/troubles.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Add the barrier prop kind**

In `src/lib/realm/layout.ts`: `export type PropKind = "castle" | "building" | "foundation" | "path" | "villager" | "barrier";` (nothing else changes; the scene already filters what it draws by kind and never draws `barrier`).

- [ ] **Step 4: Write the module**

`src/lib/realm/spells/troubles.ts`:

```ts
import { WORLD_SIZE, type Prop, type Vec2, type WorldLayout } from "../layout";
import { HERO_RADIUS } from "../movement";
import { seededRng } from "@/lib/utils/drill-generators";
import type { SpellDefinition, StatusKind } from "@/lib/utils/spell-catalog";

export type TroubleKind = "fog" | "cursed-stone" | "shadow-blob";
export type TroubleSkin = "gentle" | "monsters";
export type TroubleStatus = { kind: StatusKind; until: number }; // simulation-clock ms
export type Trouble = {
  id: string;
  kind: TroubleKind;
  siteId: string;
  position: Vec2;
  origin: Vec2; // where it spawned; wanderers stay within WANDER of it
  drift: Vec2; // unit direction for the wander walk
  hitsLeft: number;
  statuses: TroubleStatus[];
  spawnedAt: number;
};
export type TroubleCopy = { gentleName: string; monstersName: string; gentle: string; monsters: string };

export const TROUBLE_COPY: Record<TroubleKind, TroubleCopy> = {
  fog: { gentleName: "Fog", monstersName: "Mist-wisp", gentle: "The fog thins.", monsters: "The mist-wisp scatters!" },
  "cursed-stone": { gentleName: "Cursed stone", monstersName: "Gargoyle", gentle: "The stone's curse lifts.", monsters: "The gargoyle crumbles!" },
  "shadow-blob": { gentleName: "Shadow", monstersName: "Blob", gentle: "The shadow slips away.", monsters: "The blob bounces off!" },
};

export const TROUBLE_RADIUS = 0.7;
export const MAX_TROUBLES = 6;
export const LOW_STIMULUS_MAX = 3;
export const RESPAWN_MS = 20_000;
export const BLOB_SENSE = 6;
export const FOCUS_RADIUS = HERO_RADIUS + 0.5;
export const PUSHBACK = 4;
const WANDER = 3;
const KIND_ORDER: TroubleKind[] = ["fog", "cursed-stone", "shadow-blob"];
const HITS: Record<TroubleKind, number> = { fog: 1, "cursed-stone": 2, "shadow-blob": 1 };
const SPEED: Record<TroubleKind, number> = { fog: 0.6, "cursed-stone": 0, "shadow-blob": 1.8 };
const CLEAR_FROM_VILLAGER = 1.5;
const CLEAR_FROM_PATH = 2.5;
const CLEAR_FROM_SPAWN = 4;
const LIMIT = WORLD_SIZE / 2 - 1;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

function unit(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.z);
  return len === 0 ? { x: 0, z: -1 } : { x: v.x / len, z: v.z / len };
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type SpawnInput = {
  seed: number;
  now: number;
  layout: WorldLayout;
  troubles: Trouble[];
  clearedSites: Record<string, number>; // siteId → simulation time the last trouble there was cleared
  lowStimulus: boolean;
};

/**
 * One trouble per unfinished site, up to the cap, placed by a seeded rule so
 * the same seed and state always give the same world. A cleared site waits
 * RESPAWN_MS before it draws a new one.
 */
export function spawnTroubles(input: SpawnInput): Trouble[] {
  const cap = input.lowStimulus ? LOW_STIMULUS_MAX : MAX_TROUBLES;
  const sites = input.layout.props.filter((p) => p.kind === "foundation");
  const paths = input.layout.props.filter((p) => p.kind === "path");
  const result = input.troubles.slice();
  sites.forEach((site, index) => {
    if (result.length >= cap) return;
    if (result.some((t) => t.siteId === site.id)) return;
    const clearedAt = input.clearedSites[site.id];
    if (clearedAt !== undefined && input.now - clearedAt < RESPAWN_MS) return;
    const rng = seededRng((input.seed + hashId(site.id) + (clearedAt ?? 0)) >>> 0);
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng() * Math.PI * 2;
      const d = 3 + rng() * 2;
      const p = { x: site.position.x + Math.cos(angle) * d, z: site.position.z + Math.sin(angle) * d };
      if (Math.abs(p.x) > LIMIT || Math.abs(p.z) > LIMIT) continue;
      if (input.layout.colliders.some((c) => insideProp(p, c, TROUBLE_RADIUS))) continue;
      if (input.layout.villagers.some((v) => dist(p, v.position) < CLEAR_FROM_VILLAGER)) continue;
      if (paths.some((t) => dist(p, t.position) < CLEAR_FROM_PATH)) continue;
      if (dist(p, input.layout.spawn) < CLEAR_FROM_SPAWN) continue;
      const kind = KIND_ORDER[index % KIND_ORDER.length];
      const driftAngle = rng() * Math.PI * 2;
      result.push({
        id: `${site.id}:${input.now}`,
        kind,
        siteId: site.id,
        position: p,
        origin: p,
        drift: { x: Math.cos(driftAngle), z: Math.sin(driftAngle) },
        hitsLeft: HITS[kind],
        statuses: [],
        spawnedAt: input.now,
      });
      return;
    }
  });
  return result;
}

/** 1 when free; bound freezes, chilled halves, slowed multiplies by 0.4; the strongest applies. */
export function speedFactor(statuses: TroubleStatus[], now: number): number {
  let factor = 1;
  for (const s of statuses) {
    if (s.until <= now) continue;
    if (s.kind === "bound") return 0;
    if (s.kind === "chilled") factor = Math.min(factor, 0.5);
    if (s.kind === "slowed") factor = Math.min(factor, 0.4);
  }
  return factor;
}

export type StepOptions = { now: number; lowStimulus: boolean; reducedMotion: boolean; shielded: boolean; dazzled: boolean };

function moveWithin(t: Trouble, delta: Vec2, colliders: Prop[]): Vec2 {
  const next = { x: t.position.x + delta.x, z: t.position.z + delta.z };
  if (Math.abs(next.x) > LIMIT || Math.abs(next.z) > LIMIT) return t.position;
  if (colliders.some((c) => insideProp(next, c, TROUBLE_RADIUS))) return t.position;
  return next;
}

/** One frame for every trouble. Fog wanders, stones sit, blobs wander until the hero is close, then approach. */
export function stepTroubles(troubles: Trouble[], hero: Vec2, dt: number, colliders: Prop[], opts: StepOptions): { troubles: Trouble[]; focusLost: boolean } {
  let focusLost = false;
  const out = troubles.map((t) => {
    const statuses = t.statuses.filter((s) => s.until > opts.now);
    const speed = SPEED[t.kind] * speedFactor(statuses, opts.now);
    let next: Trouble = { ...t, statuses };
    if (speed > 0) {
      if (t.kind === "shadow-blob" && !opts.lowStimulus && dist(t.position, hero) <= BLOB_SENSE) {
        const dir = unit({ x: hero.x - t.position.x, z: hero.z - t.position.z });
        next = { ...next, position: moveWithin(next, { x: dir.x * speed * dt, z: dir.z * speed * dt }, colliders) };
      } else if (!(t.kind === "fog" && opts.reducedMotion)) {
        let drift = t.drift;
        if (dist(t.position, t.origin) > WANDER) drift = unit({ x: t.origin.x - t.position.x, z: t.origin.z - t.position.z });
        next = { ...next, drift, position: moveWithin(next, { x: drift.x * speed * dt, z: drift.z * speed * dt }, colliders) };
      }
    }
    if (next.kind === "shadow-blob" && !opts.shielded && !opts.dazzled && !focusLost && dist(next.position, hero) <= FOCUS_RADIUS) {
      focusLost = true;
      const away = unit({ x: next.position.x - hero.x, z: next.position.z - hero.z });
      next = { ...next, position: { x: next.position.x + away.x * PUSHBACK, z: next.position.z + away.z * PUSHBACK } };
    }
    return next;
  });
  return { troubles: out, focusLost };
}

export function hitTrouble(trouble: Trouble, point: Vec2, radius: number): boolean {
  return dist(trouble.position, point) <= radius + TROUBLE_RADIUS;
}

/** A hit takes one point and leaves the spell's timed statuses behind; lifetime statuses (durationMs 0) never stick to a trouble. */
export function applyHit(trouble: Trouble, spell: SpellDefinition, now: number): { trouble: Trouble; cleared: boolean } {
  const hitsLeft = trouble.hitsLeft - 1;
  const statuses = [...trouble.statuses, ...spell.statuses.filter((s) => s.durationMs > 0).map((s) => ({ kind: s.kind, until: now + s.durationMs }))];
  return { trouble: { ...trouble, hitsLeft, statuses }, cleared: hitsLeft <= 0 };
}

export type ClearTally = { session: number; byKind: Record<TroubleKind, number> };

export function startTally(): ClearTally {
  return { session: 0, byKind: { fog: 0, "cursed-stone": 0, "shadow-blob": 0 } };
}

export function recordClear(tally: ClearTally, kind: TroubleKind): ClearTally {
  return { session: tally.session + 1, byKind: { ...tally.byKind, [kind]: tally.byKind[kind] + 1 } };
}
```

Note on the frost test: frost's `onHit` is `{ kind: "chilled", durationMs: 800 }` and slow's status is `{ kind: "slowed", durationMs: 2000 }`, giving `until` 900 and 2100 at `now = 100`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/realm/spells/troubles.test.ts src/lib/realm/`
Expected: all pass. If the seeded placement test fails for a particular site (no valid candidate in 12 attempts), raise attempts to 24 and note it in the report; the cap test needs six unfinished sites to succeed, which the keep layout with only the well built provides (seven foundations).

- [ ] **Step 6: Commit**

```bash
git add src/lib/realm/spells/troubles.ts src/lib/realm/spells/troubles.test.ts src/lib/realm/layout.ts
git commit -m "Realm troubles: seeded spawns, wander and approach, statuses, hits, tally"
```

---

### Task 2: Mana, caster, effects, focus (pure)

**Files:**
- Create: `src/lib/realm/spells/mana.ts` (+ `.test.ts`), `src/lib/realm/spells/caster.ts` (+ `.test.ts`), `src/lib/realm/spells/effects.ts` (+ `.test.ts`), `src/lib/realm/spells/focus.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 1 (`Trouble`, `hitTrouble`, `TROUBLE_RADIUS`); `SpellDefinition`, `StatusKind` from the catalog; `Vec2`, `Prop`, `WORLD_SIZE` from `../layout`.
- Produces: `MANA_MAX`, `MANA_REGEN_PER_S`, `startMana`, `stepMana`, `canCast`, `spend`, `refund`; `CasterState`, `selectSlot`, `beginCast`, `stepCaster`, `castTargetFor`, `directionFrom`; `SpellEffect`, `releaseEffect`, `stepEffects`, `barrierColliders`, `heroShielded`, `hasStatus`, `EffectHit`; `FocusState`, `DAZZLE_MS`, `startFocus`, `stepFocus`, `isDazzled`.

- [ ] **Step 1: Write the failing tests**

`src/lib/realm/spells/mana.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { MANA_MAX, MANA_REGEN_PER_S, startMana, stepMana, canCast, spend, refund } from "./mana";

const orb = resolveSpell({ elementId: "tide", formId: "orb", modifierId: null })!; // 15 mana

describe("mana", () => {
  it("starts full, regenerates five per second, and never exceeds the max", () => {
    expect(startMana()).toBe(MANA_MAX);
    expect(stepMana(40, 2)).toBe(40 + 2 * MANA_REGEN_PER_S);
    expect(stepMana(MANA_MAX - 1, 10)).toBe(MANA_MAX);
  });
  it("spends and refunds a spell's cost, clamped", () => {
    expect(canCast(15, orb)).toBe(true);
    expect(canCast(14, orb)).toBe(false);
    expect(spend(15, orb)).toBe(0);
    expect(refund(MANA_MAX - 5, orb)).toBe(MANA_MAX);
  });
});
```

`src/lib/realm/spells/caster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { selectSlot, beginCast, stepCaster, castTargetFor, directionFrom, type CasterState } from "./caster";

const idle: CasterState = { selectedSlot: null, casting: null };
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!; // 300 ms, 10 mana
const quickBolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "quicken" })!; // 150 ms, 15 mana
const burst = resolveSpell({ elementId: "ember", formId: "burst", modifierId: null })!; // area, range 4
const beam = resolveSpell({ elementId: "light", formId: "beam", modifierId: null })!; // range 14
const shield = resolveSpell({ elementId: "tide", formId: "shield", modifierId: null })!; // self
const hero = { x: 0, z: 0 };

describe("caster", () => {
  it("selects and deselects a slot", () => {
    expect(selectSlot(idle, 2).selectedSlot).toBe(2);
    expect(selectSlot(selectSlot(idle, 2), null).selectedSlot).toBeNull();
  });

  it("begins a cast, spends mana, and releases after castMs (halved by quicken)", () => {
    const begun = beginCast(idle, bolt, 3, hero, { x: 5, z: 0 }, 50, 1000);
    expect(begun.refused).toBeNull();
    expect(begun.mana).toBe(40);
    expect(begun.state.casting?.releaseAt).toBe(1300);
    expect(stepCaster(begun.state, 1299).released).toBeNull();
    const done = stepCaster(begun.state, 1300);
    expect(done.released).toMatchObject({ slot: 3, spell: bolt });
    expect(done.state.casting).toBeNull();
    expect(beginCast(idle, quickBolt, 0, hero, { x: 5, z: 0 }, 50, 0).state.casting?.releaseAt).toBe(150);
  });

  it("refuses when mana is short or a cast is in flight, without spending", () => {
    const short = beginCast(idle, bolt, 0, hero, { x: 5, z: 0 }, 9, 0);
    expect(short.refused).toBe("mana");
    expect(short.mana).toBe(9);
    const busy = beginCast(beginCast(idle, bolt, 0, hero, { x: 5, z: 0 }, 50, 0).state, bolt, 0, hero, { x: 5, z: 0 }, 40, 10);
    expect(busy.refused).toBe("busy");
    expect(busy.mana).toBe(40);
  });

  it("shapes the target: clamps areas to range, aims beams at range, puts self spells on the hero", () => {
    expect(castTargetFor(burst, hero, { x: 10, z: 0 })).toEqual({ x: 4, z: 0 });
    expect(castTargetFor(beam, hero, { x: 1, z: 0 })).toEqual({ x: 14, z: 0 });
    expect(castTargetFor(shield, hero, { x: 9, z: 9 })).toEqual(hero);
    expect(castTargetFor(bolt, hero, { x: 2, z: 2 })).toEqual({ x: 2, z: 2 });
    expect(directionFrom(hero, hero)).toEqual({ x: 0, z: -1 }); // a tap on the hero fires north
  });
});
```

`src/lib/realm/spells/effects.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { releaseEffect, stepEffects, barrierColliders, heroShielded, hasStatus, type SpellEffect } from "./effects";
import type { Trouble } from "./troubles";

const hero = { x: 0, z: 0 };
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!; // speed 14, range 12
const seekBolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "seek" })!;
const bounceBolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "bounce" })!;
const growOrb = resolveSpell({ elementId: "tide", formId: "orb", modifierId: "grow" })!; // speed 8, range 10
const mendBolt = resolveSpell({ elementId: "bloom", formId: "bolt", modifierId: "mend" })!;
const burst = resolveSpell({ elementId: "ember", formId: "burst", modifierId: null })!;
const beam = resolveSpell({ elementId: "light", formId: "beam", modifierId: null })!;
const wall = resolveSpell({ elementId: "stone", formId: "wall", modifierId: null })!;
const shield = resolveSpell({ elementId: "tide", formId: "shield", modifierId: null })!;
const aura = resolveSpell({ elementId: "light", formId: "aura", modifierId: null })!;
const sprite = resolveSpell({ elementId: "gale", formId: "sprite", modifierId: null })!;

function trouble(id: string, x: number, z: number): Trouble {
  return { id, kind: "fog", siteId: "s", position: { x, z }, origin: { x, z }, drift: { x: 1, z: 0 }, hitsLeft: 1, statuses: [], spawnedAt: 0 };
}

function run(effects: SpellEffect[], troubles: Trouble[], seconds: number, colliders = [] as Parameters<typeof stepEffects>[3], step = 1 / 60) {
  let now = 0;
  let hits: ReturnType<typeof stepEffects>["hits"] = [];
  let spawned: SpellEffect[] = [];
  const frames = Math.round(seconds / step);
  for (let i = 0; i < frames; i++) {
    now += step * 1000;
    const r = stepEffects(effects, troubles, hero, colliders, step, now);
    effects = r.effects;
    hits = hits.concat(r.hits);
    spawned = spawned.concat(r.spawned);
    for (const h of r.hits) troubles = troubles.filter((t) => t.id !== h.troubleId); // a hit fog clears
  }
  return { effects, hits, spawned, now };
}

describe("projectiles", () => {
  it("flies toward the target, hits a trouble on its line, and dies past its range", () => {
    const e = releaseEffect(bolt, hero, { x: 5, z: 0 }, 0, "p1");
    const hit = run([e], [trouble("a", 6, 0)], 1);
    expect(hit.hits.map((h) => h.troubleId)).toEqual(["a"]);
    expect(hit.effects.length).toBe(0);
    const miss = run([releaseEffect(bolt, hero, { x: 5, z: 0 }, 0, "p2")], [trouble("b", 6, 3)], 1);
    expect(miss.hits.length).toBe(0);
    expect(miss.effects.length).toBe(0); // travelled past 12 units
  });

  it("seeks a nearby trouble it would otherwise miss", () => {
    const off = trouble("c", 8, 1.5);
    expect(run([releaseEffect(bolt, hero, { x: 8, z: 0 }, 0, "p")], [off], 1).hits.length).toBe(0);
    expect(run([releaseEffect(seekBolt, hero, { x: 8, z: 0 }, 0, "p")], [off], 1).hits.length).toBe(1);
  });

  it("bounces once off a collider instead of dying", () => {
    const block = { id: "b", kind: "building" as const, label: "B", position: { x: 4, z: 0 }, size: { w: 2, d: 2, h: 2 }, color: "#000", solid: true };
    const plain = run([releaseEffect(bolt, hero, { x: 4, z: 0 }, 0, "p")], [], 0.5, [block]);
    expect(plain.effects.length).toBe(0);
    const bounced = run([releaseEffect(bounceBolt, hero, { x: 4, z: 0 }, 0, "p")], [], 0.3, [block]);
    expect(bounced.effects.length).toBe(1);
    expect((bounced.effects[0] as Extract<SpellEffect, { kind: "projectile" }>).velocity.x).toBeLessThan(0);
  });

  it("grows its hit radius over the flight", () => {
    const wide = trouble("d", 8, 1.4);
    expect(run([releaseEffect(bolt, hero, { x: 8, z: 0 }, 0, "p")], [wide], 1.5).hits.length).toBe(0);
    expect(run([releaseEffect(growOrb, hero, { x: 8, z: 0 }, 0, "p")], [wide], 1.5).hits.length).toBe(1);
  });
});

describe("areas, beams, walls", () => {
  it("bursts hit everything within radius exactly once and expire", () => {
    const e = releaseEffect(burst, hero, { x: 3, z: 0 }, 0, "a");
    const r = run([e], [trouble("x", 4, 0), trouble("y", 3, 1.5), trouble("z", 3, 4)], 0.5);
    expect(r.hits.map((h) => h.troubleId).sort()).toEqual(["x", "y"]);
    expect(r.effects.length).toBe(0);
  });

  it("beams hit the nearest trouble on the line every 200 ms and expire at 600", () => {
    const e = releaseEffect(beam, hero, { x: 14, z: 0 }, 0, "b");
    let troubles = [trouble("near", 4, 0.5), trouble("far", 9, 0)];
    let effects: SpellEffect[] = [e];
    let now = 0;
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) {
      now += 1000 / 60;
      const r = stepEffects(effects, troubles, hero, [], 1 / 60, now);
      effects = r.effects;
      for (const h of r.hits) ids.push(h.troubleId);
    }
    expect(ids).toEqual(["near", "near", "near"]);
    expect(effects.length).toBe(0);
  });

  it("walls become troubles-only colliders for six seconds", () => {
    const e = releaseEffect(wall, hero, { x: 0, z: -5 }, 0, "w");
    const props = barrierColliders([e]);
    expect(props.length).toBe(1);
    expect(props[0].kind).toBe("barrier");
    expect(props[0].size.w).toBe(4);
    expect(props[0].size.d).toBeCloseTo(0.4, 5);
    expect(run([e], [], 6.1).effects.length).toBe(0);
  });
});

describe("self and summon", () => {
  it("shields the hero for five seconds", () => {
    const e = releaseEffect(shield, hero, hero, 0, "s");
    expect(heroShielded([e], 4999)).toBe(true);
    expect(heroShielded([e], 5000)).toBe(false);
  });

  it("aura pulses every 500 ms on everything within range for three seconds", () => {
    const r = run([releaseEffect(aura, hero, hero, 0, "au")], [trouble("in", 3, 0), trouble("out", 6, 0)], 3.1);
    // each pulse hits `in`; the test harness removes a hit trouble, so exactly one hit lands on it
    expect(r.hits.map((h) => h.troubleId)).toEqual(["in"]);
    expect(r.effects.length).toBe(0);
  });

  it("a summon follows and fires a mini bolt at a trouble within four units every 1.5 s", () => {
    const r = run([releaseEffect(sprite, hero, hero, 0, "sum")], [trouble("t", 3, 0)], 1.6);
    expect(r.spawned.length).toBe(1);
    expect(r.spawned[0]).toMatchObject({ kind: "projectile" });
    expect((r.spawned[0] as Extract<SpellEffect, { kind: "projectile" }>).spell.speed).toBe(10);
  });

  it("knows which spells mend", () => {
    expect(hasStatus(mendBolt, "mended")).toBe(true);
    expect(hasStatus(bolt, "mended")).toBe(false);
  });
});
```

`src/lib/realm/spells/focus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DAZZLE_MS, startFocus, stepFocus, isDazzled } from "./focus";

describe("focus", () => {
  it("dazzles for 1.5 s after losing focus and not before", () => {
    const f = startFocus();
    expect(isDazzled(f, 0)).toBe(false);
    const hit = stepFocus(f, true, 1000);
    expect(isDazzled(hit, 1000)).toBe(true);
    expect(isDazzled(hit, 1000 + DAZZLE_MS - 1)).toBe(true);
    expect(isDazzled(hit, 1000 + DAZZLE_MS)).toBe(false);
    expect(stepFocus(hit, false, 1200)).toBe(hit);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/spells/`
Expected: FAIL (modules missing) except the Task 1 file.

- [ ] **Step 3: Mana and focus**

`src/lib/realm/spells/mana.ts`:

```ts
import type { SpellDefinition } from "@/lib/utils/spell-catalog";

export const MANA_MAX = 100;
export const MANA_REGEN_PER_S = 5;

export function startMana(): number {
  return MANA_MAX;
}

export function stepMana(mana: number, dt: number): number {
  return Math.min(MANA_MAX, mana + MANA_REGEN_PER_S * dt);
}

export function canCast(mana: number, spell: SpellDefinition): boolean {
  return mana >= spell.manaCost;
}

export function spend(mana: number, spell: SpellDefinition): number {
  return Math.max(0, mana - spell.manaCost);
}

export function refund(mana: number, spell: SpellDefinition): number {
  return Math.min(MANA_MAX, mana + spell.manaCost);
}
```

`src/lib/realm/spells/focus.ts`:

```ts
export const DAZZLE_MS = 1500;
export type FocusState = { dazzledUntil: number };

export function startFocus(): FocusState {
  return { dazzledUntil: 0 };
}

/** Losing focus is the only thing a trouble can do to the hero: a short dazzle, nothing lost. */
export function stepFocus(state: FocusState, focusLost: boolean, now: number): FocusState {
  return focusLost ? { dazzledUntil: now + DAZZLE_MS } : state;
}

export function isDazzled(state: FocusState, now: number): boolean {
  return now < state.dazzledUntil;
}
```

- [ ] **Step 4: Caster**

`src/lib/realm/spells/caster.ts`:

```ts
import type { Vec2 } from "../layout";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { canCast, spend } from "./mana";

export type CastTarget = Vec2;
export type Casting = { spell: SpellDefinition; slot: number; target: CastTarget; startedAt: number; releaseAt: number };
export type CasterState = { selectedSlot: number | null; casting: Casting | null };
export type Refusal = "mana" | "busy" | null;

export function selectSlot(state: CasterState, slot: number | null): CasterState {
  return { ...state, selectedSlot: slot };
}

/** Unit vector from the hero to a point; a tap on the hero itself fires north. */
export function directionFrom(hero: Vec2, target: Vec2): Vec2 {
  const dx = target.x - hero.x;
  const dz = target.z - hero.z;
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? { x: 0, z: -1 } : { x: dx / len, z: dz / len };
}

/** Where a spell lands for its shape: areas and walls within range, beams at full range, self spells on the hero. */
export function castTargetFor(spell: SpellDefinition, hero: Vec2, tap: Vec2): CastTarget {
  const dir = directionFrom(hero, tap);
  const d = Math.hypot(tap.x - hero.x, tap.z - hero.z);
  switch (spell.shape) {
    case "self":
      return { ...hero };
    case "beam":
      return { x: hero.x + dir.x * spell.range, z: hero.z + dir.z * spell.range };
    case "area":
    case "barrier": {
      const r = Math.min(d, spell.range);
      return { x: hero.x + dir.x * r, z: hero.z + dir.z * r };
    }
    case "projectile":
    case "summon":
      return { ...tap };
  }
}

export function beginCast(state: CasterState, spell: SpellDefinition, slot: number, hero: Vec2, tap: Vec2, mana: number, now: number): { state: CasterState; mana: number; refused: Refusal } {
  if (state.casting) return { state, mana, refused: "busy" };
  if (!canCast(mana, spell)) return { state, mana, refused: "mana" };
  const target = castTargetFor(spell, hero, tap);
  return {
    state: { ...state, casting: { spell, slot, target, startedAt: now, releaseAt: now + spell.castMs } },
    mana: spend(mana, spell),
    refused: null,
  };
}

export function stepCaster(state: CasterState, now: number): { state: CasterState; released: Casting | null } {
  if (!state.casting || now < state.casting.releaseAt) return { state, released: null };
  return { state: { ...state, casting: null }, released: state.casting };
}
```

- [ ] **Step 5: Effects**

`src/lib/realm/spells/effects.ts`:

```ts
import { WORLD_SIZE, type Prop, type Vec2 } from "../layout";
import type { SpellDefinition, StatusKind } from "@/lib/utils/spell-catalog";
import { hitTrouble, TROUBLE_RADIUS, type Trouble } from "./troubles";
import { directionFrom } from "./caster";

export type EffectHit = { effectId: string; troubleId: string; spell: SpellDefinition };

export type SpellEffect =
  | { kind: "projectile"; id: string; spell: SpellDefinition; position: Vec2; velocity: Vec2; travelled: number; bounced: boolean; radius: number }
  | { kind: "area"; id: string; spell: SpellDefinition; position: Vec2; radius: number; until: number; hit: string[] }
  | { kind: "beam"; id: string; spell: SpellDefinition; from: Vec2; to: Vec2; until: number; nextHitAt: number }
  | { kind: "barrier"; id: string; spell: SpellDefinition; a: Vec2; b: Vec2; until: number }
  | { kind: "self"; id: string; spell: SpellDefinition; position: Vec2; until: number; nextHitAt: number }
  | { kind: "summon"; id: string; spell: SpellDefinition; position: Vec2; until: number; nextShotAt: number };

export const PROJECTILE_RADIUS = 0.6;
export const SEEK_RANGE = 3;
export const SEEK_TURN = Math.PI / 2; // radians per second
export const AREA_RADIUS = 2;
export const AREA_GROWN_RADIUS = 3;
export const AREA_MS = 400;
export const BEAM_WIDTH = 0.8;
export const BEAM_TICK_MS = 200;
export const BEAM_MS = 600;
export const BARRIER_LENGTH = 4;
export const BARRIER_THICKNESS = 0.4;
export const BARRIER_MS = 6000;
export const SHIELD_MS = 5000;
export const AURA_TICK_MS = 500;
export const AURA_MS = 3000;
export const SUMMON_MS = 8000;
export const SUMMON_SHOT_MS = 1500;
export const SUMMON_SENSE = 4;
export const SUMMON_FOLLOW = 1.2;
const MINI_BOLT_SPEED = 10;
const MINI_BOLT_RANGE = 4;
const LIMIT = WORLD_SIZE / 2;

export function hasStatus(spell: SpellDefinition, kind: StatusKind): boolean {
  return spell.statuses.some((s) => s.kind === kind);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearest(troubles: Trouble[], p: Vec2, within: number): Trouble | null {
  let best: Trouble | null = null;
  let bestD = within;
  for (const t of troubles) {
    const d = dist(t.position, p);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function insideProp(p: Vec2, prop: Prop, pad: number): boolean {
  return Math.abs(p.x - prop.position.x) < prop.size.w / 2 + pad && Math.abs(p.z - prop.position.z) < prop.size.d / 2 + pad;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return dist(p, { x: a.x + abx * t, z: a.z + abz * t });
}

/** Turns a released cast into its live effect. `target` is already shaped by `castTargetFor`. */
export function releaseEffect(spell: SpellDefinition, hero: Vec2, target: Vec2, now: number, id: string): SpellEffect {
  const dir = directionFrom(hero, target);
  switch (spell.shape) {
    case "projectile":
      return { kind: "projectile", id, spell, position: { ...hero }, velocity: { x: dir.x * spell.speed, z: dir.z * spell.speed }, travelled: 0, bounced: false, radius: PROJECTILE_RADIUS };
    case "area":
      return { kind: "area", id, spell, position: { ...target }, radius: hasStatus(spell, "grown") ? AREA_GROWN_RADIUS : AREA_RADIUS, until: now + AREA_MS, hit: [] };
    case "beam":
      return { kind: "beam", id, spell, from: { ...hero }, to: { ...target }, until: now + BEAM_MS, nextHitAt: now };
    case "barrier": {
      const perp = { x: -dir.z, z: dir.x };
      const half = BARRIER_LENGTH / 2;
      return { kind: "barrier", id, spell, a: { x: target.x - perp.x * half, z: target.z - perp.z * half }, b: { x: target.x + perp.x * half, z: target.z + perp.z * half }, until: now + BARRIER_MS };
    }
    case "self":
      return { kind: "self", id, spell, position: { ...hero }, until: now + (spell.parts.formId === "shield" ? SHIELD_MS : AURA_MS), nextHitAt: now };
    case "summon":
      return { kind: "summon", id, spell, position: { x: hero.x, z: hero.z + SUMMON_FOLLOW }, until: now + SUMMON_MS, nextShotAt: now + SUMMON_SHOT_MS };
  }
}

/** Walls block troubles, never the hero: thin solid props aligned to the wall's axis. */
export function barrierColliders(effects: SpellEffect[]): Prop[] {
  const out: Prop[] = [];
  for (const e of effects) {
    if (e.kind !== "barrier") continue;
    const alongX = Math.abs(e.b.x - e.a.x) >= Math.abs(e.b.z - e.a.z);
    out.push({
      id: `barrier-${e.id}`,
      kind: "barrier",
      label: "Wall",
      position: { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 },
      size: alongX ? { w: BARRIER_LENGTH, d: BARRIER_THICKNESS, h: 1.2 } : { w: BARRIER_THICKNESS, d: BARRIER_LENGTH, h: 1.2 },
      color: e.spell.color,
      solid: true,
    });
  }
  return out;
}

export function heroShielded(effects: SpellEffect[], now: number): boolean {
  return effects.some((e) => e.kind === "self" && e.spell.parts.formId === "shield" && now < e.until);
}

/**
 * One frame for every live effect. Returns the surviving effects, the hits
 * they landed this frame (each trouble at most once per effect per tick), and
 * any effects a summon spawned. Callers apply hits to troubles themselves.
 */
export function stepEffects(effects: SpellEffect[], troubles: Trouble[], hero: Vec2, colliders: Prop[], dt: number, now: number): { effects: SpellEffect[]; hits: EffectHit[]; spawned: SpellEffect[] } {
  const hits: EffectHit[] = [];
  const spawned: SpellEffect[] = [];
  const out: SpellEffect[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case "projectile": {
        let velocity = e.velocity;
        if (hasStatus(e.spell, "seeking")) {
          const mark = nearest(troubles, e.position, SEEK_RANGE);
          if (mark) {
            const want = Math.atan2(mark.position.z - e.position.z, mark.position.x - e.position.x);
            const have = Math.atan2(velocity.z, velocity.x);
            let diff = want - have;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.max(-SEEK_TURN * dt, Math.min(SEEK_TURN * dt, diff));
            const angle = have + turn;
            velocity = { x: Math.cos(angle) * e.spell.speed, z: Math.sin(angle) * e.spell.speed };
          }
        }
        const position = { x: e.position.x + velocity.x * dt, z: e.position.z + velocity.z * dt };
        const travelled = e.travelled + e.spell.speed * dt;
        const radius = hasStatus(e.spell, "grown") ? PROJECTILE_RADIUS * (1 + Math.min(1, travelled / e.spell.range)) : PROJECTILE_RADIUS;
        const target = troubles.find((t) => hitTrouble(t, position, radius));
        if (target) {
          hits.push({ effectId: e.id, troubleId: target.id, spell: e.spell });
          break; // the projectile is spent
        }
        if (travelled > e.spell.range || Math.abs(position.x) > LIMIT || Math.abs(position.z) > LIMIT) break;
        const wall = colliders.find((c) => insideProp(position, c, 0.3));
        if (wall) {
          if (hasStatus(e.spell, "bounce") && !e.bounced) {
            // Reflect on the axis with the shallower penetration: that is the face it came through.
            const penX = wall.size.w / 2 + 0.3 - Math.abs(position.x - wall.position.x);
            const penZ = wall.size.d / 2 + 0.3 - Math.abs(position.z - wall.position.z);
            velocity = penX < penZ ? { x: -velocity.x, z: velocity.z } : { x: velocity.x, z: -velocity.z };
            out.push({ ...e, position: e.position, velocity, travelled, bounced: true, radius });
          }
          break;
        }
        out.push({ ...e, position, velocity, travelled, radius });
        break;
      }
      case "area": {
        if (now >= e.until) break;
        const hit = e.hit.slice();
        for (const t of troubles) {
          if (hit.includes(t.id)) continue;
          if (dist(t.position, e.position) <= e.radius + TROUBLE_RADIUS) {
            hit.push(t.id);
            hits.push({ effectId: e.id, troubleId: t.id, spell: e.spell });
          }
        }
        out.push({ ...e, hit });
        break;
      }
      case "beam": {
        if (now >= e.until) break;
        let nextHitAt = e.nextHitAt;
        if (now >= nextHitAt) {
          let best: Trouble | null = null;
          let bestD = Infinity;
          for (const t of troubles) {
            if (segmentDistance(t.position, e.from, e.to) > BEAM_WIDTH) continue;
            const d = dist(t.position, e.from);
            if (d < bestD) {
              best = t;
              bestD = d;
            }
          }
          if (best) hits.push({ effectId: e.id, troubleId: best.id, spell: e.spell });
          nextHitAt = now + BEAM_TICK_MS;
        }
        out.push({ ...e, nextHitAt });
        break;
      }
      case "barrier": {
        if (now < e.until) out.push(e);
        break;
      }
      case "self": {
        if (now >= e.until) break;
        let nextHitAt = e.nextHitAt;
        if (e.spell.parts.formId !== "shield" && now >= nextHitAt) {
          for (const t of troubles) {
            if (dist(t.position, hero) <= e.spell.range) hits.push({ effectId: e.id, troubleId: t.id, spell: e.spell });
          }
          nextHitAt = now + AURA_TICK_MS;
        }
        out.push({ ...e, position: { ...hero }, nextHitAt });
        break;
      }
      case "summon": {
        if (now >= e.until) break;
        const follow = { x: hero.x, z: hero.z + SUMMON_FOLLOW };
        const k = Math.min(1, dt * 4);
        const position = { x: e.position.x + (follow.x - e.position.x) * k, z: e.position.z + (follow.z - e.position.z) * k };
        let nextShotAt = e.nextShotAt;
        if (now >= nextShotAt) {
          const mark = nearest(troubles, position, SUMMON_SENSE);
          if (mark) {
            const mini: SpellDefinition = { ...e.spell, shape: "projectile", speed: MINI_BOLT_SPEED, range: MINI_BOLT_RANGE, statuses: [] };
            spawned.push(releaseEffect(mini, position, mark.position, now, `${e.id}-shot-${Math.round(now)}`));
          }
          nextShotAt = now + SUMMON_SHOT_MS;
        }
        out.push({ ...e, position, nextShotAt });
        break;
      }
    }
  }
  return { effects: out, hits, spawned };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/realm/spells/`
Expected: all pass. If the seek test misses (the turn budget at 60 fps over 8 units of flight is ~0.9 rad, ample for a 1.5-unit offset), check the angle wrap; if the bounce test's reflected velocity is not negative, check that `penX < penZ` picks the x face for a head-on hit from the west.

- [ ] **Step 7: Commit**

```bash
git add src/lib/realm/spells/
git commit -m "Realm casting model: mana, caster, effects per shape, focus"
```

---

### Task 3: Spellbook pages in the bundle, trouble figures, sprite textures

**Files:**
- Create: `src/lib/services/spells.ts`, `src/lib/realm/spells/pages.ts`, `src/lib/realm/spells/pages.test.ts`, `src/components/realm/trouble-figures.tsx`, `src/components/realm/trouble-figures.test.tsx`
- Modify: `src/lib/actions/spells.ts` (use the service), `src/lib/actions/realm.ts` (bundle field), `src/components/realm/sprite-source.tsx` (+ test), `src/components/realm/realm-shell.test.tsx` (fixture + mock)

**Interfaces:**
- Produces: `SpellPage = { id; slot; elementId; formId; modifierId; adjective; noun }`, `loadSpellbookPages(childId): Promise<{ spells: SpellPage[]; slots: number }>`; `RealmBundle.spellbook: { spells: SpellPage[]; slots: number }`; `SpellPageView = { slot; name; spell: SpellDefinition | null; color: string; icon: GameIconName | null }`, `resolvePages(spells, slots)`, `FADED_PAGE = "This page is faded."`; `TroubleFigure({ kind, skin })` (svg `data-figure="trouble"`, `data-figure-id="{kind}:{skin}"`), `TROUBLE_KINDS`; `SpriteSource` prop `troubleSkin?: TroubleSkin | null` and `SpriteTextures.troubles: Partial<Record<TroubleKind, CanvasTexture>>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/realm/spells/pages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePages, FADED_PAGE } from "./pages";

const page = (slot: number, elementId = "ember", formId = "bolt", modifierId: string | null = null) => ({ id: `s${slot}`, slot, elementId, formId, modifierId, adjective: "Ember", noun: "Bolt" });

describe("resolvePages", () => {
  it("resolves pages in slot order with element colour and form icon, naming unresolvable ones faded", () => {
    const views = resolvePages([page(2, "tide", "orb"), page(0), page(1, "nope", "bolt")], 4);
    expect(views.map((v) => v.slot)).toEqual([0, 1, 2]);
    expect(views[0]).toMatchObject({ name: "Ember Bolt", color: "#f97316", icon: "lightning" });
    expect(views[0].spell?.manaCost).toBe(10);
    expect(views[1]).toMatchObject({ name: FADED_PAGE, spell: null, icon: null });
    expect(views[2].spell?.shape).toBe("projectile");
  });
  it("drops pages beyond the hero's slot count", () => {
    expect(resolvePages([page(0), page(5)], 4).length).toBe(1);
  });
});
```

`src/components/realm/trouble-figures.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TroubleFigure, TROUBLE_KINDS } from "./trouble-figures";

afterEach(cleanup);

describe("TroubleFigure", () => {
  it("draws every kind in both skins with figure attributes", () => {
    for (const kind of TROUBLE_KINDS) {
      for (const skin of ["gentle", "monsters"] as const) {
        const { container } = render(<TroubleFigure kind={kind} skin={skin} />);
        const svg = container.querySelector('svg[data-figure="trouble"]')!;
        expect(svg.getAttribute("data-figure-id")).toBe(`${kind}:${skin}`);
        expect(svg.getAttribute("viewBox")).toBe("0 0 36 48");
        expect(svg.querySelectorAll("rect,path,circle,polygon,ellipse").length).toBeGreaterThan(1);
        cleanup();
      }
    }
  });
});
```

Append to `src/components/realm/sprite-source.test.tsx` (inside the describe):

```tsx
  it("rasterizes the three trouble figures for the requested skin", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} troubleSkin="monsters" onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(Object.keys(textures.troubles).sort()).toEqual(["cursed-stone", "fog", "shadow-blob"]);
    expect(textures.troubles.fog).toMatchObject({ id: "fog:monsters" });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realm/spells/pages.test.ts src/components/realm/trouble-figures.test.tsx src/components/realm/sprite-source.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Spellbook service and bundle field**

Create `src/lib/services/spells.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { levelFromXp } from "@/lib/utils/level";
import { spellSlots } from "@/lib/utils/spell-slots";

/** One saved page of a hero's spellbook: catalog ids plus the chosen name. */
export type SpellPage = {
  id: string;
  slot: number;
  elementId: string;
  formId: string;
  modifierId: string | null;
  adjective: string;
  noun: string;
};

export function toPage(row: typeof schema.spell.$inferSelect): SpellPage {
  return { id: row.id, slot: row.slot, elementId: row.elementId, formId: row.formId, modifierId: row.modifierId, adjective: row.adjective, noun: row.noun };
}

/** The pages and slot count the Realm and the Spellbook page both read. Unlock rules live in the action. */
export async function loadSpellbookPages(childId: string): Promise<{ spells: SpellPage[]; slots: number; level: number }> {
  const [childRows, rows] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select().from(schema.spell).where(eq(schema.spell.childId, childId)).orderBy(schema.spell.slot),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  return { spells: rows.map(toPage), slots: spellSlots(level), level };
}
```

In `src/lib/actions/spells.ts`: keep `export type SpellRecord = { … }` exactly as it is (structurally identical to `SpellPage`); replace the private `toRecord` with `import { toPage, loadSpellbookPages } from "@/lib/services/spells";` and `const toRecord = toPage;` (a private const, not an export); in `getSpellbook`, replace the inline spell query with `loadSpellbookPages(childId)` and use its `spells`/`slots` (keep `level`, `unlocked`, `schoolCounts`, `subjectNamesBySchool` from `loadUnlockContext` as today). Remove the now-unused `spellSlots` import if nothing else in the file uses it.

In `src/lib/actions/realm.ts`: add `import { loadSpellbookPages, type SpellPage } from "@/lib/services/spells";`, the bundle field `spellbook: { spells: SpellPage[]; slots: number };`, `loadSpellbookPages(childId)` as one more entry in the `Promise.all` (no catch: a spellbook read failure fails the bundle like the child read), and `spellbook: { spells: spellbook.spells, slots: spellbook.slots }` in the returned object.

- [ ] **Step 4: Pages module**

`src/lib/realm/spells/pages.ts`:

```ts
import { findElement, findForm, resolveSpell, type SpellDefinition } from "@/lib/utils/spell-catalog";
import type { SpellPage } from "@/lib/services/spells";
import type { GameIconName } from "@/components/game-icon";

export const FADED_PAGE = "This page is faded.";

export type SpellPageView = { slot: number; name: string; spell: SpellDefinition | null; color: string; icon: GameIconName | null };

/** Pages the bar and the scene share: resolved once, sorted by slot, faded when a part is gone from the catalog. */
export function resolvePages(spells: SpellPage[], slots: number): SpellPageView[] {
  return spells
    .filter((s) => s.slot < slots)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => {
      const spell = resolveSpell({ elementId: s.elementId, formId: s.formId, modifierId: s.modifierId });
      if (!spell) return { slot: s.slot, name: FADED_PAGE, spell: null, color: "#6b7280", icon: null };
      return { slot: s.slot, name: `${s.adjective} ${s.noun}`, spell, color: findElement(s.elementId)!.color, icon: findForm(s.formId)!.icon };
    });
}
```

- [ ] **Step 5: Trouble figures**

`src/components/realm/trouble-figures.tsx` (inline pixel-style SVGs, 36×48 viewBox so the sprite pipeline's fixed canvas fits):

```tsx
import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";

export const TROUBLE_KINDS: TroubleKind[] = ["fog", "cursed-stone", "shadow-blob"];

function Fog() {
  return (
    <g fill="#cbd5e1" opacity="0.85">
      <ellipse cx="12" cy="30" rx="9" ry="6" />
      <ellipse cx="22" cy="26" rx="10" ry="7" />
      <ellipse cx="18" cy="34" rx="12" ry="6" />
    </g>
  );
}
function MistWisp() {
  return (
    <g>
      <path d="M8 40 Q4 22 18 14 Q32 22 28 40 L24 36 L20 40 L16 36 L12 40 Z" fill="#e2e8f0" />
      <circle cx="14" cy="24" r="2" fill="#1e293b" />
      <circle cx="22" cy="24" r="2" fill="#1e293b" />
      <path d="M13 31 Q18 34 23 31" stroke="#1e293b" strokeWidth="1.5" fill="none" />
    </g>
  );
}
function CursedStone() {
  return (
    <g>
      <path d="M6 40 L10 20 L20 14 L30 22 L30 40 Z" fill="#6b7280" />
      <path d="M16 20 L19 28 L15 33 L20 40" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
      <path d="M24 24 L22 31 L26 36" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
    </g>
  );
}
function Gargoyle() {
  return (
    <g>
      <path d="M4 22 L12 26 L10 14 Z" fill="#9ca3af" />
      <path d="M32 22 L24 26 L26 14 Z" fill="#9ca3af" />
      <rect x="11" y="18" width="14" height="22" rx="4" fill="#6b7280" />
      <circle cx="15" cy="26" r="2" fill="#fbbf24" />
      <circle cx="21" cy="26" r="2" fill="#fbbf24" />
      <path d="M13 34 L23 34" stroke="#374151" strokeWidth="2" />
    </g>
  );
}
function Shadow() {
  return (
    <g>
      <ellipse cx="18" cy="30" rx="12" ry="10" fill="#312e81" opacity="0.9" />
      <circle cx="14" cy="28" r="2.2" fill="#c7d2fe" />
      <circle cx="22" cy="28" r="2.2" fill="#c7d2fe" />
    </g>
  );
}
function Blob() {
  return (
    <g>
      <path d="M6 38 Q6 18 18 16 Q30 18 30 38 Z" fill="#22c55e" />
      <circle cx="14" cy="27" r="2.5" fill="#052e16" />
      <circle cx="22" cy="27" r="2.5" fill="#052e16" />
      <path d="M12 33 L15 36 L18 33 L21 36 L24 33" stroke="#052e16" strokeWidth="1.5" fill="none" />
    </g>
  );
}

const FIGURES: Record<TroubleKind, Record<TroubleSkin, () => React.JSX.Element>> = {
  fog: { gentle: Fog, monsters: MistWisp },
  "cursed-stone": { gentle: CursedStone, monsters: Gargoyle },
  "shadow-blob": { gentle: Shadow, monsters: Blob },
};

/** A trouble drawn in the hero's tone, on the same 36×48 canvas as every other Realm sprite. */
export function TroubleFigure({ kind, skin, size = 96 }: { kind: TroubleKind; skin: TroubleSkin; size?: number }) {
  const Figure = FIGURES[kind][skin];
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: "pixelated" }} aria-hidden="true" data-figure="trouble" data-figure-id={`${kind}:${skin}`}>
      <Figure />
    </svg>
  );
}
```

If `React.JSX.Element` needs an import, add `import type React from "react";`.

- [ ] **Step 6: Sprite source**

In `src/components/realm/sprite-source.tsx`: import `TroubleFigure, TROUBLE_KINDS` and `type TroubleKind, type TroubleSkin`; extend `SpriteTextures` with `troubles: Partial<Record<TroubleKind, THREE.CanvasTexture>>`; add prop `troubleSkin?: TroubleSkin | null` (default `null`); after the villagers loop:

```ts
      const troubleTextures: Partial<Record<TroubleKind, THREE.CanvasTexture>> = {};
      if (troubleSkin) {
        for (const kind of TROUBLE_KINDS) {
          const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="trouble"][data-figure-id="${kind}:${troubleSkin}"]`);
          if (svg) troubleTextures[kind] = await textureFor(`trouble:${kind}:${troubleSkin}`, svg);
        }
      }
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures, troubles: troubleTextures });
```

add `troubleSkin` to the effect deps, and render `{troubleSkin && TROUBLE_KINDS.map((kind) => <TroubleFigure key={kind} kind={kind} skin={troubleSkin} />)}` in the hidden host.

- [ ] **Step 7: Fixtures**

`src/components/realm/realm-shell.test.tsx`: the `SpriteSource` mock reports `{ hero: {}, companion: null, villagers: {}, troubles: {} }`; the `bundle` fixture gains `spellbook: { spells: [], slots: 4 }`. `src/components/realm/sprite-source.test.tsx` existing assertions are unchanged.

- [ ] **Step 8: Run everything**

Run: `npx vitest run` then `npm run typecheck` and `npx eslint src/lib/services/ src/lib/actions/ src/lib/realm/spells/ src/components/realm/`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/spells.ts src/lib/actions/spells.ts src/lib/actions/realm.ts src/lib/realm/spells/pages.ts src/lib/realm/spells/pages.test.ts src/components/realm/trouble-figures.tsx src/components/realm/trouble-figures.test.tsx src/components/realm/sprite-source.tsx src/components/realm/sprite-source.test.tsx src/components/realm/realm-shell.test.tsx
git commit -m "Spellbook pages in the Realm bundle; trouble figures through the sprite pipeline"
```

---

### Task 4: Spell bar, HUD additions, cast input

**Files:**
- Create: `src/components/realm/spell-bar.tsx`, `src/components/realm/spell-bar.test.tsx`
- Modify: `src/components/realm/realm-hud.tsx`, `src/components/realm/realm-hud.test.tsx`, `src/components/realm/use-realm-input.ts`, `src/components/realm/use-realm-input.test.ts`, `src/components/realm/realm-shell.tsx` (pass `mana={null} cleared={null} notice={null}` to `RealmHud` as an interim so it compiles; Task 5 wires the real values), `src/app/globals.css`

**Interfaces:**
- Consumes: `SpellPageView`, `FADED_PAGE` (Task 3); `MANA_MAX` (Task 2).
- Produces: `SpellBar({ pages, selectedSlot, mana, fewerChoices, onSelect })`; `RealmHud` props `mana: number | null`, `cleared: number | null`, `notice: string | null`; `useRealmInput({ enabled, castEnabled })` returning `castRef: RefObject<CastRequest | null>` and `requestCast(req)`, with `CastRequest = { target: Vec2 } | { nearest: true }`.

- [ ] **Step 1: Write the failing tests**

`src/components/realm/spell-bar.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SpellBar } from "./spell-bar";
import { resolvePages, FADED_PAGE } from "@/lib/realm/spells/pages";

afterEach(cleanup);
const page = (slot: number, elementId = "ember", formId = "bolt") => ({ id: `s${slot}`, slot, elementId, formId, modifierId: null, adjective: "Ember", noun: "Bolt" });
const pages = resolvePages([page(0), page(1, "tide", "orb"), page(2, "nope"), page(3), page(4), page(5)], 12);

describe("SpellBar", () => {
  it("lists pages with names and costs, marks the selected one, and dims what the hero cannot afford", () => {
    render(<SpellBar pages={pages} selectedSlot={1} mana={12} fewerChoices={false} onSelect={() => {}} />);
    const orb = screen.getByRole("button", { name: "Ember Bolt, 15 mana" });
    expect(orb).toHaveAttribute("aria-pressed", "true");
    expect(orb.className).toContain("realm-spell--dim");
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button").length).toBe(6);
  });

  it("selects on tap, deselects on a second tap, and keeps faded pages unselectable", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={0} mana={100} fewerChoices={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    const faded = screen.getByRole("button", { name: FADED_PAGE });
    expect(faded).toBeDisabled();
  });

  it("selects with number keys and deselects with Escape", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "3" }); // faded page: ignored
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows only four pages under fewer choices", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={true} onSelect={() => {}} />);
    expect(screen.getAllByRole("button").length).toBe(4);
  });
});
```

Append to `src/components/realm/realm-hud.test.tsx` (add `mana={null} cleared={null} notice={null}` to every existing render first):

```tsx
  it("shows mana, the cleared count, and a notice", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={42} cleared={3} notice="The fog thins." />);
    const bar = screen.getByRole("progressbar", { name: "Mana" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Cleared: 3")).toBeInTheDocument();
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
  });
  it("hides mana and the count in preview", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: null }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared:/)).not.toBeInTheDocument();
  });
```

Append to `src/components/realm/use-realm-input.test.ts` (inside the describe):

```ts
  it("turns Space into a nearest-target cast request only while casting is enabled", () => {
    const { result, rerender } = renderHook(({ castEnabled }) => useRealmInput({ castEnabled }), { initialProps: { castEnabled: false } });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    expect(result.current.castRef.current).toBeNull();
    rerender({ castEnabled: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    expect(result.current.castRef.current).toEqual({ nearest: true });
    result.current.castRef.current = null;
    result.current.requestCast({ target: { x: 1, z: 2 } });
    expect(result.current.castRef.current).toEqual({ target: { x: 1, z: 2 } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/realm/spell-bar.test.tsx src/components/realm/realm-hud.test.tsx src/components/realm/use-realm-input.test.ts`
Expected: FAIL.

- [ ] **Step 3: Spell bar**

`src/components/realm/spell-bar.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { GameIcon } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

const FEWER = 4;

/** The hero's pages along the bottom of the world. Keys 1–9 select, a second tap or Escape deselects. */
export function SpellBar({
  pages,
  selectedSlot,
  mana,
  fewerChoices,
  onSelect,
}: {
  pages: SpellPageView[];
  selectedSlot: number | null;
  mana: number;
  fewerChoices: boolean;
  onSelect: (slot: number | null) => void;
}) {
  const shown = fewerChoices ? pages.slice(0, FEWER) : pages;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [role='dialog']")) return;
      if (e.key === "Escape") {
        onSelect(null);
        return;
      }
      const index = Number.parseInt(e.key, 10);
      if (!Number.isInteger(index) || index < 1 || index > 9) return;
      const page = shown[index - 1];
      if (!page || !page.spell) return;
      e.preventDefault();
      onSelect(page.slot === selectedSlot ? null : page.slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedSlot, onSelect]);

  return (
    <div className="realm-spellbar" role="toolbar" aria-label="Spellbook">
      {shown.map((page, i) => {
        const selected = page.slot === selectedSlot;
        const affordable = page.spell ? mana >= page.spell.manaCost : false;
        const label = page.spell ? `${page.name}, ${page.spell.manaCost} mana` : page.name;
        return (
          <button
            key={page.slot}
            type="button"
            className={`realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}`}
            style={{ borderColor: page.color }}
            aria-pressed={selected}
            aria-label={label}
            disabled={!page.spell}
            onClick={() => onSelect(selected ? null : page.slot)}
          >
            <span className="realm-spell-key">{i + 1}</span>
            <span className="realm-spell-swatch" style={{ background: page.color }} />
            {page.icon && <GameIcon name={page.icon} className="size-4" />}
            <span className="realm-spell-name">{page.name}</span>
            {selected && page.spell && <span className="realm-spell-cost">{page.spell.manaCost}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: HUD**

In `src/components/realm/realm-hud.tsx` add props `mana: number | null; cleared: number | null; notice: string | null;`, import `MANA_MAX` from `@/lib/realm/spells/mana`, and render after the minutes span in the row:

```tsx
        {mana !== null && (
          <span className="realm-hud-mana" role="progressbar" aria-label="Mana" aria-valuemin={0} aria-valuemax={MANA_MAX} aria-valuenow={Math.round(mana)}>
            <span className="realm-hud-mana-fill" style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
            <span className="realm-hud-mana-text">Mana {Math.round(mana)}</span>
          </span>
        )}
        {cleared !== null && <span className="realm-hud-cleared">Cleared: {cleared}</span>}
```

and after the toast: `{notice && <p className="realm-hud-notice" aria-live="polite">{notice}</p>}`.

- [ ] **Step 5: Input**

In `src/components/realm/use-realm-input.ts`:

```ts
export type CastRequest = { target: Vec2 } | { nearest: true };

export function useRealmInput({ enabled = true, castEnabled = false }: { enabled?: boolean; castEnabled?: boolean } = {}) {
  const axisRef = useRef<Vec2>({ x: 0, z: 0 });
  const castRef = useRef<CastRequest | null>(null);
  …
```

Inside the enabled branch of the effect, add a Space handler before the movement `down` registration:

```ts
    function castKey(e: KeyboardEvent) {
      if (!castEnabled || e.code !== "Space") return;
      const t = e.target;
      if (t instanceof Element && t.closest("a, button, input, textarea, select, [role='dialog']")) return;
      e.preventDefault();
      castRef.current = { nearest: true };
    }
    window.addEventListener("keydown", castKey);
```

remove it in the cleanup, add `castEnabled` to the deps, and return `{ axisRef, setStick, castRef, requestCast }` where `const requestCast = useCallback((req: CastRequest) => { castRef.current = req; }, []);`.

- [ ] **Step 6: Styles**

Append to the Realm block in `src/app/globals.css`:

```css
.realm-spellbar { position: absolute; left: 50%; bottom: 1.25rem; z-index: 20; display: flex; gap: 0.4rem; transform: translateX(-50%); max-width: calc(100vw - 2rem); overflow-x: auto; padding: 0.3rem; border-radius: 9999px; background: rgba(0, 0, 0, 0.5); font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; }
.realm-spell { position: relative; display: flex; align-items: center; gap: 0.35rem; min-height: 44px; min-width: 44px; padding: 0 0.7rem; border-radius: 9999px; border: 2px solid transparent; background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 12px; white-space: nowrap; cursor: pointer; }
.realm-spell--selected { background: rgba(201, 168, 76, 0.3); box-shadow: 0 0 0 2px var(--gold-bright); }
.realm-spell--dim { opacity: 0.55; }
.realm-spell:disabled { opacity: 0.35; cursor: default; }
.realm-spell-key { font-size: 10px; color: var(--gold-bright); }
.realm-spell-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 9999px; }
.realm-spell-cost { font-weight: 700; color: var(--gold-bright); }
.realm-hud-mana { position: relative; display: inline-block; min-width: 7rem; height: 1.3em; border-radius: 9999px; overflow: hidden; background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(59, 130, 246, 0.6); }
.realm-hud-mana-fill { position: absolute; inset: 0 auto 0 0; background: rgba(59, 130, 246, 0.6); }
.realm-hud-mana-text { position: relative; padding: 0 0.6rem; font-size: 0.8em; line-height: 1.3em; }
.realm-hud-cleared { border-radius: 9999px; padding: 0.15rem 0.6rem; background: rgba(74, 222, 128, 0.2); color: #bbf7d0; font-size: 0.85em; }
.realm-hud-notice { margin-top: 0.5rem; border-radius: 0.5rem; padding: 0.4rem 0.75rem; background: rgba(0, 0, 0, 0.45); font-size: 0.9em; }
@media (max-width: 640px) { .realm-spell-name { display: none; } }
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npx vitest run src/components/realm/` then `npm run typecheck` and `npx eslint src/components/realm/ src/app/globals.css`
Expected: pass (the shell passes the three interim `null` props to `RealmHud`; the hook's new option defaults to false).

- [ ] **Step 8: Commit**

```bash
git add src/components/realm/spell-bar.tsx src/components/realm/spell-bar.test.tsx src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/components/realm/use-realm-input.ts src/components/realm/use-realm-input.test.ts src/components/realm/realm-shell.tsx src/app/globals.css
git commit -m "Realm spell bar, mana HUD, and cast input"
```

---

### Task 5: Scene spell layer and shell wiring

**Files:**
- Create: `src/components/realm/use-spell-sim.ts` (scene-side hook; imports three types only), `src/components/realm/spell-layer.tsx` (three.js drawing)
- Modify: `src/components/realm/realm-scene.tsx`, `src/components/realm/realm-shell.tsx`, `src/components/realm/realm-shell.test.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `RealmSceneProps` adds `selectedSpell: SpellDefinition | null`, `castRef: RefObject<CastRequest | null>`, `troubleSkin: TroubleSkin`, `spellsEnabled: boolean` (false for parents), `onSpellEvent: (e: SpellEvent) => void`; `SpellEvent = { kind: "mana"; current: number } | { kind: "cleared"; troubleKind: TroubleKind; count: number } | { kind: "refused" } | { kind: "focusLost" } | { kind: "castState"; casting: boolean }`.

- [ ] **Step 1: Write the failing shell tests**

Append to `src/components/realm/realm-shell.test.tsx` (extend the scene mock to expose `data-spells={String(props.spellsEnabled)}` and keep capturing `sceneProps`; add a fixture `const pages = [{ id: "p0", slot: 0, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }]`):

```tsx
  it("shows the spell bar for a hero, hides it while a panel is open, and never for a parent", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Mana" })).toBeInTheDocument();
    expect(screen.getByText("Cleared: 0")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
    cleanup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-spells", "false");
  });

  it("selects a page, passes the resolved spell to the scene, and reflects scene events in the HUD", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.selectedSpell).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect((sceneProps.selectedSpell as { manaCost: number }).manaCost).toBe(10);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 61 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
    });
    expect(screen.getByRole("progressbar", { name: "Mana" })).toHaveAttribute("aria-valuenow", "61");
    expect(screen.getByText("Cleared: 1")).toBeInTheDocument();
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
  });

  it("uses monsters copy when the kingdom tone is monsters", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, kingdom: { ...bundle.kingdom, tone: "monsters" }, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.troubleSkin).toBe("monsters");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
    });
    expect(screen.getByText("The mist-wisp scatters!")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/realm/realm-shell.test.tsx`
Expected: FAIL.

- [ ] **Step 3: The simulation hook (scene side, no three.js values)**

`src/components/realm/use-spell-sim.ts`:

```ts
"use client";

import { useRef, useState, type RefObject } from "react";
import type { Prop, Vec2, WorldLayout } from "@/lib/realm/layout";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { startMana, stepMana, refund } from "@/lib/realm/spells/mana";
import { beginCast, stepCaster, type CasterState } from "@/lib/realm/spells/caster";
import { releaseEffect, stepEffects, barrierColliders, heroShielded, hasStatus, type SpellEffect } from "@/lib/realm/spells/effects";
import { spawnTroubles, stepTroubles, applyHit, startTally, recordClear, type Trouble, type TroubleKind, type ClearTally } from "@/lib/realm/spells/troubles";
import { startFocus, stepFocus, isDazzled, type FocusState } from "@/lib/realm/spells/focus";
import type { CastRequest } from "./use-realm-input";

export type SpellEvent =
  | { kind: "mana"; current: number }
  | { kind: "cleared"; troubleKind: TroubleKind; count: number }
  | { kind: "refused" }
  | { kind: "focusLost" }
  | { kind: "castState"; casting: boolean };

export type SpellSim = {
  mana: number;
  caster: CasterState;
  effects: SpellEffect[];
  troubles: Trouble[];
  focus: FocusState;
  tally: ClearTally;
  clearedSites: Record<string, number>;
  now: number; // simulation clock, ms, advances only while the world runs
  nextId: number;
  lastManaReported: number;
  lastVanished: Record<string, { x: number; z: number; color: string }>; // effects that ended this frame, for the burst
};

export function startSpellSim(): SpellSim {
  return { mana: startMana(), caster: { selectedSlot: null, casting: null }, effects: [], troubles: [], focus: startFocus(), tally: startTally(), clearedSites: {}, now: 0, nextId: 1, lastManaReported: -1, lastVanished: {} };
}

export type SpellSimInput = {
  layout: WorldLayout;
  hero: Vec2;
  dt: number;
  selectedSpell: SpellDefinition | null;
  selectedSlot: number | null;
  castRequest: CastRequest | null;
  lowStimulus: boolean;
  reducedMotion: boolean;
  seed: number;
};

/** Advances every spell system one frame. Pure apart from the id counter; the caller owns the ref. */
export function stepSpellSim(sim: SpellSim, input: SpellSimInput, emit: (e: SpellEvent) => void): { sim: SpellSim; dazzled: boolean; casting: boolean } {
  const now = sim.now + input.dt * 1000;
  let mana = stepMana(sim.mana, input.dt);
  let caster = sim.caster;
  let effects = sim.effects;
  let nextId = sim.nextId;
  const colliders: Prop[] = input.layout.colliders;
  const troubleColliders = colliders.concat(barrierColliders(effects));

  // Troubles first: spawn, then move.
  let troubles = spawnTroubles({ seed: input.seed, now, layout: input.layout, troubles: sim.troubles, clearedSites: sim.clearedSites, lowStimulus: input.lowStimulus });
  const shielded = heroShielded(effects, now);
  const stepped = stepTroubles(troubles, input.hero, input.dt, troubleColliders, { now, lowStimulus: input.lowStimulus, reducedMotion: input.reducedMotion, shielded, dazzled: isDazzled(sim.focus, now) });
  troubles = stepped.troubles;
  const focus = stepFocus(sim.focus, stepped.focusLost, now);
  if (stepped.focusLost) emit({ kind: "focusLost" });

  // A cast request becomes a wind-up when a page is selected.
  if (input.castRequest && input.selectedSpell && input.selectedSlot !== null) {
    const tap = "target" in input.castRequest ? input.castRequest.target : nearestTroubleOrAhead(troubles, input.hero, input.selectedSpell.range);
    const begun = beginCast(caster, input.selectedSpell, input.selectedSlot, input.hero, tap, mana, now);
    caster = begun.state;
    mana = begun.mana;
    if (begun.refused === "mana") emit({ kind: "refused" });
    if (begun.refused === null) emit({ kind: "castState", casting: true });
  }
  const release = stepCaster(caster, now);
  caster = release.state;
  if (release.released) {
    effects = effects.concat(releaseEffect(release.released.spell, input.hero, release.released.target, now, `e${nextId++}`));
    emit({ kind: "castState", casting: false });
  }

  // Effects fly, hit, and expire. Anything that ended this frame is remembered once for the burst.
  const result = stepEffects(effects, troubles, input.hero, colliders, input.dt, now);
  const lastVanished: SpellSim["lastVanished"] = {};
  for (const e of effects) {
    if ((e.kind === "projectile" || e.kind === "area") && !result.effects.some((s) => s.id === e.id)) {
      lastVanished[e.id] = { x: e.position.x, z: e.position.z, color: e.spell.color };
    }
  }
  effects = result.effects.concat(result.spawned);
  let tally = sim.tally;
  const clearedSites = { ...sim.clearedSites };
  for (const hit of result.hits) {
    const index = troubles.findIndex((t) => t.id === hit.troubleId);
    if (index === -1) continue;
    const applied = applyHit(troubles[index], hit.spell, now);
    if (hasStatus(hit.spell, "mended")) mana = refund(mana, hit.spell);
    if (applied.cleared) {
      tally = recordClear(tally, applied.trouble.kind);
      clearedSites[applied.trouble.siteId] = now;
      troubles = troubles.filter((_, i) => i !== index);
      emit({ kind: "cleared", troubleKind: applied.trouble.kind, count: tally.session });
    } else {
      troubles = troubles.map((t, i) => (i === index ? applied.trouble : t));
    }
  }

  let lastManaReported = sim.lastManaReported;
  if (Math.round(mana) !== lastManaReported) {
    lastManaReported = Math.round(mana);
    emit({ kind: "mana", current: lastManaReported });
  }

  return {
    sim: { mana, caster, effects, troubles, focus, tally, clearedSites, now, nextId, lastManaReported, lastVanished },
    dazzled: isDazzled(focus, now),
    casting: caster.casting !== null,
  };
}

function nearestTroubleOrAhead(troubles: Trouble[], hero: Vec2, range: number): Vec2 {
  let best: Trouble | null = null;
  let bestD = range;
  for (const t of troubles) {
    const d = Math.hypot(t.position.x - hero.x, t.position.z - hero.z);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best ? best.position : { x: hero.x, z: hero.z - Math.max(1, range) };
}

/** Keeps the simulation in a ref for the frame loop; created once, never re-created on re-render. */
export function useSpellSimRef(): RefObject<SpellSim> {
  const [initial] = useState<SpellSim>(startSpellSim);
  return useRef<SpellSim>(initial);
}
```

(`useState` joins the React import.) Create `src/components/realm/use-spell-sim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { startSpellSim, stepSpellSim, type SpellEvent } from "./use-spell-sim";

const layout = buildWorldLayout({ castleType: "keep", buildings: [] });
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!;
const base = { layout, dt: 1 / 60, selectedSpell: bolt, selectedSlot: 0, lowStimulus: false, reducedMotion: false, seed: 1 };

describe("stepSpellSim", () => {
  it("spawns troubles, casts at a tapped one, clears it, and reports mana and the clear", () => {
    const events: SpellEvent[] = [];
    const emit = (e: SpellEvent) => events.push(e);
    let sim = startSpellSim();
    let r = stepSpellSim(sim, { ...base, hero: layout.spawn, castRequest: null }, emit);
    sim = r.sim;
    expect(sim.troubles.length).toBeGreaterThan(0);
    const target = sim.troubles.find((t) => t.kind === "fog")!; // fog clears in one hit
    const hero = { x: target.position.x, z: target.position.z + 3 };
    r = stepSpellSim(sim, { ...base, hero, castRequest: { target: target.position } }, emit);
    sim = r.sim;
    expect(r.casting).toBe(true);
    expect(events.some((e) => e.kind === "castState" && e.casting)).toBe(true);
    for (let i = 0; i < 180 && !events.some((e) => e.kind === "cleared"); i++) {
      r = stepSpellSim(sim, { ...base, hero, castRequest: null }, emit);
      sim = r.sim;
    }
    expect(events.find((e) => e.kind === "cleared")).toMatchObject({ kind: "cleared", troubleKind: "fog", count: 1 });
    expect(sim.tally.session).toBe(1);
    expect(sim.clearedSites[target.siteId]).toBeGreaterThan(0);
    expect(sim.troubles.some((t) => t.id === target.id)).toBe(false);
    expect(events.some((e) => e.kind === "mana" && e.current <= 90)).toBe(true);
  });

  it("refuses a cast when mana is short and reports it", () => {
    const events: SpellEvent[] = [];
    const sim = { ...startSpellSim(), mana: 0 };
    const r = stepSpellSim(sim, { ...base, hero: layout.spawn, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events.some((e) => e.kind === "refused")).toBe(true);
  });

  it("does nothing with a request when no page is selected", () => {
    const events: SpellEvent[] = [];
    const r = stepSpellSim(startSpellSim(), { ...base, selectedSpell: null, selectedSlot: null, hero: layout.spawn, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events.some((e) => e.kind === "refused" || e.kind === "castState")).toBe(false);
  });
});
```

- [ ] **Step 4: The drawing layer**

`src/components/realm/spell-layer.tsx` (three.js allowed here; imported only by `realm-scene.tsx`):

```tsx
"use client";

import "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SpellSim } from "./use-spell-sim";
import type { SpriteTextures } from "./sprite-source";
import { TROUBLE_KINDS } from "./trouble-figures";
import type { TroubleKind } from "@/lib/realm/spells/troubles";

const TROUBLE_POOL = 6;
const EFFECT_POOL = 12;
const BURST_POOL = 4;
const BURST_PARTICLES = 12;
const BURST_MS = 350;
const GRAY = new THREE.Color("#9ca3af");

type Burst = { origin: THREE.Vector3; startedAt: number; color: string };

/** Draws whatever the simulation holds this frame from fixed pools; nothing here allocates per frame. */
export function SpellLayer({ sim, textures, calm, motion }: { sim: RefObject<SpellSim>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const troubleSprites = useRef<(THREE.Sprite | null)[]>([]);
  const effectMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const burstPoints = useRef<(THREE.Points | null)[]>([]);
  const bursts = useRef<(Burst | null)[]>(new Array<Burst | null>(BURST_POOL).fill(null));
  const lastEffectIds = useRef<Set<string>>(new Set());
  // Colours are set in place on the pooled materials; the calm palette pulls them 40 percent toward grey.
  const tint = (material: THREE.MeshStandardMaterial, hex: string) => {
    material.color.set(hex);
    material.emissive.set(hex);
    if (calm) {
      material.color.lerp(GRAY, 0.4);
      material.emissive.lerp(GRAY, 0.4);
    }
  };

  useFrame((state) => {
    const s = sim.current;
    const nowMs = state.clock.elapsedTime * 1000;
    // Troubles: one pooled sprite per live trouble.
    for (let i = 0; i < TROUBLE_POOL; i++) {
      const sprite = troubleSprites.current[i];
      if (!sprite) continue;
      const t = s.troubles[i];
      if (!t) {
        sprite.visible = false;
        continue;
      }
      const tex = textures.troubles[t.kind];
      const mat = sprite.material as THREE.SpriteMaterial;
      if (tex && mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      sprite.visible = !!tex;
      const bob = motion ? Math.sin(state.clock.elapsedTime * 2 + i) * 0.08 : 0;
      sprite.position.set(t.position.x, 0.9 + bob, t.position.z);
    }
    // Effects: one pooled mesh per live effect; bursts on effects that vanished by hitting.
    const liveIds = new Set<string>();
    for (let i = 0; i < EFFECT_POOL; i++) {
      const mesh = effectMeshes.current[i];
      if (!mesh) continue;
      const e = s.effects[i];
      if (!e) {
        mesh.visible = false;
        continue;
      }
      liveIds.add(e.id);
      mesh.visible = true;
      tint(mesh.material as THREE.MeshStandardMaterial, e.spell.color);
      switch (e.kind) {
        case "projectile":
          mesh.position.set(e.position.x, 0.9, e.position.z);
          mesh.scale.set(e.radius, e.radius, e.radius);
          mesh.rotation.set(0, 0, 0);
          break;
        case "area":
          mesh.position.set(e.position.x, 0.1, e.position.z);
          mesh.scale.set(e.radius, 0.1, e.radius);
          break;
        case "beam": {
          const dx = e.to.x - e.from.x;
          const dz = e.to.z - e.from.z;
          const len = Math.hypot(dx, dz);
          mesh.position.set((e.from.x + e.to.x) / 2, 0.9, (e.from.z + e.to.z) / 2);
          mesh.scale.set(len, 0.25, 0.25);
          mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
          break;
        }
        case "barrier": {
          const dx = e.b.x - e.a.x;
          const dz = e.b.z - e.a.z;
          mesh.position.set((e.a.x + e.b.x) / 2, 0.6, (e.a.z + e.b.z) / 2);
          mesh.scale.set(Math.hypot(dx, dz), 1.2, 0.4);
          mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
          break;
        }
        case "self":
          mesh.position.set(e.position.x, 0.15, e.position.z);
          mesh.scale.set(e.spell.range || 1.5, 0.1, e.spell.range || 1.5);
          break;
        case "summon":
          mesh.position.set(e.position.x, 1.2 + (motion ? Math.sin(state.clock.elapsedTime * 4) * 0.1 : 0), e.position.z);
          mesh.scale.set(0.35, 0.35, 0.35);
          break;
      }
    }
    if (motion) {
      for (const id of lastEffectIds.current) {
        if (liveIds.has(id)) continue;
        // An effect that vanished this frame: burst where it was, if it was a projectile that hit something.
        const slot = bursts.current.findIndex((b) => b === null || nowMs - b.startedAt > BURST_MS);
        const prev = s.lastVanished[id];
        if (slot !== -1 && prev) bursts.current[slot] = { origin: new THREE.Vector3(prev.x, 0.9, prev.z), startedAt: nowMs, color: prev.color };
      }
    }
    lastEffectIds.current = liveIds;
    for (let i = 0; i < BURST_POOL; i++) {
      const points = burstPoints.current[i];
      const b = bursts.current[i];
      if (!points) continue;
      if (!b || nowMs - b.startedAt > BURST_MS) {
        points.visible = false;
        continue;
      }
      points.visible = true;
      const k = (nowMs - b.startedAt) / BURST_MS;
      const pos = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let p = 0; p < BURST_PARTICLES; p++) {
        const angle = (p / BURST_PARTICLES) * Math.PI * 2;
        pos.setXYZ(p, b.origin.x + Math.cos(angle) * k * 1.2, b.origin.y + k * 0.8, b.origin.z + Math.sin(angle) * k * 1.2);
      }
      pos.needsUpdate = true;
      (points.material as THREE.PointsMaterial).color.set(b.color);
      (points.material as THREE.PointsMaterial).opacity = 1 - k;
    }
  });

  return (
    <>
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <sprite key={`t${i}`} ref={(el) => { troubleSprites.current[i] = el; }} visible={false} scale={[1.4, 1.8, 1]}>
          <spriteMaterial transparent alphaTest={0.1} />
        </sprite>
      ))}
      {Array.from({ length: EFFECT_POOL }, (_, i) => (
        <mesh key={`e${i}`} ref={(el) => { effectMeshes.current[i] = el; }} visible={false}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial transparent opacity={0.85} emissiveIntensity={0.6} />
        </mesh>
      ))}
      {Array.from({ length: BURST_POOL }, (_, i) => (
        <points key={`b${i}`} ref={(el) => { burstPoints.current[i] = el; }} visible={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(BURST_PARTICLES * 3), 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.18} transparent sizeAttenuation />
        </points>
      ))}
    </>
  );
}
```

Drop the `TROUBLE_KINDS`/`TroubleKind` imports if the file does not use them after this edit. One sphere geometry serves every shape (areas and rings are flattened spheres); this keeps the pool trivial and is acceptable for this slice. A burst uses one `THREE.Vector3` allocation per hit (a few per second), which is fine.

- [ ] **Step 5: Wire the scene**

In `src/components/realm/realm-scene.tsx`:
- Extend `RealmSceneProps` with `selectedSpell: SpellDefinition | null; selectedSlot: number | null; castRef: RefObject<CastRequest | null>; troubleSkin: TroubleSkin; spellsEnabled: boolean; onSpellEvent: (e: SpellEvent) => void; seed: number;` (import the types from `@/lib/utils/spell-catalog`, `./use-realm-input`, `@/lib/realm/spells/troubles`, `./use-spell-sim`).
- In `World`: `const sim = useSpellSimRef(); const dazzledRef = useRef(false); const castingRef = useRef(false);`.
- In `useFrame`, when `interactive`: before `stepHero`, compute `const frozen = dazzledRef.current || castingRef.current;` and pass `{ axis: frozen ? { x: 0, z: 0 } : axisRef.current ?? { x: 0, z: 0 } }`; when frozen also clear `hero.current.target` (`hero.current = { ...hero.current, target: null }` once, guarded by a ref of the previous frozen value). After the companion step, still inside the `interactive` branch (so everything freezes under a panel), step the simulation every frame for heroes and parents alike; parents simply never select a page or request a cast:

```ts
      const request = castRef.current;
      castRef.current = null;
      const stepped = stepSpellSim(
        sim.current,
        { layout, hero: hero.current.position, dt, selectedSpell: spellsEnabled ? selectedSpell : null, selectedSlot: spellsEnabled ? selectedSlot : null, castRequest: spellsEnabled ? request : null, lowStimulus: settings.calmPalette, reducedMotion: !settings.motion, seed },
        (e) => queueMicrotask(() => onSpellEvent(e))
      );
      sim.current = stepped.sim;
      dazzledRef.current = stepped.dazzled;
      castingRef.current = stepped.casting;
```

  The shell ignores every event when `!isChildView`, so a parent's HUD stays as it is.
- Ground `onPointerDown`: when `interactive` and `selectedSpell` is non-null, call `castRef.current = { target: { x: e.point.x, z: e.point.z } }` instead of `setTarget`; otherwise walk as today.
- Render `<SpellLayer sim={sim} textures={textures} calm={settings.calmPalette} motion={settings.motion} />` after the villager sprites (import from `./spell-layer`).
- The reach bubble stays as is.

- [ ] **Step 6: Wire the shell**

In `src/components/realm/realm-shell.tsx` (`RealmOpen`):
- Imports: `resolvePages` from `@/lib/realm/spells/pages`, `TROUBLE_COPY, type TroubleSkin` from `@/lib/realm/spells/troubles`, `MANA_MAX` from `@/lib/realm/spells/mana`, `SpellBar` from `./spell-bar`, `type SpellEvent` from `./use-spell-sim`.
- Constants: `const NOT_ENOUGH_MANA = "Not enough mana yet."; const LOST_FOCUS = "You lost focus for a moment.";`.
- State: `selectedSlot` (`number | null`), `mana` (`MANA_MAX`), `cleared` (`0`), `notice` (`string | null`), plus `const [seed] = useState(() => Date.now() >>> 0);`.
- `const pages = useMemo(() => resolvePages(bundle.spellbook.spells, bundle.spellbook.slots), [bundle.spellbook]);`
- `const selectedSpell = selectedSlot === null ? null : pages.find((p) => p.slot === selectedSlot)?.spell ?? null;`
- `const troubleSkin: TroubleSkin = kingdom.tone === "monsters" ? "monsters" : "gentle";`
- `useRealmInput({ enabled: !panelOpen, castEnabled: isChildView && !panelOpen && selectedSpell !== null })` now also returns `castRef`.
- The Enter/Space talk effect: add `if (e.key === " " && selectedSlot !== null) return;` before the reach check so Space casts when a page is selected.
- `SpriteSource` gets `troubleSkin={troubleSkin}`.
- Notice timer: an effect like the toast's, clearing `notice` after 2000 ms (1500 ms is fine too; use one 2000 ms timer for all notices).
- `onSpellEvent = useCallback((e: SpellEvent) => { if (!isChildView) return; switch (e.kind) { case "mana": setMana(e.current); break; case "cleared": setCleared(e.count); setNotice(TROUBLE_COPY[e.troubleKind][troubleSkin]); break; case "refused": setNotice(NOT_ENOUGH_MANA); break; case "focusLost": setNotice(LOST_FOCUS); break; case "castState": break; } }, [isChildView, troubleSkin]);`
- Scene props: `selectedSpell`, `selectedSlot`, `castRef`, `troubleSkin`, `spellsEnabled={isChildView}`, `onSpellEvent`, `seed`.
- HUD props: `mana={isChildView ? mana : null}`, `cleared={isChildView ? cleared : null}`, `notice`.
- Render `{isChildView && !panelOpen && pages.length > 0 && <SpellBar pages={pages} selectedSlot={selectedSlot} mana={mana} fewerChoices={bundle.profile.fewerChoices} onSelect={setSelectedSlot} />}` after the stick. Move the touch stick's CSS `left` unchanged; the bar is centred so they do not overlap on tablets wider than 600 px; on narrower screens add `.realm-spellbar { bottom: 6.5rem; }` inside the existing `max-width: 640px` media query.

- [ ] **Step 7: Run tests, typecheck, lint, build**

Run: `npx vitest run` then `npm run typecheck`, `npx eslint src/components/realm/ src/lib/realm/spells/ src/app/globals.css`, and `npm run build`.
Expected: all pass; `/realm` builds; `grep -l WebGLRenderer .next/static/chunks/*.js` chunks are still referenced only by the realm react-loadable manifest (spell-layer is imported by the scene only).

- [ ] **Step 8: Commit**

```bash
git add src/components/realm/use-spell-sim.ts src/components/realm/use-spell-sim.test.ts src/components/realm/spell-layer.tsx src/components/realm/realm-scene.tsx src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/app/globals.css
git commit -m "Realm spell layer: troubles, casting, effects, and HUD events"
```

---

### Task 6: Final verification and the browser pass

**Files:** none new in the repo (screenshots land in the scratchpad).

- [ ] **Step 1: Full gate** — `npm run typecheck && npx vitest run`; `npm run lint` shows only the pre-existing error.
- [ ] **Step 2: Bundle isolation** — `npm run build`; every chunk containing `WebGLRenderer` is referenced only from `.next/server/app/(app)/realm/page/react-loadable-manifest.json`.
- [ ] **Step 3: Browser pass** — dev server on 3111 with `DEMO_MODE=true`; bank 10 minutes for `demo-child-1` (temporary `realm_play_ledger` row) and insert one spell row for that child (`spell` table: id `sdd-spell`, child_id `demo-child-1`, slot 0, element `ember`, form `bolt`, modifier null, adjective `Ember`, noun `Bolt`, timestamps now). As `demo_persona=lily`: open `/realm`, confirm the spell bar shows "Ember Bolt", press `1`, confirm the page is selected and the HUD reads "Mana 100"; walk toward the well (hold W for 2 s), wait for a trouble sprite near the well, press Space, and confirm within 3 s that the notice "The fog thins." (or the stone/shadow line) and "Cleared: 1" appear and the mana bar dropped; screenshot. Then set the demo hero's realm settings `tone_mode` to `monsters` (temporary update; note the prior value), reload, clear one trouble, and confirm the monsters copy. As `demo_persona=parent` with `?child=demo-child-1`: no spell bar, no mana bar, troubles visible. Afterwards delete the temporary spell row and ledger row, restore `tone_mode`, and stop the server.
- [ ] **Step 4: Spec walk** — A troubles → Task 1; B mana/caster/effects/focus → Task 2; C data/bar/input/scene/HUD/pause/preview/copy → Tasks 3, 4, 5; D tests → Tasks 1–5. Anything missing is a new task.
- [ ] **Step 5: Hand off** — `superpowers:finishing-a-development-branch` (the branch now carries slices 1–5b).
