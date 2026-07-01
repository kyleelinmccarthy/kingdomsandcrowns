import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

const HOW_IT_WORKS: {
  icon: GameIconName;
  title: string;
  body: string;
  img: string;
  alt: string;
  pos?: string;
}[] = [
  {
    icon: "castle",
    title: "Set up your family",
    body: "Create your parent account, add each student as a hero, and choose their subjects and quests.",
    img: "/marketing/step1-family.jpg",
    alt: "A smiling parent and child cuddled together on a sofa, looking at a laptop together",
  },
  {
    icon: "swords",
    title: "Heroes log their learning",
    body: "Students complete quests and record what they studied — earning XP, streaks, badges, and loot for their hero.",
    img: "/marketing/step2-device.jpg",
    alt: "A happy young student typing on a laptop at a desk, a notebook and pen beside them",
  },
  {
    icon: "book",
    title: "See their progress",
    body: "Get weekly summaries and per-subject history you can copy into reviews, portfolios, or your records.",
    img: "/marketing/step3-plant.jpg",
    alt: "A smiling parent using a laptop at home beside a large leafy houseplant",
  },
];

const FEATURES: { icon: GameIconName; title: string; body: string }[] = [
  { icon: "scroll", title: "Quests & XP", body: "Turn daily lessons into quests with rewards that keep students motivated." },
  { icon: "gem", title: "Loot & heroes", body: "Heroes unlock outfits, companions, and castles as they level up." },
  { icon: "book", title: "Weekly recaps", body: "Auto-generated learning logs for record-keeping and reviews." },
  { icon: "trophy", title: "Ranks", body: "A family hall of legends — plus an opt-in community leaderboard." },
  { icon: "shield", title: "Multiple guardians", body: "Invite a co-parent, tutor, or teacher with view-only or edit access." },
  { icon: "key", title: "Student-safe sign-in", body: "Students sign in with a simple PIN or a login you set up for them." },
];

// Shared frame styling so every photo reads as part of the gold + navy game UI.
const FRAME =
  "overflow-hidden rounded-xl border border-[var(--gold-border)] shadow-[0_2px_4px_rgba(0,0,0,0.6),0_12px_34px_-12px_rgba(0,0,0,0.7),0_0_34px_-12px_rgba(201,168,76,0.28)]";

// Secondary call-to-action — filled navy with a gold edge so it reads as clearly
// clickable (not disabled/ghost) beside the primary cyan button.
const CTA_SECONDARY =
  "border border-[var(--gold-border)] bg-[#1d2e4b] text-foreground hover:bg-[#26375a] hover:text-foreground";

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
      {/* Hero backdrop — a kingdom at dusk, faded into the page so it reads as
          atmosphere rather than a boxed-in photo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[600px] overflow-hidden sm:h-[680px]">
        <Image
          src="/marketing/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_78%]"
        />
        {/* keep the sky up top, then darken through the middle so the hero copy stays readable */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,12,26,0.35)_0%,rgba(6,12,26,0.12)_20%,rgba(7,13,28,0.72)_56%,rgba(9,15,31,0.95)_84%,#090f1f_100%)]" />
        {/* soft radial focus behind the headline block */}
        <div className="absolute inset-0 bg-[radial-gradient(125%_72%_at_50%_48%,transparent_0%,transparent_36%,rgba(6,12,26,0.55)_100%)]" />
      </div>

      {/* ambient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 z-0 size-96 rounded-full bg-[#3ecfff]/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-32 z-0 size-96 rounded-full bg-[#7c3aed]/[0.07] blur-3xl" />

      <div className="relative z-10">
        {/* Top bar */}
        <MarketingHeader />

        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pb-14 pt-6 text-center sm:pt-8">
          <img src="/crown.svg" alt="" className="mx-auto mb-3 h-12 w-12 drop-shadow-[0_0_24px_rgba(201,168,76,0.35)]" aria-hidden="true" />
          <h1 className="page-title text-4xl [text-shadow:0_2px_24px_rgba(0,0,0,0.55)] sm:text-5xl">Be the Hero of Homeschool</h1>
          <h2 className="mx-auto mt-3 max-w-2xl text-lg font-bold text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.7)] sm:text-xl">
            Homeschool tracking shouldn&apos;t be a chore. It should be an epic journey.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/90 [text-shadow:0_1px_12px_rgba(0,0,0,0.85)] sm:text-base">
            Logging what your students studied, keeping them motivated day after day, and assembling records
            for an annual review or portfolio is tedious and easy to fall behind on. Kingdoms &amp; Crowns
            makes the daily habit fun for students and keeps the paperwork done for you.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Create a parent account</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary" className={CTA_SECONDARY}>
                Parent Sign In
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-foreground/75 [text-shadow:0_1px_10px_rgba(0,0,0,0.85)]">
            Already set up by a grown-up? Students can log in or enter your family code{" "}
            <Link
              href="/login?mode=kid"
              className="text-[var(--gold-bright)] underline underline-offset-2 hover:text-[var(--gold)]"
            >
              here →
            </Link>
          </p>
        </section>

        <Divider />

        {/* How it works */}
        <section id="how-it-works" className="border-y border-gold-dim/30 bg-white/[0.02] py-12">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="page-title mb-8 text-center text-3xl">How it works</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {HOW_IT_WORKS.map((step, i) => (
                <div
                  key={step.title}
                  className={`group relative bg-[linear-gradient(180deg,rgba(20,30,55,0.55),rgba(10,16,32,0.94))] ${FRAME}`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={step.img}
                      alt={step.alt}
                      fill
                      sizes="(min-width: 768px) 340px, 100vw"
                      className={`object-cover transition-transform duration-500 group-hover:scale-105 ${step.pos ?? ""}`}
                    />
                    {/* cool tint to unify warm photos with the navy theme */}
                    <div className="absolute inset-0 bg-[#0e1a30]/20" />
                    {/* fade the bottom of the photo into the card */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0b1322]" />
                  </div>
                  {/* gold icon medallion straddling the photo edge */}
                  <div className="relative -mt-7 flex justify-center">
                    <div className="grid size-14 place-items-center rounded-full border-2 border-[var(--gold-border)] bg-[linear-gradient(135deg,#151f33,#0a0f1e)] shadow-[inset_0_1px_4px_rgba(0,0,0,0.5),0_0_16px_-4px_var(--glow-gold)]">
                      <GameIcon
                        name={step.icon}
                        className="size-7 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 px-5 pb-6 pt-2 text-center">
                    <div className="text-xs font-semibold tracking-wider text-[var(--gold-bright)] uppercase">
                      Step {i + 1}
                    </div>
                    <h3 className="text-lg font-medium">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Link href="/how-it-works">
                <Button size="lg" variant="secondary" className={CTA_SECONDARY}>
                  See the full walkthrough →
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-6 py-12">
          {/* banner heading over the realm's library */}
          <div className={`relative mb-10 ${FRAME}`}>
            <div className="relative aspect-[16/9] w-full sm:aspect-[16/6]">
              <Image
                src="/marketing/features-books.jpg"
                alt="Shelves of antique leather-bound books with gold-lettered spines"
                fill
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[#060c1a]/55" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1020] via-[#0a1020]/35 to-[#0a1020]/65" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <h2 className="page-title text-3xl [text-shadow:0_2px_20px_rgba(0,0,0,0.7)] sm:text-4xl">
                Everything your homeschool needs
              </h2>
              <p className="mt-2 max-w-md text-sm text-foreground/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.7)]">
                A complete toolkit to keep students motivated and your records organized.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-gold-dim bg-muted/20 p-5">
                <GameIcon name={f.icon} className="size-8 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]" />
                <h3 className="mt-2 text-base font-medium">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Built for parents / safety — bracketed by border lines like "How it works" */}
        <section className="border-t border-gold-dim/30 bg-white/[0.02] py-12">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div className={`relative aspect-[4/3] ${FRAME}`}>
                <Image
                  src="/marketing/parents-help.jpg"
                  alt="A parent helping a student with schoolwork at a table at home, both writing together"
                  fill
                  sizes="(min-width: 768px) 480px, 100vw"
                  className="object-cover saturate-[.95]"
                />
                <div className="absolute inset-0 bg-[#0a1428]/35" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1020]/75 to-transparent" />
              </div>
              <div className="text-center md:text-left">
                <h2 className="page-title text-3xl">Built for parents</h2>
                <p className="mt-4 max-w-xl text-muted-foreground">
                  Only parents and guardians can create an account. Students are profiles you set up and manage
                  from your own account. They sign in with a simple PIN or a login you create for them, and can
                  never register on their own.
                </p>
                <p className="mt-4 max-w-xl text-muted-foreground">
                  We never sell your data or show ads.
                </p>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  Read our{" "}
                  <Link href="/privacy" className="text-[var(--gold-bright)] hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start">
                  <Link href="/signup">
                    <Button size="lg">Create your parent account</Button>
                  </Link>
                  <Link href="/login">
                    <Button size="lg" variant="secondary" className={CTA_SECONDARY}>
                      Parent Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer — a distinct banded section, mirroring the header */}
        <MarketingFooter />
      </div>
    </div>
  );
}
