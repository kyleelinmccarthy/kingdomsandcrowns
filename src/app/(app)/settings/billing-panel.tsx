"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, createBillingPortalSession } from "@/lib/actions/billing";
import type { SubscriptionStatus } from "@/lib/billing/plan";

const STATUS_COPY: Record<SubscriptionStatus, { label: string; tone: string }> = {
  free: { label: "Free plan", tone: "text-muted-foreground" },
  trialing: { label: "Trial active", tone: "text-emerald-600 dark:text-emerald-400" },
  active: { label: "Kingdom plan", tone: "text-emerald-600 dark:text-emerald-400" },
  past_due: { label: "Payment past due", tone: "text-red-600 dark:text-red-400" },
  canceled: { label: "Subscription canceled", tone: "text-muted-foreground" },
};

export function BillingPanel({ enabled, status }: { enabled: boolean; status: SubscriptionStatus }) {
  if (!enabled) {
    return (
      <div className="space-y-1">
        <p className="font-medium">Kingdom plan — coming soon</p>
        <p className="text-sm text-muted-foreground">
          Every feature is free for now: as many heroes and grown-ups as your family needs, and
          weekly summaries you can save and keep.
        </p>
      </div>
    );
  }
  return <LiveBillingPanel status={status} />;
}

function LiveBillingPanel({ status }: { status: SubscriptionStatus }) {
  const [pending, startTransition] = useTransition();
  const copy = STATUS_COPY[status];
  const isPaid = status === "active" || status === "trialing";

  function upgrade(interval: "monthly" | "yearly") {
    startTransition(async () => {
      await createCheckoutSession(interval);
    });
  }

  function manage() {
    startTransition(async () => {
      await createBillingPortalSession();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Billing</p>
        <p className={`text-sm ${copy.tone}`}>{copy.label}</p>
      </div>

      {isPaid || status === "past_due" ? (
        <div className="space-y-2">
          {status === "past_due" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Your last payment didn&rsquo;t go through. Update your card to keep the Kingdom plan
              — your family&rsquo;s heroes and records are safe either way.
            </p>
          )}
          <Button type="button" onClick={manage} disabled={pending}>
            Manage billing
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Free plan: 1 hero, 1 adult account. Upgrade for unlimited heroes, co-parent and tutor
            seats, and weekly compliance summaries.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => upgrade("monthly")} disabled={pending}>
              Upgrade — monthly
            </Button>
            <Button type="button" variant="outline" onClick={() => upgrade("yearly")} disabled={pending}>
              Upgrade — yearly
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
