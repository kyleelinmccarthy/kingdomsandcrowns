import { describe, expect, it, vi } from "vitest";
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

describe("looking with the mouse", () => {
  it("starts at a steady sensitivity, not inverted, and settings are merged in place", () => {
    const bus = makeHudBus(1, 1);
    const look = bus.look;
    expect(look).toEqual({ sensitivity: 1, invertY: false });
    bus.setLook({ sensitivity: 1.6 });
    expect(bus.look).toBe(look); // the scene holds this object and reads it on every mouse move
    expect(bus.look).toEqual({ sensitivity: 1.6, invertY: false });
    bus.setLook({ invertY: true });
    expect(bus.look).toEqual({ sensitivity: 1.6, invertY: true });
  });

  it("tells the frame when the browser freed the captured mouse, through the ordinary handlers", () => {
    const bus = makeHudBus(1, 1);
    expect(() => bus.onLookFreed()).not.toThrow(); // a no-op until the frame installs one
    const freed = vi.fn();
    const near = vi.fn();
    bus.setHandlers({ onNear: near });
    bus.setHandlers({ onLookFreed: freed });
    bus.onLookFreed();
    expect(freed).toHaveBeenCalledTimes(1);
    expect(bus.onNear).toBe(near); // installing one handler leaves the others alone
  });

  it("lets the frame ask the scene to capture the mouse again, once the scene has said how", () => {
    const bus = makeHudBus(1, 1);
    expect(() => bus.requestLook()).not.toThrow(); // nothing to capture until the scene is up
    const capture = vi.fn();
    bus.setLookRequester(capture);
    bus.requestLook();
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
