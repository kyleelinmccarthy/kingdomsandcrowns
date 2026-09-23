import { describe, expect, it } from "vitest";
import { resolveSpell, type SpellDefinition } from "@/lib/utils/spell-catalog";
import {
  beginCastFx,
  fxAlpha,
  fxPhase,
  fxScale,
  makeFxPool,
  makeFxQueue,
  releaseKindFor,
  releaseSizeFor,
  spawnFx,
  stepFx,
  type FxKind,
  type FxSlot,
} from "./spell-fx";

const spell = (elementId: string, formId: string) =>
  resolveSpell({ elementId, formId, modifierId: null }) as SpellDefinition;

const bolt = spell("ember", "bolt");
const burst = spell("tide", "burst");
const beam = spell("light", "beam");
const wall = spell("stone", "wall");
const shield = spell("frost", "shield");

/** Flat ground at zero, so a test never has to know the island's noise field. */
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const live = (pool: FxSlot[]) => pool.filter((s) => s.live);
const kinds = (pool: FxSlot[]) => live(pool).map((s) => s.kind).sort();

/** Runs the pool forward in sixtieths for `seconds`. */
function run(pool: FxSlot[], seconds: number, groundY: Ground = flat) {
  const q = makeFxQueue(pool.length);
  for (let i = 0; i < Math.round(seconds * 60); i++) stepFx(pool, q, 1 / 60, groundY);
}

describe("every form releases as something", () => {
  it("covers all five shapes the catalog can make", () => {
    expect(releaseKindFor("projectile")).toBe("bolt");
    expect(releaseKindFor("area")).toBe("ring");
    expect(releaseKindFor("beam")).toBe("beam");
    expect(releaseKindFor("barrier")).toBe("slab");
    expect(releaseKindFor("self")).toBe("aura");
    expect(releaseKindFor("summon")).toBe("sprite");
  });

  it("sizes each one in world units, from the spell", () => {
    expect(releaseSizeFor(beam)).toBe(beam.range);
    expect(releaseSizeFor(burst)).toBe(Math.max(3, burst.range));
    expect(releaseSizeFor(wall)).toBe(6.5);
    expect(releaseSizeFor(shield)).toBeGreaterThanOrEqual(2.6);
    // A bolt's size is the ring it LANDS as; the knot itself is always the same.
    expect(releaseSizeFor(bolt)).toBe(3.4);
  });
});

describe("a cast is three events, not one", () => {
  it("starts as a charge at the caster's hands, lasting the spell's own cast time", () => {
    const pool = makeFxPool(8);
    const s = beginCastFx(pool, bolt, { x: 3, y: 1.4, z: -2 }, 0, -1);
    expect(s.kind).toBe("charge");
    expect(s.follow).toBe(true);
    expect(s.life).toBeCloseTo(bolt.castMs / 1000);
    expect(s.color).toBe(bolt.color);
    expect([s.x, s.y, s.z]).toEqual([3, 1.4, -2]);
  });

  it("becomes the spell's shape when the charge is done", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, bolt.castMs / 1000 + 0.02);
    expect(kinds(pool)).toEqual(["bolt"]);
  });

  it("flies the bolt along the heading it was cast on, at the catalog's speed", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, bolt.castMs / 1000 + 0.02);
    const flying = live(pool)[0];
    const startZ = flying.z;
    run(pool, 0.2);
    expect(flying.z).toBeLessThan(startZ);
    expect(startZ - flying.z).toBeCloseTo(bolt.speed * 0.2, 0);
    expect(flying.x).toBeCloseTo(0);
  });

  it("bursts into a ring where it stops, and stops at the spell's range", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, bolt.castMs / 1000 + bolt.range / bolt.speed + 0.05);
    const landed = live(pool);
    expect(landed).toHaveLength(1);
    expect(landed[0].kind).toBe("ring");
    expect(-landed[0].z).toBeGreaterThanOrEqual(bolt.range - 1);
    expect(-landed[0].z).toBeLessThan(bolt.range + 1);
  });

  it("leaves nothing behind when the whole cast has played out", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, 6);
    expect(live(pool)).toHaveLength(0);
  });

  it("chains no further than the landing: a ring does not become another ring", () => {
    const pool = makeFxPool(8);
    spawnFx(pool, { kind: "ring", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1, size: 3 });
    run(pool, 4);
    expect(live(pool)).toHaveLength(0);
  });
});

describe("the other shapes", () => {
  it("blooms an area spell on the ground where it was cast", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, burst, { x: 5, y: 1.4, z: 5 }, 0, -1);
    run(pool, burst.castMs / 1000 + 0.02);
    const ring = live(pool)[0];
    expect(ring.kind).toBe("ring");
    expect(ring.y).toBe(0); // on the ground, not at chest height
    expect(ring.size).toBe(releaseSizeFor(burst));
  });

  it("stands a wall off in front of the caster rather than inside them", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, wall, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, wall.castMs / 1000 + 0.02);
    const slab = live(pool)[0];
    expect(slab.kind).toBe("slab");
    expect(slab.z).toBeLessThan(-1);
    expect(slab.y).toBe(0);
  });

  it("wraps a self spell round the caster, on the ground", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, shield, { x: 7, y: 1.4, z: -3 }, 1, 0);
    run(pool, shield.castMs / 1000 + 0.02);
    const aura = live(pool)[0];
    expect(aura.kind).toBe("aura");
    expect(aura.x).toBeCloseTo(7);
    expect(aura.z).toBeCloseTo(-3);
  });

  it("snaps a beam out to the form's reach", () => {
    const pool = makeFxPool(8);
    beginCastFx(pool, beam, { x: 0, y: 1.4, z: 0 }, 0, -1);
    run(pool, beam.castMs / 1000 + 0.02);
    const shaft = live(pool)[0];
    expect(shaft.kind).toBe("beam");
    expect(shaft.size).toBe(beam.range);
  });

  it("lays a ring on the hill it lands on, not at sea level", () => {
    const pool = makeFxPool(8);
    const hill: Ground = (_x, z) => -z * 0.25;
    beginCastFx(pool, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
    // Charge (300ms) plus flight (12 / 14 s) is 1.16s, and a ring lives 0.55s after that.
    run(pool, 1.3, hill);
    const ring = live(pool)[0];
    expect(ring.kind).toBe("ring");
    expect(ring.y).toBeCloseTo(hill(ring.x, ring.z));
    expect(ring.y).toBeGreaterThan(1); // the hill really is above sea level out there
  });
});

describe("the pool never grows", () => {
  it("reuses a dead slot", () => {
    const pool = makeFxPool(2);
    const a = spawnFx(pool, { kind: "ring", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1 });
    run(pool, 3);
    const b = spawnFx(pool, { kind: "ring", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1 });
    expect(b).toBe(a);
    expect(b.seq).toBeGreaterThan(1);
  });

  it("steals the most nearly finished effect when everything is busy", () => {
    const pool = makeFxPool(2);
    const old = spawnFx(pool, { kind: "slab", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1 });
    run(pool, 1);
    // Born a second later, so it has a second more life left than `old` has.
    const young = spawnFx(pool, { kind: "slab", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1 });
    expect(young).not.toBe(old);
    expect(old.life - old.t).toBeLessThan(young.life - young.t);
    const fresh = spawnFx(pool, { kind: "ring", color: "#f00", x: 9, y: 0, z: 9, dx: 0, dz: -1 });
    expect(fresh).toBe(old);
    expect(fresh.color).toBe("#f00");
    expect(pool).toHaveLength(2);
  });

  it("gives every cast the same flight whatever slot it lands in", () => {
    // The two-phase step exists for exactly this: spawn during the pass and a slot born into
    // a dead index further up the array gets stepped by the frame that created it.
    const measure = (fill: number) => {
      const pool = makeFxPool(6);
      for (let i = 0; i < fill; i++) {
        const s = spawnFx(pool, { kind: "ring", color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1 });
        s.t = 0.9; // about to die, so the next spawn lands after it in the array
      }
      const pool2 = makeFxPool(6);
      beginCastFx(pool2, bolt, { x: 0, y: 1.4, z: 0 }, 0, -1);
      run(pool2, bolt.castMs / 1000 + 0.1);
      return live(pool2)[0].travelled;
    };
    expect(measure(0)).toBeCloseTo(measure(3), 6);
  });
});

describe("what the renderer is told to draw", () => {
  const one = (kind: FxKind) => {
    const pool = makeFxPool(1);
    return spawnFx(pool, { kind, color: "#fff", x: 0, y: 0, z: 0, dx: 0, dz: -1, size: 4 });
  };

  it("runs phase from 0 to 1 and clamps both ends", () => {
    const s = one("ring");
    expect(fxPhase(s)).toBe(0);
    s.t = s.life * 2;
    expect(fxPhase(s)).toBe(1);
    s.t = -1;
    expect(fxPhase(s)).toBe(0);
  });

  it("swells a charge and thins a ring", () => {
    const charge = one("charge");
    const ring = one("ring");
    expect(fxAlpha(charge)).toBeLessThan(1);
    charge.t = charge.life;
    expect(fxAlpha(charge)).toBeCloseTo(1);
    expect(fxAlpha(ring)).toBeCloseTo(1);
    ring.t = ring.life;
    expect(fxAlpha(ring)).toBeCloseTo(0);
  });

  it("opens a landing ring outward from nothing", () => {
    const ring = one("ring");
    const first = fxScale(ring);
    ring.t = ring.life * 0.5;
    const mid = fxScale(ring);
    ring.t = ring.life;
    expect(first).toBeLessThan(mid);
    expect(mid).toBeLessThan(fxScale(ring));
  });

  it("raises a wall out of the ground and then holds it", () => {
    const slab = one("slab");
    expect(fxScale(slab)).toBe(0);
    slab.t = slab.life * 0.2;
    expect(fxScale(slab)).toBeCloseTo(1);
    slab.t = slab.life * 0.9;
    expect(fxScale(slab)).toBe(1);
  });

  it("gives every kind a finite alpha and scale, at both ends of its life", () => {
    for (const kind of ["charge", "bolt", "ring", "beam", "slab", "aura", "sprite"] as FxKind[]) {
      for (const at of [0, 0.5, 1]) {
        const s = one(kind);
        s.t = s.life * at;
        expect(Number.isFinite(fxAlpha(s))).toBe(true);
        expect(fxAlpha(s)).toBeGreaterThanOrEqual(-0.001);
        expect(Number.isFinite(fxScale(s))).toBe(true);
        expect(fxScale(s)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
