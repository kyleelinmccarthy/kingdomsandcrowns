import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { controlRows } from "@/lib/realm3d/frame";
import { createInputRouter, type InputRouter } from "@/lib/realm3d/input-router";
import { defaultKeymap, type Keymap } from "@/lib/realm3d/keymap";
import { KeybindList } from "./keybind-list";
import { RealmInputProvider } from "./realm-input";

/*
 * The Controls panel's key chips, on the real window and a real router: the list catches its key
 * on the window in the capture phase, as it does in the game, and sets the router aside meanwhile.
 */
afterEach(cleanup);

const MOUNT = /^Get on or off your mount: Z\. Press to change\.$/;

function setup(o: { keymap?: Keymap; editable?: boolean } = {}) {
  const keymap = o.keymap ?? defaultKeymap();
  const router: InputRouter = createInputRouter(window, keymap);
  const onChange = vi.fn();
  const rows = controlRows(keymap, 4, { mount: true, pet: "Fox" });
  const view = render(
    <RealmInputProvider router={router}>
      <KeybindList rows={rows} keymap={keymap} onChange={onChange} editable={o.editable ?? true} />
    </RealmInputProvider>,
  );
  const press = (code: string, extra: Record<string, unknown> = {}) => {
    const e = new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true, ...extra });
    act(() => void window.dispatchEvent(e));
    return e;
  };
  const live = () => view.container.querySelector("[aria-live='polite']")!;
  return { router, onChange, press, live, view, cleanupRouter: () => router.dispose() };
}

describe("rebinding a key", () => {
  it("clicking the Mount chip, then pressing G, binds G to Mount", () => {
    const { onChange, press, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    expect(screen.getByRole("button", { name: "Get on or off your mount: Press a key…" })).toHaveTextContent("Press a key…");
    expect(screen.getByText("Press a key for Get on or off your mount. Esc to cancel.")).toBeInTheDocument();
    press("KeyG");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].mount).toEqual(["KeyG"]);
    expect(screen.queryByText("Press a key…")).toBeNull();
    cleanupRouter();
  });

  it("pressing a key another action has swaps the two, and says so", () => {
    const { onChange, press, live, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    press("KeyM");
    const next = onChange.mock.calls[0][0] as Keymap;
    expect(next.mount).toEqual(["KeyM"]);
    expect(next.map).toEqual(["KeyZ"]);
    expect(live()).toHaveTextContent("M was Open the map. Open the map is now Z.");
    cleanupRouter();
  });

  it("Escape cancels, changes nothing, and does not reach the frame's Esc", () => {
    const { onChange, press, cleanupRouter } = setup();
    const frameEsc = vi.fn();
    window.addEventListener("keydown", frameEsc);
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    press("Escape", { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(frameEsc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: MOUNT })).toHaveTextContent("Z");
    window.removeEventListener("keydown", frameEsc);
    cleanupRouter();
  });

  it("Tab cancels, and is not prevented, so focus moves as usual", () => {
    const { onChange, press, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    const e = press("Tab", { key: "Tab" });
    expect(e.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Press a key…")).toBeNull();
    cleanupRouter();
  });

  it("Ctrl can't be used: the line says so, and the chip keeps listening", () => {
    const { onChange, press, live, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    press("ControlLeft", { key: "Control", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("That key can't be used. Try another.");
    expect(screen.getByText("Press a key…")).toBeInTheDocument();
    press("KeyG");
    expect(onChange.mock.calls[0][0].mount).toEqual(["KeyG"]);
    cleanupRouter();
  });

  it("sets the router aside while listening, so Space pressed to rebind does not jump", () => {
    const { router, onChange, press, cleanupRouter } = setup();
    const jump = vi.fn();
    router.on("jump", jump, "always");
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    press("Space", { key: " " });
    expect(jump).not.toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].mount).toEqual(["Space"]);
    // Listening over, the router hears again.
    press("Space", { key: " " });
    expect(jump).toHaveBeenCalledTimes(1);
    cleanupRouter();
  });

  it("hands the router back when the list closes mid-listen", () => {
    const { router, view, press, cleanupRouter } = setup();
    const jump = vi.fn();
    router.on("jump", jump, "always");
    fireEvent.click(screen.getByRole("button", { name: MOUNT }));
    view.unmount();
    press("Space", { key: " " });
    expect(jump).toHaveBeenCalledTimes(1);
    cleanupRouter();
  });

  it("Reset puts every key back", () => {
    const { onChange, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(onChange).toHaveBeenCalledWith(defaultKeymap());
    cleanupRouter();
  });
});

describe("the rows", () => {
  it("gives the walk row a chip per key of each of its four actions, by action", () => {
    const { cleanupRouter } = setup();
    expect(screen.getByRole("button", { name: "Walk forward: W. Press to change." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Walk forward: ↑. Press to change." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step left: A. Press to change." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Walk back: S. Press to change." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step right: D. Press to change." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast spell 4: 4. Press to change." })).toBeInTheDocument();
    cleanupRouter();
  });

  it("offers a + chip for a second key, which binds into slot 2", () => {
    const { onChange, press, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Jump: add another key." }));
    press("KeyJ");
    expect(onChange.mock.calls[0][0].jump).toEqual(["Space", "KeyJ"]);
    cleanupRouter();
  });

  it("a key taken onto a + chip leaves the other action its second key, and says so", () => {
    const { onChange, press, live, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Jump: add another key." }));
    press("KeyW");
    const next = onChange.mock.calls[0][0] as Keymap;
    expect(next.jump).toEqual(["Space", "KeyW"]);
    expect(next.walkForward).toEqual(["ArrowUp"]);
    expect(live()).toHaveTextContent("W was Walk forward. Walk forward still has ↑.");
    cleanupRouter();
  });

  it("a key taken onto a + chip from an action with only that key leaves it with none, and says so", () => {
    const { onChange, press, live, cleanupRouter } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Jump: add another key." }));
    press("KeyZ");
    const next = onChange.mock.calls[0][0] as Keymap;
    expect(next.jump).toEqual(["Space", "KeyZ"]);
    expect(next.mount).toEqual([]);
    expect(live()).toHaveTextContent("Z was Get on or off your mount. Get on or off your mount has no key now.");
    cleanupRouter();
  });

  it("offers an unbound action a + chip for its first key", () => {
    const keymap: Keymap = { ...defaultKeymap(), follow: [] };
    const { onChange, press, cleanupRouter } = setup({ keymap });
    fireEvent.click(screen.getByRole("button", { name: "Follow your companion: no key yet. Press to choose one." }));
    press("KeyG");
    expect(onChange.mock.calls[0][0].follow).toEqual(["KeyG"]);
    cleanupRouter();
  });

  it("keeps the mouse rows and Esc as plain keycaps", () => {
    const { view, cleanupRouter } = setup();
    const row = (what: RegExp) => screen.getByText(what).closest("li")!;
    expect(within(row(/Zoom in and out/)).queryByRole("button")).toBeNull();
    expect(row(/Zoom in and out/).querySelector("kbd")).toHaveTextContent("Wheel");
    expect(within(row(/^Pause, with Controls/)).getByText("Esc").tagName).toBe("KBD");
    expect(view.container.querySelectorAll("button.r3-kbd.r3-kbd--edit").length).toBeGreaterThan(10);
    cleanupRouter();
  });

  it("is plain keycaps, with no Reset, where there is nowhere to save", () => {
    const { cleanupRouter } = setup({ editable: false });
    expect(screen.queryByRole("button", { name: MOUNT })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset to defaults" })).toBeNull();
    cleanupRouter();
  });
});
