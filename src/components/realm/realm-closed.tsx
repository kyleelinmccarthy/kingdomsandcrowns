import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";

export function RealmClosed({ heroName, body }: { heroName: string; body: string }) {
  return (
    <GameFrame>
      <div className="realm-closed space-y-3 py-6">
        <GameIcon name="star" className="size-10 text-[var(--gold-bright)]" />
        <h2 className="text-xl font-bold">Well played, {heroName}!</h2>
        <p className="text-muted-foreground">{body}</p>
        <Link href="/tavern" className="text-primary hover:underline">Back to the Tavern →</Link>
      </div>
    </GameFrame>
  );
}
