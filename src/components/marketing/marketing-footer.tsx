import Link from "next/link";

/** Shared marketing footer — a distinct band mirroring the header. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-gold-dim/40 bg-[#080c18]/80 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-muted-foreground/60">
        <Link href="/privacy" className="text-[var(--gold-bright)] underline underline-offset-2 hover:no-underline">
          Privacy Policy
        </Link>
        <span className="mx-2 opacity-50">·</span>
        <Link href="/terms" className="text-[var(--gold-bright)] underline underline-offset-2 hover:no-underline">
          Terms of Service
        </Link>
        <span className="mx-2 opacity-50">·</span>
        &copy; {new Date().getFullYear()} Kingdoms &amp; Crowns. All Rights Reserved.
      </div>
    </footer>
  );
}
