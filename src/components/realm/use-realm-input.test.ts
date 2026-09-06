import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRealmInput } from "./use-realm-input";

function keydown(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }));
  });
}

describe("useRealmInput", () => {
  it("moves the axis when a movement key is held", () => {
    const { result } = renderHook(() => useRealmInput());
    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });

    keydown({ code: "KeyD" });

    expect(result.current.axisRef.current.x).not.toBe(0);
    expect(result.current.axisRef.current.z).not.toBe(0);
  });

  it("clears the held keys when the window loses focus", () => {
    const { result } = renderHook(() => useRealmInput());

    keydown({ code: "KeyD" });
    expect(result.current.axisRef.current).not.toEqual({ x: 0, z: 0 });

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
  });

  it("ignores a movement key held with a modifier", () => {
    const { result } = renderHook(() => useRealmInput());

    keydown({ code: "KeyD", ctrlKey: true });

    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
  });

  it("ignores keys and clears held ones while disabled", () => {
    const { result, rerender } = renderHook(({ enabled }) => useRealmInput({ enabled }), { initialProps: { enabled: true } });
    keydown({ code: "KeyD" });
    expect(result.current.axisRef.current.x).not.toBe(0);
    rerender({ enabled: false });
    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
    keydown({ code: "KeyD" });
    expect(result.current.axisRef.current).toEqual({ x: 0, z: 0 });
    rerender({ enabled: true });
    keydown({ code: "KeyD" });
    expect(result.current.axisRef.current.x).not.toBe(0);
  });
});
