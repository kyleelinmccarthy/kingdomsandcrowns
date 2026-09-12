"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeroLogin } from "@/components/hero-login";
import { GameIcon } from "@/components/game-icon";

// `RealmOpen` stamps `data-realm-open` on <body> while the Realm's portal is up (see
// realm-shell.tsx), and the stylesheet hides `.floating-dock` from there. A child's
// pill is removed outright rather than merely hidden: it is the only DOM control over
// the game world, it lands beside the mount slot where a thumb already is, and a child
// leaves the Realm through the Tavern link inside it. Subscribed rather than read
// during render so the pill comes back the moment the portal closes — and with a
// server snapshot of `false`, because this renders on every page, SSR included.
const realmOpenListeners = new Set<() => void>();
let realmOpenObserver: MutationObserver | null = null;

function subscribeRealmOpen(callback: () => void) {
  realmOpenListeners.add(callback);
  if (!realmOpenObserver) {
    realmOpenObserver = new MutationObserver(() => {
      realmOpenListeners.forEach((fn) => fn());
    });
    realmOpenObserver.observe(document.body, { attributes: true, attributeFilter: ["data-realm-open"] });
  }
  return () => {
    realmOpenListeners.delete(callback);
  };
}
function getRealmOpen() {
  return document.body.hasAttribute("data-realm-open");
}
function getServerRealmOpen() {
  return false;
}

/**
 * Floating control for shared-device hero hand-off (production, non-demo).
 * - Adult signed in: "Play as a hero" → pick a family hero + PIN.
 * - Child (PIN) signed in: "Leave" → clears the child session, returning the
 *   device to the parent (or the login screen).
 *
 * `inline` drops the `.floating-dock` anchoring so the control can sit in a row —
 * the Realm's parent preview puts it in the HUD header beside the child selector,
 * because a control that floats over a game board is the thing being fixed.
 */
export function SwitchHero({ isChildView, inline = false }: { isChildView: boolean; inline?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const realmOpen = useSyncExternalStore(subscribeRealmOpen, getRealmOpen, getServerRealmOpen);

  async function leave() {
    setLeaving(true);
    try {
      await fetch("/api/child-auth/signout", { method: "POST" });
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  if (isChildView && realmOpen) return null;

  const pill = cn(
    inline ? "" : "floating-dock",
    "flex items-center gap-2 rounded-full border-2 border-dashed",
    "border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm",
    "text-amber-700 transition-all hover:scale-105 hover:bg-amber-500/20 dark:text-amber-300",
  );

  if (isChildView) {
    return (
      <button onClick={leave} disabled={leaving} className={pill}>
        {leaving ? (
          "Leaving..."
        ) : (
          <>
            <GameIcon name="door" className="size-4 text-[var(--gold-bright)]" />
            Leave (switch hero)
          </>
        )}
      </button>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={pill}>
        <GameIcon name="swords" className="size-4 text-[var(--gold-bright)]" />
        Play as a hero
      </button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Play as a Hero</DialogTitle>
        </DialogHeader>
        <HeroLogin mode="handoff" onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
