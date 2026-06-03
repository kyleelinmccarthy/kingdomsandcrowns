"use client";

import { useState } from "react";
import Link from "next/link";
import { Feather, LogOut, Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendRavenDialog } from "@/components/send-raven";
import { signOut } from "@/lib/auth/client";

export function UserMenu({ userName }: { userName: string }) {
  const [ravenOpen, setRavenOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="user-medallion">
          <span className="medallion-icon">
            <User className="size-4" />
          </span>
          <span className="medallion-label">{userName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="tracking-wide" style={{ fontFamily: "var(--font-farro), sans-serif" }}>{userName}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href="/settings" />}
            className="flex items-center gap-2"
          >
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setRavenOpen(true)}
            className="flex items-center gap-2"
          >
            <Feather className="size-4" />
            Send a Raven
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="size-4" />
            {signingOut ? "Departing..." : "Leave the Realm"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SendRavenDialog open={ravenOpen} onClose={() => setRavenOpen(false)} />
    </>
  );
}
