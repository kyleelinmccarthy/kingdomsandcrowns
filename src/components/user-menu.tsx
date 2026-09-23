"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Feather, LogOut, Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { SendRavenDialog } from "@/components/send-raven";
import { AlertsDialog } from "@/components/parent-alert-bell";
import { useParentAlerts } from "@/components/parent-alerts-context";
import { signOut } from "@/lib/auth/client";

export function UserMenu({ userName, isChildView }: { userName: string; isChildView?: boolean }) {
  const [ravenOpen, setRavenOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Heroes never get a provider above them with real data (ParentAlertsProvider
  // seeds an empty list for them), but read defensively anyway: this medallion
  // is grown-ups-only.
  const { alerts } = useParentAlerts();
  const count = isChildView ? 0 : alerts.length;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);

    // better-auth's client signOut can be rejected (415/500) when the POST
    // carries no JSON body — which leaves the session cookie intact. Treat any
    // failure as "retry with an explicit body" so we never navigate away while
    // still signed in (the original bug: it ignored the error and left).
    let cleared = false;
    try {
      const res = await signOut();
      cleared = !res?.error;
    } catch {
      cleared = false;
    }
    if (!cleared) {
      try {
        const res = await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        cleared = res.ok;
      } catch {
        cleared = false;
      }
    }

    if (!cleared) {
      // Couldn't reach the server — keep the user where they are rather than
      // dropping them on /login while their session is still live.
      setSigningOut(false);
      window.alert("Could not leave the realm right now. Please try again.");
      return;
    }

    // Hard navigation (not router.push) so the cleared cookies and better-auth's
    // cached session state are fully reset on the next load.
    window.location.href = "/login";
  }

  const badgeCount = count > 99 ? "99+" : String(count);
  const triggerLabel =
    count > 0
      ? `Open your account menu — ${count} ${count === 1 ? "alert needs" : "alerts need"} your attention`
      : "Open your account menu";
  const tooltip =
    count > 0
      ? `Your menu — ${count} unread ${count === 1 ? "alert" : "alerts"}, account settings, send us a raven, and sign out.`
      : "Your menu — account settings, send us a raven, and sign out.";

  return (
    <>
      <DropdownMenu>
        <Tooltip content={tooltip}>
          <DropdownMenuTrigger
            className={count > 0 ? "user-medallion alert-medallion--unread" : "user-medallion"}
            aria-label={triggerLabel}
          >
            <span className="medallion-icon relative">
              <User className="size-4" />
              {count > 0 && <span className="alert-medallion-badge">{badgeCount}</span>}
            </span>
            <span className="medallion-label">{userName}</span>
            <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="tracking-wide" style={{ fontFamily: "var(--font-farro), sans-serif" }}>{userName}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {!isChildView && (
            <>
              <DropdownMenuItem
                onClick={() => setAlertsOpen(true)}
                className="flex items-start gap-2"
              >
                <Bell className="size-4 mt-0.5 shrink-0" />
                <span className="flex flex-col">
                  <span>{count > 0 ? `Alerts (${badgeCount})` : "Alerts"}</span>
                  <span className="text-xs text-muted-foreground">What your heroes skipped or got stuck on.</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={() => setRavenOpen(true)}
            className="flex items-start gap-2"
          >
            <Feather className="size-4 mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span>Send a Raven</span>
              <span className="text-xs text-muted-foreground">Report a bug, share an idea, or say hello.</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/settings" />}
            className="flex items-start gap-2"
          >
            <Settings className="size-4 mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span>Settings</span>
              <span className="text-xs text-muted-foreground">Manage your family, guardians, and account.</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="size-4 shrink-0" />
            {signingOut ? "Departing..." : "Leave the Realm"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SendRavenDialog open={ravenOpen} onClose={() => setRavenOpen(false)} />
      {!isChildView && <AlertsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} />}
    </>
  );
}
