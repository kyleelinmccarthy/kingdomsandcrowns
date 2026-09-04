import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import type { GateCopy } from "@/lib/realm/play-clock";

export function RealmGate({ copy, heroName }: { copy: GateCopy; heroName: string }) {
  return (
    <GameFrame>
      <div className="realm-gate space-y-3 py-6">
        <GameIcon name="lock" className="size-10 text-[var(--gold-bright)]" />
        <h2 className="text-xl font-bold">{copy.title}</h2>
        <p className="text-muted-foreground">{copy.body}</p>
        <Link href="/quests" className="text-primary hover:underline">Open {heroName}&rsquo;s Quest Log →</Link>
      </div>
    </GameFrame>
  );
}
