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
  return { id, kind: "fog", siteId: "s", position: { x, z }, origin: { x, z }, drift: { x: 1, z: 0 }, hitsLeft: 1, statuses: [], spawnedAt: 0, retreatUntil: 0 };
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
    const troubles = [trouble("near", 4, 0.5), trouble("far", 9, 0)];
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
