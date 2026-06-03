import Link from "next/link";
import { HeroLogin } from "@/components/hero-login";

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <img src="/crown.svg" alt="" className="mx-auto mb-2 h-14 w-14" />
        <h1 className="page-title text-3xl">Play as a Hero</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your grown-up sets up your hero. Enter your family code and tap your hero to begin.
        </p>
      </div>

      <div className="w-full rounded-lg border-2 border-[var(--gold-border)] bg-background/60 p-6">
        <HeroLogin mode="standalone" prefillCode={code ?? ""} />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Have your own email login?{" "}
        <Link href="/login" className="text-[var(--gold-bright)] hover:underline">
          Sign in here
        </Link>
      </p>
    </div>
  );
}
