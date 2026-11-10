"use client";

/**
 * The work surface for a multiple-choice task: one button per choice, toned by where the question
 * stands (`choiceTone`). The Realm's board and the Side Quests page both render it; `variant`
 * keeps each one's own class names, so neither's CSS moved. The board also answers to the number
 * row (1 to 4), the way a child casts; Enter and Space belong to whichever button has focus.
 */
import { useEffect, useRef } from "react";
import { choiceTone, type ChoiceTone } from "@/lib/utils/deed-run-flow";
import type { PresenterProps } from "./presenters";

const PAGE_TONE_CLASS: Record<ChoiceTone, string> = {
  plain: "border-gold-dim bg-muted/20",
  answer: "border-[var(--gold-border)] bg-muted/40",
  "ruled-out": "border-dashed border-gold-dim bg-muted/10 opacity-50 line-through",
  "picked-wrong": "border-destructive/60 bg-destructive/10 opacity-70",
  faded: "opacity-60",
};

export function ChoicePresenter({ task, flow, variant, disabled, calm, onRespond }: PresenterProps<"choice">) {
  const { choices } = task.view;
  const { phase, index } = flow;
  const firstOpenChoice = useRef<HTMLButtonElement>(null);
  const firstOpen = choices.findIndex((c) => !flow.ruledOut.includes(c));

  // Focus follows the question: the first open choice (a second chance skips the crossed-out
  // pick). Once it is resolved, focus is the player's, on its Next button.
  useEffect(() => {
    if (phase !== "resolved") firstOpenChoice.current?.focus();
  }, [phase, index]);

  // The number row answers on the board. The latest respond is kept in a ref so the listener is
  // bound once per question, not once per render.
  const respondRef = useRef(onRespond);
  useEffect(() => {
    respondRef.current = onRespond;
  });
  useEffect(() => {
    if (variant !== "board") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.code.startsWith("Digit")) return;
      const choice = choices[Number(e.code.slice(5)) - 1];
      if (!choice) return;
      e.preventDefault();
      respondRef.current(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, choices]);

  const buttons = choices.map((choice, i) => {
    const tone = choiceTone(flow, choice);
    const ruledOut = tone === "ruled-out";
    const sparkling = !calm && tone === "answer" && flow.result?.correct;
    const common = {
      ref: i === firstOpen ? firstOpenChoice : undefined,
      type: "button" as const,
      "data-tone": tone,
      disabled: phase === "resolved" || ruledOut || disabled,
      "aria-disabled": ruledOut || undefined,
      onClick: () => onRespond(choice),
    };
    if (variant === "board") {
      return (
        <button key={choice} {...common} className={`r3-choice r3-choice--${tone}${sparkling ? " r3-choice--sparkle" : ""}`}>
          <span className="r3-choice-key" aria-hidden="true">
            {i + 1}
          </span>
          <span className="r3-choice-text">{choice}</span>
          {ruledOut && <span className="sr-only"> (not this one)</span>}
        </button>
      );
    }
    return (
      <button key={choice} {...common} className={`min-h-16 rounded-lg border px-4 py-3 text-lg ${PAGE_TONE_CLASS[tone]} ${sparkling ? "deed-sparkle" : ""}`}>
        {choice}
        {ruledOut && <span className="sr-only"> (not this one)</span>}
      </button>
    );
  });

  return variant === "board" ? <div className="r3-choices">{buttons}</div> : <div className="grid gap-3 sm:grid-cols-2">{buttons}</div>;
}
