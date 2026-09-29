import { cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeHudBus, type HudBus } from "@/lib/realm3d/hud-bus";
import { LOOK_KEY } from "@/lib/realm3d/look-settings";
import { LookControls, useLook } from "./look-controls";

/** The pause menu's half: the settings, wired to a bus the way `realm-game.tsx` wires them. */
function Mouse({ bus }: { bus: HudBus }) {
  const { look, change } = useLook(bus);
  return <LookControls look={look} onChange={change} />;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the mouse's look settings", () => {
  it("hand the scene what this computer kept before any menu opens", () => {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ sensitivity: 2, invertY: true }));
    const bus = makeHudBus(4, 1);
    renderHook(() => useLook(bus));
    expect(bus.look).toEqual({ sensitivity: 2, invertY: true });
  });

  it("change the look speed and which way is up for the scene, and keep both on this computer", () => {
    const bus = makeHudBus(4, 1);
    render(<Mouse bus={bus} />);
    fireEvent.change(screen.getByRole("slider", { name: "Look speed" }), { target: { value: "150" } });
    expect(bus.look.sensitivity).toBe(1.5);
    const invert = within(screen.getByRole("group", { name: "Invert up/down" }));
    expect(invert.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(invert.getByRole("button", { name: "On" }));
    expect(bus.look.invertY).toBe(true);
    expect(JSON.parse(localStorage.getItem(LOOK_KEY)!)).toEqual({ sensitivity: 1.5, invertY: true });
  });

  it("go from a quarter of the speed to three times it", () => {
    const bus = makeHudBus(4, 1);
    render(<Mouse bus={bus} />);
    const speed = screen.getByRole("slider", { name: "Look speed" });
    fireEvent.change(speed, { target: { value: "300" } });
    expect(bus.look.sensitivity).toBe(3);
    fireEvent.change(speed, { target: { value: "25" } });
    expect(bus.look.sensitivity).toBe(0.25);
  });

  it("still work for the visit when this computer will not keep anything", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "QuotaExceededError");
    });
    const bus = makeHudBus(4, 1);
    render(<Mouse bus={bus} />);
    fireEvent.change(screen.getByRole("slider", { name: "Look speed" }), { target: { value: "50" } });
    expect(bus.look.sensitivity).toBe(0.5);
  });
});
