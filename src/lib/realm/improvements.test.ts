import { describe, expect, it } from "vitest";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { BUILDING_SLOTS, buildingFootprint } from "./layout";
import { MATERIAL_IDS, MATERIALS, allocateSpend, type MaterialId } from "./materials";
import { VILLAGE_DECOR_SPOTS, YARD_RADIUS } from "./keep-yard";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLOT_SCALE } from "@/lib/realm3d/lead";
import { CASTLE_TIER_IDS, castleBounds, clearanceFailures, DRAWN, grow, overlaps, rectAt, type R } from "@/test/world-clearance";
import {
  IMPROVEMENTS,
  IMPROVEMENT_COLORS,
  IMPROVEMENT_IDS,
  planElevation,
  parsePlanRef,
  planHint,
  planLine,
  planRef,
  planState,
  type ImprovementBox,
  type ImprovementId,
  type PlanStatus,
} from "./improvements";

const ids = Object.keys(IMPROVEMENTS) as ImprovementId[];
const empty = (): Record<MaterialId, number> => ({ stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 });
const bal = (over: Partial<Record<MaterialId, number>>) => ({ ...empty(), ...over });
const allRaised = new Set(BUILDINGS.map((b) => b.id));

describe("the catalog", () => {
  it("has the thirteen plans, each with three levels, in catalog order", () => {
    expect(IMPROVEMENT_IDS).toEqual([
      "well-house", "mill-granary", "bridge-arches", "chapel-windows", "market-stalls", "library-reading-wing", "watchtower-beacon", "garden-herb-house",
      "chronicle-hall", "village-banners", "village-lamps", "village-fountain", "village-statue",
    ]);
    expect(ids).toEqual([...IMPROVEMENT_IDS]);
    for (const id of ids) expect(IMPROVEMENTS[id].levels, id).toHaveLength(3);
  });

  it("hosts the eight wings on their buildings, the hall on the keep and the four decorations on the village", () => {
    expect(ids.slice(0, 8).map((id) => IMPROVEMENTS[id].host)).toEqual(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"]);
    expect(IMPROVEMENTS["chronicle-hall"].host).toBe("keep");
    for (const id of ["village-banners", "village-lamps", "village-fountain", "village-statue"] as const) expect(IMPROVEMENTS[id].host).toBe("village");
  });

  it("names each one in words a child can read", () => {
    expect(ids.map((id) => IMPROVEMENTS[id].label)).toEqual([
      "Well House", "Granary", "Stone Arches", "Painted Windows", "Cloth Stalls", "Reading Wing", "Beacon Loft", "Herb House",
      "Chronicle Hall", "Banners", "Lamps", "Fountain", "Statue",
    ]);
  });

  it("takes its primary material from the brief and a different secondary", () => {
    const primary: Record<ImprovementId, MaterialId> = {
      "well-house": "stone", "mill-granary": "herbs", "bridge-arches": "stone", "chapel-windows": "dye", "market-stalls": "thread", "library-reading-wing": "ink",
      "watchtower-beacon": "stone", "garden-herb-house": "herbs", "chronicle-hall": "ink", "village-banners": "dye", "village-lamps": "thread", "village-fountain": "stone", "village-statue": "stone",
    };
    for (const id of ids) {
      expect(IMPROVEMENTS[id].primary, id).toBe(primary[id]);
      expect(IMPROVEMENTS[id].secondary, id).not.toBe(IMPROVEMENTS[id].primary);
    }
  });

  it("costs 4+2, 6+3 and 8+4 and never asks for timber", () => {
    for (const id of ids) {
      const { primary, secondary, levels } = IMPROVEMENTS[id];
      expect(secondary, id).not.toBe("timber");
      expect(primary, id).not.toBe("timber");
      expect(levels.map((l) => l.cost), id).toEqual([
        { [primary]: 4, [secondary]: 2 },
        { [primary]: 6, [secondary]: 3 },
        { [primary]: 8, [secondary]: 4 },
      ]);
    }
  });
});

describe("the boxes", () => {
  const upTo = (id: ImprovementId, level: number): ImprovementBox[] => IMPROVEMENTS[id].levels.slice(0, level).flatMap((l) => l.boxes);
  const bottom = (b: ImprovementBox) => b.y - b.sy / 2;
  const top = (b: ImprovementBox) => b.y + b.sy / 2;
  const over = (a: ImprovementBox, b: ImprovementBox) => Math.abs(a.x - b.x) < (a.sx + b.sx) / 2 - 1e-6 && Math.abs(a.z - b.z) < (a.sz + b.sz) / 2 - 1e-6;

  it("gives every level something new to see, in the palette", () => {
    for (const id of ids) {
      IMPROVEMENTS[id].levels.forEach((l, i) => {
        expect(l.boxes.length, `${id} level ${i + 1}`).toBeGreaterThan(0);
        for (const b of l.boxes) {
          expect(IMPROVEMENT_COLORS[b.color], `${id} colour ${b.color}`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(b.sx).toBeGreaterThan(0);
          expect(b.sy).toBeGreaterThan(0);
          expect(b.sz).toBeGreaterThan(0);
        }
      });
    }
  });

  it("rests every box on the ground or on a lower box, level by level", () => {
    for (const id of ids) {
      for (let level = 1; level <= 3; level++) {
        const boxes = upTo(id, level);
        const added = IMPROVEMENTS[id].levels[level - 1].boxes;
        for (const b of added) {
          if (bottom(b) < 0.001) continue;
          const supported = boxes.some((q) => q !== b && Math.abs(top(q) - bottom(b)) < 0.02 && over(b, q));
          expect(supported, `${id} level ${level}: a ${b.color} box at ${b.x},${b.y},${b.z} floats`).toBe(true);
        }
      }
    }
  });

  it("never sinks below the ground", () => {
    for (const id of ids) for (const b of upTo(id, 3)) expect(bottom(b), id).toBeGreaterThanOrEqual(-0.001);
  });

  it("stands each wing outside its building's drawn footprint and off the door lane", () => {
    for (const id of ids.slice(0, 8)) {
      const host = IMPROVEMENTS[id].host as string;
      const f = buildingFootprint(host);
      const hw = (f.w * DRAWN) / 2;
      const hd = (f.d * DRAWN) / 2;
      for (const b of upTo(id, 3)) {
        const inside = Math.abs(b.x) < hw + b.sx / 2 - 1e-6 && Math.abs(b.z) < hd + b.sz / 2 - 1e-6;
        expect(inside, `${id}: a box at ${b.x},${b.z} is inside the ${host}`).toBe(false);
        const inLane = b.z + b.sz / 2 > 0 && Math.abs(b.x) - b.sx / 2 < 1;
        expect(inLane, `${id}: a box at ${b.x},${b.z} is in front of the door`).toBe(false);
      }
    }
  });

  it("clears the world: other sites, the road, the lap ring, the plaza and the decorations", () => {
    const failures: string[] = [];
    const placed: { id: string; rect: R }[] = [];
    for (const id of ids.slice(0, 8)) {
      const host = IMPROVEMENTS[id].host as string;
      const slot = BUILDING_SLOTS[host];
      for (const b of upTo(id, 3)) {
        const rect = rectAt(slot.x + b.x, slot.z + b.z, b.sx, b.sz);
        failures.push(...clearanceFailures(id, rect, host));
        placed.push({ id, rect });
      }
    }
    expect(failures).toEqual([]);
    // ...and no wing runs into another's.
    for (const a of placed) for (const b of placed) if (a.id < b.id) expect(overlaps(a.rect, b.rect), `${a.id} and ${b.id}`).toBe(false);
  });

  it("keeps every wing box clear of the castle as it is really drawn, at every tier", () => {
    for (const id of ids.slice(0, 8)) {
      const slot = BUILDING_SLOTS[IMPROVEMENTS[id].host as string];
      for (const b of upTo(id, 3)) for (const tier of CASTLE_TIER_IDS) expect(overlaps(rectAt(slot.x + b.x, slot.z + b.z, b.sx, b.sz), grow(castleBounds(tier), 1)), `${id} touches the ${tier} castle`).toBe(false);
    }
  });

  it("draws sites at the scale the scene does", () => {
    const scene = readFileSync(resolve(__dirname, "../../components/realm3d/spike-scene.tsx"), "utf8");
    expect(Number(/^const SITE_PLAN = ([\d.]+);/m.exec(scene)?.[1])).toBe(PLOT_SCALE);
    expect(DRAWN).toBe(PLOT_SCALE);
  });

  it("keeps every decoration's and the hall's boxes inside the square their spot keeps", () => {
    for (const id of ["chronicle-hall", "village-banners", "village-lamps", "village-fountain", "village-statue"] as const) {
      const r = YARD_RADIUS[id === "chronicle-hall" ? "chronicleHall" : id];
      for (const b of upTo(id, 3)) {
        expect(Math.abs(b.x) + b.sx / 2, `${id} x`).toBeLessThanOrEqual(r + 1e-9);
        expect(Math.abs(b.z) + b.sz / 2, `${id} z`).toBeLessThanOrEqual(r + 1e-9);
      }
    }
  });

  it("clears the world for the village decorations", () => {
    for (const id of ["village-banners", "village-lamps", "village-fountain", "village-statue"] as const) {
      const spot = VILLAGE_DECOR_SPOTS[id];
      const failures: string[] = [];
      for (const b of upTo(id, 3)) failures.push(...clearanceFailures(id, rectAt(spot.x + b.x, spot.z + b.z, b.sx, b.sz)));
      expect(failures).toEqual([]);
    }
  });
});

describe("planState", () => {
  const find = (plans: PlanStatus[], id: string) => plans.find((p) => p.id === id)!;

  it("lists every plan once, at the level after the highest built", () => {
    const plans = planState({ built: { "well-house": 2, "village-statue": 3 }, raised: allRaised, balance: empty() });
    expect(plans).toHaveLength(13);
    expect(find(plans, "well-house").level).toBe(3);
    expect(find(plans, "mill-granary").level).toBe(1);
    expect(find(plans, "village-statue")).toMatchObject({ level: 3, state: "done" });
  });

  it("offers every plan as ready when the hero holds only timber", () => {
    const plans = planState({ built: {}, raised: allRaised, balance: bal({ timber: 30 }) });
    expect(plans.every((p) => p.state === "ready")).toBe(true);
  });

  it("is short by what even timber cannot cover, and says what", () => {
    // Level 1 of the well house wants 4 stone + 2 thread; 3 timber covers 3 of the 6.
    const plans = planState({ built: {}, raised: allRaised, balance: bal({ timber: 3 }) });
    const well = find(plans, "well-house");
    expect(well.state).toBe("short");
    const rows = (b: Record<MaterialId, number>) => MATERIAL_IDS.map((m) => ({ materialId: m, amount: b[m], kind: "earned" as const, sourceAssignmentId: null, createdAt: 0 })).filter((r) => r.amount > 0);
    const spend = allocateSpend(IMPROVEMENTS["well-house"].levels[0].cost, rows(bal({ timber: 3 })));
    expect(spend.ok).toBe(false);
    expect(well.short).toEqual(spend.ok ? {} : spend.short);
    expect(well.short).toEqual({ stone: 3 });
  });

  it("calls a wing whose building is not raised 'host', and offers keep and village plans anyway", () => {
    const plans = planState({ built: {}, raised: new Set(["well"]), balance: bal({ timber: 30 }) });
    expect(find(plans, "well-house").state).toBe("ready");
    expect(find(plans, "library-reading-wing").state).toBe("host");
    expect(find(plans, "chronicle-hall").state).toBe("ready");
    expect(find(plans, "village-fountain").state).toBe("ready");
  });

  it("sorts ready first, then short by fewest missing, then host, then done, each in catalog order", () => {
    const plans = planState({
      built: { "village-statue": 3 },
      raised: new Set(["well", "mill", "bridge"]),
      balance: bal({ stone: 4, thread: 2, herbs: 4 }),
    });
    // Each plan is weighed against the whole balance on its own (4 stone, 2 thread, 4 herbs).
    // Ready: well-house (4 stone + 2 thread), mill-granary (4 herbs + 2 stone), fountain (4 stone + 2 herbs).
    // Short: bridge-arches lacks 2 dye, lamps 2 thread, hall 4 ink, banners 4 dye. Five wings wait on their buildings.
    expect(plans.map((p) => `${p.id}:${p.state}`)).toEqual([
      "well-house:ready", "mill-granary:ready", "village-fountain:ready",
      "bridge-arches:short", "village-lamps:short", "chronicle-hall:short", "village-banners:short",
      "chapel-windows:host", "market-stalls:host", "library-reading-wing:host", "watchtower-beacon:host", "garden-herb-house:host",
      "village-statue:done",
    ]);
    expect(find(plans, "village-lamps").short).toEqual({ thread: 2 });
    expect(find(plans, "chronicle-hall").short).toEqual({ ink: 4 });
  });

  it("treats a built count that is not a number as nothing built", () => {
    const plans = planState({ built: { "well-house": Number.NaN, "village-lamps": Number.POSITIVE_INFINITY, "village-statue": -2 }, raised: allRaised, balance: empty() });
    expect(find(plans, "well-house").level).toBe(1);
    expect(find(plans, "village-lamps").level).toBe(1);
    expect(find(plans, "village-statue").level).toBe(1);
  });

  it("treats a missing built entry as nothing built", () => {
    expect(find(planState({ built: {}, raised: allRaised, balance: empty() }), "village-banners").level).toBe(1);
  });
});

describe("planLine", () => {
  it("speaks each state in the plan's own words", () => {
    expect(planLine({ id: "well-house", level: 1, state: "ready" })).toBe("Ready to build");
    expect(planLine({ id: "village-fountain", level: 1, state: "done" })).toBe("Built");
    expect(planLine({ id: "library-reading-wing", level: 1, state: "host" })).toBe("Raise the Library first");
    expect(planLine({ id: "well-house", level: 1, state: "host" })).toBe("Raise the Village Well first");
  });

  it("says what is missing, singular or plural, joined with 'and'", () => {
    expect(planLine({ id: "well-house", level: 1, state: "short", short: { ink: 1 } })).toBe("Needs 1 more Ink");
    expect(planLine({ id: "well-house", level: 1, state: "short", short: { herbs: 3 } })).toBe("Needs 3 more Herbs");
    expect(planLine({ id: "well-house", level: 1, state: "short", short: { ink: 2, stone: 1 } })).toBe("Needs 2 more Ink and 1 more Stone");
    expect(planLine({ id: "well-house", level: 1, state: "short", short: { stone: 3, thread: 1, dye: 2 } })).toBe("Needs 3 more Stone and 1 more Thread and 2 more Dye");
  });

  it("uses every material's own name", () => {
    for (const m of MATERIAL_IDS) expect(planLine({ id: "well-house", level: 1, state: "short", short: { [m]: 2 } })).toBe(`Needs 2 more ${MATERIALS[m].plural}`);
  });
});

describe("planHint", () => {
  const short = (id: ImprovementId, s: Partial<Record<MaterialId, number>>): PlanStatus => ({ id, level: 1, state: "short", short: s });

  it("names the nearest plan that wants what was just made", () => {
    const plans = [short("library-reading-wing", { ink: 3 }), short("village-banners", { ink: 1 }), short("well-house", { stone: 2 })];
    expect(planHint("ink", plans, null)).toBe("the Banners needs 1 more");
    expect(planHint("stone", plans, null)).toBe("the Village Well's Well House needs 2 more");
  });

  it("reads naturally for a building host", () => {
    expect(planHint("ink", [short("library-reading-wing", { ink: 3 })], null)).toBe("the Library's Reading Wing needs 3 more");
  });

  it("prefers the pinned plan when it needs what was made, even if another is nearer", () => {
    const plans = [short("library-reading-wing", { ink: 3 }), short("village-banners", { ink: 1 })];
    expect(planHint("ink", plans, "library-reading-wing")).toBe("the Library's Reading Wing needs 3 more");
  });

  it("falls back to the nearest when the pinned plan does not need it", () => {
    const plans = [short("library-reading-wing", { thread: 3 }), short("village-banners", { ink: 1 })];
    expect(planHint("ink", plans, "library-reading-wing")).toBe("the Banners needs 1 more");
  });

  it("breaks a tie in catalog order, whatever order the plans arrive in", () => {
    const a = short("village-lamps", { ink: 2 });
    const b = short("chronicle-hall", { ink: 2 });
    expect(planHint("ink", [a, b], null)).toBe("the Chronicle Hall needs 2 more");
    expect(planHint("ink", [b, a], null)).toBe("the Chronicle Hall needs 2 more");
  });

  it("ignores plans that are ready, waiting on a host or done, and says nothing when no plan needs it", () => {
    const plans: PlanStatus[] = [
      { id: "well-house", level: 1, state: "ready" },
      { id: "mill-granary", level: 1, state: "host" },
      { id: "village-statue", level: 3, state: "done" },
      short("village-banners", { dye: 2 }),
    ];
    expect(planHint("ink", plans, null)).toBeNull();
    expect(planHint("ink", plans, "village-statue")).toBeNull();
    expect(planHint("dye", plans, null)).toBe("the Banners needs 2 more");
    expect(planHint("ink", [], null)).toBeNull();
  });
});

describe("planElevation", () => {
  it("draws earlier levels as the base and this level as the addition", () => {
    const one = planElevation("village-fountain", 1);
    expect(one.base).toEqual([]);
    expect(one.added).toHaveLength(IMPROVEMENTS["village-fountain"].levels[0].boxes.length);
    const three = planElevation("village-fountain", 3);
    expect(three.base).toHaveLength(IMPROVEMENTS["village-fountain"].levels[0].boxes.length + IMPROVEMENTS["village-fountain"].levels[1].boxes.length);
    expect(three.added).toHaveLength(IMPROVEMENTS["village-fountain"].levels[2].boxes.length);
  });

  it("projects a box front-on: left edge, base height, width and height, in the box's colour", () => {
    const box = IMPROVEMENTS["village-statue"].levels[0].boxes[0];
    const rect = planElevation("village-statue", 1).added[0];
    expect(rect).toEqual({ x: box.x - box.sx / 2, y: box.y - box.sy / 2, w: box.sx, h: box.sy, color: box.color });
  });

  it("throws on an unknown plan or a level that is not 1, 2 or 3", () => {
    expect(() => planElevation("nope" as ImprovementId, 1)).toThrow();
    expect(() => planElevation("well-house", 0)).toThrow();
    expect(() => planElevation("well-house", 4)).toThrow();
    expect(() => planElevation("well-house", 1.5)).toThrow();
  });
});

describe("planRef and parsePlanRef", () => {
  it("writes a plan level as `<id>:<level>`", () => {
    expect(planRef("well-house", 2)).toBe("well-house:2");
  });

  it("reads back what it wrote, for every plan and level", () => {
    for (const id of ids) for (const level of [1, 2, 3]) expect(parsePlanRef(planRef(id, level))).toEqual({ improvementId: id, level });
  });

  it("is null for anything malformed: an unknown id, a level outside 1 to 3, a non-integer level, extra or missing parts", () => {
    for (const bad of [
      "", "well-house", "well-house:", ":1", "nope:1", "well-house:0", "well-house:4", "well-house:-1", "well-house:1.5", "well-house:one",
      "well-house:1:2", "well-house:01", "well-house: 1", " well-house:1", "well-house:1 ", "WELL-HOUSE:1", "well-house:1e0", "well-house:+1", "__proto__:1", "constructor:1",
    ]) {
      expect(parsePlanRef(bad), bad).toBeNull();
    }
  });

  it("is null for a value that is not a string", () => {
    for (const bad of [null, undefined, 3, {}, ["well-house:1"]]) expect(parsePlanRef(bad as unknown as string)).toBeNull();
  });
});
