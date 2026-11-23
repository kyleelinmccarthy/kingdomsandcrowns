/**
 * THE MOUSE, AS A SOURCE OF LOOKS — capture as in Minecraft, drags as in World of Warcraft.
 *
 * One input source with one output: `sink(dx, dy, mode)`, in screen pixels, right and down
 * positive. What a look DOES to the camera is `lookBy` in `controls.ts`, the other side of that
 * interface; this module only knows the browser. It is handed its canvas and its document rather
 * than reaching for globals, so every rule below is tested against a fake of each, with no browser.
 *
 * Every look is one of two kinds. A `"turn"` swings the camera and the hero turns to follow it. An
 * `"orbit"` swings the camera round the hero and the hero stays as they are, so a child can see
 * their own face (`orbiting`, and `looking` in `controls.ts`).
 *
 *   - A click on the world captures the mouse (Pointer Lock). From then on every move turns the
 *     camera, with no button held. The capture is asked for when the button comes UP, once the
 *     press is known to be a click: the press itself is the user activation the browser wants, and
 *     it is still fresh when the button comes up.
 *   - While the mouse is free, the LEFT button pressed and dragged further than `CLICK_SLOP`
 *     orbits instead, and captures nothing when it comes up. The canvas holds the pointer capture
 *     for the whole press, so a drag let go of over the HUD ends here and clicks nothing there.
 *   - With the mouse captured, holding the left button orbits too, until it comes up.
 *   - While the mouse is free, the RIGHT button held down and dragged turns the camera. It never
 *     captures, so the HUD stays clickable: a child can look round and then reach for a spell
 *     without first having to let the mouse go. One button drags at a time: the other is ignored
 *     until it comes up.
 *   - Esc frees a captured mouse, and the browser swallows that Esc — the page never hears it. So
 *     a capture lost while the game is playing is reported (`freed`), and the frame opens the pause
 *     menu on it, exactly as Esc would have.
 *   - A panel opening (anything that pauses the game) lets go of the mouse, so the panel can be
 *     clicked. That is not an Esc and is not reported. Resume asks for the capture again from its
 *     own click (`request`), which the browser allows. A panel that took the mouse gives it back on
 *     the frame it closes (whatever closed it: Resume, a dialogue's last line, a deed board's X,
 *     Esc, E or code): re-locking after the page's own `exitPointerLock()` needs no user
 *     activation, so it is not only a click that recaptures. A panel that opened over a free mouse
 *     captures nothing.
 *   - The browser may say no: straight after an Esc, Chrome refuses a new capture for about a
 *     second. A refusal is never an error here. The mouse simply stays free, and the capture is
 *     asked for once more after `LOCK_RETRY_MS` if the game is still being played; after that the
 *     child's next click is the next try.
 *   - The capture goes through doors. A room's canvas that opens while the island holds the mouse
 *     takes the capture over (a document already captured may move it without a click), and a room
 *     that closes while it holds it hands it back to whichever canvas plays next. A child who freed
 *     the mouse inside is not captured again for walking out.
 *
 * Nothing here allocates per event.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- DOM events, typed at the edge by hand. */

/** What a look does to the hero: `"turn"` turns them to follow the camera, `"orbit"` leaves them be. */
export type LookMode = "turn" | "orbit";

/** Where looks go: screen pixels, right and down positive. */
export type LookSink = (dxPx: number, dyPx: number, mode: LookMode) => void;

/** How far, in px, a left press may wander and still be a click (a capture), not a drag (an orbit). */
export const CLICK_SLOP = 4;

/** The part of a canvas this needs. */
export type LookEl = {
  addEventListener(type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: any) => void): void;
  requestPointerLock?: () => unknown;
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
  hasPointerCapture?(id: number): boolean;
  isConnected?: boolean;
};

/** The part of a document this needs. */
export type LookDoc = {
  addEventListener(type: string, fn: (e: any) => void): void;
  removeEventListener(type: string, fn: (e: any) => void): void;
  pointerLockElement: unknown;
  exitPointerLock(): void;
};

export type MouseLookOptions = {
  sink: LookSink;
  /** A wheel event's `deltaY`, in pixels. */
  zoom: (deltaY: number) => void;
  /** Whether a panel has the child's attention right now. */
  paused: () => boolean;
  /** The browser freed a captured mouse while the game was being played: that was Esc. */
  freed: () => void;
  /** `setTimeout`, handed in so the retry can be tested. */
  later?: (fn: () => void, ms: number) => void;
};

export type MouseLook = {
  /** The mouse is captured by this canvas. */
  readonly captured: boolean;
  /** The right button is dragging the camera (a turn). */
  readonly dragging: boolean;
  /** The left button is swinging the camera round the hero: a free drag, or held while captured. */
  readonly orbiting: boolean;
  /** Ask for the capture: from a click, or to take over one held elsewhere in the document. */
  request(): void;
  /** Once a frame: lets go when a panel opens, and takes back a capture handed over by a room. */
  tick(paused: boolean): void;
  dispose(): void;
};

/** How long Chrome refuses a new capture after Esc freed one, with a margin. */
export const LOCK_RETRY_MS = 1100;

/**
 * Some Windows and Chrome setups now and then report a huge `movementX`/`movementY` in one captured
 * move (a known Chromium bug), which whips the camera round. Past this many px in one event it is
 * dropped. Chrome coalesces pointermove to one per animation frame, so on a 30 fps PC a brisk flick
 * is a few hundred px in one event; the bug's jumps are typically half a screen or more, so 500
 * keeps every real flick and still catches the jumps.
 */
export const LOOK_SPIKE = 500;

/**
 * Captures handed from one canvas to whichever plays next: a room that closed while it held the
 * mouse. Per document, so nothing leaks between pages (or tests).
 */
const HANDED = new WeakMap<object, true>();

export function mouseLook(el: LookEl, doc: LookDoc, o: MouseLookOptions): MouseLook {
  const later = o.later ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  let captured = doc.pointerLockElement === el;
  let wasPaused = false;
  /** A panel opening took the mouse from the camera, and has not yet given it back. */
  let lentByPanel = false;
  /** A request is out and has not been answered. */
  let asking = false;
  /** The one retry after a refusal has been spent. */
  let retried = false;
  /** Gone (a room closed): a retry queued before that must not ask a torn-down canvas. */
  let disposed = false;
  // A new instance over a document nothing holds is a fresh visit: a hand-over left by a Realm that
  // unmounted while captured is stale, and must not capture the mouse without a click.
  if (doc.pointerLockElement == null) HANDED.delete(doc);
  /** The right button's drag: its pointer, or -1. */
  let drag = -1;
  /** A left press with the mouse free, not yet a click or a drag: its pointer, or -1. */
  let press = -1;
  /** That press has gone further than `CLICK_SLOP`: it is a drag, and orbits. */
  let pressDrag = false;
  /** The left button is held while the mouse is captured: captured moves orbit. */
  let heldLeft = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  function ask(): void {
    if (disposed) return;
    asking = true;
    try {
      const r = el.requestPointerLock?.() as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(refused);
    } catch {
      refused();
    }
  }

  /** The browser said no — by a rejected promise, an error event, or both for one request. */
  function refused(): void {
    if (!asking) return;
    asking = false;
    if (retried || o.paused()) return;
    retried = true;
    later(() => {
      if (!captured && !o.paused()) ask();
    }, LOCK_RETRY_MS);
  }

  function endDrag(): void {
    if (drag >= 0 && el.hasPointerCapture?.(drag)) el.releasePointerCapture?.(drag);
    drag = -1;
  }

  /**
   * A left press over, click or drag, with nothing asked for. `release` is false on the press's own
   * pointerup: the browser lets go of the capture itself straight after it, and holding it through
   * the up is what sends the click that follows to the canvas, not to a HUD button under the mouse.
   */
  function endPress(release = true): void {
    if (release && press >= 0 && el.hasPointerCapture?.(press)) el.releasePointerCapture?.(press);
    press = -1;
    pressDrag = false;
  }

  /** The browser took the pointer capture away: whatever drag or press it held is over. */
  function lost(): void {
    endDrag();
    endPress();
  }

  const api: MouseLook = {
    get captured() {
      return captured;
    },
    get dragging() {
      return drag >= 0;
    },
    get orbiting() {
      return (press >= 0 && pressDrag) || (captured && heldLeft);
    },
    request() {
      if (captured) return;
      retried = false;
      ask();
    },
    tick(paused) {
      // A panel just opened: let the mouse go so it can be clicked. Only on the way in — a capture
      // granted while a panel is still closing (Resume's own click) is the child's, and is kept.
      if (paused && !wasPaused && captured) {
        doc.exitPointerLock();
        lentByPanel = true;
      }
      // The panel closed: the mouse it took comes back as the camera, as closing a screen does in
      // Minecraft.
      // Re-locking after the page's own exitPointerLock() needs no user activation (Pointer Lock
      // spec), so a panel closed by Esc, E or code recaptures as well as one closed by a click.
      // Not if it is already ours or already asked for (Resume's own request), so one resume is
      // one ask. An Esc that freed the capture itself (no panel) never set the flag: that capture
      // is Resume's to take back.
      if (!paused && wasPaused && lentByPanel) {
        lentByPanel = false;
        if (!captured && !asking) api.request();
      }
      wasPaused = paused;
      // A room closed while it held the mouse: the capture carries on here.
      if (!paused && !captured && doc.pointerLockElement == null && HANDED.has(doc)) {
        HANDED.delete(doc);
        api.request();
      }
    },
    dispose() {
      disposed = true;
      // Going away while captured (a room closing): the next canvas to play takes the capture.
      if (captured) HANDED.set(doc, true);
      endDrag();
      endPress();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", dragMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", lost);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
      doc.removeEventListener("pointerlockchange", change);
      doc.removeEventListener("pointerlockerror", refused);
      doc.removeEventListener("pointermove", lockedMove);
    },
  };

  function down(e: { button: number; pointerId: number; clientX: number; clientY: number; preventDefault(): void }): void {
    if (o.paused()) return;
    if (e.button === 0) {
      e.preventDefault();
      if (captured) {
        heldLeft = true;
        return;
      }
      // Free: a click or a drag, not known until it moves or comes up. Hold the pointer meanwhile,
      // so the up comes here wherever the mouse ends up.
      if (drag >= 0 || press >= 0) return;
      press = e.pointerId;
      pressDrag = false;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      el.setPointerCapture?.(press);
    } else if (e.button === 2 && !captured) {
      if (drag >= 0 || press >= 0) return;
      drag = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture?.(drag);
      e.preventDefault();
    }
  }

  function dragMove(e: { pointerId: number; clientX: number; clientY: number }): void {
    if (press >= 0 && e.pointerId === press) {
      if (o.paused()) return endPress();
      if (!pressDrag) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) <= CLICK_SLOP) return;
        pressDrag = true;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx !== 0 || dy !== 0) o.sink(dx, dy, "orbit");
      return;
    }
    if (drag < 0 || e.pointerId !== drag) return;
    if (o.paused()) return endDrag();
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0 || dy !== 0) o.sink(dx, dy, "turn");
  }

  function up(e: { pointerId: number; button?: number }): void {
    if (e.button === 0 || e.button === undefined) heldLeft = false;
    if (e.pointerId === drag) endDrag();
    if (press >= 0 && e.pointerId === press) {
      // A press that never went further than a click is one: capture the mouse now. A drag ends
      // where it is, and asks for nothing.
      const click = !pressDrag;
      endPress(false);
      if (click && !o.paused()) api.request();
    }
  }

  /** The browser called the pointer off (a touch turned into a scroll, a window lost focus). */
  function cancel(e: { pointerId: number }): void {
    heldLeft = false;
    if (e.pointerId === drag) endDrag();
    if (e.pointerId === press) endPress();
  }

  function lockedMove(e: { movementX?: number; movementY?: number; buttons?: number }): void {
    if (!captured || o.paused()) return;
    // The move knows which buttons are down: trust it over an up the canvas may never have heard.
    if (typeof e.buttons === "number") heldLeft = (e.buttons & 1) !== 0;
    const dx = e.movementX ?? 0;
    const dy = e.movementY ?? 0;
    if (Math.abs(dx) > LOOK_SPIKE || Math.abs(dy) > LOOK_SPIKE) return;
    if (dx !== 0 || dy !== 0) o.sink(dx, dy, heldLeft ? "orbit" : "turn");
  }

  function wheel(e: { deltaY: number; deltaMode: number; preventDefault(): void }): void {
    e.preventDefault();
    if (o.paused()) return;
    o.zoom(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);
  }

  function menu(e: { preventDefault(): void }): void {
    e.preventDefault();
  }

  function change(): void {
    const now = doc.pointerLockElement === el;
    if (now === captured) return;
    captured = now;
    heldLeft = false;
    if (now) {
      asking = false;
      endDrag();
      endPress();
      return;
    }
    // Lost it. To another canvas in this document (a room's): that is a hand-over, not a freeing.
    if (doc.pointerLockElement != null) return;
    // Because this canvas left the page (a room closing): the next canvas to play takes it on.
    if (el.isConnected === false) {
      HANDED.set(doc, true);
      return;
    }
    // Otherwise the browser freed it: Esc, which the page never heard. Unless a panel did it.
    if (!o.paused()) o.freed();
  }

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", dragMove);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("lostpointercapture", lost);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", menu);
  doc.addEventListener("pointerlockchange", change);
  doc.addEventListener("pointerlockerror", refused);
  // Captured moves come as pointermove, never mousemove: the left press that starts a captured orbit
  // is prevented, and a prevented pointerdown stops the browser sending mousemove until pointerup
  // (Pointer Events' compatibility rules). The canvas's own pointermoves bubble up here too, but
  // only count while captured, when the canvas has no press or drag of its own.
  doc.addEventListener("pointermove", lockedMove);

  // Opening while another canvas in this document holds the capture (walking into a room with the
  // mouse captured): take it over. A captured document may move its capture without a click.
  if (!captured && doc.pointerLockElement != null) api.request();

  return api;
}
