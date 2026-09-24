"use client";

/**
 * Recess over the world: the run strip, the start and finish boards, the small lines (a gleam, the
 * nudge), the Ring's marks on the minimap, and the Ring's board at the arch.
 *
 * Nothing recess-shaped stands in the corner when no run is going (spec D12.11). Every size reads
 * the HUD's one scaling knob through the `r3-` rem sizes, and nothing here re-renders per frame:
 * the running time and the lit mark on the map are written by the scene (`recess/bus.ts`).
 *
 * Simple depth (`numerals: false`) substitutes and never removes: pips for the posts and the laps,
 * a jar for the gleams, a ribbon for a best — the same things, drawn instead of counted.
 */

import { GameIcon } from "@/components/game-icon";
import type { RecessBus } from "@/lib/realm3d/recess/bus";
import { MAP_WINDOW } from "@/lib/realm3d/minimap";
import { boardRows, formatLap, jarCaption, lampLine, nextMarkLine, parentArchLine, RING, WRITE_FAILED, WRITE_FAILED_AGAIN, type BoardRow, type RecessDepth } from "@/lib/realm/recess/copy";
import { hasAnyRecord, JAR_CAPACITY, jarFillFor, lampsLitFor, type RecessRecord } from "@/lib/realm/recess/record";
import { LAMP_COUNT } from "@/lib/realm3d/recess/lamps";
import { keepFocusInWorld, Panel } from "./frame-hud";
import type { RecessBoardView, RecessPopView, RunView } from "./use-recess";
import "./recess.css";

/** The Ring's mark: a gold hoop, as on the arch. */
export function RingMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="12" cy="12" r="2.6" fill="#c0392b" />
    </svg>
  );
}

/** A gleam: a little cut gem. */
export function GleamMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5 L19 12 L12 22.5 L5 12 Z" fill="currentColor" />
      <path d="M12 1.5 L15 12 L12 22.5 Z" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

/** The gleam jar, filling from the bottom. The whole gleam count at simple depth. */
export function GleamJar({ fill, className = "" }: { fill: number; className?: string }) {
  const f = Math.max(0, Math.min(1, fill));
  // Inside the jar runs from y 21 (bottom) up to y 7; a jar with even one gleam shows a sliver.
  const h = f === 0 ? 0 : Math.max(1.2, 14 * f);
  return (
    <svg className={`r3-recess-jar ${className}`} viewBox="0 0 24 24" role="img" aria-label={f >= 1 ? "The jar is full." : "Gleam jar"}>
      <rect x="6.5" y={21 - h} width="11" height={h} rx="1.6" className="r3-recess-jar-fill" />
      <path d="M8 3.5h8M8.5 3.5v3L6 9v11.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V9l-2.5-2.5v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** A road lamp, lit or dark: the board's picture of the lamps along the west road. */
function LampGlyph({ lit }: { lit: boolean }) {
  return (
    <svg className={`r3-recess-lamp${lit ? " r3-recess-lamp--lit" : ""}`} viewBox="0 0 12 24" aria-hidden="true">
      <rect x="5.2" y="6" width="1.6" height="17" className="r3-recess-lamp-post" />
      <rect x="3" y="2" width="6" height="6.5" rx="1" className="r3-recess-lamp-glass" />
      <path d="M2.4 2.2 L6 0 L9.6 2.2 Z" className="r3-recess-lamp-post" />
    </svg>
  );
}

/**
 * The lamps along the road, drawn: lit ones warm, the rest dark, nearest the village first. At
 * full depth the line under them counts them; at simple depth the picture is the count.
 */
export function RoadLamps({ totalGleams, numerals }: { totalGleams: number; numerals: boolean }) {
  const lit = lampsLitFor(totalGleams, LAMP_COUNT);
  return (
    <div className="r3-recess-lamps">
      <span className="r3-recess-lamp-row" role="img" aria-label={numerals ? lampLine(lit, LAMP_COUNT) : lit >= LAMP_COUNT ? "Every lamp on the road is lit." : "The lamps along the road"}>
        {Array.from({ length: LAMP_COUNT }, (_, i) => (
          <LampGlyph key={i} lit={i < lit} />
        ))}
      </span>
      <span className="r3-recess-lamp-line">{numerals ? lampLine(lit, LAMP_COUNT) : lit >= LAMP_COUNT ? "Every lamp on the road is lit." : "Your gleams light the lamps on the road."}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ the run strip */

/**
 * While a run is going: which run, a pip per post (passed, next, still to come) and the arch at the
 * end, where to go next, the time (full depth), the best to beat, and this run's gleams.
 */
export function RecessStrip({
  run,
  bus,
  numerals,
  best,
  calm = false,
}: {
  run: RunView | null;
  bus: RecessBus;
  numerals: boolean;
  /** The best to beat, for how the child is travelling now; null for none yet. */
  best: number | null;
  calm?: boolean;
}) {
  if (!run) return null;
  const posts = bus.course.posts;
  const home = run.started && run.nextPost >= posts.length;
  return (
    <div className={`r3-recess-strip${calm ? " r3-recess--calm" : ""}`} role="status" aria-label={run.kind === "recess" ? "Recess: the Ring" : "The Ring"}>
      <RingMark className="r3-recess-strip-icon" />
      <span className="r3-recess-strip-body">
        <span className="r3-recess-strip-top">
          <span className="r3-recess-strip-title">{run.kind === "recess" ? "Recess" : RING}</span>
          <span className="r3-recess-pips" aria-hidden="true">
            {posts.map((p) => (
              <span key={p.id} className={`r3-recess-pip${run.started && p.index < run.nextPost ? " r3-recess-pip--on" : run.started && p.index === run.nextPost ? " r3-recess-pip--next" : ""}`} />
            ))}
            <span className={`r3-recess-pip r3-recess-pip--arch${!run.started || home ? " r3-recess-pip--next" : ""}`} />
          </span>
          {numerals && run.started && (
            <span className="r3-recess-time">
              <span ref={(el) => bus.setNode("time", el)} /> s
            </span>
          )}
        </span>
        <span className="r3-recess-strip-line">
          <span className="r3-recess-next">{nextMarkLine({ started: run.started, nextPost: run.nextPost, posts })}</span>
          {best !== null && (numerals ? <span className="r3-recess-best">Best {formatLap(best)} s</span> : <span className="r3-recess-ribbon" aria-label="You have a best to beat" />)}
          <span className="r3-recess-gleams" aria-label={numerals ? `${run.collected} gleams this run` : "Gleams this run"}>
            <GleamMark className="r3-recess-gem" />
            {numerals ? run.collected : <span className="r3-recess-gem-pips">{Array.from({ length: Math.min(run.collected, 8) }, (_, i) => <i key={i} />)}</span>}
          </span>
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ boards and lines */

/** The start and finish boards, and the lines that end a run: top and centre, then gone. */
export function RecessBoard({ board, calm }: { board: RecessBoardView | null; calm: boolean }) {
  if (!board) return null;
  return (
    <div key={board.id} className={`r3-toast r3-recess-board r3-recess-board--${board.variant}${calm ? " r3-recess-board--plain" : ""}`} role="status">
      <RingMark className="r3-toast-icon r3-recess-board-icon" />
      <span className="r3-toast-text">
        <span className="r3-toast-title">{board.title}</span>
        <span className="r3-toast-line">{board.text}</span>
      </span>
    </div>
  );
}

/** A gleam's small line, or the nudge. */
export function RecessPop({ pop, calm = false }: { pop: RecessPopView | null; calm?: boolean }) {
  if (!pop) return null;
  return (
    <div key={pop.id} className={`r3-recess-pop${calm ? " r3-recess--calm" : ""}`} role="status">
      <GleamMark className="r3-recess-pop-gem" />
      {pop.text}
    </div>
  );
}

/** A write that failed, and the way to try again. */
export function RecessError({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (!error) return null;
  // Only a write that failed is worth trying again; a refused lap is simply said.
  const retry = error === WRITE_FAILED || error === WRITE_FAILED_AGAIN;
  return (
    <div className="r3-recess-error" role="alert">
      <span>{error}</span>
      {retry && (
        <button type="button" className="r3-link-button" onMouseDown={keepFocusInWorld} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the map */

/** The arch, always, as a gold hoop; and whichever mark is lit, as a pulsing ring (placed by the scene). */
export function RecessMapMarks({ bus, calm = false }: { bus: RecessBus; calm?: boolean }) {
  const glyph = MAP_WINDOW / 100;
  const a = bus.course.arch;
  return (
    <g className={`r3-recess-map${calm ? " r3-recess--calm" : ""}`}>
      <g ref={(el) => bus.setNode("mapMark", el)} style={{ display: "none" }}>
        <g transform={`scale(${glyph})`}>
          <circle r="4.4" className="r3-recess-map-lit" />
        </g>
      </g>
      <g transform={`translate(${a.x} ${a.z})`}>
        <g transform={`scale(${glyph})`}>
          <circle r="2.6" className="r3-recess-map-arch" />
        </g>
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ the Ring's board at the arch */

function Row({ row }: { row: BoardRow }) {
  return (
    <div className="r3-recess-row">
      <span className="r3-recess-label">{row.label}</span>
      <span className="r3-recess-value">
        {row.jar !== undefined && <GleamJar fill={row.jar} />}
        {row.value}
        {row.ribbon && <span className="r3-recess-ribbon" aria-label="A best is set" />}
        {row.pips !== undefined && (
          <span className="r3-recess-pips r3-recess-pips--laps" aria-label={row.more ? "More than ten laps" : "Laps run"}>
            {Array.from({ length: row.pips }, (_, i) => (
              <span key={i} className="r3-recess-pip r3-recess-pip--on" />
            ))}
            {row.more && <span className="r3-recess-more">+</span>}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The Ring's board, opened with E at the arch. A child sees their record and one way to run it; a
 * visiting grown-up sees the same record, labelled with the child's name, and runs nothing.
 */
export function RingPanel({
  record,
  viewer,
  heroName,
  depth,
  fewerChoices,
  mounted,
  canRun,
  onRun,
  onClose,
}: {
  record: RecessRecord | null;
  viewer: "child" | "parent";
  heroName: string;
  depth: RecessDepth;
  fewerChoices: boolean;
  mounted: boolean;
  canRun: boolean;
  onRun: () => void;
  onClose: () => void;
}) {
  const rows = boardRows(record, depth, fewerChoices, { mounted });
  const parent = viewer === "parent";
  return (
    <Panel title={parent ? `${heroName}'s Ring` : RING} label={RING} icon={<RingMark className="r3-board-icon r3-recess-panel-icon" />} onClose={onClose} className="r3-recess-panel">
      <p className="r3-board-sub">
        {parent ? parentArchLine(heroName) : "Eight lit posts round the island, then home through this arch. Gleams are for your jar."}
      </p>
      <div className="r3-recess-rows">
        {rows.map((r) => (
          <Row key={r.label} row={r} />
        ))}
      </div>
      {/* The jar's home in the 3D Realm (D12.2): the Ring's own board, on a shelf with the road's lamps. */}
      <div className="r3-recess-shelf">
        <GleamJar fill={jarFillFor(record?.totalGleams ?? 0)} className="r3-recess-jar--shelf" />
        <div className="r3-recess-shelf-body">
          <p className="r3-recess-jar-caption">
            {jarCaption(record?.totalGleams ?? 0)}
            {!hasAnyRecord(record) && !parent ? " — empty, for now." : depth === "full" && (record?.totalGleams ?? 0) < JAR_CAPACITY ? ` — ${record?.totalGleams ?? 0} of ${JAR_CAPACITY}` : ""}
          </p>
          <RoadLamps totalGleams={record?.totalGleams ?? 0} numerals={depth === "full"} />
        </div>
      </div>
      <div className="r3-menu">
        {!parent && canRun && (
          <button type="button" className="r3-menu-item r3-menu-item--go" data-autofocus onClick={onRun}>
            <GameIcon name="journey" className="r3-menu-icon" /> Run the Ring
          </button>
        )}
        <button type="button" className="r3-menu-item" onClick={onClose}>
          <GameIcon name="compass" className="r3-menu-icon" /> {parent ? "Back to the Realm" : canRun ? "Not now" : "Back"}
        </button>
      </div>
    </Panel>
  );
}

/** How full the jar is, for anything outside that wants it. */
export { jarFillFor };
