import { describe, it, expect, vi } from "vitest";
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

  it("hands a cast request to the caller, which is the scene's channel for the pointer and the number keys", () => {
    const { result } = renderHook(() => useRealmInput());
    expect(result.current.castRef.current).toBeNull();
    result.current.requestCast({ nearest: true });
    expect(result.current.castRef.current).toEqual({ nearest: true });
    result.current.castRef.current = null;
    result.current.requestCast({ target: { x: 1, z: 2 } });
    expect(result.current.castRef.current).toEqual({ target: { x: 1, z: 2 } });
  });

  it("calls onInteract on E, and not from inside a text control or a dialog", () => {
    const onInteract = vi.fn();
    renderHook(() => useRealmInput({ onInteract }));

    const field = document.createElement("input");
    document.body.appendChild(field);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inDialog = document.createElement("button");
    dialog.appendChild(inDialog);
    document.body.appendChild(dialog);

    for (const target of [field, inDialog]) {
      const blocked = new KeyboardEvent("keydown", { code: "KeyE", key: "e", cancelable: true });
      act(() => {
        Object.defineProperty(blocked, "target", { value: target });
        window.dispatchEvent(blocked);
      });
      expect(onInteract).not.toHaveBeenCalled();
    }

    const event = new KeyboardEvent("keydown", { code: "KeyE", key: "e", cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(onInteract).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    field.remove();
    dialog.remove();
  });

  it("ignores a repeated E from key-repeat and an E held with a modifier", () => {
    const onInteract = vi.fn();
    renderHook(() => useRealmInput({ onInteract }));
    keydown({ code: "KeyE", key: "e", repeat: true });
    keydown({ code: "KeyE", key: "e", ctrlKey: true });
    expect(onInteract).not.toHaveBeenCalled();
    keydown({ code: "KeyE", key: "e" });
    expect(onInteract).toHaveBeenCalledTimes(1);
  });
});
