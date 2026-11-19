import { describe, it, expect } from "vitest";
import { activePin, applyBuild, deliveryLines, EMPTY_WORKS, WELCOME_TITLE, CARTS_TITLE, type Delivery, type Works } from "./works-state";
import type { Plaque } from "./improvements";

const works = (over: Partial<Works> = {}): Works => ({
  balance: { stone: 5, ink: 3, herbs: 0, thread: 0, dye: 0, timber: 1 },
  built: { "well-house": 1 },
  plaques: [],
  pinned: "well-house",
  delivery: null,
  ...over,
});

const plaque: Plaque = {
  improvementId: "well-house", level: 2, label: "Well house", builtBy: "Emma", season: "2026–27", sources: ["Fractions p.12"], stars: 3,
};
const after = { stone: 1, ink: 3, herbs: 0, thread: 0, dye: 0, timber: 1 };

describe("applyBuild", () => {
  it("a built level takes the new balance, raises the level and adds the plaque", () => {
    const w = works();
    const next = applyBuild(w, { id: "well-house", label: "Well house", level: 2, built: true, balance: after, plaque });
    expect(next.balance).toEqual(after);
    expect(next.built).toEqual({ "well-house": 2 });
    expect(next.plaques).toEqual([plaque]);
    // The old works are untouched, and the other fields carry over.
    expect(w.built).toEqual({ "well-house": 1 });
    expect(w.plaques).toEqual([]);
    expect(next.pinned).toBe("well-house");
  });

  it("never lowers a level already built, and a first level of a new plan starts the record", () => {
    expect(applyBuild(works({ built: { "well-house": 3 } }), { id: "well-house", label: "Well house", level: 2, built: true, balance: after }).built)
      .toEqual({ "well-house": 3 });
    expect(applyBuild(works(), { id: "village-lamps", label: "Lamps", level: 1, built: true, balance: after }).built)
      .toEqual({ "well-house": 1, "village-lamps": 1 });
  });

  it("does not add a plaque the works already hold for that level (another tab's build handed back)", () => {
    const held = works({ plaques: [plaque] });
    const next = applyBuild(held, { id: "well-house", label: "Well house", level: 2, built: true, balance: after, plaque: { ...plaque } });
    expect(next.plaques).toEqual([plaque]);
    // A different level of the same plan, or the same level of another plan, is a new plaque.
    expect(applyBuild(held, { id: "well-house", label: "Well house", level: 3, built: true, balance: after, plaque: { ...plaque, level: 3 } }).plaques).toHaveLength(2);
    expect(applyBuild(held, { id: "village-lamps", label: "Lamps", level: 2, built: true, balance: after, plaque: { ...plaque, improvementId: "village-lamps" } }).plaques).toHaveLength(2);
  });

  it("a build that fell short updates the balance only", () => {
    const next = applyBuild(works(), { id: "well-house", label: "Well house", level: 2, built: false, reason: "short", balance: after, plaque });
    expect(next.balance).toEqual(after);
    expect(next.built).toEqual({ "well-house": 1 });
    expect(next.plaques).toEqual([]);
  });
});

const row = (materialId: Delivery["rows"][number]["materialId"], amount: number, title: string, origin: "quest" | "welcome" = "quest") => ({ materialId, amount, title, origin });

describe("deliveryLines", () => {
  it("is the carts' title for quest rows, grouped by material in catalog order with distinct titles", () => {
    const d: Delivery = {
      through: 10,
      rows: [row("ink", 1, "Spelling"), row("stone", 1, "Fractions p.12"), row("stone", 1, "Times tables"), row("stone", 1, "Fractions p.12")],
    };
    expect(deliveryLines(d)).toEqual({
      title: "The carts are in!",
      lines: [
        { phrase: "3 Stone", titles: ["Fractions p.12", "Times tables"], more: 0 },
        { phrase: "1 Ink", titles: ["Spelling"], more: 0 },
      ],
    });
    expect(CARTS_TITLE).toBe("The carts are in!");
  });

  it("is the welcome title only when every row is a welcome row", () => {
    expect(deliveryLines({ through: 1, rows: [row("stone", 2, "A", "welcome"), row("ink", 1, "B", "welcome")] }).title)
      .toBe("The carts arrived with four weeks of your work");
    expect(WELCOME_TITLE).toBe("The carts arrived with four weeks of your work");
    expect(deliveryLines({ through: 1, rows: [row("stone", 2, "A", "welcome"), row("ink", 1, "B")] }).title).toBe("The carts are in!");
  });

  it("names the first three distinct quests oldest first and counts the rest", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row("stone", 1, `Quest ${i + 1}`));
    const [line] = deliveryLines({ through: 1, rows }).lines;
    expect(line.phrase).toBe("8 Stone");
    expect(line.titles).toEqual(["Quest 1", "Quest 2", "Quest 3"]);
    expect(line.more).toBe(5);
  });

  it("has no more when three or fewer quests came", () => {
    const [line] = deliveryLines({ through: 1, rows: [row("ink", 1, "A"), row("ink", 1, "A"), row("ink", 1, "B")] }).lines;
    expect(line).toEqual({ phrase: "3 Ink", titles: ["A", "B"], more: 0 });
  });

  it("keeps at most six lines", () => {
    const d: Delivery = {
      through: 1,
      rows: (["stone", "ink", "herbs", "thread", "dye", "timber"] as const).map((m) => row(m, 1, m)),
    };
    expect(deliveryLines(d).lines).toHaveLength(6);
  });
});

describe("EMPTY_WORKS", () => {
  it("holds nothing", () => {
    expect(EMPTY_WORKS.built).toEqual({});
    expect(EMPTY_WORKS.plaques).toEqual([]);
    expect(EMPTY_WORKS.pinned).toBeNull();
    expect(EMPTY_WORKS.delivery).toBeNull();
    expect(Object.values(EMPTY_WORKS.balance).every((n) => n === 0)).toBe(true);
  });
});

describe("activePin", () => {
  it("is the pinned plan while it still has a level to build", () => {
    expect(activePin(works({ pinned: "well-house", built: { "well-house": 2 } }))).toBe("well-house");
    expect(activePin(works({ pinned: "village-banners", built: {} }))).toBe("village-banners");
  });

  it("is null with nothing pinned, for an unknown plan, and once every level stands", () => {
    expect(activePin(works({ pinned: null }))).toBeNull();
    expect(activePin(works({ pinned: "moat" }))).toBeNull();
    expect(activePin(works({ pinned: "well-house", built: { "well-house": 3 } }))).toBeNull();
  });
});
