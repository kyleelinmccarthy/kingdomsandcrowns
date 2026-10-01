"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordWagePayout } from "@/lib/actions/wages";
import { formatWagesAsDollars } from "@/lib/utils/wages";

type LedgerEntry = {
  id: string;
  type: "earned" | "payout" | "reversal";
  amountCents: number;
  taskTitle: string | null;
  date: string;
  note: string | null;
};

const TYPE_LABELS: Record<LedgerEntry["type"], string> = {
  earned: "Earned",
  payout: "Paid",
  reversal: "Reversed",
};

export function StewardsLedger({
  childId,
  balanceCents,
  entries,
}: {
  childId: string;
  balanceCents: number;
  entries: LedgerEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pay() {
    setError(null);
    startTransition(async () => {
      try {
        // A positive amount; recordWagePayout applies the sign.
        await recordWagePayout(childId, amount, note || undefined);
        setAmount("");
        setNote("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record the payment");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Outstanding balance</p>
        <p className="text-2xl font-medium">{formatWagesAsDollars(balanceCents)}</p>
        {balanceCents < 0 && (
          <p className="text-xs text-muted-foreground">Paid ahead of what has been earned.</p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <Label htmlFor="payout-amount">Record a payment</Label>
        <div className="flex gap-2">
          <Input
            id="payout-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            inputMode="decimal"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            aria-label="Payment note"
          />
          <Button disabled={pending || !amount.trim()} onClick={pay}>
            Record
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-1">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
          >
            <div className="min-w-0">
              <span className="text-muted-foreground">{entry.date}</span>{" "}
              <span>{entry.taskTitle ?? TYPE_LABELS[entry.type]}</span>
              {entry.note && (
                <span className="text-muted-foreground"> — {entry.note}</span>
              )}
            </div>
            <span
              className={
                entry.amountCents < 0 ? "text-muted-foreground" : "text-[var(--gold-bright)]"
              }
            >
              {formatWagesAsDollars(entry.amountCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
