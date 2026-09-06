"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function RealmHud({
  heroName,
  minutesRemaining,
  warning,
  preview,
  hudScale,
  error,
  selector,
  onRetry,
  paused,
  toast,
  kingdomError,
  onKingdomRetry,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  warning: boolean;
  preview: { note: string | null } | null;
  hudScale: number;
  error: string;
  selector?: React.ReactNode;
  onRetry: () => void;
  paused: boolean;
  toast: string | null;
  kingdomError: string;
  onKingdomRetry: () => void;
}) {
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em` }}>
      <div className="realm-hud-row">
        <span className="realm-hud-name">{heroName}</span>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&apos;s Realm</span>}
        {preview && selector}
        <Link href="/tavern" className="realm-hud-leave">Leave the Realm</Link>
      </div>
      {preview?.note && <p className="realm-hud-note">{preview.note}</p>}
      {warning && minutesRemaining !== null && <p className="realm-hud-banner">One minute left in the Realm today.</p>}
      {error && (
        <p className="realm-hud-error">
          {error} <Button size="xs" variant="ghost" onClick={onRetry}>Try again</Button>
        </p>
      )}
      {kingdomError && (
        <p className="realm-hud-error">
          {kingdomError} <Button size="xs" variant="ghost" onClick={onKingdomRetry}>Wake the villagers</Button>
        </p>
      )}
      {toast && <p className="realm-hud-toast" role="status">{toast}</p>}
    </div>
  );
}
