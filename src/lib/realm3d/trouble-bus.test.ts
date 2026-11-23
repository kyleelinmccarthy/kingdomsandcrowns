import { describe, expect, it } from "vitest";
import { hideAllTroubles, makeTroubleBus, paintTroubleMark, paintTroublePlate, shareTroubleField, troubleMapMarks } from "./trouble-bus";
import { makeField } from "./troubles3d";

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

describe("troubleMapMarks: the troubles on the big map", () => {
  it("has none while the troubles are not in the world", () => {
    expect(troubleMapMarks(makeTroubleBus())).toEqual([]);
  });

  it("marks every live trouble where it stands, named in the chosen tone, and skips the fading and the empty slots", () => {
    const tbus = makeTroubleBus();
    const field = makeField([]);
    Object.assign(field.troubles[0], { live: true, kind: "fog", x: 12.34, z: -5 });
    Object.assign(field.troubles[2], { live: true, dying: true, kind: "fog", x: 1, z: 1 });
    Object.assign(field.troubles[3], { live: true, kind: "cursed-stone", x: -40, z: 60 });
    shareTroubleField(tbus, field);
    tbus.setSkin("monsters");
    const marks = troubleMapMarks(tbus);
    expect(marks.map((m) => [m.id, m.x, m.z, m.kind])).toEqual([
      ["trouble-0", 12.34, -5, "trouble"],
      ["trouble-3", -40, 60, "trouble"],
    ]);
    expect(marks.every((m) => m.label.length > 0)).toBe(true);
  });
});
