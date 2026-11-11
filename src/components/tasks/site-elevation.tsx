"use client";

/**
 * The bench's drawing of the building going up: what stood when the run began (`benchBase`), the
 * pieces this sitting laid (one per bench task solved, `benchPieces`), and a faint outline of the
 * next one. The world's site rises when the board closes; this is the run's own view of it (R-C1).
 */
import { BENCH_ELEVATION, benchBase, benchPieces, type BenchPiece } from "@/lib/realm3d/bench-pieces";
import type { BenchSite } from "@/components/use-deed-flow";

const { width: W, height: H } = BENCH_ELEVATION;

function Shape({ piece, className, laid }: { piece: BenchPiece; className: string; laid?: boolean }) {
  const s = piece.shape;
  const data = laid ? { "data-laid": "" } : {};
  if (s.type === "box") return <rect className={className} x={s.x} y={H - s.y - s.h} width={s.w} height={s.h} {...data} />;
  return <line className={className} x1={s.x1} y1={H - s.y1} x2={s.x2} y2={H - s.y2} strokeWidth={s.t} {...data} />;
}

const sentence = (label: string) => `${label[0].toUpperCase()}${label.slice(1)} is in place.`;

export function SiteElevation({ site, calm }: { site: BenchSite; calm: boolean }) {
  const base = benchBase(site.stage, site.complete);
  const pieces = benchPieces(site.stage, site.complete);
  const placed = Math.min(Math.max(0, site.placed), pieces.length);
  const laid = pieces.slice(0, placed);
  const next = pieces[placed];
  const latest = laid[laid.length - 1];
  return (
    <figure className="bench-site">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The site: ${placed} of ${pieces.length} pieces laid`}>
        <line className="bench-site-ground" x1={0} y1={H} x2={W} y2={H} />
        {base.map((p, i) => (
          <Shape key={`b${i}`} piece={p} className={`bench-site-piece bench-site-piece--${p.kind}`} />
        ))}
        {laid.map((p, i) => (
          <Shape
            key={`l${i}`}
            piece={p}
            laid
            className={`bench-site-piece bench-site-piece--${p.kind} bench-site-piece--new${!calm && i === placed - 1 ? " bench-piece--drop" : ""}`}
          />
        ))}
        {next && <Shape piece={next} className={`bench-site-piece bench-site-piece--${next.kind} bench-site-piece--next`} />}
      </svg>
      <figcaption className="bench-site-caption">{latest ? sentence(latest.label) : "Each right answer lays the next piece."}</figcaption>
    </figure>
  );
}
