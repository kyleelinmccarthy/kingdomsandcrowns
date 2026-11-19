"use client";

/**
 * THE CHRONICLE BOOK at the Scribe's lectern in the keep yard: E there opens the hero's pages, one
 * week to a page, newest week first. Each entry is a finished quest the hero told the Scribe about
 * in notes or a drawing (or a grown-up sealed): its title, subject, notes, drawing and seal.
 *
 * The pages load when the book opens (`getChronicle`) and never ride along with the Realm's bundle.
 * Everything on a page is text a person wrote, so it is rendered as text and never as markup, and
 * drawings are drawn by `DrawingView` from validated strokes. A grown-up visiting reads the same
 * book; sealing stays on the quest card, so there is no seal control here.
 */

import "./chronicle-book.css";
import { useCallback, useEffect, useState } from "react";
import { SealBadge } from "@/components/chronicle-seal";
import { DrawingView } from "@/components/drawing-view";
import { GameIcon } from "@/components/game-icon";
import { getChronicle } from "@/lib/actions/chronicle";
import type { ChronicleEntry, ChronicleWeek } from "@/lib/services/realm-chronicle";
import { Panel } from "./frame-hud";

const BACK = "Back to the Realm";
const OPENING = "Opening the Chronicle…";
const FAILED = "The Chronicle would not open.";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Week of 17 November" for a Monday (YYYY-MM-DD); the year follows only when it is not `now`'s. */
export function weekLabel(weekStart: string, now: Date): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return `Week of ${d} ${MONTHS[m - 1]}${y === now.getFullYear() ? "" : ` ${y}`}`;
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; weeks: ChronicleWeek[] };

export function ChronicleBook({
  childId,
  heroName,
  isHero,
  now,
  onClose,
}: {
  childId: string;
  heroName: string;
  /** The hero reading their own book, as against a grown-up visiting. */
  isHero: boolean;
  /** For the week labels' year; the clock when absent. */
  now?: Date;
  onClose: () => void;
}) {
  const [today] = useState(() => now ?? new Date());
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getChronicle(childId).then(
      (weeks) => {
        if (!live) return;
        setPage(0);
        setLoad({ state: "ready", weeks });
      },
      () => live && setLoad({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [childId, attempt]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const title = isHero ? "Your Chronicle" : `${heroName}'s Chronicle`;
  const weeks = load.state === "ready" ? load.weeks : [];
  const week = weeks[page];

  return (
    <Panel title={title} label={title} wide icon={<GameIcon name="scroll" className="r3-board-icon" />} onClose={onClose}>
      {load.state === "loading" && (
        <p className="r3-chron-empty" role="status">
          {OPENING}
        </p>
      )}
      {load.state === "error" && (
        <>
          <p className="r3-board-error" role="alert">
            {FAILED}
          </p>
          <button type="button" className="r3-menu-item r3-menu-item--go" onClick={retry}>
            Try again
          </button>
        </>
      )}
      {load.state === "ready" && !week && (
        <p className="r3-chron-empty">
          {isHero ? "Your Chronicle is waiting. Tell the Scribe about a quest: write it or draw it, and it will appear here." : `${heroName}'s Chronicle is waiting for its first page.`}
        </p>
      )}
      {week && (
        <>
          <div className="r3-chron-nav">
            <button type="button" className="r3-chron-turn" disabled={page >= weeks.length - 1} onClick={() => setPage(page + 1)}>
              Earlier week
            </button>
            <h3 className="r3-chron-week">{weekLabel(week.weekStart, today)}</h3>
            <button type="button" className="r3-chron-turn" disabled={page <= 0} onClick={() => setPage(page - 1)}>
              Later week
            </button>
          </div>
          <ul className="r3-chron-entries">
            {week.entries.map((e) => (
              <Entry key={e.assignmentId} entry={e} />
            ))}
          </ul>
        </>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          {BACK}
        </button>
      </div>
    </Panel>
  );
}

function Entry({ entry }: { entry: ChronicleEntry }) {
  return (
    <li className="r3-chron-entry">
      <h4 className="r3-chron-title">{entry.title}</h4>
      {entry.subject && (
        <p className="r3-chron-subject">
          <span className="r3-chron-dot" aria-hidden="true" style={{ backgroundColor: entry.materialColor }} />
          {entry.subject}
        </p>
      )}
      {entry.notes && <p className="r3-chron-notes">{entry.notes}</p>}
      {entry.drawing && <DrawingView drawing={entry.drawing} label={`A drawing for ${entry.title}`} className="r3-chron-drawing" />}
      {entry.seal && (
        <div className="r3-chron-seal">
          <SealBadge seal={entry.seal} />
        </div>
      )}
    </li>
  );
}
