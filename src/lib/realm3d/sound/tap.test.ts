import { describe, expect, it, vi } from "vitest";
import { makeHudBus } from "@/lib/realm3d/hud-bus";
import { makeTroubleBus } from "@/lib/realm3d/trouble-bus";
import type { TroubleEvent } from "@/lib/realm3d/troubles3d";
import { tapHud, tapTroubles } from "./tap";

const ev = (kind: TroubleEvent["kind"]): TroubleEvent => ({ kind, trouble: "fog", home: 0, x: 0, z: 0, count: 1 });

describe("listening in on the HUD bus", () => {
  it("hears a handler installed before the tap and one installed after, and both owners still get theirs", () => {
    const bus = makeHudBus(4, 1);
    const hudFound = vi.fn();
    bus.setHandlers({ onFound: hudFound });
    const heard = vi.fn();
    const heardNear = vi.fn();
    tapHud(bus, { onFound: heard, onNear: heardNear });
    const frameNear = vi.fn();
    bus.setHandlers({ onNear: frameNear });

    bus.onFound("cloudfoot");
    bus.onNear({ kind: "villager", id: "bram", label: "Old Bram" });
    expect(hudFound).toHaveBeenCalledWith("cloudfoot");
    expect(heard).toHaveBeenCalledWith("cloudfoot");
    expect(frameNear).toHaveBeenCalledTimes(1);
    expect(heardNear).toHaveBeenCalledTimes(1);
  });

  it("never wraps a handler twice, however often it is tapped (React's double mount)", () => {
    const bus = makeHudBus(4, 1);
    const owner = vi.fn();
    bus.setHandlers({ onCast: owner });
    const first = vi.fn();
    const untap = tapHud(bus, { onCast: first });
    untap();
    const second = vi.fn();
    tapHud(bus, { onCast: second });
    bus.onCast(2);
    expect(owner).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops hearing after the untap, and the owner carries on", () => {
    const bus = makeHudBus(4, 1);
    const owner = vi.fn();
    const heard = vi.fn();
    const untap = tapHud(bus, { onRefuse: heard });
    bus.setHandlers({ onRefuse: owner });
    untap();
    bus.onRefuse(1, "mana");
    expect(owner).toHaveBeenCalledWith(1, "mana");
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("listening in on the trouble bus", () => {
  it("hears every trouble event the notices get", () => {
    const tbus = makeTroubleBus(4);
    const heard = vi.fn();
    tapTroubles(tbus, heard);
    const notices = vi.fn();
    tbus.setHandler(notices);
    tbus.onEvent(ev("cleared"), "Cloudfoot", "place-summit-1");
    // All of it, the home too: the notices hand it to the bounty.
    expect(notices).toHaveBeenCalledWith(ev("cleared"), "Cloudfoot", "place-summit-1");
    expect(heard).toHaveBeenCalledWith(ev("cleared"));
  });
});

describe("the feet", () => {
  it("are silent until the sound installs them, then reach it", () => {
    const bus = makeHudBus(4, 1);
    expect(() => bus.feet.onStep(1, 2)).not.toThrow();
    const step = vi.fn();
    const feet = bus.feet;
    bus.setFeet({ onStep: step });
    // Installed in place: a mover holding `bus.feet` hears the new handler without re-reading it.
    feet.onStep(1, 2);
    expect(step).toHaveBeenCalledWith(1, 2);
  });
});
