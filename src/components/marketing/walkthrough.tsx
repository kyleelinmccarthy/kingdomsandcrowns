"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { GameIcon } from "@/components/game-icon";
import {
  WALKTHROUGH,
  PERSONA_ORDER,
  type Persona,
  type WalkthroughStep,
} from "@/components/marketing/walkthrough-data";

// Same gold + navy frame the landing photos use, so screenshots read as part of
// the game UI.
const FRAME =
  "overflow-hidden rounded-xl border border-[var(--gold-border)] shadow-[0_2px_4px_rgba(0,0,0,0.6),0_12px_34px_-12px_rgba(0,0,0,0.7),0_0_34px_-12px_rgba(201,168,76,0.28)]";

function personaFromParam(value: string | null): Persona {
  return value === "hero" ? "hero" : "parent";
}

export function Walkthrough() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = personaFromParam(searchParams.get("view"));

  function switchPersona(persona: Persona) {
    const params = new URLSearchParams(searchParams.toString());
    if (persona === "parent") {
      params.delete("view");
    } else {
      params.set("view", persona);
    }
    const qs = params.toString();
    router.push(`/how-it-works${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const track = WALKTHROUGH[active];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      {/* Heading */}
      <div className="text-center">
        <img
          src="/crown.svg"
          alt=""
          className="mx-auto mb-3 h-11 w-11 drop-shadow-[0_0_24px_rgba(201,168,76,0.35)]"
          aria-hidden="true"
        />
        <h1 className="page-title text-4xl sm:text-5xl">How Kingdoms &amp; Crowns works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          A guided tour of the real app — from a parent&apos;s side and a hero&apos;s side. Switch
          between the two journeys below.
        </p>
      </div>

      {/* Persona toggle */}
      <div className="mt-8 flex justify-center">
        <div
          role="tablist"
          aria-label="Choose a journey"
          className="flex w-full max-w-md gap-1 rounded-xl border border-gold-dim bg-muted/40 p-1"
        >
          {PERSONA_ORDER.map((persona) => {
            const isActive = active === persona;
            return (
              <button
                key={persona}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => switchPersona(persona)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GameIcon
                  name={WALKTHROUGH[persona].icon}
                  className="size-4 text-[var(--gold-bright)]"
                />
                {WALKTHROUGH[persona].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Intro for the active persona */}
      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-foreground/85">{track.intro}</p>

      {/* Steps */}
      <div className="mt-10 space-y-12">
        {track.steps.map((step, i) => (
          <StepBlock key={step.id} step={step} index={i} />
        ))}
      </div>

      {/* Closing CTA */}
      <div className="mt-16 rounded-xl border border-gold-dim bg-white/[0.02] px-6 py-10 text-center">
        <h2 className="page-title text-2xl sm:text-3xl">Ready to begin your quest?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Create a free parent account and recruit your first hero in minutes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create a parent account
          </a>
          <a
            href="/login?mode=kid"
            className="inline-flex h-11 items-center justify-center rounded-md border border-[var(--gold-border)] bg-[#1d2e4b] px-6 text-sm font-medium text-foreground transition-colors hover:bg-[#26375a]"
          >
            Student sign in
          </a>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ step, index }: { step: WalkthroughStep; index: number }) {
  const [variantKey, setVariantKey] = useState(step.variants?.[0]?.key);
  const variant = step.variants?.find((v) => v.key === variantKey) ?? step.variants?.[0];
  const screenshot = variant?.screenshot ?? step.screenshot;
  const callouts = variant?.callouts ?? step.callouts ?? [];

  return (
    <section id={step.id} className="scroll-mt-24">
      {/* Step header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-[var(--gold-border)] bg-[linear-gradient(135deg,#151f33,#0a0f1e)] shadow-[inset_0_1px_4px_rgba(0,0,0,0.5),0_0_16px_-4px_var(--glow-gold)]">
          <GameIcon
            name={step.icon}
            className="size-6 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-bright)]">
            Step {index + 1} · {step.routeLabel}
          </p>
          <h2 className="page-title text-2xl">{step.title}</h2>
        </div>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{step.summary}</p>

      {/* Optional sub-toggle (e.g. new account vs. invited guardian) */}
      {step.variants && step.variants.length > 1 && (
        <div className="mb-5 inline-flex gap-1 rounded-lg border border-gold-dim bg-muted/40 p-1">
          {step.variants.map((v) => {
            const isActive = v.key === variant?.key;
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setVariantKey(v.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.tabLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* Screenshot + numbered legend */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div
          className={cn(
            "bg-[linear-gradient(180deg,rgba(20,30,55,0.55),rgba(10,16,32,0.94))]",
            FRAME,
          )}
        >
          {screenshot && (
            <Image
              src={screenshot.src}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
              sizes="(min-width: 1024px) 720px, 100vw"
              className="h-auto w-full"
              priority={index === 0}
            />
          )}
        </div>
        <ol className="space-y-3">
          {callouts.map((c) => (
            <li key={c.n} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--gold-border)] bg-[#1d2e4b] text-xs font-bold text-[var(--gold-bright)]">
                {c.n}
              </span>
              <span className="text-sm leading-relaxed">
                <span className="font-semibold text-foreground">{c.label}.</span>{" "}
                <span className="text-muted-foreground">{c.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
