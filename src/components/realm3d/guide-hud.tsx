"use client";

/**
 * THE GAME TELLING A CHILD WHAT TO DO. Everything here answers "what do I do?" or celebrates
 * that they did it:
 *
 *   - the COACH, the tutorial's one line at a time, over the world, never pausing it;
 *   - the WELCOME, a child's first visit: what the Realm is for, how much to show, and the way
 *     into the tutorial (the flat Realm's first-visit help card and its depth setting, reconciled);
 *   - the CEREMONY, a crown waiting to be hailed;
 *   - the TOAST, the village answering a finished side quest;
 *   - the TIMER line, "your Math timer finished", with the way to it.
 *
 * Presentational, like `frame-hud.tsx`: every word comes from a pure rule (`tutorial.ts`,
 * `talk.ts`, `ceremony.ts`), and the state lives in `realm-game.tsx`.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { VillagerFigure } from "@/components/avatar";
import { GameIcon } from "@/components/game-icon";
import { useQuestTimer } from "@/hooks/use-quest-timer";
import { getAssignmentQuestInfo } from "@/lib/actions/quest-assignments";
import type { RealmDepth } from "@/lib/realm/depth";
import { ceremonyNotice } from "@/lib/realm/ceremony/ceremony";
import { VILLAGERS } from "@/lib/realm/villagers";
import type { DeedToast } from "@/lib/realm3d/talk";
import type { LessonCopy } from "@/lib/realm3d/tutorial";
import { crownById, CROWNS } from "@/lib/utils/crown-catalog";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { keepFocusInWorld, Panel, Progress } from "./frame-hud";

/* ------------------------------------------------------------------ the coach */

/**
 * One lesson, top and centre, where a child's eye goes first. It does not pause the world —
 * the lesson IS the world, so a child reads "Walk around" and walks. It never takes a click it
 * does not need: the board is `pointer-events: none` and only its two buttons take the pointer.
 *
 * `role="status"`, always mounted by the frame so a screen reader hears each new lesson arrive
 * (a live region announces changes, not its first contents — the flat tutorial's lesson).
 */
export function Coach({
  copy,
  keys,
  step,
  steps,
  done,
  onSkip,
  onSkipStep,
}: {
  copy: LessonCopy | null;
  keys: string[];
  step: number;
  steps: number;
  /** The last line, shown for a moment when the ladder finishes. */
  done: string | null;
  onSkip: () => void;
  /** Offered only after a long while on one lesson: never trapped. */
  onSkipStep: (() => void) | null;
}) {
  return (
    <div className="r3-coach-lane" role="status" aria-live="polite">
      {copy ? (
        <div className="r3-coach">
          <span className="r3-coach-step">
            Lesson {step} of {steps}
          </span>
          <div className="r3-coach-main">
            {keys.length > 0 && (
              // W, A, S and D drawn the way they sit under a child's fingers: W over the other three.
              <span className={`r3-coach-keys${keys.join("") === "WASD" ? " r3-coach-keys--wasd" : ""}`} aria-hidden="true">
                {keys.map((k) => (
                  <kbd key={k} className="r3-kbd r3-kbd--big">
                    {k}
                  </kbd>
                ))}
              </span>
            )}
            <span className="r3-coach-text">
              <span className="r3-coach-title">{copy.title}</span>
              <span className="r3-coach-how">{copy.how}</span>
            </span>
          </div>
          <span className="r3-coach-ways">
            {onSkipStep && (
              <button type="button" className="r3-coach-skip" onMouseDown={keepFocusInWorld} onClick={onSkipStep}>
                Skip this step
              </button>
            )}
            <button type="button" className="r3-coach-skip" aria-label="Skip the tutorial" onMouseDown={keepFocusInWorld} onClick={onSkip}>
              Skip tutorial
            </button>
          </span>
        </div>
      ) : done ? (
        <div className="r3-coach r3-coach--done">
          <GameIcon name="star" className="r3-coach-star" />
          <span className="r3-coach-title">{done}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ the welcome */

const DEPTH_CHOICE: Record<RealmDepth, string> = {
  simple: "Fewer numbers, one thing at a time.",
  full: "Every number, and more to do at once.",
};

/**
 * A child's first visit. The flat Realm opened on a list of controls; this opens on what the
 * game is FOR — your village, the people in it, and the one thing to do — and then offers to
 * show them how, by doing. The depth choice rides here too, because this is the one moment a
 * child is asked anything, and "Keep it simple / Show me everything" is a question for the start.
 */
export function WelcomeCard({
  heroName,
  waiting,
  total,
  depth,
  onDepth,
  depthError,
  tutorialDone,
  onStart,
  onKnow,
}: {
  heroName: string;
  /** Who the objective card names, or null. */
  waiting: string | null;
  total: number;
  depth: RealmDepth;
  onDepth: ((d: RealmDepth) => void) | null;
  depthError: string;
  tutorialDone: boolean;
  onStart: () => void;
  onKnow: () => void;
}) {
  return (
    <Panel title={`Welcome, ${heroName}!`} label="Welcome to your Realm" wide className="r3-board--welcome" icon={<GameIcon name="castle" className="r3-board-icon" />} onClose={onStart}>
      <div className="r3-welcome-folk" aria-hidden="true">
        {VILLAGERS.slice(0, 5).map((v) => (
          <span key={v.id} className="r3-welcome-face">
            <VillagerFigure villager={v} size="lg" className="r3-talk-figure" />
          </span>
        ))}
      </div>
      <p className="r3-board-line">
        This is <b>your village</b>. {total > 0 ? `${total} buildings are waiting to be built, and the villagers need your help.` : "The villagers need your help."}
      </p>
      <p className="r3-board-line">
        Talk to them and do their {SIDE_QUESTS_LOWER}. Every {SIDE_QUESTS_LOWER.replace(/s$/, "")} you finish builds their building a little more.
      </p>
      {waiting && (
        <p className="r3-welcome-first">
          <span className="r3-welcome-bang">!</span>
          <span>
            {waiting} is waiting for you. Follow the gold <b>!</b>
          </span>
        </p>
      )}
      {onDepth && (
        <div className="r3-setting r3-welcome-depth">
          <span className="r3-setting-name">How much to show</span>
          <span className="r3-toggle" role="group" aria-label="How much to show">
            <button type="button" aria-pressed={depth === "simple"} onClick={() => onDepth("simple")}>
              Keep it simple
            </button>
            <button type="button" aria-pressed={depth === "full"} onClick={() => onDepth("full")}>
              Show me everything
            </button>
          </span>
          <span className="r3-setting-hint">{DEPTH_CHOICE[depth]}</span>
          {depthError && <span className="r3-setting-error">{depthError}</span>}
        </div>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item r3-menu-item--go" onClick={onStart}>
          <GameIcon name="journey" className="r3-menu-icon" /> {tutorialDone ? "Let's go!" : "Show me how to play"}
        </button>
        {!tutorialDone && (
          <button type="button" className="r3-menu-item" onClick={onKnow}>
            I know how to play
          </button>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ the ceremony */

export type CeremonyInfo = { seasonId: string; crownId: string; ordinal: number; seasonLabel: string };

/**
 * A crown waiting for its ceremony. The flat Realm walked everyone to the castle; the 3D world
 * has no choreography yet, so the ceremony is held here, in the frame, with the flat Realm's own
 * words (`ceremonyNotice`): the people of the Realm gather, the crown comes down, the child is
 * hailed. Finishing it — or skipping it, as the flat Realm's Skip also did — records it with
 * `markCeremonySeen`, so the Crown card's "See the ceremony" link finally lands somewhere that
 * ends the wait. A failed write says so and offers the write again; play resumes either way,
 * and the next visit offers the ceremony again.
 */
export function CeremonyCard({
  info,
  heroName,
  calm,
  saving,
  error,
  onHail,
}: {
  info: CeremonyInfo;
  heroName: string;
  calm: boolean;
  saving: boolean;
  error: string;
  onHail: () => void;
}) {
  const crown = crownById(info.crownId);
  const label = crown?.label ?? "Crown";
  const color = crown?.color ?? CROWNS[0].color;
  const [hailed, setHailed] = useState(calm);
  useEffect(() => {
    if (calm) return;
    const id = window.setTimeout(() => setHailed(true), 1600);
    return () => window.clearTimeout(id);
  }, [calm]);
  return (
    <Panel title={`Season ${info.ordinal} complete`} label="The crown ceremony" wide className={`r3-board--ceremony${calm ? " r3-board--calm" : ""}`} icon={<GameIcon name="crown" className="r3-board-icon" />} onClose={onHail}>
      <p className="r3-board-sub">{info.seasonLabel}</p>
      <div className="r3-ceremony-stage" aria-hidden="true">
        <span className="r3-ceremony-crown" style={{ ["--r3-ink" as string]: color }}>
          <GameIcon name={crown?.icon ?? "crown"} className="r3-ceremony-crown-icon" />
        </span>
        <div className="r3-ceremony-folk">
          {VILLAGERS.map((v) => (
            <span key={v.id} className="r3-welcome-face">
              <VillagerFigure villager={v} size="lg" className="r3-talk-figure" />
            </span>
          ))}
        </div>
      </div>
      <p className="r3-board-line r3-ceremony-line">{ceremonyNotice("gather", heroName, label)}</p>
      <p className={`r3-ceremony-hail${hailed ? " r3-ceremony-hail--on" : ""}`}>{ceremonyNotice("hail", heroName, label)}</p>
      {error && (
        <p className="r3-board-error" role="alert">
          {error}
        </p>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item r3-menu-item--go" disabled={saving} onClick={onHail}>
          <GameIcon name="crown" className="r3-menu-icon" /> {error ? "Try again" : "Wear it proudly"}
        </button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ the toast */

/** The village's answer to a finished side quest, over the world as the panel closes. */
export function DeedToastBanner({ toast, numerals }: { toast: DeedToast | null; numerals: boolean }) {
  if (!toast) return null;
  return (
    <div className={`r3-toast${toast.rose ? " r3-toast--rose" : ""}`} role="status">
      <GameIcon name={toast.rose ? "castle" : "house"} className="r3-toast-icon" />
      <span className="r3-toast-text">
        <span className="r3-toast-title">{toast.title}</span>
        <span className="r3-toast-line">{toast.line}</span>
        <Progress done={toast.done} total={toast.total} numerals={numerals} text={`${toast.done} of ${toast.total}`} label={`${toast.done} of ${toast.total} ${SIDE_QUESTS_LOWER} done.`} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ the quest timer */

/**
 * "Your Math timer finished." The flat Realm's line, with its way to the quest. A chore timer
 * that ran out is the one thing from outside the game a child must hear about inside it; the
 * button leaves the Realm the ordinary way, so the part-minute is charged on the way out.
 */
export function TimerFinished({ hidden }: { hidden: boolean }) {
  const { stoppedResult, clearStoppedResult } = useQuestTimer();
  const [subject, setSubject] = useState<{ assignmentId: string; subject: string } | null>(null);
  useEffect(() => {
    if (!stoppedResult) return;
    let cancelled = false;
    getAssignmentQuestInfo(stoppedResult.assignmentId)
      .then((info) => {
        if (!cancelled && info) setSubject({ assignmentId: stoppedResult.assignmentId, subject: info.subjectName });
      })
      .catch(() => {
        // The quest behind the timer can be gone by now; there is nothing to say about it.
        if (!cancelled) clearStoppedResult();
      });
    return () => {
      cancelled = true;
    };
  }, [stoppedResult, clearStoppedResult]);
  if (hidden || !stoppedResult || subject?.assignmentId !== stoppedResult.assignmentId) return null;
  return (
    <p className="r3-trouble r3-plank r3-timer-done" role="alert">
      <GameIcon name="timer" className="r3-chip-icon" /> Your {subject.subject} timer finished.{" "}
      {/* A link, so leaving is the ordinary way out and the unmount charges the part-minute. */}
      <Link href="/quests" className="r3-link-button" onClick={clearStoppedResult}>
        Go to it
      </Link>
    </p>
  );
}
