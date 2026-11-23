import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  actionIndex,
  bind,
  castAction,
  castSlotOf,
  defaultKeymap,
  isBindable,
  keyLabel,
  keymapFrom,
  keymapToStored,
  primaryLabel,
} from "./keymap";

describe("keymap", () => {
  it("defaults are bindable and unique", () => {
    const k = defaultKeymap();
    const all = ACTIONS.flatMap((a) => k[a.id]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every(isBindable)).toBe(true);
    expect(k.mount).toEqual(["KeyZ"]);
    expect(k.map).toEqual(["KeyM"]);
  });

  it("refuses reserved codes", () => {
    for (const c of ["Escape", "Tab", "ControlLeft", "AltLeft", "MetaLeft", "F5", "F12"]) expect(isBindable(c)).toBe(false);
    expect(isBindable("ShiftLeft")).toBe(true);
  });

  it("keymapFrom survives garbage", () => {
    for (const raw of [null, "", "{", "[]", 42, { jump: "Space" }, { nope: ["KeyQ"] }]) expect(keymapFrom(raw)).toEqual(defaultKeymap());
  });

  it("drops reserved and excess codes from an override", () => {
    expect(keymapFrom({ jump: ["Escape", "KeyJ", "KeyK", "KeyL"] }).jump).toEqual(["KeyJ", "KeyK"]);
  });

  it("an override wins a clash with a default; the loser keeps what is left", () => {
    const k = keymapFrom({ jump: ["KeyW"] });
    expect(k.jump).toEqual(["KeyW"]);
    expect(k.walkForward).toEqual(["ArrowUp"]);
  });

  it("two overrides clash: first in table order wins, the other may end up unbound", () => {
    const k = keymapFrom({ jump: ["KeyQ"], interact: ["KeyQ"] });
    expect(k.jump).toEqual(["KeyQ"]);
    expect(k.interact).toEqual([]);
    expect(primaryLabel(k, "interact")).toBe("—");
  });

  it("stores only the diff, and round-trips", () => {
    expect(keymapToStored(defaultKeymap())).toBeNull();
    const k = keymapFrom({ mount: ["KeyM"], map: ["KeyN"] });
    expect(JSON.parse(keymapToStored(k)!)).toEqual({ mount: ["KeyM"], map: ["KeyN"] });
    expect(keymapFrom(keymapToStored(k))).toEqual(k);
  });

  it("bind swaps a taken key and says who moved", () => {
    const r = bind(defaultKeymap(), "mount", 0, "KeyM");
    expect(r).toMatchObject({ ok: true, displaced: "map" });
    if (r.ok) {
      expect(r.keymap.mount).toEqual(["KeyM"]);
      expect(r.keymap.map).toEqual(["KeyZ"]);
    }
  });

  it("bind into slot 1 adds a second key; reserved is refused", () => {
    const r = bind(defaultKeymap(), "jump", 1, "KeyJ");
    expect(r.ok && r.keymap.jump).toEqual(["Space", "KeyJ"]);
    expect(bind(defaultKeymap(), "jump", 0, "Escape")).toEqual({ ok: false, reason: "reserved" });
  });

  it("binding a key to the action that already has it changes nothing", () => {
    const r = bind(defaultKeymap(), "jump", 0, "Space");
    expect(r).toMatchObject({ ok: true, displaced: null });
  });

  it("taking a key from an action's empty second slot just unbinds it there", () => {
    const r = bind(defaultKeymap(), "jump", 1, "KeyE");
    expect(r).toMatchObject({ ok: true, displaced: "interact" });
    if (r.ok) {
      expect(r.keymap.jump).toEqual(["Space", "KeyE"]);
      expect(r.keymap.interact).toEqual([]);
    }
  });

  it("moving a key between an action's own slots swaps them", () => {
    const r = bind(defaultKeymap(), "walkForward", 0, "ArrowUp");
    expect(r).toMatchObject({ ok: true, displaced: null });
    if (r.ok) expect(r.keymap.walkForward).toEqual(["ArrowUp", "KeyW"]);
  });

  it("asking for a second key the action already holds as its first changes nothing", () => {
    const r = bind(defaultKeymap(), "jump", 1, "Space");
    expect(r).toMatchObject({ ok: true, displaced: null });
    if (r.ok) expect(r.keymap.jump).toEqual(["Space"]);
  });

  it("labels", () => {
    expect([keyLabel("KeyZ"), keyLabel("Digit3"), keyLabel("ArrowUp"), keyLabel("Space"), keyLabel("ShiftLeft"), keyLabel("Numpad4")]).toEqual([
      "Z",
      "3",
      "↑",
      "Space",
      "Left Shift",
      "Num 4",
    ]);
  });

  it("index and casts", () => {
    expect(actionIndex(defaultKeymap()).get("KeyZ")).toBe("mount");
    expect(castAction(3)).toBe("cast3");
    expect(castAction(0)).toBeNull();
    expect(castSlotOf("cast7")).toBe(7);
    expect(castSlotOf("jump")).toBe(0);
  });

  it("only the four walks are held", () => {
    expect(ACTIONS.filter((a) => a.hold).map((a) => a.id)).toEqual(["walkForward", "walkBack", "strafeLeft", "strafeRight"]);
  });
});
