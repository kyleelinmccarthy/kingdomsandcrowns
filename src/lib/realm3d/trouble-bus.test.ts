import { describe, expect, it } from "vitest";
import { hideAllTroubles, makeTroubleBus, paintTroubleMark, paintTroublePlate } from "./trouble-bus";

describe("hideAllTroubles: the troubles leave the world (the quiet world)", () => {
  it("takes down every marker and map dot, and the next paint shows them again", () => {
    const bus = makeTroubleBus(2);
    const plate = document.createElement("div");
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "g");
    bus.setPlate(0, "plate", plate);
    bus.setMark(0, mark);
    paintTroublePlate(bus, 0, "translate(10px, 20px)", "1");
    paintTroubleMark(bus, 0, "translate(1 2)");
    expect(plate.style.display).toBe("");
    expect(mark.style.display).toBe("");

    hideAllTroubles(bus);
    expect(plate.style.display).toBe("none");
    expect(mark.style.display).toBe("none");

    // The write cache forgot them, so a field that comes back paints them again.
    paintTroublePlate(bus, 0, "translate(10px, 20px)", "1");
    paintTroubleMark(bus, 0, "translate(1 2)");
    expect(plate.style.display).toBe("");
    expect(mark.style.display).toBe("");
  });
});
