"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { regenerateFamilyLoginCode } from "@/lib/actions/child-auth";

export function FamilyLoginCode({ code }: { code: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      await regenerateFamilyLoginCode();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameFrame title="Family Login Code" icon="🔑">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Heroes use this code at <span className="font-medium">/play</span> to find the family
          and sign in with their PIN on their own device. Keep it within the family.
        </p>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-gold-dim bg-muted/40 px-4 py-2 font-mono text-xl tracking-[0.3em]">
            {code ?? "— — — —"}
          </span>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
            {busy ? "Forging..." : code ? "Regenerate" : "Generate code"}
          </Button>
        </div>
        {code && (
          <p className="text-xs text-muted-foreground">
            Regenerating invalidates the old code immediately.
          </p>
        )}
      </div>
    </GameFrame>
  );
}
