"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { useParentAlerts } from "@/components/parent-alerts-context";
import {
  alertDetail,
  alertHeadline,
  alertPresentation,
} from "@/lib/utils/parent-alert-display";

const MAX_TOASTS_AT_ONCE = 3;

/**
 * The grown-ups' full alert list on the family dashboard. Reads the same
 * shared list the nav bell does, so dismissing in either place is reflected in
 * both without a round trip through the router.
 */
export function ParentAlertsPanel() {
  const { alerts, busy, dismiss, dismissAll } = useParentAlerts();

  // Nothing to show: the nav bell is the standing home for alerts, so the
  // dashboard doesn't need an empty frame taking up room.
  if (alerts.length === 0) return null;

  return (
    <GameFrame
      className="alert-panel"
      title={`Alerts (${alerts.length})`}
      icon={<GameIcon name="bell" className="size-4 text-[var(--gold-bright)]" />}
      action={
        <button
          type="button"
          onClick={() => dismissAll()}
          disabled={busy}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          Dismiss all
        </button>
      }
    >
      <div className="space-y-2">
        {alerts.map((alert) => {
          const presentation = alertPresentation(alert.type);
          return (
            <div
              key={alert.id}
              data-tone={presentation.tone}
              className="alert-row flex items-start gap-3 rounded-md border px-3 py-2"
            >
              <GameIcon
                name={presentation.icon}
                className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm wrap-anywhere">
                  <span className="font-medium">{alert.childName}</span>{" "}
                  {presentation.verb}{" "}
                  <span className="font-medium">&quot;{alert.questTitle}&quot;</span>
                </p>
                <p className="text-xs text-muted-foreground">{alertDetail(alert)}</p>
                {alert.note && (
                  <p className="mt-0.5 text-xs italic wrap-anywhere text-muted-foreground">
                    &ldquo;{alert.note}&rdquo;
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismiss(alert.id)}
                disabled={busy}
                className="shrink-0"
              >
                Dismiss
              </Button>
            </div>
          );
        })}
      </div>
    </GameFrame>
  );
}

/**
 * The nudge: a floating card for each alert that arrives while a grown-up has
 * the app open, wherever in it they happen to be.
 *
 * It deliberately does *not* auto-dismiss — a parent away from the screen used
 * to come back to an empty corner and no idea anything had happened. Closing a
 * card only clears the card: the alert itself stays on the nav bell, which is
 * what carries anything already waiting at page load, so nothing depends on
 * the parent having been looking at the right moment.
 */
export function ParentAlertPopup() {
  const { alerts } = useParentAlerts();
  // Whatever was already waiting when this session started is the bell's job
  // to announce, not the toast's — otherwise every navigation would restack
  // the same cards over the page.
  const [alreadyWaiting] = useState(() => new Set(alerts.map((a) => a.id)));
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());

  // Derived rather than stored, so an alert dealt with from the bell or the
  // dashboard can't leave its card floating over the page.
  const toasts = alerts
    .filter((a) => !alreadyWaiting.has(a.id) && !closed.has(a.id))
    .slice(0, MAX_TOASTS_AT_ONCE);

  if (toasts.length === 0) return null;

  return (
    <div className="parent-alert-popup fixed left-4 top-4 z-50 flex max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-2 rounded-xl border-2 border-[var(--gold-border)] bg-[linear-gradient(180deg,rgba(17,26,46,0.97)_0%,rgba(10,16,30,1)_100%)] px-4 py-3 shadow-[0_0_40px_-10px_rgba(201,168,76,0.2),0_8px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-left-4"
        >
          <GameIcon
            name={alertPresentation(toast.type).icon}
            className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm wrap-anywhere text-foreground">{alertHeadline(toast)}</p>
            {toast.note && (
              <p className="text-xs italic wrap-anywhere text-muted-foreground">
                &ldquo;{toast.note}&rdquo;
              </p>
            )}
            <Link
              href="/tavern"
              className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
            >
              Review in the Tavern →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setClosed((prev) => new Set(prev).add(toast.id))}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
