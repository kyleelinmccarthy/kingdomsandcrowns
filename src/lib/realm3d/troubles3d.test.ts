import { describe, expect, it } from "vitest";
import { LOW_STIMULUS_MAX, MAX_TROUBLES, RESPAWN_MS, RETREAT_MS, TROUBLE_COPY, TROUBLE_HITS } from "@/lib/realm/spells/troubles";
import { resolveSpell, type SpellDefinition } from "@/lib/utils/spell-catalog";
import { MANA_PER_CLEAR } from "@/lib/realm/spells/mana";
import type { Collider } from "./collision";
import { beginCastFx, followCastFx, makeFxPool, makeFxQueue, spawnFx, stepFx, type FxSlot } from "./spell-fx";
import {
  AIM_CLOSE,
  ALREADY_COPY,
  CAPPED_COPY,
  REWARD_COPY,
  BODY_RADIUS,
  DYING_MS,
  KNOCK_MS,
  NO_POP_R,
  SLEEP_R,
  SPAWN_CLEAR,
  TROUBLE_POOL,
  VILLAGE_KEEP,
  WANDER_3D,
  awakeCount,
  kindForPlace,
  makeField,
  miniBolt,
  pickAim,
  planHomes,
  rehomeField,
  stepField,
  trackAim,
  troubleName,
  troubleNotice,
  type FieldInput,
  type HomeLandmark,
  type Mover,
  type TroubleField,
  type TroubleHome,
} from "./troubles3d";

const spell = (elementId: string, formId: string, modifierId: string | null = null) =>
  resolveSpell({ elementId, formId, modifierId }) as SpellDefinition;
const bolt = spell("ember", "bolt");
const frostBolt = spell("frost", "bolt");
const mendBolt = spell("ember", "bolt", "mend");
const burst = spell("tide", "burst");
const beam = spell("light", "beam");
const wall = spell("stone", "wall");
const shield = spell("frost", "shield");
const aura = spell("ember", "aura");
const sprite = spell("bloom", "sprite");

/** Open ground: every step is allowed. */
const open: Mover = (out, _fx, _fz, tx, tz) => {
  out.x = tx;
  out.z = tz;
};

const landmarks: HomeLandmark[] = [
  { id: "ringstones", name: "the Ringstones", kind: "place", position: { x: -53, z: 0 }, radius: 10 },
  { id: "summit-6", name: "Cloudfoot", kind: "summit", position: { x: -184, z: -96 }, radius: 15 },
  { id: "deepwood-9", name: "Oldwood", kind: "deepwood", position: { x: 8, z: 192 }, radius: 12 },
  { id: "outcrop-17", name: "Broken Tooth", kind: "outcrop", position: { x: 136, z: -104 }, radius: 11 },
  { id: "cove-12", name: "Gullbay", kind: "cove", position: { x: 24, z: -120 }, radius: 12 },
];
const spawn = { x: 0, z: 15 };

/** A field with homes placed wherever the test says, by hand. */
function fieldOf(homes: Partial<TroubleHome>[]): TroubleField {
  return makeField(homes.map((h, i) => ({ id: `h${i}`, kind: "fog", x: 0, z: 0, place: null, placeName: null, ...h })));
}

function input(over: Partial<FieldInput> = {}): FieldInput {
  return { dt: 1 / 60, heroX: 0, heroZ: 0, calm: false, move: open, ...over };
}

function run(f: TroubleField, pool: FxSlot[], seconds: number, over: Partial<FieldInput> = {}) {
  const q = makeFxQueue(pool.length);
  const inp = input(over);
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    trackAim(f, pool);
    followCastFx(pool, inp.heroX, 1.35, inp.heroZ, 0, -1);
    stepField(f, pool, inp);
    for (let e = 0; e < f.nEvents; e++) events.push(f.events[e].kind);
    stepFx(pool, q, 1 / 60, () => 0);
  }
  return events;
}

const liveTroubles = (f: TroubleField) => f.troubles.filter((t) => t.live && !t.dying);

describe("where troubles live", () => {
  const free = () => true;

  it("is the same every time for the same seed", () => {
    const a = planHomes({ seed: 9, landmarks, unfinished: 8, spawn, free });
    const b = planHomes({ seed: 9, landmarks, unfinished: 8, spawn, free });
    expect(a).toEqual(b);
    expect(planHomes({ seed: 10, landmarks, unfinished: 8, spawn, free })).not.toEqual(a);
  });

  it("puts up to three on the outskirts — one per unfinished site, one of each kind — and none once the village stands", () => {
    const rim = (n: number) => planHomes({ seed: 1, landmarks, unfinished: n, spawn, free }).filter((h) => h.place === null);
    expect(rim(8).map((h) => h.kind)).toEqual(["fog", "cursed-stone", "shadow-blob"]);
    expect(rim(2)).toHaveLength(2);
    expect(rim(0)).toHaveLength(0);
  });

  it("keeps every home out of the village, off the spawn point, and where the world says it may stand", () => {
    const refused = (x: number, z: number) => x > 0 && z > 0; // a whole quadrant is "road"
    const homes = planHomes({ seed: 4, landmarks, unfinished: 8, spawn, free: (x, z) => !refused(x, z) });
    expect(homes.length).toBeGreaterThan(3);
    for (const h of homes) {
      expect(Math.hypot(h.x, h.z)).toBeGreaterThanOrEqual(VILLAGE_KEEP);
      expect(Math.hypot(h.x - spawn.x, h.z - spawn.z)).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      expect(refused(h.x, h.z)).toBe(false);
    }
  });

  it("haunts every named place, inside the ring its name covers, with the kind that suits it", () => {
    const homes = planHomes({ seed: 2, landmarks, unfinished: 0, spawn, free });
    expect(homes.map((h) => h.place)).toEqual(landmarks.map((l) => l.id));
    for (const h of homes) {
      const l = landmarks.find((m) => m.id === h.place)!;
      expect(Math.hypot(h.x - l.position.x, h.z - l.position.z)).toBeLessThanOrEqual(l.radius);
      expect(h.placeName).toBe(l.name);
    }
    expect(kindForPlace({ id: "summit-6", kind: "summit" })).toBe("fog");
    expect(kindForPlace({ id: "outcrop-17", kind: "outcrop" })).toBe("cursed-stone");
    expect(kindForPlace({ id: "deepwood-9", kind: "deepwood" })).toBe("shadow-blob");
    expect(kindForPlace({ id: "ringstones", kind: "place" })).toBe("cursed-stone");
  });

  it("drops a place it can find no free ground at rather than putting a trouble somewhere forbidden", () => {
    const homes = planHomes({ seed: 2, landmarks, unfinished: 0, spawn, free: (x) => x < 100 });
    expect(homes.some((h) => h.place === "outcrop-17")).toBe(false);
  });
});

describe("waking and sleeping", () => {
  const ring = Array.from({ length: 10 }, (_, i) => ({ x: Math.sin(i) * (40 + i * 5), z: Math.cos(i) * (40 + i * 5) }));

  it("wakes the nearest homes up to the flat Realm's cap, and three for a calm child", () => {
    const f = fieldOf(ring);
    stepField(f, makeFxPool(4), input());
    expect(awakeCount(f)).toBe(MAX_TROUBLES);
    const nearest = ring.map((h, i) => [Math.hypot(h.x, h.z), i]).sort((a, b) => a[0] - b[0]).slice(0, MAX_TROUBLES).map((p) => p[1]).sort();
    expect(liveTroubles(f).map((t) => t.home).sort()).toEqual(nearest);
    const calm = fieldOf(ring);
    stepField(calm, makeFxPool(4), input({ calm: true }));
    expect(awakeCount(calm)).toBe(LOW_STIMULUS_MAX);
  });

  it("puts a trouble far behind the child back to sleep, uncleared, and wakes it again on return", () => {
    const f = fieldOf([{ x: 50, z: 0 }]);
    stepField(f, makeFxPool(4), input());
    expect(awakeCount(f)).toBe(1);
    stepField(f, makeFxPool(4), input({ heroX: 50 - SLEEP_R - 5 }));
    expect(awakeCount(f)).toBe(0);
    expect(f.clearedAt[0]).toBe(Number.NEGATIVE_INFINITY);
    stepField(f, makeFxPool(4), input());
    expect(awakeCount(f)).toBe(1);
  });

  it("brings a cleared one back only after RESPAWN_MS, and only once the child has walked away", () => {
    const f = fieldOf([{ kind: "fog", x: 40, z: 0 }]);
    const pool = makeFxPool(4);
    stepField(f, pool, input());
    const t = liveTroubles(f)[0];
    spawnFx(pool, { kind: "ring", color: "#fff", x: t.x, y: 0, z: t.z, dx: 0, dz: -1, size: 4, spell: burst, armed: true });
    const events = run(f, pool, 1, { heroX: 30 });
    expect(events).toContain("cleared");
    run(f, pool, (DYING_MS + 200) / 1000, { heroX: 30 });
    expect(f.troubles.every((x) => !x.live)).toBe(true);
    run(f, pool, RESPAWN_MS / 1000, { heroX: 30 }); // standing right beside it: no pop-in
    expect(awakeCount(f)).toBe(0);
    stepField(f, pool, input({ heroX: 40 - NO_POP_R - 10 }));
    expect(awakeCount(f)).toBe(1);
  });

  it("stands still in time while the caller does not step it (the paused game)", () => {
    const f = fieldOf([{ kind: "shadow-blob", x: 40, z: 0 }]);
    stepField(f, makeFxPool(4), input());
    const t = liveTroubles(f)[0];
    const at = [t.x, t.z, f.now];
    // Nothing: the scene skips stepField while bus.paused. The field has no clock of its own.
    expect([t.x, t.z, f.now]).toEqual(at);
  });
});

describe("how they move", () => {
  it("lets fog drift but never far from home", () => {
    const f = fieldOf([{ kind: "fog", x: 60, z: 0 }]);
    let furthest = 0;
    let moved = false;
    for (let i = 0; i < 60 * 30; i++) {
      stepField(f, makeFxPool(1), input());
      const t = f.troubles[0];
      furthest = Math.max(furthest, Math.hypot(t.x - 60, t.z));
      if (Math.hypot(t.x - 60, t.z) > 0.5) moved = true;
    }
    expect(moved).toBe(true);
    expect(furthest).toBeLessThanOrEqual(WANDER_3D + 0.2);
  });

  it("holds fog still and never lets a blob chase, for a calm child", () => {
    const f = fieldOf([{ kind: "fog", x: 60, z: 0 }, { kind: "shadow-blob", x: 45, z: 0 }]);
    const pool = makeFxPool(1);
    for (let i = 0; i < 120; i++) stepField(f, pool, input({ calm: true, heroX: 36 }));
    const [fog, blob] = [f.troubles[f.slotOf[0]], f.troubles[f.slotOf[1]]];
    expect([fog.x, fog.z]).toEqual([60, 0]);
    // A calm blob wanders; it does not come at the child.
    expect(Math.hypot(blob.x - 36, blob.z)).toBeGreaterThan(9 - 0.5 * 2);
  });

  it("never moves a cursed stone", () => {
    const f = fieldOf([{ kind: "cursed-stone", x: 60, z: 0 }]);
    for (let i = 0; i < 300; i++) stepField(f, makeFxPool(1), input({ heroX: 55 }));
    expect([f.troubles[0].x, f.troubles[0].z]).toEqual([60, 0]);
  });

  it("sends a blob at a child it can sense, and gives up once the child is far from its home", () => {
    const f = fieldOf([{ kind: "shadow-blob", x: 60, z: 0 }]);
    stepField(f, makeFxPool(1), input({ heroX: 50 }));
    const t = f.troubles[0];
    const before = Math.hypot(t.x - 50, t.z);
    for (let i = 0; i < 30; i++) stepField(f, makeFxPool(1), input({ heroX: 50 }));
    expect(Math.hypot(t.x - 50, t.z)).toBeLessThan(before - 1);
  });

  it("never walks into the village, even chasing", () => {
    const f = fieldOf([{ kind: "shadow-blob", x: VILLAGE_KEEP + 3, z: 0 }]);
    for (let i = 0; i < 600; i++) stepField(f, makeFxPool(1), input({ heroX: 18, heroZ: 0 }));
    const t = f.troubles[0];
    expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(VILLAGE_KEEP - 0.01);
  });

  it("is deterministic: the same frames give the same positions", () => {
    const go = () => {
      const f = fieldOf([{ kind: "fog", x: 60, z: 0 }, { kind: "shadow-blob", x: 45, z: 10 }]);
      for (let i = 0; i < 400; i++) stepField(f, makeFxPool(1), input({ heroX: 40, heroZ: 4 }));
      return f.troubles.map((t) => [t.x, t.z]);
    };
    expect(go()).toEqual(go());
  });
});

describe("a blob bumps the child back and never harms them", () => {
  function bump(over: Partial<FieldInput> = {}, before?: (f: TroubleField) => void) {
    const f = fieldOf([{ kind: "shadow-blob", x: 40, z: 0 }]);
    before?.(f);
    const events = [] as string[];
    for (let i = 0; i < 60 * 3; i++) {
      stepField(f, makeFxPool(1), input({ heroX: 38, ...over }));
      for (let e = 0; e < f.nEvents; e++) events.push(f.events[e].kind);
    }
    return { f, events };
  }

  it("pushes the child away from itself, then bounces back and retreats", () => {
    const { f, events } = bump();
    expect(events.filter((e) => e === "bounced")).toHaveLength(1);
    expect(f.knock.dx).toBeLessThan(0); // the child is at -x of the blob, and goes further -x
    const t = f.troubles[0];
    expect(t.retreatUntil).toBeGreaterThan(f.now - RETREAT_MS - 1000);
    expect(Math.hypot(t.x - 38, t.z)).toBeGreaterThan(BODY_RADIUS["shadow-blob"] + 1);
    expect(KNOCK_MS).toBeLessThan(1000);
  });

  it("does not push a shielded child — the shield holds", () => {
    const { f, events } = bump({}, (field) => {
      field.shieldUntil = 1e9;
    });
    expect(events).toContain("shielded");
    expect(events).not.toContain("bounced");
    expect(f.knock.until).toBe(0);
  });
});

describe("every spell shape can hit", () => {
  /** One trouble of `kind` at (0, -z), awake, with the child at the origin. */
  function target(kind: TroubleHome["kind"], z = -8, x = 0) {
    const f = fieldOf([{ kind, x: x + 40, z }]);
    // Home far enough out to be allowed; then stand the trouble where the test wants it.
    stepField(f, makeFxPool(1), input());
    const t = f.troubles[0];
    t.x = t.ox = x;
    t.z = t.oz = z;
    return f;
  }
  const cast = (pool: FxSlot[], s: SpellDefinition) => beginCastFx(pool, s, { x: 0, y: 1.35, z: 0 }, 0, -1);

  it("a bolt flies to its target, stops ON it, and lands as a ring that hits nothing more", () => {
    const f = target("cursed-stone");
    const pool = makeFxPool(16);
    cast(pool, bolt);
    const events = run(f, pool, 1.5);
    expect(events.filter((e) => e === "hit")).toHaveLength(1);
    expect(f.troubles[0].hitsLeft).toBe(TROUBLE_HITS["cursed-stone"] - 1);
    // The landing ring stood where the stone is.
  });

  it("a stone takes two bolts; the second clears it", () => {
    const f = target("cursed-stone");
    const pool = makeFxPool(16);
    cast(pool, bolt);
    run(f, pool, 1.2);
    cast(pool, bolt);
    const events = run(f, pool, 1.2);
    expect(events).toContain("cleared");
    expect(f.tally.session).toBe(1);
    expect(f.tally.byKind["cursed-stone"]).toBe(1);
  });

  it("a bolt is forgiving: it turns onto a trouble the child was not quite facing", () => {
    const f = target("fog", -9, 5);
    const pool = makeFxPool(16);
    cast(pool, bolt);
    expect(run(f, pool, 1.5)).toContain("cleared");
  });

  it("a burst's ring hits every trouble inside it, each once", () => {
    const f = fieldOf([{ kind: "cursed-stone", x: 40, z: 0 }, { kind: "cursed-stone", x: 41, z: 0 }]);
    stepField(f, makeFxPool(1), input());
    f.troubles[0].x = 2;
    f.troubles[0].z = 0;
    f.troubles[1].x = -2;
    f.troubles[1].z = 1;
    const pool = makeFxPool(16);
    cast(pool, burst);
    const events = run(f, pool, 1.5);
    expect(events.filter((e) => e === "hit")).toHaveLength(2);
    expect(f.troubles.slice(0, 2).map((t) => t.hitsLeft)).toEqual([1, 1]);
  });

  it("a beam hits the nearest trouble on its line, on each of its ticks", () => {
    const f = fieldOf([{ kind: "cursed-stone", x: 40, z: 0 }, { kind: "cursed-stone", x: 41, z: 0 }]);
    stepField(f, makeFxPool(1), input());
    f.troubles[0].x = 0;
    f.troubles[0].z = -6;
    f.troubles[1].x = 0.4;
    f.troubles[1].z = -11;
    const pool = makeFxPool(16);
    cast(pool, beam);
    const events = run(f, pool, 1.5);
    expect(events).toContain("cleared");
    // Two ticks cleared the near stone, which stood in the way; the third reached the far one.
    expect(f.troubles[1].hitsLeft).toBe(1);
  });

  it("a wall comes down on a trouble, hits it once, shoves it to the far side, and then blocks it", () => {
    const f = target("shadow-blob", -4);
    f.troubles[0].hitsLeft = 5; // keep it alive to watch the wall hold it
    const pool = makeFxPool(16);
    cast(pool, wall);
    const events = run(f, pool, 1.2, { calm: false, heroX: 0, heroZ: 0 });
    expect(events.filter((e) => e === "hit")).toHaveLength(1);
    const slab = pool.find((s) => s.live && s.kind === "slab")!;
    const across = (f.troubles[0].x - slab.x) * slab.dx + (f.troubles[0].z - slab.z) * slab.dz;
    expect(across).toBeGreaterThan(0); // on the far side from the child
  });

  it("an aura burns everything close every half second", () => {
    const f = target("cursed-stone", -2);
    const pool = makeFxPool(16);
    cast(pool, aura);
    expect(run(f, pool, 2.5)).toContain("cleared");
  });

  it("a Sprite is the flat Realm's follower: it rides the child's shoulder and throws mini-bolts at what is near", () => {
    const f = target("cursed-stone", -7);
    const pool = makeFxPool(16);
    cast(pool, sprite);
    run(f, pool, 1.0);
    const follower = pool.find((s) => s.live && s.kind === "sprite")!;
    expect(follower).toBeDefined();
    // Near the child, over their shoulder — not out on the ground like an aura.
    expect(Math.hypot(follower.x, follower.z)).toBeLessThan(2.5);
    expect(follower.y).toBeGreaterThan(1.35);
    const events = run(f, pool, 4);
    // A stone takes two: two mini-bolts, from the follower, cleared it.
    expect(events.filter((e) => e === "hit")).toHaveLength(1);
    expect(events).toContain("cleared");
    const mini = miniBolt(sprite);
    expect(mini.statuses).toEqual([]);
    expect(miniBolt(sprite)).toBe(mini); // made once, not per shot
  });

  it("a Sprite follows the child as they walk, and throws nothing while nothing is in reach", () => {
    const f = target("fog", -60);
    const pool = makeFxPool(16);
    cast(pool, sprite);
    run(f, pool, 0.6);
    const before = pool.filter((s) => s.live).length;
    run(f, pool, 3, { heroX: 20, heroZ: 0 });
    const follower = pool.find((s) => s.live && s.kind === "sprite")!;
    expect(Math.hypot(follower.x - 20, follower.z)).toBeLessThan(2.5);
    expect(pool.filter((s) => s.live && s.kind === "bolt")).toHaveLength(0);
    expect(before).toBe(1);
  });

  it("a Sprite leaves after the flat Realm's eight seconds", () => {
    const f = target("fog", -60);
    const pool = makeFxPool(16);
    cast(pool, sprite);
    run(f, pool, 9.5);
    expect(pool.some((s) => s.live && s.kind === "sprite")).toBe(false);
  });

  it("a bounce bolt that hits a trouble bounces on to the next one in reach", () => {
    const f = fieldOf([{ kind: "fog", x: 40, z: 0 }, { kind: "fog", x: 41, z: 0 }]);
    stepField(f, makeFxPool(1), input());
    [f.troubles[0].x, f.troubles[0].z] = [0, -7];
    [f.troubles[0].ox, f.troubles[0].oz] = [0, -7];
    [f.troubles[1].x, f.troubles[1].z] = [6, -10];
    [f.troubles[1].ox, f.troubles[1].oz] = [6, -10];
    const pool = makeFxPool(16);
    cast(pool, spell("ember", "bolt", "bounce"));
    const events = run(f, pool, 2.5, { calm: true });
    expect(events.filter((e) => e === "cleared")).toHaveLength(2);
    // A plain bolt stops at the first.
    const g = fieldOf([{ kind: "fog", x: 40, z: 0 }, { kind: "fog", x: 41, z: 0 }]);
    stepField(g, makeFxPool(1), input());
    [g.troubles[0].x, g.troubles[0].z, g.troubles[0].ox, g.troubles[0].oz] = [0, -7, 0, -7];
    [g.troubles[1].x, g.troubles[1].z, g.troubles[1].ox, g.troubles[1].oz] = [6, -10, 6, -10];
    const pool2 = makeFxPool(16);
    cast(pool2, bolt);
    expect(run(g, pool2, 2.5, { calm: true }).filter((e) => e === "cleared")).toHaveLength(1);
  });

  it("a bounce bolt comes off a wall once, the way it came, instead of passing through", () => {
    const f = target("fog", -200);
    const wallAhead: Collider = { x: 0, z: -5, hw: 3, hd: 0.5, round: false, base: -1, top: 6 };
    const pool = makeFxPool(16);
    cast(pool, spell("ember", "bolt", "bounce"));
    run(f, pool, 0.8, { solids: [wallAhead] });
    const b = pool.find((s) => s.live && s.kind === "bolt")!;
    expect(b.dz).toBeGreaterThan(0); // turned round
    expect(b.z).toBeGreaterThan(-5);
    // A plain bolt goes straight through, as before.
    const pool2 = makeFxPool(16);
    cast(pool2, bolt);
    run(target("fog", -200), pool2, 0.8, { solids: [wallAhead] });
    expect(pool2.find((s) => s.live && s.kind === "bolt")!.z).toBeLessThan(-5);
  });

  it("clearing a trouble hands back one Ember Bolt's worth of mana", () => {
    const f = target("fog");
    const pool = makeFxPool(16);
    cast(pool, bolt);
    const q = makeFxQueue(pool.length);
    let refunded = 0;
    for (let i = 0; i < 90; i++) {
      trackAim(f, pool);
      followCastFx(pool, 0, 1.35, 0, 0, -1);
      stepField(f, pool, input());
      refunded += f.refund;
      stepFx(pool, q, 1 / 60, () => 0);
    }
    expect(refunded).toBe(MANA_PER_CLEAR);
    expect(MANA_PER_CLEAR).toBe(bolt.manaCost);
  });

  it("a shield pulses once as it goes up, and keeps the blobs off after", () => {
    const f = target("cursed-stone", -2);
    const pool = makeFxPool(16);
    cast(pool, shield);
    const events = run(f, pool, 2);
    expect(events.filter((e) => e === "hit")).toHaveLength(1);
    expect(f.shieldUntil).toBeGreaterThan(f.now);
  });

  it("leaves the spell's statuses behind, the flat Realm's way: frost chills", () => {
    const f = target("cursed-stone");
    const pool = makeFxPool(16);
    cast(pool, frostBolt);
    run(f, pool, 1.2);
    expect(f.troubles[0].statuses.some((s) => s.kind === "chilled" && s.until > f.now - 1000)).toBe(true);
  });

  it("hands a mended spell's mana back to the caller", () => {
    const f = target("cursed-stone");
    const pool = makeFxPool(16);
    cast(pool, mendBolt);
    const q = makeFxQueue(pool.length);
    let refunded = 0;
    for (let i = 0; i < 90; i++) {
      trackAim(f, pool);
      followCastFx(pool, 0, 1.35, 0, 0, -1);
      stepField(f, pool, input());
      refunded += f.refund;
      stepFx(pool, q, 1 / 60, () => 0);
    }
    expect(refunded).toBe(mendBolt.manaCost);
  });
});

describe("aiming for an eight-year-old", () => {
  function three() {
    const f = fieldOf([{ x: 40, z: 0 }, { x: 41, z: 0 }, { x: 42, z: 0 }]);
    stepField(f, makeFxPool(1), input());
    return f;
  }

  it("picks what is ahead over what is nearer but off to the side, and ignores what is behind", () => {
    const f = three();
    const [a, b, c] = f.troubles;
    [a.x, a.z] = [0, -12]; // dead ahead, far
    [b.x, b.z] = [11, -3]; // nearer, way off to the side
    [c.x, c.z] = [0, 14]; // behind
    expect(pickAim(f, 0, 0, 0, -1, 16)).toBe(0);
    [a.x, a.z] = [0, -30]; // out of reach now
    expect(pickAim(f, 0, 0, 0, -1, 16)).toBe(-1);
  });

  it("takes something right beside the child whichever way it is", () => {
    const f = three();
    f.troubles[0].x = 0;
    f.troubles[0].z = AIM_CLOSE - 1; // behind, but close
    f.troubles[1].x = f.troubles[2].x = 100;
    expect(pickAim(f, 0, 0, 0, -1, 16)).toBe(0);
  });

  it("locks a new charge onto its target, turns the child to face it, and lets go when the target is cleared", () => {
    const f = three();
    f.troubles[0].x = 6;
    f.troubles[0].z = -6;
    f.troubles[1].x = f.troubles[2].x = 200;
    const pool = makeFxPool(16);
    const charge = beginCastFx(pool, bolt, { x: 0, y: 1.35, z: 0 }, 0, -1);
    const face = trackAim(f, pool);
    expect(face).toBeCloseTo(Math.atan2(6, -6));
    expect(charge.target).toBe(0);
    followCastFx(pool, 0, 1.35, 0, 0, -1);
    expect(charge.dx).toBeCloseTo(Math.SQRT1_2);
    f.troubles[0].dying = true;
    trackAim(f, pool);
    expect(charge.target).toBe(-1);
  });
});

describe("the words", () => {
  it("names a trouble in the grown-up's chosen tone", () => {
    expect(troubleName("shadow-blob", "gentle")).toBe("Shadow");
    expect(troubleName("shadow-blob", "monsters")).toBe("Blob");
    expect(troubleName("fog", "monsters")).toBe("Mist-wisp");
  });

  it("says the flat Realm's line when one is cleared, and where", () => {
    expect(troubleNotice({ kind: "cleared", trouble: "fog", count: 3 }, "gentle", "the Ringstones", 1)).toEqual({
      title: TROUBLE_COPY.fog.gentle,
      line: "the Ringstones is clear. 3 cleared today.",
    });
    expect(troubleNotice({ kind: "cleared", trouble: "shadow-blob", count: 1 }, "monsters", null, 1)?.title).toBe("The blob bounces off!");
  });

  it("never says anything frightening about a bump, in either tone", () => {
    for (const skin of ["gentle", "monsters"] as const) {
      const n = troubleNotice({ kind: "bounced", trouble: "shadow-blob", count: 0 }, skin, null, 1)!;
      expect(`${n.title} ${n.line}`).not.toMatch(/hurt|damage|attack|die|dead|kill|pain/i);
    }
  });

  it("tells the child which key casts the first time a trouble is near", () => {
    expect(troubleNotice({ kind: "sighted", trouble: "fog", count: 0 }, "gentle", null, 1)?.line).toBe("Press 1 to cast at it.");
    expect(troubleNotice({ kind: "sighted", trouble: "fog", count: 0 }, "gentle", null, null)?.line).toBe("Earn a spell to clear it.");
  });
});

describe("the words, when clearing pays", () => {
  const e = { kind: "cleared" as const, trouble: "fog" as const, count: 1 };

  it("says +1 minute on a clear that paid, with the day's tally rather than the visit's", () => {
    const n = troubleNotice(e, "gentle", "Cloudfoot", 1, { paid: true, capped: false, already: false, clearsToday: 7 })!;
    expect(n.reward).toBe(REWARD_COPY);
    expect(n.line).toBe("Cloudfoot is clear. 7 cleared today.");
  });

  it("says so, kindly, when the day's minutes are all had, and when a home already paid", () => {
    expect(troubleNotice(e, "gentle", null, 1, { paid: false, capped: true, already: false, clearsToday: 9 })!.line).toBe(`The fields are clear. ${CAPPED_COPY}`);
    expect(troubleNotice(e, "gentle", null, 1, { paid: false, capped: false, already: true, clearsToday: 9 })!.line).toBe(`The fields are clear. ${ALREADY_COPY}`);
    expect(troubleNotice(e, "gentle", null, 1, { paid: false, capped: true, already: false, clearsToday: 9 })!.reward).toBeUndefined();
  });
});

describe("a building finishing mid-visit", () => {
  const home = (id: string, x: number, z = 0): TroubleHome => ({ id, kind: "fog", x, z, place: null, placeName: null });

  it("keeps every awake trouble exactly where it stands, the tally and all", () => {
    const f = makeField([home("rim-0", 40), home("rim-1", 50), home("place-cove", 60)]);
    stepField(f, makeFxPool(1), input());
    f.tally.session = 3;
    const before = f.troubles.filter((t) => t.live).map((t) => [t.serial, t.x, t.z]);
    expect(before).toHaveLength(3);
    // The outskirts lose a slot (one fewer unfinished site) and the others are re-placed.
    rehomeField(f, [home("rim-0", 43), home("place-cove", 64)]);
    stepField(f, makeFxPool(1), input());
    const after = f.troubles.filter((t) => t.live).map((t) => [t.serial, t.x, t.z]);
    expect(after.map((a) => a[0])).toEqual(before.map((b) => b[0])); // nobody blinked out or was re-spawned
    expect(f.tally.session).toBe(3);
  });

  it("lets a dropped home's trouble go once the child is away, and never wakes it again", () => {
    const f = makeField([home("rim-0", 40), home("rim-1", 50)]);
    stepField(f, makeFxPool(1), input());
    rehomeField(f, [home("rim-0", 40)]);
    const leaving = f.homes.find((h) => h.id === "rim-1")!;
    expect(leaving.leaving).toBe(true);
    // The child walks far off: it sleeps. Then back: only rim-0 comes back.
    stepField(f, makeFxPool(1), input({ heroX: 400 }));
    stepField(f, makeFxPool(1), input());
    expect(liveTroubles(f).map((t) => f.homes[t.home].id)).toEqual(["rim-0"]);
  });

  it("keeps a home's cleared time, so a trouble cleared a moment ago does not pop straight back", () => {
    const f = makeField([home("rim-0", 40)]);
    stepField(f, makeFxPool(1), input());
    f.clearedAt[0] = f.now;
    f.troubles[0].live = false;
    f.slotOf[0] = -1;
    rehomeField(f, [home("rim-0", 40), home("rim-1", 200)]);
    expect(f.clearedAt[0]).toBe(f.now);
  });
});

describe("the pool", () => {
  it("is fixed: the same troubles and the same event objects for ever", () => {
    const f = fieldOf(Array.from({ length: 12 }, (_, i) => ({ x: 40 + i, z: 0, kind: "shadow-blob" as const })));
    const troubles = f.troubles.slice();
    const events = f.events.slice();
    for (let i = 0; i < 300; i++) stepField(f, makeFxPool(4), input({ heroX: 30 }));
    expect(f.troubles).toHaveLength(TROUBLE_POOL);
    f.troubles.forEach((t, i) => expect(t).toBe(troubles[i]));
    f.events.forEach((e, i) => expect(e).toBe(events[i]));
  });
});
