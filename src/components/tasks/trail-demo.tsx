"use client";

/**
 * "Watch Pip" follow a clue (R-H16): a young hero (K–3) meets one worked clue before their first, as
 * Pip shows a lock and Aldo the bench. One fixed example, its three steps in order, the words, and a
 * "Got it" button that takes the focus, so Enter or Space carries on. Nothing moves in calm play.
 * `useTaskDemo` (task-demo.tsx) decides when it shows.
 *
 * `PipSteps` is the card itself, shared with Pip's rune (`rune-demo.tsx`): only the steps, their
 * icons and the words differ.
 */
import { useEffect, useId, useRef } from "react";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { TRAIL_DEMO_COPY, TRAIL_DEMO_STEPS, TRAIL_DEMO_STEPS_LABEL } from "@/lib/tasks/trail-copy";
import "./trail.css";

const STEP_ICONS: readonly GameIconName[] = ["scroll", "journey", "check"];

type DemoProps = { onDone(): void; calm: boolean; variant?: "board" | "page" };

/** Pip's worked example as three steps and its words, with "Got it" taking the focus. */
export function PipSteps({ steps, icons, copy, onDone, calm, variant = "board" }: DemoProps & { steps: readonly string[]; icons: readonly GameIconName[]; copy: string }) {
  const titleId = useId();
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <section className={`trail trail--${variant}${calm ? "" : " trail--move"} trail-demo`} aria-labelledby={titleId}>
      <h3 id={titleId} className="trail-title">
        Watch Pip
      </h3>
      <ol className="trail-demo-steps" aria-label={TRAIL_DEMO_STEPS_LABEL}>
        {steps.map((step, i) => (
          <li key={step} className="trail-demo-step">
            <GameIcon name={icons[i]} className="trail-demo-step-icon" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="trail-demo-text">{copy}</p>
      <button ref={go} type="button" className="trail-go" onClick={onDone}>
        Got it
      </button>
    </section>
  );
}

export function TrailDemo(props: DemoProps) {
  return <PipSteps steps={TRAIL_DEMO_STEPS} icons={STEP_ICONS} copy={TRAIL_DEMO_COPY} {...props} />;
}
