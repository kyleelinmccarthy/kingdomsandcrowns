"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";

type Hero = { childId: string; displayName: string; avatarConfig: string | null };

/**
 * Hero PIN sign-in.
 * - mode "standalone": kid enters a family login code first (own device).
 * - mode "handoff": a parent is already signed in; heroes load immediately.
 */
export function HeroLogin({
  mode,
  prefillCode = "",
  onDone,
}: {
  mode: "standalone" | "handoff";
  prefillCode?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(prefillCode);
  const [heroes, setHeroes] = useState<Hero[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Hero | null>(null);

  const loadHeroes = useCallback(async (familyCode?: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/child-auth/family-heroes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(familyCode ? { familyCode } : {}),
      });
      const data = await res.json();
      setHeroes(data.heroes ?? []);
      if ((data.heroes ?? []).length === 0 && familyCode) {
        setError("No heroes found for that family code.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Handoff mode (parent signed in) loads immediately; so does a prefilled code.
  useEffect(() => {
    if (mode === "handoff") loadHeroes();
    else if (prefillCode) loadHeroes(prefillCode);
  }, [mode, prefillCode, loadHeroes]);

  async function handlePinSubmit(pin: string) {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/child-auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selected.childId, pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That PIN didn't work.");
        setLoading(false);
        return;
      }
      onDone?.();
      router.push("/tavern");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  // Standalone: family-code entry until heroes load.
  if (mode === "standalone" && heroes === null) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadHeroes(code);
        }}
        className="space-y-4"
      >
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="familyCode">Family Code</Label>
          <Input
            id="familyCode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            Ask a grown-up for your family&apos;s code, or sign in with email instead.
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Looking..." : "Find my heroes"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {error && !selected && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {heroes && heroes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No heroes here yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {heroes?.map((h) => (
            <button
              key={h.childId}
              onClick={() => {
                setSelected(h);
                setError("");
              }}
              className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 transition-colors hover:border-primary hover:bg-primary/10"
            >
              <Avatar
                config={h.avatarConfig ? (JSON.parse(h.avatarConfig) as AvatarConfig) : null}
                name={h.displayName}
                size="sm"
              />
              <span className="truncate text-xs font-medium">{h.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <PinPad
          hero={selected}
          error={error}
          busy={loading}
          onCancel={() => {
            setSelected(null);
            setError("");
          }}
          onSubmit={handlePinSubmit}
        />
      )}
    </div>
  );
}

function PinPad({
  hero,
  error,
  busy,
  onCancel,
  onSubmit,
}: {
  hero: Hero;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  return (
    <Dialog open onClose={onCancel}>
      <DialogHeader>
        <DialogTitle>Enter {hero.displayName}&apos;s PIN</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(pin);
        }}
        className="space-y-4"
      >
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          minLength={4}
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="text-center text-2xl tracking-[0.5em]"
          required
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
          <Button type="submit" disabled={busy || pin.length < 4}>
            {busy ? "Entering..." : "Enter"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
