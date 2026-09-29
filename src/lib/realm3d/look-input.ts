/**
 * THE MOUSE, AS A SOURCE OF LOOKS — capture as in Minecraft, a right-drag as in World of Warcraft.
 *
 * One input source with one output: `sink(dx, dy)`, in screen pixels, right and down positive.
 * What a look DOES to the camera is `lookBy` in `controls.ts`, the other side of that interface;
 * this module only knows the browser. It is handed its canvas and its document rather than
 * reaching for globals, so every rule below is tested against a fake of each, with no browser.
 *
 *   - A click on the world captures the mouse (Pointer Lock). From then on every move turns the
 *     camera, with no button held.
 *   - While the mouse is free, the RIGHT button held down and dragged turns the camera too. It
 *     never captures, so the HUD stays clickable: a child can look round and then reach for a
 *     spell without first having to let the mouse go.
 *   - Esc frees a captured mouse, and the browser swallows that Esc — the page never hears it. So
 *     a capture lost while the game is playing is reported (`freed`), and the frame opens the pause
 *     menu on it, exactly as Esc would have.
 *   - A panel opening (anything that pauses the game) lets go of the mouse, so the panel can be
 *     clicked. That is not an Esc and is not reported. Resume asks for the capture again from its
 *     own click (`request`), which the browser allows. A panel that took the mouse gives it back on
 *     the frame it closes (whatever closed it: Resume, a dialogue's last line, a deed board's X),
 *     from that same click's activation; a panel that opened over a free mouse captures nothing.
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

/** Where looks go: screen pixels, right and down positive. */
export type LookSink = (dxPx: number, dyPx: number) => void;

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
  /** The right button is dragging the camera. */
  readonly dragging: boolean;
  /** Ask for the capture: from a click, or to take over one held elsewhere in the document. */
  request(): void;
  /** Once a frame: lets go when a panel opens, and takes back a capture handed over by a room. */
  tick(paused: boolean): void;
  dispose(): void;
};

/** How long Chrome refuses a new capture after Esc freed one, with a margin. */
export const LOCK_RETRY_MS = 1100;

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
  let drag = -1;
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

  const api: MouseLook = {
    get captured() {
      return captured;
    },
    get dragging() {
      return drag >= 0;
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
      // Minecraft. The browser allows the ask only inside the closing click's transient activation
      // (about 5 s in Chrome); this frame follows that click, so it is well inside. Not if it is
      // already ours or already asked for (Resume's own request), so one resume is one ask. An Esc
      // freeing never set the flag: that capture is Resume's to take back.
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
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", dragMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", endDrag);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
      doc.removeEventListener("pointerlockchange", change);
      doc.removeEventListener("pointerlockerror", refused);
      doc.removeEventListener("mousemove", lockedMove);
    },
  };

  function down(e: { button: number; pointerId: number; clientX: number; clientY: number; preventDefault(): void }): void {
    if (o.paused()) return;
    if (e.button === 0) {
      api.request();
      e.preventDefault();
    } else if (e.button === 2 && !captured) {
      drag = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture?.(drag);
      e.preventDefault();
    }
  }

  function dragMove(e: { pointerId: number; clientX: number; clientY: number }): void {
    if (drag < 0 || e.pointerId !== drag) return;
    if (o.paused()) return endDrag();
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0 || dy !== 0) o.sink(dx, dy);
  }

  function up(e: { pointerId: number }): void {
    if (e.pointerId === drag) endDrag();
  }

  function lockedMove(e: { movementX?: number; movementY?: number }): void {
    if (!captured || o.paused()) return;
    const dx = e.movementX ?? 0;
    const dy = e.movementY ?? 0;
    if (dx !== 0 || dy !== 0) o.sink(dx, dy);
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
    if (now) {
      asking = false;
      endDrag();
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
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", endDrag);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", menu);
  doc.addEventListener("pointerlockchange", change);
  doc.addEventListener("pointerlockerror", refused);
  doc.addEventListener("mousemove", lockedMove);

  // Opening while another canvas in this document holds the capture (walking into a room with the
  // mouse captured): take it over. A captured document may move its capture without a click.
  if (!captured && doc.pointerLockElement != null) api.request();

  return api;
}
