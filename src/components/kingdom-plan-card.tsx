"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { Button } from "@/components/ui/button";
import { pinPlan } from "@/lib/actions/improvements";
import { IMPROVEMENTS, LEVELS, hostLabel, planLine, planState, type ImprovementHost, type PlanStatus } from "@/lib/realm/improvements";
import { MATERIAL_IDS, MATERIALS, materialPhrase, type MaterialId } from "@/lib/realm/materials";
import { activePin } from "@/lib/realm/works-state";

export const PLAN_CARD_EMPTY = "Finish quests to bring materials to your kingdom.";
export const TIMBER_NOTE = "Timber can fill any gap.";

/** Where a plan stands: the building it is built on, or the place that holds it. */
function placeOf(host: ImprovementHost): string {
  return hostLabel(host) ?? (host === "keep" ? "Keep yard" : "Village");
}

/**
 * The Tavern's card for the kingdom's plans: the plan the hero pinned (else the first one they
 * could build or are closest to), what it costs against what the satchel holds, and the way to
 * the Realm, where building happens. The hero may pin; a grown-up looking in sees it read-only.
 * Plans wait on nothing but the satchel here: one that needs its building raised first, or is
 * finished, is never the plan shown.
 */
export function KingdomPlanCard({
  childId,
  canPin,
  materialsPerQuest,
  built,
  raised,
  pinned,
  balance,
}: {
  childId: string;
  /** The hero's own view: only they pin. */
  canPin: boolean;
  /** Zero (quests bring nothing) hides the card until the satchel holds something. */
  materialsPerQuest: number;
  /** The highest level built of each plan. */
  built: Record<string, number>;
  /** The ids of the core buildings that stand. */
  raised: readonly string[];
  pinned: string | null;
  balance: Record<MaterialId, number>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasMaterials = MATERIAL_IDS.some((m) => (balance[m] ?? 0) > 0);
  if (materialsPerQuest <= 0 && !hasMaterials) return null;

  const plans = planState({ built, raised: new Set(raised), balance });
  const pin = activePin({ built, pinned });
  // The active pin, else the first plan that is ready or short (planState sorts those first, nearest first).
  const plan: PlanStatus | undefined =
    (pin ? plans.find((p) => p.id === pin) : undefined) ?? plans.find((p) => p.state === "ready" || p.state === "short");
  const isPinned = plan !== undefined && plan.id === pin;

  async function togglePin(target: PlanStatus) {
    setBusy(true);
    setError("");
    try {
      await pinPlan(childId, isPinned ? null : target.id);
      router.refresh();
    } catch {
      setError("Could not pin that plan. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const cost = plan ? IMPROVEMENTS[plan.id].levels[plan.level - 1].cost : {};
  const needs = MATERIAL_IDS.filter((m) => (cost[m] ?? 0) > 0);
  // Ready only because timber fills a gap: say so, or the bars look short of a plan that says "Ready".
  const timberFills = plan?.state === "ready" && needs.some((m) => (balance[m] ?? 0) < (cost[m] ?? 0));

  return (
    <GameFrame title="Kingdom Plans" icon={<GameIcon name="castle" className="size-4 text-[var(--gold-bright)]" />}>
      <div className="space-y-3">
        {plan ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="min-w-0">
                <p className="break-words font-medium">{IMPROVEMENTS[plan.id].label}</p>
                <p className="text-xs text-muted-foreground">{placeOf(IMPROVEMENTS[plan.id].host)}</p>
              </div>
              <p className="text-xs text-muted-foreground">{`Level ${plan.level} of ${LEVELS}`}</p>
            </div>
            <p className="text-sm text-[var(--gold-bright)]">{planLine(plan)}</p>
            <ul className="space-y-1.5" aria-label="Cost">
              {needs.map((m) => {
                const need = cost[m] ?? 0;
                const have = Math.min(balance[m] ?? 0, need);
                return (
                  <li key={m} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{MATERIALS[m].label}</span>
                    <div
                      role="progressbar"
                      aria-label={`${MATERIALS[m].label}: ${have} of ${need}`}
                      aria-valuemin={0}
                      aria-valuemax={need}
                      aria-valuenow={have}
                      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full rounded-full" style={{ width: `${(have / need) * 100}%`, backgroundColor: MATERIALS[m].color }} />
                    </div>
                    <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground" aria-hidden="true">{have}/{need}</span>
                  </li>
                );
              })}
            </ul>
            {timberFills && <p className="text-xs text-muted-foreground">{TIMBER_NOTE}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{PLAN_CARD_EMPTY}</p>
        )}

        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Satchel">
          {MATERIAL_IDS.map((m) => {
            const n = balance[m] ?? 0;
            return (
              <li key={m} className={`flex items-center gap-1 text-xs ${n > 0 ? "" : "opacity-50"}`} title={MATERIALS[m].label}>
                <span style={{ color: MATERIALS[m].color }}>
                  <GameIcon name={MATERIALS[m].icon} className="size-4" />
                </span>
                <span role="img" aria-label={materialPhrase(n, m)} className="tabular-nums">{n}</span>
              </li>
            );
          })}
        </ul>

        {plan && (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={canPin ? "/realm" : `/realm?child=${childId}`} className="text-sm font-medium text-primary hover:underline">
              Build it in the Realm
            </Link>
            {canPin && (
              <Button type="button" size="sm" variant={isPinned ? "default" : "outline"} aria-pressed={isPinned} disabled={busy} onClick={() => togglePin(plan)}>
                {isPinned ? "Pinned" : "Pin"}
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </GameFrame>
  );
}
