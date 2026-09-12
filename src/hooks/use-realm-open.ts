"use client";

import { useSyncExternalStore } from "react";

// `RealmOpen` stamps `data-realm-open` on <body> while the Realm's portal is up (see
// realm-shell.tsx), and the stylesheet hides `.floating-dock`, `.quest-timer-popup`,
// `.schedule-notification-popup` and `.parent-alert-popup` from there. Any component
// outside the Realm that needs to behave differently while the portal is up — the
// hero-switch pill, the quest-timer break reminder — reads this hook rather than the
// attribute directly, so there is exactly one MutationObserver for the whole app.
// Subscribed rather than read during render so a consumer updates the moment the
// portal opens or closes, and with a server snapshot of `false`, because every
// consumer of this hook renders on ordinary pages too, SSR included.
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (!observer) {
    observer = new MutationObserver(() => {
      listeners.forEach((fn) => fn());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-realm-open"] });
  }
  return () => {
    listeners.delete(callback);
  };
}
function getSnapshot() {
  return document.body.hasAttribute("data-realm-open");
}
function getServerSnapshot() {
  return false;
}

/** True while the Realm's portal (`.realm-root`, `data-realm-open` on `<body>`) is open. */
export function useRealmOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
