import { describe, expect, it } from "vitest";
import {
  MATERIALS,
  allocateSpend,
  defaultMaterialForSubject,
  heapSize,
  isMaterialId,
  materialBalance,
  resolveMaterial,
  type MaterialRow,
} from "./materials";

let clock = 0;
const earned = (materialId: string, amount: number, sourceAssignmentId: string | null, createdAt = ++clock): MaterialRow => ({
  materialId,
  amount,
  kind: "earned",
  sourceAssignmentId,
  createdAt,
});
const spent = (materialId: string, amount: number, createdAt = ++clock): MaterialRow => ({
  materialId,
  amount,
  kind: "spent",
  sourceAssignmentId: null,
  createdAt,
});

describe("catalog", () => {
  it("has the six materials, each with a label, plural, colour and icon", () => {
    expect(Object.keys(MATERIALS).sort()).toEqual(["dye", "herbs", "ink", "stone", "thread", "timber"]);
    for (const m of Object.values(MATERIALS)) {
      expect(m.label && m.plural && m.color && m.icon).toBeTruthy();
    }
  });

  it("knows a material id when it sees one", () => {
    expect(isMaterialId("stone")).toBe(true);
    expect(isMaterialId("gold")).toBe(false);
    expect(isMaterialId(null)).toBe(false);
  });
});

describe("defaultMaterialForSubject", () => {
  it("maps names by whole word", () => {
    expect(defaultMaterialForSubject("Math 2")).toBe("stone");
    expect(defaultMaterialForSubject("Social Studies")).toBe("thread");
    expect(defaultMaterialForSubject("Handwriting")).toBe("ink");
    expect(defaultMaterialForSubject("Life Science")).toBe("herbs");
    expect(defaultMaterialForSubject("Music")).toBe("dye");
  });

  it("falls back to timber", () => {
    expect(defaultMaterialForSubject("Spanish")).toBe("timber");
    expect(defaultMaterialForSubject("PE")).toBe("timber");
    expect(defaultMaterialForSubject("Smarts")).toBe("timber");
    expect(defaultMaterialForSubject("")).toBe("timber");
  });

  it("lets the first material in catalog order win", () => {
    expect(defaultMaterialForSubject("Art History")).toBe("thread");
    expect(defaultMaterialForSubject("Math and Reading")).toBe("stone");
  });
});

describe("resolveMaterial", () => {
  it("uses a stored valid material, else the name", () => {
    expect(resolveMaterial({ name: "Math", material: "dye" })).toBe("dye");
    expect(resolveMaterial({ name: "Math", material: null })).toBe("stone");
    expect(resolveMaterial({ name: "Math", material: "bogus" })).toBe("stone");
  });
});

describe("materialBalance", () => {
  it("is earned minus spent, with every material present", () => {
    const b = materialBalance([earned("stone", 5, "a"), spent("stone", 3)]);
    expect(b.stone).toBe(2);
    expect(b).toEqual({ stone: 2, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 });
  });

  it("never goes negative and ignores unknown ids", () => {
    const b = materialBalance([earned("ink", 1, "a"), spent("ink", 4), earned("gold", 9, "b")]);
    expect(b.ink).toBe(0);
    expect(Object.keys(b)).toHaveLength(6);
  });
});

describe("allocateSpend", () => {
  it("pays from the material itself", () => {
    const r = allocateSpend({ stone: 2 }, [earned("stone", 3, "a")]);
    expect(r).toEqual({ ok: true, spend: { stone: 2 }, sources: ["a"] });
  });

  it("pays a shortfall from timber", () => {
    const rows = [earned("ink", 1, "q1"), earned("timber", 5, "q2")];
    const r = allocateSpend({ ink: 4 }, rows);
    expect(r).toEqual({ ok: true, spend: { ink: 1, timber: 3 }, sources: ["q1", "q2"] });
  });

  it("covers a material the hero has none of with timber alone", () => {
    const r = allocateSpend({ dye: 2, stone: 1 }, [earned("timber", 3, "t")]);
    expect(r).toEqual({ ok: true, spend: { timber: 3 }, sources: ["t"] });
  });

  it("names the missing amounts when even timber falls short", () => {
    const r = allocateSpend({ ink: 4 }, [earned("ink", 1, "q1"), earned("timber", 1, "q2")]);
    expect(r).toEqual({ ok: false, short: { ink: 2 } });
  });

  it("is short when the hero has nothing", () => {
    expect(allocateSpend({ stone: 2, ink: 1 }, [])).toEqual({ ok: false, short: { stone: 2, ink: 1 } });
  });

  it("counts a timber cost against timber's own balance", () => {
    expect(allocateSpend({ timber: 2 }, [earned("timber", 1, "a")])).toEqual({ ok: false, short: { timber: 1 } });
  });

  it("skips earned units already spent when listing sources, oldest first", () => {
    const rows = [
      earned("stone", 2, "old", 1),
      earned("stone", 2, "mid", 2),
      earned("stone", 2, "new", 3),
      spent("stone", 3, 4),
    ];
    // 3 spent: "old" (2) and one unit of "mid". The next 2 units: rest of "mid", then one of "new".
    const r = allocateSpend({ stone: 2 }, rows);
    expect(r).toEqual({ ok: true, spend: { stone: 2 }, sources: ["mid", "new"] });
  });

  it("lets timber spent earlier consume timber's oldest rows", () => {
    const rows = [earned("timber", 1, "t1", 1), earned("timber", 1, "t2", 2), spent("timber", 1, 3)];
    expect(allocateSpend({ ink: 1 }, rows)).toEqual({ ok: true, spend: { timber: 1 }, sources: ["t2"] });
  });

  it("orders sources across materials by age and skips null ids", () => {
    const rows = [
      earned("ink", 1, "inkq", 5),
      earned("stone", 1, null, 2),
      earned("stone", 1, "stoneq", 3),
      earned("dye", 1, "dyeq", 1),
    ];
    const r = allocateSpend({ ink: 1, stone: 2, dye: 1 }, rows);
    expect(r).toEqual({ ok: true, spend: { ink: 1, stone: 2, dye: 1 }, sources: ["dyeq", "stoneq", "inkq"] });
  });

  it("stops at 12 sources", () => {
    const rows = Array.from({ length: 20 }, (_, i) => earned("stone", 1, `q${i}`, i + 1));
    const r = allocateSpend({ stone: 20 }, rows);
    expect(r.ok && r.sources).toEqual(Array.from({ length: 12 }, (_, i) => `q${i}`));
  });

  it("lists a quest once", () => {
    const rows = [earned("stone", 3, "only", 1)];
    expect(allocateSpend({ stone: 3 }, rows)).toMatchObject({ ok: true, sources: ["only"] });
  });
});

describe("heapSize", () => {
  it("steps at 0, 1-3, 4-9, 10+", () => {
    expect([0, 1, 3, 4, 9, 10, 99].map(heapSize)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});
