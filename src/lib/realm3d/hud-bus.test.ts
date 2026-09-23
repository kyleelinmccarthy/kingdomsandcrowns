import { describe, expect, it } from "vitest";
import { makeHudBus, paintGoal } from "./hud-bus";

describe("the gold !", () => {
  it("is written only when something changed, and hidden without touching its position", () => {
    const bus = makeHudBus(4, 3);
    const mark = document.createElement("div");
    const arrow = document.createElement("span");
    const dist = document.createElement("span");
    bus.setNode("goalMark", mark);
    bus.setNode("goalArrow", arrow);
    bus.setNode("goalDist", dist);

    paintGoal(bus, "edge-low", "translate3d(10px,20px,0)", "rotate(170deg)", "55 m");
    expect(mark.dataset.state).toBe("edge-low");
    expect(mark.style.transform).toBe("translate3d(10px,20px,0)");
    expect(arrow.style.transform).toBe("rotate(170deg)");
    expect(dist.textContent).toBe("55 m");

    // The same answer again writes nothing: prove it by scribbling on the node first.
    mark.style.transform = "translate3d(1px, 1px, 0px)";
    paintGoal(bus, "edge-low", "translate3d(10px,20px,0)", "rotate(170deg)", "55 m");
    expect(mark.style.transform).toBe("translate3d(1px, 1px, 0px)");

    paintGoal(bus, "off", "", "", "");
    expect(mark.dataset.state).toBe("off");
    expect(dist.textContent).toBe("55 m");
  });

  it("carries the goal the frame sets, mutated in place for the driver", () => {
    const bus = makeHudBus(4, 3);
    const goal = bus.goal;
    bus.setGoal(true, -5, 6.2, 11);
    expect(bus.goal).toBe(goal);
    expect(goal).toEqual({ on: true, x: -5, y: 6.2, z: 11 });
  });

  it("installs the new handlers alongside the old", () => {
    const bus = makeHudBus(4, 3);
    const got: string[] = [];
    bus.setHandlers({ onCast: (s) => got.push(`cast ${s}`), onWalked: (d) => got.push(`walked ${d}`) });
    bus.onCast(2);
    bus.onWalked(6);
    expect(got).toEqual(["cast 2", "walked 6"]);
  });
});
