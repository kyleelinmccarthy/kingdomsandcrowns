"use client";

/**
 * A WALK'S CARD (RI-a / S14): the shell both walks' trackers wear, the reading trail's
 * (`trail-walk.tsx`) and the rune walk's (`rune-walk.tsx`). A small plank at the head of the
 * top-left column, over the world: a region with its name, a head that is one row at every size (an
 * icon, what the walk shows there, Hide or Show, and any tools of the walk's own), a body that
 * scrolls, the finish's error with its retry, and a foot that ends with Leave.
 *
 * The layout is slice 5's, fixed at larger text and on short phones (`trail-walk.css`, shared by
 * both): the head and foot are pinned, only the body scrolls and it keeps a floor, the card is never
 * narrower than its head, and the head's icon buttons take a 40 px tap. It never takes the focus by
 * itself, so the game's keys keep working while it is up.
 */

import type { ReactNode } from "react";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import "./trail-walk.css";

export function WalkCard({
  label,
  icon,
  head,
  tools,
  folded,
  onFold,
  hideLabel,
  showLabel,
  foot,
  leaveLabel,
  onLeave,
  leaveDisabled,
  error,
  retryLabel,
  onRetry,
  retryDisabled,
  hidden,
  calm,
  className,
  children,
}: {
  /** The region's name ("Reading trail", "Rune walk"). */
  label: string;
  icon: GameIconName;
  /** What the head shows between the icon and its buttons: the dots, the count. */
  head: ReactNode;
  /** The walk's own head buttons after Hide (the trail's Read aloud), shown while the card is open. */
  tools?: ReactNode;
  folded: boolean;
  onFold: () => void;
  /** Hide's and Show's words: the fold button's name and title. */
  hideLabel: string;
  showLabel: string;
  /** What the foot holds before Leave (Show me, a finish). */
  foot?: ReactNode;
  leaveLabel: string;
  onLeave: () => void;
  /** Leave waits while a finish is out, so a finished run is never stranded. */
  leaveDisabled: boolean;
  /** A refused call's line, pinned with the foot so its retry never scrolls out of reach. */
  error: string;
  /** The retry after the error (a finish asked again); absent, the line stands alone. */
  retryLabel?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  /** A panel is open over the world: the card is hidden, and keeps its place. */
  hidden: boolean;
  calm: boolean;
  className?: string;
  /** The body: the lines and what the walk is on. */
  children: ReactNode;
}) {
  const fold = folded ? showLabel : hideLabel;
  return (
    <section className={`trail-walk r3-plank${calm ? " trail-walk--calm" : ""}${className ? ` ${className}` : ""}`} role="region" aria-label={label} hidden={hidden}>
      <div className="trail-walk-head">
        <GameIcon name={icon} className="trail-walk-icon" />
        {head}
        {/* Compact icon buttons, so the head is one row at every size (their words are their names and titles).
            In the head, never in the scrolling body, so they are always in reach (a short phone, larger text). */}
        <button type="button" className="r3-round trail-walk-btn trail-walk-fold" aria-label={fold} title={fold} aria-expanded={!folded} onClick={onFold}>
          <span className="trail-walk-chevron" aria-hidden="true" />
        </button>
        {!folded && tools}
      </div>
      {/* The head and the foot are pinned; only the body (the lines and the clue) scrolls when the card is capped. */}
      {!folded && <div className="trail-walk-body">{children}</div>}
      {/* Pinned with the foot: a failed finish's retry never scrolls out of reach. */}
      {!folded && error && (
        <p className="r3-board-error trail-walk-error" role="alert">
          {error}{" "}
          {retryLabel && onRetry && (
            <button type="button" className="r3-link-button" disabled={retryDisabled} onClick={onRetry}>
              {retryLabel}
            </button>
          )}
        </p>
      )}
      {!folded && (
        <div className="trail-walk-foot">
          {foot}
          <button type="button" className="r3-link-button trail-walk-leave" disabled={leaveDisabled} onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      )}
    </section>
  );
}
