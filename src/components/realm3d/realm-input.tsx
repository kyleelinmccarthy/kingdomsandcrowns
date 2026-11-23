"use client";

/**
 * THE REALM'S KEYBOARD, FOR REACT. The frame (`realm-game.tsx`) makes one input router
 * (`lib/realm3d/input-router.ts`) and provides it here; DOM-side components read it with
 * `useRealmInput`. Inside a `<Canvas>` context does not reach (R3F renders with its own
 * reconciler), so the scenes are handed the router as a prop, the way they are handed `bus`, and
 * call `useAction` with it directly.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { ActionEvent, InputRouter, Scope } from "@/lib/realm3d/input-router";
import type { ActionId, Keymap } from "@/lib/realm3d/keymap";

const RealmInput = createContext<InputRouter | null>(null);

export function RealmInputProvider({ router, children }: { router: InputRouter; children: ReactNode }) {
  return <RealmInput.Provider value={router}>{children}</RealmInput.Provider>;
}

/** The router the frame provided. Throws outside `RealmInputProvider`, so a missing provider is loud. */
export function useRealmInput(): InputRouter {
  const router = useContext(RealmInput);
  if (!router) throw new Error("useRealmInput must be used inside RealmInputProvider");
  return router;
}

/**
 * Subscribes for the component's life; `fn` is read through a ref, so it may change every render.
 * `actions` is compared by content, so an inline array does not re-subscribe either.
 */
export function useAction(
  router: InputRouter,
  actions: ActionId | readonly ActionId[],
  fn: (e: ActionEvent) => void,
  scope: Scope,
  enabled = true,
): void {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  const key = typeof actions === "string" ? actions : actions.join(",");
  useEffect(() => {
    if (!enabled) return;
    const ids = key.split(",") as ActionId[];
    return router.on(ids, (e) => latest.current(e), scope);
  }, [router, key, scope, enabled]);
}

/** The keymap in force, re-rendering when it changes. */
export function useKeymap(router: InputRouter): Keymap {
  const subscribe = useCallback((onChange: () => void) => router.onKeymap(onChange), [router]);
  const read = useCallback(() => router.keymap, [router]);
  return useSyncExternalStore(subscribe, read, read);
}
