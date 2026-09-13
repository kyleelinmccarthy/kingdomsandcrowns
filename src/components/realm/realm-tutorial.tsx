"use client";

/**
 * The four verbs, one at a time, each gated on DOING the thing (§ task 13). The prompt
 * itself comes from `tutorialPrompt` in `@/lib/realm/tutorial` — the only tutorial words a
 * child ever reads live there, beside the rule that decides when each one is finished, so
 * the copy and the condition can never drift apart.
 *
 * `role="status"` + `aria-live="polite"` so a screen reader hears each new step as it
 * arrives, without interrupting whatever it is already saying. The box itself is
 * `pointer-events: none` — it floats over a world the child is walking around in — and only
 * Skip takes pointer events back.
 *
 * The box is ALWAYS MOUNTED, even with nothing to say, and this is the part that is easy to
 * get wrong. A live region only announces MUTATIONS that happen after it has entered the
 * accessibility tree; a region that arrives already containing its text announces nothing.
 * `realm-messages.tsx` states that rule in its own comment — "both <p>s are always mounted so
 * the live regions never remount and an announcement is never lost" — and this component used
 * to return `null` whenever there was no prompt, so every transition from silence back to a
 * prompt (a kingdom that failed to load and then retried; the help card's "Show me the
 * tutorial again" after the walkthrough was finished) re-created the region and was silent.
 *
 * Rendering nothing visible is then the stylesheet's job, not this component's: with the step
 * paragraph empty, `.realm-tutorial:has(.realm-tutorial-step:empty)` drops the padding, the
 * border and the background, which collapses an absolutely positioned box to 0x0 — present in
 * the accessibility tree, and holding no gap open above the ability bar, which is what the
 * early return was protecting. `display: none` would not do: it would take the region back out
 * of the tree and put us where we started.
 *
 * Skip goes with the prompt. A control for skipping a walkthrough that is not running has
 * nothing to do, and leaving it mounted would leave a 44px pointer target sitting in an
 * otherwise empty box.
 */
export function RealmTutorial({ prompt, onSkip }: { prompt: string | null; onSkip: () => void }) {
  return (
    <div className="realm-tutorial" data-testid="realm-tutorial" role="status" aria-live="polite">
      <p className="realm-tutorial-step">{prompt ?? ""}</p>
      {/* A grown-up's way out, not a child's verb: 44px like `?` and the ceremony's own
          Skip, never the 56px every control a child plays with wears. A thumb-sized Skip
          beside a thumb-sized Cast is a tutorial a child ends by accident.

          The `aria-label` says WHICH skip. The crown ceremony has a Skip of its own, and
          the two can be on screen at the same time — a hero finishing a season still has a
          tutorial to finish — so "Skip" alone would leave a screen reader offering two
          identical buttons that do entirely different things. The visible word is still
          "Skip", and it is still the start of the accessible name (WCAG 2.5.3). */}
      {prompt ? (
        <button type="button" aria-label="Skip the tutorial" onClick={onSkip}>
          Skip
        </button>
      ) : null}
    </div>
  );
}
