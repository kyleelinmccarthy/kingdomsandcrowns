"use client";

/**
 * The picture run (R-H15): a reading clue answered off the Realm, on a village map seen from above.
 * Used on the Side Quests page, and on any board with no walk to hand the run to.
 *
 * The picture is an `<svg>` drawn underneath and hidden from screen readers; the places are real
 * HTML buttons laid over it (F-13), never inside the `<svg>`, so a finger, a mouse, the keyboard and
 * a screen reader all work them. Every one of the village's 14 anchors is a button (R-H6), in
 * catalog order, which is the tab order, each named by its label. A tap selects; "Search here" sends.
 *
 * The browser holds no answer: before a clue is resolved, no place looks or reads differently from
 * another, apart from the one the child has picked. Once resolved, a miss marks the place the server
 * revealed ("It was here."), only when that reveal is still one of the anchors (F-17); a right search
 * puts a check on the place picked. A place already searched on this clue is ruled out ("Not here").
 *
 * Enter and Space stay on the map, so they never act in the Realm behind the board; Esc and every
 * other key bubble, so Esc still closes it.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { GameIcon } from "@/components/game-icon";
import { ANCHOR_IDS, ANCHORS, isAnchorId, type AnchorId } from "@/lib/realm/anchors";
import { TRAIL_MAP_HIT, TRAIL_MAP_VIEW, trailMapBackdrop, trailMapPoint, trailMapTagPlace } from "@/lib/realm/trail-map";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { TRAIL_MAP_HELP, TRAIL_MAP_LABEL, TRAIL_MAP_REVEAL, TRAIL_MAP_RULED_OUT, TRAIL_MAP_SEARCH } from "@/lib/tasks/trail-copy";
import type { FlowState } from "@/lib/utils/deed-run-flow";
import "./trail.css";

const { w: W, h: H } = TRAIL_MAP_VIEW;
const BACKDROP = trailMapBackdrop();

/**
 * Each place's button: its label, icon and spot on the picture, as percentages of the box, and
 * where its tag sits so it stays inside the map (`trailMapTagPlace`, H8).
 */
const SPOTS = ANCHOR_IDS.map((id) => {
  const a = ANCHORS[id];
  const p = trailMapPoint(a.x, a.z);
  const tag = trailMapTagPlace(p);
  return {
    id, label: a.label, icon: a.icon, left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`,
    tagClass: `trail-spot-tag--x-${tag.x} trail-spot-tag--y-${tag.y}`,
  };
});

/**
 * The box's size and the spots' own share of it, from the map's geometry (H8): a button is
 * 2 x `TRAIL_MAP_HIT` of the picture's `W` units, so the CSS never repeats those numbers.
 */
const BOX_STYLE = { aspectRatio: `${W} / ${H}`, "--trail-spot-size": `${((2 * TRAIL_MAP_HIT) / W) * 100}%` } as CSSProperties;

/** The keys a trail's surfaces (the map, Set off) keep from the game; Esc and the rest bubble. */
export const TRAIL_KEEP_KEYS = /^(?:Enter| |Spacebar)$/;

type Tone = "ruled-out" | "answer" | "right";

export function TrailMap({ flow, disabled, onRespond, variant = "page" }: { flow: FlowState; disabled: boolean; onRespond(encoded: string): void; variant?: "board" | "page" }) {
  const [selected, setSelected] = useState<AnchorId | null>(null);
  const tagIds = useId();
  const box = useRef<HTMLDivElement>(null);
  const resolved = flow.phase === "resolved";
  const result = flow.result;
  // A pick the server has since ruled out is no longer a selection.
  const chosen = selected !== null && !flow.ruledOut.includes(selected) ? selected : null;
  const missed = resolved && result !== null && !result.correct;
  const revealed = missed && isAnchorId(result.reveal) ? result.reveal : null;
  const found = resolved && result?.correct && isAnchorId(flow.picked) ? flow.picked : null;
  const locked = resolved || disabled;

  const toneOf = (id: AnchorId): Tone | undefined => {
    if (id === revealed) return "answer";
    if (id === found) return "right";
    if (flow.ruledOut.includes(id) || (missed && id === flow.picked)) return "ruled-out";
    return undefined;
  };

  // Focus follows the clue: the first place still open takes it (again on a second chance).
  useEffect(() => {
    if (flow.phase === "resolved") return;
    box.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [flow.phase]);

  return (
    <section
      className={`trail trail--${variant} trail-map`}
      aria-label={TRAIL_MAP_LABEL}
      onKeyDown={(e) => {
        if (TRAIL_KEEP_KEYS.test(e.key)) e.stopPropagation();
      }}
    >
      <div ref={box} className="trail-map-box" style={BOX_STYLE}>
        <svg className="trail-map-art" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {BACKDROP.road.map((r, i) => (
            <line key={i} className="trail-map-road" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
          ))}
          {BACKDROP.plots.map((p) => (
            <rect key={p.id} className="trail-map-plot" x={p.x} y={p.y} width={p.w} height={p.h} rx={3} />
          ))}
        </svg>
        {SPOTS.map((s) => {
          const tone = toneOf(s.id);
          // The tag's words are the place's state, so its button is described by them (H8).
          const tag = tone === "ruled-out" ? TRAIL_MAP_RULED_OUT : tone === "answer" ? TRAIL_MAP_REVEAL : null;
          const tagId = tag ? `${tagIds}-${s.id}` : undefined;
          return (
            <button
              key={s.id}
              type="button"
              className="trail-spot"
              style={{ left: s.left, top: s.top }}
              aria-label={s.label}
              title={s.label}
              aria-pressed={chosen === s.id}
              aria-describedby={tagId}
              data-tone={tone}
              disabled={locked || tone === "ruled-out"}
              onClick={() => setSelected(s.id)}
            >
              <span className="trail-spot-dot">
                <GameIcon name={s.icon} className="trail-spot-icon" />
              </span>
              {tone === "right" && <GameIcon name="check" className="trail-spot-check" />}
              {tag && (
                <span id={tagId} className={`trail-spot-tag ${s.tagClass}${tone === "answer" ? " trail-spot-tag--answer" : ""}`}>
                  {tag}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!resolved && (
        <>
          <p className="trail-map-line" aria-live="polite">
            {chosen ? ANCHORS[chosen].label : TRAIL_MAP_HELP}
          </p>
          <button type="button" className="trail-go" disabled={chosen === null || disabled} onClick={() => chosen && !disabled && onRespond(TASK_CODECS.trail.encode(chosen))}>
            {TRAIL_MAP_SEARCH}
          </button>
        </>
      )}
    </section>
  );
}
