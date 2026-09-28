"use client";

/**
 * The small gold mark at the middle of the view while the mouse is captured (`look-input.ts`).
 * The browser hides the cursor for as long as it holds the mouse, so without this a child has
 * nothing to tell them the mouse is the camera now. Gone the moment the mouse is let go or a
 * panel opens.
 */

import { useCallback, useSyncExternalStore } from "react";

/** The part of a document this reads, so the rule is tested with a fake. */
export type LockDoc = {
  pointerLockElement: unknown;
  addEventListener(type: "pointerlockchange", fn: () => void): void;
  removeEventListener(type: "pointerlockchange", fn: () => void): void;
};

export function LookReticle({ paused, doc }: { paused: boolean; doc?: LockDoc }) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const d = doc ?? document;
      d.addEventListener("pointerlockchange", onChange);
      return () => d.removeEventListener("pointerlockchange", onChange);
    },
    [doc],
  );
  const captured = useSyncExternalStore(
    subscribe,
    () => (doc ?? document).pointerLockElement != null,
    () => false,
  );
  if (!captured || paused) return null;
  return (
    <svg className="r3-reticle" viewBox="0 0 24 24" aria-hidden="true" data-testid="look-reticle">
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
