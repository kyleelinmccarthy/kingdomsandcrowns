import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignInMenu } from "@/components/marketing/sign-in-menu";

/**
 * Shared marketing top bar — used by the landing page and the "How It Works"
 * walkthrough so the logo, "How It Works" link, sign-in menu, and CTA stay in
 * sync across public pages.
 */
export function MarketingHeader({ active }: { active?: "how-it-works" }) {
  return (
    <header className="relative z-20 border-b border-gold-dim/40 bg-[#080c18]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <img src="/crown.svg" alt="" className="h-8 w-8" aria-hidden="true" />
          <span className="page-title text-lg tracking-wide">Kingdoms &amp; Crowns</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/how-it-works"
            aria-current={active === "how-it-works" ? "page" : undefined}
            className={
              active === "how-it-works"
                ? "hidden text-sm font-medium text-[var(--gold-bright)] sm:inline-block"
                : "hidden text-sm font-medium text-[#3ecfff] transition-colors hover:text-[#7fe0ff] sm:inline-block"
            }
          >
            How It Works
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started</Button>
          </Link>
          <SignInMenu />
        </nav>
      </div>
    </header>
  );
}
