import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bind, defaultKeymap } from "@/lib/realm3d/keymap";
import { createInputRouter, type ActionEvent } from "@/lib/realm3d/input-router";
import type { ReactNode } from "react";
import { RealmInputProvider, useAction, useKeymap, useRealmInput } from "./realm-input";

/* The router is the real one, on a window-like target the test fires at directly. */
function target() {
  const on = new Map<string, Set<(e: never) => void>>();
  return {
    addEventListener(type: string, fn: (e: never) => void) {
      if (!on.has(type)) on.set(type, new Set());
      on.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: never) => void) {
      on.get(type)?.delete(fn);
    },
    fire(type: string, e: Record<string, unknown> = {}) {
      const ev = { preventDefault: () => {}, target: null, repeat: false, ...e };
      for (const fn of [...(on.get(type) ?? [])]) fn(ev as never);
    },
  };
}

function setup() {
  const win = target();
  const router = createInputRouter(win, defaultKeymap());
  const press = (code: string) => act(() => win.fire("keydown", { code }));
  return { win, router, press };
}

afterEach(cleanup);

describe("useAction", () => {
  it("hears a key go down in its scope, and stops hearing once unmounted", () => {
    const { router, press } = setup();
    const fn = vi.fn();
    const { unmount } = renderHook(() => useAction(router, "jump", fn, "island"));
    press("Space");
    expect(fn).toHaveBeenCalledWith({ action: "jump", down: true, repeat: false } satisfies ActionEvent);
    unmount();
    press("Space");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses the newest fn without subscribing again", () => {
    const { router, press } = setup();
    const on = vi.spyOn(router, "on");
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useAction(router, ["walkForward", "jump"], fn, "play"), { initialProps: { fn: first } });
    rerender({ fn: second });
    press("KeyW");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ action: "walkForward", down: true, repeat: false });
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("hears nothing while not enabled", () => {
    const { router, press } = setup();
    const fn = vi.fn();
    const { rerender } = renderHook(({ on }) => useAction(router, "interact", fn, "play", on), { initialProps: { on: false } });
    press("KeyE");
    expect(fn).not.toHaveBeenCalled();
    rerender({ on: true });
    press("KeyE");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("useKeymap", () => {
  it("re-renders with the new keymap after setKeymap", () => {
    const { router } = setup();
    function Jump() {
      return <span data-testid="jump">{useKeymap(router).jump.join(",")}</span>;
    }
    render(<Jump />);
    expect(screen.getByTestId("jump").textContent).toBe("Space");
    const r = bind(router.keymap, "jump", 0, "KeyJ");
    if (!r.ok) throw new Error("bind refused");
    act(() => router.setKeymap(r.keymap));
    expect(screen.getByTestId("jump").textContent).toBe("KeyJ");
  });
});

describe("useRealmInput", () => {
  it("gives the provided router", () => {
    const { router } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => <RealmInputProvider router={router}>{children}</RealmInputProvider>;
    const { result } = renderHook(() => useRealmInput(), { wrapper });
    expect(result.current).toBe(router);
  });

  it("throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRealmInput())).toThrow();
  });
});
