import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-portal">
      {/* Floating particles */}
      <div className="auth-particle" />
      <div className="auth-particle" />
      <div className="auth-particle" />
      <div className="auth-particle" />
      <div className="auth-particle" />
      <div className="auth-particle" />

      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-[#3ecfff]/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-[#7c3aed]/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3ecfff]/[0.03] blur-3xl" />

      {/* Brand header — also links back to the marketing landing page */}
      <Link href="/" className="mb-6 block text-center transition-opacity hover:opacity-90">
        <img src="/crown.svg" alt="Kingdoms & Crowns crown" className="mx-auto mb-2 h-16 w-16" />
        <h1 className="page-title text-5xl" style={{ fontFamily: "var(--font-brand)" }}>
          Kingdoms & Crowns
        </h1>
        <p className="game-banner-subtitle mt-2">
          Be the Hero of Homeschool
        </p>
      </Link>

      <div className="auth-frame relative w-full max-w-md">
        {/* Corner ornaments on auth card */}
        <div className="game-frame-corner game-frame-corner--tl" />
        <div className="game-frame-corner game-frame-corner--tr" />
        <div className="game-frame-corner game-frame-corner--bl" />
        <div className="game-frame-corner game-frame-corner--br" />
        {/* Edge midpoint decorations */}
        <div className="game-frame-edge game-frame-edge--top" />
        <div className="game-frame-edge game-frame-edge--bottom" />
        <div className="game-frame-edge game-frame-edge--left" />
        <div className="game-frame-edge game-frame-edge--right" />
        <div className="p-6">{children}</div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground/60">
        <a href="/privacy" className="text-[var(--gold-bright)] underline underline-offset-2 hover:no-underline">Privacy Policy</a>
        <span className="mx-2 opacity-50">·</span>
        <a href="/terms" className="text-[var(--gold-bright)] underline underline-offset-2 hover:no-underline">Terms of Service</a>
        <span className="mx-2 opacity-50">·</span>
        &copy; {new Date().getFullYear()} Kingdoms &amp; Crowns. All Rights Reserved.
      </p>
    </div>
  );
}
