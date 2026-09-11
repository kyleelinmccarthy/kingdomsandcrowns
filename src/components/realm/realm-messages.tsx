"use client";

import type { RealmProblem, RealmSpeech } from "@/lib/realm/messages";

/**
 * Two centred lanes, one message each (§3.6). Both <p>s are always mounted so the
 * live regions never remount and an announcement is never lost to a re-created node;
 * `.realm-message:empty { display: none }` is what hides the quiet one.
 *
 * The layer is pass-through: `pointerEvents: "none"` is set inline as well as in CSS
 * so a jsdom test can read it (D10.1), and the action button is the single element in
 * the layer that takes a pointer. The edge-arrow node gets the same inline treatment —
 * jsdom never parses the stylesheet, and this is the property standing between a world
 * that responds to taps and one that silently eats them at the top of the screen.
 */
const ALERT_KINDS = new Set<RealmProblem["kind"]>(["spriteError", "kingdomError", "ceremonyError"]);

export function RealmMessages({
  problem,
  speech,
  arrowRef,
  onAction,
  hudScale,
}: {
  problem: RealmProblem | null;
  speech: RealmSpeech | null;
  arrowRef: React.RefObject<HTMLDivElement | null>;
  onAction: () => void;
  hudScale: number;
}) {
  return (
    <div className="realm-messages" data-testid="realm-messages" style={{ pointerEvents: "none", fontSize: `${hudScale}em` }}>
      <p
        className="realm-message realm-message--problem"
        data-testid="realm-problem"
        // An error interrupts; a one-minute banner and the parent's preview line do not.
        // `aria-live="polite"` stays on both so an alert never talks over a child mid-sentence.
        role={problem && ALERT_KINDS.has(problem.kind) ? "alert" : "status"}
        aria-live="polite"
      >
        {problem?.text ?? ""}
        {problem?.actionLabel ? (
          <button type="button" style={{ pointerEvents: "auto" }} onClick={onAction}>
            {problem.actionLabel}
          </button>
        ) : null}
      </p>
      {/* Written per frame by the scene (task 16) straight to `hidden` and `style.transform`. */}
      <div ref={arrowRef} className="realm-edge-arrow" aria-hidden="true" hidden style={{ pointerEvents: "none" }} />
      <p
        className={`realm-message realm-message--${speech?.tone ?? "plain"}`}
        data-testid="realm-speech"
        role="status"
        aria-live="polite"
      >
        {speech?.text ?? ""}
      </p>
    </div>
  );
}
