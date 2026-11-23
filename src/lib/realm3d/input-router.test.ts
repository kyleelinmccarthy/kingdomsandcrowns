import { describe, expect, it, vi } from "vitest";
import { bind, defaultKeymap, type ActionId } from "./keymap";
import { blockedTarget, createInputRouter, seedMoves, type ActionEvent, type Scope } from "./input-router";

/* A window, faked down to the three listeners the router adds. */

type Fired = { preventDefault: ReturnType<typeof vi.fn> } & Record<string, unknown>;

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
    fire(type: string, e: Record<string, unknown> = {}): Fired {
      const ev = { preventDefault: vi.fn(), ...e };
      for (const fn of [...(on.get(type) ?? [])]) fn(ev as never);
      return ev;
    },
    listeners(): number {
      let n = 0;
      for (const s of on.values()) n += s.size;
      return n;
    },
  };
}

type Win = ReturnType<typeof target>;

function setup() {
  const win = target();
  const router = createInputRouter(win, defaultKeymap());
  router.start();
  return { win, router };
}

function down(win: Win, code: string, extra: Record<string, unknown> = {}) {
  return win.fire("keydown", { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, target: null, ...extra });
}

function up(win: Win, code: string, extra: Record<string, unknown> = {}) {
  return win.fire("keyup", { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, target: null, ...extra });
}

function listen(router: ReturnType<typeof setup>["router"], action: ActionId | ActionId[], scope: Scope) {
  const fn = vi.fn<(e: ActionEvent) => void>();
  router.on(action, fn, scope);
  return fn;
}

const PLAY = { overlay: false, inside: false };

describe("the input router", () => {
  it("delivers a bound key down in scope island as an action, and prevents the default", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "island");
    const ev = down(win, "KeyW");
    expect(fn).toHaveBeenCalledWith({ action: "walkForward", down: true, repeat: false });
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it("never prevents an unbound key, and it reaches nobody", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, ["walkForward", "jump", "map"], "always");
    const ev = down(win, "KeyQ");
    expect(fn).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("hears island keys only outside, and room and play keys inside", () => {
    const { win, router } = setup();
    router.setState({ overlay: false, inside: true });
    const island = listen(router, "interact", "island");
    const room = listen(router, "interact", "room");
    const play = listen(router, "interact", "play");
    down(win, "KeyE");
    expect(island).not.toHaveBeenCalled();
    expect(room).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);

    router.setState(PLAY);
    up(win, "KeyE");
    island.mockClear();
    room.mockClear();
    play.mockClear();
    down(win, "KeyE");
    expect(island).toHaveBeenCalledTimes(1);
    expect(room).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("gives an open overlay only the always subscribers, and prevents nothing", () => {
    const { win, router } = setup();
    router.setState({ overlay: true, inside: false });
    const island = listen(router, "map", "island");
    const room = listen(router, "map", "room");
    const play = listen(router, "map", "play");
    const always = listen(router, "map", "always");
    const ev = down(win, "KeyM");
    expect(island).not.toHaveBeenCalled();
    expect(room).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(always).toHaveBeenCalledTimes(1);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("delivers a key up to every subscriber whatever the scope and state", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const island = listen(router, "walkForward", "island");
    down(win, "KeyW");
    router.setState({ overlay: true, inside: true });
    up(win, "KeyW");
    expect(island).toHaveBeenLastCalledWith({ action: "walkForward", down: false, repeat: false });
  });

  it("ignores a key with ctrl, alt or meta held", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, ["walkForward"], "always");
    for (const mod of ["ctrlKey", "altKey", "metaKey"]) {
      const ev = down(win, "KeyW", { [mod]: true });
      expect(ev.preventDefault).not.toHaveBeenCalled();
      up(win, "KeyW");
    }
    fn.mockClear();
    for (const mod of ["ctrlKey", "altKey", "metaKey"]) down(win, "KeyW", { [mod]: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it("ignores a key typed into a field, in every scope", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const input = document.createElement("input");
    input.type = "text";
    const fns = (["island", "room", "play", "always"] as const).map((s) => listen(router, "walkForward", s));
    const ev = down(win, "KeyW", { target: input });
    for (const fn of fns) expect(fn).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("lets always hear a key inside a dialog, and play not", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    const always = listen(router, "map", "always");
    const play = listen(router, "map", "play");
    down(win, "KeyM", { target: button });
    expect(always).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("drops an auto-repeat for jump and keeps it for walkForward", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const jump = listen(router, "jump", "play");
    const walk = listen(router, "walkForward", "play");
    down(win, "Space", { repeat: true });
    down(win, "KeyW", { repeat: true });
    expect(jump).not.toHaveBeenCalled();
    expect(walk).toHaveBeenCalledWith({ action: "walkForward", down: true, repeat: true });
  });

  it("releases a held action whose key was rebound away, and stops reporting it held", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "play");
    down(win, "KeyW");
    down(win, "ArrowUp");
    expect(router.held("walkForward")).toBe(true);
    const moved = bind(router.keymap, "walkForward", 0, "KeyI");
    const moved2 = moved.ok ? bind(moved.keymap, "walkForward", 1, "KeyO") : moved;
    if (!moved2.ok) throw new Error("bind refused");
    fn.mockClear();
    router.setKeymap(moved2.keymap);
    expect(fn).toHaveBeenCalledWith({ action: "walkForward", down: false, repeat: false });
    expect(router.held("walkForward")).toBe(false);
  });

  it("keeps an action held while another of its keys is still down", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "play");
    down(win, "KeyW");
    down(win, "ArrowUp");
    const moved = bind(router.keymap, "walkForward", 0, "KeyI");
    if (!moved.ok) throw new Error("bind refused");
    fn.mockClear();
    router.setKeymap(moved.keymap);
    expect(fn).not.toHaveBeenCalled();
    expect(router.held("walkForward")).toBe(true);
  });

  it("records no held key for a Cmd+key down, whose key up macOS never sends", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    down(win, "KeyA", { metaKey: true });
    expect(router.held("strafeLeft")).toBe(false);
    const k = { f: false, b: false, l: false, r: false };
    seedMoves(router, k);
    expect(k.l).toBe(false);
  });

  it("walks on while one of an action's two keys is still down, and stops when the last comes up", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "play");
    down(win, "KeyW");
    down(win, "ArrowUp");
    fn.mockClear();
    up(win, "KeyW");
    expect(fn).not.toHaveBeenCalled();
    expect(router.held("walkForward")).toBe(true);
    up(win, "ArrowUp");
    expect(fn).toHaveBeenCalledWith({ action: "walkForward", down: false, repeat: false });
    expect(router.held("walkForward")).toBe(false);
  });

  it("prevents a bound key's key up while playing, so Space does not press a focused button", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    down(win, "Space");
    expect(up(win, "Space").preventDefault).toHaveBeenCalled();
    // An unbound key, an open overlay, or a rebind listening: the key up is left alone.
    expect(up(win, "KeyQ").preventDefault).not.toHaveBeenCalled();
    router.setState({ overlay: true, inside: false });
    expect(up(win, "Space").preventDefault).not.toHaveBeenCalled();
    router.setState(PLAY);
    router.suspend(true);
    expect(up(win, "Space").preventDefault).not.toHaveBeenCalled();
  });

  it("tells onKeymap listeners about a new keymap, until they unsubscribe", () => {
    const { router } = setup();
    const fn = vi.fn();
    const off = router.onKeymap(fn);
    const next = bind(router.keymap, "jump", 0, "KeyJ");
    if (!next.ok) throw new Error("bind refused");
    router.setKeymap(next.keymap);
    expect(fn).toHaveBeenCalledWith(next.keymap);
    expect(router.keymap).toBe(next.keymap);
    off();
    router.setKeymap(defaultKeymap());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("delivers and prevents nothing while suspended, but still tracks held keys", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "always");
    router.suspend(true);
    const ev = down(win, "KeyW");
    expect(fn).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(router.held("walkForward")).toBe(true);
    up(win, "KeyW");
    expect(fn).not.toHaveBeenCalled();
    expect(router.held("walkForward")).toBe(false);
  });

  it("releases what was held when it is suspended", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "play");
    down(win, "KeyW");
    fn.mockClear();
    router.suspend(true);
    expect(fn).toHaveBeenCalledWith({ action: "walkForward", down: false, repeat: false });
  });

  it("releases every held action when the window loses focus", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const walk = listen(router, "walkForward", "island");
    const back = listen(router, "walkBack", "play");
    down(win, "KeyW");
    down(win, "KeyS");
    walk.mockClear();
    back.mockClear();
    win.fire("blur");
    expect(walk).toHaveBeenCalledWith({ action: "walkForward", down: false, repeat: false });
    expect(back).toHaveBeenCalledWith({ action: "walkBack", down: false, repeat: false });
    expect(router.held("walkForward")).toBe(false);
    expect(router.held("walkBack")).toBe(false);
  });

  it("seeds a move from a held key, and never clears one", () => {
    const { win, router } = setup();
    down(win, "ArrowUp");
    const k = { f: false, b: true, l: false, r: false };
    seedMoves(router, k);
    expect(k).toEqual({ f: true, b: true, l: false, r: false });
  });

  it("removes every listener when disposed", () => {
    const { win, router } = setup();
    expect(win.listeners()).toBe(3);
    router.dispose();
    expect(win.listeners()).toBe(0);
  });
});

describe("the router's life", () => {
  it("listens to nothing until started, so a router React makes and throws away leaks nothing", () => {
    const win = target();
    const router = createInputRouter(win, defaultKeymap());
    expect(win.listeners()).toBe(0);
    const fn = listen(router, "jump", "always");
    down(win, "Space");
    expect(fn).not.toHaveBeenCalled();
    router.start();
    expect(win.listeners()).toBe(3);
    down(win, "Space");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops listening on stop, keeps its subscribers, and listens again on the next start", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "jump", "play");
    router.stop();
    expect(win.listeners()).toBe(0);
    down(win, "Space");
    expect(fn).not.toHaveBeenCalled();
    router.start();
    expect(win.listeners()).toBe(3);
    down(win, "Space");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a second start adds nothing, a second stop removes nothing", () => {
    const { win, router } = setup();
    router.start();
    expect(win.listeners()).toBe(3);
    router.stop();
    router.stop();
    expect(win.listeners()).toBe(0);
    router.start();
    router.start();
    expect(win.listeners()).toBe(3);
  });

  it("lets go of what was held when it stops, since it can no longer hear the key come up", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = listen(router, "walkForward", "play");
    down(win, "KeyW");
    fn.mockClear();
    router.stop();
    expect(fn).toHaveBeenCalledWith({ action: "walkForward", down: false, repeat: false });
    expect(router.held("walkForward")).toBe(false);
  });

  it("stops delivering to a subscriber that unsubscribed", () => {
    const { win, router } = setup();
    router.setState(PLAY);
    const fn = vi.fn();
    const off = router.on("jump", fn, "play");
    off();
    down(win, "Space");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("blockedTarget", () => {
  it("blocks a text field in every scope and a dialog in every scope but always", () => {
    const input = document.createElement("textarea");
    expect(blockedTarget(input, "always")).toBe(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("span");
    dialog.appendChild(inner);
    expect(blockedTarget(inner, "play")).toBe(true);
    expect(blockedTarget(inner, "always")).toBe(false);
    expect(blockedTarget(null, "play")).toBe(false);
  });
});
