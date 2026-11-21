"use client";

/**
 * THE WALK'S TRACKER (R-H14): a small card over the world that holds the clue while the hero walks
 * the village. E at a stake searches there (`answerRef`, filled while this is mounted); the server
 * says right, a second chance ("Not here." and the place's redirect), or where it was. A resolved
 * clue moves straight on to the next, its line kept on show above it; the last one finishes the run,
 * and the frame opens the villager's board on its result card (`onFinished`).
 *
 * It owns the run's flow (`useDeedFlow`), so a second chance, Show me and a refused call behave as on
 * the board. It never takes focus by itself, so the game's keys keep working while it is up, and it
 * shows only the clue: before a clue is resolved nothing on it says anything about any place.
 *
 * The frame mounts it keyed by `walk.key` and only hides it (`hidden`) under a panel, so the pause
 * menu or another villager's talk never loses the clue the hero is on.
 */

import { useEffect, useState, type MutableRefObject } from "react";
import { GameIcon } from "@/components/game-icon";
import { useDeedFlow } from "@/components/use-deed-flow";
import { completeDeedRun } from "@/lib/actions/deeds";
import { isAnchorId, type AnchorId } from "@/lib/realm/anchors";
import { realmCue } from "@/lib/realm3d/sound/store";
import { attemptFeedback } from "@/lib/realm3d/talk";
import { attemptSpeech, autoSpeaks } from "@/lib/tasks/narration";
import { TRAIL_FINISH, TRAIL_HIDE, TRAIL_LEAVE, TRAIL_LOOKED_HERE, TRAIL_SHOW, TRAIL_TRACKER_LABEL, trailClueCount } from "@/lib/tasks/trail-copy";
import { readyToFinish } from "@/lib/utils/deed-run-flow";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import { canSpeak, speak, stopSpeaking } from "@/lib/utils/speech";
import type { TrailWalkOn } from "./use-trail-walk";
import "./trail-walk.css";

export function TrailWalk({
  walk,
  profile,
  calm,
  numerals,
  hidden,
  answerRef,
  onReveal,
  onFinished,
  onLeave,
}: {
  walk: TrailWalkOn;
  profile: { readAloud: boolean };
  calm: boolean;
  numerals: boolean;
  /** A panel is open over the world: the card is hidden, and keeps its place. */
  hidden: boolean;
  /** Where E at a stake reaches this walk's `answer`. */
  answerRef: MutableRefObject<((id: AnchorId) => void) | null>;
  /** A missed clue's answer, for its stake's gold sign and cap; null once the hero searches again. */
  onReveal: (id: AnchorId | null) => void;
  onFinished: (summary: RunSummary) => void;
  onLeave: () => void;
}) {
  const { run, villager } = walk;
  // A wrong place is a soft low "hmm", a right one rises and resolves (`realm-sound.tsx`), as on the board.
  const { flow, busy, error, guarded, choose, showMe, next } = useDeedFlow(run, (r) => realmCue(r.correct ? "deed-right" : "deed-wrong"));
  const [lookedHere, setLookedHere] = useState(false);
  const [folded, setFolded] = useState(false);
  // Whether the hero has searched (or asked to be shown) on this tracker: a walk picked back up on a
  // second chance has not, so its clue is said before the second-chance line.
  const [searchedHere, setSearchedHere] = useState(false);

  const total = run.questions.length;
  const ready = readyToFinish(flow, total);
  // A resolved clue that is not the last moves straight on: the next clue is shown now, and the flow's
  // own "next" goes with the hero's next search, so the resolved clue's line stays derived and on show.
  const movedOn = flow.phase === "resolved" && flow.index < total - 1;
  const shown = movedOn ? flow.index + 1 : flow.index;
  const clue = run.questions[shown];
  const answered = run.questions[flow.index];
  const line = flow.result ? attemptFeedback(flow.result, flow.ruledOut.length > 0, villager.name, answered).text : null;
  const clueWords = clue ? (clue.readAloud ?? clue.prompt) : "";

  /** E at a stake. Nothing while a call is out or the run is finishing; a place already ruled out is said, not sent. */
  function answer(id: AnchorId) {
    if (busy || ready) return;
    setSearchedHere(true);
    if (flow.phase === "second-chance" && flow.ruledOut.includes(id)) {
      setLookedHere(true);
      return;
    }
    setLookedHere(false);
    // Two presses before a render both see `movedOn`; the flow moves on only from a resolved clue, so
    // the second `next` is nothing and the second search is refused as one already out (`useDeedFlow`).
    if (movedOn) next();
    void choose(id);
  }
  useEffect(() => {
    answerRef.current = answer;
    return () => {
      if (answerRef.current === answer) answerRef.current = null;
    };
  });

  // The answer's stake turns gold after a miss (F-17: only an anchor id is passed on), and back when
  // the hero searches again or the walk ends.
  const reveal = flow.phase === "resolved" && flow.result && !flow.result.correct && isAnchorId(flow.result.reveal) ? flow.result.reveal : null;
  useEffect(() => {
    if (!reveal) return;
    onReveal(reveal);
    return () => onReveal(null);
  }, [reveal, onReveal]);

  // The last clue resolved (or a run picked back up with every answer in): finished once, then handed up.
  // A refused finish is said, and "Finish the trail" asks again.
  // (`guarded` keeps it to one call at a time, so a second mount effect in development asks nothing more.)
  const finish = () => guarded(async () => onFinished(await completeDeedRun(run.runId)));
  useEffect(() => {
    if (ready) void finish();
    // Once, when the run becomes ready; a retry is the button's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Unprompted speech (R-H17): a new clue, a second-chance line and a miss line, when `autoSpeaks`
  // says so (always for a Kindergarten hero's trail). A miss and the clue after it are one line, so
  // the second never cuts the first off; nothing is said while a search is out.
  // A walk picked back up on a second chance (`pending`) has heard nothing yet: its clue goes first.
  const speaks = clue ? autoSpeaks(clue, profile.readAloud, run.narrateClues === true) : false;
  const after = attemptSpeech(answered, flow, line ?? undefined);
  const searching = busy && !ready;
  const oneLine = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");
  const words = searching
    ? undefined
    : lookedHere
      ? TRAIL_LOOKED_HERE
      : flow.phase === "asking"
        ? clueWords
        : flow.phase === "second-chance"
          ? searchedHere ? after : oneLine(clueWords, after)
          : movedOn
            ? oneLine(after, clueWords)
            : after;
  useEffect(() => {
    if (!speaks || !words) return;
    const token = speak(words);
    return () => stopSpeaking(token);
  }, [speaks, words]);

  const count = trailClueCount(shown + 1, total);
  return (
    <section className={`trail-walk r3-plank${calm ? " trail-walk--calm" : ""}`} role="region" aria-label={TRAIL_TRACKER_LABEL} hidden={hidden}>
      <div className="trail-walk-head">
        <GameIcon name="scroll" className="trail-walk-icon" />
        <span className="r3-run-dots trail-walk-dots" role="img" aria-label={count}>
          {run.questions.map((q, i) => {
            const done = i < flow.index || (i === flow.index && flow.phase === "resolved");
            return <span key={q.id} className={`r3-run-dot${done ? " r3-run-dot--done" : i === shown ? " r3-run-dot--now" : ""}`} />;
          })}
        </span>
        {numerals && (
          <span className="trail-walk-count" aria-hidden="true">
            {count}
          </span>
        )}
        <button type="button" className="r3-link-button trail-walk-fold" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
          {folded ? TRAIL_SHOW : TRAIL_HIDE}
        </button>
        {/* In the head, never in the scrolling body, so it is always in reach (a short phone, larger text). */}
        {!folded && canSpeak() && (
          <button type="button" className="r3-round r3-read trail-walk-read" aria-label="Read aloud" title="Read aloud" onClick={() => speak(clueWords)}>
            <GameIcon name="sparkles" className="r3-read-icon" />
          </button>
        )}
      </div>
      {/* The head and the foot are pinned; only the body (the lines and the clue) scrolls when the card is capped. */}
      {!folded && (
        <div className="trail-walk-body">
          {line && (
            <p className={`trail-walk-line${flow.result?.correct ? " trail-walk-line--right" : ""}`} role="status">
              {line}
            </p>
          )}
          {lookedHere && <p className="trail-walk-line">{TRAIL_LOOKED_HERE}</p>}
          <p className="trail-walk-text" aria-live="polite">
            {clue?.prompt}
          </p>
        </div>
      )}
      {/* Pinned with the foot: a failed finish's "Finish the trail" never scrolls out of reach. */}
      {!folded && error && (
        <p className="r3-board-error trail-walk-error" role="alert">
          {error}{" "}
          {ready && (
            <button type="button" className="r3-link-button" disabled={busy} onClick={() => void finish()}>
              {TRAIL_FINISH}
            </button>
          )}
        </p>
      )}
      {!folded && (
        <div className="trail-walk-foot">
          {flow.phase === "second-chance" && (
            <button
              type="button"
              className="r3-link-button"
              disabled={busy}
              onClick={() => {
                setSearchedHere(true);
                setLookedHere(false);
                void showMe();
              }}
            >
              Show me
            </button>
          )}
          {/* Not while the finish is out: the run is done on the server, and its result board must open. */}
          <button type="button" className="r3-link-button trail-walk-leave" disabled={ready && busy} onClick={onLeave}>
            {TRAIL_LEAVE}
          </button>
        </div>
      )}
    </section>
  );
}
