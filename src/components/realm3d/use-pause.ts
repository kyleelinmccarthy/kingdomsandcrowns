"use client";

/**
 * EVERYTHING THAT PAUSES THE GAME WITHOUT A PANEL ASKING: the P key, and the four pauses a child
 * never asks for — the tab hidden, the window left, the captured mouse let go, and two minutes
 * with nobody touching anything. Each one opens the pause menu through the frame's `go`, so the
 * play clock stops the way it stops for any panel (`usePlayClock` does not tick while paused).
 *
 * Which trigger pauses whom, and why, is `autoPause` (`lib/realm3d/pause.ts`); this hook only
 * listens and asks it. And Resume: a child who was looking with the mouse when the game paused
 * gets the mouse caught again by the Resume click (`bus.requestLook`), the one moment the
 * browser allows it.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Overlay } from "@/lib/realm3d/frame";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { autoPause, IDLE_MS, type AutoTrigger } from "@/lib/realm3d/pause";

/** What counts as the child touching the game: any key, click, mouse move or wheel. */
const INPUT = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
const TICK_MS = 1000;

/** The mouse is captured right now (pointer lock). */
function captured(): boolean {
  return typeof document !== "undefined" && document.pointerLockElement != null;
}

/** The window is the one in front and the tab is shown: a mouse let go now was let go by Esc. */
function focused(): boolean {
  return document.hasFocus() && document.visibilityState === "visible";
}

/** A key pressed into a field that takes text is the field's, not the game's. */
function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit"].includes(t.type);
}

export function usePause({
  bus,
  overlayRef,
  paused,
  go,
  clock,
  enabled,
}: {
  bus: HudBus;
  /** The overlay as it is at the moment something happens. */
  overlayRef: RefObject<Overlay | null>;
  /** A panel is open. */
  paused: boolean;
  /** The frame's one way to change the overlay. */
  go: (next: Overlay | null) => void;
  /** The child's own clock runs. Without one (a grown-up), only Esc and P pause. */
  clock: boolean;
  /** False once the Realm has closed: nothing is left to pause. */
  enabled: boolean;
}): { resume: () => void } {
  /** The mouse was captured when this pause began, so Resume should catch it again. */
  const looked = useRef(false);

  const open = useCallback(
    (trigger: AutoTrigger) => {
      const why = autoPause(trigger, { playing: overlayRef.current === null, clock, focused: focused() });
      if (!why) return;
      looked.current = trigger === "look" || captured();
      go({ kind: "pause", why });
    },
    [overlayRef, clock, go],
  );

  const resume = useCallback(() => {
    const again = looked.current;
    looked.current = false;
    go(null);
    // From the click itself: the browser captures the mouse only in answer to the child's hand.
    if (again) bus.requestLook();
  }, [bus, go]);

  // Played on without Resume (Esc): the next pause starts from what the mouse is doing then.
  useEffect(() => {
    if (!paused) looked.current = false;
  }, [paused]);

  // The scene lets us know the browser let the captured mouse go.
  useEffect(() => {
    if (!enabled) return;
    bus.setHandlers({
      onLookFreed: () => {
        // Let go under the pause menu (it was caught when the pause began): Resume catches it again.
        if (overlayRef.current?.kind === "pause") looked.current = true;
        else open("look");
      },
    });
    return () => bus.setHandlers({ onLookFreed: () => {} });
  }, [bus, enabled, open, overlayRef]);

  // The tab hidden, the window left, and P.
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") open("hidden");
    };
    const onBlur = () => open("blur");
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyP" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const now = overlayRef.current;
      if (now === null) {
        looked.current = captured();
        go({ kind: "pause" });
      } else if (now.kind === "pause") resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, open, go, resume, overlayRef]);

  // Two minutes of PLAYING time untouched. Counted a second at a time; any input, or any panel
  // being open, starts it again.
  useEffect(() => {
    if (!enabled) return;
    let idle = 0;
    const touch = () => {
      idle = 0;
    };
    for (const type of INPUT) window.addEventListener(type, touch, { capture: true, passive: true });
    const id = window.setInterval(() => {
      if (overlayRef.current !== null) {
        idle = 0;
        return;
      }
      idle += TICK_MS;
      if (idle < IDLE_MS) return;
      idle = 0;
      open("idle");
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      for (const type of INPUT) window.removeEventListener(type, touch, { capture: true });
    };
  }, [enabled, open, overlayRef]);

  return { resume };
}
