"use client";

import Link from "next/link";
import { ChevronDown, GraduationCap, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Header "Sign in" control — a dropdown offering the two ways into the app:
 * a parent account, or a student (PIN / family code).
 */
export function SignInMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#3ecfff] outline-none transition-colors hover:text-[#7fe0ff] focus-visible:text-[#7fe0ff] data-[popup-open]:text-[#7fe0ff]">
        Sign in
        <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuItem render={<Link href="/login" />} className="items-start gap-2 py-2">
          <UserRound className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]" />
          <span className="flex flex-col">
            <span>Parent Sign In</span>
            <span className="text-xs text-muted-foreground">Manage your family and account</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/login?mode=kid" />} className="items-start gap-2 py-2">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]" />
          <span className="flex flex-col">
            <span>Student Sign In</span>
            <span className="text-xs text-muted-foreground">Log in with a PIN or family code</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
