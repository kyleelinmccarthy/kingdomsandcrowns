"use client";

import Link from "next/link";
import { GameIcon } from "@/components/game-icon";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useParentAlerts } from "@/components/parent-alerts-context";
import { alertDetail, alertHeadline, alertPresentation } from "@/lib/utils/parent-alert-display";

/** Rows beyond this stay in the Tavern panel rather than making the dialog scroll forever. */
const MAX_ROWS = 6;

/**
 * The grown-ups' alert list — what each hero skipped or got stuck on. Reached
 * from the "Alerts" item in the account menu; the unread count itself lives
 * as a badge on the account medallion (see UserMenu) so it stays visible
 * without this dialog being open, the same way the old standing nav bell
 * used to carry it.
 */
export function AlertsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { alerts, busy, dismiss, dismissAll } = useParentAlerts();
  const count = alerts.length;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2 pr-8">
          <DialogTitle>{count === 0 ? "Alerts" : `Alerts (${count})`}</DialogTitle>
          {count > 0 && (
            <button
              type="button"
              onClick={() => dismissAll()}
              disabled={busy}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Dismiss all
            </button>
          )}
        </div>
        <p className="text-sm font-serif text-muted-foreground">
          What your heroes skipped or got stuck on.
        </p>
      </DialogHeader>

      {count === 0 ? (
        <div className="px-1 py-6 text-center">
          <GameIcon name="check" className="mx-auto size-6 text-[var(--gold-bright)]" />
          <p className="mt-2 text-sm text-muted-foreground">
            All clear — nothing needs a grown-up.
          </p>
        </div>
      ) : (
        <ul className="-mx-2 max-h-[min(24rem,50svh)] overflow-y-auto">
          {alerts.slice(0, MAX_ROWS).map((alert) => {
            const presentation = alertPresentation(alert.type);
            return (
              <li
                key={alert.id}
                data-tone={presentation.tone}
                className="alert-tray-row flex items-start gap-2 px-3 py-2"
              >
                <GameIcon
                  name={presentation.icon}
                  className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm wrap-anywhere text-foreground">{alertHeadline(alert)}</p>
                  <p className="text-xs text-muted-foreground">{alertDetail(alert)}</p>
                  {alert.note && (
                    <p className="mt-0.5 text-xs italic wrap-anywhere text-muted-foreground">
                      &ldquo;{alert.note}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(alert.id)}
                  disabled={busy}
                  aria-label={`Dismiss: ${alertHeadline(alert)}`}
                  className="shrink-0 rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-[var(--gold-border)]/40 pt-3 text-center">
        <Link href="/tavern" onClick={onClose} className="text-xs font-medium text-primary hover:underline">
          {count > MAX_ROWS ? `View all ${count} in the Tavern →` : "View in the Tavern →"}
        </Link>
      </div>
    </Dialog>
  );
}
