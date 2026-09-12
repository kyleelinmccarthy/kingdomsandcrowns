"use client";

import type { RefObject } from "react";
import type { MinimapView } from "@/lib/realm/minimap";

const SIZE = 100; // SVG user units; the rendered size comes from CSS

/**
 * A readout, never a control. It takes no pointer events and holds nothing focusable,
 * which is what keeps it outside the input model entirely.
 *
 * `view` holds everything that changes rarely — the bounds, the sites, the objective — and
 * comes from React state. The hero is the one thing that moves sixty times a second, so
 * `heroRef` hands its `<g>` to the scene, which rewrites the element's `transform` in its
 * own frame loop exactly as it does the screen-edge arrow: no state, no re-render. The
 * transform rendered here is the first frame's, and the resting value for any caller
 * (a test, a parent's preview) that passes no ref at all.
 */
export function RealmMinimap({ view, heroRef }: { view: MinimapView; heroRef?: RefObject<SVGGElement | null> }) {
  const hx = view.hero.x * SIZE;
  const hy = view.hero.y * SIZE;
  return (
    <div className="realm-minimap" style={{ pointerEvents: "none" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Map of the Realm" aria-hidden={false}>
        <rect x={0} y={0} width={SIZE} height={SIZE} className="realm-minimap-ground" />
        {view.dots.map((d) =>
          d.kind === "objective" ? (
            <circle key={d.id} className="realm-minimap-objective" cx={d.x * SIZE} cy={d.y * SIZE} r={4} />
          ) : d.kind === "trouble" ? (
            <circle key={d.id} className="realm-minimap-dot" cx={d.x * SIZE} cy={d.y * SIZE} r={2.5} />
          ) : (
            <rect
              key={d.id}
              className={d.filled ? "realm-minimap-site realm-minimap-site--raised" : "realm-minimap-site"}
              x={d.x * SIZE - 2.5}
              y={d.y * SIZE - 2.5}
              width={5}
              height={5}
            />
          )
        )}
        <g ref={heroRef} className="realm-minimap-hero" transform={`translate(${hx} ${hy}) rotate(${(view.hero.angle * 180) / Math.PI})`}>
          <circle r={3} />
          <line x1={0} y1={0} x2={0} y2={-6} />
        </g>
      </svg>
    </div>
  );
}
