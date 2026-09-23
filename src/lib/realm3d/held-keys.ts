/**
 * WHICH MOVEMENT KEYS ARE PHYSICALLY DOWN — whoever is listening.
 *
 * The island and each room keep their own key state, and each drops key-DOWNS while it is not
 * the one playing (the island is paused indoors; a room does not exist yet on the island). So a
 * child who holds W through a doorway arrived on the other side standing still until the
 * browser's auto-repeat re-sent the key — about half a second, which reads as the game sticking.
 *
 * This is the one listener that hears every press and release regardless, so the side that
 * takes over can start from the truth: `seedMoves` sets the movement keys a child is holding.
 * It only ever turns a key ON; releases are each side's own (a key-up is always honoured).
 *
 * Reference counted: installed by whoever needs it, removed when the last of them goes.
 */

const held = new Set<string>();
let installs = 0;

const onDown = (e: KeyboardEvent) => {
  held.add(e.code);
};
const onUp = (e: KeyboardEvent) => {
  held.delete(e.code);
};
const onBlur = () => held.clear();

/** Start listening; returns the way to stop. Safe to call many times. */
export function holdKeys(): () => void {
  if (typeof window === "undefined") return () => {};
  if (installs++ === 0) {
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--installs === 0) {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
      held.clear();
    }
  };
}

export function isHeld(code: string): boolean {
  return held.has(code);
}

/** Turn on every movement key the child is holding right now. Never turns one off. */
export function seedMoves(k: { f: boolean; b: boolean; l: boolean; r: boolean }): void {
  if (held.has("KeyW") || held.has("ArrowUp")) k.f = true;
  if (held.has("KeyS") || held.has("ArrowDown")) k.b = true;
  if (held.has("KeyA") || held.has("ArrowLeft")) k.l = true;
  if (held.has("KeyD") || held.has("ArrowRight")) k.r = true;
}
