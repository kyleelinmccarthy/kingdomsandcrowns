"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeroLogin } from "@/components/hero-login";

/**
 * Floating control for shared-device hero hand-off (production, non-demo).
 * - Adult signed in: "Play as a hero" → pick a family hero + PIN.
 * - Child (PIN) signed in: "Leave" → clears the child session, returning the
 *   device to the parent (or the login screen).
 */
export function SwitchHero({ isChildView }: { isChildView: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      await fetch("/api/child-auth/signout", { method: "POST" });
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  if (isChildView) {
    return (
      <button
        onClick={leave}
        disabled={leaving}
        className={cn(
          "fixed bottom-28 right-4 z-50 flex items-center gap-2 rounded-full border-2 border-dashed sm:bottom-4",
          "border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm",
          "text-amber-700 transition-all hover:scale-105 hover:bg-amber-500/20 dark:text-amber-300",
        )}
      >
        {leaving ? "Leaving..." : "🚪 Leave (switch hero)"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-28 right-4 z-50 flex items-center gap-2 rounded-full border-2 border-dashed sm:bottom-4",
          "border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm",
          "text-amber-700 transition-all hover:scale-105 hover:bg-amber-500/20 dark:text-amber-300",
        )}
      >
        ⚔️ Play as a hero
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
