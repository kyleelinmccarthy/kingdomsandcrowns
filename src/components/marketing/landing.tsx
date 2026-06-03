import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";

const HOW_IT_WORKS = [
  {
    icon: "🏰",
    title: "Set up your family",
    body: "Create your parent account, add each child as a hero, and choose their subjects and quests.",
  },
  {
    icon: "⚔️",
    title: "Heroes log their learning",
    body: "Kids complete quests and record what they studied — earning XP, streaks, badges, and loot for their avatar.",
  },
  {
    icon: "📖",
    title: "You review the chronicle",
    body: "Get weekly summaries and per-subject history you can copy into reviews, portfolios, or your records.",
  },
];

const FEATURES = [
  { icon: "📜", title: "Quests & XP", body: "Turn daily lessons into quests with rewards that keep kids motivated." },
  { icon: "💎", title: "Loot & avatars", body: "Heroes unlock outfits, companions, and castles as they level up." },
  { icon: "📖", title: "Weekly chronicles", body: "Auto-generated learning logs for record-keeping and reviews." },
  { icon: "🏆", title: "Ranks", body: "A family hall of legends — plus an opt-in community leaderboard." },
  { icon: "🛡️", title: "Multiple guardians", body: "Invite a co-parent, tutor, or teacher with view-only or edit access." },
  { icon: "🔑", title: "Kid-safe sign-in", body: "Children sign in with a simple PIN or a login you set up for them." },
];

function Divider() {
  return (
    <div className="relative mx-auto flex max-w-3xl items-center gap-3 px-6 py-2" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-dim to-gold-dim" />
      <span className="text-xs text-[var(--gold-bright)]/40">◆</span>
      <span className="text-lg text-[var(--gold-bright)]/80">✦</span>
      <span className="text-xs text-[var(--gold-bright)]/40">◆</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold-dim to-gold-dim" />
    </div>
  );
}

export function Landing() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[linear-gradient(180deg,#060c1a_0%,#090f1f_50%,#0c1525_100%)] text-foreground">
      {/* ambient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-[#3ecfff]/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-1/3 size-96 rounded-full bg-[#7c3aed]/[0.07] blur-3xl" />

      {/* Top bar */}
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src="/crown.svg" alt="" className="h-8 w-8" aria-hidden="true" />
          <span className="font-brand text-lg tracking-wide">Kingdoms &amp; Crowns</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started</Button>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <img src="/crown.svg" alt="" className="mx-auto mb-4 h-16 w-16" aria-hidden="true" />
        <h1 className="page-title text-5xl sm:text-6xl">Be the Hero of Homeschool</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Kingdoms &amp; Crowns turns daily homeschool learning into an adventure — so kids stay
          motivated and parents keep effortless records.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup">
            <Button size="lg">Create a parent account</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Already set up by a grown-up?{" "}
          <Link href="/login?mode=kid" className="text-[var(--gold-bright)] hover:underline">
            Kids enter your family code here →
          </Link>
        </p>
      </section>

      <Divider />

      {/* The problem */}
      <section className="relative mx-auto max-w-3xl px-6 py-12 text-center">
        <h2 className="page-title text-3xl">Homeschool tracking shouldn&apos;t be a chore</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Logging what your kids studied, keeping them motivated day after day, and assembling records
          for an annual review or portfolio is tedious and easy to fall behind on. Kingdoms &amp; Crowns
          makes the daily habit fun for kids and keeps the paperwork done for you.
        </p>
      </section>

      {/* How it works */}
      <section className="relative border-y border-gold-dim/30 bg-white/[0.02] py-12">
        <div className="mx-auto max-w-5xl px-6">
        <h2 className="page-title mb-8 text-center text-3xl">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <GameFrame key={step.title}>
              <div className="space-y-2 py-2 text-center">
                <div className="text-4xl">{step.icon}</div>
                <div className="text-sm font-semibold text-[var(--gold-bright)]">
                  Step {i + 1}
                </div>
                <h3 className="text-lg font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </GameFrame>
          ))}
        </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-5xl px-6 py-12">
        <h2 className="page-title mb-8 text-center text-3xl">Everything your realm needs</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-gold-dim bg-muted/20 p-5"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-2 text-base font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* Built for parents / safety */}
      <section className="relative mx-auto max-w-3xl px-6 py-12 text-center">
        <h2 className="page-title text-3xl">Built for parents</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Only parents and guardians create accounts. Children are profiles you manage from your own
          account — they sign in with a simple PIN or a login you set up for them, never on their own.
          We don&apos;t sell data or show ads. Read our{" "}
          <Link href="/privacy" className="text-[var(--gold-bright)] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-8">
          <Link href="/signup">
            <Button size="lg">Create your parent account</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative mx-auto max-w-5xl px-6 py-10 text-center text-xs text-muted-foreground/60">
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <span className="mx-2 opacity-50">·</span>
        &copy; {new Date().getFullYear()} Kingdoms &amp; Crowns
      </footer>
    </div>
  );
}
