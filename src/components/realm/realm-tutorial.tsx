"use client";

/**
 * The four verbs, one at a time, each gated on DOING the thing (§ task 13). The prompt
 * itself comes from `tutorialPrompt` in `@/lib/realm/tutorial` — the only tutorial words a
 * child ever reads live there, beside the rule that decides when each one is finished, so
 * the copy and the condition can never drift apart.
 *
 * `prompt === null` means the tutorial is over and this renders nothing at all: no empty
 * box holding a gap open above the ability bar for the rest of the visit.
 *
 * `role="status"` + `aria-live="polite"` so a screen reader hears each new step as it
 * arrives, without interrupting whatever it is already saying. The box itself is
 * `pointer-events: none` — it floats over a world the child is walking around in — and only
 * Skip takes pointer events back.
 */
export function RealmTutorial({ prompt, onSkip }: { prompt: string | null; onSkip: () => void }) {
  if (!prompt) return null;
  return (
    <div className="realm-tutorial" data-testid="realm-tutorial" role="status" aria-live="polite">
      <p className="realm-tutorial-step">{prompt}</p>
      {/* A grown-up's way out, not a child's verb: 44px like `?` and the ceremony's own
          Skip, never the 56px every control a child plays with wears. A thumb-sized Skip
          beside a thumb-sized Cast is a tutorial a child ends by accident.

          The `aria-label` says WHICH skip. The crown ceremony has a Skip of its own, and
          the two can be on screen at the same time — a hero finishing a season still has a
          tutorial to finish — so "Skip" alone would leave a screen reader offering two
          identical buttons that do entirely different things. The visible word is still
          "Skip", and it is still the start of the accessible name (WCAG 2.5.3). */}
      <button type="button" aria-label="Skip the tutorial" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}
