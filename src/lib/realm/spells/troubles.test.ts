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
