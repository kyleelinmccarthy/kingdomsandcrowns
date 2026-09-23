import { afterEach, describe, expect, it } from "vitest";
import { holdKeys, isHeld, seedMoves } from "./held-keys";

const press = (code: string, type: "keydown" | "keyup") => window.dispatchEvent(new KeyboardEvent(type, { code }));

describe("keys held through a doorway", () => {
  let stop = () => {};
  afterEach(() => stop());

  it("hears a key that went down before the new side was listening, and seeds it", () => {
    stop = holdKeys();
    press("KeyW", "keydown");
    press("KeyD", "keydown");
    const k = { f: false, b: false, l: false, r: false };
    seedMoves(k);
    expect(k).toEqual({ f: true, b: false, l: false, r: true });
    press("KeyW", "keyup");
    expect(isHeld("KeyW")).toBe(false);
  });

  it("never turns a key off, and forgets everything when the window loses focus", () => {
    stop = holdKeys();
    press("ArrowUp", "keydown");
    window.dispatchEvent(new Event("blur"));
    const k = { f: false, b: true, l: false, r: false };
    seedMoves(k);
    expect(k).toEqual({ f: false, b: true, l: false, r: false });
  });

  it("is reference counted", () => {
    const a = holdKeys();
    const b = holdKeys();
    a();
    press("KeyS", "keydown");
    expect(isHeld("KeyS")).toBe(true);
    b();
    expect(isHeld("KeyS")).toBe(false);
  });
});
