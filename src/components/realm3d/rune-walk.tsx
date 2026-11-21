"use client";

/**
 * THE RUNE WALK (R-I2, R-I11): a language side quest walked to its rune objects. One component and
 * one run flow (`useDeedFlow`) for both of its halves (RI-a / B2):
 *
 * - **The card** (`WalkCard`, the trail's shell, RI-a / S14) lists the stops, checks each one mended
 *   on this walk, and says which is next (or a line the frame says through `sayRef`: "First, …", "The
 *   rune holds here."). It renders through a portal into the column's walk slot (`cardSlot`), inside
 *   the frame, and is only hidden (`hidden`) under another panel, so the stop is never lost. It has
 *   no read-aloud button: the stone's is the one (RI-a / S4). It never takes the focus.
 * - **The stone** (`casting`: the frame's overlay is E at the stop on now) is a board of its own,
 *   rendered here, outside the frame, so it is never dimmed with it: the stop's prompt, the rune
 *   stone (`TaskPresenter`), the feedback line and Show me on a second chance. A right cast mends
 *   its object at once (`onMended`, R-I21) and the stone stays, by index (RI-a / B1), until Done
 *   moves on (`next`, then `onCastClose`). The last stop's Finish finishes the run once; a refused
 *   finish is said and Finish asks again. Esc (the frame's) closes the stone and keeps the flow, so
 *   the same stop reopens on its second chance; closed on a resolved stop, the walk moves on as Done
 *   does, and a finish left open is offered on the card, so Leave never strands it.
 *
 * The stop on now is the flow's, reported up (`onAt`) on mount and whenever it changes, so a walk
 * picked back up starts at its own stop (RI-a / S1). Nothing is spoken when the walk begins (RI-a /
 * S5): the stop's word is spoken when its stone opens, always for a dictation (R-I18) and for a
 * meaning with read-aloud on (`autoSpeaks`); the second-chance and miss lines follow `attemptSpeech`.
 * A cast while a call is out sends nothing (the flow's one-call guard, and Cast shut while `busy`).
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { GameIcon } from "@/components/game-icon";
import { TaskPresenter } from "@/components/tasks/presenters";
import { useDeedFlow } from "@/components/use-deed-flow";
import { completeDeedRun } from "@/lib/actions/deeds";
import { realmCue } from "@/lib/realm3d/sound/store";
import { attemptFeedback } from "@/lib/realm3d/talk";
import { attemptSpeech, autoSpeaks } from "@/lib/tasks/narration";
import { RUNE_DONE, RUNE_FINISH, RUNE_HIDE, RUNE_LEAVE, RUNE_SHOW, RUNE_TITLE, RUNE_TRACKER_LABEL, runeNextLine, runeStopCount } from "@/lib/tasks/rune-copy";
import { runeStops } from "@/lib/tasks/rune-stops";
import { ALL_ANSWERED, readyToFinish } from "@/lib/utils/deed-run-flow";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import { speak, stopSpeaking } from "@/lib/utils/speech";
import { Panel } from "./frame-hud";
import type { WalkOn } from "./use-walk";
import { WalkCard } from "./walk-card";
import "./rune-walk.css";

const oneLine = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ") || undefined;

export function RuneWalk({
  walk,
  profile,
  calm,
  numerals,
  hidden,
  casting,
  cardSlot,
  mended,
  onAt,
  onMended,
  onCastClose,
  onFinished,
  onLeave,
  sayRef,
}: {
  walk: WalkOn;
  profile: { readAloud: boolean };
  calm: boolean;
  numerals: boolean;
  /** Another panel is open over the world: the card is hidden, and keeps its place. */
  hidden: boolean;
  /** The frame's overlay is E at the stop on now: the stone is open. */
  casting: boolean;
  /** The column's walk slot the card is portalled into; none yet, no card. */
  cardSlot: HTMLElement | null;
  /** Object ids cast right on this walk (the frame's), each checked on the card. */
  mended: readonly string[];
  onAt: (index: number) => void;
  onMended: (objectId: string) => void;
  /** Close the stone (the frame's `closeOverlay`). */
  onCastClose: () => void;
  onFinished: (summary: RunSummary) => void;
  onLeave: () => void;
  /** Where the frame shows a line on the card while this is mounted. */
  sayRef: MutableRefObject<((line: string) => void) | null>;
}) {
  const { run, villager } = walk;
  // A wrong word is a soft low "hmm", a right one rises and resolves (`realm-sound.tsx`), as on the board.
  const { flow, busy, error, setError, guarded, choose, showMe, next } = useDeedFlow(run, (r) => realmCue(r.correct ? "deed-right" : "deed-wrong"));
  const stops = useMemo(() => runeStops(run), [run]);
  const total = run.questions.length;
  const ready = readyToFinish(flow, total);
  const isLast = flow.index >= total - 1;
  const task = run.questions[flow.index];
  const [folded, setFolded] = useState(false);
  // A line the frame said on the card ("First, …"), until the stop changes or the stone opens.
  const [said, setSaid] = useState<string | null>(null);
  // Whether the hero has cast (or asked to be shown) since this stone opened: a stone reopened on a
  // second chance has not, so its word is said before the second-chance line.
  const [castHere, setCastHere] = useState(false);
  const [seen, setSeen] = useState({ index: flow.index, casting });
  if (seen.index !== flow.index || seen.casting !== casting) {
    setSeen({ index: flow.index, casting });
    setSaid(null);
    if (casting && !seen.casting) setCastHere(false);
  }

  // The stop on now, reported up on mount and on every move (RI-a / S1).
  useEffect(() => {
    onAt(flow.index);
  }, [flow.index, onAt]);

  // A right cast mends its object where it stands, at once (R-I21); the record lands at the finish.
  const mendedNow = flow.phase === "resolved" && flow.result?.correct ? stops[flow.index]?.id : undefined;
  useEffect(() => {
    if (mendedNow) onMended(mendedNow);
  }, [mendedNow, onMended]);

  // The card's lines are spoken by the narration rule the stone follows (`autoSpeaks`, R-I18): always
  // for a dictation's hero (K–3), who needs to hear where to go, otherwise with read-aloud on.
  const speaksCard = task ? autoSpeaks(task, profile.readAloud, false) : profile.readAloud;
  // The frame's lines on the card ("First, …", "The rune holds here."), while mounted.
  useEffect(() => {
    const say = (line: string) => {
      setSaid(line);
      if (speaksCard) speak(line);
    };
    sayRef.current = say;
    return () => {
      if (sayRef.current === say) sayRef.current = null;
    };
  }, [sayRef, speaksCard]);

  // A resolved stop that is not the last moves on whenever the stone is closed, as Done does: closed
  // after the answer, or closed while the cast was out and the answer landed after (fix round 1). An
  // open second chance stays, and the last stop is never finished by itself (its Finish is on the card).
  // `next` moves only a resolved stop, so Done (which moved on already) finds nothing to do here.
  const moveOn = !casting && flow.phase === "resolved" && flow.index < total - 1;
  useEffect(() => {
    if (moveOn) next();
  }, [moveOn, next]);

  // The run finished once, then handed up; a refused finish is said, and Finish asks again
  // (`guarded`: one call at a time, so a second press sends nothing).
  const finish = () => guarded(async () => onFinished(await completeDeedRun(run.runId)));
  function advance() {
    if (isLast) return void finish();
    next();
    onCastClose();
  }

  // Speech (RI-a / S5): nothing until the stone opens; then the word, and after a cast its line.
  const line = flow.result && task ? attemptFeedback(flow.result, flow.ruledOut.length > 0, villager.name, task) : null;
  const speaks = casting && task ? autoSpeaks(task, profile.readAloud, false) : false;
  const prompt = task ? (task.readAloud ?? task.prompt) : undefined;
  const after = task ? attemptSpeech(task, flow, line?.text) : undefined;
  const words = !speaks || busy
    ? undefined
    : flow.phase === "asking"
      ? prompt
      : flow.phase === "second-chance"
        ? castHere ? after : oneLine(prompt, after)
        : after;
  useEffect(() => {
    if (!words) return;
    const token = speak(words);
    return () => stopSpeaking(token);
  }, [words]);

  // Done or Finish takes the focus once the stop is resolved, so Enter moves on.
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (casting && flow.phase === "resolved") goRef.current?.focus();
  }, [casting, flow.phase, flow.index]);

  const current = stops[flow.index];
  const count = runeStopCount(Math.min(flow.index + 1, total), total);
  const nextLine = current && !ready ? runeNextLine(current.label) : null;
  const cardLine = said ?? nextLine;
  // "Next: …" is said once the walk has moved on from where it began, with the stone closed; never at
  // the walk's start (RI-a / S5), and never over a line the frame just said.
  const [startedAt] = useState(flow.index);
  const nextWords = speaksCard && !casting && !said && flow.index !== startedAt ? (nextLine ?? undefined) : undefined;
  useEffect(() => {
    if (!nextWords) return;
    const token = speak(nextWords);
    return () => stopSpeaking(token);
  }, [nextWords]);
  const card = (
    <WalkCard
      label={RUNE_TRACKER_LABEL}
      icon="sparkles"
      className="rune-walk"
      head={
        <>
          <span className="r3-run-dots trail-walk-dots" role="img" aria-label={count}>
            {stops.map((s, i) => {
              const done = i < flow.index || (i === flow.index && flow.phase === "resolved");
              return <span key={s.id} className={`r3-run-dot${done ? " r3-run-dot--done" : i === flow.index ? " r3-run-dot--now" : ""}`} />;
            })}
          </span>
          {numerals && (
            <span className="trail-walk-count" aria-hidden="true">
              {count}
            </span>
          )}
        </>
      }
      folded={folded}
      onFold={() => setFolded((f) => !f)}
      hideLabel={RUNE_HIDE}
      showLabel={RUNE_SHOW}
      // A finish left open with the stone closed (Esc, or a walk picked back up with every word cast).
      foot={
        ready && !casting && !error && (
          <button type="button" className="r3-link-button" disabled={busy} onClick={() => void finish()}>
            {RUNE_FINISH}
          </button>
        )
      }
      leaveLabel={RUNE_LEAVE}
      onLeave={onLeave}
      // Not while the finish is out: the run is done on the server, and its result board must open.
      leaveDisabled={ready && busy}
      error={casting ? "" : error}
      retryLabel={ready ? RUNE_FINISH : undefined}
      onRetry={() => void finish()}
      retryDisabled={busy}
      hidden={hidden}
      calm={calm}
    >
      <ol className="rune-walk-stops">
        {stops.map((s, i) => {
          const done = mended.includes(s.id);
          return (
            <li key={s.id} className={`rune-walk-stop${done ? " rune-walk-stop--mended" : ""}${i === flow.index ? " rune-walk-stop--now" : ""}`}>
              {done && <GameIcon name="check" className="rune-walk-check" />}
              {s.label}
              {done && <span className="sr-only">, mended</span>}
            </li>
          );
        })}
      </ol>
      {cardLine && (
        <p className="trail-walk-text rune-walk-next" aria-live="polite">
          {cardLine}
        </p>
      )}
    </WalkCard>
  );

  return (
    <>
      {cardSlot && createPortal(card, cardSlot)}
      {casting && task && (
        <Panel title={RUNE_TITLE} label={RUNE_TITLE} wide className="r3-board--deed rune-walk-stone" icon={<GameIcon name="sparkles" className="r3-board-icon" />} onClose={onCastClose}>
          <div className="r3-run">
            <div className="r3-question">
              <p className="r3-question-text">{task.prompt}</p>
            </div>
            {error && (
              <p className="r3-board-error" role="alert">
                {error}{" "}
                <button type="button" className="r3-link-button" onClick={() => setError("")}>
                  Try again
                </button>
              </p>
            )}
            <TaskPresenter
              task={task}
              flow={flow}
              variant="board"
              numerals={numerals}
              calm={calm}
              readAloud={profile.readAloud}
              disabled={busy}
              onRespond={(encoded) => {
                setCastHere(true);
                void choose(encoded);
              }}
            />
            {/* A resolved stop with no result is a walk picked back up with every word cast: its finish step. */}
            {(line || flow.phase === "resolved") && (
              <div className={`r3-feedback${flow.result?.correct ? " r3-feedback--right" : ""}`}>
                <div>
                  {line?.heading && <p className="r3-feedback-heading">{line.heading}</p>}
                  <p className="r3-feedback-text" role="status">
                    {line ? line.text : ALL_ANSWERED}
                  </p>
                </div>
                {flow.phase === "second-chance" ? (
                  <button
                    type="button"
                    className="r3-link-button r3-show-me"
                    disabled={busy}
                    onClick={() => {
                      setCastHere(true);
                      void showMe();
                    }}
                  >
                    Show me
                  </button>
                ) : (
                  <button ref={goRef} type="button" className="r3-menu-item r3-menu-item--go" disabled={busy} onClick={advance}>
                    {isLast ? RUNE_FINISH : RUNE_DONE}
                  </button>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
