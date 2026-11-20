"use client";

/**
 * "Watch Pip": a young hero (K–3) meets one worked lock before their first, as Aldo shows the bench
 * (R-F10). One fixed example for every lock a K–3 hero can meet (RF-g): a pattern, a shape sort, a
 * word sort, the shape grid and the balance. Each has a still drawing of it, and a
 * "Got it" button that takes the focus, so Enter or Space carries on. Nothing moves in calm play.
 * `useTaskDemo` (task-demo.tsx) decides when it shows.
 */
import { useEffect, useId, useRef, type ReactElement } from "react";
import type { LockShape } from "@/lib/tasks/lock-rules";
import type { LockDemoKey } from "@/lib/tasks/demos";
import { ShapeGlyph } from "./lock-shape";
import "./lock.css";

const COPY: Record<LockDemoKey, string> = {
  pattern: "Pip fits the next shape: red, blue, red, blue, … red!",
  sort: "Pip puts each shape where it belongs.",
  words: "Pip reads each word and puts it where it belongs: a dog is living, a stone is not.",
  shapes: "Pip puts each shape once in every row and every column.",
  balance: "Pip puts stones on the pan until both sides weigh the same.",
};

/** The demo's words, which a hero with read-aloud on hears as well. */
export const lockDemoCopy = (mode: LockDemoKey): string => COPY[mode];

const RED: LockShape = { shape: "circle", color: "red" };
const BLUE: LockShape = { shape: "circle", color: "blue" };

const ART_LABEL: Record<LockDemoKey, string> = {
  pattern: "Red circle, blue circle, red circle, blue circle, and a red circle fitted in the gap.",
  sort: "A red heart and a red square in the Red bin; a blue star and a blue circle in the Blue bin.",
  words: "The word dog in the Living bin; the word stone in the Not living bin.",
  shapes: "A three by three grid of a red circle, a blue square and a yellow triangle, each once in every row and column.",
  balance: "A weight of 5 on one pan; stones of 2 and 3 on the other, and the pans level.",
};

const SQUARE: LockShape = { shape: "square", color: "blue" };
const TRIANGLE: LockShape = { shape: "triangle", color: "yellow" };

function PatternArt() {
  return (
    <span className="lock-demo-row">
      {[RED, BLUE, RED, BLUE].map((s, i) => (
        <span key={i} className="lock-demo-shape">
          <ShapeGlyph shape={s} />
        </span>
      ))}
      <span className="lock-demo-shape lock-demo-shape--placed">
        <ShapeGlyph shape={RED} />
      </span>
    </span>
  );
}

function SortArt() {
  const bins: [string, LockShape[]][] = [
    ["Red", [{ shape: "heart", color: "red" }, { shape: "square", color: "red" }]],
    ["Blue", [{ shape: "star", color: "blue" }, BLUE]],
  ];
  return (
    <span className="lock-demo-row">
      {bins.map(([name, shapes]) => (
        <span key={name} className="lock-demo-bin">
          <span className="lock-demo-bin-name">{name}</span>
          <span className="lock-demo-row">
            {shapes.map((s, i) => (
              <span key={i} className={`lock-demo-shape${i === shapes.length - 1 ? " lock-demo-shape--placed" : ""}`}>
                <ShapeGlyph shape={s} />
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

function WordsArt() {
  return (
    <span className="lock-demo-row">
      {[["Living", "dog"], ["Not living", "stone"]].map(([name, word]) => (
        <span key={name} className="lock-demo-bin">
          <span className="lock-demo-bin-name">{name}</span>
          <span className="lock-demo-word lock-demo-shape--placed">{word}</span>
        </span>
      ))}
    </span>
  );
}

function ShapesArt() {
  const rows = [[RED, SQUARE, TRIANGLE], [SQUARE, TRIANGLE, RED], [TRIANGLE, RED, SQUARE]];
  return (
    <span className="lock-demo-grid">
      {rows.flatMap((row, r) => row.map((s, c) => (
        <span key={`${r}${c}`} className={`lock-demo-shape${r === 2 && c === 2 ? " lock-demo-shape--placed" : ""}`}>
          <ShapeGlyph shape={s} />
        </span>
      )))}
    </span>
  );
}

function BalanceArt() {
  return (
    <span className="lock-demo-row">
      <span className="lock-demo-bin">
        <span className="lock-demo-bin-name">The weight</span>
        <span className="lock-demo-word">5</span>
      </span>
      <span className="lock-demo-bin">
        <span className="lock-demo-bin-name">Pip&apos;s pan</span>
        <span className="lock-demo-row">
          <span className="lock-demo-word">2</span>
          <span className="lock-demo-word lock-demo-shape--placed">3</span>
        </span>
      </span>
    </span>
  );
}

const ART: Record<LockDemoKey, () => ReactElement> = { pattern: PatternArt, sort: SortArt, words: WordsArt, shapes: ShapesArt, balance: BalanceArt };

export function LockDemo({ mode, onDone, calm, variant = "board" }: { mode: LockDemoKey; onDone(): void; calm: boolean; variant?: "board" | "page" }) {
  const titleId = useId();
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  const Art = ART[mode];
  return (
    <section className={`lock lock--${variant}${calm ? "" : " lock--move"} lock-demo`} aria-labelledby={titleId}>
      <h3 id={titleId} className="lock-title">
        Watch Pip
      </h3>
      <span className="lock-demo-art" role="img" aria-label={ART_LABEL[mode]}>
        <Art />
      </span>
      <p className="lock-demo-text">{COPY[mode]}</p>
      <button ref={go} type="button" className="lock-go" onClick={onDone}>
        Got it
      </button>
    </section>
  );
}
