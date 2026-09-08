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

  it("turns Space into a nearest-target cast request only while casting is enabled", () => {
    const { result, rerender } = renderHook(({ castEnabled }) => useRealmInput({ castEnabled }), { initialProps: { castEnabled: false } });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    expect(result.current.castRef.current).toBeNull();
    rerender({ castEnabled: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    expect(result.current.castRef.current).toEqual({ nearest: true });
    result.current.castRef.current = null;
    result.current.requestCast({ target: { x: 1, z: 2 } });
    expect(result.current.castRef.current).toEqual({ target: { x: 1, z: 2 } });
  });

  it("casts on Space from a focused spell-bar button, but not from a button elsewhere", () => {
    const { result } = renderHook(() => useRealmInput({ castEnabled: true }));

    const bar = document.createElement("div");
    bar.className = "realm-spellbar";
    const barButton = document.createElement("button");
    bar.appendChild(barButton);
    document.body.appendChild(bar);

    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);

    let event = new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true });
    act(() => {
      Object.defineProperty(event, "target", { value: outsideButton });
      window.dispatchEvent(event);
    });
    expect(result.current.castRef.current).toBeNull();

    event = new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true });
    act(() => {
      Object.defineProperty(event, "target", { value: barButton });
      window.dispatchEvent(event);
    });
    expect(result.current.castRef.current).toEqual({ nearest: true });
    expect(event.defaultPrevented).toBe(true);

    bar.remove();
    outsideButton.remove();
  });

  it("ignores a repeated Space from key-repeat", () => {
    const { result } = renderHook(() => useRealmInput({ castEnabled: true }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", repeat: true }));
    });
    expect(result.current.castRef.current).toBeNull();
  });
});
