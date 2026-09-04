"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Vec2 } from "@/lib/realm/layout";
import { screenToWorldAxis } from "@/lib/realm/input-mapping";

const KEYS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: 1 }, ArrowUp: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 }, ArrowDown: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};

/**
 * Keyboard and stick are folded into one world-space axis kept in a ref, so
 * the render loop reads it every frame without a React re-render per keypress.
 */
export function useRealmInput() {
  const axisRef = useRef<Vec2>({ x: 0, z: 0 });
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });

  const recompute = useCallback(() => {
    let screen = { x: 0, y: 0 };
    for (const key of keys.current) {
      const v = KEYS[key];
      if (v) screen = { x: screen.x + v.x, y: screen.y + v.y };
    }
    if (screen.x === 0 && screen.y === 0) screen = stick.current;
    axisRef.current = screenToWorldAxis({ x: Math.max(-1, Math.min(1, screen.x)), y: Math.max(-1, Math.min(1, screen.y)) });
  }, []);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!(e.code in KEYS)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      keys.current.add(e.code);
      recompute();
    }
    function up(e: KeyboardEvent) {
      keys.current.delete(e.code);
      recompute();
    }
    // A held key that never sees its keyup (alt-tab, a browser shortcut that
    // steals focus, the tab going to the background) must not stick forever.
    function clear() {
      keys.current.clear();
      recompute();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [recompute]);

  const setStick = useCallback((screen: { x: number; y: number }) => {
    stick.current = screen;
    recompute();
  }, [recompute]);

  return { axisRef, setStick };
}
