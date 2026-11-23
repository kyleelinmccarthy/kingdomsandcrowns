"use client";

/**
 * THE CONTROLS PANEL'S KEYS, rebindable. Every keyboard row's keys are chips a child can press to
 * change: click one, press the new key, and it is theirs at once (`onChange`; the frame applies it
 * to the router and saves it). A key another action had is swapped (`bind`), and the line under
 * the list says what moved. A key the game can't give out (Esc, Tab, Ctrl...) is refused there,
 * and the chip keeps listening.
 *
 * While a chip listens, the router is set aside (`suspend`), and the list catches the next key on
 * the window in the capture phase and stops it there, so the key is not also a jump, a cast or
 * the frame's Esc. Esc only stops the listening; the panel stays open. Tab is let through, so
 * focus moves as usual, and stops the listening too. However listening ends (a key, Esc, Tab,
 * the panel closing), the router is handed back.
 *
 * Rows with no `actions` (the mouse), and Esc on the pause row, stay plain keycaps: they are not
 * in the keymap. With nowhere to save (`editable` false) every row is plain, as before.
 */

import { useEffect, useRef, useState } from "react";
import type { ControlRow } from "@/lib/realm3d/frame";
import { ACTIONS, bind, defaultKeymap, isBindable, keyLabel, MAX_KEYS, type ActionId, type Keymap } from "@/lib/realm3d/keymap";
import { useOptionalRealmInput } from "./realm-input";

/** Said when a save fails: the keys still work, for this visit. */
export const KEYS_UNSAVED = "Your keys work for now, but weren't saved.";
export const KEY_REFUSED = "That key can't be used. Try another.";
const LISTENING_CHIP = "Press a key…";

const labelOf = (action: ActionId): string => ACTIONS.find((a) => a.id === action)?.label ?? action;

type Slot = 0 | 1;
type Listening = { action: ActionId; slot: Slot };

/**
 * What the line says once a key is placed: who it moved from, and what they have now. Taken onto
 * an empty slot ("+"), nothing goes back: the other action keeps its second key if it had one
 * (`next`, the keymap after the bind), or is left with none.
 */
function placedLine(action: ActionId, code: string, displaced: ActionId | null, replaced: string | undefined, next: Keymap): string {
  const label = labelOf(action);
  if (!displaced) return `${label} is now ${keyLabel(code)}.`;
  const other = labelOf(displaced);
  if (replaced !== undefined) return `${keyLabel(code)} was ${other}. ${other} is now ${keyLabel(replaced)}.`;
  const left = next[displaced];
  return left.length === 0 ? `${keyLabel(code)} was ${other}. ${other} has no key now.` : `${keyLabel(code)} was ${other}. ${other} still has ${keyLabel(left[0])}.`;
}

function KeyChips({
  action,
  keymap,
  listening,
  onListen,
}: {
  action: ActionId;
  keymap: Keymap;
  listening: Listening | null;
  onListen: (l: Listening | null) => void;
}) {
  const keys = keymap[action];
  const label = labelOf(action);
  const isListening = (slot: Slot) => listening?.action === action && listening.slot === slot;
  const chip = (slot: Slot, text: string, aria: string, empty: boolean) => (
    <button
      key={`${action}-${slot}`}
      type="button"
      className={`r3-kbd r3-kbd--edit${empty ? " r3-kbd--empty" : ""}${isListening(slot) ? " r3-kbd--listening" : ""}`}
      aria-label={isListening(slot) ? `${label}: ${LISTENING_CHIP}` : aria}
      onClick={() => onListen(isListening(slot) ? null : { action, slot })}
      onBlur={() => isListening(slot) && onListen(null)}
    >
      {isListening(slot) ? LISTENING_CHIP : text}
    </button>
  );
  const chips = keys.slice(0, MAX_KEYS).map((code, i) => chip(i as Slot, keyLabel(code), `${label}: ${keyLabel(code)}. Press to change.`, false));
  if (keys.length < MAX_KEYS) {
    const slot = keys.length as Slot;
    chips.push(chip(slot, "+", slot === 0 ? `${label}: no key yet. Press to choose one.` : `${label}: add another key.`, true));
  }
  return <>{chips}</>;
}

export function KeybindList({
  rows,
  keymap,
  onChange,
  editable,
  note = null,
}: {
  rows: ControlRow[];
  keymap: Keymap;
  onChange: (k: Keymap) => void;
  editable: boolean;
  /** A line from the frame, said with the list's own: a save that failed (`KEYS_UNSAVED`). */
  note?: string | null;
}) {
  const router = useOptionalRealmInput();
  const [listening, setListening] = useState<Listening | null>(null);
  const [line, setLine] = useState("");
  // Read by the key handler when the key arrives, not when listening began.
  const latest = useRef({ keymap, onChange });
  useEffect(() => {
    latest.current = { keymap, onChange };
  });

  const listen = (l: Listening | null) => {
    setListening(l);
    setLine(l ? `Press a key for ${labelOf(l.action)}. Esc to cancel.` : "");
  };

  useEffect(() => {
    if (!listening) return;
    router?.suspend(true);
    const onKey = (e: KeyboardEvent) => {
      // Tab is never caught: focus moves on as usual, and listening stops.
      if (e.code === "Tab" || e.key === "Tab") {
        setListening(null);
        setLine("");
        return;
      }
      // The key is the list's: not a jump, not a click on the focused chip, not the frame's Esc.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === "Escape" || e.key === "Escape") {
        setListening(null);
        setLine("");
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || !isBindable(e.code)) {
        setLine(KEY_REFUSED);
        return;
      }
      const { keymap: k, onChange: change } = latest.current;
      const r = bind(k, listening.action, listening.slot, e.code);
      if (!r.ok) {
        setLine(KEY_REFUSED);
        return;
      }
      const own = k[listening.action];
      const replaced = own[Math.min(listening.slot, own.length)];
      setListening(null);
      setLine(placedLine(listening.action, e.code, r.displaced, replaced, r.keymap));
      if (r.keymap !== k) change(r.keymap);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      router?.suspend(false);
    };
  }, [listening, router]);

  const said = [line, note].filter(Boolean).join(" ");

  return (
    <>
      <ul className="r3-controls">
        {rows.map((row) => {
          const actions = editable ? (row.actions ?? []) : [];
          if (actions.length === 0) {
            return (
              <li key={row.what} className="r3-control">
                <span className="r3-control-keys">
                  {row.keys.map((k, i) => (
                    <kbd key={i} className="r3-kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="r3-control-what">{row.what}</span>
              </li>
            );
          }
          if (actions.length === 1) {
            // Esc stays beside Pause's own keys, as a keycap: it is the frame's, never the keymap's.
            const fixed = row.keys.filter((k) => k === "Esc");
            return (
              <li key={row.what} className="r3-control">
                <span className="r3-control-keys">
                  <KeyChips action={actions[0]} keymap={keymap} listening={listening} onListen={listen} />
                  {fixed.map((k) => (
                    <kbd key={k} className="r3-kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="r3-control-what">{row.what}</span>
              </li>
            );
          }
          // Walking and casting open out, one line per action, so each key can be changed on its own.
          return (
            <li key={row.what} className="r3-control r3-control--group">
              <span className="r3-control-what">{row.what}</span>
              <ul className="r3-control-subs">
                {actions.map((action) => (
                  <li key={action} className="r3-control r3-control--sub">
                    <span className="r3-control-keys">
                      <KeyChips action={action} keymap={keymap} listening={listening} onListen={listen} />
                    </span>
                    <span className="r3-control-what">{labelOf(action)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {editable && (
        <div className="r3-keys-foot">
          <p className="r3-keys-line" aria-live="polite">
            {said}
          </p>
          <button
            type="button"
            className="r3-menu-item r3-keys-reset"
            onClick={() => {
              setListening(null);
              setLine("Every key is back where it started.");
              onChange(defaultKeymap());
            }}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </>
  );
}
