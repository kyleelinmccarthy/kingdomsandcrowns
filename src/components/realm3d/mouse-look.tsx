"use client";

/**
 * The mouse on a canvas, the island's or a room's alike: `mouseLook` (`lib/realm3d/look-input.ts`)
 * bound to this canvas and the page, its looks turned into the camera's yaw and pitch by `lookBy`
 * (`controls.ts`) at the child's own settings (`bus.look`), the wheel into `zoomBy`, and the browser
 * freeing a captured mouse reported on the bus (`onLookFreed`) so the frame can pause.
 *
 * Whichever canvas is drawing installs its own capture as the bus's `requestLook`, every frame: the
 * island stops drawing while a room is open, so Resume always asks the canvas the child is in.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { mouseLook, type MouseLook as Look } from "@/lib/realm3d/look-input";
import { lookBy, zoomBy, type LookLimits, type LookState, type Orbit } from "@/lib/realm3d/controls";
import type { HudBus } from "@/lib/realm3d/hud-bus";

const noop = () => {};

/** A free function, so the view is never written to as a prop. */
function markHeld(v: LookState, on: boolean): void {
  v.held = on;
}

export function MouseLook({
  bus,
  yawRef,
  view,
  limits,
  paused,
}: {
  bus: HudBus;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  /** A room's limits (`ROOM_LOOK`); the island's by default. */
  limits?: LookLimits;
  /** Whether a panel has the child's attention. Stable: made once by the parent. */
  paused: () => boolean;
}) {
  const gl = useThree((s) => s.gl);
  const look = useRef<Look | null>(null);
  const request = useRef<() => void>(noop);

  useEffect(() => {
    const orbit: Orbit = { yaw: 0, pitch: 0, dist: 0 };
    const hold = () => {
      const v = view.current;
      orbit.yaw = yawRef.current;
      orbit.pitch = v.pitch;
      orbit.dist = v.dist;
      return v;
    };
    const l = mouseLook(gl.domElement, document, {
      sink: (dx, dy) => {
        const v = hold();
        lookBy(orbit, dx, dy, bus.look, limits);
        yawRef.current = orbit.yaw;
        v.pitch = orbit.pitch;
        v.lastLookAt = performance.now() / 1000;
      },
      zoom: (deltaY) => {
        const v = hold();
        zoomBy(orbit, deltaY, limits);
        v.dist = orbit.dist;
      },
      paused,
      freed: () => bus.onLookFreed(),
    });
    look.current = l;
    request.current = () => l.request();
    return () => {
      l.dispose();
      look.current = null;
      request.current = noop;
    };
  }, [gl, bus, yawRef, view, limits, paused]);

  useFrame(() => {
    const l = look.current;
    if (!l) return;
    l.tick(paused());
    markHeld(view.current, l.captured || l.dragging);
    bus.setLookRequester(request.current);
  });
  return null;
}
