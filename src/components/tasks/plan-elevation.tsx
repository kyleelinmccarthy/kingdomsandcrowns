"use client";

/**
 * The bench's drawing of a plan going up (R-D6), beside a build run's work: what earlier levels
 * already stand (muted), and this level's boxes, laid from the ground up as the run's right bench
 * answers come in (`piecesLaid`, paced over its bench tasks, so a perfect run lays every one). The
 * boxes are `planElevation`'s front view, y up, flipped here into the picture. The world raises the
 * level when the run is finished; this is the run's own view of it, as `SiteElevation` is for a
 * side quest's building.
 */
import { IMPROVEMENTS, IMPROVEMENT_COLORS, planElevation, type Rect } from "@/lib/realm/improvements";
import { piecesLaid } from "@/lib/realm3d/bench-pieces";
import type { BenchSite } from "@/components/use-deed-flow";

/** Room round the boxes, in the plan's own units (about metres). */
const PAD = 0.3;

/** Lowest first, then left to right: the order a builder lays them. */
const buildOrder = (a: Rect, b: Rect) => a.y - b.y || a.x - b.x;

export function PlanElevation({ site, calm }: { site: BenchSite; calm: boolean }) {
  const plan = site.plan;
  if (!plan) return null;
  const { base, added: unsorted } = planElevation(plan.improvementId, plan.level);
  const added = [...unsorted].sort(buildOrder);
  const all = [...base, ...added];
  const minX = Math.min(...all.map((r) => r.x));
  const maxX = Math.max(...all.map((r) => r.x + r.w));
  const maxY = Math.max(...all.map((r) => r.y + r.h));
  const width = maxX - minX + PAD * 2;
  const height = maxY + PAD * 2;
  // A rectangle's left edge and bottom are in the plan's frame (y up); the picture's y runs down from its top.
  const at = (r: Rect) => ({ x: r.x - minX + PAD, y: maxY - (r.y + r.h) + PAD, width: r.w, height: r.h });
  const groundY = maxY + PAD;

  const placed = piecesLaid(site.solved, site.benchTasks, added.length);
  const before = piecesLaid(site.solved - 1, site.benchTasks, added.length);
  const label = IMPROVEMENTS[plan.improvementId].label;
  return (
    <figure className="bench-site bench-plan">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The ${label}, level ${plan.level}, going up`}>
        <line className="bench-plan-ground" x1={0} y1={groundY} x2={width} y2={groundY} />
        {base.map((r, i) => (
          <rect key={`b${i}`} data-base="" className="bench-plan-box bench-plan-box--base" fill={IMPROVEMENT_COLORS[r.color]} {...at(r)} />
        ))}
        {added.slice(0, placed).map((r, i) => (
          <rect
            key={`l${i}`}
            data-laid=""
            className={`bench-plan-box bench-plan-box--new${!calm && i >= before ? " bench-piece--drop" : ""}`}
            fill={IMPROVEMENT_COLORS[r.color]}
            {...at(r)}
          />
        ))}
        {added[placed] && <rect className="bench-plan-box bench-plan-box--next" {...at(added[placed])} />}
      </svg>
      <figcaption className="bench-site-caption">
        {placed > 0 ? `${placed} of ${added.length} parts in place.` : "Right answers raise the next part."}
      </figcaption>
    </figure>
  );
}
