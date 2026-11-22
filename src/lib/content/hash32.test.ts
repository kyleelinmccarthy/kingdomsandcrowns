import { describe, expect, it } from "vitest";
import { hash32, hex8 } from "./hash32";

describe("hex8", () => {
  it("writes a 32-bit number as 8 lower-case hex characters, zero-padded", () => {
    expect(hex8(0)).toBe("00000000");
    expect(hex8(0xabc)).toBe("00000abc");
    expect(hex8(0xffffffff)).toBe("ffffffff");
    expect(hex8(hash32("x"))).toMatch(/^[0-9a-f]{8}$/);
  });
});
