import { afterEach, describe, expect, it } from "vitest";
import { deviceStorage } from "./device-storage";

const own = Object.getOwnPropertyDescriptor(window, "localStorage");
afterEach(() => {
  if (own) Object.defineProperty(window, "localStorage", own);
  else delete (window as { localStorage?: Storage }).localStorage;
});

describe("deviceStorage", () => {
  it("is this device's localStorage when the browser allows it", () => {
    expect(deviceStorage()).toBe(window.localStorage);
  });

  it("is null, not an error, when the browser refuses it (blocked site data, some private windows)", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    expect(deviceStorage()).toBeNull();
  });
});
