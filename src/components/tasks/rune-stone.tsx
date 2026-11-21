"use client";

/**
 * THE RUNE STONE (slice 6, R-I12): build a word from tiles, then cast it. Shown on the Side Quests
 * page beside the object's picture (the picture run), on a villager's board that is not walked, and
 * at each stop of the Realm's rune walk.
 *
 * - Tap a tile to place it at the end of the word; tap a placed tile to take that one back;
 *   Backspace takes back the last; Clear takes back all. Nothing is dragged (R-C2).
 * - Cast sends the tiles placed, in order (`TASK_CODECS.rune`). It waits for a tile, for the player
 *   (`disabled`, the flow's busy), and refuses a word already ruled out, compared by its spelling,
 *   never its tiles, so two `e` tiles never make one word castable twice (RI-a / N2).
 * - The one read-aloud control on a rune task (RI-a / S4): "Hear the word" for a dictation, "Hear
 *   the meaning" for a meaning. Without speech a dictation prints its word under the picture, so it
 *   stays answerable (RI-a / S6); with speech it is never printed. The stone says nothing by itself:
 *   its host decides when a task is spoken (`autoSpeaks`, R-I18).
 *
 * The leak rule (R-I17): nothing here shows how many tiles the word takes, which tiles are decoys,
 * or the effect as text (RI-d, the picture shows it). The built row grows as tiles are placed and
 * is a polite live region, so a screen reader hears each one (RI-a / N18). A resolved miss fills
 * the row with the word's tiles (`reveal`); a right cast mends the picture.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GameIcon } from "@/components/game-icon";
import { runeObjectById } from "@/lib/realm/rune-objects";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import {
  RUNE_CAST, RUNE_CLEAR, RUNE_EMPTY_ROW, RUNE_HEAR, RUNE_HEAR_MEANING, RUNE_HELP, RUNE_NO_SOUND_LEAD, RUNE_ROW_LABEL, RUNE_SAME_WORD, RUNE_STONE_LABEL, RUNE_TRAY_LABEL, runeTakeBack,
} from "@/lib/tasks/rune-copy";
import { spelled } from "@/lib/tasks/rune-tiles";
import type { ClientTask } from "@/lib/tasks/types";
import type { FlowState } from "@/lib/utils/deed-run-flow";
import { canSpeak, speak } from "@/lib/utils/speech";
import { RunePicture } from "./rune-picture";
import "./rune.css";

type RuneClient = Extract<ClientTask, { kind: "rune" }>;

/** The stone's own keys: they place, cast and take back, and never reach the Realm. Esc bubbles. */
const STONE_KEYS = /^(?:Enter| |Spacebar|Backspace)$/;

/** An encoded cast as tile indices, when it decodes and every index is on this tray; else null. */
function picksOf(encoded: string | null | undefined, tiles: readonly string[]): number[] | null {
  if (!encoded) return null;
  const picks = TASK_CODECS.rune.decode(encoded);
  return picks && picks.every((i) => i < tiles.length) ? picks : null;
}

export function RuneStone({ task, flow, variant, disabled, calm, say = speak, onRespond }: {
  task: RuneClient;
  flow: FlowState;
  variant: "board" | "page";
  disabled: boolean;
  calm: boolean;
  /** The host's speech, so closing the host stops "Hear the word" (`PresenterProps.say`). */
  say?: (text: string) => void;
  onRespond(encoded: string): void;
}) {
  const { effect, object, tiles, listen } = task.view;
  const [picks, setPicks] = useState<number[]>([]);
  const trayRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const castRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  // A tile taken back, and Cast once the last tile is placed, are enabled (or not) only on the next
  // render; the focus moves then: to the tile, or to Cast, or to Clear while Cast stays shut (a word
  // already ruled out), never to a disabled button.
  const focusAfter = useRef<number | "cast" | null>(null);
  useEffect(() => {
    const at = focusAfter.current;
    if (at === null) return;
    focusAfter.current = null;
    if (at !== "cast") return trayRefs.current[at]?.focus();
    if (castRef.current && !castRef.current.disabled) castRef.current.focus();
    else clearRef.current?.focus();
  });

  const resolved = flow.phase === "resolved";
  const right = resolved && flow.result?.correct === true;
  const locked = resolved || disabled;
  // Once resolved the row is the server's: a miss shows the word's tiles, else the cast as stored.
  const revealed = resolved && !right ? picksOf(flow.result?.reveal, tiles) : null;
  const shown = resolved ? (revealed ?? picksOf(flow.picked, tiles) ?? picks) : picks;
  const word = spelled(tiles, picks);
  const sameWord = picks.length > 0 && flow.ruledOut.some((r) => {
    const tried = picksOf(r, tiles);
    return tried !== null && spelled(tiles, tried) === word;
  });
  const canCast = picks.length > 0 && !locked && !sameWord;
  const speakable = canSpeak();
  // A mended object reads by its own name ("the wagon"), as it does in the Realm (RI-a / N8).
  const label = object ? (right ? (runeObjectById(object.id)?.fixedLabel ?? object.label) : object.label) : null;

  // The first tile takes the focus as the word is asked, as a choice's first answer does.
  useEffect(() => {
    if (flow.phase !== "resolved") trayRefs.current.find((b) => b && !b.disabled)?.focus();
  }, [flow.phase]);

  /** The tray tile at or after `from` (wrapping) that can still be placed, or Cast when none can. */
  function focusFrom(from: number, taken: readonly number[]) {
    for (let k = 0; k < tiles.length; k++) {
      const i = (from + k) % tiles.length;
      if (!taken.includes(i)) return trayRefs.current[i]?.focus();
    }
    focusAfter.current = "cast";
  }

  function place(i: number) {
    if (locked || picks.includes(i)) return;
    const next = [...picks, i];
    setPicks(next);
    // The tile just placed is disabled in the tray: the focus moves on so the keyboard keeps its place.
    focusFrom(i + 1, next);
  }

  function takeBack(at: number) {
    if (locked || at < 0 || at >= picks.length) return;
    focusAfter.current = picks[at];
    setPicks(picks.filter((_, j) => j !== at));
  }

  function clear() {
    if (locked) return;
    focusAfter.current = 0;
    setPicks([]);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!STONE_KEYS.test(e.key)) return;
    e.stopPropagation();
    if (e.key === "Backspace") {
      e.preventDefault();
      takeBack(picks.length - 1);
    }
  }

  return (
    <section role="group" aria-label={RUNE_STONE_LABEL} className={`rune rune--${variant}${calm ? "" : " rune--move"}`} onKeyDown={onKeyDown}>
      <div className="rune-scene">
        <RunePicture effect={effect} fixed={right} />
        {label && <p className="rune-object">{label}</p>}
        {listen && !speakable && task.readAloud && (
          <p className="rune-unheard">
            {RUNE_NO_SOUND_LEAD} <strong>{task.readAloud}</strong>
          </p>
        )}
      </div>

      <div className={`rune-row${right ? " rune-row--right" : revealed ? " rune-row--answer" : ""}`} aria-live="polite">
        {shown.length === 0 ? (
          <p className="rune-empty">{RUNE_EMPTY_ROW}</p>
        ) : (
          <ol className="rune-word" aria-label={RUNE_ROW_LABEL}>
            {shown.map((i, at) => (
              <li key={`${at}:${i}`}>
                {resolved ? (
                  <span className="rune-tile rune-tile--set">{tiles[i]}</span>
                ) : (
                  <button type="button" className="rune-tile rune-tile--set" aria-label={runeTakeBack(tiles[i])} disabled={disabled} onClick={() => takeBack(at)}>
                    {tiles[i]}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rune-tray" role="group" aria-label={RUNE_TRAY_LABEL}>
        {tiles.map((t, i) => {
          const isPlaced = shown.includes(i);
          return (
            <button
              key={i}
              ref={(b) => {
                trayRefs.current[i] = b;
              }}
              type="button"
              className="rune-tile"
              aria-pressed={isPlaced}
              disabled={locked || isPlaced}
              onClick={() => place(i)}
            >
              {t}
            </button>
          );
        })}
      </div>

      {!resolved && <p className="rune-help">{RUNE_HELP}</p>}
      {sameWord && !resolved && (
        <p className="rune-same" role="status">
          {RUNE_SAME_WORD}
        </p>
      )}

      <div className="rune-acts">
        {speakable && (
          <button type="button" className="rune-act rune-act--hear" onClick={() => say(task.readAloud ?? task.prompt)}>
            <GameIcon name="bell" className="rune-act-icon" /> {listen ? RUNE_HEAR : RUNE_HEAR_MEANING}
          </button>
        )}
        {!resolved && (
          <>
            <button ref={clearRef} type="button" className="rune-act" disabled={locked || picks.length === 0} onClick={clear}>
              {RUNE_CLEAR}
            </button>
            <button ref={castRef} type="button" className="rune-act rune-act--cast" disabled={!canCast} onClick={() => canCast && onRespond(TASK_CODECS.rune.encode(picks))}>
              <GameIcon name="sparkles" className="rune-act-icon" /> {RUNE_CAST}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
