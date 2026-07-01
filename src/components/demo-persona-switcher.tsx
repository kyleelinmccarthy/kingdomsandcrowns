"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import type { DemoPersona } from "@/lib/auth/session";

const personas: { id: DemoPersona; label: string; icon: GameIconName }[] = [
  { id: "parent", label: "Parent", icon: "person" },
  { id: "lily", label: "Emma", icon: "flower" },
  { id: "lucas", label: "Noah", icon: "swords" },
];

export function DemoPersonaSwitcher({ current }: { current: DemoPersona }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const currentPersona = personas.find((p) => p.id === current) ?? personas[0];

  async function switchTo(persona: DemoPersona) {
    if (persona === current) return;
    await fetch("/api/demo/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona }),
    });
    router.refresh();
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Expanded persona list */}
      {open && (
        <div className="flex flex-col gap-1 rounded-xl border border-amber-500/30 bg-background/95 p-2 shadow-lg backdrop-blur-sm">
          <span className="px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            Switch hero
          </span>
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                switchTo(p.id);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                current === p.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <GameIcon name={p.icon} className="size-4" />
              <span>{p.label}</span>
              {current === p.id && (
                <span className="ml-auto text-xs opacity-70">active</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-full border-2 border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm transition-all hover:scale-105 hover:border-amber-500 hover:bg-amber-500/20 hover:shadow-xl active:scale-95",
          "text-amber-700 dark:text-amber-300",
        )}
      >
        <GameIcon name={currentPersona.icon} className="size-4" />
        <span>Guise: {currentPersona.label}</span>
        <svg
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
