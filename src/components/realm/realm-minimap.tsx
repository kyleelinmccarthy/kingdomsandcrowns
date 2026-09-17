"use client";

import { useEffect, useRef, type RefObject } from "react";
import { mapDegrees, mapPan, parseTransform, rimMark, type MinimapMark, type MinimapView } from "@/lib/realm/minimap";

const SIZE = 100; // SVG user units; the rendered size comes from CSS

const NO_PAN = { x: 0, y: 0 };
const deg = (radians: number) => (radians * 180) / Math.PI;

/** One glyph per kind, so a site, a trouble, the objective and the castle are told apart by silhouette. */
const GLYPH: Record<MinimapMark["kind"], string> = {
  // A keep with four crenellations — the biggest mark on the map, because it is the thing
  // the whole game is pointed at and the thing a lost child looks for first.
  castle: "M-6,4.6 L-6,-2 L-4.2,-2 L-4.2,-4.2 L-2.4,-4.2 L-2.4,-2 L2.4,-2 L2.4,-4.2 L4.2,-4.2 L4.2,-2 L6,-2 L6,4.6 Z",
  // A star: "here, this one".
  objective: "M0,-6 L1.8,-1.9 L6.1,-1.9 L2.6,0.8 L3.9,5 L0,2.4 L-3.9,5 L-2.6,0.8 L-6.1,-1.9 L-1.8,-1.9 Z",
  // A house, filled once it is built and hollow while it is still a foundation.
  site: "M-3.4,3.6 L-3.4,-0.4 L0,-3.8 L3.4,-0.4 L3.4,3.6 Z",
  // A warning triangle.
  trouble: "M0,-3.9 L3.6,2.8 L-3.6,2.8 Z",
};

/** The hero: a kite, pointing where the next step goes. */
const HERO = "M0,-6.4 L4.3,3.6 L0,1.3 L-4.3,3.6 Z";
/** An off-map arrow, pinned to the rim, pointing at something that is really out there. */
const RIM_ARROW = "M0,-6 L4.6,3.4 L-4.6,3.4 Z";

/**
 * A readout, never a control. It takes no pointer events and holds nothing focusable,
 * which is what keeps it outside the input model entirely.
 *
 * `view` holds everything that changes rarely — the land, the marks, the objective — and comes
 * from React state. The hero is the one thing that moves sixty times a second, so `heroRef`
 * hands a `<g>` to the scene, which rewrites that element's `transform` in its own frame loop
 * exactly as it does the screen-edge arrow: no state, no re-render.
 *
 * That `<g>` is now a CARRIER: the scene writes it, and this file reads it and draws from it,
 * rather than the scene's one transform having to be the whole of what the map can do. The
 * reading is a MutationObserver on that one attribute — not a second animation loop, so a
 * standing hero costs exactly nothing, and a walking one costs one attribute read and at most
 * two writes per frame, all outside React. It buys two things the carrier alone cannot give:
 *   - the hero glyph turns the right way (`mapDegrees` — the scene's angle is the ground
 *     ring's, and east and west are mirrored between that ring and a map);
 *   - the map can pan with the hero when the world outgrows it (`mapPan`), with the castle
 *     and the objective coming back as rim arrows when they fall off the window.
 * With no ref at all — a test, a parent's preview — everything rests at the first frame's
 * values, which is what this renders.
 */
export function RealmMinimap({ view, heroRef }: { view: MinimapView; heroRef?: RefObject<SVGGElement | null> }) {
  const worldRef = useRef<SVGGElement>(null);
  const youRef = useRef<SVGGElement>(null);
  const homeRef = useRef<SVGGElement>(null);
  const goalRef = useRef<SVGGElement>(null);

  const restPan = view.frame.follows ? mapPan(view.hero, view.frame) : NO_PAN;
  const restHome = view.home ? rimMark(view.home, restPan) : null;
  const restGoal = view.goal ? rimMark(view.goal, restPan) : null;

  useEffect(() => {
    const carrier = heroRef?.current;
    if (!carrier) return;
    let lastWorld = "";
    let lastYou = "";
    const rim = (el: SVGGElement | null, at: { x: number; y: number; angle: number; off: boolean } | null) => {
      if (!el) return;
      el.style.display = at?.off ? "" : "none";
      if (at?.off) el.setAttribute("transform", `translate(${at.x * SIZE} ${at.y * SIZE}) rotate(${deg(at.angle)})`);
    };
    const draw = () => {
      const t = parseTransform(carrier.getAttribute("transform"));
      if (!t) return;
      const hero = { x: t.x / SIZE, y: t.y / SIZE };
      const pan = view.frame.follows ? mapPan(hero, view.frame) : NO_PAN;
      const world = `translate(${pan.x * SIZE} ${pan.y * SIZE})`;
      if (world !== lastWorld) {
        lastWorld = world;
        worldRef.current?.setAttribute("transform", world);
        if (view.frame.follows) {
          rim(homeRef.current, view.home ? rimMark(view.home, pan) : null);
          rim(goalRef.current, view.goal ? rimMark(view.goal, pan) : null);
        }
      }
      const you = `translate(${t.x} ${t.y}) rotate(${mapDegrees(t.deg)})`;
      if (you !== lastYou) {
        lastYou = you;
        youRef.current?.setAttribute("transform", you);
      }
    };
    draw();
    const observer = new MutationObserver(draw);
    observer.observe(carrier, { attributes: true, attributeFilter: ["transform"] });
    return () => observer.disconnect();
  }, [heroRef, view]);

  return (
    <div className="realm-minimap" style={{ pointerEvents: "none" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Map of the Realm" aria-hidden={false}>
        {/* Beyond the last field: the map says where the world stops. */}
        <rect x={0} y={0} width={SIZE} height={SIZE} className="realm-minimap-void" />
        <g ref={worldRef} transform={`translate(${restPan.x * SIZE} ${restPan.y * SIZE})`}>
          <rect
            className="realm-minimap-ground"
            x={view.frame.x.min * SIZE}
            y={view.frame.y.min * SIZE}
            width={(view.frame.x.max - view.frame.x.min) * SIZE}
            height={(view.frame.y.max - view.frame.y.min) * SIZE}
          />
          {view.areas.map((a) =>
            a.shape === "blob" ? (
              <circle
                key={a.id}
                className={`realm-minimap-land realm-minimap-land--${a.kind}`}
                cx={a.x * SIZE}
                cy={a.y * SIZE}
                r={(Math.max(a.w, a.h) * SIZE) / 2}
              />
            ) : (
              <rect
                key={a.id}
                className={`realm-minimap-land realm-minimap-land--${a.kind}`}
                x={(a.x - a.w / 2) * SIZE}
                y={(a.y - a.h / 2) * SIZE}
                width={a.w * SIZE}
                height={a.h * SIZE}
                rx={Math.min(a.w, a.h) * SIZE * 0.25}
              />
            )
          )}
          {view.marks.map((m) => (
            <path
              key={m.id}
              className={`realm-minimap-mark realm-minimap-${m.kind}${m.kind === "site" && m.filled ? " realm-minimap-site--raised" : ""}`}
              d={GLYPH[m.kind]}
              transform={`translate(${m.x * SIZE} ${m.y * SIZE})`}
            />
          ))}
          <g ref={heroRef} className="realm-minimap-hero" transform={`translate(${view.hero.x * SIZE} ${view.hero.y * SIZE}) rotate(${deg(view.hero.angle)})`} />
          <g ref={youRef} className="realm-minimap-you" transform={`translate(${view.hero.x * SIZE} ${view.hero.y * SIZE}) rotate(${mapDegrees(deg(view.hero.angle))})`}>
            <path d={HERO} />
          </g>
        </g>
        {/* Rim arrows, in the map's own space rather than the world's: home and the objective,
            drawn only once the world is too big to hold both of them on screen at once. */}
        <g
          ref={homeRef}
          className="realm-minimap-rim realm-minimap-rim--home"
          style={{ display: restHome?.off ? undefined : "none" }}
          transform={restHome ? `translate(${restHome.x * SIZE} ${restHome.y * SIZE}) rotate(${deg(restHome.angle)})` : undefined}
        >
          <path d={RIM_ARROW} />
        </g>
        <g
          ref={goalRef}
          className="realm-minimap-rim realm-minimap-rim--goal"
          style={{ display: restGoal?.off ? undefined : "none" }}
          transform={restGoal ? `translate(${restGoal.x * SIZE} ${restGoal.y * SIZE}) rotate(${deg(restGoal.angle)})` : undefined}
        >
          <path d={RIM_ARROW} />
        </g>
        {/* North is up and stays up: the map never spins under a child who is learning where things are. */}
        <text className="realm-minimap-north" x={6} y={9} textAnchor="start">
          N
        </text>
      </svg>
    </div>
  );
}
