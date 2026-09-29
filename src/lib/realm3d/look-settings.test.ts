import { describe, expect, it } from "vitest";
import { readLook } from "./look-settings";

describe("readLook — what this computer kept for its mouse, made safe", () => {
  it("is the scene's own speed, not inverted, when nothing was kept", () => {
    expect(readLook(null)).toEqual({ sensitivity: 1, invertY: false });
  });

  it("reads back what was kept", () => {
    expect(readLook('{"sensitivity":2,"invertY":true}')).toEqual({ sensitivity: 2, invertY: true });
    expect(readLook('{"sensitivity":0.5,"invertY":false}')).toEqual({ sensitivity: 0.5, invertY: false });
  });

  it("falls back to the defaults for anything unreadable", () => {
    expect(readLook("not json")).toEqual({ sensitivity: 1, invertY: false });
    expect(readLook("[1,2]")).toEqual({ sensitivity: 1, invertY: false });
    expect(readLook('{"sensitivity":"fast","invertY":"yes"}')).toEqual({ sensitivity: 1, invertY: false });
    expect(readLook('{"sensitivity":null}')).toEqual({ sensitivity: 1, invertY: false });
  });

  it("keeps the speed between a quarter and three times, on quarter steps", () => {
    expect(readLook('{"sensitivity":9}').sensitivity).toBe(3);
    expect(readLook('{"sensitivity":0}').sensitivity).toBe(0.25);
    expect(readLook('{"sensitivity":-4}').sensitivity).toBe(0.25);
    expect(readLook('{"sensitivity":1.3}').sensitivity).toBe(1.25);
    expect(readLook('{"sensitivity":1.4}').sensitivity).toBe(1.5);
  });

  it("keeps the other setting when one is missing", () => {
    expect(readLook('{"invertY":true}')).toEqual({ sensitivity: 1, invertY: true });
    expect(readLook('{"sensitivity":1.75}')).toEqual({ sensitivity: 1.75, invertY: false });
  });
});
