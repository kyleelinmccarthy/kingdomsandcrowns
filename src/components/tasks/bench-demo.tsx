"use client";

/**
 * "Watch Aldo": a young hero meets one worked example before their first bench task (R-C9),
 * wherever it falls in the run. One fixed example per mode, a small still drawing of it, and a
 * "Got it" button that takes the focus, so Enter or Space carries on. Nothing moves in calm play.
 * `useTaskDemo` (task-demo.tsx) is the players' side of it, for the bench and the lock alike.
 */
import { useEffect, useId, useRef } from "react";
import type { MeasureView } from "@/lib/tasks/types";
import "./bench.css";

export type DemoMode = MeasureView["mode"];

const COPY: Record<DemoMode, string> = {
  assemble: "Aldo needs a beam 5 feet long. He fits a 2-foot piece and a 3-foot piece: 2 + 3 = 5. Now you try!",
  cut: "Aldo needs a board 3/4 of a foot long. He measures 3 quarters and cuts there. Now you try!",
};

/** The demo's words, which a hero with read-aloud on hears as well. */
export const demoCopy = (mode: DemoMode): string => COPY[mode];

/** Aldo's beam: a 2-foot piece and a 3-foot piece laid end to end against the 5-foot mark. */
function BeamArt() {
  return (
    <>
      <rect className="bench-demo-board" x={0} y={14} width={40} height={16} rx={2} />
      <rect className="bench-demo-board bench-demo-board--b" x={40} y={14} width={60} height={16} rx={2} />
      <line className="bench-demo-mark" x1={100} y1={8} x2={100} y2={36} />
      <text className="bench-demo-num" x={20} y={26} textAnchor="middle">2 ft</text>
      <text className="bench-demo-num" x={70} y={26} textAnchor="middle">3 ft</text>
      <text className="bench-demo-num bench-demo-num--out" x={100} y={46} textAnchor="middle">5 ft</text>
    </>
  );
}

/** Aldo's board: a foot ruled in quarters, with the cut after the third. */
function BoardArt() {
  const ticks = [0, 1, 2, 3, 4];
  const labels = ["0", "1/4", "1/2", "3/4", "1"];
  return (
    <>
      <rect className="bench-demo-board" x={0} y={14} width={75} height={16} rx={2} />
      <rect className="bench-demo-ruler" x={0} y={14} width={100} height={16} rx={2} />
      {ticks.map((i) => (
        <g key={i}>
          <line className="bench-demo-tick" x1={i * 25} y1={30} x2={i * 25} y2={36} />
          <text className="bench-demo-num bench-demo-num--out" x={i * 25} y={46} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{labels[i]}</text>
        </g>
      ))}
      <line className="bench-demo-mark" x1={75} y1={8} x2={75} y2={36} />
    </>
  );
}

export function BenchDemo({ mode, onDone, calm, variant = "board" }: { mode: DemoMode; onDone(): void; calm: boolean; variant?: "board" | "page" }) {
  const titleId = useId();
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <section className={`bench bench--${variant} bench-demo`} aria-labelledby={titleId}>
      <h3 id={titleId} className="bench-title">
        Watch Aldo
      </h3>
      <svg className={`bench-demo-art${calm ? "" : " bench-demo-art--move"}`} viewBox="0 0 100 52" role="img" aria-label={mode === "assemble" ? "A 2-foot piece and a 3-foot piece laid end to end make the 5-foot beam." : "A foot-long ruler marked in quarters, with the cut after the third quarter."}>
        {mode === "assemble" ? <BeamArt /> : <BoardArt />}
      </svg>
      <p className="bench-demo-text">{COPY[mode]}</p>
      <button ref={go} type="button" className="bench-go" onClick={onDone}>
        Got it
      </button>
    </section>
  );
}
