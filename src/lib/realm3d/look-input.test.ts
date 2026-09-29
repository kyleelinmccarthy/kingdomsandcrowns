import { describe, expect, it, vi } from "vitest";
import { LOCK_RETRY_MS, mouseLook, type LookDoc, type LookEl } from "./look-input";

/* A document and a canvas, faked down to what the browser gives this module. */

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

function canvas(refuse = false) {
  return Object.assign(target(), {
    isConnected: true,
    requestPointerLock: vi.fn(() => (refuse ? Promise.reject(new DOMException("The user has exited the lock", "SecurityError")) : Promise.resolve())),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
}

function page() {
  return Object.assign(target(), { pointerLockElement: null as unknown, exitPointerLock: vi.fn() });
}

type Canvas = ReturnType<typeof canvas>;
type Page = ReturnType<typeof page>;

/** The browser granting (or ending) the capture: it moves the lock, then says so. */
function lockTo(doc: Page, el: Canvas | null) {
  doc.pointerLockElement = el;
  doc.fire("pointerlockchange");
}

function rig(opts: { refuse?: boolean; doc?: Page; paused?: boolean } = {}) {
  const el = canvas(opts.refuse);
  const doc = opts.doc ?? page();
  const looks: [number, number][] = [];
  const zooms: number[] = [];
  const state = { paused: opts.paused ?? false };
  const freed = vi.fn();
  const queued: { fn: () => void; ms: number }[] = [];
  const look = mouseLook(el as unknown as LookEl, doc as unknown as LookDoc, {
    sink: (dx, dy) => looks.push([dx, dy]),
    zoom: (d) => zooms.push(d),
    paused: () => state.paused,
    freed,
    later: (fn, ms) => queued.push({ fn, ms }),
  });
  return { el, doc, look, looks, zooms, state, freed, queued };
}

/** Let a promise the module was handed settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("capturing the mouse, as in Minecraft", () => {
  it("captures it when the child clicks the world", () => {
    const { el } = rig();
    el.fire("pointerdown", { button: 0, pointerId: 1 });
    expect(el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("captures nothing while a panel is open", () => {
    const { el } = rig({ paused: true });
    el.fire("pointerdown", { button: 0, pointerId: 1 });
    expect(el.requestPointerLock).not.toHaveBeenCalled();
  });

  it("turns the camera as the captured mouse moves, with no button held", () => {
    const { el, doc, look, looks } = rig();
    el.fire("pointerdown", { button: 0, pointerId: 1 });
    lockTo(doc, el);
    expect(look.captured).toBe(true);
    doc.fire("mousemove", { movementX: 12, movementY: -4, buttons: 0 });
    doc.fire("mousemove", { movementX: -3, movementY: 0, buttons: 0 });
    expect(looks).toEqual([
      [12, -4],
      [-3, 0],
    ]);
  });

  it("turns nothing while the game is paused, captured or not", () => {
    const { el, doc, looks, state } = rig();
    lockTo(doc, el);
    state.paused = true;
    doc.fire("mousemove", { movementX: 12, movementY: 3 });
    expect(looks).toEqual([]);
  });

  it("ignores the mouse moving over a page it has not captured", () => {
    const { doc, looks } = rig();
    doc.fire("mousemove", { movementX: 12, movementY: 3 });
    expect(looks).toEqual([]);
  });
});

describe("letting go of it", () => {
  it("tells the frame when the browser frees it while the child is playing: that was Esc", () => {
    const { el, doc, look, freed } = rig();
    lockTo(doc, el);
    lockTo(doc, null);
    expect(look.captured).toBe(false);
    expect(freed).toHaveBeenCalledTimes(1);
  });

  it("lets go of it when a panel opens, once, and that is no Esc", () => {
    const { el, doc, look, state, freed } = rig();
    lockTo(doc, el);
    look.tick(false);
    state.paused = true;
    look.tick(true);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    lockTo(doc, null);
    look.tick(true);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(freed).not.toHaveBeenCalled();
  });

  it("keeps a capture that arrives while the panel it resumed from is still closing", () => {
    // Resume asks for the capture from its click; the browser can grant it before the frame has
    // written `paused` false. Letting go of it then would undo the child's own click.
    const { el, doc, look, state } = rig();
    state.paused = true;
    look.tick(true);
    look.request();
    lockTo(doc, el);
    look.tick(true);
    state.paused = false;
    look.tick(false);
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    expect(look.captured).toBe(true);
  });
});

describe("when the browser says no", () => {
  it("leaves the mouse free, and asks once more after the browser's cooldown", async () => {
    const { el, look, queued } = rig({ refuse: true });
    look.request();
    await settle();
    expect(look.captured).toBe(false);
    expect(queued).toHaveLength(1);
    expect(queued[0].ms).toBe(LOCK_RETRY_MS);
    expect(LOCK_RETRY_MS).toBeGreaterThanOrEqual(1000);
    queued[0].fn();
    expect(el.requestPointerLock).toHaveBeenCalledTimes(2);
    await settle();
    // Refused twice: the child's next click is the next try, not a loop.
    expect(queued).toHaveLength(1);
  });

  it("hears a refusal the old way too, from the document, and still asks only once more", async () => {
    const { el, doc, look, queued } = rig();
    el.requestPointerLock.mockImplementation(() => undefined as never);
    look.request();
    doc.fire("pointerlockerror");
    doc.fire("pointerlockerror");
    expect(queued).toHaveLength(1);
  });

  it("does not ask again if the game was paused in the meantime", async () => {
    const { el, look, queued, state } = rig({ refuse: true });
    look.request();
    await settle();
    state.paused = true;
    queued[0].fn();
    expect(el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending retry on dispose, so a torn-down canvas is never asked again", async () => {
    const { el, look, queued } = rig({ refuse: true });
    el.fire("pointerdown", { button: 0, pointerId: 1 });
    await settle();
    expect(el.requestPointerLock).toHaveBeenCalledTimes(1);
    look.dispose();
    for (const q of queued) q.fn();
    expect(el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("plays on without Pointer Lock at all: a click asks nothing and throws nothing, and the right button still looks", () => {
    const { el, doc, looks } = rig();
    delete (el as { requestPointerLock?: unknown }).requestPointerLock;
    expect(() => el.fire("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0 })).not.toThrow();
    expect(doc.pointerLockElement).toBeNull();
    el.fire("pointerdown", { button: 2, pointerId: 2, clientX: 100, clientY: 100 });
    el.fire("pointermove", { pointerId: 2, clientX: 130, clientY: 100 });
    expect(looks).toEqual([[30, 0]]);
  });
});

describe("looking with the right button while the mouse is free, as in World of Warcraft", () => {
  it("turns the camera while the right button drags, and stops when it comes up", () => {
    const { el, look, looks } = rig();
    el.fire("pointerdown", { button: 2, pointerId: 7, clientX: 100, clientY: 50 });
    expect(look.dragging).toBe(true);
    expect(el.setPointerCapture).toHaveBeenCalledWith(7);
    el.fire("pointermove", { pointerId: 7, clientX: 130, clientY: 45 });
    el.fire("pointerup", { pointerId: 7 });
    el.fire("pointermove", { pointerId: 7, clientX: 170, clientY: 45 });
    expect(looks).toEqual([[30, -5]]);
    expect(look.dragging).toBe(false);
    // ...and it never asked for the capture: the HUD stays clickable.
    expect(el.requestPointerLock).not.toHaveBeenCalled();
  });

  it("does not turn the camera for a free mouse passing over the world", () => {
    const { el, looks } = rig();
    el.fire("pointermove", { pointerId: 1, clientX: 130, clientY: 45 });
    expect(looks).toEqual([]);
  });

  it("keeps the right button's menu off the world", () => {
    const { el } = rig();
    expect(el.fire("contextmenu").preventDefault).toHaveBeenCalled();
  });
});

describe("the wheel", () => {
  it("zooms, a line at a time or a pixel at a time, and not under a panel", () => {
    const { el, zooms, state } = rig();
    el.fire("wheel", { deltaY: 100, deltaMode: 0 });
    el.fire("wheel", { deltaY: 3, deltaMode: 1 });
    state.paused = true;
    el.fire("wheel", { deltaY: 100, deltaMode: 0 });
    expect(zooms).toEqual([100, 99]);
  });
});

describe("going through a door with the mouse captured", () => {
  it("a room that opens while the island holds the capture takes it over, and that is no Esc", () => {
    const doc = page();
    const island = rig({ doc });
    lockTo(doc, island.el);
    const room = rig({ doc });
    expect(room.el.requestPointerLock).toHaveBeenCalledTimes(1);
    lockTo(doc, room.el);
    expect(room.look.captured).toBe(true);
    expect(island.look.captured).toBe(false);
    expect(island.freed).not.toHaveBeenCalled();
  });

  it("a room that closes while captured hands the capture back to the island", () => {
    const doc = page();
    const island = rig({ doc });
    const room = rig({ doc });
    lockTo(doc, room.el);
    // The room's canvas goes: the browser drops the capture with it.
    room.el.isConnected = false;
    room.look.dispose();
    lockTo(doc, null);
    expect(room.freed).not.toHaveBeenCalled();
    island.look.tick(false);
    expect(island.el.requestPointerLock).toHaveBeenCalledTimes(1);
    island.look.tick(false);
    expect(island.el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("hands it back however the browser orders the goodbye", () => {
    const doc = page();
    const island = rig({ doc });
    const room = rig({ doc });
    lockTo(doc, room.el);
    // This time the browser drops the capture before the room has cleaned up.
    room.el.isConnected = false;
    lockTo(doc, null);
    room.look.dispose();
    expect(room.freed).not.toHaveBeenCalled();
    island.look.tick(false);
    expect(island.el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("does not capture the mouse again for a child who freed it in the room", () => {
    const doc = page();
    const island = rig({ doc });
    const room = rig({ doc });
    lockTo(doc, room.el);
    lockTo(doc, null); // Esc, in the room
    expect(room.freed).toHaveBeenCalledTimes(1);
    room.el.isConnected = false;
    room.look.dispose();
    island.look.tick(false);
    expect(island.el.requestPointerLock).not.toHaveBeenCalled();
  });

  it("a Realm that unmounted while captured does not make the next visit capture on its own", () => {
    const doc = page();
    const first = rig({ doc });
    lockTo(doc, first.el);
    // The whole Realm goes (time up, browser Back): dispose, then the browser drops the lock.
    first.look.dispose();
    lockTo(doc, null);
    const next = rig({ doc });
    next.look.tick(false);
    expect(next.el.requestPointerLock).not.toHaveBeenCalled();
  });

  it("leaves nothing listening behind it", () => {
    const { el, doc, look } = rig();
    look.dispose();
    expect(el.listeners()).toBe(0);
    expect(doc.listeners()).toBe(0);
  });
});
