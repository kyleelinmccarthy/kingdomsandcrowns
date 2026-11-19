import { describe, expect, it } from "vitest";
import {
  MATERIALS,
  allocateSpend,
  defaultMaterialForSubject,
  heapSize,
  isMaterialId,
  materialBalance,
  materialPhrase,
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
      expect(m.label).toBeTruthy();
      expect(m.plural).toBeTruthy();
      expect(m.color).toBeTruthy();
      expect(m.icon).toBeTruthy();
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

  it("never treats a negative cost as a credit", () => {
    expect(allocateSpend({ timber: -5, ink: 4 }, [])).toEqual({ ok: false, short: { ink: 4 } });
  });

  it("floors a fractional cost", () => {
    expect(allocateSpend({ ink: 1.5 }, [earned("ink", 1, "a")])).toEqual({ ok: true, spend: { ink: 1 }, sources: ["a"] });
  });

  it("counts a NaN or infinite cost as nothing", () => {
    expect(allocateSpend({ ink: NaN, stone: Infinity }, [])).toEqual({ ok: true, spend: {}, sources: [] });
  });

  it("treats a zero cost as an empty, ok spend", () => {
    expect(allocateSpend({ ink: 0, timber: 0 }, [])).toEqual({ ok: true, spend: {}, sources: [] });
    expect(allocateSpend({}, [earned("ink", 1, "a")])).toEqual({ ok: true, spend: {}, sources: [] });
  });

  it("lists a quest once", () => {
    const rows = [earned("stone", 3, "only", 1)];
    expect(allocateSpend({ stone: 3 }, rows)).toMatchObject({ ok: true, sources: ["only"] });
  });
});

describe("allocateSpend with a flexible share (RD-t)", () => {
  it("pays the flexible share from its own balance first", () => {
    const r = allocateSpend({ stone: 2, dye: 1 }, [earned("stone", 2, "s"), earned("dye", 1, "d"), earned("ink", 5, "i")], { flexible: "dye" });
    expect(r).toMatchObject({ ok: true, spend: { stone: 2, dye: 1 } });
  });

  it("uses timber for the flexible share before any other material", () => {
    const r = allocateSpend({ stone: 2, dye: 2 }, [earned("stone", 2, "s"), earned("timber", 1, "t"), earned("ink", 5, "i")], { flexible: "dye" });
    expect(r).toMatchObject({ ok: true, spend: { stone: 2, timber: 1, ink: 1 } });
  });

  it("then takes the other materials in catalog order", () => {
    const r = allocateSpend({ ink: 1, dye: 3 }, [earned("ink", 1, "i"), earned("thread", 1, "t"), earned("herbs", 1, "h"), earned("stone", 1, "s")], { flexible: "dye" });
    // stone, then herbs, then thread (MATERIAL_IDS order), ink being all committed to its own share.
    expect(r).toMatchObject({ ok: true, spend: { ink: 1, stone: 1, herbs: 1, thread: 1 } });
  });

  it("lets the primary's surplus pay the flexible share, never the units the primary itself needs", () => {
    expect(allocateSpend({ stone: 4, dye: 2 }, [earned("stone", 6, "s")], { flexible: "dye" })).toMatchObject({ ok: true, spend: { stone: 6 } });
    expect(allocateSpend({ stone: 4, dye: 2 }, [earned("stone", 5, "s")], { flexible: "dye" })).toEqual({ ok: false, short: { dye: 1 } });
  });

  it("never pays the primary share from another material", () => {
    // Plenty of everything but stone, and no timber: the stone share stays short.
    const rows = [earned("ink", 20, "i"), earned("herbs", 20, "h"), earned("dye", 2, "d")];
    expect(allocateSpend({ stone: 4, dye: 2 }, rows, { flexible: "dye" })).toEqual({ ok: false, short: { stone: 4 } });
  });

  it("pays the primary's gap from timber before the flexible share sees any", () => {
    const rows = [earned("stone", 1, "s"), earned("timber", 3, "t")];
    // Stone wants 3 more and takes all the timber; the dye share has nothing left to draw on.
    expect(allocateSpend({ stone: 4, dye: 2 }, rows, { flexible: "dye" })).toEqual({ ok: false, short: { dye: 2 } });
  });

  it("names what is still missing after every fill, primary and flexible alike", () => {
    expect(allocateSpend({ stone: 4, dye: 2 }, [earned("stone", 1, "s"), earned("ink", 1, "i")], { flexible: "dye" })).toEqual({ ok: false, short: { stone: 3, dye: 1 } });
  });

  it("records the units actually taken, so sources follow them", () => {
    const rows = [earned("stone", 4, "s", 1), earned("ink", 2, "i", 2)];
    expect(allocateSpend({ stone: 4, dye: 2 }, rows, { flexible: "dye" })).toEqual({ ok: true, spend: { stone: 4, ink: 2 }, sources: ["s", "i"] });
  });

  it("without the option, behaves exactly as before: only timber fills a gap", () => {
    expect(allocateSpend({ stone: 4, dye: 2 }, [earned("stone", 4, "s"), earned("ink", 5, "i")])).toEqual({ ok: false, short: { dye: 2 } });
  });
});

describe("heapSize", () => {
  it("steps at 0, 1-3, 4-9, 10+", () => {
    expect([0, 1, 3, 4, 9, 10, 99].map(heapSize)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it("is empty for anything that is not a positive number", () => {
    expect([NaN, -3, Infinity, -Infinity].map(heapSize)).toEqual([0, 0, 0, 0]);
  });
});

describe("materialPhrase", () => {
  it("reads as a count and a name: the label for one, the plural otherwise", () => {
    expect(materialPhrase(1, "ink")).toBe("1 Ink");
    expect(materialPhrase(2, "stone")).toBe("2 Stone");
    expect(materialPhrase(0, "stone")).toBe("0 Stone");
    expect(materialPhrase(12, "timber")).toBe("12 Timber");
  });

  it("every material reads right in a phrase", () => {
    for (const id of ["stone", "ink", "herbs", "thread", "dye", "timber"] as const) {
      expect(materialPhrase(3, id)).toBe(`3 ${MATERIALS[id].plural}`);
      expect(MATERIALS[id].plural).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});
