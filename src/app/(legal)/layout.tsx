import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/crown.svg" alt="" className="size-6" />
            <span style={{ fontFamily: "var(--font-brand)" }}>Kingdoms &amp; Crowns</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/login" className="hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="prose-legal">{children}</article>
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Kingdoms &amp; Crowns
        </div>
      </footer>
    </div>
  );
}
