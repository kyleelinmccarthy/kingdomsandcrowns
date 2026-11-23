/**
 * ONE KEYBOARD LISTENER FOR THE WHOLE REALM. The router turns a key code into a named action
 * through the keymap and hands it to whoever subscribed to that action, with the guards every
 * scene used to repeat in one place: a key with Ctrl, Alt or Meta is the browser's, a key typed
 * into a field is the field's, and a key pressed inside a dialog belongs to the dialog unless the
 * subscriber asked for `always`.
 *
 * A subscriber names a scope, which says when it wants to hear a key go down: `island` (out in the
 * world), `room` (inside a building), `play` (either, any time nothing covers the game) or
 * `always` (even with a menu open). A key UP is different: it is always delivered, so a walk key
 * let go behind an open menu never leaves the player walking.
 *
 * What is held is tracked per physical key on every keydown and keyup, whatever the guards say,
 * because it is the truth about the keyboard; `held(action)` reads it through the current keymap.
 * The one exception is a key pressed with Meta (Cmd): macOS sends no key up for Cmd+A, so a code
 * recorded then would stay "held" for good and `seedMoves` would strafe the hero at the next door.
 * An action with two keys down is let go only when the last of them comes up, so letting go of W
 * while ↑ is still held keeps walking. Rebinding while a key is down releases the action that
 * lost it, and losing the window's focus releases everything.
 *
 * A bound key's UP is prevented too, while playing: some browsers press a focused button on
 * Space's key up, so a child who clicked Pause and then jumped would pause again.
 *
 * No DOM beyond the window-like target it is given, and no three: tests drive it with a fake.
 */
import { actionIndex, ACTIONS, WALK_ACTIONS, type ActionId, type Keymap } from "./keymap";
import { typingInto } from "./typing";

export type Scope = "island" | "room" | "play" | "always";
export type ActionEvent = { action: ActionId; down: boolean; repeat: boolean };

export type RouterTarget = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(type: string, fn: (e: any) => void, capture?: boolean): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener(type: string, fn: (e: any) => void, capture?: boolean): void;
};

export type InputRouter = {
  readonly keymap: Keymap;
  on(actions: ActionId | readonly ActionId[], fn: (e: ActionEvent) => void, scope: Scope): () => void;
  setKeymap(k: Keymap): void;
  onKeymap(fn: (k: Keymap) => void): () => void;
  setState(s: { overlay: boolean; inside: boolean }): void;
  held(action: ActionId): boolean;
  /** While true (a rebind is listening), no key reaches a subscriber and none is prevented. */
  suspend(on: boolean): void;
  dispose(): void;
};

type Sub = { fn: (e: ActionEvent) => void; scope: Scope };

/** A key press that is not the game's: typed into a field, or (outside `always`) pressed inside a dialog. */
export function blockedTarget(t: EventTarget | null, scope: Scope): boolean {
  if (typingInto(t)) return true;
  if (scope === "always") return false;
  return typeof Element !== "undefined" && t instanceof Element && t.closest("[role='dialog']") !== null;
}

function hears(scope: Scope, s: { overlay: boolean; inside: boolean }): boolean {
  if (scope === "always") return true;
  if (s.overlay) return false;
  if (scope === "island") return !s.inside;
  if (scope === "room") return s.inside;
  return true;
}

export function createInputRouter(
  target: RouterTarget,
  keymap: Keymap,
  blocked: (t: EventTarget | null, scope: Scope) => boolean = blockedTarget,
): InputRouter {
  let current = keymap;
  let state = { overlay: false, inside: false };
  let suspended = false;
  const subs = new Map<ActionId, Set<Sub>>();
  const keymapListeners = new Set<(k: Keymap) => void>();
  /** The physical keys down right now, whatever the guards made of them. */
  const heldCodes = new Set<string>();

  const heldIn = (k: Keymap, action: ActionId): boolean => k[action].some((code) => heldCodes.has(code));

  const heldActions = (k: Keymap): ActionId[] => ACTIONS.map((a) => a.id).filter((id) => heldIn(k, id));

  const release = (action: ActionId) => {
    for (const sub of [...(subs.get(action) ?? [])]) sub.fn({ action, down: false, repeat: false });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Cmd+key: no key up will come on macOS, so it is never recorded as held.
    if (!e.metaKey) heldCodes.add(e.code);
    if (suspended) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const action = actionIndex(current).get(e.code);
    if (!action) return;
    const def = ACTIONS.find((a) => a.id === action);
    if (e.repeat && !def?.hold) {
      // The page still must not scroll on a held Space; only the subscribers skip it.
      if (!state.overlay && !blocked(e.target, "play")) e.preventDefault();
      return;
    }
    let delivered = false;
    for (const sub of [...(subs.get(action) ?? [])]) {
      if (!hears(sub.scope, state) || blocked(e.target, sub.scope)) continue;
      delivered = true;
      sub.fn({ action, down: true, repeat: e.repeat });
    }
    if (delivered && !state.overlay) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    heldCodes.delete(e.code);
    if (suspended) return;
    const action = actionIndex(current).get(e.code);
    if (!action) return;
    // The same rule as a key down: only a bound key, only while playing, never a field's.
    if (!state.overlay && !blocked(e.target, "play")) e.preventDefault();
    // Its other key still down: the action is still held, so nothing is let go yet.
    if (heldIn(current, action)) return;
    release(action);
  };

  const onBlur = () => {
    const was = heldActions(current);
    heldCodes.clear();
    for (const action of was) release(action);
  };

  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("keyup", onKeyUp, true);
  target.addEventListener("blur", onBlur);

  return {
    get keymap() {
      return current;
    },
    on(actions, fn, scope) {
      const sub: Sub = { fn, scope };
      const ids = typeof actions === "string" ? [actions] : actions;
      for (const id of ids) {
        if (!subs.has(id)) subs.set(id, new Set());
        subs.get(id)!.add(sub);
      }
      return () => {
        for (const id of ids) subs.get(id)?.delete(sub);
      };
    },
    setKeymap(next) {
      const before = current;
      const index = actionIndex(next);
      const wasHeld = heldActions(before);
      // A key whose meaning changed while down is no longer anyone's hold: let go of it, so the
      // action that gained it does not start walking without a press.
      const oldIndex = actionIndex(before);
      for (const code of [...heldCodes]) if (oldIndex.get(code) !== index.get(code)) heldCodes.delete(code);
      current = next;
      for (const action of wasHeld) if (!heldIn(next, action)) release(action);
      for (const fn of [...keymapListeners]) fn(next);
    },
    onKeymap(fn) {
      keymapListeners.add(fn);
      return () => {
        keymapListeners.delete(fn);
      };
    },
    setState(s) {
      state = { overlay: s.overlay, inside: s.inside };
    },
    held(action) {
      return heldIn(current, action);
    },
    suspend(on) {
      if (on && !suspended) {
        // A key still down when a rebind starts listening must not leave a walk running.
        for (const action of heldActions(current)) release(action);
      }
      suspended = on;
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown, true);
      target.removeEventListener("keyup", onKeyUp, true);
      target.removeEventListener("blur", onBlur);
      subs.clear();
      keymapListeners.clear();
      heldCodes.clear();
    },
  };
}

/** Turn on the walk directions whose keys are already down, for a scene that starts mid-press. Never turns one off. */
export function seedMoves(r: InputRouter, k: { f: boolean; b: boolean; l: boolean; r: boolean }): void {
  const [f, b, l, rt] = WALK_ACTIONS;
  if (r.held(f)) k.f = true;
  if (r.held(b)) k.b = true;
  if (r.held(l)) k.l = true;
  if (r.held(rt)) k.r = true;
}
