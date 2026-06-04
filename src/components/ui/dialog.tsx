"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Native <dialog> registers backdrop clicks on the element itself; close
      // when the click lands outside the inner content.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "backdrop:bg-black/60 rounded-md border-2 border-[var(--gold-border)] p-0 m-auto",
        "bg-[linear-gradient(180deg,rgba(17,26,46,0.95)_0%,rgba(13,21,37,0.98)_40%,rgba(10,16,30,1)_100%)]",
        "text-foreground",
        "shadow-[inset_0_1px_0_rgba(201,168,76,0.1),inset_0_0_30px_rgba(0,0,0,0.3),0_0_40px_-10px_rgba(201,168,76,0.15),0_8px_30px_rgba(0,0,0,0.5)]",
        "max-w-lg w-[calc(100%-2rem)] max-h-[calc(100svh-2rem)] overflow-y-auto open:animate-in open:fade-in open:zoom-in-95",
        className,
      )}
    >
      <div className="relative p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={cn(
            "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full",
            "text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-border)]",
          )}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 space-y-1">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-wider text-[var(--gold-bright)] [text-shadow:0_0_12px_rgba(201,168,76,0.3)]">{children}</h2>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
