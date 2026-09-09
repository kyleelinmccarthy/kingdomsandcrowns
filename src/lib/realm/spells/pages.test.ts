import { describe, it, expect } from "vitest";
import { resolvePages, withEmptyPages, FADED_PAGE, EMPTY_PAGE } from "./pages";

const page = (slot: number, elementId = "ember", formId = "bolt", modifierId: string | null = null) => ({ id: `s${slot}`, slot, elementId, formId, modifierId, adjective: "Ember", noun: "Bolt" });

describe("resolvePages", () => {
  it("resolves pages in slot order with element colour and form icon, naming unresolvable ones faded", () => {
    const views = resolvePages([page(3, "tide", "orb"), page(1), page(2, "nope", "bolt")], 4);
    expect(views.map((v) => v.slot)).toEqual([1, 2, 3]);
    expect(views[0]).toMatchObject({ name: "Ember Bolt", color: "#f97316", icon: "lightning" });
    expect(views[0].spell?.manaCost).toBe(10);
    expect(views[1]).toMatchObject({ name: FADED_PAGE, spell: null, icon: null });
    expect(views[2].spell?.shape).toBe("projectile");
  });
  it("drops pages beyond the hero's slot count", () => {
    expect(resolvePages([page(1), page(6)], 4).length).toBe(1);
  });
});

describe("withEmptyPages", () => {
  const saved = (slot: number) => ({ id: `s${slot}`, slot, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" });
  it("keeps the last page of a full book", () => {
    expect(resolvePages([saved(1), saved(4)], 4).map((p) => p.slot)).toEqual([1, 4]);
    expect(resolvePages([saved(0), saved(5)], 4)).toEqual([]);
  });
  it("fills every open slot with an empty page, in slot order", () => {
    const pages = withEmptyPages(resolvePages([saved(2)], 4), 4);
    expect(pages.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    expect(pages.filter((p) => p.empty).map((p) => p.slot)).toEqual([1, 3, 4]);
    expect(pages[0].name).toBe(EMPTY_PAGE);
    expect(pages[0].spell).toBeNull();
    expect(pages[1].empty).toBeUndefined();
    expect(withEmptyPages([], 0)).toEqual([]);
  });
});
