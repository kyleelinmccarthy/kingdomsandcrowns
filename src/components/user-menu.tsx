"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
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
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="size-4" />
            Leave the Realm
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SendRavenDialog open={ravenOpen} onClose={() => setRavenOpen(false)} />
    </>
  );
}
