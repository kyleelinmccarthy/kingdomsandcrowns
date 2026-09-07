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
